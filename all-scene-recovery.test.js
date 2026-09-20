const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { harness, root } = require('./test-support/voice-harness.cjs');

// Run the production turn controller; mock only UI, transport and the next
// scene scheduler so an upstream provider cannot hide an occupied floor.
const cases = [
  { label: 'breakfast cup', scene: 'kitchen', taskId: 'breakfast-cup',
    prompt: 'Can I have the cup, please?', answer: 'Here you are.', choice: 'place' },
  { label: 'airport bag', scene: 'airport', taskId: 'bag',
    prompt: 'Is this your bag?', answer: 'Yes, it is mine.' },
  { label: 'office greeting', scene: 'office', taskId: 'office-greeting',
    prompt: "Hi, I'm Maya. Nice to meet you.", answer: 'Nice to meet you too.' },
];

function recoveryHarness(sample) {
  const goal = {};
  const evidence = [];
  const h = harness({
    currentGoalRecord: () => goal,
    isBreakfastScene: () => sample.taskId.startsWith('breakfast-'),
    LumaExperience: {
      noteAnswer: (...args) => evidence.push(args), checkpoint() {},
      noteCharacterLine() {}, closeHelp() {}, noteHelp() {},
    },
    speak(text) { h.c.addDialogueMessage('luma', text); h.effects.push({ type: 'spoken', text }); return Promise.resolve(true); },
    scheduleTaskAdvance(index) { h.effects.push({ type: 'advance', index }); },
    scheduleReview() { h.effects.push({ type: 'review' }); },
    saveLearningSession() {},
    fetch: async () => ({ ok: true, json: async () => ({ meaning_valid: false }) }),
  });
  Object.assign(h.task, { id: sample.taskId, prompt: sample.prompt,
    question: sample.prompt, requiresAction: false, requiresSpeech: true });
  h.c.currentSceneConfig = () => ({ tasks: [h.task, { id: 'next-scene-step' }] });
  Object.assign(h.s, { selectedScene: sample.scene, taskIndex: 0,
    activeQuestion: sample.prompt, currentSpeech: sample.prompt,
    breakfast: { drink: 'milk', cupPlaced: false, amount: null }, duplexReady: true });
  h.c.apple = h.c.document.querySelector('apple');
  h.c.toast = h.c.document.querySelector('toast');
  h.load('taskRequirementsMet', 'safeCharacterReply', 'completeMultimodalTask',
    'fallbackMeaningFeedback', 'applyDynamicFeedback', 'requestLanguageFeedback',
    'finishDuplexTurnWhenAudioEnds', 'finishDuplexAudioOutput');
  const breakfastUi = fs.readFileSync(path.join(root, 'breakfast-ui.js'), 'utf8');
  const commit = breakfastUi.match(/^function commitBreakfastChoice\([^]*?^\}/m);
  assert.ok(commit, 'test must execute the production breakfast commit');
  vm.runInContext(commit[0], h.c);
  return { ...h, goal, evidence };
}

function addFinalAnswer(h, text) {
  const message = { id: 1, speaker: 'user', text, revision: 1, final: true,
    taskId: h.task.id, status: '' };
  h.s.dialogueHistory = [message];
  h.s.messageSerial = 1;
  return { message, context: { ...h.c.captureUserTurnContext(), messageId: 1,
    revision: 1, answer: text, final: true, source: 'voice' } };
}

function startRunawayResponse(h) {
  h.c.beginExpectedResponse('user');
  h.s.expectedResponse.responseId = 'runaway-provider';
  Object.assign(h.s, { awaitingModelReply: true, duplexSpeaking: true,
    duplexAcceptAudio: true, duplexSubtitleReady: false });
  h.c.armCharacterTurnWatchdog();
}

function assertUsableFloor(h) {
  assert.equal(h.c.isConversationTurnPending(), false, 'the provider must no longer own the conversation floor');
  assert.equal(h.c.sceneVoiceIsOpen(), true, 'the learner must still have an open microphone');
  assert.notEqual(h.c.micButton.disabled, true, 'the microphone control must remain operable');
}

async function connect(h) {
  h.s.duplexReady = false;
  const ready = h.c.connectDuplexSession();
  const socket = h.s.duplexSocket;
  const send = event => socket.onmessage({ data: JSON.stringify(event) });
  await send({ type: 'session.created' });
  await ready;
  return send;
}

for (const sample of cases) {
  test(`${sample.label}: accepted meaning immediately cancels a runaway reply and schedules progression`, () => {
    const h = recoveryHarness(sample);
    const { context } = addFinalAnswer(h, sample.answer);
    startRunawayResponse(h);
    h.c.applyDynamicFeedback({ meaning_valid: true, choice: sample.choice }, context);
    assert.equal(h.s.speechDone, true);
    assert.equal(h.goal.meaningAccepted, true);
    assert.equal(h.s.stage, 'task-complete');
    assertUsableFloor(h);
    assert.ok(h.effects.some(effect => effect.type === 'advance'), 'a confirmed answer must have a next step');
  });

  test(`${sample.label}: a usable hypothesis survives a missing ASR final and is evaluated once`, async () => {
    const h = recoveryHarness(sample);
    const turn = h.c.acceptTranscriptEvent({ item_id: 'missing-final' }, { allowStart: true });
    h.c.confirmLearnerTurn(turn, sample.answer);
    h.c.updateLearnerTurn(turn, sample.answer);
    h.c.armVoiceTurnWatchdog();
    await h.advance(6500);
    const message = h.s.dialogueHistory.find(item => item.speaker === 'user');
    assert.equal(message.text, sample.answer);
    assert.equal(message.final, true, 'a usable complete hypothesis must enter normal meaning evaluation');
    assert.equal(h.s.speechDone, true, 'a missing terminal ASR event must not discard a clear answer');
    assert.equal(h.evidence.filter(([, result]) => result === 'success').length, 1);
    assertUsableFloor(h);
    await h.advance(6000);
    assert.equal(h.evidence.filter(([, result]) => result === 'success').length, 1, 'recovery cannot score the same turn twice');
  });

  test(`${sample.label}: a response done without any audio started releases a text-only reply`, async () => {
    const h = recoveryHarness(sample);
    const send = await connect(h);
    h.c.beginExpectedResponse('user');
    h.s.expectedResponse.responseId = 'text-only';
    Object.assign(h.s, { awaitingModelReply: true, duplexPendingSubtitle: 'Please try again.',
      duplexValidatedText: true, duplexAcceptAudio: false });
    await send({ type: 'response.done', response_id: 'text-only' });
    await h.advance(500);
    assertUsableFloor(h);
    assert.ok(h.s.dialogueHistory.some(item => item.speaker === 'luma' && item.text === 'Please try again.'),
      'the finished text must remain readable even when audio never started');
  });

  test(`${sample.label}: an unrelated answer gets a readable recovery and usable mic without being passed`, async () => {
    const h = recoveryHarness(sample);
    const { message, context } = addFinalAnswer(h, 'The moon is made of cheese.');
    startRunawayResponse(h);
    h.c.applyDynamicFeedback({ meaning_valid: false }, context);
    await h.advance(10000);
    assert.equal(h.s.speechDone, false);
    assert.equal(h.s.stage, 'active', 'unrelated speech must not be treated as lesson success');
    assertUsableFloor(h);
    assert.ok(message.status || h.s.dialogueHistory.some(item => item.speaker === 'luma' && item.text.trim()),
      'the answer needs a readable follow-up instead of a silent unchanged task');
    assert.ok(h.effects.some(effect => effect.type === 'spoken')
      || h.s.dialogueHistory.some(item => item.speaker === 'luma' && item.text.trim()),
    'a temporary toast alone is not a persistent recovery route');
  });

  test(`${sample.label}: ASR recovery survives early audio started and ignores a late duplicate final`, async () => {
    const h = recoveryHarness(sample);
    const send = await connect(h);
    await send({ type: 'conversation.item.input_audio_transcription.started', item_id: 'early-response' });
    await send({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'early-response', delta: sample.answer });
    await send({ type: 'response.output_audio.started', response_id: 'started-too-soon', question_id: 'early-response' });
    assert.equal(h.s.activeVoiceTurn, null, 'audio start releases the local speech floor');
    await h.advance(6500);
    assert.equal(h.s.speechDone, true, 'the original item must still finalize after losing the local floor');
    assertUsableFloor(h);
    assert.equal(h.evidence.filter(([, result]) => result === 'success').length, 1);
    await send({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'early-response', transcript: sample.answer });
    await h.advance(6500);
    assert.equal(h.evidence.filter(([, result]) => result === 'success').length, 1);
    assert.equal(h.s.dialogueHistory.filter(item => item.speaker === 'user').length, 1);
    assert.equal(h.s.dialogueHistory.find(item => item.speaker === 'user').text, sample.answer);
  });

  test(`${sample.label}: completed ASR without a preceding started event is still consumed once`, async () => {
    const h = recoveryHarness(sample);
    const send = await connect(h);
    await send({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'final-only', transcript: sample.answer });
    assert.equal(h.s.speechDone, true, 'terminal recognition with words must not disappear because started was lost');
    assertUsableFloor(h);
    await send({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'final-only', transcript: sample.answer });
    assert.equal(h.evidence.filter(([, result]) => result === 'success').length, 1);
  });
}

test('a never-resolving audio queue has a bounded recovery after provider audio done', async () => {
  const h = recoveryHarness(cases[1]);
  h.c.beginExpectedResponse('user');
  Object.assign(h.s.expectedResponse, { responseId: 'stalled-audio-queue', audioStarted: true });
  Object.assign(h.s, { duplexSpeaking: true, duplexAcceptAudio: true,
    duplexOutputDone: true, duplexSubtitleReady: true,
    duplexAudioQueue: new Promise(() => {}) });
  h.c.finishDuplexAudioOutput();
  await h.advance(7999);
  assert.notEqual(h.s.expectedResponse, null, 'do not cancel before the audio queue deadline');
  await h.advance(1);
  assertUsableFloor(h);
});

test('an old stalled audio queue cannot release a newer response when its deadline fires', async () => {
  const h = recoveryHarness(cases[1]);
  h.c.beginExpectedResponse('user');
  Object.assign(h.s.expectedResponse, { responseId: 'old-queue', audioStarted: true });
  Object.assign(h.s, { duplexSpeaking: true, duplexAcceptAudio: true,
    duplexOutputDone: true, duplexSubtitleReady: true,
    duplexAudioQueue: new Promise(() => {}) });
  h.c.finishDuplexAudioOutput();
  h.c.stopSpeechPlayback();
  const next = h.c.beginExpectedResponse('say');
  next.responseId = 'new-response';
  h.s.awaitingModelReply = true;
  await h.advance(8000);
  assert.equal(h.s.expectedResponse, next, 'a retired generation cannot end a newer turn');
});

for (const eventType of ['response.canceled', 'response.cancelled']) {
  test(`${eventType} for the current response releases the microphone floor`, async () => {
    const h = recoveryHarness(cases[1]);
    const send = await connect(h);
    startRunawayResponse(h);
    await send({ type: eventType, response_id: 'runaway-provider' });
    assertUsableFloor(h);
  });
}

test('a late or unidentified cancellation cannot retire a newer character response', async () => {
  const h = recoveryHarness(cases[1]);
  const send = await connect(h);
  const old = h.c.beginExpectedResponse('user', { questionId: 'old-question' });
  old.responseId = 'old-response';
  h.c.stopSpeechPlayback();
  const next = h.c.beginExpectedResponse('say', { questionId: 'new-question' });
  next.responseId = 'new-response';
  h.s.awaitingModelReply = true;
  for (const event of [
    { type: 'response.canceled', response_id: 'old-response' },
    { type: 'response.cancelled', question_id: 'old-question' },
    { type: 'response.canceled' },
  ]) {
    await send(event);
    assert.equal(h.s.expectedResponse, next, 'only the current response may release its floor');
    assert.equal(h.s.awaitingModelReply, true);
  }
});

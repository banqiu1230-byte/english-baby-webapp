const test = require('node:test');
const assert = require('node:assert/strict');
const Coffee = require('./coffee');
const Breakfast = require('./breakfast');
const Interview = require('./interview');
const SceneDialogue = require('./scene-dialogue');
const { harness } = require('./test-support/voice-harness.cjs');

const scenes = {
  coffee: Coffee.tasks,
  kitchen: Breakfast.tasks,
  airport: SceneDialogue.tasksFor('airport'),
  office: SceneDialogue.tasksFor('office'),
  interview: Interview.tasksFor('I01'),
};

async function setup(scene) {
  const tasks = scenes[scene];
  let h;
  h = harness({
    TASK_ADVANCE_DWELL_MS: 1600,
    currentSceneConfig: () => ({ tasks }),
    LumaExperience: { checkpoint() {}, noteHelp() {}, noteCharacterLine() {}, closeHelp() {} },
    speak(text) { h.effects.push({ type: 'spoken', text }); return Promise.resolve(true); },
    startTask(index) { h.effects.push({ type: 'next', index }); h.s.stage = 'active'; h.s.taskIndex = index; },
    finishDuplexAudioOutput() {}, queueDuplexAudio() {},
  });
  Object.assign(h.task, tasks[0], { requiresAction: false, requiresSpeech: true });
  Object.assign(h.s, { selectedScene: scene, taskIndex: 0, stage: 'task-complete',
    speechDone: true, actionDone: true, coveredGoals: new Set([h.task.id]),
    activeQuestion: h.task.prompt, currentSpeech: h.task.prompt, conversationFocus: 'task',
    characterPromptDelivered: true, coffee: Coffee.advanceMission(Coffee.missionInitial('C01'), 'Americano.').world,
    dialogueHistory: [{ id: 1, speaker: 'user', text: 'My answer.', final: true, taskId: h.task.id }], messageSerial: 1 });
  h.c.apple = h.c.document.querySelector('apple');
  h.load('latestFollowupText', 'scheduleTaskAdvance', 'handleConversationSupport',
    'publishDuplexSubtitle', 'releaseDuplexAudioGate', 'beginCharacterCaptionReveal',
    'looksLikeReasoningLeak', 'asksForCompletedAction', 'taskRequirementsMet', 'safeCharacterReply', 'completeMultimodalTask');
  const ready = h.c.connectDuplexSession(), socket = h.s.duplexSocket;
  const send = event => socket.onmessage({ data: JSON.stringify(event) });
  await send({ type: 'session.created' }); await ready;
  return { h, send };
}

async function textReply(h, send, text, id, { requestedExplanation = false } = {}) {
  if (!h.s.expectedResponse) h.c.beginExpectedResponse(requestedExplanation ? 'say' : 'user');
  if (requestedExplanation) h.s.expectedResponse.updatesQuestion = false;
  await send({ type: 'response.output_text.done', response_id: id, text });
  await send({ type: 'response.done', response_id: id });
}

for (const scene of Object.keys(scenes)) {
  test(`${scene}: a real follow-up survives delivery, waits for an answer, then resumes once`, async () => {
    const { h, send } = await setup(scene);
    const question = scene === 'coffee' ? 'Would you like a lid?' : 'Would you like a moment to think?';
    h.c.scheduleTaskAdvance(1);
    await textReply(h, send, question, 'follow-up');
    assert.equal(h.s.dialogueHistory.at(-1).text, question);
    assert.equal(h.s.activeQuestion, question);
    assert.equal(h.c.captureUserTurnContext().question, question);
    await h.advance(60000);
    assert.equal(h.effects.some(effect => effect.type === 'next' || effect.type === 'spoken'), false);
    await send({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'follow-up-answer', text: 'Yes, thank you.' });
    assert.equal(h.s.expectedResponse?.kind, 'user', 'even a short yes keeps its contextual response');
    await textReply(h, send, 'Of course. Take your time.', 'follow-up-answer-reply');
    await h.advance(2100);
    assert.deepEqual(h.effects.filter(effect => effect.type === 'next'), [{ type: 'next', index: 1 }]);
    assert.equal(h.s.coveredGoals.size, 1, 'the side answer earns no second task');
  });

  test(`${scene}: explicit continue leaves an unanswered follow-up through the same scheduler`, async () => {
    const { h, send } = await setup(scene);
    h.c.scheduleTaskAdvance(1);
    await textReply(h, send, 'Would you like a moment to think?', 'follow-up');
    await send({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'continue', text: 'Continue, please.' });
    await h.advance(5000);
    assert.deepEqual(h.effects.filter(effect => effect.type === 'next'), [{ type: 'next', index: 1 }]);
  });

  test(`${scene}: late accepted evidence cannot overwrite a real completed follow-up`, async () => {
    const { h, send } = await setup(scene);
    h.s.stage = 'active'; h.s.coveredGoals.clear();
    const question = 'Would you like a moment to think?';
    await textReply(h, send, question, 'already-finished');
    assert.equal(h.c.isConversationTurnPending(), false);
    assert.equal(h.c.completeMultimodalTask(), true);
    assert.equal(h.s.activeQuestion, question);
    assert.equal(h.s.dialogueHistory.at(-1).text, question);
    assert.equal(h.effects.some(effect => effect.type === 'spoken'), false);
    await h.advance(60000);
    assert.equal(h.effects.some(effect => effect.type === 'next'), false);
    assert.equal(h.s.coveredGoals.has(h.task.id), true);
  });
}

test('audio and text-only replies share question context while requested examples preserve it', async () => {
  for (const delivery of ['audio', 'text-only']) for (const explanation of [false, true]) {
    const { h, send } = await setup('interview');
    const original = h.s.activeQuestion;
    const text = explanation ? 'You could ask: What was your role?' : 'Which product did you work on most recently?';
    h.c.beginExpectedResponse(explanation ? 'say' : 'user');
    if (explanation) {
      h.s.expectedResponse.updatesQuestion = false;
      h.s.duplexPendingSubtitle = text; h.s.duplexValidatedText = true;
    }
    if (delivery === 'audio') await send({ type: 'response.output_audio.started', response_id: 'context' });
    await send({ type: 'response.output_text.done', response_id: 'context', text });
    if (delivery === 'text-only') await send({ type: 'response.done', response_id: 'context' });
    assert.equal(h.s.activeQuestion, explanation ? original : text, `${delivery}: ${explanation}`);
    assert.equal(h.s.dialogueHistory.at(-1).updatesQuestion, !explanation);
  }
});

test('specific spoken meaning questions keep the contextual response without scoring or canned translations', async () => {
  for (const scene of Object.keys(scenes)) {
    const { h } = await setup(scene);
    const text = 'What does personal response before what means?';
    const response = h.c.beginExpectedResponse('user');
    const message = { speaker: 'user', text, final: true };
    assert.equal(h.c.handleConversationSupport(text, h.c.captureUserTurnContext(), message), false);
    assert.equal(h.s.expectedResponse, response);
    assert.equal(h.effects.some(effect => effect.type === 'spoken' || effect.type === 'scored'), false);
    assert.equal(h.s.coveredGoals.size, 1);
  }
});

test('reading inline help pauses advancement but a read-aloud answer releases it without canceling the reply', async () => {
  const { h, send } = await setup('interview');
  let reading = true;
  h.c.LumaExperience.isHelpOpen = () => reading;
  h.c.LumaExperience.learnerTurnStarted = () => {
    reading = false;
    h.c.scheduleTaskAdvance(1);
  };
  h.c.scheduleTaskAdvance(1);
  await h.advance(60000);
  assert.equal(h.effects.some(effect => effect.type === 'next'), false);
  await send({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'read-aloud', text: 'Yes, thank you.' });
  assert.equal(reading, false);
  const expected = h.s.expectedResponse;
  assert.equal(expected?.kind, 'user');
  await h.advance(1000);
  assert.equal(h.s.expectedResponse, expected, 'releasing help must preserve the real pending reply');
  assert.equal(h.effects.some(effect => effect.type === 'next'), false);
  await textReply(h, send, 'Of course. Thank you.', 'read-aloud-reply');
  await h.advance(2100);
  assert.deepEqual(h.effects.filter(effect => effect.type === 'next'), [{ type: 'next', index: 1 }]);
});

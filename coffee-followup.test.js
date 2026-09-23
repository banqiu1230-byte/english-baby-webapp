const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./test-support/voice-harness.cjs');
const Coffee = require('./coffee');

// Exercise the actual app transcript and provider-event handlers. Only the
// browser, provider transport and media output are substituted by the harness.
function coffeeHarness(taskIndex = 0) {
  const tasks = Coffee.tasks.map(task => ({ ...task }));
  const h = harness({
    TASK_ADVANCE_DWELL_MS: 2600,
    currentSceneConfig: () => ({ tasks }),
    currentGoalRecord: () => ({}),
    LumaExperience: { noteAnswer() {}, noteHelp() {}, noteCharacterLine() {} },
    speak: text => { h.effects.push({ type: 'spoken', text }); return Promise.resolve(true); },
    discardReasoningLeak: replacement => {
      h.effects.push({ type: 'replaced', text: replacement });
      h.c.stopSpeechPlayback();
    },
    beginCharacterCaptionReveal: text => h.effects.push({ type: 'caption', text }),
    queueDuplexAudio: audio => h.effects.push({ type: 'audio', audio }),
    finishDuplexAudioOutput() {},
  });
  Object.assign(h.s, {
    selectedScene: 'coffee', coffeeMissionId: 'C01', taskIndex,
    coffee: Coffee.advanceMission(Coffee.missionInitial('C01'), 'Americano.').world,
    coveredGoals: new Set(['coffee-order']),
  });
  Object.assign(h.task, tasks[taskIndex], { requiresAction: false });
  h.s.activeQuestion = Coffee.promptFor(h.task.id, h.s.coffee);
  h.s.currentSpeech = h.s.activeQuestion;
  h.load('coffeeTaskForChangedField', 'latestFollowupText', 'clearTaskAdvance', 'scheduleTaskAdvance',
    'looksLikeReasoningLeak', 'asksForCompletedAction', 'transitionReplyReplacement', 'safeCharacterReply',
    'publishDuplexSubtitle', 'releaseDuplexAudioGate', 'applyDynamicFeedback');
  return h;
}

for (const answer of ['yes', '对', 'ok', '嗯', '好的']) {
  test(`C01: ordinary acknowledgment ${JSON.stringify(answer)} cannot reopen the completed order turn`, async () => {
    const h = coffeeHarness();
    h.s.stage = 'task-complete';
    h.s.speechDone = true;
    h.s.dialogueHistory = [{ id: 1, speaker: 'luma', text: 'Okay. An americano.', taskId: h.task.id }];
    h.s.messageSerial = 1;
    let nextTask = null;
    h.c.startTask = index => { nextTask = index; h.s.stage = 'active'; };
    h.c.scheduleTaskAdvance(1);
    const turn = h.c.acceptTranscriptEvent({ item_id: `courtesy-${answer}` }, { allowStart: true });
    h.c.finalizeLearnerTranscript(answer, { turn });

    assert.equal(h.s.dialogueHistory.at(-1).text, answer, 'keep what the learner said');
    assert.equal(h.s.coffee.size, null, 'an acknowledgment does not choose a size');
    assert.equal(h.s.expectedResponse, null, 'a completed step must not wait for a new free-form provider reply');
    assert.equal(h.c.isConversationTurnPending(), false, 'ordinary politeness must not hold the lesson transition');
    assert.equal(h.effects.some(effect => effect.type === 'feedback'), false);
    await h.advance(3000);
    assert.equal(nextTask, 1, 'the size question should appear within the normal transition dwell');
  });
}

async function connect(h) {
  const ready = h.c.connectDuplexSession();
  const socket = h.s.duplexSocket;
  const send = event => socket.onmessage({ data: JSON.stringify(event) });
  await send({ type: 'session.created' });
  await ready;
  return send;
}

test('C01: provider cannot confirm Small before any size was selected', async () => {
  const h = coffeeHarness(1);
  const send = await connect(h);
  h.s.characterPromptDelivered = true;
  h.s.dialogueHistory = [{ id: 1, speaker: 'user', text: '不是吧？', final: true, taskId: 'coffee-size' }];
  h.c.beginExpectedResponse('user');
  h.s.expectedResponse.responseId = 'invented-size';
  await send({ type: 'response.output_audio.started', response_id: 'invented-size' });
  await send({ type: 'response.output_audio.delta', response_id: 'invented-size', audio: 'AAAA' });
  await send({ type: 'response.output_text.done', response_id: 'invented-size', text: 'Small, got it.' });

  assert.equal(h.s.coffee.size, null);
  assert.equal(h.s.speechDone, false);
  assert.equal(h.effects.some(effect => effect.type === 'caption' && effect.text === 'Small, got it.'), false,
    'an ungrounded confirmation must not enter the visible dialogue');
  assert.equal(h.effects.some(effect => effect.type === 'audio'), false,
    'the gated audio must remain unheard when its text invents an order choice');
  assert.ok(h.effects.some(effect => ['replaced', 'spoken'].includes(effect.type) && /small.+large/i.test(effect.text)),
    'recover by asking for the still-missing size');
});

test('C01: 不是吧 is a question, never an implicit small-size selection', () => {
  const h = coffeeHarness(1);
  const message = { id: 2, speaker: 'user', text: '不是吧？', final: true, revision: 1, taskId: 'coffee-size' };
  h.s.dialogueHistory = [message];
  const result = Coffee.advanceMission(h.s.coffee, message.text);
  h.c.applyDynamicFeedback({ meaning_valid: result.accepted, missionResult: result }, {
    ...h.c.captureUserTurnContext(), messageId: message.id, revision: 1, answer: message.text, final: true, source: 'voice',
  });
  assert.equal(result.accepted, false);
  assert.equal(h.s.coffee.size, null);
  assert.equal(h.s.speechDone, false);
  assert.equal(message.taskAccepted, undefined);
  assert.equal(message.status, '继续当前对话');
});

test('C01: provider acknowledgment racing the ASR final cannot precede a second local acknowledgment', async () => {
  const h = coffeeHarness();
  loadCoffeeProgress(h);
  h.s.coffee = Coffee.missionInitial('C01');
  h.s.coveredGoals = new Set();
  h.s.activeQuestion = 'What can I get for you?';
  h.s.currentSpeech = h.s.activeQuestion;
  h.s.characterPromptDelivered = true;
  const send = await connect(h);
  await send({ type: 'conversation.item.input_audio_transcription.result', item_id: 'drink-answer',
    text: 'Americano.' });
  const provider = { response_id: 'racing-ack', question_id: 'drink-answer' };
  await send({ type: 'response.output_audio.started', ...provider });
  await send({ type: 'response.output_text.done', ...provider, text: 'Got it, an americano.' });
  await send({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'drink-answer',
    text: 'Americano.' });

  assert.equal(h.s.coffee.drink, 'americano');
  assert.equal(h.s.stage, 'task-complete');
  const confirmations = h.effects.filter(effect => ['caption', 'spoken'].includes(effect.type));
  assert.equal(confirmations.length, 1, 'one answer must produce one acknowledgment, without an interrupted duplicate');
  assert.equal(confirmations[0].text, 'Okay. An americano.');
  assert.equal(h.effects.filter(effect => effect.type === 'scored').length, 1);
  const revision = h.s.coffee.revision;
  // Duplicate finals and the final watchdog must not reopen the resolved turn.
  await send({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'drink-answer',
    text: 'Americano.' });
  await send({ type: 'response.output_text.done', ...provider, text: 'Got it, an americano.' });
  await h.advance(6500);
  assert.equal(h.s.coffee.revision, revision);
  assert.equal(h.effects.filter(effect => ['caption', 'spoken'].includes(effect.type)).length, 1);
  assert.equal(h.effects.filter(effect => effect.type === 'scored').length, 1);
});

function loadCoffeeProgress(h) {
  const goal = {};
  h.c.currentGoalRecord = () => goal;
  h.c.goalRecord = () => goal;
  h.c.markGoalSpokenFor = (_taskId, text) => h.effects.push({ type: 'scored', text });
  h.c.LumaExperience.checkpoint = () => {};
  h.c.apple = h.c.document.querySelector('apple');
  h.c.startTask = index => h.effects.push({ type: 'next-task', index });
  h.load('recordCoffeeMissionEvidence', 'commitCoffeeChoice', 'taskRequirementsMet',
    'completeMultimodalTask', 'requestLanguageFeedback');
}

test('C01: a mid-sentence small hypothesis is not a size choice without an endpoint', async () => {
  const h = coffeeHarness(1);
  loadCoffeeProgress(h);
  const send = await connect(h);
  await send({ type: 'conversation.item.input_audio_transcription.result', item_id: 'unfinished-size', text: 'Small' });
  await h.advance(1500);
  assert.equal(h.s.coffee.size, null);
  assert.equal(h.s.speechDone, false);
  assert.equal(h.s.dialogueHistory.at(-1).final, false);
  assert.equal(h.effects.some(effect => ['spoken', 'scored'].includes(effect.type)), false);
  await send({ type: 'conversation.item.input_audio_transcription.result', item_id: 'unfinished-size', text: 'Small, no, large.' });
  assert.equal(h.s.coffee.size, null, 'the learner is still allowed to finish or self-correct');
});

for (const reply of ['Okay.', 'Small, got it.']) for (const withAudio of [true, false]) test(`C01: async interpretation holds ${JSON.stringify(reply)} (${withAudio ? 'audio' : 'text-only'}) until the meaning is confirmed`, async () => {
  const h = coffeeHarness(1);
  loadCoffeeProgress(h);
  let resolveFetch;
  h.c.fetch = () => new Promise(resolve => { resolveFetch = resolve; });
  const send = await connect(h);
  await send({ type: 'conversation.item.input_audio_transcription.result', item_id: 'unusual-size', text: 'I want the shorter one.' });
  const provider = { response_id: 'pending-meaning', question_id: 'unusual-size' };
  if (withAudio) {
    await send({ type: 'response.output_audio.started', ...provider });
    await send({ type: 'response.output_audio.delta', ...provider, audio: 'AAAA' });
  }
  await send({ type: 'response.output_text.done', ...provider, text: reply });
  if (!withAudio) await send({ type: 'response.done', ...provider });
  assert.equal(typeof resolveFetch, 'function', 'this utterance must reach asynchronous semantic feedback');
  assert.equal(h.c.learnerDecisionPending(), true);
  assert.equal(h.s.coffee.size, null);
  assert.equal(h.effects.some(effect => ['caption', 'audio', 'spoken', 'replaced'].includes(effect.type)), false,
    'unresolved interpretation must not leak provider content or begin a premature fallback question');
  assert.equal(h.s.dialogueHistory.some(message => message.speaker === 'luma'), false,
    'a terminal text-only reply must also wait for the learner decision');
  resolveFetch({ ok: true, json: async () => ({ meaning_valid: true, choice: 'small' }) });
  await h.advance(0);
  assert.equal(h.s.coffee.size, 'small');
  assert.equal(h.s.stage, 'task-complete');
  assert.equal(h.c.learnerDecisionPending(), false);
  assert.equal(h.c.isConversationTurnPending(), false);
  assert.equal(h.effects.some(effect => ['caption', 'audio'].includes(effect.type)), false,
    'the canceled free-form reply must never play after the local acknowledgment');
  assert.deepEqual(h.effects.filter(effect => effect.type === 'spoken').map(effect => effect.text), ['Okay. A small americano.']);
  assert.equal(h.effects.filter(effect => effect.type === 'scored').length, 1);
});

for (const answer of ['For here.', 'For here, yeah.']) {
  test(`C01: repeating completed service ${JSON.stringify(answer)} does not hold the thanks step`, async () => {
    const h = coffeeHarness(2);
    h.s.coffee = Coffee.advanceMission(Coffee.missionInitial('C01'), 'A small americano for here.').world;
    h.s.coveredGoals = new Set(['coffee-order', 'coffee-size', 'coffee-service']);
    h.s.stage = 'task-complete';
    h.s.speechDone = true;
    h.s.currentSpeech = 'For here. Your coffee will be ready soon.';
    let nextTask = null;
    h.c.startTask = index => { nextTask = index; };
    h.c.scheduleTaskAdvance(3);
    const turn = h.c.acceptTranscriptEvent({ item_id: 'service-repeat' }, { allowStart: true });
    h.c.finalizeLearnerTranscript(answer, { turn });
    assert.equal(h.s.coffee.service, 'here');
    assert.equal(h.s.coffee.received, false);
    assert.equal(h.s.expectedResponse, null);
    assert.equal(h.c.isConversationTurnPending(), false);
    assert.equal(h.effects.some(effect => effect.type === 'feedback'), false);
    await h.advance(3000);
    assert.equal(nextTask, 3);
  });
}

test('C01: yes after either-or changes to a single offer without guessing a size', async () => {
  const h = coffeeHarness(1);
  loadCoffeeProgress(h);
  const send = await connect(h);
  await send({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'size-yes', text: 'yes' });
  await h.advance(0);
  assert.equal(h.s.coffee.size, null);
  assert.equal(h.s.speechDone, false);
  assert.equal(h.s.stage, 'active');
  assert.equal(h.effects.some(effect => effect.type === 'scored'), false);
  assert.ok(h.effects.some(effect => effect.type === 'spoken' && effect.text === 'Would you like a small americano?'));
});

test('C01: an order reply bound to the old task cannot speak after moving to size', async () => {
  const h = coffeeHarness();
  const send = await connect(h);
  h.c.beginExpectedResponse('user', { questionId: 'old-order' });
  h.s.expectedResponse.responseId = 'old-order-reply';
  Object.assign(h.task, Coffee.tasks[1], { requiresAction: false });
  h.s.taskIndex = 1;
  h.s.currentSpeech = Coffee.promptFor('coffee-size', h.s.coffee);
  const old = { response_id: 'old-order-reply', question_id: 'old-order' };
  await send({ type: 'response.output_audio.started', ...old });
  await send({ type: 'response.output_text.done', ...old, text: 'Okay. An americano.' });
  await send({ type: 'response.output_audio.delta', ...old, audio: 'AAAA' });
  assert.equal(h.effects.some(effect => ['caption', 'audio', 'spoken'].includes(effect.type)), false);
  assert.equal(h.s.duplexSpeaking, false);
  assert.equal(h.s.coffee.size, null);
});

test('C01: answering during a guarded reply retry leaves the new confirmation audible', async () => {
  const h = coffeeHarness(1);
  loadCoffeeProgress(h);
  h.c.unlockDuplexPlayback = () => {};
  h.load('discardReasoningLeak', 'speak');
  const send = await connect(h);
  h.s.characterPromptDelivered = true;
  h.c.beginExpectedResponse('user', { questionId: 'rejected-reply' });
  const rejected = { response_id: 'rejected-reply-audio', question_id: 'rejected-reply' };
  await send({ type: 'response.output_audio.started', ...rejected });
  await send({ type: 'response.output_text.done', ...rejected, text: 'Small, got it.' });
  assert.equal(h.s.suppressDuplexResponse, true, 'the ungrounded reply is suppressed during its 140 ms safe-retry delay');
  await h.advance(50);

  await send({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'actual-small', text: 'Small.' });
  assert.equal(h.s.coffee.size, 'small');
  assert.equal(h.s.stage, 'task-complete');
  assert.equal(h.s.expectedResponse?.kind, 'say');
  assert.equal(h.s.suppressDuplexResponse, false, 'the learner answer retires the old suppression as well as its reply');
  const current = h.s.expectedResponse;
  const fresh = { response_id: 'small-confirmation' };
  await send({ type: 'response.output_audio.started', ...fresh });
  await send({ type: 'response.output_text.done', ...fresh, text: 'Okay. A small americano.' });
  await send({ type: 'response.output_audio.delta', ...fresh, audio: 'AAAA' });
  assert.equal(current.audioStarted, true, 'the new say must accept audio.started');
  assert.ok(h.effects.some(effect => effect.type === 'caption' && effect.text === 'Okay. A small americano.'));
  assert.equal(h.effects.filter(effect => effect.type === 'audio').length, 1, 'new audio must pass the text gate');

  await h.advance(200);
  assert.equal(h.s.expectedResponse, current, 'the canceled retry must not replace the new confirmation');
  assert.equal(h.s.suppressDuplexResponse, false);
  const requestedLines = h.effects.filter(effect => effect.type === 'send' && effect.data.type === 'say').map(effect => effect.data.text);
  assert.deepEqual(requestedLines, ['Okay. A small americano.']);
  assert.equal(h.s.dialogueHistory.some(message => message.status?.includes('语音未播放')), false);
});

for (const answer of ['Hi!', 'How are you?', "I'm fine, thanks. And you?", '你好', 'Nice weather today.']) {
  test(`small talk gets the provider reply without a duplicate question: ${answer}`, async () => {
    const h = coffeeHarness();
    loadCoffeeProgress(h);
    h.s.coffee = Coffee.missionInitial('C01');
    h.s.coveredGoals = new Set();
    h.c.fetch = () => { throw new Error('Small talk must not wait for semantic feedback'); };
    const message = { id: 2, speaker: 'user', text: answer, final: true, revision: 1, taskId: 'coffee-order' };
    h.s.dialogueHistory = [message];
    const response = h.c.beginExpectedResponse('user');
    await h.c.requestLanguageFeedback(h.s.activeQuestion, answer, {
      ...h.c.captureUserTurnContext(), messageId: 2, revision: 1, answer, final: true, source: 'voice',
    });
    assert.equal(h.s.coffee.revision, 0);
    assert.equal(h.s.coffee.drink, null);
    assert.equal(h.s.stage, 'active');
    assert.equal(message.status, '继续当前对话');
    assert.equal(h.s.expectedResponse, response, 'keep the existing character response alive');
    assert.equal(h.effects.some(e => ['spoken', 'scored', 'replaced'].includes(e.type)), false);
    h.s.duplexPendingSubtitle = 'Hi! I’m good, thanks. And you?';
    h.s.duplexValidatedText = true;
    h.s.duplexSpeaking = true;
    assert.equal(h.c.publishDuplexSubtitle(), true);
    assert.ok(h.effects.some(e => e.type === 'caption' && /I’m good/.test(e.text)));
  });
}

test('an unfamiliar social answer does not get overwritten by the original coffee question', () => {
  const h = coffeeHarness(1);
  const answer = 'The garden outside is beautiful.';
  const message = { id: 2, speaker: 'user', text: answer, final: true, revision: 1, taskId: 'coffee-size' };
  h.s.dialogueHistory = [message];
  const response = h.c.beginExpectedResponse('user');
  h.c.applyDynamicFeedback({ meaning_valid: false }, {
    ...h.c.captureUserTurnContext(), messageId: 2, revision: 1, answer, final: true, source: 'voice',
  });
  assert.equal(message.status, '继续当前对话');
  assert.equal(h.s.coffee.size, null);
  assert.equal(h.s.expectedResponse, response);
  assert.equal(h.effects.some(e => e.type === 'spoken'), false);
});

test('greeting plus an order question still commits exactly one order', async () => {
  const h = coffeeHarness();
  loadCoffeeProgress(h);
  h.s.coffee = Coffee.missionInitial('C01');
  h.s.coveredGoals = new Set();
  h.c.fetch = () => { throw new Error('Clear polite order should resolve locally'); };
  const answer = 'Hi Mia, could I have an americano, please?';
  const message = { id: 2, speaker: 'user', text: answer, final: true, revision: 1, taskId: 'coffee-order' };
  h.s.dialogueHistory = [message];
  await h.c.requestLanguageFeedback(h.s.activeQuestion, answer, {
    ...h.c.captureUserTurnContext(), messageId: 2, revision: 1, answer, final: true, source: 'voice',
  });
  assert.equal(h.s.coffee.drink, 'americano');
  assert.equal(h.s.stage, 'task-complete');
  assert.equal(h.effects.filter(e => e.type === 'spoken').length, 1);
});

test('a polite You too after handover completes the coffee visit', () => {
  const ordered = Coffee.advanceMission(Coffee.missionInitial('C01'), 'A small latte for here.').world;
  const result = Coffee.advanceMission(ordered, 'You too!');
  assert.equal(result.accepted, true);
  assert.equal(Coffee.missionComplete(result.world), true);
});

test('a follow-up chat after confirming the drink pauses task advancement and keeps the real reply', async () => {
  const h = coffeeHarness();
  h.s.stage = 'task-complete'; h.s.speechDone = true;
  h.s.characterPromptDelivered = true;
  h.s.dialogueHistory = [{id:1,speaker:'luma',text:'Okay. An americano.',taskId:'coffee-order'}];
  h.s.messageSerial = 1;
  h.c.startTask = index => h.effects.push({type:'advanced',index});
  h.c.scheduleTaskAdvance(1);
  const send = await connect(h);
  await send({type:'conversation.item.input_audio_transcription.completed',item_id:'chat',text:'How is your day?'});
  assert.equal(h.s.conversationFocus, 'chat');
  assert.equal(h.s.advanceTimer, null);
  assert.equal(h.c.transitionReplyReplacement('Good, thanks! How about you?'), '');
  await h.advance(15000);
  assert.equal(h.effects.some(e => e.type === 'advanced'), false);
});

test('chatting about a favourite coffee does not consume the next size step during transition', async () => {
  const h = coffeeHarness();
  h.s.stage = 'task-complete'; h.s.speechDone = true;
  h.s.conversationFocus = 'chat';
  h.s.activeQuestion = 'What is your favorite coffee?';
  h.s.dialogueHistory = [{id:1,speaker:'luma',text:h.s.activeQuestion,taskId:'coffee-order'}];
  h.s.messageSerial = 1;
  const send = await connect(h);
  await send({type:'conversation.item.input_audio_transcription.completed',item_id:'preference',text:'A small latte.'});
  assert.equal(h.s.pendingTransitionUtterance, null);
  assert.equal(h.s.coffee.drink, 'americano');
  assert.equal(h.s.coffee.size, null);
});

test('ordinary coffee conversation never waits on a separate feedback request', async () => {
  const h = coffeeHarness(1);
  loadCoffeeProgress(h);
  let requests = 0;
  h.c.fetch = async () => { requests++; throw Error('This conversation must not need grading'); };
  const message = {id:1,speaker:'user',text:'I watched a movie this morning.',revision:1,final:true};
  h.s.dialogueHistory = [message];
  await h.c.requestLanguageFeedback(h.s.activeQuestion, message.text, {
    ...h.c.captureUserTurnContext(), messageId:1,revision:1,final:true,
  });
  assert.equal(requests, 0);
  assert.equal(h.s.conversationFocus, 'chat');
  assert.equal(h.s.coffee.size, null);
  assert.equal(h.effects.some(e => e.type === 'spoken' || e.type === 'scored'), false);
});

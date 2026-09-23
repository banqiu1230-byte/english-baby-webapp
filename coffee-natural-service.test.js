const test = require('node:test');
const assert = require('node:assert/strict');
const Coffee = require('./coffee');
const { harness } = require('./test-support/voice-harness.cjs');

// Product regressions from the cafe conversation. These are deterministic
// state/provider replays, not evidence of real microphone or provider quality.
for (const missionId of ['C01', 'C02', 'C04']) {
  test(`${missionId}: a guest can order for here and finish without repeating the reference order`, () => {
    const initial = Coffee.missionInitial(missionId);
    let result = Coffee.advanceMission(initial, 'A small latte, please.');
    assert.equal(result.accepted, true);
    result = Coffee.advanceMission(result.world, 'For here, you know?');
    assert.equal(result.accepted, true);
    assert.equal(result.world.service, 'here');
    assert.equal(result.world.delivered.service, 'here');
    assert.equal(result.nextStep.taskId, 'coffee-thanks');
    assert.doesNotMatch(result.prompt, /say to go|check|correct|task/i);
    result = Coffee.advanceMission(result.world, 'Thanks.');
    assert.equal(Coffee.missionComplete(result.world), true);
    assert.equal(initial.drink, null, 'do not mutate an earlier turn');
  });
}

test('an out-of-order Small is acknowledged, retained, and never asked again after choosing the drink', () => {
  const original = Coffee.missionInitial('C02');
  let result = Coffee.advanceMission(original, 'Small.');
  assert.equal(result.accepted, true);
  assert.equal(result.world.size, 'small');
  assert.equal(result.world.drink, null);
  assert.match(result.prompt, /small/i, 'acknowledge the size instead of ignoring what was said');
  assert.notEqual(result.prompt, Coffee.nextPrompt(original), 'do not blindly replay the initial question');
  result = Coffee.advanceMission(result.world, 'Americano.');
  assert.equal(result.world.size, 'small');
  assert.equal(result.world.drink, 'americano');
  assert.equal(result.nextStep.taskId, 'coffee-service');
  assert.doesNotMatch(result.prompt, /small or.*large/i);
});

for (const [field, preparation] of [
  ['drink', ''], ['size', 'A latte.'], ['service', 'A small latte.'],
]) {
  test(`ambiguous Yes for ${field} becomes one specific offer, and only a later Yes commits it`, () => {
    const world = preparation ? Coffee.advanceMission(Coffee.missionInitial('C01'), preparation).world : Coffee.missionInitial('C01');
    const question = Coffee.nextPrompt(world);
    const result = Coffee.advanceMission(world, 'Yes.', { question });
    assert.equal(result.accepted, false);
    assert.equal(result.world[field], null);
    assert.equal(result.world.revision, world.revision);
    assert.notEqual(result.prompt, question, 'repair the ambiguous question instead of repeating it');
    assert.match(result.prompt, /\?$/);
    const confirmed = Coffee.advanceMission(result.world, 'Yes, please.', { question: result.prompt });
    assert.equal(confirmed.accepted, true, `the actual offer must be confirmable: ${result.prompt}`);
    assert.ok(confirmed.world[field]);
    assert.equal(confirmed.world.revision, world.revision + 1);
  });

  test(`No to a specific ${field} offer does not secretly choose its alternative`, () => {
    const world = preparation ? Coffee.advanceMission(Coffee.missionInitial('C01'), preparation).world : Coffee.missionInitial('C01');
    const offer = Coffee.advanceMission(world, 'Yes.', { question: Coffee.nextPrompt(world) }).prompt;
    const declined = Coffee.advanceMission(world, 'No.', { question: offer });
    assert.equal(declined.accepted, false);
    assert.equal(declined.world[field], null);
    assert.equal(declined.world.revision, world.revision);
    assert.notEqual(declined.prompt, offer);
    assert.match(declined.prompt, /\?$/);
    const alternative = Coffee.advanceMission(declined.world, 'Yes.', { question: declined.prompt });
    assert.equal(alternative.accepted, true, `the second offered option must be confirmable: ${declined.prompt}`);
    const firstChoice = Coffee.advanceMission(world, 'Yes.', { question: offer });
    assert.notEqual(alternative.world[field], firstChoice.world[field]);
  });
}

test('Yes cannot confirm a negative question, hypothetical, or a drink in an earlier sentence', () => {
  const world = Coffee.missionInitial('C01');
  for (const question of [
    'Would you like a latte or an americano?',
    'Would you not like a latte?',
    'If you wanted a latte, would you tell me?',
    'Would you like a latte? How are you?',
    'A latte is a coffee with milk. Do you understand?',
  ]) {
    assert.equal(Coffee.advanceMission(world, 'Yes.', { question }).accepted, false, question);
  }
});

test('asking about unavailable cappuccino or an absent menu gets a grounded reply and keeps order unset', () => {
  for (const answer of ['I like cappuccino.', 'A cappuccino, please.', "OK, I don't see the menu."]) {
    const world = Coffee.missionInitial('C01');
    const reply = Coffee.conversationReply(answer, world, { question: Coffee.nextPrompt(world) });
    assert.ok(reply, answer);
    assert.match(reply, /latte/i);
    assert.match(reply, /americano/i);
    assert.equal(Coffee.replyViolatesScene(reply), false, reply);
    const result = Coffee.advanceMission(world, answer, { question: Coffee.nextPrompt(world) });
    assert.equal(result.accepted, false, answer);
    assert.equal(result.world.drink, null, answer);
    assert.equal(result.world.revision, 0, answer);
    assert.equal(result.prompt, reply, answer);
  }
});

for (const reply of [
  'Let me show you the menu, it is right here.',
  'The menu is over there.',
  'I will make you a cappuccino.',
  'We have cappuccino and espresso.',
  'A cappuccino, coming right up.',
  "We don't have a menu. I can make you a cappuccino.",
]) {
  test(`scene guard rejects invented availability: ${reply}`, () => {
    assert.equal(Coffee.replyViolatesScene(reply), true);
  });
}

for (const reply of [
  "We don't have cappuccino here. Would you like a latte?",
  "There isn't a menu on screen. We have latte and americano.",
  'A latte has milk, and an americano is black coffee.',
  'Would you like a small latte?',
]) {
  test(`scene guard allows a grounded explanation: ${reply}`, () => {
    assert.equal(Coffee.replyViolatesScene(reply), false);
  });
}

function voiceHarness() {
  const tasks = Coffee.tasks.map(task => ({ ...task }));
  const h = harness({
    currentSceneConfig: () => ({ tasks }),
    LumaExperience: { noteCharacterLine() {}, noteAnswer() {}, checkpoint() {} },
    beginCharacterCaptionReveal: text => h.effects.push({ type: 'caption', text }),
    queueDuplexAudio: audio => h.effects.push({ type: 'audio', audio }),
    finishDuplexAudioOutput() {},
    discardReasoningLeak: text => {
      h.effects.push({ type: 'replaced', text });
      h.c.stopSpeechPlayback();
    },
  });
  Object.assign(h.s, { selectedScene: 'coffee', coffeeMissionId: 'C01', taskIndex: 0,
    coffee: Coffee.missionInitial('C01'), stage: 'active', characterPromptDelivered: true });
  Object.assign(h.task, tasks[0]);
  h.s.activeQuestion = Coffee.nextPrompt(h.s.coffee);
  h.s.currentSpeech = h.s.activeQuestion;
  h.load('looksLikeReasoningLeak', 'asksForCompletedAction', 'transitionReplyReplacement',
    'safeCharacterReply', 'publishDuplexSubtitle', 'releaseDuplexAudioGate');
  return h;
}

async function connect(h) {
  const ready = h.c.connectDuplexSession();
  const socket = h.s.duplexSocket;
  const send = event => socket.onmessage({ data: JSON.stringify(event) });
  await send({ type: 'session.created' });
  await ready;
  return send;
}

for (const order of ['text-first', 'audio-first']) {
  for (const [answer, invented] of [
    ["I don't see the menu.", 'Let me show you the menu, it is right here.'],
    ['I like cappuccino.', 'Okay. I will make you a cappuccino.'],
  ]) {
    test(`${order}: invented reply is neither displayed nor heard (${answer})`, async () => {
      const h = voiceHarness();
      const send = await connect(h);
      h.s.dialogueHistory = [{ id: 1, speaker: 'user', text: answer, final: true, taskId: 'coffee-order' }];
      h.c.beginExpectedResponse('user');
      h.s.expectedResponse.responseId = 'invented-scene';
      const id = { response_id: 'invented-scene' };
      const text = () => send({ type: 'response.output_text.done', ...id, text: invented });
      const audio = async () => {
        await send({ type: 'response.output_audio.started', ...id });
        await send({ type: 'response.output_audio.delta', ...id, audio: 'AAAA' });
      };
      if (order === 'text-first') { await text(); await audio(); }
      else { await audio(); await text(); }
      await send({ type: 'response.done', ...id });
      assert.equal(h.effects.some(e => e.type === 'caption' && e.text === invented), false);
      assert.equal(h.effects.some(e => e.type === 'audio'), false, 'reject queued PCM before playback');
      assert.equal(h.s.coffee.drink, null);
      assert.equal(h.s.duplexSpeaking, false, 'rejected output releases the turn instead of getting stuck');
      const replacement = h.effects.find(e => e.type === 'replaced');
      assert.ok(replacement, 'provide a scene-grounded recovery reply');
      assert.equal(Coffee.replyViolatesScene(replacement.text), false);
      assert.match(replacement.text, /latte/i);
    });
  }
}

test('a grounded provider clarification remains audible after scene validation', async () => {
  const h = voiceHarness();
  const send = await connect(h);
  h.s.dialogueHistory = [{ id: 1, speaker: 'user', text: 'What is a latte?', final: true, taskId: 'coffee-order' }];
  h.c.beginExpectedResponse('user');
  h.s.expectedResponse.responseId = 'grounded';
  const id = { response_id: 'grounded' };
  await send({ type: 'response.output_audio.started', ...id });
  await send({ type: 'response.output_audio.delta', ...id, audio: 'AAAA' });
  await send({ type: 'response.output_text.done', ...id, text: 'A latte is coffee with milk.' });
  assert.equal(h.effects.filter(e => e.type === 'caption').length, 1);
  assert.equal(h.effects.filter(e => e.type === 'audio').length, 1);
  assert.equal(h.effects.some(e => e.type === 'replaced'), false);
  assert.equal(h.s.coffee.drink, null, 'an explanation does not place an order');
});

function enableLocalDecisions(h) {
  const goal = {};
  h.c.currentGoalRecord = () => goal;
  h.c.goalRecord = () => goal;
  h.c.markGoalSpokenFor = (_id, text) => h.effects.push({ type: 'scored', text });
  h.c.apple = h.c.document.querySelector('apple');
  h.c.scheduleTaskAdvance = index => h.effects.push({ type: 'next-task', index });
  h.c.speak = text => { h.effects.push({ type: 'spoken', text }); return Promise.resolve(true); };
  h.c.fetch = () => { throw Error('A clear supported answer should resolve without remote grading.'); };
  h.load('coffeeTaskForChangedField', 'recordCoffeeMissionEvidence', 'commitCoffeeChoice',
    'taskRequirementsMet', 'completeMultimodalTask', 'requestLanguageFeedback', 'applyDynamicFeedback');
}

test('C02 ASR For here advances once; a late provider request to say To go is discarded with its audio', async () => {
  const h = voiceHarness();
  enableLocalDecisions(h);
  Object.assign(h.task, Coffee.tasks[2]);
  Object.assign(h.s, { coffeeMissionId: 'C02', taskIndex: 2,
    coffee: Coffee.advanceMission(Coffee.missionInitial('C02'), 'A small latte.').world,
    coveredGoals: new Set(['coffee-order', 'coffee-size']), activeQuestion: 'Is that for here or to go?' });
  const send = await connect(h);
  await send({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'guest-service', text: 'For here.' });
  assert.equal(h.s.coffee.service, 'here');
  assert.equal(h.s.stage, 'task-complete');
  assert.equal(h.s.dialogueHistory.at(-1).status, '已确认');
  assert.deepEqual(h.effects.filter(e => e.type === 'next-task').map(e => e.index), [3]);
  const id = { response_id: 'old-reference-response', question_id: 'guest-service' };
  await send({ type: 'response.output_audio.started', ...id });
  await send({ type: 'response.output_text.done', ...id,
    text: 'Your order should be to go. Could you say to go?' });
  await send({ type: 'response.output_audio.delta', ...id, audio: 'AAAA' });
  assert.equal(h.effects.some(e => e.type === 'caption' || e.type === 'audio'), false);
  assert.equal(h.effects.filter(e => e.type === 'scored').length, 1);
  const spoken = h.effects.filter(e => e.type === 'spoken').map(e => e.text);
  assert.equal(spoken.length, 1);
  assert.match(spoken[0], /for here/i);
  assert.doesNotMatch(spoken[0], /to go|check|say/i);
});

test('ASR Small on the drink question records the size and audibly acknowledges it without completing drink', async () => {
  const h = voiceHarness();
  enableLocalDecisions(h);
  const send = await connect(h);
  await send({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'early-size', text: 'Small.' });
  assert.equal(h.s.coffee.size, 'small');
  assert.equal(h.s.coffee.drink, null);
  assert.equal(h.s.stage, 'active');
  assert.equal(h.s.speechDone, false);
  assert.equal(h.effects.some(e => e.type === 'next-task'), false);
  const spoken = h.effects.filter(e => e.type === 'spoken').map(e => e.text);
  assert.equal(spoken.length, 1, 'one acknowledgment for the actual answer');
  assert.match(spoken[0], /small/i);
  assert.match(spoken[0], /latte.*americano/i);
  assert.equal(h.s.activeQuestion, spoken[0]);
});

for (const [answer, question] of [
  ['Latte.', 'What is your favorite coffee?'],
  ['Americano.', 'Which coffee do you usually like?'],
  ['I drank a latte yesterday.', 'What can I get for you?'],
  ['I had an americano yesterday.', 'Would you like a latte or an americano?'],
]) {
  test(`coffee small talk is not an order: ${answer} / ${question}`, () => {
    assert.equal(Coffee.isConversationOnly(answer, question), true);
    const world = Coffee.missionInitial('C01');
    const result = Coffee.advanceMission(world, answer, { question });
    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'conversation');
    assert.equal(result.world.drink, null);
    assert.equal(result.world.revision, world.revision);
    assert.equal(result.world.stage, 'order');
  });
}

test('an explicit order takes precedence over a preceding preference question', () => {
  const question = 'What is your favorite coffee?';
  const answer = "I'd like a latte, please.";
  assert.equal(Coffee.isConversationOnly(answer, question), false);
  const result = Coffee.advanceMission(Coffee.missionInitial('C01'), answer, { question });
  assert.equal(result.accepted, true);
  assert.equal(result.world.drink, 'latte');
  assert.equal(result.nextStep.taskId, 'coffee-size');
});

for (const answer of ['Cappuccino.', 'I want a cappuccino.', 'A mocha, please.', 'A flat white, please.', 'Espresso, please.']) {
  test(`an unsupported drink is never silently replaced by a supported one: ${answer}`, () => {
    const world = Coffee.missionInitial('C01');
    const result = Coffee.advanceMission(world, answer, { question: Coffee.nextPrompt(world) });
    assert.equal(result.accepted, false);
    assert.equal(result.world.drink, null);
    assert.equal(result.world.size, null);
    assert.equal(result.world.service, null);
    assert.equal(result.world.stage, 'order');
    assert.equal(result.world.revision, world.revision);
  });
}

test('an explicit supported choice after rejecting cappuccino can place the actual latte order', () => {
  const result = Coffee.advanceMission(Coffee.missionInitial('C01'), 'No cappuccino, a latte please.',
    { question: 'What can I get for you?' });
  assert.equal(result.accepted, true);
  assert.equal(result.world.drink, 'latte');
});

for (const sceneId of ['coffee', 'kitchen']) {
  test(`${sceneId}: end-of-scene review leaves the conversation open`, async () => {
    const h = harness({ FINAL_REVIEW_DWELL_MS: 4000,
      showReview: () => h.effects.push({ type: 'review' }),
    });
    Object.assign(h.s, { selectedScene: sceneId, stage: 'complete' });
    h.load('clearReviewTransition', 'latestFollowupText', 'scheduleReview');
    h.c.scheduleReview();
    await h.advance(30000);
    const reviews = h.effects.filter(effect => effect.type === 'review');
    assert.equal(reviews.length, 0, 'finishing a scene must not eject the user from conversation');
    assert.equal(h.s.reviewTimer, null);
  });
}

test('the guest may keep the visible C03 cup instead of being forced to perform a correction', () => {
  for (const answer of ['This is fine.', "I'll keep this one.", '大杯也可以']) {
    const accepted = Coffee.advanceMission(Coffee.missionInitial('C03'), answer);
    assert.equal(accepted.accepted, true);
    assert.equal(accepted.world.stage, 'handover');
    assert.equal(accepted.world.size, 'large');
    assert.equal(accepted.world.delivered.size, 'large');
    assert.deepEqual(accepted.changedFields, [], 'keeping the cup is not evidence of size correction');
    assert.equal(Coffee.advanceMission(accepted.world, 'Thanks.').world.stage, 'complete');
  }
});

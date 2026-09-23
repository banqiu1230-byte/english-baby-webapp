const test = require('node:test');
const assert = require('node:assert/strict');
const Coffee = require('./coffee');
const { harness } = require('./test-support/voice-harness.cjs');

const order = text => Coffee.advanceMission(Coffee.missionInitial('C01'), text).world;

// The guest is reminding the server of information already supplied. Acknowledge
// that specific fact without asking again or awarding another learning result.
for (const [setup, reminder, fact] of [
  ['A small latte.', 'I already said small.', /small/i],
  ['A small latte.', "Didn't I say small?", /small/i],
  ['A small latte.', '我不是说过小杯了吗？', /small/i],
  ['A small latte for here.', 'I already said for here.', /for here/i],
  ['A small latte for here.', "Didn't I say for here?", /for here/i],
  ['A small latte for here.', '不是说过堂食了吗？', /for here/i],
]) {
  test(`server acknowledges a remembered fact: ${reminder}`, () => {
    const before = order(setup);
    const result = Coffee.advanceMission(before, reminder);
    assert.equal(result.accepted, false, 'a reminder is not a new learning achievement');
    assert.deepEqual(result.world, before, 'keep the actual order and revision');
    assert.match(result.prompt, fact, 'audibly acknowledge the particular remembered fact');
    assert.match(result.prompt, /sorry|right|remember|noted|got it|have|yes/i,
      'recognize the reminder instead of resuming a scripted question');
    assert.doesNotMatch(result.prompt, /\?|say |repeat|check the order|enjoy/i,
      'do not turn a reminder into another task or an unrelated handover line');
  });
}

test('remembered order can be acknowledged after the coffee has been received', () => {
  const ready = order('A small latte for here.');
  const before = Coffee.advanceMission(ready, 'Thanks.').world;
  const result = Coffee.advanceMission(before, 'I already said for here.');
  assert.deepEqual(result.world, before);
  assert.equal(result.accepted, false);
  assert.match(result.prompt, /for here/i);
  assert.doesNotMatch(result.prompt, /have a nice day|\?/i);
});

test('asking about a missing past size never fabricates a recorded choice', () => {
  const before = order('A latte.');
  const result = Coffee.advanceMission(before, 'What size did I say?');
  assert.equal(result.world.size, null);
  assert.equal(result.world.drink, 'latte');
  assert.equal(result.accepted, false);
  assert.doesNotMatch(result.prompt, /(?:you (?:said|ordered|chose)|got it|noted)[^.!?]*(?:small|large)/i);
});

test('an explicit correction wins over previously remembered size', () => {
  const before = order('A small latte.');
  const result = Coffee.advanceMission(before, 'I said large, not small.');
  assert.equal(result.accepted, true);
  assert.equal(result.world.size, 'large');
  assert.equal(result.world.drink, 'latte');
  assert.equal(result.world.service, null);
});

test('a denial of the remembered choice must not be called a confirmation', () => {
  const before = order('A small latte.');
  const result = Coffee.advanceMission(before, "I didn't say small.");
  assert.equal(result.accepted, false);
  assert.doesNotMatch(result.prompt, /(?:you(?:'|’)re right|you said|remember|noted)[^.!?]*small/i);
});

for (const reminder of ['I already said small.', "Didn't I say small?", '我不是说过小杯了吗？']) {
  test(`a reminder fixes the actual wrong delivery: ${reminder}`, () => {
    const before = Coffee.missionInitial('C03');
    assert.equal(Coffee.orderReminderReply(reminder, before), '', 'repair is more than reassurance');
    const result = Coffee.advanceMission(before, reminder);
    assert.equal(result.accepted, true);
    assert.equal(result.reason, 'delivery-repaired');
    assert.equal(result.world.delivered.size, 'small');
    assert.equal(result.world.stage, 'handover');
  });
}

test('ambiguous, historical and unrecorded reminders cannot fabricate memory', () => {
  const before = order('A small latte.');
  for (const text of ['I said small or large.', 'I ordered a small latte yesterday.', 'I already said for here.']) {
    assert.equal(Coffee.orderReminderReply(text, before), '', text);
  }
  const story = Coffee.advanceMission(before, 'I ordered a small latte yesterday.');
  assert.equal(story.reason, 'conversation');
  assert.deepEqual(story.world, before);
});

test('a reminder complaint during the quiet transition is not silently discarded as courtesy', () => {
  const h = harness();
  Object.assign(h.task, Coffee.tasks[1], { requiresAction: false });
  Object.assign(h.s, {
    selectedScene: 'coffee', coffeeMissionId: 'C01', taskIndex: 1,
    coffee: order('A small latte.'), stage: 'task-complete',
    coveredGoals: new Set(['coffee-order', 'coffee-size']),
    conversationFocus: 'task',
  });
  h.c.scheduleTaskAdvance = () => {};
  const message = { id: 1, speaker: 'user', text: 'I already said small.', final: true };
  const swallowed = h.c.acknowledgeCompletedTurn(message.text, message);
  assert.equal(swallowed, false, 'a complaint needs an answer even while between order steps');
});

for (const stage of ['active', 'task-complete', 'complete']) {
test(`${stage}: a remembered-fact reminder is one audible repair and no failed attempt`, async () => {
  const noted = [];
  const h = harness({
    LumaExperience: { noteAnswer(_context, outcome) { noted.push(outcome); } },
    speak(text) { h.effects.push({ type: 'spoken', text }); return Promise.resolve(true); },
  });
  const taskIndex = stage === 'active' ? 2 : stage === 'task-complete' ? 1 : 3;
  Object.assign(h.task, Coffee.tasks[taskIndex], { requiresAction: false });
  const coffee = stage === 'complete'
    ? Coffee.advanceMission(order('A small latte for here.'), 'Thanks.').world : order('A small latte.');
  Object.assign(h.s, {
    selectedScene: 'coffee', coffeeMissionId: 'C01', taskIndex,
    coffee, stage,
    activeQuestion: 'Is that for here or to go?',
  });
  h.load('clearTaskAdvance', 'clearReviewTransition', 'applyDynamicFeedback');
  const answer = 'I already said small.';
  const message = { id: 1, speaker: 'user', text: answer, final: true, revision: 1 };
  h.s.dialogueHistory = [message];
  const missionResult = Coffee.advanceMission(h.s.coffee, answer, { question: h.s.activeQuestion });
  h.c.applyDynamicFeedback({ meaning_valid: false, missionResult }, {
    ...h.c.captureUserTurnContext(), answer, messageId: 1, revision: 1, final: true, source: 'voice',
  });
  await Promise.resolve();
  const replies = h.effects.filter(effect => effect.type === 'spoken');
  assert.equal(replies.length, 1);
  assert.match(replies[0].text, /small/i);
  assert.doesNotMatch(replies[0].text, /\?/);
  assert.deepEqual(noted, [], 'a service correction must not be stored as learner failure');
  assert.equal(message.taskAccepted, undefined);
  assert.equal(h.s.conversationFocus, 'chat', 'leave room for the guest to speak');
});
}

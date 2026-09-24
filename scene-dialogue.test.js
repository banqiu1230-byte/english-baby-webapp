const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Dialogue = require('./scene-dialogue');
const Coffee = require('./coffee');
const Breakfast = require('./breakfast');
const { harness } = require('./test-support/voice-harness.cjs');

const fixtures = [
  { sceneId: 'coffee', taskId: 'coffee-order', world: Coffee.missionInitial('C01'), answer: 'Latte.',
    question: 'Would you like a latte or an americano?', choice: 'latte', next: 'coffee-size' },
  { sceneId: 'kitchen', taskId: 'breakfast-drink', world: Breakfast.initial(), answer: 'Milk.',
    question: 'Do you want milk or water?', choice: 'milk', next: 'breakfast-cup' },
];
for (const fixture of fixtures) {
  test(`${fixture.sceneId}: shared turn contract previews a decision without mutating world`, () => {
    const before = JSON.stringify(fixture.world);
    const result = Dialogue.evaluate(fixture);
    assert.equal(result.kind, 'decision');
    assert.equal(result.feedback.meaning_valid, true);
    assert.equal(result.feedback.choice, fixture.choice);
    assert.deepEqual(result.changedTaskIds, [fixture.taskId]);
    assert.equal(result.nextTaskId, fixture.next);
    assert.equal(JSON.stringify(fixture.world), before);
  });
  test(`${fixture.sceneId}: conversation and help cannot become model-supplied decisions`, () => {
    for (const [answer, question, expected] of [
      ['How are you?', fixture.question, 'conversation'],
      [fixture.answer, 'What do you usually drink?', 'conversation'],
      ['Let us talk about yesterday.', 'How was your day?', 'conversation'],
      ['What does that mean?', fixture.question, 'help'],
    ]) {
      const input = { ...fixture, answer, question };
      assert.equal(Dialogue.evaluate(input).kind, expected, answer);
      const feedback = Dialogue.validateCandidate(input, { meaning_valid: true, choice: fixture.choice, complete: true });
      assert.notEqual(feedback.meaning_valid, true, answer);
    }
  });
  test(`${fixture.sceneId}: semantic schema exposes only actual choices`, () => {
    const spec = Dialogue.semanticSpec(fixture.sceneId, fixture.taskId, fixture.world);
    assert.ok(spec.goal && spec.prompt && spec.constraints && spec.facts);
    assert.ok(spec.allowedChoices.includes(fixture.choice));
    spec.allowedChoices.push('invented');
    assert.equal(Dialogue.semanticSpec(fixture.sceneId, fixture.taskId).allowedChoices.includes('invented'), false);
  });
}

test('coffee preserves multi-field decisions, corrections and event identity behind the common result', () => {
  const input = { ...fixtures[0], answer: 'A small latte for here, please.', eventId: 'spoken-1', expectedRevision: 0 };
  const first = Dialogue.evaluate(input);
  assert.deepEqual(first.changedTaskIds, ['coffee-order', 'coffee-size', 'coffee-service']);
  assert.equal(first.nextTaskId, 'coffee-thanks');
  assert.equal(first.baseRevision, 0);
  assert.equal(first.feedback.missionResult.world.revision, 1);
  const world = Coffee.advanceMission(Coffee.missionInitial('C01'), 'Latte.').world;
  const correction = Dialogue.evaluate({ ...input, world, taskId: 'coffee-size', answer: 'I want an americano.', expectedRevision: 1 });
  assert.equal(correction.kind, 'decision');
  assert.equal(correction.feedback.missionResult.world.drink, 'americano');
  assert.equal(correction.nextTaskId, 'coffee-size');
  const replay = Dialogue.evaluate({ ...input, world: first.feedback.missionResult.world, taskId: 'coffee-thanks', expectedRevision: 1 });
  assert.notEqual(replay.kind, 'decision');
  assert.equal(replay.feedback.reason, 'replayed-event');
  assert.equal(replay.feedback.discarded, true);
});

test('coffee model candidates pass through the real reducer and cannot import invented world state', () => {
  const input = { ...fixtures[0], answer: 'I want the black one.', eventId: 'semantic-1', expectedRevision: 0 };
  assert.equal(Dialogue.evaluate(input).kind, 'unresolved');
  const result = Dialogue.validateCandidate(input, { meaning_valid: true, choice: 'americano', world: { received: true, size: 'large' }, complete: true });
  assert.equal(result.meaning_valid, true);
  assert.equal(result.missionResult.world.drink, 'americano');
  assert.equal(result.missionResult.world.size, null);
  assert.equal(result.missionResult.world.received, false);
  assert.deepEqual(result.missionResult.world.appliedEventIds, ['semantic-1']);
  assert.equal(Dialogue.validateCandidate(input, { meaning_valid: true, choice: 'cappuccino' }).meaning_valid, false);
  assert.equal(Dialogue.validateCandidate({ ...input, taskId: 'coffee-size' }, { meaning_valid: true, choice: 'large' }).meaning_valid, false);
  assert.notEqual(Dialogue.validateCandidate({ ...input, expectedRevision: 9 }, { meaning_valid: true, choice: 'americano' }).meaning_valid, true);
});

test('a model cannot overwrite deterministic choices or ambiguity', () => {
  const clear = Dialogue.validateCandidate(fixtures[0], { meaning_valid: true, choice: 'americano' });
  assert.equal(clear.choice, 'latte');
  const unclear = Dialogue.validateCandidate({ ...fixtures[0], answer: 'Yes.' }, { meaning_valid: true, choice: 'latte' });
  assert.equal(unclear.meaning_valid, false);
});

test('late semantic feedback neither interrupts a newer answer nor records learner failure', () => {
  const oldWorld = Coffee.missionInitial('C01');
  const liveWorld = Coffee.advanceMission(oldWorld, 'Small.').world;
  const h = harness({ LumaExperience: { noteAnswer() { throw Error('Stale answers are not learner failures'); } },
    speak() { throw Error('Stale answers must not speak'); } });
  Object.assign(h.s, { selectedScene: 'coffee', taskIndex: 0, coffee: liveWorld, stage: 'active' });
  Object.assign(h.task, Coffee.tasks[0]);
  const message = { id: 1, speaker: 'user', final: true, revision: 1, text: 'I want the black one.', status: '已听到' };
  h.s.dialogueHistory = [message, { id: 2, speaker: 'user', final: true, revision: 1, text: 'Small.' }];
  h.load('applyDynamicFeedback');
  const context = { ...h.c.captureUserTurnContext(), messageId: 1, revision: 1, answer: message.text, final: true };
  for (const meaning_valid of [true, false]) {
    const result = Dialogue.validateCandidate({ sceneId: 'coffee', taskId: 'coffee-order', world: liveWorld,
      expectedRevision: oldWorld.revision, answer: message.text, question: Coffee.nextPrompt(oldWorld) },
    { meaning_valid, choice: 'americano' });
    assert.equal(result.discarded, true);
    h.c.applyDynamicFeedback(result, context);
  }
  assert.equal(message.status, '已听到');
  assert.deepEqual(h.s.coffee, liveWorld);
  assert.equal(h.effects.length, 0);
});

test('an explicit change resumes service after small talk through the scene intent policy', () => {
  const world = Coffee.advanceMission(Coffee.missionInitial('C01'), 'Latte.').world;
  for (const [answer, field, value] of [
    ['Actually, change my order to an americano.', 'drink', 'americano'],
    ['Make it a large, please.', 'size', 'large'], ['改成大杯吧', 'size', 'large'],
  ]) {
    const result = Dialogue.evaluate({ sceneId: 'coffee', taskId: 'coffee-size', world,
      question: 'How are you?', answer });
    assert.equal(result.kind, 'decision', answer);
    assert.equal(result.feedback.missionResult.world[field], value, answer);
  }
});

test('breakfast respects prerequisites and actual yes/no question', () => {
  const input = { sceneId: 'kitchen', taskId: 'breakfast-more', world: { drink: 'milk', cupPlaced: true, amount: null },
    answer: 'Yes.', question: 'Do you want more milk?' };
  assert.equal(Dialogue.evaluate(input).feedback.choice, 'more');
  assert.notEqual(Dialogue.evaluate({ ...input, question: 'How was your day?' }).kind, 'decision');
  assert.notEqual(Dialogue.evaluate({ ...input, world: Breakfast.initial() }).kind, 'decision');
  assert.equal(Dialogue.validateCandidate({ ...input, answer: 'A bit extra, please.', world: Breakfast.initial() },
    { meaning_valid: true, choice: 'more' }).meaning_valid, false);
  assert.equal(Dialogue.evaluate({ ...input, world: undefined }).feedback.choice, 'more', 'legacy server calls without world remain recognizers');
});

test('airport and office only fast-path answers to their real question', () => {
  for (const [sceneId, taskId, answer] of [['airport', 'bag', 'Yes.'], ['office', 'office-signin', 'My name is Alex.']]) {
    assert.equal(Dialogue.evaluate({ sceneId, taskId, answer, questionMatchesTask: true }).kind, 'decision');
    assert.equal(Dialogue.evaluate({ sceneId, taskId, answer, questionMatchesTask: false }).kind, 'unresolved');
  }
});

test('one stale-turn gate rejects edited, superseded, different-scene and wrong-stage responses', () => {
  const input = { message: { speaker: 'user', final: true, revision: 2, text: 'Milk.' },
    context: { revision: 2, answer: 'Milk.', practiceSession: 3, sceneId: 'kitchen', taskId: 'breakfast-drink', taskIndex: 0 },
    sceneId: 'kitchen', taskId: 'breakfast-drink', taskIndex: 0, practiceSession: 3, stage: 'active' };
  assert.equal(Dialogue.isCurrentTurn(input), true);
  for (const override of [{ practiceSession: 4 }, { sceneId: 'coffee' }, { taskIndex: 1 }, { stage: 'complete' },
    { message: { ...input.message, revision: 3 } }, { message: { ...input.message, text: 'Water.' } }])
    assert.equal(Dialogue.isCurrentTurn({ ...input, ...override }), false);
  assert.equal(Dialogue.isCurrentTurn({ ...input, stage: 'complete', allowCompleted: true }), true);
});

test('a new scene needs only its adapter; the coordinator stays unchanged', () => {
  const hotel = Dialogue.create({ hotel: {
    worldKey: 'stay', fields: { checkout: 'hotel-checkout' }, tasks: [{ id: 'hotel-checkout', label: 'Choose checkout time', choices: ['morning', 'noon'] }],
    facts: () => 'Checkout is available in the morning or at noon.',
    evaluate: input => input.answer === 'Noon.' ? { kind: 'decision', feedback: { meaning_valid: true, choice: 'noon' }, changedTaskIds: [input.taskId] }
      : { kind: 'unresolved', feedback: { meaning_valid: false } },
    validateCandidate: (input, candidate) => ({ meaning_valid: true, choice: candidate.choice }),
  } });
  const input = { sceneId: 'hotel', taskId: 'hotel-checkout', answer: 'Noon.' };
  assert.equal(hotel.evaluate(input).feedback.choice, 'noon');
  assert.equal(hotel.worldKey('hotel'), 'stay');
  assert.equal(hotel.taskForField('hotel', 'checkout'), 'hotel-checkout');
  assert.equal(hotel.validateCandidate({ ...input, answer: 'Midday.' }, { meaning_valid: true, choice: 'night' }).meaning_valid, false);
  assert.equal(hotel.validateCandidate({ ...input, answer: 'Midday.' }, { meaning_valid: true, choice: 'noon' }).choice, 'noon');
  assert.equal(hotel.evaluate(fixtures[0]).kind, 'decision', 'default scenes remain available');
  assert.equal(Dialogue.semanticSpec('hotel', 'hotel-checkout'), null, 'custom registry does not mutate defaults');
});

test('the same module runs with browser globals and without CommonJS', () => {
  const context = vm.createContext({});
  for (const filename of ['coffee.js', 'breakfast.js', 'dialogue-rules.js', 'scene-dialogue.js'])
    vm.runInContext(fs.readFileSync(require.resolve(`./${filename}`), 'utf8'), context);
  assert.equal(vm.runInContext("SceneDialogue.worldKey('kitchen')", context), 'breakfast');
  assert.equal(vm.runInContext("SceneDialogue.evaluate({sceneId:'kitchen',taskId:'breakfast-drink',answer:'Milk.',question:'Do you want milk or water?'}).kind", context), 'decision');
});

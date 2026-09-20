const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Coffee = require('./coffee');
const ordered = () => Coffee.apply(Coffee.initial(), 'coffee-order', 'latte');
const sized = () => Coffee.apply(ordered(), 'coffee-size', 'small');
const ready = () => Coffee.apply(sized(), 'coffee-service', 'to-go');

test('all four coffee steps progress through speech without a physical action', () => {
  assert.deepEqual(Coffee.tasks.map(task => task.id), ['coffee-order', 'coffee-size', 'coffee-service', 'coffee-thanks']);
  assert.ok(Coffee.tasks.every(task => task.interaction === 'speech' && task.requiresSpeech && !task.requiresAction));
  assert.equal(Coffee.isTask('coffee-order'), true);
  assert.equal(Coffee.isTask('breakfast-drink'), false);
});

test('coffee prompts name the chosen drink and finish with a handover, not another question', () => {
  assert.equal(Coffee.promptFor('coffee-order'), 'Would you like a latte or an americano?');
  assert.equal(Coffee.promptFor('coffee-size', ordered()), 'Would you like a small or a large latte?');
  assert.equal(Coffee.promptFor('coffee-thanks', ready()), 'Here’s your small latte to go. Enjoy!');
  assert.equal(Coffee.promptFor('coffee-thanks', { drink: 'americano', size: 'large', service: 'here' }), 'Here’s your large americano for here. Enjoy!');
  assert.equal(Coffee.promptFor('unknown'), undefined);
});

test('a named drink accepts beginner fragments, Chinese and clear polite orders', () => {
  for (const text of ['Latte.', 'A latte, please.', 'I would like a latte.', "I'd like latte please.", 'Can I have a latte, please?', '拿铁', '我要拿铁'])
    assert.equal(Coffee.choiceFromText('coffee-order', text, Coffee.initial()), 'latte', text);
  for (const text of ['Americano.', 'An americano, please.', 'Could I get an americano?', '美式咖啡'])
    assert.equal(Coffee.choiceFromText('coffee-order', text, Coffee.initial()), 'americano', text);
});

test('size and service decisions retain the drink and reject contradictory options', () => {
  for (const text of ['Small.', 'A small latte, please.', 'Could I get a small latte?', '小杯'])
    assert.equal(Coffee.choiceFromText('coffee-size', text, ordered()), 'small', text);
  assert.equal(Coffee.choiceFromText('coffee-size', 'Large please.', ordered()), 'large');
  assert.equal(Coffee.choiceFromText('coffee-size', 'A small americano.', ordered()), null);
  for (const text of ['To go.', 'Takeaway, please.', '带走', '打包'])
    assert.equal(Coffee.choiceFromText('coffee-service', text, sized()), 'to-go', text);
  for (const text of ['For here.', 'Here please.', '在这里喝', '堂食'])
    assert.equal(Coffee.choiceFromText('coffee-service', text, sized()), 'here', text);
});

test('help, information questions, uncertain or ambiguous words never complete a decision', () => {
  for (const text of ['What is a latte?', 'Latte?', 'Latte or americano', 'Maybe latte', 'I think latte', 'I do not want latte', 'I don’t know', '什么意思', '怎么说', '我不懂', 'Wait', 'Continue', 'Again'])
    assert.equal(Coffee.choiceFromText('coffee-order', text, Coffee.initial()), null, text);
  for (const [task, world] of [['coffee-order', Coffee.initial()], ['coffee-size', ordered()], ['coffee-service', sized()]]) {
    for (const question of [Coffee.promptFor(task, world), 'Do you want a latte?', 'Do you live here?'])
      for (const answer of ['Yes.', 'No.', 'Okay.'])
        assert.equal(Coffee.choiceFromText(task, answer, world, question), null);
  }
  assert.equal(Coffee.choiceFromText('coffee-service', 'For here or to go?', sized()), null);
});

test('only thanks after the prepared order completes the final step', () => {
  for (const text of ['Thanks.', 'Thank you.', 'Thank you very much.', '谢谢'])
    assert.equal(Coffee.choiceFromText('coffee-thanks', text, ready()), 'thanks', text);
  for (const text of ['No, thanks.', 'Thank you?', 'How do I say thank you?', 'Okay.', 'Latte.'])
    assert.equal(Coffee.choiceFromText('coffee-thanks', text, ready()), null, text);
  assert.equal(Coffee.choiceFromText('coffee-thanks', 'Thanks.', sized()), null);
});

test('world transitions are sequential, immutable and idempotent', () => {
  const empty = Coffee.initial();
  for (const [task, choice] of [['coffee-size', 'large'], ['coffee-service', 'here'], ['coffee-thanks', 'thanks']])
    assert.equal(Coffee.apply(empty, task, choice), empty);
  assert.equal(Coffee.choiceFromText('coffee-size', 'Small.', empty), null);
  const drink = Coffee.apply(empty, 'coffee-order', 'latte');
  assert.deepEqual(empty, Coffee.initial());
  assert.equal(Coffee.apply(drink, 'coffee-order', 'americano'), drink);
  assert.equal(Coffee.choiceFromText('coffee-order', 'Americano.', drink), null);
  const size = Coffee.apply(drink, 'coffee-size', 'small');
  const service = Coffee.apply(size, 'coffee-service', 'to-go');
  const done = Coffee.apply(service, 'coffee-thanks', 'thanks');
  assert.deepEqual(done, { drink: 'latte', size: 'small', service: 'to-go', received: true });
  assert.equal(Coffee.apply(done, 'coffee-thanks', 'thanks'), done);
  assert.equal(Coffee.apply(done, 'coffee-service', 'here'), done);
  assert.equal(Coffee.apply(empty, 'coffee-order', 'milk'), empty);
});

test('untrusted or out-of-order world values do not fabricate a prepared coffee', () => {
  for (const value of [null, undefined, {}, { drink: 'milk', size: 'large', service: 'here', received: true },
    { size: 'small', service: 'to-go', received: true }]) assert.deepEqual(Coffee.normalizeWorld(value), Coffee.initial());
  assert.deepEqual(Coffee.normalizeWorld({ drink: 'latte', size: 'huge', service: 'here', received: true }),
    { drink: 'latte', size: null, service: null, received: false });
  assert.match(Coffee.facts(ready()), /Chosen coffee: latte.*Size: small.*Service: to-go.*Received and thanked: false/);
  assert.equal(Coffee.acknowledgment('coffee-thanks', Coffee.apply(ready(), 'coffee-thanks', 'thanks')), 'You’re welcome. Have a nice day!');
});

test('coffee missions layer C01-C04 over the unchanged four conversation steps', () => {
  assert.deepEqual(Coffee.missions.map(mission => mission.id), ['C01', 'C02', 'C03', 'C04']);
  assert.deepEqual(Coffee.tasks.map(task => task.id), ['coffee-order', 'coffee-size', 'coffee-service', 'coffee-thanks']);
  for (const mission of Coffee.missions) {
    assert.equal(mission.interaction, 'speech');
    assert.equal(mission.requiresSpeech, true);
    assert.equal(mission.requiresAction, false);
    assert.equal(mission.paymentRequired, false);
    assert.ok(mission.taskIds.every(id => Coffee.isTask(id)));
  }
  assert.equal(Coffee.getMission('C01').mode, 'guided');
  assert.equal(Coffee.getMission('C04').mode, 'independent');
  assert.deepEqual(Coffee.getMission('C04').scaffold,
    { subtitles: false, meaning: false, keywords: false, example: false });
  assert.equal(Coffee.getMission('C99'), undefined);
  assert.equal(Coffee.missionInitial('C99'), null);
});

test('mission initial state keeps legacy visual fields while separating order, target and delivery', () => {
  const personal = Coffee.missionInitial('C01');
  assert.deepEqual([personal.drink, personal.size, personal.service, personal.received], [null, null, null, false]);
  assert.equal(personal.target, null);
  assert.equal(personal.delivered, null);
  const friend = Coffee.missionInitial('C02');
  assert.deepEqual(friend.target, { drink: 'latte', size: 'small', service: 'to-go' });
  assert.deepEqual([friend.drink, friend.size, friend.service], [null, null, null], 'the note must not silently fill the barista order');
  const repair = Coffee.missionInitial('C03');
  assert.deepEqual({ drink: repair.drink, size: repair.size, service: repair.service }, repair.target);
  assert.deepEqual(repair.delivered, { drink: 'latte', size: 'large', service: 'to-go' });
  assert.deepEqual(repair.repair, { required: true, resolved: false, field: 'size', expected: 'small', actual: 'large' });
  assert.equal(repair.stage, 'repair');
  const challenge = Coffee.missionInitial('C04', 'C04-small-americano-here');
  assert.equal(challenge.variantId, 'C04-small-americano-here');
  assert.deepEqual(challenge.target, { drink: 'americano', size: 'small', service: 'here' });
});

test('one natural utterance can confirm several slots in English, Chinese or a different order', () => {
  for (const utterance of ['A small latte to go, please.', '我要一杯小杯拿铁带走', 'To go, a latte, small please.']) {
    const result = Coffee.advanceMission(Coffee.missionInitial('C02'), utterance);
    assert.equal(result.accepted, true, utterance);
    assert.deepEqual(result.changedFields.sort(), ['drink', 'service', 'size'], utterance);
    assert.deepEqual({ drink: result.world.drink, size: result.world.size, service: result.world.service },
      { drink: 'latte', size: 'small', service: 'to-go' }, utterance);
    assert.equal(result.world.stage, 'handover', utterance);
    assert.equal(result.nextStep.taskId, 'coffee-thanks');
  }
});

test('mission state accepts fields out of order and asks only for the next missing fact', () => {
  let result = Coffee.advanceMission(Coffee.missionInitial('C01'), 'Small, please.');
  assert.deepEqual([result.world.drink, result.world.size, result.world.service], [null, 'small', null]);
  assert.deepEqual(result.comparison.missing, ['drink', 'service']);
  assert.equal(result.nextStep.taskId, 'coffee-order');
  assert.match(result.prompt, /latte or an americano/i);
  result = Coffee.advanceMission(result.world, 'A latte.');
  assert.deepEqual(result.comparison.missing, ['service']);
  assert.equal(result.nextStep.taskId, 'coffee-service');
  assert.match(result.prompt, /for here or to go/i);
});

test('confirmed fields change only through an explicit or task-controlled correction', () => {
  let result = Coffee.advanceMission(Coffee.missionInitial('C01'), 'A small latte to go, please.');
  const completeOrder = result.world;
  result = Coffee.advanceMission(completeOrder, 'Americano.');
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'correction-needs-signal');
  assert.equal(result.world.drink, 'latte');
  result = Coffee.advanceMission(completeOrder, 'Actually, make that an americano.');
  assert.equal(result.accepted, true);
  assert.equal(result.reason, 'order-corrected');
  assert.deepEqual(result.corrections, [{ field: 'drink', from: 'latte', to: 'americano' }]);
  assert.deepEqual([result.world.drink, result.world.size, result.world.service], ['americano', 'small', 'to-go']);

  result = Coffee.advanceMission(Coffee.missionInitial('C01'), 'Small... no, large.');
  assert.equal(result.world.size, 'large', 'the final clear self-correction wins');
  result = Coffee.advanceMission(result.world, '我不要大杯，要小杯');
  assert.equal(result.world.size, 'small', 'a basic Chinese correction changes only the stated field');

});

test('target-order missions keep matching details and retry only the conflicting field', () => {
  for (const [missionId, variantId, utterance, mismatch, prompt] of [
    ['C02', undefined, 'A large latte to go, please.',
      { field: 'size', expected: 'small', actual: 'large' }, 'Please check the order. What size should it be?'],
    ['C04', 'C04-large-latte-to-go', 'A large latte for here, please.',
      { field: 'service', expected: 'to-go', actual: 'here' }, 'Please check the order. Is it for here or to go?'],
  ]) {
    const initial = Coffee.missionInitial(missionId, variantId);
    const result = Coffee.advanceMission(initial, utterance, { eventId: `${missionId}-wrong-target` });
    assert.equal(result.accepted, true, missionId);
    assert.equal(result.handled, true, missionId);
    assert.equal(result.reason, 'order-partially-matched', missionId);
    assert.deepEqual(result.targetMismatches, [mismatch], missionId);
    assert.equal(result.prompt, prompt, missionId);
    assert.deepEqual([result.world.drink, result.world.size, result.world.service], missionId === 'C02'
      ? ['latte', null, 'to-go'] : ['latte', 'large', null],
      `${missionId} should retain facts that match the visible order`);
    assert.equal(result.world.revision, 1, missionId);
    assert.deepEqual(result.world.appliedEventIds, [`${missionId}-wrong-target`], missionId);
  }
});

test('an explicit correction cannot change a target-order field away from its visible target', () => {
  const ordered = Coffee.advanceMission(Coffee.missionInitial('C02'), 'A small latte to go, please.').world;
  const result = Coffee.advanceMission(ordered, 'Actually, make that a large.');
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'target-mismatch');
  assert.deepEqual(result.targetMismatches, [{ field: 'size', expected: 'small', actual: 'large' }]);
  assert.equal(result.prompt, 'Please check the order. What size should it be?');
  assert.deepEqual([result.world.drink, result.world.size, result.world.service], ['latte', 'small', 'to-go']);
  assert.equal(result.world.stage, 'handover');
  assert.equal(result.world.revision, ordered.revision);
});

test('a pure target mismatch stays unconfirmed and does not mutate the mission', () => {
  const initial = Coffee.missionInitial('C04', 'C04-large-americano-here');
  const result = Coffee.advanceMission(initial, 'Latte.');
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'target-mismatch');
  assert.equal(result.prompt, 'Please check the order. What drink should it be?');
  assert.deepEqual([result.world.drink, result.world.size, result.world.service], [null, null, null]);
  assert.equal(result.world.revision, 0);
});

test('C04 large americano to-go retries only the wrong service and then completes in order', () => {
  let world = Coffee.missionInitial('C04', 'C04-large-americano-to-go');

  let result = Coffee.advanceMission(world, 'An americano, please.');
  assert.equal(result.accepted, true);
  world = result.world;
  assert.equal(Coffee.nextMissionStep(world).taskId, 'coffee-size');
  assert.equal(Coffee.nextPrompt(world), 'Would you like a small or a large americano?');

  result = Coffee.advanceMission(world, 'Large, please.');
  assert.equal(result.accepted, true);
  world = result.world;
  assert.equal(Coffee.nextMissionStep(world).taskId, 'coffee-service');
  assert.equal(Coffee.nextPrompt(world), 'Is that for here or to go?');

  result = Coffee.advanceMission(world, 'For here.');
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'target-mismatch');
  assert.equal(result.prompt, 'Please check the order. Is it for here or to go?');
  assert.deepEqual([result.world.drink, result.world.size, result.world.service], ['americano', 'large', null]);
  assert.equal(Coffee.nextMissionStep(result.world).taskId, 'coffee-service');

  result = Coffee.advanceMission(result.world, 'To go, please.');
  assert.equal(result.accepted, true);
  world = result.world;
  assert.equal(Coffee.nextMissionStep(world).taskId, 'coffee-thanks');
  assert.equal(Coffee.nextPrompt(world), 'Here’s your large americano to go. Enjoy!');

  result = Coffee.advanceMission(world, 'Thank you.');
  assert.equal(result.accepted, true);
  assert.equal(result.world.stage, 'complete');
  assert.equal(Coffee.missionComplete(result.world), true);
});

test('help, questions, negated choices and ambiguous alternatives never mutate a mission order', () => {
  const initial = Coffee.missionInitial('C04');
  for (const [utterance, reason, help] of [
    ['Could you say that again?', 'help', 'repeat'],
    ['什么意思', 'help', 'meaning'],
    ['How do I say it?', 'help', 'example'],
    ['Latte or americano', 'ambiguous', null],
    ['For here or to go?', 'question', null],
    ['I do not want a latte.', 'no-decision', null],
    ["I don't want a latte or an americano.", 'no-decision', null],
    ["I don't want small or large.", 'no-decision', null],
    ['Yes, please.', 'no-decision', null],
  ]) {
    const result = Coffee.advanceMission(initial, utterance);
    assert.equal(result.accepted, false, utterance);
    assert.equal(result.reason, reason, utterance);
    assert.equal(result.help, help, utterance);
    assert.deepEqual([result.world.drink, result.world.size, result.world.service], [null, null, null], utterance);
    assert.equal(result.world.revision, 0, utterance);
  }
});

test('a vague yes and a Chinese meta-question cannot answer the pending C01 size choice', () => {
  const drink = Coffee.advanceMission(Coffee.missionInitial('C01'), 'Americano.');
  assert.equal(drink.accepted, true);
  assert.equal(drink.nextStep.taskId, 'coffee-size');
  assert.equal(drink.prompt, 'Would you like a small or a large americano?');

  const yes = Coffee.advanceMission(drink.world, 'Yes.');
  assert.equal(yes.accepted, false);
  assert.equal(yes.reason, 'no-decision');
  assert.equal(yes.world.revision, drink.world.revision);
  assert.equal(yes.world.size, null);
  assert.equal(yes.prompt, 'Would you like a small or a large americano?');

  const metaQuestion = Coffee.advanceMission(drink.world, '这问题你问过了吗？');
  assert.equal(metaQuestion.accepted, false);
  assert.equal(metaQuestion.reason, 'question');
  assert.equal(metaQuestion.world.revision, drink.world.revision);
  assert.equal(metaQuestion.world.size, null);
  assert.equal(metaQuestion.prompt, 'Would you like a small or a large americano?');
});

test('C03 completes only after the wrong delivered size is repaired and the learner responds', () => {
  const initial = Coffee.missionInitial('C03');
  assert.equal(Coffee.missionComplete(initial), false);
  const noticed = Coffee.advanceMission(initial, 'No, this is wrong.');
  assert.equal(noticed.reason, 'repair-needs-correct-value');
  assert.equal(noticed.prompt, 'What size did you order?');
  assert.equal(noticed.world.stage, 'repair');
  const twoTurnRepair = Coffee.advanceMission(noticed.world, 'Small, please.');
  assert.equal(twoTurnRepair.reason, 'delivery-repaired');
  let result = Coffee.advanceMission(initial, 'This is large.');
  assert.equal(result.accepted, false);
  assert.equal(result.world.stage, 'repair');
  result = Coffee.advanceMission(initial, 'Sorry, I ordered a small.');
  assert.equal(result.accepted, true);
  assert.equal(result.reason, 'delivery-repaired');
  assert.equal(result.world.delivered.size, 'small');
  assert.equal(result.world.repair.resolved, true);
  assert.equal(result.world.repair.required, false);
  assert.deepEqual({ field: result.world.repair.field, expected: result.world.repair.expected, actual: result.world.repair.actual },
    { field: 'size', expected: 'small', actual: 'large' }, 'resolved repair keeps the auditable before/after facts');
  assert.equal(result.world.stage, 'handover');
  assert.equal(Coffee.missionComplete(result.world), false);
  const complete = Coffee.advanceMission(result.world, '谢谢');
  assert.equal(complete.reason, 'mission-complete');
  assert.equal(complete.world.received, true);
  assert.equal(Coffee.missionComplete(complete.world), true);

  const naturalRepair = Coffee.advanceMission(initial, 'Sorry, it should be smaller.');
  assert.equal(naturalRepair.reason, 'delivery-repaired');
  assert.equal(naturalRepair.world.delivered.size, 'small');
});

test('C03 separates the ordered size from the delivered size in a complete repair sentence', () => {
  for (const utterance of [
    'I ordered a small, but this is large.',
    '我点的是小杯，但这是大杯。',
    '我要的是小杯，不过拿到的是大杯。',
  ]) {
    const result = Coffee.advanceMission(Coffee.missionInitial('C03'), utterance);
    assert.equal(result.accepted, true, utterance);
    assert.equal(result.reason, 'delivery-repaired', utterance);
    assert.deepEqual(result.interpretation.intendedSlots, { size: 'small' }, utterance);
    assert.deepEqual(result.interpretation.observedSlots, { size: 'large' }, utterance);
    assert.equal(result.world.delivered.size, 'small', utterance);
    assert.equal(result.world.repair.resolved, true, utterance);
    assert.equal(result.world.stage, 'handover', utterance);
  }
});

test('a named drink followed by explicit rejection never becomes the C01 order', () => {
  for (const utterance of ['Latte is not what I want.', '拿铁不是我想要的。']) {
    const result = Coffee.advanceMission(Coffee.missionInitial('C01'), utterance);
    assert.equal(result.accepted, false, utterance);
    assert.equal(result.handled, true, utterance);
    assert.equal(result.reason, 'no-decision', utterance);
    assert.equal(result.world.drink, null, utterance);
    assert.equal(result.world.revision, 0, utterance);
    assert.equal(result.prompt, 'Would you like a latte or an americano?', utterance);
  }
});

test('independent variants use fixed allowed facts and never accept invented values', () => {
  const state = Coffee.missionInitial('C04', 'C04-large-americano-here');
  const sanitized = Coffee.normalizeMissionWorld({ ...state, drink: 'mocha', size: 'medium', service: 'delivery', received: true,
    target: { drink: 'latte', size: 'small', service: 'to-go' } });
  assert.deepEqual([sanitized.drink, sanitized.size, sanitized.service, sanitized.received], [null, null, null, false]);
  assert.deepEqual(sanitized.target, { drink: 'americano', size: 'large', service: 'here' }, 'target is catalog data, not caller data');
  const resumedMismatch = Coffee.normalizeMissionWorld({ ...state, drink: 'americano', size: 'large', service: 'to-go', received: true });
  assert.deepEqual([resumedMismatch.drink, resumedMismatch.size, resumedMismatch.service, resumedMismatch.received],
    ['americano', 'large', null, false], 'stale conflicting progress reopens only the changed target field');
  const forgedRepair = Coffee.normalizeMissionWorld({ ...Coffee.missionInitial('C03'), repair: { resolved: true } });
  assert.equal(forgedRepair.stage, 'repair', 'a flag alone cannot invent a corrected delivery');
  let result = Coffee.advanceMission(state, 'A medium mocha with oat milk, please.');
  assert.equal(result.accepted, false);
  assert.deepEqual([result.world.drink, result.world.size, result.world.service], [null, null, null]);
  result = Coffee.advanceMission(state, 'A large americano for here, please.');
  assert.equal(result.accepted, true);
  assert.equal(result.world.stage, 'handover');
  assert.equal(Coffee.compareOrder(result.world).targetMatches, true);
  assert.match(Coffee.missionFacts(result.world), /Mission: C04\/C04-large-americano-here.*Stage: handover/);
});

test('mission turns are immutable, revision checked and replay safe', () => {
  assert.equal(Coffee.normalizeMissionWorld(null), null);
  assert.equal(Coffee.advanceMission(null, 'Latte.', { eventId: 'late-turn', expectedRevision: 0 }).reason, 'unknown-mission');
  const initial = Coffee.missionInitial('C01');
  const first = Coffee.advanceMission(initial, 'Latte.', { eventId: 'turn-1', expectedRevision: 0 });
  assert.equal(first.world.revision, 1);
  assert.deepEqual(initial, Coffee.missionInitial('C01'));
  const replay = Coffee.advanceMission(first.world, 'Americano.', { eventId: 'turn-1', expectedRevision: 1 });
  assert.equal(replay.reason, 'replayed-event');
  assert.equal(replay.world.drink, 'latte');
  const stale = Coffee.advanceMission(first.world, 'Large.', { eventId: 'turn-2', expectedRevision: 0 });
  assert.equal(stale.reason, 'stale-state');
  assert.equal(stale.world.size, null);
  const valid = Coffee.advanceMission(first.world, 'Large.', { eventId: 'turn-2', expectedRevision: 1 });
  assert.equal(valid.accepted, true);
  assert.equal(valid.world.size, 'large');
  assert.equal(valid.world.revision, 2);

  let longRun = Coffee.advanceMission(Coffee.missionInitial('C01'), 'A small latte to go.', { eventId: 'oldest' }).world;
  for (let index = 0; index < 40; index += 1) {
    const drink = index % 2 ? 'latte' : 'americano';
    longRun = Coffee.advanceMission(longRun, `Actually, make that ${drink}.`, { eventId: `change-${index}` }).world;
  }
  const oldReplay = Coffee.advanceMission(longRun, 'Actually, make that americano.', { eventId: 'oldest' });
  assert.equal(oldReplay.reason, 'replayed-event', 'an old event stays idempotent after a long correction history');
});

function feedbackHarness(body, parsed = {}, configured = false) {
  const source = fs.readFileSync(require.resolve('./server.js'), 'utf8');
  const responses = [], requests = [];
  const context = vm.createContext({ Coffee, Breakfast: require('./breakfast'), AbortController, setTimeout, clearTimeout,
    process: { env: configured ? { DEEPSEEK_API_KEY: 'test-only' } : {} }, console: { error() {} },
    readJson: async () => body,
    sendJson: (_response, status, payload) => { responses.push({ status, payload }); },
    fetch: async (_url, options) => { requests.push(JSON.parse(options.body)); return { ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(parsed) } }] }) }; },
  });
  vm.runInContext([
    source.match(/^const SCENE_GOALS = \{[^]*?^\};/m)[0],
    source.match(/^function cleanText\([^]*?^\}$/m)[0],
    source.match(/^async function handleLanguageFeedback\([^]*?^\}$/m)[0],
  ].join('\n'), context);
  return { run: () => context.handleLanguageFeedback({}, {}), responses, requests };
}

test('backend accepts an explicit coffee order without an external scoring request', async () => {
  const h = feedbackHarness({ sceneId: 'coffee', taskId: 'coffee-order', coffee: Coffee.initial(),
    question: Coffee.promptFor('coffee-order'), answer: 'Could I get an americano?' });
  await h.run();
  assert.equal(h.responses[0].status, 200);
  assert.equal(h.responses[0].payload.choice, 'americano');
  assert.equal(h.responses[0].payload.meaning_valid, true);
  assert.equal(h.requests.length, 0);
});

test('backend does not grade a help question or let model output skip a coffee step', async () => {
  const help = feedbackHarness({ sceneId: 'coffee', taskId: 'coffee-order', coffee: Coffee.initial(),
    question: Coffee.promptFor('coffee-order'), answer: 'What does latte mean?' });
  await help.run();
  assert.equal(help.responses[0].payload.meaning_valid, false);
  assert.equal(help.requests.length, 0);
  const skipped = feedbackHarness({ sceneId: 'coffee', taskId: 'coffee-size', coffee: Coffee.initial(),
    question: Coffee.promptFor('coffee-size'), answer: 'The smaller option, please.' }, { meaning_valid: true, choice: 'small' }, true);
  await skipped.run();
  assert.equal(skipped.responses[0].payload.meaning_valid, false);
  assert.equal(skipped.responses[0].payload.choice, null);
});

test('backend cannot turn a bare yes into a coffee choice through model scoring', async () => {
  const h = feedbackHarness({ sceneId: 'coffee', taskId: 'coffee-order', coffee: Coffee.initial(),
    question: 'Would you like a latte?', answer: 'Yes, please.' }, { meaning_valid: true, choice: 'latte' }, true);
  await h.run();
  assert.equal(h.responses[0].payload.meaning_valid, false);
  assert.equal(h.responses[0].payload.choice, null);
  assert.equal(h.requests.length, 0);
});

test('backend includes coffee state and constrains a natural choice to the current step', async () => {
  const h = feedbackHarness({ sceneId: 'coffee', taskId: 'coffee-service', coffee: sized(),
    question: Coffee.promptFor('coffee-service'), answer: 'I will take it with me.' }, { meaning_valid: true, choice: 'to-go' }, true);
  await h.run();
  assert.equal(h.responses[0].payload.choice, 'to-go');
  assert.equal(h.responses[0].payload.meaning_valid, true);
  assert.match(h.requests[0].messages[1].content, /Coffee world: Chosen coffee: latte\. Size: small/);
});

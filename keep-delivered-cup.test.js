const test = require('node:test');
const assert = require('node:assert/strict');
const Coffee = require('./coffee');

function reply(text, question) {
  const world = Coffee.missionInitial('C03');
  return Coffee.advanceMission(world, text, { question: question || Coffee.nextPrompt(world), eventId: 'choice-1' });
}

test('keeping the actual large cup is a valid choice, followed by a normal goodbye', () => {
  for (const text of ['Large.', 'Large please.', 'A large one.', 'I want large', 'I want a large one',
    "I'll keep the large one", 'I will keep the large cup', 'Could I have the large cup?',
    'Large is fine', 'This is fine', "I'll keep it", '大杯', '我就要大杯', '大杯就行', '大杯也可以']) {
    const result = reply(text);
    assert.equal(result.reason, 'delivery-accepted', text);
    assert.equal(result.accepted, true, text);
    assert.equal(result.world.stage, 'handover', text);
    assert.equal(result.world.size, 'large', text);
    assert.equal(result.world.delivered.size, 'large', text);
    assert.equal(result.world.acceptedAsDelivered, true, text);
    assert.equal(result.comparison.repairRequired, false, text);
    assert.deepEqual(result.changedFields, [], 'keeping a cup does not practise correcting its size');
    assert.deepEqual(Coffee.normalizeMissionWorld(result.world), result.world, text);
    const done = Coffee.advanceMission(result.world, 'Thanks.', { eventId: 'thanks-2' });
    assert.equal(Coffee.missionComplete(done.world), true, text);
    assert.equal(Coffee.advanceMission(done.world, 'You too.').world.stage, 'complete', text);
    assert.deepEqual(Coffee.advanceMission(result.world, text, { eventId: 'choice-1' }).world, result.world);
  }
});

test('an explicit keep decision with thanks does not require the guest to thank Mia again', () => {
  for (const text of ["I'll keep the large one, thanks.", 'Large, thank you.', '大杯，谢谢']) {
    const result = reply(text);
    assert.equal(result.reason, 'delivery-accepted', text);
    assert.equal(Coffee.missionComplete(result.world), true, text);
    assert.deepEqual(result.changedFields, ['received'], text);
    assert.equal(result.world.size, 'large', text);
  }
});

test('a yes to a single keep-cup offer accepts the delivered cup', () => {
  for (const question of ['Would you like to keep the large cup?', 'Is everything okay?']) {
    const result = reply('Yes.', question);
    assert.equal(result.reason, 'delivery-accepted', question);
    assert.equal(result.world.size, 'large', question);
  }
  for (const question of ['Would you like small or large?', 'Do you usually like large coffee?',
    "You don't want to keep the large cup?", 'Would you like to keep the small cup?']) {
    assert.equal(reply('Yes.', question).world.stage, 'repair', question);
  }
});

test('descriptions, objections, questions, uncertainty and gratitude do not accept a wrong cup', () => {
  for (const text of ['This is large.', '这是大杯', 'You gave me large.', 'The cup is large.',
    "I don't want large.", 'Large is too big.', 'This is too large.', '大杯太大了',
    'Is this large?', 'Large?', 'Why did you give me large?', '大杯吗',
    'Maybe large.', "I'm not sure, large?", 'Thanks.', 'Thank you.', 'You too.',
    'I want a large americano.', 'Large for here.', "I won't keep the large one."] ) {
    const result = reply(text);
    assert.equal(result.accepted, false, text);
    assert.equal(result.world.stage, 'repair', text);
    assert.equal(result.world.size, 'small', text);
    assert.equal(result.world.acceptedAsDelivered, undefined, text);
  }
  for (const question of ['What size is this?', 'Is this cup large?', '这杯是什么杯型？']) {
    assert.equal(reply('Large.', question).world.stage, 'repair', question);
  }
});

test('asking for the original small cup still resolves the actual delivery mismatch', () => {
  for (const text of ['Small.', 'I wanted small but this is large.', 'No problem, but I want small.',
    '没关系但我想要小杯', "Didn't I say small?"]) {
    const result = reply(text);
    assert.equal(result.reason, 'delivery-repaired', text);
    assert.equal(result.world.stage, 'handover', text);
    assert.equal(result.world.delivered.size, 'small', text);
    assert.equal(result.world.acceptedAsDelivered, undefined, text);
    assert.deepEqual(result.changedFields, ['delivered.size'], text);
  }
});

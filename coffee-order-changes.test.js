const test = require('node:test');
const assert = require('node:assert/strict');
const Coffee = require('./coffee');

const order = (text = 'A small latte.') => Coffee.advanceMission(Coffee.missionInitial('C01'), text).world;

for (const answer of [
  'I want a large one.', 'Can I have a large latte?', "I'd like a large one.",
  "I'll take a large one.", 'Large, please.', 'The large one, please.', '我要大杯',
]) {
  test(`a clear new request changes the size without a special correction phrase: ${answer}`, () => {
    const before = order();
    const result = Coffee.advanceMission(before, answer, { question: 'Is that for here or to go?' });
    assert.equal(result.accepted, true);
    assert.equal(result.reason, 'order-corrected');
    assert.equal(result.world.size, 'large');
    assert.equal(result.world.drink, 'latte');
    assert.equal(result.world.service, null);
    assert.deepEqual(result.changedFields, ['size']);
    assert.match(result.prompt, /large/);
    assert.equal(result.nextStep.taskId, 'coffee-service');
    assert.equal(before.size, 'small');
    const served = Coffee.advanceMission(result.world, 'For here.');
    assert.equal(served.world.delivered.size, 'large');
    assert.equal(Coffee.advanceMission(served.world, 'Thanks.').world.stage, 'complete');
  });
}

test('changing a drink preserves size and service already chosen', () => {
  const before = order('A small latte for here.');
  const result = Coffee.advanceMission(before, 'Can I have an americano, please?');
  assert.equal(result.accepted, true);
  assert.deepEqual(result.changedFields, ['drink']);
  assert.deepEqual([result.world.drink, result.world.size, result.world.service], ['americano', 'small', 'here']);
  assert.equal(result.world.delivered.drink, 'americano');
});

test('questions, stories, bare conflicting mentions and ambiguous requests cannot silently change the order', () => {
  const before = order();
  for (const answer of [
    'How large is the large cup?', 'I had a large latte yesterday.',
    'Large.', 'A large one.', 'I want a small or large latte.',
    'Can I have a small or large latte?', 'I am not sure, maybe large.',
    "I don't want a large one.", 'I want to talk about large coffees.',
    'I want to know how large the cup is.', 'Can I have a look at the large cup?',
    'I would like to know what americano means.', 'I want a large one next time.',
    'I want a large coffee tomorrow.', '我要问一下大杯有多大',
    '请给我解释一下大杯', '我要讲一个关于大杯拿铁的故事',
  ]) {
    const result = Coffee.advanceMission(before, answer, { question: 'Is that for here or to go?' });
    assert.equal(result.accepted, false, answer);
    assert.deepEqual(result.world, before, answer);
  }
});

test('a preference after a small-talk question stays conversation', () => {
  const before = order();
  const result = Coffee.advanceMission(before, 'I like large americanos.', { question: 'What do you usually drink?' });
  assert.equal(result.reason, 'conversation');
  assert.deepEqual(result.world, before);
});

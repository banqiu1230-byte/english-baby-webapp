const test = require('node:test');
const assert = require('node:assert/strict');
const Coffee = require('./coffee');

const americano = () => Coffee.advanceMission(Coffee.missionInitial('C01'), 'Americano.').world;
const largeOrder = () => Coffee.advanceMission(americano(), 'Large for here.').world;

test('an unchosen size cannot be confirmed by a free-form character reply', () => {
  const world = americano();
  for (const reply of ['Small, got it.', 'Got it, a small americano.', 'Okay. A small americano.',
    'Small. Got it.', 'You chose a small americano.', "You've selected a small americano.",
    '好的，小杯。', '小杯，记下了。', '已经给你选了小杯。']) {
    assert.equal(Coffee.replyContradictsOrder(reply, world), true, reply);
  }
  assert.equal(world.size, null, 'the guard never mutates the order');
});

test('confirmation must match every stated field of the actual order', () => {
  const world = largeOrder();
  for (const reply of ['Small, got it.', 'Okay. A large latte.', 'To go. Okay.',
    'You ordered a small americano for here.', "I'll make a large americano to go.",
    '好的，大杯拿铁。', '好的，外带。', '你选的是小杯。']) {
    assert.equal(Coffee.replyContradictsOrder(reply, world), true, reply);
  }
  for (const reply of ['Large, got it.', 'Okay. A large americano.', 'For here. Okay.',
    'You chose a large americano for here.', '好的，大杯美式堂食。',
    'You chose large, not small.']) {
    assert.equal(Coffee.replyContradictsOrder(reply, world), false, reply);
  }
});

test('a task target is not evidence that the learner has made that choice', () => {
  const world = Coffee.missionInitial('C04', 'C04-small-americano-here');
  assert.equal(world.target.size, 'small');
  assert.equal(Coffee.replyContradictsOrder('Small, got it.', world), true);
  assert.equal(Coffee.replyContradictsOrder('Okay. An americano.', world), true);
  assert.equal(Coffee.replyContradictsOrder('For here. Okay.', world), true);
});

test('questions, option explanations and answer demonstrations remain available', () => {
  const world = americano();
  for (const reply of ['Would you like small or large?', 'Would you like a small coffee',
    'Small means 小杯.', 'Okay. Small means 小杯.', 'Small is the word for 小杯.',
    'You can say "Small, please."', 'For example, say "A small americano, please."',
    'Do you mean small?', '小杯还是大杯？', '小杯的意思是 small。',
    '你可以说：小杯。', 'You have not chosen small yet.', '杯型还没确认，可以选小杯或大杯。']) {
    assert.equal(Coffee.replyContradictsOrder(reply, world), false, reply);
  }
});

test('a valid question does not conceal a separate false confirmation', () => {
  const world = americano();
  assert.equal(Coffee.replyContradictsOrder('Would you like small or large? Small, got it.', world), true);
  assert.equal(Coffee.replyContradictsOrder('Small, got it. Is that for here?', world), true);
});

test('handover descriptions use the visible delivery, including the intentional C03 mistake', () => {
  const repair = Coffee.missionInitial('C03');
  assert.equal(repair.size, 'small');
  assert.equal(repair.delivered.size, 'large');
  assert.equal(Coffee.replyContradictsOrder('Here is your large latte to go. Is everything okay?', repair), false);
  assert.equal(Coffee.replyContradictsOrder('Here’s your small latte to go.', repair), true);
  assert.equal(Coffee.replyContradictsOrder('You ordered a small latte to go.', repair), false);
  assert.equal(Coffee.replyContradictsOrder('You ordered a large latte to go.', repair), true);
  assert.equal(Coffee.replyContradictsOrder('Here is your large americano for here. Enjoy!', largeOrder()), false);
});

test('ordinary replies and absent content are not guessed into order claims', () => {
  for (const reply of ['', null, 'Take your time.', 'I can help.', 'Small.', 'No problem.'])
    assert.equal(Coffee.replyContradictsOrder(reply, americano()), false, String(reply));
  assert.equal(Coffee.replyContradictsOrder('Okay. A latte.', {}), true);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('./breakfast');
test('drink preference accepts short and natural beginner answers', () => {
  for (const text of ['Milk.', 'Milk, please.', 'I would like milk.', '牛奶']) assert.equal(B.choiceFromText('breakfast-drink', text), 'milk');
  assert.equal(B.choiceFromText('breakfast-drink', "I'd like water please."), 'water');
});
test('questions, uncertainty and unrelated conversation do not select a drink', () => {
  for (const text of ['What does milk mean?', 'Milk?', 'I do not want milk.', 'Milk or water?', 'I like cats.', '我不懂牛奶什么意思'])
    assert.equal(B.choiceFromText('breakfast-drink', text), null);
});
test('yes and no are tied to the actual more question', () => {
  assert.equal(B.choiceFromText('breakfast-more', 'Yes.', 'More?'), 'more');
  assert.equal(B.choiceFromText('breakfast-more', 'No, thanks.', 'More milk?'), 'enough');
  assert.equal(B.choiceFromText('breakfast-more', 'Yes.', 'Do you have a cat?'), null);
  assert.equal(B.choiceFromText('breakfast-more', 'Enough.'), 'enough');
});
test('world state is sequential, immutable and idempotent', () => {
  const empty = B.initial();
  assert.equal(B.apply(empty, 'breakfast-more', 'more'), empty);
  const drink = B.apply(empty, 'breakfast-drink', 'water');
  const cup = B.apply(drink, 'breakfast-cup', 'place');
  const done = B.apply(cup, 'breakfast-more', 'enough');
  assert.equal(empty.drink, null); assert.equal(done.drink, 'water'); assert.equal(done.cupPlaced, true);
  assert.equal(B.apply(done, 'breakfast-more', 'more'), done);
  assert.notDeepEqual(done, B.apply(cup, 'breakfast-more', 'more'));
});
test('physical cooperation does not demand an artificial second naming answer', () => {
  assert.ok(B.tasks.every(task => task.requiresSpeech === false));
  assert.ok(B.tasks.every(task => !task.question));
});

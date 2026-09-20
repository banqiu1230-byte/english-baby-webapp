const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('./breakfast');
test('character questions are complete and name the chosen drink', () => {
  assert.equal(B.promptFor('breakfast-drink'), 'Do you want milk or water?');
  assert.equal(B.promptFor('breakfast-more', {drink:'milk'}), 'Do you want more milk?');
  assert.equal(B.promptFor('breakfast-more', {drink:'water'}), 'Do you want more water?');
  assert.equal(B.promptFor('breakfast-more'), 'Do you want more to drink?');
  assert.equal(B.choiceFromText('breakfast-more', 'No, thanks.', B.promptFor('breakfast-more', {drink:'water'})), 'enough');
});
test('drink preference accepts short and natural beginner answers', () => {
  for (const text of ['Milk.', 'Milk, please.', 'I would like milk.', '牛奶']) assert.equal(B.choiceFromText('breakfast-drink', text), 'milk');
  assert.equal(B.choiceFromText('breakfast-drink', "I'd like water please."), 'water');
});
test('a spoken offering hands over the cup without a physical action', () => {
  for (const text of ['Here.', 'Here you are.', 'Here you go.', '给你'])
    assert.equal(B.choiceFromText('breakfast-cup', text, 'Can I have the cup, please?'), 'place');
  for (const text of ['What does cup mean?', 'Where is the cup?', 'I do not know'])
    assert.equal(B.choiceFromText('breakfast-cup', text, 'Can I have the cup, please?'), null);
});
test('agreement answers the cup request without requiring an exact model sentence', () => {
  const question = 'Can I have the cup, please?';
  for (const text of ['uh huh yes hear you', 'Uh, sure.', 'Yes.', 'Of course.', 'Sure, here you are.', 'Um, here you go.'])
    assert.equal(B.choiceFromText('breakfast-cup', text, question), 'place', text);
  for (const text of ['No.', 'No, I cannot.', 'Yes, I hear you.', 'I can hear you.', 'Yes, I do not know.',
    'Can I have the cup?', 'What does cup mean?', '我不知道怎么说', 'Yes 我不会说', 'Yes, help me.', 'Wait, please.', 'Here？', 'Yes？'])
    assert.equal(B.choiceFromText('breakfast-cup', text, question), null, text);
  assert.equal(B.choiceFromText('breakfast-cup', 'Yes.', 'Can you hear me?'), null);
  assert.equal(B.choiceFromText('breakfast-cup', 'Sure.', 'Is the cup blue?'), null);
  for (const text of ['Yes.', 'Sure.', 'uh huh yes hear you', 'Yes, I hear you.'])
    assert.equal(B.choiceFromText('breakfast-drink', text, 'Do you want milk or water?'), null, text);
});
test('spoken hesitation does not change breakfast choices or turn uncertainty into success', () => {
  assert.equal(B.choiceFromText('breakfast-drink', 'Um, milk please.'), 'milk');
  assert.equal(B.choiceFromText('breakfast-more', 'Uh, no thanks.', 'Do you want more milk?'), 'enough');
  assert.equal(B.choiceFromText('breakfast-more', 'Well, yes please.', 'Do you want more milk?'), 'more');
  for (const text of ["Uh, I don't know, milk.", 'Milk, but I am not sure.', 'Milk, please explain.', 'Milk 我不明白'])
    assert.equal(B.choiceFromText('breakfast-drink', text), null, text);
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
test('every breakfast step advances through a language response', () => {
  assert.ok(B.tasks.every(task => task.interaction === 'speech'));
  assert.ok(B.tasks.every(task => task.requiresAction === false));
  assert.ok(B.tasks.every(task => task.requiresSpeech === true));
  assert.ok(B.tasks.every(task => !task.question));
});

// The visible beginner example must also work when the voice service is unavailable.
test('the shown more example remains a valid beginner decision', () => {
  assert.equal(B.choiceFromText('breakfast-more', 'A little more, please.', 'Do you want more milk?'), 'more');
});

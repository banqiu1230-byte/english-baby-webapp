const test = require('node:test');
const assert = require('node:assert/strict');
const {
  gentleRecast,
  matchesTask,
  requirementsMet,
  transitionDwell,
  transitionReplyReplacement,
} = require('./dialogue-rules');
const { isConversationOnly } = require('./dialogue-rules');

test('social context never turns a mentioned object or short answer into a service decision', () => {
  for (const [answer, question] of [
    ['Milk.', 'What do you usually drink?'], ['Coffee.', 'What is your favorite drink?'],
    ['Yes.', 'Do you like your work?'], ["Let's just chat.", 'May I see your ticket?'],
    ['I had water yesterday.', 'Do you want milk or water?'],
  ]) assert.equal(isConversationOnly(answer, question), true, answer);
  for (const [answer, question] of [
    ['Milk.', 'Do you want milk or water?'], ['Yes.', 'Is this your bag?'],
    ['Can I have milk?', 'What do you usually drink?'], ['My name is Li.', 'How are you?'],
  ]) assert.equal(isConversationOnly(answer, question), false, answer);
});

test('an utterance only advances the task it actually satisfies', () => {
  assert.equal(matchesTask('apple', 'It is an apple.'), true);
  assert.equal(matchesTask('apple', 'Okay.'), false);
  assert.equal(matchesTask('plate', 'I found the milk.'), false);
  assert.equal(matchesTask('bag', 'Yes, it is mine.'), true);
});

test('questions and negative phrases do not falsely complete a practical goal', () => {
  assert.equal(matchesTask('milk', 'Where is the milk?'), false);
  assert.equal(matchesTask('milk', 'I cannot find the milk.'), false);
  assert.equal(matchesTask('office-purpose', 'I cannot see anyone.'), false);
  assert.equal(matchesTask('gate-a12', 'I cannot find it.'), false);
  assert.equal(matchesTask('ticket', 'I am here.'), false);
});

test('short beginner answers still count when they clearly name the goal', () => {
  assert.equal(matchesTask('milk', 'Milk.'), true);
  assert.equal(matchesTask('gate-a12', 'A12.'), true);
  assert.equal(matchesTask('ticket', 'Here you are.'), true);
  assert.equal(matchesTask('office-purpose', 'Maya.'), true);
  assert.equal(matchesTask('office-signin', 'Li.'), true);
  assert.equal(matchesTask('office-signin', 'My name is Li.'), true);
  assert.equal(matchesTask('office-signin', 'Hello there.'), false);
});

test('natural ownership confirmations and denials survive spoken hesitation', () => {
  for (const text of [
    "Uh nothing yes it's my bag", "Yes, it's my bag.", 'Um, it is mine.',
    "Well, that's my bag, thanks.", 'No.', "No, it's not my bag.",
    "Uh, no, it isn't mine.", "This isn't my bag.",
  ]) assert.equal(matchesTask('bag', text), true, text);
  for (const text of [
    'Nothing.', "Is it my bag?", "Yes, I don't know.", 'Yes, I hear you.',
    'Not sure if it is mine.', "Yes, it's my ticket.", "我不懂 yes it's my bag",
    "Yes, it's my bag but it is not mine.", 'My bag is heavy.',
    "No, it's my bag.", "Yes, it isn't mine.", "It's not not mine.",
    "No, it is not not my bag.", "Maybe it's mine.", "Yes？",
  ]) assert.equal(matchesTask('bag', text), false, text);
});

test('edge fillers never remove negation, uncertainty or a request for help', () => {
  assert.equal(matchesTask('milk', 'Um, milk please.'), true);
  assert.equal(matchesTask('gate-a12', 'Uh, gate A12.'), true);
  assert.equal(matchesTask('ticket', 'Well, here you are.'), true);
  for (const text of ['Uh, milk?', 'Um, not milk.', 'Milk 我不知道怎么说', 'Um, what does milk mean?'])
    assert.equal(matchesTask('milk', text), false, text);
  for (const text of ['Uh', 'Um', 'Hmm']) assert.equal(matchesTask('office-signin', text), false, text);
});

test('agreement never names an object, person or destination in another task', () => {
  for (const taskId of ['ticket', 'gate-a12', 'office-purpose', 'office-signin', 'office-greeting']) {
    for (const text of ['Yes.', 'Yep.', 'Nope.', 'Uh huh yes hear you', 'Yes, I hear you.'])
      assert.equal(matchesTask(taskId, text), false, `${taskId}: ${text}`);
  }
  for (const text of ['Maybe.', 'Perhaps.', 'Well.', 'Oh.'])
    assert.equal(matchesTask('office-signin', text), false, text);
});

test('physical tasks advance only after speech and action', () => {
  const evidence = { needsAction: true, needsSpeech: true };
  assert.equal(requirementsMet({ ...evidence, actionDone: true, speechDone: false }), false);
  assert.equal(requirementsMet({ ...evidence, actionDone: false, speechDone: true }), false);
  assert.equal(requirementsMet({ ...evidence, actionDone: true, speechDone: true }), true);
});

test('transition questions leave a real answer window', () => {
  assert.equal(transitionDwell('Okay.'), 2600);
  assert.equal(transitionDwell('Do you want to keep going?'), 12000);
});

test('transition replies cannot end a scene early or open a competing topic', () => {
  assert.equal(transitionReplyReplacement({
    text: 'Nice job, that’s all for now.',
    stage: 'task-complete',
    hasMoreTasks: true,
  }), 'Good. Let’s keep going.');
  assert.equal(transitionReplyReplacement({
    text: 'What do you want to talk about?',
    stage: 'task-complete',
    hasMoreTasks: true,
  }), 'Okay. Let’s keep going.');
  assert.equal(transitionReplyReplacement({
    text: 'The milk is here.',
    stage: 'task-complete',
    hasMoreTasks: true,
  }), '');
  assert.equal(transitionReplyReplacement({
    text: 'Would you like a small or a large americano?',
    stage: 'task-complete',
    hasMoreTasks: true,
    taskAcknowledgment: 'Okay. An americano.',
  }), 'Okay. An americano.');
});

test('gentleRecast fixes only small beginner errors with a safe correction', () => {
  assert.equal(gentleRecast('The apple is on your hand.'), 'The apple is in your hand.');
  assert.equal(gentleRecast('I find the milk'), 'I found the milk.');
  assert.equal(gentleRecast('I found the spoon.'), '');
});

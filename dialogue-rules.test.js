const test = require('node:test');
const assert = require('node:assert/strict');
const {
  gentleRecast,
  matchesTask,
  requirementsMet,
  transitionDwell,
  transitionReplyReplacement,
} = require('./dialogue-rules');

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
});

test('gentleRecast fixes only small beginner errors with a safe correction', () => {
  assert.equal(gentleRecast('The apple is on your hand.'), 'The apple is in your hand.');
  assert.equal(gentleRecast('I find the milk'), 'I found the milk.');
  assert.equal(gentleRecast('I found the spoon.'), '');
});

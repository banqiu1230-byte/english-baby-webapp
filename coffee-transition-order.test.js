const test = require('node:test');
const assert = require('node:assert/strict');
const Coffee = require('./coffee');
const { harness } = require('./test-support/voice-harness.cjs');

// Use the actual transcript, scheduler, task-start and order-commit functions.
// Only the DOM, voice transport and clock are replaced; no live mic is used.
function transitionHarness() {
  let h;
  const tasks = Coffee.tasks.map(task => ({ ...task }));
  const goal = taskId => (h.s.sessionGoals[taskId] ||= {});
  h = harness({
    TASK_ADVANCE_DWELL_MS: 1600,
    currentTask: () => ({ ...tasks[h.s.taskIndex],
      prompt: Coffee.promptFor(tasks[h.s.taskIndex].id, h.s.coffee) }),
    currentSceneConfig: () => ({ tasks }),
    currentGoalRecord: () => goal(tasks[h.s.taskIndex].id), goalRecord: goal,
    LumaExperience: {
      checkpoint() {}, taskStarted() {}, noteHelp() {},
      noteAnswer(context, outcome) { h.effects.push({ type: 'evidence', taskId: context.taskId, outcome }); },
    },
    markGoalSpokenFor() {},
    localStorage: { getItem: () => null, setItem() {} },
    saveLearningSession() {},
    syncSubtitleVisibility() {}, syncTaskFocus() {}, syncActionCoach() {}, setApplePosition() {},
    hotspots: [],
    speak(text, { prompt = true } = {}) {
      h.effects.push({ type: 'spoken', text });
      if (prompt) h.s.activeQuestion = text;
      return Promise.resolve(true);
    },
  });
  for (const name of ['appShell', 'toast', 'apple', 'languagePanel']) h.c[name] = h.c.document.querySelector(name);
  Object.assign(h.s, {
    selectedScene: 'coffee', coffeeMissionId: 'C01', taskIndex: 0,
    coffee: Coffee.advanceMission(Coffee.missionInitial('C01'), 'Americano.').world,
    stage: 'task-complete', speechDone: true, actionDone: true, duplexReady: true,
    activeQuestion: 'Would you like a latte or an americano?',
    coveredGoals: new Set(['coffee-order']),
    dialogueHistory: [{ id: 1, revision: 1, speaker: 'luma', text: 'Okay. An americano.', taskId: 'coffee-order' }],
    messageSerial: 1,
  });
  goal('coffee-order').meaningAccepted = true;
  h.load('coffeeTaskForChangedField', 'recordCoffeeMissionEvidence', 'commitCoffeeChoice',
    'applyDynamicFeedback', 'requestLanguageFeedback', 'latestFollowupText', 'scheduleTaskAdvance',
    'clearReviewTransition', 'scheduleReview', 'consumeTransitionUtterance', 'taskHasAction',
    'startTask', 'scheduleTaskPrompt', 'taskRequirementsMet', 'completeMultimodalTask', 'safeCharacterReply');
  return h;
}

function say(h, text, id = text) {
  const turn = h.c.acceptTranscriptEvent({ item_id: id }, { allowStart: true });
  assert.ok(turn);
  h.c.finalizeLearnerTranscript(text, { turn });
}

for (const correction of ['Actually, a latte, please.', 'Can I have a latte?', 'Latte, please.']) {
test(`changing a confirmed drink during its acknowledgment accepts ${JSON.stringify(correction)} and asks for the missing size`, async () => {
  const h = transitionHarness();
  h.c.scheduleTaskAdvance(1);
  say(h, correction);
  await h.advance(1900);
  assert.equal(h.s.coffee.drink, 'latte');
  assert.equal(h.s.coffee.size, null);
  assert.equal(h.s.taskIndex, 1);
  assert.equal(h.s.stage, 'active');
  assert.equal(h.s.conversationFocus, 'task');
  assert.equal(h.s.pendingTransitionUtterance, null);
  assert.equal(h.s.dialogueHistory.find(item => item.speaker === 'user').status, '已确认');
  assert.match(h.effects.find(item => item.type === 'spoken').text, /latte.*small.*large.*latte/i);
  assert.equal(h.s.dialogueHistory.some(item => /small.*large.*americano/i.test(item.text)), false,
    'do not publish an obsolete next question before applying the correction');

  say(h, 'Small.', 'size-after-correction');
  await h.advance(1900);
  assert.equal(h.s.coffee.size, 'small');
  assert.equal(h.s.taskIndex, 2, 'the next real answer continues the visit normally');
});
}

test('an early service detail during the drink acknowledgment is retained while size remains open', async () => {
  const h = transitionHarness();
  say(h, 'For here, please.');
  await h.advance(1900);
  assert.equal(h.s.coffee.service, 'here');
  assert.equal(h.s.coffee.size, null);
  assert.equal(h.s.taskIndex, 1);
  assert.equal(h.s.stage, 'active');
  assert.match(h.effects.find(item => item.type === 'spoken').text, /for here.*small.*large/i);
  say(h, 'Small.', 'remaining-size');
  await h.advance(1900);
  assert.equal(h.s.coffee.size, 'small');
  assert.equal(h.s.taskIndex, 3, 'do not ask the already answered service question again');
});

test('an explicit order correction resumes a transition paused for chat', async () => {
  const h = transitionHarness();
  h.s.conversationFocus = 'chat';
  h.s.activeQuestion = 'How is your day?';
  say(h, 'Actually, change my order to a latte.');
  await h.advance(1900);
  assert.equal(h.s.coffee.drink, 'latte');
  assert.equal(h.s.conversationFocus, 'task');
  assert.equal(h.s.stage, 'active');
  assert.equal(h.s.taskIndex, 1);
});

test('preferences and ordinary chat during a transition neither change the order nor force a next question', async () => {
  for (const text of ['I like latte.', 'I had a small latte yesterday.', 'How is your day?']) {
    const h = transitionHarness();
    h.c.scheduleTaskAdvance(1);
    say(h, text);
    h.c.stopSpeechPlayback();
    await h.advance(20000);
    assert.equal(h.s.coffee.drink, 'americano', text);
    assert.equal(h.s.coffee.size, null, text);
    assert.equal(h.s.conversationFocus, 'chat', text);
    assert.equal(h.s.taskIndex, 0, text);
    assert.equal(h.s.pendingTransitionUtterance, null, text);
    assert.equal(h.effects.some(item => item.type === 'evidence' || item.type === 'spoken'), false, text);
  }
});

test('one transition answer can correct a drink and supply the remaining order without repeating either question', async () => {
  const h = transitionHarness();
  say(h, 'Actually, a large latte for here, please.');
  await h.advance(3800);
  assert.equal(h.s.coffee.drink, 'latte');
  assert.equal(h.s.coffee.size, 'large');
  assert.equal(h.s.coffee.service, 'here');
  assert.equal(h.s.taskIndex, 3);
  assert.equal(h.s.stage, 'active');
  assert.equal(h.s.pendingTransitionUtterance, null);
  assert.equal(h.s.dialogueHistory.some(item => /small.*large|for here or to go/i.test(item.text)), false);
});

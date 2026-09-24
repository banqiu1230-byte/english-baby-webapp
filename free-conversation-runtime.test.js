const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { harness, root } = require('./test-support/voice-harness.cjs');
const Breakfast = require('./breakfast');

// Replay the actual transcript, feedback, transition and UI handlers with a
// controlled clock. These are conversation-state checks, not microphone tests.
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const breakfastSource = fs.readFileSync(path.join(root, 'breakfast-ui.js'), 'utf8');
const sceneCases = [
  { scene: 'kitchen', tasks: Breakfast.tasks, answer: 'Milk, please.', choice: 'milk',
    chat: 'I watched a movie last night.' },
  { scene: 'airport', tasks: [
    { id: 'bag', interaction: 'speech', requiresAction: false, prompt: 'Is this your bag?' },
    { id: 'gate-a12', interaction: 'speech', requiresAction: false, prompt: 'Which gate are you going to?' },
  ], answer: "Yes, it's my bag.", chat: 'I watched a movie on the flight.' },
  { scene: 'office', tasks: [
    { id: 'office-purpose', interaction: 'speech', requiresAction: false, speaker: '前台', prompt: 'Who are you here to see?' },
    { id: 'office-signin', interaction: 'speech', requiresAction: false, speaker: '前台', prompt: 'What is your name, please?' },
  ], answer: "I'm here to see Maya.", chat: 'I watched a movie last night.' },
];

function sceneHarness(fixture) {
  let h;
  const goal = {};
  const tasks = fixture.tasks.map(task => ({ ...task }));
  h = harness({
    TASK_ADVANCE_DWELL_MS: 2600,
    currentSceneConfig: () => ({ tasks }), currentGoalRecord: () => goal,
    LumaExperience: {
      noteAnswer(context, outcome) { h.effects.push({ type: 'evidence', outcome, answer: context.answer }); },
      noteHelp() {}, noteCharacterLine() {}, checkpoint() {},
    },
    speak: text => { h.effects.push({ type: 'spoken', text }); return Promise.resolve(true); },
    showReview: () => { h.effects.push({ type: 'review' }); h.s.sceneStarted = false; },
    syncCoffeeMissionHud() {},
    fetch: async () => {
      h.effects.push({ type: 'feedback-request' });
      return { ok: true, json: async () => ({ meaning_valid: false }) };
    },
  });
  Object.assign(h.s, {
    selectedScene: fixture.scene, taskIndex: 0, stage: 'active',
    conversationFocus: 'task', speechDone: false, characterPromptDelivered: true,
    activeQuestion: tasks[0].prompt, currentSpeech: tasks[0].prompt,
    coveredGoals: new Set(), breakfast: Breakfast.initial(),
  });
  Object.assign(h.task, tasks[0], { question: undefined });
  for (const name of ['stepFill', 'sceneProgress', 'resetButton', 'toast']) {
    h.c[name] = h.c.document.querySelector(`#${name}`);
  }
  h.c.startTask = index => {
    h.effects.push({ type: 'advanced', index });
    h.s.taskIndex = index; h.s.stage = 'active'; h.s.conversationFocus = 'task';
    h.s.speechDone = false;
    Object.assign(h.task, tasks[index]);
    h.s.activeQuestion = tasks[index].prompt;
  };
  h.c.isBreakfastScene = () => h.s.selectedScene === 'kitchen';
  h.load('latestFollowupText', 'clearTaskAdvance', 'scheduleTaskAdvance',
    'clearReviewTransition', 'scheduleReview', 'transitionReplyReplacement',
    'applyDynamicFeedback', 'requestLanguageFeedback', 'fallbackMeaningFeedback',
    'taskProgress', 'taskHasAction', 'syncSceneProgress');
  const breakfastCommit = breakfastSource.match(/^function commitBreakfastChoice\([^]*?^\}/m);
  assert.ok(breakfastCommit, 'load the real breakfast state mutation');
  vm.runInContext(breakfastCommit[0], h.c);
  return h;
}

function finalTranscript(h, text, id = 'user-turn') {
  const turn = h.c.acceptTranscriptEvent({ item_id: id }, { allowStart: true });
  assert.ok(turn, 'the learner can take the floor');
  h.c.finalizeLearnerTranscript(text, { turn });
  return turn;
}

function feedbackContext(h, text) {
  const message = { id: ++h.s.messageSerial, revision: 1, speaker: 'user', text,
    final: true, taskId: h.task.id };
  h.s.dialogueHistory.push(message);
  return { ...h.c.captureUserTurnContext(), messageId: message.id, revision: 1,
    answer: text, final: true, source: 'voice' };
}

for (const fixture of sceneCases) {
  test(`${fixture.scene}: a follow-up conversation keeps its answer and pauses the next scene beat`, async () => {
    const h = sceneHarness(fixture);
    h.s.stage = 'task-complete'; h.s.speechDone = true;
    h.s.coveredGoals.add(h.task.id);
    h.c.scheduleTaskAdvance(1);
    finalTranscript(h, 'How is your day?');
    assert.equal(h.s.conversationFocus, 'chat');
    assert.equal(h.s.advanceTimer, null);
    assert.equal(h.c.transitionReplyReplacement('Good, thanks! How about you?'), '',
      'the real social reply must not become a canned task acknowledgment');
    h.c.stopSpeechPlayback(); // Simulate the end of the social reply.
    await h.advance(16000);
    assert.equal(h.effects.some(effect => effect.type === 'advanced'), false);
    assert.equal(h.effects.some(effect => effect.type === 'review'), false);
    assert.equal(h.effects.some(effect => effect.type === 'evidence'), false);
    assert.equal(h.s.dialogueHistory.at(-1).text, 'How is your day?');
  });

  test(`${fixture.scene}: an explicitly requested continuation resumes a paused transition`, () => {
    const h = sceneHarness(fixture);
    h.s.stage = 'task-complete'; h.s.speechDone = true;
    h.s.coveredGoals.add(h.task.id); h.s.conversationFocus = 'chat';
    finalTranscript(h, 'Continue, please.');
    assert.equal(h.s.stage, 'active');
    assert.equal(h.s.taskIndex, 1);
    assert.equal(h.s.conversationFocus, 'task');
    assert.deepEqual(h.effects.filter(effect => effect.type === 'advanced'), [{ type: 'advanced', index: 1 }]);
  });

  test(`${fixture.scene}: a late scheduling callback cannot resume a conversation paused by the learner`, async () => {
    const h = sceneHarness(fixture);
    h.s.stage = 'task-complete'; h.s.speechDone = true;
    h.s.coveredGoals.add(h.task.id); h.s.conversationFocus = 'chat';
    h.c.scheduleTaskAdvance(1);
    await h.advance(16000);
    assert.equal(h.effects.some(effect => effect.type === 'advanced'), false);
    assert.equal(h.s.advanceTimer, null, 'paused chat must not leave a polling timer behind');
  });

  test(`${fixture.scene}: ordinary conversation is not recorded as a failed task answer`, async () => {
    const h = sceneHarness(fixture);
    const context = feedbackContext(h, fixture.chat);
    await h.c.requestLanguageFeedback(h.s.activeQuestion, fixture.chat, context);
    assert.equal(h.s.conversationFocus, 'chat');
    assert.equal(h.s.speechDone, false, 'chat does not pretend to complete the hidden objective');
    assert.equal(h.s.coveredGoals.size, 0);
    assert.equal(h.effects.some(effect => effect.type === 'evidence'), false);
    assert.equal(h.effects.some(effect => effect.type === 'scored'), false);
    assert.equal(h.s.idleNudgeTimer, null, 'no unsolicited task coaching during chat');
    assert.doesNotMatch(h.s.dialogueHistory.at(-1).status || '', /未确认|再试|再说|还没确认/);
  });

  test(`${fixture.scene}: a valid scene answer resumes task focus after small talk`, async () => {
    const h = sceneHarness(fixture);
    h.s.conversationFocus = 'chat';
    const context = feedbackContext(h, fixture.answer);
    await h.c.requestLanguageFeedback(h.s.activeQuestion, fixture.answer, context);
    assert.equal(h.s.conversationFocus, 'task');
    assert.equal(h.s.speechDone, true);
    assert.equal(h.s.dialogueHistory.at(-1).taskAccepted, true);
    assert.deepEqual(h.effects.filter(effect => effect.type === 'evidence').map(effect => effect.outcome), ['success']);
    if (fixture.scene === 'kitchen') assert.equal(h.s.breakfast.drink, 'milk');
  });

  test(`${fixture.scene}: finishing the hidden objectives waits for an unanswered NPC question`, async () => {
    const h = sceneHarness(fixture);
    h.s.stage = 'complete'; h.s.speechDone = true;
    h.s.coveredGoals = new Set(fixture.tasks.map(task => task.id));
    h.s.dialogueHistory.push({ speaker: 'luma', text: 'How is your day?', final: true });
    h.c.scheduleReview();
    await h.advance(60000);
    assert.equal(h.effects.some(effect => effect.type === 'review'), false);
    assert.equal(h.s.sceneStarted, true);
    assert.notEqual(h.s.reviewTimer, null);
    finalTranscript(h, 'How is your day?', 'after-completion');
    assert.equal(h.s.conversationFocus, 'chat');
    assert.equal(h.s.dialogueHistory.at(-1).text, 'How is your day?');
    assert.equal(h.c.transitionReplyReplacement('What would you like to talk about?'), '');
  });

  test(`${fixture.scene}: the visible end control opens reflection only when the user clicks it`, () => {
    const h = sceneHarness(fixture);
    const finish = h.c.document.querySelector('#finishConversation');
    let click;
    finish.addEventListener = (event, listener) => { if (event === 'click') click = listener; };
    const binding = appSource.match(/^document\.querySelector\('#finishConversation'\).*addEventListener\('click'.+;$/m);
    assert.ok(binding, 'load the actual end-conversation click binding');
    vm.runInContext(binding[0], h.c);
    h.c.syncSceneProgress();
    assert.equal(finish.hidden, true);
    assert.equal(h.c.resetButton.hidden, false);
    h.s.stage = 'complete';
    h.s.coveredGoals = new Set(fixture.tasks.map(task => task.id));
    h.c.syncSceneProgress();
    assert.equal(finish.hidden, false, 'every completed scene has a reachable end button');
    assert.equal(h.c.resetButton.hidden, true);
    assert.equal(h.effects.some(effect => effect.type === 'review'), false);
    assert.equal(typeof click, 'function');
    click();
    assert.deepEqual(h.effects.filter(effect => effect.type === 'review'), [{ type: 'review' }]);
  });
}

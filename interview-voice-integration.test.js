const test = require('node:test');
const assert = require('node:assert/strict');
const Interview = require('./interview');
const Coffee = require('./coffee');
const { harness } = require('./test-support/voice-harness.cjs');

function interviewHarness(ids = ['interview-background', 'interview-ownership']) {
  const tasks = ids.map(Interview.taskById), goals = {}, evidence = [];
  let h;
  h = harness({ Interview, TASK_ADVANCE_DWELL_MS: 1600,
    currentSceneConfig: () => ({ tasks }),
    currentGoalRecord: () => goals[h.task.id] ||= {},
    LumaExperience: { checkpoint() {}, noteAnswer: (...args) => evidence.push(args), noteHelp() {}, closeHelp() {}, noteCharacterLine() {} },
    saveLearningSession() {},
    speak(text) { h.effects.push({ type: 'spoken', text }); return Promise.resolve(true); },
    startTask(index) { h.effects.push({ type: 'next', index }); h.s.taskIndex = index; h.s.stage = 'active'; Object.assign(h.task, tasks[index]); },
    skipInterviewTopic() { h.effects.push({ type: 'skip' }); },
    finishInterviewPractice() { h.effects.push({ type: 'stop' }); },
    syncSettingsUi() {},
  });
  Object.assign(h.task, tasks[0], { question: tasks[0].prompt });
  Object.assign(h.s, { selectedScene: 'interview', taskIndex: 0, stage: 'active', actionDone: true,
    activeQuestion: tasks[0].prompt, currentSpeech: tasks[0].prompt, interviewMissionId: 'I01',
    coffee: Coffee.missionInitial('C01') });
  h.c.apple = h.c.document.querySelector('apple');
  h.load('taskRequirementsMet', 'safeCharacterReply', 'applyDynamicFeedback',
    'completeMultimodalTask', 'clearReviewTransition', 'scheduleReview', 'latestFollowupText', 'scheduleTaskAdvance',
    'handleConversationSupport');
  return { ...h, goals, evidence };
}
function answerContext(h, text) {
  const message = { id: 1, speaker: 'user', text, revision: 1, final: true, taskId: h.task.id };
  h.s.dialogueHistory = [message]; h.s.messageSerial = 1;
  return { ...h.c.captureUserTurnContext(), messageId: 1, revision: 1, answer: text, final: true, source: 'voice' };
}
function finishReply(h, text = 'Thank you for explaining your approach.') {
  h.s.dialogueHistory.push({ id: ++h.s.messageSerial, speaker: 'luma', text, taskId: h.task.id });
  h.c.clearReplyTimeout();
  h.c.retireExpectedResponse();
  Object.assign(h.s, { awaitingModelReply: false, userTurnActive: false, localSpeechActive: false,
    userTranscriptPending: false, activeVoiceTurn: null, duplexSpeaking: false, duplexAcceptAudio: false });
}

test('an accepted interview answer keeps Alex’s pending response and waits for it before advancing', async () => {
  const h = interviewHarness();
  const coffeeBefore = JSON.stringify(h.s.coffee);
  const context = answerContext(h, 'I am a designer working on customer service flows.');
  h.c.beginExpectedResponse('user', { turnId: 1 });
  h.s.awaitingModelReply = true;
  const expected = h.s.expectedResponse;
  h.c.applyDynamicFeedback({ meaning_valid: true }, context);
  assert.equal(h.s.stage, 'task-complete');
  assert.equal(h.s.expectedResponse, expected, 'meaning feedback must not cancel the interviewer');
  assert.equal(h.s.coveredGoals.has(h.task.id), true);
  assert.equal(h.effects.some(effect => effect.type === 'spoken'), false, 'no canned response replaces Alex');
  assert.equal(JSON.stringify(h.s.coffee), coffeeBefore);
  await h.advance(5000);
  assert.equal(h.effects.some(effect => effect.type === 'next'), false);
  finishReply(h);
  await h.advance(2000);
  assert.equal(h.effects.filter(effect => effect.type === 'next').length, 1);
});

test('the interviewer answers a candidate question before the goodbye topic can start', async () => {
  const h = interviewHarness(['interview-closing-questions', 'interview-closing-goodbye']);
  const context = answerContext(h, 'How do designers and engineers work together?');
  h.c.beginExpectedResponse('user', { turnId: 1 });
  h.s.awaitingModelReply = true;
  h.c.applyDynamicFeedback({ meaning_valid: true }, context);
  const response = 'In a hypothetical team, they might review prototypes together. Is that the collaboration you mean?';
  await h.advance(3000);
  assert.equal(h.effects.some(effect => effect.type === 'next'), false);
  finishReply(h, 'In a hypothetical team, they might review prototypes together.');
  await h.advance(2000);
  assert.equal(h.effects.filter(effect => effect.type === 'next').length, 1);
});

test('an extra detail between interview topics receives a reply and then resumes the single scheduler', async () => {
  const h = interviewHarness();
  Object.assign(h.s, { stage: 'task-complete', speechDone: true, coveredGoals: new Set([h.task.id]) });
  h.c.scheduleTaskAdvance(1);
  await h.advance(500);
  const turn = h.c.acceptTranscriptEvent({ item_id: 'additional-detail' }, { allowStart: true });
  h.c.finalizeLearnerTranscript('One more thing: I also worked with customer support.', { turn });
  assert.equal(h.s.conversationFocus, 'task');
  assert.ok(h.s.expectedResponse);
  assert.ok(h.s.advanceTimer, 'the flow must not become permanently parked in chat');
  await h.advance(1200);
  assert.equal(h.effects.some(effect => effect.type === 'next'), false);
  finishReply(h);
  await h.advance(2000);
  assert.equal(h.effects.filter(effect => effect.type === 'next').length, 1);
  assert.equal(h.s.coveredGoals.size, 1, 'an extra detail cannot finish the next topic early');
});

test('spoken skip and stop remain available during an interview transition', () => {
  for (const [text, expected] of [['Next question.', 'skip'], ['Stop the interview.', 'stop']]) {
    const h = interviewHarness();
    h.s.stage = 'task-complete'; h.s.speechDone = true;
    const context = h.c.captureUserTurnContext();
    assert.equal(h.c.handleConversationSupport(text, context, {}), true);
    assert.equal(h.effects.filter(effect => effect.type === expected).length, 1);
    assert.equal(h.evidence.length, 0);
  }
});

test('an explicit pause holds a completed topic until the candidate asks to continue', async () => {
  const h = interviewHarness();
  Object.assign(h.s, { stage: 'task-complete', speechDone: true, coveredGoals: new Set([h.task.id]) });
  h.c.scheduleTaskAdvance(1);
  assert.equal(h.c.handleConversationSupport('Let me think.', h.c.captureUserTurnContext(), {}), true);
  assert.equal(h.s.conversationFocus, 'chat');
  assert.equal(h.s.advanceTimer, null);
  await h.advance(10000);
  assert.equal(h.effects.some(effect => effect.type === 'next'), false);
  const turn = h.c.acceptTranscriptEvent({ item_id: 'continue-interview' }, { allowStart: true });
  h.c.finalizeLearnerTranscript('Continue.', { turn });
  await h.advance(2000);
  assert.equal(h.effects.filter(effect => effect.type === 'next').length, 1);
});

test('safe fallback stays in the interview role and closing permits natural completion', () => {
  const h = interviewHarness(['interview-closing-goodbye']);
  assert.equal(h.c.safeCharacterReply(), h.task.prompt);
  h.s.speechDone = true;
  assert.equal(h.c.safeCharacterReply(), 'Thank you for your time. Take care.');
  assert.equal(h.c.handleConversationSupport("That's all.", h.c.captureUserTurnContext(), {}), false,
    'a normal farewell is assessed rather than abruptly quitting the practice');
  assert.doesNotMatch(h.c.safeCharacterReply(), /coffee|latte|milk|barista/);
});


test('an interview follow-up waits for the candidate instead of advancing after twelve seconds', async () => {
  const h = interviewHarness();
  h.s.stage = 'task-complete'; h.s.speechDone = true; h.s.coveredGoals = new Set([h.task.id]);
  h.s.dialogueHistory = [{ id: 1, speaker: 'user', final: true, text: 'I design mobile apps.' },
    { id: 2, speaker: 'luma', text: 'Which part have you enjoyed most?' }];
  h.c.scheduleTaskAdvance(1);
  await h.advance(35000);
  assert.equal(h.effects.some(e => e.type === 'next'), false);
  h.s.dialogueHistory.push({ id: 3, speaker: 'user', final: true, text: 'Improving navigation.' });
  finishReply(h, 'Thank you for sharing that.');
  await h.advance(2000);
  assert.equal(h.effects.filter(e => e.type === 'next').length, 1);
});

test('asking for an interview hint only gives a starter, not a full model answer', () => {
  const h = interviewHarness(); h.load('speechSupportForTask');
  assert.equal(h.c.handleConversationSupport('Could you give me a hint?', h.c.captureUserTurnContext(), {}), true);
  const line = h.effects.find(e => e.type === 'spoken').text;
  assert.ok(line.includes(h.task.support.starter));
  assert.ok(!line.includes(h.task.support.model));
  assert.equal(h.s.speechDone, false);
});

test('an imperfect specific meaning request stays contextual after a failed reply', () => {
  const h = interviewHarness(['interview-ownership']); h.load('speechSupportForTask');
  const text = 'What does personal response before what means?';
  const context = answerContext(h, text), message = h.s.dialogueHistory[0];
  h.s.conversationFocus = 'chat';
  h.c.beginExpectedResponse('user'); h.s.awaitingModelReply = true;
  h.c.settleFailedDuplexTurn();
  assert.equal(h.s.activeQuestion, h.task.prompt);
  assert.equal(h.s.dialogueHistory.length, 1);
  assert.equal(h.c.handleConversationSupport(text, context, message), false, 'the provider answers the specific phrase in context');
  assert.equal(h.effects.some(effect => effect.type === 'spoken'), false, 'no whole-task translation replaces that answer');
  assert.equal(h.evidence.length, 0);
  assert.equal(h.s.coveredGoals.size, 0);
  assert.equal(h.s.speechDone, false);
});

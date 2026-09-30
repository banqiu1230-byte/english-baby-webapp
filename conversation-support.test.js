const test = require('node:test');
const assert = require('node:assert/strict');
const { supportIntent, matchesTask } = require('./dialogue-rules');
const { harness } = require('./test-support/voice-harness.cjs');

test('help, hesitation and replay are distinguished from valid short answers', () => {
  for (const text of ['什么意思？', '我听不懂', '我还是没听懂', '我有点不明白', '可以翻译一下吗',
    "I don't understand.", 'What does americano mean?', 'Could you explain that?']) assert.equal(supportIntent(text), 'meaning', text);
  for (const text of ['怎么说', '我不知道怎么回答', '我不知道怎么说才好', '请帮我一下',
    "I don't know what to say.", 'Could you tell me what to say?']) assert.equal(supportIntent(text), 'example', text);
  for (const text of ['再说一遍', '能再说慢一点吗', 'Could you repeat the question?']) assert.equal(supportIntent(text), 'replay', text);
  for (const text of ['等一下', '给我一点时间', 'Give me a moment.']) assert.equal(supportIntent(text), 'wait', text);
  assert.equal(supportIntent('继续'), 'continue');
  assert.equal(supportIntent('Could you say that again?'), 'replay');
  for (const text of ['No, thanks.', 'Yes.', 'Here you are.', 'Milk.', 'My name is Li.']) assert.equal(supportIntent(text), '');
});

test('imperfect meaning questions survive recognition wording without becoming task answers', () => {
  for (const text of [
    'What does personal response before what means?',
    'What does personally responsible for means?',
    'What means personally responsible for?',
    'What is the meaning of responsible for?',
    'What do you mean by responsible for?',
  ]) assert.equal(supportIntent(text), 'meaning', text);
  for (const text of [
    'I was personally responsible for research.',
    'My work means a lot to me.',
    'I explained what the result means to the team.',
  ]) assert.equal(supportIntent(text), '', text);
});

test('natural beginner help requests receive support instead of replaying the task question', () => {
  for (const [text, expected] of [
    ['我还是没听懂', '她在问你找到了什么。'],
    ['What does that mean?', '她在问你找到了什么。'],
    ['我不知道怎么说才好', '可以说：Milk.'],
    ['请帮我一下', '可以说：Milk.'],
  ]) {
    const spoken = [];
    const h = harness({ speak: (line, options) => spoken.push({ line, options }) });
    h.load('handleConversationSupport');
    const context = h.c.captureUserTurnContext(), message = { text };
    assert.equal(h.c.handleConversationSupport(text, context, message), true, text);
    assert.equal(spoken.length, 1, text);
    assert.match(spoken[0].line, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), text);
    assert.equal(spoken[0].options.prompt, false, text);
  }

  const replayed = [];
  const replay = harness({ speak: line => replayed.push(line) });
  replay.load('handleConversationSupport');
  const context = replay.c.captureUserTurnContext();
  assert.equal(replay.c.handleConversationSupport('能再说慢一点吗', context, {}), true);
  assert.deepEqual(replayed, [context.question]);
});

test('generic agreement and emotions cannot masquerade as an office name', () => {
  for (const text of ['Hello', 'Okay', 'Sure', 'I am happy', 'I am ready', 'My name is unknown', 'again', 'repeat', 'continue']) assert.equal(matchesTask('office-signin', text), false);
  for (const text of ['Li', 'My name is Li', 'I am Maya']) assert.equal(matchesTask('office-signin', text), true);
});

test('asking for an example keeps the current question and never scores an answer', () => {
  const spoken = [], help = [];
  const h = harness({ speak: (text, options) => spoken.push({text, options}),
    LumaExperience: { currentSession: () => 'test', supportLevel: () => 0, noteHelp: (...args) => help.push(args), closeHelp() {} } });
  h.load('handleConversationSupport', 'speechSupportForTask');
  h.task.id = 'breakfast-more'; h.task.prompt = 'Do you want more water?'; h.s.activeQuestion = h.task.prompt;
  const context = h.c.captureUserTurnContext(), message = {text: '怎么说'};
  assert.equal(h.c.handleConversationSupport(message.text, context, message), true);
  assert.equal(h.s.activeQuestion, 'Do you want more water?');
  assert.equal(h.s.speechDone, false);
  assert.equal(spoken[0].options.prompt, false);
  assert.match(spoken[0].text, /No, thanks/);
  assert.equal(help[0][0], 3);
  assert.equal(h.effects.filter(e => e.type === 'feedback').length, 0);
});

test('waiting is quiet and a later continue replays the same question', async () => {
  const spoken = [];
  const h = harness({ speak: text => spoken.push(text) }); h.load('handleConversationSupport');
  const context = h.c.captureUserTurnContext();
  h.c.handleConversationSupport('等一下', context, {});
  h.c.scheduleIdleNudge(); await h.advance(120000);
  assert.equal(spoken.length, 0); assert.equal(h.effects.filter(e => e.type === 'cue').length, 0);
  h.c.handleConversationSupport('继续', context, {});
  assert.equal(spoken[0], context.question);
});

test('silence produces at most two visual supports without speaking over thought', async () => {
  const h = harness(); h.c.scheduleIdleNudge(); await h.advance(180000);
  assert.equal(h.effects.filter(e => e.type === 'toast').length, 2);
  assert.equal(h.effects.filter(e => e.type === 'cue').length, 0);
  assert.equal(h.timers.size, 0);
});

test('a reply ending while help is open cannot restart idle prompts or consume help evidence', async () => {
  let helpOpen = true;
  const help = [];
  const h = harness({ LumaExperience: { isHelpOpen: () => helpOpen, noteHelp: (...args) => help.push(args) } });
  h.load('finishDuplexTurnWhenAudioEnds');
  h.c.beginExpectedResponse('user');
  Object.assign(h.s, { duplexOutputDone: true, duplexSpeaking: true, duplexAcceptAudio: false,
    awaitingModelReply: true, speechDone: false, actionDone: false });
  h.c.finishDuplexTurnWhenAudioEnds();
  await h.advance(120000);
  assert.equal(h.c.isConversationTurnPending(), false, 'the reply still finishes normally');
  assert.equal(h.s.idleNudgeCount, 0);
  assert.equal(h.effects.filter(effect => effect.type === 'toast').length, 0);
  assert.deepEqual(help, [], 'reading help is not a reason to record an unsolicited idle explanation');
  helpOpen = false;
  h.c.scheduleIdleNudge();
  await h.advance(11999);
  assert.equal(h.s.idleNudgeCount, 0);
  await h.advance(1);
  assert.equal(h.s.idleNudgeCount, 1, 'closing help restores the ordinary first idle prompt');
  assert.equal(h.effects.filter(effect => effect.type === 'toast').length, 1);
});

test('an already scheduled idle callback checks whether help opened in the meantime', async () => {
  let helpOpen = false;
  const h = harness({ LumaExperience: { isHelpOpen: () => helpOpen } });
  h.c.scheduleIdleNudge();
  await h.advance(1000);
  helpOpen = true;
  // Leave the old timer alive to exercise the callback guard independently
  // of the UI's normal pauseGuidance cancellation.
  await h.advance(120000);
  assert.equal(h.s.idleNudgeCount, 0);
  assert.equal(h.effects.filter(effect => effect.type === 'toast').length, 0);
  assert.equal(h.timers.size, 0);
});

test('an obsolete help transcript cannot cancel the current response', () => {
  const h = harness(); h.load('handleConversationSupport');
  const context = h.c.captureUserTurnContext(); h.s.practiceSession++;
  const response = h.c.beginExpectedResponse('say');
  assert.equal(h.c.handleConversationSupport('什么意思', context, {}), false);
  assert.equal(h.s.expectedResponse, response);
});

test('a late help final in the same task cannot cancel a newer learner answer', () => {
  const h = harness(); h.load('handleConversationSupport');
  const first = h.c.acceptTranscriptEvent({ item_id: 'help' }, { allowStart: true });
  h.c.confirmLearnerTurn(first, '什么意思'); h.c.updateLearnerTurn(first, '什么意思');
  const newer = h.c.acceptTranscriptEvent({ item_id: 'answer' }, { allowStart: true });
  h.c.confirmLearnerTurn(newer, 'Milk.'); h.c.updateLearnerTurn(newer, 'Milk.');
  const response = h.s.expectedResponse;
  h.c.finalizeLearnerTranscript('什么意思？', { turn: first });
  assert.equal(h.s.expectedResponse, response);
  assert.equal(h.s.activeVoiceTurn, newer);
  assert.equal(h.effects.filter(e => e.type === 'feedback').length, 0);
});

test('connection failure replaces the pending opening label with recovery', () => {
  const h = harness(); h.s.dialogueHistory = [{ id: 50, speaker: 'luma', text: 'Do you want milk or water?', pendingPlayback: true, taskId: h.task.id }];
  h.c.settleFailedDuplexTurn();
  assert.equal(h.s.dialogueHistory.length, 1);
  assert.match(h.s.dialogueHistory[0].status, /语音未播放/);
  assert.equal(h.s.awaitingPrompt, false);
  h.s.activeQuestion = 'Do you want more water?';
  h.c.showPendingTaskPrompt('可以说 Yes, please.', { updatesQuestion: false });
  h.c.settleFailedDuplexTurn();
  assert.equal(h.s.activeQuestion, 'Do you want more water?');
});

test('technical reply failure preserves a confirmed learner turn and the actual question', () => {
  const h = harness(); h.load('handleConversationSupport');
  const question = h.s.activeQuestion;
  const learner = { id: 1, speaker: 'user', text: 'What does milk means?', final: true, taskId: h.task.id };
  h.s.dialogueHistory = [learner]; h.s.messageSerial = 1; h.s.conversationFocus = 'chat';
  h.c.beginExpectedResponse('user'); h.s.awaitingModelReply = true;
  h.c.settleFailedDuplexTurn();
  assert.equal(h.s.activeQuestion, question);
  assert.equal(h.s.dialogueHistory.length, 1, 'no invented character reply is added for a network failure');
  assert.equal(h.s.dialogueHistory[0].text, learner.text);
  assert.match(learner.status, /语音回复未接上.*你的话已保留.*提示/);
  assert.equal(h.c.isConversationTurnPending(), false);
  const spoken = []; h.c.speak = line => spoken.push(line);
  assert.equal(h.c.handleConversationSupport('What does that mean?', h.c.captureUserTurnContext(), learner), true);
  assert.equal(spoken[0], '她在问你找到了什么。', 'generic meaning support still uses the real question after recovery');
  assert.equal(h.s.coveredGoals.size, 0);
});

test('late help final preserves the full character answer already playing', () => {
  const h = harness(); h.load('handleConversationSupport');
  const turn = h.c.acceptTranscriptEvent({ item_id: 'help' }, { allowStart: true });
  h.c.confirmLearnerTurn(turn, '什么意思'); h.c.updateLearnerTurn(turn, '什么意思');
  turn.responseStarted = true;
  Object.assign(h.s, { duplexPlayerContext: {currentTime: 10}, duplexNextPlayTime: 15 });
  const response = h.s.expectedResponse;
  h.c.finalizeLearnerTranscript('什么意思？', {turn});
  assert.equal(h.s.duplexNextPlayTime, 15);
  assert.equal(h.s.expectedResponse, response);
  assert.equal(h.effects.filter(e => e.type === 'feedback').length, 0);
});

test('example captions preserve yes/no question context and opening captions reuse preview', () => {
  const h = harness(); h.load('beginCharacterCaptionReveal');
  h.s.activeQuestion = 'Do you want more water?';
  h.c.beginExpectedResponse('say').updatesQuestion = false;
  h.c.beginCharacterCaptionReveal('可以说 Yes, please.');
  assert.equal(h.s.activeQuestion, 'Do you want more water?');
  h.c.beginExpectedResponse('user');
  h.c.beginCharacterCaptionReveal('You can say Yes, please.');
  assert.equal(h.s.activeQuestion, 'Do you want more water?');
  h.s.dialogueHistory = [{ id: 50, speaker: 'luma', text: 'Do you want more water?', pendingPlayback: true, taskId: h.task.id }];
  h.c.beginExpectedResponse('say').updatesQuestion = true;
  h.c.beginCharacterCaptionReveal('Do you want more water?');
  assert.equal(h.s.dialogueHistory.length, 1);
  assert.equal(h.s.dialogueHistory[0].pendingPlayback, undefined);
  assert.equal(h.s.dialogueHistory[0].text, 'Do you want more water?');
});

test('help about a new side question never uses an unrelated lesson explanation', () => {
  const spoken = [], h = harness({ speak: text => spoken.push(text) }); h.load('handleConversationSupport');
  const context = {...h.c.captureUserTurnContext(), question: 'Where are you from?'};
  assert.equal(h.c.handleConversationSupport('什么意思', context, {}), false);
  assert.equal(spoken.length, 0);
});

test('failed speech preserves a readable question without recording hearing', () => {
  const h = harness(); h.s.dialogueHistory = [{ id: 50, speaker: 'luma', text: '…', pendingPlayback: true, taskId: h.task.id }];
  h.c.showUnplayedCharacterLine('What is your name?', true);
  assert.equal(h.s.dialogueHistory.length, 1);
  assert.equal(h.s.activeQuestion, 'What is your name?');
  assert.match(h.s.dialogueHistory[0].status, /语音未播放/);
  assert.equal(h.s.questionReadyAt, 0);
  h.task.autoAdvance = true; let advanced = false;
  h.c.completeMultimodalTask = () => { advanced = true; };
  h.c.showUnplayedCharacterLine('Please wait here.');
  assert.equal(advanced, true);
  assert.equal(h.s.questionReadyAt, 0);
});

test('social fast path cannot swallow orders, names, help or valid task greetings', () => {
  const { isSmallTalk, openingLine } = require('./dialogue-rules');
  for (const text of ['Hi!', 'Good morning.', "I'm a little tired today.", 'How are you?', '你好'])
    assert.equal(isSmallTalk(text), true, text);
  for (const text of ['Hi, a latte please.', 'Hello, may I have a small latte?', 'My name is Li.',
    'Yes.', 'For here.', 'How do I say small?', '听不懂']) assert.equal(isSmallTalk(text), false, text);
  assert.equal(matchesTask('office-greeting', 'Hi Maya!'), true);
  assert.equal(openingLine('breakfast-drink', 'Do you want milk or water?'), 'Good morning! Do you want milk or water?');
});

test('greeted task questions still support Chinese help and instant task interpretation', async () => {
  const { openingLine } = require('./dialogue-rules');
  for (const [id, prompt, answer] of [
    ['ticket', 'May I see your ticket?', 'Here you are.'],
    ['office-purpose', 'Who are you here to see?', 'Maya.'],
  ]) {
    const h = harness();
    Object.assign(h.task, { id, prompt, requiresAction: false });
    h.s.selectedScene = id === 'ticket' ? 'airport' : 'office';
    h.s.activeQuestion = openingLine(id, prompt);
    h.load('handleConversationSupport', 'requestLanguageFeedback');
    const helpLines = [], accepted = [];
    h.c.speak = (text, options) => helpLines.push({text, options});
    h.c.applyDynamicFeedback = result => accepted.push(result);
    h.c.fetch = () => { throw Error('An explicit task answer must remain local'); };
    assert.equal(h.c.isCurrentTaskQuestion(h.s.activeQuestion), true);
    assert.equal(h.c.handleConversationSupport('什么意思', h.c.captureUserTurnContext(), {}), true);
    assert.equal(helpLines.length, 1);
    assert.equal(helpLines[0].options.prompt, false);
    await h.c.requestLanguageFeedback(h.s.activeQuestion, answer, { final: true });
    assert.equal(accepted[0].meaning_valid, true);
  }
});

test('an upbeat social answer is never registered as an office name', async () => {
  const h = harness();
  h.s.selectedScene = 'office';
  Object.assign(h.task, { id: 'office-signin', prompt: 'What is your name, please?', requiresAction: false });
  h.s.activeQuestion = h.task.prompt;
  h.load('requestLanguageFeedback');
  const results = [];
  h.c.applyDynamicFeedback = result => results.push(result);
  h.c.fetch = () => { throw Error('Small talk should not await semantic feedback'); };
  for (const answer of ['Great!', 'I am great.']) {
    assert.equal(matchesTask('office-signin', answer), false);
    await h.c.requestLanguageFeedback(h.task.prompt, answer, { final: true });
  }
  assert.ok(results.every(result => result.conversational === true && !result.meaning_valid));
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { supportIntent, matchesTask } = require('./dialogue-rules');
const { harness } = require('./test-support/voice-harness.cjs');

test('help, hesitation and replay are distinguished from valid short answers', () => {
  for (const text of ['什么意思？', '我听不懂', '我还是没听懂', '我有点不明白', '可以翻译一下吗',
    "I don't understand.", 'What does americano mean?', 'Could you explain that?']) assert.equal(supportIntent(text), 'meaning', text);
  for (const text of ['怎么说', '我不知道怎么回答', '我不知道怎么说才好', '请帮我一下',
    "I don't know what to say.", 'Could you tell me what to say?']) assert.equal(supportIntent(text), 'example', text);
  for (const text of ['再说一遍', '能再说慢一点吗', 'Could you speak more slowly?']) assert.equal(supportIntent(text), 'replay', text);
  for (const text of ['等一下', '给我一点时间', 'Give me a moment.']) assert.equal(supportIntent(text), 'wait', text);
  assert.equal(supportIntent('继续'), 'continue');
  assert.equal(supportIntent('Could you say that again?'), 'replay');
  for (const text of ['No, thanks.', 'Yes.', 'Here you are.', 'Milk.', 'My name is Li.']) assert.equal(supportIntent(text), '');
});

test('natural beginner help requests receive support instead of replaying the task question', () => {
  for (const [text, expected] of [
    ['我还是没听懂', '她在问你找到了什么。'],
    ['What does milk mean?', '她在问你找到了什么。'],
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

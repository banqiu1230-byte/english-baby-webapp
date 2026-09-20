const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./test-support/voice-harness.cjs');

function openingHarness() {
  const node = () => ({ scrollTop: 0, textContent: '', style: {}, hidden: false,
    classList: { remove() {}, toggle() {} } });
  const h = harness({
    appShell: node(), toast: node(), apple: node(), hotspots: [], languagePanel: node(),
    clearReviewTransition() {}, clearTaskAdvance() {}, syncSubtitleVisibility() {},
    syncTaskFocus() {}, syncActionCoach() {}, setApplePosition() {},
    unlockDuplexPlayback: () => ({}),
  });
  h.c.currentGoalRecord = () => h.s.sessionGoals[h.task.id] ||= { heard: false };
  h.load('startTask', 'taskHasAction', 'showPendingTaskPrompt',
    'scheduleTaskPrompt', 'speak', 'finishDuplexTurnWhenAudioEnds');
  h.s.duplexReady = true;
  h.s.duplexSocket = { readyState: 1, bufferedAmount: 0,
    send(data) { h.effects.push(typeof data === 'string'
      ? { type: 'sent', data: JSON.parse(data) } : { type: 'pcm', data }); } };
  return h;
}

test('speech before a scheduled opening stays buffered without blocking its playback', async () => {
  const h = openingHarness(), { c, s } = h;
  c.startTask(0);
  assert.equal(s.awaitingPrompt, true);
  c.beginLocalSpeechTurn();
  const turn = s.activeVoiceTurn;
  const pcm = new Int16Array([4, 8, 15, 16, 23, 42]);
  c.microphoneBuffer.push(pcm);
  c.flushMicrophoneBuffer();
  assert.equal(h.effects.filter(e => e.type === 'pcm').length, 0);

  await h.advance(180);
  const lines = h.effects.filter(e => e.type === 'sent' && e.data.type === 'say');
  assert.equal(lines.length, 1, 'the pending opening must run despite the PCM-only candidate');
  assert.equal(lines[0].data.text, h.task.prompt);
  assert.equal(s.activeVoiceTurn, turn, 'retain the original question snapshot');
  assert.equal(turn.confirmed, false);
  assert.equal(c.microphoneBuffer.bytes, pcm.byteLength);

  const expected = s.expectedResponse;
  Object.assign(s, { awaitingPrompt: false, duplexSpeaking: true, duplexOutputDone: true,
    duplexAcceptAudio: false, duplexPlayerContext: { currentTime: 10 }, duplexNextPlayTime: 13 });
  c.confirmLearnerTurn(turn, 'Milk.');
  assert.equal(s.expectedResponse, expected, 'recognition cannot cancel the current character line');
  c.finishDuplexTurnWhenAudioEnds();
  await h.advance(3159);
  assert.equal(h.effects.filter(e => e.type === 'pcm').length, 0);
  await h.advance(1);
  assert.equal(h.effects.filter(e => e.type === 'pcm').length, 1);
  assert.equal(h.effects.find(e => e.type === 'pcm').data, pcm.buffer);
  assert.equal(s.awaitingPrompt, false);
  assert.equal(s.duplexSpeaking, false);
  assert.equal(s.expectedResponse, null);
  assert.equal(s.promptTimer, null);
  await h.advance(6000);
  assert.equal(s.activeVoiceTurn, null, 'an unrecognized buffered candidate still has bounded recovery');
  assert.equal(s.awaitingModelReply, false);
});

test('the initial question is readable during connection and previewing does not record hearing', () => {
  const h = openingHarness(), { c, s } = h;
  s.duplexReady = false;
  c.connectDuplexSession = () => new Promise(() => {});
  c.startTask(0);
  assert.equal(s.dialogueHistory.length, 1);
  assert.equal(s.dialogueHistory[0].text, h.task.prompt);
  assert.equal(s.dialogueHistory[0].pendingPlayback, true);
  assert.equal(s.dialogueHistory[0].taskId, h.task.id);
  assert.equal(s.activeQuestion, h.task.prompt);
  assert.equal(s.sessionGoals[h.task.id].heard, false);
  c.showPendingTaskPrompt();
  assert.equal(s.dialogueHistory.length, 1, 're-render the preview in the same bubble');
});

test('a confirmed learner turn still blocks the scheduled opening', async () => {
  const h = openingHarness(), { c, s } = h;
  c.startTask(0);
  c.beginLocalSpeechTurn();
  s.activeVoiceTurn.confirmed = true;
  await h.advance(720);
  assert.equal(h.effects.filter(e => e.type === 'sent' && e.data.type === 'say').length, 0);
  assert.ok(s.promptTimer);
});

test('leaving before the opening delay cannot start an obsolete character line', async () => {
  const h = openingHarness(), { c, s } = h;
  c.startTask(0);
  s.practiceSession += 1;
  s.sceneStarted = false;
  await h.advance(1000);
  assert.equal(h.effects.filter(e => e.type === 'sent' && e.data.type === 'say').length, 0);
});

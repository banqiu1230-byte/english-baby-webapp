const test = require('node:test');
const assert = require('node:assert/strict');
const { TranscriptLedger, PcmResampler, PcmBuffer, isSpeechText, isPlaybackEcho } = require('./voice-runtime');
const { harness } = require('./test-support/voice-harness.cjs');

test('late final ASR updates its original bubble after response audio starts', async () => {
  const h = harness(), { c, s } = h;
  const ready = c.connectDuplexSession(), socket = s.duplexSocket;
  const send = event => socket.onmessage({ data: JSON.stringify(event) });
  await send({ type: 'session.created' }); await ready;
  await send({ type: 'input_audio_buffer.speech_started' });
  await send({ type: 'conversation.item.input_audio_transcription.started', item_id: 'milk' });
  await send({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'milk', delta: 'I found the' });
  await send({ type: 'response.output_audio.started', response_id: 'reply', question_id: 'milk' });
  assert.equal(h.effects.filter(e => e.type === 'feedback').length, 0);
  await send({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'milk', transcript: 'I found the milk.' });
  assert.equal(s.dialogueHistory.length, 1);
  assert.equal(s.dialogueHistory[0].text, 'I found the milk.');
  assert.equal(h.effects.find(e => e.type === 'feedback').answer, 'I found the milk.');
});

test('two overlapping ASR items have separate bubbles and task snapshots', () => {
  const h = harness(), { c, s } = h;
  const first = c.acceptTranscriptEvent({ item_id: 'first' }, { allowStart: true });
  c.confirmLearnerTurn(first, 'Milk'); c.updateLearnerTurn(first, 'Milk');
  h.task.id = 'plate';
  const second = c.acceptTranscriptEvent({ item_id: 'second' }, { allowStart: true });
  c.confirmLearnerTurn(second, 'Plate'); c.updateLearnerTurn(second, 'Plate');
  c.finalizeLearnerTranscript('The milk.', { turn: first });
  assert.equal(s.activeVoiceTurn, second);
  assert.equal(first.context.taskId, 'milk'); assert.equal(second.context.taskId, 'plate');
  c.finalizeLearnerTranscript('A plate.', { turn: second });
  assert.deepEqual(Array.from(s.dialogueHistory, m => m.text), ['The milk.', 'A plate.']);
  assert.equal(c.acceptTranscriptEvent({ item_id: 'first' }), null);
});

test('cumulative transcript hypotheses replace text without appending duplicates', () => {
  const h = harness(), turn = h.c.acceptTranscriptEvent({ item_id: 'a' }, { allowStart: true });
  for (const text of ['I touch', 'I touch the', 'I touch the plate.']) h.c.updateLearnerTurn(turn, text);
  assert.equal(h.s.dialogueHistory.length, 1);
  assert.equal(h.s.dialogueHistory[0].text, 'I touch the plate.');
});

test('late first recognition fills old text without interrupting a newer answer', () => {
  const h = harness(), { c, s } = h;
  const first = c.acceptTranscriptEvent({ item_id: 'old' }, { allowStart: true });
  const second = c.acceptTranscriptEvent({ item_id: 'new' }, { allowStart: true });
  c.confirmLearnerTurn(second, 'Plate'); c.updateLearnerTurn(second, 'Plate');
  const expected = s.expectedResponse;
  c.finalizeLearnerTranscript('Milk.', { turn: first });
  assert.equal(s.activeVoiceTurn, second);
  assert.equal(s.expectedResponse, expected);
  assert.equal(first.superseded, true);
  assert.ok(s.dialogueHistory.some(message => message.text === 'Milk.'));
});

test('a scheduled safe reply cannot interrupt the learner after the floor changes', async () => {
  const h = harness(); h.load('discardReasoningLeak');
  h.s.duplexReady = true;
  let replies = 0; h.c.speak = () => { replies++; };
  h.c.discardReasoningLeak('Find the milk.');
  const turn = h.c.acceptTranscriptEvent({ item_id: 'new' }, { allowStart: true });
  h.c.confirmLearnerTurn(turn, 'Yes.');
  await h.advance(200);
  assert.equal(replies, 0);
  assert.equal(h.s.expectedResponse.turnId, turn.id);
});

test('VAD without actual words never interrupts character audio', () => {
  const h = harness(); Object.assign(h.s, { duplexPlayerContext: { currentTime: 10 }, duplexNextPlayTime: 15, duplexReady: true });
  h.c.beginExpectedResponse('say'); const response = h.s.expectedResponse;
  h.c.beginLocalSpeechTurn();
  assert.equal(h.s.expectedResponse, response); assert.equal(h.s.duplexNextPlayTime, 15);
  h.c.confirmLearnerTurn(h.s.activeVoiceTurn, '[noise]');
  assert.equal(h.s.expectedResponse, response);
  h.c.confirmLearnerTurn(h.s.activeVoiceTurn, 'Yes.');
  assert.equal(h.s.duplexNextPlayTime, 0); assert.equal(h.s.expectedResponse.kind, 'user');
});

test('noise and playback echo filters preserve short and quiet learner answers', () => {
  assert.equal(isSpeechText('[music]'), false); assert.equal(isSpeechText('…'), false);
  assert.equal(isSpeechText('yes'), true); assert.equal(isSpeechText('什么意思'), true);
  assert.equal(isPlaybackEcho('Can you find the milk', 'Can you find the milk?'), true);
  assert.equal(isPlaybackEcho('Milk.', 'Milk.'), false);
  assert.equal(isPlaybackEcho('Yes.', 'Yes. Good.'), false);
});

test('reconnection retains visible incomplete learner speech', () => {
  const h = harness(), turn = h.c.acceptTranscriptEvent({ item_id: 'a' }, { allowStart: true });
  h.c.updateLearnerTurn(turn, 'I found the milk'); h.c.settleFailedDuplexTurn();
  assert.equal(h.s.dialogueHistory[0].text, 'I found the milk');
  assert.equal(h.s.dialogueHistory[0].status, '识别未完成');
  assert.ok(h.s.idleNudgeTimer);
});

test('reply timeout clears busy state and rearms help', async () => {
  const h = harness(); h.c.beginExpectedResponse('user'); h.s.awaitingModelReply = true;
  h.c.armReplyTimeout(); await h.advance(10000);
  assert.equal(h.s.awaitingModelReply, false); assert.equal(h.s.expectedResponse, null);
  assert.ok(h.s.idleNudgeTimer);
});

test('explicit character line without first packet has a bounded recovery', async () => {
  const h = harness({ unlockDuplexPlayback: () => ({}) }); h.load('speak'); h.s.duplexReady = true;
  await h.c.speak('Milk?'); await h.advance(10000);
  assert.equal(h.s.expectedResponse, null); assert.equal(h.s.awaitingPrompt, false); assert.ok(h.s.idleNudgeTimer);
});

test('600 ms network audio gap does not retire the response', async () => {
  const h = harness(); h.c.beginExpectedResponse('user', { questionId: 'q' });
  h.c.acceptResponseEvent({ question_id: 'q', response_id: 'r' });
  Object.assign(h.s, { duplexSpeaking: true, lastDuplexAudioAt: 10000, duplexAcceptAudio: true });
  h.c.armCharacterTurnWatchdog(); await h.advance(605);
  assert.equal(h.s.duplexOutputDone, false);
  assert.equal(h.c.acceptResponseEvent({ question_id: 'q', response_id: 'r' }), true);
});

test('cancel during AudioContext resume cannot start an old audio source', async () => {
  let resume, starts = 0; const resumed = new Promise(resolve => resume = resolve);
  const context = { resume: () => resumed, createBufferSource: () => ({ start() { starts++; } }) };
  const h = harness({ unlockDuplexPlayback: () => context }); h.load('enqueueDuplexPcm');
  const enqueued = h.c.enqueueDuplexPcm(Buffer.alloc(20).toString('base64'));
  h.c.stopDuplexPlayback(); resume(); await enqueued; assert.equal(starts, 0);
});

test('normal English explanations are not filtered as reasoning or repeated action', () => {
  const h = harness(); h.load('looksLikeReasoningLeak', 'asksForCompletedAction'); h.s.actionDone = true;
  assert.equal(h.c.looksLikeReasoningLeak("Let's check your ticket."), false);
  assert.equal(h.c.asksForCompletedAction('Touch means put your finger on it.'), false);
});

test('microphone permission granted after leaving stops the late track', async () => {
  let grant, stops = 0; const permission = new Promise(resolve => grant = resolve);
  const h = harness({ navigator: { mediaDevices: { getUserMedia: () => permission } } });
  h.load('getMicrophoneStream', 'releaseMicrophoneStream', 'disconnectAudioCapture', 'startHandsFreeListening', 'cancelSpeechCapture');
  h.c.connectDuplexSession = async () => true; h.s.handsFreeListening = false;
  const start = h.c.startHandsFreeListening(); h.s.sceneStarted = false; h.c.cancelSpeechCapture();
  const track = { stop() { stops++; } }; grant({ getTracks: () => [track], getAudioTracks: () => [track] });
  await start; assert.equal(stops, 1); assert.equal(h.s.mediaStream, null);
});

test('old socket events cannot revive or close a replacement session', async () => {
  const h = harness(), firstReady = h.c.connectDuplexSession(), first = h.s.duplexSocket;
  await first.onmessage({ data: '{"type":"session.created"}' }); await firstReady;
  h.s.duplexReady = false; const secondReady = h.c.connectDuplexSession(), second = h.s.duplexSocket;
  await first.onmessage({ data: '{"type":"local.closed"}' }); assert.equal(h.s.duplexSocket, second);
  await second.onmessage({ data: '{"type":"session.created"}' }); await secondReady;
  assert.equal(h.s.duplexReady, true);
});

test('stale scoring cannot apply to edited messages or a restarted practice', () => {
  const h = harness(); h.load('applyDynamicFeedback');
  h.s.dialogueHistory = [{ id: 1, speaker: 'user', text: 'No, not milk.', revision: 2, final: true }];
  h.c.applyDynamicFeedback({ meaning_valid: true }, { messageId: 1, revision: 1, answer: 'Milk.', practiceSession: 0, sceneId: 'kitchen', taskId: 'milk', taskIndex: 1 });
  assert.equal(h.s.speechDone, false);
});

for (const sampleRate of [44100, 48000]) test(`resampling ${sampleRate} Hz preserves duration across arbitrary blocks`, () => {
  const resampler = new PcmResampler(sampleRate); let count = 0;
  for (let i = 0; i < sampleRate; i += 1024) count += resampler.push(new Float32Array(Math.min(1024, sampleRate-i))).length;
  assert.equal(count, 16000);
});

test('connection buffer keeps input in order and reports capacity without discarding', () => {
  const buffer = new PcmBuffer(8), a = new Int16Array([1,2]), b = new Int16Array([3,4]);
  assert.equal(buffer.push(a), true); assert.equal(buffer.push(b), true);
  assert.equal(buffer.push(a), false); assert.deepEqual(buffer.take(), [a,b]);
});

test('ledger keeps finalized items as tombstones', () => {
  const ledger = new TranscriptLedger(), first = ledger.bind('a', { taskId: 'milk' });
  ledger.update(first, 'Milk.', true); const next = ledger.create({ taskId: 'plate' });
  assert.equal(ledger.bind('a', next.context, next), first);
  assert.equal(ledger.update(first, 'old duplicate'), false);
  assert.equal(ledger.bind('b', next.context, next), next);
});

test('next task consumes one answer window, never two consecutive 12 second waits', async () => {
  const h = harness({ TASK_ADVANCE_DWELL_MS: 2600, latestCharacterText: () => 'Ready?' });
  h.load('clearTaskAdvance', 'scheduleTaskAdvance', 'scheduleTaskPrompt');
  h.s.stage = 'task-complete';
  let askedAt = 0;
  h.c.speak = () => { askedAt = h.c.Date.now(); };
  h.c.startTask = () => {
    h.s.stage = 'active'; h.s.awaitingPrompt = true;
    h.c.scheduleTaskPrompt(h.task.id, 180);
  };
  h.c.scheduleTaskAdvance(2); await h.advance(12300);
  assert.ok(askedAt >= 22000 && askedAt <= 22300);
});

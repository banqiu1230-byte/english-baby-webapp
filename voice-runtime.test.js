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

test('a completed ASR item cancels its fallback and ignores a duplicate final packet', async () => {
  const h = harness(), turn = h.c.acceptTranscriptEvent({ item_id: 'complete' }, { allowStart: true });
  h.c.confirmLearnerTurn(turn, 'Milk'); h.c.updateLearnerTurn(turn, 'Milk');
  h.c.armVoiceTurnWatchdog(turn);
  await h.advance(5000);
  h.c.finalizeLearnerTranscript('The milk.', { turn });
  assert.equal(turn.finalizeTimer, null);
  await h.advance(2000);
  h.c.finalizeLearnerTranscript('A plate.', { turn });
  assert.equal(h.s.dialogueHistory[0].text, 'The milk.');
  assert.equal(h.effects.filter(effect => effect.type === 'feedback').length, 1);
});

test('a pending ASR fallback cannot submit into a replacement practice or connection', async () => {
  for (const replacement of ['practiceSession', 'connectionGeneration']) {
    const h = harness(), turn = h.c.acceptTranscriptEvent({ item_id: 'old' }, { allowStart: true });
    h.c.confirmLearnerTurn(turn, 'Milk'); h.c.updateLearnerTurn(turn, 'Milk');
    h.c.armVoiceTurnWatchdog(turn);
    h.s[replacement] += 1;
    await h.advance(7000);
    assert.equal(h.effects.filter(effect => effect.type === 'feedback').length, 0, replacement);
    assert.equal(turn.finalizeTimer, null, replacement);
  }
});

test('an old task ASR fallback completes its bubble without taking the new task floor', async () => {
  const h = harness(), turn = h.c.acceptTranscriptEvent({ item_id: 'old-task' }, { allowStart: true });
  h.c.confirmLearnerTurn(turn, 'Milk'); h.c.updateLearnerTurn(turn, 'Milk');
  h.c.armVoiceTurnWatchdog(turn);
  h.c.clearLocalSpeechTurn();
  h.task.id = 'plate'; h.s.taskIndex += 1;
  h.c.beginExpectedResponse('say');
  const nextPrompt = h.s.expectedResponse;
  await h.advance(7000);
  assert.equal(h.s.dialogueHistory[0].text, 'Milk');
  assert.equal(h.s.dialogueHistory[0].final, true);
  assert.equal(turn.finalizeTimer, null);
  assert.equal(h.s.expectedResponse, nextPrompt);
  assert.equal(h.s.replyTimer, null);
  assert.equal(h.effects.filter(effect => effect.type === 'feedback').length, 0);
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

test('neither VAD nor recognized words interrupt character audio', () => {
  const h = harness(); Object.assign(h.s, { duplexPlayerContext: { currentTime: 10 }, duplexNextPlayTime: 15, duplexReady: true });
  h.c.beginExpectedResponse('say'); const response = h.s.expectedResponse;
  h.c.beginLocalSpeechTurn();
  assert.equal(h.s.expectedResponse, response); assert.equal(h.s.duplexNextPlayTime, 15);
  h.c.confirmLearnerTurn(h.s.activeVoiceTurn, '[noise]');
  assert.equal(h.s.expectedResponse, response);
  h.c.confirmLearnerTurn(h.s.activeVoiceTurn, 'Yes.');
  assert.equal(h.s.duplexNextPlayTime, 15); assert.equal(h.s.expectedResponse, response);
  assert.equal(h.c.sceneVoiceIsOpen(), true);
});

test('PCM captured during a character line is released intact after playback', () => {
  const h = harness(), sent = [];
  Object.assign(h.s, { duplexReady: true, duplexSpeaking: true,
    duplexSocket: { readyState: 1, bufferedAmount: 0, send: data => sent.push(data) } });
  const first = new Int16Array([1, 2]), second = new Int16Array([3, 4]);
  h.c.microphoneBuffer.push(first); h.c.flushMicrophoneBuffer();
  h.c.microphoneBuffer.push(second); h.c.flushMicrophoneBuffer();
  assert.equal(sent.length, 0);
  assert.equal(h.c.microphoneBuffer.bytes, 8);
  assert.equal(h.c.sceneVoiceIsOpen(), true);
  h.s.duplexSpeaking = false; h.c.flushMicrophoneBuffer();
  assert.deepEqual(sent, [first.buffer, second.buffer]);
  assert.equal(h.c.microphoneBuffer.bytes, 0);
});

test('in-flight short answer waits for the entire character caption, then finalizes once', async () => {
  const h = harness(), {c,s} = h;
  h.load('clearCharacterCaptionReveal', 'finishDuplexTurnWhenAudioEnds');
  const ready = c.connectDuplexSession(), socket = s.duplexSocket;
  const send = event => socket.onmessage({ data: JSON.stringify(event) });
  await send({type:'session.created'}); await ready;
  c.beginExpectedResponse('say');
  const startedAt = h.now();
  const playbackClock = { get currentTime() { return 10 + (h.now() - startedAt) / 1000; } };
  Object.assign(s, {duplexSpeaking:true, duplexOutputDone:true, duplexPlayerContext:playbackClock, duplexNextPlayTime:12,
    captionCharacters:Array.from('Do you want more milk?'), streamingLumaIndex:0, messageSerial:1,
    dialogueHistory:[{id:1,speaker:'luma',text:'Do you want mo'}]});
  const expected = s.expectedResponse;
  await send({type:'conversation.item.input_audio_transcription.started',item_id:'yeah'});
  await send({type:'conversation.item.input_audio_transcription.delta',item_id:'yeah',delta:'yeah'});
  await send({type:'conversation.item.input_audio_transcription.completed',item_id:'yeah',transcript:'Yeah.'});
  assert.equal(s.expectedResponse, expected); assert.equal(s.duplexNextPlayTime,12);
  assert.equal(s.deferredVoiceEvents.length,3); assert.equal(c.isConversationTurnPending(),true);
  c.finishDuplexTurnWhenAudioEnds(); await h.advance(2160);
  assert.equal(s.dialogueHistory[0].text,'Do you want more milk?');
  assert.equal(s.dialogueHistory[1].text,'Yeah.'); assert.equal(s.dialogueHistory[1].final,true);
  assert.equal(s.dialogueHistory[1].status,'已听到'); assert.equal(s.deferredVoiceEvents.length,0);
  assert.equal(s.expectedResponse.kind,'user'); assert.equal(c.sceneVoiceIsOpen(),true);
});

test('missing ASR final evaluates the preserved hypothesis once and still bounds a missing reply', async () => {
  const h=harness(), turn=h.c.acceptTranscriptEvent({item_id:'a'},{allowStart:true});
  h.c.confirmLearnerTurn(turn,'yeah'); h.c.updateLearnerTurn(turn,'yeah'); h.c.armVoiceTurnWatchdog();
  await h.advance(6000);
  assert.equal(h.s.activeVoiceTurn,null); assert.equal(h.c.sceneVoiceIsOpen(),true);
  assert.equal(h.s.dialogueHistory[0].text,'yeah');
  assert.equal(h.s.dialogueHistory[0].final,true);
  assert.equal(h.effects.filter(effect => effect.type === 'feedback').length,1);
  assert.equal(h.effects.find(effect => effect.type === 'feedback').answer,'yeah');
  assert.equal(h.c.acceptTranscriptEvent({item_id:'a'}),null);
  await h.advance(10000);
  assert.equal(h.s.awaitingModelReply,false); assert.equal(h.s.replyTimer,null);
  assert.equal(h.c.isConversationTurnPending(),false);
  assert.equal(h.effects.filter(effect => effect.type === 'feedback').length,1);
});

test('a buffered speech candidate pins its question and cannot time out character playback', async () => {
  const h=harness(); h.s.duplexSpeaking=true;
  h.c.beginLocalSpeechTurn(); const turn=h.s.activeVoiceTurn;
  await h.advance(12000);
  assert.equal(h.s.activeVoiceTurn,turn); assert.equal(h.s.duplexSpeaking,true);
  assert.equal(turn.confirmed,false); assert.equal(h.s.dialogueHistory.length,0);
  assert.equal(h.c.isConversationTurnPending(),true);
  h.s.duplexSpeaking=false;
  const bound=h.c.acceptTranscriptEvent({item_id:'queued'},{allowStart:true});
  assert.equal(bound,turn); assert.equal(bound.context.taskId,'milk');
});

test('the idle page is not described as reconnecting', () => {
  const h=harness(); h.s.sceneStarted=false; h.c.syncVoiceStatus();
  assert.equal(h.c.voiceStatus.textContent,'');
  assert.equal(h.c.scene.dataset.connectionState,'inactive');
});

test('a learner turn never sends a cancel when no character response exists', () => {
  const h=harness(); h.s.duplexReady=true;
  const turn=h.c.acceptTranscriptEvent({item_id:'a'},{allowStart:true});
  h.c.confirmLearnerTurn(turn,'Milk.');
  assert.equal(h.effects.filter(e=>e.type==='send'&&e.data.type==='response.cancel').length,0);
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
  assert.equal(h.s.dialogueHistory[0].status, '未确认 · 请再说一次');
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

test('failed character recovery drains deferred events and releases a completed step', async () => {
  const h = harness(), { c, s } = h;
  const ready = c.connectDuplexSession(), socket = s.duplexSocket;
  await socket.onmessage({ data: JSON.stringify({ type: 'session.created' }) });
  await ready;
  c.beginExpectedResponse('user');
  s.expectedResponse.responseId = 'stalled';
  Object.assign(s, { stage: 'task-complete', duplexSpeaking: true, duplexAcceptAudio: true });
  s.deferredVoiceEvents.push({
    data: JSON.stringify({ type: 'response.output_audio.delta', response_id: 'late', audio: 'AA==' }),
    context: c.captureUserTurnContext(),
  });
  let courtesy = 0, learner = 0;
  c.openCourtesyTurn = () => { courtesy += 1; return true; };
  c.openLearnerTurn = () => { learner += 1; return true; };
  assert.equal(c.settleFailedDuplexTurn(), true);
  assert.equal(s.deferredVoiceEvents.length, 0);
  assert.equal(c.isConversationTurnPending(), false);
  assert.equal(courtesy, 1);
  assert.equal(learner, 0);
});

test('successful task cancellation drains queued speech and advances even without a provider reply', async () => {
  for (const connected of [true, false]) {
    const nextTasks = [];
    const h = harness({
      TASK_ADVANCE_DWELL_MS: 2600,
      taskRequirementsMet: () => true,
      currentSceneConfig: () => ({ tasks: [{ id: 'milk' }, { id: 'plate' }] }),
      safeCharacterReply: () => 'Yes. You found the milk.',
      speak: () => Promise.resolve(true),
      startTask: index => nextTasks.push(index),
    });
    h.c.apple = h.c.scene;
    h.s.taskIndex = 0;
    h.load('completeMultimodalTask', 'clearTaskAdvance', 'scheduleTaskAdvance', 'latestFollowupText');
    if (connected) {
      const ready = h.c.connectDuplexSession();
      await h.s.duplexSocket.onmessage({ data: '{"type":"session.created"}' });
      await ready;
    }
    h.c.beginExpectedResponse('user');
    Object.assign(h.s.expectedResponse, { responseId: 'old-response', audioStarted: true });
    Object.assign(h.s, { duplexSpeaking: true, duplexAcceptAudio: true });
    const context = h.c.captureUserTurnContext();
    for (const event of [
      { type: 'conversation.item.input_audio_transcription.started', item_id: 'queued' },
      { type: 'conversation.item.input_audio_transcription.delta', item_id: 'queued', delta: 'Actually, wait.' },
      { type: 'conversation.item.input_audio_transcription.completed', item_id: 'queued', transcript: 'Actually, wait.' },
    ]) h.s.deferredVoiceEvents.push({ data: JSON.stringify(event), context });
    assert.equal(h.c.completeMultimodalTask(), true);
    assert.equal(h.s.stage, 'task-complete');
    assert.equal(h.s.deferredVoiceEvents.length, 0);
    await h.advance(15000);
    assert.deepEqual(nextTasks, [1], connected ? 'connected queue' : 'disconnected queue');
    assert.equal(h.c.isConversationTurnPending(), false);
    if (connected) assert.ok(h.s.dialogueHistory.some(message => message.text === 'Actually, wait.' && message.final));
  }
});

test('response.done is a terminal fallback when audio-done is omitted', async () => {
  const h = harness(), { c, s } = h;
  h.load('finishDuplexTurnWhenAudioEnds', 'finishDuplexAudioOutput');
  const ready = c.connectDuplexSession(), socket = s.duplexSocket;
  const send = event => socket.onmessage({ data: JSON.stringify(event) });
  await send({ type: 'session.created' }); await ready;
  c.beginExpectedResponse('say');
  s.expectedResponse.responseId = 'reply';
  Object.assign(s, {
    duplexSpeaking: true,
    duplexAcceptAudio: true,
    duplexSubtitleReady: true,
    duplexValidatedText: true,
    duplexPlayerContext: { currentTime: 10 },
    duplexNextPlayTime: 10,
    duplexAudioQueue: Promise.resolve(),
  });
  await send({ type: 'response.done', response_id: 'reply' });
  await h.advance(160);
  assert.equal(s.expectedResponse, null);
  assert.equal(s.duplexSpeaking, false);
  assert.equal(s.duplexAcceptAudio, false);
  assert.equal(c.isConversationTurnPending(), false);
});

test('text-only response.done releases the floor immediately without waiting for audio.started', async () => {
  const h = harness(), { c, s } = h;
  const ready = c.connectDuplexSession(), socket = s.duplexSocket;
  const send = event => socket.onmessage({ data: JSON.stringify(event) });
  await send({ type: 'session.created' }); await ready;
  c.beginExpectedResponse('say');
  Object.assign(s, { duplexPendingSubtitle: 'Is this your bag?', duplexValidatedText: true, awaitingPrompt: true });
  await send({ type: 'response.done', response_id: 'text-only' });
  assert.equal(c.isConversationTurnPending(), false);
  assert.equal(s.expectedResponse, null);
  assert.equal(s.dialogueHistory.filter(message => message.text === 'Is this your bag?').length, 1);
});

test('only a cancellation bound to the current response can release its floor', async () => {
  const h = harness(), { c, s } = h;
  const ready = c.connectDuplexSession(), socket = s.duplexSocket;
  const send = event => socket.onmessage({ data: JSON.stringify(event) });
  await send({ type: 'session.created' }); await ready;
  c.beginExpectedResponse('say');
  c.acceptResponseEvent({ response_id: 'current', question_id: 'question-current' });
  const current = s.expectedResponse;
  await send({ type: 'response.canceled' });
  await send({ type: 'response.cancelled', response_id: 'old' });
  assert.equal(s.expectedResponse, current);
  await send({ type: 'response.canceled', response_id: 'current' });
  assert.equal(s.expectedResponse, null);
  assert.equal(c.isConversationTurnPending(), false);
});

test('a frozen AudioContext clock releases the character floor after eight seconds', async () => {
  const h = harness(); h.c.beginExpectedResponse('say');
  Object.assign(h.s, {
    duplexSpeaking: true, duplexAcceptAudio: true,
    lumaStartedAt: h.now(), lastDuplexAudioAt: h.now(),
    duplexPlayerContext: { currentTime: 10, state: 'suspended' }, duplexNextPlayTime: 15,
    duplexClockTime: 10, duplexClockAdvancedAt: h.now(),
  });
  h.c.armCharacterTurnWatchdog();
  await h.advance(7999);
  assert.ok(h.s.expectedResponse); assert.equal(h.s.duplexSpeaking, true);
  await h.advance(1);
  assert.equal(h.s.expectedResponse, null); assert.equal(h.s.duplexSpeaking, false);
  assert.equal(h.c.sceneVoiceIsOpen(), true); assert.ok(h.s.idleNudgeTimer);
  assert.match(h.effects.findLast(effect => effect.type === 'toast').text, /声音播放暂停/);
});

test('continuous audio chunks cannot hold a character turn beyond the short absolute deadline', async () => {
  const h = harness(); h.c.beginExpectedResponse('say');
  const maxSeconds = h.c.CHARACTER_TURN_MAX_MS / 1000;
  assert.ok(maxSeconds <= 30, 'Short learning turns must release the floor within thirty seconds');
  const startedAt = h.now();
  const context = { state: 'running', get currentTime() { return 10 + (h.now() - startedAt) / 1000; } };
  Object.assign(h.s, {
    duplexSpeaking: true, duplexAcceptAudio: true,
    lumaStartedAt: startedAt, lastDuplexAudioAt: startedAt,
    duplexPlayerContext: context, duplexNextPlayTime: 200,
    duplexClockTime: 10, duplexClockAdvancedAt: startedAt,
  });
  h.c.armCharacterTurnWatchdog();
  for (let second = 0; second < maxSeconds - 1; second += 1) {
    h.s.lastDuplexAudioAt = h.now();
    h.c.armCharacterTurnWatchdog();
    await h.advance(1000);
  }
  assert.ok(h.s.expectedResponse); assert.equal(h.s.duplexSpeaking, true);
  h.s.lastDuplexAudioAt = h.now(); h.c.armCharacterTurnWatchdog();
  await h.advance(1000);
  assert.equal(h.s.expectedResponse, null); assert.equal(h.s.duplexSpeaking, false);
  assert.equal(h.c.sceneVoiceIsOpen(), true); assert.ok(h.s.idleNudgeTimer);
  assert.match(h.effects.findLast(effect => effect.type === 'toast').text, /已停止.*可以直接回答/);
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

test('a scoring outage preserves the answer as a technical result, never a learner weakness', () => {
  const evidence = [];
  const h = harness({
    LumaExperience: { noteAnswer: (...args) => evidence.push(args) },
  });
  h.load('applyDynamicFeedback');
  const message = { id: 12, speaker: 'user', text: 'This one belongs to me.', revision: 1, final: true };
  h.s.selectedScene = 'airport';
  h.task.id = 'bag'; h.s.taskIndex = 1; h.s.dialogueHistory = [message];
  const context = { messageId: 12, revision: 1, answer: message.text,
    practiceSession: h.s.practiceSession, sceneId: 'airport', taskId: 'bag', taskIndex: 1, source: 'voice' };
  h.c.applyDynamicFeedback({ technical_error: true }, context);
  assert.equal(h.s.speechDone, false);
  assert.match(message.status, /回答已保留.*点提示/);
  assert.equal(evidence.at(-1)[1], 'technical-error');
  assert.match(h.effects.findLast(effect => effect.type === 'toast').text, /不会记成答错/);
});

test('voice status distinguishes denied permission and paused connection from manual mute', () => {
  const h = harness(); h.load('syncVoiceStatus');
  h.s.micMuted = true; h.s.micFailure = 'permission'; h.c.syncVoiceStatus();
  assert.match(h.c.voiceStatus.textContent, /权限被拒绝/);
  assert.equal(h.c.scene.dataset.connectionState, 'error');
  h.s.micFailure = null; h.s.micMuted = false; h.s.voiceConnectionPaused = true; h.c.syncVoiceStatus();
  assert.match(h.c.voiceStatus.textContent, /连接已暂停/);
  assert.equal(h.c.scene.dataset.connectionState, 'error');
  assert.equal(h.c.micLabel.textContent, '重试连接');
  assert.equal(h.c.micButton.getAttribute('aria-label'), '重试语音连接');
  assert.equal(h.c.micButton.classList.contains('is-retry'), true);
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
  const h = harness({ TASK_ADVANCE_DWELL_MS: 2600 });
  h.load('clearTaskAdvance', 'scheduleTaskAdvance', 'scheduleTaskPrompt', 'latestFollowupText');
  h.s.dialogueHistory = [{speaker:'user', text:'Milk.', final:true}, {speaker:'luma', text:'Ready?'}];
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

test('an already answered question does not add twelve seconds after a failed reply', async () => {
  const h = harness({ TASK_ADVANCE_DWELL_MS: 2600 });
  h.load('clearTaskAdvance', 'scheduleTaskAdvance', 'latestFollowupText');
  h.s.dialogueHistory = [{speaker:'luma', text:'Do you want milk or water?'}, {speaker:'user', text:'Milk.', final:true}];
  h.s.stage = 'task-complete';
  let next = false; h.c.startTask = () => { next = true; };
  h.c.scheduleTaskAdvance(2); await h.advance(2700);
  assert.equal(next, true);
});

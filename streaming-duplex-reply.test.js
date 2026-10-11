const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./test-support/voice-harness.cjs');
const Coffee = require('./coffee');

// Keep the real text gate, PCM decode/scheduler, caption reveal and response
// handlers. Only the physical audio device and upstream WebSocket are fake.
async function streamingHarness() {
  const h = harness(), sources = [], rejected = [];
  Object.assign(h.task, { id: 'office-purpose', prompt: 'Who are you here to see?', requiresAction: false });
  Object.assign(h.s, { selectedScene: 'office', characterPromptDelivered: true });
  const startedAt = h.now();
  const context = {
    state: 'running', destination: {},
    get currentTime() { return 10 + (h.now() - startedAt) / 1000; },
    resume: () => Promise.resolve(),
    createGain: () => ({ gain: { value: 1 }, connect() {} }),
    createBuffer: (_channels, samples, rate) => ({ duration: samples / rate, getChannelData: () => new Float32Array(samples) }),
    createBufferSource() {
      return { connect() {}, stop() {}, start(at) {
        sources.push({ receivedAt: h.now(), scheduledDelayMs: (at - context.currentTime) * 1000 });
        h.c.setTimeout(() => this.onended?.(), (at - context.currentTime + this.buffer.duration) * 1000);
      } };
    },
  };
  h.s.duplexPlayerContext = context;
  h.c.unlockDuplexPlayback = () => context;
  h.c.markGoalHeard = () => { h.s.questionReadyAt = h.now(); };
  h.c.discardReasoningLeak = text => { rejected.push(text || 'reasoning'); h.c.stopSpeechPlayback(); };
  h.load('looksLikeReasoningLeak', 'asksForCompletedAction', 'safeCharacterReply',
    'beginCharacterCaptionReveal', 'clearCharacterCaptionReveal',
    'publishDuplexSubtitle', 'releaseDuplexAudioGate', 'queueDuplexAudio', 'enqueueDuplexPcm',
    'finishDuplexAudioOutput', 'finishDuplexTurnWhenAudioEnds');
  const ready = h.c.connectDuplexSession();
  const send = event => h.s.duplexSocket.onmessage({ data: JSON.stringify(event) });
  await send({ type: 'session.created' }); await ready;
  const expected = h.c.beginExpectedResponse('user', { questionId: 'learner-1' });
  h.s.awaitingModelReply = true; h.c.armReplyTimeout();
  const ids = { response_id: 'response-1', question_id: 'learner-1' };
  const event = (type, extra = {}) => send({ type, ...ids, ...extra });
  // Each PCM packet represents 200 ms of non-silent audio at 24 kHz.
  const pcm = Buffer.alloc(9600); for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(1024, i);
  return { ...h, event, sources, rejected, expected, pcm: pcm.toString('base64') };
}

async function drainScheduledAudio(h) {
  await h.s.duplexAudioQueue;
  const remaining = Math.max(0, h.s.duplexNextPlayTime - h.s.duplexPlayerContext.currentTime);
  await h.advance(remaining * 1000 + 1);
  assert.equal(h.s.duplexSources.size, 0, 'all scheduled physical buffers have ended');
}

for (const audioStartsBeforeFinal of [false, true]) test(`coffee next-step answer keeps the natural reply (${audioStartsBeforeFinal ? 'audio starts before' : 'audio starts after'} final ASR)`, async () => {
  const h = await streamingHarness();
  const tasks = Coffee.tasks.map(task => ({ ...task }));
  const feedback = [];
  Object.assign(h.c, {
    currentTask: () => tasks[h.s.taskIndex], currentSceneConfig: () => ({ tasks }),
    appShell: {}, toast: h.c.document.querySelector('toast'), apple: h.c.document.querySelector('apple'),
    languagePanel: h.c.document.querySelector('languagePanel'), hotspots: [],
    syncSubtitleVisibility() {}, syncTaskFocus() {}, syncActionCoach() {}, setApplePosition() {},
    currentGoalRecord: () => ({}),
    requestLanguageFeedback(question, answer, context) {
      feedback.push({ question, answer, context });
      const result = Coffee.advanceMission(h.s.coffee, answer);
      h.s.coffee = result.world;
      return Promise.resolve();
    },
  });
  h.load('startTask', 'taskHasAction');
  h.c.retireExpectedResponse();
  Object.assign(h.s, {
    selectedScene: 'coffee', coffeeMissionId: 'C01', taskIndex: 0,
    coffee: Coffee.advanceMission(Coffee.missionInitial('C01'), 'Americano.').world,
    coveredGoals: new Set(['coffee-order']), stage: 'task-complete', speechDone: true,
    activeQuestion: 'Would you like a small or a large americano?',
    currentSpeech: 'Would you like a small or a large americano?',
    characterPromptDelivered: true, awaitingModelReply: false,
  });
  const send = event => h.s.duplexSocket.onmessage({ data: JSON.stringify(event) });
  const ids = { response_id: 'small-confirmation', question_id: 'small-answer' };
  await send({ type: 'conversation.item.input_audio_transcription.result', item_id: 'small-answer', text: 'Small, please.' });
  const originalOwner = h.s.expectedResponse;
  if (audioStartsBeforeFinal) await send({ type: 'response.output_audio.started', ...ids });
  await send({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'small-answer', text: 'Small, please.' });
  await h.advance(0);
  assert.equal(h.s.taskIndex, 1, 'the already asked size question immediately owns the answer');
  assert.equal(h.s.expectedResponse, originalOwner, 'the provider response identity survives the step change');
  assert.equal(feedback.length, 1);
  assert.equal(feedback[0].context.taskId, 'coffee-size');
  assert.equal(h.s.coffee.size, 'small');
  if (!audioStartsBeforeFinal) await send({ type: 'response.output_audio.started', ...ids });
  await send({ type: 'response.output_text.delta', ...ids, delta: 'Small, got it. Is that for here or to go?' });
  const arrived = h.now();
  await send({ type: 'response.output_audio.delta', ...ids, audio: h.pcm });
  await h.s.duplexAudioQueue;
  assert.equal(h.sources.length, 1, 'the original confirmation is actually scheduled');
  assert.ok(h.sources[0].receivedAt - arrived + h.sources[0].scheduledDelayMs <= 50, 'a step boundary cannot add seconds to received audio');
  assert.equal(h.effects.some(effect => effect.type === 'send' && effect.data.type === 'response.cancel'), false);
  await send({ type: 'response.output_audio.done', ...ids });
  await h.advance(1000);
  assert.equal(h.s.dialogueHistory.filter(message => message.speaker === 'user').length, 1);
  assert.equal(h.s.dialogueHistory.filter(message => message.speaker === 'luma').length, 1);
  assert.equal(h.s.activeQuestion, 'Small, got it. Is that for here or to go?');
  assert.equal(h.c.isConversationTurnPending(), false);
});

test('safe text deltas start PCM within 50 ms of its arrival without waiting for text.done', async () => {
  const h = await streamingHarness();
  await h.advance(900);
  await h.event('response.output_text.delta', { delta: 'An americano is espresso with hot water.' });
  await h.advance(650);
  await h.event('response.output_audio.started');
  const audioArrived = h.now();
  await h.event('response.output_audio.delta', { audio: h.pcm });
  await h.advance(1);
  assert.equal(h.sources.length, 1, 'the first real PCM buffer is scheduled even if text.done never arrives');
  assert.ok(h.sources[0].receivedAt - audioArrived + h.sources[0].scheduledDelayMs <= 50,
    'already received sound cannot sit in the text gate for seconds');
  assert.equal(h.s.duplexPendingAudio.length, 0);
  assert.equal(h.s.awaitingModelReply, false, 'scheduled audio ends the waiting-for-reply state');
  const messageId = h.s.dialogueHistory.find(message => message.speaker === 'luma').id;
  await h.event('response.output_text.delta', { delta: ' A latte also has steamed milk.' });
  await h.event('response.output_audio.delta', { audio: h.pcm });
  await h.advance(1);
  assert.equal(h.s.dialogueHistory.filter(message => message.speaker === 'luma').length, 1, 'incremental sentences share one caption');
  assert.equal(h.s.dialogueHistory.find(message => message.speaker === 'luma').id, messageId);
  await h.event('response.output_audio.done');
  await h.event('response.done');
  await h.advance(1000);
  assert.equal(h.s.dialogueHistory.find(message => message.id === messageId).text,
    'An americano is espresso with hot water. A latte also has steamed milk.');
  assert.equal(h.sources.length, 2);
  assert.equal(h.c.isConversationTurnPending(), false);
});

test('PCM that arrives before a complete text sentence starts as soon as that sentence is safe', async () => {
  const h = await streamingHarness();
  await h.advance(900);
  await h.event('response.output_text.delta', { delta: 'An americano has' });
  await h.advance(650);
  await h.event('response.output_audio.started');
  await h.event('response.output_audio.delta', { audio: h.pcm });
  await h.event('response.output_audio.delta', { audio: h.pcm });
  await h.advance(200);
  assert.equal(h.sources.length, 0, 'an incomplete prefix is not yet a checked sentence');
  const sentenceArrived = h.now();
  await h.event('response.output_text.delta', { delta: ' espresso and hot water.' });
  await h.advance(1);
  await h.s.duplexAudioQueue;
  assert.equal(h.sources.length, 2, 'both already-received PCM buffers are retained and scheduled');
  assert.ok(h.sources[0].receivedAt - sentenceArrived + h.sources[0].scheduledDelayMs <= 50);
  assert.ok(h.sources[1].scheduledDelayMs > h.sources[0].scheduledDelayMs, 'the saved audio remains ordered');
  await h.event('response.output_audio.done');
  await h.advance(1000);
  assert.equal(h.s.dialogueHistory.filter(message => message.speaker === 'luma').length, 1);
  assert.equal(h.s.dialogueHistory.find(message => message.speaker === 'luma').text,
    'An americano has espresso and hot water.');
  assert.equal(h.c.isConversationTurnPending(), false);
});

for (const finalDelay of [100, 1000]) {
  test(`text.done ${finalDelay} ms after audio.done keeps one complete caption and no duplicate playback`, async () => {
    const h = await streamingHarness();
    const text = 'Yes, I can explain. An americano has espresso and hot water.';
    await h.event('response.output_audio.started');
    await h.event('response.output_text.delta', { delta: text });
    await h.event('response.output_audio.delta', { audio: h.pcm });
    await h.advance(1);
    assert.equal(h.sources.length, 1);
    const messageId = h.s.dialogueHistory.find(message => message.speaker === 'luma').id;
    await h.event('response.output_audio.done');
    await h.advance(finalDelay);
    await h.event('response.output_text.done', { text });
    await h.advance(1000);
    const captions = h.s.dialogueHistory.filter(message => message.speaker === 'luma');
    assert.equal(captions.length, 1);
    assert.equal(captions[0].id, messageId);
    assert.equal(captions[0].text, text);
    assert.equal(h.sources.length, 1, 'late full text cannot restart the sound');
    assert.equal(h.c.isConversationTurnPending(), false);
  });
}

test('a split reasoning prefix cannot open the partial-text audio gate', async () => {
  const h = await streamingHarness();
  await h.event('response.output_text.delta', { delta: '<thi' });
  await h.event('response.output_audio.started');
  await h.event('response.output_audio.delta', { audio: h.pcm });
  await h.advance(1);
  assert.equal(h.sources.length, 0);
  await h.event('response.output_text.delta', { delta: 'nk>I should analyze this first.' });
  await h.advance(1);
  assert.equal(h.sources.length, 0, 'reasoning audio is never scheduled');
  assert.equal(h.rejected.length, 1);
  assert.equal(h.s.dialogueHistory.some(message => /analyze|<think>/.test(message.text)), false);
});

test('coffee partial-text release still rejects an invented size before scheduling audio', async () => {
  const h = await streamingHarness();
  Object.assign(h.task, Coffee.tasks[1], { requiresAction: false });
  Object.assign(h.s, { selectedScene: 'coffee', coffeeMissionId: 'C01', taskIndex: 1,
    coffee: Coffee.advanceMission(Coffee.missionInitial('C01'), 'Americano.').world,
    dialogueHistory: [{ id: 1, speaker: 'user', text: '不是吧？', final: true }], messageSerial: 1 });
  h.c.beginExpectedResponse('user', { questionId: 'coffee-learner' });
  const ids = { response_id: 'coffee-reply', question_id: 'coffee-learner' };
  await h.event('response.output_audio.started', ids);
  await h.event('response.output_audio.delta', { ...ids, audio: h.pcm });
  await h.event('response.output_text.delta', { ...ids, delta: 'Small, got it.' });
  await h.advance(1);
  assert.equal(h.s.coffee.size, null);
  assert.equal(h.sources.length, 0, 'an ungrounded partial confirmation cannot release buffered PCM');
  assert.equal(h.rejected.length, 1);
  assert.equal(h.s.dialogueHistory.some(message => message.speaker === 'luma' && /Small/.test(message.text)), false);
});

test('missing both terminal events releases the learner within two seconds of playback and preserves the next question', async () => {
  const h = await streamingHarness();
  const reply = 'Sure. Who would you like to meet?';
  await h.event('response.output_text.delta', { delta: 'Sure.' });
  await h.event('response.output_audio.started');
  await h.event('response.output_audio.delta', { audio: h.pcm });
  await h.event('response.output_text.delta', { delta: ' Who would you like to meet?' });
  await h.event('response.output_audio.delta', { audio: h.pcm });
  await drainScheduledAudio(h);
  const soundEndedAt = h.now();
  await h.advance(2000);
  assert.equal(h.c.isConversationTurnPending(), false,
    'completed sound cannot hold the next learner turn for the old eight-second failure timeout');
  assert.equal(h.s.activeQuestion, reply, 'the streamed follow-up remains the question being answered');
  const captions = h.s.dialogueHistory.filter(message => message.speaker === 'luma');
  assert.equal(captions.length, 1);
  assert.equal(captions[0].text, reply, 'missing final packets must not clip the question mark');
  assert.equal(h.sources.length, 2);
  assert.equal(h.effects.some(effect => effect.type === 'toast'), false, 'normal inferred completion is not an error');
  const socket = h.s.duplexSocket;
  await socket.onmessage({ data: JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed',
    item_id: 'learner-2', transcript: 'I am here to see Maya.' }) });
  assert.equal(h.s.dialogueHistory.filter(message => message.speaker === 'user').length, 1, 'the next utterance is consumed immediately');
  assert.equal(h.s.expectedResponse?.questionId, 'learner-2');
  const ids = { response_id: 'response-2', question_id: 'learner-2' };
  await h.event('response.output_text.delta', { ...ids, delta: 'Maya is upstairs.' });
  await h.event('response.output_audio.started', ids);
  await h.event('response.output_audio.delta', { ...ids, audio: h.pcm });
  await drainScheduledAudio(h);
  await h.advance(2000);
  assert.equal(h.c.isConversationTurnPending(), false);
  assert.equal(h.s.dialogueHistory.filter(message => message.speaker === 'luma').length, 2, 'two real replies produce two captions');
  assert.equal(h.sources.length, 3, 'no sound is restarted while releasing the learner floor');
  assert.ok(h.now() - soundEndedAt < 4500);
});

test('missing terminal events retain an unpunctuated streamed tail in the original caption', async () => {
  const h = await streamingHarness();
  await h.event('response.output_text.delta', { delta: 'Sure.' });
  await h.event('response.output_audio.started');
  await h.event('response.output_audio.delta', { audio: h.pcm });
  await h.event('response.output_text.delta', { delta: ' The receptionist can help you find Maya' });
  await drainScheduledAudio(h);
  await h.advance(2000);
  const captions = h.s.dialogueHistory.filter(message => message.speaker === 'luma');
  assert.equal(captions.length, 1);
  assert.equal(captions[0].text, 'Sure. The receptionist can help you find Maya', 'the safe draft tail is completed without text.done');
  assert.equal(h.c.isConversationTurnPending(), false);
});

for (const seconds of [.2, 2]) {
  test(`${seconds}-second PCM followed by a 600 ms pause stays in the same response`, async () => {
    const h = await streamingHarness();
    await h.event('response.output_text.delta', { delta: 'There is one thing to explain.' });
    await h.event('response.output_audio.started');
    await h.event('response.output_audio.delta', { audio: Buffer.alloc(24000 * 2 * seconds, 1).toString('base64') });
    await drainScheduledAudio(h);
    await h.advance(600);
    assert.equal(h.s.expectedResponse, h.expected, 'measure the grace period from audible playback ending, not packet arrival');
    assert.equal(h.s.duplexOutputDone, false, 'a normal mid-reply pause does not synthesize completion');
    await h.event('response.output_text.delta', { delta: ' Who would you like to meet?' });
    await h.event('response.output_audio.delta', { audio: h.pcm });
    await drainScheduledAudio(h);
    assert.equal(h.sources.length, 2, 'the resumed audio is accepted by the original response');
    await h.advance(2000);
    assert.equal(h.c.isConversationTurnPending(), false);
    const captions = h.s.dialogueHistory.filter(message => message.speaker === 'luma');
    assert.equal(captions.length, 1);
    assert.equal(captions[0].text, 'There is one thing to explain. Who would you like to meet?');
    assert.equal(h.s.activeQuestion, captions[0].text);
  });
}

const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('./word-pronunciation');
const { harness } = require('./test-support/voice-harness.cjs');

function setup(options = {}) {
  const h = harness();
  const utterances = [], effects = [];
  const voice = { name: 'Local English', lang: 'en-US', localService: true };
  const host = {
    Date: h.c.Date, setTimeout: h.c.setTimeout, clearTimeout: h.c.clearTimeout,
    SpeechSynthesisUtterance: function(text) { this.text = text; },
    speechSynthesis: { speaking: false, pending: false,
      getVoices: () => [{ name: 'Chinese', lang: 'zh-CN', localService: true }, voice],
      speak: utterance => utterances.push(utterance), cancel: () => effects.push('cancel') },
  };
  const audio = create({ host, onStart: () => effects.push('start'),
    onEnd: () => effects.push('end'), ...options });
  return { h, host, audio, utterances, effects, voice };
}

test('word audio starts only on play, uses local English and has bounded microphone echo protection', async () => {
  const { h, host, audio, utterances, effects, voice } = setup();
  assert.equal(utterances.length, 0);
  assert.equal(audio.isCaptureBlocked(), false);
  const result = audio.play('in charge of');
  assert.equal(utterances.length, 1);
  assert.equal(utterances[0].voice, voice);
  assert.equal(utterances[0].rate, .82);
  assert.equal(audio.isActive(), true);
  assert.equal(audio.isCaptureBlocked(), true);
  assert.deepEqual(await audio.play('responsible'), { ok: false, error: 'busy' });
  utterances[0].onend();
  assert.deepEqual(await result, { ok: true });
  assert.equal(audio.isActive(), false);
  assert.equal(audio.isCaptureBlocked(), true);
  await h.advance(181);
  assert.equal(audio.isCaptureBlocked(), false);
  assert.deepEqual(effects, ['start', 'end']);
  audio.stop();
  assert.deepEqual(effects, ['start', 'end'], 'does not cancel somebody else’s speech');
  host.speechSynthesis.speaking = true;
  assert.deepEqual(await audio.play('role'), { ok: false, error: 'busy' });
});

for (const scenario of [
  { name: 'prefers Samantha over earlier novelty and other normal voices',
    voices: [
      { name: 'Albert', lang: 'en-US' }, { name: 'Bubbles', lang: 'en-US' },
      { name: 'Alex', lang: 'en-US' }, { name: 'Daniel', lang: 'en-GB' },
      { name: 'Samantha (Enhanced)', lang: 'en-US' },
    ], expected: 'Samantha (Enhanced)' },
  { name: 'uses Daniel when Samantha is unavailable',
    voices: [{ name: 'Albert', lang: 'en-US' }, { name: 'Daniel', lang: 'en-GB' }], expected: 'Daniel' },
  { name: 'uses the local English system default when no preferred voice is installed',
    voices: [
      { name: 'Samantha', lang: 'en-US', localService: false },
      { name: 'Chinese default', lang: 'zh-CN', default: true },
      { name: 'English A', lang: 'en-US' },
      { name: 'Microsoft Zira', lang: 'en-US', default: true },
    ], expected: 'Microsoft Zira' },
  { name: 'keeps another local English voice usable as a fallback',
    voices: [{ name: 'Chinese', lang: 'zh-CN', default: true }, { name: 'Local English', lang: 'en-AU' }],
    expected: 'Local English' },
]) {
  test(`word audio ${scenario.name}`, async () => {
    const { host, audio, utterances } = setup();
    const voices = scenario.voices.map(voice => ({ localService: true, ...voice }));
    host.speechSynthesis.getVoices = () => voices;
    const result = audio.play('responsibility');
    assert.equal(utterances.length, 1);
    assert.equal(utterances[0].voice, voices.find(voice => voice.name === scenario.expected));
    assert.equal(utterances[0].lang, utterances[0].voice.lang);
    utterances[0].onend();
    assert.deepEqual(await result, { ok: true });
  });
}

for (const ending of ['error', 'timeout', 'throw', 'stop']) {
  test(`word audio ${ending} restores capture and settles exactly once`, async () => {
    const { h, host, audio, utterances, effects } = setup();
    if (ending === 'throw') host.speechSynthesis.speak = () => { throw Error('device unavailable'); };
    const pending = audio.play('responsibility');
    if (ending === 'error') utterances[0].onerror();
    if (ending === 'stop') audio.stop();
    if (ending === 'timeout') await h.advance(12001);
    assert.equal((await pending).ok, false);
    assert.equal(audio.isActive(), false);
    await h.advance(20000);
    assert.equal(audio.isCaptureBlocked(), false);
    assert.equal(effects.filter(value => value === 'end').length, 1);
  });
}

test('unavailable English speech and busy conversation fail without queueing or capture changes', async () => {
  const { audio, host, utterances, effects } = setup({ canPlay: () => false });
  assert.deepEqual(await audio.play('role'), { ok: false, error: 'busy' });
  assert.equal(utterances.length, 0);
  assert.equal(audio.isCaptureBlocked(), false);
  assert.deepEqual(effects, []);
  const unavailable = create({ host });
  host.speechSynthesis.getVoices = () => [{ lang: 'en-US', localService: false }];
  assert.deepEqual(await unavailable.play('role'), { ok: false, error: 'voice_unavailable' });
});

test('pronunciation cannot replace a pending real reply, active question, microphone preference or dialogue history', async () => {
  const { h, host, utterances } = setup();
  h.load('canPronounceWord', 'clearWordAudioCapture');
  const audio = create({ host, canPlay: h.c.canPronounceWord,
    onStart: h.c.clearWordAudioCapture, onEnd: h.c.clearWordAudioCapture });
  h.c.LumaWordAudio = audio;
  const reply = h.c.beginExpectedResponse('user', { turnId: 7 });
  h.s.micMuted = true;
  h.s.dialogueHistory.push({ speaker: 'user', text: 'I designed the flow.', final: true });
  const before = JSON.stringify({ reply, question: h.s.activeQuestion, history: h.s.dialogueHistory, muted: h.s.micMuted });
  assert.deepEqual(await audio.play('designed'), { ok: false, error: 'busy' });
  assert.equal(utterances.length, 0);
  assert.equal(JSON.stringify({ reply: h.s.expectedResponse, question: h.s.activeQuestion,
    history: h.s.dialogueHistory, muted: h.s.micMuted }), before);
});

test('local pronunciation drops echo PCM, restores capture on failure, and leaves live microphone enabled', async () => {
  const { h, host, utterances } = setup();
  h.load('canPronounceWord', 'clearWordAudioCapture');
  const sent = [];
  h.s.duplexReady = true;
  h.s.duplexSocket = { readyState: 1, bufferedAmount: 0, send: value => sent.push(value) };
  h.s.micMuted = false;
  const audio = create({ host, canPlay: h.c.canPronounceWord,
    onStart: h.c.clearWordAudioCapture, onEnd: h.c.clearWordAudioCapture });
  h.c.LumaWordAudio = audio;
  h.c.microphoneBuffer.push(new Int16Array([1, 2]));
  const pending = audio.play('scope');
  assert.equal(h.c.microphoneBuffer.bytes, 0);
  h.c.microphoneBuffer.push(new Int16Array([3, 4]));
  h.c.flushMicrophoneBuffer();
  assert.equal(sent.length, 0);
  assert.equal(h.c.microphoneBuffer.bytes, 0);
  utterances[0].onerror();
  assert.equal((await pending).ok, false);
  await h.advance(200);
  h.c.microphoneBuffer.push(new Int16Array([5, 6]));
  h.c.flushMicrophoneBuffer();
  assert.equal(sent.length, 1);
  assert.equal(h.s.micMuted, false);
  assert.equal(h.s.handsFreeListening, true);
  assert.equal(h.s.expectedResponse, null);
});

test('new real response cancels only dictionary audio and keeps its own response owner', async () => {
  const { h, audio, utterances } = setup();
  h.c.LumaWordAudio = audio;
  const pending = audio.play('scope');
  assert.equal(utterances.length, 1);
  const expected = h.c.beginExpectedResponse('user', { turnId: 9 });
  assert.deepEqual(await pending, { ok: false, error: 'cancelled' });
  assert.equal(h.s.expectedResponse, expected);
  assert.equal(expected.turnId, 9);
  assert.equal(h.effects.some(effect => effect.type === 'send'), false);
});

test('reading a word card pauses idle nudges and task advance, then confirmed speech releases it', async () => {
  let reading = true, closes = 0;
  const h = harness({
    LumaWords: { isReading: () => reading, learnerTurnStarted() { reading = false; closes++; } },
    TASK_ADVANCE_DWELL_MS: 1600,
    startTask(index) { h.effects.push({ type: 'next', index }); },
    latestFollowupText: () => '',
  });
  h.load('scheduleTaskAdvance');
  h.c.scheduleIdleNudge();
  assert.equal(h.s.idleNudgeTimer, null);
  h.s.stage = 'task-complete';
  h.c.scheduleTaskAdvance(2);
  await h.advance(10000);
  assert.equal(h.effects.some(effect => effect.type === 'next'), false);
  h.s.stage = 'active';
  const turn = h.c.transcriptLedger.create(h.c.captureUserTurnContext());
  h.c.confirmLearnerTurn(turn, 'I designed it.');
  assert.equal(reading, false);
  assert.equal(closes, 1);
  assert.equal(h.s.expectedResponse?.kind, 'user');
});

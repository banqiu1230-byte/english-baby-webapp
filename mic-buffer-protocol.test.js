const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./test-support/voice-harness.cjs');
const { PcmBuffer } = require('./voice-runtime');

function setup() {
  // Match the production 60-second safety limit, not the buffer's default.
  const h = harness({ microphoneBuffer: new PcmBuffer(16000 * 2 * 60) });
  const sent = [];
  Object.assign(h.s, { duplexReady: true, duplexSpeaking: true,
    duplexSocket: { readyState: 1, bufferedAmount: 0, send: data => sent.push(data) } });
  const feed = async (amplitude, frames = 1) => {
    for (let frame = 0; frame < frames; frame++) {
      await h.advance(20);
      const pcm = new Int16Array(320).fill(amplitude);
      assert.equal(h.c.bufferMicrophonePcm(pcm, Math.abs(amplitude) / 32768), true);
      h.c.flushMicrophoneBuffer();
    }
  };
  const samples = () => sent.filter(value => typeof value !== 'string')
    .flatMap(value => Array.from(new Int16Array(value)));
  const controls = () => sent.filter(value => typeof value === 'string').map(value => JSON.parse(value).type);
  return { ...h, feed, samples, controls, sent };
}

test('six seconds of silent character playback adds at most 200 ms of input preroll', async () => {
  const h = setup();
  await h.feed(0, 300);
  assert.equal(h.c.microphoneBuffer.bytes, 0, 'silent waiting cannot become a six-second real-time upload backlog');
  assert.equal(h.s.microphonePreroll.length, 3200);
  assert.deepEqual(h.controls(), ['input_audio_mute.commit'], 'repeated capture frames send one mute control');
  h.s.duplexSpeaking = false;
  await h.feed(2000);
  const samples = h.samples();
  assert.ok(samples.length <= 3520, 'new speech starts after no more than 200 ms of retained onset context');
  assert.deepEqual(samples.slice(-320), Array(320).fill(2000));
  assert.deepEqual(h.controls(), ['input_audio_mute.commit', 'input_audio_unmute.commit']);
});

test('quiet overlap preserves every speech sample, 200 ms of onset and one full second of ASR tail', async () => {
  const h = setup();
  await h.feed(0, 300);
  await h.feed(50, 25); // RMS 0.00153: much quieter than the local VAD threshold.
  await h.feed(20, 50); // RMS 0.00061: keep the complete following second.
  await h.feed(0, 250);
  assert.equal(h.samples().length, 0, 'overlapping audio waits without interrupting character playback');
  assert.equal(h.c.microphoneBuffer.bytes, (3200 + 25 * 320 + 50 * 320) * 2);
  h.s.duplexSpeaking = false;
  h.c.flushMicrophoneBuffer();
  assert.deepEqual(h.samples(), [...Array(3200).fill(0), ...Array(25 * 320).fill(50), ...Array(50 * 320).fill(20)]);
  assert.deepEqual(h.controls(), ['input_audio_mute.commit', 'input_audio_unmute.commit']);
});

test('quiet syllable onset immediately before playback ends survives the hold-to-listen boundary', async () => {
  const h = setup();
  await h.feed(0, 250);
  await h.feed(20, 10); // Last 200 ms may be a quiet onset or unvoiced consonant.
  h.s.duplexSpeaking = false;
  await h.feed(1500);
  assert.deepEqual(h.samples(), [...Array(3200).fill(20), ...Array(320).fill(1500)],
    'the safety preroll is useful exactly when the first normal-level syllable follows the character line');
});

test('ordinary listening never trims quiet speech or input silence', async () => {
  const h = setup();
  h.s.duplexSpeaking = false;
  await h.feed(10, 25);
  await h.feed(0, 100);
  assert.deepEqual(h.samples(), [...Array(25 * 320).fill(10), ...Array(100 * 320).fill(0)]);
  assert.deepEqual(h.controls(), ['input_audio_unmute.commit']);
});

test('capture disconnect commits mute once and clears held onset context', async () => {
  const h = setup();
  h.load('disconnectAudioCapture');
  h.s.duplexSpeaking = false;
  await h.feed(800);
  h.s.duplexSpeaking = true;
  await h.feed(0, 100);
  assert.equal(h.s.microphonePreroll.length, 3200);
  h.c.disconnectAudioCapture();
  h.c.disconnectAudioCapture();
  assert.deepEqual(h.controls(), ['input_audio_unmute.commit', 'input_audio_mute.commit']);
  assert.equal(h.s.microphonePreroll.length, 0);
  assert.equal(h.s.lastHeldSpeechAt, 0);
});

// Optional real-provider regression. Use synthetic speech fixtures only.
// LUMA_MILK_WAV / LUMA_CUP_WAV / LUMA_ANSWER_WAV must contain
// "Milk" / "Here you are" / "No, thanks".
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const fixtures = [process.env.LUMA_MILK_WAV, process.env.LUMA_CUP_WAV, process.env.LUMA_ANSWER_WAV];
  assert.ok(fixtures.every(Boolean), 'Provide all three synthetic WAV paths');
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(recordings => {
      navigator.mediaDevices.getUserMedia = async () => {
        const context = new AudioContext(), destination = context.createMediaStreamDestination();
        const clips = await Promise.all(recordings.map(base64 => context.decodeAudioData(Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer)));
        await context.resume();
        window.playTestSpeech = index => {
          const source = context.createBufferSource(); source.buffer = clips[index];
          source.connect(destination); source.start();
        };
        return destination.stream;
      };
      window.cancels = 0;
      const Original = window.WebSocket;
      window.WebSocket = class extends Original {
        send(data) {
          if (typeof data === 'string' && JSON.parse(data).type === 'response.cancel') window.cancels++;
          super.send(data);
        }
      };
    }, fixtures.map(file => fs.readFileSync(file).toString('base64')));
    await page.goto(process.env.LUMA_TEST_URL || 'http://127.0.0.1:4174/');
    await page.click('.primary-cta'); await page.click('#introReady');

    const overlap = async (clip, expectedLine, answerPattern) => {
      await page.waitForFunction(line => state.currentSpeech === line && isConversationPlaybackActive(), expectedLine, { timeout: 30000 });
      const before = await page.evaluate(clip => {
        const before = { generation: state.playbackGeneration, cancels: window.cancels,
          frames: Number(scene.dataset.micFrames), packets: Number(scene.dataset.micPackets),
          messageId: state.dialogueHistory[state.streamingLumaIndex].id };
        window.playTestSpeech(clip); return before;
      }, clip);
      await page.waitForFunction(frames => Number(scene.dataset.micFrames) > frames + 8
        && Number(scene.dataset.micBufferedMs) >= 500 && isConversationPlaybackActive(), before.frames);
      const during = await page.evaluate(() => ({ generation: state.playbackGeneration, cancels: window.cancels,
        frames: Number(scene.dataset.micFrames), packets: Number(scene.dataset.micPackets),
        track: state.mediaStream.getAudioTracks()[0].readyState, enabled: state.mediaStream.getAudioTracks()[0].enabled }));
      assert.equal(during.generation, before.generation, 'Speech must not cancel playback');
      assert.equal(during.cancels, before.cancels);
      assert.ok(during.frames > before.frames, 'Microphone must keep capturing');
      assert.equal(during.packets, before.packets, 'Overlapping audio must remain queued');
      assert.equal(during.track, 'live'); assert.equal(during.enabled, true);
      await page.waitForFunction(({id,line}) => state.dialogueHistory.find(m => m.id === id)?.text === line,
        { id: before.messageId, line: expectedLine }, { timeout: 18000 });
      await page.waitForFunction(pattern => state.dialogueHistory.some(m => m.speaker === 'user' && m.final && new RegExp(pattern,'i').test(m.text)), answerPattern, { timeout: 20000 });
    };

    await overlap(0, 'Do you want milk or water?', 'milk');
    await page.waitForFunction(() => state.taskIndex === 1, {}, { timeout: 35000 });
    await overlap(1, 'Can I have the cup, please?', 'here');
    await page.waitForFunction(() => state.taskIndex === 2, {}, { timeout: 35000 });
    await overlap(2, 'Do you want more milk?', 'no');
    await page.waitForFunction(() => state.breakfast.amount === 'enough', {}, { timeout: 20000 });
    await page.waitForFunction(() => {
      const lastUser = state.dialogueHistory.findLastIndex(m => m.speaker === 'user');
      return state.dialogueHistory.slice(lastUser + 1).some(m => m.speaker === 'luma' && m.text.length > 4)
        && !isConversationTurnPending();
    }, {}, { timeout: 25000 });
    const result = await page.evaluate(() => ({ dialogue: state.dialogueHistory,
      completed: [...state.coveredGoals], microphoneOpen: sceneVoiceIsOpen(), bufferBytes: microphoneBuffer.bytes }));
    assert.equal(result.dialogue.filter(m => m.speaker === 'user').length, 3);
    assert.equal(result.completed.length, 3); assert.equal(result.microphoneOpen, true);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify(result, null, 2));
    await page.evaluate(() => leaveScene());
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

// Optional real-provider smoke. Supply three synthetic English WAVs; no user's microphone is used.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const recordings = [1, 2, 3].map(i => fs.readFileSync(`${process.env.LUMA_VOICE_FIXTURES || '/tmp/luma-voice-latency'}/turn${i}.wav`).toString('base64'));
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  const results = [];
  try {
    const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(clips => {
      window.__voiceTimes = [];
      const Original = window.WebSocket;
      window.WebSocket = class extends Original {
        constructor(...args) {
          super(...args);
          this.addEventListener('message', message => {
            try {
              const e = JSON.parse(message.data);
              window.__voiceTimes.push({ type: e.type, at: performance.now(), item: e.item_id, response: e.response_id, question: e.question_id, length: (e.audio || e.delta || e.text || e.transcript || '').length, text: e.type === 'response.output_text.delta' ? (e.delta || e.text || '') : undefined });
            } catch {}
          });
        }
      };
      navigator.mediaDevices.getUserMedia = async () => {
        const context = new AudioContext(), destination = context.createMediaStreamDestination();
        const audio = await Promise.all(clips.map(clip => context.decodeAudioData(Uint8Array.from(atob(clip), c => c.charCodeAt(0)).buffer)));
        await context.resume();
        window.playSyntheticTurn = index => new Promise(resolve => {
          const source = context.createBufferSource(); source.buffer = audio[index]; source.connect(destination);
          window.__voiceTimes.push({ type: 'fixture.start', at: performance.now() });
          source.onended = () => { const at = performance.now(); window.__voiceTimes.push({ type: 'fixture.end', at }); resolve(at); };
          source.start();
        });
        return destination.stream;
      };
    }, recordings);
    await page.goto(process.env.LUMA_TEST_URL || 'http://127.0.0.1:4174/', { waitUntil: 'networkidle' });
    await page.evaluate(({ sceneId, missionId }) => {
      const schedule = enqueueDuplexPcm;
      enqueueDuplexPcm = async (...args) => {
        await schedule(...args);
        if (state.duplexPlayerContext?.state === 'running' && state.duplexSources.size) {
          window.__voiceTimes.push({type:'audio.scheduled',at:performance.now()});
          const source = [...state.duplexSources].at(-1);
          source.addEventListener('ended', () => window.__voiceTimes.push({type:'audio.ended',at:performance.now()}), {once: true});
        }
      };
      const enqueue = queueDuplexAudio;
      queueDuplexAudio = audio => { window.__voiceTimes.push({ type: 'audio.queued', at: performance.now() }); return enqueue(audio); };
      const send = sendDuplex;
      sendDuplex = event => {
        if (event.type === 'response.cancel') window.__voiceTimes.push({ type: 'client.cancel', at: performance.now(), stack: new Error().stack, task: currentTask().id, stage: state.stage });
        return send(event);
      };
      state.selectedScene = sceneId; startScene({ missionId, skipIntro: true });
    }, { sceneId: process.env.LUMA_TEST_SCENE || 'interview', missionId: process.env.LUMA_TEST_MISSION || 'I01' });
    for (let index = 0; index < recordings.length; index++) {
      await page.waitForFunction(() => state.characterPromptDelivered && state.handsFreeListening && !isConversationTurnPending(), null, { timeout: 40000 });
      const marker = await page.evaluate(() => ({ serial: state.messageSerial, time: performance.now() }));
      const ended = await page.evaluate(i => window.playSyntheticTurn(i), index);
      let replied = true;
      try { await page.waitForFunction(at => window.__voiceTimes.some(e => e.type === 'audio.scheduled' && e.at > at), ended, { timeout: 18000 }); }
      catch { replied = false; }
      if (replied) await page.waitForFunction(() => !isConversationTurnPending(), null, { timeout: 40000 });
      const result = await page.evaluate(({ ended, marker, index, replied }) => {
        const events = window.__voiceTimes.filter(e => e.at > marker.time);
        const ms = type => { const e = events.find(e => e.type === type && e.at >= ended); return e ? Math.round(e.at - ended) : null; };
        const audioEnded = events.findLast(e => e.type === 'audio.ended');
        return { turn: index + 1, replied, asrFinalMs: ms('conversation.item.input_audio_transcription.completed'),
          audioReadyMs: ms('audio.queued'), playbackScheduledMs: ms('audio.scheduled'), events: events.filter(e => !['audio.queued','audio.scheduled'].includes(e.type) && !e.type.endsWith('.delta')).map(e => ({ type: e.type, fromEndMs: Math.round(e.at-ended) })),
          pending: isConversationTurnPending(), lastFailure: scene.dataset.lastVoiceFailure || null,
          floorReleasedMs: Math.round(performance.now() - ended), currentQuestion: state.activeQuestion,
          floorReleaseAfterAudioMs: audioEnded ? Math.round(performance.now() - audioEnded.at) : null,
          characterReply: latestCharacterText(),
          streamedText: events.filter(e => e.type === 'response.output_text.delta').map(e => e.text).join(''),
          cancels: events.filter(e => e.type === 'client.cancel'),
          packets: events.filter(e => e.type.endsWith('.delta')).reduce((acc,e) => { const item = acc[e.type] ||= { count: 0, firstMs: Math.round(e.at-ended), lastMs: 0, ids: [] }; item.count++; item.lastMs = Math.round(e.at-ended); if (!item.ids.some(x=>x.response===e.response&&x.question===e.question)) item.ids.push({response:e.response,question:e.question}); return acc; }, {}),
          state: { expected: state.expectedResponse, draft: state.duplexResponseText, textLength: state.duplexResponseText.length, pendingText: state.duplexPendingSubtitle.length, pendingAudio: state.duplexPendingAudio.length, audioAccept: state.duplexAcceptAudio, subtitleReady: state.duplexSubtitleReady, speaking: state.duplexSpeaking } };
      }, { ended, marker, index, replied });
      results.push(result); console.log(JSON.stringify(result));
      if (!replied) break;
    }
    assert.deepEqual(errors, []);
    assert.equal(results.length, 3, 'all three continuous turns finish');
    assert.ok(results.every(r => r.replied), 'each synthetic utterance receives playable audio');
    assert.ok(results.every(r => r.playbackScheduledMs <= 5000), 'each first reply begins within five seconds after speech ends');
    assert.ok(results.every(r => r.floorReleaseAfterAudioMs !== null && r.floorReleaseAfterAudioMs < 2000), 'finished playback releases the next turn without a long silent hold');
    await page.evaluate(() => leaveScene());
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });

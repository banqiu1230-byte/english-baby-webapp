// Controlled browser replay of recognized speech, not a real microphone test.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { resolve, join } = require('node:path');
let browser, activePage;
(async () => {
  const out = resolve(__dirname, '../qa-evidence/order-change'); mkdirSync(out, { recursive: true });
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const errors = [], checks = [];
  for (const viewport of [{ width: 393, height: 754 }, { width: 320, height: 568 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage(); activePage = page;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Test microphone disabled', 'NotAllowedError'); };
      window.WebSocket = class {
        static OPEN = 1;
        constructor() { this.readyState = 1; this.bufferedAmount = 0; setTimeout(() => { this.onopen?.(); this.onmessage?.({ data: '{"type":"session.created"}' }); }, 10); }
        send() {} close() { this.readyState = 3; }
      };
    });
    await page.route('**/api/**', route => route.fulfill({ json: {} }));
    await page.goto('http://127.0.0.1:4174/', { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      // Replace hardware and provider output only; use real input finalization,
      // order logic, task transitions, rendering, evidence and completion.
      ensureSceneVoiceIsOpen = () => {};
      startHandsFreeListening = async () => { state.handsFreeListening = true; };
      startVoiceHealthMonitor = () => {};
      speak = async (text, { prompt = true } = {}) => {
        state.currentSpeech = text;
        state.awaitingPrompt = false;
        if (prompt) state.activeQuestion = text;
        const pending = state.dialogueHistory.find(m => m.pendingPlayback && m.taskId === currentTask().id);
        if (pending) { pending.text = text; pending.status = ''; delete pending.pendingPlayback; renderDialogue(); }
        else addDialogueMessage('luma', text, 'Mia');
        return true;
      };
      state.selectedScene = 'coffee';
      startScene({ skipIntro: true, missionId: 'C01' });
      await new Promise(requestAnimationFrame);
      clearTimeout(state.promptTimer); state.promptTimer = null; clearIdleNudge();
      state.handsFreeListening = true; state.micMuted = false; state.micFailure = '';
      await speak(state.activeQuestion);
    });
    let serial = 0;
    async function say(answer) {
      await page.waitForFunction(() => !state.awaitingPrompt);
      await page.evaluate(({ answer, serial }) => {
        const turn = acceptTranscriptEvent({ item_id: `replay-${serial}` }, { allowStart: true });
        if (!turn) throw Error('No input turn');
        finalizeLearnerTranscript(answer, { turn });
      }, { answer, serial: ++serial });
    }
    await say('Americano.');
    await page.waitForFunction(() => state.stage === 'task-complete');
    await say('Can I have a latte, please?');
    await page.waitForFunction(() => state.coffee.drink === 'latte' && state.taskIndex === 1 && state.stage === 'active');
    assert.equal(await page.evaluate(() => state.dialogueHistory.some(m => /small.*large.*americano/i.test(m.text))), false);
    await say('Small.');
    await page.waitForFunction(() => state.taskIndex === 2 && state.stage === 'active');
    await say('I want a large one.');
    await page.waitForFunction(() => state.coffee.size === 'large');
    assert.equal(await page.evaluate(() => state.coffee.service), null);
    assert.match(await page.locator('#orderSlots').textContent(), /拿铁.*大杯.*方式/);
    await page.screenshot({ path: join(out, `changed-size-${viewport.width}.png`) });
    await say('For here.');
    await page.waitForFunction(() => state.taskIndex === 3 && state.stage === 'active');
    await say('Thanks.');
    await page.waitForFunction(() => state.stage === 'complete');
    assert.equal(await page.locator('#finishConversation').isVisible(), true);
    const result = await page.evaluate(() => ({
      drink: state.coffee.drink, size: state.coffee.size, service: state.coffee.service,
      complete: Coffee.missionComplete(state.coffee), delivered: state.coffee.delivered,
    }));
    assert.deepEqual(result, { drink: 'latte', size: 'large', service: 'here', complete: true,
      delivered: { drink: 'latte', size: 'large', service: 'here' } });
    await page.waitForFunction(() => document.getElementById('reviewScreen').classList.contains('is-active'), { timeout: 10000 });
    checks.push({ viewport, ...result, review: true });
    await context.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(join(out, 'results.json'), JSON.stringify({ fixture: 'controlled recognized speech; no real microphone', checks, errors }, null, 2));
  console.log(JSON.stringify({ scenarios: checks.length, checks, errors }));
  await browser.close();
})().catch(async error => {
  console.error(error);
  if (activePage && !activePage.isClosed()) console.error(await activePage.evaluate(() => ({
    stage: state.stage, taskIndex: state.taskIndex, coffee: state.coffee,
    micMuted: state.micMuted, handsFreeListening: state.handsFreeListening,
    pending: state.userTranscriptPending, awaitingReply: state.awaitingModelReply,
    dialogue: state.dialogueHistory, pendingTransition: state.pendingTransitionUtterance,
  })));
  await browser?.close(); process.exitCode = 1;
});

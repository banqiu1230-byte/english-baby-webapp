// Exercise real caption/status transitions without microphone or provider calls.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { resolve, join } = require('node:path');
const output = resolve(__dirname, '../qa-evidence/dialogue-layout');
mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const checks = [], errors = [], coffeeStyles = new Map();
  try {
    const context = await browser.newContext({ viewport: { width: 430, height: 932 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Controlled fixture', 'NotAllowedError'); };
      window.WebSocket = class {
        static OPEN = 1;
        static CLOSED = 3;
        constructor() { this.readyState = 3; }
        send() {}
        close() { this.readyState = 3; }
      };
    });
    await page.route('**/api/**', route => route.fulfill({ json: {} }));
    await page.goto(process.env.LUMA_TEST_URL || 'http://127.0.0.1:4174/', { waitUntil: 'networkidle' });
    const geometry = async () => page.evaluate(async () => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const node = recentDialogue.lastElementChild;
      const bounds = node.getBoundingClientRect();
      return { top: bounds.top, bottom: bounds.bottom, height: bounds.height,
        text: node.querySelector('p').textContent, id: node.dataset.messageId };
    });
    for (const sceneId of ['coffee', 'interview', 'kitchen', 'airport', 'office']) {
      const previousSession = await page.evaluate(sceneId => {
        const previousSession = state.practiceSession;
        state.selectedScene = sceneId;
        startScene({ missionId: sceneId === 'coffee' ? 'C01' : sceneId === 'interview' ? 'I01' : null, skipIntro: true });
        return previousSession;
      }, sceneId);
      await page.waitForFunction(previousSession => state.sceneStarted && state.stage === 'active' && state.practiceSession > previousSession, previousSession);
      await page.evaluate(() => {
        stopVoiceHealthMonitor(); clearTaskAdvance(); clearIdleNudge(); stopSpeechPlayback();
        clearTimeout(state.promptTimer); state.promptTimer = null;
        clearTimeout(state.toastTimer); toast.classList.remove('is-visible');
        showPendingTaskPrompt(currentTask().prompt);
      });
      await page.setViewportSize({ width: 430, height: 932 });
      await page.waitForFunction(() => backgroundPlane.complete && backgroundPlane.naturalWidth > 0);
      await page.locator('#backgroundPlane').evaluate(async image => { await image.decode(); });
      await page.waitForFunction(() => getComputedStyle(document.querySelector('#experience')).opacity === '1' && getComputedStyle(toast).opacity === '0');
      await page.screenshot({ path: join(output, `opening-${sceneId}.png`) });
      for (const [width, height] of [[430, 932], [393, 754], [320, 568]]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => {
          clearCharacterCaptionReveal(); state.dialogueHistory = []; renderDialogue();
          showPendingTaskPrompt('Welcome back! Last time you had a latte. Would you like a latte?');
        });
        const pending = await geometry();
        await page.evaluate(() => beginCharacterCaptionReveal(state.dialogueHistory.at(-1).text));
        const speaking = await geometry();
        await page.evaluate(() => clearCharacterCaptionReveal({ complete: true }));
        const finished = await geometry();
        checks.push({ case: 'opening-status', sceneId, width, height, pending, speaking, finished });
        writeFileSync(join(output, 'results.json'), JSON.stringify({ checks, errors }, null, 2));
        assert.equal(speaking.id, pending.id, 'Playback must keep the existing message');
        for (const next of [speaking, finished]) {
          assert.equal(next.text, pending.text);
          assert.ok(Math.abs(next.top - pending.top) < .5, `Opening moved: ${JSON.stringify(checks.at(-1))}`);
          assert.ok(Math.abs(next.bottom - pending.bottom) < .5);
        }
        await page.evaluate(() => {
          state.dialogueHistory = []; addDialogueMessage('user', 'Small, please.');
        });
        const unconfirmed = await geometry();
        for (const status of ['正在确认', '已确认', '']) {
          await page.evaluate(status => { state.dialogueHistory.at(-1).status = status; renderDialogue(); }, status);
          const receipt = await geometry();
          assert.ok(Math.abs(receipt.top - unconfirmed.top) < .5, `Receipt moved user bubble: ${status}`);
        }
        await page.evaluate(() => {
          state.dialogueHistory.at(-1).status = '已确认';
          addDialogueMessage('luma', 'Sure, a small latte.', 'Mia');
        });
        const exchange = await page.evaluate(() => ({
          shown: [...recentDialogue.children].filter(node => getComputedStyle(node).display !== 'none').length,
          panel: languagePanel.getBoundingClientRect().toJSON(),
          dock: document.querySelector('.scene-controls').getBoundingClientRect().toJSON(),
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
        }));
        assert.equal(exchange.shown, height > 700 ? 2 : 1, 'Normal screens retain both short turns');
        assert.ok(exchange.panel.bottom < exchange.dock.top && !exchange.overflow);
        checks.push({ case: 'short-exchange', sceneId, width, height, exchange });
        await page.screenshot({ path: join(output, `stable-${sceneId}-${width}.png`) });
        // The same visible controls and conversation text must inherit the cafe's
        // approved typography/surfaces, independent of scene content and artwork.
        const sceneStyles = await page.evaluate(() => {
          const read = (selector, names) => {
            const style = getComputedStyle(document.querySelector(selector));
            return Object.fromEntries(names.map(name => [name, style[name]]));
          };
          return {
            bubble: read('.recent-dialogue .dialogue-bubble p', ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'padding', 'borderRadius']),
            dock: read('.scene-controls', ['borderRadius', 'backgroundColor', 'padding', 'height']),
            label: read('.scene-controls .round-control > span', ['fontSize', 'fontWeight', 'lineHeight']),
            top: read('.experience-topbar > button', ['width', 'height', 'borderWidth', 'borderRadius']),
          };
        });
        if (sceneId === 'coffee') coffeeStyles.set(width, { scene: sceneStyles });
        else assert.deepEqual(sceneStyles, coffeeStyles.get(width).scene, `${sceneId}: conversation chrome matches coffee at ${width}`);
        await page.locator('#subtitleToggle').click();
        assert.ok(await page.locator('#openDialogueHistory').isVisible(), `${sceneId}: history remains reachable with captions off`);
        await page.locator('#openDialogueHistory').click();
        const history = await page.evaluate(() => {
          const panel = document.querySelector('.dialogue-history-panel');
          const paragraph = document.querySelector('.dialogue-history-list .dialogue-bubble p');
          const style = getComputedStyle(paragraph), sheet = getComputedStyle(panel);
          return { fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight,
            padding: sheet.padding, radius: sheet.borderRadius, background: sheet.backgroundColor,
            bounded: panel.getBoundingClientRect().height <= document.querySelector('#scene').clientHeight };
        });
        if (sceneId === 'coffee') coffeeStyles.get(width).history = history;
        else assert.deepEqual(history, coffeeStyles.get(width).history, `${sceneId}: history matches coffee at ${width}`);
        assert.ok(history.bounded);
        await page.screenshot({ path: join(output, `history-${sceneId}-${width}.png`) });
        await page.evaluate(() => closeDialogueHistoryPanel());
        await page.locator('#subtitleToggle').click();
        await page.evaluate(() => { clearTimeout(state.toastTimer); toast.classList.remove('is-visible'); });
        checks.push({ case: 'shared-chrome-and-history', sceneId, width, sceneStyles, history });

      }
    }
    assert.deepEqual(errors, []);
    writeFileSync(join(output, 'results.json'), JSON.stringify({ checks, errors }, null, 2));
    console.log(JSON.stringify({ checks: checks.length, errors, output }));
  } finally {
    writeFileSync(join(output, 'results.json'), JSON.stringify({ checks, errors }, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });

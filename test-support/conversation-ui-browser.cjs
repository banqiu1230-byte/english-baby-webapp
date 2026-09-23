// Controlled scene completion fixture: real UI/finish interaction, no provider or real speech.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { resolve, join } = require('node:path');
const output = resolve(__dirname, '../qa-evidence/conversation-ui');
mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 393, height: 754 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__fixture = 'Controlled UI fixture. Microphone/provider not used.';
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Fixture microphone disabled', 'NotAllowedError'); };
    window.WebSocket = class {
      static OPEN = 1; static CLOSED = 3;
      constructor() { this.readyState = 1; this.bufferedAmount = 0; setTimeout(() => { this.onopen?.(); this.onmessage?.({ data: '{"type":"session.created"}' }); }, 10); }
      send() {} close() { this.readyState = 3; }
    };
  });
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.goto(process.env.LUMA_TEST_URL || 'http://127.0.0.1:4174/', { waitUntil: 'networkidle' });
  await page.click('#adventureCta');
  await page.locator('#sceneIntro').waitFor({ state: 'visible' });
  await page.click('#introReady');
  await page.waitForFunction(() => state.sceneStarted && state.stage === 'active');
  await page.waitForFunction(() => document.getElementById('backgroundPlane').naturalWidth > 0);
  await page.evaluate(() => { clearIdleNudge(); stopSpeechPlayback(); clearTimeout(state.toastTimer); toast.classList.remove('is-visible'); });
  async function layout(label) {
    for (const [width, height] of [[320, 568], [393, 754], [1146, 1202]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(100);
      const result = await page.evaluate(() => {
        const rect = element => { const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; };
        const scene = rect(document.getElementById('scene'));
        const topbar = rect(document.querySelector('.experience-topbar'));
        const buttons = [...document.querySelectorAll('.experience-topbar > button')].filter(el => getComputedStyle(el).display !== 'none').map(el => ({ id: el.id, ...rect(el) }));
        const status = rect(document.querySelector('.scene-top-status'));
        const slots = rect(document.getElementById('orderSlots'));
        const picture = document.getElementById('backgroundPlane');
        const scale = Math.min(scene.width / picture.naturalWidth, scene.height / picture.naturalHeight);
        const imageTop = scene.top + (scene.height - picture.naturalHeight * scale) / 2;
        // Existing cafe artwork puts Mia's face below 23% of the image.
        // This bound complements screenshot inspection; it is not object detection.
        const faceTop = imageTop + picture.naturalHeight * scale * .23;
        return { scene, topbar, buttons, status, slots, faceTop,
          title: document.getElementById('learningStageLabel').textContent,
          progressHidden: getComputedStyle(document.getElementById('sceneProgress')).display === 'none',
          missionHidden: getComputedStyle(document.getElementById('missionHud')).display === 'none',
          slotsVisible: slots.height > 0, keywords: document.querySelectorAll('#visualCues .visual-cue').length,
          noOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
          noOverlap: buttons.every((r, i) => r.height >= 44 && r.left >= scene.left && r.right <= scene.right && (!i || r.left >= buttons[i-1].right)) && status.left >= buttons[0].right && status.right <= buttons[1].left,
          headroom: Math.max(topbar.bottom, slots.bottom) < faceTop };
      });
      checks.push({ label, width, height, ...result });
      assert.equal(result.title, 'Mia · 街角咖啡店');
      assert.ok(result.progressHidden && result.missionHidden && result.slotsVisible && result.keywords > 0);
      assert.ok(result.noOverflow && result.noOverlap && result.headroom, JSON.stringify(checks.at(-1)));
      await page.screenshot({ path: join(output, `fixture-${label}-${width}x${height}.png`) });
    }
  }
  assert.ok(await page.locator('#resetButton').isVisible());
  assert.ok(await page.locator('#finishConversation').isHidden());
  await layout('active');
  await page.evaluate(() => {
    clearTaskAdvance(); clearIdleNudge(); stopSpeechPlayback();
    const ids = ['coffee-order', 'coffee-size', 'coffee-service', 'coffee-thanks'];
    const answers = ['A latte.', 'Small.', 'For here.', 'Thank you.'];
    ids.forEach((id, index) => {
      state.taskIndex = index;
      const goal = goalRecord(id); goal.meaningAccepted = true; goal.spoke = true; goal.language = 'en'; goal.supportLevel = 0;
      LumaExperience.noteAnswer({ evidenceSessionId: LumaExperience.currentSession(), source: 'voice', sceneId: 'coffee', taskId: id, missionId: 'C01', messageId: `fixture-${id}`, answer: answers[index], supportLevel: 0, promptModality: 'audio-text' }, 'success');
      state.coveredGoals.add(id);
    });
    const ordered = Coffee.advanceMission(Coffee.missionInitial('C01'), 'A small latte for here.').world;
    state.coffee = Coffee.advanceMission(ordered, 'Thank you.').world;
    state.stage = 'complete'; state.completed = true; state.sessionSaved = false;
    state.dialogueHistory = [];
    addDialogueMessage('user', 'Thank you.'); addDialogueMessage('luma', 'Enjoy your coffee!', 'Mia');
    syncSceneProgress(); LumaVisuals.render(); scheduleReview();
    clearTimeout(state.toastTimer); toast.classList.remove('is-visible');
  });
  await page.waitForFunction(() => document.getElementById('backgroundPlane').getAttribute('src').includes('ready'));
  assert.ok(await page.locator('#resetButton').isHidden());
  assert.ok(await page.locator('#finishConversation').isVisible());
  assert.equal(await page.evaluate(() => state.reviewTimer), null, 'Cafe does not schedule a forced review transition');
  assert.ok(await page.locator('#reviewScreen').isHidden());
  await layout('complete');
  await page.click('#finishConversation');
  await page.locator('#reviewScreen.is-active').waitFor();
  assert.ok(await page.locator('#experience').isHidden());
  assert.deepEqual(errors, []);
  checks.push({ finishOpenedReview: true });
  writeFileSync(join(output, 'results.json'), JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
  console.log(JSON.stringify({ layouts: 6, finishOpenedReview: true, errors, output }));
})().catch(error => { console.error(error); process.exit(1); });

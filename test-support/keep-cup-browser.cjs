// Controlled local UI regression; no microphone or remote provider is used.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { resolve, join } = require('node:path');
let browser;
(async () => {
  const out = resolve(__dirname, '../qa-evidence/keep-cup'); mkdirSync(out, { recursive: true });
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 393, height: 754 } });
  const page = await context.newPage(), errors = [], checks = [];
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
  await page.evaluate(() => {
    // Replace audio output only. Order interpretation, evidence, UI and transition are real app functions.
    speak = async text => { addDialogueMessage('luma', text, 'Mia'); return true; };
    coffeeMissionProgress.completed = ['C01', 'C02'];
    state.selectedScene = 'coffee';
    startScene({ skipIntro: true, missionId: 'C03' });
    clearTimeout(state.promptTimer); state.promptTimer = null;
    clearIdleNudge();
  });
  async function reply(answer) {
    return page.evaluate(async answer => {
      const index = addDialogueMessage('user', answer);
      const message = state.dialogueHistory[index]; message.final = true; message.revision = 1;
      await requestLanguageFeedback(state.activeQuestion, answer, { ...captureUserTurnContext(),
        messageId: message.id, revision: 1, final: true });
      clearIdleNudge();
      return { stage: state.stage, size: state.coffee.size, delivered: state.coffee.delivered.size,
        complete: Coffee.missionComplete(state.coffee), acceptedAsDelivered: state.coffee.acceptedAsDelivered,
        attempts: LumaExperience.store.getProfile().attempts.map(item => ({ taskId: item.taskId, outcome: item.outcome })) };
    }, answer);
  }
  checks.push(await reply('Large.'));
  assert.equal(checks[0].acceptedAsDelivered, true); assert.equal(checks[0].size, 'large');
  assert.equal(checks[0].stage, 'task-complete');
  assert.equal(await page.locator('#orderSlots .is-wrong').count(), 0);
  assert.equal(checks[0].attempts.length, 0, 'keeping the cup is not a correction achievement');
  await page.waitForFunction(() => state.taskIndex === 1 && state.stage === 'active');
  checks.push(await reply('You too.'));
  assert.equal(checks[1].complete, true); assert.equal(checks[1].stage, 'complete');
  assert.ok(await page.locator('#finishConversation').isVisible());
  assert.equal(checks[1].attempts.some(item => item.taskId === 'coffee-size'), false);
  await page.waitForFunction(() => document.getElementById('backgroundPlane').getAttribute('src').includes('ready-togo'));
  await page.screenshot({ path: join(out, 'keep-large-complete-393.png') });
  await page.waitForFunction(() => document.getElementById('reviewScreen').classList.contains('is-active'), { timeout: 10000 });
  assert.equal(await page.locator('#missionResultTitle').textContent(), '这杯咖啡，就留下了');
  await page.evaluate(() => {
    startScene({ skipIntro: true, missionId: 'C03' });
    clearTimeout(state.promptTimer); state.promptTimer = null; clearIdleNudge();
  });
  checks.push(await reply("I'll keep the large one, thanks."));
  assert.equal(checks[2].stage, 'complete'); assert.equal(checks[2].complete, true);
  assert.ok(await page.locator('#finishConversation').isVisible());
  assert.equal(await page.locator('#orderSlots .is-wrong').count(), 0);
  assert.deepEqual(errors, []);
  writeFileSync(join(out, 'results.json'), JSON.stringify({ fixture: 'controlled app UI; not real speech', checks, errors }, null, 2));
  console.log(JSON.stringify({ scenarios: checks.length, errors }));
  await browser.close();
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1; });

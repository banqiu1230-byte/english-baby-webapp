// Isolated notes UI fixtures. No real microphone, provider, or learner outcome claim.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { resolve, join } = require('node:path');
const output = resolve(__dirname, '../qa-evidence/notes-refine');
mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const checks = [], errors = [];
  for (const fixture of ['due', 'progress', 'empty']) {
    const context = await browser.newContext({ viewport: { width: 393, height: 754 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__fixture = 'Controlled notes fixture; not actual learner evidence';
      navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Fixture microphone disabled', 'NotAllowedError'); };
    });
    await page.route('**/api/**', route => route.fulfill({ json: {} }));
    await page.goto(process.env.LUMA_TEST_URL || 'http://127.0.0.1:4174/', { waitUntil: 'networkidle' });
    await page.evaluate(fixture => {
      const store = LumaExperience.store;
      const add = (id, day, support, targetId, sceneId) => {
        const sessionId = store.beginSession({ sceneId, missionId: sceneId === 'coffee' ? 'C01' : null });
        store.recordAttempt({ id, sessionId, sceneId, targetId, taskId: sceneId === 'coffee' ? 'coffee-order' : 'breakfast-drink',
          source: 'voice', language: 'en', conditionsTracked: true, supportLevel: support,
          challengeType: 'guided', promptModality: 'audio-text', outcome: 'success',
          at: new Date(Date.now() - day * 86400000).toISOString() });
        store.completeSession({ id: sessionId, sceneId });
      };
      if (fixture !== 'empty') {
        add('previous-drink', 4, fixture === 'progress' ? 3 : 0, 'choose-drink', 'coffee');
        add('latest-drink', 2, fixture === 'progress' ? 0 : 3, 'choose-drink', 'coffee');
        add('helped-item', 2, 3, 'offer-item', 'kitchen');
      }
      LumaExperience.render();
    }, fixture);
    await page.click('#bottomNav [data-nav="growth"]');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.view-growth')).opacity === '1');
    assert.equal(await page.locator('#worldEvidenceSection').isVisible(), fixture === 'progress');
    assert.equal(await page.locator('#notesHistoryFold').getAttribute('open'), null);
    assert.equal(await page.locator('#notesPracticeFold').getAttribute('open'), null);
    for (const [width, height] of [[393, 754], [320, 568], [1146, 1202]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(60);
      const bounds = await page.evaluate(() => {
        const rect = id => document.getElementById(id).getBoundingClientRect();
        const action = rect('startReview'), root = rect('appShell'), nav = rect('bottomNav');
        return { actionTop: action.top, actionBottom: action.bottom, navTop: nav.top,
          visible: action.top >= root.top && action.bottom <= nav.top && action.left >= root.left && action.right <= root.right && action.height >= 44,
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          imageLoaded: document.getElementById('notesReviewImage').naturalWidth > 0 };
      });
      checks.push({ fixture, width, height, ...bounds });
      assert.ok(bounds.visible && !bounds.overflow && bounds.imageLoaded, JSON.stringify(checks.at(-1)));
      await page.screenshot({ path: join(output, `fixture-${fixture}-${width}x${height}.png`) });
    }
    await page.setViewportSize({ width: 393, height: 754 });
    await page.click('#notesHistoryFold > summary');
    assert.ok(await page.locator('#notesHistoryFold').getAttribute('open') !== null);
    if (fixture !== 'empty') {
      await page.click('#notesEvidenceHistory > summary');
      assert.ok(await page.locator('#notesEvidenceList .evidence-row').count() > 0);
    }
    // Real review button must reach the due scene even when its supporting
    // record belongs to a different scene than today's home continuation.
    await page.click('#notesHistoryFold > summary');
    await page.locator('.learning-notes-scroll').evaluate(element => { element.scrollTop = 0; });
    const expectedReview = await page.evaluate(() => LumaExperience.store.nextStep({ preferReview: true }));
    await page.click('#startReview');
    await page.locator('#sceneIntro').waitFor({ state: 'visible' });
    const entered = await page.evaluate(() => ({ scene: state.selectedScene, target: introOptions.reviewTargetIds || [], sessions: LumaExperience.store.getProfile().sessions.length }));
    if (expectedReview.kind === 'review') {
      assert.equal(entered.scene, expectedReview.sceneId);
      assert.deepEqual(entered.target, expectedReview.targetIds);
    }
    if (fixture === 'empty') assert.equal(entered.sessions, 0, 'Preview must not start a learning session');
    checks.push({ fixture, clickedReview: true, entered });
    await context.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(join(output, 'results.json'), JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
  console.log(JSON.stringify({ layouts: 9, reviewEntries: 3, errors, output }));
})().catch(error => { console.error(error); process.exit(1); });

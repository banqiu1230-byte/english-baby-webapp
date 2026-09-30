// Isolated notes UI fixtures. No real microphone, provider, or learner outcome claim.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { resolve, join } = require('node:path');
const output = resolve(__dirname, '../qa-evidence/notes-refine');
mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const checks = [], errors = [], failedResources = [];
  try { for (const fixture of ['due', 'progress', 'empty', 'upcoming']) {
    const context = await browser.newContext({ viewport: { width: 393, height: 754 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${fixture}: ${error.message}`));
    page.on('response', response => { if (response.status() >= 400) failedResources.push(`${fixture}: ${response.status()} ${response.url()}`); });
    await page.addInitScript(() => {
      window.__fixture = 'Controlled notes fixture; not actual learner evidence';
      window.__microphoneRequests = 0;
      navigator.mediaDevices.getUserMedia = async () => { window.__microphoneRequests++; throw new DOMException('Fixture microphone disabled', 'NotAllowedError'); };
      window.WebSocket = class {
        static OPEN = 1; static CLOSED = 3;
        constructor() { this.readyState = 1; this.bufferedAmount = 0; setTimeout(() => {
          if (this.readyState !== 1) return;
          this.onopen?.(); this.onmessage?.({ data: '{"type":"session.created"}' });
        }, 10); }
        send() {} close() { this.readyState = 3; }
      };
    });
    await page.route('**/api/**', route => route.fulfill({ json: {} }));
    await page.goto(process.env.LUMA_TEST_URL || 'http://127.0.0.1:4174/', { waitUntil: 'networkidle' });
    assert.deepEqual(errors, [], 'Each fixture starts without a page error');
    assert.equal(await page.evaluate(() => state.activeView), 'world');
    assert.equal(await page.evaluate(() => typeof LumaNavigation?.render), 'function');
    await page.evaluate(fixture => {
      const store = LumaExperience.store;
      const add = (id, day, support, targetId, sceneId) => {
        const sessionId = store.beginSession({ sceneId, missionId: sceneId === 'coffee' ? 'C01' : null, scope: 'target-practice' });
        store.recordAttempt({ id, sessionId, sceneId, targetId, taskId: sceneId === 'coffee' ? 'coffee-order' : 'breakfast-drink',
          source: 'voice', language: 'en', conditionsTracked: true, supportLevel: support,
          utterance: fixture === 'progress' && id === 'latest-drink' ? 'A latte, please.' : null,
          heardQuestion: fixture === 'progress' && id === 'latest-drink' ? 'What would you like today?' : null,
          challengeType: 'guided', promptModality: 'audio-text', outcome: 'success',
          at: new Date(Date.now() - day * 86400000).toISOString() });
        store.completeSession({ id: sessionId, sceneId });
      };
      if (fixture === 'upcoming') {
        add('recent-drink', 0, 3, 'choose-drink', 'coffee');
      } else if (fixture !== 'empty') {
        add('previous-drink', 4, fixture === 'progress' ? 3 : 0, 'choose-drink', 'coffee');
        add('latest-drink', 2, fixture === 'progress' ? 0 : 3, 'choose-drink', 'coffee');
        add('helped-item', 2, 3, 'offer-item', 'kitchen');
      }
      LumaExperience.render();
    }, fixture);
    await page.click('#bottomNav [data-nav="growth"]');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.view-growth')).opacity === '1');
    assert.equal(await page.locator('.learning-notes-header').count(), 0, 'Learning starts directly with the review card');
    assert.equal(await page.locator('#worldEvidenceSection').count(), 0, 'The quote showcase has been removed while evidence stays in history');
    assert.equal(await page.locator('#sceneDictionary .dictionary-scene').count(), 4);
    assert.equal(await page.locator('#notesHistoryFold').getAttribute('open'), null);
    assert.equal(await page.locator('#notesPracticeFold').count(), 0, 'Learning keeps one review entry, without a separate repeat-practice card');
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
    await page.click('#bottomNav [data-nav="profile"]');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.view-profile')).opacity === '1');
    assert.equal(await page.locator('#worldEvidenceSection').count(), 0);
    assert.equal(await page.evaluate(() => document.getElementById('bottomNav').inert), false, 'My tab must keep navigation operable');
    assert.equal(await page.locator('#personalCompleted').textContent(), '0', 'Short-practice history must not become life event completions');
    assert.equal(await page.locator('#personalXP').textContent(), '0');
    if (fixture === 'progress') {
      const source = await page.evaluate(() => LumaExperience.store.getProfile().attempts.find(attempt => attempt.id === 'latest-drink'));
      assert.equal(source.heardQuestion, 'What would you like today?');
      assert.equal(source.utterance, 'A latte, please.');
    }
    await page.click('#notesHistoryFold > summary');
    assert.ok(await page.locator('#notesHistoryFold').getAttribute('open') !== null);
    if (fixture !== 'empty') {
      await page.click('#notesEvidenceHistory > summary');
      assert.ok(await page.locator('#notesEvidenceList .evidence-row').count() > 0);
    }
    // Real review button must reach the due scene even when its supporting
    // record belongs to a different scene than today's home continuation.
    await page.click('#notesHistoryFold > summary');
    await page.click('#bottomNav [data-nav="growth"]');
    await page.locator('.learning-notes-scroll').evaluate(element => { element.scrollTop = 0; });
    const expectedReview = await page.evaluate(() => LumaExperience.store.nextStep({ preferReview: true }));
    const sessionsBefore = await page.evaluate(() => LumaExperience.store.getProfile().sessions.length);
    await page.click('#startReview');
    if (expectedReview.kind === 'review') {
      await page.locator('#sceneIntro').waitFor({ state: 'visible' });
      const entered = await page.evaluate(() => ({ scene: state.selectedScene, target: introOptions.reviewTargetIds || [], sessions: LumaExperience.store.getProfile().sessions.length }));
      assert.equal(entered.scene, expectedReview.sceneId);
      assert.deepEqual(entered.target, expectedReview.targetIds);
      assert.equal(await page.evaluate(() => state.sessionScope), 'target-practice');
      checks.push({ fixture, clickedReview: true, entered });
    } else {
      assert.equal(await page.locator('#reviewOverviewTitle').textContent(), '今天没有待复习');
      assert.equal(await page.locator('#startReview').textContent(), '看看情景词典');
      if (fixture === 'upcoming') assert.match(await page.locator('#reviewOverviewCopy').textContent(), /下一次复习在/);
      await page.waitForFunction(() => {
        const dictionary = document.querySelector('#sceneDictionary .dictionary-scene').getBoundingClientRect();
        const nav = document.getElementById('bottomNav').getBoundingClientRect();
        return dictionary.top >= document.getElementById('appShell').getBoundingClientRect().top && dictionary.bottom <= nav.top;
      });
      assert.equal(await page.locator('#sceneIntro').isVisible(), false);
      assert.equal(await page.evaluate(() => state.activeView), 'growth');
      assert.equal(await page.evaluate(() => LumaExperience.store.getProfile().sessions.length), sessionsBefore);
      assert.equal(await page.evaluate(() => window.__microphoneRequests), 0);
      checks.push({ fixture, browsedDictionary: true, noSessionOrMicrophone: true });
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(failedResources, []);
  writeFileSync(join(output, 'results.json'), JSON.stringify({ checks, errors, failedResources }, null, 2));
  console.log(JSON.stringify({ layouts: 12, reviewEntries: 2, dictionaryEntries: 2, personalHistoryEntries: 4, errors, failedResources, output }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });

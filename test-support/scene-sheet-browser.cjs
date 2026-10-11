// Preview-sheet regression: real layout and entry buttons, no live microphone or provider.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve(__dirname, '../qa-evidence/scene-sheet');
fs.mkdirSync(output, { recursive: true });
const base = process.env.LUMA_TEST_URL || 'http://127.0.0.1:4174/';

async function geometry(page) {
  return page.evaluate(() => {
    const box = selector => {
      const element = document.querySelector(selector), r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height,
        scrollHeight: element.scrollHeight, clientHeight: element.clientHeight };
    };
    return {
      panel: box('#sceneSheet .sheet-panel'), scroll: box('#sceneSheet .sheet-scroll'),
      copy: box('#sceneSheet .sheet-copy'), title: box('#sheetTitle'), description: box('#sheetDescription'),
      events: box('#sheetEvents'), cta: box('#sheetCta'),
      overflow: document.querySelector('#sceneSheet .sheet-scroll').scrollWidth > document.querySelector('#sceneSheet .sheet-scroll').clientWidth,
    };
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const results = [], errors = [];
  try {
    for (const [width, height] of [[320, 568], [393, 852], [430, 932]]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Fixture', 'NotAllowedError'); };
        window.WebSocket = class { static OPEN = 1; constructor() { this.readyState = 3; } close() {} send() {} };
      });
      await page.route('**/api/**', route => route.fulfill({ json: {} }));
      await page.goto(base, { waitUntil: 'networkidle' });
      await page.locator('#allWorldPlaces').click();
      await page.locator('[data-place-select="coffee"]').click();
      await page.locator('#sceneSheet.is-open').waitFor();
      assert.equal(await page.locator('#sheetEvents').evaluate(node => node.hidden), false, 'Coffee task group is not hidden');
      assert.equal(await page.locator('#sheetEventList [data-world-event="C01"]').isVisible(), true, 'Coffee tasks are visible without expansion');
      await page.waitForFunction(() => document.querySelector('#sheetImage').complete && document.querySelector('#sheetImage').naturalWidth > 0);
      await page.locator('#sheetImage').evaluate(image => image.decode());
      await page.locator('#sceneSheet .sheet-scroll').evaluate(element => { element.scrollTop = 0; });
      const first = await geometry(page);
      assert.equal(first.overflow, false, 'preview has no horizontal overflow');
      assert.ok(first.cta.y >= 0 && first.cta.bottom <= height + 1, 'entry action stays in viewport');
      assert.ok(first.description.bottom <= first.copy.bottom, 'description is not clipped by its own copy region');
      assert.equal(first.title.x, first.events.x, 'description and choices use the same gutter');
      assert.equal(first.events.x, first.cta.x, 'choices and action use the same gutter');
      assert.equal(first.events.right, first.cta.right, 'right gutters match');
      await page.screenshot({ path: path.join(output, `coffee-${width}.png`) });
      const ctaY = first.cta.y;
      for (const mission of ['C01', 'C02', 'C03', 'C04']) {
        const choice = page.locator(`#sheetEventList [data-world-event="${mission}"]`);
        await choice.click();
        assert.equal(await choice.getAttribute('aria-pressed'), 'true', `${mission} is selectable`);
        await page.locator('#sceneSheet .sheet-scroll').evaluate(element => { element.scrollTop = 0; });
        const current = await geometry(page);
        assert.equal(current.cta.y, ctaY, 'switching missions does not move the entry button');
        assert.ok(current.description.bottom <= current.copy.bottom, 'every selected description can render fully');
        assert.equal(current.overflow, false);
        await page.locator('#sheetCta').click();
        await page.locator('#sceneIntro:not([hidden])').waitFor();
        assert.equal(await page.evaluate(() => state.coffeeMissionId), mission, 'entry opens the selected mission');
        await page.locator('#introBack').click();
        await page.evaluate(mission => LumaExperience.previewScene('coffee', mission), mission);
      }
      await page.locator('#sceneSheet .sheet-scroll').evaluate(element => { element.scrollTop = element.scrollHeight; });
      await page.screenshot({ path: path.join(output, `coffee-choices-${width}.png`) });
      const end = await geometry(page);
      assert.ok(end.events.bottom <= end.scroll.bottom + 1, 'last choices can scroll completely above the fixed action');
      assert.equal(end.cta.y, ctaY, 'scrolling content keeps the action fixed');
      // Interview has a longer choice list: keep its established brief and scrollable choices.
      await page.evaluate(() => LumaExperience.previewScene('interview', 'I01'));
      for (const mission of ['I01', 'I02', 'I03', 'I04', 'I05', 'I06', 'I07']) {
        await page.locator(`#sheetEventList [data-world-event="${mission}"]`).click();
        const current = await geometry(page);
        assert.ok(current.cta.y >= 0 && current.cta.bottom <= height + 1);
        assert.ok(current.title.y >= current.copy.y && current.title.bottom <= current.copy.bottom);
        assert.ok(current.description.bottom <= current.copy.bottom);
        assert.equal(current.overflow, false);
      }
      await page.screenshot({ path: path.join(output, `interview-${width}.png`) });
      results.push({ width, height, fourCoffeeMissions: true, sevenInterviewChoices: true, consistentGutters: true, fixedAction: true });
      await page.close();
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ results, output }, null, 2));
  } finally {
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ results, errors }, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

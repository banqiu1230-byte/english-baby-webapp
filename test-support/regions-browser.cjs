// Controlled mobile UI fixtures: actual navigation and map, no learner data or provider calls.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const output = process.env.LUMA_REGIONS_OUTPUT || '/tmp/luma-regions-browser';
mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const results = [];
  try {
    for (const [width, height] of [[393, 852], [320, 568], [430, 932], [884, 1151]]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, reducedMotion: 'reduce' });
      const page = await context.newPage(), errors = [], requests = [], failedResources = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.status() >= 400) failedResources.push(`${response.status()} ${response.url()}`); });
      await page.addInitScript(() => {
        window.__regionsFixture = { micCalls: 0 };
        navigator.mediaDevices.getUserMedia = async () => {
          window.__regionsFixture.micCalls++;
          throw new DOMException('Controlled microphone disabled', 'NotAllowedError');
        };
        window.WebSocket = class { static OPEN = 1; static CLOSED = 3; constructor() { this.readyState = 3; } send() {} close() {} };
      });
      await page.route('**/api/**', route => {
        requests.push(route.request().url());
        return route.fulfill({ json: {} });
      });
      const visiblePins = () => page.locator('#worldMapMarkers [data-world-node]').evaluateAll(nodes => nodes.filter(n => n.getClientRects().length).map(n => n.dataset.worldNode));
      const records = () => page.evaluate(() => ({ sessions: LumaExperience.store.getProfile().sessions, checkpoints: LumaExperience.store.getCheckpoints() }));
      const tick = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const chooseRegion = async region => {
        await page.locator('#chooseWorldRegion').click();
        await page.locator(`#worldPlacesDialog [data-region-select="${region}"]`).click();
        await tick();
      };
      const choosePlace = async scene => {
        await page.locator('#allWorldPlaces').click();
        await page.locator(`#worldPlacesDialog [data-place-select="${scene}"]`).click();
        await page.locator('#sceneSheet[aria-hidden="false"]').waitFor();
      };
      const checks = [];
      try {
        await page.goto(process.env.LUMA_TEST_URL || 'http://127.0.0.1:4174/', { waitUntil: 'networkidle' });
        assert.deepEqual(failedResources, [], 'World scripts and artwork must be served successfully');
        await page.waitForFunction(() => !!window.LumaExperience?.store && !!window.LumaWorldMap && !!window.LumaWorldRegions);
        assert.deepEqual((await visiblePins()).sort(), ['coffee', 'future', 'kitchen']);
        assert.equal(await page.locator('#worldMapMarkers [data-world-node]').count(), 6, 'Markers are generated once across regions');
        const empty = await records();
        assert.deepEqual(empty, { sessions: [], checkpoints: [] });
        await page.screenshot({ path: join(output, `district-${width}.png`) });

        await page.locator('#chooseWorldRegion').click();
        const dialog = page.locator('#worldPlacesDialog');
        assert.equal(await dialog.evaluate(node => node.open), true);
        assert.deepEqual(await dialog.locator('[data-region-select]').evaluateAll(nodes => nodes.map(n => n.dataset.regionSelect).sort()), ['airport', 'district', 'work']);
        assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true, 'Region dialog owns keyboard focus');
        for (let i = 0; i < 8; i++) {
          await page.keyboard.press('Tab');
          // Native Chromium dialogs may expose BODY for one browser-chrome tab stop.
          assert.equal(await dialog.evaluate(node => node.contains(document.activeElement) || document.activeElement === document.body), true, 'Dialog focus cannot move to background controls');
        }
        await page.screenshot({ path: join(output, `regions-${width}.png`) });
        await page.keyboard.press('Escape');
        assert.equal(await dialog.evaluate(node => node.open), false);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'chooseWorldRegion', 'Escape returns focus to region chooser');
        checks.push('region chooser, focus trap and Escape');

        await chooseRegion('work');
        assert.deepEqual((await visiblePins()).sort(), ['interview', 'office']);
        assert.equal(await page.locator('#worldContinuePlace').textContent(), '职场 · 初次见面');
        assert.equal(await page.locator('#adventureCta').getAttribute('data-open-scene'), 'office');
        assert.doesNotMatch(await page.locator('#worldContinueDetails').textContent(), /咖啡|Mia|点一杯/);
        const interviewThumb = await page.locator('[data-world-node="interview"] img').evaluate(async img => { await img.decode(); return { src: img.currentSrc, width: img.naturalWidth }; });
        assert.match(interviewThumb.src, /interview\/room\.png$/);
        assert.ok(interviewThumb.width > 0, 'Interview marker loads its authored room thumbnail');
        assert.deepEqual(await records(), empty, 'Browsing the workplace creates no session or checkpoint');
        await page.screenshot({ path: join(output, `work-${width}.png`) });
        checks.push('workplace region contains interview and existing office without starting practice');

        await chooseRegion('airport');
        assert.deepEqual(await visiblePins(), ['airport']);
        const airportImage = await page.locator('.world-map-art').evaluate(async img => { await img.decode(); return { src: img.currentSrc, width: img.naturalWidth, height: img.naturalHeight }; });
        assert.ok(airportImage.width > 0 && airportImage.height > 0, 'Airport map artwork is loaded');
        assert.doesNotMatch(airportImage.src, /world-life-map-v1\.png$/);
        assert.deepEqual(await records(), empty, 'Browsing a different region creates no session or checkpoint');
        await page.screenshot({ path: join(output, `airport-${width}.png`) });
        await page.locator('#mapRecenter').click();
        assert.equal(await page.locator('#worldMapViewport').getAttribute('data-map-scale'), '1.120', 'Locate restores default camera without a current event');
        assert.deepEqual(await records(), empty);
        checks.push('airport region artwork and empty-state locate');

        await page.locator('#allWorldPlaces').click();
        assert.deepEqual(await dialog.locator('[data-place-select]').evaluateAll(nodes => nodes.map(n => n.dataset.placeSelect).sort()), ['airport', 'coffee', 'interview', 'kitchen', 'office', 'street']);
        await page.screenshot({ path: join(output, `all-places-${width}.png`) });
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'allWorldPlaces');
        await page.locator('#allWorldPlaces').click();
        await page.locator('#closeWorldPlaces').click();
        await tick();
        assert.equal(await dialog.evaluate(node => node.open), false);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'allWorldPlaces', 'Explicit close returns focus to places entry');
        for (const scene of ['coffee', 'kitchen', 'airport', 'office', 'interview']) {
          await choosePlace(scene);
          assert.equal(await dialog.evaluate(node => node.open), false, 'Place selection closes the location list before opening its sheet');
          assert.equal(await page.locator('#sheetCta').isEnabled(), true, `${scene} is available`);
          assert.equal(await page.evaluate(() => sheetSelection.sceneId), scene);
          assert.ok((await visiblePins()).includes(scene));
          await page.locator('.sheet-close').click();
          await tick();
          assert.deepEqual(await records(), empty, `${scene} preview preserves learner records`);
          assert.equal(await page.evaluate(() => document.activeElement?.getClientRects().length > 0), true, 'Closing preview restores focus to a visible control');
        }
        await choosePlace('street');
        assert.equal(await page.locator('#sheetCta').isDisabled(), true, 'Future location must not start an unavailable event');
        await page.locator('.sheet-close').click();
        assert.deepEqual(await records(), empty);
        checks.push('all existing place previews and future-location boundary');

        await choosePlace('coffee');
        assert.equal(await page.locator('#sheetEventList [data-world-event]').count(), 4, 'One cafe entry contains all four authored events');
        if (!await page.locator('#sheetEvents').evaluate(node => node.open)) await page.locator('#sheetEvents > summary').click();
        for (const mission of ['C01', 'C02', 'C03', 'C04']) {
          await page.locator(`#sheetEventList [data-world-event="${mission}"]`).click();
          assert.equal(await page.evaluate(() => sheetSelection.missionId), mission);
          assert.equal(await page.locator(`#sheetEventList [data-world-event="${mission}"]`).getAttribute('aria-pressed'), 'true');
        }
        assert.deepEqual(await records(), empty, 'Changing a scene-sheet event only changes the preview');
        await page.locator('#sheetCta').click();
        await page.locator('#sceneIntro').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#coffeeMissionBoard [data-coffee-mission]').count(), 4);
        for (const mission of ['C01', 'C02', 'C03', 'C04']) {
          await page.locator(`#coffeeMissionBoard [data-coffee-mission="${mission}"]`).click();
          assert.equal(await page.evaluate(() => state.coffeeMissionId), mission);
        }
        await page.locator('#introBack').click();
        assert.deepEqual(await records(), empty, 'Choosing a mission remains a preview until explicit start');
        assert.equal(await page.evaluate(() => __regionsFixture.micCalls), 0);
        checks.push('coffee four-mission selection without session or microphone');

        await choosePlace('interview');
        assert.equal(await page.locator('#sheetEvents').evaluate(node => node.open), true, 'Interview drill selection is immediately visible');
        assert.equal(await page.locator('#sheetEventList [data-world-event]').count(), 7);
        for (const mission of ['I01', 'I02', 'I03', 'I04', 'I05', 'I06', 'I07']) {
          await page.locator(`#sheetEventList [data-world-event="${mission}"]`).click();
          assert.equal(await page.evaluate(() => sheetSelection.missionId), mission);
          assert.equal(await page.locator(`#sheetEventList [data-world-event="${mission}"]`).getAttribute('aria-pressed'), 'true');
          assert.equal(await page.locator('#sheetEvents').evaluate(node => node.open), true);
        }
        assert.deepEqual(await records(), empty, 'Selecting interview drills only changes the preview');
        await page.screenshot({ path: join(output, `interview-events-${width}.png`) });
        await page.locator('#sheetCta').click();
        await page.locator('#sceneIntro').waitFor({ state: 'visible' });
        assert.equal(await page.evaluate(() => state.interviewMissionId), 'I07');
        assert.equal(await page.locator('#interviewBrief').isVisible(), true);
        assert.equal(await page.locator('#interviewTopics li').count(), await page.evaluate(() => Interview.tasksFor('I07').length));
        assert.equal(await page.locator('#coffeeMissionBoard').isVisible(), false);
        assert.equal(await page.evaluate(() => __regionsFixture.micCalls), 0);
        await page.screenshot({ path: join(output, `interview-brief-${width}.png`) });
        await page.locator('#introBack').click();
        assert.deepEqual(await records(), empty, 'Opening the interview brief does not start a session');
        checks.push('seven interview drills, truthful full-mock briefing, no automatic microphone');

        const interviewSaved = await page.evaluate(() => {
          const store = LumaExperience.store;
          const id = store.beginSession({ sceneId: 'interview', missionId: 'I04', scope: 'life-event', mode: 'guided' });
          store.saveCheckpoint({ sessionId: id, sceneId: 'interview', missionId: 'I04', taskIndex: 2 });
          LumaExperience.render();
          return { sessions: store.getProfile().sessions, checkpoints: store.getCheckpoints() };
        });
        await page.reload({ waitUntil: 'networkidle' });
        await tick();
        assert.deepEqual((await visiblePins()).sort(), ['interview', 'office'], 'Interrupted interview restores workplace region');
        await chooseRegion('airport');
        await page.locator('#mapRecenter').click();
        await tick();
        assert.deepEqual(await visiblePins(), ['airport'], 'Locate stays with the task displayed in the browsed region');
        assert.equal(await page.locator('#worldMapViewport').getAttribute('data-map-scale'), '1.120');
        assert.equal(await page.locator('[data-world-node="interview"]').getAttribute('data-world-state'), 'pending');
        assert.equal(await page.locator('#adventureCta').getAttribute('data-open-scene'), 'airport');
        assert.deepEqual(await records(), interviewSaved);
        await choosePlace('interview');
        assert.equal(await page.evaluate(() => sheetSelection.missionId), 'I04', 'Place preview preserves interrupted drill identity');
        await page.locator('.sheet-close').click();
        assert.deepEqual(await records(), interviewSaved);
        await page.evaluate(() => {
          const checkpoint = LumaExperience.store.getCheckpoint({ sceneId: 'interview', missionId: 'I04' });
          LumaExperience.store.discardCheckpoint({ sessionId: checkpoint.sessionId });
          LumaExperience.render();
        });
        checks.push('interview checkpoint reload, regional locate and selected drill identity');

        // Current-event ownership is independent from browsing an unrelated region.
        const saved = await page.evaluate(() => {
          const store = LumaExperience.store;
          const id = store.beginSession({ sceneId: 'airport', scope: 'life-event', mode: 'guided' });
          store.saveCheckpoint({ sessionId: id, sceneId: 'airport', taskIndex: 1 });
          LumaExperience.render();
          return { sessions: store.getProfile().sessions, checkpoints: store.getCheckpoints() };
        });
        await page.reload({ waitUntil: 'networkidle' });
        await tick();
        assert.deepEqual(await visiblePins(), ['airport'], 'Reload starts in the current event region');
        await chooseRegion('district');
        assert.deepEqual((await visiblePins()).sort(), ['coffee', 'future', 'kitchen']);
        assert.deepEqual(await records(), saved, 'Region selection preserves an unfinished event exactly');
        assert.equal(await page.locator('[data-world-node="airport"]').getAttribute('data-world-state'), 'pending');
        await page.locator('#worldMapViewport').focus();
        await page.keyboard.press('+');
        await page.keyboard.press('ArrowDown');
        await page.locator('#mapRecenter').click();
        await tick();
        assert.deepEqual((await visiblePins()).sort(), ['coffee', 'future', 'kitchen'], 'Locate stays in the browsed district');
        assert.equal(await page.locator('#worldMapViewport').getAttribute('data-map-scale'), '1.120');
        assert.deepEqual(await records(), saved);
        const current = await page.locator('[data-world-node="coffee"]').boundingBox();
        const viewport = await page.locator('#worldMapViewport').boundingBox();
        assert.ok(current.x >= viewport.x && current.x + current.width <= viewport.x + viewport.width);
        assert.ok(current.y >= viewport.y && current.y + current.height <= viewport.y + viewport.height);
        checks.push('current airport reload and regional recenter preserve checkpoint');

        await chooseRegion('airport');

        const area = await page.locator('#worldMapViewport').boundingBox();
        await page.mouse.move(area.x + area.width / 2, area.y + area.height * .6);
        await page.mouse.wheel(0, -100);
        await page.waitForTimeout(60);
        assert.equal(await page.locator('.world-continue').evaluate(node => node.classList.contains('is-collapsed')), true);
        await page.locator('#worldContinueToggle').click();
        assert.equal(await page.locator('.world-continue').evaluate(node => node.classList.contains('is-collapsed')), false);
        assert.equal(await page.locator('#adventureCta').isVisible(), true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        await page.screenshot({ path: join(output, `current-airport-${width}.png`) });
        checks.push('exploring collapses current-event card; toggle recovers primary action');
        assert.deepEqual(await records(), saved);
        assert.deepEqual(errors, []);
        assert.deepEqual(failedResources, []);
        assert.deepEqual(requests, [], 'Pure world exploration never calls an AI endpoint');
        const browsingRequests = [...requests];
        // Finish through the actual CTA, with microphone/provider controlled above.
        await chooseRegion('airport');
        await page.locator('#worldContinueResume').click();
        await page.waitForFunction(() => state.sceneStarted && state.selectedScene === 'airport' && LumaExperience.currentSession());
        assert.equal(await page.evaluate(() => LumaExperience.store.getProfile().sessions.find(session => session.id === LumaExperience.currentSession())?.sceneId), 'airport', 'Continue starts the event displayed in the airport region');
        assert.deepEqual(errors, []);
        checks.push('collapsed regional continue reaches the original airport event');
        await page.locator('#exitScene').click();

        // Reproduce the reported mismatch: an older interview and a newer cafe checkpoint.
        const mixed = await page.evaluate(() => {
          const store = LumaExperience.store;
          const interview = store.beginSession({ sceneId: 'interview', missionId: 'I04', scope: 'life-event', mode: 'guided' });
          store.saveCheckpoint({ sessionId: interview, sceneId: 'interview', missionId: 'I04', taskIndex: 2 });
          const coffee = store.beginSession({ sceneId: 'coffee', missionId: 'C02', scope: 'life-event', mode: 'guided' });
          store.saveCheckpoint({ sessionId: coffee, sceneId: 'coffee', missionId: 'C02', taskIndex: 0 });
          LumaExperience.render();
          return { interview, coffee: store.getCheckpoint({sessionId: coffee}) };
        });
        await chooseRegion('work');
        assert.equal(await page.locator('#worldContinuePlace').textContent(), '职场 · 设计师面试');
        assert.equal(await page.locator('#worldContinueTitle').textContent(), await page.evaluate(() => Interview.getMission('I04').title));
        assert.equal(await page.locator('#adventureCta').getAttribute('data-open-scene'), 'interview');
        assert.equal(await page.locator('[data-world-node="interview"]').getAttribute('data-world-state'), 'current');
        await page.reload({ waitUntil: 'networkidle' });
        assert.equal(await page.locator('#worldRegionName').textContent(), '职场', 'Reload preserves the chosen region even when a cafe checkpoint is newer');
        assert.equal(await page.locator('#worldContinuePlace').textContent(), '职场 · 设计师面试');
        await page.locator('#mapRecenter').click();
        assert.equal(await page.locator('#worldMapViewport').getAttribute('data-map-scale'), '1.120');
        assert.equal(await page.locator('#worldRegionName').textContent(), '职场');
        await page.screenshot({ path: join(output, `work-matching-card-${width}.png`) });
        await page.locator('#adventureCta').click();
        await page.waitForFunction(id => state.sceneStarted && state.selectedScene === 'interview' && LumaExperience.currentSession() === id, mixed.interview);
        assert.equal(await page.evaluate(() => LumaExperience.currentSession()), mixed.interview);
        assert.equal(await page.evaluate(() => state.interviewMissionId), 'I04');
        assert.equal(await page.evaluate(() => state.taskIndex), 2, 'Continue restores the displayed interview checkpoint, not the newer coffee checkpoint');
        assert.deepEqual(await page.evaluate(id => LumaExperience.store.getCheckpoint({ sessionId: id }), mixed.coffee.sessionId), mixed.coffee);
        await page.locator('#exitScene').click();
        await chooseRegion('district');
        assert.equal(await page.locator('#worldContinuePlace').textContent(), '生活街区 · 街角咖啡店');
        assert.equal(await page.locator('#worldContinueTitle').textContent(), '朋友托你带一杯');
        await page.locator('#worldContinueResume').click();
        await page.waitForFunction(() => state.sceneStarted && state.selectedScene === 'coffee' && state.stage === 'active'
          && LumaExperience.store.getProfile().sessions.find(s => s.id === LumaExperience.currentSession())?.sceneId === 'coffee');
        assert.equal(await page.evaluate(() => state.coffeeMissionId), 'C02');
        assert.equal(await page.evaluate(id => LumaExperience.store.getCheckpoint({ sessionId: id })?.taskIndex, mixed.interview), 2,
          'Restarting the saved small coffee event does not overwrite interview progress');
        checks.push('work card, expanded CTA, reload and locate share the interview checkpoint; returning to district resumes the preserved coffee event');
        assert.deepEqual(errors, []);
        results.push({ width, height, checks, errors, browsingRequests, controlledSceneRequests: requests.slice(browsingRequests.length) });
        writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2));
      } finally { await context.close(); }
    }
    console.log(JSON.stringify({ fixtures: results.length, output, results }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

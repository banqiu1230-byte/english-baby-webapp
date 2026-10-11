// Isolated DOM fixture: real mouse/touch taps, plus deterministic two-pointer gestures.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { mkdirSync, writeFileSync } = require('node:fs');

async function verifyApplication(browser) {
  const output = process.env.LUMA_MAP_OUTPUT || '/tmp/luma-world-map-browser';
  mkdirSync(output, { recursive: true });
  const results = [];
  for (const [width, height] of [[393, 852], [320, 568], [430, 932], [884, 1151]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, reducedMotion: 'reduce' });
    try {
      const page = await context.newPage(), errors = [], failedResources = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.status() >= 400) failedResources.push(`${response.status()} ${response.url()}`); });
      await page.addInitScript(() => {
        navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Controlled fixture', 'NotAllowedError'); };
        window.WebSocket = class { static OPEN = 1; static CLOSED = 3; constructor() { this.readyState = 3; } send() {} close() {} };
      });
      await page.route('**/api/**', route => route.fulfill({ json: {} }));
      await page.goto(process.env.LUMA_TEST_URL || 'http://127.0.0.1:4174/', { waitUntil: 'networkidle' });
      assert.deepEqual(failedResources, [], 'World scripts and images are available');
      await page.waitForFunction(() => !!window.LumaWorldMap && !!window.LumaExperience && !!window.LumaWorldRegions);
      const geometry = () => page.evaluate(() => {
        const viewport = document.getElementById('worldMapViewport'), canvas = document.getElementById('worldMapCanvas');
        const matrix = new DOMMatrix(getComputedStyle(canvas).transform), bounds = viewport.getBoundingClientRect();
        const artwork = canvas.querySelector('.world-map-art').getBoundingClientRect();
        const header = document.querySelector('.world-life-header').getBoundingClientRect();
        const toolbar = document.querySelector('.world-region-toolbar').getBoundingClientRect();
        const controls = document.querySelector('.map-controls').getBoundingClientRect();
        const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
          * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        return { scale: matrix.a, x: matrix.e, y: matrix.f, width: innerWidth, height: innerHeight,
          headerGap: toolbar.top - header.bottom, controlsTop: controls.top, toolbarTop: toolbar.top,
          rebounding: viewport.classList.contains('is-rebounding'),
          artworkFills: artwork.left <= bounds.left && artwork.top <= bounds.top
            && artwork.right >= bounds.right && artwork.bottom >= bounds.bottom,
          viewport: bounds.toJSON(), overflow: document.documentElement.scrollWidth > innerWidth + 1,
          pins: [...document.querySelectorAll('[data-world-node]')].map(node => {
            const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
            const art = node.querySelector('.world-node-art').getBoundingClientRect();
            const label = node.querySelector('.world-node-copy').getBoundingClientRect();
            const scaledAncestors = [];
            for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
              const transform = getComputedStyle(ancestor).transform;
              const ancestorMatrix = new DOMMatrix(transform);
              if (Math.abs(Math.hypot(ancestorMatrix.a, ancestorMatrix.b) - 1) > .001
                || Math.abs(Math.hypot(ancestorMatrix.c, ancestorMatrix.d) - 1) > .001) {
                scaledAncestors.push(ancestor.id || ancestor.className);
              }
            }
            return { art: art.toJSON(), label: label.toJSON(), hidden: !node.getClientRects().length,
              inCanvas: canvas.contains(node), inMarkerOverlay: node.parentElement.id === 'worldMapMarkers',
              transform: style.transform, scaledAncestors,
              pixelPosition: { x: rect.left * devicePixelRatio, y: rect.top * devicePixelRatio },
              anchor: { x: rect.left + rect.width / 2, y: rect.top },
              expectedAnchor: { x: bounds.left + matrix.e + parseFloat(style.getPropertyValue('--map-x')) * viewport.clientWidth * matrix.a,
                y: bounds.top + matrix.f + parseFloat(style.getPropertyValue('--map-y')) * viewport.clientHeight * matrix.d }, id: node.dataset.worldNode, state: node.dataset.worldState, bounds: rect.toJSON(),
              obscured: ['.world-life-header', '.world-region-toolbar', '.world-continue', '.map-controls', '.bottom-nav']
                .filter(selector => document.querySelector(selector))
                .map(selector => ({ selector, area: overlap(rect, document.querySelector(selector).getBoundingClientRect()) }))
                .filter(item => item.area > 1) };
          }) };
      });
      const visibleDimensions = new Map();
      const assertFixedMarkers = (actual, baseline, phase) => {
        for (const pin of actual.pins) {
          if (pin.hidden) continue;
          const dimensionKey = `${pin.id}:${pin.state}`;
          const prior = visibleDimensions.get(dimensionKey) || baseline.pins.find(item => item.id === pin.id && item.state === pin.state && !item.hidden) || pin;
          visibleDimensions.set(dimensionKey, prior);
          assert.equal(pin.inCanvas, false, `${width}: ${phase} ${pin.id} is outside the scaled artwork`);
          assert.equal(pin.inMarkerOverlay, true, `${width}: ${phase} ${pin.id} belongs to the independent overlay`);
          assert.equal(pin.transform, 'none', `${width}: ${phase} ${pin.id} is not inverse-scaled`);
          assert.deepEqual(pin.scaledAncestors, [], `${width}: ${phase} ${pin.id} has no scaled ancestor`);
          for (const axis of ['x', 'y']) assert.ok(Math.abs(pin.pixelPosition[axis] - Math.round(pin.pixelPosition[axis])) < .02,
            `${width}: ${phase} ${pin.id} ${axis} position is pixel-aligned`);
          for (const part of ['bounds', 'art', 'label']) for (const dimension of ['width', 'height']) {
            assert.ok(Math.abs(pin[part][dimension] - prior[part][dimension]) < 1,
              `${width}: ${phase} ${pin.id} ${part}.${dimension} stays at screen size`);
          }
          for (const axis of ['x', 'y']) assert.ok(Math.abs(pin.anchor[axis] - pin.expectedAnchor[axis]) < 1,
            `${width}: ${phase} ${pin.id} ${axis} anchor follows map without drift (${pin.anchor[axis]} vs ${pin.expectedAnchor[axis]})`);
        }
      };
      await page.screenshot({ path: resolve(output, `world-new-${width}.png`) });
      const blockedControls = await page.evaluate(() => ['mapRecenter'].filter(id => {
        const node = document.getElementById(id), rect = node.getBoundingClientRect();
        return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('button') !== node;
      }));
      assert.deepEqual(blockedControls, [], `${width}: fixed map controls must receive pointer input`);
      await page.locator('#mapRecenter').click();
      assert.equal((await geometry()).scale, 1.12, 'No current event restores default view');
      assert.equal(await page.locator('#mapZoomIn, #mapZoomOut, #mapZoomLabel, .world-life-brand').count(), 0);
      assert.equal(await page.locator('.world-life-header').evaluate(n => getComputedStyle(n).backgroundImage), 'none');
      const image = await page.locator('.world-map-art').evaluate(async img => { await img.decode(); return { width: img.naturalWidth, height: img.naturalHeight, src: img.currentSrc }; });
      assert.equal(image.width, 1086); assert.equal(image.height, 1448);
      assert.match(image.src, /world-life-map-v1\.png$/);
      await page.evaluate(() => {
        const store = LumaExperience.store;
        const done = store.beginSession({ sceneId: 'kitchen', scope: 'life-event', mode: 'guided' });
        store.completeSession({ id: done, sceneId: 'kitchen' });
        const id = store.beginSession({ sceneId: 'coffee', scope: 'life-event', missionId: 'C02', mode: 'guided' });
        store.saveCheckpoint({ sessionId: id, sceneId: 'coffee', taskIndex: 0, missionId: 'C02' });
        LumaExperience.render(); LumaWorldMap.reset();
      });
      await page.screenshot({ path: resolve(output, `world-states-${width}.png`) });
      const initial = await geometry();
      assert.ok(Math.abs(initial.headerGap - 12) < .1, `${width}: region toolbar keeps a 12px gap below the actual stats card`);
      assert.equal(initial.controlsTop, initial.toolbarTop, `${width}: locate and region controls align`);
      assertFixedMarkers(initial, initial, 'initial default');
      results.push({ width, height, initial, errors });
      writeFileSync(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
      assert.equal(initial.overflow, false, `${width}: page must not overflow horizontally`);
      assert.deepEqual(Object.fromEntries(initial.pins.map(pin => [pin.id, pin.state])),
        { coffee: 'current', kitchen: 'complete', airport: 'new', office: 'new', interview: 'new', future: 'future' });
      assert.deepEqual(initial.pins.filter(pin => !pin.hidden).map(pin => pin.id).sort(), ['coffee', 'future', 'kitchen'], 'Initial region contains district places only');
      const covered = initial.pins.filter(pin => !pin.hidden && pin.obscured.length);
      assert.deepEqual(covered, [], `${width}: initial places must not be hidden behind fixed UI`);
      for (const pin of initial.pins.filter(pin => !pin.hidden)) assert.ok(pin.bounds.left >= initial.viewport.left - 1
        && pin.bounds.right <= initial.viewport.right + 1, `${width}: ${pin.id} must fit within map edges`);

      const coffee = page.locator('[data-world-node="coffee"]');
      const pin = await coffee.boundingBox();
      await page.mouse.move(pin.x + pin.width / 2, pin.y + pin.height / 2);
      await page.mouse.down();
      await page.mouse.move(pin.x + pin.width / 2 + 28, pin.y + pin.height / 2 + 14, { steps: 5 });
      await page.mouse.up();
      assert.equal(await page.locator('#sceneSheet').getAttribute('aria-hidden'), 'true', 'Dragging a real place must not open its sheet');
      await coffee.tap();
      assert.equal(await page.locator('#sceneSheet').getAttribute('aria-hidden'), 'false', 'A tap immediately after dragging opens the sheet');
      await page.locator('.sheet-close').click();
      assert.equal(await page.locator('#sceneSheet').getAttribute('aria-hidden'), 'true');

      const touchArea = await page.evaluate(() => {
        const map = document.getElementById('worldMapViewport').getBoundingClientRect();
        const top = Math.max(map.top, document.querySelector('.world-life-header').getBoundingClientRect().bottom);
        const bottom = Math.min(map.bottom, document.querySelector('.world-continue').getBoundingClientRect().top);
        return { x: map.left + map.width / 2, y: (top + bottom) / 2 };
      });
      const touchSession = await context.newCDPSession(page);
      const nativeTouch = (type, halfDistance) => touchSession.send('Input.dispatchTouchEvent', { type,
        touchPoints: type === 'touchEnd' ? [] : [-1, 1].map((direction, id) => ({ id,
          x: touchArea.x + direction * halfDistance, y: touchArea.y })) });
      const beforePinch = (await geometry()).scale;
      const beforeZoom = await geometry();
      await nativeTouch('touchStart', 25); await nativeTouch('touchMove', 40); await nativeTouch('touchEnd');
      const zoomed = await geometry();
      assert.ok(zoomed.scale > beforePinch + .1, 'Touch pinch zooms the actual app map');
      assert.equal(zoomed.scale, 1.6, 'Native pinch reaches the maximum map scale');
      assertFixedMarkers(zoomed, beforeZoom, 'pinch maximum');
      assert.ok(zoomed.pins.filter(pin => !pin.hidden).some(pin => Math.hypot(pin.anchor.x - beforeZoom.pins.find(item => item.id === pin.id).anchor.x,
        pin.anchor.y - beforeZoom.pins.find(item => item.id === pin.id).anchor.y) > 5), 'Locations move with map zoom');
      await page.screenshot({ path: resolve(output, `world-zoomed-${width}.png`) });
      assert.equal(await page.evaluate(() => visualViewport.scale), 1, 'Touch pinch does not zoom the document');
      assert.equal(await page.locator('#sceneSheet').getAttribute('aria-hidden'), 'true', 'Pinch never opens a location');
      await touchSession.detach();

      // Hit targets stay usable after map zoom; dragging a pin is still map navigation.
      const zoomPin = await coffee.boundingBox();
      await page.mouse.move(zoomPin.x + zoomPin.width / 2, zoomPin.y + 20);
      await page.mouse.down();
      await page.mouse.move(zoomPin.x + zoomPin.width / 2 + 22, zoomPin.y + 31, { steps: 4 });
      await page.mouse.up();
      assert.equal(await page.locator('#sceneSheet').getAttribute('aria-hidden'), 'true', 'Zoomed marker drag never opens a sheet');
      assertFixedMarkers(await geometry(), beforeZoom, 'zoomed drag');
      await coffee.tap();
      assert.equal(await page.locator('#sceneSheet').getAttribute('aria-hidden'), 'false', 'Zoomed fixed-size marker accepts a real tap');
      await page.locator('.sheet-close').click();

      await page.mouse.move(touchArea.x, touchArea.y);
      await page.mouse.wheel(0, 3000);
      await page.waitForTimeout(60);
      const wheelMinimum = await geometry();
      assert.equal(wheelMinimum.scale, 1, 'Wheel can return to minimum scale');
      assertFixedMarkers(wheelMinimum, beforeZoom, 'wheel minimum');
      await page.locator('#worldMapViewport').focus();
      await page.keyboard.press('+');
      await page.keyboard.press('-');
      const keyboardMinimum = await geometry();
      assert.equal(keyboardMinimum.scale, 1, 'Keyboard can return to minimum scale');
      assertFixedMarkers(keyboardMinimum, beforeZoom, 'keyboard minimum');
      await page.screenshot({ path: resolve(output, `world-minimum-${width}.png`) });

      // Real pointer input moves beyond the edge with resistance, then returns without exposing a blank edge.
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      const edge = keyboardMinimum.viewport;
      const dragFrom = { x: edge.left + 5, y: edge.top + edge.height * .55 };
      await page.mouse.move(dragFrom.x, dragFrom.y);
      await page.mouse.down();
      await page.mouse.move(dragFrom.x + 230, dragFrom.y + 180, { steps: 6 });
      const stretched = await geometry();
      assert.ok(stretched.x > 0 && stretched.x < 32 && stretched.y > 0 && stretched.y < 32,
        `${width}: outward drag is resisted and bounded`);
      assert.equal(stretched.artworkFills, true, `${width}: overscrolling never reveals empty canvas edges`);
      assertFixedMarkers(stretched, beforeZoom, 'elastic drag');
      await page.screenshot({ path: resolve(output, `world-elastic-${width}.png`) });
      await page.mouse.up();
      const released = await geometry();
      assert.equal(released.rebounding, true, `${width}: release starts a return animation`);
      await page.waitForFunction(() => !document.getElementById('worldMapViewport').classList.contains('is-rebounding'));
      const settled = await geometry();
      assert.equal(settled.x, 0); assert.equal(settled.y, 0);
      assert.equal(settled.artworkFills, true);
      assert.equal(await page.locator('#sceneSheet').getAttribute('aria-hidden'), 'true', 'Elastic drag does not activate a place');

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.mouse.move(edge.right - 5, dragFrom.y);
      await page.mouse.down();
      await page.mouse.move(edge.right - 230, dragFrom.y - 180, { steps: 6 });
      const oppositeEdge = await geometry();
      assert.ok(oppositeEdge.x < 0 && oppositeEdge.x > -32 && oppositeEdge.y < 0 && oppositeEdge.y > -32);
      assert.equal(oppositeEdge.artworkFills, true, `${width}: opposite edges retain artwork coverage`);
      await page.mouse.up();
      const reduced = await geometry();
      assert.equal(reduced.x, 0); assert.equal(reduced.y, 0);
      assert.equal(reduced.rebounding, false, 'Reduced motion returns to bounds immediately');
      results.at(-1).elastic = { maximumOffset: 32, coveredEdges: true, rebound: true, reducedMotion: true, headerGap: initial.headerGap };

      await page.locator('#worldMapViewport').focus();
      await page.keyboard.press('+');
      await page.locator('#mapRecenter').click();
      assert.equal((await geometry()).scale, 1.12, 'Locate always resets the zoom');
      assertFixedMarkers(await geometry(), beforeZoom, 'located default');
      // An unfinished event in any location is recoverable after zooming and panning away.
      for (const sceneId of ['kitchen', 'airport', 'office', 'interview', 'coffee']) {
        await page.evaluate(sceneId => {
          const store = LumaExperience.store;
          const id = store.beginSession({ sceneId, scope: 'life-event', missionId: sceneId === 'coffee' ? 'C02' : sceneId === 'interview' ? 'I04' : null });
          store.saveCheckpoint({ sessionId: id, sceneId, taskIndex: 0, missionId: sceneId === 'coffee' ? 'C02' : sceneId === 'interview' ? 'I04' : null });
          LumaExperience.render();
        }, sceneId);
        const beforeSceneZoom = await geometry();
        await page.locator('#worldMapViewport').focus();
        await page.keyboard.press('+'); await page.keyboard.press('+');
        await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown');
        assert.equal((await geometry()).scale, 1.6, 'Magnification stays within source-image limit');
        await page.locator('#mapRecenter').click();
        const located = await geometry(), current = located.pins.find(pin => pin.state === 'current');
        assert.equal(located.scale, 1.12, 'Recenter restores default scale for every current event');
        assertFixedMarkers(located, beforeSceneZoom, `locate ${sceneId}`);
        assert.equal(current?.id, sceneId);
        assert.equal(current.hidden, false, 'Locate changes region before positioning the current marker');
        assert.deepEqual(current.obscured, [], `${width}: current ${sceneId} stays clear of fixed UI`);
        assert.ok(current.bounds.top >= located.viewport.top && current.bounds.bottom <= located.viewport.bottom);
      }
      const before = await geometry();
      for (const view of ['growth', 'profile', 'world']) await page.locator(`.bottom-nav [data-nav="${view}"]`).click();
      const after = await geometry();
      assert.deepEqual([after.scale, after.x, after.y], [before.scale, before.x, before.y], 'Tabs preserve map camera');
      assert.deepEqual(errors, []);
      assert.deepEqual(failedResources, []);
      results.at(-1).fixedMarkers = { defaultScale: initial.scale, maximumScale: zoomed.scale,
        minimumScale: wheelMinimum.scale, dimensionsTolerance: '<1px', anchorTolerance: '<1px',
        independentOverlay: true, scaledAncestors: [], pixelAligned: true,
        zoomedTap: true, zoomedDragDoesNotOpen: true };
      results.at(-1).camera = { before: [before.scale, before.x, before.y], after: [after.scale, after.x, after.y] };
      writeFileSync(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
    } finally { await context.close(); }
  }
  return { sizes: results.length, output };
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const errors = [], checks = [];
  try {
    const page = await browser.newPage({ viewport: { width: 430, height: 740 }, hasTouch: true, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
      <style>
        * { box-sizing:border-box } body { margin:0 }
        [hidden] { display:none!important }
        #view { margin:20px 15px; position:relative; height:600px }
        #worldMapViewport { position:relative; width:100%; height:480px; overflow:hidden; touch-action:none }
        #worldMapCanvas { position:absolute; inset:0; background:#e0dec7 }
        #worldMapMarkers { position:absolute; inset:0; pointer-events:none }
        .world-node { position:absolute; width:60px; height:48px; touch-action:none; pointer-events:auto; transform:none }
        #coffee { --map-x:.42; --map-y:.57 } #airport { --map-x:.75; --map-y:.20 }
        .controls { margin-top:20px } button { min-width:44px; min-height:44px }
      </style>
      <section id="view" data-view="world">
        <div id="worldMapViewport"><div id="worldMapCanvas"></div><div id="worldMapMarkers">
          <button id="coffee" class="world-node" data-world-node="coffee" data-world-scene="coffee" data-world-state="current">Coffee</button>
          <button id="airport" class="world-node" data-world-node="airport" data-world-scene="airport">Airport</button>
        </div></div>
        <div class="controls"><button id="mapZoomIn">+</button><button id="mapZoomOut">−</button>
          <button id="mapRecenter" aria-label="回到当前地点">Current</button><span id="mapZoomLabel"></span></div>
      </section>`);
    await page.evaluate(() => {
      window.nodeClicks = 0;
      document.querySelectorAll('.world-node').forEach(node => node.addEventListener('click', () => window.nodeClicks++));
    });
    await page.addScriptTag({ path: resolve(__dirname, '../world-map.js') });
    const tick = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const state = () => page.evaluate(() => {
      const view = document.getElementById('worldMapViewport'), canvas = document.getElementById('worldMapCanvas');
      const matrix = new DOMMatrix(getComputedStyle(canvas).transform);
      const bounds = view.getBoundingClientRect(), art = canvas.getBoundingClientRect();
      return { scale: matrix.a, x: matrix.e, y: matrix.f, width: view.clientWidth, height: view.clientHeight,
        clicks: window.nodeClicks, dragging: view.classList.contains('is-dragging'),
        fills: art.left <= bounds.left + .1 && art.top <= bounds.top + .1 && art.right >= bounds.right - .1 && art.bottom >= bounds.bottom - .1 };
    });
    const near = (a, b, name, tolerance = .6) => assert.ok(Math.abs(a - b) < tolerance, `${name}: ${a} vs ${b}`);
    const reset = async () => {
      await page.evaluate(() => { window.LumaWorldMap.reset(); document.getElementById('mapZoomOut').click(); });
      await tick();
    };
    const pointer = (type, id, x, y, target = 'worldMapViewport') => page.evaluate(({ type, id, x, y, target }) => {
      const bounds = document.getElementById('worldMapViewport').getBoundingClientRect();
      document.getElementById(target).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true,
        pointerId: id, pointerType: 'touch', clientX: bounds.left + x, clientY: bounds.top + y,
        button: 0, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1 }));
    }, { type, id, x, y, target });
    await tick();

    near((await state()).scale, 1.12, 'initial map has room to pan', .001);
    assert.equal(await page.locator('#mapZoomOut').isDisabled(), false);
    assert.equal(await page.locator('#mapZoomIn').getAttribute('aria-label'), '放大地图');
    assert.equal(await page.locator('#mapRecenter').getAttribute('aria-label'), '回到当前地点');
    assert.equal(await page.locator('#mapZoomLabel').getAttribute('role'), 'status');
    assert.equal(await page.locator('#worldMapViewport').evaluate(node => getComputedStyle(node).touchAction), 'none');
    await page.locator('#coffee').tap();
    assert.equal((await state()).clicks, 1, 'A touch tap must activate a location');
    checks.push('initial accessibility and touch tap');

    await reset();
    await page.locator('#mapZoomIn').click();
    assert.equal((await state()).scale, 1.25);
    const map = await page.locator('#worldMapViewport').boundingBox();
    const beforeWheel = await state();
    const anchor = { x: 185, y: 205 };
    await page.mouse.move(map.x + anchor.x, map.y + anchor.y);
    await page.mouse.wheel(0, -130);
    await page.waitForFunction(() => Number(document.getElementById('worldMapViewport').dataset.mapScale) > 1.3);
    const afterWheel = await state();
    near((anchor.x - beforeWheel.x) / beforeWheel.scale, (anchor.x - afterWheel.x) / afterWheel.scale, 'wheel x anchor');
    near((anchor.y - beforeWheel.y) / beforeWheel.scale, (anchor.y - afterWheel.y) / afterWheel.scale, 'wheel y anchor');
    assert.ok(afterWheel.fills);
    checks.push('wheel scales around cursor');

    let node = await page.locator('#coffee').boundingBox();
    const clicksBeforeDrag = (await state()).clicks;
    await page.mouse.move(node.x + node.width / 2, node.y + node.height / 2);
    await page.mouse.down();
    await page.mouse.move(node.x + node.width / 2 + 65, node.y + node.height / 2 + 20, { steps: 6 });
    await page.mouse.up();
    assert.equal((await state()).clicks, clicksBeforeDrag, 'Dragging a location must not open it');
    await page.locator('#coffee').click();
    assert.equal((await state()).clicks, clicksBeforeDrag + 1, 'The very next tap remains usable');
    assert.ok((await state()).fills);
    checks.push('drag does not click; immediate next click works');

    await page.mouse.move(map.x + 60, map.y + 100);
    await page.mouse.down();
    await page.mouse.move(map.x + 1300, map.y + 1300, { steps: 3 });
    await page.mouse.up();
    let geometry = await state();
    near(geometry.x, 0, 'left edge clamp'); near(geometry.y, 0, 'top edge clamp'); assert.ok(geometry.fills);
    await page.mouse.move(map.x + 100, map.y + 100);
    await page.mouse.down();
    await page.mouse.move(map.x - 1300, map.y - 1300, { steps: 3 });
    await page.mouse.up();
    geometry = await state();
    near(geometry.x, geometry.width * (1 - geometry.scale), 'right edge clamp');
    near(geometry.y, geometry.height * (1 - geometry.scale), 'bottom edge clamp'); assert.ok(geometry.fills);
    checks.push('pan clamps all four edges');

    await reset();
    const touchSession = await page.context().newCDPSession(page);
    const nativeTouch = (type, points) => touchSession.send('Input.dispatchTouchEvent', { type,
      touchPoints: points.map(([id, x, y]) => ({ id, x: map.x + x, y: map.y + y })) });
    const beforeNative = (await state()).clicks;
    await nativeTouch('touchStart', [[41, 140, 230], [42, 240, 230]]);
    await nativeTouch('touchMove', [[41, 100, 230], [42, 280, 230]]);
    await nativeTouch('touchEnd', []);
    near((await state()).scale, 1.8, 'Chromium touch input scales map', .001);
    near(await page.evaluate(() => visualViewport.scale), 1, 'touch action prevents page zoom', .001);
    assert.equal((await state()).clicks, beforeNative, 'Native pinch must not activate locations');
    await touchSession.detach();
    checks.push('native Chromium touch pinch keeps page scale and does not click');

    await reset();
    await pointer('pointerdown', 21, 140, 230);
    await pointer('pointerdown', 22, 240, 230);
    await pointer('pointermove', 21, 90, 230);
    await pointer('pointermove', 22, 290, 230);
    geometry = await state();
    near(geometry.scale, 2, 'pinch scale', .001);
    near((190 - geometry.x) / geometry.scale, 190, 'pinch x anchor');
    near((230 - geometry.y) / geometry.scale, 230, 'pinch y anchor');
    await pointer('pointerup', 22, 290, 230);
    const beforeRemaining = await state();
    await pointer('pointermove', 21, 110, 240);
    geometry = await state();
    near(geometry.x, beforeRemaining.x + 20, 'one finger after pinch x');
    near(geometry.y, beforeRemaining.y + 10, 'one finger after pinch y');
    await pointer('pointercancel', 21, 110, 240);
    assert.equal((await state()).dragging, false);
    const beforeTap = (await state()).clicks;
    await page.locator('#coffee').tap();
    assert.equal((await state()).clicks, beforeTap + 1);
    checks.push('two pointer zoom and remaining finger pan');

    await page.locator('#mapRecenter').click();
    node = await page.locator('#coffee').boundingBox();
    near((await state()).scale, 1.12, 'locating resets zoom');
    assert.ok(node.x >= map.x && node.x + node.width <= map.x + map.width);
    assert.ok(node.y >= map.y && node.y + node.height <= map.y + map.height);
    assert.ok((await state()).fills, 'locating keeps image within bounds');
    await page.locator('#worldMapViewport').focus();
    await page.keyboard.press('+');
    near((await state()).scale, 1.37, 'keyboard zoom', .001);
    await page.keyboard.press('ArrowRight');
    const afterKeyboard = await state();
    await page.locator('#coffee').focus();
    await page.keyboard.press('+');
    near((await state()).scale, afterKeyboard.scale, 'keyboard only acts on map focus', .001);
    checks.push('recenter and scoped keyboard controls');

    await pointer('pointerdown', 31, 120, 150);
    await pointer('pointermove', 31, 160, 190);
    await page.evaluate(() => { document.getElementById('view').hidden = true; });
    await tick();
    await page.evaluate(() => { document.getElementById('view').hidden = false; });
    await tick();
    const beforeStaleMove = await state();
    await pointer('pointermove', 31, 260, 300);
    geometry = await state();
    near(geometry.x, beforeStaleMove.x, 'hidden view forgets pointer');
    near(geometry.scale, beforeStaleMove.scale, 'tab switch keeps map zoom', .001);
    near(geometry.y, beforeStaleMove.y, 'tab switch keeps map position');
    assert.equal(geometry.dragging, false);
    await page.setViewportSize({ width: 320, height: 640 });
    await tick();
    assert.ok((await state()).fills, 'Resize must not expose space around the map');
    checks.push('hidden view clears gesture and mobile resize clamps');

    await page.locator('#worldMapViewport').focus();
    await page.keyboard.press('0');
    near((await state()).scale, 1.12, 'keyboard reset', .001);
    await page.evaluate(() => {
      delete document.getElementById('coffee').dataset.worldState;
      document.getElementById('mapRecenter').setAttribute('aria-label', '查看全图');
    });
    await page.locator('#mapRecenter').click();
    near((await state()).scale, 1.12, 'no current location restores default scale', .001);
    assert.ok((await state()).fills);
    assert.equal(await page.locator('#mapRecenter').getAttribute('aria-label'), '查看全图');
    checks.push('no current location restores default view and retains dynamic label');
    for (let i = 0; i < 6; i++) await page.locator('#mapZoomIn').click();
    near((await state()).scale, 2.5, 'maximum zoom', .001);
    assert.equal(await page.locator('#mapZoomIn').isDisabled(), true);
    for (let i = 0; i < 6; i++) await page.locator('#mapZoomOut').click();
    near((await state()).scale, 1, 'minimum zoom', .001);
    assert.equal(await page.locator('#mapZoomOut').isDisabled(), true);
    assert.deepEqual(errors, []);
    checks.push('zoom limits and reduced-motion rendering');
    const application = process.argv.includes('--app') ? await verifyApplication(browser) : undefined;
    console.log(JSON.stringify({ checks, errors, application }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

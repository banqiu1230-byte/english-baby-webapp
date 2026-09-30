(() => {
  'use strict';

  const viewport = document.getElementById('worldMapViewport');
  const canvas = document.getElementById('worldMapCanvas');
  const markerLayer = document.getElementById('worldMapMarkers');
  if (!viewport || !canvas || !markerLayer) return;
  let markers = [];

  const zoomIn = document.getElementById('mapZoomIn');
  const zoomOut = document.getElementById('mapZoomOut');
  const recenter = document.getElementById('mapRecenter');
  const label = document.getElementById('mapZoomLabel');
  const MIN = 1, MAX = Math.max(MIN, Number(viewport.dataset.maxScale) || 2.5), DRAG_THRESHOLD = 6;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const initialScale = clamp(Number(viewport.dataset.initialScale) || 1.12, MIN, MAX);
  const pointers = new Map();
  let width = 0, height = 0, scale = initialScale, x = 0, y = 0;
  let originX = 0, originY = 0;
  let gesture = null, suppressClick = false, exploring = false;

  viewport.tabIndex = viewport.hasAttribute('tabindex') ? viewport.tabIndex : 0;
  if (!viewport.hasAttribute('aria-label')) viewport.setAttribute('aria-label', '世界地图，可拖动和缩放');
  viewport.setAttribute('aria-keyshortcuts', '+ - ArrowUp ArrowDown ArrowLeft ArrowRight 0');
  viewport.style.touchAction = 'none';
  viewport.style.userSelect = 'none';
  canvas.style.transformOrigin = '0 0';
  // Direct manipulation stays attached to the fingers, including reduced-motion mode.
  canvas.style.transition = 'none';
  if (zoomIn) zoomIn.setAttribute('aria-label', '放大地图');
  if (zoomOut) zoomOut.setAttribute('aria-label', '缩小地图');
  if (recenter && !recenter.hasAttribute('aria-label')) recenter.setAttribute('aria-label', '回到当前地点');
  if (label) { label.setAttribute('role', 'status'); label.setAttribute('aria-live', 'polite'); }

  function render() {
    x = clamp(x, width * (1 - scale), 0);
    y = clamp(y, height * (1 - scale), 0);
    canvas.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    // Keep pins outside the scaled canvas so their text and images are never resampled.
    const pixelRatio = window.devicePixelRatio || 1;
    const snap = value => Math.round(value * pixelRatio) / pixelRatio;
    for (const marker of markers) {
      marker.node.style.left = `${snap(originX + x + marker.x * width * scale - marker.width / 2) - originX}px`;
      marker.node.style.top = `${snap(originY + y + marker.y * height * scale) - originY}px`;
    }
    viewport.dataset.mapScale = scale.toFixed(3);
    if (zoomIn) zoomIn.disabled = scale >= MAX - .001;
    if (zoomOut) zoomOut.disabled = scale <= MIN + .001;
    if (label) {
      const value = `${Math.round(scale * 100)}%`;
      if (label.textContent !== value) label.textContent = value;
    }
  }

  function resize() {
    const nextWidth = viewport.clientWidth, nextHeight = viewport.clientHeight;
    if (!nextWidth || !nextHeight) { cancelPointers(); return; }
    const centerX = width ? (width / 2 - x) / (scale * width) : .5;
    const centerY = height ? (height / 2 - y) / (scale * height) : .5;
    width = nextWidth; height = nextHeight;
    const bounds = viewport.getBoundingClientRect();
    originX = bounds.left; originY = bounds.top;
    for (const marker of markers) {
      const style = getComputedStyle(marker.node);
      marker.x = Number(style.getPropertyValue('--map-x'));
      marker.y = Number(style.getPropertyValue('--map-y'));
      marker.width = marker.node.offsetWidth;
    }
    x = width / 2 - centerX * width * scale;
    y = height / 2 - centerY * height * scale;
    if (pointers.size) cancelPointers();
    render();
  }

  function refresh({ reset: resetCamera = false } = {}) {
    markers = [...markerLayer.querySelectorAll('[data-world-node]')]
      .filter(node => !node.hidden).map(node => ({ node }));
    resize();
    if (resetCamera) reset();
  }

  function announceExploration() {
    document.dispatchEvent(new CustomEvent('luma:map-explore'));
  }

  function point(event) {
    const bounds = viewport.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function zoomTo(value, center = { x: width / 2, y: height / 2 }) {
    const next = clamp(value, MIN, MAX);
    const ratio = next / scale;
    x = center.x - (center.x - x) * ratio;
    y = center.y - (center.y - y) * ratio;
    scale = next;
    render();
  }

  function startGesture() {
    const active = [...pointers.values()];
    if (active.length >= 2) {
      const [a, b] = active;
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      gesture = { type: 'pinch', distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        scale, anchorX: (center.x - x) / scale, anchorY: (center.y - y) / scale };
      suppressClick = true;
      viewport.classList.add('is-dragging');
    } else if (active.length === 1) {
      gesture = { type: 'drag', start: { x: active[0].x, y: active[0].y }, x, y,
        moved: suppressClick };
    } else {
      gesture = null;
      viewport.classList.remove('is-dragging');
    }
  }

  function release(pointerId, pointer) {
    try {
      if (pointer.target?.hasPointerCapture(pointerId)) pointer.target.releasePointerCapture(pointerId);
    } catch { /* The captured element may have been removed when changing views. */ }
  }

  function cancelPointers() {
    const captured = [...pointers.entries()];
    suppressClick = suppressClick || captured.length > 0;
    pointers.clear();
    gesture = null;
    viewport.classList.remove('is-dragging');
    captured.forEach(([id, pointer]) => release(id, pointer));
  }

  viewport.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!width || !height || !viewport.getClientRects().length) return;
    if (!pointers.size) { suppressClick = false; exploring = false; }
    const target = event.target instanceof Element ? event.target : viewport;
    pointers.set(event.pointerId, { ...point(event), target });
    // Capturing on the original target preserves a button's ordinary tap/click.
    try { target.setPointerCapture(event.pointerId); } catch { /* Synthetic or already ended pointer. */ }
    startGesture();
  });

  viewport.addEventListener('pointermove', event => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer || !gesture) return;
    if (event.pointerType === 'mouse' && !(event.buttons & 1)) { cancelPointers(); return; }
    Object.assign(pointer, point(event));
    const previousX = x, previousY = y, previousScale = scale;
    if (gesture.type === 'pinch') {
      const [a, b] = [...pointers.values()];
      const next = clamp(gesture.scale * Math.hypot(a.x - b.x, a.y - b.y) / gesture.distance, MIN, MAX);
      scale = next;
      x = (a.x + b.x) / 2 - gesture.anchorX * next;
      y = (a.y + b.y) / 2 - gesture.anchorY * next;
    } else {
      const dx = pointer.x - gesture.start.x, dy = pointer.y - gesture.start.y;
      if (!gesture.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      gesture.moved = true;
      suppressClick = true;
      viewport.classList.add('is-dragging');
      x = gesture.x + dx; y = gesture.y + dy;
    }
    event.preventDefault();
    render();
    if (!exploring && (x !== previousX || y !== previousY || scale !== previousScale)) {
      exploring = true;
      announceExploration();
    }
  });

  function endPointer(event) {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    pointers.delete(event.pointerId);
    release(event.pointerId, pointer);
    startGesture();
  }
  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);
  viewport.addEventListener('lostpointercapture', endPointer);
  viewport.addEventListener('click', event => {
    if (!suppressClick || event.detail === 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  viewport.addEventListener('dragstart', event => event.preventDefault());

  viewport.addEventListener('wheel', event => {
    event.preventDefault();
    if (pointers.size) cancelPointers();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
    const previousScale = scale;
    zoomTo(scale * Math.exp(-clamp(event.deltaY * unit, -250, 250) * .002), point(event));
    if (scale !== previousScale) announceExploration();
  }, { passive: false });

  function reset() {
    cancelPointers();
    scale = initialScale;
    x = width * (1 - scale) / 2; y = height * (1 - scale) / 2;
    render();
  }

  function focusMarker(current) {
    reset();
    if (!current || !current.getClientRects().length) return;
    const bounds = current.getBoundingClientRect(), viewportBounds = viewport.getBoundingClientRect();
    const map = viewport.closest('.life-world-map');
    const header = map?.querySelector('.world-life-header')?.getBoundingClientRect();
    const toolbar = map?.querySelector('.world-region-toolbar')?.getBoundingClientRect();
    const card = map?.querySelector('.world-continue')?.getBoundingClientRect();
    const top = Math.max(0, (header?.bottom ?? viewportBounds.top) - viewportBounds.top,
      (toolbar?.bottom ?? viewportBounds.top) - viewportBounds.top);
    const bottom = Math.min(height, (card?.top ?? viewportBounds.bottom) - viewportBounds.top);
    x += width / 2 - (bounds.left + bounds.width / 2 - viewportBounds.left);
    y += (top + bottom) / 2 - (bounds.top + bounds.height / 2 - viewportBounds.top);
    render();
  }

  function focusCurrent() {
    // The locator follows the regional task shown in the continue card.
    document.dispatchEvent(new CustomEvent('luma:map-locate'));
    refresh();
    focusMarker((markers.find(({ node }) => node.dataset.worldTarget === 'true')
      || markers.find(({ node }) => node.dataset.worldState === 'current'))?.node);
  }

  function focusPlace(sceneId) {
    refresh();
    focusMarker(markers.find(({ node }) => node.dataset.worldScene === sceneId
      || node.dataset.worldNode === sceneId)?.node);
  }

  viewport.addEventListener('keydown', event => {
    if (event.target !== viewport || event.altKey || event.ctrlKey || event.metaKey) return;
    const previousX = x, previousY = y, previousScale = scale;
    if (event.key === '+' || event.key === '=') zoomTo(scale + .25);
    else if (event.key === '-') zoomTo(scale - .25);
    else if (event.key === '0') focusCurrent();
    else if (event.key === 'ArrowLeft') { x += 48; render(); }
    else if (event.key === 'ArrowRight') { x -= 48; render(); }
    else if (event.key === 'ArrowUp') { y += 48; render(); }
    else if (event.key === 'ArrowDown') { y -= 48; render(); }
    else return;
    event.preventDefault();
    if (event.key !== '0' && (x !== previousX || y !== previousY || scale !== previousScale)) announceExploration();
  });

  zoomIn?.addEventListener('click', () => zoomTo(scale + .25));
  zoomOut?.addEventListener('click', () => zoomTo(scale - .25));
  recenter?.addEventListener('click', focusCurrent);
  window.addEventListener('blur', cancelPointers);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelPointers(); });
  const view = viewport.closest('[data-view]');
  if (view) new MutationObserver(() => {
    if (!viewport.getClientRects().length || view.getAttribute('aria-hidden') === 'true') cancelPointers();
    else resize();
  }).observe(view, { attributes: true, attributeFilter: ['hidden', 'class', 'aria-hidden'] });
  new ResizeObserver(resize).observe(viewport);
  refresh();
  window.LumaWorldMap = Object.freeze({ reset, focusCurrent, focusPlace, refresh });
})();

/* Region browsing is UI state only; scene/session ownership stays in LumaExperience. */
(() => {
  'use strict';
  const catalog = window.LumaWorldCatalog;
  const $ = id => document.getElementById(id);
  const markers = $('worldMapMarkers'), dialog = $('worldPlacesDialog');
  if (!catalog || !markers || !dialog) return;
  const el = (tag, text, className) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (className) n.className = className; return n; };
  const icon = name => { const n = el('i', null, `ph ph-${name}`); n.setAttribute('aria-hidden', 'true'); return n; };
  const button = (label, fn, className) => { const n = el('button', label, className); n.type = 'button'; n.addEventListener('click', fn); return n; };
  const thumb = place => { const n = el('img'); n.src = place.thumbnailImage || `./assets/optimized/${place.thumbnail}-thumb-220.jpg`; n.alt = ''; n.draggable = false; return n; };
  const REGION_KEY = 'luma-world-region-v1';
  let regionId = 'district', profile = {}, next = null, initialized = false, previousCurrent = null, savedRegion = false;
  let dialogMode = 'places', dialogTrigger = null, restoreDialogFocus = true;
  try { const saved = localStorage.getItem(REGION_KEY); if (catalog.region(saved)) { regionId = saved; savedRegion = true; } } catch { /* Browsing still works without storage. */ }
  const currentPlace = () => next?.kind === 'resume' ? catalog.place(next.sceneId) : null;
  const card = document.querySelector('.world-continue');
  function collapse(value) {
    card?.classList.toggle('is-collapsed', value);
    $('worldContinueToggle').setAttribute('aria-expanded', String(!value));
    $('worldContinueToggle').setAttribute('aria-label', value ? '展开当前事件' : '收起当前事件');
  }

  for (const place of catalog.places) {
    const node = el('button', null, 'world-node'); node.type = 'button';
    node.dataset.worldNode = place.nodeId; node.dataset.worldScene = place.id; node.dataset.region = place.regionId;
    const positions = { regular: place.position, small: place.smallPosition || place.position, short: place.shortPosition || place.smallPosition || place.position };
    for (const [size, position] of Object.entries(positions)) for (const [i, axis] of ['x', 'y'].entries()) node.style.setProperty(`--map-${axis}-${size}`, position[i]);
    const art = el('span', null, 'world-node-art'); art.append(thumb(place));
    const copy = el('span', null, 'world-node-copy'); copy.append(el('small'), el('strong', place.name));
    node.append(art, copy); node.addEventListener('click', () => collapse(false)); markers.append(node);
  }

  function updateStates() {
    for (const place of catalog.places) {
      const node = markers.querySelector(`[data-world-node="${place.nodeId}"]`), state = catalog.stateFor(place, profile, next);
      node.dataset.worldState = state; node.classList.toggle('is-current', state === 'current'); node.classList.toggle('is-complete', state === 'complete');
      node.dataset.worldTarget = String(place.id === next?.sceneId && place.regionId === regionId);
      node.querySelector('small').textContent = catalog.labels[state];
      node.setAttribute('aria-label', `${place.name}，${catalog.labels[state]}`);
    }
    $('mapRecenter').setAttribute('aria-label', next ? '恢复默认大小并定位当前任务' : '恢复默认视野');
    $('worldContinueTitle').textContent = next?.title || $('todayTitle').textContent;
    $('worldContinueResume').setAttribute('aria-label', `${next?.actionLabel || '进入任务'}：${next?.title || ''}`);
    const target = catalog.place(next?.sceneId), region = catalog.region(target?.regionId);
    $('worldContinuePlace').textContent = target ? `${region.name} · ${target.name}` : '生活里的下一件事';
  }

  function selectRegion(id, { reset = true, compact = true } = {}) {
    const region = catalog.region(id); if (!region) return false;
    const changed = regionId !== id;
    regionId = id;
    try { localStorage.setItem(REGION_KEY, id); } catch { /* Optional browsing preference. */ }
    $('worldMapViewport').dataset.region = id;
    $('worldMapViewport').setAttribute('aria-label', `${region.name}地图，可拖动和缩放。方向键移动，加减键缩放，0 定位当前任务。`);
    $('worldRegionName').textContent = region.name;
    $('chooseWorldRegion').setAttribute('aria-label', `切换区域，当前${region.name}`);
    const image = document.querySelector('.world-map-art');
    if (image.getAttribute('src') !== region.image) image.src = region.image;
    image.alt = region.alt;
    for (const node of markers.children) node.hidden = node.dataset.region !== id;
    if (compact) collapse(true);
    // The summary and its real CTA share the same regional recommendation.
    next = window.LumaExperience?.homeStep(id) || null;
    window.LumaExperience?.renderHome();
    updateStates(); window.LumaWorldMap?.refresh({ reset: reset || changed });
    return true;
  }

  function closeDialog(restore = true) { restoreDialogFocus = restore; dialog.close(); }
  function openPlace(id) {
    const place = catalog.place(id); if (!place) return;
    closeDialog(false);
    selectRegion(place.regionId, { compact: false });
    window.LumaWorldMap?.focusPlace(place.id);
    // Use the actual marker so closing the scene sheet restores focus on the map.
    markers.querySelector(`[data-world-node="${place.nodeId}"]`).click();
  }

  function renderDialog() {
    const content = $('worldPlacesContent'); content.replaceChildren();
    $('worldPlacesTitle').textContent = dialogMode === 'regions' ? '去哪里走走' : '全部地点';
    for (const region of catalog.regions) {
      const places = catalog.places.filter(p => p.regionId === region.id), current = currentPlace()?.regionId === region.id;
      if (dialogMode === 'regions') {
        const row = button('', () => { selectRegion(region.id); closeDialog(); }, 'region-choice'); row.dataset.regionSelect = region.id;
        row.setAttribute('aria-pressed', String(regionId === region.id));
        const image = el('img'); image.src = region.image; image.alt = '';
        const body = el('span', null, 'region-choice-copy'); body.append(el('strong', region.name), el('span', region.description), el('small', current ? '当前事件在这里' : `${places.filter(p => p.available).length} 处可进入`));
        row.append(image, body, icon(regionId === region.id ? 'check-circle' : 'caret-right')); content.append(row);
      } else {
        const section = el('section', null, 'world-place-group'); section.append(el('h3', region.name));
        for (const place of places) {
          const state = catalog.stateFor(place, profile, next), row = button('', () => openPlace(place.id), 'world-place-row'); row.dataset.placeSelect = place.id;
          row.dataset.state = state;
          const body = el('span', null, 'world-place-row-copy'); body.append(el('strong', place.name), el('small', catalog.labels[state]));
          row.append(thumb(place), body);
          if (place.events.length > 1) row.append(el('span', `${place.events.length} ${place.eventLabel || '件小事'}`, 'place-event-count'));
          row.append(icon('caret-right')); section.append(row);
        }
        content.append(section);
      }
    }
  }

  function openDialog(mode = 'places') {
    dialogMode = mode; dialogTrigger = document.activeElement; restoreDialogFocus = true; renderDialog();
    if (!dialog.open) dialog.showModal();
    $('closeWorldPlaces').focus({ preventScroll: true });
  }
  $('chooseWorldRegion').addEventListener('click', () => openDialog('regions'));
  $('allWorldPlaces').addEventListener('click', () => openDialog('places'));
  $('closeWorldPlaces').addEventListener('click', () => closeDialog());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDialog();
  });
  dialog.addEventListener('close', () => {
    if (restoreDialogFocus) (dialogTrigger?.isConnected && dialogTrigger.getClientRects().length ? dialogTrigger : $('allWorldPlaces')).focus({ preventScroll: true });
  });
  $('worldContinueToggle').addEventListener('click', () => collapse(!card.classList.contains('is-collapsed')));
  $('worldContinueResume').addEventListener('click', () => { collapse(false); $('adventureCta').click(); });
  document.addEventListener('luma:map-explore', () => collapse(true));
  document.addEventListener('luma:map-locate', () => { selectRegion(regionId, { reset: false, compact: false }); collapse(false); });

  function renderEvents(sceneId, selectedMission) {
    const group = $('sheetEvents'), list = $('sheetEventList'), place = catalog.place(sceneId);
    group.hidden = !place || place.events.length < 2;
    if (list.dataset.sceneId === sceneId && list.children.length === place?.events.length) {
      for (const item of list.children) item.setAttribute('aria-pressed', String(item.dataset.missionId === selectedMission));
      return;
    }
    list.replaceChildren(); list.dataset.sceneId = sceneId;
    if (group.hidden) return;
    if (sceneId === 'interview') group.open = true;
    const summary = group.querySelector('summary');
    if (summary) summary.textContent = sceneId === 'interview' ? '选择面试练习' : '这里可以做什么';
    for (const event of place.events) {
      const item = button(event.title, () => window.LumaExperience?.previewScene(sceneId, event.missionId), 'world-event-choice');
      item.dataset.worldEvent = event.id; item.dataset.missionId = event.missionId || ''; item.setAttribute('aria-pressed', String(event.missionId === selectedMission));
      list.append(item);
    }
  }
  function render(data, recommendation) {
    profile = data || {};
    const current = recommendation?.kind === 'resume' ? recommendation : null;
    const newlyActive = initialized && current && current.sessionId !== previousCurrent?.sessionId
      && (!previousCurrent || Date.parse(current.at) >= Date.parse(previousCurrent.at));
    const targetRegion = ((!initialized && !savedRegion) || newlyActive)
      ? catalog.place(current?.sceneId)?.regionId || regionId : regionId;
    selectRegion(targetRegion, { reset: targetRegion !== regionId, compact: false });
    initialized = true;
    // Keep the latest timestamp when completion exposes an older checkpoint elsewhere.
    if (current && (!previousCurrent || Date.parse(current.at) >= Date.parse(previousCurrent.at))) previousCurrent = current;
    if (dialog.open) renderDialog();
  }
  // A failed decorative image must not block the reachable scene entries.
  document.querySelector('.world-map-art').addEventListener('error', event => {
    if (event.target.dataset.failedRegion === regionId) return;
    event.target.dataset.failedRegion = regionId;
    window.LumaNavigation?.notify('地图图片暂未加载，地点仍可正常进入。');
  });
  selectRegion(regionId, { compact: false });
  window.LumaWorldRegions = { render, selectRegion, openPlaces: () => openDialog('places'), renderEvents, currentRegion: () => regionId };
})();

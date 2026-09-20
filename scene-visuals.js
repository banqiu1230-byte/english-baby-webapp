/* The picture is part of the conversation. These cues never accept an answer. */
const LumaVisuals = (() => {
  const point = (key, label, x, y, width, height, words = [key]) => ({ key, label, x, y, width, height, words });
  function frameFor(sceneId, taskId, world = {}) {
    if (sceneId === 'coffee') {
      const delivered = world.delivered || world.order || world;
      const isHere = delivered.service === 'here';
      const isAmericano = delivered.drink === 'americano';
      const isLarge = delivered.size === 'large';
      const handoverImage = !isHere ? 'ready-togo' : !isAmericano ? 'ready-here'
        : `ready-here-americano-${isLarge ? 'large' : 'small'}`;
      const frames = {
        'coffee-order': { image: 'order', caption: '柜台前 · 选一杯咖啡', selected: world.drink,
          points: [point('latte', 'latte', 35, 50, 31, 14, ['latte', '拿铁']), point('americano', 'americano', 65, 50, 31, 14, ['americano', '美式'])] },
        'coffee-size': { image: 'size', caption: world.missionId === 'C03'
          ? (world.repair?.resolved ? 'Mia 已换好 · 现在是小杯' : '取餐时 · 这杯看起来太大了')
          : '选杯型 · 小杯或大杯', selected: world.missionId === 'C03' ? world.delivered?.size : world.size,
          points: [point('small', 'small', 37, 49, 18, 13, ['small', '小杯']), point('large', 'large', 64, 46.5, 24, 19, ['large', '大杯'])] },
        'coffee-service': { image: 'service', caption: '选喝法 · 堂食或带走', selected: world.service,
          points: [point('here', 'for here', 34, 50, 34, 13, ['here', '堂食', '这里']), point('to-go', 'to go', 67.5, 48, 22, 17, ['to go', '带走', '打包'])] },
        'coffee-thanks': { image: handoverImage, caption: world.received ? '你的咖啡好了 · 享受这一杯' : '做好了 · 这是你点的咖啡', selected: 'ready',
          points: [isHere && isAmericano
            ? point('ready', 'americano', 51, 49.5, isLarge ? 30 : 22, isLarge ? 13 : 10, ['coffee', 'americano', '咖啡'])
            : isHere ? point('ready', 'for here', 51, 49.5, 32, 14, ['coffee', 'latte', '咖啡'])
            : point('ready', 'to go', 48, 45, 22, 15, ['coffee', 'latte', 'americano', '咖啡'])] },
      };
      const frame = frames[taskId];
      return frame ? { ...frame, answerCue: taskId !== 'coffee-thanks', image: `./assets/coffee/${frame.image}.webp` } : null;
    }
    if (sceneId === 'kitchen' && taskId === 'breakfast-drink') return {
      image: './assets/breakfast/fridge.webp', caption: '冰箱里 · 选你想喝的', selected: world.drink, answerCue: true,
      points: [point('milk', 'milk', 41, 39, 19, 27, ['milk', '牛奶']), point('water', 'water', 70, 39, 20, 27, ['water', '水'])],
    };
    if (sceneId === 'kitchen' && ['breakfast-cup', 'breakfast-more'].includes(taskId)) {
      const offered = taskId === 'breakfast-more' || world.cupPlaced;
      return { image: './assets/breakfast/table.webp', answerCue: taskId === 'breakfast-cup', caption: taskId === 'breakfast-cup' ? '餐桌前 · 回应 Luma 的请求' : '杯子里 · 再来一点还是够了',
        selected: world.amount || world.cupPlaced ? 'cup' : null,
        points: [point('cup', taskId === 'breakfast-cup' ? 'cup' : world.drink === 'water' ? 'water' : 'milk', offered ? (taskId === 'breakfast-more' ? 48 : 50) : 76, offered ? (taskId === 'breakfast-more' ? 58 : 43) : 58, 23, 14, ['cup', 'milk', 'water', 'more', '杯', '牛奶', '水', '一点'])] };
    }
    return null;
  }
  function orderLabel(world = {}) {
    return [world.size === 'small' ? '小杯' : world.size === 'large' ? '大杯' : '',
      world.drink === 'latte' ? '拿铁' : world.drink === 'americano' ? '美式' : '',
      world.service === 'here' ? '堂食' : world.service === 'to-go' ? '带走' : ''].filter(Boolean).join(' · ');
  }
  function storyOrderLabel(world = {}) {
    if (world.missionId === 'C03' && world.delivered) {
      const expected = orderLabel(world);
      const actual = orderLabel(world.delivered);
      return world.repair?.resolved ? `已修正 · ${actual}` : `你点的是 ${expected} · 收到的是 ${actual}`;
    }
    return orderLabel(world);
  }

  let adapter, layer, card, frame = null, generation = 0, pendingImage = '', lastSpeech = '';
  const loaded = new Map();
  function preload(src) {
    if (!loaded.has(src)) loaded.set(src, new Promise((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(image); image.onerror = () => { loaded.delete(src); reject(new Error('scene_image_unavailable')); }; image.src = src;
    }));
    return loaded.get(src);
  }
  function syncGeometry() {
    if (!adapter || !layer || !frame) return;
    const { width, height } = adapter.scene.getBoundingClientRect(), img = adapter.image;
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return;
    const scale = Math.min(width / w, height / h);
    Object.assign(layer.style, { width: `${w * scale}px`, height: `${h * scale}px`, left: `${(width - w * scale) / 2}px`, top: `${(height - h * scale) / 2}px` });
  }
  function renderPoints() {
    if (!frame || !layer) return;
    layer.replaceChildren();
    for (const p of frame.points) {
      const cue = document.createElement('div'); cue.className = 'visual-cue'; cue.dataset.object = p.key;
      cue.classList.toggle('is-selected', frame.selected === p.key);
      cue.classList.toggle('is-muted', Boolean(frame.selected && frame.selected !== p.key));
      Object.assign(cue.style, { left: `${p.x - p.width / 2}%`, top: `${p.y - p.height / 2}%`, width: `${p.width}%`, height: `${p.height}%` });
      const label = document.createElement('span'); label.textContent = `${frame.selected === p.key ? '✓ ' : ''}${p.label}`;
      cue.append(label); layer.append(cue);
    }
    layer.hidden = false; syncGeometry(); speech(lastSpeech);
    noteExposure();
  }
  function noteExposure() {
    if (adapter && frame?.answerCue && layer && !layer.hidden && !adapter.state().subtitlesHidden && adapter.state().stage === 'active')
      globalThis.LumaExperience?.noteHelp(1, 'visual-word-cue');
  }
  function speech(text) {
    lastSpeech = String(text || '').toLowerCase();
    if (!frame || !layer) return;
    for (const cue of layer.children) {
      const p = frame.points.find(p => p.key === cue.dataset.object);
      cue.classList.toggle('is-mentioned', Boolean(p?.words.some(word => lastSpeech.includes(word))));
    }
  }
  function render() {
    if (!adapter) return;
    const state = adapter.state(), task = adapter.task();
    const next = state.sceneStarted ? frameFor(state.selectedScene, task.id, state.selectedScene === 'coffee' ? state.coffee : state.breakfast) : null;
    if (!next) { clear(); return; }
    const isCoffee = state.selectedScene === 'coffee';
    card.hidden = !isCoffee;
    if (isCoffee) {
      card.querySelector('[data-visual-caption]').textContent = next.caption;
      card.querySelector('[data-visual-order]').textContent = storyOrderLabel(state.coffee) || '让店员知道，你今天想喝什么。';
      card.dataset.hasOrder = Boolean(state.coffee.drink);
    }
    adapter.scene.dataset.visualTask = task.id;
    if (frame?.image === next.image && adapter.image.getAttribute('src') === next.image && adapter.image.complete && adapter.image.naturalWidth) {
      frame = next; renderPoints(); return;
    }
    frame = next; layer.hidden = true; layer.replaceChildren();
    if (pendingImage === next.image) return;
    pendingImage = next.image;
    const token = ++generation;
    const commit = () => {
      if (token !== generation) return;
      pendingImage = '';
      adapter.image.src = next.image; adapter.blur.src = next.image;
      adapter.scene.dataset.visualImage = next.image;
      adapter.scene.classList.remove('visual-image-error');
      renderPoints();
    };
    preload(next.image).then(commit).catch(() => {
      if (token !== generation) return;
      pendingImage = ''; adapter.scene.classList.add('visual-image-error');
    });
    // Prepare the next shot offscreen; retain the current picture until it is ready.
    if (isCoffee) {
      const ids = ['coffee-order', 'coffee-size', 'coffee-service', 'coffee-thanks'];
      const upcoming = frameFor('coffee', ids[ids.indexOf(task.id) + 1], state.coffee);
      if (upcoming) preload(upcoming.image).catch(() => {});
      if (task.id === 'coffee-service') preload('./assets/coffee/ready-here.webp').catch(() => {});
    }
  }
  function clear() {
    generation++; frame = null; pendingImage = ''; lastSpeech = '';
    if (layer) { layer.hidden = true; layer.replaceChildren(); }
    if (card) card.hidden = true;
    if (adapter) { delete adapter.scene.dataset.visualTask; delete adapter.scene.dataset.visualImage; adapter.scene.classList.remove('visual-image-error'); }
  }
  function bind(value) {
    adapter = value; layer = document.querySelector('#visualCues'); card = document.querySelector('#visualStory');
    adapter.image.addEventListener('load', syncGeometry);
    window.addEventListener('resize', syncGeometry);
    // The keyboard and visualViewport can resize the scene after window.resize.
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(syncGeometry).observe(adapter.scene);
  }
  return { bind, render, clear, speech, noteExposure, frameFor, orderLabel, storyOrderLabel };
})();
globalThis.LumaVisuals = LumaVisuals;
if (typeof module !== 'undefined') module.exports = LumaVisuals;

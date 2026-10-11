/* One contextual dictionary for live captions, history, and answering help. */
(() => {
  'use strict';
  const scene = document.getElementById('scene');
  if (!scene) return;
  const sources = '.dialogue-text, #learningHelpContent p, #learningHelpContent strong';
  const tokenPattern = /(?<![A-Za-z0-9])[A-Za-z]+(?:['’-][A-Za-z]+)*(?![A-Za-z0-9])/g;
  const cache = new Map();
  let adapter = null, active = null, request = null, revision = 0, reading = false;
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const card = el('section', null, 'word-lookup-card');
  card.id = 'wordLookupCard'; card.hidden = true;
  card.setAttribute('role', 'region'); card.setAttribute('aria-labelledby', 'wordLookupTerm');
  const header = el('header'), heading = el('div'), term = el('strong');
  term.id = 'wordLookupTerm';
  const pronunciation = el('span'); pronunciation.id = 'wordLookupPhonetic'; pronunciation.hidden = true;
  heading.append(term, pronunciation);
  const closeButton = el('button'); closeButton.type = 'button'; closeButton.id = 'wordLookupClose';
  closeButton.setAttribute('aria-label', '关闭词义');
  const closeIcon = el('i', null, 'ph ph-x'); closeIcon.setAttribute('aria-hidden', 'true'); closeButton.append(closeIcon);
  header.append(heading, closeButton);
  const meaning = el('p'); meaning.id = 'wordLookupMeaning'; meaning.setAttribute('role', 'status');
  const note = el('p', null, 'word-lookup-note'); note.id = 'wordLookupNote'; note.hidden = true;
  const actions = el('div', null, 'word-lookup-actions');
  const listen = el('button', '听发音'); listen.type = 'button'; listen.id = 'wordLookupPronounce';
  const listenIcon = el('i', null, 'ph ph-speaker-high'); listenIcon.setAttribute('aria-hidden', 'true'); listen.prepend(listenIcon);
  const retry = el('button', '重新查词'); retry.type = 'button'; retry.id = 'wordLookupRetry'; retry.hidden = true;
  actions.append(listen, retry); card.append(header, meaning, note, actions); scene.append(card);

  function decorate(source, value = source.textContent) {
    const text = String(value || '');
    const fullText = source.dataset.lookupText || text;
    const replacementMetadata = source.dataset.helpReplacements || '';
    // Caption reveal may replace the token nodes while continuing the same
    // known sentence. Keep the lookup and rebind its anchor after that update.
    if (active?.source === source && (fullText !== active.fullText || !text.startsWith(active.visibleText)))
      close({ restoreFocus: false });
    if (source.dataset.wordText === text && source.textContent === text
      && source.dataset.wordHelpReplacements === replacementMetadata) return;
    // The help renderer annotates editable phrases with UTF-16 string offsets;
    // retain that styling when replacing its inline spans with word controls.
    let replacements = [];
    try {
      const parsed = JSON.parse(replacementMetadata || '[]');
      if (Array.isArray(parsed)) replacements = parsed.filter(range => range && Number.isInteger(range.start)
        && Number.isInteger(range.end) && range.start >= 0 && range.end > range.start && range.end <= text.length);
    } catch { /* A malformed display annotation must not disable word lookup. */ }
    const focusedStart = source.contains(document.activeElement) ? document.activeElement.dataset.start : null;
    const fragment = document.createDocumentFragment();
    let cursor = 0, count = 0;
    for (const match of text.matchAll(tokenPattern)) {
      if (/[A-Za-z'’-]/.test(fullText.charAt(match.index + match[0].length))) continue;
      fragment.append(document.createTextNode(text.slice(cursor, match.index)));
      const button = el('button', match[0], 'word-token'); button.type = 'button';
      button.dataset.start = String(match.index); button.dataset.end = String(match.index + match[0].length);
      if (replacements.some(range => match.index < range.end && match.index + match[0].length > range.start))
        button.classList.add('is-help-replaceable');
      button.tabIndex = count++ ? -1 : 0;
      button.setAttribute('aria-label', '查看 ' + match[0] + ' 的意思');
      fragment.append(button); cursor = match.index + match[0].length;
    }
    fragment.append(document.createTextNode(text.slice(cursor)));
    source.dataset.wordSource = ''; source.dataset.wordText = text;
    source.dataset.wordHelpReplacements = replacementMetadata;
    source.replaceChildren(fragment);
    if (focusedStart != null) {
      const tokens = [...source.querySelectorAll('.word-token')];
      const focused = tokens.find(token => token.dataset.start === focusedStart);
      if (focused) {
        for (const token of tokens) token.tabIndex = token === focused ? 0 : -1;
        focused.focus({ preventScroll: true });
      }
    }
    if (active?.source === source) {
      active.trigger = [...source.querySelectorAll('.word-token')].find(token => Number(token.dataset.start) === active.start + active.offset);
      active.visibleText = text;
      if (!active.trigger) close({ restoreFocus: false });
      else highlight((active.result?.start ?? active.start) + active.offset, (active.result?.end ?? active.end) + active.offset);
    }
  }

  function contextKey() {
    const current = adapter?.context?.() || {};
    return JSON.stringify([current.session, current.sceneId, current.taskId, current.question]);
  }

  function clearSelection() {
    for (const token of scene.querySelectorAll('.word-token.is-word-selected')) token.classList.remove('is-word-selected');
  }
  function highlight(start, end) {
    clearSelection();
    for (const token of active?.source.querySelectorAll('.word-token') || []) {
      if (Number(token.dataset.start) < end && Number(token.dataset.end) > start) token.classList.add('is-word-selected');
    }
  }
  function isOpen() { return Boolean(active && !card.hidden); }
  function close({ restoreFocus = false, resume = true } = {}) {
    const previous = active, wasReading = reading;
    request?.abort(); request = null; revision++;
    active = null; reading = false; card.hidden = true;
    delete card.dataset.pronouncing;
    adapter?.stopPronunciation?.(); clearSelection();
    if (wasReading && resume) adapter?.resume?.();
    if (restoreFocus && previous?.trigger?.isConnected) previous.trigger.focus({ preventScroll: true });
  }
  function learnerTurnStarted() {
    // The utterance owns the floor; its response must not wait for a dictionary card.
    close({ restoreFocus: false });
  }
  function valid() {
    return isOpen() && active.source.isConnected && active.source.textContent === active.visibleText
      && (active.source.dataset.lookupText || active.source.textContent) === active.fullText
      && active.context === contextKey() && active.trigger?.getClientRects().length > 0;
  }
  function position() {
    if (!isOpen()) return;
    if (!valid()) { close({ restoreFocus: false }); return; }
    const bounds = scene.getBoundingClientRect(), anchor = active.trigger.getBoundingClientRect();
    const controls = scene.querySelector('.scene-controls')?.getBoundingClientRect();
    const topLimit = 64, bottomLimit = Math.max(topLimit + 120, (controls?.top || bounds.bottom) - bounds.top - 10);
    const width = Math.min(300, bounds.width - 28);
    card.style.width = width + 'px'; card.style.maxHeight = (bottomLimit - topLimit) + 'px';
    const height = card.getBoundingClientRect().height;
    const below = anchor.bottom - bounds.top + 9, above = anchor.top - bounds.top - height - 9;
    const top = below + height <= bottomLimit ? below : above >= topLimit ? above : bottomLimit - height;
    const left = Math.max(14, Math.min(bounds.width - width - 14, anchor.left - bounds.left - 12));
    card.style.left = left + 'px'; card.style.top = Math.max(topLimit, top) + 'px';
  }

  function showResult(result) {
    term.textContent = result.term; meaning.textContent = result.meaning;
    pronunciation.textContent = result.pronunciation || ''; pronunciation.hidden = !result.pronunciation;
    note.textContent = result.note || ''; note.hidden = !result.note;
    retry.hidden = true; listen.disabled = false;
    card.dataset.state = 'ready'; card.removeAttribute('aria-busy');
    active.result = result;
    highlight(result.start + active.offset, result.end + active.offset);
    if (!active.recorded) { adapter?.recordLookup?.(); active.recorded = true; }
    position();
  }

  async function lookup() {
    if (!active) return;
    request?.abort(); const controller = new AbortController(); request = controller;
    const version = ++revision, snapshot = active;
    card.dataset.state = 'loading'; card.setAttribute('aria-busy', 'true');
    meaning.textContent = '正在查这句话里的意思…'; note.hidden = true; retry.hidden = true; listen.disabled = true;
    position();
    const key = JSON.stringify([snapshot.text, snapshot.start, snapshot.end]);
    if (cache.has(key)) { showResult(cache.get(key)); request = null; return; }
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const context = adapter?.context?.() || {};
      const response = await fetch('/api/word-meaning', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: snapshot.text, start: snapshot.start, end: snapshot.end, sceneId: context.sceneId, taskId: context.taskId }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('unavailable');
      const result = await response.json();
      if (typeof result.meaning !== 'string' || !result.meaning || !Number.isInteger(result.start) || !Number.isInteger(result.end)
        || result.start < 0 || result.start > snapshot.start || result.end < snapshot.end || result.end > snapshot.text.length
        || result.term !== snapshot.text.slice(result.start, result.end)) throw new Error('invalid');
      if (version !== revision || snapshot !== active || !valid()) return;
      cache.set(key, result); if (cache.size > 128) cache.delete(cache.keys().next().value);
      showResult(result);
    } catch {
      if (version !== revision || snapshot !== active || !valid()) return;
      card.dataset.state = 'error'; card.removeAttribute('aria-busy');
      meaning.textContent = '暂时没查到，点一下可以重试。'; retry.hidden = false; listen.disabled = false; position();
    } finally {
      clearTimeout(timer); if (request === controller) request = null;
    }
  }

  function open(trigger) {
    const source = trigger.closest('[data-word-source]');
    if (!source || !adapter) return;
    if (active?.trigger === trigger) { close(); return; }
    close({ resume: false });
    const fullText = source.dataset.lookupText || source.dataset.wordText;
    const originalStart = Number(trigger.dataset.start), originalEnd = Number(trigger.dataset.end);
    const offset = fullText.length > 1600 ? Math.max(0, originalStart - 700) : 0;
    const text = fullText.slice(offset, offset + 1600), start = originalStart - offset, end = originalEnd - offset;
    active = { source, trigger, fullText, visibleText: source.textContent, text, start, end, offset, context: contextKey(), result: null, recorded: false };
    reading = true; adapter.pause?.();
    card.hidden = false; term.textContent = text.slice(start, end); pronunciation.hidden = true;
    highlight(originalStart, originalEnd); lookup();
  }

  closeButton.addEventListener('click', () => close({ restoreFocus: true }));
  retry.addEventListener('click', lookup);
  listen.addEventListener('click', async () => {
    if (!valid()) return;
    if (adapter.canPronounce && !adapter.canPronounce()) {
      note.textContent = '等这一轮说完，再听发音。'; note.hidden = false; position(); return;
    }
    const snapshot = active, version = revision;
    listen.disabled = true; note.hidden = true; card.dataset.pronouncing = 'true';
    let result;
    try { result = await adapter.pronounce?.(active.result?.term || term.textContent); }
    catch { result = { ok: false, error: 'playback_failed' }; }
    if (snapshot !== active || version !== revision) return;
    listen.disabled = false; delete card.dataset.pronouncing;
    if (!result?.ok && result?.error !== 'cancelled') {
      note.textContent = result?.error === 'busy' ? '等这一轮说完，再听发音。'
        : ['unavailable', 'voice_unavailable'].includes(result?.error) ? '当前浏览器没有可用的英文发音。'
        : '这次没能播放，可以再试一次。';
      note.hidden = false;
    }
    position();
  });
  scene.addEventListener('click', event => {
    const token = event.target.closest('.word-token');
    if (token) { open(token); return; }
    if (isOpen() && !card.contains(event.target)) close({ restoreFocus: false });
  });
  scene.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isOpen()) { event.preventDefault(); event.stopPropagation(); close({ restoreFocus: true }); return; }
    const token = event.target.closest('.word-token');
    if (!token || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const tokens = [...token.closest('[data-word-source]').querySelectorAll('.word-token')];
    const next = tokens[tokens.indexOf(token) + (event.key === 'ArrowRight' ? 1 : -1)];
    if (next) { token.tabIndex = -1; next.tabIndex = 0; next.focus({ preventScroll: true }); }
  }, true);
  document.addEventListener('scroll', event => {
    // renderDialogue keeps the clipped live-caption band scrolled to its end.
    // That programmatic movement must not dismiss a lookup during playback.
    if (isOpen() && event.target === document.getElementById('languagePanel')) { position(); return; }
    if (isOpen() && !card.contains(event.target)) close({ restoreFocus: false });
  }, true);
  window.addEventListener('resize', position);
  document.addEventListener('visibilitychange', () => { if (document.hidden) close({ restoreFocus: false }); });
  const observer = new MutationObserver(() => {
    for (const source of scene.querySelectorAll(sources)) {
      if (!source.closest('#wordLookupCard') && !source.querySelector('[data-word-source]')) decorate(source);
    }
    if (active && !valid()) close({ restoreFocus: false });
    if (isOpen()) position();
  });
  observer.observe(scene, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'class', 'aria-hidden', 'data-lookup-text', 'data-help-replacements'] });
  window.LumaWords = { decorate, isOpen, isReading: () => reading, learnerTurnStarted, close,
    bind(value) { adapter = value; for (const source of scene.querySelectorAll(sources)) decorate(source); } };
})();

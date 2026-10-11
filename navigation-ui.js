/* Three navigation surfaces read the same recorded sessions; they never complete a task. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const set = (id, value) => { if ($(id)) $(id).textContent = String(value); };
  const el = (tag, text, className) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; };
  const icon = name => { const node = el('i', null, `ph ph-${name}`); node.setAttribute('aria-hidden', 'true'); return node; };
  const button = (text, callback, className = 'study-link') => { const node = el('button', text, className); node.type = 'button'; node.addEventListener('click', callback); return node; };
  const sceneNames = { interview: '设计师面试', coffee: '街角咖啡店', kitchen: '家中早餐', airport: '机场出行', office: '初次见面' };
  const sceneImages = {
    interview: './assets/interview/room.png',
    coffee: './assets/optimized/coffee-home-860.jpg',
    kitchen: './assets/optimized/breakfast-preview-860.jpg',
    airport: './assets/optimized/airport-preview-860.jpg',
    office: './assets/optimized/office-preview-860.jpg',
  };
  const PROFILE_KEY = 'luma-personal-v1', REVIEW_KEY = 'luma-expression-reviews-v2';
  let storage, snapshot, request, dialogTrigger, personal = {}, reviews = {};
  try { storage = window.localStorage; personal = JSON.parse(storage.getItem(PROFILE_KEY) || '{}') || {}; reviews = JSON.parse(storage.getItem(REVIEW_KEY) || '{}') || {}; } catch { /* Defaults remain usable when local storage is unavailable. */ }
  if (typeof personal !== 'object' || Array.isArray(personal)) personal = {};
  if (typeof reviews !== 'object' || Array.isArray(reviews)) reviews = {};
  function notice(text) {
    const toast = $('appToast'); if (!toast) return;
    toast.textContent = text; toast.classList.add('is-visible');
    clearTimeout(notice.timer); notice.timer = setTimeout(() => toast.classList.remove('is-visible'), 4200);
  }
  function save(key, value) {
    try { if (!storage) throw new Error(); storage.setItem(key, JSON.stringify(value)); return true; }
    catch { notice('当前浏览器无法保存，关闭页面后可能无法恢复。'); return false; }
  }
  const knownDate = value => Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now();
  const dayKey = value => { const date = new Date(value); return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`; };
  const dateLabel = value => new Date(value).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
  const validCompletions = profile => (profile.sessions || []).filter(s => knownDate(s.completedAt) && !s.supersededAt);
  const lifeCompletions = profile => validCompletions(profile).filter(s => s.scope === 'life-event');
  const englishAttempts = profile => (profile.attempts || []).filter(a => a.outcome === 'success' && a.source === 'voice' && a.language === 'en' && knownDate(a.at));
  const experience = () => window.LumaExperience;

  function openDialog(title) {
    const dialog = $('studyDialog');
    request?.abort(); request = null;
    dialogTrigger = document.activeElement;
    set('studyDialogTitle', title); $('studyDialogContent').replaceChildren();
    if (!dialog.open) dialog.showModal();
    return $('studyDialogContent');
  }
  function closeDialog() { $('studyDialog')?.close(); }
  $('closeStudyDialog')?.addEventListener('click', closeDialog);
  $('studyDialog')?.addEventListener('click', event => { if (event.target === $('studyDialog')) {
    const r = $('studyDialog').getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDialog();
  } });
  $('studyDialog')?.addEventListener('close', () => { request?.abort(); request = null; window.speechSynthesis?.cancel(); (document.contains(dialogTrigger) ? dialogTrigger : document.querySelector('#bottomNav button.is-active'))?.focus?.({ preventScroll: true }); });
  function listen(text) {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) { notice('当前浏览器暂时不能朗读，可以先看文字，再到场景里听。'); return; }
    window.speechSynthesis.cancel();
    const line = new SpeechSynthesisUtterance(text); line.lang = 'en-US'; line.rate = .88;
    line.onerror = event => { if (!['canceled', 'interrupted'].includes(event.error)) notice('这次没有播放成功，可以再点一次。'); };
    window.speechSynthesis.speak(line);
  }
  function markStudy(sceneId, taskId, kind = 'full-example') { experience()?.recordStudy(sceneId, taskId, kind); }
  function previewTask(sceneId, taskId, savedMission = null) {
    closeDialog();
    const interview = typeof Interview === 'undefined' ? window.Interview : Interview;
    const missionId = sceneId === 'interview' ? savedMission || interview?.missions.find(mission => mission.id !== 'I07' && mission.taskIds.includes(taskId))?.id || 'I01' : null;
    experience()?.previewScene(sceneId, missionId);
  }
  function practice(sceneId, taskId) {
    markStudy(sceneId, taskId); previewTask(sceneId, taskId);
  }
  function openDictionary(sceneId) {
    const catalog = experience()?.catalog; if (!catalog) return;
    const content = openDialog(sceneNames[sceneId]);
    content.append(el('p', '常用说法供参考，你可以用自己的方式表达。'));
    for (const taskId of catalog.SCENE_TASKS[sceneId] || []) {
      const item = catalog.TASKS[taskId]; if (!item) continue;
      const card = el('article', null, 'dictionary-entry');
      card.append(el('h3', item[1]), el('p', item[2]), el('p', item[3], 'dictionary-example'), el('p', item[4]));
      const play = button('听示范', () => { markStudy(sceneId, taskId); listen(item[3]); }); play.prepend(icon('speaker-high'));
      const tryIt = button('去场景里用', () => practice(sceneId, taskId)); tryIt.append(icon('arrow-right'));
      card.append(play, tryIt); content.append(card);
      // These complete examples are visible together, so the matching next encounter is assisted.
      markStudy(sceneId, taskId);
    }
  }
  function renderDictionary() {
    const container = $('sceneDictionary'), catalog = experience()?.catalog;
    if (!container || !catalog || container.children.length) return;
    for (const sceneId of Object.keys(sceneNames)) {
      const node = button('', () => openDictionary(sceneId), 'dictionary-scene');
      node.dataset.scene = sceneId;
      const img = el('img'); img.src = sceneImages[sceneId]; img.alt = '';
      node.append(img, el('strong', sceneNames[sceneId]), el('small', `${catalog.SCENE_TASKS[sceneId].length} 组${sceneId === 'interview' ? '面试' : '生活'}表达`));
      container.append(node);
    }
  }
  // Review actual language independently of hidden task success and recognition outcomes.
  const REVIEW_LIMIT = 6;
  let backgroundReview = null, reviewRun = 0, expressionTimer;
  const learningVisible = () => document.querySelector('.view-growth')?.classList.contains('is-active') && !document.hidden;
  const expressionKey = attempt => JSON.stringify([attempt.sceneId, attempt.heardQuestion || '', attempt.utterance.trim()]);
  const isCorrection = result => result?.status === 'suggestion' && ['grammar', 'word-choice'].includes(result.issue)
    && typeof result.expression === 'string' && result.expression.trim() && result.expression !== result.original;
  function expressionCandidates(profile) {
    const seen = new Set();
    return (profile?.attempts || []).filter(a => a.outcome !== 'technical-error' && a.source === 'voice'
      && typeof a.utterance === 'string' && /[a-z]/i.test(a.utterance) && knownDate(a.at))
      .sort((a,b) => Date.parse(b.at) - Date.parse(a.at)).filter(a => {
        const key = expressionKey(a); if (seen.has(key)) return false; seen.add(key); return true;
      }).slice(0, 60);
  }
  function cachedReview(attempt) {
    const result = reviews[expressionKey(attempt)];
    return result?.version === 2 ? result : null;
  }
  function cacheReview(attempt, original, result) {
    const key = expressionKey(attempt);
    delete reviews[key]; reviews[key] = { ...result, original, version: 2, checkedAt: new Date().toISOString() };
    reviews = Object.fromEntries(Object.entries(reviews).slice(-60)); save(REVIEW_KEY, reviews);
  }
  async function fetchExpression(attempt, original, controller) {
    const response = await fetch('/api/expression-review', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ utterance: original, heardQuestion: attempt.heardQuestion || '', sceneId: attempt.sceneId }), signal: controller.signal });
    if (!response.ok) throw new Error('unavailable');
    const result = await response.json();
    if (!['natural', 'suggestion', 'unclear'].includes(result.status) || typeof result.expression !== 'string'
      || typeof result.explanation !== 'string') throw new Error('invalid');
    // An old/style-only suggestion is not a confirmed error, including from stale providers.
    if (result.status === 'suggestion' && !['grammar', 'word-choice'].includes(result.issue)) return ['style', 'politeness'].includes(result.issue)
      ? { status: 'natural', issue: null, expression: original, explanation: '这句表达不需要纠正。' }
      : { status: 'unclear', issue: null, expression: '', explanation: '暂时无法确定是否需要纠正。' };
    return result;
  }
  function stopExpressionChecks() {
    clearTimeout(expressionTimer); reviewRun++;
    backgroundReview?.abort(); backgroundReview = null;
  }
  function scheduleExpressionChecks() {
    clearTimeout(expressionTimer);
    if (!learningVisible()) { stopExpressionChecks(); return; }
    expressionTimer = setTimeout(checkRecentExpressions, 250);
  }
  async function checkRecentExpressions() {
    if (!learningVisible() || backgroundReview) return;
    const run = ++reviewRun;
    for (const attempt of expressionCandidates(snapshot?.profile).slice(0, REVIEW_LIMIT)) {
      if (run !== reviewRun || !learningVisible()) break;
      if (cachedReview(attempt)) continue;
      const controller = new AbortController(); backgroundReview = controller;
      const timer = setTimeout(() => controller.abort(), 12000);
      renderExpressions(snapshot.profile);
      try {
        const result = await fetchExpression(attempt, attempt.utterance.trim(), controller);
        if (run !== reviewRun || !learningVisible() || controller.signal.aborted) break;
        cacheReview(attempt, attempt.utterance.trim(), result);
      } catch {
        // An interrupted tab change is not a failed sentence and never enters the error list.
        if (run !== reviewRun || !learningVisible()) break;
        cacheReview(attempt, attempt.utterance.trim(), { status: 'failed' });
      } finally {
        clearTimeout(timer); if (backgroundReview === controller) backgroundReview = null;
      }
    }
    if (snapshot?.profile) renderExpressions(snapshot.profile);
  }
  function showExpressionResult(container, result, sceneId, taskId, missionId) {
    container.replaceChildren(); container.hidden = false;
    if (result.status !== 'suggestion' || !['grammar', 'word-choice'].includes(result.issue)) {
      container.append(el('p', result.status === 'unclear' ? '识别原句还不够确定，暂不列入待纠正表达。' : '这句没有需要纠正的地方，已从列表移除。'));
      return;
    }
    container.append(el('small', result.issue === 'grammar' ? '语法可以这样改' : '这个词可以这样用'), el('strong', result.expression), el('p', result.explanation));
    markStudy(sceneId, taskId);
    container.append(button('听一遍', () => listen(result.expression)));
    container.append(button('回场景再试试', () => previewTask(sceneId, taskId, missionId)));
  }
  function openExpression(attempt) {
    const content = openDialog('表达优化');
    content.append(el('p', '先核对识别原句。这里只保留需要纠正的表达，你的选择和意思不会被改变。'));
    if (attempt.heardQuestion) content.append(el('p', `对方说：${attempt.heardQuestion}`));
    const label = el('label', '你的原句'); label.htmlFor = 'expressionOriginal';
    const input = el('textarea'); input.id = 'expressionOriginal'; input.value = cachedReview(attempt)?.original || attempt.utterance; input.maxLength = 600;
    const status = el('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const resultBox = el('div', null, 'study-result'); resultBox.hidden = true;
    const submit = button('核对原句，重新检查', async () => {
      const original = input.value.trim(); if (!original) { status.textContent = '先写下你想表达的那句话。'; input.focus(); return; }
      request?.abort(); const controller = new AbortController(); request = controller;
      const timer = setTimeout(() => controller.abort(), 12000);
      submit.disabled = true; submit.textContent = '正在检查…'; resultBox.hidden = true; status.textContent = '';
      try {
        const result = await fetchExpression(attempt, original, controller);
        if (request !== controller || !$('studyDialog').open || original !== input.value.trim()) return;
        cacheReview(attempt, original, result); renderExpressions(snapshot.profile);
        showExpressionResult(resultBox, result, attempt.sceneId, attempt.taskId, attempt.missionId);
      } catch {
        if (request === controller && $('studyDialog').open) status.textContent = '这次没有取得建议，原句还在。可以再试一次，或稍后回来。';
      } finally {
        clearTimeout(timer);
        if (request === controller) { request = null; submit.disabled = false; submit.textContent = '核对原句，重新检查'; }
      }
    }, 'study-primary');
    input.addEventListener('input', () => { request?.abort(); request = null; resultBox.hidden = true; status.textContent = ''; submit.disabled = false; submit.textContent = '核对原句，重新检查'; });
    content.append(label, input, submit, status, resultBox);
    const saved = cachedReview(attempt);
    if (isCorrection(saved)) showExpressionResult(resultBox, saved, attempt.sceneId, attempt.taskId, attempt.missionId);
  }
  function renderExpressions(profile) {
    const container = $('expressionList'); if (!container) return;
    const allCandidates = expressionCandidates(profile), candidates = allCandidates.slice(0, REVIEW_LIMIT);
    const corrections = allCandidates.filter(a => isCorrection(cachedReview(a))).slice(0, 6);
    container.replaceChildren(...corrections.map(attempt => {
      const card = el('article', null, 'expression-item'), saved = cachedReview(attempt);
      card.append(el('small', `${sceneNames[attempt.sceneId] || '生活场景'} · ${dateLabel(attempt.at)}`), el('p', saved.original));
      const action = button('看看怎么改', () => openExpression(attempt)); action.append(icon('arrow-right')); card.append(action); return card;
    }));
    if (!corrections.length) {
      const empty = el('div', null, 'study-empty');
      const allChecked = candidates.length && candidates.every(a => ['natural', 'suggestion'].includes(cachedReview(a)?.status));
      empty.append(el('p', backgroundReview ? '正在检查最近的表达…'
        : allChecked ? '暂时没有需要优化的表达。' : '需要优化的表达会留在这里。'));
      container.append(empty);
    }
  }
  const learningView = document.querySelector('.view-growth');
  if (learningView) new MutationObserver(() => { if (snapshot?.profile) renderExpressions(snapshot.profile); scheduleExpressionChecks(); })
    .observe(learningView, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', scheduleExpressionChecks);
  function renderMap(profile, next) {
    const complete = lifeCompletions(profile);
    window.LumaWorldRegions?.render(profile, next);
    const now = new Date(), today = dayKey(now);
    const monday = new Date(now); monday.setHours(0,0,0,0); monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
    const week = new Set(complete.filter(s => new Date(s.completedAt) >= monday).map(s => dayKey(s.completedAt))).size;
    set('worldTodayCount', complete.filter(s => dayKey(s.completedAt) === today).length);
    set('worldWeekCount', week);
  }
  function renderPersonal(profile, totals, life) {
    set('profileName', typeof personal.name === 'string' && personal.name.trim() ? personal.name.slice(0,24) : '生活探索者');
    const avatar = $('profileAvatar');
    if (avatar) { const custom = typeof personal.avatar === 'string' && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(personal.avatar) && personal.avatar.length < 500000;
      avatar.src = custom ? personal.avatar : './assets/optimized/avatar-120.jpg'; avatar.style.objectPosition = custom ? 'center' : 'center top'; }
    const first = [...profile.sessions].filter(s => knownDate(s.startedAt)).sort((a,b) => Date.parse(a.startedAt)-Date.parse(b.startedAt))[0];
    set('profileSince', first ? `从 ${new Date(first.startedAt).toLocaleDateString('zh-CN')} 开始体验` : '在这里，把英语用起来。');
    const complete = validCompletions(profile), events = lifeCompletions(profile), english = englishAttempts(profile);
    const days = new Set(complete.map(s => dayKey(s.completedAt)));
    set('personalCompleted', events.length); set('personalEnglish', english.length); set('personalDays', days.size);
    set('personalTargets', new Set(english.map(a => a.targetId)).size);
    set('personalIndependent', totals.independentProductionCount || 0);
    const date = new Date(); date.setHours(0,0,0,0); date.setDate(date.getDate() - (date.getDay()+6)%7);
    const week = $('personalWeek'); if (week) {
      week.replaceChildren(...['一','二','三','四','五','六','日'].map((label,index) => {
        const day = new Date(date); day.setDate(day.getDate()+index); const has = days.has(dayKey(day));
        const cell = el('div', null, `week-day${has ? ' is-active' : ''}${dayKey(day) === dayKey(new Date()) ? ' is-today' : ''}`);
        cell.append(el('small', label), el('span', has ? '✓' : String(day.getDate())));
        cell.setAttribute('aria-label', `${dateLabel(day)}${has ? '，完成过练习' : '，暂无完成记录'}`); return cell;
      }));
    }
    const badges = [
      {name:'第一段生活',icon:'flag',earned:events.length>0,copy:'完成一个完整生活事件。'},
      {name:'开口说英语',icon:'chat-circle-dots',earned:english.length>0,copy:'在对话中用英语表达一次，并确认意思。'},
      {name:'走进新地方',icon:'compass',earned:new Set(events.map(s=>s.sceneId)).size>=2,copy:'在两个不同地点分别完成生活事件。'},
    ];
    if ($('personalBadges')) $('personalBadges').replaceChildren(...badges.map(badge=>{
      const item = button('',()=>{const box=openDialog(badge.name);box.append(el('p',badge.earned?'已达成':'还在路上'),el('p',badge.copy));},`achievement-badge${badge.earned?' is-earned':''}`);
      item.append(icon(badge.icon),el('strong',badge.name),el('small',badge.earned?'已达成':'未达成'));return item;
    }));
    if (life) {
      set('worldLevel', `Lv.${life.level}`); set('worldXP', `${life.currentLevelXP} / 100 经验`);
      set('personalLevel', `Lv.${life.level}`); set('personalXP', life.totalXP);
      for (const id of ['worldXPMeter','personalXPMeter']) if ($(id)) $(id).value = life.currentLevelXP;
    }
  }
  function renderReward() {
    const box = $('lifeReward'), reward = experience()?.currentReward(); if (!box) return;
    const current = snapshot?.profile?.sessions.find(s => s.id === experience()?.currentSession());
    set('reviewEyebrow', current?.scope === 'target-practice' ? '把一句话，再用一次' : '生活又向前了一点');
    set('reviewTitle', current?.scope === 'target-practice' ? '这次短练习完成了' : '这件小事，办成了。');
    box.hidden = !reward?.accepted;
    if (box.hidden) return;
    box.replaceChildren(el('strong', reward.sessionXP ? `+${reward.sessionXP} 生活经验` : '这次经历已记录'));
    const labels = {'first-mission':'第一次完成这件事','first-scene':'第一次体验这个地点',revisit:'再次回到熟悉的生活'};
    box.append(el('p',reward.sessionXP ? (reward.sessionAwards || []).map(a=>`${labels[a.reason]} +${a.xp}`).join(' · ')
      : '距这件事上次获得经验还不足 24 小时，本次不重复增加。'));
  }
  function render(data) {
    snapshot = data; if (!data?.profile) return;
    set('learningNotesTitle','学习'); renderMap(data.profile,data.next); renderPersonal(data.profile,data.totals || {},data.life);
    renderDictionary(); renderExpressions(data.profile); renderReward(); scheduleExpressionChecks();
  }
  function openProfile() {
    const content = openDialog('个人资料');
    const label = el('label','昵称'); label.htmlFor='profileNameInput';
    const input = el('input'); input.id='profileNameInput'; input.maxLength=24; input.value=personal.name || '';
    const helper=el('p','仅保存在当前浏览器，随时可以修改。');
    content.append(label,input,helper,button('保存',()=>{
      const name=input.value.trim(); if(!name){input.focus();helper.textContent='给自己起一个名字吧。';return;}
      personal.name=name;const saved=save(PROFILE_KEY,personal);if(snapshot)render(snapshot);if(saved)closeDialog();
    },'study-primary'));
  }
  $('editProfile')?.addEventListener('click',openProfile);
  $('editAvatar')?.addEventListener('click',()=>$('profileAvatarFile')?.click());
  $('profileAvatarFile')?.addEventListener('change', async event=>{
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>6*1024*1024){notice('请选择 6 MB 以内的 JPG、PNG 或 WebP 图片。');return;}
    const url=URL.createObjectURL(file);
    try {const image=new Image();image.src=url;await image.decode();if(!image.naturalWidth)throw new Error();
      const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const context=canvas.getContext('2d');
      const size=Math.min(image.naturalWidth,image.naturalHeight);context.drawImage(image,(image.naturalWidth-size)/2,(image.naturalHeight-size)/2,size,size,0,0,256,256);
      personal.avatar=canvas.toDataURL('image/jpeg',.85);save(PROFILE_KEY,personal);if(snapshot)render(snapshot);
    }catch{notice('这张图片没有读取成功，请换一张试试。');}finally{URL.revokeObjectURL(url);}
  });
  $('openPreferences')?.addEventListener('click',()=>{const section=$('personalPreferences');section.open=true;section.scrollIntoView({block:'start',behavior:'smooth'});});
  $('xpRules')?.addEventListener('click',()=>{const content=openDialog('生活经验');
    for(const line of ['第一次完成一个生活事件：+20 经验。','第一次在一个地点完成事件：额外 +10。','同一事件距上次获奖满 24 小时，再次完成：+10。','每 100 经验升一级。等级记录生活积累，与英语水平不同。','使用提示、中文求助和合法的其他选择，不减少基础经验。','短复习、查词和查看建议不会算作完整生活事件，也不会重复获得探索奖励。'])content.append(el('p',line));
  });
  window.LumaNavigation = {render,notify:notice,openDictionary};
})();

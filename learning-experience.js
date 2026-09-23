/* Product learning UI. Voice playback and task advancement remain in app.js. */
(() => {
  'use strict';
  let adapter = null;
  let sessionId = null;
  let introductoryExample = false;
  let introExampleText = null;
  let introExampleButton = null;
  let helpTrigger = null;
  let helpSiblings = [];
  let serial = 0;
  let exposureSerial = 0;
  let storageNoticeShown = false;
  let reviewPlan = null;
  let reviewFocus = null;
  let storage;
  try { storage = window.localStorage; } catch { storage = null; }
  const store = LumaLearning.createStore(storage, { now: () => Date.now() });
  const $ = id => document.getElementById(id);
  const write = (id, text) => { if ($(id)) $(id).textContent = text; };
  const TASKS = {
    'breakfast-drink': ['choose-drink', '表达饮料选择', '她在问你想喝牛奶还是水。', 'Milk, please.', '我想要牛奶。也可以把 Milk 换成 Water。'],
    'breakfast-cup': ['offer-item', '回应物品请求', '她想请你把杯子给她。', 'Here you are.', '开口回应后，画面里的杯子会自动递过去。一个 Here 也可以。'],
    'breakfast-more': ['adjust-amount', '说明还要不要', '她在问你还要不要再来一点。', 'A little more, please.', '想再来一点可以这样说；够了可以说 Enough。'],
    'coffee-order': ['choose-drink', '点一杯喜欢的咖啡', '店员在问你想喝什么。画面里是拿铁和美式。', 'A latte, please.', '想要拿铁可以这样说；想喝美式，把 Latte 换成 Americano。只说饮品名也可以。'],
    'coffee-size': ['choose-size', '说明想要的杯型', '店员在问你要小杯还是大杯。', 'Small, please.', '小杯是 Small，大杯是 Large。说出想要的杯型就可以。'],
    'coffee-service': ['choose-service', '说明堂食还是带走', '店员在问你在店里喝，还是带走。', 'To go, please.', '带走可以说 To go；想坐下来喝，可以说 For here。'],
    'coffee-thanks': ['thank-person', '接过咖啡并道谢', '店员把你点的咖啡做好了，祝你享用愉快。', 'Thank you.', '用一句谢谢回应就好，画面会自动完成交接。'],
    ticket: ['offer-item', '回应物品请求', '工作人员想看看你的登机牌。', 'Here you are.', '开口回应即可，不需要点击登机牌。'],
    bag: ['confirm-belonging', '确认自己的物品', '工作人员在问这是不是你的行李。', 'Yes, it is mine.', '是自己的就确认；不是自己的可以说 No。'],
    'gate-a12': ['find-location', '说出需要的地方', '工作人员在问你要去哪个登机口。', 'A12.', '直接说出登机口号码，不需要在画面里找按钮。'],
    'office-purpose': ['state-purpose', '说明来意', '前台在问你来见谁。', "I’m here to see Maya.", '告诉对方你要见 Maya。'],
    'office-signin': ['give-name', '告诉对方自己的名字', '前台需要你的名字来登记。', 'My name is Li.', '也可以只说自己的名字。'],
    'office-wait': ['receive-information', '理解等候安排', '她请你稍等，Maya 正在过来。', 'Thank you.', '这是一条安排，不是必须回答的问题。'],
    'office-greeting': ['greet', '回应第一次见面', 'Maya 正在向你打招呼。', 'Nice to meet you, too.', '表示你也很高兴见到她。'],
  };
  const SCENES = {
    kitchen: { title: '今天，选一杯\n喜欢的饮料', subtitle: '从一个词开始，把意思说清楚', context: '家 · 清晨', image: './assets/optimized/breakfast-preview-860.jpg', label: '一起准备早餐' },
    coffee: { title: '下楼，点一杯\n喜欢的咖啡', subtitle: '从饮品到杯型，用自己的话点好这一杯', context: '日常 · 街角咖啡店', image: './assets/optimized/coffee-home-720.jpg', label: '下楼点杯咖啡' },
    airport: { title: '换个地方，\n把意思说清楚', subtitle: '从回应登机牌请求开始，试着和工作人员交流', context: '出行 · 机场', image: './assets/optimized/airport-preview-860.jpg', label: '在机场回应工作人员' },
    office: { title: '第一次见面，\n试着打个招呼', subtitle: '说明来意，认识一位新同事', context: '工作 · 初次见面', image: './assets/optimized/office-preview-860.jpg', label: '第一次拜访新同事' },
  };
  const NEXT_SCENE = { kitchen: 'coffee', coffee: 'kitchen', airport: 'office', office: 'kitchen' };
  const FIRST_TASK = { kitchen: 'breakfast-drink', coffee: 'coffee-order', airport: 'ticket', office: 'office-purpose' };
  const SCENE_TASKS = {
    kitchen: ['breakfast-drink', 'breakfast-cup', 'breakfast-more'],
    coffee: ['coffee-order', 'coffee-size', 'coffee-service', 'coffee-thanks'],
    airport: ['ticket', 'bag', 'gate-a12'],
    office: ['office-purpose', 'office-signin', 'office-wait', 'office-greeting'],
  };
  const TRANSFER_TITLE = {
    coffee: '去咖啡店，试着点一杯喜欢的饮品',
    airport: '去机场，试着回应登机牌请求',
    office: '见一位新同事，试着打招呼',
    kitchen: '回到早餐，试着自己作选择',
  };
  const s = () => adapter?.state();
  const task = () => adapter?.task();
  const details = id => TASKS[id] || [id, '完成一次表达', '试着理解对方现在的需要。', 'Could you say that again?', '没听清时，可以请对方再说一遍。'];
  const coffeeOrderPhrase = (target = {}) => {
    const size = target.size ? `${target.size} ` : '';
    const drink = target.drink || 'coffee';
    const service = target.service === 'to-go' ? ' to go' : target.service === 'here' ? ' for here' : '';
    return `A ${size}${drink}${service}, please.`;
  };
  function contextualDetails(id) {
    const item = [...details(id)];
    const state = s() || {};
    if (state.selectedScene !== 'coffee') return item;
    const missionId = state.coffeeMissionId || state.coffee?.missionId;
    const target = state.coffee?.target || {};
    if (missionId === 'C03' && id === 'coffee-size') return [
      'choose-size', '把拿错的杯型改回来',
      '你点的是小杯，但店员给成了大杯。告诉她你原本点的是小杯。',
      'Sorry, I ordered a small.',
      '先说明有误，再说出正确杯型。只说 Small 也能继续。',
    ];
    if (['C02', 'C04'].includes(missionId) && ['coffee-order', 'coffee-size', 'coffee-service'].includes(id)) {
      const targetText = [target.size, target.drink, target.service === 'to-go' ? 'to go' : target.service === 'here' ? 'for here' : null]
        .filter(Boolean).join(' · ');
      item[2] = `${missionId === 'C02' ? '朋友要的' : '这张订单是'}：${targetText}。把关键信息说清楚就能继续。`;
      item[3] = coffeeOrderPhrase(target);
      item[4] = '可以一次说完整，也可以先说一个词；看过这句后，本次会如实记为使用过示范。';
    }
    return item;
  }
  const targetLabel = id => Object.values(TASKS).find(row => row[0] === id)?.[1] || '生活表达';
  const language = value => /\p{Script=Han}/u.test(value) ? (/[a-z]/i.test(value) ? 'mixed' : 'zh') : /[a-z]/i.test(value) ? 'en' : 'unknown';
  const independent = a => a.productionCondition === 'independent';
  const englishVoice = a => a.outcome === 'success' && a.source === 'voice' && a.language === 'en';
  const sceneLabel = id => SCENES[id]?.label || '生活场景';
  const byEvidenceTime = (a, b) => String(a.at || '').localeCompare(String(b.at || '')) || String(a.id || '').localeCompare(String(b.id || ''));
  const helpLabels = Object.freeze({
    subtitles: '字幕',
    'transcript-history': '完整对话',
    meaning: '中文释义',
    replay: '重听',
    keyword: '关键词',
    'full-example': '完整示范',
  });

  function dueNow(item) {
    const due = Date.parse(item?.dueAt);
    return Number.isFinite(due) && due <= Date.now();
  }

  function shortDate(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
      : '';
  }

  function helpSummary(attempt) {
    const labels = [...new Set((attempt.exposureKinds || []).map(kind => helpLabels[kind]).filter(Boolean))];
    if (labels.length) return `用过${labels.join('、')}，再少看一点`;
    if (attempt.language === 'zh' || attempt.language === 'mixed') return '用过中文，再试着说英语';
    if (attempt.source === 'text') return '上次用文字，这次直接说';
    if (attempt.source === 'tap' || attempt.source === 'drag') return '上次用动作，这次直接说';
    if (attempt.productionCondition === 'assisted' || attempt.supportLevel > 0) return '用过提示，再少看一点';
    if (attempt.productionCondition === 'unknown' || attempt.supportLevel === null) return '帮助条件未记录，再确认一次';
    if (attempt.source === 'voice' && attempt.language !== 'en') return '已经开口，再试着说英语';
    return '还没独立说出，再试一次';
  }

  function learningNotesModel() {
    const totals = store.summary();
    const profile = store.getProfile();
    const queue = store.getReviewQueue();
    const due = queue.filter(dueNow).sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)));
    const upcoming = queue.filter(item => !dueNow(item)).sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)));
    const attemptsByTarget = new Map();
    for (const attempt of profile.attempts.filter(item => item.outcome !== 'technical-error')) {
      if (!attemptsByTarget.has(attempt.targetId)) attemptsByTarget.set(attempt.targetId, []);
      attemptsByTarget.get(attempt.targetId).push(attempt);
    }
    const strengthen = [];
    for (const [targetId, attempts] of attemptsByTarget) {
      const latest = [...attempts].sort(byEvidenceTime).at(-1);
      if (!latest || (latest.outcome === 'success' && independent(latest))) continue;
      strengthen.push({
        targetId,
        sceneId: latest.sceneId,
        missionId: latest.missionId,
        at: latest.at,
        reason: latest.outcome === 'unconfirmed'
          ? '意思未确认，再试一次'
          : helpSummary(latest),
      });
    }
    strengthen.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return {
      totals,
      profile,
      queue,
      due,
      upcoming,
      strengthen,
      targetEvidence: store.getTargetEvidence(),
    };
  }

  function metadata(context = {}, taskId = context.taskId || task()?.id) {
    const current = task() || {};
    const state = s() || {};
    const isCoffee = (context.sceneId || state.selectedScene) === 'coffee';
    const missionId = isCoffee ? (context.missionId || current.missionId || state.coffeeMissionId || state.coffee?.missionId || null) : null;
    return {
      missionId,
      variantId: isCoffee ? (context.variantId || current.variantId || state.coffeeVariantId || state.coffee?.variantId || null) : null,
      challengeType: context.challengeType || state.encounterChallenge || current.challengeType || (isCoffee ? state.challengeType : null)
        || (missionId === 'C04' ? 'independent' : missionId ? 'guided' : 'unknown'),
      promptModality: context.promptModality || (state.practiceMode === 'listening' || state.subtitlesHidden === true ? 'audio' : 'audio-text'),
      taskId,
    };
  }

  function exposureKind(kind) {
    if (['example', 'intro-example', 'character-example'].includes(kind)) return 'full-example';
    if (kind === 'visual-word-cue') return 'keyword';
    if (['meaning', 'idle-meaning', 'character-meaning', 'conversation-help'].includes(kind)) return 'meaning';
    return kind;
  }

  function noteExposure(kind, context = {}) {
    if (!adapter || !sessionId || !s().sceneStarted) return null;
    const normalizedKind = exposureKind(kind);
    const item = metadata(context);
    const targetId = context.targetId || details(item.taskId)[0];
    const event = store.recordExposure({
      id: context.id || `${sessionId}:${item.taskId}:exposure-${++exposureSerial}`,
      sessionId, sceneId: context.sceneId || s().selectedScene, taskId: item.taskId, targetId,
      missionId: item.missionId, variantId: item.variantId, kind: normalizedKind,
      revealsTargetAnswer: typeof context.revealsTargetAnswer === 'boolean'
        ? context.revealsTargetAnswer : normalizedKind === 'full-example' || normalizedKind === 'keyword',
      affectsListening: context.affectsListening,
      affectsProduction: context.affectsProduction,
      relearning: context.relearning,
      at: context.at,
    });
    if (event) {
      const goal = s().sessionGoals[item.taskId] ||= {};
      goal.exposureIds ||= [];
      if (!goal.exposureIds.includes(event.id)) goal.exposureIds.push(event.id);
      checkpoint();
    }
    return event;
  }

  function supportLevel() {
    if (!adapter || !sessionId || !s().sceneStarted) return null;
    return s().sessionGoals[task().id]?.supportLevel ?? 0;
  }

  function noteHelp(level = 3, kind = 'example') {
    if (!adapter || !s().sceneStarted) return;
    const record = adapter.goal();
    record.supportLevel = Math.max(record.supportLevel || 0, level);
    record.supportKinds ||= [];
    if (!record.supportKinds.includes(kind)) record.supportKinds.push(kind);
    noteExposure(kind);
    checkpoint();
  }

  function begin(resume = null) {
    const item = metadata(resume || {});
    sessionId = store.beginSession({ sceneId: s().selectedScene, mode: s().practiceMode, resumeId: resume?.sessionId,
      missionId: item.missionId, variantId: item.variantId, challengeType: item.challengeType,
      promptModality: item.promptModality });
    if (introductoryExample === s().selectedScene) {
      const firstId = task()?.id || FIRST_TASK[s().selectedScene] || FIRST_TASK.kitchen;
      s().sessionGoals[firstId] ||= {};
      s().sessionGoals[firstId].supportLevel = 3;
      s().sessionGoals[firstId].supportKinds = ['intro-example'];
      noteExposure('full-example', { taskId: firstId, revealsTargetAnswer: true });
    }
    // Studying on the result screen is not a new practice session. Carry that
    // help into the next matching encounter, including after a page reload.
    const profile = store.getProfile();
    const today = new Date().toDateString();
    for (const event of profile.exposures.filter(event => event.id.includes(':focus:') && !event.id.includes(':carry:')
      && new Date(event.at).toDateString() === today)) {
      if (profile.exposures.some(item => item.id.endsWith(`:carry:${event.id}`)
        && profile.attempts.some(attempt => attempt.outcome !== 'technical-error' && attempt.exposureIds.includes(item.id)))) continue;
      const targetTask = (adapter.taskIds?.() || SCENE_TASKS[s().selectedScene] || []).find(id => details(id)[0] === event.targetId);
      if (!targetTask) continue;
      const goal = s().sessionGoals[targetTask] ||= {};
      goal.supportLevel = Math.max(goal.supportLevel || 0, event.kind === 'full-example' ? 3 : 2);
      noteExposure(event.kind, { id: `${sessionId}:carry:${event.id}`, taskId: targetTask, targetId: event.targetId,
        revealsTargetAnswer: true, relearning: true });
    }
    resetIntroduction();
  }

  function noteAnswer(context, outcome = 'success') {
    if (!sessionId || !adapter || !context?.taskId || context.evidenceSessionId !== sessionId
      || context.source !== 'voice') return;
    if (/\p{Script=Han}/u.test(context.answer || '') || /what does.*mean|how (?:do|can) (?:i|you) say|don.t understand/i.test(context.answer || '')) noteHelp(2, 'conversation-help');
    const support = [0, 1, 2, 3].includes(context.supportLevel) ? Math.max(context.supportLevel, s().sessionGoals[context.taskId]?.supportLevel || 0) : null;
    const item = metadata(context);
    store.recordAttempt({
      id: `${sessionId}:${context.messageId || `attempt-${++serial}`}`,
      sessionId, sceneId: context.sceneId, taskId: context.taskId,
      targetId: details(context.taskId)[0], source: context.source,
      missionId: item.missionId, variantId: item.variantId, challengeType: item.challengeType,
      promptModality: item.promptModality, conditionsTracked: true,
      retentionCheck: context.retentionCheck,
      language: language(String(context.answer || '')), supportLevel: support, outcome,
    });
    checkpoint();
  }

  function noteAction(source = 'tap') {
    if (!sessionId || !adapter) return;
    const item = metadata();
    store.recordAttempt({ id: `${sessionId}:${task().id}:action`, sessionId,
      sceneId: s().selectedScene, taskId: task().id, targetId: details(task().id)[0],
      source: source === 'drag' ? 'drag' : 'tap', language: 'unknown',
      missionId: item.missionId, variantId: item.variantId, challengeType: item.challengeType,
      promptModality: item.promptModality, conditionsTracked: true,
      supportLevel: supportLevel(), outcome: 'success' });
    checkpoint();
  }

  function checkpoint(nextIndex) {
    if (!adapter || !sessionId || !s().sceneStarted || s().stage === 'complete' || s().sessionSaved) return;
    const state = s();
    if (['coffee', 'kitchen'].includes(state.selectedScene)) {
      store.saveCheckpoint({ sessionId, sceneId: state.selectedScene, taskIndex: 0,
        practiceMode: state.practiceMode,
        missionId: state.selectedScene === 'coffee' ? (state.coffeeMissionId || state.coffee?.missionId) : null,
        variantId: state.selectedScene === 'coffee' ? (state.coffeeVariantId || state.coffee?.variantId) : null });
      return;
    }
    if (!Number.isInteger(nextIndex) && state.stage === 'task-complete') nextIndex = Math.min(adapter.taskCount() - 1, state.taskIndex + 1);
    store.saveCheckpoint({ sessionId, sceneId: state.selectedScene,
      taskIndex: Number.isInteger(nextIndex) ? nextIndex : state.taskIndex,
      practiceMode: state.practiceMode, breakfast: state.breakfast, coffee: state.coffee,
      missionId: state.selectedScene === 'coffee' ? (state.coffeeMissionId || state.coffee?.missionId) : null,
      variantId: state.selectedScene === 'coffee' ? (state.coffeeVariantId || state.coffee?.variantId) : null,
      coveredGoals: [...state.coveredGoals], goalRecords: state.sessionGoals });
  }

  function complete() {
    if (!adapter || !sessionId) return;
    store.completeSession({ id: sessionId, sceneId: s().selectedScene });
    render();
  }

  function taskStarted() {
    closeHelp();
    const goal = adapter.goal();
    goal.supportLevel ??= 0;
    const sceneLabels = { coffee: 'Mia · 街角咖啡店', kitchen: 'Luma · 家中早餐', airport: '工作人员 · 机场',
      office: `${task().speaker || (task().id === 'office-greeting' ? 'Maya' : '前台')} · 初次拜访` };
    write('learningStageLabel', sceneLabels[s().selectedScene] || '生活里的英语对话');
    checkpoint();
  }

  function homeStep() {
    if (window.LumaWorldLoop) return window.LumaWorldLoop.plan(store.getProfile(), {
      checkpoint: store.getCheckpoint(), completedMissions: adapter?.coffeeJourney?.()?.completed || [],
    });
    const next = store.nextStep();
    const summary = store.summary();
    const journey = adapter?.coffeeJourney?.();
    if (next.kind !== 'resume' && journey?.nextMissionId) {
      return {
        ...next, kind: 'quest', sceneId: 'coffee', missionId: journey.nextMissionId,
        missionTitle: journey.nextMissionTitle,
      };
    }
    if (next.kind === 'continue' && summary.sessionCount === 0) {
      return {
        ...next, kind: 'quest', sceneId: 'coffee', missionId: journey?.nextMissionId || 'C01',
        missionTitle: journey?.nextMissionTitle || '第一次自己点咖啡',
      };
    }
    if (next.kind === 'continue' && summary.completedSessions > 0) {
      const completed = store.getProfile().sessions.filter(x => x.completedAt).sort((a, b) => a.completedAt.localeCompare(b.completedAt));
      const last = completed.at(-1);
      if (last?.sceneId === 'coffee' && journey?.nextMissionId) return {
        ...next, kind: 'quest', sceneId: 'coffee', missionId: journey.nextMissionId, missionTitle: journey.nextMissionTitle,
      };
      return { ...next, kind: 'transfer', sceneId: NEXT_SCENE[last?.sceneId] || 'kitchen' };
    }
    return next;
  }

  function renderHome() {
    if (!adapter) return;
    const next = homeStep(), summary = store.summary();
    const scene = SCENES[next.sceneId] || SCENES.kitchen;
    const checkpoint = next.kind === 'resume' ? store.getCheckpoint() : null;
    const missionId = next.sceneId === 'coffee' ? (next.missionId || checkpoint?.missionId || null) : null;
    const coffeeCopy = {
      C01: ['推开门，给自己点一杯', '一杯喜欢的咖啡，堂食或带走。'],
      C02: ['朋友托你带一杯', '小杯拿铁，带走。'],
      C03: ['这杯好像拿错了', '你要的是小杯。发现不对，就告诉 Mia。'],
      C04: ['换一张订单，自己来', '先不看字幕，试着独立把这杯点清楚。'],
    };
    const missionCopy = coffeeCopy[missionId];
    const title = window.LumaWorldLoop ? next.title : next.kind === 'resume'
      ? (next.sceneId === 'coffee' ? '继续咖啡店任务' : '接着刚才的，慢慢说就好')
      : next.kind === 'review' ? '还记得吗？今天再试一次'
      : next.kind === 'quest' && missionCopy ? missionCopy[0]
      : scene.title.replace('\n', '');
    const homeReasons = {
      resume: '从这件小事的开头继续，也可以重练之前的任务。',
      review: '隔了一段时间，试试还记得多少。需要时再求助。',
      retry: next.practiceMode === 'listening' ? '刚才用过帮助。这次先听着回应，字幕随时可开。' : '先按熟悉的方式再试一次，需要时查看帮助。',
      transfer: '把咖啡店练过的选择，换成牛奶或水再用一次。',
      return: '建议明天再来试试；现在也可以继续点一杯。',
      start: '和 Mia 打声招呼，点杯咖啡。一个词也能开始。',
    };
    const subtitle = window.LumaWorldLoop ? (homeReasons[next.kind] || next.reason) : next.kind === 'resume'
      ? (next.sceneId === 'coffee' ? '可从头继续，或重练前面的任务。' : `${scene.label} · 已替你留好进度`)
      : next.kind === 'review' ? '先试着自己说，需要帮助时随时查看。'
      : next.kind === 'quest' && missionCopy ? missionCopy[1]
      : scene.subtitle;
    write('todayTitle', title);
    write('todaySubtitle', subtitle);
    write('todayContext', scene.context);
    const journeyTitle = next.sceneId === 'coffee' ? '街角的第一杯' : next.sceneId === 'airport' ? '出发前的短练习' : next.sceneId === 'office' ? '工作日短练习' : '熟悉的早晨';
    write('adventureJourneyTitle', journeyTitle);
    document.querySelector('.journey-switch')?.setAttribute('aria-label', `查看当前旅程：${journeyTitle}`);
    write('todayMissionCode', `${next.kind === 'resume' ? '继续委托' : next.kind === 'review' ? '再试一次' : '当前委托'}${missionId ? ` · ${missionId}` : ''}`);
    const landmark = document.querySelector('.current-landmark');
    const isFinalCoffeeMission = next.sceneId === 'coffee' && missionId === 'C04';
    write('adventureLandmarkLabel', isFinalCoffeeMission ? '当前 · C04 独立挑战' : scene.context);
    landmark?.classList.toggle('is-current-mission', isFinalCoffeeMission);
    const landmarkIcon = landmark?.querySelector('i');
    if (landmarkIcon) landmarkIcon.className = isFinalCoffeeMission ? 'ph-fill ph-flag' : 'ph-fill ph-map-pin';
    const route = $('adventureRoute');
    if (route) route.hidden = next.sceneId !== 'coffee';
    if (next.sceneId === 'coffee' && missionId) {
      for (const node of document.querySelectorAll('[data-adventure-mission]')) {
        const current = node.dataset.adventureMission === missionId;
        const done = adapter?.coffeeJourney?.()?.completed?.includes(node.dataset.adventureMission) && !current;
        node.classList.toggle('is-current', current); node.classList.toggle('is-complete', Boolean(done));
        node.classList.toggle('is-upcoming', !current && !done);
        const status = node.querySelector('em'); if (status) status.textContent = current ? '现在' : done ? '已完成' : '可探索';
      }
    }
    const routeLine = document.querySelector('.adventure-route-line');
    if (routeLine) routeLine.hidden = next.sceneId !== 'coffee';
    if ($('todayHero')) {
      $('todayHero').src = scene.image;
      $('todayHero').alt = next.sceneId === 'coffee' ? '阳光下的街角咖啡店，Mia 正在窗口准备咖啡' : scene.label;
    }
    const cta = document.querySelector('.primary-cta');
    if (cta) {
      const questAction = { C01: '进去点一杯', C02: '帮朋友带一杯', C03: '去处理这次错单', C04: '开始独立挑战' }[missionId];
      const label = next.kind === 'resume' ? (next.sceneId === 'coffee' ? '继续任务' : '继续刚才的委托') : next.kind === 'review' ? '再试一次' : next.kind === 'quest' ? (questAction || '继续这段经历') : next.kind === 'transfer' ? '去下一段生活' : '开始这件事';
      cta.textContent = next.actionLabel || label;
      cta.dataset.openScene = next.sceneId || 'kitchen';
    }
    const chooseMission = $('chooseCoffeeMission');
    if (chooseMission) {
      chooseMission.hidden = false;
      chooseMission.setAttribute('aria-label', next.sceneId === 'coffee' ? '选择咖啡店任务' : '选择其他生活场景');
    }
    const label = document.querySelector('.live-label');
    if (label) { label.hidden = Boolean(chooseMission && !chooseMission.hidden); label.textContent = next.kind === 'resume' ? (next.sceneId === 'coffee' ? '任务已记住' : '进度已保存') : next.kind === 'review' ? '适合再试一次' : summary.todayCompletedSessions ? '新事件已出现' : '准备开始'; }
  }

  function startHome({ chooseMission = false } = {}) {
    const next = homeStep();
    if (chooseMission && next.sceneId !== 'coffee') { adapter.chooseWorld?.(); return; }
    const saved = next.kind === 'resume' ? store.getCheckpoint() : null;
    const missionId = next.sceneId === 'coffee' ? (next.missionId || saved?.missionId || null) : next.missionId;
    const choosingCoffeeMission = chooseMission && next.sceneId === 'coffee';
    if (missionId) adapter.selectCoffeeMission?.(missionId);
    const reviewTaskIndex = next.kind === 'review' && !choosingCoffeeMission
      ? Math.max(0, (SCENE_TASKS[next.sceneId] || []).indexOf(next.taskId))
      : 0;
    adapter.start(next.sceneId || 'kitchen', {
      resumeCheckpoint: saved,
      skipIntro: Boolean(saved) && !chooseMission,
      subtitlesHidden: (saved?.practiceMode || next.practiceMode) === 'listening',
      explicitMode: !chooseMission,
      encounterChallenge: next.kind === 'transfer' ? 'transfer' : next.kind === 'review' ? 'retention'
        : next.practiceMode === 'listening' ? 'independent' : 'guided',
      reviewTargetIds: next.kind === 'review' && !choosingCoffeeMission ? (next.targetIds || []) : [],
      reviewItems: next.kind === 'review' && !choosingCoffeeMission ? (next.reviewItems || []) : [],
      reviewTaskId: next.kind === 'review' && !choosingCoffeeMission ? (next.taskId || null) : null,
      startTaskIndex: reviewTaskIndex,
      missionId: missionId || null,
      variantId: next.variantId || saved?.variantId || null,
    });
  }

  function startTransfer({ fromReview = false } = {}) {
    if (window.LumaWorldLoop) { startRecommendation(fromReview ? reviewPlan : homeStep()); return; }
    if (fromReview) {
      const nextScene = NEXT_SCENE[s().selectedScene] || 'kitchen';
      adapter.start(nextScene, { subtitlesHidden: false });
      return;
    }
    const summary = store.summary();
    if (!summary.completedSessions) { startHome(); return; }
    if (store.nextStep().kind === 'resume' || summary.dueCount) { startHome(); return; }
    const next = homeStep();
    if (next.missionId) adapter.selectCoffeeMission?.(next.missionId);
    adapter.start(next.sceneId || 'kitchen', { subtitlesHidden: false });
  }

  function startRecommendation(next = reviewPlan) {
    if (!next || !adapter) return;
    if (next.kind === 'resume') { startHome(); return; }
    adapter.start(next.sceneId, {
      missionId: next.missionId, variantId: next.variantId,
      subtitlesHidden: next.practiceMode === 'listening', explicitMode: true,
      encounterChallenge: next.kind === 'transfer' ? 'transfer' : next.kind === 'review' ? 'retention'
        : next.practiceMode === 'listening' ? 'independent' : 'guided',
      reviewTargetIds: next.kind === 'review' ? next.targetIds || [] : [],
      reviewItems: next.reviewItems || [], reviewTaskId: next.kind === 'review' ? next.taskId : null,
    });
  }

  function previewScene(sceneId, missionId = null) {
    if (!sceneId) return;
    if (typeof adapter?.preview === 'function') {
      adapter.preview(sceneId, missionId);
      return;
    }
    const trigger = [...document.querySelectorAll('[data-world-scene]')]
      .find(element => element.dataset.worldScene === sceneId
        && (!missionId || !element.dataset.worldMission || element.dataset.worldMission === missionId));
    trigger?.click?.();
  }

  function row(label, copy, icon = 'chat-circle', action = null) {
    const article = document.createElement('article'); article.className = 'evidence-row';
    const i = document.createElement('i'); i.className = `ph ph-${icon}`; i.setAttribute('aria-hidden', 'true');
    const body = document.createElement('div'), title = document.createElement('strong'), text = document.createElement('p');
    title.textContent = label; text.textContent = copy; body.append(title, text); article.append(i, body);
    if (action?.sceneId) {
      article.className += ' learning-note-row';
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'learning-note-action';
      const buttonLabel = document.createElement('span'); buttonLabel.textContent = action.label || '再练一次';
      button.append(buttonLabel);
      button.dataset.learningScene = action.sceneId;
      if (action.missionId) button.dataset.learningMission = action.missionId;
      button.setAttribute('aria-label', `${action.label || '再练一次'}：${label}`);
      button.addEventListener('click', () => previewScene(action.sceneId, action.missionId));
      article.append(button);
    }
    return article;
  }

  function setButtonLabel(id, text) {
    const button = $(id);
    if (!button) return;
    const label = button.querySelector('[data-learning-label]') || button.querySelector('span');
    if (label) label.textContent = text;
    else {
      const icon = button.querySelector('i');
      if (icon) {
        const span = document.createElement('span');
        span.dataset.learningLabel = ''; span.textContent = text;
        button.replaceChildren(span, icon);
      } else button.textContent = text;
    }
    button.setAttribute('aria-label', text);
  }

  function startReviewPractice() {
    if (!adapter) return;
    // A review action answers a different intent from the home continuation
    // action. An unrelated saved scene must not divert today's review.
    const next = store.nextStep({ preferReview: true });
    if (next.kind === 'review') {
      const taskIndex = Math.max(0, (SCENE_TASKS[next.sceneId] || []).indexOf(next.taskId));
      if (next.missionId) adapter.selectCoffeeMission?.(next.missionId);
      adapter.start(next.sceneId || 'kitchen', {
        subtitlesHidden: false,
        explicitMode: true, encounterChallenge: 'retention',
        practiceMode: 'guided',
        reviewTargetIds: next.targetIds || [],
        reviewItems: next.reviewItems || [],
        reviewTaskId: next.taskId || null,
        startTaskIndex: taskIndex,
        missionId: next.missionId || null,
        variantId: next.variantId || null,
      });
      return;
    }
    if (next.kind === 'resume' || adapter?.coffeeJourney?.()?.nextMissionId) {
      startHome();
      return;
    }
    if (next.kind === 'continue' && next.sceneId) {
      adapter.start(next.sceneId, { subtitlesHidden: false, practiceMode: 'guided' });
      return;
    }
    startHome();
  }

  function renderLearningNotes(notes) {
    const { totals, profile, due, upcoming, strengthen } = notes;
    const completed = profile.sessions.filter(session => session.completedAt);
    const successful = profile.attempts.filter(attempt => attempt.outcome === 'success');
    write('learningNotesTitle', '学习笔记');
    write('growthSummary', due.length ? `${due.length} 项今天适合复习` : completed.length ? '把用过的英语，再用一次。' : '从一件生活小事开始。');
    const next = due.length ? store.nextStep({ preferReview: true }) : homeStep();
    const sceneId = next.sceneId || 'coffee';
    const scene = SCENES[sceneId] || SCENES.coffee;
    const reviewTarget = due.find(item => (next.targetIds || []).includes(item.targetId)) || due[0];
    const taskTitles = {
      'choose-drink': sceneId === 'coffee' ? '再点一杯喜欢的咖啡' : '再选一杯喜欢的饮料',
      'choose-size': '说清楚想要的杯型', 'choose-service': '告诉店员堂食还是带走',
      'thank-person': '接过咖啡，说声谢谢', 'offer-item': sceneId === 'kitchen' ? '回应她，把杯子递过去' : '把登机牌给工作人员',
      'adjust-amount': '说说还想不想再来一点', 'confirm-belonging': '确认自己的行李',
      'find-location': '问清楚要去的地方', 'state-purpose': '说清楚这次的来意',
      'give-name': '介绍一下自己的名字', 'receive-information': '听懂对方的安排',
      greet: '和新认识的人打个招呼',
    };
    write('notesReviewEyebrow', due.length ? '今天再用一次' : completed.length ? '下一件生活小事' : '从一件小事开始');
    write('notesReviewCount', due.length ? `${due.length} 项待复习` : '');
    if ($('notesReviewCount')) $('notesReviewCount').hidden = !due.length;
    write('notesReviewScene', scene.context);
    if ($('notesReviewImage')) $('notesReviewImage').src = scene.image;
    write('reviewOverviewTitle', due.length ? (taskTitles[reviewTarget?.targetId] || targetLabel(reviewTarget?.targetId)) : next.title || scene.title.replace('\n', ''));
    write('reviewOverviewCopy', due.length ? '隔了一段时间，再试着自己说。需要时仍可打开提示。'
      : next.kind === 'resume' ? '从这件小事的开头继续，按自己的节奏来。'
      : upcoming.length ? `下一次复习在 ${shortDate(upcoming[0].dueAt)}。现在也可以先继续生活。`
      : completed.length ? '在熟悉的生活里，再开口说一次。' : '和对方打声招呼，从一句简单的英语开始。');
    const journey = adapter?.coffeeJourney?.();
    const reviewAction = due.length ? '开始复习'
      : store.getCheckpoint() ? '继续上次练习'
      : journey?.nextMissionId ? (journey.completed?.length ? '继续当前旅程' : '开始当前旅程')
      : completed.length ? '再练最近场景' : '开始第一段练习';
    setButtonLabel('startReview', reviewAction);
    if ($('reviewQueueList')) {
      const remaining = due.filter(item => item !== reviewTarget);
      const more = document.createElement('p'); more.className = 'review-queue-more';
      more.textContent = remaining.length ? `还可以复习：${remaining.slice(0, 2).map(item => targetLabel(item.targetId)).join('、')}${remaining.length > 2 ? `等 ${remaining.length} 项` : ''}` : '';
      $('reviewQueueList').replaceChildren(...(remaining.length ? [more] : []));
    }
    if ($('notesPracticeFold')) $('notesPracticeFold').hidden = !strengthen.length;
    write('notesHistorySummary', completed.length ? `已完成 ${completed.length} 次练习 · 查看记录` : '每一次开口，都留在这里');
    write('strengthCount', `${strengthen.length} 项`);
    if ($('strengthList')) {
      const strengthRows = strengthen.length ? strengthen.map(item => row(
          targetLabel(item.targetId),
          `${sceneLabel(item.sceneId)} · ${item.reason}`,
          item.reason.includes('未确认') ? 'question' : 'plant',
          { label: '再练一次', sceneId: item.sceneId, missionId: item.missionId },
        )) : [row('目前没有需要加强的记录', '技术中断不会算作你的弱项；有真实练习后再继续整理。', 'check-circle')];
      $('strengthList').replaceChildren(...strengthRows);
    }

    write('achievementCompleted', String(new Set(completed.map(session => session.sceneId)).size));
    write('achievementIndependent', String(totals.independentProductionCount));
    write('achievementTargets', String(totals.independentTargetCount));
    write('achievementTransfer', String(totals.transferCount));

    if ($('growthEmpty')) $('growthEmpty').hidden = completed.length > 0 || successful.length > 0;
    if ($('abilityEmpty')) $('abilityEmpty').hidden = successful.length > 0;
  }

  function render() {
    if (!adapter) return;
    renderHome();
    const notes = learningNotesModel();
    const { totals, profile } = notes;
    const successful = profile.attempts.filter(a => a.outcome === 'success');
    renderLearningNotes(notes);
    renderWorldEvidence(profile);
    if ($('evidenceList')) {
      $('evidenceList').replaceChildren();
      const grouped = new Map();
      for (const a of successful) { if (!grouped.has(a.targetId)) grouped.set(a.targetId, []); grouped.get(a.targetId).push(a); }
      for (const [target, list] of [...grouped].reverse()) {
        const free = list.filter(independent), voiced = list.filter(englishVoice), places = new Set(free.map(a => a.sceneId));
        const text = places.size > 1 ? '曾在不同场景独立用出，下一次继续验证。' : free.length ? `有 ${free.length} 次独立英语回应，之后再试试是否记得。` : voiced.length ? '已经用英语开口，还需要示范或帮助。' : list.some(a => a.source === 'text') ? '过去曾留下非语音回答；本版请直接开口练习。' : list.some(a => a.language === 'zh' || a.language === 'mixed') ? '借助中文完成了交流，下一次试着用英语。' : '这次还没有留下英语语音证据；方便说话时，从一个词再试。';
        $('evidenceList').append(row(targetLabel(target), text, free.length ? 'chat-circle' : 'plant'));
      }
    }
    if ($('learningHistory')) {
      $('learningHistory').replaceChildren();
      const recentSessions = profile.sessions.filter(session => session.completedAt)
        .sort((a, b) => String(a.completedAt).localeCompare(String(b.completedAt))).slice(-5).reverse();
      for (const session of recentSessions) {
        const date = new Date(session.completedAt).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
        const sessionAttempts = successful.filter(attempt => attempt.sessionId === session.id);
        const independentCount = sessionAttempts.filter(independent).length;
        const assistedCount = sessionAttempts.filter(attempt => attempt.productionCondition === 'assisted').length;
        const missionTitle = session.sceneId === 'coffee' && session.missionId
          ? ({ C01: '第一次自己点咖啡', C02: '替朋友点对那一杯', C03: '把错单修正回来', C04: '独立完成一张新订单' }[session.missionId])
          : null;
        const evidence = independentCount ? ` · ${independentCount} 次独立表达`
          : assistedCount ? ` · ${assistedCount} 次借助帮助`
          : '';
        $('learningHistory').append(row(missionTitle || SCENES[session.sceneId]?.label || '场景练习', `${date} · 完成${evidence}`, 'receipt'));
      }
      if (profile.legacySummaries?.length) $('learningHistory').append(row('以前的练习已保留', `${profile.legacySummaries.length} 条旧记录未区分提示，不计入独立能力`, 'clock-counter-clockwise'));
    }
    write('profileLearningCopy', totals.sessionCount ? `已开始 ${totals.sessionCount} 次练习，完成 ${totals.completedSessions} 段。按自己的节奏继续。` : '还没有练习记录。完成第一段生活场景，就从这里开始。');
    if (!totals.storageAvailable && !storageNoticeShown) { storageNoticeShown = true; adapter.notify('当前浏览器无法保存进度。这次仍能练习，关闭后可能无法恢复。', 5000); }
  }

  function renderReview() {
    const attempts = store.getProfile().attempts.filter(a => a.sessionId === sessionId && a.outcome === 'success');
    const voice = attempts.filter(englishVoice), free = voice.filter(independent);
    write('reviewSceneMeta', `${SCENES[s().selectedScene]?.label || '场景练习'} · 这一段完成了`);
    write('reviewHeard', `${s().coveredGoals.size} 个生活步骤`);
    write('reviewActions', `${free.length} 次未看答案`);
    write('reviewSpoken', `${voice.length} 次英语开口`);
    if ($('reviewEvidenceList')) { $('reviewEvidenceList').replaceChildren(row(free.length ? `${free.length} 次，没有看答案也表达了意思` : '这次的合作已经完成', free.length ? '下次换个人或物品再试，看看能否继续独立表达。' : voice.length ? '这次借助了帮助。下一次试着少看一点提示。' : '这次还没有留下英语语音证据；下一次可以从一个英语词开始。', 'plant')); }
    const user = [...s().dialogueHistory].reverse().find(m => m.speaker === 'user' && m.inputSource === 'voice' && language(m.text) === 'en');
    if ($('reviewRecast')) $('reviewRecast').hidden = !user;
    if (user) { write('reviewOriginal', user.text); write('reviewCorrected', ''); $('reviewRecastArrow').hidden = true; $('reviewRecastLabel').hidden = true; $('playRecast').hidden = true; }
    if (window.LumaWorldLoop) {
      const profile = store.getProfile();
      reviewPlan = window.LumaWorldLoop.plan(profile, { checkpoint: store.getCheckpoint(),
        completedMissions: adapter?.coffeeJourney?.()?.completed || [] });
      const facts = window.LumaWorldLoop.summary(profile, { sessionId });
      if ($('reviewEvidenceList')) $('reviewEvidenceList').replaceChildren(
        row('这次怎样完成的', facts.lines.join('；'), 'plant'));
      write('reviewTransferTitle', reviewPlan.title);
      write('reviewTransferCopy', reviewPlan.reason);
      write('repeatScene', reviewPlan.actionLabel);
      if ($('worldAlternative')) {
        $('worldAlternative').hidden = !reviewPlan.alternative;
        write('worldAlternative', reviewPlan.alternative ? `也可以${reviewPlan.alternative.actionLabel}` : '');
      }
      reviewFocus = window.LumaWorldLoop.focus(profile, { sessionId });
      if ($('worldFocus')) {
        $('worldFocus').open = false;
        $('worldFocus').hidden = !reviewFocus;
      }
      if (reviewFocus) {
        write('worldFocusTitle', reviewFocus.title);
        write('worldFocusReason', reviewFocus.reason);
        write('worldFocusMeaning', reviewFocus.meaning);
        write('worldFocusKeyword', reviewFocus.keyword);
        write('worldFocusExample', reviewFocus.example);
      }
      if ($('worldFocusExample')) $('worldFocusExample').hidden = true;
      if ($('worldFocusReveal')) { $('worldFocusReveal').hidden = false; $('worldFocusReveal').setAttribute('aria-expanded', 'false'); }
      render();
      return;
    }
    const journey = s().selectedScene === 'coffee' ? adapter?.coffeeJourney?.() : null;
    if (journey?.nextMissionId) {
      const nextCopy = {
        C02: '下一关要记住朋友的目标订单，再完整转述给 Mia。',
        C03: '下一关会收到错误杯型。先发现不对，再用英语改回来。',
        C04: '最后一关默认关闭字幕，订单也会变化；听不清仍可以主动求助。',
      };
      write('reviewTransferTitle', `下一关：${journey.nextMissionTitle}`);
      write('reviewTransferCopy', nextCopy[journey.nextMissionId] || '沿用刚才会的表达，再处理一种真实情况。');
      write('repeatScene', `继续任务 ${journey.nextMissionId}`);
    } else if (s().selectedScene === 'coffee' && journey) {
      write('reviewTransferTitle', '换一张订单，再独立应对一次');
      write('reviewTransferCopy', '订单会变化，默认不显示字幕；需要时仍然可以主动求助。');
      write('repeatScene', '再挑战一个新订单');
    } else {
      write('reviewTransferTitle', TRANSFER_TITLE[NEXT_SCENE[s().selectedScene] || 'kitchen']);
      write('reviewTransferCopy', '换一个交流对象，有需要时仍然可以求助。');
      write('repeatScene', '换个场景试一试');
    }
    render();
  }

  function evidenceCondition(attempt) {
    if (attempt.productionCondition === 'independent') return attempt.listeningCondition === 'independent'
      ? '无字幕、无答案提示，用英语回应' : '未看答案提示，用英语回应';
    if (attempt.language === 'zh' || attempt.language === 'mixed') return '借助中文完成交流';
    const helps = [...new Set((attempt.exposureKinds || []).map(kind => helpLabels[kind]).filter(Boolean))];
    return helps.length ? `借助${helps.join('、')}完成` : '完成交流，帮助条件尚未确认';
  }

  function renderWorldEvidence(profile) {
    const container = $('worldEvidenceList');
    if (!container) return;
    const byTarget = new Map();
    const attempts = profile.attempts.filter(a => a.outcome !== 'technical-error' && Date.parse(a.at) <= Date.now()).sort(byEvidenceTime);
    for (const item of attempts) {
      if (!byTarget.has(item.targetId)) byTarget.set(item.targetId, []);
      byTarget.get(item.targetId).push(item);
    }
    const changes = [];
    for (const [targetId, records] of byTarget) {
      const latest = records.at(-1);
      const previous = [...records].reverse().find(item => item.sessionId !== latest.sessionId && item.outcome === 'success');
      if (!englishVoice(latest) || !independent(latest) || !previous) continue;
      let before = '', after = '', note = '';
      if (previous.productionCondition === 'assisted') {
        before = '需要表达提示'; after = '没看答案，也说出来了';
        note = '这次少用了一点帮助。';
      } else if (englishVoice(previous) && independent(previous) && previous.listeningCondition === 'assisted' && latest.listeningCondition === 'independent') {
        before = '借助字幕或听力帮助'; after = '只听声音，也回应了';
        note = '这次听懂后，自己接上了话。';
      } else if (englishVoice(previous) && independent(previous) && previous.sceneId !== latest.sceneId) {
        before = sceneLabel(previous.sceneId); after = sceneLabel(latest.sceneId);
        note = '换了个地方，也独立表达了一次。';
      }
      if (note) changes.push({ targetId, latest, previous, before, after, note });
    }
    changes.sort((a, b) => byEvidenceTime(b.latest, a.latest));
    const change = changes[0];
    if ($('worldEvidenceSection')) $('worldEvidenceSection').hidden = !change;
    container.replaceChildren();
    if (change) {
      const card = document.createElement('article'); card.className = 'world-evidence-card';
      const title = document.createElement('h3'); title.textContent = targetLabel(change.targetId);
      const comparison = document.createElement('div'); comparison.className = 'notes-progress-comparison';
      for (const [label, text, item] of [['上次', change.before, change.previous], ['这次', change.after, change.latest]]) {
        const line = document.createElement('div'), meta = document.createElement('small'), value = document.createElement('span');
        meta.textContent = `${label} · ${shortDate(item.at)}`; value.textContent = text; line.append(meta, value); comparison.append(line);
      }
      const note = document.createElement('p'); note.className = 'world-evidence-note'; note.textContent = change.note;
      card.append(title, comparison, note); container.append(card);
    }
    const history = $('notesEvidenceList');
    if (history) {
      const recent = [...attempts].reverse().slice(0, 12);
      if ($('notesEvidenceHistory')) $('notesEvidenceHistory').hidden = !recent.length;
      history.replaceChildren(...recent.map(item => row(targetLabel(item.targetId),
        `${shortDate(item.at)} · ${sceneLabel(item.sceneId)} · ${item.outcome === 'success' ? evidenceCondition(item) : '这次还未确认意思'}`, 'chat-circle')));
    }
  }

  function noteFocusStudy(kind) {
    if (!reviewFocus || !sessionId) return;
    store.recordExposure({ id: `${sessionId}:focus:${reviewFocus.targetId}:${kind}`, sessionId,
      sceneId: reviewFocus.sceneId, taskId: reviewFocus.taskId, targetId: reviewFocus.targetId,
      kind, revealsTargetAnswer: true, affectsProduction: true, affectsListening: false, relearning: true });
  }

  function closeHelp() {
    const panel = $('learningHelpPanel');
    const wasOpen = Boolean(panel && !panel.hidden);
    if (panel) panel.hidden = true;
    for (const [element, wasInert] of helpSiblings) element.inert = wasInert;
    helpSiblings = [];
    if (wasOpen) adapter?.resumeGuidance?.();
  }

  function resetIntroduction() {
    introductoryExample = false;
    if (introExampleText) introExampleText.hidden = true;
    introExampleButton?.setAttribute('aria-expanded', 'false');
  }

  function noteCharacterLine(text) {
    if (s()?.subtitlesHidden !== true) noteExposure('subtitles', { revealsTargetAnswer: false });
    if (/可以说|你可以说|you (?:can|could) say|try saying|repeat after me|say it like/i.test(text)) noteHelp(3, 'character-example');
    else if (/\p{Script=Han}/u.test(text)) noteHelp(1, 'character-meaning');
  }

  function openHelp(kind = 'menu') {
    if (!adapter || !s().sceneStarted) return;
    adapter.pauseGuidance?.();
    const panel = $('learningHelpPanel'); if (!panel) return;
    if (panel.hidden) {
      helpTrigger = document.activeElement;
      helpSiblings = [...panel.parentElement.children].filter(element => element !== panel).map(element => [element, element.inert]);
      for (const [element] of helpSiblings) element.inert = true;
    }
    panel.hidden = false;
    const content = $('learningHelpContent'); content.replaceChildren();
    const item = contextualDetails(task().id);
    if (kind === 'meaning') { noteHelp(1, 'meaning'); content.append(row('先弄懂对方的意思', item[2], 'ear')); }
    else if (kind === 'keyword') {
      const words = {
        'choose-drink': s().selectedScene === 'coffee' ? 'latte · 拿铁 / americano · 美式' : 'milk · 牛奶 / water · 水',
        'choose-size': 'small · 小杯 / large · 大杯', 'choose-service': 'for here · 堂食 / to go · 带走',
        'thank-person': 'thank · 感谢', 'offer-item': 'here · 给你', 'adjust-amount': 'more · 再来 / enough · 够了',
        'confirm-belonging': 'mine · 我的', 'find-location': 'A12 · 登机口', 'give-name': 'my name · 我的名字',
      };
      noteHelp(2, 'keyword'); content.append(row('先用一个词试试', words[item[0]] || item[3].split(' ').slice(0, 2).join(' '), 'key'));
    }
    else if (kind === 'example') {
      noteHelp(3, 'example'); content.append(row(item[3], item[4], 'chat-circle'));
      if ((s().coffeeMissionId || s().coffee?.missionId) === 'C04')
        adapter.notify?.('已使用示范；这次仍可完成，复盘会如实记为借助帮助。', 4200);
      const play = document.createElement('button'); play.type = 'button'; play.className = 'help-example-play'; play.textContent = '听一遍示范';
      play.addEventListener('click', () => adapter.speak(item[3], { prompt: false })); content.append(play);
      const tip = document.createElement('p'); tip.textContent = '看过后先收起帮助，再换成自己的意思说一遍。'; content.append(tip);
    } else if (kind === 'replay') { noteHelp(1, 'replay'); adapter.speak(s().activeQuestion || task().prompt); content.append(row('再听一遍', '先听关键意思，不需要每个词都懂。', 'speaker-high')); }
    else content.append(row('卡住也没关系', '选择需要的帮助，之后继续刚才的小事。', 'leaf'));
    if (kind === 'menu') panel.querySelector('.learning-help-sheet button')?.focus({ preventScroll: true });
  }

  function bind(value) {
    adapter = value;
    $('startReview')?.addEventListener('click', startReviewPractice);
    $('worldAlternative')?.addEventListener('click', () => startRecommendation(reviewPlan?.alternative));
    $('worldFocus')?.addEventListener('toggle', () => { if ($('worldFocus').open) noteFocusStudy('keyword'); });
    $('worldFocusReveal')?.addEventListener('click', () => {
      noteFocusStudy('full-example');
      if ($('worldFocusExample')) $('worldFocusExample').hidden = false;
      $('worldFocusReveal').hidden = true;
      $('worldFocusReveal').setAttribute('aria-expanded', 'true');
    });
    $('worldFocusTry')?.addEventListener('click', () => {
      if (reviewFocus) startRecommendation({ ...reviewFocus, kind: 'retry', practiceMode: 'guided' });
    });
    $('openDialogueHistory')?.addEventListener('click', () => noteExposure('transcript-history', { revealsTargetAnswer: false }));
    document.querySelectorAll('[data-learning-help]').forEach(button => button.addEventListener('click', () => {
      const kind = button.dataset.learningHelp;
      if (kind === 'close') { closeHelp(); helpTrigger?.focus(); } else openHelp(kind);
    }));
    $('learningHelpPanel')?.addEventListener('keydown', event => {
      if (event.key === 'Escape') { closeHelp(); helpTrigger?.focus({ preventScroll: true }); }
      if (event.key === 'Tab') {
        const buttons = [...$('learningHelpPanel').querySelectorAll('.learning-help-sheet button')];
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    const guidance = document.querySelector('.intro-guidance');
    if (guidance) {
      const example = document.createElement('button'); example.type = 'button'; example.className = 'intro-example-toggle'; example.textContent = '完全不会？先看一个例子';
      const text = document.createElement('p'); text.className = 'intro-learning-example'; text.hidden = true;
      introExampleText = text; introExampleButton = example;
      example.addEventListener('click', () => {
        text.hidden = !text.hidden; example.setAttribute('aria-expanded', String(!text.hidden));
        const first = contextualDetails(task()?.id || FIRST_TASK[s().selectedScene] || FIRST_TASK.kitchen);
        text.textContent = `${first[2]} 你可以说「${first[3]}」。${first[4]}`;
        if (!text.hidden) introductoryExample = s().selectedScene;
      });
      example.setAttribute('aria-expanded', 'false'); guidance.append(example, text);
    }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') checkpoint(); else renderHome(); });
    window.addEventListener('pagehide', () => checkpoint());
    render();
  }

  window.LumaExperience = { resetIntroduction, noteCharacterLine, currentSession: () => sessionId, bind, store, begin, supportLevel, noteExposure, noteHelp, noteAnswer, noteAction, checkpoint, complete, taskStarted, render, renderHome, renderReview, startHome, startReviewPractice, startTransfer, startRecommendation, closeHelp, openHelp };
})();

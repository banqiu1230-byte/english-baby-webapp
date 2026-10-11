/* Product learning UI. Voice playback and task advancement remain in app.js. */
(() => {
  'use strict';
  let adapter = null;
  let sessionId = null;
  let introductoryExample = false;
  let introExampleText = null;
  let introExampleButton = null;
  let helpTrigger = null;
  let helpReading = false;
  let helpRequest = null;
  let helpRevision = 0;
  let serial = 0;
  let exposureSerial = 0;
  let storageNoticeShown = false;
  let reviewPlan = null;
  let reviewFocus = null;
  let storage;
  try { storage = window.localStorage; } catch { storage = null; }
  const store = LumaLearning.createStore(storage, { now: () => Date.now() });
  const lifeStore = window.LumaLifeExperience?.createStore(storage, { now: () => Date.now() }) || null;
  let lastReward = null;
  if (lifeStore) {
    const completed = store.getProfile().sessions.filter(item => item.scope === 'life-event' && item.completedAt);
    lifeStore.migrate(completed);
    // Repair a reload between the evidence receipt and its XP write.
    for (const session of completed.sort((a, b) => a.completedAt.localeCompare(b.completedAt))) lifeStore.complete(session);
  }
  const $ = id => document.getElementById(id);
  const write = (id, text) => { if ($(id)) $(id).textContent = text; };
  const InterviewModule = typeof Interview === 'undefined' ? window.Interview : Interview;
  const TASKS = {
    ...(InterviewModule?.learningDetails || {}),
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
    interview: { title: '把你的设计经历，\n讲给面试官听', subtitle: '从自我介绍到作品集追问，练习真实的英文设计师面试', context: '职场 · 设计师面试', image: './assets/interview/room.png', label: 'UI/UX 设计师英文面试' },
    kitchen: { title: '今天，选一杯\n喜欢的饮料', subtitle: '从一个词开始，把意思说清楚', context: '家 · 清晨', image: './assets/optimized/breakfast-preview-860.jpg', label: '一起准备早餐' },
    coffee: { title: '下楼，点一杯\n喜欢的咖啡', subtitle: '从饮品到杯型，用自己的话点好这一杯', context: '日常 · 街角咖啡店', image: './assets/optimized/coffee-home-720.jpg', label: '下楼点杯咖啡' },
    airport: { title: '换个地方，\n把意思说清楚', subtitle: '从回应登机牌请求开始，试着和工作人员交流', context: '出行 · 机场', image: './assets/optimized/airport-preview-860.jpg', label: '在机场回应工作人员' },
    office: { title: '第一次见面，\n试着打个招呼', subtitle: '说明来意，认识一位新同事', context: '工作 · 初次见面', image: './assets/optimized/office-preview-860.jpg', label: '第一次拜访新同事' },
  };
  const NEXT_SCENE = { interview: 'interview', kitchen: 'coffee', coffee: 'kitchen', airport: 'office', office: 'kitchen' };
  const FIRST_TASK = { interview: InterviewModule?.tasksFor('I01')[0]?.id, kitchen: 'breakfast-drink', coffee: 'coffee-order', airport: 'ticket', office: 'office-purpose' };
  const SCENE_TASKS = {
    interview: (InterviewModule?.tasks || []).map(t => t.id),
    kitchen: ['breakfast-drink', 'breakfast-cup', 'breakfast-more'],
    coffee: ['coffee-order', 'coffee-size', 'coffee-service', 'coffee-thanks'],
    airport: ['ticket', 'bag', 'gate-a12'],
    office: ['office-purpose', 'office-signin', 'office-wait', 'office-greeting'],
  };
  const TRANSFER_TITLE = {
    interview: '再练一轮，把设计思路说清楚',
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
    const sceneId = context.sceneId || state.selectedScene;
    const isCoffee = sceneId === 'coffee';
    const missionId = isCoffee ? (context.missionId || current.missionId || state.coffeeMissionId || state.coffee?.missionId || null)
      : sceneId === 'interview' ? (context.missionId || state.interviewMissionId || 'I01') : null;
    return {
      missionId,
      variantId: isCoffee ? (context.variantId || current.variantId || state.coffeeVariantId || state.coffee?.variantId || null) : null,
      challengeType: context.challengeType || state.encounterChallenge || current.challengeType || (isCoffee ? state.challengeType : null)
        || (['C04', 'I07'].includes(missionId) ? 'independent' : missionId ? 'guided' : 'unknown'),
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
    lastReward = null;
    sessionId = store.beginSession({ sceneId: s().selectedScene, mode: s().practiceMode, resumeId: resume?.sessionId,
      scope: s().sessionScope === 'target-practice' ? 'target-practice' : 'life-event',
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
    for (const study of profile.studies || []) {
      const elapsed = Date.now() - Date.parse(study.at);
      if (study.sceneId !== s().selectedScene || elapsed < 0 || elapsed > 24 * 60 * 60 * 1000) continue;
      if (profile.exposures.some(event => event.id.endsWith(`:study:${study.id}`)
        && profile.attempts.some(attempt => attempt.outcome !== 'technical-error' && attempt.exposureIds.includes(event.id)))) continue;
      const targetTask = (adapter.taskIds?.() || SCENE_TASKS[s().selectedScene] || []).find(id => details(id)[0] === study.targetId);
      if (!targetTask) continue;
      const revealsAnswer = ['keyword', 'full-example'].includes(study.kind);
      const goal = s().sessionGoals[targetTask] ||= {};
      goal.supportLevel = Math.max(goal.supportLevel || 0, study.kind === 'full-example' ? 3 : revealsAnswer ? 2 : 1);
      noteExposure(study.kind, { id: `${sessionId}:study:${study.id}`, taskId: targetTask, targetId: study.targetId,
        revealsTargetAnswer: revealsAnswer, relearning: true });
    }
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
      utterance: context.answer,
      heardQuestion: context.heardQuestion,
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
    if (!adapter || !sessionId || !s().sceneStarted || s().stage === 'complete' || s().sessionSaved || s().sessionScope === 'target-practice') return;
    const state = s();
    if (SCENES[state.selectedScene] && state.selectedScene !== 'interview') {
      store.saveCheckpoint({ sessionId, sceneId: state.selectedScene, taskIndex: 0,
        practiceMode: state.practiceMode,
        missionId: metadata().missionId,
        variantId: state.selectedScene === 'coffee' ? (state.coffeeVariantId || state.coffee?.variantId) : null });
      return;
    }
    if (!Number.isInteger(nextIndex) && state.stage === 'task-complete') nextIndex = Math.min(adapter.taskCount() - 1, state.taskIndex + 1);
    store.saveCheckpoint({ sessionId, sceneId: state.selectedScene,
      taskIndex: Number.isInteger(nextIndex) ? nextIndex : state.taskIndex,
      practiceMode: state.practiceMode, breakfast: state.breakfast, coffee: state.coffee,
      missionId: metadata().missionId,
      variantId: state.selectedScene === 'coffee' ? (state.coffeeVariantId || state.coffee?.variantId) : null,
      coveredGoals: [...state.coveredGoals], goalRecords: state.sessionGoals });
  }

  function complete() {
    if (!adapter || !sessionId || s().stage !== 'complete') return null;
    // Reaching the last prompt or leaving early is not completion of an interview.
    if (s().selectedScene === 'interview' && s().sessionScope !== 'target-practice') {
      const required = InterviewModule?.tasksFor(s().interviewMissionId) || [];
      if (!required.length || !required.every(item => s().coveredGoals.has(item.id))) return null;
    }
    const receipt = store.completeSession({ id: sessionId, sceneId: s().selectedScene });
    if (!receipt) return null;
    if (receipt.scope === 'life-event' && lifeStore) {
      const reward = lifeStore.complete(receipt);
      if (!lastReward || lastReward.sessionId !== receipt.id) lastReward = reward;
    } else lastReward = null;
    render();
    return receipt;
  }

  function taskStarted() {
    closeHelp();
    const goal = adapter.goal();
    goal.supportLevel ??= 0;
    const sceneLabels = { interview: 'Alex · 设计师面试', coffee: 'Mia · 街角咖啡店', kitchen: 'Luma · 家中早餐', airport: '工作人员 · 机场',
      office: `${task().speaker || (task().id === 'office-greeting' ? 'Maya' : '前台')} · 初次拜访` };
    write('learningStageLabel', sceneLabels[s().selectedScene] || '生活里的英语对话');
    checkpoint();
  }

  function homeStep(regionId = null) {
    const profile = store.getProfile();
    const places = window.LumaWorldCatalog?.places.filter(place => place.available && place.regionId === regionId) || [];
    const eligible = sceneId => Boolean(SCENES[sceneId]) && (!places.length || places.some(place => place.id === sceneId));
    const checkpoint = [...store.getCheckpoints()].reverse().find(item => eligible(item.sceneId));
    const coffeeTitles = { C01: '推开门，给自己点一杯', C02: '朋友托你带一杯', C03: '拿到的咖啡，好像不太对', C04: '今天，想喝哪一杯？' };
    if (checkpoint) return { ...checkpoint, kind: 'resume', taskIndex: checkpoint.sceneId === 'interview' ? checkpoint.taskIndex : 0,
      title: checkpoint.sceneId === 'interview' ? InterviewModule?.getMission(checkpoint.missionId)?.title || SCENES.interview.label
        : coffeeTitles[checkpoint.missionId] || SCENES[checkpoint.sceneId].label,
      reason: checkpoint.sceneId === 'coffee' && checkpoint.missionId === 'C03'
        ? '原本点了小杯拿铁带走。可以换杯，也可以留下这杯。'
        : checkpoint.sceneId === 'interview' ? '已保存面试进度，继续当前话题。'
        : '这件事已记住，从这次小事件的开头继续。', actionLabel: checkpoint.sceneId === 'interview' ? '继续面试练习' : '继续生活',
    };
    const completed = profile.sessions.filter(item => item.scope === 'life-event' && item.completedAt
      && Date.parse(item.completedAt) <= Date.now() && eligible(item.sceneId))
      .sort((a, b) => a.completedAt.localeCompare(b.completedAt));
    const last = completed.at(-1);
    if (last?.sceneId === 'interview' && InterviewModule) {
      const done = new Set(completed.filter(item => item.sceneId === 'interview').map(item => item.missionId));
      const mission = InterviewModule.missions.find(item => !done.has(item.id)) || InterviewModule.getMission('I07');
      return { kind: 'quest', sceneId: 'interview', missionId: mission.id, practiceMode: 'guided',
        title: mission.title, reason: mission.description, actionLabel: '开始面试练习' };
    }
    const doneCoffee = new Set(completed.filter(item => item.sceneId === 'coffee').map(item => item.missionId));
    const nextCoffee = Object.keys(coffeeTitles).find(id => !doneCoffee.has(id));
    const suggestedScene = !last ? 'coffee' : last.sceneId === 'coffee' && nextCoffee ? 'coffee' : NEXT_SCENE[last.sceneId] || 'coffee';
    const sceneId = eligible(suggestedScene) ? suggestedScene : (places.find(place => !completed.some(item => item.sceneId === place.id)) || places[0]).id;
    const missionId = sceneId === 'coffee' ? nextCoffee || 'C01' : sceneId === 'interview' ? 'I01' : null;
    return { kind: !last ? 'start' : sceneId === 'coffee' && nextCoffee ? 'quest' : 'return', sceneId,
      missionId, practiceMode: missionId === 'C04' ? 'listening' : 'guided',
      title: coffeeTitles[missionId] || (sceneId === 'interview' ? InterviewModule?.getMission(missionId)?.title : null) || SCENES[sceneId].label,
      reason: sceneId === 'interview' ? InterviewModule?.getMission(missionId)?.description || SCENES.interview.subtitle
        : !last && sceneId === 'coffee' ? '和 Mia 打个招呼，从一杯喜欢的咖啡开始。' : sceneId === 'coffee'
        ? '按自己的想法点单，有需要随时求助。' : SCENES[sceneId].subtitle,
      actionLabel: sceneId === 'interview' ? '开始面试练习' : !last ? '开始生活' : '继续生活',
    };
  }

  function renderHome() {
    if (!adapter) return;
    const next = homeStep(window.LumaWorldRegions?.currentRegion()), summary = store.summary();
    const scene = SCENES[next.sceneId] || SCENES.kitchen;
    const checkpoint = next.kind === 'resume' ? store.getCheckpoint({ sessionId: next.sessionId }) : null;
    const missionId = next.missionId || checkpoint?.missionId || null;
    const coffeeCopy = {
      C01: ['推开门，给自己点一杯', '一杯喜欢的咖啡，堂食或带走。'],
      C02: ['朋友托你带一杯', '小杯拿铁，带走。'],
      C03: ['拿到的咖啡，好像不太对', '原本点了小杯拿铁带走。可以换一杯，也可以留下这杯。'],
      C04: ['今天，想喝哪一杯？', '先听听 Mia 怎么说，字幕随时可开。'],
    };
    const missionCopy = coffeeCopy[missionId];
    const title = window.LumaWorldLoop ? next.title : next.kind === 'resume'
      ? (missionCopy?.[0] || '接着刚才的，慢慢说就好')
      : next.kind === 'review' ? '还记得吗？今天再试一次'
      : next.kind === 'quest' && missionCopy ? missionCopy[0]
      : scene.title.replace('\n', '');
    const subtitle = window.LumaWorldLoop ? next.reason : next.kind === 'resume'
      ? (missionCopy?.[1] || `${scene.label} · 已替你留好进度`)
      : next.kind === 'review' ? '先试着自己说，需要帮助时随时查看。'
      : next.kind === 'quest' && missionCopy ? missionCopy[1]
      : scene.subtitle;
    write('todayTitle', title);
    write('todaySubtitle', subtitle);
    write('todayContext', scene.context);
    const journeyTitle = next.sceneId === 'interview' ? '设计师面试' : next.sceneId === 'coffee' ? '街角的第一杯' : next.sceneId === 'airport' ? '出发的这一天' : next.sceneId === 'office' ? '第一次拜访' : '熟悉的早晨';
    write('adventureJourneyTitle', journeyTitle);
    document.querySelector('.journey-switch')?.setAttribute('aria-label', `查看当前旅程：${journeyTitle}`);
    write('todayMissionCode', next.kind === 'resume' ? '上次的故事' : ['review', 'retry', 'return'].includes(next.kind) ? '再见熟悉的人' : '生活里的下一幕');
    const landmark = document.querySelector('.current-landmark');
    write('adventureLandmarkLabel', scene.context);
    landmark?.classList.toggle('is-current-mission', false);
    const landmarkIcon = landmark?.querySelector('i');
    if (landmarkIcon) landmarkIcon.className = 'ph-fill ph-map-pin';
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
      const label = next.kind === 'resume' ? '继续这件事' : next.kind === 'review' ? '再去一趟' : next.kind === 'quest' ? (questAction || '继续这段经历') : next.kind === 'transfer' ? '去下一段生活' : '开始这件事';
      cta.textContent = next.actionLabel || label;
      cta.dataset.openScene = next.sceneId || 'kitchen';
    }
    const chooseMission = $('chooseCoffeeMission');
    if (chooseMission) {
      chooseMission.hidden = false;
      chooseMission.setAttribute('aria-label', next.sceneId === 'coffee' ? '选择咖啡店任务' : next.sceneId === 'interview' ? '选择面试练习' : '选择其他生活场景');
    }
    const label = document.querySelector('.live-label');
    if (label) { label.hidden = Boolean(chooseMission && !chooseMission.hidden); label.textContent = next.kind === 'resume' ? (next.sceneId === 'coffee' ? '任务已记住' : '进度已保存') : next.kind === 'review' ? '适合再试一次' : summary.todayCompletedSessions ? '新事件已出现' : '准备开始'; }
  }

  function startHome({ chooseMission = false, recommendation = null } = {}) {
    const next = recommendation || homeStep(window.LumaWorldRegions?.currentRegion());
    if (chooseMission && next.sceneId === 'interview') { previewScene('interview', next.missionId); return; }
    if (chooseMission && next.sceneId !== 'coffee') { adapter.chooseWorld?.(); return; }
    const saved = next.kind === 'resume' ? store.getCheckpoint({ sessionId: next.sessionId }) : null;
    const missionId = next.sceneId === 'coffee' ? (next.missionId || saved?.missionId || null) : next.missionId;
    const choosingCoffeeMission = chooseMission && next.sceneId === 'coffee';
    if (next.sceneId === 'coffee' && missionId) adapter.selectCoffeeMission?.(missionId);
    const reviewTaskIndex = next.kind === 'review' && !choosingCoffeeMission
      ? Math.max(0, (next.sceneId === 'interview' ? InterviewModule?.tasksFor(next.missionId).map(t => t.id) || [] : SCENE_TASKS[next.sceneId] || []).indexOf(next.taskId))
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
    if (next.sceneId === 'coffee' && next.missionId) adapter.selectCoffeeMission?.(next.missionId);
    adapter.start(next.sceneId || 'kitchen', { subtitlesHidden: false });
  }

  function startRecommendation(next = reviewPlan) {
    if (!next || !adapter) return;
    if (next.kind === 'resume') { startHome({ recommendation: next }); return; }
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

  function row(label, copy, icon = 'chat-circle') {
    const article = document.createElement('article'); article.className = 'evidence-row';
    const i = document.createElement('i'); i.className = `ph ph-${icon}`; i.setAttribute('aria-hidden', 'true');
    const body = document.createElement('div'), title = document.createElement('strong'), text = document.createElement('p');
    title.textContent = label; text.textContent = copy; body.append(title, text); article.append(i, body);
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
      const taskIndex = Math.max(0, (next.sceneId === 'interview' ? InterviewModule?.tasksFor(next.missionId).map(t => t.id) || [] : SCENE_TASKS[next.sceneId] || []).indexOf(next.taskId));
      if (next.sceneId === 'coffee' && next.missionId) adapter.selectCoffeeMission?.(next.missionId);
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
    // The learning tab stays a study space even when no review is due.
    // Browsing expressions must not start a life event or open the microphone.
    $('sceneDictionary')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  function renderLearningNotes(notes) {
    const { totals, profile, due, upcoming } = notes;
    const completed = profile.sessions.filter(session => session.completedAt);
    const successful = profile.attempts.filter(attempt => attempt.outcome === 'success');
    const next = due.length ? store.nextStep({ preferReview: true }) : null;
    const sceneId = next?.sceneId || upcoming[0]?.sceneId || 'coffee';
    const scene = SCENES[sceneId] || SCENES.coffee;
    const reviewTarget = due.find(item => (next?.targetIds || []).includes(item.targetId)) || due[0];
    const taskTitles = {
      'choose-drink': sceneId === 'coffee' ? '再点一杯喜欢的咖啡' : '再选一杯喜欢的饮料',
      'choose-size': '说清楚想要的杯型', 'choose-service': '告诉店员堂食还是带走',
      'thank-person': '接过咖啡，说声谢谢', 'offer-item': sceneId === 'kitchen' ? '回应她，把杯子递过去' : '把登机牌给工作人员',
      'adjust-amount': '说说还想不想再来一点', 'confirm-belonging': '确认自己的行李',
      'find-location': '问清楚要去的地方', 'state-purpose': '说清楚这次的来意',
      'give-name': '介绍一下自己的名字', 'receive-information': '听懂对方的安排',
      greet: '和新认识的人打个招呼',
    };
    write('notesReviewEyebrow', due.length ? '今天再用一次' : '按自己的节奏来');
    write('notesReviewCount', due.length ? `${due.length} 项待复习` : '');
    if ($('notesReviewCount')) $('notesReviewCount').hidden = !due.length;
    write('notesReviewScene', due.length ? scene.context : '情景词典');
    if ($('notesReviewImage')) $('notesReviewImage').src = scene.image;
    write('reviewOverviewTitle', due.length ? (taskTitles[reviewTarget?.targetId] || targetLabel(reviewTarget?.targetId)) : '今天没有待复习');
    write('reviewOverviewCopy', due.length ? '隔了一段时间，再试着自己说。需要时仍可打开提示。'
      : upcoming.length ? `下一次复习在 ${shortDate(upcoming[0].dueAt)}。先看看情景词典里的生活表达。`
      : '可以先看看情景词典，认识生活中用得上的表达。');
    setButtonLabel('startReview', due.length ? '开始复习' : '看看情景词典');
    write('notesHistorySummary', completed.length ? `已完成 ${completed.length} 次练习 · 查看记录` : '每一次开口，都留在这里');

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
    renderEvidenceHistory(profile);
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
          : session.sceneId === 'interview' ? InterviewModule?.getMission(session.missionId)?.title : null;
        const evidence = independentCount ? ` · ${independentCount} 次独立表达`
          : assistedCount ? ` · ${assistedCount} 次借助帮助`
          : '';
        $('learningHistory').append(row(missionTitle || SCENES[session.sceneId]?.label || '场景练习', `${date} · 完成${evidence}`, 'receipt'));
      }
      if (profile.legacySummaries?.length) $('learningHistory').append(row('以前的练习已保留', `${profile.legacySummaries.length} 条旧记录未区分提示，不计入独立能力`, 'clock-counter-clockwise'));
    }
    write('profileLearningCopy', totals.sessionCount ? `已开始 ${totals.sessionCount} 次练习，完成 ${totals.completedSessions} 段。按自己的节奏继续。` : '还没有练习记录。完成第一段生活场景，就从这里开始。');
    if (!totals.storageAvailable && !storageNoticeShown) { storageNoticeShown = true; adapter.notify('当前浏览器无法保存进度。这次仍能练习，关闭后可能无法恢复。', 5000); }
    window.LumaNavigation?.render({ profile, totals, life: lifeStore?.summary() || null, next: homeStep() });
  }

  function renderReview() {
    const sessionAttempts = store.getProfile().attempts.filter(a => a.sessionId === sessionId);
    const attempts = sessionAttempts.filter(a => a.outcome === 'success');
    const voice = attempts.filter(englishVoice), free = voice.filter(independent);
    write('reviewHeard', `${s().coveredGoals.size} 个${s().selectedScene === 'interview' ? '面试话题' : '生活步骤'}`);
    write('reviewActions', `${free.length} 次未看答案`);
    write('reviewSpoken', `${voice.length} 次英语开口`);
    if ($('reviewEvidenceList')) { $('reviewEvidenceList').replaceChildren(row(free.length ? `${free.length} 次，没有看答案也表达了意思` : '这次的合作已经完成', free.length ? '下次换个人或物品再试，看看能否继续独立表达。' : voice.length ? '这次借助了帮助。下一次试着少看一点提示。' : '这次还没有留下英语语音证据；下一次可以从一个英语词开始。', 'plant')); }
    // A recent transcript can still be unconfirmed; only accepted evidence is
    // eligible for the takeaway below. Avoid a second, unrelated quote card.
    if ($('reviewRecast')) $('reviewRecast').hidden = true;
    const takeaway = latestTakeaway(sessionAttempts);
    if (takeaway && $('reviewEvidenceList')) $('reviewEvidenceList').replaceChildren(takeawayCard(takeaway));
    if (window.LumaWorldLoop) {
      const profile = store.getProfile();
      reviewPlan = window.LumaWorldLoop.plan(profile, { checkpoint: store.getCheckpoint(),
        completedMissions: adapter?.coffeeJourney?.()?.completed || [] });
      const facts = window.LumaWorldLoop.summary(profile, { sessionId });
      if ($('reviewEvidenceList')) $('reviewEvidenceList').replaceChildren(takeaway
        ? takeawayCard(takeaway)
        : row('这次怎样完成的', facts.lines.join('；'), 'plant'));
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

  function latestTakeaway(attempts) {
    const latestByTarget = new Map();
    for (const attempt of [...attempts].filter(item => item.outcome !== 'technical-error' && Date.parse(item.at) <= Date.now()).sort(byEvidenceTime)) {
      latestByTarget.set(attempt.targetId, attempt);
    }
    return [...latestByTarget.values()].filter(item => englishVoice(item) && typeof item.utterance === 'string' && item.utterance.trim())
      .sort(byEvidenceTime).at(-1) || null;
  }

  function takeawayCard(attempt) {
    const card = document.createElement('article'); card.className = 'world-evidence-card learning-takeaway';
    const title = document.createElement('h3'); title.textContent = targetLabel(attempt.targetId);
    card.append(title);
    const quote = (label, text, className) => {
      const block = document.createElement('div'); block.className = `takeaway-quote ${className}`;
      const meta = document.createElement('small'), value = document.createElement('p');
      meta.textContent = label; value.textContent = text; block.append(meta, value); card.append(block);
    };
    if (typeof attempt.heardQuestion === 'string' && attempt.heardQuestion.trim()) quote('对方说', attempt.heardQuestion, 'takeaway-question');
    quote('你回应', attempt.utterance, 'takeaway-answer');
    const condition = document.createElement('p'); condition.className = 'world-evidence-note';
    condition.textContent = `${shortDate(attempt.at)} · ${evidenceCondition(attempt)}`;
    card.append(condition);
    return card;
  }

  function renderEvidenceHistory(profile) {
    const attempts = profile.attempts.filter(a => a.outcome !== 'technical-error' && Date.parse(a.at) <= Date.now()).sort(byEvidenceTime);
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

  function recordStudy(sceneId, taskId, kind = 'full-example') {
    if (!SCENE_TASKS[sceneId]?.includes(taskId) || !['keyword', 'full-example', 'meaning', 'replay'].includes(kind)) return null;
    const event = store.recordStudy({ sceneId, taskId, targetId: details(taskId)[0], kind });
    render();
    return event;
  }

  function syncHelpVisibility() {
    const visible = isHelpVisible();
    for (const id of ['helpButton', 'taskHelpToggle']) $(id)?.setAttribute('aria-expanded', String(visible));
    const hud = $('sceneTaskHud');
    if (hud && s()?.sceneStarted) hud.hidden = !visible && !['coffee', 'interview'].includes(s().selectedScene);
  }

  function isHelpVisible() { return Boolean($('learningHelpPanel') && !$('learningHelpPanel').hidden); }

  function closeHelp() {
    helpRequest?.abort(); helpRequest = null; helpRevision++;
    const wasReading = helpReading;
    helpReading = false;
    if ($('learningHelpPanel')) $('learningHelpPanel').hidden = true;
    syncHelpVisibility();
    if (wasReading) adapter?.resumeGuidance?.();
  }

  // Reading pauses nudges; speaking releases the pause while the sentence stays in view.
  function learnerTurnStarted() {
    if (!helpReading) return;
    helpReading = false;
    adapter?.resumeGuidance?.();
  }

  function questionChanged() { closeHelp(); }

  function toggleHelp() {
    if (isHelpVisible()) closeHelp(); else openHelp();
  }

  function helpContext() {
    const current = task();
    const question = s().activeQuestion || current.prompt;
    const authored = adapter.isTaskQuestion ? adapter.isTaskQuestion(question) : question === current.prompt;
    return { question, authored, support: adapter.support?.() || current.support };
  }

  // Exact text ranges let word lookup decorate a sentence without losing its sample details.
  function renderExampleText(element, text, highlights = []) {
    const value = String(text || '');
    const ranges = [];
    for (const phrase of Array.isArray(highlights) ? highlights : []) {
      if (typeof phrase !== 'string' || !phrase) continue;
      let start = value.indexOf(phrase);
      while (start !== -1) {
        ranges.push({ start, end: start + phrase.length });
        start = value.indexOf(phrase, start + phrase.length);
      }
    }
    ranges.sort((a, b) => a.start - b.start || a.end - b.end);
    const merged = [];
    for (const range of ranges) {
      const last = merged[merged.length - 1];
      if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
      else merged.push({ ...range });
    }
    element.dataset.helpReplacements = JSON.stringify(merged);
    element.replaceChildren();
    let cursor = 0;
    for (const { start, end } of merged) {
      element.append(document.createTextNode(value.slice(cursor, start)));
      const span = document.createElement('span'); span.className = 'help-replaceable';
      span.textContent = value.slice(start, end); element.append(span); cursor = end;
    }
    element.append(document.createTextNode(value.slice(cursor)));
    return element;
  }

  function renderAnswerScaffold(support, { loading = false, failed = false, showExample = false } = {}) {
    const content = $('learningHelpContent'); content.replaceChildren();
    const scroll = $('learningHelpPanel').querySelector('.learning-help-scroll');
    if (scroll) scroll.scrollTop = 0;
    const paragraph = (text, className, highlights = []) => {
      const element = document.createElement('p'); element.className = className;
      return renderExampleText(element, text, highlights);
    };
    const question = s().activeQuestion || task().prompt;
    if (loading || failed) {
      content.append(paragraph(question, 'help-current-question'));
      const status = paragraph(loading ? '正在梳理这句追问，先不用急着回答。' : '这句追问的提示暂时没接上，可以先用中文说想法。', 'help-request-status');
      status.setAttribute('role', 'status'); content.append(status);
    } else {
      noteHelp(1, 'meaning');
    }
    content.append(paragraph('先说一句', 'help-section-label'));
    const starter = paragraph(support.answerStarter, 'help-answer-starter', support.answerStarterHighlights); starter.id = 'helpAnswerStarter';
    content.append(starter);
    if (!loading && !failed) content.append(paragraph(support.meaning, 'help-question-meaning'));
    noteHelp(2, 'keyword');
    if (support.answerPlan?.length) {
      const plan = document.createElement('ol'); plan.className = 'help-answer-plan';
      for (const point of support.answerPlan) {
        const item = document.createElement('li'); item.textContent = point; plan.append(item);
      }
      const details = document.createElement('details'); details.dataset.helpPlan = '';
      const summary = document.createElement('summary'); summary.textContent = '展开回答思路';
      details.append(summary, plan); content.append(details);
    }
    if (!loading && !failed) content.append(paragraph('示例可直接跟读，紫色部分可换成你的情况。', 'help-answer-note'));
    if (support.model) {
      const reveal = document.createElement('button'); reveal.type = 'button'; reveal.dataset.helpExample = '';
      reveal.className = 'help-example-toggle'; reveal.textContent = '展开完整示例'; reveal.setAttribute('aria-expanded', 'false');
      reveal.setAttribute('aria-controls', 'helpAnswerExample');
      const example = document.createElement('div'); example.id = 'helpAnswerExample'; example.hidden = true;
      reveal.addEventListener('click', () => {
        example.hidden = !example.hidden; reveal.setAttribute('aria-expanded', String(!example.hidden));
        reveal.textContent = example.hidden ? '展开完整示例' : '收起完整示例';
        if (!example.hidden) {
          noteHelp(3, 'example');
          example.replaceChildren(paragraph(support.model, 'help-model-text', support.modelHighlights));
          const play = document.createElement('button'); play.type = 'button'; play.className = 'help-example-play'; play.textContent = '听一遍示例';
          play.addEventListener('click', () => adapter.speak(support.model, { prompt: false })); example.append(play);
        }
      });
      content.append(reveal, example);
      if (showExample) {
        reveal.click();
        if (scroll) scroll.scrollTop += example.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
      }
    }
    if (failed) {
      const retry = document.createElement('button'); retry.type = 'button'; retry.dataset.helpRetry = '';
      retry.textContent = '重新获取这句提示'; retry.addEventListener('click', () => openHelp()); content.append(retry);
    }
  }

  async function loadConversationScaffold(context, { showExample = false } = {}) {
    const revision = helpRevision, session = s().practiceSession, taskId = task().id;
    const controller = new AbortController(); helpRequest = controller;
    const fallback = { answerStarter: 'Let me think for a moment.', answerPlan: ['先想你最想表达的一点', '用中文或熟悉的英文词说出来'] };
    renderAnswerScaffold(fallback, { loading: true });
    const timeout = setTimeout(() => controller.abort(), 8000);
    const current = () => revision === helpRevision && !$('learningHelpPanel').hidden
      && s().sceneStarted && s().practiceSession === session && task().id === taskId
      && (s().activeQuestion || task().prompt) === context.question;
    try {
      const history = (s().dialogueHistory || []).filter(message => message.speaker === 'luma' || message.final)
        .slice(-12).map(message => ({ role: message.speaker === 'user' ? 'user' : 'assistant', text: String(message.text || '').slice(0, 1200) }));
      const response = await fetch('/api/conversation-help', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneId: s().selectedScene, taskId, question: context.question.slice(0, 1200), history }), signal: controller.signal });
      if (!response.ok) throw new Error('help-unavailable');
      const support = await response.json();
      if (!support.meaning || !support.answerStarter || !Array.isArray(support.answerPlan)) throw new Error('help-unavailable');
      if (current()) renderAnswerScaffold(support, { showExample });
    } catch {
      if (current()) renderAnswerScaffold(fallback, { failed: true });
    } finally {
      clearTimeout(timeout); if (helpRequest === controller) helpRequest = null;
    }
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
    const panel = $('learningHelpPanel'); if (!panel) return;
    if (panel.hidden) helpTrigger = document.activeElement;
    helpReading = true;
    adapter.pauseGuidance?.();
    panel.hidden = false;
    syncHelpVisibility();
    helpRequest?.abort(); helpRequest = null; helpRevision++;
    const scroll = panel.querySelector('.learning-help-scroll'); if (scroll) scroll.scrollTop = 0;
    const context = helpContext();
    const scaffold = (['menu', 'keyword', 'example'].includes(kind) && context.support?.responseMode === 'structured')
      || (!context.authored && ['menu', 'meaning', 'keyword', 'example'].includes(kind));
    panel.dataset.mode = scaffold ? 'scaffold' : 'menu';
    const topic = task().progressLabel || task().label || details(task().id)[1];
    write('learningHelpTitle', `${topic} · ${context.authored ? '开口提示' : '当前追问'}`);
    const activeKind = kind === 'menu' ? 'keyword' : kind;
    for (const button of panel.querySelectorAll('.learning-help-options button')) {
      button.setAttribute('aria-pressed', String(button.dataset.learningHelp === activeKind));
    }
    if (scaffold) {
      if (context.authored) renderAnswerScaffold(context.support, { showExample: kind === 'example' });
      else loadConversationScaffold(context, { showExample: kind === 'example' });
      return;
    }
    const content = $('learningHelpContent'); content.replaceChildren();
    const item = contextualDetails(task().id);
    if (kind === 'meaning') {
      noteHelp(1, 'meaning');
      const meaning = document.createElement('p'); meaning.className = 'help-meaning'; meaning.textContent = item[2];
      content.append(meaning);
    }
    else if (['menu', 'keyword'].includes(kind)) {
      const words = {
        'choose-drink': s().selectedScene === 'coffee' ? 'latte · 拿铁 / americano · 美式' : 'milk · 牛奶 / water · 水',
        'choose-size': 'small · 小杯 / large · 大杯', 'choose-service': 'for here · 堂食 / to go · 带走',
        'thank-person': 'thank · 感谢', 'offer-item': 'here · 给你', 'adjust-amount': 'more · 再来 / enough · 够了',
        'confirm-belonging': 'mine · 我的', 'find-location': 'A12 · 登机口',
      };
      const starters = {
        'state-purpose': ['I’m here to see Maya.', 'Maya'],
        'give-name': ['My name is Li.', 'Li'],
      };
      const interviewTask = s().selectedScene === 'interview' ? InterviewModule?.taskById(task().id) : null;
      const keywords = interviewTask?.keywords;
      noteHelp(2, 'keyword');
      if (starters[item[0]]) {
        const [text, name] = starters[item[0]];
        const entry = row(text, '示例可直接跟读，紫色部分可换成你的情况。', 'key');
        renderExampleText(entry.querySelector('strong'), text, [name]); content.append(entry);
      }
      else content.append(row(interviewTask ? '先抓住表达重点' : '先用一个词试试',
        (Array.isArray(keywords) ? keywords.join(' · ') : keywords) || words[item[0]] || item[3].split(' ').slice(0, 2).join(' '), 'key'));
    }
    else if (kind === 'example') {
      noteHelp(3, 'example');
      const entry = row(item[3], item[4], 'chat-circle');
      const highlights = context.support?.modelHighlights || ({ 'office-purpose': ['Maya'], 'office-signin': ['Li'] })[task().id];
      renderExampleText(entry.querySelector('strong'), item[3], highlights); content.append(entry);
      if ((s().coffeeMissionId || s().coffee?.missionId) === 'C04')
        adapter.notify?.('已使用示范；这次仍可完成，复盘会如实记为借助帮助。', 4200);
      const play = document.createElement('button'); play.type = 'button'; play.className = 'help-example-play'; play.textContent = '听一遍示范';
      play.addEventListener('click', () => adapter.speak(item[3], { prompt: false })); content.append(play);
    } else if (kind === 'replay') { noteHelp(1, 'replay'); adapter.speak(s().activeQuestion || task().prompt); content.append(row('再听一遍', '先听关键意思，不需要每个词都懂。', 'speaker-high')); }
    else content.append(row('卡住也没关系', '选择需要的帮助，之后继续刚才的小事。', 'leaf'));
  }

  function bind(value) {
    adapter = value;
    $('taskHelpToggle')?.addEventListener('click', toggleHelp);
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

  window.LumaExperience = { resetIntroduction, noteCharacterLine, currentSession: () => sessionId, bind, store, lifeStore,
    currentReward: () => lastReward, homeStep, previewScene, recordStudy, renderExampleText,
    isHelpOpen: () => helpReading, isHelpVisible, learnerTurnStarted, toggleHelp,
    catalog: { TASKS, SCENE_TASKS, SCENES }, TASKS, SCENE_TASKS, SCENES,
    begin, supportLevel, noteExposure, noteHelp, noteAnswer, noteAction, checkpoint, complete, taskStarted, render, renderHome, renderReview, startHome, startReviewPractice, startTransfer, startRecommendation, closeHelp, openHelp, questionChanged };
})();

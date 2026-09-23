/* A small authored world loop. Recommendations never lock a scene or infer mastery. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports)
    module.exports = factory(require('./learning-evidence'), require('./coffee'));
  else root.LumaWorldLoop = factory(root.LumaLearning, typeof Coffee === 'undefined' ? null : Coffee);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Learning, Coffee) {
  'use strict';

  const SCENES = ['coffee', 'kitchen', 'airport', 'office'];
  const MISSIONS = ['C01', 'C02', 'C03', 'C04'];
  const HELP = { subtitles: '字幕', 'transcript-history': '完整对话', meaning: '中文解释',
    replay: '重听', keyword: '关键词', 'sentence-stem': '英文半句', 'full-example': '完整示范' };
  const TARGETS = {
    'choose-drink': ['表达饮料选择', '说出你想喝什么。', '饮品名 + please'],
    'choose-size': ['说明杯型', '告诉对方你要小杯还是大杯。', 'small / large'],
    'choose-service': ['说明堂食或带走', '告诉对方你在哪里喝。', 'for here / to go'],
    'thank-person': ['回应并道谢', '收到咖啡后，向对方说声谢谢。', 'thank you'],
    'offer-item': ['回应物品请求', '递东西时，开口回应对方。', 'here you are'],
    'adjust-amount': ['说明还要不要', '告诉对方再来一点，还是已经够了。', 'more / enough'],
  };
  const time = value => value instanceof Date ? value.getTime()
    : typeof value === 'number' ? value : Date.parse(value);
  const mode = value => value === 'listening' ? 'listening' : 'guided';
  const order = (a, b) => String(a.completedAt || a.at || a.startedAt || '').localeCompare(String(b.completedAt || b.at || b.startedAt || ''))
    || String(a.id || '').localeCompare(String(b.id || ''));

  function snapshot(profile, now) {
    const clock = Number.isFinite(time(now)) ? time(now) : Date.now();
    // Reuse the evidence store's validation and condition derivation rather than
    // trusting cached independent/assisted flags or inventing another schema.
    let serialized = '{}';
    try { serialized = JSON.stringify(profile || {}); } catch { /* An invalid backup is not learning evidence. */ }
    const store = Learning.createStore({ getItem: key => key === Learning.STORAGE_KEY ? serialized : null }, { now: () => clock });
    const safe = store.getProfile();
    const occurred = value => Number.isFinite(time(value)) && time(value) <= clock;
    // Future-dated records must not advance today's story after a clock change.
    safe.sessions = safe.sessions.filter(item => occurred(item.startedAt)).map(item => ({
      ...item, completedAt: occurred(item.completedAt) ? item.completedAt : null,
    }));
    const ids = new Set(safe.sessions.map(item => item.id));
    safe.attempts = safe.attempts.filter(item => ids.has(item.sessionId) && occurred(item.at));
    safe.exposures = safe.exposures.filter(item => ids.has(item.sessionId) && occurred(item.at));
    const normalized = JSON.stringify(safe);
    const filteredStore = Learning.createStore({ getItem: key => key === Learning.STORAGE_KEY ? normalized : null }, { now: () => clock });
    return { profile: filteredStore.getProfile(), store: filteredStore, now: clock };
  }

  function missionMetadata(sceneId, source = {}) {
    if (sceneId !== 'coffee') return { missionId: null, variantId: null };
    const missionId = MISSIONS.includes(source.missionId) ? source.missionId : 'C01';
    const mission = Coffee?.getMission(missionId);
    const variantId = mission?.variants.find(item => item.id === source.variantId)?.id || mission?.defaultVariantId || null;
    return { missionId, variantId };
  }

  function suggestion(kind, sceneId, source, copy, extra = {}) {
    const practiceMode = mode(source?.mode || source?.practiceMode);
    return { kind, sceneId, ...missionMetadata(sceneId, source), mode: practiceMode, practiceMode,
      optional: true, available: true, targetIds: [], ...copy, ...extra };
  }

  function experience(sceneId, source = {}) {
    if (sceneId !== 'coffee') return {
      kitchen: { title: '一起准备早餐，喝点什么？', reason: '牛奶和水已经摆好，和 Luma 聊聊这个早晨。' },
      airport: { title: '到了机场，先找工作人员', reason: '准备好登机牌，聊聊行李和登机口。' },
      office: { title: '第一次来，和新同事打个招呼', reason: '告诉前台你来找谁，再和 Maya 认识一下。' },
    }[sceneId] || { title: '接着上次的故事', reason: '按自己的节奏，继续这段经历。' };
    const meta = missionMetadata('coffee', source);
    const mission = Coffee?.getMission(meta.missionId);
    const variant = mission?.variants.find(item => item.id === meta.variantId);
    if (meta.missionId === 'C03') {
      const original = variant?.initialOrder;
      const cup = original?.size === 'large' ? '大杯' : '小杯';
      const drink = original?.drink === 'americano' ? '美式' : '拿铁';
      const service = original?.service === 'here' ? '在店里喝' : '带走';
      return { title: '拿到的咖啡，好像不太对',
        reason: `你原本点了${cup}${drink}，${service}。可以换杯，也可以留下这杯。` };
    }
    return {
      C01: { title: '推开门，给自己点一杯', reason: '和 Mia 打声招呼，点杯喜欢的咖啡。' },
      C02: { title: '朋友托你带一杯咖啡', reason: '朋友想要小杯拿铁带走。有变化，直接告诉 Mia 就好。' },
      C04: { title: '今天，想喝哪一杯？', reason: '先听听 Mia 怎么说。想看字幕，随时打开。' },
    }[meta.missionId];
  }

  function transfer() {
    return suggestion('transfer', 'kitchen', {}, {
      title: '回到家，一起准备早餐',
      reason: '牛奶和水已经摆好，和 Luma 聊聊这个早晨。',
      actionLabel: '去准备早餐',
    }, { targetIds: ['choose-drink'] });
  }

  function plan(input, options = {}) {
    const { profile, store, now } = snapshot(input, options.now);
    const checkpoint = Object.hasOwn(options, 'checkpoint') ? options.checkpoint : profile.checkpoint;
    if (checkpoint && SCENES.includes(checkpoint.sceneId)) return suggestion('resume', checkpoint.sceneId, checkpoint, {
      ...experience(checkpoint.sceneId, checkpoint), actionLabel: '继续这件事',
    }, { sessionId: checkpoint.sessionId || null, taskIndex: 0 });

    const due = store.getReviewQueue().filter(item => time(item.dueAt) <= now && SCENES.includes(item.lastSceneId))
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.targetId.localeCompare(b.targetId));
    if (due.length) {
      const first = due[0];
      return suggestion('review', first.lastSceneId, { missionId: first.lastMissionId, variantId: first.lastVariantId }, {
        ...experience(first.lastSceneId, { missionId: first.lastMissionId, variantId: first.lastVariantId }),
        actionLabel: '再去一趟',
      }, { dueAt: first.dueAt, taskId: first.lastTaskId, targetIds: [first.targetId],
        reviewItems: due.map(item => ({ targetId: item.targetId, sceneId: item.lastSceneId, taskId: item.lastTaskId,
          missionId: item.lastMissionId, variantId: item.lastVariantId, dueAt: item.dueAt })) });
    }

    const completed = profile.sessions.filter(item => item.completedAt && ['coffee', 'kitchen'].includes(item.sceneId)).sort(order);
    const latest = completed.at(-1);
    if (!latest) {
      const recorded = (Array.isArray(options.completedMissions) ? options.completedMissions : []).filter(id => MISSIONS.includes(id));
      return suggestion('start', 'coffee', { missionId: recorded.at(-1) || 'C01' }, {
        title: recorded.length ? '再去咖啡店点一杯' : '推开门，给自己点一杯',
        reason: recorded.length ? '之前的经历都保留着。和 Mia 打声招呼，看看今天想喝什么。' : '和 Mia 打个招呼，点一杯喜欢的咖啡。一个词也可以开始。',
        actionLabel: '进去点一杯',
      });
    }

    if (latest.sceneId === 'kitchen') {
      const cafe = completed.filter(item => item.sceneId === 'coffee').at(-1);
      const tomorrow = new Date(latest.completedAt);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      return suggestion('return', 'coffee', { ...cafe, mode: 'guided' }, {
        title: '下次出门，再点一杯',
        reason: '早餐告一段落。建议明天回咖啡店再试试；现在想练，也可以直接开始。', actionLabel: '现在再点一杯',
      }, { dueAt: tomorrow.toISOString(), targetIds: ['choose-drink'] });
    }

    const successes = profile.attempts.filter(item => item.sessionId === latest.id && item.outcome === 'success');
    const independentChoice = successes.some(item => item.targetId === 'choose-drink' && item.productionCondition === 'independent');
    const knownProduction = successes.some(item => ['independent', 'assisted'].includes(item.productionCondition));
    const repairStory = latest.missionId === 'C03' ? experience('coffee', latest) : null;
    if (!knownProduction) return suggestion('retry', 'coffee', { ...latest, mode: 'guided' }, {
      title: '再去咖啡店坐一会儿',
      reason: '和 Mia 聊聊，点杯想喝的。需要帮助时随时查看，也可以回家准备早餐。',
      ...repairStory,
      actionLabel: '再去一趟',
    }, { targetIds: [...new Set(successes.map(item => item.targetId))], alternative: transfer() });
    // A supported retry is still a completed experience. It must never trap the
    // learner in an endless test, and a transfer remains optional at every point.
    if (independentChoice || latest.mode === 'listening') return transfer();
    const usedHelp = successes.some(item => item.productionCondition === 'assisted' || item.listeningCondition === 'assisted');
    return suggestion('retry', 'coffee', { ...latest, mode: 'listening' }, {
      title: '今天，再去见见 Mia',
      reason: usedHelp ? '刚才借助了字幕或提示。这次先听着回应，想看时可以随时打开；也可以去准备早餐。'
        : '这次可以先听着回应，想看时可以随时打开字幕；也可以去准备早餐。',
      ...repairStory,
      actionLabel: '先听着试一次',
    }, { targetIds: [...new Set(successes.map(item => item.targetId))], alternative: transfer() });
  }

  function summary(input, options = {}) {
    const { profile } = snapshot(input, options.now);
    const attempts = profile.attempts.filter(item => !options.sessionId || item.sessionId === options.sessionId);
    const success = attempts.filter(item => item.outcome === 'success');
    const count = key => success.filter(item => item[key] === 'independent').length;
    const independentProductionCount = count('productionCondition');
    const independentListeningCount = count('listeningCondition');
    const helpKinds = [...new Set(success.flatMap(item => item.exposureKinds || []))].filter(kind => HELP[kind]);
    const lines = [];
    if (independentProductionCount) lines.push(`${independentProductionCount} 次英语回应未使用答案提示`);
    if (independentListeningCount) lines.push(`${independentListeningCount} 次回应发生在无字幕、无重听的条件下`);
    if (helpKinds.length) lines.push(`这次用过${helpKinds.map(kind => HELP[kind]).join('、')}`);
    if (!lines.length) lines.push(success.length ? '已完成交流；独立表达的条件尚未确认' : '还没有可用于判断表达能力的记录');
    return { successCount: success.length, independentProductionCount, independentListeningCount,
      assistedProductionCount: success.filter(item => item.productionCondition === 'assisted').length,
      unknownProductionCount: success.filter(item => item.productionCondition === 'unknown').length,
      technicalErrorCount: attempts.filter(item => item.outcome === 'technical-error').length,
      helpKinds, lines, scope: options.sessionId ? 'session' : 'recorded-history' };
  }

  function focus(input, options = {}) {
    const { profile } = snapshot(input, options.now);
    const completed = profile.sessions.filter(item => item.completedAt).sort(order);
    const sessionId = options.sessionId || completed.at(-1)?.id;
    if (!sessionId) return null;
    const candidates = profile.attempts.filter(item => item.sessionId === sessionId && item.outcome === 'success' && TARGETS[item.targetId])
      .map(item => ({ item, helps: (item.exposureKinds || []).filter(kind => HELP[kind]),
        score: Math.max(item.supportLevel || 0, (item.exposureKinds || []).includes('full-example') ? 3
          : (item.exposureKinds || []).some(kind => ['keyword', 'sentence-stem'].includes(kind)) ? 2
            : (item.exposureKinds || []).some(kind => HELP[kind]) ? 1 : 0) }))
      .filter(candidate => candidate.score > 0).sort((a, b) => b.score - a.score || order(b.item, a.item));
    const selected = candidates[0];
    if (!selected) return null;
    const { item, helps } = selected;
    const [label, meaning, keyword] = TARGETS[item.targetId];
    const meta = missionMetadata(item.sceneId, item);
    const mission = Coffee?.getMission(meta.missionId);
    const target = mission?.variants.find(variant => variant.id === meta.variantId)?.target;
    const drink = item.sceneId === 'kitchen' ? 'Milk' : target?.drink === 'americano' ? 'An americano' : 'A latte';
    const example = {
      'choose-drink': `${drink}, please.`,
      'choose-size': meta.missionId === 'C03' ? 'Sorry, I ordered a small.' : target?.size === 'large' ? 'Large, please.' : 'Small, please.',
      'choose-service': target?.service === 'here' ? 'For here, please.' : 'To go, please.',
      'thank-person': 'Thank you.', 'offer-item': 'Here you are.', 'adjust-amount': 'A little more, please.',
    }[item.targetId];
    return { targetId: item.targetId, taskId: item.taskId, sceneId: item.sceneId, ...meta, optional: true,
      title: `再熟悉一下：${label}`,
      reason: helps.length ? `刚才这里用过${helps.map(kind => HELP[kind]).join('、')}，可以花一点时间再熟悉一下。` : '刚才这里用过提示，可以再熟悉一下。',
      meaning, keyword, example, prompt: '先想想自己会怎么说。需要时再看示范，然后回到场景里试试。',
      actionLabel: '去场景里试试' };
  }

  return { plan, summary, focus };
});

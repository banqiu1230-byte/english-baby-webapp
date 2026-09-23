/* Local evidence records observations and conditions; it never infers mastery. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LumaLearning = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'luma-evidence-v1';
  const EVIDENCE_VERSION = 2;
  // Product defaults for the review queue, not a universal retention interval.
  const REVIEW_INTERVAL_DAYS = [1, 3, 7];
  const sources = ['voice', 'text', 'tap', 'drag'];
  const languages = ['en', 'zh', 'mixed', 'unknown'];
  const outcomes = ['success', 'unconfirmed', 'technical-error'];
  const challengeTypes = ['guided', 'independent', 'transfer', 'retention', 'unknown'];
  const promptModalities = ['audio', 'text', 'audio-text', 'visual', 'none', 'unknown'];
  const dimensions = ['production', 'listening'];
  const copy = value => JSON.parse(JSON.stringify(value));
  const identifier = value => typeof value === 'string' && value.trim() ? value.trim() : null;
  const optionalBoolean = value => typeof value === 'boolean' ? value : null;
  const enumValue = (values, value, fallback = 'unknown') => values.includes(value) ? value : fallback;
  const timestamp = value => {
    if (value === undefined || value === null || value === '') return null;
    if (!(value instanceof Date) && typeof value !== 'number' && typeof value !== 'string') return null;
    const ms = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
    const date = new Date(ms);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  };
  const day = value => {
    const date = new Date(value);
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  };
  const afterDays = (value, days) => {
    const date = new Date(value);
    date.setDate(date.getDate() + days);
    date.setHours(0, 0, 0, 0);
    return date.toISOString();
  };

  function exposureDefaults(kind, revealed) {
    const listeningKinds = ['subtitles', 'transcript-history', 'meaning', 'replay'];
    const productionKinds = ['keyword', 'full-example'];
    const revealsTargetAnswer = revealed ?? productionKinds.includes(kind);
    return {
      revealsTargetAnswer,
      affectsListening: listeningKinds.includes(kind),
      affectsProduction: productionKinds.includes(kind) || revealsTargetAnswer,
    };
  }

  function cleanSession(input) {
    if (!input || typeof input !== 'object') return null;
    const id = identifier(input.id), sceneId = identifier(input.sceneId), startedAt = timestamp(input.startedAt);
    if (!id || !sceneId || !startedAt) return null;
    return {
      id, sceneId, mode: identifier(input.mode) || 'guided',
      missionId: identifier(input.missionId), variantId: identifier(input.variantId),
      challengeType: enumValue(challengeTypes, input.challengeType),
      promptModality: enumValue(promptModalities, input.promptModality),
      startedAt, completedAt: timestamp(input.completedAt),
    };
  }

  function cleanExposure(input, sessions, fallbackAt) {
    if (!input || typeof input !== 'object') return null;
    const id = identifier(input.id), sessionId = identifier(input.sessionId);
    const sceneId = identifier(input.sceneId), taskId = identifier(input.taskId), kind = identifier(input.kind);
    const session = sessions.find(item => item.id === sessionId && item.sceneId === sceneId);
    if (!id || !session || !taskId || !kind) return null;
    const defaults = exposureDefaults(kind, optionalBoolean(input.revealsTargetAnswer));
    const affectsListening = optionalBoolean(input.affectsListening) ?? defaults.affectsListening;
    const affectsProduction = optionalBoolean(input.affectsProduction) ?? defaults.affectsProduction;
    return {
      id, sessionId, sceneId, taskId, targetId: identifier(input.targetId),
      missionId: identifier(input.missionId) || session.missionId,
      variantId: identifier(input.variantId) || session.variantId,
      kind, revealsTargetAnswer: defaults.revealsTargetAnswer,
      affectsListening, affectsProduction,
      relearning: optionalBoolean(input.relearning) ?? Boolean(affectsListening || affectsProduction),
      at: timestamp(input.at) || fallbackAt,
    };
  }

  function cleanRetentionCheck(input) {
    if (!input || typeof input !== 'object') return null;
    const priorAttemptId = identifier(input.priorAttemptId);
    const minimumElapsedMs = Number.isFinite(input.minimumElapsedMs) && input.minimumElapsedMs > 0
      ? input.minimumElapsedMs : null;
    const dimension = dimensions.includes(input.dimension) ? input.dimension : null;
    return priorAttemptId && minimumElapsedMs && dimension
      ? { priorAttemptId, minimumElapsedMs, dimension }
      : null;
  }

  function matchingExposures(attempt, exposures) {
    const ids = new Set(attempt.exposureIds || []);
    return exposures.filter(event => ids.has(event.id));
  }

  function productionCondition(attempt, exposures) {
    if (attempt.outcome !== 'success') return 'not-assessed';
    if (attempt.source !== 'voice' || attempt.language !== 'en') return attempt.source === 'text' ? 'text' : 'not-oral';
    if (attempt.conditionsTracked !== true) return 'unknown';
    const events = matchingExposures(attempt, exposures);
    if (events.some(event => event.affectsProduction === true)) return 'assisted';
    if (events.some(event => event.affectsProduction === null) || attempt.supportLevel === null) return 'unknown';
    // A positive legacy support level without a specific event cannot be safely
    // interpreted as listening-only support.
    if (attempt.supportLevel > 0 && events.length === 0) return 'assisted';
    return 'independent';
  }

  function listeningCondition(attempt, exposures) {
    if (attempt.outcome !== 'success') return 'not-assessed';
    if (attempt.conditionsTracked !== true) return 'unknown';
    if (attempt.promptModality === 'unknown') return 'unknown';
    if (!['audio', 'audio-text'].includes(attempt.promptModality)) return 'not-assessed';
    const events = matchingExposures(attempt, exposures);
    if (events.some(event => event.affectsListening === true)) return 'assisted';
    if (events.some(event => event.affectsListening === null)) return 'unknown';
    return attempt.promptModality === 'audio' ? 'independent' : 'assisted';
  }

  function withConditions(attempt, exposures) {
    const events = matchingExposures(attempt, exposures);
    return {
      ...attempt,
      exposureKinds: [...new Set(events.map(event => event.kind))],
      exposureEvents: events.map(event => ({
        id: event.id, kind: event.kind, revealsTargetAnswer: event.revealsTargetAnswer,
        affectsListening: event.affectsListening, affectsProduction: event.affectsProduction,
        relearning: event.relearning, at: event.at,
      })),
      productionCondition: productionCondition(attempt, exposures),
      listeningCondition: listeningCondition(attempt, exposures),
    };
  }

  const independentProduction = attempt => attempt.productionCondition === 'independent';
  const independentListening = attempt => attempt.listeningCondition === 'independent';

  // Quotes are optional evidence from a captured turn, never reconstructed
  // from a task template. Keep older records usable without inventing quotes.
  const capturedText = value => typeof value === 'string'
    ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, 500) || null
    : null;

  function cleanAttempt(input, sessions, exposures, fallbackAt) {
    if (!input || typeof input !== 'object') return null;
    const id = identifier(input.id), sessionId = identifier(input.sessionId);
    const sceneId = identifier(input.sceneId), taskId = identifier(input.taskId);
    const targetId = identifier(input.targetId);
    const session = sessions.find(item => item.id === sessionId && item.sceneId === sceneId);
    if (!id || !session || !taskId || !targetId || !sources.includes(input.source) || !outcomes.includes(input.outcome)) return null;
    const exposureIds = [...new Set((Array.isArray(input.exposureIds) ? input.exposureIds : [])
      .map(identifier).filter(Boolean))].filter(exposureId => exposures.some(event => event.id === exposureId
        && event.sessionId === sessionId && event.sceneId === sceneId && event.taskId === taskId
        && (!event.targetId || event.targetId === targetId)));
    const attempt = {
      id, sessionId, sceneId, taskId, targetId,
      missionId: identifier(input.missionId) || session.missionId,
      variantId: identifier(input.variantId) || session.variantId,
      challengeType: enumValue(challengeTypes, input.challengeType, session.challengeType),
      promptModality: enumValue(promptModalities, input.promptModality, session.promptModality),
      source: input.source,
      language: enumValue(languages, input.language),
      utterance: input.source === 'voice' ? capturedText(input.utterance) : null,
      heardQuestion: input.source === 'voice' ? capturedText(input.heardQuestion) : null,
      // Zero is a caller attestation that support was tracked throughout the task.
      // Missing or invalid support must never become independent evidence.
      supportLevel: [0, 1, 2, 3].includes(input.supportLevel) ? input.supportLevel : null,
      conditionsTracked: input.conditionsTracked === true ? true : input.conditionsTracked === false ? false : null,
      exposureIds,
      retentionCheck: cleanRetentionCheck(input.retentionCheck),
      outcome: input.outcome, at: timestamp(input.at) || fallbackAt,
    };
    return withConditions(attempt, exposures);
  }

  function cleanCheckpoint(input, sessions, fallbackAt) {
    if (!input || typeof input !== 'object') return null;
    const session = sessions.find(item => item.id === input.sessionId && item.sceneId === input.sceneId && !item.completedAt);
    if (!session || !Number.isInteger(input.taskIndex) || input.taskIndex < 0) return null;
    if (['coffee', 'kitchen'].includes(session.sceneId)) {
      // A café mission is the recovery unit. Older checkpoints may contain a
      // partly completed order; keep its mission and variant, but restart its
      // dialogue from the first question on the next visit.
      const missionIds = ['C01', 'C02', 'C03', 'C04'];
      const missionId = [input.missionId, input.coffee?.missionId, session.missionId]
        .map(identifier).find(id => missionIds.includes(id)) || 'C01';
      return {
        sessionId: session.id, sceneId: session.sceneId, taskIndex: 0,
        practiceMode: identifier(input.practiceMode) || session.mode,
        missionId: session.sceneId === 'coffee' ? missionId : null,
        variantId: session.sceneId === 'coffee' ? (identifier(input.variantId) || identifier(input.coffee?.variantId) || session.variantId) : null,
        at: timestamp(input.at) || fallbackAt,
      };
    }
    const world = input.breakfast || {};
    const drink = ['milk', 'water'].includes(world.drink) ? world.drink : null;
    const cupPlaced = Boolean(drink && world.cupPlaced === true);
    let coffee;
    if (input.coffee && typeof input.coffee === 'object' && !Array.isArray(input.coffee)) {
      const order = input.coffee;
      const missionId = ['C01', 'C02', 'C03', 'C04'].includes(order.missionId || input.missionId)
        ? (order.missionId || input.missionId) : null;
      const coffeeDrink = ['latte', 'americano'].includes(order.drink) ? order.drink : null;
      const size = ['small', 'large'].includes(order.size) ? order.size : null;
      const service = ['here', 'to-go'].includes(order.service) ? order.service : null;
      if (missionId) {
        coffee = {
          schemaVersion: 1, missionId,
          variantId: identifier(order.variantId || input.variantId),
          drink: coffeeDrink, size, service,
          received: Boolean(order.received === true),
          repair: { resolved: Boolean(order.repair?.resolved === true) },
          revision: Number.isSafeInteger(order.revision) && order.revision >= 0 ? order.revision : 0,
          appliedEventIds: [...new Set((Array.isArray(order.appliedEventIds) ? order.appliedEventIds : []).map(identifier).filter(Boolean))],
        };
      } else coffee = {
        drink: coffeeDrink,
        size: coffeeDrink && size ? size : null,
        service: coffeeDrink && size && service ? service : null,
        received: Boolean(coffeeDrink && size && service && order.received === true),
      };
    }
    let goalRecords = {};
    try {
      if (input.goalRecords && typeof input.goalRecords === 'object' && !Array.isArray(input.goalRecords))
        goalRecords = copy(input.goalRecords);
    } catch { /* A non-serializable UI field must not interrupt learning. */ }
    return { sessionId: session.id, sceneId: session.sceneId, taskIndex: input.taskIndex,
      practiceMode: identifier(input.practiceMode) || session.mode,
      missionId: identifier(input.missionId) || session.missionId,
      variantId: identifier(input.variantId) || session.variantId,
      breakfast: { drink, cupPlaced, amount: cupPlaced && ['more', 'enough'].includes(world.amount) ? world.amount : null },
      ...(coffee ? { coffee } : {}),
      coveredGoals: [...new Set((Array.isArray(input.coveredGoals) ? input.coveredGoals : []).map(identifier).filter(Boolean))],
      goalRecords, at: timestamp(input.at) || fallbackAt };
  }

  function legacyRows(rows, sourceKey) {
    if (!Array.isArray(rows)) return [];
    return rows.filter(row => row && typeof row === 'object').map(row => {
      const result = { sourceKey, scene: identifier(row.scene), mode: identifier(row.mode), finishedAt: timestamp(row.finishedAt) };
      for (const key of ['goalCount', 'heardCount', 'actionCount', 'spokenCount', 'hints', 'durationMs'])
        result[key] = Number.isFinite(row[key]) && row[key] >= 0 ? row[key] : 0;
      return result;
    });
  }

  function createStore(storage, { now = Date.now } = {}) {
    const currentTime = () => timestamp(typeof now === 'function' ? now() : now) || new Date().toISOString();
    let storageAvailable = Boolean(storage && typeof storage.setItem === 'function');
    const read = key => {
      try { return JSON.parse(storage?.getItem(key) || 'null'); }
      catch { storageAvailable = false; return null; }
    };
    const raw = read(STORAGE_KEY);
    const profile = { version: 1, evidenceVersion: EVIDENCE_VERSION, sessions: [], exposures: [], attempts: [],
      // `checkpoint` remains the most-recent recovery point for older callers.
      // `checkpoints` keeps independent recovery points when a learner visits
      // another scene before finishing the current one.
      checkpoint: null, checkpoints: [], legacySummaries: [] };
    let sessionSerial = 0, exposureSerial = 0;
    if (raw?.version === 1) {
      for (const input of Array.isArray(raw.sessions) ? raw.sessions : []) {
        const session = cleanSession(input);
        if (session && !profile.sessions.some(item => item.id === session.id)) profile.sessions.push(session);
      }
      for (const input of Array.isArray(raw.exposures) ? raw.exposures : []) {
        const exposure = cleanExposure(input, profile.sessions, null);
        if (!exposure?.at || profile.exposures.some(item => item.id === exposure.id)) continue;
        profile.exposures.push(exposure);
      }
      for (const input of Array.isArray(raw.attempts) ? raw.attempts : []) {
        const attempt = cleanAttempt(input, profile.sessions, profile.exposures, null);
        if (!attempt?.at) continue;
        const index = profile.attempts.findIndex(item => item.id === attempt.id);
        if (index < 0) profile.attempts.push(attempt);
        else if (sameAttemptOwner(profile.attempts[index], attempt)) profile.attempts[index] = attempt;
      }
      for (const input of Array.isArray(raw.checkpoints) ? raw.checkpoints : []) {
        const checkpoint = cleanCheckpoint(input, profile.sessions, currentTime());
        if (checkpoint && !profile.checkpoints.some(item => item.sessionId === checkpoint.sessionId))
          profile.checkpoints.push(checkpoint);
      }
      // Migrate the original single-checkpoint schema without invalidating a
      // learner's saved in-progress scene.
      const legacyCheckpoint = cleanCheckpoint(raw.checkpoint, profile.sessions, currentTime());
      if (legacyCheckpoint && !profile.checkpoints.some(item => item.sessionId === legacyCheckpoint.sessionId))
        profile.checkpoints.push(legacyCheckpoint);
      profile.checkpoint = profile.checkpoints.at(-1) || null;
      for (const row of Array.isArray(raw.legacySummaries) ? raw.legacySummaries : [])
        profile.legacySummaries.push(...legacyRows([row], identifier(row?.sourceKey) || 'luma-learning-profile-v1'));
    }
    // Keep old aggregate data for history only. It never feeds evidence selectors.
    if (!profile.legacySummaries.length) {
      const keys = new Set(['luma-learning-profile-v1']);
      try {
        for (let index = 0; index < (storage?.length || 0); index += 1) {
          const key = storage.key(index);
          if (key?.startsWith('luma-learning')) keys.add(key);
        }
      } catch { /* Some storage adapters expose getItem/setItem only. */ }
      for (const key of keys) profile.legacySummaries.push(...legacyRows(read(key)?.sessions, key));
    }

    function persist() {
      try {
        if (!storage || typeof storage.setItem !== 'function') throw new Error('storage unavailable');
        storage.setItem(STORAGE_KEY, JSON.stringify(profile));
        storageAvailable = true;
      } catch { storageAvailable = false; }
    }

    function syncRecentCheckpoint() {
      profile.checkpoint = profile.checkpoints.at(-1) || null;
    }

    function sameAttemptOwner(a, b) {
      return a.sessionId === b.sessionId && a.sceneId === b.sceneId && a.taskId === b.taskId && a.targetId === b.targetId;
    }

    function sameExposureOwner(a, b) {
      return a.sessionId === b.sessionId && a.sceneId === b.sceneId && a.taskId === b.taskId
        && a.targetId === b.targetId && a.kind === b.kind;
    }

    function beginSession({ sceneId = 'kitchen', mode = 'guided', resumeId, missionId, variantId,
      challengeType = 'unknown', promptModality = 'unknown' } = {}) {
      if (!identifier(sceneId)) return null;
      const resumed = profile.sessions.find(session => session.id === resumeId && session.sceneId === sceneId && !session.completedAt);
      if (resumed) return resumed.id;
      const at = currentTime();
      let id;
      do { id = `session-${Date.parse(at).toString(36)}-${++sessionSerial}-${Math.random().toString(36).slice(2, 10)}`; }
      while (profile.sessions.some(session => session.id === id));
      profile.sessions.push({ id, sceneId: identifier(sceneId), mode: identifier(mode) || 'guided',
        missionId: identifier(missionId), variantId: identifier(variantId),
        challengeType: enumValue(challengeTypes, challengeType), promptModality: enumValue(promptModalities, promptModality),
        startedAt: at, completedAt: null });
      persist();
      return id;
    }

    function recordExposure(input = {}) {
      if (!input || typeof input !== 'object') return null;
      const at = currentTime();
      let id = identifier(input.id);
      if (!id) {
        do { id = `exposure-${Date.parse(at).toString(36)}-${++exposureSerial}`; }
        while (profile.exposures.some(event => event.id === id));
      }
      const previous = profile.exposures.find(event => event.id === id);
      const exposure = cleanExposure({ ...previous, ...input, id }, profile.sessions, previous?.at || at);
      if (!exposure || (previous && !sameExposureOwner(previous, exposure))) return null;
      if (previous) exposure.at = previous.at;
      if (previous) profile.exposures[profile.exposures.indexOf(previous)] = exposure;
      else profile.exposures.push(exposure);
      persist();
      return copy(exposure);
    }

    function recordAttempt(input = {}) {
      if (!input || typeof input !== 'object') return null;
      const previous = profile.attempts.find(attempt => attempt.id === input.id);
      const merged = { ...previous, ...input };
      const sessionId = identifier(merged.sessionId), sceneId = identifier(merged.sceneId);
      const taskId = identifier(merged.taskId), targetId = identifier(merged.targetId);
      const relevantExposureIds = profile.exposures.filter(event => event.sessionId === sessionId
        && event.sceneId === sceneId && event.taskId === taskId && (!event.targetId || event.targetId === targetId))
        .map(event => event.id);
      merged.exposureIds = [...new Set([...(previous?.exposureIds || []),
        ...(Array.isArray(input.exposureIds) ? input.exposureIds : []), ...relevantExposureIds])];
      const attempt = cleanAttempt(merged, profile.sessions, profile.exposures, previous?.at || currentTime());
      if (!attempt || (previous && !sameAttemptOwner(previous, attempt))) return null;
      // Delivery time is not response time. A late revision keeps its occurrence date.
      if (previous) attempt.at = previous.at;
      if (previous) profile.attempts[profile.attempts.indexOf(previous)] = attempt;
      else profile.attempts.push(attempt);
      persist();
      return copy(attempt);
    }

    function saveCheckpoint(input = {}) {
      const checkpoint = cleanCheckpoint(input, profile.sessions, currentTime());
      if (!checkpoint) return null;
      const previous = profile.checkpoints.findIndex(item => item.sessionId === checkpoint.sessionId);
      if (previous >= 0) profile.checkpoints.splice(previous, 1);
      profile.checkpoints.push(checkpoint);
      syncRecentCheckpoint();
      persist();
      return copy(checkpoint);
    }

    function getCheckpoint(selector = {}) {
      const sceneId = identifier(selector?.sceneId);
      const missionId = identifier(selector?.missionId);
      const sessionId = identifier(selector?.sessionId);
      const checkpoint = [...profile.checkpoints].reverse().find(item =>
        (!sceneId || item.sceneId === sceneId)
        && (!missionId || item.missionId === missionId)
        && (!sessionId || item.sessionId === sessionId));
      return checkpoint ? copy(checkpoint) : null;
    }

    function getCheckpoints() {
      return copy(profile.checkpoints);
    }

    function discardCheckpoint({ sessionId } = {}) {
      const id = identifier(sessionId);
      if (!id) return null;
      const index = profile.checkpoints.findIndex(item => item.sessionId === id);
      if (index < 0) return null;
      const [discarded] = profile.checkpoints.splice(index, 1);
      syncRecentCheckpoint();
      persist();
      return copy(discarded);
    }

    function completeSession({ id, sceneId, completedAt } = {}) {
      const session = profile.sessions.find(item => item.id === id && item.sceneId === sceneId);
      if (!session) return null;
      if (!session.completedAt) {
        session.completedAt = timestamp(completedAt) || currentTime();
        profile.checkpoints = profile.checkpoints.filter(checkpoint => checkpoint.sessionId !== id);
        syncRecentCheckpoint();
        persist();
      }
      return copy(session);
    }

    function targetEvidence() {
      const targets = new Map();
      const attempts = profile.attempts.filter(independentProduction).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
      for (const attempt of attempts) {
        let target = targets.get(attempt.targetId);
        if (!target) {
          target = { targetId: attempt.targetId, sceneIds: [], independentCount: 0 };
          targets.set(attempt.targetId, target);
        }
        target.independentCount += 1;
        if (!target.sceneIds.includes(attempt.sceneId)) target.sceneIds.push(attempt.sceneId);
        target.lastIndependentAt = attempt.at;
        target.lastSceneId = attempt.sceneId;
      }
      return [...targets.values()];
    }

    function reviewQueue() {
      const targets = new Map();
      // Successful practice warrants another encounter, including supported,
      // Chinese, typed, and physical responses. This is not ability evidence.
      const attempts = profile.attempts.filter(attempt => attempt.outcome === 'success')
        .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
      for (const attempt of attempts) {
        let target = targets.get(attempt.targetId);
        if (!target) {
          target = { targetId: attempt.targetId, reviewCount: 0,
            dueAt: afterDays(attempt.at, REVIEW_INTERVAL_DAYS[0]) };
          targets.set(attempt.targetId, target);
        } else if (day(attempt.at) >= day(target.dueAt)) {
          // Completing a scheduled encounter with help still counts as doing
          // today's practice. It advances the practice schedule without
          // creating independent-production evidence.
          target.reviewCount += 1;
          const interval = REVIEW_INTERVAL_DAYS[Math.min(target.reviewCount, REVIEW_INTERVAL_DAYS.length - 1)];
          target.dueAt = afterDays(attempt.at, interval);
        }
        target.lastSceneId = attempt.sceneId;
        target.lastTaskId = attempt.taskId;
        target.lastMissionId = attempt.missionId;
        target.lastVariantId = attempt.variantId;
      }
      return [...targets.values()];
    }

    // Learning-note screens may inspect these derived records, but must not be
    // able to mutate the store's internal evidence graph.
    function getReviewQueue() {
      return copy(reviewQueue());
    }

    function getTargetEvidence() {
      return copy(targetEvidence());
    }

    function assessRetention({ attemptId, priorAttemptId, minimumElapsedMs, dimension = 'production' } = {}) {
      const current = profile.attempts.find(attempt => attempt.id === attemptId);
      const prior = profile.attempts.find(attempt => attempt.id === priorAttemptId);
      const threshold = Number.isFinite(minimumElapsedMs) && minimumElapsedMs > 0 ? minimumElapsedMs : null;
      const validDimension = dimensions.includes(dimension);
      const result = {
        attemptId: identifier(attemptId), priorAttemptId: identifier(priorAttemptId),
        dimension: validDimension ? dimension : null, minimumElapsedMs: threshold,
        actualElapsedMs: null, interveningRelearn: null,
        interveningAttemptIds: [], interveningExposureIds: [], status: 'unknown',
      };
      if (!current || !prior || !threshold || !validDimension) return result;
      if (current.targetId !== prior.targetId) return { ...result, status: 'target-mismatch' };
      const currentMs = Date.parse(current.at), priorMs = Date.parse(prior.at);
      const actualElapsedMs = currentMs - priorMs;
      result.actualElapsedMs = Number.isFinite(actualElapsedMs) ? actualElapsedMs : null;
      const conditionKey = dimension === 'production' ? 'productionCondition' : 'listeningCondition';
      if (prior[conditionKey] !== 'independent' || current[conditionKey] !== 'independent')
        return { ...result, status: 'conditions-not-independent' };
      const between = value => {
        const ms = Date.parse(value);
        return Number.isFinite(ms) && ms > priorMs && ms < currentMs;
      };
      result.interveningAttemptIds = profile.attempts.filter(attempt => attempt.id !== current.id && attempt.id !== prior.id
        && attempt.targetId === current.targetId && attempt.outcome === 'success' && between(attempt.at)).map(attempt => attempt.id);
      const impactKey = dimension === 'production' ? 'affectsProduction' : 'affectsListening';
      result.interveningExposureIds = profile.exposures.filter(event => event.relearning === true
        && event[impactKey] === true && event.targetId === current.targetId && between(event.at)).map(event => event.id);
      result.interveningRelearn = Boolean(result.interveningAttemptIds.length || result.interveningExposureIds.length);
      if (!Number.isFinite(actualElapsedMs) || actualElapsedMs < threshold) return { ...result, status: 'too-soon' };
      if (result.interveningRelearn) return { ...result, status: 'intervening-relearn' };
      return { ...result, status: 'qualified' };
    }

    function getAttemptEvidence(id) {
      const attempt = profile.attempts.find(item => item.id === id);
      if (!attempt) return null;
      const result = { ...copy(attempt), exposures: copy(matchingExposures(attempt, profile.exposures)) };
      if (attempt.retentionCheck) result.retention = assessRetention({ attemptId: attempt.id, ...attempt.retentionCheck });
      return result;
    }

    function summary() {
      const attempts = profile.attempts;
      const successes = attempts.filter(attempt => attempt.outcome === 'success');
      const voiceEnglish = successes.filter(attempt => attempt.source === 'voice' && attempt.language === 'en');
      const completed = profile.sessions.filter(session => session.completedAt);
      const targets = targetEvidence();
      const retention = attempts.map(attempt => attempt.retentionCheck
        ? assessRetention({ attemptId: attempt.id, ...attempt.retentionCheck }) : null).filter(Boolean);
      return {
        sessionCount: profile.sessions.length, completedSessions: completed.length,
        todayCompletedSessions: completed.filter(session => day(session.completedAt) === day(currentTime())).length,
        // independentCount remains the backwards-compatible oral production count.
        independentCount: attempts.filter(independentProduction).length,
        independentProductionCount: attempts.filter(independentProduction).length,
        assistedProductionCount: attempts.filter(attempt => attempt.productionCondition === 'assisted').length,
        independentListeningCount: attempts.filter(independentListening).length,
        assistedListeningCount: attempts.filter(attempt => attempt.listeningCondition === 'assisted').length,
        unknownProductionConditionCount: voiceEnglish.filter(attempt => attempt.productionCondition === 'unknown').length,
        unknownListeningConditionCount: successes.filter(attempt => attempt.listeningCondition === 'unknown').length,
        independentTargetCount: targets.length,
        assistedCount: voiceEnglish.filter(attempt => attempt.supportLevel > 0).length,
        unknownSupportCount: voiceEnglish.filter(attempt => attempt.supportLevel === null).length,
        voiceEnglishCount: voiceEnglish.length,
        textCount: successes.filter(attempt => attempt.source === 'text').length,
        chineseCount: successes.filter(attempt => ['voice', 'text'].includes(attempt.source) && ['zh', 'mixed'].includes(attempt.language)).length,
        actionCount: successes.filter(attempt => ['tap', 'drag'].includes(attempt.source)).length,
        technicalErrorCount: attempts.filter(attempt => attempt.outcome === 'technical-error').length,
        unconfirmedCount: attempts.filter(attempt => attempt.outcome === 'unconfirmed').length,
        exposureCount: profile.exposures.length,
        retentionEvidenceCount: retention.filter(item => item.status === 'qualified').length,
        // One limited transfer observation per target, not a general fluency score.
        transferCount: targets.filter(target => target.sceneIds.length > 1).length,
        dueCount: reviewQueue().filter(target => day(target.dueAt) <= day(currentTime())).length,
        lastCompletedAt: completed.map(session => session.completedAt).sort().at(-1) || null,
        storageAvailable,
      };
    }

    function nextStep({ preferReview = false } = {}) {
      const due = reviewQueue().filter(target => day(target.dueAt) <= day(currentTime()))
        .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.targetId.localeCompare(b.targetId));
      if (preferReview && due.length) {
        const target = due[0];
        return { kind: 'review', sceneId: target.lastSceneId, missionId: target.lastMissionId,
          variantId: target.lastVariantId, taskId: target.lastTaskId, practiceMode: 'guided',
          targetIds: [target.targetId], reviewItems: due.map(item => ({
            targetId: item.targetId, sceneId: item.lastSceneId, taskId: item.lastTaskId,
            missionId: item.lastMissionId, variantId: item.lastVariantId, dueAt: item.dueAt,
          })),
          title: '再试试上次练过的内容', reason: '按产品默认的复练间隔，今天可以再试一次' };
      }
      const checkpoint = getCheckpoint();
      if (checkpoint) return { kind: 'resume', sceneId: checkpoint.sceneId, sessionId: checkpoint.sessionId,
        taskIndex: checkpoint.taskIndex, practiceMode: checkpoint.practiceMode, targetIds: [],
        title: '继续上次的情境', reason: '上次的进度已保存' };
      if (due.length) return nextStep({ preferReview: true });
      const completed = profile.sessions.filter(session => session.completedAt).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
      return completed.length
        ? { kind: 'continue', sceneId: completed[0].sceneId, practiceMode: 'guided', targetIds: [],
          title: '再练一次熟悉的情境', reason: '需要时可以用提示，再尝试自己回应' }
        : { kind: 'start', sceneId: 'kitchen', practiceMode: 'guided', targetIds: [],
          title: '一起准备早餐', reason: '从有帮助的真实情境开始' };
    }

    return { beginSession, recordExposure, recordAttempt, saveCheckpoint, getCheckpoint, getCheckpoints, discardCheckpoint, completeSession,
      assessRetention, getAttemptEvidence, getReviewQueue, getTargetEvidence,
      summary, nextStep, getProfile: () => copy(profile) };
  }

  return { STORAGE_KEY, EVIDENCE_VERSION,
    REVIEW_INTERVAL_DAYS: Object.freeze(REVIEW_INTERVAL_DAYS.slice()), createStore };
});

/* Remember completed visits, not inferred preferences. Persistence belongs to the caller. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LumaSceneMemory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'luma-scene-memory-v1';
  const VERSION = 1;
  const MAX_VISITS = 8;
  const fields = {
    drink: { values: ['latte', 'americano'], target: 'choose-drink' },
    size: { values: ['small', 'large'], target: 'choose-size' },
    service: { values: ['here', 'to-go'], target: 'choose-service' },
  };
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const identifier = value => typeof value === 'string' && value.trim() && value.trim().length <= 200
    ? value.trim() : null;
  const timestamp = value => {
    if (!(value instanceof Date) && typeof value !== 'number' && typeof value !== 'string') return null;
    if (value === '') return null;
    const time = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
    return Number.isFinite(time) && Number.isFinite(new Date(time).getTime()) ? new Date(time).toISOString() : null;
  };

  function cleanVisit(value) {
    if (!object(value) || value.sceneId !== 'coffee') return null;
    const sessionId = identifier(value.sessionId), endedAt = timestamp(value.endedAt);
    if (!sessionId || !endedAt || !object(value.order) || value.evidence?.completed !== true) return null;
    // Only a user's spoken choices can become remembered facts. A seeded C03
    // order, a suggested target, taps, and technical-only fixtures do not count.
    const attempts = Array.isArray(value.evidence.attempts) ? value.evidence.attempts : [];
    const order = {}, confirmed = [];
    for (const [field, definition] of Object.entries(fields)) {
      if (!definition.values.includes(value.order[field])) return null;
      const attempt = [...attempts].reverse().find(item => object(item)
        && identifier(item.id) && item.sessionId === sessionId && item.sceneId === 'coffee'
        && item.targetId === definition.target && item.source === 'voice' && item.outcome === 'success'
        && item.synthetic !== true);
      if (!attempt) return null;
      order[field] = value.order[field];
      confirmed.push({ id: identifier(attempt.id), sessionId, sceneId: 'coffee',
        targetId: definition.target, source: 'voice', outcome: 'success' });
    }
    return { sessionId, sceneId: 'coffee', endedAt, order,
      evidence: { completed: true, attempts: confirmed } };
  }

  function normalize(raw) {
    let input = raw;
    if (typeof input === 'string') {
      try { input = JSON.parse(input); } catch { input = null; }
    }
    const unique = new Map();
    if (object(input) && input.version === VERSION && Array.isArray(input.visits)) {
      for (const value of input.visits) {
        const visit = cleanVisit(value);
        if (!visit) continue;
        const previous = unique.get(visit.sessionId);
        if (!previous || visit.endedAt >= previous.endedAt) unique.set(visit.sessionId, visit);
      }
    }
    const visits = [...unique.values()].sort((a, b) => a.endedAt.localeCompare(b.endedAt)
      || a.sessionId.localeCompare(b.sessionId)).slice(-MAX_VISITS);
    return { version: VERSION, visits };
  }

  function record(raw, input) {
    const result = normalize(raw), visit = cleanVisit(input);
    if (!visit) return result;
    const previous = result.visits.find(item => item.sessionId === visit.sessionId);
    // A delayed completion callback must not overwrite a later correction.
    if (previous && previous.endedAt > visit.endedAt) return result;
    return normalize({ version: VERSION, visits: [
      ...result.visits.filter(item => item.sessionId !== visit.sessionId), visit,
    ] });
  }

  function lastVisit(raw, { sceneId = 'coffee', excludeSessionId, before } = {}) {
    const boundary = before === undefined ? null : timestamp(before);
    if (before !== undefined && !boundary) return null;
    return normalize(raw).visits.filter(item => item.sceneId === sceneId
      && item.sessionId !== excludeSessionId && (!boundary || item.endedAt < boundary)).at(-1) || null;
  }

  function returnGreeting(input) {
    const visit = cleanVisit(input);
    if (!visit) return '';
    const drink = visit.order.drink, article = drink === 'americano' ? 'an' : 'a';
    // The question offers only the drink. Saying yes must never silently reuse
    // the previous size or service, and a remembered order is not a preference.
    return `Welcome back! Last time you had ${article} ${drink}. Would you like ${article} ${drink}?`;
  }

  return { STORAGE_KEY, VERSION, MAX_VISITS, normalize, record, lastVisit, returnGreeting };
});

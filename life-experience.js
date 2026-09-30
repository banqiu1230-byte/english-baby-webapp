/* Life XP records participation in completed events, never English proficiency. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LumaLifeExperience = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'luma-life-experience-v1';
  const REVISIT_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const LEVEL_XP = 100;
  const REWARDS = Object.freeze({ firstMission: 20, firstScene: 10, revisit: 10 });
  const copy = value => JSON.parse(JSON.stringify(value));
  const identifier = value => typeof value === 'string' && value.trim()
    && value.trim().length <= 160 && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;
  const timestamp = value => {
    if (typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
    if (typeof value === 'string') {
      const [year, month, day] = value.slice(0, 10).split('-').map(Number);
      if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
    }
    if (!(value instanceof Date) && typeof value !== 'number' && typeof value !== 'string') return null;
    const ms = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
    return Number.isFinite(ms) && ms >= 0 && !Number.isNaN(new Date(ms).getTime()) ? new Date(ms).toISOString() : null;
  };

  function cleanSession(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    // The caller must establish a full life event. A completed short practice or
    // an older session with unknown scope is not evidence of a completed mission.
    if (input.scope !== 'life-event') return null;
    const sessionId = identifier(input.sessionId ?? input.id), sceneId = identifier(input.sceneId);
    if (input.sessionId != null && input.id != null && input.sessionId !== input.id) return null;
    const missionId = input.missionId == null ? null : identifier(input.missionId);
    const completedAt = timestamp(input.completedAt);
    if (!sessionId || !sceneId || !completedAt || (input.missionId != null && !missionId)) return null;
    // Multi-mission scenes need a mission identity to award a completed event.
    if (['coffee', 'interview'].includes(sceneId) && !missionId) return null;
    const startedAt = input.startedAt == null ? null : timestamp(input.startedAt);
    if (input.startedAt != null && (!startedAt || Date.parse(startedAt) > Date.parse(completedAt))) return null;
    if (input.completed === false || ['technical-error', 'unconfirmed'].includes(input.outcome)) return null;
    return { sessionId, sceneId, missionId, completedAt, scope: 'life-event' };
  }

  const missionKey = event => JSON.stringify([event.sceneId, event.missionId]);
  const emptyState = () => ({ version: 1, migrationCompleted: false, completions: [] });
  function cleanState(raw) {
    const state = emptyState();
    if (raw?.version !== 1 || !Array.isArray(raw.completions)) return state;
    state.migrationCompleted = raw.migrationCompleted === true;
    const seen = new Set();
    for (const input of raw.completions) {
      const event = cleanSession(input);
      if (!event || !['live', 'migration'].includes(input.source) || seen.has(event.sessionId)) continue;
      seen.add(event.sessionId);
      state.completions.push({ ...event, source: input.source });
    }
    return state;
  }

  function ledgerFor(completions) {
    const missions = new Map(), scenes = new Set(), awards = [];
    for (const event of completions) {
      const key = missionKey(event), at = Date.parse(event.completedAt);
      const add = (reason, xp) => awards.push({
        id: `${event.sessionId}:${reason}`, sessionId: event.sessionId,
        sceneId: event.sceneId, missionId: event.missionId, completedAt: event.completedAt,
        source: event.source, reason, xp,
      });
      if (!missions.has(key)) {
        add('first-mission', REWARDS.firstMission);
        missions.set(key, at);
      } else if (event.source === 'live' && at - missions.get(key) >= REVISIT_INTERVAL_MS) {
        add('revisit', REWARDS.revisit);
        missions.set(key, at);
      }
      if (!scenes.has(event.sceneId)) {
        add('first-scene', REWARDS.firstScene);
        scenes.add(event.sceneId);
      }
    }
    return awards;
  }

  function createStore(storage, { now = Date.now } = {}) {
    const currentTime = () => timestamp(typeof now === 'function' ? now() : now) || new Date().toISOString();
    let state = emptyState();
    let storageAvailable = Boolean(storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function');
    let storageReadable = Boolean(storage && typeof storage.getItem === 'function');

    function refresh() {
      let raw;
      try {
        raw = storage?.getItem(STORAGE_KEY);
        storageReadable = Boolean(storage && typeof storage.getItem === 'function');
      } catch { storageReadable = false; storageAvailable = false; return; }
      let disk;
      try { disk = cleanState(raw ? JSON.parse(raw) : null); }
      catch { return; }
      // Read before each mutation so a stale store instance cannot reward the same
      // session again. Keep in-memory events if a quota/private-mode write failed.
      const seen = new Set(disk.completions.map(event => event.sessionId));
      for (const event of state.completions) {
        if (!seen.has(event.sessionId)) disk.completions.push(event);
      }
      disk.migrationCompleted ||= state.migrationCompleted;
      state = disk;
    }
    function persist() {
      try {
        if (!storage || typeof storage.setItem !== 'function') throw new Error('storage unavailable');
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
        storageAvailable = storageReadable;
      } catch { storageAvailable = false; }
    }
    function snapshot() {
      const awards = ledgerFor(state.completions);
      const totalXP = awards.reduce((sum, award) => sum + award.xp, 0);
      const today = new Date(currentTime());
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - (weekStart.getDay() + 6) % 7);
      const localDay = at => {
        const date = new Date(at);
        return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
      };
      const thisWeek = state.completions.filter(event => {
        const at = Date.parse(event.completedAt);
        return at >= weekStart.getTime() && at < tomorrow.getTime();
      });
      return copy({
        totalXP, level: Math.floor(totalXP / LEVEL_XP) + 1,
        currentLevelXP: totalXP % LEVEL_XP, nextLevelXP: LEVEL_XP,
        remainingXP: LEVEL_XP - totalXP % LEVEL_XP,
        completedCount: state.completions.length,
        completedMissions: new Set(state.completions.map(missionKey)).size,
        visitedScenes: [...new Set(state.completions.map(event => event.sceneId))],
        todayCompleted: state.completions.filter(event => {
          const at = Date.parse(event.completedAt);
          return at >= today.getTime() && at < tomorrow.getTime();
        }).length,
        activeDaysThisWeek: new Set(thisWeek.map(event => localDay(event.completedAt))).size,
        migrationCompleted: state.migrationCompleted, storageAvailable,
        awards, completions: state.completions,
      });
    }
    function summary() { refresh(); return snapshot(); }

    // Call once with verified full-event sessions before accepting new completions.
    // Legacy sessions without scope need an evidence audit in the adapter first.
    // Historical repeats remain activity records, but never receive revisit XP.
    function migrate(sessions) {
      refresh();
      if (!Array.isArray(sessions)) return { migrated: false, reason: 'invalid-input', importedSessions: 0, gainedXP: 0, awards: [], summary: snapshot() };
      if (state.migrationCompleted) return { migrated: false, reason: 'already-migrated', importedSessions: 0, gainedXP: 0, awards: [], summary: snapshot() };
      const before = new Set(ledgerFor(state.completions).map(award => award.id));
      const seen = new Set(state.completions.map(event => event.sessionId));
      const at = Date.parse(currentTime());
      const events = sessions.map(cleanSession).filter(event => event && Date.parse(event.completedAt) <= at)
        .sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt) || a.sessionId.localeCompare(b.sessionId));
      let importedSessions = 0;
      for (const event of events) {
        if (seen.has(event.sessionId)) continue;
        seen.add(event.sessionId);
        state.completions.push({ ...event, source: 'migration' });
        importedSessions += 1;
      }
      state.migrationCompleted = true;
      persist();
      const result = snapshot(), awards = result.awards.filter(award => !before.has(award.id));
      return { migrated: true, importedSessions, gainedXP: awards.reduce((sum, award) => sum + award.xp, 0), awards, summary: result };
    }

    function complete(session) {
      refresh();
      const event = cleanSession(session);
      if (!event || Date.parse(event.completedAt) > Date.parse(currentTime())) {
        return { accepted: false, reason: 'invalid-session', duplicate: false, gainedXP: 0, sessionXP: 0, awards: [], sessionAwards: [], summary: snapshot() };
      }
      const existing = state.completions.find(item => item.sessionId === event.sessionId);
      if (existing && (existing.sceneId !== event.sceneId || existing.missionId !== event.missionId || existing.completedAt !== event.completedAt)) {
        return { accepted: false, reason: 'session-conflict', duplicate: true, gainedXP: 0, sessionXP: 0, awards: [], sessionAwards: [], summary: snapshot() };
      }
      if (!existing) state.completions.push({ ...event, source: 'live' });
      persist();
      const result = snapshot(), sessionAwards = result.awards.filter(award => award.sessionId === event.sessionId);
      const sessionXP = sessionAwards.reduce((sum, award) => sum + award.xp, 0);
      return {
        accepted: true, reason: existing ? 'already-recorded' : sessionXP ? 'rewarded' : 'cooldown',
        duplicate: Boolean(existing), sessionId: event.sessionId,
        gainedXP: existing ? 0 : sessionXP, sessionXP,
        awards: existing ? [] : sessionAwards, sessionAwards, summary: result,
      };
    }

    refresh();
    return { migrate, complete, summary };
  }

  return { STORAGE_KEY, REWARDS, REVISIT_INTERVAL_MS, LEVEL_XP, createStore };
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Life = require('./life-experience');

const DAY = Life.REVISIT_INTERVAL_MS;
const BASE = Date.parse('2026-09-21T04:00:00.000Z');
function memoryStorage(seed) {
  const values = new Map(seed ? [[Life.STORAGE_KEY, seed]] : []);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function session(id, { at = BASE, sceneId = 'coffee', missionId = sceneId === 'coffee' ? 'C01' : null, ...extra } = {}) {
  return { id, sceneId, missionId, completedAt: new Date(at).toISOString(), scope: 'life-event', ...extra };
}
function setup(storage = memoryStorage(), initialTime = BASE) {
  let now = initialTime;
  return { store: Life.createStore(storage, { now: () => now }), storage, setNow: value => { now = value; } };
}

test('first mission and first scene award 30 XP; variants and assistance do not change reward rules', () => {
  const { store } = setup();
  store.migrate([]);
  const first = store.complete(session('one', { variantId: 'small-latte', supportLevel: 3, language: 'zh' }));
  assert.equal(first.gainedXP, 30);
  assert.deepEqual(first.awards.map(award => [award.reason, award.xp]), [['first-mission', 20], ['first-scene', 10]]);
  assert.equal(store.complete(session('two', { variantId: 'large-americano' })).gainedXP, 0);
  assert.equal(store.complete(session('three', { missionId: 'C02' })).gainedXP, 20);
  assert.equal(store.summary().totalXP, 50);
  assert.equal(store.summary().completedMissions, 2);
  assert.equal(store.summary().completedCount, 3);
});

test('non-coffee scenes use stable scene identity when no mission id exists', () => {
  const { store } = setup();
  assert.equal(store.complete(session('one', { sceneId: 'kitchen' })).gainedXP, 30);
  assert.equal(store.complete(session('two', { sceneId: 'kitchen', variantId: 'new-variant' })).gainedXP, 0);
  assert.equal(store.complete(session('three', { sceneId: 'airport' })).gainedXP, 30);
  assert.deepEqual(store.summary().visitedScenes, ['kitchen', 'airport']);
});

test('cooldown is exactly 24 hours after the last rewarded completion, not the latest attempt', () => {
  const { store, setNow } = setup();
  store.complete(session('first'));
  setNow(BASE + DAY - 1);
  assert.equal(store.complete(session('too-soon', { at: BASE + DAY - 1 })).gainedXP, 0);
  setNow(BASE + DAY);
  assert.equal(store.complete(session('boundary', { at: BASE + DAY })).gainedXP, 10);
  setNow(BASE + DAY * 2 - 1);
  assert.equal(store.complete(session('second-too-soon', { at: BASE + DAY * 2 - 1 })).gainedXP, 0);
  setNow(BASE + DAY * 2);
  assert.equal(store.complete(session('second-boundary', { at: BASE + DAY * 2 })).gainedXP, 10);
  assert.equal(store.summary().totalXP, 50);
});

test('each mission has an independent revisit cooldown', () => {
  const { store, setNow } = setup();
  store.complete(session('c01'));
  setNow(BASE + DAY / 2);
  store.complete(session('c02', { missionId: 'C02', at: BASE + DAY / 2 }));
  setNow(BASE + DAY);
  assert.equal(store.complete(session('c01-repeat', { at: BASE + DAY })).gainedXP, 10);
  assert.equal(store.complete(session('c02-repeat', { missionId: 'C02', at: BASE + DAY })).gainedXP, 0);
});

test('same-session callbacks, cached instances, and reloads never duplicate reward', () => {
  const { store, storage } = setup();
  const stale = Life.createStore(storage, { now: BASE });
  const first = session('one');
  store.complete(first);
  assert.equal(stale.complete(first).gainedXP, 0);
  const duplicate = store.complete({ ...first, sessionId: 'one', variantId: 'another-variant' });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.sessionXP, 30);
  assert.equal(duplicate.awards.length, 0);
  assert.equal(duplicate.sessionAwards.length, 2);
  const reloaded = Life.createStore(storage, { now: BASE });
  assert.equal(reloaded.complete(first).gainedXP, 0);
  assert.equal(reloaded.summary().totalXP, 30);
  stale.complete(session('other-mission', { missionId: 'C02' }));
  assert.equal(store.summary().totalXP, 50);
  assert.equal(store.summary().completedCount, 2);
});

test('a repeated id cannot change mission, scene, or completion time to earn again', () => {
  const { store, setNow } = setup();
  store.complete(session('same'));
  setNow(BASE + DAY);
  for (const conflicting of [session('same', { missionId: 'C02' }), session('same', { sceneId: 'kitchen' }), session('same', { at: BASE + DAY })]) {
    const result = store.complete(conflicting);
    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'session-conflict');
  }
  assert.equal(store.summary().totalXP, 30);
});

test('out-of-order older completions cannot award a revisit or reset the cooldown', () => {
  const { store, setNow } = setup(undefined, BASE + DAY * 3);
  store.complete(session('newest', { at: BASE + DAY * 3 }));
  assert.equal(store.complete(session('older', { at: BASE })).gainedXP, 0);
  setNow(BASE + DAY * 4);
  assert.equal(store.complete(session('next', { at: BASE + DAY * 4 })).gainedXP, 10);
});

test('migration gives only first mission and scene awards, including historical repeats spaced days apart', () => {
  const { store, storage } = setup(undefined, BASE + DAY * 20);
  const history = [
    session('c01-later', { at: BASE + DAY * 2 }), session('c01-first'),
    session('c02', { missionId: 'C02', at: BASE + DAY }),
    session('kitchen', { sceneId: 'kitchen', at: BASE + DAY * 3 }),
    session('kitchen-repeat', { sceneId: 'kitchen', at: BASE + DAY * 9 }),
    session('c01-first'), { id: 'unfinished', sceneId: 'airport', completedAt: null },
    session('coffee-unknown-task', { missionId: null }),
  ];
  const migration = store.migrate(history);
  assert.equal(migration.migrated, true);
  assert.equal(migration.importedSessions, 5);
  assert.equal(migration.gainedXP, 80);
  assert.equal(migration.awards.some(award => award.reason === 'revisit'), false);
  assert.equal(store.summary().completedCount, 5);
  assert.equal(store.migrate(history).gainedXP, 0);
  const reloaded = Life.createStore(storage, { now: BASE + DAY * 20 });
  assert.equal(reloaded.migrate([...history, session('new-history', { sceneId: 'office' })]).migrated, false);
  assert.equal(reloaded.complete(session('c01-later', { at: BASE + DAY * 2 })).gainedXP, 0);
  assert.equal(reloaded.complete(session('live', { at: BASE + DAY * 20 })).gainedXP, 10);
  assert.equal(reloaded.summary().totalXP, 90);
});

test('migration does not erase prior live events or reward them twice', () => {
  const { store } = setup(undefined, BASE + DAY);
  store.complete(session('existing'));
  const migration = store.migrate([session('existing'), session('other', { missionId: 'C02' })]);
  assert.equal(migration.importedSessions, 1);
  assert.equal(migration.gainedXP, 20);
  assert.equal(store.summary().totalXP, 50);
});

test('empty migration is persisted, and invalid input does not consume migration', () => {
  const { store, storage } = setup();
  assert.equal(store.migrate(null).reason, 'invalid-input');
  assert.equal(store.summary().migrationCompleted, false);
  assert.equal(store.migrate([]).migrated, true);
  assert.equal(Life.createStore(storage).summary().migrationCompleted, true);
});

test('only valid completed sessions count; previews, technical failures, and future timestamps do not', () => {
  const { store } = setup();
  const invalid = [null, [], {}, { ...session('x'), completedAt: null },
    session('x', { at: BASE + 1 }), session('x', { missionId: null }), session('x', { missionId: 42 }),
    session('', {}), session('x', { sceneId: '' }), session('x', { completedAt: '1' }),
    session('x', { completedAt: Infinity }), session('x', { startedAt: new Date(BASE + 1).toISOString() }),
    session('x', { completedAt: '2026-02-30T04:00:00.000Z' }),
    session('x', { completed: false }), session('x', { outcome: 'technical-error' }),
    session('x', { outcome: 'unconfirmed' }), session('x', { sessionId: 'conflict' }),
  ];
  for (const input of invalid) assert.equal(store.complete(input).accepted, false, JSON.stringify(input));
  assert.equal(store.summary().totalXP, 0);
  assert.equal(store.summary().completedCount, 0);
  assert.equal(store.complete({ sessionId: 'good', sceneId: 'kitchen', completedAt: BASE, startedAt: BASE - 1, scope: 'life-event' }).gainedXP, 30);
});

test('completed target practice never awards life XP, explores a place, or counts as a life event', () => {
  const { store } = setup();
  const result = store.complete(session('thanks-only', { scope: 'target-practice', challengeType: 'retention' }));
  assert.equal(result.accepted, false);
  assert.equal(result.gainedXP, 0);
  const summary = store.summary();
  assert.equal(summary.totalXP, 0);
  assert.equal(summary.completedCount, 0);
  assert.equal(summary.todayCompleted, 0);
  assert.equal(summary.activeDaysThisWeek, 0);
  assert.deepEqual(summary.visitedScenes, []);
  assert.deepEqual(summary.completions, []);
});

test('missing or unknown scope cannot be inferred from completedAt, missionId, or challengeType', () => {
  const { store } = setup();
  for (const scope of [undefined, null, '', 'unknown', 'guided', 'Life-event']) {
    const result = store.complete(session(`unknown-${scope}`, { scope, challengeType: 'guided' }));
    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'invalid-session');
  }
  assert.equal(store.summary().completedCount, 0);
  assert.equal(store.summary().totalXP, 0);
  // Explicitly verified full events are eligible even if they also practise a
  // retention target; challenge type alone does not define event scope.
  assert.equal(store.complete(session('full-event', { challengeType: 'retention' })).gainedXP, 30);
});

test('migration imports only explicitly verified life events, leaving legacy and short-practice records uncredited', () => {
  const { store, storage } = setup();
  const result = store.migrate([
    session('legacy-coffee', { scope: undefined }),
    session('unknown-airport', { sceneId: 'airport', scope: 'unknown' }),
    session('short-coffee', { scope: 'target-practice' }),
    session('verified-kitchen', { sceneId: 'kitchen' }),
  ]);
  assert.equal(result.importedSessions, 1);
  assert.equal(result.gainedXP, 30);
  assert.equal(result.summary.completedCount, 1);
  assert.deepEqual(result.summary.visitedScenes, ['kitchen']);
  const reloaded = Life.createStore(storage, { now: BASE });
  assert.equal(reloaded.summary().completedCount, 1);
  assert.equal(reloaded.summary().completions[0].scope, 'life-event');
  assert.equal(reloaded.complete(session('new-full-coffee')).gainedXP, 30);
});

test('levels have exact 100 XP boundaries and zero XP starts at level 1', () => {
  const { store } = setup();
  assert.deepEqual([store.summary().level, store.summary().currentLevelXP, store.summary().remainingXP], [1, 0, 100]);
  for (const [id, missionId] of [['a', 'C01'], ['b', 'C02'], ['c', 'C03'], ['d', 'C04']]) store.complete(session(id, { missionId }));
  assert.equal(store.summary().totalXP, 90);
  assert.equal(store.summary().level, 1);
  const { store: boundary, setNow } = setup();
  for (const [id, missionId] of [['a', 'C01'], ['b', 'C02'], ['c', 'C03'], ['d', 'C04']]) boundary.complete(session(id, { missionId }));
  setNow(BASE + DAY);
  boundary.complete(session('repeat', { at: BASE + DAY }));
  const summary = boundary.summary();
  assert.deepEqual([summary.totalXP, summary.level, summary.currentLevelXP, summary.nextLevelXP, summary.remainingXP], [100, 2, 0, 100, 100]);
});

test('activity uses local days, Monday week start, and counts completed events even when they earn no XP', () => {
  const localMonday = new Date(2026, 8, 21, 12).getTime();
  const localTuesday = new Date(2026, 8, 22, 12).getTime();
  const { store } = setup(undefined, localTuesday);
  store.migrate([
    session('sunday', { at: new Date(2026, 8, 20, 12).getTime() }),
    session('monday', { at: localMonday }), session('tuesday', { at: localTuesday }),
    session('tuesday-again', { at: localTuesday }),
  ]);
  assert.equal(store.summary().todayCompleted, 2);
  assert.equal(store.summary().activeDaysThisWeek, 2);
  assert.equal(store.summary().totalXP, 30);
});

test('storage unavailable or write failure preserves in-memory idempotence and reports its limit', () => {
  for (const storage of [null, { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } }, { getItem: () => null, setItem() { throw new Error('quota'); } }, { setItem() {} }, { getItem() { throw new Error('read denied'); }, setItem() {} }]) {
    const { store } = setup(storage);
    assert.equal(store.complete(session('one')).gainedXP, 30);
    assert.equal(store.complete(session('one')).gainedXP, 0);
    assert.equal(store.summary().totalXP, 30);
    assert.equal(store.summary().storageAvailable, false);
  }
});

test('a transient failed write can be recovered without losing or duplicating rewards', () => {
  const backing = memoryStorage();
  let fail = true;
  const storage = { getItem: key => backing.getItem(key), setItem(key, value) { if (fail) throw new Error('quota'); backing.setItem(key, value); } };
  const { store } = setup(storage);
  store.migrate([]);
  store.complete(session('one'));
  fail = false;
  assert.equal(store.complete(session('one')).gainedXP, 0);
  assert.equal(store.summary().storageAvailable, true);
  assert.equal(Life.createStore(storage, { now: BASE }).summary().totalXP, 30);
});

test('malformed storage, duplicate records, and injected totals cannot manufacture XP', () => {
  for (const raw of ['{broken', JSON.stringify({ version: 4, totalXP: 90000 }), JSON.stringify({ version: 1, completions: 'not-an-array' })]) {
    const { store } = setup(memoryStorage(raw));
    assert.equal(store.summary().totalXP, 0);
    assert.equal(store.complete(session('one')).gainedXP, 30);
  }
  const event = { sessionId: 'one', sceneId: 'coffee', missionId: 'C01', completedAt: new Date(BASE).toISOString(), source: 'live', scope: 'life-event' };
  const { store } = setup(memoryStorage(JSON.stringify({ version: 1, totalXP: 5000, migrationCompleted: true, completions: [event, event, { ...event, sessionId: 'bad', completedAt: null }, { ...event, sessionId: 'bad-source', source: 'unknown' }] })));
  assert.equal(store.summary().totalXP, 30);
  assert.equal(store.summary().completedCount, 1);
});

test('returned data is detached from internal state and browser global matches the CommonJS API', () => {
  const { store } = setup();
  const result = store.complete(session('one'));
  result.summary.completions[0].missionId = 'C99';
  result.sessionAwards[0].xp = 90000;
  assert.equal(store.summary().totalXP, 30);
  assert.equal(store.summary().completions[0].missionId, 'C01');
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('./life-experience'), 'utf8'), context);
  assert.equal(typeof context.LumaLifeExperience.createStore, 'function');
  assert.equal(context.LumaLifeExperience.LEVEL_XP, Life.LEVEL_XP);
});

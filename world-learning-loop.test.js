const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Learning = require('./learning-evidence');
const World = require('./world-learning-loop');

function fixture() {
  let clock = new Date(2026, 8, 23, 12).getTime();
  let serial = 0;
  const values = new Map();
  const store = Learning.createStore({ getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value) }, { now: () => clock });
  return { store, now: () => clock,
    advance(ms) { clock += ms; },
    plan(options = {}) { return World.plan(store.getProfile(), { now: clock, ...options }); },
    session(sceneId = 'coffee', overrides = {}) {
      clock += 1000;
      return store.beginSession({ sceneId, mode: 'guided', missionId: sceneId === 'coffee' ? 'C01' : null,
        variantId: sceneId === 'coffee' ? 'C01-free-choice' : null, promptModality: 'audio-text', ...overrides });
    },
    answer(sessionId, overrides = {}, help = null) {
      const session = store.getProfile().sessions.find(item => item.id === sessionId);
      const data = { id: `answer-${++serial}`, sessionId, sceneId: session.sceneId,
        taskId: session.sceneId === 'coffee' ? 'coffee-order' : 'breakfast-drink', targetId: 'choose-drink',
        source: 'voice', language: 'en', supportLevel: 0, conditionsTracked: true,
        outcome: 'success', ...overrides };
      if (help) store.recordExposure({ sessionId, sceneId: session.sceneId, taskId: data.taskId,
        targetId: data.targetId, kind: help });
      return store.recordAttempt(data);
    },
    complete(id) { const session = store.getProfile().sessions.find(item => item.id === id);
      return store.completeSession({ id, sceneId: session.sceneId }); },
  };
}

test('fresh learner starts a guided C01 coffee mission, without locks or invented mastery', () => {
  const f = fixture();
  const result = f.plan();
  assert.equal(result.kind, 'start');
  assert.equal(result.sceneId, 'coffee');
  assert.equal(result.missionId, 'C01');
  assert.equal(result.mode, 'guided');
  assert.equal(result.available, true);
  assert.equal(result.optional, true);
  assert.doesNotMatch(JSON.stringify(result), /掌握|\d+%/);
});

test('completed assisted coffee offers optional same-mission listening and a real breakfast alternative', () => {
  const f = fixture();
  const id = f.session('coffee', { missionId: 'C02', variantId: 'C02-small-latte-to-go' });
  f.answer(id, { supportLevel: 3 }, 'full-example');
  f.complete(id);
  const result = f.plan();
  assert.equal(result.kind, 'retry');
  assert.equal(result.mode, 'listening');
  assert.equal(result.missionId, 'C02');
  assert.equal(result.variantId, 'C02-small-latte-to-go');
  assert.equal(result.alternative.sceneId, 'kitchen');
  assert.match(result.alternative.title, /回到家/);
  assert.doesNotMatch(result.alternative.title, /早餐店|餐厅/);
});

test('independent drink expression can go directly to the home transfer, even when subtitles helped listening', () => {
  const f = fixture();
  const id = f.session();
  const attempt = f.answer(id, {}, 'subtitles');
  assert.equal(attempt.productionCondition, 'independent');
  assert.equal(attempt.listeningCondition, 'assisted');
  f.complete(id);
  assert.equal(f.plan().kind, 'transfer');
  assert.equal(f.plan().sceneId, 'kitchen');
  assert.deepEqual(f.plan().targetIds, ['choose-drink']);
});

test('an assisted listening retry also leads onward, without an endless pass requirement', () => {
  const f = fixture();
  const first = f.session();
  f.answer(first, { supportLevel: 3 }, 'full-example');
  f.complete(first);
  const retry = f.session('coffee', { mode: 'listening' });
  f.answer(retry, { supportLevel: 3 }, 'full-example');
  f.complete(retry);
  assert.equal(f.plan().kind, 'transfer');
});

test('an independent answer from an unfinished session does not skip the ongoing task', () => {
  const f = fixture();
  const id = f.session();
  f.answer(id);
  f.store.saveCheckpoint({ sessionId: id, sceneId: 'coffee', missionId: 'C01', taskIndex: 2, practiceMode: 'guided' });
  const next = f.plan();
  assert.equal(next.kind, 'resume');
  assert.equal(next.taskIndex, 0);
  assert.equal(next.sessionId, id);
});

test('current mission takes precedence over due review and preserves its variant and mode', () => {
  const f = fixture();
  const earlier = f.session();
  f.answer(earlier);
  f.complete(earlier);
  f.advance(86400000);
  const id = f.session('coffee', { missionId: 'C04', variantId: 'C04-small-americano-here', mode: 'listening' });
  f.store.saveCheckpoint({ sessionId: id, sceneId: 'coffee', missionId: 'C04',
    variantId: 'C04-small-americano-here', taskIndex: 3, practiceMode: 'listening' });
  const next = f.plan();
  assert.equal(next.kind, 'resume');
  assert.equal(next.missionId, 'C04');
  assert.equal(next.variantId, 'C04-small-americano-here');
  assert.equal(next.mode, 'listening');
  assert.equal(f.plan({ checkpoint: null }).kind, 'review');
});

test('due review outranks a new episode with exact original task and mission metadata', () => {
  const f = fixture();
  const id = f.session('coffee', { missionId: 'C03', variantId: 'C03-wrong-large' });
  f.answer(id, { taskId: 'coffee-size', targetId: 'choose-size' });
  f.complete(id);
  f.advance(86400000);
  const next = f.plan();
  assert.equal(next.kind, 'review');
  assert.equal(next.sceneId, 'coffee');
  assert.equal(next.missionId, 'C03');
  assert.equal(next.variantId, 'C03-wrong-large');
  assert.equal(next.taskId, 'coffee-size');
  assert.deepEqual(next.targetIds, ['choose-size']);
  assert.equal(next.reviewItems[0].missionId, 'C03');
});

test('review becomes due at the configured next local day and assisted review advances the schedule', () => {
  const f = fixture();
  const id = f.session();
  f.answer(id, { supportLevel: 3 }, 'full-example');
  f.complete(id);
  const due = Date.parse(f.store.getReviewQueue()[0].dueAt);
  assert.equal(World.plan(f.store.getProfile(), { now: due - 1 }).kind, 'retry');
  assert.equal(World.plan(f.store.getProfile(), { now: due }).kind, 'review');
  f.advance(due - f.now() + 3600000);
  const replay = f.session('coffee', { mode: 'listening' });
  f.answer(replay, { supportLevel: 3 }, 'full-example');
  f.complete(replay);
  assert.equal(f.plan().kind, 'transfer');
  assert.equal(f.store.summary().independentProductionCount, 0);
});

test('home breakfast completion suggests a next-day cafe return without a time gate', () => {
  const f = fixture();
  const coffee = f.session('coffee', { missionId: 'C02', variantId: 'C02-small-latte-to-go' });
  f.answer(coffee);
  f.complete(coffee);
  const kitchen = f.session('kitchen');
  f.answer(kitchen);
  f.complete(kitchen);
  const next = f.plan();
  assert.equal(next.kind, 'return');
  assert.equal(next.sceneId, 'coffee');
  assert.equal(next.missionId, 'C02');
  assert.equal(next.available, true);
  assert.ok(Date.parse(next.dueAt) > f.now());
  assert.match(next.reason, /现在想练/);
});

test('untracked historical success cannot masquerade as independent production or listening', () => {
  const f = fixture();
  const id = f.session();
  f.answer(id, { conditionsTracked: null, supportLevel: null, productionCondition: 'independent' });
  f.complete(id);
  assert.equal(f.plan().kind, 'retry');
  assert.equal(f.plan().mode, 'guided');
  const actual = World.summary(f.store.getProfile(), { sessionId: id, now: f.now() });
  assert.equal(actual.independentProductionCount, 0);
  assert.equal(actual.independentListeningCount, 0);
  assert.equal(actual.unknownProductionCount, 1);
  assert.match(actual.lines.join(''), /尚未确认/);
});

test('Chinese, text and taps never turn into oral independence', () => {
  for (const overrides of [{ language: 'zh' }, { source: 'text' }, { source: 'tap' }]) {
    const f = fixture();
    const id = f.session();
    f.answer(id, overrides);
    f.complete(id);
    assert.equal(f.plan().kind, 'retry');
    assert.equal(f.plan().mode, 'guided');
    assert.equal(World.summary(f.store.getProfile(), { now: f.now() }).independentProductionCount, 0);
  }
});

test('technical errors are excluded from help focus and independent-success counts', () => {
  const f = fixture();
  const id = f.session();
  f.answer(id, { outcome: 'technical-error', supportLevel: 3 }, 'full-example');
  f.complete(id);
  const summary = World.summary(f.store.getProfile(), { now: f.now(), sessionId: id });
  assert.equal(summary.successCount, 0);
  assert.equal(summary.technicalErrorCount, 1);
  assert.equal(summary.independentProductionCount, 0);
  assert.deepEqual(summary.helpKinds, []);
  assert.equal(World.focus(f.store.getProfile(), { now: f.now(), sessionId: id }), null);
  assert.equal(f.plan().mode, 'guided');
  assert.doesNotMatch(f.plan().reason, /没学会|说错|薄弱|能力不足/);
});

test('an empty or unknown listening session does not raise difficulty or bypass into transfer', () => {
  const f = fixture();
  const id = f.session('coffee', { mode: 'listening' });
  f.complete(id);
  assert.equal(f.plan().kind, 'retry');
  assert.equal(f.plan().mode, 'guided');
  f.answer(id, { conditionsTracked: null, supportLevel: null });
  assert.equal(f.plan().kind, 'retry');
  assert.equal(f.plan().mode, 'guided');
});

test('the C03 optional scaffold teaches repair and preserves the originally requested small cup', () => {
  const f = fixture();
  const id = f.session('coffee', { missionId: 'C03', variantId: 'C03-wrong-large' });
  f.answer(id, { taskId: 'coffee-size', targetId: 'choose-size', supportLevel: 3 }, 'full-example');
  f.complete(id);
  const focus = World.focus(f.store.getProfile(), { now: f.now(), sessionId: id });
  assert.equal(focus.example, 'Sorry, I ordered a small.');
  assert.deepEqual(f.plan().targetIds, ['choose-size']);
});

test('focus selects the most helped successful target and respects C04 order facts', () => {
  const f = fixture();
  const id = f.session('coffee', { missionId: 'C04', variantId: 'C04-large-americano-here' });
  f.answer(id, { supportLevel: 1 }, 'subtitles');
  f.answer(id, { taskId: 'coffee-size', targetId: 'choose-size', supportLevel: 3 }, 'full-example');
  f.complete(id);
  const focus = World.focus(f.store.getProfile(), { now: f.now(), sessionId: id });
  assert.equal(focus.targetId, 'choose-size');
  assert.equal(focus.example, 'Large, please.');
  assert.equal(focus.missionId, 'C04');
  assert.equal(focus.variantId, 'C04-large-americano-here');
  assert.match(focus.reason, /完整示范/);
  assert.doesNotMatch(focus.reason, /语法|错误|不会/);
  assert.equal(focus.optional, true);
});

test('focus can be skipped entirely for an unassisted session, and uses home breakfast vocabulary', () => {
  const f = fixture();
  const coffee = f.session('coffee', { promptModality: 'audio' });
  f.answer(coffee);
  f.complete(coffee);
  assert.equal(World.focus(f.store.getProfile(), { now: f.now(), sessionId: coffee }), null);
  const kitchen = f.session('kitchen');
  f.answer(kitchen, { supportLevel: 3 }, 'full-example');
  f.complete(kitchen);
  const focus = World.focus(f.store.getProfile(), { now: f.now() });
  assert.equal(focus.sceneId, 'kitchen');
  assert.equal(focus.missionId, null);
  assert.equal(focus.example, 'Milk, please.');
});

test('an unrelated scene exposure is not fabricated into a helped-target lesson', () => {
  const f = fixture();
  const id = f.session('coffee', { promptModality: 'audio' });
  f.answer(id, {}, 'scene-entered');
  f.complete(id);
  assert.equal(World.focus(f.store.getProfile(), { now: f.now(), sessionId: id }), null);
});

test('future evidence does not move today into a completed story or create an ability claim', () => {
  const f = fixture();
  const now = f.now();
  f.advance(86400000);
  const id = f.session('kitchen');
  f.answer(id);
  f.complete(id);
  assert.equal(World.plan(f.store.getProfile(), { now }).kind, 'start');
  assert.equal(World.summary(f.store.getProfile(), { now }).successCount, 0);
});

test('completed mission-only history is preserved without creating capability evidence', () => {
  const f = fixture();
  const next = f.plan({ completedMissions: ['C01', 'C02', 'invalid'] });
  assert.equal(next.missionId, 'C02');
  assert.equal(next.mode, 'guided');
  assert.match(next.reason, /保留/);
  assert.equal(World.summary(f.store.getProfile(), { now: f.now() }).successCount, 0);
});

test('planning is deterministic, does not mutate its inputs and tolerates missing records', () => {
  const f = fixture();
  const id = f.session();
  f.answer(id, { supportLevel: 2 }, 'keyword');
  f.complete(id);
  const profile = f.store.getProfile();
  const original = structuredClone(profile);
  const first = World.plan(profile, { now: f.now() });
  assert.deepEqual(World.plan(profile, { now: f.now() }), first);
  assert.deepEqual(profile, original);
  assert.equal(World.plan(null, { now: f.now() }).sceneId, 'coffee');
  assert.equal(World.plan({ version: 1, sessions: 'broken' }, { now: f.now() }).kind, 'start');
});

test('the same pure API is usable in the browser without DOM or storage side effects', () => {
  const browser = {};
  for (const file of ['./learning-evidence', './coffee', './world-learning-loop'])
    vm.runInNewContext(fs.readFileSync(require.resolve(file), 'utf8'), browser);
  assert.equal(typeof browser.LumaWorldLoop.plan, 'function');
  assert.equal(browser.LumaWorldLoop.plan(null, { now: new Date(2026, 8, 23).getTime() }).missionId, 'C01');
});

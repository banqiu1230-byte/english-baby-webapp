const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Memory = require('./scene-memory');
const Coffee = require('./coffee');

function visit(overrides = {}) {
  const sessionId = overrides.sessionId || 'visit-1';
  return {
    sessionId, sceneId: 'coffee', endedAt: '2026-09-24T03:00:00.000Z',
    order: { drink: 'latte', size: 'small', service: 'here' },
    evidence: { completed: true, attempts: ['choose-drink', 'choose-size', 'choose-service'].map(targetId => ({
      id: `${sessionId}:${targetId}`, sessionId, sceneId: 'coffee', targetId,
      source: 'voice', outcome: 'success',
    })) },
    ...overrides,
  };
}

test('the pure module works in CommonJS and the browser without storage or side effects', () => {
  const browser = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('./scene-memory'), 'utf8'), browser);
  assert.equal(browser.LumaSceneMemory.STORAGE_KEY, Memory.STORAGE_KEY);
  assert.equal(typeof browser.LumaSceneMemory.record, 'function');
  assert.equal(JSON.stringify(browser.LumaSceneMemory.normalize(null)), JSON.stringify(Memory.normalize(null)));
});

test('only a completed order with voice confirmation for all actual fields is remembered', () => {
  const input = visit();
  const result = Memory.record(null, input);
  assert.equal(result.visits.length, 1);
  assert.deepEqual(result.visits[0].order, input.order);
  assert.deepEqual(Memory.lastVisit(JSON.stringify(result)), result.visits[0]);
  assert.equal(Memory.lastVisit(result, { sceneId: 'kitchen' }), null);
  assert.equal(Memory.lastVisit(result, { excludeSessionId: input.sessionId }), null);
});

for (const outcome of ['unconfirmed', 'technical-error', undefined]) {
  test(`${outcome || 'missing'} outcomes cannot create remembered visits`, () => {
    const input = visit();
    input.evidence.attempts[0].outcome = outcome;
    assert.equal(Memory.record(null, input).visits.length, 0);
  });
}

for (const source of ['tap', 'drag', 'text', undefined]) {
  test(`${source || 'missing'} source cannot be misrepresented as a spoken order`, () => {
    const input = visit();
    input.evidence.attempts[0].source = source;
    assert.equal(Memory.record(null, input).visits.length, 0);
  });
}

test('incomplete, seeded, synthetic, and cross-session records are not visit evidence', () => {
  const uncompleted = visit(); uncompleted.evidence.completed = false;
  const noEvidence = visit(); delete noEvidence.evidence;
  const fixture = visit(); fixture.evidence.attempts = [];
  const synthetic = visit(); synthetic.evidence.attempts[0].synthetic = true;
  const seededRepair = visit({ order: Coffee.missionInitial('C03') });
  seededRepair.evidence.attempts = seededRepair.evidence.attempts.filter(item => item.targetId !== 'choose-drink');
  const unrelated = visit(); unrelated.evidence.attempts[0].sessionId = 'other-session';
  const otherScene = visit(); otherScene.evidence.attempts[0].sceneId = 'kitchen';
  const wrongTarget = visit(); wrongTarget.evidence.attempts[0].targetId = 'thank-person';
  for (const input of [uncompleted, noEvidence, fixture, synthetic, seededRepair, unrelated, otherScene, wrongTarget])
    assert.equal(Memory.record(null, input).visits.length, 0);
});

test('the actual order wins over a suggested target and no freeform statements are stored', () => {
  const input = visit({ order: { drink: 'americano', size: 'large', service: 'here',
    target: { drink: 'latte', size: 'small', service: 'to-go' }, preference: 'loves cappuccino' },
    transcript: 'secret user words', name: 'someone', menu: 'cappuccino' });
  input.evidence.attempts[0].answer = 'A large americano.';
  const saved = Memory.record(null, input);
  assert.deepEqual(saved.visits[0].order, { drink: 'americano', size: 'large', service: 'here' });
  assert.doesNotMatch(JSON.stringify(saved), /preference|cappuccino|secret user words|answer|someone/);
});

test('unknown values, absent fields, invalid dates, scenes, and ids are rejected', () => {
  for (const patch of [
    { order: { drink: 'cappuccino', size: 'small', service: 'here' } },
    { order: { drink: 'latte', size: 'medium', service: 'here' } },
    { order: { drink: 'latte', size: 'small', service: 'delivery' } },
    { order: { drink: 'latte', size: null, service: 'here' } },
    { endedAt: 'invalid' }, { endedAt: null }, { endedAt: '' }, { endedAt: Infinity },
    { sessionId: '' }, { sceneId: 'airport' }, { sessionId: 'a'.repeat(201) },
  ]) assert.equal(Memory.record(null, visit(patch)).visits.length, 0, JSON.stringify(patch));
});

test('a repeated callback is idempotent and a delayed older callback cannot undo a correction', () => {
  const first = Memory.record(null, visit());
  assert.deepEqual(Memory.record(first, visit()), first);
  const updated = Memory.record(first, visit({ endedAt: '2026-09-24T03:01:00.000Z',
    order: { drink: 'americano', size: 'small', service: 'here' } }));
  assert.equal(updated.visits.length, 1);
  assert.equal(Memory.lastVisit(updated).order.drink, 'americano');
  assert.deepEqual(Memory.record(updated, visit()), updated);
});

test('history is bounded and lastVisit can exclude this session and future visits', () => {
  let saved = Memory.normalize(null);
  for (let i = 0; i < 11; i++) saved = Memory.record(saved, visit({ sessionId: `visit-${i}`,
    endedAt: new Date(Date.UTC(2026, 8, 1 + i)).toISOString() }));
  assert.equal(saved.visits.length, Memory.MAX_VISITS);
  assert.equal(saved.visits[0].sessionId, 'visit-3');
  assert.equal(Memory.lastVisit(saved).sessionId, 'visit-10');
  assert.equal(Memory.lastVisit(saved, { excludeSessionId: 'visit-10' }).sessionId, 'visit-9');
  assert.equal(Memory.lastVisit(saved, { before: '2026-09-10T00:00:00Z' }).sessionId, 'visit-8');
  assert.equal(Memory.lastVisit(saved, { before: 'invalid' }), null);
});

test('malformed storage stays empty and normalized storage is detached from callers', () => {
  for (const raw of [null, undefined, 'oops', 'null', [], { visits: [visit()] }, { version: 20, visits: [visit()] }])
    assert.deepEqual(Memory.normalize(raw), { version: Memory.VERSION, visits: [] });
  const raw = { version: Memory.VERSION, visits: [visit(), visit(), null, {}] };
  const normalized = Memory.normalize(raw);
  assert.equal(normalized.visits.length, 1);
  normalized.visits[0].order.drink = 'americano';
  normalized.visits[0].evidence.attempts[0].id = 'changed';
  assert.equal(raw.visits[0].order.drink, 'latte');
  assert.notEqual(raw.visits[0].evidence.attempts[0].id, 'changed');
});

for (const drink of ['latte', 'americano']) {
  test(`return greeting mentions a real ${drink} visit and yes confirms only today's drink`, () => {
    const record = visit({ order: { drink, size: 'small', service: 'here' } });
    const greeting = Memory.returnGreeting(record);
    assert.match(greeting, /Welcome back! Last time you had/);
    assert.doesNotMatch(greeting, /favorite|usual|always|already|ordered|small|for here/);
    const today = Coffee.missionInitial('C01');
    const before = JSON.stringify(today);
    assert.equal(Coffee.replyViolatesScene(greeting), false);
    assert.equal(Coffee.confirmationChoice('coffee-order', 'Yes, please.', greeting, today), drink);
    assert.equal(JSON.stringify(today), before, 'looking up memory never places an order');
    const confirmed = Coffee.advanceMission(today, 'Yes, please.', { question: greeting });
    assert.equal(confirmed.world.drink, drink);
    assert.equal(confirmed.world.size, null);
    assert.equal(confirmed.world.service, null);
    const declined = Coffee.advanceMission(today, 'No.', { question: greeting });
    assert.equal(declined.world.drink, null);
    assert.equal(Memory.returnGreeting({ order: record.order }), '');
  });
}

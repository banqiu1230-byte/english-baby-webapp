const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Learning = require('./learning-evidence');

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] || null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
}

function setup(storage = memoryStorage()) {
  let current = new Date(2026, 8, 7, 12).getTime();
  const now = () => current;
  const store = Learning.createStore(storage, { now });
  const sessionId = store.beginSession({ sceneId: 'kitchen', mode: 'guided' });
  const record = (overrides = {}) => store.recordAttempt({
    id: 'answer-1', sessionId, sceneId: 'kitchen', taskId: 'breakfast-drink', targetId: 'choose-drink',
    source: 'voice', language: 'en', supportLevel: 0, conditionsTracked: true,
    challengeType: 'independent', promptModality: 'audio', outcome: 'success', ...overrides,
  });
  return { store, storage, sessionId, record, now,
    date(day, hour = 12) { current = new Date(2026, 8, day, hour).getTime(); } };
}

test('the same API loads through CommonJS and as window.LumaLearning without browser effects', () => {
  const browser = {};
  browser.window = browser;
  vm.runInNewContext(fs.readFileSync(require.resolve('./learning-evidence'), 'utf8'), browser);
  assert.equal(typeof browser.window.LumaLearning.createStore, 'function');
  assert.equal(browser.LumaLearning.STORAGE_KEY, Learning.STORAGE_KEY);
  assert.equal(browser.LumaLearning.EVIDENCE_VERSION, 2);
  assert.deepEqual(Learning.REVIEW_INTERVAL_DAYS, [1, 3, 7]);
});

test('mission, variant, challenge, and prompt metadata are kept on each attempt', () => {
  const storage = memoryStorage();
  const store = Learning.createStore(storage);
  const sessionId = store.beginSession({
    sceneId: 'coffee', mode: 'listening', missionId: 'coffee-c04', variantId: 'variant-b',
    challengeType: 'transfer', promptModality: 'audio',
  });
  const attempt = store.recordAttempt({
    id: 'metadata-attempt', sessionId, sceneId: 'coffee', taskId: 'coffee-order', targetId: 'choose-drink',
    source: 'voice', language: 'en', supportLevel: 0, conditionsTracked: true, outcome: 'success',
  });
  assert.equal(attempt.missionId, 'coffee-c04');
  assert.equal(attempt.variantId, 'variant-b');
  assert.equal(attempt.challengeType, 'transfer');
  assert.equal(attempt.promptModality, 'audio');
  assert.equal(attempt.productionCondition, 'independent');
  assert.equal(attempt.listeningCondition, 'independent');
});

test('subtitles affect listening evidence only unless they reveal the target answer', () => {
  const plain = setup();
  plain.store.recordExposure({
    id: 'prompt-subtitles', sessionId: plain.sessionId, sceneId: 'kitchen',
    taskId: 'breakfast-drink', targetId: 'choose-drink', kind: 'subtitles',
    revealsTargetAnswer: false,
  });
  const spoken = plain.record();
  assert.deepEqual(spoken.exposureKinds, ['subtitles']);
  assert.equal(spoken.productionCondition, 'independent');
  assert.equal(spoken.listeningCondition, 'assisted');
  assert.equal(plain.store.summary().independentProductionCount, 1);
  assert.equal(plain.store.summary().independentListeningCount, 0);

  const revealing = setup();
  revealing.store.recordExposure({
    id: 'answer-subtitles', sessionId: revealing.sessionId, sceneId: 'kitchen',
    taskId: 'breakfast-drink', targetId: 'choose-drink', kind: 'subtitles',
    revealsTargetAnswer: true,
  });
  const copied = revealing.record();
  assert.equal(copied.productionCondition, 'assisted');
  assert.equal(copied.listeningCondition, 'assisted');
  assert.equal(revealing.store.summary().independentCount, 0);
});

test('a full model answer blocks independent oral production for that attempt even after it is hidden', () => {
  const f = setup();
  const exposure = f.store.recordExposure({
    sessionId: f.sessionId, sceneId: 'kitchen', taskId: 'breakfast-drink',
    targetId: 'choose-drink', kind: 'full-example', revealsTargetAnswer: true,
  });
  const attempt = f.record();
  assert.equal(attempt.productionCondition, 'assisted');
  assert.deepEqual(attempt.exposureIds, [exposure.id]);
  assert.equal(attempt.exposureEvents[0].revealsTargetAnswer, true);
  assert.equal(f.store.getAttemptEvidence(attempt.id).exposures[0].kind, 'full-example');
  assert.equal(f.store.summary().independentCount, 0);
  assert.equal(Learning.createStore(f.storage, { now: f.now }).getAttemptEvidence(attempt.id).productionCondition, 'assisted');
});

test('text can preserve listening conditions but never becomes oral production evidence', () => {
  const f = setup();
  const attempt = f.record({ source: 'text' });
  assert.equal(attempt.productionCondition, 'text');
  assert.equal(attempt.listeningCondition, 'independent');
  assert.equal(f.store.summary().independentProductionCount, 0);
  assert.equal(f.store.summary().independentListeningCount, 1);
});

test('historical attempts without condition fields remain valid but stay unknown', () => {
  const startedAt = new Date(2026, 8, 6, 12).toISOString();
  const storage = memoryStorage({ [Learning.STORAGE_KEY]: JSON.stringify({
    version: 1,
    sessions: [{ id: 'old-session', sceneId: 'kitchen', mode: 'guided', startedAt, completedAt: startedAt }],
    attempts: [{ id: 'old-attempt', sessionId: 'old-session', sceneId: 'kitchen', taskId: 'breakfast-drink',
      targetId: 'choose-drink', source: 'voice', language: 'en', supportLevel: 0, outcome: 'success', at: startedAt }],
  }) });
  const store = Learning.createStore(storage);
  const attempt = store.getProfile().attempts[0];
  assert.equal(attempt.productionCondition, 'unknown');
  assert.equal(attempt.listeningCondition, 'unknown');
  assert.equal(store.summary().independentCount, 0);
  assert.equal(store.summary().unknownProductionConditionCount, 1);
});

test('only confirmed, unaided English voice is independent; modalities and technical outcomes stay separate', () => {
  const { store, record } = setup();
  const cases = [
    {}, { supportLevel: 1 }, { supportLevel: 3 }, { supportLevel: null },
    { language: 'unknown' }, { language: 'mixed' }, { language: 'zh' },
    { source: 'text' }, { source: 'text', language: 'zh' },
    { source: 'tap' }, { source: 'drag', language: 'unknown' },
    { outcome: 'technical-error' }, { outcome: 'unconfirmed' },
  ];
  cases.forEach((entry, index) => record({ id: `answer-${index}`, ...entry }));
  const result = store.summary();
  assert.equal(result.independentCount, 1);
  assert.equal(result.independentTargetCount, 1);
  assert.equal(result.assistedCount, 2);
  assert.equal(result.unknownSupportCount, 1);
  assert.equal(result.voiceEnglishCount, 4);
  assert.equal(result.textCount, 2);
  assert.equal(result.chineseCount, 3);
  assert.equal(result.actionCount, 2);
  assert.equal(result.technicalErrorCount, 1);
  assert.equal(result.unconfirmedCount, 1);
  assert.equal(result.transferCount, 0);
});

test('omitted, invalid, or unknown support never defaults to independent evidence', () => {
  const { store, record } = setup();
  [undefined, null, -1, 4, false, '0'].forEach((supportLevel, index) => record({ id: String(index), supportLevel }));
  record({ id: 'unknown-language', language: 'not-a-language' });
  assert.equal(store.summary().independentCount, 0);
  assert.equal(store.summary().unknownSupportCount, 6);
});

test('one attempt ID is idempotent and late corrections revise evidence without moving its occurrence date', () => {
  const fixture = setup();
  const first = fixture.record({ outcome: 'unconfirmed' });
  fixture.record({ outcome: 'unconfirmed' });
  assert.equal(fixture.store.summary().unconfirmedCount, 1);
  fixture.store.completeSession({ id: fixture.sessionId, sceneId: 'kitchen' });
  fixture.date(8);
  const revision = fixture.record({ at: fixture.now() });
  assert.equal(revision.at, first.at);
  assert.equal(fixture.store.summary().independentCount, 1);
  assert.equal(fixture.store.summary().unconfirmedCount, 0);
  assert.equal(fixture.store.summary().dueCount, 1);
  fixture.record({ outcome: 'technical-error' });
  assert.equal(fixture.store.summary().independentCount, 0);
  assert.equal(fixture.store.summary().dueCount, 0);
  assert.equal(fixture.store.summary().technicalErrorCount, 1);
  assert.equal(fixture.store.getProfile().attempts.length, 1);
});

test('a late answer cannot reuse an ID for another task, target, scene, or session', () => {
  const { store, record } = setup();
  const original = record();
  const another = store.beginSession({ sceneId: 'airport' });
  assert.equal(record({ taskId: 'breakfast-more' }), null);
  assert.equal(record({ targetId: 'request-more' }), null);
  assert.equal(record({ sceneId: 'airport' }), null);
  assert.equal(record({ sessionId: another, sceneId: 'airport' }), null);
  assert.deepEqual(store.getProfile().attempts, [original]);
});

test('review becomes due on the next local date; same-day or early practice does not accelerate intervals', () => {
  const f = setup();
  f.record();
  f.record({ id: 'same-day' });
  assert.equal(f.store.summary().dueCount, 0);
  f.date(8, 0);
  assert.equal(f.store.nextStep().kind, 'review');
  assert.deepEqual(f.store.nextStep().targetIds, ['choose-drink']);
  f.record({ id: 'first-review' });
  f.date(9);
  f.record({ id: 'early-repeat' });
  f.date(10);
  assert.equal(f.store.summary().dueCount, 0);
  f.date(11, 0);
  assert.equal(f.store.summary().dueCount, 1);
  f.record({ id: 'second-review' });
  f.date(17);
  assert.equal(f.store.summary().dueCount, 0);
  f.date(18, 0);
  assert.equal(f.store.summary().dueCount, 1);
});

test('review queue and target evidence are immutable snapshots of derived records', () => {
  const f = setup();
  f.record();
  const queue = f.store.getReviewQueue();
  const targets = f.store.getTargetEvidence();
  assert.deepEqual(queue.map(item => item.targetId), ['choose-drink']);
  assert.deepEqual(targets, [{
    targetId: 'choose-drink', sceneIds: ['kitchen'], independentCount: 1,
    lastIndependentAt: targets[0].lastIndependentAt, lastSceneId: 'kitchen',
  }]);

  queue[0].targetId = 'tampered';
  queue.push({ targetId: 'invented' });
  targets[0].sceneIds.push('invented');
  targets[0].independentCount = 99;

  assert.equal(f.store.getReviewQueue()[0].targetId, 'choose-drink');
  assert.equal(f.store.getReviewQueue().length, 1);
  assert.deepEqual(f.store.getTargetEvidence()[0].sceneIds, ['kitchen']);
  assert.equal(f.store.getTargetEvidence()[0].independentCount, 1);
});

test('a successful due review counts as practiced even with help while independent evidence stays unchanged', () => {
  const f = setup();
  f.record();
  f.date(8);
  [{ supportLevel: 1 }, { language: 'zh' }, { source: 'text' }, { outcome: 'technical-error' }, { outcome: 'unconfirmed' }]
    .forEach((entry, index) => f.record({ id: `review-${index}`, ...entry }));
  assert.equal(f.store.summary().dueCount, 0);
  assert.equal(f.store.summary().independentCount, 1);
  assert.equal(f.store.getReviewQueue()[0].reviewCount, 1);
  f.date(11, 0);
  assert.equal(f.store.summary().dueCount, 1);
});

test('a beginner who only succeeds with support, Chinese, text, or actions still gets next-day review after reload', () => {
  const cases = [
    { supportLevel: 3 }, { supportLevel: null }, { language: 'zh' }, { language: 'mixed' },
    { language: 'unknown' }, { source: 'text' }, { source: 'text', language: 'zh' },
    { source: 'text', language: 'mixed' }, { source: 'tap', language: 'unknown' },
    { source: 'drag', language: 'unknown' },
  ];
  for (const example of cases) {
    const f = setup();
    f.record(example);
    f.store.completeSession({ id: f.sessionId, sceneId: 'kitchen' });
    assert.equal(f.store.summary().dueCount, 0);
    assert.equal(f.store.summary().independentCount, 0);
    f.date(8, 0);
    const reloaded = Learning.createStore(f.storage, { now: f.now });
    assert.equal(reloaded.summary().dueCount, 1, JSON.stringify(example));
    assert.equal(reloaded.summary().independentTargetCount, 0);
    assert.equal(reloaded.summary().transferCount, 0);
    assert.equal(reloaded.nextStep().kind, 'review');
    assert.equal(reloaded.nextStep().sceneId, 'kitchen');
    assert.deepEqual(reloaded.nextStep().targetIds, ['choose-drink']);
  }
});

test('supported review clears todays practice debt and schedules later practice without inventing independence', () => {
  const f = setup();
  f.record({ supportLevel: 3 });
  f.date(8);
  f.record({ id: 'supported-review', supportLevel: 1 });
  assert.equal(f.store.summary().dueCount, 0);
  assert.equal(f.store.summary().independentCount, 0);
  assert.equal(f.store.getReviewQueue()[0].reviewCount, 1);
  f.date(10, 23);
  assert.equal(f.store.summary().dueCount, 0);
  f.date(11, 0);
  assert.equal(f.store.summary().dueCount, 1);
  f.record({ id: 'second-supported-review', supportLevel: 2 });
  assert.equal(f.store.summary().independentCount, 0);
  assert.equal(f.store.getReviewQueue()[0].reviewCount, 2);
  f.date(17, 23);
  assert.equal(f.store.summary().dueCount, 0);
  f.date(18, 0);
  assert.equal(f.store.summary().dueCount, 1);
});

test('failed or unconfirmed input alone creates no review, but a late supported-success correction does', () => {
  const f = setup();
  f.record({ outcome: 'unconfirmed', supportLevel: 2 });
  f.record({ id: 'technical-failure', outcome: 'technical-error' });
  f.date(8);
  assert.equal(f.store.summary().dueCount, 0);
  f.record({ supportLevel: 2 });
  assert.equal(f.store.summary().dueCount, 1);
  assert.equal(f.store.summary().independentCount, 0);
  assert.equal(f.store.nextStep().kind, 'review');
});

test('review is deduplicated by target and revising a successful review to unconfirmed reopens it', () => {
  const f = setup();
  f.record({ supportLevel: 3 });
  f.record({ id: 'typed-practice', source: 'text' });
  f.record({ id: 'action-practice', source: 'tap' });
  f.date(8);
  assert.equal(f.store.summary().dueCount, 1);
  f.record({ id: 'review-answer' });
  assert.equal(f.store.summary().dueCount, 0);
  f.record({ id: 'review-answer', supportLevel: 3, outcome: 'unconfirmed' });
  assert.equal(f.store.summary().dueCount, 1);
  assert.equal(f.store.summary().independentCount, 0);
  assert.equal(f.store.summary().transferCount, 0);
});

test('retention evidence uses the configured elapsed interval instead of a universal fixed delay', () => {
  const f = setup();
  const prior = f.record({ id: 'retention-prior' });
  f.date(8, 12);
  const current = f.record({ id: 'retention-current', challengeType: 'retention', retentionCheck: {
    priorAttemptId: prior.id, minimumElapsedMs: 12 * 60 * 60 * 1000, dimension: 'production',
  } });
  const qualified = f.store.getAttemptEvidence(current.id).retention;
  assert.equal(qualified.actualElapsedMs, 24 * 60 * 60 * 1000);
  assert.equal(qualified.minimumElapsedMs, 12 * 60 * 60 * 1000);
  assert.equal(qualified.interveningRelearn, false);
  assert.equal(qualified.status, 'qualified');
  assert.equal(f.store.summary().retentionEvidenceCount, 1);

  const stricter = f.store.assessRetention({
    attemptId: current.id, priorAttemptId: prior.id,
    minimumElapsedMs: 48 * 60 * 60 * 1000, dimension: 'production',
  });
  assert.equal(stricter.actualElapsedMs, qualified.actualElapsedMs);
  assert.equal(stricter.status, 'too-soon');
});

test('intervening target relearning is reported and cannot become delayed retention evidence', () => {
  const f = setup();
  const prior = f.record({ id: 'retention-prior' });
  f.date(8);
  const relearnSession = f.store.beginSession({ sceneId: 'coffee', mode: 'guided' });
  const relearn = f.store.recordExposure({
    id: 'intervening-example', sessionId: relearnSession, sceneId: 'coffee', taskId: 'coffee-order',
    targetId: 'choose-drink', kind: 'full-example', revealsTargetAnswer: true,
  });
  f.date(10);
  const testSession = f.store.beginSession({ sceneId: 'airport', mode: 'listening' });
  const current = f.record({
    id: 'retention-current', sessionId: testSession, sceneId: 'airport', taskId: 'airport-drink',
    challengeType: 'retention', promptModality: 'audio', retentionCheck: {
      priorAttemptId: prior.id, minimumElapsedMs: 24 * 60 * 60 * 1000, dimension: 'production',
    },
  });
  const evidence = f.store.getAttemptEvidence(current.id).retention;
  assert.equal(evidence.actualElapsedMs, 3 * 24 * 60 * 60 * 1000);
  assert.equal(evidence.interveningRelearn, true);
  assert.deepEqual(evidence.interveningExposureIds, [relearn.id]);
  assert.equal(evidence.status, 'intervening-relearn');
  assert.equal(f.store.summary().retentionEvidenceCount, 0);
});

test('transfer requires independent evidence for the same target in different scenes and stays bounded', () => {
  const f = setup();
  f.record();
  const airport = f.store.beginSession({ sceneId: 'airport' });
  const transfer = { id: 'airport-answer', sessionId: airport, sceneId: 'airport', taskId: 'airport-drink' };
  f.record({ ...transfer, source: 'text' });
  assert.equal(f.store.summary().transferCount, 0);
  f.record(transfer);
  f.record({ ...transfer, id: 'airport-repeat' });
  f.record({ ...transfer, id: 'different-target', targetId: 'show-ticket' });
  const office = f.store.beginSession({ sceneId: 'office' });
  f.record({ id: 'office-answer', sessionId: office, sceneId: 'office', taskId: 'office-drink' });
  assert.equal(f.store.summary().transferCount, 1);
  // Correcting all other-scene evidence also corrects the derived transfer claim.
  f.record({ ...transfer, supportLevel: 2 });
  f.record({ ...transfer, id: 'airport-repeat', supportLevel: null });
  f.record({ id: 'office-answer', sessionId: office, sceneId: 'office', taskId: 'office-drink', outcome: 'unconfirmed' });
  assert.equal(f.store.summary().transferCount, 0);
});

test('session completion is idempotent and today counts do not carry into another local day', () => {
  const f = setup();
  assert.equal(f.store.nextStep().kind, 'start');
  const completed = f.store.completeSession({ id: f.sessionId, sceneId: 'kitchen' });
  f.date(8);
  assert.equal(f.store.completeSession({ id: f.sessionId, sceneId: 'kitchen' }).completedAt, completed.completedAt);
  assert.equal(f.store.summary().completedSessions, 1);
  assert.equal(f.store.summary().todayCompletedSessions, 0);
  assert.equal(f.store.summary().independentCount, 0);
  assert.equal(f.store.nextStep().kind, 'continue');
  assert.equal(f.store.nextStep().practiceMode, 'guided');
  assert.notEqual(f.store.beginSession({ sceneId: 'kitchen', resumeId: f.sessionId }), f.sessionId);
});

test('checkpoints restore business state across reload, resume the same session, and take priority over due review', () => {
  const f = setup();
  f.record();
  const checkpoint = f.store.saveCheckpoint({ sessionId: f.sessionId, sceneId: 'kitchen', taskIndex: 1,
    practiceMode: 'guided', breakfast: { drink: 'milk', cupPlaced: false, amount: null },
    coveredGoals: ['breakfast-drink', 'breakfast-drink'], goalRecords: { 'breakfast-drink': { spoke: true, supportLevel: 0 } } });
  checkpoint.goalRecords['breakfast-drink'].spoke = false;
  f.date(8);
  const restored = Learning.createStore(f.storage, { now: f.now });
  assert.equal(restored.getCheckpoint().goalRecords['breakfast-drink'].spoke, true);
  assert.deepEqual(restored.getCheckpoint().coveredGoals, ['breakfast-drink']);
  assert.equal(restored.nextStep().kind, 'resume');
  assert.equal(restored.nextStep().taskIndex, 1);
  assert.equal(restored.beginSession({ sceneId: 'kitchen', resumeId: f.sessionId }), f.sessionId);
  assert.equal(restored.summary().sessionCount, 1);
  restored.completeSession({ id: f.sessionId, sceneId: 'kitchen' });
  assert.equal(restored.getCheckpoint(), null);
  assert.equal(restored.nextStep().kind, 'review');
  assert.equal(Learning.createStore(f.storage, { now: f.now }).getCheckpoint(), null);
});

test('starting another scene preserves both checkpoints and completing one clears only its own progress', () => {
  const f = setup();
  f.store.saveCheckpoint({ sessionId: f.sessionId, sceneId: 'kitchen', taskIndex: 0 });
  const second = f.store.beginSession({ sceneId: 'airport', missionId: 'airport-departure' });
  assert.equal(f.store.getCheckpoint().sessionId, f.sessionId);
  f.store.saveCheckpoint({ sessionId: second, sceneId: 'airport', missionId: 'airport-departure', taskIndex: 1 });

  const restored = Learning.createStore(f.storage, { now: f.now });
  assert.equal(restored.getCheckpoint().sessionId, second);
  assert.equal(restored.getCheckpoint({ sceneId: 'kitchen' }).sessionId, f.sessionId);
  assert.equal(restored.getCheckpoint({ sceneId: 'airport' }).sessionId, second);
  assert.equal(restored.getCheckpoint({ missionId: 'airport-departure' }).sessionId, second);
  assert.equal(restored.getCheckpoints().length, 2);
  restored.completeSession({ id: f.sessionId, sceneId: 'kitchen' });
  assert.equal(restored.getCheckpoint({ sceneId: 'kitchen' }), null);
  assert.equal(restored.getCheckpoint().sessionId, second);
  assert.equal(restored.getCheckpoints().length, 1);
  assert.equal(restored.saveCheckpoint({ sessionId: second, sceneId: 'kitchen', taskIndex: 0 }), null);
  assert.equal(restored.saveCheckpoint({ sessionId: second, sceneId: 'airport', taskIndex: -1 }), null);
});

test('legacy single checkpoints migrate and explicit review bypasses an unrelated saved scene', () => {
  const f = setup();
  f.record({ supportLevel: 2 });
  f.store.saveCheckpoint({ sessionId: f.sessionId, sceneId: 'kitchen', taskIndex: 1 });
  const raw = JSON.parse(f.storage.getItem(Learning.STORAGE_KEY));
  delete raw.checkpoints;
  f.storage.setItem(Learning.STORAGE_KEY, JSON.stringify(raw));
  f.date(8);

  const restored = Learning.createStore(f.storage, { now: f.now });
  assert.equal(restored.getCheckpoints().length, 1);
  assert.equal(restored.nextStep().kind, 'resume');
  const review = restored.nextStep({ preferReview: true });
  assert.equal(review.kind, 'review');
  assert.equal(review.sceneId, 'kitchen');
  assert.equal(review.taskId, 'breakfast-drink');
  assert.deepEqual(review.targetIds, ['choose-drink']);
  assert.deepEqual(review.reviewItems.map(item => item.taskId), ['breakfast-drink']);
});

test('coffee checkpoints survive reload as mission markers without an internal order', () => {
  const f = setup();
  const sessionId = f.store.beginSession({ sceneId: 'coffee' });
  const order = { drink: 'americano', size: 'large', service: 'to-go', received: false };
  const saved = f.store.saveCheckpoint({ sessionId, sceneId: 'coffee', taskIndex: 3, coffee: order,
    coveredGoals: ['coffee-order', 'coffee-size'], goalRecords: { 'coffee-size': { meaningAccepted: true } } });
  order.drink = 'latte';
  assert.deepEqual(Object.keys(saved).sort(),
    ['sessionId', 'sceneId', 'taskIndex', 'practiceMode', 'missionId', 'variantId', 'at'].sort());
  assert.equal(saved.taskIndex, 0);
  assert.equal(saved.missionId, 'C01');
  const restored = Learning.createStore(f.storage, { now: f.now });
  assert.deepEqual(restored.getCheckpoint(), saved);
  assert.equal(restored.nextStep().sceneId, 'coffee');
  assert.equal(restored.nextStep().taskIndex, 0);
  assert.equal(restored.beginSession({ sceneId: 'coffee', resumeId: sessionId }), sessionId);
});

test('coffee mission checkpoints preserve mission and variant, but drop correction and event state', () => {
  const f = setup();
  const sessionId = f.store.beginSession({ sceneId: 'coffee', missionId: 'C03', variantId: 'C03-wrong-large' });
  f.store.saveCheckpoint({ sessionId, sceneId: 'coffee', taskIndex: 1, missionId: 'C03', variantId: 'C03-wrong-large',
    coffee: { missionId: 'C03', variantId: 'C03-wrong-large', drink: 'latte', size: 'small', service: 'to-go',
      received: false, repair: { resolved: true }, revision: 2, appliedEventIds: ['turn-1', 'turn-2', 'turn-2', null] } });
  const restored = Learning.createStore(f.storage, { now: f.now }).getCheckpoint();
  assert.equal(restored.missionId, 'C03');
  assert.equal(restored.variantId, 'C03-wrong-large');
  assert.equal(restored.taskIndex, 0);
  assert.equal(Object.hasOwn(restored, 'coffee'), false);
  assert.equal(Object.hasOwn(restored, 'coveredGoals'), false);
  assert.equal(Object.hasOwn(restored, 'goalRecords'), false);
});

test('coffee checkpoint sanitizing drops every internal choice, including forged ones', () => {
  const f = setup();
  const sessionId = f.store.beginSession({ sceneId: 'coffee' });
  const save = coffee => f.store.saveCheckpoint({ sessionId, sceneId: 'coffee', taskIndex: 0, coffee });
  for (const coffee of [
    { drink: 'tea', size: 'large', service: 'to-go', received: true },
    { drink: 'latte', size: 'small', service: 'here', received: true },
  ]) {
    const marker = save(coffee);
    assert.equal(marker.missionId, 'C01');
    assert.equal(marker.taskIndex, 0);
    assert.equal(Object.hasOwn(marker, 'coffee'), false);
  }
  assert.equal(Object.hasOwn(save(undefined), 'coffee'), false);
  assert.equal(Object.hasOwn(save(null), 'coffee'), false);
  assert.equal(Object.hasOwn(save([]), 'coffee'), false);
});

test('legacy coffee checkpoint data migrates to a mission marker on read', () => {
  const at = new Date(2026, 8, 7, 12).toISOString();
  const sessionId = 'legacy-coffee';
  const storage = memoryStorage({ [Learning.STORAGE_KEY]: JSON.stringify({
    version: 1,
    sessions: [{ id: sessionId, sceneId: 'coffee', mode: 'listening', missionId: 'C04',
      variantId: 'C04-small-americano-here', startedAt: at, completedAt: null }],
    checkpoint: { sessionId, sceneId: 'coffee', taskIndex: 3, practiceMode: 'listening',
      coffee: { missionId: 'C04', variantId: 'C04-small-americano-here', drink: 'americano',
        size: 'small', service: 'here', received: false, revision: 9 },
      coveredGoals: ['coffee-order', 'coffee-size', 'coffee-service'],
      goalRecords: { 'coffee-order': { meaningAccepted: true } }, at },
  }) });
  const marker = Learning.createStore(storage).getCheckpoint();
  assert.deepEqual(marker, { sessionId, sceneId: 'coffee', taskIndex: 0, practiceMode: 'listening',
    missionId: 'C04', variantId: 'C04-small-americano-here', at });
});

test('discardCheckpoint removes only the requested marker and retains practice evidence', () => {
  const f = setup();
  const coffeeSession = f.store.beginSession({ sceneId: 'coffee', missionId: 'C03' });
  f.store.saveCheckpoint({ sessionId: f.sessionId, sceneId: 'kitchen', taskIndex: 1 });
  f.store.saveCheckpoint({ sessionId: coffeeSession, sceneId: 'coffee', missionId: 'C03', taskIndex: 2 });
  f.record();
  assert.equal(f.store.discardCheckpoint({ sessionId: 'missing' }), null);
  const removed = f.store.discardCheckpoint({ sessionId: coffeeSession });
  assert.equal(removed.missionId, 'C03');
  assert.equal(f.store.getCheckpoint({ sceneId: 'coffee' }), null);
  assert.equal(f.store.getCheckpoint().sessionId, f.sessionId);
  assert.equal(f.store.discardCheckpoint({ sessionId: coffeeSession }), null);
  const restored = Learning.createStore(f.storage, { now: f.now });
  assert.equal(restored.getCheckpoint().sessionId, f.sessionId);
  assert.equal(restored.getProfile().sessions.find(item => item.id === coffeeSession).completedAt, null);
  assert.equal(restored.getAttemptEvidence('answer-1').outcome, 'success');
});

test('corrupt or malformed local data is discarded without manufacturing ability or preventing a new session', () => {
  const broken = setup(memoryStorage({ [Learning.STORAGE_KEY]: '{broken JSON' }));
  assert.equal(broken.store.summary().independentCount, 0);
  broken.record();
  assert.equal(broken.store.summary().independentCount, 1);
  const malformed = Learning.createStore(memoryStorage({ [Learning.STORAGE_KEY]: JSON.stringify({
    version: 1, sessions: [null, { id: 'bad', sceneId: 'kitchen', startedAt: 1e100 }],
    attempts: [{ id: 'fake', sessionId: 'bad', supportLevel: 0, source: 'voice', language: 'en', outcome: 'success' }],
    checkpoint: { sessionId: 'bad', sceneId: 'kitchen', taskIndex: 0 },
  }) }));
  assert.equal(malformed.summary().sessionCount, 0);
  assert.equal(malformed.summary().independentCount, 0);
  assert.equal(malformed.getCheckpoint(), null);
});

test('storage denial and quota failure preserve the current session in memory and can recover on a later write', () => {
  const denied = { getItem() { throw Error('SecurityError'); }, setItem() { throw Error('QuotaExceededError'); } };
  const f = setup(denied);
  f.record();
  f.store.saveCheckpoint({ sessionId: f.sessionId, sceneId: 'kitchen', taskIndex: 1 });
  assert.equal(f.store.nextStep().kind, 'resume');
  assert.equal(f.store.summary().independentCount, 1);
  assert.equal(f.store.summary().storageAvailable, false);
  const recovered = memoryStorage();
  denied.setItem = recovered.setItem;
  f.store.completeSession({ id: f.sessionId, sceneId: 'kitchen' });
  assert.equal(f.store.summary().storageAvailable, true);
  assert.equal(Learning.createStore(recovered, { now: f.now }).summary().independentCount, 1);
  assert.equal(Learning.createStore(null).nextStep().kind, 'start');
});

test('old aggregate records remain history and never seed independent, transfer, due, or today evidence', () => {
  const old = JSON.stringify({ sessions: [{ scene: 'kitchen', mode: 'listening', finishedAt: new Date(2026, 8, 7, 12).toISOString(),
    goalCount: 3, heardCount: 3, actionCount: 3, spokenCount: 3, hints: 0, rawText: 'private old text' }] });
  const storage = memoryStorage({ 'luma-learning-profile-v1': old });
  const f = setup(storage);
  assert.equal(f.store.getProfile().legacySummaries.length, 1);
  assert.equal(f.store.getProfile().legacySummaries[0].spokenCount, 3);
  assert.equal(f.store.getProfile().legacySummaries[0].rawText, undefined);
  for (const field of ['completedSessions', 'todayCompletedSessions', 'independentCount', 'transferCount', 'dueCount'])
    assert.equal(f.store.summary()[field], 0);
  assert.equal(storage.getItem('luma-learning-profile-v1'), old);
  assert.equal(Learning.createStore(storage, { now: f.now }).getProfile().legacySummaries.length, 1);
});

test('public records are copies and unsupported inputs cannot mutate stored evidence', () => {
  const f = setup();
  const record = f.record({ supportLevel: 1 });
  record.supportLevel = 0;
  const profile = f.store.getProfile();
  profile.attempts[0].supportLevel = 0;
  profile.sessions.length = 0;
  assert.equal(f.store.summary().independentCount, 0);
  assert.equal(f.store.summary().sessionCount, 1);
  assert.equal(f.record({ id: 'invalid-source', source: 'audio' }), null);
  assert.equal(f.record({ id: 'invalid-target', targetId: '' }), null);
  assert.equal(f.store.recordAttempt(null), null);
  assert.equal(f.store.getProfile().attempts.length, 1);
});

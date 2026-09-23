const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Coffee = require('./coffee');
const Breakfast = require('./breakfast');
const Learning = require('./learning-evidence');
const Memory = require('./scene-memory');
const { harness } = require('./test-support/voice-harness.cjs');

// Replay the production save, reset, greeting and answer handlers. Only UI,
// transport and audio are replaced; no microphone/provider claim is made.
function memoryHarness() {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const tasks = Coffee.tasks.map(task => ({ ...task, requiresAction: false }));
  let h, sessionId;
  const store = Learning.createStore(storage, { now: () => h ? h.now() : 10000 });
  const target = { 'coffee-order': 'choose-drink', 'coffee-size': 'choose-size',
    'coffee-service': 'choose-service', 'coffee-thanks': 'thank-person' };
  const experience = {
    store, currentSession: () => sessionId,
    begin() { sessionId = store.beginSession({ sceneId: h.s.selectedScene, missionId: h.s.coffeeMissionId }); },
    complete() { store.completeSession({ id: sessionId, sceneId: h.s.selectedScene }); },
    noteAnswer(context, outcome) {
      store.recordAttempt({ id: `${sessionId}:${context.messageId}`, sessionId,
        sceneId: context.sceneId, taskId: context.taskId, targetId: target[context.taskId],
        source: context.source, outcome, language: 'en' });
    },
    checkpoint() {}, taskStarted() {}, render() {}, noteHelp() {}, noteCharacterLine() {},
  };
  h = harness({
    localStorage: storage, LumaSceneMemory: Memory, LumaExperience: experience,
    currentTask: () => tasks[h.s.taskIndex], currentSceneConfig: () => ({ tasks }),
    COFFEE_MISSION_UI: { C01: {}, C02: {}, C03: {}, C04: {} },
    coffeeMissionMeta: id => Coffee.getMission(id || h.s.coffeeMissionId), coffeeMissionProgress: { runs: 0 },
    closeDuplexSession() {}, closeDialogueHistoryPanel() {},
    syncSubtitleVisibility() {}, syncTaskFocus() {}, syncActionCoach() {}, setApplePosition() {},
    hotspots: [], scheduleTaskPrompt(taskId) { h.effects.push({ type: 'prompt', taskId }); },
    speak(text) { h.effects.push({ type: 'spoken', text }); return Promise.resolve(true); },
    completeMultimodalTask() { h.s.stage = 'task-complete'; },
  });
  for (const name of ['appShell', 'toast', 'apple', 'languagePanel'])
    h.c[name] = h.c.document.querySelector(`#${name}`);
  Object.assign(h.s, { selectedScene: 'coffee', coffeeMissionId: 'C01', coffeeVariantId: null,
    taskIndex: 0, coffee: Coffee.missionInitial('C01'), duplexReady: true, sessionSaved: false });
  h.load('previousCoffeeVisit', 'rememberCompletedVisit', 'saveLearningSession', 'syncLearningUi',
    'resetScene', 'startTask', 'showPendingTaskPrompt', 'clearReviewTransition', 'taskHasAction',
    'goalRecord', 'currentGoalRecord', 'markGoalSpokenFor', 'coffeeTaskForChangedField',
    'recordCoffeeMissionEvidence', 'commitCoffeeChoice', 'applyDynamicFeedback', 'requestLanguageFeedback');
  experience.begin();
  h.store = store;
  h.storage = storage;
  h.session = () => sessionId;
  h.recordEvidence = (overrides = {}) => {
    for (const taskId of Object.keys(target).slice(0, 3)) store.recordAttempt({
      id: `${sessionId}:${taskId}`, sessionId, sceneId: 'coffee', taskId, targetId: target[taskId],
      source: 'voice', outcome: 'success', language: 'en', ...overrides,
    });
  };
  return h;
}

function completeOrder(h, text = 'A small latte for here.') {
  h.s.coffee = Coffee.advanceMission(Coffee.advanceMission(Coffee.missionInitial('C01'), text).world, 'Thanks.').world;
  assert.equal(Coffee.missionComplete(h.s.coffee), true);
  h.s.stage = 'complete';
}

async function returningVisit(h) {
  completeOrder(h);
  h.recordEvidence();
  h.c.saveLearningSession();
  const previousSession = h.session();
  await h.advance(1);
  h.c.resetScene();
  assert.notEqual(h.session(), previousSession);
  assert.equal(h.s.previousVisit.sessionId, previousSession);
  return h.s.activeQuestion;
}

async function answer(h, text) {
  const message = { id: ++h.s.messageSerial, revision: 1, speaker: 'user', text,
    taskId: h.c.currentTask().id, final: true };
  h.s.dialogueHistory.push(message);
  await h.c.requestLanguageFeedback(h.s.activeQuestion, text, {
    ...h.c.captureUserTurnContext(), messageId: message.id, revision: message.revision,
    answer: text, final: true, source: 'voice',
  });
  return message;
}

test('actual save and reset handlers greet a returning visitor without placing an order', async () => {
  const h = memoryHarness();
  h.load('scheduleTaskPrompt');
  const greeting = await returningVisit(h);
  assert.equal(greeting, 'Welcome back! Last time you had a latte. Would you like a latte?');
  assert.equal(h.s.dialogueHistory[0].text, greeting);
  assert.equal(h.s.coffee.drink, null);
  assert.equal(h.s.coffee.size, null);
  assert.equal(h.s.coffee.service, null);
  assert.equal(h.store.getProfile().attempts.filter(item => item.sessionId === h.session()).length, 0);
  assert.equal(Memory.normalize(h.storage.getItem(Memory.STORAGE_KEY)).visits.length, 1);
  await h.advance(180);
  assert.deepEqual(h.effects.filter(item => item.type === 'spoken').map(item => item.text), [greeting],
    'the real prompt scheduler sends the displayed return greeting to speech');
});

test('the actual safe-retry handler keeps the returning greeting when the first response is discarded', async () => {
  const h = memoryHarness();
  const greeting = await returningVisit(h);
  h.load('discardReasoningLeak');
  assert.equal(h.s.characterPromptDelivered, false);
  assert.notEqual(greeting, h.c.currentTask().prompt);
  h.c.discardReasoningLeak();
  await h.advance(139);
  assert.equal(h.effects.filter(item => item.type === 'spoken').length, 0);
  await h.advance(1);
  assert.deepEqual(h.effects.filter(item => item.type === 'spoken').map(item => item.text), [greeting]);
  assert.equal(h.s.activeQuestion, greeting);
  assert.equal(h.s.coffee.drink, null);
  assert.equal(h.s.coffee.size, null);
  assert.equal(h.s.coffee.service, null);
});

for (const [text, drink, accepted] of [
  ['Yes, please.', 'latte', true], ['No.', null, false], ['An americano, please.', 'americano', true],
  ["Let's just talk.", null, false],
]) {
  test(`returning visitor ${JSON.stringify(text)} is respected by actual feedback and order handlers`, async () => {
    const h = memoryHarness();
    await returningVisit(h);
    const message = await answer(h, text);
    assert.equal(h.s.coffee.drink, drink);
    assert.equal(h.s.coffee.size, null, 'size is never copied from yesterday');
    assert.equal(h.s.coffee.service, null, 'service is never copied from yesterday');
    assert.equal(Boolean(message.taskAccepted), accepted);
    const attempts = h.store.getProfile().attempts.filter(item => item.sessionId === h.session() && item.outcome === 'success');
    assert.equal(attempts.length, accepted ? 1 : 0);
    if (accepted) assert.equal(attempts[0].targetId, 'choose-drink');
    assert.equal(Memory.lastVisit(h.storage.getItem(Memory.STORAGE_KEY)).order.drink, 'latte',
      'today does not rewrite the completed historical visit');
  });
}

test('unknown history keeps the ordinary opening and a saved callback is idempotent', async () => {
  const h = memoryHarness();
  h.c.resetScene();
  assert.equal(h.s.previousVisit, null);
  assert.doesNotMatch(h.s.activeQuestion, /Welcome back|Last time/);
  completeOrder(h); h.recordEvidence(); h.c.saveLearningSession();
  const saved = h.storage.getItem(Memory.STORAGE_KEY);
  h.c.saveLearningSession();
  h.c.rememberCompletedVisit();
  assert.equal(h.storage.getItem(Memory.STORAGE_KEY), saved);
  assert.equal(h.c.previousCoffeeVisit(), null, 'same session cannot be its own previous visit');
  await h.advance(1);
  assert.equal(h.c.previousCoffeeVisit(), null, 'exclude the current session even when time moves');
});

for (const outcome of ['technical-error', 'unconfirmed']) {
  test(`actual save does not turn ${outcome} attempts into a remembered visit`, async () => {
    const h = memoryHarness();
    completeOrder(h); h.recordEvidence({ outcome }); h.c.saveLearningSession();
    assert.equal(Memory.lastVisit(h.storage.getItem(Memory.STORAGE_KEY)), null);
    await h.advance(1); h.c.resetScene();
    assert.equal(h.s.previousVisit, null);
    assert.doesNotMatch(h.s.activeQuestion, /Welcome back|Last time/);
  });
}

test('actual save ignores a seeded C03 order when the visitor only repaired a size', async () => {
  const h = memoryHarness();
  h.s.coffeeMissionId = 'C03';
  h.s.coffee = Coffee.advanceMission(Coffee.advanceMission(Coffee.missionInitial('C03'), 'I ordered a small.').world, 'Thanks.').world;
  assert.equal(Coffee.missionComplete(h.s.coffee), true);
  h.s.stage = 'complete';
  h.store.recordAttempt({ id: 'repair-size', sessionId: h.session(), sceneId: 'coffee', taskId: 'coffee-size',
    targetId: 'choose-size', source: 'voice', outcome: 'success', language: 'en' });
  h.c.saveLearningSession();
  assert.equal(Memory.lastVisit(h.storage.getItem(Memory.STORAGE_KEY)), null);
});

test('incomplete order, incomplete learning session and legacy summaries do not create memory', () => {
  const h = memoryHarness();
  h.recordEvidence();
  h.c.rememberCompletedVisit();
  assert.equal(h.storage.getItem(Memory.STORAGE_KEY), null);
  completeOrder(h);
  h.c.rememberCompletedVisit();
  assert.equal(h.storage.getItem(Memory.STORAGE_KEY), null, 'coffee completion alone does not finish the evidence session');
  h.storage.setItem('luma-learning-profile-v1', JSON.stringify({ sessions: [{ scene: 'coffee', goalCount: 4 }] }));
  h.c.resetScene();
  assert.equal(h.s.previousVisit, null);
});

test('a storage denial cannot interrupt saving or entering a conversation', () => {
  const h = memoryHarness();
  h.c.localStorage = { getItem() { throw Error('unavailable'); }, setItem() { throw Error('unavailable'); } };
  completeOrder(h); h.recordEvidence();
  assert.doesNotThrow(() => h.c.saveLearningSession());
  assert.doesNotThrow(() => h.c.resetScene());
  assert.equal(h.s.previousVisit, null);
  assert.ok(h.s.activeQuestion);
});

test('actual socket start, task update, and deferred update carry only the prior completed visit', async () => {
  const h = memoryHarness();
  await returningVisit(h);
  h.load('updateDuplexTask', 'flushDuplexTaskUpdate');
  h.s.duplexReady = false;
  const ready = h.c.connectDuplexSession();
  h.s.duplexSocket.onopen();
  await h.s.duplexSocket.onmessage({ data: JSON.stringify({ type: 'session.created' }) });
  await ready;
  h.c.updateDuplexTask({ force: true });
  h.s.pendingTaskUpdate = true;
  h.c.flushDuplexTaskUpdate();
  const updates = h.effects.filter(item => item.type === 'send' && ['start', 'task.update'].includes(item.data.type));
  assert.deepEqual(updates.map(item => item.data.type), ['start', 'task.update', 'task.update']);
  for (const { data } of updates) {
    assert.equal(data.previousVisit.sessionId, h.s.previousVisit.sessionId);
    assert.notEqual(data.previousVisit.sessionId, h.session());
    assert.equal(data.previousVisit.order.drink, 'latte');
    assert.equal(data.coffee.drink, null);
    assert.equal(data.coffee.size, null);
    assert.equal(data.coffee.service, null);
  }
});

test('server instructions scope remembered facts to a verified coffee visit and forbid prefilling today', () => {
  const source = fs.readFileSync(require.resolve('./server'), 'utf8');
  const context = vm.createContext({ Coffee, Breakfast, SceneMemory: Memory });
  const declarations = ['DUPLEX_TASKS', 'SCENE_FACTS'].map(name => source.match(new RegExp(`^const ${name} = \\{[^]*?^\\};`, 'm'))[0]);
  declarations.push(source.match(/^const ACTION_REQUIRED_TASKS = .*$/m)[0]);
  declarations.push(source.match(/^function duplexInstructions\([^]*?^\}$/m)[0]);
  vm.runInContext(declarations.join('\n'), context);
  const h = memoryHarness(); completeOrder(h); h.recordEvidence(); h.c.saveLearningSession();
  const visit = Memory.lastVisit(h.storage.getItem(Memory.STORAGE_KEY));
  const instructions = (task, memory) => context.duplexInstructions(task, false, false, [], 'active', [],
    Breakfast.initial(), Coffee.missionInitial('C01'), memory);
  const returning = instructions('coffee-order', visit);
  assert.match(returning, /Confirmed previous completed visit only: drink=latte, size=small, service=here/);
  assert.match(returning, /historical order facts, not a favorite or today's order/);
  assert.match(returning, /Never fill today's drink, size or service from this memory/);
  assert.match(instructions('coffee-order', { order: visit.order }), /No verified previous visit/);
  assert.match(instructions('breakfast-drink', visit), /No verified previous visit/);
});

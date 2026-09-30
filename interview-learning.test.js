const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const Interview = require('./interview');
const Learning = require('./learning-evidence');
const Life = require('./life-experience');
const World = require('./world-learning-loop');
const Catalog = require('./world-catalog');

function storage() {
  const map = new Map();
  return { getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value) };
}
function fixture(missionId = 'I02', saved = storage()) {
  const starts = [], previews = [], coffeeSelections = [];
  const state = { selectedScene: 'interview', interviewMissionId: missionId, practiceMode: 'guided',
    sceneStarted: true, taskIndex: 0, stage: 'active', sessionGoals: {}, coveredGoals: new Set() };
  const document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
  const window = { Interview, localStorage: saved, LumaWorldLoop: World, LumaLifeExperience: Life, addEventListener() {} };
  vm.runInNewContext(readFileSync('./learning-experience.js', 'utf8'), { window, document, Interview, LumaLearning: Learning });
  const api = window.LumaExperience;
  const tasks = () => Interview.tasksFor(state.interviewMissionId);
  const task = () => tasks()[state.taskIndex];
  api.bind({ state: () => state, task, goal: () => state.sessionGoals[task().id] ||= {}, taskIds: () => tasks().map(t => t.id),
    taskCount: () => tasks().length, notify() {}, speak() {},
    start: (sceneId, options) => starts.push({ sceneId, options }),
    preview: (sceneId, mission) => previews.push({ sceneId, mission }),
    selectCoffeeMission: mission => coffeeSelections.push(mission) });
  return { api, state, saved, starts, previews, coffeeSelections, tasks, task };
}

test('interview place has seven authored missions within a separate workplace region', () => {
  const place = Catalog.place('interview');
  assert.equal(place.regionId, 'work');
  assert.equal(Catalog.place('office').regionId, 'work');
  assert.equal(place.thumbnailImage, './assets/interview/room.png');
  assert.equal(place.events.length, 7);
  for (const event of place.events) assert.equal(event.title, Interview.getMission(event.missionId).title);
  assert.equal(Catalog.stateFor(place, { sessions: [{ id: 'i1', sceneId: 'interview', missionId: 'I01', scope: 'life-event', completedAt: '2026-01-01T00:00:00Z' }] }), 'visited');
});

test('separate interview drills retain separate pending sessions and reject cross-mission resume', () => {
  const store = Learning.createStore(storage());
  const ids = ['I01', 'I02'].map(missionId => {
    const id = store.beginSession({ sceneId: 'interview', missionId, scope: 'life-event' });
    store.saveCheckpoint({ sessionId: id, sceneId: 'interview', taskIndex: 3, missionId });
    return id;
  });
  assert.equal(store.getCheckpoints().length, 2);
  assert.equal(store.getCheckpoint({ sceneId: 'interview', missionId: 'I01' }).taskIndex, 3);
  assert.equal(store.nextStep().missionId, 'I02');
  assert.notEqual(store.beginSession({ sceneId: 'interview', missionId: 'I03', scope: 'life-event', resumeId: ids[0] }), ids[0]);
  assert.equal(store.getProfile().sessions.find(s => s.id === ids[0]).supersededAt, null);
});

test('learning bridge restores the selected interview drill without touching coffee selectors', () => {
  const f = fixture('I04');
  f.api.begin(); f.api.taskStarted();
  const restored = fixture('I01', f.saved);
  const next = restored.api.homeStep();
  assert.equal(next.sceneId, 'interview'); assert.equal(next.missionId, 'I04');
  assert.equal(next.title, Interview.getMission('I04').title);
  restored.api.startHome();
  assert.equal(restored.starts[0].sceneId, 'interview');
  assert.equal(restored.starts[0].options.missionId, 'I04');
  assert.equal(restored.starts[0].options.resumeCheckpoint.missionId, 'I04');
  assert.equal(restored.coffeeSelections.length, 0);
  restored.api.startHome({ chooseMission: true });
  assert.deepEqual(restored.previews[0], { sceneId: 'interview', mission: 'I04' });
});

test('interview examples, targets, and recorded help are tied to the actual task', () => {
  const f = fixture('I03');
  assert.equal(f.api.catalog.SCENE_TASKS.interview.length, Interview.tasks.length);
  const task = f.task();
  assert.equal(f.api.TASKS[task.id][0], task.targetId);
  assert.equal(f.api.TASKS[task.id][3], task.support.model);
  f.api.recordStudy('interview', task.id, 'full-example');
  f.api.begin(); f.api.taskStarted();
  f.api.noteAnswer({ evidenceSessionId: f.api.currentSession(), sceneId: 'interview', taskId: task.id,
    source: 'voice', answer: 'I interviewed users to understand the problem.', messageId: 'answer1', supportLevel: f.api.supportLevel() });
  const answer = f.api.store.getProfile().attempts.at(-1);
  assert.equal(answer.missionId, 'I03'); assert.equal(answer.targetId, task.targetId);
  assert.equal(answer.productionCondition, 'assisted');
});

test('due interview review starts at the task index within its own mission', () => {
  const f = fixture('I04');
  const old = Date.now() - 7 * 86400000;
  const evidence = Learning.createStore(f.saved, { now: old });
  const id = evidence.beginSession({ sceneId: 'interview', missionId: 'I04', scope: 'life-event' });
  const task = Interview.tasksFor('I04')[1];
  evidence.recordAttempt({ id: 'past', sessionId: id, sceneId: 'interview', missionId: 'I04', taskId: task.id,
    targetId: task.targetId, source: 'voice', language: 'en', supportLevel: 0, conditionsTracked: true, outcome: 'success', utterance: 'I explained the trade-off to the team.' });
  evidence.completeSession({ id, sceneId: 'interview' });
  const restored = fixture('I01', f.saved);
  restored.api.startReviewPractice();
  assert.equal(restored.starts[0].sceneId, 'interview');
  assert.equal(restored.starts[0].options.missionId, 'I04');
  assert.equal(restored.starts[0].options.startTaskIndex, 1);
  assert.equal(restored.starts[0].options.reviewTaskId, task.id);
  assert.equal(restored.coffeeSelections.length, 0);
});

test('interview completions award by mission while repeated callbacks and short review give no extra XP', () => {
  const store = Life.createStore(storage());
  const event = (id, missionId, scope = 'life-event') => ({ id, sceneId: 'interview', missionId, scope, completedAt: new Date().toISOString() });
  const first = event('first', 'I01');
  assert.equal(store.complete(first).gainedXP, 30);
  assert.equal(store.complete(first).gainedXP, 0);
  assert.equal(store.complete(event('second', 'I02')).gainedXP, 20);
  assert.equal(store.complete(event('mock', 'I07')).gainedXP, 20);
  assert.equal(store.complete(event('review', 'I03', 'target-practice')).gainedXP, 0);
  assert.equal(store.complete(event('no-mission', null)).gainedXP, 0);
});

test('interview progression is opt-in and does not replace the beginner coffee recommendation', () => {
  const store = Learning.createStore(storage());
  assert.equal(World.plan(store.getProfile()).sceneId, 'coffee');
  const id = store.beginSession({ sceneId: 'interview', missionId: 'I01', scope: 'life-event' });
  store.completeSession({ id, sceneId: 'interview' });
  const next = World.plan(store.getProfile());
  assert.equal(next.sceneId, 'interview'); assert.equal(next.missionId, 'I02');
  assert.equal(next.title, Interview.getMission('I02').title);
  assert.doesNotMatch(JSON.stringify(next), /掌握|通过面试|录用/);
});


test('skipping interview topics or ending early cannot award life-event completion', () => {
  const f = fixture('I01');
  f.api.begin(); f.api.taskStarted();
  f.state.stage = 'complete';
  f.state.coveredGoals.add(f.task().id);
  assert.equal(f.api.complete(), null);
  assert.equal(f.api.store.getProfile().sessions[0].completedAt, null);
  assert.equal(f.api.lifeStore.summary().totalXP, 0);
  for (const task of f.tasks()) f.state.coveredGoals.add(task.id);
  assert.ok(f.api.complete()?.completedAt);
  assert.equal(f.api.lifeStore.summary().totalXP, 30);
});


test('long interview restores the current topic, covered topics, and prior help after reload', () => {
  const f = fixture('I07');
  f.api.begin(); f.api.taskStarted();
  const originalSession = f.api.currentSession();
  f.state.taskIndex = 5;
  for (const item of f.tasks().slice(0, 5)) f.state.coveredGoals.add(item.id);
  f.state.sessionGoals[f.task().id] = { supportLevel: 2, supportKinds: ['keyword'] };
  f.api.checkpoint();
  const checkpoint = f.api.store.getCheckpoint();
  assert.equal(checkpoint.taskIndex, 5);
  assert.equal(checkpoint.coveredGoals.length, 5);
  assert.equal(checkpoint.goalRecords[f.task().id].supportLevel, 2);
  const restored = fixture('I07', f.saved);
  const next = restored.api.homeStep();
  assert.equal(next.taskIndex, 5);
  assert.match(next.reason, /继续当前话题/);
  restored.api.startHome();
  const saved = restored.starts[0].options.resumeCheckpoint;
  assert.equal(saved.taskIndex, 5);
  Object.assign(restored.state, { taskIndex: saved.taskIndex, coveredGoals: new Set(saved.coveredGoals), sessionGoals: saved.goalRecords });
  restored.api.begin(saved); restored.api.taskStarted();
  assert.equal(restored.api.currentSession(), originalSession);
  assert.equal(restored.state.taskIndex, 5);
  assert.equal(restored.api.supportLevel(), 2);
  assert.deepEqual([...restored.state.coveredGoals], f.tasks().slice(0, 5).map(item => item.id));
  const plan = World.plan(restored.api.store.getProfile());
  assert.equal(plan.taskIndex, 5); assert.equal(plan.missionId, 'I07');
  assert.match(plan.reason, /继续当前话题/);
  assert.equal(restored.api.lifeStore.summary().totalXP, 0);
});

test('an answered interview topic saves the next topic without losing covered evidence', () => {
  const f = fixture('I03');
  f.api.begin();
  f.state.coveredGoals.add(f.task().id);
  f.state.stage = 'task-complete';
  f.api.checkpoint();
  const saved = f.api.store.getCheckpoint();
  assert.equal(saved.taskIndex, 1);
  assert.deepEqual(saved.coveredGoals, [f.tasks()[0].id]);
});

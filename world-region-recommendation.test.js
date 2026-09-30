const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Learning = require('./learning-evidence');
const Interview = require('./interview');
const catalog = require('./world-catalog');

function fixture() {
  const values = new Map();
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const window = { localStorage: storage, LumaWorldCatalog: catalog, Interview };
  const document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'learning-experience.js'), 'utf8'), { window, document, LumaLearning: Learning });
  const api = window.LumaExperience, store = api.store;
  const save = (sceneId, missionId, taskIndex = 0) => {
    const sessionId = store.beginSession({ sceneId, missionId, scope: 'life-event', mode: 'guided' });
    store.saveCheckpoint({ sessionId, sceneId, missionId, taskIndex });
    return sessionId;
  };
  return { api, store, save };
}

test('regional home recommendations keep the matching unfinished task and do not change any checkpoint', () => {
  const { api, store, save } = fixture();
  const interview = save('interview', 'I04', 2);
  const coffee = save('coffee', 'C02');
  const before = JSON.stringify(store.getProfile());
  assert.equal(api.homeStep().sessionId, coffee, 'Global learning recommendation is still the latest event');
  const work = api.homeStep('work');
  assert.equal(work.sessionId, interview);
  assert.equal(work.sceneId, 'interview');
  assert.equal(work.missionId, 'I04');
  assert.equal(work.taskIndex, 2);
  assert.equal(work.title, Interview.getMission('I04').title);
  assert.equal(api.homeStep('district').sessionId, coffee);
  assert.equal(api.homeStep('airport').sceneId, 'airport');
  assert.equal(JSON.stringify(store.getProfile()), before, 'Browsing recommendations is read-only');
});

test('every region has a valid local task for a new learner', () => {
  const { api } = fixture();
  for (const region of catalog.regions) {
    const next = api.homeStep(region.id), place = catalog.place(next.sceneId);
    assert.equal(place.regionId, region.id);
    assert.equal(place.available, true);
    assert.equal(next.kind, 'start');
    if (region.id !== 'district') assert.doesNotMatch(`${next.title} ${next.reason}`, /咖啡|Mia|点一杯/);
  }
});

test('completing an interview recommends the next drill in work while a cafe checkpoint stays saved', () => {
  const { api, store, save } = fixture();
  const coffee = save('coffee', 'C01');
  const interview = save('interview', 'I01');
  store.completeSession({ id: interview, sceneId: 'interview' });
  assert.equal(api.homeStep('work').sceneId, 'interview');
  assert.equal(api.homeStep('work').missionId, 'I02');
  assert.equal(api.homeStep('district').sessionId, coffee);
});

test('a completed local scene never recommends a scene from another region', () => {
  const { api, store, save } = fixture();
  for (const [regionId, sceneId] of [['airport', 'airport'], ['work', 'office']]) {
    const sessionId = save(sceneId);
    store.completeSession({ id: sessionId, sceneId });
    assert.equal(catalog.place(api.homeStep(regionId).sceneId).regionId, regionId);
  }
  assert.equal(api.homeStep('work').sceneId, 'interview', 'After meeting a colleague, work can suggest the available interview');
});

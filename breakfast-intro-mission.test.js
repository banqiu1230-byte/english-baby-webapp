const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'breakfast-ui.js'), 'utf8');

function setup(selectedScene = 'coffee') {
  class Element {
    constructor() {
      this.children = [];
      this.listeners = new Map();
      this.classList = { add() {}, remove() {}, toggle() {} };
      this.checked = false;
    }
    addEventListener(type, callback) { this.listeners.set(type, callback); }
    click() { this.listeners.get('click')?.(); }
    setAttribute() {}
    focus() {}
  }

  const nodes = new Map();
  const document = {
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, new Element());
      return nodes.get(selector);
    },
  };
  const state = { selectedScene, sceneStarted: false, coffeeMissionId: 'C03', coffeeVariantId: null };
  const scene = new Element();
  const starts = [];
  const context = vm.createContext({
    document, state, scene,
    backgroundPlane: new Element(),
    reviewScreen: new Element(),
    experience: new Element(),
    clearTimeout() {},
    stopSpeechPlayback() {}, closeDuplexSession() {}, closeSheet() {},
    configureScene() {}, syncCoffeeMissionBoard() {}, syncA11yState() {},
    startScene(options) { starts.push(options); },
  });
  vm.runInContext(source, context, { filename: 'breakfast-ui.js' });
  return {
    context, state, starts,
    show(options) { context.showSceneIntroduction(options); },
    start() { nodes.get('#introReady').click(); },
  };
}

test('choosing an earlier coffee mission starts that mission without restoring a later checkpoint', () => {
  const app = setup();
  const checkpoint = { sceneId: 'coffee', missionId: 'C03', coffee: { missionId: 'C03' } };
  app.show({ missionId: 'C03', variantId: 'old-variant', resumeCheckpoint: checkpoint, subtitlesHidden: true });
  app.state.coffeeMissionId = 'C01';
  app.start();
  assert.equal(app.starts[0].missionId, 'C01');
  assert.equal(app.starts[0].resumeCheckpoint, null);
  assert.equal(app.starts[0].variantId, null);
  assert.equal(app.starts[0].subtitlesHidden, false);
  assert.equal(app.starts[0].skipIntro, true);
});

test('restarting the selected coffee mission keeps its own checkpoint marker', () => {
  const app = setup();
  const checkpoint = { sceneId: 'coffee', missionId: 'C03', coffee: { missionId: 'C03' } };
  app.show({ missionId: 'C01', resumeCheckpoint: checkpoint, subtitlesHidden: false });
  app.start();
  assert.equal(app.starts[0].missionId, 'C03');
  assert.equal(app.starts[0].resumeCheckpoint, checkpoint);
});

test('choosing C04 carries its current variant and hides subtitles', () => {
  const app = setup();
  app.show({ missionId: 'C02', resumeCheckpoint: { sceneId: 'coffee', missionId: 'C02' } });
  app.state.coffeeMissionId = 'C04';
  app.state.coffeeVariantId = 'C04-order-small-americano';
  app.start();
  assert.equal(app.starts[0].missionId, 'C04');
  assert.equal(app.starts[0].variantId, 'C04-order-small-americano');
  assert.equal(app.starts[0].resumeCheckpoint, null);
  assert.equal(app.starts[0].subtitlesHidden, true);
});

test('the breakfast introduction keeps its existing start options', () => {
  const app = setup('kitchen');
  const checkpoint = { sceneId: 'kitchen', taskIndex: 1 };
  app.show({ resumeCheckpoint: checkpoint, subtitlesHidden: true, startTaskIndex: 1 });
  app.start();
  assert.equal(app.starts[0].resumeCheckpoint, checkpoint);
  assert.equal(app.starts[0].startTaskIndex, 1);
  assert.equal(app.starts[0].subtitlesHidden, true);
  assert.equal(app.starts[0].missionId, undefined);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Learning = require('./learning-evidence');

// Exercise the real UI bridge and evidence store without starting speech or a browser.
const experienceSource = fs.readFileSync(path.join(__dirname, 'learning-experience.js'), 'utf8');
const sceneTasks = {
  kitchen: ['breakfast-drink', 'breakfast-cup', 'breakfast-more'],
  coffee: ['coffee-order', 'coffee-size', 'coffee-service', 'coffee-thanks'],
  airport: ['ticket', 'bag', 'gate-a12'],
  office: ['office-purpose', 'office-signin', 'office-wait', 'office-greeting'],
};

function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] || null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
}

class Element {
  constructor() {
    this.hidden = false; this.inert = false; this.parentElement = null;
    this.children = []; this.listeners = new Map(); this.selectors = new Map(); this.dataset = {};
  }
  append(...children) {
    for (const child of children) child.parentElement = this;
    this.children.push(...children);
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parentElement = null;
    this.children = []; this.append(...children);
  }
  querySelectorAll(selector) { return this.selectors.get(selector) || []; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  dispatch(type) { for (const callback of this.listeners.get(type) || []) callback({}); }
  focus() {}
}

function setup({ sceneId = 'kitchen', storage = memoryStorage(), coffeeJourney = null } = {}) {
  const guidance = new Element();
  const nodes = new Map([
    'learningHelpPanel', 'learningHelpContent', 'reviewSpoken', 'reviewTransferTitle', 'reviewTransferCopy',
    'repeatScene', 'todayTitle', 'openDialogueHistory', 'learningNotesTitle', 'growthSummary',
    'reviewOverviewTitle', 'reviewOverviewCopy', 'startReview', 'reviewQueueList', 'strengthCount',
    'strengthList', 'achievementCompleted', 'achievementIndependent', 'achievementTargets',
    'achievementTransfer', 'learningHistory', 'todayMissionCode', 'adventureJourneyTitle', 'adventureRoute',
    'chooseCoffeeMission',
  ].map(id => [id, new Element()]));
  const panel = nodes.get('learningHelpPanel');
  const modalParent = new Element(), sceneContent = new Element(), helpButton = new Element();
  modalParent.append(sceneContent, panel);
  panel.append(helpButton, nodes.get('learningHelpContent'));
  panel.selectors.set('.learning-help-sheet button', [helpButton]);
  panel.hidden = true;
  const journeySwitch = new Element(), primaryCta = new Element();
  const document = Object.assign(new Element(), {
    visibilityState: 'visible', activeElement: null,
    getElementById: id => nodes.get(id) || null,
    querySelector: selector => selector === '.intro-guidance' ? guidance
      : selector === '.journey-switch' ? journeySwitch : selector === '.primary-cta' ? primaryCta : null,
    querySelectorAll: () => [], createElement: () => new Element(),
  });
  const window = Object.assign(new Element(), { localStorage: storage });
  helpButton.focus = () => { document.activeElement = helpButton; };
  const context = vm.createContext({ window, document, LumaLearning: Learning });
  vm.runInContext(experienceSource, context, { filename: 'learning-experience.js' });
  const api = window.LumaExperience;
  const state = {
    selectedScene: sceneId, practiceMode: 'guided', sceneStarted: false,
    stage: 'idle', sessionSaved: false, taskIndex: 0,
    breakfast: { drink: null, cupPlaced: false, amount: null },
    coffee: { drink: null, size: null, service: null, received: false },
    coveredGoals: new Set(), sessionGoals: {}, dialogueHistory: [],
  };
  const task = () => ({ id: sceneTasks[state.selectedScene][state.taskIndex], prompt: 'A short question.' });
  const starts = [], previews = [], guidanceEvents = [];
  api.bind({
    state: () => state, task,
    goal: () => state.sessionGoals[task().id] ||= {},
    taskCount: () => sceneTasks[state.selectedScene].length,
    start: (nextScene, options) => starts.push({ sceneId: nextScene, options }),
    preview: (nextScene, missionId) => previews.push({ sceneId: nextScene, missionId }),
    coffeeJourney: coffeeJourney ? () => coffeeJourney : undefined,
    speak() {}, notify() {},
    pauseGuidance: () => guidanceEvents.push('pause'),
    resumeGuidance: () => guidanceEvents.push('resume'),
  });

  function begin(checkpoint = null) {
    // The adapter supplies the restored world before the bridge resumes its session.
    Object.assign(state, {
      sceneStarted: true, stage: 'active', sessionSaved: false,
      taskIndex: checkpoint?.taskIndex || 0,
      practiceMode: checkpoint?.practiceMode || state.practiceMode,
      breakfast: checkpoint?.breakfast || { drink: null, cupPlaced: false, amount: null },
      coffee: checkpoint?.coffee || { drink: null, size: null, service: null, received: false },
      coveredGoals: new Set(checkpoint?.coveredGoals || []),
      sessionGoals: checkpoint?.goalRecords || {},
    });
    api.begin(checkpoint);
    api.taskStarted();
    return api.currentSession();
  }

  let messageSerial = 0;
  function capture(overrides = {}) {
    return {
      evidenceSessionId: api.currentSession(), sceneId: state.selectedScene,
      taskId: task().id, messageId: `message-${++messageSerial}`,
      answer: 'Milk, please.', source: 'voice', supportLevel: api.supportLevel(),
      ...overrides,
    };
  }
  return { api, state, storage, guidance, guidanceEvents, document, window, nodes, journeySwitch, primaryCta, starts, previews, begin, capture };
}

test('resuming another scene cannot inherit coffee mission labels or a visible coffee route', () => {
  for (const [sceneId, title] of [['airport', '出发前的短练习'], ['office', '工作日短练习'], ['kitchen', '熟悉的早晨']]) {
    const f = setup({ sceneId });
    f.state.coffeeMissionId = 'C04';
    f.state.coffeeVariantId = 'small-americano-here';
    f.begin(); f.api.checkpoint(); f.api.renderHome();
    assert.equal(f.api.store.getCheckpoint().missionId, null);
    assert.equal(f.api.store.getCheckpoint().variantId, null);
    assert.equal(f.nodes.get('todayMissionCode').textContent, '继续委托');
    assert.equal(f.nodes.get('adventureJourneyTitle').textContent, title);
    assert.equal(f.journeySwitch['aria-label'], `查看当前旅程：${title}`);
    assert.equal(f.nodes.get('adventureRoute').hidden, true);
  }
});

for (const [sceneId, answer] of [['kitchen', 'Milk, please.'], ['coffee', 'A latte, please.'], ['airport', 'Here you are.'], ['office', 'I am here to see Maya.']]) {
  test(`the ${sceneId} introductory example remains assisted after it is closed`, () => {
    const f = setup({ sceneId });
    const example = f.guidance.children[0];
    example.dispatch('click');
    example.dispatch('click');
    assert.equal(f.guidance.children[1].hidden, true);
    f.begin();
    f.api.noteAnswer(f.capture({ answer }));
    assert.equal(f.api.store.summary().assistedCount, 1);
    assert.equal(f.api.store.summary().independentCount, 0);
    assert.equal(f.api.store.getProfile().attempts[0].supportLevel, 3);
  });
}

test('an example viewed for a cancelled scene does not attach to a different scene', () => {
  const f = setup();
  f.guidance.children[0].dispatch('click');
  f.state.selectedScene = 'airport';
  f.begin();
  f.api.noteAnswer(f.capture({ answer: 'Here you are.' }));
  assert.equal(f.api.store.summary().independentCount, 1);
  assert.equal(f.state.sessionGoals.ticket.supportLevel, 0);
});

test('reopening an introduction cannot leave its full answer visible but untracked', () => {
  const f = setup();
  f.guidance.children[0].dispatch('click');
  f.begin();
  f.api.noteAnswer(f.capture());
  f.state.sceneStarted = false;
  // The same intro DOM is reused. It is safe either to reset it before reopening,
  // or to attest that its still-visible answer was shown for the new session.
  const answerVisibleOnReopen = !f.guidance.children[1].hidden;
  f.begin();
  f.api.noteAnswer(f.capture());
  assert.equal(f.api.store.summary().assistedCount, answerVisibleOnReopen ? 2 : 1);
  assert.equal(f.api.store.summary().independentCount, answerVisibleOnReopen ? 0 : 1);
});

test('missing or unsupported answer sources are rejected, not promoted to voice', () => {
  const f = setup(); f.begin();
  for (const source of [undefined, null, '', 'audio', 'tap']) f.api.noteAnswer(f.capture({ source }));
  assert.equal(f.api.store.getProfile().attempts.length, 0);
  assert.equal(f.api.store.summary().independentCount, 0);
  f.api.noteAnswer(f.capture());
  assert.equal(f.api.store.summary().voiceEnglishCount, 1);
});

test('responses without an evidence session are rejected', () => {
  const f = setup(); f.begin();
  f.api.noteAnswer(f.capture({ evidenceSessionId: undefined }));
  f.api.noteAnswer(f.capture({ evidenceSessionId: null }));
  assert.equal(f.api.store.getProfile().attempts.length, 0);
});

test('invalid support attestations cannot be coerced into independent voice evidence', () => {
  const f = setup(); f.begin();
  for (const supportLevel of [undefined, null, false, '', '0', -1, 4])
    f.api.noteAnswer(f.capture({ supportLevel }));
  assert.equal(f.api.store.summary().independentCount, 0);
  f.api.noteAnswer(f.capture({ supportLevel: 0 }));
  assert.equal(f.api.store.summary().independentCount, 1);
});

for (const nextScene of ['kitchen', 'airport']) {
  test(`a delayed prior-session result cannot enter a new ${nextScene} session`, () => {
    const f = setup();
    const previousSession = f.begin();
    const pending = f.capture();
    f.api.noteAnswer(pending, 'unconfirmed');
    const before = f.api.store.getProfile().attempts;
    f.state.selectedScene = nextScene;
    const currentSession = f.begin();
    assert.notEqual(currentSession, previousSession);
    f.api.noteAnswer(pending, 'success');
    assert.deepEqual(f.api.store.getProfile().attempts, before);
    assert.equal(f.api.store.summary().independentCount, 0);
    f.api.noteAnswer(f.capture({ answer: nextScene === 'airport' ? 'Here you are.' : 'Water, please.' }));
    assert.equal(f.api.store.summary().independentCount, 1);
    assert.equal(f.api.store.getProfile().attempts.at(-1).sessionId, currentSession);
  });
}

test('help revealed while evaluation is pending cannot become an independent result', () => {
  const f = setup(); f.begin();
  const pending = f.capture();
  f.api.noteAnswer(pending, 'unconfirmed');
  f.api.openHelp('example');
  f.api.noteAnswer(pending, 'success');
  assert.equal(f.api.store.getProfile().attempts.length, 1);
  assert.equal(f.api.store.summary().assistedCount, 1);
  assert.equal(f.api.store.summary().independentCount, 0);
});

test('closing the help sheet resumes silence guidance exactly once', () => {
  const f = setup(); f.begin();
  f.api.openHelp();
  assert.deepEqual(f.guidanceEvents, ['pause']);
  f.api.closeHelp();
  assert.deepEqual(f.guidanceEvents, ['pause', 'resume']);
  f.api.closeHelp();
  assert.deepEqual(f.guidanceEvents, ['pause', 'resume']);
});

test('visible English labels in the scene count as keyword support for speaking', () => {
  const f = setup({ sceneId: 'coffee' });
  f.begin();
  f.api.noteHelp(1, 'visual-word-cue');
  f.api.noteAnswer(f.capture({ answer: 'A latte, please.' }));
  const attempt = f.api.store.getProfile().attempts[0];
  assert.deepEqual(attempt.exposureKinds, ['keyword']);
  assert.equal(attempt.productionCondition, 'assisted');
  assert.equal(f.api.store.summary().independentCount, 0);
});

test('opening dialogue history records transcript exposure without cancelling independent expression', () => {
  const f = setup();
  f.state.practiceMode = 'listening';
  f.state.subtitlesHidden = true;
  f.begin();
  f.nodes.get('openDialogueHistory').dispatch('click');
  f.api.noteAnswer(f.capture());
  const attempt = f.api.store.getProfile().attempts[0];
  const exposure = f.api.store.getProfile().exposures[0];
  assert.equal(exposure.kind, 'transcript-history');
  assert.equal(exposure.affectsListening, true);
  assert.equal(exposure.affectsProduction, false);
  assert.deepEqual(attempt.exposureKinds, ['transcript-history']);
  assert.equal(attempt.productionCondition, 'independent');
  assert.equal(attempt.listeningCondition, 'assisted');
  assert.equal(f.api.store.summary().exposureCount, 1);
});

test('new typed answers are ignored by the voice-only experience bridge', () => {
  const f = setup(); f.begin();
  f.api.noteAnswer(f.capture({ source: 'text', answer: 'Water, please.' }));
  f.api.renderReview();
  const result = f.api.store.summary();
  assert.equal(f.api.store.getProfile().attempts.length, 0);
  assert.equal(result.textCount, 0);
  assert.equal(result.voiceEnglishCount, 0);
  assert.equal(result.independentCount, 0);
  assert.equal(f.nodes.get('reviewSpoken').textContent, '0 次英语开口');
});

test('a new learner begins the playable coffee journey instead of an unrelated shell scene', () => {
  const f = setup({ coffeeJourney: {
    completed: [], nextMissionId: 'C01', nextMissionTitle: '第一次自己点咖啡',
  } });
  f.api.startHome();
  assert.equal(f.starts.length, 1);
  assert.equal(f.starts[0].sceneId, 'coffee');
  assert.equal(f.starts[0].options.resumeCheckpoint, null);
});

test('page exit saves a partial task and home passes a restorable checkpoint after reload', () => {
  const f = setup();
  f.state.practiceMode = 'listening';
  const sessionId = f.begin();
  f.state.breakfast = { drink: 'milk', cupPlaced: false, amount: null };
  f.state.sessionGoals['breakfast-drink'].meaningAccepted = true;
  f.api.noteHelp(1, 'meaning');
  f.window.dispatch('pagehide');
  const saved = f.api.store.getCheckpoint();
  assert.equal(saved.taskIndex, 0);
  assert.equal(saved.breakfast.drink, 'milk');
  assert.equal(saved.goalRecords['breakfast-drink'].supportLevel, 1);
  assert.equal(f.api.store.summary().completedSessions, 0);

  const restored = setup({ storage: f.storage });
  restored.api.startHome();
  const { sceneId, options } = restored.starts[0];
  assert.equal(sceneId, 'kitchen');
  assert.equal(options.skipIntro, true);
  assert.equal(options.subtitlesHidden, true);
  assert.equal(options.resumeCheckpoint.sessionId, sessionId);
  assert.deepEqual(options.resumeCheckpoint.breakfast, saved.breakfast);
  assert.equal(restored.begin(options.resumeCheckpoint), sessionId);
  assert.equal(restored.api.store.summary().sessionCount, 1);
  assert.equal(restored.api.supportLevel(), 1);
});

test('task-complete keeps the next task checkpoint when visibility and pagehide fire', () => {
  const f = setup(); f.begin();
  f.state.breakfast.drink = 'water';
  f.state.coveredGoals.add('breakfast-drink');
  f.state.sessionGoals['breakfast-drink'].meaningAccepted = true;
  f.state.stage = 'task-complete';
  f.api.checkpoint(1);
  f.document.visibilityState = 'hidden';
  f.document.dispatch('visibilitychange');
  f.window.dispatch('pagehide');
  const saved = f.api.store.getCheckpoint();
  assert.equal(saved.taskIndex, 1);
  assert.deepEqual(saved.coveredGoals, ['breakfast-drink']);
  assert.equal(saved.breakfast.drink, 'water');
  assert.equal(f.api.store.summary().completedSessions, 0);
  const restored = setup({ storage: f.storage });
  restored.api.startHome();
  assert.equal(restored.starts[0].options.resumeCheckpoint.taskIndex, 1);
  restored.begin(restored.starts[0].options.resumeCheckpoint);
  assert.equal(restored.state.taskIndex, 1);
  assert.equal(restored.state.sessionGoals['breakfast-drink'].meaningAccepted, true);
});

test('completing a session clears recovery and late page lifecycle events do not recreate it', () => {
  const f = setup(); f.begin();
  assert.ok(f.api.store.getCheckpoint());
  f.state.stage = 'complete';
  f.state.sessionSaved = true;
  f.api.complete();
  f.window.dispatch('pagehide');
  f.document.visibilityState = 'hidden';
  f.document.dispatch('visibilitychange');
  assert.equal(f.api.store.getCheckpoint(), null);
  assert.equal(f.api.store.summary().completedSessions, 1);
  assert.equal(f.api.store.summary().independentCount, 0);
  assert.equal(setup({ storage: f.storage }).api.store.getCheckpoint(), null);
});

test('review transfer opens the promised different scene even with other practice due', () => {
  for (const [sceneId, expected] of [['kitchen', 'coffee'], ['coffee', 'airport'], ['airport', 'office'], ['office', 'kitchen']]) {
    const f = setup({sceneId}); f.begin();
    f.state.stage = 'complete'; f.api.complete();
    f.api.startTransfer({fromReview: true});
    assert.equal(f.starts[0].sceneId, expected);
    assert.equal(f.starts[0].options.subtitlesHidden, false);
  }
});

test('home and review use the same four-scene progression', () => {
  const rotation = [
    ['kitchen', 'coffee', '去咖啡店，试着点一杯喜欢的饮品'],
    ['coffee', 'airport', '去机场，试着回应登机牌请求'],
    ['airport', 'office', '见一位新同事，试着打招呼'],
    ['office', 'kitchen', '回到早餐，试着自己作选择'],
  ];
  for (const [sceneId, expected, title] of rotation) {
    const f = setup({ sceneId }); f.begin();
    f.state.stage = 'complete'; f.api.complete();
    f.api.renderReview();
    assert.equal(f.nodes.get('reviewTransferTitle').textContent, title);
    f.api.startHome();
    assert.equal(f.starts[0].sceneId, expected);
  }
});

test('coffee review keeps the learner inside the next quest instead of jumping to the airport', () => {
  const f = setup({ sceneId: 'coffee', coffeeJourney: {
    completed: ['C01'], nextMissionId: 'C02', nextMissionTitle: '替朋友点对那一杯',
  } });
  f.begin();
  f.state.stage = 'complete';
  f.api.complete();
  f.api.renderReview();
  assert.equal(f.nodes.get('reviewTransferTitle').textContent, '下一关：替朋友点对那一杯');
  assert.match(f.nodes.get('reviewTransferCopy').textContent, /朋友的目标订单/);
  assert.equal(f.nodes.get('repeatScene').textContent, '继续任务 C02');
  f.api.startHome();
  assert.equal(f.starts[0].sceneId, 'coffee');
});

test('coffee remembers the selected mission but restarts its dialogue on the next visit', () => {
  const f = setup({ sceneId: 'coffee' });
  f.state.coffeeMissionId = 'C03';
  const sessionId = f.begin();
  f.state.coffee = { missionId: 'C03', drink: 'americano', size: 'large', service: null, received: false };
  f.state.coveredGoals = new Set(['coffee-order', 'coffee-size']);
  f.state.taskIndex = 2;
  f.api.taskStarted();
  f.api.noteHelp(1, 'meaning');
  f.window.dispatch('pagehide');
  const saved = f.api.store.getCheckpoint();
  assert.equal(saved.taskIndex, 0);
  assert.equal(saved.missionId, 'C03');
  assert.equal(saved.coffee, undefined);
  assert.equal(saved.coveredGoals, undefined);
  assert.equal(saved.goalRecords, undefined);
  assert.equal(f.api.store.summary().completedSessions, 0);

  const restored = setup({ sceneId: 'coffee', storage: f.storage });
  restored.api.renderHome();
  assert.equal(restored.primaryCta.textContent, '继续任务');
  assert.equal(restored.nodes.get('chooseCoffeeMission').hidden, false);
  restored.api.startHome();
  const { sceneId, options } = restored.starts[0];
  assert.equal(sceneId, 'coffee');
  assert.equal(options.skipIntro, true);
  assert.equal(options.missionId, 'C03');
  assert.equal(options.resumeCheckpoint.sessionId, sessionId);
  restored.api.startHome({ chooseMission: true });
  assert.equal(restored.starts[1].options.skipIntro, false);
  assert.equal(restored.starts[1].options.resumeCheckpoint.sessionId, sessionId);
  restored.api.store.discardCheckpoint({ sessionId });
  restored.state.coffeeMissionId = options.missionId;
  const newSessionId = restored.begin();
  assert.notEqual(newSessionId, sessionId);
  assert.equal(restored.state.taskIndex, 0);
  assert.equal(restored.api.supportLevel(), 0);
  assert.equal(restored.api.store.summary().sessionCount, 2);
  assert.equal(restored.api.store.getCheckpoint().sessionId, newSessionId);
  assert.equal(restored.api.store.summary().completedSessions, 0);
  assert.ok(restored.api.store.getProfile().exposures.some(item => item.sessionId === sessionId));
});

test('a spoken coffee drink choice shares its practice target with breakfast', () => {
  const f = setup({ sceneId: 'coffee' }); f.begin();
  f.api.noteAnswer(f.capture({ answer: 'A latte, please.', source: 'voice' }));
  const attempt = f.api.store.getProfile().attempts[0];
  assert.equal(attempt.targetId, 'choose-drink');
  assert.equal(attempt.sceneId, 'coffee');
  assert.equal(attempt.source, 'voice');
  assert.equal(f.api.store.summary().independentCount, 1);
});

test('learning notes render due practice and real support needs without treating technical errors as learner weakness', () => {
  const f = setup();
  const sessionId = f.begin();
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  f.api.store.recordAttempt({
    id: 'supported-success', sessionId, sceneId: 'kitchen', taskId: 'breakfast-drink', targetId: 'choose-drink',
    source: 'voice', language: 'en', supportLevel: 3, conditionsTracked: true,
    challengeType: 'guided', promptModality: 'audio-text', outcome: 'success', at: twoDaysAgo,
  });
  f.api.store.recordAttempt({
    id: 'unconfirmed-retry', sessionId, sceneId: 'kitchen', taskId: 'breakfast-drink', targetId: 'choose-drink',
    source: 'voice', language: 'en', supportLevel: 0, conditionsTracked: true,
    challengeType: 'guided', promptModality: 'audio-text', outcome: 'unconfirmed',
  });
  f.api.store.recordAttempt({
    id: 'microphone-failure', sessionId, sceneId: 'kitchen', taskId: 'breakfast-cup', targetId: 'offer-item',
    source: 'voice', language: 'unknown', supportLevel: null, conditionsTracked: true,
    challengeType: 'guided', promptModality: 'audio-text', outcome: 'technical-error',
  });
  f.state.stage = 'complete';
  f.api.complete();
  f.api.render();

  assert.equal(f.nodes.get('reviewOverviewTitle').textContent, '1 项今天适合再练');
  assert.equal(f.nodes.get('reviewQueueList').children.length, 1);
  assert.equal(f.nodes.get('strengthCount').textContent, '1 项');
  assert.equal(f.nodes.get('strengthList').children.length, 1);
  assert.match(f.nodes.get('strengthList').children[0].children[1].children[1].textContent, /意思未确认/);
  assert.equal(f.nodes.get('achievementCompleted').textContent, '1');
  assert.equal(f.nodes.get('achievementIndependent').textContent, '0');
  assert.doesNotMatch(f.nodes.get('growthSummary').textContent, /发音|语法|掌握率/);

  const previewButton = f.nodes.get('strengthList').children[0].children[2];
  previewButton.dispatch('click');
  assert.deepEqual(f.previews, [{ sceneId: 'kitchen', missionId: null }]);
  assert.equal(f.starts.length, 0, 'a note item opens preview without starting voice practice');

  f.nodes.get('startReview').dispatch('click');
  assert.equal(f.starts.length, 1);
  assert.equal(f.starts[0].sceneId, 'kitchen');
  assert.deepEqual(f.starts[0].options.reviewTargetIds, ['choose-drink']);
});

test('learning-note achievements count completed experiences, independent production, targets, and bounded transfer', () => {
  const f = setup();
  f.begin();
  f.api.noteAnswer(f.capture({ answer: 'Milk, please.' }));
  f.state.stage = 'complete';
  f.api.complete();

  f.state.selectedScene = 'coffee';
  f.begin();
  f.api.noteAnswer(f.capture({ answer: 'A latte, please.' }));
  f.state.stage = 'complete';
  f.api.complete();
  f.api.render();

  assert.equal(f.nodes.get('achievementCompleted').textContent, '2');
  assert.equal(f.nodes.get('achievementIndependent').textContent, '2');
  assert.equal(f.nodes.get('achievementTargets').textContent, '1');
  assert.equal(f.nodes.get('achievementTransfer').textContent, '1');
  assert.equal(f.nodes.get('learningHistory').children.length, 2);
  assert.match(f.nodes.get('learningHistory').children[0].children[1].children[1].textContent, /独立表达/);
});

test('today review previews only two due items before the main action', () => {
  const f = setup();
  const sessionId = f.begin();
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  for (const [index, targetId] of ['choose-drink', 'offer-item', 'adjust-amount', 'confirm-belonging'].entries()) {
    f.api.store.recordAttempt({
      id: `due-${index}`, sessionId, sceneId: 'kitchen', taskId: `task-${index}`, targetId,
      source: 'voice', language: 'en', supportLevel: 2, conditionsTracked: true,
      challengeType: 'guided', promptModality: 'audio-text', outcome: 'success', at: twoDaysAgo,
    });
  }
  f.api.render();

  assert.equal(f.nodes.get('reviewOverviewTitle').textContent, '4 项今天适合再练');
  assert.equal(f.nodes.get('reviewQueueList').children.length, 3);
  assert.equal(f.nodes.get('reviewQueueList').children.filter(child => child.className.includes('learning-note-row')).length, 2);
  assert.equal(f.nodes.get('reviewQueueList').children[2].textContent, '另外 2 项今天也可以逐项练习。');
});

test('today review bypasses another saved scene and starts at the due target task', () => {
  const f = setup();
  const kitchenSession = f.begin();
  f.api.store.saveCheckpoint({ sessionId: kitchenSession, sceneId: 'kitchen', taskIndex: 1 });
  const coffeeSession = f.api.store.beginSession({
    sceneId: 'coffee', missionId: 'C04', variantId: 'C04-large-americano-here',
  });
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  f.api.store.recordAttempt({
    id: 'due-service', sessionId: coffeeSession, sceneId: 'coffee', taskId: 'coffee-service',
    targetId: 'choose-service', missionId: 'C04', variantId: 'C04-large-americano-here',
    source: 'voice', language: 'en', supportLevel: 2, conditionsTracked: true,
    challengeType: 'guided', promptModality: 'audio-text', outcome: 'success', at: twoDaysAgo,
  });

  f.nodes.get('startReview').dispatch('click');

  assert.equal(f.starts.length, 1);
  assert.equal(f.starts[0].sceneId, 'coffee');
  assert.deepEqual(f.starts[0].options.reviewTargetIds, ['choose-service']);
  assert.equal(f.starts[0].options.reviewTaskId, 'coffee-service');
  assert.equal(f.starts[0].options.startTaskIndex, 2);
  assert.equal(f.starts[0].options.missionId, 'C04');
  assert.equal(f.starts[0].options.reviewItems.length, 1);
  assert.equal(f.api.store.getCheckpoint({ sceneId: 'kitchen' }).sessionId, kitchenSession);
});

test('home review action starts at the due target instead of replaying the scene from task one', () => {
  const f = setup({ coffeeJourney: { completed: ['C01', 'C02', 'C03', 'C04'], nextMissionId: null } });
  const coffeeSession = f.api.store.beginSession({
    sceneId: 'coffee', missionId: 'C04', variantId: 'C04-large-americano-here',
  });
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  f.api.store.recordAttempt({
    id: 'home-due-service', sessionId: coffeeSession, sceneId: 'coffee', taskId: 'coffee-service',
    targetId: 'choose-service', missionId: 'C04', variantId: 'C04-large-americano-here',
    source: 'voice', language: 'en', supportLevel: 2, conditionsTracked: true,
    challengeType: 'guided', promptModality: 'audio-text', outcome: 'success', at: twoDaysAgo,
  });

  f.api.renderHome();
  assert.equal(f.nodes.get('chooseCoffeeMission').hidden, false);
  f.api.startHome();

  assert.equal(f.starts.length, 1);
  assert.equal(f.starts[0].sceneId, 'coffee');
  assert.equal(f.starts[0].options.reviewTaskId, 'coffee-service');
  assert.equal(f.starts[0].options.startTaskIndex, 2);
  assert.deepEqual(f.starts[0].options.reviewTargetIds, ['choose-service']);
  assert.equal(f.starts[0].options.missionId, 'C04');
  f.api.startHome({ chooseMission: true });
  assert.equal(f.starts[1].options.skipIntro, false);
  assert.equal(f.starts[1].options.reviewTaskId, null);
  assert.equal(f.starts[1].options.startTaskIndex, 0);
  assert.equal(f.starts[1].options.reviewTargetIds.length, 0);
});

test('review button falls back to the most recently completed scene when nothing is due', () => {
  const f = setup({ sceneId: 'airport' });
  f.begin();
  f.api.noteAnswer(f.capture({ answer: 'Here you are.' }));
  f.state.stage = 'complete';
  f.api.complete();
  assert.equal(f.api.store.summary().dueCount, 0);

  f.nodes.get('startReview').dispatch('click');
  assert.equal(f.starts.length, 1);
  assert.equal(f.starts[0].sceneId, 'airport');
});

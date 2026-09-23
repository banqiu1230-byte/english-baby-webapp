const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Learning = require('./learning-evidence');
const WorldLoop = require('./world-learning-loop');

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
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
      toggle(name, force = !classes.has(name)) { if (force) classes.add(name); else classes.delete(name); return force; },
    };
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
  getAttribute(name) { return this[name] ?? null; }
  removeAttribute(name) { delete this[name]; }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  dispatch(type) { for (const callback of this.listeners.get(type) || []) callback({}); }
  focus() {}
}

function setup({ sceneId = 'kitchen', storage = memoryStorage(), coffeeJourney = null, activeTaskIds = null } = {}) {
  const guidance = new Element();
  const nodes = new Map([
    'learningHelpPanel', 'learningHelpContent', 'reviewSpoken', 'reviewTransferTitle', 'reviewTransferCopy',
    'repeatScene', 'todayTitle', 'openDialogueHistory', 'learningNotesTitle', 'growthSummary',
    'reviewOverviewTitle', 'reviewOverviewCopy', 'startReview', 'reviewQueueList', 'strengthCount',
    'strengthList', 'achievementCompleted', 'achievementIndependent', 'achievementTargets',
    'achievementTransfer', 'learningHistory', 'todayMissionCode', 'adventureJourneyTitle', 'adventureRoute',
    'chooseCoffeeMission', 'todaySubtitle', 'todayContext', 'todayHero',
    'worldChapter', 'worldChapterLabel', 'worldChapterTitle', 'worldChapterReason',
    'worldFocus', 'worldFocusTitle', 'worldFocusReason', 'worldFocusMeaning', 'worldFocusKeyword',
    'worldFocusReveal', 'worldFocusExample', 'worldFocusTry', 'worldAlternative',
    'worldEvidenceSection', 'worldEvidenceTitle', 'worldEvidenceList', 'notesEvidenceList', 'notesEvidenceHistory', 'learningStageLabel',
    'reviewEvidenceList', 'reviewRecast',
    'notesReviewCount', 'notesReviewScene', 'notesReviewEyebrow', 'notesReviewImage', 'notesPracticeFold', 'notesHistorySummary',
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
  const window = Object.assign(new Element(), { localStorage: storage, LumaWorldLoop: WorldLoop });
  helpButton.focus = () => { document.activeElement = helpButton; };
  const context = vm.createContext({ window, document, LumaLearning: Learning, LumaWorldLoop: WorldLoop });
  vm.runInContext(experienceSource, context, { filename: 'learning-experience.js' });
  const api = window.LumaExperience;
  const state = {
    selectedScene: sceneId, practiceMode: 'guided', sceneStarted: false,
    stage: 'idle', sessionSaved: false, taskIndex: 0,
    breakfast: { drink: null, cupPlaced: false, amount: null },
    coffee: { drink: null, size: null, service: null, received: false },
    coveredGoals: new Set(), sessionGoals: {}, dialogueHistory: [],
  };
  const taskIds = () => activeTaskIds || sceneTasks[state.selectedScene];
  const task = () => ({ id: taskIds()[state.taskIndex], prompt: 'A short question.' });
  const starts = [], previews = [], guidanceEvents = [], selectedMissions = [];
  api.bind({
    state: () => state, task,
    goal: () => state.sessionGoals[task().id] ||= {},
    taskCount: () => taskIds().length, taskIds,
    start: (nextScene, options) => starts.push({ sceneId: nextScene, options }),
    preview: (nextScene, missionId) => previews.push({ sceneId: nextScene, missionId }),
    selectCoffeeMission: missionId => { selectedMissions.push(missionId); state.coffeeMissionId = missionId; },
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
  return { api, state, storage, guidance, guidanceEvents, document, window, nodes, journeySwitch, primaryCta, starts, previews, selectedMissions, begin, capture };
}

test('resuming another scene cannot inherit coffee mission labels or a visible coffee route', () => {
  for (const [sceneId, title] of [['airport', '出发的这一天'], ['office', '第一次拜访'], ['kitchen', '熟悉的早晨']]) {
    const f = setup({ sceneId });
    f.state.coffeeMissionId = 'C04';
    f.state.coffeeVariantId = 'small-americano-here';
    f.begin(); f.api.checkpoint(); f.api.renderHome();
    assert.equal(f.api.store.getCheckpoint().missionId, null);
    assert.equal(f.api.store.getCheckpoint().variantId, null);
    assert.equal(f.nodes.get('todayMissionCode').textContent, '上次的故事');
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

for (const [help, exposureKind, productionCondition] of [
  ['meaning', 'meaning', 'independent'],
  ['keyword', 'keyword', 'assisted'],
  ['example', 'full-example', 'assisted'],
]) {
  test(`${help} help records its actual effect on listening and speaking`, () => {
    const f = setup();
    f.state.practiceMode = 'listening';
    f.state.subtitlesHidden = true;
    f.begin();
    f.api.openHelp(help);
    f.api.closeHelp();
    f.api.noteAnswer(f.capture());
    const attempt = f.api.store.getProfile().attempts[0];
    assert.ok(attempt.exposureKinds.includes(exposureKind));
    assert.equal(attempt.productionCondition, productionCondition);
    if (help === 'meaning') assert.equal(attempt.listeningCondition, 'assisted');
    assert.equal(f.api.store.summary().completedSessions, 0, 'opening help never completes a mission');
  });
}

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

test('page exit remembers the breakfast mission and mode without saving a partially completed drink', () => {
  const f = setup();
  f.state.practiceMode = 'listening';
  const sessionId = f.begin();
  f.state.breakfast = { drink: 'milk', cupPlaced: false, amount: null };
  f.state.sessionGoals['breakfast-drink'].meaningAccepted = true;
  f.api.noteHelp(1, 'meaning');
  f.window.dispatch('pagehide');
  const saved = f.api.store.getCheckpoint();
  assert.equal(saved.taskIndex, 0);
  assert.equal(saved.breakfast, undefined);
  assert.equal(saved.goalRecords, undefined);
  assert.equal(saved.coveredGoals, undefined);
  assert.equal(f.api.store.summary().completedSessions, 0);

  const restored = setup({ storage: f.storage });
  restored.api.startHome();
  const { sceneId, options } = restored.starts[0];
  assert.equal(sceneId, 'kitchen');
  assert.equal(options.skipIntro, true);
  assert.equal(options.subtitlesHidden, true);
  assert.equal(options.resumeCheckpoint.sessionId, sessionId);
  assert.equal(options.resumeCheckpoint.taskIndex, 0);
  assert.equal(options.resumeCheckpoint.breakfast, undefined);
  // app.js discards the recovery marker and creates a new attempt when resuming
  // a whole mission. Old evidence remains, but cannot pre-answer the new one.
  restored.api.store.discardCheckpoint({ sessionId });
  const newSession = restored.begin();
  assert.notEqual(newSession, sessionId);
  assert.equal(restored.api.store.summary().sessionCount, 2);
  assert.equal(restored.api.supportLevel(), 0);
  assert.deepEqual(restored.state.breakfast, { drink: null, cupPlaced: false, amount: null });
  assert.ok(restored.api.store.getProfile().exposures.some(item => item.sessionId === sessionId));
});

test('task-complete and late lifecycle events never turn breakfast recovery into an internal-step save', () => {
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
  assert.equal(saved.taskIndex, 0);
  assert.equal(saved.coveredGoals, undefined);
  assert.equal(saved.goalRecords, undefined);
  assert.equal(saved.breakfast, undefined);
  assert.equal(f.api.store.summary().completedSessions, 0);
  const restored = setup({ storage: f.storage });
  restored.api.startHome();
  assert.equal(restored.starts[0].options.resumeCheckpoint.taskIndex, 0);
  assert.equal(restored.starts[0].options.startTaskIndex, 0);
  assert.equal(restored.starts[0].options.resumeCheckpoint.goalRecords, undefined);
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

test('home and review recommend the same bounded coffee and breakfast continuation', () => {
  const rotation = [
    ['kitchen', 'coffee', '下次出门，再点一杯', 'Milk, please.'],
    ['coffee', 'kitchen', '回到家，一起准备早餐', 'A latte, please.'],
  ];
  for (const [sceneId, expected, title, answer] of rotation) {
    const f = setup({ sceneId }); f.begin();
    f.api.noteAnswer(f.capture({ answer }));
    f.state.stage = 'complete'; f.api.complete();
    f.api.renderReview();
    assert.equal(f.nodes.get('reviewTransferTitle').textContent, title);
    f.api.startHome();
    assert.equal(f.starts[0].sceneId, expected);
    f.api.startTransfer({ fromReview: true });
    assert.equal(f.starts[1].sceneId, expected);
    assert.equal(f.starts[0].options.subtitlesHidden, f.starts[1].options.subtitlesHidden);
  }
});

test('supported coffee completion recommends an optional lighter-support retry instead of fixed mission advancement', () => {
  const f = setup({ sceneId: 'coffee', coffeeJourney: {
    completed: ['C01'], nextMissionId: 'C02', nextMissionTitle: '替朋友点对那一杯',
  } });
  f.state.coffeeMissionId = 'C01';
  f.begin();
  f.api.openHelp('example');
  f.api.noteAnswer(f.capture({ answer: 'A latte, please.' }));
  f.state.stage = 'complete';
  f.api.complete();
  f.api.renderReview();
  assert.equal(f.nodes.get('reviewTransferTitle').textContent, '今天，再去见见 Mia');
  assert.match(f.nodes.get('reviewTransferCopy').textContent, /随时打开/);
  assert.equal(f.nodes.get('repeatScene').textContent, '先听着试一次');
  assert.equal(f.nodes.get('worldAlternative').hidden, false);
  f.api.startHome();
  assert.equal(f.starts[0].sceneId, 'coffee');
  assert.equal(f.starts[0].options.missionId, 'C01');
  assert.equal(f.starts[0].options.subtitlesHidden, true);
  f.nodes.get('worldAlternative').dispatch('click');
  assert.equal(f.starts[1].sceneId, 'kitchen');
  assert.equal(f.starts[1].options.subtitlesHidden, false);
});

function completedFocusFixture() {
  const f = setup({ sceneId: 'coffee' });
  f.state.coffeeMissionId = 'C01';
  f.begin();
  f.api.openHelp('example');
  f.api.closeHelp();
  f.api.noteAnswer(f.capture({ answer: 'A latte, please.' }));
  f.state.stage = 'complete';
  f.api.complete();
  f.api.renderReview();
  assert.equal(f.nodes.get('worldFocus').hidden, false);
  return f;
}

test('optional focus records viewed keyword and example without inventing a practice session or answer', () => {
  const f = completedFocusFixture();
  const before = f.api.store.getProfile();
  assert.equal(before.exposures.filter(item => item.id.includes(':focus:')).length, 0);
  f.nodes.get('worldFocus').open = true;
  f.nodes.get('worldFocus').dispatch('toggle');
  f.nodes.get('worldFocusReveal').dispatch('click');
  const after = f.api.store.getProfile();
  assert.equal(after.sessions.length, before.sessions.length);
  assert.equal(after.attempts.length, before.attempts.length);
  const studied = after.exposures.filter(item => item.id.includes(':focus:'));
  assert.deepEqual(studied.map(item => item.kind).sort(), ['full-example', 'keyword']);
  assert.equal(f.nodes.get('worldFocusExample').hidden, false);
  assert.match(f.nodes.get('worldFocusExample').textContent, /latte/i);
  f.nodes.get('worldFocusTry').dispatch('click');
  assert.equal(f.starts[0].sceneId, 'coffee');
  assert.equal(f.starts[0].options.missionId, 'C01');
  assert.equal(f.starts[0].options.subtitlesHidden, false);
  assert.equal(f.api.store.getProfile().sessions.length, before.sessions.length);
});

test('a viewed focus example remains assisted after reload and applies only to the next matching encounter', () => {
  const f = completedFocusFixture();
  f.nodes.get('worldFocus').open = true;
  f.nodes.get('worldFocus').dispatch('toggle');
  f.nodes.get('worldFocusReveal').dispatch('click');
  const restored = setup({ sceneId: 'coffee', storage: f.storage });
  restored.state.coffeeMissionId = 'C01';
  restored.begin();
  restored.api.noteAnswer(restored.capture({ answer: 'A latte, please.' }));
  let attempt = restored.api.store.getProfile().attempts.at(-1);
  assert.equal(attempt.productionCondition, 'assisted');
  assert.ok(attempt.exposureKinds.includes('full-example'));
  assert.equal(attempt.supportLevel, 3);
  restored.state.stage = 'complete';
  restored.api.complete();
  restored.begin();
  restored.api.noteAnswer(restored.capture({ answer: 'An americano, please.' }));
  attempt = restored.api.store.getProfile().attempts.at(-1);
  assert.equal(attempt.productionCondition, 'independent', 'previous carried exposure must not recursively become a new study event');
  assert.equal(attempt.exposureKinds.includes('full-example'), false);
});

for (const outcome of ['no-answer', 'technical-error']) {
  test(`focus study survives leaving before a usable target answer (${outcome}) and restarting after reload`, () => {
    const f = completedFocusFixture();
    f.nodes.get('worldFocusReveal').dispatch('click');
    const interrupted = setup({ sceneId: 'coffee', storage: f.storage });
    interrupted.state.coffeeMissionId = 'C01';
    const interruptedSession = interrupted.begin();
    if (outcome === 'technical-error') interrupted.api.noteAnswer(interrupted.capture({ answer: '' }), 'technical-error');
    interrupted.window.dispatch('pagehide');
    const profile = interrupted.api.store.getProfile();
    assert.ok(profile.exposures.some(item => item.sessionId === interruptedSession && item.kind === 'full-example'));
    assert.equal(profile.attempts.filter(item => item.sessionId === interruptedSession && item.outcome === 'success').length, 0);

    const restored = setup({ sceneId: 'coffee', storage: f.storage });
    restored.api.startHome();
    const options = restored.starts[0].options;
    assert.equal(options.resumeCheckpoint.sessionId, interruptedSession);
    assert.equal(options.resumeCheckpoint.taskIndex, 0);
    restored.api.store.discardCheckpoint({ sessionId: interruptedSession });
    restored.state.coffeeMissionId = options.missionId;
    const retriedSession = restored.begin();
    assert.notEqual(retriedSession, interruptedSession);
    restored.api.noteAnswer(restored.capture({ answer: 'A latte, please.' }));
    const answer = restored.api.store.getProfile().attempts.at(-1);
    assert.equal(answer.sessionId, retriedSession);
    assert.equal(answer.productionCondition, 'assisted');
    assert.equal(answer.supportLevel, 3);
    assert.ok(answer.exposureKinds.includes('full-example'));
  });
}

test('an unrelated encounter does not consume or inherit focus study for a different capability', () => {
  const f = completedFocusFixture();
  f.nodes.get('worldFocusReveal').dispatch('click');
  const restored = setup({ sceneId: 'airport', storage: f.storage });
  restored.begin();
  restored.api.noteAnswer(restored.capture({ answer: 'Here you are.' }));
  assert.equal(restored.api.store.getProfile().attempts.at(-1).productionCondition, 'independent');
  restored.state.selectedScene = 'kitchen';
  restored.begin();
  restored.api.noteAnswer(restored.capture({ answer: 'Milk, please.' }));
  const breakfast = restored.api.store.getProfile().attempts.at(-1);
  assert.equal(breakfast.targetId, 'choose-drink');
  assert.equal(breakfast.productionCondition, 'assisted');
  assert.ok(breakfast.exposureKinds.includes('full-example'));
});

test('a coffee repair mission without a drink-choice task leaves drink study available for its actual retry', () => {
  const f = completedFocusFixture();
  f.nodes.get('worldFocusReveal').dispatch('click');
  const repair = setup({ sceneId: 'coffee', storage: f.storage, activeTaskIds: ['coffee-size', 'coffee-thanks'] });
  repair.state.coffeeMissionId = 'C03';
  repair.begin();
  repair.api.noteAnswer(repair.capture({ answer: 'Small, please.' }));
  const repaired = repair.api.store.getProfile();
  assert.equal(repaired.attempts.at(-1).productionCondition, 'independent');
  assert.equal(repaired.exposures.filter(item => item.id.includes(':carry:')).length, 0);
  const retry = setup({ sceneId: 'coffee', storage: f.storage });
  retry.state.coffeeMissionId = 'C01';
  retry.begin();
  retry.api.noteAnswer(retry.capture({ answer: 'A latte, please.' }));
  assert.equal(retry.api.store.getProfile().attempts.at(-1).productionCondition, 'assisted');
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
  assert.equal(restored.primaryCta.textContent, '继续这件事');
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

  assert.equal(f.nodes.get('reviewOverviewTitle').textContent, '再选一杯喜欢的饮料');
  assert.equal(f.nodes.get('notesReviewCount').textContent, '1 项待复习');
  assert.equal(f.nodes.get('reviewQueueList').children.length, 0);
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

test('today review keeps one concrete activity and summarizes other due items', () => {
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

  assert.equal(f.nodes.get('notesReviewCount').textContent, '4 项待复习');
  assert.equal(f.nodes.get('reviewQueueList').children.length, 1);
  assert.match(f.nodes.get('reviewQueueList').children[0].textContent, /还可以复习/);
  assert.equal(f.nodes.get('reviewQueueList').children.filter(child => child.className.includes('learning-note-row')).length, 0);
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

test('home continues the remembered mission before due practice while the review entry remains independent', () => {
  const f = setup({ sceneId: 'kitchen' });
  const kitchenSession = f.begin();
  f.state.taskIndex = 2;
  f.api.checkpoint();
  const coffeeSession = f.api.store.beginSession({ sceneId: 'coffee', missionId: 'C02' });
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  f.api.store.recordAttempt({
    id: 'due-coffee-size', sessionId: coffeeSession, sceneId: 'coffee', taskId: 'coffee-size',
    targetId: 'choose-size', missionId: 'C02', source: 'voice', language: 'en',
    supportLevel: 2, conditionsTracked: true, promptModality: 'audio-text', outcome: 'success', at: twoDaysAgo,
  });
  f.api.renderHome();
  assert.equal(f.primaryCta.textContent, '继续这件事');
  f.api.startHome();
  assert.equal(f.starts[0].sceneId, 'kitchen');
  assert.equal(f.starts[0].options.resumeCheckpoint.sessionId, kitchenSession);
  assert.equal(f.starts[0].options.startTaskIndex, 0);
  f.nodes.get('startReview').dispatch('click');
  assert.equal(f.starts[1].sceneId, 'coffee');
  assert.equal(f.starts[1].options.reviewTaskId, 'coffee-size');
  assert.equal(f.starts[1].options.startTaskIndex, 1);
  assert.equal(f.api.store.getCheckpoint({ sceneId: 'kitchen' }).sessionId, kitchenSession);
});

test('result continuation consumes the same saved mission as home instead of creating a parallel unfinished attempt', () => {
  const f = setup({ sceneId: 'kitchen' });
  const kitchenSession = f.begin();
  f.api.checkpoint();
  f.state.selectedScene = 'coffee';
  f.state.coffeeMissionId = 'C01';
  f.begin();
  f.api.noteAnswer(f.capture({ answer: 'A latte, please.' }));
  f.state.stage = 'complete';
  f.api.complete();
  f.api.renderReview();
  assert.equal(f.nodes.get('repeatScene').textContent, '继续这件事');
  f.api.startTransfer({ fromReview: true });
  assert.equal(f.starts[0].sceneId, 'kitchen');
  assert.equal(f.starts[0].options.resumeCheckpoint?.sessionId, kitchenSession);
  assert.equal(f.starts[0].options.resumeCheckpoint.taskIndex, 0);
  assert.equal(f.starts[0].options.skipIntro, true);
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


function notesAttempt(f, { id, day, supportLevel = 0, source = 'voice', language = 'en', outcome = 'success', targetId = 'choose-drink', sceneId = 'coffee', promptModality = 'audio-text', utterance, heardQuestion }) {
  const sessionId = f.api.store.beginSession({ sceneId });
  return f.api.store.recordAttempt({ id, sessionId, sceneId, taskId: sceneId === 'coffee' ? 'coffee-order' : 'breakfast-drink', targetId,
    source, language, supportLevel, conditionsTracked: true, promptModality, outcome, utterance, heardQuestion,
    at: new Date(Date.now() - day * 86400000).toISOString() });
}

test('notes do not turn unchanged, less independent, or unknown records into a progress card', () => {
  for (const pair of [[0, 0], [0, 3], [null, 0], [3, 3]]) {
    const f = setup();
    notesAttempt(f, { id: 'before', day: 2, supportLevel: pair[0] });
    notesAttempt(f, { id: 'after', day: 1, supportLevel: pair[1] });
    f.api.render();
    assert.equal(f.nodes.get('worldEvidenceSection').hidden, true, JSON.stringify(pair));
    assert.equal(f.nodes.get('worldEvidenceList').children.length, 0);
    assert.equal(f.nodes.get('notesEvidenceList').children.length, 2, 'raw records remain available in collapsed history');
  }
});

test('notes show only the newest supported-to-independent improvement, without a mastery claim', () => {
  const f = setup();
  notesAttempt(f, { id: 'old-assisted', day: 4, supportLevel: 3 });
  notesAttempt(f, { id: 'old-free', day: 3 });
  notesAttempt(f, { id: 'new-assisted', day: 2, targetId: 'choose-size', supportLevel: 3 });
  notesAttempt(f, { id: 'new-free', day: 1, targetId: 'choose-size' });
  f.api.render();
  assert.equal(f.nodes.get('worldEvidenceSection').hidden, false);
  assert.equal(f.nodes.get('worldEvidenceList').children.length, 1);
  const card = f.nodes.get('worldEvidenceList').children[0];
  assert.equal(card.children[0].textContent, '说明想要的杯型');
  assert.match(card.children[1].children[1].children[1].textContent, /没看答案/);
  assert.doesNotMatch(card.children[2].textContent, /掌握|学会|百分/);
});

test('notes suppress stale success when the latest response remains unconfirmed', () => {
  const f = setup();
  notesAttempt(f, { id: 'assisted', day: 3, supportLevel: 3 });
  notesAttempt(f, { id: 'free', day: 2 });
  notesAttempt(f, { id: 'unconfirmed', day: 1, outcome: 'unconfirmed' });
  f.api.render();
  assert.equal(f.nodes.get('worldEvidenceSection').hidden, true);
});

const renderedText = node => [node.textContent || '', ...node.children.map(renderedText)].join(' ');

test('one notes takeaway preserves the exact heard line and successful voice reply', () => {
  const f = setup();
  notesAttempt(f, { id: 'phrase', day: 1, utterance: 'A latte, please.', heardQuestion: 'What would you like today?' });
  f.api.render();
  const cards = f.nodes.get('worldEvidenceList').children;
  assert.equal(cards.length, 1);
  assert.equal(f.nodes.get('worldEvidenceTitle').textContent, '这句英语，你用上了');
  assert.match(renderedText(cards[0]), /What would you like today\?/);
  assert.match(renderedText(cards[0]), /A latte, please\./);
  assert.doesNotMatch(renderedText(cards[0]), /掌握|学会了|听懂了/);
});

test('a reply with missing heard evidence never receives a reconstructed question', () => {
  const f = setup();
  notesAttempt(f, { id: 'phrase', day: 1, utterance: 'Small, please.', targetId: 'choose-size', supportLevel: null });
  f.api.render();
  const text = renderedText(f.nodes.get('worldEvidenceList'));
  assert.match(text, /Small, please\./);
  assert.match(text, /帮助条件尚未确认/);
  assert.doesNotMatch(text, /对方说|Would you|无字幕|未看答案/);
});

test('unconfirmed or typed utterances cannot become the latest spoken takeaway', () => {
  for (const invalid of [{ outcome: 'unconfirmed' }, { source: 'text' }, { language: 'zh' }]) {
    const f = setup();
    notesAttempt(f, { id: 'before', day: 2, utterance: 'A latte, please.' });
    notesAttempt(f, { id: 'later', day: 1, utterance: 'This is not a confirmed spoken response.', ...invalid });
    f.api.render();
    assert.equal(f.nodes.get('worldEvidenceSection').hidden, true);
  }
});

test('the evidence bridge stores exact captured dialogue, never its scripted question fallback', () => {
  const f = setup({ sceneId: 'coffee' });
  f.begin();
  f.api.noteAnswer(f.capture({ answer: 'An americano, please.', heardQuestion: 'What can I get you?', question: 'Scripted fallback.' }));
  let attempt = f.api.store.getProfile().attempts.at(-1);
  assert.equal(attempt.utterance, 'An americano, please.');
  assert.equal(attempt.heardQuestion, 'What can I get you?');
  f.api.noteAnswer(f.capture({ answer: 'Latte.', question: 'Scripted fallback.' }));
  attempt = f.api.store.getProfile().attempts.at(-1);
  assert.equal(attempt.heardQuestion, null);
});

test('completion shows one real response and its actual support condition', () => {
  const f = setup({ sceneId: 'coffee' });
  f.begin();
  f.api.noteHelp(3, 'example');
  f.api.noteAnswer(f.capture({ answer: 'A latte, please.', heardQuestion: 'What would you like?' }));
  f.api.renderReview();
  const text = renderedText(f.nodes.get('reviewEvidenceList'));
  assert.match(text, /What would you like\?/);
  assert.match(text, /A latte, please\./);
  assert.match(text, /完整示范/);
  assert.doesNotMatch(text, /未看答案|独立用出|掌握/);
  assert.equal(f.nodes.get('reviewRecast').hidden, true);
});

test('home resumes the saved life encounter without exposing its internal mission code', () => {
  const f = setup({ sceneId: 'coffee' });
  f.state.coffeeMissionId = 'C03'; f.state.coffeeVariantId = 'C03-wrong-large';
  f.begin(); f.api.renderHome();
  assert.equal(f.nodes.get('todayTitle').textContent, '拿到的咖啡，好像不太对');
  assert.match(f.nodes.get('todaySubtitle').textContent, /小杯拿铁.*带走.*留下这杯/);
  assert.doesNotMatch(f.nodes.get('todayMissionCode').textContent, /C03|任务|委托/);
  assert.equal(f.primaryCta.textContent, '继续这件事');
  assert.equal(f.nodes.get('chooseCoffeeMission').hidden, false);
  f.api.startHome();
  assert.equal(f.starts[0].options.missionId, 'C03');
  assert.equal(f.starts[0].options.skipIntro, true);
});


test('conversation header shows the person and place while task indices stay internal', () => {
  for (const [sceneId, expected] of [['coffee', 'Mia · 街角咖啡店'], ['kitchen', 'Luma · 家中早餐'], ['airport', '工作人员 · 机场'], ['office', '前台 · 初次拜访']]) {
    const f = setup({ sceneId });
    f.begin();
    assert.equal(f.nodes.get('learningStageLabel').textContent, expected);
    assert.doesNotMatch(f.nodes.get('learningStageLabel').textContent, /\d\s*\/|任务|第.*步/);
    if (sceneId === 'office') {
      f.state.taskIndex = 3; f.api.taskStarted();
      assert.equal(f.nodes.get('learningStageLabel').textContent, 'Maya · 初次拜访');
    }
  }
});

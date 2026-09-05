// Read-only diagnostic replay. App functions are extracted unchanged; browser,
// network and clock effects are mocked. No microphone or provider calls.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const rules = require(path.join(root, 'dialogue-rules.js'));
const VoiceRuntime = require(path.join(root, 'voice-runtime.js'));
const declarations = [...app.matchAll(/^(?:async )?function (\w+)\([^]*?^\}$/gm)];
const functions = new Map(declarations.map(match => [match[1], match[0]]));

function node() {
  const classes = new Set(['is-active']);
  return { dataset: {}, style: {}, hidden: false, textContent: '',
    classList: { contains: name => classes.has(name), add: (...names) => names.forEach(n => classes.add(n)),
      remove: (...names) => names.forEach(n => classes.delete(n)), toggle() {} },
    setAttribute() {}, removeAttribute() {} };
}

function harness(overrides = {}) {
  let now = 10000, serial = 0;
  const timers = new Map(), effects = [];
  const nodes = new Map();
  const getNode = name => { if (!nodes.has(name)) nodes.set(name, node()); return nodes.get(name); };
  const task = { id: 'milk', requiresAction: true, prompt: 'Can you find the milk?', question: 'What did you find?' };
  class Socket {
    static OPEN = 1;
    constructor() { this.readyState = 1; }
    send(data) { effects.push({ type: 'send', data: JSON.parse(data) }); }
    close() { this.readyState = 3; }
  }
  const sandbox = {
    console, Promise, Set, Map, Math, Float32Array, Int16Array, Buffer,
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    Date: class extends Date { static now() { return now; } },
    setTimeout(fn, ms) { const id = ++serial; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval() { throw Error('Unexpected interval'); }, clearInterval() {},
    localStorage: { getItem: () => null },
    document: { querySelector: getNode, visibilityState: 'visible' },
    window: { AudioContext: function() {} }, navigator: {},
    location: { protocol: 'https:', host: 'audit.invalid' }, WebSocket: Socket,
    DialogueRules: rules, VoiceRuntime, transcriptLedger: new VoiceRuntime.TranscriptLedger(), microphoneBuffer: new VoiceRuntime.PcmBuffer(),
    voiceStatus: getNode('voiceStatus'), preferences: { speechRate: '慢速' }, AbortController,
    TURN_PHASE: { LISTENING: 'listening', CHARACTER_SPEAKING: 'character-speaking' },
    BARGE_IN_GUARD_MS: 80, CONTINUATION_WINDOW_MS: 1200,
    currentTask: () => task, currentSceneConfig: () => ({ tasks: [task] }),
    scene: getNode('scene'), experience: getNode('experience'), micButton: getNode('micButton'), micLabel: getNode('micLabel'),
    renderDialogue() {}, setTurnPhase() {}, setMode() {}, ensureSceneVoiceIsOpen() {},
    claimExclusiveVoiceSession() {}, syncSceneProgress() {}, markGoalSpoken(text) { effects.push({ type: 'scored', text }); },
    taskRequirementsMet: () => false, updateDuplexTask() {}, clearCharacterCaptionReveal() {},
    flushDuplexTaskUpdate() {}, openCourtesyTurn() {}, completeMultimodalTask() {},
    requestLanguageFeedback(question, answer) { effects.push({ type: 'feedback', question, answer }); },
    publishDuplexSubtitle: () => false,
    showToast(text) { effects.push({ type: 'toast', text }); },
    characterHintLine: () => 'One word is okay.', recordHint() {},
    speakCharacterCue(text) { effects.push({ type: 'cue', text }); },
    ...overrides,
  };
  vm.createContext(sandbox);
  const stateStart = app.indexOf('const state = {');
  const stateEnd = app.indexOf('\n};', stateStart) + 3;
  vm.runInContext(app.slice(stateStart, stateEnd) + '\nglobalThis.state = state;', sandbox);
  Object.assign(sandbox.state, { sceneStarted: true, selectedScene: 'kitchen', taskIndex: 1,
    stage: 'active', handsFreeListening: true, activeQuestion: task.question });
  function load(...names) {
    names.flat().forEach(name => {
      assert.ok(functions.has(name), `Missing actual function: ${name}`);
      vm.runInContext(functions.get(name), sandbox);
    });
  }
  async function advance(ms) {
    const end = now + ms;
    for (;;) {
      const due = [...timers].filter(([, t]) => t.at <= end).sort((a,b) => a[1].at - b[1].at)[0];
      if (!due) break;
      const [id, timer] = due;
      timers.delete(id); now = timer.at; timer.fn();
      for (let i = 0; i < 5; i++) await Promise.resolve();
    }
    now = end;
    for (let i = 0; i < 5; i++) await Promise.resolve();
  }
  const shared = ['sceneVoiceIsOpen','captureUserTurnContext','setVoicePhase','liveTaskModeLabel',
    'taskNeedsAction','taskNeedsSpeech','isActionRequestLine','isActionAcknowledgement','normalizedSpeech',
    'transcriptItemId','responseEventId','responseQuestionId','rememberBounded','beginExpectedResponse',
    'retireExpectedResponse','acceptResponseEvent',
    'acceptTranscriptEvent',
    'clearLocalSpeechTurn','armVoiceTurnWatchdog','finalizeLearnerTranscript',
    'beginLocalSpeechTurn','clearReplyTimeout','armReplyTimeout','clearCharacterTurnWatchdog',
    'clearUserTurn','stopDuplexPlayback','isDuplexPlaybackActive',
    'isConversationPlaybackActive','isConversationTurnPending','scheduledCharacterLineBlocked',
    'clearIdleNudge','scheduleIdleNudge','sendDuplex','openLearnerTurn','cleanupSpeechCaptureUi',
    'addDialogueMessage','extractDuplexText',
    'armCharacterTurnWatchdog','connectDuplexSession','settleFailedDuplexTurn',
    'stopSpeechPlayback','updateLearnerTurn','confirmLearnerTurn','syncVoiceStatus','flushMicrophoneBuffer'];
  load(shared);
  return { c: sandbox, s: sandbox.state, task, effects, timers, advance, load };
}


module.exports = { harness, root };

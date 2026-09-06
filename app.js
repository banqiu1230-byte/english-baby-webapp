const appShell = document.querySelector('#appShell');
const bottomNav = document.querySelector('#bottomNav');
const views = [...document.querySelectorAll('[data-view]')];
const navButtons = [...document.querySelectorAll('[data-nav]')];
const sceneSheet = document.querySelector('#sceneSheet');
const sheetImage = document.querySelector('#sheetImage');
const sheetBadge = document.querySelector('#sheetBadge');
const sheetEyebrow = document.querySelector('#sheetEyebrow');
const sheetTitle = document.querySelector('#sheetTitle');
const sheetDescription = document.querySelector('#sheetDescription');
const sheetPeople = document.querySelector('#sheetPeople');
const sheetGoal = document.querySelector('#sheetGoal');
const sheetCta = document.querySelector('#sheetCta');
const experience = document.querySelector('#experience');
const reviewScreen = document.querySelector('#reviewScreen');
const completionCelebration = document.querySelector('#completionCelebration');
const repeatSceneButton = document.querySelector('#repeatScene');
const scene = document.querySelector('#scene');
const apple = document.querySelector('#apple');
const hotspots = [...document.querySelectorAll('.scene-hotspot')];
const taskFocus = document.querySelector('#taskFocus');
const dropZone = document.querySelector('#dropZone');
const replayButton = document.querySelector('#replayButton');
const helpButton = document.querySelector('#helpButton');
const micButton = document.querySelector('#micButton');
const micLabel = document.querySelector('#micLabel');
const resetButton = document.querySelector('#resetButton');
const subtitleToggle = document.querySelector('#subtitleToggle');
const actionCoach = document.querySelector('#actionCoach');
const actionCoachText = document.querySelector('#actionCoachText');
const exitScene = document.querySelector('#exitScene');
const languagePanel = document.querySelector('#languagePanel');
const recentDialogue = document.querySelector('#recentDialogue');
const dialogueHistory = document.querySelector('#dialogueHistory');
const dialogueHistoryList = document.querySelector('#dialogueHistoryList');
const openDialogueHistory = document.querySelector('#openDialogueHistory');
const modeLabel = document.querySelector('#modeLabel');
const stepFill = document.querySelector('#stepFill');
const sceneProgress = document.querySelector('#sceneProgress');
const toast = document.querySelector('#toast');
const dust = document.querySelector('#dust');
const backgroundPlane = document.querySelector('#backgroundPlane');
const backgroundBlur = document.querySelector('#backgroundBlur');
const primaryCta = document.querySelector('.primary-cta');
const liveLabel = document.querySelector('.live-label');
const sheetClose = document.querySelector('.sheet-close');
const appToast = document.querySelector('#appToast');
const speechRateValue = document.querySelector('#speechRateValue');
const rescueValue = document.querySelector('#rescueValue');
const abilityOrbit = document.querySelector('#abilityOrbit');
const abilityPercent = document.querySelector('#abilityPercent');
const abilityTitle = document.querySelector('#abilityTitle');
const abilityDescription = document.querySelector('#abilityDescription');
const growthHeard = document.querySelector('#growthHeard');
const growthActions = document.querySelector('#growthActions');
const growthSpoken = document.querySelector('#growthSpoken');
const growthTransfer = document.querySelector('#growthTransfer');
const growthHeardMeter = document.querySelector('#growthHeardMeter');
const growthActionsMeter = document.querySelector('#growthActionsMeter');
const growthSpokenMeter = document.querySelector('#growthSpokenMeter');
const growthTransferMeter = document.querySelector('#growthTransferMeter');
const profileHeard = document.querySelector('#profileHeard');
const profileActions = document.querySelector('#profileActions');
const profileSpoken = document.querySelector('#profileSpoken');
const voiceStatus = document.querySelector('#voiceStatus');
const textAnswerForm = document.querySelector('#textAnswerForm');
const textAnswerInput = document.querySelector('#textAnswer');
const textAnswerToggle = document.querySelector('#textAnswerToggle');
const transcriptLedger = new VoiceRuntime.TranscriptLedger();
const microphoneBuffer = new VoiceRuntime.PcmBuffer();

let sheetTrigger = null;
let appToastTimer = null;
const preferences = {
  speechRate: localStorage.getItem('luma-speech-rate') || '慢速',
  rescue: localStorage.getItem('luma-rescue') || '按需显示',
};

const SCENES = {
  kitchen: {
    image: './assets/breakfast/table.webp',
    badge: '可进入',
    eyebrow: 'HOME · MORNING',
    title: '帮 Luma 准备早餐',
    description: '和 Luma 一起准备早餐：选喜欢的饮料，递一个杯子，再告诉她要多少。一个词也能改变接下来发生的事。',
    people: [['user', 'Luma'], ['clock', '3–5 分钟'], ['sparkle', '3 个生活片段']],
    goal: 'milk or water · here · more · enough',
    available: true,
  },
  airport: {
    image: './assets/scenes/airport-gate.png',
    badge: '可进入',
    eyebrow: 'AIRPORT · DEPARTURE',
    title: '找到正确的登机口',
    description: '把登机牌给工作人员看，再从画面里找到 A12 登机口。每一步都可以先说或先做。',
    people: [['users-three', '2 位角色'], ['clock', '4 分钟'], ['airplane-tilt', '3 个任务']],
    goal: 'ticket · bag · gate A12',
    available: true,
  },
  street: {
    image: './assets/scenes/street-market.png',
    badge: '环境预览',
    eyebrow: 'CITY · STREET MARKET',
    title: '帮朋友买到想要的东西',
    description: '观察摊位、听朋友和摊主交流，在真正需要你的时候加入对话。',
    people: [['users-three', '4 位角色'], ['clock', '6 分钟'], ['storefront', '社交']],
    goal: 'want · how much · give me',
    available: false,
  },
  office: {
    image: './assets/scenes/office-reception.png',
    badge: '可进入',
    eyebrow: 'WORK · RECEPTION',
    title: '第一次拜访新同事',
    description: '先向前台说明来意，完成签到和等候，再自然地和新同事打招呼。说话能推进情境，签到也可以直接操作。',
    people: [['users-three', '2 位角色'], ['clock', '4 分钟'], ['sparkle', '4 个片段']],
    goal: 'I’m here to see · sign in · please wait · nice to meet you',
    available: true,
  },
};

const KITCHEN_TASKS = Breakfast.tasks;

const AIRPORT_TASKS = [
  { id: 'ticket', interaction: 'tap', requiresAction: true, prompt: 'Your ticket, please.', actionPrompt: 'Good. Show me the ticket.', hint: '点一下手里的登机牌。' },
  { id: 'bag', interaction: 'speech', requiresAction: false, prompt: 'Is this your bag?', hint: '直接回答 Luma，不需要点击行李箱。' },
  { id: 'gate-a12', interaction: 'tap', requiresAction: true, prompt: 'Find A12.', actionPrompt: 'Point to the A12 sign, please.', hint: '点一下画面中的 A12，表示你已经指出了登机口。' },
];

const OFFICE_TASKS = [
  { id: 'office-purpose', interaction: 'speech', requiresAction: false, speaker: '前台', prompt: 'Who are you here to see?', hint: '告诉前台你来见谁；不需要照着固定句子说。' },
  { id: 'office-signin', interaction: 'tap', requiresAction: true, speaker: '前台', prompt: 'Please sign in here.', actionPrompt: 'Good. Touch the sign-in screen.', hint: '点一下接待台上的签到平板。' },
  { id: 'office-wait', interaction: 'none', requiresAction: false, requiresSpeech: false, autoAdvance: true, speaker: '前台', prompt: 'Please wait here. Maya is coming.', hint: '这一句只需要听懂，情境会自己继续。' },
  { id: 'office-greeting', interaction: 'speech', requiresAction: false, speaker: 'Maya', prompt: "Hi, I'm Maya. Nice to meet you.", hint: '自然回应 Maya 的问候即可，不设唯一答案。' },
];

const SCENE_CONFIGS = {
  kitchen: {
    source: { width: 941, height: 1672 }, image: SCENES.kitchen.image, tasks: KITCHEN_TASKS,
    mouth: { x: 635, y: 354, width: 22, height: 9 },
    anchors: {
      apple: { x: 390, y: 1010, width: 126, height: 126 }, hand: { x: 478, y: 654 },
      milk: { x: 215, y: 890, width: 104, height: 205 },
      plate: { x: 707, y: 1034, width: 302, height: 126 },
      cup: { x: 840, y: 925, width: 142, height: 168 },
      spoon: { x: 837, y: 1111, width: 194, height: 64 },
    },
  },
  airport: {
    source: { width: 720, height: 960 }, image: SCENES.airport.image, tasks: AIRPORT_TASKS,
    mouth: { x: 499, y: 177, width: 14, height: 6 },
    anchors: {
      ticket: { x: 305, y: 344, width: 92, height: 74 },
      bag: { x: 143, y: 681, width: 210, height: 290 },
      'gate-a12': { x: 607, y: 92, width: 122, height: 74, label: 'A12' },
    },
  },
  office: {
    source: { width: 1086, height: 1448 }, image: SCENES.office.image, tasks: OFFICE_TASKS,
    mouth: { x: 759, y: 300, width: 17, height: 7 },
    anchors: {
      'office-signin': { x: 763, y: 505, width: 150, height: 74 },
    },
  },
};

const FINAL_REVIEW_DWELL_MS = 4200;
const TASK_ADVANCE_DWELL_MS = 2600;
const LEARNING_PROFILE_KEY = 'luma-learning-profile-v1';
const TURN_PHASE = Object.freeze({
  PRESENTING: 'presenting',
  LISTENING: 'listening',
  ACTION_PENDING: 'action-pending',
  CHARACTER_SPEAKING: 'character-speaking',
  TRANSITIONING: 'transitioning',
  COMPLETE: 'complete',
  REVIEW: 'review',
});

function loadLearningProfile() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEARNING_PROFILE_KEY) || '{}');
    return {
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions.slice(-30) : [],
    };
  } catch {
    return { sessions: [] };
  }
}

const learningProfile = loadLearningProfile();

const state = {
  activeView: 'home',
  selectedScene: 'kitchen',
  sceneStarted: false,
  practiceMode: 'guided',
  turnPhase: TURN_PHASE.PRESENTING,
  subtitlesHidden: false,
  stage: 'idle',
  taskIndex: 0,
  breakfast: Breakfast.initial(),
  breakfastHelp: false,
  breakfastCupSelected: false,
  hintLevel: 0,
  currentSpeech: 'Can you give me the apple?',
  activeQuestion: 'Can you give me the apple?',
  dragging: false,
  handsFreeListening: false,
  micMuted: false,
  micStarting: false,
  mediaStream: null,
  audioContext: null,
  audioSource: null,
  audioProcessor: null,
  audioSink: null,
  audioFilter: null,
  captureGeneration: 0,
  practiceSession: 0,
  messageSerial: 0,
  playbackGeneration: 0,
  speechRequestSerial: 0,
  connectionGeneration: 0,
  firstPacketTimer: null,
  bufferOverflow: false,
  audioWorkletLoaded: false,
  captionAudioStart: 0,
  lastCharacterEndedAt: 0,
  pendingFeedback: new Set(),
  captureSampleRate: 16000,
  duplexSocket: null,
  duplexReady: false,
  duplexConnectPromise: null,
  duplexConnectResolve: null,
  duplexConnectReject: null,
  duplexPlayerContext: null,
  duplexPlayerGain: null,
  duplexNextPlayTime: 0,
  duplexAudioQueue: Promise.resolve(),
  duplexPendingAudio: [],
  duplexSubtitleReady: false,
  duplexAudioGateTimer: null,
  duplexSources: new Set(),
  duplexAfter: null,
  duplexSpeaking: false,
  awaitingModelReply: false,
  duplexOutputDone: false,
  duplexAcceptAudio: false,
  duplexFinishTimer: null,
  characterWatchdogTimer: null,
  lastDuplexAudioAt: 0,
  captionRevealTimer: null,
  captionCharacters: [],
  captionVisibleCount: 0,
  awaitingPrompt: false,
  duplexTranscript: '',
  duplexResponseText: '',
  duplexPendingSubtitle: '',
  duplexResponseIsPrompt: false,
  duplexValidatedText: false,
  responseTurnSerial: 0,
  expectedResponse: null,
  ignoredResponseIds: new Set(),
  ignoredQuestionIds: new Set(),
  safeVoiceRetries: 0,
  characterPromptDelivered: false,
  suppressDuplexResponse: false,
  actionDone: false,
  speechDone: false,
  lastTranscript: '',
  dialogueHistory: [],
  streamingLumaIndex: null,
  streamingUserIndex: null,
  pendingUserIndex: null,
  lastVoiceEnergyAt: 0,
  lastBargeInEnergyAt: 0,
  lastServerSpeechAt: 0,
  pendingServerTurnContext: null,
  micNoiseFloor: .002,
  micCalibrationUntil: 0,
  lastMicFrameAt: 0,
  voiceHealthTimer: null,
  transcriptionStartedAt: 0,
  coveredGoals: new Set(),
  lumaStartedAt: 0,
  idleNudgeTimer: null,
  idleNudgeCount: 0,
  nudgeInFlight: false,
  userTranscriptPending: false,
  userTurnContext: null,
  voiceTurnWatchdogTimer: null,
  voiceFrameStreak: 0,
  localSpeechActive: false,
  characterTurnId: 0,
  pendingPostActionQuestion: false,
  postActionQuestionTimer: null,
  pendingTaskUpdate: false,
  reviewTimer: null,
  completionCelebrated: false,
  completionTimer: null,
  sessionStartedAt: 0,
  sessionSaved: false,
  sessionGoals: {},
  hintsUsed: 0,
  actionCoachRevealed: true,
  questionReadyAt: 0,
  advanceTimer: null,
  promptTimer: null,
  replyTimer: null,
  userTurnActive: false,
  userTurnTimer: null,
  voicePhase: 'idle',
  voiceTurnSerial: 0,
  activeVoiceTurn: null,
  lastFinalizedUser: null,
  ignoredTranscriptItems: new Set(),
  courtesyTimer: null,
  pointerId: null,
  initialApple: { x: 0, y: 0 },
  hand: { x: 0, y: 0 },
  scale: 1,
  toastTimer: null,
  completed: Boolean(localStorage.getItem('luma-demo-v6-complete')),
};

const voiceInstanceId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const voiceSessionChannel = 'BroadcastChannel' in window ? new window.BroadcastChannel('luma-exclusive-voice-v1') : null;

function claimExclusiveVoiceSession() {
  voiceSessionChannel?.postMessage({ type: 'voice.claim', owner: voiceInstanceId });
}

voiceSessionChannel?.addEventListener('message', (event) => {
  if (event.data?.type !== 'voice.claim' || event.data.owner === voiceInstanceId) return;
  stopSpeechPlayback();
  cancelSpeechCapture();
  closeDuplexSession();
  state.micMuted = true;
  micButton.classList.remove('is-live');
  micButton.classList.add('is-muted');
  micLabel.textContent = '其他页面正在使用';
  if (state.sceneStarted) showAppToast('另一个页面已开始语音，本页已自动静音', 3200);
});

function currentTask() {
  const tasks = currentSceneConfig().tasks;
  const task = tasks[state.taskIndex] ?? tasks[0];
  return task.id === 'breakfast-more' ? { ...task, prompt: Breakfast.promptFor(task.id, state.breakfast) } : task;
}

function taskNeedsAction(task = currentTask()) {
  return task.requiresAction === true;
}

function taskHasAction(task = currentTask()) {
  return ['drag', 'tap', 'choice', 'handoff'].includes(task.interaction);
}

function taskNeedsSpeech(task = currentTask()) {
  return task.requiresSpeech !== false;
}

function isActionRequestLine(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  const action = '(?:touch|tap|click|find|give|hand|pass|bring|show|select|choose|point(?:\\s+to)?|pick\\s+up)';
  const directInstruction = new RegExp(`^(?:(?:okay|good|great|yes)[.!,:;]?\\s*)?(?:now\\s+)?(?:please\\s+)?${action}\\b`, 'i');
  const politeRequest = new RegExp(`\\b(?:can|could|will|would)\\s+you\\s+(?:please\\s+)?${action}\\b`, 'i');
  const tryInstruction = new RegExp(`\\btry\\s+(?:to\\s+)?${action}\\b`, 'i');
  return directInstruction.test(text) || politeRequest.test(text) || tryInstruction.test(text);
}

function isActionAcknowledgement(task, text, question = state.activeQuestion || state.currentSpeech) {
  const heard = normalizedSpeech(text);
  return taskNeedsAction(task)
    && !state.actionDone
    && isActionRequestLine(question)
    && /^(?:yes|yeah|yep|ok|okay|sure|all right|alright|here|here you go|i can|i will)$/.test(heard);
}

function captureUserTurnContext() {
  return {
    practiceSession: state.practiceSession,
    sceneId: state.selectedScene,
    taskId: currentTask().id,
    taskIndex: state.taskIndex,
    characterTurnId: state.characterTurnId,
    question: state.activeQuestion || state.currentSpeech || currentTask().prompt,
  };
}

function setVoicePhase(phase) {
  state.voicePhase = phase;
  scene.dataset.voicePhase = phase;
  if (state.handsFreeListening && state.sceneStarted) {
    micLabel.textContent = phase === 'recording' ? '正在听' : '随时说';
  }
  syncVoiceStatus();
}

function syncVoiceStatus() {
  const text = state.micMuted ? '麦克风已关闭 · 也可以打字'
    : !state.handsFreeListening ? '正在准备麦克风…'
    : !state.duplexReady ? (state.bufferOverflow ? '连接较慢 · 请稍候或打字' : '正在连接 · 已暂存你的声音')
    : state.voicePhase === 'recording' ? '正在听你说'
    : '麦克风已开 · 随时说话';
  if (voiceStatus.textContent !== text) voiceStatus.textContent = text;
  scene.dataset.connectionState = state.duplexReady ? 'ready' : 'connecting';
}

function sceneVoiceIsOpen() {
  return state.sceneStarted
    && experience.classList.contains('is-active')
    && state.handsFreeListening
    && !state.micMuted;
}

function ensureSceneVoiceIsOpen() {
  if (!state.sceneStarted || !experience.classList.contains('is-active') || state.micMuted) return;
  if (!state.handsFreeListening && !state.micStarting) startHandsFreeListening().catch(() => {});
}

function stopVoiceHealthMonitor() {
  clearInterval(state.voiceHealthTimer);
  state.voiceHealthTimer = null;
}

function startVoiceHealthMonitor() {
  stopVoiceHealthMonitor();
  state.voiceHealthTimer = setInterval(() => {
    if (!state.sceneStarted || !experience.classList.contains('is-active')) {
      stopVoiceHealthMonitor();
      return;
    }
    if (document.visibilityState !== 'visible' || state.micMuted || state.micStarting) return;
    const microphoneTrack = state.mediaStream?.getAudioTracks()[0];
    const trackIsLive = Boolean(microphoneTrack
      && microphoneTrack.readyState === 'live'
      && microphoneTrack.enabled
      && !microphoneTrack.muted);
    scene.dataset.micTrackState = microphoneTrack?.readyState || 'missing';
    scene.dataset.micTrackMuted = String(Boolean(microphoneTrack?.muted));
    scene.dataset.micTrackEnabled = String(Boolean(microphoneTrack?.enabled));
    const frameStreamStalled = state.handsFreeListening
      && state.lastMicFrameAt
      && Date.now() - state.lastMicFrameAt > 4000;
    if (!state.handsFreeListening || !trackIsLive || !state.audioProcessor || frameStreamStalled) {
      state.handsFreeListening = false;
      if (!trackIsLive) releaseMicrophoneStream();
      disconnectAudioCapture();
      cleanupSpeechCaptureUi();
      ensureSceneVoiceIsOpen();
    } else if (state.audioContext?.state === 'suspended') {
      state.audioContext.resume().catch(() => {});
    }
    if (!state.duplexReady && !state.duplexConnectPromise) connectDuplexSession().catch(() => {});
  }, 1200);
}

function openLearnerTurn() {
  ensureSceneVoiceIsOpen();
  if (!sceneVoiceIsOpen() || state.activeVoiceTurn || isConversationPlaybackActive()) return false;
  setVoicePhase('listening');
  setTurnPhase(TURN_PHASE.LISTENING, liveTaskModeLabel(), state.actionDone ? 'is-complete' : '');
  return true;
}

function openCourtesyTurn() {
  clearTimeout(state.courtesyTimer);
  state.courtesyTimer = null;
  if (!state.sceneStarted
    || !state.handsFreeListening
    || state.micMuted
    || state.activeVoiceTurn
    || state.userTranscriptPending
    || isConversationPlaybackActive()) return false;
  setVoicePhase('courtesy');
  setTurnPhase(
    ['task-complete', 'complete'].includes(state.stage) ? TURN_PHASE.TRANSITIONING : TURN_PHASE.ACTION_PENDING,
    ['task-complete', 'complete'].includes(state.stage) ? '听到了 · 还可以回应' : liveTaskModeLabel(),
    'is-complete',
  );
  state.courtesyTimer = setTimeout(() => {
    state.courtesyTimer = null;
    if (state.voicePhase === 'courtesy' && !state.activeVoiceTurn) setVoicePhase('idle');
  }, 2400);
  return true;
}

function transcriptItemId(event) {
  return String(event.item_id || event.item?.id || '');
}

function responseEventId(event) {
  return String(event.response_id || event.response?.id || '');
}

function responseQuestionId(event) {
  return String(event.question_id || '');
}

function rememberBounded(set, value) {
  if (!value) return;
  set.add(value);
  if (set.size > 40) set.delete(set.values().next().value);
}

function beginExpectedResponse(kind, { questionId = '', turnId = 0 } = {}) {
  retireExpectedResponse();
  state.expectedResponse = {
    id: ++state.responseTurnSerial,
    kind,
    questionId: String(questionId || ''),
    responseId: '',
    turnId,
    audioStarted: false,
  };
  return state.expectedResponse;
}

function retireExpectedResponse() {
  const expected = state.expectedResponse;
  if (!expected) return;
  rememberBounded(state.ignoredResponseIds, expected.responseId);
  rememberBounded(state.ignoredQuestionIds, expected.questionId);
  state.expectedResponse = null;
}

function acceptResponseEvent(event) {
  const expected = state.expectedResponse;
  const responseId = responseEventId(event);
  const questionId = responseQuestionId(event);
  if (responseId && state.ignoredResponseIds.has(responseId)) return false;
  if (questionId && state.ignoredQuestionIds.has(questionId)) return false;
  if (!expected) {
    rememberBounded(state.ignoredResponseIds, responseId);
    rememberBounded(state.ignoredQuestionIds, questionId);
    return false;
  }
  if (expected.responseId && responseId && expected.responseId !== responseId) {
    rememberBounded(state.ignoredResponseIds, responseId);
    rememberBounded(state.ignoredQuestionIds, questionId);
    return false;
  }
  if (expected.questionId && questionId && expected.questionId !== questionId) {
    rememberBounded(state.ignoredResponseIds, responseId);
    rememberBounded(state.ignoredQuestionIds, questionId);
    return false;
  }
  if (!expected.responseId && responseId) expected.responseId = responseId;
  if (!expected.questionId && questionId) expected.questionId = questionId;
  return true;
}

function acceptTranscriptEvent(event, { allowStart = false } = {}) {
  const itemId = transcriptItemId(event);
  let turn = itemId ? transcriptLedger.items.get(itemId) : state.activeVoiceTurn;
  if (!turn && allowStart && sceneVoiceIsOpen()) {
    turn = transcriptLedger.bind(itemId, state.pendingServerTurnContext || captureUserTurnContext(), state.activeVoiceTurn);
    state.activeVoiceTurn = turn;
    state.pendingServerTurnContext = null;
  }
  if (!turn || turn.context.practiceSession !== state.practiceSession || turn.final) return null;
  return turn;
}

function clearLocalSpeechTurn({ keepContext = false } = {}) {
  clearTimeout(state.voiceTurnWatchdogTimer);
  clearTimeout(state.courtesyTimer);
  state.voiceTurnWatchdogTimer = null;
  state.courtesyTimer = null;
  state.voiceFrameStreak = 0;
  state.localSpeechActive = false;
  state.lastVoiceEnergyAt = 0;
  state.lastBargeInEnergyAt = 0;
  state.lastServerSpeechAt = 0;
  state.pendingServerTurnContext = null;
  state.userTranscriptPending = false;
  state.activeVoiceTurn = null;
  state.streamingUserIndex = null;
  if (!keepContext) state.userTurnContext = null;
}

function updateLearnerTurn(turn, text, final = false) {
  if (!transcriptLedger.update(turn, text, final)) return;
  if (!turn.text) return;
  let message = state.dialogueHistory.find(item => item.id === turn.messageId);
  if (!message) {
    const index = addDialogueMessage('user', turn.text);
    message = state.dialogueHistory[index];
    turn.messageId = message.id;
  }
  message.text = turn.text;
  message.revision = turn.revision;
  message.final = final;
  message.status = final ? '' : '正在识别';
  renderDialogue();
  if (state.activeVoiceTurn === turn) state.streamingUserIndex = state.dialogueHistory.indexOf(message);
}

function confirmLearnerTurn(turn, text) {
  if (turn.confirmed || !VoiceRuntime.isSpeechText(text)) return;
  const playback = isConversationPlaybackActive();
  // Volume / VAD alone cannot distinguish a keyboard or door from a learner.
  if (playback && VoiceRuntime.isPlaybackEcho(text, state.currentSpeech)) return;
  turn.confirmed = true;
  // A late first hypothesis may fill its old bubble, never take a newer floor.
  turn.superseded = [...transcriptLedger.items.values()].some(item => item.confirmed && item.id > turn.id);
  if (turn.superseded) return;
  clearIdleNudge();
  state.idleNudgeCount = 0;
  if (state.expectedResponse?.turnId !== turn.id) {
    stopSpeechPlayback();
    beginExpectedResponse('user', { questionId: turn.itemId, turnId: turn.id });
  }
  state.activeVoiceTurn = turn;
  state.userTurnContext = turn.context;
  state.userTranscriptPending = true;
  state.localSpeechActive = true;
  setVoicePhase('recording');
}

function armVoiceTurnWatchdog() {
  clearTimeout(state.voiceTurnWatchdogTimer);
  const turn = state.activeVoiceTurn;
  if (!turn) return;
  state.voiceTurnWatchdogTimer = setTimeout(() => {
    if (state.activeVoiceTurn !== turn) return;
    const message = state.dialogueHistory.find(item => item.id === turn.messageId);
    if (message) { message.status = '识别未完成'; renderDialogue(); }
    clearLocalSpeechTurn();
    if (turn.confirmed && !turn.responseStarted) {
      state.awaitingModelReply = true;
      armReplyTimeout();
    } else { openLearnerTurn(); scheduleIdleNudge(); }
  }, 10000);
}

function finalizeLearnerTranscript(transcript, { turn = state.activeVoiceTurn } = {}) {
  if (!turn || turn.final || turn.context.practiceSession !== state.practiceSession) return;
  const clean = String(transcript || '').trim();
  if (VoiceRuntime.isSpeechText(clean)) {
    confirmLearnerTurn(turn, clean);
    if (turn.confirmed) updateLearnerTurn(turn, clean, true);
    else turn.final = true;
  } else {
    const message = state.dialogueHistory.find(item => item.id === turn.messageId);
    if (message) { message.status = '识别未完成'; renderDialogue(); }
    turn.final = true;
  }
  if (state.activeVoiceTurn === turn) {
    clearLocalSpeechTurn();
    state.duplexTranscript = '';
    cleanupSpeechCaptureUi();
    setVoicePhase('listening');
  }
  if (!turn.confirmed) { openLearnerTurn(); scheduleIdleNudge(); return; }
  if (!turn.superseded && !turn.responseStarted && (!state.expectedResponse || state.expectedResponse.turnId === turn.id)) {
    if (!state.expectedResponse) beginExpectedResponse('user', { questionId: turn.itemId, turnId: turn.id });
    state.awaitingModelReply = true;
    armReplyTimeout();
  }
  const message = state.dialogueHistory.find(item => item.id === turn.messageId);
  if (clean && message) requestLanguageFeedback(turn.context.question, clean, {
    ...turn.context, messageId: message.id, revision: message.revision, final: true,
  });
  publishDuplexSubtitle();
}

function beginLocalSpeechTurn({ contextOverride = null } = {}) {
  if (!sceneVoiceIsOpen() || state.activeVoiceTurn) return false;
  state.activeVoiceTurn = transcriptLedger.create(contextOverride || captureUserTurnContext());
  // A VAD event is a candidate. Only actual words may interrupt playback.
  armVoiceTurnWatchdog();
  return true;
}

function taskRequirementsMet(task = currentTask()) {
  if (task.autoAdvance) return true;
  if (state.pendingPostActionQuestion) return false;
  return DialogueRules.requirementsMet({
    needsAction: taskNeedsAction(task),
    actionDone: state.actionDone,
    needsSpeech: taskNeedsSpeech(task),
    speechDone: state.speechDone,
  });
}

function taskProgress() {
  const tasks = currentSceneConfig().tasks;
  const completed = tasks.filter((task) => state.coveredGoals.has(task.id)).length;
  return Math.min(100, (completed / tasks.length) * 100);
}

function currentSceneConfig() { return SCENE_CONFIGS[state.selectedScene] ?? SCENE_CONFIGS.kitchen; }

function currentGoalRecord() {
  const task = currentTask();
  state.sessionGoals[task.id] ||= {
    id: task.id,
    heard: false,
    acted: false,
    spoke: false,
    wordCount: 0,
    utterance: '',
    hints: 0,
    responseLatencyMs: 0,
  };
  return state.sessionGoals[task.id];
}

function setTurnPhase(phase, label = '', modifier = '') {
  state.turnPhase = phase;
  scene.dataset.turnPhase = phase;
  experience.dataset.turnPhase = phase;
  if (label) setMode(label, modifier);
}

function syncSceneProgress() {
  const tasks = currentSceneConfig().tasks;
  const completed = tasks.filter((task) => state.coveredGoals.has(task.id)).length;
  const task = currentTask();
  const missing = [
    taskNeedsSpeech(task) && !state.speechDone ? '开口回应' : '',
    taskNeedsAction(task) && !state.actionDone ? '完成动作' : '',
    !taskNeedsSpeech(task) && !taskNeedsAction(task) && taskHasAction(task) && !state.speechDone && !state.actionDone ? '回应或操作' : '',
  ].filter(Boolean);
  stepFill.style.width = `${taskProgress()}%`;
  sceneProgress.setAttribute('aria-valuemax', String(tasks.length));
  sceneProgress.setAttribute('aria-valuenow', String(completed));
  sceneProgress.setAttribute('aria-valuetext', missing.length ? `已完成 ${completed}/${tasks.length}，当前还需${missing.join('和')}` : `已完成 ${completed}/${tasks.length}`);
}

function markGoalHeard() {
  if (!state.sceneStarted || state.stage !== 'active') return;
  const goal = currentGoalRecord();
  goal.heard = true;
  if (!state.questionReadyAt) state.questionReadyAt = Date.now();
}

function markGoalSpoken(text) {
  const goal = currentGoalRecord();
  const wordCount = normalizedSpeech(text).split(' ').filter(Boolean).length;
  goal.spoke = true;
  goal.wordCount = Math.max(goal.wordCount, wordCount);
  goal.utterance = String(text || '').trim();
  if (state.questionReadyAt && !goal.responseLatencyMs) goal.responseLatencyMs = Math.max(0, Date.now() - state.questionReadyAt);
}

function recordHint() {
  const goal = currentGoalRecord();
  goal.hints += 1;
  state.hintsUsed += 1;
}

function learningTotals() {
  const sessions = learningProfile.sessions;
  return sessions.reduce((totals, session) => {
    totals.goals += session.goalCount || 0;
    totals.heard += session.heardCount || 0;
    totals.actionRequired += session.actionRequired || 0;
    totals.actions += session.actionCount || 0;
    totals.speechRequired += session.speechRequired || 0;
    totals.spoken += session.spokenCount || 0;
    totals.noCaption += session.mode === 'listening' ? 1 : 0;
    if (session.scene) totals.scenes.add(session.scene);
    return totals;
  }, { goals: 0, heard: 0, actionRequired: 0, actions: 0, speechRequired: 0, spoken: 0, noCaption: 0, scenes: new Set() });
}

function syncLearningUi() {
  const totals = learningTotals();
  const ratio = (value, total) => total ? Math.min(1, value / total) : 0;
  const heardRate = ratio(totals.heard, totals.goals);
  const actionRate = ratio(totals.actions, totals.actionRequired);
  const spokenRate = ratio(totals.spoken, totals.speechRequired);
  const transferRate = totals.scenes.size > 1 ? Math.min(1, (totals.scenes.size - 1) / 2) : 0;
  const score = Math.round((heardRate + actionRate + spokenRate + transferRate) * 25);
  abilityPercent.textContent = String(score);
  abilityOrbit.setAttribute('aria-label', `学习闭环完成度 ${score}%`);
  abilityOrbit.style.background = `conic-gradient(var(--orange) ${score}%, rgba(11,12,18,.1) 0)`;
  abilityTitle.textContent = score >= 75 ? '正在把英语带进真实环境' : score >= 35 ? '开始建立声音、动作和表达的连接' : '先完成一个真实情境';
  abilityDescription.textContent = totals.goals
    ? `累计听懂 ${totals.heard} 个情境目标，完成 ${totals.spoken} 次有效回应。`
    : '完成第一个情境后，这里会记录真实能力，而不是背过多少单词。';
  growthHeard.textContent = `${totals.heard} 个情境目标`;
  growthActions.textContent = `${totals.actions} 个有效动作`;
  growthSpoken.textContent = `${totals.spoken} 次有效回应`;
  growthTransfer.textContent = totals.scenes.size > 1 ? `已在 ${totals.scenes.size} 个环境练习` : '等待第二个环境';
  growthHeardMeter.style.width = `${Math.round(heardRate * 100)}%`;
  growthActionsMeter.style.width = `${Math.round(actionRate * 100)}%`;
  growthSpokenMeter.style.width = `${Math.round(spokenRate * 100)}%`;
  growthTransferMeter.style.width = `${Math.round(transferRate * 100)}%`;
  profileHeard.textContent = String(totals.heard);
  profileActions.textContent = String(totals.actions);
  profileSpoken.textContent = String(totals.spoken);
}

function saveLearningSession() {
  if (state.sessionSaved) return;
  const tasks = currentSceneConfig().tasks;
  const goals = tasks.map((task) => state.sessionGoals[task.id]).filter(Boolean);
  const latencies = goals.map((goal) => goal.responseLatencyMs).filter(Boolean);
  learningProfile.sessions.push({
    scene: state.selectedScene,
    mode: state.practiceMode,
    finishedAt: new Date().toISOString(),
    durationMs: Math.max(0, Date.now() - state.sessionStartedAt),
    goalCount: tasks.length,
    heardCount: goals.filter((goal) => goal.heard).length,
    actionRequired: tasks.filter(taskHasAction).length,
    actionCount: goals.filter((goal) => goal.acted).length,
    speechRequired: tasks.filter(taskNeedsSpeech).length,
    spokenCount: goals.filter((goal) => goal.spoke).length,
    hints: goals.reduce((sum, goal) => sum + goal.hints, 0),
    averageResponseMs: latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : 0,
  });
  learningProfile.sessions = learningProfile.sessions.slice(-30);
  localStorage.setItem(LEARNING_PROFILE_KEY, JSON.stringify(learningProfile));
  state.sessionSaved = true;
  syncLearningUi();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function dialogueMarkup(message) {
  return `<article class="dialogue-bubble is-${message.speaker}" data-message-id="${message.id}"><small>${message.speaker === 'user' ? '你' : escapeHtml(message.name || 'Luma')}</small><p>${escapeHtml(message.text)}</p><span class="transcript-status">${escapeHtml(message.status || '')}</span></article>`;
}

function renderDialogue() {
  const updateList = (container, messages) => {
    const ids = new Set(messages.map(message => String(message.id)));
    [...container.children].forEach(node => { if (!ids.has(node.dataset.messageId)) node.remove(); });
    for (const message of messages) {
      let node = [...container.children].find(item => item.dataset.messageId === String(message.id));
      if (!node) { container.insertAdjacentHTML('beforeend', dialogueMarkup(message)); node = container.lastElementChild; }
      const text = node.querySelector('p'), status = node.querySelector('.transcript-status');
      if (text.textContent !== message.text) text.textContent = message.text;
      if (status.textContent !== (message.status || '')) status.textContent = message.status || '';
    }
  };
  const recent = state.dialogueHistory.slice(-2);
  updateList(recentDialogue, recent);
  if (dialogueHistory.classList.contains('is-open')) updateList(dialogueHistoryList, state.dialogueHistory);
  languagePanel.hidden = recent.length === 0;
  openDialogueHistory.hidden = state.dialogueHistory.length <= 2;
}

function addDialogueMessage(speaker, text, name = '') {
  const clean = String(text || '').trim();
  if (!clean) return null;
  state.dialogueHistory.push({ id: ++state.messageSerial, revision: 1, speaker, name, text: clean });
  const index = state.dialogueHistory.length - 1;
  if (speaker === 'user') state.pendingUserIndex = index;
  renderDialogue();
  return index;
}

function latestCharacterText() {
  return [...state.dialogueHistory].reverse().find((message) => message.speaker === 'luma')?.text || '';
}

function clearCharacterCaptionReveal({ complete = false } = {}) {
  clearTimeout(state.captionRevealTimer); state.captionRevealTimer = null;
  const message = state.dialogueHistory[state.streamingLumaIndex];
  if (complete && message?.speaker === 'luma' && state.captionCharacters.length) {
    message.text = state.captionCharacters.join(''); renderDialogue();
  }
  state.captionCharacters = []; state.captionVisibleCount = 0;
  state.captionAudioStart = 0; state.streamingLumaIndex = null;
}

function beginCharacterCaptionReveal(text) {
  const clean = String(text || '').trim();
  if (!clean) return;
  clearCharacterCaptionReveal();
  state.currentSpeech = clean; state.activeQuestion = clean;
  state.captionCharacters = Array.from(clean);
  state.streamingLumaIndex = addDialogueMessage('luma', '…', currentTask().speaker || 'Luma');
  state.characterTurnId += 1;
  const generation = state.playbackGeneration;
  const reveal = () => {
    if (generation !== state.playbackGeneration) return;
    const message = state.dialogueHistory[state.streamingLumaIndex], context = state.duplexPlayerContext;
    if (!message) return;
    if (context && state.captionAudioStart && context.currentTime >= state.captionAudioStart) {
      const elapsed = context.currentTime - state.captionAudioStart;
      const duration = Math.max(.1, state.duplexNextPlayTime - state.captionAudioStart);
      const count = state.duplexOutputDone
        ? Math.floor(state.captionCharacters.length * Math.min(1, elapsed / duration))
        : Math.min(state.captionCharacters.length - 1, Math.floor(elapsed * 14));
      state.captionVisibleCount = Math.max(state.captionVisibleCount, count);
      message.text = state.captionCharacters.slice(0, state.captionVisibleCount).join('') || '…';
      if (!state.questionReadyAt) markGoalHeard();
      renderDialogue();
    }
    state.captionRevealTimer = setTimeout(reveal, 65);
  };
  reveal();
}

function clearIdleNudge() {
  clearTimeout(state.idleNudgeTimer);
  state.idleNudgeTimer = null;
}

function scheduleIdleNudge() {
  clearIdleNudge();
  const task = currentTask();
  const hasMissingStep = (taskNeedsSpeech(task) && !state.speechDone) || (taskNeedsAction(task) && !state.actionDone);
  if (!state.sceneStarted || !hasMissingStep || state.micMuted || ['complete', 'task-complete'].includes(state.stage)) return;
  const delay = state.idleNudgeCount === 0 ? 8500 : state.idleNudgeCount === 1 ? 12000 : 18000;
  const nudgeWhenQuiet = () => {
    const liveTask = currentTask();
    const stillMissing = (taskNeedsSpeech(liveTask) && !state.speechDone) || (taskNeedsAction(liveTask) && !state.actionDone);
    if (!state.sceneStarted || state.micMuted || !stillMissing || ['complete', 'task-complete'].includes(state.stage)) return;
    if (isConversationTurnPending()) {
      state.idleNudgeTimer = setTimeout(nudgeWhenQuiet, 1200);
      return;
    }
    const text = characterHintLine(Math.min(state.idleNudgeCount + 1, 3));
    state.idleNudgeCount += 1;
    recordHint();
    speakCharacterCue(text);
  };
  state.idleNudgeTimer = setTimeout(nudgeWhenQuiet, delay);
}

function normalizedSpeech(value) {
  return DialogueRules.normalize(value);
}

function fallbackMeaningFeedback(answer, taskId) {
  return {
    meaning_valid: DialogueRules.matchesTask(taskId, answer),
  };
}

function applyDynamicFeedback(feedback = {}, context = {}) {
  const message = state.dialogueHistory.find(item => item.id === context.messageId);
  if (!message || message.speaker !== 'user' || !message.final
    || message.revision !== context.revision || message.text !== context.answer
    || context.practiceSession !== state.practiceSession) return;
  const sameTask = state.selectedScene === context.sceneId && currentTask().id === context.taskId
    && state.taskIndex === context.taskIndex && state.stage === 'active';
  if (!sameTask) return;
  if (Breakfast.isTask(context.taskId)) {
    if (feedback.meaning_valid === true && feedback.choice) commitBreakfastChoice(feedback.choice, { utterance: message.text });
    return;
  }
  if (feedback.meaning_valid !== true) return;
  if (isActionAcknowledgement(currentTask(), message.text, context.question)) return;
  state.lastTranscript = message.text;
  state.speechDone = true;
  markGoalSpoken(message.text);
  state.pendingPostActionQuestion = false;
  clearTimeout(state.postActionQuestionTimer);
  state.postActionQuestionTimer = null;
  syncSceneProgress();
  updateDuplexTask();
  if (taskRequirementsMet()) completeMultimodalTask();
  else scheduleIdleNudge();
}

async function requestLanguageFeedback(question, answer, turnContext = {}) {
  const context = { ...captureUserTurnContext(), ...turnContext, question, answer };
  if (!context.final || context.practiceSession !== state.practiceSession) return;
  if (Breakfast.isTask(context.taskId)) {
    const choice = Breakfast.choiceFromText(context.taskId, answer, question);
    if (choice) { applyDynamicFeedback({ meaning_valid: true, choice }, context); return; }
  }
  const controller = new AbortController();
  state.pendingFeedback.add(controller);
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch('/api/feedback', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, answer, sceneId: context.sceneId, taskId: context.taskId }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('feedback_unavailable');
    applyDynamicFeedback(await response.json(), context);
  } catch {
    applyDynamicFeedback(fallbackMeaningFeedback(answer, context.taskId), context);
  } finally { clearTimeout(timer); state.pendingFeedback.delete(controller); }
}

function openDialogueHistoryPanel() {
  dialogueHistory.classList.add('is-open');
  dialogueHistory.setAttribute('aria-hidden', 'false');
  renderDialogue();
  dialogueHistoryList.scrollTop = dialogueHistoryList.scrollHeight;
}

function closeDialogueHistoryPanel() {
  dialogueHistory.classList.remove('is-open');
  dialogueHistory.setAttribute('aria-hidden', 'true');
}

function syncA11yState() {
  const overlayOpen = sceneSheet.classList.contains('is-open')
    || experience.classList.contains('is-active')
    || reviewScreen.classList.contains('is-active');
  views.forEach((view) => {
    const hidden = overlayOpen || view.dataset.view !== state.activeView;
    view.setAttribute('aria-hidden', String(hidden));
    view.inert = hidden;
  });
  bottomNav.setAttribute('aria-hidden', String(overlayOpen));
  bottomNav.inert = overlayOpen;
}

function showView(name) {
  state.activeView = name;
  if (name === 'growth' || name === 'profile') syncLearningUi();
  appShell.scrollTop = 0;
  views.forEach((view) => view.classList.toggle('is-active', view.dataset.view === name));
  bottomNav.querySelectorAll('button').forEach((button) => button.classList.toggle('is-active', button.dataset.nav === name));
  const active = views.find((view) => view.dataset.view === name);
  active?.querySelector('.view-scroll')?.scrollTo({ top: 0, behavior: 'auto' });
  requestAnimationFrame(() => { appShell.scrollTop = 0; });
  syncA11yState();
}

function renderPeople(items) {
  sheetPeople.innerHTML = items.map(([icon, label]) => `<span><i class="ph ph-${icon}"></i> ${label}</span>`).join('');
}

function openSheet(sceneName, trigger = document.activeElement) {
  const data = SCENES[sceneName] ?? SCENES.kitchen;
  state.selectedScene = sceneName;
  sheetImage.src = data.image;
  sheetImage.alt = `${data.title}情境预览`;
  sheetBadge.textContent = data.badge;
  sheetEyebrow.textContent = data.eyebrow;
  sheetTitle.textContent = data.title;
  sheetDescription.textContent = data.description;
  sheetGoal.textContent = data.goal;
  renderPeople(data.people);
  sheetCta.disabled = !data.available;
  sheetCta.innerHTML = data.available
    ? '进入真实情境 <i class="ph ph-arrow-right"></i>'
    : '这个真实环境正在搭建 <i class="ph ph-lock-simple"></i>';
  sceneSheet.classList.add('is-open');
  sceneSheet.setAttribute('aria-hidden', 'false');
  sheetTrigger = trigger instanceof HTMLElement ? trigger : null;
  syncA11yState();
  requestAnimationFrame(() => sheetClose.focus());
}

function closeSheet() {
  const returnTarget = sheetTrigger;
  sceneSheet.classList.remove('is-open');
  sceneSheet.setAttribute('aria-hidden', 'true');
  sheetTrigger = null;
  syncA11yState();
  requestAnimationFrame(() => returnTarget?.focus());
}

function trapSheetFocus(event) {
  if (!sceneSheet.classList.contains('is-open')) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeSheet();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = [...sceneSheet.querySelectorAll('button:not([disabled]):not([tabindex="-1"])')];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function applyFilter(filter) {
  document.querySelectorAll('.filter-chip').forEach((button) => {
    const active = button.dataset.filter === filter;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.scenario-card').forEach((card) => {
    card.classList.toggle('is-filtered', filter !== 'all' && card.dataset.category !== filter);
  });
  document.querySelectorAll('.world-feature').forEach((card) => {
    card.classList.toggle('is-filtered', filter !== 'all' && card.dataset.category !== filter);
  });
  document.querySelector('#scenarioRail')?.scrollTo({ left: 0, behavior: 'smooth' });
}

function createDust() {
  if (dust.childElementCount) return;
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < 16; index += 1) {
    const mote = document.createElement('i');
    mote.style.left = `${28 + Math.random() * 47}%`;
    mote.style.top = `${22 + Math.random() * 50}%`;
    mote.style.setProperty('--duration', `${5 + Math.random() * 6}s`);
    mote.style.setProperty('--delay', `${-Math.random() * 9}s`);
    fragment.appendChild(mote);
  }
  dust.appendChild(fragment);
}

function getSceneGeometry() {
  const rect = scene.getBoundingClientRect();
  const { source } = currentSceneConfig();
  const scale = Math.min(rect.width / source.width, rect.height / source.height);
  return {
    scale,
    offsetX: (rect.width - source.width * scale) / 2,
    offsetY: (rect.height - source.height * scale) / 2,
  };
}

function mapAnchor(anchor, geometry) {
  return { x: geometry.offsetX + anchor.x * geometry.scale, y: geometry.offsetY + anchor.y * geometry.scale };
}

function setApplePosition(point, immediate = false) {
  if (immediate) apple.style.transition = 'none';
  apple.style.left = `${point.x}px`;
  apple.style.top = `${point.y}px`;
  if (immediate) requestAnimationFrame(() => { apple.style.transition = ''; });
}

function syncTaskFocus(geometry = getSceneGeometry()) {
  const task = currentTask();
  const anchors = currentSceneConfig().anchors;
  const anchor = task?.id === 'apple' && state.actionDone ? anchors.hand : anchors[task?.id];
  if (!anchor || !taskFocus || !taskNeedsAction(task)) {
    taskFocus.hidden = true;
    scene.removeAttribute('data-target');
    return;
  }
  scene.dataset.target = task.id;
  taskFocus.classList.toggle('is-found', state.actionDone);
  if (!state.actionDone && state.hintLevel === 0) {
    taskFocus.hidden = true;
    return;
  }
  const point = mapAnchor(anchor, geometry);
  const width = (anchor.width || 126) * geometry.scale;
  const height = (anchor.height || anchor.width || 126) * geometry.scale;
  taskFocus.hidden = false;
  taskFocus.style.left = `${point.x}px`;
  taskFocus.style.top = `${point.y}px`;
  taskFocus.style.width = `${width * 1.16}px`;
  taskFocus.style.height = `${height * 1.16}px`;
  taskFocus.dataset.shape = ['plate', 'spoon'].includes(task.id) ? 'wide' : task.id;
}

function updateSceneGeometry() {
  if (!experience.classList.contains('is-active')) return;
  const config = currentSceneConfig();
  const geometry = getSceneGeometry();
  state.scale = geometry.scale;
  if (config.anchors.apple) state.initialApple = mapAnchor(config.anchors.apple, geometry);
  if (config.anchors.hand) {
    state.hand = mapAnchor(config.anchors.hand, geometry);
    dropZone.style.left = `${state.hand.x}px`;
    dropZone.style.top = `${state.hand.y}px`;
  }
  hotspots.forEach((hotspot) => {
    const anchor = config.anchors[hotspot.dataset.object];
    if (!anchor) {
      hotspot.hidden = true;
      return;
    }
    hotspot.hidden = false;
    const point = mapAnchor(anchor, geometry);
    hotspot.style.left = `${point.x}px`;
    hotspot.style.top = `${point.y}px`;
    hotspot.style.width = `${anchor.width * geometry.scale}px`;
    hotspot.style.height = `${anchor.height * geometry.scale}px`;
  });
  syncTaskFocus(geometry);
  if (state.selectedScene === 'kitchen' && !state.dragging) setApplePosition(state.actionDone ? state.hand : state.initialApple, true);
  if (isBreakfastScene()) syncBreakfastGeometry();
}

function configureScene() {
  const config = currentSceneConfig();
  backgroundPlane.src = config.image;
  backgroundBlur.src = config.image;
  scene.dataset.scene = state.selectedScene;
  experience.setAttribute('aria-label', `${SCENES[state.selectedScene].title}互动情境`);
  const interactiveIds = config.tasks.filter((task) => task.interaction === 'tap').map((task) => task.id);
  hotspots.forEach((hotspot, index) => {
    const id = interactiveIds[index];
    hotspot.dataset.object = id || '';
    hotspot.hidden = !id;
    hotspot.setAttribute('aria-label', id ? (config.anchors[id]?.label || id) : '');
    hotspot.dataset.label = config.anchors[id]?.label || '';
  });
}

function setMode(label, modifier = '') {
  modeLabel.textContent = label;
  scene.classList.remove('is-speaking', 'is-listening', 'is-complete');
  if (modifier) scene.classList.add(modifier);
}

function liveTaskModeLabel() {
  const needsAction = taskNeedsAction();
  const needsSpeech = taskNeedsSpeech();
  if (!needsAction && !needsSpeech && taskHasAction() && !state.actionDone && !state.speechDone) return '轮到你 · 可以说，也可以操作';
  if (needsAction && !needsSpeech && !state.actionDone) return '轮到你 · 可以说，也可以操作';
  if (needsAction && needsSpeech && !state.actionDone && !state.speechDone) return '轮到你 · 可以先说或先操作';
  if (needsSpeech && !state.speechDone && !needsAction) return '轮到你 · 可以直接回答';
  if (needsSpeech && !state.speechDone && state.actionDone) return '动作完成 · 还可以开口';
  if (needsAction && !state.actionDone && state.speechDone) return '已经听懂 · 继续行动';
  if (needsAction && !state.actionDone) return '继续完成画面中的动作';
  return '实时语音 · 随时开口';
}

function sendDuplex(event) {
  if (state.duplexSocket?.readyState === WebSocket.OPEN) state.duplexSocket.send(JSON.stringify(event));
}

function clearReplyTimeout() {
  clearTimeout(state.replyTimer);
  state.replyTimer = null;
}

function clearCharacterTurnWatchdog() {
  clearTimeout(state.characterWatchdogTimer);
  state.characterWatchdogTimer = null;
}

function armCharacterTurnWatchdog(delayMs = 8000) {
  clearCharacterTurnWatchdog();
  const generation = state.playbackGeneration;
  state.characterWatchdogTimer = setTimeout(() => {
    if (generation !== state.playbackGeneration || !state.duplexSpeaking || state.duplexOutputDone) return;
    const quietFor = Date.now() - state.lastDuplexAudioAt;
    if (quietFor < 8000 || isConversationPlaybackActive()) { armCharacterTurnWatchdog(1000); return; }
    settleFailedDuplexTurn();
    showToast('声音暂时中断，可以继续说或点重听。');
  }, delayMs);
}

function clearUserTurn() {
  clearTimeout(state.userTurnTimer);
  state.userTurnTimer = null;
  state.userTurnActive = false;
}

function armReplyTimeout() {
  clearReplyTimeout();
  const expectedId = state.expectedResponse?.id;
  state.replyTimer = setTimeout(() => {
    if (state.expectedResponse?.id !== expectedId || isConversationPlaybackActive()) return;
    settleFailedDuplexTurn();
    showToast('这次没接上，我们继续。也可以点重听。', 3000);
  }, 10000);
}

function stopDuplexPlayback({ cancel = true } = {}) {
  state.playbackGeneration += 1;
  clearCharacterTurnWatchdog(); clearCharacterCaptionReveal();
  clearTimeout(state.firstPacketTimer); state.firstPacketTimer = null;
  clearTimeout(state.duplexFinishTimer); state.duplexFinishTimer = null;
  clearTimeout(state.duplexAudioGateTimer); state.duplexAudioGateTimer = null;
  state.duplexPendingAudio = []; state.duplexSubtitleReady = false;
  state.duplexSources.forEach(source => { try { source.stop(); } catch {} });
  state.duplexSources.clear(); state.duplexNextPlayTime = 0;
  state.duplexAudioQueue = Promise.resolve();
  state.duplexSpeaking = false; state.duplexOutputDone = false;
  if (cancel) {
    state.duplexAcceptAudio = false; retireExpectedResponse();
    state.duplexResponseText = ''; state.duplexPendingSubtitle = '';
    state.duplexResponseIsPrompt = false; state.duplexValidatedText = false;
    state.duplexAfter = null;
    if (state.duplexReady) sendDuplex({ type: 'response.cancel' });
  }
}

function isDuplexPlaybackActive() {
  const context = state.duplexPlayerContext;
  // Only audible, scheduled audio owns the floor. The provider can omit a
  // final event and leave `duplexSpeaking` stuck true after the sound has
  // already ended; treating that stale flag as playback caused every later
  // learner utterance to be rejected as echo/barge-in.
  return Boolean(context && state.duplexNextPlayTime > context.currentTime + .03);
}

function isConversationPlaybackActive() {
  return isDuplexPlaybackActive();
}

function isConversationTurnPending() {
  return state.awaitingPrompt
    || state.awaitingModelReply
    || state.userTurnActive
    || state.localSpeechActive
    || state.userTranscriptPending
    || Boolean(state.expectedResponse)
    || state.duplexAcceptAudio
    || isConversationPlaybackActive();
}

function scheduledCharacterLineBlocked() {
  return state.awaitingModelReply
    || state.userTurnActive
    || state.localSpeechActive
    || state.userTranscriptPending
    || Boolean(state.activeVoiceTurn)
    || Boolean(state.expectedResponse)
    || state.duplexAcceptAudio
    || isConversationPlaybackActive();
}

function settleFailedDuplexTurn() {
  const turn = state.activeVoiceTurn;
  const message = state.dialogueHistory.find(item => item.id === turn?.messageId);
  if (message && !message.final) { message.status = '识别未完成'; renderDialogue(); }
  stopSpeechPlayback(); clearUserTurn(); clearLocalSpeechTurn();
  state.duplexTranscript = ''; state.nudgeInFlight = false;
  openLearnerTurn(); scheduleIdleNudge(); syncVoiceStatus();
}

function finishDuplexTurnWhenAudioEnds() {
  const generation = state.playbackGeneration;
  clearCharacterTurnWatchdog();
  clearTimeout(state.duplexFinishTimer);
  const context = state.duplexPlayerContext;
  const remaining = context ? Math.max(0, state.duplexNextPlayTime - context.currentTime) : 0;
  state.duplexFinishTimer = setTimeout(() => {
    if (generation !== state.playbackGeneration || !state.duplexOutputDone) return;
    state.lastCharacterEndedAt = Date.now();
    clearCharacterCaptionReveal({ complete: true });
    state.duplexSpeaking = false;
    clearCharacterTurnWatchdog();
    clearReplyTimeout();
    state.awaitingModelReply = false;
    state.nudgeInFlight = false;
    state.duplexResponseText = '';
    state.duplexPendingSubtitle = '';
    state.duplexResponseIsPrompt = false;
    state.duplexValidatedText = false;
    retireExpectedResponse();
    state.streamingLumaIndex = null;
    state.duplexNextPlayTime = 0;
    state.duplexFinishTimer = null;
    const after = state.duplexAfter;
    state.duplexAfter = null;
    state.awaitingPrompt = false;
    if (state.stage === 'active' && currentTask().autoAdvance) completeMultimodalTask();
    const taskDone = ['complete', 'task-complete'].includes(state.stage);
    const liveLabel = liveTaskModeLabel();
    const nextPhase = taskDone
      ? (state.stage === 'complete' ? TURN_PHASE.COMPLETE : TURN_PHASE.TRANSITIONING)
      : (taskNeedsAction() && !state.actionDone ? TURN_PHASE.ACTION_PENDING : TURN_PHASE.LISTENING);
    const phaseLabel = state.stage === 'complete'
      ? '情境完成'
      : state.stage === 'task-complete'
        ? '这一段完成 · 稍后继续'
        : liveLabel;
    setTurnPhase(nextPhase, phaseLabel, taskDone || state.actionDone || state.speechDone ? 'is-complete' : '');
    if (!taskDone && taskNeedsSpeech() && !state.speechDone) openLearnerTurn();
    else openCourtesyTurn();
    if (!taskDone) flushDuplexTaskUpdate();
    if (isBreakfastScene() && state.stage === 'active') renderBreakfast();
    after?.();
    if (state.sceneStarted && !state.handsFreeListening && !state.micMuted && !taskDone) startHandsFreeListening().catch(() => {});
    scheduleIdleNudge();
  }, remaining * 1000 + 160);
}

async function enqueueDuplexPcm(base64, generation = state.playbackGeneration) {
  if (!base64 || generation !== state.playbackGeneration) return;
  const context = unlockDuplexPlayback();
  await context.resume();
  if (generation !== state.playbackGeneration) return;
  if (!state.duplexPlayerGain) {
    state.duplexPlayerGain = context.createGain();
    state.duplexPlayerGain.gain.value = .58; state.duplexPlayerGain.connect(context.destination);
  }
  const raw = atob(base64), samples = Math.floor(raw.length / 2);
  if (!samples) return;
  const buffer = context.createBuffer(1, samples, 24000), channel = buffer.getChannelData(0);
  for (let index = 0; index < samples; index += 1) {
    let value = raw.charCodeAt(index * 2) | (raw.charCodeAt(index * 2 + 1) << 8);
    if (value & 0x8000) value -= 0x10000;
    channel[index] = value / 32768;
  }
  if (generation !== state.playbackGeneration) return;
  const source = context.createBufferSource(); source.buffer = buffer; source.connect(state.duplexPlayerGain);
  const startAt = Math.max(context.currentTime + .025, state.duplexNextPlayTime || 0);
  if (!state.captionAudioStart) state.captionAudioStart = startAt;
  state.duplexNextPlayTime = startAt + buffer.duration; state.duplexSources.add(source);
  source.onended = () => { state.duplexSources.delete(source); };
  source.start(startAt);
}

function unlockDuplexPlayback() {
  state.duplexPlayerContext ||= new AudioContext({ sampleRate: 24000 });
  const context = state.duplexPlayerContext;
  scene.dataset.audioState = context.state;
  context.onstatechange = () => { scene.dataset.audioState = context.state; };
  if (context.state !== 'running') context.resume().catch(() => {});
  return context;
}

function queueDuplexAudio(audio) {
  if (!audio) return;
  const generation = state.playbackGeneration;
  scene.dataset.audioChunks = String(Number(scene.dataset.audioChunks || 0) + 1);
  state.duplexAudioQueue = state.duplexAudioQueue.then(() => enqueueDuplexPcm(audio, generation)).catch(() => {
    if (generation === state.playbackGeneration) settleFailedDuplexTurn();
  });
}

function releaseDuplexAudioGate() {
  if (state.duplexSubtitleReady) return;
  state.duplexSubtitleReady = true;
  clearTimeout(state.duplexAudioGateTimer);
  state.duplexAudioGateTimer = null;
  const pending = state.duplexPendingAudio.splice(0);
  pending.forEach(queueDuplexAudio);
}

function publishDuplexSubtitle() {
  const reply = state.duplexPendingSubtitle.trim();
  if (!state.duplexValidatedText || !reply || !state.duplexSpeaking) return false;
  state.duplexPendingSubtitle = '';
  if (state.pendingPostActionQuestion && state.actionDone && !state.speechDone && /\?\s*$/.test(reply)) {
    clearTimeout(state.postActionQuestionTimer);
    state.postActionQuestionTimer = null;
    state.pendingPostActionQuestion = false;
  }
  if (state.stage === 'active' && (state.duplexResponseIsPrompt || !state.characterPromptDelivered)) state.characterPromptDelivered = true;
  beginCharacterCaptionReveal(reply);
  releaseDuplexAudioGate();
  finishDuplexAudioOutput();
  return true;
}

async function finishDuplexAudioOutput() {
  if (!state.duplexOutputDone || !state.duplexSubtitleReady || !state.duplexAcceptAudio) return;
  const generation = state.playbackGeneration;
  state.duplexAcceptAudio = false;
  await state.duplexAudioQueue;
  if (generation === state.playbackGeneration) finishDuplexTurnWhenAudioEnds();
}

function extractDuplexText(event) {
  if (event.type?.endsWith('.delta')) {
    return String(event.delta ?? event.text ?? event.transcript ?? event.content ?? '');
  }
  if (event.type?.endsWith('.result')
    || event.type?.endsWith('.completed')
    || event.type?.endsWith('.done')) {
    return String(event.transcript ?? event.text ?? event.content ?? event.delta ?? '');
  }
  return String(event.text ?? event.transcript ?? event.content ?? event.delta ?? '');
}

function looksLikeReasoningLeak(value) {
  return /<(?:think|analysis)>|^(?:analysis|system prompt|hidden reasoning)\s*:/i.test(String(value || '').trim());
}

function asksForCompletedAction(value) {
  const task = currentTask(), text = normalizedSpeech(value);
  if (!state.actionDone || !taskNeedsAction(task) || /\b(means?|meaning|word|say)\b/.test(text)) return false;
  const object = task.id === 'gate-a12' ? 'a12' : task.id === 'office-signin' ? 'screen' : task.id;
  return isActionRequestLine(value) && text.includes(object);
}

function transitionReplyReplacement(value) {
  const tasks = currentSceneConfig().tasks;
  return DialogueRules.transitionReplyReplacement({
    text: value,
    stage: state.stage,
    hasMoreTasks: tasks.some((task) => !state.coveredGoals.has(task.id)),
  });
}

function safeCharacterReply() {
  if (Breakfast.isTask(currentTask().id)) return state.actionDone ? Breakfast.acknowledgment(currentTask().id, state.breakfast) : currentTask().prompt;
  if (state.actionDone && !state.speechDone) {
    const afterActionQuestions = {
      apple: 'Thank you. What is it?',
      milk: 'What is it?',
      plate: 'What is it?',
      cup: 'What is it?',
      spoon: 'What is it?',
      ticket: 'Your ticket?',
      'gate-a12': 'What is it?',
      'office-signin': 'All done?',
    };
    return afterActionQuestions[currentTask().id] || 'Thank you.';
  }
  if (state.actionDone && state.speechDone) {
    const completedReplies = {
      apple: 'Thank you.',
      milk: 'Yes. You found the milk.',
      plate: 'Yes. You found the plate.',
      cup: 'Yes. You touched the cup.',
      spoon: 'Yes. You found the spoon.',
      ticket: 'Thank you.',
      'gate-a12': 'Great. You found A12.',
      'office-signin': 'Thank you.',
    };
    return completedReplies[currentTask().id] || 'Great.';
  }
  if (!state.speechDone && !taskNeedsAction()) return currentTask().prompt || 'Can you answer?';
  const replies = {
    apple: 'Thank you.',
    milk: 'Okay. Keep looking.',
    plate: 'Okay. Keep looking.',
    cup: 'Okay. Keep looking.',
    spoon: 'Okay. Keep looking.',
    ticket: 'Thank you.',
    bag: 'Okay.',
    'gate-a12': 'Great.',
    'office-purpose': 'Okay.',
    'office-signin': 'Thank you.',
    'office-wait': 'Please wait here.',
    'office-greeting': 'Nice to meet you.',
  };
  return replies[currentTask().id] || 'Okay.';
}

function discardReasoningLeak(fallbackReply = '', { retrySafe = true } = {}) {
  if (state.suppressDuplexResponse) return;
  state.suppressDuplexResponse = true;
  const after = state.duplexAfter;
  stopDuplexPlayback({ cancel: true });
  clearReplyTimeout();
  state.awaitingModelReply = false;
  state.awaitingPrompt = false;
  const reply = fallbackReply || (!state.characterPromptDelivered ? currentTask().prompt : safeCharacterReply());
  if (!retrySafe) {
    state.suppressDuplexResponse = false;
    after?.();
    return;
  }
  if (!state.duplexReady || state.safeVoiceRetries >= 2) {
    state.suppressDuplexResponse = false;
    if (!state.characterPromptDelivered && state.stage === 'active') showToast('这句话没有播放，点左下角重听', 3000);
    after?.();
    return;
  }
  state.safeVoiceRetries += 1;
  const requestId = state.speechRequestSerial, session = state.practiceSession;
  setTimeout(() => {
    if (requestId !== state.speechRequestSerial || session !== state.practiceSession) return;
    state.suppressDuplexResponse = false;
    speak(reply, { after });
  }, 140);
}

function connectDuplexSession() {
  if (state.duplexReady) return Promise.resolve(true);
  if (state.duplexConnectPromise) return state.duplexConnectPromise;
  const generation = ++state.connectionGeneration;
  transcriptLedger.reset();
  clearLocalSpeechTurn();
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  const socket = new WebSocket(`${scheme}://${location.host}/api/duplex`);
  state.duplexSocket = socket;
  const promise = new Promise((resolve, reject) => {
    state.duplexConnectResolve = resolve; state.duplexConnectReject = reject;
  });
  state.duplexConnectPromise = promise;
  const current = () => state.duplexSocket === socket && generation === state.connectionGeneration;
  const fail = (message) => {
    if (!current()) return;
    clearTimeout(connectionWatchdog);
    state.duplexConnectReject?.(new Error(message));
    state.duplexConnectResolve = null; state.duplexConnectReject = null;
    state.duplexConnectPromise = null; state.duplexReady = false; state.duplexSocket = null;
    try { socket.close(); } catch {}
    settleFailedDuplexTurn(); syncVoiceStatus();
  };
  const connectionWatchdog = setTimeout(() => fail('connection_timeout'), 15000);
  socket.onopen = () => {
    if (!current()) return;
    sendDuplex({ type: 'start', taskId: currentTask().id, actionDone: state.actionDone,
      speechDone: state.speechDone, coveredGoals: [...state.coveredGoals], flowState: state.stage,
      breakfast: state.breakfast, speechRate: preferences.speechRate, history: state.dialogueHistory.filter(m => m.final || m.speaker === 'luma').slice(-12).map(m => ({ role: m.speaker === 'user' ? 'user' : 'assistant', text: m.text })) });
  };
  socket.onmessage = async (message) => {
    if (!current()) return;
    let event;
    try { event = JSON.parse(message.data); } catch { return; }
    scene.dataset.lastDuplexEvent = event.type || 'unknown';
    scene.dataset.lastDuplexEventAt = String(Date.now());
    if (event.type === 'session.created') {
      clearTimeout(connectionWatchdog); state.duplexReady = true;
      state.duplexConnectResolve?.(true);
      state.duplexConnectResolve = null; state.duplexConnectReject = null;
      state.duplexConnectPromise = null;
      flushMicrophoneBuffer(); syncVoiceStatus();
      return;
    }
    if (event.type === 'input_audio_buffer.speech_started') {
      state.lastServerSpeechAt = Date.now();
      state.pendingServerTurnContext = captureUserTurnContext();
      beginLocalSpeechTurn({ contextOverride: state.pendingServerTurnContext });
      return;
    }
    if (event.type === 'conversation.item.input_audio_transcription.started') {
      const turn = acceptTranscriptEvent(event, { allowStart: true });
      if (turn) armVoiceTurnWatchdog();
      return;
    }
    if (event.type === 'conversation.item.input_audio_transcription.delta'
      || event.type === 'conversation.item.input_audio_transcription.result') {
      const turn = acceptTranscriptEvent(event);
      const text = extractDuplexText(event);
      if (!turn || !VoiceRuntime.isSpeechText(text)) return;
      confirmLearnerTurn(turn, text);
      if (!turn.confirmed) return;
      updateLearnerTurn(turn, text);
      if (state.activeVoiceTurn === turn) { state.duplexTranscript = text; armVoiceTurnWatchdog(); }
      return;
    }
    if (event.type === 'conversation.item.input_audio_transcription.completed') {
      const turn = acceptTranscriptEvent(event);
      if (turn) finalizeLearnerTranscript(extractDuplexText(event) || turn.text, { turn });
      return;
    }
    if (event.type === 'conversation.item.input_audio_transcription.failed') {
      const turn = acceptTranscriptEvent(event);
      if (turn) finalizeLearnerTranscript('', { turn });
      return;
    }
    if (event.type === 'response.output_text.delta') {
      if (!acceptResponseEvent(event) || state.suppressDuplexResponse) return;
      state.duplexResponseText += extractDuplexText(event);
      return;
    }
    if (event.type === 'response.output_text.done') {
      if (!acceptResponseEvent(event) || state.suppressDuplexResponse) return;
      const reply = (extractDuplexText(event) || state.duplexResponseText).trim();
      state.duplexResponseText = '';
      if (looksLikeReasoningLeak(reply)) { discardReasoningLeak(); return; }
      if (asksForCompletedAction(reply)) { discardReasoningLeak(safeCharacterReply()); return; }
      const replacement = transitionReplyReplacement(reply);
      if (replacement) { discardReasoningLeak(replacement); return; }
      if (reply) { state.duplexValidatedText = true; state.duplexPendingSubtitle = reply; publishDuplexSubtitle(); }
      return;
    }
    if (event.type === 'response.output_audio.started') {
      if (!acceptResponseEvent(event) || state.suppressDuplexResponse) return;
      const expected = state.expectedResponse;
      expected.audioStarted = true;
      const turn = [...transcriptLedger.items.values()].find(item => item.id === expected.turnId);
      if (turn) {
        turn.responseStarted = true;
        // Release the speaking floor, but keep the item for final ASR updates.
        if (state.activeVoiceTurn === turn) clearLocalSpeechTurn();
      }
      clearIdleNudge(); clearReplyTimeout();
      clearTimeout(state.firstPacketTimer); state.firstPacketTimer = null;
      clearTimeout(state.promptTimer); state.promptTimer = null;
      if (!isConversationPlaybackActive()) stopDuplexPlayback({ cancel: false });
      else { clearTimeout(state.duplexFinishTimer); state.duplexFinishTimer = null; }
      state.duplexSpeaking = true; setVoicePhase('character');
      state.lumaStartedAt = Date.now(); state.lastDuplexAudioAt = state.lumaStartedAt;
      armCharacterTurnWatchdog();
      state.duplexOutputDone = false; state.duplexAcceptAudio = true;
      state.duplexPendingAudio = []; state.duplexSubtitleReady = false;
      state.duplexResponseIsPrompt = state.awaitingPrompt; state.awaitingPrompt = false;
      setTurnPhase(TURN_PHASE.CHARACTER_SPEAKING, '正在说 · 你可以开口', 'is-speaking');
      publishDuplexSubtitle();
      return;
    }
    if (event.type === 'response.output_audio.delta') {
      if (!acceptResponseEvent(event) || !state.duplexAcceptAudio) return;
      const audio = event.audio || event.delta || '';
      if (audio) { state.lastDuplexAudioAt = Date.now(); armCharacterTurnWatchdog(); }
      if (!state.duplexSubtitleReady) publishDuplexSubtitle();
      if (state.duplexSubtitleReady) queueDuplexAudio(audio);
      else if (audio) state.duplexPendingAudio.push(audio);
      return;
    }
    if (event.type === 'response.output_audio.done') {
      if (!acceptResponseEvent(event) || !state.duplexAcceptAudio) return;
      clearCharacterTurnWatchdog(); state.duplexOutputDone = true;
      if (!state.duplexSubtitleReady) {
        state.duplexAudioGateTimer = setTimeout(() => {
          if (current() && !state.duplexSubtitleReady) settleFailedDuplexTurn();
        }, 4000);
      } else finishDuplexAudioOutput();
      return;
    }
    // Unidentified done/canceled events cannot retire a newer response.
    if (['error', 'local.error', 'local.closed'].includes(event.type)) fail(event.message || 'voice_unavailable');
  };
  socket.onerror = () => fail('socket_error');
  socket.onclose = () => fail('socket_closed');
  return promise;
}

function updateDuplexTask({ force = false } = {}) {
  if (!state.duplexReady) return;
  if (!force && isConversationTurnPending()) {
    state.pendingTaskUpdate = true;
    return;
  }
  state.pendingTaskUpdate = false;
  sendDuplex({
    type: 'task.update',
    taskId: currentTask().id,
    actionDone: state.actionDone,
    speechDone: state.speechDone,
    coveredGoals: [...state.coveredGoals],
    flowState: state.stage,
    speechRate: preferences.speechRate,
    breakfast: state.breakfast,
  });
}

function flushDuplexTaskUpdate() {
  if (!state.pendingTaskUpdate || !state.duplexReady) return;
  state.pendingTaskUpdate = false;
  sendDuplex({
    type: 'task.update',
    taskId: currentTask().id,
    actionDone: state.actionDone,
    speechDone: state.speechDone,
    coveredGoals: [...state.coveredGoals],
    flowState: state.stage,
    speechRate: preferences.speechRate,
    breakfast: state.breakfast,
  });
}

function closeDuplexSession() {
  const socket = state.duplexSocket;
  state.connectionGeneration += 1;
  state.duplexSocket = null; state.duplexReady = false;
  state.duplexConnectReject?.(new Error('session_closed'));
  state.duplexConnectReject = null; state.duplexConnectResolve = null; state.duplexConnectPromise = null;
  try { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'close' })); socket?.close(); } catch {}
  stopSpeechPlayback(); setVoicePhase('idle');
}

function stopSpeechPlayback() {
  state.speechRequestSerial += 1;
  clearReplyTimeout();
  stopDuplexPlayback();
  state.awaitingPrompt = false;
  state.awaitingModelReply = false;
  clearUserTurn();
}

async function speak(text, { after, prompt = true } = {}) {
  const clean = String(text || '').trim();
  if (!clean) { after?.(); return false; }
  claimExclusiveVoiceSession(); unlockDuplexPlayback(); stopSpeechPlayback();
  const requestId = ++state.speechRequestSerial, session = state.practiceSession;
  if (state.sceneStarted && state.stage === 'active') state.awaitingPrompt = Boolean(prompt);
  if (!state.duplexReady) { try { await connectDuplexSession(); } catch {} }
  if (requestId !== state.speechRequestSerial || session !== state.practiceSession) return false;
  if (!state.duplexReady) {
    state.awaitingPrompt = false; openLearnerTurn(); scheduleIdleNudge();
    showToast('语音还没连上，可以先打字或稍后重听。'); after?.(); return false;
  }
  state.duplexAfter = after || null; state.duplexResponseText = '';
  state.duplexPendingSubtitle = clean; state.duplexValidatedText = true;
  const expected = beginExpectedResponse('say');
  state.firstPacketTimer = setTimeout(() => {
    if (state.expectedResponse?.id !== expected.id || expected.audioStarted) return;
    settleFailedDuplexTurn();
    showToast('这句话没有播放，可以点重听或继续说。');
  }, 10000);
  setVoicePhase('character'); sendDuplex({ type: 'say', text: clean });
  return true;
}

function emphasizeCurrentAction() {
  const task = currentTask();
  if (!taskNeedsAction(task) || state.actionDone) return;
  if (task.id === 'apple') apple.classList.add('is-emphasized');
  else hotspots.find((hotspot) => hotspot.dataset.object === task.id)?.classList.add('is-emphasized');
  syncTaskFocus();
}

function characterHintLine(level = 1) {
  if (isBreakfastScene()) {
    if (level >= 2) showBreakfastHelp();
    if (level === 1) return currentTask().prompt;
    const explanations = {
      'breakfast-drink': '你想喝牛奶还是水？可以说 Milk，或者 Water。',
      'breakfast-cup': '请给我一个杯子。把杯子拖到我手边就可以。',
      'breakfast-more': '你还想再喝一点吗？想要就说 Yes，够了就说 No。',
    };
    return explanations[currentTask().id];
  }
  const task = currentTask();
  if (taskNeedsAction(task) && !state.actionDone && level === 1) return task.actionPrompt || task.prompt;
  const support = speechSupportForTask(task);
  if (level === 1) return task.question && state.actionDone ? task.question : 'One word is okay.';
  if (level === 2) return `Try: ${support.starter}`;
  return `Say: ${support.model}`;
}

function queuePostActionQuestion() {
  const taskId = currentTask().id;
  const question = currentTask().question;
  clearTimeout(state.postActionQuestionTimer);
  state.postActionQuestionTimer = null;
  if (!question || state.speechDone || !state.actionDone) {
    state.pendingPostActionQuestion = false;
    return;
  }
  state.pendingPostActionQuestion = true;
  const askWhenQuiet = () => {
    if (!state.sceneStarted || state.stage !== 'active' || currentTask().id !== taskId || state.speechDone || !state.actionDone) {
      state.pendingPostActionQuestion = false;
      state.postActionQuestionTimer = null;
      return;
    }
    if (isConversationTurnPending()) {
      state.postActionQuestionTimer = setTimeout(askWhenQuiet, 180);
      return;
    }
    state.pendingPostActionQuestion = false;
    state.postActionQuestionTimer = null;
    speakCharacterCue(question);
  };
  // Give the learner time to answer the request that came before the action.
  // Without this grace period, a late "OK" is incorrectly assigned to the
  // follow-up question that has only just appeared.
  state.postActionQuestionTimer = setTimeout(askWhenQuiet, 1400);
}

function speakCharacterCue(text) {
  const clean = String(text || '').trim();
  if (!clean || isConversationTurnPending()) return false;
  state.nudgeInFlight = true;
  speak(clean, {
    prompt: false,
    after: () => {
      state.nudgeInFlight = false;
    },
  }).then((started) => {
    if (!started) state.nudgeInFlight = false;
  });
  return true;
}

function showToast(message, duration = 2200) {
  clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.classList.add('is-visible');
  state.toastTimer = setTimeout(() => toast.classList.remove('is-visible'), duration);
}

function syncSubtitleVisibility({ announce = false } = {}) {
  const hidden = state.subtitlesHidden;
  scene.classList.toggle('subtitles-hidden', hidden);
  subtitleToggle.classList.toggle('is-off', hidden);
  subtitleToggle.setAttribute('aria-pressed', String(!hidden));
  subtitleToggle.setAttribute('aria-label', hidden ? '显示字幕' : '隐藏字幕');
  subtitleToggle.title = hidden ? '显示字幕' : '隐藏字幕';
  subtitleToggle.innerHTML = `<i class="ph ${hidden ? 'ph-eye' : 'ph-closed-captioning'}" aria-hidden="true"></i>`;
  if (announce) showToast(hidden ? '字幕已隐藏 · 现在只听声音' : '字幕已显示 · 可以对照声音理解');
}

function toggleSubtitles() {
  state.subtitlesHidden = !state.subtitlesHidden;
  syncSubtitleVisibility({ announce: true });
}

function syncActionCoach() {
  actionCoach.hidden = true;
  actionCoachText.textContent = '';
}

function speechSupportForTask(task = currentTask()) {
  const supports = {
    apple: { meaning: '这是苹果。', starter: 'An…', model: 'An apple.' },
    milk: { meaning: '这是牛奶。', starter: 'M…', model: 'Milk.' },
    plate: { meaning: '这是盘子。', starter: 'A…', model: 'A plate.' },
    cup: { meaning: '这是杯子。', starter: 'A…', model: 'A cup.' },
    spoon: { meaning: '这是勺子。', starter: 'A…', model: 'A spoon.' },
    ticket: { meaning: '给你。', starter: 'Here…', model: 'Here you are.' },
    bag: { meaning: '这是你的包吗？', starter: 'Yes…', model: 'Yes.' },
    'gate-a12': { meaning: '指出登机口。', starter: 'A…', model: 'A12.' },
    'office-purpose': { meaning: '说出你想见的人。', starter: 'M…', model: 'Maya.' },
    'office-signin': { meaning: '签好了。', starter: 'I…', model: 'I signed in.' },
    'office-greeting': { meaning: '打个招呼就好。', starter: 'Hi…', model: 'Hi, Maya.' },
  };
  return supports[task.id] || { meaning: '说一个词也可以。', starter: 'Yes…', model: 'Yes.' };
}

function showAppToast(message, duration = 2400) {
  clearTimeout(appToastTimer);
  appToast.textContent = message;
  appToast.classList.add('is-visible');
  appToastTimer = setTimeout(() => appToast.classList.remove('is-visible'), duration);
}

function syncHomeProgressState() {
  const progress = document.querySelector('.daily-progress');
  const kitchenSessions = learningProfile.sessions.filter((session) => session.scene === 'kitchen');
  const guidedDone = state.completed || kitchenSessions.some((session) => session.mode === 'guided');
  const listeningDone = kitchenSessions.some((session) => session.mode === 'listening');
  const progressValue = listeningDone ? 100 : guidedDone ? 60 : 20;
  progress.querySelector('span').style.width = `${progressValue}%`;
  progress.setAttribute('aria-label', listeningDone ? '今天的字幕学习和无字幕复练已完成' : guidedDone ? '字幕学习已完成，下一步是无字幕复练' : '今天的字幕学习尚未完成');
  liveLabel.innerHTML = listeningDone
    ? '<i class="ph-fill ph-check-circle" aria-hidden="true"></i> 今日闭环完成'
    : guidedDone
      ? '<i class="ph-fill ph-ear" aria-hidden="true"></i> 下一步 · 只听声音'
      : '<i class="ph-fill ph-sparkle" aria-hidden="true"></i> 第一步 · 看字幕学习';
  primaryCta.innerHTML = `${listeningDone ? '再练一次' : guidedDone ? '无字幕再练' : '开始学习'} <i class="ph ph-arrow-right" aria-hidden="true"></i>`;
}

function syncSettingsUi() {
  speechRateValue.textContent = preferences.speechRate;
  rescueValue.textContent = preferences.rescue;
}

function handleSetting(button) {
  if (button.dataset.setting === 'speech-rate') {
    preferences.speechRate = preferences.speechRate === '慢速' ? '正常' : '慢速';
    localStorage.setItem('luma-speech-rate', preferences.speechRate);
    updateDuplexTask({ force: true });
    syncSettingsUi();
    showAppToast(`语音速度已切换为${preferences.speechRate}`);
    return;
  }
  if (button.dataset.setting === 'rescue') {
    preferences.rescue = preferences.rescue === '按需显示' ? '始终显示' : '按需显示';
    localStorage.setItem('luma-rescue', preferences.rescue);
    scene.classList.toggle('show-translation', preferences.rescue === '始终显示');
    syncSettingsUi();
    showAppToast(`中文救援层：${preferences.rescue}`);
    return;
  }
  showAppToast('网页预览不会发送系统提醒；安装 App 后再设置每日提醒。', 3200);
}

function scheduleTaskPrompt(taskId, initialDelay) {
  clearTimeout(state.promptTimer);
  const session = state.practiceSession;
  const deliver = () => {
    if (session !== state.practiceSession || state.stage !== 'active' || currentTask().id !== taskId || !state.awaitingPrompt) return;
    if (scheduledCharacterLineBlocked()) { state.promptTimer = setTimeout(deliver, 180); return; }
    state.promptTimer = null;
    speak(currentTask().prompt);
  };
  state.promptTimer = setTimeout(deliver, initialDelay);
}

function startTask(index, { speakAgain = true } = {}) {
  appShell.scrollTop = 0;
  clearReviewTransition();
  clearTaskAdvance();
  clearTimeout(state.toastTimer);
  toast.classList.remove('is-visible');
  toast.textContent = '';
  clearTimeout(state.promptTimer);
  state.promptTimer = null;
  clearTimeout(state.postActionQuestionTimer);
  state.postActionQuestionTimer = null;
  state.pendingPostActionQuestion = false;
  clearLocalSpeechTurn();
  stopSpeechPlayback();
  state.taskIndex = index;
  state.breakfastHelp = false; state.breakfastCupSelected = false;
  const task = currentTask();
  state.stage = 'active';
  state.hintLevel = 0;
  state.dragging = false;
  state.actionDone = !taskHasAction(task);
  state.speechDone = !taskNeedsSpeech(task);
  state.lastTranscript = '';
  state.lastVoiceEnergyAt = 0;
  state.lastBargeInEnergyAt = 0;
  state.micNoiseFloor = .002;
  state.transcriptionStartedAt = 0;
  state.streamingUserIndex = null;
  setVoicePhase(speakAgain ? 'character' : 'idle');
  state.pendingTaskUpdate = false;
  state.awaitingModelReply = false;
  state.userTurnActive = false;
  state.duplexResponseText = '';
  state.duplexPendingSubtitle = '';
  state.duplexValidatedText = false;
  state.duplexResponseIsPrompt = false;
  state.safeVoiceRetries = 0;
  retireExpectedResponse();
  state.lastFinalizedUser = null;
  scene.dataset.audioChunks = '0';
  scene.dataset.micFrames = '0';
  scene.dataset.micPackets = '0';
  scene.dataset.micRms = '0';
  scene.dataset.micThreshold = '0.0040';
  delete scene.dataset.voiceRecovery;
  delete scene.dataset.lastBargeInAt;
  state.characterPromptDelivered = false;
  state.suppressDuplexResponse = false;
  state.idleNudgeCount = 0;
  state.actionCoachRevealed = false;
  state.questionReadyAt = 0;
  clearIdleNudge();
  scene.className = 'scene';
  syncSubtitleVisibility();
  apple.className = 'apple-object';
  apple.classList.toggle('is-task-active', task.id === 'apple');
  apple.style.opacity = task.id === 'apple' ? '1' : '0';
  hotspots.forEach((hotspot) => {
    const active = task.interaction === 'tap' && hotspot.dataset.object === task.id;
    hotspot.classList.remove('is-found', 'is-emphasized');
    hotspot.classList.toggle('is-active', active);
    hotspot.disabled = !active;
  });
  syncTaskFocus();
  syncActionCoach();
  micButton.disabled = false;
  micButton.setAttribute('aria-label', state.micMuted ? '重试语音识别' : '打开麦克风');
  micLabel.textContent = state.handsFreeListening ? '随时说' : state.micMuted ? '重试语音' : '准备中';
  currentGoalRecord();
  syncSceneProgress();
  renderBreakfast();
  setApplePosition(state.initialApple, true);
  state.currentSpeech = '';
  state.activeQuestion = '';
  state.nudgeInFlight = false;
  scene.classList.toggle('show-translation', preferences.rescue === '始终显示');
  if (!state.dialogueHistory.length) languagePanel.hidden = true;
  setTurnPhase(TURN_PHASE.PRESENTING, `场景 ${index + 1}/${currentSceneConfig().tasks.length} · 准备听`);
  state.awaitingPrompt = false;
  if (state.duplexReady) updateDuplexTask({ force: true });
  else connectDuplexSession().catch(() => {});
  state.awaitingPrompt = Boolean(speakAgain);
  if (speakAgain) {
    scheduleTaskPrompt(task.id, state.duplexReady ? 180 : 2600);
  }
  ensureSceneVoiceIsOpen();
}

function resetScene({ speakAgain = true } = {}) {
  state.practiceSession += 1;
  state.pendingFeedback.forEach(controller => controller.abort());
  state.pendingFeedback.clear();
  transcriptLedger.reset();
  microphoneBuffer.clear();
  state.breakfast = Breakfast.initial();
  closeDuplexSession();
  state.dialogueHistory = [];
  state.coveredGoals = new Set();
  state.sessionGoals = {};
  state.sessionStartedAt = Date.now();
  state.sessionSaved = false;
  state.hintsUsed = 0;
  state.questionReadyAt = 0;
  state.streamingLumaIndex = null;
  state.streamingUserIndex = null;
  state.pendingUserIndex = null;
  state.ignoredTranscriptItems = new Set();
  closeDialogueHistoryPanel();
  renderDialogue();
  startTask(0, { speakAgain });
}

function startScene({ subtitlesHidden = false, skipIntro = false } = {}) {
  if (!skipIntro && localStorage.getItem('luma-intro-v1') !== 'seen') {
    showSceneIntroduction({ subtitlesHidden }); return;
  }
  hideSceneIntroduction();
  claimExclusiveVoiceSession();
  unlockDuplexPlayback();
  closeSheet();
  clearTimeout(state.completionTimer);
  state.completionTimer = null;
  state.subtitlesHidden = Boolean(subtitlesHidden);
  state.practiceMode = state.subtitlesHidden ? 'listening' : 'guided';
  state.completionCelebrated = false;
  reviewScreen.classList.remove('is-celebrating');
  completionCelebration.replaceChildren();
  reviewScreen.classList.remove('is-active');
  reviewScreen.setAttribute('aria-hidden', 'true');
  experience.classList.add('is-active');
  experience.setAttribute('aria-hidden', 'false');
  syncSubtitleVisibility();
  state.sceneStarted = true;
  startVoiceHealthMonitor();
  state.dialogueHistory = [];
  state.coveredGoals = new Set();
  state.streamingLumaIndex = null;
  state.streamingUserIndex = null;
  state.pendingUserIndex = null;
  renderDialogue();
  configureScene();
  syncA11yState();
  createDust();
  requestAnimationFrame(() => {
    updateSceneGeometry();
    resetScene({ speakAgain: true });
    if (state.subtitlesHidden) showToast('无字幕练习 · 先听声音，需要时可打开字幕', 3200);
  });
}

function leaveScene({ keepVoice = false } = {}) {
  hideSceneIntroduction();
  breakfastWorld.hidden = true; breakfastPanel.hidden = true;
  delete scene.dataset.breakfast;
  state.practiceSession += 1;
  state.pendingFeedback.forEach(controller => controller.abort());
  state.pendingFeedback.clear();
  textAnswerForm.hidden = true;
  scene.classList.remove('is-typing');
  stopVoiceHealthMonitor();
  clearIdleNudge();
  clearReviewTransition();
  clearTaskAdvance();
  clearTimeout(state.promptTimer);
  state.promptTimer = null;
  clearTimeout(state.postActionQuestionTimer);
  state.postActionQuestionTimer = null;
  state.pendingPostActionQuestion = false;
  clearLocalSpeechTurn();
  stopSpeechPlayback();
  cancelSpeechCapture();
  experience.classList.remove('is-active');
  experience.setAttribute('aria-hidden', 'true');
  state.sceneStarted = false;
  state.awaitingPrompt = false;
  state.awaitingModelReply = false;
  state.userTurnActive = false;
  setVoicePhase('idle');
  if (!keepVoice) closeDuplexSession();
  state.dragging = false;
  actionCoach.hidden = true;
  scene.classList.remove('is-dragging', 'near-target', 'is-listening');
  syncA11yState();
}

function pointFromEvent(event) {
  const rect = scene.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function beginDrag(event) {
  if (!state.sceneStarted || state.actionDone || !['active', 'dragging'].includes(state.stage)) return;
  event.preventDefault();
  state.dragging = true;
  state.stage = 'dragging';
  state.pointerId = event.pointerId;
  actionCoach.hidden = true;
  apple.setPointerCapture?.(event.pointerId);
  apple.classList.add('is-dragging');
  scene.classList.add('is-dragging');
  setMode('把它递给我');
  setApplePosition(pointFromEvent(event), true);
}

function moveDrag(event) {
  if (!state.dragging || event.pointerId !== state.pointerId) return;
  event.preventDefault();
  const point = pointFromEvent(event);
  setApplePosition(point, true);
  scene.classList.toggle('near-target', distance(point, state.hand) < Math.max(82, 112 * state.scale));
}

function finishDrag(event) {
  if (!state.dragging || event.pointerId !== state.pointerId) return;
  const point = pointFromEvent(event);
  state.dragging = false;
  apple.releasePointerCapture?.(event.pointerId);
  apple.classList.remove('is-dragging');
  scene.classList.remove('is-dragging', 'near-target');
  if (distance(point, state.hand) < Math.max(94, 126 * state.scale)) {
    completeAction();
  } else {
    state.stage = 'active';
    setApplePosition(state.initialApple);
    syncActionCoach();
    setMode('再试一次');
    setTimeout(() => {
      if (!isConversationTurnPending() && state.stage === 'active') speakCharacterCue('Almost. Give me the apple.');
    }, 220);
  }
}

function completeAction() {
  const task = currentTask();
  if (task.id !== 'apple' || state.actionDone) return;
  state.stage = 'active';
  completeCurrentTaskAction();
  scene.classList.remove('hint-one', 'hint-two', 'show-translation');
  if (completeMultimodalTask()) return;
  setMode('动作完成 · 等你回答', 'is-complete');
  queuePostActionQuestion();
}

function completeHotspotAction(objectName) {
  const task = currentTask();
  if (state.actionDone || task.id !== objectName || state.stage !== 'active') return;
  completeCurrentTaskAction();
  if (completeMultimodalTask()) return;
  setMode('动作完成 · 等你回答', 'is-complete');
  if (task.question) queuePostActionQuestion();
  else if (!isConversationTurnPending()) {
    const followUp = {
      ticket: 'Your ticket?',
      'gate-a12': 'What is it?',
      'office-signin': 'All done?',
    }[task.id];
    if (followUp) speakCharacterCue(followUp);
  }
}

function completeCurrentTaskAction() {
  const task = currentTask();
  if (!taskHasAction(task) || state.actionDone) return false;
  state.actionDone = true;
  const activeCharacterLine = state.duplexPendingSubtitle || state.currentSpeech;
  if (isConversationPlaybackActive() && asksForCompletedAction(activeCharacterLine)) {
    // Once the physical action is visible, the old action request is obsolete.
    // Stop it immediately so it cannot keep telling the learner to repeat an
    // action they have already completed.
    clearReplyTimeout();
    state.awaitingPrompt = false;
    state.awaitingModelReply = false;
    stopDuplexPlayback({ cancel: true });
    openLearnerTurn();
  }
  if (task.question && !state.speechDone) state.pendingPostActionQuestion = true;
  currentGoalRecord().acted = true;
  syncActionCoach();
  syncSceneProgress();
  updateDuplexTask({ force: true });
  if (task.id === 'apple') {
    setApplePosition(state.hand);
    apple.classList.add('is-delivered', 'is-celebrating');
  } else {
    hotspots.find((item) => item.dataset.object === task.id)?.classList.add('is-found');
  }
  syncTaskFocus();
  return true;
}

async function playCompletionSound() {
  try {
    const context = new AudioContext();
    await context.resume();
    const now = context.currentTime;
    const notes = [[523.25, 0], [659.25, .1], [783.99, .2]];
    notes.forEach(([frequency, delay]) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(.035, now + delay + .025);
      gain.gain.exponentialRampToValueAtTime(.0001, now + delay + .28);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + delay);
      oscillator.stop(now + delay + .3);
    });
    setTimeout(() => context.close().catch(() => {}), 700);
  } catch {}
}

function playCompletionCelebration() {
  if (state.completionCelebrated) return;
  state.completionCelebrated = true;
  reviewScreen.classList.add('is-celebrating');
  completionCelebration.replaceChildren();
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const colors = ['#0b0c12', '#ffbd59', '#8be3a8', '#8fbaf4', '#a990ee', '#ffffff'];
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 44; index += 1) {
      const piece = document.createElement('i');
      const direction = index % 2 === 0 ? 1 : -1;
      piece.className = 'completion-confetti';
      piece.style.left = direction === 1 ? '8%' : '92%';
      piece.style.setProperty('--confetti-color', colors[index % colors.length]);
      piece.style.setProperty('--confetti-apex-x', `${direction * Math.round(70 + Math.random() * 150)}px`);
      piece.style.setProperty('--confetti-end-x', `${direction * Math.round(15 + Math.random() * 105)}px`);
      piece.style.setProperty('--confetti-apex-y', `${-Math.round(56 + Math.random() * 18)}vh`);
      piece.style.setProperty('--confetti-end-y', `${-Math.round(92 + Math.random() * 16)}vh`);
      const spin = Math.round(Math.random() * 720 - 360);
      piece.style.setProperty('--confetti-mid-spin', `${Math.round(spin * .62)}deg`);
      piece.style.setProperty('--confetti-spin', `${spin}deg`);
      piece.style.setProperty('--confetti-delay', `${Math.round(Math.random() * 260)}ms`);
      fragment.appendChild(piece);
    }
    completionCelebration.appendChild(fragment);
  }
  playCompletionSound();
  setTimeout(() => {
    reviewScreen.classList.remove('is-celebrating');
    completionCelebration.replaceChildren();
  }, 3400);
}

function representativeLearnerUtterance() {
  const tasks = currentSceneConfig().tasks;
  for (const task of [...tasks].reverse()) {
    const utterance = String(state.sessionGoals[task.id]?.utterance || '').trim();
    if (utterance) return utterance;
  }
  const taskIds = tasks.map((task) => task.id);
  const matched = [...state.dialogueHistory].reverse().find((message) => (
    message.speaker === 'user'
    && taskIds.some((taskId) => DialogueRules.matchesTask(taskId, message.text))
  ));
  if (matched) return matched.text;
  return [...state.dialogueHistory].reverse().find((message) => message.speaker === 'user' && message.text !== '…')?.text
    || 'You responded in the scene.';
}

function showReview() {
  clearReviewTransition();
  if (reviewScreen.classList.contains('is-active')) return;
  appShell.scrollTop = 0;
  leaveScene({ keepVoice: true });
  reviewScreen.classList.add('is-active');
  reviewScreen.setAttribute('aria-hidden', 'false');
  state.turnPhase = TURN_PHASE.REVIEW;
  reviewScreen.dataset.practiceMode = state.practiceMode;
  syncA11yState();
  clearTimeout(state.completionTimer);
  state.completionTimer = setTimeout(() => {
    state.completionTimer = null;
    if (reviewScreen.classList.contains('is-active')) playCompletionCelebration();
  }, 340);
  document.querySelector('.review-scroll').scrollTop = 0;
  saveLearningSession();
  syncHomeProgressState();
  const data = SCENES[state.selectedScene];
  const count = currentSceneConfig().tasks.length;
  const goals = Object.values(state.sessionGoals);
  const heardCount = goals.filter((goal) => goal.heard).length;
  const actionCount = goals.filter((goal) => goal.acted).length;
  const hintCount = goals.reduce((sum, goal) => sum + goal.hints, 0);
  document.querySelector('#reviewSceneMeta').textContent = `${data.title} · ${state.practiceMode === 'listening' ? '无字幕复练' : '字幕学习'} · ${count} 个目标`;
  document.querySelector('#reviewHeard').textContent = `${heardCount} 条${state.practiceMode === 'listening' ? '无字幕理解' : '真实请求'}`;
  document.querySelector('#reviewActions').textContent = `完成 ${actionCount} 个有效动作`;
  document.querySelector('#reviewSpoken').textContent = `${goals.filter((goal) => goal.spoke).length} 次有效回应 · ${hintCount} 次提示`;
  const didSpeak = goals.some(goal => goal.spoke);
  const original = didSpeak ? representativeLearnerUtterance() : '你用动作完成了这次合作。下次可以试着说一个词。';
  const corrected = DialogueRules.gentleRecast(original);
  document.querySelector('#reviewOriginal').textContent = original;
  document.querySelector('#reviewCorrected').textContent = corrected;
  document.querySelector('#reviewRecastArrow').hidden = !corrected;
  document.querySelector('#reviewRecastLabel').hidden = !corrected;
  document.querySelector('#playRecast').hidden = !corrected;
  document.querySelector('#reviewTransferTitle').textContent = state.selectedScene === 'airport'
    ? 'ticket 会在酒店入住时再次出现'
    : state.selectedScene === 'office'
      ? 'I’m here to see 会在前台办事时再次出现'
      : 'give me 会在机场服务中再次出现';
  document.querySelector('#reviewTransferCopy').textContent = '下一次会换一个真实情境，不会重复背同一个答案。';
  repeatSceneButton.innerHTML = state.practiceMode === 'guided'
    ? '<i class="ph ph-eye-slash"></i> 关闭字幕再练一次'
    : '<i class="ph ph-arrows-split"></i> 换个场景继续';
}

function clearReviewTransition() {
  clearTimeout(state.reviewTimer);
  state.reviewTimer = null;
}

function clearTaskAdvance() {
  clearTimeout(state.advanceTimer);
  state.advanceTimer = null;
}

function scheduleTaskAdvance(nextTaskIndex) {
  clearTaskAdvance();
  let quietSince = 0;

  const waitForStableQuiet = () => {
    if (state.stage !== 'task-complete' || !experience.classList.contains('is-active')) {
      clearTaskAdvance();
      return;
    }
    if (isConversationTurnPending()) {
      quietSince = 0;
      state.advanceTimer = setTimeout(waitForStableQuiet, 180);
      return;
    }
    if (!quietSince) {
      quietSince = Date.now();
      setMode(`${currentTask().speaker || 'Luma'} 听懂了 · 稍后继续`, 'is-complete');
    }
    const dwell = DialogueRules.transitionDwell(latestCharacterText(), {
      normal: TASK_ADVANCE_DWELL_MS,
      afterQuestion: 12000,
    });
    const remaining = dwell - (Date.now() - quietSince);
    if (remaining > 0) {
      state.advanceTimer = setTimeout(waitForStableQuiet, Math.min(180, remaining));
      return;
    }
    state.advanceTimer = null;
    startTask(nextTaskIndex);
  };

  waitForStableQuiet();
}

function scheduleReview() {
  clearReviewTransition();
  let quietSince = 0;

  const waitForStableQuiet = () => {
    if (state.stage !== 'complete' || !experience.classList.contains('is-active')) {
      clearReviewTransition();
      return;
    }
    if (isConversationTurnPending()) {
      quietSince = 0;
      state.reviewTimer = setTimeout(waitForStableQuiet, 220);
      return;
    }
    if (!quietSince) {
      quietSince = Date.now();
      setMode(`${currentTask().speaker || 'Luma'} 听懂了 · 这一段完成了`, 'is-complete');
    }
    const dwell = DialogueRules.transitionDwell(latestCharacterText(), {
      normal: FINAL_REVIEW_DWELL_MS,
      afterQuestion: 12000,
    });
    const remaining = dwell - (Date.now() - quietSince);
    if (remaining > 0) {
      state.reviewTimer = setTimeout(waitForStableQuiet, Math.min(220, remaining));
      return;
    }
    state.reviewTimer = null;
    showReview();
  };

  waitForStableQuiet();
}

async function finishSpeakingAnswer(transcript) {
  const clean = String(transcript || '').trim();
  if (!clean || !state.sceneStarted) return false;
  if (!state.duplexReady) {
    showToast('正在连接，文字还在输入框里，请稍后发送。');
    connectDuplexSession().catch(() => {}); return false;
  }
  stopSpeechPlayback();
  const context = captureUserTurnContext();
  const index = addDialogueMessage('user', clean), message = state.dialogueHistory[index];
  message.final = true;
  beginExpectedResponse('text');
  state.awaitingModelReply = true;
  armReplyTimeout();
  sendDuplex({ type: 'user.text', text: clean });
  requestLanguageFeedback(context.question, clean, { ...context, messageId: message.id, revision: message.revision, final: true });
  return true;
}

function completeMultimodalTask({ waitForDuplexReply = false } = {}) {
  if (!taskRequirementsMet() || ['task-complete', 'complete'].includes(state.stage)) return false;
  const task = currentTask();
  const tasks = currentSceneConfig().tasks;
  const taskCount = tasks.length;
  state.coveredGoals.add(task.id);
  const nextTaskIndex = tasks.findIndex((candidate, index) => index > state.taskIndex && !state.coveredGoals.has(candidate.id));
  const isSceneComplete = nextTaskIndex === -1;
  const completedCount = tasks.filter((candidate) => state.coveredGoals.has(candidate.id)).length;
  const conversationBusy = waitForDuplexReply || isConversationTurnPending();
  state.stage = isSceneComplete ? 'complete' : 'task-complete';
  setTurnPhase(isSceneComplete ? TURN_PHASE.COMPLETE : TURN_PHASE.TRANSITIONING);
  state.pendingTaskUpdate = false;
  micLabel.textContent = state.handsFreeListening ? '随时说' : '完成';
  micButton.disabled = false;
  scene.classList.add('is-complete');
  if (isBreakfastScene()) renderBreakfast();
  apple.classList.remove('is-celebrating');
  syncSceneProgress();
  if (!conversationBusy) {
    setMode(`完成 ${completedCount}/${taskCount}`, 'is-complete');
  }
  const advance = isSceneComplete
    ? scheduleReview
    : () => scheduleTaskAdvance(nextTaskIndex);
  if (isSceneComplete) {
    localStorage.setItem('luma-demo-v6-complete', new Date().toISOString());
    state.completed = true;
  }
  // The flow scheduler is the only owner of task advancement. Character
  // speech may finish, fail, or be interrupted without losing or duplicating
  // the next-task transition.
  advance();
  updateDuplexTask({ force: true });
  if (!conversationBusy && !task.autoAdvance) speak(safeCharacterReply(), { prompt: false });
  return true;
}

function cleanupSpeechCaptureUi() {
  scene.classList.remove('is-listening');
  micButton.classList.remove('is-held');
  micButton.classList.toggle('is-live', state.handsFreeListening);
  micButton.classList.toggle('is-muted', state.micMuted);
  micButton.setAttribute('aria-pressed', String(state.handsFreeListening));
  micLabel.textContent = state.stage === 'complete'
    ? (state.handsFreeListening ? '随时说' : '完成')
    : state.handsFreeListening
      ? (state.voicePhase === 'recording' ? '正在听' : '随时说')
      : state.micMuted ? '重试语音' : '打开麦克风';
}

function disconnectAudioCapture() {
  if (state.audioProcessor?.port) state.audioProcessor.port.onmessage = null;
  if (state.audioProcessor) state.audioProcessor.onaudioprocess = null;
  for (const node of [state.audioSource, state.audioFilter, state.audioProcessor, state.audioSink]) {
    try { node?.disconnect(); } catch {}
  }
  state.audioSource = null; state.audioFilter = null; state.audioProcessor = null; state.audioSink = null;
}

function releaseMicrophoneStream(stream = state.mediaStream) {
  stream?.getAudioTracks().forEach((track) => {
    track.onended = null;
    track.onmute = null;
    try { track.stop(); } catch {}
  });
  if (state.mediaStream === stream) state.mediaStream = null;
}

function cancelSpeechCapture() {
  state.captureGeneration += 1;
  clearIdleNudge();
  state.handsFreeListening = false; state.micStarting = false;
  disconnectAudioCapture(); releaseMicrophoneStream();
  microphoneBuffer.clear(); state.bufferOverflow = false;
  setVoicePhase('idle'); cleanupSpeechCaptureUi();
}

function flushMicrophoneBuffer() {
  const socket = state.duplexSocket;
  if (!state.duplexReady || socket?.readyState !== WebSocket.OPEN || socket.bufferedAmount > 64000) return;
  for (const pcm of microphoneBuffer.take()) {
    socket.send(pcm.buffer);
    scene.dataset.micPackets = String(Number(scene.dataset.micPackets || 0) + 1);
  }
  if (state.bufferOverflow) {
    state.bufferOverflow = false;
    syncVoiceStatus();
  }
}

function syncMobileViewport() {
  const viewport = window.visualViewport;
  document.documentElement.style.setProperty('--app-height', `${viewport?.height || window.innerHeight}px`);
  document.documentElement.style.setProperty('--viewport-top', `${viewport?.offsetTop || 0}px`);
  updateSceneGeometry();
}

async function getMicrophoneStream(generation = state.captureGeneration) {
  const activeTrack = state.mediaStream?.getAudioTracks()[0];
  if (activeTrack?.readyState === 'live' && activeTrack.enabled && !activeTrack.muted) return state.mediaStream;
  releaseMicrophoneStream();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  if (generation !== state.captureGeneration || !state.sceneStarted || state.micMuted) {
    stream.getTracks().forEach(track => track.stop());
    return null;
  }
  state.mediaStream = stream;
  return stream;
}

async function startHandsFreeListening() {
  if (!state.sceneStarted || state.handsFreeListening || state.micStarting) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
    state.micMuted = true; syncVoiceStatus();
    showToast('当前浏览器无法收音，可以点“打字”继续。'); return;
  }
  claimExclusiveVoiceSession();
  const generation = ++state.captureGeneration;
  const valid = () => generation === state.captureGeneration && state.sceneStarted && !state.micMuted;
  state.micStarting = true; state.micMuted = false;
  micButton.disabled = true; syncVoiceStatus();
  try {
    connectDuplexSession().catch(() => {});
    const stream = await getMicrophoneStream(generation);
    if (!stream || !valid()) return;
    disconnectAudioCapture();
    state.audioContext ||= new AudioContext();
    const context = state.audioContext;
    await context.resume();
    if (!valid()) return;
    if (context.audioWorklet && !state.audioWorkletLoaded) {
      try { await context.audioWorklet.addModule('./microphone-worklet.js'); state.audioWorkletLoaded = true; } catch {}
    }
    if (!valid()) return;
    const resampler = new VoiceRuntime.PcmResampler(context.sampleRate);
    const receive = input => {
      if (!valid() || !sceneVoiceIsOpen()) return;
      state.lastMicFrameAt = Date.now();
      let sum = 0;
      for (const sample of input) sum += sample * sample;
      const rms = Math.sqrt(sum / Math.max(1, input.length));
      scene.dataset.micRms = rms.toFixed(4);
      scene.dataset.micFrames = String(Number(scene.dataset.micFrames || 0) + 1);
      // Native echo cancellation/noise suppression clean audio. Volume is
      // telemetry only; a door, keyboard or fan must never cancel the character.
      if (rms > .008) state.lastVoiceEnergyAt = Date.now();
      const pcm = resampler.push(input);
      if (!pcm.length) return;
      if (state.bufferOverflow) { flushMicrophoneBuffer(); return; }
      if (!microphoneBuffer.push(pcm)) {
        state.bufferOverflow = true;
        showToast('连接中断太久，这段声音未发完。请等连接恢复后重说，或打字。', 4500);
        syncVoiceStatus(); return;
      }
      flushMicrophoneBuffer();
    };
    state.audioSource = context.createMediaStreamSource(stream);
    state.audioFilter = context.createBiquadFilter();
    state.audioFilter.type = 'highpass'; state.audioFilter.frequency.value = 75; state.audioFilter.Q.value = .7;
    if (state.audioWorkletLoaded) {
      state.audioProcessor = new AudioWorkletNode(context, 'luma-microphone', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      state.audioProcessor.port.onmessage = event => receive(event.data);
    } else {
      state.audioProcessor = context.createScriptProcessor(1024, 1, 1);
      state.audioProcessor.onaudioprocess = event => receive(event.inputBuffer.getChannelData(0));
    }
    state.audioSink = context.createGain(); state.audioSink.gain.value = 0;
    state.audioSource.connect(state.audioFilter);
    state.audioFilter.connect(state.audioProcessor);
    state.audioProcessor.connect(state.audioSink); state.audioSink.connect(context.destination);
    state.handsFreeListening = true; state.lastMicFrameAt = Date.now();
    const track = stream.getAudioTracks()[0];
    track.onended = () => {
      if (!valid()) return;
      cancelSpeechCapture(); state.micMuted = false;
      setTimeout(ensureSceneVoiceIsOpen, 300);
    };
    // Temporary OS mute is handled by the health monitor; do not stop a live
    // track during a brief interruption from Safari or a phone notification.
    micButton.classList.add('is-live'); micButton.classList.remove('is-muted', 'is-held');
    micButton.setAttribute('aria-pressed', 'true'); micButton.setAttribute('aria-label', '关闭麦克风');
    openLearnerTurn(); syncVoiceStatus();
  } catch (error) {
    if (!valid()) return;
    state.handsFreeListening = false; state.micMuted = true;
    disconnectAudioCapture(); releaseMicrophoneStream();
    micButton.classList.remove('is-live'); micButton.classList.add('is-muted');
    micButton.setAttribute('aria-pressed', 'false'); micButton.setAttribute('aria-label', '重试麦克风');
    showToast(error?.name === 'NotAllowedError' ? '允许麦克风后可以说话；也可以点“打字”。' : '麦克风暂时不可用，可以重试或打字。', 3200);
    syncVoiceStatus();
  } finally {
    if (generation === state.captureGeneration) { state.micStarting = false; micButton.disabled = false; }
  }
}

function pauseHandsFreeListening() {
  state.micMuted = true;
  cancelSpeechCapture();
  const turn = state.activeVoiceTurn;
  const message = state.dialogueHistory.find(item => item.id === turn?.messageId);
  if (message && !message.final) { message.status = '麦克风已关闭'; renderDialogue(); }
  clearLocalSpeechTurn();
  micButton.disabled = false; micButton.setAttribute('aria-label', '继续语音识别');
  setMode('麦克风已静音'); syncVoiceStatus();
}

function toggleHandsFreeListening(event) {
  event?.preventDefault?.();
  if (state.handsFreeListening || state.micStarting) pauseHandsFreeListening();
  else startHandsFreeListening();
}

function showHint() {
  if (!state.sceneStarted) return;
  const task = currentTask();
  if (['complete', 'task-complete'].includes(state.stage)) {
    return;
  }
  if (isBreakfastScene()) { recordHint(); showBreakfastHelp(); speakCharacterCue(characterHintLine(1)); return; }
  state.hintLevel = Math.min(state.hintLevel + 1, 3);
  recordHint();
  emphasizeCurrentAction();
  speakCharacterCue(characterHintLine(state.hintLevel));
}

function updateParallax(event) {
  if (state.dragging || !state.sceneStarted) return;
  const rect = scene.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width - .5) * -10;
  const y = ((event.clientY - rect.top) / rect.height - .5) * -7;
  scene.style.setProperty('--look-x', `${x}px`);
  scene.style.setProperty('--look-y', `${y}px`);
}

navButtons.forEach((button) => button.addEventListener('click', () => showView(button.dataset.nav)));
document.querySelectorAll('[data-open-scene]').forEach((button) => button.addEventListener('click', () => {
  state.selectedScene = button.dataset.openScene;
  const kitchenSessions = learningProfile.sessions.filter((session) => session.scene === 'kitchen');
  const guidedDone = state.completed || kitchenSessions.some((session) => session.mode === 'guided');
  const listeningDone = kitchenSessions.some((session) => session.mode === 'listening');
  const continueIntoListening = button.classList.contains('primary-cta') && state.selectedScene === 'kitchen' && guidedDone && !listeningDone;
  startScene({ subtitlesHidden: continueIntoListening });
}));
document.querySelectorAll('[data-preview]').forEach((button) => button.addEventListener('click', () => openSheet(button.dataset.preview, button)));
document.querySelectorAll('[data-close-sheet]').forEach((button) => button.addEventListener('click', closeSheet));
sceneSheet.addEventListener('keydown', trapSheetFocus);
document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => applyFilter(button.dataset.filter)));
document.querySelectorAll('[data-setting]').forEach((button) => button.addEventListener('click', () => handleSetting(button)));
sheetCta.addEventListener('click', () => { if (SCENES[state.selectedScene]?.available) startScene(); });
exitScene.addEventListener('click', leaveScene);
resetButton.addEventListener('click', () => resetScene());
subtitleToggle.addEventListener('click', toggleSubtitles);
replayButton.addEventListener('click', () => speak(state.activeQuestion || currentTask().prompt, { rate: .84 }));
helpButton.addEventListener('click', showHint);
micButton.addEventListener('click', toggleHandsFreeListening);
apple.addEventListener('pointerdown', beginDrag);
apple.addEventListener('pointermove', moveDrag);
apple.addEventListener('pointerup', finishDrag);
apple.addEventListener('pointercancel', finishDrag);
window.addEventListener('pointerup', finishDrag);
window.addEventListener('pointercancel', finishDrag);
apple.addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && state.stage === 'active' && currentTask().id === 'apple') { event.preventDefault(); completeAction(); }
});
hotspots.forEach((hotspot) => hotspot.addEventListener('click', () => completeHotspotAction(hotspot.dataset.object)));
scene.addEventListener('pointermove', updateParallax);
scene.addEventListener('pointerleave', () => { scene.style.setProperty('--look-x', '0px'); scene.style.setProperty('--look-y', '0px'); });
openDialogueHistory.addEventListener('click', openDialogueHistoryPanel);
document.querySelector('#closeDialogueHistory').addEventListener('click', closeDialogueHistoryPanel);
document.querySelector('#closeDialogueHistoryBackdrop').addEventListener('click', closeDialogueHistoryPanel);
document.querySelector('#playRecast').addEventListener('click', () => {
  const expression = document.querySelector('#reviewCorrected').textContent.trim();
  if (expression) speak(expression, { rate: .78 });
});
document.querySelector('#closeReview').addEventListener('click', () => { clearTimeout(state.completionTimer); stopSpeechPlayback(); closeDuplexSession(); reviewScreen.classList.remove('is-active'); reviewScreen.setAttribute('aria-hidden', 'true'); showView('home'); });
document.querySelector('#finishReview').addEventListener('click', () => { clearTimeout(state.completionTimer); stopSpeechPlayback(); closeDuplexSession(); reviewScreen.classList.remove('is-active'); reviewScreen.setAttribute('aria-hidden', 'true'); showView('home'); });
repeatSceneButton.addEventListener('click', () => {
  if (state.practiceMode === 'guided') {
    startScene({ subtitlesHidden: true });
    return;
  }
  stopSpeechPlayback();
  closeDuplexSession();
  reviewScreen.classList.remove('is-active');
  reviewScreen.setAttribute('aria-hidden', 'true');
  showView('world');
});
document.querySelectorAll('.phrase-cloud button').forEach((button) => button.addEventListener('click', () => speak(button.querySelector('strong').textContent, { rate: .72 })));
window.addEventListener('resize', updateSceneGeometry);
window.addEventListener('orientationchange', () => setTimeout(updateSceneGeometry, 160));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state.sceneStarted || state.micMuted) return;
  state.audioContext?.resume().catch(() => {});
  ensureSceneVoiceIsOpen();
  if (!state.duplexReady && !state.duplexConnectPromise) connectDuplexSession().catch(() => {});
});

document.querySelectorAll('i.ph, i.ph-fill').forEach((icon) => icon.setAttribute('aria-hidden', 'true'));
document.querySelectorAll('.filter-chip').forEach((button) => {
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-selected', String(button.classList.contains('is-active')));
});

syncSettingsUi();
syncHomeProgressState();
syncLearningUi();
syncA11yState();


textAnswerToggle.addEventListener('click', () => {
  textAnswerForm.hidden = !textAnswerForm.hidden;
  scene.classList.toggle('is-typing', !textAnswerForm.hidden);
  textAnswerToggle.setAttribute('aria-expanded', String(!textAnswerForm.hidden));
  if (!textAnswerForm.hidden) textAnswerInput.focus();
  else textAnswerInput.blur();
});
textAnswerForm.addEventListener('submit', async event => {
  event.preventDefault();
  const text = textAnswerInput.value;
  if (await finishSpeakingAnswer(text)) {
    textAnswerInput.value = ''; textAnswerInput.blur(); textAnswerForm.hidden = true;
    scene.classList.remove('is-typing'); textAnswerToggle.setAttribute('aria-expanded', 'false');
  }
});
window.visualViewport?.addEventListener('resize', syncMobileViewport);
window.visualViewport?.addEventListener('scroll', syncMobileViewport);
window.addEventListener('resize', syncMobileViewport);
window.addEventListener('pagehide', () => {
  stopSpeechPlayback(); cancelSpeechCapture(); closeDuplexSession();
});
window.addEventListener('pageshow', () => { if (state.sceneStarted && !state.micMuted) ensureSceneVoiceIsOpen(); });
syncMobileViewport();

window.__lumaDemo = {
  openSheet,
  startScene,
  finishSpeakingAnswer,
  showReview,
  showView,
  learningSnapshot: () => ({
    scene: state.selectedScene,
    practiceMode: state.practiceMode,
    turnPhase: state.turnPhase,
    stage: state.stage,
    taskId: currentTask().id,
    actionDone: state.actionDone,
    speechDone: state.speechDone,
    characterPromptDelivered: state.characterPromptDelivered,
    voiceOpen: sceneVoiceIsOpen(),
    voicePhase: state.voicePhase,
    handsFreeListening: state.handsFreeListening,
    micMuted: state.micMuted,
    activeVoiceTurn: state.activeVoiceTurn?.id || null,
    micFrames: Number(scene.dataset.micFrames || 0),
    micPackets: Number(scene.dataset.micPackets || 0),
    progress: taskProgress(),
    goals: JSON.parse(JSON.stringify(state.sessionGoals)),
  }),
};

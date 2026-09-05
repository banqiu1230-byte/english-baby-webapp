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

let sheetTrigger = null;
let appToastTimer = null;
const preferences = {
  speechRate: localStorage.getItem('luma-speech-rate') || '慢速',
  rescue: localStorage.getItem('luma-rescue') || '按需显示',
};

const SCENES = {
  kitchen: {
    image: './assets/kitchen-mobile-neutral.png',
    badge: '可进入',
    eyebrow: 'HOME · MORNING',
    title: '帮 Luma 准备早餐',
    description: '连续参与 5 个生活片段：可以边听边做、随时开口，说话和动作顺序不限。',
    people: [['user', 'Luma'], ['clock', '6 分钟'], ['sparkle', '5 个任务']],
    goal: 'apple · milk · plate · cup · spoon',
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

const KITCHEN_TASKS = [
  {
    id: 'apple', interaction: 'drag', requiresAction: true, prompt: 'Can you give me the apple?', translation: '把苹果递给我，好吗？',
    actionSuccess: 'Thank you! You gave me the apple.', actionTranslation: '谢谢！你把苹果递给我了。',
    question: 'What is it?', questionTranslation: '这是什么？', answer: 'apple',
    spokenSuccess: 'Yes — an apple. You said it.', spokenTranslation: '对，是苹果。你已经说出来了。',
    natural: ["It’s an apple.", 'That’s an apple.', 'I found an apple.'], actionPrompt: 'Good. Give me the apple.', hint: '把红苹果拖到 Luma 的手边。',
  },
  {
    id: 'milk', interaction: 'tap', requiresAction: true, prompt: 'Can you find the milk?', translation: '你能找到牛奶吗？',
    actionSuccess: 'Yes, that is the milk.', actionTranslation: '对，那是牛奶。',
    question: 'What did you find?', questionTranslation: '你找到了什么？', answer: 'milk',
    spokenSuccess: 'Milk. You found the milk.', spokenTranslation: '牛奶。你找到了牛奶。',
    natural: ['I found the milk.', 'Here is the milk.', 'The milk is here.'], actionPrompt: 'Good. Touch the milk.', hint: '点一下桌上的牛奶瓶。',
  },
  {
    id: 'plate', interaction: 'tap', requiresAction: true, prompt: 'Where is the plate?', translation: '盘子在哪里？',
    actionSuccess: 'Right — the plate is on the table.', actionTranslation: '对，盘子在桌上。',
    question: 'What is it?', questionTranslation: '这是什么？', answer: 'plate',
    spokenSuccess: 'A plate. You found the plate.', spokenTranslation: '一个盘子。你找到了盘子。',
    natural: ["It’s a plate.", 'Here is the plate.', 'I found the plate.'], actionPrompt: 'Good. Touch the plate.', hint: '点一下桌子右侧的大盘子。',
  },
  {
    id: 'cup', interaction: 'tap', requiresAction: true, prompt: 'Touch the cup.', translation: '碰一下杯子。',
    actionSuccess: 'Good. That is the cup.', actionTranslation: '很好，那是杯子。',
    question: 'What did you touch?', questionTranslation: '你碰了什么？', answer: 'cup',
    spokenSuccess: 'A cup. You touched the cup.', spokenTranslation: '一个杯子。你碰了杯子。',
    natural: ['I touched the cup.', 'This is the cup.', 'Here is the cup.'], actionPrompt: 'Yes. Touch the cup.', hint: '点一下桌子右侧的杯子。',
  },
  {
    id: 'spoon', interaction: 'tap', requiresAction: true, prompt: 'Can you find the spoon?', translation: '你能找到勺子吗？',
    actionSuccess: 'Yes, that is the spoon.', actionTranslation: '对，那是勺子。',
    question: 'What did you find?', questionTranslation: '你找到了什么？', answer: 'spoon',
    spokenSuccess: 'A spoon. You found the spoon.', spokenTranslation: '一把勺子。你找到了勺子。',
    natural: ['I found the spoon.', 'Here is the spoon.', 'The spoon is here.'], actionPrompt: 'Good. Touch the spoon.', hint: '点一下盘子下面的勺子。',
  },
];

const AIRPORT_TASKS = [
  { id: 'ticket', interaction: 'tap', requiresAction: true, prompt: 'Can I see your ticket?', actionPrompt: 'Good. Show me the ticket.', hint: '点一下手里的登机牌。' },
  { id: 'bag', interaction: 'speech', requiresAction: false, prompt: 'Is this your bag?', hint: '直接回答 Luma，不需要点击行李箱。' },
  { id: 'gate-a12', interaction: 'tap', requiresAction: true, prompt: 'Can you find gate A12?', actionPrompt: 'Point to the A12 sign, please.', hint: '点一下画面中的 A12，表示你已经指出了登机口。' },
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
const BARGE_IN_GUARD_MS = 80;
const CONTINUATION_WINDOW_MS = 1200;
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
  return tasks[state.taskIndex] ?? tasks[0];
}

function taskNeedsAction(task = currentTask()) {
  return task.requiresAction === true;
}

function taskHasAction(task = currentTask()) {
  return task.interaction === 'drag' || task.interaction === 'tap';
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

function responseCompletesTaskSpeech(task, text, question = state.activeQuestion || state.currentSpeech) {
  if (!taskNeedsSpeech(task)) return true;
  return DialogueRules.matchesTask(task.id, text);
}

function captureUserTurnContext() {
  return {
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
    if (document.visibilityState !== 'visible' || state.micMuted) return;
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

function bindExpectedResponseQuestion(questionId) {
  const expected = state.expectedResponse;
  if (!expected || expected.kind !== 'user' || !questionId) return;
  if (!expected.questionId) expected.questionId = String(questionId);
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
  if (expected.kind === 'user' && questionId && state.activeVoiceTurn?.itemId
    && state.activeVoiceTurn.itemId !== questionId) {
    rememberBounded(state.ignoredResponseIds, responseId);
    rememberBounded(state.ignoredQuestionIds, questionId);
    return false;
  }
  if (!expected.responseId && responseId) expected.responseId = responseId;
  if (!expected.questionId && questionId) expected.questionId = questionId;
  return true;
}

function rememberIgnoredTranscriptItem(itemId) {
  rememberBounded(state.ignoredTranscriptItems, itemId);
}

function acceptTranscriptEvent(event, { allowStart = false } = {}) {
  const itemId = transcriptItemId(event);
  if (itemId && state.ignoredTranscriptItems.has(itemId)) return false;
  const recentBargeIn = isConversationPlaybackActive() && Date.now() - state.lastBargeInEnergyAt < 900;
  const recentServerSpeech = Date.now() - state.lastServerSpeechAt < 1800;
  if (!state.activeVoiceTurn
    && allowStart
    && sceneVoiceIsOpen()
    && (!isConversationPlaybackActive() || recentBargeIn)
    && (recentServerSpeech || Date.now() - state.lastVoiceEnergyAt < 900)) {
    beginLocalSpeechTurn({ contextOverride: state.pendingServerTurnContext });
  }
  const turn = state.activeVoiceTurn;
  if (!turn) {
    rememberIgnoredTranscriptItem(itemId);
    return false;
  }
  if (itemId && turn.itemId && turn.itemId !== itemId) {
    rememberIgnoredTranscriptItem(itemId);
    return false;
  }
  if (itemId && !turn.itemId) turn.itemId = itemId;
  bindExpectedResponseQuestion(itemId);
  return true;
}

function sameTurnContext(left, right) {
  return Boolean(left && right
    && left.sceneId === right.sceneId
    && left.taskId === right.taskId
    && left.taskIndex === right.taskIndex);
}

function continuationCandidate(context) {
  const last = state.lastFinalizedUser;
  const expected = state.expectedResponse;
  if (!last || !expected || expected.kind !== 'user' || expected.audioStarted) return null;
  if (!state.awaitingModelReply || Date.now() - last.at > CONTINUATION_WINDOW_MS) return null;
  if (!sameTurnContext(last.context, context)) return null;
  const message = state.dialogueHistory[last.index];
  return message?.speaker === 'user' ? last : null;
}

function joinTranscriptParts(first, second) {
  const left = String(first || '').trim().replace(/[.!?,;:]+$/u, '');
  let right = String(second || '').trim();
  if (!left) return right;
  if (!right) return left;
  const normalizedLeft = normalizedSpeech(left);
  const normalizedRight = normalizedSpeech(right);
  if (normalizedRight.startsWith(normalizedLeft)) return right;
  if (normalizedLeft.endsWith(normalizedRight)) return `${left}.`;
  if (!/^(?:maya|a\d+)/i.test(right)) right = `${right[0].toLowerCase()}${right.slice(1)}`;
  return `${left} ${right}`;
}

function transcriptForActiveTurn(fragment) {
  const continuationText = state.activeVoiceTurn?.continuationText;
  return continuationText ? joinTranscriptParts(continuationText, fragment) : String(fragment || '').trim();
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

function armVoiceTurnWatchdog() {
  clearTimeout(state.voiceTurnWatchdogTimer);
  const turnId = state.activeVoiceTurn?.id;
  if (!turnId) return;
  state.voiceTurnWatchdogTimer = setTimeout(() => {
    if (state.activeVoiceTurn?.id !== turnId) return;
    const transcript = state.duplexTranscript.trim();
    if (transcript) {
      scene.dataset.voiceRecovery = 'stalled-final-event';
      finalizeLearnerTranscript(transcript, {
        passiveTurn: Boolean(state.activeVoiceTurn?.passive),
        turnContext: state.activeVoiceTurn?.context || state.userTurnContext || captureUserTurnContext(),
        transcriptIndex: state.streamingUserIndex,
      });
      return;
    }
    const index = state.streamingUserIndex;
    if (Number.isInteger(index) && state.dialogueHistory[index]?.text === '…') {
      removeDialogueMessage(index);
    }
    scene.dataset.voiceRecovery = 'no-transcript';
    retireExpectedResponse();
    if (state.duplexReady) sendDuplex({ type: 'response.cancel' });
    clearLocalSpeechTurn();
    openLearnerTurn();
  }, 6000);
}

function finalizeLearnerTranscript(transcript, {
  passiveTurn = Boolean(state.activeVoiceTurn?.passive),
  turnContext = state.activeVoiceTurn?.context || state.userTurnContext || captureUserTurnContext(),
  transcriptIndex = state.streamingUserIndex,
} = {}) {
  const activeTurn = state.activeVoiceTurn;
  const cleanTranscript = transcriptForActiveTurn(transcript);
  state.duplexTranscript = '';
  cleanupSpeechCaptureUi();
  state.transcriptionStartedAt = 0;
  if (!cleanTranscript) {
    retireExpectedResponse();
    if (state.duplexReady) sendDuplex({ type: 'response.cancel' });
    clearLocalSpeechTurn();
    if (activeTurn?.continuationText && Number.isInteger(transcriptIndex)) {
      const message = state.dialogueHistory[transcriptIndex];
      if (message) message.text = activeTurn.continuationText;
      renderDialogue();
    } else if (Number.isInteger(transcriptIndex) && transcriptIndex >= 0) {
      removeDialogueMessage(transcriptIndex);
    }
    state.streamingUserIndex = null;
    micButton.disabled = false;
    openLearnerTurn();
    return;
  }
  updateUserDialogue(cleanTranscript, true);
  bindExpectedResponseQuestion(activeTurn?.itemId);
  const finalIndex = Number.isInteger(state.pendingUserIndex) ? state.pendingUserIndex : transcriptIndex;
  state.lastFinalizedUser = Number.isInteger(finalIndex)
    ? { index: finalIndex, text: cleanTranscript, context: turnContext, at: Date.now() }
    : null;
  clearLocalSpeechTurn({ keepContext: true });
  setVoicePhase('listening');
  state.awaitingModelReply = true;
  if (!state.expectedResponse) beginExpectedResponse('user', { questionId: activeTurn?.itemId });
  armReplyTimeout();
  setTurnPhase(TURN_PHASE.CHARACTER_SPEAKING, `${currentTask().speaker || 'Luma'} 正在回应 · 仍可继续说`);
  if (!passiveTurn && state.stage === 'active') {
    // Task scoring is background bookkeeping. It must never block, reject, or
    // replace the character's natural response to this learner utterance.
    requestLanguageFeedback(turnContext.question, cleanTranscript, turnContext);
  } else {
    state.pendingUserIndex = null;
  }
  state.userTurnContext = null;
  publishDuplexSubtitle();
}

function beginLocalSpeechTurn({ contextOverride = null } = {}) {
  const playbackActive = isConversationPlaybackActive();
  const interruptingCharacter = playbackActive
    && Date.now() - state.lumaStartedAt > BARGE_IN_GUARD_MS
    && Date.now() - state.lastBargeInEnergyAt < 900;
  if (!sceneVoiceIsOpen()
    || state.activeVoiceTurn
    || (playbackActive && !interruptingCharacter)) return false;
  clearTimeout(state.courtesyTimer);
  state.courtesyTimer = null;
  const context = contextOverride || captureUserTurnContext();
  const continuation = continuationCandidate(context);
  if (interruptingCharacter) {
    clearReplyTimeout();
    state.awaitingPrompt = false;
    state.awaitingModelReply = false;
    state.nudgeInFlight = false;
    scene.dataset.lastBargeInAt = String(Date.now());
    stopDuplexPlayback({ cancel: true });
  }
  // A new utterance owns the floor. Any older model response may still finish
  // server-side, but it can no longer close or score this new learner turn.
  if (state.awaitingModelReply) {
    clearReplyTimeout();
    state.awaitingModelReply = false;
    stopDuplexPlayback({ cancel: true });
  } else if (state.expectedResponse) {
    state.awaitingPrompt = false;
    stopDuplexPlayback({ cancel: true });
  }
  state.userTurnContext = context;
  const turnId = ++state.voiceTurnSerial;
  state.activeVoiceTurn = {
    id: turnId,
    itemId: '',
    context,
    passive: state.stage !== 'active' || state.speechDone,
    continuationText: continuation?.text || '',
  };
  beginExpectedResponse('user', { turnId });
  setVoicePhase('recording');
  state.localSpeechActive = true;
  state.userTranscriptPending = true;
  if (continuation) {
    state.streamingUserIndex = continuation.index;
    state.pendingUserIndex = continuation.index;
  } else if (!isDuplexPlaybackActive() && state.streamingUserIndex === null) {
    state.streamingUserIndex = addDialogueMessage('user', '…');
    setTurnPhase(TURN_PHASE.LISTENING, '正在听你说', 'is-listening');
  }
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
  return `<article class="dialogue-bubble is-${message.speaker}"><small>${message.speaker === 'user' ? '你' : escapeHtml(message.name || 'Luma')}</small><p>${escapeHtml(message.text)}</p></article>`;
}

function renderDialogue() {
  const recent = state.dialogueHistory.slice(-2);
  recentDialogue.innerHTML = recent.map(dialogueMarkup).join('');
  dialogueHistoryList.innerHTML = state.dialogueHistory.map(dialogueMarkup).join('');
  languagePanel.hidden = recent.length === 0;
  openDialogueHistory.hidden = state.dialogueHistory.length <= 2;
}

function removeDialogueMessage(index) {
  if (!Number.isInteger(index) || index < 0 || index >= state.dialogueHistory.length) return false;
  state.dialogueHistory.splice(index, 1);
  for (const key of ['streamingLumaIndex', 'streamingUserIndex', 'pendingUserIndex']) {
    if (state[key] === index) state[key] = null;
    else if (Number.isInteger(state[key]) && state[key] > index) state[key] -= 1;
  }
  if (state.lastFinalizedUser?.index === index) state.lastFinalizedUser = null;
  else if (Number.isInteger(state.lastFinalizedUser?.index) && state.lastFinalizedUser.index > index) {
    state.lastFinalizedUser.index -= 1;
  }
  renderDialogue();
  return true;
}

function addDialogueMessage(speaker, text, name = '') {
  const clean = String(text || '').trim();
  if (!clean) return null;
  state.dialogueHistory.push({ speaker, name, text: clean });
  const index = state.dialogueHistory.length - 1;
  if (speaker === 'user') state.pendingUserIndex = index;
  renderDialogue();
  return index;
}

function latestCharacterText() {
  return [...state.dialogueHistory].reverse().find((message) => message.speaker === 'luma')?.text || '';
}

function updateLumaDialogue(text, done = false) {
  const clean = String(text || '').trim();
  if (!clean) return;
  state.currentSpeech = clean;
  if (!state.nudgeInFlight) state.activeQuestion = clean;
  if (state.streamingLumaIndex === null) {
    const lastIndex = state.dialogueHistory.length - 1;
    const lastMessage = state.dialogueHistory[lastIndex];
    state.streamingLumaIndex = lastMessage?.speaker === 'luma' && normalizedSpeech(lastMessage.text) === normalizedSpeech(clean)
      ? lastIndex
      : addDialogueMessage('luma', clean, currentTask().speaker || 'Luma');
  } else if (state.dialogueHistory[state.streamingLumaIndex]) {
    state.dialogueHistory[state.streamingLumaIndex].text = clean;
    renderDialogue();
  }
  if (done) {
    state.streamingLumaIndex = null;
    state.characterTurnId += 1;
    markGoalHeard();
  }
}

function clearCharacterCaptionReveal({ complete = false, interrupted = false } = {}) {
  clearTimeout(state.captionRevealTimer);
  state.captionRevealTimer = null;
  const messageIndex = state.streamingLumaIndex;
  const message = state.dialogueHistory[messageIndex];
  if (complete && message?.speaker === 'luma' && state.captionCharacters.length) {
    message.text = state.captionCharacters.join('');
    renderDialogue();
  } else if (interrupted && message?.speaker === 'luma') {
    // A canceled voice line is not a completed message. Keeping fragments such
    // as “Yes. Yo…” in history made the dialogue look duplicated and broken.
    removeDialogueMessage(messageIndex);
  }
  state.captionCharacters = [];
  state.captionVisibleCount = 0;
  state.streamingLumaIndex = null;
}

function beginCharacterCaptionReveal(text) {
  const clean = String(text || '').trim();
  if (!clean) return;
  clearCharacterCaptionReveal({ interrupted: true });
  state.currentSpeech = clean;
  if (!state.nudgeInFlight) state.activeQuestion = clean;
  state.captionCharacters = Array.from(clean);
  state.captionVisibleCount = 1;
  state.streamingLumaIndex = addDialogueMessage('luma', state.captionCharacters[0], currentTask().speaker || 'Luma');
  state.characterTurnId += 1;
  markGoalHeard();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const message = state.dialogueHistory[state.streamingLumaIndex];
    if (message) message.text = clean;
    renderDialogue();
    return;
  }
  const revealNext = () => {
    const message = state.dialogueHistory[state.streamingLumaIndex];
    if (!message || state.captionVisibleCount >= state.captionCharacters.length) {
      state.captionRevealTimer = null;
      return;
    }
    const nextCharacter = state.captionCharacters[state.captionVisibleCount];
    state.captionVisibleCount += 1;
    message.text = state.captionCharacters.slice(0, state.captionVisibleCount).join('');
    renderDialogue();
    const delay = /[.!?,]/.test(nextCharacter) ? 170 : /\s/.test(nextCharacter) ? 34 : 78;
    state.captionRevealTimer = setTimeout(revealNext, delay);
  };
  state.captionRevealTimer = setTimeout(revealNext, 70);
}

function updateUserDialogue(text, done = false) {
  const clean = String(text || '').trim();
  if (!clean) return;
  if (state.streamingUserIndex === null) {
    state.streamingUserIndex = addDialogueMessage('user', clean);
  } else if (state.dialogueHistory[state.streamingUserIndex]) {
    state.dialogueHistory[state.streamingUserIndex].text = clean;
    state.pendingUserIndex = state.streamingUserIndex;
    renderDialogue();
  }
  if (done) state.streamingUserIndex = null;
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
    if (!state.sceneStarted || !stillMissing || ['complete', 'task-complete'].includes(state.stage)) return;
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
  const index = context.userIndex ?? state.pendingUserIndex;
  const message = state.dialogueHistory[index];
  if (!message || message.speaker !== 'user') return;
  const sameTask = state.selectedScene === context.sceneId
    && currentTask().id === context.taskId
    && state.taskIndex === context.taskIndex
    && state.stage === 'active';
  const actionAcknowledged = sameTask && isActionAcknowledgement(currentTask(), message.text, context.question);
  const completesSpeech = sameTask
    && !actionAcknowledged
    && (responseCompletesTaskSpeech(currentTask(), message.text, context.question) || feedback.meaning_valid === true);

  // Dialogue is never graded in the UI. This observer only records evidence
  // for the task that was active when the learner started this utterance.
  renderDialogue();
  if (state.pendingUserIndex === index) state.pendingUserIndex = null;
  if (!sameTask || !completesSpeech) return;
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
  const context = {
    sceneId: state.selectedScene,
    taskId: currentTask().id,
    taskIndex: state.taskIndex,
    userIndex: state.pendingUserIndex,
    ...turnContext,
  };
  const localFeedback = fallbackMeaningFeedback(answer, context.taskId);
  if (isActionAcknowledgement(currentTask(), answer, context.question)) localFeedback.meaning_valid = true;
  if (localFeedback.meaning_valid) {
    applyDynamicFeedback(localFeedback, context);
    return;
  }
  try {
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: context.question || question, answer, sceneId: context.sceneId, taskId: context.taskId }),
    });
    if (!response.ok) throw new Error('feedback_unavailable');
    const feedback = await response.json();
    applyDynamicFeedback(feedback, context);
  } catch {
    if (!localFeedback.meaning_valid) applyDynamicFeedback(localFeedback, context);
  }
}

function openDialogueHistoryPanel() {
  dialogueHistory.classList.add('is-open');
  dialogueHistory.setAttribute('aria-hidden', 'false');
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
    hotspot.setAttribute('aria-label', id ? (config.anchors[id].label || id) : '');
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

function armCharacterTurnWatchdog(delayMs = 1600, quietThresholdMs = 1350) {
  clearCharacterTurnWatchdog();
  const taskId = currentTask().id;
  state.characterWatchdogTimer = setTimeout(() => {
    state.characterWatchdogTimer = null;
    if (!state.sceneStarted || currentTask().id !== taskId || !state.duplexSpeaking || state.duplexOutputDone) return;
    const quietFor = Date.now() - state.lastDuplexAudioAt;
    if (quietFor < quietThresholdMs) {
      armCharacterTurnWatchdog(quietThresholdMs - quietFor, quietThresholdMs);
      return;
    }
    // Some realtime sessions omit their final audio/done event. The local
    // audio stream going quiet is enough evidence to hand the turn back.
    scene.dataset.voiceRecovery = 'audio-idle-handoff';
    state.duplexOutputDone = true;
    if (!state.duplexSubtitleReady) publishDuplexSubtitle();
    if (state.duplexSubtitleReady && state.duplexAcceptAudio) {
      finishDuplexAudioOutput();
      return;
    }
    settleFailedDuplexTurn();
  }, Math.max(120, delayMs));
}

function clearUserTurn() {
  clearTimeout(state.userTurnTimer);
  state.userTurnTimer = null;
  state.userTurnActive = false;
}

function markUserTurnActive() {
  clearTimeout(state.userTurnTimer);
  state.userTurnActive = true;
  state.userTurnTimer = setTimeout(clearUserTurn, 1800);
}

function armReplyTimeout() {
  clearReplyTimeout();
  state.replyTimer = setTimeout(() => {
    state.replyTimer = null;
    if (!state.awaitingModelReply || isConversationPlaybackActive()) return;
    state.awaitingModelReply = false;
    retireExpectedResponse();
    if (state.duplexReady) sendDuplex({ type: 'response.cancel' });
    state.duplexResponseText = '';
    state.duplexPendingSubtitle = '';
    state.duplexValidatedText = false;
    const after = state.duplexAfter;
    state.duplexAfter = null;
    showToast('这次回应超时了，情境会继续，不用重来', 3000);
    after?.();
    openLearnerTurn();
  }, 7000);
}

function stopDuplexPlayback({ cancel = true } = {}) {
  clearCharacterTurnWatchdog();
  clearCharacterCaptionReveal({ interrupted: true });
  clearTimeout(state.duplexFinishTimer);
  clearTimeout(state.duplexAudioGateTimer);
  state.duplexFinishTimer = null;
  state.duplexAudioGateTimer = null;
  state.duplexPendingAudio = [];
  state.duplexSubtitleReady = false;
  state.duplexSources.forEach((source) => { try { source.stop(); } catch {} });
  state.duplexSources.clear();
  state.duplexNextPlayTime = 0;
  state.duplexAudioQueue = Promise.resolve();
  state.duplexSpeaking = false;
  state.duplexOutputDone = false;
  if (cancel) {
    state.duplexAcceptAudio = false;
    retireExpectedResponse();
    state.duplexResponseText = '';
    state.duplexPendingSubtitle = '';
    state.duplexResponseIsPrompt = false;
    state.duplexValidatedText = false;
    state.streamingLumaIndex = null;
  }
  if (cancel) state.duplexAfter = null;
  if (cancel && state.duplexReady) sendDuplex({ type: 'response.cancel' });
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
  const interruptedTurn = state.activeVoiceTurn;
  const interruptedUserIndex = state.streamingUserIndex;
  const interruptedUserMessage = state.dialogueHistory[state.streamingUserIndex];
  clearCharacterCaptionReveal({ interrupted: true });
  clearCharacterTurnWatchdog();
  clearReplyTimeout();
  clearUserTurn();
  state.awaitingPrompt = false;
  state.awaitingModelReply = false;
  state.userTurnActive = false;
  retireExpectedResponse();
  clearLocalSpeechTurn();
  state.duplexAcceptAudio = false;
  state.duplexResponseText = '';
  state.duplexPendingSubtitle = '';
  state.duplexResponseIsPrompt = false;
  state.duplexValidatedText = false;
  state.duplexTranscript = '';
  if (interruptedTurn?.continuationText && Number.isInteger(interruptedUserIndex) && interruptedUserMessage) {
    interruptedUserMessage.text = interruptedTurn.continuationText;
    renderDialogue();
  } else if (Number.isInteger(interruptedUserIndex) && interruptedUserIndex >= 0 && interruptedUserMessage) {
    removeDialogueMessage(interruptedUserIndex);
  }
  const after = state.duplexAfter;
  state.duplexAfter = null;
  after?.();
  openLearnerTurn();
  if (sceneVoiceIsOpen()) {
    setTimeout(() => {
      if (sceneVoiceIsOpen() && !state.duplexReady && !state.duplexConnectPromise) {
        connectDuplexSession().catch(() => {});
      }
    }, 900);
  }
}

function finishDuplexTurnWhenAudioEnds() {
  clearCharacterTurnWatchdog();
  clearTimeout(state.duplexFinishTimer);
  const context = state.duplexPlayerContext;
  const remaining = context ? Math.max(0, state.duplexNextPlayTime - context.currentTime) : 0;
  state.duplexFinishTimer = setTimeout(() => {
    if (!state.duplexOutputDone) return;
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
    after?.();
    if (state.sceneStarted && !state.handsFreeListening && !state.micMuted && !taskDone) startHandsFreeListening().catch(() => {});
    scheduleIdleNudge();
  }, remaining * 1000 + 160);
}

async function enqueueDuplexPcm(base64) {
  if (!base64) return;
  const context = unlockDuplexPlayback();
  await context.resume();
  if (!state.duplexPlayerGain) {
    state.duplexPlayerGain = context.createGain();
    state.duplexPlayerGain.gain.value = 0.58;
    state.duplexPlayerGain.connect(context.destination);
  }
  const raw = atob(base64);
  const samples = Math.floor(raw.length / 2);
  const buffer = context.createBuffer(1, samples, 24000);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < samples; index += 1) {
    let value = raw.charCodeAt(index * 2) | (raw.charCodeAt(index * 2 + 1) << 8);
    if (value & 0x8000) value -= 0x10000;
    channel[index] = value / 32768;
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(state.duplexPlayerGain);
  const startAt = Math.max(context.currentTime + .025, state.duplexNextPlayTime || 0);
  source.start(startAt);
  state.duplexNextPlayTime = startAt + buffer.duration;
  state.duplexSources.add(source);
  source.onended = () => {
    state.duplexSources.delete(source);
    if (!state.duplexSources.size && state.duplexSpeaking && state.duplexSubtitleReady && !state.duplexOutputDone) {
      // Local playback is the authoritative end of the character's turn.
      // A short debounce still allows a late audio packet to extend the line.
      armCharacterTurnWatchdog(260, 220);
    }
  };
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
  scene.dataset.audioChunks = String(Number(scene.dataset.audioChunks || 0) + 1);
  state.duplexAudioQueue = state.duplexAudioQueue.then(() => enqueueDuplexPcm(audio)).catch(() => {});
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
  if (!state.duplexValidatedText || !reply || !state.duplexSpeaking || state.userTranscriptPending) return false;
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
  state.duplexAcceptAudio = false;
  await state.duplexAudioQueue;
  finishDuplexTurnWhenAudioEnds();
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
  const text = String(value || '').trim();
  if (!text) return false;
  return /^\(/.test(text)
    || /\b(wait,?\s+no|the learner said|the rule|the instruction|let'?s check|should i|pre-a1|current goal|hidden reasoning)\b/i.test(text);
}

function asksForCompletedAction(value) {
  return state.actionDone && isActionRequestLine(value);
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
  if (state.actionDone && !state.speechDone) {
    const afterActionQuestions = {
      apple: 'Thank you. What is it?',
      milk: 'Yes. What did you find?',
      plate: 'Yes. What did you find?',
      cup: 'Yes. What did you touch?',
      spoon: 'Yes. What did you find?',
      ticket: 'Thank you. What can you say?',
      'gate-a12': 'Yes. What did you find?',
      'office-signin': 'Thank you. What can you say?',
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
  setTimeout(() => {
    state.suppressDuplexResponse = false;
    speak(reply, { after });
  }, 140);
}

function connectDuplexSession() {
  if (state.duplexReady) return Promise.resolve(true);
  if (state.duplexConnectPromise) return state.duplexConnectPromise;
  state.duplexConnectPromise = new Promise((resolve, reject) => {
    state.duplexConnectResolve = resolve;
    state.duplexConnectReject = reject;
  });
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  const socket = new WebSocket(`${scheme}://${location.host}/api/duplex`);
  state.duplexSocket = socket;
  socket.binaryType = 'arraybuffer';
  const connectionWatchdog = setTimeout(() => {
    if (state.duplexSocket !== socket || state.duplexReady) return;
    state.duplexConnectReject?.(new Error('duplex_connection_timeout'));
    state.duplexConnectReject = null;
    state.duplexConnectPromise = null;
    state.duplexSocket = null;
    try { socket.close(); } catch {}
    settleFailedDuplexTurn();
  }, 4200);
  socket.onopen = () => sendDuplex({
    type: 'start',
    taskId: currentTask().id,
    actionDone: state.actionDone,
    speechDone: state.speechDone,
    coveredGoals: [...state.coveredGoals],
    flowState: state.stage,
  });
  socket.onmessage = async (message) => {
    let event;
    try { event = JSON.parse(message.data); } catch { return; }
    scene.dataset.lastDuplexEvent = event.type || 'unknown';
    scene.dataset.lastDuplexEventAt = String(Date.now());
    if (event.type === 'session.created') {
      clearTimeout(connectionWatchdog);
      state.duplexReady = true;
      state.duplexConnectResolve?.(true);
      state.duplexConnectResolve = null;
      state.duplexConnectReject = null;
      if (state.sceneStarted && state.stage === 'active' && state.awaitingPrompt && !state.characterPromptDelivered) {
        clearTimeout(state.promptTimer);
        state.promptTimer = null;
        speak(currentTask().prompt);
      }
      return;
    }
    if (event.type === 'input_audio_buffer.speech_started') {
      if (isConversationPlaybackActive() && Date.now() - state.lastBargeInEnergyAt >= 900) return;
      state.lastServerSpeechAt = Date.now();
      state.pendingServerTurnContext = captureUserTurnContext();
      if (!beginLocalSpeechTurn({ contextOverride: state.pendingServerTurnContext }) && state.voicePhase !== 'recording') return;
      setTurnPhase(TURN_PHASE.LISTENING, '正在听你说', 'is-listening');
      return;
    }
    if (event.type === 'conversation.item.input_audio_transcription.started') {
      if (!acceptTranscriptEvent(event, { allowStart: true })) return;
      clearUserTurn();
      armVoiceTurnWatchdog();
      state.transcriptionStartedAt = Date.now();
      state.suppressDuplexResponse = false;
      state.userTranscriptPending = true;
      if (!state.duplexTranscript) state.duplexTranscript = '';
      if (!Number.isInteger(state.streamingUserIndex) || !state.dialogueHistory[state.streamingUserIndex]) {
        state.streamingUserIndex = null;
      }
      if (state.streamingUserIndex === null) state.streamingUserIndex = addDialogueMessage('user', '…');
      setTurnPhase(TURN_PHASE.LISTENING, '正在听你说', 'is-listening');
      return;
    }
    if (event.type === 'conversation.item.input_audio_transcription.delta'
      || event.type === 'conversation.item.input_audio_transcription.result') {
      if (!acceptTranscriptEvent(event)) return;
      const text = extractDuplexText(event);
      if (!text) return;
      clearIdleNudge();
      markUserTurnActive();
      state.idleNudgeCount = 0;
      // Seeduplex transcription updates are cumulative hypotheses even when
      // the event is named `delta`. Always replace the same bubble with the
      // newest hypothesis; appending creates duplicated/tripled captions when
      // punctuation or casing changes between updates.
      state.duplexTranscript = transcriptForActiveTurn(text);
      updateUserDialogue(state.duplexTranscript);
      armVoiceTurnWatchdog();
      return;
    }
    if (event.type === 'conversation.item.input_audio_transcription.completed') {
      if (!acceptTranscriptEvent(event)) return;
      clearUserTurn();
      const transcript = (extractDuplexText(event) || state.duplexTranscript).trim();
      const passiveTurn = Boolean(state.activeVoiceTurn?.passive);
      const turnContext = state.activeVoiceTurn?.context || state.userTurnContext || captureUserTurnContext();
      const transcriptIndex = state.streamingUserIndex;
      finalizeLearnerTranscript(transcript, { passiveTurn, turnContext, transcriptIndex });
      return;
    }
    if (event.type === 'conversation.item.input_audio_transcription.failed') {
      if (!acceptTranscriptEvent(event)) return;
      const transcriptIndex = state.streamingUserIndex;
      finalizeLearnerTranscript('', { transcriptIndex });
      showToast('这次没听清，请继续说', 2200);
      return;
    }
    if (event.type === 'response.output_text.delta') {
      if (!acceptResponseEvent(event)) return;
      if (state.suppressDuplexResponse) return;
      if (!state.duplexResponseText) {
        state.duplexValidatedText = false;
        state.duplexPendingSubtitle = '';
      }
      state.duplexResponseText += extractDuplexText(event);
      if (looksLikeReasoningLeak(state.duplexResponseText)) {
        discardReasoningLeak();
        return;
      }
      return;
    }
    if (event.type === 'response.output_text.done') {
      if (!acceptResponseEvent(event)) return;
      const reply = (extractDuplexText(event) || state.duplexResponseText).trim();
      state.duplexResponseText = '';
      if (state.suppressDuplexResponse) return;
      if (looksLikeReasoningLeak(reply)) {
        discardReasoningLeak();
        return;
      }
      if (asksForCompletedAction(reply)) {
        discardReasoningLeak(safeCharacterReply());
        return;
      }
      const replacement = transitionReplyReplacement(reply);
      if (replacement) {
        discardReasoningLeak(replacement);
        return;
      }
      if (reply) {
        state.duplexValidatedText = true;
        state.duplexPendingSubtitle = reply;
        publishDuplexSubtitle();
      }
      else state.streamingLumaIndex = null;
      return;
    }
    if (event.type === 'response.output_audio.started') {
      if (!acceptResponseEvent(event)) return;
      if (state.suppressDuplexResponse) return;
      if (state.expectedResponse) state.expectedResponse.audioStarted = true;
      if (state.userTranscriptPending && state.duplexTranscript.trim() && state.activeVoiceTurn) {
        scene.dataset.voiceRecovery = 'response-started';
        finalizeLearnerTranscript(state.duplexTranscript, {
          passiveTurn: Boolean(state.activeVoiceTurn.passive),
          turnContext: state.activeVoiceTurn.context || state.userTurnContext || captureUserTurnContext(),
          transcriptIndex: state.streamingUserIndex,
        });
      }
      clearIdleNudge();
      clearReplyTimeout();
      clearTimeout(state.promptTimer);
      state.promptTimer = null;
      if (isConversationPlaybackActive()) {
        clearTimeout(state.duplexFinishTimer);
        state.duplexFinishTimer = null;
      } else stopDuplexPlayback({ cancel: false });
      state.duplexSpeaking = true;
      setVoicePhase('character');
      state.lumaStartedAt = Date.now();
      state.lastDuplexAudioAt = state.lumaStartedAt;
      armCharacterTurnWatchdog(2500);
      state.duplexOutputDone = false;
      state.duplexAcceptAudio = true;
      state.duplexPendingAudio = [];
      state.duplexSubtitleReady = false;
      state.duplexResponseIsPrompt = state.awaitingPrompt;
      clearTimeout(state.duplexAudioGateTimer);
      state.duplexAudioGateTimer = null;
      state.awaitingPrompt = false;
      setTurnPhase(TURN_PHASE.CHARACTER_SPEAKING, `${currentTask().speaker || 'Luma'} 正在说 · 可以直接开口`, 'is-speaking');
      if (state.sceneStarted && !state.handsFreeListening && !state.micMuted) startHandsFreeListening().catch(() => {});
      return;
    }
    if (event.type === 'response.output_audio.delta') {
      if (!acceptResponseEvent(event)) return;
      if (!state.duplexAcceptAudio) return;
      const audio = event.audio || event.delta || '';
      if (audio) {
        state.lastDuplexAudioAt = Date.now();
        armCharacterTurnWatchdog();
      }
      if (audio && !state.duplexSubtitleReady) publishDuplexSubtitle();
      if (state.duplexSubtitleReady) queueDuplexAudio(audio);
      else if (audio) state.duplexPendingAudio.push(audio);
      return;
    }
    if (event.type === 'response.output_audio.done') {
      if (!acceptResponseEvent(event)) return;
      if (!state.duplexAcceptAudio) return;
      clearCharacterTurnWatchdog();
      state.duplexOutputDone = true;
      if (!state.duplexSubtitleReady) {
        if (state.userTranscriptPending) return;
        clearTimeout(state.duplexAudioGateTimer);
        state.duplexAudioGateTimer = setTimeout(() => {
          state.duplexAudioGateTimer = null;
          if (!state.duplexSubtitleReady) discardReasoningLeak(state.duplexResponseIsPrompt ? currentTask().prompt : '');
        }, 1600);
        return;
      }
      finishDuplexAudioOutput();
      return;
    }
    if (event.type === 'response.done') {
      // This provider event has no response or question id, so it cannot be
      // safely assigned after a cancellation. Audio done and the local audio
      // watchdog are the authoritative end-of-turn signals.
      return;
    }
    if (event.type === 'response.canceled') {
      return;
    }
    if (event.type === 'error' || event.type === 'local.error' || event.type === 'local.closed') {
      clearTimeout(connectionWatchdog);
      state.duplexReady = false;
      state.duplexConnectReject?.(new Error(event.message || 'duplex_unavailable'));
      state.duplexConnectReject = null;
      state.duplexConnectPromise = null;
      if (state.duplexSocket === socket) state.duplexSocket = null;
      try { socket.close(); } catch {}
      settleFailedDuplexTurn();
      if (event.type !== 'local.closed') showToast('语音正在自动重连', 2600);
    }
  };
  socket.onerror = () => {
    if (state.duplexSocket !== socket) return;
    clearTimeout(connectionWatchdog);
    state.duplexReady = false;
    state.duplexConnectReject?.(new Error('duplex_socket_error'));
    state.duplexConnectPromise = null;
    settleFailedDuplexTurn();
  };
  socket.onclose = () => {
    if (state.duplexSocket !== socket) return;
    clearTimeout(connectionWatchdog);
    state.duplexReady = false;
    state.duplexSocket = null;
    state.duplexConnectPromise = null;
    settleFailedDuplexTurn();
  };
  return state.duplexConnectPromise;
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
  });
}

function closeDuplexSession() {
  if (state.duplexSocket?.readyState === WebSocket.OPEN) sendDuplex({ type: 'close' });
  try { state.duplexSocket?.close(); } catch {}
  state.duplexSocket = null;
  state.duplexReady = false;
  state.duplexConnectPromise = null;
  stopDuplexPlayback({ cancel: false });
  setVoicePhase('idle');
}

function stopSpeechPlayback() {
  clearReplyTimeout();
  stopDuplexPlayback();
  state.awaitingPrompt = false;
  state.awaitingModelReply = false;
  clearUserTurn();
}

async function speak(text, { after, prompt = true } = {}) {
  const cleanText = String(text || '').trim();
  if (!cleanText) {
    state.awaitingPrompt = false;
    after?.();
    return;
  }
  claimExclusiveVoiceSession();
  unlockDuplexPlayback();
  stopSpeechPlayback();
  setVoicePhase('character');
  if (state.sceneStarted && state.stage === 'active') state.awaitingPrompt = Boolean(prompt);
  if (!state.duplexReady) {
    try {
      await Promise.race([
        connectDuplexSession(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('duplex_timeout')), 2200)),
      ]);
    } catch {}
  }
  if (state.duplexReady) {
    state.duplexAfter = after || null;
    // This endpoint returns the requested character line as audio only. Put
    // the known subtitle on screen first, then let the audio gate release.
    state.duplexResponseText = '';
    state.duplexPendingSubtitle = cleanText;
    state.duplexValidatedText = true;
    beginExpectedResponse('say');
    if (state.sceneStarted) setMode(`${currentTask().speaker || 'Luma'} 正在回应`, 'is-speaking');
    sendDuplex({ type: 'say', text: cleanText });
    return true;
  }
  state.awaitingPrompt = false;
  setVoicePhase('listening');
  openLearnerTurn();
  showToast('这句话没有播放，点左下角重听', 3000);
  after?.();
  return false;
}

function emphasizeCurrentAction() {
  const task = currentTask();
  if (!taskNeedsAction(task) || state.actionDone) return;
  if (task.id === 'apple') apple.classList.add('is-emphasized');
  else hotspots.find((hotspot) => hotspot.dataset.object === task.id)?.classList.add('is-emphasized');
  syncTaskFocus();
}

function characterHintLine(level = 1) {
  const task = currentTask();
  if (taskNeedsAction(task) && !state.actionDone && (level === 1 || state.speechDone)) return task.actionPrompt || task.prompt;
  if (task.question && state.actionDone && !state.speechDone && level === 1) return task.question;
  const support = speechSupportForTask(task);
  if (level === 1) return 'One word is okay.';
  if (level === 2) return `You can start: ${support.starter}`;
  return `You can say: ${support.model}`;
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
  const namingApple = task.id === 'apple' && state.actionDone;
  const support = {
    apple: namingApple
      ? { meaning: '她在问这个东西是什么。', starter: "It's an …", model: "It's an apple." }
      : { meaning: '她想让你把苹果递给她，可以边递边回应。', starter: 'Here …', model: 'Here you are.' },
    milk: { meaning: '告诉她你找到了牛奶。', starter: 'I found …', model: 'I found the milk.' },
    plate: { meaning: '告诉她盘子在哪里。', starter: 'The plate is …', model: 'The plate is on the table.' },
    cup: { meaning: '告诉她你碰到的是杯子。', starter: 'I touched …', model: 'I touched the cup.' },
    spoon: { meaning: '告诉她你找到了勺子。', starter: 'I found …', model: 'I found the spoon.' },
    bag: { meaning: '她在确认这是不是你的包。', starter: 'Yes, it … / No, it …', model: 'Yes, it is.' },
    'office-purpose': { meaning: '前台在问你来见谁。', starter: "I'm here to see …", model: "I'm here to see Maya." },
    'office-greeting': { meaning: 'Maya 在和你打招呼。', starter: 'Nice to …', model: 'Nice to meet you too.' },
  }[task.id];
  return support || {
    meaning: '先表达你听懂的核心意思，不必一次说得很完整。',
    starter: task.answer ? `${task.answer} …` : 'Yes …',
    model: task.natural?.[0] || 'Okay.',
  };
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
  let quietSince = 0;
  const deliverWhenQuiet = () => {
    if (state.stage !== 'active' || currentTask().id !== taskId || !state.awaitingPrompt) {
      state.promptTimer = null;
      return;
    }
    if (scheduledCharacterLineBlocked()) {
      quietSince = 0;
      state.promptTimer = setTimeout(deliverWhenQuiet, 180);
      return;
    }
    if (!quietSince) quietSince = Date.now();
    const dwell = DialogueRules.transitionDwell(latestCharacterText(), { normal: 520, afterQuestion: 12000 });
    const remaining = dwell - (Date.now() - quietSince);
    if (remaining > 0) {
      state.promptTimer = setTimeout(deliverWhenQuiet, Math.min(180, remaining));
      return;
    }
    state.promptTimer = null;
    speak(currentTask().prompt);
  };
  state.promptTimer = setTimeout(deliverWhenQuiet, initialDelay);
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

function startScene({ subtitlesHidden = false } = {}) {
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
      ticket: 'Thank you. What can you say?',
      'gate-a12': 'Yes. What did you find?',
      'office-signin': 'Thank you. What can you say?',
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
  const original = representativeLearnerUtterance();
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
  if (!clean || !state.sceneStarted) return;
  if (isDuplexPlaybackActive()) stopDuplexPlayback({ cancel: true });
  else if (isConversationPlaybackActive()) stopSpeechPlayback();
  const turnContext = state.userTurnContext || captureUserTurnContext();
  state.pendingUserIndex = addDialogueMessage('user', clean);
  state.awaitingModelReply = true;
  state.suppressDuplexResponse = false;
  setTurnPhase(TURN_PHASE.CHARACTER_SPEAKING, `${currentTask().speaker || 'Luma'} 正在回应 · 仍可继续说`);
  if (state.stage === 'active') requestLanguageFeedback(turnContext.question, clean, turnContext);
  state.userTurnContext = null;
  if (state.duplexReady) {
    beginExpectedResponse('text');
    armReplyTimeout();
    sendDuplex({ type: 'user.text', text: clean });
  }
  else {
    state.awaitingModelReply = false;
    showToast('实时语音暂时未连接，已先判断你的表达');
  }
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
  if (state.audioProcessor) state.audioProcessor.onaudioprocess = null;
  try { state.audioSource?.disconnect(); } catch {}
  try { state.audioProcessor?.disconnect(); } catch {}
  try { state.audioSink?.disconnect(); } catch {}
  state.audioSource = null;
  state.audioProcessor = null;
  state.audioSink = null;
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
  clearIdleNudge();
  state.handsFreeListening = false;
  state.micStarting = false;
  disconnectAudioCapture();
  releaseMicrophoneStream();
  setVoicePhase('idle');
  cleanupSpeechCaptureUi();
}

function convertToPcm16(input, inputRate, outputRate = 16000) {
  const ratio = inputRate / outputRate;
  const length = Math.max(1, Math.round(input.length / ratio));
  const pcm = new Int16Array(length);
  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(input.length, Math.floor((index + 1) * ratio));
    let sum = 0;
    for (let sample = start; sample < end; sample += 1) sum += input[sample];
    const value = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    pcm[index] = value < 0 ? value * 0x8000 : value * 0x7fff;
  }
  return pcm;
}

async function getMicrophoneStream() {
  const activeTrack = state.mediaStream?.getAudioTracks()[0];
  if (activeTrack?.readyState === 'live' && activeTrack.enabled && !activeTrack.muted) return state.mediaStream;
  releaseMicrophoneStream();
  state.mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  return state.mediaStream;
}

async function startHandsFreeListening() {
  if (!state.sceneStarted || state.handsFreeListening || state.micStarting) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
    state.micMuted = true;
    micButton.disabled = true;
    micButton.setAttribute('aria-label', '当前浏览器不支持实时语音');
    micLabel.textContent = '不可用';
    showToast('当前浏览器不支持实时语音，请用支持麦克风的浏览器打开');
    return;
  }
  claimExclusiveVoiceSession();
  state.micStarting = true;
  state.micMuted = false;
  micButton.disabled = true;
  micLabel.textContent = '连接中';
  try {
    connectDuplexSession().catch(() => {});
    const stream = await getMicrophoneStream();
    if (!state.sceneStarted) return;
    const microphoneTrack = stream.getAudioTracks()[0];
    if (microphoneTrack) {
      const recoverLostMicrophone = () => {
        if (!state.sceneStarted || state.micMuted || state.mediaStream !== stream || document.visibilityState !== 'visible') return;
        state.handsFreeListening = false;
        disconnectAudioCapture();
        releaseMicrophoneStream(stream);
        cleanupSpeechCaptureUi();
        setMode('麦克风正在自动恢复');
        setTimeout(ensureSceneVoiceIsOpen, 350);
      };
      microphoneTrack.onended = recoverLostMicrophone;
      microphoneTrack.onmute = recoverLostMicrophone;
      scene.dataset.micTrackState = microphoneTrack.readyState;
      scene.dataset.micTrackMuted = String(microphoneTrack.muted);
      scene.dataset.micTrackEnabled = String(microphoneTrack.enabled);
    }
    disconnectAudioCapture();
    state.audioContext ||= new AudioContext();
    await state.audioContext.resume();
    state.captureSampleRate = state.audioContext.sampleRate;
    state.audioSource = state.audioContext.createMediaStreamSource(stream);
    state.audioProcessor = state.audioContext.createScriptProcessor(2048, 1, 1);
    state.audioSink = state.audioContext.createGain();
    state.audioSink.gain.value = 0;
    state.handsFreeListening = true;
    state.micCalibrationUntil = Date.now() + 700;
    state.lastMicFrameAt = Date.now();
    state.audioProcessor.onaudioprocess = (audioEvent) => {
      if (!sceneVoiceIsOpen()) return;
      state.lastMicFrameAt = Date.now();
      const input = audioEvent.inputBuffer.getChannelData(0);
      const characterCanHear = isConversationPlaybackActive()
        && Date.now() - state.lumaStartedAt > BARGE_IN_GUARD_MS;
      let energy = 0;
      for (let index = 0; index < input.length; index += 1) energy += input[index] * input[index];
      const rms = Math.sqrt(energy / Math.max(1, input.length));
      const calibrating = Date.now() < state.micCalibrationUntil;
      if (!characterCanHear && rms < .04) {
        const noiseBlend = calibrating ? .18 : state.activeVoiceTurn ? .004 : .018;
        state.micNoiseFloor = state.micNoiseFloor * (1 - noiseBlend) + rms * noiseBlend;
      }
      const voiceThreshold = Math.min(.026, Math.max(.006, state.micNoiseFloor * 2.25));
      scene.dataset.micRms = rms.toFixed(4);
      scene.dataset.micThreshold = voiceThreshold.toFixed(4);
      scene.dataset.micFrames = String(Number(scene.dataset.micFrames || 0) + 1);
      if (calibrating) {
        state.voiceFrameStreak = 0;
      } else if (rms > voiceThreshold) {
        const onsetThreshold = characterCanHear ? Math.max(.012, voiceThreshold * 1.7) : voiceThreshold * 1.05;
        state.voiceFrameStreak = rms > onsetThreshold ? state.voiceFrameStreak + 1 : 0;
        if (rms > onsetThreshold && (!characterCanHear || state.voiceFrameStreak >= 2)) {
          state.lastVoiceEnergyAt = Date.now();
          scene.dataset.lastVoiceAt = String(state.lastVoiceEnergyAt);
          if (characterCanHear) state.lastBargeInEnergyAt = state.lastVoiceEnergyAt;
        }
        if (state.voiceFrameStreak >= 2) beginLocalSpeechTurn();
      } else {
        state.voiceFrameStreak = 0;
      }
      const pcm = convertToPcm16(input, state.captureSampleRate);
      if (state.duplexReady
        && state.duplexSocket?.readyState === WebSocket.OPEN) {
        state.duplexSocket.send(pcm.buffer);
        scene.dataset.micPackets = String(Number(scene.dataset.micPackets || 0) + 1);
      }
    };
    state.audioSource.connect(state.audioProcessor);
    state.audioProcessor.connect(state.audioSink);
    state.audioSink.connect(state.audioContext.destination);
    micButton.classList.add('is-live');
    micButton.classList.remove('is-muted', 'is-held');
    micButton.setAttribute('aria-pressed', 'true');
    micButton.setAttribute('aria-label', '关闭麦克风');
    micLabel.textContent = state.voicePhase === 'recording' ? '正在听' : '随时说';
    if (!isDuplexPlaybackActive()) {
      openLearnerTurn();
      setMode('轮到你 · 可以开口');
    }
  } catch (error) {
    state.handsFreeListening = false;
    state.micMuted = true;
    disconnectAudioCapture();
    micButton.classList.remove('is-live');
    micButton.classList.add('is-muted');
    micButton.setAttribute('aria-pressed', 'false');
    micButton.setAttribute('aria-label', '重试语音识别');
    micLabel.textContent = '重试语音';
    showToast(error?.name === 'NotAllowedError' ? '允许一次麦克风权限后即可免按对话' : '麦克风暂时不可用，点麦克风重试', 3200);
  } finally {
    state.micStarting = false;
    micButton.disabled = false;
  }
}

function pauseHandsFreeListening() {
  if (!state.handsFreeListening) return;
  state.handsFreeListening = false;
  state.micMuted = true;
  setVoicePhase('idle');
  disconnectAudioCapture();
  releaseMicrophoneStream();
  micButton.classList.remove('is-live');
  micButton.classList.add('is-muted');
  micButton.setAttribute('aria-pressed', 'false');
  micButton.setAttribute('aria-label', '继续语音识别');
  micLabel.textContent = '继续语音';
  setMode('麦克风已静音');
  showToast('已静音，点一下麦克风可继续对话');
}

function toggleHandsFreeListening(event) {
  event?.preventDefault?.();
  if (state.stage === 'complete') {
    if (isConversationTurnPending()) showToast('等人物把这一句说完，就会自然结束');
    else scheduleReview();
    return;
  }
  if (state.handsFreeListening) pauseHandsFreeListening();
  else startHandsFreeListening();
}

function showHint() {
  if (!state.sceneStarted) return;
  const task = currentTask();
  if (['complete', 'task-complete'].includes(state.stage)) {
    return;
  }
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

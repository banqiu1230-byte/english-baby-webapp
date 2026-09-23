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
const objectLayer = document.querySelector('.object-layer');
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
const coffeeMissionBoard = document.querySelector('#coffeeMissionBoard');
const coffeeMissionButtons = [...document.querySelectorAll('[data-coffee-mission]')];
const coffeeMissionProgressLabel = document.querySelector('#coffeeMissionProgress');
const coffeeMissionBrief = document.querySelector('#coffeeMissionBrief');
const missionHud = document.querySelector('#missionHud');
const missionHudCode = document.querySelector('#missionHudCode');
const missionHudTitle = document.querySelector('#missionHudTitle');
const missionHudProgress = document.querySelector('#missionHudProgress');
const orderSlots = document.querySelector('#orderSlots');
const missionResult = document.querySelector('#missionResult');
const missionResultTags = document.querySelector('#missionResultTags');
const transcriptLedger = new VoiceRuntime.TranscriptLedger();
// A character line may outlast the normal reconnect buffer. Audio stays only
// in memory; explicit mute/exit/reset still discards it.
const microphoneBuffer = new VoiceRuntime.PcmBuffer(16000 * 2 * 60);
const CHARACTER_AUDIO_QUIET_MS = 8000;
const CHARACTER_CLOCK_STALL_MS = 8000;
const CHARACTER_TURN_MAX_MS = 30000;

let sheetTrigger = null;
let sheetSelection = null;
let profileReturnView = 'home';
const viewScrollPositions = new Map();
let appToastTimer = null;
const preferences = { speechRate: '慢速', rescue: '按需显示' };

function loadDeferredImages(root) {
  root?.querySelectorAll?.('img[data-src]').forEach((image) => {
    if (!image.src) image.src = image.dataset.src;
    image.removeAttribute('data-src');
  });
}
try {
  preferences.speechRate = localStorage.getItem('luma-speech-rate') || preferences.speechRate;
  preferences.rescue = localStorage.getItem('luma-rescue') || preferences.rescue;
} catch { /* Practice remains usable when the browser denies storage. */ }

const COFFEE_MISSION_PROGRESS_KEY = 'luma-coffee-quest-v1';
const COFFEE_MISSION_UI = Object.freeze({
  C01: { title: '第一次自己点咖啡', brief: '这一关会给你足够帮助。说一个词也能继续，最后再试着连起来。', mode: 'guided' },
  C02: { title: '替朋友点对那一杯', brief: '朋友要一杯小杯拿铁，带走。缺什么，Mia 才会继续问什么。', mode: 'guided' },
  C03: { title: '发现错单，马上修正', brief: '你点了小杯，拿到的却是大杯。说清哪里不对，让 Mia 换回来。', mode: 'repair' },
  C04: { title: '独立挑战', brief: '这次默认不显示字幕，也不给完整答案。听不清仍可以主动请求重复。', mode: 'challenge' },
});

function loadCoffeeMissionProgress() {
  try {
    const parsed = JSON.parse(localStorage.getItem(COFFEE_MISSION_PROGRESS_KEY) || '{}');
    return {
      completed: [...new Set((Array.isArray(parsed.completed) ? parsed.completed : []).filter(id => COFFEE_MISSION_UI[id]))],
      selected: COFFEE_MISSION_UI[parsed.selected] ? parsed.selected : 'C01',
      runs: Number.isFinite(parsed.runs) ? Math.max(0, parsed.runs) : 0,
    };
  } catch { return { completed: [], selected: 'C01', runs: 0 }; }
}

const coffeeMissionProgress = loadCoffeeMissionProgress();

const SCENES = {
  kitchen: {
    image: './assets/breakfast/table.webp',
    previewImage: './assets/optimized/breakfast-preview-860.jpg',
    badge: '可进入',
    eyebrow: 'HOME · MORNING',
    title: '帮 Luma 准备早餐',
    description: '和 Luma 一起准备早餐：说出饮料选择，回应她的请求，再告诉她要多少。你的话会直接改变接下来发生的事。',
    people: [['user', 'Luma'], ['clock', '3–5 分钟'], ['sparkle', '3 个生活片段']],
    goal: 'milk or water · here · more · enough',
    available: true,
  },
  airport: {
    image: './assets/scenes/airport-gate.png',
    previewImage: './assets/optimized/airport-preview-860.jpg',
    badge: '可进入',
    eyebrow: 'AIRPORT · DEPARTURE',
    title: '找到正确的登机口',
    description: '用一句简单回应给工作人员看登机牌，再说出自己的行李和 A12 登机口。每一步都由开口推进。',
    people: [['users-three', '2 位角色'], ['clock', '4 分钟'], ['airplane-tilt', '3 个任务']],
    goal: 'ticket · bag · gate A12',
    available: true,
  },
  coffee: {
    image: './assets/coffee/order.webp', previewImage: './assets/optimized/coffee-home-720.jpg', badge: '4 个任务', eyebrow: 'CAFÉ · FIRST QUEST',
    title: '从一杯咖啡开始',
    description: '先在帮助下点好一杯，再替朋友转述、修正错单，最后不看字幕独立完成。你说出的每个信息都会留在订单和画面里。',
    people: [['coffee', '店员 Mia'], ['clock', '每关 3–5 分钟'], ['flag', '4 个递进任务']],
    goal: '点单 · 转述 · 修正 · 独立挑战', available: true,
  },
  street: {
    image: './assets/scenes/street-market.png',
    previewImage: './assets/optimized/street-thumb-220.jpg',
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
    previewImage: './assets/optimized/office-preview-860.jpg',
    badge: '可进入',
    eyebrow: 'WORK · RECEPTION',
    title: '第一次拜访新同事',
    description: '先向前台说明来意和姓名，听懂等候安排，再自然地和新同事打招呼。每一步都由对话推进。',
    people: [['users-three', '2 位角色'], ['clock', '4 分钟'], ['sparkle', '4 个片段']],
    goal: 'I’m here to see · my name is · please wait · nice to meet you',
    available: true,
  },
};

const KITCHEN_TASKS = Breakfast.tasks;

const AIRPORT_TASKS = [
  { id: 'ticket', interaction: 'speech', requiresAction: false, prompt: 'May I see your ticket?', hint: '直接说 Here you are；不用点击登机牌。' },
  { id: 'bag', interaction: 'speech', requiresAction: false, prompt: 'Is this your bag?', hint: '直接回答 Luma，不需要点击行李箱。' },
  { id: 'gate-a12', interaction: 'speech', requiresAction: false, prompt: 'Which gate are you going to?', hint: '说 A12 就可以；不用在画面里找按钮。' },
];

const OFFICE_TASKS = [
  { id: 'office-purpose', interaction: 'speech', requiresAction: false, speaker: '前台', prompt: 'Who are you here to see?', hint: '告诉前台你来见谁；不需要照着固定句子说。' },
  { id: 'office-signin', interaction: 'speech', requiresAction: false, speaker: '前台', prompt: 'What is your name, please?', hint: '告诉前台你的名字，例如 My name is Li。' },
  { id: 'office-wait', interaction: 'none', requiresAction: false, requiresSpeech: false, autoAdvance: true, speaker: '前台', prompt: 'You can wait here for Maya.', hint: '这一句只需要听懂，情境会自己继续。' },
  { id: 'office-greeting', interaction: 'speech', requiresAction: false, speaker: 'Maya', prompt: "Hi, I'm Maya. Nice to meet you.", hint: '自然回应 Maya 的问候即可，不设唯一答案。' },
];

const SCENE_CONFIGS = {
  coffee: {
    source: { width: 1024, height: 1792 }, image: SCENES.coffee.image, tasks: Coffee.tasks,
    mouth: { x: 520, y: 460, width: 18, height: 8 }, anchors: {},
  },
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

// Let the learner absorb a complete acknowledgment before the next prompt.
// This quiet period starts only after the current voice turn has settled.
const TASK_ADVANCE_DWELL_MS = 1600;
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
  coffee: Coffee.initial(),
  coffeeMissionId: 'C01',
  coffeeVariantId: null,
  coffeeMissionAttempt: 0,
  breakfastHelp: false,
  breakfastCupSelected: false,
  hintLevel: 0,
  currentSpeech: 'Can you give me the apple?',
  activeQuestion: 'Can you give me the apple?',
  dragging: false,
  handsFreeListening: false,
  micMuted: false,
  micStarting: false,
  micFailure: null,
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
  deferredVoiceEvents: [],
  audioWorkletLoaded: false,
  captionAudioStart: 0,
  lastCharacterEndedAt: 0,
  pendingFeedback: new Set(),
  captureSampleRate: 16000,
  duplexSocket: null,
  duplexReady: false,
  duplexFailureCount: 0,
  voiceConnectionPaused: false,
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
  duplexClockTime: 0,
  duplexClockAdvancedAt: 0,
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
  pendingTransitionUtterance: null,
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
  conversationFocus: 'task',
  lastFinalizedUser: null,
  ignoredTranscriptItems: new Set(),
  courtesyTimer: null,
  pointerId: null,
  initialApple: { x: 0, y: 0 },
  hand: { x: 0, y: 0 },
  scale: 1,
  toastTimer: null,
  completed: false,
};
state.coffeeMissionId = coffeeMissionProgress.selected;

function coffeeMissionMeta(id = state.coffeeMissionId) {
  const engineMission = typeof Coffee.getMission === 'function' ? Coffee.getMission(id) : null;
  return { id, ...(COFFEE_MISSION_UI[id] || COFFEE_MISSION_UI.C01), ...(engineMission || {}) };
}

function coffeeMissionIsUnlocked(id) {
  const ids = Object.keys(COFFEE_MISSION_UI);
  const index = ids.indexOf(id);
  return index <= 0 || ids.slice(0, index).every(previous => coffeeMissionProgress.completed.includes(previous));
}

function saveCoffeeMissionProgress() {
  coffeeMissionProgress.selected = state.coffeeMissionId;
  try { localStorage.setItem(COFFEE_MISSION_PROGRESS_KEY, JSON.stringify(coffeeMissionProgress)); } catch {}
}

function syncOuterQuestUi() {
  const ids = Object.keys(COFFEE_MISSION_UI);
  const completed = new Set(coffeeMissionProgress.completed);
  const checkpoint = globalThis.LumaExperience?.store?.getCheckpoint?.({ sceneId: 'coffee' });
  const activeMissionId = checkpoint?.sceneId === 'coffee' && COFFEE_MISSION_UI[checkpoint.missionId]
    ? checkpoint.missionId : null;
  const nextId = activeMissionId || ids.find(id => !completed.has(id)) || 'C04';
  const nextIndex = ids.indexOf(nextId);

  document.querySelectorAll('[data-adventure-mission]').forEach((node) => {
    const id = node.dataset.adventureMission;
    const isComplete = completed.has(id) && id !== activeMissionId;
    const isCurrent = id === nextId;
    node.classList.toggle('is-complete', isComplete);
    node.classList.toggle('is-current', isCurrent);
    node.classList.toggle('is-upcoming', !isComplete && !isCurrent);
    const status = node.querySelector('em');
    if (status) status.textContent = isComplete ? '已完成' : isCurrent ? '现在' : '接下来';
  });
  const adventureRoute = document.querySelector('#adventureRoute');
  if (adventureRoute) adventureRoute.dataset.nextIndex = String(nextIndex);

  const worldMapTitle = document.querySelector('#worldMapTitle');
  if (worldMapTitle) worldMapTitle.textContent = '街角咖啡店';
  const worldMapStateLabel = document.querySelector('#worldMapStateLabel');
  if (worldMapStateLabel) worldMapStateLabel.textContent = completed.size === ids.length ? '旅程完成' : '当前旅程';
  const worldMapHeaderProgress = document.querySelector('#worldMapHeaderProgress');
  if (worldMapHeaderProgress) worldMapHeaderProgress.textContent = `${completed.size}/${ids.length}`;
  const progressPercent = Math.round((completed.size / ids.length) * 100);
  const nextMission = COFFEE_MISSION_UI[nextId] || COFFEE_MISSION_UI.C04;
  const worldJourneyCard = document.querySelector('#worldJourneyCard');
  const worldJourneyProgress = document.querySelector('#worldJourneyProgress');
  const worldJourneyMissionCode = document.querySelector('#worldJourneyMissionCode');
  const worldJourneyMissionStatus = document.querySelector('#worldJourneyMissionStatus');
  const worldJourneyMissionTitle = document.querySelector('#worldJourneyMissionTitle');
  const worldJourneyProgressBar = document.querySelector('#worldJourneyProgressBar');
  const nextMissionStatus = completed.size === ids.length
    ? '旅程完成 · 可以重访'
    : activeMissionId === nextId ? '上次练到这里 · 从头再练' : nextId === 'C04' ? '独立挑战 · 可以开始' : '当前事件 · 可以开始';
  if (worldJourneyCard) {
    worldJourneyCard.dataset.worldMission = nextId;
    worldJourneyCard.setAttribute('aria-label', `查看当前旅程：${nextId} ${nextMission.title}，已完成 ${completed.size} / ${ids.length}`);
  }
  if (worldJourneyProgress) worldJourneyProgress.textContent = `${completed.size}/${ids.length}`;
  if (worldJourneyMissionCode) worldJourneyMissionCode.textContent = nextId;
  if (worldJourneyMissionStatus) worldJourneyMissionStatus.textContent = nextMissionStatus;
  if (worldJourneyMissionTitle) worldJourneyMissionTitle.textContent = nextMission.title;
  if (worldJourneyProgressBar) worldJourneyProgressBar.style.setProperty('--world-progress', `${progressPercent}%`);
  const coffeeMapNode = document.querySelector('[data-world-node="coffee"]');
  if (coffeeMapNode) {
    coffeeMapNode.classList.toggle('is-complete', completed.size === ids.length);
    coffeeMapNode.setAttribute('aria-label', `查看街角的第一杯，已完成 ${completed.size} / ${ids.length}`);
  }
}

function selectCoffeeMission(id, { persist = true } = {}) {
  if (!COFFEE_MISSION_UI[id] || !coffeeMissionIsUnlocked(id)) return false;
  state.coffeeMissionId = id;
  const variants = coffeeMissionMeta(id).variants || [];
  state.coffeeVariantId = id === 'C04' && variants.length ? variants[coffeeMissionProgress.runs % variants.length].id : null;
  if (persist) saveCoffeeMissionProgress();
  syncCoffeeMissionBoard();
  return true;
}

function syncCoffeeMissionBoard() {
  syncOuterQuestUi();
  if (!coffeeMissionBoard) return;
  const isCoffee = state.selectedScene === 'coffee';
  coffeeMissionBoard.hidden = !isCoffee;
  scene.classList.toggle('is-coffee-intro', isCoffee && !document.querySelector('#sceneIntro')?.hidden);
  if (!isCoffee) return;
  if (!coffeeMissionIsUnlocked(state.coffeeMissionId)) state.coffeeMissionId = 'C01';
  for (const button of coffeeMissionButtons) {
    const id = button.dataset.coffeeMission;
    const unlocked = coffeeMissionIsUnlocked(id);
    const complete = coffeeMissionProgress.completed.includes(id);
    const selected = state.coffeeMissionId === id;
    button.disabled = !unlocked;
    button.setAttribute('aria-disabled', String(!unlocked));
    button.setAttribute('aria-pressed', String(selected));
    button.querySelector('.mission-state').textContent = selected ? '本次' : complete ? '可重练' : unlocked ? '可开始' : '待解锁';
  }
  coffeeMissionProgressLabel.textContent = `${coffeeMissionProgress.completed.length} / 4`;
  const mission = coffeeMissionMeta();
  const variant = (mission.variants || []).find(item => item.id === state.coffeeVariantId) || (mission.variants || [])[0];
  const targetText = variant?.target ? ['size', 'drink', 'service'].map(slot => coffeeSlotLabel(slot, variant.target[slot])).join(' · ') : '';
  const explicit = state.introduction?.explicitMode && state.introduction.missionId === state.coffeeMissionId;
  const listening = explicit ? Boolean(state.introduction.subtitlesHidden) : state.coffeeMissionId === 'C04';
  coffeeMissionBrief.textContent = state.coffeeMissionId === 'C04' && targetText
    ? `点单参考：${targetText}，也可以按自己的喜好点单。${listening ? '这次先不看字幕，需要时随时打开。' : '这次保留字幕，需要时可以查看提示。'}`
    : `${mission.brief}${explicit && listening ? ' 这次先听声音，字幕和提示随时可打开。' : ''}`;
  const readyLabel = document.querySelector('#introReady span');
  if (readyLabel) readyLabel.textContent = listening ? '先听着试一次' : `开始任务 ${state.coffeeMissionId}`;
}

function coffeeOrderState(world = state.coffee) {
  return world?.order && typeof world.order === 'object' ? world.order : world || {};
}

function coffeeDeliveredState(world = state.coffee) {
  return world?.delivered && typeof world.delivered === 'object' ? world.delivered : coffeeOrderState(world);
}

function coffeeTargetState(world = state.coffee) {
  return world?.target && typeof world.target === 'object' ? world.target : null;
}

function coffeeSlotLabel(slot, value) {
  const labels = {
    drink: { latte: '拿铁', americano: '美式' },
    size: { small: '小杯', large: '大杯' },
    service: { here: '堂食', 'to-go': '带走' },
  };
  const empty = { drink: '饮品', size: '杯型', service: '方式' };
  return labels[slot]?.[value] || empty[slot];
}

function syncCoffeeMissionHud() {
  const isCoffee = state.selectedScene === 'coffee' && state.sceneStarted;
  missionHud.hidden = !isCoffee;
  orderSlots.hidden = !isCoffee;
  if (!isCoffee) return;
  const mission = coffeeMissionMeta();
  const tasks = currentSceneConfig().tasks;
  missionHudCode.textContent = `任务 ${state.coffeeMissionId}`;
  missionHudTitle.textContent = mission.title;
  missionHudProgress.textContent = `${Math.min(state.taskIndex + 1, tasks.length)} / ${tasks.length}`;
  orderSlots.setAttribute('aria-label', state.coffeeMissionId === 'C03' ? '实际收到的咖啡' : '你的点单');
  const order = coffeeOrderState();
  const delivered = coffeeDeliveredState();
  for (const element of orderSlots.querySelectorAll('[data-order-slot]')) {
    const slot = element.dataset.orderSlot;
    const value = state.coffeeMissionId === 'C03' ? delivered[slot] : order[slot];
    element.textContent = coffeeSlotLabel(slot, value);
    element.classList.toggle('is-filled', Boolean(value));
    element.classList.toggle('is-wrong', state.coffeeMissionId === 'C03' && Boolean(value && value !== order[slot]));
  }
}

function markCoffeeMissionCompleted() {
  if (state.selectedScene !== 'coffee' || !COFFEE_MISSION_UI[state.coffeeMissionId]) return;
  if (!coffeeMissionProgress.completed.includes(state.coffeeMissionId)) coffeeMissionProgress.completed.push(state.coffeeMissionId);
  coffeeMissionProgress.runs += 1;
  saveCoffeeMissionProgress();
  syncCoffeeMissionBoard();
}

function renderCoffeeMissionResult() {
  const active = state.selectedScene === 'coffee';
  missionResult.hidden = !active;
  if (!active) return;
  const mission = coffeeMissionMeta();
  const attempts = globalThis.LumaExperience?.store.getProfile().attempts.filter(item =>
    item.sessionId === globalThis.LumaExperience.currentSession() && item.outcome === 'success' && item.taskId !== 'coffee-thanks') || [];
  const independentVoice = attempts.length > 0 && attempts.every(item => item.productionCondition === 'independent');
  document.querySelector('#missionResultCode').textContent = `咖啡店任务 ${state.coffeeMissionId}`;
  document.querySelector('#missionResultTitle').textContent = state.coffeeMissionId === 'C03' ? '错单已经修正' : '这杯咖啡，点成了';
  document.querySelector('#missionResultCopy').textContent = independentVoice
    ? '关键意思由你用英语说清了。可以换个地方，再用一次。'
    : '你完成了这次真实任务；中文或提示都会如实保留，下次可以少借助一点再试。';
  missionResultTags.replaceChildren();
  const order = coffeeOrderState();
  const values = ['size', 'drink', 'service'].map(slot => coffeeSlotLabel(slot, order[slot])).filter(label => !['杯型', '饮品', '方式'].includes(label));
  for (const label of values) {
    const tag = document.createElement('span'); tag.textContent = label; missionResultTags.append(tag);
  }
  const evidence = document.createElement('span');
  evidence.className = independentVoice ? 'is-earned' : '';
  evidence.textContent = independentVoice ? '本次独立英语语音' : '本次完成 · 独立口语待练';
  missionResultTags.append(evidence);
  if (globalThis.LumaWorldLoop) return;
  const ids = Object.keys(COFFEE_MISSION_UI), next = ids[ids.indexOf(state.coffeeMissionId) + 1];
  repeatSceneButton.innerHTML = next
    ? `<i class="ph ph-arrow-right"></i> 继续任务 ${next}`
    : '<i class="ph ph-arrow-counter-clockwise"></i> 再挑战一个新订单';
}

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

function coffeeMissionTasks() {
  const mission = coffeeMissionMeta();
  const ids = Array.isArray(mission.taskIds) && mission.taskIds.length ? mission.taskIds : Coffee.tasks.map(task => task.id);
  return ids.map(id => {
    const base = Coffee.tasks.find(task => task.id === id);
    if (!base) return null;
    if (state.coffeeMissionId === 'C03' && id === 'coffee-size') return {
      ...base, label: '指出拿到的杯型不对', hint: '可以说 Sorry, I ordered a small. 或 This should be small.',
    };
    if (['C02', 'C04'].includes(state.coffeeMissionId) && id === 'coffee-order') return {
      ...base, label: state.coffeeMissionId === 'C02' ? '按朋友的便条点单' : '独立说清这次订单',
      hint: state.coffeeMissionId === 'C02' ? '朋友要：小杯拿铁，带走。可以一次说完，也可以逐项回答。' : '先自己听和说；需要时可以主动请求重复。',
    };
    return base;
  }).filter(Boolean);
}

function resolvedCoffeeTaskIds(world = state.coffee) {
  const resolved = new Set();
  const mission = Coffee.getMission?.(world?.missionId);
  if (!world || !mission) return resolved;
  if (mission.kind === 'delivery-repair') {
    if (!world.repair?.required) resolved.add('coffee-size');
  } else {
    if (world.drink) resolved.add('coffee-order');
    if (world.size) resolved.add('coffee-size');
    if (world.service) resolved.add('coffee-service');
  }
  if (world.received) resolved.add('coffee-thanks');
  return resolved;
}

function currentTask() {
  const tasks = currentSceneConfig().tasks;
  const task = tasks[state.taskIndex] ?? tasks[0];
  if (state.selectedScene === 'coffee' && Coffee.isTask(task.id)) {
    const nextStep = Coffee.nextMissionStep?.(state.coffee);
    const prompt = nextStep?.taskId === task.id
      ? Coffee.nextPrompt?.(state.coffee)
      : Coffee.promptFor(task.id, state.coffee);
    return { ...task, prompt: prompt || task.prompt };
  }
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
    source: 'voice',
    evidenceSessionId: globalThis.LumaExperience?.currentSession?.(),
    supportLevel: globalThis.LumaExperience?.supportLevel?.() ?? null,
    practiceSession: state.practiceSession,
    sceneId: state.selectedScene,
    missionId: state.selectedScene === 'coffee' ? state.coffeeMissionId : null,
    variantId: state.selectedScene === 'coffee' ? (state.coffeeVariantId || state.coffee?.variantId || null) : null,
    contentVersion: state.selectedScene === 'coffee' ? (state.coffee?.contentVersion || coffeeMissionMeta().contentVersion || null) : null,
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
  const text = !state.sceneStarted ? ''
    : state.micFailure === 'permission' ? '麦克风权限被拒绝 · 在浏览器设置中允许后，点麦克风重试'
    : state.micFailure === 'unavailable' ? '麦克风暂时不可用 · 检查设备后点麦克风重试'
    : state.voiceConnectionPaused ? '语音连接已暂停 · 网络恢复后点麦克风重试'
    : state.micMuted ? '麦克风已关闭 · 点麦克风继续'
    : !state.handsFreeListening ? '正在准备麦克风…'
    : !state.duplexReady ? (state.bufferOverflow ? '连接较慢 · 恢复后请再说一次' : '正在连接 · 已暂存你的声音')
    : microphoneWaitsForCharacter() ? `${currentTask().speaker || 'Luma'} 正在说 · 你也可以开口`
    : state.voicePhase === 'recording' ? '正在听你说'
    : '麦克风已开 · 随时说话';
  if (voiceStatus.textContent !== text) voiceStatus.textContent = text;
  scene.dataset.connectionState = !state.sceneStarted ? 'inactive'
    : state.micFailure || state.voiceConnectionPaused ? 'error'
    : state.duplexReady ? 'ready' : 'connecting';
  const micIcon = micButton.querySelector?.('i');
  if (state.voiceConnectionPaused) {
    micButton.classList.remove('is-live', 'is-muted', 'is-held');
    micButton.classList.add('is-retry');
    micButton.setAttribute('aria-pressed', 'false');
    micButton.setAttribute('aria-label', '重试语音连接');
    micLabel.textContent = '重试连接';
    if (micIcon) micIcon.className = 'ph ph-arrow-clockwise';
  } else {
    micButton.classList.remove('is-retry');
    if (micIcon) micIcon.className = 'ph ph-microphone';
    if (!state.micFailure && state.handsFreeListening && !state.micMuted) {
      micButton.classList.add('is-live');
      micButton.setAttribute('aria-pressed', 'true');
      micButton.setAttribute('aria-label', '关闭麦克风');
      micLabel.textContent = state.voicePhase === 'recording' ? '正在听' : '随时说';
    }
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
    if (!state.voiceConnectionPaused && !state.duplexReady && !state.duplexConnectPromise) connectDuplexSession().catch(() => {});
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
    practiceSession: state.practiceSession,
    sceneId: state.selectedScene,
    taskId: currentTask().id,
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
  if (expected.practiceSession !== state.practiceSession || expected.sceneId !== state.selectedScene
    || expected.taskId !== currentTask().id) return false;
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

function resolveLearnerBeforeReply() {
  const expected = state.expectedResponse;
  if (state.selectedScene !== 'coffee' || expected?.kind !== 'user') return true;
  const turn = [...transcriptLedger.items.values()].find(item => item.id === expected.turnId);
  // A provider reply is an endpoint signal. Resolve the latest hypothesis
  // before releasing that reply, rather than waiting six seconds for a final
  // packet which may never arrive. An ordinary mid-sentence pause is not one.
  if (turn?.confirmed && !turn.final && VoiceRuntime.isSpeechText(turn.text)) {
    turn.responseStarted = true;
    finalizeLearnerTranscript(turn.text, { turn });
  }
  return state.expectedResponse === expected;
}

function learnerDecisionPending() {
  const expected = state.expectedResponse;
  if (state.selectedScene !== 'coffee' || expected?.kind !== 'user') return false;
  const turn = [...transcriptLedger.items.values()].find(item => item.id === expected.turnId);
  return Boolean(turn && (!turn.final || turn.decisionPending));
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
  // Releasing the microphone floor must not lose a partial transcript when
  // the provider starts its reply before sending the final recognition event.
  if (!state.activeVoiceTurn?.confirmed) clearTimeout(state.voiceTurnWatchdogTimer);
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
  message.status = final ? '已听到' : '正在识别';
  renderDialogue();
  if (state.activeVoiceTurn === turn) state.streamingUserIndex = state.dialogueHistory.indexOf(message);
}

function confirmLearnerTurn(turn, text) {
  if (turn.confirmed || !VoiceRuntime.isSpeechText(text)) return;
  if (microphoneWaitsForCharacter()) return;
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

function armVoiceTurnWatchdog(turn = state.activeVoiceTurn) {
  if (!turn || turn.final) return;
  clearTimeout(turn.finalizeTimer);
  const generation = state.connectionGeneration;
  turn.finalizeTimer = setTimeout(() => {
    turn.finalizeTimer = null;
    if (turn.final || !state.sceneStarted || turn.context.practiceSession !== state.practiceSession
      || generation !== state.connectionGeneration) return;
    // A usable hypothesis still belongs to this item after audio.started.
    // Evaluate it once after recognition goes quiet; a missing final packet
    // should never force the learner to repeat an already clear answer.
    if (turn.confirmed && VoiceRuntime.isSpeechText(turn.text)) {
      finalizeLearnerTranscript(turn.text, { turn });
    } else if (state.activeVoiceTurn === turn) {
      if (microphoneWaitsForCharacter()) { armVoiceTurnWatchdog(turn); return; }
      finalizeLearnerTranscript('', { turn });
      settleFailedDuplexTurn();
    }
  }, 6000);
  state.voiceTurnWatchdogTimer = turn.finalizeTimer;
}

function finalizeLearnerTranscript(transcript, { turn = state.activeVoiceTurn } = {}) {
  if (!turn || turn.final || turn.context.practiceSession !== state.practiceSession) return;
  clearTimeout(turn.finalizeTimer); turn.finalizeTimer = null;
  const clean = String(transcript || '').trim();
  if (turn.context.sceneId !== state.selectedScene || turn.context.taskId !== currentTask().id
    || turn.context.taskIndex !== state.taskIndex) {
    // A late final may finish its old bubble, but cannot take the floor or
    // create a new response for the step the learner has already left.
    if (turn.confirmed && VoiceRuntime.isSpeechText(clean)) updateLearnerTurn(turn, clean, true);
    else turn.final = true;
    if (state.activeVoiceTurn === turn) clearLocalSpeechTurn();
    return;
  }
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
  if (!turn.confirmed) {
    globalThis.LumaExperience?.noteAnswer({ ...turn.context, messageId: turn.messageId || turn.id, answer: '' }, 'technical-error');
    openLearnerTurn(); scheduleIdleNudge(); return;
  }
  turn.superseded ||= [...transcriptLedger.items.values()].some(item => item.confirmed && item.id > turn.id)
    || state.dialogueHistory.some(item => item.speaker === 'user' && item.final && item.id > turn.messageId);
  const message = state.dialogueHistory.find(item => item.id === turn.messageId);
  if (turn.superseded && DialogueRules.supportIntent(clean)) return;
  if (!turn.superseded && message && stageTransitionUtterance(clean, turn, message)) return;
  if (!turn.superseded && message && acknowledgeCompletedTurn(clean, message)) return;
  if (!turn.superseded && ['task-complete', 'complete'].includes(state.stage)) {
    if (state.stage === 'task-complete' && DialogueRules.supportIntent(clean) === 'continue') {
      const next = currentSceneConfig().tasks.findIndex((candidate, index) => index > state.taskIndex && !state.coveredGoals.has(candidate.id));
      if (next >= 0) { state.conversationFocus = 'task'; startTask(next); return; }
    }
    state.conversationFocus = 'chat';
    clearTimeout(state.advanceTimer); state.advanceTimer = null;
    clearTimeout(state.reviewTimer); state.reviewTimer = null;
    clearIdleNudge();
  }
  if (!turn.superseded && !turn.responseStarted && (!state.expectedResponse || state.expectedResponse.turnId === turn.id)) {
    if (!state.expectedResponse) beginExpectedResponse('user', { questionId: turn.itemId, turnId: turn.id });
    state.awaitingModelReply = true;
    armReplyTimeout();
  }
  if (!turn.superseded && message && handleConversationSupport(clean, turn.context, message, { responseStarted: turn.responseStarted })) return;
  if (clean && message) {
    turn.decisionPending = true;
    Promise.resolve(requestLanguageFeedback(turn.context.question, clean, {
      ...turn.context, messageId: message.id, revision: message.revision, final: true,
    })).finally(() => {
      turn.decisionPending = false;
      if (state.expectedResponse?.turnId === turn.id) publishDuplexSubtitle();
    });
  }
  publishDuplexSubtitle();
}

function acknowledgeCompletedTurn(text, message) {
  if (state.selectedScene !== 'coffee' || state.stage !== 'task-complete') return false;
  if (state.conversationFocus === 'chat') return false;
  const clean = String(text).toLowerCase().replace(/[.,!，。！]/g, '').trim();
  const courtesy = /^(yes|yeah|yep|yup|ok|okay|right|sure|correct|that's right|thank you|thanks|对|对的|是的|好|好的|嗯|嗯嗯|没错|谢谢)(\s+(please|thanks|thank you|yes|yeah))?$/.test(clean);
  const repeat = Coffee.advanceMission(state.coffee, text);
  const repeatsChoice = repeat.reason === 'already-confirmed';
  if (!courtesy && !repeatsChoice) return false;
  stopSpeechPlayback();
  message.status = '已听到 · 继续下一步';
  renderDialogue();
  openLearnerTurn();
  // A brief “yes” is the learner's latest turn. Give it its own quiet beat
  // instead of using a timer that began before they finished speaking.
  if (state.stage === 'task-complete') {
    const nextTaskIndex = currentSceneConfig().tasks.findIndex((candidate, index) =>
      index > state.taskIndex && !state.coveredGoals.has(candidate.id));
    if (nextTaskIndex >= 0) scheduleTaskAdvance(nextTaskIndex);
  }
  return true;
}

function stageTransitionUtterance(text, turn, message) {
  if (state.stage !== 'task-complete' || !message || !turn) return false;
  const tasks = currentSceneConfig().tasks;
  const nextTaskIndex = tasks.findIndex((candidate, index) => index > state.taskIndex && !state.coveredGoals.has(candidate.id));
  const nextTask = tasks[nextTaskIndex];
  if (!nextTask || DialogueRules.isConversationOnly(text, turn.context?.question)) return false;
  let advancesNextTask = false;
  if (state.selectedScene === 'coffee') {
    const engineStep = Coffee.nextMissionStep?.(state.coffee);
    if (engineStep?.taskId !== nextTask.id) return false;
    const preview = Coffee.advanceMission(state.coffee, text, { expectedRevision: state.coffee?.revision, question: turn.context?.question });
    advancesNextTask = preview.accepted
      && (preview.changedFields || []).map(coffeeTaskForChangedField).includes(nextTask.id);
  } else if (Breakfast.isTask(nextTask.id)) {
    advancesNextTask = Boolean(Breakfast.choiceFromText(nextTask.id, text, turn.context?.question));
  } else {
    // A short yes or a bare name belongs to the actual question. Don't
    // reinterpret social agreement as a bag answer or sign-in for the next step.
    advancesNextTask = DialogueRules.matchesTask(nextTask.id, text)
      && normalizedSpeech(turn.context?.question) === normalizedSpeech(nextTask.prompt);
  }
  if (!advancesNextTask) return false;
  stopSpeechPlayback();
  state.pendingTransitionUtterance = {
    practiceSession: state.practiceSession,
    taskId: nextTask.id,
    taskIndex: nextTaskIndex,
    messageId: message.id,
    question: turn.context?.question,
    text: String(text || '').trim(),
  };
  message.status = '已听到 · 下一步出现后确认';
  renderDialogue();
  if (state.conversationFocus === 'chat') {
    state.conversationFocus = 'task';
    scheduleTaskAdvance(nextTaskIndex);
  }
  return true;
}

function consumeTransitionUtterance() {
  const pending = state.pendingTransitionUtterance;
  if (!pending || pending.practiceSession !== state.practiceSession || state.stage !== 'active'
    || pending.taskIndex !== state.taskIndex || pending.taskId !== currentTask().id) return false;
  state.pendingTransitionUtterance = null;
  const message = state.dialogueHistory.find(item => item.id === pending.messageId);
  if (!message || message.text !== pending.text) return false;
  message.taskId = currentTask().id;
  message.revision = Math.max(1, Number(message.revision) || 1) + 1;
  message.status = '已接到下一步 · 正在确认';
  renderDialogue();
  const context = {
    ...captureUserTurnContext(),
    question: pending.question || state.activeQuestion,
    messageId: message.id,
    revision: message.revision,
    answer: message.text,
    final: true,
    source: 'voice',
  };
  requestLanguageFeedback(context.question, message.text, context);
  return true;
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

function currentSceneConfig() {
  const config = SCENE_CONFIGS[state.selectedScene] ?? SCENE_CONFIGS.kitchen;
  return state.selectedScene === 'coffee' ? { ...config, tasks: coffeeMissionTasks() } : config;
}

function goalRecord(taskId = currentTask().id) {
  state.sessionGoals[taskId] ||= {
    id: taskId,
    heard: false,
    acted: false,
    spoke: false,
    wordCount: 0,
    utterance: '',
    hints: 0,
    responseLatencyMs: 0,
  };
  return state.sessionGoals[taskId];
}

function currentGoalRecord() { return goalRecord(); }

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
  syncCoffeeMissionHud();
  const canFinish = state.stage === 'complete';
  const finish = document.querySelector('#finishConversation');
  if (finish) finish.hidden = !canFinish;
  resetButton.hidden = canFinish;
}

function markGoalHeard() {
  if (!state.sceneStarted || state.stage !== 'active') return;
  const goal = currentGoalRecord();
  goal.heard = true;
  if (!state.questionReadyAt) state.questionReadyAt = Date.now();
}

function markGoalSpokenFor(taskId, text) {
  const goal = goalRecord(taskId);
  const wordCount = normalizedSpeech(text).split(' ').filter(Boolean).length;
  goal.spoke = true;
  goal.wordCount = Math.max(goal.wordCount, wordCount);
  goal.utterance = String(text || '').trim();
  goal.language = /\p{Script=Han}/u.test(goal.utterance)
    ? (/[a-z]/i.test(goal.utterance) ? 'mixed' : 'zh')
    : /[a-z]/i.test(goal.utterance) ? 'en' : 'unknown';
  if (state.questionReadyAt && !goal.responseLatencyMs) goal.responseLatencyMs = Math.max(0, Date.now() - state.questionReadyAt);
}

function markGoalSpoken(text) { markGoalSpokenFor(currentTask().id, text); }

function recordHint() {
  const goal = currentGoalRecord();
  goal.hints += 1;
  state.hintsUsed += 1;
  globalThis.LumaExperience?.noteHelp(3, 'example');
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
  globalThis.LumaExperience?.render();
}

function saveLearningSession() {
  if (state.sessionSaved || state.stage !== 'complete') return;
  state.sessionSaved = true;
  globalThis.LumaExperience?.complete();
  syncLearningUi();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function dialogueMarkup(message) {
  return `<article class="dialogue-bubble is-${message.speaker}" data-message-id="${message.id}"><small>${message.speaker === 'user' ? '你' : escapeHtml(message.name || 'Luma')}</small><p>${escapeHtml(message.text)}</p><span class="transcript-status"><i aria-hidden="true"></i><span></span></span></article>`;
}

function fitRecentDialogue() {
  recentDialogue.classList.remove('is-condensed');
  // External names and receipts must stay within the existing subtitle band.
  if (recentDialogue.scrollHeight > parseFloat(getComputedStyle(languagePanel).maxHeight)) {
    recentDialogue.classList.add('is-condensed');
  }
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
      const statusText = message.status || '';
      if (status.querySelector('span').textContent !== statusText) status.querySelector('span').textContent = statusText;
      status.hidden = !statusText;
      status.title = statusText;
      status.setAttribute('aria-label', statusText);
      const statusState = /未|不一致|再试|再说/.test(statusText) ? 'retry'
        : statusText.startsWith('已确认') ? 'confirmed'
        : /正在/.test(statusText) ? 'pending'
        : /^已听到|^已接到/.test(statusText) ? 'heard' : 'note';
      status.dataset.state = statusState;
      status.querySelector('i').className = `ph ph-${{ confirmed: 'check-circle', heard: 'check', pending: 'dots-three', retry: 'warning-circle', note: 'info' }[statusState]}`;
    }
  };
  const taskMessages = state.dialogueHistory.filter(message => message.taskId === currentTask().id);
  // The live scene only needs the current exchange. Earlier turns stay in
  // “全部对话”; pinning an older accepted answer created a third card and hid
  // the newest reply behind an inner scrollbar.
  const recent = taskMessages.slice(-2);
  if (recent.length === 2 && recent[0].speaker === recent[1].speaker) recent.shift();
  updateList(recentDialogue, recent);
  if (dialogueHistory.classList.contains('is-open')) updateList(dialogueHistoryList, state.dialogueHistory);
  languagePanel.hidden = recent.length === 0;
  openDialogueHistory.hidden = state.dialogueHistory.length === 0;
  fitRecentDialogue();
  languagePanel.scrollTop = languagePanel.scrollHeight;
}

function addDialogueMessage(speaker, text, name = '') {
  const clean = String(text || '').trim();
  if (!clean) return null;
  state.dialogueHistory.push({ id: ++state.messageSerial, revision: 1, speaker, name, text: clean, taskId: currentTask().id });
  const index = state.dialogueHistory.length - 1;
  if (speaker === 'user') state.pendingUserIndex = index;
  renderDialogue();
  return index;
}

function latestCharacterText() {
  return [...state.dialogueHistory].reverse().find((message) => message.speaker === 'luma')?.text || '';
}

function latestFollowupText() {
  const lastAnswer = state.dialogueHistory.findLastIndex(message => message.speaker === 'user' && message.final);
  return state.dialogueHistory.slice(lastAnswer + 1).findLast(message => message.speaker === 'luma')?.text || '';
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
  state.currentSpeech = clean;
  globalThis.LumaVisuals?.speech(clean);
  // A demonstration such as “Yes, please” is not the question being answered.
  if (state.expectedResponse?.kind === 'say' ? state.expectedResponse.updatesQuestion : DialogueRules.isQuestion(clean)) state.activeQuestion = clean;
  state.captionCharacters = Array.from(clean);
  const pendingIndex = state.dialogueHistory.findLastIndex(message => message.speaker === 'luma' && message.pendingPlayback && message.taskId === currentTask().id);
  state.streamingLumaIndex = pendingIndex >= 0 ? pendingIndex : addDialogueMessage('luma', '…', currentTask().speaker || 'Luma');
  if (pendingIndex >= 0) {
    const pending = state.dialogueHistory[pendingIndex];
    pending.text = clean; pending.status = ''; delete pending.pendingPlayback;
    state.captionVisibleCount = state.captionCharacters.length;
    renderDialogue();
  }
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
  if (state.conversationFocus === 'chat') return;
  const task = currentTask();
  const hasMissingStep = (taskNeedsSpeech(task) && !state.speechDone) || (taskNeedsAction(task) && !state.actionDone);
  if (!state.sceneStarted || !hasMissingStep || state.micMuted || state.idleNudgeCount >= 2 || ['complete', 'task-complete'].includes(state.stage)) return;
  const delay = state.idleNudgeCount === 0 ? 12000 : 18000;
  const nudgeWhenQuiet = () => {
    const liveTask = currentTask();
    const stillMissing = (taskNeedsSpeech(liveTask) && !state.speechDone) || (taskNeedsAction(liveTask) && !state.actionDone);
    if (!state.sceneStarted || state.micMuted || !stillMissing || ['complete', 'task-complete'].includes(state.stage)) return;
    if (isConversationTurnPending()) {
      state.idleNudgeTimer = setTimeout(nudgeWhenQuiet, 1200);
      return;
    }
    state.idleNudgeCount += 1;
    if (state.idleNudgeCount === 1) showToast('慢慢来。可以直接说“什么意思”或“怎么说”。', 6500);
    else {
      globalThis.LumaExperience?.noteHelp(1, 'idle-meaning');
      showToast(speechSupportForTask(liveTask).meaning, 10000);
    }
    scheduleIdleNudge();
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
  const inputSource = context.source || 'voice';
  if (!['voice', 'speech'].includes(inputSource)) return;
  if (feedback.technical_error) {
    message.inputSource = inputSource;
    message.status = '暂未确认 · 回答已保留，可继续说或点提示';
    renderDialogue();
    globalThis.LumaExperience?.noteAnswer(context, 'technical-error');
    showToast('暂时没能理解这句，可以换个说法或点提示。不会记成答错。', 5200);
    if (!isConversationTurnPending()) { openLearnerTurn(); scheduleIdleNudge(); }
    return;
  }
  message.inputSource = inputSource;
  if (feedback.conversational) {
    state.conversationFocus = 'chat';
    clearIdleNudge();
    message.status = '继续当前对话';
    renderDialogue();
    return;
  }
  if (state.selectedScene === 'coffee' && Coffee.isTask(context.taskId)) {
    const eventId = `${context.evidenceSessionId || state.practiceSession}:${context.messageId}:${context.revision}`;
    let missionFeedback = feedback.missionResult || Coffee.advanceMission(state.coffee, message.text, {
      eventId, expectedRevision: state.coffee?.revision, question: context.question,
    });
    if (!feedback.missionResult && feedback.choice && missionFeedback.accepted) {
      const interpreted = Object.values(missionFeedback.interpretation?.slots || {});
      const agrees = interpreted.includes(feedback.choice)
        || (feedback.choice === 'thanks' && missionFeedback.interpretation?.gratitude);
      if (!agrees) missionFeedback = { ...missionFeedback, accepted: false, reason: 'conflicting-feedback' };
    }
    if (!missionFeedback.accepted && !missionFeedback.handled && feedback.choice) missionFeedback = Coffee.advanceMission(state.coffee, feedback.choice, {
      eventId, expectedRevision: state.coffee?.revision,
    });
    if (missionFeedback.accepted) {
      state.conversationFocus = 'task';
      const resolvedCurrentStep = !missionFeedback.nextStep?.taskId || missionFeedback.nextStep.taskId !== currentTask().id;
      const committed = commitCoffeeChoice(feedback.choice, {
        utterance: message.text, source: inputSource, missionFeedback, context,
      });
      message.taskAccepted = committed && resolvedCurrentStep;
      message.status = committed ? '已确认' : '未确认 · 请再试一次';
      renderDialogue();
    }
    else {
      if (missionFeedback.reason !== 'conversation') globalThis.LumaExperience?.noteAnswer(context, 'unconfirmed');
      if (missionFeedback.reason === 'conversation-repair') {
        message.status = '已听到';
        renderDialogue();
        stopSpeechPlayback();
        clearIdleNudge();
        speak(missionFeedback.prompt).then(() => scheduleIdleNudge());
      } else if (['conversation', 'question', 'help', 'not-ready'].includes(missionFeedback.reason)
        || (missionFeedback.reason === 'no-decision' && missionFeedback.interpretation?.kind !== 'ambiguous')
        || (missionFeedback.reason === 'repair-not-resolved'
          && !Object.keys(missionFeedback.interpretation?.slots || {}).length)) {
        if (missionFeedback.reason === 'help') {
          const supportLevel = missionFeedback.help === 'meaning' || missionFeedback.help === 'repeat' ? 1 : 3;
          globalThis.LumaExperience?.noteHelp?.(supportLevel, `conversation-${missionFeedback.help || 'help'}`);
        }
        // The realtime character already has this learner turn and can answer
        // the actual question or help request in context. Starting a second
        // explicit prompt here would cancel that reply and mechanically repeat
        // the task question, which makes natural requests feel stuck.
        message.status = '继续当前对话';
        state.conversationFocus = 'chat';
        clearIdleNudge();
        renderDialogue();
      } else if (missionFeedback.prompt) {
        state.currentSpeech = missionFeedback.prompt;
        state.activeQuestion = missionFeedback.prompt;
        clearIdleNudge();
        speak(missionFeedback.prompt).then(started => {
          if (!started) showToast(`Mia：${missionFeedback.prompt}`, 5200);
          scheduleIdleNudge();
        });
      }
    }
    return;
  }
  const acknowledgement = isActionAcknowledgement(currentTask(), message.text, context.question);
  const offered = /^(?:here|here you (?:are|go))[.!]?$/i.test(message.text.trim());
  const accepted = feedback.meaning_valid === true && (!acknowledgement || offered);
  if (Breakfast.isTask(context.taskId)) {
    const committed = feedback.meaning_valid === true && feedback.choice
      && commitBreakfastChoice(feedback.choice, { utterance: message.text, source: inputSource });
    message.taskAccepted = Boolean(committed);
    if (committed) {
      state.conversationFocus = 'task';
      globalThis.LumaExperience?.noteAnswer(context, 'success');
    }
    else { state.conversationFocus = 'chat'; clearIdleNudge(); }
    message.status = committed ? '已确认' : '继续当前对话';
    renderDialogue();
    return;
  }
  if (!accepted) {
    state.conversationFocus = 'chat'; clearIdleNudge();
    message.status = '继续当前对话';
    renderDialogue(); return;
  }
  state.conversationFocus = 'task';
  globalThis.LumaExperience?.noteAnswer(context, 'success');
  message.taskAccepted = true; message.status = '已确认'; renderDialogue();
  state.lastTranscript = message.text;
  state.speechDone = true;
  if (['voice', 'speech'].includes(message.inputSource)) markGoalSpoken(message.text);
  currentGoalRecord().meaningAccepted = true;
  globalThis.LumaExperience?.checkpoint();
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
  if (!context.final || context.practiceSession !== state.practiceSession || DialogueRules.supportIntent(answer)) return;
  if (state.selectedScene !== 'coffee' && DialogueRules.isConversationOnly(answer, question)) {
    applyDynamicFeedback({ conversational: true }, context); return;
  }
  if (Breakfast.isTask(context.taskId)) {
    const choice = Breakfast.choiceFromText(context.taskId, answer, question);
    if (choice) { applyDynamicFeedback({ meaning_valid: true, choice }, context); return; }
  } else if (state.selectedScene === 'coffee' && Coffee.isTask(context.taskId)) {
    if (Coffee.isConversationOnly(answer, question)) {
      applyDynamicFeedback({ conversational: true }, context); return;
    }
    const eventId = `${context.evidenceSessionId || state.practiceSession}:${context.messageId}:${context.revision}`;
    const missionResult = Coffee.advanceMission(state.coffee, answer, { eventId, expectedRevision: state.coffee?.revision, question });
    if (!missionResult.accepted && DialogueRules.isSmallTalk(answer)) {
      applyDynamicFeedback({ conversational: true }, context); return;
    }
    if (missionResult.accepted || missionResult.handled) {
      applyDynamicFeedback({ meaning_valid: missionResult.accepted, missionResult }, context); return;
    }
    // An ordinary conversational turn should not wait on a second grading
    // request before Mia can speak. If an order is unclear, she can clarify
    // one actual option and the next reply will be interpreted in context.
    const asksToOrder = /\b(?:i want|i would like|i['’]d like|i['’]ll have|(?:can|could|may) i (?:have|get|order))\b|我要|我想要|我想点/i.test(answer);
    if (!asksToOrder) { applyDynamicFeedback({ conversational: true }, context); return; }
  } else if (isCurrentTaskQuestion(question) && DialogueRules.matchesTask(context.taskId, answer)) {
    applyDynamicFeedback({ meaning_valid: true }, context); return;
  }
  // Let the realtime character answer ordinary greetings without an extra
  // semantic API round trip or a second, forced task question. Task decisions
  // (including a greeting to Maya or a polite farewell) take precedence.
  if (DialogueRules.isSmallTalk(answer) && !DialogueRules.matchesTask(context.taskId, answer)) {
    applyDynamicFeedback({ conversational: true }, context); return;
  }
  const controller = new AbortController();
  state.pendingFeedback.add(controller);
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch('/api/feedback', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, answer, sceneId: context.sceneId, taskId: context.taskId, coffee: state.coffee }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('feedback_unavailable');
    applyDynamicFeedback(await response.json(), context);
  } catch {
    const fallback = fallbackMeaningFeedback(answer, context.taskId);
    applyDynamicFeedback(fallback.meaning_valid ? fallback : { technical_error: true }, context);
  } finally { clearTimeout(timer); state.pendingFeedback.delete(controller); }
}

function coffeeTaskForChangedField(field) {
  if (field === 'drink') return 'coffee-order';
  if (field === 'size' || field === 'delivered.size') return 'coffee-size';
  if (field === 'service') return 'coffee-service';
  if (field === 'received') return 'coffee-thanks';
  return null;
}

function recordCoffeeMissionEvidence(result, context, utterance, source) {
  const taskIds = [...new Set((result.changedFields || []).map(coffeeTaskForChangedField).filter(Boolean))];
  const currentSupport = goalRecord(context.taskId);
  for (const taskId of taskIds) {
    const success = true;
    const goal = goalRecord(taskId);
    goal.supportLevel = Math.max(goal.supportLevel || 0, currentSupport.supportLevel || context.supportLevel || 0);
    goal.supportKinds = [...new Set([...(goal.supportKinds || []), ...(currentSupport.supportKinds || [])])];
    if (success) {
      goal.meaningAccepted = true;
      markGoalSpokenFor(taskId, utterance);
    }
    globalThis.LumaExperience?.noteAnswer({ ...context, taskId,
      messageId: `${context.messageId}:${taskId}`, answer: utterance, source }, success ? 'success' : 'unconfirmed');
    if (success && taskId !== context.taskId && currentSceneConfig().tasks.some(task => task.id === taskId)) state.coveredGoals.add(taskId);
  }
}

function commitCoffeeChoice(choice, { source = 'voice', utterance = '', missionFeedback = null, context = null } = {}) {
  if (state.selectedScene !== 'coffee' || state.stage !== 'active' || !String(utterance).trim()
    || !['voice', 'speech'].includes(source)) return false;
  const expectedStep = Coffee.nextMissionStep?.(state.coffee);
  if (expectedStep?.taskId && expectedStep.taskId !== currentTask().id) return false;
  const eventId = context ? `${context.evidenceSessionId || state.practiceSession}:${context.messageId}:${context.revision}` : '';
  let result = missionFeedback || Coffee.advanceMission(state.coffee, utterance, { eventId, expectedRevision: state.coffee?.revision, question: context?.question || state.activeQuestion });
  if (!result.accepted && choice) result = Coffee.advanceMission(state.coffee, choice, { eventId, expectedRevision: state.coffee?.revision });
  if (!result.accepted || !result.world) return false;
  state.coffee = result.world;
  state.coffeeMissionId = result.world.missionId || state.coffeeMissionId;
  state.coffeeVariantId = result.world.variantId || state.coffeeVariantId;
  state.lastTranscript = utterance;
  const resolvedCurrentStep = !result.nextStep?.taskId || result.nextStep.taskId !== currentTask().id;
  if (context) recordCoffeeMissionEvidence(result, context, utterance, source);
  else {
    markGoalSpoken(utterance);
    if (resolvedCurrentStep) currentGoalRecord().meaningAccepted = true;
  }
  state.speechDone = resolvedCurrentStep;
  state.actionDone = true;
  if (resolvedCurrentStep) currentGoalRecord().meaningAccepted = true;
  if (!resolvedCurrentStep && result.prompt) {
    state.currentSpeech = result.prompt;
    state.activeQuestion = result.prompt;
  }
  globalThis.LumaVisuals?.render();
  globalThis.LumaExperience?.checkpoint();
  syncSceneProgress();
  if (resolvedCurrentStep) {
    // The mission engine has already made the authoritative decision. Cancel
    // any free-form provider reply that raced the final ASR result, then let
    // the app speak its short deterministic acknowledgment and advance.
    stopSpeechPlayback();
    completeMultimodalTask();
  }
  else {
    stopSpeechPlayback();
    updateDuplexTask({ force: true });
    if (result.prompt) speak(result.prompt).then(started => {
      if (!started) showToast(`Mia：${result.prompt}`, 5200);
      scheduleIdleNudge();
    });
    else scheduleIdleNudge();
  }
  return true;
}

function openDialogueHistoryPanel() {
  dialogueHistory.classList.add('is-open');
  dialogueHistory.setAttribute('aria-hidden', 'false');
  openDialogueHistory.setAttribute('aria-expanded', 'true');
  renderDialogue();
  dialogueHistoryList.scrollTop = dialogueHistoryList.scrollHeight;
}

function closeDialogueHistoryPanel() {
  dialogueHistory.classList.remove('is-open');
  dialogueHistory.setAttribute('aria-hidden', 'true');
  openDialogueHistory.setAttribute('aria-expanded', 'false');
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
  const navHidden = overlayOpen || state.activeView === 'profile';
  bottomNav.setAttribute('aria-hidden', String(navHidden));
  bottomNav.inert = navHidden;
}

function showView(name) {
  const current = views.find((view) => view.dataset.view === state.activeView);
  const currentScroll = current?.querySelector('.view-scroll');
  if (currentScroll) viewScrollPositions.set(state.activeView, currentScroll.scrollTop);
  if (name === 'profile' && state.activeView !== 'profile') profileReturnView = state.activeView;
  state.activeView = name;
  if (name === 'growth' || name === 'profile') syncLearningUi();
  views.forEach((view) => view.classList.toggle('is-active', view.dataset.view === name));
  bottomNav.querySelectorAll('button').forEach((button) => button.classList.toggle('is-active', button.dataset.nav === name));
  const active = views.find((view) => view.dataset.view === name);
  loadDeferredImages(active);
  const activeScroll = active?.querySelector('.view-scroll');
  const savedTop = viewScrollPositions.get(name) || 0;
  activeScroll?.scrollTo({ top: savedTop, behavior: 'auto' });
  requestAnimationFrame(() => { appShell.scrollTop = 0; if (activeScroll) activeScroll.scrollTop = savedTop; });
  syncA11yState();
}

function renderPeople(items) {
  sheetPeople.innerHTML = items.map(([icon, label]) => `<span><i class="ph ph-${icon}"></i> ${label}</span>`).join('');
}

function openSheet(sceneName, trigger = document.activeElement, missionId = null) {
  const data = SCENES[sceneName] ?? SCENES.kitchen;
  const recentSceneCheckpoint = globalThis.LumaExperience?.store?.getCheckpoint?.({ sceneId: sceneName });
  const savedMission = recentSceneCheckpoint?.sceneId === 'coffee' && COFFEE_MISSION_UI[recentSceneCheckpoint.missionId]
    ? recentSceneCheckpoint.missionId : null;
  const requestedMission = sceneName === 'coffee'
    ? (COFFEE_MISSION_UI[missionId] ? missionId : savedMission || Object.keys(COFFEE_MISSION_UI).find(id => !coffeeMissionProgress.completed.includes(id)) || 'C04')
    : null;
  const mission = requestedMission ? COFFEE_MISSION_UI[requestedMission] : null;
  const checkpoint = globalThis.LumaExperience?.store?.getCheckpoint?.({
    sceneId: sceneName,
    missionId: requestedMission || undefined,
  });
  const missionImages = { C01: './assets/coffee/order.webp', C02: './assets/coffee/order.webp', C03: './assets/coffee/size.webp', C04: './assets/coffee/service.webp' };
  const missionGoals = {
    C01: '点一杯自己喜欢的咖啡',
    C02: '小杯拿铁，带走',
    C03: '发现杯型不对，并请 Mia 换回来',
    C04: '不看字幕，独立完成一张新订单',
  };
  const available = data.available && (!requestedMission || coffeeMissionIsUnlocked(requestedMission));
  sheetSelection = { sceneId: sceneName, missionId: requestedMission, resumeCheckpoint: checkpoint || null };
  sheetImage.src = missionImages[requestedMission] || data.previewImage || data.image;
  sheetImage.alt = `${data.title}情境预览`;
  sheetBadge.textContent = requestedMission ? `任务 ${requestedMission}` : data.badge;
  sheetEyebrow.textContent = requestedMission ? '街角的第一杯 · 当前事件' : data.eyebrow;
  sheetTitle.textContent = mission?.title || data.title;
  sheetDescription.textContent = mission?.brief || data.description;
  sheetGoal.textContent = missionGoals[requestedMission] || data.goal;
  const people = requestedMission
    ? [...data.people.slice(0, 2), ['flag', `${Coffee.getMission(requestedMission)?.taskIds.length || 4} 个对话步骤`]]
    : data.people;
  renderPeople(people);
  sheetCta.disabled = !available;
  sheetCta.innerHTML = available
    ? `${checkpoint ? (sceneName === 'coffee' ? '从头再练这一任务' : '继续这一事件') : requestedMission ? '开始这一事件' : '进入真实情境'} <i class="ph ph-arrow-right"></i>`
    : `${requestedMission ? '先完成前一件事' : '这个真实环境正在搭建'} <i class="ph ph-lock-simple"></i>`;
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
  sheetSelection = null;
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
  if (state.selectedScene === 'kitchen') loadDeferredImages(apple);
  globalThis.LumaVisuals?.clear();
  scene.dataset.scene = state.selectedScene;
  experience.setAttribute('aria-label', `${SCENES[state.selectedScene].title}互动情境`);
  const interactiveIds = config.tasks.filter((task) => task.interaction === 'tap').map((task) => task.id);
  const hasDragTask = config.tasks.some((task) => task.interaction === 'drag');
  objectLayer.hidden = !hasDragTask && interactiveIds.length === 0;
  apple.hidden = !hasDragTask;
  apple.disabled = !hasDragTask;
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

function armCharacterTurnWatchdog(delayMs = 1000) {
  // Audio packets can arrive several times a second. Keep the existing timer
  // so a provider cannot postpone the absolute deadline by continually
  // rearming it with tiny chunks.
  if (state.characterWatchdogTimer) return;
  if (!state.lumaStartedAt) state.lumaStartedAt = Date.now();
  const generation = state.playbackGeneration;
  state.characterWatchdogTimer = setTimeout(() => {
    state.characterWatchdogTimer = null;
    if (generation !== state.playbackGeneration || !state.duplexSpeaking || state.duplexOutputDone) return;
    const now = Date.now();
    if (now - state.lumaStartedAt >= CHARACTER_TURN_MAX_MS) {
      const taskDone = settleFailedDuplexTurn();
      showToast(taskDone ? '回答已确认，已继续下一步。' : '这段声音已停止，问题已显示，可以直接回答。');
      return;
    }
    const playbackActive = isConversationPlaybackActive();
    const playbackTime = Number(state.duplexPlayerContext?.currentTime);
    if (playbackActive && Number.isFinite(playbackTime)) {
      if (!state.duplexClockAdvancedAt || playbackTime > state.duplexClockTime + .01) {
        state.duplexClockTime = playbackTime;
        state.duplexClockAdvancedAt = now;
      } else if (now - state.duplexClockAdvancedAt >= CHARACTER_CLOCK_STALL_MS) {
        const taskDone = settleFailedDuplexTurn();
        showToast(taskDone ? '回答已确认，已继续下一步。' : '声音播放暂停了，问题已显示，可以直接回答。');
        return;
      }
    }
    const quietFor = now - state.lastDuplexAudioAt;
    if (quietFor < CHARACTER_AUDIO_QUIET_MS || playbackActive) { armCharacterTurnWatchdog(1000); return; }
    const taskDone = settleFailedDuplexTurn();
    showToast(taskDone ? '回答已确认，已继续下一步。' : '声音没有播出来，问题已显示，可以直接回答。');
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
    const taskDone = settleFailedDuplexTurn();
    showToast(taskDone ? '回答已确认，正在继续下一步。' : '语音暂时没接上，问题已显示，可以直接回答。', 3000);
  }, 10000);
}

function stopDuplexPlayback({ cancel = true } = {}) {
  const cancelUpstream = cancel && state.expectedResponse && !state.duplexOutputDone;
  state.playbackGeneration += 1;
  clearCharacterTurnWatchdog(); clearCharacterCaptionReveal();
  clearTimeout(state.firstPacketTimer); state.firstPacketTimer = null;
  clearTimeout(state.duplexFinishTimer); state.duplexFinishTimer = null;
  clearTimeout(state.duplexAudioGateTimer); state.duplexAudioGateTimer = null;
  state.duplexPendingAudio = []; state.duplexSubtitleReady = false;
  state.duplexSources.forEach(source => { try { source.stop(); } catch {} });
  state.duplexSources.clear(); state.duplexNextPlayTime = 0;
  state.duplexAudioQueue = Promise.resolve();
  state.lumaStartedAt = 0; state.lastDuplexAudioAt = 0;
  state.duplexClockTime = 0; state.duplexClockAdvancedAt = 0;
  state.duplexSpeaking = false; state.duplexOutputDone = false;
  if (cancel) {
    state.duplexAcceptAudio = false; retireExpectedResponse();
    state.duplexResponseText = ''; state.duplexPendingSubtitle = '';
    state.duplexResponseIsPrompt = false; state.duplexValidatedText = false;
    state.duplexAfter = null;
    if (state.duplexReady && cancelUpstream) sendDuplex({ type: 'response.cancel' });
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
  return state.deferredVoiceEvents.length > 0
    || Boolean(state.activeVoiceTurn)
    || state.awaitingPrompt
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
  const unplayed = state.dialogueHistory.findLast(item => item.speaker === 'luma' && item.pendingPlayback && item.taskId === currentTask().id);
  const pendingText = state.duplexValidatedText ? state.duplexPendingSubtitle : '';
  const turn = state.activeVoiceTurn;
  const message = state.dialogueHistory.find(item => item.id === turn?.messageId);
  if (message && !message.final) { message.status = '未确认 · 请再说一次'; renderDialogue(); }
  stopSpeechPlayback(); clearUserTurn(); clearLocalSpeechTurn();
  if (unplayed) showUnplayedCharacterLine(unplayed.text, unplayed.updatesQuestion !== false);
  else if (pendingText) showUnplayedCharacterLine(pendingText, false);
  else if (state.stage === 'active' && state.dialogueHistory.at(-1)?.speaker !== 'luma') {
    // Keep a real route back into the task in the conversation, not only in
    // an expiring toast. Neither provider failure nor unrelated speech passes
    // the task or takes away the ability to answer / ask for help.
    const prompt = state.conversationFocus === 'chat'
      ? "Sorry, I missed that. Could you say it again?"
      : state.activeQuestion || currentTask().question || currentTask().prompt;
    if (prompt) {
      showUnplayedCharacterLine(prompt, true);
      const recovery = state.dialogueHistory.at(-1);
      if (recovery?.speaker === 'luma') recovery.status = '可继续回答 · 也可以点提示';
      renderDialogue();
    }
  }
  state.duplexTranscript = ''; state.nudgeInFlight = false;
  // Events captured while the failed line owned the floor must be released or
  // discarded with that connection. Leaving one queued event here kept the
  // transition scheduler permanently busy after an otherwise accepted answer.
  flushDeferredVoiceEvents();
  if (!state.duplexSocket) state.deferredVoiceEvents = [];
  flushMicrophoneBuffer();
  const taskDone = ['task-complete', 'complete'].includes(state.stage);
  if (taskDone && unplayed) {
    const recovery = [...state.dialogueHistory].reverse().find(item => item.speaker === 'luma');
    if (recovery) { recovery.status = '声音没播完 · 已继续'; renderDialogue(); }
  }
  if (taskDone) openCourtesyTurn();
  else openLearnerTurn();
  scheduleIdleNudge(); syncVoiceStatus();
  return taskDone;
}

function finishDuplexTurnWhenAudioEnds() {
  const generation = state.playbackGeneration;
  clearCharacterTurnWatchdog();
  clearTimeout(state.duplexFinishTimer);
  const context = state.duplexPlayerContext;
  const remaining = context ? Math.max(0, state.duplexNextPlayTime - context.currentTime) : 0;
  state.duplexFinishTimer = setTimeout(() => {
    if (generation !== state.playbackGeneration || !state.duplexOutputDone) return;
    if (isConversationPlaybackActive()) { settleFailedDuplexTurn(); return; }
    state.lastCharacterEndedAt = Date.now();
    clearCharacterCaptionReveal({ complete: true });
    state.duplexSpeaking = false;
    state.lumaStartedAt = 0; state.lastDuplexAudioAt = 0;
    state.duplexClockTime = 0; state.duplexClockAdvancedAt = 0;
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
    // Deliver anything captured while this line was playing before a task
    // transition or another scheduled character cue can take the floor.
    flushDeferredVoiceEvents();
    flushMicrophoneBuffer();
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
  }, Math.min(remaining * 1000 + 160, CHARACTER_TURN_MAX_MS));
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
  if (state.duplexSubtitleReady || learnerDecisionPending()) return;
  state.duplexSubtitleReady = true;
  clearTimeout(state.duplexAudioGateTimer);
  state.duplexAudioGateTimer = null;
  const pending = state.duplexPendingAudio.splice(0);
  pending.forEach(queueDuplexAudio);
}

function publishDuplexSubtitle() {
  const reply = state.duplexPendingSubtitle.trim();
  if (learnerDecisionPending() || !state.duplexValidatedText || !reply) return false;
  // Judge facts only after the current learner decision settles. Before
  // that, an otherwise correct confirmation may merely be ahead of state.
  if (state.expectedResponse?.kind === 'user' && state.selectedScene === 'coffee'
    && (Coffee.replyContradictsOrder(reply, state.coffee) || Coffee.replyViolatesScene(reply))) {
    const learner = state.dialogueHistory.findLast(item => item.speaker === 'user' && item.final);
    const recovery = Coffee.conversationReply(learner?.text, state.coffee, { question: state.activeQuestion });
    discardReasoningLeak(recovery || Coffee.promptFor(currentTask().id, state.coffee));
    return false;
  }
  if (state.expectedResponse?.textOnlyDone) {
    showUnplayedCharacterLine(reply, state.duplexResponseIsPrompt);
    settleFailedDuplexTurn();
    return true;
  }
  if (!state.duplexSpeaking) return false;
  state.duplexPendingSubtitle = '';
  if (state.pendingPostActionQuestion && state.actionDone && !state.speechDone && /\?\s*$/.test(reply)) {
    clearTimeout(state.postActionQuestionTimer);
    state.postActionQuestionTimer = null;
    state.pendingPostActionQuestion = false;
  }
  if (state.stage === 'active' && (state.duplexResponseIsPrompt || !state.characterPromptDelivered)) state.characterPromptDelivered = true;
  globalThis.LumaExperience?.noteCharacterLine(reply);
  beginCharacterCaptionReveal(reply);
  releaseDuplexAudioGate();
  finishDuplexAudioOutput();
  return true;
}

async function finishDuplexAudioOutput() {
  if (!state.duplexOutputDone || !state.duplexSubtitleReady || !state.duplexAcceptAudio) return;
  const generation = state.playbackGeneration;
  state.duplexAcceptAudio = false;
  // AudioContext.resume() can remain pending after a device/browser change.
  // Keep a deadline while draining the queue, even after provider audio.done.
  const timer = setTimeout(() => {
    if (generation === state.playbackGeneration) settleFailedDuplexTurn();
  }, 8000);
  try {
    await state.duplexAudioQueue;
    if (generation === state.playbackGeneration) finishDuplexTurnWhenAudioEnds();
  } catch {
    if (generation === state.playbackGeneration) settleFailedDuplexTurn();
  } finally { clearTimeout(timer); }
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
  if (state.conversationFocus === 'chat') return '';
  const tasks = currentSceneConfig().tasks;
  const replacement = DialogueRules.transitionReplyReplacement({
    text: value,
    stage: state.stage,
    hasMoreTasks: tasks.some((task) => !state.coveredGoals.has(task.id)),
    taskAcknowledgment: safeCharacterReply(),
  });
  return replacement;
}

function safeCharacterReply() {
  if (Coffee.isTask(currentTask().id)) return state.speechDone ? Coffee.acknowledgment(currentTask().id, state.coffee) : currentTask().prompt;
  if (Breakfast.isTask(currentTask().id)) return state.speechDone ? Breakfast.acknowledgment(currentTask().id, state.breakfast) : currentTask().prompt;
  if (!taskNeedsAction() && !state.speechDone) return currentTask().prompt;
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
      'gate-a12': 'Okay. Have a good flight.',
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
  scene.dataset.voiceConnectionAttempts = String(Number(scene.dataset.voiceConnectionAttempts || 0) + 1);
  transcriptLedger.reset();
  clearLocalSpeechTurn();
  state.deferredVoiceEvents = [];
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
    scene.dataset.lastVoiceFailure = String(message || 'unknown');
    scene.dataset.lastVoiceFailureAt = String(Date.now());
    clearTimeout(connectionWatchdog);
    state.duplexConnectReject?.(new Error(message));
    state.duplexConnectResolve = null; state.duplexConnectReject = null;
    state.duplexConnectPromise = null; state.duplexReady = false; state.duplexSocket = null;
    try { socket.close(); } catch {}
    state.duplexFailureCount += 1;
    if (state.duplexFailureCount >= 2) {
      state.voiceConnectionPaused = true;
      state.bufferOverflow = false;
      microphoneBuffer.clear();
      showToast('语音连接已暂停。网络恢复后，点麦克风重新连接。', 5200);
    }
    settleFailedDuplexTurn(); syncVoiceStatus();
  };
  const connectionWatchdog = setTimeout(() => fail('connection_timeout'), 15000);
  socket.onopen = () => {
    if (!current()) return;
    sendDuplex({ type: 'start', taskId: currentTask().id, actionDone: state.actionDone,
      speechDone: state.speechDone, coveredGoals: [...state.coveredGoals], flowState: state.stage,
      breakfast: state.breakfast, coffee: state.coffee, speechRate: preferences.speechRate, history: state.dialogueHistory.filter(m => m.final || m.speaker === 'luma').slice(-12).map(m => ({ role: m.speaker === 'user' ? 'user' : 'assistant', text: m.text })) });
  };
  socket.onmessage = async (message) => {
    if (!current()) return;
    let event;
    try { event = JSON.parse(message.data); } catch { return; }
    scene.dataset.lastDuplexEvent = event.type || 'unknown';
    scene.dataset.lastDuplexEventAt = String(Date.now());
    // Audio already in flight can arrive after playback starts. Defer its
    // recognition/response together; never cancel the line being heard.
    const responseId = responseEventId(event);
    const questionId = responseQuestionId(event);
    const nextResponse = event.type.startsWith('response.output_')
      && ((responseId && state.expectedResponse?.responseId && responseId !== state.expectedResponse.responseId)
        || (questionId && state.expectedResponse?.questionId && questionId !== state.expectedResponse.questionId));
    const knownTurn = transcriptLedger.items.get(transcriptItemId(event));
    const learnerEvent = (event.type.startsWith('conversation.item.input_audio_transcription.')
      && !knownTurn?.confirmed) || event.type === 'input_audio_buffer.speech_started';
    if (microphoneWaitsForCharacter() && (learnerEvent || nextResponse)) {
      state.deferredVoiceEvents.push({ data: message.data, context: captureUserTurnContext() });
      return;
    }
    if (event.type === 'session.created') {
      clearTimeout(connectionWatchdog); state.duplexReady = true;
      state.duplexFailureCount = 0; state.voiceConnectionPaused = false;
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
      const turn = acceptTranscriptEvent(event, { allowStart: true });
      const text = extractDuplexText(event);
      if (!turn || !VoiceRuntime.isSpeechText(text)) return;
      confirmLearnerTurn(turn, text);
      if (!turn.confirmed) return;
      updateLearnerTurn(turn, text);
      if (state.activeVoiceTurn === turn) state.duplexTranscript = text;
      armVoiceTurnWatchdog(turn);
      return;
    }
    if (event.type === 'conversation.item.input_audio_transcription.completed') {
      const turn = acceptTranscriptEvent(event, { allowStart: true });
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
      if (!resolveLearnerBeforeReply()) return;
      const reply = (extractDuplexText(event) || state.duplexResponseText).trim();
      state.duplexResponseText = '';
      // A requested line already has an owner; late free replies cannot
      // replace its text while that line's audio is being generated.
      if (state.expectedResponse?.kind === 'say') { publishDuplexSubtitle(); return; }
      if (looksLikeReasoningLeak(reply)) { discardReasoningLeak(); return; }
      if (asksForCompletedAction(reply)) { discardReasoningLeak(safeCharacterReply()); return; }
      const replacement = transitionReplyReplacement(reply);
      if (replacement) { discardReasoningLeak(replacement); return; }
      if (reply) { state.duplexValidatedText = true; state.duplexPendingSubtitle = reply; publishDuplexSubtitle(); }
      return;
    }
    if (event.type === 'response.output_audio.started') {
      if (!acceptResponseEvent(event) || state.suppressDuplexResponse) return;
      if (!resolveLearnerBeforeReply()) return;
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
      state.duplexClockTime = Number(state.duplexPlayerContext?.currentTime) || 0;
      state.duplexClockAdvancedAt = state.lumaStartedAt;
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
    // Some upstream sessions finish with response.done but omit the more
    // specific audio-done event. Treat either matching event as the terminal
    // signal so the character turn cannot hold the lesson indefinitely.
    if (event.type === 'response.output_audio.done' || event.type === 'response.done') {
      if (!acceptResponseEvent(event)) return;
      if (!state.expectedResponse?.audioStarted) {
        if (learnerDecisionPending()) { state.expectedResponse.textOnlyDone = true; return; }
        const text = state.duplexValidatedText ? state.duplexPendingSubtitle : '';
        if (text) showUnplayedCharacterLine(text, state.duplexResponseIsPrompt);
        settleFailedDuplexTurn();
        return;
      }
      if (!state.duplexAcceptAudio) return;
      if (state.duplexOutputDone) return;
      clearCharacterTurnWatchdog(); state.duplexOutputDone = true;
      if (!state.duplexSubtitleReady) {
        state.duplexAudioGateTimer = setTimeout(() => {
          if (current() && !state.duplexSubtitleReady) settleFailedDuplexTurn();
        }, 4000);
      } else finishDuplexAudioOutput();
      return;
    }
    if (event.type === 'response.canceled' || event.type === 'response.cancelled') {
      // An id-less acknowledgment of our previous cancellation cannot retire
      // a new response. Only recover a cancellation bound to the current one.
      const matchesCurrent = (responseId && responseId === state.expectedResponse?.responseId)
        || (questionId && questionId === state.expectedResponse?.questionId);
      if (matchesCurrent && acceptResponseEvent(event)) settleFailedDuplexTurn();
      return;
    }
    // Unidentified done/canceled events cannot retire a newer response.
    if (['error', 'local.error', 'local.closed'].includes(event.type)) fail(event.message || 'voice_unavailable');
  };
  socket.onerror = () => fail('socket_error');
  socket.onclose = event => fail(`socket_closed_${event?.code || 'unknown'}`);
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
    breakfast: state.breakfast, coffee: state.coffee,
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
    breakfast: state.breakfast, coffee: state.coffee,
  });
}

function closeDuplexSession() {
  const socket = state.duplexSocket;
  state.connectionGeneration += 1;
  state.duplexSocket = null; state.duplexReady = false;
  state.deferredVoiceEvents = [];
  state.duplexConnectReject?.(new Error('session_closed'));
  state.duplexConnectReject = null; state.duplexConnectResolve = null; state.duplexConnectPromise = null;
  try { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'close' })); socket?.close(); } catch {}
  stopSpeechPlayback(); setVoicePhase('idle');
}

function stopSpeechPlayback() {
  state.speechRequestSerial += 1;
  // Retiring a guarded reply also retires its suppression. A learner can
  // answer during the short safe-retry delay; that new reply must be audible.
  state.suppressDuplexResponse = false;
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
  showPendingTaskPrompt(clean, { updatesQuestion: prompt });
  const requestId = ++state.speechRequestSerial, session = state.practiceSession;
  if (state.sceneStarted && state.stage === 'active') state.awaitingPrompt = Boolean(prompt);
  if (!state.duplexReady) { try { await connectDuplexSession(); } catch {} }
  if (requestId !== state.speechRequestSerial || session !== state.practiceSession) return false;
  if (!state.duplexReady) {
    state.awaitingPrompt = false; openLearnerTurn(); scheduleIdleNudge();
    showUnplayedCharacterLine(clean, prompt);
    showToast('语音还没连上，可以稍后重听或点麦克风重试。'); after?.(); return false;
  }
  state.duplexAfter = after || null; state.duplexResponseText = '';
  state.duplexPendingSubtitle = clean; state.duplexValidatedText = true;
  const expected = beginExpectedResponse('say');
  expected.updatesQuestion = prompt;
  state.firstPacketTimer = setTimeout(() => {
    if (state.expectedResponse?.id !== expected.id || expected.audioStarted) return;
    settleFailedDuplexTurn();
    showUnplayedCharacterLine(clean, prompt);
    showToast('这句话没有播放，可以点重听或继续说。');
  }, 10000);
  setVoicePhase('character'); sendDuplex({ type: 'say', text: clean });
  return true;
}

function showUnplayedCharacterLine(text, updatesQuestion = false) {
  if (updatesQuestion) state.activeQuestion = text;
  state.currentSpeech = text;
  const pending = state.dialogueHistory.findLast(item => item.speaker === 'luma' && item.pendingPlayback && item.taskId === currentTask().id);
  if (pending) { pending.text = text; delete pending.pendingPlayback; }
  else if (state.dialogueHistory.at(-1)?.speaker !== 'luma' || latestCharacterText() !== text)
    addDialogueMessage('luma', text, currentTask().speaker || 'Luma');
  const message = [...state.dialogueHistory].reverse().find(item => item.speaker === 'luma');
  if (message) { message.status = '语音未播放 · 可以看字幕或重听'; renderDialogue(); }
  if (state.stage === 'active' && currentTask().autoAdvance) completeMultimodalTask();
}

function handleConversationSupport(text, context, message, { responseStarted = false } = {}) {
  const intent = DialogueRules.supportIntent(text);
  if (!intent || context.practiceSession !== state.practiceSession
    || context.sceneId !== state.selectedScene || context.taskId !== currentTask().id || state.stage !== 'active') return false;
  if (['meaning', 'example'].includes(intent) && !isCurrentTaskQuestion(context.question)) {
    // A natural side question needs its own explanation from the conversation,
    // not a canned translation of the original lesson question.
    globalThis.LumaExperience?.noteHelp(intent === 'example' ? 3 : 1, intent);
    return false;
  }
  if (responseStarted && isConversationPlaybackActive()) {
    // Final ASR may arrive after this turn's answer has begun. Keep that full
    // sentence, and classify the request as support rather than task success.
    globalThis.LumaExperience?.noteHelp(intent === 'example' ? 3 : 1, intent);
    message.status = '继续当前对话'; renderDialogue();
    if (intent === 'wait') { clearIdleNudge(); state.idleNudgeCount = 2; }
    return true;
  }
  stopSpeechPlayback(); clearLocalSpeechTurn(); clearIdleNudge();
  state.idleNudgeCount = intent === 'wait' ? 2 : 0;
  message.status = intent === 'wait' ? '慢慢想，准备好直接开口' : '继续当前对话';
  renderDialogue();
  globalThis.LumaExperience?.closeHelp();
  if (intent === 'wait') {
    showToast('好，慢慢想。准备好后直接回答，或说“继续”。', 8000);
    openLearnerTurn(); return true;
  }
  const question = context.question || currentTask().prompt;
  state.activeQuestion = question;
  if (intent === 'continue' || intent === 'replay') {
    if (intent === 'continue') {
      if (state.conversationFocus === 'chat' && !isCurrentTaskQuestion(question)) state.activeQuestion = currentTask().prompt;
      state.conversationFocus = 'task';
    }
    if (intent === 'replay') globalThis.LumaExperience?.noteHelp(1, 'replay');
    speak(state.activeQuestion); return true;
  }
  const support = speechSupportForTask();
  globalThis.LumaExperience?.noteHelp(intent === 'meaning' ? 1 : 3, intent);
  const line = intent === 'meaning' ? support.meaning : `${support.meaning} 可以说：${support.model}`;
  speak(line, { prompt: false });
  return true;
}

function isCurrentTaskQuestion(question) {
  const task = currentTask(), normalized = normalizedSpeech(question);
  return normalized === normalizedSpeech(task.prompt)
    || normalized === normalizedSpeech(DialogueRules.openingLine(task.id, task.prompt))
    || Boolean(task.question && normalized === normalizedSpeech(task.question));
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
      'breakfast-cup': '我在请你把杯子给我。你可以说 Here，或者 Here you are。',
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
  if (announce && !hidden) globalThis.LumaVisuals?.noteExposure();
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
  if (state.selectedScene === 'coffee' && state.coffeeMissionId === 'C03' && task.id === 'coffee-size') return {
    meaning: '你点的是小杯，但 Mia 给成了大杯。告诉她你原本点的是小杯。',
    starter: 'Sorry, small…',
    model: 'Sorry, I ordered a small. 或者 This should be small.',
  };
  const supports = {
    'coffee-order': { meaning: '店员在问你想喝什么。左边是拿铁，右边是美式。', starter: 'A latte…', model: 'A latte, please. 或者 An americano, please.' },
    'coffee-size': { meaning: '店员在问你要小杯还是大杯。', starter: 'Small…', model: 'Small, please. 或者 Large, please.' },
    'coffee-service': { meaning: '店员在问你在店里喝，还是带走。', starter: 'To go…', model: 'To go, please. 或者 For here, please.' },
    'coffee-thanks': { meaning: '店员已经做好了你点的咖啡，回应一句谢谢就好。', starter: 'Thank…', model: 'Thank you.' },
    'breakfast-drink': { meaning: '她在问你想喝牛奶还是水。', starter: 'Milk…', model: 'Milk, please. 或者 Water, please.' },
    'breakfast-cup': { meaning: '她想请你把杯子给她，开口回应就可以。', starter: 'Here…', model: 'Here you are.' },
    'breakfast-more': { meaning: '她在问你还要不要再来一点。', starter: 'Yes…', model: 'Yes, please. 够了可以说 No, thanks.' },
    apple: { meaning: '这是苹果。', starter: 'An…', model: 'An apple.' },
    milk: { meaning: '这是牛奶。', starter: 'M…', model: 'Milk.' },
    plate: { meaning: '这是盘子。', starter: 'A…', model: 'A plate.' },
    cup: { meaning: '这是杯子。', starter: 'A…', model: 'A cup.' },
    spoon: { meaning: '这是勺子。', starter: 'A…', model: 'A spoon.' },
    ticket: { meaning: '工作人员想看看你的登机牌，开口回应就可以。', starter: 'Here…', model: 'Here you are.' },
    bag: { meaning: '这是你的包吗？', starter: 'Yes…', model: 'Yes.' },
    'gate-a12': { meaning: '工作人员在问你要去哪个登机口。你的登机口是 A12。', starter: 'A…', model: 'A12.' },
    'office-purpose': { meaning: '说出你想见的人。', starter: 'M…', model: 'Maya.' },
    'office-signin': { meaning: '告诉前台你的名字。', starter: 'My…', model: 'My name is Li.' },
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
  syncOuterQuestUi();
  globalThis.LumaExperience?.renderHome();
}

function syncSettingsUi() {
  speechRateValue.textContent = preferences.speechRate;
  rescueValue.textContent = preferences.rescue;
}

function handleSetting(button) {
  if (button.dataset.setting === 'speech-rate') {
    preferences.speechRate = preferences.speechRate === '慢速' ? '正常' : '慢速';
    try { localStorage.setItem('luma-speech-rate', preferences.speechRate); } catch {}
    updateDuplexTask({ force: true });
    syncSettingsUi();
    showAppToast(`语音速度已切换为${preferences.speechRate}`);
    return;
  }
  if (button.dataset.setting === 'rescue') {
    preferences.rescue = preferences.rescue === '按需显示' ? '始终显示' : '按需显示';
    try { localStorage.setItem('luma-rescue', preferences.rescue); } catch {}
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
    // An unconfirmed turn may only reserve PCM captured before this opening.
    // It must not prevent the line whose completion will release that PCM.
    // Confirmed speech and responses still retain their conversational floor.
    const blocked = state.awaitingModelReply || state.userTurnActive
      || state.localSpeechActive || state.userTranscriptPending
      || Boolean(state.activeVoiceTurn?.confirmed) || Boolean(state.expectedResponse)
      || state.duplexSpeaking || state.duplexAcceptAudio || isConversationPlaybackActive();
    if (blocked) { state.promptTimer = setTimeout(deliver, 180); return; }
    state.promptTimer = null;
    const pending = state.dialogueHistory.findLast(item => item.pendingPlayback && item.taskId === taskId);
    speak(pending?.text || currentTask().prompt);
  };
  state.promptTimer = setTimeout(deliver, initialDelay);
}

function showPendingTaskPrompt(line = currentTask().prompt, { updatesQuestion = true } = {}) {
  const task = currentTask();
  const text = String(line || '').trim();
  globalThis.LumaVisuals?.speech(text);
  if (!text) return;
  let message = state.dialogueHistory.find(item => item.pendingPlayback && item.taskId === task.id);
  if (!message) {
    const index = addDialogueMessage('luma', text, task.speaker || 'Luma');
    message = state.dialogueHistory[index];
  }
  message.text = text;
  message.pendingPlayback = true;
  message.updatesQuestion = updatesQuestion;
  message.taskId = task.id;
  message.status = '正在准备声音 · 可以先读这一句';
  if (updatesQuestion) state.activeQuestion = text;
  renderDialogue();
}

function startTask(index, { speakAgain = true } = {}) {
  state.conversationFocus = 'task';
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
  const hasTransitionUtterance = state.pendingTransitionUtterance?.practiceSession === state.practiceSession
    && state.pendingTransitionUtterance.taskIndex === index
    && state.pendingTransitionUtterance.taskId === task.id;
  state.stage = 'active';
  state.hintLevel = 0;
  state.dragging = false;
  state.actionDone = !taskHasAction(task) || Boolean(state.sessionGoals[task.id]?.acted);
  state.speechDone = !taskNeedsSpeech(task) || Boolean(state.sessionGoals[task.id]?.meaningAccepted);
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
  globalThis.LumaVisuals?.render();
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
  state.awaitingPrompt = Boolean(speakAgain && !hasTransitionUtterance);
  if (speakAgain) {
    const opening = state.dialogueHistory.length === 0
      ? DialogueRules.openingLine(task.id, task.prompt) : task.prompt;
    showPendingTaskPrompt(opening);
    if (hasTransitionUtterance) {
      const promptMessage = state.dialogueHistory.findLast(item => item.pendingPlayback && item.taskId === task.id);
      if (promptMessage) {
        delete promptMessage.pendingPlayback;
        promptMessage.status = '已听到你刚才的回答 · 正在接上';
        renderDialogue();
      }
      state.promptTimer = setTimeout(() => {
        state.promptTimer = null;
        consumeTransitionUtterance();
      }, 180);
    } else scheduleTaskPrompt(task.id, state.duplexReady ? 180 : 2600);
  }
  globalThis.LumaExperience?.taskStarted();
  ensureSceneVoiceIsOpen();
}

function resetScene({ speakAgain = true, resumeCheckpoint = null, startTaskIndex = 0, reviewTaskId = null } = {}) {
  const restartCoffeeMission = ['coffee', 'kitchen'].includes(state.selectedScene)
    && resumeCheckpoint?.sceneId === state.selectedScene;
  state.practiceSession += 1;
  state.pendingTransitionUtterance = null;
  state.pendingFeedback.forEach(controller => controller.abort());
  state.pendingFeedback.clear();
  transcriptLedger.reset();
  microphoneBuffer.clear();
  state.breakfast = Breakfast.initial();
  if (state.selectedScene === 'coffee' && resumeCheckpoint?.sceneId === 'coffee') {
    const resumedMission = resumeCheckpoint.missionId || resumeCheckpoint.coffee?.missionId;
    if (COFFEE_MISSION_UI[resumedMission]) state.coffeeMissionId = resumedMission;
    state.coffeeVariantId = resumeCheckpoint.variantId || resumeCheckpoint.coffee?.variantId || null;
  }
  if (state.selectedScene === 'coffee' && !state.coffeeVariantId && state.coffeeMissionId === 'C04') {
    const variants = coffeeMissionMeta('C04').variants || [];
    state.coffeeVariantId = variants.length ? variants[coffeeMissionProgress.runs % variants.length].id : null;
  }
  state.coffee = state.selectedScene === 'coffee' && typeof Coffee.missionInitial === 'function'
    ? Coffee.missionInitial(state.coffeeMissionId, state.coffeeVariantId)
    : Coffee.initial();
  if (state.selectedScene === 'coffee' && !resumeCheckpoint && reviewTaskId) {
    const tasks = currentSceneConfig().tasks;
    const reviewIndex = tasks.findIndex(task => task.id === reviewTaskId);
    const target = state.coffee?.target || {};
    const reviewSetup = {
      'coffee-order': target.drink || 'latte',
      'coffee-size': target.size || 'small',
      'coffee-service': target.service || 'to-go',
    };
    for (const task of tasks.slice(0, Math.max(0, reviewIndex))) {
      const answer = reviewSetup[task.id];
      if (!answer) continue;
      const result = Coffee.advanceMission(state.coffee, answer);
      if (result?.world) state.coffee = result.world;
    }
  }
  if (state.selectedScene === 'coffee') {
    state.coffeeVariantId = state.coffee?.variantId || state.coffeeVariantId;
    state.coffeeMissionAttempt += 1;
  }
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
  if (resumeCheckpoint?.sceneId === state.selectedScene && !restartCoffeeMission) {
    state.breakfast = resumeCheckpoint.breakfast || Breakfast.initial();
    state.coffee = state.selectedScene === 'coffee' && typeof Coffee.normalizeMissionWorld === 'function'
      ? (Coffee.normalizeMissionWorld(resumeCheckpoint.coffee) || state.coffee)
      : Coffee.normalizeWorld(resumeCheckpoint.coffee);
    state.coffeeMissionId = state.coffee?.missionId || state.coffeeMissionId;
    state.coffeeVariantId = state.coffee?.variantId || state.coffeeVariantId;
    state.coveredGoals = new Set(resumeCheckpoint.coveredGoals || []);
    state.sessionGoals = resumeCheckpoint.goalRecords || {};
  }
  const reviewIndex = reviewTaskId
    ? currentSceneConfig().tasks.findIndex(task => task.id === reviewTaskId)
    : -1;
  const requestedTaskIndex = (restartCoffeeMission ? 0 : resumeCheckpoint?.taskIndex)
    ?? (reviewIndex >= 0 ? reviewIndex : startTaskIndex);
  state.taskIndex = Math.min(currentSceneConfig().tasks.length - 1, Math.max(0, requestedTaskIndex || 0));
  if (restartCoffeeMission) globalThis.LumaExperience?.store?.discardCheckpoint?.({ sessionId: resumeCheckpoint.sessionId });
  globalThis.LumaExperience?.begin(restartCoffeeMission ? null : resumeCheckpoint);
  closeDialogueHistoryPanel();
  renderDialogue();
  startTask(state.taskIndex, { speakAgain });
}

function startScene({ subtitlesHidden = false, skipIntro = false, resumeCheckpoint = null,
  startTaskIndex = 0, reviewTaskId = null, reviewTargetIds = [], reviewItems = [],
  missionId = null, variantId = null, explicitMode = false, encounterChallenge = null } = {}) {
  if (state.selectedScene === 'coffee' && missionId && COFFEE_MISSION_UI[missionId]) {
    selectCoffeeMission(missionId);
    if (variantId) state.coffeeVariantId = variantId;
  }
  scene.dataset.reviewTaskId = reviewTaskId || '';
  scene.dataset.reviewTargetIds = reviewTargetIds.join(',');
  scene.dataset.reviewItemCount = String(reviewItems.length);
  let introSeen = false;
  try { introSeen = localStorage.getItem('luma-intro-v1') === 'seen'; } catch {}
  if (!skipIntro && (!introSeen || state.selectedScene === 'coffee')) {
    showSceneIntroduction({ subtitlesHidden, resumeCheckpoint, startTaskIndex, reviewTaskId,
      reviewTargetIds, reviewItems, missionId, variantId, explicitMode, encounterChallenge }); return;
  }
  hideSceneIntroduction();
  claimExclusiveVoiceSession();
  unlockDuplexPlayback();
  closeSheet();
  clearTimeout(state.completionTimer);
  state.completionTimer = null;
  state.subtitlesHidden = Boolean(subtitlesHidden);
  state.practiceMode = state.subtitlesHidden ? 'listening' : 'guided';
  state.encounterChallenge = encounterChallenge || (state.subtitlesHidden ? 'independent' : 'guided');
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
    resetScene({ speakAgain: true, resumeCheckpoint, startTaskIndex, reviewTaskId });
    if (state.subtitlesHidden) showToast('无字幕练习 · 先听声音，需要时可打开字幕', 3200);
  });
}

function leaveScene({ keepVoice = false } = {}) {
  globalThis.LumaExperience?.checkpoint();
  globalThis.LumaExperience?.closeHelp();
  hideSceneIntroduction();
  breakfastWorld.hidden = true; breakfastPanel.hidden = true;
  globalThis.LumaVisuals?.clear();
  delete scene.dataset.breakfast;
  state.practiceSession += 1;
  state.pendingFeedback.forEach(controller => controller.abort());
  state.pendingFeedback.clear();
  stopVoiceHealthMonitor();
  clearIdleNudge();
  clearReviewTransition();
  clearTaskAdvance();
  clearTimeout(state.promptTimer);
  state.promptTimer = null;
  clearTimeout(state.postActionQuestionTimer);
  state.postActionQuestionTimer = null;
  state.pendingPostActionQuestion = false;
  state.pendingTransitionUtterance = null;
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
  syncHomeProgressState();
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
  globalThis.LumaExperience?.noteAction('tap');
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
  markCoffeeMissionCompleted();
  saveLearningSession();
  syncHomeProgressState();
  globalThis.LumaExperience?.renderReview();
  renderCoffeeMissionResult();
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
    if (state.stage !== 'task-complete' || state.conversationFocus === 'chat' || !experience.classList.contains('is-active')) {
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
    const dwell = DialogueRules.transitionDwell(latestFollowupText(), {
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
  // Background goals may be complete while the learner still wants to talk.
  // The visible End conversation button is the only forward exit in every scene.
}

function completeMultimodalTask({ waitForDuplexReply = false } = {}) {
  if (!taskRequirementsMet() || ['task-complete', 'complete'].includes(state.stage)) return false;
  // Local task evidence owns progress in every scene. An unbounded free-form
  // provider reply must not hold a confirmed answer on the previous step.
  if (!waitForDuplexReply) stopSpeechPlayback();
  const task = currentTask();
  const tasks = currentSceneConfig().tasks;
  const taskCount = tasks.length;
  state.coveredGoals.add(task.id);
  const nextTaskIndex = tasks.findIndex((candidate, index) => index > state.taskIndex && !state.coveredGoals.has(candidate.id));
  const isSceneComplete = nextTaskIndex === -1;
  const completedCount = tasks.filter((candidate) => state.coveredGoals.has(candidate.id)).length;
  state.stage = isSceneComplete ? 'complete' : 'task-complete';
  if (!waitForDuplexReply) {
    flushDeferredVoiceEvents();
    if (!state.duplexSocket) state.deferredVoiceEvents = [];
    flushMicrophoneBuffer();
  }
  const conversationBusy = waitForDuplexReply || isConversationTurnPending();
  if (isSceneComplete) saveLearningSession();
  else globalThis.LumaExperience?.checkpoint(nextTaskIndex);
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
    try { localStorage.setItem('luma-demo-v6-complete', new Date().toISOString()); } catch {}
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
  state.deferredVoiceEvents = [];
  setVoicePhase('idle'); cleanupSpeechCaptureUi();
}

function microphoneWaitsForCharacter() {
  return state.awaitingPrompt || state.duplexSpeaking || state.duplexAcceptAudio || isConversationPlaybackActive();
}

function flushDeferredVoiceEvents() {
  const socket = state.duplexSocket;
  if (!socket || microphoneWaitsForCharacter()) return;
  const events = state.deferredVoiceEvents.splice(0);
  for (const event of events) {
    state.pendingServerTurnContext = event.context;
    socket.onmessage({ data: event.data });
    if (state.pendingServerTurnContext === event.context) state.pendingServerTurnContext = null;
  }
}

function flushMicrophoneBuffer() {
  scene.dataset.micBufferedMs = String(Math.round(microphoneBuffer.bytes / 32));
  // Non-interrupting conversations: capture continuously, but give the voice
  // service the buffered PCM only after the current audible line finishes.
  // This delays overlapping speech's transcript by the remaining line length.
  if (microphoneWaitsForCharacter()) return;
  flushDeferredVoiceEvents();
  if (microphoneWaitsForCharacter()) return;
  const socket = state.duplexSocket;
  if (!state.duplexReady || socket?.readyState !== WebSocket.OPEN || socket.bufferedAmount > 64000) return;
  for (const pcm of microphoneBuffer.take()) {
    socket.send(pcm.buffer);
    scene.dataset.micPackets = String(Number(scene.dataset.micPackets || 0) + 1);
  }
  scene.dataset.micBufferedMs = '0';
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
  fitRecentDialogue();
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
    state.micMuted = true; state.micFailure = 'unavailable'; syncVoiceStatus();
    showToast('当前浏览器无法收音，请检查麦克风权限或换用支持的浏览器。', 4200); return;
  }
  claimExclusiveVoiceSession();
  const generation = ++state.captureGeneration;
  const valid = () => generation === state.captureGeneration && state.sceneStarted && !state.micMuted;
  state.micStarting = true; state.micMuted = false; state.micFailure = null;
  state.voiceConnectionPaused = false; state.duplexFailureCount = 0;
  delete scene.dataset.micErrorName;
  delete scene.dataset.micErrorMessage;
  delete scene.dataset.micFailurePhase;
  let microphoneSetupPhase = 'voice-connection';
  micButton.disabled = true; syncVoiceStatus();
  try {
    connectDuplexSession().catch(() => {});
    microphoneSetupPhase = 'device-request';
    const stream = await getMicrophoneStream(generation);
    if (!stream || !valid()) return;
    disconnectAudioCapture();
    microphoneSetupPhase = 'audio-context';
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
      // Energy can reserve the original question for queued input, but never
      // confirms words, scores an answer, or interrupts the character.
      if (rms > .008) {
        state.lastVoiceEnergyAt = Date.now();
        if (microphoneWaitsForCharacter()) beginLocalSpeechTurn();
      }
      const pcm = resampler.push(input);
      if (!pcm.length) return;
      if (state.bufferOverflow) { flushMicrophoneBuffer(); return; }
      if (!microphoneBuffer.push(pcm)) {
        state.bufferOverflow = true;
        showToast('连接中断太久，这段声音未发完。请等连接恢复后再说一次。', 4500);
        syncVoiceStatus(); return;
      }
      flushMicrophoneBuffer();
    };
    microphoneSetupPhase = 'audio-graph';
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
    microphoneSetupPhase = 'ui-ready';
    micButton.classList.add('is-live'); micButton.classList.remove('is-muted', 'is-held');
    micButton.setAttribute('aria-pressed', 'true'); micButton.setAttribute('aria-label', '关闭麦克风');
    openLearnerTurn(); syncVoiceStatus();
  } catch (error) {
    if (!valid()) return;
    scene.dataset.micErrorName = String(error?.name || 'Error');
    scene.dataset.micErrorMessage = String(error?.message || '').slice(0, 250);
    scene.dataset.micFailurePhase = microphoneSetupPhase;
    state.handsFreeListening = false; state.micMuted = true;
    state.micFailure = error?.name === 'NotAllowedError' ? 'permission' : 'unavailable';
    disconnectAudioCapture(); releaseMicrophoneStream();
    micButton.classList.remove('is-live'); micButton.classList.add('is-muted');
    micButton.setAttribute('aria-pressed', 'false'); micButton.setAttribute('aria-label', '重试麦克风');
    showToast(error?.name === 'NotAllowedError'
      ? '请在浏览器或系统设置中允许麦克风，再点中间按钮重试。'
      : '麦克风暂时不可用。检查设备后，点中间按钮重试。', 5200);
    syncVoiceStatus();
  } finally {
    if (generation === state.captureGeneration) { state.micStarting = false; micButton.disabled = false; }
  }
}

function pauseHandsFreeListening() {
  state.micMuted = true; state.micFailure = null;
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
  if (state.voiceConnectionPaused) {
    state.voiceConnectionPaused = false; state.duplexFailureCount = 0; state.bufferOverflow = false;
    microphoneBuffer.clear(); syncVoiceStatus(); connectDuplexSession().catch(() => {}); return;
  }
  if (state.handsFreeListening || state.micStarting) pauseHandsFreeListening();
  else startHandsFreeListening();
}

function showHint() {
  if (!state.sceneStarted) return;
  if (globalThis.LumaExperience) { globalThis.LumaExperience.openHelp(); return; }
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
coffeeMissionButtons.forEach((button) => button.addEventListener('click', () => selectCoffeeMission(button.dataset.coffeeMission)));
document.querySelectorAll('[data-open-scene]').forEach((button) => button.addEventListener('click', () => {
  if (button.id === 'adventureCta' && globalThis.LumaExperience) globalThis.LumaExperience.startHome();
  else openSheet(button.dataset.openScene, button);
}));
document.querySelector('#chooseCoffeeMission')?.addEventListener('click', () => {
  globalThis.LumaExperience?.startHome({ chooseMission: true });
});
document.querySelectorAll('[data-preview]').forEach((button) => button.addEventListener('click', () => openSheet(button.dataset.preview, button)));
document.querySelectorAll('[data-world-scene]').forEach((button) => button.addEventListener('click', () => {
  openSheet(button.dataset.worldScene, button, button.dataset.worldMission || null);
}));
document.querySelectorAll('[data-close-sheet]').forEach((button) => button.addEventListener('click', closeSheet));
sceneSheet.addEventListener('keydown', trapSheetFocus);
document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => applyFilter(button.dataset.filter)));
document.querySelectorAll('[data-setting]').forEach((button) => button.addEventListener('click', () => handleSetting(button)));
document.querySelector('[data-profile-back]')?.addEventListener('click', () => showView(profileReturnView));
document.querySelectorAll('[data-footprint-tab]').forEach((button) => button.addEventListener('click', () => {
  const selected = button.dataset.footprintTab;
  document.querySelectorAll('[data-footprint-tab]').forEach((item) => {
    const active = item.dataset.footprintTab === selected;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('[data-footprint-panel]').forEach((panel) => { panel.hidden = panel.dataset.footprintPanel !== selected; });
}));
sheetCta.addEventListener('click', () => {
  const selection = sheetSelection;
  if (!selection || !SCENES[selection.sceneId]?.available) return;
  if (selection.missionId && !coffeeMissionIsUnlocked(selection.missionId)) return;
  state.selectedScene = selection.sceneId;
  if (selection.missionId && !selectCoffeeMission(selection.missionId)) return;
  startScene({
    resumeCheckpoint: selection.resumeCheckpoint,
    skipIntro: Boolean(selection.resumeCheckpoint) && selection.sceneId !== 'coffee',
    subtitlesHidden: selection.resumeCheckpoint?.practiceMode === 'listening',
  });
});
exitScene.addEventListener('click', () => {
  if (state.stage === 'complete') showReview();
  else leaveScene();
});
document.querySelector('#finishConversation')?.addEventListener('click', showReview);
resetButton.addEventListener('click', () => {
  if (state.selectedScene === 'coffee') {
    const sessionId = globalThis.LumaExperience?.currentSession?.();
    globalThis.LumaExperience?.store?.discardCheckpoint?.({ sessionId });
  }
  resetScene();
});
subtitleToggle.addEventListener('click', () => { toggleSubtitles(); if (!state.subtitlesHidden) globalThis.LumaExperience?.noteHelp(1, 'subtitles'); });
replayButton.addEventListener('click', () => {
  globalThis.LumaExperience?.noteHelp(1, 'replay');
  speak(latestCharacterText() || state.activeQuestion || currentTask().prompt, { rate: .84, prompt: false });
});
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
  if (globalThis.LumaWorldLoop) { globalThis.LumaExperience?.startRecommendation(); return; }
  if (state.selectedScene !== 'coffee') { globalThis.LumaExperience?.startTransfer({ fromReview: true }); return; }
  const ids = Object.keys(COFFEE_MISSION_UI), next = ids[ids.indexOf(state.coffeeMissionId) + 1];
  if (next && coffeeMissionIsUnlocked(next)) selectCoffeeMission(next);
  else state.coffeeVariantId = null;
  clearTimeout(state.completionTimer); stopSpeechPlayback(); closeDuplexSession();
  reviewScreen.classList.remove('is-active'); reviewScreen.setAttribute('aria-hidden', 'true');
  startScene();
});
document.querySelectorAll('.phrase-cloud button').forEach((button) => button.addEventListener('click', () => speak(button.querySelector('strong').textContent, { rate: .72 })));
window.addEventListener('resize', updateSceneGeometry);
window.addEventListener('orientationchange', () => setTimeout(updateSceneGeometry, 160));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state.sceneStarted || state.micMuted) return;
  state.audioContext?.resume().catch(() => {});
  state.duplexPlayerContext?.resume().catch(() => showToast('声音暂未恢复，可以点重听。'));
  ensureSceneVoiceIsOpen();
  if (!state.duplexReady && !state.duplexConnectPromise) connectDuplexSession().catch(() => {});
});

document.querySelectorAll('i.ph, i.ph-fill').forEach((icon) => icon.setAttribute('aria-hidden', 'true'));
document.querySelectorAll('.filter-chip').forEach((button) => {
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-selected', String(button.classList.contains('is-active')));
});

globalThis.LumaVisuals?.bind({ state: () => state, task: currentTask, scene, image: backgroundPlane, blur: backgroundBlur });
globalThis.LumaExperience?.bind({
  state: () => state, task: currentTask, goal: currentGoalRecord,
  taskCount: () => currentSceneConfig().tasks.length,
  taskIds: () => currentSceneConfig().tasks.map(item => item.id),
  start: (sceneId, options) => {
    if (state.sceneStarted) leaveScene();
    state.selectedScene = sceneId; startScene(options);
  },
  chooseWorld: () => showView('world'),
  preview: (sceneId, missionId = null) => openSheet(sceneId, null, missionId),
  selectCoffeeMission,
  coffeeJourney: () => {
    const nextMissionId = Object.keys(COFFEE_MISSION_UI).find(id => !coffeeMissionProgress.completed.includes(id)) || null;
    return { completed: [...coffeeMissionProgress.completed], nextMissionId,
      nextMissionTitle: nextMissionId ? COFFEE_MISSION_UI[nextMissionId].title : null };
  },
  speak, notify: showAppToast,
  pauseGuidance: clearIdleNudge,
  resumeGuidance: () => {
    if (state.sceneStarted && state.stage === 'active' && !state.micMuted) scheduleIdleNudge();
  },
});
syncSettingsUi();
syncOuterQuestUi();
syncHomeProgressState();
syncLearningUi();
syncA11yState();
primaryCta.disabled = false;
primaryCta.removeAttribute('aria-busy');


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

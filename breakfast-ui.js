const breakfastWorld = document.querySelector('#breakfastWorld');
const breakfastCup = document.querySelector('#breakfastCup');
const cupLanding = document.querySelector('#cupLanding');
const breakfastPanel = document.querySelector('#breakfastPanel');
const breakfastChoices = document.querySelector('#breakfastChoices');
const sceneIntro = document.querySelector('#sceneIntro');
let introOptions = {};
const isBreakfastScene = () => state.selectedScene === 'kitchen' && Breakfast.isTask(currentTask().id);

function showSceneIntroduction(options) {
  globalThis.LumaExperience?.resetIntroduction();
  if (state.sceneStarted) leaveScene();
  else { stopSpeechPlayback(); closeDuplexSession(); }
  clearTimeout(state.completionTimer); state.completionTimer = null;
  reviewScreen.classList.remove('is-active'); reviewScreen.setAttribute('aria-hidden', 'true');
  introOptions = options;
  state.introduction = options;
  closeSheet();
  state.taskIndex = 0;
  configureScene();
  experience.classList.add('is-active');
  experience.setAttribute('aria-hidden', 'false');
  scene.classList.add('is-intro');
  const title = document.querySelector('#introTitle');
  if (state.selectedScene === 'kitchen') title.innerHTML = '<span>帮 <em>Luma</em></span><span>准备早餐</span>';
  else if (state.selectedScene === 'coffee') title.innerHTML = '<span>从一杯咖啡，</span><span>开始攻略生活</span>';
  else title.textContent = SCENES[state.selectedScene].title;
  document.querySelector('.intro-greeting').textContent = state.selectedScene === 'coffee'
    ? '按自己的节奏来，需要帮助随时查看。'
    : options.encounterChallenge === 'transfer' ? '刚才在咖啡店表达过选择，回到家里再试试。' : '不用会很多英语，先试着聊聊。';
  document.querySelector('#introPerson').textContent = state.selectedScene === 'kitchen' ? 'Luma' : state.selectedScene === 'coffee' ? '店员 Mia' : '对方';
  syncCoffeeMissionBoard();
  sceneIntro.hidden = false;
  scene.classList.toggle('is-coffee-intro', state.selectedScene === 'coffee');
  for (const child of scene.children) if (child !== sceneIntro) child.inert = true;
  syncA11yState();
  document.querySelector('#introReady').focus();
}

function hideSceneIntroduction() {
  state.introduction = null;
  sceneIntro.hidden = true;
  scene.classList.remove('is-intro', 'is-coffee-intro');
  for (const child of scene.children) child.inert = false;
}

function syncBreakfastGeometry() {
  if (!isBreakfastScene()) return;
  const rect = scene.getBoundingClientRect();
  const width = backgroundPlane.naturalWidth || 941, height = backgroundPlane.naturalHeight || 1672;
  const scale = Math.min(rect.width / width, rect.height / height);
  Object.assign(breakfastWorld.style, { width: `${width * scale}px`, height: `${height * scale}px`,
    left: `${(rect.width - width * scale) / 2}px`, top: `${(rect.height - height * scale) / 2}px` });
}

function renderBreakfast() {
  const active = isBreakfastScene() && state.sceneStarted;
  breakfastWorld.hidden = !active; breakfastPanel.hidden = !active;
  if (!active) { delete scene.dataset.breakfast; return; }
  const task = currentTask(), world = state.breakfast;
  scene.dataset.breakfast = task.id;
  scene.dataset.drink = world.drink || '';
  scene.dataset.amount = world.amount || '';
  document.querySelector('#breakfastTitle').textContent = task.label;
  document.querySelector('#breakfastSelection').textContent = world.drink ? `你选了${world.drink === 'milk' ? '牛奶' : '水'} · 继续开口就好` : '听完后，直接开口回应';
  document.querySelector('#breakfastAssist').hidden = state.stage !== 'active';
  breakfastChoices.hidden = !state.breakfastHelp || state.stage !== 'active';
  const instruction = document.querySelector('#breakfastInstruction');
  instruction.hidden = !state.breakfastHelp || state.stage !== 'active';
  instruction.textContent = task.hint;
  breakfastChoices.replaceChildren();
  const examples = {
    'breakfast-drink': [['Milk, please.', '牛奶，谢谢。'], ['Water, please.', '水，谢谢。']],
    'breakfast-cup': [['Here you are.', '给你。'], ['Here.', '给你。']],
    'breakfast-more': [['Yes, please.', '再来一点。'], ['No, thanks.', '够了，谢谢。']],
  };
  for (const [english, chinese] of examples[task.id] || []) {
    const example = document.createElement('div'); example.className = 'breakfast-example';
    const strong = document.createElement('strong'), small = document.createElement('small');
    strong.textContent = english; small.textContent = chinese; example.append(strong, small);
    breakfastChoices.append(example);
  }
  breakfastCup.hidden = task.view !== 'table';
  breakfastCup.disabled = true;
  breakfastCup.tabIndex = -1;
  breakfastCup.setAttribute('aria-hidden', 'true');
  const filled = task.id === 'breakfast-more';
  breakfastCup.dataset.drink = filled ? world.drink : '';
  breakfastCup.style.setProperty('--fill', filled ? (world.amount === 'more' ? '72%' : '34%') : '0%');
  breakfastCup.style.left = filled ? '48%' : world.cupPlaced ? '50%' : '76%';
  breakfastCup.style.top = filled ? '58%' : world.cupPlaced ? '43%' : '58%';
  cupLanding.hidden = true;
  document.querySelector('#breakfastOutcome').textContent = world.amount ? (world.amount === 'more' ? '又添了一点。你的饮料准备好了。' : '刚刚好。你的饮料准备好了。') : '';
  syncBreakfastGeometry();
  globalThis.LumaVisuals?.render();
}

function commitBreakfastChoice(choice, { source = 'speech', utterance = '' } = {}) {
  if (!isBreakfastScene() || state.stage !== 'active' || !String(utterance).trim()
    || !['speech', 'voice'].includes(source)) return false;
  const taskId = currentTask().id, next = Breakfast.apply(state.breakfast, taskId, choice);
  if (next === state.breakfast) return false;
  state.breakfast = next;
  state.actionDone = true;
  // A language response changes the scene. It is never reclassified as a physical action.
  if (utterance) {
    state.speechDone = true;
    markGoalSpoken(utterance);
    state.lastTranscript = utterance;
    currentGoalRecord().meaningAccepted = true;
  }
  state.breakfastHelp = false; state.breakfastCupSelected = false;
  clearTimeout(state.toastTimer); toast.classList.remove('is-visible'); toast.textContent = '';
  renderBreakfast(); syncSceneProgress(); updateDuplexTask({ force: true });
  completeMultimodalTask();
  return true;
}

function showBreakfastHelp() {
  state.breakfastHelp = true;
  clearTimeout(state.toastTimer); toast.classList.remove('is-visible');
  renderBreakfast();
}

document.querySelector('#breakfastAssist').addEventListener('click', () => { recordHint(); showBreakfastHelp(); });
document.querySelector('#introReady').addEventListener('click', () => {
  if (document.querySelector('#introRemember').checked) { try { localStorage.setItem('luma-intro-v1', 'seen'); } catch {} }
  const isCoffee = state.selectedScene === 'coffee';
  const missionId = isCoffee ? state.coffeeMissionId : null;
  const savedMissionId = introOptions.resumeCheckpoint?.missionId || introOptions.resumeCheckpoint?.coffee?.missionId;
  const sameMission = isCoffee && missionId === savedMissionId;
  const options = isCoffee ? {
    ...introOptions,
    missionId,
    variantId: state.coffeeVariantId || null,
    resumeCheckpoint: sameMission ? introOptions.resumeCheckpoint : null,
    subtitlesHidden: introOptions.explicitMode && missionId === introOptions.missionId
      ? Boolean(introOptions.subtitlesHidden)
      : missionId === 'C04' || (sameMission && Boolean(introOptions.subtitlesHidden)),
    skipIntro: true,
  } : { ...introOptions, subtitlesHidden: Boolean(introOptions.subtitlesHidden), skipIntro: true };
  if (isCoffee && introOptions.missionId && missionId !== introOptions.missionId) {
    Object.assign(options, { encounterChallenge: options.subtitlesHidden ? 'independent' : 'guided',
      reviewTaskId: null, reviewTargetIds: [], reviewItems: [], startTaskIndex: 0 });
  }
  hideSceneIntroduction(); startScene(options);
});
document.querySelector('#introBack').addEventListener('click', () => { hideSceneIntroduction(); leaveScene(); primaryCta.focus(); });
sceneIntro.addEventListener('keydown', event => {
  if (event.key === 'Escape') { document.querySelector('#introBack').click(); return; }
  if (event.key !== 'Tab') return;
  const focusable=[...sceneIntro.querySelectorAll('button, input')], first=focusable[0], last=focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
backgroundPlane.addEventListener('load', syncBreakfastGeometry);

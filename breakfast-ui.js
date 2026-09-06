const breakfastWorld = document.querySelector('#breakfastWorld');
const breakfastCup = document.querySelector('#breakfastCup');
const cupLanding = document.querySelector('#cupLanding');
const breakfastPanel = document.querySelector('#breakfastPanel');
const breakfastChoices = document.querySelector('#breakfastChoices');
const sceneIntro = document.querySelector('#sceneIntro');
let breakfastDrag = null;
let introOptions = {};
const isBreakfastScene = () => state.selectedScene === 'kitchen' && Breakfast.isTask(currentTask().id);

function showSceneIntroduction(options) {
  if (state.sceneStarted) leaveScene();
  else { stopSpeechPlayback(); closeDuplexSession(); }
  clearTimeout(state.completionTimer); state.completionTimer = null;
  reviewScreen.classList.remove('is-active'); reviewScreen.setAttribute('aria-hidden', 'true');
  introOptions = options;
  closeSheet();
  state.taskIndex = 0;
  configureScene();
  experience.classList.add('is-active');
  experience.setAttribute('aria-hidden', 'false');
  scene.classList.add('is-intro');
  const title = document.querySelector('#introTitle');
  if (state.selectedScene === 'kitchen') title.innerHTML = '<span>帮 <em>Luma</em></span><span>准备早餐</span>';
  else title.textContent = SCENES[state.selectedScene].title;
  document.querySelector('#introPerson').textContent = state.selectedScene === 'kitchen' ? 'Luma' : '对方';
  sceneIntro.hidden = false;
  for (const child of scene.children) if (child !== sceneIntro) child.inert = true;
  syncA11yState();
  document.querySelector('#introReady').focus();
}

function hideSceneIntroduction() {
  sceneIntro.hidden = true;
  scene.classList.remove('is-intro');
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
  const nextImage = task.view === 'fridge' ? './assets/breakfast/fridge.webp' : './assets/breakfast/table.webp';
  if (backgroundPlane.getAttribute('src') !== nextImage) {
    backgroundPlane.src = nextImage; backgroundBlur.src = nextImage;
  }
  scene.dataset.breakfast = task.id;
  scene.dataset.drink = world.drink || '';
  scene.dataset.amount = world.amount || '';
  document.querySelector('#breakfastTitle').textContent = task.label;
  document.querySelector('#breakfastSelection').textContent = world.drink ? `你选了${world.drink === 'milk' ? '牛奶' : '水'}` : '一个词就可以，也可以自由聊天';
  document.querySelector('#breakfastAssist').hidden = state.stage !== 'active';
  breakfastChoices.hidden = !state.breakfastHelp || !task.choices.length || state.stage !== 'active';
  const instruction = document.querySelector('#breakfastInstruction');
  instruction.hidden = !state.breakfastHelp || task.id !== 'breakfast-cup' || state.stage !== 'active';
  instruction.textContent = task.hint;
  breakfastChoices.replaceChildren();
  const labels = { milk: ['Milk', '牛奶'], water: ['Water', '水'], more: ['Yes, please', '再来一点'], enough: ['No, thanks', '够了'] };
  for (const choice of task.choices) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.choice = choice;
    const strong = document.createElement('strong'), small = document.createElement('small');
    strong.textContent = labels[choice][0]; small.textContent = labels[choice][1]; button.append(strong, small);
    button.addEventListener('click', () => commitBreakfastChoice(choice, { source: 'tap' }));
    breakfastChoices.append(button);
  }
  breakfastCup.hidden = task.view !== 'table';
  breakfastCup.disabled = task.id !== 'breakfast-cup' || state.stage !== 'active';
  breakfastCup.setAttribute('aria-pressed', String(state.breakfastCupSelected));
  const filled = task.id === 'breakfast-more';
  breakfastCup.dataset.drink = filled ? world.drink : '';
  breakfastCup.style.setProperty('--fill', filled ? (world.amount === 'more' ? '72%' : '34%') : '0%');
  breakfastCup.style.left = filled ? '48%' : world.cupPlaced ? '50%' : '76%';
  breakfastCup.style.top = filled ? '58%' : world.cupPlaced ? '43%' : '58%';
  breakfastCup.setAttribute('aria-label', filled ? `${world.drink === 'milk' ? '牛奶' : '水'}杯，${world.amount === 'more' ? '七分满' : '少量'}` : '空杯子。拖到 Luma 手边，或点选后递给她');
  cupLanding.hidden = task.id !== 'breakfast-cup' || state.actionDone || !(state.breakfastCupSelected || state.breakfastHelp);
  document.querySelector('#breakfastOutcome').textContent = world.amount ? (world.amount === 'more' ? '又添了一点。你的饮料准备好了。' : '刚刚好。你的饮料准备好了。') : '';
  syncBreakfastGeometry();
}

function commitBreakfastChoice(choice, { source = 'speech', utterance = '' } = {}) {
  if (!isBreakfastScene() || state.stage !== 'active') return false;
  const taskId = currentTask().id, next = Breakfast.apply(state.breakfast, taskId, choice);
  if (next === state.breakfast) return false;
  state.breakfast = next;
  state.actionDone = true;
  // A spoken decision is not counted as a physical action or invented transcript.
  if (source === 'tap' || source === 'drag') currentGoalRecord().acted = true;
  if (utterance) { markGoalSpoken(utterance); state.lastTranscript = utterance; }
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
cupLanding.addEventListener('click', () => commitBreakfastChoice('place', { source: 'tap' }));
breakfastCup.addEventListener('click', () => {
  if (state.stage !== 'active' || currentTask().id !== 'breakfast-cup') return;
  state.breakfastCupSelected = true; state.breakfastHelp = true; renderBreakfast();
});
breakfastCup.addEventListener('pointerdown', event => {
  if (breakfastCup.disabled) return;
  const box = breakfastWorld.getBoundingClientRect();
  breakfastDrag = { id: event.pointerId, box, x: event.clientX, y: event.clientY, moved: false };
  breakfastCup.setPointerCapture(event.pointerId); state.breakfastCupSelected = true; cupLanding.hidden = false;
});
breakfastCup.addEventListener('pointermove', event => {
  if (!breakfastDrag || breakfastDrag.id !== event.pointerId) return;
  const drag = breakfastDrag; drag.moved ||= Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 8;
  if (!drag.moved) return;
  event.preventDefault();
  breakfastCup.style.left = `${Math.max(0, Math.min(100, (event.clientX-drag.box.left)/drag.box.width*100))}%`;
  breakfastCup.style.top = `${Math.max(0, Math.min(100, (event.clientY-drag.box.top)/drag.box.height*100))}%`;
});
function endBreakfastDrag(event) {
  if (!breakfastDrag || breakfastDrag.id !== event.pointerId) return;
  const drag = breakfastDrag; breakfastDrag = null;
  if (event.type !== 'pointercancel' && drag.moved) {
    const x=(event.clientX-drag.box.left)/drag.box.width, y=(event.clientY-drag.box.top)/drag.box.height;
    if (Math.hypot((x-.5)*drag.box.width,(y-.4)*drag.box.height) < Math.max(64,drag.box.width*.2))
      commitBreakfastChoice('place', { source: 'drag' });
  }
  renderBreakfast();
}
breakfastCup.addEventListener('pointerup', endBreakfastDrag);
breakfastCup.addEventListener('pointercancel', endBreakfastDrag);
document.querySelector('#introReady').addEventListener('click', () => {
  if (document.querySelector('#introRemember').checked) localStorage.setItem('luma-intro-v1', 'seen');
  hideSceneIntroduction(); startScene({ ...introOptions, skipIntro: true });
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

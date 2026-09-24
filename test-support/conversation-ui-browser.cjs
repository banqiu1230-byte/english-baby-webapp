// Controlled scene completion fixture: real UI/finish interaction, no provider or real speech.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { resolve, join } = require('node:path');
const output = resolve(__dirname, '../qa-evidence/conversation-ui');
mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 393, height: 754 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__fixture = 'Controlled UI fixture. Microphone/provider not used.';
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Fixture microphone disabled', 'NotAllowedError'); };
    window.WebSocket = class {
      static OPEN = 1; static CLOSED = 3;
      constructor() { this.readyState = 1; this.bufferedAmount = 0; setTimeout(() => { this.onopen?.(); this.onmessage?.({ data: '{"type":"session.created"}' }); }, 10); }
      send() {} close() { this.readyState = 3; }
    };
  });
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.goto(process.env.LUMA_TEST_URL || 'http://127.0.0.1:4174/', { waitUntil: 'networkidle' });
  await page.click('#adventureCta');
  await page.locator('#sceneIntro').waitFor({ state: 'visible' });
  await page.click('#introReady');
  await page.waitForFunction(() => state.sceneStarted && state.stage === 'active');
  await page.waitForFunction(() => document.getElementById('backgroundPlane').naturalWidth > 0);
  await page.evaluate(() => { clearIdleNudge(); stopSpeechPlayback(); clearTimeout(state.toastTimer); toast.classList.remove('is-visible'); });
  async function layout(label, { sceneId = 'coffee', title = 'Mia · 街角咖啡店', viewports = [[320, 568], [393, 754], [1146, 1202]] } = {}) {
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(100);
      const result = await page.evaluate(() => {
        const rect = element => { const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; };
        const scene = rect(document.getElementById('scene'));
        const topbar = rect(document.querySelector('.experience-topbar'));
        const buttons = [...document.querySelectorAll('.experience-topbar > button')].filter(el => getComputedStyle(el).display !== 'none').map(el => ({ id: el.id, ...rect(el) }));
        const status = rect(document.querySelector('.scene-top-status'));
        const slots = rect(document.getElementById('orderSlots'));
        const picture = document.getElementById('backgroundPlane');
        const scale = Math.min(scene.width / picture.naturalWidth, scene.height / picture.naturalHeight);
        const imageTop = scene.top + (scene.height - picture.naturalHeight * scale) / 2;
        // Existing cafe artwork puts Mia's face below 23% of the image.
        // This bound complements screenshot inspection; it is not object detection.
        const faceTop = imageTop + picture.naturalHeight * scale * .23;
        return { scene, topbar, buttons, status, slots, faceTop,
          title: document.getElementById('learningStageLabel').textContent,
          progressHidden: getComputedStyle(document.getElementById('sceneProgress')).display === 'none',
          missionHidden: getComputedStyle(document.getElementById('missionHud')).display === 'none',
          slotsVisible: slots.height > 0, keywords: document.querySelectorAll('#visualCues .visual-cue').length,
          noOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
          noOverlap: buttons.every((r, i) => r.height >= 44 && r.width >= 44 && r.left >= scene.left && r.right <= scene.right && (!i || r.left >= buttons[i-1].right)) && status.left >= buttons[0].right && status.right <= buttons[1].left,
          headroom: Math.max(topbar.bottom, slots.bottom) < faceTop };
      });
      checks.push({ label, sceneId, width, height, ...result });
      assert.equal(result.title, title);
      assert.ok(result.progressHidden && result.missionHidden);
      if (sceneId === 'coffee') assert.ok(result.slotsVisible && result.keywords > 0 && result.headroom,
        JSON.stringify(checks.at(-1)));
      assert.ok(result.noOverflow && result.noOverlap, JSON.stringify(checks.at(-1)));
      if (label.includes('complete')) assert.ok(result.buttons.some(button => button.id === 'finishConversation'),
        'the completed scene exposes its end control inside the measured topbar');
      await page.screenshot({ path: join(output, `fixture-${label}-${width}x${height}.png`) });
    }
  }
  assert.ok(await page.locator('#resetButton').isVisible());
  assert.ok(await page.locator('#finishConversation').isHidden());
  await layout('active');
  await page.evaluate(() => {
    clearTaskAdvance(); clearIdleNudge(); stopSpeechPlayback();
    const ids = ['coffee-order', 'coffee-size', 'coffee-service', 'coffee-thanks'];
    const answers = ['A latte.', 'Small.', 'For here.', 'Thank you.'];
    ids.forEach((id, index) => {
      state.taskIndex = index;
      const goal = goalRecord(id); goal.meaningAccepted = true; goal.spoke = true; goal.language = 'en'; goal.supportLevel = 0;
      LumaExperience.noteAnswer({ evidenceSessionId: LumaExperience.currentSession(), source: 'voice', sceneId: 'coffee', taskId: id, missionId: 'C01', messageId: `fixture-${id}`, answer: answers[index], supportLevel: 0, promptModality: 'audio-text' }, 'success');
      state.coveredGoals.add(id);
    });
    const ordered = Coffee.advanceMission(Coffee.missionInitial('C01'), 'A small latte for here.').world;
    state.coffee = Coffee.advanceMission(ordered, 'Thank you.').world;
    state.stage = 'complete'; state.completed = true; state.sessionSaved = false;
    state.dialogueHistory = [];
    addDialogueMessage('user', 'Thank you.'); addDialogueMessage('luma', 'Enjoy your coffee!', 'Mia');
    syncSceneProgress(); LumaVisuals.render(); scheduleReview();
    state.awaitingModelReply = true; // Keep a live turn open during the layout and manual-exit checks.
    clearTimeout(state.toastTimer); toast.classList.remove('is-visible');
  });
  await page.waitForFunction(() => document.getElementById('backgroundPlane').getAttribute('src').includes('ready'));
  assert.ok(await page.locator('#resetButton').isHidden());
  assert.ok(await page.locator('#finishConversation').isVisible());
  assert.notEqual(await page.evaluate(() => state.reviewTimer), null, 'Completed cafe waits for the live turn before automatic review');
  assert.ok(await page.locator('#reviewScreen').isHidden());
  await layout('complete');
  await page.click('#finishConversation');
  await page.locator('#reviewScreen.is-active').waitFor();
  assert.ok(await page.locator('#experience').isHidden());
  checks.push({ sceneId: 'coffee', finishOpenedReview: true });

  // Start each other supported scene through the real app entry, then seed
  // only learning evidence. The real completion and finish handlers own the
  // visible transition. This never sends learner audio or provider requests.
  for (const fixture of [
    { sceneId: 'kitchen', title: 'Luma · 家中早餐', answer: 'No, thanks.' },
    { sceneId: 'airport', title: '工作人员 · 机场', answer: 'A12.' },
    { sceneId: 'office', title: 'Maya · 初次拜访', answer: 'Nice to meet you, too.' },
  ]) {
    await page.evaluate(({ sceneId }) => {
      state.selectedScene = sceneId;
      startScene({ skipIntro: true });
    }, fixture);
    await page.waitForFunction(sceneId => state.selectedScene === sceneId && state.sceneStarted
      && state.stage === 'active' && state.taskIndex === 0, fixture.sceneId);
    await page.evaluate(({ answer }) => {
      stopVoiceHealthMonitor(); clearTaskAdvance(); clearIdleNudge(); stopSpeechPlayback();
      const tasks = currentSceneConfig().tasks;
      startTask(tasks.length - 1, { speakAgain: false });
      clearIdleNudge(); stopSpeechPlayback();
      if (state.selectedScene === 'kitchen') state.breakfast = { drink: 'milk', cupPlaced: true, amount: 'enough' };
      tasks.forEach((task, index) => {
        const goal = goalRecord(task.id);
        goal.meaningAccepted = true; goal.spoke = task.requiresSpeech !== false;
        goal.language = 'en'; goal.supportLevel = 0;
        if (index < tasks.length - 1) state.coveredGoals.add(task.id);
      });
      state.speechDone = true; state.actionDone = true;
      LumaExperience.noteAnswer({ evidenceSessionId: LumaExperience.currentSession(), source: 'voice',
        sceneId: state.selectedScene, taskId: currentTask().id,
        messageId: `fixture-${state.selectedScene}-complete`, answer, supportLevel: 0,
        promptModality: 'audio-text' }, 'success');
      completeMultimodalTask();
      clearIdleNudge(); stopSpeechPlayback();
      state.dialogueHistory = [];
      addDialogueMessage('user', answer);
      addDialogueMessage('luma', safeCharacterReply(), currentTask().speaker || 'Luma');
      syncSceneProgress(); renderBreakfast(); LumaVisuals.render();
      state.awaitingModelReply = true; // A pending response must postpone automatic review.
      clearTimeout(state.toastTimer); toast.classList.remove('is-visible');
    }, fixture);
    await page.waitForFunction(() => state.stage === 'complete'
      && document.getElementById('backgroundPlane').complete
      && document.getElementById('backgroundPlane').naturalWidth > 0);
    assert.notEqual(await page.evaluate(() => state.reviewTimer), null,
      `${fixture.sceneId} waits for the live response before automatic review`);
    assert.ok(await page.locator('#experience').isVisible());
    assert.ok(await page.locator('#reviewScreen').isHidden());
    assert.ok(await page.locator('#resetButton').isHidden());
    assert.ok(await page.locator('#finishConversation').isVisible());
    assert.ok(await page.locator('#breakfastPanel').isHidden(), 'a hidden task must not cover the character with a breakfast instruction card');
    await layout(`${fixture.sceneId}-complete`, { ...fixture, viewports: [[320, 568], [393, 754]] });
    assert.equal(await page.evaluate(() => state.stage), 'complete');
    assert.ok(await page.locator('#reviewScreen').isHidden(), 'layout changes must not end a live scene');
    await page.click('#finishConversation');
    await page.locator('#reviewScreen.is-active').waitFor();
    assert.ok(await page.locator('#experience').isHidden());
    checks.push({ sceneId: fixture.sceneId, finishOpenedReview: true });
  }
  assert.deepEqual(errors, []);
  writeFileSync(join(output, 'results.json'), JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
  console.log(JSON.stringify({ layouts: checks.filter(check => check.width).length,
    finishOpenedReview: checks.filter(check => check.finishOpenedReview).map(check => check.sceneId), errors, output }));
})().catch(error => { console.error(error); process.exit(1); });

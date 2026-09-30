// Real rendered UI with controlled speech/provider fixtures; this is not an ASR quality test.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve(__dirname, '../qa-evidence/answer-scaffold');
const base = process.env.LUMA_TEST_URL || 'http://127.0.0.1:4174/';
fs.mkdirSync(output, { recursive: true });
const results = [];
const runtimeErrors = [];

async function fixturePage(browser, width, height) {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
  page.on('pageerror', error => runtimeErrors.push({ width, error: error.message }));
  await page.addInitScript(() => {
    window.__micAttempts = 0;
    navigator.mediaDevices.getUserMedia = async () => { window.__micAttempts++; throw new DOMException('Fixture', 'NotAllowedError'); };
    window.WebSocket = class { static OPEN = 1; constructor() { this.readyState = 3; } close() {} send() {} };
  });
  await page.route('**/api/**', route => route.fulfill({ json: { meaning_valid: true, choice: null } }));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    ensureSceneVoiceIsOpen = () => {};
    connectDuplexSession = async () => false;
    window.__speechCalls = [];
    speak = async (text, { prompt = true } = {}) => {
      window.__speechCalls.push({ text, prompt });
      showUnplayedCharacterLine(text, prompt); state.awaitingPrompt = false; openLearnerTurn(); return false;
    };
  });
  return page;
}

async function start(page, sceneId = 'interview', taskIndex = 0, missionId = sceneId === 'interview' ? 'I02' : 'C01') {
  await page.evaluate(({ sceneId, taskIndex, missionId }) => {
    state.selectedScene = sceneId;
    window.__scaffoldOldSession = state.practiceSession;
    startScene({ missionId, skipIntro: true });
    window.__scaffoldTaskIndex = taskIndex;
  }, { sceneId, taskIndex, missionId });
  await page.waitForFunction(() => state.sceneStarted && state.practiceSession > window.__scaffoldOldSession
    && state.stage === 'active' && isCurrentTaskQuestion(state.activeQuestion));
  if (taskIndex) {
    await page.evaluate(index => startTask(index), taskIndex);
    await page.waitForFunction(() => state.taskIndex === window.__scaffoldTaskIndex && state.activeQuestion === currentTask().prompt);
  }
  await page.evaluate(() => { state.micMuted = true; clearIdleNudge(); clearTaskAdvance(); clearReviewTransition(); });
}

async function unchangedEvidence(page) {
  return page.evaluate(() => ({
    question: state.activeQuestion, task: currentTask().id, progress: [...state.coveredGoals],
    xp: LumaExperience.lifeStore.summary().totalXP,
    sessions: LumaExperience.store.getProfile().sessions.filter(item => item.completedAt).length,
    micMuted: state.micMuted,
  }));
}

async function closeHelp(page) {
  await page.locator('#learningHelpPanel [data-learning-help="close"]').click();
  assert.equal(await page.locator('#learningHelpPanel').isVisible(), false);
}

async function assertScaffold(page, expectedSupport = 2) {
  await page.locator('#helpAnswerStarter').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#learningHelpPanel').getAttribute('data-mode'), 'scaffold');
  assert.ok(await page.locator('ol.help-answer-plan li').count() >= 2, 'an optional answer plan is available');
  assert.equal(await page.locator('[data-help-plan]').evaluate(element => element.open), false, 'extra planning stays collapsed initially');
  assert.match(await page.locator('#helpAnswerStarter').innerText(), /\[/, 'starter marks editable personal information');
  assert.equal(await page.locator('.learning-help-options').isVisible(), true, 'alternate help stays one click away');
  assert.equal(await page.locator('.learning-help-options button').count(), 4);
  assert.equal(await page.locator('#learningHelpPanel').getAttribute('role'), 'region');
  assert.equal(await page.locator('#learningHelpPanel').getAttribute('aria-modal'), null);
  assert.equal(await page.locator('#sceneTaskHud #learningHelpPanel').count(), 1);
  assert.equal(await page.locator('#answerCoach, #useAnswerStarter, .learning-help-sheet').count(), 0, 'obsolete overlay and duplicate pinned help are removed');
  assert.equal(await page.locator('#scene [inert]').count(), 0, 'reading help does not disable the conversation');
  if (await page.locator('#taskSegments').isVisible()) {
    const topic = await page.locator('#taskSegments [aria-current=step]').innerText();
    assert.ok((await page.locator('#learningHelpTitle').innerText()).includes(topic), 'help is labelled with the active topic');
  }
  assert.equal(await page.locator('[data-help-example]').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#helpAnswerExample').isVisible(), false, 'full example stays undisclosed initially');
  assert.equal(await page.evaluate(() => LumaExperience.supportLevel()), expectedSupport, 'partial scaffold is recorded separately from a full example');
}

async function currentQuestion(page, question, includeHistory = false) {
  await page.evaluate(({ question, includeHistory }) => {
    if (includeHistory) {
      for (let i = 0; i < 14; i++) {
        const index = addDialogueMessage(i % 2 ? 'luma' : 'user', `History fixture ${i}`, i % 2 ? 'Alex' : '你');
        state.dialogueHistory[index].final = true;
      }
    }
    showUnplayedCharacterLine(question, true);
    state.awaitingPrompt = false; openLearnerTurn(); clearIdleNudge();
  }, { question, includeHistory });
}

function answerFixture(marker) {
  return {
    meaning: `${marker}：说清自己如何作出取舍。`,
    answerPlan: ['说一个你实际考虑过的方案', '解释选择它的一个真实原因'],
    answerStarter: `I chose [my actual option] because [my reason]. ${marker}`,
    model: `I considered [option A] and [option B]. I chose [my option] because [my reason]. ${marker}`,
    note: '把方括号替换为真实经历，不需要编造数据。',
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    for (const [width, height] of [[320, 568], [393, 852], [430, 932]]) {
      const page = await fixturePage(browser, width, height);
      await start(page);
      const before = await unchangedEvidence(page);
      const speechBefore = await page.evaluate(() => window.__speechCalls.length);
      await page.locator('#helpButton').click();
      await assertScaffold(page);
      const geometry = await page.evaluate(() => {
        const rect = id => document.getElementById(id).getBoundingClientRect();
        const panel = rect('learningHelpPanel'), hud = rect('sceneTaskHud');
        const starter = rect('helpAnswerStarter'), content = document.querySelector('.learning-help-scroll').getBoundingClientRect();
        const dialogue = rect('languagePanel'), mic = rect('micButton');
        return {
          starterVisible: starter.top >= content.top - 1 && starter.bottom <= Math.min(content.bottom, innerHeight) + 1,
          panelContained: panel.left >= -1 && panel.right <= innerWidth + 1 && panel.top >= hud.top && panel.bottom <= innerHeight + 1,
          aboveDialogue: panel.bottom <= dialogue.top - 8,
          aboveMicrophone: panel.bottom <= mic.top,
          noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
        };
      });
      assert.deepEqual(geometry, { starterVisible: true, panelContained: true, aboveDialogue: true, aboveMicrophone: true, noHorizontalOverflow: true }, `inline scaffold ${width}px`);
      assert.deepEqual(await unchangedEvidence(page), before, 'viewing help does not alter conversation, mute state, completion or XP');
      assert.equal(await page.evaluate(() => window.__speechCalls.length), speechBefore, 'opening help never speaks an answer automatically');
      await page.screenshot({ path: `${output}/inline-${width}.png` });
      await page.locator('[data-help-plan] summary').click();
      assert.equal(await page.locator('.help-answer-plan').isVisible(), true);
      await page.locator('[data-help-plan] summary').click();
      await page.locator('[data-help-example]').click();
      assert.equal(await page.locator('[data-help-example]').getAttribute('aria-expanded'), 'true');
      assert.equal(await page.locator('#helpAnswerExample').isVisible(), true);
      assert.equal(await page.evaluate(() => LumaExperience.supportLevel()), 3);
      assert.deepEqual(await unchangedEvidence(page), before);
      assert.match(await page.locator('#helpAnswerExample').innerText(), /\[/);
      await closeHelp(page);
      await page.locator('#taskHelpToggle').click();
      await assertScaffold(page, 3);
      await page.locator('#taskHelpToggle').click();
      assert.equal(await page.locator('#learningHelpPanel').isVisible(), false, 'top icon toggles help closed');
      await page.locator('#helpButton').click();
      await page.locator('#helpButton').click();
      assert.equal(await page.locator('#learningHelpPanel').isVisible(), false, 'dock hint toggles help closed');
      await page.locator('#helpButton').click();
      await page.locator('#replayButton').click();
      assert.equal(await page.locator('#learningHelpPanel').isVisible(), true, 'replaying speech leaves readable guidance visible');
      assert.equal(await page.evaluate(() => window.__speechCalls.at(-1).prompt), false);
      await page.locator('#openDialogueHistory').click();
      assert.equal(await page.locator('#dialogueHistory').getAttribute('aria-hidden'), 'false', 'history remains usable while help is showing');
      await page.locator('#closeDialogueHistory').click();
      assert.equal(await page.locator('#learningHelpPanel').isVisible(), true);
      await page.evaluate(() => {
        window.__micClicked = false;
        document.querySelector('#micButton').addEventListener('click', () => { window.__micClicked = true; }, { once: true });
      });
      await page.locator('#micButton').click();
      assert.equal(await page.evaluate(() => window.__micClicked), true, 'the visible microphone receives pointer input while reading');
      assert.equal(await page.locator('#learningHelpPanel').isVisible(), true);
      await page.evaluate(() => LumaExperience.learnerTurnStarted());
      assert.equal(await page.evaluate(() => LumaExperience.isHelpOpen()), false, 'speaking releases the reading pause');
      assert.equal(await page.locator('#learningHelpPanel').isVisible(), true, 'the sentence remains visible to read aloud');
      await page.evaluate(() => startTask(1));
      assert.equal(await page.locator('#learningHelpPanel').isVisible(), false, 'a new task clears previous guidance');
      await page.locator('#helpButton').click();
      await assertScaffold(page);
      await currentQuestion(page, 'What was the most difficult trade-off you made?');
      assert.equal(await page.locator('#learningHelpPanel').isVisible(), false, 'a new actual question clears old guidance');
      await page.evaluate(() => startTask(2));
      await page.locator('#helpButton').click();
      await page.evaluate(() => leaveScene());
      assert.equal(await page.locator('#learningHelpPanel').isVisible(), false, 'leaving the scene clears guidance');
      results.push({ kind: 'responsive-inline-scaffold', width, height, geometry, gradedHelp: true, statePreserved: true, controlsAvailable: true, lifecycle: true });
      let authoredStarters = 0;
      for (const missionId of ['I01', 'I02', 'I03', 'I04', 'I05', 'I06']) {
        await start(page, 'interview', 0, missionId);
        const count = await page.evaluate(() => currentSceneConfig().tasks.length);
        for (let index = 0; index < count; index++) {
          await page.evaluate(value => {
            startTask(value); state.micMuted = true;
            clearIdleNudge(); clearTaskAdvance(); clearReviewTransition();
          }, index);
          await page.locator('#helpButton').click();
          if (await page.locator('#helpAnswerStarter').count()) {
            const layout = await page.evaluate(() => {
              const starter = document.querySelector('#helpAnswerStarter').getBoundingClientRect();
              const scroll = document.querySelector('.learning-help-scroll').getBoundingClientRect();
              const panel = document.querySelector('#learningHelpPanel').getBoundingClientRect();
              const dialogue = document.querySelector('#languagePanel').getBoundingClientRect();
              return { task: currentTask().id, top: starter.top - scroll.top, bottom: scroll.bottom - starter.bottom,
                dialogueGap: dialogue.top - panel.bottom };
            });
            assert.ok(layout.top >= -1 && layout.bottom >= -1, `${width}px full authored starter is immediately readable: ${JSON.stringify(layout)}`);
            assert.ok(layout.dialogueGap >= 8, `${width}px help clears conversation: ${JSON.stringify(layout)}`);
            authoredStarters++;
          }
          await closeHelp(page);
        }
      }
      assert.equal(authoredStarters, 29);
      results.push({ kind: 'all-authored-starters', width, authoredStarters, fullyVisibleWithoutScrolling: true });
      await page.close();
    }

    const page = await fixturePage(browser, 393, 852);
    await start(page);
    await page.evaluate(() => {
      state.dialogueHistory = [];
      const user = addDialogueMessage('user', 'I designed an app for new users.', '你');
      state.dialogueHistory[user].final = true;
      const reply = addDialogueMessage('luma', 'Thanks for explaining.', 'Alex');
      state.dialogueHistory[reply].updatesQuestion = false;
      state.stage = 'task-complete'; state.conversationFocus = 'task';
      state.awaitingPrompt = false; state.awaitingModelReply = false; state.expectedResponse = null;
      scheduleTaskAdvance(1);
    });
    assert.ok(await page.evaluate(() => Boolean(state.advanceTimer)), 'an otherwise quiet completed topic is ready to advance');
    await page.locator('#helpButton').click();
    await page.waitForTimeout(1900);
    assert.equal(await page.evaluate(() => state.taskIndex), 0, 'reading help holds automatic progression beyond the normal dwell');
    await page.evaluate(() => LumaExperience.learnerTurnStarted());
    assert.equal(await page.locator('#learningHelpPanel').isVisible(), true);
    await page.waitForFunction(() => state.taskIndex === 1, null, { timeout: 4000 });
    assert.equal(await page.locator('#learningHelpPanel').isVisible(), false);
    results.push({ kind: 'reading-help-pauses-progression', pausedWhileReading: true, resumesAfterSpeaking: true });

    await start(page, 'coffee');
    await page.locator('#helpButton').click();
    assert.equal(await page.locator('.learning-help-options').isVisible(), true, 'simple coffee tasks retain concise help choices');
    assert.match(await page.locator('#learningHelpContent').innerText(), /latte|americano/i);
    await closeHelp(page);
    await page.evaluate(() => {
      currentSceneConfig().tasks[state.taskIndex].support = {
        responseMode: 'structured', meaning: '测试通用回答支架，不依赖面试场景判断。',
        answerPlan: ['说出自己的选择', '说明一个真实原因'],
        answerStarter: 'I chose [my drink] because [my reason].',
        model: 'I chose [my drink] because [my reason].', note: '只使用真实偏好。',
      };
      state.sessionGoals[currentTask().id].supportLevel = 0;
    });
    await page.locator('#helpButton').click();
    await assertScaffold(page);
    assert.match(await page.locator('#helpAnswerStarter').innerText(), /my drink/);
    await closeHelp(page);
    results.push({ kind: 'shared-task-configuration', coffeeSimpleHelp: true, nonInterviewStructuredSupport: true });

    await start(page);
    const requests = [], held = [];
    let responseMode = 'success';
    await page.route('**/api/conversation-help', async route => {
      requests.push(route.request().postDataJSON());
      if (responseMode === 'hold') { held.push(route); return; }
      if (responseMode === 'failure') { await route.fulfill({ status: 503, json: { error: 'fixture-unavailable' } }); return; }
      await route.fulfill({ json: answerFixture('CURRENT_QUESTION') });
    });
    const liveQuestion = 'Why did you choose that option instead of the simpler flow?';
    await currentQuestion(page, liveQuestion, true);
    const liveBefore = await unchangedEvidence(page);
    await page.locator('#helpButton').click();
    await page.waitForFunction(() => document.querySelector('#helpAnswerStarter')?.textContent.includes('CURRENT_QUESTION'));
    await assertScaffold(page);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].question || requests[0].activeQuestion, liveQuestion, 'help follows the actual question instead of the authored task prompt');
    assert.ok(Array.isArray(requests[0].history) && requests[0].history.length > 0 && requests[0].history.length <= 12);
    assert.ok(requests[0].history.every(item => ['user', 'assistant'].includes(item.role) && typeof item.text === 'string'));
    assert.deepEqual(await unchangedEvidence(page), liveBefore);
    await page.screenshot({ path: `${output}/live-followup.png` });
    await page.locator('.learning-help-options [data-learning-help="example"]').click();
    await page.locator('#helpAnswerExample').waitFor({ state: 'visible' });
    assert.match(await page.locator('#helpAnswerExample').innerText(), /CURRENT_QUESTION/, 'the direct example tab reveals the asynchronously generated actual-question example');
    assert.equal(await page.evaluate(() => LumaExperience.supportLevel()), 3);
    assert.equal(requests.at(-1).question || requests.at(-1).activeQuestion, liveQuestion);
    assert.deepEqual(await unchangedEvidence(page), liveBefore);
    await closeHelp(page);

    responseMode = 'failure';
    await currentQuestion(page, 'How did you handle the disagreement with your partner?');
    await page.locator('#helpButton').click();
    await page.locator('[data-help-retry]').waitFor({ state: 'visible' });
    const failureCopy = await page.locator('#learningHelpContent').innerText();
    assert.doesNotMatch(failureCopy, /The project was for|CURRENT_QUESTION/, 'network fallback must not offer an irrelevant authored answer');
    assert.equal(await page.locator('#helpAnswerStarter').innerText(), 'Let me think for a moment.', 'fallback offers only a safe way to ask for thinking time');
    assert.equal(await page.locator('[data-help-example]').count(), 0, 'failed contextual generation exposes no invented answer');
    responseMode = 'success';
    await page.locator('[data-help-retry]').click();
    await page.waitForFunction(() => document.querySelector('#helpAnswerStarter')?.textContent.includes('CURRENT_QUESTION'));
    await closeHelp(page);

    for (const cancelBy of ['close', 'task-change', 'question-change']) {
      responseMode = 'hold';
      await currentQuestion(page, `Could you clarify this ${cancelBy} fixture?`);
      await page.locator('#helpButton').click();
      await page.waitForFunction(() => document.querySelector('#learningHelpPanel').hidden === false);
      await new Promise((resolve, reject) => {
        const started = Date.now();
        const poll = () => held.length > 0 ? resolve() : Date.now() - started > 3000 ? reject(new Error('no held request')) : setTimeout(poll, 20);
        poll();
      });
      const pending = held.shift();
      assert.ok(pending, 'live followup request is held before cancellation');
      if (cancelBy === 'close') await closeHelp(page);
      else if (cancelBy === 'task-change') await page.evaluate(() => startTask(1));
      else await currentQuestion(page, 'What would you change next time?');
      await pending.fulfill({ json: answerFixture('STALE_RESPONSE') }).catch(() => {});
      await page.waitForTimeout(150);
      assert.equal(await page.locator('#learningHelpPanel').isVisible(), false, `${cancelBy} keeps old help closed`);
      assert.equal(await page.locator('#answerCoach').count(), 0);
      responseMode = 'success';
      await page.locator('#helpButton').click();
      await page.locator('#helpAnswerStarter').waitFor({ state: 'visible' });
      assert.doesNotMatch(await page.locator('#learningHelpContent').innerText(), /STALE_RESPONSE/, `${cancelBy} ignores the stale response`);
      await closeHelp(page);
    }
    results.push({ kind: 'live-question-help', normalizedContext: true, directAsyncExample: true, failureRetry: true, staleRequests: ['close', 'task-change', 'question-change'] });
    await page.close();
    assert.deepEqual(runtimeErrors, [], 'no browser runtime errors');
    console.log(JSON.stringify({ results, output }, null, 2));
  } finally {
    fs.writeFileSync(`${output}/results.json`, JSON.stringify({ results, runtimeErrors }, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

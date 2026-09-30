// Controlled browser fixtures: real UI and evidence plumbing, no real microphone,
// provider, ASR accuracy or learning-outcome claim. Each case uses isolated storage.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { resolve, join } = require('node:path');

const base = process.env.LUMA_TEST_URL || 'http://127.0.0.1:4174/';
const output = resolve(__dirname, '../qa-evidence/world-loop');
mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const checks = [], layouts = [], errors = [], failedResources = [];
  async function fresh(label) {
    const context = await browser.newContext({ viewport: { width: 393, height: 754 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
    page.on('response', response => {
      if (response.status() >= 400) failedResources.push(`${label}: ${response.status()} ${response.url()}`);
    });
    await page.addInitScript(() => {
      window.__fixture = 'Controlled UI/evidence fixture; microphone and provider are mocked';
      window.__micRequests = 0;
      window.__socketRequests = 0;
      navigator.mediaDevices.getUserMedia = async () => {
        window.__micRequests++;
        throw new DOMException('Controlled fixture: real microphone disabled', 'NotAllowedError');
      };
      window.WebSocket = class {
        static OPEN = 1;
        static CLOSED = 3;
        constructor() {
          window.__socketRequests++;
          this.readyState = 1; this.bufferedAmount = 0;
          setTimeout(() => {
            if (this.readyState !== 1) return;
            this.onopen?.();
            this.onmessage?.({ data: '{"type":"session.created"}' });
          }, 10);
        }
        send() {}
        close() { this.readyState = 3; }
      };
    });
    await page.route('**/api/**', route => route.fulfill({ json: { meaning_valid: false, fixture: true } }));
    await page.goto(base, { waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => typeof window.LumaWorldLoop?.plan), 'function', 'World module must load; legacy fallback is not a passing result');
    assert.equal(await page.evaluate(() => typeof window.LumaNavigation?.render), 'function');
    assert.equal(await page.evaluate(() => typeof window.LumaExperience.lifeStore?.complete), 'function');
    assert.equal(await page.evaluate(() => state.activeView), 'world');
    assert.deepEqual(errors, [], 'Each fixture starts without a page error');
    return { page, context };
  }

  async function enterCafe(page, listening = false) {
    await page.click('#adventureCta');
    await page.locator('#sceneIntro').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => window.__micRequests), 0, 'Opening introduction must not request microphone');
    assert.equal(await page.evaluate(() => LumaExperience.store.getProfile().sessions.length), 0, 'Preview must not create evidence session');
    if (listening) await page.evaluate(() => {
      // Controlled independent fixture uses the same explicit-mode options as
      // the real recommendation button (tested separately below).
      introOptions = { ...introOptions, subtitlesHidden: true, explicitMode: true, missionId: 'C01', encounterChallenge: 'independent' };
    });
    await page.click('#introReady');
    await page.waitForFunction(() => state.sceneStarted && state.stage === 'active' && LumaExperience.currentSession());
    assert.equal(await page.evaluate(() => state.coffeeMissionId), 'C01');
  }

  // The acceptance of speech is deliberately controlled here. The result page,
  // planner, persistence and all subsequent navigation are the real app code.
  async function completedCafe(page, assisted = true) {
    await enterCafe(page, !assisted);
    await page.evaluate(assisted => {
      clearTaskAdvance(); clearIdleNudge(); stopSpeechPlayback();
      const ids = ['coffee-order', 'coffee-size', 'coffee-service', 'coffee-thanks'];
      const answers = ['A latte, please.', 'Small, please.', 'For here.', 'Thank you.'];
      for (let index = 0; index < ids.length; index++) {
        state.taskIndex = index;
        const goal = goalRecord(ids[index]);
        goal.meaningAccepted = true; goal.spoke = true; goal.language = 'en';
        goal.supportLevel = assisted && index === 0 ? 3 : 0;
        if (assisted && index === 0) LumaExperience.noteHelp(3, 'example');
        LumaExperience.noteAnswer({
          evidenceSessionId: LumaExperience.currentSession(), source: 'voice',
          sceneId: 'coffee', taskId: ids[index], missionId: 'C01',
          messageId: `fixture-${ids[index]}`, answer: answers[index], supportLevel: goal.supportLevel,
          promptModality: assisted ? 'audio-text' : 'audio',
        }, 'success');
        state.coveredGoals.add(ids[index]);
      }
      state.stage = 'complete';
      state.completed = true;
      state.sessionSaved = false;
      const ordered = Coffee.advanceMission(Coffee.missionInitial('C01'), 'A small latte for here.').world;
      state.coffee = Coffee.advanceMission(ordered, 'Thank you.').world;
      showReview();
    }, assisted);
    await page.locator('#reviewScreen.is-active').waitFor();
    await page.waitForFunction(() => getComputedStyle(document.getElementById('reviewScreen')).opacity === '1');
    const recommendation = await page.evaluate(() => {
      const plan = LumaWorldLoop.plan(LumaExperience.store.getProfile(), { checkpoint: LumaExperience.store.getCheckpoint(), completedMissions: coffeeMissionProgress.completed });
      return { plan, label: document.getElementById('repeatScene').textContent.trim(), title: document.getElementById('reviewTransferTitle').textContent.trim() };
    });
    assert.equal(recommendation.label, recommendation.plan.actionLabel, 'Coffee result renderer must preserve planner CTA');
    assert.equal(recommendation.title, recommendation.plan.title);
    assert.doesNotMatch(recommendation.label, /C02/, 'Linear next-mission label must not overwrite the recommendation');
    return recommendation.plan;
  }

  async function layout(page, label) {
    for (const [width, height] of [[393, 754], [320, 568], [430, 932], [738, 1198]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(120);
      await page.waitForFunction(() => getComputedStyle(document.getElementById('reviewScreen')).opacity === '1');
      const result = await page.evaluate(() => {
        const rect = element => { const r = element.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
        const root = rect(document.getElementById('reviewScreen'));
        const footer = rect(document.querySelector('.world-review-actions'));
        const content = rect(document.querySelector('.review-scroll'));
        const buttons = [...document.querySelectorAll('.world-review-actions button')].filter(button => !button.hidden).map(rect);
        return { root, footer, content, buttons,
          visible: buttons.every(r => r.left >= root.left - 1 && r.right <= root.right + 1 && r.top >= root.top && r.bottom <= root.bottom + 1 && r.bottom <= innerHeight + 1 && r.height >= 44),
          noOverlap: content.bottom <= footer.top + 1 && buttons.every((r, i) => !i || r.top >= buttons[i - 1].bottom - 1),
          noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
        };
      });
      layouts.push({ fixture: label, width, height, ...result });
      assert.ok(result.visible && result.noOverlap && result.noHorizontalOverflow, JSON.stringify(layouts.at(-1)));
      await page.screenshot({ path: join(output, `fixture-${label}-${width}x${height}.png`) });
    }
  }

  async function homeLayout(page, label) {
    for (const [width, height] of [[320, 568], [393, 754]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(120);
      const result = await page.evaluate(() => {
        const cta = document.getElementById('adventureCta').getBoundingClientRect();
        const nav = document.getElementById('bottomNav').getBoundingClientRect();
        const root = document.getElementById('appShell').getBoundingClientRect();
        return { top: cta.top, bottom: cta.bottom, navTop: nav.top, gap: nav.top - cta.bottom, sideMargin: cta.left - root.left,
          visible: cta.top >= root.top && cta.bottom <= nav.top && cta.left >= root.left && cta.right <= root.right + 1 && cta.height >= 44,
          label: document.getElementById('adventureCta').textContent,
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
      });
      layouts.push({ fixture: `home-${label}`, width, height, ...result });
      await page.screenshot({ path: join(output, `fixture-home-${label}-${width}x${height}.png`) });
      assert.ok(result.visible && !result.horizontalOverflow, JSON.stringify(layouts.at(-1)));
      assert.ok(result.gap >= 8, `World CTA must retain breathing room above fixed navigation: ${JSON.stringify(layouts.at(-1))}`);
    }
  }

  try {
    for (const kind of ['fresh', 'resume', 'resume-repair', 'next-mission', 'next-location', 'return']) {
      const { page, context } = await fresh(`home-${kind}`);
      if (kind !== 'fresh') await page.evaluate(kind => {
        const sceneId = kind === 'return' ? 'kitchen' : 'coffee';
        const taskId = sceneId === 'kitchen' ? 'breakfast-drink' : 'coffee-order';
        const store = LumaExperience.store;
        const missionId = sceneId === 'coffee' ? kind === 'resume-repair' ? 'C03' : 'C01' : null;
        const sessionId = store.beginSession({ sceneId, missionId, mode: 'guided', scope: 'life-event' });
        if (kind.startsWith('resume')) store.saveCheckpoint({ sessionId, sceneId, missionId, taskIndex: 0, practiceMode: 'guided' });
        else {
          if (kind === 'next-mission') store.recordExposure({ id: 'home-fixture-help', sessionId, sceneId, taskId, targetId: 'choose-drink', kind: 'keyword' });
          store.recordAttempt({ id: 'home-fixture-answer', sessionId, sceneId, taskId, targetId: 'choose-drink', source: 'voice', language: 'en', outcome: 'success', supportLevel: kind === 'next-mission' ? 2 : 0, conditionsTracked: true, promptModality: 'audio-text' });
          LumaExperience.lifeStore.complete(store.completeSession({ id: sessionId, sceneId }));
          if (kind === 'next-location') for (const missionId of ['C02','C03','C04']) {
            const id = store.beginSession({ sceneId: 'coffee', missionId, scope: 'life-event' });
            LumaExperience.lifeStore.complete(store.completeSession({ id, sceneId: 'coffee' }));
          }
        }
        LumaExperience.render();
      }, kind);
      const next = await page.evaluate(() => LumaExperience.homeStep());
      assert.equal(next.sceneId, kind === 'next-location' ? 'kitchen' : 'coffee');
      assert.equal(next.missionId, kind === 'next-location' ? null : kind === 'next-mission' ? 'C02' : kind === 'resume-repair' ? 'C03' : 'C01');
      assert.equal(next.kind === 'resume', kind.startsWith('resume'));
      assert.equal(await page.locator('#adventureCta').textContent(), kind === 'fresh' ? '开始生活' : '继续生活');
      await homeLayout(page, kind);
      await context.close();
    }
    checks.push('Fresh/resume/next-mission/next-location/return world CTAs share the life resolver and remain above navigation at 320 and 393 widths');
    {
      const { page, context } = await fresh('guided-retry');
      const plan = await completedCafe(page);
      assert.equal(plan.kind, 'retry');
      assert.equal(plan.practiceMode, 'listening');
      assert.equal(plan.missionId, 'C01');
      await layout(page, 'guided-result');
      const sessionsBefore = await page.evaluate(() => LumaExperience.store.getProfile().sessions.length);
      const previousSession = await page.evaluate(() => LumaExperience.currentSession());
      assert.equal(await page.evaluate(() => LumaExperience.lifeStore.summary().totalXP), 30);
      assert.equal(await page.evaluate(() => LumaExperience.homeStep().missionId), 'C02', 'Optional result retry must not replace the next world event');
      await page.click('#repeatScene');
      await page.locator('#sceneIntro').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => LumaExperience.store.getProfile().sessions.length), sessionsBefore);
      await page.click('#introReady');
      await page.waitForFunction(previous => state.sceneStarted && state.practiceMode === 'listening' && state.stage === 'active' && LumaExperience.currentSession() !== previous, previousSession);
      assert.equal(await page.evaluate(() => state.coffeeMissionId), 'C01');
      assert.equal(await page.evaluate(() => state.subtitlesHidden), true, 'Ready button must retain explicit listening retry mode');
      checks.push('Fresh home opens C01 intro without microphone; planner CTA opens C01 listening retry');
      await context.close();
    }
    {
      const { page, context } = await fresh('independent-transfer');
      const plan = await completedCafe(page, false);
      assert.equal(plan.kind, 'transfer');
      assert.equal(plan.sceneId, 'kitchen');
      const before = await page.evaluate(() => ({ session: LumaExperience.currentSession(), count: LumaExperience.store.getProfile().sessions.length, xp: LumaExperience.lifeStore.summary().totalXP, runs: coffeeMissionProgress.runs }));
      await page.evaluate(() => showReview());
      assert.equal(await page.evaluate(() => LumaExperience.store.getProfile().sessions.length), before.count, 'Duplicate review display must not create a session');
      assert.equal(await page.evaluate(() => LumaExperience.lifeStore.summary().totalXP), before.xp);
      assert.equal(await page.evaluate(() => coffeeMissionProgress.runs), before.runs);
      await page.click('#repeatScene');
      await page.locator('#sceneIntro').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => state.selectedScene), 'kitchen');
      await page.click('#introReady');
      await page.waitForFunction(previous => state.sceneStarted && state.selectedScene === 'kitchen' && LumaExperience.currentSession() !== previous, before.session);
      assert.equal(await page.evaluate(() => state.encounterChallenge), 'transfer');
      checks.push('Independent drink choice recommends breakfast; primary button reaches the real transfer scene');
      await context.close();
    }
    for (const helpKind of ['keyword', 'full-example']) {
      const { page, context } = await fresh(`study-${helpKind}`);
      await completedCafe(page);
      const sessionsBefore = await page.evaluate(() => LumaExperience.store.getProfile().sessions.length);
      const previousSession = await page.evaluate(() => LumaExperience.currentSession());
      await page.click('#worldFocus summary');
      if (helpKind === 'full-example') await page.click('#worldFocusReveal');
      await page.waitForFunction(kind => LumaExperience.store.getProfile().exposures.some(event => event.id.includes(':focus:') && event.kind === kind), helpKind);
      assert.equal(await page.evaluate(() => LumaExperience.store.getProfile().sessions.length), sessionsBefore, 'Studying must not create an empty session');
      if (helpKind === 'full-example') await layout(page, 'expanded-study-result');
      await page.click('#worldAlternative');
      await page.locator('#sceneIntro').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => state.selectedScene), 'kitchen');
      assert.equal(await page.evaluate(() => LumaExperience.store.getProfile().sessions.length), sessionsBefore);
      await page.click('#introReady');
      await page.waitForFunction(previous => state.sceneStarted && state.selectedScene === 'kitchen' && currentTask().id === 'breakfast-drink' && LumaExperience.currentSession() !== previous, previousSession);
      const result = await page.evaluate(() => {
        clearTaskAdvance(); clearIdleNudge(); stopSpeechPlayback();
        const id = LumaExperience.currentSession();
        LumaExperience.noteAnswer({ evidenceSessionId: id, source: 'voice', sceneId: 'kitchen', taskId: 'breakfast-drink', messageId: 'fixture-breakfast-answer', answer: 'Milk, please.', supportLevel: 0 }, 'success');
        const profile = LumaExperience.store.getProfile();
        return { attempt: profile.attempts.find(item => item.id === `${id}:fixture-breakfast-answer`), carry: profile.exposures.filter(item => item.sessionId === id && item.id.includes(':carry:')), sessions: profile.sessions.length };
      });
      assert.equal(result.sessions, sessionsBefore + 1);
      assert.ok(result.carry.some(event => event.kind === helpKind));
      assert.equal(result.attempt.productionCondition, 'assisted', 'Result-screen study must carry into matching next-scene capability');
      await page.screenshot({ path: join(output, `fixture-breakfast-after-${helpKind}.png`) });
      checks.push(`${helpKind} study creates no session; alternative enters breakfast and carries help into assisted evidence`);
      await context.close();
    }
    {
      const { page, context } = await fresh('old-breakfast-checkpoint');
      await page.evaluate(() => {
        const store = LumaExperience.store;
        const sessionId = store.beginSession({ sceneId: 'kitchen', mode: 'guided' });
        store.saveCheckpoint({ sessionId, sceneId: 'kitchen', practiceMode: 'guided', taskIndex: 2,
          breakfast: { drink: 'milk', cupPlaced: true, amount: 'more' }, coveredGoals: ['breakfast-drink', 'breakfast-cup'], goalRecords: { 'breakfast-drink': { supportLevel: 3 } } });
        LumaExperience.render();
      });
      assert.equal(await page.locator('#adventureCta').textContent(), '继续生活');
      await page.click('#adventureCta');
      await page.waitForFunction(() => state.sceneStarted && state.selectedScene === 'kitchen' && LumaExperience.currentSession());
      const result = await page.evaluate(() => ({ index: state.taskIndex, breakfast: state.breakfast, covered: [...state.coveredGoals], checkpoint: LumaExperience.store.getCheckpoint(), goals: state.sessionGoals }));
      assert.equal(result.index, 0);
      assert.deepEqual(result.breakfast, { drink: null, cupPlaced: false, amount: null });
      assert.deepEqual(result.covered, []);
      assert.equal(result.checkpoint.taskIndex, 0);
      assert.ok(result.goals['breakfast-drink']?.supportLevel <= 1, 'Prior full-example help must reset; fresh guided subtitles may record level 1');
      checks.push('Old partial breakfast checkpoint restarts at step 0 with fresh world and help state');
      await context.close();
    }
    {
      const { page, context } = await fresh('learning-review-with-pending-life');
      const pending = await page.evaluate(() => {
        const store = LumaExperience.store;
        const airport = store.beginSession({ sceneId: 'airport', scope: 'life-event' });
        store.saveCheckpoint({ sessionId: airport, sceneId: 'airport', taskIndex: 2 });
        const practice = store.beginSession({ sceneId: 'coffee', missionId: 'C01', scope: 'target-practice' });
        store.recordAttempt({ id: 'old-thanks', sessionId: practice, sceneId: 'coffee', missionId: 'C01',
          taskId: 'coffee-thanks', targetId: 'thank-person', source: 'voice', language: 'en', outcome: 'success',
          supportLevel: 2, conditionsTracked: true, promptModality: 'audio-text', utterance: 'Thank you.',
          at: new Date(Date.now()-2*86400000).toISOString() });
        store.completeSession({ id: practice, sceneId: 'coffee' });
        LumaExperience.render(); return airport;
      });
      assert.equal(await page.evaluate(() => LumaExperience.homeStep().sessionId), pending);
      assert.equal(await page.locator('#adventureCta').textContent(), '继续生活');
      assert.equal(await page.evaluate(() => LumaExperience.lifeStore.summary().totalXP), 0);
      await page.click('#bottomNav [data-nav="growth"]');
      await page.click('#startReview');
      await page.locator('#sceneIntro').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => introOptions.reviewTaskId), 'coffee-thanks');
      assert.equal(await page.evaluate(() => state.sessionScope), 'target-practice');
      await page.click('#introReady');
      await page.waitForFunction(() => state.sceneStarted && state.sessionScope === 'target-practice' && currentTask().id === 'coffee-thanks');
      await page.evaluate(() => {
        clearTaskAdvance(); clearIdleNudge(); stopSpeechPlayback();
        const taskId = currentTask().id, goal = goalRecord(taskId);
        goal.meaningAccepted = true; goal.spoke = true; goal.language = 'en'; goal.supportLevel = 0;
        LumaExperience.noteAnswer({ evidenceSessionId: LumaExperience.currentSession(), source: 'voice',
          sceneId: 'coffee', taskId, missionId: 'C01', messageId: 'short-thanks', answer: 'Thank you.', supportLevel: 0 }, 'success');
        state.coffee = Coffee.advanceMission(state.coffee, 'Thank you.').world;
        state.speechDone = true; state.actionDone = true;
        completeMultimodalTask(); showReview();
      });
      await page.locator('#reviewScreen.is-active').waitFor();
      assert.equal(await page.locator('#reviewTitle').textContent(), '这次短练习完成了');
      assert.equal(await page.locator('#lifeReward').isHidden(), true);
      assert.equal(await page.evaluate(() => LumaExperience.lifeStore.summary().totalXP), 0);
      assert.deepEqual(await page.evaluate(() => coffeeMissionProgress.completed), []);
      assert.equal(await page.evaluate(() => LumaExperience.store.getCheckpoint().sessionId), pending);
      assert.equal(await page.evaluate(() => LumaExperience.store.getProfile().sessions.at(-1).scope), 'target-practice');
      await page.click('#finishReview');
      assert.equal(await page.evaluate(() => state.activeView), 'world');
      assert.equal(await page.evaluate(() => LumaExperience.homeStep().sessionId), pending);
      checks.push('Learning review bypasses a pending airport event, completes only one target with no life XP or mission unlock, then world still continues the airport');
      await context.close();
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(failedResources, [], 'New script and assets must load; fallback UI cannot mask a missing resource');
    const result = { passed: true, fixture: 'Controlled UI and evidence only; microphone/WebSocket mocked, no provider calls, no real-device ASR claim', checks, layouts, errors, failedResources, screenshots: output };
    writeFileSync(join(output, 'fixture-results.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

// Controlled UI fixtures only: no real learner records, microphone or paid provider.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const Interview = require('../interview');
const { mkdirSync, writeFileSync } = require('node:fs');
const { resolve, join } = require('node:path');
const output = resolve(__dirname, '../qa-evidence/navigation');
mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const checks = [], errors = [], unexpectedApi = [], expressionRequests = [];
  let responseMode = 'auto', pendingRoute = null;
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__navigationFixture = { label: 'Controlled navigation fixtures, not actual learner evidence', micCalls: 0, spoken: [], expressionAborts: 0 };
    navigator.mediaDevices.getUserMedia = async () => {
      window.__navigationFixture.micCalls++;
      throw new DOMException('Fixture microphone disabled', 'NotAllowedError');
    };
    const fakeSpeech = { cancel() {}, speak(line) { window.__navigationFixture.spoken.push({ text: line.text, lang: line.lang }); }, getVoices() { return []; } };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: fakeSpeech });
    const realFetch = window.fetch.bind(window);
    window.fetch = (url, options) => {
      if (String(url).includes('/api/expression-review')) options?.signal?.addEventListener('abort', () => window.__navigationFixture.expressionAborts++);
      return realFetch(url, options);
    };
  });
  await page.route('**/api/**', async route => {
    if (!route.request().url().includes('/api/expression-review')) {
      unexpectedApi.push(route.request().url());
      return route.fulfill({ status: 503, json: { error: 'fixture_disabled' } });
    }
    expressionRequests.push(route.request().postDataJSON());
    if (responseMode === 'hold') { pendingRoute = route; return; }
    if (responseMode === 'failure') return route.abort('failed');
    const original = route.request().postDataJSON().utterance;
    const result = original === 'I want small latte.' ? { status: 'suggestion', issue: 'grammar', expression: 'I want a small latte.', explanation: '单数饮品前需要冠词 a，保留你的选择。' }
      : original === 'I want a coffee.' ? { status: 'suggestion', issue: 'style', expression: 'I would like a coffee, please.', explanation: '只是一种更礼貌的说法。' }
      : original === 'America?' ? { status: 'unclear', issue: null, expression: '', explanation: '先核对识别。' }
      : { status: 'natural', issue: null, expression: original, explanation: '这句没有语法或用词错误。' };
    return route.fulfill({ json: result });
  });
  try {
    await page.goto(process.env.LUMA_TEST_URL || 'http://127.0.0.1:4174/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.LumaExperience?.lifeStore && window.LumaNavigation);
    const nav = async name => {
      await page.locator(`#bottomNav [data-nav="${name}"]`).click();
      await page.waitForFunction(name => document.querySelector(`.view[data-view="${name}"]`).classList.contains('is-active'), name);
    };
    assert.deepEqual(await page.locator('#bottomNav button').evaluateAll(nodes => nodes.map(n => [n.dataset.nav, n.textContent.trim()])),
      [['world', '世界'], ['growth', '学习'], ['profile', '我的']]);
    assert.ok(await page.locator('.view-world.is-active').isVisible());
    assert.equal(await page.locator('#worldXP').textContent(), '0 / 100 经验');
    checks.push({ kind: 'navigation', default: 'world', tabs: 3 });

    // A completed targeted practice is learning evidence, not a complete world visit.
    const short = await page.evaluate(() => {
      const { store, lifeStore } = LumaExperience;
      const sessionId = store.beginSession({ sceneId: 'airport', scope: 'target-practice' });
      store.recordAttempt({ id: 'fixture-short-airport', sessionId, sceneId: 'airport', taskId: 'bag', targetId: 'confirm-belonging',
        utterance: 'Yes, it is mine.', heardQuestion: 'Is this your bag?', source: 'voice', language: 'en', outcome: 'success',
        supportLevel: 0, conditionsTracked: true });
      const receipt = store.completeSession({ id: sessionId, sceneId: 'airport' });
      const reward = lifeStore.complete(receipt); LumaExperience.render();
      return { reward: reward.accepted, xp: lifeStore.summary().totalXP, sessions: store.summary().completedSessions };
    });
    assert.deepEqual(short, { reward: false, xp: 0, sessions: 1 });
    assert.equal(await page.locator('[data-world-node="airport"]').getAttribute('data-world-state'), 'new');
    assert.equal(await page.locator('#worldToday').textContent(), '今天完成 0 件事');
    await nav('profile');
    assert.equal(await page.locator('#personalCompleted').textContent(), '0');
    assert.equal(await page.locator('#personalEnglish').textContent(), '1');
    assert.equal(await page.locator('#personalBadges .is-earned').count(), 1);
    checks.push({ kind: 'short-practice', learningSessions: 1, events: 0, xp: 0, mapAirport: 'new' });

    const seeded = await page.evaluate(() => {
      const { store, lifeStore } = LumaExperience;
      const add = (sceneId, missionId, lines) => {
        const sessionId = store.beginSession({ sceneId, missionId, scope: 'life-event' });
        for (const [taskId, targetId, utterance] of lines) store.recordAttempt({ id: `fixture-${sceneId}-${taskId}`, sessionId, sceneId, taskId, targetId,
          utterance, heardQuestion: taskId === 'coffee-order' ? 'What would you like?' : 'What would you like next?',
          source: 'voice', language: 'en', outcome: 'success', supportLevel: 0, conditionsTracked: true });
        const receipt = store.completeSession({ id: sessionId, sceneId });
        const first = lifeStore.complete(receipt), duplicate = lifeStore.complete(receipt);
        return { accepted: first.accepted, xp: first.gainedXP, duplicateXP: duplicate.gainedXP };
      };
      const coffee = add('coffee', 'C01', [['coffee-order','choose-drink','I want a small latte.'], ['coffee-size','choose-size','Small, please.'], ['coffee-service','choose-service','For here.'], ['coffee-thanks','thank-person','Thank you.']]);
      const kitchen = add('kitchen', null, [['breakfast-drink','choose-drink','Milk, please.'], ['breakfast-cup','offer-item','Here you are.'], ['breakfast-more','adjust-amount','Enough, thank you.']]);
      LumaExperience.render(); return { coffee, kitchen, summary: lifeStore.summary(), sessions: store.summary().sessionCount };
    });
    assert.equal(seeded.summary.totalXP, 60);
    assert.equal(seeded.coffee.duplicateXP, 0); assert.equal(seeded.kitchen.duplicateXP, 0);
    assert.equal(await page.locator('#personalXP').textContent(), '60');
    assert.equal(await page.locator('#personalCompleted').textContent(), '2');
    assert.equal(await page.locator('#personalEnglish').textContent(), '8');
    assert.equal(await page.locator('#personalBadges .is-earned').count(), 3);
    await page.locator('#personalBadges button').first().click();
    assert.match(await page.locator('#studyDialogContent').textContent(), /已达成.*完整生活事件/);
    await page.locator('#closeStudyDialog').click();
    await nav('world');
    assert.equal(await page.locator('#worldXP').textContent(), '60 / 100 经验');
    assert.equal(await page.locator('[data-world-node="coffee"]').getAttribute('data-world-state'), 'visited');
    assert.equal(await page.locator('[data-world-node="kitchen"]').getAttribute('data-world-state'), 'complete');
    assert.equal(await page.locator('[data-world-node="airport"]').getAttribute('data-world-state'), 'new');
    checks.push({ kind: 'life-events', events: 2, english: 8, xp: 60, badges: 3, duplicateXP: 0 });

    await nav('profile');
    await page.locator('#editProfile').click();
    await page.locator('#profileNameInput').fill('受控测试 · Luma');
    await page.locator('#studyDialogContent button').getByText('保存', { exact: true }).click();
    assert.equal(await page.locator('#profileName').textContent(), '受控测试 · Luma');
    const avatar = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32; const c = canvas.getContext('2d'); c.fillStyle = '#7c64d8'; c.fillRect(0,0,32,32); return canvas.toDataURL('image/png').split(',')[1]; });
    const chooser = page.waitForEvent('filechooser'); await page.locator('#editAvatar').click();
    await (await chooser).setFiles({ name: 'controlled-avatar.png', mimeType: 'image/png', buffer: Buffer.from(avatar, 'base64') });
    await page.waitForFunction(() => document.querySelector('#profileAvatar').src.startsWith('data:image/jpeg'));
    await page.reload({ waitUntil: 'networkidle' });
    await nav('profile');
    assert.equal(await page.locator('#profileName').textContent(), '受控测试 · Luma');
    assert.ok((await page.locator('#profileAvatar').getAttribute('src')).startsWith('data:image/jpeg'));
    assert.equal(await page.locator('#personalXP').textContent(), '60');
    assert.equal(await page.locator('#personalBadges .is-earned').count(), 3);
    checks.push({ kind: 'persistence', nickname: true, uploadedAvatar: true, xp: 60, badges: 3 });

    await nav('growth');
    assert.equal(await page.locator('#sceneDictionary .dictionary-scene').count(), 5);
    let dictionaryCount = 0;
    for (const [label, count, sceneId] of [['街角咖啡店',4,'coffee'],['家中早餐',3,'kitchen'],['机场出行',3,'airport'],['初次见面',4,'office'],['设计师面试',Interview.tasks.length,'interview']]) {
      await nav('growth');
      const before = await page.evaluate(() => ({ sessions: LumaExperience.store.summary().sessionCount, studies: LumaExperience.store.getProfile().studies.length }));
      await page.locator('#sceneDictionary .dictionary-scene').filter({ has: page.getByText(label, { exact: true }) }).click();
      assert.equal(await page.locator('#studyDialog .dictionary-entry').count(), count);
      dictionaryCount += count;
      const entryIndex = sceneId === 'interview' ? Interview.tasks.findIndex(task => task.id === Interview.tasksFor('I04')[1].id) : 0;
      const entry = page.locator('#studyDialog .dictionary-entry').nth(entryIndex);
      await entry.getByRole('button', { name: '听示范', exact: true }).click();
      assert.ok(await page.evaluate(() => __navigationFixture.spoken.at(-1)?.lang === 'en-US'));
      const after = await page.evaluate(() => ({ sessions: LumaExperience.store.summary().sessionCount, studies: LumaExperience.store.getProfile().studies.length }));
      assert.equal(after.sessions, before.sessions); assert.ok(after.studies > before.studies);
      await entry.getByRole('button', { name: '去场景里用', exact: true }).click();
      await page.locator('#sceneSheet[aria-hidden="false"]').waitFor();
      if (sceneId === 'interview') assert.equal(await page.evaluate(() => sheetSelection.missionId), 'I04', 'An interview expression returns to its matching focused drill');
      assert.equal(await page.evaluate(() => __navigationFixture.micCalls), 0);
      await page.locator('#sheetCta').click();
      await page.locator('#sceneIntro').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => state.selectedScene), sceneId);
      if (sceneId === 'interview') assert.equal(await page.evaluate(() => state.interviewMissionId), 'I04');
      assert.equal(await page.evaluate(() => __navigationFixture.micCalls), 0);
      assert.equal(await page.evaluate(() => LumaExperience.store.summary().sessionCount), before.sessions);
      await page.locator('#introBack').click();
    }
    assert.equal(dictionaryCount, 14 + Interview.tasks.length);
    checks.push({ kind: 'dictionary', scenes: 5, expressions: dictionaryCount, previews: 5, interviewReturnMission: 'I04', micCalls: 0, createsSessions: false });

    await nav('world');
    const requestsBeforeWorld = expressionRequests.length;
    await page.evaluate(() => {
      const session = LumaExperience.store.getProfile().sessions.find(s => s.sceneId === 'coffee' && s.scope === 'life-event');
      for (const [index, utterance] of ['For here.', 'I want a coffee.', 'America?', 'I want small latte.'].entries()) {
        LumaExperience.store.recordAttempt({ id: `fixture-expression-${index}`, sessionId: session.id, sceneId: 'coffee', taskId: 'coffee-order', targetId: 'choose-drink',
          utterance, heardQuestion: 'What can I get you?', source: 'voice', language: 'en', outcome: index === 1 ? 'unconfirmed' : 'success', supportLevel: 0, conditionsTracked: true });
      }
      LumaExperience.render();
    });
    await page.waitForTimeout(400);
    assert.equal(expressionRequests.length, requestsBeforeWorld, 'World does not start expression checks');
    await page.reload({ waitUntil: 'networkidle' });
    await nav('growth');
    await page.waitForFunction(() => document.querySelectorAll('#expressionList .expression-item').length === 1);
    await page.waitForFunction(() => !document.querySelector('#expressionList').textContent.includes('正在检查'));
    assert.equal(await page.locator('#expressionList .expression-item p').textContent(), 'I want small latte.');
    assert.doesNotMatch(await page.locator('#expressionList').textContent(), /For here|America|I want a coffee/);
    await page.waitForTimeout(300);
    const afterChecking = expressionRequests.length;
    await nav('profile'); await nav('growth'); await page.waitForTimeout(400);
    assert.equal(expressionRequests.length, afterChecking, 'Tab return uses reviewed cache');
    await page.reload({ waitUntil: 'networkidle' }); await nav('growth'); await page.waitForTimeout(400);
    assert.equal(expressionRequests.length, afterChecking, 'Reload does not pay to recheck cached results');
    checks.push({ kind: 'errors-only', grammar: 1, naturalHidden: true, styleHidden: true, unclearHidden: true, taskRetryIsNotError: true, cacheAcrossReload: true, noWorldRequests: true });

    await page.locator('#expressionList .expression-item button').first().click();
    await page.locator('.study-result').waitFor({ state: 'visible' });
    responseMode = 'failure';
    await page.getByRole('button', { name: '核对原句，重新检查', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '这次没有取得建议' }).waitFor();
    assert.equal(await page.locator('#expressionOriginal').inputValue(), 'I want small latte.');
    assert.ok(await page.getByRole('button', { name: '核对原句，重新检查', exact: true }).isEnabled());
    responseMode = 'auto';
    const sessionCount = await page.evaluate(() => LumaExperience.store.summary().sessionCount);
    await page.getByRole('button', { name: '核对原句，重新检查', exact: true }).click();
    await page.locator('.study-result').waitFor({ state: 'visible' });
    assert.match(await page.locator('.study-result').textContent(), /I want a small latte\./);
    assert.equal(expressionRequests.at(-1).utterance, 'I want small latte.');
    assert.equal(await page.evaluate(() => LumaExperience.store.summary().sessionCount), sessionCount);
    await page.screenshot({ path: join(output, 'expression-success-393.png') });
    const savedReview = await page.evaluate(() => localStorage.getItem('luma-expression-reviews-v2'));
    responseMode = 'hold';
    await page.locator('#expressionOriginal').fill('Original A before editing.');
    await page.getByRole('button', { name: '核对原句，重新检查', exact: true }).click();
    await page.waitForTimeout(50); assert.ok(pendingRoute);
    await page.locator('#expressionOriginal').fill('Edited B while waiting.');
    await pendingRoute.fulfill({ json: { status: 'suggestion', issue: 'grammar', expression: 'OUTDATED A RESULT', explanation: '受控旧原句结果。' } }).catch(() => {});
    pendingRoute = null;
    await page.waitForTimeout(60);
    assert.equal(await page.locator('.study-result').isVisible(), false, 'Editing the original invalidates its in-flight result');
    assert.equal(await page.evaluate(() => localStorage.getItem('luma-expression-reviews-v2')), savedReview);
    await page.locator('#expressionOriginal').fill('I want a large americano.');
    await page.getByRole('button', { name: '核对原句，重新检查', exact: true }).click();
    await page.waitForTimeout(50); assert.ok(pendingRoute);
    const priorAborts = await page.evaluate(() => __navigationFixture.expressionAborts);
    await page.locator('#closeStudyDialog').click();
    await page.waitForFunction(count => __navigationFixture.expressionAborts > count, priorAborts);
    await page.locator('#sceneDictionary .dictionary-scene').first().click();
    await pendingRoute.fulfill({ json: { status: 'suggestion', issue: 'grammar', expression: 'STALE RESPONSE MUST NOT APPEAR', explanation: '受控过期响应。' } }).catch(() => {});
    pendingRoute = null; await page.waitForTimeout(60);
    assert.doesNotMatch(await page.locator('#studyDialogContent').textContent(), /STALE RESPONSE/);
    assert.equal(await page.evaluate(() => localStorage.getItem('luma-expression-reviews-v2')), savedReview);
    await page.locator('#closeStudyDialog').click();
    responseMode = 'auto';
    await page.locator('#expressionList .expression-item button').first().click();
    await page.locator('#expressionOriginal').fill('I want a small latte.');
    await page.getByRole('button', { name: '核对原句，重新检查', exact: true }).click();
    await page.locator('.study-result').filter({ hasText: '已从列表移除' }).waitFor();
    assert.equal(await page.locator('#expressionList .expression-item').count(), 0, JSON.stringify(await page.evaluate(() => ({ text: document.querySelector('#expressionList').textContent, cache: localStorage.getItem('luma-expression-reviews-v2') }))));
    await page.locator('#closeStudyDialog').click();
    checks.push({ kind: 'expression-review', editedOriginal: true, failureRetry: true, trueErrorVisible: true, editInvalidatesPending: true, closesAbort: true, correctEditRemovesCard: true });

    // New unchecked text is never shown as an error; leaving Learning cancels its check.
    await nav('world');
    await page.evaluate(() => {
      const session = LumaExperience.store.getProfile().sessions.find(s => s.sceneId === 'coffee');
      LumaExperience.store.recordAttempt({ id: 'fixture-expression-cancel', sessionId: session.id, sceneId: 'coffee', taskId: 'coffee-order', targetId: 'choose-drink', utterance: 'New unknown phrase.', heardQuestion: 'What next?', source: 'voice', language: 'en', outcome: 'unconfirmed' });
    });
    await page.reload({ waitUntil: 'networkidle' });
    responseMode = 'hold'; await nav('growth');
    await page.waitForFunction(() => document.querySelector('#expressionList').textContent.includes('正在检查'));
    await page.waitForTimeout(80); assert.ok(pendingRoute);
    const cancelBefore = await page.evaluate(() => __navigationFixture.expressionAborts);
    await nav('world');
    await page.waitForFunction(count => __navigationFixture.expressionAborts > count, cancelBefore);
    await pendingRoute.fulfill({ json: { status: 'suggestion', issue: 'grammar', expression: 'Should not become an error.', explanation: '受控过期响应。' } }).catch(() => {});
    pendingRoute = null; responseMode = 'auto';
    assert.equal(await page.locator('#expressionList .expression-item').count(), 0);
    checks.push({ kind: 'background-review-cancel', uncheckedHidden: true, abortOnLeave: true, staleResultIgnored: true });

    // A six-sentence batch must not disable checks after the learner has another conversation.
    await page.evaluate(() => localStorage.removeItem('luma-expression-reviews-v2'));
    await page.reload({ waitUntil: 'networkidle' });
    await nav('growth');
    await page.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem('luma-expression-reviews-v2') || '{}')).length >= 6);
    await nav('world');
    await page.evaluate(() => {
      const session = LumaExperience.store.getProfile().sessions.find(s => s.sceneId === 'coffee');
      LumaExperience.store.recordAttempt({ id: 'fixture-next-conversation', sessionId: session.id, sceneId: 'coffee', taskId: 'coffee-order', targetId: 'choose-drink',
        utterance: 'I want small latte.', heardQuestion: 'A new conversation after the first review batch.', source: 'voice', language: 'en', outcome: 'success' });
      LumaExperience.render();
    });
    await nav('growth');
    await page.waitForFunction(() => Object.entries(JSON.parse(localStorage.getItem('luma-expression-reviews-v2') || '{}'))
      .some(([key, result]) => key.includes('A new conversation after the first review batch.') && result.issue === 'grammar'));
    checks.push({ kind: 'later-conversation-review', worksWithoutReload: true });

    await nav('profile');
    await page.locator('#xpRules').click();
    await page.locator('#studyDialog').waitFor({ state: 'visible' });
    assert.match(await page.locator('#studyDialogContent').textContent(), /20|经验/);
    await page.locator('#closeStudyDialog').click();
    assert.equal(await page.locator('.personal-topbar h1, .learning-notes-header, #notesPracticeFold, #worldEvidenceSection, #personalWeekCount, #personalAchievementCount, .study-section-heading > span').count(), 0);
    checks.push({ kind: 'simplified-ui', inlineExperienceRulesWork: true, redundantModulesRemoved: true });

    for (const [width, height] of [[320,568],[393,852],[430,932]]) {
      await page.setViewportSize({ width, height });
      for (const view of ['world','growth','profile']) {
        await nav(view);
        // Let showView restore its remembered scroll before taking first-screen evidence.
        await page.waitForTimeout(60);
        await page.locator(`.view[data-view="${view}"] .view-scroll`).evaluate(node => node.scrollTop = 0);
        await page.waitForTimeout(80);
        const layout = await page.evaluate(() => {
          const nav = document.querySelector('#bottomNav').getBoundingClientRect(), shell = document.querySelector('#appShell').getBoundingClientRect();
          const active = document.querySelector('.view.is-active .view-scroll');
          return { overflow: document.documentElement.scrollWidth > innerWidth + 1,
            panelOverflow: active.scrollWidth > active.clientWidth + 1,
            scrollTop: active.scrollTop,
            navVisible: nav.height > 0 && nav.top >= shell.top && nav.bottom <= shell.bottom + 1,
            xp: document.querySelector('#worldXP').textContent, personalXP: document.querySelector('#personalXP').textContent };
        });
        assert.ok(!layout.overflow && !layout.panelOverflow && layout.navVisible, JSON.stringify({ width, view, ...layout }));
        assert.equal(layout.scrollTop, 0);
        assert.equal(layout.xp, '60 / 100 经验'); assert.equal(layout.personalXP, '60');
        checks.push({ kind: 'layout', width, height, view, ...layout });
        await page.screenshot({ path: join(output, `${view}-${width}.png`) });
      }
    }
    assert.equal(await page.evaluate(() => __navigationFixture.micCalls), 0);
    assert.deepEqual(unexpectedApi, []); assert.deepEqual(errors, []);
    writeFileSync(join(output, 'results.json'), JSON.stringify({ fixture: 'Controlled fixtures; no live speech or AI evaluation', checks, errors, expressionRequests, unexpectedApi }, null, 2));
    console.log(JSON.stringify({ checks: checks.length, layouts: 9, dictionaryEntries: dictionaryCount, errors, output }));
  } finally {
    await context.close(); await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

// Real UI with controlled dictionary/provider fixtures. No user browser or microphone is used.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.LUMA_TEST_URL || 'http://127.0.0.1:4174/';
const output = path.resolve(__dirname, '../qa-evidence/word-lookup');
fs.mkdirSync(output, { recursive: true });
const results = [], errors = [];

function lookupAnswer(payload) {
  const { text, start, end } = payload;
  const selected = text.slice(start, end);
  const phrase = 'in charge of', phraseStart = text.toLowerCase().indexOf(phrase);
  if (phraseStart >= 0 && start >= phraseStart && start < phraseStart + phrase.length) {
    return { term: text.slice(phraseStart, phraseStart + phrase.length), start: phraseStart, end: phraseStart + phrase.length,
      meaning: '负责；主管', pronunciation: '/ɪn tʃɑːrdʒ əv/', note: '这里指你实际承担的职责。' };
  }
  return { term: selected, start, end,
    meaning: /bank/i.test(selected) ? (/river/i.test(text) ? '河岸' : '银行') : `本句中的「${selected}」`,
    pronunciation: '/test/', note: '结合当前句子理解。' };
}

async function fixturePage(browser, width, height) {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
  const requests = [], held = [];
  const control = { mode: 'success' };
  page.on('pageerror', error => errors.push({ width, message: error.message }));
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Controlled fixture', 'NotAllowedError'); };
    window.WebSocket = class { static OPEN = 1; constructor() { this.readyState = 3; } send() {} close() {} };
    window.__wordSpeech = [];
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; this.lang = ''; } };
    window.speechSynthesis.getVoices = () => [{ name: 'Controlled English', lang: 'en-US', localService: true }];
    window.speechSynthesis.speak = utterance => {
      window.__wordSpeech.push({ text: utterance.text, lang: utterance.lang });
      queueMicrotask(() => { utterance.onstart?.(); utterance.onend?.(); });
    };
    window.speechSynthesis.cancel = () => {};
  });
  await page.route('**/api/**', route => route.fulfill({ json: { meaning_valid: true, choice: null } }));
  await page.route('**/api/word-meaning', async route => {
    const payload = route.request().postDataJSON(); requests.push(payload);
    if (control.mode === 'hold') { held.push({ route, payload }); return; }
    if (control.mode === 'failure') return route.fulfill({ status: 503, json: { error: 'fixture-unavailable' } });
    return route.fulfill({ json: lookupAnswer(payload) });
  });
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
  return { page, requests, held, control };
}

async function start(page, sceneId = 'interview') {
  await page.evaluate(sceneId => {
    window.__oldSession = state.practiceSession;
    state.selectedScene = sceneId;
    startScene({ missionId: sceneId === 'interview' ? 'I01' : sceneId === 'coffee' ? 'C01' : null, skipIntro: true });
  }, sceneId);
  await page.waitForFunction(() => state.sceneStarted && state.stage === 'active' && state.practiceSession > window.__oldSession);
  await page.evaluate(() => {
    state.micMuted = true; clearTaskAdvance(); clearIdleNudge(); clearReviewTransition();
    clearTimeout(state.toastTimer); toast.classList.remove('is-visible');
  });
}

async function currentQuestion(page, text) {
  await page.evaluate(text => {
    showUnplayedCharacterLine(text, true);
    state.awaitingPrompt = false; openLearnerTurn(); clearIdleNudge();
  }, text);
  await page.locator('#recentDialogue .word-token').first().waitFor({ state: 'visible' });
}

async function evidence(page) {
  return page.evaluate(() => ({ question: state.activeQuestion, task: currentTask().id, stage: state.stage,
    progress: [...state.coveredGoals], xp: LumaExperience.lifeStore.summary().totalXP,
    micMuted: state.micMuted, messages: state.dialogueHistory.map(({ id, text }) => ({ id, text })), speech: window.__speechCalls.length }));
}

function token(page, parent, word) {
  return page.locator(`${parent} .word-token`).filter({ hasText: new RegExp(`^${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).first();
}

async function cardLoaded(page, meaning) {
  await page.locator('#wordLookupCard').waitFor({ state: 'visible' });
  await page.waitForFunction(meaning => document.querySelector('#wordLookupMeaning')?.textContent.includes(meaning), meaning, { timeout: 5000 }).catch(async error => {
    console.error('LOOKUP_DIAGNOSTIC', await page.locator('#wordLookupCard').evaluate(card => ({ hidden: card.hidden, text: card.textContent, state: card.dataset.state })));
    throw error;
  });
}

async function closeCard(page) {
  await page.locator('#wordLookupClose').click();
  await page.locator('#wordLookupCard').waitFor({ state: 'hidden' });
}

async function cardBounds(page) {
  return page.evaluate(() => {
    const card = document.querySelector('#wordLookupCard').getBoundingClientRect();
    const close = document.querySelector('#wordLookupClose').getBoundingClientRect();
    return { left: card.left, right: card.right, top: card.top, bottom: card.bottom, width: innerWidth, height: innerHeight,
      closeVisible: close.top >= 0 && close.bottom <= innerHeight && close.left >= 0 && close.right <= innerWidth,
      overflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
}

async function checkBounds(page, context) {
  const bounds = await cardBounds(page);
  assert.ok(bounds.left >= -1 && bounds.right <= bounds.width + 1 && bounds.top >= -1 && bounds.bottom <= bounds.height + 1,
    `${context}: ${JSON.stringify(bounds)}`);
  assert.equal(bounds.closeVisible, true); assert.equal(bounds.overflow, false);
  return bounds;
}

async function nextHeld(held) {
  const started = Date.now();
  while (!held.length) {
    assert.ok(Date.now() - started < 4000, 'a held dictionary request arrived');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return held.shift();
}

async function assertDecorationStable(page, selector) {
  const geometry = await page.locator(selector).evaluate(source => {
    const exact = source.textContent;
    const container = source.closest('p') || source;
    const before = container.getBoundingClientRect();
    const ranges = [...source.querySelectorAll('.word-token')].map(button => ({ text: button.textContent,
      start: Number(button.dataset.start), end: Number(button.dataset.end) }));
    const plain = container.cloneNode(true);
    plain.querySelectorAll('.word-token').forEach(button => button.replaceWith(document.createTextNode(button.textContent)));
    Object.assign(plain.style, { position: 'fixed', top: '0', left: '-10000px', boxSizing: 'border-box', width: `${before.width}px`, visibility: 'hidden' });
    container.parentElement.append(plain);
    const after = plain.getBoundingClientRect();
    plain.remove();
    return { exact, stored: source.dataset.wordText, ranges, before: { width: before.width, height: before.height },
      after: { width: after.width, height: after.height } };
  });
  assert.equal(geometry.stored, geometry.exact, 'decorating preserves source text and whitespace');
  assert.ok(geometry.ranges.length);
  for (const word of geometry.ranges) assert.equal(geometry.exact.slice(word.start, word.end), word.text, 'word ranges refer to the exact source string');
  assert.ok(Math.abs(geometry.before.height - geometry.after.height) <= 1 && Math.abs(geometry.before.width - geometry.after.width) <= 1,
    `word controls do not change line wrapping: ${JSON.stringify(geometry)}`);
  return { exact: geometry.exact, before: geometry.before, after: geometry.after, tokens: geometry.ranges.length };
}

async function assertFilledHelp(page, selector) {
  const result = await page.locator(selector).evaluate(source => {
    const text = source.textContent, ranges = JSON.parse(source.dataset.helpReplacements || '[]');
    return { text, ranges, words: [...source.querySelectorAll('.word-token')].map(button => ({ text: button.textContent,
      start: Number(button.dataset.start), end: Number(button.dataset.end), replaceable: button.classList.contains('is-help-replaceable') })) };
  });
  assert.doesNotMatch(result.text, /\[[^\]]+\]|_{2,}/, 'help is a filled example instead of a fill-in exercise');
  assert.ok(result.ranges.length && result.words.some(word => word.replaceable), 'editable example phrases remain visually marked after tokenization');
  assert.ok(result.words.some(word => !word.replaceable), 'ordinary words retain their normal styling');
  for (const word of result.words) {
    assert.equal(word.replaceable, result.ranges.some(range => word.start < range.end && word.end > range.start),
      `the word ${word.text} is styled only when it intersects an editable phrase`);
    assert.equal(result.text.slice(word.start, word.end), word.text, 'highlight styling preserves lookup offsets');
  }
  return { text: result.text, replaceableWords: result.words.filter(word => word.replaceable).map(word => word.text) };
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    for (const [width, height] of [[320, 568], [393, 852], [430, 932]]) {
      const { page, requests } = await fixturePage(browser, width, height);
      await start(page);
      const question = 'What were you in charge of on that project?';
      await currentQuestion(page, question);
      const plain = await assertDecorationStable(page, '#recentDialogue .dialogue-text');
      const before = await evidence(page);
      const firstToken = page.locator('#recentDialogue .word-token').first();
      await firstToken.focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'were', 'arrow navigation moves within sentence words');
      await page.keyboard.press('ArrowLeft');
      assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'What');
      await token(page, '#recentDialogue', 'charge').click();
      await cardLoaded(page, '负责');
      assert.equal(await page.evaluate(() => LumaWords.isReading()), true, 'reading a word holds idle guidance');
      assert.equal(await page.locator('#wordLookupTerm').innerText(), 'in charge of');
      assert.equal(await page.locator('#wordLookupCard').getAttribute('aria-modal'), null, 'word card is nonmodal');
      assert.equal(await page.locator('#scene [inert]').count(), 0, 'conversation controls remain usable');
      assert.equal(await page.locator('#recentDialogue .is-word-selected').count(), 3, 'a phrase highlights all its constituent words');
      assert.deepEqual(await evidence(page), before, 'lookup must not answer, complete, advance or speak for the learner');
      assert.equal(requests.length, 1);
      assert.equal(requests[0].text, question); assert.equal(requests[0].sceneId, 'interview');
      assert.equal(requests[0].taskId, before.task);
      assert.equal(question.slice(requests[0].start, requests[0].end), 'charge');
      const bounds = await checkBounds(page, `dialogue card ${width}px`);
      await page.screenshot({ path: `${output}/dialogue-${width}.png` });
      await page.locator('#wordLookupPronounce').click();
      await page.waitForFunction(() => window.__wordSpeech.length > 0);
      assert.equal(await page.evaluate(() => window.__wordSpeech.at(-1).text), 'in charge of');
      assert.deepEqual(await evidence(page), before, 'pronunciation is separate from NPC replies and task evidence');
      await page.evaluate(() => LumaWords.learnerTurnStarted());
      assert.equal(await page.evaluate(() => LumaWords.isReading()), false, 'learner speech releases the reading pause');
      assert.equal(await page.locator('#wordLookupCard').isVisible(), false, 'learner speech clears the temporary lookup');
      await token(page, '#recentDialogue', 'charge').click();
      await cardLoaded(page, '负责');
      assert.equal(requests.length, 1, 'the same word and same context reuse the lookup');
      await closeCard(page);
      await page.locator('#openDialogueHistory').click();
      await token(page, '#dialogueHistoryList', 'charge').click();
      await cardLoaded(page, '负责');
      await checkBounds(page, `history card ${width}px`);
      await closeCard(page);
      await page.locator('#closeDialogueHistory').click();
      await page.evaluate(() => startTask(2));
      await page.locator('#helpButton').click();
      await page.locator('#helpAnswerStarter .word-token').first().waitFor({ state: 'visible' });
      const starter = await assertDecorationStable(page, '#helpAnswerStarter');
      const filledStarter = await assertFilledHelp(page, '#helpAnswerStarter');
      const editableStarterWord = page.locator('#helpAnswerStarter .word-token.is-help-replaceable').first();
      const editableStarterText = await editableStarterWord.textContent();
      const starterRequestCount = requests.length;
      await editableStarterWord.click();
      await cardLoaded(page, '本句中的');
      assert.equal(requests.length, starterRequestCount + 1);
      assert.equal(requests.at(-1).text, filledStarter.text, 'a highlighted word is queried in the complete filled sentence');
      assert.equal(requests.at(-1).text.slice(requests.at(-1).start, requests.at(-1).end), editableStarterText);
      assert.ok(await page.locator('#helpAnswerStarter .is-help-replaceable.is-word-selected').count(), 'lookup selection and editable-word styling coexist');
      await checkBounds(page, `starter card ${width}px`);
      await closeCard(page);
      await page.locator('[data-help-example]').click();
      const filledModel = await assertFilledHelp(page, '#helpAnswerExample .help-model-text');
      const modelToken = page.locator('#helpAnswerExample .word-token').first();
      await modelToken.scrollIntoViewIfNeeded();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await modelToken.click();
      await cardLoaded(page, '本句中的');
      await checkBounds(page, `model card ${width}px`);
      await page.screenshot({ path: `${output}/help-${width}.png` });
      const scrollable = await page.locator('.learning-help-scroll').evaluate(scroll => {
        if (scroll.scrollHeight <= scroll.clientHeight) return false;
        scroll.scrollTop = scroll.scrollTop > 0 ? 0 : scroll.scrollHeight;
        return true;
      });
      if (scrollable) await page.locator('#wordLookupCard').waitFor({ state: 'hidden' });
      else await closeCard(page);
      results.push({ kind: 'responsive-surfaces', width, height, plain, starter, filledStarter, filledModel, bounds,
        phrase: true, pronunciation: true, evidenceUnchanged: true });
      await page.close();
    }

    {
      const { page, requests } = await fixturePage(browser, 393, 852);
      await start(page); await page.locator('#helpButton').click();
      const text = '🧑‍💻 I’m responsible for user interviews and research.';
      await page.evaluate(text => {
        const source = document.createElement('p'); source.id = 'replacementRangeFixture';
        const start = text.indexOf('user interviews'), end = start + 'user interviews'.length;
        source.dataset.helpReplacements = JSON.stringify([{ start, end }]);
        const marked = document.createElement('span'); marked.className = 'help-replaceable'; marked.textContent = text.slice(start, end);
        source.append(document.createTextNode(text.slice(0, start)), marked, document.createTextNode(text.slice(end)));
        document.querySelector('#learningHelpContent').replaceChildren(source);
      }, text);
      await page.locator('#replacementRangeFixture .word-token.is-help-replaceable').first().waitFor();
      await assertFilledHelp(page, '#replacementRangeFixture');
      await token(page, '#replacementRangeFixture', 'interviews').click();
      await cardLoaded(page, '本句中的');
      assert.equal(requests.at(-1).text, text, 'Unicode before a highlighted phrase preserves the complete lookup context');
      assert.equal(text.slice(requests.at(-1).start, requests.at(-1).end), 'interviews', 'lookup uses UTF16 string offsets');
      await token(page, '#replacementRangeFixture', 'interviews').focus();
      await page.evaluate(() => {
        const source = document.querySelector('#replacementRangeFixture');
        window.__replacementMutations = 0;
        window.__replacementObserver = new MutationObserver(records => {
          window.__replacementMutations += records.filter(record => record.type === 'childList').length;
        });
        window.__replacementObserver.observe(source, { childList: true, subtree: true });
        const start = source.textContent.indexOf('research');
        source.dataset.helpReplacements = JSON.stringify([
          { start: start + 1, end: start + 3 }, { start: -1, end: 4 },
          { start: '0', end: 3 }, { start: 0, end: source.textContent.length + 1 }, null,
        ]);
      });
      await page.waitForFunction(() => {
        const highlighted = [...document.querySelectorAll('#replacementRangeFixture .is-help-replaceable')];
        return highlighted.length === 1 && highlighted[0].textContent === 'research';
      });
      assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'interviews', 'metadata-only refresh preserves keyboard focus');
      assert.equal(await page.locator('#replacementRangeFixture .is-word-selected').textContent(), 'interviews', 'metadata-only refresh preserves the current lookup selection');
      assert.equal(await page.locator('#wordLookupCard').isVisible(), true);
      assert.equal(requests.length, 1, 'color annotation updates do not repeat a lookup');
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'and', 'keyboard navigation still works after metadata refresh');
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => window.__replacementMutations), 1, 'MutationObserver performs one refresh and then settles');
      await page.evaluate(() => {
        window.__replacementObserver.disconnect();
        document.querySelector('#replacementRangeFixture').dataset.helpReplacements = '{invalid';
      });
      await page.waitForFunction(() => !document.querySelector('#replacementRangeFixture .is-help-replaceable'));
      assert.equal(await page.locator('#replacementRangeFixture').textContent(), text, 'invalid annotations preserve readable source content');
      assert.equal(await page.locator('#wordLookupCard').isVisible(), true, 'invalid annotations cannot disrupt an active word lookup');
      results.push({ kind: 'editable-help-metadata', utf16Offsets: true, overlappingWordHighlight: true,
        metadataOnlyRefresh: true, selectionAndFocusPreserved: true, observerSettles: true, invalidRangesIgnored: true });
      await page.close();
    }

    const { page, requests, held, control } = await fixturePage(browser, 393, 852);
    await start(page);
    for (const [text, meaning] of [['I deposited the money at the bank.', '银行'], ['We walked along the river bank.', '河岸']]) {
      await currentQuestion(page, text); await token(page, '#recentDialogue', 'bank').click();
      await cardLoaded(page, meaning); await closeCard(page);
    }
    assert.equal(requests.length, 2, 'same spelling in different sentences receives distinct contextual meanings');
    results.push({ kind: 'contextual-cache', meanings: ['银行', '河岸'], requests: requests.length });

    control.mode = 'failure';
    await currentQuestion(page, 'Which research method did you choose?');
    await token(page, '#recentDialogue', 'research').click();
    await page.locator('#wordLookupRetry').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#wordLookupCard').getAttribute('data-state'), 'error');
    assert.doesNotMatch(await page.locator('#wordLookupMeaning').innerText(), /银行|河岸|本句中的/, 'failure cannot retain an unrelated previous meaning');
    control.mode = 'success';
    await page.locator('#wordLookupRetry').click();
    await cardLoaded(page, '本句中的'); await closeCard(page);
    results.push({ kind: 'recoverable-error', retry: true });

    control.mode = 'hold';
    await currentQuestion(page, 'Could you explain your design decision?');
    await token(page, '#recentDialogue', 'design').click();
    const stale = await nextHeld(held);
    assert.equal(await page.locator('#wordLookupCard').getAttribute('data-state'), 'loading');
    assert.equal(await page.locator('#wordLookupCard').getAttribute('aria-busy'), 'true');
    assert.equal(await page.locator('#wordLookupPronounce').isDisabled(), true);
    await token(page, '#recentDialogue', 'decision').click();
    const latest = await nextHeld(held);
    await latest.route.fulfill({ json: lookupAnswer(latest.payload) });
    await cardLoaded(page, 'decision');
    await stale.route.fulfill({ json: lookupAnswer(stale.payload) }).catch(() => {});
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#wordLookupTerm').innerText(), 'decision', 'late response must not replace a newer selected word');
    await closeCard(page);
    for (const cancel of ['close', 'question', 'task', 'leave']) {
      if (cancel === 'leave') await start(page);
      await currentQuestion(page, `This is the ${cancel} cancellation fixture.`);
      await token(page, '#recentDialogue', 'fixture').click();
      const request = await nextHeld(held);
      if (cancel === 'close') await closeCard(page);
      if (cancel === 'question') await currentQuestion(page, 'What would you do differently next time?');
      if (cancel === 'task') await page.evaluate(() => startTask(1));
      if (cancel === 'leave') await page.evaluate(() => leaveScene());
      await request.route.fulfill({ json: lookupAnswer(request.payload) }).catch(() => {});
      await page.waitForTimeout(100);
      assert.equal(await page.locator('#wordLookupCard').isVisible(), false, `${cancel} clears stale lookup`);
    }
    results.push({ kind: 'async-lifecycle', lastSelectionWins: true, cancelBy: ['close', 'question', 'task', 'leave'] });
    control.mode = 'success';
    for (const sceneId of ['coffee', 'kitchen', 'airport', 'office']) {
      await start(page, sceneId);
      await currentQuestion(page, `Would you like to explore this ${sceneId} scene?`);
      const before = await evidence(page);
      await token(page, '#recentDialogue', 'explore').click();
      await cardLoaded(page, '本句中的');
      assert.deepEqual(await evidence(page), before, `${sceneId} shares lookup without dialogue mutations`);
      await closeCard(page);
    }
    results.push({ kind: 'shared-scene-behavior', scenes: ['coffee', 'kitchen', 'airport', 'office'] });
    await page.evaluate(() => {
      const index = addDialogueMessage('user', 'I would like some clarification.', '你');
      state.dialogueHistory[index].final = true; renderDialogue();
    });
    const userBefore = await evidence(page);
    await token(page, '#recentDialogue .is-user', 'clarification').click();
    await cardLoaded(page, '本句中的');
    assert.deepEqual(await evidence(page), userBefore, 'lookup on a learner transcript cannot change the recognized text or evidence');
    await closeCard(page);
    results.push({ kind: 'learner-transcript', exactRecognizedTextPreserved: true });

    // Advance the real caption revealer with an explicit audio clock. The full
    // known spoken sentence must remain the dictionary context as words appear.
    await start(page);
    const streamingText = 'What were you in charge of on the new accessibility project, and how did you decide which changes mattered most?';
    const prefixA = 'What were you in char';
    const prefixB = 'What were you in charge of on the';
    const prefixC = 'What were you in charge of on the new accessibility project, and';
    const revealPrefix = async prefix => {
      await page.evaluate(count => {
        state.duplexPlayerContext.currentTime = 100 + (count + .25) / 14;
      }, prefix.length);
      await page.waitForFunction(prefix => document.querySelector('#recentDialogue .dialogue-text')?.textContent === prefix, prefix);
    };
    await page.evaluate(({ text, count }) => {
      clearCharacterCaptionReveal(); state.dialogueHistory = []; renderDialogue();
      state.duplexPlayerContext = { currentTime: 100 + (count + .25) / 14 };
      state.duplexOutputDone = false; state.duplexNextPlayTime = 120;
      beginCharacterCaptionReveal(text); state.captionAudioStart = 100;
    }, { text: streamingText, count: prefixA.length });
    await page.waitForFunction(prefix => document.querySelector('#recentDialogue .dialogue-text')?.textContent === prefix, prefixA);
    assert.equal(await token(page, '#recentDialogue', 'char').count(), 0, 'an unfinished streaming word is plain text until complete');
    await revealPrefix(prefixB);
    control.mode = 'hold';
    const requestsBeforeStreaming = requests.length;
    await token(page, '#recentDialogue', 'charge').click();
    const streamingLookup = await nextHeld(held);
    assert.equal(streamingLookup.payload.text, streamingText, 'a visible streaming word is looked up in the full known spoken sentence');
    assert.equal(streamingLookup.payload.text.slice(streamingLookup.payload.start, streamingLookup.payload.end), 'charge');
    await revealPrefix(prefixC);
    assert.equal(await page.locator('#wordLookupCard').isVisible(), true, 'caption append keeps the loading word card open');
    assert.equal(await page.locator('#wordLookupCard').getAttribute('data-state'), 'loading');
    assert.equal(requests.length, requestsBeforeStreaming + 1, 'caption append does not restart the contextual request');
    await streamingLookup.route.fulfill({ json: lookupAnswer(streamingLookup.payload) });
    await cardLoaded(page, '负责');
    assert.equal(await page.locator('#recentDialogue .is-word-selected').count(), 3, 'phrase selection survives rebinding to appended caption tokens');
    await page.evaluate(() => clearCharacterCaptionReveal({ complete: true }));
    await page.waitForFunction(text => document.querySelector('#recentDialogue .dialogue-text')?.textContent === text, streamingText);
    assert.equal(await page.locator('#wordLookupCard').isVisible(), true, 'finishing the same caption keeps its word card');
    assert.equal(requests.length, requestsBeforeStreaming + 1, 'finishing the caption preserves the original request snapshot');
    await page.evaluate(() => beginCharacterCaptionReveal('Could you clarify the responsibility you just described?'));
    assert.equal(await page.locator('#wordLookupCard').isVisible(), false, 'an actual new spoken question closes the old lookup');
    await page.evaluate(() => {
      clearCharacterCaptionReveal({ complete: true });
      state.duplexPlayerContext = null; state.duplexNextPlayTime = 0; state.duplexOutputDone = true;
    });
    control.mode = 'success';
    await currentQuestion(page, 'Could you explain the research decision?');
    await token(page, '#recentDialogue', 'research').click();
    await cardLoaded(page, '本句中的');
    await page.evaluate(() => {
      state.dialogueHistory.findLast(message => message.speaker === 'luma').text = 'Could you explain the design decision?';
      renderDialogue();
    });
    await page.locator('#wordLookupCard').waitFor({ state: 'hidden' });
    results.push({ kind: 'streaming-captions', realCaptionRevealer: true, partialWordNotClickable: true,
      fullSentenceContext: true, appendKeepsCardAndRequest: true, completionKeepsCard: true,
      newQuestionCloses: true, sourceCorrectionCloses: true });
    await page.close();
    assert.deepEqual(errors, [], 'no browser runtime errors');
    console.log(JSON.stringify({ results, output }, null, 2));
  } finally {
    fs.writeFileSync(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

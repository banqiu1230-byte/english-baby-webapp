// Rendered integration checks. Voice/provider responses are controlled fixtures, not a microphone quality test.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const output = '/tmp/luma-interview-browser'; fs.mkdirSync(output, { recursive: true });
const base = process.env.LUMA_TEST_URL || 'http://127.0.0.1:4174/';
const hudHeights = new WeakMap();
const nextPaint = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function assertProgress(page, completed, total) {
 const progress = page.locator('#sceneProgress');
 assert.ok(await progress.isVisible(), 'task progress is visible in the conversation topbar');
 assert.equal(await progress.getAttribute('aria-valuenow'), String(completed));
 assert.equal(await progress.getAttribute('aria-valuemax'), String(total), JSON.stringify(await page.evaluate(()=>({
  mission:state.interviewMissionId,scope:state.sessionScope,task:currentTask().id,
  tasks:currentSceneConfig().tasks.map(task=>task.id),progress:document.querySelector('#sceneProgress').outerHTML,
 }))));
 assert.equal(await page.locator('#sceneProgressCount').innerText(), `${completed} / ${total}`);
 const fill = await page.locator('#stepFill').evaluate(element => parseFloat(element.style.width));
 assert.ok(Math.abs(fill - completed / total * 100) < .001, 'progress fill matches completed topics');
 assert.ok(await page.locator('#sceneTaskHud').isVisible(), 'the coffee-style task card is visible in the interview');
 assert.ok(await page.locator('#taskSegments').isVisible(), 'topic segments are visible');
 assert.equal(await page.locator('#orderSlots').isVisible(), false, 'interview does not show coffee order facts');
 await nextPaint(page); // The current topic is scrolled into view on the next animation frame.
 const hud = await page.evaluate(() => {
  const card = document.querySelector('#sceneTaskHud'), row = document.querySelector('#taskSegments');
  const topics = currentSceneConfig().tasks.filter(item => state.sessionScope !== 'target-practice' || item.id === state.reviewTaskId);
  const active = currentTask(), items = [...row.children];
  const rect = card.getBoundingClientRect(), sceneRect = document.querySelector('#scene').getBoundingClientRect();
  const rowRect = row.getBoundingClientRect(), activeRect = row.querySelector('[aria-current="step"]').getBoundingClientRect();
  return {
   title: document.querySelector('#missionHudTitle').textContent,
   expectedTitle: state.sessionScope === 'target-practice' ? active.label : Interview.getMission(state.interviewMissionId).title,
   ids: items.map(item => item.dataset.taskId), expectedIds: topics.map(item => item.id),
   labels: items.map(item => item.textContent), expectedLabels: topics.map(item => item.progressLabel),
   completed: items.filter(item => item.classList.contains('is-filled')).map(item => item.dataset.taskId),
   expectedCompleted: topics.filter(item => state.coveredGoals.has(item.id)).map(item => item.id),
   current: items.filter(item => item.getAttribute('aria-current') === 'step').map(item => item.dataset.taskId),
   currentClass: items.filter(item => item.classList.contains('is-current')).map(item => item.dataset.taskId),
   expectedCurrent: active.id,
   inBounds: rect.left >= sceneRect.left && rect.right <= sceneRect.right && rect.top >= sceneRect.top && rect.bottom <= sceneRect.bottom,
   activeVisible: activeRect.left >= rowRect.left - 1 && activeRect.right <= rowRect.right + 1,
   rows: new Set(items.map(item => item.getBoundingClientRect().top)).size,
   height: rect.height, rowHeight: rowRect.height,
  };
 });
 assert.equal(hud.title, hud.expectedTitle, 'task card title matches the mission or focused practice');
 assert.equal(hud.ids.length, total);
 assert.deepEqual(hud.ids, hud.expectedIds, 'task card shows exactly the current practice scope');
 assert.deepEqual(hud.labels, hud.expectedLabels, 'task card uses the authored compact topic labels');
 assert.equal(hud.completed.length, completed);
 assert.deepEqual(hud.completed, hud.expectedCompleted, 'only accepted goals have filled segments');
 assert.deepEqual(hud.current, [hud.expectedCurrent]);
 assert.deepEqual(hud.currentClass, [hud.expectedCurrent]);
 assert.ok(hud.inBounds, 'task card stays inside the mobile scene');
 assert.ok(hud.activeVisible, 'the active topic is visible after opening or changing tasks');
 assert.equal(hud.rows, 1, 'topic count never turns the card into multiple rows');
 if (!hudHeights.has(page)) hudHeights.set(page, hud.height);
 assert.ok(Math.abs(hud.height - hudHeights.get(page)) < 1, 'task card height stays fixed across skip, resume, and single-topic review');
}
(async () => {
 const browser = await chromium.launch({ headless: true, channel: 'chrome' });
 const results = [];
 try {
  for (const [width,height] of [[320,568],[393,852],[430,932]]) {
   const page = await browser.newPage({ viewport:{width,height}, reducedMotion:'reduce' });
   const errors = []; page.on('pageerror', e => errors.push(e.message));
   await page.addInitScript(() => {
    window.__mic = 0; navigator.mediaDevices.getUserMedia = async () => { window.__mic++; throw new DOMException('Fixture', 'NotAllowedError'); };
    window.WebSocket = class { static OPEN=1; constructor(){this.readyState=3;} close(){} send(){} };
   });
   await page.route('**/api/**', route => route.fulfill({json:{meaning_valid:true,choice:null}}));
   await page.goto(base, {waitUntil:'networkidle'});
   await page.locator('#allWorldPlaces').click();
   await page.locator('[data-place-select="interview"]').click();
   await page.locator('#sceneSheet.is-open').waitFor();
   const preview = await page.evaluate(() => {
    const b = document.querySelector('#sheetCta').getBoundingClientRect(), t = document.querySelector('#sheetTitle').getBoundingClientRect();
    const copy = document.querySelector('.sheet-copy').getBoundingClientRect();
    return {ctaVisible:b.top>=0 && b.bottom<=innerHeight+1, titleVisible:t.top>=copy.top && t.bottom<=copy.bottom, mic:__mic};
   });
   assert.deepEqual(preview,{ctaVisible:true,titleVisible:true,mic:0});
   await page.screenshot({path:`${output}/preview-${width}.png`});
   for (const missionId of ['I01','I02','I03','I04','I05','I06','I07']) {
    await page.locator(`[data-world-event="${missionId}"]`).click();
    await page.locator('#sheetCta').click();
    await page.locator('#sceneIntro:not([hidden])').waitFor();
    const brief = await page.evaluate(() => {
     const mission=Interview.getMission(state.interviewMissionId), button=document.querySelector('#introReady').getBoundingClientRect();
     return {id:mission.id,count:document.querySelectorAll('#interviewTopics li').length,expected:mission.taskIds.length,
      title:document.querySelector('#introTitle').textContent,expectedTitle:mission.title,cta:button.top>=0&&button.bottom<=innerHeight+1,mic:__mic};
    });
    assert.equal(brief.id,missionId); assert.equal(brief.count,brief.expected); assert.equal(brief.title,brief.expectedTitle); assert.ok(brief.cta);assert.equal(brief.mic,0);
    if (missionId==='I07') await page.screenshot({path:`${output}/full-brief-${width}.png`});
    await page.locator('#introBack').click();
    await page.evaluate(id=>LumaExperience.previewScene('interview',id),missionId);
   }
   // Exercise actual app rendering and learning integration with deterministic speech output.
   await page.evaluate(() => {
    ensureSceneVoiceIsOpen=()=>{}; connectDuplexSession=async()=>false;
    speak=async(text,{prompt=true}={})=>{showUnplayedCharacterLine(text,prompt);state.awaitingPrompt=false;openLearnerTurn();return false;};
    LumaExperience.previewScene('interview','I02');
   });
   await page.locator('#sheetCta').click(); await page.locator('#introReady').click();
   await page.waitForFunction(()=>state.sceneStarted && currentTask().id==='interview-case-problem'
    && state.stage==='active' && state.activeQuestion===currentTask().prompt);
   await assertProgress(page, 0, 6);
   await page.screenshot({path:`${output}/conversation-${width}.png`});
   assert.match(await page.locator('#learningStageLabel').innerText(), /Alex/);
   assert.equal(await page.locator('#backgroundPlane').evaluate(async i=>{await i.decode();return i.naturalWidth}),1086);
   await page.locator('#helpButton').click();
   assert.match(await page.locator('#learningHelpContent').innerText(), /问题|用户/);
   assert.ok(await page.locator('#helpAnswerStarter').isVisible(), 'one click reveals a usable sentence starter');
   await page.locator('[data-help-example]').click();
   assert.match(await page.locator('#learningHelpContent').innerText(), /\[/, 'Example uses placeholders instead of invented candidate claims');
   await page.screenshot({path:`${output}/help-${width}.png`});
   await page.locator('#skipInterviewTopic').click();
   assert.equal(await page.evaluate(()=>state.taskIndex),1); assert.equal(await page.evaluate(()=>state.coveredGoals.size),0);
   await assertProgress(page, 0, 6);
   await page.locator('#helpButton').click(); await page.locator('#endInterviewPractice').click();
   assert.equal(await page.evaluate(()=>state.sceneStarted),false);
   assert.equal(await page.evaluate(()=>LumaExperience.store.getProfile().sessions.filter(x=>x.completedAt).length),0);
   // Start a fresh section and send semantically accepted fixture answers through the application boundary.
   await page.evaluate(()=>{state.selectedScene='interview';startScene({missionId:'I01',skipIntro:true});});
   await page.waitForFunction(()=>state.sceneStarted&&state.interviewMissionId==='I01'&&state.taskIndex===0);
   await assertProgress(page, 0, 5);
   const result = await page.evaluate(() => {
    const tasks=currentSceneConfig().tasks;
    for(let i=0;i<tasks.length;i++) {
     startTask(i,{speakAgain:false});
     const text=['Thanks for having me.','I design apps and enjoy solving everyday problems.','I was responsible for research and interface design.','I explain design decisions clearly.','I would like to discuss my shopping app project.'][i];
     const n=addDialogueMessage('user',text,'你'); const message=state.dialogueHistory[n]; message.final=true;
     const context={...captureUserTurnContext(),messageId:message.id,revision:message.revision,answer:text,final:true,source:'voice'};
     applyDynamicFeedback({meaning_valid:true},context); clearTaskAdvance(); clearReviewTransition();
    }
    const sessions=LumaExperience.store.getProfile().sessions;
    return {stage:state.stage,saved:state.sessionSaved,covered:state.coveredGoals.size,completed:sessions.filter(x=>x.completedAt).map(x=>x.missionId)};
   });
   assert.equal(result.stage,'complete');assert.equal(result.saved,true);assert.equal(result.covered,5);assert.deepEqual(result.completed,['I01']);
   await assertProgress(page, 5, 5);
   await page.evaluate(()=>showReview());
   await page.screenshot({path:`${output}/result-${width}.png`});
   assert.equal(await page.locator('#reviewScreen.is-active').count(),1);
   const next = await page.evaluate(()=>LumaExperience.store.getProfile().sessions.filter(x=>x.completedAt).length);
   assert.equal(next,1);
   await page.evaluate(()=>{
    state.selectedScene='interview';startScene({missionId:'I07',skipIntro:true});
   });
   await page.waitForFunction(()=>state.sceneStarted&&state.interviewMissionId==='I07'&&state.taskIndex===0&&state.stage==='active');
   await page.evaluate(()=>{
    const tasks=currentSceneConfig().tasks;
    state.coveredGoals=new Set(tasks.slice(0,5).map(t=>t.id));
    state.sessionGoals[tasks[2].id]={utterance:'I designed a library app for students.',meaningAccepted:true,spoke:true,supportLevel:0};
    state.taskIndex=5;LumaExperience.checkpoint();leaveScene();
    const saved=LumaExperience.store.getCheckpoint({sceneId:'interview',missionId:'I07'});
    window.__beforeResumeSession=state.practiceSession;
    state.selectedScene='interview';startScene({missionId:'I07',skipIntro:true,resumeCheckpoint:saved});
   });
   await page.waitForFunction(()=>state.sceneStarted&&state.taskIndex===5&&state.practiceSession>window.__beforeResumeSession);
   const restored=await page.evaluate(()=>({covered:state.coveredGoals.size,mission:state.interviewMissionId,history:state.interviewResumeHistory}));
   assert.equal(restored.covered,5);assert.equal(restored.mission,'I07');
   assert.ok(restored.history.some(m=>m.role==='user'&&m.text==='I designed a library app for students.'));
   await assertProgress(page, 5, 16);
   await page.screenshot({path:`${output}/resumed-topic-progress-${width}.png`});
   // Browsing other topic labels must not be undone by an unrelated state update.
   const manuallyScrolled = await page.evaluate(() => {
    const row = document.querySelector('#taskSegments');
    row.scrollLeft = row.scrollWidth - row.clientWidth;
    const before = row.scrollLeft; syncSceneProgress();
    return {before, overflow:row.scrollWidth > row.clientWidth};
   });
   assert.ok(manuallyScrolled.overflow, 'the full mock can be explored horizontally');
   await nextPaint(page);
   const afterSync = await page.locator('#taskSegments').evaluate(row => row.scrollLeft);
   assert.ok(Math.abs(afterSync - manuallyScrolled.before) < 1, 'ordinary updates preserve a manually explored topic position');
   await page.evaluate(() => startTask(2, {speakAgain:false}));
   await assertProgress(page, 5, 16);
   const afterTaskChange = await page.locator('#taskSegments').evaluate(row => row.scrollLeft);
   assert.ok(afterTaskChange < afterSync, 'changing the active topic brings it back into view');
   // A single-topic review shows its own scope and completes after that topic.
   await page.evaluate(()=>{
    state.selectedScene='interview';
    startScene({missionId:'I01',skipIntro:true,reviewTaskId:'interview-background'});
   });
   await page.waitForFunction(()=>state.sceneStarted&&state.sessionScope==='target-practice'&&currentTask().id==='interview-background');
   await assertProgress(page, 0, 1);
   await page.evaluate(()=>{
    const text='I design apps and enjoy solving everyday problems.';
    const n=addDialogueMessage('user',text,'你'), message=state.dialogueHistory[n]; message.final=true;
    const context={...captureUserTurnContext(),messageId:message.id,revision:message.revision,answer:text,final:true,source:'voice'};
    applyDynamicFeedback({meaning_valid:true},context); clearTaskAdvance(); clearReviewTransition();
   });
   assert.equal(await page.evaluate(()=>state.stage),'complete');
   await assertProgress(page, 1, 1);
   assert.deepEqual(errors,[]);
   results.push({width,height,sevenBriefs:true,previewVisible:true,help:true,skipAndEarlyExit:true,semanticFixtureCompletion:true,completedOnlyProgress:true,targetedReviewProgress:true,sharedTaskHud:true,stableHudHeight:true,horizontalTopicNavigation:true,errors});
   await page.close();
  }
  fs.writeFileSync(`${output}/results.json`,JSON.stringify(results,null,2)); console.log(JSON.stringify({results,output},null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

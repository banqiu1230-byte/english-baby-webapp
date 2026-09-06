// Optional browser smoke check: install Playwright separately or set PLAYWRIGHT_MODULE.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const {mkdtempSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const output=mkdtempSync(join(tmpdir(),'luma-breakfast-check-'));
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.__micRequests=0;
   navigator.mediaDevices.getUserMedia=async()=>{window.__micRequests++;throw new DOMException('Test denied','NotAllowedError')};
   window.WebSocket=class{static OPEN=1;constructor(){this.readyState=1;this.bufferedAmount=0;setTimeout(()=>{this.onopen?.();this.onmessage?.({data:'{"type":"session.created"}'})},10)}send(){}close(){this.readyState=3}};
  });
  await page.route('**/api/feedback',r=>r.fulfill({json:{meaning_valid:false}}));
  await page.goto(process.env.LUMA_TEST_URL || 'http://127.0.0.1:4174/',{waitUntil:'networkidle'});
  await page.click('.primary-cta');
  await page.locator('#sceneIntro').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>window.__micRequests),0);
  await page.waitForTimeout(300);
  await page.screenshot({path:output+'/breakfast-intro.png'});
  await page.click('#introBack');
  assert.equal(await page.evaluate(()=>state.sceneStarted),false);
  assert.equal(await page.evaluate(()=>window.__micRequests),0);
  await page.click('.primary-cta');
  await page.click('#introReady');
  await page.waitForFunction(()=>state.duplexReady);
  await page.waitForTimeout(200);
  assert.ok(await page.evaluate(()=>window.__micRequests)>0);
  await page.click('#breakfastAssist');
  await page.screenshot({path:output+'/breakfast-fridge.png'});
  await page.click('[data-choice="milk"]');
  assert.deepEqual(await page.evaluate(()=>({...state.breakfast,spoken:currentGoalRecord().spoke,users:state.dialogueHistory.filter(m=>m.speaker==='user').length})),{drink:'milk',cupPlaced:false,amount:null,spoken:false,users:0});
  // UI interaction checks use real production functions but isolate the provider timing.
  await page.evaluate(()=>{startTask(1,{speakAgain:false});clearIdleNudge()});
  await page.waitForTimeout(300);
  await page.screenshot({path:output+'/breakfast-cup.png'});
  const cup=await page.locator('#breakfastCup').boundingBox(),world=await page.locator('#breakfastWorld').boundingBox();
  await page.mouse.move(cup.x+cup.width/2,cup.y+cup.height/2);await page.mouse.down();
  await page.mouse.move(world.x+world.width*.5,world.y+world.height*.4,{steps:12});await page.mouse.up();
  assert.equal(await page.evaluate(()=>state.breakfast.cupPlaced),true);
  await page.evaluate(()=>{startTask(2,{speakAgain:false});clearIdleNudge()});
  await page.click('#breakfastAssist');await page.click('[data-choice="more"]');
  assert.equal(await page.evaluate(()=>state.breakfast.amount),'more');
  await page.waitForTimeout(1100);await page.screenshot({path:output+'/breakfast-filled.png'});
  await page.evaluate(()=>leaveScene());
  await page.click('.primary-cta');await page.click('#introRemember');await page.click('#introReady');
  await page.waitForFunction(()=>state.stage==='active'&&currentTask().id==='breakfast-drink');
  assert.deepEqual(await page.evaluate(()=>state.breakfast),{drink:null,cupPlaced:false,amount:null});
  assert.match(await page.locator('#backgroundPlane').getAttribute('src'),/fridge/);
  const layouts=[];
  for(const [width,height] of [[320,568],[360,640],[390,844],[430,932],[844,390]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(100);
   const result=await page.evaluate(()=>{const r=breakfastPanel.getBoundingClientRect();return{inside:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,overflow:document.documentElement.scrollWidth>innerWidth}});
   layouts.push({width,height,...result});assert.ok(result.inside&&!result.overflow);
  }
  await page.evaluate(()=>{leaveScene();state.selectedScene='airport';startScene()});
  await page.waitForFunction(()=>state.sceneStarted&&currentTask().id==='ticket');
  assert.equal(await page.locator('#breakfastPanel').isVisible(),false);
  assert.equal(await page.locator('#scene').getAttribute('data-breakfast'),null);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,layouts,errors,screenshots:output},null,2));
 } finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

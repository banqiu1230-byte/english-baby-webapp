const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const {mkdtempSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
(async()=>{
 const output=mkdtempSync(join(tmpdir(),'luma-intro-'));
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
  const page=await browser.newPage({viewport:{width:393,height:822}}),errors=[],checks=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.__micRequests=0;navigator.mediaDevices.getUserMedia=async()=>{window.__micRequests++;throw Error('Unexpected microphone request before consent')}});
  await page.goto(process.env.LUMA_TEST_URL || 'http://127.0.0.1:4174/',{waitUntil:'networkidle'});
  for(const sceneName of ['kitchen','airport','office']) {
   await page.evaluate(name=>{state.selectedScene=name;startScene()},sceneName);
   for(const [width,height] of [[393,822],[320,568],[390,844],[430,932],[844,390]]) {
    await page.setViewportSize({width,height});await page.waitForTimeout(300);
    const layout=await page.evaluate(()=>{
     const bounds=el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom}};
     const c=bounds(document.querySelector('.intro-content')),b=bounds(document.querySelector('#introReady')),back=bounds(document.querySelector('#introBack'));
     return {inside:c.left>=0&&c.right<=innerWidth+1&&c.top>=0&&c.bottom<=innerHeight+1,cta:b.bottom-b.top>=44,overlapBack:!(c.left>=back.right||c.right<=back.left||c.top>=back.bottom||c.bottom<=back.top),overflow:sceneIntro.scrollWidth>sceneIntro.clientWidth+1};
    });
    checks.push({sceneName,width,height,...layout});
    assert.ok(layout.inside&&layout.cta&&!layout.overlapBack&&!layout.overflow,JSON.stringify(checks.at(-1)));
    if(sceneName==='kitchen'||width===393)await page.screenshot({path:join(output,`${sceneName}-${width}x${height}.png`)});
   }
   await page.click('#introRemember');assert.equal(await page.locator('#introRemember').isChecked(),true);
   await page.locator('#introRemember').press('Space');assert.equal(await page.locator('#introRemember').isChecked(),false);
   await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'introBack');
   await page.keyboard.press('Escape');assert.equal(await page.locator('#sceneIntro').isVisible(),false);
  }
  assert.equal(await page.evaluate(()=>window.__micRequests),0);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({checks,errors,screenshots:output},null,2));
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

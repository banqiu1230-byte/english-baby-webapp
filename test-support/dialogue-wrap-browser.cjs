// Full caption wrapping on mobile Safari and Chromium, including inline word lookup.
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve(__dirname, '../qa-evidence/dialogue-wrap');
const base = process.env.LUMA_TEST_URL || 'http://127.0.0.1:4174/';
fs.mkdirSync(output, { recursive: true });
const results = [];
(async () => {
  for (const [name, type, opts] of [['chrome', chromium, {channel:'chrome'}], ['webkit', webkit, {}]]) {
    const browser = await type.launch({headless:true, ...opts});
    try {
      for (const [width,height] of [[393,852],[375,667],[320,568]]) {
        const page = await browser.newPage({viewport:{width,height},isMobile:true,deviceScaleFactor:2,reducedMotion:'reduce'});
        const errors=[]; page.on('pageerror',e=>errors.push(e.message));
        await page.addInitScript(()=>{
          navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Controlled fixture','NotAllowedError');};
          window.WebSocket=class { static OPEN=1; constructor(){this.readyState=3;} send(){} close(){} };
        });
        await page.route('**/api/**',route=>route.fulfill({json:{}}));
        await page.route('**/api/word-meaning',route=>{const data=route.request().postDataJSON();return route.fulfill({json:{term:data.text.slice(data.start,data.end),start:data.start,end:data.end,meaning:'拿铁咖啡',pronunciation:'/test/',note:''}});});
        await page.goto(base,{waitUntil:'networkidle'});
        await page.evaluate(()=>{
          ensureSceneVoiceIsOpen=()=>{};connectDuplexSession=async()=>false;
          state.selectedScene='coffee'; startScene({missionId:'C01',skipIntro:true});
        });
        await page.waitForFunction(()=>state.sceneStarted&&state.stage==='active');
        const userText="I'd like a small latte, please, with oat milk, and I would like to take it away.";
        const assistantText="Hi! Welcome in. We have lattes, cappuccinos, and freshly brewed black coffee. Would you like to try a latte today, or would you prefer something without milk?";
        await page.evaluate(({userText,assistantText})=>{
          stopVoiceHealthMonitor();clearTaskAdvance();clearIdleNudge();stopSpeechPlayback();clearTimeout(state.promptTimer);state.promptTimer=null;
          state.micMuted=true;state.dialogueHistory=[];clearCharacterCaptionReveal();
          addDialogueMessage('user',userText);addDialogueMessage('luma',assistantText,'Mia');
        },{userText,assistantText});
        await page.waitForFunction(()=>document.querySelectorAll('#recentDialogue .word-token').length>15);
        await page.evaluate(()=>fitRecentDialogue());
        const snapshot=await page.evaluate(()=>{
          const panel=languagePanel.getBoundingClientRect(),dock=document.querySelector('.scene-controls').getBoundingClientRect();
          return {panel:panel.toJSON(),dock:dock.toJSON(),overflow:getComputedStyle(languagePanel).overflowY,scrollHeight:languagePanel.scrollHeight,
          lines:[...recentDialogue.querySelectorAll('.dialogue-text')].map(node=>{
            const box=node.getBoundingClientRect(),p=node.parentElement.getBoundingClientRect(),style=getComputedStyle(node);
            return {text:node.textContent,box:box.toJSON(),p:p.toJSON(),clamp:style.webkitLineClamp,display:style.display,
              tokens:[...node.querySelectorAll('.word-token')].flatMap(token=>[...token.getClientRects()].map(r=>({text:token.textContent,left:r.left,right:r.right,top:r.top,bottom:r.bottom})))};
          })};
        });
        assert.equal(snapshot.lines[0].text,userText);assert.equal(snapshot.lines[1].text,assistantText);
        for(const line of snapshot.lines){
          assert.ok(['none','auto',''].includes(line.clamp),JSON.stringify(line));
          assert.equal(line.display,'block');
          for(const token of line.tokens){assert.ok(token.left>=line.p.left-1&&token.right<=line.p.right+1,`horizontal crop ${name} ${width} ${JSON.stringify(token)}`);assert.ok(token.top>=line.p.top-1&&token.bottom<=line.p.bottom+1,`vertical crop ${name} ${width} ${JSON.stringify(token)}`);}
        }
        assert.ok(snapshot.panel.bottom<snapshot.dock.top);
        assert.equal(snapshot.overflow,'auto');
        await page.waitForTimeout(800); await page.screenshot({path:`${output}/${name}-${width}.png`,animations:'disabled'});
        const latte=page.locator('#recentDialogue .dialogue-bubble.is-luma .word-token').filter({hasText:/^latte$/}).last();await latte.click();
        await page.waitForFunction(()=>document.querySelector('#wordLookupMeaning')?.textContent==='拿铁咖啡');
        assert.ok(await page.locator('#wordLookupCard').isVisible());
        await page.locator('#wordLookupClose').click();
        await page.evaluate(()=>{
          state.dialogueHistory=[];addDialogueMessage('luma',Array(20).fill('You can answer in your own words and take as much time as you need.').join(' '),'Mia');
        });
        await page.waitForFunction(()=>document.querySelectorAll('#recentDialogue .word-token').length>60);
        const long=await page.evaluate(()=>{languagePanel.scrollTop=0;const start=languagePanel.scrollTop;languagePanel.scrollTop=languagePanel.scrollHeight;return {start,end:languagePanel.scrollTop,height:languagePanel.clientHeight,scroll:languagePanel.scrollHeight,text:recentDialogue.textContent};});
        assert.ok(long.end>long.start,`long reply remains scrollable ${name} ${width}`);
        assert.ok(long.text.includes('as much time as you need.'));
        await page.evaluate(()=>LumaExperience.openHelp('keyword'));
        await page.waitForTimeout(100);
        const help=await page.evaluate(()=>({hud:sceneTaskHud.getBoundingClientRect().toJSON(),panel:languagePanel.getBoundingClientRect().toJSON()}));
        
        assert.ok(help.panel.top>=help.hud.bottom+8, `HUD overlap ${name} ${width} ${JSON.stringify(help)}`);
        assert.ok(help.panel.height>=50, 'at least a full subtitle line remains reachable');
        await page.screenshot({path:`${output}/${name}-${width}-help.png`,animations:'disabled'});
        await page.evaluate(()=>LumaExperience.closeHelp());
        await page.waitForTimeout(100);
        const restored=await page.locator('#languagePanel').evaluate(node=>node.clientHeight);
        assert.ok(restored>=help.panel.height,'closing help restores caption space');
        assert.deepEqual(errors,[]);results.push({engine:name,width,height,lines:snapshot.lines.map(l=>({text:l.text,height:l.box.height,clamp:l.clamp})),long:{height:long.height,scroll:long.scroll},lookup:'pass',helpGap:help.panel.top-help.hud.bottom,errors});
        await page.close();
      }
    } finally { await browser.close(); }
  }
  fs.writeFileSync(`${output}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify({checks:results.length,engines:['chrome','webkit'],output}));
})().catch(e=>{console.error(e);process.exit(1);});

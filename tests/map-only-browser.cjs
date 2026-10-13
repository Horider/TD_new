const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mkdirSync}=require('node:fs');
const {chromium}=require('C:/Users/Aleks/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const server=process.env.GAME_URL?null:spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'4185'},windowsHide:true});
 let browser;
 try{
  if(server)await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(d.toString().includes('running at'))resolve()});server.on('error',reject)});
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.url())});
  await page.goto((process.env.GAME_URL||'http://127.0.0.1:4185/')+'?debug');
  await page.waitForFunction(()=>window.forestWard&&!forestWard.loading,null,{timeout:90000});
  mkdirSync('test-results',{recursive:true});
  for(const [width,height] of [[1280,504],[844,390],[1157,1304],[390,844],[320,720]]){
   await page.setViewportSize({width,height});
   await page.evaluate(()=>forestWard.view.fit());
   await page.waitForFunction(w=>forestWard.view.transform().width===w,width);
   await page.mouse.move(width/2,height/2);await page.mouse.wheel(0,1800);
   const camera=await page.evaluate(()=>forestWard.view.transform());
   assert.equal(camera.zoom,1);
   assert.ok(camera.offsetX<=.01&&camera.offsetY<=.01);
   assert.ok(camera.offsetX+1536*camera.scale>=width-.01&&camera.offsetY+1024*camera.scale>=height-.01);
   for(const id of ['sound-button','restart-button','zoom-in','zoom-out','zoom-fit'])assert.equal(await page.locator('#'+id).isVisible(),false);
   for(const id of ['maps-button','fullscreen-button','pause-button','speed-button','wave-button']){
    const box=await page.locator('#'+id).boundingBox();
    assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+.5&&box.y+box.height<=height+.5,JSON.stringify({id,box,width,height}));
    assert.equal(await page.locator('#'+id).getAttribute('title'),null);
   }
   for(const pad of await page.evaluate(()=>[...document.querySelectorAll('.pad-button')].filter(b=>!b.hidden).map(b=>b.dataset.pad))){
    await page.locator(`[data-pad="${pad}"]`).focus();await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(()=>forestWard.view.transform()),camera,'selection never changes camera');
    await page.keyboard.press('Escape');
   }
   assert.equal(await page.locator('#stage').evaluate(e=>getComputedStyle(e,'::before').content),'none');
   await page.screenshot({path:`test-results/map-only-${width}x${height}.png`});
  }
  await page.setViewportSize({width:844,height:390});await page.evaluate(()=>forestWard.view.fit());
  await page.locator('[data-pad="2"]').tap();await page.keyboard.press('KeyB');
  assert.equal(await page.locator('#gold').textContent(),'270');
  await page.waitForFunction(()=>forestWard.game.towers[0].constructionAge>=1.1);
  await page.keyboard.press('KeyU');assert.equal(await page.locator('#gold').textContent(),'150');
  await page.keyboard.press('Escape');await page.locator('#wave-button').tap();
  await page.waitForFunction(()=>forestWard.game.kills>0,null,{timeout:45000});
  assert.deepEqual(errors,[]);
  console.log('PASS: map fills every viewport, compact HUD, removed controls, no selection zoom, construction/upgrades/combat, no errors.');
 }finally{await browser?.close();server?.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});


const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { existsSync, mkdirSync } = require('node:fs');
const { homedir } = require('node:os');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const { chromium } = playwright;

(async () => {
  const server = spawn(process.execPath, ['server.mjs'], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, PORT: '4184' }, windowsHide: true });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', data => { if (data.toString().includes('running at')) resolve(); });
    server.once('error', reject);
    server.once('exit', code => reject(new Error(`Test server exited: ${code}`)));
  });
  const executablePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  mkdirSync('test-results', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  const menu = page.locator('#tower-selector');
  const clickSector = async (x, y) => {
    const box = await menu.boundingBox();
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  };
  const state = () => page.evaluate(() => ({ gold: forestWard.game.gold, count: forestWard.game.towers.length, level: forestWard.game.towers[0]?.level, paused: forestWard.game.paused, selected: forestWard.selected }));
  const wait = async predicate => page.waitForFunction(predicate);
  try {
    await page.goto('http://127.0.0.1:4184/?debug', { waitUntil: 'networkidle' });
    await wait(() => window.forestWard && !forestWard.loading);
    assert.equal(await page.evaluate(()=>forestWard.art.entrance.complete),true);
    await page.evaluate(()=>{
      const ctx=document.querySelector('#game-canvas').getContext('2d'), original=ctx.drawImage;
      window.padDraw=null;
      ctx.drawImage=function(image,...args){
        if(image.src?.includes('/assets/ui/build-pad/')) {
          const matrix=ctx.getTransform();
          window.padDraw={x:args[0],y:args[1],width:args[2],height:args[3],screenWidth:args[2]*matrix.a,scale:matrix.a};
        }
        return original.call(this,image,...args);
      };
    });
    await page.waitForFunction(()=>window.padDraw);
    const originalPad=await page.evaluate(()=>window.padDraw);
    await page.locator('#zoom-in').click();
    await page.waitForFunction(before=>window.padDraw.scale>before,originalPad.scale);
    const enlargedPad=await page.evaluate(()=>window.padDraw);
    assert.equal(enlargedPad.width,originalPad.width);
    assert.equal(enlargedPad.height,originalPad.height);
    assert.ok(Math.abs(enlargedPad.screenWidth/originalPad.screenWidth-1.25)<.01);
    await page.locator('#zoom-out').click();
    await page.waitForFunction(before=>Math.abs(window.padDraw.scale-before)<.01,originalPad.scale);
    assert.equal(await page.locator('#pad-layer').textContent(),'');
    await page.locator('[data-pad="2"]').hover();
    await page.waitForFunction(()=>document.querySelector('[data-pad="2"] .pad-art').dataset.frame==='5');
    assert.match(await page.locator('[data-pad="2"] .pad-art').getAttribute('src'), /pad-06\.png/);
    await page.screenshot({path:path.resolve('test-results/pad-hover.png')});
    await page.locator('[data-pad="2"]').click();
    assert.equal(await menu.getAttribute('data-mode'), 'build');
    assert.equal(await page.locator('.selector-option.locked').count(), 3);
    await page.screenshot({ path: path.resolve('test-results/selector-build.png') });
    await clickSector(.2, .5);
    assert.equal((await state()).count, 0);
    assert.match(await page.locator('#toast').textContent(), /недоступна/);
    await clickSector(.5, .15);
    await wait(() => forestWard.game.towers.length === 1);
    assert.equal(await page.evaluate(()=>forestWard.art.construction.length),15);
    await wait(() => forestWard.game.towers[0].constructionAge >= .9);
    await page.screenshot({path:path.resolve('test-results/construction-in-game.png')});
    await wait(() => forestWard.game.towers[0].constructionAge >= 1.1);
    assert.equal((await state()).gold, 270);
    assert.equal(await menu.getAttribute('data-mode'), 'actions');
    assert.equal(await page.locator('.selector-left').getAttribute('data-action'), 'sell');
    assert.equal(await page.locator('.selector-right').getAttribute('data-action'), 'upgrade');
    const removeBox = await page.locator('[data-action="sell"]').boundingBox();
    const upgradeBox = await page.locator('[data-action="upgrade"]').boundingBox();
    assert.ok(upgradeBox.x - removeBox.x - removeBox.width > 30, 'independent action buttons have a clear gap');
    assert.equal(await page.locator('.selector-art').isVisible(), false, 'no shared ring behind action buttons');
    assert.equal(await page.locator('[data-action="upgrade"] .selector-action-copy').textContent(), 'Улучшить · 2120 зол.');
    await page.screenshot({ path: path.resolve('test-results/selector-actions.png') });
    await clickSector(.8, .5);
    await wait(() => forestWard.game.towers[0].level === 1);
    assert.equal(await page.evaluate(()=>forestWard.art.upgrades.length),15);
    await wait(() => forestWard.game.towers[0].upgradeAge >= 1.3);
    await page.screenshot({path:path.resolve('test-results/upgrade-in-game.png')});
    await wait(() => forestWard.game.towers[0].upgradeAge >= 1.9);
    assert.equal((await state()).gold, 150);
    assert.match(await page.locator('[data-action="upgrade"] .selector-crystal').getAttribute('src'), /yellow-crystals-3/);
    assert.equal(await page.locator('[data-action="upgrade"]').getAttribute('aria-disabled'), 'true');
    await clickSector(.8, .5);
    assert.equal((await state()).level, 1);
    assert.match(await page.locator('#toast').textContent(), /60/);
    await page.evaluate(() => { forestWard.game.gold = 210; });
    await wait(() => document.querySelector('[data-action="upgrade"]').getAttribute('aria-disabled') === 'false');
    await clickSector(.8, .5);
    await wait(() => forestWard.game.towers[0].level === 2);
    assert.equal(await page.locator('[data-action="upgrade"] .selector-badge svg').count(), 1);
    await clickSector(.8, .5);
    assert.equal((await state()).level, 2);
    await page.locator('#pause-button').click();
    assert.equal(await menu.isVisible(), false);
    await page.locator('#resume-button').click();
    assert.equal(await menu.isVisible(), true);
    await clickSector(.2, .5);
    await wait(() => forestWard.game.towers.length === 0);
    assert.equal((await state()).gold, 294);
    assert.equal(await menu.isVisible(), false);

    await page.evaluate(() => { forestWard.game.gold = 89; });
    await page.locator('[data-pad="1"]').click();
    await clickSector(.5, .15);
    assert.equal((await state()).count, 0);
    assert.match(await page.locator('#toast').textContent(), /1 золота/);
    await page.keyboard.press('Escape');
    assert.equal(await menu.isVisible(), false);
    assert.equal(await page.locator('[data-pad="1"]').evaluate(el => el === document.activeElement), true);

    await page.evaluate(() => { forestWard.game.gold = 360; });
    await page.locator('[data-pad="1"]').click();
    await page.locator('[data-action="build"]').focus();
    await page.keyboard.press('Space');
    await wait(() => forestWard.game.towers.length === 1);
    assert.equal((await state()).paused, false);
    await page.keyboard.press('Escape');
    await page.locator('[data-pad="1"]').click();
    await page.locator('#selector-close').click();
    assert.equal(await menu.isVisible(), false);
    await page.locator('[data-pad="2"]').click();
    const canvas = await page.locator('#game-canvas').boundingBox();
    await page.mouse.click(canvas.x + canvas.width - 8, canvas.y + canvas.height - 8);
    assert.equal(await menu.isVisible(), false);

    await page.locator('[data-pad="1"]').click();
    const centered = await page.evaluate(() => {
      const tower=forestWard.game.towers[0];
      const height=Math.min([180,192,205][tower.level],tower.y+18);
      const expected=forestWard.view.worldToScreen(tower.x,tower.y+25-height/2);
      const stage=document.querySelector('#stage').getBoundingClientRect(), menu=document.querySelector('#tower-selector').getBoundingClientRect();
      return Math.abs(menu.x+menu.width/2-stage.x-expected.x)+Math.abs(menu.y+menu.height/2-stage.y-expected.y);
    });
    assert.ok(centered < 1);
    assert.equal(await page.locator('.selector-art').evaluate(el=>getComputedStyle(el).opacity),'0.38');
    assert.equal(await page.locator('.selector-crystal').first().evaluate(el=>getComputedStyle(el).opacity),'1');
    const originalSize=(await menu.boundingBox()).width;
    await page.locator('#zoom-in').click();
    assert.ok((await menu.boundingBox()).width>originalSize);
    await page.locator('#zoom-out').click();
    assert.ok(Math.abs((await menu.boundingBox()).width-originalSize)<1);
    await page.setViewportSize({width:1000,height:700});
    await page.waitForFunction(()=>document.querySelector('#game-canvas').clientWidth===1000);
    await page.waitForFunction(()=>parseFloat(document.querySelector('#tower-selector').style.width)<190);
    assert.ok((await menu.boundingBox()).width<originalSize);
    await page.setViewportSize({width:1440,height:1000});
    await page.waitForFunction(()=>parseFloat(document.querySelector('#tower-selector').style.width)>190);
    for (const id of ['maps-button','sound-button','fullscreen-button','restart-button','pause-button','speed-button','zoom-in','zoom-out','zoom-fit','wave-button']) {
      assert.equal(await page.locator(`#${id}`).evaluate(el=>document.querySelector('#stage').contains(el)),true);
    }
    await page.keyboard.press('Escape');

    await page.setViewportSize({ width: 390, height: 844 });
    for (const pad of [0, 4, 8]) {
      await page.locator('#zoom-fit').click();
      const cameraBefore=await page.evaluate(()=>forestWard.view.transform());
      await page.locator(`[data-pad="${pad}"]`).focus();
      await page.keyboard.press('Enter');
      assert.deepEqual(await page.evaluate(()=>forestWard.view.transform()),cameraBefore,'opening edge selectors preserves zoom and map position');
      const box = await menu.boundingBox(), stage = await page.locator('#stage').boundingBox();
      assert.ok(box.x >= stage.x + 7 && box.y >= stage.y + 7);
      assert.ok(box.x + box.width <= stage.x + stage.width - 7);
      assert.ok(box.y + box.height <= stage.y + stage.height - 7);
      await page.keyboard.press('Escape');
    }
    await page.locator('#zoom-fit').click();
    await page.locator('[data-pad="4"]').focus();await page.keyboard.press('Enter');
    await page.screenshot({ path: path.resolve('test-results/selector-mobile.png'), fullPage: true });
    await page.keyboard.press('Escape');
    await page.locator('#zoom-fit').click();
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
    const pinchBefore=await page.evaluate(()=>forestWard.view.transform().zoom);
    const gestureFrame=await page.locator('#game-hud-frame').boundingBox(), gestureY=gestureFrame.y+gestureFrame.height/2;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:150,y:gestureY,id:1},{x:240,y:gestureY,id:2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:120,y:gestureY,id:1},{x:270,y:gestureY,id:2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const pinchAfter=await page.evaluate(()=>forestWard.view.transform().zoom);
    assert.ok(pinchAfter>pinchBefore);
    const wheelBefore=pinchAfter;
    await page.mouse.move(20,620);await page.mouse.wheel(0,180);
    await page.waitForFunction(previous=>forestWard.view.transform().zoom<previous,wheelBefore);
    await page.locator('#zoom-fit').click();
    await page.locator('#zoom-in').click();
    const panBefore=await page.evaluate(()=>forestWard.view.transform().offsetX);
    await page.mouse.move(120,620);await page.mouse.down();await page.mouse.move(180,620,{steps:6});await page.mouse.up();
    assert.notEqual(await page.evaluate(()=>forestWard.view.transform().offsetX),panBefore);
    for (const [width,height] of [[320,720],[844,390]]) {
      await page.setViewportSize({width,height});
      await page.locator('#zoom-fit').click();
      const gameFrame=await page.locator('#game-hud-frame').boundingBox();
      for (const id of ['maps-button','sound-button','fullscreen-button','restart-button','pause-button','speed-button','zoom-in','zoom-out','zoom-fit','wave-button']) {
        const box=await page.locator(`#${id}`).boundingBox();
        assert.ok(box&&box.x>=0&&box.y>=0&&box.x+box.width<=width+.5&&box.y+box.height<=height+.5,`${id} outside ${width}x${height}`);
        assert.ok(box.x>=gameFrame.x-.5&&box.y>=gameFrame.y-.5&&box.x+box.width<=gameFrame.x+gameFrame.width+.5&&box.y+box.height<=gameFrame.y+gameFrame.height+.5,`${id} outside actual game rectangle`);
        assert.ok(box.width>=44&&box.height>=44,`${id} too small for touch`);
      }
      assert.match(await page.locator('#stage').evaluate(el=>getComputedStyle(el,'::before').backgroundImage), /forest\.png/);
      await page.screenshot({path:path.resolve(`test-results/hud-${width}x${height}.png`)});
    }
    await page.setViewportSize({width:1157,height:1304});
    await page.locator('#zoom-fit').click();await page.locator('#zoom-out').click();
    const overviewFrame=await page.locator('#game-hud-frame').boundingBox();
    assert.ok(overviewFrame.y>200&&overviewFrame.x>0);
    for(const id of ['maps-button','sound-button','fullscreen-button','restart-button','pause-button','speed-button','zoom-in','zoom-out','zoom-fit','wave-button']) {
      const box=await page.locator(`#${id}`).boundingBox();
      assert.ok(box.x>=overviewFrame.x&&box.y>=overviewFrame.y&&box.x+box.width<=overviewFrame.x+overviewFrame.width+.5&&box.y+box.height<=overviewFrame.y+overviewFrame.height+.5,`${id} outside overview map`);
    }
    await page.screenshot({path:path.resolve('test-results/game-hud-overview.png')});
    const touchContext = await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
    const touchPage = await touchContext.newPage();
    touchPage.on('pageerror',error=>errors.push(error.message));
    await touchPage.goto('http://127.0.0.1:4184/',{waitUntil:'networkidle'});
    await touchPage.locator('#loading-screen').waitFor({state:'hidden'});
    await touchPage.locator('[data-pad="2"]').tap();
    const buildIcon = await touchPage.locator('[data-action="build"] .selector-crystal').boundingBox();
    await touchPage.touchscreen.tap(buildIcon.x+buildIcon.width/2,buildIcon.y+buildIcon.height/2);
    await touchPage.locator('[data-action="upgrade"] .selector-action-copy').waitFor({state:'visible'});
    await touchPage.screenshot({path:path.resolve('test-results/phone-actions.png')});
    for (const [width,height] of [[390,844],[320,720],[844,390]]) {
      await touchPage.setViewportSize({width,height});
      await touchPage.locator('#zoom-out').tap();
      await touchPage.locator('#zoom-in').tap();
      for (const action of ['sell','upgrade']) {
        const button = touchPage.locator(`[data-action="${action}"]`);
        assert.ok(await button.evaluate(el=>{
          const r=el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
        }), `${action} remains tappable after rotation and zoom`);
        const caption=await button.locator('.selector-action-copy').boundingBox();
        assert.ok(caption.x>=0&&caption.x+caption.width<=width&&caption.y+caption.height<=height);
      }
      await touchPage.screenshot({path:path.resolve(`test-results/phone-actions-${width}x${height}.png`)});
      if (width<621) {
        const header=await touchPage.locator('.game-hud-top').boundingBox();
        const stats=await touchPage.locator('#tower-panel').boundingBox();
        assert.ok(stats.y>=header.y+header.height,'tower details must not overlap resources or map title');
      }
    }
    await touchPage.locator('[data-action="upgrade"]').tap();
    await touchPage.getByRole('menuitem',{name:/Улучшить башню до уровня 3/}).waitFor();
    await touchPage.locator('[data-action="sell"]').tap();
    assert.equal(await touchPage.locator('#tower-selector').isVisible(),false);
    assert.equal(await touchPage.locator('#gold').textContent(),'297');
    await touchContext.close();
    assert.deepEqual(errors, []);
    console.log('Browser smoke passed: locks, build/upgrades/delete, tower centering, separate opacity, responsive zoom, in-game controls, keyboard, mobile edges, no JS or asset errors.');
  } finally { await browser.close(); server.kill(); }
})().catch(error => { console.error(error); process.exit(1); });


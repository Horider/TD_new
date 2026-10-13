import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, LEVELS } from '../game/maps.js';
import { Game, makePath, pointOnPath, wavePlan, START_GOLD, towerHeight } from '../game/engine.js';

function runUntil(game, condition, limit=180) {
  for(let t=0;t<limit;t+=.1){game.update(.1);game.events.length=0;if(condition())return;}
  assert.fail(`Simulation timed out: ${game.map.id}, wave ${game.wave}, status ${game.status}`);
}

test('all painted maps have traversable, finite routes and valid build sites',()=>{
  for(const map of MAPS){
    assert.equal(map.pads.length,map.id==='forest'?9:8);
    assert.equal(map.paths.length,map.id==='field'?2:1);
    for(const anchors of map.paths){
      const path=makePath(anchors);
      assert.ok(path.length>1000);
      assert.deepEqual([pointOnPath(path,0).x,pointOnPath(path,0).y],anchors[0]);
      assert.deepEqual([pointOnPath(path,path.length).x,pointOnPath(path,path.length).y],anchors.at(-1));
      for(let d=0;d<path.length;d+=19){const p=pointOnPath(path,d);assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.angle));}
    }
  }
});

test('construction economy rejects invalid actions, upgrades through three levels, refunds investment',()=>{
  const game=new Game(MAPS[0]);
  assert.equal(game.build(-1),false);assert.equal(game.build(99),false);
  assert.equal(game.build(0),true);assert.equal(game.gold,START_GOLD-90);
  assert.equal(game.build(0),false);
  assert.equal(game.upgrade(0),true);assert.equal(game.gold,150);
  assert.equal(game.upgrade(0),false);assert.equal(game.towerAt(0).level,1);
  game.gold+=60;assert.equal(game.upgrade(0),true);assert.equal(game.gold,0);
  assert.equal(game.upgrade(0),false);
  assert.equal(game.sell(0),true);assert.equal(game.gold,294);
  assert.equal(game.sell(0),false);assert.equal(game.towers.length,0);
  game.build(1);const before=game.gold;game.sell(1);assert.equal(game.gold-before,63);
});

test('pause freezes simulation and prevents starting a new wave',()=>{
  const game=new Game(MAPS[0]);game.paused=true;
  assert.equal(game.startWave(),false);game.update(5);assert.equal(game.time,0);
  game.paused=false;game.startWave();game.update(2);
  game.paused=true;const before=JSON.stringify({time:game.time,enemies:game.enemies,queue:game.spawnQueue});
  game.update(20);assert.equal(JSON.stringify({time:game.time,enemies:game.enemies,queue:game.spawnQueue}),before);
});

test('projectiles kill, yield rewards, and a completed wave pays its bonus exactly once',()=>{
  const game=new Game(MAPS[0]);game.gold=10000;
  for(let i=0;i<game.map.pads.length;i++){game.build(i);game.upgrade(i);game.upgrade(i);}
  const gold=game.gold;
  assert.equal(game.startWave(),true);assert.equal(game.startWave(),false);
  runUntil(game,()=>game.status==='ready');
  assert.equal(game.kills,10);assert.equal(game.lives,20);
  assert.equal(game.gold,gold+10*11+43);
  const after=game.gold;game.update(2);assert.equal(game.gold,after);
});

test('field sends enemies down both independently traversable lanes',()=>{
  const game=new Game(MAPS[2]);game.startWave();game.update(4);
  assert.ok(game.enemies.some(e=>e.pathIndex===0));assert.ok(game.enemies.some(e=>e.pathIndex===1));
});

test('unprotected exits cost lives and defeat stops the battle',()=>{
  const game=new Game(MAPS[1]);game.lives=1;game.startWave();
  runUntil(game,()=>game.status==='defeat');
  assert.equal(game.lives,0);assert.equal(game.leaked,1);
  assert.equal(game.startWave(),false);assert.equal(game.build(0),false);
  const time=game.time;game.update(5);assert.equal(game.time,time);
});

test('all four maps can finish all ten waves with a complete upgraded defense',()=>{
  for(const map of MAPS){
    const game=new Game(map);game.gold=10000;
    for(let i=0;i<map.pads.length;i++){game.build(i);game.upgrade(i);game.upgrade(i);}
    for(let wave=1;wave<=10;wave++){
      assert.equal(game.startWave(),true);
      runUntil(game,()=>game.status!=='active');
      assert.notEqual(game.status,'defeat');
    }
    assert.equal(game.status,'victory');assert.ok(game.lives>0);
    assert.equal(game.startWave(),false);assert.equal(game.upgrade(0),false);
  }
});

test('wave composition introduces fast enemies, armor, and two boss encounters',()=>{
  assert.ok(wavePlan(1).every(type=>type==='scout'));
  assert.ok(wavePlan(2).includes('runner'));assert.ok(wavePlan(3).includes('brute'));
  assert.ok(wavePlan(5).includes('boss'));assert.ok(wavePlan(10).includes('boss'));
  assert.equal(LEVELS.length,3);
});

test('tower artwork and firing origins stay on screen even at upper-edge pads',()=>{
  for(const map of MAPS)for(const [x,y] of map.pads)for(let level=0;level<3;level++){
    const h=towerHeight({x,y,level});
    assert.ok(y+25-h>=0);assert.ok(y+25-h*.87>=0);
  }
});

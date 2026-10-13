import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../game/engine.js';
import { MAPS } from '../game/maps.js';
import { CONSTRUCTION_DURATION, constructionFrame } from '../game/construction.js';
import { UPGRADE_DURATION } from '../game/upgrade.js';

test('construction runs while preparing, freezes with pause and tracks towers independently', () => {
  const game = new Game(MAPS[0]);
  game.build(0); game.update(.4);
  const first = game.towerAt(0);
  game.paused = true; game.update(2);
  assert.ok(Math.abs(first.constructionAge-.4)<1e-9);
  game.paused = false; game.build(1); game.update(.4);
  assert.ok(first.constructionAge>game.towerAt(1).constructionAge);
  game.update(2);
  assert.equal(first.constructionAge, CONSTRUCTION_DURATION);
  assert.equal(game.towerAt(1).constructionAge, CONSTRUCTION_DURATION);
  game.sell(0); game.build(0);
  assert.equal(game.towerAt(0).constructionAge, 0);
});

test('a tower cannot shoot through its construction dust but fires once ready', () => {
  const game = new Game({...MAPS[0], pads:[[100,200]], paths:[[[0,200],[1000,200]]]});
  game.build(0); game.startWave(); game.spawnQueue=[]; game.spawn('scout');
  game.update(.8);
  assert.ok(!game.events.some(event=>event.type==='shot'));
  game.update(1.5);
  assert.ok(game.events.some(event=>event.type==='shot'));
});

test('fifteen construction frames play once in chronological order', () => {
  const seen = new Set();
  for(let age=0;age<CONSTRUCTION_DURATION;age+=.01) seen.add(constructionFrame(age));
  assert.deepEqual([...seen],Array.from({length:15},(_,index)=>index));
});

test('construction and upgrade never accelerate when combat speed is doubled', () => {
  const game=new Game(MAPS[0]); game.build(0);
  game.update(2,2);
  assert.ok(Math.abs(game.towerAt(0).constructionAge-1)<1e-9);
  game.update(2.01,2);
  assert.equal(game.towerAt(0).constructionAge,CONSTRUCTION_DURATION);
  game.upgrade(0);game.update(2,2);
  assert.ok(Math.abs(game.towerAt(0).upgradeAge-1)<1e-9);
  game.update(2.01,2);
  assert.equal(game.towerAt(0).upgradeAge,UPGRADE_DURATION);
});

test('upgrade waits for construction, freezes on pause, and restarts for the next level', () => {
  const game = new Game(MAPS[0]); game.gold=1000;
  game.build(0); game.upgrade(0); game.update(.3);
  const tower=game.towerAt(0);
  assert.equal(tower.upgradeAge,0);
  assert.equal(tower.upgradeFrom,0);
  game.update(2);
  assert.ok(tower.upgradeAge>0&&tower.upgradeAge<UPGRADE_DURATION);
  const age=tower.upgradeAge;
  game.paused=true; game.update(3);
  assert.equal(tower.upgradeAge,age);
  game.paused=false; game.update(3);
  assert.equal(tower.upgradeAge,UPGRADE_DURATION);
  game.upgrade(0);
  assert.equal(tower.upgradeAge,0);
  assert.equal(tower.upgradeFrom,1);
  game.update(3);
  assert.equal(tower.upgradeAge,UPGRADE_DURATION);
  assert.equal(game.upgrade(0),false);
});


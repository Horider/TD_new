import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { Game } from '../game/engine.js';
import { MAPS } from '../game/maps.js';
import { selectorState, selectorPosition, selectorAnchor, SELECTOR_IMAGES } from '../game/tower-selector.js';
import { viewTransform } from '../game/view.js';

test('only the yellow tower is available and affordability never unlocks the other colors', () => {
  const game = new Game(MAPS[0]);
  for (const gold of [0, 89, 90, 10000]) {
    game.gold = gold;
    const state = selectorState(game, 0);
    assert.equal(state.mode, 'build');
    assert.equal(state.options.find(option => option.action === 'build').disabled, gold < 90);
    const locked = state.options.filter(option => option.action !== 'build');
    assert.equal(locked.length, 3);
    assert.ok(locked.every(option => option.locked && option.disabled));
  }
  assert.equal(selectorState(game, -1), null);
});

test('tower menu keeps remove on the left, upgrades on the right, and exposes maximum level', () => {
  const game = new Game(MAPS[0]);
  game.build(0);
  let state = selectorState(game, 0);
  assert.equal(state.options[0].action, 'sell');
  assert.equal(state.options[0].position, 'left');
  assert.equal(state.options[0].price, '+63');
  assert.equal(state.options[1].position, 'right');
  assert.equal(state.options[1].price, 120);
  assert.match(state.options[1].icon, /yellow-crystals-2/);
  game.upgrade(0);
  state = selectorState(game, 0);
  assert.match(state.options[1].icon, /yellow-crystals-3/);
  assert.equal(state.options[1].disabled, true);
  game.gold = 210;
  assert.equal(selectorState(game, 0).options[1].disabled, false);
  game.upgrade(0);
  state = selectorState(game, 0);
  assert.equal(state.options[1].locked, true);
  assert.equal(state.options[1].disabled, true);
  assert.equal(state.defaultAction, 'sell');
  assert.equal(state.options[0].price, '+294');
  game.status = 'victory';
  assert.equal(selectorState(game, 0), null);
});

test('menu stays centered on the rendered tower and scales with the same camera as the map', () => {
  for (const [width, height] of [[1080,720], [360,240], [304,202.67]]) {
    for (const map of MAPS) {
      const game = new Game(map); game.gold = 10000;
      for (let pad = 0; pad < map.pads.length; pad++) {
        assert.deepEqual(selectorAnchor(game,pad),map.pads[pad]);
        game.build(pad);
        const tower = game.towerAt(pad), [x,y] = selectorAnchor(game,pad);
        assert.equal(x,tower.x);
        assert.equal(y,tower.y + 25 - Math.min(180,tower.y + 18) / 2);
        for (const zoom of [.65,1,1.5,3]) {
          const t=viewTransform(width,height,zoom,700,450);
          const point = selectorPosition(width,height,x,y,t);
          assert.equal(point.x,x*t.scale+t.offsetX);
          assert.equal(point.y,y*t.scale+t.offsetY);
          assert.ok(point.size<=224&&point.size>=132);
        }
      }
    }
  }
  const small=selectorPosition(1440,900,768,512,viewTransform(1440,900,.7));
  const large=selectorPosition(1440,900,768,512,viewTransform(1440,900,1));
  assert.ok(large.size>small.size);
  for (const image of SELECTOR_IMAGES) assert.ok(existsSync(new URL(`../${image}`, import.meta.url)), image);
});

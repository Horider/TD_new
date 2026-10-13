import test from 'node:test';
import assert from 'node:assert/strict';
import { viewTransform } from '../game/view.js';
import { visibleMapBounds } from '../game/hud-frame.js';

test('HUD follows the actual map rectangle when the overview has margins',()=>{
  const view=viewTransform(1157,1304,.44), bounds=visibleMapBounds(view);
  assert.ok(bounds.top>250&&bounds.left>50);
  assert.ok(Math.abs(bounds.width-1536*view.scale)<1e-6);
  assert.ok(Math.abs(bounds.height-1024*view.scale)<1e-6);
});

test('HUD remains on the game viewport when the zoomed map extends beyond it',()=>{
  assert.deepEqual(visibleMapBounds(viewTransform(844,390,2)),{left:0,top:0,width:844,height:390});
});

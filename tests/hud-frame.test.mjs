import test from 'node:test';
import assert from 'node:assert/strict';
import { viewTransform } from '../game/view.js';
import { visibleMapBounds } from '../game/hud-frame.js';

test('zooming out never exposes space outside the map on any phone orientation',()=>{
  for(const [width,height] of [[1157,1304],[1280,504],[844,390],[390,844],[320,720]]){
    for(const zoom of [.1,.44,1,2,3]){
      const view=viewTransform(width,height,zoom);
      assert.ok(view.zoom>=1);
      assert.deepEqual(visibleMapBounds(view),{left:0,top:0,width,height});
    }
  }
});

test('HUD remains on the game viewport when the zoomed map extends beyond it',()=>{
  assert.deepEqual(visibleMapBounds(viewTransform(844,390,2)),{left:0,top:0,width:844,height:390});
});

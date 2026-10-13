import test from 'node:test';
import assert from 'node:assert/strict';
import { padFrame, PAD_DURATION, PAD_IMAGES } from '../game/pad-animation.js';

test('hover plays six frames once and holds its final resting pose',()=>{
  const visited=[];
  for(let age=0;age<2;age+=.01){const frame=padFrame(age);if(visited.at(-1)!==frame)visited.push(frame);}
  assert.deepEqual(visited,[0,1,2,3,4,5]);
  assert.equal(padFrame(PAD_DURATION),5);
  assert.equal(padFrame(10),5);
  assert.equal(PAD_IMAGES.length,6);
});

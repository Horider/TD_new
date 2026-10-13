// Play all maps with the real economy. A basic greedy player buys between waves.
import { MAPS, LEVELS } from '../game/maps.js';
import { Game, pointOnPath } from '../game/engine.js';

for(const map of MAPS){
  const game=new Game(map);
  const samples=game.paths.flatMap(path=>Array.from({length:32},(_,i)=>pointOnPath(path,path.length*(i+.5)/32)));
  function shop(){
    for(let buys=0;buys<30;buys++){
      const candidates=map.pads.map(([x,y],pad)=>{
        const tower=game.towerAt(pad),old=tower?LEVELS[tower.level]:null,next=LEVELS[tower?tower.level+1:0];
        if(!next||next.cost>game.gold)return null;
        let gain=0;
        for(const p of samples){
          const distance=Math.hypot(p.x-x,p.y-y);
          if(distance>next.range)continue;
          const existing=game.towers.reduce((total,t)=>total+(Math.hypot(t.x-p.x,t.y-p.y)<=LEVELS[t.level].range?LEVELS[t.level].damage/LEVELS[t.level].cooldown:0),0);
          const delta=next.damage/next.cooldown-(old&&distance<=old.range?old.damage/old.cooldown:0);
          gain+=delta/(1+existing*.045)**2;
        }
        return {pad,upgrade:!!tower,score:gain/next.cost};
      }).filter(Boolean).sort((a,b)=>b.score-a.score);
      if(!candidates.length)break;
      const best=candidates[0];if(best.upgrade)game.upgrade(best.pad);else game.build(best.pad);
    }
  }
  for(let wave=1;wave<=10&&!game.ended;wave++){
    shop();game.startWave();
    for(let t=0;t<180&&game.status==='active';t+=.1){game.update(.1);game.events.length=0;}
  }
  console.log(`${map.id}: ${game.status}, wave ${game.wave}, lives ${game.lives}, kills ${game.kills}, gold ${game.gold}, tower levels ${game.towers.map(t=>t.level+1).join(',')}`);
  if(game.status!=='victory')process.exitCode=1;
}

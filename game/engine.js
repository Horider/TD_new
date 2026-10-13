import { LEVELS, ENEMY_TYPES } from './maps.js?v=20261014-map-only-1';
import { CONSTRUCTION_DURATION } from './construction.js?v=20261014-map-only-1';
import { UPGRADE_DURATION } from './upgrade.js?v=20261014-map-only-1';

export const TOTAL_WAVES = 10;
export const START_GOLD = 360;
export const START_LIVES = 20;

// Two painted pads sit near the top edge. Keep their entire tower on the map.
export function towerHeight(tower) {
  return Math.min(LEVELS[tower.level].height, tower.y + 18);
}

export function makePath(anchors) {
  const points = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const p0 = anchors[Math.max(0, i - 1)], p1 = anchors[i];
    const p2 = anchors[i + 1], p3 = anchors[Math.min(anchors.length - 1, i + 2)];
    for (let j = 0; j < 16; j++) {
      const t = j / 16, t2 = t * t, t3 = t2 * t;
      points.push([0, 1].map(axis => .5 * ((2 * p1[axis]) + (-p0[axis] + p2[axis]) * t +
        (2*p0[axis] - 5*p1[axis] + 4*p2[axis] - p3[axis]) * t2 +
        (-p0[axis] + 3*p1[axis] - 3*p2[axis] + p3[axis]) * t3)));
    }
  }
  points.push([...anchors.at(-1)]);
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    distances.push(distances[i-1] + Math.hypot(points[i][0]-points[i-1][0], points[i][1]-points[i-1][1]));
  }
  return { points, distances, length: distances.at(-1) };
}

export function pointOnPath(path, distance) {
  const d = Math.max(0, Math.min(distance, path.length));
  let lo = 0, hi = path.distances.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (path.distances[mid] <= d) lo = mid; else hi = mid;
  }
  const a = path.points[lo], b = path.points[hi];
  const t = (d - path.distances[lo]) / (path.distances[hi] - path.distances[lo] || 1);
  return { x: a[0] + (b[0]-a[0])*t, y: a[1] + (b[1]-a[1])*t, angle: Math.atan2(b[1]-a[1], b[0]-a[0]) };
}

export function wavePlan(wave) {
  const count = 8 + wave * 2;
  const plan = Array.from({ length: count }, (_, i) => {
    if (wave >= 3 && i % 6 === 4) return 'brute';
    if (wave >= 2 && i % 4 === 2) return 'runner';
    return 'scout';
  });
  if (wave === 5 || wave === 10) plan.push('boss');
  return plan;
}

export class Game {
  constructor(map) {
    this.map = map;
    this.paths = map.paths.map(makePath);
    this.gold = START_GOLD;
    this.lives = START_LIVES;
    this.wave = 0;
    this.kills = 0;
    this.leaked = 0;
    this.status = 'ready';
    this.paused = false;
    this.time = 0;
    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.effects = [];
    this.events = [];
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.waveTotal = 0;
    this.spawned = 0;
    this.id = 0;
  }

  emit(type, detail = {}) { this.events.push({ type, ...detail }); }
  towerAt(pad) { return this.towers.find(t => t.pad === pad); }
  get ended() { return this.status === 'victory' || this.status === 'defeat'; }
  get remaining() { return this.enemies.length + this.spawnQueue.length; }
  get canEdit() { return !this.ended; }

  build(pad) {
    if (!this.canEdit || !this.map.pads[pad] || this.towerAt(pad) || this.gold < LEVELS[0].cost) return false;
    const [x,y] = this.map.pads[pad];
    this.gold -= LEVELS[0].cost;
    this.towers.push({ pad, x, y, level: 0, invested: LEVELS[0].cost, cooldown: .15, pulse: 0, kills: 0, constructionAge: 0, upgradeAge: UPGRADE_DURATION, upgradeFrom: 0 });
    this.emit('build', { pad });
    return true;
  }

  upgrade(pad) {
    const tower = this.towerAt(pad);
    if (!this.canEdit || !tower || tower.level >= LEVELS.length - 1) return false;
    const next = LEVELS[tower.level + 1];
    if (this.gold < next.cost) return false;
    this.gold -= next.cost;
    tower.invested += next.cost;
    tower.upgradeFrom = tower.level;
    tower.upgradeAge = 0;
    tower.level++;
    tower.pulse = .45;
    this.emit('upgrade', { pad });
    return true;
  }

  sell(pad) {
    const tower = this.towerAt(pad);
    if (!this.canEdit || !tower) return false;
    const refund = Math.round(tower.invested * .7);
    this.gold += refund;
    this.towers = this.towers.filter(t => t !== tower);
    this.emit('sell', { pad, refund });
    return true;
  }

  startWave() {
    if (this.status !== 'ready' || this.wave >= TOTAL_WAVES || this.paused) return false;
    this.wave++;
    this.spawnQueue = wavePlan(this.wave);
    this.waveTotal = this.spawnQueue.length;
    this.spawned = 0;
    this.spawnTimer = .5;
    this.status = 'active';
    this.emit('wave-start', { wave: this.wave });
    return true;
  }

  spawn(type) {
    const stats = ENEMY_TYPES[type];
    const pathIndex = this.spawned % this.paths.length;
    const hp = Math.round((44 + (this.wave-1)*13 + (this.wave-1)**2*.75) * stats.hp);
    const position = pointOnPath(this.paths[pathIndex], 0);
    this.enemies.push({ id: ++this.id, type, hp, maxHp: hp, speed: stats.speed * (1+(this.wave-1)*.013),
      distance: 0, pathIndex, ...position, hit: 0 });
    this.spawned++;
  }

  hit(enemy, projectile) {
    if (enemy.hp <= 0) return;
    enemy.hp -= projectile.damage;
    enemy.hit = .14;
    this.effects.push({ x: enemy.x, y: enemy.y - 15, angle: projectile.angle, level: projectile.level,
      age: 0, duration: .34, kind: 'impact' });
    if (enemy.hp <= 0) {
      const reward = ENEMY_TYPES[enemy.type].reward;
      this.gold += reward;
      this.kills++;
      if (projectile.tower) projectile.tower.kills++;
      this.effects.push({ x: enemy.x, y: enemy.y - 25, age: 0, duration: .9, kind: 'gold', text: `+${reward}` });
      this.emit('kill', { type: enemy.type });
    }
  }

  update(dt, simulationSpeed = 1) {
    if (this.paused || this.ended || !(dt > 0)) return;
    // Capped substeps keep projectiles and movement stable even under accelerated simulation.
    if (dt > .04) {
      const steps = Math.ceil(dt / .04);
      for (let i = 0; i < steps; i++) this.update(dt / steps, simulationSpeed);
      return;
    }
    this.time += dt;
    this.effects = this.effects.filter(e => (e.age += dt) < e.duration);
    for (const tower of this.towers) {
      tower.pulse = Math.max(0, tower.pulse - dt);
      const animationDt = dt / Math.max(1, simulationSpeed);
      const constructionStep = Math.min(animationDt, Math.max(0, CONSTRUCTION_DURATION-tower.constructionAge));
      tower.constructionAge = Math.min(CONSTRUCTION_DURATION, tower.constructionAge + animationDt);
      tower.upgradeAge = Math.min(UPGRADE_DURATION, tower.upgradeAge + animationDt-constructionStep);
    }
    if (this.status !== 'active') return;

    this.spawnTimer -= dt;
    if (this.spawnQueue.length && this.spawnTimer <= 0) {
      this.spawn(this.spawnQueue.shift());
      this.spawnTimer += Math.max(.55, 1.06 - this.wave*.035);
    }
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) continue;
      enemy.hit = Math.max(0, enemy.hit - dt);
      enemy.distance += enemy.speed * dt;
      Object.assign(enemy, pointOnPath(this.paths[enemy.pathIndex], enemy.distance));
      if (enemy.distance >= this.paths[enemy.pathIndex].length) {
        this.lives = Math.max(0, this.lives - ENEMY_TYPES[enemy.type].damage);
        enemy.hp = 0;
        this.leaked++;
        this.emit('leak');
      }
    }
    this.enemies = this.enemies.filter(e => e.hp > 0);
    if (this.lives <= 0) {
      this.status = 'defeat';
      this.emit('defeat');
      return;
    }

    for (const tower of this.towers) {
      if (tower.constructionAge < CONSTRUCTION_DURATION || tower.upgradeAge < UPGRADE_DURATION) continue;
      const stats = LEVELS[tower.level];
      tower.cooldown = Math.max(0, tower.cooldown - dt);
      if (tower.cooldown > 0) continue;
      let target = null, closestExit = Infinity;
      for (const enemy of this.enemies) {
        if (enemy.hp <= 0 || Math.hypot(enemy.x-tower.x, enemy.y-tower.y) > stats.range) continue;
        const exitTime = (this.paths[enemy.pathIndex].length - enemy.distance) / enemy.speed;
        if (exitTime < closestExit) { closestExit = exitTime; target = enemy; }
      }
      if (!target) continue;
      tower.cooldown = stats.cooldown;
      tower.pulse = .32;
      this.projectiles.push({ x: tower.x, y: tower.y + 25 - towerHeight(tower)*.87, targetId: target.id,
        level: tower.level, damage: stats.damage, tower, age: 0, angle: 0 });
      this.emit('shot', { level: tower.level });
    }

    const aliveShots = [];
    for (const shot of this.projectiles) {
      shot.age += dt;
      const target = this.enemies.find(e => e.id === shot.targetId && e.hp > 0);
      if (!target) continue;
      const dx = target.x - shot.x, dy = target.y - 15 - shot.y;
      const distance = Math.hypot(dx,dy);
      shot.angle = Math.atan2(dy,dx);
      if (shot.age < .11) { aliveShots.push(shot); continue; }
      const travel = 660 * dt;
      if (distance <= travel + 8) this.hit(target, shot);
      else {
        shot.x += dx / distance * travel;
        shot.y += dy / distance * travel;
        aliveShots.push(shot);
      }
    }
    this.projectiles = aliveShots;
    this.enemies = this.enemies.filter(e => e.hp > 0);
    if (!this.enemies.length && !this.spawnQueue.length) {
      const bonus = 35 + this.wave * 8;
      this.gold += bonus;
      this.projectiles = [];
      this.status = this.wave === TOTAL_WAVES ? 'victory' : 'ready';
      this.emit(this.status === 'victory' ? 'victory' : 'wave-clear', { bonus });
    }
  }
}

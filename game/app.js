import { MAPS, LEVELS, ENEMY_TYPES } from './maps.js?v=20261014-map-only-1';
import { Game, TOTAL_WAVES, wavePlan, pointOnPath, towerHeight } from './engine.js?v=20261014-map-only-1';
import { createTowerSelector, selectorAnchor, SELECTOR_IMAGES } from './tower-selector.js?v=20261014-map-only-1';
import { createGameView, MAX_ZOOM } from './view.js?v=20261014-map-only-1';
import { CONSTRUCTION_IMAGES, CONSTRUCTION_DURATION, constructionFrame, constructionReveal } from './construction.js?v=20261014-map-only-1';
import { UPGRADE_IMAGES, UPGRADE_DURATION, upgradeFrame, upgradeReveal } from './upgrade.js?v=20261014-map-only-1';
import { PAD_IMAGES, PAD_WIDTH, PAD_HEIGHT, padFrame } from './pad-animation.js?v=20261014-map-only-1';
import { visibleMapBounds } from './hud-frame.js?v=20261014-map-only-1';

const $ = id => document.getElementById(id);
const canvas = $('game-canvas');
const ctx = canvas.getContext('2d');
const towerRoot = 'assets/towers/towers/';
const roman = ['I','II','III'];
const art = { towers: [], peaks: [], arrows: [], construction: [], upgrades: [], pads: [], entrance: null, maps: new Map() };
let game, mapImage, selected = -1, hovered = -1, speed = 1, loading = true;
let loadVersion = 0, hudElapsed = 0, lastTime = 0, lineupKey = '', toastTimer;
let soundEnabled = false, audioContext, lastSound = 0;
const imageCache = new Map();
const padAnimations = new Map();
let records = {};
try { records = JSON.parse(localStorage.getItem('forest-ward-records') || '{}'); } catch { /* Storage may be disabled. */ }
const gameView = createGameView({ stage: $('stage'), canvas, onChange: (_,reason) => {
  updateGameHudBounds();
  updatePadPositions(); towerSelector.reposition(); updateZoomControls(); draw();
} });
const towerSelector = createTowerSelector({
  element: $('tower-selector'), stage: $('stage'), view: gameView,
  onAction: action => action === 'sell' ? sellTower() : towerAction(),
  onClose: () => clearSelection(true), onUnavailable: message => toast(message),
});

function loadImage(url) {
  if (!imageCache.has(url)) imageCache.set(url, new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Не удалось загрузить ${url}`));
    image.src = url;
  }));
  return imageCache.get(url);
}

function updateGameHudBounds() {
  const bounds=visibleMapBounds(gameView.transform()), frame=$('game-hud-frame');
  frame.style.left=`${bounds.left}px`;frame.style.top=`${bounds.top}px`;
  frame.style.width=`${bounds.width}px`;frame.style.height=`${bounds.height}px`;
}

async function loadArt() {
  await Promise.all([1,2,3].map(async level => {
    const folder = level === 3 ? 'watercolor-frames' : `level-${level}-frames`;
    const [tower, peak, arrows] = await Promise.all([
      loadImage(`${towerRoot}towers/tower-level-${level}.png`),
      loadImage(`${towerRoot}animation/tower-level-${level}-peak.png`),
      Promise.all(Array.from({ length: 11 }, (_, i) => loadImage(`assets/effects/arrow/${folder}/arrow-${String(i+1).padStart(2,'0')}.png`))),
    ]);
    art.towers[level-1] = tower;
    art.peaks[level-1] = peak;
    art.arrows[level-1] = arrows;
  }));
  await Promise.all(SELECTOR_IMAGES.map(loadImage));
  art.construction = await Promise.all(CONSTRUCTION_IMAGES.map(loadImage));
  art.upgrades = await Promise.all(UPGRADE_IMAGES.map(loadImage));
  art.pads = await Promise.all(PAD_IMAGES.map(loadImage));
  art.entrance = await loadImage('assets/ui/enemy-entrance/enemy-entrance-512.png');
}

function toast(message, duration = 2700) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), duration);
}

function tone(kind) {
  if (!soundEnabled || !audioContext) return;
  const now = audioContext.currentTime;
  if (kind === 'shot' && now - lastSound < .09) return;
  lastSound = now;
  const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
  oscillator.connect(gain); gain.connect(audioContext.destination);
  oscillator.type = 'sine';
  const frequency = kind === 'shot' ? 750 : kind === 'leak' ? 180 : 510;
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * (kind === 'leak' ? .65 : 1.4), now + .13);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(kind === 'shot' ? .018 : .05, now + .008);
  gain.gain.exponentialRampToValueAtTime(.001, now + .16);
  oscillator.start(now); oscillator.stop(now + .18);
}

function syncPads() {
  padAnimations.clear();
  $('pad-layer').replaceChildren();
  game.map.pads.forEach(([x,y], i) => {
    const button = document.createElement('button');
    button.className = 'pad-button';
    button.dataset.pad = i;
    button.innerHTML = `<img class="pad-art" src="${PAD_IMAGES[0]}" alt="" draggable="false"><span></span>`;
    button.addEventListener('click', () => selectPad(i));
    const animate = () => { hovered=i; if (!game.towerAt(i) && !padAnimations.has(i)) padAnimations.set(i,performance.now()); };
    const rest = () => { hovered=-1; if (document.activeElement!==button) {padAnimations.delete(i);const image=button.querySelector('.pad-art');image.src=PAD_IMAGES[0];image.dataset.frame='0';} };
    button.addEventListener('pointerenter', animate);
    button.addEventListener('pointerleave', rest);
    button.addEventListener('focus', animate);
    button.addEventListener('blur', rest);
    $('pad-layer').append(button);
  });
  updatePadLabels();
  updatePadPositions();
}

function updatePadPositions() {
  if (!game) return;
  const { scale, width, height } = gameView.transform();
  for (const button of $('pad-layer').children) {
    const coordinates = game.map.pads[Number(button.dataset.pad)];
    if (!coordinates) { button.hidden = true; continue; }
    const [x, y] = coordinates;
    const point = gameView.worldToScreen(x,y);
    button.style.left = `${point.x}px`; button.style.top = `${point.y}px`;
    button.style.width = `${Math.max(32, PAD_WIDTH * scale * .78)}px`;
    button.style.height = `${Math.max(32, PAD_HEIGHT * scale * .78)}px`;
    button.hidden = point.x < -PAD_WIDTH*scale/2 || point.x > width+PAD_WIDTH*scale/2 || point.y < -PAD_HEIGHT*scale/2 || point.y > height+PAD_HEIGHT*scale/2;
  }
}

function updateZoomControls() {
  const view = gameView.transform();
  $('zoom-label').textContent = `${Math.round(view.zoom * 100)}%`;
  $('zoom-out').disabled = view.zoom <= view.minZoom + .001;
  $('zoom-in').disabled = view.zoom >= MAX_ZOOM - .001;
}

function zoomGame(factor) {
  const anchor=game&&selected>=0?gameView.worldToScreen(...selectorAnchor(game,selected)):undefined;
  gameView.zoomBy(factor,anchor);
}

function updatePadLabels() {
  for (const button of $('pad-layer').children) {
    const pad = Number(button.dataset.pad), tower = game.towerAt(pad);
    if(tower) padAnimations.delete(pad);
    button.classList.toggle('occupied', !!tower);
    button.classList.toggle('selected', selected === pad);
    button.setAttribute('aria-pressed', String(selected === pad));
    button.setAttribute('aria-label', tower ? `${LEVELS[tower.level].name}, уровень ${tower.level+1}, площадка ${pad+1}` : `Построить башню — площадка ${pad+1}`);
    button.title = tower ? `${LEVELS[tower.level].name} · уровень ${tower.level+1}` : 'Свободная площадка · 90 золота';
    button.querySelector('span').textContent = tower ? roman[tower.level] : '';
    button.disabled = loading;
  }
}

function selectPad(pad) {
  if (loading) return;
  selected = selected === pad ? -1 : pad;
  updatePadLabels(); updateHud();
}

function updatePadAnimations(now) {
  for(const button of $('pad-layer').children) {
    const index=Number(button.dataset.pad), start=padAnimations.get(index);
    if(start==null || game.towerAt(index)) continue;
    const frame=padFrame((now-start)/1000), image=button.querySelector('.pad-art');
    if(image.dataset.frame!==String(frame)) {image.src=PAD_IMAGES[frame];image.dataset.frame=String(frame);}
  }
}

function clearSelection(restoreFocus = false) {
  const previous = selected;
  selected = -1;
  updatePadLabels(); updateHud();
  if (restoreFocus) $('pad-layer').querySelector(`[data-pad="${previous}"]`)?.focus({ preventScroll: true });
}

function updateTowerSelector() {
  towerSelector.sync(game, selected, { hidden: loading || game?.paused || !!document.querySelector('dialog[open]') });
}

function formatSeconds(n) { return `${n.toFixed(2).replace('.',',')} с`; }

function updateTowerPanel() {
  const tower = selected >= 0 ? game.towerAt(selected) : null;
  const level = tower?.level ?? 0, stats = LEVELS[level];
  $('tower-panel').hidden = !tower;
  $('tower-level').textContent = roman[level];
  $('tower-name').textContent = stats.name;
  $('tower-damage').textContent = stats.damage;
  $('tower-range').textContent = stats.range;
  $('tower-rate').textContent = formatSeconds(stats.cooldown);
}

function updateHud() {
  if (!game) return;
  $('gold').textContent = game.gold;
  $('lives').textContent = game.lives;
  $('wave').textContent = game.wave;
  $('kills-label').textContent = `${game.kills} побеждено`;
  $('phase-label').textContent = game.ended ? (game.status === 'victory' ? 'Рубеж защищён' : 'Оборона прорвана') : game.paused ? 'Пауза' : game.status === 'active' ? 'Волна идёт' : 'Подготовка';
  $('status-dot').classList.toggle('active', game.status === 'active' && !game.paused);
  $('pause-screen').hidden = !game.paused || game.ended || loading || !!document.querySelector('dialog[open]');
  $('pause-button').setAttribute('aria-label', game.paused ? 'Продолжить игру' : 'Пауза');
  $('pause-button').innerHTML = `<svg><use href="#i-${game.paused?'play':'pause'}"/></svg>`;
  $('pause-button').disabled = game.ended || loading;
  $('speed-button').textContent = `${speed}×`;
  $('speed-button').classList.toggle('active', speed > 1);
  $('speed-button').setAttribute('aria-label', `Скорость ${speed}. Нажми для ${speed===1?2:1}×`);
  const active = game.status === 'active';
  const plan = wavePlan(Math.min(TOTAL_WAVES, game.wave + (active ? 0 : 1)));
  $('next-wave-heading').textContent = game.ended ? 'Сражение завершено' : active ? `Волна ${game.wave}` : game.wave === 0 ? 'Первая волна' : `Следующая волна ${game.wave+1}`;
  $('wave-count').textContent = game.ended ? '' : active ? `Осталось ${game.remaining}` : `${plan.length} врагов`;
  const progress = game.waveTotal ? Math.round((game.waveTotal-game.remaining)/game.waveTotal*100) : 0;
  $('wave-progress-fill').style.width = `${progress}%`;
  $('wave-progress').setAttribute('aria-valuenow', progress);
  $('wave-button-label').textContent = game.ended ? '✓' : String(active ? game.wave : game.wave+1);
  $('wave-button').setAttribute('aria-label',game.ended ? 'Выбрать локацию' : active ? `Волна ${game.wave}` : `Начать волну ${game.wave+1}`);
  $('wave-button').disabled = loading || (!game.ended && (active || game.paused || !game.towers.length));
  $('wave-help').textContent = game.ended ? 'Попробуй другой маршрут.' : !game.towers.length ? 'Сначала построй хотя бы одну башню.' : active ? 'Можно строить и улучшать во время волны.' : `Награда за волну: ${35+(game.wave+1)*8} золота.`;
  const key = `${game.map.id}:${game.wave}:${game.status}`;
  if (lineupKey !== key) {
    lineupKey = key;
    const counts = {};
    for (const type of plan) counts[type] = (counts[type] || 0) + 1;
    $('enemy-lineup').innerHTML = Object.entries(counts).map(([type,count])=>`<span class="enemy-type" title="${ENEMY_TYPES[type].name}"><i class="enemy-swatch" style="--enemy:${ENEMY_TYPES[type].color}"></i><span>${count}</span></span>`).join('');
  }
  $('field-hint').innerHTML = game.ended ? 'Рубеж завершён. Выбери новую локацию или начни заново.' : selected >= 0 ? (game.towerAt(selected) ? 'Слева — удалить башню, справа — улучшить. <strong>Esc</strong> — закрыть' : 'Выбери жёлтый кристалл, чтобы построить башню. <strong>Esc</strong> — закрыть') : game.wave > 0 ? 'Нажми на башню, чтобы улучшить её или посмотреть радиус' : 'Нажми на земляную площадку, чтобы построить башню';
  updateTowerPanel();
  updateTowerSelector();
}

function showDialog(dialog) {
  if (!game || loading || dialog.open) return;
  dialog.dataset.resume = String(!game.paused && !game.ended);
  if (!game.ended) game.paused = true;
  dialog.showModal();
  updateHud();
}

for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('close', () => {
    if (game && !game.ended && dialog.dataset.resume === 'true' && !document.querySelector('dialog[open]')) game.paused = false;
    updateHud();
  });
  for (const close of dialog.querySelectorAll('.dialog-close')) close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => {
    if (e.target !== dialog || dialog.id === 'result-dialog') return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  });
}

function openMaps() {
  if (!game || loading) return;
  $('map-grid').innerHTML = MAPS.map(map => {
    const best = records[map.id];
    const record = best?.win ? `Защищено · ${best.bestLives}/20` : best ? `Рекорд: волна ${best.bestWave}` : 'Не пройдено';
    return `<button class="map-card ${map.id === game.map.id ? 'current' : ''}" data-map="${map.id}"><img src="${map.image}" alt="${map.name}">${map.id === game.map.id ? '<span class="current-label">Текущая локация</span>' : ''}<span class="map-card-body"><h3>${map.name}</h3><p>${map.description}</p><small>${map.difficulty}</small><small class="record">${record}</small></span></button>`;
  }).join('');
  for (const button of $('map-grid').children) button.addEventListener('click', () => {
    const map = MAPS.find(m => m.id === button.dataset.map);
    $('maps-dialog').close();
    selectMap(map);
  });
  showDialog($('maps-dialog'));
}

async function selectMap(map) {
  const version = ++loadVersion;
  loading = true;
  updateTowerSelector();
  if (game) game.paused = true;
  $('loading-screen').hidden = false;
  $('loading-text').textContent = 'Пробуждаем лес…';
  $('pad-layer').style.visibility = 'hidden';
  $('pause-screen').hidden = true;
  clearTimeout(toastTimer); $('toast').classList.remove('visible');
  try {
    const image = await loadImage(map.image);
    if (version !== loadVersion) return;
    mapImage = image;
    art.maps.set(map.id, image);
    game = new Game(map);
    gameView.reset();
    selected = -1; hovered = -1; speed = 1; lineupKey = '';
    $('map-title').textContent = map.name;
    $('map-subtitle').textContent = map.difficulty;
    loading = false;
    syncPads(); updateHud();
    $('pad-layer').style.visibility = '';
    $('loading-screen').hidden = true;
    draw();
  } catch (error) { showLoadError(error); }
}

function showLoadError(error) {
  $('loading-screen').hidden = false;
  $('loading-text').textContent = `${error.message}. Обнови страницу, чтобы повторить.`;
  console.error(error);
}

function saveResult() {
  const previous = records[game.map.id] || {};
  records[game.map.id] = { bestWave: Math.max(previous.bestWave || 0, game.wave),
    win: previous.win || game.status === 'victory',
    bestLives: Math.max(previous.bestLives || 0, game.status === 'victory' ? game.lives : 0) };
  try { localStorage.setItem('forest-ward-records', JSON.stringify(records)); } catch { /* Gameplay works without storage. */ }
}

function showResult() {
  saveResult();
  const victory = game.status === 'victory';
  $('result-caption').textContent = victory ? 'Рубеж защищён' : 'Ещё одна попытка';
  $('result-title').textContent = victory ? 'Лес снова спокоен' : 'Оборона прорвана';
  $('result-description').textContent = victory ? `Все десять волн на локации «${game.map.name}» отражены.` : 'Враги добрались до выхода. Попробуй укрепить изгибы дороги и улучшить башни раньше.';
  $('result-stats').innerHTML = `<div><strong>${game.wave}/10</strong><span>Волны</span></div><div><strong>${game.kills}</strong><span>Побеждено</span></div><div><strong>${game.lives}/20</strong><span>Жизни</span></div>`;
  $('result-next').textContent = victory ? 'Следующая локация' : 'Попробовать снова';
  $('result-retry').textContent = victory ? 'Пройти ещё раз' : 'Выбрать локацию';
  showDialog($('result-dialog'));
}

function processEvents() {
  const events = game.events.splice(0);
  for (const event of events) {
    if (event.type === 'shot') tone('shot');
    if (event.type === 'build' || event.type === 'upgrade' || event.type === 'sell') {
      if(event.type==='sell') {
        padAnimations.delete(event.pad);
        const image=$('pad-layer').querySelector(`[data-pad="${event.pad}"] .pad-art`);
        if(image){image.src=PAD_IMAGES[0];image.dataset.frame='0';}
      }
      tone('build'); updatePadLabels();
    }
    if (event.type === 'wave-start') toast(`Волна ${event.wave}${event.wave === 5 || event.wave === 10 ? ' · идёт предводитель' : ''}`);
    if (event.type === 'wave-clear') toast(`Волна отражена! +${event.bonus} золота`);
    if (event.type === 'leak') {
      tone('leak');
      $('stage').classList.remove('leaked');
      void $('stage').offsetWidth;
      $('stage').classList.add('leaked');
    }
    if (event.type === 'victory' || event.type === 'defeat') showResult();
  }
}

function drawRange(pad) {
  if (pad < 0) return;
  const tower = game.towerAt(pad);
  const stats = LEVELS[tower?.level ?? 0];
  const [x,y] = game.map.pads[pad];
  ctx.save(); ctx.beginPath(); ctx.arc(x,y,stats.range,0,Math.PI*2);
  ctx.fillStyle = '#f6e3a816'; ctx.fill(); ctx.strokeStyle = '#fff3cba8';
  ctx.lineWidth = 2; ctx.setLineDash([8,8]); ctx.stroke();
  ctx.setLineDash([]); ctx.beginPath(); ctx.ellipse(x,y,57,40,0,0,Math.PI*2);
  ctx.strokeStyle = '#fff2bd'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
}

function drawTower(tower) {
  const h = towerHeight(tower), image = art.towers[tower.level];
  const w = h * image.width / image.height;
  const y = tower.y + 25 - h;
  const building = tower.constructionAge < CONSTRUCTION_DURATION;
  const upgrading = !building && tower.upgradeAge < UPGRADE_DURATION;
  const reveal = building ? constructionReveal(tower.constructionAge) : 1;
  const blend = upgrading ? upgradeReveal(tower.upgradeAge) : 1;
  if (upgrading) {
    const previous = art.towers[tower.upgradeFrom];
    const oldHeight = towerHeight({...tower, level:tower.upgradeFrom});
    const oldWidth = oldHeight * previous.width / previous.height;
    ctx.save(); ctx.globalAlpha = 1-blend;
    ctx.drawImage(previous, tower.x-oldWidth/2, tower.y+25-oldHeight, oldWidth, oldHeight);
    ctx.restore();
  }
  ctx.save();
  ctx.globalAlpha = reveal * blend;
  ctx.fillStyle = '#17271832'; ctx.beginPath(); ctx.ellipse(tower.x,tower.y+11,w*.38,14,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.rect(tower.x-w/2, tower.y+25-h*reveal, w, h*reveal); ctx.clip();
  ctx.drawImage(image,tower.x-w/2,y,w,h);
  if (tower.pulse > 0 && !building && !upgrading) {
    ctx.globalAlpha = Math.sin(Math.min(1,tower.pulse/.32)*Math.PI)*.9;
    ctx.drawImage(art.peaks[tower.level],tower.x-w/2,y,w,h);
  }
  ctx.restore();
  if (building || upgrading) {
    const images = building ? art.construction : art.upgrades;
    const animationFrame = building ? constructionFrame(tower.constructionAge) : upgradeFrame(tower.upgradeAge);
    const size = h * 1.18;
    ctx.save();
    // All fifteen frames share the same base anchor; camera zoom scales both art layers.
    ctx.drawImage(images[animationFrame], tower.x-size*.5, tower.y+25-size*(460/512), size, size);
    ctx.restore();
    drawWorkTimer(tower, building);
  }
}

function drawWorkTimer(tower, building) {
  const duration = building ? CONSTRUCTION_DURATION : UPGRADE_DURATION;
  const age = building ? tower.constructionAge : tower.upgradeAge;
  const remaining = Math.max(0, duration-age);
  const label = `${building ? 'Строительство' : 'Улучшение'} · ${remaining.toFixed(1).replace('.',',')} с`;
  ctx.save();
  ctx.translate(tower.x, tower.y+35);
  // Keep the countdown readable on phones at any map zoom.
  const scale = gameView.transform().scale;
  ctx.scale(1/scale,1/scale);
  ctx.fillStyle = '#203b30eb';
  ctx.fillRect(-65,0,130,30);
  ctx.font = '11px "Segoe UI", sans-serif'; ctx.textAlign = 'center';
  ctx.fillStyle = '#fff0cc'; ctx.fillText(label,0,13);
  ctx.fillStyle = '#eed49b33'; ctx.fillRect(-57,21,114,3);
  ctx.fillStyle = '#efd594'; ctx.fillRect(-57,21,114*Math.min(1,age/duration),3);
  ctx.restore();
}

function drawEnemy(enemy) {
  const stats = ENEMY_TYPES[enemy.type], s = stats.size;
  const step = Math.sin(enemy.distance*.15)*3;
  ctx.save(); ctx.translate(enemy.x,enemy.y);
  ctx.fillStyle = '#17271945'; ctx.beginPath(); ctx.ellipse(0,1,s*.67,s*.22,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle = '#3f3930';
  ctx.fillRect(-s*.29,-s*.22+step,s*.22,s*.4);
  ctx.fillRect(s*.07,-s*.22-step,s*.22,s*.4);
  ctx.fillStyle = enemy.hit ? '#eeddbc' : stats.color;
  ctx.fillRect(-s*.5,-s*1.05,s,s*.88);
  ctx.fillStyle = '#00000020'; ctx.fillRect(-s*.5,-s*.36,s,s*.2);
  ctx.fillStyle = enemy.hit ? '#fff2cf' : '#dfc298';
  ctx.fillRect(-s*.29,-s*1.53,s*.58,s*.55);
  ctx.fillStyle = enemy.type === 'brute' || enemy.type === 'boss' ? '#444a46' : '#564333';
  ctx.fillRect(-s*.31,-s*1.56,s*.62,s*.17);
  ctx.fillStyle = '#3b352b'; ctx.fillRect(-s*.15,-s*1.29,2,2);ctx.fillRect(s*.09,-s*1.29,2,2);
  if (enemy.hp < enemy.maxHp || enemy.type === 'boss') {
    const width = Math.max(30,s*1.3), y = -s*1.85;
    ctx.fillStyle = '#263c30cc';ctx.fillRect(-width/2-1,y-1,width+2,6);
    ctx.fillStyle = '#bbd087';ctx.fillRect(-width/2,y,width*Math.max(0,enemy.hp/enemy.maxHp),4);
  }
  ctx.restore();
}

function drawArrow(x,y,angle,level,frame,impact = false) {
  const image = art.arrows[level][Math.max(0,Math.min(10,frame))];
  const w = 120 + level*17, h = w*.75;
  ctx.save(); ctx.translate(x,y);ctx.rotate(angle);
  ctx.shadowColor = '#fff1bd80';ctx.shadowBlur = 5;
  ctx.drawImage(image,impact ? -w*.76 : -w*.5,-h*.5,w,h);ctx.restore();
}

function drawBuildingPads() {
  const now=performance.now();
  game.map.pads.forEach(([x,y],index)=>{
    const start=padAnimations.get(index);
    const frame=start==null || game.towerAt(index) ? 0 : padFrame((now-start)/1000);
    // Paint terrain and pads with the same world transform, without screen-size limits.
    ctx.drawImage(art.pads[frame],x-PAD_WIDTH/2,y-PAD_HEIGHT/2,PAD_WIDTH,PAD_HEIGHT);
  });
}

function draw() {
  if (!game || !mapImage || !art.towers.length) return;
  gameView.prepare(ctx);ctx.drawImage(mapImage,0,0,1536,1024);
  drawBuildingPads();
  const hoveringEmpty = hovered>=0 && !game.towerAt(hovered);
  if (!game.ended && !hoveringEmpty && selected>=0 && game.towerAt(selected)) drawRange(selected);
  if (new URLSearchParams(location.search).has('debug')) {
    ctx.save();ctx.lineWidth=3;ctx.strokeStyle='#ea476dcc';
    for(const path of game.paths){ctx.beginPath();path.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();}
    ctx.restore();
  }
  for (const path of game.paths) {
    const p = pointOnPath(path,160);
    ctx.save();ctx.translate(p.x,p.y+40);
    if(Math.cos(p.angle)<0) ctx.scale(-1,1);
    ctx.drawImage(art.entrance,-48,-76,96,96);ctx.restore();
  }
  const actors = [...game.towers.map(t=>({y:t.y,draw:()=>drawTower(t)})),...game.enemies.map(e=>({y:e.y,draw:()=>drawEnemy(e)}))];
  actors.sort((a,b)=>a.y-b.y);for(const actor of actors) actor.draw();
  for (const shot of game.projectiles) {
    const frame = shot.age < .11 ? Math.min(1,Math.floor(shot.age/.055)) : 2 + Math.floor((shot.age-.11)*16)%5;
    drawArrow(shot.x,shot.y,shot.angle,shot.level,frame);
  }
  for (const effect of game.effects) {
    if(effect.kind==='impact') drawArrow(effect.x,effect.y,effect.angle,effect.level,7+Math.min(3,Math.floor(effect.age/.085)),true);
    else {
      ctx.save();ctx.globalAlpha=1-effect.age/effect.duration;ctx.font='bold 20px "Segoe UI",sans-serif';ctx.textAlign='center';ctx.strokeStyle='#29452ce0';ctx.lineWidth=4;ctx.fillStyle='#fff0ad';
      ctx.strokeText(effect.text,effect.x,effect.y-effect.age*37);ctx.fillText(effect.text,effect.x,effect.y-effect.age*37);ctx.restore();
    }
  }
}

function frame(now) {
  const dt = lastTime ? Math.min((now-lastTime)/1000,.07) : 0; lastTime=now;
  if(game && !loading) {
    game.update(dt*speed,speed);processEvents();updatePadAnimations(now);draw();
    hudElapsed+=dt;if(hudElapsed>.1){updateHud();hudElapsed=0;}
  }
  requestAnimationFrame(frame);
}

function towerAction() {
  if (!game || loading || selected < 0 || game.paused || document.querySelector('dialog[open]')) return;
  const tower=game.towerAt(selected);
  const done=tower?game.upgrade(selected):game.build(selected);
  if(done){processEvents();updateHud();draw();}
}
function sellTower() {
  if (!game || loading || selected < 0 || game.paused || document.querySelector('dialog[open]')) return;
  if (game.sell(selected)) { processEvents(); clearSelection(); draw(); }
}
function togglePause() { if(game && !loading && !game.ended){game.paused=!game.paused;updateHud();} }
function toggleSpeed() {speed=speed===1?2:1;updateHud();}

$('zoom-in').addEventListener('click',()=>zoomGame(1.25));
$('zoom-out').addEventListener('click',()=>zoomGame(.8));
$('zoom-fit').addEventListener('click',()=>{clearSelection();gameView.fit();});
$('fullscreen-button').addEventListener('click',async()=>{
  try { if(document.fullscreenElement)await document.exitFullscreen();else await $('stage').requestFullscreen(); }
  catch { toast('Полный экран недоступен в этом браузере.'); }
});
document.addEventListener('fullscreenchange',()=>{
  const active=!!document.fullscreenElement;
  $('fullscreen-button').setAttribute('aria-pressed',String(active));
  $('fullscreen-button').setAttribute('aria-label',active?'Выйти из полноэкранного режима':'Развернуть игру на весь экран');
});
$('wave-button').addEventListener('click',()=>{if(game.ended)openMaps();else {game.startWave();processEvents();updateHud();}});
$('pause-button').addEventListener('click',togglePause);
$('resume-button').addEventListener('click',togglePause);
$('speed-button').addEventListener('click',toggleSpeed);
$('maps-button').addEventListener('click',openMaps);
$('restart-button').addEventListener('click',()=>showDialog($('restart-dialog')));
$('restart-confirm').addEventListener('click',()=>{$('restart-dialog').close();selectMap(game.map);});
$('result-close').addEventListener('click',()=>$('result-dialog').close());
$('result-next').addEventListener('click',()=>{const map=game.status==='victory'?MAPS[(MAPS.indexOf(game.map)+1)%MAPS.length]:game.map;$('result-dialog').close();selectMap(map);});
$('result-retry').addEventListener('click',()=>{const won=game.status==='victory';$('result-dialog').close();if(won)selectMap(game.map);else openMaps();});
$('sound-button').addEventListener('click',async()=>{
  soundEnabled=!soundEnabled;
  try {if(soundEnabled){audioContext ||= new (window.AudioContext || window.webkitAudioContext)();await audioContext.resume();tone('build');}}
  catch{soundEnabled=false;toast('Звук недоступен в этом браузере.');}
  $('sound-button').setAttribute('aria-pressed',String(soundEnabled));
  $('sound-button').setAttribute('aria-label',soundEnabled?'Выключить звук':'Включить звук');
  $('sound-button').innerHTML=`<svg><use href="#i-${soundEnabled?'sound':'mute'}"/></svg>`;
});
canvas.addEventListener('click',e=>{
  if(!game||loading)return;
  const bounds=canvas.getBoundingClientRect(),{x,y}=gameView.screenToWorld(e.clientX-bounds.left,e.clientY-bounds.top);
  const tower=[...game.towers].sort((a,b)=>b.y-a.y).find(t=>Math.abs(t.x-x)<towerHeight(t)*.3&&y<t.y+25&&y>t.y+25-towerHeight(t));
  if(tower)selectPad(tower.pad);else clearSelection();
});
document.addEventListener('keydown',e=>{
  if(!game||loading||document.querySelector('dialog[open]')||e.ctrlKey||e.metaKey||e.altKey||e.repeat)return;
  if(e.code==='Space' && !$('tower-selector').contains(document.activeElement) && !['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();togglePause();}
  if(e.code==='KeyX')toggleSpeed();
  if(e.code==='Equal'||e.code==='NumpadAdd')zoomGame(1.25);
  if(e.code==='Minus'||e.code==='NumpadSubtract')zoomGame(.8);
  if(e.code==='KeyN'&&game.towers.length){game.startWave();updateHud();}
  if(e.code==='KeyU'||e.code==='KeyB')towerAction();
  if(e.code==='Escape') clearSelection(true);
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&game?.status==='active'&&!game.paused){game.paused=true;updateHud();}});

if(new URLSearchParams(location.search).has('debug')) Object.defineProperty(window,'forestWard',{get:()=>({game,art,selected,loading,speed,view:gameView})});

async function init(){
  requestAnimationFrame(frame);
  try{await loadArt();await selectMap(MAPS[0]);}catch(error){showLoadError(error);}
}
init();


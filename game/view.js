const MAP_WIDTH = 1536, MAP_HEIGHT = 1024;
import { visibleMapBounds } from './hud-frame.js';
export const MAX_ZOOM = 3;

export function viewTransform(width, height, zoom = 1, centerX = 768, centerY = 512) {
  const baseScale = Math.max(width / MAP_WIDTH, height / MAP_HEIGHT);
  const fitZoom = Math.min(width / MAP_WIDTH, height / MAP_HEIGHT) / baseScale;
  const scale = baseScale * zoom;
  const minZoom=Math.max(fitZoom*.65,Math.min(width,320)/(MAP_WIDTH*baseScale));
  return { width, height, zoom, scale, fitZoom, minZoom, offsetX: width / 2 - centerX * scale, offsetY: height / 2 - centerY * scale };
}

export function createGameView({ stage, canvas, onChange }) {
  let width = 1, height = 1, zoom = 1, centerX = 768, centerY = 512, dpr = 1;
  let dragging = false, travelled = 0, suppressClickUntil = 0;
  const pointers = new Map();
  const transform = () => viewTransform(width, height, zoom, centerX, centerY);
  const worldToScreen = (x, y) => { const t = transform(); return { x: x * t.scale + t.offsetX, y: y * t.scale + t.offsetY }; };
  const screenToWorld = (x, y) => { const t = transform(); return { x: (x - t.offsetX) / t.scale, y: (y - t.offsetY) / t.scale }; };
  const emit = (reason = 'pan') => onChange?.(transform(), reason);
  function clampCenter() {
    const scale=transform().scale;
    const clamp=(value,total,half)=>Math.max(Math.min(half,total-half),Math.min(Math.max(half,total-half),value));
    centerX=clamp(centerX,MAP_WIDTH,width/(2*scale));
    centerY=clamp(centerY,MAP_HEIGHT,height/(2*scale));
  }
  function measure() {
    const rect = stage.getBoundingClientRect();
    width = Math.max(1, rect.width); height = Math.max(1, rect.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    zoom = Math.max(transform().minZoom, Math.min(MAX_ZOOM, zoom));
    clampCenter();
    emit('resize');
  }
  function setZoom(next, anchor = { x: width / 2, y: height / 2 }) {
    const before = screenToWorld(anchor.x, anchor.y);
    zoom = Math.max(transform().minZoom, Math.min(MAX_ZOOM, next));
    const scale = transform().scale;
    centerX = before.x - (anchor.x - width / 2) / scale;
    centerY = before.y - (anchor.y - height / 2) / scale;
    clampCenter();
    emit('zoom');
  }
  function pan(dx, dy) {
    const scale = transform().scale;
    centerX -= dx/scale;centerY -= dy/scale;clampCenter();
    emit();
  }
  const local = event => { const rect = stage.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, local(event));
    if (pointers.size === 1) { dragging = false; travelled = 0; }
  });
  canvas.addEventListener('pointermove', event => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const next = local(event);
    const oldPoints = [...pointers.values()];
    pointers.set(event.pointerId, next);
    const dx = next.x - previous.x, dy = next.y - previous.y;
    travelled += Math.hypot(dx, dy);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], [oldA, oldB] = oldPoints;
      const beforeDistance = Math.hypot(oldA.x - oldB.x, oldA.y - oldB.y);
      const afterDistance = Math.hypot(a.x - b.x, a.y - b.y);
      if (beforeDistance > 5) setZoom(zoom * afterDistance / beforeDistance, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      dragging = true;
    } else if (travelled > 5) { dragging = true; pan(dx, dy); }
  });
  const release = event => {
    pointers.delete(event.pointerId);
    if (dragging) suppressClickUntil = performance.now() + 150;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
  stage.addEventListener('click', event => {
    if (performance.now() < suppressClickUntil && event.target === canvas) { event.preventDefault(); event.stopPropagation(); }
  }, true);
  stage.addEventListener('wheel', event => {
    if (event.target.closest('button, .tower-selector')) return;
    event.preventDefault();
    setZoom(zoom * Math.exp(-event.deltaY * .0015), local(event));
  }, { passive: false });
  new ResizeObserver(measure).observe(stage);
  return {
    transform, worldToScreen, screenToWorld,
    zoomBy: (factor, anchor) => setZoom(zoom * factor, anchor),
    fit() { zoom = transform().fitZoom; centerX = 768; centerY = 512; emit('fit'); },
    reset() { zoom = 1; centerX = 768; centerY = 512; emit('reset'); },
    reveal(x, y, menuSize) {
      let bounds=visibleMapBounds(transform());
      const minimumHeight=menuSize+(width<620?320:height<480?150:245);
      if(bounds.height<Math.min(height,minimumHeight)) {
        const before=worldToScreen(x,y);
        zoom=Math.min(MAX_ZOOM,zoom*Math.min(height,minimumHeight)/Math.max(1,bounds.height));
        const scale=transform().scale;
        centerX=x-(before.x-width/2)/scale;centerY=y-(before.y-height/2)/scale;
        clampCenter();bounds=visibleMapBounds(transform());
      }
      for(let attempt=0;attempt<4;attempt++) {
        const t=transform();bounds=visibleMapBounds(t);
        menuSize=Math.min(224,Math.max(132,210*t.scale));
        const half=menuSize/2+10, landscape=bounds.height<480&&bounds.width>=480;
        const top=landscape?68:bounds.width<620?145:125, bottom=landscape?100:bounds.width<620?140:100;
        const required=Math.max(t.scale,half/Math.max(1,x),half/Math.max(1,1536-x),(top+half)/Math.max(1,y),(bottom+half)/Math.max(1,1024-y));
        if(required<=t.scale+.001 || zoom>=MAX_ZOOM) break;
        const before=worldToScreen(x,y);
        zoom=Math.min(MAX_ZOOM,zoom*required/t.scale);
        const scale=transform().scale;
        centerX=x-(before.x-width/2)/scale;centerY=y-(before.y-height/2)/scale;
        clampCenter();
      }
      bounds=visibleMapBounds(transform());
      const point = worldToScreen(x, y), half = menuSize / 2 + 10;
      const landscape=bounds.height<480&&bounds.width>=480;
      const top = landscape?68:bounds.width<620?145:125;
      const bottom = landscape?100:bounds.width<620?140:100;
      const clamp = (n, min, max) => min > max ? (min + max) / 2 : Math.max(min, Math.min(max, n));
      const targetX = clamp(point.x, bounds.left+half, bounds.left+bounds.width-half);
      const targetY = clamp(point.y, bounds.top+top+half, bounds.top+bounds.height-bottom-half);
      const scale = transform().scale;
      centerX += (point.x - targetX) / scale;
      centerY += (point.y - targetY) / scale;
      clampCenter();emit('reveal');
    },
    prepare(ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const t = transform();
      ctx.setTransform(dpr * t.scale, 0, 0, dpr * t.scale, dpr * t.offsetX, dpr * t.offsetY);
    },
  };
}

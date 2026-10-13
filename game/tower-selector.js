import { LEVELS } from './maps.js?v=20261014-landscape-1';
import { towerHeight } from './engine.js?v=20261014-landscape-1';
import { viewTransform } from './view.js?v=20261014-landscape-1';

const BUILD_ART = 'assets/ui/tower-selector/layers/build-frame-512.png';
const BROKEN_ICON = 'assets/ui/tower-selector/layers/broken-yellow-512.png';
const crystalIcon = (color, level = 1) => `assets/towers/towers/crystal-variants/${color}-crystals${level > 1 ? `-${level}` : color === 'violet' ? '-' : ''}.png`;
export const SELECTOR_IMAGES = [BUILD_ART, BROKEN_ICON, ...['yellow','red','violet','blue'].map(color => crystalIcon(color)), crystalIcon('yellow',2), crystalIcon('yellow',3)];
const lockIcon = '<svg aria-hidden="true"><use href="#i-lock"/></svg>';

export function selectorState(game, pad) {
  if (!game || !game.map.pads[pad] || game.ended) return null;
  const tower = game.towerAt(pad);
  const affordable = cost => game.gold >= cost;
  if (!tower) {
    const cost = LEVELS[0].cost;
    return {
      mode: 'build', image: BUILD_ART, defaultAction: 'build',
      options: [
        { action: 'build', position: 'top', icon: crystalIcon('yellow'), label: 'Жёлтая башня', caption: 'Построить', price: cost, disabled: !affordable(cost), reason: `Не хватает ${Math.max(0, cost - game.gold)} золота` },
        ...[['red', 'right', 'Красная'], ['violet', 'bottom', 'Фиолетовая'], ['blue', 'left', 'Синяя']].map(([color, position, name]) => ({
          action: color, position, icon: crystalIcon(color), label: `${name} башня`, caption: 'Под замком', disabled: true, locked: true, reason: `${name} башня пока недоступна`,
        })),
      ],
    };
  }
  const next = LEVELS[tower.level + 1];
  return {
    mode: 'actions', image: BUILD_ART, defaultAction: next ? 'upgrade' : 'sell',
    options: [
      { action: 'sell', position: 'left', icon: BROKEN_ICON, label: 'Удалить башню', caption: 'Удалить', price: `+${Math.round(tower.invested * .7)}` },
      { action: 'upgrade', position: 'right', icon: crystalIcon('yellow',Math.min(tower.level + 2,3)), label: next ? `Улучшить башню до уровня ${tower.level + 2}` : 'Максимальный уровень', caption: next ? `Улучшить · ${tower.level + 2}` : 'Максимум', price: next?.cost, disabled: !next || !affordable(next.cost), locked: !next, reason: next ? `Не хватает ${Math.max(0, next.cost - game.gold)} золота` : 'Башня уже улучшена до максимума' },
    ],
  };
}

export function selectorPosition(width, height, x, y, transform = viewTransform(width,height)) {
  const size = Math.max(0, Math.min(224, Math.max(132, 210 * transform.scale), width - 16, height - 16));
  return { size, x: x * transform.scale + transform.offsetX, y: y * transform.scale + transform.offsetY };
}

export function selectorAnchor(game, pad) {
  const tower = game.towerAt(pad);
  return tower ? [tower.x, tower.y + 25 - towerHeight(tower) / 2] : game.map.pads[pad];
}

export function createTowerSelector({ element, stage, view, onAction, onClose, onUnavailable }) {
  const image = element.querySelector('.selector-art');
  const options = element.querySelector('.selector-options');
  const label = element.querySelector('#selector-label');
  const price = element.querySelector('#selector-price');
  let state = null, pad = -1, anchor = null, key = '', activeAction = '';

  function position() {
    if (!anchor || element.hidden) return;
    const rect = stage.getBoundingClientRect();
    const point = selectorPosition(rect.width, rect.height, ...anchor, view.transform());
    // Keep the menu reachable at screen edges without changing the player's camera.
    const half = point.size / 2;
    point.x = Math.max(half + 8, Math.min(rect.width - half - 8, point.x));
    point.y = Math.max(half + 8, Math.min(rect.height - half - 42, point.y));
    element.style.setProperty('--selector-size', `${point.size}px`);
    element.style.width = `${point.size}px`;
    element.style.height = `${point.size}px`;
    element.style.left = `${point.x}px`;
    element.style.top = `${point.y}px`;
  }

  function highlight(action = state?.defaultAction, illuminate = false) {
    const option = state?.options.find(item => item.action === action);
    if (!option) return;
    activeAction = action;
    label.textContent = option.caption;
    price.textContent = option.price == null ? '' : `${option.price} зол.`;
    image.src = state.image;
    for (const button of options.children) button.classList.toggle('is-hovered', illuminate && button.dataset.action === action && !option.disabled);
  }

  function resetHighlight() {
    const focused = options.contains(document.activeElement) ? document.activeElement.dataset.action : null;
    highlight(focused || state?.defaultAction, !!focused);
  }

  function render() {
    const focused = options.contains(document.activeElement) ? document.activeElement.dataset.action : null;
    options.replaceChildren(...state.options.map(option => {
      const button = document.createElement('button');
      button.className = `selector-option selector-${option.position}${option.locked ? ' locked' : ''}`;
      button.dataset.action = option.action;
      button.setAttribute('role', 'menuitem');
      button.innerHTML = `<img class="selector-crystal" src="${option.icon}" alt="" draggable="false"><span class="selector-badge"></span><span class="selector-action-copy"><span></span><strong></strong></span>`;
      button.addEventListener('pointerenter', () => highlight(option.action, true));
      button.addEventListener('pointerleave', resetHighlight);
      button.addEventListener('focus', () => highlight(option.action, true));
      button.addEventListener('blur', resetHighlight);
      button.addEventListener('click', event => {
        event.stopPropagation();
        // Read current state: gold and upgrades may change while the menu is open.
        const current = state.options.find(item => item.action === option.action);
        if (current.disabled) onUnavailable(current.reason);
        else onAction(current.action);
      });
      return button;
    }));
    if (focused) (options.querySelector(`[data-action="${focused}"]`) || options.querySelector(`[data-action="${state.defaultAction}"]`))?.focus({ preventScroll: true });
  }

  element.querySelector('.selector-close').addEventListener('click', event => { event.stopPropagation(); onClose(); });
  element.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    const direction = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!direction) return;
    event.preventDefault();
    const buttons = [...options.children];
    const index = buttons.indexOf(document.activeElement);
    buttons[(index + direction + buttons.length) % buttons.length]?.focus({ preventScroll: true });
  });
  new ResizeObserver(position).observe(stage);

  return {
    reposition() {
      position();
    },
    sync(game, selected, { hidden = false } = {}) {
      const next = hidden ? null : selectorState(game, selected);
      if (!next) { element.hidden = true; pad = -1; return; }
      const opening = element.hidden || pad !== selected;
      const nextKey = `${selected}:${next.mode}:${next.options.map(option => option.icon).join(',')}`;
      state = next; pad = selected; anchor = selectorAnchor(game, selected);
      element.hidden = false;
      element.dataset.mode = state.mode;
      element.setAttribute('aria-label', state.mode === 'build' ? 'Выбрать башню для строительства' : 'Улучшение и удаление башни');
      if (key !== nextKey) { key = nextKey; render(); }
      for (const button of options.children) {
        const option = state.options.find(item => item.action === button.dataset.action);
        button.setAttribute('aria-disabled', String(!!option.disabled));
        button.setAttribute('aria-label', `${option.label}${option.price == null ? '' : `, ${option.price} золота`}${option.disabled ? `, ${option.reason}` : ''}`);
        button.title = option.disabled ? option.reason : `${option.label} · ${option.price} золота`;
        button.classList.toggle('unavailable', !!option.disabled);
        button.classList.toggle('locked', !!option.locked);
        button.querySelector('.selector-badge').innerHTML = option.locked ? lockIcon : '';
        const copy = button.querySelector('.selector-action-copy');
        copy.firstElementChild.textContent = option.caption;
        copy.lastElementChild.textContent = option.price == null ? '' : `${option.price} зол.`;
      }
      if (!state.options.some(option => option.action === activeAction)) activeAction = state.defaultAction;
      highlight(opening ? state.defaultAction : activeAction, !opening && options.contains(document.activeElement));
      position();
      if (opening) options.querySelector(`[data-action="${state.defaultAction}"]`)?.focus({ preventScroll: true });
    },
  };
}

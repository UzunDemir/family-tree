/**
 * Семейное древо Узун — D3.js v2 (живое древо)
 *
 * Правила:
 *   - ЛЮБОЙ узел ВСЕГДА ниже родителя
 *   - Сгенерированные узлы БЕЗ имён
 *   - Jitter: по X НЕТ, по Y только вниз
 *   - Карточки НЕ наезжают друг на друга
 *
 * Новое (wow):
 *   - Звёздное небо с параллаксом и падающими звёздами
 *   - Корни РАСТУТ: линия прорисовывается, карточка вылетает от родителя (back-ease)
 *   - Фокус-режим: клик подсвечивает линию предков, остальное плавно гаснет,
 *     по линии бежит свет, по карточкам идёт вспышка + ударная волна
 *   - Кинематографический спуск в бесконечность (клавиша C)
 *   - Fit-to-view (клавиша F), Esc — сброс
 *
 * Исправлено:
 *   - hashNoise возвращал диапазон [-3, 1] вместо [-1, 1], + слабое перемешивание
 *   - animatePulses был O(n²) на кадр -> кеш path
 *   - breathe() перебивал анимацию удаления -> единый цикл кадра
 *   - двойная генерация при клике (авто + ручная) -> автозагрузка только от пользователя
 *   - scaleExtent 0.15 не позволял увидеть глубокое древо -> 0.02 + fit
 *   - «Неизвестная предок» -> «Неизвестная прародительница»
 *   - дубли поиска в loadNextGeneration убраны
 *   - состояние (_born / _childrenLoaded) переносится при пересборке
 *
 * Ожидает глобально: familyData, buildHierarchy(), d3 v7 и DOM-элементы:
 *   #tree-container, #tooltip, #stats, #footer,
 *   #btn-reset, #btn-clear-generated, #btn-zoom-in, #btn-zoom-out, #btn-toggle-lines
 */

// === КОНФИГУРАЦИЯ ===
const CONFIG = {
  cardWidth: 140,
  cardHeight: 56,
  avatarRadius: 18,
  maxGeneration: 3,

  infinity: { minOpacity: 0.1, minScale: 0.25, opacityFalloff: 0.9, scaleFalloff: 0.75 },
  duration: { zoom: 750, highlight: 300, entrance: 600 },

  breathing: { enabled: true, baseAmp: 4, ampPerDepth: 3, minDuration: 4000, maxDuration: 7000 },
  pulse: { enabled: true, speed: 4000, radius: 3, glow: true },
  particles: { enabled: true, onHover: 8, onWave: 6 },
  wave: { stepDelay: 180, duration: 400 },

  grow: { linkMs: 700, nodeDelay: 260, nodeMs: 900, stagger: 140 },
  sky: { stars: 240, parallax: 0.06, shootingEvery: 5000 },

  infiniteRoots: { enabled: true, autoLoadDelay: 800, maxGenerations: 8 }
};

// === ИНИЦИАЛИЗАЦИЯ ===
const container = document.getElementById('tree-container');
const tooltip = d3.select('#tooltip');
const width = window.innerWidth;
const height = window.innerHeight;

container.style.position = container.style.position || 'relative';

const svg = d3.select('#tree-container')
  .append('svg')
  .attr('width', width)
  .attr('height', height)
  .style('position', 'relative')
  .style('z-index', 1);

const defs = svg.append('defs');
const glowFilter = defs.append('filter')
  .attr('id', 'glow')
  .attr('x', '-50%').attr('y', '-50%')
  .attr('width', '200%').attr('height', '200%');
glowFilter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
const feMerge = glowFilter.append('feMerge');
feMerge.append('feMergeNode').attr('in', 'blur');
feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

const g = svg.append('g').attr('class', 'main-group');
const linkLayer     = g.append('g').attr('class', 'links-layer');
const pulseLayer    = g.append('g').attr('class', 'pulse-layer');
const nodeLayer     = g.append('g').attr('class', 'nodes-layer');
const particleLayer = g.append('g').attr('class', 'particle-layer');

const offsetX = width / 2;
const offsetY = height * 0.1;

const now = () => performance.now();
const clamp01 = v => Math.max(0, Math.min(1, v));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// === ЗУМ ===
let currentT = d3.zoomIdentity;
let cinematicRunning = false;
let cinematicCancel = false;

const zoom = d3.zoom()
  .scaleExtent([0.02, 3])
  .on('zoom', (event) => {
    currentT = event.transform;
    g.attr('transform', event.transform);
    // автозагрузка ТОЛЬКО от действий пользователя (колесо/драг), не от программного зума
    if (CONFIG.infiniteRoots.enabled && event.transform.k > 1.2 && event.sourceEvent) {
      scheduleAutoLoad();
    }
  });

svg.call(zoom);
svg.on('wheel.cancelcine mousedown.cancelcine touchstart.cancelcine', () => { cinematicCancel = true; });

// === ШУМ (исправлен: диапазон строго [-1, 1), лучше перемешивание) ===
function hashNoise(id, seed = 0) {
  let h = (seed * 2654435761) | 0;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (((h >>> 0) % 100000) / 100000) * 2 - 1;
}

// === ПОСТРОЕНИЕ ===
let root = d3.hierarchy(buildHierarchy(familyData));

const CARD_MIN_DX = CONFIG.cardWidth + 40;

const treeLayout = d3.tree()
  .size([width * 0.95, height * 0.7])
  .separation((a, b) => {
    if (a.parent === b.parent) return CARD_MIN_DX / (width * 0.95);
    return (CARD_MIN_DX * 1.4) / (width * 0.95);
  });

treeLayout(root);

// === JITTER ===
const JITTER = {
  yByDepth:      [10, 15, 20, 25],
  rotateByDepth: [0, 1, 1.5, 2]
};

const GENERATION_STEP_Y = 55;
const GENERATION_STEP_Y_MIN = 50;
const PARENT_SIDE_OFFSET = 10;

function enforceNoOverlapX(root) {
  const byDepth = {};
  root.descendants().forEach(d => {
    (byDepth[d.depth] = byDepth[d.depth] || []).push(d);
  });

  Object.values(byDepth).forEach(nodesAtDepth => {
    nodesAtDepth.sort((a, b) => a.x - b.x);

    for (let i = 1; i < nodesAtDepth.length; i++) {
      const prev = nodesAtDepth[i - 1];
      const curr = nodesAtDepth[i];
      const dx = curr.x - prev.x;
      if (dx < CARD_MIN_DX) {
        const push = (CARD_MIN_DX - dx) / 2 + 1;
        prev.x -= push;
        curr.x += push;
      }
    }

    for (let i = 1; i < nodesAtDepth.length; i++) {
      const prev = nodesAtDepth[i - 1];
      const curr = nodesAtDepth[i];
      if (curr.x - prev.x < CARD_MIN_DX) curr.x = prev.x + CARD_MIN_DX;
    }
  });
}

function adjustAllPositions(root) {
  // 1. Реальные предки
  root.descendants()
    .filter(d => !d.data.isGenerated)
    .sort((a, b) => a.depth - b.depth)
    .forEach(node => {
      const depth = Math.min(node.depth, JITTER.yByDepth.length - 1);
      node.y += Math.abs(hashNoise(node.data.id, 2)) * JITTER.yByDepth[depth];

      const rotDepth = Math.min(node.depth, JITTER.rotateByDepth.length - 1);
      node.rotation = hashNoise(node.data.id, 3) * JITTER.rotateByDepth[rotDepth];

      if (node.parent) {
        const minY = node.parent.y + GENERATION_STEP_Y_MIN;
        if (node.y < minY) node.y = minY;
      }
    });

  // 2. Сгенерированные — адаптивный шаг
  root.descendants()
    .filter(d => d.data.isGenerated)
    .sort((a, b) => a.depth - b.depth)
    .forEach(node => {
      const parent = node.parent;
      if (!parent) return;

      const side = node.data.gender === 'male' ? -PARENT_SIDE_OFFSET : PARENT_SIDE_OFFSET;
      const yJitter = Math.abs(hashNoise(node.data.id, 12)) * 10;
      const depthFactor = Math.max(0.4, 1 - node.depth * 0.08);

      node.x = parent.x + side;
      node.y = parent.y + GENERATION_STEP_Y * depthFactor + yJitter;
      node.rotation = hashNoise(node.data.id, 13) * 3;
    });

  enforceNoOverlapX(root);

  // Финальная вертикаль
  root.descendants()
    .sort((a, b) => a.depth - b.depth)
    .forEach(node => {
      if (node.parent) {
        const minY = node.parent.y + GENERATION_STEP_Y_MIN * 0.7;
        if (node.y < minY) node.y = minY;
      }
    });
}

adjustAllPositions(root);

// === СОСТОЯНИЕ УЗЛОВ (переносится между пересборками) ===
function initState(newRoot, oldRoot) {
  const old = new Map();
  if (oldRoot) oldRoot.descendants().forEach(d => old.set(d.data.id, d));
  const t = now();
  newRoot.descendants().forEach(d => {
    const o = old.get(d.data.id);
    if (o) {
      d._born = o._born;
      d._childrenLoaded = o._childrenLoaded;
      d._flash = o._flash || 0;
    } else {
      d._born = oldRoot ? t : t + d.depth * CONFIG.grow.stagger;
      d._childrenLoaded = false;
      d._flash = 0;
    }
  });
}
initState(root, null);

// === БЕСКОНЕЧНОСТЬ ===
function getGenerationStyle(generation) {
  const t = generation / CONFIG.maxGeneration;
  const { minOpacity, minScale, opacityFalloff, scaleFalloff } = CONFIG.infinity;
  return {
    opacity: Math.max(minOpacity, 1 - t * opacityFalloff),
    scale: Math.max(minScale, 1 - t * scaleFalloff)
  };
}

// === СВЯЗИ ===
function organicLink(d) {
  const sx = d.source.x + offsetX;
  const sy = d.source.y + offsetY;
  const tx = d.target.x + offsetX;
  const ty = d.target.y + offsetY;

  const bendFactor = d.target.data.isGenerated ? 0.15 : 0.25;
  const midY = (sy + ty) / 2;
  const bend = (tx - sx) * bendFactor;

  return `M${sx},${sy} C${sx + bend},${midY} ${tx - bend},${midY} ${tx},${ty}`;
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0] ? parts[0][0].toUpperCase() : '?';
}

// ============================================
// === ПРОЦЕДУРНАЯ ГЕНЕРАЦИЯ ПРЕДКОВ ===
// ============================================
const IR = CONFIG.infiniteRoots;

function generateAncestor(childId, childBirth, childGeneration, side) {
  const gender = side === 'father' ? 'male' : 'female';
  const id = `gen_${childId}_${side}`;

  let birth = null;
  if (childBirth) {
    const yearMatch = String(childBirth).match(/\d{4}/);
    if (yearMatch) {
      const parentYear = parseInt(yearMatch[0]) - (25 + Math.abs(hashNoise(id, 5)) * 10);
      const day = String(Math.floor(Math.abs(hashNoise(id, 6)) * 28) + 1).padStart(2, '0');
      const month = String(Math.floor(Math.abs(hashNoise(id, 7)) * 12) + 1).padStart(2, '0');
      birth = `${day}.${month}.${Math.floor(parentYear)}`;
    }
  }

  return { id, name: '', birth, gender, generation: childGeneration + 1, isGenerated: true, children: [] };
}

function findInTree(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  for (const c of (node.children || [])) {
    const f = findInTree(c, id);
    if (f) return f;
  }
  return null;
}

function findInFamilyData(id) {
  let found = findInTree(familyData, id);
  if (found) return found;
  const extra = [
    ...(familyData.parents || []),
    ...(familyData.grandparents || []),
    ...(familyData.greatGrandparents || [])
  ];
  for (const p of extra) {
    found = findInTree(p, id);
    if (found) return found;
  }
  return null;
}

function loadNextGeneration(datum) {
  if (datum.depth >= IR.maxGenerations) return false;
  if (datum._childrenLoaded) return false;
  if (datum.data.children && datum.data.children.length > 0) return false;

  const target = findInFamilyData(datum.data.id);
  if (!target) return false;

  const father = generateAncestor(datum.data.id, datum.data.birth, datum.depth, 'father');
  const mother = generateAncestor(datum.data.id, datum.data.birth, datum.depth, 'mother');

  target.children = target.children || [];
  target.children.push(father, mother);
  datum._childrenLoaded = true;
  return true;
}

// === ПЕРЕСБОРКА ===
function rebuildTree() {
  const newRoot = d3.hierarchy(buildHierarchy(familyData));
  treeLayout(newRoot);
  adjustAllPositions(newRoot);
  initState(newRoot, root);
  root = newRoot;
}

function rebuildAndRender() {
  rebuildTree();
  renderTree();
}

// === АВТОЗАГРУЗКА ===
let autoLoadTimer = null;
function scheduleAutoLoad() {
  clearTimeout(autoLoadTimer);
  autoLoadTimer = setTimeout(() => {
    const candidates = root.descendants()
      .filter(d => !d._childrenLoaded)
      .filter(d => !d.data.children || d.data.children.length === 0)
      .sort((a, b) => b.depth - a.depth);

    let loaded = 0;
    for (const d of candidates) {
      if (loadNextGeneration(d)) loaded++;
      if (loaded >= 3) break;
    }
    if (loaded > 0) {
      rebuildAndRender();
      showDepthStatus();
    }
  }, IR.autoLoadDelay);
}

function manualLoad(datum) {
  if (loadNextGeneration(datum)) {
    rebuildAndRender();
    showDepthStatus();
    return true;
  }
  return false;
}

function showDepthStatus() {
  const deepest = root.descendants().reduce((m, d) => Math.max(m, d.depth), 0);
  const status = document.getElementById('infinite-status');
  if (status) {
    status.textContent = `🌌 Глубина рода: ${deepest + 1} поколений`;
    status.style.opacity = 1;
    setTimeout(() => { status.style.opacity = 0.4; }, 2000);
  }
}

// ============================================
// === РЕНДЕР ===
// ============================================
let links = linkLayer.selectAll('.link');
let nodes = nodeLayer.selectAll('.node');
let pulses = pulseLayer.selectAll('.pulse');
const pathCache = new Map();

function renderTree() {
  // Связи
  links = linkLayer.selectAll('.link').data(root.links(), d => d.target.data.id);
  links.exit().remove();

  const linksEnter = links.enter()
    .append('path')
    .attr('class', 'link')
    .attr('fill', 'none')
    .attr('stroke-linecap', 'round');

  links = linksEnter.merge(links);
  links
    .attr('d', organicLink)
    .attr('stroke', d => `rgba(74, 158, 255, ${getGenerationStyle(d.target.depth).opacity * 0.5})`)
    .attr('stroke-width', d => Math.max(0.5, 1.5 * getGenerationStyle(d.target.depth).scale));

  pathCache.clear();
  links.each(function (d) {
    this.__len = this.getTotalLength ? this.getTotalLength() : 0;
    pathCache.set(d.target.data.id, this);
  });

  // Узлы
  nodes = nodeLayer.selectAll('.node').data(root.descendants(), d => d.data.id);
  nodes.exit().remove();

  const nodesEnter = nodes.enter()
    .append('g')
    .attr('class', 'node')
    .attr('data-id', d => d.data.id)
    .style('opacity', 0)
    .style('cursor', 'pointer');

  nodesEnter.append('rect')
    .attr('class', 'card-bg')
    .attr('x', -CONFIG.cardWidth / 2)
    .attr('y', -CONFIG.cardHeight / 2)
    .attr('width', CONFIG.cardWidth)
    .attr('height', CONFIG.cardHeight)
    .attr('rx', 10);

  const avatarX = -CONFIG.cardWidth / 2 + 28;

  nodesEnter.append('circle')
    .attr('class', d => `avatar-circle ${d.data.gender}`)
    .attr('cx', avatarX).attr('cy', 0)
    .attr('r', CONFIG.avatarRadius);

  nodesEnter.append('text')
    .attr('class', 'avatar-text')
    .attr('x', avatarX).attr('y', 0)
    .text(d => getInitials(d.data.name));

  nodesEnter.append('text')
    .attr('class', 'card-name')
    .attr('x', avatarX + 26).attr('y', -6)
    .text(d => {
      if (!d.data.name) return '';
      const parts = d.data.name.split(' ');
      return parts.length > 1 ? `${parts[0]} ${parts[1]}` : d.data.name;
    });

  nodesEnter.append('text')
    .attr('class', 'card-date')
    .attr('x', avatarX + 26).attr('y', 10)
    .text(d => d.data.birth || '—');

  attachNodeHandlers(nodesEnter);

  nodes = nodesEnter.merge(nodes);

  renderPulses();
  updateStats();
}

function renderPulses() {
  if (!CONFIG.pulse.enabled) return;

  pulses = pulseLayer.selectAll('.pulse').data(root.links(), d => d.target.data.id);
  pulses.exit().remove();

  pulses = pulses.enter()
    .append('circle')
    .attr('class', d => (d.target.data.isGenerated ? 'pulse generated' : 'pulse real'))
    .attr('r', d => d.target.data.isGenerated ? CONFIG.pulse.radius : CONFIG.pulse.radius * 1.8)
    .attr('fill', d => {
      if (d.target.data.isGenerated) return '#6b6b8a';
      return d.target.data.gender === 'male' ? '#4a9eff' : '#ff6bb0';
    })
    .attr('opacity', 0)
    .attr('filter', d => (!d.target.data.isGenerated && CONFIG.pulse.glow) ? 'url(#glow)' : null)
    .merge(pulses);
}

function updateStats() {
  const total = root.descendants().length;
  const deepest = root.descendants().reduce((m, d) => Math.max(m, d.depth), 0);
  const el = document.getElementById('stats');
  if (el) el.textContent = `👥 ${total} человек · ${deepest + 1} поколений`;
}

// ============================================
// === ФОКУС (подсветка линии предков) ===
// ============================================
let focusSet = null; // Set id или null

function setFocus(node) {
  focusSet = node ? new Set(node.ancestors().map(a => a.data.id)) : null;
}

// ============================================
// === ЕДИНЫЙ ЦИКЛ КАДРА ===
// ============================================
let zoomActive = false;
svg.on('mousedown.breathing', () => { zoomActive = true; });
svg.on('mouseup.breathing',   () => { zoomActive = false; });
svg.on('mouseleave.breathing',() => { zoomActive = false; });
svg.on('touchend.breathing',  () => { zoomActive = false; });

const T0 = now();
const easeGrow = d3.easeBackOut.overshoot(1.4);
const easeLink = d3.easeCubicOut;

function frame(t) {
  // --- Узлы ---
  nodes.each(function (d) {
    const st = getGenerationStyle(d.depth);
    const k = easeGrow(clamp01((t - d._born - CONFIG.grow.nodeDelay) / CONFIG.grow.nodeMs));
    const kLin = clamp01((t - d._born - CONFIG.grow.nodeDelay) / CONFIG.grow.nodeMs);
    const dying = d._dying ? clamp01((t - d._dying) / 1800) : 0;

    const fx = d.x + offsetX, fy = d.y + offsetY;
    const p = d.parent;
    const px = p ? p.x + offsetX : fx;
    const py = p ? p.y + offsetY : fy;
    let x = px + (fx - px) * k;
    let y = py + (fy - py) * k;

    // дыхание (только по Y вниз и мелкий X — как раньше, но без конфликта с переходами)
    if (CONFIG.breathing.enabled && kLin >= 1 && !dying && !zoomActive) {
      const amp = CONFIG.breathing.baseAmp + d.depth * CONFIG.breathing.ampPerDepth;
      const finalAmp = Math.min(d.data.isGenerated ? amp * 0.4 : amp, 3);
      const dur = CONFIG.breathing.minDuration +
        (hashNoise(d.data.id, 7) + 1) / 2 * (CONFIG.breathing.maxDuration - CONFIG.breathing.minDuration);
      const ph = (hashNoise(d.data.id, 9) + 1) * Math.PI;
      const tt = (t - T0) / dur + ph;
      x += Math.sin(tt) * finalAmp;
      y += Math.abs(Math.cos(tt * 0.7)) * finalAmp;
    }

    // вспышка от волны + наведение
    const flash = d._flash ? Math.max(0, 1 - (t - d._flash) / 900) : 0;
    this.__hov = (this.__hov || 0) + ((this.__hovT || 0) - (this.__hov || 0)) * 0.18;

    // плавное затемнение вне фокуса
    const dimT = (focusSet && !focusSet.has(d.data.id)) ? 0.16 : 1;
    this.__dim = (this.__dim === undefined ? 1 : this.__dim) + (dimT - (this.__dim === undefined ? 1 : this.__dim)) * 0.12;

    const scale = st.scale * (0.2 + 0.8 * k) * (1 - 0.8 * dying) * (1 + 0.18 * flash + 0.07 * this.__hov);
    const rot = (d.rotation || 0) * kLin;

    this.setAttribute('transform', `translate(${x}, ${y}) rotate(${rot}) scale(${Math.max(0.001, scale)})`);
    this.style.opacity = st.opacity * clamp01(kLin * 1.6) * (1 - dying) * this.__dim;
    d._cx = x; d._cy = y;
  });

  // --- Связи ---
  links.each(function (d) {
    const tg = d.target;
    const k = easeLink(clamp01((t - tg._born) / CONFIG.grow.linkMs));
    const dying = tg._dying ? clamp01((t - tg._dying) / 1800) : 0;
    const len = this.__len || 0;
    const hl = focusSet && focusSet.has(tg.data.id);
    const dim = focusSet && !hl;

    let op = (1 - dying) * (dim ? 0.12 : 1);
    this.style.opacity = op;

    if (hl) {
      this.setAttribute('stroke', 'rgba(140, 216, 255, 0.95)');
      this.setAttribute('stroke-width', 2.6);
      this.setAttribute('stroke-dasharray', '5 11');
      this.setAttribute('stroke-dashoffset', -(t / 40) % 16);
      this.style.filter = 'drop-shadow(0 0 5px rgba(120,200,255,0.9))';
    } else {
      const s = getGenerationStyle(tg.depth);
      this.setAttribute('stroke', `rgba(74, 158, 255, ${s.opacity * 0.5})`);
      this.setAttribute('stroke-width', Math.max(0.5, 1.5 * s.scale));
      this.setAttribute('stroke-dashoffset', 0);
      this.style.filter = null;
      if (k < 1 && len) this.setAttribute('stroke-dasharray', `${len * k} ${len}`);
      else this.removeAttribute('stroke-dasharray');
    }
  });

  // --- Пульсы (path из кеша, без O(n²)) ---
  if (CONFIG.pulse.enabled) {
    pulseLayer.selectAll('.pulse').each(function (d) {
      const path = pathCache.get(d.target.data.id);
      if (!path || !path.__len) return;

      const grown = clamp01((t - d.target._born) / CONFIG.grow.linkMs);
      const isReal = !d.target.data.isGenerated;
      const speed = isReal ? CONFIG.pulse.speed * 0.6 : CONFIG.pulse.speed;
      const baseDelay = (hashNoise(d.target.data.id, 42) + 1) * 1000;
      const u = ((Date.now() + baseDelay) % speed) / speed;
      const pt = path.getPointAtLength(u * path.__len);
      const hl = focusSet && focusSet.has(d.target.data.id);
      const dim = focusSet && !hl;
      const maxOp = isReal ? 1.0 : 0.5;
      const op = Math.sin(u * Math.PI) * maxOp * (dim ? 0.1 : 1) * (grown >= 1 ? 1 : 0)
        * (d.target._dying ? 0 : 1);

      this.setAttribute('cx', pt.x);
      this.setAttribute('cy', pt.y);
      this.setAttribute('opacity', op);
    });
  }

  drawSky(t);
  requestAnimationFrame(frame);
}

// ============================================
// === ЗВЁЗДНОЕ НЕБО ===
// ============================================
const sky = document.createElement('canvas');
sky.style.cssText = 'position:absolute;inset:0;z-index:0;pointer-events:none;';
container.insertBefore(sky, svg.node());
const dpr = Math.min(window.devicePixelRatio || 1, 2);
sky.width = width * dpr;
sky.height = height * dpr;
sky.style.width = width + 'px';
sky.style.height = height + 'px';
const sctx = sky.getContext('2d');
sctx.scale(dpr, dpr);

const stars = Array.from({ length: CONFIG.sky.stars }, (_, i) => ({
  x: Math.random() * width * 1.4 - width * 0.2,
  y: Math.random() * height * 1.4 - height * 0.2,
  z: 0.15 + Math.random() * 0.85,
  r: 0.4 + Math.random() * 1.3,
  ph: Math.random() * Math.PI * 2,
  sp: 0.4 + Math.random() * 1.6,
  hue: [210, 230, 265, 190][i % 4]
}));

let shooting = null;
let nextShoot = now() + 2500;

function drawSky(t) {
  // фон
  const bg = sctx.createRadialGradient(width / 2, height * 0.35, 0, width / 2, height * 0.35, Math.max(width, height) * 0.9);
  bg.addColorStop(0, '#12183a');
  bg.addColorStop(0.55, '#0a0d24');
  bg.addColorStop(1, '#04050f');
  sctx.fillStyle = bg;
  sctx.fillRect(0, 0, width, height);

  // туманность (дышит)
  const pulse = 0.5 + 0.5 * Math.sin(t / 3500);
  const neb = sctx.createRadialGradient(width * 0.75, height * 0.25, 0, width * 0.75, height * 0.25, width * 0.4);
  neb.addColorStop(0, `rgba(120, 70, 220, ${0.10 + 0.05 * pulse})`);
  neb.addColorStop(1, 'rgba(120, 70, 220, 0)');
  sctx.fillStyle = neb;
  sctx.fillRect(0, 0, width, height);

  const neb2 = sctx.createRadialGradient(width * 0.2, height * 0.7, 0, width * 0.2, height * 0.7, width * 0.35);
  neb2.addColorStop(0, `rgba(40, 140, 255, ${0.08 + 0.04 * (1 - pulse)})`);
  neb2.addColorStop(1, 'rgba(40, 140, 255, 0)');
  sctx.fillStyle = neb2;
  sctx.fillRect(0, 0, width, height);

  // звёзды с параллаксом от зума/панорамы
  const ox = currentT.x * CONFIG.sky.parallax;
  const oy = currentT.y * CONFIG.sky.parallax;
  for (const s of stars) {
    const sx = ((s.x + ox * s.z) % (width * 1.4) + width * 1.4) % (width * 1.4) - width * 0.2;
    const sy = ((s.y + oy * s.z) % (height * 1.4) + height * 1.4) % (height * 1.4) - height * 0.2;
    const tw = 0.55 + 0.45 * Math.sin(t / 1000 * s.sp + s.ph);
    sctx.globalAlpha = tw * s.z;
    sctx.fillStyle = `hsl(${s.hue}, 80%, 85%)`;
    sctx.beginPath();
    sctx.arc(sx, sy, s.r * s.z, 0, Math.PI * 2);
    sctx.fill();
  }
  sctx.globalAlpha = 1;

  // падающая звезда
  if (!shooting && t > nextShoot) {
    shooting = { x: Math.random() * width * 0.8, y: Math.random() * height * 0.4, born: t };
    nextShoot = t + CONFIG.sky.shootingEvery * (0.6 + Math.random());
  }
  if (shooting) {
    const u = (t - shooting.born) / 900;
    if (u >= 1) shooting = null;
    else {
      const x = shooting.x + u * 320, y = shooting.y + u * 150;
      const grad = sctx.createLinearGradient(x, y, x - 110, y - 52);
      grad.addColorStop(0, `rgba(255,255,255,${1 - u})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      sctx.strokeStyle = grad;
      sctx.lineWidth = 1.6;
      sctx.beginPath();
      sctx.moveTo(x, y);
      sctx.lineTo(x - 110, y - 52);
      sctx.stroke();
    }
  }
}

// ============================================
// === ОБРАБОТЧИКИ ===
// ============================================
function flyTo(d, scale = 1.6, ms = CONFIG.duration.zoom) {
  const x = width / 2 - (d.x + offsetX) * scale;
  const y = height / 2 - (d.y + offsetY) * scale;
  return svg.transition().duration(ms).ease(d3.easeCubicInOut)
    .call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale)).end();
}

function ripple(d, color) {
  const cx = d.x + offsetX, cy = d.y + offsetY;
  for (let i = 0; i < 2; i++) {
    particleLayer.append('circle')
      .attr('cx', cx).attr('cy', cy).attr('r', 10)
      .attr('fill', 'none')
      .attr('stroke', color || '#8fd8ff')
      .attr('stroke-width', 2.2)
      .attr('opacity', 0.9)
      .transition().delay(i * 160).duration(1100).ease(d3.easeCubicOut)
      .attr('r', 150).attr('stroke-width', 0.3).attr('opacity', 0)
      .remove();
  }
}

function attachNodeHandlers(selection) {
  selection.on('mouseenter', function (event, d) {
    this.__hovT = 1;
    d3.select(this).raise();
    spawnParticles(d, CONFIG.particles.onHover);
  });

  selection.on('mouseleave', function () { this.__hovT = 0; });

  selection.on('click', (event, d) => {
    event.stopPropagation();
    cinematicCancel = true;

    flyTo(d).catch(() => {});
    animateAncestorWave(d);
    ripple(d, d.data.gender === 'male' ? '#4a9eff' : '#ff6bb0');

    if (CONFIG.infiniteRoots.enabled && !d._childrenLoaded) {
      setTimeout(() => manualLoad(d), 400);
    }
  });

  selection.on('mouseover', (event, d) => {
    const genLabel = d.depth === 0 ? 'Младшее поколение' : `${d.depth}-е поколение от младшего`;
    const genderLabel = d.data.gender === 'male' ? 'Мужской' : 'Женский';
    const generatedLabel = d.data.isGenerated
      ? '<div class="row" style="color:#a06bff">✨ Восстановлено по роду</div>' : '';
    const displayName = d.data.name
      || (d.data.gender === 'male' ? 'Неизвестный предок' : 'Неизвестная прародительница');

    tooltip
      .style('opacity', 1)
      .html(`
        <strong>${displayName}</strong>
        <div class="row">Дата рождения: <span>${d.data.birth || 'неизвестна'}</span></div>
        <div class="row">Поколение: <span>${genLabel}</span></div>
        <div class="row">Пол: <span>${genderLabel}</span></div>
        ${d.children ? `<div class="row">Предков выше: <span>${d.children.length}</span></div>` : ''}
        ${generatedLabel}
      `)
      .style('left', (event.pageX + 15) + 'px')
      .style('top', (event.pageY - 15) + 'px');
  });

  selection.on('mousemove', (event) => {
    tooltip.style('left', (event.pageX + 15) + 'px').style('top', (event.pageY - 15) + 'px');
  });

  selection.on('mouseout', () => { tooltip.style('opacity', 0); });
}

// === ЧАСТИЦЫ ===
function spawnParticles(d, count = CONFIG.particles.onHover) {
  if (!CONFIG.particles.enabled) return;

  const baseX = d.x + offsetX;
  const baseY = d.y + offsetY;
  const color = d.data.gender === 'male' ? '#4a9eff' : '#ff6bb0';

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 50 + Math.random() * 50;

    particleLayer.append('circle')
      .attr('cx', baseX).attr('cy', baseY)
      .attr('r', 1.5 + Math.random() * 2)
      .attr('fill', color)
      .attr('filter', 'url(#glow)')
      .attr('opacity', 0.9)
      .transition().duration(700 + Math.random() * 500)
      .ease(d3.easeCubicOut)
      .attr('cx', baseX + Math.cos(angle) * dist)
      .attr('cy', baseY + Math.sin(angle) * dist)
      .attr('r', 0).attr('opacity', 0)
      .remove();
  }
}

// === ВОЛНА ПО ПРЕДКАМ ===
function animateAncestorWave(node) {
  setFocus(node);
  const ancestors = node.ancestors().reverse(); // от корня к выбранному... и далее по цепочке
  const chain = node.ancestors();               // выбранный -> корень

  chain.forEach((a, i) => {
    setTimeout(() => {
      const target = root.descendants().find(n => n.data.id === a.data.id);
      if (!target) return;
      target._flash = now();
      spawnParticles(target, CONFIG.particles.onWave);
      if (i > 0 && i % 2 === 0) ripple(target, '#8fd8ff');
    }, i * CONFIG.wave.stepDelay);
  });

  // подсветка карточек классами (совместимо со старым CSS)
  const ids = new Set(ancestors.map(a => a.data.id));
  nodeLayer.selectAll('.node').each(function (d) {
    const isRoot = d.data.id === root.data.id;
    const inSet = ids.has(d.data.id);
    d3.select(this).select('.card-bg')
      .classed('highlighted', inSet && !isRoot)
      .classed('root-highlighted', inSet && isRoot);
  });
}

// === СБРОС ПОДСВЕТКИ ===
function resetHighlight() {
  focusSet = null;
  nodeLayer.selectAll('.card-bg')
    .classed('highlighted', false)
    .classed('root-highlighted', false)
    .style('filter', null);
}

// === УДАЛЕНИЕ СГЕНЕРИРОВАННЫХ ПРЕДКОВ ===
function clearGeneratedAncestors() {
  const gen = root.descendants().filter(d => d.data.isGenerated);
  if (gen.length === 0) return;

  const t = now();
  gen.forEach(d => { d._dying = t; });   // цикл кадра сам сожмёт и погасит

  setTimeout(() => {
    function deepClean(node) {
      if (!node) return;
      if (node.children) {
        node.children = node.children.filter(c => !c.isGenerated);
        node.children.forEach(deepClean);
      }
    }
    deepClean(familyData);
    (familyData.parents || []).forEach(deepClean);
    (familyData.grandparents || []).forEach(deepClean);
    (familyData.greatGrandparents || []).forEach(deepClean);

    // _childrenLoaded у реальных узлов сбрасываем — генерацию можно запустить заново
    root.descendants().forEach(d => { d._childrenLoaded = false; });
    rebuildAndRender();
    showDepthStatus();
  }, 1900);
}

// ============================================
// === FIT-TO-VIEW И КИНО-СПУСК ===
// ============================================
function fitToView(ms = 1100) {
  const all = root.descendants();
  const pad = 80;
  const x0 = d3.min(all, d => d.x + offsetX) - CONFIG.cardWidth / 2;
  const x1 = d3.max(all, d => d.x + offsetX) + CONFIG.cardWidth / 2;
  const y0 = d3.min(all, d => d.y + offsetY) - CONFIG.cardHeight / 2;
  const y1 = d3.max(all, d => d.y + offsetY) + CONFIG.cardHeight / 2;
  const k = Math.max(0.02, Math.min(1.2, Math.min((width - pad * 2) / (x1 - x0), (height - pad * 2) / (y1 - y0))));
  const tx = width / 2 - k * (x0 + x1) / 2;
  const ty = height / 2 - k * (y0 + y1) / 2;
  return svg.transition().duration(ms).ease(d3.easeCubicInOut)
    .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k)).end();
}

const byId = id => root.descendants().find(d => d.data.id === id);

async function cinematic() {
  if (cinematicRunning) return;
  cinematicRunning = true;
  cinematicCancel = false;
  clearTimeout(autoLoadTimer);

  try {
    let n = root;
    while (!cinematicCancel) {
      await flyTo(n, 1.3, 1500);
      if (cinematicCancel) break;

      n._flash = now();
      ripple(n, n.data.gender === 'male' ? '#4a9eff' : '#ff6bb0');
      setFocus(n);

      if (!n.children || n.children.length === 0) {
        if (!manualLoad(n)) break;       // достигли maxGenerations
        await sleep(900);
        n = byId(n.data.id);
        if (!n || !n.children) break;
      }

      // идём по самой глубокой ветке; при равенстве — детерминированно по шуму
      n = n.children.reduce((a, b) => {
        if (b.height !== a.height) return b.height > a.height ? b : a;
        return hashNoise(b.data.id, 1) > hashNoise(a.data.id, 1) ? b : a;
      });
      await sleep(250);
    }
  } catch (e) { /* прервано пользователем */ }

  cinematicRunning = false;
  cinematicCancel = false;
}

// ============================================
// === СТАРТ ===
// ============================================
renderTree();
requestAnimationFrame(frame);

// === КЛИК ПО ФОНУ ===
svg.on('click', () => {
  svg.transition().duration(CONFIG.duration.zoom).call(zoom.transform, d3.zoomIdentity);
  resetHighlight();
  tooltip.style('opacity', 0);
});

// === КНОПКИ ===
function onClick(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', (e) => { e.stopPropagation(); fn.call(el, e); });
}

onClick('btn-reset', () => {
  cinematicCancel = true;
  svg.transition().duration(CONFIG.duration.zoom).call(zoom.transform, d3.zoomIdentity);
  resetHighlight();
});
onClick('btn-clear-generated', clearGeneratedAncestors);
onClick('btn-zoom-in',  () => svg.transition().duration(300).call(zoom.scaleBy, 1.4));
onClick('btn-zoom-out', () => svg.transition().duration(300).call(zoom.scaleBy, 0.7));
onClick('btn-toggle-lines', function () {
  const hidden = linkLayer.style('display') === 'none';
  linkLayer.style('display', hidden ? 'block' : 'none');
  pulseLayer.style('display', hidden ? 'block' : 'none');
  this.classList.toggle('active', hidden);
});

// === АДАПТИВНОСТЬ ===
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => location.reload(), 300);
});

// === КЛАВИАТУРА ===
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    cinematicCancel = true;
    svg.transition().duration(CONFIG.duration.zoom).call(zoom.transform, d3.zoomIdentity);
    resetHighlight();
    tooltip.style('opacity', 0);
  }
  if (e.key === '+' || e.key === '=') svg.transition().duration(300).call(zoom.scaleBy, 1.3);
  if (e.key === '-') svg.transition().duration(300).call(zoom.scaleBy, 0.7);
  if (e.key === 'f' || e.key === 'F') { cinematicCancel = true; fitToView().catch(() => {}); }
  if (e.key === 'c' || e.key === 'C') cinematic();
});

// === ИНДИКАТОР ГЛУБИНЫ ===
const footer = document.getElementById('footer');
if (footer && !document.getElementById('infinite-status')) {
  const status = document.createElement('span');
  status.id = 'infinite-status';
  status.style.cssText = 'margin-left: 16px; color: #a06bff; transition: opacity 0.5s; opacity: 0.4;';
  status.textContent = `🌌 Глубина рода: ${root.descendants().reduce((m, d) => Math.max(m, d.depth), 0) + 1} поколений`;
  footer.appendChild(status);

  const hint = document.createElement('span');
  hint.style.cssText = 'margin-left: 16px; color: #6b7bb0; opacity: 0.7;';
  hint.textContent = 'C — спуск в бесконечность · F — весь род · Esc — сброс';
  footer.appendChild(hint);
}

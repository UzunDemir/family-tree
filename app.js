/**
 * Семейное древо Узун — D3.js + Infinite Cyber-Roots v2.0
 */

// === КОНФИГУРАЦИЯ С УСИЛЕННЫМ ВИЗУАЛОМ ===
const CONFIG = {
  cardWidth: 145,
  cardHeight: 58,
  avatarRadius: 19,
  maxGeneration: 3,

  infinity: {
    minOpacity: 0.15,
    minScale: 0.22,
    opacityFalloff: 0.85,
    scaleFalloff: 0.7
  },

  duration: { zoom: 800, highlight: 350, entrance: 700 },

  breathing: {
    enabled: true,
    baseAmp: 5,
    ampPerDepth: 3.5,
    minDuration: 3500,
    maxDuration: 6500
  },

  pulse: { enabled: true, speed: 3200, radius: 3.5, glow: true },
  particles: { enabled: true, onHover: 14, onWave: 10 },
  wave: { stepDelay: 150, duration: 450 },

  infiniteRoots: {
    enabled: true,
    autoLoadDelay: 600,
    maxGenerations: 10
  }
};

// === ИНИЦИАЛИЗАЦИЯ СЛОЕВ ===
const container = document.getElementById('tree-container');
const tooltip = d3.select('#tooltip');
const width = window.innerWidth;
const height = window.innerHeight;

const svg = d3.select('#tree-container')
  .append('svg')
  .attr('width', width)
  .attr('height', height);

const defs = svg.append('defs');

// Ультра-неоновый Glow фильтр
const glowFilter = defs.append('filter')
  .attr('id', 'glow')
  .attr('x', '-100%').attr('y', '-100%')
  .attr('width', '300%').attr('height', '300%');
glowFilter.append('feGaussianBlur').attr('stdDeviation', '5').attr('result', 'blur');
glowFilter.append('feComponentTransfer').attr('in', 'blur').attr('result', 'boost')
  .append('feFuncA').attr('type', 'linear').attr('slope', '2.5');
const feMerge = glowFilter.append('feMerge');
feMerge.append('feMergeNode').attr('in', 'boost');
feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

const g = svg.append('g').attr('class', 'main-group');
const linkLayer     = g.append('g').attr('class', 'links-layer');
const pulseLayer    = g.append('g').attr('class', 'pulse-layer');
const nodeLayer     = g.append('g').attr('class', 'nodes-layer');
const particleLayer = g.append('g').attr('class', 'particle-layer');

const offsetX = width / 2;
const offsetY = height * 0.12;

// === ЗУМ С ПЛАВНЫМ ИНДИКАТОРОМ ===
const zoom = d3.zoom()
  .scaleExtent([0.1, 4])
  .on('zoom', (event) => {
    g.attr('transform', event.transform);
    if (CONFIG.infiniteRoots.enabled && event.transform.k > 1.15) {
      scheduleAutoLoad();
    }
  });

svg.call(zoom);

// === ПОСТРОЕНИЕ ДЕРЕВА ===
let root = d3.hierarchy(buildHierarchy(familyData));
const CARD_MIN_DX = CONFIG.cardWidth + 45;

const treeLayout = d3.tree()
  .size([width * 0.92, height * 0.65])
  .separation((a, b) => (a.parent === b.parent ? CARD_MIN_DX : CARD_MIN_DX * 1.35) / (width * 0.92));

treeLayout(root);

// === ШУМ И ФИЗИКА УЗЛОВ ===
function hashNoise(id, seed = 0) {
  let h = seed;
  for (let i = 0; i < id.length; i++) {
    h = (h * 33 + id.charCodeAt(i)) | 0;
  }
  return ((h % 1000) / 1000) * 2 - 1;
}

const JITTER = {
  yByDepth: [8, 12, 18, 24],
  rotateByDepth: [0, 0.8, 1.2, 1.8]
};

const GENERATION_STEP_Y = 60;
const GENERATION_STEP_Y_MIN = 52;
const PARENT_SIDE_OFFSET = 12;

function enforceNoOverlapX(root) {
  const allNodes = root.descendants();
  const byDepth = {};
  allNodes.forEach(d => {
    if (!byDepth[d.depth]) byDepth[d.depth] = [];
    byDepth[d.depth].push(d);
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
  });
}

function adjustAllPositions(root) {
  root.descendants().forEach(node => {
    const depth = Math.min(node.depth, JITTER.yByDepth.length - 1);
    if (!node.data.isGenerated) {
      node.y += Math.abs(hashNoise(node.data.id, 2)) * JITTER.yByDepth[depth];
      node.rotation = hashNoise(node.data.id, 3) * JITTER.rotateByDepth[depth];
    } else {
      const parent = node.parent;
      if (parent) {
        const baseSideOffset = node.data.gender === 'male' ? -PARENT_SIDE_OFFSET : PARENT_SIDE_OFFSET;
        const depthFactor = Math.max(0.45, 1 - node.depth * 0.07);
        node.x = parent.x + baseSideOffset;
        node.y = parent.y + GENERATION_STEP_Y * depthFactor;
        node.rotation = hashNoise(node.data.id, 13) * 2.5;
      }
    }
  });
  enforceNoOverlapX(root);
}

adjustAllPositions(root);

// === СТИЛИ ГЕНЕРАЦИЙ И СВЯЗИ ===
function getGenerationStyle(generation) {
  const t = generation / CONFIG.maxGeneration;
  const { minOpacity, minScale, opacityFalloff, scaleFalloff } = CONFIG.infinity;
  return {
    opacity: Math.max(minOpacity, 1 - t * opacityFalloff),
    scale: Math.max(minScale, 1 - t * scaleFalloff)
  };
}

function organicLink(d) {
  const sx = d.source.x + offsetX;
  const sy = d.source.y + offsetY;
  const tx = d.target.x + offsetX;
  const ty = d.target.y + offsetY;
  const bendFactor = d.target.data.isGenerated ? 0.12 : 0.22;
  const midY = (sy + ty) / 2;
  const bend = (tx - sx) * bendFactor;
  return `M${sx},${sy} C${sx + bend},${midY} ${tx - bend},${midY} ${tx},${ty}`;
}

function nodeTransform(d, dx = 0, dy = 0) {
  const { scale } = getGenerationStyle(d.depth);
  return `translate(${d.x + offsetX + dx}, ${d.y + offsetY + dy}) rotate(${d.rotation || 0}) scale(${scale})`;
}

function getInitials(name) {
  if (!name) return '⚡';
  const parts = name.split(' ').filter(Boolean);
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0][0].toUpperCase();
}

// === ПРОЦЕДУРНАЯ ГЕНЕРАЦИЯ (ИСПРАВЛЕНАЯ) ===
function generateAncestor(childId, childBirth, childGeneration, side) {
  const gender = side === 'father' ? 'male' : 'female';
  const id = `gen_${childId}_${side}`;
  let birth = null;
  if (childBirth) {
    const yearMatch = childBirth.match(/\d{4}/);
    if (yearMatch) {
      const parentYear = parseInt(yearMatch[0]) - (24 + Math.abs(hashNoise(id, 5)) * 12);
      const day = String(Math.floor(Math.abs(hashNoise(id, 6)) * 27) + 1).padStart(2, '0');
      const month = String(Math.floor(Math.abs(hashNoise(id, 7)) * 11) + 1).padStart(2, '0');
      birth = `${day}.${month}.${Math.floor(parentYear)}`;
    }
  }
  return { id, name: '', birth, gender, generation: childGeneration + 1, isGenerated: true, children: [] };
}

function findInFamilyData(node, targetId) {
  if (!node) return null;
  if (node.id === targetId) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findInFamilyData(child, targetId);
      if (found) return found;
    }
  }
  return null;
}

function loadNextGeneration(datum) {
  if (datum.depth >= CONFIG.infiniteRoots.maxGenerations || datum._childrenLoaded) return false;
  if (datum.data.children && datum.data.children.length > 0) return false;

  const father = generateAncestor(datum.data.id, datum.data.birth, datum.depth, 'father');
  const mother = generateAncestor(datum.data.id, datum.data.birth, datum.depth, 'mother');

  let targetInData = findInFamilyData(familyData, datum.data.id);
  if (!targetInData && familyData.parents) {
    for (const p of familyData.parents) {
      targetInData = findInFamilyData(p, datum.data.id);
      if (targetInData) break;
    }
  }

  if (targetInData) {
    targetInData.children = targetInData.children || [];
    targetInData.children.push(father, mother);
    datum._childrenLoaded = true;
    return true;
  }
  return false;
}

function rebuildAndRender() {
  const oldLoadedIds = new Set();
  root.descendants().forEach(d => { if (d._childrenLoaded) oldLoadedIds.add(d.data.id); });

  const newRoot = d3.hierarchy(buildHierarchy(familyData));
  treeLayout(newRoot);
  adjustAllPositions(newRoot);

  newRoot.descendants().forEach(d => { if (oldLoadedIds.has(d.data.id)) d._childrenLoaded = true; });
  root = newRoot;
  renderTree(true);
}

let autoLoadTimer = null;
function scheduleAutoLoad() {
  clearTimeout(autoLoadTimer);
  autoLoadTimer = setTimeout(() => {
    const candidates = root.descendants()
      .filter(d => !d._childrenLoaded && (!d.data.children || d.data.children.length === 0))
      .sort((a, b) => b.depth - a.depth);

    if (candidates.length === 0) return;
    let loaded = 0;
    for (const d of candidates.slice(0, 3)) {
      if (loadNextGeneration(d)) loaded++;
    }
    if (loaded > 0) {
      rebuildAndRender();
      showDepthStatus();
    }
  }, CONFIG.infiniteRoots.autoLoadDelay);
}

function showDepthStatus() {
  const deepest = root.descendants().reduce((max, d) => Math.max(max, d.depth), 0);
  const status = document.getElementById('infinite-status');
  if (status) {
    status.textContent = `🌌 Глубина кибер-рода: ${deepest + 1} уровней`;
    status.style.opacity = 1;
    setTimeout(() => { status.style.opacity = 0.5; }, 2500);
  }
}

// === РЕНДЕРИНГ СЕТИ И УЗЛОВ ===
let links = linkLayer.selectAll('.link');
let nodes = nodeLayer.selectAll('.node');

function renderTree(animateEntrance = false) {
  links = linkLayer.selectAll('.link').data(root.links(), d => d.target.data.id);
  links.exit().transition().duration(400).style('opacity', 0).remove();

  const linksEnter = links.enter()
    .append('path')
    .attr('class', 'link')
    .attr('d', organicLink)
    .attr('stroke', d => `rgba(0, 243, 255, ${getGenerationStyle(d.target.depth).opacity * 0.6})`)
    .attr('stroke-width', d => Math.max(0.6, 2 * getGenerationStyle(d.target.depth).scale))
    .attr('filter', 'url(#glow)');

  if (animateEntrance) linksEnter.style('opacity', 0).transition().duration(600).style('opacity', 1);
  links = linksEnter.merge(links);
  links.attr('d', organicLink);

  nodes = nodeLayer.selectAll('.node').data(root.descendants(), d => d.data.id);
  nodes.exit().transition().duration(400).style('opacity', 0).remove();

  const nodesEnter = nodes.enter()
    .append('g')
    .attr('class', 'node')
    .attr('transform', d => nodeTransform(d))
    .style('opacity', animateEntrance ? 0 : d => getGenerationStyle(d.depth).opacity)
    .style('cursor', 'pointer');

  // Неоновая подложка карточки
  nodesEnter.append('rect')
    .attr('class', 'card-bg')
    .attr('x', -CONFIG.cardWidth / 2)
    .attr('y', -CONFIG.cardHeight / 2)
    .attr('width', CONFIG.cardWidth)
    .attr('height', CONFIG.cardHeight)
    .attr('rx', 12)
    .attr('filter', 'url(#glow)');

  const avatarX = -CONFIG.cardWidth / 2 + 28;

  nodesEnter.append('circle')
    .attr('class', d => `avatar-circle ${d.data.gender}`)
    .attr('cx', avatarX).attr('cy', 0)
    .attr('r', CONFIG.avatarRadius);

  nodesEnter.append('text')
    .attr('class', 'avatar-text')
    .attr('x', avatarX).attr('y', 1)
    .text(d => getInitials(d.data.name));

  nodesEnter.append('text')
    .attr('class', 'card-name')
    .attr('x', avatarX + 28).attr('y', -6)
    .text(d => {
      if (!d.data.name) return 'Nexus Node';
      const parts = d.data.name.split(' ');
      return parts.length > 1 ? `${parts[0]} ${parts[1]}` : d.data.name;
    });

  nodesEnter.append('text')
    .attr('class', 'card-date')
    .attr('x', avatarX + 28).attr('y', 12)
    .text(d => d.data.birth || '00.00.0000');

  attachNodeHandlers(nodesEnter);

  if (animateEntrance) {
    nodesEnter.transition().duration(700).delay(d => d.depth * 80)
      .style('opacity', d => getGenerationStyle(d.depth).opacity);
  }

  nodes = nodesEnter.merge(nodes);
  nodes.attr('transform', d => nodeTransform(d));

  renderPulses();
  updateStats();
}

function renderPulses() {
  if (!CONFIG.pulse.enabled) return;
  const pulses = pulseLayer.selectAll('.pulse').data(root.links(), d => d.target.data.id);
  pulses.exit().remove();

  pulses.enter()
    .append('circle')
    .attr('class', d => d.target.data.isGenerated ? 'pulse generated' : 'pulse real')
    .attr('r', CONFIG.pulse.radius)
    .attr('fill', d => d.target.data.isGenerated ? '#7a7a99' : (d.target.data.gender === 'male' ? '#00f3ff' : '#ff007f'))
    .attr('filter', 'url(#glow)')
    .merge(pulses);
}

function updateStats() {
  const totalPeople = root.descendants().length;
  const deepest = root.descendants().reduce((max, d) => Math.max(max, d.depth), 0);
  const statsEl = document.getElementById('stats');
  if (statsEl) statsEl.textContent = `⚡ Узлов: ${totalPeople} · Поколений: ${deepest + 1}`;
}

// === КИБЕР-ПУЛЬСЫ ПО СВЯЗЯМ ===
if (CONFIG.pulse.enabled) {
  function animatePulses() {
    pulseLayer.selectAll('.pulse').each(function(d) {
      const pulse = d3.select(this);
      const linkEl = linkLayer.selectAll('.link').filter(l => l.target.data.id === d.target.data.id);
      if (linkEl.empty()) return;

      const path = linkEl.node();
      if (!path.getTotalLength) return;

      const len = path.getTotalLength();
      const speed = CONFIG.pulse.speed * (d.target.data.isGenerated ? 1.2 : 0.7);
      const t = ((Date.now() + hashNoise(d.target.data.id, 99) * 1000) % speed) / speed;
      const point = path.getPointAtLength(t * len);

      pulse.attr('cx', point.x).attr('cy', point.y).attr('opacity', Math.sin(t * Math.PI) * 0.9);
    });
    requestAnimationFrame(animatePulses);
  }
  animatePulses();
}

// === ИНТЕРАКТИВ ИЧАСТИЦЫ ===
function attachNodeHandlers(selection) {
  selection.on('mouseenter', (event, d) => spawnParticles(d, CONFIG.particles.onHover));
  selection.on('click', (event, d) => {
    event.stopPropagation();
    const scale = 1.7;
    const x = width / 2 - (d.x + offsetX) * scale;
    const y = height / 2 - (d.y + offsetY) * scale;

    svg.transition().duration(CONFIG.duration.zoom)
      .call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));

    animateAncestorWave(d);
    if (!d._childrenLoaded) setTimeout(() => { loadNextGeneration(d); rebuildAndRender(); }, 300);
  });

  selection.on('mouseover', (event, d) => {
    tooltip.style('opacity', 1)
      .html(`
        <strong style="color: #00f3ff;">${d.data.name || 'Неизвестный узел'}</strong>
        <div class="row">Метка времени: <span>${d.data.birth || 'N/A'}</span></div>
        <div class="row">Уровень ветки: <span>Генерация #${d.depth + 1}</span></div>
        ${d.data.isGenerated ? '<div class="row" style="color:#ff007f">✨ Автосинтезированный корень</div>' : ''}
      `)
      .style('left', (event.pageX + 15) + 'px')
      .style('top', (event.pageY - 15) + 'px');
  }).on('mousemove', (event) => {
    tooltip.style('left', (event.pageX + 15) + 'px').style('top', (event.pageY - 15) + 'px');
  }).on('mouseout', () => tooltip.style('opacity', 0));
}

function spawnParticles(d, count) {
  if (!CONFIG.particles.enabled) return;
  const baseX = d.x + offsetX;
  const baseY = d.y + offsetY;
  const color = d.data.gender === 'male' ? '#00f3ff' : '#ff007f';

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * 60;
    particleLayer.append('circle')
      .attr('cx', baseX).attr('cy', baseY)
      .attr('r', 1 + Math.random() * 2.5)
      .attr('fill', color)
      .attr('filter', 'url(#glow)')
      .attr('opacity', 1)
      .transition().duration(600 + Math.random() * 400)
      .ease(d3.easeCubicOut)
      .attr('cx', baseX + Math.cos(angle) * dist)
      .attr('cy', baseY + Math.sin(angle) * dist)
      .attr('r', 0).attr('opacity', 0)
      .remove();
  }
}

function animateAncestorWave(node) {
  const ancestors = node.ancestors().reverse();
  nodeLayer.selectAll('.card-bg').classed('highlighted', false);

  ancestors.forEach((anc, i) => {
    setTimeout(() => {
      nodeLayer.selectAll('.node').filter(d => d.data.id === anc.data.id)
        .select('.card-bg')
        .style('filter', 'drop-shadow(0 0 18px rgba(0, 243, 255, 0.95))');
      spawnParticles(anc, CONFIG.particles.onWave);
      setTimeout(() => {
        nodeLayer.selectAll('.node').filter(d => d.data.id === anc.data.id)
          .select('.card-bg').style('filter', 'url(#glow)');
      }, CONFIG.wave.duration);
    }, i * CONFIG.wave.stepDelay);
  });
}

// === ДЫХАНИЕ СЕТИ ===
if (CONFIG.breathing.enabled) {
  const startTime = Date.now();
  let active = true;
  svg.on('mousedown', () => active = false).on('mouseup', () => active = true);

  function breathe() {
    if (active) {
      const now = Date.now();
      nodeLayer.selectAll('.node').attr('transform', function(d) {
        const amp = CONFIG.breathing.baseAmp + d.depth * CONFIG.breathing.ampPerDepth;
        const dur = CONFIG.breathing.minDuration + (hashNoise(d.data.id, 7) + 1) * 1500;
        const t = (now - startTime) / dur + hashNoise(d.data.id, 9) * Math.PI;
        return nodeTransform(d, Math.sin(t) * Math.min(amp, 3.5), Math.cos(t * 0.7) * Math.min(amp, 3.5));
      });
    }
    requestAnimationFrame(breathe);
  }
  breathe();
}

// Сброс и кнопки
document.getElementById('btn-reset')?.addEventListener('click', () => {
  svg.transition().duration(700).call(zoom.transform, d3.zoomIdentity);
});

renderTree(true);

/**
 * Семейное древо Узун — D3.js + бесконечные корни
 * 
 * Правила:
 *   - ЛЮБОЙ узел ВСЕГДА ниже родителя
 *   - Сгенерированные узлы БЕЗ имён
 *   - Jitter: по X НЕТ, по Y только вниз
 *   - Карточки НЕ наезжают друг на друга
 *   - Яркие пульсы для реальных, тусклые для сгенерированных
 *   - Адаптивный шаг: чем глубже, тем компактнее
 */

// === КОНФИГУРАЦИЯ ===
const CONFIG = {
  cardWidth: 140,
  cardHeight: 56,
  avatarRadius: 18,
  maxGeneration: 3,

  infinity: {
    minOpacity: 0.1,
    minScale: 0.25,
    opacityFalloff: 0.9,
    scaleFalloff: 0.75
  },

  duration: { zoom: 750, highlight: 300, entrance: 600 },

  breathing: {
    enabled: true,
    baseAmp: 4,
    ampPerDepth: 3,
    minDuration: 4000,
    maxDuration: 7000
  },

  pulse: { enabled: true, speed: 4000, radius: 3, glow: true },
  particles: { enabled: true, onHover: 8, onWave: 6 },
  wave: { stepDelay: 180, duration: 400 },

  infiniteRoots: {
    enabled: true,
    autoLoadDelay: 800,
    maxGenerations: 8
  }
};

// === ИНИЦИАЛИЗАЦИЯ ===
const container = document.getElementById('tree-container');
const tooltip = d3.select('#tooltip');
const width = window.innerWidth;
const height = window.innerHeight;

const svg = d3.select('#tree-container')
  .append('svg')
  .attr('width', width)
  .attr('height', height);

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

// === ЗУМ ===
const zoom = d3.zoom()
  .scaleExtent([0.15, 3])
  .on('zoom', (event) => {
    g.attr('transform', event.transform);
    if (CONFIG.infiniteRoots.enabled && event.transform.k > 1.2) {
      scheduleAutoLoad();
    }
  });

svg.call(zoom);

// === ПОСТРОЕНИЕ ===
let root = d3.hierarchy(buildHierarchy(familyData));

const CARD_MIN_DX = CONFIG.cardWidth + 40;

const treeLayout = d3.tree()
  .size([width * 0.95, height * 0.7])
  .separation((a, b) => {
    if (a.parent === b.parent) {
      return CARD_MIN_DX / (width * 0.95);
    }
    return (CARD_MIN_DX * 1.4) / (width * 0.95);
  });

treeLayout(root);

// === ШУМ ===
function hashNoise(id, seed = 0) {
  let h = seed;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return ((h % 1000) / 1000) * 2 - 1;
}

// === JITTER (компактный) ===
const JITTER = {
  yByDepth:      [10, 15, 20, 25],   // было [20, 30, 45, 60]
  rotateByDepth: [0, 1, 1.5, 2]
};

const GENERATION_STEP_Y = 55;         // было 90
const GENERATION_STEP_Y_MIN = 50;     // было 80
const PARENT_SIDE_OFFSET = 10;        // было 35

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

    for (let i = 1; i < nodesAtDepth.length; i++) {
      const prev = nodesAtDepth[i - 1];
      const curr = nodesAtDepth[i];
      if (curr.x - prev.x < CARD_MIN_DX) {
        curr.x = prev.x + CARD_MIN_DX;
      }
    }
  });
}

function adjustAllPositions(root) {
  // 1. Реальные предки
  const realNodes = root.descendants()
    .filter(d => !d.data.isGenerated)
    .sort((a, b) => a.depth - b.depth);

  realNodes.forEach(node => {
    const depth = Math.min(node.depth, JITTER.yByDepth.length - 1);

    const yJitter = Math.abs(hashNoise(node.data.id, 2)) * JITTER.yByDepth[depth];
    node.y += yJitter;

    const rotDepth = Math.min(node.depth, JITTER.rotateByDepth.length - 1);
    node.rotation = hashNoise(node.data.id, 3) * JITTER.rotateByDepth[rotDepth];

    if (node.parent) {
      const minY = node.parent.y + GENERATION_STEP_Y_MIN;
      if (node.y < minY) node.y = minY;
    }
  });

  // 2. Сгенерированные — с адаптивным шагом
  const generated = root.descendants()
    .filter(d => d.data.isGenerated)
    .sort((a, b) => a.depth - b.depth);

  generated.forEach(node => {
    const parent = node.parent;
    if (!parent) return;

    const baseSideOffset = node.data.gender === 'male'
      ? -PARENT_SIDE_OFFSET
      : PARENT_SIDE_OFFSET;

    const yJitter = Math.abs(hashNoise(node.data.id, 12)) * 10;

    // АДАПТИВНЫЙ ШАГ: чем глубже — тем меньше
    const depthFactor = Math.max(0.4, 1 - node.depth * 0.08);
    const step = GENERATION_STEP_Y * depthFactor;

    node.x = parent.x + baseSideOffset;
    node.y = parent.y + step + yJitter;
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

  const isGenerated = d.target.data.isGenerated;
  const bendFactor = isGenerated ? 0.15 : 0.25;

  const midY = (sy + ty) / 2;
  const bend = (tx - sx) * bendFactor;

  return `M${sx},${sy} C${sx + bend},${midY} ${tx - bend},${midY} ${tx},${ty}`;
}

// === TRANSFORM ===
function nodeTransform(d, dx = 0, dy = 0) {
  const { scale } = getGenerationStyle(d.depth);
  const rot = d.rotation || 0;
  return `translate(${d.x + offsetX + dx}, ${d.y + offsetY + dy}) rotate(${rot}) scale(${scale})`;
}

// === ВСПОМОГАТЕЛЬНЫЕ ===
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
    const yearMatch = childBirth.match(/\d{4}/);
    if (yearMatch) {
      const childYear = parseInt(yearMatch[0]);
      const parentYear = childYear - (25 + Math.abs(hashNoise(id, 5)) * 10);
      const day = String(Math.floor(Math.abs(hashNoise(id, 6)) * 28) + 1).padStart(2, '0');
      const month = String(Math.floor(Math.abs(hashNoise(id, 7)) * 12) + 1).padStart(2, '0');
      birth = `${day}.${month}.${Math.floor(parentYear)}`;
    }
  }

  return {
    id,
    name: '',
    birth,
    gender,
    generation: childGeneration + 1,
    isGenerated: true,
    children: []
  };
}

function findInFamilyData(node, id) {
  if (node.id === id) return node;
  if (!node.children) return null;
  for (const child of node.children) {
    const found = findInFamilyData(child, id);
    if (found) return found;
  }
  return null;
}

function loadNextGeneration(datum) {
  if (datum.depth >= IR.maxGenerations) return false;
  if (datum._childrenLoaded) return false;

  if (datum.data.children && datum.data.children.length > 0) {
    return false;
  }

  const father = generateAncestor(datum.data.id, datum.data.birth, datum.depth, 'father');
  const mother = generateAncestor(datum.data.id, datum.data.birth, datum.depth, 'mother');

  console.log('✨ Генерирую предков для', datum.data.name || '(безымянный)');

  let targetInData = findInFamilyData(familyData, datum.data.id);

  if (!targetInData) {
    const allParents = [
      ...(familyData.parents || []),
      ...(familyData.grandparents || []),
      ...(familyData.greatGrandparents || [])
    ];

    function searchDeep(node) {
      if (node.id === datum.data.id) return node;
      if (node.children) {
        for (const c of node.children) {
          const f = searchDeep(c);
          if (f) return f;
        }
      }
      return null;
    }

    for (const p of allParents) {
      targetInData = searchDeep(p);
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

// === ПЕРЕСБОРКА ===
function rebuildAndRender() {
  const oldLoadedIds = new Set();
  root.descendants().forEach(d => {
    if (d._childrenLoaded) oldLoadedIds.add(d.data.id);
  });

  const newHierarchyData = buildHierarchy(familyData);
  const newRoot = d3.hierarchy(newHierarchyData);

  treeLayout(newRoot);
  adjustAllPositions(newRoot);

  newRoot.descendants().forEach(d => {
    if (oldLoadedIds.has(d.data.id)) d._childrenLoaded = true;
  });

  root = newRoot;
  renderTree(true);
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

    if (candidates.length === 0) return;

    let loaded = 0;
    for (const d of candidates.slice(0, 3)) {
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
  }
}

function showDepthStatus() {
  const deepest = root.descendants().reduce((max, d) => Math.max(max, d.depth), 0);
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

function renderTree(animateEntrance = false) {
  // Связи
  links = linkLayer.selectAll('.link')
    .data(root.links(), d => d.target.data.id);

  links.exit().remove();

  const linksEnter = links.enter()
    .append('path')
    .attr('class', 'link')
    .attr('d', organicLink)
    .attr('stroke', d => {
      const { opacity } = getGenerationStyle(d.target.depth);
      return `rgba(74, 158, 255, ${opacity * 0.5})`;
    })
    .attr('stroke-width', d => {
      const { scale } = getGenerationStyle(d.target.depth);
      return Math.max(0.5, 1.5 * scale);
    });

  if (animateEntrance) {
    linksEnter.style('opacity', 0).transition().duration(600).style('opacity', 1);
  }

  links = linksEnter.merge(links);
  links.attr('d', organicLink);

  // Узлы
  nodes = nodeLayer.selectAll('.node')
    .data(root.descendants(), d => d.data.id);

  nodes.exit().remove();

  const nodesEnter = nodes.enter()
    .append('g')
    .attr('class', 'node')
    .attr('data-id', d => d.data.id)
    .attr('transform', d => nodeTransform(d))
    .style('opacity', animateEntrance ? 0 : d => getGenerationStyle(d.depth).opacity)
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
    .attr('cx', avatarX)
    .attr('cy', 0)
    .attr('r', CONFIG.avatarRadius);

  nodesEnter.append('text')
    .attr('class', 'avatar-text')
    .attr('x', avatarX)
    .attr('y', 0)
    .text(d => getInitials(d.data.name));

  nodesEnter.append('text')
    .attr('class', 'card-name')
    .attr('x', avatarX + 26)
    .attr('y', -6)
    .text(d => {
      if (!d.data.name) return '';
      const parts = d.data.name.split(' ');
      return parts.length > 1 ? `${parts[0]} ${parts[1]}` : d.data.name;
    });

  nodesEnter.append('text')
    .attr('class', 'card-date')
    .attr('x', avatarX + 26)
    .attr('y', 10)
    .text(d => d.data.birth || '—');

  attachNodeHandlers(nodesEnter);

  if (animateEntrance) {
    nodesEnter.transition()
      .duration(600)
      .delay(d => d.depth * 100)
      .style('opacity', d => getGenerationStyle(d.depth).opacity);
  }

  nodes = nodesEnter.merge(nodes);
  nodes.attr('transform', d => nodeTransform(d));

  renderPulses();
  updateStats();
}

function renderPulses() {
  if (!CONFIG.pulse.enabled) return;

  pulses = pulseLayer.selectAll('.pulse')
    .data(root.links(), d => d.target.data.id);

  pulses.exit().remove();

  pulses = pulses.enter()
    .append('circle')
    .attr('class', d => {
      const isReal = !d.target.data.isGenerated;
      return isReal ? 'pulse real' : 'pulse generated';
    })
    .attr('r', d => {
      return d.target.data.isGenerated
        ? CONFIG.pulse.radius
        : CONFIG.pulse.radius * 1.8;
    })
    .attr('fill', d => {
      if (d.target.data.isGenerated) return '#6b6b8a';
      return d.target.data.gender === 'male' ? '#4a9eff' : '#ff6bb0';
    })
    .attr('opacity', 0)
    .attr('filter', d => {
      return d.target.data.isGenerated
        ? null
        : (CONFIG.pulse.glow ? 'url(#glow)' : null);
    })
    .merge(pulses);
}

function updateStats() {
  const totalPeople = root.descendants().length;
  const deepest = root.descendants().reduce((max, d) => Math.max(max, d.depth), 0);
  document.getElementById('stats').textContent =
    `👥 ${totalPeople} человек · ${deepest + 1} поколений`;
}

// === ПУЛЬСЫ ===
if (CONFIG.pulse.enabled) {
  function animatePulses() {
    pulseLayer.selectAll('.pulse').each(function(d) {
      const pulse = d3.select(this);
      const linkEl = linkLayer.selectAll('.link')
        .filter(l => l.target.data.id === d.target.data.id);

      if (linkEl.empty()) return;

      const path = linkEl.node();
      if (!path.getTotalLength) return;

      const totalLength = path.getTotalLength();
      const baseDelay = (hashNoise(d.target.data.id, 42) + 1) * 1000;

      const isReal = !d.target.data.isGenerated;
      const speed = isReal ? CONFIG.pulse.speed * 0.6 : CONFIG.pulse.speed;

      const t = ((Date.now() + baseDelay) % speed) / speed;
      const point = path.getPointAtLength(t * totalLength);

      const maxOpacity = isReal ? 1.0 : 0.5;
      const opacity = Math.sin(t * Math.PI) * maxOpacity;

      pulse
        .attr('cx', point.x)
        .attr('cy', point.y)
        .attr('opacity', opacity);
    });
    requestAnimationFrame(animatePulses);
  }
  animatePulses();
}

// === ОБРАБОТЧИКИ ===
function attachNodeHandlers(selection) {
  selection.on('mouseenter', (event, d) => {
    spawnParticles(d, CONFIG.particles.onHover);
  });

  selection.on('click', (event, d) => {
    event.stopPropagation();

    const scale = 1.6;
    const x = width / 2 - (d.x + offsetX) * scale;
    const y = height / 2 - (d.y + offsetY) * scale;

    svg.transition()
      .duration(CONFIG.duration.zoom)
      .call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));

    animateAncestorWave(d);

    if (CONFIG.infiniteRoots.enabled && !d._childrenLoaded) {
      setTimeout(() => manualLoad(d), 400);
    }
  });

  selection.on('mouseover', (event, d) => {
    const genLabel = d.depth === 0 ? 'Младшее поколение' : `${d.depth}-е поколение от младшего`;
    const genderLabel = d.data.gender === 'male' ? 'Мужской' : 'Женский';
    const generatedLabel = d.data.isGenerated
      ? '<div class="row" style="color:#a06bff">✨ Восстановлено по роду</div>'
      : '';

    const displayName = d.data.name
      || (d.data.gender === 'male' ? 'Неизвестный предок' : 'Неизвестная предок');

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
    tooltip
      .style('left', (event.pageX + 15) + 'px')
      .style('top', (event.pageY - 15) + 'px');
  });

  selection.on('mouseout', () => {
    tooltip.style('opacity', 0);
  });
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

// === ВОЛНА ===
function animateAncestorWave(node) {
  const ancestors = node.ancestors().reverse();

  nodeLayer.selectAll('.card-bg')
    .classed('highlighted', false)
    .classed('root-highlighted', false);

  ancestors.forEach((ancestor, i) => {
    setTimeout(() => {
      const isRoot = ancestor.data.id === root.data.id;

      nodeLayer.selectAll('.node')
        .filter(d => d.data.id === ancestor.data.id)
        .select('.card-bg')
        .classed('highlighted', !isRoot)
        .classed('root-highlighted', isRoot)
        .style('filter', 'drop-shadow(0 0 14px rgba(74,158,255,0.9))');

      spawnParticles(ancestor, CONFIG.particles.onWave);

      setTimeout(() => {
        nodeLayer.selectAll('.node')
          .filter(d => d.data.id === ancestor.data.id)
          .select('.card-bg')
          .style('filter', null);
      }, CONFIG.wave.duration + 200);
    }, i * CONFIG.wave.stepDelay);
  });

  const ancestorIds = new Set(ancestors.map(a => a.data.id));
  linkLayer.selectAll('.link')
    .classed('highlighted', d => ancestorIds.has(d.target.data.id))
    .classed('dimmed', d => !ancestorIds.has(d.target.data.id));
}

// === СБРОС ПОДСВЕТКИ ===
function resetHighlight() {
  nodeLayer.selectAll('.card-bg')
    .classed('highlighted', false)
    .classed('root-highlighted', false)
    .attr('opacity', 1)
    .style('filter', null);

  linkLayer.selectAll('.link')
    .classed('highlighted', false)
    .classed('dimmed', false)
    .attr('stroke', d => {
      const { opacity } = getGenerationStyle(d.target.depth);
      return `rgba(74, 158, 255, ${opacity * 0.5})`;
    });
}

// === УДАЛЕНИЕ СГЕНЕРИРОВАННЫХ ПРЕДКОВ ===
function clearGeneratedAncestors() {
  console.log('🌫 Начинаю удаление сгенерированных предков...');

  const generatedNodes = nodeLayer.selectAll('.node')
    .filter(d => d.data.isGenerated);

  if (generatedNodes.empty()) {
    console.log('ℹ️ Нет сгенерированных предков для удаления');
    return;
  }

  console.log(`🗑️ Найдено ${generatedNodes.size()} сгенерированных узлов`);

  // Фаза 1: плавное исчезновение
  generatedNodes
    .transition()
    .duration(1800)
    .ease(d3.easeCubicOut)
    .style('opacity', 0)
    .attr('transform', function(d) {
      const { scale } = getGenerationStyle(d.depth);
      const rot = d.rotation || 0;
      return `translate(${d.x + offsetX}, ${d.y + offsetY}) rotate(${rot}) scale(${scale * 0.2})`;
    });

  linkLayer.selectAll('.link')
    .filter(d => d.target.data.isGenerated)
    .transition()
    .duration(1800)
    .ease(d3.easeCubicOut)
    .style('opacity', 0);

  pulseLayer.selectAll('.pulse')
    .filter(d => d.target.data.isGenerated)
    .transition()
    .duration(1800)
    .ease(d3.easeCubicOut)
    .attr('opacity', 0);

  // Фаза 2: чистка familyData + пересборка
  setTimeout(() => {
    console.log('🧹 Чищу familyData от сгенерированных...');

    function deepClean(node) {
      if (!node || !node.children || node.children.length === 0) return;
      node.children = node.children.filter(c => !c.isGenerated);
      node.children.forEach(deepClean);
    }

    function walkAll(node) {
      if (!node) return;
      deepClean(node);
      if (node.children) {
        node.children.forEach(walkAll);
      }
    }

    walkAll(familyData);
    (familyData.parents || []).forEach(walkAll);
    (familyData.grandparents || []).forEach(walkAll);
    (familyData.greatGrandparents || []).forEach(walkAll);

    let remaining = 0;
    root.descendants().forEach(d => { if (d.data.isGenerated) remaining++; });
    console.log(`🔍 Осталось сгенерированных в D3 до пересборки: ${remaining}`);

    console.log('🔄 Пересобираю дерево...');

    nodeLayer.selectAll('.node').remove();
    linkLayer.selectAll('.link').remove();
    pulseLayer.selectAll('.pulse').remove();

    const newHierarchyData = buildHierarchy(familyData);
    const newRoot = d3.hierarchy(newHierarchyData);
    treeLayout(newRoot);
    adjustAllPositions(newRoot);
    root = newRoot;

    renderTree(true);

    console.log('✅ Сброс завершён. Глубина:', 
      root.descendants().reduce((max, d) => Math.max(max, d.depth), 0) + 1, 'поколений');

    showDepthStatus();
  }, 1900);
}

// === ПЕРВИЧНЫЙ РЕНДЕР ===
renderTree(true);

// === КЛИК ПО ФОНУ ===
svg.on('click', () => {
  svg.transition().duration(CONFIG.duration.zoom)
    .call(zoom.transform, d3.zoomIdentity);
  resetHighlight();
  tooltip.style('opacity', 0);
});

// === КНОПКИ ===
document.getElementById('btn-reset').addEventListener('click', (e) => {
  e.stopPropagation();
  svg.transition().duration(CONFIG.duration.zoom)
    .call(zoom.transform, d3.zoomIdentity);
  resetHighlight();
});

document.getElementById('btn-clear-generated').addEventListener('click', (e) => {
  e.stopPropagation();
  clearGeneratedAncestors();
});

document.getElementById('btn-zoom-in').addEventListener('click', (e) => {
  e.stopPropagation();
  svg.transition().duration(300).call(zoom.scaleBy, 1.4);
});

document.getElementById('btn-zoom-out').addEventListener('click', (e) => {
  e.stopPropagation();
  svg.transition().duration(300).call(zoom.scaleBy, 0.7);
});

document.getElementById('btn-toggle-lines').addEventListener('click', function(e) {
  e.stopPropagation();
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
    svg.transition().duration(CONFIG.duration.zoom)
      .call(zoom.transform, d3.zoomIdentity);
    resetHighlight();
    tooltip.style('opacity', 0);
  }
  if (e.key === '+' || e.key === '=') {
    svg.transition().duration(300).call(zoom.scaleBy, 1.3);
  }
  if (e.key === '-') {
    svg.transition().duration(300).call(zoom.scaleBy, 0.7);
  }
});

// === ДЫХАНИЕ ===
if (CONFIG.breathing.enabled) {
  const startTime = Date.now();
  let zoomActive = false;
  let entranceDone = false;

  svg.on('mousedown.breathing', () => { zoomActive = true; });
  svg.on('mouseup.breathing',   () => { zoomActive = false; });
  svg.on('mouseleave.breathing',() => { zoomActive = false; });
  svg.on('touchend.breathing',  () => { zoomActive = false; });

  setTimeout(() => { entranceDone = true; }, CONFIG.duration.entrance + 200);

  function breathe() {
    if (entranceDone && !zoomActive) {
      const now = Date.now();

      nodeLayer.selectAll('.node').attr('transform', function(d) {
        const amp = CONFIG.breathing.baseAmp + d.depth * CONFIG.breathing.ampPerDepth;
        const finalAmp = d.data.isGenerated ? amp * 0.4 : amp;

        const dur = CONFIG.breathing.minDuration +
                    (hashNoise(d.data.id, 7) + 1) / 2 *
                    (CONFIG.breathing.maxDuration - CONFIG.breathing.minDuration);

        const phase = (hashNoise(d.data.id, 9) + 1) * Math.PI;
        const t = (now - startTime) / dur + phase;

        const dx = Math.sin(t) * Math.min(finalAmp, 3);
        const dy = Math.abs(Math.cos(t * 0.7)) * Math.min(finalAmp, 3);

        return nodeTransform(d, dx, dy);
      });
    }
    requestAnimationFrame(breathe);
  }
  breathe();
}

// === ИНДИКАТОР ГЛУБИНЫ ===
const footer = document.getElementById('footer');
if (footer && !document.getElementById('infinite-status')) {
  const status = document.createElement('span');
  status.id = 'infinite-status';
  status.style.cssText = 'margin-left: 16px; color: #a06bff; transition: opacity 0.5s; opacity: 0.4;';
  status.textContent = `🌌 Глубина рода: ${root.descendants().reduce((max, d) => Math.max(max, d.depth), 0) + 1} поколений`;
  footer.appendChild(status);
}

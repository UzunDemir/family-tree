/**
 * Семейное древо Узун — D3.js + бесконечные корни
 * Корни растут ВВЕРХ по экрану, от любого узла, «живые»
 */

// === КОНФИГУРАЦИЯ ===
const CONFIG = {
  cardWidth: 140,
  cardHeight: 56,
  avatarRadius: 18,
  maxGeneration: 3,

  infinity: {
    minOpacity: 0.15,
    minScale: 0.35,
    opacityFalloff: 0.85,
    scaleFalloff: 0.65
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
    loadDepth: 3,
    autoLoadDelay: 800,
    maxGenerations: 12,
    namesMale: [
      'Иван', 'Пётр', 'Николай', 'Александр', 'Трофим', 'Павел', 'Григорий',
      'Степан', 'Фёдор', 'Дмитрий', 'Сергей', 'Михаил', 'Андрей', 'Василий',
      'Тимофей', 'Игнат', 'Ефим', 'Савелий', 'Архип', 'Прокопий'
    ],
    namesFemale: [
      'Мария', 'Ольга', 'Нина', 'Марфа', 'Иванка', 'Мотрика', 'Анна', 'Елена',
      'Татьяна', 'Дарья', 'Аксинья', 'Пелагея', 'Устинья', 'Аграфена',
      'Евдокия', 'Матрёна', 'Феодосия', 'Прасковья', 'Глафира', 'Василиса'
    ],
    surnames: [
      'Узун', 'Белиогло', 'Симонов', 'Цугуй', 'Боян', 'Радиш', 'Маракуца',
      'Иванов', 'Петров', 'Ковалёв', 'Мельник', 'Ткачук', 'Бондарь', 'Морарь',
      'Гриценко', 'Лунгу', 'Чобану', 'Дабижа', 'Русу', 'Кожокару'
    ]
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
const offsetY = height * 0.15;

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

const treeLayout = d3.tree()
  .size([width * 0.85, height * 0.7])
  .separation((a, b) => (a.parent === b.parent ? 1.4 : 2.2));

treeLayout(root);

// === ШУМ ===
function hashNoise(id, seed = 0) {
  let h = seed;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return ((h % 1000) / 1000) * 2 - 1;
}

// === НЕРОВНОЕ РАСПОЛОЖЕНИЕ ===
const JITTER = {
  xByDepth:      [20, 35, 55, 80],
  yByDepth:      [10, 20, 35, 55],
  rotateByDepth: [0, 1.5, 3, 5]
};

// Вертикальный шаг между поколениями
const GENERATION_STEP_Y = 90;
// Боковое смещение отца/матери
const PARENT_SIDE_OFFSET = 35;

function adjustAllPositions(root) {
  // 1. Реальные предки — с jitter
  root.descendants().forEach(node => {
    if (node.data.isGenerated) return;
    if (node._jitterApplied) return;

    const depth = Math.min(node.depth, JITTER.xByDepth.length - 1);
    node._jitterApplied = true;

    node.x += hashNoise(node.data.id, 1) * JITTER.xByDepth[depth];
    node.y += hashNoise(node.data.id, 2) * JITTER.yByDepth[depth];
    node.rotation = hashNoise(node.data.id, 3) * JITTER.rotateByDepth[depth];

    if (node.depth >= 2) {
      node.y -= (node.depth - 1) * 30;
    }
  });

  // 2. Сгенерированные — «живые», растут ВВЕРХ по экрану
  const generated = root.descendants()
    .filter(d => d.data.isGenerated)
    .sort((a, b) => a.depth - b.depth);

  generated.forEach(node => {
    const parent = node.parent;
    if (!parent) return;

    const baseSideOffset = node.data.gender === 'male'
      ? -PARENT_SIDE_OFFSET
      : PARENT_SIDE_OFFSET;

    // Живой сдвиг в стороны
    const sideJitter = hashNoise(node.data.id, 11) * 25;
    // Вертикальный разброс
    const yJitter = hashNoise(node.data.id, 12) * 20;
    // Наклон
    const rotation = hashNoise(node.data.id, 13) * 4;

    // ВАЖНО: минус — уводит визуально ВВЕРХ по экрану
    // (offsetY компенсирует инверсию D3)
    node.x = parent.x + baseSideOffset + sideJitter;
    node.y = parent.y + GENERATION_STEP_Y + yJitter;
    node.rotation = rotation;

    node.xIdeal = node.x;
    node.yIdeal = node.y;
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
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0] ? parts[0][0].toUpperCase() : '?';
}

// ============================================
// === ПРОЦЕДУРНАЯ ГЕНЕРАЦИЯ ПРЕДКОВ ===
// ============================================
const IR = CONFIG.infiniteRoots;

function randomFrom(arr, seed) {
  const idx = Math.abs(Math.floor(hashNoise(seed, 17) * 10000)) % arr.length;
  return arr[idx];
}

function generateAncestor(childId, childBirth, childGeneration, side) {
  const gender = side === 'father' ? 'male' : 'female';
  const firstName = randomFrom(gender === 'male' ? IR.namesMale : IR.namesFemale, childId + side);
  const lastName = randomFrom(IR.surnames, childId + 'last' + side);
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
    name: `${lastName} ${firstName}`,
    birth,
    gender,
    generation: childGeneration + 1,
    isGenerated: true,
    children: []
  };
}

// Ищет узел в familyData
function findInFamilyData(node, id) {
  if (node.id === id) return node;
  if (!node.children) return null;
  for (const child of node.children) {
    const found = findInFamilyData(child, id);
    if (found) return found;
  }
  return null;
}

// Загружает следующее поколение
function loadNextGeneration(datum) {
  if (datum.depth >= IR.maxGenerations) {
    console.log('⛔ Достигнут максимум поколений');
    return false;
  }
  if (datum._childrenLoaded) {
    console.log('↻ Уже загружено:', datum.data.name);
    return false;
  }

  // НЕ генерируем, если у узла УЖЕ есть дети (реальные)
  if (datum.data.children && datum.data.children.length > 0) {
    console.log('⏭ Узел уже имеет предков:', datum.data.name);
    return false;
  }

  const father = generateAncestor(datum.data.id, datum.data.birth, datum.depth, 'father');
  const mother = generateAncestor(datum.data.id, datum.data.birth, datum.depth, 'mother');

  console.log('✨ Генерирую предков для', datum.data.name, '→', father.name, '+', mother.name);

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

  console.warn('⚠️ Не найден в familyData:', datum.data.id);
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
    // Теперь ЛЮБОЙ узел без загруженных предков — кандидат
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
      console.log(`🌌 Загружено ${loaded} новых предков`);
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
    .attr('class', 'pulse')
    .attr('r', CONFIG.pulse.radius)
    .attr('fill', d => d.target.data.gender === 'male' ? '#4a9eff' : '#ff6bb0')
    .attr('opacity', 0)
    .attr('filter', CONFIG.pulse.glow ? 'url(#glow)' : null)
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
      const t = ((Date.now() + baseDelay) % CONFIG.pulse.speed) / CONFIG.pulse.speed;
      const point = path.getPointAtLength(t * totalLength);

      pulse
        .attr('cx', point.x)
        .attr('cy', point.y)
        .attr('opacity', Math.sin(t * Math.PI) * 0.9);
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

    // ГЕНЕРИРУЕМ ОТ ЛЮБОГО УЗЛА (если у него ещё нет детей)
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

    tooltip
      .style('opacity', 1)
      .html(`
        <strong>${d.data.name}</strong>
        <div class="row">Дата рождения: <span>${d.data.birth || 'неизвестна'}</span></div>
        <div class="row">Поколение: <span>${genLabel}</span></div>
        <div class="row">Пол: <span>${genderLabel}</span></div>
        ${d.children ? `<div class="row">Детей в древе: <span>${d.children.length}</span></div>` : ''}
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

// === СБРОС ===
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
        const finalAmp = d.data.isGenerated ? amp * 0.6 : amp;

        const dur = CONFIG.breathing.minDuration +
                    (hashNoise(d.data.id, 7) + 1) / 2 *
                    (CONFIG.breathing.maxDuration - CONFIG.breathing.minDuration);

        const phase = (hashNoise(d.data.id, 9) + 1) * Math.PI;
        const t = (now - startTime) / dur + phase;

        const dx = Math.sin(t) * finalAmp;
        const dy = Math.cos(t * 0.7) * finalAmp * 0.6;

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

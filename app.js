/**
 * Семейное древо Узун — D3.js рендер
 * 
 * Эффекты:
 *   - Предки уходят в бесконечность (opacity/scale по глубине)
 *   - Неровное расположение узлов (jitter + наклон)
 *   - Органические изогнутые связи
 *   - Пульсирующие «энергетические» точки по связям
 *   - Частицы при наведении на узел
 *   - Волна по родословной при клике
 *   - Мягкое дыхание дерева
 */

// === КОНФИГУРАЦИЯ ===
const CONFIG = {
  cardWidth: 140,
  cardHeight: 56,
  avatarRadius: 18,
  maxGeneration: 3,

  infinity: {
    minOpacity: 0.25,
    minScale: 0.55,
    opacityFalloff: 0.75,
    scaleFalloff: 0.45
  },

  duration: {
    zoom: 750,
    highlight: 300,
    entrance: 600
  },

  breathing: {
    enabled: true,
    baseAmp: 4,
    ampPerDepth: 3,
    minDuration: 4000,
    maxDuration: 7000
  },

  pulse: {
    enabled: true,
    speed: 4000,       // мс на полный пробег
    radius: 3,
    glow: true
  },

  particles: {
    enabled: true,
    onHover: 8,
    onWave: 6
  },

  wave: {
    stepDelay: 180,    // мс между узлами
    duration: 400
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

// Слои: свечение → связи → пульсы → узлы
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
const linkLayer   = g.append('g').attr('class', 'links-layer');
const pulseLayer  = g.append('g').attr('class', 'pulse-layer');
const nodeLayer   = g.append('g').attr('class', 'nodes-layer');
const particleLayer = g.append('g').attr('class', 'particle-layer');

const offsetX = width / 2;
const offsetY = height * 0.15;

// === ЗУМ ===
const zoom = d3.zoom()
  .scaleExtent([0.15, 3])
  .on('zoom', (event) => {
    g.attr('transform', event.transform);
  });

svg.call(zoom);

// === ПОСТРОЕНИЕ ДЕРЕВА ===
const hierarchyData = buildHierarchy(familyData);
const root = d3.hierarchy(hierarchyData);

const treeLayout = d3.tree()
  .size([width * 0.85, height * 0.7])
  .separation((a, b) => (a.parent === b.parent ? 1.4 : 2.2));

treeLayout(root);

// === ДЕТЕРМИНИРОВАННЫЙ ШУМ ===
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

root.descendants().forEach(d => {
  const depth = Math.min(d.depth, JITTER.xByDepth.length - 1);

  d.xIdeal = d.x;
  d.yIdeal = d.y;

  d.x += hashNoise(d.data.id, 1) * JITTER.xByDepth[depth];
  d.y += hashNoise(d.data.id, 2) * JITTER.yByDepth[depth];
  d.rotation = hashNoise(d.data.id, 3) * JITTER.rotateByDepth[depth];

  if (d.depth >= 2) {
    d.y -= (d.depth - 1) * 30;
  }
});

// === ЭФФЕКТ БЕСКОНЕЧНОСТИ ===
function getGenerationStyle(generation) {
  const t = generation / CONFIG.maxGeneration;
  const { minOpacity, minScale, opacityFalloff, scaleFalloff } = CONFIG.infinity;

  return {
    opacity: Math.max(minOpacity, 1 - t * opacityFalloff),
    scale: Math.max(minScale, 1 - t * scaleFalloff)
  };
}

// === СВЯЗИ (органические) ===
function organicLink(d) {
  const sx = d.source.x + offsetX;
  const sy = d.source.y + offsetY;
  const tx = d.target.x + offsetX;
  const ty = d.target.y + offsetY;

  const midY = (sy + ty) / 2;
  const bend = (tx - sx) * 0.25;

  return `M${sx},${sy} C${sx + bend},${midY} ${tx - bend},${midY} ${tx},${ty}`;
}

const links = linkLayer.selectAll('.link')
  .data(root.links())
  .enter()
  .append('path')
  .attr('class', 'link')
  .attr('d', organicLink)
  .attr('stroke', d => {
    const { opacity } = getGenerationStyle(d.target.depth);
    return `rgba(74, 158, 255, ${opacity * 0.5})`;
  })
  .attr('stroke-width', d => {
    const { scale } = getGenerationStyle(d.target.depth);
    return 1.5 * scale;
  });

// === УЗЛЫ ===
const nodes = nodeLayer.selectAll('.node')
  .data(root.descendants())
  .enter()
  .append('g')
  .attr('class', 'node')
  .attr('data-id', d => d.data.id)
  .style('opacity', 0);

function nodeTransform(d, dx = 0, dy = 0) {
  const { scale } = getGenerationStyle(d.depth);
  const rot = d.rotation || 0;
  return `translate(${d.x + offsetX + dx}, ${d.y + offsetY + dy}) rotate(${rot}) scale(${scale})`;
}

nodes.attr('transform', d => nodeTransform(d));

nodes.transition()
  .duration(CONFIG.duration.entrance)
  .delay(d => d.depth * 150)
  .style('opacity', d => getGenerationStyle(d.depth).opacity);

// --- Карточка ---
nodes.append('rect')
  .attr('class', 'card-bg')
  .attr('x', -CONFIG.cardWidth / 2)
  .attr('y', -CONFIG.cardHeight / 2)
  .attr('width', CONFIG.cardWidth)
  .attr('height', CONFIG.cardHeight)
  .attr('rx', 10);

const avatarX = -CONFIG.cardWidth / 2 + 28;

nodes.append('circle')
  .attr('class', d => `avatar-circle ${d.data.gender}`)
  .attr('cx', avatarX)
  .attr('cy', 0)
  .attr('r', CONFIG.avatarRadius);

nodes.append('text')
  .attr('class', 'avatar-text')
  .attr('x', avatarX)
  .attr('y', 0)
  .text(d => getInitials(d.data.name));

nodes.append('text')
  .attr('class', 'card-name')
  .attr('x', avatarX + 26)
  .attr('y', -6)
  .text(d => {
    const parts = d.data.name.split(' ');
    return parts.length > 1 ? `${parts[0]} ${parts[1]}` : d.data.name;
  });

nodes.append('text')
  .attr('class', 'card-date')
  .attr('x', avatarX + 26)
  .attr('y', 10)
  .text(d => d.data.birth || '—');

// === ВСПОМОГАТЕЛЬНЫЕ ===
function getInitials(name) {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0] ? parts[0][0].toUpperCase() : '?';
}

// === ПОДСВЕТКА ===
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
      .attr('cx', baseX)
      .attr('cy', baseY)
      .attr('r', 1.5 + Math.random() * 2)
      .attr('fill', color)
      .attr('filter', 'url(#glow)')
      .attr('opacity', 0.9)
      .transition()
      .duration(700 + Math.random() * 500)
      .ease(d3.easeCubicOut)
      .attr('cx', baseX + Math.cos(angle) * dist)
      .attr('cy', baseY + Math.sin(angle) * dist)
      .attr('r', 0)
      .attr('opacity', 0)
      .remove();
  }
}

// === ВОЛНА ПО РОДОСЛОВНОЙ ===
function animateAncestorWave(node) {
  const ancestors = node.ancestors().reverse(); // от корня к узлу

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

      // Частицы на каждом предке
      spawnParticles(ancestor, CONFIG.particles.onWave);

      // Снять свечение через время
      setTimeout(() => {
        nodeLayer.selectAll('.node')
          .filter(d => d.data.id === ancestor.data.id)
          .select('.card-bg')
          .style('filter', null);
      }, CONFIG.wave.duration + 200);
    }, i * CONFIG.wave.stepDelay);
  });

  // Подсветка связей вдоль пути
  const ancestorIds = new Set(ancestors.map(a => a.data.id));
  linkLayer.selectAll('.link')
    .classed('highlighted', d => ancestorIds.has(d.target.data.id))
    .classed('dimmed', d => !ancestorIds.has(d.target.data.id));
}

// === ПУЛЬСИРУЮЩИЕ СВЯЗИ ===
if (CONFIG.pulse.enabled) {
  links.each(function(d) {
    const path = d3.select(this);
    const totalLength = path.node().getTotalLength();
    const baseDelay = (hashNoise(d.target.data.id, 42) + 1) * 1000;
    const color = d.target.data.gender === 'male' ? '#4a9eff' : '#ff6bb0';

    const pulse = pulseLayer.append('circle')
      .attr('r', CONFIG.pulse.radius)
      .attr('fill', color)
      .attr('opacity', 0)
      .attr('filter', CONFIG.pulse.glow ? 'url(#glow)' : null);

    function animate() {
      const t = ((Date.now() + baseDelay) % CONFIG.pulse.speed) / CONFIG.pulse.speed;
      const point = path.node().getPointAtLength(t * totalLength);

      pulse
        .attr('cx', point.x)
        .attr('cy', point.y)
        .attr('opacity', Math.sin(t * Math.PI) * 0.9);

      requestAnimationFrame(animate);
    }
    animate();
  });
}

// === ИНТЕРАКТИВ ===
nodes.on('mouseenter', (event, d) => {
  spawnParticles(d, CONFIG.particles.onHover);
});

nodes.on('click', (event, d) => {
  event.stopPropagation();

  const scale = 1.6;
  const x = width / 2 - (d.x + offsetX) * scale;
  const y = height / 2 - (d.y + offsetY) * scale;

  svg.transition()
    .duration(CONFIG.duration.zoom)
    .call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));

  animateAncestorWave(d);
});

nodes.on('mouseover', (event, d) => {
  const genLabel = d.depth === 0
    ? 'Младшее поколение'
    : `${d.depth}-е поколение от младшего`;
  const genderLabel = d.data.gender === 'male' ? 'Мужской' : 'Женский';

  tooltip
    .style('opacity', 1)
    .html(`
      <strong>${d.data.name}</strong>
      <div class="row">Дата рождения: <span>${d.data.birth || 'неизвестна'}</span></div>
      <div class="row">Поколение: <span>${genLabel}</span></div>
      <div class="row">Пол: <span>${genderLabel}</span></div>
      ${d.children ? `<div class="row">Детей в древе: <span>${d.children.length}</span></div>` : ''}
    `)
    .style('left', (event.pageX + 15) + 'px')
    .style('top', (event.pageY - 15) + 'px');
});

nodes.on('mousemove', (event) => {
  tooltip
    .style('left', (event.pageX + 15) + 'px')
    .style('top', (event.pageY - 15) + 'px');
});

nodes.on('mouseout', () => {
  tooltip.style('opacity', 0);
});

svg.on('click', () => {
  svg.transition()
    .duration(CONFIG.duration.zoom)
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

// === СТАТИСТИКА ===
document.getElementById('stats').textContent =
  `👥 ${root.descendants().length} человек · ${CONFIG.maxGeneration + 1} поколения`;

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

      nodes.attr('transform', function(d) {
        const amp = CONFIG.breathing.baseAmp + d.depth * CONFIG.breathing.ampPerDepth;

        const dur = CONFIG.breathing.minDuration +
                    (hashNoise(d.data.id, 7) + 1) / 2 *
                    (CONFIG.breathing.maxDuration - CONFIG.breathing.minDuration);

        const phase = (hashNoise(d.data.id, 9) + 1) * Math.PI;
        const t = (now - startTime) / dur + phase;

        const dx = Math.sin(t) * amp;
        const dy = Math.cos(t * 0.7) * amp * 0.6;

        return nodeTransform(d, dx, dy);
      });
    }
    requestAnimationFrame(breathe);
  }
  breathe();
}

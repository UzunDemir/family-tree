/**
 * Семейное древо Узун — D3.js рендер
 * Эффект «предки уходят в бесконечность»:
 *   чем глубже поколение, тем меньше opacity и scale
 */

// === КОНФИГУРАЦИЯ ===
const CONFIG = {
  cardWidth: 140,
  cardHeight: 56,
  avatarRadius: 18,
  maxGeneration: 3,

  // Эффект бесконечности
  infinity: {
    minOpacity: 0.25,   // самая дальняя карточка
    minScale: 0.55,     // самый дальний размер
    opacityFalloff: 0.75,
    scaleFalloff: 0.45
  },

  // Анимации
  duration: {
    zoom: 750,
    highlight: 300,
    entrance: 600
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

// Слой с зумом
const g = svg.append('g').attr('class', 'main-group');

// Слой для связей (рисуется первым)
const linkLayer = g.append('g').attr('class', 'links-layer');
// Слой для узлов (рисуется поверх)
const nodeLayer = g.append('g').attr('class', 'nodes-layer');

// Отступы
const offsetX = width / 2;
const offsetY = height * 0.15;

// Зум и панорамирование
const zoom = d3.zoom()
  .scaleExtent([0.15, 3])
  .on('zoom', (event) => {
    g.attr('transform', event.transform);
  });

svg.call(zoom);

// Начальная позиция
svg.call(zoom.transform, d3.zoomIdentity.translate(0, 0));

// === ПОСТРОЕНИЕ ДЕРЕВА ===
// const hierarchyData = buildHierarchy(familyData);
// const root = d3.hierarchy(hierarchyData);

// const treeLayout = d3.tree()
//   .size([width * 0.85, height * 0.7])
//   .separation((a, b) => (a.parent === b.parent ? 1.4 : 2.2));

// treeLayout(root);

const hierarchyData = buildHierarchy(familyData);
const root = d3.hierarchy(hierarchyData);

// === БАЗОВЫЙ LAYOUT ===
const treeLayout = d3.tree()
  .size([width * 0.85, height * 0.7])
  .separation((a, b) => (a.parent === b.parent ? 1.4 : 2.2));

treeLayout(root);

// === НЕРОВНОЕ РАСПОЛОЖЕНИЕ УЗЛОВ ===
// Детерминированный «шум» — чтобы при перезагрузке не прыгало
function hashNoise(id, seed = 0) {
  let h = seed;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  // Преобразуем в диапазон [-1, 1]
  return ((h % 1000) / 1000) * 2 - 1;
}

// Настраиваем «живость» по поколениям
const JITTER = {
  // чем глубже поколение, тем сильнее разброс
  xByDepth:   [20, 35, 55, 80],   // горизонтальный сдвиг (px)
  yByDepth:   [10, 20, 35, 55],   // вертикальный сдвиг (px)
  rotateByDepth: [0, 1.5, 3, 5]   // наклон (градусы)
};

// Применяем сдвиг к каждой ноде
root.descendants().forEach(d => {
  const depth = Math.min(d.depth, JITTER.xByDepth.length - 1);

  const jx = hashNoise(d.data.id, 1) * JITTER.xByDepth[depth];
  const jy = hashNoise(d.data.id, 2) * JITTER.yByDepth[depth];
  const jr = hashNoise(d.data.id, 3) * JITTER.rotateByDepth[depth];

  // Сохраняем «идеальные» координаты (для связей)
  d.xIdeal = d.x;
  d.yIdeal = d.y;

  // Смещаем
  d.x = d.x + jx;
  d.y = d.y + jy;
  d.rotation = jr;
});

// Дополнительно: предки «плывут вверх» — чем глубже, тем выше
root.descendants().forEach(d => {
  if (d.depth >= 2) {
    const lift = (d.depth - 1) * 30; // 2-е поколение: +30, 3-е: +60
    d.y -= lift;
  }
});



// === ЭФФЕКТ БЕСКОНЕЧНОСТИ ===
function getGenerationStyle(generation) {
  const t = generation / CONFIG.maxGeneration;
  const { minOpacity, minScale, opacityFalloff, scaleFalloff } = CONFIG.infinity;

  return {
    opacity: 1 - t * opacityFalloff,
    scale: 1 - t * scaleFalloff,
    blur: t * 1.5 // лёгкое размытие для дальних
  };
}

// === РИСУЕМ СВЯЗИ ===
// const linkGenerator = d3.linkVertical()
//   .x(d => d.x + offsetX)
//   .y(d => d.y + offsetY);

// const links = linkLayer.selectAll('.link')
//   .data(root.links())
//   .enter()
//   .append('path')
//   .attr('class', 'link')
//   .attr('d', linkGenerator)
//   .attr('stroke', d => {
//     const { opacity } = getGenerationStyle(d.target.depth);
//     return `rgba(74, 158, 255, ${opacity * 0.5})`;
//   })
//   .attr('stroke-width', d => {
//     const { scale } = getGenerationStyle(d.target.depth);
//     return 1.5 * scale;
//   });


// Органические кривые — не прямые, а изогнутые
function organicLink(d) {
  const sx = d.source.x + offsetX;
  const sy = d.source.y + offsetY;
  const tx = d.target.x + offsetX;
  const ty = d.target.y + offsetY;

  const midY = (sy + ty) / 2;
  const bend = (tx - sx) * 0.25; // небольшой изгиб в сторону

  return `M${sx},${sy}
          C${sx + bend},${midY}
           ${tx - bend},${midY}
           ${tx},${ty}`;
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


// === РИСУЕМ УЗЛЫ ===
// const nodes = nodeLayer.selectAll('.node')
//   .data(root.descendants())
//   .enter()
//   .append('g')
//   .attr('class', 'node')
//   .attr('data-id', d => d.data.id)
//   .attr('transform', d => {
//     const { scale } = getGenerationStyle(d.depth);
//     return `translate(${d.x + offsetX}, ${d.y + offsetY}) scale(${scale})`;
//   })
//   .style('opacity', 0)
//   .style('animation-delay', d => `${d.depth * 150}ms`);


const nodes = nodeLayer.selectAll('.node')
  .data(root.descendants())
  .enter()
  .append('g')
  .attr('class', 'node')
  .attr('data-id', d => d.data.id)
  .attr('transform', d => {
    const { scale } = getGenerationStyle(d.depth);
    const rot = d.rotation || 0;
    return `translate(${d.x + offsetX}, ${d.y + offsetY}) rotate(${rot}) scale(${scale})`;
  })
  .style('opacity', 0)
  .style('animation-delay', d => `${d.depth * 150}ms`);


// Плавное появление
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

// --- Аватар (круг) ---
const avatarX = -CONFIG.cardWidth / 2 + 28;

nodes.append('circle')
  .attr('class', d => `avatar-circle ${d.data.gender}`)
  .attr('cx', avatarX)
  .attr('cy', 0)
  .attr('r', CONFIG.avatarRadius);

// --- Инициалы в аватаре ---
nodes.append('text')
  .attr('class', 'avatar-text')
  .attr('x', avatarX)
  .attr('y', 0)
  .text(d => getInitials(d.data.name));

// --- Имя ---
nodes.append('text')
  .attr('class', 'card-name')
  .attr('x', avatarX + 26)
  .attr('y', -6)
  .text(d => {
    const parts = d.data.name.split(' ');
    return parts.length > 1 ? `${parts[0]} ${parts[1]}` : d.data.name;
  });

// --- Дата рождения ---
nodes.append('text')
  .attr('class', 'card-date')
  .attr('x', avatarX + 26)
  .attr('y', 10)
  .text(d => d.data.birth || '—');

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
function getInitials(name) {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0] ? parts[0][0].toUpperCase() : '?';
}

// === ПОДСВЕТКА ВЕТКИ ===
function highlightBranch(node) {
  // Сбрасываем всё
  nodeLayer.selectAll('.card-bg').classed('highlighted', false).classed('root-highlighted', false);
  linkLayer.selectAll('.link').classed('highlighted', false).classed('dimmed', false);

  // Путь от узла до корня
  const ancestors = node.ancestors();
  const ancestorIds = new Set(ancestors.map(a => a.data.id));

  // Корень — особый цвет
  const rootId = root.data.id;

  // Подсвечиваем карточки
  nodeLayer.selectAll('.node')
    .filter(d => ancestorIds.has(d.data.id))
    .select('.card-bg')
    .classed('highlighted', d => d.data.id !== rootId)
    .classed('root-highlighted', d => d.data.id === rootId);

  // Подсвечиваем связи
  linkLayer.selectAll('.link')
    .filter(d => ancestorIds.has(d.target.data.id))
    .classed('highlighted', true);

  // Остальные — приглушаем
  linkLayer.selectAll('.link')
    .filter(d => !ancestorIds.has(d.target.data.id))
    .classed('dimmed', true);

  // Убираем подсветку с узлов вне пути
  nodeLayer.selectAll('.node')
    .filter(d => !ancestorIds.has(d.data.id))
    .select('.card-bg')
    .attr('opacity', 0.3);
}

function resetHighlight() {
  nodeLayer.selectAll('.card-bg')
    .classed('highlighted', false)
    .classed('root-highlighted', false)
    .attr('opacity', 1);

  linkLayer.selectAll('.link')
    .classed('highlighted', false)
    .classed('dimmed', false)
    .attr('stroke', d => {
      const { opacity } = getGenerationStyle(d.target.depth);
      return `rgba(74, 158, 255, ${opacity * 0.5})`;
    });
}

// === ИНТЕРАКТИВ ===
nodes.on('click', (event, d) => {
  event.stopPropagation();

  // Плавный зум к узлу
  const scale = 1.6;
  const x = width / 2 - (d.x + offsetX) * scale;
  const y = height / 2 - (d.y + offsetY) * scale;

  svg.transition()
    .duration(CONFIG.duration.zoom)
    .call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));

  highlightBranch(d);
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

// Клик по фону — сброс
svg.on('click', () => {
  svg.transition()
    .duration(CONFIG.duration.zoom)
    .call(zoom.transform, d3.zoomIdentity);

  resetHighlight();
  tooltip.style('opacity', 0);
});

// === КНОПКИ УПРАВЛЕНИЯ ===
document.getElementById('btn-reset').addEventListener('click', (e) => {
  e.stopPropagation();
  svg.transition()
    .duration(CONFIG.duration.zoom)
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
  this.classList.toggle('active', hidden);
});

// === СТАТИСТИКА ===
const totalPeople = root.descendants().length;
const generations = CONFIG.maxGeneration + 1;
document.getElementById('stats').textContent =
  `👥 ${totalPeople} человек · ${generations} поколения`;

// === АДАПТИВНОСТЬ ===
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    location.reload(); // простой способ — перезагрузка
  }, 300);
});

// === КЛАВИАТУРА ===
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    svg.transition()
      .duration(CONFIG.duration.zoom)
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

// === ЖИВОЕ ДЫХАНИЕ ===
// Каждый узел медленно колеблется вокруг своей позиции
nodes.each(function(d) {
  const node = d3.select(this);
  const baseX = d.x + offsetX;
  const baseY = d.y + offsetY;
  const { scale } = getGenerationStyle(d.depth);

  const amp = 2 + d.depth * 1.5;       // амплитуда
  const dur = 4000 + Math.random() * 3000; // скорость
  const phase = Math.random() * Math.PI * 2;

  function tick() {
    const t = Date.now() / dur + phase;
    const dx = Math.sin(t) * amp;
    const dy = Math.cos(t * 0.7) * amp * 0.6;

    node.attr('transform',
      `translate(${baseX + dx}, ${baseY + dy}) rotate(${d.rotation || 0}) scale(${scale})`
    );

    requestAnimationFrame(tick);
  }
  tick();
});

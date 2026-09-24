/**
 * Данные семейного древа Узун
 * Основано на tree.xlsx
 */

let familyData = {
  id: "demir",
  name: "Узун Демир",
  birth: "24.12.2016",
  gender: "male",
  generation: 0,
  children: [],

  parents: [
    { id: "vitaliy", name: "Узун Виталий", birth: "02.12.1974", gender: "male", generation: 1 },
    { id: "natalia", name: "Симонова Наталья", birth: "26.02.1982", gender: "female", generation: 1 }
  ],

  grandparents: [
    { id: "nikolay",   name: "Узун Николай",      birth: "24.02.1945", gender: "male",   generation: 2, side: "father" },
    { id: "olga",      name: "Белиогло Ольга",    birth: "06.08.1950", gender: "female", generation: 2, side: "father" },
    { id: "alexander", name: "Симонов Александр", birth: "07.12.1958", gender: "male",   generation: 2, side: "mother" },
    { id: "nina",      name: "Цугуй Нина",        birth: "21.01.1958", gender: "female", generation: 2, side: "mother" }
  ],

  greatGrandparents: [
    { id: "petr",    name: "Узун Пётр",         birth: null,         gender: "male",   generation: 3, parentOf: "nikolay",   isInfinite: true },
    { id: "ivanka",  name: "Иванка",            birth: null,         gender: "female", generation: 3, parentOf: "nikolay",   isInfinite: true },
    { id: "ivan_b",  name: "Белиогло Иван",     birth: null,         gender: "male",   generation: 3, parentOf: "olga",      isInfinite: true },
    { id: "maria_r", name: "Радиш Мария",       birth: null,         gender: "female", generation: 3, parentOf: "olga",      isInfinite: true },
    { id: "trofim",  name: "Симонов Трофим",    birth: "07.10.1917", gender: "male",   generation: 3, parentOf: "alexander", isInfinite: true },
    { id: "motrika", name: "Маракуца Мотрика",  birth: "12.04.1919", gender: "female", generation: 3, parentOf: "alexander", isInfinite: true },
    { id: "pavel",   name: "Цугуй Павел",       birth: "07.11.1924", gender: "male",   generation: 3, parentOf: "nina",      isInfinite: true },
    { id: "marfa",   name: "Боян Марфа",        birth: "19.08.1927", gender: "female", generation: 3, parentOf: "nina",      isInfinite: true }
  ]
};

/**
 * Строит иерархию для D3 из familyData
 * Рекурсивно подтягивает сгенерированных предков
 */
function buildHierarchy(data) {
  function makeNode(id, name, birth, gender, generation, isInfinite = false, isGenerated = false) {
    return {
      id, name, birth, gender, generation,
      isInfinite, isGenerated,
      children: []
    };
  }

  function findNodeById(node, id) {
    if (node.id === id) return node;
    for (const child of node.children) {
      const found = findNodeById(child, id);
      if (found) return found;
    }
    return null;
  }

  function copyGenerated(targetNode, sourceNode) {
    if (!sourceNode.children || sourceNode.children.length === 0) return;
    targetNode.children = targetNode.children || [];
    sourceNode.children.forEach(srcChild => {
      const newNode = makeNode(
        srcChild.id, srcChild.name, srcChild.birth,
        srcChild.gender, srcChild.generation,
        false, true
      );
      targetNode.children.push(newNode);
      copyGenerated(newNode, srcChild);
    });
  }

  const root = makeNode(data.id, data.name, data.birth, data.gender, data.generation);

  const parents = {};
  (data.parents || []).forEach(p => {
    const node = makeNode(p.id, p.name, p.birth, p.gender, p.generation);
    parents[p.id] = node;
    root.children.push(node);
  });

  const grandparents = {};
  (data.grandparents || []).forEach(gp => {
    const node = makeNode(gp.id, gp.name, gp.birth, gp.gender, gp.generation);
    grandparents[gp.id] = node;
    if (gp.side === "father" && parents["vitaliy"]) {
      parents["vitaliy"].children.push(node);
    } else if (gp.side === "mother" && parents["natalia"]) {
      parents["natalia"].children.push(node);
    }
  });

  (data.greatGrandparents || []).forEach(ggp => {
    const node = makeNode(ggp.id, ggp.name, ggp.birth, ggp.gender, ggp.generation, ggp.isInfinite || false);
    const target = grandparents[ggp.parentOf];
    if (target) target.children.push(node);
  });

  (data.greatGrandparents || []).forEach(ggp => {
    const target = findNodeById(root, ggp.id);
    if (target) {
      copyGenerated(target, ggp);
    }
  });

  return root;
}

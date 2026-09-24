/**
 * Данные семейного древа Узун
 * Основано на tree.xlsx
 * 
 * Структура:
 *  - generation 0 — младший (Демир)
 *  - generation 3 — самые старшие (прародители), «уходят в бесконечность»
 */

const familyData = {
  id: "demir",
  name: "Узун Демир",
  birth: "24.12.2016",
  gender: "male",
  generation: 0,

  // Родители
  parents: [
    { id: "vitaliy", name: "Узун Виталий", birth: "02.12.1974", gender: "male", generation: 1 },
    { id: "natalia", name: "Симонова Наталья", birth: "26.02.1982", gender: "female", generation: 1 }
  ],

  // Бабушки и дедушки (2-е поколение)
  grandparents: [
    { id: "nikolay",   name: "Узун Николай",      birth: "24.02.1945", gender: "male",   generation: 2, side: "father" },
    { id: "olga",      name: "Белиогло Ольга",    birth: "06.08.1950", gender: "female", generation: 2, side: "father" },
    { id: "alexander", name: "Симонов Александр", birth: "07.12.1958", gender: "male",   generation: 2, side: "mother" },
    { id: "nina",      name: "Цугуй Нина",        birth: "21.01.1958", gender: "female", generation: 2, side: "mother" }
  ],

  // Прародители (3-е поколение — «бесконечность»)
  greatGrandparents: [
    { id: "petr",    name: "Узун Пётр",         birth: null,         gender: "male",   generation: 3, parentOf: "nikolay" },
    { id: "ivanka",  name: "Иванка",            birth: null,         gender: "female", generation: 3, parentOf: "nikolay" },
    { id: "ivan_b",  name: "Белиогло Иван",     birth: null,         gender: "male",   generation: 3, parentOf: "olga" },
    { id: "maria_r", name: "Радиш Мария",       birth: null,         gender: "female", generation: 3, parentOf: "olga" },
    { id: "trofim",  name: "Симонов Трофим",    birth: "07.10.1917", gender: "male",   generation: 3, parentOf: "alexander" },
    { id: "motrika", name: "Маракуца Мотрика",  birth: "12.04.1919", gender: "female", generation: 3, parentOf: "alexander" },
    { id: "pavel",   name: "Цугуй Павел",       birth: "07.11.1924", gender: "male",   generation: 3, parentOf: "nina" },
    { id: "marfa",   name: "Боян Марфа",        birth: "19.08.1927", gender: "female", generation: 3, parentOf: "nina" }
  ]
};

/**
 * Строит иерархию D3 из плоских данных
 */
function buildHierarchy(data) {
  const root = {
    id: data.id,
    name: data.name,
    birth: data.birth,
    gender: data.gender,
    generation: data.generation,
    children: []
  };

  // Поколение 1 — родители
  const parents = {};
  (data.parents || []).forEach(p => {
    const node = {
      id: p.id, name: p.name, birth: p.birth,
      gender: p.gender, generation: p.generation,
      children: []
    };
    parents[p.id] = node;
    root.children.push(node);
  });

  // Поколение 2 — бабушки/дедушки
  const grandparents = {};
  (data.grandparents || []).forEach(gp => {
    const node = {
      id: gp.id, name: gp.name, birth: gp.birth,
      gender: gp.gender, generation: gp.generation,
      children: []
    };
    grandparents[gp.id] = node;

    // Привязываем к соответствующему родителю
    if (gp.side === "father" && parents["vitaliy"]) {
      parents["vitaliy"].children.push(node);
    } else if (gp.side === "mother" && parents["natalia"]) {
      parents["natalia"].children.push(node);
    }
  });

  // Поколение 3 — прародители
  (data.greatGrandparents || []).forEach(ggp => {
    const node = {
      id: ggp.id, name: ggp.name, birth: ggp.birth,
      gender: ggp.gender, generation: ggp.generation,
      children: []
    };
    const targetParent = grandparents[ggp.parentOf];
    if (targetParent) {
      targetParent.children.push(node);
    }
  });

  return root;
}

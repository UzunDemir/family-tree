/**
 * Данные семейного древа Узун
 * 
 * У каждого человека можно указать `link` — любую ссылку.
 * Если link нет — кнопка не появится.
 */

let familyData = {
  id: "demir",
  name: "Узун Демир",
  birth: "24.12.2016",
  gender: "male",
  generation: 0,
  children: [],
  link: "https://www.facebook.com/demir.uzun.35/",

  parents: [
    { 
      id: "vitaliy", name: "Узун Виталий", birth: "02.12.1974", gender: "male", generation: 1,
      link: "https://www.facebook.com/demir.uzun.35"
    },
    { 
      id: "natalia", name: "Симонова Наталья", birth: "26.02.1982", gender: "female", generation: 1,
      link: "https://www.facebook.com/natalia.uzun.220202"
    }
  ],

  grandparents: [
    { id: "nikolay",   name: "Узун Николай",      birth: "24.02.1945", gender: "male",   generation: 2, side: "father", link: "https://www.facebook.com/nicolai.uzun" },
    { id: "olga",      name: "Белиогло Ольга",    birth: "06.08.1950", gender: "female", generation: 2, side: "father", link: "https://www.facebook.com/uzunolya" },
    { id: "alexander", name: "Симонов Александр", birth: "07.12.1958", gender: "male",   generation: 2, side: "mother" },
    { id: "nina",      name: "Цугуй Нина",        birth: "21.01.1958", gender: "female", generation: 2, side: "mother", link: "https://www.facebook.com/nina.simonov.5" }
  ],

  greatGrandparents: [
    { id: "petr",    name: "Узун Пётр",         birth: null,         gender: "male",   generation: 3, parentOf: "nikolay",   isInfinite: true, link: "https://pamyat-naroda.ru/heroes/podvig-chelovek_yubileinaya_kartoteka1520055895/?backurl=%2Fheroes%2F%3Fadv_search%3Dy%26last_name%3D%D0%A3%D0%B7%D1%83%D0%BD%26first_name%3D%D0%9F%D0%B5%D1%82%D1%80%26middle_name%3D%26date_birth_from%3D%26static_hash%3D33f2833c6222302deb10946e192aabf9b3573f3600cdbc1aa8742bd494516397v4%26place_birth_ids%3D%26division_ids%3D%26division_rod_ids%3D%26rank_group_ids%3D%26collection%3D%26award_ids%3D%26group%3Dall%26types%3Dpamyat_commander%3Anagrady_nagrad_doc%3Anagrady_uchet_kartoteka%3Anagrady_ubilein_kartoteka%3Apdv_kart_in%3Apdv_kart_in_inostranec%3Apamyat_voenkomat%3Apotery_vpp%3Apamyat_zsp_parts%3Akld_ran%3Akld_bolezn%3Akld_card%3Akld_upk%3Akld_vmf%3Akld_partizan%3Apotery_doneseniya_o_poteryah%3Apotery_gospitali%3Apotery_utochenie_poter%3Apotery_spiski_zahoroneniy%3Apotery_voennoplen%3Apotery_iskluchenie_iz_spiskov%3Apotery_kartoteki%3Apotery_rvk_extra%3Apotery_isp_extra%3Asame_doroga%3Asame_rvk%3Asame_guk%3Apotery_knigi_pamyati%26page%3D1%26grouppersons%3D1&" },
    { id: "ivanka",  name: "Иванка",            birth: null,         gender: "female", generation: 3, parentOf: "nikolay",   isInfinite: true },
    { id: "ivan_b",  name: "Белиогло Иван",     birth: null,         gender: "male",   generation: 3, parentOf: "olga",      isInfinite: true },
    { id: "maria_r", name: "Радиш Мария",       birth: null,         gender: "female", generation: 3, parentOf: "olga",      isInfinite: true },
    { id: "trofim",  name: "Симонов Трофим",    birth: "07.10.1917", gender: "male",   generation: 3, parentOf: "alexander", isInfinite: true },
    { id: "motrika", name: "Маракуца Мотрика",  birth: "12.04.1919", gender: "female", generation: 3, parentOf: "alexander", isInfinite: true },
    { id: "pavel",   name: "Цугуй Павел",       birth: "07.11.1924", gender: "male",   generation: 3, parentOf: "nina",      isInfinite: true, link: "https://pamyat-naroda.ru/heroes/person-hero77113349/?backurl=%2Fheroes%2F%3Fadv_search%3Dy%26last_name%3D%D0%A6%D1%83%D0%B3%D1%83%D0%B9%26first_name%3D%D0%9F%D0%B0%D0%B2%D0%B5%D0%BB%26middle_name%3D%26date_birth_from%3D%26static_hash%3D33f2833c6222302deb10946e192aabf9b3573f3600cdbc1aa8742bd494516397v4%26place_birth_ids%3D%26division_ids%3D%26division_rod_ids%3D%26rank_group_ids%3D%26collection%3D%26award_ids%3D%26group%3Dall%26types%3Dpamyat_commander%3Anagrady_nagrad_doc%3Anagrady_uchet_kartoteka%3Anagrady_ubilein_kartoteka%3Apdv_kart_in%3Apdv_kart_in_inostranec%3Apamyat_voenkomat%3Apotery_vpp%3Apamyat_zsp_parts%3Akld_ran%3Akld_bolezn%3Akld_card%3Akld_upk%3Akld_vmf%3Akld_partizan%3Apotery_doneseniya_o_poteryah%3Apotery_gospitali%3Apotery_utochenie_poter%3Apotery_spiski_zahoroneniy%3Apotery_voennoplen%3Apotery_iskluchenie_iz_spiskov%3Apotery_kartoteki%3Apotery_rvk_extra%3Apotery_isp_extra%3Asame_doroga%3Asame_rvk%3Asame_guk%3Apotery_knigi_pamyati%26page%3D1%26grouppersons%3D1&" },
    { id: "marfa",   name: "Боян Марфа",        birth: "19.08.1927", gender: "female", generation: 3, parentOf: "nina",      isInfinite: true }
  ]
};

/**
 * Строит иерархию для D3
 * Пробрасывает link
 */
function buildHierarchy(data) {
  function makeNode(id, name, birth, gender, generation, isInfinite = false, isGenerated = false, link = null) {
    return { 
      id, name, birth, gender, generation, 
      isInfinite, isGenerated, link,
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
        false, true,
        null
      );
      targetNode.children.push(newNode);
      copyGenerated(newNode, srcChild);
    });
  }

  const root = makeNode(
    data.id, data.name, data.birth, data.gender, data.generation,
    false, false,
    data.link
  );

  const parents = {};
  (data.parents || []).forEach(p => {
    const node = makeNode(
      p.id, p.name, p.birth, p.gender, p.generation,
      false, false,
      p.link
    );
    parents[p.id] = node;
    root.children.push(node);
  });

  const grandparents = {};
  (data.grandparents || []).forEach(gp => {
    const node = makeNode(
      gp.id, gp.name, gp.birth, gp.gender, gp.generation,
      false, false,
      gp.link
    );
    grandparents[gp.id] = node;
    if (gp.side === "father" && parents["vitaliy"]) {
      parents["vitaliy"].children.push(node);
    } else if (gp.side === "mother" && parents["natalia"]) {
      parents["natalia"].children.push(node);
    }
  });

  (data.greatGrandparents || []).forEach(ggp => {
    const node = makeNode(
      ggp.id, ggp.name, ggp.birth, ggp.gender, ggp.generation,
      ggp.isInfinite || false, false,
      ggp.link
    );
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

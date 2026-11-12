/* 荒野開拓記（仮） — データ（調整用の数値・持ち物・採れる物・レシピ・建物・段階）
   数値やレシピを変えるときは、まずここを見る。 */
(function () {
  const MZ = window.MZ = window.MZ || {};
  MZ.GAME = 'machizukuri';
  MZ.VERSION = 'β0.1.0';
  MZ.SAVE_KEY = 'machizukuri-save';
  MZ.SAVE_V = 1;

  /* 調整用の数値 */
  MZ.T = {
    cell: 2,          // 建築のマスの大きさ（m）
    half: 120,        // 荒野の広さ（中心からの距離 m）
    eye: 1.6,         // 目の高さ
    walk: 4.6, run: 7.6,
    sens: 0.0024,     // マウスで見回す速さ
    touchSens: 0.006, // 指で見回す速さ
    reach: 3.4,       // 採集できる距離
    aimCos: 0.72,     // 採集で選べる向きの広さ（cos）
    hitCool: 0.42,    // 1 回たたく間かくし（秒）
    buildMax: 14,     // 建てられる距離
    near: 7,          // 作業台・かまどを使える距離
    migrate: 9,       // 移住者が 1 人来る間かくし（秒）
    baseWater: 0, baseFood: 0, // 井戸・畑がなくてもまかなえる人数（0：井戸も畑もなければ人は来ない）
    radius: 0.35,     // 体の太さ（半径 m）
    height: 1.7,      // 身長
    fogStart: 45, fogEnd: 115, // 霧が始まる・濃くなりきる距離
    view3: { back: 4.5, up: 1.2 }, // 三人称のカメラ（後ろ・上 m）
    maxPeople: 60,    // 歩く姿を描く住民の上限
    autosave: 10,     // 自動保存の間かく（秒）
    regrowCheck: 1,   // 採れる物がまた出るかの判定の間かく（秒）
    chunk: 120,       // 区画のマスの数（240m）
    seed: 1014
  };

  /* 持ち物 */
  MZ.ITEMS = {
    stick: '枝', grass: '草', stone: '石', log: '原木', clay: '粘土', ore: '鉄鉱石',
    rope: 'ロープ', plank: '板', brick: 'れんが', ingot: '鉄インゴット'
  };
  MZ.ITEM_ORDER = ['stick', 'grass', 'stone', 'log', 'clay', 'ore', 'rope', 'plank', 'brick', 'ingot'];

  /* 道具（段 1 さびた・2 石・3 鉄。持つ道具は { axe: 1, pick: 1 }。持ちかえはせず、段の高い方を常に使う） */
  MZ.TOOLS = {
    axe: ['', 'さびた斧', '石の斧', '鉄の斧'],
    pick: ['', 'さびたつるはし', '石のつるはし', '鉄のつるはし']
  };

  /* 採れる物。tool：必要な道具（なければ素手）、need：必要な道具の段、n：荒野に置く数、
     minR：小屋からの最小の距離、r：ぶつかる半径（0 は通れる）、back：また生えるまでの秒 */
  MZ.NODES = {
    bush:  { name: '草むら',   verb: 'つむ',   hp: 1,  drops: { grass: 2, stick: 1 }, n: 110, minR: 6,  r: 0,   back: 90 },
    stone: { name: '石ころ',   verb: 'ひろう', hp: 1,  drops: { stone: 1 },           n: 80,  minR: 6,  r: 0,   back: 180 },
    tree:  { name: '木',       verb: '切る',   hp: 5,  drops: { log: 3, stick: 1 },   n: 130, minR: 10, r: 0.5, back: 240, tool: 'axe', need: 1 },
    rock:  { name: '岩',       verb: '掘る',   hp: 6,  drops: { stone: 3 },           n: 60,  minR: 14, r: 0.9, back: 300, tool: 'pick', need: 1 },
    clay:  { name: '粘土の土', verb: '掘る',   hp: 3,  drops: { clay: 2 },            n: 34,  minR: 18, r: 0,   back: 200, tool: 'pick', need: 1 },
    iron:  { name: '鉄の鉱脈', verb: '掘る',   hp: 10, drops: { ore: 2 },             n: 30,  minR: 40, r: 0.9, back: 400, tool: 'pick', need: 2 }
  };

  /* 材料レシピ・工作レシピ。at：近くに必要な設備、stage：解放される段階 */
  MZ.RECIPES = [
    { key: 'rope',  tab: 'mat',  name: 'ロープ',       cost: { grass: 3 },            give: { rope: 1 } },
    { key: 'plank', tab: 'mat',  name: '板',           cost: { log: 1 },              give: { plank: 2 }, at: 'bench' },
    { key: 'brick', tab: 'mat',  name: 'れんが',       cost: { clay: 2, stick: 1 },   give: { brick: 2 }, at: 'kiln' },
    { key: 'ingot', tab: 'mat',  name: '鉄インゴット', cost: { ore: 2, log: 1 },      give: { ingot: 1 }, at: 'furnace' },
    { key: 'axe2',  tab: 'tool', name: '石の斧',       cost: { stick: 2, stone: 3, rope: 1 }, tool: ['axe', 2], at: 'bench', note: '木を速く切れる' },
    { key: 'pick2', tab: 'tool', name: '石のつるはし', cost: { stick: 2, stone: 3, rope: 1 }, tool: ['pick', 2], at: 'bench', note: '鉄の鉱脈を掘れる' },
    { key: 'axe3',  tab: 'tool', name: '鉄の斧',       cost: { plank: 2, ingot: 2, rope: 1 }, tool: ['axe', 3], at: 'bench', stage: 1, note: 'もっと速く切れる' },
    { key: 'pick3', tab: 'tool', name: '鉄のつるはし', cost: { plank: 2, ingot: 2, rope: 1 }, tool: ['pick', 3], at: 'bench', stage: 1, note: 'もっと速く掘れる' }
  ];

  /* 建築レシピ。w：マスの数（正方形）、solid：通れない、home：住める人数、
     water・food：まかなえる人数、stage：解放される段階（0 始まり。無ければ段階 0 から）、
     fixed：こわせない、jobs：働く住民の数、makes・every：every 秒ごとに持ち物へ入る物 */
  MZ.BUILDS = {
    hut:    { name: '小屋',       w: 2, solid: true, fixed: true },
    fire:   { name: 'たき火',     w: 1, solid: true,  cost: { stick: 3, stone: 2 }, note: 'かざり。あたたかい' },
    bench:  { name: '作業台',     w: 1, solid: true,  cost: { log: 4, stone: 2 }, note: '板・道具をつくれる' },
    road:   { name: '土の道',     w: 1, solid: false, cost: { stone: 1 }, note: '道に面した家に人が来る' },
    house:  { name: '木の家',     w: 2, solid: true,  cost: { plank: 8, log: 4, stone: 4, rope: 2 }, home: 2, note: '2人が住める' },
    field:  { name: '畑',         w: 2, solid: false, cost: { stick: 4, grass: 4 }, food: 4, note: '4人分の食料' },
    well:   { name: '井戸',       w: 1, solid: true,  cost: { stone: 10, rope: 2, plank: 2 }, water: 10, note: '10人分の水' },
    kiln:   { name: 'かまど',     w: 1, solid: true,  cost: { stone: 8, clay: 4 }, note: '粘土を焼いてれんがにする' },
    furnace: { name: '炉',       w: 1, solid: true,  cost: { stone: 10, brick: 6, clay: 4 }, note: '鉄鉱石をとかして鉄インゴットにする' },
    lumber: { name: 'きこり小屋', w: 2, solid: true,  cost: { plank: 10, stone: 6 }, stage: 1, jobs: 2, makes: { log: 1 }, every: 20, note: '住民2人で原木を自動でつくる' },
    bhouse: { name: 'れんがの家', w: 2, solid: true,  cost: { brick: 12, plank: 6, ingot: 2 }, home: 4, stage: 1, note: '4人が住める' }
  };
  MZ.BUILD_ORDER = ['bench', 'road', 'house', 'field', 'well', 'fire', 'kiln', 'furnace', 'lumber', 'bhouse'];

  /* 段階（人口で上がる）。3 つめより先は今後の版で中身を足す */
  MZ.STAGES = [
    { name: '開拓', pop: 0 },
    { name: '集落', pop: 10 },
    { name: '村',   pop: 50 },
    { name: '町',   pop: 200 },
    { name: '都市', pop: 1000 },
    { name: '大都市', pop: 5000 }
  ];
})();

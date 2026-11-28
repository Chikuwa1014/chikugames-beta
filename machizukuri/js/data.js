/* 荒野開拓記（仮） — データ（調整用の数値・持ち物・採れる物・レシピ・建物・段階）
   数値やレシピを変えるときは、まずここを見る。 */
(function () {
  const MZ = window.MZ = window.MZ || {};
  MZ.GAME = 'machizukuri';
  MZ.VERSION = 'β0.3.2';
  MZ.SAVE_KEY = 'machizukuri-save';
  MZ.SAVE_V = 3;

  /* 調整用の数値 */
  MZ.T = {
    cell: 2,          // 建築のマスの大きさ（m）
    half: 120,        // 1 区画の半分の長さ（m）。土地の端としては使わない（MZ.landAt・W.inLand・W.clampLand で決める）
    eye: 1.6,         // 目の高さ
    walk: 4.6, run: 7.6,
    sens: 0.0024,     // マウスで見回す速さ
    touchSens: 0.006, // 指で見回す速さ
    reach: 3.4,       // 採集できる距離
    aimCos: 0.72,     // 採集で選べる向きの広さ（cos）
    hitCool: 0.42,    // 1 回たたく間かくし（秒）
    buildMax: 14,     // 建てられる距離
    near: 7,          // 作業台・かまどを使える距離
    migrate: 9,       // 移住者が 1 人来る間かくし（秒）。段階が villageStage より前
    migrateVillage: 6, // 段階が villageStage 以上のときの移住の間かく（秒）
    shopFree: 50,     // 店が無くても来られる人数
    autoCap: 100,     // 自動でたまる材料の上限（倉庫なし。倉庫の store をたす）
    villageStage: 2,  // 「村」の段階の番号（STAGES の番号。HUD の「店」を出す・移住の間かくを変える）
    baseWater: 0, baseFood: 0, // 井戸・畑がなくてもまかなえる人数（0：井戸も畑もなければ人は来ない）
    radius: 0.35,     // 体の太さ（半径 m）
    height: 1.7,      // 身長
    fogStart: 45, fogEnd: 115, // 霧が始まる・濃くなりきる距離
    view3: { back: 4.5, up: 1.2 }, // 三人称のカメラ（後ろ・上 m）
    maxPeople: 60,    // 歩く姿を描く住民の上限
    autosave: 10,     // 自動保存の間かく（秒）
    regrowCheck: 1,   // 採れる物がまた出るかの判定の間かく（秒）
    chunk: 120,       // 区画のマスの数（240m）
    span: 3,          // 世界の幅（区画の数）。真ん中が "0,0"。全体のマスは 360×360
    seed: 1014
  };

  /* 全体のマス（world.js・gfx が使う。120 や 360 は直接書かない）。区画 "0,0" の中では今までのマスの番号と同じ */
  MZ.GN = MZ.T.chunk * MZ.T.span;                   // 全体のマスの一辺（360）
  MZ.G0 = -MZ.T.chunk * (MZ.T.span - 1) / 2;        // いちばん小さい全体のマスの番号（−120）

  /* 持ち物 */
  MZ.ITEMS = {
    stick: '枝', grass: '草', stone: '石', log: '原木', clay: '粘土', ore: '鉄鉱石',
    rope: 'ロープ', plank: '板', brick: 'れんが', ingot: '鉄インゴット', concrete: 'コンクリート'
  };
  MZ.ITEM_ORDER = ['stick', 'grass', 'stone', 'log', 'clay', 'ore', 'rope', 'plank', 'brick', 'ingot', 'concrete'];
  /* 持ち物で、この段階になるまで一覧に出さない物（数が 0 のあいだ。段階の番号）。レシピ側の stage で作れる・えらべるのも同じ段階 */
  MZ.ITEM_STAGE = { concrete: 3 };

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
    iron:  { name: '鉄の鉱脈', verb: '掘る',   hp: 10, drops: { ore: 4 },             n: 30,  minR: 40, r: 0.9, back: 400, tool: 'pick', need: 2 }
  };

  /* 材料レシピ・工作レシピ。at：近くに必要な設備、stage：解放される段階 */
  MZ.RECIPES = [
    { key: 'rope',  tab: 'mat',  name: 'ロープ',       cost: { grass: 3 },            give: { rope: 1 } },
    { key: 'plank', tab: 'mat',  name: '板',           cost: { log: 1 },              give: { plank: 2 }, at: 'bench' },
    { key: 'brick', tab: 'mat',  name: 'れんが',       cost: { clay: 2, stick: 1 },   give: { brick: 2 }, at: 'kiln' },
    { key: 'ingot', tab: 'mat',  name: '鉄インゴット', cost: { ore: 2, log: 1 },      give: { ingot: 1 }, at: 'furnace' },
    { key: 'concrete', tab: 'mat', name: 'コンクリート', cost: { stone: 2, clay: 1 },  give: { concrete: 1 }, at: 'kiln', stage: 3 },
    { key: 'axe2',  tab: 'tool', name: '石の斧',       cost: { stick: 2, stone: 3, rope: 1 }, tool: ['axe', 2], at: 'bench', note: '木を速く切れる' },
    { key: 'pick2', tab: 'tool', name: '石のつるはし', cost: { stick: 2, stone: 3, rope: 1 }, tool: ['pick', 2], at: 'bench', note: '鉄の鉱脈を掘れる' },
    { key: 'axe3',  tab: 'tool', name: '鉄の斧',       cost: { plank: 2, ingot: 2, rope: 1 }, tool: ['axe', 3], at: 'bench', stage: 1, note: 'もっと速く切れる' },
    { key: 'pick3', tab: 'tool', name: '鉄のつるはし', cost: { plank: 2, ingot: 2, rope: 1 }, tool: ['pick', 3], at: 'bench', stage: 1, note: 'もっと速く掘れる' }
  ];

  /* 建築レシピ。w：マスの数（正方形）、solid：通れない、home：住める人数、
     water・food：まかなえる人数、stage：解放される段階（0 始まり。無ければ段階 0 から）、
     fixed：こわせない、jobs：働く住民の数（makes があって jobs が無い建物は、人手なしでいつも動く）、makes・every：every 秒ごとに持ち物へ入る物、
     road：道としてつながる、pave：小屋までつながったこの道に面した家は、住める人数が pave ふえる（1 軒に 1 回）、
     shop：店がまかなう人数、staff：歩く姿と表示だけの人数（人口からは引かない）、store：自動でたまる上限をふやす数、
     craft：工房でつくれる物（MZ.RECIPES の key。1 回ぶんは、そのレシピの cost → give） */
  MZ.BUILDS = {
    hut:    { name: '小屋',       w: 2, solid: true, fixed: true },
    fire:   { name: 'たき火',     w: 1, solid: true,  cost: { stick: 3, stone: 2 }, note: 'かざり。あたたかい' },
    bench:  { name: '作業台',     w: 1, solid: true,  cost: { log: 4, stone: 2 }, note: '板・道具をつくれる' },
    road:   { name: '土の道',     w: 1, solid: false, cost: { stone: 1 }, road: true, note: '道に面した家に人が来る' },
    stoneroad: { name: '石畳の道', w: 1, solid: false, cost: { stone: 2 }, stage: 2, road: true, pave: 1, note: '土の道と同じにつながる。面した家は 1 人多く住める' },
    house:  { name: '木の家',     w: 2, solid: true,  cost: { plank: 8, log: 4, stone: 4, rope: 2 }, home: 2, note: '2人が住める' },
    field:  { name: '畑',         w: 2, solid: false, cost: { stick: 4, grass: 4 }, food: 4, note: '4人分の食料' },
    bigfield: { name: '大きな畑', w: 3, solid: false, cost: { plank: 8, grass: 10 }, stage: 2, food: 12, makes: { grass: 2 }, every: 40, note: '12人分の食料。人手なしで草もできる' },
    well:   { name: '井戸',       w: 1, solid: true,  cost: { stone: 10, rope: 2, plank: 2 }, water: 10, note: '10人分の水' },
    kiln:   { name: 'かまど',     w: 1, solid: true,  cost: { stone: 8, clay: 4 }, note: '粘土を焼いてれんがにする' },
    furnace: { name: '炉',       w: 1, solid: true,  cost: { stone: 10, brick: 6, clay: 4 }, note: '鉄鉱石をとかして鉄インゴットにする' },
    lumber: { name: 'きこり小屋', w: 2, solid: true,  cost: { plank: 10, stone: 6 }, stage: 1, jobs: 2, makes: { log: 1, stick: 1 }, every: 20, note: '住民2人で原木と枝を自動でつくる' },
    bhouse: { name: 'れんがの家', w: 2, solid: true,  cost: { brick: 12, plank: 6, ingot: 2 }, home: 4, stage: 1, note: '4人が住める' },
    quarry: { name: '採石場',     w: 2, solid: true,  cost: { plank: 12, ingot: 4, rope: 4 }, stage: 2, jobs: 3, makes: { stone: 3 }, every: 30, note: '住民3人で石を自動でつくる' },
    claypit: { name: '粘土採り場', w: 2, solid: true, cost: { plank: 10, stone: 8, rope: 2 }, stage: 2, jobs: 2, makes: { clay: 2 }, every: 30, note: '住民2人で粘土を自動でつくる' },
    workshop: { name: '工房',     w: 2, solid: true,  cost: { brick: 16, plank: 12, ingot: 4 }, stage: 2, jobs: 3, every: 25, smoke: true, craft: ['plank', 'brick', 'ingot', 'rope', 'concrete'], note: '住民3人で、えらんだ材料を自動でつくる' },
    shop:   { name: '商店',       w: 2, solid: true,  cost: { brick: 20, plank: 16, ingot: 4 }, stage: 2, shop: 30, staff: 2, note: '30人分の店' },
    storehouse: { name: '倉庫',   w: 3, solid: true,  cost: { brick: 24, plank: 24, ingot: 6 }, stage: 2, store: 150, note: '自動でたまる上限が 150 ふえる' }
  };
  MZ.BUILD_ORDER = ['bench', 'road', 'stoneroad', 'house', 'field', 'bigfield', 'well', 'fire', 'kiln', 'furnace', 'lumber', 'bhouse', 'quarry', 'claypit', 'workshop', 'shop', 'storehouse'];

  /* 自動でたまる材料の上限（どの物も同じ）。倉庫の store をたす。建物を数える街の側（town.js）が MZ.autoCap を作る */

  /* 区画の種類（β0.3.0）：区画のキー "cx,cz"（北は +z、東は +x）から毎回同じに決まる。"0,0" は「もとの土地」（採れる物は今のまま）。
     種類の mult は、採れる物の数（NODES[k].n）に掛ける倍率（無ければ 1） */
  MZ.CHUNK_KINDS = {
    '0,0': 'home',
    '0,1': 'forest', '1,0': 'rocky', '0,-1': 'clayland', '-1,0': 'forest',
    '1,1': 'rocky', '1,-1': 'clayland', '-1,-1': 'rocky', '-1,1': 'clayland'
  };
  MZ.KINDS = {
    home:     { name: 'もとの土地', mult: {} },
    forest:   { name: '森', mult: { tree: 2 } },
    rocky:    { name: '岩場', mult: { rock: 3, iron: 3 } },
    clayland: { name: '粘土の土地', mult: { clay: 3 } }
  };
  /* 土地を広げる材料。持っている区画の数 n（もとの区画は数えない。広げる 1 回めが 1）に対して、upto が n 以上の最初の行。条件は段階が T.villageStage 以上 */
  MZ.LAND_COST = [
    { upto: 2, cost: { plank: 40, stone: 40, rope: 5 } },
    { upto: 4, cost: { plank: 80, stone: 80, brick: 40 } },
    { upto: 8, cost: { plank: 120, stone: 120, brick: 80, ingot: 10 } }
  ];

  /* 段階（人口で上がる）。banner：その段階になったときに出す文（無ければ「○○になった！」）。町より先は今後の版で中身を足す */
  MZ.STAGES = [
    { name: '開拓', pop: 0 },
    { name: '集落', pop: 10, banner: '集落になった！ きこり小屋・れんがの家・鉄の道具が作れる' },
    { name: '村',   pop: 50, banner: '村になった！ 石畳・採石場・粘土採り場・工房・商店・倉庫・大きな畑が作れる' },
    { name: '町',   pop: 200, banner: '町になった！ ここまでが今の版です' },
    { name: '都市', pop: 1000 },
    { name: '大都市', pop: 5000 }
  ];
})();

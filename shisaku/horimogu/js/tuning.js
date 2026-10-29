/* ほりほりもぐもぐ — 調整用の数値（バランスはここだけを直す）
   ちくわ君の大きさを 1 とする。地形の 1 マスも 1。 */
const HM = window.HM = window.HM || {};

HM.VERSION = '1.1.4';
HM.GAME = 'horimogu';

HM.T = {
  /* フィールド（お豆腐）。N×N×N マス。下は奈落のおでん鍋 */
  field: 300,
  chunk: 16,
  potY: -22,            // おでん鍋の汁の高さ。ここより下に落ちたら沈む
  viewRange: 46,        // 見える距離（ヘッドライトの届く範囲）
  meshRadius: 4,        // まわりの何チャンクまで描くか

  /* フィールドの大きさ（プレイを始めるときにえらぶ） */
  sizes: [
    { key: 'short',  name: 'ショート', n: 60 },
    { key: 'tall',   name: 'トール',   n: 80 },
    { key: 'venti',  name: 'ベンティ', n: 120 },
    { key: 'grande', name: 'グランデ', n: 300 }
  ],

  /* カメラ。far＝後方視点（near より後ろへ下がる。壁があれば、その手前で止まる） */
  cam: { farDist: 6.0, farUp: 0.35, farLookUp: 1.2, fov: 70, fovPortrait: 84 },

  /* 地形の生成（シード値から全員同じものを作る） */
  gen: {
    worms: 110,         // ほら穴（くねくねトンネル）の本数
    caves: 90,          // 空洞（丸い部屋）の数
    yaki: 170,          // 焼き豆腐（かたい層。2 回掘らないと消えない）のかたまりの数
    itemClusters: 40000 // アイテムの埋まった「具」（2×2×2）の数
  },

  /* ちくわ君 */
  player: {
    hp: 100,
    speed: 4.6,         // 歩く速さ（マス／秒）
    jump: 7.5,
    gravity: 22,
    w: 0.7, h: 0.95     // 地形とぶつかる大きさ
  },
  /* 攻撃が当たる大きさ（見た目に合わせた縦の円柱。足もとから高さ h、半径 rad） */
  hit: {
    player: { h: 1.05, rad: 0.45 },   // ちくわ君（見た目は高さ 1.0・幅 0.83）
    boss: { h: 1.65, rad: 0.62 }      // ボス（見た目は高さ 1.6・幅 1.2）
  },

  /* 掘る */
  dig: {
    aimRadius: 1.5,     // 「掘る」ボタン：ねらった所をこの半径で掘る
    aimReach: 3.4,      // ねらいが届く距離
    aimCooldown: 0.2,
    moveRadius: 1.35,   // 歩いて壁にぶつかったときに自動で掘る半径
    moveCooldown: 0.16
  },

  /* 素手（初期装備） */
  punch: { dmg: 4, reach: 1.9, cooldown: 0.45 },

  /* アイテム。count＝1 個拾ったときの数（弾数・設置数） */
  items: {
    dashi:     { name: '出汁ピストル',   short: '出汁',     col: '#E9A55B', count: 15, dmg: 5, speed: 28, cooldown: 0.28 },
    karashi:   { name: 'からし地雷',     short: 'からし',   col: '#E8C82E', count: 2, dmg: 10, arm: 1.2, radius: 0.9, knock: 13, up: 8 },
    daikon:    { name: '大根',           short: '大根',     col: '#F4F1E8', count: 4, direct: 10, splash: 5, splashR: 3, speed: 18, cooldown: 0.8 },
    otama:     { name: 'おたまレーザー', short: 'おたま',   col: '#9FC4E6', energy: 4, dmg: 5, tick: 0.3, range: 24, carveR: 1.0 },
    ajitama:   { name: '味玉',           short: '味玉',     col: '#C98A4B', count: 1, heal: 20 },
    shirataki: { name: 'しらたき',       short: 'しらたき', col: '#E4E4E4', count: 2, arm: 1.2, radius: 0.9, time: 1.5, slide: 8 },
    gobou:     { name: 'ごぼうバット',   short: 'ごぼう',   col: '#8A5A35', count: 1, dmg: 25, reach: 2.0, arc: 90, swing: 0.4, knock: 4 },
    miso:      { name: 'お味噌',         short: '味噌',     col: '#A0662E', count: 1, time: 10, absorb: 20 },
    bigtama:   { name: 'ビッグ味玉',     short: 'ﾋﾞｯｸﾞ玉',  col: '#E07B2E', count: 1, heal: 50, invincible: 0.5 }
  },
  /* 「具」を掘ったときに出るアイテムの出やすさ */
  itemWeights: { dashi: 16, karashi: 12, daikon: 8, otama: 6, ajitama: 16, shirataki: 12, gobou: 10, miso: 10, bigtama: 4 },
  pickupRadius: 1.3,

  /* レーダー：敵がこの距離より近いと光る。近いほど激しく光る */
  radar: { range: 50 },

  /* ひとりプレイ */
  solo: {
    time: 300,          // 制限時間（秒）
    bosses: ['boss1', 'boss2', 'boss3', 'boss4', 'boss5'],
    spawnMin: 35, spawnMax: 60
  },
  /* モーションセンサーで見回す。gain＝回した角度に対する視点の角度の倍率、dead＝手ぶれとして無視する速さ（度/秒）
     （2026-10-27 iPhone のキャリブレーション：じっと持ったときのゆれは最大 6 度/秒くらい、3 秒で 2 度ほど流れる） */
  gyro: { gain: 1.0, dead: 3 },

  /* 敵（まわせ！ちくわルーレットのボス）。speed＝追いかける速さ、wander＝気づく前の速さ、notice＝気づく距離
     seek＝気づく前にちくわ君へ寄ってくる度合い（1＝まっすぐ寄ってくる、0＝寄ってこない。こちらから探す）
     弱い順：きんちゃく姫 → 大根大将 → がんも番長 → マグマすじ将軍 → おでん大王。弱いほど寄ってくる */
  bosses: {
    boss1: { name: '大根大将',       shape: 'daikon', col: '#F4F1E8', hp: 60,  speed: 2.4, wander: 1.2, dmg: 7,  atk: 1.2, notice: 40,  seek: 0.8 },
    boss2: { name: 'がんも番長',     shape: 'ball',   col: '#B07038', hp: 70,  speed: 2.2, wander: 0.9, dmg: 8,  atk: 1.3, notice: 26,  seek: 0.5 },
    boss3: { name: 'きんちゃく姫',   shape: 'bag',    col: '#F08AB0', hp: 50,  speed: 2.9, wander: 1.4, dmg: 6,  atk: 1.0, notice: 999, seek: 1 },
    boss4: { name: 'マグマすじ将軍', shape: 'skewer', col: '#B8402A', hp: 60,  speed: 2.5, wander: 0.7, dmg: 10, atk: 1.4, notice: 14,  seek: 0.2 },
    boss5: { name: 'おでん大王',     shape: 'pot',    col: '#5A5560', hp: 100, speed: 1.9, wander: 0.5, dmg: 12, atk: 1.6, notice: 7,   seek: 0 }
  },
  bossReach: 1.7,
  bossDigRadius: 1.5,

  /* みんなで */
  multi: {
    max: 8,             // 1 部屋の人数（worker/index.js の WS_GAMES と同じ数）
    spawnRing: 45,      // スポーンの円の半径
    rate: 15,           // 位置を送る回数（毎秒）
    rejoinWait: 10      // 親が抜けたあと、ほかの人が戻ってくるのを待つ秒数（戻らなければ負け）
  },

  /* ほりほりタイム：始まってからこの秒数は、掘ってアイテムを集める時間。
     攻撃（素手でなぐる・攻撃アイテム）と罠（からし地雷・しらたき）は使えない。敵も襲ってこない。
     奈落に落ちたら豆腐の天井へ戻る（アイテムは最後に取ったものだけ残る） */
  digTime: 60,
  digBlocked: ['dashi', 'daikon', 'otama', 'gobou', 'karashi', 'shirataki'],

  /* ちくわ君の色。最初はノーマル・青・赤・紫（入った順）。自分で変えられる */
  colors: [
    { key: 'normal', name: 'ノーマル', burnt: '#B8692A', body: '#F3DDB2' },
    { key: 'blue',   name: '青',       burnt: '#3E6FD1', body: '#DCE8FA' },
    { key: 'red',    name: '赤',       burnt: '#D2443A', body: '#FADCD8' },
    { key: 'purple', name: '紫',       burnt: '#8150C7', body: '#EADCF8' },
    { key: 'green',  name: '緑',       burnt: '#3E9E58', body: '#DDF2E1' },
    { key: 'pink',   name: 'ピンク',   burnt: '#E46AA6', body: '#FBE0EE' },
    { key: 'black',  name: '黒',       burnt: '#3A3230', body: '#D8D2CC' },
    { key: 'gold',   name: '金',       burnt: '#D49A16', body: '#FFF1C2' }
  ]
};

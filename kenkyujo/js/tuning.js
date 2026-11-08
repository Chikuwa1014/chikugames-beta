/* サイレント夜（仮） — 調整用の数値（バランスはここだけを直す）
   長さの単位はメートル。マップの 1 マスは T.cell メートル。 */
const SY = window.SY = window.SY || {};

SY.VERSION = 'β0.3.0';
SY.GAME = 'kenkyujo';

SY.T = {
  cell: 2,            // マップの 1 マス（m）
  wallH: 3,           // 天井の高さ（m）
  eye: 1.6,           // 目の高さ（m）
  radius: 0.3,        // 体の太さ（当たり判定の半径）
  lookPC: 0.0025,     // マウスで見回す速さ
  lookTouch: 0.006,   // 指で見回す速さ
  reach: 2.2,         // 「調べる」が届く距離（m）
  aimAngle: 0.38,     // 画面の真ん中からこの角度（ラジアン）までの物は調べられる
  fog: 0.12,          // 霧の濃さ（大きいほど先が見えない）
  flash: { intensity: 2.4, range: 16, angle: 0.84 },  // 懐中電灯（angle はラジアン。光の円の広さ）
  stepEvery: 0.48,    // 足音の間かく（秒。歩く速さ 1 のとき）
  run: 1.7,           // 走る速さ（歩く速さの何倍か）
  runStep: 1.5,       // 走るときの足音の速さ（倍）
  mountReach: 0.9,    // 乗れる距離（物の端から体の中心まで。m）
  mountAngle: 1.0     // 乗れる向き（正面からこの角度（ラジアン）まで）
};

/* プレイする人。中身（能力のちがい・話の分かれ方）はこれから足す */
SY.CHARS = [
  { key: 'gatasu', name: 'がたす', sub: '基本のモード' },
  { key: 'chinko', name: '雲紅亭珍光', sub: 'もうひとつのモード' }
];

/* 基本の能力。装備で足し引きする（ステップ1では移動速度だけ使う） */
SY.BASE = { speed: 2.2, hp: 100, def: 0, lives: 3 };

/* 装備。slot は shoes（靴）・clothes（服）・acc（アクセサリー）・charm（お守り）。
   add の値を BASE に足す。speed は倍率（mul）で持つ。はじめは全部ノーマル */
SY.EQUIP = {
  shoes:   [{ key: 'normal', name: 'いつもの靴', add: {} }],
  clothes: [{ key: 'normal', name: 'キャンプの服', add: {} }],
  acc:     [{ key: 'none', name: 'なし', add: {} }],
  charm:   [{ key: 'none', name: 'なし', add: {} }]
};

/* 装備から能力を計算する（装備を増やしたら、ここは触らずに SY.EQUIP に足すだけ） */
SY.stats = function (eq) {
  const s = Object.assign({}, SY.BASE);
  let mul = 1;
  for (const slot in SY.EQUIP) {
    const it = SY.EQUIP[slot].find(x => x.key === (eq && eq[slot])) || SY.EQUIP[slot][0];
    for (const k in it.add) {
      if (k === 'speedMul') mul *= it.add[k];
      else s[k] = (s[k] || 0) + it.add[k];
    }
  }
  s.speed *= mul;
  return s;
};

/* うごかせ！ちくわくん — ボクセルの描画（ななめ上から見た図。外部ライブラリは使わない）
   1 マス＝ボクセル 8×8。モデルは「前＝+x」で作り、向き 4 つぶんを canvas に描いてためておく */
(function () {
  const UC = window.UC;

  UC.TW = 32; UC.TH = 16;           // 1 マスの菱形（幅・高さ）
  const VW = 2, VT = 1, VZ = 2.5;   // ボクセル 1 つの横・奥・高さ（px）

  /* 視点の回転（90° ずつ。rot 0〜3）。W・H はいま描いている拠点の大きさ。
     世界の座標 (x, y) → 回した座標 (u, v) にしてから、ななめ上から見た図にする */
  UC.view = { rot: 0, W: 1, H: 1 };
  UC.rp = (x, y) => { const { rot, W, H } = UC.view; return rot === 0 ? [x, y] : rot === 1 ? [H - y, x] : rot === 2 ? [W - x, H - y] : [y, W - x]; };
  /* マス (x, y) を回したときの、マスの位置（回した座標で、そのマスのいちばん奥の角） */
  UC.rt = (x, y) => { const { rot, W, H } = UC.view; return rot === 0 ? [x, y] : rot === 1 ? [H - 1 - y, x] : rot === 2 ? [W - 1 - x, H - 1 - y] : [y, W - 1 - x]; };
  UC.unrt = (u, v) => { const { rot, W, H } = UC.view; return rot === 0 ? [u, v] : rot === 1 ? [v, H - 1 - u] : rot === 2 ? [W - 1 - u, H - 1 - v] : [W - 1 - v, u]; };
  UC.iso0 = (u, v) => [(u - v) * UC.TW / 2, (u + v) * UC.TH / 2];
  /* 世界の点 (x, y)（画面の座標） */
  UC.iso = (x, y) => UC.iso0(...UC.rp(x, y));

  const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const shade = (c, k) => 'rgb(' + c.map(v => Math.max(0, Math.min(255, Math.round(v * k)))).join(',') + ')';
  UC.hex = hex;

  /* f(i, j, k) → '#rrggbb' か null。sx×sy×sz のボクセルを、向き dir で描いた canvas を返す */
  function render(sx, sy, sz, f, dir) {
    const vox = [];
    // 向きに合わせて、世界のボクセル (x, y) → モデルの (i, j)
    const wx = dir % 2 ? sy : sx, wy = dir % 2 ? sx : sy;
    const loc = (x, y) => dir === 0 ? [x, y] : dir === 1 ? [y, sy - 1 - x] : dir === 2 ? [sx - 1 - x, sy - 1 - y] : [sx - 1 - y, x];
    const grid = new Map();
    for (let x = 0; x < wx; x++) for (let y = 0; y < wy; y++) {
      const [i, j] = loc(x, y);
      for (let k = 0; k < sz; k++) {
        const c = f(i, j, k);
        if (c) { vox.push([x, y, k, c]); grid.set(x + ',' + y + ',' + k, 1); }
      }
    }
    const has = (x, y, k) => grid.has(x + ',' + y + ',' + k);
    const ox = wy * VW, oy = sz * VZ + 1;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((wx + wy) * VW) + 2; cv.height = Math.ceil((wx + wy) * VT + sz * VZ) + 2;
    const c = cv.getContext('2d');
    const P = (x, y, z) => [ox + (x - y) * VW, oy + (x + y) * VT - z * VZ];
    const quad = (pts, col) => {
      c.fillStyle = col; c.strokeStyle = col; c.lineWidth = 0.6; c.beginPath();
      pts.forEach((p, n) => n ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
      c.closePath(); c.fill(); c.stroke();
    };
    vox.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]) || a[2] - b[2]);
    for (const [x, y, z, col] of vox) {
      const rgb = hex(col);
      if (!has(x, y, z + 1)) quad([P(x, y, z + 1), P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)], shade(rgb, 1.0));
      if (!has(x + 1, y, z)) quad([P(x + 1, y, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x + 1, y, z + 1)], shade(rgb, 0.8));
      if (!has(x, y + 1, z)) quad([P(x, y + 1, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)], shade(rgb, 0.64));
    }
    return { cv, ox, oy };
  }

  const cache = {};
  /* モデルの canvas（向きごとにためる） */
  UC.sprite = function (name, dir = 0) {
    const key = name + ':' + dir;
    if (cache[key]) return cache[key];
    const m = MODELS[name];
    return (cache[key] = render(m[0], m[1], m[2], m[3], dir));
  };
  /* マス (tx, ty) の上にモデルを置いて描く。dx, dy はボクセル単位のずらし、lift は高さ（px） */
  UC.drawModel = function (c, name, dir, tx, ty, dx = 0, dy = 0, lift = 0) {
    const m = MODELS[name], x0 = tx + dx / 8, y0 = ty + dy / 8;
    // 世界での大きさ（マス単位）→ 回した座標で、いちばん奥の角
    const fw = (dir % 2 ? m[1] : m[0]) / 8, fh = (dir % 2 ? m[0] : m[1]) / 8;
    const a = UC.rp(x0, y0), b = UC.rp(x0 + fw, y0 + fh);
    const s = UC.sprite(name, (dir + UC.view.rot) % 4);
    const [x, y] = UC.iso0(Math.min(a[0], b[0]), Math.min(a[1], b[1]));
    c.drawImage(s.cv, Math.round(x - s.ox), Math.round(y - s.oy - lift));
  };
  /* 絵のうえのタップ判定用：マス (tx, ty) に置いたモデルの、画面での四角 */
  UC.spriteBox = function (name, dir, tx, ty) {
    const s = UC.sprite(name, (dir + UC.view.rot) % 4), [x, y] = UC.iso0(...UC.rt(tx, ty));
    return [x - s.ox, y - s.oy, s.cv.width, s.cv.height];
  };

  /* ---------- モデル（i：前うしろ、+x が前／j：左右／k：上） ---------- */
  const cyl = (i, j, cx, cy) => Math.hypot(i + 0.5 - cx, j + 0.5 - cy);
  const h3 = (i, j, k) => { let h = i * 374761393 + j * 668265263 + k * 1274126177; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  const MODELS = {
    /* ちくわ君ロボ：立ったちくわに車輪と腕。前（+x）に顔 */
    /* ちくわ君ロボ：ずんぐりした立ったちくわ。上に穴、大きな目とほっぺ、♥のアンテナ、ちょこんとした足 */
    robot: [8, 8, 13, (i, j, k) => {
      // 角の丸い四角のちくわ（前の面が平らなので、目と口がよく見える）
      const dx = Math.abs(i + 0.5 - 4), dy = Math.abs(j + 0.5 - 4), sq = dx ** 4 + dy ** 4, r = cyl(i, j, 4, 4);
      if (k === 0) return (i >= 3 && i <= 5 && (j === 2 || j === 5)) ? '#5B4636' : null;   // 足
      if (k === 12) return (i === 2 && j >= 3 && j <= 4) ? '#FF6F91' : null;               // アンテナの♥
      if (k === 11) return (i <= 2 && i >= 1 && (j === 3 || j === 4)) ? (i === 2 ? '#FF8FAB' : '#FF6F91') : null;
      if (k === 10) return (i === 2 && j === 4) ? '#9AA4AE' : null;                       // アンテナの棒
      if (sq > 3.55 ** 4) return null;
      if (r < 1.6) return k <= 2 ? '#8A4A1E' : null;                                       // まん中の穴
      if (i === 7) {                                                                     // 顔
        if ((j === 2 || j === 5) && k >= 5 && k <= 7) return k === 7 ? '#FFFFFF' : '#2A1A10';   // 大きな目（上に光）
        if ((j === 1 || j === 6) && k === 4) return '#FF9EAF';                            // ほっぺ
        if ((j === 3 || j === 4) && k === 4) return '#D9595F';                            // 口
        if ((j === 2 || j === 5) && k === 4) return null;
      }
      if (k === 9) return h3(i, j, k) > 0.5 ? '#B5622A' : '#C47234';                      // 上のこげ目
      if (k === 8) return h3(i, j, k) > 0.6 ? '#D88A45' : '#E9A55B';
      if (k === 1) return '#C47234';                                                     // 下のこげ目
      if (k === 2) return '#7FC8F0';                                                     // 腰のベルト（ロボっぽさ）
      return h3(i, j, k) > 0.9 ? '#F0CC93' : '#F8E7C4';
    }],
    /* コンベアの台（矢印は別に描く） */
    belt: [8, 8, 3, (i, j, k) => {
      if (k < 2) return (j === 0 || j === 7) ? '#5C6670' : (k === 0 ? '#3E454D' : (i % 2 ? '#7C8792' : '#6B7580'));
      if (j === 0 || j === 7) return '#F2C230';
      return '#2F343A';
    }],
    /* 梱包台：木の机にダンボール */
    pack: [8, 8, 6, (i, j, k) => {
      if (k <= 3) return ((i === 0 || i === 7) && (j === 0 || j === 7)) ? '#6B4426' : null;
      if (k === 4) return '#A9744A';
      if (k === 5 && i >= 5 && j <= 2) return '#C89A5C';
      return null;
    }],
    /* 製品プール：青い箱（中はからっぽ） */
    pool: [8, 8, 5, (i, j, k) => {
      if (k === 0) return '#2E5E8E';
      if (i === 0 || i === 7 || j === 0 || j === 7) return k === 4 ? '#7FB4E6' : '#3F78B0';
      return null;
    }],
    /* 製造ラインの終点（取り場）：オレンジの機械と出口 */
    src: [8, 8, 10, (i, j, k) => {
      if (i >= 6 && k >= 1 && k <= 4 && j >= 2 && j <= 5) return k === 1 ? '#3A3A44' : null;   // 出口
      if (k === 9) return (i + j) % 2 ? '#2A2A2A' : '#F2C230';
      if (k >= 6 && i === 7 && j >= 2 && j <= 5) return k === 7 ? '#7CE07C' : '#454D55';      // 表示
      return h3(i, j, k) > 0.9 ? '#D3651E' : '#E87A2A';
    }],
    /* 出荷ヤード：パレット */
    yard: [8, 8, 2, (i, j, k) => {
      if (i === 0 || j === 0 || i === 7 || j === 7) return null;
      if (k === 0) return (j % 3 === 1) ? '#8A6236' : null;
      return (i % 2) ? '#B98A52' : '#A87A44';
    }],
    /* れいぞうこ */
    fridge: [8, 8, 13, (i, j, k) => {
      if (i >= 1 && i <= 6 && j >= 1 && j <= 6) {
        if (i === 6 && k === 8 && j >= 2 && j <= 5) return '#A9B4BE';                       // ドアのすきま
        if (i === 6 && (k === 5 || k === 10) && j === 5) return '#5E6A75';                  // 取っ手
        if (i === 6 && k === 11 && j === 2) return '#5EC8F2';                                // ランプ
        return k === 12 ? '#E2E8EE' : '#F4F7FA';
      }
      return null;
    }],
    /* コンピュータ（かんばんを受け取る） */
    pc: [8, 8, 9, (i, j, k) => {
      if (k <= 3) return (i >= 1 && i <= 6 && j >= 0 && j <= 7) ? (k === 3 ? '#8A6A4A' : ((i === 1 || i === 6) && (j === 0 || j === 7) ? '#5A4430' : null)) : null;
      if (i === 3 && j >= 1 && j <= 6 && k >= 4 && k <= 8) return '#2C3036';               // 画面のうら
      if (i === 4 && j >= 2 && j <= 5 && k >= 5 && k <= 7) return '#6FD3A0';               // 画面
      return null;
    }],
    heater: [8, 8, 7, (i, j, k) => {
      if (i < 2 || i > 5 || j < 1 || j > 6) return null;
      if (i === 5 && k >= 2 && k <= 4 && j >= 2 && j <= 5) return (j % 2) ? '#FF8A3D' : '#C9402F';
      return k === 6 ? '#B33A2E' : '#D24A3A';
    }],
    cooler: [8, 8, 9, (i, j, k) => {
      if (i < 2 || i > 5 || j < 2 || j > 5) return null;
      if (i === 5 && k >= 5 && k <= 7) return (k % 2) ? '#5E6A75' : '#CFE6F5';
      return k === 8 ? '#9BC9E8' : '#E8F3FA';
    }],
    vend: [8, 8, 12, (i, j, k) => {
      if (i < 2 || i > 6 || j < 1 || j > 6) return null;
      if (i === 6 && k >= 6 && k <= 10 && j >= 2 && j <= 5) return (k % 2) ? '#F2E6A0' : '#7FD0F0';  // 見本
      if (i === 6 && k === 2 && j >= 2 && j <= 5) return '#333';                                     // 取り出し口
      return '#E04848';
    }],
    vent: [8, 8, 11, (i, j, k) => {
      if (i === 0 || j === 0 || i === 7 || j === 7) {
        if (i === 7 && j >= 2 && j <= 5 && k <= 7) return null;                             // 入口
        if (k === 9 && (i === 0) && j >= 2 && j <= 5) return '#3A3A3A';                     // 換気扇
        return k === 10 ? '#8C9AA6' : '#B8C4CE';
      }
      if (k === 10) return '#8C9AA6';
      return k === 0 ? '#7A8790' : null;
    }],
    /* 製品（ちいさい。マスのまん中に置く） */
    p_neji: [4, 4, 4, (i, j, k) => (k === 3 ? (i >= 0 && j >= 0 ? '#C9D1D8' : null) : (i >= 1 && i <= 2 && j >= 1 && j <= 2 ? (k % 2 ? '#8A949C' : '#A9B2BA') : null))],
    p_bane: [4, 4, 4, (i, j, k) => ((i === 0 || i === 3 || j === 0 || j === 3) && !((i === 0 || i === 3) && (j === 0 || j === 3)) ? ((k % 2) ? '#5BA35E' : '#3E7A41') : null)],
    p_hane: [4, 4, 3, (i, j, k) => (k === 1 ? ((i === j || i + j === 3) ? '#F2C230' : null) : (k === 0 && i >= 1 && i <= 2 && j >= 1 && j <= 2 ? '#8A6A2A' : null))],
    p_suna: [4, 4, 4, (i, j, k) => (i >= 1 && i <= 2 && j >= 1 && j <= 2 ? (k === 3 ? '#C98A6A' : (k <= 1 ? '#F2D9A6' : '#CFE9F5')) : null)],
    p_sakana: [4, 4, 2, (i, j, k) => {
      if (k === 1 && j >= 1 && j <= 2 && i <= 2) return '#6FA8DC';
      if (k === 0 && j >= 1 && j <= 2) return i === 3 ? '#3D78B5' : '#4F8DC9';
      return null;
    }],
    p_box: [4, 4, 4, (i, j, k) => (k === 3 && (j === 1 || j === 2) ? '#D9B27A' : '#B98A52')],
  };

  /* 製品のモデル名 */
  UC.productModel = p => p.packed ? 'p_box' : 'p_' + UC.PRODUCTS[p.t].id;

  /* ---------- 床と壁（絵として 1 枚に描いておく） ---------- */
  UC.paintFloor = function (base) {
    // 回した向きで描く（奥の 2 面が壁）。床のしみは世界のマスで決める
    const rot = UC.view.rot, W = rot % 2 ? base.h : base.w, H = rot % 2 ? base.w : base.h, TW = UC.TW, TH = UC.TH;
    const wallH = 70;
    const cv = document.createElement('canvas');
    const ox = H * TW / 2 + 4, oy = wallH + 4;
    cv.width = (W + H) * TW / 2 + 8; cv.height = (W + H) * TH / 2 + wallH + 12;
    const c = cv.getContext('2d');
    const P = (x, y) => [ox + (x - y) * TW / 2, oy + (x + y) * TH / 2];
    const poly = (pts, fill) => { c.fillStyle = fill; c.beginPath(); pts.forEach((p, n) => n ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fill(); };
    // 奥の壁（北と西）：くすんだ緑の工場の壁に窓
    poly([P(0, 0), P(W, 0), [P(W, 0)[0], P(W, 0)[1] - wallH], [P(0, 0)[0], P(0, 0)[1] - wallH]], '#5F7F74');
    poly([P(0, 0), P(0, H), [P(0, H)[0], P(0, H)[1] - wallH], [P(0, 0)[0], P(0, 0)[1] - wallH]], '#4E6B61');
    for (let x = 1; x < W; x += 3) {           // 北の壁の窓
      const a = P(x, 0), b = P(x + 1.6, 0);
      poly([[a[0], a[1] - 50], [b[0], b[1] - 50], [b[0], b[1] - 30], [a[0], a[1] - 30]], '#BFE3F0');
      poly([[a[0], a[1] - 50], [b[0], b[1] - 50], [b[0], b[1] - 46], [a[0], a[1] - 46]], '#E8F6FB');
    }
    for (let y = 1; y < H; y += 3) {           // 西の壁の窓
      const a = P(0, y), b = P(0, y + 1.6);
      poly([[a[0], a[1] - 50], [b[0], b[1] - 50], [b[0], b[1] - 30], [a[0], a[1] - 30]], '#A9D2E2');
    }
    // 壁の下の黄色と黒のしま
    for (let x = 0; x < W; x++) { const a = P(x, 0), b = P(x + 1, 0); poly([[a[0], a[1] - 6], [b[0], b[1] - 6], b, a], x % 2 ? '#2A2A2A' : '#F2C230'); }
    for (let y = 0; y < H; y++) { const a = P(0, y), b = P(0, y + 1); poly([[a[0], a[1] - 6], [b[0], b[1] - 6], b, a], y % 2 ? '#2A2A2A' : '#F2C230'); }
    // 床（コンクリート。ところどころしみ）
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
      const [wx, wy] = UC.unrt(x, y), n = h3(wx, wy, 3);
      poly([P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)], n > 0.85 ? '#A7ABA8' : n > 0.5 ? '#B4B8B4' : '#BBBFBA');
    }
    c.strokeStyle = 'rgba(80,90,85,0.25)'; c.lineWidth = 1;
    for (let x = 0; x <= W; x++) { c.beginPath(); c.moveTo(...P(x, 0)); c.lineTo(...P(x, H)); c.stroke(); }
    for (let y = 0; y <= H; y++) { c.beginPath(); c.moveTo(...P(0, y)); c.lineTo(...P(W, y)); c.stroke(); }
    // 手前のふち（床の厚み）
    poly([P(0, H), P(W, H), [P(W, H)[0], P(W, H)[1] + 6], [P(0, H)[0], P(0, H)[1] + 6]], '#6E726E');
    poly([P(W, 0), P(W, H), [P(W, H)[0], P(W, H)[1] + 6], [P(W, 0)[0], P(W, 0)[1] + 6]], '#858985');
    return { cv, ox, oy };
  };

  /* 出荷ヤードの床の印（黄色のななめ線） */
  UC.drawYardMark = function (c, x, y) {
    const P = (a, b) => UC.iso(x + a, y + b);
    c.save(); c.beginPath(); [P(0, 0), P(1, 0), P(1, 1), P(0, 1)].forEach((p, n) => n ? c.lineTo(...p) : c.moveTo(...p)); c.closePath();
    c.fillStyle = 'rgba(242,194,48,0.35)'; c.fill(); c.clip();
    c.strokeStyle = '#E0A800'; c.lineWidth = 2;
    for (let k = -1; k < 2; k += 0.34) { c.beginPath(); c.moveTo(...P(k, 0)); c.lineTo(...P(k + 1, 1)); c.stroke(); }
    c.restore();
  };

  /* コンベアの矢印（向きと出口を見せる） */
  UC.drawArrow = function (c, x, y, from, to, col, t) {
    const cx = x + 0.5, cy = y + 0.5, z = 7.5;
    const pt = (d, r) => { const [sx, sy] = UC.iso(cx + UC.DX[d] * r, cy + UC.DY[d] * r); return [sx, sy - z]; };
    const [mx, my] = UC.iso(cx, cy);
    c.strokeStyle = col; c.lineWidth = 2; c.lineCap = 'round';
    c.beginPath();
    if (from != null) { c.moveTo(...pt(from, 0.4)); c.lineTo(mx, my - z); } else c.moveTo(...pt((to + 2) % 4, 0.35));
    c.lineTo(...pt(to, 0.38)); c.stroke();
    // 矢じり
    const tip = pt(to, 0.46), back = pt(to, 0.2), vx = tip[0] - back[0], vy = tip[1] - back[1];
    c.fillStyle = col; c.beginPath(); c.moveTo(...tip);
    c.lineTo(back[0] - vy * 0.7, back[1] + vx * 0.7); c.lineTo(back[0] + vy * 0.7, back[1] - vx * 0.7); c.closePath(); c.fill();
    // 流れの点（動いて見える）
    if (t != null) {
      const k = (t % 1);
      const a = from != null ? pt(from, 0.4 * (1 - k)) : pt((to + 2) % 4, 0.35 * (1 - k * 2));
      c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(a[0] - 1, a[1] - 1, 2, 2);
    }
  };

  /* 恋ン（床に落ちている。金色で♥） */
  UC.drawCoin = function (c, x, y, t) {
    const [sx, sy] = UC.iso(x + 0.5, y + 0.5);
    const b = Math.sin(t * 4 + x * 1.3 + y) * 1.5, w = Math.abs(Math.cos(t * 2 + x)) * 5 + 1.5;
    c.fillStyle = '#B8860B'; c.beginPath(); c.ellipse(sx, sy - 8 + b, w + 1, 7, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#F7C948'; c.beginPath(); c.ellipse(sx, sy - 8 + b, w, 6, 0, 0, Math.PI * 2); c.fill();
    if (w > 3) { c.fillStyle = '#F06292'; c.font = 'bold 8px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('♥', sx, sy - 8 + b); }
  };
})();

/* ほりほりもぐもぐ — キャラ・アイテムのモデル（小さなマスの集まり）。前は +z */
(function () {
  const HM = window.HM, T = HM.T;
  const C = HM.hex;
  const blk = [0.12, 0.08, 0.06], white = [1, 1, 1], gold = C('#F2B23A');
  const cache = {};
  const once = (k, f) => cache[k] || (cache[k] = f());

  /* ---------- ちくわ君（立ったちくわ。大きさ 1） ---------- */
  HM.chikuwaModel = function (colorKey) {
    return once('chikuwa:' + colorKey, () => {
      const col = T.colors.find(c => c.key === colorKey) || T.colors[0];
      const burnt = C(col.burnt), body = C(col.body), dark = burnt.map(v => v * 0.7);
      return HM.voxModel(10, 12, 10, 1.0, (i, j, k) => {
        const dx = i + 0.5 - 5, dz = k + 0.5 - 5, r = Math.hypot(dx, dz);
        if (r > 4.9) return null;
        if (r < 1.9 && j >= 1) return null;                         // まん中の穴
        // 顔（前 = +z）
        if (k >= 8 && j === 8 && (i === 3 || i === 6)) return [...white, 0];
        if (k >= 8 && j === 7 && (i === 3 || i === 6)) return [...blk, 0];
        if (k >= 8 && j === 5 && i >= 4 && i <= 5) return [...blk, 0];
        if (k >= 8 && j === 6 && (i === 2 || i === 7)) return [1, 0.6, 0.6, 0];  // ほっぺ
        // こげ目のしま（上と下、それと横すじ）
        const h = HM.hash3(i, j, k, 7);
        if (j === 11 || j === 0) return [...body, 0];
        if (j >= 9 || j <= 2) return [...(h > 0.75 ? dark : burnt), 0];
        if ((j === 4 || j === 6) && r > 4 && h > 0.35) return [...burnt, 0];
        return [...body, 0];
      });
    });
  };

  /* ---------- 敵（まわせ！ちくわルーレットのボス。高さ 1.6） ---------- */
  function face(i, j, k, nx, ny, nz, eyeJ) {
    // 前面にこわい顔（白目・黒目・まゆ）
    const front = k >= nz - 2;
    if (!front) return null;
    const c = nx / 2;
    if (j === eyeJ && (i === Math.floor(c) - 3 || i === Math.floor(c) + 2)) return [...white, 0];
    if (j === eyeJ && (i === Math.floor(c) - 2 || i === Math.floor(c) + 1)) return [...blk, 0];
    if (j === eyeJ + 2 && (i === Math.floor(c) - 3 || i === Math.floor(c) + 2)) return [...blk, 0];
    if (j === eyeJ + 1 && (i === Math.floor(c) - 2 || i === Math.floor(c) + 1)) return [...blk, 0];
    if (j === eyeJ - 3 && i >= Math.floor(c) - 2 && i <= Math.floor(c) + 1) return [0.5, 0.1, 0.1, 0];
    return null;
  }
  function crown(i, j, k, nx, top) {
    const c = nx / 2;
    if (j === top && Math.abs(i + 0.5 - c) < 3 && Math.abs(k + 0.5 - c) < 3) return [...gold, 0.3];
    if (j === top + 1 && (Math.abs(i + 0.5 - c) < 0.6 || Math.abs(i + 0.5 - c) > 2) && Math.abs(k + 0.5 - c) < 1) return [...gold, 0.3];
    return null;
  }
  HM.bossModel = function (key) {
    return once('boss:' + key, () => {
      const B = T.bosses[key], col = C(B.col), dk = col.map(v => v * 0.75);
      const nx = 12, ny = 16, nz = 12;
      return HM.voxModel(nx, ny, nz, 1.6, (i, j, k) => {
        const dx = i + 0.5 - nx / 2, dz = k + 0.5 - nz / 2, r = Math.hypot(dx, dz);
        let base = null, eyeJ = 8, top = 14;
        switch (B.shape) {
          case 'daikon': {
            const rad = j < 3 ? 2 + j : 5.2;
            if (j <= 11 && r < rad) base = [...col, 0];
            if (j >= 12 && j <= 13 && r < 3 && ((i + k + j) % 2 === 0 || r < 1.5)) base = [0.3, 0.7, 0.3, 0];
            if (j >= 9 && j <= 11 && r < rad) base = [0.75, 0.9, 0.6, 0];
            eyeJ = 6; top = 14;
            break;
          }
          case 'ball': {
            const d = Math.hypot(dx, j + 0.5 - 6.5, dz);
            if (d < 6) base = [...(HM.hash3(i, j, k, 3) > 0.8 ? dk : col), 0];
            eyeJ = 7; top = 12;
            break;
          }
          case 'bag': {
            const d = Math.hypot(dx, (j + 0.5 - 5) * 1.1, dz);
            if (d < 5.6 && j < 9) base = [...col, 0];
            if (j === 9 && r < 2.2) base = [0.6, 0.25, 0.3, 0];
            if (j >= 10 && j <= 11 && r < 3.2 && r > 1) base = [...col, 0];
            eyeJ = 5; top = 12;
            break;
          }
          case 'skewer': {
            if (r < 0.8) base = [0.85, 0.7, 0.45, 0];                // 串
            for (const [a, b] of [[1, 4], [5, 8], [9, 12]]) if (j >= a && j <= b && Math.abs(dx) < 4.5 && Math.abs(dz) < 2.5) base = [...(j === b ? dk : col), 0];
            eyeJ = 7; top = 14;
            if (base && Math.abs(dz) < 2.5 && k >= 7 && j >= 5 && j <= 8) { const f = face(i, j, k, nx, ny, 9, eyeJ); if (f) return f; }
            break;
          }
          case 'pot': {
            if (j <= 8 && r < 5.6) base = [...col, 0];
            if (j === 8 && r < 6) base = [...dk, 0];
            if (j === 9 && r < 4.5) base = [...dk, 0];
            if (j === 10 && r < 1.2) base = [...dk, 0];
            if (j >= 5 && j <= 6 && Math.abs(dz) < 1 && Math.abs(dx) > 5 && Math.abs(dx) < 6.5) base = [...dk, 0];
            eyeJ = 5; top = 11;
            break;
          }
        }
        const cr = crown(i, j, k, nx, top);
        if (cr) return cr;
        if (!base) return null;
        if (B.shape !== 'skewer') {
          // 表面（前）だけに顔を描く
          const f = face(i, j, k, nx, ny, nz, eyeJ);
          if (f && r > 3) return f;
        }
        return base;
      });
    });
  };

  /* ---------- アイテム（落ちているもの。高さ 0.6） ---------- */
  HM.itemModel = function (type) {
    return once('item:' + type, () => {
      const I = T.items[type], col = C(I.col), e = 0.35;
      const g = 8;
      return HM.voxModel(g, g, g, 0.6, (i, j, k) => {
        const dx = i + 0.5 - 4, dy = j + 0.5 - 4, dz = k + 0.5 - 4;
        switch (type) {
          case 'dashi':   // ピストル（L 字）
            if (j >= 4 && j <= 5 && k >= 1 && k <= 6 && i >= 3 && i <= 4) return [...col, e];
            if (j >= 1 && j <= 3 && k >= 1 && k <= 2 && i >= 3 && i <= 4) return [0.45, 0.3, 0.2, e];
            return null;
          case 'karashi': // からしの円盤
            if (Math.hypot(dx, dz) < 3.5 && j >= 2 && j <= 3) return [...col, e];
            return null;
          case 'daikon':
            if (Math.hypot(dx, dz) < 2.2 && j <= 6) return [...(j >= 5 ? [0.4, 0.8, 0.4] : col), e];
            return null;
          case 'otama':   // おたま
            if (Math.hypot(dx, dz - 1.5) < 2.4 && j >= 1 && j <= 2) return [...col, e];
            if (i >= 3 && i <= 4 && k <= 1 && j >= 2 && j <= 6) return [...col, e];
            return null;
          case 'ajitama': case 'bigtama': {
            const s = type === 'bigtama' ? 1 : 0.8;
            const d = Math.hypot(dx / s, dy / (s * 1.2), dz / s);
            if (d < 3.6) return d < 1.6 ? [0.95, 0.6, 0.1, e] : [...col, e];
            return null;
          }
          case 'shirataki':
            if (((i + j) % 3 === 0 || (j + k) % 3 === 0) && Math.hypot(dx, dy, dz) < 3.6) return [...col, e];
            return null;
          case 'gobou':
            if (i >= 3 && i <= 4 && k >= 3 && k <= 4) return [...col, e];
            return null;
          case 'miso': {
            const d = Math.hypot(dx, dy * 1.4, dz);
            if (d < 3.6 && j <= 5) return [...col, e];
            return null;
          }
        }
        return null;
      });
    });
  };

  /* ---------- 置いたもの・飛んでいくもの ---------- */
  HM.mineModel = () => once('mine', () => HM.voxModel(6, 2, 6, 0.12, (i, j, k) => Math.hypot(i + 0.5 - 3, k + 0.5 - 3) < 2.8 ? [...C('#E8C82E'), 0.5] : null));
  HM.shiraModel = () => once('shira', () => HM.voxModel(6, 2, 6, 0.1, (i, j, k) => ((i + k) % 2 === 0 && Math.hypot(i + 0.5 - 3, k + 0.5 - 3) < 3) ? [0.95, 0.95, 0.92, 0.4] : null));
  HM.dashiShot = () => once('dashiShot', () => HM.voxModel(2, 2, 2, 0.22, () => [...C('#E9A55B'), 0.9]));
  HM.daikonShot = () => once('daikonShot', () => HM.voxModel(6, 2, 6, 0.18, (i, j, k) => Math.hypot(i + 0.5 - 3, k + 0.5 - 3) < 2.9 ? [0.97, 0.95, 0.88, 0.5] : null));
  HM.crumb = () => once('crumb', () => HM.voxModel(1, 1, 1, 0.14, () => [0.97, 0.94, 0.86, 0]));
  HM.unitBox = col => once('box:' + col, () => HM.boxModel(C(col), 0.95));
  HM.misoAura = () => once('miso', () => HM.voxModel(12, 12, 12, 1.25, (i, j, k) => {
    const d = Math.hypot(i + 0.5 - 6, j + 0.5 - 6, k + 0.5 - 6);
    return d < 6 && d > 5 && HM.hash3(i, j, k, 9) > 0.45 ? [0.63, 0.4, 0.18, 0.2] : null;
  }));

  /** 奈落のおでん鍋（汁の面と、浮かぶ具） */
  HM.potModel = function () {
    return once('pot', () => {
      const out = [], y = T.potY, s = 900, o = -300;
      const b = C('#8A5A22');
      // 大きな四角（上向き）
      const p = [[o, y, o + s], [o + s, y, o + s], [o + s, y, o], [o, y, o]];
      for (const i of [0, 1, 2, 0, 2, 3]) out.push(p[i][0], p[i][1], p[i][2], b[0], b[1], b[2], 0.55);
      // 浮かぶ具（大きなマス）
      const r = HM.rng(99);
      for (let n = 0; n < 60; n++) {
        const x = -100 + r() * 500, z = -100 + r() * 500, w = 6 + r() * 10;
        const cols = ['#F4F1E8', '#C98A4B', '#8D8E96', '#FFF4D6', '#D98C3A'];
        const c = C(cols[n % cols.length]);
        for (let d = 0; d < 6; d++) HM.pushFace(out, x, y - w * 0.6, z, w, d, c[0], c[1], c[2], 0.35, null);
      }
      return new Float32Array(out);
    });
  };
})();

/* ほりほりもぐもぐ — フィールド（お豆腐）。マスの中身・地形の生成・掘る・チャンクの描画データ
   マス：0=空気 1=豆腐 2=焼き豆腐（かたい。掘ると豆腐になる） 3=具（アイテム入り。2×2×2 で 1 つ） */
(function () {
  const HM = window.HM, T = HM.T;
  // フィールドの大きさは試合ごとに変わる（スモール・メディアム・ラージ）。同時に作る World は 1 つだけ
  const CS = T.chunk;
  let N = T.field, NC = Math.ceil(N / CS);
  const AIR = 0, TOFU = 1, YAKI = 2, ITEM = 3;
  HM.MAT = { AIR, TOFU, YAKI, ITEM };

  function World(seed, spawns, size) {
    N = size || T.field; NC = Math.ceil(N / CS);
    World.NC = NC;
    this.seed = seed >>> 0;
    this.N = N;
    this.v = new Uint8Array(N * N * N);
    this.dirty = new Set();          // 描き直しが必要なチャンク
    this.spawnedItems = new Set();   // 出てきたアイテム（具のキー）
    this.generate(spawns || []);
  }
  const P = World.prototype;
  P.idx = (x, y, z) => (y * N + z) * N + x;
  P.inside = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < N && y < N && z < N;
  P.get = function (x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N) return AIR;
    return this.v[(y * N + z) * N + x];
  };
  P.solidAt = function (x, y, z) { return this.get(Math.floor(x), Math.floor(y), Math.floor(z)) !== AIR; };

  /* ---------- 地形の生成（シード値が同じなら、だれの端末でも同じ形） ---------- */
  P.generate = function (spawns) {
    const r = HM.rng(this.seed), v = this.v, G0 = T.gen;
    // 小さいフィールドでは、数を体積に合わせて減らし、空洞・ほら穴も小さくする
    const f = Math.pow(N / 300, 3), sc = Math.min(1, N / 120);
    const G = {
      yaki: Math.max(6, Math.round(G0.yaki * f)), itemClusters: Math.max(40, Math.round(G0.itemClusters * f)),
      caves: Math.max(3, Math.round(G0.caves * f)), worms: Math.max(4, Math.round(G0.worms * f))
    };
    v.fill(TOFU);
    const ellip = (cx, cy, cz, rx, ry, rz, m, only) => {
      const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(N - 1, Math.ceil(cx + rx));
      const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(N - 1, Math.ceil(cy + ry));
      const z0 = Math.max(0, Math.floor(cz - rz)), z1 = Math.min(N - 1, Math.ceil(cz + rz));
      for (let y = y0; y <= y1; y++) {
        const dy = (y + 0.5 - cy) / ry;
        for (let z = z0; z <= z1; z++) {
          const dz = (z + 0.5 - cz) / rz, yz = dy * dy + dz * dz;
          if (yz > 1) continue;
          let i = (y * N + z) * N + x0;
          for (let x = x0; x <= x1; x++, i++) {
            const dx = (x + 0.5 - cx) / rx;
            if (dx * dx + yz <= 1 && (only == null || v[i] === only)) v[i] = m;
          }
        }
      }
    };
    // 焼き豆腐（かたい層）
    for (let n = 0; n < G.yaki; n++) {
      ellip(r() * N, r() * N, r() * N, (4 + r() * 9) * sc, (2 + r() * 5) * sc, (4 + r() * 9) * sc, YAKI);
    }
    // 具（アイテム入り）：2×2×2。座標は偶数にそろえる（どのマスからでも具の場所が分かるように）
    for (let n = 0; n < G.itemClusters; n++) {
      const x = (r() * (N - 2)) & ~1, y = (r() * (N - 2)) & ~1, z = (r() * (N - 2)) & ~1;
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) v[((y + b) * N + z + c) * N + x + a] = ITEM;
    }
    // 空洞（丸い部屋）
    for (let n = 0; n < G.caves; n++) {
      const rr = (4 + r() * 8) * Math.max(0.5, sc);
      ellip(r() * N, r() * N, r() * N, rr * (0.8 + r() * 0.6), rr * (0.5 + r() * 0.4), rr * (0.8 + r() * 0.6), AIR);
    }
    // ほら穴（くねくねトンネル）
    for (let n = 0; n < G.worms; n++) {
      let x = r() * N, y = r() * N, z = r() * N;
      let yaw = r() * Math.PI * 2, pit = (r() - 0.5) * 0.6;
      const len = (80 + r() * 160) * Math.min(1, N / 200), rad = 1.4 + r() * 1.6;
      for (let s = 0; s < len; s += 1.5) {
        ellip(x, y, z, rad, rad * 0.85, rad, AIR);
        yaw += (r() - 0.5) * 0.5;
        pit = Math.max(-0.7, Math.min(0.7, pit + (r() - 0.5) * 0.3));
        x += Math.cos(yaw) * Math.cos(pit) * 1.5;
        z += Math.sin(yaw) * Math.cos(pit) * 1.5;
        y += Math.sin(pit) * 1.5;
        if (x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N) break;
      }
    }
    // スタート地点の小部屋
    //（後方視点でカメラが下がれるよう、少し広め）
    for (const s of spawns) ellip(s[0], s[1] + 1.6, s[2], 4.2, 2.8, 4.2, AIR);
    // スタート地点の床は、焼き豆腐でかためておく（いきなり落ちないように）
    for (const s of spawns) ellip(s[0], s[1] - 0.5, s[2], 4.4, 0.9, 4.4, YAKI, TOFU);
    this.dirty.clear();
  };

  /** 具（アイテム）の種類。シード値と場所で決まる（全員同じ） */
  P.itemType = function (key) {
    const [x, y, z] = key.split(',').map(Number);
    const W = T.itemWeights, keys = Object.keys(W);
    let tot = 0; for (const k of keys) tot += W[k];
    let h = HM.hash3(x, y, z, this.seed ^ 0x5bd1e995) * tot;
    for (const k of keys) { if ((h -= W[k]) < 0) return k; }
    return keys[0];
  };

  /* ---------- 掘る ----------
     球の中の豆腐・具を空気に、焼き豆腐を豆腐にする（2 回掘ると消える）。
     何回・どの順で掘っても結果が同じ（マルチで順番が入れかわっても形がそろう）。
     出てきた具のキーの配列を返す */
  P.carve = function (cx, cy, cz, rad) {
    const v = this.v, got = [];
    const x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(N - 1, Math.floor(cx + rad));
    const y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(N - 1, Math.floor(cy + rad));
    const z0 = Math.max(0, Math.floor(cz - rad)), z1 = Math.min(N - 1, Math.floor(cz + rad));
    if (x0 > x1 || y0 > y1 || z0 > z1) return got;
    const r2 = rad * rad;
    let changed = false;
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy;
      for (let z = z0; z <= z1; z++) {
        const dz = z + 0.5 - cz, yz = dy * dy + dz * dz;
        if (yz > r2) continue;
        let i = (y * N + z) * N + x0;
        for (let x = x0; x <= x1; x++, i++) {
          const dx = x + 0.5 - cx;
          if (dx * dx + yz > r2) continue;
          const m = v[i];
          if (m === AIR) continue;
          changed = true;
          if (m === YAKI) { v[i] = TOFU; continue; }
          v[i] = AIR;
          if (m === ITEM) {
            const key = (x & ~1) + ',' + (y & ~1) + ',' + (z & ~1);
            if (!this.spawnedItems.has(key)) { this.spawnedItems.add(key); got.push(key); }
          }
        }
      }
    }
    if (changed) this.markDirty(x0 - 1, y0 - 1, z0 - 1, x1 + 1, y1 + 1, z1 + 1);
    // 具の残りのマスも消す（アイテムは 1 つだけ出る）
    for (const key of got) {
      const [x, y, z] = key.split(',').map(Number);
      let any = false;
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
        const i = ((y + b) * N + z + c) * N + x + a;
        if (v[i] === ITEM) { v[i] = AIR; any = true; }
      }
      if (any) this.markDirty(x - 1, y - 1, z - 1, x + 2, y + 2, z + 2);
    }
    return got;
  };
  P.markDirty = function (x0, y0, z0, x1, y1, z1) {
    const c = v => Math.max(0, Math.min(NC - 1, Math.floor(v / CS)));
    for (let cy = c(y0); cy <= c(y1); cy++) for (let cz = c(z0); cz <= c(z1); cz++) for (let cx = c(x0); cx <= c(x1); cx++) {
      this.dirty.add(cx + cy * NC + cz * NC * NC);
    }
  };

  /** レイ（光線）を飛ばして、最初にあたった固いマスを返す（DDA） */
  P.raycast = function (o, d, maxDist) {
    let x = Math.floor(o[0]), y = Math.floor(o[1]), z = Math.floor(o[2]);
    const sx = d[0] > 0 ? 1 : -1, sy = d[1] > 0 ? 1 : -1, sz = d[2] > 0 ? 1 : -1;
    const tdx = Math.abs(1 / (d[0] || 1e-9)), tdy = Math.abs(1 / (d[1] || 1e-9)), tdz = Math.abs(1 / (d[2] || 1e-9));
    let tx = ((sx > 0 ? x + 1 - o[0] : o[0] - x)) * tdx;
    let ty = ((sy > 0 ? y + 1 - o[1] : o[1] - y)) * tdy;
    let tz = ((sz > 0 ? z + 1 - o[2] : o[2] - z)) * tdz;
    let t = 0;
    while (t <= maxDist) {
      if (this.get(x, y, z) !== AIR) return { t, x, y, z, p: [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t] };
      if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; }
      else if (ty < tz) { y += sy; t = ty; ty += tdy; }
      else { z += sz; t = tz; tz += tdz; }
    }
    return null;
  };

  /* ---------- チャンクの描画データ（面を消した四角の集まり。角を暗くして奥行きを出す） ---------- */
  const AOK = [0.42, 0.62, 0.8, 1];
  // 面ごとの「外側」から見た角のとなり（side1, side2）
  P.meshChunk = function (ci) {
    const cx = ci % NC, cy = Math.floor(ci / NC) % NC, cz = Math.floor(ci / (NC * NC));
    const X0 = cx * CS, Y0 = cy * CS, Z0 = cz * CS;
    const X1 = Math.min(N, X0 + CS), Y1 = Math.min(N, Y0 + CS), Z1 = Math.min(N, Z0 + CS);
    const out = [], v = this.v, seed = this.seed;
    const get = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N) ? 0 : v[(y * N + z) * N + x];
    const F = HM.FACES, D = HM.DIRS;
    const ao = [0, 0, 0, 0];
    for (let y = Y0; y < Y1; y++) for (let z = Z0; z < Z1; z++) {
      let i = (y * N + z) * N + X0;
      for (let x = X0; x < X1; x++, i++) {
        const m = v[i];
        if (m === AIR) continue;
        // まわりが全部うまっていれば、面は出ない（ほとんどのマスはここで終わる）
        if (get(x + 1, y, z) && get(x - 1, y, z) && get(x, y + 1, z) && get(x, y - 1, z) && get(x, y, z + 1) && get(x, y, z - 1)) continue;
        let col, e = 0;
        const h = HM.hash3(x, y, z, seed);
        if (m === TOFU) {
          const k = 0.93 + h * 0.07;
          col = [0.97 * k, 0.94 * k, 0.86 * k];
        } else if (m === YAKI) {
          const stripe = (y % 3 === 0) ? 0.7 : 1;
          const k = (0.9 + h * 0.1) * stripe;
          col = [0.78 * k, 0.52 * k, 0.24 * k];
        } else {
          const tw = 0.85 + h * 0.15;
          col = [1.0 * tw, 0.66 * tw, 0.22 * tw]; e = 0.75;
        }
        for (let d = 0; d < 6; d++) {
          const n = D[d];
          if (get(x + n[0], y + n[1], z + n[2]) !== AIR) continue;
          // 角の暗さ：面の外側のマスで調べる
          const ox = x + n[0], oy = y + n[1], oz = z + n[2];
          const cs = F[d].c;
          for (let k = 0; k < 4; k++) {
            const c = cs[k];
            // 角の向き（-1 か +1）を、法線に垂直な 2 軸で求める
            const ax = [], s = [c[0] * 2 - 1, c[1] * 2 - 1, c[2] * 2 - 1];
            for (let a = 0; a < 3; a++) if (n[a] === 0) ax.push(a);
            const p1 = [ox, oy, oz], p2 = [ox, oy, oz], p3 = [ox, oy, oz];
            p1[ax[0]] += s[ax[0]];
            p2[ax[1]] += s[ax[1]];
            p3[ax[0]] += s[ax[0]]; p3[ax[1]] += s[ax[1]];
            const s1 = get(p1[0], p1[1], p1[2]) !== AIR ? 1 : 0, s2 = get(p2[0], p2[1], p2[2]) !== AIR ? 1 : 0;
            const s3 = get(p3[0], p3[1], p3[2]) !== AIR ? 1 : 0;
            ao[k] = AOK[(s1 && s2) ? 0 : 3 - (s1 + s2 + s3)];
          }
          HM.pushFace(out, x, y, z, 1, d, col[0], col[1], col[2], e, e ? null : ao);
        }
      }
    }
    return new Float32Array(out);
  };
  World.NC = NC;
  HM.World = World;
  /** 大きさのキー（small・medium・large）からマスの数 */
  HM.fieldSize = key => (T.sizes.find(s => s.key === key) || T.sizes[T.sizes.length - 1]).n;
})();

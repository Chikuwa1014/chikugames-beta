/* 荒野開拓記（仮） — 描画の層：乱数・ノイズ・形の入れ物（高精細モックの util から移した）
   グローバルは window.MZ の 1 つだけ。描画の層は MZ.gfx の下に置く。 */
(function () {
  const MZ = window.MZ, B = BABYLON;
  const G = MZ.gfx = MZ.gfx || {};
  /* ---------- 乱数・ノイズ ---------- */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash2(x, y, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function hash3(x, y, z, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1103515245) + Math.imul(s | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  const wrapI = (i, p) => (p ? ((i % p) + p) % p : i);
  /* 値ノイズ（0〜1）。px・py を渡すとその周期でつながる（テクスチャ用） */
  function vnoise(x, y, s, px, py) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const x0 = wrapI(ix, px), x1 = wrapI(ix + 1, px), y0 = wrapI(iy, py), y1 = wrapI(iy + 1, py);
    const a = hash2(x0, y0, s), b = hash2(x1, y0, s), c = hash2(x0, y1, s), d = hash2(x1, y1, s);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  /* セル（ボロノイ）：[一番近い点までの距離, その点の乱数, もう 1 つの乱数]（p で周期） */
  function makeVoro(x, y, p) {
    const ix = Math.floor(x), iy = Math.floor(y);
    let best = 9, r1 = 0, r2 = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = ix + i, cy = iy + j, wx = wrapI(cx, p), wy = wrapI(cy, p);
      const px = cx + hash2(wx, wy, 71), py = cy + hash2(wx, wy, 72);
      const d = Math.hypot(px - x, py - y);
      if (d < best) { best = d; r1 = hash2(wx, wy, 73); r2 = hash2(wx, wy, 74); }
    }
    return [best, r1, r2];
  }
  function fbm(x, y, s, oct, px, py) {
    let sum = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += amp * vnoise(x * f, y * f, s + i * 31, px ? px * f : 0, py ? py * f : 0);
      norm += amp; amp *= 0.5; f *= 2;
    }
    return sum / norm;
  }
  function vnoise3(x, y, z, s) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = x - ix, fy = y - iy, fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
    const l = (a, b, t) => a + (b - a) * t;
    const c000 = hash3(ix, iy, iz, s), c100 = hash3(ix + 1, iy, iz, s), c010 = hash3(ix, iy + 1, iz, s), c110 = hash3(ix + 1, iy + 1, iz, s);
    const c001 = hash3(ix, iy, iz + 1, s), c101 = hash3(ix + 1, iy, iz + 1, s), c011 = hash3(ix, iy + 1, iz + 1, s), c111 = hash3(ix + 1, iy + 1, iz + 1, s);
    return l(l(l(c000, c100, ux), l(c010, c110, ux), uy), l(l(c001, c101, ux), l(c011, c111, ux), uy), uz);
  }
  function fbm3(x, y, z, s, oct) {
    let sum = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { sum += amp * vnoise3(x * f, y * f, z * f, s + i * 17); norm += amp; amp *= 0.5; f *= 2; }
    return sum / norm;
  }
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
  const _a = new B.Vector3(), _b = new B.Vector3();
  class Geo {
    constructor() { this.p = []; this.n = []; this.uv = []; this.i = []; this.c = null; }
    get count() { return this.p.length / 3; }
    v(x, y, z, nx, ny, nz, u, w, m) {
      if (m) {
        _a.set(x, y, z); B.Vector3.TransformCoordinatesToRef(_a, m, _b); x = _b.x; y = _b.y; z = _b.z;
        _a.set(nx, ny, nz); B.Vector3.TransformNormalToRef(_a, m, _b); _b.normalize(); nx = _b.x; ny = _b.y; nz = _b.z;
      }
      this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, w);
      return this.p.length / 3 - 1;
    }
    /* 三角形。向き（表裏）は頂点の法線から決める（Babylon の表：(a-b)×(c-b) が法線の向き） */
    t(a, b, c) {
      const P = this.p, N = this.n;
      const ax = P[a * 3] - P[b * 3], ay = P[a * 3 + 1] - P[b * 3 + 1], az = P[a * 3 + 2] - P[b * 3 + 2];
      const cx = P[c * 3] - P[b * 3], cy = P[c * 3 + 1] - P[b * 3 + 1], cz = P[c * 3 + 2] - P[b * 3 + 2];
      const nx = ay * cz - az * cy, ny = az * cx - ax * cz, nz = ax * cy - ay * cx;
      const d = nx * (N[a * 3] + N[b * 3] + N[c * 3]) + ny * (N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1]) + nz * (N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2]);
      if (d >= 0) this.i.push(a, b, c); else this.i.push(a, c, b);
    }
    q(a, b, c, d) { this.t(a, b, c); this.t(a, c, d); }
    mesh(name, mat) {
      const m = new B.Mesh(name, G.scene);
      const vd = new B.VertexData();
      vd.positions = this.p; vd.normals = this.n; vd.uvs = this.uv; vd.indices = this.i;
      if (this.c) vd.colors = this.c;
      vd.applyToMesh(m, false);
      m.material = mat; m.isPickable = false;
      return m;
    }
  }
  /* 位置・回転（ヨー・ピッチ・ロール）・大きさ → 行列 */
  function TRS(x, y, z, yaw, pitch, roll, sx, sy, sz) {
    sx = sx === undefined ? 1 : sx; sy = sy === undefined ? sx : sy; sz = sz === undefined ? sx : sz;
    return B.Matrix.Compose(new B.Vector3(sx, sy, sz), B.Quaternion.RotationYawPitchRoll(yaw || 0, pitch || 0, roll || 0), new B.Vector3(x, y, z));
  }
  /* 3 本の軸と位置 → 行列（軸は正規直交で渡す） */
  /* 岩の形：正二十面体を細かくして、ノイズで崩す */
  function makeRock(seed, sub, amp) {
    const vd = B.VertexData.CreateIcoSphere({ radius: 1, subdivisions: sub, flat: false });
    const p = Array.from(vd.positions), idx = Array.from(vd.indices), uv = Array.from(vd.uvs);
    for (let k = 0; k < p.length; k += 3) {
      let x = p[k], y = p[k + 1], z = p[k + 2]; const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
      const n1 = fbm3(x * 1.3 + seed, y * 1.3, z * 1.3, seed, 4), n2 = fbm3(x * 4.1, y * 4.1 + seed, z * 4.1, seed + 9, 2);
      const r = 1 + (n1 - 0.5) * amp * 1.7 + (n2 - 0.5) * amp * 0.5;
      let py = y * r * 0.78;
      if (py < -0.32) py = -0.32 + (py + 0.32) * 0.3;
      p[k] = x * r; p[k + 1] = py; p[k + 2] = z * r;
    }
    const n = [];
    B.VertexData.ComputeNormals(p, idx, n);
    return { p, n, uv, i: idx };
  }
  Object.assign(G, { rng, hash2, hash3, vnoise, fbm, vnoise3, fbm3, smooth, lerp, clamp, mix3, Geo, TRS, makeRock });
})();

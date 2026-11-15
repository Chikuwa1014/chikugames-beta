/* 荒野開拓記（仮） — 描画の層：草（thin instance。頂点シェーダーで風にゆれる。遠くで消える）
   株は土地の中だけ。主人公のまわり（消える距離の内側）だけを、4m 四方のタイルごとに決まった乱数（ハッシュ）から並べる。
   建物・道・畑のマスには生やさない（マスごとの密度の表 dens が 0）。建てる・こわすで表を直し、並べ直す。
   並べ直すのは、主人公が 3m 動いたとき・マスが変わったとき・画質（予算）が変わったときだけ（0.25 秒に 1 回まで）。
   入れ物（バッファ）は差しかえず、中身だけ書きかえて thinInstanceCount を変える。 */
(function () {
  const MZ = window.MZ, B = BABYLON, G = MZ.gfx, T = MZ.T, N = T.chunk, C = T.cell;
  const { fbm, smooth, hash3, rng, Geo } = G;
  const TILE = 4, MAXCAP = 21000;

  const S = { mesh: null, mat: null, buf: null, dens: new Float32Array(N * N), dn: new Float32Array(N * N), cap: 0, R: 55, K: 40,
    scaleF: 1, dirty: true, lx: 1e9, lz: 1e9, acc: 0, offs: null, offsR: 0, n: 0 };
  G.grassFireCol = new B.Color3(0, 0, 0); G.grassFirePos = new B.Vector3(0, -100, 0);

  function makeMat() {
    B.Effect.ShadersStore.grassVertexShader = `
      precision highp float;
      attribute vec3 position; attribute vec3 normal; attribute vec2 uv;
      #ifdef INSTANCES
      attribute vec4 world0; attribute vec4 world1; attribute vec4 world2; attribute vec4 world3;
      #endif
      uniform mat4 world; uniform mat4 viewProjection;
      uniform float time; uniform vec3 camPos; uniform float fadeEnd;
      varying vec3 vW; varying float vH; varying float vVar; varying vec3 vN; varying float vBlade; varying float vPatch;
      void main(void) {
      #ifdef INSTANCES
        mat4 W = mat4(world0, world1, world2, world3);
        #ifdef THIN_INSTANCES
        W = world * W;
        #endif
      #else
        mat4 W = world;
      #endif
        vec4 wp = W * vec4(position, 1.0);
        vec3 base = vec3(W[3][0], W[3][1], W[3][2]);
        float hgt = uv.y;
        float ph = time * 1.7 + base.x * 0.21 + base.z * 0.17;
        float gust = sin(time * 0.55 + base.x * 0.035 + base.z * 0.05) * 0.5 + 0.5;
        float bend = (sin(ph) * 0.45 + sin(ph * 2.3 + 1.7) * 0.18 + gust * 0.85) * hgt * hgt * 0.2;
        wp.x += bend * 0.85; wp.z += bend * 0.4; wp.y -= abs(bend) * 0.25;
        float d = distance(base.xz, camPos.xz);
        float fade = 1.0 - smoothstep(fadeEnd * 0.65, fadeEnd, d);
        wp.y = base.y + (wp.y - base.y) * fade;
        vW = wp.xyz; vH = hgt;
        vVar = fract(sin(dot(base.xz, vec2(12.9898, 78.233))) * 43758.5453);
        vBlade = uv.x;
        vPatch = clamp(0.5 + 0.35 * sin(base.x * 0.083 + 1.3) * sin(base.z * 0.071 + 0.4) + 0.25 * sin(base.x * 0.21 + base.z * 0.17), 0.0, 1.0);
        vN = normalize(mat3(W) * normal);
        gl_Position = viewProjection * wp;
      }`;
    B.Effect.ShadersStore.grassFragmentShader = `
      precision highp float;
      varying vec3 vW; varying float vH; varying float vVar; varying vec3 vN; varying float vBlade; varying float vPatch;
      uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 skyCol; uniform vec3 gndCol;
      uniform vec3 camPos;
      uniform vec3 firePos; uniform vec3 fireCol;
      uniform vec3 baseA; uniform vec3 tipA; uniform vec3 tipB; uniform vec3 tipC;
      ${G.air.glsl()}
      void main(void) {
        float r = fract(vVar * 7.13 + vBlade * 3.71);
        vec3 tip = mix(tipA, tipB, smoothstep(0.25, 0.75, vPatch + (vVar - 0.5) * 0.5));
        tip = mix(tip, tipC, step(0.8, r));                 // 枯れて茶色い葉
        tip *= 0.78 + 0.44 * fract(r * 13.7);
        vec3 alb = mix(baseA, tip, smoothstep(0.0, 0.7, vH));
        vec3 n = normalize(vN);
        vec3 v = normalize(camPos - vW);
        float ndl = max(dot(n, sunDir), 0.0);
        vec3 col = alb * sunCol * (0.2 + 0.6 * ndl) * mix(0.55, 1.0, vH);
        col += alb * sunCol * 0.5 * pow(max(dot(-v, sunDir), 0.0), 5.0) * vH;   // 逆光で透ける
        col += alb * mix(gndCol, skyCol, 0.5 + 0.5 * n.y) * mix(0.35, 1.0, vH); // 空からの光（根もとは株の中で暗い）
        vec3 L = firePos - vW;
        col += alb * fireCol / (dot(L, L) + 0.8);
        col = airApply(col, vW, camPos);
        gl_FragColor = vec4(col, 1.0);
      }`;
    const m = new B.ShaderMaterial('grassMat', G.scene, { vertex: 'grass', fragment: 'grass' }, {
      attributes: ['position', 'normal', 'uv'],
      uniforms: ['world', 'viewProjection', 'time', 'camPos', 'fadeEnd', 'sunDir', 'sunCol', 'skyCol', 'gndCol', 'firePos', 'fireCol', 'baseA', 'tipA', 'tipB', 'tipC']
    });
    m.backFaceCulling = false;
    m.setFloat('time', 0); m.setFloat('fadeEnd', 50);
    m.setVector3('camPos', G.cam.position);
    m.setVector3('sunDir', G.SKYC.SUN_DIR);
    m.setColor3('sunCol', G.sun.diffuse.scale(G.sun.intensity));
    m.setColor3('skyCol', new B.Color3(0.55, 0.6, 0.7));   // IBL の空とおよそ同じ
    m.setColor3('gndCol', new B.Color3(0.3, 0.25, 0.19));
    m.setVector3('firePos', G.grassFirePos);
    m.setColor3('fireCol', G.grassFireCol);
    m.setColor3('baseA', new B.Color3(0.035, 0.038, 0.02));
    m.setColor3('tipA', new B.Color3(0.13, 0.15, 0.07));     // 緑
    m.setColor3('tipB', new B.Color3(0.3, 0.26, 0.15));      // 枯れ草（わら色）
    m.setColor3('tipC', new B.Color3(0.17, 0.12, 0.07));     // 茶色く枯れた葉
    return m;
  }

  /* マスの密度の表（0＝生やさない）。建物（道・畑も）のあるマスは 0 */
  function cellDens(gx, gz) {
    const x = MZ.cellPos(gx), z = MZ.cellPos(gz), ci = gz * N + gx;
    const d = fbm(x * 0.08 + 3, z * 0.08 + 1, 51, 2);
    S.dn[ci] = d;
    S.dens[ci] = MZ.world.owner[ci] ? 0 : 0.12 + smooth(0.3, 0.62, d) * 0.88;
  }
  function densAll() { for (let gz = 0; gz < N; gz++) for (let gx = 0; gx < N; gx++) cellDens(gx, gz); }
  /* 建物の変化のあとに、そのまわりの密度だけ直して並べ直す（owner を直したあとに呼ぶ） */
  function dirty() {
    if (!S.mesh) return;
    densOwner();
    S.dirty = true;
  }
  function densOwner() {
    const o = MZ.world.owner;
    for (let ci = 0; ci < N * N; ci++) {
      const blocked = o[ci] !== 0;
      if (blocked) S.dens[ci] = 0;
      else if (S.dens[ci] === 0) { const gx = ci % N, gz = (ci - gx) / N; cellDens(gx, gz); }
    }
  }

  function init() {
    /* ひと株：10 枚の細い葉。uv.y は根もと 0〜先 1（ゆれと色）、uv.x は葉ごとの乱数（色のばらつき） */
    const g = new Geo(), r0 = rng(7);
    for (let b = 0; b < 10; b++) {
      const a = r0() * Math.PI * 2, off = r0() * 0.1, ox = Math.cos(a) * off, oz = Math.sin(a) * off;
      const yaw = r0() * Math.PI * 2, h = 0.14 + r0() * 0.3, w = 0.006 + r0() * 0.006, lean = 0.05 + r0() * 0.2;
      const br = r0();
      const wx = Math.cos(yaw), wz = -Math.sin(yaw), lx = Math.sin(yaw), lz = Math.cos(yaw);
      let nx = lx * 0.35, ny = 1, nz = lz * 0.35; const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      const v0 = g.v(ox - wx * w, 0, oz - wz * w, nx, ny, nz, br, 0);
      const v1 = g.v(ox + wx * w, 0, oz + wz * w, nx, ny, nz, br, 0);
      const v2 = g.v(ox - wx * w * 0.7 + lx * lean * 0.3, h * 0.55, oz - wz * w * 0.7 + lz * lean * 0.3, nx, ny, nz, br, 0.55);
      const v3 = g.v(ox + wx * w * 0.7 + lx * lean * 0.3, h * 0.55, oz + wz * w * 0.7 + lz * lean * 0.3, nx, ny, nz, br, 0.55);
      const v4 = g.v(ox + lx * lean, h, oz + lz * lean, nx, ny, nz, br, 1);
      g.i.push(v0, v1, v3, v0, v3, v2, v2, v3, v4);
    }
    S.mat = makeMat();
    S.mesh = g.mesh('grass', S.mat);
    S.buf = new Float32Array(MAXCAP * 16);
    S.mesh.thinInstanceSetBuffer('matrix', S.buf, 16, false);
    S.mesh.thinInstanceCount = 0;
    S.mesh.alwaysSelectAsActiveMesh = true;
    S.mesh.setBoundingInfo(new B.BoundingInfo(new B.Vector3(-130, -1, -130), new B.Vector3(130, 2, 130)));
    S.mesh.doNotSyncBoundingInfo = true;
    densAll(); densOwner();
  }

  function apply(key) {
    const q = G.Q[key];
    S.cap = Math.min(MAXCAP, q.grass); S.R = q.fadeEnd;
    S.mat.setFloat('fadeEnd', q.fadeEnd);
    /* 1 タイルの候補の数：密度の平均（約 0.5）を見込んで、上限の株数がちょうど埋まるくらい */
    S.K = Math.ceil(S.cap / (Math.PI * S.R * S.R) / 0.5 * TILE * TILE);
    S.offs = null; S.dirty = true;
  }
  function setScale(f) { S.scaleF = f; S.dirty = true; }

  const _mt = new B.Matrix(), _q = new B.Quaternion(), _s = new B.Vector3(), _t = new B.Vector3();
  /* タイルを近い順に並べた一覧（画質が変わったときだけ作る） */
  function tileOffs() {
    if (S.offs && S.offsR === S.R) return S.offs;
    const r = Math.ceil((S.R + TILE) / TILE) + 1, a = [];
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dz) * TILE;
      if (d <= S.R + TILE * 1.5) a.push([dx, dz, d]);
    }
    a.sort((p, q) => p[2] - q[2]);
    S.offs = a; S.offsR = S.R;
    return a;
  }
  function layout(px, pz) {
    const offs = tileOffs(), cap = S.cap, K = Math.max(1, Math.round(S.K * S.scaleF)), buf = S.buf, lim = T.half;
    const ptx = Math.floor(px / TILE), ptz = Math.floor(pz / TILE);
    let n = 0;
    for (let k = 0; k < offs.length && n < cap; k++) {
      const tx = ptx + offs[k][0], tz = ptz + offs[k][1];
      for (let j = 0; j < K && n < cap; j++) {
        const x = (tx + hash3(tx, tz, j, 1)) * TILE, z = (tz + hash3(tx, tz, j, 2)) * TILE;
        if (x <= -lim || x >= lim || z <= -lim || z >= lim) continue;
        const ci = (Math.floor(z / C) + N / 2) * N + Math.floor(x / C) + N / 2;
        if (hash3(tx, tz, j, 3) >= S.dens[ci]) continue;
        const sc = 0.7 + hash3(tx, tz, j, 4) * 0.6;
        _s.set(sc, sc * (0.6 + S.dn[ci] * 0.8), sc);
        B.Quaternion.RotationYawPitchRollToRef(hash3(tx, tz, j, 5) * 6.283, (hash3(tx, tz, j, 6) - 0.5) * 0.16, (hash3(tx, tz, j, 7) - 0.5) * 0.16, _q);
        _t.set(x, -0.02, z);
        B.Matrix.ComposeToRef(_s, _q, _t, _mt);
        _mt.copyToArray(buf, n * 16); n++;
      }
    }
    S.n = n;
    S.mesh.thinInstanceCount = n;
    S.mesh.thinInstanceBufferUpdated('matrix');
    S.mesh.setEnabled(n > 0);
  }
  /* 毎フレーム：時間を進め、必要なら並べ直す */
  function update(dt, time, px, pz) {
    if (!S.mesh) return;
    S.mat.setFloat('time', time);
    S.acc += dt;
    const moved = Math.hypot(px - S.lx, pz - S.lz) >= 3;
    if ((S.dirty || moved) && S.acc >= 0.25 && S.cap > 0) { S.acc = 0; S.dirty = false; S.lx = px; S.lz = pz; layout(px, pz); }
  }
  /* 手元の確かめ用：マス (gx,gz) に生えている株の数を数える（表が 0 のマスは 0 のはず） */
  function countInCell(gx, gz) {
    let c = 0; const x0 = (gx - N / 2) * C, z0 = (gz - N / 2) * C, b = S.buf;
    for (let i = 0; i < S.n; i++) { const x = b[i * 16 + 12], z = b[i * 16 + 14]; if (x >= x0 && x < x0 + C && z >= z0 && z < z0 + C) c++; }
    return c;
  }
  G.grass = { init, apply, update, dirty, setScale, layout, countInCell, get scaleF() { return S.scaleF; }, get count() { return S.n; }, state: S };
})();

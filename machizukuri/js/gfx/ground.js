/* 荒野開拓記（仮） — 描画の層：地面・土地の外の起伏・遠景の山なみ・境目の柵
   - 土地の中（±120m）は y = 0 の平らなまま（建築・当たり・ねらい・見本は y = 0 を前提にしている）。
     見た目の変化は、写真の混ぜ合わせ・色むら・草でつける。頂点の高さは変えない。
   - 起伏は柵の外だけ。126m から外側でなめらかに上がりはじめ、遠景の山なみ（半径 300〜1200m）へつなぐ。120〜126m は y = 0。
   - 道・畑・踏み固めは「マスの塗り分けの表」（120×120 の RawTexture。R＝土の道、G＝畑、B＝建物のまわりの踏み固め）を
     GroundPlugin が世界の座標から読み、ノイズで境目をくずして塗る。建てる・こわすたびに mark で該当マスだけ書きかえる。 */
(function () {
  const MZ = window.MZ, B = BABYLON, G = MZ.gfx, T = MZ.T, N = T.chunk, C = T.cell;
  const { fbm, smooth, mix3, Geo } = G;
  const HALF = T.half;   // 120

  /* ---------- マスの塗り分けの表 ---------- */
  const mark = { data: new Uint8Array(N * N * 4), tex: null };
  const kindOf = t => (t === 'road' ? 1 : t === 'field' ? 2 : t ? 3 : 0);   // 道・畑・そのほかの建物
  function cellKind(gx, gz) {
    if (gx < 0 || gz < 0 || gx >= N || gz >= N) return 0;
    const id = MZ.world.owner[gz * N + gx];
    if (!id) return 0;
    const b = MZ.town.byId[id];
    return b ? kindOf(b.t) : 0;
  }
  /* マス (gx,gz) の 4 つの値を、建物の表（owner）から求める */
  function writeCell(gx, gz) {
    const k = cellKind(gx, gz), o = (gz * N + gx) * 4;
    let b = 0;
    if (k === 3) b = 128;
    else {
      for (let dz = -1; dz <= 1 && !b; dz++) for (let dx = -1; dx <= 1; dx++) if (cellKind(gx + dx, gz + dz) === 3) { b = 128; break; }
    }
    mark.data[o] = k === 1 ? 255 : 0; mark.data[o + 1] = k === 2 ? 255 : 0; mark.data[o + 2] = b; mark.data[o + 3] = 255;
  }
  /* 建物 b（x,z は左上のマス、w マス四方）のまわりの表だけ書きかえる。呼ぶのは owner を直したあと */
  function markBuilding(b) {
    const w = MZ.BUILDS[b.t].w;
    for (let gz = b.z - 2; gz < b.z + w + 2; gz++) for (let gx = b.x - 2; gx < b.x + w + 2; gx++) {
      if (gx >= 0 && gz >= 0 && gx < N && gz < N) writeCell(gx, gz);
    }
    if (mark.tex) mark.tex.update(mark.data);
    if (G.grass) G.grass.dirty();
    if (G.nodes) G.nodes.dirty();
  }
  function markAll() {
    for (let gz = 0; gz < N; gz++) for (let gx = 0; gx < N; gx++) writeCell(gx, gz);
    if (mark.tex) mark.tex.update(mark.data);
    if (G.grass) G.grass.dirty();
  }

  /* ---------- 地面の材質（PBR）と GroundPlugin ---------- */
  let plugin = null, mat = null;
  function registerGround() {
    class GroundPlugin extends B.MaterialPluginBase {
      constructor(material) {
        super(material, 'GroundPhoto', 250, { GPHOTO: false });
        this.on = false; this.dirt = null; this.path = null; this.farm = null; this.mark = null;
        this._enable(true);
      }
      /* 写真が読めたら col（土）・path・farm を渡す。null ならコードの色で描く */
      set(col, path, farm) {
        const on = !!(col && path && farm);
        this.dirt = on ? col : null; this.path = on ? path : null; this.farm = on ? farm : null;
        if (on !== this.on) { this.on = on; this.markAllDefinesAsDirty(); }
      }
      isReadyForSubMesh() {
        if (!this.on) return true;
        return this.dirt.isReady() && this.path.isReady() && this.farm.isReady();
      }
      prepareDefines(defines) { defines.GPHOTO = this.on; }
      getClassName() { return 'GroundPlugin'; }
      getSamplers(samplers) { samplers.push('gMarkSampler', 'gDirtSampler', 'gPathSampler', 'gFarmSampler'); }
      bindForSubMesh(ubo) {
        ubo.setTexture('gMarkSampler', this.mark);
        if (!this.on) return;
        ubo.setTexture('gDirtSampler', this.dirt);
        ubo.setTexture('gPathSampler', this.path);
        ubo.setTexture('gFarmSampler', this.farm);
      }
      getCustomCode(type) {
        if (type === 'vertex') return null;
        return {
          CUSTOM_FRAGMENT_DEFINITIONS: `
            uniform sampler2D gMarkSampler;
            #ifdef GPHOTO
            uniform sampler2D gDirtSampler; uniform sampler2D gPathSampler; uniform sampler2D gFarmSampler;
            vec3 gTex(sampler2D s, vec2 uv) { return toLinearSpace(texture2D(s, uv).rgb); }
            #endif
            float gH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            float gN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
              return mix(mix(gH(i), gH(i + vec2(1.0, 0.0)), f.x), mix(gH(i + vec2(0.0, 1.0)), gH(i + vec2(1.0, 1.0)), f.x), f.y); }
`,
          CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
            {
              vec2 wp = vPositionW.xz;
              vec2 wr = mat2(0.8, -0.6, 0.6, 0.8) * wp;
              float nb = gN(wp * 0.21) * 0.65 + gN(wp * 0.57 + 3.1) * 0.35;
              float bl = smoothstep(0.3, 0.7, nb);
              #ifdef GPHOTO
              vec3 dA = gTex(gDirtSampler, wp * (1.0 / 2.5));
              vec3 dB = gTex(gDirtSampler, wr * (1.0 / 3.4) + vec2(0.37, 0.71));
              vec3 dirt = mix(dA, dB, bl);
              vec3 pA = gTex(gPathSampler, wp * (1.0 / 1.3));
              vec3 pB = gTex(gPathSampler, wr * (1.0 / 1.9) + vec2(0.13, 0.52));
              vec3 path = mix(pA, pB, 1.0 - bl) * vec3(1.08, 1.0, 0.92);
              vec3 farm = gTex(gFarmSampler, wp * 0.5) * 0.95;
              #else
              vec3 dirt = vec3(0.2, 0.165, 0.1) * (0.8 + 0.4 * nb);
              vec3 path = vec3(0.3, 0.23, 0.15) * (0.85 + 0.3 * nb);
              vec3 farm = vec3(0.09, 0.06, 0.04) * (0.8 + 0.4 * nb);
              #endif
              /* 色むら（低い周波数のノイズ） */
              float g1 = gN(wp * 0.06 + 7.0) * 0.6 + gN(wp * 0.17 + 2.0) * 0.4, g2 = gN(wp * 0.012), g3 = gN(wp * 0.22 + vec2(2.0, 5.0));
              vec3 tc = mix(vec3(0.6, 0.55, 0.42), vec3(0.5, 0.5, 0.36), smoothstep(0.35, 0.7, g1));
              tc = mix(tc, vec3(0.66, 0.6, 0.47), smoothstep(0.55, 0.75, g2) * 0.6);
              tc = mix(tc, vec3(0.52, 0.45, 0.36), smoothstep(0.55, 0.72, g3) * 0.45);
              tc = mix(tc, vec3(0.46, 0.47, 0.34), smoothstep(0.6, 0.78, 1.0 - g3) * 0.35);
              vec3 tint = tc / vec3(0.56, 0.53, 0.39);
              /* 道・畑・踏み固め：マスの表を読んで、ノイズで境目をくずす（土地の外には表がない） */
              vec4 mk = texture2D(gMarkSampler, (wp + 120.0) / 240.0);
              if (abs(wp.x) >= 120.0 || abs(wp.y) >= 120.0) mk = vec4(0.0);
              float pathv = smoothstep(0.36, 0.64, mk.r + (nb - 0.5) * 0.4);
              float trod = smoothstep(0.3, 0.75, mk.b * 1.5 + (nb - 0.5) * 0.45) * 0.55;
              float farmv = smoothstep(0.4, 0.6, mk.g + (nb - 0.5) * 0.3);
              vec3 col = mix(dirt, path, max(pathv, trod));
              col = mix(col, farm, farmv);
              col *= mix(tint, vec3(1.0), max(pathv, farmv)) * vec3(1.12, 1.05, 0.95);
              col *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.2, abs(mk.r - 0.78))) * step(0.5, mk.r);
              /* 土地の外はすこし野性味（暗めのオリーブ寄り） */
              col = mix(col, col * vec3(0.9, 0.95, 0.8), smoothstep(125.0, 330.0, max(abs(wp.x), abs(wp.y))));
              surfaceAlbedo = col;
            }
`
        };
      }
    }
    return GroundPlugin;
  }

  /* ---------- 地形（柵の外だけ起伏） ---------- */
  function hOut(x, z) {
    const c = Math.max(Math.abs(x), Math.abs(z));
    if (c <= HALF + 6) return 0;                          // 柵のすぐ外（120〜126m）まで平ら
    const r = Math.sqrt(x * x + z * z);
    const f = smooth(HALF + 6, HALF + 70, c);             // 126m から外側でなめらかに上がりはじめる
    let h = (fbm(x * 0.012 + 40, z * 0.012 + 40, 11, 4) - 0.35) * 9 + (fbm(x * 0.05, z * 0.05, 12, 3) - 0.5) * 1.6;
    h += smooth(110, 280, r) * Math.pow(fbm(x * 0.0065 + 3, z * 0.0065 + 7, 14, 4), 1.6) * 55;
    h = Math.max(h, 0) * f;
    return h * (1 - smooth(250, 300, r) * 0.6);
  }
  /* 座標の列：内側は一定の間かく、外側はだんだん広げる */
  function coords(inStep, grow, first, extent) {
    const out = [];
    for (let v = -(HALF + 6); v <= HALF + 6 + 1e-6; v += inStep) out.push(v);
    const lo = -(HALF + 6), hi = HALF + 6;
    if (Math.abs(out[out.length - 1] - hi) > 1e-3) out.push(hi);
    out[0] = lo;
    let s = first, v = hi;
    const pos = [];
    while (v < extent) { v += s; pos.push(Math.min(v, extent)); s *= grow; }
    pos.forEach(p => { out.push(p); out.unshift(-p); });
    return out;
  }
  function buildTerrain(name, inStep, grow, first) {
    const cs = coords(inStep, grow, first, 330), n = cs.length, g = new Geo();
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = cs[i], z = cs[j];
      g.p.push(x, hOut(x, z), z); g.n.push(0, 1, 0); g.uv.push(x / 5, z / 5);
    }
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = j * n + i; g.q(a, a + 1, a + n + 1, a + n);
    }
    B.VertexData.ComputeNormals(g.p, g.i, g.n);
    const m = g.mesh(name, mat);
    m.receiveShadows = true; m.freezeWorldMatrix();
    return m;
  }
  /* 遠景の山なみ（輪っか状の地形。霧でかすむ） */
  function buildMountains() {
    const A = 200, R = 16, g = new Geo(); g.c = [];
    for (let j = 0; j <= R; j++) {
      const r = 300 + 900 * Math.pow(j / R, 1.3);
      for (let i = 0; i <= A; i++) {
        const a = i / A * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
        const n = fbm(x * 0.0035 + 11, z * 0.0035 + 3, 41, 5), ridge = 1 - Math.abs(n * 2 - 1);
        let y = smooth(310, 640, r) * (40 + Math.pow(ridge, 2.2) * 270) * (0.55 + 0.45 * fbm(x * 0.001 + 2, z * 0.001, 42, 2));
        y -= 6 * (1 - smooth(300, 360, r));
        let c = mix3([0.3, 0.32, 0.22], [0.42, 0.4, 0.38], smooth(40, 120, y));
        c = mix3(c, [0.95, 0.95, 0.98], smooth(190, 230, y + (fbm(x * 0.02, z * 0.02, 43, 2) - 0.5) * 40));
        g.p.push(x, y, z); g.n.push(0, 1, 0); g.uv.push(0, 0); g.c.push(c[0], c[1], c[2], 1);
      }
    }
    for (let j = 0; j < R; j++) for (let i = 0; i < A; i++) {
      const a = j * (A + 1) + i; g.q(a, a + 1, a + A + 2, a + A + 1);
    }
    B.VertexData.ComputeNormals(g.p, g.i, g.n);
    const m = g.mesh('mountains', G.ground.mountMat);
    m.freezeWorldMatrix();
    return m;
  }
  /* 土地の境目：柵（thin instance 1 つ。今までと同じ形・位置） */
  function buildFence() {
    const post = MZ.getModel('post'), pm = [], q = (x, z, ry) => {
      const m = B.Matrix.Compose(new B.Vector3(1, 1, 1), B.Quaternion.RotationAxis(B.Axis.Y, ry), new B.Vector3(x, 0, z)); pm.push(...m.m);
    };
    const e = HALF;
    for (let v = -e; v <= e; v += 4) { q(-e, v, 0); q(e, v, 0); q(v, -e, Math.PI / 2); q(v, e, Math.PI / 2); }
    post.isVisible = true; post.alwaysSelectAsActiveMesh = true; post.receiveShadows = true;
    post.thinInstanceSetBuffer('matrix', new Float32Array(pm), 16, true);
    post.freezeWorldMatrix();
    G.ground.fence = post;
    if (G.post && G.post.addCaster) G.post.addCaster(post);
  }

  function init() {
    const sc = G.scene;
    mark.tex = new B.RawTexture(mark.data, N, N, B.Constants.TEXTUREFORMAT_RGBA, sc, false, false, B.Texture.BILINEAR_SAMPLINGMODE);
    mark.tex.wrapU = B.Texture.CLAMP_ADDRESSMODE; mark.tex.wrapV = B.Texture.CLAMP_ADDRESSMODE;
    mat = G.ground.mat = new B.PBRMaterial('ground', sc);
    mat.metallic = 0; mat.roughness = 1; mat.albedoColor = new B.Color3(1, 1, 1); mat.maxSimultaneousLights = 4;
    G.ground.mountMat = new B.PBRMaterial('mountain', sc);
    G.ground.mountMat.metallic = 0; G.ground.mountMat.roughness = 1; G.ground.mountMat.maxSimultaneousLights = 4;
    const GP = registerGround();
    plugin = new GP(mat); plugin.mark = mark.tex;
    G.ground.plugin = plugin;
    G.ground.hi = buildTerrain('terrainHi', 12, 1.1, 3);
    G.ground.lo = buildTerrain('terrainLo', 36, 1.3, 6); G.ground.lo.setEnabled(false);
    G.ground.mountains = buildMountains();
    buildFence();
    markAll();
  }
  /* 写真が読めたとき（photo.js から）。got：{ ground, path, farm }（読めなければ null） */
  function setPhoto(got, tier) {
    const gs = got.ground;
    if (gs && got.path && got.farm) {
      const S = 2.0;   // 地面の UV は 1 = 5 m → 2.5 m で 1 回
      G.photo.setMatTex(mat, null, G.photo.view(gs.nrm, S, S), G.photo.view(gs.orm, S, S), new B.Color3(1, 1, 1), true);
      plugin.set(gs.col, got.path.col, got.farm.col);
    } else {
      G.photo.setMatTex(mat, null, null, null, new B.Color3(1, 1, 1), false);
      plugin.set(null);
    }
  }
  function apply(key) {
    const q = G.Q[key];
    if (!G.ground.hi) return;
    G.ground.hi.setEnabled(q.hiTerrain); G.ground.lo.setEnabled(!q.hiTerrain);
  }
  G.ground = { init, mark: markBuilding, markAll, setPhoto, apply, hOut, hAt: () => 0, data: mark };
})();

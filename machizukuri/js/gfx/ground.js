/* 荒野開拓記（仮） — 描画の層：地面・土地の外の起伏・遠景の山なみ・境目の柵
   - 土地の中（±120m）は y = 0 の平らなまま（建築・当たり・ねらい・見本は y = 0 を前提にしている）。
     見た目の変化は、写真の混ぜ合わせ・色むら・草でつける。頂点の高さは変えない。
   - 起伏は柵の外だけ。126m から外側でなめらかに上がりはじめ、遠景の山なみ（半径 300〜1200m）へつなぐ。120〜126m は y = 0。
   - 起伏・遠景の山なみ・柵の外の飾り・柵（hOut・coords・buildTerrain・buildMountains・buildOutskirts・buildFence）は最初の区画（±120m）だけに合わせて作ってある。
     区切り 3 で、持っている土地の四角から作り直す（HALF は「最初の区画の半分」の意味）。
   - 道・畑・踏み固めは「マスの塗り分けの表」（全体の 360×360 マスの RawTexture。R＝土の道、G＝畑、B＝建物のまわりの踏み固め）を
     GroundPlugin が世界の座標から読み、ノイズで境目をくずして塗る。建てる・こわすたびに mark で該当マスだけ書きかえる。
     シェーダーは 720m（360 画素）を引く。材質は PBR（highp）なので足りるが、mediump だけの端末では 1 画素の 1/4 ほどずれるおそれがある。 */
(function () {
  const MZ = window.MZ, B = BABYLON, G = MZ.gfx, T = MZ.T, N = T.chunk, C = T.cell;
  const { fbm, smooth, mix3, Geo } = G;
  const HALF = T.half;   // 120

  /* ---------- マスの塗り分けの表 ---------- */
  /* 表は全体のマス G0〜G0+GN−1。左下の角は世界の x = (G0 − N/2)*C（−360m）、幅は GN*C（720m）。シェーダーへ入れる数（数は直書きしない） */
  const MK_HALF = (-(MZ.G0 - N / 2) * C).toFixed(1), MK_SPAN = (MZ.GN * C).toFixed(1);
  const GN = MZ.GN, mark = { data: new Uint8Array(GN * GN * 4), tex: null };
  const kindOf = t => (t === 'road' ? 1 : t === 'field' ? 2 : t ? 3 : 0);   // 道・畑・そのほかの建物
  function cellKind(gx, gz) {
    const ci = MZ.ci(gx, gz);
    if (ci < 0) return 0;
    const id = MZ.world.owner[ci];
    if (!id) return 0;
    const b = MZ.town.byId[id];
    return b ? kindOf(b.t) : 0;
  }
  /* マス (gx,gz) の 4 つの値を、建物の表（owner）から求める */
  function writeCell(gx, gz) {
    const k = cellKind(gx, gz), o = MZ.ci(gx, gz) * 4;
    let b = 0;
    if (k === 3) b = 128;
    else {
      for (let dz = -1; dz <= 1 && !b; dz++) for (let dx = -1; dx <= 1; dx++) if (cellKind(gx + dx, gz + dz) === 3) { b = 128; break; }
    }
    mark.data[o] = k === 1 ? 255 : 0; mark.data[o + 1] = k === 2 ? 255 : 0; mark.data[o + 2] = b; mark.data[o + 3] = 255;
  }
  /* 建物 b（x,z は左上のマス、w マス四方）のまわりの表だけ書きかえる。呼ぶのは owner を直したあと */
  function markBuilding(b) {
    const w = MZ.BUILDS[b.t].w, g = MZ.town.gpos(b);
    for (let gz = g[1] - 2; gz < g[1] + w + 2; gz++) for (let gx = g[0] - 2; gx < g[0] + w + 2; gx++) {
      if (MZ.inWorld(gx, gz)) writeCell(gx, gz);
    }
    if (mark.tex) mark.tex.update(mark.data);
    if (G.grass) G.grass.dirty();
    if (G.nodes) G.nodes.dirty();
  }
  function markAll() {
    /* 持っている区画のマスだけ回す（持っていない区画は 0 のまま） */
    MZ.world.landKeys.forEach(key => {
      const c = key.indexOf(','), x0 = +key.slice(0, c) * N, z0 = +key.slice(c + 1) * N;
      for (let gz = z0; gz < z0 + N; gz++) for (let gx = x0; gx < x0 + N; gx++) writeCell(gx, gz);
    });
    if (mark.tex) mark.tex.update(mark.data);
    if (G.grass) G.grass.dirty();
    if (G.nodes) G.nodes.dirty();
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
              vec4 mk = texture2D(gMarkSampler, (wp + ${MK_HALF}) / ${MK_SPAN});
              if (abs(wp.x) >= ${MK_HALF} || abs(wp.y) >= ${MK_HALF}) mk = vec4(0.0);
              float pathv = smoothstep(0.36, 0.64, mk.r + (nb - 0.5) * 0.4);
              float trod = smoothstep(0.3, 0.75, mk.b * 1.5 + (nb - 0.5) * 0.45) * 0.55;
              float farmv = smoothstep(0.4, 0.6, mk.g + (nb - 0.5) * 0.3);
              vec3 col = mix(dirt, path, max(pathv, trod));
              col = mix(col, farm, farmv);
              col *= mix(tint, vec3(1.0), max(pathv, farmv)) * vec3(1.12, 1.05, 0.95);
              col *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.2, abs(mk.r - 0.78))) * step(0.5, mk.r);
              /* 土地の外はすこし野性味（暗めのオリーブ寄り） */
              col = mix(col, col * vec3(0.9, 0.95, 0.8), smoothstep(125.0, 330.0, max(abs(wp.x), abs(wp.y))));
              /* 柵の外の丘：大きな模様の土の写真と色むらを薄く重ねて、のっぺりした帯に見えないようにする */
              float outer = smoothstep(125.0, 230.0, max(abs(wp.x), abs(wp.y)));
              #ifdef GPHOTO
              vec3 bigA = gTex(gDirtSampler, wp * (1.0 / 29.0)), bigB = gTex(gDirtSampler, wr * (1.0 / 71.0) + vec2(0.4, 0.2));
              col = mix(col, mix(bigA, bigB, 0.5) * vec3(1.1, 1.02, 0.88), outer * 0.55);
              #endif
              float pat = gN(wp * 0.018 + 5.0) * 0.6 + gN(wp * 0.05) * 0.4;
              col *= mix(vec3(1.0), mix(vec3(0.85, 0.9, 0.7), vec3(1.12, 1.02, 0.86), smoothstep(0.35, 0.7, pat)), outer * 0.7);
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
  /* 遠景の山なみ：前後 2 層の輪っか状の地形。雪はなし（荒野に合わない）。岩肌は彩度の低い赤茶〜灰色で、
     遠い層ほど空の地平の色に寄せる。写真（stone）は MountPlugin が三平面投影で大きく貼る（読めなければ頂点の色だけ） */
  function buildMountains(name, rMin, rMax, hBase, hRange, seed, mixFar) {
    const A = 400, R = 24, g = new Geo(); g.c = [];
    const H = G.SKYC.C_HORIZON;
    for (let j = 0; j <= R; j++) {
      const t = j / R, r = rMin + (rMax - rMin) * Math.pow(t, 1.3);
      for (let i = 0; i <= A; i++) {
        const a = i / A * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
        const n = fbm(x * 0.0035 / (r > 900 ? 1.6 : 1) + seed, z * 0.0035 / (r > 900 ? 1.6 : 1) + 3, 41 + seed, 5), ridge = 1 - Math.abs(n * 2 - 1);
        let y = smooth(rMin + 10, rMin + (rMax - rMin) * 0.5, r) * (hBase + Math.pow(ridge, 2.2) * hRange) * (0.55 + 0.45 * fbm(x * 0.001 + 2, z * 0.001, 42 + seed, 2));
        y -= 6 * (1 - smooth(rMin, rMin + 60, r));
        const nz = fbm(x * 0.02, z * 0.02, 43 + seed, 3), nz2 = fbm(x * 0.006 + 9, z * 0.006, 44 + seed, 2);
        /* 彩度の低い赤茶〜灰色（低いところは少し緑がかる） */
        let c = mix3([0.30, 0.27, 0.21], [0.30, 0.26, 0.22], nz2);
        c = mix3(c, [0.36, 0.34, 0.31], smooth(60, 200, y + (nz - 0.5) * 60));
        c = mix3(c, [0.27, 0.25, 0.20], smooth(0.55, 0.8, nz) * 0.5);
        const k = mixFar * (0.35 + 0.65 * t);   // 遠いほど地平の色へ
        c = mix3(c, [H.r, H.g, H.b], Math.min(0.85, k));
        g.p.push(x, y, z); g.n.push(0, 1, 0); g.uv.push(0, 0); g.c.push(c[0], c[1], c[2], 1);
      }
    }
    for (let j = 0; j < R; j++) for (let i = 0; i < A; i++) {
      const a = j * (A + 1) + i; g.q(a, a + 1, a + A + 2, a + A + 1);
    }
    B.VertexData.ComputeNormals(g.p, g.i, g.n);
    const m = g.mesh(name, G.ground.mountMat);
    m.freezeWorldMatrix();
    return m;
  }
  /* 岩肌の写真を三平面投影で貼る材質の部品 */
  function registerMount() {
    class MountPlugin extends B.MaterialPluginBase {
      constructor(material) { super(material, 'MountPhoto', 255, { MPHOTO: false }); this.tex = null; this.on = false; this._enable(true); }
      set(tex) { const on = !!tex; this.tex = tex; if (on !== this.on) { this.on = on; this.markAllDefinesAsDirty(); } }
      isReadyForSubMesh() { return !this.on || this.tex.isReady(); }
      prepareDefines(d) { d.MPHOTO = this.on; }
      getClassName() { return 'MountPlugin'; }
      getSamplers(s) { s.push('mSampler'); }
      bindForSubMesh(ubo) { if (this.on) ubo.setTexture('mSampler', this.tex); }
      getCustomCode(type) {
        if (type === 'vertex') return null;
        return {
          CUSTOM_FRAGMENT_DEFINITIONS: `
            #ifdef MPHOTO
            uniform sampler2D mSampler;
            #endif
`,
          CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
            #ifdef MPHOTO
            {
              vec3 nw = abs(normalize(vNormalW));
              nw = pow(nw, vec3(4.0)); nw /= (nw.x + nw.y + nw.z);
              vec3 p = vPositionW * (1.0 / 230.0);
              vec3 tx = toLinearSpace(texture2D(mSampler, p.zy).rgb) * nw.x
                      + toLinearSpace(texture2D(mSampler, p.xz + 0.31).rgb) * nw.y
                      + toLinearSpace(texture2D(mSampler, p.xy + 0.67).rgb) * nw.z;
              surfaceAlbedo *= mix(vec3(1.0), clamp(tx * 2.6, 0.4, 1.7), 0.8);
            }
            #endif
`
        };
      }
    }
    return MountPlugin;
  }

  /* 柵の外（126〜330m）：茶色い平らな帯に見えないよう、コードの木と草のかたまりを散らす（thin instance。形は固定） */
  function buildOutskirts() {
    const r = G.rng(T.seed + 99), out = [];
    const mk = (key, n, minC, maxC, sMin, sMax, yOff) => {
      const m = MZ.models[key](), buf = [];   // 作り直す（ほかが使っている元の形とは別のメッシュにする）
      m.name = 'out_' + key;
      let tries = 0, got = 0;
      while (got < n && tries++ < n * 30) {
        const a = r() * 6.2832, d = minC + Math.sqrt(r()) * (maxC - minC), x = Math.cos(a) * d, z = Math.sin(a) * d;
        const c = Math.max(Math.abs(x), Math.abs(z));
        if (c < HALF + 8) continue;
        /* まとまりをつくる（ところどころ濃く、ところどころ空く） */
        if (fbm(x * 0.012 + 70, z * 0.012, 95, 3) < 0.42 + r() * 0.2) continue;
        const sc = sMin + r() * (sMax - sMin);
        buf.push(...B.Matrix.Compose(new B.Vector3(sc, sc * (0.9 + r() * 0.3), sc), B.Quaternion.RotationAxis(B.Axis.Y, r() * 6.2832), new B.Vector3(x, hOut(x, z) + yOff, z)).m);
        got++;
      }
      m.setEnabled(true); m.isVisible = true; m.isPickable = false; m.alwaysSelectAsActiveMesh = true; m.receiveShadows = false;
      m.thinInstanceSetBuffer('matrix', new Float32Array(buf), 16, true);
      m.freezeWorldMatrix();
      out.push(m);
    };
    mk('outPine', 320, HALF + 24, 330, 0.9, 1.5, -0.1);
    mk('outLeaf', 130, HALF + 24, 330, 0.9, 1.5, -0.1);
    mk('bush', 70, HALF + 14, 280, 1.0, 2.2, 0);
    mk('rock', 40, HALF + 16, 330, 0.8, 2.4, -0.3);
    out.forEach(m => { m.metadata = { cap: m.thinInstanceCount }; });
    return out;
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
    mark.tex = new B.RawTexture(mark.data, GN, GN, B.Constants.TEXTUREFORMAT_RGBA, sc, false, false, B.Texture.BILINEAR_SAMPLINGMODE);
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
    G.ground.mountPlugin = new (registerMount())(G.ground.mountMat);
    G.ground.mountains = buildMountains('mountains', 300, 1000, 40, 250, 0, 0.22);
    G.ground.mountainsFar = buildMountains('mountainsFar', 850, 2300, 90, 380, 5, 0.55);
    G.ground.outskirts = buildOutskirts();
    buildFence();
    markAll();
  }
  /* 写真が読めたとき（photo.js から）。got：{ ground, path, farm }（読めなければ null） */
  function setPhoto(got, tier) {
    const gs = got.ground;
    if (G.ground.mountPlugin) G.ground.mountPlugin.set(got.stone ? G.photo.view(got.stone.col, 1, 1) : null);
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
    /* 柵の外の木・草のかたまりは、画質で数を変える（予算のため） */
    (G.ground.outskirts || []).forEach(m => { m.thinInstanceCount = Math.round(m.metadata.cap * q.outer); });
  }
  G.ground = { init, mark: markBuilding, markAll, setPhoto, apply, hOut, hAt: () => 0, data: mark };
})();

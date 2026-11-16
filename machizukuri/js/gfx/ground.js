/* 荒野開拓記（仮） — 描画の層：地面・土地の外の起伏・遠景の山なみ・境目の柵
   - 土地の中（±120m）は y = 0 の平らなまま（建築・当たり・ねらい・見本は y = 0 を前提にしている）。
     見た目の変化は、写真の混ぜ合わせ・色むら・草でつける。頂点の高さは変えない。
   - 起伏は柵の外だけ。126m から外側でなめらかに上がりはじめ、遠景の山なみ（半径 300〜1200m）へつなぐ。120〜126m は y = 0。
   - 起伏・遠景の山なみ・柵の外の飾り・柵（hOut・axis・buildTerrain・buildMountains・buildOutskirts・buildFence）は、持っている区画を囲む長方形 R（rect。
     世界の座標の x0・x1・z0・z1）から作る。作り直す（rebuild）のは起動のときと、土地を広げたときだけ。"0,0" だけなら R は ±120m で、今までと同じ絵になる
     （HALF は「1 区画の半分」＝ rect の外へのはみ出しに足す数）。R の中は、持っていない区画（L 字の欠け）も含めて全部 y = 0。
   - 道・畑・踏み固めは「マスの塗り分けの表」（全体の 360×360 マスの RawTexture。R＝土の道、G＝畑、B＝建物のまわりの踏み固め）を
     GroundPlugin が世界の座標から読み、ノイズで境目をくずして塗る。建てる・こわすたびに mark で該当マスだけ書きかえる。
     シェーダーは 720m（360 画素）を引く。材質は PBR（highp）なので足りるが、mediump だけの端末では 1 画素の 1/4 ほどずれるおそれがある。 */
(function () {
  const MZ = window.MZ, B = BABYLON, G = MZ.gfx, T = MZ.T, N = T.chunk, C = T.cell;
  const { fbm, smooth, mix3, Geo } = G;
  const HALF = T.half;   // 120（1 区画の半分。起伏の c ＝ rect からのはみ出し ＋ HALF）
  const CH = N * C;      // 区画の一辺（240m）
  /* 持っている区画を囲む長方形（世界の座標）。いつも "0,0" を含む */
  let R = { x0: -HALF, x1: HALF, z0: -HALF, z1: HALF, mx: 0, mz: 0, hx: HALF, hz: HALF, home: true };
  function rectOf(keys) {
    let cx0 = 0, cx1 = 0, cz0 = 0, cz1 = 0;
    (keys || []).forEach(k => { const c = k.indexOf(','), x = +k.slice(0, c), z = +k.slice(c + 1); cx0 = Math.min(cx0, x); cx1 = Math.max(cx1, x); cz0 = Math.min(cz0, z); cz1 = Math.max(cz1, z); });
    const x0 = cx0 * CH - CH / 2, x1 = cx1 * CH + CH / 2, z0 = cz0 * CH - CH / 2, z1 = cz1 * CH + CH / 2;
    return { x0, x1, z0, z1, mx: (x0 + x1) / 2, mz: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, home: (keys || []).length <= 1 };
  }
  /* rect からのはみ出し（チェビシェフ距離。中は 0） */
  const outDist = (x, z) => Math.max(R.x0 - x, x - R.x1, R.z0 - z, z - R.z1, 0);

  /* ---------- マスの塗り分けの表 ---------- */
  /* 表は全体のマス G0〜G0+GN−1。左下の角は世界の x = (G0 − N/2)*C（−360m）、幅は GN*C（720m）。シェーダーへ入れる数（数は直書きしない） */
  const MK_HALF = (-(MZ.G0 - N / 2) * C).toFixed(1), MK_SPAN = (MZ.GN * C).toFixed(1);
  const GN = MZ.GN, mark = { data: new Uint8Array(GN * GN * 4), tex: null };
  const kindOf = t => { const d = t && MZ.BUILDS[t]; return !d ? 0 : d.road ? (d.pave ? 4 : 1) : (d.food && !d.solid) ? 2 : 3; };   // 0＝なし、1＝土の道（road の欄で pave なし）、2＝畑（大きな畑も。食料で通れる物）、3＝そのほかの建物、4＝石畳（road で pave あり）
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
    mark.data[o] = k === 1 ? 255 : 0; mark.data[o + 1] = k === 2 ? 255 : 0; mark.data[o + 2] = b; mark.data[o + 3] = k === 4 ? 255 : 0;   // A＝石畳のマス
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
  /* 区画 1 つぶん（広げたとき）。持っていない区画のマスは 0 のまま */
  function markChunk(key) {
    const c = key.indexOf(','), x0 = +key.slice(0, c) * N, z0 = +key.slice(c + 1) * N;
    for (let gz = z0; gz < z0 + N; gz++) for (let gx = x0; gx < x0 + N; gx++) writeCell(gx, gz);
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
        super(material, 'GroundPhoto', 250, { GPHOTO: false, GCOBBLE: false, GCNRM: false, GCORM: false });
        this.rect = [-HALF, HALF, -HALF, HALF];   // 持っている区画を囲む長方形（x0, x1, z0, z1）。シェーダーの「柵の外」の見た目の基準
        this.on = false; this.dirt = null; this.path = null; this.farm = null; this.mark = null;
        this.cob = null; this.cobN = null; this.cobO = null;   // 石畳の写真（色・法線・ORM。読めたものだけ。土・道・畑の写真とは別に有る無しを決める）
        this._enable(true);
      }
      /* 写真が読めたら col（土）・path・farm を渡す。null ならコードの色で描く */
      set(col, path, farm) {
        const on = !!(col && path && farm);
        this.dirt = on ? col : null; this.path = on ? path : null; this.farm = on ? farm : null;
        if (on !== this.on) { this.on = on; this.markAllDefinesAsDirty(); }
      }
      /* 石畳の写真：col が読めたときだけ GCOBBLE。法線（中・高）・ORM（高）は読めた分だけ */
      setCobble(col, nrm, orm) {
        this.cob = col || null; this.cobN = col ? (nrm || null) : null; this.cobO = col ? (orm || null) : null;
        this.markAllDefinesAsDirty();
      }
      isReadyForSubMesh() {
        if (this.cob && !(this.cob.isReady() && (!this.cobN || this.cobN.isReady()) && (!this.cobO || this.cobO.isReady()))) return false;
        if (!this.on) return true;
        return this.dirt.isReady() && this.path.isReady() && this.farm.isReady();
      }
      prepareDefines(defines) { defines.GPHOTO = this.on; defines.GCOBBLE = !!this.cob; defines.GCNRM = !!this.cobN; defines.GCORM = !!this.cobO; }
      getClassName() { return 'GroundPlugin'; }
      getUniforms() { return { ubo: [{ name: 'gRect', size: 4, type: 'vec4' }], fragment: 'uniform vec4 gRect;' }; }
      getSamplers(samplers) { samplers.push('gMarkSampler', 'gDirtSampler', 'gPathSampler', 'gFarmSampler', 'gCobSampler', 'gCobNSampler', 'gCobOSampler'); }
      bindForSubMesh(ubo) {
        ubo.updateFloat4('gRect', this.rect[0], this.rect[1], this.rect[2], this.rect[3]);
        ubo.setTexture('gMarkSampler', this.mark);
        if (this.cob) { ubo.setTexture('gCobSampler', this.cob); if (this.cobN) ubo.setTexture('gCobNSampler', this.cobN); if (this.cobO) ubo.setTexture('gCobOSampler', this.cobO); }
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
            #ifdef GCOBBLE
            uniform sampler2D gCobSampler;
            #ifdef GCNRM
            uniform sampler2D gCobNSampler;
            #endif
            #ifdef GCORM
            uniform sampler2D gCobOSampler;
            #endif
            #endif
            vec2 gRot(vec2 v, float k) { if (k < 0.5) return v; if (k < 1.5) return vec2(-v.y, v.x); if (k < 2.5) return -v; return vec2(v.y, -v.x); }
            float gH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            float gN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
              return mix(mix(gH(i), gH(i + vec2(1.0, 0.0)), f.x), mix(gH(i + vec2(0.0, 1.0)), gH(i + vec2(1.0, 1.0)), f.x), f.y); }
`,
          CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
            {
              vec2 wp = vPositionW.xz;
              /* 柵の外の見た目の基準：持っている区画を囲む長方形からのはみ出し（チェビシェフ距離）＋ 120。"0,0" だけなら max(|x|, |z|) と同じ */
              float co = max(max(max(gRect.x - wp.x, wp.x - gRect.y), max(gRect.z - wp.y, wp.y - gRect.w)), 0.0) + ${HALF.toFixed(1)};
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
              col = mix(col, col * vec3(0.9, 0.95, 0.8), smoothstep(125.0, 330.0, co));
              /* 柵の外の丘：大きな模様の土の写真と色むらを薄く重ねて、のっぺりした帯に見えないようにする */
              float outer = smoothstep(125.0, 230.0, co);
              #ifdef GPHOTO
              vec3 bigA = gTex(gDirtSampler, wp * (1.0 / 29.0)), bigB = gTex(gDirtSampler, wr * (1.0 / 71.0) + vec2(0.4, 0.2));
              col = mix(col, mix(bigA, bigB, 0.5) * vec3(1.1, 1.02, 0.88), outer * 0.55);
              #endif
              float pat = gN(wp * 0.018 + 5.0) * 0.6 + gN(wp * 0.05) * 0.4;
              col *= mix(vec3(1.0), mix(vec3(0.85, 0.9, 0.7), vec3(1.12, 1.02, 0.86), smoothstep(0.35, 0.7, pat)), outer * 0.7);
              /* 石畳：表の A（マスの中心の画素。補間しない）が 255 のマス。1 マス（2m）に写真を 1 枚、マスごとに 90° ずつ回す。縁ははっきり出す */
              {
                vec2 cc = (floor(wp / 2.0) + 0.5) * 2.0;
                if (abs(cc.x) < ${MK_HALF} && abs(cc.y) < ${MK_HALF} && texture2D(gMarkSampler, (cc + ${MK_HALF}) / ${MK_SPAN}).a > 0.5) {
                  vec2 lp = wp - cc;
                  float k = floor(gH(floor(wp / 2.0)) * 4.0);
                  vec2 uv = gRot(lp, k) * 0.5 + 0.5;
                  float ao = 1.0;
                  #ifdef GCOBBLE
                  vec3 cob = toLinearSpace(texture2D(gCobSampler, uv).rgb);
                  #ifdef GCORM
                  /* 地面の材質が土の ORM の AO をもう掛けているので、石畳の AO は弱く重ねる（二重に暗くしない） */
                  ao = mix(1.0, texture2D(gCobOSampler, uv).r, 0.3);
                  #endif
                  #ifdef GCNRM
                  vec3 nt = texture2D(gCobNSampler, uv).xyz * 2.0 - 1.0;
                  vec2 nw = gRot(nt.xy, mod(4.0 - k, 4.0));
                  normalW = normalize(mix(normalW, normalize(vec3(nw.x, nt.z, nw.y)), 0.6));
                  #endif
                  #else
                  vec3 cob = vec3(0.30, 0.29, 0.27) * (0.78 + 0.44 * gN(wp * 5.0)) * (0.9 + 0.2 * gN(wp * 17.0));
                  #endif
                  /* 石畳でないとなりの側の縁 0.12m を暗くする（石畳どうしの間には線を出さない） */
                  float ed = 0.0;
                  vec2 nbr[4]; nbr[0] = vec2(2.0, 0.0); nbr[1] = vec2(-2.0, 0.0); nbr[2] = vec2(0.0, 2.0); nbr[3] = vec2(0.0, -2.0);
                  for (int i = 0; i < 4; i++) {
                    vec2 q = cc + nbr[i];
                    float nA = (abs(q.x) < ${MK_HALF} && abs(q.y) < ${MK_HALF}) ? texture2D(gMarkSampler, (q + ${MK_HALF}) / ${MK_SPAN}).a : 0.0;
                    if (nA < 0.5) { float d = 1.0 - dot(lp, nbr[i]) * 0.5; ed = max(ed, 1.0 - smoothstep(0.0, 0.12, d)); }
                  }
                  col = cob * ao * mix(1.0, 0.7, ed);
                }
              }
              surfaceAlbedo = col;
            }
`
        };
      }
    }
    return GroundPlugin;
  }

  /* ---------- 地形（柵の外だけ起伏） ---------- */
  /* c は「rect からのはみ出し ＋ 120」。"0,0" だけなら max(|x|, |z|) と同じ。山の高まりの r は rect の中心からの距離 */
  function hOut(x, z) {
    const c = outDist(x, z) + HALF;
    if (c <= HALF + 6) return 0;                          // rect の中と、そのすぐ外 6m までは平ら
    const r = Math.sqrt((x - R.mx) * (x - R.mx) + (z - R.mz) * (z - R.mz));
    const f = smooth(HALF + 6, HALF + 70, c);             // 6m 外から外側でなめらかに上がりはじめる
    let h = (fbm(x * 0.012 + 40, z * 0.012 + 40, 11, 4) - 0.35) * 9 + (fbm(x * 0.05, z * 0.05, 12, 3) - 0.5) * 1.6;
    h += smooth(110, 280, r) * Math.pow(fbm(x * 0.0065 + 3, z * 0.0065 + 7, 14, 4), 1.6) * 55;
    h = Math.max(h, 0) * f;
    return h * (1 - smooth(250, 300, r) * 0.6);
  }
  /* 1 本の軸の座標の列（a0〜a1 は rect の範囲）：内側は一定の間かく、外側は rect から 210m まで、だんだん広げる */
  function axis(a0, a1, inStep, grow, first) {
    const lo = a0 - 6, hi = a1 + 6, ext = 204, out = [];
    for (let v = lo; v <= hi + 1e-6; v += inStep) out.push(v);
    if (Math.abs(out[out.length - 1] - hi) > 1e-3) out.push(hi);
    out[0] = lo;
    let s = first, d = 0;
    while (d < ext) { d += s; const p = Math.min(d, ext); out.push(hi + p); out.unshift(lo - p); s *= grow; }
    return out;
  }
  function buildTerrain(name, inStep, grow, first) {
    const xs = axis(R.x0, R.x1, inStep, grow, first), zs = axis(R.z0, R.z1, inStep, grow, first), nx = xs.length, nz = zs.length, g = new Geo();
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = xs[i], z = zs[j];
      g.p.push(x, hOut(x, z), z); g.n.push(0, 1, 0); g.uv.push(x / 5, z / 5);
    }
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i; g.q(a, a + 1, a + nx + 1, a + nx);
    }
    B.VertexData.ComputeNormals(g.p, g.i, g.n);
    const m = g.mesh(name, mat);
    m.receiveShadows = true; m.freezeWorldMatrix();
    return m;
  }
  /* 遠景の山なみ：前後 2 層の輪っか状の地形。雪はなし（荒野に合わない）。岩肌は彩度の低い赤茶〜灰色で、
     遠い層ほど空の地平の色に寄せる。写真（stone）は MountPlugin が三平面投影で大きく貼る（読めなければ頂点の色だけ） */
  function buildMountains(name, rMin, rMax, hBase, hRange, seed, mixFar) {
    const mx = R.mx, mz = R.mz;   // 輪の中心は rect の中心
    const A = 400, RN = 24, g = new Geo(); g.c = [];
    const H = G.SKYC.C_HORIZON;
    for (let j = 0; j <= RN; j++) {
      const t = j / RN, r = rMin + (rMax - rMin) * Math.pow(t, 1.3);
      for (let i = 0; i <= A; i++) {
        const a = i / A * Math.PI * 2, x = mx + Math.cos(a) * r, z = mz + Math.sin(a) * r;
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
    for (let j = 0; j < RN; j++) for (let i = 0; i < A; i++) {
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

  /* 柵の外：茶色い平らな帯に見えないよう、コードの木と草のかたまりを散らす（thin instance。形は固定）。
     "0,0" だけのときは今までと同じ（rect の中心から 144〜330m の輪っか。乱数の順も同じ）。
     広げたあとは、rect の外の帯（rect から minC〜maxC は、"0,0" のときの 144〜330m から 120 を引いた 24〜210m など）へ、帯の面積に比例した数を同じ密度で散らし、
     rect の中の持っていない区画（L 字の欠け）には木（outPine・outLeaf）を区画ごとに同じ密度で置く。数の割合は画質の outer のまま（apply） */
  const bandArea = (lo, hi) => (R.hx * 2 + 2 * hi) * (R.hz * 2 + 2 * hi) - (R.hx * 2 + 2 * lo) * (R.hz * 2 + 2 * lo);
  const homeArea = (lo, hi) => (CH + 2 * hi) * (CH + 2 * hi) - (CH + 2 * lo) * (CH + 2 * lo);
  function buildOutskirts() {
    const r = G.rng(T.seed + 99), out = [], owned = new Set(MZ.world.landKeys);
    const mk = (key, n, minC, maxC, sMin, sMax, yOff, tag) => {
      const m = MZ.models[key](), buf = [];   // 作り直す（ほかが使っている元の形とは別のメッシュにする）
      m.name = 'out_' + key + (tag || '');
      const put = (x, z) => {
        const sc = sMin + r() * (sMax - sMin);
        buf.push(...B.Matrix.Compose(new B.Vector3(sc, sc * (0.9 + r() * 0.3), sc), B.Quaternion.RotationAxis(B.Axis.Y, r() * 6.2832), new B.Vector3(x, hOut(x, z) + yOff, z)).m);
      };
      /* まとまりをつくる（ところどころ濃く、ところどころ空く）。乱数を 1 回使う（今までと同じ） */
      const clump = (x, z) => fbm(x * 0.012 + 70, z * 0.012, 95, 3) < 0.42 + r() * 0.2;
      let tries = 0, got = 0;
      if (R.home) {
        while (got < n && tries++ < n * 30) {
          const a = r() * 6.2832, d = minC + Math.sqrt(r()) * (maxC - minC), x = Math.cos(a) * d, z = Math.sin(a) * d;
          const c = Math.max(Math.abs(x), Math.abs(z));
          if (c < HALF + 8) continue;
          if (clump(x, z)) continue;
          put(x, z); got++;
        }
      } else {
        const lo = minC - HALF, hi = maxC - HALF, nn = Math.round(n * bandArea(lo, hi) / homeArea(lo, hi));
        while (got < nn && tries++ < nn * 30) {
          const x = R.x0 - hi + r() * (R.x1 - R.x0 + 2 * hi), z = R.z0 - hi + r() * (R.z1 - R.z0 + 2 * hi), c = outDist(x, z);
          if (c < lo || c > hi || c < 8) continue;
          if (clump(x, z)) continue;
          put(x, z); got++;
        }
      }
      m.setEnabled(true); m.isVisible = true; m.isPickable = false; m.alwaysSelectAsActiveMesh = true; m.receiveShadows = false;
      m.thinInstanceSetBuffer('matrix', new Float32Array(buf), 16, true);
      m.freezeWorldMatrix();
      m.metadata = { cap: m.thinInstanceCount };
      out.push(m);
    };
    mk('outPine', 320, HALF + 24, 330, 0.9, 1.5, -0.1);
    mk('outLeaf', 130, HALF + 24, 330, 0.9, 1.5, -0.1);
    mk('bush', 70, HALF + 14, 280, 1.0, 2.2, 0);
    mk('rock', 40, HALF + 16, 330, 0.8, 2.4, -0.3);
    /* rect の中の持っていない区画：木だけ。1 区画あたりの数は、帯と同じ密度（"0,0" のときの帯の面積との比） */
    if (!R.home) {
      const per = (n, lo, hi) => Math.max(1, Math.round(n * CH * CH / homeArea(lo, hi)));
      const gaps = [];
      for (let cz = Math.round((R.z0 + CH / 2) / CH); cz <= Math.round((R.z1 - CH / 2) / CH); cz++) for (let cx = Math.round((R.x0 + CH / 2) / CH); cx <= Math.round((R.x1 - CH / 2) / CH); cx++) if (!owned.has(cx + ',' + cz)) gaps.push([cx, cz]);
      const mkIn = (key, n, sMin, sMax, tag) => {
        const m = MZ.models[key](), buf = []; m.name = 'out_' + key + tag;
        gaps.forEach(g => {
          const x0 = g[0] * CH - CH / 2, z0 = g[1] * CH - CH / 2; let got = 0, tries = 0;
          while (got < n && tries++ < n * 30) {
            const x = x0 + 6 + r() * (CH - 12), z = z0 + 6 + r() * (CH - 12);
            if (fbm(x * 0.012 + 70, z * 0.012, 95, 3) < 0.42 + r() * 0.2) continue;
            const sc = sMin + r() * (sMax - sMin);
            buf.push(...B.Matrix.Compose(new B.Vector3(sc, sc * (0.9 + r() * 0.3), sc), B.Quaternion.RotationAxis(B.Axis.Y, r() * 6.2832), new B.Vector3(x, -0.1, z)).m);
            got++;
          }
        });
        if (!buf.length) { m.dispose(); return; }
        m.setEnabled(true); m.isVisible = true; m.isPickable = false; m.alwaysSelectAsActiveMesh = true; m.receiveShadows = false;
        m.thinInstanceSetBuffer('matrix', new Float32Array(buf), 16, true);
        m.freezeWorldMatrix();
        m.metadata = { cap: m.thinInstanceCount };
        out.push(m);
      };
      mkIn('outPine', per(320, 24, 210), 0.9, 1.5, '_in');
      mkIn('outLeaf', per(130, 24, 210), 0.9, 1.5, '_in');
    }
    return out;
  }
  /* 土地の境目：柵（thin instance 1 つ）。持っている区画ごとに 4 つの辺を見て、となりの区画を持っていない辺にだけ 4m おきに杭を立てる
     （区画どうしの間には立てない。角の杭は 1 本。L 字も同じ）。杭の数は G.ground.fenceCount */
  function buildFence() {
    const post = MZ.models.post(), pm = [], owned = new Set(MZ.world.landKeys), seen = new Set();   // 毎回作り直す（前の物は片づける）
    const q = (x, z, ry) => {
      const k = x + ',' + z; if (seen.has(k)) return; seen.add(k);
      const m = B.Matrix.Compose(new B.Vector3(1, 1, 1), B.Quaternion.RotationAxis(B.Axis.Y, ry), new B.Vector3(x, 0, z)); pm.push(...m.m);
    };
    owned.forEach(key => {
      const c = key.indexOf(','), cx = +key.slice(0, c), cz = +key.slice(c + 1), x0 = cx * CH - CH / 2, z0 = cz * CH - CH / 2, x1 = x0 + CH, z1 = z0 + CH;
      for (let v = 0; v <= CH + 1e-6; v += 4) {
        if (!owned.has((cx - 1) + ',' + cz)) q(x0, z0 + v, 0);
        if (!owned.has((cx + 1) + ',' + cz)) q(x1, z0 + v, 0);
        if (!owned.has(cx + ',' + (cz - 1))) q(x0 + v, z0, Math.PI / 2);
        if (!owned.has(cx + ',' + (cz + 1))) q(x0 + v, z1, Math.PI / 2);
      }
    });
    post.isVisible = true; post.alwaysSelectAsActiveMesh = true; post.receiveShadows = true;
    post.thinInstanceSetBuffer('matrix', new Float32Array(pm), 16, true);
    post.freezeWorldMatrix();
    G.ground.fence = post; G.ground.fenceCount = seen.size;
    if (G.post && G.post.addCaster) G.post.addCaster(post);
  }

  /* 地形・山・柵・柵の外の飾りを、持っている区画から作る（起動のときと、土地を広げたときだけ）。前の物は影の一覧からも外して片づける */
  function buildScenery() {
    R = rectOf(MZ.world.landKeys);
    if (plugin) plugin.rect = [R.x0, R.x1, R.z0, R.z1];
    G.ground.hi = buildTerrain('terrainHi', 12, 1.1, 3);
    G.ground.lo = buildTerrain('terrainLo', 36, 1.3, 6); G.ground.lo.setEnabled(false);
    /* 山：輪の中心は rect の中心。内側の半径は max(300, rect の長いほうの半分 + 180)（"0,0" だけなら 300＝今までと同じ。地形が rect から 210m で終わるので、その 30m 内側から山をはじめて、すきまを作らない）。遠い層の内側は近い層 + 550。外側の幅も今までと同じ */
    const rIn = Math.max(300, Math.max(R.hx, R.hz) + 180);
    G.ground.mountains = buildMountains('mountains', rIn, rIn + 700, 40, 250, 0, 0.22);
    G.ground.mountainsFar = buildMountains('mountainsFar', rIn + 550, rIn + 550 + 1450, 90, 380, 5, 0.55);
    G.ground.outskirts = buildOutskirts();
    buildFence();
    G.ground.rect = R;
  }
  function disposeScenery() {
    [G.ground.hi, G.ground.lo, G.ground.mountains, G.ground.mountainsFar].forEach(m => { if (m) m.dispose(false, false); });
    (G.ground.outskirts || []).forEach(m => m.dispose(false, false));
    if (G.ground.fence) { if (G.post && G.post.removeCaster) G.post.removeCaster(G.ground.fence); G.ground.fence.dispose(false, false); }
    G.ground.outskirts = []; G.ground.fence = null;
  }
  /* 土地を広げたあと（持っている区画が変わったあと）に呼ぶ */
  function rebuild() {
    disposeScenery();
    buildScenery();
    apply(G.key);
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
    G.ground.mountPlugin = new (registerMount())(G.ground.mountMat);
    buildScenery();
    markAll();
  }
  /* 写真が読めたとき（photo.js から）。got：{ ground, path, farm }（読めなければ null） */
  function setPhoto(got, tier) {
    const gs = got.ground;
    const cb = got.cobble;
    if (plugin) plugin.setCobble(cb && cb.col, cb && cb.nrm, cb && cb.orm);   // 石畳の写真は、土・道・畑の写真とは別に有る無しを決める
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
  G.ground = { init, mark: markBuilding, markAll, markChunk, setPhoto, apply, rebuild, hOut, hAt: () => 0, data: mark, rect: R, fenceCount: 0 };
})();

/* 荒野開拓記（仮） — 描画の層：採れる物の見た目・飾り
   採れる物の「場所」は world.js の buildNodes が種から決める（ここでは変えない）。ここは見た目だけ：
   - 種類ごと・段（LOD）ごとに「入れ物（form）」を持つ。入れ物は、その種類の全部の数の固定の Float32Array（thin instance の行列）。
     入れ物は差しかえず、中身だけ書きかえて thinInstanceCount を変える（差しかえると WebGL の警告が出る）。
   - 並べ直す（layout）のは、主人公が 4m 動いたとき・物が消えた／また出たとき・画質や読み込みが変わったときだけ（0.25 秒に 1 回まで）。
   - 物ごとに nd.look = { form, slot, n }（いまどの入れ物の何番目にいるか）を持つ。ゆらすときはそこだけ書く。
   - 見た目にだけ使う乱数は、別の種（hash2(idx, 種類, T.seed)）から取る（配置の乱数は 1 回も使わない）。 */
(function () {
  const MZ = window.MZ, B = BABYLON, G = MZ.gfx, T = MZ.T, N = T.chunk, C = T.cell;
  const { hash2, rng, fbm3, smooth } = G;
  const A = G.assets;
  const S = { nodes: [], forms: {}, key: 'low', ready: {}, tex: null, mats: {}, dirty: true, flushNow: false, acc: 0, lx: 1e9, lz: 1e9,
    decor: null, decorOrder: [], shaking: [], stoneSet: null, pebble: null, pebbleMat: null, models: {}, treeCount: 0, treeOf: {} };
  const hs = (idx, salt) => hash2(idx, salt, T.seed);
  const lin = hex => B.Color3.FromHexString(hex).toLinearSpace();

  /* ---------- 行列の書きこみ（作業用の変数を使い回す） ---------- */
  const _m = new B.Matrix(), _q = new B.Quaternion(), _s = new B.Vector3(), _t = new B.Vector3();
  function put(buf, slot, x, y, z, sx, sy, sz, yaw, pitch, roll) {
    _s.set(sx, sy, sz); _t.set(x, y, z);
    B.Quaternion.RotationYawPitchRollToRef(yaw, pitch, roll, _q);
    B.Matrix.ComposeToRef(_s, _q, _t, _m);
    _m.copyToArray(buf, slot * 16);
  }
  const zero = (buf, slot) => { for (let i = 0; i < 16; i++) buf[slot * 16 + i] = 0; };

  /* ---------- 入れ物 ---------- */
  /* write(nd, buf, slot, sh) → 書いた数（1 以上）。sh はゆれの大きさ（ラジアン。0 ならゆれなし） */
  /* cap は入れ物の数（数でも、数を返す関数でもよい。関数なら、土地を広げたあと growForm が今の数に合わせて入れ物を大きくする） */
  function makeForm(id, meshes, cap, write, opt) {
    const capFn = typeof cap === 'function' ? cap : () => cap;
    const per = (opt && opt.per) || 1, c0 = capFn(), buf = new Float32Array(Math.max(1, c0 * per) * 16);
    const f = { id, meshes, cap: c0 * per, buf, n: 0, write, shadow: !!(opt && opt.shadow), capFn, per };
    meshes.forEach(m => {
      m.thinInstanceSetBuffer('matrix', buf, 16, false);
      m.thinInstanceCount = 0; m.isVisible = true; m.isPickable = false; m.alwaysSelectAsActiveMesh = true;
      m.receiveShadows = true; m.setEnabled(false);
      if (f.shadow && G.post) G.post.addCaster(m);
    });
    S.forms[id] = f;
    return f;
  }
  function flushForm(f) {
    const on = f.n > 0;
    f.meshes.forEach(m => {
      m.thinInstanceCount = f.n;
      if (on) { m.thinInstanceBufferUpdated('matrix'); m.thinInstanceRefreshBoundingInfo(false); }   // 範囲を書き直さないと、石ころなどの範囲が NaN のままで描かれない
      m.setEnabled(on);
    });
  }
  const touchForm = f => f.meshes.forEach(m => m.thinInstanceBufferUpdated('matrix'));
  /* 土地を広げて物がふえたとき、入れ物が足りなければ大きな Float32Array に差しかえる（数を 0 にしてから。減らすことはしない） */
  function growForm(f) {
    const want = f.capFn() * f.per;
    if (want <= f.cap) return;
    const buf = new Float32Array(want * 16);
    f.meshes.forEach(m => { m.thinInstanceCount = 0; m.thinInstanceSetBuffer('matrix', buf, 16, false); });
    f.buf = buf; f.cap = want; f.n = 0;
  }

  const countOf = k => S.nodes.filter(nd => nd.k === k).length;

  /* ---------- 写す関数（種類ごと） ---------- */
  const plain = (nd, buf, slot, sh) => { put(buf, slot, nd.x + sh * 0.22, 0, nd.z, nd.s, nd.s, nd.s, nd.ry, 0, 0); return 1; };
  /* 木：上ほど大きくかたむく（根もとを中心に） */
  const treeK = { tree_pine: 0.85, tree_spruce: 0.95, tree_cottonwood: 0.95, tree_poplar: 0.9, tree_dead: 1.0 };
  function treeWriter(type) {
    const k = treeK[type];
    return (nd, buf, slot, sh) => {
      const a = sh, b = sh * 0.5;
      put(buf, slot, nd.x, -0.08, nd.z, nd.s * k, nd.s * k, nd.s * k, nd.ry, (hs(nd.idx, 5) - 0.5) * 0.06 + a, (hs(nd.idx, 6) - 0.5) * 0.06 + b);
      return 1;
    };
  }
  const sizeOf = m => { const b = m.getBoundingInfo().boundingBox; return b.maximum.subtract(b.minimum); };
  /* 岩：見た目の横の半径を NODES.rock.r * s + 0.15 にそろえる */
  function rockWriter(m, rockR) {
    const e = sizeOf(m), ext = Math.max(e.x, e.z);
    return (nd, buf, slot, sh) => {
      const s = 2 * (rockR * nd.s + 0.15) / ext, sy = 0.85 + hs(nd.idx, 7) * 0.3;
      put(buf, slot, nd.x + sh * 0.22, -e.y * s * 0.12, nd.z, s, s * sy, s, nd.ry, (hs(nd.idx, 8) - 0.5) * 0.12, (hs(nd.idx, 9) - 0.5) * 0.12);
      return 1;
    };
  }
  /* 草むら（低木）：横の大きさをコードの草むら（約 1.4m × nd.s）にそろえる */
  function bushWriter(m, ext0) {
    const e = sizeOf(m), ext = ext0 || Math.max(e.x, e.z);
    return (nd, buf, slot, sh) => {
      const s = 1.4 * nd.s / ext;
      put(buf, slot, nd.x + sh * 0.22, -0.02, nd.z, s, s * (0.85 + hs(nd.idx, 7) * 0.3), s, nd.ry, (hs(nd.idx, 8) - 0.5) * 0.12, (hs(nd.idx, 9) - 0.5) * 0.12);
      return 1;
    };
  }
  /* 石ころ：3〜5 個の小石のかたまり */
  function stoneWriter(nd, buf, slot, sh) {
    const n = 3 + Math.floor(hs(nd.idx, 20) * 3);
    for (let i = 0; i < n; i++) {
      const a = hs(nd.idx, 21 + i) * 6.283, r = 0.05 + hs(nd.idx, 30 + i) * 0.2, s0 = 0.10 + hs(nd.idx, 40 + i) * 0.09;
      put(buf, slot + i, nd.x + Math.cos(a) * r + sh * 0.22, s0 * 0.3, nd.z + Math.sin(a) * r,
        s0 * (0.8 + hs(nd.idx, 50 + i) * 0.6), s0 * 1.0, s0 * (0.8 + hs(nd.idx, 60 + i) * 0.6), hs(nd.idx, 70 + i) * 6.283, (hs(nd.idx, 80 + i) - 0.5) * 0.4, (hs(nd.idx, 90 + i) - 0.5) * 0.4);
    }
    return n;
  }

  /* ---------- 材質：葉のゆれ・樹皮・小石 ---------- */
  function registerTreeWind(mat) {
    if (!B.MaterialPluginBase) return;
    class TreeWind extends B.MaterialPluginBase {
      constructor(m) { super(m, 'TreeWind', 260, { TREEWIND: false }); this._enable(true); }
      prepareDefines(d) { d.TREEWIND = true; }
      getClassName() { return 'TreeWind'; }
      getUniforms() { return { ubo: [{ name: 'treeTime', size: 1, type: 'float' }], vertex: 'uniform float treeTime;' }; }
      bindForSubMesh(ubo) { ubo.updateFloat('treeTime', G.time || 0); }
      getCustomCode(type) {
        if (type !== 'vertex') return null;
        return {
          CUSTOM_VERTEX_UPDATE_WORLDPOS: `
            #ifdef TREEWIND
            {
              float hgt = max(positionUpdated.y, 0.0);
              float wgt = clamp(hgt * 0.07, 0.0, 1.0) * (0.35 + 0.65 * clamp(length(positionUpdated.xz) * 0.3, 0.0, 1.0));
              vec3 base = vec3(finalWorld[3][0], finalWorld[3][1], finalWorld[3][2]);
              float ph = treeTime * 1.1 + base.x * 0.21 + base.z * 0.17;
              float gust = sin(treeTime * 0.45 + base.x * 0.035 + base.z * 0.05) * 0.5 + 0.5;
              float sw = (sin(ph) * 0.5 + sin(ph * 2.3 + hgt * 0.4) * 0.2 + gust * 0.55) * wgt * 0.16;
              float fl = sin(treeTime * 5.3 + dot(positionUpdated, vec3(3.1, 2.3, 1.7))) * 0.025 * wgt;
              worldPos.xyz += vec3(sw * 0.85 + fl, fl * 0.5, sw * 0.4 + fl);
            }
            #endif
`
        };
      }
    }
    new TreeWind(mat);
  }
  /* 樹皮・葉の絵（glTF の UV に合わせて上下を反転しない） */
  const _tt = {};
  function treeTex(file, srgb) {
    if (!_tt[file]) {
      _tt[file] = A.need('assets/tex/' + file).then(ok => new Promise((res, rej) => {
        if (!ok) return rej(new Error(file));
        const t = new B.Texture('assets/tex/' + file, G.scene, false, false, B.Texture.TRILINEAR_SAMPLINGMODE, () => res(t), () => rej(new Error(file)));
        t.gammaSpace = srgb; t.anisotropicFilteringLevel = 4; (S.texList = S.texList || []).push(t);
      }));
      _tt[file].catch(() => { delete _tt[file]; });
    }
    return _tt[file];
  }
  function loadTreeTex() {
    const bark = (c, n, vs) => Promise.all([treeTex(c, true), treeTex(n, false)]).then(a => { a.forEach(t => { t.vScale = vs; }); return { col: a[0], nrm: a[1] }; });
    return Promise.all([treeTex('tree_leaves.webp', true), bark('bark_col.jpg', 'bark_nrm_s.jpg', 0.5), bark('bark2_col.jpg', 'bark2_nrm_s.jpg', 0.8), bark('log_col_s.jpg', 'log_nrm_s.jpg', 1.5)])
      .then(a => { a[0].hasAlpha = true; return { leaf: a[0], barkC: a[1], barkB: a[2], barkD: a[3] }; });
  }

  /* ---------- 組ごとの読み込み ---------- */
  const GROUPS = {
    rocks: ['rock_a', 'rock_b', 'rock_c'], wood: ['stump', 'deadlog'],
    trees: ['tree_pine', 'tree_spruce', 'tree_cottonwood', 'tree_poplar', 'tree_dead'], plants: ['bush', 'twigs'],
    bnodes_n: ['b_n_clay', 'b_n_iron'], bnodes_f: ['b_n_clay_far', 'b_n_iron_far'],   // 粘土・鉄の鉱脈（近く用は高・中、遠く用は全部）
    nodes_f: ['bush_far', 'rock_a_far', 'rock_b_far', 'rock_c_far']   // 草むら・岩の遠く用（全部の画質。近く用の距離より先と、低）
  };
  const loading = {};
  function loadGroup(g) {
    if (loading[g]) return;
    const parts = GROUPS[g].map(n => A.model(n));
    if (g === 'trees') parts.push(loadTreeTex());
    loading[g] = Promise.all(parts).then(ms => {
      GROUPS[g].forEach((n, i) => { S.models[n] = ms[i]; });
      if (g === 'trees') setupTrees(ms[GROUPS.trees.length]);
      /* 岩：ORM の AO（赤）の効きを弱める（高で SSAO と重なって黒くなるため） */
      if (g === 'rocks') ms.slice(0, 3).forEach(arr => arr.forEach(m => { const mt = m.material; if (!mt) return; if (mt.albedoColor) mt.albedoColor = new B.Color3(1.0, 1.0, 1.0); mt.ambientTextureStrength = 0.35; }));
      /* 低木：暗くなりすぎないよう明るく、葉は両面を照らす */
      if (g === 'plants') (S.models.bush || []).forEach(m => { const mt = m.material; if (!mt) return; if (mt.albedoColor) mt.albedoColor = new B.Color3(1.35, 1.35, 1.3); mt.backFaceCulling = false; mt.twoSidedLighting = true; mt.environmentIntensity = 1.4; mt.ambientTextureStrength = 0.3; });
      buildFormsFor(g);
      S.ready[g] = true;
      S.dirty = true;
      if (S.key === 'low' && g !== 'bnodes_f' && g !== 'nodes_f') release();   // 読んでいるあいだに低に下げられた
    }).catch(e => { delete loading[g]; S.ready[g] = false; if (window.console) console.info('[gfx] モデルを読めなかった組:', g, e && e.message); });
  }
  function setupTrees(Tx) {
    const leaf = new B.PBRMaterial('treeLeaf', G.scene);
    leaf.albedoTexture = Tx.leaf; leaf.useAlphaFromAlbedoTexture = true;
    leaf.transparencyMode = B.PBRMaterial.PBRMATERIAL_ALPHATEST; leaf.alphaCutOff = 0.42;
    leaf.backFaceCulling = false; leaf.allowShaderHotSwapping = false; leaf.metallic = 0; leaf.roughness = 0.72; leaf.maxSimultaneousLights = 4;
    leaf.albedoColor = new B.Color3(0.72, 0.76, 0.6); leaf.metallicF0Factor = 0.25; leaf.environmentIntensity = 0.75;
    if (leaf.subSurface) { leaf.subSurface.isTranslucencyEnabled = true; leaf.subSurface.translucencyIntensity = 0.5; leaf.subSurface.tintColor = new B.Color3(0.55, 0.75, 0.25); }
    registerTreeWind(leaf);
    const barkMat = (nm, t) => { const m = new B.PBRMaterial(nm, G.scene); m.albedoTexture = t.col; m.bumpTexture = t.nrm; m.metallic = 0; m.roughness = 0.92; m.maxSimultaneousLights = 4; return m; };
    const bm = { tree_pine: barkMat('treeBarkC', Tx.barkC), tree_cottonwood: barkMat('treeBarkB', Tx.barkB), tree_dead: barkMat('treeBarkD', Tx.barkD) };
    bm.tree_spruce = bm.tree_pine; bm.tree_poplar = bm.tree_cottonwood;
    bm.tree_dead.albedoColor = new B.Color3(1.15, 1.1, 1.05);
    S.treeMats = [leaf].concat(Object.keys(bm).map(k => bm[k]));
    S.treeParts = {};
    GROUPS.trees.forEach(nm => {
      const o = {};
      (S.models[nm] || []).forEach(m => {
        const key = m.name.replace(/[^a-z0-9]/g, '').slice(0, 5);   // wood0 / leaf0 / wood1 / leaf1
        if (m.material && m.material !== leaf) m.material.dispose();
        m.material = key.indexOf('leaf') === 0 ? leaf : bm[nm];
        o[key] = m;
      });
      S.treeParts[nm] = o;
    });
  }
  /* 読めた組から、入れ物を作る */
  function buildFormsFor(g) {
    const nT = countOf('tree');
    if (g === 'trees') {
      GROUPS.trees.forEach(nm => {
        const o = S.treeParts[nm];
        [0, 1].forEach(l => {
          const ms = [o['wood' + l], o['leaf' + l]].filter(Boolean);
          if (ms.length) makeForm(nm + ':' + l, ms, () => countOf('tree'), treeWriter(nm), { shadow: true });
        });
      });
    } else if (g === 'rocks') {
      const nR = countOf('rock'), rr = MZ.NODES.rock.r;
      ['rock_a', 'rock_b', 'rock_c'].forEach(nm => { const ms = S.models[nm]; if (ms && ms.length) makeForm(nm, ms, () => countOf('rock'), rockWriter(ms[0], rr), { shadow: true }); });
      /* 鉄の鉱脈（モデル待ち）：rock_b を複製してさび色に。コードの鉱石の粒を足す */
      const rb = S.models.rock_b;
      if (rb && rb.length) {
        const m0 = rb[0].clone('ironRock');
        const mt = rb[0].material.clone('ironRockMat');
        if (mt.albedoColor) mt.albedoColor = new B.Color3(1.15, 0.78, 0.6);
        m0.material = mt;
        const ore = MZ.getModel('ironOre');
        const w0 = rockWriter(rb[0], MZ.NODES.iron.r);
        makeForm('iron', [m0, ore], () => countOf('iron'), (nd, buf, slot, sh) => {
          w0(nd, buf, slot, sh);
          put(buf, slot, nd.x + sh * 0.22, 0.25, nd.z, nd.s * 1.05, nd.s * 1.05, nd.s * 1.05, nd.ry, 0, 0);
          return 1;
        }, { shadow: true });
      }
    } else if (g === 'nodes_f') {
      /* 草むらの遠く用（交差した板）と、岩の遠く用（rock_a_far・rock_b_far・rock_c_far）。大きさは近く用と同じ決まりで合わせる */
      const bf = S.models.bush_far, rr = MZ.NODES.rock.r;
      if (bf && bf.length) {
        /* 板は表と裏を別の面で持っている（片面表示のまま。両面にすると二重に描かれる）。
           法線が上向きで日と空の光をまともに受け、近く用（細い枝の陰が多い）より白っぽく見えるので、色を落とす */
        bf.forEach(m => { const mt = m.material; if (!mt || mt._mzBushF) return; mt._mzBushF = true; if (mt.albedoColor) mt.albedoColor = new B.Color3(0.36, 0.36, 0.28); mt.environmentIntensity = 0.7; mt.specularIntensity = 0; });
        /* 近く用は最初の部品（wild_rooibos_bush_b の 1 つめ。横 0.358m）の大きさで合わせているので、遠く用も同じ数で合わせる（同じ m 単位で作ってある） */
        makeForm('bushF', bf, () => countOf('bush'), bushWriter(bf[0], 0.358 / 0.82));   // 板は葉が詰まって見えるぶん、少し小さく
      }
      ['a', 'b', 'c'].forEach(v => { const ms = S.models['rock_' + v + '_far']; if (ms && ms.length) makeForm('rockF' + v, ms, () => countOf('rock'), rockWriter(ms[0], rr), { shadow: true }); });
    } else if (g === 'bnodes_n' || g === 'bnodes_f') {
      const sfx = g === 'bnodes_n' ? 'N' : 'F', nm = g === 'bnodes_n' ? ['b_n_clay', 'b_n_iron'] : ['b_n_clay_far', 'b_n_iron_far'];
      [['clay', nm[0]], ['iron', nm[1]]].forEach(a => { const ms = S.models[a[1]]; if (ms && ms.length) makeForm(a[0] + sfx, ms, () => countOf(a[0]), plain, { shadow: sfx === 'N' }); });
    } else if (g === 'wood') {
      const st = S.models.stump, dl = S.models.deadlog;
      if (st && st.length) {
        const e = sizeOf(st[0]);
        makeForm('stump', st, () => countOf('tree'), (nd, buf, slot) => {
          const s = 0.6 + hs(nd.idx, 12) * 0.2, k = s * 1.0;
          put(buf, slot, nd.x, 0.04, nd.z, k, k * (0.9 + hs(nd.idx, 13) * 0.25), k, hs(nd.idx, 14) * 6.283, 0, 0); return 1;
        }, { shadow: true });
        S.stumpExt = Math.max(e.x, e.z);
      }
      if (dl && dl.length) makeDecor('deadlog', dl, () => S.decor.nLog, 'log', true);
    } else if (g === 'plants') {
      const bs = S.models.bush, tw = S.models.twigs;
      if (bs && bs.length) makeForm('bush', bs, () => countOf('bush'), bushWriter(bs[0]));
      if (tw && tw.length) makeDecor('twigs', tw, () => S.decor.nTwigs, 'twigs', false);
    }
  }

  /* ---------- 飾り（採れない・当たりなし）：区画ごとに 倒木 12・枯れ枝 40・小石 1800。種は T.seed + 77（"0,0"）と、T.seed + 77 と区画のキー ---------- */
  /* "0,0" の乱数 r() の順・回数は今までと同じ（区画 "0,0" は中心が原点なので、座標の足しこみも 0）。ほかの区画は、同じ数・同じ決まり
     （区画の中の 3〜116 のマス・採れる物のマスをよける）で、区画の中心まわりに作る */
  const CHS = N * C;   // 区画の一辺（m）
  function hashStr(k) { let h = 2166136261; for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function buildDecorChunk(key, nodes) {
    const m = /^(-?\d+),(-?\d+)$/.exec(key), cx = +m[1], cz = +m[2], ox = cx * CHS, oz = cz * CHS, home = key === '0,0';
    const r = rng(home ? T.seed + 77 : ((T.seed + 77) ^ hashStr(key)) >>> 0), W = MZ.world, lim = 3;
    const free = (x, z) => {
      if (home && Math.hypot(x, z) < 6) return false;                  // 小屋のまわり 6m
      const gx = MZ.cellOf(x), gz = MZ.cellOf(z), lx = gx - cx * N, lz = gz - cz * N;
      if (lx < lim || lz < lim || lx >= N - lim || lz >= N - lim) return false;
      return W.cellNode[MZ.ci(gx, gz)] < 0;                              // 採れる物のマス
    };
    const pick = (n, dist, f) => {
      const out = []; let tries = 0;
      while (out.length < n && tries++ < n * 40) {
        const x = ox + (r() * 2 - 1) * (T.half - 8), z = oz + (r() * 2 - 1) * (T.half - 8);
        if (free(x, z)) out.push(f(x, z));
      }
      return out;
    };
    const D = { key, cx: ox, cz: oz, log: [], twigs: [], pebbles: [] };   // cx・cz は区画の中心の座標（m）
    D.log = pick(12, 0, (x, z) => ({ x, z, yaw: r() * 6.283, s: 0.9 + r() * 0.35 }));
    /* 枯れ枝は、その区画の草むら（低木）のまわりに */
    const bushes = nodes.filter(nd => nd.k === 'bush' && nd.ck === key);
    let t = 0;
    while (D.twigs.length < 40 && t++ < 800 && bushes.length) {
      const b = bushes[Math.floor(r() * bushes.length)], a = r() * 6.283, d = 0.8 + r() * 1.0, x = b.x + Math.cos(a) * d, z = b.z + Math.sin(a) * d;
      if (free(x, z)) D.twigs.push({ x, z, yaw: r() * 6.283, s: 0.8 + r() * 0.5 });
    }
    D.pebbles = pick(1800, 0, (x, z) => ({ x, z, yaw: r() * 6.283, s: 0.008 + Math.pow(r(), 3) * 0.04, ax: (r() - 0.5) * 0.4, az: (r() - 0.5) * 0.4, kx: 0.8 + r() * 0.6, kz: 0.8 + r() * 0.6 }));
    return D;
  }
  /* 持っている区画ぜんぶ。入れ物の大きさ：倒木・枯れ枝は全区画の合計、小石は 1 区画ぶん（描くのは近い区画から、入れ物の数まで） */
  function buildDecor(nodes) {
    const D = { chunks: [], nLog: 0, nTwigs: 0, nPebbles: 1800 };
    MZ.world.landKeys.forEach(key => { const c = buildDecorChunk(key, nodes); D.chunks.push(c); D.nLog += c.log.length; D.nTwigs += c.twigs.length; });
    return D;
  }
  const dcol = {};
  function makeDecor(id, meshes, cap, which, shadow) {
    const e = sizeOf(meshes[0]), alongX = e.x >= e.z;
    const f = makeForm(id, meshes, cap, null, { shadow });
    f.which = which; f.alongX = alongX; f.len = Math.max(e.x, e.z);   // which：S.decor.chunks[i] の中の一覧の名前（log・twigs・pebbles）
    f.write = (p, buf, slot) => {
      if (id === 'pebble') put(buf, slot, p.x, -p.s * 0.25, p.z, p.s * p.kx, p.s, p.s * p.kz, p.yaw, p.ax, p.az);
      else put(buf, slot, p.x, 0.02, p.z, p.s, p.s, p.s, p.yaw + (id === 'deadlog' && !alongX ? Math.PI / 2 : 0), 0, 0);
      return 1;
    };
    return f;
  }

  /* 小石の元（コードで作った小石。写真の質感を貼る）。画質「低」でも小石の飾りに使う */
  function buildPebble() {
    const vd = B.VertexData.CreateIcoSphere({ radius: 1, subdivisions: 2, flat: false });
    const P = Array.from(vd.positions);
    for (let k = 0; k < P.length; k += 3) {
      const x = P[k], y = P[k + 1], z = P[k + 2], n = fbm3(x * 1.6 + 3, y * 1.6, z * 1.6, 81, 3), r = 0.8 + n * 0.5;
      P[k] = x * r; P[k + 1] = Math.max(y * r * 0.6, -0.15); P[k + 2] = z * r;
    }
    const Nn = []; B.VertexData.ComputeNormals(P, vd.indices, Nn);
    const mk = name => { const mm = new B.Mesh(name, G.scene), v2 = new B.VertexData(); v2.positions = P; v2.indices = vd.indices; v2.normals = Nn; v2.uvs = vd.uvs; v2.applyToMesh(mm); return mm; };
    const m = mk('pebble'); S.pebbleMk = mk;
    const pm = new B.PBRMaterial('pebbleMat', G.scene);
    pm.metallic = 0; pm.roughness = 0.9; pm.albedoColor = lin('#9A9388'); pm.maxSimultaneousLights = 4;
    m.material = pm; S.pebble = m; S.pebbleMat = pm;
    return m;
  }
  function setStone(set) {
    const pm = S.pebbleMat; if (!pm) return;
    if (set) G.photo.setMatTex(pm, G.photo.view(set.col, 0.6, 0.6), G.photo.view(set.nrm, 0.6, 0.6), G.photo.view(set.orm, 0.6, 0.6), lin('#8C857A').scale(1.25), true);
    else { pm.albedoTexture = null; pm.bumpTexture = null; pm.metallicTexture = null; pm.albedoColor = lin('#8C857A'); }
  }
  /* 粘土（モデル待ち）：今の形に farm の写真を赤茶に色付けして貼る */
  function setClay(set) {
    if (!S.clayMat) return;
    const pm = S.clayMat;
    if (set) G.photo.setMatTex(pm, G.photo.view(set.col, 1, 1), G.photo.view(set.nrm, 1, 1), G.photo.view(set.orm, 1, 1), new B.Color3(2.2, 1.0, 0.7), true);
    else { pm.albedoTexture = null; pm.bumpTexture = null; pm.metallicTexture = null; pm.albedoColor = lin('#A9684A'); }
  }

  /* ---------- 並べ直し ---------- */
  const modelsOn = g => !!(G.Q[S.key].models.indexOf(g) >= 0 && S.ready[g]);
  const treeType = idx => { const r = hs(idx, 11) * 11; return r < 3 ? 'tree_pine' : r < 5 ? 'tree_spruce' : r < 7 ? 'tree_cottonwood' : r < 9 ? 'tree_poplar' : 'tree_dead'; };
  S.treeType = treeType;
  const codeForm = k => {
    const id = 'code:' + k;
    return S.forms[id] || makeForm(id, [MZ.getModel(k)], () => countOf(k === 'tree2' ? 'tree' : k), plain);
  };
  function formFor(nd, d, q) {
    switch (nd.k) {
      case 'tree': {
        if (modelsOn('trees') && d < q.treeLod[1]) {
          const f = S.forms[treeType(nd.idx) + ':' + (d < q.treeLod[0] * G.dyn.treeF ? 0 : 1)];
          if (f) return f;
        }
        return codeForm(nd.g.vi ? 'tree2' : 'tree');
      }
      case 'rock': {
        const r = hs(nd.idx, 15), v = r < 0.34 ? 'a' : r < 0.67 ? 'b' : 'c';
        if (modelsOn('rocks') && d < q.rockDist && S.forms['rock_' + v]) return S.forms['rock_' + v];
        return (S.ready.nodes_f && S.forms['rockF' + v]) || codeForm('rock');
      }
      case 'bush': return (modelsOn('plants') && q.bushDist && d < q.bushDist && S.forms.bush) || (S.ready.nodes_f && S.forms.bushF) || codeForm('bush');
      case 'stone': return d > q.decorDist ? null : ((S.key !== 'low' && S.forms.stones) || codeForm('stone'));   // 石ころは近くだけ（遠くでは出さない）
      case 'clay': return (S.ready.bnodes_n && S.key !== 'low' && d < q.rockDist && S.forms.clayN) || (S.ready.bnodes_f && S.forms.clayF) || (S.key !== 'low' && S.forms.clayhd) || codeForm('clay');
      case 'iron': return (S.ready.bnodes_n && S.key !== 'low' && d < q.rockDist && S.forms.ironN) || (S.ready.bnodes_f && S.forms.ironF) || (modelsOn('rocks') && d < q.rockDist * 1.5 && S.forms.iron) || codeForm('iron');
    }
    return codeForm(nd.k);
  }
  /* たたいたあとの 0.25 秒のゆれ（ラジアン。木は上ほど大きく、岩などは約 1cm 横へ） */
  const shakeVal = nd => (nd.shake > 0 ? 0.045 * (nd.shake / 0.25) * Math.sin(nd.shake * 60) : 0);

  function layout() {
    const q = G.Q[S.key], px = MZ.state.player.x, pz = MZ.state.player.z, W = MZ.world;
    Object.keys(S.forms).forEach(id => { S.forms[id].n = 0; });
    for (let i = 0; i < S.nodes.length; i++) {
      const nd = S.nodes[i];
      nd.look = null;
      /* 見えなくなる距離（nodeFar）より遠い物は、どの入れ物にも入れない（切り株も） */
      if (Math.abs(nd.x - px) > q.nodeFar || Math.abs(nd.z - pz) > q.nodeFar || Math.hypot(nd.x - px, nd.z - pz) > q.nodeFar) continue;
      if (!W.nodeActive(nd.idx)) {
        /* 切った木のあとに切り株（高・中）。建物の下で二度と出ない所（-1）には出さない */
        if (nd.k === 'tree' && W.takenOf(nd.idx) >= 0 && modelsOn('wood') && S.forms.stump) { const f = S.forms.stump; f.write(nd, f.buf, f.n, 0); f.n++; }
        continue;
      }
      const f = formFor(nd, Math.hypot(nd.x - px, nd.z - pz), q);
      if (!f) continue;
      const slot = f.n;
      const n = f.write(nd, f.buf, slot, shakeVal(nd));
      f.n += n; nd.look = { form: f, slot, n };
    }
    /* 飾り：主人公に近いものだけ。建物の下は出さない。区画ごとの一覧を、主人公に近い区画から順に、距離の内の物を入れ物の数まで入れる */
    const order = S.decorOrder; order.length = 0;
    S.decor.chunks.forEach(c => { c.d = Math.hypot(c.cx - px, c.cz - pz); order.push(c); });
    order.sort((a, b) => a.d - b.d);
    ['deadlog', 'twigs', 'pebble'].forEach(id => {
      const f = S.forms[id]; if (!f) return;
      const on = id === 'pebble' ? true : modelsOn(id === 'deadlog' ? 'wood' : 'plants');
      if (!on) return;
      const dist = id === 'pebble' ? q.decorDist * 0.5 : q.decorDist, lim = id === 'pebble' ? Math.round(q.pebbles) : 1e9;
      for (let ci = 0; ci < order.length && f.n < f.cap; ci++) {
        const ch = order[ci], list = ch[f.which];
        if (Math.abs(ch.cx - px) > CHS / 2 + dist || Math.abs(ch.cz - pz) > CHS / 2 + dist) continue;   // 区画ごと遠ければ見ない
        for (let i = 0; i < list.length && i < lim && f.n < f.cap; i++) {
          const p = list[i];
          if (Math.abs(p.x - px) > dist || Math.abs(p.z - pz) > dist || Math.hypot(p.x - px, p.z - pz) > dist) continue;
          if (W.owner[MZ.ci(MZ.cellOf(p.x), MZ.cellOf(p.z))]) continue;
          f.write(p, f.buf, f.n, 0); f.n++;
        }
      }
    });
    Object.keys(S.forms).forEach(id => flushForm(S.forms[id]));
    S.lx = px; S.lz = pz; S.dirty = false; S.acc = 0;
  }

  /* ---------- 呼ばれる側 ---------- */
  function init(nodes) {
    S.nodes = nodes; S.forms = {}; S.ready = {}; S.shaking = [];
    S.treeCount = countOf('tree');
    S.decor = buildDecor(nodes);
    buildPebble();
    /* 石ころ（かたまり）・小石の飾り。粘土（写真貼り）。モデルが要らないので、いつでも作れる */
    makeForm('stones', [S.pebbleMk('stoneCl')], () => countOf('stone'), stoneWriter, { per: 5 });
    S.forms.stones.meshes[0].material = S.pebbleMat;
    makeDecor('pebble', [S.pebble], () => S.decor.nPebbles, 'pebbles', false);
    const cm = MZ.getModel('clay').clone('clayHd');
    S.clayMat = new B.PBRMaterial('clayHdMat', G.scene); S.clayMat.metallic = 0; S.clayMat.roughness = 0.95; S.clayMat.albedoColor = lin('#A9684A'); S.clayMat.maxSimultaneousLights = 4;
    cm.material = S.clayMat; cm.useVertexColors = false;
    makeForm('clayhd', [cm], () => countOf('clay'), plain);
    /* 飾りの元の形（モデルが読めないときでも、小石は出る） */
    S.dirty = true;
  }
  /* 画質を「低」に下げたとき、採れる物の GLB（木・岩・切り株・低木・粘土・鉄の近く用）を片づける。遠く用（bnodes_f）とコードの形は残す。
     高・中にもどしたら、また読む（loading と A のキャッシュを消してあるので） */
  const REL = /^(tree_|rock_|stump$|deadlog$|bush$|twigs$|iron$|clayN$|ironN$)/;
  function release() {
    S.nodes.forEach(nd => { nd.look = null; });
    Object.keys(S.forms).forEach(id => {
      if (!REL.test(id)) return;
      S.forms[id].meshes.forEach(m => {
        try {
          if (id === 'iron') { if (m.name === 'ironRock') { if (m.material) m.material.dispose(); m.dispose(false, false); } else m.setEnabled(false); }   // コードの鉱石の粒は共有なので残す
          else m.dispose(false, false);
        } catch (_) { /* 済み */ }
      });
      delete S.forms[id];
    });
    ['rocks', 'wood', 'trees', 'plants', 'bnodes_n'].forEach(g => {
      GROUPS[g].forEach(n => { (S.models[n] || []).forEach(m => { try { m.dispose(false, true); } catch (_) { /* 済み */ } }); delete S.models[n]; A.forget2(n); });
      S.ready[g] = false; delete loading[g];
    });
    (S.treeMats || []).forEach(m => { try { m.dispose(false, false); } catch (_) { /* 済み */ } }); S.treeMats = null; S.treeParts = null;
    (S.texList || []).forEach(t => { try { t.dispose(); } catch (_) { /* 済み */ } }); S.texList = [];
    Object.keys(_tt).forEach(k => delete _tt[k]);
    S.dirty = true;
  }
  /* 画質を中 → 高に上げたとき、粘土・鉄の鉱脈の近く用を、高の写真で読み直す（遠く用はそのまま） */
  function reloadNear() {
    ['clayN', 'ironN'].forEach(id => { const f = S.forms[id]; if (!f) return; f.meshes.forEach(m => { try { m.dispose(false, false); } catch (_) { /* 済み */ } }); delete S.forms[id]; });
    S.nodes.forEach(nd => { nd.look = null; });
    GROUPS.bnodes_n.forEach(n => { (S.models[n] || []).forEach(m => { try { m.dispose(false, true); } catch (_) { /* 済み */ } }); delete S.models[n]; A.forget2(n); });
    S.ready.bnodes_n = false; delete loading.bnodes_n; S.dirty = true;
    if (S.key !== 'low') loadGroup('bnodes_n');
  }
  function apply(key) {
    S.key = key;
    const q = G.Q[key];
    ['rocks', 'wood', 'trees', 'plants'].forEach(g => { if (q.models.indexOf(g) >= 0) loadGroup(g); });
    loadGroup('bnodes_f'); loadGroup('nodes_f');
    if (q.models.indexOf('rocks') >= 0) loadGroup('bnodes_n');
    /* 画質が変わったら、粘土・小石の写真の貼りかえは photo.js が呼ぶ */
    if (key === 'low') release();
    S.dirty = true; S.flushNow = true;
  }
  /* 採れた・また出た（world.js から）。消えるときはすぐ見えなくする */
  function show(idx, vis) {
    const nd = S.nodes[idx];
    if (!vis && nd.look) {
      const f = nd.look.form;
      for (let i = 0; i < nd.look.n; i++) zero(f.buf, nd.look.slot + i);
      touchForm(f); nd.look = null;
    }
    nd.shake = 0;
    S.dirty = true;
  }
  function hit(idx) {
    const nd = S.nodes[idx]; if (!nd || !nd.look) return;
    nd.shake = 0.25;
    if (S.shaking.indexOf(nd) < 0) S.shaking.push(nd);
  }
  function dirty() { S.dirty = true; }
  /* 土地を広げて採れる物がふえたあと（W.nodes の後ろに足した後）：飾りを区画ごとに作り直し、入れ物が足りなければ大きくする。
     メッシュ・材質・写真は片づけず使い回す（入れ物のバッファだけ差しかえる）。いまの画質の並べ直しは update が行う */
  function rebuild(nodes) {
    S.nodes = nodes; S.shaking = [];
    nodes.forEach(nd => { nd.look = null; });
    S.treeCount = countOf('tree');
    S.decor = buildDecor(nodes);
    Object.keys(S.forms).forEach(id => growForm(S.forms[id]));
    S.dirty = true; S.flushNow = true;
  }
  /* すぐ並べ直す（読み直したとき・テストから） */
  function flush() { if (MZ.state) layout(); }
  function update(dt, px, pz) {
    if (!S.nodes.length || !MZ.state) return;
    S.acc += dt;
    /* ゆれ：ゆれている物だけ、行列を書きなおす */
    for (let i = S.shaking.length - 1; i >= 0; i--) {
      const nd = S.shaking[i];
      nd.shake -= dt;
      if (!nd.look || !MZ.world.nodeActive(nd.idx)) { nd.shake = 0; S.shaking.splice(i, 1); continue; }
      const L = nd.look;
      L.form.write(nd, L.form.buf, L.slot, shakeVal(nd));
      touchForm(L.form);
      if (nd.shake <= 0) S.shaking.splice(i, 1);
    }
    const moved = Math.hypot(px - S.lx, pz - S.lz) >= 4;
    if ((S.dirty || moved) && (S.acc >= 0.25 || S.flushNow)) { S.flushNow = false; layout(); }
  }
  function stats() {
    const o = {}; Object.keys(S.forms).forEach(id => { if (S.forms[id].n) o[id] = S.forms[id].n; });
    return o;
  }
  G.nodes = { init, rebuild, apply, release, reloadNear, show, hit, dirty, flush, update, stats, setStone, setClay, state: S };
})();

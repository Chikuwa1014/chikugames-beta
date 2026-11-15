/* 荒野開拓記（仮） — 描画の層：資産（写真の質感・空の表・.glb）の一覧と読み込み
   - MANIFEST に書いた組だけを読む。モデルを足すときは、assets/models/ にファイルを置き、MANIFEST に 1 行足す（下の「建物」）。
   - まず fetch で取りに行って進み具合を数え（タイトル画面の「準備中 n／m」）、そのあと Babylon が同じ URL を読む（キャッシュが効く）。
   - 1 ファイルの待ち時間の上限は 20 秒。読めなかった組は、使う側がコードの形のまま進む。
   - data URI と .txt はやめた（公開先が .glb を配れる）。 */
(function () {
  const MZ = window.MZ, B = BABYLON, G = MZ.gfx;
  const TIMEOUT = 20000;

  const T = 'assets/tex/', M = 'assets/models/';
  /* 組：{ id, tiers（どの画質で読むか）, files（画質ごとの一覧を返す関数、または配列）, required（タイトルの「はじめる」を待たせる） } */
  const photo = (n, colOnly) => tier => {
    if (tier === 'low') return [T + n + '_col_s.jpg'];
    if (colOnly) return [T + n + '_col.jpg'];
    return tier === 'high' ? [T + n + '_col.jpg', T + n + '_nrm.jpg', T + n + '_orm.jpg'] : [T + n + '_col.jpg', T + n + '_nrm_s.jpg'];
  };
  G.MANIFEST = [
    /* 必須：空の表・空のドーム・地面の写真（土・道・畑） */
    { id: 'sky', required: true, tiers: ['high', 'mid', 'low'], files: [T + 'sky_ibl.png', T + 'sky.jpg'] },
    { id: 'ground', required: true, tiers: ['high', 'mid', 'low'], files: photo('ground') },
    { id: 'path', required: true, tiers: ['high', 'mid', 'low'], files: photo('path', true) },
    { id: 'farm', required: true, tiers: ['high', 'mid', 'low'], files: photo('farm') },
    { id: 'stone', required: false, tiers: ['high', 'mid', 'low'], files: photo('stone') },
    /* 採れる物（木・岩・切り株・倒木・低木・枯れ枝）。低は読まない */
    { id: 'treetex', required: false, tiers: ['high', 'mid'], files: [T + 'tree_leaves.webp', T + 'bark_col.jpg', T + 'bark_nrm_s.jpg', T + 'bark2_col.jpg', T + 'bark2_nrm_s.jpg', T + 'log_col_s.jpg', T + 'log_nrm_s.jpg'] },
    { id: 'rocks', required: false, tiers: ['high', 'mid'], models: ['rock_a', 'rock_b', 'rock_c'] },
    { id: 'wood', required: false, tiers: ['high', 'mid'], models: ['stump', 'deadlog'] },
    { id: 'trees', required: false, tiers: ['high', 'mid'], models: ['tree_pine', 'tree_spruce', 'tree_cottonwood', 'tree_poplar', 'tree_dead'] },
    { id: 'plants', required: false, tiers: ['high'], models: ['bush', 'twigs'] },
    /* 建物・人・道具（Blender のモデルが届いたら、ここに 1 行ずつ足す。近く用 b_<種類>.glb と遠く用 b_<種類>_far.glb）。
       いまあるのは作業台（仮に近く用として使う。20000 三角形以下に軽くしたものが来たら差しかえる） */
    { id: 'b_bench', required: false, tiers: ['high', 'mid'], models: ['workbench'] },
    { id: 'b_hut', required: false, tiers: ['high', 'mid'], models: ['b_hut'] },
    { id: 'b_hut_far', required: false, tiers: ['high', 'mid', 'low'], models: ['b_hut_far'] },
    { id: 'b_house', required: false, tiers: ['high', 'mid'], models: ['b_house'] },
    { id: 'b_house_far', required: false, tiers: ['high', 'mid', 'low'], models: ['b_house_far'] },
    { id: 'b_well', required: false, tiers: ['high', 'mid'], models: ['b_well'] },
    { id: 'b_well_far', required: false, tiers: ['high', 'mid', 'low'], models: ['b_well_far'] },
    { id: 'b_fire', required: false, tiers: ['high', 'mid'], models: ['b_fire'] },
    { id: 'b_fire_far', required: false, tiers: ['high', 'mid', 'low'], models: ['b_fire_far'] },
    { id: 'b_kiln', required: false, tiers: ['high', 'mid'], models: ['b_kiln'] },
    { id: 'b_kiln_far', required: false, tiers: ['high', 'mid', 'low'], models: ['b_kiln_far'] },
    { id: 'b_furnace', required: false, tiers: ['high', 'mid'], models: ['b_furnace'] },
    { id: 'b_furnace_far', required: false, tiers: ['high', 'mid', 'low'], models: ['b_furnace_far'] }
  ];
  /* 建物の見た目の対応：種類 → { near, far, fix }。fix はモデルの向き・大きさの直し（yaw はラジアン）。
     ファイルを置いたら、上の MANIFEST に組を足し、ここに 1 行足す。足りない物はコードの形（models.js）になる */
  G.BUILD_MODELS = {
    bench: { near: 'workbench', far: null, fix: { yaw: 0 } },
    hut: { near: 'b_hut', far: 'b_hut_far', fix: {} },
    house: { near: 'b_house', far: 'b_house_far', fix: {} },
    well: { near: 'b_well', far: 'b_well_far', fix: {} },
    fire: { near: 'b_fire', far: 'b_fire_far', fix: {} },
    kiln: { near: 'b_kiln', far: 'b_kiln_far', fix: {} },
    furnace: { near: 'b_furnace', far: 'b_furnace_far', fix: {} }
  };

  const A = G.assets = { done: 0, total: 0, failed: [], okMap: {}, started: {}, onProgress: null, tierAsked: {} };
  const P = {};   // path → Promise<boolean>

  function progress() { if (A.onProgress) A.onProgress(A.done, A.total); }
  /* 1 ファイルを取りに行く。届いたら true、読めない・遅いなら false */
  function need(path) {
    if (P[path]) return P[path];
    A.total++; progress();
    P[path] = new Promise(res => {
      let fin = false;
      const end = ok => {
        if (fin) return; fin = true;
        A.done++; A.okMap[path] = ok; if (!ok) A.failed.push(path);
        progress(); res(ok);
      };
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const to = setTimeout(() => { if (ac) ac.abort(); end(false); }, TIMEOUT);
      try {
        fetch(path, ac ? { signal: ac.signal } : undefined)
          .then(r => { if (!r.ok) throw new Error(path + ' ' + r.status); return r.arrayBuffer(); })
          .then(() => { clearTimeout(to); end(true); })
          .catch(() => { clearTimeout(to); end(false); });
      } catch (e) { clearTimeout(to); end(false); }
    });
    return P[path];
  }
  A.need = need;
  A.has = path => A.okMap[path] === true;

  const filesOf = (g, tier) => {
    let f = typeof g.files === 'function' ? g.files(tier) : (g.files || []);
    f = f.slice();
    (g.models || []).forEach(n => f.push(M + n + '.glb'));
    return f;
  };
  A.groupFiles = filesOf;
  A.groupsFor = tier => G.MANIFEST.filter(g => g.tiers.indexOf(tier) >= 0);
  /* 画質に必要な組を取りに行く（足りない分だけ）。必須がそろったら解決する Promise を返す */
  A.loadTier = function (tier) {
    const gs = A.groupsFor(tier), req = [];
    gs.forEach(g => { const ps = filesOf(g, tier).map(need); if (g.required) req.push(...ps); });
    return Promise.all(req);
  };
  A.requiredDone = function (tier) {
    return A.groupsFor(tier).every(g => !g.required || filesOf(g, tier).every(p => p in A.okMap));
  };
  /* ある組がそろって読めたか（1 つでも読めなかったら false） */
  A.groupOk = (g, tier) => filesOf(typeof g === 'string' ? G.MANIFEST.find(x => x.id === g) : g, tier).every(A.has);

  /* ---------- .glb の読み込み ---------- */
  const loaderOk = () => !!(B.SceneLoader && B.SceneLoader.ImportMeshAsync && B.SceneLoader.IsPluginForExtensionAvailable && B.SceneLoader.IsPluginForExtensionAvailable('.glb'));
  A.loaderOk = loaderOk;
  const MP = {};
  /* 名前 → 作り直して元にしたメッシュの配列（非表示）。読めなければ reject。opt.raw が true なら、焼きこまずに結果をそのまま返す */
  A.model = function (name, opt) {
    const raw = !!(opt && opt.raw), k = name + (raw ? ':raw' : '');
    if (MP[k]) return MP[k];
    MP[k] = need(M + name + '.glb').then(ok => {
      if (!ok) throw new Error('読めない ' + name);
      if (!loaderOk()) throw new Error('loaders がない');
      return B.SceneLoader.ImportMeshAsync('', M, name + '.glb', G.scene);
    }).then(res => {
      if (raw) return res;
      const out = [];
      res.meshes.forEach(m => {
        if (!m.getTotalIndices || !m.getTotalIndices()) return;
        m.setParent(null);
        m.bakeCurrentTransformIntoVertices();   // glTF の右手系→左手系の変換ごと頂点に焼く（thin instance の行列＝そのまま世界の位置）
        m.isPickable = false; m.receiveShadows = true;
        m.setEnabled(false);
        const mt = m.material;
        if (mt && mt.getClassName && mt.getClassName() === 'PBRMaterial') mt.maxSimultaneousLights = 4;
        out.push(m);
      });
      res.meshes.forEach(m => { if (out.indexOf(m) < 0) m.dispose(); });
      out.forEach(m => m.refreshBoundingInfo());
      return out;
    });
    MP[k].catch(() => {});
    return MP[k];
  };
})();

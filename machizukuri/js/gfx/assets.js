/* 荒野開拓記（仮） — 描画の層：資産（写真の質感・空の表・.glb）の一覧と読み込み
   - MANIFEST に書いた組だけを読む。モデルを足すときは、assets/models/ にファイルを置き、MANIFEST に 1 行足す（下の「建物」）。
   - まず fetch で取りに行って進み具合を数え（タイトル画面の「準備中 n／m」）、そのあと Babylon が同じ URL を読む（キャッシュが効く）。
   - 同時に読むのは 5 本までの待ち行列（必須 → 木・岩 → 建物 → 人 → 道具・低木の順）。20 秒間ひとつも届かないと打ち切り、失敗は 3 秒後・8 秒後に読み直す。
     それでも読めなかった組は、使う側がコードの形のまま進む。画質を変えたとき（loadTier）に、読めなかったファイルは取りに行き直す。
   - data URI と .txt はやめた（公開先が .glb を配れる）。 */
(function () {
  const MZ = window.MZ, B = BABYLON, G = MZ.gfx;

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
    { id: 'plants', required: false, tiers: ['high', 'mid'], models: ['bush', 'twigs'] },
    /* 建物・人・道具（Blender のモデルが届いたら、ここに 1 行ずつ足す。近く用 b_<種類>.glb と遠く用 b_<種類>_far.glb）。
       作業台・小屋・木の家・井戸・たき火・かまど・炉・畑・きこり小屋・れんがの家が届いている（人・道具はまだ） */
    { id: 'b_bench', required: false, tiers: ['high', 'mid'], models: ['b_bench'] },
    { id: 'b_bench_far', required: false, tiers: ['high', 'mid', 'low'], models: ['b_bench_far'] },
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
    { id: 'b_furnace_far', required: false, tiers: ['high', 'mid', 'low'], models: ['b_furnace_far'] },
    { id: 'b_field', required: false, tiers: ['high', 'mid'], models: ['b_field'] },
    { id: 'b_field_far', required: false, tiers: ['high', 'mid', 'low'], models: ['b_field_far'] },
    { id: 'b_lumber', required: false, tiers: ['high', 'mid'], models: ['b_lumber'] },
    { id: 'b_lumber_far', required: false, tiers: ['high', 'mid', 'low'], models: ['b_lumber_far'] },
    { id: 'b_bhouse', required: false, tiers: ['high', 'mid'], models: ['b_bhouse'] },
    { id: 'b_bhouse_far', required: false, tiers: ['high', 'mid', 'low'], models: ['b_bhouse_far'] },
    /* 主人公・住民・道具・採れる物（第 3 弾）。人と採れる物は近く用（高・中）と遠く用（全部）、道具は近く用だけ（低はコードの形） */
    { id: 'b_player', required: false, tiers: ['high', 'mid'], models: ['b_player'] },
    { id: 'b_player_far', required: false, tiers: ['high', 'mid', 'low'], models: ['b_player_far'] },
    { id: 'b_person', required: false, tiers: ['high', 'mid'], models: ['b_person_a', 'b_person_b', 'b_person_c'] },
    { id: 'b_person_far', required: false, tiers: ['high', 'mid', 'low'], models: ['b_person_a_far', 'b_person_b_far', 'b_person_c_far'] },
    { id: 'b_tools', required: false, tiers: ['high', 'mid'], models: ['b_tool_axe1', 'b_tool_axe2', 'b_tool_axe3', 'b_tool_pick1', 'b_tool_pick2', 'b_tool_pick3'] },
    { id: 'b_nodes', required: false, tiers: ['high', 'mid'], models: ['b_n_clay', 'b_n_iron'] },
    { id: 'b_nodes_far', required: false, tiers: ['high', 'mid', 'low'], models: ['b_n_clay_far', 'b_n_iron_far'] }
  ];
  /* 建物の見た目の対応：種類 → { near, far, fix }。fix はモデルの向き・大きさの直し（yaw はラジアン）。lod は近く用→遠く用の切りかえ距離（省略すると画質の houseNear。遠く用が箱に近い建物は遠めにする）。
     ファイルを置いたら、上の MANIFEST に組を足し、ここに 1 行足す。足りない物はコードの形（models.js）になる */
  G.BUILD_MODELS = {
    bench: { near: 'b_bench', far: 'b_bench_far', fix: {} },
    hut: { near: 'b_hut', far: 'b_hut_far', fix: {} },
    house: { near: 'b_house', far: 'b_house_far', fix: {}, lod: 32 },
    well: { near: 'b_well', far: 'b_well_far', fix: {} },
    fire: { near: 'b_fire', far: 'b_fire_far', fix: {} },
    kiln: { near: 'b_kiln', far: 'b_kiln_far', fix: {} },
    furnace: { near: 'b_furnace', far: 'b_furnace_far', fix: {} },
    field: { near: 'b_field', far: 'b_field_far', fix: {} },
    lumber: { near: 'b_lumber', far: 'b_lumber_far', fix: {} },
    bhouse: { near: 'b_bhouse', far: 'b_bhouse_far', fix: {}, lod: 36 }
  };

  const MP = {};   // 名前 → 読んで作り直したメッシュの Promise（A.model）
  const A = G.assets = { reqKeys: {}, done: 0, total: 0, reqDone: 0, reqTotal: 0, failed: [], okMap: {}, started: {}, onProgress: null, onBg: null, tierAsked: {}, conc: 5, idle: 20000, retryWait: [3000, 8000] };
  const P = {};   // path → Promise<boolean>
  const QU = [];  // 待ち行列：{ path, prio, seq, tries, res, req }
  let active = 0, seq = 0;
  A.queue = { get waiting() { return QU.length; }, get active() { return active; }, max: 0 };

  function progress() { if (A.onProgress) A.onProgress(A.reqDone, A.reqTotal); if (A.onBg) A.onBg(A.done, A.total); }
  /* 読みこみの順（小さいほど先）。必須（空・地面）→ 近く用の木・岩 → 建物 → 人 → 道具・低木 */
  const PRIO = { sky: 0, ground: 0, path: 0, farm: 0, stone: 1, treetex: 2, rocks: 2, wood: 2, trees: 2, b_nodes_far: 2.5, b_bench_far: 2.5, b_hut_far: 2.5, b_house_far: 2.5, b_well_far: 2.5, b_fire_far: 2.5, b_kiln_far: 2.5, b_furnace_far: 2.5, b_field_far: 2.5, b_lumber_far: 2.5, b_bhouse_far: 2.5, b_player_far: 3.5, b_person_far: 3.5, b_player: 4, b_person: 4, plants: 5, b_tools: 5, b_nodes: 5 };
  A.prioOf = g => (g.id in PRIO ? PRIO[g.id] : g.id.indexOf('b_') === 0 ? 3 : 5);

  /* 1 回取りに行く。届いた量を見て、20 秒間ひとつも届かなければ打ち切る（全体の時間では打ち切らない）。結果 true／false */
  function fetchOnce(path) {
    return new Promise(res => {
      let fin = false, to = null;
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const end = ok => { if (fin) return; fin = true; clearTimeout(to); res(ok); };
      const kick = () => { clearTimeout(to); to = setTimeout(() => { if (ac) ac.abort(); end(false); }, A.idle); };
      kick();
      try {
        fetch(path, ac ? { signal: ac.signal } : undefined).then(r => {
          if (!r.ok) throw new Error(path + ' ' + r.status);
          kick();
          if (r.body && r.body.getReader) {
            const rd = r.body.getReader();
            const pump = () => rd.read().then(c => { if (c.done) return end(true); kick(); return pump(); });
            return pump();
          }
          return r.arrayBuffer().then(() => end(true));
        }).catch(() => end(false));
      } catch (e) { end(false); }
    });
  }
  function finish(it, ok) {
    A.done++; A.okMap[it.path] = ok; if (!ok) A.failed.push(it.path);
    if (it.req) { A.reqDone++; A.reqKeys[it.path] = true; }
    progress(); it.res(ok);
  }
  function pump() {
    while (active < A.conc && QU.length) {
      QU.sort((x, y) => x.prio - y.prio || x.seq - y.seq);
      const it = QU.shift(); active++;
      A.queue.max = Math.max(A.queue.max, active);
      fetchOnce(it.path).then(ok => {
        active--;
        if (!ok && it.tries < A.retryWait.length) {
          /* 失敗：時間をおいて読み直す（列の最後に回す） */
          const w = A.retryWait[it.tries++]; it.prio += 0.01;
          setTimeout(() => { QU.push(it); pump(); }, w);
        } else finish(it, ok);
        pump();
      });
    }
  }
  /* 1 ファイルを取りに行く。届いたら true、読めない（読み直しても）なら false。prio が小さい物から、同時に A.conc 本まで */
  function need(path, prio) {
    prio = prio == null ? 5 : prio;
    if (P[path]) {
      const w = QU.find(x => x.path === path);
      if (w && prio < w.prio) { w.prio = prio; if (prio === 0 && !w.req) { w.req = true; A.reqTotal++; progress(); } }
      return P[path];
    }
    A.total++;
    const it = { path, prio, seq: seq++, tries: 0, res: null, req: prio === 0 };
    if (it.req) A.reqTotal++;
    progress();
    P[path] = new Promise(res => { it.res = res; });
    QU.push(it); pump();
    return P[path];
  }
  /* 使わなくなった GLB の覚えを消す（画質を下げたあと。上げたときにまた読める。ファイル自体はキャッシュにある） */
  A.forget2 = function (name) { delete MP[name]; delete MP[name + ':raw']; };
  /* 読めなかったファイルを、もう一度取りに行けるようにする（画質を変えたとき・読み直し） */
  A.forget = function (path) {
    if (A.okMap[path] !== false) return false;
    delete P[path]; delete A.okMap[path];
    const i = A.failed.indexOf(path); if (i >= 0) A.failed.splice(i, 1);
    A.done--; A.total--;
    if (A.reqKeys[path]) { A.reqDone--; A.reqTotal--; delete A.reqKeys[path]; }
    const n = path.replace(/^.*\//, '').replace(/\.glb$/, '');
    delete MP[n]; delete MP[n + ':raw'];
    return true;
  };
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
    /* 新しい画質の一覧に無くて、まだ取りに行っていない物は、待ち行列から外す（低に下げたとき、高・中の GLB を取り続けない）。
       failed には入れず、total も引く。待っている Promise は false で解く */
    const want = new Set(); gs.forEach(g => filesOf(g, tier).forEach(f => want.add(f)));
    for (let i = QU.length - 1; i >= 0; i--) {
      const it = QU[i];
      if (want.has(it.path) || it.tries > 0) continue;
      QU.splice(i, 1); delete P[it.path]; A.total--; if (it.req) A.reqTotal--;
      A.forget2(it.path.replace(/^.*\//, '').replace(/\.glb$/, ''));
      it.res(false);
    }
    progress();
    gs.forEach(g => {
      const pr = g.required ? 0 : A.prioOf(g);
      filesOf(g, tier).forEach(f => { A.forget(f); const p = need(f, pr); if (g.required) req.push(p); });
    });
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
  /* 名前 → 作り直して元にしたメッシュの配列（非表示）。読めなければ reject。opt.raw が true なら、焼きこまずに結果をそのまま返す */
  A.model = function (name, opt) {
    const raw = !!(opt && opt.raw), k = name + (raw ? ':raw' : '');
    if (MP[k]) return MP[k];
    MP[k] = need(M + name + '.glb', 5).then(ok => {
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

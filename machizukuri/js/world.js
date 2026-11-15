/* 荒野開拓記（仮） — 世界（場面づくり・区画とマス・採れる物の配置と描画・また出る処理）
   区画 "0,0"（240m 四方、120×120 マス、1 マス 2m）の中心が世界の原点。マス (gx,gz) の中心は x = (gx − 60) * 2 + 1。
   採れる物の場所は、種（MZ.T.seed と区画のキー）から毎回同じに作る。数 n や並べ方を後で変えると、
   古い保存の「消えている物の番号」がずれる。そのときは MZ.SAVE_V を上げて直す処理を MZ.migrate に書くこと。 */
(function () {
  const MZ = window.MZ, B = BABYLON, T = MZ.T;
  const N = T.chunk, C = T.cell;

  MZ.cellOf = v => Math.floor(v / C) + N / 2;         // 世界の座標 → マスの番号
  MZ.cellPos = g => (g - N / 2) * C + C / 2;          // マスの番号 → マスの中心の座標
  MZ.chunk = () => MZ.state.chunks['0,0'];

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  const W = MZ.world = {
    nodes: [], groups: [], cellNode: new Int32Array(N * N).fill(-1),
    owner: new Int32Array(N * N),     // マスの持ち主（0 は空き、ほかは建物の id）。保存はしない
    solid: new Uint8Array(N * N),     // 通れないマス（solid の建物）
    taken: null, regrowAcc: 0
  };

  /* ---------- 場面 ---------- */
  /* 光・空・霧・地面・草・柵は MZ.gfx（js/gfx/）が作る。ここは、エンジン・場面・カメラを作って呼ぶだけ */
  W.init = function (canvas) {
    const G = MZ.gfx;
    const engine = G.engine = W.engine = new B.Engine(canvas, true, { stencil: false, preserveDrawingBuffer: false });
    const scene = G.scene = W.scene = new B.Scene(engine);
    scene.skipPointerMovePicking = true;
    const cam = G.cam = W.camera = new B.FreeCamera('cam', new B.Vector3(0, T.eye, 0), scene);
    cam.inputs.clear(); cam.minZ = 0.1; cam.maxZ = 3200; cam.fov = 1.0;
    scene.activeCamera = cam;
    G.sky.init();            // 太陽・半球光・空・光の回りこみ。AirPlugin の登録もここ（材質を作る前）
    MZ.initModels(scene);    // コードの形の材質（PBR）
    G.ground.init();         // 平らな地面（土地の外だけ起伏）・遠景の山なみ・柵
    G.grass.init();
    G.fire.init();
    return W;
  };

  /* ---------- 採れる物の配置（種から毎回同じ） ---------- */
  const VARIANTS = { tree: ['tree', 'tree2'] };
  W.buildNodes = function () {
    const rng = mulberry32((T.seed ^ hashStr('0,0')) >>> 0), used = new Uint8Array(N * N);
    const lo = 3, hi = N - 3;   // 土地の端 4m は避ける（マスの中心が端から 4m 以上）
    W.nodes.length = 0; W.groups.length = 0; W.cellNode.fill(-1);
    for (let gz = 59; gz <= 60; gz++) for (let gx = 59; gx <= 60; gx++) used[gz * N + gx] = 1;   // 小屋
    const groups = {};
    Object.keys(MZ.NODES).forEach(k => {
      const d = MZ.NODES[k];
      (VARIANTS[k] || [k]).forEach((mk, vi) => {
        const gr = { k, mk, vi, nodes: [] };   // 見た目は gfx/nodes.js が決める（ここは種類とばらつきの番号だけ）
        groups[k + vi] = gr; W.groups.push(gr);
      });
      let placed = 0, tries = 0;
      while (placed < d.n && tries++ < 20000) {
        const gx = lo + Math.floor(rng() * (hi - lo + 1)), gz = lo + Math.floor(rng() * (hi - lo + 1));
        const x = MZ.cellPos(gx), z = MZ.cellPos(gz);
        const s = 0.85 + rng() * 0.35, ry = rng() * Math.PI * 2, v = (VARIANTS[k] && rng() < 0.5) ? 1 : 0;
        if (used[gz * N + gx] || Math.hypot(x, z) < d.minR) continue;
        used[gz * N + gx] = 1;
        const nd = { idx: W.nodes.length, k, x, z, s, ry, gx, gz, g: groups[k + (VARIANTS[k] ? v : 0)], hp: -1 };
        nd.slot = nd.g.nodes.length; nd.g.nodes.push(nd);
        W.nodes.push(nd); W.cellNode[gz * N + gx] = nd.idx; placed++;
      }
    });
    MZ.gfx.nodes.init(W.nodes);
  };
  W.nodeActive = idx => !(idx in W.taken);
  W.setNode = function (idx, vis) { MZ.gfx.nodes.show(idx, vis); };

  /* 採れた：消して、back 秒後にまた出る（back < 0 は二度と出ない） */
  W.take = function (idx, back) {
    W.taken[idx] = back; W.nodes[idx].hp = -1; W.setNode(idx, false);
  };
  /* 保存から読んだ「消えている物」を描く。範囲の外の番号は捨てる */
  W.applyTaken = function () {
    W.taken = MZ.chunk().taken;
    Object.keys(W.taken).forEach(k => { const i = +k; if (!(i >= 0 && i < W.nodes.length)) delete W.taken[k]; });
    MZ.gfx.nodes.flush();
  };
  /* 時間をすすめる（また出る処理）。遊んでいない間は進まない（残り秒を保存するだけ） */
  W.regrow = function (dt) {
    W.regrowAcc += dt;
    if (W.regrowAcc < T.regrowCheck) return;
    const step = W.regrowAcc; W.regrowAcc = 0;
    Object.keys(W.taken).forEach(k => {
      const v = W.taken[k];
      if (v < 0) return;
      if (v - step <= 0) { delete W.taken[k]; W.setNode(+k, true); } else W.taken[k] = v - step;
    });
  };

  /* ---------- 当たり判定（マスの表と、r > 0 の採れる物の円の 2D 押し返し） ---------- */
  W.collide = function (x, z, r) {
    const gx = MZ.cellOf(x), gz = MZ.cellOf(z);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const cx = gx + dx, cz = gz + dz;
      if (cx < 0 || cz < 0 || cx >= N || cz >= N) continue;
      const ci = cz * N + cx;
      if (W.solid[ci]) {
        const x0 = (cx - N / 2) * C, z0 = (cz - N / 2) * C;
        const px = Math.max(x0, Math.min(x0 + C, x)), pz = Math.max(z0, Math.min(z0 + C, z));
        const ex = x - px, ez = z - pz, d2 = ex * ex + ez * ez;
        if (d2 < r * r) {
          if (d2 > 1e-9) { const d = Math.sqrt(d2); x = px + ex / d * r; z = pz + ez / d * r; } else {
            const l = x - x0, rr = x0 + C - x, t = z - z0, b = z0 + C - z, m = Math.min(l, rr, t, b);
            if (m === l) x = x0 - r; else if (m === rr) x = x0 + C + r; else if (m === t) z = z0 - r; else z = z0 + C + r;
          }
        }
      }
      const ni = W.cellNode[ci];
      if (ni >= 0 && MZ.NODES[W.nodes[ni].k].r > 0 && W.nodeActive(ni)) {
        const nd = W.nodes[ni], rr = MZ.NODES[nd.k].r * nd.s + r, ex = x - nd.x, ez = z - nd.z, d2 = ex * ex + ez * ez;
        if (d2 < rr * rr) { const d = Math.sqrt(d2) || 1e-6; x = nd.x + ex / d * rr; z = nd.z + ez / d * rr; }
      }
    }
    const lim = T.half - 0.5;
    return [Math.max(-lim, Math.min(lim, x)), Math.max(-lim, Math.min(lim, z))];
  };
  W.solidAtPoint = (x, z) => { const gx = MZ.cellOf(x), gz = MZ.cellOf(z); return gx < 0 || gz < 0 || gx >= N || gz >= N || !!W.solid[gz * N + gx]; };
})();

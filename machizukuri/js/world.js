/* 荒野開拓記（仮） — 世界（場面づくり・区画とマス・採れる物の配置と描画・また出る処理）
   区画 "0,0"（240m 四方、120×120 マス、1 マス 2m）の中心が世界の原点。マス (gx,gz) の中心は x = (gx − 60) * 2 + 1。
   β0.3.0 から、表（owner・solid・cellNode・草の密度・塗り分け）は最初から 3×3 区画（360×360 マス）の「全体のマス」で 1 つ持つ。
   全体のマス (gx,gz) は、区画 "0,0" の中では今までのマスの番号と同じ（−120〜239）。区画 (cx,cz) のマスは gx = cx*120 + lx。
   表の番号は MZ.ci(gx,gz)。持っている区画は W.land（9 マスの表）で持ち、MZ.landAt(gx,gz) で調べる。
   採れる物の場所は、種（MZ.T.seed と区画のキー）から毎回同じに作る。数 n や並べ方を後で変えると、
   古い保存の「消えている物の番号」がずれる。そのときは MZ.SAVE_V を上げて直す処理を MZ.migrate に書くこと。 */
(function () {
  const MZ = window.MZ, B = BABYLON, T = MZ.T;
  const N = T.chunk, C = T.cell, S = T.span;
  const GN = MZ.GN, G0 = MZ.G0;                       // 全体のマスの一辺（360）・いちばん小さい全体のマスの番号（−120）。data.js で決める（gfx が world.js より先に読まれるため）
  const HS = (S - 1) / 2;                             // 区画の番号の最小は −HS

  MZ.cellOf = v => Math.floor(v / C) + N / 2;         // 世界の座標 → 全体のマスの番号
  MZ.cellPos = g => (g - N / 2) * C + C / 2;          // 全体のマスの番号 → マスの中心の座標
  MZ.ci = (gx, gz) => (gx < G0 || gz < G0 || gx >= G0 + GN || gz >= G0 + GN) ? -1 : (gz - G0) * GN + (gx - G0);   // 表の番号。世界の外は −1
  MZ.inWorld = (gx, gz) => gx >= G0 && gz >= G0 && gx < G0 + GN && gz < G0 + GN;
  MZ.chunkKey = (cx, cz) => cx + ',' + cz;
  MZ.chunkOfCell = (gx, gz) => {
    const cx = Math.floor(gx / N), cz = Math.floor(gz / N);   // 負のマスに注意（floor で割る）
    return { cx, cz, key: cx + ',' + cz, lx: gx - cx * N, lz: gz - cz * N };
  };
  /* 持っている区画のマスか。割り算 2 回と表 1 回だけ（草の並べ直しで 1 回に数千回呼ぶので、文字列は作らない） */
  MZ.landAt = (gx, gz) => {
    const cx = Math.floor(gx / N) + HS, cz = Math.floor(gz / N) + HS;
    return cx >= 0 && cz >= 0 && cx < S && cz < S && W.land[cz * S + cx] === 1;
  };
  MZ.landAtPoint = (x, z) => MZ.landAt(Math.floor(x / C) + N / 2, Math.floor(z / C) + N / 2);
  MZ.chunk = (key = '0,0') => MZ.state.chunks[key];   // 引数なしは今までどおり "0,0"

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  /* 全体の表は起動のとき 1 回だけ作り、作り直さない（約 1.2MB） */
  const W = MZ.world = {
    nodes: [], groups: [], byChunk: {}, cellNode: new Int32Array(GN * GN).fill(-1),
    owner: new Int32Array(GN * GN),   // マスの持ち主（0 は空き、ほかは建物の id）。保存はしない
    solid: new Uint8Array(GN * GN),   // 通れないマス（solid の建物）
    land: new Uint8Array(S * S),      // 持っている区画（番号 (cz+HS)*S + (cx+HS)）。W.setLand で書く
    landKeys: ['0,0'], regrowAcc: 0
  };
  /* 持っている区画を決める（keys は ["0,0", …]）。landAt はこの表を引くだけ */
  W.setLand = function (keys) {
    W.land.fill(0); W.landKeys = [];
    (keys || []).forEach(k => {
      const m = /^(-?\d+),(-?\d+)$/.exec(k);
      if (!m) return;
      const cx = +m[1] + HS, cz = +m[2] + HS;
      if (cx < 0 || cz < 0 || cx >= S || cz >= S || W.land[cz * S + cx]) return;
      W.land[cz * S + cx] = 1; W.landKeys.push(k);
    });
  };
  W.setLand(['0,0']);

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
  /* landKeys：持っている区画のキー。"0,0" をいつも最初に作る（番号が今までと同じになる）。
     種類ごとの組（groups）は全部の区画で共通。作り終えてから、描画の入れ物を 1 回だけ作る */
  W.buildNodes = function (landKeys) {
    W.nodes.length = 0; W.groups.length = 0; W.cellNode.fill(-1); W.byChunk = {};
    W.groupMap = {};
    Object.keys(MZ.NODES).forEach(k => {
      (VARIANTS[k] || [k]).forEach((mk, vi) => {
        const gr = { k, mk, vi, nodes: [] };   // 見た目は gfx/nodes.js が決める（ここは種類とばらつきの番号だけ）
        W.groupMap[k + vi] = gr; W.groups.push(gr);
      });
    });
    const keys = landKeys && landKeys.length ? landKeys : ['0,0'];
    ['0,0'].concat(keys.filter(k => k !== '0,0')).forEach(W.buildChunkNodes);
    MZ.gfx.nodes.init(W.nodes);
  };
  /* 区画 1 つぶんの採れる物を W.nodes の後ろに足す（中で nodes.init は呼ばない。広げるときは呼ぶ側が init をやり直す） */
  W.buildChunkNodes = function (key) {
    const m = /^(-?\d+),(-?\d+)$/.exec(key), cx = +m[1], cz = +m[2];
    const rng = mulberry32((T.seed ^ hashStr(key)) >>> 0), used = new Uint8Array(N * N), groups = W.groupMap;
    const lo = 3, hi = N - 3;   // 土地の端 4m は避ける（マスの中心が端から 4m 以上）
    const list = W.byChunk[key] = [];
    /* 物ごとの nd.tk：その区画の taken（state.chunks[key] があれば。起動のときは MZ.state がまだ無いので、W.applyTaken が付けるまでの仮の空の入れ物） */
    const tk0 = (MZ.state && MZ.state.chunks[key]) ? MZ.state.chunks[key].taken : {};
    /* 区画の種類の倍率（"0,0" と知らない区画は 1 倍＝今の数のまま） */
    const kind = MZ.KINDS[MZ.CHUNK_KINDS[key]], mult = (kind && kind.mult) || {};
    if (key === '0,0') for (let lz = 59; lz <= 60; lz++) for (let lx = 59; lx <= 60; lx++) used[lz * N + lx] = 1;   // 小屋
    Object.keys(MZ.NODES).forEach(k => {
      const d = MZ.NODES[k];
      let placed = 0, tries = 0;
      const want = Math.round(d.n * (mult[k] || 1));   // 採れる物の数：n × 種類の倍率（"0,0" は n のまま）
      while (placed < want && tries++ < 20000) {
        const lx = lo + Math.floor(rng() * (hi - lo + 1)), lz = lo + Math.floor(rng() * (hi - lo + 1));
        const gx = cx * N + lx, gz = cz * N + lz;
        const x = MZ.cellPos(gx), z = MZ.cellPos(gz);
        const s = 0.85 + rng() * 0.35, ry = rng() * Math.PI * 2, v = (VARIANTS[k] && rng() < 0.5) ? 1 : 0;
        if (used[lz * N + lx] || Math.hypot(x, z) < d.minR) continue;
        used[lz * N + lx] = 1;
        const nd = { idx: W.nodes.length, ck: key, li: list.length, k, x, z, s, ry, gx, gz, g: groups[k + (VARIANTS[k] ? v : 0)], hp: -1, tk: tk0 };
        nd.slot = nd.g.nodes.length; nd.g.nodes.push(nd);
        list.push(nd.idx); W.nodes.push(nd); W.cellNode[MZ.ci(gx, gz)] = nd.idx; placed++;
      }
    });
  };
  /* 消えている物か。nd.tk はその区画の taken、nd.li は区画の中の番号（W.applyTaken が付ける） */
  W.nodeActive = idx => { const nd = W.nodes[idx]; return !(nd.tk && nd.li in nd.tk); };   // tk が無ければ「出ている」
  /* 消えている物の残り秒（出ているなら undefined。-1 は二度と出ない） */
  W.takenOf = idx => { const nd = W.nodes[idx]; return nd.tk ? nd.tk[nd.li] : undefined; };
  /* 建物を置いたので、この物はもう出ない */
  W.forbid = idx => { const nd = W.nodes[idx]; if (nd.tk) nd.tk[nd.li] = -1; };
  W.setNode = function (idx, vis) { MZ.gfx.nodes.show(idx, vis); };

  /* 採れた：消して、back 秒後にまた出る（back < 0 は二度と出ない） */
  W.take = function (idx, back) {
    const nd = W.nodes[idx];
    if (nd.tk) nd.tk[nd.li] = back;
    nd.hp = -1; W.setNode(idx, false);
  };
  /* 保存から読んだ「消えている物」を描く。範囲の外の番号は捨てる。
     物ごとの nd.tk は state.chunks[key].taken の物そのもの。taken を別の物に差しかえたら、この関数を呼び直すこと */
  W.applyTaken = function () {
    W.landKeys.forEach(key => {
      const ch = MZ.state.chunks[key], list = W.byChunk[key];
      if (!ch || !list) return;
      const tk = ch.taken;
      Object.keys(tk).forEach(k => { const i = +k; if (!(i >= 0 && i < list.length)) delete tk[k]; });
      list.forEach(idx => { W.nodes[idx].tk = tk; });
    });
    MZ.gfx.nodes.flush();
  };
  /* 時間をすすめる（また出る処理）。遊んでいない間は進まない（残り秒を保存するだけ） */
  W.regrow = function (dt) {
    W.regrowAcc += dt;
    if (W.regrowAcc < T.regrowCheck) return;
    const step = W.regrowAcc; W.regrowAcc = 0;
    W.landKeys.forEach(key => {
      const ch = MZ.state.chunks[key], list = W.byChunk[key];
      if (!ch || !list) return;
      const tk = ch.taken;
      Object.keys(tk).forEach(k => {
        const v = tk[k];
        if (v < 0) return;
        if (v - step <= 0) { delete tk[k]; W.setNode(list[+k], true); } else tk[k] = v - step;
      });
    });
  };

  /* ---------- 当たり判定（マスの表と、r > 0 の採れる物の円の 2D 押し返し） ---------- */
  W.collide = function (x, z, r) {
    const gx = MZ.cellOf(x), gz = MZ.cellOf(z);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const cx = gx + dx, cz = gz + dz, ci = MZ.ci(cx, cz);
      if (ci < 0) continue;
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
    return W.clampLand(x, z, 0.5);
  };
  W.solidAtPoint = (x, z) => !MZ.landAtPoint(x, z) || !!W.solid[MZ.ci(MZ.cellOf(x), MZ.cellOf(z))];

  /* 点のまわり ±m の正方形の 4 つの角が、どれも持っている土地にあるか */
  W.inLand = (x, z, m) => MZ.landAtPoint(x - m, z - m) && MZ.landAtPoint(x + m, z - m) && MZ.landAtPoint(x - m, z + m) && MZ.landAtPoint(x + m, z + m);
  /* 点を持っている土地の中へ収める（端から m だけ内側まで）。持っている区画ごとに「四角を m だけ内へ寄せた四角」へ収め、
     いちばん近い点を返す。"0,0" だけのときは ±(120 − m)。返す配列は使い回す（受け取った側は、次に呼ぶ前に読むこと） */
  const _cl = [0, 0], CH = N * C;   // CH：区画の一辺（m）
  W.clampLand = function (x, z, m) {
    if (W.inLand(x, z, m)) { _cl[0] = x; _cl[1] = z; return _cl; }
    let bd = Infinity, bx = x, bz = z;
    for (let i = 0; i < W.landKeys.length; i++) {
      const k = W.landKeys[i], c = k.indexOf(','), x0 = +k.slice(0, c) * CH - CH / 2 + m, z0 = +k.slice(c + 1) * CH - CH / 2 + m;
      const px = Math.max(x0, Math.min(x0 + CH - 2 * m, x)), pz = Math.max(z0, Math.min(z0 + CH - 2 * m, z));
      const d = (px - x) * (px - x) + (pz - z) * (pz - z);
      if (d < bd) { bd = d; bx = px; bz = pz; }
    }
    _cl[0] = bx; _cl[1] = bz; return _cl;
  };
})();

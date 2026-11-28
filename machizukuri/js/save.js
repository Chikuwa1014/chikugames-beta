/* 荒野開拓記（仮） — 保存・読み込み・古い形からの直し・さいしょから
   保存の形は共通部品の包み { game, v, at, data }（CG.save.wrap）。data の形は CLAUDE.md の 4 章（版 2：land と区画ごとの chunks）。
   保存の形を変えたら MZ.SAVE_V を上げ、MZ.migrate[古い版] に「その版 → 次の版」へ直す関数を足す。 */
(function () {
  const MZ = window.MZ, T = MZ.T;

  /* 古い形から 1 つずつ新しい形へ直す表。migrate[古い版] は、その版の data を次の版の data へ直す（元の物は書きかえない） */
  MZ.migrate = {
    /* 版 1 → 版 2：持っている区画 land を足す（"0,0" だけ）。建物の座標・taken の番号・timers・nextId は、区画 "0,0" の中の意味が同じなので触らない */
    1: d => {
      const c = JSON.parse(JSON.stringify(d));
      if (!c || !c.chunks || !c.chunks['0,0']) return c;   // 壊れている物は normalize が弾く
      c.land = ['0,0'];
      c.chunks = { '0,0': c.chunks['0,0'] };               // ほかの区画があっても捨てる
      return c;
    },
    /* 版 2 → 版 3：持ち物にコンクリート 0 を足すだけ（建物・採った物・時間・番号・持っている区画は触らない）。
       古い JS が新しい保存（コンクリート・新しい建物）を読んで捨てて上書きしないように、版だけ上げるための直し */
    2: d => {
      const c = JSON.parse(JSON.stringify(d));
      if (!c || typeof c !== 'object') return c;
      if (!c.inv || typeof c.inv !== 'object') c.inv = {};
      if (c.inv.concrete === undefined) c.inv.concrete = 0;
      return c;
    }
  };

  /* さいしょの状態 */
  MZ.newState = function () {
    const inv = {}; MZ.ITEM_ORDER.forEach(k => { inv[k] = 0; });
    return {
      player: { x: 3.5, z: -7, yaw: 0.2, pitch: 0, view: 1 },
      inv, tools: { axe: 1, pick: 1 },
      pop: 0, stage: 0,
      timers: { migrate: 0, jobs: {} },
      nextId: 2,
      land: ['0,0'],
      chunks: { '0,0': { layers: { ground: [{ id: 1, t: 'hut', x: 59, z: 59, r: 0 }], under: [], over: [] }, taken: {} } }
    };
  };

  const num = v => typeof v === 'number' && isFinite(v);
  /* 持っている区画の四角（世界の座標）を m だけ内へ寄せた四角のうち、点にいちばん近い点（world.js の W.clampLand と同じ考え。
     save.js は world.js より前に読まれるので、ここに小さく書く） */
  function clampToLand(land, x, z, m) {
    const CH = T.chunk * T.cell;
    let bd = Infinity, bx = x, bz = z;
    land.forEach(k => {
      const c = k.indexOf(','), x0 = +k.slice(0, c) * CH - CH / 2 + m, z0 = +k.slice(c + 1) * CH - CH / 2 + m;
      const px = Math.max(x0, Math.min(x0 + CH - 2 * m, x)), pz = Math.max(z0, Math.min(z0 + CH - 2 * m, z));
      const dd = (px - x) * (px - x) + (pz - z) * (pz - z);
      if (dd < bd) { bd = dd; bx = px; bz = pz; }
    });
    return [bx, bz];
  }
  /* 読み込んだ中身を調べて、足りない所を補う。おかしければ null（版 2 の形） */
  function normalize(d) {
    try {
      const s = MZ.newState(), p = d.player || {};
      if (!num(p.x) || !num(p.z)) return null;
      /* 1. 持っている区画：配列で、"0,0" が入っていること。cx・cz が −1〜1 の物だけ残し、重なりを除き、"0,0" を先頭にする */
      if (!Array.isArray(d.land)) return null;
      const lh = (T.span - 1) / 2, seen = new Set();
      d.land.forEach(k => {
        if (typeof k !== 'string' || !/^-?\d+,-?\d+$/.test(k)) return;
        const c = k.indexOf(','), cx = +k.slice(0, c), cz = +k.slice(c + 1);
        if (cx < -lh || cx > lh || cz < -lh || cz > lh) return;
        seen.add(cx + ',' + cz);
      });
      if (!seen.has('0,0')) return null;
      const land = ['0,0'].concat([...seen].filter(k => k !== '0,0'));
      /* 主人公の場所：持っている区画の四角を 0.5 内へ寄せた四角のいちばん近い点へ（"0,0" だけなら ±119.5） */
      const pc = clampToLand(land, p.x, p.z, 0.5);
      Object.assign(s.player, { x: pc[0], z: pc[1], yaw: num(p.yaw) ? p.yaw : 0, pitch: num(p.pitch) ? p.pitch : 0, view: p.view === 3 ? 3 : 1 });
      MZ.ITEM_ORDER.forEach(k => { if (num(d.inv[k]) && d.inv[k] >= 0) s.inv[k] = Math.floor(d.inv[k]); });
      ['axe', 'pick'].forEach(k => { if (num(d.tools[k])) s.tools[k] = Math.max(0, Math.min(3, Math.floor(d.tools[k]))); });
      s.pop = num(d.pop) ? Math.max(0, Math.floor(d.pop)) : 0;
      s.stage = num(d.stage) ? Math.max(0, Math.min(MZ.STAGES.length - 1, Math.floor(d.stage))) : 0;
      s.timers.migrate = num(d.timers.migrate) ? d.timers.migrate : 0;
      Object.keys(d.timers.jobs || {}).forEach(k => { if (num(d.timers.jobs[k])) s.timers.jobs[k] = d.timers.jobs[k]; });
      /* 2. 区画：land に無い区画のデータは捨て、land にあって無い区画は空で作る。"0,0" の ground が配列でなければ壊れている */
      if (!d.chunks || !d.chunks['0,0'] || !d.chunks['0,0'].layers || !Array.isArray(d.chunks['0,0'].layers.ground)) return null;
      const arr = v => Array.isArray(v) ? v : [];
      const src = {};
      land.forEach(k => {
        const c = d.chunks[k], L = (c && c.layers) || {};
        src[k] = { ground: arr(L.ground), under: arr(L.under), over: arr(L.over), taken: (c && c.taken) || {} };
      });
      /* 3. 建物：全体の used と ids で調べる。小屋を先に（小屋は "0,0" にしか無い）、そのあと区画の順・配列の順。
         捨てる物：知らない種類・id・x・z が整数でない・id の重なり・x,z が 0〜119 の外・使うマスが持っている土地の外・重なり */
      const N = T.chunk, GN = N * T.span, G0 = -N * (T.span - 1) / 2, landSet = new Set(land);
      const used = new Uint8Array(GN * GN), ids = new Set(), okB = new Set();
      let maxId = 1;
      const accept = (b, key) => {
        if (!b || !MZ.BUILDS[b.t] || !Number.isInteger(b.id) || !Number.isInteger(b.x) || !Number.isInteger(b.z) || ids.has(b.id)) return;
        if (b.x < 0 || b.z < 0 || b.x >= N || b.z >= N) return;
        const w = MZ.BUILDS[b.t].w, c = key.indexOf(','), gx = +key.slice(0, c) * N + b.x, gz = +key.slice(c + 1) * N + b.z, cells = [];
        for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) {
          const x = gx + i, z = gz + j;
          if (!landSet.has(Math.floor(x / N) + ',' + Math.floor(z / N))) return;
          const ci = (z - G0) * GN + (x - G0);
          if (used[ci]) return;
          cells.push(ci);
        }
        cells.forEach(ci => { used[ci] = 1; });
        ids.add(b.id); maxId = Math.max(maxId, b.id); okB.add(b);
      };
      src['0,0'].ground.forEach(b => { if (b && b.t === 'hut') accept(b, '0,0'); });
      land.forEach(k => src[k].ground.forEach(b => { if (!okB.has(b)) accept(b, k); }));
      const chunks = {};
      land.forEach(k => {
        const ground = [];
        src[k].ground.forEach(b => {
          if (!okB.has(b)) return;
          const o = { id: b.id, t: b.t, x: b.x, z: b.z, r: ((b.r | 0) % 4 + 4) % 4 };
          if (typeof b.mk === 'string' && MZ.BUILDS[b.t].craft && MZ.BUILDS[b.t].craft.indexOf(b.mk) >= 0) o.mk = b.mk;   // 工房のえらび（その建物の craft の中の物だけ残す）
          ground.push(o);
        });
        /* 6. taken：値が数のキーだけ残す（番号の範囲は W.applyTaken が見る） */
        const tk = {}; Object.keys(src[k].taken).forEach(q => { if (num(src[k].taken[q])) tk[q] = src[k].taken[q]; });
        chunks[k] = { layers: { ground, under: src[k].under, over: src[k].over }, taken: tk };
      });
      /* 4. 小屋が 1 つも無ければ壊れている */
      if (!chunks['0,0'].layers.ground.some(b => b.t === 'hut')) return null;
      s.land = land; s.chunks = chunks;
      /* 7. nextId */
      s.nextId = Math.max(num(d.nextId) ? d.nextId : 2, maxId + 1);
      return s;
    } catch (e) { return null; }
  }

  /* 読み込む。{ status: 'none' | 'ok' | 'newer' | 'broken', state } */
  MZ.loadSave = function () {
    const box = CG.ls.getJSON(MZ.SAVE_KEY, null);
    if (box === null) return { status: CG.ls.get(MZ.SAVE_KEY, null) === null ? 'none' : 'broken' };
    if (!box || box.game !== MZ.GAME || !num(box.v) || !box.data || typeof box.data !== 'object') return { status: 'broken' };
    if (box.v > MZ.SAVE_V) return { status: 'newer' };
    let d = box.data;
    for (let v = box.v; v < MZ.SAVE_V; v++) {
      if (!MZ.migrate[v]) return { status: 'broken' };
      try { d = MZ.migrate[v](d); } catch (e) { return { status: 'broken' }; }
    }
    const s = normalize(d);
    return s ? { status: 'ok', state: s } : { status: 'broken' };
  };

  /* 保存する（新しい版のデータがあるときは上書きしない） */
  MZ.saveNow = function () {
    MZ.saveAcc = 0;
    if (MZ.noSave || !MZ.started || !MZ.state) return false;
    return CG.ls.setJSON(MZ.SAVE_KEY, CG.save.wrap(MZ.state, MZ.SAVE_V));
  };

  /* さいしょから：保存を消して、ページを読み直す */
  MZ.resetAll = function () {
    MZ.noSave = true;
    CG.ls.del(MZ.SAVE_KEY);
    location.reload();
  };

  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') MZ.saveNow(); });
  addEventListener('pagehide', () => MZ.saveNow());
})();

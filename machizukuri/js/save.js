/* 荒野開拓記（仮） — 保存・読み込み・古い形からの直し・さいしょから
   保存の形は共通部品の包み { game, v, at, data }（CG.save.wrap）。data の形は開発指示書 3.6 と同じ。
   保存の形を変えたら MZ.SAVE_V を上げ、MZ.migrate[古い版] に「その版 → 次の版」へ直す関数を足す。 */
(function () {
  const MZ = window.MZ, T = MZ.T;

  /* 古い形から 1 つずつ新しい形へ直す表（今回は v1 だけなので空） */
  MZ.migrate = {};

  /* さいしょの状態 */
  MZ.newState = function () {
    const inv = {}; MZ.ITEM_ORDER.forEach(k => { inv[k] = 0; });
    return {
      player: { x: 3.5, z: -7, yaw: 0.2, pitch: 0, view: 1 },
      inv, tools: { axe: 1, pick: 1 },
      pop: 0, stage: 0,
      timers: { migrate: 0, jobs: {} },
      nextId: 2,
      chunks: { '0,0': { layers: { ground: [{ id: 1, t: 'hut', x: 59, z: 59, r: 0 }], under: [], over: [] }, taken: {} } }
    };
  };

  const num = v => typeof v === 'number' && isFinite(v);
  /* 読み込んだ中身を調べて、足りない所を補う。おかしければ null */
  function normalize(d) {
    try {
      const s = MZ.newState(), p = d.player || {};
      if (!num(p.x) || !num(p.z)) return null;
      const lim = T.half - 0.5, cl = v => Math.max(-lim, Math.min(lim, v));
      Object.assign(s.player, { x: cl(p.x), z: cl(p.z), yaw: num(p.yaw) ? p.yaw : 0, pitch: num(p.pitch) ? p.pitch : 0, view: p.view === 3 ? 3 : 1 });
      MZ.ITEM_ORDER.forEach(k => { if (num(d.inv[k]) && d.inv[k] >= 0) s.inv[k] = Math.floor(d.inv[k]); });
      ['axe', 'pick'].forEach(k => { if (num(d.tools[k])) s.tools[k] = Math.max(0, Math.min(3, Math.floor(d.tools[k]))); });
      s.pop = num(d.pop) ? Math.max(0, Math.floor(d.pop)) : 0;
      s.stage = num(d.stage) ? Math.max(0, Math.min(MZ.STAGES.length - 1, Math.floor(d.stage))) : 0;
      s.timers.migrate = num(d.timers.migrate) ? d.timers.migrate : 0;
      Object.keys(d.timers.jobs || {}).forEach(k => { if (num(d.timers.jobs[k])) s.timers.jobs[k] = d.timers.jobs[k]; });
      const ch = d.chunks['0,0'], g = ch.layers.ground;
      if (!Array.isArray(g)) return null;
      /* 建物を調べる：土地の中・同じマスの重なりなし・id の重複なし。おかしい物は捨てる */
      const N = T.chunk, used = new Uint8Array(N * N), ids = new Set();
      let maxId = 1;
      const ground = [];
      g.forEach(b => {
        if (!b || !MZ.BUILDS[b.t] || !Number.isInteger(b.id) || !Number.isInteger(b.x) || !Number.isInteger(b.z) || ids.has(b.id)) return;
        const w = MZ.BUILDS[b.t].w;
        if (b.x < 0 || b.z < 0 || b.x + w > N || b.z + w > N) return;
        for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) if (used[(b.z + j) * N + b.x + i]) return;
        for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) used[(b.z + j) * N + b.x + i] = 1;
        ids.add(b.id); maxId = Math.max(maxId, b.id);
        ground.push({ id: b.id, t: b.t, x: b.x, z: b.z, r: ((b.r | 0) % 4 + 4) % 4 });
      });
      if (!ground.some(b => b.t === 'hut')) return null;
      s.chunks['0,0'].layers = { ground, under: Array.isArray(ch.layers.under) ? ch.layers.under : [], over: Array.isArray(ch.layers.over) ? ch.layers.over : [] };
      const tk = {}; Object.keys(ch.taken || {}).forEach(k => { if (num(ch.taken[k])) tk[k] = ch.taken[k]; });
      s.chunks['0,0'].taken = tk;
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

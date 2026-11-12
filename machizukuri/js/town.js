/* 荒野開拓記（仮） — 街（建築・道のつながり・移住者・住民の姿と仕事・段階）
   建物は state.chunks["0,0"].layers.ground の配列（{ id, t, x, z, r }。x,z は左上のマス、r は 0〜3）で持つ。 */
(function () {
  const MZ = window.MZ, B = BABYLON, T = MZ.T, N = T.chunk, C = T.cell;
  const Tn = MZ.town = {
    meshes: {}, byId: {}, info: { homeSum: 0, water: 0, food: 0, cap: 0, unconnected: 0, low: {} },
    residents: [], resDirty: true, clock: 0, lastNote: {}, jobsRun: {}, people: []
  };
  MZ.build = { mode: 'none', key: null, r: 0, gx: 0, gz: 0, ok: false, reason: '', target: 0 };

  const list = () => MZ.chunk().layers.ground;
  const rand = (a, b) => a + Math.random() * (b - a);
  Tn.list = list;

  function cellsOf(b, f) {
    const w = MZ.BUILDS[b.t].w;
    for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) f((b.z + j) * N + b.x + i);
  }
  const center = b => { const w = MZ.BUILDS[b.t].w; return [(b.x - N / 2) * C + w * C / 2, (b.z - N / 2) * C + w * C / 2]; };
  Tn.center = center;

  /* ---------- 初期化（保存から作り直す） ---------- */
  Tn.init = function () {
    const W = MZ.world;
    W.owner.fill(0); W.solid.fill(0); Tn.byId = {};
    Object.values(Tn.meshes).forEach(m => m.dispose()); Tn.meshes = {};
    list().forEach(b => addBuilding(b));
    /* 人の thin instance（服の色ちがいが 4 種） */
    Tn.pgroups = [0, 1, 2, 3].map(i => {
      const mesh = MZ.getModel('person' + i);
      const buf = new Float32Array(T.maxPeople * 16);
      mesh.isVisible = true; mesh.alwaysSelectAsActiveMesh = true;
      mesh.thinInstanceSetBuffer('matrix', buf, 16, false); mesh.thinInstanceCount = 0;
      return { mesh, buf };
    });
    Tn.recalc(true); Tn.stageCheck(true);
  };

  function addBuilding(b) {
    const W = MZ.world, d = MZ.BUILDS[b.t];
    Tn.byId[b.id] = b;
    cellsOf(b, ci => { W.owner[ci] = b.id; if (d.solid) W.solid[ci] = 1; });
    const m = MZ.getModel(b.t).createInstance('b' + b.id), c = center(b);
    m.position.set(c[0], 0, c[1]); m.rotation.y = b.r * Math.PI / 2;
    m.isPickable = false; m.freezeWorldMatrix();
    Tn.meshes[b.id] = m;
    /* 建物と重なる採れる物は、二度と出ない */
    cellsOf(b, ci => { const ni = W.cellNode[ci]; if (ni >= 0 && W.taken && W.taken[ni] !== undefined) W.taken[ni] = -1; });
  }
  const has = t => list().some(b => b.t === t);
  Tn.has = has;
  Tn.count = t => list().filter(b => b.t === t).length;

  /* ---------- 置けるか ---------- */
  Tn.canPlace = function (key, gx, gz) {
    const W = MZ.world, d = MZ.BUILDS[key], w = d.w;
    if (gx < 0 || gz < 0 || gx + w > N || gz + w > N) return { ok: false, reason: '土地の外' };
    for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) {
      const ci = (gz + j) * N + gx + i;
      if (W.owner[ci]) return { ok: false, reason: '建物と重なる' };
      const ni = W.cellNode[ci];
      if (ni >= 0 && W.nodeActive(ni)) return { ok: false, reason: MZ.NODES[W.nodes[ni].k].name + 'と重なる' };
    }
    if (d.solid) {
      const p = MZ.state.player, x0 = (gx - N / 2) * C, z0 = (gz - N / 2) * C, s = w * C;
      const px = Math.max(x0, Math.min(x0 + s, p.x)), pz = Math.max(z0, Math.min(z0 + s, p.z));
      if (Math.hypot(p.x - px, p.z - pz) < T.radius + 0.05) return { ok: false, reason: '自分の体と重なる' };
    }
    return { ok: true, reason: '' };
  };
  /* えらべるか（空なら OK、そうでなければ理由） */
  Tn.lockReason = function (key) {
    const d = MZ.BUILDS[key], st = d.stage || 0;
    if (st > MZ.state.stage) return MZ.STAGES[st].name + '（人口 ' + MZ.STAGES[st].pop + '）で解放';
    return '';
  };
  MZ.afford = cost => Object.keys(cost || {}).every(k => MZ.state.inv[k] >= cost[k]);
  MZ.lacking = cost => Object.keys(cost || {}).filter(k => MZ.state.inv[k] < cost[k]);

  /* 建てる（テストからも使う）。成功したら true */
  MZ.place = function (key, gx, gz, r) {
    const d = MZ.BUILDS[key], s = MZ.state;
    if (!d || d.fixed || Tn.lockReason(key) || !MZ.afford(d.cost)) return false;
    if (!Tn.canPlace(key, gx, gz).ok) return false;
    Object.keys(d.cost).forEach(k => { s.inv[k] -= d.cost[k]; });
    const b = { id: s.nextId++, t: key, x: gx, z: gz, r: r || 0 };
    list().push(b); addBuilding(b);
    Tn.recalc(); MZ.saveNow();
    MZ.ui.notice(d.name + 'を建てた');
    return true;
  };
  /* こわす（材料が半分もどる。切り捨て） */
  MZ.remove = function (id) {
    const W = MZ.world, b = Tn.byId[id], s = MZ.state;
    if (!b) return false;
    const d = MZ.BUILDS[b.t];
    if (d.fixed) return false;
    const back = [];
    Object.keys(d.cost).forEach(k => { const n = Math.floor(d.cost[k] / 2); if (n > 0) { s.inv[k] += n; back.push(MZ.ITEMS[k] + n); } });
    cellsOf(b, ci => { W.owner[ci] = 0; W.solid[ci] = 0; });
    Tn.meshes[id].dispose(); delete Tn.meshes[id]; delete Tn.byId[id];
    const L = list(); L.splice(L.indexOf(b), 1);
    delete s.timers.jobs[id];
    Tn.recalc(); MZ.saveNow();
    MZ.ui.notice(d.name + 'をこわした' + (back.length ? '（' + back.join('・') + ' もどる）' : ''));
    return true;
  };

  /* ---------- 道のつながり・移住の上限 ---------- */
  Tn.recalc = function (silent) {
    const W = MZ.world, conn = new Set(), q = [];
    const typeAt = ci => { const id = W.owner[ci]; return id ? Tn.byId[id].t : ''; };
    const nb = ci => { const x = ci % N, z = (ci - x) / N, r = []; if (x > 0) r.push(ci - 1); if (x < N - 1) r.push(ci + 1); if (z > 0) r.push(ci - N); if (z < N - 1) r.push(ci + N); return r; };
    list().filter(b => b.t === 'hut').forEach(h => cellsOf(h, ci => nb(ci).forEach(n => { if (typeAt(n) === 'road' && !conn.has(n)) { conn.add(n); q.push(n); } })));
    while (q.length) { const c = q.shift(); nb(c).forEach(n => { if (typeAt(n) === 'road' && !conn.has(n)) { conn.add(n); q.push(n); } }); }
    let home = 0, water = 0, food = 0, unc = 0;
    list().forEach(b => {
      const d = MZ.BUILDS[b.t];
      if (d.water) water += d.water;
      if (d.food) food += d.food;
      if (d.home) {
        let ok = false; cellsOf(b, ci => { if (!ok) nb(ci).forEach(n => { if (conn.has(n)) ok = true; }); });
        if (ok) home += d.home; else unc++;
      }
    });
    water += T.baseWater; food += T.baseFood;
    const cap = Math.min(home, water, food), mn = cap;
    Tn.info = { homeSum: home, water, food, cap, unconnected: unc, low: { home: home === mn, water: water === mn, food: food === mn }, roads: conn.size };
    Tn.resDirty = true; Tn.jobsDirty = true;
    Tn.rescue = true;
    if (!silent && MZ.state.pop > cap) MZ.state.timers.migrate = 0;
  };

  /* ---------- 仕事 ---------- */
  Tn.jobs = function () {
    if (Tn.jobsCache && !Tn.jobsDirty && Tn.jobsPop === MZ.state.pop) return Tn.jobsCache;   // 建物・人口が変わったときだけ作り直す
    Tn.jobsDirty = false; Tn.jobsPop = MZ.state.pop;
    let left = MZ.state.pop; const r = [];
    list().forEach(b => { const d = MZ.BUILDS[b.t]; if (d.jobs) { const run = left >= d.jobs; if (run) left -= d.jobs; r.push({ id: b.id, t: b.t, running: run, need: d.jobs, staff: Math.min(left + (run ? d.jobs : 0), d.jobs) }); } });
    Tn.jobsCache = r; return r;
  };
  Tn.stageCheck = function (silent) {
    const s = MZ.state;
    for (let i = MZ.STAGES.length - 1; i > s.stage; i--) {
      if (s.pop >= MZ.STAGES[i].pop) {
        s.stage = i;
        if (!silent) {
          MZ.ui.banner(i === 1 ? '集落になった！ きこり小屋・れんがの家・鉄の道具が作れる' : MZ.STAGES[i].name + 'になった！');
          MZ.saveNow();
        }
        break;
      }
    }
  };

  /* ---------- 世界の時間（移住・仕事・また出る・自動保存） ---------- */
  MZ.tick = function (sec) {
    while (sec > 0) {
      const dt = Math.min(sec, 0.5); sec -= dt;
      step(dt);
    }
  };
  function step(dt) {
    const s = MZ.state;
    Tn.clock += dt;
    MZ.world.regrow(dt);
    /* 移住 */
    s.timers.migrate += dt;
    if (s.timers.migrate >= T.migrate) {
      s.timers.migrate = 0;
      const cap = Tn.info.cap;
      if (s.pop < cap) { s.pop++; Tn.resDirty = true; MZ.ui.notice('1 人移住してきた（人口 ' + s.pop + '）'); Tn.stageCheck(); MZ.saveNow(); }
      else if (s.pop > cap) { s.pop--; Tn.resDirty = true; MZ.ui.notice('1 人出ていった（人口 ' + s.pop + '）'); MZ.saveNow(); }
    }
    /* 仕事 */
    Tn.jobs().forEach(j => {
      const d = MZ.BUILDS[j.t];
      if (!j.running) return;
      let t = s.timers.jobs[j.id]; if (t === undefined) t = d.every;
      t -= dt;
      if (t <= 0) {
        t += d.every;
        const txt = [];
        Object.keys(d.makes).forEach(k => { s.inv[k] += d.makes[k]; txt.push('＋' + d.makes[k] + ' ' + MZ.ITEMS[k]); });
        if (!(Tn.lastNote[j.t] > Tn.clock - 60)) { Tn.lastNote[j.t] = Tn.clock; MZ.ui.notice(d.name + '：' + txt.join(' ')); }
      }
      s.timers.jobs[j.id] = t;
    });
    /* 住民 */
    if (Tn.resDirty) syncResidents();
    if (Tn.rescue) { Tn.rescue = false; Tn.residents.forEach(rescueRes); }
    Tn.residents.forEach(r => walk(r, dt));
    /* 自動保存 */
    MZ.saveAcc = (MZ.saveAcc || 0) + dt;
    if (MZ.saveAcc >= T.autosave) MZ.saveNow();
  }

  /* ---------- 住民の姿 ---------- */
  function homeList() { return list().filter(b => MZ.BUILDS[b.t].home); }
  function syncResidents() {
    Tn.resDirty = false;
    const want = Math.min(MZ.state.pop, T.maxPeople), homes = homeList(), R = Tn.residents;
    while (R.length > want) R.pop();
    while (R.length < want) R.push({ home: 0, x: 0, z: 0, tx: 0, tz: 0, wait: rand(0, 3), ry: rand(0, 6.28), v: R.length % 4, mv: false, ph: rand(0, 6) });
    const cnt = {}; homes.forEach(h => { cnt[h.id] = 0; });
    R.forEach(r => { if (r.home && cnt[r.home] !== undefined) cnt[r.home]++; else r.home = 0; });
    R.forEach(r => {
      if (r.home) return;
      let h = null; homes.forEach(x => { if (!h || cnt[x.id] < cnt[h.id]) h = x; });
      if (!h) h = Tn.byId[1] || null;
      if (h) cnt[h.id] = (cnt[h.id] || 0) + 1;
      r.home = h ? h.id : 0;
      const c = h ? center(h) : [0, 0];
      r.x = c[0]; r.z = c[1] - 3; pickTarget(r, true); r.x = r.tx; r.z = r.tz;
    });
  }
  /* 建物の中に入ってしまった住民を、家の前へ移す */
  function rescueRes(r) {
    if (!MZ.world.solidAtPoint(r.x, r.z)) return;
    const h = Tn.byId[r.home], c = h ? center(h) : [0, 0];
    r.x = c[0]; r.z = c[1] - 3;
    for (let k = 0; k < 40 && MZ.world.solidAtPoint(r.x, r.z); k++) { const a = rand(0, 6.283), d = 3 + k * 0.3; r.x = c[0] + Math.cos(a) * d; r.z = c[1] + Math.sin(a) * d; }
    pickTarget(r); r.wait = 0.5;
  }
  function pickTarget(r, spawn) {
    const h = Tn.byId[r.home], c = h ? center(h) : [0, 0];
    for (let k = 0; k < 12; k++) {
      const a = rand(0, 6.283), d = rand(3, 8), x = c[0] + Math.cos(a) * d, z = c[1] + Math.sin(a) * d;
      if (Math.abs(x) < T.half - 1 && Math.abs(z) < T.half - 1 && !MZ.world.solidAtPoint(x, z)) { r.tx = x; r.tz = z; return; }
    }
    r.tx = r.x; r.tz = r.z;
  }
  function walk(r, dt) {
    if (r.wait > 0) { r.wait -= dt; r.mv = false; return; }
    const dx = r.tx - r.x, dz = r.tz - r.z, d = Math.hypot(dx, dz);
    if (d < 0.2) { r.wait = rand(1, 5); pickTarget(r); r.mv = false; return; }
    const sp = 1.0 * dt, nx = r.x + dx / d * Math.min(sp, d), nz = r.z + dz / d * Math.min(sp, d);
    if (MZ.world.solidAtPoint(nx, nz)) { pickTarget(r); r.wait = 0.5; r.mv = false; return; }
    r.x = nx; r.z = nz; r.ry = Math.atan2(dx, dz); r.mv = true;
  }
  /* 毎フレームの描き直し */
  const _s = new B.Vector3(1, 1, 1), _t = new B.Vector3(), _q = new B.Quaternion(), _m = new B.Matrix();   // 毎フレーム作らない作業用
  Tn.render = function (time) {
    Tn.pgroups.forEach(g => { g.n = 0; });
    Tn.residents.forEach(r => {
      const g = Tn.pgroups[r.v], bob = r.mv ? Math.abs(Math.sin(time * 7 + r.ph)) * 0.05 : 0;
      B.Quaternion.RotationAxisToRef(B.Axis.Y, r.ry, _q); _t.set(r.x, bob, r.z);
      B.Matrix.ComposeToRef(_s, _q, _t, _m); _m.copyToArray(g.buf, g.n * 16); g.n++;
    });
    Tn.pgroups.forEach(g => { g.mesh.thinInstanceCount = g.n; g.mesh.thinInstanceBufferUpdated('matrix'); });
  };

  /* ---------- 建築モード（見本・回す・置く・こわす） ---------- */
  let pvOk, pvBad, pv = null, pvKey = '';
  function pvMat(name, hex) {
    const m = new B.StandardMaterial(name, MZ.world.scene), c = B.Color3.FromHexString(hex);
    m.diffuseColor = c; m.emissiveColor = c.scale(0.5); m.specularColor = new B.Color3(0, 0, 0); m.alpha = 0.55; m.backFaceCulling = false;
    return m;
  }
  function pvMesh(key) {
    if (!pvOk) { pvOk = pvMat('pvOk', '#5FBF5F'); pvBad = pvMat('pvBad', '#D9534F'); }
    if (pvKey !== key) {
      if (pv) pv.dispose();
      pv = MZ.getModel(key).clone('preview'); pv.useVertexColors = false; pv.isVisible = true; pv.isPickable = false;
      pv.alwaysSelectAsActiveMesh = true; pv.renderingGroupId = 1; pvKey = key;   // 手前の建物に隠れない
    }
    pv.setEnabled(true);
    return pv;
  }
  function hidePreview() { if (pv) pv.setEnabled(false); }

  MZ.startBuild = function (key) {
    const d = MZ.BUILDS[key];
    if (!d || Tn.lockReason(key) || !MZ.afford(d.cost)) return false;
    Object.assign(MZ.build, { mode: 'place', key, ok: false, reason: '', target: 0 });
    MZ.ui.panel(false); MZ.ui.modeChanged(); return true;
  };
  MZ.startRemove = function () { Object.assign(MZ.build, { mode: 'remove', key: null, target: 0 }); MZ.ui.panel(false); MZ.ui.modeChanged(); };
  MZ.cancelBuild = function () { if (MZ.build.mode === 'none') return; MZ.build.mode = 'none'; hidePreview(); MZ.ui.modeChanged(); };
  MZ.rotate = function () { if (MZ.build.mode === 'place') MZ.build.r = (MZ.build.r + 1) % 4; };
  MZ.placeHere = function () {
    const b = MZ.build;
    if (b.mode !== 'place') return false;
    if (!b.ok) { MZ.ui.notice('ここには置けない（' + b.reason + '）'); return false; }
    const key = b.key;
    if (!MZ.place(key, b.gx, b.gz, b.r)) return false;
    if (!MZ.afford(MZ.BUILDS[key].cost)) { MZ.cancelBuild(); MZ.ui.notice('材料が足りなくなったので、建てるのを終わる'); }
    return true;
  };
  MZ.removeHere = function () {
    const b = MZ.build;
    if (b.mode !== 'remove' || !b.target) return false;
    if (Tn.byId[b.target].t === 'hut') { MZ.ui.notice('小屋はこわせない'); return false; }
    return MZ.remove(b.target);
  };

  Tn.updatePreview = function () {
    const b = MZ.build, W = MZ.world;
    if (b.mode === 'none') return;
    const p = MZ.player.rayPoint();
    if (b.mode === 'place') {
      const d = MZ.BUILDS[b.key], w = d.w;
      b.gx = Math.round(p.x / C + N / 2 - w / 2); b.gz = Math.round(p.z / C + N / 2 - w / 2);
      const r = Tn.canPlace(b.key, b.gx, b.gz); b.ok = r.ok; b.reason = r.reason;
      const m = pvMesh(b.key);
      m.position.set((b.gx - N / 2) * C + w * C / 2, 0.02, (b.gz - N / 2) * C + w * C / 2); m.rotation.y = b.r * Math.PI / 2; m.scaling.setAll(1);
      m.material = b.ok ? pvOk : pvBad;
    } else {
      const gx = MZ.cellOf(p.x), gz = MZ.cellOf(p.z);
      const id = (gx >= 0 && gz >= 0 && gx < N && gz < N) ? W.owner[gz * N + gx] : 0;
      b.target = id;
      if (id) {
        const bd = Tn.byId[id], m = pvMesh(bd.t), c = center(bd);
        m.position.set(c[0], 0.02, c[1]); m.rotation.y = bd.r * Math.PI / 2; m.scaling.setAll(1.03); m.material = pvBad;
      } else hidePreview();
    }
  };
  /* 主人公から T.near m 以内に、その種類の建物があるか */
  MZ.nearBuilding = function (t) {
    const p = MZ.state.player;
    return list().some(b => b.t === t && Math.hypot(center(b)[0] - p.x, center(b)[1] - p.z) <= T.near + MZ.BUILDS[t].w);
  };
})();

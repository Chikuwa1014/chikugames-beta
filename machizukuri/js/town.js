/* 荒野開拓記（仮） — 街（建築・道のつながり・移住者・住民の姿と仕事・段階）
   建物は state.chunks[区画のキー].layers.ground の配列（{ id, t, x, z, r }。x,z は「左上のマスがある区画の中」の座標、r は 0〜3）で持つ（保存の形）。
   動いている間は全体のマス（gx,gz）で扱う（Tn.gpos(b)）。持っている区画すべての建物を id の順に並べた配列が Tn.all。 */
(function () {
  const MZ = window.MZ, B = BABYLON, T = MZ.T, N = T.chunk, C = T.cell;
  const Tn = MZ.town = {
    meshes: {}, byId: {}, info: { homeSum: 0, water: 0, food: 0, shop: 0, cap: 0, unconnected: 0, paved: 0, low: {} },
    residents: [], resDirty: true, clock: 0, lastNote: {}, jobsRun: {}, people: []
  };
  MZ.build = { mode: 'none', key: null, r: 0, gx: 0, gz: 0, ok: false, reason: '', target: 0 };

  Tn.all = []; Tn.ck = {}; Tn.gp = {};   // 全建物（id 順）・建物 id → 区画のキー・建物 id → [gx, gz]（全体の左上のマス）。保存には入れない
  const list = () => Tn.all;
  /* 持っている区画の建物から Tn.all・Tn.ck・Tn.gp を作り直す（Tn.init・MZ.place・MZ.remove のときだけ） */
  function rebuildAll() {
    const all = [];
    MZ.world.landKeys.forEach(key => {
      const ch = MZ.state.chunks[key]; if (!ch) return;
      const c = key.indexOf(','), cx = +key.slice(0, c), cz = +key.slice(c + 1);
      ch.layers.ground.forEach(b => { Tn.ck[b.id] = key; Tn.gp[b.id] = [cx * N + b.x, cz * N + b.z]; all.push(b); });
    });
    all.sort((a, b) => a.id - b.id);
    Tn.all = all;
  }
  Tn.gpos = b => Tn.gp[b.id];
  const rand = (a, b) => a + Math.random() * (b - a);
  Tn.list = list;

  function cellsOf(b, f) {
    const w = MZ.BUILDS[b.t].w;
    const g = Tn.gp[b.id];
    for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) f(MZ.ci(g[0] + i, g[1] + j));
  }
  const center = b => { const w = MZ.BUILDS[b.t].w, g = Tn.gp[b.id]; return [(g[0] - N / 2) * C + w * C / 2, (g[1] - N / 2) * C + w * C / 2]; };
  Tn.center = center;

  /* ---------- 初期化（保存から作り直す） ---------- */
  Tn.init = function () {
    const W = MZ.world;
    W.owner.fill(0); W.solid.fill(0); Tn.byId = {}; Tn.ck = {}; Tn.gp = {};
    rebuildAll();
    Object.values(Tn.meshes).forEach(m => m.dispose()); Tn.meshes = {};
    list().forEach(b => addBuilding(b, true));
    MZ.gfx.ground.markAll();   // 塗り分けの表は、全部置いてから 1 回で書く
    /* 住民：部品ごとの thin instance の入れ物（服の色ちがいが 4 種。近い人だけ近く用）。決まりは gfx/looks.js */
    Tn.pgroups = MZ.gfx.people.init(T.maxPeople);
    Tn.recalc(true); Tn.stageCheck(true);
  };

  function addBuilding(b, bulk) {
    const W = MZ.world, d = MZ.BUILDS[b.t];
    Tn.byId[b.id] = b;
    cellsOf(b, ci => { W.owner[ci] = b.id; if (d.solid) W.solid[ci] = 1; });
    const c = center(b);
    Tn.meshes[b.id] = MZ.gfx.put(b.t, c[0], c[1], b.r * Math.PI / 2);   // .dispose() で消える
    if (!bulk) MZ.gfx.ground.mark(b);                                   // 道・畑・踏み固めの塗り分け、草のマス
    /* 建物と重なる採れる物は、二度と出ない */
    cellsOf(b, ci => { const ni = W.cellNode[ci]; if (ni >= 0 && W.takenOf(ni) !== undefined) W.forbid(ni); });
  }
  const has = t => list().some(b => b.t === t);
  Tn.has = has;
  Tn.count = t => list().filter(b => b.t === t).length;

  /* ---------- 置けるか ---------- */
  Tn.canPlace = function (key, gx, gz) {
    const W = MZ.world, d = MZ.BUILDS[key], w = d.w;
    for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) if (!MZ.landAt(gx + i, gz + j)) return { ok: false, reason: '土地の外' };
    for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) {
      const ci = MZ.ci(gx + i, gz + j);
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
    const o = MZ.chunkOfCell(gx, gz), ch = s.chunks[o.key];   // 左上のマスがある区画に入れる
    if (!ch) return false;
    Object.keys(d.cost).forEach(k => { s.inv[k] -= d.cost[k]; });
    const b = { id: s.nextId++, t: key, x: o.lx, z: o.lz, r: r || 0 };
    ch.layers.ground.push(b); rebuildAll(); addBuilding(b);
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
    MZ.gfx.ground.mark(b);
    const L = s.chunks[Tn.ck[id]].layers.ground; L.splice(L.indexOf(b), 1);
    delete Tn.ck[id]; delete Tn.gp[id]; rebuildAll();
    delete s.timers.jobs[id];
    Tn.recalc(); MZ.saveNow();
    MZ.ui.notice(d.name + 'をこわした' + (back.length ? '（' + back.join('・') + ' もどる）' : ''));
    return true;
  };

  /* ---------- 道のつながり・移住の上限 ---------- */
  Tn.recalc = function (silent) {
    const W = MZ.world, conn = new Set(), q = [];
    /* そのマスの建物の表（無ければ null）。道は表の road の欄で決める（土の道・石畳がまざってつながる） */
    const defAt = ci => { const id = W.owner[ci]; return id ? MZ.BUILDS[Tn.byId[id].t] : null; };
    const isRd = ci => { const d = defAt(ci); return !!(d && d.road); };
    /* となりの 4 マス（全体の表の中。世界の外は入れない。番号から (gx, gz) へ戻すときは G0 を足す） */
    const GN = MZ.GN;
    const nb = ci => { const x = ci % GN, z = (ci - x) / GN, r = []; if (x > 0) r.push(ci - 1); if (x < GN - 1) r.push(ci + 1); if (z > 0) r.push(ci - GN); if (z < GN - 1) r.push(ci + GN); return r; };
    list().filter(b => b.t === 'hut').forEach(h => cellsOf(h, ci => nb(ci).forEach(n => { if (isRd(n) && !conn.has(n)) { conn.add(n); q.push(n); } })));
    while (q.length) { const c = q.shift(); nb(c).forEach(n => { if (isRd(n) && !conn.has(n)) { conn.add(n); q.push(n); } }); }
    let home = 0, water = 0, food = 0, shopSum = 0, unc = 0, paved = 0;
    conn.forEach(ci => { if (defAt(ci).pave) paved++; });
    list().forEach(b => {
      const d = MZ.BUILDS[b.t];
      if (d.water) water += d.water;
      if (d.food) food += d.food;
      if (d.shop) shopSum += d.shop;
      if (d.home) {
        /* つながった道に 1 マスでも面した家だけ数える。面した道に pave があれば、その家は pave（いちばん大きい物）だけ多く住める（1 軒に 1 回） */
        let ok = false, pv = 0;
        cellsOf(b, ci => nb(ci).forEach(n => { if (conn.has(n)) { ok = true; pv = Math.max(pv, defAt(n).pave || 0); } }));
        if (ok) home += d.home + pv; else unc++;
      }
    });
    water += T.baseWater; food += T.baseFood;
    const shop = T.shopFree + shopSum;   // 店：商店に人手が無くても数える
    const cap = Math.min(home, water, food, shop), mn = cap;
    Tn.info = { homeSum: home, water, food, shop, cap, unconnected: unc, paved, low: { home: home === mn, water: water === mn, food: food === mn, shop: shop === mn }, roads: conn.size };
    Tn.resDirty = true; Tn.jobsDirty = true;
    Tn.rescue = true;
    if (!silent && MZ.state.pop > cap) MZ.state.timers.migrate = 0;
  };

  /* ---------- 仕事 ---------- */
  /* 人の割り当て：jobs のある建物へ id の順に。足りなければその建物は止まる（商店の staff は割り当てに入れない＝人口から引かない） */
  Tn.jobs = function () {
    if (Tn.jobsCache && !Tn.jobsDirty && Tn.jobsPop === MZ.state.pop) return Tn.jobsCache;   // 建物・人口が変わったときだけ作り直す
    Tn.jobsDirty = false; Tn.jobsPop = MZ.state.pop;
    let left = MZ.state.pop; const r = [];
    list().forEach(b => { const d = MZ.BUILDS[b.t]; if (d.jobs) { const run = left >= d.jobs; const staff = Math.min(left, d.jobs); if (run) left -= d.jobs; r.push({ id: b.id, t: b.t, running: run, need: d.jobs, staff }); } });
    Tn.jobsCache = r; Tn.jobsById = {}; r.forEach(j => { Tn.jobsById[j.id] = j; });
    return r;
  };
  /* 自動でたまる上限（どの物も同じ）：T.autoCap ＋ 倉庫の store */
  MZ.autoCap = () => T.autoCap + list().reduce((a, b) => a + (MZ.BUILDS[b.t].store || 0), 0);
  const recipeOf = key => MZ.RECIPES.find(r => r.key === key);
  const givesOf = (d, b) => { if (d.craft) { const r = b.mk && recipeOf(b.mk); return r ? r.give : null; } return d.makes; };
  /* 仕事場ごとの状態：{ st: 'run' | 'staff' | 'off' | 'short' | 'full', text, what }。what は「何をつくるか」（板・石 3 など。表示用） */
  Tn.workState = function (b) {
    const d = MZ.BUILDS[b.t], s = MZ.state;
    Tn.jobs();
    const j = Tn.jobsById[b.id], cap = MZ.autoCap();
    if (!j) return { st: 'off', text: '', what: '' };
    if (!j.running) return { st: 'staff', text: '人が足りない（あと ' + (j.need - j.staff) + ' 人）', what: '' };
    let what = '', st = 'run', text = '';
    if (d.craft) {
      const r = b.mk && recipeOf(b.mk);
      if (!r) return { st: 'off', text: '止めている（つくる物をえらぶ）', what: '' };
      what = r.name;
      if (!MZ.afford(r.cost)) return { st: 'short', text: '材料が足りない（' + r.name + 'には ' + Object.keys(r.cost).map(k => MZ.ITEMS[k] + ' ' + r.cost[k]).join('・') + '）', what };
      if (Object.keys(r.give).every(k => s.inv[k] >= cap)) st = 'full';
    } else {
      what = Object.keys(d.makes).map(k => MZ.ITEMS[k] + (d.makes[k] > 1 ? ' ' + d.makes[k] : '')).join('・');
      if (Object.keys(d.makes).every(k => s.inv[k] >= cap)) st = 'full';
    }
    if (st === 'full') {
      const gk = Object.keys(givesOf(d, b)).find(k => s.inv[k] >= cap);
      return { st, text: '上限いっぱい（' + MZ.ITEMS[gk] + ' ' + s.inv[gk] + '／' + cap + '。倉庫で上限がふえる）', what };
    }
    const t = s.timers.jobs[b.id] === undefined ? d.every : s.timers.jobs[b.id];
    return { st: 'run', text: '動いている（次まで ' + Math.max(1, Math.ceil(t)) + ' 秒）', what };
  };
  /* 工房のつくる物をえらぶ。k は craft の中の物か null（止める）。保存して true。工房でない・知らない物なら false */
  MZ.setMake = function (id, k) {
    const b = Tn.byId[id]; if (!b) return false;
    const d = MZ.BUILDS[b.t];
    if (!d.craft || !(k === null || d.craft.indexOf(k) >= 0)) return false;
    if (k === null) delete b.mk; else b.mk = k;
    MZ.state.timers.jobs[id] = d.every;   // えらびなおしたら、数えなおす
    MZ.ui.dirty = true; MZ.saveNow();
    return true;
  };
  Tn.stageCheck = function (silent) {
    const s = MZ.state;
    for (let i = MZ.STAGES.length - 1; i > s.stage; i--) {
      if (s.pop >= MZ.STAGES[i].pop) {
        s.stage = i;
        if (!silent) {
          MZ.ui.banner(MZ.STAGES[i].banner || MZ.STAGES[i].name + 'になった！');
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
    if (s.timers.migrate >= (s.stage >= T.villageStage ? T.migrateVillage : T.migrate)) {
      s.timers.migrate = 0;
      const cap = Tn.info.cap;
      if (s.pop < cap) { s.pop++; Tn.resDirty = true; MZ.ui.notice('1 人移住してきた（人口 ' + s.pop + '）'); Tn.stageCheck(); MZ.saveNow(); }
      else if (s.pop > cap) {
        /* 古い保存で、人口が 50 をこえていて商店が無い街：最初に出ていくときに 1 回だけ、わけを伝える */
        if (Tn.info.low.shop && !Tn.shopWarned) { Tn.shopWarned = true; MZ.ui.notice('店が足りないので人が出ていく。商店を建てよう', 'warn'); }
        s.pop--; Tn.resDirty = true; MZ.ui.notice('1 人出ていった（人口 ' + s.pop + '）'); MZ.saveNow();
      }
    }
    /* 仕事：動いている（run）ときだけ残り秒を減らす。止まっている間（full・short・off）は every のまま止めておく */
    Tn.jobs().forEach(j => {
      const b = Tn.byId[j.id], d = MZ.BUILDS[j.t];
      if (!j.running || !b) return;
      const ws = Tn.workState(b);
      if (ws.st !== 'run') { s.timers.jobs[j.id] = d.every; return; }
      let t = s.timers.jobs[j.id]; if (t === undefined) t = d.every;
      t -= dt;
      if (t <= 0) {
        t += d.every;
        const txt = [], cap = MZ.autoCap();
        if (d.craft) {
          const r = recipeOf(b.mk);
          Object.keys(r.cost).forEach(k => { s.inv[k] -= r.cost[k]; });
          Object.keys(r.give).forEach(k => { s.inv[k] += r.give[k]; txt.push('＋' + r.give[k] + ' ' + MZ.ITEMS[k]); });
        } else {
          /* 1 つずつ見て、上限に達していない物だけ足す（1 回で上限を少しこえてよい） */
          Object.keys(d.makes).forEach(k => { if (s.inv[k] < cap) { s.inv[k] += d.makes[k]; txt.push('＋' + d.makes[k] + ' ' + MZ.ITEMS[k]); } });
        }
        if (txt.length && !(Tn.lastNote[j.t] > Tn.clock - 60)) { Tn.lastNote[j.t] = Tn.clock; MZ.ui.notice(d.name + '：' + txt.join(' ')); }
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
  /* 歩く姿は min(人口, T.maxPeople) 人。それぞれに「よりどころ」の建物（r.home に id）を 1 つ決め、そのまわり 3〜8m を歩く（家でも仕事場でも同じ）。
     分け方：働く人の数 W ＝（人を割り当てた仕事場の人数）＋（商店の数 × staff）。W は人口を上限とする。
     仕事場に round(描く数 × W ／ 人口) 人を、仕事場ごとの人数の割合で割り振り、残りは家に home の割合で割り振る。
     割り振りを直すのは Tn.resDirty が立ったときだけ（建てた・こわした・人口が変わった）。よりどころがまだ残っている人は、数があふれないかぎり動かさない */
  function share(slots, n) {   // slots：[{ id, w }]。重みの割合で n 人を割り振る（最大剰余法）。返すのは { id: 人数 }
    const out = {}, tot = slots.reduce((a, x) => a + x.w, 0);
    if (!slots.length || n <= 0 || tot <= 0) return out;
    let used = 0; const rem = [];
    slots.forEach(x => { const q = n * x.w / tot, f = Math.floor(q); out[x.id] = f; used += f; rem.push([q - f, x.id]); });
    rem.sort((p, q) => q[0] - p[0]);
    for (let i = 0; used < n; i++, used++) out[rem[i % rem.length][1]]++;
    return out;
  }
  function syncResidents() {
    Tn.resDirty = false;
    const s = MZ.state, want = Math.min(s.pop, T.maxPeople), R = Tn.residents;
    while (R.length > want) R.pop();
    while (R.length < want) R.push({ home: 0, x: 0, z: 0, tx: 0, tz: 0, wait: rand(0, 3), ry: rand(0, 6.28), v: R.length % 4, mv: false, ph: rand(0, 6), fresh: true });
    /* 仕事場（人を割り当てた物と商店）・家 */
    const work = [], homes = [];
    Tn.jobs().forEach(j => { if (j.running) work.push({ id: j.id, w: j.need }); });
    list().forEach(b => { const d = MZ.BUILDS[b.t]; if (d.staff) work.push({ id: b.id, w: d.staff }); if (d.home) homes.push({ id: b.id, w: d.home }); });
    const W = Math.min(s.pop, work.reduce((a, x) => a + x.w, 0));
    const nW = s.pop > 0 && work.length ? Math.min(want, Math.round(want * W / s.pop)) : 0;
    const target = share(work, nW), th = share(homes, want - nW);
    Object.keys(th).forEach(k => { target[k] = th[k]; });
    if (!Object.keys(target).length || Object.keys(target).every(k => !target[k])) { if (Tn.byId[1]) target[1] = want; }   // 家も仕事場もなければ小屋のまわり
    /* よりどころが残っていて、数があふれない人は動かさない。それ以外の人を、足りない所へ */
    const cnt = {}; Object.keys(target).forEach(k => { cnt[k] = 0; });
    const loose = [];
    R.forEach(r => { if (r.home && target[r.home] !== undefined && cnt[r.home] < target[r.home]) cnt[r.home]++; else loose.push(r); });
    loose.forEach(r => {
      let best = null; Object.keys(target).forEach(k => { if (cnt[k] < target[k] && (best === null || target[k] - cnt[k] > target[best] - cnt[best])) best = k; });
      if (best === null) best = Object.keys(target)[0];
      if (best === undefined) return;
      cnt[best] = (cnt[best] || 0) + 1;
      r.home = +best;
      if (r.fresh) {   // 新しい住民は、よりどころの前に現れる。動かされた人は、いまの場所から歩いていく
        r.fresh = false;
        const h = Tn.byId[r.home], c = h ? center(h) : [0, 0];
        r.x = c[0]; r.z = c[1] - 3; pickTarget(r, true); r.x = r.tx; r.z = r.tz;
      } else pickTarget(r);
    });
  }
  /* 建物の中に入ってしまった住民を、家の前へ移す */
  function rescueRes(r) {
    if (!MZ.world.solidAtPoint(r.x, r.z)) return;
    const h = Tn.byId[r.home], c = h ? center(h) : [0, 0];
    r.x = c[0]; r.z = c[1] - 3;
    for (let k = 0; k < 40 && (MZ.world.solidAtPoint(r.x, r.z) || !MZ.world.inLand(r.x, r.z, 1)); k++) { const a = rand(0, 6.283), d = 3 + k * 0.3; r.x = c[0] + Math.cos(a) * d; r.z = c[1] + Math.sin(a) * d; }
    pickTarget(r); r.wait = 0.5;
  }
  function pickTarget(r, spawn) {
    const h = Tn.byId[r.home], c = h ? center(h) : [0, 0];
    for (let k = 0; k < 12; k++) {
      const a = rand(0, 6.283), d = rand(3, 8), x = c[0] + Math.cos(a) * d, z = c[1] + Math.sin(a) * d;
      if (MZ.world.inLand(x, z, 1) && !MZ.world.solidAtPoint(x, z)) { r.tx = x; r.tz = z; return; }
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
    const G = MZ.gfx, cam = MZ.world.camera.position;
    Tn.pgroups.forEach(g => { g.n = 0; });
    Tn.residents.forEach(r => {
      const dx = r.x - cam.x, dz = r.z - cam.z, g = G.people.pick(r.v, dx * dx + dz * dz), bob = r.mv ? Math.abs(Math.sin(time * 7 + r.ph)) * 0.05 : 0;
      B.Quaternion.RotationAxisToRef(B.Axis.Y, r.ry, _q); _t.set(r.x, bob, r.z);
      B.Matrix.ComposeToRef(_s, _q, _t, _m);
      G.people.write(g, _m, r.mv ? Math.sin(time * 7 + r.ph) * G.people.swing(r.v) : 0);
    });
    G.people.flush();
  };

  /* ---------- 建築モード（見本・回す・置く・こわす） ---------- */
  let pv = null, pvKey = '';
  /* 見本（緑＝置ける、赤＝置けない）。形は gfx/looks.js の preview が作る（根の TransformNode） */
  function pvMesh(key) {
    if (pvKey !== key) {
      if (pv) pv.dispose();
      pv = MZ.gfx.preview(key); pvKey = key;
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
      MZ.gfx.setPreviewOk(m, b.ok);
    } else {
      const gx = MZ.cellOf(p.x), gz = MZ.cellOf(p.z);
      const id = MZ.inWorld(gx, gz) ? W.owner[MZ.ci(gx, gz)] : 0;
      b.target = id;
      if (id) {
        const bd = Tn.byId[id], m = pvMesh(bd.t), c = center(bd);
        m.position.set(c[0], 0.02, c[1]); m.rotation.y = bd.r * Math.PI / 2; m.scaling.setAll(1.03); MZ.gfx.setPreviewOk(m, false);
      } else hidePreview();
    }
  };
  /* 主人公から T.near + w m 以内にある仕事場か商店のうち、いちばん近い 1 つ（無ければ null）。画面の下の 1 行（#wk）に使う */
  Tn.nearWork = function () {
    const p = MZ.state.player; let best = null, bd = Infinity;
    list().forEach(b => {
      const d = MZ.BUILDS[b.t]; if (!d.jobs && !d.shop) return;
      const c = center(b), dist = Math.hypot(c[0] - p.x, c[1] - p.z);
      if (dist <= T.near + d.w && dist < bd) { bd = dist; best = b; }
    });
    return best;
  };
  /* 主人公から建物 b への向き（北＝ +z、東＝ +x。八方位）と距離（m、四捨五入） */
  const DIRS = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
  Tn.bearing = function (b) {
    const p = MZ.state.player, c = center(b), dx = c[0] - p.x, dz = c[1] - p.z;
    const a = Math.atan2(dx, dz), i = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
    return { dir: DIRS[i], dist: Math.round(Math.hypot(dx, dz)) };
  };
  /* 主人公から T.near m 以内に、その種類の建物があるか */
  MZ.nearBuilding = function (t) {
    const p = MZ.state.player;
    return list().some(b => b.t === t && Math.hypot(center(b)[0] - p.x, center(b)[1] - p.z) <= T.near + MZ.BUILDS[t].w);
  };
})();

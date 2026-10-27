/* ほりほりもぐもぐ — ゲームの中身
   ・自分の動き（移動・掘る）は自分の端末で決める
   ・体力・ダメージ・弾・罠・アイテムの取り合い・敵の動き・勝ち負けは「親」が決めて配る（共通ルール 10 章）
   ・ひとりプレイは、自分が親（通信なし）
   メッセージ：子→親 は G.toHost(m)、親→全員 は hostEmit(ev)（親の自分にも onEvent で届く） */
(function () {
  const HM = window.HM, T = HM.T, M4 = HM.M4;
  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    len: a => Math.hypot(a[0], a[1], a[2]),
    norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  };
  HM.V = V;
  const now = () => performance.now() / 1000;
  const dirOf = (yaw, pitch) => [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  const center = p => [p[0], p[1] + 0.5, p[2]];          // ちくわ君の体の中心
  const bossCenter = p => [p[0], p[1] + 0.8, p[2]];

  const G = HM.G = {
    running: false, over: false, mode: 'solo', isHost: true,
    world: null, R: null,
    me: null,                 // 自分（動き・持ち物）
    players: new Map(),       // pid → 体力などの記録（親が決める。子は親の知らせで更新）
    bots: [], proj: [], traps: new Map(), pickups: new Map(), pops: [], crumbs: [],
    order: [], succ: null,    // 入った順と、親を引き継ぐ人
    timeLeft: 0, t: 0,
    sens: 1,
    onEnd: null, onHud: null, onEvent2: null,
    toHost: null,             // 子→親（ひとり・親なら自分の hostOnMsg）
    broadcast: null           // 親→子（ひとりなら何もしない）
  };
  let seqId = 1;

  /* ================= 始める ================= */
  /**
   * opt: { mode, seed, me:{pid,name,color}, roster:[{pid,name,color,spawn}], isHost, bots:[{key,spawn}] }
   */
  G.start = function (opt) {
    if (G.meshes && G.R) for (const m of G.meshes.values()) G.R.free(m);
    G.meshes = new Map();
    G.mode = opt.mode;
    G.isHost = !!opt.isHost;
    const spawns = opt.roster.map(r => r.spawn).concat((opt.bots || []).map(b => b.spawn));
    G.world = new HM.World(opt.seed, spawns, opt.size);
    G.size = opt.size;
    G.players = new Map();
    G.order = opt.roster.map(r => r.pid);
    for (const r of opt.roster) {
      G.players.set(r.pid, {
        pid: r.pid, name: r.name, color: r.color, p: r.spawn.slice(), yw: 0, pt: 0, mv: 0, lz: 0,
        hp: T.player.hp, alive: true, armorUntil: 0, armorLeft: 0, invUntil: 0, why: '', vis: r.spawn.slice()
      });
    }
    const mine = opt.roster.find(r => r.pid === opt.me.pid);
    G.me = {
      pid: opt.me.pid, name: opt.me.name, color: mine.color,
      p: mine.spawn.slice(), v: [0, 0, 0], yaw: Math.random() * Math.PI * 2, pitch: -0.15, onGround: false,
      inv: [], sel: -1, cool: { dig: 0, mdig: 0, punch: 0, item: 0 }, slipUntil: 0, knockUntil: 0,
      laser: false, laserCarve: 0, swing: 0, energyKey: null, requested: new Set(), fellSent: false, spectate: null
    };
    // 最初は敵のいない方を向く必要はないので、まん中を向く
    const N = G.world.N;
    G.me.yaw = Math.atan2(N / 2 - G.me.p[0], N / 2 - G.me.p[2]);
    // レーダーの届く距離（小さいフィールドでは短く）
    G.radarRange = Math.min(T.radar.range, N * 0.45);
    G.bots = (opt.bots || []).map((b, i) => ({
      id: 'b' + i, key: b.key, p: b.spawn.slice(), hp: T.bosses[b.key].hp, max: T.bosses[b.key].hp, alive: true,
      aware: false, cool: 1, digCool: 0, kv: [0, 0, 0], slipUntil: 0, yaw: 0, wob: Math.random() * 10, deadAt: 0, hurtAt: 0
    }));
    G.proj = []; G.traps = new Map(); G.pickups = new Map(); G.pops = []; G.crumbs = [];
    G.timeLeft = opt.mode === 'solo' ? T.solo.time : 0;
    G.t = 0; G.over = false; G.running = true;
    G.hurtAt = 0;   // 前の試合の時刻が残ると、G.t が追いつくまで赤いままになる
    G.pendingDigs = [];
    G.stateTimer = 0; G.snapTimer = 0; G.laserTick = new Map();
    G.lastSnapAt = now();
    G.meshes = new Map();
    G.startedAt = now();
    G.digLog = null;
    G.digEnd = T.digTime;      // ほりほりタイムが終わる時刻（試合の時間 G.t で数える）
  };

  /** ほりほりタイム中か（攻撃・罠は使えない。落ちても天井へ戻る） */
  G.inDig = () => G.running && G.t < (G.digEnd || 0);

  G.stop = function () {
    G.running = false;
    if (G.meshes && G.R) for (const m of G.meshes.values()) G.R.free(m);
    G.meshes = new Map();
  };

  /* ================= 自分の動き ================= */
  const PW = T.player.w / 2, PH = T.player.h;
  function collides(x, y, z) {
    const w = G.world;
    const x0 = Math.floor(x - PW), x1 = Math.floor(x + PW - 1e-6);
    const y0 = Math.floor(y), y1 = Math.floor(y + PH - 1e-6);
    const z0 = Math.floor(z - PW), z1 = Math.floor(z + PW - 1e-6);
    for (let yy = y0; yy <= y1; yy++) for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++) {
      if (w.get(xx, yy, zz) !== 0) return true;
    }
    return false;
  }
  G.collides = collides;

  /** 入力：inp = { mx, mz（-1〜1）, jump, main, item } */
  function updateMe(dt, inp) {
    const me = G.me, P = T.player, t = G.t;
    const rec = G.players.get(me.pid);
    if (!rec || !rec.alive) return;
    const f = [Math.sin(me.yaw), 0, Math.cos(me.yaw)], r = [-Math.cos(me.yaw), 0, Math.sin(me.yaw)];
    let wx = f[0] * inp.mz + r[0] * inp.mx, wz = f[2] * inp.mz + r[2] * inp.mx;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    const slipping = t < me.slipUntil, knocked = t < me.knockUntil;
    if (slipping) {
      // しらたき：すべって、入力がほとんど効かない
      me.v[0] += wx * P.speed * 0.6 * dt; me.v[2] += wz * P.speed * 0.6 * dt;
      me.v[0] *= Math.pow(0.85, dt); me.v[2] *= Math.pow(0.85, dt);
    } else if (knocked) {
      me.v[0] = me.v[0] * Math.pow(0.2, dt) + wx * P.speed * dt * 2;
      me.v[2] = me.v[2] * Math.pow(0.2, dt) + wz * P.speed * dt * 2;
    } else {
      const k = me.onGround ? 1 : 0.6;
      me.v[0] += (wx * P.speed - me.v[0]) * Math.min(1, dt * 14 * k);
      me.v[2] += (wz * P.speed - me.v[2]) * Math.min(1, dt * 14 * k);
    }
    me.v[1] -= P.gravity * dt;
    if (me.v[1] < -30) me.v[1] = -30;
    if (inp.jump && me.onGround) { me.v[1] = P.jump; me.onGround = false; }

    // 小さく分けて動かす（速く落ちても床をすり抜けない）
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(me.v[0]), Math.abs(me.v[1]), Math.abs(me.v[2])) * dt / 0.3));
    const sdt = dt / steps;
    let blocked = false;
    me.onGround = false;
    for (let s = 0; s < steps; s++) {
      for (const ax of [0, 2]) {
        const np = me.p.slice(); np[ax] += me.v[ax] * sdt;
        if (!collides(np[0], np[1], np[2])) { me.p = np; continue; }
        // 1 マスの段差は自動でのぼる
        const up = np.slice(); up[1] = Math.floor(me.p[1] + 1.001) + 0.001;
        if (up[1] - me.p[1] <= 1.05 && !collides(up[0], up[1], up[2]) && !collides(me.p[0], up[1], me.p[2])) {
          me.p = up; continue;
        }
        blocked = true;
        me.v[ax] = 0;
      }
      const np = me.p.slice(); np[1] += me.v[1] * sdt;
      if (!collides(np[0], np[1], np[2])) me.p = np;
      else {
        if (me.v[1] < 0) { me.onGround = true; me.p[1] = Math.floor(np[1]) + 1; }
        else me.p[1] = Math.ceil(np[1] + PH) - PH - 0.001;
        me.v[1] = 0;
      }
    }
    // 歩いて壁にぶつかったら、自動で掘る
    me.cool.mdig -= dt;
    if (blocked && wl > 0.3 && me.cool.mdig <= 0 && !knocked) {
      me.cool.mdig = T.dig.moveCooldown;
      const d = [wx / Math.max(wl, 1e-6), 0, wz / Math.max(wl, 1e-6)];
      digAt(me.p[0] + d[0] * 1.3, me.p[1] + 0.9, me.p[2] + d[2] * 1.3, T.dig.moveRadius, true);
    }
    // フィールドの外（はしの外）にも出られる。下に落ちたら、おでん鍋へ
    if (me.p[1] < T.potY + 0.5 && !me.fellSent) {
      me.fellSent = true;
      HM.sfx.splash();
      G.toHost({ t: 'fell' });
    }
    rec.p = me.p.slice(); rec.yw = me.yaw; rec.pt = me.pitch; rec.mv = wl > 0.1 ? 1 : 0; rec.lz = me.laser ? 1 : 0;
  }

  /** 自分が掘る（すぐ自分の地形を変え、まとめて親へ送る） */
  function digAt(x, y, z, r, sound) {
    applyDig(x, y, z, r, true);
    G.pendingDigs.push([+x.toFixed(2), +y.toFixed(2), +z.toFixed(2), r]);
    if (sound) HM.sfx.dig(0.8);
  }
  /** 地形を掘り、出てきた具をアイテムにする（全員の端末で同じことが起きる） */
  function applyDig(x, y, z, r, crumbs) {
    const got = G.world.carve(x, y, z, r);
    for (const key of got) spawnPickup(key);
    if (crumbs && G.crumbs.length < 120) {
      for (let i = 0; i < 4; i++) G.crumbs.push({ p: [x + (Math.random() - 0.5) * r, y + (Math.random() - 0.3) * r, z + (Math.random() - 0.5) * r], v: [(Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3], life: 0.6 + Math.random() * 0.4 });
    }
  }
  function spawnPickup(key) {
    if (G.pickups.has(key) || (G.taken && G.taken.has(key))) return;
    const [x, y, z] = key.split(',').map(Number);
    G.pickups.set(key, { key, type: G.world.itemType(key), p: [x + 1, y + 0.7, z + 1], born: G.t });
  }

  /* ---------- カメラ ---------- */
  G.camera = function (smooth) {
    const me = G.me;
    let focus = me, yaw = me.yaw, pitch = me.pitch;
    const rec = G.players.get(me.pid);
    if (rec && !rec.alive && me.spectate) {
      const o = G.players.get(me.spectate);
      if (o) { focus = { p: o.vis }; }
    }
    const target = [focus.p[0], focus.p[1] + 1.3, focus.p[2]];
    const d = dirOf(yaw, pitch);
    // 後方視点（far）は近く（near）より後ろへ下がる。どちらも壁があれば、その手前で止まる
    //（カメラが豆腐の中に入ると、まわりのトンネルが透けて見えるため）
    const far = G.camMode === 'far';
    const maxD = far ? T.cam.farDist : 3.0, lift = far ? T.cam.farUp : 0.15;
    let dist = maxD;
    for (let s = 0.2; s <= maxD; s += 0.1) {
      const q = [target[0] - d[0] * s, target[1] - d[1] * s + lift * s / maxD, target[2] - d[2] * s];
      if (G.world.solidAt(q[0], q[1], q[2]) || G.world.solidAt(q[0], q[1] + 0.15, q[2]) || G.world.solidAt(q[0], q[1] - 0.15, q[2]) ||
        G.world.solidAt(q[0] + 0.15, q[1], q[2]) || G.world.solidAt(q[0] - 0.15, q[1], q[2]) || G.world.solidAt(q[0], q[1], q[2] + 0.15) || G.world.solidAt(q[0], q[1], q[2] - 0.15)) {
        dist = Math.max(0.15, s - 0.3); break;
      }
    }
    // 壁から離れたときは、ゆっくり下がる（寄るときはすぐ）
    if (G.camDist == null || dist < G.camDist) G.camDist = dist;
    else if (smooth) {
      const t = performance.now() / 1000, dt = Math.min(0.1, t - (G.camT || t));
      G.camT = t;
      G.camDist = Math.min(dist, G.camDist + 6 * dt);   // 1 秒に 6 マスまで下がる
    }
    dist = G.camDist;
    const eye = [target[0] - d[0] * dist, target[1] - d[1] * dist + lift * dist / maxD, target[2] - d[2] * dist];
    // 後方視点は、自分より少し上を見る（自分が画面の下寄りになり、前が見やすい）
    const look = far ? V.add(V.add(target, V.mul(d, 5)), [0, T.cam.farLookUp * Math.min(1, dist / 2), 0]) : V.add(target, d);
    const dir = far ? V.norm(V.sub(look, eye)) : d;
    // ねらいのレイの出発点：見ている線の上で、自分の頭のあたり
    return { eye, target, dir, dist, near: 0.05, ro: V.add(eye, V.mul(dir, dist)) };
  };

  /* ---------- ねらい・攻撃・アイテム ---------- */
  function enemiesOfMe() {
    const list = [];
    for (const b of G.bots) if (b.alive) list.push({ id: b.id, c: bossCenter(b.p), r: 0.8 });
    for (const pl of G.players.values()) if (pl.pid !== G.me.pid && pl.alive) list.push({ id: pl.pid, c: center(pl.vis), r: 0.6 });
    return list;
  }
  G.enemiesOfMe = enemiesOfMe;

  /** 掘る・なぐるボタン：前に敵がいればなぐる、いなければねらった所を掘る */
  function mainAction(cam) {
    const me = G.me;
    const c = center(me.p), f = [Math.sin(me.yaw), 0, Math.cos(me.yaw)];
    const near = enemiesOfMe().find(e => {
      const d = V.sub(e.c, c), l = V.len(d);
      return l < T.punch.reach + e.r && V.dot(V.norm([d[0], 0, d[2]]), f) > 0.3;
    });
    if (near && !G.inDig()) {
      if (me.cool.punch > 0) return;
      me.cool.punch = T.punch.cooldown;
      me.swing = G.t;
      HM.sfx.punch();
      G.toHost({ t: 'melee', k: 'punch', o: c, d: f });
      return;
    }
    if (me.cool.dig > 0) return;
    me.cool.dig = T.dig.aimCooldown;
    const hit = G.world.raycast(cam.ro, cam.dir, T.dig.aimReach);
    if (hit && V.dist(hit.p, c) < T.dig.aimReach + 0.6) {
      const q = V.add(hit.p, V.mul(cam.dir, 0.6));
      digAt(q[0], q[1], q[2], T.dig.aimRadius, true);
      me.swing = G.t;
    }
  }

  function invOf(type) { return G.me.inv.find(s => s.type === type); }
  G.addItem = function (type) {
    const I = T.items[type], me = G.me;
    let s = invOf(type);
    const add = type === 'otama' ? I.energy : (I.count || 1);
    if (s) s.count += add;
    else { s = { type, count: add }; me.inv.push(s); if (me.sel < 0) me.sel = me.inv.length - 1; }
    me.lastItem = type;
    G.onHud && G.onHud();
  };
  function useUp(slot, n) {
    slot.count -= n;
    if (slot.count <= 1e-6) {
      const i = G.me.inv.indexOf(slot);
      G.me.inv.splice(i, 1);
      if (G.me.sel >= G.me.inv.length) G.me.sel = G.me.inv.length - 1;
    }
    G.onHud && G.onHud();
  }

  /** アイテムボタン（押した瞬間 first=true、押している間 first=false） */
  function itemAction(cam, first, dt) {
    const me = G.me, slot = me.inv[me.sel];
    if (!slot) return;
    const I = T.items[slot.type], c = center(me.p);
    if (G.inDig() && T.digBlocked.includes(slot.type)) {
      if (first) G.toast && G.toast('ほりほりタイム中は使えない！（あと ' + Math.ceil(G.digEnd - G.t) + ' 秒）');
      return;
    }
    const hand = [c[0] + Math.sin(me.yaw) * 0.45, c[1] + 0.15, c[2] + Math.cos(me.yaw) * 0.45];
    // ねらい：カメラのまん中の先
    const hit = G.world.raycast(cam.ro, cam.dir, 60);
    const aimPt = hit ? hit.p : V.add(cam.ro, V.mul(cam.dir, 60));
    const aimDir = V.norm(V.sub(aimPt, hand));
    switch (slot.type) {
      case 'dashi':
      case 'daikon':
        if (me.cool.item > 0) return;
        me.cool.item = I.cooldown;
        HM.sfx.shoot();
        G.toHost({ t: 'shoot', k: slot.type, o: hand, d: aimDir });
        useUp(slot, 1);
        return;
      case 'otama':
        me.laser = true;
        me.laserDir = aimDir;
        useUp(slot, dt);
        me.laserCarve -= dt;
        if (me.laserCarve <= 0) {
          me.laserCarve = 0.1;
          HM.sfx.laser();
          const h = G.world.raycast(hand, aimDir, I.range);
          if (h) { const q = V.add(h.p, V.mul(aimDir, 0.4)); digAt(q[0], q[1], q[2], I.carveR, false); }
        }
        return;
      default:
        if (!first) return;
        if (me.cool.item > 0) return;
        me.cool.item = 0.35;
        if (slot.type === 'karashi' || slot.type === 'shirataki') {
          if (!me.onGround) { G.toast && G.toast('地面に立って置こう'); return; }
          G.toHost({ t: 'trap', k: slot.type, p: [me.p[0], Math.floor(me.p[1] + 0.01), me.p[2]] });
          useUp(slot, 1);
        } else if (slot.type === 'gobou') {
          me.swing = G.t;
          HM.sfx.bat();
          G.toHost({ t: 'melee', k: 'gobou', o: c, d: [Math.sin(me.yaw), 0, Math.cos(me.yaw)] });
          useUp(slot, 1);
        } else {
          G.toHost({ t: 'use', k: slot.type });
          useUp(slot, 1);
        }
    }
  }

  /* ================= 1 コマ ================= */
  G.update = function (dt, inp) {
    if (!G.running) return;
    G.t += dt;
    const me = G.me;
    for (const k in me.cool) me.cool[k] -= dt;
    const cam0 = G.camera();
    me.laser = false;
    const alive = G.players.get(me.pid) && G.players.get(me.pid).alive;
    if (alive && !G.over) {
      updateMe(dt, inp);
      const cam = G.camera();
      if (inp.main) mainAction(cam);
      if (inp.item) itemAction(cam, inp.itemFirst, dt);
      // アイテムを拾う
      for (const pk of G.pickups.values()) {
        if (me.requested.has(pk.key)) continue;
        if (V.dist(pk.p, center(me.p)) < T.pickupRadius) { me.requested.add(pk.key); G.toHost({ t: 'take', key: pk.key }); }
      }
    } else if (!alive) {
      // やられたあとは、見ている人の後ろを回る
      if (G.mode === 'multi') {
        const al = [...G.players.values()].filter(p => p.alive);
        if (!me.spectate || !al.find(p => p.pid === me.spectate)) me.spectate = al.length ? al[0].pid : null;
      }
    }
    void cam0;
    // 掘った分を親へまとめて送る
    if (G.pendingDigs.length) {
      G.toHost({ t: 'dig', c: G.pendingDigs });
      G.pendingDigs = [];
    }
    // 自分の位置を親へ（子だけ）
    if (!G.isHost) {
      G.stateTimer -= dt;
      if (G.stateTimer <= 0) {
        G.stateTimer = 1 / T.multi.rate;
        const r = me.p.map(v => +v.toFixed(2));
        G.toHost({ t: 'st', p: r, yw: +me.yaw.toFixed(3), pt: +me.pitch.toFixed(3), mv: G.players.get(me.pid).mv, lz: me.laser ? 1 : 0, ld: me.laser ? me.laserDir.map(v => +v.toFixed(3)) : null });
      }
    } else {
      const rec = G.players.get(me.pid);
      if (rec) rec.ld = me.laser ? me.laserDir : null;
    }
    // ほかの人の見た目の位置（なめらかに追いかける）
    for (const pl of G.players.values()) {
      if (pl.pid === me.pid) { pl.vis = me.p.slice(); continue; }
      const k = Math.min(1, dt * 12);
      if (V.dist(pl.vis, pl.p) > 6) pl.vis = pl.p.slice();
      else for (let i = 0; i < 3; i++) pl.vis[i] += (pl.p[i] - pl.vis[i]) * k;
    }
    // 弾（親は当たりを決める。子は見た目だけ）
    updateProjectiles(dt);
    // 破片
    for (const c of G.crumbs) { c.v[1] -= 15 * dt; for (let i = 0; i < 3; i++) c.p[i] += c.v[i] * dt; c.life -= dt; }
    G.crumbs = G.crumbs.filter(c => c.life > 0);
    G.pops = G.pops.filter(p => G.t - p.t0 < (p.dur || 1.3));
    if (G.isHost) hostUpdate(dt);
  };

  /* ================= 親の仕事 ================= */
  function hostEmit(ev) {
    G.onEvent(ev);
    if (G.broadcast) G.broadcast(ev);
  }
  G.hostEmit = hostEmit;

  /** 子（または自分）からのメッセージ */
  G.hostOnMsg = function (pid, m) {
    const pl = G.players.get(pid);
    if (!pl || !G.running) return;
    switch (m.t) {
      case 'st':
        pl.p = m.p; pl.yw = m.yw; pl.pt = m.pt; pl.mv = m.mv; pl.lz = m.lz; pl.ld = m.ld; pl.seen = now();
        return;
      case 'dig':
        if (pid !== G.me.pid) for (const c of m.c) applyDig(c[0], c[1], c[2], c[3], V.dist([c[0], c[1], c[2]], G.me.p) < 30);
        // 親を引き継いだ直後は、あとから戻ってくる人のために記録しておく
        if (G.digLog) G.digLog.push([pid, m.c]);
        if (G.broadcast) G.broadcastExcept(pid, { t: 'dig', c: m.c });
        return;
      case 'take': {
        const pk = G.pickups.get(m.key);
        if (!pk || !pl.alive) return;
        hostEmit({ t: 'taken', key: m.key, pid, type: pk.type });
        return;
      }
      case 'fell':
        if (!pl.alive) return;
        // ほりほりタイム中は、豆腐の天井（上の面）へ戻す
        if (G.inDig()) hostEmit({ t: 'respawn', pid, p: topSpot() });
        else hostKill(pid, 'pot');
        return;
    }
    if (!pl.alive || G.over) return;
    // ほりほりタイム中は、攻撃・罠を受け付けない
    if (G.inDig() && (m.t === 'melee' || m.t === 'shoot' || m.t === 'trap')) return;
    switch (m.t) {
      case 'melee': hostMelee(pid, m); return;
      case 'shoot': {
        const I = T.items[m.k];
        const id = 'p' + (seqId++);
        hostEmit({ t: 'proj', id, k: m.k, o: m.o, v: V.mul(V.norm(m.d), I.speed), owner: pid });
        return;
      }
      case 'trap': {
        const id = 'tr' + (seqId++);
        hostEmit({ t: 'trap', id, k: m.k, p: m.p, owner: pid, arm: T.items[m.k].arm });
        return;
      }
      case 'use': {
        const I = T.items[m.k];
        if (m.k === 'ajitama') { pl.hp = Math.min(T.player.hp, pl.hp + I.heal); hostEmit({ t: 'say', pid, text: '+' + I.heal, col: '#7CE38B', heal: 1 }); }
        if (m.k === 'bigtama') { pl.hp = Math.min(T.player.hp, pl.hp + I.heal); pl.invUntil = G.t + I.invincible; hostEmit({ t: 'say', pid, text: 'ｱｯﾂｩｲ', col: '#FF9A3C', big: 1, heal: 1 }); }
        if (m.k === 'miso') { pl.armorUntil = G.t + I.time; pl.armorLeft = I.absorb; hostEmit({ t: 'say', pid, text: '癒着！', col: '#C98A4B', big: 1, armor: 1 }); }
        hostSync();
        return;
      }
    }
  };

  function hostMelee(pid, m) {
    const pl = G.players.get(pid), isBat = m.k === 'gobou';
    const reach = isBat ? T.items.gobou.reach : T.punch.reach;
    const c = center(pl.p);
    const f = V.norm([m.d[0], 0, m.d[2]]);
    const minDot = isBat ? Math.cos(T.items.gobou.arc / 2 * Math.PI / 180) : 0.2;
    let best = null, bd = 1e9;
    for (const t of hostTargets(pid)) {
      const d = V.sub(t.c, c), l = V.len(d);
      if (l > reach + t.r + 0.3) continue;
      if (V.dot(V.norm([d[0], 0, d[2]]), f) < minDot) continue;
      if (l < bd) { bd = l; best = t; }
    }
    if (isBat) hostEmit({ t: 'say', pid, text: 'ポキッ', col: '#C9A27A' });
    if (!best) return;
    hostDamage(best.id, isBat ? T.items.gobou.dmg : T.punch.dmg, pid, { knock: V.mul(f, isBat ? T.items.gobou.knock : 2) });
  }

  /** 攻撃の相手になるもの（自分以外の生きている人と敵） */
  function hostTargets(exceptPid) {
    const list = [];
    for (const p of G.players.values()) if (p.alive && p.pid !== exceptPid) list.push({ id: p.pid, c: center(p.pid === G.me.pid ? G.me.p : p.p), r: 0.55, pl: p });
    for (const b of G.bots) if (b.alive) list.push({ id: b.id, c: bossCenter(b.p), r: 0.8, bot: b });
    return list;
  }

  /** ダメージ。id は人（pid）か敵（b0…） */
  function hostDamage(id, dmg, by, opt) {
    opt = opt || {};
    const bot = G.bots.find(b => b.id === id);
    if (bot) {
      if (!bot.alive) return;
      bot.hp -= dmg; bot.hurtAt = G.t; bot.aware = true;
      if (opt.knock) bot.kv = V.add(bot.kv, opt.knock);
      hostEmit({ t: 'hit', id, dmg, text: opt.text });
      if (bot.hp <= 0) {
        bot.alive = false; bot.deadAt = G.t;
        hostEmit({ t: 'bdead', id });
        hostCheckEnd();
      } else hostEmit({ t: 'bhp', id, hp: bot.hp });
      return;
    }
    const pl = G.players.get(id);
    if (!pl || !pl.alive) return;
    if (G.t < pl.invUntil) { hostEmit({ t: 'say', pid: id, text: 'むてき！', col: '#FFE08A' }); return; }
    let rest = dmg;
    if (G.t < pl.armorUntil && pl.armorLeft > 0) {
      const a = Math.min(pl.armorLeft, rest);
      pl.armorLeft -= a; rest -= a;
      if (pl.armorLeft <= 0) { pl.armorUntil = 0; hostEmit({ t: 'say', pid: id, text: 'おみそOFF！', col: '#C98A4B', big: 1 }); }
    }
    pl.hp = Math.max(0, pl.hp - rest);
    hostEmit({ t: 'hit', id, dmg: rest, by, text: opt.text, knock: opt.knock });
    if (pl.hp <= 0) hostKill(id, 'hp', by);
    hostSync();
  }
  G.hostDamage = hostDamage;

  function hostKill(pid, why, by) {
    const pl = G.players.get(pid);
    if (!pl || !pl.alive) return;
    pl.alive = false; pl.hp = 0; pl.why = why;
    hostEmit({ t: 'dead', pid, why, by });
    hostCheckEnd();
  }
  G.hostKill = hostKill;

  function hostCheckEnd() {
    if (G.over) return;
    if (G.mode === 'solo') {
      const me = G.players.get(G.me.pid);
      if (!me.alive) hostEmit({ t: 'end', win: false, why: me.why });
      else if (G.bots.every(b => !b.alive)) hostEmit({ t: 'end', win: true, left: Math.ceil(G.timeLeft) });
    } else {
      const al = [...G.players.values()].filter(p => p.alive);
      if (al.length <= 1) hostEmit({ t: 'end', winner: al.length ? al[0].pid : null });
    }
  }
  G.hostCheckEnd = hostCheckEnd;

  /** 体力などを配る（マルチ） */
  function hostSync() { G.snapTimer = 0; }

  function hostUpdate(dt) {
    if (G.over) return;
    // ひとり：制限時間
    if (G.mode === 'solo' && !G.inDig()) {
      G.timeLeft -= dt;
      if (G.timeLeft <= 0) { G.timeLeft = 0; hostEmit({ t: 'end', win: false, why: 'time' }); return; }
    }
    // お味噌の時間切れ
    for (const pl of G.players.values()) {
      if (pl.armorUntil && G.t >= pl.armorUntil) {
        pl.armorUntil = 0; pl.armorLeft = 0;
        hostEmit({ t: 'say', pid: pl.pid, text: 'おみそOFF！', col: '#C98A4B', big: 1 });
        hostSync();
      }
    }
    // 罠
    for (const tr of G.traps.values()) {
      if (G.t < tr.armAt) continue;
      const I = T.items[tr.k];
      let hitT = null;
      for (const t of hostTargets(null)) {
        const foot = t.bot ? t.bot.p : (t.pl.pid === G.me.pid ? G.me.p : t.pl.p);
        if (Math.hypot(foot[0] - tr.p[0], foot[2] - tr.p[2]) < I.radius && Math.abs(foot[1] - tr.p[1]) < 1.2) { hitT = t; break; }
      }
      if (!hitT) continue;
      G.traps.delete(tr.id);
      if (tr.k === 'karashi') {
        const a = Math.random() * Math.PI * 2;
        const kv = [Math.cos(a) * I.knock, I.up, Math.sin(a) * I.knock];
        hostEmit({ t: 'trig', id: tr.id, k: tr.k, victim: hitT.id, kv });
        hostDamage(hitT.id, I.dmg, tr.owner, { text: 'からっ！', knock: hitT.bot ? V.mul(kv, 0.5) : null });
      } else {
        const a = Math.random() * Math.PI * 2;
        hostEmit({ t: 'trig', id: tr.id, k: tr.k, victim: hitT.id, kv: [Math.cos(a) * I.slide, 0, Math.sin(a) * I.slide] });
        if (hitT.bot) hitT.bot.slipUntil = G.t + I.time;
      }
    }
    // おたまレーザーの当たり（0.3 秒ごと）
    const L = T.items.otama;
    for (const pl of G.players.values()) {
      if (!pl.alive || !pl.lz || !pl.ld || G.inDig()) continue;
      const last = G.laserTick.get(pl.pid) || 0;
      if (G.t - last < L.tick) continue;
      G.laserTick.set(pl.pid, G.t);
      const p = pl.pid === G.me.pid ? G.me.p : pl.p;
      const o = [p[0] + Math.sin(pl.yw) * 0.45, p[1] + 0.65, p[2] + Math.cos(pl.yw) * 0.45];
      const d = V.norm(pl.ld);
      const h = G.world.raycast(o, d, L.range);
      const len = h ? h.t + 0.6 : L.range;
      for (const t of hostTargets(pl.pid)) {
        const rel = V.sub(t.c, o), s = V.dot(rel, d);
        if (s < 0 || s > len) continue;
        const perp = V.len(V.sub(rel, V.mul(d, s)));
        if (perp < t.r + 0.3) hostDamage(t.id, L.dmg, pl.pid, { text: 'ジュッ' });
      }
    }
    // 敵（ひとりプレイ）
    for (const b of G.bots) if (b.alive) updateBot(b, dt);
    // マルチ：みんなへ様子を配る
    if (G.mode === 'multi' && G.broadcast) {
      G.snapTimer -= dt;
      if (G.snapTimer <= 0) {
        G.snapTimer = 1 / T.multi.rate;
        const pl = [...G.players.values()].map(p => {
          const q = p.pid === G.me.pid ? G.me.p : p.p;
          return {
            pid: p.pid, p: q.map(v => +v.toFixed(2)), yw: +(+p.yw).toFixed(3), pt: +(+p.pt).toFixed(3), mv: p.mv, lz: p.lz,
            ld: p.ld ? p.ld.map(v => +v.toFixed(3)) : null, hp: Math.round(p.hp), al: p.alive ? 1 : 0,
            ar: p.armorUntil > G.t ? +(p.armorUntil - G.t).toFixed(1) : 0, al2: p.armorLeft, iv: p.invUntil > G.t ? +(p.invUntil - G.t).toFixed(2) : 0
          };
        });
        G.broadcast({ t: 'snap', pl, order: G.order, succ: G.succ });
      }
    }
  }

  /** 豆腐の天井（いちばん上の面）で、立てる場所 */
  function topSpot() {
    const w = G.world, N = w.N;
    for (let i = 0; i < 40; i++) {
      const x = 3 + Math.floor(Math.random() * (N - 6)), z = 3 + Math.floor(Math.random() * (N - 6));
      for (let y = N - 1; y > N * 0.5; y--) {
        if (w.get(x, y, z) !== 0) {
          if (w.get(x, y + 1, z) === 0 && w.get(x, y + 2, z) === 0) return [x + 0.5, y + 1.01, z + 0.5];
          break;
        }
      }
    }
    return [N / 2 + 0.5, N + 0.01, N / 2 + 0.5];
  }

  /* ---------- 敵の動き（親だけ） ---------- */
  function updateBot(b, dt) {
    const B = T.bosses[b.key];
    let tgt = null, td = 1e9;
    for (const p of G.players.values()) {
      if (!p.alive) continue;
      const q = p.pid === G.me.pid ? G.me.p : p.p;
      const d = V.dist(q, b.p);
      if (d < td) { td = d; tgt = q; }
    }
    if (!tgt) return;
    const digging = G.inDig();
    if (td < B.notice && !digging) b.aware = true;
    b.cool -= dt; b.digCool -= dt;
    const to = V.sub([tgt[0], tgt[1] - 0.2, tgt[2]], b.p);
    let dir = V.norm(to);
    let sp = b.aware ? B.speed : B.wander;
    if (digging) {
      // ほりほりタイム中は、ちくわ君に関係なく、ふらふら掘っているだけ
      b.wob += dt * 0.5;
      dir = V.norm([Math.cos(b.wob * 1.7 + b.id.length), Math.sin(b.wob * 0.9) * 0.3, Math.sin(b.wob * 1.3 + 1)]);
      sp = B.wander * 0.7;
    } else if (!b.aware) {
      // 気づく前は、ふらふら掘り歩く。seek が大きい（弱い）ボスほど、ちくわ君のほうへ寄ってくる
      b.wob += dt * 0.7;
      const a = Math.sin(b.wob) * 0.9, c = Math.cos(a), s = Math.sin(a);
      const toward = V.norm([dir[0] * c - dir[2] * s, dir[1] * 0.5 + Math.sin(b.wob * 1.3) * 0.2, dir[0] * s + dir[2] * c]);
      const roam = V.norm([Math.cos(b.wob * 0.6 + b.id.length), Math.sin(b.wob * 0.9) * 0.3, Math.sin(b.wob * 0.45 + 1)]);
      const k = B.seek == null ? 1 : B.seek;
      dir = V.norm(V.add(V.mul(toward, k), V.mul(roam, 1 - k + 1e-3)));
    }
    if (G.t < b.slipUntil) { sp *= 0.25; dir = V.norm(V.add(dir, [Math.sin(G.t * 9), 0, Math.cos(G.t * 7)])); }
    if (td < 1.15) sp = 0;
    b.p = V.add(b.p, V.add(V.mul(dir, sp * dt), V.mul(b.kv, dt)));
    b.kv = V.mul(b.kv, Math.pow(0.05, dt));
    const N = G.world.N;
    b.p[0] = Math.max(1.5, Math.min(N - 1.5, b.p[0]));
    b.p[1] = Math.max(1.5, Math.min(N - 2, b.p[1]));
    b.p[2] = Math.max(1.5, Math.min(N - 1.5, b.p[2]));
    if (Math.hypot(dir[0], dir[2]) > 0.1) b.yaw = Math.atan2(dir[0], dir[2]);
    // 掘り進む
    if (b.digCool <= 0 && sp > 0) {
      b.digCool = 0.25;
      const c = V.add(bossCenter(b.p), V.mul(dir, 0.9));
      const near = V.dist(b.p, G.me.p);
      applyDig(c[0], c[1], c[2], T.bossDigRadius, near < 20);
      if (G.broadcast) G.broadcast({ t: 'dig', c: [[+c[0].toFixed(2), +c[1].toFixed(2), +c[2].toFixed(2), T.bossDigRadius]] });
      if (near < 28) HM.sfx.dig(Math.max(0, 1 - near / 28) * 0.7);
    }
    // 攻撃（ほりほりタイム中はしない）
    if (!digging && td < T.bossReach + 0.3 && b.cool <= 0) {
      b.cool = B.atk;
      const victim = [...G.players.values()].find(p => p.alive && V.dist(p.pid === G.me.pid ? G.me.p : p.p, tgt) < 0.01);
      if (victim) hostDamage(victim.pid, B.dmg, b.id, { knock: V.mul(V.norm([to[0], 0.3, to[2]]), 5) });
    }
  }

  /* ---------- 弾 ---------- */
  function updateProjectiles(dt) {
    const keep = [];
    for (const pr of G.proj) {
      const sp = V.len(pr.v), steps = Math.max(1, Math.ceil(sp * dt / 0.3));
      let done = false;
      for (let s = 0; s < steps && !done; s++) {
        pr.p = V.add(pr.p, V.mul(pr.v, dt / steps));
        pr.life -= dt / steps;
        if (G.world.solidAt(pr.p[0], pr.p[1], pr.p[2]) || pr.life <= 0 || pr.p[1] < T.potY) {
          done = true;
          if (G.isHost) hostProjEnd(pr, null);
          break;
        }
        if (G.isHost) {
          for (const t of hostTargets(pr.owner)) {
            if (V.dist(t.c, pr.p) < t.r + 0.25) { done = true; hostProjEnd(pr, t); break; }
          }
        }
      }
      if (!done && !pr.dead) keep.push(pr);
    }
    G.proj = keep;
  }
  function hostProjEnd(pr, t) {
    pr.dead = true;
    if (pr.k === 'dashi') {
      hostEmit({ t: 'pend', id: pr.id, p: pr.p });
      if (t) hostDamage(t.id, T.items.dashi.dmg, pr.owner, { text: 'あっつい！' });
      return;
    }
    // 大根：当たった所のまわりにもダメージ
    const I = T.items.daikon;
    hostEmit({ t: 'pend', id: pr.id, p: pr.p, boom: 1 });
    if (t) hostDamage(t.id, I.direct, pr.owner, { knock: V.mul(V.norm(pr.v), 4) });
    for (const o of hostTargets(pr.owner)) {
      if (t && o.id === t.id) continue;
      if (V.dist(o.c, pr.p) < I.splashR) hostDamage(o.id, I.splash, pr.owner, { knock: V.mul(V.norm(V.sub(o.c, pr.p)), 4) });
    }
  }

  /* ================= 親からの知らせ（全員。親自身にも届く） ================= */
  G.onEvent = function (ev) {
    const me = G.me;
    switch (ev.t) {
      case 'dig':
        for (const c of ev.c) applyDig(c[0], c[1], c[2], c[3], V.dist([c[0], c[1], c[2]], me.p) < 30);
        if (!G.isHost) {
          const c = ev.c[0], d = V.dist([c[0], c[1], c[2]], me.p);
          if (d < 28) HM.sfx.dig(Math.max(0, 1 - d / 28) * 0.6);
        }
        return;
      case 'taken': {
        const pk = G.pickups.get(ev.key);
        G.pickups.delete(ev.key);
        (G.taken || (G.taken = new Set())).add(ev.key);
        if (ev.pid === me.pid) {
          G.addItem(ev.type);
          HM.sfx.pick();
          popAt(pk ? pk.p : center(me.p), T.items[ev.type].name + ' ゲット！', T.items[ev.type].col);
        }
        return;
      }
      case 'proj':
        if (G.proj.find(p => p.id === ev.id)) return;
        G.proj.push({ id: ev.id, k: ev.k, p: ev.o.slice(), v: ev.v.slice(), owner: ev.owner, life: 3 });
        if (ev.owner !== me.pid) HM.sfx.shoot();
        return;
      case 'pend': {
        const pr = G.proj.find(p => p.id === ev.id);
        if (pr) pr.dead = true;
        G.proj = G.proj.filter(p => p.id !== ev.id);
        if (ev.boom) {
          HM.sfx.boom();
          for (let i = 0; i < 16; i++) G.crumbs.push({ p: ev.p.slice(), v: [(Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8], life: 0.6, white: 1 });
        }
        return;
      }
      case 'trap':
        G.traps.set(ev.id, { id: ev.id, k: ev.k, p: ev.p, owner: ev.owner, armAt: G.t + ev.arm });
        return;
      case 'trig': {
        G.traps.delete(ev.id);
        if (ev.victim === me.pid) {
          if (ev.k === 'karashi') {
            me.v = ev.kv.slice(); me.onGround = false; me.knockUntil = G.t + 0.6;
            HM.sfx.boom();
          } else {
            me.v = [ev.kv[0], me.v[1], ev.kv[2]]; me.slipUntil = G.t + T.items.shirataki.time;
            HM.sfx.slip();
            popAt(center(me.p), 'つるっ！', '#DDE6F0');
          }
        }
        return;
      }
      case 'hit': {
        const pos = targetPos(ev.id);
        if (pos && ev.dmg > 0) popAt(pos, ev.text ? ev.text : '-' + ev.dmg, ev.text ? '#FF8A3C' : '#FF5A4E', !!ev.text);
        if (ev.text && ev.dmg > 0 && pos) popAt(V.add(pos, [0, -0.35, 0]), '-' + ev.dmg, '#FF5A4E');
        if (ev.id === me.pid) {
          HM.sfx.hurt();
          G.hurtAt = G.t;
          if (ev.knock) { me.v = V.add(me.v, ev.knock); me.knockUntil = G.t + 0.25; }
        } else HM.sfx.hit();
        if (!G.isHost && G.players.has(ev.id)) { const p = G.players.get(ev.id); p.hp = Math.max(0, p.hp - ev.dmg); }
        G.onHud && G.onHud();
        return;
      }
      case 'respawn': {
        const pl = G.players.get(ev.pid);
        if (pl) { pl.p = ev.p.slice(); pl.vis = ev.p.slice(); }
        if (ev.pid === me.pid) {
          me.p = ev.p.slice(); me.v = [0, 0, 0]; me.fellSent = false;
          // アイテムは、最後に取ったものだけ残る
          const before = me.inv.length;
          me.inv = me.inv.filter(s => s.type === me.lastItem);
          me.sel = me.inv.length ? 0 : -1;
          G.toast && G.toast('豆腐の天井にもどった！' + (before > me.inv.length ? '（最後に取ったアイテムだけ残った）' : ''));
          G.onHud && G.onHud();
        } else if (pl) popAt([ev.p[0], ev.p[1] + 1.3, ev.p[2]], pl.name + ' がもどってきた', '#FFE08A');
        return;
      }
      case 'bhp': { const b = G.bots.find(x => x.id === ev.id); if (b) { b.hp = ev.hp; b.hurtAt = G.t; } return; }
      case 'bdead': {
        const b = G.bots.find(x => x.id === ev.id);
        if (b) {
          b.alive = false; b.deadAt = G.t;
          popAt(bossCenter(b.p), T.bosses[b.key].name + ' をたおした！', '#FFE08A', true);
          for (let i = 0; i < 20; i++) G.crumbs.push({ p: bossCenter(b.p), v: [(Math.random() - 0.5) * 7, Math.random() * 7, (Math.random() - 0.5) * 7], life: 0.9, white: 1 });
          HM.sfx.boom();
        }
        G.onHud && G.onHud();
        return;
      }
      case 'say': {
        const pos = targetPos(ev.pid);
        if (pos) popAt(V.add(pos, [0, 0.5, 0]), ev.text, ev.col, !!ev.big);
        if (ev.pid === me.pid) { if (ev.heal) HM.sfx.heal(); if (ev.armor) HM.sfx.armor(); }
        return;
      }
      case 'dead': {
        const pl = G.players.get(ev.pid);
        if (pl) { pl.alive = false; pl.hp = 0; pl.why = ev.why; pl.rank = [...G.players.values()].filter(p => p.alive).length + 1; }
        const name = pl ? pl.name : '?';
        const msg = ev.why === 'pot' ? name + ' はおでん鍋に沈んだ…' : ev.why === 'left' ? name + ' はぬけたので負け' : name + ' はやられた！';
        G.toast && G.toast(msg);
        if (ev.pid === me.pid) { G.laserOff = true; HM.sfx.lose(); }
        G.onHud && G.onHud();
        return;
      }
      case 'end':
        if (G.over) return;
        G.over = true;
        G.endInfo = ev;
        setTimeout(() => G.onEnd && G.onEnd(ev), 1200);
        return;
    }
    G.onEvent2 && G.onEvent2(ev);
  };

  /** 親からの様子（子だけ） */
  G.onSnap = function (m) {
    for (const s of m.pl) {
      const pl = G.players.get(s.pid);
      if (!pl) continue;
      if (s.pid !== G.me.pid) { pl.p = s.p; pl.yw = s.yw; pl.pt = s.pt; pl.mv = s.mv; pl.lz = s.lz; pl.ld = s.ld; }
      pl.hp = s.hp; pl.alive = !!s.al;
      pl.armorUntil = s.ar ? G.t + s.ar : 0; pl.armorLeft = s.al2 || 0; pl.invUntil = s.iv ? G.t + s.iv : 0;
    }
    G.order = m.order || G.order;
    G.succ = m.succ || null;
    G.lastSnapAt = now();
    G.onHud && G.onHud();
  };

  function targetPos(id) {
    if (id === G.me.pid) return [G.me.p[0], G.me.p[1] + 1.3, G.me.p[2]];
    const pl = G.players.get(id);
    if (pl) return [pl.vis[0], pl.vis[1] + 1.3, pl.vis[2]];
    const b = G.bots.find(x => x.id === id);
    if (b) return [b.p[0], b.p[1] + 1.9, b.p[2]];
    return null;
  }
  function popAt(p, text, col, big) {
    G.pops.push({ p: p.slice(), text, col: col || '#fff', big: !!big, t0: G.t, dur: big ? 1.6 : 1.1 });
  }
  G.popAt = popAt;

  /** レーダー：いちばん近い敵までの距離 */
  G.nearestEnemy = function () {
    let best = 1e9;
    const p = G.me.p;
    for (const e of enemiesOfMe()) best = Math.min(best, V.dist(e.c, center(p)));
    return best;
  };

  /* ================= 描く ================= */
  const FOG = [0.07, 0.05, 0.035];
  G.render = function (w, h) {
    const R = G.R, world = G.world, me = G.me;
    const cam = G.camera(true);
    // 縦長の画面では、横が狭くならないよう視野を広げる
    const fov = (w < h ? T.cam.fovPortrait : T.cam.fov) * Math.PI / 180;
    const proj = M4.perspective(fov, w / h, cam.near, 140 + cam.near);
    const view = M4.lookAt(cam.eye, V.add(cam.eye, cam.dir), [0, 1, 0]);
    const vp = M4.mul(proj, view);
    G.vp = vp; G.cam = cam;
    // 明るさ（ヘッドライト）は自分の頭を中心にする（後方視点でもまわりが見えるように）
    R.begin(vp, cam.target, FOG, T.viewRange);

    // チャンクを作る・描く
    const CS = T.chunk, NC = HM.World.NC, MR = T.meshRadius;
    const pc = [Math.floor(cam.target[0] / CS), Math.floor(cam.target[1] / CS), Math.floor(cam.target[2] / CS)];
    // 掘られたチャンク：近いものは描き直し、遠いものは捨てる
    const dirtyNear = [];
    for (const ci of world.dirty) {
      const cx = ci % NC, cy = Math.floor(ci / NC) % NC, cz = Math.floor(ci / (NC * NC));
      if (Math.abs(cx - pc[0]) <= MR && Math.abs(cy - pc[1]) <= MR && Math.abs(cz - pc[2]) <= MR) dirtyNear.push(ci);
      else { if (G.meshes.has(ci)) { R.free(G.meshes.get(ci)); G.meshes.delete(ci); } }
    }
    world.dirty.clear();
    const t0 = performance.now();
    for (const ci of dirtyNear) {
      const m = R.mesh(world.meshChunk(ci), G.meshes.get(ci));
      G.meshes.set(ci, m);
    }
    // まだ作っていない近くのチャンク（近い順・時間の許すかぎり）
    const todo = [];
    for (let dz = -MR; dz <= MR; dz++) for (let dy = -MR; dy <= MR; dy++) for (let dx = -MR; dx <= MR; dx++) {
      const cx = pc[0] + dx, cy = pc[1] + dy, cz = pc[2] + dz;
      if (cx < 0 || cy < 0 || cz < 0 || cx >= NC || cy >= NC || cz >= NC) continue;
      const ci = cx + cy * NC + cz * NC * NC;
      if (!G.meshes.has(ci)) todo.push([dx * dx + dy * dy + dz * dz, ci]);
    }
    todo.sort((a, b) => a[0] - b[0]);
    const budget = G.meshBudget || 7;
    for (const [, ci] of todo) {
      if (performance.now() - t0 > budget) break;
      G.meshes.set(ci, R.mesh(world.meshChunk(ci), null));
    }
    // 描く・遠いものを捨てる
    for (const [ci, m] of G.meshes) {
      const cx = ci % NC, cy = Math.floor(ci / NC) % NC, cz = Math.floor(ci / (NC * NC));
      if (Math.abs(cx - pc[0]) > MR + 1 || Math.abs(cy - pc[1]) > MR + 1 || Math.abs(cz - pc[2]) > MR + 1) { R.free(m); G.meshes.delete(ci); continue; }
      if (m) R.draw(m, null);
    }
    G.meshTodo = todo.length;

    // おでん鍋
    if (cam.eye[1] < 60) {
      R.cull(false);
      R.draw(G._pot || (G._pot = R.mesh(HM.potModel())), null, [1, 1, 1], 0.4);
      R.cull(true);
    }

    // ちくわ君たち
    for (const pl of G.players.values()) {
      if (!pl.alive && pl.pid !== me.pid) continue;
      if (!pl.alive) continue;
      const isMe = pl.pid === me.pid;
      const p = isMe ? me.p : pl.vis, yaw = isMe ? me.yaw : pl.yw;
      // 近すぎるときは半透明に（カメラが体にめりこむので）
      const near = isMe && cam.dist < 1.4;
      const bob = pl.mv ? Math.abs(Math.sin(G.t * 12)) * 0.06 : 0;
      const hurt = isMe && G.hurtAt && G.t - G.hurtAt < 0.25;
      const swing = isMe && G.t - (me.swing || 0) < 0.15 ? 0.12 : 0;
      const mdl = M4.trs(p[0] + Math.sin(yaw) * swing, p[1] + bob, p[2] + Math.cos(yaw) * swing, yaw, 1);
      const slip = isMe && G.t < me.slipUntil;
      R.draw(getMesh('ck:' + pl.color, () => HM.chikuwaModel(pl.color)), mdl, hurt ? [1.5, 0.6, 0.6] : (slip ? [0.8, 0.9, 1.3] : null), (pl.invUntil > G.t) ? 0.5 : 0, near ? 0.35 : 1);
      if (pl.armorUntil > G.t) R.draw(getMesh('miso', HM.misoAura), M4.trs(p[0], p[1] - 0.1, p[2], G.t, 1), null, 0, 0.75);
      // レーザー
      if (pl.lz && pl.ld) {
        const o = [p[0] + Math.sin(yaw) * 0.45, p[1] + 0.65, p[2] + Math.cos(yaw) * 0.45];
        const d = V.norm(pl.ld), hh = world.raycast(o, d, T.items.otama.range);
        const len = hh ? hh.t + 0.3 : T.items.otama.range;
        R.draw(getMesh('beam', () => HM.unitBox('#9FE3FF')), M4.beam(o, d, len, 0.12 + Math.sin(G.t * 40) * 0.03), null, 1, 0.85);
      }
    }
    // 敵
    for (const b of G.bots) {
      if (!b.alive) continue;
      const hurt = G.t - b.hurtAt < 0.2;
      const bob = Math.sin(G.t * 4 + b.wob) * 0.05;
      R.draw(getMesh('boss:' + b.key, () => HM.bossModel(b.key)), M4.trs(b.p[0], b.p[1] + bob, b.p[2], b.yaw, 1), hurt ? [1.8, 0.7, 0.7] : null, 0.15);
    }
    // アイテム
    for (const pk of G.pickups.values()) {
      const y = pk.p[1] + Math.sin(G.t * 3 + pk.p[0]) * 0.08;
      R.draw(getMesh('it:' + pk.type, () => HM.itemModel(pk.type)), M4.trs(pk.p[0], y - 0.3, pk.p[2], G.t * 2, 1), null, 0.25);
    }
    // 罠（自分の罠ははっきり、ほかの人の罠はうすく）
    for (const tr of G.traps.values()) {
      const mine = tr.owner === me.pid;
      const m = tr.k === 'karashi' ? getMesh('mine', HM.mineModel) : getMesh('shira', HM.shiraModel);
      R.draw(m, M4.trs(tr.p[0], tr.p[1] + 0.01, tr.p[2], 0, 1), null, mine ? 0.2 : 0, mine ? 1 : 0.3);
    }
    // 弾
    for (const pr of G.proj) {
      const m = pr.k === 'dashi' ? getMesh('dshot', HM.dashiShot) : getMesh('kshot', HM.daikonShot);
      const yaw = Math.atan2(pr.v[0], pr.v[2]);
      R.draw(m, M4.trs(pr.p[0], pr.p[1] - 0.1, pr.p[2], pr.k === 'daikon' ? G.t * 12 : yaw, 1), null, 0.5);
    }
    // 破片
    for (const c of G.crumbs) {
      R.draw(getMesh('crumb', HM.crumb), M4.trs(c.p[0], c.p[1], c.p[2], c.life * 7, 1), c.white ? [1.1, 1, 0.8] : null, 0);
    }
    return vp;
  };
  const meshCache = new Map();
  function getMesh(k, f) {
    let m = meshCache.get(k);
    if (!m) { m = G.R.mesh(f()); meshCache.set(k, m); }
    return m;
  }
  G.resetMeshCache = function () { meshCache.clear(); G._pot = null; };
})();

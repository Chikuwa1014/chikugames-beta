/* うごかせ！ちくわくん — ゲームの進行（時間・シフト・ちくわ君の実行・コンベア・かんばん・保存） */
(function () {
  const UC = window.UC, CFG = UC.CFG, DX = UC.DX, DY = UC.DY;

  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const key = (x, y) => x + ',' + y;
  UC.key = key; UC.clamp = clamp;

  /* できごとを画面へ知らせる（トースト・音など。ui.js が受ける） */
  const listeners = [];
  UC.on = f => listeners.push(f);
  const emit = (name, d) => listeners.forEach(f => f(name, d));

  /* ---------- 暦（1 ヶ月＝7 日・1 年＝12 ヶ月。1 年目の 4 月から） ---------- */
  UC.cal = function (t) {
    const day = Math.floor(t / 1440), mi = Math.floor(day / 7);
    const month = (3 + mi) % 12 + 1, year = Math.floor(mi / 12) + 1;
    const min = Math.floor(t - day * 1440);
    return { day, mi, month, year, date: day % 7 + 1, wd: day % 7, hh: Math.floor(min / 60), mm: min % 60, season: UC.season(month) };
  };
  UC.fmtTime = (m) => { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(Math.floor(m % 60)).padStart(2, '0'); };

  /* ---------- 新しいゲーム ---------- */
  function newBase(sizeIdx, name) {
    const sz = UC.SIZES[sizeIdx];
    const b = { name, size: sizeIdx, w: sz.w, h: sz.h, objs: {}, coins: {}, kanban: [], upg: { beltSpd: 0, poolCap: 0 }, prodT: 0, coinT: 0, log: [] };
    const W = b.w, H = b.h;
    // れいぞうこ・コンピュータは左上のすみ
    put(b, 'fridge', 0, 0, 1);
    put(b, 'pc', 1, 0, 1);
    // 取り場（製造ラインの終点）は左がわのふち、出荷ヤードは取り場から離れた右がわ（ランダム）
    const sy = rnd(2, H - 2), sx = 0;
    put(b, 'src', sx, sy, 0).stock = [];
    let yx, yy, n = 0;
    do { yx = rnd(Math.floor(W * 0.6), W - 1); yy = rnd(0, H - 1); n++; }
    while ((b.objs[key(yx, yy)] || Math.abs(yx - sx) + Math.abs(yy - sy) < Math.floor((W + H) / 2)) && n < 200);
    put(b, 'yard', yx, yy, 0).stock = [];
    for (let i = 0; i < 3; i++) dropCoin(b);
    return b;
  }
  function put(b, type, x, y, dir) {
    const o = { type, x, y, dir: dir || 0 };
    if (UC.BELTS.includes(type)) { o.item = null; o.prog = 0; }
    if (type === 'pool') o.stock = [];
    if (type === 'pack') o.item = null;
    if (type === 'sorter') { o.on = true; o.target = 0; }
    if (type === 'wye') o.alt = 0;
    if (type === 'heater' || type === 'cooler') o.on = false;
    b.objs[key(x, y)] = o;
    return o;
  }
  UC.put = put;

  function newRobot(id, base, x, y) {
    return {
      id, name: UC.ROBOT_NAMES[id] || ('ちくわ' + (id + 1) + '号'), base, x, y, dir: 0,
      hp: 100, mp: 40, hold: null,
      prog: { main: [], f: [[], [], []] },
      running: false, stack: [], act: null,
      shift: { type: 'teiji', slot: 0 },
      injured: false, sulk: false, mode: 'off', brk: null, path: null, bub: null,
    };
  }

  UC.newGame = function () {
    const G = {
      v: 1, time: 8 * 60, coin: CFG.startCoin, bases: [], robots: [], abil: { spd: 0, tough: 0 },
      travelUntil: 0, lastDay: -1, stats: { shipped: 0, earned: 0, coins: 0 }, started: Date.now(),
    };
    G.bases.push(newBase(0, 'ほんしゃ'));
    G.robots.push(newRobot(0, 0, 4, 4));
    // 精神力は 108 回の転職でボロボロ（40 から）
    return G;
  };

  /* ---------- 保存（base64 ＋チェック値。号口 CLAUDE.md 9 章） ---------- */
  function chk(s) { let h = 0x811c9dc5; const t = 'ugokase-chikuwa|' + s; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
  UC.save = function (G) {
    try { const b = btoa(unescape(encodeURIComponent(JSON.stringify(G)))); CG.ls.set(UC.KEY, b + '.' + chk(b)); } catch (e) { }
  };
  UC.load = function () {
    const raw = CG.ls.get(UC.KEY);
    if (!raw) return null;
    try {
      const [b, c] = raw.split('.');
      if (!b || chk(b) !== c) return null;
      const G = JSON.parse(decodeURIComponent(escape(atob(b))));
      if (!G || G.v !== 1 || !Array.isArray(G.bases) || !G.bases.length) return null;
      return G;
    } catch (e) { return null; }
  };
  UC.clearSave = () => CG.ls.set(UC.KEY, '');

  /* ---------- シフト ---------- */
  /* d 日目のちくわ君の勤務の窓（なければ null）。時刻はゲームの通しの分 */
  function windowOn(r, d) {
    const S = UC.SHIFTS[r.shift.type];
    if (d < 0 || d % 7 >= S.days) return null;
    const mi = Math.floor(d / 7);
    let slot = 0;
    if (r.shift.type === 'nikotai') slot = (r.shift.slot + mi) % 2;          // 月ごとに前後入れかえ
    if (r.shift.type === 'sankotai') slot = (r.shift.slot + mi) % 3;         // 毎月ちがう直（順番にまわす）
    const [s, e] = S.slots[slot];
    const start = d * 1440 + s, end = d * 1440 + e, len = e - s;
    const bl = CFG.breakMin + (len >= 480 ? CFG.breakLongPlus : 0);
    const bs = start + Math.floor((len - bl) / 2 / 60) * 60;
    return { start, end, bs, be: bs + bl, slot };
  }
  UC.windowOn = windowOn;
  /* いまの時刻 t に、勤務中ならその窓 */
  function curWindow(r, t) {
    const d = Math.floor(t / 1440);
    for (const dd of [d, d - 1]) { const w = windowOn(r, dd); if (w && t >= w.start && t < w.end) return w; }
    return null;
  }
  UC.curWindow = curWindow;
  UC.nextWindow = function (r, t) {
    const d = Math.floor(t / 1440);
    for (let dd = d - 1; dd < d + 9; dd++) { const w = windowOn(r, dd); if (w && w.end > t) return w; }
    return null;
  };

  /* ---------- マスのしらべ ---------- */
  const inB = (b, x, y) => x >= 0 && y >= 0 && x < b.w && y < b.h;
  const robotAt = (G, bi, x, y, me) => G.robots.find(r => r !== me && r.base === bi && ((Math.round(r.x) === x && Math.round(r.y) === y) || (r.act && r.act.k === 'move' && r.act.tx === x && r.act.ty === y)) && !inFridge(r));
  const inFridge = r => r.brk && (r.brk.phase === 'in');
  UC.inFridge = inFridge;
  UC.robotAt = robotAt;
  function blocked(G, r, x, y) {
    const b = G.bases[r.base];
    return !inB(b, x, y) || !!b.objs[key(x, y)] || !!robotAt(G, r.base, x, y, r);
  }

  function dropCoin(b, mi = 0) {
    if (Object.keys(b.coins).length >= CFG.coinMaxOnFloor) return;
    for (let n = 0; n < 30; n++) {
      const x = rnd(0, b.w - 1), y = rnd(0, b.h - 1), k = key(x, y);
      if (b.objs[k] || b.coins[k]) continue;
      b.coins[k] = rnd(CFG.coinValue[0], CFG.coinValue[1]) + Math.floor(mi * 1.5);
      return;
    }
  }

  function bubble(G, r, s, dur = 20) { r.bub = { s, until: G.time + dur }; }
  const poolCap = b => CFG.poolCap + b.upg.poolCap * 5;
  UC.poolCap = poolCap;
  const beltMin = b => CFG.beltMin / (1 + b.upg.beltSpd * 0.4);

  /* 経路（れいぞうこへの行き帰り）。物の無いマスだけを通る。ちくわ君どうしは重なってよい */
  function findPath(b, sx, sy, goal) {
    const Q = [[sx, sy]], prev = new Map([[key(sx, sy), null]]);
    while (Q.length) {
      const [x, y] = Q.shift();
      if (goal(x, y)) {
        const p = []; let k = key(x, y);
        while (k) { const [a, c] = k.split(',').map(Number); p.unshift([a, c]); k = prev.get(k); }
        p.shift(); return p;
      }
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d], k = key(nx, ny);
        if (!inB(b, nx, ny) || prev.has(k) || b.objs[k]) continue;
        prev.set(k, key(x, y)); Q.push([nx, ny]);
      }
    }
    return null;
  }
  const nextTo = (b, type) => (x, y) => { for (let d = 0; d < 4; d++) { const o = b.objs[key(x + DX[d], y + DY[d])]; if (o && o.type === type) return true; } return false; };
  const hasObj = (b, type, on) => Object.values(b.objs).some(o => o.type === type && (on === undefined || o.on === on));
  UC.hasObj = hasObj;

  /* ---------- 1 ステップ（dt はゲーム内の分） ---------- */
  UC.step = function (G, dt) {
    const prevDay = Math.floor(G.time / 1440);
    G.time += dt;
    const c = UC.cal(G.time);
    if (c.day !== G.lastDay) newDay(G, c, prevDay);
    const travel = G.time < G.travelUntil;

    G.bases.forEach((b, bi) => {
      const staff = G.robots.filter(r => r.base === bi);
      const operating = !travel && staff.some(r => r.mode === 'work' || r.mode === 'break');
      if (operating) {
        b.prodT += dt;
        while (b.prodT >= CFG.produceEvery) {
          b.prodT -= CFG.produceEvery;
          const src = Object.values(b.objs).find(o => o.type === 'src');
          if (src && src.stock.length < CFG.srcMax) src.stock.push({ t: rnd(0, UC.PRODUCTS.length - 1), packed: false });
        }
        b.coinT += dt;
        while (b.coinT >= CFG.coinEvery) { b.coinT -= CFG.coinEvery; if (Math.random() < 0.7) dropCoin(b, c.mi); }
        stepBelts(b, dt);
      }
      // かんばん（集荷）
      for (const k of b.kanban) if (k.got == null && G.time >= k.t) doPickup(G, b, bi, k);
    });

    for (const r of G.robots) stepRobot(G, r, dt, c, travel);
  };

  function newDay(G, c, prevDay) {
    const first = G.lastDay < 0;
    G.lastDay = c.day;
    // 月がかわった：シフトによる精神力の減り
    if (!first && c.day % 7 === 0) {
      for (const r of G.robots) {
        const m = UC.SHIFTS[r.shift.type].monthMp;
        if (m) { r.mp = clamp(r.mp + m, 0, 100); }
      }
      emit('month', c);
    }
    // その日のかんばん（集荷の予定）をコンピュータが受け取る
    G.bases.forEach((b, bi) => {
      b.kanban = b.kanban.filter(k => k.got == null && k.t > G.time - 1440);   // 日をまたぐ勤務の分は残す
      const times = new Set(b.kanban.map(k => k.t));
      if (G.time < G.travelUntil) return;
      for (const r of G.robots) {
        if (r.base !== bi) continue;
        const w = windowOn(r, c.day);
        if (!w) continue;
        for (let t = w.start + CFG.kanbanEvery; t < w.end; t += CFG.kanbanEvery) times.add(t);
        times.add(w.end);
      }
      const need = () => Math.min(CFG.kanbanMax, CFG.kanbanBase + Math.floor(c.mi / 2) + (Math.random() < 0.3 ? 1 : 0));
      for (const t of [...times].sort((a, z) => a - z)) if (!b.kanban.some(k => k.t === t) && t > G.time) b.kanban.push({ t, need: need(), got: null });
      b.kanban.sort((a, z) => a.t - z.t);
    });
    emit('day', c);
  }

  function doPickup(G, b, bi, k) {
    const yard = Object.values(b.objs).find(o => o.type === 'yard');
    const st = yard ? yard.stock : [];
    // 梱包ずみを先に出す
    st.sort((a, z) => (z.packed ? 1 : 0) - (a.packed ? 1 : 0));
    const take = st.splice(0, Math.min(k.need, st.length));
    const earn = take.reduce((s, p) => s + (p.packed ? CFG.pricePacked : CFG.price), 0);
    k.got = take.length;
    G.coin += earn; G.stats.shipped += take.length; G.stats.earned += earn;
    const ok = take.length >= k.need;
    for (const r of G.robots) if (r.base === bi) {
      r.mp = clamp(r.mp + (ok ? CFG.okMental : CFG.ngMental), 0, 100);
      bubble(G, r, ok ? '♪' : '💦', 40);
    }
    b.log.unshift({ t: k.t, need: k.need, got: take.length, earn });
    b.log.length = Math.min(b.log.length, 20);
    emit('pickup', { base: b, ok, need: k.need, got: take.length, earn });
  }

  /* ---------- コンベア ---------- */
  function outDir(o) {
    if (o.type === 'wye') return (o.dir + (o.alt ? 1 : 3)) % 4;
    if (o.type === 'sorter' && o.on && o.item && !o.item.packed && o.item.t === o.target) return (o.dir + 3) % 4;
    return o.dir;
  }
  UC.outDir = outDir;
  function accept(b, o, item) {
    if (!o) return false;
    if (UC.BELTS.includes(o.type)) { if (o.item) return false; o.item = item; o.prog = 0; return true; }
    if (o.type === 'yard') { o.stock.push(item); return true; }
    if (o.type === 'pool') { if (o.stock.length >= poolCap(b)) return false; o.stock.push(item); return true; }
    if (o.type === 'pack') { if (o.item) return false; o.item = item; return true; }
    return false;
  }
  function stepBelts(b, dt) {
    const bm = beltMin(b);
    // 下流から動かす（前が空けばすぐ詰められるように、2 回まわす）
    for (let pass = 0; pass < 2; pass++) for (const o of Object.values(b.objs)) {
      if (!UC.BELTS.includes(o.type) || !o.item) continue;
      if (pass === 0) o.prog = Math.min(1, o.prog + dt / bm);
      if (o.prog < 1) continue;
      const d = outDir(o), n = b.objs[key(o.x + DX[d], o.y + DY[d])];
      if (n && n !== o && accept(b, n, o.item)) { o.item = null; o.prog = 0; if (o.type === 'wye') o.alt ^= 1; }
    }
  }

  /* ---------- ちくわ君 ---------- */
  function speedOf(G, r) { return (1 + G.abil.spd * 0.25) * (r.mp < CFG.lowMp ? CFG.lowMpSlow : 1); }

  function stepRobot(G, r, dt, c, travel) {
    const b = G.bases[r.base];
    if (r.bub && G.time > r.bub.until) r.bub = null;
    const w = travel ? null : curWindow(r, G.time);
    const mode = !w ? 'off' : (G.time >= w.bs && G.time < w.be) ? 'break' : 'work';
    if (mode !== r.mode) changeMode(G, r, b, mode);
    r.mode = mode;

    // 季節（勤務中）。夏は体力、冬は精神力が減る。クーラー・暖房がオンなら防ぐ
    if (mode === 'work') {
      if (c.season === 'summer' && !hasObj(b, 'cooler', true)) r.hp = clamp(r.hp + CFG.summerHp * dt / 60, 0, 100);
      if (c.season === 'winter' && !hasObj(b, 'heater', true)) r.mp = clamp(r.mp + CFG.winterMp * dt / 60, 0, 100);
    }

    // 自動で歩く（れいぞうこへの行き帰り）
    if (r.path && r.path.length) { walkPath(G, r, dt); return; }
    if (r.path) { r.path = null; arrived(G, r, b); }

    if (mode === 'break') { breakTick(G, r, b, dt); return; }
    if (mode !== 'work') return;
    if (r.injured || r.sulk) return;
    if (!r.running) return;

    // 勤務中・実行中の体力の減り
    r.hp = clamp(r.hp + CFG.workHp * (1 - G.abil.tough * 0.2) * dt / 60, 0, 100);
    if (r.hp <= 0) { r.injured = true; r.act = null; bubble(G, r, '🩹', 99999); emit('injured', r); return; }
    if (r.mp <= 0) { r.sulk = true; r.act = null; bubble(G, r, '😞', 99999); emit('sulk', r); return; }

    let left = dt * speedOf(G, r), guard = 0;
    while (left > 0 && guard++ < 50) {
      if (!r.act) { if (!nextPiece(G, r)) return; continue; }
      const a = r.act;
      const use = Math.min(left, a.left);
      a.left -= use; left -= use;
      if (a.k === 'move') a.p = 1 - a.left / a.total;
      if (a.left > 1e-6) break;
      finishAct(G, r, b);
    }
  }

  function changeMode(G, r, b, mode) {
    if (mode === 'break') {
      // 休けい：いまの動きを終わらせて、れいぞうこへ。休けいのあと元の場所へ戻る
      if (r.act && r.act.k === 'work' && r.act.o) r.act.o.busy = false;
      if (r.act && r.act.k === 'move') { r.x = r.act.tx; r.y = r.act.ty; r.act = { k: 'fwd', left: 0 }; }   // 進むの続きは戻ってから
      else r.act = null;
      r.brk = { sx: r.x, sy: r.y, sd: r.dir, phase: 'go', vent: false, vend: false };
      const vent = Object.values(b.objs).find(o => o.type === 'vent');
      const goal = vent && !r.injured ? nextTo(b, 'vent') : nextTo(b, 'fridge');
      if (vent && !r.injured) r.brk.phase = 'govent';
      r.path = findPath(b, r.x, r.y, goal) || [];
    } else if (r.brk) {
      // 休けいおわり：元の場所へ戻る
      const br = r.brk;
      r.brk = { ...br, phase: 'back' };
      r.path = findPath(b, r.x, r.y, (x, y) => x === br.sx && y === br.sy) || [];
      if (!r.path.length) { r.x = br.sx; r.y = br.sy; r.dir = br.sd; r.brk = null; r.path = null; }
    }
  }

  function walkPath(G, r, dt) {
    const [nx, ny] = r.path[0];
    if (!r.walk) { r.walk = { fx: r.x, fy: r.y, p: 0 }; for (let d = 0; d < 4; d++) if (r.x + DX[d] === nx && r.y + DY[d] === ny) r.dir = d; }
    r.walk.p += dt * speedOf(G, r) / CFG.moveMin;
    if (r.walk.p >= 1) { r.x = nx; r.y = ny; r.walk = null; r.path.shift(); pickCoin(G, r); }
  }

  function arrived(G, r, b) {
    const br = r.brk;
    if (!br) return;
    if (br.phase === 'govent') {
      br.phase = 'vent'; br.ventLeft = 15;
      for (let d = 0; d < 4; d++) { const o = b.objs[key(r.x + DX[d], r.y + DY[d])]; if (o && o.type === 'vent') r.dir = d; }
    } else if (br.phase === 'go') {
      br.phase = 'in';
      if (!br.vend && hasObj(b, 'vend')) { br.vend = true; r.hp = clamp(r.hp + 10, 0, 100); }
      emit('fridge', r);
    } else if (br.phase === 'back') {
      r.dir = br.sd; r.brk = null;
    }
  }

  function breakTick(G, r, b, dt) {
    const br = r.brk;
    if (!br) return;
    if (br.phase === 'vent') {
      br.ventLeft -= dt;
      if (br.ventLeft <= 0) {
        if (!br.vent) { br.vent = true; r.mp = clamp(r.mp + 10, 0, 100); }
        br.phase = 'go'; r.path = findPath(b, r.x, r.y, nextTo(b, 'fridge')) || [];
      }
      return;
    }
    if (br.phase === 'in') {
      r.hp = clamp(r.hp + CFG.fridgeHeal * dt / 60, 0, 100);
      r.mp = clamp(r.mp + CFG.fridgeHeal * dt / 60, 0, 100);
      if (r.sulk && r.mp >= 20) { r.sulk = false; r.bub = null; }
    }
  }
  /* れいぞうこから出す／もう一度入る（休けい中だけ） */
  UC.fridgeToggle = function (G, r) {
    if (!r.brk || r.mode !== 'break' || r.path) return false;
    if (r.brk.phase === 'in') { r.brk.phase = 'out'; return true; }
    if (r.brk.phase === 'out') { r.brk.phase = 'in'; return true; }
    return false;
  };

  function pickCoin(G, r) {
    const b = G.bases[r.base], k = key(r.x, r.y);
    if (b.coins[k]) { const v = b.coins[k]; delete b.coins[k]; G.coin += v; G.stats.coins += v; emit('coin', { r, v }); }
  }

  /* 次のピースを読む。読めなければ false（指示書がからっぽ） */
  function nextPiece(G, r) {
    if (!r.stack.length) r.stack = [{ w: 'main', ip: 0 }];
    for (let n = 0; n < 40; n++) {
      const fr = r.stack[r.stack.length - 1];
      const list = fr.w === 'main' ? r.prog.main : r.prog.f[fr.w];
      if (fr.ip >= list.length) {
        if (fr.w === 'main') { if (!list.length) return false; fr.ip = 0; r.act = { k: 'wait', left: CFG.callMin }; return true; }   // メインは最後まで行くとくり返す
        r.stack.pop(); continue;
      }
      const pc = list[fr.ip++];
      r.cur = { w: fr.w, ip: fr.ip - 1 };
      if (pc === 'f1' || pc === 'f2' || pc === 'f3') {
        const fi = +pc[1] - 1;
        if (r.stack.length >= 8 || !r.prog.f[fi].length) { bubble(G, r, '？'); r.act = { k: 'wait', left: CFG.bumpMin }; return true; }
        r.stack.push({ w: fi, ip: 0 });
        r.act = { k: 'wait', left: CFG.callMin }; return true;
      }
      r.act = startPiece(G, r, pc);
      return true;
    }
    return false;
  }

  function startPiece(G, r, pc) {
    switch (pc) {
      case 'fwd': return { k: 'fwd', left: 0 };
      case 'left': r.dir = (r.dir + 3) % 4; return { k: 'wait', left: CFG.turnMin };
      case 'right': r.dir = (r.dir + 1) % 4; return { k: 'wait', left: CFG.turnMin };
      case 'back': r.dir = (r.dir + 2) % 4; return { k: 'wait', left: CFG.turnMin * 2 };
      case 'hold': return { k: 'hold', left: CFG.holdMin };
      case 'work': {
        const o = front(G, r);
        if (o && o.type === 'pack' && o.item && !o.item.packed) { o.busy = true; return { k: 'work', left: CFG.workMin, o }; }
        bubble(G, r, '？'); return { k: 'wait', left: CFG.bumpMin };
      }
      case 'op': return { k: 'op', left: CFG.opMin };
    }
    return { k: 'wait', left: CFG.bumpMin };
  }

  function front(G, r) {
    const b = G.bases[r.base];
    return b.objs[key(Math.round(r.x) + DX[r.dir], Math.round(r.y) + DY[r.dir])];
  }
  UC.front = front;

  function finishAct(G, r, b) {
    const a = r.act;
    r.act = null;
    if (a.k === 'fwd' || a.k === 'move') {
      if (a.k === 'move') { r.x = a.tx; r.y = a.ty; pickCoin(G, r); }
      // 進む：ものに当たるまで進む
      const nx = r.x + DX[r.dir], ny = r.y + DY[r.dir];
      if (blocked(G, r, nx, ny)) { if (a.k === 'fwd') { r.act = { k: 'wait', left: CFG.bumpMin }; } return; }
      r.act = { k: 'move', tx: nx, ty: ny, left: CFG.moveMin, total: CFG.moveMin, p: 0 };
      return;
    }
    if (a.k === 'hold') return doHold(G, r, b);
    if (a.k === 'work') { if (a.o && a.o.item) { a.o.item.packed = true; a.o.busy = false; emit('packed', r); } return; }
    if (a.k === 'op') {
      const o = front(G, r);
      if (o && (o.type === 'heater' || o.type === 'cooler' || o.type === 'sorter')) { o.on = !o.on; emit('switch', o); }
      else bubble(G, r, '？');
    }
  }

  function doHold(G, r, b) {
    const o = front(G, r);
    if (!o) return bubble(G, r, '？');
    if (!r.hold) {
      let p = null;
      if (o.type === 'src' && o.stock.length) p = o.stock.shift();
      else if (UC.BELTS.includes(o.type) && o.item) { p = o.item; o.item = null; o.prog = 0; }
      else if (o.type === 'pool' && o.stock.length) p = o.stock.pop();
      else if (o.type === 'pack' && o.item && !o.busy) { p = o.item; o.item = null; }
      if (p) { r.hold = p; emit('take', r); } else bubble(G, r, '？');
    } else {
      if (o.type === 'src' || o.type === 'fridge' || o.type === 'pc') return bubble(G, r, '？');
      if (accept(b, o, r.hold)) { r.hold = null; emit('put', r); } else bubble(G, r, '？');
    }
  }

  /* RUN・緊急停止 */
  UC.run = function (G, r) { r.running = true; r.stack = []; r.act = null; r.cur = null; };
  UC.stop = function (G, r) {
    if (r.act && r.act.k === 'work' && r.act.o) r.act.o.busy = false;
    r.running = false; r.stack = []; r.act = null; r.cur = null;
  };

  /* ---------- お店 ---------- */
  UC.buyRobot = function (G) {
    const n = G.robots.length;
    if (n >= UC.ROBOT_MAX) return 'これ以上ふやせません';
    const cost = UC.ROBOT_COST[n];
    if (G.coin < cost) return '恋ンが足りません';
    const b = G.bases[0];
    let pos = null;
    for (let y = 0; y < b.h && !pos; y++) for (let x = 0; x < b.w && !pos; x++) if (!blocked(G, { base: 0 }, x, y) && !b.coins[key(x, y)]) pos = [x, y];
    if (!pos) return '置く場所がありません';
    G.coin -= cost;
    G.robots.push(newRobot(n, 0, pos[0], pos[1]));
    return null;
  };
  UC.buyBase = function (G, sizeIdx) {
    const cost = UC.SIZES[sizeIdx].cost;
    if (G.coin < cost) return '恋ンが足りません';
    G.coin -= cost;
    G.bases.push(newBase(sizeIdx, 'きょてん' + G.bases.length));
    return null;
  };
  /* ちくわ君を別の拠点へ（空いているマスへ） */
  UC.moveRobot = function (G, r, bi) {
    const b = G.bases[bi];
    UC.stop(G, r); r.path = null; r.walk = null; r.brk = null;
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (!b.objs[key(x, y)] && !robotAt(G, bi, x, y, r)) { r.base = bi; r.x = x; r.y = y; return true; }
    return false;
  };
  UC.canPlace = function (G, bi, x, y) {
    const b = G.bases[bi];
    return inB(b, x, y) && !b.objs[key(x, y)] && !robotAt(G, bi, x, y, null);
  };
})();

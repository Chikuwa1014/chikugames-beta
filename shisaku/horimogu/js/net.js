/* ほりほりもぐもぐ — みんなで遊ぶ（共通部品 common/v1/room.js を使う）
   ・ロビー：部屋を作る／参加（共通のロビー画面）。親が「スタート」を押すと、シード値とスタート地点を配る
   ・試合中：子は自分の動きと操作を親へ、親は体力・弾・罠・勝ち負けを全員へ
   ・親が抜けたら：G.succ（親が決めた引き継ぎ役）が同じ部屋コードで親になり、ほかの人はつなぎ直して続ける。抜けた親は負け
   ・子が抜けたら：その子は負け */
(function () {
  const HM = window.HM, T = HM.T, G = HM.G;
  const NET = HM.NET = {
    room: null, code: null, inMatch: false, migrating: false,
    pid: Math.random().toString(36).slice(2, 10),
    roster: new Map(),     // 部屋の ID → { pid, name, color }（親だけが持つ）
    lobbyList: [],         // 子：親から届いたメンバーの色
    hostPid: null,
    queue: [],             // つなぎ直しの間に送れなかったメッセージ
    onLobby: null, onStart: null, onStatus: null, onClosed: null
  };
  const KEY_NAME = 'horimogu-name';

  NET.myName = () => CG.room.lobbyName({ nameKey: KEY_NAME })();
  NET.myColor = () => HM.UI ? HM.UI.colorChoice() : 'auto';

  function makeRoom() {
    const room = CG.room.create({
      max: T.multi.max,
      name: () => NET.myName(),
      onMessage, onMembers, onReady, onClose,
      onStatus(text, err) { NET.onStatus && NET.onStatus(text, err); }
    });
    return room;
  }

  /** ロビーを開く（el にロビー画面を作る） */
  NET.openLobby = function (el) {
    if (!NET.room) NET.room = makeRoom();
    el.innerHTML = '';
    const box = document.createElement('div');
    el.appendChild(box);
    CG.room.lobby(box, NET.room, { nameKey: KEY_NAME, title: 'みんなで ほりほり', inviteMsg: 'ほりほりもぐもぐでバトルしよう！', tags: ['ほりほりもぐもぐ'] });
  };
  NET.leave = function () {
    if (NET.room) NET.room.leave();
    NET.inMatch = false;
    NET.roster = new Map();
    NET.lobbyList = [];
  };
  NET.isHost = () => NET.room && NET.room.role === 'host';

  /* ---------- 送る ---------- */
  function toHost(m) {
    if (NET.isHost()) { G.hostOnMsg(NET.pid, m); return; }
    if (NET.room && NET.room.open && !NET.migrating) NET.room.send(m);
    else if (NET.queue.length < 800) NET.queue.push(m);
  }
  function ridOf(pid) { for (const [rid, r] of NET.roster) if (r.pid === pid) return rid; return null; }
  function pidOf(rid) { const r = NET.roster.get(rid); return r ? r.pid : null; }
  function wire() {
    G.toHost = toHost;
    G.broadcast = ev => { if (NET.isHost()) NET.room.broadcast(ev); };
    G.broadcastExcept = (pid, ev) => {
      if (!NET.isHost()) return;
      for (const [rid, r] of NET.roster) if (rid !== '0' && r.pid !== pid) NET.room.sendTo(rid, ev);
    };
  }

  /* ---------- 親：メンバーと色 ---------- */
  function sendHello() {
    NET.room.send({ t: 'hi', pid: NET.pid, name: NET.myName(), color: NET.myColor() });
  }
  /** 親がフィールドの大きさを変えたら、みんなに知らせる */
  NET.updateSize = function () {
    if (NET.isHost() && !NET.inMatch) pushLobby();
  };
  NET.updateColor = function () {
    if (!NET.room || !NET.room.role) return;
    if (NET.isHost()) { const r = NET.roster.get('0'); if (r) r.color = NET.myColor(); pushLobby(); }
    else if (NET.room.open) sendHello();
  };
  function pushLobby() {
    const list = [...NET.roster.entries()].map(([rid, r]) => ({ rid, pid: r.pid, name: r.name, color: r.color }));
    NET.lobbyList = list;
    NET.lobbySize = HM.UI.sizeChoice();
    NET.room.broadcast({ t: 'roster', list, inMatch: NET.inMatch, size: NET.lobbySize });
    NET.onLobby && NET.onLobby();
  }

  function onReady() {
    if (NET.room.role === 'host') {
      if (NET.migrating) return hostTookOver();
      NET.roster = new Map([['0', { pid: NET.pid, name: NET.myName(), color: NET.myColor() }]]);
      pushLobby();
    } else {
      sendHello();
      if (NET.migrating) {
        NET.migrating = false;
        G.isHost = false;
        flushQueue();
        G.toast && G.toast('新しい親につなぎ直しました');
      }
    }
    NET.onLobby && NET.onLobby();
  }
  function flushQueue() {
    const q = NET.queue; NET.queue = [];
    for (const m of q) NET.room.send(m);
  }

  function onMembers(list) {
    if (!NET.isHost()) { NET.onLobby && NET.onLobby(); return; }
    // ぬけた人をメンバーから外す。試合中なら負け
    const ids = new Set(list.map(m => m.id));
    for (const rid of [...NET.roster.keys()]) {
      if (rid === '0' || ids.has(rid)) continue;
      const r = NET.roster.get(rid);
      NET.roster.delete(rid);
      if (NET.inMatch && G.running && !G.over) {
        const pl = G.players.get(r.pid);
        if (pl && pl.alive) G.hostKill(r.pid, 'left');
      }
    }
    updateSucc();
    pushLobby();
  }

  /** 親を引き継ぐ人：入った順で、いまつながっている子のいちばん前（生きている人を優先） */
  function updateSucc() {
    const conn = new Set([...NET.roster.values()].map(r => r.pid));
    const cand = (G.order || []).filter(p => p !== NET.pid && conn.has(p));
    const alive = cand.filter(p => G.players.get(p) && G.players.get(p).alive);
    G.succ = alive[0] || cand[0] || null;
  }

  function onMessage(from, m) {
    if (!m || typeof m !== 'object') return;
    if (NET.isHost()) {
      if (m.t === 'hi') {
        const known = NET.inMatch && G.players.has(m.pid);
        NET.roster.set(from, { pid: m.pid, name: String(m.name || 'ななし').slice(0, 10), color: m.color || 'auto' });
        if (NET.inMatch && !known) NET.room.sendTo(from, { t: 'busy' });
        if (known) {
          const pl = G.players.get(m.pid); if (pl) pl.seen = performance.now() / 1000;
          // 引き継ぎの間にほかの人が掘った分を送る（その人自身の分は除く）
          if (G.digLog) {
            const c = [];
            for (const [who, ops] of G.digLog) if (who !== m.pid) c.push(...ops);
            if (c.length) NET.room.sendTo(from, { t: 'dig', c });
          }
        }
        updateSucc();
        pushLobby();
        return;
      }
      const pid = pidOf(from);
      if (pid && NET.inMatch) G.hostOnMsg(pid, m);
      return;
    }
    // 子
    switch (m.t) {
      case 'roster': NET.lobbyList = m.list || []; NET.lobbySize = m.size || 'grande'; NET.onLobby && NET.onLobby(); return;
      case 'busy': NET.onStatus && NET.onStatus('いまは試合中です。終わったら次の試合から参加できます', false); return;
      case 'start': startMatch(m); return;
      case 'lobby': NET.inMatch = false; NET.onLobby && NET.onLobby(); return;
      case 'snap': if (NET.inMatch && G.running) G.onSnap(m); return;
    }
    if (NET.inMatch && G.running) G.onEvent(m);
  }

  /* ---------- 親：スタート ---------- */
  NET.canStart = () => NET.isHost() && !NET.inMatch && NET.roster.size >= 2;
  NET.startMatch = function () {
    if (!NET.canStart()) return;
    const seed = (Math.random() * 2 ** 31) >>> 0;
    const r = HM.rng(seed ^ 0x9e3779b9);
    const list = [...NET.roster.values()];
    // 色：自分で選んだ色はそのまま。おまかせはノーマル→青→赤→紫の順で、空いている色
    const used = new Set(list.filter(p => p.color !== 'auto').map(p => p.color));
    const auto = T.colors.map(c => c.key).filter(k => !used.has(k));
    const sizeKey = HM.UI.sizeChoice(), N = HM.fieldSize(sizeKey), a0 = r() * Math.PI * 2;
    const ring = Math.min(T.multi.spawnRing, N * 0.3), cl = v => Math.max(3, Math.min(N - 3, v));
    const roster = list.map((p, i) => {
      const a = a0 + i / list.length * Math.PI * 2;
      const rad = ring * (0.85 + r() * 0.3);
      const spawn = [Math.floor(cl(N / 2 + Math.cos(a) * rad)) + 0.5, Math.floor(N * 0.33 + r() * N * 0.33) + 0.01, Math.floor(cl(N / 2 + Math.sin(a) * rad)) + 0.5];
      return { pid: p.pid, name: p.name, color: p.color !== 'auto' ? p.color : (auto.shift() || 'normal'), spawn };
    });
    const msg = { t: 'start', seed, roster, hostPid: NET.pid, size: N, sizeKey };
    NET.room.broadcast(msg);
    startMatch(msg);
  };

  function startMatch(m) {
    NET.inMatch = true;
    NET.hostPid = m.hostPid;
    NET.code = NET.room.code;
    wire();
    G.sizeKey = m.sizeKey || 'grande';
    G.start({ mode: 'multi', seed: m.seed, size: m.size || T.field, me: { pid: NET.pid, name: NET.myName() }, roster: m.roster, isHost: NET.isHost() });
    if (NET.isHost()) updateSucc();
    NET.onStart && NET.onStart();
  }

  /** 親：試合が終わったらロビーへ */
  NET.backToLobby = function () {
    NET.inMatch = false;
    if (NET.isHost()) { NET.room.broadcast({ t: 'lobby' }); pushLobby(); }
  };

  /* ---------- 親がいなくなった：引き継ぎ ---------- */
  function onClose(text, was) {
    if (NET.inMatch && G.running && !G.over && was && !NET.migrating) {
      beginMigration();
      return;
    }
    NET.inMatch = false;
    NET.onClosed && NET.onClosed(text);
  }

  function beginMigration() {
    NET.migrating = true;
    const old = NET.hostPid;
    const code = NET.code;
    G.toast && G.toast('親がぬけました。引き継いでいます…');
    // 古い親は、自分の画面ではもう動かさない（新しい親が「負け」を配る）
    const pl = G.players.get(old);
    if (pl) pl.mv = 0;
    const iAmNext = G.succ === NET.pid;
    NET.room = makeRoom();
    if (iAmNext) NET.room.takeOver(code);
    else setTimeout(() => { if (NET.migrating) NET.room.rejoin(code); }, 1200);
  }

  /** 新しい親になった */
  function hostTookOver() {
    NET.migrating = false;
    const old = NET.hostPid;
    NET.hostPid = NET.pid;
    G.isHost = true;
    NET.roster = new Map([['0', { pid: NET.pid, name: NET.myName(), color: NET.myColor() }]]);
    wire();
    G.toast && G.toast('あなたが親になりました');
    G.digLog = [];
    flushQueue2();
    if (G.players.get(old) && G.players.get(old).alive) G.hostKill(old, 'left');
    // しばらく待って、戻ってこない人は負け
    const t0 = performance.now() / 1000;
    for (const p of G.players.values()) p.seen = 0;
    setTimeout(() => {
      if (!NET.isHost() || !G.running || G.over) return;
      const back = new Set([...NET.roster.values()].map(r => r.pid));
      for (const p of G.players.values()) {
        if (p.alive && !back.has(p.pid)) G.hostKill(p.pid, 'left');
      }
      void t0;
      G.digLog = null;
      updateSucc();
    }, T.multi.rejoinWait * 1000);
    updateSucc();
    G.hostCheckEnd();
  }
  // 自分が送れなかった操作は、親になった自分で処理する
  function flushQueue2() {
    const q = NET.queue; NET.queue = [];
    for (const m of q) if (m.t !== 'st') G.hostOnMsg(NET.pid, m);
  }
})();

/* ほりほりもぐもぐ — 画面・HUD・操作・メインループ */
(function () {
  const HM = window.HM, T = HM.T, G = HM.G, NET = HM.NET, M4 = HM.M4;
  const $ = s => document.querySelector(s);
  const KEY_COLOR = 'horimogu-color', KEY_SENS = 'horimogu-sens', KEY_BEST = 'horimogu-best-v2', KEY_CAM = 'horimogu-cam', KEY_SIZE = 'horimogu-size', KEY_GYRO = 'horimogu-gyro';
  // フィールドの大きさ（short・tall・venti・grande）。はじめはグランデ
  let sizePick = CG.ls.get(KEY_SIZE, 'grande');
  if (!T.sizes.find(s => s.key === sizePick)) sizePick = 'grande';
  // 視点：far＝後方（はじめはこちら）、near＝近く
  G.camMode = CG.ls.get(KEY_CAM, 'far') === 'near' ? 'near' : 'far';
  function setCam(m) {
    G.camMode = m;
    CG.ls.set(KEY_CAM, m);
    const t = document.querySelector('#camTxt');
    if (t) t.textContent = m === 'far' ? '後方' : '近く';
  }

  /* ---------- 色えらび ---------- */
  let colorPick = CG.ls.get(KEY_COLOR, 'auto') || 'auto';
  const UI = HM.UI = {
    colorChoice: () => colorPick,
    sizeChoice: () => sizePick,
    soloColor: () => colorPick === 'auto' ? 'normal' : colorPick
  };
  function drawColorPicker(el, withAuto) {
    const opts = (withAuto ? [{ key: 'auto', name: 'おまかせ', burnt: '#999', body: '#eee' }] : []).concat(T.colors);
    if (!withAuto && colorPick === 'auto') colorPick = 'auto';
    el.innerHTML = opts.map(c => {
      const on = c.key === colorPick || (!withAuto && colorPick === 'auto' && c.key === 'normal');
      return `<button type="button" class="sw${on ? ' on' : ''}" data-col="${c.key}" title="${c.name}">
        <span class="swc" style="--b:${c.burnt};--w:${c.body}">${c.key === 'auto' ? '?' : ''}</span><small>${c.name}</small></button>`;
    }).join('');
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-col]');
    if (!b) return;
    colorPick = b.dataset.col;
    CG.ls.set(KEY_COLOR, colorPick);
    document.querySelectorAll('.colors').forEach(el => drawColorPicker(el, el.dataset.auto === '1'));
    NET.updateColor();
    drawPreview();
  });

  /* ---------- フィールドの大きさえらび ---------- */
  function drawSizePickers() {
    document.querySelectorAll('.sizes').forEach(el => {
      const lobby = el.dataset.lobby === '1';
      // ロビーでは親だけが選べる。子には親の選んだ大きさを出す
      const guest = lobby && !NET.isHost();
      const cur = guest ? (NET.lobbySize || 'grande') : sizePick;
      el.innerHTML = T.sizes.map(s => `<button type="button" class="sz${s.key === cur ? ' on' : ''}" data-size="${s.key}"${guest ? ' disabled' : ''}>
        <b>${s.name}</b><small>${s.n}×${s.n}×${s.n}</small></button>`).join('');
    });
    const bt = document.querySelector('#bestTxt');
    if (bt) {
      const b = bestOf(sizePick), nm = T.sizes.find(s => s.key === sizePick).name;
      bt.textContent = b ? `ひとりプレイの自己ベスト（${nm}）：のこり ${b.left} 秒で全滅` : '';
    }
  }
  UI.drawSizePickers = drawSizePickers;
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-size]');
    if (!b || b.disabled) return;
    sizePick = b.dataset.size;
    CG.ls.set(KEY_SIZE, sizePick);
    drawSizePickers();
    NET.updateSize && NET.updateSize();
  });
  function bestOf(key) {
    const all = CG.ls.getJSON(KEY_BEST, null) || {};
    return all[key] || null;
  }

  /* ---------- 画面の切りかえ ---------- */
  function show(id) {
    for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
    document.body.classList.toggle('playing', id === 'play');
  }
  UI.show = show;

  /* ---------- ホームのちくわ君（絵） ---------- */
  let previewT = 0;
  function drawPreview() {
    const c = $('#mascot');
    if (!c) return;
    const x = c.getContext('2d'), W = c.width, H = c.height;
    const col = T.colors.find(k => k.key === UI.soloColor()) || T.colors[0];
    x.clearRect(0, 0, W, H);
    // 豆腐のかたまりと、トンネル
    const s = 6;
    for (let gy = 0; gy < H / s; gy++) for (let gx = 0; gx < W / s; gx++) {
      const hh = HM.hash3(gx, gy, 1, 3);
      const tun = Math.hypot(gx - 22 - Math.sin(gy * 0.3) * 3, (gy - 12) * 1.4) < 6 || Math.hypot(gx - 22, gy - 16) < 5;
      if (tun) { x.fillStyle = `rgb(${40 + hh * 10},${28 + hh * 8},${20})`; }
      else { const k = 0.93 + hh * 0.07; x.fillStyle = `rgb(${Math.round(247 * k)},${Math.round(240 * k)},${Math.round(219 * k)})`; }
      if (gy % 7 === 0 && !tun) x.fillStyle = '#E8DFC6';
      x.fillRect(gx * s, gy * s, s, s);
    }
    // ちくわ君
    const bx = 22 * s - 24, by = 13 * s - 26 + Math.round(Math.sin(previewT * 4) * 2);
    x.fillStyle = col.burnt; x.fillRect(bx, by, 48, 54);
    x.fillStyle = col.body; x.fillRect(bx + 4, by + 14, 40, 26);
    x.fillStyle = '#2A1A10'; x.fillRect(bx + 12, by + 20, 6, 6); x.fillRect(bx + 30, by + 20, 6, 6);
    x.fillStyle = '#fff'; x.fillRect(bx + 12, by + 18, 6, 3); x.fillRect(bx + 30, by + 18, 6, 3);
    x.fillStyle = '#2A1A10'; x.fillRect(bx + 20, by + 32, 8, 3);
    x.fillStyle = '#F59A9A'; x.fillRect(bx + 6, by + 28, 5, 3); x.fillRect(bx + 37, by + 28, 5, 3);
    x.fillStyle = '#5A3A1E'; x.fillRect(bx + 16, by, 16, 6);
    // 飛びちる豆腐
    for (let i = 0; i < 6; i++) {
      const a = previewT * 3 + i, r = 20 + ((previewT * 40 + i * 13) % 30);
      x.fillStyle = '#F7F0DB';
      x.fillRect(bx + 24 + Math.cos(a) * r, by + 10 - Math.abs(Math.sin(a)) * r * 0.6, 5, 5);
    }
  }

  /* ---------- HUD ---------- */
  const hud = {};
  function buildHud() {
    hud.hp = $('#hpFill'); hud.hpTxt = $('#hpTxt'); hud.timer = $('#timer'); hud.left = $('#leftCnt');
    hud.radar = $('#radar'); hud.dig = $('#digBanner'); hud.digLeft = $('#digLeft'); hud.items = $('#itembar'); hud.armor = $('#armorTag'); hud.spec = $('#spec');
  }
  G.onHud = function () {
    if (!G.me) return;
    const pl = G.players.get(G.me.pid);
    const hp = pl ? Math.max(0, Math.round(pl.hp)) : 0;
    hud.hp.style.width = hp + '%';
    hud.hp.style.background = hp > 50 ? 'var(--green)' : hp > 25 ? 'var(--gold)' : 'var(--red)';
    hud.hpTxt.textContent = hp;
    if (G.mode === 'solo') hud.left.textContent = '敵 のこり ' + G.bots.filter(b => b.alive).length;
    else hud.left.textContent = 'のこり ' + [...G.players.values()].filter(p => p.alive).length + ' 人';
    // 持ち物
    const me = G.me;
    let h = `<button type="button" class="slot fist${me.sel < 0 ? ' on' : ''}" data-slot="-1"><b>素手</b><small>掘る</small></button>`;
    me.inv.forEach((s, i) => {
      const I = T.items[s.type];
      const n = s.type === 'otama' ? Math.ceil(s.count / I.energy * 100) + '%' : '×' + s.count;
      h += `<button type="button" class="slot${i === me.sel ? ' on' : ''}" data-slot="${i}" style="--c:${I.col}"><b>${I.short}</b><small>${n}</small></button>`;
    });
    if (hud.items.dataset.h !== h) { hud.items.innerHTML = h; hud.items.dataset.h = h; }
    const sel = me.inv[me.sel];
    $('#btnItem').disabled = !sel;
    $('#btnItem').innerHTML = sel ? '<b>' + T.items[sel.type].short + '</b><small>つかう</small>' : '<b>－</b><small>アイテム</small>';
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-slot]');
    if (!b || !G.me) return;
    const i = +b.dataset.slot;
    G.me.sel = i;
    G.onHud();
  });

  let toastTimer = 0;
  G.toast = function (t) {
    const el = $('#toast');
    el.textContent = t; el.hidden = false; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  };

  /* ---------- 操作 ---------- */
  const inp = { mx: 0, mz: 0, jump: false, main: false, item: false, itemFirst: false };
  const keys = new Set();
  let itemWas = false, sens = +(CG.ls.get(KEY_SENS, '1')) || 1;
  const touchMode = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  document.body.classList.toggle('touch', touchMode);

  window.addEventListener('keydown', e => {
    if (!G.running || $('#play').hidden || !$('#pause').hidden) return;
    if (e.target.tagName === 'INPUT') return;
    keys.add(e.code);
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (/^Digit[0-9]$/.test(e.code)) { const n = +e.code.slice(5); G.me.sel = n === 0 ? -1 : Math.min(G.me.inv.length - 1, n - 1); G.onHud(); }
    if (e.code === 'KeyQ') cycleItem(-1);
    if (e.code === 'KeyR') cycleItem(1);
    if (e.code === 'Escape') openPause();
    if (e.code === 'KeyV') toggleCam();
    if (e.code === 'KeyC') resetView();
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  function toggleCam() {
    setCam(G.camMode === 'far' ? 'near' : 'far');
    G.toast(G.camMode === 'far' ? '視点：後方' : '視点：近く');
  }
  /** 視点のリセット：上下の向きを水平（はじめの向き）にもどす。傾けて見回すでずれたときに使う */
  function resetView() {
    if (!G.me) return;
    G.me.pitch = -0.15;
    G.toast('視点を水平にもどしました');
  }
  function cycleItem(d) {
    const n = G.me.inv.length;
    if (!n) return;
    let s = G.me.sel + d;
    if (s < -1) s = n - 1; if (s >= n) s = -1;
    G.me.sel = s; G.onHud();
  }

  // ボタン（押している間）
  const held = { main: false, item: false, jump: false };
  function holdBtn(id, k) {
    const b = $(id);
    const on = e => { e.preventDefault(); e.stopPropagation(); held[k] = true; b.classList.add('down'); HM.sfx.unlock(); try { b.setPointerCapture(e.pointerId); } catch (er) { } };
    const off = e => { if (e) e.preventDefault(); held[k] = false; b.classList.remove('down'); };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('lostpointercapture', () => off());
    b.addEventListener('contextmenu', e => e.preventDefault());
  }

  // さわる操作：左半分の下＝スティック、それ以外＝見回す
  const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  const looks = new Map();
  const STICK_R = 46;
  /** スティックを倒す。半径より外へ指が出たら、中心が指についていく（端で止まって効かなくならないように） */
  function moveStick(cx, cy) {
    let dx = cx - stick.ox, dy = cy - stick.oy;
    const l = Math.hypot(dx, dy);
    if (l > STICK_R) {
      stick.ox += dx - dx / l * STICK_R; stick.oy += dy - dy / l * STICK_R;
      dx = dx / l * STICK_R; dy = dy / l * STICK_R;
      const k = $('#stick'); k.style.left = stick.ox + 'px'; k.style.top = stick.oy + 'px';
    }
    stick.x = dx / STICK_R; stick.y = dy / STICK_R;
    $('#knob').style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }
  function resetStick() {
    stick.id = null; stick.x = stick.y = 0;
    $('#stick').hidden = true; $('#knob').style.transform = 'translate(-50%,-50%)';
  }
  function setupTouch() {
    const area = $('#touchArea');
    area.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      HM.sfx.unlock();
      const r = area.getBoundingClientRect();
      // v1.1.1：スティックの位置を触ったら、前の指が離れた合図が届いていなくても（stick.id が残っていても）つかみ直す
      if (e.clientX < r.width * 0.45 && e.clientY > r.height * 0.35) {
        if (stick.id !== null && stick.id !== e.pointerId) { try { area.releasePointerCapture(stick.id); } catch (er) { } }
        // 画面の端やアイテム欄の近くで触っても、スティックがどの向きにも倒せる位置に中心を置く
        const R = STICK_R * 0.75, bar = $('#itembar').getBoundingClientRect();
        const maxY = Math.min(r.height - R, (bar.height ? bar.top : r.height) - R * 0.6);
        stick.id = e.pointerId; stick.x = stick.y = 0;
        stick.ox = Math.max(R, e.clientX); stick.oy = Math.max(r.height * 0.35, Math.min(maxY, e.clientY));
        const k = $('#stick'); k.hidden = false; k.style.left = stick.ox + 'px'; k.style.top = stick.oy + 'px';
        moveStick(e.clientX, e.clientY);
      } else looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { area.setPointerCapture(e.pointerId); } catch (er) { }
    });
    area.addEventListener('pointermove', e => {
      if (e.pointerType === 'mouse') return;
      if (e.pointerId === stick.id) { moveStick(e.clientX, e.clientY); return; }
      const L = looks.get(e.pointerId);
      if (L && G.me) {
        G.me.yaw -= (e.clientX - L.x) * 0.0065 * sens;
        G.me.pitch = clampPitch(G.me.pitch - (e.clientY - L.y) * 0.0055 * sens);
        L.x = e.clientX; L.y = e.clientY;
      }
    });
    const end = e => {
      if (e.pointerId === stick.id) resetStick();
      looks.delete(e.pointerId);
    };
    area.addEventListener('pointerup', end);
    area.addEventListener('pointercancel', end);
    area.addEventListener('lostpointercapture', end);
    // 指が離れた合図が届かなかったときも、歩きっぱなしにしない
    window.addEventListener('blur', () => { resetStick(); looks.clear(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { resetStick(); looks.clear(); } });
    // v1.1.1：ポインターの「離れた」合図が届かない端末（アプリ内ブラウザで画面の端のスワイプなどが入ったとき）の保険。
    // 指（touch）の本数と位置を見て、画面に残っていない指のスティック・見回しをやめる（デバッグ報告#11：歩きっぱなしで方向を変えられない）
    const syncTouches = e => {
      if (!e.touches || !e.touches.length) { resetStick(); looks.clear(); return; }
      if (stick.id === null) return;
      const r = area.getBoundingClientRect();
      let near = false;
      for (const t of e.touches) if (Math.hypot(t.clientX - r.left - stick.ox, t.clientY - r.top - stick.oy) <= STICK_R + 40) near = true;
      if (!near) resetStick();
    };
    window.addEventListener('touchend', syncTouches, { passive: true });
    window.addEventListener('touchcancel', syncTouches, { passive: true });
    // 観戦中はタップで見る人を変える
    area.addEventListener('click', () => { if (G.me && G.players.get(G.me.pid) && !G.players.get(G.me.pid).alive) nextSpectate(); });
  }
  /** 触っている途中の操作をすべてやめる（一時停止の出入りで、前の指が残らないように） */
  function resetTouch() { resetStick(); looks.clear(); held.main = held.item = held.jump = false; document.querySelectorAll('.act.down').forEach(b => b.classList.remove('down')); }
  const clampPitch = p => Math.max(-1.35, Math.min(1.25, p));

  // マウス（PC）：画面をクリックするとマウスで見回せる
  function setupMouse() {
    const cv = $('#gl');
    const area = $('#touchArea');
    area.addEventListener('mousedown', e => {
      if (touchMode) return;
      HM.sfx.unlock();
      if (document.pointerLockElement !== area) { area.requestPointerLock && area.requestPointerLock(); return; }
      if (e.button === 0) held.main = true;
      if (e.button === 2) held.item = true;
    });
    window.addEventListener('mouseup', e => { if (e.button === 0) held.main = false; if (e.button === 2) held.item = false; });
    area.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('mousemove', e => {
      if (document.pointerLockElement !== area || !G.me) return;
      G.me.yaw -= e.movementX * 0.0026 * sens;
      G.me.pitch = clampPitch(G.me.pitch - e.movementY * 0.0024 * sens);
    });
    area.addEventListener('wheel', e => { if (G.me) cycleItem(e.deltaY > 0 ? 1 : -1); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      $('#lockHint').hidden = touchMode || document.pointerLockElement === area || !G.running || G.over;
    });
    void cv;
  }

  function readInput() {
    let mx = stick.x, mz = -stick.y;
    if (keys.has('KeyW') || keys.has('ArrowUp')) mz += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) mz -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
    const l = Math.hypot(mx, mz);
    if (l > 1) { mx /= l; mz /= l; }
    inp.mx = mx; inp.mz = mz;
    inp.jump = held.jump || keys.has('Space');
    inp.main = held.main || keys.has('KeyJ');
    const it = held.item || keys.has('KeyE') || keys.has('KeyK');
    inp.itemFirst = it && !itemWas;
    inp.item = it;
    itemWas = it;
    return inp;
  }

  function nextSpectate() {
    const al = [...G.players.values()].filter(p => p.alive);
    if (!al.length) return;
    const i = al.findIndex(p => p.pid === G.me.spectate);
    G.me.spectate = al[(i + 1) % al.length].pid;
  }

  /* ---------- モーションセンサーで見回す ----------
     端末を回した速さ（devicemotion の rotationRate、度/秒）を、そのまま向きの変化に足す。
     スワイプの見回しもそのまま使える。iPhone は押したときに許可を聞く（requestPermission） */
  const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  /** 止まっているときの小さなゆれ（手ぶれ）を消す。しきい値より上は、なめらかにつなぐ */
  const dead = (v, d) => Math.abs(v) <= d ? 0 : v - Math.sign(v) * d;
  const gyro = { on: CG.ls.get(KEY_GYRO, '0') === '1', ok: false, last: 0 };
  const gyroLabel = () => '📱 傾けて見回す：' + (gyro.on ? 'オン' : 'オフ');
  async function gyroAsk() {
    if (gyro.ok) return true;
    const DM = window.DeviceMotionEvent;
    if (!DM) return false;
    if (typeof DM.requestPermission === 'function') {
      // Android の Chrome は 'prompt' を返すことがあるので、断られたときだけやめる
      try { if (await DM.requestPermission() === 'denied') return false; }
      catch (e) { return false; }   // 押したとき以外に呼ぶと失敗する
    }
    gyro.ok = true;
    return true;
  }
  async function gyroToggle() {
    if (!gyro.on || !gyro.ok) {   // オンのまま再読み込みしたときは、押すと許可を聞き直す
      if (!await gyroAsk()) { G.toast('この端末ではモーションセンサーが使えません'); return; }
      gyro.on = true;
    } else gyro.on = false;
    CG.ls.set(KEY_GYRO, gyro.on ? '1' : '0');
    $('#gyroBtn').textContent = gyroLabel();
  }
  window.addEventListener('devicemotion', e => {
    const r = e.rotationRate, t = performance.now();
    const dt = Math.min(0.1, (t - (gyro.last || t)) / 1000);
    gyro.last = t;
    if (!gyro.on || !r || !G.running || G.over || !G.me || !$('#pause').hidden) return;
    const a = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    // 端末の軸ごとの回る速さ（x＝画面の横の軸、y＝画面の縦の軸）。
    // iPhone の Safari は名前が仕様とずれていて、alpha が x、beta が y（2026-10-27 キャリブレーションで確認）。
    // 仕様どおり（Android など）は beta が x、gamma が y
    const T2 = T.gyro;
    const ax = IOS ? r.alpha : r.beta, ay = IOS ? r.beta : r.gamma;
    const x = dead(ax || 0, T2.dead), y = dead(ay || 0, T2.dead), k = Math.PI / 180 * dt * sens * T2.gain;
    // 画面の向きに合わせて、左右に回す軸・上下に傾ける軸を選ぶ（縦持ち：右を向くと y が −、上を見ると x が ＋）
    const [yr, pr] = a === 90 ? [x, -y] : (a === 270 || a === -90) ? [-x, y] : a === 180 ? [-y, -x] : [y, x];
    G.me.yaw += yr * k;
    G.me.pitch = clampPitch(G.me.pitch + pr * k);
  });

  /* ---------- 描画とループ ---------- */
  let R = null, last = 0, raf = 0, hudT = 0;
  function resize() {
    const cv = $('#gl'), ov = $('#ov');
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const d2 = Math.min(window.devicePixelRatio || 1, 2);
    const w2 = Math.round(ov.clientWidth * d2), h2 = Math.round(ov.clientHeight * d2);
    if (ov.width !== w2 || ov.height !== h2) { ov.width = w2; ov.height = h2; }
  }
  window.addEventListener('resize', resize);

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    const t = ts / 1000, dt = Math.min(0.05, Math.max(0.001, t - (last || t)));
    last = t;
    if (!G.running) return;
    const paused = !$('#pause').hidden && G.mode === 'solo';
    if (!paused) G.update(dt, readInput());
    if (!paused) clockTick();
    resize();
    const cv = $('#gl');
    const vp = G.render(cv.width, cv.height);
    drawOverlay(vp, dt);
    hudT -= dt;
    if (hudT <= 0) { hudT = 0.1; tickHud(); }
  }

  /* BGM：秒針の音（試合の時間で 1 秒ごと）。ほりほりタイムの終わりで合図 */
  let lastSec = -1, wasDig = false;
  function clockTick() {
    if (!G.running || G.over) { lastSec = -1; return; }
    const sec = Math.floor(G.t);
    if (sec !== lastSec) {
      lastSec = sec;
      const left = G.digEnd - G.t;
      HM.sfx.tick(sec % 2 === 0, G.inDig() && left <= 10);
    }
    const dig = G.inDig();
    if (wasDig && !dig) {
      HM.sfx.gong();
      G.toast(G.mode === 'solo' ? 'バトル開始！ 敵を全滅させろ！（5分）' : 'バトル開始！ ほかのちくわ君を全滅させろ！');
    }
    wasDig = dig;
  }

  function tickHud() {
    if (!G.me) return;
    const dig = G.inDig();
    hud.dig.hidden = !dig;
    if (dig) {
      const s = Math.ceil(G.digEnd - G.t);
      hud.digLeft.textContent = s;
      hud.dig.classList.toggle('warn', s <= 10);
      hud.timer.textContent = '0:' + String(s).padStart(2, '0');
      hud.timer.classList.toggle('warn', false);
    } else if (G.mode === 'solo') {
      const s = Math.ceil(G.timeLeft);
      hud.timer.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      hud.timer.classList.toggle('warn', s <= 30);
    } else hud.timer.textContent = NET.isHost() ? '親' : '子';
    const pl = G.players.get(G.me.pid);
    hud.armor.hidden = !(pl && pl.armorUntil > G.t);
    if (!hud.armor.hidden) hud.armor.textContent = '🛡 お味噌 ' + Math.ceil(pl.armorUntil - G.t) + '秒・' + Math.round(pl.armorLeft);
    const dead = pl && !pl.alive;
    hud.spec.hidden = !(dead && G.mode === 'multi' && !G.over);
    if (!hud.spec.hidden) {
      const o = G.players.get(G.me.spectate);
      hud.spec.textContent = '観戦中：' + (o ? o.name : '—') + '（タップで切りかえ）';
    }
    G.onHud();
  }

  /** レーダー・文字・名前（2D の上がき） */
  function drawOverlay(vp, dt) {
    const ov = $('#ov'), x = ov.getContext('2d'), W = ov.width, H = ov.height, k = W / ov.clientWidth;
    x.clearRect(0, 0, W, H);
    const P = (p) => {
      const s = M4.project(vp, p[0], p[1], p[2]);
      if (!s || Math.abs(s[0]) > 1.2 || Math.abs(s[1]) > 1.2) return null;
      return [(s[0] * 0.5 + 0.5) * W, (1 - (s[1] * 0.5 + 0.5)) * H, s[2]];
    };
    x.textAlign = 'center'; x.textBaseline = 'middle';
    const font = (px, w) => `${w || 900} ${px * k}px "M PLUS Rounded 1c","Hiragino Maru Gothic ProN",sans-serif`;
    // ほかの人の名前・敵の体力
    for (const pl of G.players.values()) {
      if (pl.pid === G.me.pid || !pl.alive) continue;
      const s = P([pl.vis[0], pl.vis[1] + 1.45, pl.vis[2]]);
      if (!s || s[2] > 28) continue;
      x.font = font(12, 800);
      x.lineWidth = 3 * k; x.strokeStyle = 'rgba(0,0,0,.7)'; x.fillStyle = '#fff';
      x.strokeText(pl.name, s[0], s[1]); x.fillText(pl.name, s[0], s[1]);
    }
    for (const b of G.bots) {
      if (!b.alive) continue;
      const s = P([b.p[0], b.p[1] + 2.05, b.p[2]]);
      if (!s || s[2] > 22) continue;
      const bw = 56 * k, bh = 6 * k;
      x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(s[0] - bw / 2, s[1], bw, bh);
      x.fillStyle = '#FF5A4E'; x.fillRect(s[0] - bw / 2, s[1], bw * Math.max(0, b.hp / b.max), bh);
      x.font = font(11, 800); x.fillStyle = '#FFE9C8'; x.strokeStyle = 'rgba(0,0,0,.7)'; x.lineWidth = 3 * k;
      const nm = T.bosses[b.key].name;
      x.strokeText(nm, s[0], s[1] - 8 * k); x.fillText(nm, s[0], s[1] - 8 * k);
    }
    // ポップアップの文字
    for (const p of G.pops) {
      const a = (G.t - p.t0) / p.dur;
      const s = P([p.p[0], p.p[1] + a * 0.8, p.p[2]]);
      if (!s) continue;
      const sc = p.big ? 1 + Math.max(0, 0.4 - a) * 1.5 : 1;
      x.globalAlpha = Math.max(0, Math.min(1, (1 - a) * 2));
      x.font = font((p.big ? 22 : 15) * sc);
      x.lineWidth = 4 * k; x.strokeStyle = 'rgba(30,15,5,.85)'; x.fillStyle = p.col;
      x.strokeText(p.text, s[0], s[1]); x.fillText(p.text, s[0], s[1]);
      x.globalAlpha = 1;
    }
    // 痛いときは赤く
    if (G.hurtAt && G.t - G.hurtAt < 0.35) {
      const a = Math.max(0, Math.min(1, 1 - (G.t - G.hurtAt) / 0.35));
      const g = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(255,40,30,0)'); g.addColorStop(1, `rgba(255,40,30,${0.45 * a})`);
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    }
    // レーダー（いちばん近い敵が近いほど激しく光る）
    const d = G.nearestEnemy();
    const kk = Math.max(0, 1 - d / (G.radarRange || T.radar.range));
    const rd = hud.radar;
    if (kk > 0) {
      const speed = 1.5 + kk * 9;
      const pulse = 0.5 + 0.5 * Math.sin(G.t * speed * Math.PI);
      const glow = (0.25 + 0.75 * kk) * (0.45 + 0.55 * pulse);
      rd.style.setProperty('--g', glow.toFixed(3));
      rd.classList.add('on');
      rd.classList.toggle('hot', kk > 0.7);
    } else { rd.classList.remove('on', 'hot'); rd.style.setProperty('--g', '0'); }
    void dt;
  }

  /* ---------- ポーズ ---------- */
  function openPause() {
    CG.debug.add('pause');
    if (!G.running || G.over) return;
    resetTouch();
    $('#pause').hidden = false;
    $('#sens').value = sens;
    $('#muteBtn').textContent = HM.sfx.muted ? '🔇 音：オフ' : '🔊 音：オン';
    $('#pauseNote').textContent = G.mode === 'multi' ? 'みんなで遊んでいる間は止まりません。「やめる」と負けになります' : '';
    if (document.exitPointerLock) document.exitPointerLock();
  }
  function closePause() { if (!$('#pause').hidden) CG.debug.add('resume'); $('#pause').hidden = true; resetTouch(); }

  /* ---------- 結果 ---------- */
  function soloBest(left) {
    const all = CG.ls.getJSON(KEY_BEST, null) || {}, key = G.sizeKey || 'grande', b = all[key];
    if (!b || left > b.left) { all[key] = { left, at: Date.now() }; CG.ls.setJSON(KEY_BEST, all); return true; }
    return false;
  }
  G.onEnd = function (ev) {
    CG.debug.add('end', { win: ev.win, why: ev.why, left: ev.left, winner: ev.winner });
    if (document.exitPointerLock) document.exitPointerLock();
    const box = $('#result');
    let title, sub, share;
    const size = T.sizes.find(s => s.key === (G.sizeKey || 'grande')) || T.sizes[T.sizes.length - 1];
    const head = `ほりほりもぐもぐ【${size.name}のお豆腐】`;
    const mine = G.players.get(G.me.pid);
    if (G.mode === 'solo') {
      const killed = G.bots.filter(b => !b.alive);
      if (ev.win) {
        const best = soloBest(ev.left);
        title = '全滅させた！';
        sub = `のこり時間 ${ev.left} 秒${best ? '（自己ベスト！）' : ''}`;
        HM.sfx.win();
        share = `${head}\nお豆腐をほりほり掘りすすんで、おでん横丁のボス${G.bots.length}体を全滅させた！🥢\n`
          + `のこり${ev.left}秒${best ? '（自己ベスト更新！）' : ''}・体力 ${Math.max(0, Math.round(mine ? mine.hp : 0))}/${T.player.hp} で生還\n`
          + 'キミはボスを見つけだせる？';
      } else {
        title = ev.why === 'time' ? '時間切れ…' : ev.why === 'pot' ? 'おでん鍋に沈んだ…' : 'やられた…';
        sub = `たおしたボス ${killed.length} / ${G.bots.length}`;
        const why = ev.why === 'time' ? '時間切れで、ボスを見つけきれなかった…⏰' : ev.why === 'pot' ? '床を掘り抜いて、奈落のおでん鍋に沈んだ…🍢' : 'おでん横丁のボスにやられた…💥';
        const names = killed.map(b => T.bosses[b.key].name).join('・');
        share = `${head}\n${why}\n`
          + `たおしたボス ${killed.length}/${G.bots.length}${names ? `（${names}）` : ''}\n`
          + 'つぎこそ全滅させる！';
      }
    } else {
      const w = ev.winner && G.players.get(ev.winner);
      const iWin = ev.winner === G.me.pid, n = G.players.size;
      title = iWin ? '勝った！' : w ? w.name + ' の勝ち！' : '引き分け';
      sub = iWin ? 'さいごまで残ったちくわ君！' : '';
      if (iWin) HM.sfx.win();
      const myLine = iWin ? `${n}人のちくわ君の中で、さいごまで残って優勝！🏆`
        : mine && mine.rank ? `わたしは${n}人中 ${mine.rank}位${mine.why === 'pot' ? '（おでん鍋に沈んだ…）' : mine.why === 'left' ? '（とちゅうでぬけた）' : '（やられた…）'}`
        : `${n}人で掘りあった！`;
      share = `${head}\n${n}人で地中バトル！${iWin ? '' : w ? `勝ったのは ${w.name}！` : '引き分け！'}\n${myLine}\n`
        + 'いっしょに掘りあおう！';
    }
    $('#resTitle').textContent = title;
    $('#resSub').textContent = sub;
    $('#resRetry').hidden = G.mode !== 'solo';
    $('#resLobby').hidden = G.mode !== 'multi';
    box.dataset.share = share;
    box.hidden = false;
  };

  /**
   * 結果を共有する。iPhone の共有メニューは url を渡すと文面を捨てて URL だけにするアプリが多いので、
   * URL も文面（CG.share.text）の中に入れて text だけで渡す。共有メニューが無ければ X の投稿画面
   */
  async function shareResult(s) {
    if (navigator.share) {
      try { await navigator.share({ text: CG.share.text(s) }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    CG.share.x(s);
  }

  /* ---------- ひとりで始める ---------- */
  function startSolo() {
    HM.sfx.unlock();
    if (gyro.on) gyroAsk();
    const seed = (Math.random() * 2 ** 31) >>> 0, r = HM.rng(seed ^ 0x1234567), N = HM.fieldSize(sizePick);
    // 大きさに合わせて、スタート地点と敵の出る距離を決める（ラージは今までと同じ）
    const spread = Math.min(80, N * 0.27);
    const sp = [Math.floor(N / 2 + (r() - 0.5) * spread) + 0.5, Math.floor(N * 0.37 + r() * N * 0.26) + 0.01, Math.floor(N / 2 + (r() - 0.5) * spread) + 0.5];
    const dMin = Math.min(T.solo.spawnMin, N * 0.22), dMax = Math.min(T.solo.spawnMax, N * 0.36);
    const cl = v => Math.max(3, Math.min(N - 3, v));
    const bots = T.solo.bosses.map((key, i) => {
      const a = i / T.solo.bosses.length * Math.PI * 2 + r() * 0.8;
      const d = dMin + r() * (dMax - dMin);
      const y = cl(sp[1] + (r() - 0.5) * Math.min(40, N * 0.3));
      return { key, spawn: [cl(sp[0] + Math.cos(a) * d), y, cl(sp[2] + Math.sin(a) * d)] };
    });
    G.sizeKey = sizePick;
    const me = { pid: 'me', name: NET.myName(), color: UI.soloColor() };
    G.toHost = m => G.hostOnMsg('me', m);
    G.broadcast = null; G.broadcastExcept = null;
    beginPlay(() => G.start({ mode: 'solo', seed, size: N, me, roster: [{ pid: 'me', name: me.name, color: me.color, spawn: sp }], isHost: true, bots }));
  }

  function beginPlay(startFn) {
    show('play');
    $('#result').hidden = true; closePause();
    resetStick(); looks.clear();
    const DM = window.DeviceMotionEvent;
    if (gyro.on && !gyro.ok && DM && typeof DM.requestPermission === 'function')
      setTimeout(() => G.toast('傾けて見回すには、一時停止の「📱 傾けて見回す」を押してください'), 1500);
    $('#loading').hidden = false;
    // 地形を作る前に「準備中」を出す
    setTimeout(() => {
      if (!R) {
        try { R = G.R = HM.Renderer($('#gl')); }
        catch (e) { G.toast('この端末では 3D の表示ができません（WebGL）'); return; }
      }
      if (startFn) startFn();
      CG.debug.add('start', { N: G.world && G.world.N });
      // 最初はまわりのチャンクをまとめて作る
      G.meshBudget = 400;
      resize();
      G.render($('#gl').width, $('#gl').height);
      G.meshBudget = 7;
      $('#loading').hidden = true;
      $('#lockHint').hidden = touchMode;
      $('#leftCnt').hidden = false;
      G.onHud();
      G.toast('ほりほりタイム！ 掘ってアイテムを集めよう（' + T.digTime + '秒）');
      wasDig = true; lastSec = -1;
      if (!raf) raf = requestAnimationFrame(loop);
    }, 30);
  }

  /* ---------- みんなで ---------- */
  function enterMulti() {
    show('lobby');
    NET.openLobby($('#lobbyBox'));
    drawLobbyExtra();
  }
  function drawLobbyExtra() {
    const host = NET.isHost(), inRoom = NET.room && (host || (NET.room.role === 'guest' && NET.room.open));
    $('#lobbyColors').hidden = false;
    const list = NET.lobbyList;
    $('#lobbyMembers').innerHTML = inRoom && list.length ? list.map(m => {
      const c = T.colors.find(k => k.key === m.color);
      return `<li><span class="dot" style="--b:${c ? c.burnt : '#999'}"></span>${CG.esc(m.name)}${m.pid === NET.pid ? '（自分）' : ''}<small>${c ? c.name : 'おまかせ'}</small></li>`;
    }).join('') : '';
    $('#lobbyMembersWrap').hidden = !(inRoom && list.length);
    $('#startBtn').hidden = !host;
    $('#startBtn').disabled = !NET.canStart();
    $('#startBtn').textContent = NET.roster.size >= 2 ? '▶ スタート（' + NET.roster.size + '人）' : '2人以上でスタートできます';
    $('#waitMsg').hidden = !(inRoom && !host);
    $('#lobbySize').hidden = !inRoom;
    drawSizePickers();
  }
  NET.onLobby = () => { if (!$('#lobby').hidden) drawLobbyExtra(); };
  NET.onStatus = () => { if (!$('#lobby').hidden) setTimeout(drawLobbyExtra, 0); };
  NET.onStart = () => beginPlay(null);   // G.start は net.js が済ませている
  NET.onClosed = text => {
    if (!$('#play').hidden) {
      G.stop();
      show('lobby');
      NET.openLobby($('#lobbyBox'));
      G.toast(text || '部屋から出ました');
    }
    drawLobbyExtra();
  };

  /* ---------- ボタン ---------- */
  function wireButtons() {
    $('#soloBtn').onclick = startSolo;
    $('#multiBtn').onclick = enterMulti;
    $('#lobbyBack').onclick = () => { NET.leave(); show('home'); };
    $('#startBtn').onclick = () => NET.startMatch();
    $('#pauseBtn').onclick = openPause;
    $('#camBtn').onclick = toggleCam;
    $('#resetBtn').onclick = resetView;
    $('#resume').onclick = closePause;
    $('#quit').onclick = () => {
      closePause();
      if (G.mode === 'multi') { NET.leave(); G.stop(); show('home'); return; }
      G.stop(); show('home');
    };
    $('#sens').oninput = e => { sens = +e.target.value; CG.ls.set(KEY_SENS, String(sens)); };
    $('#gyroBtn').textContent = gyroLabel();
    $('#gyroBtn').onclick = gyroToggle;
    $('#muteBtn').onclick = () => { HM.sfx.setMuted(!HM.sfx.muted); $('#muteBtn').textContent = HM.sfx.muted ? '🔇 音：オフ' : '🔊 音：オン'; };
    $('#resRetry').onclick = startSolo;
    $('#resLobby').onclick = () => {
      G.stop();
      $('#result').hidden = true;
      NET.backToLobby();
      show('lobby');
      NET.openLobby($('#lobbyBox'));
      drawLobbyExtra();
    };
    $('#resHome').onclick = () => { if (G.mode === 'multi') NET.leave(); G.stop(); $('#result').hidden = true; show('home'); };
    $('#resShare').onclick = () => shareResult({ msg: $('#result').dataset.share, tags: ['ほりほりもぐもぐ'], url: CG.pageUrl() });
    holdBtn('#btnMain', 'main'); holdBtn('#btnItem', 'item'); holdBtn('#btnJump', 'jump');
    $('#howBtn').onclick = () => { $('#how').hidden = !$('#how').hidden; };
    $('#histBtn').onclick = () => { $('#hist').hidden = !$('#hist').hidden; };
    // セーブの引っ越し（共通部品 common/v1/move.js）。自己ベストと設定を運ぶ
    // 不具合の報告：ホームと一時停止から送れる。送るときは試合の要約も付ける（地形そのものは送らない）
    const dbgExtra = () => ({
      st: G.running ? {
        mode: G.mode, size: G.sizeKey, N: G.world && G.world.N, t: G.t, over: G.over, host: !!G.isHost,
        players: G.players ? [...G.players.values()].map(p => ({ n: p.name, hp: p.hp, alive: p.alive, why: p.why })) : [],
        bots: G.bots ? G.bots.map(b => ({ k: b.key, hp: b.hp, alive: b.alive, aware: b.aware })) : [],
        inv: G.me && G.me.inv
      } : null,
      cfg: { cam: G.camMode, sens: CG.ls.get(KEY_SENS, ''), gyro: gyro.on, gyroOk: gyro.ok, touch: touchMode }
    });
    CG.debug.mount($('#cgDebug'), { extra: dbgExtra });
    CG.debug.mount($('#cgDebugPause'), { extra: dbgExtra });
    CG.move.mount($('#cgMove'), { keys: [KEY_BEST, KEY_COLOR, KEY_SENS, KEY_CAM, KEY_SIZE, KEY_GYRO, 'horimogu-name', 'horimogu-mute'] });
  }

  /* ---------- 画面の拡大を止める ----------
     iPhone の Safari は user-scalable=no を無視するので、2 本指のピンチ（gesture*・2 本以上の touchmove）を止める */
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  // スライダーなどを 1 本指で動かし始めたあとは touchmove を止められないので、一時停止・結果の画面では 2 本目の指が触れた時点で止める
  document.addEventListener('touchstart', e => { if (e.touches.length > 1 && e.target.closest && e.target.closest('.modal')) e.preventDefault(); }, { passive: false });

  /* ---------- 起動 ---------- */
  CG.init({ game: HM.GAME, title: 'ほりほりもぐもぐ', version: HM.VERSION });
  // デバッグ報告（共通部品 common/v1/debug.js）。操作・出来事・エラーを直近 300 件残し、送ると受付番号が出る。
  // 1 件ごとに「いまの状態」の要約を付ける（worker/index.js の /horimogu/debug → D1 chikuwa-debug）
  CG.debug.init({
    snap: () => {
      if (!G.running || !G.me) return { scr: [...document.querySelectorAll('.screen')].filter(e => !e.hidden).map(e => e.id).join(',') };
      const rec = G.players && G.players.get(G.me.pid), p = G.me.p;
      return {
        md: G.mode, sz: G.sizeKey, gt: Math.round(G.t * 10) / 10, hp: rec ? Math.round(rec.hp) : null,
        p: p ? p.map(v => Math.round(v * 10) / 10) : null, it: G.me.inv.map(s => s.type).join(','), cam: G.camMode,
        gy: gyro.on ? 1 : 0, dig: G.inDig() ? 1 : 0, bt: G.bots ? G.bots.filter(b => b.alive).length : 0
      };
    }
  });
  // 画面に出た知らせ（拾った・たおした・落ちた など）も、そのまま記録に残す
  { const t0 = G.toast; G.toast = t => { CG.debug.add('toast', { m: String(t).slice(0, 60) }); t0(t); }; }
  document.querySelectorAll('.ver').forEach(e => { e.textContent = HM.VERSION; });
  document.querySelectorAll('.colors').forEach(el => drawColorPicker(el, el.dataset.auto === '1'));
  buildHud(); wireButtons(); setupTouch(); setupMouse(); setCam(G.camMode);
  // 古い自己ベスト（v1：大きさの区別なし）は、ラージのベストへ引き継ぐ
  (function () {
    const old = CG.ls.getJSON('horimogu-best-v1', null);
    if (old && !CG.ls.getJSON(KEY_BEST, null)) CG.ls.setJSON(KEY_BEST, { grande: old });
    // β0.2.0 のラージ（300）はグランデと同じ大きさなので引き継ぐ（スモール・メディアムは大きさが変わったので引き継がない）
    const v2 = CG.ls.getJSON(KEY_BEST, null);
    if (v2 && v2.large && !v2.grande) { v2.grande = v2.large; delete v2.large; CG.ls.setJSON(KEY_BEST, v2); }
  })();
  drawSizePickers();
  (function anim() { previewT += 1 / 30; if (!$('#home').hidden) drawPreview(); setTimeout(anim, 33); })();
  show('home');
  if (CG.room.codeFromUrl()) enterMulti();

  // テスト用の入口
  window.__HM = { G, NET, startSolo, enterMulti, inp, held, UI };
})();

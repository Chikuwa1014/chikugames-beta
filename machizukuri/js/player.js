/* 荒野開拓記（仮） — 主人公（移動・当たり判定・視点・PC とスマホの入力・ねらい・採集のたたき）
   向き：yaw 0 が +z。pitch は正で下向き。 */
(function () {
  const MZ = window.MZ, B = BABYLON, T = MZ.T;
  const P = MZ.player = { keys: {}, mv: [0, 0], runStick: false, hitHeld: false, cool: 0, aimT: 0, walkPh: 0, swing: 0, moving: false, camPos: new B.Vector3(), camDir: new B.Vector3(0, 0, 1), lastTool: 'axe' };
  MZ.aim = null;
  MZ.touch = false;
  const V = { eye: new B.Vector3(), des: new B.Vector3(), last: new B.Vector3(), q: new B.Vector3() };   // 毎フレーム作らない作業用

  /* ---------- 準備 ---------- */
  P.init = function () {
    const scene = MZ.world.scene;
    P.model = MZ.getModel('player'); P.model.setEnabled(false);
    P.hands = { axe: MZ.getModel('axeHand'), pick: MZ.getModel('pickHand') };
    ['axe', 'pick'].forEach(k => {
      const h = P.hands[k]; h.parent = MZ.world.camera; h.isVisible = false;
      h.position.set(0.28, -0.4, 0.62); h.rotation.set(0.35, 0, -0.3); h.scaling.setAll(0.45);
    });
    P.bindInput();
  };

  const fwd = () => { const p = MZ.state.player; return [Math.sin(p.yaw), Math.cos(p.yaw)]; };

  /* ---------- 毎フレーム ---------- */
  P.update = function (dt) {
    const s = MZ.state.player;
    let f = 0, r = 0;
    if (P.keys.KeyW || P.keys.ArrowUp) f += 1; if (P.keys.KeyS || P.keys.ArrowDown) f -= 1;
    if (P.keys.KeyD || P.keys.ArrowRight) r += 1; if (P.keys.KeyA || P.keys.ArrowLeft) r -= 1;
    f += -P.mv[1]; r += P.mv[0];
    const l = Math.hypot(f, r); if (l > 1) { f /= l; r /= l; }
    const run = P.keys.ShiftLeft || P.keys.ShiftRight || P.runStick;
    const sp = (run ? T.run : T.walk) * Math.min(1, l > 0 ? Math.max(l, 0.35) : 0);
    P.moving = l > 0.05;
    if (P.moving) {
      const [fx, fz] = fwd(), dx = (fx * f + fz * r) * sp * dt, dz = (fz * f - fx * r) * sp * dt;
      const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.25));
      for (let i = 0; i < n; i++) { const q = MZ.world.collide(s.x + dx / n, s.z + dz / n, T.radius); s.x = q[0]; s.z = q[1]; }
      P.walkPh += dt * (run ? 11 : 8);
    }
    /* くり返したたく */
    P.cool -= dt;
    if (P.hitHeld && MZ.build.mode === 'none' && P.cool <= 0) { MZ.hit(); P.cool = T.hitCool; }
    P.aimT -= dt;
    if (P.aimT <= 0) { P.aimT = 0.1; P.updateAim(); }
  };

  /* ---------- カメラ・見た目（止まっていても毎フレーム） ---------- */
  P.updateCamera = function (dt) {
    const s = MZ.state.player, cam = MZ.world.camera;
    const cp = Math.cos(s.pitch), f = P.camDir;
    f.set(Math.sin(s.yaw) * cp, -Math.sin(s.pitch), Math.cos(s.yaw) * cp);
    cam.rotation.set(s.pitch, s.yaw, 0);
    const eye = V.eye.set(s.x, T.eye, s.z);
    const third = s.view === 3;
    if (!third) cam.position.copyFrom(eye);
    else {
      const des = V.des.set(eye.x - f.x * T.view3.back, eye.y - f.y * T.view3.back + T.view3.up, eye.z - f.z * T.view3.back);
      const last = V.last.copyFrom(eye);
      for (let t = 0.05; t <= 1.0001; t += 0.05) {
        const q = B.Vector3.LerpToRef(eye, des, t, V.q);
        if (q.y < 0.3 || (q.y < 6 && MZ.world.solidAtPoint(q.x, q.z))) break;
        last.copyFrom(q);
      }
      cam.position.copyFrom(last);
    }
    P.camPos.copyFrom(cam.position);
    /* 主人公の姿 */
    P.model.setEnabled(third);
    if (third) {
      P.model.position.set(s.x, 0, s.z); P.model.rotation.y = s.yaw;
      const sw = P.moving ? Math.sin(P.walkPh) * 0.7 : 0, pt = P.model.metadata.parts;
      pt.legL.rotation.x = sw; pt.legR.rotation.x = -sw; pt.armL.rotation.x = -sw * 0.8; pt.armR.rotation.x = sw * 0.8 - (P.swing > 0 ? Math.sin(P.swing * Math.PI) * 1.4 : 0);
    }
    /* 一人称：手に持つ道具を振る */
    const k = P.lastTool;
    ['axe', 'pick'].forEach(n => { P.hands[n].isVisible = !third && MZ.build.mode === 'none' && n === k && MZ.state.tools[n] > 0; });
    if (P.swing > 0) P.swing = Math.max(0, P.swing - dt / 0.28);
    const h = P.hands[k], bob = P.moving ? Math.sin(P.walkPh) * 0.012 : 0;
    h.rotation.x = 0.35 + Math.sin(P.swing * Math.PI) * 1.0; h.position.y = -0.42 + bob;
  };

  /* ---------- ねらい（数式で選ぶ。scene.pick は使わない） ---------- */
  P.updateAim = function () {
    const s = MZ.state.player, W = MZ.world, [fx, fz] = fwd();
    let best = null, bc = -2, bd = 0;
    const gx = MZ.cellOf(s.x), gz = MZ.cellOf(s.z), N = T.chunk, R = Math.ceil((T.reach + 3.5) / T.cell);   // 近くのマスだけ調べる
    for (let cz = Math.max(0, gz - R); cz <= Math.min(N - 1, gz + R); cz++) for (let cx = Math.max(0, gx - R); cx <= Math.min(N - 1, gx + R); cx++) {
      const i = W.cellNode[cz * N + cx];
      if (i < 0 || !W.nodeActive(i)) continue;
      const nd = W.nodes[i], dx = nd.x - s.x, dz = nd.z - s.z, d = Math.hypot(dx, dz), rr = MZ.NODES[nd.k].r * nd.s;
      if (d > T.reach + rr) continue;
      const c = d < 0.01 ? 1 : (dx * fx + dz * fz) / d;
      if (c < T.aimCos) continue;
      if (!best || c > bc + 0.03 || (Math.abs(c - bc) <= 0.03 && d < bd)) { best = nd; bc = c; bd = d; }
    }
    MZ.aim = best;
    if (best && MZ.NODES[best.k].tool) P.lastTool = MZ.NODES[best.k].tool;
  };
  /* 今ねらっている物を 1 回たたく（くり返しの間かくは呼ぶ側が見る）。何かしたら true */
  MZ.hit = function () {
    P.updateAim();
    const nd = MZ.aim, s = MZ.state;
    if (!nd) return false;
    const d = MZ.NODES[nd.k];
    let dmg = 1;
    if (d.tool) {
      const lv = s.tools[d.tool];
      if (lv < d.need) { MZ.ui.notice(MZ.TOOLS[d.tool][d.need] + 'が必要', 'warn'); P.swing = 1; return false; }
      dmg = 1 + (lv - d.need);
    }
    P.swing = 1;
    if (nd.hp < 0) nd.hp = d.hp;
    nd.hp -= dmg;
    if (nd.hp <= 0) {
      const txt = [];
      Object.keys(d.drops).forEach(k => { s.inv[k] += d.drops[k]; txt.push('＋' + d.drops[k] + ' ' + MZ.ITEMS[k]); });
      MZ.world.take(nd.idx, d.back);
      MZ.ui.notice(txt.join('  '));
      MZ.aim = null;
      MZ.ui.dirty = true;
    }
    return true;
  };

  /* ---------- 建てる位置：画面の真ん中から出した線と地面（y=0）の交わる点 ---------- */
  P.rayPoint = function () {
    const s = MZ.state.player, o = P.camPos, d = P.camDir, lim = T.half - 0.01;
    const fall = () => { const [fx, fz] = fwd(); return { x: s.x + fx * T.buildMax, z: s.z + fz * T.buildMax }; };
    let q = null;
    if (d.y < -0.01) { const t = -o.y / d.y; q = { x: o.x + d.x * t, z: o.z + d.z * t }; }
    if (!q || Math.hypot(q.x - s.x, q.z - s.z) > T.buildMax) q = fall();
    q.x = Math.max(-lim, Math.min(lim, q.x)); q.z = Math.max(-lim, Math.min(lim, q.z));
    return q;
  };

  /* ---------- 視点の切りかえ ---------- */
  MZ.toggleView = function () { const s = MZ.state.player; s.view = s.view === 3 ? 1 : 3; MZ.saveNow(); MZ.ui.notice(s.view === 3 ? '三人称' : '一人称'); };

  /* ---------- 入力（PC とスマホ） ---------- */
  P.bindInput = function () {
    const $ = s => document.querySelector(s), canvas = $('#cv'), st = MZ.state.player;
    MZ.touch = matchMedia('(pointer:coarse)').matches;
    document.body.classList.toggle('touch', MZ.touch);
    const locked = () => document.pointerLockElement === canvas;
    const primary = () => {
      if (MZ.build.mode === 'place') MZ.placeHere();
      else if (MZ.build.mode === 'remove') MZ.removeHere();
      else P.hitHeld = true;
    };
    addEventListener('keydown', e => {
      if (!MZ.started) return;
      if (e.code === 'Tab') e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'Tab' || e.code === 'KeyI') { e.preventDefault(); MZ.ui.panel(!MZ.ui.open); return; }
      if (e.code === 'Escape' && MZ.ui.open) { MZ.ui.panel(false); return; }
      if (MZ.ui.open || MZ.ui.modal) return;
      P.keys[e.code] = true;
      if (e.code === 'KeyE') primary();
      else if (e.code === 'KeyV') MZ.toggleView();
      else if (e.code === 'KeyR') MZ.rotate();
      else if (e.code === 'KeyQ' || e.code === 'Escape') MZ.cancelBuild();
    });
    addEventListener('keyup', e => { P.keys[e.code] = false; if (e.code === 'KeyE') P.hitHeld = false; });
    addEventListener('blur', () => { P.keys = {}; P.hitHeld = false; });

    let look = null, stickId = null, stickO = null;
    const stick = $('#stick'), knob = stick.querySelector('i');
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => {
      if (!MZ.started || MZ.ui.open || MZ.ui.modal) return;
      if (e.pointerType === 'mouse') {
        if (locked()) { if (e.button === 0) primary(); else if (e.button === 2) MZ.cancelBuild(); return; }
        if (e.button === 0 && canvas.requestPointerLock) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { }); } catch (_) { } }
        if (e.button === 0) look = { id: e.pointerId, x: e.clientX, y: e.clientY };   // マウスを固定できないときはドラッグで見回す
        return;
      }
      const leftLow = e.clientX < innerWidth * 0.5 && e.clientY > innerHeight * 0.5;
      if (leftLow && stickId === null) {
        stickId = e.pointerId; stickO = [e.clientX, e.clientY];
        stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px'; stick.hidden = false;
      } else if (!look) look = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { }
    });
    const turn = (dx, dy, k) => { st.yaw += dx * k; st.pitch = Math.max(-1.3, Math.min(1.3, st.pitch + dy * k)); };
    document.addEventListener('mousemove', e => { if (locked() && MZ.started && !MZ.ui.open) turn(e.movementX, e.movementY, T.sens); });
    canvas.addEventListener('pointermove', e => {
      if (e.pointerId === stickId) {
        let dx = e.clientX - stickO[0], dy = e.clientY - stickO[1]; const l = Math.hypot(dx, dy), m = 50;
        if (l > m) { dx *= m / l; dy *= m / l; }
        knob.style.transform = `translate(${dx}px,${dy}px)`; P.mv = [dx / m, dy / m]; P.runStick = Math.hypot(dx, dy) >= m * 0.98;
      } else if (look && e.pointerId === look.id && !locked()) {
        turn(e.clientX - look.x, e.clientY - look.y, e.pointerType === 'mouse' ? T.sens * 1.6 : T.touchSens);
        look.x = e.clientX; look.y = e.clientY;
      }
    });
    const up = e => {
      if (e.pointerId === stickId) { stickId = null; stick.hidden = true; knob.style.transform = ''; P.mv = [0, 0]; P.runStick = false; }
      if (look && e.pointerId === look.id) look = null;
      if (e.pointerType === 'mouse' && e.button === 0) P.hitHeld = false;
    };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

    /* スマホの丸いボタン */
    const hold = (el, on, off) => {
      el.addEventListener('pointerdown', e => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (_) { } if (MZ.started && !MZ.ui.open) on(); });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => el.addEventListener(t, () => off && off()));
      el.addEventListener('contextmenu', e => e.preventDefault());
    };
    hold($('#bHit'), () => { P.hitHeld = true; }, () => { P.hitHeld = false; });
    hold($('#bPlace'), () => { if (MZ.build.mode === 'place') MZ.placeHere(); else MZ.removeHere(); });
    hold($('#bRot'), () => MZ.rotate());
    hold($('#bCancel'), () => MZ.cancelBuild());
  };
})();

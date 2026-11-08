/* サイレント夜（仮） — 3D の場面づくり・操作・音・メインループ（Babylon.js）
   ステップ1：監禁部屋から廊下と部屋を一人称で歩ける。懐中電灯・霧・当たり判定・画面の効果・調べる */
(function () {
  const SY = window.SY, T = SY.T, B = BABYLON, V3 = B.Vector3, C3 = B.Color3;
  const $ = s => document.querySelector(s);
  const hex = h => C3.FromHexString(h);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const KEY_MUTE = 'kenkyujo-mute', KEY_CHAR = 'kenkyujo-char';

  const G = SY.G = {
    running: false, char: CG.ls.get(KEY_CHAR, 'gatasu'),
    equip: { shoes: 'normal', clothes: 'normal', acc: 'none', charm: 'none' },
    yaw: Math.PI, pitch: .05, keys: {}, mv: [0, 0], bob: 0, step: 0, room: '監禁部屋',
    inv: [], flags: {}, paused: false
  };
  if (!SY.CHARS.find(c => c.key === G.char)) G.char = 'gatasu';
  G.stats = SY.stats(G.equip);

  /* ---------- 描画の準備 ---------- */
  const canvas = $('#cv');
  const engine = new B.Engine(canvas, true, { stencil: true });
  engine.setHardwareScalingLevel(1 / Math.min(devicePixelRatio || 1, 1.5));
  const scene = new B.Scene(engine);
  scene.clearColor = new B.Color4(.01, .01, .014, 1);
  scene.ambientColor = new C3(1, 1, 1);
  scene.collisionsEnabled = true;
  scene.fogMode = B.Scene.FOGMODE_EXP2;
  scene.fogDensity = T.fog;
  scene.fogColor = new C3(.01, .01, .014);

  const camera = new B.FreeCamera('cam', new V3(0, T.eye, 0), scene);
  camera.minZ = .05; camera.maxZ = 80; camera.inputs.clear();
  const setFov = () => { camera.fov = innerWidth < innerHeight ? 1.43 : 1.22; };
  setFov();
  addEventListener('resize', () => { engine.resize(); setFov(); });

  /* ---------- 模様（画像ファイルを使わず canvas で描く） ---------- */
  function tex(name, draw, u, v) {
    const t = new B.DynamicTexture(name, 256, scene, true);
    draw(t.getContext()); t.update();
    t.uScale = u; t.vScale = v;
    return t;
  }
  const floorTex = tex('floor', x => {
    x.fillStyle = '#45433d'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = `hsl(80,5%,${rnd(20, 28)}%)`; x.fillRect(i * 64 + 2, j * 64 + 2, 60, 60); }
    for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(0,0,0,${rnd(0, .25)})`; x.fillRect(rnd(0, 256), rnd(0, 256), rnd(1, 6), rnd(1, 6)); }
  }, 1, 1);
  const wallTex = tex('wall', x => {
    x.fillStyle = '#6a6a60'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 40; i++) {
      const gx = rnd(0, 256), gy = rnd(0, 256), g = x.createRadialGradient(gx, gy, 0, gx, gy, rnd(20, 70));
      g.addColorStop(0, 'rgba(30,26,12,.35)'); g.addColorStop(1, 'rgba(30,26,12,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    }
    x.fillStyle = 'rgba(30,50,40,.45)'; x.fillRect(0, 190, 256, 66);   // 腰から下の緑のペンキ
    x.fillStyle = 'rgba(0,0,0,.4)'; x.fillRect(0, 188, 256, 3);
    for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(20,10,5,.35)'; x.fillRect(rnd(0, 256), rnd(0, 190), 2, rnd(30, 120)); }
  }, 1, 1.5);

  const mats = [];
  function mat(name, o) {
    const m = new B.StandardMaterial(name, scene);
    m.diffuseColor = o.color || new C3(1, 1, 1);
    if (o.tex) m.diffuseTexture = o.tex;
    m.specularColor = o.spec || new C3(.04, .04, .04);
    if (o.emissive) m.emissiveColor = o.emissive;
    m.ambientColor = new C3(.02, .02, .025);
    if (o.alpha !== undefined) m.alpha = o.alpha;
    m.maxSimultaneousLights = 10;
    mats.push(m);
    return m;
  }
  const wood = mat('wood', { color: hex('#4a3626') }), metal = mat('metal', { color: hex('#5a6562'), spec: new C3(.25, .25, .25) });
  const cloth = mat('cloth', { color: hex('#6b6656') }), paper = mat('paper', { color: hex('#d8cfb8') });

  /* ---------- 床・天井・壁（マップの文字から作る） ---------- */
  const casters = [], targets = [];
  const C = T.cell, ROWS = SY.MAP.length, COLS = SY.MAP[0].length;
  const ground = B.MeshBuilder.CreateGround('ground', { width: COLS * C, height: ROWS * C }, scene);
  ground.position.set(COLS * C / 2, 0, -ROWS * C / 2);
  floorTex.uScale = COLS; floorTex.vScale = ROWS;
  ground.material = mat('floorM', { tex: floorTex }); ground.receiveShadows = true;
  const ceil = B.MeshBuilder.CreatePlane('ceil', { width: COLS * C, height: ROWS * C }, scene);
  ceil.position.set(COLS * C / 2, T.wallH, -ROWS * C / 2); ceil.rotation.x = -Math.PI / 2;
  ceil.material = mat('ceilM', { color: hex('#262624') });
  const wallM = mat('wallM', { tex: wallTex }), walls = [];
  SY.MAP.forEach((line, row) => [...line].forEach((ch, col) => {
    if (ch !== '#') return;
    // まわりがすべて壁のマスは作らない（見えないので）
    const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => { const l = SY.MAP[row + b]; return l && l[col + a] && l[col + a] !== '#'; });
    if (!open) return;
    const w = B.MeshBuilder.CreateBox('w', { size: C, height: T.wallH }, scene);
    const p = SY.cellPos(col, row); w.position.set(p.x, T.wallH / 2, p.z);
    walls.push(w);
  }));
  const wallMesh = B.Mesh.MergeMeshes(walls, true, true);
  wallMesh.material = wallM; wallMesh.checkCollisions = true; wallMesh.receiveShadows = true;

  /* ---------- 置いてある物 ---------- */
  function box(w, h, d, m, x, y, z, o = {}) {
    const me = B.MeshBuilder.CreateBox('b', { width: w, height: h, depth: d }, scene);
    me.material = m; me.position.set(x, y, z); me.receiveShadows = true;
    if (o.parent) me.parent = o.parent;
    if (o.solid) me.checkCollisions = true;
    if (o.kind) { me.metadata = { kind: o.kind }; targets.push(me); }
    if (o.cast !== false) casters.push(me);
    return me;
  }
  function solid(w, h, d, x, z) {            // 見えない当たり判定の箱
    const me = B.MeshBuilder.CreateBox('col', { width: w, height: h, depth: d }, scene);
    me.position.set(x, h / 2, z); me.isVisible = false; me.isPickable = false; me.checkCollisions = true;
  }
  const at = (col, row, dx, dz) => SY.cellPos(col, row, dx, dz);
  function hitbox(w, h, d, x, y, z, meta) {   // 見えない「調べる」の当たり（小さい物を調べやすくする）
    const me = B.MeshBuilder.CreateBox('hit', { width: w, height: h, depth: d }, scene);
    me.position.set(x, y, z); me.visibility = 0; me.metadata = meta; return me;
  }

  // 監禁部屋：ベッド・鎖・バケツ・カレンダー
  let p = at(1, 1, -.22, .5);
  box(1, .35, 2, metal, p.x, .2, p.z, { solid: true });
  box(.9, .12, 1.9, cloth, p.x, .43, p.z, { kind: 'bed' });
  p = at(1, 3, -.45, 0);
  box(.06, .3, .3, metal, p.x, .6, p.z, { kind: 'chain' });
  for (let i = 0; i < 5; i++) {
    const r = B.MeshBuilder.CreateTorus('chain', { diameter: .1, thickness: .025, tessellation: 10 }, scene);
    r.material = metal; r.position.set(p.x + .1 + i * .09, .45 - i * .09, p.z); r.rotation.z = Math.PI / 2 * (i % 2); r.rotation.x = Math.PI / 2;
    r.metadata = { kind: 'chain' }; targets.push(r);
  }
  p = at(3, 3, .2, .2);
  const bucket = B.MeshBuilder.CreateCylinder('bucket', { height: .35, diameterTop: .36, diameterBottom: .28 }, scene);
  bucket.material = metal; bucket.position.set(p.x, .175, p.z); bucket.metadata = { kind: 'bucket' }; targets.push(bucket); casters.push(bucket);
  hitbox(.8, .7, .8, p.x, .35, p.z, { kind: 'bucket' });
  p = at(2, 1, 0, -.49);
  const cal = B.MeshBuilder.CreatePlane('cal', { width: .4, height: .55, sideOrientation: B.Mesh.DOUBLESIDE }, scene);
  cal.material = paper; cal.position.set(p.x, 1.7, p.z); cal.metadata = { kind: 'calendar' }; targets.push(cal);

  // 研究室：机・びん
  const glassG = mat('glassG', { color: hex('#2f6b3a'), emissive: hex('#1d5a28'), alpha: .85 });
  for (const [col, row] of [[7, 2], [10, 2], [12, 1]]) {
    p = at(col, row);
    box(1.6, .06, .8, metal, p.x, .78, p.z, { kind: 'desk' });
    for (const [x, z] of [[-.75, -.35], [.75, -.35], [-.75, .35], [.75, .35]]) box(.05, .78, .05, metal, p.x + x, .39, p.z + z);
    solid(1.6, .85, .8, p.x, p.z);
    for (let i = 0; i < 3; i++) {
      const b = B.MeshBuilder.CreateCylinder('bottle', { height: rnd(.16, .26), diameter: .08 }, scene);
      b.material = glassG; b.position.set(p.x + rnd(-.6, .6), .9, p.z + rnd(-.25, .25)); b.metadata = { kind: 'bottle' }; targets.push(b);
    }
    box(.21, .01, .3, paper, p.x - .3, .815, p.z + .1, { kind: 'desk', cast: false });
  }

  // 倉庫：ロッカー・棚
  for (let i = 0; i < 5; i++) { p = at(1, 8, -.35, i * .32); box(.6, 2, .6, metal, p.x, 1, p.z, { solid: true, kind: i === 4 ? 'lockerBack' : 'locker' }); }
  for (const [col, row] of [[4, 8], [6, 10], [4, 10]]) {
    p = at(col, row);
    box(1.6, 1.8, .5, wood, p.x, .9, p.z, { solid: true, kind: 'shelf' });
    for (let i = 0; i < 3; i++) box(rnd(.3, .5), .3, .35, mat('cb', { color: hex('#7a5a34') }), p.x + rnd(-.5, .5), .2 + i * .6, p.z + .02, { kind: 'shelf' });
  }

  // 培養室：割れた培養槽と緑の光
  p = at(11, 9);
  const tankM = mat('tank', { color: hex('#7fd08a'), emissive: hex('#1f6b2c'), alpha: .22, spec: new C3(.6, .6, .6) });
  const tank = B.MeshBuilder.CreateCylinder('tank', { height: 2.2, diameter: 1.4, tessellation: 24 }, scene);
  tank.material = tankM; tank.position.set(p.x, 1.4, p.z); tank.metadata = { kind: 'tank' }; targets.push(tank);
  box(1.7, .3, 1.7, metal, p.x, .15, p.z, { solid: true, kind: 'tank' });
  box(1.7, .25, 1.7, metal, p.x, 2.62, p.z, { kind: 'tank' });
  solid(1.6, 2.5, 1.6, p.x, p.z);
  for (let i = 0; i < 9; i++) {
    const s = box(rnd(.05, .18), .01, rnd(.05, .2), tankM, p.x + rnd(-1.5, 1.5), .01, p.z + rnd(-1.5, -.8), { cast: false });
    s.rotation.y = rnd(0, 3);
  }
  const tankLight = new B.PointLight('tankL', new V3(p.x, 1.2, p.z), scene);
  tankLight.diffuse = hex('#5dff7a'); tankLight.range = 7; tankLight.intensity = .7;

  /* ---------- 扉（マップの A〜Z。開くと蝶番を軸に回る） ---------- */
  const doorM = mat('doorM', { color: hex('#3d3a33'), spec: new C3(.2, .2, .2) });
  const knobM = mat('knobM', { color: hex('#9a8a6a'), spec: new C3(.6, .5, .3) });
  const doors = {};
  SY.MAP.forEach((line, row) => [...line].forEach((ch, col) => {
    const d = SY.DOORS[ch]; if (!d) return;
    const q = SY.cellPos(col, row);
    // 扉の両わきと上の壁（通り道は幅 1.2m・高さ 2.2m）
    for (const sx of [-1, 1]) { const w = box((C - 1.2) / 2, T.wallH, C, wallM, q.x + sx * (C + 1.2) / 4, T.wallH / 2, q.z, { solid: true, cast: false }); }
    box(1.2, T.wallH - 2.2, C, wallM, q.x, 2.2 + (T.wallH - 2.2) / 2, q.z, { cast: false });
    const hinge = new B.TransformNode('hinge', scene); hinge.position.set(q.x - .6, 0, q.z);
    const panel = box(1.2, 2.2, .08, doorM, .6, 1.1, 0, { parent: hinge, solid: true });
    const knob = B.MeshBuilder.CreateSphere('knob', { diameter: .09 }, scene); knob.parent = hinge; knob.position.set(1.05, 1.0, -.07); knob.material = knobM;
    const knob2 = knob.clone('knob2'); knob2.position.z = .07;
    // 札（扉の名前）
    const plate = box(.36, .12, .01, mat('plate', { color: hex('#b9b29a') }), .6, 1.75, -.05, { parent: hinge, cast: false });
    [panel, knob, knob2, plate].forEach(m => { m.metadata = { kind: 'door', door: ch }; });
    doors[ch] = { hinge, panel, open: false, t: 0 };
  }));

  /* ---------- 拾える物（メモ） ---------- */
  const pickups = {};
  SY.PICKUPS.forEach(pk => {
    const q = SY.cellPos(pk.col, pk.row, pk.dx, pk.dz);
    const m = B.MeshBuilder.CreatePlane('memo', { width: .21, height: .28, sideOrientation: B.Mesh.DOUBLESIDE }, scene);
    m.material = mat('memoM', { color: hex('#e8e0c8'), emissive: hex('#2a2618') });
    m.position.set(q.x, pk.y + .002, q.z); m.rotation.set(Math.PI / 2, 0, Math.random() * 3);
    m.metadata = { kind: 'pickup', item: pk.item };
    const hb = hitbox(.5, .3, .5, q.x, pk.y + .15, q.z, m.metadata);
    m.onDisposeObservable.add(() => hb.dispose());
    pickups[pk.item] = m;
  });

  /* ---------- 光 ---------- */
  const amb = new B.HemisphericLight('amb', new V3(0, 1, 0), scene);
  amb.diffuse = hex('#2c3446'); amb.groundColor = hex('#08080c'); amb.specular = C3.Black(); amb.intensity = .1;
  const bulbs = [];
  SY.ROOMS.forEach(r => {
    if (!r.bulb) return;
    const q = SY.cellPos(r.col, r.row);
    const l = new B.PointLight('bulb', new V3(q.x, T.wallH - .3, q.z), scene);
    l.diffuse = hex(r.bulb); l.range = 7; l.intensity = .8;
    const m = mat('bulbM', { color: C3.Black(), emissive: hex(r.bulb) }); m.disableLighting = true;
    const s = B.MeshBuilder.CreateSphere('bulbS', { diameter: .14 }, scene); s.position.set(q.x, T.wallH - .25, q.z); s.material = m;
    bulbs.push({ l, m, base: hex(r.bulb), flicker: r.flicker, off: 0 });
  });
  const flash = new B.SpotLight('flash', new V3(.25, -.2, 0), new V3(0, -.1, 1), T.flash.angle, 2, scene);
  flash.parent = camera; flash.diffuse = hex('#fff2d6'); flash.intensity = T.flash.intensity; flash.range = T.flash.range;
  const sg = new B.ShadowGenerator(1024, flash);
  sg.usePercentageCloserFiltering = true; sg.bias = .0008;
  casters.forEach(m => sg.addShadowCaster(m));

  /* ---------- 画面の効果（ざらつき・周辺の暗さ・色のにじみ・光るもの） ---------- */
  const glow = new B.GlowLayer('glow', scene); glow.intensity = .7;
  const fx = new B.DefaultRenderingPipeline('fx', true, scene, [camera]);
  fx.grainEnabled = true; fx.grain.intensity = 16; fx.grain.animated = true;
  fx.imageProcessingEnabled = true;
  fx.imageProcessing.vignetteEnabled = true; fx.imageProcessing.vignetteWeight = 4;
  fx.imageProcessing.vignetteColor = new B.Color4(0, 0, 0, 0);
  fx.imageProcessing.contrast = 1.3;
  fx.chromaticAberrationEnabled = true; fx.chromaticAberration.aberrationAmount = 10;

  /* ---------- 自分（見えない当たり判定を、壁にぶつけながら動かす） ---------- */
  const player = B.MeshBuilder.CreateBox('player', { size: .1 }, scene);
  player.isVisible = false; player.isPickable = false;
  player.ellipsoid = new V3(T.radius, .8, T.radius);
  const start = (() => { let s = null; SY.MAP.forEach((l, r) => { const c = l.indexOf('S'); if (c >= 0) s = SY.cellPos(c, r); }); return s; })();
  player.position.set(start.x, .86, start.z);

  /* ---------- 音（Web Audio で合成。音源ファイルなし） ---------- */
  const audio = SY.audio = {
    ac: null, out: null, muted: CG.ls.get(KEY_MUTE, '0') === '1',
    start() {
      if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const ac = this.ac = new AC();
      this.out = ac.createGain(); this.out.gain.value = this.muted ? 0 : .8; this.out.connect(ac.destination);
      this.noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // 施設の低いうなり（ずっと鳴る）
      const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = 46; g.gain.value = .06;
      const o2 = ac.createOscillator(), g2 = ac.createGain(); o2.type = 'sine'; o2.frequency.value = 92.7; g2.gain.value = .015;
      o.connect(g).connect(this.out); o2.connect(g2).connect(this.out); o.start(); o2.start();
    },
    mute(m) { this.muted = m; CG.ls.set(KEY_MUTE, m ? '1' : '0'); if (this.out) this.out.gain.value = m ? 0 : .8; },
    hit(freq, dur, vol, pan = 0) {
      const ac = this.ac; if (!ac) return;
      const s = ac.createBufferSource(); s.buffer = this.noise;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
      const g = ac.createGain(), pn = ac.createStereoPanner ? ac.createStereoPanner() : null, t = ac.currentTime;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
      s.connect(f).connect(g); if (pn) { pn.pan.value = pan; g.connect(pn).connect(this.out); } else g.connect(this.out);
      s.start(t, rnd(0, .5)); s.stop(t + dur);
    },
    tone(f0, f1, dur, vol) {
      const ac = this.ac; if (!ac) return;
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      o.type = 'triangle'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
      o.connect(g).connect(this.out); o.start(t); o.stop(t + dur);
    }
  };

  /* ---------- 操作 ---------- */
  addEventListener('keydown', e => {
    G.keys[e.code] = true;
    if ((e.code === 'KeyE' || e.code === 'KeyF') && G.running && !G.paused && !e.repeat) interact();
    if (G.running && /^(Arrow|Space)/.test(e.code)) e.preventDefault();
  });
  addEventListener('keyup', e => { G.keys[e.code] = false; });
  addEventListener('blur', () => { G.keys = {}; });

  let look = null, stickId = null, stickO = null;
  const stick = $('#stick'), knob = stick.querySelector('i');
  const locked = () => document.pointerLockElement === canvas;
  const PC = !matchMedia('(pointer:coarse)').matches;
  canvas.addEventListener('pointerdown', e => {
    if (!G.running || G.paused) return;
    audio.start();
    if (e.pointerType === 'mouse') {
      if (locked()) { if (e.button === 0) interact(); return; }   // マウス固定中の左クリックで調べる
      if (!locked() && canvas.requestPointerLock) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { }); } catch (_) { } }
      if (!locked()) look = { id: e.pointerId, x: e.clientX, y: e.clientY };   // マウスを固定できないときはドラッグで見回す
      return;
    }
    const leftLow = e.clientX < innerWidth * .45 && e.clientY > innerHeight * .35;
    if (leftLow && stickId === null) {
      stickId = e.pointerId; stickO = [e.clientX, e.clientY];
      stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px'; stick.hidden = false;
    } else if (!look) look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { }
  });
  function turn(dx, dy, k) {
    G.yaw += dx * k; G.pitch += dy * k;
    G.pitch = Math.max(-1.3, Math.min(1.3, G.pitch));
  }
  document.addEventListener('mousemove', e => { if (locked() && G.running && !G.paused) turn(e.movementX, e.movementY, T.lookPC); });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId === stickId) {
      let dx = e.clientX - stickO[0], dy = e.clientY - stickO[1]; const l = Math.hypot(dx, dy), m = 45;
      if (l > m) { dx *= m / l; dy *= m / l; }
      knob.style.transform = `translate(${dx}px,${dy}px)`; G.mv = [dx / m, dy / m];
    } else if (look && e.pointerId === look.id && !locked()) {
      turn(e.clientX - look.x, e.clientY - look.y, e.pointerType === 'mouse' ? T.lookPC * 1.6 : T.lookTouch);
      look.x = e.clientX; look.y = e.clientY;
    }
  });
  const up = e => {
    if (e.pointerId === stickId) { stickId = null; stick.hidden = true; knob.style.transform = ''; G.mv = [0, 0]; }
    if (look && e.pointerId === look.id) look = null;
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  $('#act').addEventListener('click', () => { audio.start(); interact(); });

  /* ---------- 調べる（画面の真ん中に何があるか） ---------- */
  let msgTimer = 0, aim = null;
  function say(t, sec = 3.5) { $('#msg').textContent = t; msgTimer = sec; }
  SY.say = say;
  // 調べられる物（metadata を持つメッシュ）。小さい物は見えない当たり（visibility 0）を一回り大きく付けている
  let inter = null;
  const tmpV = new V3();
  function findAim() {
    const hit = scene.pick(engine.getRenderWidth() / 2, engine.getRenderHeight() / 2, m => m.isPickable && m.isVisible && m !== player);
    if (hit && hit.hit && hit.distance <= T.reach + .6 && hit.pickedMesh.metadata) return hit.pickedMesh.metadata;
    // 真ん中から少しずれていても、近くて見えている物を選ぶ（いちばん真ん中に近いもの）
    if (!inter) inter = scene.meshes.filter(m => m.metadata && m.metadata.kind);
    const eye = camera.globalPosition, fwd = camera.getDirection(V3.Forward());
    let best = null, bestA = T.aimAngle;
    for (const m of inter) {
      if (m.isDisposed() || !m.isEnabled()) continue;
      m.getBoundingInfo().boundingSphere.centerWorld.subtractToRef(eye, tmpV);
      const d = tmpV.length(); if (d < .01 || Math.hypot(tmpV.x, tmpV.z) > T.reach) continue;   // 床の物も届くように、横の距離で見る
      const a = Math.acos(Math.max(-1, Math.min(1, V3.Dot(fwd, tmpV.scale(1 / d)))));
      if (a >= bestA) continue;
      // 間に壁などがないか
      const r = scene.pickWithRay(new B.Ray(eye, tmpV.clone().normalize(), d), x => x.isPickable && x.isVisible && x !== player);
      if (r && r.hit && r.pickedMesh !== m && r.distance < d - .35 && !(r.pickedMesh.metadata && r.pickedMesh.metadata.kind === m.metadata.kind)) continue;
      best = m.metadata; bestA = a;
    }
    return best;
  }
  function aimName(a) {
    if (!a) return '';
    if (a.kind === 'door') return SY.DOORS[a.door].name;
    if (a.kind === 'pickup') return SY.ITEMS[a.item].kind === 'memo' ? 'メモ' : SY.ITEMS[a.item].name;
    return SY.NAMES[a.kind] || '';
  }
  const has = id => G.inv.includes(id);
  function give(id) {
    if (has(id)) return;
    G.inv.push(id);
    const it = SY.ITEMS[id];
    audio.tone(1300, 2000, .25, .1);
    say(`「${it.name}」を手に入れた。`);
    $('#bBag').classList.add('new');
    if (it.kind === 'memo') openMemo(id);
  }
  function openDoor(ch) {
    const d = doors[ch]; if (!d || d.open) return;
    d.open = true; d.panel.checkCollisions = false;
    audio.tone(140, 70, 1.4, .18); audio.hit(250, .9, .35);
  }
  function interact() {
    if (!aim || G.paused) return;
    const k = aim.kind, F = G.flags;
    if (k === 'door') {
      const d = doors[aim.door], info = SY.DOORS[aim.door];
      if (d.open) return say(SY.TEXTS.doorOpen);
      if (has(info.key)) { openDoor(aim.door); return say(`${SY.ITEMS[info.key].name}を使った。${info.name}が開いた。`); }
      audio.hit(300, .25, .5);
      return say(`${info.name}。鍵がかかっている。`);
    }
    if (k === 'pickup') {
      const m = pickups[aim.item]; if (m) { m.dispose(); delete pickups[aim.item]; }
      return give(aim.item);
    }
    if (k === 'bucket') {
      F.bucket = (F.bucket || 0) + 1;
      if (has('key-cell')) return say(SY.TEXTS.bucketEmpty);
      if (F.bucket < 2) { audio.hit(900, .08, .2); return say(SY.TEXTS.bucket); }
      say(SY.TEXTS.bucket2); audio.hit(600, .5, .3);
      return setTimeout(() => give('key-cell'), 1200);
    }
    if (k === 'lockerBack') {
      if (has('key-lab')) return say(SY.TEXTS.lockerEmpty);
      audio.hit(700, .4, .3); say(SY.TEXTS.lockerBack);
      return setTimeout(() => give('key-lab'), 1200);
    }
    audio.hit(900, .08, .2);
    say(SY.TEXTS[k] || '……');
  }

  /* ---------- 持ち物とメモの画面 ---------- */
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function pause(on) {
    G.paused = on; G.keys = {}; G.mv = [0, 0];
    if (on && document.exitPointerLock && document.pointerLockElement) document.exitPointerLock();
  }
  function openBag() {
    pause(true); $('#bBag').classList.remove('new');
    const keys = G.inv.filter(id => SY.ITEMS[id].kind !== 'memo'), memos = G.inv.filter(id => SY.ITEMS[id].kind === 'memo');
    const li = id => `<li><b>${esc(SY.ITEMS[id].name)}</b><span>${esc(SY.ITEMS[id].desc || '')}</span></li>`;
    $('#bagBody').innerHTML =
      `<h3>持ち物</h3>${keys.length ? `<ul class="items">${keys.map(li).join('')}</ul>` : '<p class="none">まだ何も持っていない。</p>'}` +
      `<h3>メモ</h3>${memos.length ? `<ul class="memos">${memos.map(id => `<li><button data-memo="${id}">${esc(SY.ITEMS[id].name)}</button></li>`).join('')}</ul>` : '<p class="none">まだ拾っていない。</p>'}`;
    $('#bag').hidden = false;
  }
  function openMemo(id) {
    pause(true);
    $('#memoTitle').textContent = SY.ITEMS[id].name;
    $('#memoText').textContent = SY.ITEMS[id].text;
    $('#memo').hidden = false;
  }
  function closeAll() { $('#bag').hidden = true; $('#memo').hidden = true; pause(false); }
  $('#bBag').addEventListener('click', () => { if (G.running) openBag(); });
  $('#bagBody').addEventListener('click', e => { const b = e.target.closest('[data-memo]'); if (b) { $('#bag').hidden = true; openMemo(b.dataset.memo); } });
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeAll));
  addEventListener('keydown', e => {
    if (!G.running) return;
    if (e.code === 'KeyI' || e.code === 'Tab') { e.preventDefault(); $('#bag').hidden && $('#memo').hidden ? openBag() : closeAll(); }
    else if (e.code === 'Escape' && G.paused) closeAll();
  });

  /* ---------- メインループ ---------- */
  scene.registerBeforeRender(() => {
    const dt = Math.min(.05, engine.getDeltaTime() / 1000), now = performance.now(), K = G.keys;
    if (G.running && !G.paused) {
      let sx = (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0) + G.mv[0];
      let sz = (K.KeyW || K.ArrowUp ? 1 : 0) - (K.KeyS || K.ArrowDown ? 1 : 0) - G.mv[1];
      const l = Math.hypot(sx, sz); if (l > 1) { sx /= l; sz /= l; }
      const sp = G.stats.speed * dt, s = Math.sin(G.yaw), c = Math.cos(G.yaw);
      if (l > .05) player.computeWorldMatrix(true), player.moveWithCollisions(new V3((sz * s + sx * c) * sp, 0, (sz * c - sx * s) * sp));
      player.position.y = .86;
      if (l > .1) {
        G.bob += dt * 9 * Math.min(1, l); G.step += dt * Math.min(1, l);
        if (G.step > T.stepEvery) { G.step = 0; audio.hit(rnd(420, 560), .12, .22, rnd(-.2, .2)); }
      }
      // いまいる部屋の名前
      const col = Math.floor(player.position.x / C), row = Math.floor(-player.position.z / C);
      const r = SY.roomAt(col, row);
      if (r && r !== G.room) { G.room = r; $('#room').textContent = r; $('#room').classList.remove('show'); void $('#room').offsetWidth; $('#room').classList.add('show'); }
    }
    camera.position.set(player.position.x, T.eye + Math.sin(G.bob) * .03, player.position.z);
    camera.rotation.set(G.pitch, G.yaw, Math.sin(G.bob * .5) * .006);

    // 扉を開く
    for (const ch in doors) { const d = doors[ch]; if (d.open && d.t < 1) { d.t = Math.min(1, d.t + dt * .7); d.hinge.rotation.y = -1.55 * (1 - Math.pow(1 - d.t, 3)); } }

    // 電球のちらつき
    bulbs.forEach(b => {
      if (b.off > 0) b.off -= dt; else if (Math.random() < b.flicker * dt * 10) b.off = rnd(.04, .25);
      const k = b.off > 0 ? .05 : .85 + Math.sin(now * .011 + b.base.r * 9) * .08;
      b.l.intensity = k; b.m.emissiveColor = b.base.scale(Math.min(1, k + .1));
    });
    // 培養槽の光がゆっくり脈打つ
    const pulse = .55 + Math.sin(now * .0016) * .2;
    tankLight.intensity = pulse; tankM.emissiveColor = hex('#1f6b2c').scale(.6 + pulse);

    aim = G.running && !G.paused ? findAim() : null;
    $('#dot').classList.toggle('hot', !!aim);
    $('#act').disabled = !aim;
    const nm = aimName(aim) + (PC ? '（E）' : '');
    if ($('#act').dataset.nm !== nm) { $('#act').dataset.nm = nm; $('#act').textContent = aim ? '調べる：' + aimName(aim) + (PC ? '（E）' : '') : '調べる' + (PC ? '（E）' : ''); }
    if (msgTimer > 0 && (msgTimer -= dt) <= 0) $('#msg').textContent = '';
  });
  engine.runRenderLoop(() => scene.render());

  /* ---------- 画面の切りかえ（タイトル → プロローグ → 地下） ---------- */
  SY.begin = function () {
    G.running = true;
    $('#hud').hidden = false;
    $('#bBag').hidden = false;
    $('#who').textContent = (SY.CHARS.find(c => c.key === G.char) || SY.CHARS[0]).name;
    setTimeout(() => say('……ここは、どこだ。', 4), 600);
    $('#room').textContent = G.room; $('#room').classList.add('show');
  };
  SY.setChar = k => { G.char = k; CG.ls.set(KEY_CHAR, k); };
  SY.engine = engine; SY.scene = scene;
})();

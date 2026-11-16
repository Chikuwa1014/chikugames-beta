/* 荒野開拓記（仮） — 描画の層：たき火の炎・火の粉・煙・ゆらぐ点の光
   たき火（fire）の建物ごとに、炎の板 3 枚（画質「低」も）と、火の粉・煙の粒（高・中だけ）。
   点の光を付けるのは、主人公にいちばん近いたき火 1 つだけ（0.5 秒ごとに選びなおす）。 */
(function () {
  const MZ = window.MZ, B = BABYLON, G = MZ.gfx;
  const F = { list: [], smokes: [], mats: null, light: null, dot: null, puff: null, key: 'low', acc: 0, cur: null };
  function softTexture(name, blobs) {
    const S = 64, t = new B.DynamicTexture(name, { width: S, height: S }, G.scene, true);
    const c = t.getContext(), rnd = G.rng(77);
    c.clearRect(0, 0, S, S);
    for (let i = 0; i < blobs; i++) {
      const x = blobs > 1 ? 20 + rnd() * 24 : 32, y = blobs > 1 ? 20 + rnd() * 24 : 32, r = blobs > 1 ? 10 + rnd() * 12 : 32;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      const a = blobs > 1 ? 0.35 : 1;
      g.addColorStop(0, 'rgba(255,255,255,' + a + ')'); g.addColorStop(0.4, 'rgba(255,255,255,' + (a * 0.55) + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, S, S);
    }
    t.update(false); t.hasAlpha = true;
    return t;
  }
  function shaders() {
    B.Effect.ShadersStore.flameVertexShader = `
      precision highp float;
      attribute vec3 position; attribute vec2 uv;
      uniform mat4 worldViewProjection;
      varying vec2 vUV;
      void main(void) { vUV = uv; gl_Position = worldViewProjection * vec4(position, 1.0); }`;
    B.Effect.ShadersStore.flameFragmentShader = `
      precision highp float;
      varying vec2 vUV;
      uniform float time; uniform float seed; uniform float gain;
      float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h1(i), h1(i + vec2(1.0, 0.0)), f.x), mix(h1(i + vec2(0.0, 1.0)), h1(i + vec2(1.0, 1.0)), f.x), f.y); }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n2(p); p *= 2.1; a *= 0.5; } return s; }
      void main(void) {
        float x = (vUV.x - 0.5) * 2.0, y = vUV.y;
        float nz = fbm(vec2(vUV.x * 3.0 + seed, y * 2.6 - time * 2.4));
        float w = (1.0 - y) * 0.9 + 0.08;
        float shape = 1.0 - smoothstep(w * 0.5, w * 0.95, abs(x + (nz - 0.5) * 0.7 * y));
        float body = shape * (1.0 - smoothstep(0.25, 1.0, y + (nz - 0.5) * 0.55)) * smoothstep(0.0, 0.1, y);
        float core = body * (1.0 - smoothstep(0.0, 0.55, y)) * (1.0 - smoothstep(0.0, 0.45, abs(x)));
        vec3 col = mix(vec3(1.0, 0.22, 0.03), vec3(1.0, 0.62, 0.16), body) + vec3(1.0, 0.85, 0.55) * core;
        float a = clamp(body * 1.25, 0.0, 1.0);
        gl_FragColor = vec4(col * gain, a);
      }`;
    F.mats = [[0.95, 1.3, 0.0], [0.7, 1.0, 3.7], [0.55, 0.8, 7.1]].map(sp => {
      const mat = new B.ShaderMaterial('flame', G.scene, { vertex: 'flame', fragment: 'flame' }, {
        attributes: ['position', 'uv'], uniforms: ['worldViewProjection', 'time', 'seed', 'gain'], needAlphaBlending: true
      });
      mat.backFaceCulling = false; mat.alphaMode = B.Engine.ALPHA_ADD; mat.disableDepthWrite = true;
      mat.setFloat('seed', sp[2]); mat.setFloat('gain', 2.6); mat.setFloat('time', 0);
      mat.sp = sp;
      return mat;
    });
    F.dot = softTexture('dot', 1); F.puff = softTexture('puff', 7);
  }
  function init() {
    shaders();
    const l = F.light = new B.PointLight('fireLight', new B.Vector3(0, -100, 0), G.scene);
    l.diffuse = new B.Color3(1.0, 0.52, 0.22); l.specular = new B.Color3(1.0, 0.5, 0.2); l.intensity = 0; l.range = 26;
    l.setEnabled(true);   // いつも有効（強さ 0 で消す）
  }
  function startFx(h) {
    if (h.ps.length) return;
    const fy = 0;
    const sparks = new B.ParticleSystem('sparks', 120, G.scene);
    sparks.particleTexture = F.dot;
    sparks.emitter = new B.Vector3(h.x, fy + 0.35, h.z);
    sparks.minEmitBox = new B.Vector3(-0.22, 0, -0.22); sparks.maxEmitBox = new B.Vector3(0.22, 0.25, 0.22);
    sparks.color1 = new B.Color4(3.0, 1.6, 0.5, 1); sparks.color2 = new B.Color4(2.6, 0.9, 0.2, 1); sparks.colorDead = new B.Color4(0.5, 0.08, 0, 0);
    sparks.minSize = 0.022; sparks.maxSize = 0.055;
    sparks.minLifeTime = 0.6; sparks.maxLifeTime = 1.9;
    sparks.emitRate = 26;
    sparks.blendMode = B.ParticleSystem.BLENDMODE_ADD;
    sparks.gravity = new B.Vector3(0.3, 0.6, 0.05);
    sparks.direction1 = new B.Vector3(-0.35, 1.2, -0.35); sparks.direction2 = new B.Vector3(0.35, 2.4, 0.35);
    sparks.minEmitPower = 0.4; sparks.maxEmitPower = 1.1;
    sparks.updateSpeed = 0.016;
    sparks.start();
    const ps = new B.ParticleSystem('smoke', 80, G.scene);
    ps.particleTexture = F.puff;
    ps.emitter = new B.Vector3(h.x, fy + 1.1, h.z);
    ps.minEmitBox = new B.Vector3(-0.12, 0, -0.12); ps.maxEmitBox = new B.Vector3(0.12, 0.15, 0.12);
    ps.color1 = new B.Color4(0.34, 0.32, 0.3, 0.22); ps.color2 = new B.Color4(0.42, 0.4, 0.38, 0.16); ps.colorDead = new B.Color4(0.5, 0.49, 0.47, 0);
    ps.addSizeGradient(0, 0.35); ps.addSizeGradient(1, 2.8);
    ps.minLifeTime = 3.5; ps.maxLifeTime = 6;
    ps.emitRate = 8;
    ps.blendMode = B.ParticleSystem.BLENDMODE_STANDARD;
    ps.gravity = new B.Vector3(0.35, 0.18, 0.12);
    ps.direction1 = new B.Vector3(-0.1, 0.6, -0.1); ps.direction2 = new B.Vector3(0.1, 1.0, 0.1);
    ps.minEmitPower = 0.3; ps.maxEmitPower = 0.6;
    ps.minAngularSpeed = -0.4; ps.maxAngularSpeed = 0.4; ps.minInitialRotation = 0; ps.maxInitialRotation = 6.28;
    ps.updateSpeed = 0.016;
    ps.preWarmCycles = 60; ps.preWarmStepOffset = 4;
    ps.start();
    h.ps = [sparks, ps];
  }
  function stopFx(h) { h.ps.forEach(p => { p.stop(); p.dispose(); }); h.ps = []; }

  /* たき火を 1 つ足す（x,z はマスの中心）。返す物を remove に渡すと消える */
  function add(x, z) {
    if (!F.mats) init();
    const h = { x, z, planes: [], ps: [] }, r = G.rng(Math.round(x * 7 + z * 13) + 5);
    F.mats.forEach(mat => {
      const sp = mat.sp, pl = B.MeshBuilder.CreatePlane('flame', { size: 1 }, G.scene);
      pl.scaling.set(sp[0], sp[1], 1);
      pl.position.set(x + (r() - 0.5) * 0.12, 0.18 + sp[1] / 2,   // 炎の位置は b_fire の空ノード flame（0, 0.18, 0）に合わせる
         z + (r() - 0.5) * 0.12);
      pl.billboardMode = B.TransformNode.BILLBOARDMODE_Y;
      pl.material = mat; pl.isPickable = false; pl.applyFog = false;
      h.planes.push(pl);
    });
    if (F.key !== 'low') startFx(h);
    F.list.push(h); F.acc = 1;
    return h;
  }
  function remove(h) {
    h.planes.forEach(p => p.dispose()); h.planes = [];
    stopFx(h);
    const i = F.list.indexOf(h); if (i >= 0) F.list.splice(i, 1);
    F.acc = 1;
  }
  /* 工房の煙：建物（put の返す物。bid は建物の id）ごとに登録しておく。仕事場が動いている（run）工房のうち、主人公から 60m 以内で近い順に 4 つまでだけ、粒を出す */
  const SMOKE_NEAR = 60, SMOKE_MAX = 4;
  function addSmoke(obj) { const h = { obj, ps: null, pos: new B.Vector3() }; F.smokes.push(h); F.acc = 1; return h; }
  function removeSmoke(h) { stopSmoke(h); const i = F.smokes.indexOf(h); if (i >= 0) F.smokes.splice(i, 1); }
  function startSmoke(h) {
    if (h.ps) return;
    const low = F.key === 'low', ps = new B.ParticleSystem('chimney', low ? 40 : 70, G.scene);
    ps.particleTexture = F.puff; ps.emitter = h.pos.clone();
    ps.minEmitBox = new B.Vector3(-0.15, 0, -0.15); ps.maxEmitBox = new B.Vector3(0.15, 0.1, 0.15);
    ps.color1 = new B.Color4(0.3, 0.29, 0.28, 0.3); ps.color2 = new B.Color4(0.4, 0.38, 0.36, 0.22); ps.colorDead = new B.Color4(0.5, 0.49, 0.47, 0);
    ps.addSizeGradient(0, 0.4); ps.addSizeGradient(1, 3.2);
    ps.minLifeTime = 4; ps.maxLifeTime = 7; ps.emitRate = low ? 5 : 9;
    ps.blendMode = B.ParticleSystem.BLENDMODE_STANDARD;
    ps.gravity = new B.Vector3(0.4, 0.2, 0.15);
    ps.direction1 = new B.Vector3(-0.1, 0.7, -0.1); ps.direction2 = new B.Vector3(0.1, 1.1, 0.1);
    ps.minEmitPower = 0.3; ps.maxEmitPower = 0.7;
    ps.minAngularSpeed = -0.4; ps.maxAngularSpeed = 0.4; ps.minInitialRotation = 0; ps.maxInitialRotation = 6.28;
    ps.updateSpeed = 0.016; ps.preWarmCycles = 60; ps.preWarmStepOffset = 4;
    ps.start(); h.ps = ps;
  }
  function stopSmoke(h) { if (h.ps) { h.ps.stop(); h.ps.dispose(); h.ps = null; } }
  const _sc = [];
  function smokeTick(px, pz) {
    _sc.length = 0;
    const Tn = MZ.town;
    for (let i = 0; i < F.smokes.length; i++) {
      const h = F.smokes[i], b = Tn.byId[h.obj.bid];
      if (!b || Tn.workSt(b) !== 'run') continue;
      G.looks.smokePos(h.obj, h.pos);
      const d = Math.hypot(h.pos.x - px, h.pos.z - pz);
      if (d <= SMOKE_NEAR) { h.d = d; _sc.push(h); }
    }
    _sc.sort((a, c) => a.d - c.d);
    for (let i = 0; i < F.smokes.length; i++) {
      const h = F.smokes[i], on = _sc.indexOf(h) >= 0 && _sc.indexOf(h) < SMOKE_MAX;
      if (on) { startSmoke(h); h.ps.emitter.copyFrom(h.pos); } else stopSmoke(h);
    }
  }
  function apply(key) {
    F.smokes.forEach(stopSmoke);   // 画質で粒の数が変わる。次の smokeTick で作り直す
    F.acc = 1;
    F.key = key;
    F.list.forEach(h => { if (key === 'low') stopFx(h); else startFx(h); });
  }
  /* 毎フレーム：炎の時間・点の光のゆらぎ・いちばん近いたき火の選びなおし */
  function update(dt, time, px, pz) {
    if (!F.mats) { if (!F.smokes.length) return; init(); }   // たき火が無くても、煙の粒の絵は要る
    for (let i = 0; i < F.mats.length; i++) F.mats[i].setFloat('time', time + i * 1.7);
    F.acc += dt;
    if (F.acc >= 0.5) {
      F.acc = 0;
      let best = null, bd = 40;
      F.list.forEach(h => { const d = Math.hypot(h.x - px, h.z - pz); if (d < bd) { bd = d; best = h; } });
      F.cur = best;
      /* 光は有効のまま、近くに無いときは強さ 0（有効・無効を切りかえると、材質のシェーダーが作り直されて止まる） */
      if (best) F.light.position.set(best.x, 0.9, best.z);
      smokeTick(px, pz);
    }
    const fl = 0.78 + 0.12 * Math.sin(time * 13.1) + 0.08 * Math.sin(time * 7.3 + 1.0) + 0.06 * Math.sin(time * 23.7 + 2.0);
    if (F.cur) {
      F.light.intensity = 22 * fl;
      G.grassFireCol.copyFrom(F.light.diffuse).scaleInPlace(F.light.intensity);
      G.grassFirePos.copyFrom(F.light.position);
    } else { F.light.intensity = 0; G.grassFireCol.set(0, 0, 0); }
  }
  G.fire = { init, add, remove, addSmoke, removeSmoke, smokeTick, apply, update, state: F };
})();

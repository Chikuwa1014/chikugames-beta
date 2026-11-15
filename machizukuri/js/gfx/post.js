/* 荒野開拓記（仮） — 描画の層：後処理・接地のかげ（SSAO2）・光の筋・影
   高：ブルーム・FXAA・MSAA 4・SSAO2・光の筋・粒子感・色ずれ、影（3 段のカスケード）
   中：ブルーム・FXAA・粒子感、影（2 段）
   低：色の調整（トーンマッピング）だけ。DefaultRenderingPipeline は作らない。影もなし。
   画質を変えるたびに、いったん全部こわして作りなおす（高→中→低→高 でもエラーが出ないように）。 */
(function () {
  const MZ = window.MZ, B = BABYLON, G = MZ.gfx;
  const EXPO = 1.12;
  const P = { pipe: null, ssao: null, vls: null, sunDisk: null, ip: null, shadow: null, followSun: false, casters: [], key: '' };
  const _tgt = new B.Vector3();

  /* 影を落とす物の一覧（作ったときに足す。影の作りなおしで全部つけなおす） */
  function addCaster(m) {
    if (P.casters.indexOf(m) < 0) P.casters.push(m);
    if (P.shadow) P.shadow.addShadowCaster(m, false);
  }

  function colorSetup() {
    const ipc = G.scene.imageProcessingConfiguration;
    ipc.toneMappingEnabled = true;
    ipc.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ipc.exposure = EXPO; ipc.contrast = 1.06;
    /* 写真寄りの色：彩度を下げ、明るい所は暖色、暗い所は寒色に */
    ipc.colorCurvesEnabled = true;
    const cc = new B.ColorCurves();
    cc.globalSaturation = -12; cc.globalDensity = 0;
    cc.highlightsHue = 38; cc.highlightsDensity = 22; cc.highlightsSaturation = -5;
    cc.midtonesHue = 30; cc.midtonesDensity = 6;
    cc.shadowsHue = 215; cc.shadowsDensity = 30; cc.shadowsSaturation = -10; cc.shadowsExposure = 6;
    ipc.colorCurves = cc;
    ipc.vignetteEnabled = true; ipc.vignetteWeight = 1.1;
    ipc.vignetteColor = new B.Color4(0.08, 0.04, 0.02, 0);
    ipc.vignetteBlendMode = B.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
    return ipc;
  }
  function killAll() {
    const sc = G.scene, cam = G.cam;
    if (P.vls) { try { P.vls.dispose(cam); } catch (e) { /* 片づけ */ } P.vls = null; }
    if (P.sunDisk) P.sunDisk.setEnabled(false);
    if (P.ssao) {
      /* 管理側からも外す（外さないと、次のフレームで消した後処理を調べて止まる） */
      try {
        const mgr = sc.postProcessRenderPipelineManager;
        mgr.detachCamerasFromRenderPipeline('ssao', cam);
        P.ssao.dispose();
        if (mgr.removePipeline) mgr.removePipeline('ssao');
        if (sc.disableGeometryBufferRenderer) sc.disableGeometryBufferRenderer();
      } catch (e) { /* 片づけ */ }
      P.ssao = null;
    }
    if (P.pipe) { try { P.pipe.dispose(); } catch (e) { /* 片づけ */ } P.pipe = null; }
    if (P.ip) { try { P.ip.dispose(cam); } catch (e) { /* 片づけ */ } P.ip = null; }
    if (P.shadow) { try { P.shadow.dispose(); } catch (e) { /* 片づけ */ } P.shadow = null; }
  }
  function buildShadows(q) {
    const sun = G.sun, eng = G.engine;
    if (!q.shadow) return;
    let g;
    if (q.cascades > 0 && eng.webGLVersion >= 2 && B.CascadedShadowGenerator) {
      sun.autoUpdateExtends = true; sun.shadowFrustumSize = 0;
      g = new B.CascadedShadowGenerator(q.shadow, sun);
      g.numCascades = q.cascades; g.lambda = 0.82; g.cascadeBlendPercentage = 0.12;
      g.stabilizeCascades = true; g.shadowMaxZ = q.shadowDist; g.depthClamp = true;
      g.usePercentageCloserFiltering = true; g.filteringQuality = B.ShadowGenerator[q.pcf];
      g.bias = 0.002; g.normalBias = 0.025;
      P.followSun = false;
    } else {
      sun.autoUpdateExtends = false; sun.shadowFrustumSize = 64; sun.shadowMinZ = 1; sun.shadowMaxZ = 300;
      g = new B.ShadowGenerator(q.shadow, sun);
      if (eng.webGLVersion >= 2) { g.usePercentageCloserFiltering = true; g.filteringQuality = B.ShadowGenerator.QUALITY_LOW; } else g.usePoissonSampling = true;
      g.bias = 0.0015; g.normalBias = 0.03;
      P.followSun = true;
    }
    for (let i = 0; i < P.casters.length; i++) g.addShadowCaster(P.casters[i], false);
    P.shadow = g;
  }
  function setSSAO() {
    const eng = G.engine;
    if (B.SSAO2RenderingPipeline && B.SSAO2RenderingPipeline.IsSupported && eng.webGLVersion >= 2) {
      try {
        const s = new B.SSAO2RenderingPipeline('ssao', G.scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [G.cam], true);
        s.radius = 0.6; s.totalStrength = 0.45; s.base = 0.35; s.samples = 12;
        s.maxZ = 80; s.minZAspect = 0.4; s.expensiveBlur = false; s.bilateralSamples = 8;
        P.ssao = s;
      } catch (e) { P.ssao = null; }
    }
  }
  function setRays() {
    if (!B.VolumetricLightScatteringPostProcess) return;
    try {
      if (!P.sunDisk) {
        const d = P.sunDisk = B.MeshBuilder.CreateDisc('sunDisk', { radius: 22, tessellation: 24 }, G.scene);
        const sm = new B.StandardMaterial('sunDiskMat', G.scene);
        sm.disableLighting = true; sm.emissiveColor = new B.Color3(1.0, 0.86, 0.66); sm.fogEnabled = false;
        d.material = sm; d.isPickable = false; d.applyFog = false;
        d.billboardMode = B.Mesh.BILLBOARDMODE_ALL; d.infiniteDistance = true;
        d.position = G.SKYC.SUN_DIR.scale(1300); d.visibility = 0.999;
      }
      P.sunDisk.setEnabled(true);
      const v = new B.VolumetricLightScatteringPostProcess('rays', { postProcessRatio: 1.0, passRatio: 0.5 }, G.cam, P.sunDisk, 60, B.Texture.BILINEAR_SAMPLINGMODE, G.engine, false);
      v.exposure = 0.14; v.decay = 0.965; v.weight = 0.55; v.density = 0.9;
      P.vls = v;
    } catch (e) { P.vls = null; }
  }

  function apply(key) {
    const q = G.Q[key], sc = G.scene, cam = G.cam;
    P.key = key;
    killAll();
    const ipc = colorSetup();
    /* 影（高・中）。低は作らない */
    buildShadows(q);
    if (q.pipeline) {
      try {
        const pipe = new B.DefaultRenderingPipeline('pipe', true, sc, [cam]);
        pipe.imageProcessingEnabled = true;
        pipe.fxaaEnabled = q.fxaa;
        pipe.samples = q.msaa;
        pipe.bloomEnabled = q.bloom;
        pipe.bloomThreshold = 0.78; pipe.bloomWeight = 0.3; pipe.bloomKernel = 64; pipe.bloomScale = 0.5;   // 太陽のにじみ
        pipe.grainEnabled = q.grain; if (q.grain) { pipe.grain.intensity = 5; pipe.grain.animated = true; }
        pipe.chromaticAberrationEnabled = q.chroma;
        if (pipe.chromaticAberration) { pipe.chromaticAberration.aberrationAmount = 6; pipe.chromaticAberration.radialIntensity = 1.2; }
        P.pipe = pipe;
        if (q.ssao) setSSAO();
        if (q.rays) setRays();
      } catch (e) { P.pipe = null; }
    }
    if (!P.pipe) {
      /* 低（またはパイプラインが作れないとき）：トーンマッピングだけの後処理 1 枚。空・草の自前の描画にも同じ色の調整を掛けるため */
      try {
        const half = G.engine.getCaps().textureHalfFloatRender;
        P.ip = new B.ImageProcessingPostProcess('ip', 1.0, cam, B.Texture.BILINEAR_SAMPLINGMODE, G.engine, false,
          half ? B.Constants.TEXTURETYPE_HALF_FLOAT : B.Constants.TEXTURETYPE_UNSIGNED_BYTE);
      } catch (e) { P.ip = null; }
      ipc.applyByPostProcess = !!P.ip;
    }
    G.shadowOn = !!P.shadow;
  }
  /* 毎フレーム：カスケードでない影は、主人公のまわりへ寄せる */
  function update(px, pz, yaw) {
    if (P.followSun && G.sun) {
      _tgt.set(px + Math.sin(yaw) * 18, 0, pz + Math.cos(yaw) * 18);
      G.sun.position.copyFrom(G.SKYC.SUN_DIR).scaleInPlace(150).addInPlace(_tgt);
    }
  }
  G.post = { apply, update, addCaster, state: P };
})();

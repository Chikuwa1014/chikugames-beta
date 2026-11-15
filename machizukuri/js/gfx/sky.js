/* 荒野開拓記（仮） — 描画の層：太陽・空・光（IBL）
   写真の空（Poly Haven の HDRI「Hilly Terrain 01 (Pure Sky)」CC0 から作った 2 枚）
     assets/tex/sky.jpg：空のドーム用（正距円筒。リニアの明るさ÷2 を sRGB で保存。太陽はコードで足す）
     assets/tex/sky_ibl.png：光の回りこみ用の小さな HDR（128×64。上半分＝仮数 RGB、下半分＝指数。太陽は抜いてある）
   読めたら、太陽の高さを HDRI に合わせ、地平の色・天頂の色も HDRI から取る。読めないときは、コードの空のまま始まる。 */
(function () {
  const MZ = window.MZ, B = BABYLON, G = MZ.gfx;
  const { clamp, lerp, smooth } = G;
  const SUN_DIR = new B.Vector3(0.72, 0.28, -0.63).normalize();   // 太陽のある向き（夕方に近い午後。低い西日）
  const C_HORIZON = new B.Color3(0.64, 0.56, 0.48);                // 地平の色＝霧の色（リニア）
  const C_ZENITH = new B.Color3(0.12, 0.23, 0.5);
  const C_SUN = new B.Color3(1.0, 0.72, 0.46);
  const FOG = 0.0015;
  G.SKYC = { SUN_DIR, C_HORIZON, C_ZENITH, C_SUN };
  const SKY = { table: null, W: 128, H: 64, sunU: 0.5998, sunV: 0.4367, uRot: 0, gain: 1, tint: [1, 1, 1] };
  function skySample(x, y, z, out) {   // HDRI の表から、ある向きの明るさ（リニア・gain 込み）
    const W = SKY.W, H = SKY.H, T = SKY.table;
    let u = Math.atan2(z, x) / (Math.PI * 2) + SKY.uRot; u -= Math.floor(u);
    const v = Math.acos(clamp(y, -1, 1)) / Math.PI;
    const fx = u * W - 0.5, fy = Math.min(v, 0.499) * H - 0.5;
    const x0 = Math.floor(fx), y0 = Math.max(0, Math.floor(fy)), tx = fx - x0, ty = Math.max(0, fy - y0);
    const y1 = Math.min(H - 1, y0 + 1), xa = (x0 + W) % W, xb = (x0 + 1 + W) % W;
    for (let k = 0; k < 3; k++) {
      const a = T[(y0 * W + xa) * 3 + k], b = T[(y0 * W + xb) * 3 + k], c = T[(y1 * W + xa) * 3 + k], d = T[(y1 * W + xb) * 3 + k];
      out[k] = ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty) * SKY.gain * SKY.tint[k];
    }
  }
  function loadSkyData() {
    return new Promise(resolve => {
      let done = false;
      const fin = ok => { if (!done) { done = true; resolve(ok); } };
      setTimeout(() => fin(false), 4000);
      const img = new Image();
      img.onerror = () => fin(false);
      img.onload = () => {
        if (done) return;
        if (G.scene) return fin(false);   // 場面を作ったあとに届いても、使わない（太陽の向きなどが途中で変わらないように）
        try {
          const W = SKY.W, H = SKY.H, cv = document.createElement('canvas');
          cv.width = W; cv.height = H * 2;
          const cx = cv.getContext('2d');
          cx.drawImage(img, 0, 0);
          const d = cx.getImageData(0, 0, W, H * 2).data, T = new Float32Array(W * H * 3);
          for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
            const m = (j * W + i) * 4, e = ((j + H) * W + i) * 4, s = Math.pow(2, d[e] - 128) / 255;
            for (let k = 0; k < 3; k++) T[(j * W + i) * 3 + k] = d[m + k] * s;
          }
          /* いまのコードの空と、上半球の平均の明るさをそろえる（露出・色の調整はそのまま使えるように） */
          const o = [0, 0, 0];
          let la = 0, lt = 0;
          SKY.table = T; SKY.gain = 1;
          const az = Math.atan2(SUN_DIR.z, SUN_DIR.x);
          SKY.uRot = SKY.sunU - az / (Math.PI * 2);
          for (let j = 0; j < 16; j++) for (let i = 0; i < 32; i++) {
            const y = (j + 0.5) / 16, r = Math.sqrt(1 - y * y), a = (i + 0.5) / 32 * Math.PI * 2;
            const x = r * Math.cos(a), z = r * Math.sin(a);
            envRadiance(x, y, z, o, true); la += (o[0] * 0.2126 + o[1] * 0.7152 + o[2] * 0.0722) * y;
            skySample(x, y, z, o); lt += (o[0] * 0.2126 + o[1] * 0.7152 + o[2] * 0.0722) * y;
          }
          SKY.gain = la / Math.max(lt, 1e-6);
          /* 太陽の高さを HDRI に合わせる（方位はそのまま） */
          const el = (0.5 - SKY.sunV) * Math.PI;
          SUN_DIR.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
          /* 地平の色（太陽の側を除いた平均）と天頂の色 */
          const hz = [0, 0, 0], ze = [0, 0, 0];
          const measure = () => {
            let nh = 0, nz = 0; hz.fill(0); ze.fill(0);
            for (let i = 0; i < 64; i++) {
              const a = (i + 0.5) / 64 * Math.PI * 2, x = Math.cos(a), z = Math.sin(a);
              const sd = x * SUN_DIR.x + z * SUN_DIR.z;
              if (sd < 0.5) { skySample(x * 0.999, 0.04, z * 0.999, o); hz[0] += o[0]; hz[1] += o[1]; hz[2] += o[2]; nh++; }
              skySample(x * 0.2, 0.98, z * 0.2, o); ze[0] += o[0]; ze[1] += o[1]; ze[2] += o[2]; nz++;
            }
            for (let k = 0; k < 3; k++) { hz[k] /= nh; ze[k] /= nz; }
          };
          measure();
          /* 地平の明るさをいままでの空（霧の色）にそろえ、色みも半分ほど寄せる（遠景の色・露出の調整を生かすため） */
          const L = c => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
          const tgt = [C_HORIZON.r, C_HORIZON.g, C_HORIZON.b];
          SKY.gain *= L(tgt) / Math.max(L(hz), 1e-6);
          const r = [0, 1, 2].map(k => tgt[k] / L(tgt) / (hz[k] / L(hz)));
          SKY.tint = r.map(v => Math.pow(v, 0.5));
          measure();
          C_HORIZON.set(hz[0], hz[1], hz[2]);
          C_ZENITH.set(ze[0], ze[1], ze[2]);
          fin(true);
        } catch (e) { SKY.table = null; fin(false); }
      };
      img.src = 'assets/tex/sky_ibl.png';
    });
  }
  function envRadiance(x, y, z, out, codeOnly) {
    const sd = Math.max(x * SUN_DIR.x + y * SUN_DIR.y + z * SUN_DIR.z, 0);
    if (y >= 0 && SKY.table && !codeOnly) {
      skySample(x, y, z, out);   // 写真の空（太陽は抜いてある）
    } else if (y >= 0) {
      const t = Math.pow(y, 0.42);
      for (let k = 0; k < 3; k++) {
        const hz = [C_HORIZON.r, C_HORIZON.g, C_HORIZON.b][k], ze = [C_ZENITH.r, C_ZENITH.g, C_ZENITH.b][k], sc = [C_SUN.r, C_SUN.g, C_SUN.b][k];
        out[k] = lerp(hz, ze, t) + sc * (Math.pow(sd, 5) * 0.32 + 0.35 * sd * sd * Math.pow(1 - y, 5) + Math.pow(sd, 48) * 1.2);
      }
    } else {
      /* 地面：日に照らされた乾いた土の照り返し（地平に近いほど空の色） */
      const t = smooth(0, 0.3, -y);
      const g = [0.30, 0.24, 0.17];
      out[0] = lerp(C_HORIZON.r, g[0], t); out[1] = lerp(C_HORIZON.g, g[1], t); out[2] = lerp(C_HORIZON.b, g[2], t);
    }
  }
  function setupEnvironment() {
    const S = 64, faces = [], o = [0, 0, 0];
    /* 面の向き（Babylon の CubeMapToSphericalPolynomialTools と同じ並び：右・左・上・下・前・後ろ） */
    const F = [[[1, 0, 0], [0, 0, -1], [0, -1, 0]], [[-1, 0, 0], [0, 0, 1], [0, -1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, 1]],
      [[0, -1, 0], [1, 0, 0], [0, 0, -1]], [[0, 0, 1], [1, 0, 0], [0, -1, 0]], [[0, 0, -1], [-1, 0, 0], [0, -1, 0]]];
    for (let f = 0; f < 6; f++) {
      const d = new Float32Array(S * S * 4), N = F[f][0], U = F[f][1], V = F[f][2];
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        const u = 2 * (i + 0.5) / S - 1, v = 2 * (j + 0.5) / S - 1;
        let x = N[0] + U[0] * u + V[0] * v, y = N[1] + U[1] * u + V[1] * v, z = N[2] + U[2] * u + V[2] * v;
        const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l;
        envRadiance(x, y, z, o);
        const k = (j * S + i) * 4;
        d[k] = o[0]; d[k + 1] = o[1]; d[k + 2] = o[2]; d[k + 3] = 1;
      }
      faces.push(d);
    }
    const tex = new B.RawCubeTexture(G.scene, faces, S, B.Constants.TEXTUREFORMAT_RGBA, B.Constants.TEXTURETYPE_FLOAT,
      true, false, B.Constants.TEXTURE_TRILINEAR_SAMPLINGMODE);
    tex.gammaSpace = false;
    tex.sphericalPolynomial = B.CubeMapToSphericalPolynomialTools.ConvertCubeMapToSphericalPolynomial({
      size: S, right: faces[0], left: faces[1], up: faces[2], down: faces[3], front: faces[4], back: faces[5],
      format: B.Constants.TEXTUREFORMAT_RGBA, type: B.Constants.TEXTURETYPE_FLOAT, gammaSpace: false
    });
    G.scene.environmentTexture = tex;
    G.scene.environmentIntensity = 1.35;
    G.hemi.intensity = 0.0; G.hemi.setEnabled(false);   // 回りこむ光は IBL が受け持つ
    /* 粗さに合わせたぼかし（prefilter）。WebGL2 だけ。できなければ mipmap のまま */
    if (B.HDRFiltering && G.engine.webGLVersion >= 2) {
      try {
        const hf = new B.HDRFiltering(G.engine, { quality: B.Constants.TEXTURE_FILTERING_QUALITY_LOW, hdrScale: 1 });
        hf.prefilter(tex).catch(() => { /* そのまま使う */ });
      } catch (e) { /* そのまま使う */ }
    }
    return tex;
  }
  function setupSky() {
    B.Effect.ShadersStore.skyVertexShader = `
      precision highp float;
      attribute vec3 position;
      uniform mat4 worldViewProjection;
      varying vec3 vDir;
      void main(void) { vDir = position; gl_Position = worldViewProjection * vec4(position, 1.0); }`;
    B.Effect.ShadersStore.skyFragmentShader = `
      precision highp float;
      varying vec3 vDir;
      uniform vec3 sunDir; uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunCol; uniform float time;
      float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h1(i), h1(i + vec2(1.0, 0.0)), f.x), mix(h1(i + vec2(0.0, 1.0)), h1(i + vec2(1.0, 1.0)), f.x), f.y); }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
      void main(void) {
        vec3 d = normalize(vDir);
        float y = d.y, t = clamp(y, 0.0, 1.0);
        vec3 col = mix(horizon, zenith, pow(t, 0.42));
        if (y < 0.0) col = horizon * (1.0 + y * 0.25);
        float sd = max(dot(d, sunDir), 0.0);
        col += sunCol * (pow(sd, 5.0) * 0.32 + pow(sd, 48.0) * 0.55 + pow(sd, 400.0) * 2.5);
        col += sunCol * 0.35 * pow(sd, 2.0) * pow(1.0 - t, 5.0);
        col += sunCol * smoothstep(0.99935, 0.99965, sd) * 30.0;
        if (y > 0.015) {
          vec2 cp = d.xz / (y + 0.1) * 1.4 + vec2(time * 0.006, time * 0.0022);
          float c = fbm(cp);
          c = smoothstep(0.52, 0.8, c) * smoothstep(0.015, 0.22, y);
          vec3 cc = mix(horizon * 1.05, vec3(1.0, 0.9, 0.8), 0.45) + sunCol * pow(sd, 4.0) * 0.9;
          col = mix(col, cc, c * 0.8);
        }
        gl_FragColor = vec4(col, 1.0);
      }`;
    G.skyMat = new B.ShaderMaterial('skyMat', G.scene, { vertex: 'sky', fragment: 'sky' }, {
      attributes: ['position'],
      uniforms: ['worldViewProjection', 'sunDir', 'zenith', 'horizon', 'sunCol', 'time']
    });
    G.skyMat.backFaceCulling = false;
    G.skyMat.setVector3('sunDir', SUN_DIR);
    G.skyMat.setColor3('zenith', C_ZENITH);
    G.skyMat.setColor3('horizon', C_HORIZON);
    G.skyMat.setColor3('sunCol', C_SUN);
    G.skyMat.setFloat('time', 0);
    const dome = B.MeshBuilder.CreateSphere('sky', { diameter: 2800, segments: 32, sideOrientation: B.Mesh.BACKSIDE }, G.scene);
    dome.material = G.skyMat; dome.infiniteDistance = true; dome.isPickable = false; dome.applyFog = false;
    if (SKY.table) loadPhotoSky(dome);
  }
  /* 写真の空のドーム。読めるまではコードの空（同じ太陽・地平の色）のまま。読めなければそのまま */
  function loadPhotoSky(dome) {
    B.Effect.ShadersStore.skyPhotoFragmentShader = `
      precision highp float;
      varying vec3 vDir;
      uniform sampler2D skyTex;
      uniform vec3 sunDir; uniform vec3 sunCol; uniform float uRot; uniform float gain; uniform vec3 tint;
      void main(void) {
        vec3 d = normalize(vDir);
        float u = fract(atan(d.z, d.x) / 6.2831853 + uRot);
        float v = acos(clamp(d.y, -1.0, 1.0)) / 3.1415927;
        vec3 c = texture2D(skyTex, vec2(u, 1.0 - min(v, 0.497))).rgb;
        c = pow(c, vec3(2.2)) * 2.0 * gain * tint;
        float sd = max(dot(d, sunDir), 0.0);
        c += sunCol * (pow(sd, 48.0) * 0.35 + pow(sd, 400.0) * 2.5);
        c += sunCol * smoothstep(0.99935, 0.99965, sd) * 30.0;
        gl_FragColor = vec4(c, 1.0);
      }`;
    const tex = new B.Texture('assets/tex/sky.jpg', G.scene, true, true, B.Texture.BILINEAR_SAMPLINGMODE, () => {
      const m = new B.ShaderMaterial('skyPhoto', G.scene, { vertex: 'sky', fragment: 'skyPhoto' }, {
        attributes: ['position'],
        uniforms: ['worldViewProjection', 'sunDir', 'sunCol', 'uRot', 'gain', 'tint'],
        samplers: ['skyTex']
      });
      m.backFaceCulling = false;
      m.setTexture('skyTex', tex);
      m.setVector3('sunDir', SUN_DIR);
      m.setColor3('sunCol', C_SUN);
      m.setFloat('uRot', SKY.uRot);
      m.setFloat('gain', SKY.gain);
      m.setVector3('tint', new B.Vector3(SKY.tint[0], SKY.tint[1], SKY.tint[2]));
      dome.material = m;
    }, () => { tex.dispose(); });
    tex.wrapU = B.Texture.WRAP_ADDRESSMODE; tex.wrapV = B.Texture.CLAMP_ADDRESSMODE;
    tex.anisotropicFilteringLevel = 1;   // 継ぎ目（u が 1→0 に戻る所）に点線が出ないように（ミップマップも使わない）
  }

  let prep = null;
  /* 準備：HDRI の表を読む（scene がまだ無くてもよい）。タイトルの「はじめる」を押したあと、場面をつくる前に待つ。
     読めなければ false（コードの空のまま） */
  function prepare() {
    if (!prep) prep = G.assets.need('assets/tex/sky_ibl.png').then(ok => (ok ? loadSkyData() : false)).catch(() => false);
    return prep;
  }
  /* 場面に太陽・半球光・空を入れる。AirPlugin はここで登録する（材質を作る前） */
  function init() {
    const sc = G.scene;
    G.air.register();
    sc.clearColor = new B.Color4(C_HORIZON.r, C_HORIZON.g, C_HORIZON.b, 1);
    sc.fogMode = B.Scene.FOGMODE_NONE;   // 霧は AirPlugin（高さと距離・太陽の方向のかすみ）で足す
    const hemi = G.hemi = new B.HemisphericLight('hemi', new B.Vector3(0, 1, 0), sc);
    hemi.diffuse = new B.Color3(0.56, 0.66, 0.86);
    hemi.groundColor = new B.Color3(0.34, 0.27, 0.2);
    hemi.specular = new B.Color3(0, 0, 0);
    hemi.intensity = 0.85;
    const sun = G.sun = new B.DirectionalLight('sun', SUN_DIR.scale(-1), sc);
    sun.diffuse = new B.Color3(1.0, 0.8, 0.6);
    sun.specular = new B.Color3(0.9, 0.75, 0.6);
    sun.intensity = SKY.table ? 3.7 : 3.2;   // 写真の空では太陽が低い（約 11°）ぶん少し強く
    sun.position = SUN_DIR.scale(120);
    try { setupEnvironment(); } catch (e) { hemi.setEnabled(true); hemi.intensity = 0.85; }
    setupSky();
  }
  function update(t) { if (G.skyMat) G.skyMat.setFloat('time', t); }
  G.sky = { prepare, init, update, SKY };
})();

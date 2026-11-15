/* 荒野開拓記（仮） — 描画の層：写真の質感（Poly Haven CC0。assets/tex/ の JPEG）
   画質で読む枚数を変える：高＝色・法線・ORM（R＝AO、G＝粗さ、B＝金属 0）すべて 1024px／中＝色 1024px＋法線 512px／低＝色 512px のみ。
   読めなかった組は null のまま使う側（ground.js・nodes.js）へ渡し、使う側はコードの色で描く。 */
(function () {
  const MZ = window.MZ, B = BABYLON, G = MZ.gfx;
  const T = 'assets/tex/';
  const SETS = {
    ground: { file: 'ground', orm: true },
    path: { file: 'path', colOnly: true },
    farm: { file: 'farm', orm: true },
    stone: { file: 'stone', orm: true }
  };
  const PHOTO = { cache: {}, texOf: {}, tier: '', views: [], got: null };

  function tex(file, srgb, aniso) {
    const url = T + file;
    if (!PHOTO.cache[url]) {
      PHOTO.cache[url] = G.assets.need(url).then(ok => new Promise((res, rej) => {
        if (!ok) return rej(new Error(url));
        const t = new B.Texture(url, G.scene, false, true, B.Texture.TRILINEAR_SAMPLINGMODE, () => res(t), () => rej(new Error(url)));
        t.gammaSpace = srgb; t.anisotropicFilteringLevel = aniso || 8; PHOTO.texOf[url] = t;
        t.wrapU = B.Texture.WRAP_ADDRESSMODE; t.wrapV = B.Texture.WRAP_ADDRESSMODE;
      }));
      PHOTO.cache[url].catch(() => { delete PHOTO.cache[url]; });   // 読めなかったら覚えない（画質を変えたとき、取り直せる）
    }
    return PHOTO.cache[url];
  }
  /* 組を 1 つ：{ col, nrm, orm }（低は col のみ）。1 枚でも読めなければ reject */
  function set(name, tier) {
    const s = SETS[name], f = s.file;
    const col = tex(f + (tier === 'low' ? '_col_s.jpg' : '_col.jpg'), true);
    if (s.colOnly || tier === 'low') return col.then(c => ({ col: c, nrm: null, orm: null }));
    const nrm = tex(f + (tier === 'high' ? '_nrm.jpg' : '_nrm_s.jpg'), false);
    const orm = s.orm && tier === 'high' ? tex(f + '_orm.jpg', false) : Promise.resolve(null);
    return Promise.all([col, nrm, orm]).then(a => ({ col: a[0], nrm: a[1], orm: a[2] }));
  }
  /* 1 枚のテクスチャを、模様の大きさ・向きを変えて使う（中身は共有） */
  function view(t, us, vs, ang) {
    if (!t) return null;
    const c = t.clone();
    c.uScale = us; c.vScale = vs; c.wAng = ang || 0;
    c.gammaSpace = t.gammaSpace; c.anisotropicFilteringLevel = t.anisotropicFilteringLevel;
    PHOTO.views.push(c);
    return c;
  }
  function setMatTex(m, alb, nrm, orm, color, useAO) {
    m.albedoTexture = alb; m.bumpTexture = nrm; m.metallicTexture = orm;
    m.albedoColor = color;
    m.useAmbientOcclusionFromMetallicTextureRed = !!(orm && useAO);
    m.useRoughnessFromMetallicTextureGreen = !!orm;
    m.useMetallnessFromMetallicTextureBlue = !!orm;
    m.roughness = orm ? 1 : 0.88;
    m.metallic = 0;
  }

  /* 画質に合わせて写真を読み、材質へ貼りかえる（地面・小石）。届いた組から入れかえる */
  function apply(tier) {
    PHOTO.tier = tier;
    const names = Object.keys(SETS);
    Promise.all(names.map(n => set(n, tier).then(v => v, () => null))).then(arr => {
      if (PHOTO.tier !== tier) return;
      const got = {}; names.forEach((n, i) => { got[n] = arr[i]; });
      PHOTO.got = got;
      /* 前の画質で作った見え方（clone）は、新しい貼りかえが終わってから片づける */
      const old = PHOTO.views.splice(0, PHOTO.views.length - 0);
      G.ground.setPhoto(got, tier);
      if (G.nodes && G.nodes.setStone) { G.nodes.setStone(got.stone, tier); G.nodes.setClay(got.farm); }
      old.forEach(v => { if (PHOTO.views.indexOf(v) < 0 && !v._keep) v.dispose(); });
      /* 使わなくなった写真（前の画質の大きい絵）は、メモリから外してキャッシュから消す */
      const used = new Set(); names.forEach(n => { const v = got[n]; if (v) ['col', 'nrm', 'orm'].forEach(k => { if (v[k]) used.add(v[k]); }); });
      Object.keys(PHOTO.texOf).forEach(u => { const t = PHOTO.texOf[u]; if (!used.has(t)) { try { t.dispose(); } catch (_) { /* 済み */ } delete PHOTO.texOf[u]; delete PHOTO.cache[u]; } });
      G.photoOk = names.filter(n => got[n]).length;
    });
  }
  G.photo = { SETS, tex, set, view, setMatTex, apply, state: PHOTO };
})();

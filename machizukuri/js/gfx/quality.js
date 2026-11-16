/* 荒野開拓記（仮） — 描画の層：画質（高・中・低）
   保存キー machizukuri-gfx（'high'・'mid'・'low'・'auto'。無ければ 'auto'）。読み書きは CG.ls。
   画質を変えるときの順：資産の読み込み → 材質の貼りかえ → 採れる物と飾りの並べ直し → 建物の置き直し → 影の作り直し。
   ゲームの状態（MZ.state）は触らない。 */
(function () {
  const MZ = window.MZ, B = BABYLON, G = MZ.gfx;
  const KEY = 'machizukuri-gfx';
  G.KEY = KEY;

  /* 画質の表（モックの QUALITY を基準にした）。低は β0.1.0 に近い軽さ */
  /* 草の 1 株の三角形の数（10 枚の葉 × 3）。草の数 grass は、予算の草 ÷ これ で決める */
  const GRASS_TRIS = 30;
  G.GRASS_TRIS = GRASS_TRIS;
  G.Q = {
    high: {
      name: '高', tier: 'high', scale: () => 1 / Math.min(window.devicePixelRatio || 1, 2),
      shadow: 2048, cascades: 3, shadowDist: 110, pcf: 'QUALITY_HIGH',
      pipeline: true, bloom: true, fxaa: true, msaa: 4, ssao: true, rays: true, grain: true, chroma: true,
      grass: Math.round(450000 / GRASS_TRIS), fadeEnd: 55, pebbles: 1800, decor: 1,
      models: ['rocks', 'wood', 'trees', 'plants', 'buildings'],
      treeLod: [55, 160], rockDist: 70, bushDist: 35, outer: 0.6, decorDist: 70, houseNear: 25, peopleNear: 12,
      hiTerrain: true, trisMax: 1700000,
      bldFar: 300, nodeFar: 250, xfarDist: 60, nearMax: 8, budget: { bld: 400000, grass: 450000, tree: 400000 }
    },
    mid: {
      name: '中', tier: 'mid', scale: () => 1 / Math.min(window.devicePixelRatio || 1, 1.25),
      shadow: 1024, cascades: 2, shadowDist: 70, pcf: 'QUALITY_MEDIUM',
      pipeline: true, bloom: true, fxaa: true, msaa: 1, ssao: false, rays: false, grain: true, chroma: false,
      grass: Math.round(150000 / GRASS_TRIS), fadeEnd: 40, pebbles: 900, decor: 0.5,
      models: ['rocks', 'wood', 'trees', 'plants', 'buildings'],
      treeLod: [22, 160], rockDist: 40, bushDist: 20, outer: 0.3, decorDist: 45, houseNear: 25, peopleNear: 12,
      hiTerrain: true, trisMax: 900000,
      bldFar: 220, nodeFar: 180, xfarDist: 60, nearMax: 4, budget: { bld: 250000, grass: 150000, tree: 220000 }
    },
    low: {
      name: '低', tier: 'low', scale: () => 1 / Math.min(window.devicePixelRatio || 1, 1),
      shadow: 0, cascades: 0, shadowDist: 0, pcf: 'QUALITY_LOW',
      pipeline: false, bloom: false, fxaa: false, msaa: 1, ssao: false, rays: false, grain: false, chroma: false,
      grass: 2200, fadeEnd: 28, pebbles: 300, decor: 0.17,
      models: [],
      treeLod: [0, 0], rockDist: 0, bushDist: 0, outer: 0.12, decorDist: 30, houseNear: 0, peopleNear: 0,
      hiTerrain: false, trisMax: 300000,
      bldFar: 150, nodeFar: 130, xfarDist: 0, nearMax: 0, budget: { bld: 120000, grass: 66000, tree: 0 }
    }
  };
  const ORDER = ['high', 'mid', 'low'];

  /* 予算の手順で下げた段（G.budgetTick）。houseCut：建物の近く用の距離を縮めた m（最大 10＝25 → 15）、treeF：木の近く用の距離の倍率（最小 0.6）。草は G.grass.scaleF */
  G.dyn = { houseCut: 0, treeF: 1 };
  G.pref = 'auto';          // 画面で選んだ値
  G.key = 'high';           // 実際に使っている画質
  G.autoKey = null;         // 「自動」のとき、遅くて下げた後の画質
  G.downgraded = false;

  const hasWebGL2 = () => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch (e) { return false; } };
  /* 端末に合わせた自動の初期値 */
  G.autoGuess = function () {
    if (G.autoKey) return G.autoKey;
    if (!hasWebGL2()) return 'low';
    if (matchMedia('(pointer:coarse)').matches) return 'mid';
    return 'high';
  };
  G.readPref = function () {
    const v = CG.ls.get(KEY, 'auto');
    return (v === 'high' || v === 'mid' || v === 'low' || v === 'auto') ? v : 'auto';
  };
  G.resolve = pref => (pref === 'auto' ? G.autoGuess() : pref);
  G.label = () => '画質：' + (G.pref === 'auto' ? '自動（' + G.Q[G.key].name + '）' : G.Q[G.key].name);

  /* 画面に出す名前・ボタンを直す */
  G.refreshUI = function () {
    document.querySelectorAll('[data-gfx-q]').forEach(b => { b.textContent = G.label(); });
  };
  G.cycle = function () {
    const next = { high: 'mid', mid: 'low', low: 'auto', auto: 'high' }[G.pref] || 'auto';
    if (next === 'auto') G.autoKey = null;
    G.setQuality(next);
  };

  /* 画質を変える（scene がまだ無いときは、決めるだけ） */
  G.setQuality = function (pref) {
    if (!(pref === 'high' || pref === 'mid' || pref === 'low' || pref === 'auto')) pref = 'auto';
    G.pref = pref; CG.ls.set(KEY, pref);
    const prev = G.key;
    G.key = G.resolve(pref);
    G.refreshUI();
    if (!G.scene) return G.key;
    const q = G.Q[G.key];
    G.engine.setHardwareScalingLevel(q.scale());
    G.cam.fovMode = B.Camera.FOVMODE_VERTICAL_FIXED;
    /* 1 資産の読み込み（足りない組を取りに行く。届いた組は、それぞれが自分で入れかえる） */
    G.assets.loadTier(G.key);
    /* 中 → 高：共通の写真（法線 512 → 1024）を使う近く用を読み直す */
    if (prev === 'mid' && G.key === 'high') { G.looks.reloadBtex(); G.nodes.reloadNear(); }
    /* 2 材質の貼りかえ・3 採れる物と飾り・4 建物・5 影 */
    G.photo.apply(G.key);
    G.ground.apply(G.key);
    G.grass.apply(G.key);
    G.nodes.apply(G.key);
    G.looks.apply(G.key);
    G.fire.apply(G.key);
    G.post.apply(G.key);
    G.budgetAcc = 0;
    return G.key;
  };

  /* 三角形の数（thin instance の数を掛ける）。有効で見えているメッシュだけ */
  G.tris = function () {
    let t = 0;
    const ms = G.scene.meshes;
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i];
      if (!m.isEnabled() || !m.isVisible || !m.getTotalIndices || m._masterMesh) continue;   // _masterMesh：LOD の先に使われているメッシュ（自分では描かれない）
      /* インスタンスは、元のメッシュの三角形を数える（建物の近く用・遠く用・最遠は、近くの建物の係が有効・無効で切りかえている。木などの LOD は使わない） */
      let lm = m;
      if (m.sourceMesh && m.sourceMesh.getLODLevels().length) { lm = m.getLOD(G.cam); if (!lm) continue; }
      const n = lm.getTotalIndices() / 3;
      if (!n) continue;
      t += n * (m.hasThinInstances ? m.thinInstanceCount : 1);
    }
    return Math.round(t);
  };

  /* 予算：2 秒ごとに数え、上限を超えたら 1 回に 1 段、次の順に下げる：1 草を 10% へらす（最小 0.1）→ 2 建物の近く用の距離を 2.5m 縮める（15m まで）→ 3 木の近く用の距離を 0.85 倍（60% まで）。
     上限の 85% を下回ったら、逆の順（3 → 2 → 1）に少しずつもどす */
  G.budgetAcc = 0; G.lastTris = 0;
  G.HOUSE_CUT_MAX = 10; G.TREE_F_MIN = 0.6;
  G.budgetTick = function (dt) {
    G.budgetAcc += dt;
    if (G.budgetAcc < 2) return;
    G.budgetAcc = 0;
    G.budgetStep(G.lastTris = G.tris());
  };
  G.budgetStep = function (t) {
    const max = G.Q[G.key].trisMax, gs = G.grass.scaleF, D = G.dyn;
    if (t > max) {
      if (gs > 0.1) G.grass.setScale(Math.max(0.1, gs * 0.9));
      else if (D.houseCut < G.HOUSE_CUT_MAX && G.Q[G.key].nearMax > 0) D.houseCut = Math.min(G.HOUSE_CUT_MAX, D.houseCut + 2.5);
      else if (D.treeF > G.TREE_F_MIN && G.Q[G.key].treeLod[0] > 0) { D.treeF = Math.max(G.TREE_F_MIN, D.treeF * 0.85); G.nodes.dirty(); }
    } else if (t < max * 0.85) {
      if (D.treeF < 1) { D.treeF = Math.min(1, D.treeF / 0.85); G.nodes.dirty(); }
      else if (D.houseCut > 0) D.houseCut = Math.max(0, D.houseCut - 2.5);
      else if (gs < 1) G.grass.setScale(Math.min(1, gs + 0.05));
    }
  };
  /* どこまで下げたか（MZ.stats 用） */
  G.budgetState = () => ({ grass: +G.grass.scaleF.toFixed(2), houseCut: G.dyn.houseCut, treeF: +G.dyn.treeF.toFixed(2) });

  /* 自動のとき、遊びはじめて 10 秒ぶんのフレームの時間の中央値が 20fps より低ければ 1 段下げる（1 回だけお知らせ）。
     読み込み中・タブが隠れているあいだは数えず、最初の 3 秒は捨てる。dt は実時間の 1 フレーム */
  const W = { t: 0, sec: 0, s: [], done: false };
  G.autoWatch = function (dt) {
    if (W.done || G.pref !== 'auto') return;
    if (document.hidden || (G.assets && G.assets.done < G.assets.total)) return;
    dt = dt > 0 ? dt : 0.016;
    W.t += dt;
    if (W.t < 3) return;
    W.s.push(dt); W.sec += dt;
    if (W.sec < 10) return;
    W.done = true;
    const a = W.s.slice().sort((x, y) => x - y), med = a[a.length >> 1];
    if (1 / med >= 20) return;
    const i = ORDER.indexOf(G.key);
    if (i < 0 || i >= ORDER.length - 1) return;
    G.autoKey = ORDER[i + 1]; G.downgraded = true;
    G.setQuality('auto');
    if (MZ.ui) MZ.ui.notice('画質を下げました（設定で変えられます）');
  };

  /* 画面のボタン（上のバーとパネルの下）。押すたびに 高→中→低→自動 */
  G.bindUI = function () {
    document.querySelectorAll('[data-gfx-q]').forEach(b => b.addEventListener('click', () => G.cycle()));
    G.refreshUI();
  };
})();

/* 荒野開拓記（仮） — 描画の層：建物・人・道具の見た目の受け皿
   - MZ.gfx.look(種類)    … { src: 'glb' | 'code', lod: [{ meshes, dist }] }。GLB があれば GLB、無い・読めないときは MZ.getModel（今のコードの形）。
   - MZ.gfx.put(種類, x, z, 回転) … 置いた物を返す。.dispose() で消える。LOD は addLODLevel（近く用→遠く用→見えなくなる）。
   - MZ.gfx.preview(種類) … 緑と赤の見本（遠く用の部品を複製して、見本の材質にする）。
   - MZ.gfx.people        … 住民の thin instance の入れ物（近い人だけ近く用）。
   モデルは 1 つずつ足せる：assets/models/ にファイルを置き、assets.js の MANIFEST と BUILD_MODELS に 1 行足すだけ。
   当たりは今までどおりマスの表（solid）。モデルに当たりの形は要らない。 */
(function () {
  const MZ = window.MZ, B = BABYLON, G = MZ.gfx, T = MZ.T, A = G.assets;
  const L = { glb: {}, objs: new Set(), lodDone: new Set(), pv: null, pvKey: '', pvOk: null, pvBad: null, key: 'low' };

  /* ---------- 見た目（look） ---------- */
  function codeMesh(key) { return MZ.getModel(key); }
  /* 種類 → { src, lod }。画質「低」は近く用を使わない（遠く用だけ。遠く用が無ければコードの形） */
  function look(key) {
    const g = L.glb[key], q = G.Q[L.key];
    if (g && g.near && q.models.indexOf('buildings') >= 0) {
      const far = g.far && g.far.length ? g.far : [codeMesh(key)];
      return { src: 'glb', key, lod: [{ meshes: g.near, dist: 0 }, { meshes: far, dist: q.houseNear }] };
    }
    if (g && g.far && g.far.length) return { src: 'glb', key, lod: [{ meshes: g.far, dist: 0 }] };
    return { src: 'code', key, lod: [{ meshes: [codeMesh(key)], dist: 0 }] };
  }
  /* 足もとの高さを確かめる（y の最小が 0 からずれていたら直す。開発中だけ console.warn） */
  function fixFoot(meshes, key, fix) {
    let ymin = Infinity;
    meshes.forEach(m => { m.refreshBoundingInfo(); ymin = Math.min(ymin, m.getBoundingInfo().boundingBox.minimum.y); });
    if (fix && fix.yaw) meshes.forEach(m => { m.bakeTransformIntoVertices(B.Matrix.RotationY(fix.yaw)); m.refreshBoundingInfo(); });
    if (isFinite(ymin) && Math.abs(ymin) > 0.03) {
      console.warn('[gfx] ' + key + ' の足もとが y=0 からずれていたので直した（' + ymin.toFixed(3) + 'm）');
      meshes.forEach(m => { m.bakeTransformIntoVertices(B.Matrix.Translation(0, -ymin, 0)); m.refreshBoundingInfo(); });
    }
  }
  /* 種類ごとに GLB を読む（読めなかったら何もしない＝コードの形のまま）。低は遠く用だけ、高・中は近く用も */
  function loadBuild(key) {
    const d = G.BUILD_MODELS[key];
    if (!d) return;
    const g = L.glb[key] = L.glb[key] || { near: null, far: null };
    L.pend = L.pend || {};
    const low = L.key === 'low', todo = [];
    if (!g.near && !low && !L.pend[key + ':n']) { L.pend[key + ':n'] = true; todo.push(A.model(d.near).then(m => { fixFoot(m, key, d.fix); m.forEach(x => { if (G.post) G.post.addCaster(x); }); g.near = m; })); }
    if (!g.far && d.far && !L.pend[key + ':f']) { L.pend[key + ':f'] = true; todo.push(A.model(d.far).then(m => { fixFoot(m, key, d.fix); g.far = m; })); }
    todo.forEach(p => p.then(repose, () => { /* コードの形のまま */ }));
  }
  function apply(key) {
    L.key = key;
    Object.keys(G.BUILD_MODELS).forEach(loadBuild);
    repose();
    if (G.people) G.people.refresh();
  }

  /* ---------- 置く（put） ---------- */
  /* LOD は、元のメッシュ（近く用）に 1 度だけ付ける。インスタンスにも LOD が効く */
  function ensureLod(lk) {
    if (lk.lod.length < 2) return;
    const near = lk.lod[0].meshes, far = lk.lod[1].meshes, d = lk.lod[1].dist;
    near.forEach((m, i) => {
      if (L.lodDone.has(m)) return;
      L.lodDone.add(m);
      m.addLODLevel(d, i === 0 ? far[0] : null);   // 遠く用は 1 つ目の部品だけに（同じ物を何度も描かない）
      m.addLODLevel(400, null);
    });
  }
  function put(key, x, z, ry) {
    const obj = { key, x, z, ry, inst: [], fx: null };
    obj.build = function () {
      obj.inst.forEach(i => i.dispose()); obj.inst = [];
      if (key === 'road') return;   // 土の道は、どの画質でもメッシュを置かず、地面のマスの表で描く
      const lk = look(key);
      ensureLod(lk);
      lk.lod[0].meshes.forEach((m, i) => {
        m.receiveShadows = true;   // 影を受けるかは元のメッシュで決まる（インスタンスでは効かない）
        const inst = m.createInstance(key + '_' + Math.round(x) + '_' + Math.round(z) + '_' + i);
        inst.position.set(x, 0, z); inst.rotation.y = ry;
        inst.isPickable = false;
        inst.freezeWorldMatrix();
        obj.inst.push(inst);
      });
    };
    obj.dispose = function () {
      obj.inst.forEach(i => i.dispose()); obj.inst = [];
      if (obj.fx) { G.fire.remove(obj.fx); obj.fx = null; }
      L.objs.delete(obj);
    };
    obj.build();
    if (key === 'fire') obj.fx = G.fire.add(x, z);
    L.objs.add(obj);
    return obj;
  }
  /* 画質・読み込みが変わったとき、置いた物を置き直す（ゲームの状態は触らない） */
  function repose() { L.objs.forEach(o => o.build()); }

  /* ---------- 見本（preview：緑＝置ける、赤＝置けない） ---------- */
  function pvMat(name, hex) {
    const m = new B.StandardMaterial(name, G.scene), c = B.Color3.FromHexString(hex);
    m.diffuseColor = c; m.emissiveColor = c.scale(0.5); m.specularColor = new B.Color3(0, 0, 0); m.alpha = 0.55; m.backFaceCulling = false;
    return m;
  }
  /* 返すのは根（TransformNode）。position・rotation・scaling で動かし、setPreviewOk で緑と赤を切りかえる */
  function preview(key) {
    if (!L.pvOk) { L.pvOk = pvMat('pvOk', '#5FBF5F'); L.pvBad = pvMat('pvBad', '#D9534F'); }
    const root = new B.TransformNode('previewRoot', G.scene);
    root.metadata = { parts: [] };
    let srcs;
    if (key === 'road') {
      srcs = [codeMesh('road')];   // 土の道の見本は平たい板（2m）
    } else {
      const lk = look(key);
      srcs = lk.lod[lk.lod.length - 1].meshes;   // 遠く用の部品を複製
    }
    srcs.forEach((s, i) => {
      const c = s.clone(i === 0 ? 'preview' : 'preview' + i);
      c.parent = root; c.useVertexColors = false; c.isVisible = true; c.isPickable = false;
      c.setEnabled(true); c.alwaysSelectAsActiveMesh = true; c.renderingGroupId = 1;   // 手前の建物に隠れない
      c.receiveShadows = false; c.material = L.pvBad;
      root.metadata.parts.push(c);
    });
    return root;
  }
  function setPreviewOk(root, ok) {
    const m = ok ? L.pvOk : L.pvBad;
    root.metadata.parts.forEach(c => { c.material = m; });
  }

  /* ---------- 住民 ---------- */
  /* 部品ごとの thin instance。近い人（peopleNear m 以内）だけ近く用、それ以外はコードの形（遠く用）。
     groups は { meshes, mesh（1 つ目）, buf, n } の一覧。pick(v, d2) でその人の入れ物を返す */
  const PE = { groups: [], far: [], near: [] };
  function mkGroup(meshes, max, shared) {
    const buf = shared || new Float32Array(max * 16);
    const g = { meshes, mesh: meshes[0], buf, n: 0 };
    meshes.forEach(m => {
      m.thinInstanceSetBuffer('matrix', buf, 16, false); m.thinInstanceCount = 0;
      m.isVisible = true; m.alwaysSelectAsActiveMesh = true; m.isPickable = false;
    });
    return g;
  }
  function peopleInit(max) {
    PE.max = max; PE.far = []; PE.near = []; PE.groups = [];
    for (let v = 0; v < 4; v++) { const g = mkGroup([codeMesh('person' + v)], max); PE.far.push(g); PE.groups.push(g); PE.near.push(null); }
    return PE.groups;
  }
  /* GLB の住民（person_a〜c）が届いていたら、近く用の入れ物を作る（部品の分け方は主人公と同じ。いまは 1 体 1 メッシュ） */
  function peopleRefresh() {
    if (!PE.max) return;
    const q = G.Q[L.key];
    for (let v = 0; v < 4; v++) {
      const gl = L.glb['person_' + 'abc'[v % 3]];
      if (q.peopleNear > 0 && gl && gl.near && gl.near.length && !PE.near[v]) {
        const g = mkGroup(gl.near, PE.max); PE.near[v] = g; PE.groups.push(g);
      }
    }
  }
  function peoplePick(v, d2) {
    const n = PE.near[v];
    return (n && d2 < G.Q[L.key].peopleNear * G.Q[L.key].peopleNear) ? n : PE.far[v];
  }
  /* 主人公：コードの形（TransformNode 根。metadata.parts に legL・legR・armL・armR）。
     GLB（b_player.glb。ノード名 legL・legR・armL・armR、根は腰）が届いたら、同じ並びの根に差しかえる（未対応のあいだは今のコードの形） */
  function playerModel() { return MZ.getModel('player'); }

  G.look = look; G.put = put; G.preview = preview; G.setPreviewOk = setPreviewOk; G.repose = repose;
  G.looks = { apply, state: L, loadBuild, playerModel };
  G.people = { init: peopleInit, refresh: peopleRefresh, pick: peoplePick, get groups() { return PE.groups; } };
})();

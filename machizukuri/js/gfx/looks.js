/* 荒野開拓記（仮） — 描画の層：建物・人・道具の見た目の受け皿
   - MZ.gfx.look(種類)    … { src: 'glb' | 'code', lod: [{ meshes, dist }] }。GLB があれば GLB、無い・読めないときは MZ.getModel（今のコードの形）。
   - MZ.gfx.put(種類, x, z, 回転) … 置いた物を返す。.dispose() で消える。LOD は addLODLevel（近く用→遠く用→見えなくなる）。
   - MZ.gfx.preview(種類) … 緑と赤の見本（遠く用の部品を複製して、見本の材質にする）。
   - MZ.gfx.people        … 住民の thin instance の入れ物（近い人だけ近く用）。
   モデルは 1 つずつ足せる：assets/models/ にファイルを置き、assets.js の MANIFEST と BUILD_MODELS に 1 行足すだけ（コードの側は何も変えない。
   BUILD_MODELS に 1 行足すと、その種類は GLB に切りかわる。新しい建物 quarry・claypit・workshop・shop・storehouse・bigfield は、いまはコードの形）。
   当たりは今までどおりマスの表（solid）。モデルに当たりの形は要らない。 */
(function () {
  const MZ = window.MZ, B = BABYLON, G = MZ.gfx, T = MZ.T, A = G.assets;
  const L = { glb: {}, chr: {}, tool: {}, pl: { near: null, far: null }, objs: new Set(), lodDone: new Map(), pv: null, pvKey: '', pvOk: null, pvBad: null, key: 'low' };

  /* ---------- 見た目（look） ---------- */
  function codeMesh(key) { return MZ.getModel(key); }
  /* 種類 → { src, lod }。画質「低」は近く用を使わない（遠く用だけ。遠く用が無ければコードの形） */
  function look(key) {
    const g = L.glb[key], q = G.Q[L.key];
    if (g && g.near && q.models.indexOf('buildings') >= 0) {
      const far = g.far && g.far.length ? g.far : [codeMesh(key)];
      return { src: 'glb', key, lod: [{ meshes: g.near, dist: 0 }, { meshes: far, dist: Math.max(q.houseNear, (G.BUILD_MODELS[key] || {}).lod || 0) }] };
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
    if (!g.near && !low && !L.pend[key + ':n']) { L.pend[key + ':n'] = true; todo.push(A.model(d.near).then(m => { fixFoot(m, key, d.fix); m.forEach(x => { if (G.post) G.post.addCaster(x); }); g.near = m; if (L.key === 'low') releaseNear(); })); }
    if (!g.far && d.far && !L.pend[key + ':f']) { L.pend[key + ':f'] = true; todo.push(A.model(d.far).then(m => { fixFoot(m, key, d.fix); m.forEach(x => { if (G.post) G.post.addCaster(x); }); g.far = m; })); }
    todo.forEach(p => p.then(repose, () => { /* コードの形のまま。画質を変えたとき、読み直せるように印をもどす */ L.pend[key + ':n'] = L.pend[key + ':f'] = false; }));
  }
  function apply(key) {
    L.key = key;
    Object.keys(G.BUILD_MODELS).forEach(loadBuild);
    applyChars();
    repose();
    if (L.key === 'low') releaseNear();
    if (G.people) G.people.refresh();
  }

  /* ---------- 置く（put） ---------- */
  /* LOD は、元のメッシュ（近く用）に 1 度だけ付ける。インスタンスにも LOD が効く */
  function ensureLod(lk) {
    if (lk.lod.length < 2) return;
    const near = lk.lod[0].meshes, far = lk.lod[1].meshes, d = lk.lod[1].dist;
    near.forEach((m, i) => {
      const f = i === 0 ? far[0] : null, sig = (f ? f.uniqueId : 0) + ':' + d;
      if (L.lodDone.get(m) === sig) return;
      /* 遠く用が後から届いた（コードの形のまま固定されていた）・距離が変わったときは、付け直す */
      while (m.getLODLevels().length) m.removeLODLevel(m.getLODLevels()[0].mesh);
      if (f && f._masterMesh && f._masterMesh !== m) f._masterMesh = null;   // 前の元メッシュ（片づけ済み）との結びつきを外す
      L.lodDone.set(m, sig);
      m.addLODLevel(d, f);   // 遠く用は 1 つ目の部品だけに（同じ物を何度も描かない）
      m.addLODLevel(400, null);
    });
  }
  function put(key, x, z, ry) {
    const obj = { key, x, z, ry, inst: [], fx: null };
    obj.build = function () {
      obj.inst.forEach(i => i.dispose()); obj.inst = [];
      if (MZ.BUILDS[key].road) return;   // 道（土の道・石畳の道。road の欄がある建物）は、どの画質でもメッシュを置かず、地面のマスの表で描く
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
    if (MZ.BUILDS[key].road) {
      srcs = [codeMesh(key)];   // 道の見本は平たい板（2m。石畳は丸い石をのせた板）
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

  /* ---------- 人（主人公・住民）：b_player・b_person_a〜c の GLB ---------- */
  /* 根の子が body・legL・legR・armL・armR。A.model は頂点を世界の位置に焼いてあるので、脚・腕を回す中心（股・肩）を表で持つ。
     L は Babylon で −x 側（コードの形と同じ）。x の符号は、読めたメッシュの位置から決める */
  const PIV = {
    player: { lx: 0.095, ly: 0.900, ax: 0.200, ay: 1.415, az: 0 },
    person_a: { lx: 0.094, ly: 0.926, ax: 0.197, ay: 1.455, az: 0 },
    person_b: { lx: 0.078, ly: 0.838, ax: 0.158, ay: 1.299, az: 0 },
    person_c: { lx: 0.096, ly: 0.869, ax: 0.203, ay: 1.360, az: 0.029 }
  };
  const PARTS = ['body', 'legL', 'legR', 'armL', 'armR'];
  const partOf = (ms, nm) => ms.find(m => m.name === nm || m.name.indexOf(nm + '_') === 0 || m.name.endsWith('_' + nm));
  /* 部品ごとの回す中心（Babylon の座標）。LR の符号は legL / armL のメッシュの中心 x から決める */
  function pivots(key, ms) {
    const d = PIV[key], l = partOf(ms, 'legL'), a = partOf(ms, 'armL');
    const sg = m => { if (!m) return -1; const b = m.getBoundingInfo().boundingBox; return (b.minimum.x + b.maximum.x) * 0.5 >= 0 ? 1 : -1; };
    const sl = sg(l), sa = sg(a);
    return {
      body: null,
      legL: new B.Vector3(sl * d.lx, d.ly, 0), legR: new B.Vector3(-sl * d.lx, d.ly, 0),
      armL: new B.Vector3(sa * d.ax, d.ay, d.az), armR: new B.Vector3(-sa * d.ax, d.ay, d.az)
    };
  }
  function loadChar(key, tier) {
    const g = L.chr[key] = L.chr[key] || { near: null, far: null };
    L.pend = L.pend || {};
    if (tier === 'near' && !g.near && L.key !== 'low' && !L.pend[key + ':n']) {
      L.pend[key + ':n'] = true;
      A.model('b_' + key).then(ms => { ms.forEach(m => { if (G.post) G.post.addCaster(m); }); g.near = ms; g.piv = pivots(key, ms); onChars(); if (L.key === 'low') releaseNear(); }, () => { L.pend[key + ':n'] = false; });
    }
    if (tier === 'far' && !g.far && !L.pend[key + ':f']) {
      L.pend[key + ':f'] = true;
      A.model('b_' + key + '_far').then(ms => { g.far = ms; g.farPiv = pivots(key, ms); onChars(); }, () => { L.pend[key + ':f'] = false; });
    }
  }
  function onChars() { peopleRefresh(); if (G.looks && G.looks.onPlayer) G.looks.onPlayer(); }

  /* 主人公の根：GLB の部品を複製して、足もとの根（TransformNode）の下に並べる。metadata.parts に legL・legR・armL・armR（コードの形と同じ） */
  function buildPlayer(kind) {
    const g = L.chr.player, ms = g && g[kind];
    if (!ms || !ms.length) return null;
    const pv = kind === 'near' ? g.piv : g.farPiv, tag = kind === 'near' ? 'n' : 'f';
    const root = new B.TransformNode('player_' + tag, G.scene), parts = {};
    root.metadata = { parts, glb: kind, tools: {} };
    PARTS.forEach(nm => {
      const src = partOf(ms, nm); if (!src) return;
      let holder = root;
      if (pv[nm]) { holder = new B.TransformNode(nm + '_' + tag, G.scene); holder.parent = root; holder.position.copyFrom(pv[nm]); parts[nm] = holder; }
      const c = src.clone('player_' + nm + '_' + tag, holder);
      c.setEnabled(true); c.isVisible = true; c.isPickable = false; c.receiveShadows = true;
      if (pv[nm]) c.position.set(-pv[nm].x, -pv[nm].y, -pv[nm].z);
      if (kind === 'near' && G.post) G.post.addCaster(c);
    });
    if (!parts.legL || !parts.legR || !parts.armL || !parts.armR) { root.dispose(false, false); return null; }
    root.setEnabled(false);
    return root;
  }
  /* いまの画質で使う主人公の根。低は遠く用（無ければコードの形）、高・中は近く用 → 遠く用 → コードの形の順 */
  function playerModel() {
    if (L.key !== 'low') { if (!L.pl.near) L.pl.near = buildPlayer('near'); if (L.pl.near) return L.pl.near; }
    if (!L.pl.far) L.pl.far = buildPlayer('far');
    if (L.pl.far) return L.pl.far;
    return MZ.getModel('player');
  }

  /* ---------- 道具：b_tool_axe1〜3・b_tool_pick1〜3（近く用だけ。低はコードの形） ---------- */
  const TOOL_NAMES = ['axe', 'pick'];
  function loadTools() {
    if (L.key === 'low') return;
    TOOL_NAMES.forEach(n => [1, 2, 3].forEach(lv => {
      const k = n + lv;
      if (L.tool[k] || (L.pend && L.pend['t' + k])) return;
      L.pend = L.pend || {}; L.pend['t' + k] = true;
      A.model('b_tool_' + k).then(ms => { ms.forEach(m => { m.receiveShadows = false; }); L.tool[k] = ms; if (L.key === 'low') releaseNear(); }, () => { L.pend['t' + k] = false; });
    }));
  }
  /* 道具 1 本（段 lv）の複製を parent の下に作る。まだ読めていなければ null。複製は非表示で返す */
  function toolClones(name, lv, parent) {
    const ms = L.tool[name + lv]; if (!ms) return null;
    return ms.map((m, i) => { const c = m.clone('tool_' + name + lv + '_' + i, parent); c.setEnabled(false); c.isVisible = true; c.isPickable = false; return c; });
  }
  /* 主人公（三人称）の右手の道具。name='axe'|'pick'、lv=0 なら何も持たない */
  function holdTool(root, name, lv) {
    const md = root.metadata; if (!md || !md.parts || !md.glb) return;
    const arm = md.parts.armR, pose = md.glb === 'near' ? { y: -0.62, z: 0.06, rx: 1.0 } : null;
    if (!pose) return;
    const hk = name + lv + ':' + Object.keys(L.tool).length + ':' + Object.keys(md.tools).length;
    if (md.hk === hk) return;   // 持つ物・読み込みが変わったときだけ
    TOOL_NAMES.forEach(n => [1, 2, 3].forEach(l => {
      const k = n + l;
      if (!md.tools[k]) {
        const holder = new B.TransformNode('hold_' + k, G.scene); holder.parent = arm;
        holder.position.set(0, pose.y, pose.z); holder.rotation.x = pose.rx;
        const cl = toolClones(n, l, holder); if (!cl) return;
        md.tools[k] = { holder, cl };
      }
      const t = md.tools[k], on = n === name && l === lv;
      t.cl.forEach(c => c.setEnabled(on));
    }));
    md.hk = name + lv + ':' + Object.keys(L.tool).length + ':' + Object.keys(md.tools).length;
  }

  /* ---------- 住民 ---------- */
  /* 住民は種類ごとの thin instance。近い人（peopleNear m 以内）は近く用（部品ごと。脚と腕が振れる）、遠い人は遠く用（部品をまとめた 1 つ）、
     GLB が無いあいだはコードの形。groups は { meshes, bufs, n, parts, piv } の一覧。pick(v, d2) でその人の入れ物を返し、write(g, 行列, 振り) で書く */
  const PE = { groups: [], code: [], near: [], far: [] };
  function mkGroup(meshes, max, parts, piv) {
    const bufs = meshes.map(() => new Float32Array(max * 16));
    const g = { meshes, mesh: meshes[0], bufs, n: 0, parts, piv };
    meshes.forEach((m, i) => {
      m.thinInstanceSetBuffer('matrix', bufs[i], 16, false); m.thinInstanceCount = 0;
      m.setEnabled(true); m.isVisible = true; m.alwaysSelectAsActiveMesh = true; m.isPickable = false; m.receiveShadows = true;
    });
    return g;
  }
  function peopleInit(max) {
    PE.max = max; PE.code = []; PE.near = [null, null, null]; PE.far = [null, null, null]; PE.groups = [];
    for (let v = 0; v < 4; v++) { const g = mkGroup([codeMesh('person' + v)], max); PE.code.push(g); PE.groups.push(g); }
    return PE.groups;
  }
  /* GLB の住民が届いたら入れ物を作る（3 種：a・b・c。4 色目はもう一度 a） */
  function peopleRefresh() {
    if (!PE.max) return;
    for (let k = 0; k < 3; k++) {
      const key = 'person_' + 'abc'[k], gl = L.chr[key];
      if (!gl) continue;
      if (gl.near && !PE.near[k] && L.key !== 'low') {
        const ms = PARTS.map(nm => partOf(gl.near, nm));
        if (ms.every(Boolean)) { const g = mkGroup(ms, PE.max, PARTS, gl.piv); PE.near[k] = g; PE.groups.push(g); }
      }
      if (gl.far && !PE.far[k]) {
        let ms = PARTS.map(nm => partOf(gl.far, nm)).filter(Boolean), merged = null;
        if (ms.length > 1) { try { merged = B.Mesh.MergeMeshes(ms, false, true, undefined, false, false); } catch (_) { merged = null; } }
        if (merged) { merged.name = key + '_farAll'; ms = [merged]; }
        if (ms.length) { const g = mkGroup(ms, PE.max, null, null); PE.far[k] = g; PE.groups.push(g); }
      }
    }
  }
  function peoplePick(v, d2) {
    const k = v % 3, n = PE.near[k], q = G.Q[L.key];
    if (n && q.peopleNear > 0 && d2 < q.peopleNear * q.peopleNear) return n;
    return PE.far[k] || PE.code[v];
  }
  const _tm = [new B.Matrix(), new B.Matrix(), new B.Matrix(), new B.Matrix()];
  /* 1 人書く。M は根の行列（足もと）。sw は脚の振り（ラジアン。0 で立ち）。腕は逆向きに脚の 0.8 倍 */
  function peopleWrite(g, M, sw, amp) {
    const i = g.n++;
    if (!g.parts) { for (let b = 0; b < g.bufs.length; b++) M.copyToArray(g.bufs[b], i * 16); return; }
    for (let b = 0; b < g.parts.length; b++) {
      const nm = g.parts[b], out = g.bufs[b];
      if (nm === 'body' || !sw) { M.copyToArray(out, i * 16); continue; }
      const p = g.piv[nm], a = (nm === 'legL' ? sw : nm === 'legR' ? -sw : nm === 'armL' ? -sw * 0.8 : sw * 0.8);
      B.Matrix.TranslationToRef(-p.x, -p.y, -p.z, _tm[0]);
      B.Matrix.RotationXToRef(a, _tm[1]);
      B.Matrix.TranslationToRef(p.x, p.y, p.z, _tm[2]);
      _tm[0].multiplyToRef(_tm[1], _tm[3]); _tm[3].multiplyToRef(_tm[2], _tm[1]); _tm[1].multiplyToRef(M, _tm[3]);
      _tm[3].copyToArray(out, i * 16);
    }
  }
  function peopleFlush() {
    PE.groups.forEach(g => g.meshes.forEach((m, b) => { m.thinInstanceCount = g.n; if (g.n) { m.thinInstanceBufferUpdated('matrix'); } }));
  }
  /* 脚の振りの大きさ（ラジアン）。スカートの女の人（b）は裾を突きぬけないよう小さめ */
  const SWING = [0.55, 0.3, 0.5];
  const swingOf = v => SWING[v % 3];

  /* 画質を「低」に下げたとき、使わない近く用の GLB（建物・人・道具・採れる物）を片づけてメモリを空ける。
     置いてある物は、先に repose で遠く用に置き直してある */
  function releaseNear() {
    if (MZ.player && MZ.player.releaseHands) MZ.player.releaseHands();
    const names = [], unlod = m => { while (m.getLODLevels().length) m.removeLODLevel(m.getLODLevels()[0].mesh); };   // 遠く用が次の元メッシュでも使えるよう、LOD の結びつきを外す
    Object.keys(L.glb).forEach(k => { const g = L.glb[k]; if (g.near) { g.near.forEach(m => { unlod(m); L.lodDone.delete(m); m.dispose(false, true); }); g.near = null; if (G.BUILD_MODELS[k]) names.push(G.BUILD_MODELS[k].near); if (L.pend) L.pend[k + ':n'] = false; } });
    Object.keys(L.chr).forEach(k => { const g = L.chr[k]; if (g.near) { g.near.forEach(m => m.dispose(false, true)); g.near = null; names.push('b_' + k); if (L.pend) L.pend[k + ':n'] = false; } });
    Object.keys(L.tool).forEach(k => { L.tool[k].forEach(m => m.dispose(false, true)); names.push('b_tool_' + k); if (L.pend) L.pend['t' + k] = false; delete L.tool[k]; });
    if (L.pl.near) { L.pl.near.dispose(false, false); L.pl.near = null; }
    if (PE.near) PE.near.forEach((g, i) => { if (g) { const j = PE.groups.indexOf(g); if (j >= 0) PE.groups.splice(j, 1); PE.near[i] = null; } });
    names.forEach(n => A.forget2(n));
  }


  /* 画質を中 → 高に上げたとき、共通の写真（法線が 512 だった物）を使う近く用（建物・道具）を、高の写真で読み直す。
     新しい物が届いてから入れかえる（そのあいだは今の物のまま）。高 → 中はそのまま（高の写真のままで困らない） */
  function reloadBtex() {
    const users = G.BTEX_USERS || [];
    Object.keys(L.glb).forEach(k => {
      const g = L.glb[k], d = G.BUILD_MODELS[k];
      if (!g.near || !d || users.indexOf(d.near) < 0) return;
      A.forget2(d.near);
      A.model(d.near).then(m => {
        fixFoot(m, k, d.fix); m.forEach(x => { if (G.post) G.post.addCaster(x); });
        const old = g.near;
        old.forEach(x => { while (x.getLODLevels().length) x.removeLODLevel(x.getLODLevels()[0].mesh); L.lodDone.delete(x); });   // 遠く用との結びつきを先に外す
        g.near = m; repose();
        old.forEach(x => x.dispose(false, true));
      }, () => { /* 読めなければ今の物のまま */ });
    });
    Object.keys(L.tool).forEach(k => {
      const n = 'b_tool_' + k;
      if (users.indexOf(n) < 0) return;
      A.forget2(n);
      A.model(n).then(ms => {
        ms.forEach(m => { m.receiveShadows = false; });
        const old = L.tool[k]; L.tool[k] = ms;
        /* 手の道具・三人称の主人公が持つ複製は、古い材質を指しているので作り直す */
        if (MZ.player && MZ.player.releaseHands) MZ.player.releaseHands();
        if (L.pl.near) { L.pl.near.dispose(false, false); L.pl.near = null; }
        old.forEach(m => m.dispose(false, true));
        if (G.looks && G.looks.onPlayer) G.looks.onPlayer();
      }, () => { /* 今の物のまま */ });
    });
  }

  /* ---------- 読み込みの入口：画質が決まったとき・変わったとき ---------- */
  function applyChars() {
    ['player', 'person_a', 'person_b', 'person_c'].forEach(k => { loadChar(k, 'near'); loadChar(k, 'far'); });
    loadTools();
    peopleRefresh();
  }

  G.look = look; G.put = put; G.preview = preview; G.setPreviewOk = setPreviewOk; G.repose = repose;
  G.looks = { apply, releaseNear, reloadBtex, state: L, loadBuild, playerModel, holdTool, toolClones, onPlayer: null };
  G.people = { init: peopleInit, refresh: peopleRefresh, pick: peoplePick, write: peopleWrite, flush: peopleFlush, swing: swingOf, state: PE, get groups() { return PE.groups; } };
})();

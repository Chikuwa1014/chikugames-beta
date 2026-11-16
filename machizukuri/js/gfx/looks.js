/* 荒野開拓記（仮） — 描画の層：建物・人・道具の見た目の受け皿
   - MZ.gfx.look(種類)    … { src: 'glb' | 'code', lod: [{ meshes, dist }] }。GLB があれば GLB、無い・読めないときは MZ.getModel（今のコードの形）。
   - MZ.gfx.put(種類, x, z, 回転) … 置いた物を返す。.dispose() で消える。建物は 3 段：近く用（主人公に近い nearMax 軒だけ。「近くの建物の係」nearTick が 0.5 秒に 1 回選ぶ）→ 遠く用 → 最遠（xfarDist m から）→ bldFar m で見えなくなる。切りかえは近くの建物の係が自分でする（Babylon の LOD は使わない）。
   - MZ.gfx.preview(種類) … 緑と赤の見本（遠く用の部品を複製して、見本の材質にする）。
   - MZ.gfx.people        … 住民の thin instance の入れ物（近い人だけ近く用）。
   モデルは 1 つずつ足せる：assets/models/ にファイルを置き、assets.js の MANIFEST と BUILD_MODELS に 1 行足すだけ（コードの側は何も変えない。
   BUILD_MODELS に 1 行足すと、その種類は GLB に切りかわる）。
   当たりは今までどおりマスの表（solid）。モデルに当たりの形は要らない。 */
(function () {
  const MZ = window.MZ, B = BABYLON, G = MZ.gfx, T = MZ.T, A = G.assets;
  const L = { glb: {}, chr: {}, tool: {}, pl: { near: null, far: null }, objs: new Set(), lodDone: new Map(), pv: null, pvKey: '', pvOk: null, pvBad: null, key: 'low' };

  /* ---------- 見た目（look） ---------- */
  function codeMesh(key) { return MZ.getModel(key); }
  /* 種類 → { src, key, base, xfar, near }。
     base ＝ いつも置く物（高・中は遠く用、低は最遠。GLB が無い・読めないときはコードの形）。xfar ＝ base に LOD でつなぐ最遠（遠く用と別の物があるときだけ）。
     near ＝ 近くの建物の係が置く近く用（低・GLB 無しは null） */
  function look(key) {
    const g = L.glb[key] || {}, q = G.Q[L.key], has = a => !!(a && a.length);
    const sep = !!((G.BUILD_MODELS[key] || {}).xfar && G.BUILD_MODELS[key].xfar !== G.BUILD_MODELS[key].far), gx = sep ? g.xfar : g.far;
    let base = null, xfar = null;
    if (L.key === 'low') base = has(gx) ? gx : null;
    else {
      base = has(g.far) ? g.far : (has(gx) ? gx : null);
      if (base && sep && has(gx) && gx !== base) xfar = gx;
    }
    const near = (L.key !== 'low' && q.nearMax > 0 && has(g.near) && q.models.indexOf('buildings') >= 0) ? g.near : null;
    if (!base) return { src: 'code', key, base: [codeMesh(key)], xfar: null, near: null };
    return { src: 'glb', key, base, xfar, near };
  }
  /* 近く用に切りかえる距離（m）。予算で縮めた分（G.dyn.houseCut）だけ近くなる。BUILD_MODELS の lod（大きい建物）は、その分だけ縮める */
  function nearDist(key) {
    const q = G.Q[L.key], cut = G.dyn ? G.dyn.houseCut : 0, d = (G.BUILD_MODELS[key] || {}).lod || 0;
    return Math.max(q.houseNear - cut, d ? d - cut : 0);
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
  /* 種類ごとに GLB を読む（読めなかったら何もしない＝コードの形のまま）。低は最遠だけ、高・中は近く用・遠く用・最遠 */
  function loadBuild(key) {
    const d = G.BUILD_MODELS[key];
    if (!d) return;
    const g = L.glb[key] = L.glb[key] || { near: null, far: null, xfar: null };
    L.pend = L.pend || {};
    const low = L.key === 'low', todo = [];
    const one = (slot, name, caster, after) => {
      const pk = key + ':' + slot;
      if (g[slot] || !name || L.pend[pk]) return;
      L.pend[pk] = true;
      todo.push(A.model(name).then(m => { fixFoot(m, key, d.fix); if (caster) m.forEach(x => { if (G.post) G.post.addCaster(x); }); g[slot] = m; if (after) after(); }).then(repose, () => { /* コードの形のまま。画質を変えたとき、読み直せるように印をもどす */ L.pend[pk] = false; }));
    };
    const sep = !!(d.xfar && d.xfar !== d.far);   // 最遠のファイルが遠く用と別にあるか（無ければ遠く用を最遠にも使う）
    if (!low) one('near', d.near, true, () => { if (L.key === 'low') releaseNear(); });
    if (!low || !sep) one('far', d.far, true);
    if (sep) one('xfar', d.xfar, true);
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
  /* 建物は 4 つの姿を、近くの建物の係（nearTick。0.5 秒に 1 回）が切りかえる：近く用（近い nearMax 軒）→ 遠く用（いつも置く）→ 最遠（xfarDist m から）→ 見えない（bldFar m から）。
     Babylon の LOD（addLODLevel）は使わない：インスタンスの LOD の先のメッシュが描かれなかったため（試験で確かめた）。切りかえは各インスタンスの有効・無効と、近く用・最遠のインスタンスを作る・片づけるで行う。 */
  function put(key, x, z, ry, bid) {
    const obj = { key, x, z, ry, bid, inst: [], near: [], xf: [], mode: 'far', nearOn: false, fx: null, smoke: null };
    const mk = (m, i, tag) => {
      m.receiveShadows = true;   // 影を受けるかは元のメッシュで決まる（インスタンスでは効かない）
      const inst = m.createInstance(key + tag + Math.round(x) + '_' + Math.round(z) + '_' + i);
      inst.position.set(x, 0, z); inst.rotation.y = ry;
      inst.isPickable = false;
      inst.freezeWorldMatrix();   // 動かない物なので、行列を固定する
      return inst;
    };
    const drop = a => { a.forEach(i => i.dispose()); a.length = 0; };
    obj.build = function () {
      drop(obj.inst); drop(obj.near); drop(obj.xf); obj.nearOn = false; obj.mode = 'far';
      if (MZ.BUILDS[key].road) return;   // 道（土の道・石畳の道。road の欄がある建物）は、どの画質でもメッシュを置かず、地面のマスの表で描く
      look(key).base.forEach((m, i) => obj.inst.push(mk(m, i, '_')));
      L.nacc = 9;   // 近くの建物の係を、次のフレームで回す
    };
    /* いまの姿を、near・mode から決めて、有効・無効を直す */
    obj.show = function () {
      const nearV = obj.nearOn, xfarV = !nearV && obj.mode === 'xfar' && obj.xf.length > 0, farV = !nearV && !xfarV && obj.mode !== 'cull';
      obj.inst.forEach(i => i.setEnabled(farV)); obj.xf.forEach(i => i.setEnabled(xfarV)); obj.near.forEach(i => i.setEnabled(nearV));
    };
    /* 近く用に切りかえる・もどす */
    obj.setNear = function (on) {
      if (on === obj.nearOn) return true;
      if (on) {
        const lk = look(key); if (!lk.near) return false;
        obj.near = lk.near.map((m, i) => mk(m, i, '_n'));
      } else drop(obj.near);
      obj.nearOn = on; obj.show(); return true;
    };
    /* 遠く用・最遠・見えないを切りかえる（d は主人公からの距離） */
    obj.setMode = function (mode) {
      if (mode === obj.mode) return;
      if (mode === 'xfar' && !obj.xf.length) { const lk = look(key); if (!lk.xfar) mode = 'far'; else obj.xf = lk.xfar.map((m, i) => mk(m, i, '_x')); }
      obj.mode = mode; obj.show();
    };
    obj.dispose = function () {
      drop(obj.inst); drop(obj.near); drop(obj.xf); obj.nearOn = false;
      if (obj.fx) { G.fire.remove(obj.fx); obj.fx = null; }
      if (obj.smoke) { G.fire.removeSmoke(obj.smoke); obj.smoke = null; }
      L.objs.delete(obj);
    };
    obj.build();
    if (key === 'fire') obj.fx = G.fire.add(x, z);
    if (MZ.BUILDS[key].smoke) obj.smoke = G.fire.addSmoke(obj);   // 煙を出す建物（工房。仕事場が動いているときだけ。近い順に 4 つまで）
    L.objs.add(obj);
    return obj;
  }
  /* 画質・読み込みが変わったとき、置いた物を置き直す（ゲームの状態は触らない） */
  function repose() { L.objs.forEach(o => o.build()); }

  /* 近くの建物の係：0.5 秒に 1 回、(1) 主人公からの距離で 遠く用／最遠／見えない を決め（境は 3m の余裕をもたせる）、(2) 近く用の距離以内の建物を近い順に並べ、上位 nearMax 軒だけに近く用を置く（遠く用は隠す）。
     はずれた建物は近く用を片づけて遠く用にもどす。近く用を置くのは 1 回に 2 軒まで（ちらつき・かたまりを防ぐ）。force が true なら、数をかぎらず今すぐ（試験用） */
  const _cand = [];
  function nearTick(dt, force) {
    L.nacc += dt;
    if (!force && L.nacc < 0.5) return;
    L.nacc = 0;
    const q = G.Q[L.key], st = MZ.state && MZ.state.player;
    if (!st) return;
    const useNear = L.key !== 'low' && q.nearMax > 0;
    _cand.length = 0;
    L.objs.forEach(o => {
      if (!o.inst.length) return;
      const dx = o.x - st.x, dz = o.z - st.z, d2 = dx * dx + dz * dz, d = Math.sqrt(d2);
      const out = q.bldFar + (o.mode === 'cull' ? -3 : 0), xo = q.xfarDist + (o.mode === 'xfar' ? -3 : 0);
      o.setMode(d > out ? 'cull' : (q.xfarDist && d > xo) ? 'xfar' : 'far');
      const g = L.glb[o.key];
      if (!useNear || !g || !g.near || o.mode === 'cull') { if (o.nearOn) o.setNear(false); return; }
      const nd = nearDist(o.key) + (o.nearOn ? 2 : 0);
      if (d2 <= nd * nd) { o.d2 = d2; _cand.push(o); }
      else if (o.nearOn) o.setNear(false);
    });
    _cand.sort((a, b) => a.d2 - b.d2);
    for (let i = q.nearMax; i < _cand.length; i++) if (_cand[i].nearOn) _cand[i].setNear(false);
    let add = force ? 1e9 : 2;
    for (let i = 0; i < _cand.length && i < q.nearMax && add > 0; i++) if (!_cand[i].nearOn && _cand[i].setNear(true)) add--;
  }
  L.nacc = 0;
  /* 煙の出る位置（世界の座標）。GLB の空ノード smoke（近く用か遠く用）があればその位置、無ければ（コードの形も）既定の位置を、建物の向きで回して足す */
  const SMOKE0 = new B.Vector3(-1.48, 5.5, 0.3);   // 左手系（Babylon）に直した GLB の値（glTF の [1.48, 5.5, 0.3] は x が反対向きになる）。GLB が読めたらその空ノードの値を使う。コードの形の煙突も同じ位置
  const _sm = new B.Matrix();
  function smokePos(obj, out) {
    const g = L.glb[obj.key] || {}, mk = (g.near && g.near.marks && g.near.marks.smoke) || (g.far && g.far.marks && g.far.marks.smoke) || SMOKE0;
    B.Matrix.RotationYToRef(obj.ry, _sm);
    B.Vector3.TransformCoordinatesToRef(mk, _sm, out);
    out.x += obj.x; out.z += obj.z;
    return out;
  }
  /* 近く用で描いている建物の数（試験・MZ.stats 用） */
  function nearCount() { let n = 0; L.objs.forEach(o => { if (o.nearOn) n++; }); return n; }

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
      srcs = look(key).base;   // いつも置く物（遠く用）の部品を複製
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
    Object.keys(L.glb).forEach(k => { const g = L.glb[k]; if (g.near) { g.near.forEach(m => { unlod(m); L.lodDone.delete(m); m.dispose(false, true); }); g.near = null; if (G.BUILD_MODELS[k]) names.push(G.BUILD_MODELS[k].near); if (L.pend) L.pend[k + ':near'] = false; } });
    L.objs.forEach(o => { if (o.nearOn) { o.near = []; o.nearOn = false; o.show(); } });
    Object.keys(L.chr).forEach(k => { const g = L.chr[k]; if (g.near) { g.near.forEach(m => m.dispose(false, true)); g.near = null; names.push('b_' + k); if (L.pend) L.pend[k + ':n'] = false; } });
    Object.keys(L.tool).forEach(k => { L.tool[k].forEach(m => m.dispose(false, true)); names.push('b_tool_' + k); if (L.pend) L.pend['t' + k] = false; delete L.tool[k]; });
    if (L.pl.near) { L.pl.near.dispose(false, false); L.pl.near = null; }
    if (PE.near) PE.near.forEach((g, i) => { if (g) { const j = PE.groups.indexOf(g); if (j >= 0) PE.groups.splice(j, 1); PE.near[i] = null; } });
    names.forEach(n => A.forget2(n));
  }


  /* 画質を中 → 高に上げたとき、共通の写真（法線が 512 だった物）を使う近く用の建物を、高の写真で読み直す。
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
    /* 道具の写真は高でも中でも 512 で同じなので、読み直さない（手の道具がちらつくだけ） */
  }

  /* ---------- 読み込みの入口：画質が決まったとき・変わったとき ---------- */
  function applyChars() {
    ['player', 'person_a', 'person_b', 'person_c'].forEach(k => { loadChar(k, 'near'); loadChar(k, 'far'); });
    loadTools();
    peopleRefresh();
  }

  G.look = look; G.put = put; G.preview = preview; G.setPreviewOk = setPreviewOk; G.repose = repose;
  G.looks = { apply, releaseNear, reloadBtex, state: L, loadBuild, nearTick, nearCount, nearDist, smokePos, playerModel, holdTool, toolClones, onPlayer: null };
  G.people = { init: peopleInit, refresh: peopleRefresh, pick: peoplePick, write: peopleWrite, flush: peopleFlush, swing: swingOf, state: PE, get groups() { return PE.groups; } };
})();

/* 荒野開拓記（仮） — モデル（見た目）
   いまは箱・円柱・球・三角柱を組み合わせたローポリを、コードで作っている。
   ゆくゆくハイポリにするときは、ここの MZ.models の関数の中身を、読み込んだ 3D モデル（glTF など）に
   差し替えるだけでよい作りにしてある。ゲーム側は MZ.getModel(種類の名前) だけを使い、作り方を知らない。

   【どのモデルも守る約束】
   - 足もとが y=0、建物の中心が原点、正面は -z（人と主人公は +z）、1 単位 = 1m
   - 部品ごとの色は頂点カラーに入れ、材質は全体で 1 つ（MZ.modelMat）にして 1 つのメッシュにまとめる（描く呼び出しを減らすため）
   - 返すのは「元のメッシュ」（非表示）。ゲーム側が createInstance か thinInstance で並べる
   - 例外：player は手足を動かすので TransformNode（根）を返す。根の metadata.parts に legL・legR・armL・armR がある */
(function () {
  const MZ = window.MZ, B = BABYLON;
  let S = null, MAT = null;
  const colorCache = {};

  function col(hex) {
    if (!colorCache[hex]) { const c = B.Color3.FromHexString(hex); colorCache[hex] = [c.r, c.g, c.b]; }
    return colorCache[hex];
  }
  /* 頂点カラーを入れる */
  function paint(m, hex) {
    const n = m.getTotalVertices(), c = col(hex), a = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { a[i * 4] = c[0]; a[i * 4 + 1] = c[1]; a[i * 4 + 2] = c[2]; a[i * 4 + 3] = 1; }
    m.setVerticesData(B.VertexBuffer.ColorKind, a);
    return m;
  }
  function box(w, h, d, x, y, z, c, ry) {
    const m = B.MeshBuilder.CreateBox('', { width: w, height: h, depth: d }, S);
    m.position.set(x, y, z); if (ry) m.rotation.y = ry; return paint(m, c);
  }
  function cyl(dt, db, h, x, y, z, c, tess) {
    const m = B.MeshBuilder.CreateCylinder('', { diameterTop: dt, diameterBottom: db, height: h, tessellation: tess || 8 }, S);
    m.position.set(x, y, z); return paint(m, c);
  }
  function sph(d, x, y, z, c, sy, seg) {
    const m = B.MeshBuilder.CreateSphere('', { diameter: d, segments: seg || 4 }, S);
    m.position.set(x, y, z); m.scaling.y = sy || 1; return paint(m, c);
  }
  /* 三角柱の屋根（x 方向に長い。底が y=0 から、棟が高さ h） */
  function prism(len, wid, h, x, y, z, c) {
    const L = len / 2, W = wid / 2, pos = [], nor = [], idx = [];
    const face = (vs, n) => { const o = pos.length / 3; vs.forEach(v => { pos.push(v[0], v[1], v[2]); nor.push(n[0], n[1], n[2]); }); for (let i = 1; i < vs.length - 1; i++) idx.push(o, o + i, o + i + 1); };
    const k = Math.hypot(W, h);
    face([[-L, 0, -W], [L, 0, -W], [L, h, 0], [-L, h, 0]], [0, W / k, -h / k]);
    face([[L, 0, W], [-L, 0, W], [-L, h, 0], [L, h, 0]], [0, W / k, h / k]);
    face([[L, 0, -W], [L, 0, W], [L, h, 0]], [1, 0, 0]);
    face([[-L, 0, W], [-L, 0, -W], [-L, h, 0]], [-1, 0, 0]);
    const m = new B.Mesh('', S), vd = new B.VertexData();
    vd.positions = pos; vd.normals = nor; vd.indices = idx; vd.uvs = new Array(pos.length / 3 * 2).fill(0); vd.applyToMesh(m);
    m.position.set(x, y, z); return paint(m, c);
  }
  function merge(name, parts) {
    const m = B.Mesh.MergeMeshes(parts, true, true, undefined, false, false);
    m.name = name; m.material = MAT; m.isPickable = false; m.isVisible = false;
    return m;
  }

  /* 人の部品（身長 1.7m）。cl：服の色、pt：ズボンの色、sk：肌、hr：髪 */
  function humanParts(o) {
    return {
      body: [box(0.44, 0.62, 0.26, 0, 1.1, 0, o.cl), box(0.46, 0.1, 0.28, 0, 0.82, 0, o.belt || '#3A2A1C'),
        cyl(0.1, 0.12, 0.08, 0, 1.45, 0, o.sk, 6), sph(0.24, 0, 1.58, 0, o.sk, 1.1, 5),
        sph(0.27, 0, 1.64, -0.015, o.hr, 0.8, 5), box(0.05, 0.05, 0.03, -0.05, 1.58, 0.115, '#2A1B10'), box(0.05, 0.05, 0.03, 0.05, 1.58, 0.115, '#2A1B10')],
      /* 手足は使うときに作る（作って使わないと、原点で描かれ続けるため） */
      leg: () => [box(0.17, 0.78, 0.2, 0, -0.39, 0, o.pt), box(0.18, 0.1, 0.27, 0, -0.75, 0.03, '#2B2018')],
      arm: () => [box(0.13, 0.55, 0.15, 0, -0.27, 0, o.cl), box(0.12, 0.12, 0.13, 0, -0.6, 0, o.sk)]
    };
  }

  MZ.models = {};
  const M = MZ.models;

  /* 採れる物 */
  M.tree = () => merge('tree', [
    cyl(0.32, 0.5, 2.2, 0, 1.1, 0, '#5E4228', 6),
    cyl(0, 2.6, 2.6, 0, 3.0, 0, '#35683A', 7), cyl(0, 1.9, 2.0, 0, 4.4, 0, '#437A45', 7)]);
  M.tree2 = () => merge('tree2', [
    cyl(0.28, 0.42, 1.8, 0, 0.9, 0, '#6A4A2E', 6),
    sph(2.4, 0, 2.7, 0, '#4E7A3C', 0.9, 4), sph(1.6, 0.5, 3.6, 0.2, '#5B8A44', 0.9, 4), sph(1.3, -0.5, 2.3, 0.4, '#456E36', 0.9, 4)]);
  M.bush = () => merge('bush', [sph(1.2, 0, 0.4, 0, '#7A8F45', 0.7), sph(0.8, 0.5, 0.3, 0.2, '#8C9F55', 0.7), sph(0.6, -0.4, 0.25, -0.3, '#6E8340', 0.7)]);
  M.stone = () => merge('stone', [sph(0.55, 0, 0.14, 0, '#9C988E', 0.6, 3), sph(0.3, 0.3, 0.08, 0.1, '#8A867C', 0.6, 3)]);
  M.rock = () => merge('rock', [sph(1.7, 0, 0.6, 0, '#85817A', 0.8, 3), sph(1.0, 0.7, 0.35, 0.3, '#938F86', 0.8, 3)]);
  M.clay = () => merge('clay', [cyl(1.4, 1.7, 0.24, 0, 0.12, 0, '#A9684A', 9), sph(0.6, 0.2, 0.28, 0.1, '#BC785A', 0.6, 3)]);
  M.iron = () => merge('iron', [
    sph(1.8, 0, 0.65, 0, '#5A5755', 0.85, 3),
    box(0.3, 0.3, 0.3, 0.5, 0.9, 0.3, '#A86A42', 0.5), box(0.26, 0.26, 0.26, -0.45, 0.7, 0.5, '#A86A42', 0.2), box(0.24, 0.24, 0.24, 0.1, 1.0, -0.5, '#B77A50', 0.9)]);
  M.post = () => merge('post', [box(0.16, 1.1, 0.16, 0, 0.55, 0, '#6F5435'), box(0.1, 0.1, 1.9, 0, 0.9, 0.95, '#7C6140')]);

  /* 建物（原点が建物の中心。正面は -z。w マス四方に収まる） */
  M.hut = () => merge('hut', [
    box(3.2, 2.0, 2.8, 0, 1.0, 0, '#8A6C4A'), prism(3.7, 3.5, 1.3, 0, 2.0, 0, '#4F3C2A'),
    box(0.8, 1.5, 0.1, 0, 0.75, -1.42, '#43301F'), box(0.5, 0.5, 0.06, 1.0, 1.3, -1.42, '#6F8A96'),
    box(0.3, 0.9, 0.3, 1.2, 0.45, -1.8, '#6F6B62'), box(0.9, 0.3, 0.4, -1.1, 0.15, -1.8, '#86683F')]);
  M.house = () => merge('house', [
    box(3.4, 2.3, 3.0, 0, 1.15, 0, '#C4A272'), prism(3.9, 3.7, 1.5, 0, 2.3, 0, '#8E4A36'),
    box(0.8, 1.6, 0.1, -0.6, 0.8, -1.52, '#5E3E22'), box(0.8, 0.7, 0.1, 0.8, 1.4, -1.52, '#6F8A96'),
    box(0.4, 1.0, 0.4, 1.0, 3.2, 0.6, '#7A7268')]);
  M.bhouse = () => merge('bhouse', [
    box(3.5, 4.2, 3.2, 0, 2.1, 0, '#A5503A'), box(3.8, 0.25, 3.5, 0, 4.3, 0, '#4F4842'),
    box(0.9, 1.7, 0.1, 0, 0.85, -1.62, '#43301F'),
    box(0.7, 0.7, 0.1, -1.0, 1.5, -1.62, '#6F8A96'), box(0.7, 0.7, 0.1, 1.0, 1.5, -1.62, '#6F8A96'),
    box(0.7, 0.7, 0.1, -1.0, 3.2, -1.62, '#6F8A96'), box(0.7, 0.7, 0.1, 0, 3.2, -1.62, '#6F8A96'), box(0.7, 0.7, 0.1, 1.0, 3.2, -1.62, '#6F8A96')]);
  M.fire = () => merge('fire', [
    cyl(1.1, 1.2, 0.16, 0, 0.08, 0, '#77726A', 8),
    box(0.9, 0.16, 0.16, 0, 0.22, 0, '#4F3620', 0.6), box(0.9, 0.16, 0.16, 0, 0.22, 0, '#4F3620', -0.8),
    cyl(0, 0.55, 0.8, 0, 0.62, 0, '#E8812E', 6), cyl(0, 0.3, 0.5, 0.05, 0.5, 0.05, '#F6C650', 5)]);
  M.bench = () => merge('bench', [
    box(1.5, 0.12, 0.9, 0, 0.86, 0, '#A98050'),
    box(0.12, 0.8, 0.12, -0.65, 0.4, -0.35, '#6F5232'), box(0.12, 0.8, 0.12, 0.65, 0.4, -0.35, '#6F5232'),
    box(0.12, 0.8, 0.12, -0.65, 0.4, 0.35, '#6F5232'), box(0.12, 0.8, 0.12, 0.65, 0.4, 0.35, '#6F5232'),
    box(0.5, 0.1, 0.12, 0.3, 0.97, 0.1, '#7F7B73', 0.5), box(0.3, 0.2, 0.3, -0.4, 1.02, 0, '#5E4228')]);
  M.kiln = () => merge('kiln', [
    cyl(1.3, 1.6, 1.4, 0, 0.7, 0, '#96503A', 8), cyl(0.4, 0.5, 0.8, 0, 1.8, 0, '#74402F', 6),
    box(0.5, 0.5, 0.1, 0, 0.45, -0.76, '#241510'), box(0.3, 0.25, 0.05, 0, 0.36, -0.8, '#C2561F')]);
  M.furnace = () => merge('furnace', [
    box(1.5, 1.4, 1.4, 0, 0.7, 0, '#9B5039'), box(1.6, 0.12, 1.5, 0, 1.46, 0, '#6F6B62'),
    box(0.5, 1.3, 0.5, 0.35, 2.05, 0.3, '#8A4733'), box(0.6, 0.1, 0.6, 0.35, 2.75, 0.3, '#5A4A40'),
    box(0.6, 0.55, 0.1, 0, 0.5, -0.72, '#2A0F0C'), box(0.4, 0.3, 0.05, 0, 0.42, -0.76, '#B8401C')]);
  M.road = () => merge('road', [box(2, 0.06, 2, 0, 0.03, 0, '#92795A'), box(1.5, 0.02, 1.5, 0, 0.065, 0, '#9E8566')]);
  M.well = () => merge('well', [
    cyl(1.3, 1.3, 0.7, 0, 0.35, 0, '#86827A', 10), cyl(1.0, 1.0, 0.05, 0, 0.7, 0, '#3E6E8C', 10),
    box(0.12, 1.5, 0.12, -0.6, 1.1, 0, '#6F5232'), box(0.12, 1.5, 0.12, 0.6, 1.1, 0, '#6F5232'), prism(1.8, 1.1, 0.5, 0, 1.85, 0, '#8E4A36')]);
  M.field = () => {
    const rows = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) rows.push(box(0.3, 0.35, 0.3, -1.35 + i * 0.9, 0.25, -1.4 + j * 0.7, '#5E9440'));
    return merge('field', [box(3.8, 0.1, 3.8, 0, 0.05, 0, '#5E4228')].concat(rows));
  };
  M.lumber = () => {
    const logs = [];
    for (let i = 0; i < 3; i++) { const l = cyl(0.35, 0.35, 1.6, 1.0, 0.2 + (i === 2 ? 0.3 : 0), -1.4 - (i === 2 ? 0.2 : i * 0.4), '#7C5A34', 6); l.rotation.z = Math.PI / 2; logs.push(l); }
    return merge('lumber', [box(3.2, 2.0, 2.2, 0, 1.0, 0.4, '#725434'), prism(3.7, 3.0, 1.2, 0, 2.0, 0.4, '#3F5A34'), box(0.8, 1.5, 0.1, -0.7, 0.75, -0.72, '#43301F')].concat(logs));
  };

  /* 住民（静止の姿。服の色ちがいが 4 種類） */
  const PEOPLE = [['#7A6A50', '#3E4A5C', '#E2B896', '#3A2A1C'], ['#5C7A5C', '#4A3A2E', '#D9AD8A', '#5A3A22'], ['#9A5A4A', '#33404E', '#E8C2A0', '#1F1812'], ['#4E6A8E', '#5A4A38', '#C99A78', '#6A4A2A']];
  PEOPLE.forEach((p, i) => {
    M['person' + i] = () => {
      const h = humanParts({ cl: p[0], pt: p[1], sk: p[2], hr: p[3] });
      const legs = [box(0.17, 0.78, 0.2, -0.1, 0.39, 0, p[1]), box(0.17, 0.78, 0.2, 0.1, 0.39, 0, p[1]), box(0.18, 0.1, 0.27, -0.1, 0.05, 0.03, '#2B2018'), box(0.18, 0.1, 0.27, 0.1, 0.05, 0.03, '#2B2018')];
      const arms = [box(0.13, 0.55, 0.15, -0.29, 1.1, 0, p[0]), box(0.13, 0.55, 0.15, 0.29, 1.1, 0, p[0]), box(0.12, 0.12, 0.13, -0.29, 0.78, 0, p[2]), box(0.12, 0.12, 0.13, 0.29, 0.78, 0, p[2])];
      return merge('person' + i, h.body.concat(legs, arms));
    };
  });

  /* 主人公（作業着の茶・紺）。手足は TransformNode ごとに回す。正面は +z */
  M.player = () => {
    const h = humanParts({ cl: '#8A6A44', pt: '#2F3E56', sk: '#E0B48E', hr: '#3A2616', belt: '#241A12' });
    const root = new B.TransformNode('player', S);
    const body = merge('playerBody', h.body.concat([box(0.5, 0.06, 0.3, 0, 1.58 + 0.1, 0, '#6B5638')]));
    body.parent = root; body.isVisible = true;
    const limb = (name, parts, x, y, z) => {
      const piv = new B.TransformNode(name, S); piv.parent = root; piv.position.set(x, y, z);
      const m = merge(name + 'M', parts); m.parent = piv; m.isVisible = true; return piv;
    };
    root.metadata = {
      parts: {
        legL: limb('legL', h.leg(), -0.1, 0.8, 0),
        legR: limb('legR', [box(0.17, 0.78, 0.2, 0, -0.39, 0, '#2F3E56'), box(0.18, 0.1, 0.27, 0, -0.75, 0.03, '#2B2018')], 0.1, 0.8, 0),
        armL: limb('armL', h.arm(), -0.29, 1.38, 0),
        armR: limb('armR', [box(0.13, 0.55, 0.15, 0, -0.27, 0, '#8A6A44'), box(0.12, 0.12, 0.13, 0, -0.6, 0, '#E0B48E')], 0.29, 1.38, 0)
      }
    };
    return root;
  };

  /* 手に持つ道具（一人称でカメラの右下に出す。長さ 約 0.6m、持ち手の端が原点、上へのびる） */
  M.axeHand = () => merge('axeHand', [box(0.05, 0.6, 0.05, 0, 0.3, 0, '#7A5A36'), box(0.3, 0.14, 0.04, 0.12, 0.56, 0, '#8E8A82'), box(0.06, 0.2, 0.05, -0.02, 0.56, 0, '#6F6B62')]);
  M.pickHand = () => merge('pickHand', [box(0.05, 0.6, 0.05, 0, 0.3, 0, '#7A5A36'), box(0.5, 0.06, 0.05, 0, 0.58, 0, '#8E8A82'), box(0.06, 0.12, 0.05, 0.25, 0.54, 0, '#8E8A82'), box(0.06, 0.12, 0.05, -0.25, 0.54, 0, '#8E8A82')]);

  /* 初期化：場面（Scene）を渡す。材質は全体で 1 つ */
  MZ.initModels = function (scene) {
    S = scene;
    MAT = new B.StandardMaterial('modelMat', S);
    MAT.diffuseColor = new B.Color3(1, 1, 1);
    MAT.specularColor = new B.Color3(0, 0, 0);
    MAT.backFaceCulling = false;
    MZ.modelMat = MAT;
    MZ.modelCache = {};
  };
  /* 1 回だけ作って使い回す */
  MZ.getModel = function (key) {
    if (!MZ.modelCache[key]) {
      if (!MZ.models[key]) throw new Error('モデルがありません: ' + key);
      const m = MZ.models[key]();
      MZ.modelCache[key] = m;
    }
    return MZ.modelCache[key];
  };
})();

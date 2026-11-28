/* 荒野開拓記（仮） β0.4.0 区切り 0：重い場面（9 区画・建物 260 軒・人口 1000）の三角形と計算の重さを測る（dev フォルダは .assetsignore で公開されない）
   使い方：リポジトリ直下で `python3 -m http.server 8000` を動かしてから
     NODE_PATH=$(npm root -g) node machizukuri/dev/heavy-b040.cjs [--only high|mid|low] [--out 結果の json]
   ゲームのコード（js/）は変えない。集合住宅（仮）は、この中で MZ.BUILDS・建物の見た目の受け皿（MZ.gfx.looks.state.glb）に一時的に足す：
     4×4 マス・高さ 13m の箱。近く用＝細かく割った箱（約 3 万三角形）、遠く用＝1,200、最遠＝432。
   「案のとき」は、要件 7 章の案を、この中で数値を一時的に変えて再現する：
     近く用を三角形の合計で数える（高 16 万・中 8 万。近い順に足し、こえる分は遠く用）、最遠 45m（高・中）、
     草の予算 高 35 万・中 12 万（低はそのまま。草の数 Q.grass で配り直す。建物の予算は上限の中で決まるので、近く用の合計で表す）。
   測るのは描かずに（描画ループを止めて）、三角形・予算の手順のあとの段・町の仕事の時間。swiftshader で高の 1 フレームが数十秒かかるため。 */
const { chromium } = require('playwright');
const fs = require('fs');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const ONLY = arg('only', ''), OUTJ = arg('out', '');
const URL = process.env.URL || 'http://localhost:8000/machizukuri/';

/* ページの中：集合住宅（仮）と重い場面を作る */
const SETUP = () => {
  const B = BABYLON, G = MZ.gfx, s = MZ.state, W = MZ.world, L = G.looks.state;
  MZ.noSave = true;
  W.engine.stopRenderLoop();   // 測るだけなので描かない
  /* 集合住宅（仮）：w 4・高さ 13m の箱（面を細かく割る） */
  const box = (name, n) => {
    const w = 8, h = 13, parts = [], mt = G.aptMat = G.aptMat || (() => { const m = new B.StandardMaterial('aptMat', G.scene); m.diffuseColor = new B.Color3(0.6, 0.55, 0.5); return m; })();
    const face = (rx, ry, rz, tx, ty, tz, ww, hh) => {
      const g = B.MeshBuilder.CreateGround(name + 'f', { width: ww, height: hh, subdivisions: n }, G.scene);
      g.bakeTransformIntoVertices(B.Matrix.RotationYawPitchRoll(ry, rx, rz).multiply(B.Matrix.Translation(tx, ty, tz)));
      parts.push(g);
    };
    face(0, 0, 0, 0, h, 0, w, w); face(Math.PI, 0, 0, 0, 0, 0, w, w);
    face(Math.PI / 2, 0, 0, 0, h / 2, w / 2, w, h); face(-Math.PI / 2, 0, 0, 0, h / 2, -w / 2, w, h);
    face(0, 0, Math.PI / 2, w / 2, h / 2, 0, h, w); face(0, 0, -Math.PI / 2, -w / 2, h / 2, 0, h, w);
    const m = B.Mesh.MergeMeshes(parts, true, true); m.name = name; m.material = mt; m.setEnabled(false); m.isPickable = false; m.receiveShadows = true;
    if (G.post) G.post.addCaster(m);
    return m;
  };
  MZ.BUILDS.apt = { name: '集合住宅（仮）', w: 4, solid: true, cost: {}, home: 30 };
  G.BUILD_MODELS.apt = { near: 'apt_near', far: 'apt_far', xfar: 'apt_xfar' };
  window.ensureApt = () => { const g = L.glb.apt = L.glb.apt || { near: null, far: null, xfar: null }; if (!g.near && L.key !== 'low') g.near = [box('apt_near', 50)]; if (!g.far) g.far = [box('apt_far', 10)]; if (!g.xfar) g.xfar = [box('apt_xfar', 6)]; };
  window.ensureApt();
  /* 9 区画・建物 260 軒（今の 230 軒＋集合住宅 30 軒）・人口 1000。β0.3.0 の重い場面の作り方にならう */
  s.stage = 3; Object.keys(s.inv).forEach(k => { s.inv[k] = 99999999; });
  const okAll = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [1, -1], [-1, -1], [-1, 1]].map(c => MZ.expand(c[0], c[1]));
  const kinds = ['house', 'bhouse', 'house', 'well', 'field', 'bigfield', 'shop', 'workshop', 'quarry', 'claypit', 'storehouse', 'lumber', 'house', 'bhouse'];
  let n = 0, k = 0, na = 0;
  const clear = (gx, gz, r) => W.nodes.forEach(nd => { if (Math.abs(nd.gx - gx) <= (r || 3) && Math.abs(nd.gz - gz) <= (r || 3)) W.take(nd.idx, -1); });
  const put = (gx0, gz0, cols, rows, cnt, step) => { for (let r = 0; r < rows && cnt > 0; r++) for (let c = 0; c < cols && cnt > 0; c++) { const gx = gx0 + c * step, gz = gz0 + r * step; clear(gx, gz); if (MZ.place(kinds[k++ % kinds.length], gx, gz, (r + c) % 4)) { n++; cnt--; } } };
  for (let g = 20; g <= 230; g++) { clear(g, 62, 2); MZ.place('stoneroad', g, 62, 0); }
  for (let g = 20; g <= 100; g++) { clear(80, g, 2); MZ.place('road', 80, g, 0); }
  put(26, 26, 10, 5, 50, 5); put(130, 30, 10, 6, 60, 5); put(26, 126, 10, 3, 20, 5); put(130, 126, 10, 2, 20, 5);
  put(26, 70, 10, 5, 50, 5); put(130, 150, 10, 3, 30, 5);
  /* 集合住宅：6 列 × 5 行（12m おき）の固まり。いちばん混んだ所になる */
  for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) { const gx = 90 + c * 6, gz = 26 + r * 6; clear(gx, gz, 4); if (MZ.place('apt', gx, gz, (r + c) % 4)) na++; }
  s.pop = 1000; s.timers.migrate = -1e6; MZ.town.resDirty = true; MZ.tick(1); MZ.town.render(1);
  const bs = MZ.town.list().filter(b => b.t !== 'road' && b.t !== 'stoneroad'), pos = bs.map(b => MZ.town.center(b));
  let best = pos[0], bc = -1; pos.forEach(p => { const c = pos.filter(o => Math.hypot(o[0] - p[0], o[1] - p[1]) < 40).length; if (c > bc) { bc = c; best = p; } });
  const aps = MZ.town.list().filter(b => b.t === 'apt').map(b => MZ.town.center(b)), ac = [aps.reduce((x, p) => x + p[0], 0) / aps.length, aps.reduce((x, p) => x + p[1], 0) / aps.length];
  window.VIEWS = { 混んだ所: best, 集合住宅の固まり: ac };
  const people = MZ.town.pgroups.reduce((x, g) => x + g.n, 0);
  return { n, na, buildings: bs.length, okAll: okAll.every(Boolean), land: s.land.length, pop: s.pop, people, best: best.map(Math.round), apt: ac.map(Math.round), crowd: bc };
};

/* ページの中：1 つの画質・1 つの視点・「今のまま」か「案」で測る */
const MEASURE = ({ q, mode, view, vname }) => {
  const G = MZ.gfx, s = MZ.state.player, Q = G.Q[q], L = G.looks.state, V = window.VIEWS[vname];
  const orig = window.ORIG = window.ORIG || {};
  if (!orig[q]) orig[q] = { nearMax: Q.nearMax, xfarDist: Q.xfarDist, grass: Q.grass };
  const O = orig[q], plan = mode === 'plan';
  /* 数値を一時的に変える（案のときだけ） */
  Q.nearMax = plan && q !== 'low' ? 9999 : O.nearMax;
  Q.xfarDist = plan && q !== 'low' ? 45 : O.xfarDist;
  const grass = plan ? (q === 'high' ? Math.round(350000 / G.GRASS_TRIS) : q === 'mid' ? Math.round(120000 / G.GRASS_TRIS) : O.grass) : O.grass;
  if (Q.grass !== grass) { Q.grass = grass; G.grass.apply(q); }
  const nearBudget = plan ? (q === 'high' ? 160000 : q === 'mid' ? 80000 : 0) : 0;
  /* 近く用の三角形（種類ごと） */
  const nt = {}; const nearTris = k => { if (nt[k] !== undefined) return nt[k]; const g = L.glb[k]; nt[k] = g && g.near ? g.near.reduce((a, m) => a + m.getTotalIndices() / 3, 0) : 0; return nt[k]; };
  s.x = V[0]; s.z = V[1] - 6; s.yaw = 0;
  if (view === '一人称') { s.view = 1; s.pitch = 0; } else { s.view = 3; s.pitch = 0.5; }
  MZ.player.updateCamera(0.016);
  const nearSum = { n: 0, tris: 0 };
  /* 近くの建物の係：案のときは、近い順に三角形の合計が nearBudget をこえない所までだけ近く用にする */
  const tick = () => {
    G.looks.nearTick(1, true);
    nearSum.n = 0; nearSum.tris = 0;
    if (!plan) { L.objs.forEach(o => { if (o.nearOn) { nearSum.n++; nearSum.tris += nearTris(o.key); } }); return; }
    const on = []; L.objs.forEach(o => { if (o.nearOn) { o.d2 = (o.x - s.x) ** 2 + (o.z - s.z) ** 2; on.push(o); } });
    on.sort((a, b) => a.d2 - b.d2);
    let sum = 0;
    on.forEach(o => { const t = nearTris(o.key); if (sum + t <= nearBudget) { sum += t; nearSum.n++; } else o.setNear(false); });
    nearSum.tris = sum;
  };
  G.grass.setScale(1); G.dyn.houseCut = 0; G.dyn.treeF = 1;
  let steps = 0;
  for (let i = 0; i < 60; i++) {
    tick(); G.nodes.flush(); G.grass.layout(s.x, s.z);
    const t = G.tris(); if (t <= Q.trisMax) break;
    G.budgetStep(t); steps++;
  }
  tick(); G.nodes.flush(); G.grass.layout(s.x, s.z);
  const ms = G.scene.meshes, cat = {};
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i]; if (!m.isEnabled() || !m.isVisible || !m.getTotalIndices || m._masterMesh) continue;
    let lm = m; if (m.sourceMesh && m.sourceMesh.getLODLevels().length) { lm = m.getLOD(G.cam); if (!lm) continue; }
    const nn = lm.getTotalIndices() / 3; if (!nn) continue;
    const t = nn * (m.hasThinInstances ? m.thinInstanceCount : 1), nm = (m.sourceMesh || m).name;
    const c = /^grass/.test(nm) ? '草' : /tree|leaf|wood|stump/i.test(nm) ? '木' : /terrain|mount|fence|out|ground/i.test(nm) ? '地面など' : /^apt/.test(nm) ? '集合住宅（仮）' : m.sourceMesh ? '建物' : /person|player|leg|arm|body/.test(nm) ? '人' : 'その他';
    cat[c] = (cat[c] || 0) + Math.round(t);
  }
  const st = MZ.stats(), bs = G.budgetState();
  return { tris: G.tris(), limit: Q.trisMax, steps, budget: bs, near: nearSum, cat, active: st.activeMeshes };
};

/* ページの中：町の仕事の時間（20 回の平均、ms） */
const TIMING = () => {
  const G = MZ.gfx, s = MZ.state, avg = (f, n) => { f(); const t0 = performance.now(); for (let i = 0; i < n; i++) f(); return +((performance.now() - t0) / n).toFixed(2); };
  s.timers.migrate = -1e6;
  const out = {};
  out.tick1 = avg(() => { MZ.town.resDirty = true; MZ.tick(1); }, 20);
  out.tickNoDirty = avg(() => { MZ.tick(1); }, 20);
  out.render = avg(() => MZ.town.render(1), 20);
  out.nearTick = avg(() => G.looks.nearTick(1, true), 20);
  return out;
};

(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await br.newContext({ viewport: { width: 480, height: 300 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('machizukuri-gfx', 'high'); } catch (e) { /* なし */ } });
  const pg = await ctx.newPage(), errs = [];
  pg.on('pageerror', e => errs.push('pageerror ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto(URL);
  await pg.click('#tbtn .go', { timeout: 90000 });
  await pg.waitForFunction(() => window.MZ && MZ.started, null, { timeout: 180000 });
  const loaded = () => pg.waitForFunction(() => { const a = MZ.gfx.assets; return a.done >= a.total; }, null, { timeout: 300000 });
  await loaded();
  const sc = await pg.evaluate(SETUP);
  console.log('場面', JSON.stringify(sc));
  const res = { scene: sc, rows: [], timing: null, errs };
  const quals = ONLY ? [ONLY] : ['high', 'mid', 'low'];
  for (const q of quals) {
    await pg.evaluate(q => MZ.gfx.setQuality(q), q);
    await loaded();
    await pg.evaluate(() => { window.ensureApt(); MZ.gfx.looks.nearTick(1, true); });
    if (!res.timing) { res.timing = await pg.evaluate(TIMING); console.log('町の仕事の時間（' + q + '）', JSON.stringify(res.timing)); }
    for (const mode of ['now', 'plan']) for (const vname of ['混んだ所', '集合住宅の固まり']) for (const view of ['一人称', '三人称']) {
      const r = await pg.evaluate(MEASURE, { q, mode, view, vname });
      const row = { q, mode, vname, view, ...r };
      res.rows.push(row);
      console.log(q, mode, vname, view, 'tris=' + r.tris, '/' + r.limit, 'steps=' + r.steps, JSON.stringify(r.budget), 'near=' + r.near.n + '軒/' + r.near.tris, JSON.stringify(r.cat));
    }
    /* 次の画質へ行く前に、案の数値をもとにもどす */
    await pg.evaluate(q => { const Q = MZ.gfx.Q[q], O = window.ORIG[q]; if (O) { Q.nearMax = O.nearMax; Q.xfarDist = O.xfarDist; Q.grass = O.grass; } }, q);
  }
  if (errs.length) console.log('エラー・警告', errs.slice(0, 5));
  if (OUTJ) fs.writeFileSync(OUTJ, JSON.stringify(res, null, 1));
  await br.close();
})().catch(e => { console.error(e); process.exit(2); });

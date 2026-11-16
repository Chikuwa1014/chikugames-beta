/* 荒野開拓記（仮） 同じ構図のスクリーンショット（dev フォルダは .assetsignore で公開されない）
   使い方（リポジトリ直下で `python3 -m http.server 8000` を動かしてから）：
     node machizukuri/dev/shots.cjs <置き場> [--base URL] [--q low,mid,high] [--dev pc,port,land] [--only start,wide] [--tag 名前の頭] [--fixed]
   --fixed：決まった絵（毎回ほぼ同じ）を撮る。Math.random を固定の種にし（住民の歩きはじめ）、お知らせ・バナーを消し、世界の時間と草のゆれの時間を止める（MZ.timeFix）。前後の見くらべ用
   構図（開発指示書 7.2）：start・wide・near（木）・near2（岩）・build（見本）・town（三人称）・panel。
   β0.1.0 と見比べるときは、コミット 9f196aa を `git archive 9f196aa machizukuri common | tar -x -C <別の場所>` で取り出して
   そこで別の http.server（例 8001）を動かし、--base http://localhost:8001/machizukuri/ --tag b010 で撮る（画質の指定は効かない）。
   swiftshader では高の 1 フレームが数十秒かかるので、気長に待つ（待ち時間は長めにしてある）。 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(require('os').tmpdir(), 'machizukuri-shots')) + '/';
fs.mkdirSync(OUT, { recursive: true });
const BASE = arg('base', 'http://localhost:8000/machizukuri/');
const QS = arg('q', 'low,mid,high').split(',');
const DEVS = arg('dev', 'pc,port,land').split(',');
const ONLY = arg('only', '').split(',').filter(Boolean);
const TAG = arg('tag', '');
const FIXED = process.argv.includes('--fixed');
const DEV = { pc: { w: 1200, h: 750, touch: false }, port: { w: 390, h: 780, touch: true }, land: { w: 780, h: 390, touch: true } };

/* ページの中：構図ごとの準備（β0.1.0 でも同じ MZ の関数で動く） */
const SETUP = {
  start: () => { /* 最初の場所のまま */ },
  wide: () => { const s = MZ.state.player; s.x = 0; s.z = -30; s.yaw = 0; s.pitch = -0.05; },
  near: () => {
    const s = MZ.state.player; let b = null, bd = 1e9;
    MZ.world.nodes.forEach(nd => { if (nd.k !== 'tree' || !MZ.world.nodeActive(nd.idx)) return; const d = Math.hypot(nd.x - 0, nd.z + 7); if (d < bd) { bd = d; b = nd; } });
    s.x = b.x; s.z = b.z - 3; s.yaw = 0; s.pitch = 0.05; MZ.player.updateAim(); MZ.hit();   // たたいた直後（ゆれ）
  },
  near2: () => {
    const s = MZ.state.player; let b = null, bd = 1e9;
    MZ.world.nodes.forEach(nd => { if (nd.k !== 'rock' || !MZ.world.nodeActive(nd.idx)) return; const d = Math.hypot(nd.x - 0, nd.z + 7); if (d < bd) { bd = d; b = nd; } });
    s.x = b.x; s.z = b.z - 3; s.yaw = 0; s.pitch = 0.1;
  },
  build: () => {
    Object.keys(MZ.state.inv).forEach(k => { MZ.state.inv[k] = 99; });
    const s = MZ.state.player; s.x = -2; s.z = -9; s.yaw = 0; s.pitch = 0.3;
    MZ.startBuild('house');
  },
  town: () => {
    MZ.cancelBuild();
    MZ.noSave = true;
    Object.keys(MZ.state.inv).forEach(k => { MZ.state.inv[k] = 9999; });
    MZ.world.nodes.forEach(nd => { if (nd.gx >= 40 && nd.gx <= 70 && nd.gz >= 52 && nd.gz <= 70) MZ.world.take(nd.idx, -1); });
    for (let g = 47; g <= 62; g++) MZ.place('road', g, 61, 0);
    [48, 52, 56].forEach(g => MZ.place('house', g, 62, 0));
    MZ.place('well', 57, 59, 0); MZ.place('field', 49, 57, 0); MZ.place('bench', 62, 58, 0); MZ.place('fire', 64, 62, 0);
    MZ.state.timers.migrate = 0; MZ.state.pop = 6; MZ.town.resDirty = true; MZ.tick(2);
    const s = MZ.state.player; s.x = -12; s.z = -6; s.yaw = 0.15; s.pitch = 0.2; s.view = 3;
  },
  /* β0.3.0：仕事場タブ・石畳（土の道とのつなぎ目と縁）・新しい建物のコードの形・村の全景 */
  work: () => {
    MZ.cancelBuild(); MZ.noSave = true;
    const s = MZ.state; s.stage = 2; s.pop = 30;
    Object.keys(s.inv).forEach(k => { s.inv[k] = 9999; });
    MZ.world.nodes.forEach(nd => { if (nd.gx >= 40 && nd.gx <= 90 && nd.gz >= 40 && nd.gz <= 80) MZ.world.take(nd.idx, -1); });
    s.timers.migrate = -1e6;
    const wid = [['lumber', 62, 52], ['quarry', 66, 52], ['claypit', 70, 52], ['workshop', 74, 52], ['shop', 78, 52], ['storehouse', 70, 56]].map(a => { MZ.place(a[0], a[1], a[2], 0); return MZ.town.list()[MZ.town.list().length - 1].id; })[3];
    MZ.setMake(wid, 'brick'); s.inv.stone = 120; s.inv.clay = 0; s.inv.stick = 0;
    MZ.tick(7); s.player.x = 10; s.player.z = -2; s.player.yaw = 0.3; s.player.pitch = 0.05; s.player.view = 1;
    MZ.ui.panel(true); MZ.ui.tab = 'work'; MZ.ui.sig = ''; MZ.ui.render();
  },
  cobble: () => {
    MZ.cancelBuild(); MZ.noSave = true; MZ.ui.panel(false);
    const s = MZ.state; s.stage = 2; Object.keys(s.inv).forEach(k => { s.inv[k] = 9999; });
    MZ.world.nodes.forEach(nd => { if (nd.gx >= 50 && nd.gx <= 75 && nd.gz >= 52 && nd.gz <= 72) MZ.world.take(nd.idx, -1); });
    for (let g = 59; g <= 62; g++) MZ.place('road', 64, g, 0);       // 土の道（小屋のとなりから）
    for (let g = 63; g <= 72; g++) MZ.place('stoneroad', 64, g, 0);   // 石畳
    for (let g = 59; g <= 63; g++) MZ.place('stoneroad', g, 66, 0);   // 石畳の枝
    MZ.place('road', 61, 66, 0);
    MZ.place('house', 65, 66, 0); MZ.place('house', 62, 67, 0);
    s.player.x = 9; s.player.z = 0; s.player.yaw = 0; s.player.pitch = 0.4; s.player.view = 1;
  },
  newb: () => {
    MZ.cancelBuild(); MZ.noSave = true; MZ.ui.panel(false);
    const s = MZ.state; s.stage = 2; Object.keys(s.inv).forEach(k => { s.inv[k] = 9999; });
    MZ.world.nodes.forEach(nd => { if (nd.gx >= 36 && nd.gx <= 90 && nd.gz >= 48 && nd.gz <= 66) MZ.world.take(nd.idx, -1); });
    [['stoneroad', 46], ['quarry', 49], ['claypit', 54], ['workshop', 59], ['shop', 64], ['storehouse', 69], ['bigfield', 75]].forEach(a => MZ.place(a[0], a[1], 56, 0));
    s.player.x = 4; s.player.z = -34; s.player.yaw = 0; s.player.pitch = 0.12; s.player.view = 1;
  },
  /* 新しい建物 6 種の GLB の寄り（newbnear：近く用）と 60m 先（newbfar：最遠）。一人称。近くの建物の係を、すぐ回す */
  newbnear: () => {
    MZ.cancelBuild(); MZ.noSave = true; MZ.ui.panel(false);
    const s = MZ.state; s.stage = 2; Object.keys(s.inv).forEach(k => { s.inv[k] = 9999; });
    MZ.world.nodes.forEach(nd => { if (nd.gx >= 36 && nd.gx <= 100 && nd.gz >= 48 && nd.gz <= 70) MZ.world.take(nd.idx, -1); });
    [['quarry', 40], ['claypit', 46], ['workshop', 52], ['shop', 58], ['storehouse', 64], ['bigfield', 71]].forEach(a => MZ.place(a[0], a[1], 56, 0));
    s.player.x = -2; s.player.z = -20; s.player.yaw = 0.0; s.player.pitch = 0.1; s.player.view = 1;
  },
  newbfar: () => {
    MZ.cancelBuild(); MZ.noSave = true; MZ.ui.panel(false);
    const s = MZ.state; s.stage = 2; Object.keys(s.inv).forEach(k => { s.inv[k] = 9999; });
    MZ.world.nodes.forEach(nd => { if (nd.gx >= 30 && nd.gx <= 100 && nd.gz >= 0 && nd.gz <= 70) MZ.world.take(nd.idx, -1); });
    [['quarry', 40], ['claypit', 46], ['workshop', 52], ['shop', 58], ['storehouse', 64], ['bigfield', 71]].forEach(a => MZ.place(a[0], a[1], 56, 0));
    s.player.x = -8; s.player.z = -72; s.player.yaw = 0.0; s.player.pitch = 0.04; s.player.view = 1;
  },
  /* 工房の煙：工房を 2 つ、仕事場が動く状態（人口・材料を持たせて tick）で */
  smoke: () => {
    MZ.cancelBuild(); MZ.noSave = true; MZ.ui.panel(false);
    const s = MZ.state; s.stage = 2; s.pop = 30; Object.keys(s.inv).forEach(k => { s.inv[k] = 9999; });
    MZ.world.nodes.forEach(nd => { if (nd.gx >= 40 && nd.gx <= 90 && nd.gz >= 44 && nd.gz <= 70) MZ.world.take(nd.idx, -1); });
    [['workshop', 56, 0], ['workshop', 64, 1], ['house', 48, 0], ['house', 72, 0]].forEach(a => MZ.place(a[0], a[1], 56, a[2]));
    MZ.town.list().filter(b => b.t === 'workshop').forEach(b => MZ.setMake(b.id, 'brick'));
    s.inv.stone = 100; s.inv.clay = 100; s.inv.brick = 0; s.timers.migrate = -1e6; MZ.tick(8);
    s.player.x = 4; s.player.z = -20; s.player.yaw = 0; s.player.pitch = -0.28; s.player.view = 1;
  },
  /* 大きな畑の土（地面の塗り分け）の寄り */
  bigsoil: () => {
    MZ.cancelBuild(); MZ.noSave = true; MZ.ui.panel(false);
    const s = MZ.state; s.stage = 2; Object.keys(s.inv).forEach(k => { s.inv[k] = 9999; });
    MZ.world.nodes.forEach(nd => { if (nd.gx >= 40 && nd.gx <= 90 && nd.gz >= 44 && nd.gz <= 70) MZ.world.take(nd.idx, -1); });
    MZ.place('bigfield', 60, 56, 0); MZ.place('field', 66, 56, 0);
    s.player.x = 2; s.player.z = -14; s.player.yaw = 0; s.player.pitch = 0.45; s.player.view = 1;
  },
  village: () => {
    MZ.cancelBuild(); MZ.noSave = true; MZ.ui.panel(false);
    const s = MZ.state; s.stage = 3; Object.keys(s.inv).forEach(k => { s.inv[k] = 99999; });
    MZ.world.nodes.forEach(nd => { if (nd.gx >= 28 && nd.gx <= 94 && nd.gz >= 28 && nd.gz <= 94) MZ.world.take(nd.idx, -1); });
    const kinds = ['house', 'bhouse', 'house', 'field', 'bigfield', 'quarry', 'claypit', 'workshop', 'shop', 'storehouse', 'well', 'house', 'bhouse', 'lumber'];
    let n = 0;
    for (let g = 30; g <= 56; g++) { MZ.place('stoneroad', g, 62, 0); }
    for (let r = 0; r < 12 && n < 100; r++) for (let c = 0; c < 12 && n < 100; c++) {
      const gx = 30 + c * 5, gz = 30 + r * 5 + (r > 5 ? 2 : 0);
      if (gz >= 58 && gz <= 64 && gx >= 56 && gx <= 64) continue;
      if (MZ.place(kinds[(r * 12 + c) % kinds.length], gx, gz, (r + c) % 4)) n++;
    }
    s.pop = 200; s.timers.migrate = -1e6; MZ.town.resDirty = true; MZ.tick(1);
    s.player.x = 0; s.player.z = -78; s.player.yaw = 0; s.player.pitch = -0.02; s.player.view = 1;
  },
  /* β0.3.0 区切り 3：土地を広げる（材料はこの場だけで持たせる）。lshape＝L 字（東と北）・land9＝9 区画・landtab＝土地タブ・kind*＝岩場・森・粘土の土地の中 */
  lshape: () => {
    MZ.cancelBuild(); MZ.noSave = true; MZ.ui.panel(false);
    const s = MZ.state; s.stage = 2; Object.keys(s.inv).forEach(k => { s.inv[k] = 99999; });
    MZ.expand(1, 0); MZ.expand(0, 1);
    MZ.world.nodes.forEach(nd => { if (nd.gx >= 40 && nd.gx <= 140 && nd.gz >= 40 && nd.gz <= 80) MZ.world.take(nd.idx, -1); });
    for (let g = 61; g <= 125; g++) MZ.place('road', g, 60, 0);
    MZ.place('house', 119, 50, 0); MZ.place('house', 126, 61, 0); MZ.place('house', 100, 62, 0); MZ.place('field', 112, 64, 0);
    MZ.T.view3 = { back: 700, up: 0 };
    s.player.x = 120; s.player.z = 100; s.player.yaw = 0; s.player.pitch = 1.15; s.player.view = 3;
  },
  land9: () => {
    MZ.cancelBuild(); MZ.noSave = true; MZ.ui.panel(false);
    const s = MZ.state; s.stage = 2; Object.keys(s.inv).forEach(k => { s.inv[k] = 99999; });
    [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [1, -1], [-1, -1], [-1, 1]].forEach(c => MZ.expand(c[0], c[1]));
    MZ.T.view3 = { back: 900, up: 0 };
    s.player.x = 0; s.player.z = 0; s.player.yaw = 0; s.player.pitch = 1.05; s.player.view = 3;
  },
  landtab: () => {
    MZ.cancelBuild(); MZ.noSave = true;
    const s = MZ.state; s.stage = 2; Object.keys(s.inv).forEach(k => { s.inv[k] = 99999; }); s.inv.brick = 10;
    MZ.expand(1, 0); MZ.expand(0, 1);
    s.player.x = 100; s.player.z = 100; s.player.yaw = 0.4; s.player.pitch = 0.1; s.player.view = 1;
    MZ.ui.landSel = '-1,1'; MZ.ui.panel(true); MZ.ui.tab = 'land'; MZ.ui.sig = ''; MZ.ui.render();
  },
  landedge: () => {
    MZ.cancelBuild(); MZ.noSave = true; MZ.ui.panel(false);
    const s = MZ.state; s.stage = 2; Object.keys(s.inv).forEach(k => { s.inv[k] = 99999; });
    s.player.x = 112; s.player.z = 20; s.player.yaw = Math.PI / 2; s.player.pitch = 0.05; s.player.view = 1;
    MZ.ui.update(0.2);
  },
  kindrock: () => {
    MZ.cancelBuild(); MZ.noSave = true; MZ.ui.panel(false);
    const s = MZ.state; s.stage = 2; Object.keys(s.inv).forEach(k => { s.inv[k] = 99999; });
    MZ.expand(1, 0);
    s.player.x = 226; s.player.z = 10; s.player.yaw = 0.2; s.player.pitch = 0.05; s.player.view = 1;
  },
  kindforest: () => {
    MZ.cancelBuild(); MZ.noSave = true; MZ.ui.panel(false);
    const s = MZ.state; s.stage = 2; Object.keys(s.inv).forEach(k => { s.inv[k] = 99999; });
    MZ.expand(0, 1);
    s.player.x = 12; s.player.z = 226; s.player.yaw = 0.2; s.player.pitch = 0.05; s.player.view = 1;
  },
  kindclay: () => {
    MZ.cancelBuild(); MZ.noSave = true; MZ.ui.panel(false);
    const s = MZ.state; s.stage = 2; Object.keys(s.inv).forEach(k => { s.inv[k] = 99999; });
    MZ.expand(0, -1);
    s.player.x = 12; s.player.z = -226; s.player.yaw = 0.2; s.player.pitch = 0.05; s.player.view = 1;
  },
  panel: () => { const s = MZ.state.player; s.view = 1; s.x = 0; s.z = -7; s.yaw = 0; s.pitch = 0; MZ.ui.panel(true); }
};
const ORDER = ['start', 'wide', 'near', 'near2', 'build', 'town', 'panel', 'work', 'cobble', 'newb', 'newbnear', 'newbfar', 'smoke', 'bigsoil', 'village', 'lshape', 'land9', 'landtab', 'landedge', 'kindrock', 'kindforest', 'kindclay'];

(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const dev of DEVS) for (const q of QS) {
    const D = DEV[dev];
    const ctx = await br.newContext({ viewport: { width: D.w, height: D.h }, isMobile: D.touch, hasTouch: D.touch, deviceScaleFactor: 1 });
    await ctx.addInitScript(q => { try { localStorage.setItem('machizukuri-gfx', q); } catch (e) { /* なし */ } }, q);
    const page = await ctx.newPage(), errs = [];
    page.on('pageerror', e => errs.push('pageerror ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    if (FIXED) {
      await ctx.addInitScript(() => { let a = 1014 >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
      await ctx.addInitScript(() => { const st = document.createElement('style'); st.textContent = '#notes,#banner,#bgLoad{display:none!important}'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st)); });
    }
    await page.goto(BASE);
    await page.click('#tbtn .go', { timeout: 90000 });
    await page.waitForFunction(() => window.MZ && MZ.started, null, { timeout: 180000 });
    await page.evaluate(() => new Promise(r => { const t = setInterval(() => { const a = window.MZ.gfx && MZ.gfx.assets; if (!a || a.done >= a.total) { clearInterval(t); r(); } }, 300); setTimeout(r, 120000); }));
    if (FIXED) await page.evaluate(() => { MZ.timeFix = 5; });
    const frames = n => page.evaluate(n => new Promise(r => { let i = 0; const f = () => { if (++i >= n) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), n);
    for (const name of ORDER) {
      if (ONLY.length && !ONLY.includes(name)) continue;
      await page.evaluate('(' + SETUP[name].toString() + ')()');
      /* 並べ直しを待たずに強制（β0.2.0 のときだけ）。そのあと描かせる */
      await page.evaluate(() => { if (window.MZ.gfx && MZ.gfx.nodes) { const s = MZ.state.player; MZ.gfx.nodes.flush(); MZ.gfx.grass.layout(s.x, s.z); if (MZ.gfx.looks.nearTick) MZ.gfx.looks.nearTick(1, true); if (MZ.gfx.fire.smokeTick) MZ.gfx.fire.smokeTick(s.x, s.z); } });
      await frames(q === 'high' ? 2 : 4);
      const file = OUT + (TAG ? TAG + '-' : '') + dev + '-' + name + '-' + (TAG === 'b010' ? 'x' : q) + '.png';
      await page.screenshot({ path: file, timeout: 600000 });
      const info = await page.evaluate(() => (window.MZ.gfx ? { tris: MZ.gfx.tris(), q: MZ.gfx.key } : {}));
      console.log(path.basename(file), JSON.stringify(info));
      if (name === 'panel' || name === 'work' || name === 'landtab') await page.evaluate(() => MZ.ui.panel(false));
    }
    if (errs.length) console.log('  エラー', dev, q, errs.slice(0, 3).join(' | '));
    await ctx.close();
    if (TAG === 'b010') break;   // β0.1.0 は画質の指定が効かないので 1 回だけ
  }
  await br.close();
})().catch(e => { console.error(e); process.exit(2); });

/* 荒野開拓記（仮） 同じ構図のスクリーンショット（dev フォルダは .assetsignore で公開されない）
   使い方（リポジトリ直下で `python3 -m http.server 8000` を動かしてから）：
     node machizukuri/dev/shots.cjs <置き場> [--base URL] [--q low,mid,high] [--dev pc,port,land] [--only start,wide] [--tag 名前の頭]
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
  panel: () => { const s = MZ.state.player; s.view = 1; s.x = 0; s.z = -7; s.yaw = 0; s.pitch = 0; MZ.ui.panel(true); }
};
const ORDER = ['start', 'wide', 'near', 'near2', 'build', 'town', 'panel'];

(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const dev of DEVS) for (const q of QS) {
    const D = DEV[dev];
    const ctx = await br.newContext({ viewport: { width: D.w, height: D.h }, isMobile: D.touch, hasTouch: D.touch, deviceScaleFactor: 1 });
    await ctx.addInitScript(q => { try { localStorage.setItem('machizukuri-gfx', q); } catch (e) { /* なし */ } }, q);
    const page = await ctx.newPage(), errs = [];
    page.on('pageerror', e => errs.push('pageerror ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(BASE);
    await page.click('#tbtn .go', { timeout: 90000 });
    await page.waitForFunction(() => window.MZ && MZ.started, null, { timeout: 180000 });
    await page.evaluate(() => new Promise(r => { const t = setInterval(() => { const a = window.MZ.gfx && MZ.gfx.assets; if (!a || a.done >= a.total) { clearInterval(t); r(); } }, 300); setTimeout(r, 120000); }));
    const frames = n => page.evaluate(n => new Promise(r => { let i = 0; const f = () => { if (++i >= n) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), n);
    for (const name of ORDER) {
      if (ONLY.length && !ONLY.includes(name)) continue;
      await page.evaluate('(' + SETUP[name].toString() + ')()');
      /* 並べ直しを待たずに強制（β0.2.0 のときだけ）。そのあと描かせる */
      await page.evaluate(() => { if (window.MZ.gfx && MZ.gfx.nodes) { const s = MZ.state.player; MZ.gfx.nodes.flush(); MZ.gfx.grass.layout(s.x, s.z); } });
      await frames(q === 'high' ? 2 : 4);
      const file = OUT + (TAG ? TAG + '-' : '') + dev + '-' + name + '-' + (TAG === 'b010' ? 'x' : q) + '.png';
      await page.screenshot({ path: file, timeout: 600000 });
      const info = await page.evaluate(() => (window.MZ.gfx ? { tris: MZ.gfx.tris(), q: MZ.gfx.key } : {}));
      console.log(path.basename(file), JSON.stringify(info));
      if (name === 'panel') await page.evaluate(() => MZ.ui.panel(false));
    }
    if (errs.length) console.log('  エラー', dev, q, errs.slice(0, 3).join(' | '));
    await ctx.close();
    if (TAG === 'b010') break;   // β0.1.0 は画質の指定が効かないので 1 回だけ
  }
  await br.close();
})().catch(e => { console.error(e); process.exit(2); });

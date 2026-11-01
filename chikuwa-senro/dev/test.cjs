// つなげ！ちくわ線路のテスト：リポジトリ直下で python3 -m http.server 8765 を起動してから node chikuwa-senro/dev/test.cjs
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 390, height: 800 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e)));
  pg.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.goto('http://localhost:8765/chikuwa-senro/');
  await pg.screenshot({ path: '/tmp/senro-menu.png' });
  await pg.click('#mArc'); await pg.click('#lvGrid button:first-child');
  // 手で線路を組む：駅の上から S字（縦・縦・右カーブ・横…）を作って走らせる
  const r = await pg.evaluate(async () => {
    const S_ = SENRO, G = S_.G, N = S_.N, E = S_.E, So = S_.S, W = S_.W;
    G.cur = null;
    const set = (c, r, m) => { G.grid[r][c] = m; };
    set(3, 23, N | So); set(3, 22, N | So); set(3, 21, So | E); set(4, 21, E | W); set(5, 21, W | N); set(5, 20, N | So);
    set(0, 23, E | W); set(7, 23, 0);
    const plan = S_.planRun();
    G.cur = { c: 6, r: 3, m: N | So, y: 3 };
    return { len: plan.path.length, topped: plan.topped, ends: JSON.stringify(plan.path[plan.path.length - 1]) };
  });
  console.log('plan', JSON.stringify(r));
  await pg.evaluate(() => SENRO.depart());
  await pg.waitForTimeout(700);
  await pg.screenshot({ path: '/tmp/senro-run.png' });
  await pg.waitForTimeout(1600);
  const after = await pg.evaluate(() => ({ mode: SENRO.G.mode, score: SENRO.G.score, miss: SENRO.G.miss, run: !!SENRO.G.run, bottom: SENRO.G.grid[23].map(x => x === null ? '.' : x).join(',') }));
  console.log('after', JSON.stringify(after));
  // 落下・ロック・ゲームオーバー（積み上げ）
  await pg.evaluate(() => { SENRO.start('free', 20); });
  await pg.waitForTimeout(300);
  for (let i = 0; i < 60; i++) { await pg.evaluate(() => SENRO.hardDrop()); }
  const st = await pg.evaluate(() => ({ mode: SENRO.G.mode, placed: SENRO.G.placed }));
  console.log('stack', JSON.stringify(st));
  await pg.screenshot({ path: '/tmp/senro-over.png' });
  // 上まで走って到着
  const top = await pg.evaluate(() => {
    SENRO.start('free', 1); const G = SENRO.G, N = SENRO.N, So = SENRO.S; G.cur = null;
    for (let r = 0; r < SENRO.ROWS; r++) G.grid[r][SENRO.STATION_COL] = N | So;
    const p = SENRO.planRun(); return { len: p.path.length, topped: p.topped };
  });
  console.log('top', JSON.stringify(top));
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})();

// つなげ！ちくわ線路のテスト：リポジトリ直下で python3 -m http.server 8765 を起動してから node chikuwa-senro/dev/test.cjs
const { chromium } = require('playwright');
const ok = (c, m) => { if (!c) { console.log('NG', m); process.exitCode = 1; } else console.log('ok', m); };
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e)));
  pg.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.goto('http://localhost:8765/chikuwa-senro/');
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: '/tmp/senro-menu.png' });
  await pg.click('#mHow'); await pg.waitForTimeout(300); await pg.screenshot({ path: '/tmp/senro-how.png' }); await pg.click('#mHowto [data-back]');
  await pg.click('#mArc'); await pg.click('#lvGrid button:first-child');
  await pg.screenshot({ path: '/tmp/senro-brief.png' });
  await pg.click('#bfStart');
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: '/tmp/senro-start.png' });
  await pg.evaluate(() => SENRO.start('arcade', 16));   // お題が重いレベルで途中のクリアを避ける

  // 1) 小さな輪：カーブ2つで完成ルートになる
  const r1 = await pg.evaluate(() => {
    const { G, mkTile, N, E, S, W, findRoutes } = SENRO;
    G.grid[11][1] = mkTile('c', S | E); G.grid[11][2] = mkTile('c', W | S);
    return findRoutes().map(r => r.steps.length);
  });
  ok(JSON.stringify(r1) === '[2]', '2マスの輪が完成ルートになる ' + JSON.stringify(r1));

  // 2) U字（縦2・横・縦2）と十字
  const r2 = await pg.evaluate(() => {
    const { G, mkTile, N, E, S, W, findRoutes } = SENRO;
    for (let r = 0; r < 12; r++) G.grid[r].fill(null);
    // 列4: 縦 縦 カーブ(S|E)  列5: 十字(土台)→上に横  列6: カーブ(W|S) 縦 縦
    G.grid[11][4] = mkTile('s', N | S); G.grid[10][4] = mkTile('s', N | S); G.grid[9][4] = mkTile('c', S | E);
    G.grid[11][5] = mkTile('r', 0); G.grid[10][5] = mkTile('r', 0); G.grid[9][5] = mkTile('x', 15);
    G.grid[11][6] = mkTile('s', N | S); G.grid[10][6] = mkTile('s', N | S); G.grid[9][6] = mkTile('c', W | S);
    G.grid[8][4] = mkTile('c', S | E); G.grid[8][5] = mkTile('c', W | S);  // 上に小さな輪（連鎖用）
    return findRoutes().map(r => r.steps.length);
  });
  ok(JSON.stringify(r2) === '[7]', 'U字（十字を通る）が7マスのルート ' + JSON.stringify(r2));
  await pg.screenshot({ path: '/tmp/senro-ready.png' });

  // 3) 発車 → 走行 → 消える → 岩もこわれる → 上の輪が落ちて連鎖
  await pg.evaluate(() => SENRO.depart(true));
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: '/tmp/senro-run.png' });
  await pg.waitForFunction(() => SENRO.G.phase === 'play', null, { timeout: 8000 });
  const a3 = await pg.evaluate(() => ({ st: SENRO.G.st, score: SENRO.G.score, bottom: SENRO.G.grid[11].map(t => t ? t.k : '.').join('') }));
  console.log('after', JSON.stringify(a3));
  ok(a3.st.runs === 2 && a3.st.maxChain === 2, '連鎖が2回走る');
  ok(a3.st.rocks >= 1, '岩がこわれる');
  ok(a3.st.cross === 1, '十字を通った');

  // 4) 時刻で脱線：つながっていないとミス
  await pg.evaluate(() => { const G = SENRO.G; for (let r = 0; r < 12; r++) G.grid[r].fill(null); G.grid[11][0] = SENRO.mkTile('s', SENRO.N | SENRO.S); G.ttLeft = 0.05; });
  await pg.waitForFunction(() => SENRO.G.phase === 'play' && SENRO.G.miss === 1, null, { timeout: 8000 });
  ok(true, '時刻に脱線してミス1');

  // 5) 操作：移動・回転・落とす
  const r5 = await pg.evaluate(() => { const G = SENRO.G; const c0 = G.cur.c; SENRO.tryMove(1); SENRO.tryMove(1); const c1 = G.cur.c; const n = G.placed; SENRO.hardDrop(); return { c0, c1, placed: G.placed - n }; });
  ok(r5.c1 === r5.c0 + 2 && r5.placed === 1, '移動と落下 ' + JSON.stringify(r5));
  await pg.mouse.click(100, 200); // タップで回す（落ちてくるピースが無くてもエラーにならない）

  // 6) Lv1 クリア判定（runs 1 はすでに満たしている → 次の resume でクリア）
  await pg.evaluate(() => { SENRO.start('arcade', 0); const G = SENRO.G; for (let r = 0; r < 12; r++) G.grid[r].fill(null); G.grid[11][1] = SENRO.mkTile('c', SENRO.S | SENRO.E); G.grid[11][2] = SENRO.mkTile('c', SENRO.W | SENRO.S); SENRO.depart(true); });
  await pg.waitForSelector('#mResult:not([hidden])', { timeout: 8000 });
  ok((await pg.textContent('#rTitle')).includes('クリア'), 'Lv1 クリア');
  await pg.screenshot({ path: '/tmp/senro-clear.png' });

  // 7) フリー：満線で終わる
  await pg.click('#rMenu'); await pg.click('#mFree'); await pg.click('#fSeg [data-v=var]'); await pg.click('#freeStart');
  await pg.waitForTimeout(300);
  await pg.evaluate(() => { SENRO.G.cur.t = SENRO.mkTile('r', 0); });
  for (let i = 0; i < 40; i++) await pg.evaluate(() => { const G = SENRO.G; if (G.cur) { G.cur.t = SENRO.mkTile('r', 0); SENRO.hardDrop(); } });
  await pg.waitForSelector('#mResult:not([hidden])', { timeout: 5000 });
  ok((await pg.textContent('#rTitle')).includes('満線'), 'フリーは満線で終わる');
  await pg.screenshot({ path: '/tmp/senro-over.png' });

  // 8) フリー：脱線で終わる
  await pg.click('#rNext'); await pg.waitForTimeout(200);
  await pg.evaluate(() => { SENRO.G.ttLeft = 0.05; });
  await pg.waitForSelector('#mResult:not([hidden])', { timeout: 6000 });
  ok((await pg.textContent('#rTitle')).includes('脱線'), 'フリーは脱線で終わる');

  // 9) 実際に遊ぶ流れ：ランダムに落としていって止まらない
  await pg.click('#rNext');
  for (let i = 0; i < 60; i++) { await pg.evaluate(() => { const G = SENRO.G; if (G.phase === 'play' && G.cur) { const d = Math.floor(Math.random() * 8) - G.cur.c; for (let k = 0; k < Math.abs(d); k++) SENRO.tryMove(Math.sign(d)); if (Math.random() < .5) SENRO.rotate(); SENRO.hardDrop(); if (SENRO.findRoutes().length && Math.random() < .5) SENRO.depart(true); } }); await pg.waitForTimeout(40); }
  await pg.screenshot({ path: '/tmp/senro-play.png' });
  ok(errs.length === 0, 'エラーなし ' + errs.join(' | '));
  await b.close();
})();

// ちくわでるでる！ドーパミンのテスト：リポジトリ直下で python3 -m http.server 8765 を起動してから
//   node chikuwa-dopamine/dev/test.cjs <スクリーンショットの保存先>
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 390, height: 800 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e)));
  pg.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.goto('http://localhost:8765/chikuwa-dopamine/');
  await pg.screenshot({ path: OUT + '/dopa-menu.png' });
  // 麻雀：問題が必ず解けるか、正解を切ればツモの形か
  const mj = await pg.evaluate(() => {
    const M = DOPA.MJ; let bad = 0, n = 0; const okSizes = [];
    for (let r = 1; r <= 8; r++) for (let i = 0; i < 60; i++) {
      const q = M.gen(r); n++; if (!q) { bad++; continue; }
      okSizes.push(q.ok.size);
      for (const t of q.ok) { const h = q.h14.slice(); h.splice(h.indexOf(t), 1); if (!M.isWin(h.concat(q.W))) bad++; }
      if (q.h14.length !== 14) bad++;
    }
    return { n, bad, avgOk: (okSizes.reduce((a, c) => a + c, 0) / okSizes.length).toFixed(2), win: M.isWin([0, 1, 2, 9, 10, 11, 18, 19, 20, 27, 27, 27, 33, 33]) };
  });
  console.log('mahjong', JSON.stringify(mj));
  await pg.click('.gcard:nth-child(1)');
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: OUT + '/dopa-mj.png' });
  const tiles = await pg.$$('.hand .tile');
  console.log('tiles', tiles.length);
  await tiles[0].click(); await pg.waitForTimeout(500);
  await pg.screenshot({ path: OUT + '/dopa-mj2.png' });
  await pg.evaluate(() => DOPA.toMenu());
  // 777
  await pg.click('.gcard:nth-child(2)');
  await pg.waitForTimeout(2600);
  await pg.screenshot({ path: OUT + '/dopa-slot.png' });
  await pg.evaluate(() => DOPA.toMenu());
  // 空き缶
  await pg.click('.gcard:nth-child(3)');
  await pg.waitForTimeout(2500);
  const box = await (await pg.$('canvas.play')).boundingBox();
  for (let i = 0; i < 20; i++) { await pg.mouse.click(box.x + Math.random() * box.width, box.y + box.height * (0.15 + Math.random() * 0.45)); await pg.waitForTimeout(60); }
  await pg.mouse.click(box.x + box.width * 300 / 360, box.y + box.height * 440 / 520);
  await pg.waitForTimeout(150);
  await pg.screenshot({ path: OUT + '/dopa-can.png' });
  console.log('can score', await pg.evaluate('DOPA.H.score'));
  await pg.evaluate(() => DOPA.toMenu());
  // ゴミ箱
  await pg.click('.gcard:nth-child(4)');
  await pg.waitForTimeout(700);
  const box2 = await (await pg.$('canvas.play')).boundingBox();
  await pg.mouse.click(box2.x + 100, box2.y + 100);
  await pg.waitForTimeout(350);
  await pg.screenshot({ path: OUT + '/dopa-throw.png' });
  await pg.waitForTimeout(1500);
  console.log('throw', await pg.evaluate('JSON.stringify({s: DOPA.H.score, c: DOPA.H.combo})'));
  await pg.evaluate(() => DOPA.finish('テスト'));
  await pg.waitForTimeout(800);
  await pg.screenshot({ path: OUT + '/dopa-result.png' });
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})();

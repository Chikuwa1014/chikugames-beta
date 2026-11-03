// 777揃えのテスト：光った順に押すと当たり、まちがえるとハズレになるか
//   node chikuwa-dopamine/dev/test-slot.cjs <スクリーンショットの保存先>（http.server 8765 を先に起動）
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 390, height: 800 } });
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto('http://localhost:8765/chikuwa-dopamine/'); await pg.click('.gcard:nth-child(2)');
  for (let r = 0; r < 3; r++) {
    await pg.waitForFunction(() => DOPA.SLOT.test().accepting, null, { timeout: 8000 });
    const o = await pg.evaluate(() => DOPA.SLOT.test().order);
    const btns = await pg.$$('.stops button');
    for (const i of o) { await btns[i].dispatchEvent('pointerdown'); await pg.waitForTimeout(80); }
    await pg.waitForTimeout(500);
    if (r === 0) await pg.screenshot({ path: OUT + '/dopa-slot-win.png' });
  }
  await pg.waitForTimeout(1500);
  console.log('3回当たり', JSON.stringify(await pg.evaluate(() => ({ t: DOPA.SLOT.test(), score: DOPA.H.score }))));
  await pg.waitForFunction(() => DOPA.SLOT.test().accepting, null, { timeout: 8000 });
  const o = await pg.evaluate(() => DOPA.SLOT.test().order);
  const btns = await pg.$$('.stops button'); await btns[o[1]].dispatchEvent('pointerdown');
  await pg.waitForTimeout(300);
  console.log('まちがえた後', JSON.stringify(await pg.evaluate(() => DOPA.SLOT.test())), 'errors:', JSON.stringify(errs));
  await b.close();
})();

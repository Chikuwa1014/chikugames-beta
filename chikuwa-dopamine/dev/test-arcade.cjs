// アーケード（4つ連続）と麻雀牌の絵のテスト
//   node chikuwa-dopamine/dev/test-arcade.cjs <スクリーンショットの保存先>（http.server 8765 を先に起動）
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 390, height: 800 } });
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  pg.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.goto('http://localhost:8765/chikuwa-dopamine/');
  await pg.screenshot({ path: OUT + '/arc-menu.png' });
  // 牌の一覧（34枚）
  await pg.evaluate(() => {
    DOPA.play(DOPA.MJ); DOPA.H.running = false;
    const st = document.getElementById('stage'); st.innerHTML = '<div class="hand" id="all"></div>';

    for (let t = 0; t < 34; t++) { const el = DOPA.MJ.tileEl(t); document.getElementById('all').appendChild(el); }
  });
  await pg.waitForTimeout(200);
  await pg.screenshot({ path: OUT + '/arc-tiles.png' });
  await pg.evaluate(() => DOPA.toMenu());
  // アーケード：4つを順に終わらせる
  await pg.click('#arcBtn');
  const seen = [];
  for (let i = 0; i < 4; i++) {
    await pg.waitForTimeout(500);
    seen.push(await pg.evaluate(() => document.getElementById('ttl').textContent));
    await pg.evaluate(() => DOPA.H.score = 100 + DOPA.H.game.title.length);
    await pg.evaluate(() => DOPA.finish('テスト'));
    await pg.waitForTimeout(900);
    if (i === 0) await pg.screenshot({ path: OUT + '/arc-stage.png' });
    if (i < 3) await pg.click('#sNext');
  }
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: OUT + '/arc-result.png' });
  const r = await pg.evaluate(() => ({ title: document.getElementById('rTitle').textContent, total: document.getElementById('rScore').textContent, best: JSON.parse(localStorage.getItem('chikuwa-dopamine-v1')).best.arcade }));
  console.log('titles', JSON.stringify(seen)); console.log('result', JSON.stringify(r));
  // もう一回でアーケードが最初から
  await pg.click('#rAgain'); await pg.waitForTimeout(300);
  console.log('again', await pg.evaluate(() => document.getElementById('ttl').textContent));
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})();

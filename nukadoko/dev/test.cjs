// ぬか床そだてのテスト：リポジトリ直下で python3 -m http.server 8765 を起動してから node nukadoko/dev/test.cjs [画像の出力先フォルダ]
const { chromium } = require('playwright');
const OUT = process.argv[2] || '/tmp';
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e)));
  pg.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.goto('http://localhost:8765/nukadoko/');
  await pg.evaluate(() => NUKA.reset()); await pg.reload();
  await pg.screenshot({ path: OUT + '/nuka-title.png' });
  await pg.click('[data-m="free"]');
  // 棚から3つ漬ける
  await pg.click('.veg[data-id="きゅうり"]'); await pg.click('.veg[data-id="なす"]');
  await pg.click('.tab[data-cat="ha"]'); await pg.click('.veg[data-id="キャベツ"]');
  const info = await pg.evaluate(() => { const V = NUKA.VEG; return { n: V.length, uniq: new Set(V.map(v => v.id)).size, maxLv: Math.max(...V.map(v => v.lv)), lv1: V.filter(v => v.lv === 1).map(v => v.name).join(','), shapes: [...new Set(V.map(v => v.shape))].length, price: [Math.min(...V.map(v => v.cost)), Math.max(...V.map(v => v.sell))] }; });
  console.log('veg', JSON.stringify(info));
  console.log('slots', await pg.evaluate(() => NUKA.S.slots.filter(Boolean).map(s => s.id).join(',')), 'coins', await pg.evaluate('NUKA.S.coins'));
  // 8時間進める
  await pg.evaluate(() => NUKA.tick(8));
  // かき混ぜ：円をなぞる
  const box = await pg.locator('#cv').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2, r = box.width * 0.25;
  const lac0 = await pg.evaluate('NUKA.S.bed.lac');
  await pg.mouse.move(cx + r, cy); await pg.mouse.down();
  for (let i = 0; i <= 120; i++) { const a = i / 120 * Math.PI * 8; await pg.mouse.move(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  await pg.screenshot({ path: OUT + '/nuka-mix.png' });
  await pg.mouse.up();
  console.log('lac', lac0.toFixed(1), '->', (await pg.evaluate('NUKA.S.bed.lac')).toFixed(1), 'unmixed', await pg.evaluate('NUKA.S.bed.unmixed'));
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: OUT + '/nuka-play.png' });
  // きゅうりをタップして取り出す
  const pos = await pg.evaluate(() => { const cv = document.getElementById('cv'), rc = cv.getBoundingClientRect(); return { x: rc.left + (180 - 62) / 360 * rc.width, y: rc.top + (160 - 38) / 320 * rc.height }; });
  await pg.mouse.click(pos.x, pos.y);
  await pg.screenshot({ path: OUT + '/nuka-veg.png' });
  await pg.click('#vTake');
  console.log('result', await pg.textContent('#rName'), await pg.textContent('#rStars'), await pg.textContent('#rInfo'));
  await pg.screenshot({ path: OUT + '/nuka-result.png' });
  await pg.click('#rOk');
  // 長く放置するとカビ
  await pg.evaluate(() => NUKA.tick(30));
  console.log('mold', await pg.evaluate('NUKA.S.bed.mold'), 'q', (await pg.evaluate('NUKA.bedQ()')).toFixed(2));
  await pg.waitForTimeout(200);
  await pg.screenshot({ path: OUT + '/nuka-mold.png' });
  // 長いシミュレーション：きちんと世話をすると★3が取れて、レベルが上がるか
  const sim = await pg.evaluate(() => {
    NUKA.reset(); const S = NUKA.S, st = [0, 0, 0, 0];
    for (let h = 0; h < 24 * 20; h++) {
      NUKA.tick(1);
      if (S.bed.unmixed >= 9) NUKA.mixDone();
      if (S.bed.salt < 44) { S.coins -= 5; S.bed.salt += 12; }
      if (S.bed.water > 56) S.bed.water -= 10;
      S.slots.forEach((s, i) => { if (s && s.t >= NUKA.VEG.find(v => v.id === s.id).h) { const r = NUKA.take(i); st[r.R.stars]++; } });
      const pool = NUKA.VEG.filter(v => v.lv <= NUKA.level());
      NUKA.put(pool[h % pool.length].id);
    }
    return { day: S.day, lv: NUKA.level(), coins: S.coins, stars: st, sold: S.sold };
  });
  console.log('sim', JSON.stringify(sim));
  // 全部の食べ物を描いてみる（レベルを上げて、各タブの棚を撮る）
  await pg.evaluate(() => { NUKA.reset(); NUKA.S.xp = 99999; NUKA.S.coins = 99999; });
  await pg.reload(); await pg.click('[data-m="free"]');
  for (const c of ['mi', 'ha', 'ne', 'yama', 'kuda', 'hoka']) await pg.click(`.tab[data-cat="${c}"]`);
  await pg.evaluate(() => { const S = NUKA.S, V = NUKA.VEG; for (let i = 0; i < 6; i++) S.slots[i] = { id: V[(i * 17 + 3) % V.length].id, t: i * 5, qs: 0, rot: 0.2 }; });
  await pg.click('#dexBtn'); await pg.screenshot({ path: OUT + '/nuka-dex.png' }); await pg.click('#dexClose');
  await pg.waitForTimeout(200); await pg.screenshot({ path: OUT + '/nuka-all.png' });
  // β0.1.0 のセーブを読みかえられるか
  await pg.goto('http://localhost:8765/');
  await pg.evaluate(() => localStorage.setItem('nukadoko-save-v1', JSON.stringify({ v: 1, day: 3, hour: 8, coins: 50, xp: 5, earned: 0, sold: 0, bed: { lac: 40, salt: 50, water: 45, unmixed: 0, mold: false }, slots: [{ id: 'kyuri', t: 3, qs: 3, rot: 0 }, null, null, null, null, null], dex: { nasu: { best: 2, n: 1 } }, order: { id: 'daikon', day: 3, bonus: 40 } })));
  await pg.goto('http://localhost:8765/nukadoko/');
  console.log('migrate', await pg.evaluate(() => JSON.stringify([NUKA.S.slots[0].id, Object.keys(NUKA.S.dex), NUKA.S.order.id])));
  // チャレンジ：3日チャレンジを始めて、72時間たつと終わるか。ベストが残り、フリーのセーブは別のままか
  await pg.evaluate(() => { NUKA.reset(); NUKA.S.coins = 777; localStorage.setItem('nukadoko-save-v1', JSON.stringify(NUKA.S)); localStorage.removeItem('nukadoko-best-v1'); localStorage.removeItem('nukadoko-challenge-v1'); });
  await pg.reload();
  await pg.screenshot({ path: OUT + '/nuka-modes.png' });
  await pg.click('[data-m="3"]');
  await pg.click('.veg[data-id="きゅうり"]');
  await pg.evaluate(() => NUKA.tick(71));
  await pg.waitForTimeout(300);
  const mid = await pg.evaluate(() => ({ mode: NUKA.S.mode, day: document.getElementById('day').textContent, end: !document.getElementById('mEnd').hidden, saved: !!localStorage.getItem('nukadoko-challenge-v1') }));
  await pg.evaluate(() => NUKA.tick(1.2));
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: OUT + '/nuka-end.png' });
  const end = await pg.evaluate(() => ({ end: !document.getElementById('mEnd').hidden, text: document.getElementById('eInfo').textContent, best: localStorage.getItem('nukadoko-best-v1'), ch: localStorage.getItem('nukadoko-challenge-v1'), freeCoins: JSON.parse(localStorage.getItem('nukadoko-save-v1')).coins }));
  console.log('challenge', JSON.stringify(mid), JSON.stringify(end));
  await pg.click('#eTitleBtn'); await pg.click('[data-m="free"]');
  console.log('back to free', await pg.evaluate(() => [NUKA.S.mode, NUKA.S.coins]));
  await pg.evaluate(() => { NUKA.reset(); localStorage.removeItem('nukadoko-best-v1'); });
  console.log('errors', errs.length ? errs : 'none');
  await b.close();
})();

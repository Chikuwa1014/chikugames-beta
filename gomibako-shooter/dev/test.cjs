// スタイリッシュゴミ箱シューターのテスト：リポジトリ直下で python3 -m http.server 8765 を起動してから
// node gomibako-shooter/dev/test.cjs [スクリーンショットの保存先]
// 自動で 30 秒遊ぶ（いちばん近いゴミ箱かアイテムの前へ動く）・キーとドラッグで動く・ボーナス・結果画面・リトライ・エラー
const { chromium } = require('playwright');
const out = process.argv[2] || '/tmp';
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 390, height: 780 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e)));
  pg.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.goto('http://localhost:8765/gomibako-shooter/');
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: out + '/gomi-title.png' });
  await pg.click('#startBtn');
  await pg.waitForTimeout(300);
  // キーで動く
  const x0 = await pg.evaluate('GOMI.G.px');
  await pg.keyboard.down('ArrowLeft'); await pg.waitForTimeout(300); await pg.keyboard.up('ArrowLeft');
  const x1 = await pg.evaluate('GOMI.G.px');
  await pg.keyboard.down('d'); await pg.waitForTimeout(300); await pg.keyboard.up('d');
  const x2 = await pg.evaluate('GOMI.G.px');
  console.log('keys', Math.round(x0), Math.round(x1), Math.round(x2));
  // ドラッグで動く
  const box = await pg.locator('#cv').boundingBox();
  await pg.mouse.move(box.x + box.width / 2, box.y + box.height * 0.85); await pg.mouse.down();
  await pg.mouse.move(box.x + box.width / 2 + 60, box.y + box.height * 0.85, { steps: 4 }); await pg.mouse.up();
  console.log('drag', Math.round(x2), '->', Math.round(await pg.evaluate('GOMI.G.px')));
  // 自動で遊ぶ
  await pg.evaluate(() => {
    const M = window.GOMI;
    window._bot = setInterval(() => {
      const G = M.G; if (G.mode !== 'play') return;
      const it = G.items.filter(i => i.y > M.PY - 260).sort((a, b) => b.y - a.y)[0];
      const c = G.cans.filter(c => c.y > -120 && c.y < M.PY - 80).sort((a, b) => b.y - a.y)[0];
      const tx = it ? it.x : c ? c.x : null;
      if (tx !== null) G.px += Math.max(-14, Math.min(14, tx - G.px));
    }, 30);
  });
  await pg.waitForTimeout(8000);
  await pg.screenshot({ path: out + '/gomi-play1.png' });
  await pg.waitForTimeout(22000);
  await pg.screenshot({ path: out + '/gomi-play2.png' });
  const mid = await pg.evaluate(() => { const G = window.GOMI.G; return { el: G.el.toFixed(1), time: G.time.toFixed(1), score: G.score, rank: G.rank, combo: G.maxCombo, swish: G.swishes, hits: G.hits, shots: G.shots, lost: G.lost, items: G.items_got, up: G.up, boss: G.bossN }; });
  console.log('bot', JSON.stringify(mid));
  // ボーナス
  await pg.evaluate(() => { const M = window.GOMI; M.getItem({ kind: 'bonus' }); });
  await pg.waitForTimeout(1500);
  await pg.screenshot({ path: out + '/gomi-bonus.png' });
  const t1 = await pg.evaluate('GOMI.G.time'); await pg.waitForTimeout(1000); const t2 = await pg.evaluate('GOMI.G.time');
  console.log('bonus: time not decreasing', t2 >= t1, t1.toFixed(2), t2.toFixed(2), 'bonus', (await pg.evaluate('GOMI.G.bonus')).toFixed(1));
  await pg.evaluate(() => clearInterval(window._bot));
  await pg.evaluate(() => { window.GOMI.G.bonus = 0; window.GOMI.G.time = 0.01; });
  await pg.waitForTimeout(2500);
  console.log('over shown', await pg.isVisible('#mOver'));
  await pg.screenshot({ path: out + '/gomi-over.png' });
  await pg.keyboard.press('Space');
  await pg.waitForTimeout(300);
  console.log('retry mode', await pg.evaluate('GOMI.G.mode'));
  console.log('errors', errs.length ? errs : 'none');
  await b.close();
})();

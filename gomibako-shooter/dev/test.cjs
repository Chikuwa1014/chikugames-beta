// スタイリッシュゴミ箱シューターのテスト：リポジトリ直下で python3 -m http.server 8765 を起動してから
// node gomibako-shooter/dev/test.cjs [スクリーンショットの保存先]
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
  // 自動で遊ぶ：一番近いゴミ箱へ、フリック（ぴったりの向き）とタップを交互に
  await pg.evaluate(() => {
    const M = window.GOMI; let n = 0;
    window._bot = setInterval(() => {
      const G = M.G; if (G.mode !== 'play') return;
      const cs = G.cans.filter(c => c.y > -150 && c.y < M.PY - 60 && !(c._t > G.t - 0.6) && c.kind !== 'boss' || c.kind === 'boss' && c.y > 40).sort((a, b) => b.y - a.y);
      if (!cs.length) return;
      const c = cs[0]; c._t = G.t;
      if (n++ % 2) { const s = M.scr(c.x, c.y, M.canTop(c) * 0.6); M.tapAt(s.x, s.y); }
      else { const pp = M.scr(M.PX, M.PY, 1.2), s = M.scr(c.x, c.y, M.canTop(c)); M.flickDir(Math.atan2(s.y - pp.y, s.x - pp.x)); }
    }, 140);
  });
  await pg.waitForTimeout(6000);
  await pg.screenshot({ path: out + '/gomi-play1.png' });
  await pg.waitForTimeout(25000);
  await pg.screenshot({ path: out + '/gomi-play2.png' });
  const mid = await pg.evaluate(() => { const G = window.GOMI.G; return { el: G.el.toFixed(1), time: G.time.toFixed(1), score: G.score, rank: G.rank, maxRank: G.maxRank, combo: G.maxCombo, swish: G.swishes, hits: G.hits, shots: G.shots, lost: G.lost, boss: G.bossN, kills: G.bossKills }; });
  console.log('bot', JSON.stringify(mid));
  // 手で操作：タップとフリック
  await pg.evaluate(() => clearInterval(window._bot));
  const box = await pg.locator('#cv').boundingBox();
  const s0 = await pg.evaluate('GOMI.G.shots');
  await pg.mouse.click(box.x + box.width / 2, box.y + box.height * 0.3);
  await pg.waitForTimeout(200);
  await pg.mouse.move(box.x + box.width / 2, box.y + box.height * 0.8); await pg.mouse.down();
  await pg.mouse.move(box.x + box.width / 2 + 10, box.y + box.height * 0.7, { steps: 3 }); await pg.mouse.up();
  console.log('manual shots', await pg.evaluate('GOMI.G.shots') - s0);
  await pg.evaluate(() => { window.GOMI.G.time = 0.01; });
  await pg.waitForTimeout(2500);
  console.log('over shown', await pg.isVisible('#mOver'));
  await pg.screenshot({ path: out + '/gomi-over.png' });
  await pg.keyboard.press('Space');
  await pg.waitForTimeout(300);
  console.log('retry mode', await pg.evaluate('GOMI.G.mode'));
  console.log('errors', errs.length ? errs : 'none');
  await b.close();
})();

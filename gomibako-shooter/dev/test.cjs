// スタイリッシュゴミ箱シューターのテスト：リポジトリ直下で python3 -m http.server 8765 を起動してから
// node gomibako-shooter/dev/test.cjs [スクリーンショットの保存先]
// FREE を自動で 30 秒遊ぶ（いちばん近いゴミ箱かアイテムの前へ動く）・キーとドラッグで動く・トリック・障害物・ボーナス・結果画面・リトライ
// STAGE：選択画面・ステージ 1 クリア・ボスステージ・10 種類の街の絵・エラー
const { chromium } = require('playwright');
const out = process.argv[2] || '/tmp';
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 390, height: 780 } });
  const errs = [];
  pg.on('pageerror', e => { errs.push(String(e)); if (errs.length < 3) console.log('  !! pageerror', String(e).slice(0, 90)); });
  pg.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) { errs.push(m.text()); if (errs.length < 2) console.log('  !! console', m.text().slice(0, 300)); } });
  await pg.goto('http://localhost:8765/gomibako-shooter/');
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: out + '/gomi-title.png' });
  await pg.click('#freeBtn');
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
  // トリック：地面でジャンプ → 空中で技
  await pg.keyboard.press('ArrowUp'); await pg.waitForTimeout(150);
  const air = await pg.evaluate('!!GOMI.G.air'); await pg.keyboard.press('w'); await pg.waitForTimeout(50);
  console.log('ollie', air, 'tricks', await pg.evaluate('GOMI.G.tricksDone'));
  await pg.waitForTimeout(800);
  // キッカー・レール・障害物を目の前に置く
  const objT = async (type) => { await pg.evaluate(t => { const M = window.GOMI; M.G.objs.forEach(o => o.y = 9999); const o = M.spawnObj(t, M.G.px); o.y = M.PY - 120; }, type); await pg.waitForTimeout(1600); };
  await objT('kicker'); console.log('kicker → air seen', await pg.evaluate('GOMI.G.tricksDone >= 0'));
  await objT('rail'); console.log('after rail: tricks', await pg.evaluate('GOMI.G.tricksDone'));
  await pg.evaluate(() => { const M = window.GOMI; const o = M.spawnObj('cone', M.G.px); o.y = M.PY - 40; });
  await pg.waitForTimeout(250);
  console.log('cone hit → spd', (await pg.evaluate('GOMI.G.spd')).toFixed(2), 'hits', await pg.evaluate('GOMI.G.objHits'));
  await pg.evaluate(() => { const M = window.GOMI; const o = M.spawnObj('bike', M.G.px); o.vx = 0; o.y = M.PY - 300; });
  await pg.waitForTimeout(400); await pg.screenshot({ path: out + '/gomi-bike.png' });
  await pg.waitForTimeout(1200);
  console.log('bike: hits', await pg.evaluate('GOMI.G.objHits'), 'spd', (await pg.evaluate('GOMI.G.spd')).toFixed(2));
  // 自動で遊ぶ
  await pg.evaluate(() => {
    const M = window.GOMI;
    window._bot = setInterval(() => {
      const G = M.G; if (G.mode !== 'play') return;
      const it = G.items.filter(i => i.y > M.PY - 260).sort((a, b) => b.y - a.y)[0];
      const c = G.cans.filter(c => c.y > -120 && c.y < M.PY - 80).sort((a, b) => b.y - a.y)[0];
      const tx = it ? it.x : c ? c.x : null;
      if (tx !== null) G.px += Math.max(-14, Math.min(14, tx - G.px));
      if (G.objs.some(o => ['cone', 'bike', 'puddle'].includes(o.type) && !o.hit && o.y > M.PY - 60 && o.y < M.PY && Math.abs(o.x - G.px) < 40) && !G.air && !G.grind) M.trickInput();
    }, 30);
  });
  await pg.waitForTimeout(8000);
  await pg.screenshot({ path: out + '/gomi-play1.png' });
  await pg.waitForTimeout(22000);
  await pg.screenshot({ path: out + '/gomi-play2.png' });
  const mid = await pg.evaluate(() => { const G = window.GOMI.G; return { el: G.el.toFixed(1), time: G.time.toFixed(1), score: G.score, rank: G.rank, combo: G.maxCombo, swish: G.swishes, hits: G.hits, shots: G.shots, lost: G.lost, items: G.items_got, up: G.up, boss: G.bossN, tricks: G.tricksDone, objHits: G.objHits, smash: G.smashes, objs: G.objs.length }; });
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
  console.log('retry mode', await pg.evaluate('GOMI.G.mode'), await pg.evaluate('GOMI.G.gm'));
  // STAGE
  await pg.evaluate(() => window.GOMI.endGame()); await pg.waitForTimeout(1500);
  await pg.evaluate(() => { const S = window.GOMI.SAVE; S.stages = {}; });
  await pg.evaluate(() => window.GOMI.showStages()); await pg.waitForTimeout(200);
  console.log('stage buttons', await pg.locator('.sb').count(), 'open', await pg.locator('.sb:not([disabled])').count());
  await pg.screenshot({ path: out + '/gomi-stages.png' });
  await pg.click('.sb[data-n="1"]'); await pg.waitForTimeout(500);
  console.log('stage1', await pg.evaluate('JSON.stringify(GOMI.G.info)'));
  await pg.evaluate(() => { window.GOMI.G.dist = window.GOMI.G.info.goal * 10 + 5; }); await pg.waitForTimeout(2500);
  console.log('stage1 cleared', await pg.evaluate('GOMI.G.cleared'), 'over', await pg.isVisible('#mOver'), 'saved', await pg.evaluate('JSON.stringify(GOMI.SAVE.stages)'));
  await pg.screenshot({ path: out + '/gomi-clear.png' });
  await pg.keyboard.press('Space'); await pg.waitForTimeout(300);
  console.log('next stage', await pg.evaluate('GOMI.G.stage'));
  // ボスステージ
  await pg.evaluate(() => window.GOMI.startMode('stage', 10));
  await pg.waitForFunction(() => window.GOMI.G.cans.some(c => c.kind === 'boss'), null, { timeout: 20000 }); await pg.waitForTimeout(2500);
  const boss = await pg.evaluate(() => { const c = window.GOMI.G.cans.find(c => c.kind === 'boss'); return c ? { hp: c.hp, y: Math.round(c.y) } : null; });
  console.log('boss', JSON.stringify(boss)); await pg.screenshot({ path: out + '/gomi-boss10.png' });
  await pg.evaluate(() => { const c = window.GOMI.G.cans.find(c => c.kind === 'boss'); if (c) c.hp = 1; window._bt = setInterval(() => { if (c) window.GOMI.G.px = c.x; }, 20); });
  await pg.waitForFunction(() => window.GOMI.G.mode === 'over', null, { timeout: 40000 }).catch(() => {}); await pg.evaluate(() => clearInterval(window._bt));
  console.log('boss stage cleared', await pg.evaluate('GOMI.G.cleared'), await pg.evaluate('JSON.stringify(GOMI.SAVE.stages[10])'));
  // 10 種類の街
  for (let i = 0; i < 10; i++) {
    await pg.evaluate(n => { window.GOMI.startMode('stage', n * 10 + 1); }, i); await pg.waitForTimeout(1800);
    await pg.screenshot({ path: out + '/gomi-theme' + i + '.png' });
  }
  const fps = await pg.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
  console.log('fps', fps);
  console.log('errors', errs.length ? errs : 'none');
  await b.close();
})();

// ほどけ！おでん串のテスト：リポジトリ直下で python3 -m http.server 8765 を起動してから node hodoke-odensushi/dev/test.cjs
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 390, height: 800 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e)));
  pg.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.goto('http://localhost:8765/hodoke-odensushi/');
  await pg.screenshot({ path: '/tmp/hodoke-title.png' });
  await pg.click('#startBtn');
  const r = await pg.evaluate(() => {
    const H = window.HODOKE, out = { n: H.G.sk.length, solvable: H.solvable(H.G.sk), pulls: 0, stuck: 0, maxN: 0 };
    for (let i = 0; i < 300; i++) {
      const ok = H.G.sk.filter(s => H.blockers(s, H.G.sk).length === 0);
      if (!ok.length) { out.stuck++; break; }
      H.pull(ok[Math.floor(Math.random() * ok.length)]); out.pulls++;
      out.maxN = Math.max(out.maxN, H.G.sk.length);
      if (!H.solvable(H.G.sk)) { out.stuck++; break; }
      H.G.fire = 100;
    }
    out.level = H.G.level; out.score = H.G.score; out.knots = H.G.sk.filter(s => s.knot).length; out.thick = H.G.sk.filter(s => s.r > 5).length; out.n2 = H.G.sk.length;
    return out;
  });
  console.log(JSON.stringify(r));
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: '/tmp/hodoke-play.png' });
  const t = await pg.evaluate(() => {
    const H = window.HODOKE, cv = document.getElementById('cv'), rc = cv.getBoundingClientRect();
    const pos = s => ({ x: rc.left + (s.A.x * 0.7 + s.B.x * 0.3) / H.W * rc.width, y: rc.top + (s.A.y * 0.7 + s.B.y * 0.3) / H.H * rc.height });
    const ok = H.G.sk.filter(s => H.blockers(s, H.G.sk).length === 0), bad = H.G.sk.filter(s => H.blockers(s, H.G.sk).length > 0);
    return { ok: ok.length ? pos(ok[ok.length - 1]) : null, bad: bad.length ? pos(bad[bad.length - 1]) : null, score: H.G.score, fire: H.G.fire };
  });
  if (t.bad) {
    await pg.mouse.click(t.bad.x, t.bad.y);
    console.log('miss fire', t.fire.toFixed(1), '->', (await pg.evaluate('HODOKE.G.fire')).toFixed(1));
  }
  await pg.screenshot({ path: '/tmp/hodoke-miss.png' });
  if (t.ok) {
    await pg.mouse.click(t.ok.x, t.ok.y);
    console.log('pull score', t.score, '->', await pg.evaluate('HODOKE.G.score'));
  }
  await pg.evaluate('HODOKE.G.fire = 0.01');
  await pg.waitForSelector('#mOver:not([hidden])', { timeout: 3000 });
  await pg.screenshot({ path: '/tmp/hodoke-over.png' });
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})();

// チクネーターのテスト：リポジトリ直下で python3 -m http.server 8765 を起動してから
// node chikunator/dev/test.cjs [スクリーンショットの保存先]
// 1) 全部の食べ物を「正直なプレイヤー」（少しだけ答えをまちがえる）で当てさせて、当たった割合と問題数を出す
// 2) 画面を通しで操作（タイトル → 写真 → 質問 → 当てる → 勝ち／負けて教える）
const { chromium } = require('playwright');
const out = process.argv[2] || '/tmp';
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 390, height: 800 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e)));
  pg.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.goto('http://localhost:8765/chikunator/');
  await pg.evaluate(() => localStorage.clear());
  await pg.reload();
  await pg.waitForTimeout(300);
  // 1) 推理のしくみだけで全部ためす
  const sim = await pg.evaluate(() => {
    const C = window.CHIKU;
    const res = { n: 0, win: 0, qs: [], miss: [] };
    for (const noise of [0, 0.08]) {
      for (let t = 0; t < C.ITEMS.length; t++) {
        const target = C.ITEMS[t];
        C.newGame(); const G = C.G; let won = false, guesses = 0;
        while (true) {
          const r = C.ranked();
          if (!r.length) break;
          if ((r[0][0] >= C.GUESS_P && G.asked.length >= C.MIN_Q) || G.asked.length >= G.limit) {
            guesses++;
            if (r[0][1] === t) { won = true; break; }
            G.out.add(r[0][1]); C.recompute();
            if (G.asked.length >= G.limit || guesses >= 3 && G.asked.length >= G.limit - 2) break;
            continue;
          }
          const q = C.nextQuestion(); if (q < 0) break;
          const v = target.v[q];
          let a = v === 1 ? 1 : v === 0 ? 0 : [0.75, 0.25, null][Math.floor(Math.random() * 3)];
          if (a !== null && Math.random() < noise) a = a >= 0.5 ? 0.25 : 0.75;
          G.asked.push([q, a]); C.recompute();
        }
        res.n++; if (won) { res.win++; res.qs.push(G.asked.length); } else res.miss.push((noise ? '~' : '') + target.name);
      }
    }
    res.avgQ = (res.qs.reduce((a, b) => a + b, 0) / res.qs.length).toFixed(1);
    res.maxQ = Math.max(...res.qs);
    delete res.qs;
    return res;
  });
  console.log('sim', JSON.stringify(sim));
  // 2) 画面
  await pg.screenshot({ path: out + '/chiku-title.png' });
  await pg.click('#startBtn');
  await pg.waitForTimeout(2900);
  await pg.screenshot({ path: out + '/chiku-photo.png' });
  await pg.click('#readyBtn');
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: out + '/chiku-q.png' });
  // 「たこ焼き」を思い浮かべて正直に答える
  const target = await pg.evaluate(() => window.CHIKU.ITEMS.findIndex(i => i.name === 'たこ焼き'));
  for (let k = 0; k < 40; k++) {
    if (await pg.isVisible('#sGuess')) break;
    const a = await pg.evaluate(t => { const C = window.CHIKU, v = C.ITEMS[t].v[C.G.cur]; return v === 1 ? '1' : v === 0 ? '0' : 'u'; }, target);
    await pg.click(`.ans[data-a="${a}"]`);
    await pg.waitForTimeout(320);
    if (k === 2) { await pg.click('#undoBtn'); await pg.waitForTimeout(100); }
  }
  await pg.waitForTimeout(1300);
  await pg.screenshot({ path: out + '/chiku-guess.png' });
  console.log('guess', await pg.textContent('#gName'), 'q', await pg.evaluate('CHIKU.G.asked.length'));
  if ((await pg.textContent('#gName')) === 'たこ焼き') await pg.click('#yesBtn'); else await pg.click('#noBtn');
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: out + '/chiku-win.png' });
  // 負け：ありえない答え方をして 20 問へ。最後に知らない食べ物を教える
  await pg.click('#againBtn1');
  await pg.waitForTimeout(2900);
  await pg.click('#readyBtn');
  for (let k = 0; k < 80; k++) {
    await pg.waitForTimeout(300);
    if (await pg.isVisible('#sLose')) break;
    if (await pg.isVisible('#sGuess')) { await pg.waitForTimeout(1150); await pg.click('#noBtn'); continue; }
    await pg.click(`.ans[data-a="${k % 2 ? '1' : '0'}"]`);
  }
  await pg.screenshot({ path: out + '/chiku-lose.png' });
  await pg.fill('#ansIn', 'ちくわパフェ');
  await pg.click('#ansBtn');
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: out + '/chiku-taught.png' });
  const saved = await pg.evaluate(() => JSON.parse(localStorage.getItem('chikunator-v1')));
  console.log('saved', saved.plays, saved.wins, saved.loses, Object.keys(saved.learned));
  // 覚えた食べ物が次の表に入るか
  console.log('learned item', await pg.evaluate(() => { window.CHIKU.build(); return window.CHIKU.ITEMS.some(i => i.name === 'ちくわパフェ'); }));
  // 広告（?ad=test）：負けたときにボタンが出る
  await pg.goto('http://localhost:8765/chikunator/?ad=test');
  await pg.click('#startBtn'); await pg.waitForTimeout(2900); await pg.click('#readyBtn');
  await pg.evaluate(() => { const G = window.CHIKU.G; });
  for (let k = 0; k < 80; k++) {
    await pg.waitForTimeout(300);
    if (await pg.isVisible('#sLose')) break;
    if (await pg.isVisible('#sGuess')) { await pg.waitForTimeout(1150); await pg.click('#noBtn'); continue; }
    await pg.click(`.ans[data-a="${k % 2 ? '1' : '0'}"]`);
  }
  console.log('ad button', await pg.isVisible('#adBtn'));
  await pg.screenshot({ path: out + '/chiku-ad.png' });
  console.log('errors', errs.length ? errs : 'none');
  await b.close();
})();

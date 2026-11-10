#!/usr/bin/env node
/* おでん横丁の試作が、号口のカード（card.js）そのままを出しているかを調べる。
   使い方：node shisaku/yokocho/dev/check-cards.cjs <号口リポジトリの clone>
   (a) 写し（utsushi/）が号口の card.js と1バイトも変わらないか。ゲームの一覧が3か所でそろっているか
   (b) 号口のカードが読めた場合：画面に全項目・リンク・サムネイルが出ているか
   (c) 号口のカードが読めなかった場合（写しを使う）：(b) と同じ表示になるか
   差異があれば、期待と実際を出して終了コード 1。 */
const fs = require('fs'), path = require('path'), http = require('http'), vm = require('vm');
const { chromium } = require('playwright');

const GOGUCHI_ROOT = process.argv[2] && path.resolve(process.argv[2]);
if (!GOGUCHI_ROOT || !fs.existsSync(path.join(GOGUCHI_ROOT, 'index.html'))) {
  console.error('使い方：node shisaku/yokocho/dev/check-cards.cjs <号口リポジトリの clone>');
  process.exit(2);
}
const BETA_ROOT = path.resolve(__dirname, '..', '..', '..');
const YK_DIR = path.join(BETA_ROOT, 'shisaku', 'yokocho');
const GOGUCHI_URL = 'https://games.chikuwa-hookah.com';

const ng = [];           // 差異
let okCount = 0;
const ok = (label) => { okCount++; console.log('OK  ' + label); };
const bad = (label, detail) => { ng.push(label); console.log('NG  ' + label); detail.forEach(d => console.log('      ' + d)); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const show = v => JSON.stringify(v);

/* ---------- 号口・βのカードを Node 側で評価する ---------- */
function evalCards(files) {
  const sandbox = {}; sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: f });
  return sandbox.CHIKUWA_GAMES || [];
}
const listOf = (text, re) => [...text.matchAll(re)].map(m => m[1]);

const gogIndex = fs.readFileSync(path.join(GOGUCHI_ROOT, 'index.html'), 'utf8');
const GAMES = listOf(gogIndex, /<script src="\.\/([\w-]+)\/card\.js"/g);
const ykHtml = fs.readFileSync(path.join(YK_DIR, 'index.html'), 'utf8');
const ykGames = listOf(ykHtml, /<script src="https:\/\/games\.chikuwa-hookah\.com\/([\w-]+)\/card\.js"/g);
const m = ykHtml.match(/const GAMES = \[([^\]]*)\]/);
const ykFallback = m ? [...m[1].matchAll(/'([\w-]+)'/g)].map(x => x[1]) : [];
const utsushiGames = fs.readdirSync(path.join(YK_DIR, 'utsushi')).filter(f => f.endsWith('.card.js')).map(f => f.replace(/\.card\.js$/, ''));

/* ---------- (a) 写しと一覧 ---------- */
console.log('== (a) 写しと一覧');
{
  const sortS = a => a.slice().sort();
  const lists = [['試作が読む号口のカード', ykGames], ['試作の写しの読み込み順', ykFallback], ['utsushi/ の写し', utsushiGames]];
  for (const [name, arr] of lists) {
    if (same(sortS(arr), sortS(GAMES)) && new Set(arr).size === arr.length) ok(`ゲームの一覧：${name}（${arr.length}本）が号口の index.html と同じ`);
    else bad(`ゲームの一覧：${name}`, [`期待（号口 index.html）：${show(sortS(GAMES))}`, `実際：${show(sortS(arr))}`,
      `足りない：${show(GAMES.filter(g => !arr.includes(g)))}`, `余分：${show(arr.filter(g => !GAMES.includes(g)))}`]);
  }
  for (const g of GAMES) {
    const src = path.join(GOGUCHI_ROOT, g, 'card.js'), dst = path.join(YK_DIR, 'utsushi', g + '.card.js');
    if (!fs.existsSync(src)) { bad(`写し ${g}`, [`号口に ${g}/card.js が無い`]); continue; }
    if (!fs.existsSync(dst)) { bad(`写し ${g}`, [`utsushi/${g}.card.js が無い`]); continue; }
    const A = fs.readFileSync(src), B = fs.readFileSync(dst);
    if (A.equals(B)) ok(`写し ${g}：号口の card.js と同じ（${A.length} バイト）`);
    else bad(`写し ${g}`, [`期待：${A.length} バイト`, `実際：${B.length} バイト（中身がちがう）`]);
  }
}

/* ---------- 期待するカード ---------- */
const liveCards = [];
for (const g of GAMES) {
  const arr = evalCards([path.join(GOGUCHI_ROOT, g, 'card.js')]);
  arr.forEach(c => liveCards.push(Object.assign({ _game: g }, c)));
}
const betaCards = evalCards([path.join(BETA_ROOT, 'cards.js')]);
const expected = liveCards.concat(betaCards.map(c => Object.assign({ _game: null }, c))).filter(c => !c.adult)
  .sort((a, b) => (a.order - b.order) || ((a.beta ? 1 : 0) - (b.beta ? 1 : 0)));  // order が同じなら正式版が先
const verOf = c => c.beta ? 'β' + String(c.version).replace(/^β/, '') : 'v' + c.version;
const hrefOf = c => c._game ? `${GOGUCHI_URL}/${c._game}/` : c.href;
const modeOf = c => c.dev ? 'dev' : c.lock ? 'lock' : 'open';
const nameOf = c => c._game || (c.href || '').replace(/\/$/, '').split('/').pop() || c.title;

/* ---------- 試作を静的配信 ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = path.normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let f = path.join(BETA_ROOT, p);
  if (!f.startsWith(BETA_ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

/* ---------- ページ側で調べる ---------- */
async function collect(page) {
  /* 一覧のキャンバスを順に画面へ出して、ページ自身に描かせる（画面の外は描かない作りのため） */
  await page.evaluate(async () => {
    for (const th of window.YK_THUMBS || []) {
      th.canvas.scrollIntoView({ block: 'center' });
      await new Promise(res => setTimeout(res, 120));
    }
  });
  return page.evaluate(() => {
    const all = window.YK_ALL || [];
    const cg = window.CHIKUWA_GAMES || [];
    const txt = el => el ? el.textContent.trim() : null;
    const cards = all.map((g, i) => {
      const li = document.getElementById(g._id);
      const q = s => li ? li.querySelector(s) : null;
      const a = q('h3 a');
      return {
        i, order: g.order, mode: g._m, exists: !!li,
        title: txt(q('h3')), kicker: txt(q('.shina-k')), sub: txt(q('.shina-sub')), desc: txt(q('.shina-d')),
        tags: li ? [...li.querySelectorAll('.shina-tags li')].map(x => x.textContent) : null,
        version: txt(q('.nefuda')), href: a ? a.href : null,
        drawSame: typeof g.draw === 'function' && cg.some(x => x.draw === g.draw),
        drawIsFn: typeof g.draw === 'function',
        srcOrder: g.order
      };
    });
    const yatai = [...document.querySelectorAll('#street a.yatai')];
    const yataiHref = yatai.map(a => a.getAttribute('href'));
    const thumbs = (window.YK_THUMBS || []).map((th, k) => {
      const c = th.canvas, ctx = c.getContext('2d');
      const before = ctx.getImageData(0, 0, 160, 90).data;
      let nonEmpty = false; for (let p = 0; p < before.length; p += 4) if (before[p + 3] !== 0 && (before[p] | before[p + 1] | before[p + 2]) !== 0) { nonEmpty = true; break; }
      /* 期待：同じ draw を別の 160×90 に t = 0 で描く（開いていない屋台はモザイク） */
      const ref = document.createElement('canvas'); ref.width = 160; ref.height = 90;
      const rx = ref.getContext('2d'); th.game.draw(rx, 0);
      let exp = ref;
      if (th.mode !== 'open') {
        const mos = document.createElement('canvas'); mos.width = 32; mos.height = 18; const mx = mos.getContext('2d');
        mx.imageSmoothingEnabled = true; mx.drawImage(ref, 0, 0, 32, 18);
        exp = document.createElement('canvas'); exp.width = 160; exp.height = 90; const ex = exp.getContext('2d');
        ex.imageSmoothingEnabled = false; ex.drawImage(mos, 0, 0, 160, 90);
      }
      const e = exp.getContext('2d').getImageData(0, 0, 160, 90).data;
      /* 実際：一覧のキャンバスを t = 0 で描き直す */
      ctx.clearRect(0, 0, 160, 90); th.game._cx.clearRect(0, 0, 160, 90);
      th.redraw0();
      const a = ctx.getImageData(0, 0, 160, 90).data;
      let diff = 0; for (let p = 0; p < a.length; p++) if (a[p] !== e[p]) diff++;
      return { id: th.game._id, order: th.game.order, nonEmpty, diff, k };
    });
    return {
      source: window.YK_SOURCE, ready: document.documentElement.dataset.ykReady,
      cards, yataiCount: yatai.length, yataiHref, listCount: document.querySelectorAll('li.shina').length,
      thumbs, note: (() => { const n = document.getElementById('utsushi-note'); return n && !n.hidden ? n.textContent : ''; })(),
      mihon: document.querySelectorAll('.mihon, .yatai-mihon').length
    };
  });
}

/* ---------- 1回分の検査（label：(b) か (c)） ---------- */
async function run(browser, base, label, wantSource) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.route(`${GOGUCHI_URL}/**`, route => {
    if (wantSource === 'live') {
      const mm = route.request().url().match(/^https:\/\/games\.chikuwa-hookah\.com\/([\w-]+)\/card\.js/);
      const f = mm && path.join(GOGUCHI_ROOT, mm[1], 'card.js');
      if (f && fs.existsSync(f)) return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: fs.readFileSync(f) });
    }
    return route.abort();
  });
  await page.goto(base + '/shisaku/yokocho/index.html');
  await page.waitForFunction(() => document.documentElement.dataset.ykReady === '1', null, { timeout: 20000 });
  const r = await collect(page);
  await ctx.close();
  r.errors = errors;

  console.log(`== ${label}`);
  if (errors.length) bad(`${label} ページのエラー`, errors);
  if (r.source === wantSource) ok(`${label} YK_SOURCE = ${wantSource}`); else bad(`${label} YK_SOURCE`, [`期待：${wantSource}`, `実際：${r.source}`]);
  if (wantSource === 'utsushi') {
    const w = '号口のカードを読み込めなかったため、2026-11-10 時点の写しで表示しています。';
    if (r.note === w) ok(`${label} 写しを使っているお知らせ`); else bad(`${label} 写しを使っているお知らせ`, [`期待：${w}`, `実際：${r.note}`]);
  } else if (r.note) bad(`${label} お知らせ`, [`期待：出ない`, `実際：${r.note}`]);
  if (r.mihon === 0) ok(`${label} 「見本」の印が無い`); else bad(`${label} 「見本」の印`, [`期待：0`, `実際：${r.mihon}`]);

  const want = expected.length;
  if (r.yataiCount === want) ok(`${label} 屋台の数 ${want}`); else bad(`${label} 屋台の数`, [`期待：${want}`, `実際：${r.yataiCount}`]);
  if (r.listCount === want) ok(`${label} 一覧の数 ${want}`); else bad(`${label} 一覧の数`, [`期待：${want}`, `実際：${r.listCount}`]);
  if (r.cards.length === want) ok(`${label} YK_ALL の数 ${want}`); else bad(`${label} YK_ALL の数`, [`期待：${want}`, `実際：${r.cards.length}`]);
  const orders = r.cards.map(c => c.order);
  if (same(orders, expected.map(c => c.order))) ok(`${label} 並び順（order）`); else bad(`${label} 並び順（order）`, [`期待：${show(expected.map(c => c.order))}`, `実際：${show(orders)}`]);

  expected.forEach((e, k) => {
    const a = r.cards[k];
    const name = `${label} ${nameOf(e)}（order ${e.order}）`;
    if (!a) return bad(name, ['画面にカードが出ていない']);
    if (a.order !== e.order) return bad(name, [`並びの ${k} 番目 order 期待：${e.order} 実際：${a.order}`]);
    const diffs = [];
    const cmp = (what, exp, act) => { if (exp !== act) diffs.push(`${what} 期待：${show(exp)} 実際：${show(act)}`); };
    if (!a.exists) diffs.push('一覧の欄（li）が無い');
    cmp('title', e.title, a.title); cmp('kicker', e.kicker, a.kicker);
    if (e.sub) cmp('sub', e.sub, a.sub); else cmp('sub（無し）', null, a.sub);
    cmp('版数', verOf(e), a.version);
    const mode = modeOf(e);
    cmp('屋台の状態', mode, a.mode);
    if (mode === 'open') {   // 開発中・鍵付きの品は説明とタグを出さない作り
      cmp('desc', e.desc, a.desc);
      if (!same(e.tags || [], a.tags)) diffs.push(`tags 期待：${show(e.tags || [])} 実際：${show(a.tags)}`);
      cmp('リンク先', hrefOf(e), a.href);
      if (r.yataiHref.indexOf(hrefOf(e)) < 0) diffs.push(`屋台のリンク 期待：${hrefOf(e)} の屋台が一つある 実際：${show(r.yataiHref)}`);
    }
    if (!a.drawIsFn || !a.drawSame) diffs.push('draw が CHIKUWA_GAMES の同じカードの draw（===）ではない');
    if (!diffs.length) ok(name + ` ${e.title} ${verOf(e)}`); else bad(name, diffs);
  });

  // サムネイル
  if (r.thumbs.length === want) ok(`${label} サムネイルの数 ${want}`); else bad(`${label} サムネイルの数`, [`期待：${want}`, `実際：${r.thumbs.length}`]);
  r.thumbs.forEach((t, k) => {
    const e = expected[k];
    const name = `${label} サムネイル ${e ? nameOf(e) : t.order}`;
    const diffs = [];
    if (!t.nonEmpty) diffs.push('キャンバスが空');
    if (t.diff) diffs.push(`t=0 で描いた絵と一致しない（ちがうバイト数 ${t.diff}）`);
    if (!diffs.length) ok(name); else bad(name, diffs);
  });
  return r;
}

(async () => {
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  let b, c;
  try {
    b = await run(browser, base, '(b) 号口のカードが読めたとき', 'live');
    c = await run(browser, base, '(c) 号口のカードが読めないとき', 'utsushi');
  } finally { await browser.close(); server.close(); }
  console.log('== (b) と (c) の比較');
  const strip = r => r.cards.map(x => ({ order: x.order, mode: x.mode, title: x.title, kicker: x.kicker, sub: x.sub, desc: x.desc, tags: x.tags, version: x.version, href: x.href }));
  if (same(strip(b), strip(c))) ok('(c) の表示は (b) と同じ内容'); else {
    const d = [];
    strip(b).forEach((x, i) => { if (!same(x, strip(c)[i])) d.push(`order ${x.order} (b)：${show(x)}`, `         (c)：${show(strip(c)[i])}`); });
    bad('(c) の表示が (b) とちがう', d.length ? d : [`件数 (b)：${b.cards.length} (c)：${c.cards.length}`]);
  }
  console.log('');
  if (ng.length) { console.log(`差異あり：${ng.length} 件（OK ${okCount} 件）`); process.exit(1); }
  console.log(`差異なし：号口のカード ${liveCards.filter(c => !c.adult).length} 本 + βのカード ${betaCards.filter(c => !c.adult).length} 本、チェック ${okCount} 項目すべて OK`);
})().catch(e => { console.error(e); try { server.close(); } catch (_) {} process.exit(1); });

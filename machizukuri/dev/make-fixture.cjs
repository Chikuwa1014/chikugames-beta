/* 荒野開拓記（仮） 古い版の保存の見本を作る（dev フォルダは .assetsignore で公開されない）
   使い方：古い版を別の場所へ取り出して（`git archive <コミット> machizukuri common | tar -x -C <場所>`）そこで別の http.server を動かし、
     node machizukuri/dev/make-fixture.cjs --base http://localhost:8001/machizukuri/ --out machizukuri/dev/fixtures/save-v1-b010.json
   中では window.MZ の関数だけで次の街を作り、localStorage['machizukuri-save'] の文字列をそのまま書き出す：
   小屋から土の道 10 マス・木の家 3・れんがの家 1・井戸 1・畑 3・作業台・かまど・炉・たき火・きこり小屋 1（1 軒はこわして作り直す）、
   採れる物を 10 個ほど採る（taken に正の数。建物の下で −1 も入る）、人口 10・段階 1、三人称。MZ.tick で timers.jobs を進める。 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://localhost:8000/machizukuri/'), OUT = arg('out', path.join(__dirname, 'fixtures', 'save-v1.json'));
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await br.newContext({ viewport: { width: 390, height: 780 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('machizukuri-gfx', 'low'); } catch (e) { /* なし */ } });
  const pg = await ctx.newPage(), errs = [];
  pg.on('pageerror', e => errs.push('pageerror ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto(BASE);
  await pg.click('#tbtn .go', { timeout: 90000 });
  await pg.waitForFunction(() => window.MZ && MZ.started, null, { timeout: 180000 });
  const info = await pg.evaluate(() => {
    const W = MZ.world, s = MZ.state.player, inArea = nd => nd.gx >= 52 && nd.gx <= 76 && nd.gz >= 57 && nd.gz <= 69;
    /* 採れる物を 10 個ほど採る（草むら・石ころ。建てる場所の外で） */
    const near = W.nodes.filter(nd => (nd.k === 'bush' || nd.k === 'stone') && !inArea(nd)).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)).slice(0, 10);
    near.forEach(nd => { s.x = nd.x; s.z = nd.z - 1.4; s.yaw = 0; s.pitch = 0; MZ.hit(); });
    /* 建てる場所の採れる物は、時間つきで消す（建物の下になった物は −1 になる） */
    W.nodes.forEach(nd => { if (inArea(nd) && W.nodeActive(nd.idx)) W.take(nd.idx, 400); });
    s.x = -12; s.z = -6; s.yaw = 0.15; s.pitch = 0.1;
    Object.keys(MZ.state.inv).forEach(k => { MZ.state.inv[k] = 9999; });   // 試験用：材料を持たせる
    MZ.state.pop = 10; MZ.town.stageCheck(true);                              // 試験用：人口 10・段階 1（れんがの家・きこり小屋を建てるため）
    const P = (k, x, z, r) => { if (!MZ.place(k, x, z, r || 0)) throw new Error('置けない ' + k + ' ' + x + ',' + z); };
    for (let g = 59; g <= 68; g++) P('road', g, 61);
    [59, 62, 65].forEach(g => P('house', g, 62));
    P('bhouse', 68, 62);
    P('well', 57, 62); P('bench', 56, 59); P('kiln', 54, 61); P('furnace', 54, 63); P('fire', 57, 64);
    [59, 62, 65].forEach(g => P('field', g, 65));
    P('lumber', 70, 59);
    P('house', 71, 64);
    const id = MZ.town.list().find(b => b.t === 'house' && b.x === 71).id;
    if (!MZ.remove(id)) throw new Error('こわせない');
    P('house', 71, 64, 1);
    MZ.state.player.view = 3;
    MZ.state.timers.migrate = 0; MZ.tick(30);
    MZ.saveNow();
    return { houses: MZ.town.list().length, nextId: MZ.state.nextId, pop: MZ.state.pop, stage: MZ.state.stage };
  });
  const raw = await pg.evaluate(() => localStorage.getItem('machizukuri-save'));
  const box = JSON.parse(raw), d = box.data, ch = d.chunks['0,0'];
  const tk = Object.values(ch.taken);
  console.log(JSON.stringify(info), 'v=' + box.v, 'chunks=' + Object.keys(d.chunks).join('|'), 'taken+=' + tk.filter(v => v > 0).length, 'taken-=' + tk.filter(v => v < 0).length, 'jobs=' + JSON.stringify(d.timers.jobs));
  if (box.v !== 1 || Object.keys(d.chunks).join() !== '0,0' || d.pop < 10 || d.stage !== 1 || errs.length) { console.error('見本がおかしい', errs.slice(0, 3)); process.exit(3); }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, raw);
  await br.close();
})().catch(e => { console.error(e); process.exit(2); });

/* 荒野開拓記（仮） 確かめ用スクリプト（dev フォルダは .assetsignore で公開されない）
   使い方：リポジトリ直下で `python3 -m http.server 8000` を動かしてから
     node machizukuri/dev/test.cjs [スクリーンショットを置く場所]
   Playwright の Chromium は WebGL のために --use-gl=angle --use-angle=swiftshader を付ける（FPS は 2〜3。速さは見ない）。
   ゲームの中は window.MZ の関数（MZ.hit・MZ.craft・MZ.place・MZ.remove・MZ.tick）で進める。 */
const { chromium } = require('playwright');
const path = require('path');
const ARGS = process.argv.slice(2), PART = +(ARGS.find(a => /^[1-5]$/.test(a)) || 0), DIR = ARGS.find(a => !/^[1-5]$/.test(a));
const OUT = (DIR || path.join(require('os').tmpdir(), 'machizukuri-shots')) + '/';
require('fs').mkdirSync(OUT, { recursive: true });
const URL = process.env.URL || 'http://localhost:8000/machizukuri/';
const results = [], errs = [];
/* ふだんは速さのために低で回す（swiftshader では高の SSAO2 などが重い）。画質の項目だけ高・中も使う */
const LOW = () => { try { if (!localStorage.getItem('machizukuri-gfx')) localStorage.setItem('machizukuri-gfx', 'low'); } catch (e) { /* なし */ } };
/* 区切り：node test.cjs 1〜4 でその区切りだけ（1＝PC の通し・スマホ、2＝読み込み・待ち行列・資産が読めない、3＝画質の切りかえ・ボタン・自動、4＝三角形・GLB の表示）。引数なしは全部 */
const want = n => !PART || PART === n, counts = {};
let cur = 0, before = null;
const ok = (name, cond, detail) => { counts[cur] = (counts[cur] || 0) + 1; results.push({ name, ok: !!cond, detail: detail === undefined ? '' : String(detail) }); console.log((cond ? '通った  ' : '通らない') + ' ' + name + (detail !== undefined ? '  [' + detail + ']' : '')); };

/* ページの中で使う補助（テスト用。ゲームの状態は MZ の関数で動かす） */
const HELPERS = () => {
  const KINDS = { grass: ['bush'], stick: ['bush'], stone: ['stone', 'rock'], log: ['tree'], clay: ['clay'], ore: ['iron'] };
  const TT = window.TT = {
    home() { const s = MZ.state.player; s.x = 11; s.z = -18; s.yaw = 0; s.pitch = 0; },
    goto(nd) { const s = MZ.state.player; s.x = nd.x; s.z = nd.z - 1.4; s.yaw = 0; s.pitch = 0; },
    nearest(kinds, fx, fz) {
      let b = null, bd = 1e9;
      MZ.world.nodes.forEach(nd => { if (!kinds.includes(nd.k) || !MZ.world.nodeActive(nd.idx)) return; const d = Math.hypot(nd.x - fx, nd.z - fz); if (d < bd) { bd = d; b = nd; } });
      return b;
    },
    gather(item, n) {
      let guard = 0;
      while (MZ.state.inv[item] < n) {
        if (guard++ > 3000) throw new Error('集められない ' + item);
        const s = MZ.state.player;
        let nd = null; for (const k of KINDS[item]) { nd = TT.nearest([k], s.x, s.z); if (nd) break; }
        if (!nd) throw new Error('採れる物がない ' + item);
        TT.goto(nd); MZ.hit();
      }
    },
    /* item を n 個以上にする（集める・作る） */
    ensure(item, n) {
      if (MZ.state.inv[item] >= n) return;
      if (KINDS[item]) return TT.gather(item, n);
      const rec = MZ.RECIPES.find(r => r.give && r.give[item]);
      while (MZ.state.inv[item] < n) {
        Object.keys(rec.cost).forEach(k => TT.ensure(k, rec.cost[k]));
        TT.home();
        if (!MZ.craft(rec.key)) throw new Error('作れない ' + rec.key + ' ' + MZ.craftReason(rec));
      }
    },
    ensureCost(cost) { Object.keys(cost).forEach(k => TT.ensure(k, cost[k])); },
    build(key, gx, gz, r) { TT.ensureCost(MZ.BUILDS[key].cost); TT.home(); return MZ.place(key, gx, gz, r || 0); },
    clearArea(x0, z0, x1, z1) {
      MZ.world.nodes.forEach(nd => {
        if (nd.gx < x0 || nd.gx > x1 || nd.gz < z0 || nd.gz > z1) return;
        while (MZ.world.nodeActive(nd.idx)) {
          const d = MZ.NODES[nd.k];
          if (d.tool && MZ.state.tools[d.tool] < d.need) { MZ.world.take(nd.idx, 300); break; }   // 道具が足りない物（鉄の鉱脈）は、このくらいの範囲にはない
          TT.goto(nd); MZ.hit();
        }
      });
    },
    notes() { return [...document.querySelectorAll('.note')].map(e => e.textContent); }
  };
};

(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const watch = page => {
    page.on('pageerror', e => errs.push('pageerror ' + e.message));
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()); });
  };
  const ev = (page, f, a) => page.evaluate(f, a);
  const frames = (page, n) => page.evaluate(n => new Promise(r => { let i = 0; const f = () => { if (++i >= n) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), n || 3);

  /* ================= PC ================= */
  if (want(1)) {
  cur = 1;
  const ctx = await br.newContext({ viewport: { width: 1200, height: 750 } });
  await ctx.addInitScript(LOW);
  const page = await ctx.newPage(); watch(page);
  await page.goto(URL);
  ok('タイトルに「はじめる」（保存なし）', (await page.textContent('#tbtn')).includes('はじめる'));
  await page.screenshot({ path: OUT + '01-pc-title.png' });
  await page.click('#tbtn .go');
  await page.waitForFunction(() => window.MZ && MZ.started);
  await ev(page, HELPERS);
  await frames(page, 3);
  ok('荒野に立てる（はじめる）', await ev(page, () => MZ.started && MZ.state.player.z === -7));
  const st = await ev(page, () => MZ.stats());
  ok('描く呼び出し（active メッシュ）が種類の数ぐらい（低。空・遠景・草が増えるので 70 未満）', st.activeMeshes < 70 && st.nodes === 444, JSON.stringify(st));
  ok('目標の 1 行が出る', (await page.textContent('#goal')).includes('草'));

  const goalIs = async (name, sub) => { const t = await ev(page, () => MZ.currentGoal()); ok('目標：' + name, t.includes(sub), t); };
  /* 歩く・見回す・端 */
  let z0 = await ev(page, () => MZ.state.player.z);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW');
  ok('W で前へ歩ける', (await ev(page, () => MZ.state.player.z)) > z0 + 0.3, z0 + ' → ' + await ev(page, () => MZ.state.player.z));
  let yaw0 = await ev(page, () => MZ.state.player.yaw);
  await page.mouse.move(600, 400); await page.mouse.down(); await page.mouse.move(700, 400, { steps: 5 }); await page.mouse.up();
  ok('マウスで見回せる', Math.abs((await ev(page, () => MZ.state.player.yaw)) - yaw0) > 0.01);
  await ev(page, () => { if (document.pointerLockElement) document.exitPointerLock(); }); await page.waitForTimeout(400);   // マウス固定が遅れて入ると向きが変わるため
  await ev(page, () => { const s = MZ.state.player; s.x = 118.5; s.z = 30; s.yaw = Math.PI / 2; });
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1800); await page.keyboard.up('KeyW');
  const xe = await ev(page, () => MZ.state.player.x);
  ok('土地の端（東）で止まる', xe <= 119.51 && xe > 118, xe);
  await ev(page, () => { const s = MZ.state.player; s.x = -30; s.z = -118.5; s.yaw = Math.PI; });
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1800); await page.keyboard.up('KeyW');
  const ze = await ev(page, () => MZ.state.player.z);
  ok('土地の端（南）で止まる', ze >= -119.51 && ze < -118, ze);
  await ev(page, () => { const s = MZ.state.player; s.x = 0; s.z = -7; s.yaw = 0; });

  /* 採集 */
  await ev(page, () => { TT.gather('grass', 3); });
  const inv1 = await ev(page, () => ({ g: MZ.state.inv.grass, s: MZ.state.inv.stick }));
  ok('草むらで草と枝が増える', inv1.g >= 3 && inv1.s >= 1, JSON.stringify(inv1));
  await goalIs('草を集めたら「ロープを作ろう」', 'ロープ');
  await ev(page, () => { TT.gather('log', 4); });
  ok('木で原木が増える', (await ev(page, () => MZ.state.inv.log)) >= 4);
  await ev(page, () => { TT.gather('stone', 2); });
  ok('石ころで石が増える', (await ev(page, () => MZ.state.inv.stone)) >= 2);
  /* さびたつるはしで鉄の鉱脈 */
  await ev(page, () => { const s = MZ.state.player, nd = TT.nearest(['iron'], s.x, s.z); TT.goto(nd); MZ.player.updateAim(); const before = MZ.state.inv.ore; MZ.hit(); window.__ironBefore = before; });
  await frames(page, 4);
  const ironTxt = await ev(page, () => TT.notes().join('|') + '#' + document.querySelector('#aim').textContent);
  ok('さびたつるはしで鉄の鉱脈→「石のつるはしが必要」', ironTxt.includes('石のつるはしが必要') && (await ev(page, () => MZ.state.inv.ore === window.__ironBefore)), ironTxt);
  /* 道具の速さ：木の hp 5 → さびた 5 回・石 3 回 */
  const hits = await ev(page, () => {
    const s = MZ.state; const t = k => TT.nearest(['tree'], s.player.x, s.player.z);
    const count = () => { const nd = t(); TT.goto(nd); let n = 0; MZ.player.updateAim(); while (MZ.world.nodeActive(nd.idx) && n < 50) { MZ.hit(); n++; } return n; };
    return [count()];
  });
  ok('さびた斧で木は 5 回', hits[0] === 5, hits);

  /* ロープ・作業台 */
  ok('ロープを作れる（作業台なし）', await ev(page, () => { TT.ensure('rope', 1); return MZ.state.inv.rope >= 1; }));
  await goalIs('ロープ・原木・石がそろったら「作業台を建てよう」', '作業台');
  ok('作業台がないと板は作れない', await ev(page, () => { TT.gather('log', 2); TT.home(); return MZ.craft('plank') === false && MZ.craftReason(MZ.RECIPES.find(r => r.key === 'plank')).includes('作業台'); }));
  await ev(page, () => { TT.clearArea(55, 44, 70, 60); });
  ok('作業台を建てた', await ev(page, () => TT.build('bench', 64, 53, 0)));
  await goalIs('作業台を建てたら「石のつるはし」', '石のつるはし');
  ok('作業台の近くで板を作れる', await ev(page, () => { TT.home(); const b = MZ.state.inv.plank; return MZ.craft('plank') && MZ.state.inv.plank === b + 2; }));
  ok('作業台から遠いと板は作れない', await ev(page, () => { const s = MZ.state.player; s.x = -40; s.z = -40; return MZ.craft('plank') === false; }));
  ok('石の斧・石のつるはしを作る', await ev(page, () => { TT.ensureCost(MZ.RECIPES.find(r => r.key === 'pick2').cost); TT.home(); const a = MZ.craft('pick2'); TT.ensureCost(MZ.RECIPES.find(r => r.key === 'axe2').cost); TT.home(); const b = MZ.craft('axe2'); return a && b && MZ.state.tools.pick === 2 && MZ.state.tools.axe === 2; }));
  await goalIs('つるはしを作ったら「土の道」', '土の道');
  ok('作った道具はもう作れない', await ev(page, () => MZ.craftReason(MZ.RECIPES.find(r => r.key === 'pick2')) === '作った'));
  const ironHits = await ev(page, () => { const s = MZ.state.player, nd = TT.nearest(['iron'], s.x, s.z); TT.goto(nd); MZ.player.updateAim(); let n = 0, b = MZ.state.inv.ore; while (MZ.world.nodeActive(nd.idx) && n < 50) { MZ.hit(); n++; } return [n, MZ.state.inv.ore - b]; });
  ok('石のつるはしで鉄の鉱脈（10 回・鉄鉱石 4）', ironHits[0] === 10 && ironHits[1] === 4, ironHits);
  const treeHits = await ev(page, () => { const s = MZ.state.player, nd = TT.nearest(['tree'], s.x, s.z); TT.goto(nd); MZ.player.updateAim(); let n = 0; while (MZ.world.nodeActive(nd.idx) && n < 50) { MZ.hit(); n++; } return n; });
  ok('石の斧で木は 3 回', treeHits === 3, treeHits);

  /* 置けない場所で赤・置けない（建築モードの見本） */
  await ev(page, () => { TT.ensureCost(MZ.BUILDS.house.cost); TT.home(); MZ.startBuild('house'); });
  const probe = async (label, setup, expectOk, expectText) => {
    await ev(page, setup); await page.waitForTimeout(700); await frames(page, 3);
    const r = await ev(page, () => ({ ok: MZ.build.ok, reason: MZ.build.reason, mat: MZ.world.scene.getMeshByName('preview').material.name }));
    ok(label, r.ok === expectOk && r.mat === (expectOk ? 'pvOk' : 'pvBad') && (!expectText || r.reason.includes(expectText)), JSON.stringify(r));
  };
  await probe('木の上は赤で置けない', () => { const s = MZ.state.player, t = TT.nearest(['tree'], 40, 40); s.x = t.x; s.z = t.z - 6; s.yaw = 0; s.pitch = Math.atan(1.6 / 6); }, false, '木');
  const spot = await ev(page, () => { /* 何もない所を探す */ for (let gz = 20; gz < 40; gz++) for (let gx = 80; gx < 100; gx++) { if (MZ.town.canPlace('house', gx, gz).ok && MZ.town.canPlace('house', gx + 1, gz + 1).ok && MZ.town.canPlace('house', gx - 1, gz - 1).ok) return [MZ.cellPos(gx) + 1, MZ.cellPos(gz) + 1]; } });
  await ev(page, sp => { const s = MZ.state.player; s.x = sp[0]; s.z = sp[1] - 6; s.yaw = 0; s.pitch = Math.atan(1.6 / 6); }, spot);
  await page.waitForTimeout(700); await frames(page, 3);
  const g = await ev(page, () => ({ ok: MZ.build.ok, reason: MZ.build.reason, mat: MZ.world.scene.getMeshByName('preview').material.name }));
  ok('空き地は緑で置ける（ねらいを当てる）', g.ok && g.mat === 'pvOk', JSON.stringify(g));
  await probe('建物（作業台）の上は赤で置けない', () => { const s = MZ.state.player; s.x = 9; s.z = -13 - 6; s.yaw = 0; s.pitch = Math.atan(1.6 / 6); }, false, '建物');
  await probe('自分の体の上は赤で置けない', () => { const s = MZ.state.player; s.x = 50; s.z = 50; s.yaw = 0; s.pitch = 1.3; }, false, '自分の体');
  await probe('土地の外は赤で置けない', () => { const s = MZ.state.player; s.x = 0; s.z = 118; s.yaw = 0; s.pitch = 0; }, false, '土地の外');
  ok('赤のときは置く操作で建たない', await ev(page, () => { const n = MZ.state.chunks['0,0'].layers.ground.length; MZ.placeHere(); return MZ.state.chunks['0,0'].layers.ground.length === n; }));
  await ev(page, () => { TT.home(); MZ.state.player.pitch = 0; });
  await page.keyboard.press('KeyR');
  ok('R で 90 度回る', (await ev(page, () => MZ.build.r)) === 1);
  await page.keyboard.press('KeyQ');
  ok('Q でやめる', (await ev(page, () => MZ.build.mode)) === 'none');
  await page.screenshot({ path: OUT + '02-pc-redcheck.png' });

  /* 道・家・井戸・畑（置けて、置いたあとも続けて建築モード） */
  const roads = await ev(page, () => { let n = 0; for (let z = 58; z >= 48; z--) if (TT.build('road', 59, z, 0)) n++; return n; });
  ok('道を小屋からのばせる（11 マス）', roads === 11, roads);
  await goalIs('道をのばしたら「木の家」', '木の家');
  const homes = await ev(page, () => [[60, 56], [60, 54], [60, 52], [57, 56], [57, 54]].map(p => TT.build('house', p[0], p[1], 0)));
  ok('家を 5 軒置ける', homes.every(Boolean), homes);
  await goalIs('家を建てたら「井戸」', '井戸');
  ok('井戸を置ける', await ev(page, () => TT.build('well', 63, 56, 0)));
  await goalIs('井戸を建てたら「畑」', '畑');
  const fields = await ev(page, () => [[65, 56], [67, 56], [65, 58]].map(p => TT.build('field', p[0], p[1], 0)));
  ok('畑を 3 つ置ける', fields.every(Boolean), fields);
  await goalIs('畑をつくったら「移住者を待とう」', '移住者');
  const info1 = await ev(page, () => MZ.town.info);
  ok('上限＝家 10・水 10・食料 12 の最小 10', info1.homeSum === 10 && info1.water === 10 && info1.food === 12 && info1.cap === 10, JSON.stringify(info1));
  /* 道につながらない家・こわす（半分もどる） */
  const un = await ev(page, () => { TT.ensureCost(MZ.BUILDS.house.cost); TT.home(); const ok = MZ.place('house', 80, 70, 0); return { ok, unc: MZ.town.info.unconnected, cap: MZ.town.info.cap }; });
  await page.waitForFunction(() => document.querySelector('#pop').textContent.includes('つながっていない家がある'), null, { timeout: 15000 }).catch(() => {});   // 低でも 1 フレームが重いので、出るまで待つ
  ok('道につながらない家は数えず、HUD に出る', un.ok && un.unc === 1 && un.cap === 10 && (await page.textContent('#pop')).includes('つながっていない家がある'), JSON.stringify(un));
  const rm = await ev(page, () => {
    const L = MZ.state.chunks['0,0'].layers.ground, b = L.find(x => x.x === 80 && x.z === 70), before = Object.assign({}, MZ.state.inv), c = MZ.BUILDS.house.cost;
    const removed = MZ.remove(b.id); const after = MZ.state.inv;
    return { removed, okAll: Object.keys(c).every(k => after[k] - before[k] === Math.floor(c[k] / 2)), still: L.some(x => x.id === b.id), owner: MZ.world.owner[MZ.ci(80, 70)] };
  });
  ok('こわすと材料が半分（切り捨て）もどる', rm.removed && rm.okAll && !rm.still && rm.owner === 0, JSON.stringify(rm));
  ok('小屋はこわせない', await ev(page, () => MZ.remove(1) === false));
  ok('置いた物を置き直せる（こわした所に建つ）', await ev(page, () => TT.build('road', 59, 47, 0)));

  /* 移住 */
  await ev(page, () => { MZ.tick(9.1); });
  ok('時間を進めると人が 1 人ずつ来る', (await ev(page, () => MZ.state.pop)) === 1);
  await ev(page, () => { MZ.tick(100); });
  const pop = await ev(page, () => ({ pop: MZ.state.pop, stage: MZ.state.stage }));
  ok('人口が上限（10）まで増える', pop.pop === 10, JSON.stringify(pop));
  ok('人口 10 で集落（段階 1）になる', pop.stage === 1);
  await goalIs('人口が上限まで来たら「かまど」', 'かまど');
  await page.waitForTimeout(400); await frames(page, 6);
  ok('HUD：人口・上限・家・水・食料', /人口 10／上限 10/.test(await page.textContent('#pop')), await page.textContent('#pop'));
  const lowTxt = await ev(page, () => { const b = MZ.state.chunks['0,0'].layers.ground.find(x => x.t === 'well'); MZ.remove(b.id); MZ.tick(1); MZ.ui.acc = 1; MZ.ui.update(0.2); return document.querySelector('#pop .low') && document.querySelector('#pop .low').textContent; });
  ok('足りない物（水）を色で目立たせる', lowTxt && lowTxt.includes('水'), lowTxt);
  await ev(page, () => { TT.build('well', 63, 56, 0); MZ.tick(1); });
  /* 住民の姿 */
  await ev(page, () => { MZ.town.render(1); });
  const people = await ev(page, () => ({ n: MZ.town.residents.length, drawn: MZ.town.pgroups.reduce((a, g) => a + g.mesh.thinInstanceCount, 0) }));
  ok('住民の姿が人口の数だけ描かれる', people.n === 10 && people.drawn === 10, JSON.stringify(people));
  const walk = await ev(page, () => { const R = MZ.town.residents, p0 = R.map(r => [r.x, r.z]); MZ.tick(20); const moved = R.filter((r, i) => Math.hypot(r.x - p0[i][0], r.z - p0[i][1]) > 0.3).length; const homes = MZ.state.chunks['0,0'].layers.ground.filter(b => b.t === 'house'); const near = R.every(r => { const h = MZ.town.byId[r.home]; const c = MZ.town.center(h); return Math.hypot(r.x - c[0], r.z - c[1]) <= 9; }); return { moved, near }; });
  ok('住民が家のまわりを歩く', walk.moved >= 3 && walk.near, JSON.stringify(walk));

  /* きこり小屋 */
  const lum = await ev(page, () => TT.build('lumber', 62, 48, 0));
  ok('集落できこり小屋を建てられる', lum);
  const lg = await ev(page, () => { const s = MZ.state; const b0 = s.inv.log; MZ.tick(19); const b1 = s.inv.log; MZ.tick(2); const b2 = s.inv.log; MZ.tick(40); return [b1 - b0, b2 - b0, s.inv.log - b0]; });
  ok('きこり小屋で原木が 20 秒ごとに増える', lg[0] === 0 && lg[1] === 1 && lg[2] === 3, lg);
  ok('人手が足りないきこり小屋は止まる', await ev(page, () => { MZ.state.pop = 1; MZ.town.resDirty = true; const j = MZ.town.jobs(); const b = MZ.state.inv.log; MZ.tick(5); const r = j[0].running === false && MZ.state.inv.log === b; MZ.state.pop = 10; return r; }));

  /* かまど・炉・鉄 */
  ok('かまどを建てられる', await ev(page, () => { TT.ensureCost(MZ.BUILDS.kiln.cost); return TT.build('kiln', 65, 53, 0); }));
  await goalIs('かまどを建てたら「炉」', '炉');
  ok('かまどの近くでれんがを作れる', await ev(page, () => { TT.ensure('brick', 6); return MZ.state.inv.brick >= 6; }));
  ok('炉を建てられる', await ev(page, () => TT.build('furnace', 66, 53, 0)));
  await goalIs('炉を建てたら「鉄インゴット」', '鉄インゴット');
  ok('炉の近くで鉄インゴットを作れる', await ev(page, () => { TT.ensure('ingot', 4); return MZ.state.inv.ingot >= 4; }));
  await goalIs('インゴットができたら「鉄の道具」', '鉄の道具');
  ok('鉄の道具を作れる（集落から）', await ev(page, () => { TT.ensureCost(MZ.RECIPES.find(r => r.key === 'axe3').cost); TT.home(); const a = MZ.craft('axe3'); TT.ensure('ingot', 2); TT.ensureCost(MZ.RECIPES.find(r => r.key === 'pick3').cost); TT.home(); const b = MZ.craft('pick3'); return a && b && MZ.state.tools.axe === 3 && MZ.state.tools.pick === 3; }));
  const lastGoal = await ev(page, () => MZ.currentGoal());
  ok('つぎの目標が、集落のあとの「村にしよう」まで進む', lastGoal.includes('村にしよう'), lastGoal);

  /* 三人称 */
  await ev(page, () => { const s = MZ.state.player; s.x = 6; s.z = -25; s.yaw = 0.2; s.pitch = 0.15; });
  await page.keyboard.press('KeyV'); await page.waitForTimeout(800); await frames(page, 3);
  ok('V で三人称（主人公の姿が見える）', await ev(page, () => MZ.state.player.view === 3 && MZ.player.model.isEnabled()));
  await page.screenshot({ path: OUT + '03-pc-third.png' });
  ok('三人称でも採集できる', await ev(page, () => { const b = MZ.state.inv.grass; TT.gather('grass', b + 2); return MZ.state.inv.grass >= b + 2 && MZ.state.player.view === 3; }));
  const third = await ev(page, () => { TT.ensureCost(MZ.BUILDS.road.cost); TT.home(); MZ.startBuild('road'); return true; });
  await ev(page, () => { const s = MZ.state.player; s.x = 20; s.z = -30; s.yaw = 0; s.pitch = 0.4; }); await page.waitForTimeout(700); await frames(page, 3);
  const tp = await ev(page, () => ({ ok: MZ.build.ok, x: MZ.build.gx }));
  ok('三人称でも建築の見本が出て置ける', tp.ok && await ev(page, () => { const n = MZ.state.chunks['0,0'].layers.ground.length; MZ.placeHere(); const r = MZ.state.chunks['0,0'].layers.ground.length === n + 1; MZ.cancelBuild(); return r; }), JSON.stringify(tp));
  await page.keyboard.press('KeyV'); await page.waitForTimeout(300);
  ok('もう一度 V で一人称', (await ev(page, () => MZ.state.player.view)) === 1);

  /* 見た目：街（PC） */
  await ev(page, () => { const s = MZ.state.player; s.x = 12; s.z = -34; s.yaw = -0.15; s.pitch = 0.18; MZ.tick(3); });
  await page.waitForTimeout(900); await frames(page, 4);
  await page.screenshot({ path: OUT + '04-pc-town.png' });
  /* パネル（PC：右側） */
  await page.keyboard.press('Tab'); await page.waitForTimeout(300);
  await page.click('#tabs button[data-tab=build]'); await page.waitForTimeout(300);
  const pr = await ev(page, () => { const r = document.querySelector('#panel').getBoundingClientRect(); return { l: r.left, w: r.width, t: r.top, h: r.height, iw: innerWidth, ih: innerHeight, paused: MZ.paused }; });
  ok('PC（横長）はパネルが右側・上下いっぱい', pr.l > pr.iw * 0.5 && pr.h >= pr.ih - 1 && pr.w <= 421 && pr.paused, JSON.stringify(pr));
  await page.screenshot({ path: OUT + '05-pc-panel-build.png' });
  await page.click('#tabs button[data-tab=mat]'); await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '06-pc-panel-mat.png' });
  const frozen = await ev(page, () => { const s = MZ.state.player, x = s.x; MZ.player.keys.KeyW = true; return new Promise(r => setTimeout(() => { MZ.player.keys.KeyW = false; r(s.x === x); }, 500)); });
  ok('パネルを開いている間は歩かない', frozen);
  await page.keyboard.press('Tab');
  ok('Tab でパネルが閉じる', !(await ev(page, () => MZ.ui.open)));

  /* 保存 → 読み直し → つづきから */
  before = await ev(page, () => { MZ.saveNow(); const raw = localStorage.getItem('machizukuri-save'); return raw; });
  const bj = JSON.parse(before);
  ok('保存の形：game・v・at・data.land・data.chunks["0,0"].layers.ground/under/over', bj.game === 'machizukuri' && bj.v === 3 && Array.isArray(bj.data.land) && bj.data.land[0] === '0,0' && typeof bj.at === 'string' && Array.isArray(bj.data.chunks['0,0'].layers.ground) && Array.isArray(bj.data.chunks['0,0'].layers.under) && Array.isArray(bj.data.chunks['0,0'].layers.over) && typeof bj.data.chunks['0,0'].taken === 'object' && bj.data.player && bj.data.inv && bj.data.tools && bj.data.timers, Object.keys(bj.data).join(','));
  ok('消えている採れる物が保存に入っている', Object.keys(bj.data.chunks['0,0'].taken).length > 5, Object.keys(bj.data.chunks['0,0'].taken).length);
  require('fs').writeFileSync(OUT + 'save.json', before);
  await page.reload(); await page.waitForTimeout(500);
  ok('保存があると「つづきから」「さいしょから」が出る', (await page.textContent('#tbtn')).includes('つづきから') && (await page.textContent('#tbtn')).includes('さいしょから'));
  await page.screenshot({ path: OUT + '07-pc-title-continue.png' });
  await page.click('#tbtn .go'); await page.waitForFunction(() => window.MZ && MZ.started); await page.waitForTimeout(300);
  const after = JSON.parse(await ev(page, () => JSON.stringify(MZ.state)));
  const same = (k) => JSON.stringify(bj.data[k]) === JSON.stringify(after[k]);
  const tk = Object.keys(bj.data.chunks['0,0'].taken).sort().join(), tk2 = Object.keys(after.chunks['0,0'].taken).sort().join();
  ok('つづきから：持ち物・道具・人口・段階が同じ', same('inv') && same('tools') && same('pop') && same('stage'));
  ok('つづきから：建物が同じ', JSON.stringify(bj.data.chunks['0,0'].layers) === JSON.stringify(after.chunks['0,0'].layers));
  ok('つづきから：いる場所が同じ', Math.abs(bj.data.player.x - after.player.x) < 0.01 && Math.abs(bj.data.player.z - after.player.z) < 0.01 && bj.data.player.view === after.player.view);
  ok('つづきから：消えている採れる物が同じ', tk === tk2, tk.length + ' / ' + tk2.length);
  ok('つづきから：建物が描かれている', await ev(page, () => Object.keys(MZ.town.meshes).length === MZ.state.chunks['0,0'].layers.ground.length));
  const pdraw = await ev(page, () => { MZ.town.render(1); return MZ.town.pgroups.reduce((a, g) => a + g.mesh.thinInstanceCount, 0); });
  ok('つづきから：住民が描かれている', pdraw === after.pop, pdraw);
  /* 古い／壊れた保存 */
  await ev(page, () => { MZ.noSave = true; localStorage.setItem('machizukuri-save', JSON.stringify({ game: 'machizukuri', v: 99, at: 'x', data: {} })); });
  await page.reload(); await page.waitForTimeout(400);
  const newer = await page.textContent('#tmsg');
  ok('新しい版のデータは読まず、上書きしない', newer.includes('新しい版のデータです') && JSON.parse(await ev(page, () => localStorage.getItem('machizukuri-save'))).v === 99, newer);
  await ev(page, () => { localStorage.setItem('machizukuri-save', '{こわれた'); });
  await page.reload(); await page.waitForTimeout(400);
  ok('壊れた保存は「さいしょから」＋お知らせ', (await page.textContent('#tmsg')).includes('壊れて'));
  await page.click('#tbtn .go'); await page.waitForFunction(() => window.MZ && MZ.started); await frames(page, 2);
  ok('壊れた保存のあと、さいしょの状態で始まる', await ev(page, () => MZ.state.pop === 0 && MZ.state.inv.log === 0));
  /* おかしい建物・場所は捨てる／収める */
  const badSave = JSON.parse(before);
  const L = badSave.data.chunks['0,0'].layers.ground, n0 = L.length;
  L.push({ id: 900, t: 'house', x: 119, z: 119, r: 0 }, { id: 901, t: 'house', x: -3, z: 5, r: 0 }, { id: 902, t: 'road', x: 59, z: 59, r: 0 }, { id: 903, t: 'nothing', x: 5, z: 5, r: 0 });
  badSave.data.player.x = 500; badSave.data.player.z = -500;
  await ev(page, s => { MZ.noSave = true; localStorage.setItem('machizukuri-save', s); }, JSON.stringify(badSave));
  await page.reload(); await page.waitForTimeout(400);
  await page.click('#tbtn .go'); await page.waitForFunction(() => window.MZ && MZ.started); await frames(page, 2);
  const nb = await ev(page, () => ({ n: MZ.state.chunks['0,0'].layers.ground.length, x: MZ.state.player.x, z: MZ.state.player.z }));
  ok('保存の建物：土地の外・重なり・知らない種類は捨て、場所は土地の中へ', nb.n === n0 && nb.x === 119.5 && nb.z === -119.5, JSON.stringify(nb));
  const noHut = JSON.parse(before); noHut.data.chunks['0,0'].layers.ground = noHut.data.chunks['0,0'].layers.ground.filter(b => b.t !== 'hut');
  await ev(page, s => { MZ.noSave = true; localStorage.setItem('machizukuri-save', s); }, JSON.stringify(noHut));
  await page.reload(); await page.waitForTimeout(400);
  ok('小屋がない保存は壊れている扱い', (await page.textContent('#tmsg')).includes('壊れて'));
  /* 同じお知らせを積まない・タイトルで戻るリンクが見える */
  const linkTop = await ev(page, () => { const a = document.querySelector('header a').getBoundingClientRect(); const e = document.elementFromPoint(a.left + 5, a.top + 5); return e && e.tagName; });
  ok('タイトル中も「← ちくわゲームズ」が見える（押せる）', linkTop === 'A', linkTop);
  await page.click('#tbtn .go'); await page.waitForFunction(() => window.MZ && MZ.started);
  ok('同じお知らせは 2 秒以内に積まない', await ev(page, () => { const b = document.querySelectorAll('#notes .note').length; MZ.ui.notice('テスト文'); MZ.ui.notice('テスト文'); MZ.ui.notice('テスト文'); return document.querySelectorAll('#notes .note').length - b <= 1; }));
  /* さいしょから（保存を戻して試す） */
  require('fs').writeFileSync(OUT + 'tmp.txt', '');
  await ev(page, s => { localStorage.setItem('machizukuri-save', s); }, before);
  await page.reload(); await page.waitForTimeout(400);
  await page.click('#tbtn .go.sub'); await page.waitForTimeout(200);
  ok('「さいしょから」は確認が出る', await page.isVisible('#dlg'));
  await page.click('#dlgOk'); await page.waitForFunction(() => window.MZ && MZ.started); await frames(page, 2);
  ok('「さいしょから」で街が消える', await ev(page, () => MZ.state.pop === 0 && MZ.state.chunks['0,0'].layers.ground.length === 1 && MZ.state.inv.plank === 0));
  /* 遊びながら「さいしょから」 */
  await page.keyboard.press('Tab'); await page.click('#pReset'); await page.waitForTimeout(200);
  ok('パネルの「さいしょから」にも確認がある', await page.isVisible('#dlg'));
  await page.click('#dlgOk'); await page.waitForTimeout(800);
  ok('さいしょからで保存が消える（読み直し後は「はじめる」）', (await ev(page, () => localStorage.getItem('machizukuri-save'))) === null && (await page.textContent('#tbtn')).includes('はじめる'));

  }
  /* ================= 描画の層（β0.2.0 で足した項目） ================= */
  /* 速さのため、これらは小さい画面（480×300）で回す。高・中は swiftshader だと 1 フレームがとても重い */
  const SMALL = { width: 480, height: 300 };
  const BAD_RES = e => !/^error Failed to load resource/.test(e);   // 資産を止めたときに出てよいのは「読み込み失敗」だけ
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const open2 = async (opt) => {
    opt = opt || {};
    const c = await br.newContext({ viewport: opt.viewport || SMALL });
    if (opt.pref) await c.addInitScript(q => { try { localStorage.setItem('machizukuri-gfx', q); } catch (e) { /* なし */ } }, opt.pref);
    else await c.addInitScript(LOW);
    if (opt.route) await opt.route(c);
    const pg = await c.newPage(), list = [];
    pg.on('pageerror', e => list.push('pageerror ' + e.message + ' @ ' + String(e.stack || '').split('\n').slice(1, 3).join(' ').trim()));
    pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') list.push(m.type() + ' ' + m.text()); });
    return { c, pg, list };
  };
  const begin2 = async (pg) => {
    await pg.goto(URL);
    await pg.click('#tbtn .go', { timeout: 60000 });
    await pg.waitForFunction(() => window.MZ && MZ.started, null, { timeout: 120000 });
    await ev(pg, HELPERS);
  };
  const settle = (pg, n) => frames(pg, n || 3);   // 実際に描かせる（シェーダーのエラーは描いたときに出る）
  const loaded = pg => pg.waitForFunction(() => { const a = MZ.gfx.assets; return a.done >= a.total; }, null, { timeout: 180000 });
  const snap = pg => ev(pg, () => JSON.stringify({ inv: MZ.state.inv, pop: MZ.state.pop, b: MZ.chunk().layers.ground.map(b => [b.id, b.t, b.x, b.z, b.r]) }));

  /* ================= β0.3.0 区切り 1：土地の表を全体で 1 つにする・保存の版 2 ================= */
  if (want(1)) {
  cur = 1;
  const fs = require('fs');
  /* 全体の表・土地・当たり・採れる物の番号・広げたときの形の下ごしらえ・草の数・版 2 の保存 */
  {
    const a = await open2({});
    await begin2(a.pg);
    const r = await ev(a.pg, () => {
      MZ.noSave = true;
      const W = MZ.world, G = MZ.gfx, o = {};
      o.size = [W.owner.length, W.solid.length, W.cellNode.length, G.ground.data.data.length, G.ground.data.tex.getSize().width, G.ground.data.tex.getSize().height, MZ.GN];
      o.ci = [MZ.ci(-120, -120), MZ.ci(240, 0), MZ.ci(-121, 0), MZ.ci(239, 239), MZ.ci(0, 0)];
      o.land = [MZ.landAt(0, 0), MZ.landAt(119, 119), MZ.landAt(120, 0), MZ.landAt(-1, 50)];
      o.cp = MZ.town.canPlace('house', 119, 50);
      o.col = [W.collide(200, 0, 0.35)[0], W.collide(-200, 0, 0.35)[0], W.collide(0, 200, 0.35)[1], W.solidAtPoint(130, 0), W.solidAtPoint(30, 30)];
      o.nodes = W.nodes.every((nd, i) => nd.ck === '0,0' && nd.li === i && nd.idx === i && W.byChunk['0,0'][nd.li] === nd.idx);
      /* 広げたときの形（持っている区画を内がわから変える）。終わったら元にもどす */
      W.setLand(['0,0', '1,0']);
      o.ex = {
        land: [MZ.landAt(130, 0), MZ.landAt(239, 119), MZ.landAt(240, 0), MZ.landAt(130, 120), MZ.landAtPoint(300, 0)],
        c200: W.collide(200, 0, 0.35)[0], c400: W.collide(400, 0, 0.35)[0], cz: W.collide(200, 300, 0.35)[1], inl: [W.inLand(200, 0, 1), W.inLand(0, 0, 1), W.inLand(119.5, 0, 1)],
        cpRoad: MZ.town.canPlace('road', 125, 50), cpOut: MZ.town.canPlace('road', 125, 120), cpCross: MZ.town.canPlace('house', 119, 50),
        ck: MZ.chunkOfCell(125, 50), ckn: MZ.chunkOfCell(-1, -121)
      };
      W.setLand(['0,0', '0,1']);   // L 字の片方
      o.ex2 = [MZ.landAt(10, 130), MZ.landAt(130, 10), W.collide(0, 400, 0.35)[1], W.collide(200, 0, 0.35)[0]];
      W.setLand(['0,0', '1,0', '0,1']);
      o.ex3 = [W.inLand(119, 119, 1), W.inLand(130, 130, 1), MZ.landAt(130, 130)];
      const cl = W.clampLand(250, 250, 0.5).slice();
      o.ex3c = cl;
      W.setLand(['0,0']);
      o.back = [MZ.landAt(130, 0), W.collide(200, 0, 0.35)[0], W.landKeys.join()];
      return o;
    });
    ok('全体の表の大きさ：owner・solid・cellNode が 129,600、塗り分けの表が 360×360', r.size[0] === 129600 && r.size[1] === 129600 && r.size[2] === 129600 && r.size[3] === 360 * 360 * 4 && r.size[4] === 360 && r.size[5] === 360 && r.size[6] === 360, JSON.stringify(r.size));
    ok('表の番号 MZ.ci：(−120,−120) が 0、世界の外は −1', r.ci[0] === 0 && r.ci[1] === -1 && r.ci[2] === -1 && r.ci[3] === 129599 && r.ci[4] === 120 * 360 + 120, JSON.stringify(r.ci));
    ok('土地：(0,0)・(119,119) は土地、(120,0)・(−1,50) は土地の外', r.land[0] && r.land[1] && !r.land[2] && !r.land[3], JSON.stringify(r.land));
    ok('置けない：となりの区画へはみ出す建物は「土地の外」', r.cp.ok === false && r.cp.reason === '土地の外', JSON.stringify(r.cp));
    ok('当たり：土地の外へは出られない（x が 119.5・−119.5・z が 119.5）、土地の外は通れない', r.col[0] === 119.5 && r.col[1] === -119.5 && r.col[2] === 119.5 && r.col[3] === true && r.col[4] === false, JSON.stringify(r.col));
    ok('採れる物の番号：全部の物の ck が "0,0"、li === idx', r.nodes === true);
    ok('広げたときの形（"0,0" と "1,0"）：土地・当たり・土地の外の判定が変わる', r.ex.land[0] && r.ex.land[1] && !r.ex.land[2] && !r.ex.land[3] && r.ex.land[4] && r.ex.c200 === 200 && r.ex.c400 === 359.5 && r.ex.cz === 119.5 && r.ex.inl[0] === true && r.ex.inl[1] === true && r.ex.inl[2] === true, JSON.stringify(r.ex));
    ok('広げたときの形：道は 125,50 に置ける、区画の外・境をまたぐ家は区画 "0,0" の内がわなら置ける・外なら置けない', r.ex.cpRoad.ok === true && r.ex.cpOut.ok === false && r.ex.cpOut.reason === '土地の外' && r.ex.cpCross.ok === true, JSON.stringify([r.ex.cpRoad, r.ex.cpOut, r.ex.cpCross]));
    ok('広げたときの形：chunkOfCell が負のマスでも floor（(125,50)→"1,0" の 5、(−1,−121)→"−1,−2" の 119・−1 の外）', r.ex.ck.key === '1,0' && r.ex.ck.lx === 5 && r.ex.ck.lz === 50 && r.ex.ckn.key === '-1,-2' && r.ex.ckn.lx === 119 && r.ex.ckn.lz === 119, JSON.stringify([r.ex.ck, r.ex.ckn]));
    ok('広げたときの形（L 字）：持っている区画ごとに収まる', r.ex2[0] && !r.ex2[1] && r.ex2[2] === 359.5 && r.ex2[3] === 119.5 && r.ex3[0] === false && r.ex3[1] === false && r.ex3[2] === false && r.ex3c[0] === 250 && r.ex3c[1] === 119.5, JSON.stringify([r.ex2, r.ex3, r.ex3c]));
    ok('広げたあと元にもどす（"0,0" だけ）', r.back[0] === false && r.back[1] === 119.5 && r.back[2] === '0,0', JSON.stringify(r.back));
    ok('描画の層で出たエラー・警告が 0（全体の表・広げたときの形）', a.list.length === 0, a.list.slice(0, 4).join(' | '));
    await a.c.close();
  }
  /* 草：三角形の試験の場面（低）で草の株の数が、作りかえる前と同じ 2,200（前の作りは 低 2,200・中 8,000・高 21,000） */
  {
    const a = await open2({});
    await begin2(a.pg);
    const g = await ev(a.pg, () => {
      MZ.noSave = true;
      MZ.world.nodes.forEach(nd => { if (nd.gx >= 38 && nd.gx <= 60 && nd.gz >= 36 && nd.gz <= 58) MZ.world.take(nd.idx, -1); });
      Object.keys(MZ.state.inv).forEach(k => { MZ.state.inv[k] = 9999; });   // 試験用：材料を持たせる
      let n = 0;
      for (let j = 0; j < 5 && n < 20; j++) for (let i = 0; i < 6 && n < 20; i++) if (MZ.place('house', 40 + i * 3, 38 + j * 3, 0)) n++;
      for (let q = 38; q <= 58; q++) MZ.place('road', 58, q, 0);
      MZ.place('field', 50, 54, 0); MZ.place('fire', 56, 57, 0); MZ.place('well', 56, 59, 0);
      const s = MZ.state.player; s.x = -4; s.z = -12; s.yaw = 0.4; s.pitch = 0;
      MZ.gfx.nodes.flush(); MZ.gfx.grass.layout(s.x, s.z);
      return { n, grass: MZ.gfx.grass.count, q: MZ.gfx.key };
    });
    ok('草：三角形の試験の場面（低）の株の数が作りかえる前と同じ（2,200）', g.n === 20 && g.q === 'low' && g.grass === 2200, JSON.stringify(g));
    await a.c.close();
  }
  /* 版 2 の保存：行き来・持っていない区画は捨てる・"0,0" が無ければ壊れている・建物が区画をまたぐ形 */
  {
    const a = await open2({});
    await begin2(a.pg);
    const r = await ev(a.pg, () => {
      MZ.noSave = true;
      Object.keys(MZ.state.inv).forEach(k => { MZ.state.inv[k] = 999; });   // 試験用：材料を持たせる
      MZ.place('road', 59, 61, 0); MZ.place('house', 59, 62, 1); MZ.place('well', 57, 62, 0);
      MZ.world.nodes.slice(0, 8).forEach(nd => { if (MZ.world.nodeActive(nd.idx)) MZ.world.take(nd.idx, 200 + nd.idx); });
      const raw = JSON.stringify(CG.save.wrap(MZ.state, MZ.SAVE_V)), saved = JSON.stringify(MZ.state);
      const load = o => { localStorage.setItem('machizukuri-save', typeof o === 'string' ? o : JSON.stringify(o)); return MZ.loadSave(); };
      const out = { v: JSON.parse(raw).v, vland: JSON.parse(raw).data.land };
      const l0 = load(raw); out.roundTrip = l0.status === 'ok' && JSON.stringify(l0.state) === saved;
      /* 持っていない区画のデータは捨てる */
      let b = JSON.parse(raw);
      b.data.chunks['1,0'] = { layers: { ground: [{ id: 700, t: 'house', x: 5, z: 5, r: 0 }], under: [], over: [] }, taken: { 3: 5 } };
      let l = load(b); out.dropChunk = l.status === 'ok' && !('1,0' in l.state.chunks) && Object.keys(l.state.chunks).join() === '0,0' && l.state.land.join() === '0,0' && l.state.nextId === l0.state.nextId;
      b = JSON.parse(raw); b.data.land = ['0,0', '5,5', '2,0', '0,-2', 'x', '1,1', '1,1'];
      l = load(b); out.dropLand = l.status === 'ok' && l.state.land.join('|') === '0,0|1,1' && Object.keys(l.state.chunks).join('|') === '0,0|1,1';
      b = JSON.parse(raw); b.data.land = ['1,0']; out.noOrigin = load(b).status;
      b = JSON.parse(raw); b.data.land = ['1,0', '0,0']; l = load(b); out.order = l.status === 'ok' && l.state.land.join('|') === '0,0|1,0';
      delete (b = JSON.parse(raw)).data.land; out.noLand = load(b).status;
      /* 持っている区画なら建物ごと残る。区画をまたぐ建物は左上の区画に入り、使うマスが全部土地ならよい */
      b = JSON.parse(raw); b.data.land = ['0,0', '1,0'];
      b.data.chunks['1,0'] = { layers: { ground: [{ id: 700, t: 'house', x: 5, z: 5, r: 0, mk: 'log' }, { id: 701, t: 'house', x: 200, z: 5, r: 0 }], under: [], over: [] }, taken: { 3: 5, a: 'x' } };
      b.data.chunks['0,0'].layers.ground.push({ id: 702, t: 'house', x: 119, z: 50, r: 0, mk: 'nothing' }, { id: 703, t: 'house', x: 119, z: 119, r: 0 });
      l = load(b); const g0 = l.state.chunks['0,0'].layers.ground, g1 = l.state.chunks['1,0'].layers.ground;
      out.two = l.status === 'ok' && l.state.land.join('|') === '0,0|1,0' && g1.length === 1 && g1[0].id === 700 && !('mk' in g1[0]) && g0.some(x => x.id === 702 && !('mk' in x)) && !g0.some(x => x.id === 703) && JSON.stringify(l.state.chunks['1,0'].taken) === '{"3":5}' && l.state.nextId >= 703;
      /* 小屋を先に調べる：小屋と重なる建物が配列の前にあっても、小屋が残る */
      b = JSON.parse(raw); b.data.chunks['0,0'].layers.ground.unshift({ id: 800, t: 'road', x: 59, z: 59, r: 0 });
      l = load(b); out.hutFirst = l.status === 'ok' && l.state.chunks['0,0'].layers.ground.some(x => x.t === 'hut') && !l.state.chunks['0,0'].layers.ground.some(x => x.id === 800);
      /* 場所は持っている区画の中へ（"0,0" だけなら ±119.5。広げた区画ならその中） */
      b = JSON.parse(raw); b.data.player.x = 500; b.data.player.z = -500; l = load(b); out.clamp1 = [l.state.player.x, l.state.player.z];
      b.data.land = ['0,0', '1,0']; b.data.player.z = -50; l = load(b); out.clamp2 = [l.state.player.x, l.state.player.z];
      localStorage.setItem('machizukuri-save', raw);
      return out;
    });
    ok('保存の形が版 3：v === 3、data.land が ["0,0"]', r.v === 3 && r.vland.join() === '0,0', JSON.stringify([r.v, r.vland]));
    ok('版 2 の行き来：保存 → 読み直し → MZ.state の JSON が同じ', r.roundTrip === true);
    ok('持っていない区画は捨てる：land に無い "1,0"（建物入り）は読むと無い', r.dropChunk === true);
    ok('land：範囲の外・書式がちがう物・重なりは捨てる', r.dropLand === true, JSON.stringify(r.dropLand));
    ok('land に "0,0" が無い・land が無いと壊れている扱い', r.noOrigin === 'broken' && r.noLand === 'broken', JSON.stringify([r.noOrigin, r.noLand]));
    ok('land は "0,0" を先頭に並べる', r.order === true);
    ok('持っている区画なら建物・taken を残し、mk は craft の中の物だけ残す（工房でない建物の mk は捨てる）。区画の外へはみ出す建物は捨てる', r.two === true);
    ok('小屋を先に調べる（小屋より前に重なる建物があっても小屋が残る）', r.hutFirst === true);
    ok('主人公の場所：持っている区画の中へ収める（"0,0" だけなら ±119.5。広げた区画ならその中）', r.clamp1[0] === 119.5 && r.clamp1[1] === -119.5 && r.clamp2[0] === 359.5 && r.clamp2[1] === -50, JSON.stringify([r.clamp1, r.clamp2]));
    ok('版 2 の読み込みで出たエラー・警告が 0', a.list.length === 0, a.list.slice(0, 4).join(' | '));
    await a.c.close();
  }
  /* 版 1 の保存（β0.1.0・β0.2.0 で作った見本。dev/fixtures）がそのまま続きから遊べる */
  for (const fx of ['b010', 'b020']) {
    const raw = fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-' + fx + '.json'), 'utf8'), fj = JSON.parse(raw), fd = fj.data;
    const a = await open2({});
    await a.c.addInitScript(s => { try { if (!sessionStorage.getItem('mz-seeded')) { localStorage.setItem('machizukuri-save', s); sessionStorage.setItem('mz-seeded', '1'); } } catch (e) { /* なし */ } }, raw);
    await a.pg.goto(URL);
    await a.pg.waitForSelector('#tbtn .go:not([disabled])', { timeout: 60000 });
    const title = await a.pg.textContent('#tbtn');
    ok('版 1 の見本（' + fx + '）：タイトルに「つづきから」が出る', fj.v === 1 && title.includes('つづきから'), title);
    await a.pg.click('#tbtn .go');
    await a.pg.waitForFunction(() => window.MZ && MZ.started, null, { timeout: 120000 });
    await ev(a.pg, HELPERS);
    const st = await ev(a.pg, () => {
      MZ.noSave = true;
      const s = JSON.parse(JSON.stringify(MZ.state));
      MZ.gfx.nodes.flush();
      const looks = Object.keys(s.chunks['0,0'].taken).map(k => MZ.world.nodes[MZ.world.byChunk['0,0'][+k]].look);
      return { s, clock: MZ.town.clock, meshes: Object.keys(MZ.town.meshes).length, tookNull: looks.every(l => l == null), shown: MZ.world.nodes.filter(nd => nd.look).length, taken: looks.length };
    });
    const sd = st.s, c0 = fd.chunks['0,0'], c1 = sd.chunks['0,0'], cl = st.clock + 2;
    ok('版 1 の見本（' + fx + '）：pop・stage・tools・player・nextId・land が見本と同じ', sd.pop === fd.pop && sd.stage === fd.stage && JSON.stringify(sd.tools) === JSON.stringify(fd.tools) && ['x', 'z', 'yaw', 'view'].every(k => sd.player[k] === fd.player[k]) && sd.nextId === fd.nextId && sd.land.join() === '0,0', JSON.stringify([sd.pop, sd.stage, sd.player, sd.nextId, sd.land]));
    ok('版 1 の見本（' + fx + '）：inv が見本と同じ（きこり小屋の原木だけ、遊んだ時間ぶん増えてよい）', Object.keys(fd.inv).every(k => k === 'log' ? sd.inv[k] >= fd.inv[k] && sd.inv[k] <= fd.inv[k] + cl / 20 + 1 : sd.inv[k] === fd.inv[k]), JSON.stringify([sd.inv, fd.inv]));
    ok('版 1 の見本（' + fx + '）：建物（id・t・x・z・r の並び）が見本と同じ', JSON.stringify(c1.layers.ground) === JSON.stringify(c0.layers.ground) && c1.layers.ground.length > 20, c1.layers.ground.length + ' / ' + c0.layers.ground.length);
    const k0 = Object.keys(c0.taken), k1 = Object.keys(c1.taken);
    ok('版 1 の見本（' + fx + '）：taken のキーと値が見本と同じ（残り秒は遊んだ時間ぶん減ってよい。−1 は変わらない）', k0.join() === k1.join() && k0.every(k => c0.taken[k] < 0 ? c1.taken[k] === c0.taken[k] : c1.taken[k] <= c0.taken[k] && c1.taken[k] >= c0.taken[k] - cl) && k0.some(k => c0.taken[k] > 0) && k0.some(k => c0.taken[k] < 0), k0.length + ' / ' + k1.length);
    ok('版 1 の見本（' + fx + '）：timers のキーが見本と同じ（jobs・migrate）', Object.keys(sd.timers.jobs).join() === Object.keys(fd.timers.jobs).join() && typeof sd.timers.migrate === 'number');
    ok('版 1 の見本（' + fx + '）：建物が描かれている（meshes が建物の数）。消えている物は消えたまま', st.meshes === c0.layers.ground.length && st.tookNull && st.shown > 100, JSON.stringify([st.meshes, st.tookNull, st.shown, st.taken]));
    const pl = await ev(a.pg, () => {
      const W = MZ.world, before = { pop: MZ.state.pop, log: MZ.state.inv.log }, cap = MZ.town.info.cap;
      MZ.tick(30);
      const popAfter = MZ.state.pop, logAfter = MZ.state.inv.log;
      const road = MZ.place('road', 69, 61, 0);
      const bush = W.nodes.find(nd => nd.k === 'bush' && W.nodeActive(nd.idx) && Math.hypot(nd.x, nd.z) < 60), g0 = MZ.state.inv.grass;
      TT.goto(bush); const hit = MZ.hit(); const gone = !W.nodeActive(bush.idx);
      MZ.noSave = false; MZ.saveNow(); MZ.noSave = true;
      const box = JSON.parse(localStorage.getItem('machizukuri-save')), cur = JSON.stringify(MZ.state), l = MZ.loadSave();
      return { cap, before, popAfter, logAfter, road, hit, gone, grass: MZ.state.inv.grass - g0, v: box.v, again: l.status === 'ok' && JSON.stringify(l.state) === cur, land: box.data.land, jobs: Object.keys(MZ.state.timers.jobs).length, lumber: MZ.town.workState(MZ.town.list().find(b => b.t === 'lumber')).st };
    });
    ok('版 1 の見本（' + fx + '）：そのまま遊べる（MZ.tick で人口が上限まで動き、原木が 100 をこえた古い街ではきこり小屋が上限いっぱいで止まる・道が置ける・物がたたける）', pl.popAfter === pl.cap && pl.logAfter >= pl.before.log && pl.lumber === 'full' && pl.road === true && pl.hit && pl.gone && pl.grass > 0 && pl.jobs >= 1, JSON.stringify(pl));
    ok('版 1 の見本（' + fx + '）：保存し直すと v が 3 になり、読み直しても同じ', pl.v === 3 && pl.again === true && pl.land.join() === '0,0', JSON.stringify([pl.v, pl.again, pl.land]));
    ok('版 1 の見本（' + fx + '）：エラー・警告が 0', a.list.length === 0, a.list.slice(0, 4).join(' | '));
    await a.c.close();
  }
  /* 区切り 1 の形の版 2 の保存（dev/fixtures/save-v2-b030-1.json。コミット 3585c05 の作りで作った）も、そのまま続きから遊べる */
  {
    const raw = fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v2-b030-1.json'), 'utf8'), fj = JSON.parse(raw), fd = fj.data;
    const a = await open2({});
    await a.c.addInitScript(s => { try { if (!sessionStorage.getItem('mz-seeded')) { localStorage.setItem('machizukuri-save', s); sessionStorage.setItem('mz-seeded', '1'); } } catch (e) { /* なし */ } }, raw);
    await a.pg.goto(URL);
    await a.pg.waitForSelector('#tbtn .go:not([disabled])', { timeout: 60000 });
    const title = await a.pg.textContent('#tbtn');
    await a.pg.click('#tbtn .go');
    await a.pg.waitForFunction(() => window.MZ && MZ.started, null, { timeout: 120000 });
    await ev(a.pg, HELPERS);
    const st = await ev(a.pg, () => {
      MZ.noSave = true;
      const s = MZ.state, before = { pop: s.pop, stick: s.inv.stick }, cap = MZ.town.info.cap, lum = MZ.town.list().find(b => b.t === 'lumber');
      s.inv.log = 0; s.inv.stick = 0; MZ.town.jobsDirty = true; s.timers.jobs[lum.id] = 20; s.timers.migrate = -1e6; MZ.tick(20.5);
      return { v: s.land.join(), pop: before.pop, cap, stage: s.stage, ground: s.chunks['0,0'].layers.ground.length, log: s.inv.log, stick: s.inv.stick, meshes: Object.keys(MZ.town.meshes).length };
    });
    ok('区切り 1 の版 2 の見本：「つづきから」で遊べ、建物がそろう', fj.v === 2 && title.includes('つづきから') && st.v === '0,0' && st.pop === fd.pop && st.stage === 1 && st.meshes === fd.chunks['0,0'].layers.ground.length, JSON.stringify(st));
    ok('区切り 1 の版 2 の見本：きこり小屋で原木に加えて枝もたまる', st.log === 1 && st.stick === 1, JSON.stringify([st.log, st.stick]));
    ok('区切り 1 の版 2 の見本：エラー・警告が 0', a.list.length === 0, a.list.slice(0, 4).join(' | '));
    await a.c.close();
  }
  /* ---- β0.4.0 区切り 1：保存の版 3（版 2 → 3）。β0.3.2 で作った、人口 200 をこえた町の版 2 の保存（dev/fixtures/save-v2-b032-town.json） ---- */
  {
    const raw = fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v2-b032-town.json'), 'utf8'), fj = JSON.parse(raw), fd = fj.data;
    const a = await open2({});
    await a.c.addInitScript(s => { try { if (!sessionStorage.getItem('mz-seeded')) { localStorage.setItem('machizukuri-save', s); sessionStorage.setItem('mz-seeded', '1'); } } catch (e) { /* なし */ } }, raw);
    await a.pg.goto(URL);
    await a.pg.waitForSelector('#tbtn .go:not([disabled])', { timeout: 60000 });
    const title = await a.pg.textContent('#tbtn');
    await a.pg.click('#tbtn .go');
    await a.pg.waitForFunction(() => window.MZ && MZ.started, null, { timeout: 120000 });
    await ev(a.pg, HELPERS);
    const st = await ev(a.pg, () => {
      MZ.noSave = true;
      const s = JSON.parse(JSON.stringify(MZ.state));
      let h = 2166136261; const str = MZ.world.nodes.filter(n => n.ck === '0,0').map(n => [n.idx, n.k, n.x, n.z, n.s.toFixed(6), n.ry.toFixed(6), n.k === 'tree' ? n.g.vi : 0].join(',')).join(';');
      for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
      MZ.noSave = false; MZ.saveNow(); MZ.noSave = true;
      const box = JSON.parse(localStorage.getItem('machizukuri-save'));
      return { s, hash: (h >>> 0).toString(16) + ':' + MZ.world.nodes.filter(n => n.ck === '0,0').length, meshes: Object.keys(MZ.town.meshes).length, v: box.v, conc: box.data.inv.concrete, V: MZ.SAVE_V };
    });
    const sd = st.s, n0 = fd.chunks['0,0'].layers.ground.length + fd.chunks['1,0'].layers.ground.length;
    ok('版 2 の町の見本：「つづきから」で遊べ、版 2 の保存が版 3 として読める（SAVE_V 3）', fj.v === 2 && !('concrete' in fd.inv) && st.V === 3 && title.includes('つづきから'), JSON.stringify([fj.v, st.V, title]));
    ok('版 2 の町の見本：持ち物にコンクリート 0 が足され、ほかの持ち物はそのまま', sd.inv.concrete === 0 && Object.keys(fd.inv).every(k => sd.inv[k] === fd.inv[k]), JSON.stringify(sd.inv));
    ok('版 2 の町の見本：人口 210・段階 3（町）・持っている区画 0,0 と 1,0 がそのまま', sd.pop === fd.pop && fd.pop > 200 && sd.stage === 3 && sd.land.join('|') === '0,0|1,0' && sd.land.join() === fd.land.join(), JSON.stringify([sd.pop, sd.stage, sd.land]));
    ok('版 2 の町の見本：建物（2 区画の id・t・x・z・r の並び）・採った物のキー・仕事場の時間（見本のキーは残る）・番号が見本と同じ', ['0,0', '1,0'].every(k => JSON.stringify(sd.chunks[k].layers.ground) === JSON.stringify(fd.chunks[k].layers.ground)) && Object.keys(sd.chunks['0,0'].taken).join() === Object.keys(fd.chunks['0,0'].taken).join() && sd.nextId === fd.nextId && Object.keys(fd.timers.jobs).every(k => k in sd.timers.jobs) && n0 > 25, n0 + ' ' + sd.nextId + '/' + fd.nextId);
    ok('版 2 の町の見本：建物がそろって描かれる・配置のハッシュ 79e4b006:444 が変わらない', st.meshes === n0 && st.hash === '79e4b006:444', JSON.stringify([st.meshes, st.hash]));
    ok('版 2 の町の見本：保存し直すと版 3・concrete 0 になる', st.v === 3 && st.conc === 0, JSON.stringify([st.v, st.conc]));
    /* 版 2 → 3 の直しは、持ち物以外に触らない。版 1 は 1 → 2 → 3 と順に直る */
    const mg = await ev(a.pg, d => {
      const m = MZ.migrate, o = JSON.parse(JSON.stringify(d.data)), same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
      const m3 = m[2](o), noInv = c => { const q = JSON.parse(JSON.stringify(c)); delete q.inv; return q; };
      const out = { only: same(noInv(m3), noInv(o)), conc: m3.inv.concrete, keep: !same(m3, o) && o.inv.concrete === undefined };
      const v1 = JSON.parse(JSON.stringify(o)); delete v1.land; v1.chunks = { '0,0': v1.chunks['0,0'] };
      const m13 = m[2](m[1](v1));
      out.chain = same(m13.land, ['0,0']) && m13.inv.concrete === 0 && same(m13.chunks['0,0'], o.chunks['0,0']) && Object.keys(m).join() === '1,2';
      return out;
    }, fj);
    ok('migrate[2]：持ち物に concrete 0 を足すだけ（元の物は書きかえず、建物・採った物・時間・番号・区画は触らない）。migrate[1]→[2] も順に直る', mg.only && mg.conc === 0 && mg.keep && mg.chain, JSON.stringify(mg));
    ok('版 2 の町の見本の読み込みで出たエラー・警告が 0', a.list.length === 0, a.list.slice(0, 4).join(' | '));
    await a.c.close();
  }
  /* ---- β0.4.0 区切り 1：コンクリートと工房のえらび ---- */
  {
    const a = await open2({});
    await begin2(a.pg);
    const R = await ev(a.pg, () => {
      const out = {}, Tn = MZ.town, s = MZ.state;
      MZ.noSave = true;
      const all = n => { Object.keys(s.inv).forEach(k => { s.inv[k] = n; }); };
      const near = id => { const b = Tn.byId[id], c = Tn.center(b); s.player.x = c[0]; s.player.z = c[1] - 4; };
      const rc = MZ.RECIPES.find(r => r.key === 'concrete');
      out.rec = rc && JSON.stringify(rc.cost) === '{"stone":2,"clay":1}' && JSON.stringify(rc.give) === '{"concrete":1}' && rc.at === 'kiln' && rc.stage === 3 && MZ.ITEMS.concrete === 'コンクリート' && MZ.ITEM_ORDER.includes('concrete');
      out.start = s.inv.concrete === 0;
      /* かまどのそばで、段階 2（村）までは作れず、段階 3（町）で作れる */
      all(999); s.inv.concrete = 0; s.stage = 2;
      MZ.noSave = true;
      const P = (k, x, z) => { all(999); s.inv.concrete = 0; if (!MZ.place(k, x, z, 0)) throw new Error('置けない ' + k); return Tn.list()[Tn.list().length - 1].id; };
      MZ.world.nodes.forEach(nd => { if (nd.gx >= 40 && nd.gx <= 90 && nd.gz >= 30 && nd.gz <= 90) MZ.world.take(nd.idx, -1); });
      const kid = P('kiln', 60, 70), wid = P('workshop', 64, 70);
      near(kid); all(999); s.inv.concrete = 0;
      out.r2 = MZ.craftReason(rc); out.c2 = MZ.craft('concrete'); out.c2n = MZ.craft('concrete', 5); out.n2 = s.inv.concrete;
      s.stage = 3; all(999); s.inv.concrete = 0; s.inv.stone = 5; s.inv.clay = 3;
      out.r3 = MZ.craftReason(rc); out.c3 = MZ.craft('concrete'); out.n3 = s.inv.concrete; out.stone = s.inv.stone; out.clay = s.inv.clay;
      s.player.x = 100; s.player.z = 100; all(999); s.inv.concrete = 0;
      out.far = MZ.craftReason(rc);   // かまどから遠いと作れない
      /* 工房のえらび：ロープ・コンクリートが入る。コンクリートは町まで選べない */
      const wd = MZ.BUILDS.workshop;
      out.craft = wd.craft.join();
      s.stage = 2;
      out.setRope = MZ.setMake(wid, 'rope') && Tn.byId[wid].mk === 'rope';
      out.setConc2 = MZ.setMake(wid, 'concrete'); out.mk2 = Tn.byId[wid].mk;
      s.stage = 3;
      out.setConc3 = MZ.setMake(wid, 'concrete') && Tn.byId[wid].mk === 'concrete';
      out.reason2 = (s.stage = 2, Tn.makeReason('concrete')); s.stage = 3; out.reason3 = Tn.makeReason('concrete'); out.reasonRope = Tn.makeReason('rope');
      /* 仕事場タブのボタン：ロープ・コンクリートが並び、コンクリートは段階 3 までは押せない */
      s.stage = 2; MZ.ui.tab = 'work'; MZ.ui.dirty = true; MZ.ui.panel(true); MZ.ui.render();
      const btn = k => document.querySelector('#pbody .mk[data-make="' + k + '"]');
      out.ui2 = { rope: !!btn('rope') && !btn('rope').disabled, conc: !!btn('concrete') && btn('concrete').disabled, n: document.querySelectorAll('#pbody .mk').length };
      s.stage = 3; MZ.ui.sig = ''; MZ.ui.render();
      out.ui3 = { conc: !!btn('concrete') && !btn('concrete').disabled, n: document.querySelectorAll('#pbody .mk').length };
      MZ.ui.panel(false);
      /* 工房が動く：ロープ（草 3 → ロープ 1）・コンクリート（石 2・粘土 1 → 1） */
      MZ.setMake(wid, 'rope'); all(0); s.inv.grass = 6; Tn.jobsDirty = true; s.timers.jobs[wid] = 0.1; s.timers.migrate = -1e6; s.pop = Math.max(s.pop, 6);
      out.stateRope = Tn.workSt(Tn.byId[wid]);
      return out;
    });
    ok('コンクリートのレシピ：石 2・粘土 1 → コンクリート 1、かまどで、段階 3（町）。持ち物の並びに入る・さいしょは 0', R.rec === true && R.start === true, JSON.stringify([R.rec, R.start]));
    ok('コンクリートは段階 2（村）までは作れない（理由は「町（人口 200）で解放」）', R.r2 === '町（人口 200）で解放' && R.c2 === false && R.c2n === false && R.n2 === 0, JSON.stringify([R.r2, R.c2, R.c2n, R.n2]));
    ok('段階 3（町）で、かまどの近くなら作れる（石 2・粘土 1 を使って 1 つ）。かまどから遠いと作れない', R.r3 === '' && R.c3 === true && R.n3 === 1 && R.stone === 3 && R.clay === 2 && R.far === 'かまどの近くで', JSON.stringify([R.r3, R.c3, R.n3, R.stone, R.clay, R.far]));
    ok('工房の craft に rope・concrete が入る（板・れんが・鉄インゴットのあと）', R.craft === 'plank,brick,ingot,rope,concrete', R.craft);
    ok('工房のえらび：ロープはえらべる。コンクリートは段階 3 まで選べず（false・mk は変わらない）、段階 3 で選べる', R.setRope === true && R.setConc2 === false && R.mk2 === 'rope' && R.setConc3 === true && R.reason2 === '町（人口 200）で解放' && R.reason3 === '' && R.reasonRope === '', JSON.stringify([R.setRope, R.setConc2, R.mk2, R.setConc3, R.reason2, R.reason3, R.reasonRope]));
    ok('仕事場タブ：ロープ・コンクリートのボタンが並び（5 つ＋止める＝6）、コンクリートは段階 3 まで押せない', R.ui2.rope && R.ui2.conc && R.ui2.n === 6 && R.ui3.conc && R.ui3.n === 6, JSON.stringify([R.ui2, R.ui3]));
    /* 工房でロープ・コンクリートが実際にできる */
    const W2 = await ev(a.pg, () => {
      const s = MZ.state, Tn = MZ.town, w = Tn.list().find(b => b.t === 'workshop'), out = {};
      const all = n => { Object.keys(s.inv).forEach(k => { s.inv[k] = n; }); };
      all(0); s.inv.grass = 6; Tn.jobsDirty = true; s.timers.jobs[w.id] = 0.2; MZ.setMake(w.id, 'rope'); s.timers.jobs[w.id] = 0.2; s.pop = 30; s.timers.migrate = -1e6;
      MZ.tick(0.5); out.rope = [s.inv.rope, s.inv.grass];
      all(0); s.inv.stone = 4; s.inv.clay = 2; MZ.setMake(w.id, 'concrete'); s.timers.jobs[w.id] = 0.2; Tn.jobsDirty = true;
      MZ.tick(0.5); out.conc = [s.inv.concrete, s.inv.stone, s.inv.clay];
      return out;
    });
    ok('工房が動く：ロープ（草 3 → 1）・コンクリート（石 2・粘土 1 → 1）がつくられる', W2.rope[0] === 1 && W2.rope[1] === 3 && W2.conc[0] === 1 && W2.conc[1] === 2 && W2.conc[2] === 1, JSON.stringify(W2));
    const inv = await ev(a.pg, () => {
      const s = MZ.state; s.stage = 2; s.inv.concrete = 0; MZ.ui.tab = 'inv'; MZ.ui.sig = ''; MZ.ui.panel(true);
      const t2 = document.querySelector('#pbody').textContent.includes('コンクリート');
      s.stage = 3; MZ.ui.sig = ''; MZ.ui.render(); const t3 = document.querySelector('#pbody').textContent.includes('コンクリート');
      MZ.ui.panel(false);
      return [t2, t3];
    });
    ok('持ち物タブ：コンクリートは町になるまで（0 のあいだ）出ない。町では出る', inv[0] === false && inv[1] === true, JSON.stringify(inv));
    ok('コンクリート・工房のえらびで出たエラー・警告が 0', a.list.length === 0, a.list.slice(0, 4).join(' | '));
    await a.c.close();
  }
  /* ---- β0.3.0 区切り 2：村の遊び（1 区画の中）。テストの中だけで持ち物・人口・段階を書く（ゲームに持ち物を増やす関数は作らない） ---- */
  {
    const a = await open2({});
    await begin2(a.pg);
    const R = await ev(a.pg, () => {
      const out = {}, W = MZ.world, Tn = MZ.town, s = MZ.state, T = MZ.T;
      MZ.noSave = true;
      W.nodes.forEach(nd => { if (nd.gx >= 30 && nd.gx <= 95 && nd.gz >= 30 && nd.gz <= 95) W.take(nd.idx, -1); });
      const hold = () => { s.timers.migrate = -1e6; };   // 移住・退去で人口が動かないように止める
      const setInv = o => { Object.keys(s.inv).forEach(k => { s.inv[k] = o[k] || 0; }); };
      const all = n => { Object.keys(s.inv).forEach(k => { s.inv[k] = n; }); };
      const near = id => { const b = Tn.byId[id], c = Tn.center(b); s.player.x = c[0]; s.player.z = c[1] - 4; };
      const P = (k, x, z, r) => { all(999); const ok = MZ.place(k, x, z, r || 0); if (!ok) throw new Error('置けない ' + k + ' ' + x + ',' + z); return Tn.list()[Tn.list().length - 1].id; };
      const NEW = ['stoneroad', 'bigfield', 'quarry', 'claypit', 'workshop', 'shop', 'storehouse'];
      /* 1 段階 2 より前は選べない（村で解放） */
      all(999); s.stage = 1;
      out.lock = NEW.every(k => Tn.lockReason(k).indexOf('村') === 0 && MZ.startBuild(k) === false);
      s.stage = 2;
      out.unlock = NEW.every(k => Tn.lockReason(k) === '');
      /* 2 3×3：見本の位置と置いたマスが合う。こわすと 9 マスとも空く */
      s.player.x = 3.5; s.player.z = -7; s.player.yaw = 0; s.player.pitch = 0.35; s.player.view = 1;
      all(999);
      MZ.startBuild('storehouse'); Tn.updatePreview();
      const bd = MZ.build, gx = bd.gx, gz = bd.gz, okp = bd.ok;
      const placed = MZ.placeHere(); MZ.cancelBuild();
      const sid = W.owner[MZ.ci(gx, gz)], cells = []; for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) cells.push(W.owner[MZ.ci(gx + i, gz + j)]);
      const sb = Tn.byId[sid], c = sb ? Tn.center(sb) : [0, 0];
      out.three = { okp, placed, same: sid > 0 && cells.every(v => v === sid), center: sb && Math.abs(c[0] - ((gx - T.chunk / 2) * T.cell + 3 * T.cell / 2)) < 1e-6 && Math.abs(c[1] - ((gz - T.chunk / 2) * T.cell + 3 * T.cell / 2)) < 1e-6, ring: W.owner[MZ.ci(gx - 1, gz)] === 0 && W.owner[MZ.ci(gx + 3, gz)] === 0 };
      out.threeRemove = MZ.remove(sid) && (() => { for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (W.owner[MZ.ci(gx + i, gz + j)] !== 0) return false; return true; })();
      /* 3 石畳：土の道とまざってつながる。面した家は 1 人多く住める。つながっていない石畳では増えない */
      P('road', 61, 59); P('stoneroad', 62, 59); P('road', 63, 59); P('road', 64, 59); P('road', 65, 59);
      P('house', 62, 60); P('house', 64, 60);
      P('stoneroad', 80, 80); P('house', 80, 81);
      out.road = { homeSum: Tn.info.homeSum, paved: Tn.info.paved, unc: Tn.info.unconnected, roads: Tn.info.roads };
      /* 石畳の塗り：表の A が石畳のマスで 255、ほかは 0。石畳のマスは R（土の道）が 0。石畳のマスに草が無い */
      { const md = MZ.gfx.ground.data.data, A = (gx, gz) => md[MZ.ci(gx, gz) * 4 + 3], Rr = (gx, gz) => md[MZ.ci(gx, gz) * 4];
        let n255 = 0, bad = 0; for (let i = 3; i < md.length; i += 4) { if (md[i] === 255) n255++; else if (md[i] !== 0) bad++; }
        s.player.x = 5; s.player.z = -1; MZ.gfx.grass.layout(5, -1);
        out.paint = { stone: A(62, 59), stone2: A(80, 80), dirt: A(61, 59), house: A(62, 60), none: A(10 + 60, 5 + 60), rStone: Rr(62, 59), rDirt: Rr(61, 59), n255, bad, grass: MZ.gfx.grass.countInCell(62, 59), grassDirt: MZ.gfx.grass.countInCell(61, 59) }; }
      /* 4 店：商店に人手が無くても数える */
      s.pop = 0; Tn.recalc(true);
      out.shop0 = Tn.info.shop;
      const shopId = P('shop', 70, 62); s.pop = 0; Tn.recalc(true);
      out.shop1 = [Tn.info.shop, Tn.info.low.shop, Tn.info.cap <= Tn.info.shop];
      /* 5 水・食料をまかない、移住の間かく */
      P('well', 66, 56); P('field', 68, 56);
      s.pop = 0; Tn.recalc(true);
      out.capNow = Tn.info.cap;
      s.stage = 1; s.pop = 0; s.timers.migrate = 0; MZ.tick(8.5); out.m1a = s.pop; MZ.tick(0.5); out.m1b = s.pop;
      s.stage = 2; s.pop = 0; s.timers.migrate = 0; MZ.tick(5.5); out.m2a = s.pop; MZ.tick(0.5); out.m2b = s.pop;
      /* 6 工房 */
      s.pop = 10; Tn.jobsDirty = true;
      const wid = P('workshop', 66, 60);
      s.pop = 10; Tn.jobsDirty = true;
      setInv({}); out.wsOff = Tn.workState(Tn.byId[wid]).st;
      out.setBad = [MZ.setMake(wid, 'stick'), MZ.setMake(9999, 'brick'), MZ.setMake(Tn.list()[0].id, 'brick')];
      out.setOk = MZ.setMake(wid, 'brick'); out.wsShort = Tn.workState(Tn.byId[wid]);
      setInv({ clay: 2, stick: 1 }); s.timers.jobs[wid] = 25; hold(); MZ.tick(24.5); out.beforeBrick = s.inv.brick; MZ.tick(1);
      out.brick = { brick: s.inv.brick, clay: s.inv.clay, stick: s.inv.stick };
      out.wsAgain = Tn.workState(Tn.byId[wid]).st;
      MZ.setMake(wid, null); out.mkNull = !('mk' in Tn.byId[wid]) && Tn.workState(Tn.byId[wid]).st === 'off';
      MZ.setMake(wid, 'plank'); MZ.noSave = false; MZ.saveNow(); MZ.noSave = true;
      const ld = MZ.loadSave(); out.mkSaved = ld.status === 'ok' && ld.state.chunks['0,0'].layers.ground.some(b => b.id === wid && b.mk === 'plank');
      MZ.setMake(wid, null);
      /* 7 きこり小屋で原木と枝 */
      const lid = P('lumber', 70, 66); s.pop = 10; Tn.jobsDirty = true;
      setInv({}); s.timers.jobs[lid] = 20; hold(); MZ.tick(20.5);
      out.lumber = [s.inv.log, s.inv.stick];
      /* 8 自動の上限：採石場 */
      const qid = P('quarry', 72, 66); s.pop = 10; Tn.jobsDirty = true;
      setInv({ stone: 100 }); out.qFull = Tn.workState(Tn.byId[qid]).st; out.cap0 = MZ.autoCap();
      setInv({ stone: 99 }); s.timers.jobs[qid] = 30; hold(); MZ.tick(30.5); out.stone102 = s.inv.stone;
      P('storehouse', 76, 66); s.pop = 10; Tn.jobsDirty = true;
      out.cap1 = MZ.autoCap();
      setInv({ stone: 100 }); out.qRun = Tn.workState(Tn.byId[qid]).st; s.timers.jobs[qid] = 30; hold(); MZ.tick(30.5); out.stone103 = s.inv.stone;
      /* 9 ×5：作業台の近くで原木 5 → 板 10。4 回ぶんしか無いと作れない */
      P('bench', 62, 56); s.player.x = 3; s.player.z = -7;
      setInv({ log: 4 }); const f4 = MZ.craft('plank', 5);
      setInv({ log: 5 }); const f5 = MZ.craft('plank', 5);
      out.x5 = { f4, f5, log: s.inv.log, plank: s.inv.plank, bad3: MZ.craft('plank', 3), tool: MZ.craft('axe2', 5) };
      /* 10 住民：仕事場のまわり 9m 以内にいる人がいる */
      s.pop = 30; Tn.jobsDirty = true; Tn.resDirty = true; MZ.tick(6);
      const work = Tn.residents.filter(r => { const b = Tn.byId[r.home]; return b && (MZ.BUILDS[b.t].jobs || MZ.BUILDS[b.t].shop); });
      out.res = { n: Tn.residents.length, work: work.length, near: work.some(r => { const c = Tn.center(Tn.byId[r.home]); return Math.hypot(r.x - c[0], r.z - c[1]) <= 9; }), shopFolk: Tn.residents.some(r => Tn.byId[r.home] && Tn.byId[r.home].t === 'shop') };
      /* 11 商店が無い古い街：店が足りないと 1 人ずつ出ていき、最初に 1 回だけ知らせる */
      const old = T.shopFree; T.shopFree = 2; Tn.recalc(true); s.stage = 2; s.pop = 10; s.timers.migrate = 0;
      const sb2 = Tn.byId[shopId]; // 商店があると 30 人分あるので、いったんこわす
      MZ.remove(shopId); T.shopFree = 2; Tn.recalc(true); Tn.shopWarned = false; s.pop = 6; s.timers.migrate = 0; MZ.tick(6.5);
      out.leave = { pop: s.pop, warned: Tn.shopWarned, low: Tn.info.low.shop, cap: Tn.info.cap };
      T.shopFree = old; Tn.recalc(true);
      return out;
    });
    ok('新しい建物 7 種：段階 2 より前は「村で解放」でえらべず、段階 2 で置ける', R.lock && R.unlock, JSON.stringify([R.lock, R.unlock]));
    ok('3×3（倉庫）：見本の位置と置いたマスが合い、9 マスの owner が同じ id。こわすと 9 マスとも空く', R.three.okp && R.three.placed && R.three.same && R.three.center && R.three.ring && R.threeRemove, JSON.stringify([R.three, R.threeRemove]));
    ok('石畳：土の道とまざってつながり、面した木の家は 3 人（面していない家は 2 人）。つながっていない石畳では増えない', R.road.homeSum === 5 && R.road.paved === 1 && R.road.unc === 1, JSON.stringify(R.road));
    ok('石畳の塗り：表の A が石畳のマスで 255、ほかは 0（土の道・家・空き地）。石畳のマスは R が 0（土の道は 255）', R.paint.stone === 255 && R.paint.stone2 === 255 && R.paint.n255 === 2 && R.paint.bad === 0 && R.paint.dirt === 0 && R.paint.house === 0 && R.paint.none === 0 && R.paint.rStone === 0 && R.paint.rDirt === 255, JSON.stringify(R.paint));
    ok('石畳のマスに草が無い（owner があるので）', R.paint.grass === 0 && R.paint.grassDirt === 0, JSON.stringify([R.paint.grass, R.paint.grassDirt]));
    ok('店：商店が無ければ 50、商店 1 つで 80（人手が無くても数える）。上限は店をこえない', R.shop0 === 50 && R.shop1[0] === 80 && R.shop1[1] === false && R.shop1[2], JSON.stringify([R.shop0, R.shop1]));
    ok('移住の間かく：段階 1 は 9 秒、段階 2 は 6 秒で 1 人（上限 ' + R.capNow + '）', R.capNow >= 1 && R.m1a === 0 && R.m1b === 1 && R.m2a === 0 && R.m2b === 1, JSON.stringify([R.m1a, R.m1b, R.m2a, R.m2b]));
    ok('工房：えらばないと off。材料が無いと short。setMake で粘土 2・枝 1 が減り、れんがが 2 増える。止めると off', R.wsOff === 'off' && R.wsShort.st === 'short' && R.setOk === true && R.beforeBrick === 0 && R.brick.brick === 2 && R.brick.clay === 0 && R.brick.stick === 0 && R.mkNull, JSON.stringify([R.wsOff, R.wsShort, R.brick, R.mkNull]));
    ok('工房：工房でない物・知らない物・知らない id には setMake が false', R.setBad.every(v => v === false), JSON.stringify(R.setBad));
    ok('工房：保存して読み直しても mk が同じ', R.mkSaved === true);
    ok('きこり小屋で原木と枝が増える', R.lumber[0] === 1 && R.lumber[1] === 1, JSON.stringify(R.lumber));
    ok('自動の上限：石 100 で採石場は full。99 → 102 までは足す。倉庫で上限 250 になり、また動く（100 → 103）', R.qFull === 'full' && R.cap0 === 100 && R.stone102 === 102 && R.cap1 === 250 && R.qRun === 'run' && R.stone103 === 103, JSON.stringify([R.qFull, R.cap0, R.stone102, R.cap1, R.qRun, R.stone103]));
    ok('×5：原木 5 で板が 10 増える。4 回ぶんだけでは作れない。5 でも 1 でもない数・道具は作れない', R.x5.f4 === false && R.x5.f5 === true && R.x5.log === 0 && R.x5.plank === 10 && R.x5.bad3 === false && R.x5.tool === false, JSON.stringify(R.x5));
    ok('住民：仕事場・商店をよりどころにする人がいて、そのまわり 9m 以内にいる人がいる', R.res.work >= 1 && R.res.near && R.res.shopFolk && R.res.n >= 25, JSON.stringify(R.res));
    ok('店が足りない古い街：1 人ずつ出ていき、最初に 1 回だけ知らせる', R.leave.pop === 5 && R.leave.warned === true && R.leave.low === true, JSON.stringify(R.leave));
    /* 画面：仕事場タブ・近くの 1 行・HUD の店・持ち物の上限（文字を読む） */
    const UI = await ev(a.pg, () => {
      const s = MZ.state, Tn = MZ.town, U = MZ.ui, out = {};
      MZ.noSave = true; s.stage = 2; s.pop = 30; Tn.jobsDirty = true; Object.keys(s.inv).forEach(k => { s.inv[k] = 999; }); MZ.place('shop', 70, 62, 0); s.pop = 30; Tn.jobsDirty = true;
      Object.keys(s.inv).forEach(k => { s.inv[k] = 0; }); s.inv.stone = 120;
      const wid = Tn.list().find(b => b.t === 'workshop').id; MZ.setMake(wid, 'plank');
      U.update(0.2); out.hud = document.querySelector('#pop').textContent;
      U.panel(true); U.tab = 'work'; U.sig = ''; U.render();
      out.work = document.querySelector('#pbody').textContent;
      out.pressed = [...document.querySelectorAll('#pbody .mk')].map(b => b.textContent + ':' + b.getAttribute('aria-pressed')).join('|');
      out.tabs = [...document.querySelectorAll('#tabs button')].map(b => b.dataset.tab).join();
      U.tab = 'inv'; U.sig = ''; U.render(); out.inv = document.querySelector('#pbody').textContent;
      out.overCls = !!document.querySelector('#pbody li.auto b');
      U.tab = 'mat'; U.sig = ''; U.render(); out.x5btn = document.querySelectorAll('#pbody [data-craft5]').length;
      U.panel(false);
      const c = Tn.center(Tn.list().find(b => b.t === 'quarry')); s.player.x = c[0]; s.player.z = c[1] - 4;
      U.update(0.2); out.wk = document.querySelector('#wk').hidden ? '' : document.querySelector('#wk').textContent;
      MZ.startBuild('road'); U.update(0.2); out.wkBuild = document.querySelector('#wk').hidden; MZ.cancelBuild();
      s.player.x = -50; s.player.z = -50; U.update(0.2); out.wkFar = document.querySelector('#wk').hidden;
      return out;
    });
    ok('HUD：村のとき「店 80」が出る', /店 \d+/.test(UI.hud), UI.hud);
    ok('仕事場タブ：名前と番号・向きと距離・働く人・つくる物・状態・上限の行・工房のボタンが出る', /採石場 1/.test(UI.work) && /[北南東西]+ \d+m/.test(UI.work) && /働く人 3／3/.test(UI.work) && /30 秒ごとに 石 3/.test(UI.work) && /動いている（次まで \d+ 秒）|上限いっぱい/.test(UI.work) && /自動でたまる上限：250（倉庫 1）/.test(UI.work) && /店 30 人分/.test(UI.work) && UI.pressed === '板:true|れんが:false|鉄インゴット:false|ロープ:false|コンクリート:false|止める:false', JSON.stringify([UI.work.slice(0, 300), UI.pressed]));
    ok('タブ「仕事場」が「建てる」の右、「土地」が「仕事場」の右にある', UI.tabs === 'inv,mat,tool,build,work,land', UI.tabs);
    ok('持ち物タブ：自動でたまる物は「石 120／上限 250」の形', /石120／上限 250/.test(UI.inv) && UI.overCls, UI.inv.slice(0, 120));
    ok('材料タブに「×5」のボタンがある（材料のレシピの数だけ）', UI.x5btn === 5, UI.x5btn);
    ok('近くの 1 行：仕事場のそばで「採石場：…」が出る。建築中・遠いときは出ない', /^採石場：/.test(UI.wk) && UI.wkBuild === true && UI.wkFar === true, JSON.stringify([UI.wk, UI.wkBuild, UI.wkFar]));
    /* 目標・段階の文 */
    const GL = await ev(a.pg, () => {
      const s = MZ.state, Tn = MZ.town, out = [];
      MZ.noSave = true; s.stage = 1; s.pop = 5; s.tools.axe = 3; s.tools.pick = 3; s.inv.ingot = 3;
      ['kiln', 'furnace'].forEach(k => { if (!Tn.has(k)) { Object.keys(s.inv).forEach(i => { s.inv[i] = 999; }); const P = [[60, 54], [60, 52]]; MZ.place(k, P[k === 'kiln' ? 0 : 1][0], P[k === 'kiln' ? 0 : 1][1], 0); } });
      out.push(MZ.currentGoal());   // 段階 1 → 村にしよう
      s.stage = 2; out.push(MZ.currentGoal());
      return out;
    });
    ok('目標：集落のあとは「人口 50 で村にしよう」。村になったら次の建物の目標へ（途中までの建物で文が順に変わる）', /^人口 50 で村にしよう（れんがの家は 4 人住める）（人口 5／50）/.test(GL[0]) && GL[1].length > 0 && !/村にしよう/.test(GL[1]), JSON.stringify(GL));
    const BN = await ev(a.pg, () => { const s = MZ.state; s.stage = 1; s.pop = MZ.STAGES[2].pop; MZ.town.stageCheck(); return [document.querySelector('#banner').textContent, s.stage]; });
    ok('段階の文：村になると STAGES の banner が出る', BN[1] === 2 && BN[0] === '村になった！ 石畳・採石場・粘土採り場・工房・商店・倉庫・大きな畑が作れる', JSON.stringify(BN));
    ok('区切り 2 の試験でエラー・警告が 0', a.list.length === 0, a.list.slice(0, 4).join(' | '));
    await a.c.close();
  }

  /* ---- β0.3.0 0 章：区切り 2 のレビューの直しと、追加の決定（鉄鉱石 4・大きな畑の草・仕事場タブ・軽い workSt・店の知らせ） ---- */
  {
    const a = await open2({});
    await begin2(a.pg);
    const R = await ev(a.pg, () => {
      const out = {}, W = MZ.world, Tn = MZ.town, s = MZ.state, T = MZ.T, U = MZ.ui;
      MZ.noSave = true;
      W.nodes.forEach(nd => { if (nd.gx >= 30 && nd.gx <= 95 && nd.gz >= 30 && nd.gz <= 95) W.take(nd.idx, -1); });
      const all = n => { Object.keys(s.inv).forEach(k => { s.inv[k] = n; }); };
      const hold = () => { s.timers.migrate = -1e6; };
      const P = (k, x, z) => { all(999); const ok = MZ.place(k, x, z, 0); if (!ok) throw new Error('置けない ' + k); return Tn.list()[Tn.list().length - 1].id; };
      s.stage = 2; hold();
      /* 鉄鉱石は 4（配置・hp は変えない） */
      out.iron = [MZ.NODES.iron.drops.ore, MZ.NODES.iron.hp, MZ.NODES.iron.n];
      s.tools.pick = 3;
      const nd = W.nodes.find(n => n.k === 'iron' && W.nodeActive(n.idx)); TT.goto(nd); MZ.player.updateAim(); s.inv.ore = 0;
      let guard = 0; while (W.nodeActive(nd.idx) && guard++ < 40) MZ.hit();
      out.ore = s.inv.ore;
      /* 大きな畑：人手なしで 40 秒ごとに草 2。人口から引かない。上限にかかる */
      s.pop = 3; Tn.jobsDirty = true;
      const bf = P('bigfield', 70, 70); s.pop = 3; Tn.jobsDirty = true;
      const jb = Tn.jobs().find(j => j.id === bf);
      out.bfJob = jb && [jb.running, jb.need, jb.staff];
      all(0); s.timers.jobs[bf] = 40; out.bfSt = Tn.workSt(Tn.byId[bf]);
      MZ.tick(39.5); out.g39 = s.inv.grass; MZ.tick(1); out.g40 = s.inv.grass;
      s.inv.grass = 100; out.bfFull = Tn.workSt(Tn.byId[bf]); s.timers.jobs[bf] = 40; MZ.tick(41); out.gFull = s.inv.grass;
      s.inv.grass = 99; s.timers.jobs[bf] = 1; MZ.tick(1.5); out.g101 = s.inv.grass;
      /* 住民は大きな畑のまわりに立たない・人口は引かれない */
      s.pop = 10; Tn.jobsDirty = true; Tn.resDirty = true; MZ.tick(2);
      out.bfRes = Tn.residents.some(r => r.home === bf);
      /* 軽い workSt：文字列・配列でなく、'run' など 5 つの語だけ。step は workState を 1 回も呼ばない・autoCap() を呼ばない */
      const wid = P('workshop', 66, 60); s.pop = 20; Tn.jobsDirty = true;
      const lid = P('lumber', 62, 66); s.pop = 20; Tn.jobsDirty = true; hold();
      MZ.setMake(wid, 'plank'); all(0);
      const sts = {};
      sts.short = Tn.workSt(Tn.byId[wid]); s.inv.log = 1; sts.run = Tn.workSt(Tn.byId[wid]); s.inv.plank = 100; sts.full = Tn.workSt(Tn.byId[wid]);
      MZ.setMake(wid, null); sts.off = Tn.workSt(Tn.byId[wid]); s.pop = 1; Tn.jobsDirty = true; sts.staff = Tn.workSt(Tn.byId[lid]); s.pop = 20; Tn.jobsDirty = true;
      out.sts = sts;
      let nws = 0, nac = 0; const ow = Tn.workState, oa = MZ.autoCap;
      Tn.workState = function (b) { nws++; return ow.call(Tn, b); }; MZ.autoCap = function () { nac++; return oa(); };
      MZ.tick(5); Tn.workState = ow; MZ.autoCap = oa;
      out.calls = [nws, nac];
      out.capInfo = [Tn.info.autoCap, MZ.autoCap()];
      P('storehouse', 76, 70); out.capInfo.push(Tn.info.autoCap, MZ.autoCap());
      /* reloadBtex は道具を読み直さない（関数の中身に道具の読み込みが無い） */
      out.reload = /L\.tool|b_tool_/.test(MZ.gfx.looks.reloadBtex.toString());
      return out;
    });
    ok('鉄鉱石：鉄の鉱脈から 4（drops・hp 10・n 30 は hp・n そのまま）', R.iron[0] === 4 && R.iron[1] === 10 && R.iron[2] === 30 && R.ore === 4, JSON.stringify([R.iron, R.ore]));
    ok('大きな畑：人手なし（人口から引かない）で動き、40 秒ごとに草 2（39.5 秒では増えない）', R.bfJob && R.bfJob[0] === true && R.bfJob[1] === 0 && R.bfJob[2] === 0 && R.bfSt === 'run' && R.g39 === 0 && R.g40 === 2, JSON.stringify([R.bfJob, R.bfSt, R.g39, R.g40]));
    ok('大きな畑の草：上限（100）にかかる（上限いっぱいで止まる・99 → 101）', R.bfFull === 'full' && R.gFull === 100 && R.g101 === 101, JSON.stringify([R.bfFull, R.gFull, R.g101]));
    ok('大きな畑のまわりには住民を立たせない', R.bfRes === false);
    ok('Tn.workSt は短い語（run・short・full・off・staff）だけを返す', R.sts.run === 'run' && R.sts.short === 'short' && R.sts.full === 'full' && R.sts.off === 'off' && R.sts.staff === 'staff', JSON.stringify(R.sts));
    ok('step は workState（文字列づくり）も MZ.autoCap()（全建物を数える）も呼ばない。上限は Tn.info.autoCap（倉庫で 100 → 250）', R.calls[0] === 0 && R.calls[1] === 0 && R.capInfo.join() === '100,100,250,250', JSON.stringify([R.calls, R.capInfo]));
    ok('reloadBtex は道具（b_tool_）を読み直さない', R.reload === false);
    /* 仕事場タブ：開いたまま時間が進んでもボタンの要素が同じ。秒と状態の文だけ書きかえる。押した選択が効く */
    const U1 = await ev(a.pg, () => {
      const s = MZ.state, Tn = MZ.town, U = MZ.ui, out = {};
      MZ.noSave = true; s.timers.migrate = -1e6;
      const wid = Tn.list().find(b => b.t === 'workshop').id, qid = Tn.list().find(b => b.t === 'lumber').id;
      Object.keys(s.inv).forEach(k => { s.inv[k] = 0; }); s.inv.log = 50; MZ.setMake(wid, 'plank'); s.timers.jobs[qid] = 20; s.timers.jobs[wid] = 25;
      U.panel(true); U.tab = 'work'; U.sig = ''; U.render();
      window.__btn = document.querySelector('#pbody .mk[data-make=brick]'); window.__ul = document.querySelector('#pbody ul.wk');
      window.__ws = document.querySelector('#pbody [data-ws="' + qid + '"]');
      out.t0 = window.__ws.textContent; out.n = document.querySelectorAll('#pbody [data-ws]').length;
      window.__sc = (document.querySelector('#pbody').scrollTop = 0);
      MZ.tick(3); U.update(0.2); U.render();
      out.same = window.__btn.isSameNode(document.querySelector('#pbody .mk[data-make=brick]')) && window.__ul.isSameNode(document.querySelector('#pbody ul.wk')) && window.__ws.isSameNode(document.querySelector('#pbody [data-ws="' + qid + '"]'));
      out.t1 = window.__ws.textContent;
      out.attached = document.body.contains(window.__btn);
      return out;
    });
    ok('仕事場タブ：開いたまま 3 秒すすんでも、ボタン・一覧・状態の行の要素が同じ（作り直さない）。状態の文だけ変わる（' + U1.t0 + ' → ' + U1.t1 + '）', U1.same && U1.attached && U1.t0 !== U1.t1 && /動いている（次まで \d+ 秒）/.test(U1.t1) && U1.n >= 2, JSON.stringify(U1));
    await a.pg.click('#pbody .mk[data-make=brick]');
    const U2 = await ev(a.pg, () => { const Tn = MZ.town, w = Tn.list().find(b => b.t === 'workshop'); return { mk: w.mk, pressed: document.querySelector('#pbody .mk[data-make=brick]').getAttribute('aria-pressed'), prev: document.querySelector('#pbody .mk[data-make=plank]').getAttribute('aria-pressed') }; });
    ok('仕事場タブ：押したボタン（れんが）が効いて、MZ の状態と aria-pressed が変わる', U2.mk === 'brick' && U2.pressed === 'true' && U2.prev === 'false', JSON.stringify(U2));
    const U3 = await ev(a.pg, () => {
      const U = MZ.ui, out = {};
      U.panel(true); U.tab = 'work'; U.sig = ''; U.render(); out.work = document.querySelector('#pbody').textContent;
      U.tab = 'inv'; U.sig = ''; U.render(); out.inv = document.querySelector('#pbody').textContent;
      U.panel(false);
      return out;
    });
    ok('仕事場タブに「大きな畑 1」の「人手なし」「40 秒ごとに 草 2」が出る。持ち物タブの草に上限が付く', /大きな畑 1/.test(U3.work) && /人手なし/.test(U3.work) && /40 秒ごとに 草 2/.test(U3.work) && /草\d+／上限 250/.test(U3.inv), U3.work.slice(0, 160) + ' | ' + U3.inv.slice(0, 80));
    /* 店の知らせ：店がいちばん少なく、ほかの 3 つより小さいときだけ */
    const SH = await ev(a.pg, () => {
      const s = MZ.state, Tn = MZ.town, T = MZ.T, out = {}, old = T.shopFree;
      MZ.noSave = true; MZ.ui.panel(false);
      Tn.list().filter(b => MZ.BUILDS[b.t].shop || MZ.BUILDS[b.t].store).forEach(b => MZ.remove(b.id));
      Object.keys(s.inv).forEach(k => { s.inv[k] = 999; });
      MZ.place('road', 61, 59, 0); MZ.place('road', 62, 59, 0); MZ.place('road', 63, 59, 0); MZ.place('house', 62, 60, 0); MZ.place('well', 66, 56, 0); MZ.place('field', 68, 56, 0);   // 家 2・水 10・食料（畑 4 ＋ 大きな畑 12）
      const I = () => Tn.info;
      /* 店が家・水・食料と同じ数のときは出さない */
      T.shopFree = Math.min(I().homeSum, I().water, I().food); Tn.recalc(true);
      out.eq = [I().shop, I().homeSum, I().water, I().food]; out.eqOk = I().homeSum === 2 && I().shop === 2;
      Tn.shopWarned = false; s.pop = I().cap + 3; s.timers.migrate = 0; MZ.tick(6.5); out.eqWarn = Tn.shopWarned;
      /* 店が足りないとき（ほかの 3 つより小さい）は出る */
      T.shopFree = Math.max(0, Math.min(I().homeSum, I().water, I().food) - 1); Tn.recalc(true);
      Tn.shopWarned = false; s.pop = I().cap + 3; s.timers.migrate = 0; MZ.tick(6.5); out.lowWarn = Tn.shopWarned; out.lowInfo = [I().shop, I().homeSum, I().water, I().food];
      T.shopFree = old; Tn.recalc(true);
      return out;
    });
    ok('店の知らせ：店が家と同じ数のときは出さない／ほかの 3 つより小さいときは出す', SH.eqOk && SH.eqWarn === false && SH.lowWarn === true, JSON.stringify(SH));
    ok('0 章の試験でエラー・警告が 0', a.list.length === 0, a.list.slice(0, 4).join(' | '));
    await a.c.close();
  }

  /* ---- β0.3.0 区切り 3：土地を広げる（材料はテストの中だけで持たせる。ゲームに持ち物を増やす関数は作らない） ---- */
  {
    const a = await open2({});
    await begin2(a.pg);
    /* 今の（広げる前の）地形の式の写し。"0,0" だけのとき、hOut が 1 つ残らず同じ値を返すことを確かめるのに使う */
    const R = await ev(a.pg, () => {
      const out = {}, W = MZ.world, Tn = MZ.town, s = MZ.state, T = MZ.T, G = MZ.gfx, S = MZ.STAGES;
      MZ.noSave = true;
      const all = n => { Object.keys(s.inv).forEach(k => { s.inv[k] = n; }); };
      const hashOf = f => { let h = 2166136261; const ns = W.nodes.filter(f); const str = ns.map(n => [n.idx, n.k, n.x, n.z, n.s.toFixed(6), n.ry.toFixed(6), n.k === 'tree' ? n.g.vi : 0].join(',')).join(';'); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16) + ':' + ns.length; };
      out.h0 = hashOf(() => true);
      /* "0,0" だけの地形：昔の式と同じ値 */
      const { fbm, smooth } = G, HALF = 120;
      const old = (x, z) => { const c = Math.max(Math.abs(x), Math.abs(z)); if (c <= HALF + 6) return 0; const r = Math.sqrt(x * x + z * z); const f = smooth(HALF + 6, HALF + 70, c); let h = (fbm(x * 0.012 + 40, z * 0.012 + 40, 11, 4) - 0.35) * 9 + (fbm(x * 0.05, z * 0.05, 12, 3) - 0.5) * 1.6; h += smooth(110, 280, r) * Math.pow(fbm(x * 0.0065 + 3, z * 0.0065 + 7, 14, 4), 1.6) * 55; h = Math.max(h, 0) * f; return h * (1 - smooth(250, 300, r) * 0.6); };
      let same = true, n = 0; for (let i = 0; i < 400; i++) { const x = ((i * 97) % 700) - 350 + 0.37, z = ((i * 61) % 700) - 350 - 0.21; if (old(x, z) !== G.ground.hOut(x, z)) same = false; n++; }
      out.hSame = [same, n];
      out.rect0 = G.ground.rect && [G.ground.rect.x0, G.ground.rect.x1, G.ground.rect.z0, G.ground.rect.z1];
      out.fence0 = [G.ground.fenceCount, G.ground.fence.thinInstanceCount];
      /* canExpand の理由 5 つ（順に：世界の外・もう持っている・となりの区画を先に・村で解放・材料が足りない） */
      s.stage = 1; all(9999);
      out.r = [MZ.canExpand(2, 0), MZ.canExpand(0, -2), MZ.canExpand(0, 0), MZ.canExpand(1, 1), MZ.canExpand(1, 0)];
      s.stage = 2; all(0); out.r2 = [MZ.canExpand(1, 0), MZ.canExpand(1, 1)];
      all(9999); out.r3 = MZ.canExpand(1, 0);
      out.kinds = Object.keys(MZ.CHUNK_KINDS).map(k => k + ':' + MZ.CHUNK_KINDS[k]).join(' ');
      /* 失敗するときは何も変えない */
      all(0); const inv0 = JSON.stringify(s.inv); out.noExp = [MZ.expand(1, 0), MZ.expand(5, 5), JSON.stringify(s.inv) === inv0, s.land.length];
      /* 材料の払い（1・3・5 区画め）。1 区画め：東（岩場） */
      const spend = (cx, cz) => { all(1000); const b = JSON.stringify(s.inv); const ok = MZ.expand(cx, cz); const d = {}; Object.keys(s.inv).forEach(k => { if (s.inv[k] !== 1000) d[k] = 1000 - s.inv[k]; }); return { ok, d }; };
      out.sp1 = spend(1, 0);                      // 1 区画め
      out.sp2 = spend(0, 1);                      // 2 区画め（同じ行）
      out.sp3 = spend(-1, 0);                     // 3 区画め
      out.sp4 = spend(0, -1);                     // 4 区画め
      out.sp5 = spend(1, 1);                      // 5 区画め
      out.sp6 = spend(1, -1); out.sp7 = spend(-1, -1); out.sp8 = spend(-1, 1);
      out.all9 = [s.land.length, s.land.join(' '), Object.keys(s.chunks).length, W.landKeys.length];
      out.after9 = [MZ.canExpand(0, 0), MZ.canExpand(2, 2)];
      /* 採れる物の数：種類の倍率どおり（岩場の鉄は 30 × 3）。区画 "0,0" の物は変わらない */
      const cnt = key => { const o = {}; (W.byChunk[key] || []).forEach(i => { const k = W.nodes[i].k; o[k] = (o[k] || 0) + 1; }); return o; };
      out.cnt = { home: cnt('0,0'), rocky: cnt('1,0'), forest: cnt('0,1'), clay: cnt('0,-1') };
      out.h1 = hashOf(n => n.ck === '0,0');
      out.idx = W.nodes.every((n, i) => n.idx === i && W.byChunk[n.ck][n.li] === i && n.tk === s.chunks[n.ck].taken);
      out.within = W.nodes.every(n => MZ.landAt(n.gx, n.gz) && n.x > -360 && n.x < 360 && W.cellNode[MZ.ci(n.gx, n.gz)] === n.idx);
      return out;
    });
    ok('広げる前の "0,0" の地形・柵：hOut が昔の式と 1 つ残らず同じ・rect が ±120・杭 240 本（角は 1 本）', R.hSame[0] && R.rect0.join() === '-120,120,-120,120' && R.fence0[0] === 240 && R.fence0[1] === 240, JSON.stringify([R.hSame, R.rect0, R.fence0]));
    ok('canExpand の理由が 5 つ：世界の外・世界の外・もう持っている・となりの区画を先に（村でも材料でもなく）・村（人口 50）で解放', R.r[0] === '世界の外' && R.r[1] === '世界の外' && R.r[2] === 'もう持っている' && R.r[3] === 'となりの区画を先に' && R.r[4] === '村（人口 50）で解放', JSON.stringify(R.r));
    ok('canExpand：村で材料が無ければ「材料が足りない」。となりが無ければ、材料が無くても「となりの区画を先に」。材料があれば空', R.r2[0] === '材料が足りない' && R.r2[1] === 'となりの区画を先に' && R.r3 === '', JSON.stringify([R.r2, R.r3]));
    ok('区画の種類の表：' + R.kinds, R.kinds === '0,0:home 0,1:forest 1,0:rocky 0,-1:clayland -1,0:forest 1,1:rocky 1,-1:clayland -1,-1:rocky -1,1:clayland', R.kinds);
    ok('広げられないとき（材料なし・世界の外）は false で、持ち物も区画の数も変わらない', R.noExp[0] === false && R.noExp[1] === false && R.noExp[2] && R.noExp[3] === 1, JSON.stringify(R.noExp));
    const dj = o => JSON.stringify(Object.entries(o.d).sort()), ej = o => JSON.stringify(Object.entries(o).sort());
    ok('材料の払い：1・2 区画め＝板 40・石 40・ロープ 5（東の岩場・北の森）', R.sp1.ok && R.sp2.ok && dj(R.sp1) === ej({ plank: 40, stone: 40, rope: 5 }) && dj(R.sp2) === dj(R.sp1), dj(R.sp1) + ' ' + dj(R.sp2));
    ok('材料の払い：3・4 区画め＝板 80・石 80・れんが 40', R.sp3.ok && R.sp4.ok && dj(R.sp3) === ej({ plank: 80, stone: 80, brick: 40 }) && dj(R.sp4) === dj(R.sp3), dj(R.sp3) + ' ' + dj(R.sp4));
    ok('材料の払い：5〜8 区画め＝板 120・石 120・れんが 80・鉄インゴット 10', [R.sp5, R.sp6, R.sp7, R.sp8].every(x => x.ok && dj(x) === dj(R.sp5)) && dj(R.sp5) === ej({ plank: 120, stone: 120, brick: 80, ingot: 10 }), dj(R.sp5));
    ok('9 区画を全部広げられる（land・chunks・W.landKeys が 9）。そのあとは「もう持っている」・「世界の外」', R.all9[0] === 9 && R.all9[2] === 9 && R.all9[3] === 9 && R.after9[0] === 'もう持っている' && R.after9[1] === '世界の外', JSON.stringify([R.all9, R.after9]));
    const c = R.cnt;
    ok('広げた区画の採れる物：岩場は岩 180・鉄 90（30×3）・木 130、森は木 260、粘土の土地は粘土 102', c.rocky.rock === 180 && c.rocky.iron === 90 && c.rocky.tree === 130 && c.forest.tree === 260 && c.clay.clay === 102 && c.forest.rock === 60, JSON.stringify(c));
    ok('区画 "0,0" の物は 444 個で、位置のハッシュが 79e4b006（広げたあとも同じ）。番号 idx・区画の中の番号・nd.tk が正しく、全部が土地の中のマス', R.h0 === '79e4b006:444' && R.h1 === '79e4b006:444' && R.idx && R.within, JSON.stringify([R.h0, R.h1, R.idx, R.within]));
    ok('区切り 3（その 1）でエラー・警告が 0（9 区画を広げる・描画の入れ物・柵・山）', a.list.length === 0, a.list.slice(0, 4).join(' | '));
    await a.c.close();
  }
  /* 広げた区画で物を採る → 保存 → 読み直し（別のページ）／区画の境をまたぐ家／道が区画をまたぐ／L 字の柵・当たり・地形・草 */
  {
    const a = await open2({});
    await begin2(a.pg);
    const R = await ev(a.pg, () => {
      const out = {}, W = MZ.world, Tn = MZ.town, s = MZ.state, T = MZ.T, G = MZ.gfx;
      MZ.noSave = true;
      const all = n => { Object.keys(s.inv).forEach(k => { s.inv[k] = n; }); };
      s.stage = 2; all(9999); s.timers.migrate = -1e6;
      /* L 字：東と北を広げる */
      out.ex = [MZ.expand(1, 0), MZ.expand(0, 1)];
      out.land = s.land.join(' ');
      /* 区画 "1,0" で物を採る（くさむら 3 つ・岩 1 つ） */
      const picks = W.byChunk['1,0'].map(i => W.nodes[i]).filter(n => n.k === 'bush').slice(0, 3);
      picks.forEach(nd => { TT.goto(nd); MZ.player.updateAim(); let g = 0; while (W.nodeActive(nd.idx) && g++ < 10) MZ.hit(); });
      const rk = W.byChunk['1,0'].map(i => W.nodes[i]).find(n => n.k === 'rock'); W.take(rk.idx, 300);
      out.took = Object.keys(s.chunks['1,0'].taken).length;
      out.takenSame = JSON.stringify(s.chunks['1,0'].taken);
      out.live = picks.every(nd => !W.nodeActive(nd.idx));
      /* 区画の境をまたぐ家（"0,0" の右端 119 と "1,0" の左端 0）。保存は左上のマスがある区画 "0,0" に、区画の中の座標 (119,50) で入る */
      W.nodes.forEach(nd => { if (nd.gx >= 110 && nd.gx <= 135 && nd.gz >= 40 && nd.gz <= 75) W.take(nd.idx, -1); });
      all(9999);
      out.cross = MZ.place('house', 119, 50, 0);
      const hb = Tn.list().find(b => b.t === 'house');
      out.crossSave = hb && [Tn.ck[hb.id], hb.x, hb.z, Tn.gpos(hb).join(), s.chunks['0,0'].layers.ground.indexOf(hb) >= 0, s.chunks['1,0'].layers.ground.length];
      out.crossCells = [W.owner[MZ.ci(119, 50)], W.owner[MZ.ci(120, 50)], W.owner[MZ.ci(119, 51)], W.owner[MZ.ci(120, 51)]].every(v => v === hb.id);
      out.crossOut = MZ.place('house', 119, 119, 0);   // (119,119)〜(120,120)：右上の 1 マス "1,1" は持っていない
      /* 道が区画をまたぐ：小屋から東へ。向こうの家に人が来る */
      W.nodes.forEach(nd => { if (nd.gx >= 58 && nd.gx <= 140 && nd.gz >= 56 && nd.gz <= 76) W.take(nd.idx, -1); });
      let rd = 0; for (let g = 61; g <= 125; g++) if (MZ.place('road', g, 60, 0)) rd++;
      out.roadN = rd;
      const far = MZ.place('house', 125, 61, 0), fb = Tn.list().find(b => b.t === 'house' && b.x === 125);
      const wf = [MZ.place('well', 130, 66, 0), MZ.place('field', 130, 70, 0)];
      s.pop = 0; Tn.jobsDirty = true; Tn.resDirty = true; Tn.recalc(true);
      out.conn = [far && wf[0] && wf[1], Tn.info.unconnected, Tn.info.homeSum, Tn.info.roads];
      s.timers.migrate = 0; MZ.tick(13); s.timers.migrate = -1e6;
      out.pop = [s.pop, Tn.info.cap];   // cap は 向こうの家 2 人。つながっていない最初の家は数えない
      MZ.tick(2);
      out.res = Tn.residents.filter(r => Tn.byId[r.home] && Tn.byId[r.home].t === 'house').length;   // 家をよりどころにする住民（つながっていない最初の家と半分ずつ）
      /* 土地の外・当たり */
      s.player.x = 240; s.player.z = 100; out.cl = [W.collide(240, 125, 0.35)[1], W.collide(240, 300, 0.35)[1], W.collide(100, 300, 0.35)[1], W.collide(130, 130, 0.35).join(), W.solidAtPoint(240, 240), W.solidAtPoint(240, 100)];
      /* 杭の数：L 字を外側から 1 周する点の数（角は 1 本）を別の式で数える。区画ごと・辺ごとに 60 区間 → 61 本、共有する角は引く */
      const own = new Set(s.land), pts = new Set(); const CH = 240;
      s.land.forEach(k => { const [cx, cz] = k.split(',').map(Number); [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(d => { if (own.has((cx + d[0]) + ',' + (cz + d[1]))) return;
        for (let v = 0; v <= CH; v += 4) { const x = d[0] ? (cx + (d[0] > 0 ? 0.5 : -0.5)) * CH : cx * CH - CH / 2 + v, z = d[1] ? (cz + (d[1] > 0 ? 0.5 : -0.5)) * CH : cz * CH - CH / 2 + v; pts.add(x + ',' + z); } }); });
      out.fence = [G.ground.fenceCount, G.ground.fence.thinInstanceCount, pts.size];
      const rc = G.ground.rect; out.rect = [rc.x0, rc.x1, rc.z0, rc.z1];
      /* 地形：持っている所と rect の中（持っていない "1,1" も）は 0、rect の外 30m より先には高い所がある */
      let flatIn = true, hmax = 0, nIn = 0; for (let x = -118; x <= 358; x += 12) for (let z = -118; z <= 358; z += 12) { nIn++; if (G.ground.hOut(x, z) !== 0) flatIn = false; }
      for (let x = -500; x <= 740; x += 20) for (let z = -500; z <= 740; z += 20) { if (Math.max(-120 - x, x - 360, -120 - z, z - 360) >= 30) hmax = Math.max(hmax, G.ground.hOut(x, z)); }
      out.terr = [flatIn, nIn, hmax > 0, Math.round(hmax * 10) / 10];
      const hp = G.ground.hi.getVerticesData('position'); let mn = 1e9, mx = -1e9; for (let i = 0; i < hp.length; i += 3) { mn = Math.min(mn, hp[i]); mx = Math.max(mx, hp[i]); }
      out.hiX = [mn, mx];
      /* 草：持っていない "1,1"（x・z とも 120 より大きい）には 1 株もない。持っている "1,0" にはある */
      G.grass.dirty(); s.player.x = 200; s.player.z = 100; G.grass.layout(200, 100);
      const b = G.grass.state.buf, n = G.grass.count; let inGap = 0, inOwn = 0;
      for (let i = 0; i < n; i++) { const x = b[i * 16 + 12], z = b[i * 16 + 14]; if (x > 120 && z > 120 && x < 360) inGap++; if (x > 120 && z < 120 && x < 360) inOwn++; }
      out.grass = [n, inGap, inOwn];
      /* 地面の塗り分けの表：持っていない区画のマスは 0（新しい区画のマスの建物は無いので 0 のまま）、建物のある所は書かれている */
      out.mk = [G.ground.data.data[MZ.ci(119, 60) * 4], G.ground.data.data[MZ.ci(124, 60) * 4]];
      /* 保存（また出るまでの残り秒は時間でへるので、保存した時点の taken と比べる） */
      out.takenSame = JSON.stringify(s.chunks['1,0'].taken);
      MZ.noSave = false; MZ.saveNow(); MZ.noSave = true;
      const ld = MZ.loadSave(); out.saved = ld.status === 'ok' && JSON.stringify(ld.state.chunks['1,0'].taken) === out.takenSame && ld.state.land.join(' ') === out.land;
      out.save = localStorage.getItem('machizukuri-save');
      out.crossLoad = ld.state.chunks['0,0'].layers.ground.some(b => b.t === 'house' && b.x === 119 && b.z === 50);
      out.snap = JSON.stringify({ pop: s.pop, b: Tn.list().map(b => [b.id, b.t, Tn.gpos(b).join(), b.r]) });
      return out;
    });
    ok('L 字：東（1,0）と北（0,1）を広げられる', R.ex[0] && R.ex[1] && R.land === '0,0 1,0 0,1', R.land);
    ok('広げた区画で物を採る（くさむら 3・岩 1）：その区画の taken に入り、消える。保存 → 読み直しで同じ', R.took === 4 && R.live && R.saved, JSON.stringify([R.took, R.live, R.saved]));
    ok('区画の境をまたぐ家：置ける。保存は左上のマスがある区画 "0,0" に、区画の中の座標 (119,50) で入り、4 マスとも同じ建物。持っていない "1,1" にはみ出す家は置けない', R.cross && R.crossSave[0] === '0,0' && R.crossSave[1] === 119 && R.crossSave[2] === 50 && R.crossSave[3] === '119,50' && R.crossSave[4] && R.crossSave[5] === 0 && R.crossCells && R.crossLoad && R.crossOut === false, JSON.stringify([R.crossSave, R.crossCells, R.crossLoad, R.crossOut]));
    ok('道が区画をまたいでつながる（65 マス）。向こうの家（125,61）に面した道がつながって家 2 人ぶんになり、人口が 2 まで来て、家に住民がいる', R.roadN === 65 && R.conn[0] && R.conn[1] === 1 && R.conn[2] === 2 && R.pop[0] === 2 && R.res >= 2, JSON.stringify([R.roadN, R.conn, R.pop, R.res]));
    ok('L 字の当たり：持っていない "1,1" には入れない（東の区画の北端 z 119.5 にもどされる）。北の区画の中は動ける。"1,1" は通れない・東の区画の中は通れる', R.cl[0] === 119.5 && R.cl[1] === 300 && R.cl[2] === 300 && R.cl[4] === true && R.cl[5] === false, JSON.stringify(R.cl));
    ok('L 字の柵：杭の数が計算どおり（外側を 1 周した点の数。角は 1 本）で、thin instance の数と同じ', R.fence[0] === R.fence[2] && R.fence[1] === R.fence[2] && R.fence[2] > 240, JSON.stringify(R.fence));
    ok('L 字の rect：x −120〜360・z −120〜360。terrain の x の範囲が rect の外へ広がる', R.rect.join() === '-120,360,-120,360' && R.hiX[0] < -300 && R.hiX[1] > 540, JSON.stringify([R.rect, R.hiX]));
    ok('L 字の地形：rect の中（持っていない "1,1" も）は y = 0、rect の外 30m より先には y > 0 の所がある', R.terr[0] && R.terr[2], JSON.stringify(R.terr));
    ok('L 字の草：持っていない "1,1" に草が 1 株もなく、持っている "1,0" にはある', R.grass[0] > 0 && R.grass[1] === 0 && R.grass[2] > 0, JSON.stringify(R.grass));
    ok('地面の塗り分けの表：道（R=255）が持っている区画のマスに書かれる', R.mk[0] === 255 && R.mk[1] === 255, JSON.stringify(R.mk));
    /* 読み直し：別のページで保存を読む（つづきから） */
    {
      const b = await open2({});
      await b.c.addInitScript(sv => { try { if (!sessionStorage.getItem('mz-seeded')) { localStorage.setItem('machizukuri-save', sv); sessionStorage.setItem('mz-seeded', '1'); } } catch (e) { /* なし */ } }, R.save);
      await b.pg.goto(URL);
      await b.pg.waitForSelector('#tbtn .go:not([disabled])', { timeout: 60000 });
      const title = await b.pg.textContent('#tbtn');
      await b.pg.click('#tbtn .go');
      await b.pg.waitForFunction(() => window.MZ && MZ.started, null, { timeout: 120000 });
      await ev(b.pg, HELPERS);
      const L = await ev(b.pg, () => {
        const s = MZ.state, W = MZ.world, Tn = MZ.town, G = MZ.gfx;
        MZ.noSave = true;
        const hb = Tn.list().find(x => x.t === 'house' && x.x === 119);
        let h = 2166136261; const ns = W.nodes.filter(n => n.ck === '0,0'); const str = ns.map(n => [n.idx, n.k, n.x, n.z, n.s.toFixed(6), n.ry.toFixed(6), n.k === 'tree' ? n.g.vi : 0].join(',')).join(';'); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
        const tk = s.chunks['1,0'].taken, gone = Object.keys(tk).every(i => { const nd = W.nodes[W.byChunk['1,0'][+i]]; return !W.nodeActive(nd.idx); });
        return { land: s.land.join(' '), snap: JSON.stringify({ pop: s.pop, b: Tn.list().map(b => [b.id, b.t, Tn.gpos(b).join(), b.r]) }), taken: JSON.stringify(tk), gone, hash: (h >>> 0).toString(16) + ':' + ns.length, nodes: W.nodes.length, fence: G.ground.fenceCount, cells: hb && [W.owner[MZ.ci(119, 50)], W.owner[MZ.ci(120, 51)]].every(v => v === hb.id), meshes: Object.keys(Tn.meshes).length, count: Tn.list().length };
      });
      ok('読み直し（つづきから）：持っている区画・建物（またぐ家も同じ所）・採った物・配置のハッシュが同じ', title.includes('つづきから') && L.land === R.land && L.snap === R.snap && L.taken === R.takenSame && L.gone && L.hash === '79e4b006:444' && L.cells && L.meshes === L.count && L.fence === R.fence[0], JSON.stringify(L));
      ok('読み直しでエラー・警告が 0', b.list.length === 0, b.list.slice(0, 4).join(' | '));
      await b.c.close();
    }
    /* 画面：土地タブ・柵のきわのボタン・L キー・目標・タブの幅 */
    const UI = await ev(a.pg, () => {
      const s = MZ.state, U = MZ.ui, out = {};
      MZ.noSave = true; U.panel(false); MZ.cancelBuild();
      s.stage = 2; Object.keys(s.inv).forEach(k => { s.inv[k] = 0; });
      s.player.x = 0; s.player.z = 0; U.update(0.2); out.btnMid = document.querySelector('#landBtn').classList.contains('show');
      s.player.x = 355; s.player.z = 0; U.update(0.2); out.btnEdge = document.querySelector('#landBtn').classList.contains('show');
      s.stage = 1; U.update(0.2); out.btnLow = document.querySelector('#landBtn').classList.contains('show'); s.stage = 2;
      U.update(0.2);
      document.querySelector('#landBtn').click();
      out.open = U.open; out.tab = U.tab;
      out.cells = document.querySelectorAll('#pbody .lc').length;
      out.own = document.querySelectorAll('#pbody .lc.own').length; out.adj = document.querySelectorAll('#pbody .lc.adj').length; out.far = document.querySelectorAll('#pbody .lc.far').length;
      const sq = [...document.querySelectorAll('#pbody .lc')].map(e => { const r = e.getBoundingClientRect(); return Math.abs(r.width - r.height) < 1.5 && r.width > 40; });
      out.square = sq.every(v => v);
      const adjBtn = document.querySelector('#pbody .lc.adj'); adjBtn.click();
      out.detail = document.querySelector('#pbody .ld').textContent; out.exp = document.querySelector('#pbody [data-expand]') && document.querySelector('#pbody [data-expand]').disabled;
      out.here = document.querySelector('#pbody .lc.here') && document.querySelector('#pbody .lc.here').dataset.land;
      out.order = [...document.querySelectorAll('#pbody .lc')].map(e => e.dataset.land).join(' ');
      /* 広げる：材料を持たせて押す */
      Object.keys(s.inv).forEach(k => { s.inv[k] = 999; }); U.sig = ''; U.render();
      const key = document.querySelector('#pbody .lc.adj').dataset.land; document.querySelector('#pbody .lc.adj').click();
      document.querySelector('#pbody [data-expand]').click();
      out.expanded = [s.land.length, s.land.indexOf(key) >= 0];
      U.panel(false);
      /* 目標 */
      const keepLand = s.land; s.land = ['0,0']; out.goal1 = MZ.GOALS.find(g => /土地を広げよう/.test(g.text())).done();
      s.land = ['0,0', '1,0']; out.goal2 = MZ.GOALS.find(g => /土地を広げよう/.test(g.text())).done();
      const gi = MZ.GOALS.map(g => g.text()), li = gi.findIndex(t => /土地を広げよう/.test(t)); out.goalPos = [/倉庫/.test(gi[li - 1]), /人口 200/.test(gi[li + 1])]; out.goalText = gi[li]; s.land = keepLand;
      return out;
    });
    ok('柵のきわ（土地の端から 6m 以内）で「土地」ボタンが出る。土地の真ん中・段階が村より前では出ない。押すとパネルの土地タブが開く', UI.btnEdge && !UI.btnMid && !UI.btnLow && UI.open && UI.tab === 'land', JSON.stringify([UI.btnMid, UI.btnEdge, UI.btnLow, UI.open, UI.tab]));
    ok('土地タブ：3×3 の正方形のボタン 9 つ（持っている 3・広げられる・となりを先に）。「いまここ」の印。広げられるマスを押すと材料の表と、材料がなければ押せない「広げる」', UI.cells === 9 && UI.own === 3 && UI.adj >= 2 && UI.own + UI.adj + UI.far === 9 && UI.square && UI.exp === true && /板/.test(UI.detail) && !!UI.here, JSON.stringify(UI));
    ok('土地タブ：上が北（先頭の行は z = 1：-1,1 0,1 1,1）。材料があれば「広げる」で広げられる', UI.order.indexOf('-1,1 0,1 1,1') === 0 && UI.expanded[0] === 4 && UI.expanded[1], JSON.stringify([UI.order, UI.expanded]));
    ok('目標：「土地を広げよう」は倉庫の行と「人口 200 で町」のあいだ。2 区画で済み', UI.goalPos[0] && UI.goalPos[1] && UI.goal1 === false && UI.goal2 === true && /「土地」タブ/.test(UI.goalText), JSON.stringify([UI.goalPos, UI.goal1, UI.goal2, UI.goalText]));
    await a.pg.keyboard.press('Escape');
    await a.pg.keyboard.press('KeyL');
    const lk = await ev(a.pg, () => [MZ.ui.open, MZ.ui.tab]);
    ok('PC の L キーで土地タブが開く', lk[0] === true && lk[1] === 'land', JSON.stringify(lk));
    ok('区切り 3（その 2）でエラー・警告が 0（L 字・保存・画面）', a.list.length === 0, a.list.slice(0, 4).join(' | '));
    await a.c.close();
  }
  }

  if (want(2)) {
  cur = 2;
  /* 配置が変わっていない（β0.1.0 の採れる物の位置のハッシュと同じ。ここまでで「さいしょから」を押して題名の画面に戻っているので、新しく始める） */
  {
    const a = await open2({});
    await begin2(a.pg);
    const hsh = await ev(a.pg, () => {
      let h = 2166136261;
      const str = MZ.world.nodes.map(n => [n.idx, n.k, n.x, n.z, n.s.toFixed(6), n.ry.toFixed(6), n.k === 'tree' ? n.g.vi : 0].join(',')).join(';');
      for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
      return (h >>> 0).toString(16) + ':' + MZ.world.nodes.length;
    });
    ok('配置が変わっていない（採れる物 444 個の位置のハッシュが β0.1.0 と同じ）', hsh === '79e4b006:444', hsh);
    await a.c.close();
  }

  /* 読み込みの表示：8 秒以内に「はじめる」が押せる（資産が遅くても 8 秒で押せる） */
  {
    const a = await open2({});
    const t0 = Date.now();
    await a.pg.goto(URL, { waitUntil: 'domcontentloaded' });
    const prepTxt = await a.pg.textContent('#prepTxt');
    await a.pg.waitForSelector('#tbtn .go:not([disabled])', { timeout: 9000 });
    const dt = Date.now() - t0;
    ok('読み込みの表示：「準備中 n／m」が出て、8 秒以内に「はじめる」が押せる', /準備中 \d+／\d+/.test(prepTxt) && dt < 8000, prepTxt + ' / ' + dt + 'ms');
    await a.c.close();
    const b = await open2({ route: c => c.route('**/assets/**', async r => { await sleep(14000); try { await r.continue(); } catch (e) { /* 閉じた */ } }) });
    const t1 = Date.now();
    await b.pg.goto(URL, { waitUntil: 'domcontentloaded' });
    const dis = await ev(b.pg, () => document.querySelector('#tbtn .go').disabled);
    await b.pg.waitForSelector('#tbtn .go:not([disabled])', { timeout: 12000 });
    const d2 = Date.now() - t1;
    ok('資産がとても遅くても、8 秒たてば「はじめる」が押せる（それまでは押せない）', dis && d2 >= 7000 && d2 < 11500, dis + ' / ' + d2 + 'ms');
    await b.c.close();
  }

  /* 読み込みの待ち行列：同時 5 本まで・順序（必須→木・岩→建物→人→道具）・失敗の読み直し・画質を変えたときの取り直し */
  {
    const reqs = [], cnt = {};
    const a = await open2({
      pref: 'mid',
      route: async c => {
        await c.route('**/assets/**', async r => {
          const u = r.request().url(), n = u.replace(/^.*\/assets\//, '');
          reqs.push(n);
          cnt[n] = (cnt[n] || 0) + 1;
          if (/b_well\.glb$/.test(u) && cnt[n] === 1) return r.abort();   // 1 回目だけ失敗（自動の読み直しで届く）
          if (/b_hut_far\.glb$/.test(u) && cnt[n] <= 3) return r.abort();   // 3 回とも失敗（画質を変えると取り直す）
          try { await r.continue(); } catch (e) { /* 閉じた */ }
        });
      }
    });
    await begin2(a.pg);
    await a.pg.waitForFunction(() => { const A = MZ.gfx.assets; return A.done >= A.total; }, null, { timeout: 240000 });
    const st = await ev(a.pg, () => ({ max: MZ.gfx.assets.queue.max, failed: MZ.gfx.assets.failed.slice(), ok: MZ.gfx.assets.okMap['assets/models/b_well.glb'], reqDone: MZ.gfx.assets.reqDone, reqTotal: MZ.gfx.assets.reqTotal }));
    ok('読み込み：同時に取りに行くのは 5 本まで', st.max >= 1 && st.max <= 5, JSON.stringify(st));
    ok('読み込み：1 回失敗しても自動で読み直して届く（井戸）', st.ok === true && st.failed.indexOf('assets/models/b_well.glb') < 0 && cnt['models/b_well.glb'] >= 2, JSON.stringify(st) + ' ' + cnt['models/b_well.glb']);
    ok('読み込み：3 回失敗したファイルは failed に残る（小屋の遠く用）', st.failed.indexOf('assets/models/b_hut_far.glb') >= 0, JSON.stringify(st.failed));
    ok('読み込み：必須の数だけが「準備中 n／m」に出る（必須は 7 本ほど。全体より少ない）', st.reqTotal > 0 && st.reqTotal <= 8 && st.reqDone === st.reqTotal, JSON.stringify(st));
    const idx = pat => reqs.findIndex(n => pat.test(n));
    const last = pat => { let k = -1; reqs.forEach((n, i) => { if (pat.test(n)) k = i; }); return k; };
    ok('読み込みの順：必須（空・地面）→ 木・岩 → 建物 → 人 → 道具', last(/tex\/(sky|ground_col|path_col|farm_col)/) < idx(/models\/b_house\.glb/) && idx(/models\/rock_a/) < idx(/models\/b_house\.glb/) && idx(/models\/b_house\.glb/) < idx(/models\/b_tool_axe1/) && idx(/models\/b_player\.glb/) < idx(/models\/b_tool_pick3/), JSON.stringify(reqs.slice(0, 14)));
    /* 画質を変えると、読めなかったファイルを取り直す */
    await ev(a.pg, () => MZ.gfx.setQuality('high'));
    await a.pg.waitForFunction(() => { const A = MZ.gfx.assets; return A.done >= A.total; }, null, { timeout: 240000 });
    await a.pg.waitForFunction(() => { const g = MZ.gfx.looks.state.glb.hut; return g && g.far; }, null, { timeout: 120000 }).catch(() => { });
    const st2 = await ev(a.pg, () => ({ failed: MZ.gfx.assets.failed.slice(), far: !!(MZ.gfx.looks.state.glb.hut && MZ.gfx.looks.state.glb.hut.far) }));
    ok('画質を変えると、読めなかったファイルを取り直す（小屋の遠く用が届く）', st2.failed.indexOf('assets/models/b_hut_far.glb') < 0 && st2.far, JSON.stringify(st2) + ' ' + cnt['models/b_hut_far.glb']);
    /* 建物：高→低→高 のあと、全部描かれる（遠く用の付け直しも） */
    const bl = await ev(a.pg, async () => {
      MZ.noSave = true; Object.keys(MZ.state.inv).forEach(k => { MZ.state.inv[k] = 99; });
      MZ.world.nodes.forEach(nd => { if (nd.gx >= 40 && nd.gx <= 80 && nd.gz >= 40 && nd.gz <= 80) MZ.world.take(nd.idx, -1); });
      ['house', 'well', 'kiln', 'bench'].forEach((k, i) => MZ.place(k, 52 + i * 3, 60, 0));
      MZ.gfx.setQuality('low'); await new Promise(r => setTimeout(r, 1500));
      MZ.gfx.setQuality('high'); return true;
    });
    await a.pg.waitForFunction(() => { const A = MZ.gfx.assets; return A.done >= A.total; }, null, { timeout: 240000 });
    /* 固定の待ちではなく条件を待つ（GLB の読み直し・LOD の付け直しは遅い環境で数十秒かかる）。付かないままなら 120 秒で諦めて、下の確認で落ちる */
    const tw0 = Date.now();
    await a.pg.waitForFunction(() => { const bs = Object.values(MZ.town.meshes); return bs.length >= 4 && bs.every(o => o.inst[0] && !o.inst[0].isDisposed() && o.inst[0].sourceMesh !== MZ.getModel(o.key)); }, null, { timeout: 120000, polling: 500 }).catch(() => { });
    const twait = Date.now() - tw0;   // LOD が全部付くまでの待ち（ms）
    const bd = await ev(a.pg, () => {
      const G = MZ.gfx, p = MZ.state.player, bs = Object.values(MZ.town.meshes), out = bs.map(o => {
        const m = o.inst[0];
        /* 70m はなれて係を回す：最遠のあるもの（作業台・木の家）は最遠で、ほかは遠く用のまま */
        return { k: o.key, n: o.inst.length, disposed: o.inst.some(i => i.isDisposed()), farCode: m && !m.isDisposed() ? m.sourceMesh === MZ.getModel(o.key) : null };
      });
      p.x = 0; p.z = -70; G.looks.nearTick(1, true);
      bs.forEach((o, i) => { out[i].mode = o.mode; out[i].xf = o.xf.length; out[i].xfOn = o.xf.length > 0 && o.xf[0].isEnabled(); out[i].baseOn = o.inst[0].isEnabled(); });
      return { out, tris: G.tris() };
    });
    ok('高→低→高のあと、建物が全部描かれる（遠く用も GLB で付け直されている。70m 先では最遠（小屋・木の家・作業台だけ別ファイル）に切りかわる）', bd.out.length >= 4 && bd.out.every(o => o.n >= 1 && !o.disposed && o.farCode === false && (({ hut: 1, house: 1, bench: 1 }[o.k]) ? (o.mode === 'xfar' && o.xf >= 1 && o.xfOn && !o.baseOn) : (o.mode === 'far' && o.baseOn))), '読み直しが終わるまで ' + twait + 'ms ' + JSON.stringify(bd));
    await a.c.close();
  }

  /* 資産が読めないとき・loaders が読めないとき：低でも中でも同じに遊べる */
  for (const cfg of [
    { name: '資産が読めない', route: c => c.route('**/assets/**', r => r.abort()) },
    { name: 'loaders が読めない', route: c => c.route('**/babylonjs.loaders.min.js', r => r.abort()), pref: 'mid' }
  ]) {
    const a = await open2({ route: cfg.route, pref: cfg.pref });
    await begin2(a.pg);
    await settle(a.pg, 3);
    await ev(a.pg, () => { MZ.noSave = false; TT.gather('grass', 3); TT.gather('log', 4); TT.gather('stone', 6); });
    const built = await ev(a.pg, () => { const r = TT.build('road', 56, 56, 0); MZ.saveNow(); return r; });
    const saved = await ev(a.pg, () => { const d = JSON.parse(localStorage.getItem('machizukuri-save')); return d.data.chunks['0,0'].layers.ground.some(b => b.t === 'road'); });
    if (cfg.pref) { await ev(a.pg, () => MZ.gfx.setQuality('high')); await settle(a.pg, 2); await ev(a.pg, () => MZ.gfx.setQuality('mid')); await settle(a.pg, 2); }
    ok(cfg.name + '：はじめる→採集→建てる→保存が通る', built && saved, built + ' ' + saved);
    const q = await ev(a.pg, () => MZ.gfx.assets.failed.length);
    ok(cfg.name + '：エラーは「Failed to load resource」のほかに 0', a.list.filter(BAD_RES).length === 0, a.list.filter(BAD_RES).slice(0, 4).join(' | '));
    if (cfg.pref) ok(cfg.name + '：木・岩はコードの形のまま', (await ev(a.pg, () => Object.keys(MZ.gfx.nodes.stats()).every(k => k.startsWith('code:') || k === 'stones' || k === 'pebble' || k === 'clayhd'))), JSON.stringify(await ev(a.pg, () => MZ.gfx.nodes.stats())));
    await a.c.close();
  }

  /* 共通の写真（btex）：中で読み、低では取りに行かない。wood_col_1024 が読めないとき、それを使う 4 つ（小屋・木の家・きこり小屋・井戸）だけコードの形になる */
  {
    const reqs = [];
    const a = await open2({ pref: 'mid', route: c => c.route('**/assets/models/tex/**', async r => { reqs.push(r.request().url().replace(/^.*\/tex\//, '')); try { await r.continue(); } catch (e) { /* 閉じた */ } }) });
    await begin2(a.pg);
    await loaded(a.pg);
    const q = await ev(a.pg, () => ({ n: MZ.gfx.assets.groupFiles(MZ.gfx.MANIFEST.find(g => g.id === 'btex'), 'mid').length, hi: MZ.gfx.assets.groupFiles(MZ.gfx.MANIFEST.find(g => g.id === 'btex'), 'high').length, prio: MZ.gfx.assets.prioOf(MZ.gfx.MANIFEST.find(g => g.id === 'btex')), ok: MZ.gfx.assets.groupOk('btex', 'mid') }));
    ok('btex：待ち行列に入り（51 枚）、中で読めて、順は建物の遠く用の後・建物の前（2.6）', q.n === 51 && q.hi === 51 && q.ok && q.prio === 2.6 && reqs.length >= 40, JSON.stringify(q) + ' 取りに行った ' + reqs.length);
    ok('btex：中は法線を 512 で読む（brick_nrm_512 を取り、brick_nrm_1024 は取らない）', reqs.includes('m_brick_nrm_512.jpg') && !reqs.includes('m_brick_nrm_1024.jpg') && !reqs.some(n => /_nrm_1024/.test(n)), reqs.filter(n => /nrm/.test(n)).join(','));
    await a.c.close();
    const lreq = [];
    const b = await open2({ route: c => c.route('**/assets/models/tex/**', async r => { lreq.push(r.request().url()); try { await r.continue(); } catch (e) { /* 閉じた */ } }) });
    await begin2(b.pg); await loaded(b.pg); await settle(b.pg, 2);
    ok('btex：低では取りに行かない', lreq.length === 0, lreq.length);
    await b.c.close();
    const c2 = await open2({ pref: 'mid', route: c => c.route('**/assets/models/tex/m_wood_col_1024.jpg', r => r.abort()) });
    await begin2(c2.pg); await loaded(c2.pg);
    await c2.pg.waitForFunction(() => { const g = MZ.gfx.looks.state.glb; return ['fire', 'kiln', 'furnace', 'field', 'bhouse', 'bench', 'bigfield', 'claypit', 'quarry'].every(k => g[k] && g[k].near); }, null, { timeout: 180000 }).catch(() => { });
    await settle(c2.pg, 3);
    const w = await ev(c2.pg, () => { const g = MZ.gfx.looks.state.glb, r = {}; Object.keys(g).forEach(k => { r[k] = !!g[k].near; }); return r; });
    const codeSet = ['hut', 'house', 'lumber', 'well', 'workshop', 'shop', 'storehouse'], glbSet = ['fire', 'kiln', 'furnace', 'field', 'bhouse', 'bigfield', 'claypit', 'quarry'];
    ok('btex：m_wood_col_1024 が読めないと、小屋・木の家・きこり小屋・井戸・工房・商店・倉庫だけ近く用がコードの形（ほかは GLB のまま）', codeSet.every(k => w[k] === false) && glbSet.every(k => w[k] === true), JSON.stringify(w));
    ok('btex：読めないときもページのエラーは 0（Failed to load resource のぞく）', c2.list.filter(BAD_RES).length === 0, c2.list.filter(BAD_RES).slice(0, 3).join(' | '));
    await c2.c.close();
  }

  }
  if (want(3)) {
  cur = 3;
  /* 画質の切りかえ：高→中→低→高 で pageerror・error が 0。保存キーが変わる。持ち物・建物・人口が変わらない */
  {
    const a = await open2({});
    await begin2(a.pg);
    await ev(a.pg, () => { MZ.noSave = true; Object.keys(MZ.state.inv).forEach(k => { MZ.state.inv[k] = 99; }); TT.build('road', 56, 56, 0); TT.build('house', 52, 56, 0); });
    const s0 = await snap(a.pg), keys = [];
    const seq = [['high', true, true], ['mid', true, true], ['low', false, false], ['high', true, true]], info = [];
    for (const [q, pipe, shadow] of seq) {
      await ev(a.pg, q => MZ.gfx.setQuality(q), q);
      await loaded(a.pg); await settle(a.pg, 3);
      keys.push(await ev(a.pg, () => localStorage.getItem('machizukuri-gfx')));
      info.push(await ev(a.pg, () => ({ key: MZ.gfx.key, pipe: !!MZ.gfx.post.state.pipe || !!MZ.gfx.post.state.ip, full: !!MZ.gfx.post.state.pipe, shadow: !!MZ.gfx.post.state.shadow })));
      const i = info[info.length - 1];
      ok('画質を「' + q + '」に切りかえられる（影・後処理が画質どおり）', i.key === q && i.full === pipe && i.shadow === shadow, JSON.stringify(i));
    }
    ok('画質の切りかえ：高→中→低→高で pageerror・error が 0', a.list.filter(e => !/^warning/.test(e)).length === 0, a.list.slice(0, 4).join(' | '));
    ok('画質の切りかえ：console の警告も 0', a.list.length === 0, a.list.slice(0, 4).join(' | '));
    ok('画質の切りかえ：保存キーが変わる', keys.join(',') === 'high,mid,low,high', keys.join(','));
    ok('画質の切りかえ：持ち物・建物・人口が変わらない', (await snap(a.pg)) === s0);
    /* 木の LOD の境目でちらつかない（同じ場所で並べ直しても、1.5m 動いても、中身が同じ） */
    const lodSame = await ev(a.pg, () => {
      const G = MZ.gfx, s = MZ.state.player; s.x = 0; s.z = -30; G.nodes.flush();
      const a1 = JSON.stringify(G.nodes.stats()); G.nodes.flush(); const a2 = JSON.stringify(G.nodes.stats());
      s.z += 1.5; G.nodes.update(1, s.x, s.z); const a3 = JSON.stringify(G.nodes.stats());
      return [a1 === a2, a2 === a3, G.nodes.stats()];
    });
    ok('木の LOD：同じ場所で並べ直しても、少し動いても入れ替わらない（ちらつかない）', lodSame[0] && lodSame[1], JSON.stringify(lodSame[2]));
    await a.c.close();
  }

  /* 画質のボタン（上のバーとパネルの下）と、自動で 1 段下げる処理 */
  {
    const a = await open2({ pref: 'mid' });
    await begin2(a.pg);
    const t0 = await a.pg.textContent('#bQual');
    await a.pg.click('#bQual');
    const t1 = await a.pg.textContent('#bQual'), k1 = await ev(a.pg, () => [MZ.gfx.key, localStorage.getItem('machizukuri-gfx')]);
    await a.pg.click('#bBag'); await a.pg.waitForSelector('#pQual', { state: 'visible' });
    const t2 = await a.pg.textContent('#pQual');
    await a.pg.click('#pQual');
    const t3 = await a.pg.textContent('#pQual', { timeout: 240000 }), t4 = await a.pg.textContent('#bQual', { timeout: 240000 });   // 高の 1 フレームは数十秒かかる
    ok('画質のボタン：押すたびに 高→中→低→自動（上のバーとパネルの下が同じ表示）', t0 === '画質：中' && t1 === '画質：低' && t2 === '画質：低' && /^画質：自動（[高中低]）$/.test(t3) && /^画質：自動（[高中低]）$/.test(t4) &&   /* 自動のとき、数秒のあいだに 1 段下がることがある（遅い環境） */ k1[0] === 'low' && k1[1] === 'low', [t0, t1, t2, t3, t4, k1].join(' / '));
    await ev(a.pg, () => MZ.gfx.setQuality('low'));
    await a.c.close();
    const b = await open2({ pref: 'auto' });
    await begin2(b.pg);
    const k0 = await ev(b.pg, () => MZ.gfx.key);
    await b.pg.waitForFunction(() => MZ.gfx.downgraded, null, { timeout: 240000 });
    const k2 = await ev(b.pg, () => [MZ.gfx.key, MZ.gfx.pref, localStorage.getItem('machizukuri-gfx')]);
    const notes = await ev(b.pg, () => TT.notes());
    ok('自動：遊びはじめて 10 秒の平均が 20fps 未満なら 1 段下げて、1 回だけお知らせ', (k0 === 'high' || k0 === 'mid') && k2[0] === 'mid' && k2[1] === 'auto' && k2[2] === 'auto' && (await ev(b.pg, () => MZ.gfx.autoKey)) === 'mid', [k0, k2, notes].join(' / '));   // 1 回だけのお知らせは autoWatch の done で守っている（お知らせは数秒で消えるので文面は見ない）
    ok('自動の切りかえでエラー・警告が 0', b.list.length === 0, b.list.slice(0, 3).join(' | '));
    await b.c.close();
  }

  /* 画質を低に下げると、近く用を片づける：一人称の手の道具は白くならず、コードの形にもどり、中にもどすと GLB が作り直される。
     採れる物の GLB も片づけて、もどすとまた出る */
  {
    const a = await open2({ pref: 'mid' });
    await begin2(a.pg);
    await ev(a.pg, () => { MZ.noSave = true; });
    await loaded(a.pg);
    await a.pg.waitForFunction(() => { const L = MZ.gfx.looks.state; return L.tool.axe2 && L.tool.axe1 && MZ.gfx.nodes.state.ready.trees && MZ.gfx.nodes.state.ready.rocks; }, null, { timeout: 180000 });
    const hand = () => ev(a.pg, () => {
      const s = MZ.state.player; s.view = 1; MZ.state.tools.axe = 2; MZ.player.lastTool = 'axe';
      MZ.player.updateCamera(0.016); MZ.player.updateCamera(0.016);
      const H = MZ.player.hands.axe, g = H.glb[2];
      return { code: H.code.isEnabled(), glb: H.glb[2] ? 1 : 0, mat: g ? g.every(c => !c.isDisposed() && !!c.material) : null, on: g ? g.every(c => c.isEnabled()) : null };
    });
    const h1 = await hand();
    ok('中：一人称の手に斧の GLB（材質あり）が出る', !h1.code && h1.glb === 1 && h1.mat && h1.on, JSON.stringify(h1));
    const f1 = await ev(a.pg, () => Object.keys(MZ.gfx.nodes.state.forms).filter(k => /^tree_|^rock_/.test(k)).length);
    await ev(a.pg, () => MZ.gfx.setQuality('low')); await settle(a.pg, 2);
    const h2 = await hand();
    ok('低に下げる：一人称の手はコードの形にもどる（GLB の複製は空・白い道具にならない）', h2.code && h2.glb === 0, JSON.stringify(h2));
    const lw = await ev(a.pg, () => ({ forms: Object.keys(MZ.gfx.nodes.state.forms).filter(k => /^tree_|^rock_|^bush$|^stump$/.test(k)).length, ready: !!MZ.gfx.nodes.state.ready.trees, tools: Object.keys(MZ.gfx.looks.state.tool).length, near: Object.values(MZ.gfx.looks.state.glb).filter(g => g.near).length }));
    ok('低に下げる：木・岩・低木の GLB・建物・道具の近く用を片づける', f1 > 0 && lw.forms === 0 && !lw.ready && lw.tools === 0 && lw.near === 0, JSON.stringify([f1, lw]));
    await ev(a.pg, () => MZ.gfx.setQuality('mid')); await loaded(a.pg);
    await a.pg.waitForFunction(() => { const L = MZ.gfx.looks.state; return L.tool.axe2 && MZ.gfx.nodes.state.ready.trees; }, null, { timeout: 180000 });
    await settle(a.pg, 3);
    const h3 = await hand();
    const f3 = await ev(a.pg, () => Object.keys(MZ.gfx.nodes.state.forms).filter(k => /^tree_|^rock_/.test(k)).length);
    ok('中にもどす：手の斧の GLB が作り直され（材質あり）、木・岩の GLB もまた出る', !h3.code && h3.glb === 1 && h3.mat && h3.on && f3 > 0, JSON.stringify([h3, f3]));
    ok('低→中の場面でエラー・警告が 0（失敗した読み込みのぞく）', a.list.filter(BAD_RES).length === 0, a.list.filter(BAD_RES).slice(0, 4).join(' | '));
    await a.c.close();
  }

  /* 低に下げると、待ち行列の中の高・中だけの GLB は取りに行かない（取り消す。failed に入れず、total も引く） */
  {
    const a = await open2({
      pref: 'high',
      route: c => c.route('**/assets/models/**', async r => { await sleep(1200); try { await r.continue(); } catch (e) { /* 閉じた */ } })
    });
    await a.pg.goto(URL);
    await a.pg.click('#tbtn .go', { timeout: 60000 });
    await a.pg.waitForFunction(() => window.MZ && MZ.started, null, { timeout: 120000 });
    const t0 = await ev(a.pg, () => ({ total: MZ.gfx.assets.total, waiting: MZ.gfx.assets.queue.waiting }));
    await ev(a.pg, () => MZ.gfx.setQuality('low'));
    await a.pg.waitForFunction(() => { const A = MZ.gfx.assets; return A.done >= A.total; }, null, { timeout: 180000 });
    const t1 = await ev(a.pg, () => ({ total: MZ.gfx.assets.total, done: MZ.gfx.assets.done, failed: MZ.gfx.assets.failed.length, waiting: MZ.gfx.assets.queue.waiting, never: ['b_tool_pick3', 'b_player', 'tree_spruce'].filter(n => !(('assets/models/' + n + '.glb') in MZ.gfx.assets.okMap)) }));
    ok('低に下げる：待ち行列の高・中だけの GLB は取りに行かない（total が減り、failed は 0）', t0.waiting > 0 && t1.total < t0.total && t1.failed === 0 && t1.never.length >= 1 && t1.waiting === 0, JSON.stringify([t0, t1]));
    await a.c.close();
  }

  /* 画質を中 → 高 → 中：取りに行く法線が切りかわる（中は _nrm_512、高は _nrm_1024）。高 → 中は読み直さない */
  {
    const reqs = [];
    const a = await open2({ pref: 'mid', route: c => c.route('**/assets/models/tex/**', async r => { reqs.push(r.request().url().replace(/^.*\/tex\//, '')); try { await r.continue(); } catch (e) { /* 閉じた */ } }) });
    await begin2(a.pg); await loaded(a.pg);
    await a.pg.waitForFunction(() => { const L = MZ.gfx.looks.state; return L.glb.kiln && L.glb.kiln.near && L.tool.axe2; }, null, { timeout: 180000 });
    const n0 = reqs.length, mid1 = reqs.some(n => /^m_brick_nrm_512/.test(n)), hi0 = reqs.some(n => /_nrm_1024/.test(n));
    const m0 = await ev(a.pg, () => MZ.gfx.looks.state.glb.kiln.near[0].uniqueId);
    await ev(a.pg, () => MZ.gfx.setQuality('high')); await loaded(a.pg);
    await a.pg.waitForFunction(id => { const g = MZ.gfx.looks.state.glb.kiln; return g.near && g.near[0].uniqueId !== id && !g.near[0].isDisposed(); }, m0, { timeout: 240000 });
    await settle(a.pg, 2);
    const hi1 = reqs.some(n => /^m_brick_nrm_1024/.test(n)), n1 = reqs.length;
    const st = await ev(a.pg, () => ({ near: Object.values(MZ.gfx.looks.state.glb).filter(g => g.near).length, tools: Object.keys(MZ.gfx.looks.state.tool).length }));
    ok('中 → 高：法線が 1024 に切りかわり（中は 512 だけ）、建物・道具の近く用が読み直される', mid1 && !hi0 && hi1 && st.near >= 9 && st.tools === 6, JSON.stringify([mid1, hi0, hi1, st]));
    await ev(a.pg, () => MZ.gfx.setQuality('mid')); await loaded(a.pg); await settle(a.pg, 2);
    const st2 = await ev(a.pg, () => ({ near: Object.values(MZ.gfx.looks.state.glb).filter(g => g.near).length }));
    ok('高 → 中：そのまま（読み直さない・建物は GLB のまま）', reqs.length === n1 && st2.near >= 9, reqs.length + ' ' + n1 + ' ' + JSON.stringify(st2));
    ok('中 → 高 → 中でエラー・警告が 0', a.list.length === 0, a.list.slice(0, 4).join(' | '));
    await a.c.close();
  }

  }
  if (want(4)) {
  cur = 4;
  /* 石畳の明るさ：土の道のマスに比べて 0.95〜1.15 倍（高・中・低で同じ構図を撮り、石畳のマスと土の道のマスの画素の平均の明るさ）。縁（0.12m）の暗さは見える */
  {
    const ratios = {};
    for (const q of ['low', 'mid', 'high']) {
      const a = await open2({ pref: q, viewport: { width: 1200, height: 750 } });
      await begin2(a.pg); await loaded(a.pg);
      await ev(a.pg, () => {
        MZ.noSave = true; MZ.timeFix = 5; const s = MZ.state; s.stage = 2; Object.keys(s.inv).forEach(k => { s.inv[k] = 9999; });
        MZ.world.nodes.forEach(nd => { if (nd.gx >= 55 && nd.gx <= 75 && nd.gz >= 40 && nd.gz <= 62) MZ.world.take(nd.idx, -1); });
        for (let g = 42; g <= 56; g++) { MZ.place('stoneroad', 64, g, 0); MZ.place('road', 66, g, 0); }
        s.player.x = 11; s.player.z = -22; s.player.yaw = 0; s.player.pitch = 0.6; s.player.view = 1;
        MZ.gfx.nodes.flush(); MZ.gfx.grass.layout(11, -22);
      });
      await frames(a.pg, q === 'high' ? 3 : 5);
      const buf = await a.pg.screenshot({ path: OUT + 'cobble-' + q + '.png', timeout: 600000 });
      const m = await ev(a.pg, async b64 => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
        const sc = MZ.world.scene, cam = MZ.world.camera, tm = sc.getTransformMatrix(), vp = cam.viewport.toGlobal(img.width, img.height);
        const proj = (x, z) => { const v = BABYLON.Vector3.Project(new BABYLON.Vector3(x, 0, z), BABYLON.Matrix.Identity(), tm, vp); return [v.x, v.y]; };
        const meas = cx => { let sum = 0, n = 0; for (let gz = 44; gz <= 54; gz++) for (const dx of [-0.8, -0.4, 0, 0.4, 0.8]) for (const dz of [-0.8, 0, 0.8]) {
          const p = proj(cx + dx, (gz - 60) * 2 + 1 + dz), x = Math.round(p[0]), y = Math.round(p[1]); if (x < 2 || y < 2 || x > img.width - 3 || y > img.height - 3) continue;
          const d = g.getImageData(x - 1, y - 1, 3, 3).data; for (let i = 0; i < 36; i += 4) { sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n++; } } return [sum / n, n]; };
        /* 縁：石畳の帯の端（0.06m 内）と、少し内側（0.35m 内）の明るさの平均 */
        const at = (x, z) => { const p = proj(x, z), d = g.getImageData(Math.round(p[0]) - 1, Math.round(p[1]), 3, 1).data; let v = 0; for (let i = 0; i < 12; i += 4) v += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; return v / 3; };
        const edge = (() => { let e = 0, m2 = 0, n = 0; for (let gz = 44; gz <= 54; gz++) for (const dz of [-0.6, 0, 0.6]) { const z = (gz - 60) * 2 + 1 + dz; e += at(8.05, z) + at(9.95, z); m2 += at(8.45, z) + at(9.55, z); n += 2; } return [e / n, m2 / n]; })();
        return { stone: meas(9), dirt: meas(13), edge };
      }, buf.toString('base64'));
      ratios[q] = m.stone[0] / m.dirt[0];
      ok('石畳の明るさ（' + q + '）：土の道のマスの 0.95〜1.15 倍（' + ratios[q].toFixed(3) + '）。縁は少し内側より暗い（縁 ' + Math.round(m.edge[0]) + '／内 ' + Math.round(m.edge[1]) + '）', ratios[q] >= 0.95 && ratios[q] <= 1.15 && m.stone[1] > 300 && m.edge[0] < m.edge[1] * 0.985, JSON.stringify(m));
      ok('石畳の明るさ（' + q + '）でエラー・警告が 0', a.list.length === 0, a.list.slice(0, 3).join(' | '));
      await a.c.close();
    }
  }
  /* 三角形の上限：小屋のまわりに建物 20 軒と住民 60 人 → 高 170 万・中 90 万・低 30 万以下。道・畑のマスに草が無い。地面は平ら */
  {
    const a = await open2({});
    await begin2(a.pg);
    const res = await ev(a.pg, () => {
      MZ.noSave = true;
      MZ.world.nodes.forEach(nd => { if (nd.gx >= 38 && nd.gx <= 60 && nd.gz >= 36 && nd.gz <= 58) MZ.world.take(nd.idx, -1); });
      Object.keys(MZ.state.inv).forEach(k => { MZ.state.inv[k] = 9999; });   // 試験用：材料を持たせる
      let n = 0;
      for (let j = 0; j < 5 && n < 20; j++) for (let i = 0; i < 6 && n < 20; i++) if (MZ.place('house', 40 + i * 3, 38 + j * 3, 0)) n++;
      for (let g = 38; g <= 58; g++) MZ.place('road', 58, g, 0);
      MZ.place('field', 50, 54, 0); MZ.place('fire', 56, 57, 0); MZ.place('well', 56, 59, 0);
      MZ.state.timers.migrate = 0; MZ.state.pop = 60; MZ.town.resDirty = true; MZ.tick(1); MZ.town.render(1);
      const s = MZ.state.player; s.x = -4; s.z = -12; s.yaw = 0.4; s.pitch = 0;
      return { houses: n, people: MZ.town.pgroups.reduce((a, g) => a + g.n, 0) };
    });
    ok('三角形の試験の場面：建物 20 軒・住民 60 人', res.houses === 20 && res.people === 60, JSON.stringify(res));
    const lim = { low: 300000, mid: 900000, high: 1700000 }, tr = {}, grs = {};
    for (const q of ['low', 'mid', 'high']) {
      await ev(a.pg, q => MZ.gfx.setQuality(q), q);
      await loaded(a.pg); await settle(a.pg, 2);
      tr[q] = await ev(a.pg, () => { const G = MZ.gfx, s = MZ.state.player; G.nodes.flush(); G.grass.layout(s.x, s.z); MZ.town.render(1); return G.tris(); });
      grs[q] = await ev(a.pg, () => MZ.gfx.grass.count);
      ok('三角形の上限（' + q + '）：' + lim[q] + ' 以下', tr[q] <= lim[q], tr[q]);
    }
    console.log('  三角形（建物 20・住民 60 の場面）', JSON.stringify(tr));
    ok('草の株の数は、予算の草 ÷ 1 株の三角形（30）：低 2,200・中 5,000・高 15,000', grs.low === 2200 && grs.mid === 5000 && grs.high === 15000, JSON.stringify(grs));
    ok('三角形が区切り 3 のとき（低 288,230・中 893,712・高 1,623,956）以下（建物 20・住民 60 の場面。下がってよい）', ['low:288230', 'mid:893712', 'high:1623956'].every(t => { const [q, v] = t.split(':'); return tr[q] <= +v * 1.01; }), JSON.stringify(tr));
    await ev(a.pg, () => MZ.gfx.setQuality('low'));
    await settle(a.pg, 3);
    const gr = await ev(a.pg, () => {
      const G = MZ.gfx, s = MZ.state.player; s.x = 0; s.z = 0; G.grass.layout(0, 0);
      const cnt = (gx, gz) => G.grass.countInCell(gx, gz);
      let open = 0, openCells = 0; for (let gz = 50; gz < 56; gz++) for (let gx = 44; gx < 56; gx++) if (!MZ.world.owner[MZ.ci(gx, gz)]) { open += cnt(gx, gz); openCells++; }
      const rd = []; for (let g = 38; g <= 58; g++) rd.push(cnt(58, g));
      const hs = []; MZ.chunk().layers.ground.filter(b => b.t === 'house').forEach(b => { for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) hs.push(cnt(b.x + i, b.z + j)); });
      const fd = [cnt(50, 54), cnt(51, 55)];
      const mk = (gx, gz) => G.ground.data.data[MZ.ci(gx, gz) * 4];
      const before = [mk(58, 45), mk(58, 20)];
      const id = Object.values(MZ.town.byId).find(b => b.t === 'road' && b.x === 58 && b.z === 45).id;
      MZ.remove(id); const after = mk(58, 45); G.grass.layout(0, 0); const regrown = cnt(58, 45);
      const pos = G.ground.hi.getVerticesData('position'); let flat = true, n = 0;
      for (let i = 0; i < pos.length; i += 3) if (Math.abs(pos[i]) <= 126 && Math.abs(pos[i + 2]) <= 126) { n++; if (pos[i + 1] !== 0) flat = false; }
      return { road: rd.reduce((a, b) => a + b, 0), house: hs.reduce((a, b) => a + b, 0), field: fd.reduce((a, b) => a + b, 0), open, openCells, before, after, regrownMax: regrown, flat, n };
    });
    ok('建物・道・畑のマスに草が生えない（それ以外には生える）', gr.road === 0 && gr.house === 0 && gr.field === 0 && gr.open > 0, JSON.stringify(gr));
    ok('マスの塗り分けの表：道を建てると R が立ち、こわすと戻る', gr.before[0] === 255 && gr.before[1] === 0 && gr.after === 0, JSON.stringify([gr.before, gr.after]));
    ok('土地の中（±126m）は y = 0 の平らな地面', gr.flat && gr.n > 100, gr.n);
    ok('描画の層で出たエラー・警告が 0（三角形・草の場面）', a.list.length === 0, a.list.slice(0, 4).join(' | '));
    await a.c.close();
  }

  /* 作業台が GLB で出る・見本の緑と赤が GLB でも出る・こわすと消える（中） */
  {
    const a = await open2({ pref: 'mid' });
    await begin2(a.pg);
    await ev(a.pg, () => { MZ.noSave = true; Object.keys(MZ.state.inv).forEach(k => { MZ.state.inv[k] = 99; }); });
    await loaded(a.pg);
    await a.pg.waitForFunction(() => { const g = MZ.gfx.looks.state.glb.bench; return g && g.near; }, null, { timeout: 120000 });
    await ev(a.pg, () => { MZ.state.player.x = 0; MZ.state.player.z = -12; TT.build('bench', 62, 50, 0); });
    await settle(a.pg, 2);
    const r = await ev(a.pg, () => {
      MZ.gfx.looks.nearTick(1, true);
      const o = Object.values(MZ.town.meshes).find(m => m.key === 'bench'), base = o.inst[0].sourceMesh, nm = o.near[0] && o.near[0].sourceMesh, p = MZ.state.player, G = MZ.gfx;
      const r = { src: G.look('bench').src, inst: o.inst.length, nearOn: o.nearOn, baseOff: !o.inst[0].isEnabled(), nearTris: nm ? Math.round(nm.getTotalIndices() / 3) : 0, baseTris: Math.round(base.getTotalIndices() / 3), frozen: o.inst[0].isWorldMatrixFrozen && o.near[0].isWorldMatrixFrozen };
      /* 遠ざかる：60m をこえると最遠、220m をこえると見えない。もどると遠く用 → 近く用 */
      const at = d => { p.z = -12 - d; G.looks.nearTick(1, true); return o.mode + ':' + o.nearOn + ':' + (o.inst[0].isEnabled() ? 'b' : '') + (o.xf.length && o.xf[0].isEnabled() ? 'x' : '') + (o.near.length && o.near[0].isEnabled() ? 'n' : ''); };
      r.far45 = at(45); r.far80 = at(80); r.xfTris = o.xf.length ? Math.round(o.xf[0].sourceMesh.getTotalIndices() / 3) : 0; r.far260 = at(260); r.back = at(0);
      return r;
    });
    ok('作業台が GLB で出る（近くの建物の係が近く用を置き、遠く用は隠れる。45m（建物から約 38m）で遠く用・80m（約 73m）で最遠（460 三角形）・260m で見えない・もどると近く用）', r.src === 'glb' && r.inst >= 1 && r.nearOn && r.baseOff && r.nearTris > 10000 && r.baseTris < 3000 && r.frozen && r.far45 === 'far:false:b' && r.far80 === 'xfar:false:x' && r.xfTris < 600 && r.far260 === 'cull:false:' && r.back === 'far:true:n', JSON.stringify(r));
    const pv = await ev(a.pg, () => {
      MZ.startBuild('bench'); MZ.player.updateAim(); MZ.town.updatePreview();
      const parts = MZ.world.scene.getTransformNodeByName('previewRoot').metadata.parts;
      return { n: parts.length, mat: MZ.world.scene.getMeshByName('preview').material.name, rg: parts.every(p => p.renderingGroupId === 1) };
    });
    ok('見本の緑・赤が出る（見本は遠く用の形を複製・手前に描く）', pv.n >= 1 && /^pv(Ok|Bad)$/.test(pv.mat) && pv.rg, JSON.stringify(pv));
    await ev(a.pg, () => MZ.cancelBuild());
    const gone = await ev(a.pg, () => {
      const b = MZ.chunk().layers.ground.find(x => x.t === 'bench'); MZ.remove(b.id);
      return MZ.world.scene.meshes.filter(m => m.name.startsWith('bench_')).length;
    });
    ok('こわすと建物のメッシュが消える（dispose）', gone === 0, gone);
    ok('作業台・見本の場面でエラー・警告が 0', a.list.length === 0, a.list.slice(0, 4).join(' | '));
    await a.c.close();
  }

  /* 主人公・住民・道具・粘土・鉄の鉱脈が GLB で出る（中）と、低では遠く用だけ読む */
  for (const q of ['mid', 'low']) {
    const a = await open2({ pref: q });
    await begin2(a.pg);
    await ev(a.pg, () => { MZ.noSave = true; Object.keys(MZ.state.inv).forEach(k => { MZ.state.inv[k] = 99; }); });
    await loaded(a.pg);
    await a.pg.waitForFunction(() => { const c = MZ.gfx.looks.state.chr; return c.player && (c.player.far || c.player.near) && c.person_c && c.person_c.far; }, null, { timeout: 120000 });
    await a.pg.waitForTimeout(1500);
    const r = await ev(a.pg, () => {
      const L = MZ.gfx.looks.state, o = {};
      o.pn = !!(L.chr.player.near), o.pf = !!(L.chr.player.far);
      o.tools = Object.keys(L.tool).length;
      o.nearPeople = MZ.gfx.people.state.near.filter(Boolean).length;
      o.farPeople = MZ.gfx.people.state.far.filter(Boolean).length;
      o.pm = MZ.gfx.looks.playerModel().metadata;
      o.nodes = Object.keys(MZ.gfx.nodes.state.forms).filter(k => /^(clay|iron)[NF]$/.test(k)).sort().join(',');
      return { pn: o.pn, pf: o.pf, tools: o.tools, nearPeople: o.nearPeople, farPeople: o.farPeople, glb: o.pm && o.pm.glb, parts: o.pm && o.pm.parts ? Object.keys(o.pm.parts).sort().join(',') : null, nodes: o.nodes, failed: MZ.gfx.assets.failed.length };
    });
    if (q === 'mid') {
      ok('中：主人公・住民・道具・粘土・鉄の GLB が読めた（近く用・遠く用）', r.pn && r.pf && r.tools === 6 && r.nearPeople === 3 && r.farPeople === 3 && r.failed === 0 && r.nodes === 'clayF,clayN,ironF,ironN', JSON.stringify(r));
      ok('中：主人公の根は近く用で、脚と腕の根がある', r.glb === 'near' && r.parts === 'armL,armR,legL,legR', JSON.stringify(r));
    } else {
      ok('低：近く用を読まない（主人公・住民・道具・粘土・鉄は遠く用だけ）', !r.pn && r.pf && r.tools === 0 && r.nearPeople === 0 && r.farPeople === 3 && r.nodes === 'clayF,ironF', JSON.stringify(r));
      ok('低：主人公の根は遠く用', r.glb === 'far' && r.parts === 'armL,armR,legL,legR', JSON.stringify(r));
    }
    /* 三人称：道具が手に出る */
    const t3 = await ev(a.pg, () => {
      const s = MZ.state.player; s.view = 3; MZ.state.tools.axe = 2; MZ.state.tools.pick = 3; MZ.player.lastTool = 'pick';
      MZ.player.updateCamera(0.016);
      const pm = MZ.player.model, md = pm.metadata, held = Object.keys(md.tools || {}).filter(k => md.tools[k].cl.some(c => c.isEnabled()));
      return { en: pm.isEnabled(), held: held.join(','), glb: md.glb };
    });
    ok(q + '：三人称で主人公が出る。道具は' + (q === 'mid' ? '持っている段（つるはし 3）の GLB を手に持つ' : '遠く用のため持たない（コードの形のまま）'), t3.en && (q === 'mid' ? t3.held === 'pick3' : t3.held === ''), JSON.stringify(t3));
    /* 一人称：手の道具 */
    const t1 = await ev(a.pg, () => {
      const s = MZ.state.player; s.view = 1; MZ.player.lastTool = 'axe'; MZ.player.updateCamera(0.016);
      const H = MZ.player.hands.axe;
      return { root: H.root.isEnabled(), code: H.code.isEnabled(), glb: Object.keys(H.glb).join(','), glbOn: [1, 2, 3].filter(l => H.glb[l] && H.glb[l].every(c => c.isEnabled())).join(',') };
    });
    if (q === 'mid') ok('中：一人称の手に斧（石の斧 = 2）の GLB が出る（コードの形は隠れる）', t1.root && !t1.code && t1.glbOn === '2', JSON.stringify(t1));
    else ok('低：一人称の手はコードの形', t1.root && t1.code && t1.glb === '', JSON.stringify(t1));
    /* 住民：近い人は部品ごと・脚が振れる */
    const pp = await ev(a.pg, () => {
      MZ.world.nodes.forEach(nd => { if (nd.gx >= 40 && nd.gx <= 80 && nd.gz >= 40 && nd.gz <= 80) MZ.world.take(nd.idx, -1); });
      for (let i = 0; i < 4; i++) MZ.place('house', 52 + i * 3, 60, 0);
      MZ.state.timers.migrate = 0; MZ.state.pop = 6; MZ.town.resDirty = true; MZ.tick(1);
      const p = MZ.state.player; p.x = 0; p.z = -9;
      const cam = MZ.world.camera.position;
      MZ.town.residents.forEach((r, i) => { r.x = p.x + (i - 2.5) * 0.9; r.z = p.z + 3 + (i % 2); r.mv = true; r.wait = 0; });
      MZ.player.updateCamera(0.016); MZ.world.camera.computeWorldMatrix(true);
      MZ.town.render(0.9);
      const gs = MZ.gfx.people.state.groups.filter(g => g.n > 0);
      const near = gs.filter(g => g.parts);
      const diff = near.length ? near.some(g => { for (let i = 0; i < g.n; i++) { const b = g.bufs[0][i * 16 + 5], l = g.bufs[1][i * 16 + 6]; if (Math.abs(g.bufs[1][i * 16 + 6] - g.bufs[0][i * 16 + 6]) > 1e-4 || Math.abs(g.bufs[3][i * 16 + 6] - g.bufs[0][i * 16 + 6]) > 1e-4) return true; } return false; }) : false;
      return { n: gs.reduce((a, g) => a + g.n, 0), nearGroups: near.length, parts: near.length ? near[0].meshes.length : 0, diff, swingB: MZ.gfx.people.swing(1), swingA: MZ.gfx.people.swing(0) };
    });
    if (q === 'mid') ok('中：近い住民は 5 つの部品で出て、歩くと脚・腕の行列が胴と変わる', pp.n === 6 && pp.nearGroups >= 1 && pp.parts === 5 && pp.diff, JSON.stringify(pp));
    else ok('低：住民は遠く用（部品をまとめた 1 つ）だけで出る', pp.n === 6 && pp.nearGroups === 0, JSON.stringify(pp));
    ok(q + '：スカートの住民（b）の脚の振りは他より小さい', pp.swingB < pp.swingA && pp.swingB <= 0.35, JSON.stringify(pp));
    /* 粘土・鉄：近く用か遠く用で出る */
    await ev(a.pg, () => { const p = MZ.state.player, c = MZ.world.nodes.find(n => n.k === 'clay'), i = MZ.world.nodes.find(n => n.k === 'iron'); p.x = c.x - 3; p.z = c.z - 3; MZ.gfx.nodes.flush(); });
    await settle(a.pg, 2);
    const nd = await ev(a.pg, () => MZ.gfx.nodes.stats());
    ok(q + '：粘土が' + (q === 'mid' ? '近く用（clayN）' : '遠く用（clayF）') + 'で出る', q === 'mid' ? (nd.clayN > 0) : (nd.clayF > 0 && !nd.clayN), JSON.stringify(nd));
    ok(q + '：主人公・住民・道具・粘土・鉄の場面でエラー・警告が 0', a.list.length === 0, a.list.slice(0, 4).join(' | '));
    await a.c.close();
  }

  /* β0.3.0：新しい建物 7 種（石畳・採石場・粘土採り場・工房・商店・倉庫・大きな畑）を高・中・低で置いてもエラーが出ない。石畳の写真が画質どおりに読まれる。
     村の場面（1 区画に新しい建物 7 種を含む 100 軒・人口 200）の三角形は、測って報告するだけ（合否にしない） */
  {
    const a = await open2({});
    await begin2(a.pg);
    const res = await ev(a.pg, () => {
      MZ.noSave = true; const s = MZ.state, W = MZ.world;
      W.nodes.forEach(nd => { if (nd.gx >= 28 && nd.gx <= 94 && nd.gz >= 28 && nd.gz <= 94) W.take(nd.idx, -1); });
      Object.keys(s.inv).forEach(k => { s.inv[k] = 99999; });   // 試験用：材料を持たせる
      s.stage = 3;
      const kinds = ['house', 'bhouse', 'house', 'field', 'bigfield', 'quarry', 'claypit', 'workshop', 'shop', 'storehouse', 'well', 'house', 'bhouse', 'lumber'];
      for (let g = 30; g <= 56; g++) MZ.place('stoneroad', g, 62, 0);
      let n = 0; const seen = {};
      for (let r = 0; r < 12 && n < 100; r++) for (let c = 0; c < 12 && n < 100; c++) {
        const gx = 30 + c * 5, gz = 30 + r * 5 + (r > 5 ? 2 : 0);
        if (gz >= 58 && gz <= 64 && gx >= 56 && gx <= 64) continue;
        const k = kinds[(r * 12 + c) % kinds.length];
        if (MZ.place(k, gx, gz, (r + c) % 4)) { n++; seen[k] = 1; }
      }
      s.pop = 200; s.timers.migrate = -1e6; MZ.town.resDirty = true; MZ.tick(1); MZ.town.render(1);
      const p = s.player; p.x = 0; p.z = -70; p.yaw = 0; p.pitch = -0.02;
      return { n, kinds: Object.keys(seen).length, people: MZ.town.pgroups.reduce((a, g) => a + g.n, 0), pop: s.pop, stone: MZ.town.list().filter(b => b.t === 'stoneroad').length };
    });
    ok('村の場面：新しい建物 7 種を含む建物 100 軒と石畳・人口 200（歩く姿は 60 人まで）', res.n === 100 && res.kinds === 11 && res.people === 60 && res.pop === 200 && res.stone === 27, JSON.stringify(res));
    const tr = {}, cob = {};
    for (const q of ['low', 'mid', 'high']) {
      await ev(a.pg, q => MZ.gfx.setQuality(q), q);
      await loaded(a.pg); await settle(a.pg, 2);
      tr[q] = await ev(a.pg, () => { const G = MZ.gfx, s = MZ.state.player; G.nodes.flush(); G.grass.layout(s.x, s.z); MZ.town.render(1); return G.tris(); });
      cob[q] = await ev(a.pg, () => { const g = MZ.gfx.photo.state.got && MZ.gfx.photo.state.got.cobble; return g ? [!!g.col, !!g.nrm, !!g.orm] : null; });
    }
    console.log('  村の場面の三角形（報告用）', JSON.stringify(tr));
    ok('村の場面：高・中・低で描けてエラー・警告が 0（三角形は報告だけ）', tr.low > 0 && tr.mid > 0 && tr.high > 0 && a.list.length === 0, JSON.stringify(tr) + ' ' + a.list.slice(0, 3).join(' | '));
    ok('石畳の写真：低は色だけ・中は色と法線・高は色・法線・ORM', JSON.stringify(cob) === '{"low":[true,false,false],"mid":[true,true,false],"high":[true,true,true]}', JSON.stringify(cob));
    await a.c.close();
    const rq = [];
    const b = await open2({ pref: 'mid', route: c => c.route('**/assets/tex/cobble_*', async r => { rq.push(r.request().url().replace(/^.*\//, '')); try { await r.continue(); } catch (e) { /* 閉じた */ } }) });
    await begin2(b.pg); await loaded(b.pg);
    ok('石畳の写真：中は cobble_col と cobble_nrm_s を取りに行く', [...new Set(rq)].sort().join() === 'cobble_col.jpg,cobble_nrm_s.jpg', rq.join());
    await b.c.close();
    const c3 = await open2({ route: c => c.route('**/assets/tex/cobble_*', r => r.abort()) });
    await begin2(c3.pg); await loaded(c3.pg);
    const f = await ev(c3.pg, () => { MZ.noSave = true; MZ.state.stage = 2; Object.keys(MZ.state.inv).forEach(k => { MZ.state.inv[k] = 99; }); MZ.world.nodes.forEach(nd => { if (nd.gx >= 50 && nd.gx <= 70 && nd.gz >= 50 && nd.gz <= 70) MZ.world.take(nd.idx, -1); }); return [MZ.place('stoneroad', 62, 59, 0), MZ.gfx.photoOk]; });
    await settle(c3.pg, 3);
    ok('石畳の写真が読めなくても、石畳は置けて描ける（ほかの写真はそのまま。エラーは Failed to load resource だけ）', f[0] === true && f[1] >= 4 && c3.list.filter(e => !/^error Failed to load resource/.test(e)).length === 0, JSON.stringify(f) + ' ' + c3.list.filter(e => !/^error Failed to load resource/.test(e)).slice(0, 3).join(' | '));
    await c3.c.close();
  }


  /* β0.3.0 区切り 5：新しい建物 6 種の GLB（近く用・遠く用・最遠）の外形がマスに収まる・足もとが地面・最遠の 3 つ、工房の煙（動いている物だけ・近い順に 4 つまで・60m 以内） */
  {
    const a = await open2({ pref: 'mid' });
    await begin2(a.pg); await loaded(a.pg);
    await a.pg.waitForFunction(() => { const g = MZ.gfx.looks.state.glb; return ['bigfield', 'claypit', 'quarry', 'workshop', 'shop', 'storehouse'].every(k => g[k] && g[k].near && g[k].far); }, null, { timeout: 240000 });
    const r = await ev(a.pg, () => {
      const L = MZ.gfx.looks.state, B = BABYLON, o = {};
      ['bigfield', 'claypit', 'quarry', 'workshop', 'shop', 'storehouse'].forEach(k => {
        const half = MZ.BUILDS[k].w * MZ.T.cell / 2, d = MZ.gfx.BUILD_MODELS[k], g = L.glb[k];
        const bb = ms => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y0 = 1e9; ms.forEach(m => { m.refreshBoundingInfo(); const b = m.getBoundingInfo().boundingBox; x0 = Math.min(x0, b.minimum.x); x1 = Math.max(x1, b.maximum.x); z0 = Math.min(z0, b.minimum.z); z1 = Math.max(z1, b.maximum.z); y0 = Math.min(y0, b.minimum.y); }); return { x: [x0, x1], z: [z0, z1], y0 }; };
        const fit = b => b.x[0] >= -half - 0.1 && b.x[1] <= half + 0.1 && b.z[0] >= -half - 0.1 && b.z[1] <= half + 0.1 && Math.abs(b.x[0] + b.x[1]) < 0.4 && Math.abs(b.z[0] + b.z[1]) < 0.6 && Math.abs(b.y0) < 0.03;
        const nb = bb(g.near), fb = bb(g.far), xb = d.xfar !== d.far && g.xfar ? bb(g.xfar) : null;
        o[k] = { half, near: fit(nb), far: fit(fb), xfar: xb ? fit(xb) : 'なし（遠く用を使う）', nz: nb.z.map(v => +v.toFixed(2)), xs: nb.x.map(v => +v.toFixed(2)) };
      });
      return o;
    });
    ok('新しい建物 6 種の GLB：近く用・遠く用・最遠の外形が敷地（2×2＝±2m・3×3＝±3m）に収まり、足もとが y=0、中心が原点（敷地の真ん中のマスの中心。採石場の最遠だけ奥行きが z −1.35〜1.85 でかたよる）', Object.values(r).every(v => v.near === true && v.far === true && v.xfar !== false), JSON.stringify(r));
    const xf = await ev(a.pg, () => { const g = MZ.gfx.looks.state.glb; return ['hut', 'house', 'bench'].map(k => !!(g[k] && g[k].xfar && g[k].xfar !== g[k].far)); });
    await a.pg.waitForFunction(() => { const g = MZ.gfx.looks.state.glb; return ['hut', 'house', 'bench'].every(k => g[k] && g[k].xfar); }, null, { timeout: 120000 }).catch(() => { });
    const xf2 = await ev(a.pg, () => { const g = MZ.gfx.looks.state.glb, tr = m => Math.round(m.reduce((t, x) => t + x.getTotalIndices() / 3, 0)); return ['hut', 'house', 'bench'].map(k => [k, g[k].xfar !== g[k].far, tr(g[k].xfar)]); });
    ok('最遠は 小屋・木の家・作業台 だけ別ファイル（409・370・460 三角形）。ほかの 13 種は遠く用を最遠に使う', xf2.every(x => x[1] && x[2] <= 600) && xf2.map(x => x[2]).join() === '409,370,460', JSON.stringify(xf2));
    /* 工房の煙：6 つの工房（動くのは 5 つ。1 つは材料を止める＝えらばない）を、主人公から近い順に */
    const sm = await ev(a.pg, () => {
      MZ.noSave = true; const s = MZ.state, G = MZ.gfx, W = MZ.world;
      s.stage = 2; s.pop = 60; Object.keys(s.inv).forEach(k => { s.inv[k] = 9999; });
      W.nodes.forEach(nd => { if (nd.gx >= 20 && nd.gx <= 110 && nd.gz >= 44 && nd.gz <= 62) W.take(nd.idx, -1); });
      const ids = [];
      [30, 40, 50, 66, 76, 90].forEach(gx => { MZ.place('workshop', gx, 52, 0); ids.push(Object.values(MZ.town.byId).filter(b => b.t === 'workshop').pop().id); });
      ids.slice(0, 5).forEach(id => MZ.setMake(id, 'brick'));   // 6 つめはえらばない（off）
      s.inv.brick = 0; s.inv.stone = 100; s.inv.clay = 100; s.timers.migrate = -1e6; MZ.tick(3); MZ.town.resDirty = true; MZ.tick(3);
      const out = { st: ids.map(id => MZ.town.workSt(MZ.town.byId[id])) };
      const at = (x, z) => { s.player.x = x; s.player.z = z; G.fire.smokeTick(x, z); return G.fire.state.smokes.filter(h => h.ps).length; };
      out.near = at(0, -10);                                          // 工房は x = -60〜+60、z = -16。5 つ動くが 4 つまで
      out.far = at(0, -120);                                          // 60m より遠い
      out.one = at(-60, -30);                                         // 左端の工房の近く：60m 以内は左の 2〜3 つ
      const L = G.looks.state;
      const o1 = [...L.objs].find(o => o.key === 'workshop'), p = new BABYLON.Vector3();
      G.looks.smokePos(o1, p);
      const mk = L.glb.workshop.near && L.glb.workshop.near.marks && L.glb.workshop.near.marks.smoke;
      out.mark = mk ? [mk.x, mk.y, mk.z].map(v => +v.toFixed(3)) : null; out.pos = [p.x - o1.x, p.y, p.z - o1.z].map(v => +v.toFixed(3));
      /* 煙は動いている物だけ：1 つとめる → 次の係で消える */
      const h2 = G.fire.state.smokes.find(h => h.obj.bid === ids[2]); at(0, -10); out.on2 = !!h2.ps; MZ.setMake(ids[2], null); at(0, -10); out.after = !h2.ps;
      return out;
    });
    ok('工房の煙：動いている工房だけ（6 つのうち 5 つが run。1 つは off）', sm.st.filter(x => x === 'run').length === 5 && sm.st[5] === 'off', JSON.stringify(sm.st));
    ok('工房の煙：主人公から 60m 以内で近い順に 4 つまで（近く ' + sm.near + '・120m はなれると ' + sm.far + '・左端の近く ' + sm.one + '）。えらびを止めた工房の煙は消える（' + sm.after + '）', sm.near === 4 && sm.far === 0 && sm.one >= 1 && sm.one <= 4 && sm.on2 && sm.after === true, JSON.stringify(sm));
    ok('工房の煙の位置：GLB の空ノード smoke（glTF の [1.48, 5.5, 0.3]。Babylon では x が反対向きの [-1.48, 5.5, 0.3]）から。建物の向き 0 で、建物の中心からのずれが一致', sm.mark && Math.abs(Math.abs(sm.mark[0]) - 1.48) < 0.02 && Math.abs(sm.mark[1] - 5.5) < 0.02 && Math.abs(Math.abs(sm.mark[2]) - 0.3) < 0.02 && sm.pos[0] === sm.mark[0] && sm.pos[2] === sm.mark[2], JSON.stringify([sm.mark, sm.pos]));
    /* β0.3.1：建物の向き。GLB の部品は rotationQuaternion を持ち、インスタンスがそれを写すと rotation.y が効かなかった（どの向きで建てても同じ向き） */
    const rot = await ev(a.pg, () => {
      const B = BABYLON, L = MZ.gfx.looks.state, s = MZ.state, out = [];
      MZ.noSave = true; Object.keys(s.inv).forEach(k => { s.inv[k] = 9999; });
      MZ.world.nodes.forEach(nd => { if (nd.gx >= 40 && nd.gx <= 80 && nd.gz >= 70 && nd.gz <= 76) MZ.world.take(nd.idx, -1); });
      [0, 1, 2, 3].forEach(r => MZ.place('bench', 50 + r * 3, 72, r));
      s.player.x = 0; s.player.z = 20; MZ.gfx.looks.nearTick(1, true); MZ.gfx.looks.nearTick(1, true); MZ.gfx.looks.nearTick(1, true);
      L.objs.forEach(o => {
        if (o.key !== 'bench' || o.z < 20) return;
        const ax = i => { const v = B.Vector3.TransformNormal(new B.Vector3(0, 0, 1), i.computeWorldMatrix(true)); return Math.round(Math.atan2(v.x, v.z) / (Math.PI / 2)); };
        const want = Math.round(o.ry / (Math.PI / 2));
        out.push({ want, far: o.inst.map(ax), near: o.near.map(ax) });
      });
      return out;
    });
    const same = (a1, w) => a1.every(v => ((v - w) % 4 + 4) % 4 === 0);
    ok('建物の向き：作業台を向き 0〜3 で置くと、遠く用・近く用のインスタンスが置いた向きに回っている', rot.length === 4 && rot.every(o => o.far.length > 0 && same(o.far, o.want) && same(o.near, o.want)) && rot.some(o => o.near.length > 0), JSON.stringify(rot));
    ok('新しい建物 6 種の GLB・工房の煙でエラー・警告が 0', a.list.length === 0, a.list.slice(0, 4).join(' | '));
    await a.c.close();
    /* コードの形（低）でも、同じ位置から煙が出る */
    const b = await open2({});
    await begin2(b.pg); await loaded(b.pg);
    const lo = await ev(b.pg, () => {
      MZ.noSave = true; const s = MZ.state, G = MZ.gfx, W = MZ.world;
      s.stage = 2; s.pop = 30; Object.keys(s.inv).forEach(k => { s.inv[k] = 9999; });
      W.nodes.forEach(nd => { if (nd.gx >= 40 && nd.gx <= 90 && nd.gz >= 44 && nd.gz <= 62) W.take(nd.idx, -1); });
      MZ.place('workshop', 56, 52, 1); const id = Object.values(MZ.town.byId).find(x => x.t === 'workshop').id;
      MZ.setMake(id, 'brick'); s.inv.brick = 0; s.inv.stone = 100; s.inv.clay = 100; s.timers.migrate = -1e6; MZ.tick(3); MZ.town.resDirty = true; MZ.tick(3);
      s.player.x = 0; s.player.z = -10; G.fire.smokeTick(0, -10);
      const h = G.fire.state.smokes[0], o = h.obj, p = h.ps && h.ps.emitter;
      return { src: G.look('workshop').src, ps: !!h.ps, dx: p ? +(p.x - o.x).toFixed(2) : null, dy: p ? +p.y.toFixed(2) : null, dz: p ? +(p.z - o.z).toFixed(2) : null, st: MZ.town.workSt(MZ.town.byId[id]) };
    });
    ok('工房の煙（低・GLB は最遠・向き 90 度）：動いていれば出る。位置は建物の向きで回る（x・z が入れかわる）', lo.ps && lo.st === 'run' && Math.abs(lo.dy - 5.5) < 0.05 && Math.abs(Math.abs(lo.dx) - 0.3) < 0.05 && Math.abs(Math.abs(lo.dz) - 1.48) < 0.05, JSON.stringify(lo));
    ok('工房の煙（低）でエラー・警告が 0', b.list.length === 0, b.list.slice(0, 4).join(' | '));
    await b.c.close();
  }

  /* β0.3.0 区切り 4：重い場面（9 区画を全部広げ、建物 150 軒・石畳と土の道・人口 200）。視点は (a) いちばん建物が集まった所の一人称 (b) 同じ所の三人称（見下ろし。pitch は正が下向き）。
     高・中・低で G.tris() が上限以下（予算の手順で下げた段も報告）。近く用の建物の数が nearMax 以下。建物のインスタンスは行列を固定している */
  {
    const a = await open2({ viewport: { width: 480, height: 300 } });
    await begin2(a.pg);
    const sc = await ev(a.pg, () => {
      MZ.noSave = true; const s = MZ.state, W = MZ.world;
      s.stage = 3; Object.keys(s.inv).forEach(k => { s.inv[k] = 999999; });
      const okAll = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [1, -1], [-1, -1], [-1, 1]].map(c => MZ.expand(c[0], c[1]));
      const kinds = ['house', 'bhouse', 'house', 'well', 'field', 'bigfield', 'shop', 'workshop', 'quarry', 'claypit', 'storehouse', 'lumber', 'house', 'bhouse'];
      let n = 0, k = 0;
      const clear = (gx, gz) => W.nodes.forEach(nd => { if (Math.abs(nd.gx - gx) <= 3 && Math.abs(nd.gz - gz) <= 3) W.take(nd.idx, -1); });
      const put = (gx0, gz0, cols, rows, cnt, step) => { for (let r = 0; r < rows && cnt > 0; r++) for (let c = 0; c < cols && cnt > 0; c++) { const gx = gx0 + c * step, gz = gz0 + r * step; clear(gx, gz); if (MZ.place(kinds[k++ % kinds.length], gx, gz, (r + c) % 4)) { n++; cnt--; } } };
      for (let g = 20; g <= 230; g++) { clear(g, 62); MZ.place('stoneroad', g, 62, 0); }
      for (let g = 20; g <= 100; g++) { clear(80, g); MZ.place('road', 80, g, 0); }
      put(26, 26, 10, 5, 50, 5); put(130, 30, 10, 6, 60, 5); put(26, 126, 10, 3, 20, 5); put(130, 126, 10, 2, 20, 5);
      s.pop = 200; s.timers.migrate = -1e6; MZ.town.resDirty = true; MZ.tick(1); MZ.town.render(1);
      const bs = MZ.town.list().filter(b => b.t !== 'road' && b.t !== 'stoneroad'), pos = bs.map(b => MZ.town.center(b));
      let best = pos[0], bc = -1; pos.forEach(p => { const c = pos.filter(o => Math.hypot(o[0] - p[0], o[1] - p[1]) < 40).length; if (c > bc) { bc = c; best = p; } });
      window.HEAVY = best;
      return { n, okAll: okAll.every(Boolean), people: MZ.town.pgroups.reduce((x, g) => x + g.n, 0), land: s.land.length, best: best.map(Math.round), kinds: new Set(bs.map(b => b.t)).size };
    });
    ok('重い場面：9 区画・建物 150 軒（小屋のほか 11 種）・石畳と土の道・人口 200（歩く姿は 60 人）', sc.n === 150 && sc.okAll && sc.land === 9 && sc.people === 60 && sc.kinds === 12, JSON.stringify(sc));
    const lim = { low: 300000, mid: 900000, high: 1700000 }, nmax = { low: 0, mid: 4, high: 8 }, rep = {};
    for (const q of ['low', 'mid', 'high']) {
      await ev(a.pg, q => MZ.gfx.setQuality(q), q);
      await loaded(a.pg); await settle(a.pg, 2);
      for (const v of ['一人称', '三人称']) {
        const r = await ev(a.pg, async v => {
          const s = MZ.state.player, G = MZ.gfx, b = window.HEAVY;
          s.x = b[0]; s.z = b[1] - 6; s.yaw = 0;
          if (v === '一人称') { s.view = 1; s.pitch = 0; } else { s.view = 3; s.pitch = 0.5; }
          MZ.player.updateCamera(0.016);
          /* 予算の手順を回す（2 秒ごとのかわりに 1 回ずつ。上限をこえているあいだ、最大 40 回）。画質ごとに下げた段をもどしてから始める */
          G.grass.setScale(1); G.dyn.houseCut = 0; G.dyn.treeF = 1;
          for (let i = 0; i < 40; i++) {
            G.looks.nearTick(1, true); G.nodes.flush(); G.grass.layout(s.x, s.z);
            const t = G.tris(); if (t <= G.Q[G.key].trisMax) break;
            G.budgetStep(t);
            await new Promise(r => requestAnimationFrame(r));
          }
          G.looks.nearTick(1, true); G.nodes.flush(); G.grass.layout(s.x, s.z);
          const insts = Object.values(MZ.town.meshes).flatMap(o => o.inst.concat(o.near)), st = MZ.stats();
          const ms = G.scene.meshes, cat = {};
          for (let i = 0; i < ms.length; i++) {
            const m = ms[i]; if (!m.isEnabled() || !m.isVisible || !m.getTotalIndices || m._masterMesh) continue;
            let lm = m; if (m.sourceMesh && m.sourceMesh.getLODLevels().length) { lm = m.getLOD(G.cam); if (!lm) continue; }
            const nn = lm.getTotalIndices() / 3; if (!nn) continue;
            const t = nn * (m.hasThinInstances ? m.thinInstanceCount : 1), nm = (m.sourceMesh || m).name;
            const c = /^grass/.test(nm) ? '草' : /tree|leaf|wood|stump/i.test(nm) ? '木' : /terrain|mount|fence|out|ground/i.test(nm) ? '地面など' : m.sourceMesh ? '建物' : /person|player|leg|arm|body/.test(nm) ? '人' : 'その他（岩・低木・石・鉱脈・飾りなど）';
            cat[c] = (cat[c] || 0) + Math.round(t);
          }
          return { tris: G.tris(), active: st.activeMeshes, near: st.nearBuildings, budget: st.budget, frozen: insts.length > 0 && insts.every(i => i.isWorldMatrixFrozen), n: insts.length, cat };
        }, v);
        rep[q + v] = r;
        ok('重い場面（' + q + '・' + v + '）：三角形 ' + r.tris + ' が上限 ' + lim[q] + ' 以下。近く用の建物 ' + r.near + ' 軒（上限 ' + nmax[q] + '）。建物のインスタンス ' + r.n + ' 個は行列を固定', r.tris <= lim[q] && r.near <= nmax[q] && r.frozen, JSON.stringify(r));
      }
    }
    /* 予算の手順：草 → 建物の近く用の距離 → 木の近く用の距離の順に 1 段ずつ下げ、逆の順にもどす。採れる物は nodeFar より遠いと出ない */
    const bo = await ev(a.pg, () => {
      const G = MZ.gfx, o = { down: [], up: [] }, snap = () => { const b = G.budgetState(); return b.grass + '/' + b.houseCut + '/' + b.treeF; };
      G.grass.setScale(1); G.dyn.houseCut = 0; G.dyn.treeF = 1;
      let last = snap(), guard = 0, phase = [];
      while (guard++ < 80) { G.budgetStep(1e9); const b = G.budgetState(); const p = G.grass.scaleF > 0.1 + 1e-9 ? 'g' : b.houseCut < G.HOUSE_CUT_MAX ? 'h' : b.treeF > G.TREE_F_MIN + 1e-9 ? 't' : 'end'; if (phase[phase.length - 1] !== p) phase.push(p); if (p === 'end') break; }
      o.down = phase; o.end = snap();
      phase = []; guard = 0;
      while (guard++ < 200) { G.budgetStep(0); const b = G.budgetState(); const p = b.treeF < 1 ? 't' : b.houseCut > 0 ? 'h' : G.grass.scaleF < 1 ? 'g' : 'end'; if (phase[phase.length - 1] !== p) phase.push(p); if (p === 'end') break; }
      o.up = phase; o.back = snap();
      const q = G.Q[G.key], px = MZ.state.player.x, pz = MZ.state.player.z; G.nodes.flush();
      const far = MZ.world.nodes.filter(nd => Math.hypot(nd.x - px, nd.z - pz) > q.nodeFar && nd.look);
      o.farShown = far.length;
      return o;
    });
    ok('予算の手順：草（0.1 まで）→ 建物の近く用の距離（15m まで）→ 木の近く用の距離（60% まで）の順に下げ、3 → 2 → 1 の順にもどす。もとの値にもどる', bo.down.join(',') === 'g,h,t,end' && bo.up.join(',') === 't,h,g,end' && bo.back === '1/0/1', JSON.stringify(bo));
    ok('採れる物は nodeFar（高 250m）より遠いと、どの入れ物にも入らない', bo.farShown === 0, bo.farShown);
    console.log('  重い場面（報告用）', JSON.stringify(rep));
    ok('重い場面でエラー・警告が 0', a.list.length === 0, a.list.slice(0, 4).join(' | '));
    await a.c.close();
  }
  }
  /* ================= 区切り 5：通しの試験（最初から人口 200 まで。1 区画 "0,0" だけ） ================= */
  if (want(5)) {
  cur = 5;
  {
    const a = await open2({});
    await begin2(a.pg);
    const t0 = Date.now();
    const R = await ev(a.pg, () => {
      /* 使ってよいのは、ゲームの関数（MZ.hit・MZ.craft・MZ.place・MZ.remove・MZ.setMake・MZ.tick・MZ.startBuild など）と、主人公の場所を書きかえること（採れる物や作業台のそばへ行く代わり）だけ。
         持ち物・人口・段階は直接書かない。以下の小さな手伝い（gather・craftAt・placeNear など）は、その決まりの中で動く */
      MZ.noSave = true;
      const S = MZ.state, T = MZ.T, W = MZ.world, Tn = MZ.town, P = S.player, B = MZ.BUILDS;
      const st = { hits: 0, byK: {}, tickSec: 0, crafts: {}, craftCalls: 0, waits: 0, placed: 0 };
      const rawHit = MZ.hit, rawCraft = MZ.craft;
      MZ.hit = function () { MZ.player.updateAim(); const k = MZ.aim && MZ.aim.k; const r = rawHit.call(MZ); if (r) { st.hits++; st.byK[k] = (st.byK[k] || 0) + 1; } return r; };
      MZ.craft = function (key, n) { const r = rawCraft.call(MZ, key, n); if (r) { st.crafts[key] = (st.crafts[key] || 0) + (n || 1); st.craftCalls++; } return r; };
      const tick = sec => { st.tickSec += sec; MZ.tick(sec); };
      const stand = (x, z) => { P.x = x; P.z = z; P.yaw = 0; P.pitch = 0; };
      const RAW = { grass: ['bush'], stick: ['bush', 'tree'], stone: ['stone', 'rock'], log: ['tree'], clay: ['clay'], ore: ['iron'] };
      const PRODUCER = { log: 'lumber', stick: 'lumber', stone: 'quarry', clay: 'claypit' };
      const cellOf = gx => (gx - T.chunk / 2) * T.cell + T.cell / 2;
      const log = [];
      let guardAll = 0;
      const tooLong = () => { if (++guardAll > 400000) throw new Error('終わらない'); };
      let eastIronDug = 0;   // 東の岩場で掘り終えた鉄の鉱脈（また出ても数えたまま）
      const hitNode = nd => { stand(nd.x, nd.z - 1.4); let g = 0; while (W.nodeActive(nd.idx) && g++ < 80) { if (!MZ.hit()) return false; } if (nd.k === 'iron' && nd.ck === '1,0' && !W.nodeActive(nd.idx)) eastIronDug++; return true; };
      const producing = t => Tn.list().some(b => b.t === t && Tn.workState(b).st === 'run');
      function ensureTool(name, lv) {
        if (S.tools[name] >= lv) return;
        const r = MZ.RECIPES.find(x => x.tool && x.tool[0] === name && x.tool[1] === lv);
        for (let k = 0; k < 6 && MZ.craftReason(r) !== ''; k++) { Object.keys(r.cost).forEach(i => need(i, r.cost[i])); if (r.at && !Tn.has(r.at)) build(r.at); const c = Tn.list().find(b => b.t === r.at); if (c) { const q = Tn.center(c); stand(q[0], q[1] - 3); } }
        if (!MZ.craft(r.key)) throw new Error('道具が作れない ' + r.key + ' ' + MZ.craftReason(r));
      }
      /* 村（段階 2）になったら、東の岩場（"1,0"）を広げて、鉄の鉱脈をそこで掘る（広げる材料も手でたたいて集める） */
      let expanded = null;
      function expandEast() {
        if (expanded !== null || S.stage < MZ.T.villageStage) return;
        const cost = MZ.landCost(S.land.length), h0 = st.hits;
        for (let q = 0; q < 6 && !MZ.afford(cost); q++) Object.keys(cost).forEach(i => need(i, cost[i]));
        stand(115, 0);   // 柵のきわ（東の端）
        if (!MZ.expand(1, 0)) throw new Error('東の岩場を広げられない ' + MZ.canExpand(1, 0));
        expanded = { atSec: Math.round(st.tickSec), hits: st.hits - h0 }; log.push('東の岩場を広げた@' + expanded.atSec + '（広げる材料の手数 ' + expanded.hits + '）');
      }
      function gather(item, n) {
        let waited = 0;
        if (item === 'ore') { ensureTool('pick', 2); expandEast(); }
        while (S.inv[item] < n) {
          tooLong();
          const pr = PRODUCER[item];
          if (pr && producing(pr) && waited++ < 150) { st.waits++; tick(30); continue; }
          let best = null, bd = 1e9;
          W.nodes.forEach(nd => { if (RAW[item].indexOf(nd.k) < 0 || !W.nodeActive(nd.idx)) return; const d = MZ.NODES[nd.k]; if (d.tool && S.tools[d.tool] < d.need) return; const dd = Math.hypot(nd.x - P.x, nd.z - P.z) - (item === 'ore' && nd.ck === '1,0' ? 1000 : 0); if (dd < bd) { bd = dd; best = nd; } });
          if (!best) { tick(30); continue; }
          hitNode(best);
        }
      }
      function need(item, n) {
        if (S.inv[item] >= n) return;
        if (RAW[item]) return gather(item, n);
        const rec = MZ.RECIPES.find(r => r.tab === 'mat' && r.give[item]);
        let g = 0;
        while (S.inv[item] < n) {
          if (g++ > 500) throw new Error('作れない ' + item);
          const times = Math.ceil((n - S.inv[item]) / rec.give[item]), k = times >= 5 ? 5 : 1;
          for (let q = 0; q < 4; q++) { Object.keys(rec.cost).forEach(i => need(i, rec.cost[i] * k)); if (MZ.afford(k === 5 ? Object.fromEntries(Object.keys(rec.cost).map(i => [i, rec.cost[i] * 5])) : rec.cost)) break; }
          if (rec.at) { if (!Tn.has(rec.at)) build(rec.at); const c = Tn.list().find(b => b.t === rec.at), q = Tn.center(c); stand(q[0], q[1] - 3); }
          if (!MZ.craft(rec.key, k)) throw new Error('作れない ' + rec.key + ' ' + MZ.craftReason(rec, k));
        }
      }
      const clearCells = (gx, gz, w) => {
        for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) {
          const ni = W.cellNode[MZ.ci(gx + i, gz + j)];
          if (ni >= 0 && W.nodeActive(ni)) { const nd = W.nodes[ni], d = MZ.NODES[nd.k]; if (d.tool && S.tools[d.tool] < d.need) return false; if (!hitNode(nd)) return false; }
        }
        return true;
      };
      const fits = (gx, gz, w) => { for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) { if (!MZ.landAt(gx + i, gz + j) || W.owner[MZ.ci(gx + i, gz + j)]) return false; } return true; };
      const doPlace = (key, gx, gz, r) => { if (!fits(gx, gz, B[key].w) || !clearCells(gx, gz, B[key].w)) return false; stand(-100, -100); const ok = MZ.place(key, gx, gz, r || 0); if (ok) st.placed++; return ok; };
      const roadKey = () => (S.stage >= B.stoneroad.stage ? 'stoneroad' : 'road');
      /* 道：小屋の下の行 gz=61 を、東と西へ。家はこの行の上（gz 59）と下（gz 62）にならべる */
      function layRoad(gx0, gx1) {
        for (let g = gx0; g <= gx1; g++) { if (W.owner[MZ.ci(g, 61)]) continue; need('stone', B[roadKey()].cost.stone); if (!doPlace(roadKey(), g, 61, 0)) throw new Error('道が置けない ' + g); }
      }
      const slots = []; for (let k = 0; k < 58; k++) { slots.push([61 + 2 * k, 59], [61 + 2 * k, 62], [57 - 2 * k, 59], [57 - 2 * k, 62]); }
      let slotI = 0;
      const getCost = d => { for (let q = 0; q < 6 && !MZ.afford(d.cost); q++) Object.keys(d.cost).forEach(i => need(i, d.cost[i])); if (!MZ.afford(d.cost)) throw new Error('材料が足りない'); };
      function placeHouse() {
        for (; slotI < slots.length; slotI++) {
          const [gx, gz] = slots[slotI]; if (gx < 2 || gx + 1 > 118 || !fits(gx, gz, 2)) continue;
          if (gx > 59) layRoad(59, gx + 1); else layRoad(gx, 58);
          getCost(B.house);   // 道を置いたあとで材料をそろえる（石が道で減るため）
          if (doPlace('house', gx, gz, 0)) { slotI++; return true; }
        }
        throw new Error('家の場所がない');
      }
      const tried = {};
      function placeZone(key) {
        const w = B[key].w;
        for (let gz = 67; gz <= 112; gz += 4) for (let gx = 6; gx <= 112; gx += 4) {
          if (tried[gx + ',' + gz] || !fits(gx, gz, w)) continue;
          if (doPlace(key, gx, gz, 0)) return true;
          tried[gx + ',' + gz] = 1;
        }
        throw new Error('置き場所がない ' + key);
      }
      function build(key) {
        const d = B[key];
        while (S.stage < (d.stage || 0)) { tooLong(); tick(30); }
        if (key === 'house') return placeHouse();
        getCost(d);
        return placeZone(key);
      }
      const count = t => Tn.count(t);
      const infra = () => {
        if (!count('bench')) build('bench');
        ensureTool('pick', 2); ensureTool('axe', 2);
        if (!count('kiln')) build('kiln');
        if (!count('furnace')) build('furnace');
        if (S.stage >= 1 && !count('lumber')) build('lumber');
        if (S.stage >= 2) {
          ['quarry', 'claypit', 'storehouse', 'workshop'].forEach(k => { if (!count(k)) { build(k); log.push(k + '@' + Math.round(st.tickSec)); } });
          const ws = Tn.list().find(b => b.t === 'workshop'); if (ws && !ws.mk) MZ.setMake(ws.id, 'plank');
        }
      };
      let iter = 0;
      while (S.stage < 3 && iter++ < 600) {
        tooLong();
        infra();
        const I = Tn.info, G = S.stage >= 3 ? 200 : MZ.STAGES[S.stage + 1].pop;
        const def = { home: G - I.homeSum, water: G - I.water, food: G - I.food, shop: G - I.shop };
        let f = null; Object.keys(def).forEach(k => { if (def[k] > 0 && (f === null || def[k] > def[f])) f = k; });
        if (f === null || S.pop < Math.min(G, I.cap) - 8) { tick(30); if (f === null) continue; if (S.pop < Math.min(G, I.cap) - 8) continue; }
        if (f === 'home') build('house');
        else if (f === 'water') build('well');
        else if (f === 'food') build(S.stage >= B.bigfield.stage ? 'bigfield' : 'field');
        else if (f === 'shop') build('shop');
        if (iter % 25 === 0) log.push('iter' + iter + ' pop' + S.pop + ' st' + S.stage + ' t' + Math.round(st.tickSec) + ' hits' + st.hits);
      }
      const types = {}; Tn.list().forEach(b => { types[b.t] = (types[b.t] || 0) + 1; });
      return { stage: S.stage, pop: S.pop, iter, tickSec: st.tickSec, hits: st.hits, byK: st.byK, crafts: st.crafts, craftCalls: st.craftCalls, waits: st.waits, types, total: Tn.list().length, info: { home: Tn.info.homeSum, water: Tn.info.water, food: Tn.info.food, shop: Tn.info.shop, cap: Tn.info.cap }, inv: S.inv, log: log.slice(-12), expanded, land: S.land.length, eastIron: eastIronDug };
    });
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    console.log('  通しの試験：' + JSON.stringify(R));
    console.log('  通しの試験の実時間 ' + secs + ' 秒');
    const big = Object.keys(R.byK).filter(k => R.byK[k] >= 300);
    ok('通しの試験：最初から人口 200（段階 3）まで行ける（人口 ' + R.pop + '・手数 ' + R.hits + '・ゲームの中の時間 ' + Math.round(R.tickSec) + ' 秒）', R.stage === 3 && R.pop >= 200, JSON.stringify([R.stage, R.pop, R.iter]));
    ok('通しの試験：村（人口 50）のあと東の岩場を広げ、鉄の鉱脈をそこで掘った（' + JSON.stringify(R.expanded) + '・区画 ' + R.land + '・東で掘った鉄 ' + R.eastIron + '）', R.expanded && R.land >= 2 && R.eastIron > 0, JSON.stringify([R.expanded, R.land, R.eastIron]));
    ok('通しの試験：草むら・鉄の鉱脈とも 200 回以下（目安）：草むら ' + (R.byK.bush || 0) + '・鉄の鉱脈 ' + (R.byK.iron || 0), true);
    ok('通しの試験：たたく回数（種類ごと）は ' + JSON.stringify(R.byK) + (big.length ? '（300 回以上：' + big.join('・') + '）' : '（300 回以上の種類は無い）'), true);
    ok('通しの試験：エラー・警告が 0', a.list.length === 0, a.list.slice(0, 4).join(' | '));
    await a.c.close();
  }
  }
  if (want(1)) {
  cur = 1;
  /* ================= スマホ ================= */
  const saved = before;
  const mobile = async (name, w, h) => {
    const mc = await br.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await mc.addInitScript(LOW);
    await mc.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('machizukuri-save', s); sessionStorage.setItem('seeded', '1'); } }, saved);
    const p = await mc.newPage(); watch(p);
    await p.goto(URL); await p.waitForTimeout(400);
    await p.screenshot({ path: OUT + name + '-title.png' });
    ok(name + '：タイトルの説明がスマホ用', (await p.textContent('.how')).includes('左下をなぞって'));
    await p.click('#tbtn .go'); await p.waitForFunction(() => window.MZ && MZ.started); await ev(p, HELPERS);
    await ev(p, () => { const s = MZ.state.player; s.x = 12; s.z = -34; s.yaw = -0.15; s.pitch = 0.18; });
    await p.waitForTimeout(800); await frames(p, 4);
    /* 左スティックで歩く・右で見回す（CDP のタッチ） */
    const cdp = await mc.newCDPSession(p);
    const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    const z0 = await ev(p, () => MZ.state.player.z), pos0 = await ev(p, () => [MZ.state.player.x, MZ.state.player.z]);
    await touch('touchStart', w * 0.2, h * 0.75); await touch('touchMove', w * 0.2, h * 0.75 - 45); await p.waitForTimeout(1200);
    const stickVis = await ev(p, () => !document.querySelector('#stick').hidden);
    await touch('touchEnd');
    const pos1 = await ev(p, () => [MZ.state.player.x, MZ.state.player.z]);
    ok(name + '：左スティックで歩ける', stickVis && Math.hypot(pos1[0] - pos0[0], pos1[1] - pos0[1]) > 0.3, JSON.stringify([pos0, pos1]));
    const y0 = await ev(p, () => MZ.state.player.yaw);
    await touch('touchStart', w * 0.7, h * 0.3); await touch('touchMove', w * 0.7 + 60, h * 0.3); await p.waitForTimeout(300); await touch('touchEnd');
    ok(name + '：右側をなぞって見回せる', Math.abs((await ev(p, () => MZ.state.player.yaw)) - y0) > 0.1);
    /* たたく */
    await ev(p, () => { const s = MZ.state.player, nd = TT.nearest(['bush'], s.x, s.z); TT.goto(nd); MZ.player.updateAim(); window.__g0 = MZ.state.inv.grass; });
    const bb = await ev(p, () => { const r = document.querySelector('#bHit').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await touch('touchStart', bb[0], bb[1]); await p.waitForTimeout(900); await touch('touchEnd');
    ok(name + '：「たたく」ボタンで採集できる', (await ev(p, () => MZ.state.inv.grass)) > (await ev(p, () => window.__g0)));
    await ev(p, () => { const s = MZ.state.player; s.x = 12; s.z = -34; s.yaw = -0.15; s.pitch = 0.18; }); await p.waitForTimeout(700); await frames(p, 3);
    await p.screenshot({ path: OUT + name + '-play.png' });
    /* 建築中のボタン */
    await ev(p, () => { MZ.state.inv.log += 0; TT.ensureCost(MZ.BUILDS.house.cost); MZ.startBuild('house'); }); await p.waitForTimeout(700); await frames(p, 3);
    await p.screenshot({ path: OUT + name + '-building.png' });
    const ov = await ev(p, () => {
      const ids = ['#bPlace', '#bRot', '#bCancel', '#bBag', '#bView', '#goal', '#pop', '#hint'], R = {};
      ids.forEach(i => { const e = document.querySelector(i); if (e && getComputedStyle(e).display !== 'none' && !e.hidden) { const r = e.getBoundingClientRect(); R[i] = [r.left, r.top, r.right, r.bottom]; } });
      const bad = [], k = Object.keys(R);
      for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = R[k[i]], b = R[k[j]]; if (a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]) bad.push(k[i] + '×' + k[j]); }
      const out = k.filter(i => R[i][0] < -1 || R[i][2] > innerWidth + 1 || R[i][3] > innerHeight + 1);
      return { bad, out, n: k.length };
    });
    ok(name + '：建築中のボタン・表示が重ならず、はみ出さない', ov.bad.length === 0 && ov.out.length === 0 && ov.n >= 6, JSON.stringify(ov));
    await ev(p, () => MZ.cancelBuild());
    await p.click('#bBag'); await p.waitForTimeout(400);
    const tabs = await ev(p, () => { const bs = [...document.querySelectorAll('#tabs button')], t = document.querySelector('#tabs'); return { n: bs.length, tops: new Set(bs.map(b => b.offsetTop)).size, fit: t.scrollWidth <= t.clientWidth + 1, clip: bs.every(b => b.scrollWidth <= b.clientWidth + 1) }; });
    ok(name + '：タブ ' + tabs.n + ' つが 1 行に収まる（文字が切れない）', tabs.n === 6 && tabs.tops === 1 && tabs.fit && tabs.clip, JSON.stringify(tabs));
    await p.click('#tabs button[data-tab=work]'); await p.waitForTimeout(300);
    await p.screenshot({ path: OUT + name + '-panel-work.png' });
    /* 土地タブ：地図（左）と材料の表（右）が 1 画面に収まり、スクロールが要らない。東の区画をえらぶと表が出る */
    await ev(p, () => { MZ.ui.landSel = '1,0'; }); await p.click('#tabs button[data-tab=land]'); await p.waitForTimeout(300);
    const lt = await ev(p, () => { const b = document.querySelector('#pbody'), m = document.querySelector('.lmap'), d = document.querySelector('.ld'); const mr = m.getBoundingClientRect(), dr = d.getBoundingClientRect(), br = b.getBoundingClientRect(); return { scroll: b.scrollHeight - b.clientHeight, cells: document.querySelectorAll('.lc').length, side: dr.left >= mr.right - 1, inside: dr.bottom <= br.bottom + 1 && mr.bottom <= br.bottom + 1, clip: [...document.querySelectorAll('.lc')].every(c => c.scrollWidth <= c.clientWidth + 1) }; });
    ok(name + '：土地タブの地図 ' + lt.cells + ' マスと材料の表が 1 画面に収まる（スクロール不要・文字が切れない）', lt.cells === 9 && lt.scroll <= 1 && lt.side && lt.inside && lt.clip, JSON.stringify(lt));
    await p.screenshot({ path: OUT + name + '-panel-land.png' });
    await p.click('#tabs button[data-tab=build]'); await p.waitForTimeout(300);
    const pn = await ev(p, () => { const r = document.querySelector('#panel').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, iw: innerWidth, ih: innerHeight }; });
    const portrait = h > w;
    ok(name + (portrait ? '：縦持ちはパネルが下半分' : '：横持ちはパネルが右側'), portrait ? (Math.abs(pn.t - pn.ih / 2) < 2 && pn.w >= pn.iw - 1) : (pn.l > pn.iw * 0.5 && pn.h >= pn.ih - 1), JSON.stringify(pn));
    const hidden = await ev(p, () => ['#bHit', '#bPlace', '#bRot', '#bCancel'].every(i => getComputedStyle(document.querySelector(i)).display === 'none'));
    ok(name + '：パネルを開くと丸いボタンは隠れる', hidden);
    await p.screenshot({ path: OUT + name + '-panel-build.png' });
    await p.click('#tabs button[data-tab=mat]'); await p.waitForTimeout(300);
    await p.screenshot({ path: OUT + name + '-panel-mat.png' });
    const clip = await ev(p, () => { const b = document.querySelector('#pbody'); return b.scrollWidth <= b.clientWidth + 1; });
    ok(name + '：パネルの文字が横にはみ出さない', clip);
    await mc.close();
  };
  await mobile('m-portrait', 390, 780);
  await mobile('m-landscape', 780, 390);

  }
  await br.close();
  ok('コンソールのエラー・警告が 0', errs.length === 0, errs.slice(0, 5).join(' | '));
  const bad = results.filter(r => !r.ok);
  console.log('\n区切りごとの件数：' + Object.keys(counts).sort().map(k => k + '＝' + counts[k]).join('　') + '（引数 ' + (PART || 'なし＝全部') + '）');
  console.log((results.length - bad.length) + ' / ' + results.length + ' 通った');
  if (bad.length) { console.log('通らなかった：'); bad.forEach(b => console.log(' - ' + b.name + ' ' + b.detail)); process.exitCode = 1; }
})().catch(e => { console.error('テスト中のエラー', e); process.exit(2); });

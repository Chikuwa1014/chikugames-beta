/* 荒野開拓記（仮） 確かめ用スクリプト（dev フォルダは .assetsignore で公開されない）
   使い方：リポジトリ直下で `python3 -m http.server 8000` を動かしてから
     node machizukuri/dev/test.cjs [スクリーンショットを置く場所]
   Playwright の Chromium は WebGL のために --use-gl=angle --use-angle=swiftshader を付ける（FPS は 2〜3。速さは見ない）。
   ゲームの中は window.MZ の関数（MZ.hit・MZ.craft・MZ.place・MZ.remove・MZ.tick）で進める。 */
const { chromium } = require('playwright');
const path = require('path');
const ARGS = process.argv.slice(2), PART = +(ARGS.find(a => /^[1-4]$/.test(a)) || 0), DIR = ARGS.find(a => !/^[1-4]$/.test(a));
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
  ok('石のつるはしで鉄の鉱脈（10 回・鉄鉱石 2）', ironHits[0] === 10 && ironHits[1] === 2, ironHits);
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
  ok('つぎの目標が最後の 1 行まで進む', lastGoal.includes('今の版'), lastGoal);

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
  ok('保存の形：game・v・at・data.land・data.chunks["0,0"].layers.ground/under/over', bj.game === 'machizukuri' && bj.v === 2 && Array.isArray(bj.data.land) && bj.data.land[0] === '0,0' && typeof bj.at === 'string' && Array.isArray(bj.data.chunks['0,0'].layers.ground) && Array.isArray(bj.data.chunks['0,0'].layers.under) && Array.isArray(bj.data.chunks['0,0'].layers.over) && typeof bj.data.chunks['0,0'].taken === 'object' && bj.data.player && bj.data.inv && bj.data.tools && bj.data.timers, Object.keys(bj.data).join(','));
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
    pg.on('pageerror', e => list.push('pageerror ' + e.message));
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
      out.two = l.status === 'ok' && l.state.land.join('|') === '0,0|1,0' && g1.length === 1 && g1[0].id === 700 && g1[0].mk === 'log' && g0.some(x => x.id === 702 && !('mk' in x)) && !g0.some(x => x.id === 703) && JSON.stringify(l.state.chunks['1,0'].taken) === '{"3":5}' && l.state.nextId >= 703;
      /* 小屋を先に調べる：小屋と重なる建物が配列の前にあっても、小屋が残る */
      b = JSON.parse(raw); b.data.chunks['0,0'].layers.ground.unshift({ id: 800, t: 'road', x: 59, z: 59, r: 0 });
      l = load(b); out.hutFirst = l.status === 'ok' && l.state.chunks['0,0'].layers.ground.some(x => x.t === 'hut') && !l.state.chunks['0,0'].layers.ground.some(x => x.id === 800);
      /* 場所は持っている区画の中へ（"0,0" だけなら ±119.5。広げた区画ならその中） */
      b = JSON.parse(raw); b.data.player.x = 500; b.data.player.z = -500; l = load(b); out.clamp1 = [l.state.player.x, l.state.player.z];
      b.data.land = ['0,0', '1,0']; b.data.player.z = -50; l = load(b); out.clamp2 = [l.state.player.x, l.state.player.z];
      localStorage.setItem('machizukuri-save', raw);
      return out;
    });
    ok('保存の形が版 2：v === 2、data.land が ["0,0"]', r.v === 2 && r.vland.join() === '0,0', JSON.stringify([r.v, r.vland]));
    ok('版 2 の行き来：保存 → 読み直し → MZ.state の JSON が同じ', r.roundTrip === true);
    ok('持っていない区画は捨てる：land に無い "1,0"（建物入り）は読むと無い', r.dropChunk === true);
    ok('land：範囲の外・書式がちがう物・重なりは捨てる', r.dropLand === true, JSON.stringify(r.dropLand));
    ok('land に "0,0" が無い・land が無いと壊れている扱い', r.noOrigin === 'broken' && r.noLand === 'broken', JSON.stringify([r.noOrigin, r.noLand]));
    ok('land は "0,0" を先頭に並べる', r.order === true);
    ok('持っている区画なら建物・taken を残し、mk は ITEMS の物だけ残す。区画の外へはみ出す建物は捨てる', r.two === true);
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
      return { cap, before, popAfter, logAfter, road, hit, gone, grass: MZ.state.inv.grass - g0, v: box.v, again: l.status === 'ok' && JSON.stringify(l.state) === cur, land: box.data.land, jobs: Object.keys(MZ.state.timers.jobs).length };
    });
    ok('版 1 の見本（' + fx + '）：そのまま遊べる（MZ.tick で人口が上限まで動き仕事場が動く・道が置ける・物がたたける）', pl.popAfter === pl.cap && pl.logAfter > pl.before.log && pl.road === true && pl.hit && pl.gone && pl.grass > 0 && pl.jobs >= 1, JSON.stringify(pl));
    ok('版 1 の見本（' + fx + '）：保存し直すと v が 2 になり、読み直しても同じ', pl.v === 2 && pl.again === true && pl.land.join() === '0,0', JSON.stringify([pl.v, pl.again, pl.land]));
    ok('版 1 の見本（' + fx + '）：エラー・警告が 0', a.list.length === 0, a.list.slice(0, 4).join(' | '));
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
    await a.pg.waitForFunction(() => { const bs = Object.values(MZ.town.meshes); return bs.length >= 4 && bs.every(o => o.inst[0] && !o.inst[0].isDisposed() && o.inst[0].sourceMesh.getLODLevels().length === 2); }, null, { timeout: 120000, polling: 500 }).catch(() => { });
    const twait = Date.now() - tw0;   // LOD が全部付くまでの待ち（ms）
    const bd = await ev(a.pg, () => {
      const bs = Object.values(MZ.town.meshes), out = bs.map(o => {
        const m = o.inst[0], lv = m && !m.isDisposed() ? m.sourceMesh.getLODLevels() : [];
        return { k: o.key, n: o.inst.length, disposed: o.inst.some(i => i.isDisposed()), lod: lv.length, farCode: lv.length ? lv[0].mesh === MZ.getModel(o.key) : null };
      });
      return { out, tris: MZ.gfx.tris() };
    });
    ok('高→低→高のあと、建物が全部描かれる（遠く用も GLB で付け直されている）', bd.out.length >= 4 && bd.out.every(o => o.n >= 1 && !o.disposed && o.lod === 2 && o.farCode === false), 'LOD が付くまで ' + twait + 'ms ' + JSON.stringify(bd));
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

  }
  if (want(4)) {
  cur = 4;
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
    ok('草の株の数が作りかえる前と同じ（低 2,200・中 8,000・高 21,000）', grs.low === 2200 && grs.mid === 8000 && grs.high === 21000, JSON.stringify(grs));
    ok('三角形が作りかえる前（低 288,326・中 894,388・高 1,624,632）の ±1% 以内', ['low:288326', 'mid:894388', 'high:1624632'].every(t => { const [q, v] = t.split(':'); return Math.abs(tr[q] - +v) <= +v * 0.01; }), JSON.stringify(tr));
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
      const o = Object.values(MZ.town.meshes).find(m => m.key === 'bench'), src = o.inst[0].sourceMesh, lod = src.getLODLevels();
      return { src: MZ.gfx.look('bench').src, inst: o.inst.length, tris: Math.round(src.getTotalIndices() / 3), lod: lod.length };
    });
    ok('作業台が GLB で出る（LOD は近く用→遠く用→見えなくなる）', r.src === 'glb' && r.inst >= 1 && r.tris > 10000 && r.lod === 2, JSON.stringify(r));
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

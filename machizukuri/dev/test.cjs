/* 荒野開拓記（仮） 確かめ用スクリプト（dev フォルダは .assetsignore で公開されない）
   使い方：リポジトリ直下で `python3 -m http.server 8000` を動かしてから
     node machizukuri/dev/test.cjs [スクリーンショットを置く場所]
   Playwright の Chromium は WebGL のために --use-gl=angle --use-angle=swiftshader を付ける（FPS は 2〜3。速さは見ない）。
   ゲームの中は window.MZ の関数（MZ.hit・MZ.craft・MZ.place・MZ.remove・MZ.tick）で進める。 */
const { chromium } = require('playwright');
const path = require('path');
const OUT = (process.argv[2] || path.join(require('os').tmpdir(), 'machizukuri-shots')) + '/';
require('fs').mkdirSync(OUT, { recursive: true });
const URL = process.env.URL || 'http://localhost:8000/machizukuri/';
const results = [], errs = [];
const ok = (name, cond, detail) => { results.push({ name, ok: !!cond, detail: detail === undefined ? '' : String(detail) }); console.log((cond ? '通った  ' : '通らない') + ' ' + name + (detail !== undefined ? '  [' + detail + ']' : '')); };

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
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const watch = page => {
    page.on('pageerror', e => errs.push('pageerror ' + e.message));
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()); });
  };
  const ev = (page, f, a) => page.evaluate(f, a);
  const frames = (page, n) => page.evaluate(n => new Promise(r => { let i = 0; const f = () => { if (++i >= n) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), n || 3);

  /* ================= PC ================= */
  const ctx = await br.newContext({ viewport: { width: 1200, height: 750 } });
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
  ok('描く呼び出し（active メッシュ）が種類の数ぐらい', st.activeMeshes < 45 && st.nodes === 444, JSON.stringify(st));
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
  await page.waitForTimeout(500);
  ok('道につながらない家は数えず、HUD に出る', un.ok && un.unc === 1 && un.cap === 10 && (await page.textContent('#pop')).includes('つながっていない家がある'), JSON.stringify(un));
  const rm = await ev(page, () => {
    const L = MZ.state.chunks['0,0'].layers.ground, b = L.find(x => x.x === 80 && x.z === 70), before = Object.assign({}, MZ.state.inv), c = MZ.BUILDS.house.cost;
    const removed = MZ.remove(b.id); const after = MZ.state.inv;
    return { removed, okAll: Object.keys(c).every(k => after[k] - before[k] === Math.floor(c[k] / 2)), still: L.some(x => x.id === b.id), owner: MZ.world.owner[70 * 120 + 80] };
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
  const before = await ev(page, () => { MZ.saveNow(); const raw = localStorage.getItem('machizukuri-save'); return raw; });
  const bj = JSON.parse(before);
  ok('保存の形：game・v・at・data.chunks["0,0"].layers.ground/under/over', bj.game === 'machizukuri' && bj.v === 1 && typeof bj.at === 'string' && Array.isArray(bj.data.chunks['0,0'].layers.ground) && Array.isArray(bj.data.chunks['0,0'].layers.under) && Array.isArray(bj.data.chunks['0,0'].layers.over) && typeof bj.data.chunks['0,0'].taken === 'object' && bj.data.player && bj.data.inv && bj.data.tools && bj.data.timers, Object.keys(bj.data).join(','));
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

  /* ================= スマホ ================= */
  const saved = before;
  const mobile = async (name, w, h) => {
    const mc = await br.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
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

  await br.close();
  ok('コンソールのエラー・警告が 0', errs.length === 0, errs.slice(0, 5).join(' | '));
  const bad = results.filter(r => !r.ok);
  console.log('\n' + (results.length - bad.length) + ' / ' + results.length + ' 通った');
  if (bad.length) { console.log('通らなかった：'); bad.forEach(b => console.log(' - ' + b.name + ' ' + b.detail)); process.exitCode = 1; }
})().catch(e => { console.error('テスト中のエラー', e); process.exit(2); });

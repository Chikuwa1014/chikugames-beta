"""やすにゃんこんにゃん！散歩チュウ の動作テスト（手元のサーバーでスマホ幅と PC 幅のスクリーンショットを撮る）

使い方（β リポジトリのルートで）:
    python3 yasunyan-sanpo/dev/test.py            # 一通り（タイトル→各区間→ゴール→結果→図鑑）
    python3 yasunyan-sanpo/dev/test.py quick      # タイトルと区間だけ
スクリーンショットは dev/shots/ に出る（公開されない）。
"""
import sys, os, threading, http.server, socketserver, functools, time
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(os.path.dirname(__file__), 'shots'); os.makedirs(OUT, exist_ok=True)
quick = len(sys.argv) > 1 and sys.argv[1] == 'quick'

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
Handler = functools.partial(Q, directory=ROOT)
srv = socketserver.TCPServer(('127.0.0.1', 0), Handler); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{port}/yasunyan-sanpo/index.html'

BOT = """
window.__bot = setInterval(() => {
  if (state !== 'play') return;
  for (const o of WORLD.obs) { const dx = o.x - P.x; if (dx > 18 && dx < 62 && P.y <= 0) { press(); setTimeout(release, 380); break; } }
}, 16);
"""
errors = []
def mk(p, w, h, name):
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=2 if w < 600 else 1)
    pg.on('console', lambda m: errors.append(f'[{name}] {m.type}: {m.text}') if m.type in ('error', 'warning') and 'ERR_TUNNEL' not in m.text and 'Failed to load resource' not in m.text else None)
    pg.on('pageerror', lambda e: errors.append(f'[{name}] pageerror: {e}'))
    return b, pg

with sync_playwright() as p:
    for (w, h, tag) in [(390, 844, 'sp'), (1280, 800, 'pc')]:
        b, pg = mk(p, w, h, tag)
        pg.goto(URL); pg.wait_for_timeout(1500)
        pg.screenshot(path=f'{OUT}/{tag}-title.png')
        pg.click('#btnStart'); pg.wait_for_timeout(300)
        pg.evaluate(BOT)
        pg.wait_for_timeout(1500); pg.screenshot(path=f'{OUT}/{tag}-play0.png')
        # --- 一時停止：止まる・再開・リスタート・スタート画面へ戻る・デバッグ欄 ---
        pg.evaluate("clearInterval(window.__bot)")
        pg.click('#btnPause'); pg.wait_for_timeout(300)
        x0, t0 = pg.evaluate("[P.x, T]"); pg.wait_for_timeout(700)
        x1, t1 = pg.evaluate("[P.x, T]")
        assert x0 == x1 and t0 == t1, ('paused but moving', x0, x1, t0, t1)
        pg.screenshot(path=f'{OUT}/{tag}-pause.png')
        pg.fill('#pdbg textarea', 'ここでジャンプ w できない'); pg.keyboard.press('Space')   # メモに打った文字・スペースでジャンプしない
        assert pg.evaluate("P.y") == 0 and pg.evaluate("paused")
        pg.click('#pdbg button'); pg.wait_for_timeout(800)
        print('debug send:', pg.evaluate("document.querySelector('#pdbg').innerText.replace(/\\n/g,' / ').slice(-90)"), '| log:', pg.evaluate("CG.debug.log.length"))
        pg.screenshot(path=f'{OUT}/{tag}-pause-debug.png')
        pg.click('#btnResume'); pg.wait_for_timeout(600)
        assert pg.evaluate("!paused && P.x") > x1, 'resume failed'
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200); assert pg.evaluate("paused"); pg.keyboard.press('Escape'); pg.wait_for_timeout(200); assert not pg.evaluate("paused")
        pg.click('#btnPause'); pg.click('#btnRestart'); pg.wait_for_timeout(400)
        assert pg.evaluate("state") == 'play' and pg.evaluate("P.x") < 300 and pg.evaluate("pts") == 0, 'restart failed'
        pg.click('#btnPause'); pg.click('#btnQuit'); pg.wait_for_timeout(300)
        assert pg.evaluate("state") == 'title' and not pg.evaluate("document.querySelector('#title').hidden") is True, 'quit failed'
        print('pause ok', tag, pg.evaluate("Snd.bgmOn"))
        # データ初期化（デバッグ）：1 回目は確認表示だけ、2 回目で消えて読みこみなおす
        pg.evaluate("SAVE.coin = 777; SAVE.names = {'f:af1': 'てすと'}; writeSave()")
        # タイトルから：タップだけでは消えない／短い長押しでも消えない／2 秒長押しで消える
        pg.click('#btnWipeT'); pg.wait_for_timeout(200)
        box = pg.locator('#wHold').bounding_box(); cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
        pg.mouse.move(cx, cy); pg.mouse.down(); pg.wait_for_timeout(900); pg.mouse.up(); pg.wait_for_timeout(300)
        assert pg.evaluate("SAVE.coin") == 777, 'short hold must not wipe'
        pg.mouse.move(cx, cy); pg.mouse.down(); pg.wait_for_timeout(2600)
        pg.wait_for_timeout(1200)
        assert pg.evaluate("[SAVE.coin, Object.keys(SAVE.names).length, SAVE.plays]") == [0, 0, 0], 'wipe'
        pg.mouse.up()
        print('wipe ok')
        pg.click('#btnStart'); pg.wait_for_timeout(300); pg.evaluate(BOT)
        for i, nm in enumerate(['stall', 'shop', 'park', 'shrine', 'back']):
            pg.evaluate(f"P.x = CFG.sectionLen*{i} + 400; banner.t = 0.5; banner.txt = STY[{i}%4].name; pg_ok = true")
            pg.wait_for_timeout(900); pg.screenshot(path=f'{OUT}/{tag}-sec{i}.png')
        if quick and tag == 'sp':
            b.close(); continue
        if tag == 'sp':
            # ゴールまで: ランクごとの結果を撮る
            for (pt, label) in [(120, 'D'), (400, 'C'), (600, 'B'), (800, 'A'), (800, 'S')]:
                pg.evaluate(f"""startRun(); clearInterval(window.__bot);
                  if ('{label}' === 'S') CFG.sChance = 1; else CFG.sChance = 0;
                  got = {{chikuwa: 6, tamago: 2, nanami: 1}}; pts = {pt}; P.x = WORLD.goalX - 130""")
                pg.evaluate(BOT)
                pg.wait_for_timeout(1700); pg.screenshot(path=f'{OUT}/{tag}-goal-eat-{label}.png')
                pg.wait_for_timeout(2200); pg.screenshot(path=f'{OUT}/{tag}-goal-shine-{label}.png')
                pg.wait_for_timeout(1800); pg.screenshot(path=f'{OUT}/{tag}-goal-reveal-{label}.png')
                pg.wait_for_timeout(2500); pg.screenshot(path=f'{OUT}/{tag}-result-{label}.png')
                st = pg.evaluate("[state, G_.rank, G_.key, G_.ok]")
                print(label, st)
            # 名前づけ：はじめて出た子には自動でダイアログ → 🎲 → 決定
            pg.evaluate("showTitle()"); pg.evaluate("setGender('f'); SAVE.names = {}; startRun(); clearInterval(window.__bot); CFG.sChance = 0; got = {chikuwa: 6}; pts = 400; P.x = WORLD.goalX - 130")
            pg.wait_for_timeout(8200); pg.screenshot(path=f'{OUT}/{tag}-naming.png')
            assert pg.evaluate("!document.querySelector('#modal').hidden && !!document.querySelector('#nmIn')"), 'naming dialog'
            assert pg.evaluate("document.querySelector('#nmIn').value === NAMES[G_.ch] && !document.querySelector('#rName').textContent.includes(NAMES[G_.ch])"), 'default name only in input'
            pg.click('#nmDice'); nm = pg.evaluate("document.querySelector('#nmIn').value"); assert nm, 'dice'
            pg.click('#nmOk'); pg.wait_for_timeout(300)
            assert pg.evaluate("document.querySelector('#rName').textContent.includes(%r)" % nm), 'name shown'
            print('named:', nm)
            pg.click('#btnZukan2'); pg.wait_for_timeout(500); pg.screenshot(path=f'{OUT}/{tag}-zukan.png')
            pg.click('#btnZclose'); pg.click('#btnShare'); pg.wait_for_timeout(300); pg.screenshot(path=f'{OUT}/{tag}-share.png')
            # --- おでん恋ン・食べる数・歩く速さ・能力 ---
            pg.evaluate("document.querySelector('#modal').hidden = true; showTitle()"); pg.wait_for_timeout(200)
            def speed(pt):
                return pg.evaluate(f"""(() => {{ startRun(); clearInterval(window.__bot); pts = {pt}; WORLD.obs = []; WORLD.items = [];
                  const x0 = P.x; return new Promise(r => setTimeout(() => r((P.x - x0) / 1.0), 1000)); }})()""")
            v0, v1 = speed(0), speed(1060)
            print('speed px/s: 0pt', round(v0), '1060pt', round(v1)); assert 125 < v0 < 135 and 165 < v1 < 175, 'speed bonus'
            for (pt, want) in [(120, 3), (400, 8), (800, 16), (1060, 22), (1500, 24)]:
                pg.evaluate(f"startRun(); clearInterval(window.__bot); got = {{chikuwa: 3, tamago: 1}}; pts = {pt}; P.x = WORLD.goalX - 130"); pg.wait_for_timeout(300)
                n = pg.evaluate("G_ ? G_.eat.length : -1"); print('eat', pt, n, 'iv', pg.evaluate("G_ ? +G_.iv.toFixed(3) : 0")); assert n == want, ('eat count', pt, n, want)
            coin0 = pg.evaluate("SAVE.coin")
            pg.evaluate("startRun(); clearInterval(window.__bot); CFG.sChance = 0; got = {chikuwa: 6}; pts = 800; P.x = WORLD.goalX - 130"); pg.wait_for_timeout(9500)
            c1 = pg.evaluate("SAVE.coin"); print('coin', coin0, '->', c1, pg.evaluate("document.querySelector('#rCoin').innerText"))
            assert c1 - coin0 == 1300, 'coin gain A = 800 + 500'
            pg.screenshot(path=f'{OUT}/{tag}-result-coin.png')
            pg.evaluate("document.querySelector('#modal').hidden = true"); pg.click('#btnTop'); pg.wait_for_timeout(300)
            pg.evaluate("SAVE.coin = 100000; SAVE.abil = {}; writeSave(); refreshTitle()")
            pg.click('#btnAbil'); pg.wait_for_timeout(300); pg.screenshot(path=f'{OUT}/{tag}-abil.png')
            pg.click('#abBody button[data-a=dj]'); pg.wait_for_timeout(200)
            assert pg.evaluate("abLv('dj')") == 1 and pg.evaluate("SAVE.coin") == 98000, 'buy dj'
            pg.click('#abBody button[data-a=mag]'); pg.click('#abBody button[data-a=mag]'); pg.click('#abBody button[data-a=mag]')
            pg.click('#abBody button[data-a=inv]'); pg.click('#abBody button[data-a=grd]'); pg.click('#abBody button[data-a=lucky]')
            print('abil:', pg.evaluate("JSON.stringify(SAVE.abil)"), 'coin', pg.evaluate("SAVE.coin")); pg.screenshot(path=f'{OUT}/{tag}-abil2.png')
            pg.click('#btnAclose')
            def apex(hold1, second, hold2, dj):
                return pg.evaluate(f"""new Promise(res => {{ startRun(); clearInterval(window.__bot); WORLD.obs = []; WORLD.items = []; SAVE.abil.dj = {1 if dj else 0};
                  let m = 0; const iv = setInterval(() => {{ m = Math.max(m, P.y); }}, 4);
                  press(); setTimeout(release, {hold1});
                  {"setTimeout(() => {press(); setTimeout(release, %d)}, 330);" % hold2 if second else ""}
                  setTimeout(() => {{ clearInterval(iv); res(Math.round(m)); }}, 1500); }})""")
            a1, a2, a3, a4 = apex(40, False, 0, True), apex(300, False, 0, True), apex(40, True, 40, True), apex(40, True, 300, True)
            a5 = apex(40, True, 40, False)
            print('apex single tap', a1, 'single hold', a2, 'tap+tap', a3, 'tap+hold', a4, 'tap+tap w/o ability', a5)
            assert a2 > a1 + 30 and a3 > a1 + 60 and a4 > a3 + 20 and abs(a5 - a1) <= 8, 'double jump / hold height'
            # 吸い寄せ（おいしいものは寄る・減点は寄らない）
            r = pg.evaluate("""new Promise(res => { startRun(); clearInterval(window.__bot); WORLD.obs = [];
              WORLD.items = [{k:'chikuwa', x:P.x+100, y:60, got:false, ph:0}, {k:'nanami', x:P.x+100, y:60, got:false, ph:0}];
              const a = WORLD.items[0], b = WORLD.items[1], ax = a.x, bx = b.x; setTimeout(() => res([a.x < ax - 20 || a.got, b.x === bx]), 400); })""")
            print('magnet:', r); assert r[0] and r[1], 'magnet'
            pg.evaluate("showTitle()")
            # --- 性別・男性のキャラ・図鑑の男女別・お気に入り・会話 ---
            pg.evaluate("document.querySelector('#modal').hidden = true; showTitle()"); pg.wait_for_timeout(300)
            pg.click('#gM'); pg.wait_for_timeout(400); pg.screenshot(path=f'{OUT}/{tag}-title-m.png')
            pg.click('#gF'); pg.wait_for_timeout(200)
            # ボタンが絵（足もと y=505 から上へ約 66px）とかぶらない：スタートの下端 < 430、そのほかのボタンの上端 > 506
            geo = pg.evaluate("""(() => { const st = document.querySelector('#stage').getBoundingClientRect(), s = st.width / 360;
              const r = e => { const b = document.querySelector(e).getBoundingClientRect(); return [Math.round((b.top - st.top) / s), Math.round((b.bottom - st.top) / s)]; };
              return { start: r('#btnStart'), seg: r('#gseg'), zukan: r('#btnZukan'), how: r('#btnHow'), best: r('#bestline') }; })()""")
            print('title geo (stage px):', geo)
            assert geo['start'][1] < 430 and geo['zukan'][0] > 506, 'title buttons overlap the characters'
            for (gd, label) in [('m', 'A'), ('m', 'S'), ('f', 'A'), ('m', 'B')]:
                pg.evaluate(f"""setGender('{gd}'); startRun(); clearInterval(window.__bot);
                  CFG.sChance = {1 if label == 'S' else 0};
                  got = {{chikuwa: 6, tamago: 2}}; pts = {800 if label in 'AS' else 600}; P.x = WORLD.goalX - 130""")
                pg.wait_for_timeout(7800); pg.screenshot(path=f'{OUT}/{tag}-result-{gd}-{label}.png')
                print(gd, label, pg.evaluate("[state, G_.rank, G_.key, G_.ok, G_.img.naturalWidth + 'x' + G_.img.naturalHeight]"))
            pg.wait_for_timeout(1200); pg.evaluate("document.querySelector('#modal').hidden = true"); pg.click('#btnZukan2'); pg.wait_for_timeout(600); pg.screenshot(path=f'{OUT}/{tag}-zukan-m.png')
            pg.click('#zF'); pg.wait_for_timeout(300); pg.screenshot(path=f'{OUT}/{tag}-zukan-f.png')
            pg.click('#zM'); pg.wait_for_timeout(200)
            pg.click('#zbody .slot[data-k]'); pg.wait_for_timeout(400); pg.screenshot(path=f'{OUT}/{tag}-detail.png')
            pg.click('#dFav'); pg.wait_for_timeout(300)
            print('fav:', pg.evaluate("SAVE.fav"))
            pg.evaluate("SAVE.coin = 20000; writeSave()")
            pg.click('#zbody .slot.fav'); pg.wait_for_timeout(300); pg.click('#dTalk'); pg.wait_for_timeout(500)
            pg.screenshot(path=f'{OUT}/{tag}-meet-confirm.png')
            c0 = pg.evaluate("SAVE.coin"); pg.click('#mGo'); pg.wait_for_timeout(900)
            assert pg.evaluate("SAVE.coin") == c0 - 1500 and pg.evaluate("state") == 'talk', 'entrance fee'
            pg.screenshot(path=f'{OUT}/{tag}-talk0.png')
            pg.click('#tChoices button:nth-child(1)'); pg.wait_for_timeout(300)   # 話す
            pg.click('#tChoices button:nth-child(1)'); pg.wait_for_timeout(300); pg.screenshot(path=f'{OUT}/{tag}-talk1.png')
            pg.click('#tChoices button:nth-child(1)'); pg.wait_for_timeout(300)   # つづける
            pg.click('#tChoices button:nth-child(2)'); pg.wait_for_timeout(300)   # 食事を頼む
            c1 = pg.evaluate("SAVE.coin"); pg.click('#tChoices button:nth-child(1)'); pg.wait_for_timeout(300)
            assert pg.evaluate("SAVE.coin") == c1 - 300, 'food price'
            pg.click('#tChoices button:nth-child(1)'); pg.wait_for_timeout(300)
            pg.click('#tChoices button:nth-child(3)'); pg.wait_for_timeout(300)   # チェキ
            pg.click('#tChoices button:nth-child(2)'); pg.wait_for_timeout(500)   # ソロコメント付き
            pg.screenshot(path=f'{OUT}/{tag}-cheki.png')
            assert pg.evaluate("!!document.querySelector('#chDl') && document.querySelector('#chDl').href.startsWith('data:image/png')"), 'cheki'
            pg.click('#mClose'); pg.wait_for_timeout(200)
            print('meet:', pg.evaluate("[state, TK.used, TK.maxT, SAVE.rel[TK.rk].love, SAVE.rel[TK.rk].spent, SAVE.cheki]"))
            pg.click('#btnTback'); pg.wait_for_timeout(300)
            print('back:', pg.evaluate("[state, document.querySelector('#title').hidden]"))
            # 保存の読みもどし（お気に入り・性別・図鑑が残る）と、古い形式の図鑑キーの破棄
            pg.reload(); pg.wait_for_timeout(600)
            print('reload:', pg.evaluate("[SAVE.gender, SAVE.fav, Object.keys(SAVE.seen).length]"))
        b.close()
    # 実際に遊んで最後までたどり着けるか（ボット。時間短縮のため速度を上げる）
    if not quick:
        b, pg = mk(p, 390, 844, 'run')
        pg.goto(URL); pg.wait_for_timeout(800); pg.click('#btnStart'); pg.evaluate("CFG.speed = 520"); pg.evaluate(BOT.replace('dx < 62', 'dx < 150').replace('dx > 18', 'dx > 60'))
        for _ in range(80):
            pg.wait_for_timeout(500)
            if pg.evaluate("state") != 'play': break
        print('run:', pg.evaluate("[state, pts, Object.keys(got).length, P.x|0, WORLD.goalX]"))
        pg.wait_for_timeout(9000); print('after:', pg.evaluate("state"))
        b.close()
srv.shutdown()
print('errors:', len(errors)); [print(e) for e in errors[:20]]

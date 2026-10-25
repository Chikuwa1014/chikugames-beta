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
            pg.click('#btnZukan2'); pg.wait_for_timeout(500); pg.screenshot(path=f'{OUT}/{tag}-zukan.png')
            pg.click('#btnZclose'); pg.click('#btnShare'); pg.wait_for_timeout(300); pg.screenshot(path=f'{OUT}/{tag}-share.png')
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
            pg.click('#btnZukan2'); pg.wait_for_timeout(600); pg.screenshot(path=f'{OUT}/{tag}-zukan-m.png')
            pg.click('#zF'); pg.wait_for_timeout(300); pg.screenshot(path=f'{OUT}/{tag}-zukan-f.png')
            pg.click('#zM'); pg.wait_for_timeout(200)
            pg.click('#zbody .slot[data-k]'); pg.wait_for_timeout(400); pg.screenshot(path=f'{OUT}/{tag}-detail.png')
            pg.click('#dFav'); pg.wait_for_timeout(300)
            print('fav:', pg.evaluate("SAVE.fav"))
            pg.click('#zbody .slot.fav'); pg.wait_for_timeout(300); pg.click('#dTalk'); pg.wait_for_timeout(900)
            pg.screenshot(path=f'{OUT}/{tag}-talk0.png')
            for i in range(3):   # 3 往復で会話がおわる
                pg.click('#tChoices button:first-child'); pg.wait_for_timeout(500)
                pg.click('#tChoices button:first-child'); pg.wait_for_timeout(400)
                if i == 0: pg.screenshot(path=f'{OUT}/{tag}-talk1.png')
            pg.screenshot(path=f'{OUT}/{tag}-talk2.png')
            print('love:', pg.evaluate("[state, TK && TK.love, SAVE.love[SAVE.fav]]"))
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

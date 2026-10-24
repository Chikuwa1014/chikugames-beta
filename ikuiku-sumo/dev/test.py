"""いくいく！雲紅亭珍光 の自動テスト。使い方：python3 ikuiku-sumo/dev/test.py（リポジトリ直下で）
1) 完璧に押し続けて「ママに到着」になること 2) 何もしないで「トイレ→ゲームオーバー」になること
スクリーンショットは /tmp/claude-0/.../scratchpad ではなく引数で渡した場所（既定 /tmp/iku-shots）に出る"""
import sys, os, threading, http.server, socketserver, functools, time
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/iku-shots'
os.makedirs(OUT, exist_ok=True)
root = os.getcwd()
H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
H.log_message = lambda *a, **k: None
srv = socketserver.TCPServer(('127.0.0.1', 0), H); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{port}/ikuiku-sumo/index.html'

AUTO = """(jitter) => { const I = window.__IKU; window.__auto = setInterval(() => {
  const S = I.S; if (S.mode !== 'play') return; const st = I.nowSec() - S.t0;
  for (const n of S.notes) if (!n.judged && st >= n.t + jitter) { I.press(n.lane); }
}, 5); }"""

def run(p, mode, size):
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport=size); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'ERR_TUNNEL' not in m.text and 'Failed to load resource' not in m.text else None)
    pg.goto(URL); pg.wait_for_timeout(300)
    tag = f"{mode}-{size['width']}"
    pg.screenshot(path=f'{OUT}/{tag}-1title.png')
    pg.click('#startBtn'); pg.wait_for_timeout(1200)
    pg.screenshot(path=f'{OUT}/{tag}-2count.png')
    if mode == 'win':
        pg.evaluate(AUTO, 0.0)
    pg.wait_for_function("window.__IKU.S.mode==='play'", timeout=6000)
    shot = False; t0 = time.time(); final = None
    while time.time() - t0 < 90:
        m = pg.evaluate("window.__IKU.S.mode")
        if m == 'play' and not shot and time.time() - t0 > 6:
            pg.screenshot(path=f'{OUT}/{tag}-3play.png'); shot = True
        if m in ('success', 'toilet'):
            pg.wait_for_timeout(2300 if m == 'success' else 2600)
            pg.screenshot(path=f'{OUT}/{tag}-4{m}.png')
            pg.wait_for_selector('#again', timeout=8000)
            pg.screenshot(path=f'{OUT}/{tag}-5result.png')
            final = m; break
        pg.wait_for_timeout(200)
    st = pg.evaluate("(({perfect,good,leaks,judged,prog})=>({perfect,good,leaks,judged,prog}))(window.__IKU.S)")
    print(mode, size['width'], '→', final, st, 'errors:', errs)
    b.close()
    return final

with sync_playwright() as p:
    ok = run(p, 'win', {'width': 400, 'height': 800}) == 'success'
    ok &= run(p, 'idle', {'width': 400, 'height': 800}) == 'toilet'
    run(p, 'win', {'width': 1100, 'height': 800})
print('PASS' if ok else 'FAIL'); sys.exit(0 if ok else 1)

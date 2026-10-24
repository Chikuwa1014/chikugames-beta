"""いくいく！雲紅亭珍光 の自動テスト。使い方：python3 ikuiku-sumo/dev/test.py（リポジトリ直下で）
1) 完璧に押し続けて「ママに到着」になること 2) 何もしないで「トイレ→ゲームオーバー」になること
3) 難易度4種で、バーが拍の 1/2/4/8 分割の格子に乗ること＋ベリーハードも通しで成功すること
4) 20曲すべてをオフラインで鳴らし、無音・音割れ・小節数のずれが無いこと
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

def run(p, mode, size, diff='normal'):
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport=size); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'ERR_TUNNEL' not in m.text and 'Failed to load resource' not in m.text else None)
    pg.goto(URL); pg.wait_for_timeout(300)
    pg.click(f'#diffSeg button[data-diff="{diff}"]')
    tag = f"{mode}-{diff}-{size['width']}"
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
    print(mode, diff, size['width'], '→', final, st, 'song:', pg.evaluate('window.__IKU.S.song.name'), 'errors:', errs)
    b.close()
    return final if not errs else final + '(errors)'

GRID = """async (diff) => { const I = window.__IKU; I.pref.diff = diff; I.startGame();
  await new Promise(r => { const f = () => I.S.mode === 'play' ? r() : setTimeout(f, 50); f(); });
  const seen = new Map(); const t0 = I.nowSec();
  while (I.nowSec() - t0 < 9) { for (const n of I.S.notes) seen.set(n.t.toFixed(4), n.lane); await new Promise(r => setTimeout(r, 40)); }
  const g = I.S.grid, ts = [...seen.keys()].map(Number);
  const off = Math.max(...ts.map(t => Math.abs((t - I.CFG.LEAD_IN) / g - Math.round((t - I.CFG.LEAD_IN) / g))));
  return { n: ts.length, grid: g, off, sub: I.S.diff.sub, beat: 60 / I.S.song.bpm, bpm: I.S.song.bpm }; }"""

def grid_test(p):
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required']); pg = b.new_page(viewport={'width': 400, 'height': 800}); ok = True
    pg.goto(URL); pg.wait_for_timeout(300)
    for d in ['easy', 'normal', 'hard', 'vhard']:
        r = pg.evaluate(GRID, d); good = r['off'] < 1e-3 and abs(r['grid'] * r['sub'] - r['beat']) < 1e-9 and r['n'] > 3
        print('grid', d, r, 'OK' if good else 'NG'); ok &= good
        pg.evaluate("window.__IKU.S.mode='title'")
    b.close(); return ok

def songs_test(p):
    b = p.chromium.launch(); pg = b.new_page(); pg.goto(URL); pg.wait_for_timeout(300); ok = True
    for i in range(20):
        r = pg.evaluate(f'window.__IKU.renderSong({i}, 12)')
        good = r['peak'] <= 0.97 and 0.07 < r['rms'] < 0.3 and r['quiet'] == 0 and r['bars'] == r['chBars']
        if not good: print('song NG', i, r)
        ok &= good
    print('songs 20 OK' if ok else 'songs NG'); b.close(); return ok

with sync_playwright() as p:
    ok = songs_test(p) and grid_test(p)
    ok &= run(p, 'win', {'width': 400, 'height': 800}, 'vhard') == 'success'
    ok &= run(p, 'win', {'width': 400, 'height': 800}) == 'success'
    ok &= run(p, 'idle', {'width': 400, 'height': 800}) == 'toilet'
    run(p, 'win', {'width': 1100, 'height': 800})
print('PASS' if ok else 'FAIL'); sys.exit(0 if ok else 1)

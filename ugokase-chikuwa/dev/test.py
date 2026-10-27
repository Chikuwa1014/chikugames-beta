"""うごかせ！ちくわくん の動作テスト（Playwright）。
β リポジトリのルートで `python3 -m http.server 8765` を動かしてから、
`python3 ugokase-chikuwa/dev/test.py` で実行する。スクリーンショットは dev/shots/（公開しない・commit しない）。
"""
import os, sys
from playwright.sync_api import sync_playwright

URL = os.environ.get('UC_URL', 'http://localhost:8765/ugokase-chikuwa/')
OUT = os.path.join(os.path.dirname(__file__), 'shots')
os.makedirs(OUT, exist_ok=True)
errors = []


def shot(page, name):
    page.screenshot(path=os.path.join(OUT, name + '.png'))


def check(cond, msg):
    print(('OK  ' if cond else 'NG  ') + msg)
    if not cond:
        errors.append(msg)


def run(p, w, h, tag):
    exe = os.environ.get('UC_CHROME', '/opt/pw-browsers/chromium')
    b = p.chromium.launch(executable_path=exe) if os.path.exists(exe) else p.chromium.launch()
    page = b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=2)
    page.on('pageerror', lambda e: errors.append(f'{tag} pageerror: {e}'))
    page.on('console', lambda m: m.type == 'error' and 'ERR_TUNNEL' not in m.text and 'fonts' not in m.text and errors.append(f'{tag} console: {m.text}'))
    page.goto(URL)
    page.wait_for_timeout(600)
    shot(page, tag + '-01-title')
    page.click('#btnNew')
    page.wait_for_timeout(300)
    shot(page, tag + '-02-howto')
    page.click('#mClose')
    page.wait_for_timeout(300)
    shot(page, tag + '-03-game')

    # 決まった配置にして、指示書で取り場 → 出荷ヤードを往復させる
    page.evaluate('''() => {
      const G = UCT.G, b = G.bases[0];
      for (const k in b.objs) if (b.objs[k].type === 'src' || b.objs[k].type === 'yard') delete b.objs[k];
      b.coins = {};
      UC.put(b, 'src', 0, 4, 0).stock = [];
      UC.put(b, 'yard', 10, 4, 0).stock = [];
      b.coins['5,4'] = 10;
      const r = G.robots[0]; r.x = 1; r.y = 4; r.dir = 2;
      // 取り場（西）から持って、東へ進んでヤードに置き、もどる
      r.prog.main = ['hold', 'back', 'fwd', 'hold', 'back', 'fwd'];
      G.time = 9 * 60 - 1;   // 1 日目 8:59
    }''')
    page.click('#btnRun')
    page.click('#speed button[data-s="4"]')
    page.wait_for_timeout(6000)
    st = page.evaluate('() => { const G = UCT.G, b = G.bases[0], y = Object.values(b.objs).find(o => o.type === "yard"); return { yard: y.stock.length, coin: G.coin, mode: G.robots[0].mode, x: G.robots[0].x, run: G.robots[0].running, t: G.time } }')
    print(tag, st)
    check(st['mode'] == 'work', f'{tag}: 9時から勤務になる')
    check(st['yard'] >= 1, f'{tag}: 製品を出荷ヤードへ運べる')
    check(st['coin'] >= 310, f'{tag}: 歩くと恋ンを拾える')
    shot(page, tag + '-04-running')

    # BUILD 画面
    page.click('#btnBuild')
    page.wait_for_timeout(300)
    shot(page, tag + '-05-build')
    page.click('#bPal .piece[data-k="fwd"]')
    n = page.evaluate('() => UCT.G.robots[0].prog.main.length')
    check(n == 7, f'{tag}: ピースを追加できる')
    page.click('#mClose')

    # お店：コンベアを置く
    page.evaluate('() => { UCT.G.coin = 5000 }')
    page.click('#btnShop')
    page.wait_for_timeout(200)
    shot(page, tag + '-06-shop')
    page.click('button[data-a="place:belt"]')
    page.evaluate('''() => { const r = document.querySelector('#view').getBoundingClientRect(); }''')
    # 置く場所：タイル (8, 6) の画面の位置へ
    pos = page.evaluate('''() => {
      const c = UCT; const b = UCT.G.bases[0];
      const cv = document.querySelector('#view'), rc = cv.getBoundingClientRect();
      return null;
    }''')
    page.evaluate('() => { UC.put(UCT.G.bases[0], "belt", 8, 6, 0); UC.put(UCT.G.bases[0], "pool", 9, 6, 0); UC.put(UCT.G.bases[0], "sorter", 7, 6, 0); }')
    page.click('#placeEnd')

    # 休けい：12:00 でれいぞうこへ
    page.evaluate('() => { UCT.G.time = UCT.G.lastDay * 1440 + 11 * 60 + 58; }')
    page.wait_for_timeout(2500)
    st = page.evaluate('() => { const r = UCT.G.robots[0]; return { mode: r.mode, ph: r.brk && r.brk.phase, path: r.path && r.path.length } }')
    print(tag, st)
    check(st['mode'] == 'break', f'{tag}: 休けいになる')
    shot(page, tag + '-07-break')

    # シフト・かんばん・設定
    page.click('#btnShift'); page.wait_for_timeout(200); shot(page, tag + '-08-shift'); page.click('#mClose')
    page.click('#btnKanban'); page.wait_for_timeout(200); shot(page, tag + '-09-kanban'); page.click('#mClose')
    page.click('#btnSet'); page.wait_for_timeout(200); shot(page, tag + '-10-settings'); page.click('#mClose')

    # 何日か進めて、集荷が起きるか
    page.evaluate('() => { const G = UCT.G; for (let i = 0; i < 4 * 1440; i++) UC.step(G, 1); }')
    st = page.evaluate('() => { const G = UCT.G; return { log: G.bases[0].log.length, day: UC.cal(G.time).day, hp: G.robots[0].hp, mp: G.robots[0].mp } }')
    print(tag, st)
    check(st['log'] >= 3, f'{tag}: かんばんの集荷が起きる')
    page.wait_for_timeout(300)
    shot(page, tag + '-11-later')

    # 拠点を追加（L）
    page.evaluate('() => { UCT.G.coin = 99999; UC.buyBase(UCT.G, 2); UC.buyRobot(UCT.G); }')
    page.reload(); page.wait_for_timeout(400)
    page.click('#btnCont'); page.wait_for_timeout(400)
    nb = page.evaluate('() => UCT.G.bases.length')
    check(nb == 2, f'{tag}: 保存して、つづきから読める（拠点 2 つ）')
    page.click('#bases button[data-i="1"]'); page.wait_for_timeout(300)
    shot(page, tag + '-12-baseL')
    b.close()


with sync_playwright() as p:
    run(p, 390, 780, 'sp')
    if 'quick' not in sys.argv:
        run(p, 1200, 800, 'pc')

print('\n'.join(errors) if errors else 'エラーなし')
sys.exit(1 if errors else 0)

# みんなでモードの通しテスト（親1＋子3）。dev/server.mjs を起動してから実行する
#   node hayaoshi-chikupon/dev/server.mjs &
#   python3 hayaoshi-chikupon/dev/test-multi.py [スクリーンショットの出力先]
# 確かめること：参加 → お手つき → 回答許可（いろ・おと）→ いちばん速い子が回答権 → ○× → やり直し → だれも押さない → 終了 → 退出
import sys, time, os
from playwright.sync_api import sync_playwright, Page

# 複数のウィンドウを開くと、ページの中で待つ wait_for_function が止まることがある（裏にまわったページは描画・タイマーが止まる）。
# そこで、Python 側から 100ms ごとに調べる方式に置きかえる
def _wait_for_function(self, expression, timeout=30000, **kw):
    end = time.time() + timeout / 1000
    last = None
    while time.time() < end:
        try:
            if self.evaluate(expression):
                return True
        except Exception as e:
            last = e
        time.sleep(0.1)
    try:
        shown = self.evaluate("(document.querySelector('#host-panel .hp-title')||{}).innerText")
    except Exception as e:
        shown = repr(e)
    raise TimeoutError(f"wait_for_function: {expression[:90]} / 画面の文字: {shown!r} ({last})")
Page.wait_for_function = _wait_for_function

BASE = os.environ.get("BASE", "http://localhost:8787/hayaoshi-chikupon/")
OUT = sys.argv[1] if len(sys.argv) > 1 else "."
errors = []
IGNORE = ("ERR_TUNNEL", "Failed to load resource", "ERR_NAME_NOT_RESOLVED", "ERR_CONNECTION")
NAMES = ["あ子", "い子", "う子"]

def check(cond, msg):
    print(("OK  " if cond else "NG  ") + msg)
    if not cond:
        errors.append("判定失敗: " + msg)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--disable-features=WebRtcHideLocalIpsWithMdns", "--autoplay-policy=no-user-gesture-required"])

    def page(name):
        ctx = b.new_context(viewport={"width": 400, "height": 860}, device_scale_factor=1)
        ctx.add_init_script(f"localStorage.setItem('hayaoshi-chikupon-name', '{name}')")
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(f"{name}: pageerror {e}"))
        pg.on("console", lambda m: m.type == "error" and not any(s in m.text for s in IGNORE) and errors.append(f"{name}: console {m.text}"))
        return pg

    host = page("おや")
    host.goto(BASE)
    host.click('[data-go="multi"]')
    host.click('[data-cg="create"]')
    host.wait_for_selector("#host-panel:not([hidden])", timeout=8000)
    code = host.inner_text(".cg-room-num")
    print("部屋コード", code)

    guests = []
    for n in NAMES:
        g = page(n)
        g.goto(BASE + "?room=" + code)
        g.wait_for_selector("#guest-panel:not([hidden])", timeout=15000)
        guests.append(g)
    host.wait_for_function("document.querySelector('#host-panel .hp-title').innerText.includes('子 3人')", timeout=10000)
    check(True, "子3人が参加")
    host.screenshot(path=f"{OUT}/m-host-idle.png")
    guests[0].screenshot(path=f"{OUT}/m-guest-idle.png")
    check("おまちください" in guests[0].inner_text("#gpad"), "子：出題者を待つ表示")

    # ---- 第1問：い子がお手つき、あ子とう子で早押し（いろ）----
    host.click('[data-h="start"]')
    for g in guests:
        g.wait_for_selector("#gpad.quiet", timeout=5000)
    check(True, "子の画面が「よーい…」")
    guests[1].screenshot(path=f"{OUT}/m-guest-armed.png")
    guests[1].click("#gpad")   # い子：合図の前に押す → お手つき
    guests[1].wait_for_selector("#gpad.foul")
    host.wait_for_function("window.__chikupon.H.locked.size === 1", timeout=5000)
    check(True, "い子のお手つきを親が受け取った")
    host.screenshot(path=f"{OUT}/m-host-armed.png")

    host.click('[data-h="go"]', force=True)
    for g in (guests[0], guests[2]):
        g.wait_for_function("window.__chikupon.G.local && window.__chikupon.G.local.shownAt > 0", timeout=5000)
    check("go" in guests[0].get_attribute("#gpad", "class").split(), "いろの合図で子の画面が緑")
    guests[0].screenshot(path=f"{OUT}/m-guest-go.png")
    check("foul" in guests[1].get_attribute("#gpad", "class"), "お手つきの子には合図が出ても お休みのまま")
    time.sleep(0.30); guests[0].click("#gpad")    # あ子：はやい
    time.sleep(0.30); guests[2].click("#gpad")    # う子：おそい
    host.wait_for_function("window.__chikupon.H.phase === 'judge'", timeout=8000)
    w = host.evaluate("window.__chikupon.H.winner")
    print("   回答権:", w)
    check(w["name"] == "あ子", "いちばん速いあ子が回答権")
    host.wait_for_selector('[data-h="ok"]')
    host.screenshot(path=f"{OUT}/m-host-judge.png")
    guests[0].wait_for_function("document.querySelector('#gpad .pad-main').innerText.includes('回答権')", timeout=5000)
    check("あなた" in guests[0].inner_text("#gpad"), "あ子の画面：あなたが回答権")
    guests[2].wait_for_function("document.querySelector('#gpad .pad-main').innerText.includes('あ子')", timeout=5000)
    check("2位" in guests[2].inner_text("#gpad"), "う子の画面：あなたは2位")
    guests[0].screenshot(path=f"{OUT}/m-guest-win.png")
    guests[2].screenshot(path=f"{OUT}/m-guest-second.png")

    host.click('[data-h="ok"]')   # 正解
    host.wait_for_function("window.__chikupon.H.phase === 'after'")
    for g in guests:
        g.wait_for_function("window.__chikupon.G.st && window.__chikupon.G.st.phase === 'after'", timeout=5000)
    check("せいかい" in guests[0].inner_text("#gpad"), "あ子：せいかい +1点")
    check("あ子" in guests[1].inner_text("#g-score") and "1" in guests[1].inner_text("#g-score"), "得点表に反映")
    host.screenshot(path=f"{OUT}/m-host-after-ok.png")

    # ---- 第2問：おと。う子が先に押して ×、やり直しで あ子 ----
    host.click('[data-h="stim:sound"]')
    host.click('[data-h="start"]')
    for g in guests:
        g.wait_for_function("window.__chikupon.G.st && window.__chikupon.G.st.phase === 'armed' && window.__chikupon.G.st.n === 2", timeout=5000)
    check(all("quiet" in g.get_attribute("#gpad", "class").split() for g in guests), "第2問：よーい…（全員そろって）")
    host.click('[data-h="go"]', force=True)
    for g in guests:
        g.wait_for_function("window.__chikupon.G.local && window.__chikupon.G.local.shownAt > 0", timeout=5000)
    kinds = [g.evaluate("window.__chikupon.G.local.kind") for g in guests]
    print("   合図の種類:", kinds)
    check(all(k == "sound" for k in kinds), "おとの合図（音が使えない端末は color になる）") if kinds[0] != "color" else print("   （この環境では音が使えず、いろで代用）")
    check("quiet" in guests[0].get_attribute("#gpad", "class").split() or kinds[0] == "color", "おとの合図では見た目が変わらない")
    time.sleep(0.25); guests[2].click("#gpad")
    time.sleep(0.40); guests[0].click("#gpad")
    host.wait_for_function("window.__chikupon.H.phase === 'judge'", timeout=8000)
    check(host.evaluate("window.__chikupon.H.winner.name") == "う子", "う子が回答権")
    host.click('[data-h="ng"]')   # ×
    host.wait_for_function("window.__chikupon.H.phase === 'after' && window.__chikupon.H.last.kind === 'ng'")
    guests[2].wait_for_function("window.__chikupon.G.st.phase === 'after'", timeout=5000)
    check("ざんねん" in guests[2].inner_text("#gpad"), "う子：ざんねん（お休み）")
    host.click('[data-h="reopen"]')   # やり直し
    for g in guests:
        g.wait_for_function("window.__chikupon.G.st.phase === 'armed'", timeout=5000)
    check("foul" in guests[2].get_attribute("#gpad", "class"), "×の子はお休みのまま")
    host.click('[data-h="go"]', force=True)
    guests[0].wait_for_function("window.__chikupon.G.local && window.__chikupon.G.local.shownAt > 0", timeout=5000)
    time.sleep(0.25); guests[0].click("#gpad")
    host.wait_for_function("window.__chikupon.H.phase === 'judge'", timeout=8000)
    check(host.evaluate("window.__chikupon.H.winner.name") == "あ子", "やり直しで あ子が回答権")
    host.click('[data-h="ok"]')
    host.wait_for_function("window.__chikupon.H.phase === 'after'")
    sc = host.evaluate("window.__chikupon.H.last")
    scores = {s[1]["name"]: s[1]["pt"] for s in host.evaluate("[...window.__chikupon.H.scores]")}
    print("   得点:", scores)
    check(scores.get("あ子") == 2 and scores.get("う子") == 0, "あ子2点・う子0点")

    # ---- 第3問：だれも押さない ----
    host.evaluate("window.__chikupon.TUNING.openTimeout = 1200")
    host.click('[data-h="start"]')
    for g in guests:
        g.wait_for_function("window.__chikupon.G.st.phase === 'armed' && window.__chikupon.G.st.n === 3", timeout=5000)
    host.click('[data-h="go"]', force=True)
    host.wait_for_function("window.__chikupon.H.phase === 'after' && window.__chikupon.H.last.kind === 'none'", timeout=6000)
    check(True, "だれも押さなかったとき、時間で打ち切り")
    guests[0].wait_for_function("document.querySelector('#gpad .pad-main').innerText.includes('だれも')", timeout=5000)

    # ---- 終了 ----
    host.click('[data-h="finish"]')
    host.click('[data-h="finish-yes"]')
    for g in guests:
        g.wait_for_function("window.__chikupon.G.st.phase === 'end'", timeout=5000)
    check("おしまい" in guests[1].inner_text("#gpad"), "終了画面")
    check(guests[1].locator("#g-share:not([hidden])").count() == 1, "終了画面にシェアボタン")
    host.screenshot(path=f"{OUT}/m-host-end.png")
    guests[1].screenshot(path=f"{OUT}/m-guest-end.png")
    host.click('[data-h="again"]')
    guests[0].wait_for_function("window.__chikupon.G.st.phase === 'idle'", timeout=5000)
    check(True, "もういちど（点数リセット）")

    # ---- 子の退出 ----
    guests[2].click('[data-cg="leave"]')
    host.wait_for_function("document.querySelector('#host-panel .hp-title').innerText.includes('子 2人')", timeout=8000)
    check(True, "子が退出すると、親の人数が減る")
    b.close()

print("errors:", errors or "なし")
sys.exit(1 if errors else 0)

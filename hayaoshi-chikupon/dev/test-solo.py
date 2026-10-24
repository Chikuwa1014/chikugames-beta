# ひとりモードの通しテスト（3種類の合図 × 5回、お手つき、結果、ベスト記録の保存）
# 先に dev/server.mjs を起動してから実行する
#   node hayaoshi-chikupon/dev/server.mjs &
#   python3 hayaoshi-chikupon/dev/test-solo.py [スクリーンショットの出力先]
import sys, time, os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:8787/hayaoshi-chikupon/")
OUT = sys.argv[1] if len(sys.argv) > 1 else "."
errors = []
IGNORE = ("ERR_TUNNEL", "Failed to load resource", "ERR_NAME_NOT_RESOLVED", "ERR_CONNECTION")

def check(cond, msg):
    print(("OK  " if cond else "NG  ") + msg)
    if not cond:
        errors.append("判定失敗: " + msg)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    ctx = b.new_context(viewport={"width": 400, "height": 860}, device_scale_factor=1)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: m.type == "error" and not any(s in m.text for s in IGNORE) and errors.append(f"console: {m.text}"))
    pg.goto(BASE)
    check("早押し" in pg.title(), "タイトル: " + pg.title())
    check(pg.inner_text("#ver") == "β0.1.0", "版数 β0.1.0")
    pg.screenshot(path=f"{OUT}/solo-home.png")

    pg.click('[data-go="solo-select"]')
    pg.wait_for_selector("#s-solo-select:not([hidden])")
    check(pg.locator(".kind").count() == 3, "合図が3種類")
    pg.screenshot(path=f"{OUT}/solo-select.png")

    def phase():
        return pg.evaluate("window.__chikupon.S && window.__chikupon.S.phase")

    def run_kind(kind, fouls_first=True):
        print(f"--- {kind} ---")
        pg.click(f'[data-kind="{kind}"]')
        pg.wait_for_selector("#s-solo-play:not([hidden])")
        time.sleep(0.6)   # タップ直後の無視時間（betweenLock）をすぎる
        check("idle" in pg.get_attribute("#pad", "class"), "スタート待ち")
        pg.click("#pad")   # スタート
        pg.wait_for_function("window.__chikupon.S.phase === 'wait'")
        cls = pg.get_attribute("#pad", "class")
        check(("wait" in cls) if kind == "color" else ("quiet" in cls), f"待ち中の見た目: {cls}")
        if fouls_first:
            time.sleep(0.2)
            pg.click("#pad")   # 合図の前 → お手つき
            check("foul" in pg.get_attribute("#pad", "class"), "合図の前に押すとお手つき")
            check(pg.evaluate("window.__chikupon.S.fouls") == 1, "お手つき 1回")
            pg.screenshot(path=f"{OUT}/solo-{kind}-foul.png")
            time.sleep(0.6)
            pg.click("#pad")   # やりなおし
        times = []
        for i in range(5):
            if i > 0:
                time.sleep(0.6)
                pg.click("#pad")   # つぎへ
            pg.wait_for_function("window.__chikupon.S.phase === 'go'", timeout=8000)
            pg.wait_for_function("window.__chikupon.S.shownAt > 0", timeout=2000)
            cls = pg.get_attribute("#pad", "class")
            if kind == "color":
                check("go" in cls.split(), f"{i+1}回目 合図で緑: {cls}") if i == 0 else None
            else:
                check("quiet" in cls.split(), f"{i+1}回目 合図でも見た目は変わらない: {cls}") if i == 0 else None
            if i == 0:
                pg.screenshot(path=f"{OUT}/solo-{kind}-go.png")
            time.sleep(0.25)
            pg.click("#pad")
            pg.wait_for_function("window.__chikupon.S.phase === 'between'")
            ms = pg.evaluate("window.__chikupon.S.times[window.__chikupon.S.times.length-1]")
            times.append(ms)
        check(all(100 <= t <= 2500 for t in times), f"5回の記録 {times}")
        time.sleep(0.6)
        pg.screenshot(path=f"{OUT}/solo-{kind}-last.png")
        pg.click("#pad")   # けっかへ
        pg.wait_for_selector("#s-solo-result:not([hidden])")
        rank = pg.inner_text("#solo-rank").replace("\n", " ")
        check(pg.locator("#solo-bars .bar").count() == 5, "5本の棒グラフ")
        print("   けっか:", rank)
        pg.screenshot(path=f"{OUT}/solo-{kind}-result.png")
        return times

    run_kind("color")
    pg.click('#s-solo-result [data-go="solo-select"]')
    pg.wait_for_selector("#s-solo-select:not([hidden])")
    check("へいきん" in pg.inner_text('[data-kind="color"]'), "ベスト記録が合図カードに出る")
    run_kind("sound")
    pg.click('#s-solo-result [data-go="solo-select"]')
    if pg.locator('[data-kind="vibe"]:not([disabled])').count():
        run_kind("vibe", fouls_first=False)
    else:
        print("   しんどう：この環境では未対応（カードは無効）")
        check(pg.locator('[data-kind="vibe"][disabled]').count() == 1, "しんどう未対応のときはカードが無効")
    saved = pg.evaluate("localStorage.getItem('hayaoshi-chikupon-best-v1')")
    check(saved and "color" in saved and "sound" in saved, "ベスト記録が localStorage に保存: " + str(saved))
    b.close()

print("errors:", errors or "なし")
sys.exit(1 if errors else 0)

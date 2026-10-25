# ひとりプレイの確認（Playwright）。dev/server.mjs を起動してから実行する
#   node horimogu/dev/server.mjs &
#   python3 horimogu/dev/test-solo.py [スクリーンショットの出力先]
# 確かめること：ホーム表示 → ひとりで遊ぶ → 地形が描ける → 視点（後方／近く）の切りかえ → 歩く・掘る → アイテムを拾って使う → 敵に当たる → コンソールにエラーなし
import sys, os, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:8787/horimogu/")
OUT = sys.argv[1] if len(sys.argv) > 1 else "."
IGNORE = ("ERR_TUNNEL", "Failed to load resource", "ERR_NAME_NOT_RESOLVED", "ERR_CONNECTION", "GPU stall", "GL Driver")
errors = []

def check(c, msg):
    print(("OK  " if c else "NG  ") + msg)
    if not c: errors.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    for name, vp, touch in [("mobile", {"width": 390, "height": 760}, True), ("pc", {"width": 1280, "height": 760}, False)]:
        ctx = b.new_context(viewport=vp, has_touch=touch, is_mobile=touch, device_scale_factor=2 if touch else 1)
        pg = ctx.new_page()
        pg.on("console", lambda m: m.type == "error" and not any(s in m.text for s in IGNORE) and errors.append(f"[{name}] console: {m.text}"))
        pg.on("pageerror", lambda e: errors.append(f"[{name}] pageerror: {e}"))
        pg.goto(BASE)
        pg.wait_for_timeout(600)
        pg.screenshot(path=f"{OUT}/{name}-home.png", full_page=True)
        pg.click("#home [data-size=short]")
        pg.click("#soloBtn")
        pg.wait_for_function("window.__HM && __HM.G.running && document.querySelector('#loading').hidden", timeout=20000)
        check(pg.evaluate("__HM.G.world.N") == 60, f"[{name}] ショート（60）で始まる")
        pg.wait_for_timeout(600)
        pg.screenshot(path=f"{OUT}/{name}-small.png")
        pg.evaluate("__HM.G.stop(); __HM.UI.show('home')")
        pg.click("#home [data-size=tall]")
        pg.click("#soloBtn")
        pg.wait_for_function("__HM.G.running && document.querySelector('#loading').hidden", timeout=20000)
        check(pg.evaluate("__HM.G.world.N") == 80, f"[{name}] トール（80）で始まる")
        pg.evaluate("__HM.G.stop(); __HM.UI.show('home')")
        pg.click("#home [data-size=grande]")
        pg.click("#soloBtn")
        pg.wait_for_function("window.__HM && __HM.G.running && document.querySelector('#loading').hidden", timeout=20000)
        pg.wait_for_timeout(800)
        G = "__HM.G"
        check(pg.evaluate(f"{G}.meshes.size") > 50, f"[{name}] チャンクが作られた")
        pg.evaluate(f"{G}.me.spawn0={G}.me.p.slice()")
        check(pg.evaluate(f"{G}.camMode") == "far", f"[{name}] はじめは後方視点")
        inside = pg.evaluate(f"(()=>{{let n=0; const m={G}.me; for(let i=0;i<24;i++){{ m.yaw=i/24*Math.PI*2; m.pitch=-0.6+(i%5)*0.3; const c={G}.camera(); if({G}.world.solidAt(c.eye[0],c.eye[1],c.eye[2])) n++; }} return n; }})()")
        check(inside == 0, f"[{name}] 後方視点のカメラが壁の中に入らない（{inside}/24）")
        pg.screenshot(path=f"{OUT}/{name}-play.png")
        pg.keyboard.press("KeyV") if not touch else pg.click("#camBtn")
        pg.wait_for_timeout(400)
        check(pg.evaluate(f"{G}.camMode") == "near", f"[{name}] 視点を「近く」に切りかえ")
        pg.screenshot(path=f"{OUT}/{name}-play-near.png")
        pg.keyboard.press("KeyV") if not touch else pg.click("#camBtn")
        pg.wait_for_timeout(200)
        # 前へ歩く（壁にぶつかって掘る）
        y0 = pg.evaluate(f"{G}.me.p.slice()")
        pg.evaluate("__HM.held.main=false")
        pg.keyboard.down("KeyW"); pg.wait_for_timeout(2500); pg.keyboard.up("KeyW")
        y1 = pg.evaluate(f"{G}.me.p.slice()")
        moved = ((y1[0]-y0[0])**2 + (y1[2]-y0[2])**2) ** 0.5
        check(moved > 3, f"[{name}] 歩いて掘り進んだ（{moved:.1f}マス）")
        # 掘るボタン（下をねらう）
        pg.evaluate(f"{G}.me.pitch=-1.2")
        pg.evaluate("__HM.held.main=true"); pg.wait_for_timeout(1200); pg.evaluate("__HM.held.main=false")
        pg.evaluate(f"{G}.me.pitch=-0.1")
        # ほりほりタイム：攻撃アイテムは使えない・落ちたら天井へ（最後に取ったものだけ残る）
        check(pg.evaluate(f"{G}.inDig()"), f"[{name}] はじめはほりほりタイム")
        check(pg.is_visible("#digBanner"), f"[{name}] ほりほりタイムの表示")
        pg.evaluate(f"{G}.addItem('dashi'); {G}.addItem('ajitama'); {G}.addItem('miso'); {G}.me.sel={G}.me.inv.findIndex(s=>s.type==='dashi')")
        pg.evaluate("__HM.held.item=true"); pg.wait_for_timeout(500); pg.evaluate("__HM.held.item=false")
        check(pg.evaluate(f"{G}.proj.length") == 0 and pg.evaluate(f"{G}.me.inv.find(s=>s.type==='dashi').count") == 15, f"[{name}] ほりほりタイム中は出汁ピストルが使えない")
        pg.evaluate(f"{G}.me.p=[-5, 10, -5]")
        pg.wait_for_function(f"{G}.me.p[1] > {G}.world.N - 2 && !{G}.me.fellSent", timeout=15000)
        check(pg.evaluate(f"{G}.players.get('me').alive"), f"[{name}] 奈落に落ちても天井にもどる")
        inv = pg.evaluate(f"{G}.me.inv.map(s=>s.type).join()")
        check(inv == "miso", f"[{name}] 最後に取ったアイテムだけ残る（{inv}）")
        pg.screenshot(path=f"{OUT}/{name}-respawn.png")
        pg.evaluate(f"{G}.digEnd = {G}.t + 0.3")
        pg.wait_for_timeout(1200)
        check(not pg.evaluate(f"{G}.inDig()") and pg.is_hidden("#digBanner"), f"[{name}] ほりほりタイムが終わってバトルへ")
        pg.evaluate(f"(()=>{{ const m={G}.me; m.p=m.spawn0||m.p; }})()")
        # アイテムを全部持たせて使う
        pg.evaluate(f"""(() => {{ for (const k of Object.keys(HM.T.items)) {G}.addItem(k); }})()""")
        pg.wait_for_timeout(200)
        check(pg.evaluate(f"{G}.me.inv.length") == 9, f"[{name}] アイテム 9 種を持てる")
        # 敵をすぐ前に呼ぶ
        pg.evaluate(f"""(() => {{ const b={G}.bots[0], m={G}.me; b.p=[m.p[0]+Math.sin(m.yaw)*1.6, m.p[1], m.p[2]+Math.cos(m.yaw)*1.6]; b.aware=true; }})()""")
        hp0 = pg.evaluate(f"{G}.bots[0].hp")
        for sel, wait in [(0, 600), (2, 900), (3, 800), (6, 300)]:
            pg.evaluate(f"""(() => {{ const m={G}.me, b={G}.bots[0]; m.pitch=-0.15; m.yaw=Math.atan2(b.p[0]-m.p[0], b.p[2]-m.p[2]); }})()""")
            pg.evaluate(f"{G}.me.sel={sel}; {G}.onHud()")
            pg.evaluate("__HM.held.item=true"); pg.wait_for_timeout(wait); pg.evaluate("__HM.held.item=false"); pg.wait_for_timeout(150)
        pg.screenshot(path=f"{OUT}/{name}-items.png")
        hp1 = pg.evaluate(f"{G}.bots[0].hp")
        check(hp1 < hp0, f"[{name}] 敵にダメージ（{hp0}→{hp1}）")
        # 素手でなぐる
        pg.evaluate(f"""(() => {{ const m={G}.me, b={G}.bots[0]; if(!b.alive) return; b.p=[m.p[0]+Math.sin(m.yaw)*1.4, m.p[1], m.p[2]+Math.cos(m.yaw)*1.4]; }})()""")
        pg.evaluate("__HM.held.main=true"); pg.wait_for_timeout(600); pg.evaluate("__HM.held.main=false")
        # 敵を遠くへ（体力・罠の確認のじゃまにならないように）
        pg.evaluate(f"(() => {{ for (const b of {G}.bots) {{ b.p=[5,5,5]; b.aware=false; }} }})()")
        # 回復・お味噌（遅い描画でも確実に使うため、地面に立ち・使える状態になるまで待ってから、使い終わるまで押す）
        def use(t):
            pg.wait_for_function(f"{G}.me.onGround && {G}.me.cool.item <= 0", timeout=8000)
            n0 = pg.evaluate(f"({G}.me.inv.find(s=>s.type==='{t}')||{{count:0}}).count")
            pg.evaluate(f"""(() => {{ const i={G}.me.inv.findIndex(s=>s.type==='{t}'); {G}.me.sel=i; }})()""")
            pg.evaluate("__HM.held.item=true")
            try:
                pg.wait_for_function(f"({G}.me.inv.find(s=>s.type==='{t}')||{{count:0}}).count < {n0}", timeout=4000)
            finally:
                pg.evaluate("__HM.held.item=false")
            pg.wait_for_timeout(200)
        for t in ["ajitama", "miso", "bigtama"]:
            use(t)
        check(pg.evaluate(f"{G}.players.get('me').armorUntil > {G}.t"), f"[{name}] お味噌のアーマー")
        # 罠（自分で踏む）
        use("karashi")
        check(pg.evaluate(f"{G}.traps.size") >= 1, f"[{name}] からし地雷を置けた")
        try: pg.wait_for_function(f"{G}.traps.size == 0", timeout=6000)
        except Exception: pass
        check(pg.evaluate(f"{G}.traps.size") == 0, f"[{name}] からし地雷を自分で踏んだ")
        pg.screenshot(path=f"{OUT}/{name}-after.png")
        fps = pg.evaluate("""new Promise(r=>{let n=0,t0=performance.now();function f(){n++; if(performance.now()-t0<1000) requestAnimationFrame(f); else r(n);} requestAnimationFrame(f);})""")
        print(f"     [{name}] fps(swiftshader) ≈ {fps}")
        # 全滅させて結果画面
        pg.evaluate(f"""(() => {{ for (const b of {G}.bots) if (b.alive) {G}.hostDamage(b.id, 999, 'me'); }})()""")
        pg.wait_for_selector("#result:not([hidden])", timeout=5000)
        check("全滅" in pg.inner_text("#resTitle"), f"[{name}] 全滅で勝ち")
        pg.screenshot(path=f"{OUT}/{name}-result.png")
        # 時間切れ
        pg.click("#resRetry")
        pg.wait_for_function("__HM.G.running && !__HM.G.over && document.querySelector('#loading').hidden", timeout=20000)
        pg.evaluate(f"{G}.digEnd=0; {G}.timeLeft=0.1")
        pg.wait_for_selector("#result:not([hidden])", timeout=5000)
        check("時間切れ" in pg.inner_text("#resTitle"), f"[{name}] 時間切れで負け")
        # おでん鍋に落ちる
        pg.click("#resRetry")
        pg.wait_for_function("__HM.G.running && !__HM.G.over && document.querySelector('#loading').hidden", timeout=20000)
        pg.evaluate(f"{G}.digEnd=0; {G}.me.p=[-5, 20, -5]")
        pg.wait_for_selector("#result:not([hidden])", timeout=8000)
        check("おでん鍋" in pg.inner_text("#resTitle"), f"[{name}] おでん鍋に沈んで負け")
        pg.screenshot(path=f"{OUT}/{name}-pot.png")
        ctx.close()
    b.close()

print("\n".join(errors) if errors else "すべて OK")
sys.exit(1 if errors else 0)

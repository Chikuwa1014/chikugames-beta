# みんなで遊ぶの確認（親1＋子2）。dev/server.mjs を起動してから実行する
#   node horimogu/dev/server.mjs &
#   python3 horimogu/dev/test-multi.py [スクリーンショットの出力先]
# 確かめること：部屋づくり・参加 → スタート → 位置・掘った地形が全員にとどく → 弾のダメージを親が決める
#   → 親がぬける → 引き継ぎ役が親になり、残りの子がつなぎ直して続く（ぬけた親は負け）→ さいごの1人で勝ち
import sys, time, os
from playwright.sync_api import sync_playwright, Page

def _wait(self, expression, timeout=30000, **kw):
    end = time.time() + timeout / 1000
    last = None
    while time.time() < end:
        try:
            if self.evaluate(expression): return True
        except Exception as e: last = e
        time.sleep(0.1)
    raise TimeoutError(f"wait: {expression[:100]} ({last})")
Page.wait_for_function = _wait

BASE = os.environ.get("BASE", "http://localhost:8787/horimogu/")
OUT = sys.argv[1] if len(sys.argv) > 1 else "."
IGNORE = ("ERR_TUNNEL", "Failed to load resource", "ERR_NAME_NOT_RESOLVED", "ERR_CONNECTION", "GPU stall", "GL Driver")
errors = []
def check(c, msg):
    print(("OK  " if c else "NG  ") + msg)
    if not c: errors.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
                                "--disable-features=WebRtcHideLocalIpsWithMdns", "--disable-renderer-backgrounding",
                                "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows"])
    pages = []
    for i, nm in enumerate(["おや", "こA", "こB"]):
        ctx = b.new_context(viewport={"width": 420, "height": 760})
        pg = ctx.new_page()
        pg.on("console", lambda m, nm=nm: m.type == "error" and not any(s in m.text for s in IGNORE) and errors.append(f"[{nm}] console: {m.text}"))
        pg.on("pageerror", lambda e, nm=nm: errors.append(f"[{nm}] pageerror: {e}"))
        pages.append(pg)
    host, ga, gb = pages
    host.goto(BASE); host.click("#multiBtn")
    host.fill(".cg-room-name", "おや"); host.click("[data-cg=create]")
    host.wait_for_function("__HM.NET.room && __HM.NET.room.role==='host' && __HM.NET.room.code")
    host.click("#lobby [data-size=tall]")
    code = host.evaluate("__HM.NET.room.code")
    for pg, nm, col in [(ga, "こA", "red"), (gb, "こB", "auto")]:
        pg.goto(BASE + "?room=" + code)
        pg.wait_for_selector(".cg-room-name")
        pg.fill(".cg-room-name", nm)
        if col != "auto": pg.click(f"#lobbyColors [data-col={col}]")
        pg.click("[data-cg=join]")
    try:
        host.wait_for_function("__HM.NET.roster.size===3", timeout=30000)
    except Exception:
        print("dbg2:", [pg.evaluate("JSON.stringify({role:__HM.NET.room.role,open:__HM.NET.room.open,mem:__HM.NET.room.members,ll:__HM.NET.lobbyList.length})") for pg in pages], errors)
        print("dbg roster:", host.evaluate("__HM.NET.roster.size"), [pg.inner_text("#lobbyBox")[:120].replace(chr(10),' ') for pg in pages])
        raise
    ga.wait_for_function("__HM.NET.lobbyList.length===3")
    host.screenshot(path=f"{OUT}/multi-lobby-host.png", full_page=True)
    ga.screenshot(path=f"{OUT}/multi-lobby-guest.png", full_page=True)
    check(ga.evaluate("__HM.NET.lobbySize") == "tall", "親のえらんだ大きさ（トール）が子にとどく")
    check(host.evaluate("!document.querySelector('#startBtn').disabled"), "3人でスタートできる")
    host.click("#startBtn")
    for pg in pages:
        pg.wait_for_function("__HM.G.running && document.querySelector('#loading').hidden", timeout=30000)
    check(all(pg.evaluate("__HM.G.world.N") == 80 for pg in pages), "全員トール（80）で始まる")
    cols = host.evaluate("[...__HM.G.players.values()].map(p=>p.name+':'+p.color).join(',')")
    print("     色:", cols)
    check("こA:red" in cols and "おや:normal" in cols and "こB:blue" in cols, "色（自分で選んだ色・おまかせ）")
    # 子Aが動く → 親と子Bに位置がとどく
    pa = ga.evaluate("__HM.NET.pid")
    ga.evaluate("__HM.G.me.p=[__HM.G.me.p[0],__HM.G.me.p[1],__HM.G.me.p[2]]")
    ga.keyboard.down("KeyW"); time.sleep(2.0); ga.keyboard.up("KeyW")
    time.sleep(0.6)
    pos_a = ga.evaluate("__HM.G.me.p")
    seen_h = host.evaluate(f"__HM.G.players.get('{pa}').p")
    seen_b = gb.evaluate(f"__HM.G.players.get('{pa}').p")
    d = lambda u, v: sum((u[i]-v[i])**2 for i in range(3)) ** 0.5
    check(d(pos_a, seen_h) < 1.0 and d(pos_a, seen_b) < 1.0, f"子Aの位置が親・子Bにとどく（ずれ {d(pos_a, seen_h):.2f} / {d(pos_a, seen_b):.2f}）")
    # 掘った地形が全員同じ
    ga.evaluate("(()=>{const m=__HM.G.me; m.pitch=-1.2; __HM.held.main=true; })()"); time.sleep(1.2); ga.evaluate("__HM.held.main=false")
    time.sleep(0.8)
    sums = [pg.evaluate("(()=>{let s=0;const v=__HM.G.world.v;for(let i=0;i<v.length;i+=7)s=(s*31+v[i])>>>0;return s})()") for pg in pages]
    check(len(set(sums)) == 1, f"地形が全員同じ（{sums}）")
    # 子Bの目の前に子Aを置き、子Bが出汁ピストルを撃つ → 親が当たりを決める
    check(all(pg.evaluate("__HM.G.inDig()") for pg in pages), "全員ほりほりタイムから始まる")
    for pg in pages: pg.evaluate("__HM.G.digEnd = 0")   # テストではすぐバトルへ
    pbid = gb.evaluate("__HM.NET.pid")
    gb.evaluate("__HM.G.addItem('dashi')")
    gb.evaluate(f"""(()=>{{const m=__HM.G.me; const a=__HM.G.players.get('{pa}');
       m.yaw=Math.atan2(a.p[0]-m.p[0], a.p[2]-m.p[2]); }})()""")
    # 子Aを子Bの前（空中でもよい）へ瞬間移動させて、動かないようにする
    pb = gb.evaluate("__HM.G.me.p")
    ga.evaluate(f"(()=>{{const m=__HM.G.me; m.p=[{pb[0]}+0, {pb[1]}+0, {pb[2]}+1.6]; m.v=[0,0,0]; }})()")
    time.sleep(0.6)
    gb.evaluate(f"(()=>{{const m=__HM.G.me; m.yaw=0; m.pitch=-0.05; m.sel=m.inv.findIndex(s=>s.type==='dashi'); __HM.held.item=true; }})()")
    time.sleep(1.2); gb.evaluate("__HM.held.item=false")
    time.sleep(0.8)
    print("     dbg2:", host.evaluate(f"JSON.stringify([__HM.G.players.get('{pa}').p, __HM.G.players.get('{pbid}').p])"), gb.evaluate("JSON.stringify(__HM.G.me.inv)"))
    hpA = host.evaluate(f"__HM.G.players.get('{pa}').hp")
    hpA_g = ga.evaluate(f"__HM.G.players.get('{pa}').hp")
    check(hpA < 100 and hpA == hpA_g, f"出汁ピストルが当たり、親が体力を配る（親 {hpA} / 子A {hpA_g}）")
    for i, pg in enumerate(pages): pg.screenshot(path=f"{OUT}/multi-play-{i}.png")
    # 親がぬける
    succ = host.evaluate("__HM.G.succ")
    hostPid = host.evaluate("__HM.NET.pid")
    print("     引き継ぎ役:", succ, "（子A" if succ == pa else "（子B", "）")
    nxt, other = (ga, gb) if succ == pa else (gb, ga)
    for pg in (nxt, other):
        pg.evaluate("(()=>{__HM.NET._log=[]; const o=__HM.NET.onStatus; __HM.NET.onStatus=(t,e)=>{__HM.NET._log.push(Math.round(performance.now())+':'+t); o&&o(t,e)}; const c=__HM.NET.onClosed; __HM.NET.onClosed=(t)=>{__HM.NET._log.push('CLOSED:'+t); c&&c(t)}; const tt=__HM.G.toast; __HM.G.toast=(t)=>{__HM.NET._log.push('toast:'+t); tt(t)} })()")
    host.close()
    nxt.wait_for_function("__HM.NET.room && __HM.NET.room.role==='host' && !__HM.NET.migrating", timeout=30000)
    other.wait_for_function("__HM.NET._log.some(t=>t.includes('新しい親につなぎ直しました')) && __HM.NET.room.role==='guest' && __HM.NET.room.open", timeout=40000)
    check(True, "引き継ぎ役が親になり、もう1人がつなぎ直した")
    time.sleep(1.0)
    check(not nxt.evaluate(f"__HM.G.players.get('{hostPid}').alive"), "ぬけた親は負け（新しい親）")
    print("     log other:", other.evaluate("__HM.NET._log.join(' | ')"))
    print("     log nxt:", nxt.evaluate("__HM.NET._log.join(' | ')"))
    print("     dbg:", other.evaluate(f"JSON.stringify({{al: __HM.G.players.get('{hostPid}').alive, snap: performance.now()/1000-__HM.G.lastSnapAt, inMatch: __HM.NET.inMatch, role: __HM.NET.room.role}})"))
    check(not other.evaluate(f"__HM.G.players.get('{hostPid}').alive"), "ぬけた親は負け（子）")
    check(nxt.evaluate("__HM.G.running && !__HM.G.over"), "試合は続いている")
    # 引き継ぎ後も位置・地形がとどく
    other.keyboard.down("KeyD"); time.sleep(1.5); other.keyboard.up("KeyD"); time.sleep(0.6)
    opid = other.evaluate("__HM.NET.pid")
    check(d(other.evaluate("__HM.G.me.p"), nxt.evaluate(f"__HM.G.players.get('{opid}').p")) < 1.0, "引き継ぎ後も位置がとどく")
    other.evaluate("(()=>{__HM.G.me.pitch=-1.2; __HM.held.main=true;})()"); time.sleep(1.0); other.evaluate("__HM.held.main=false"); time.sleep(0.8)
    s2 = [pg.evaluate("(()=>{let s=0;const v=__HM.G.world.v;for(let i=0;i<v.length;i+=7)s=(s*31+v[i])>>>0;return s})()") for pg in (nxt, other)]
    check(s2[0] == s2[1], f"引き継ぎ後も地形が同じ（{s2}）")
    nxt.screenshot(path=f"{OUT}/multi-after-migrate.png")
    # 新しい親が、もう1人をたおす → 勝ち
    nxt.evaluate(f"__HM.G.hostDamage('{opid}', 999, __HM.NET.pid)")
    nxt.wait_for_selector("#result:not([hidden])", timeout=8000)
    other.wait_for_selector("#result:not([hidden])", timeout=8000)
    check("勝った" in nxt.inner_text("#resTitle"), "さいごの1人が勝ち（" + nxt.inner_text("#resTitle") + "）")
    check("の勝ち" in other.inner_text("#resTitle"), "負けた側にも結果（" + other.inner_text("#resTitle") + "）")
    other.screenshot(path=f"{OUT}/multi-result.png")
    # ロビーへ戻って、もう一度スタートできる
    nxt.click("#resLobby"); other.click("#resLobby")
    try:
        nxt.wait_for_function("__HM.NET.roster.size===2", timeout=10000)
    except Exception as e:
        print("     dbg3:", nxt.evaluate("JSON.stringify({r:[...__HM.NET.roster.entries()], m:__HM.NET.room.members, role:__HM.NET.room.role})"), other.evaluate("JSON.stringify({role:__HM.NET.room&&__HM.NET.room.role, open:__HM.NET.room&&__HM.NET.room.open, log:__HM.NET._log})"))
        raise
    check(nxt.evaluate("!document.querySelector('#startBtn').disabled"), "ロビーに戻って、もう一度スタートできる")
    b.close()

print("\n".join(errors) if errors else "すべて OK")
sys.exit(1 if errors else 0)

"""やすにゃんこんにゃん！散歩チュウ：コンカフェ嬢のドット絵（仮の絵）を作るスクリプト。
設計は 80×140 の単位で図形を描き、240×420 ドットに縮めて色を減らし、輪郭線を付ける。
使い方：python3 yasunyan-sanpo/dev/concafe_sprites.py
出力：yasunyan-sanpo/img/concafe/<キャラ>-<衣装>.png（ゲームが読む）と dev/concafe-sheet.png（一覧）。"""
from PIL import Image, ImageDraw, ImageFont

FW, FH, K = 240, 420, 24        # 仕上がりのドット数と、下描きの倍率（設計は80×140の単位で書き、3倍で仕上げる）
import numpy as np
import os
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'img', 'concafe')
LINE = (52, 32, 40, 255)

def C(h):
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)

class P:
    """下描き用のペン（座標は仕上がりのドット単位）。"""
    def __init__(s):
        s.im = Image.new('RGBA', (80 * K, 140 * K), (0, 0, 0, 0)); s.d = ImageDraw.Draw(s.im); s.cols = set()
    def _c(s, c):
        c = C(c) if isinstance(c, str) else c; s.cols.add(c); return c
    def e(s, x, y, w, h, c):       # だ円（左上と幅・高さ）
        s.d.ellipse([x * K, y * K, (x + w) * K - 1, (y + h) * K - 1], fill=s._c(c))
    def r(s, x, y, w, h, c):
        s.d.rectangle([x * K, y * K, (x + w) * K - 1, (y + h) * K - 1], fill=s._c(c))
    def poly(s, pts, c):
        s.d.polygon([(x * K, y * K) for x, y in pts], fill=s._c(c))
    def line(s, pts, c, w=1):
        s.d.line([(x * K, y * K) for x, y in pts], fill=s._c(c), width=int(w * K))
    def arc(s, x, y, w, h, a0, a1, c, wd=1):
        s.d.arc([x * K, y * K, (x + w) * K, (y + h) * K], a0, a1, fill=s._c(c), width=int(wd * K))

def finish(p):
    """縮小 → 使った色だけに減色 → 外側に輪郭線。"""
    small = np.asarray(p.im.resize((FW, FH), Image.BOX)).astype(float)
    a = small[..., 3]; rgb = small[..., :3] * 255 / np.maximum(a, 1)[..., None]
    pal = np.array([c[:3] for c in p.cols], float)
    w = np.array([3, 4, 2], float)
    dist = (((rgb[:, :, None, :] - pal[None, None, :, :]) ** 2) * w).sum(-1)
    idx = dist.argmin(-1)
    out = np.zeros((FH, FW, 4), np.uint8)
    on = a >= 110
    out[on, :3] = pal[idx[on]].astype(np.uint8); out[on, 3] = 255
    nb = np.zeros_like(on)
    nb[1:] |= on[:-1]; nb[:-1] |= on[1:]; nb[:, 1:] |= on[:, :-1]; nb[:, :-1] |= on[:, 1:]
    edge = nb & ~on
    out[edge] = LINE
    return Image.fromarray(out, 'RGBA')

def shade(c, f):
    c = C(c) if isinstance(c, str) else c
    return tuple(max(0, min(255, int(v * f))) for v in c[:3]) + (255,)

# ---------------- 体と顔 ----------------
def geom(body):
    g = dict(cx=40, hy=14, hw=26, hh=31, sh=13, wa=8, hip=12, legw=5.5, skirt=22, arm=5)
    if body == 'type1': g.update(wa=7.5, hip=12.5)
    if body == 'type3': g.update(hw=28, sh=15, wa=12, hip=15, legw=7, skirt=24, arm=6.5)
    if body == 'type4': g.update(hw=27, sh=16, wa=12, hip=12, legw=6.5, skirt=22, arm=6.5)
    g['ny'] = g['hy'] + g['hh'] - 2          # 首の上
    g['shy'] = g['ny'] + 5                   # 肩の高さ
    g['way'] = g['shy'] + 19                 # ウエスト
    g['sky'] = g['way'] + 27                 # スカートのすそ
    g['fy'] = 132                            # 足もと
    return g

def legs(p, g, sock, shoe, sock_top=None, boots=False):
    cx = g['cx']; lw = g['legw']
    for lx in (cx - 3 - lw, cx + 3):
        p.r(lx, g['way'] + 10, lw, g['fy'] - g['way'] - 10, ch['skin'])
        top = sock_top if sock_top is not None else g['sky'] + 6
        p.r(lx, top, lw, g['fy'] - top, sock)
        if boots: p.r(lx - 0.5, g['fy'] - 12, lw + 1, 12, shoe)
        p.e(lx - 1, g['fy'] - 2, lw + 3, 5, shoe)

def torso(p, g, col, chest=True):
    cx, sh, wa = g['cx'], g['sh'], g['wa']
    pts = [(cx - sh, g['shy']), (cx + sh, g['shy']), (cx + sh - 1, g['shy'] + 8), (cx + wa, g['way']), (cx - wa, g['way']), (cx - sh + 1, g['shy'] + 8)]
    p.poly(pts, col)
    p.e(cx - sh, g['shy'] - 2, 2 * sh, 6, col)
    g['torso_col'] = col

def skirt(p, g, col, layers=(), ln=0):
    cx, wa, sk = g['cx'], g['wa'], g['skirt']
    bot = g['sky'] + ln
    p.poly([(cx - wa, g['way']), (cx + wa, g['way']), (cx + sk, bot), (cx - sk, bot)], col)
    g['skirt_col'] = col; g['skirt_bot'] = bot
    p.e(cx - sk, bot - 3, 2 * sk, 6, col)
    for i, lc in enumerate(layers):           # すそのフリル・ライン（下から）
        y = bot - 1 - i * 2.5
        p.e(cx - sk + i, y, 2 * (sk - i), 3.5, lc)

def arms(p, g, sleeve, cuff=None, puff=0, long_sleeve=False, wide=0):
    cx, sh, a = g['cx'], g['sh'], g['arm']
    for side in (-1, 1):
        x0 = cx + side * sh - (a if side > 0 else 0) + side * 1
        ax = x0 if side < 0 else x0 - a + a
        ax = cx - sh - a + 2 if side < 0 else cx + sh - 2
        p.r(ax, g['shy'] + 2, a, 22, ch['skin'])
        p.e(ax - 0.5, g['shy'] + 22, a + 1, 6, ch['skin'])              # 手
        if long_sleeve:
            p.poly([(ax, g['shy']), (ax + a, g['shy']), (ax + a + wide * (side > 0), g['shy'] + 22), (ax - wide * (side < 0), g['shy'] + 22)], sleeve)
            if cuff: p.r(ax - wide * (side < 0), g['shy'] + 20, a + wide, 2.5, cuff)
        else:
            p.e(ax - puff, g['shy'] - 1, a + 2 * puff, 10 + puff, sleeve)
            if cuff: p.r(ax - puff * 0.5, g['shy'] + 7 + puff, a + puff, 2, cuff)

def head(p, g, ears=True):
    cx, hy, hw, hh = g['cx'], g['hy'], g['hw'], g['hh']
    p.r(cx - 3, g['ny'] - 2, 6, 8, ch['skin2'])                       # 首
    if ears and ch.get('catears', True):                              # ねこ耳（こんにゃんのなごり）
        for side in (-1, 1):
            bx = cx + side * (hw / 2 - 4)
            p.poly([(bx - 5, hy + 6), (bx + 5, hy + 6), (bx + side * 4, hy - 5)], ch['hair'])
            p.poly([(bx - 2.5, hy + 5), (bx + 2.5, hy + 5), (bx + side * 3, hy - 1.5)], '#F2A8BC')
    # 顔の形（あご）
    jaw = ch.get('jaw', 0)
    p.e(cx - hw / 2, hy + 2, hw, hh - 6, ch['skin'])
    p.poly([(cx - hw / 2 + 1, hy + hh * 0.5), (cx + hw / 2 - 1, hy + hh * 0.5), (cx + hw / 2 - 5 + jaw, hy + hh - 4), (cx, hy + hh + 0.5), (cx - hw / 2 + 5 - jaw, hy + hh - 4)], ch['skin'])

def face(p, g):
    cx, hy, hw = g['cx'], g['hy'], g['hw']
    ey = hy + 15 + ch.get('eye_dy', 0)
    st = ch['eyes']; ex = ch.get('eye_gap', 6)
    for side in (-1, 1):
        x = cx + side * ex
        wink = ch.get('wink') and side > 0
        if st in ('big', 'cat') and not wink:
            w, h = (6.5, 7.5) if st == 'big' else (6.5, 6.5)
            p.e(x - w / 2, ey - 1, w, h, '#FFFFFF')
            p.e(x - w / 2 + 0.6, ey - 1, w - 1.2, h, ch['iris'])
            p.e(x - w / 2 + 1.2, ey + h / 2 - 1, w - 2.4, h / 2, ch['iris2'])
            p.e(x - 1 + side * 0.3, ey + 0.5, 2.2, 2.4, '#FFFFFF')          # ハイライト
            p.r(x + 0.8, ey + h - 2.5, 1, 1, '#FFFFFF')
            p.arc(x - w / 2 - 0.7, ey - 1.4, w + 1.4, 5, 195, 345, '#2A1A22', 1.3)   # まつげ（丸く）
            if st == 'cat':
                tip = x + side * (w / 2 + 2)
                p.line([(x + side * w / 2, ey - 0.8), (tip, ey - 2.2)], '#2A1A22', 1.2)   # つり目のアイライン
        elif st == 'normal' and not wink:
            p.e(x - 2.6, ey, 5.2, 5.5, '#FFFFFF'); p.e(x - 1.8, ey, 3.6, 5.5, ch['iris']); p.r(x - 1, ey + 1, 1.2, 1.2, '#FFFFFF')
            p.line([(x - 3, ey), (x + 3, ey)], '#3A2A2A', 1.1)
        elif st == 'small' and not wink:
            p.e(x - 1.3, ey + 1.5, 2.6, 2.6, '#2A1A1A')
        if wink:
            p.arc(x - 3.5, ey + 1, 7, 4, 200, 340, '#2A1A22', 1.3)
        # まゆ
        by = ey - 4 + ch.get('brow_dy', 0)
        if ch.get('unibrow'):
            if side < 0: p.line([(cx - ex - 4, by), (cx + ex + 4, by)], ch['brow'], 1.8)
        else:
            p.line([(x - 3, by + (0.6 if side < 0 else 0)), (x + 3, by + (0 if side < 0 else 0.6))], ch['brow'], 1)
    # ほお
    if ch.get('blush', True):
        for side in (-1, 1):
            p.e(cx + side * (ex + 1) - 2.5, ey + 7.5, 5, 2.2, '#F4A7B4')
    # 鼻
    if ch.get('bignose'):
        p.e(cx - 2.5, ey + 5, 5, 4.5, ch['skin2']); p.r(cx - 1.5, ey + 8, 1, 1, '#9A5A4A'); p.r(cx + 0.5, ey + 8, 1, 1, '#9A5A4A')
    else:
        p.r(cx - 0.5, ey + 7, 1, 1, ch['skin2'])
    # 口（表情）
    my = ey + 11 + ch.get('mouth_dy', 0)
    m = ch['mouth']
    if m == 'smile':
        p.arc(cx - 3, my - 2.5, 6, 4, 20, 160, '#B04452', 1.2)
    elif m == 'open':
        p.poly([(cx - 3, my - 0.5), (cx + 3, my - 0.5), (cx, my + 3)], '#B04452'); p.r(cx - 1.5, my + 1, 3, 1, '#F07A8A')
    elif m == 'cat':
        p.arc(cx - 3, my - 2, 3, 3, 0, 180, '#B04452', 1); p.arc(cx, my - 2, 3, 3, 0, 180, '#B04452', 1)
    elif m == 'smirk':
        p.line([(cx - 2.5, my), (cx + 1, my + 0.6), (cx + 3, my - 1)], '#B04452', 1.1)
    elif m == 'grin_gap':
        p.e(cx - 4, my - 1, 8, 4, '#7A2A30'); p.r(cx - 3, my - 0.8, 6, 1.4, '#FFFFFF'); p.r(cx - 0.4, my - 0.8, 1, 1.4, '#7A2A30')
    if ch.get('lipstick'):
        p.e(cx - 2, my - 0.5, 4, 2, '#D85A6A')
    if ch.get('stubble'):
        for i in range(10):
            p.r(cx - 7 + (i * 1.6), my + 3 + (i % 2), 0.8, 0.8, '#8A7A6A')
    if ch.get('freckles'):
        for dx in (-9, -7, -8, 7, 8, 9):
            p.r(cx + dx, ey + 6 + (dx % 2), 0.8, 0.8, '#B87A5A')
    if ch.get('mole'):
        p.r(cx + ch['mole'][0], ey + ch['mole'][1], 1, 1, '#5A3A30')

# ---------------- 髪 ----------------
def hair_back(p, g):
    cx, hy, hw = g['cx'], g['hy'], g['hw']; st = ch['hairstyle']; H = ch['hair']; H2 = ch['hair2']
    if st in ('long', 'wavy'):
        p.e(cx - hw / 2 - 3, hy, hw + 6, 26, H2)
        p.r(cx - hw / 2 - 3, hy + 13, hw + 6, 40, H2)
        if st == 'wavy':
            for i in range(5):
                y = hy + 20 + i * 7
                p.e(cx - hw / 2 - 5 + (i % 2), y, 6, 7, H2); p.e(cx + hw / 2 - 1 - (i % 2), y, 6, 7, H2)
        p.e(cx - hw / 2 - 3, hy + 46, hw + 6, 10, H2)
    if st == 'bob':
        p.e(cx - hw / 2 - 3, hy, hw + 6, 34, H2)
    if st == 'twin_low':
        p.e(cx - hw / 2 - 2, hy, hw + 4, 30, H2)
        for side in (-1, 1):
            p.e(cx + side * (hw / 2 + 1) - 4, hy + 28, 8, 34, H2)
    if st == 'twin_high':
        p.e(cx - hw / 2 - 2, hy, hw + 4, 28, H2)
        for side in (-1, 1):
            p.poly([(cx + side * (hw / 2 - 2), hy + 6), (cx + side * (hw / 2 + 9), hy + 14), (cx + side * (hw / 2 + 7), hy + 54), (cx + side * (hw / 2 + 1), hy + 50)], H2)
    if st in ('short', 'boyish', 'dread'):
        p.e(cx - hw / 2 - 2, hy - 1, hw + 4, 22, H2)
    if st == 'dread':
        for i in range(-4, 5):
            p.r(cx + i * 3.3 - 1, hy + 10, 2.4, 26 + (i % 3) * 3, H2)

def hair_front(p, g):
    cx, hy, hw = g['cx'], g['hy'], g['hw']; st = ch['hairstyle']; H = ch['hair']; H2 = ch['hair2']
    top = hy - 1
    p.e(cx - hw / 2 - 1.5, top, hw + 3, 15, H)                          # 頭頂
    bangs = ch.get('bangs', 'straight')
    if bangs == 'straight':                                              # ぱっつん
        p.r(cx - hw / 2 + 1, top + 5, hw - 2, 8, H)
        for i in range(7):
            p.poly([(cx - hw / 2 + 2 + i * 3.4, top + 12), (cx - hw / 2 + 5.4 + i * 3.4, top + 12), (cx - hw / 2 + 3.7 + i * 3.4, top + 14)], H)
    elif bangs == 'sheer':                                               # シースルー前髪
        p.r(cx - hw / 2 + 1, top + 5, hw - 2, 5, H)
        for i in range(6):
            p.poly([(cx - hw / 2 + 2 + i * 4, top + 9), (cx - hw / 2 + 4 + i * 4, top + 9), (cx - hw / 2 + 3 + i * 4, top + 15)], H)
    elif bangs == 'side':                                                # 流し前髪
        p.poly([(cx - hw / 2, top + 5), (cx + hw / 2, top + 5), (cx + hw / 2 - 1, top + 9), (cx - 4, top + 14), (cx - hw / 2 + 1, top + 12)], H)
    elif bangs == 'messy':
        for i in range(6):
            p.poly([(cx - hw / 2 + 1 + i * 4.3, top + 4), (cx - hw / 2 + 5.3 + i * 4.3, top + 4), (cx - hw / 2 + 3 + i * 4.3 + (i % 2), top + 11 + (i % 3))], H)
    # 横の髪
    if st in ('long', 'wavy', 'bob', 'twin_low', 'twin_high'):
        sl = {'bob': 26, 'long': 34, 'wavy': 38, 'twin_low': 24, 'twin_high': 22}[st]
        for side in (-1, 1):
            x = cx + side * (hw / 2 - 1.5) - 2.5
            p.poly([(x, top + 6), (x + 5, top + 6), (x + 5 - side * 0, top + sl), (x + 2.5, top + sl + 2), (x, top + sl)], H)
    if st == 'twin_low':
        for side in (-1, 1):
            p.e(cx + side * (hw / 2 + 1) - 2, hy + 26, 4, 3, ch.get('tie', '#E06A8A'))
    # つや
    p.arc(cx - hw / 2 + 3, top + 2, hw - 6, 7, 200, 340, ch['hairhi'], 1)


# ---------------- 細部（240×420 用。1 ドット ≒ 設計の 0.33） ----------------
T = 1 / 3

def cloth_detail(p, g):
    cx = g['cx']
    if 'skirt_col' in g:                       # スカートのひだと影
        c = g['skirt_col']; dk = shade(c, 0.78); lt = shade(c, 1.15)
        n = 7
        for i in range(n):
            t = (i + 0.5) / n * 2 - 1
            x0 = cx + t * g['wa'] * 0.9; x1 = cx + t * (g['skirt'] - 2)
            p.line([(x0, g['way'] + 2), (x1, g['skirt_bot'] - 2)], dk if i % 2 else lt, T * 1.4)
        p.poly([(cx + g['wa'] - 1, g['way'] + 1), (cx + g['wa'], g['way']), (cx + g['skirt'], g['skirt_bot']), (cx + g['skirt'] - 4, g['skirt_bot'])], dk)
    if 'torso_col' in g:                       # 体の右側の影と、胸もとのしわ
        c = g['torso_col']; dk = shade(c, 0.8)
        p.poly([(cx + g['sh'] - 2, g['shy'] + 1), (cx + g['sh'] - 1, g['shy'] + 8), (cx + g['wa'], g['way']), (cx + g['wa'] - 2.5, g['way']), (cx + g['sh'] - 4, g['shy'] + 8)], dk)
        p.line([(cx - 4, g['way'] - 3), (cx - 1, g['way'] - 1)], dk, T)
        p.line([(cx + 2, g['way'] - 4), (cx + 4, g['way'] - 1.5)], dk, T)

def face_detail(p, g):
    cx, hy, hw = g['cx'], g['hy'], g['hw']
    ey = hy + 15 + ch.get('eye_dy', 0); ex = ch.get('eye_gap', 6); st = ch['eyes']
    sk2 = ch['skin2']
    p.e(cx - hw / 2 + 1, hy + 9, hw - 2, 3.2, sk2)                      # 前髪の下の影
    p.e(cx + hw / 2 - 5, hy + 14, 3.5, 10, shade(ch['skin'], 0.95))    # 右ほおの影
    for side in (-1, 1):
        x = cx + side * ex
        wink = ch.get('wink') and side > 0
        if st in ('big', 'cat') and not wink:
            w, h = (6.5, 7.5) if st == 'big' else (6.5, 6.5)
            p.e(x - 1.4, ey + h / 2 - 2.4, 2.8, 3.4, shade(ch['iris'], 0.55))   # ひとみ
            p.arc(x - w / 2 + 0.6, ey - 1, w - 1.2, h, 0, 360, shade(ch['iris'], 0.7), T)  # 虹彩のふち
            p.e(x - 1.2 + side * 0.3, ey + 0.6, 2, 2.2, '#FFFFFF')
            p.e(x + 0.6, ey + h - 2.8, 1.1, 1.1, '#FFFFFF')
            p.line([(x - w / 2, ey + h - 0.6), (x + w / 2 - 1, ey + h - 0.4)], shade(ch['skin2'], 0.8), T)  # 下まぶた
            for k in range(3):                                            # 上まつげのはね
                tx = x + side * (w / 2 + 0.3 - k * 0.9)
                p.line([(tx, ey - 0.2 + k * 0.2), (tx + side * 1.0, ey - 0.6 + k * 0.4)], '#2A1A22', T * 1.2)
            p.line([(x + side * (w / 2 - 0.5), ey + h - 1), (x + side * (w / 2 + 0.6), ey + h - 0.2)], '#5A3A40', T)  # 下まつげ
        if st == 'normal' and not wink:
            p.e(x - 0.9, ey + 1.6, 1.8, 2.2, shade(ch['iris'], 0.6)); p.e(x - 1, ey + 1, 1, 1, '#FFFFFF')
    # 鼻の影と、くちびるのつや
    p.line([(cx + 0.4, ey + 4.5), (cx + 0.8, ey + 7)], shade(sk2, 0.92), T)
    my = ey + 11 + ch.get('mouth_dy', 0)
    if ch['mouth'] in ('smile', 'cat', 'smirk'):
        p.r(cx - 0.6, my + 0.7, 1.2, T, '#F2B8C0')
    # ほおのハイライト
    if ch.get('blush', True):
        for side in (-1, 1):
            p.r(cx + side * (ex + 1) - 0.4, ey + 7.6, 0.8, T, '#FFFFFF')

def hair_detail(p, g):
    cx, hy, hw = g['cx'], g['hy'], g['hw']; st = ch['hairstyle']
    H2 = shade(ch['hair'], 0.72); HI = ch['hairhi']
    top = hy - 1
    for i in range(-3, 4):                                               # 毛の流れ
        x = cx + i * 3.4
        p.line([(cx + i * 1.2, top + 1), (x, top + 9 + abs(i) * 0.4)], H2, T)
    p.arc(cx - hw / 2 + 4, top + 2.5, hw - 8, 6, 205, 335, HI, T * 1.6)  # 天使の輪
    if st in ('long', 'wavy', 'twin_low', 'twin_high', 'bob'):
        for side in (-1, 1):
            x = cx + side * (hw / 2 - 0.5)
            p.line([(x, top + 10), (x + side * 0.6, top + 24)], H2, T)

# ---------------- 衣装（6 種） ----------------
def c_maid(p, g):
    D, W, PK = '#3B2A2E', '#FFF6F0', '#F08AAE'
    legs(p, g, '#2A2430', '#3A2418', sock_top=g['sky'] + 2)
    torso(p, g, D); skirt(p, g, D, layers=(W,))
    arms(p, g, D, cuff=W, puff=2)
    cx = g['cx']
    p.poly([(cx - g['wa'] + 2, g['shy'] + 6), (cx + g['wa'] - 2, g['shy'] + 6), (cx + g['skirt'] - 7, g['sky'] - 1), (cx - g['skirt'] + 7, g['sky'] - 1)], W)   # エプロン
    for side in (-1, 1): p.e(cx + side * 6 - 1.5, g['sky'] - 7, 3, 3, PK)
    p.e(cx - 6, g['shy'] - 2, 12, 5, W); p.e(cx - 2, g['shy'] + 1, 4, 3, PK)
    return lambda: (p.e(cx - g['hw'] / 2 + 1, g['hy'] + 1, g['hw'] - 2, 5, W), [p.e(cx + s * 7 - 2, g['hy'] + 1, 4, 3, PK) for s in (-1, 1)])

def c_gothic(p, g):
    B, W, G = '#211C26', '#EEE8F0', '#9A94AA'
    legs(p, g, '#1E1A24', '#121016', sock_top=g['way'] + 18)
    torso(p, g, B); skirt(p, g, B, layers=(G, '#3A3446'))
    arms(p, g, B, cuff=G, puff=2)
    cx = g['cx']
    p.poly([(cx - 5, g['shy'] + 5), (cx + 5, g['shy'] + 5), (cx + g['wa'] - 1, g['way']), (cx - g['wa'] + 1, g['way'])], W)
    for i in range(5):
        y = g['shy'] + 7 + i * 2.6
        p.line([(cx - 3, y), (cx + 3, y + 1.6)], B, 0.7); p.line([(cx + 3, y), (cx - 3, y + 1.6)], B, 0.7)
    p.e(cx - 5, g['shy'] - 1, 10, 5, B); p.e(cx - 1.2, g['shy'] + 1, 2.4, 2.4, '#E0E0F0')
    return lambda: (p.e(cx - g['hw'] / 2 + 1, g['hy'] - 2, g['hw'] - 2, 6, B), p.e(cx - 2, g['hy'] - 1, 4, 3, G))

def c_police(p, g):
    SH, NV, GD = '#92B6E2', '#24346A', '#E8C35A'
    legs(p, g, '#F0EEF2', '#1E1A22', sock_top=g['sky'] + 6)
    torso(p, g, SH); skirt(p, g, NV)
    arms(p, g, SH, cuff='#7A9ACC', puff=1)
    cx = g['cx']
    p.poly([(cx - 1.5, g['shy']), (cx + 1.5, g['shy']), (cx + 2, g['shy'] + 12), (cx, g['shy'] + 14), (cx - 2, g['shy'] + 12)], NV)
    for s in (-1, 1): p.r(cx + s * (g['sh'] - 4) - 1.5, g['shy'] - 1, 3, 2, GD)
    p.r(cx - g['wa'], g['way'] - 1, 2 * g['wa'], 2, '#1A2650')
    def hat():
        p.e(cx - g['hw'] / 2 - 1, g['hy'] - 6, g['hw'] + 2, 12, NV)
        p.e(cx - g['hw'] / 2 - 3, g['hy'] + 3, g['hw'] + 6, 4, '#141E3E')
        p.e(cx - 2, g['hy'] - 3, 4, 4, GD)
    return hat

def c_marine(p, g):
    NV, W, GR = '#2C3E7A', '#F6F6FA', '#8A8EA6'
    legs(p, g, '#F6F6FA', '#2A2228', sock_top=g['sky'] + 4)
    torso(p, g, NV); skirt(p, g, NV, layers=(W,))
    arms(p, g, W, puff=2.5)
    cx = g['cx']
    p.poly([(cx - 7, g['shy'] - 1), (cx + 7, g['shy'] - 1), (cx, g['shy'] + 8)], W)
    p.poly([(cx - 4, g['shy'] + 3), (cx + 4, g['shy'] + 3), (cx + 2, g['shy'] + 11), (cx - 2, g['shy'] + 11)], GR)
    p.r(cx - g['wa'], g['way'] - 1.5, 2 * g['wa'], 2.5, '#1A2650')
    def beret():
        p.e(cx - g['hw'] / 2 - 4, g['hy'] - 5, g['hw'] + 4, 11, NV)
        p.r(cx - g['hw'] / 2 - 2, g['hy'] + 3, g['hw'] + 2, 1.5, W)
    return beret

def c_idol(p, g):
    PK, PK2, W, Y = '#F6A8C6', '#EE7AA6', '#FFFFFF', '#FFE07A'
    legs(p, g, W, PK2, sock_top=g['sky'] + 3)
    torso(p, g, PK); skirt(p, g, PK, layers=(PK2, W, Y))
    arms(p, g, W, cuff=PK2, puff=3)
    cx = g['cx']
    for i in range(-3, 4):
        p.line([(cx + i * 3, g['shy'] + 2), (cx + i * 3 + 4, g['way'])], '#FFD0E2', 0.6)
    p.e(cx - 6, g['shy'] - 1, 5, 5, PK2); p.e(cx + 1, g['shy'] - 1, 5, 5, PK2); p.e(cx - 1.5, g['shy'], 3, 3, Y)
    return lambda: [p.e(cx + s * 6 - 4, g['hy'] - 3, 8, 6, PK2) for s in (-1, 1)]

def c_pirate(p, g):
    BL, BL2, GD, CR = '#7EC4E6', '#3E8EB8', '#D8B04A', '#F4EBD6'
    legs(p, g, '#1E1A22', '#2A2228', boots=True, sock_top=g['sky'])
    torso(p, g, BL); skirt(p, g, BL, layers=(BL2, '#8A7A8A'))
    arms(p, g, CR, cuff=BL, long_sleeve=True, wide=1)
    cx = g['cx']
    p.poly([(cx - 4, g['shy']), (cx + 4, g['shy']), (cx + 3, g['shy'] + 10), (cx - 3, g['shy'] + 10)], CR)
    for s in (-1, 1): p.r(cx + s * g['sh'] - (5 if s > 0 else 0), g['shy'] - 2, 5, 2, GD)
    p.r(cx - g['wa'], g['way'] - 2.5, 2 * g['wa'], 3, '#6A4A30'); p.r(cx - 1.5, g['way'] - 2.5, 3, 3, GD)
    def hat():
        p.poly([(cx - g['hw'] / 2 - 9, g['hy'] + 2), (cx + g['hw'] / 2 + 9, g['hy'] + 2), (cx + 8, g['hy'] - 9), (cx - 8, g['hy'] - 9)], BL)
        p.line([(cx - g['hw'] / 2 - 9, g['hy'] + 2), (cx + g['hw'] / 2 + 9, g['hy'] + 2)], GD, 1.2)
    return hat

# ---------------- キャラクター ----------------
BASE = dict(skin='#F8DCCB', skin2='#ECBFA8', iris='#5A3A4A', iris2='#9A6A8A', brow='#4A3030', hairhi='#5A5060')

# キャラ（顔・髪・体）。ランクとの対応は RANKS。ランクの中身はここには書かない
PEOPLE = {
    'b1': ('type2', dict(hair='#6A4636', hair2='#58392C', hairhi='#9A7060', hairstyle='long', bangs='side', eyes='normal', mouth='smile')),
    'b2': ('type2', dict(hair='#3A2A2A', hair2='#2A1E1E', hairstyle='dread', bangs='messy', eyes='normal', mouth='smile', skin='#C88A68', skin2='#B07458')),
    'c1': ('type3', dict(hair='#5A3A2A', hair2='#4A2E22', hairhi='#8A6050', hairstyle='short', bangs='side', eyes='normal', mouth='open', jaw=3)),
    'd1': ('type3', dict(hair='#7A6A4A', hair2='#5A4A34', hairhi='#9A8A6A', hairstyle='short', bangs='messy', eyes='small', mouth='grin_gap', bignose=True, unibrow=True, brow='#3A2A1A', freckles=True, jaw=5, blush=False, mole=(-8, 10))),
    'd2': ('type4', dict(hair='#3A3030', hair2='#2A2222', hairstyle='short', bangs='messy', eyes='small', mouth='grin_gap', bignose=True, unibrow=True, brow='#2A1A1A', stubble=True, jaw=6, blush=False)),
}
RANKS = {'B': ['b1', 'b2'], 'C': ['c1'], 'D': ['d1', 'd2']}   # B〜D の仮の絵。A・S は新キャラ（af1〜5・am1〜5。dev/slice_sheets.py で切り出す）に置きかわった（β0.2.0）
COSTUMES = {'maid': c_maid, 'gothic': c_gothic, 'police': c_police, 'marine': c_marine, 'idol': c_idol, 'pirate': c_pirate}

def render(person, costume):
    global ch
    body, opts = PEOPLE[person]
    ch = dict(BASE); ch.update(opts)
    p = P(); g = geom(body)
    hair_back(p, g)
    post = COSTUMES[costume](p, g)
    cloth_detail(p, g)
    head(p, g); face(p, g); face_detail(p, g); hair_front(p, g); hair_detail(p, g)
    if post: post()
    return finish(p)

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    ims = {}
    for person in PEOPLE:
        for cos in COSTUMES:
            im = render(person, cos); ims[person, cos] = im
            im.save(os.path.join(OUT, f'{person}-{cos}.png'), optimize=True)
    # 一覧（dev/ は公開しない）
    sheet = Image.new('RGB', (len(COSTUMES) * (FW + 10) + 10, len(PEOPLE) * (FH + 10) + 10), '#FBF4EA')
    for i, person in enumerate(PEOPLE):
        for j, cos in enumerate(COSTUMES):
            im = ims[person, cos]; sheet.paste(im, (10 + j * (FW + 10), 10 + i * (FH + 10)), im)
    sheet.save(os.path.join(HERE, 'concafe-sheet.png'))
    print('ok', len(ims))

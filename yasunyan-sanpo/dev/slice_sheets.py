"""Aランクの立ち絵シート（1 枚に女性 5 人・男性 5 人）を 1 人ずつ背景透明の PNG に切り出す。

使い方：
    python3 yasunyan-sanpo/dev/slice_sheets.py <シート画像のあるフォルダ> [衣装ID ...]
出力：yasunyan-sanpo/img/concafe/<キャラ>-<衣装>.png （キャラ＝af1〜af5（女性）・am1〜am5（男性）。左から 1〜5）
      yasunyan-sanpo/dev/slice-check/<衣装>.png （切り出し結果の確認用の一覧。公開しない）
シートの元画像は公開しない（リポジトリにも入れない）。ファイル名はシートの先頭 8 文字で `SHEETS` に対応させている。
"""
import sys, os, glob
import numpy as np
from PIL import Image
import cv2
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'img', 'concafe')
CHECK = os.path.join(HERE, 'slice-check')

# 衣装ID : (シートのファイル名の先頭, 背景との色の近さのしきい値)
SHEETS = {
    'maid':    ('0411a858', 26),
    'police':  ('6b4f4f63', 26),
    'pirate':  ('2230c924', 26),
    'formal':  ('b80337db', 20),
    'kyonshi': ('2dec444e', 26),
    'gothic':  ('abd29f91', 26),
    'maid2':   ('09169eb9', 26),
    'pastel':  ('f7a62c36', 16),
    'loli':    ('ddb292f8', 16),
    'dogear':  ('3eac1d4f', 26),
    'neon':    ('c9afe4d0', 30),
}

# ラベルがうまく見つからないシートは、位置を直接書く（元画像の画素。cx＝列の中心、rows＝2 段のラベルの上端と下端）
OVERRIDE = {
    'loli': {'cx': [136, 365, 610, 887, 1091], 'rows': [(604, 637), (1185, 1219)], 'xmin': 84},
    # neon：左端のタグと、5 人目のそばのネオンの飾り文字を消す（切り出したあとの縦横の割合で指定）
    'neon': {'cx': None, 'rows': None, 'xmin': 56, 'wipe': {(0, 0): [(0.0, 0.0, 0.09, 1.0)], (1, 0): [(0.0, 0.0, 0.09, 1.0)], (0, 4): [(0.93, 0.0, 1.0, 1.0), (0.62, 0.66, 1.0, 1.0)], (1, 4): [(0.72, 0.66, 1.0, 1.0)]}},
}

def bg_color(a):
    """背景色＝画像でいちばん多い色（縁の飾りに引きずられない）"""
    q = (a // 8).reshape(-1, 3)
    key = q[:, 0].astype(np.int32) * 1024 + q[:, 1] * 32 + q[:, 2]
    top = np.bincount(key).argmax()
    m = key == top
    return np.median(a.reshape(-1, 3)[m], axis=0)

def local_bg(a):
    """ゆるやかに変わる背景（ストライプ・グラデーション）に対応するため、細かい色を平らにした背景色の画像を作る"""
    small = cv2.resize(a, (a.shape[1] // 8, a.shape[0] // 8), interpolation=cv2.INTER_AREA)
    k = np.ones((9, 9), np.uint8)
    # 明るい方・暗い方の外れ値を落とすメディアン
    med = cv2.medianBlur(small, 9)
    return cv2.resize(med, (a.shape[1], a.shape[0]), interpolation=cv2.INTER_LINEAR)

def foreground(a, thr):
    bg = bg_color(a)
    d = np.sqrt(((a.astype(np.int32) - bg.astype(np.int32)) ** 2).sum(axis=2))
    bglike = d < thr
    lab, n = ndi.label(bglike)
    sizes = ndi.sum(bglike, lab, range(1, n + 1))
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    isbg = np.zeros(n + 1, bool)
    for i in range(1, n + 1):
        # 外とつながった背景は抜く。かこまれた小さなすきま（腕と体のあいだなど）は、
        # 背景とほぼ同じ色のときだけ抜く（白い肌・白い服が穴にならないように）
        if i in border:
            isbg[i] = True
        elif sizes[i - 1] > 150:
            m = lab == i
            if d[m].max() < 7:
                isbg[i] = True
    return ~isbg[lab]

def find_pills(fg):
    lab, n = ndi.label(fg, structure=np.ones((3, 3)))
    objs = ndi.find_objects(lab)
    h, w = fg.shape
    pills = []
    for i, sl in enumerate(objs, 1):
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        bw, bh = x1 - x0, y1 - y0
        if 18 <= bh <= 64 and 80 <= bw <= 300 and bw / bh > 2.4 and y0 > h * 0.3:
            pills.append((x0, y0, x1, y1))
    return pills

def layout(pills, w, override=None):
    """ラベルの位置から、列の中心 cxs（5 つ）と、2 段のラベルの上端・下端を決める。
    ラベルが人の足と重なって見つからないことがあるので、見つかったものから補う。"""
    if override and override.get('cx'):
        return override['cx'], override['rows']
    pills = [p for p in pills if p[2] - p[0] < 300]
    ys = [(p[1] + p[3]) / 2 for p in pills]
    mid = (min(ys) + max(ys)) / 2
    rows = [[p for p, y in zip(pills, ys) if y < mid], [p for p, y in zip(pills, ys) if y >= mid]]
    cs = sorted((p[0] + p[2]) / 2 for p in pills)
    pitch0 = w / 5.3
    cols = {}
    first = min(cs)
    for c in cs:
        k = int(round((c - first) / pitch0))
        cols.setdefault(k, []).append(c)
    ks = sorted(cols)
    if ks != [0, 1, 2, 3, 4]:
        return None
    cx = [float(np.median(cols[k])) for k in ks]
    rr = [(int(np.median([p[1] for p in r])), int(np.median([p[3] for p in r]))) for r in rows]
    return cx, rr

def cut(a, fg, zone, cxs, pitch, k):
    x0, y0, x1, y1 = zone
    cx = cxs[k]
    lx, rx = int(max(0, cx - pitch * 0.5)), int(min(a.shape[1], cx + pitch * 0.5))
    m = np.zeros_like(fg); m[y0:y1, lx:rx] = fg[y0:y1, lx:rx]
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)) > 0
    lab, n = ndi.label(m, structure=np.ones((3, 3)))
    if n == 0: return None
    sizes = ndi.sum(m, lab, range(1, n + 1))
    # 中心に近い大きなかたまりを本体にする
    best, bs = None, 0
    cen = ndi.center_of_mass(m, lab, range(1, n + 1))
    for i in range(n):
        if sizes[i] < 1500: continue
        score = sizes[i] * (1 - min(0.9, abs(cen[i][1] - cx) / pitch))
        if score > bs: best, bs = i + 1, score
    if best is None: return None
    sl = ndi.find_objects((lab == best).astype(np.uint8))[0]
    bx0, bx1, by0, by1 = sl[1].start, sl[1].stop, sl[0].start, sl[0].stop
    keep = lab == best
    # 本体のすぐそばの小さな部品（髪のはしなど）は足す。左右の人の持ちものは足さない
    for i in range(1, n + 1):
        if i == best or sizes[i - 1] < 30: continue
        s2 = ndi.find_objects((lab == i).astype(np.uint8))[0]
        px0, px1, py0, py1 = s2[1].start, s2[1].stop, s2[0].start, s2[0].stop
        near = px0 >= bx0 - 3 and px1 <= bx1 + 3 and py0 >= by0 - 3 and py1 <= by1 + 3
        c = cen[i - 1]
        if near and abs(c[1] - cx) < pitch * 0.45 and sizes[i - 1] < sizes[best - 1] * 0.5:
            keep |= lab == i
    return keep

def slice_sheet(cos, path, thr):
    a = np.array(Image.open(path).convert('RGB'))
    fg = foreground(a, thr)
    pills = find_pills(fg)
    h, w = fg.shape
    lay = layout(pills, w, OVERRIDE.get(cos))
    if lay is None:
        print(cos, 'ラベルが見つからない'); return None
    cx, rr = lay
    xmin = OVERRIDE.get(cos, {}).get('xmin')
    if xmin: fg[:, :xmin] = False
    cxs_rows = [cx, cx]
    pitch = float(np.median(np.diff(cx)))
    tops = [r[0] for r in rr]
    bots = [r[1] for r in rr]
    zones = [(0, int(h * 0.115), w, tops[0] - 2), (0, bots[0] + 2, w, tops[1] - 2)]
    figs = []
    for r in range(2):
        for k in range(5):
            keep = cut(a, fg, zones[r], cxs_rows[r], pitch, k)
            if keep is None:
                print(cos, r, k, '見つからない'); figs.append(None); continue
            ys, xs = np.where(keep)
            y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            alpha = cv2.erode(keep.astype(np.uint8) * 255, np.ones((3, 3), np.uint8))
            alpha = cv2.GaussianBlur(alpha, (0, 0), 0.7)
            rgba = np.dstack([a, alpha])[y0:y1, x0:x1].copy()
            for (fx0, fy0, fx1, fy1) in OVERRIDE.get(cos, {}).get('wipe', {}).get((r, k), []):
                hh, ww = rgba.shape[:2]
                rgba[int(hh * fy0):int(hh * fy1), int(ww * fx0):int(ww * fx1), 3] = 0
            nz = np.where(rgba[:, :, 3] > 0)
            rgba = rgba[nz[0].min():nz[0].max() + 1, nz[1].min():nz[1].max() + 1]
            figs.append(Image.fromarray(rgba, 'RGBA'))
    return figs

def main():
    src = sys.argv[1]
    only = sys.argv[2:] or list(SHEETS)
    os.makedirs(OUT, exist_ok=True); os.makedirs(CHECK, exist_ok=True)
    for cos in only:
        pre, thr = SHEETS[cos]
        f = glob.glob(os.path.join(src, pre + '*'))
        if not f: print(cos, 'シートなし'); continue
        figs = slice_sheet(cos, f[0], thr)
        if not figs: continue
        names = [f'af{i}' for i in range(1, 6)] + [f'am{i}' for i in range(1, 6)]
        # 一覧（確認用）
        H = 360; sheet = Image.new('RGB', (5 * 190, 2 * (H + 6)), (58, 36, 20))
        for i, (nm, im) in enumerate(zip(names, figs)):
            if im is None: continue
            # 同じ衣装の 10 人は、背の高さをそろえて保存する
            sc = 480 / max(im.height, 1)
            big = im.resize((max(1, round(im.width * sc)), 480), Image.LANCZOS)
            q = big.quantize(colors=200, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
            q.save(os.path.join(OUT, f'{nm}-{cos}.png'), optimize=True)
            t = im.resize((max(1, round(im.width * H / im.height)), H), Image.LANCZOS)
            sheet.paste(t, ((i % 5) * 190 + (190 - t.width) // 2, (i // 5) * (H + 6)), t)
        sheet.save(os.path.join(CHECK, cos + '.png'))
        print(cos, 'ok', [None if f is None else f.size for f in figs][:3])

if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""荒野開拓記（仮） スクリーンショットの画素の差（dev フォルダは公開されない）
使い方：python3 machizukuri/dev/shots-diff.py <前の置き場> <あとの置き場> [前の名前の頭=before] [あとの名前の頭=after] [しきい値=8]
同じ名前の画像（頭だけちがう）を組にして、「どれかの色（R・G・B）の差がしきい値を超える画素」の割合を構図ごとに出す。
0.5% 以下ならよい（柵ぎわの塗り・ゆれ・草の風の時間の差は出てよい）。超えた構図は並べた画像（<あと>/diff-<名前>.png）を書く。"""
import sys, os
from PIL import Image, ImageChops

a_dir, b_dir = sys.argv[1], sys.argv[2]
a_tag = sys.argv[3] if len(sys.argv) > 3 else 'before'
b_tag = sys.argv[4] if len(sys.argv) > 4 else 'after'
thr = int(sys.argv[5]) if len(sys.argv) > 5 else 8
worst = 0.0
bad = []
for f in sorted(os.listdir(a_dir)):
    if not (f.startswith(a_tag + '-') and f.endswith('.png')):
        continue
    name = f[len(a_tag) + 1:]
    g = os.path.join(b_dir, b_tag + '-' + name)
    if not os.path.exists(g):
        print('なし', name); continue
    A = Image.open(os.path.join(a_dir, f)).convert('RGB'); B = Image.open(g).convert('RGB')
    if A.size != B.size:
        print('大きさがちがう', name, A.size, B.size); bad.append(name); continue
    d = ImageChops.difference(A, B)
    mx = ImageChops.lighter(ImageChops.lighter(d.getchannel(0), d.getchannel(1)), d.getchannel(2))
    hist = mx.histogram()
    over = sum(hist[thr + 1:])
    ratio = over / (A.size[0] * A.size[1]) * 100
    worst = max(worst, ratio)
    mark = '' if ratio <= 0.5 else '  ← 0.5% 超え'
    print('%-28s %.4f%%%s' % (name[:-4], ratio, mark))
    if ratio > 0.5:
        bad.append(name)
        w, h = A.size
        out = Image.new('RGB', (w * 3, h)); out.paste(A, (0, 0)); out.paste(B, (w, 0))
        out.paste(mx.point(lambda v: 255 if v > thr else 0).convert('RGB'), (w * 2, 0))
        out.save(os.path.join(b_dir, 'diff-' + name))
print('最大 %.4f%%' % worst)
sys.exit(1 if bad else 0)

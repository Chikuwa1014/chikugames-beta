# common/lib/ — 外部ライブラリ

ゲームで使うライブラリは CDN から読まず、ここに `<名前>/<版数>/` で置いて配る（号口 `CLAUDE.md` 8 章、2026-11-08）。
ライセンスの文書は同じフォルダに置く。版を上げるときは新しい版数のフォルダを作り、公開済みのゲームが使う古い版は消さない。

| ライブラリ | 版 | ファイル | ライセンス | 使っているゲーム |
|---|---|---|---|---|
| Babylon.js（3D） | 7.54.3 | `babylon/7.54.3/babylon.js`（npm の `babylonjs` そのまま） | Apache-2.0（`license.md`・`NOTICE.md`） | `kenkyujo`（サイレント夜（仮）） |
| three.js（3D） | 0.170.0 | `three/0.170.0/three.module.min.js`（npm の `three` そのまま）と `addons/`（光のにじみに使う分だけ） | MIT（`LICENSE`） | `gomibako-shooter`（号口へ昇格。号口にも同じものを置いた） |

読み込み：`<script src="../common/lib/babylon/7.54.3/babylon.js"></script>`（グローバルの `BABYLON` ができる）。
three.js は ES モジュール。importmap で `"three": "../common/lib/three/0.170.0/three.module.min.js"` と `"three/addons/": "../common/lib/three/0.170.0/addons/"` を書いて `import * as THREE from 'three'`。

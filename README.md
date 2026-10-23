# ちくわゲームズ β

βテスト用リポジトリ。リポジトリのルートがそのまま Cloudflare の専用 Worker（`chikuwagames-beta`。https://chikuwagames-beta.chikuwa-hookah.workers.dev/）で公開されます。

- `index.html`：ベータのトップ。開くと、ちくわげーむず本番（https://chikuwa-games.chikuwa-hookah.workers.dev/）のトップへ自動で移動する
- `cards.js`：本番トップの「Beta」欄に出すカード（紹介文・版数・サムネイル）。本番トップがこのファイルを読み込むので、βのゲームを増やしたらここに1件足して push するだけで本番トップに出る
- `gatasu/index.html`：がたす、モテる。のベータ（`/gatasu/`。β0.1.0）。本番の `gatasu/` から `index.html` だけを写したもの
- `voxel-quiz/index.html`：ぬがせて！ボクセルクイズのベータ（`/voxel-quiz/`。β0.1.0。A・ア＝一辺4倍、体型・身長スライダー）

本番（`Chikuwa1014/chikugames`）とは別。OK になった内容を本番の同じ名前のフォルダに移します。

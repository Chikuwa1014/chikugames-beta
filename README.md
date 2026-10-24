# ちくわゲームズ β

βテスト用リポジトリ。リポジトリのルートがそのまま Cloudflare の専用 Worker（`chikuwagames-beta`。https://chikuwagames-beta.chikuwa-hookah.workers.dev/）で公開されます。

- `index.html`：ベータのトップ。開くと、ちくわげーむず本番（https://chikuwa-games.chikuwa-hookah.workers.dev/）のトップへ自動で移動する
- `cards.js`：本番トップの「Beta」欄に出すカード（紹介文・版数・サムネイル）。本番トップがこのファイルを読み込むので、βのゲームを増やしたらここに1件足して push するだけで本番トップに出る
- `gatasu/index.html`：がたす、モテる。のベータ（`/gatasu/`。β0.1.0）。本番の `gatasu/` から `index.html` だけを写したもの
- `voxel-quiz/index.html`：ぬがせて！ボクセルクイズのベータ（`/voxel-quiz/`。β0.1.0。A・ア＝一辺4倍、体型・身長スライダー）
- `hayaoshi-chikupon/index.html`：早押し！ちくぽん！のベータ（`/hayaoshi-chikupon/`。β0.1.0。ひとりは合図3種類・みんなで最大8人。マルチは `worker/index.js` の仲介を使う）
- `common/v1/`：共通部品（本番と同じ中身。β から読む）
- `worker/index.js`：マルチの仲介（本番と同じ `MultiRoom`）。`WS_GAMES` にマルチを使うβのゲームを書く
- `dev/`：手元のテスト（ゲームごと。公開しない）

本番（`Chikuwa1014/chikugames`）とは別。OK になった内容を本番の同じ名前のフォルダに移します。

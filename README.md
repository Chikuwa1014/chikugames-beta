# ちくわゲームズβ

βテスト用リポジトリ。リポジトリのルートがそのまま Cloudflare の専用 Worker（`chikuwagames-beta`）で公開されます。βのアドレスは https://beta-games.chikuwa-hookah.com/ （https://chikuwagames-beta.chikuwa-hookah.workers.dev/ でも開けます）。

ルールは号口（`Chikuwa1014/chikugames`）の `CLAUDE.md` を参照してください。ここにはβ版だけの事実を書いています（`CLAUDE.md`）。

- `index.html`：ベータのトップ（ちくわゲームズβ）。`cards.js` のβのゲームを一覧で並べる
- `cards.js`：本番トップの「Beta」欄に出すカード（紹介文・版数・サムネイル・鍵または開発中）
- `shisaku/`：号口トップの試作環境（どこからもリンクしない）
- `gatasu/index.html`：がたす、モテる。のベータ（`/gatasu/`。β0.1.0・限定公開）
- `voxel-quiz/index.html`：ぬがせて！ボクセルクイズのベータ（`/voxel-quiz/`。β0.1.0・β公開（鍵なし））
- `ikuiku-sumo/index.html`：いくいく！雲紅亭珍光〜すもう編〜のベータ（`/ikuiku-sumo/`。β0.3.3・限定公開（鍵付き））
- `horimogu/index.html`：ほりほりもぐもぐのベータ（`/horimogu/`。β0.3.2・開発に公開）
- `yasunyan-sanpo/`：やすにゃんこんにゃん！散歩チュウ（`β0.7.2`。開発に公開。仕様と引き継ぎは `CLAUDE.md`）
- `ugokase-chikuwa/`：うごかせ！ちくわくん（`β0.3.0`。開発に公開。仕様と引き継ぎは `CLAUDE.md`）
- `hayaoshi-chikupon/`：早押し！ちくぽん！は 2026-10-24 に号口へ昇格。号口のページへ移動するだけのページを残している
- `common/v1/`：共通部品（本番と同じ中身）
- `worker/index.js`：マルチの仲介（本番と同じ `MultiRoom`）
- `dev/`・`claude/`・各ゲームの `dev/`：手元のテスト・引き継ぎ（公開しない）

# ちくわゲームズ β

βテスト用リポジトリ。リポジトリのルートがそのまま Cloudflare の専用 Worker（`chikuwagames-beta`。https://chikuwagames-beta.chikuwa-hookah.workers.dev/）で公開されます。

ルールは号口（`Chikuwa1014/chikugames`）の `CLAUDE.md` を参照してください。ここにはβ版だけの事実を書いています（`CLAUDE.md`）。

- `index.html`：ベータのトップ。開くと、ちくわげーむず本番（https://chikuwa-games.chikuwa-hookah.workers.dev/）のトップへ自動で移動する
- `cards.js`：本番トップの「Beta」欄に出すカード（紹介文・版数・サムネイル・鍵または開発中）
- `shisaku/`：号口トップの試作環境（どこからもリンクしない）
- `gatasu/index.html`：がたす、モテる。のベータ（`/gatasu/`。β0.1.0・限定公開）
- `voxel-quiz/index.html`：ぬがせて！ボクセルクイズのベータ（`/voxel-quiz/`。β0.1.0・限定公開）
- `ikuiku-sumo/index.html`：いくいく！雲紅亭珍光〜すもう編〜のベータ（`/ikuiku-sumo/`。β0.3.0・開発に公開）
- `hayaoshi-chikupon/`：早押し！ちくぽん！は 2026-10-24 に号口へ昇格。号口のページへ移動するだけのページを残している
- `common/v1/`：共通部品（本番と同じ中身）
- `worker/index.js`：マルチの仲介（本番と同じ `MultiRoom`）
- `dev/`・`claude/`・各ゲームの `dev/`：手元のテスト・引き継ぎ（公開しない）

# ちくわゲームズ β

βテスト用リポジトリ。リポジトリのルートがそのまま Cloudflare の専用 Worker（`chikuwagames-beta`。https://chikuwagames-beta.chikuwa-hookah.workers.dev/）で公開されます。

ルールは正式版（`Chikuwa1014/chikugames`）の `CLAUDE.md` を参照してください。ここにはβ版だけの事実を書いています（`CLAUDE.md`）。

- `index.html`：ベータのトップ。開くと、ちくわげーむず本番（https://chikuwa-games.chikuwa-hookah.workers.dev/）のトップへ自動で移動する
- `cards.js`：本番トップの「Beta」欄に出すカード（紹介文・版数・サムネイル・鍵または開発中）
- `shisaku/`：正式版トップの試作環境（どこからもリンクしない）
- `gatasu/index.html`：がたす、モテる。のベータ（`/gatasu/`。β0.1.0・限定公開）
- `voxel-quiz/index.html`：ぬがせて！ボクセルクイズのベータ（`/voxel-quiz/`。β0.1.0・限定公開）
- `hayaoshi-chikupon/`：早押し！ちくぽん！（β0.1.0・開発に公開。URL を知っている人だけが開ける。トップのカードにはリンクなし）
- `common/v1/`：共通部品（本番と同じ中身）
- `worker/index.js`：マルチの仲介（本番と同じ `MultiRoom`）
- `dev/`・`claude/`・各ゲームの `dev/`：手元のテスト・引き継ぎ（公開しない）

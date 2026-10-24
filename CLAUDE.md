# ちくわゲームズ β（chikugames-beta）

**このリポジトリのルールは、号口リポジトリ `Chikuwa1014/chikugames` の `CLAUDE.md` に準拠する。**
公開のルール（環境・push・公開の種類・試作環境・テスト）は、号口の `CLAUDE.md` の 3 章と 11 章・12 章を読む。ここには β版だけの事実を書く。

## β版だけの事実

- 公開先：Worker `chikuwagames-beta`（https://chikuwagames-beta.chikuwa-hookah.workers.dev/）。リポジトリのルートがそのまま公開される（公開しないファイルは `.assetsignore` に書く）。
- `index.html`：β のトップ。開くと号口のトップへ自動で移動する。
- `cards.js`：号口トップの「Beta」欄に出すカード。カードの書き方（`lock`・`dev`・`href`・`version`）は号口の `CLAUDE.md` 3 章「β版のカードの書き方」。
- `shisaku/`：号口トップの試作環境。**どこからもリンクしない。** URL は、ユーザーへの返答にだけ書く。
- `hayaoshi-chikupon/`：「開発に公開」。URL を知っている人だけが開ける。トップのカードはぼかして「開発中」とし、リンクは貼らない。URL は文書には書かず、会話の中でだけ共有する。
- 公開の状態の流れ（開発に公開 → β公開 → 号口）は、号口の `CLAUDE.md` 3 章を参照する。
- マルチプレイの仲介は `worker/index.js`（本番と同じ `MultiRoom`。`WS_GAMES` に β のマルチのゲームを書く）。`common/v1/` は本番と同じ中身にそろえる。
- 版数は頭に `β` を付ける（例：`β0.1.0`）。

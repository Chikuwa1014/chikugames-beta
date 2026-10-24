# ちくわゲームズ β（chikugames-beta）

**このリポジトリのルールは、正式版リポジトリ `Chikuwa1014/chikugames` の `CLAUDE.md` に準拠する。**
公開のルール（環境・push・公開の種類・試作環境・テスト）は、正式版の `CLAUDE.md` の 3 章と 11 章・12 章を読む。ここには β版だけの事実を書く。

## β版だけの事実

- 公開先：Worker `chikuwagames-beta`（https://chikuwagames-beta.chikuwa-hookah.workers.dev/）。リポジトリのルートがそのまま公開される（公開しないファイルは `.assetsignore` に書く）。
- `index.html`：β のトップ。開くと正式版のトップへ自動で移動する。
- `cards.js`：正式版トップの「Beta」欄に出すカード。カードの書き方（`lock`・`dev`・`href`・`version`）は正式版の `CLAUDE.md` 3 章「β版のカードの書き方」。
- `shisaku/`：正式版トップの試作環境。**どこからもリンクしない。** URL は、ユーザーへの返答にだけ書く。
- `hayaoshi-chikupon/` は、いまは「開発に公開」。`.assetsignore` で公開せず、URL は開けない。公開するときは `.assetsignore` の該当行を消す（正式版の 3 章に従い、開発者の指示を仰いでから）。
- マルチプレイの仲介は `worker/index.js`（本番と同じ `MultiRoom`。`WS_GAMES` に β のマルチのゲームを書く）。`common/v1/` は本番と同じ中身にそろえる。
- 版数は頭に `β` を付ける（例：`β0.1.0`）。

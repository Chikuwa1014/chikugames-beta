# ちくわゲームズ β（chikugames-beta）

**このリポジトリのルールは、正式版リポジトリ `Chikuwa1014/chikugames` の `CLAUDE.md` に準拠する。**
作業を始める前に、正式版の `CLAUDE.md`（とくに「進め方」「push のルール」「ベータ版として公開するとき」）を読む。
ここには β版だけの差分を書く。正式版の内容と食いちがうときは、正式版の `CLAUDE.md` を優先する。

## β版だけの差分

- 公開先：Worker `chikuwagames-beta`（https://chikuwagames-beta.chikuwa-hookah.workers.dev/）。リポジトリのルートがそのまま公開される（公開しないファイルは `.assetsignore` に書く）。
- `index.html`：β のトップ。開くと正式版のトップへ自動で移動する。β の各ゲームは `/<フォルダ>/` で直接開く。
- `cards.js`：正式版トップの「Beta」欄に出すカード。β のゲームを増やしたら 1 件足す（`href` は β の絶対 URL、版数は `β` 付き）。限定公開にするカードは `lock` にパスワードの SHA-256 を書く。
- push するときは、鍵（`lock`）の有無を択一のカードで確認してから。正式版と同時に push しない。
- 正式版への昇格は「正式版へ push」「正式版に昇格」などの指示があったときだけ。正式版に同じ名前のフォルダを移して `card.js` を作り、`cards.js` からは消す。

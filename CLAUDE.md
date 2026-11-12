# ちくわゲームズβ（chikugames-beta）

**このリポジトリのルールは、号口リポジトリ `Chikuwa1014/chikugames` の `CLAUDE.md` に準拠する。**
公開のルール（環境・push・公開の種類・試作環境・テスト）は、号口の `CLAUDE.md` の 3 章と 11 章・12 章を読む。ここには β版だけの事実を書く。

## β版だけの事実

- 公開先：Worker `chikuwagames-beta`。βの公開アドレスは https://beta-games.chikuwa-hookah.com/ （独自ドメイン、2026-10-27〜。`wrangler.jsonc` の `routes`）。https://chikuwagames-beta.chikuwa-hookah.workers.dev/ でも同じものが開く（号口トップは `cards.js` をこちらから読んでいる。カードの `href` は 2026-10-27 に独自ドメインへ変更）。リポジトリのルートがそのまま公開される（公開しないファイルは `.assetsignore` に書く）。
- `index.html`：β のトップ（ちくわゲームズβ）。`cards.js` のβのゲームを、号口トップの「Beta」欄と同じ出し方（鍵・開発中・成人向けは出さない）で並べる。カードの描き方を号口トップで変えたら、ここもそろえる（2026-10-27、開発者の指示で自動移動をやめた）。
- `cards.js`：号口トップの「Beta」欄に出すカード。カードの書き方（`lock`・`dev`・`href`・`version`）は号口の `CLAUDE.md` 3 章「β版のカードの書き方」。
- `shisaku/`：号口トップの試作環境。**どこからもリンクしない。** URL は、ユーザーへの返答にだけ書く。
- `hayaoshi-chikupon/`：2026-10-24 に号口へ昇格した。ここには、号口の `/hayaoshi-chikupon/` へ移動するページ（`index.html`。`?room=` などはそのまま引き継ぐ）だけを残す。開発は号口リポジトリで行う。
- 公開の状態の流れ（開発に公開 → β公開 → 号口）は、号口の `CLAUDE.md` 3 章を参照する。
- マルチプレイの仲介は `worker/index.js`（本番と同じ `MultiRoom`。`WS_GAMES` に β のマルチのゲームを書く）。`common/v1/` は本番と同じ中身にそろえる。
- 版数は頭に `β` を付ける（例：`β0.1.0`）。
- `common/v1/room.js` の `takeOver`・`rejoin`（親の引き継ぎ）は、2026-10-28 のほりほりもぐもぐの昇格で号口の `common/` にも入れた（号口と同じ中身）。
- `horimogu/`：2026-10-28 に号口へ昇格した。号口の `/horimogu/` へ移動するページ（`index.html`。`?room=` などは引き継ぐ）と、センサーの向きを調べる開発用ページ `calib/`（どこからもリンクしない）だけを残す。開発は号口リポジトリで行う。
- `ugokase-chikuwa/`：うごかせ！ちくわくん。2026-10-28 に「開発に公開」から直接 1.0.0 で号口へ昇格した。号口の `/ugokase-chikuwa/` へ移動するページ（`index.html`）だけを残す。開発は号口リポジトリで行う。
- `common/v1/move.js`：号口と同じ中身にそろえた（2026-10-28）。
- `kenkyujo/`：サイレント夜（仮）。3D脱出ホラー（Babylon.js）。2026-11-08 に開発に公開（β0.3.0）。β公開のときは限定公開（鍵付き）。仕様は `kenkyujo/CLAUDE.md`。
- `nukadoko/`：ぬか床そだて。2026-11-09 に β0.3.0 から 1.0.0 で号口へ昇格した。号口の `/nukadoko/` へ移動するページ（`index.html`）だけを残す。開発は号口リポジトリで行う。
- `common/lib/`：外部ライブラリ（号口 `CLAUDE.md` 8 章）。いまは Babylon.js 7.54.3 と three.js 0.170.0（`gomibako-shooter/` で使用。2026-11-08。2026-11-09 に同じものを号口にも置いた）。号口のゲームで使うときは号口にも同じものを置く。
- `gomibako-shooter/`：スタイリッシュゴミ箱シューター。2026-11-09 に号口へ昇格した（1.0.0）。号口の `/gomibako-shooter/` へ移動するページ（`index.html`）だけを残す。開発は号口リポジトリで行う。
- `chikunator/`：チクネーター。2026-11-09 に β0.3.1 から 1.0.0 で号口へ昇格した。号口の `/chikunator/` へ移動するページ（`index.html`）だけを残す。開発は号口リポジトリで行う。
- `shisaku/yokocho/`：号口トップを「おでん横丁」にする試作（2026-11-10）。どこからもリンクしない。号口のカードは `https://games.chikuwa-hookah.com/<ゲーム>/card.js` を読み、読めないときは `utsushi/` の写し（号口の `card.js` をそのままコピーしたもの）を使う。作りものの見本データは使わない。**試作やトップを変えたら、完了の前に `node shisaku/yokocho/dev/check-cards.cjs <号口のclone>` を通して、既存のカード内容と差異がないことを確かめる（2026-11-10 Chikuwa1014 の指示）。** 号口でカードを足したり変えたりしたら、写しをコピーし直す。
- `common/v1/yokocho.css`・`chara.js`・`noren.js`：おでん横丁の色・書体、ちくわくんの絵（`CG.chara`）、のれん型の戻るボタン（`CG.noren`）。2026-11-10 に β に先に足した。号口にはまだ無い。号口へ入れるのは push の指示があってから。
- `machizukuri/`：荒野開拓記（仮）。3Dまちづくり（Babylon.js）。2026-11-12 に開発に公開（β0.1.0）。仕様は `machizukuri/CLAUDE.md`。ちくわくん・おでん横丁の部品（`yokocho.css`・`chara.js`・`noren.js`）は使わない。

## 検索の分担

- 広い範囲を探すとき（過去の作り方の例・仕様・ほかのゲームでの実装など、どこにあるか分からないもの）は、検索係のサブエージェント `search`（`.claude/agents/search.md`、Haiku・読むだけ）に任せる。場所が分かっている少しのファイルを読むときは、自分で直接読む。

## モデルの使い分け（2026-11-08 Chikuwa1014 の指示。プロジェクトのルール）

- 開発スレッドの既定は Sonnet 5.5（`.claude/settings.json`）。
- 軽い調査や小さな修正は Haiku 5.5 に任せる（`search`＝広い検索、`small-fix`＝小さな修正）。
- モック作成などのアーティファクト生成は、完成度を重視して Opus 5.5 を使う（`mock-maker`）。

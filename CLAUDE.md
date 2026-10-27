# ちくわゲームズβ（chikugames-beta）

**このリポジトリのルールは、号口リポジトリ `Chikuwa1014/chikugames` の `CLAUDE.md` に準拠する。**
公開のルール（環境・push・公開の種類・試作環境・テスト）は、号口の `CLAUDE.md` の 3 章と 11 章・12 章を読む。ここには β版だけの事実を書く。

## β版だけの事実

- 公開先：Worker `chikuwagames-beta`。βの公開アドレスは https://beta-games.chikuwa-hookah.com/ （独自ドメイン、2026-10-27〜。`wrangler.jsonc` の `routes`）。https://chikuwagames-beta.chikuwa-hookah.workers.dev/ でも同じものが開く（号口トップが読む `cards.js` とカードの `href` はこちらのまま）。リポジトリのルートがそのまま公開される（公開しないファイルは `.assetsignore` に書く）。
- `index.html`：β のトップ（ちくわゲームズβ）。`cards.js` のβのゲームを、号口トップの「Beta」欄と同じ出し方（鍵・開発中・成人向けは出さない）で並べる。カードの描き方を号口トップで変えたら、ここもそろえる（2026-10-27、開発者の指示で自動移動をやめた）。
- `cards.js`：号口トップの「Beta」欄に出すカード。カードの書き方（`lock`・`dev`・`href`・`version`）は号口の `CLAUDE.md` 3 章「β版のカードの書き方」。
- `shisaku/`：号口トップの試作環境。**どこからもリンクしない。** URL は、ユーザーへの返答にだけ書く。
- `hayaoshi-chikupon/`：2026-10-24 に号口へ昇格した。ここには、号口の `/hayaoshi-chikupon/` へ移動するページ（`index.html`。`?room=` などはそのまま引き継ぐ）だけを残す。開発は号口リポジトリで行う。
- 公開の状態の流れ（開発に公開 → β公開 → 号口）は、号口の `CLAUDE.md` 3 章を参照する。
- マルチプレイの仲介は `worker/index.js`（本番と同じ `MultiRoom`。`WS_GAMES` に β のマルチのゲームを書く）。`common/v1/` は本番と同じ中身にそろえる。
- 版数は頭に `β` を付ける（例：`β0.1.0`）。
- `common/v1/room.js` に、親の引き継ぎ用の `takeOver`・`rejoin` を足している（2026-10-25、ほりほりもぐもぐ用。足すだけで、ほかのゲームのふるまいは変わらない）。号口の `common/` にはまだ無い。号口の `common/` へそろえるのは、ほりほりもぐもぐの昇格のとき（開発者の指示で）。
- `horimogu/`：ほりほりもぐもぐ（開発に公開。`WS_GAMES` に `horimogu: 8`）。

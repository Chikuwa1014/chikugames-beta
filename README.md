# ちくわゲームズβ

βテスト用リポジトリ。リポジトリのルートがそのまま Cloudflare の専用 Worker（`chikuwagames-beta`）で公開されます。βのアドレスは https://beta-games.chikuwa-hookah.com/ （https://chikuwagames-beta.chikuwa-hookah.workers.dev/ でも開けます）。

ルールは号口（`Chikuwa1014/chikugames`）の `CLAUDE.md` を参照してください。ここにはβ版だけの事実を書いています（`CLAUDE.md`）。

- `index.html`：ベータのトップ（ちくわゲームズβ）。`cards.js` のβのゲームを一覧で並べる
- `cards.js`：本番トップの「Beta」欄に出すカード（紹介文・版数・サムネイル・鍵または開発中）
- `shisaku/`：号口トップの試作環境（どこからもリンクしない）
  - `shisaku/yokocho/`：号口トップを「おでん横丁」にする試作（どこからもリンクしない）
- `gatasu/index.html`：がたす、モテる。のベータ（`/gatasu/`。β0.1.0・限定公開）
- `voxel-quiz/index.html`：ぬがせて！ボクセルクイズのベータ（`/voxel-quiz/`。β0.1.0・β公開（鍵なし））
- `ikuiku-sumo/index.html`：いくいく！雲紅亭珍光〜すもう編〜のベータ（`/ikuiku-sumo/`。β0.3.3・限定公開（鍵付き））
- `horimogu/index.html`：号口の `/horimogu/` へ移動するページ（2026-10-28 に昇格）。`horimogu/calib/` はセンサーの向きを調べる開発用ページ
- `yasunyan-sanpo/`：やすにゃんこんにゃん！散歩チュウ（`β0.7.2`。開発に公開。仕様と引き継ぎは `CLAUDE.md`）
- `ugokase-chikuwa/index.html`：号口の `/ugokase-chikuwa/` へ移動するページ（2026-10-28 に昇格）
- `hayaoshi-chikupon/`：早押し！ちくぽん！は 2026-10-24 に号口へ昇格。号口のページへ移動するだけのページを残している
- `hodoke-odensushi/`：ほどけ！おでん串（`β0.1.0`。開発に公開。仕様と引き継ぎは `CLAUDE.md`）
- `chikuwa-senro/`：つなげ！ちくわ線路（仮）（`β0.2.6`。開発に公開。2026-11-01 にゼロから作り直し。駅から出て駅にもどるルート・発車時刻・連鎖。アーケード・フリー。対戦と協力は準備中。仕様と引き継ぎは `CLAUDE.md`）
- `chikuwa-dopamine/`：ちくわでるでる！ドーパミン（`β0.2.1`。開発に公開。ミニゲーム集。仕様と引き継ぎは `CLAUDE.md`）
- `gomibako-shooter/`：スタイリッシュゴミ箱シューター。2026-11-09 に号口へ昇格（1.0.0）。号口の `/gomibako-shooter/` へ移動するページだけ残している。開発は号口リポジトリで行う
- `nukadoko/`：ぬか床そだて。2026-11-09 に号口へ昇格（1.0.0）。号口の `/nukadoko/` へ移動するページだけ残している。開発は号口リポジトリで行う
- `chikunator/`：チクネーター。2026-11-09 に号口へ昇格（1.0.0）。号口の `/chikunator/` へ移動するページだけ残している。開発は号口リポジトリで行う
- `kenkyujo/`：サイレント夜（仮）（`β0.3.0`。開発に公開。3D脱出ホラー。Babylon.js。仕様と引き継ぎは `CLAUDE.md`）
- `common/v1/`：共通部品（本番と同じ中身）
- `common/lib/`：外部ライブラリ（Babylon.js・three.js など。`common/lib/README.md`）
- `worker/index.js`：マルチの仲介（本番と同じ `MultiRoom`）
- `dev/`・`claude/`・各ゲームの `dev/`：手元のテスト・引き継ぎ（公開しない）

# スタイリッシュゴミ箱シューター

号口の `CLAUDE.md`（共通ルール）に従う。ここにはこのゲームだけの事実を書く。

## 1. 概要
夜のおでん横丁をスケボーで爆走するちくわくんが、流れてくるゴミ箱へゴミをシュートする。β0.1.0（2026-11-04）最初の試作。
Chikuwa1014 の注文（2026-11-03）：とにかくスタイリッシュに／何度でも挑戦したくなる／疾走感／演出が派手。
ドーパミン（`chikuwa-dopamine/`）のミニゲーム「ゴミ箱スロー」とは別の単独ゲーム。

- 操作：ゴミ箱をタップ＝動きを読んで確実に入る（IN）。上へフリック＝その向きへ投げる（少しだけ補正）。ど真ん中で SWISH、左右の壁で跳ね返して入れると BANK。
- 時間制：40 秒から始まり、入れると時間がのびる（最大 60 秒）。ゴミ箱を見送ると −2 秒（ボスは −4 秒）。0 で終わり。
- スタイル（ランク D・C・B・A・S・SS・SSS）：決めると上がり、何もしないと下がる。はずす・見送るとガクッと下がる。ランクが高いほど点の倍率・走る速さ・BGM のテンポが上がる。
- ボスゴミ箱：28 秒目から約 34 秒ごと。左右にゆれながらゆっくり来る。体力ぶん当てると JACKPOT（大量点・＋5 秒・スロー）。

## 2. URL
`/gomibako-shooter/`。公開の状態：開発に公開（`cards.js` に `dev: true`）。URL は会話の中でだけ共有する。

## 3. コードの地図（`index.html` 1 ファイル）
| 名前 | 役割 |
|---|---|
| `SFX` / `tone` / `noise` / `BGM` | 効果音と BGM（WebAudio で作る。音のファイルはない） |
| `reset` / `update` / `draw` / `loop` | 進行と描画（論理サイズ 360×640、`fit` で画面に合わせる） |
| `spawnPattern` / `spawnBoss` | ゴミ箱の出し方（ふつう・動く・ペア・縦3連・大きい・金） |
| `intercept` / `tapAt` / `flickDir` / `fire` | ねらい（動くゴミ箱との出会う点）とシュート |
| `hitCan` / `missBall` / `lostCan` / `addStyle` | 当たり・はずれ・見送り・ランク |
| `burst` / `ring` / `text` / `flash` / `shake` / `G.slow` | 演出（粒・輪・文字・光・ゆれ・スロー） |
| `window.GOMI` | テスト用の公開 |

## 4. 保存キー
`gomibako-shooter-v1`：`{ best, bestRank, plays, sound }`。

## 5. 調整用の数値
`index.html` の「調整用の数値」：`START_TIME`・`MAX_TIME`・`BALL_V`・`COOLDOWN`・`RANK_MUL`・`styleDecay`・`scrollSpeed`・`spawnGap`・`GAIN`（スタイルの増減）・`TIME_GAIN`・`TIME_LOST`・`BOSS_FIRST`・`BOSS_EVERY`・`ASSIST`（フリックの補正）。

## 6. テスト
リポジトリ直下で `python3 -m http.server 8765` を起動し、`node gomibako-shooter/dev/test.cjs <保存先>`（自動で 30 秒遊ぶ・タップとフリック・結果画面・リトライ・エラー・スクリーンショット）。

## 7. ゲーム固有の決まり
- リトライはすぐ：結果画面の RETRY・スペースキー・プレイ中の R キー。
- 決めたときは「音・粒・文字・光・ゆれ（`navigator.vibrate`）」をそろえる。

## 8. 残りのタスク
`claude/未実装タスク.md`。まずは Chikuwa1014 に触ってもらい、直す所を決める。

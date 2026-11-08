# スタイリッシュゴミ箱シューター

号口の `CLAUDE.md`（共通ルール）に従う。ここにはこのゲームだけの事実を書く。

## 1. 概要
夜のおでん横丁をスケボーで爆走するちくわくんが、流れてくるゴミ箱へゴミをシュートする。β0.1.0（2026-11-04）最初の試作（2D）。β0.2.0（2026-11-08）SEIJI の指示で three.js の立体に作り直した。
SEIJI の注文（2026-11-03）：とにかくスタイリッシュに／何度でも挑戦したくなる／疾走感／演出が派手。
ドーパミン（`chikuwa-dopamine/`）のミニゲーム「ゴミ箱スロー」とは別の単独ゲーム。

- 操作：ゴミ箱をタップ＝動きを読んで確実に入る（IN）。上へフリック＝その向きへ投げる（少しだけ補正）。ど真ん中で SWISH、左右の壁で跳ね返して入れると BANK。
- 時間制：40 秒から始まり、入れると時間がのびる（最大 60 秒）。ゴミ箱を見送ると −2 秒（ボスは −4 秒）。0 で終わり。
- スタイル（ランク D・C・B・A・S・SS・SSS）：決めると上がり、何もしないと下がる。はずす・見送るとガクッと下がる。ランクが高いほど点の倍率・走る速さ・BGM のテンポが上がる。
- ボスゴミ箱：28 秒目から約 34 秒ごと。左右にゆれながらゆっくり来る。体力ぶん当てると JACKPOT（大量点・＋5 秒・スロー）。

## 1.5 立体の作り
- three.js は `common/lib/three/0.170.0/`（ライセンス付き）から importmap で読む（`"three"` と `"three/addons/"`）。光のにじみ（UnrealBloomPass）を使う。
- **判定は今までどおり上から見た平面（360×640）で行い、立体は見た目だけ。** 平面→立体は `wx`・`wz`（縮尺 `SX`・`SZ`）。画面の文字・HUD は、上に重ねた 2D キャンバス（`#cv`、360×640）に描く。立体の位置を画面に写すのは `scr(x, y, 高さ)`。
- カメラはちくわくんの後ろ上から前を見る。速いほど視野（fov）が広がり、決めると一瞬寄る（`G.punch`）。ランクで道・ネオン・ちくわくんの光の色が変わり、SSS は虹色。
- タップ：画面上でタップに近いゴミ箱をねらう（動きを読む）。フリック：画面上の向きと、ちくわくん→ゴミ箱の画面上の向きのずれが `FLICK_PICK` 以内のゴミ箱をねらい、ずれ×`FLICK_ERR` だけ外す（ずれが小さいと SWISH）。
- WebGL が使えない端末は、お知らせだけ出す。

## 2. URL
`/gomibako-shooter/`。公開の状態：開発に公開（`cards.js` に `dev: true`）。URL は会話の中でだけ共有する。

## 3. コードの地図（`index.html` 1 ファイル）
| 名前 | 役割 |
|---|---|
| `sync3d` / `makeCanMesh` / `burst` / `spark` / `ring` | 立体の更新（ゴミ箱・ボール・ちくわくん・粒・輪・速さの線・カメラ） |
| `drawUi` / `drawHud` / `drawTexts` / `drawBanner` | 重ねた 2D キャンバスの文字・HUD・ランクの帯 |
| `SFX` / `tone` / `noise` / `BGM` | 効果音と BGM（WebAudio で作る。音のファイルはない） |
| `reset` / `update` / `loop` | 進行（平面 360×640。`fit` で画面に合わせる） |
| `spawnPattern` / `spawnBoss` | ゴミ箱の出し方（ふつう・動く・ペア・縦3連・大きい・金） |
| `intercept` / `tapAt` / `flickDir` / `fire` | ねらい（動くゴミ箱との出会う点）とシュート |
| `hitCan` / `missBall` / `lostCan` / `addStyle` | 当たり・はずれ・見送り・ランク |
| `text` / `flash` / `shake` / `G.slow` | 演出（文字・光・ゆれ・スロー） |
| `window.GOMI` | テスト用の公開 |

## 4. 保存キー
`gomibako-shooter-v1`：`{ best, bestRank, plays, sound }`。

## 5. 調整用の数値
`index.html` の「調整用の数値」：`START_TIME`・`MAX_TIME`・`BALL_V`・`COOLDOWN`・`RANK_MUL`・`styleDecay`・`scrollSpeed`・`spawnGap`・`GAIN`（スタイルの増減）・`TIME_GAIN`・`TIME_LOST`・`BOSS_FIRST`・`BOSS_EVERY`・`FLICK_PICK`・`FLICK_ERR`（フリックの補正）・`SPAWN_Y`（ゴミ箱の出てくる奥行き）・`SX`・`SZ`・`canR`（見た目の大きさ）。カメラの位置は `sync3d` の最後。

## 6. テスト
リポジトリ直下で `python3 -m http.server 8765` を起動し、`node gomibako-shooter/dev/test.cjs <保存先>`（自動で 30 秒遊ぶ・タップとフリック・結果画面・リトライ・エラー・スクリーンショット）。

## 7. ゲーム固有の決まり
- リトライはすぐ：結果画面の RETRY・スペースキー・プレイ中の R キー。
- 決めたときは「音・粒・文字・光・ゆれ（`navigator.vibrate`）」をそろえる。

## 8. 残りのタスク
`claude/未実装タスク.md`。まずは SEIJI に触ってもらい、直す所を決める。

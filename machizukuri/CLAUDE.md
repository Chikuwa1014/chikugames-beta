# 荒野開拓記（仮）（machizukuri）

ルールは号口の `CLAUDE.md`（全ゲーム共通）。ここにはこのゲームだけのことを書く。要件の正本は `/mnt/project-files/machizukuri/kikaku.md`、作り方の指示は `claude/開発指示.md`。

## 1. 概要

荒野にぽつんと建つ小屋から、採集・採掘・クラフトで道具をそろえ、好きな場所に道路と建物を建てて移住者を増やし、いずれ大都市まで育てる一人用の3Dまちづくり。基本は一人称、ボタンで三人称。敵・危険はなし。世界観はリアル路線（主人公は人間の開拓者。ちくわくん・おでん横丁の部品は使わない。戻るリンク「← ちくわゲームズ」だけは可）。
現在 β0.1.0（2026-11-12）。要件定義 5 章の範囲（開拓・集落まで）。

## 2. URL

`/machizukuri/`。開発に公開（`cards.js` に `dev: true`、`href` なし）。β公開（限定公開にするか）は触ってもらったあとで決める。フォルダ名はタイトルに左右されないようにした（タイトルは仮）。

## 3. コードの地図

| ファイル | 中身 |
|---|---|
| `index.html` | 画面（タイトル・HUD・パネル・丸いボタン）、CSS、拡大・縮小の止め方、はじめる流れ（つづきから／さいしょから） |
| `js/data.js` | 調整用の数値 `MZ.T`、持ち物 `ITEMS`、道具 `TOOLS`、採れる物 `NODES`、レシピ `RECIPES`、建物 `BUILDS`、段階 `STAGES` |
| `js/models.js` | 種類の名前 → 元のメッシュ（コードで作るローポリ）`MZ.models`、`MZ.getModel(key)`、`MZ.initModels(scene)` |
| `js/world.js` | 場面（光・空・霧・地面・境目の柵）、マスの座標、採れる物の配置と thin instance 描画・また出る、当たり判定 `collide` |
| `js/player.js` | 移動・視点（一人称／三人称）・PC とスマホの入力・ねらい `updateAim`・たたく `MZ.hit`・建てる位置 `rayPoint` |
| `js/town.js` | 建築（`MZ.place`・`MZ.remove`・見本・回す）、道のつながり `recalc`、移住・仕事・段階 `MZ.tick`、住民の姿 |
| `js/ui.js` | 目標 `MZ.GOALS`、お知らせ、パネル、作る `MZ.craft`、HUD |
| `js/save.js` | 保存 `MZ.saveNow`・読み込み `MZ.loadSave`・古い形の直し `MZ.migrate`・さいしょから |
| `js/main.js` | `MZ.begin(state)`（起動とメインループ） |
| `dev/test.cjs` | Playwright の確かめ用（公開されない） |
| `claude/未実装タスク.md` | 後の版・やり残し |

グローバルは `window.MZ` 1 つ。読み込み順は `index.html` の通り（core → save → babylon → data → models → world → player → town → ui → save → main）。

## 4. 保存キー

| キー | 中身 |
|---|---|
| `machizukuri-save` | 共通の包み `{ game, v, at, data }`（`CG.save.wrap`）。`data` は `player・inv・tools・pop・stage・timers・nextId・chunks["0,0"].layers.ground/under/over・chunks["0,0"].taken` |

- `MZ.SAVE_V`（いま 1）。保存の形を変えたら上げて、`MZ.migrate[古い版]` に「その版 → 次の版」へ直す関数を書く。新しい版のデータは読まず上書きもしない。壊れていたらさいしょからにしてお知らせを出す。
- `taken`：消えている採れる物の番号 → また出るまでの残り秒（遊んでいない間は進まない）。`-1` は、建物を置いたのでもう出ない物。
- **採れる物の場所は種（`MZ.T.seed` と区画のキー）から毎回同じに作る。`NODES` の `n`・`minR`、`MZ.T.seed`、`world.js` の `buildNodes` の乱数の使い方を変えると、古い保存の番号がずれる。変えるときは `SAVE_V` を上げ、`taken` を直す処理を書く。**
- 保存のタイミング：`T.autosave` 秒ごと、建てた・こわした・作った・移住のたび、`visibilitychange`（hidden）・`pagehide`。

## 5. 調整用の数値

`js/data.js` の `MZ.T`（歩く速さ・見回す速さ・採集の距離と向き・たたく間かく・建てられる距離・設備を使える距離・移住の間かく・基本の水と食料（0）・霧・三人称のカメラ・住民の上限・自動保存の間かく など）。きこり小屋の仕事は `BUILDS.lumber` の `jobs・makes・every`。段階は 0 始まり（0 開拓・1 集落）。

## 6. テスト

リポジトリ直下で `python3 -m http.server 8000`（バックグラウンド）→ `node machizukuri/dev/test.cjs [スクリーンショットの置き場]`。Chromium は `--use-gl=angle --use-angle=swiftshader`（FPS は 2〜3 なので速さは見ない。描く呼び出しは `MZ.stats()` の `activeMeshes`）。ゲームの中は `window.MZ` の関数（`MZ.hit`・`MZ.craft`・`MZ.place`・`MZ.remove`・`MZ.tick`・`MZ.state`）で進める。持ち物を直接増やす関数は作らない。終わったらサーバーを止める。

## 7. ゲーム固有の決まり

- 1 マス 2m、区画は 120×120 マス（240m）、区画 `"0,0"` の中心が世界の原点。小屋は左上のマス (59,59) の 2×2。向きは yaw 0 が +z。建物の正面は −z。
- モデルは「足もとが y=0、建物の中心が原点、正面は −z、1 単位 = 1m」で作り、頂点カラー＋材質 1 つで 1 つのメッシュにまとめる。ゲーム側は `MZ.getModel` だけを使い、作り方（コードか glTF か）を知らない。glTF にするときは `MZ.models` の関数の中身を差し替える。
- 採れる物（数百）と住民は thin instance、建物は種類ごとの `createInstance`。影は付けない。霧は線形（`fogStart`〜`fogEnd`）で、空の色と同じ。
- 当たり判定は Babylon の物理を使わず、マスの表（`solid` の建物）と `r > 0` の採れる物の円の押し返し（`world.js` の `collide`）。
- ねらい（採集の当たり）は `scene.pick` を使わず、位置と向きの cos で選ぶ（`player.js` の `updateAim`）。
- 世界の時間（移住・仕事・また出る・自動保存）は `MZ.tick(秒)` で進む。パネルを開いている間も進む。歩く・見回す・たたくは止まる。
- 目標は `ui.js` の `MZ.GOALS` の表。上から見て最初に満たしていない 1 行を出す。先へ進むと減る物（ロープなど）は「使ったあとの姿」も満たしているとみなす。
- 毎フレームの生成をしない（住民の行列・三人称のカメラは作業用の変数を使い回す）。`Tn.jobs()` は建物・人口が変わったときだけ作り直す。ねらいは `cellNode` で近くのマスだけ調べる。
- 保存を読むとき `normalize` が、土地の外・重なり・知らない種類の建物を捨て、場所を ±119.5 に収める。小屋がなければ壊れている扱い。
- 建築の見本は `renderingGroupId = 1`（手前の建物に隠れない）。同じお知らせは 2 秒以内に重ねない。
- ちくわくん・おでん横丁の部品（`yokocho.css`・`chara.js`・`noren.js`）と外部読み込みは使わない。

## 8. 残りのタスク

`claude/未実装タスク.md`。

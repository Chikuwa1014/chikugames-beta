# 荒野開拓記（仮）（machizukuri）

ルールは号口の `CLAUDE.md`（全ゲーム共通）。ここにはこのゲームだけのことを書く。要件の正本は `/mnt/project-files/machizukuri/kikaku.md`、作り方の指示は `claude/開発指示.md`（β0.1.0）と `claude/開発指示-b020.md`（β0.2.0 の描画）。

## 1. 概要

荒野にぽつんと建つ小屋から、採集・採掘・クラフトで道具をそろえ、好きな場所に道路と建物を建てて移住者を増やし、いずれ大都市まで育てる一人用の3Dまちづくり。基本は一人称、ボタンで三人称。敵・危険はなし。世界観はリアル路線（主人公は人間の開拓者。ちくわくん・おでん横丁の部品は使わない。戻るリンク「← ちくわゲームズ」だけは可）。
現在 β0.2.0（2026-11-14）。要件定義 5 章の範囲（開拓・集落まで）。β0.2.0 で、描画の層を高精細の絵（写真の質感・GLB・影・後処理）に入れかえた。ゲームの仕組みと保存の形は β0.1.0 のまま。高・中・低の画質があり、低は β0.1.0 に近い軽さ（GLB を読まなくても遊べる）。

## 2. URL

`/machizukuri/`。開発に公開（`cards.js` に `dev: true`、`href` なし）。β公開（限定公開にするか）は触ってもらったあとで決める。フォルダ名はタイトルに左右されないようにした（タイトルは仮）。

## 3. コードの地図

| ファイル | 中身 |
|---|---|
| `index.html` | 画面（タイトル・HUD・パネル・丸いボタン）、CSS、拡大・縮小の止め方、はじめる流れ（つづきから／さいしょから） |
| `js/data.js` | 調整用の数値 `MZ.T`、持ち物 `ITEMS`、道具 `TOOLS`、採れる物 `NODES`、レシピ `RECIPES`、建物 `BUILDS`、段階 `STAGES` |
| `js/models.js` | 種類の名前 → 元のメッシュ（コードで作るローポリ。GLB が無い・読めない・画質「低」のときの戻り先）`MZ.models`、`MZ.getModel(key)`、`MZ.initModels(scene)`。材質 `MZ.modelMat` は PBR（リニアの頂点カラー） |
| `js/gfx/util.js` | 乱数・ノイズ・`Geo`・`TRS`（モックの util） |
| `js/gfx/quality.js` | 画質の表 `MZ.gfx.Q`（高・中・低）、`setQuality`、`tris()`（三角形の数）、予算（草を減らす）、自動で 1 段下げる処理 |
| `js/gfx/assets.js` | 読み込む資産の一覧 `MZ.gfx.MANIFEST`・建物の見た目の対応 `BUILD_MODELS`、fetch の進み具合、`.glb` の読み込み `assets.model(名前)` |
| `js/gfx/air.js` `sky.js` | 高さと距離の霧（AirPlugin）、太陽・空のドーム・光の回りこみ（IBL） |
| `js/gfx/photo.js` `ground.js` `grass.js` | 写真の質感、地面（平ら）・土地の外の起伏・遠景の山・柵・マスの塗り分けの表、草 |
| `js/gfx/nodes.js` | 採れる物の見た目（種類ごとの入れ物と LOD の並べ直し・ゆれ・切り株・飾り） |
| `js/gfx/looks.js` | 建物・人・道具の受け皿：`look`・`put`・`preview`・`people` |
| `js/gfx/fire.js` `post.js` | たき火の炎・光、後処理・影・SSAO2・光の筋 |
| `assets/` | `tex/`（写真の質感・空）、`models/`（.glb）、`CREDITS.txt`（素材の出どころ。公開してよい） |
| `js/world.js` | 場面（光・空・霧・地面・境目の柵）、マスの座標、採れる物の配置と thin instance 描画・また出る、当たり判定 `collide` |
| `js/player.js` | 移動・視点（一人称／三人称）・PC とスマホの入力・ねらい `updateAim`・たたく `MZ.hit`・建てる位置 `rayPoint` |
| `js/town.js` | 建築（`MZ.place`・`MZ.remove`・見本・回す）、道のつながり `recalc`、移住・仕事・段階 `MZ.tick`、住民の姿 |
| `js/ui.js` | 目標 `MZ.GOALS`、お知らせ、パネル、作る `MZ.craft`、HUD |
| `js/save.js` | 保存 `MZ.saveNow`・読み込み `MZ.loadSave`・古い形の直し `MZ.migrate`・さいしょから |
| `js/main.js` | `MZ.begin(state)`（起動とメインループ） |
| `dev/test.cjs` | Playwright の確かめ用（公開されない） |
| `claude/未実装タスク.md` | 後の版・やり残し |

グローバルは `window.MZ` 1 つ（描画は `MZ.gfx`）。読み込み順は `index.html` の通り（core → save → babylon → **loaders** → data → models → gfx/util → air → sky → photo → ground → grass → assets → looks → nodes → fire → post → quality → world → player → town → ui → save → main）。

## 4. 保存キー

| キー | 中身 |
|---|---|
| `machizukuri-gfx` | 画質：`'high'`・`'mid'`・`'low'`・`'auto'`（無ければ `'auto'`。`CG.ls`）。保存データ（`machizukuri-save`）とは別で、ゲームの状態は変えない |
| `machizukuri-save` | 共通の包み `{ game, v, at, data }`（`CG.save.wrap`）。`data` は `player・inv・tools・pop・stage・timers・nextId・chunks["0,0"].layers.ground/under/over・chunks["0,0"].taken` |

- `MZ.SAVE_V`（いま 1）。保存の形を変えたら上げて、`MZ.migrate[古い版]` に「その版 → 次の版」へ直す関数を書く。新しい版のデータは読まず上書きもしない。壊れていたらさいしょからにしてお知らせを出す。
- `taken`：消えている採れる物の番号 → また出るまでの残り秒（遊んでいない間は進まない）。`-1` は、建物を置いたのでもう出ない物。
- **採れる物の場所は種（`MZ.T.seed` と区画のキー）から毎回同じに作る。`NODES` の `n`・`minR`、`MZ.T.seed`、`world.js` の `buildNodes` の乱数の使い方を変えると、古い保存の番号がずれる。変えるときは `SAVE_V` を上げ、`taken` を直す処理を書く。見た目にだけ使う乱数は別の種（`hash2(idx, 種類, T.seed)`・飾りは `T.seed + 77`）から取り、`buildNodes` の乱数は 1 回も増やさない。`dev/test.cjs` の「配置が変わっていない」（ハッシュ `79e4b006`）が守る。**
- 保存のタイミング：`T.autosave` 秒ごと、建てた・こわした・作った・移住のたび、`visibilitychange`（hidden）・`pagehide`。

## 5. 調整用の数値

`js/data.js` の `MZ.T`（歩く速さ・見回す速さ・採集の距離と向き・たたく間かく・建てられる距離・設備を使える距離・移住の間かく・基本の水と食料（0）・霧・三人称のカメラ・住民の上限・自動保存の間かく など）。きこり小屋の仕事は `BUILDS.lumber` の `jobs・makes・every`。段階は 0 始まり（0 開拓・1 集落）。

## 6. テスト

リポジトリ直下で `python3 -m http.server 8000`（バックグラウンド）→ `node machizukuri/dev/test.cjs [スクリーンショットの置き場]`。Chromium は `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`（FPS は 0〜3 なので速さは見ない。描く呼び出しは `MZ.stats()` の `activeMeshes`。低で 70 未満）。ふだんは低で回す（`localStorage['machizukuri-gfx'] = 'low'`）。高・中は画質・三角形・作業台の項目と `dev/shots.cjs`（スクリーンショット）だけ。高の 1 フレームは swiftshader で数十秒かかる。ゲームの中は `window.MZ` の関数（`MZ.hit`・`MZ.craft`・`MZ.place`・`MZ.remove`・`MZ.tick`・`MZ.state`）で進める。持ち物を直接増やす関数は作らない。終わったらサーバーを止める。

## 7. ゲーム固有の決まり

- 1 マス 2m、区画は 120×120 マス（240m）、区画 `"0,0"` の中心が世界の原点。小屋は左上のマス (59,59) の 2×2。向きは yaw 0 が +z。建物の正面は −z。
- モデルは「足もとが y=0、建物の中心が原点、正面は −z（人は +z）、1 単位 = 1m」。ゲーム側（`town.js`・`player.js`）は `MZ.gfx.look／put／preview／people` を通して使い、作り方（コードか GLB か）を知らない。`put` は種類ごと・部品ごとに `createInstance` し、LOD は元のメッシュに `addLODLevel`（近く用→遠く用→見えなくなる）。GLB が無い・読めない・画質「低」のときは `MZ.getModel` のコードの形（`models.js`）になる。
- **建物・人・道具の GLB の足し方**：`assets/models/b_<種類>.glb`（近く用）と `b_<種類>_far.glb`（遠く用）を置き、`gfx/assets.js` の `MANIFEST` に組を 1 行、`BUILD_MODELS` に種類を 1 行足す（作業台は `workbench.glb` を近く用として仮に使っている）。足もとの y・向きは `fix` で直せる。足したら `dev/test.cjs` と `dev/shots.cjs` を通して見比べる。
- 土地の中（±120m）は y = 0 の平らな地面のまま。起伏は柵の外（126m から）だけ。道・畑・踏み固めは「マスの塗り分けの表」（120×120 の RawTexture）を地面の材質（`GroundPlugin`）が読んで描く。建てる・こわすで `MZ.gfx.ground.mark(建物)`（草のマスも直す）。土の道 `road` はメッシュを置かない（見本だけ平たい板）。
- 採れる物・飾り・草・住民は thin instance（入れ物は固定の `Float32Array` で、差しかえず中身だけ書きかえて `thinInstanceCount` を変える）、建物は種類ごとの `createInstance`。影は画質で決まる（高：3 段のカスケード、中：2 段、低：なし）。落とす：建物・木・岩・作業台、落とさない：草・飾りの小石・見本。霧は `AirPlugin`（高さと距離・太陽の方向のかすみ）で、`scene.fog` は使わない。
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

# 荒野開拓記（仮）（machizukuri）

ルールは号口の `CLAUDE.md`（全ゲーム共通）。ここにはこのゲームだけのことを書く。要件の正本は `/mnt/project-files/machizukuri/kikaku.md`、作り方の指示は `claude/開発指示.md`（β0.1.0）と `claude/開発指示-b020.md`（β0.2.0 の描画）。

## 1. 概要

荒野にぽつんと建つ小屋から、採集・採掘・クラフトで道具をそろえ、好きな場所に道路と建物を建てて移住者を増やし、いずれ大都市まで育てる一人用の3Dまちづくり。基本は一人称、ボタンで三人称。敵・危険はなし。世界観はリアル路線（主人公は人間の開拓者。ちくわくん・おでん横丁の部品は使わない。戻るリンク「← ちくわゲームズ」だけは可）。
現在 β0.3.2（2026-11-28。β0.3.1＝β0.3.0「村」の直し：建物の向き・遠くの草むらと岩の遠く用 GLB・雲の見える空。β0.3.2＝スクリプトに ?v=版 を付けた）。要件の正本は `/mnt/project-files/machizukuri/kikaku-b030.md`、作り方の指示は `claude/開発指示-b030-1.md`〜`-b030-3.md`。要件定義 5 章（開拓・集落）に加えて、村の遊び（仕事場・商店・工房・倉庫・石畳・自動の上限・店が足りないと人が出ていく）、土地を 3×3 区画（9 区画）まで広げる、新しい建物 6 種の GLB、重さの手当て（近くの建物の係・見えなくなる距離・予算の手順）を入れた。保存の版は 3（β0.4.0 開発中。VERSION はまだ β0.3.2）。β0.2.0 で、描画の層を高精細の絵（写真の質感・GLB・影・後処理）に入れかえた。高・中・低の画質があり、低は β0.1.0 に近い軽さ（GLB を読まなくても遊べる）。

## 2. URL

`/machizukuri/`。開発に公開（`cards.js` に `dev: true`、`href` なし）。β公開（限定公開にするか）は触ってもらったあとで決める。フォルダ名はタイトルに左右されないようにした（タイトルは仮）。

## 3. コードの地図

| ファイル | 中身 |
|---|---|
| `index.html` | 画面（タイトル・HUD・パネル・丸いボタン）、CSS、拡大・縮小の止め方、はじめる流れ（つづきから／さいしょから） |
| `js/data.js` | 調整用の数値 `MZ.T`、持ち物 `ITEMS`、道具 `TOOLS`、採れる物 `NODES`、レシピ `RECIPES`、建物 `BUILDS`、段階 `STAGES` |
| `js/models.js` | 種類の名前 → 元のメッシュ（コードで作るローポリ。GLB が無い・読めない・画質「低」のときの戻り先）`MZ.models`、`MZ.getModel(key)`、`MZ.initModels(scene)`。材質 `MZ.modelMat` は PBR（リニアの頂点カラー） |
| `js/gfx/util.js` | 乱数・ノイズ・`Geo`・`TRS`（モックの util） |
| `js/gfx/quality.js` | 画質の表 `MZ.gfx.Q`（高・中・低。β0.3.0 から `bldFar`・`nodeFar`・`xfarDist`・`nearMax`・`budget`）、`setQuality`、`tris()`（三角形の数）、予算の手順 `budgetTick`／`budgetStep`（草 → 建物の近く用の距離 → 木の近く用の距離）、`G.dyn`（下げた段）、自動で 1 段下げる処理 |
| `js/gfx/assets.js` | 読み込む資産の一覧 `MZ.gfx.MANIFEST`・建物の見た目の対応 `BUILD_MODELS`、fetch の進み具合、`.glb` の読み込み `assets.model(名前)` |
| `js/gfx/air.js` `sky.js` | 高さと距離の霧（AirPlugin）、太陽・空のドーム・光の回りこみ（IBL） |
| `js/gfx/photo.js` `ground.js` `grass.js` | 写真の質感、地面（平ら）・土地の外の起伏・遠景の山・柵・マスの塗り分けの表、草 |
| `js/gfx/nodes.js` | 採れる物の見た目（種類ごとの入れ物と LOD の並べ直し・見えなくなる距離 `nodeFar`・ゆれ・切り株・飾り） |
| `js/gfx/looks.js` | 建物・人・道具の受け皿：`look`・`put`・`preview`・`people`、近くの建物の係 `nearTick`（建物の 4 つの姿を切りかえる） |
| `js/gfx/fire.js` `post.js` | たき火の炎・光、工房の煙（`addSmoke`・`smokeTick`）、後処理・影・SSAO2・光の筋 |
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
| `machizukuri-save` | 共通の包み `{ game, v, at, data }`（`CG.save.wrap`）。`data` は `player・inv・tools・pop・stage・timers・nextId・land（持っている区画。"0,0" がいつも先頭）・chunks[区画のキー].layers.ground/under/over・chunks[区画のキー].taken`。建物は「左上のマスがある区画」の `ground` に、区画の中の座標（0〜119）で持つ。`mk`（工房のえらび）は建物の欄 |

- `MZ.SAVE_V`（いま 3。β0.4.0 区切り 1 で上げた）。`migrate[1]` は版 1 → 2：`land: ['0,0']` を足し、`"0,0"` 以外の区画を捨てる（建物の座標・`taken`・`timers`・`nextId` は触らない）。`migrate[2]` は版 2 → 3：持ち物に `concrete: 0` を足すだけ（建物・採った物・時間・番号・持っている区画は触らない。`normalize` も無い持ち物を 0 で補う）。上げた理由は、ブラウザに古い JS が残っていたとき、古い JS が新しい保存（コンクリート・町の建物・工房の新しいえらび）を捨てて上書きしないため。版 1 は 1 → 2 → 3 と順に直る。保存の形を変えたら上げて、`MZ.migrate[古い版]` に「その版 → 次の版」へ直す関数を書く。新しい版のデータは読まず上書きもしない。壊れていたらさいしょからにしてお知らせを出す。
- `taken`：消えている採れる物の「区画の中の番号」（`nd.li`。区画 "0,0" では `W.nodes` の通し番号と同じ） → また出るまでの残り秒（遊んでいない間は進まない）。`-1` は、建物を置いたのでもう出ない物。
- **採れる物の場所は種（`MZ.T.seed` と区画のキー）から毎回同じに作る。`NODES` の `n`・`minR`、`MZ.T.seed`、`world.js` の `buildNodes` の乱数の使い方を変えると、古い保存の番号がずれる。変えるときは `SAVE_V` を上げ、`taken` を直す処理を書く。見た目にだけ使う乱数は別の種（`hash2(idx, 種類, T.seed)`・飾りは `T.seed + 77`）から取り、`buildNodes` の乱数は 1 回も増やさない。`dev/test.cjs` の「配置が変わっていない」（ハッシュ `79e4b006`）が守る。**
- 保存のタイミング：`T.autosave` 秒ごと、建てた・こわした・作った・移住のたび、`visibilitychange`（hidden）・`pagehide`。

## 5. 調整用の数値

`js/data.js` の `MZ.T`（歩く速さ・見回す速さ・採集の距離と向き・たたく間かく・建てられる距離・設備を使える距離・移住の間かく・基本の水と食料（0）・霧・三人称のカメラ・住民の上限・自動保存の間かく など）。β0.3.0 で足した数：`migrateVillage`（段階が `villageStage` 以上のときの移住の間かく 6 秒。それより前は `migrate` 9 秒）・`shopFree`（店が無くても来られる人数 50）・`autoCap`（自動でたまる材料の上限 100。倉庫で `store` だけふえる）・`villageStage`（「村」の段階の番号 2）。段階は 0 始まり（0 開拓・1 集落・2 村・3 町）。`MZ.STAGES` の `banner` は、その段階になったときに出す文。

建物の表（`MZ.BUILDS`）の欄：`w`・`solid`・`cost`・`stage`・`home`・`water`・`food`・`jobs`（働く住民の数）・`makes`＋`every`（every 秒ごとに持ち物へ入る物）、β0.3.0 から `road`（道としてつながる。土の道・石畳）・`pave`（小屋につながったこの道に面した家は、住める人数が pave ふえる。1 軒に 1 回）・`shop`（店がまかなう人数）・`staff`（歩く姿と表示だけの人数。人口からは引かない）・`store`（自動でたまる上限をふやす数）・`craft`（工房でつくれる物。`MZ.RECIPES` の `key`）。コードに建物のキーや数字を直書きせず、この表の欄で決める（建物の有無が変わっても表を直すだけで済むように）。

## 5b. β0.4.0 区切り 1（コンクリート・工房のえらび）

- 持ち物 `concrete`（`MZ.ITEMS`・`ITEM_ORDER`。`MZ.ITEM_STAGE = { concrete: 3 }` ＝その段階になるまで持ち物タブに出さない）。レシピ `concrete`：石 2・粘土 1 → コンクリート 1、かまど、`stage: 3`（町）。段階 3 まで `MZ.craftReason` が「町（人口 200）で解放」を返す。
- 工房の `craft` は `['plank','brick','ingot','rope','concrete']`。`Tn.makeReason(k)` がレシピの `stage` で「えらべない理由」を返し、`MZ.setMake` はそのとき false、仕事場タブのボタンは `disabled`。
- `MZ.STAGES` の町（人口 200）は元からある。`index.html` のスクリプトの `?v=` は `b040`。
- 版 2 の見本：`dev/fixtures/save-v2-b032-town.json`（β0.3.2 の作りで `dev/make-fixture.cjs --v 2 --town` で作った、人口 210・町・2 区画の街）。
- 重さの測り：`dev/heavy-b040.cjs`（260 軒・人口 1000。結果は `claude/測定-b040-0.md`）。

## 6. テスト

リポジトリ直下で `python3 -m http.server 8000`（バックグラウンド）→ `node machizukuri/dev/test.cjs [区切り 1〜4] [スクリーンショットの置き場]`。全部通すと 10 分を超えるので、区切りごとに流す（`... test.cjs 1`、`2`、`3`、`4`、`5`。引数なしは全部。β0.3.0 の最後の通り方：1＝227・2＝21・3＝22・4＝60・5＝6 件、すべて通る）。1＝PC の通しとスマホ・村の遊び、2＝読み込み・待ち行列・資産が読めないとき・共通の写真（btex）、3＝画質の切りかえ・ボタン・自動の下げ・中 → 高の読み直し、4＝三角形（村の場面は測るだけ）・GLB の表示・新しい建物、5＝通しの試験（最初から人口 200 まで。ゲームの関数と主人公の場所だけで進め、手数・建物の数・時間を出す）。`dev/shots.cjs --fixed` は決まった絵（乱数・お知らせ・時間を固定）を撮る。終わりに区切りごとの件数と合計を出す。Chromium は `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`（FPS は 0〜3 なので速さは見ない。描く呼び出しは `MZ.stats()` の `activeMeshes`。低で 70 未満）。ふだんは低で回す（`localStorage['machizukuri-gfx'] = 'low'`）。高・中は画質・三角形・作業台の項目と `dev/shots.cjs`（スクリーンショット）だけ。高の 1 フレームは swiftshader で数十秒かかる。ゲームの中は `window.MZ` の関数（`MZ.hit`・`MZ.craft`・`MZ.place`・`MZ.remove`・`MZ.tick`・`MZ.state`）で進める。持ち物を直接増やす関数は作らない。終わったらサーバーを止める。

## 7. ゲーム固有の決まり

- 1 マス 2m、区画は 120×120 マス（240m）、区画 `"0,0"` の中心が世界の原点。表（`owner`・`solid`・`cellNode`・草の密度・塗り分け）は最初から 3×3 区画（360×360 マス）の「全体のマス」（−120〜239。区画 "0,0" の中では今までのマスの番号と同じ）で 1 つ持ち、引くのは `MZ.ci(gx, gz)`（世界の外は −1）。持っている区画は `W.land`・`W.setLand(keys)`、調べるのは `MZ.landAt`・`MZ.landAtPoint`・`W.inLand`・`W.clampLand`（土地の端に `T.half` は使わない）。建物の全体のマスは `MZ.town.gpos(b)`。小屋は左上のマス (59,59) の 2×2。向きは yaw 0 が +z。建物の正面は −z。
- モデルは「足もとが y=0、建物の中心が原点、正面は −z（人は +z）、1 単位 = 1m」。ゲーム側（`town.js`・`player.js`）は `MZ.gfx.look／put／preview／people` を通して使い、作り方（コードか GLB か）を知らない。`put` は種類ごと・部品ごとに `createInstance` する。建物の姿は 4 つ（近く用・遠く用・最遠・見えない）で、切りかえは近くの建物の係（7 章の「重さ」）がする。GLB が無い・読めない・画質「低」のときは `MZ.getModel` のコードの形（`models.js`）になる。
- **建物・人・道具の GLB の足し方**：`assets/models/b_<種類>.glb`（近く用）と `b_<種類>_far.glb`（遠く用。いつも置く）、必要なら `b_<種類>_xfar.glb`（最遠。60m から）を置き、`gfx/assets.js` の `MANIFEST` に組を 1 行、`BUILD_MODELS` に種類を 1 行（`near`・`far`・`xfar`。最遠のファイルが無い種類は `xfar` に遠く用の名前を書く）足す。**近く用の建物・道具・採れる物の写真は `assets/models/tex/m_*.jpg` を GLB の外の画像（uri `tex/m_….jpg`）として指す。足すときは `G.BTEX`・`G.BTEX_USERS` に足す。uri に `..` は使えない。JPEG は置く前に `strip_app11.py` で APP11（C2PA）を抜き、md5 を確かめる。** `G.texUrl` が中画質だけ法線を `_nrm_512` に読みかえる（Babylon の `preprocessUrlAsync` にも同じ関数）。`G.BTEX_USERS` の GLB は、`btex` の組（待ち行列。`PRIO` 2.6）が全部決着してから読み、読めない写真を使う GLB だけコードの形になる。中 → 高にしたとき `looks.reloadBtex`・`nodes.reloadNear` が近く用を読み直す。`dev/glbcheck.cjs` が外の画像の有無・`..` を調べ、`dev/loadsize.cjs` が画質ごとの読み込み量を出す（β0.3.0 の実測：中 32.78・高 36.79・低 1.54 MiB。目標は中 35.5 MiB 以下）（作業台・小屋・木の家・井戸・たき火・かまど・炉・畑・きこり小屋・れんがの家の 10 種に、β0.3.0 で大きな畑・粘土採り場・採石場・工房・商店・倉庫の 6 種が入り、全 16 種。最遠は小屋・木の家・作業台だけ別ファイルで、ほかは遠く用を最遠に使う。遠く用が箱に近い建物は `BUILD_MODELS` の `lod` で切りかえ距離を遠くしている。主人公・住民・道具・粘土・鉄の鉱脈も入っている：主人公 `b_player`・住民 `b_person_a`〜`c` は根の子 `body・legL・legR・armL・armR`（`looks.js` の `PIV` に脚の付け根（股）・腕の付け根（肩）を持ち、主人公は部品を複製して根の `metadata.parts` に並べる／住民は部品ごとの thin instance で脚と腕を行列で振る。近い人だけ近く用、遠い人は遠く用を 1 つにまとめる。女の人 b の振りはスカートのため小さい `SWING`）。道具 `b_tool_axe1〜3`・`pick1〜3` は近く用だけ（低はコードの形）で、一人称は `player.js` の `showHand`、三人称は `looks.holdTool`（右手）。粘土・鉄は `b_n_clay`・`b_n_iron`（`nodes.js` の `bnodes_n`・`bnodes_f`）。足もとの y・向きは `fix` で直せる。足したら `dev/test.cjs` と `dev/shots.cjs` を通して見比べる。
- **読み込み（`gfx/assets.js`）**：資産は待ち行列で、同時に 5 本まで取りに行く。順は 必須（空・地面）→ 石 → 近く用の木・岩 → 建物の遠く用 → 建物 → 人 → 低木・道具・採れる物（`PRIO`）。打ち切りは「20 秒間ひとつも届かない」（ReadableStream で届いた量を見る）。失敗は 3 秒後・8 秒後に読み直し、それでも読めなければ `failed`。画質を変えたとき（`loadTier`）に、失敗したファイルは取りに行き直す（`forget`）。タイトルの「準備中 n／m」は必須の数（`reqDone／reqTotal`）だけ。消えたあと、裏で読んでいる間は画面の下に「絵を読み込み中 n／m」（`#bgLoad`）。
- **遠景**：山は前後 2 層（`ground.js` の `buildMountains`。雪なし。岩肌は赤茶〜灰色で、遠い層ほど地平の色へ。写真は `MountPlugin` が三平面投影で貼る）。柵の外（126〜330m）にはコードの木・草・岩を thin instance で散らし（`buildOutskirts`。数は画質の `outer`）、茶色い平らな帯に見えないようにしている。
- 画質を「低」に下げたとき、使わない近く用の GLB と前の画質の写真は片づける（建物・人・道具は `looks.releaseNear`、一人称の手の道具は `player.js` の `releaseHands`、採れる物は `nodes.js` の `release`、写真は `photo.js` の `texOf`）。まだ取りに行っていない高・中のファイルは `assets.loadTier` が待ち行列から外す。低のあいだに届いた近く用はその場で片づける。高・中にもどすと読み直す。
- 一人称の手の道具の位置・大きさは、画面の縦横比から決める（スマホ縦でも画面に入る。向きを変えると追従）。
- 土地の中（±120m）は y = 0 の平らな地面のまま。起伏は柵の外（126m から）だけ。道・畑・踏み固めは「マスの塗り分けの表」（360×360 の RawTexture）を地面の材質（`GroundPlugin`）が読んで描く。建てる・こわすで `MZ.gfx.ground.mark(建物)`（草のマスも直す）。土の道 `road` はメッシュを置かない（見本だけ平たい板）。
- 採れる物・飾り・草・住民は thin instance（入れ物は固定の `Float32Array` で、差しかえず中身だけ書きかえて `thinInstanceCount` を変える）、建物は種類ごとの `createInstance`。影は画質で決まる（高：3 段のカスケード、中：2 段、低：なし）。落とす：建物・木・岩・作業台、落とさない：草・飾りの小石・見本。霧は `AirPlugin`（高さと距離・太陽の方向のかすみ）で、`scene.fog` は使わない。
- 当たり判定は Babylon の物理を使わず、マスの表（`solid` の建物）と `r > 0` の採れる物の円の押し返し（`world.js` の `collide`）。
- ねらい（採集の当たり）は `scene.pick` を使わず、位置と向きの cos で選ぶ（`player.js` の `updateAim`）。
- 世界の時間（移住・仕事・また出る・自動保存）は `MZ.tick(秒)` で進む。パネルを開いている間も進む。歩く・見回す・たたくは止まる。
- 目標は `ui.js` の `MZ.GOALS` の表。上から見て最初に満たしていない 1 行を出す。先へ進むと減る物（ロープなど）は「使ったあとの姿」も満たしているとみなす。
- 毎フレームの生成をしない（住民の行列・三人称のカメラは作業用の変数を使い回す）。`Tn.jobs()` は建物・人口が変わったときだけ作り直す。ねらいは `cellNode` で近くのマスだけ調べる。
- 保存を読むとき `normalize` が、持っている区画すべてについて、土地の外・重なり・知らない種類の建物を捨て（小屋を先に調べる）、場所を持っている区画の中（端から 0.5m 内）に収める。小屋がなければ、`land` に "0,0" がなければ壊れている扱い。
- 建築の見本は `renderingGroupId = 1`（手前の建物に隠れない）。同じお知らせは 2 秒以内に重ねない。
- **村の遊び（β0.3.0 区切り 2）**：
  - 店：移住の上限 `cap = min(家, 水, 食料, 店)`。店 ＝ `T.shopFree` ＋ Σ `shop`（商店に人手が無くても数える）。`Tn.info.shop`。人口が 50 をこえていて商店が無い古い街は 1 人ずつ出ていき、最初に 1 回だけ「店が足りないので…」と出す。
  - 自動の上限：`MZ.autoCap() = T.autoCap + Σ store`（どの物も同じ）。仕事場は `Tn.workState(b)`（`{ st, text, what }`。`st` は `run`・`staff`・`off`・`short`・`full`）。`run` のときだけ残り秒が減り、`full`・`short`・`off` の間は `every` のまま止まる。`makes` の物は 1 つずつ見て、上限に達していない物だけ足す（1 回で少しこえてよい）。
  - 工房：`b.mk`（`craft` の中の物。保存の建物の欄。`normalize` が `craft` に無い物を捨てる）。`MZ.setMake(id, k)` でえらぶ（`null` で止める）。1 回ぶんは `MZ.RECIPES` の `cost` → `give`。
  - 道・石畳：`road` の欄がある建物がまざってつながる（`Tn.recalc`）。`pave` のある道に面した家は `home` が `pave` ふえる。`Tn.info.paved`＝つながった石畳のマスの数。`looks.put` は `road` の欄がある建物のメッシュを置かない（見本だけ平たい板）。
  - 住民の分け方：歩く姿は `min(人口, T.maxPeople)` 人。働く人 W ＝（人を割り当てた仕事場の人数）＋（商店 × `staff`）を人口で割った割合ぶんが仕事場のまわり、残りが家のまわり。割り振りを直すのは `Tn.resDirty` のときだけで、よりどころが残る人は動かさない（`r.home` はよりどころの建物の id）。
  - 石畳の塗り：マスの塗り分けの表の A＝255 が石畳のマス（R は 0）。`GroundPlugin` が **マスの中心の画素**（補間しない）で石畳か決め、1 マスに写真 1 枚（2m）を、マスごとに 90° ずつ回して貼る（法線も同じだけ回す）。石畳でないとなりの側の縁 0.12m を暗くする。写真（`cobble_*`）が読めないときはコードの灰色＋ノイズ。土・道・畑の写真とは別に有る無しを決める（`GCOBBLE`）。
  - 画面：タブ「仕事場」（`data-tab="work"`。工房のつくる物のボタンは `aria-pressed`）、近くの 1 行 `#wk`（仕事場・商店の `T.near + w` m 以内）、HUD の「店」（段階が `villageStage` 以上）、持ち物タブの「石 120／上限 250」、材料の「×5」（`MZ.craft(key, 5)`）。
  - 新しい建物 7 種のうち石畳以外の 6 種（採石場・粘土採り場・工房・商店・倉庫・大きな畑）は GLB が入っている（`BUILD_MODELS`）。石畳は道なのでメッシュを置かず、地面の塗り分けで描く。大きな畑の土は GLB に入れず、畑と同じ塗り分けで描く（`kindOf` が畑）。
- **土地を広げる（β0.3.0 区切り 3）**：
  - 区画の種類は `MZ.CHUNK_KINDS`（区画のキー → 種類。場所から毎回同じ。北は +z、東は +x）と `MZ.KINDS`（森 木 2 倍・岩場 岩と鉄の鉱脈 3 倍・粘土の土地 粘土 3 倍。`"0,0"` は「もとの土地」で倍率なし）。採れる物の数は `NODES[k].n × mult[k]`（`world.js` の `buildChunkNodes`。乱数の使い方は区画ごとに同じなので `"0,0"` の配置ハッシュ `79e4b006:444` は変わらない）。広げる材料は `MZ.LAND_COST`（持っている区画の数で決める表。`MZ.landCost(n)`）。
  - `MZ.canExpand(cx, cz)` は広げられない理由の文（広げられるなら空）：世界の外・もう持っている・となりの区画を先に・村（人口 50）で解放・材料が足りない（この順に見る）。`MZ.landState(cx, cz)` は `'out'｜'own'｜'adj'｜'far'`。`MZ.expand(cx, cz)`（`town.js`）の順：材料を払う → `state.land` の後ろにキーを足して `state.chunks[key]` を作る → `W.setLand` → `W.buildChunkNodes(key)` → `G.nodes.rebuild(W.nodes)` → `W.applyTaken()` → `G.ground.markChunk(key)`（塗り分けの表と草の密度）→ `G.ground.rebuild()` → 保存 → お知らせ。起動のときは `state.land` のすべての区画を `W.buildNodes` が同じ順に作る。
  - 採れる物の描画：入れ物（`makeForm`）の数は関数で持ち、`G.nodes.rebuild` が足りなければ大きな `Float32Array` に差しかえる（メッシュ・材質・写真は使い回す）。飾り（倒木・枯れ枝・小石）は区画ごとに作る（種は `"0,0"` が `T.seed + 77`、ほかは `T.seed + 77` と区画のキー）。並べ直しでは主人公に近い区画から順に入れ物の数まで入れる。
  - 柵・外の起伏・山・柵の外の飾りは、持っている区画を囲む長方形 `G.ground.rect`（世界の座標の `x0・x1・z0・z1`）から作る（`ground.js` の `buildScenery`。起動と広げたときだけ。前のメッシュは `dispose` し、柵は影の一覧からも外す）。rect の中（L 字の欠けも）は y = 0。起伏の `c` は「rect からのはみ出し ＋ 120」、山の輪の中心は rect の中心（内側の半径 `max(300, rect の長いほうの半分 + 180)`）。柵は持っている区画ごとに、となりを持っていない辺にだけ 4m おきに杭（角は 1 本。`G.ground.fenceCount`）。持っていない区画（rect の中）には木の飾り（`outPine`・`outLeaf`）を置く。地面のシェーダーの「柵の外」の見た目も `gRect`（rect）から決める。`"0,0"` だけのときは今までの絵と同じ（杭だけ角の重なりが 4 本へる）。
  - 画面：タブ「土地」（`data-tab="land"`。3×3 の地図）、柵のきわ（`!W.inLand(x, z, 6)`）の「土地」ボタン `#landBtn`（段階が村以上のとき）、PC の L キー、目標「土地を広げよう」。
- 仕事場タブ（β0.3.0 0 章）：一覧の形（建物の並び・ボタン・えらび）が変わったときだけ `innerHTML` を作り、秒と状態の文は各行の `<span data-ws="建物 id">` の `textContent` だけを書きかえる。`Tn.workSt(b)` は状態の語（`run`・`staff`・`off`・`short`・`full`）だけを返す軽い関数（`step` が使う）、文は `Tn.workState(b)`（画面用）。自動の上限は `Tn.recalc` が数えて `Tn.info.autoCap` に持つ（`MZ.autoCap()` はそれを返すだけ）。`makes` があって `jobs` が無い建物（大きな畑：40 秒ごとに草 2）は、人手 0 のいつも動く仕事場。
- **重さ（β0.3.0 区切り 4。画質の表 `Q` の `bldFar`・`nodeFar`・`xfarDist`・`nearMax`・`budget`）**：
  - 建物の 4 つの姿（`looks.js`）：いつも置くのは遠く用（低は最遠。GLB が無いときはコードの形）。近くの建物の係 `G.looks.nearTick(dt)` が 0.5 秒に 1 回、主人公からの距離で、`xfarDist`（高・中 60m）をこえた建物を最遠に（最遠のファイルが無い種類は遠く用のまま）、`bldFar`（高 300・中 220・低 150m）をこえたら見えなく（有効・無効の切りかえ。境は 3m の余裕）し、近く用の距離（`houseNear` 25m。`BUILD_MODELS` の `lod` があればその距離。予算で縮める）以内の建物を近い順に並べて上位 `nearMax`（高 8・中 4・低 0）軒だけに近く用のインスタンスを置いて、その建物の遠く用を隠す。近く用を置くのは 1 回に 2 軒まで。置いたインスタンスは `freezeWorldMatrix()`。**Babylon の `addLODLevel` は建物には使わない**（インスタンスの LOD の先のメッシュが描かれなかった。`MZ.stats().nearBuildings` が近く用の数）。工房の煙は動いている（`Tn.workSt` が `run`）工房だけ、主人公から 60m 以内で近い順に 4 つまで（`G.fire.smokeTick`。位置は GLB の空ノード `smoke`、無ければ既定の位置を建物の向きで回す）。
  - 採れる物（`nodes.js`）：主人公から `nodeFar`（高 250・中 180・低 130m）より遠い物は、どの入れ物にも入れない（切り株も）。飾りは今までの `decorDist`。木の LOD の距離 `treeLod` は、9 区画・150 軒の場面で測って今のまま（高 [55, 160]・中 [22, 160]）。
  - 草の数は、予算の草 ÷ 1 株の三角形（30）：高 15,000・中 5,000・低 2,200（`Q.grass`）。
  - 予算の手順（`G.budgetTick`／`budgetStep`。2 秒ごと）：上限（高 170 万・中 90 万・低 30 万）をこえたら 1 回に 1 段、草 10% へらす（最小 0.1）→ 建物の近く用の距離 2.5m 縮める（`G.dyn.houseCut`。10m＝15m まで）→ 木の近く用の距離 0.85 倍（`G.dyn.treeF`。0.6 まで）。上限の 85% を下回ったら逆の順にもどす。`MZ.stats().budget` に下げた段が出る。
  - 重い場面（9 区画・建物 150 軒・人口 200）の三角形（一人称／見下ろし。予算の手順のあと）：高 約 1.67〜1.68M（上限 1.7M にぎりぎり）・中 約 0.82〜0.83M・低 約 0.30M（低は予算の手順で草が 0.53〜0.59 倍に減る。`dev/test.cjs 4`）。建物 20・住民 60 の場面：高 1.22M・中 0.58M・低 0.27M。村の場面（建物 100・人口 200）：高 1.05M・中 0.57M・低 0.24M。読み込み量：高 36.79・中 32.78・低 1.54 MiB（`dev/loadsize.cjs`）。
- **β0.3.1 の直し**：
  - 建物の向き：GLB の部品は `rotationQuaternion` を持ち、`createInstance` がそれを写すので `rotation.y` が効かず、どの向きで建てても同じ向きになっていた。`looks.js` の `put` の `mk` でインスタンスの `rotationQuaternion` を外してから回す（`dev/test.cjs 4` の「建物の向き」）。
  - 草むら・岩の遠く用：`bush_far.glb`（横から撮った絵を貼った交差した板。表と裏を別の面で持つので片面表示のまま）と `rock_a_far`〜`rock_c_far.glb`（240 三角形。範囲は近く用と同じ）。組 `nodes_far`（全部の画質）。近く用の距離（`bushDist`・`rockDist`）より先と低で、丸いコードの形の代わりに使う。草むらの遠く用は、法線が上向きで明るく見えるので `albedoColor` を落とし、近く用の基準の横幅（0.358m）÷ 0.82 で大きさを合わせる。
  - 空：HDRI を Kloofendal 38d Partly Cloudy（Pure Sky。雲が見える。太陽の高さ約 38°）に変えた。`sky.jpg` は 4096×2048。作り方は /mnt/project-files/machizukuri/models/tools/mksky.py（4k の .hdr から）。`SKY.sunV` を HDRI の太陽に合わせる。読み込み量：高 37.46・中 33.45・低 2.20 MiB。
- **スクリプトの読み直し（β0.3.2）**：β0.3.1 の公開のあと、スマホで作業台の向きが直っていないと報告があった（録画では、見本は回っているのに置いた物は回っていない＝β0.3.0 の動き。手元のスマホの再現では直っていた）。古い JS がブラウザに残っていたと見て、`index.html` の `js/` のスクリプトに `?v=b032` を付けた。**版を上げて JS を変えたら、この `?v=` も全部そろえて変える。**
- **新しい建物の GLB（β0.3.0 区切り 5）**：6 種の近く用・遠く用・最遠と、小屋・木の家・作業台の最遠、`m_linen_*` の写真。`A.model` は空ノード（`smoke`・`flame`）の位置を `out.marks` に持つ。`BTEX_USERS` に新しい 6 種の近く用が入っている（写真が読めない GLB だけコードの形）。大きな畑の土・石畳は地面の塗り分けで描く。
- ちくわくん・おでん横丁の部品（`yokocho.css`・`chara.js`・`noren.js`）と外部読み込みは使わない。

## 8. 残りのタスク

`claude/未実装タスク.md`。

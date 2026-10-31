# ちくわゲームズ 共通部品（common）

どのゲームでも使う処理をまとめたフレームワーク。決まりごとは号口（`Chikuwa1014/chikugames`）の `CLAUDE.md`の「15. 共通部品」。

## 使い方（新しいゲーム）

```html
<link rel="stylesheet" href="../common/v1/common.css">   <!-- ロビー画面・送信欄を使うときだけ -->
<script src="../common/v1/core.js"></script>             <!-- 必ず最初 -->
<script src="../common/v1/share.js"></script>
<script src="../common/v1/save.js"></script>
<script src="../common/v1/debug.js"></script>
<script src="../common/v1/room.js"></script>             <!-- マルチプレイをするときだけ -->
<script>
CG.init({ game: 'my-game', title: 'わたしのゲーム', version: '1.0.0' });

// SNS 共有（#ちくわげーむず は自動で付く）
CG.share.open({ msg: 'クリアした！', tags: ['わたしのゲーム'] });

// セーブコード
const code = await CG.save.toCode(CG.save.wrap(saveData, 1));
const box = await CG.save.fromCode(code);   // box.data・box.v

// デバッグ報告（worker/index.js の DEBUG_GAMES に 'my-game' を足す）
CG.debug.init({ snap: () => ({ stage }) });
CG.debug.mount(document.getElementById('dbg'), { extra: () => ({ state }) });

// オンライン対戦のルーム（worker/index.js の WS_GAMES に 'my-game': 4 を足す）
const room = CG.room.create({
  max: 4,
  name: CG.room.lobbyName({ nameKey: 'my-game-name' }),
  onMessage(from, m) { /* 親：子の操作を受けて進行し、broadcast で配る／子：配られた状態を描く */ },
  onReady() { /* 部屋に入れた */ },
});
CG.room.lobby(document.getElementById('lobby'), room, { nameKey: 'my-game-name', inviteMsg: 'いっしょに遊ぼう！' });
</script>
```

## ファイル

| ファイル | 中身 |
|---|---|
| `v1/core.js` | `CG.init`・`CG.ls`（保存）・`CG.copy`・`CG.download`・`CG.readText`・`CG.toast`・`CG.esc`・`CG.pageUrl` |
| `v1/share.js` | `CG.share`：`text`・`links`・`open`・`x`・`copy` |
| `v1/save.js` | `CG.save`：`wrap`・`toFile`・`fromFile`・`toCode`・`fromCode`・`checksum` |
| `v1/debug.js` | `CG.debug`：`init`・`add`・`wrap`・`send`・`mount`・`clear`・`log` |
| `v1/move.js` | `CG.move`：`mount`（セーブの引っ越しの欄）・`collect` |
| `v1/ad.js` | `CG.ad`：リワード広告。`on`（いまは false＝出さない）・`client`・`ready()`・`kinds()`・`reward({ kind, name })`。URL に `?ad=test` で仮の広告（2026-10-30） |
| `v1/room.js` | `CG.room`：`create`・`lobby`・`lobbyName`・`codeFromUrl`。部屋の `takeOver`・`rejoin`（親の引き継ぎ。ほりほりもぐもぐ）。親は 15 秒ごとに仲介へ ping を送り、切れていたら合い言葉（`key`）でつなぎ直す。子は親がいなければ 10 秒ほど待つ（2026-10-31） |
| `v1/common.css` | ロビー画面と送信欄の見た目 |
| `dev/room-test.html`・`dev/test-room.py`・`dev/test-reconnect.cjs` | ルームの見本と通しテスト、親の接続が黙って切れたときのテスト（公開されない） |

## 版の決まり

- `v1` のふるまいは変えない。壊れる変更は `v2/` を作る。足すだけなら `v1` に足してよい。
- セーブコードの形：`CK1.<deflate して base64url>.<チェック値>`（圧縮できないブラウザは `CK0.`）。チェック値はゲーム名を混ぜたハッシュなので、別のゲームのコードは読めない。

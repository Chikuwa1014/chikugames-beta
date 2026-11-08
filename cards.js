/* ちくわゲームズ本番トップの「Beta」欄に出すカード（βのゲームの紹介とサムネイル）
   本番トップ（chikuwa-games の index.html）がこのファイルを読み込む。本番側は触らなくてよい。
   βのゲームを増やしたら、ここに1件足して push するだけで本番トップの Beta 欄に出る。
   成人向けのゲームは adult: true を書く（トップの一覧に出さない）。
   限定公開にするカードは lock にパスワードの SHA-256（16進。例：printf 'pass' | sha256sum）を書く。
   限定公開のカードにも href は必ず書く（本番トップがパスワード欄と鍵の記録に href を使う。無いとエラーで Beta 欄が出なくなる）。
   href は βの公開アドレス（BETA。独自ドメイン beta-games.chikuwa-hookah.com）の絶対 URL。version は β 付き（ゲーム内の VERSION とそろえる）。
   正式版にするときは、本番リポジトリに同じ名前のフォルダと card.js（beta なし）を作り、ここから消す */
(() => {
const BETA = 'https://beta-games.chikuwa-hookah.com';
const add = g => (window.CHIKUWA_GAMES = window.CHIKUWA_GAMES || []).push(Object.assign({ beta: true }, g));

add({
  order: 101,
  href: BETA + '/gatasu/', kicker: '恋愛アドベンチャー', title: 'がたす、モテる。', sub: 'モテ選手権で優勝をめざせ',
  desc: 'モテ選手権に出場したがたすが、4人の女の子の心をつかんで優勝をめざす恋愛アドベンチャー。会話とミニゲームで好感度を上げて告白しよう！',
  tags: ['恋愛ADV', 'ミニゲーム', 'ひとりで遊ぶ'], version: 'β0.1.0', updated: '2026-10-24',
  /* 限定公開：パスワードの SHA-256（16進） */
  lock: '859e3f29ce0e2b9189c47036831a4d15dc449e2939e7f44c648bcc7e9334d4e6',
  /* 160×90 のサムネイル（ドット絵）。t は秒 */
  draw(c, t) {
    /* ステージ上のがたすと、まわりに浮かぶハート。左右に女の子のシルエット */
    const r = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
    const g = c.createLinearGradient(0, 0, 0, 90); g.addColorStop(0, '#3E1F45'); g.addColorStop(1, '#241526');
    c.fillStyle = g; c.fillRect(0, 0, 160, 90);
    // スポットライト
    c.fillStyle = 'rgba(255,220,235,0.10)'; c.beginPath(); c.moveTo(70, 0); c.lineTo(90, 0); c.lineTo(108, 80); c.lineTo(52, 80); c.closePath(); c.fill();
    r(0, 78, 160, 12, '#1A0F1C'); r(0, 78, 160, 1, '#4E3354');
    // 女の子のシルエット（4人）
    const girls = [[14, '#E98BC2'], [34, '#9B7BD8'], [118, '#F2B23A'], [138, '#6FC3B2']];
    girls.forEach(([x, col], i) => {
      const y = 56 + Math.round(Math.sin(t * 2 + i) * 1);
      r(x + 1, y - 2, 8, 4, col); r(x, y, 10, 8, col);            // 髪
      r(x + 2, y + 2, 6, 6, '#F6D7C3');                            // 顔
      r(x + 3, y + 4, 1, 1, '#2A1A10'); r(x + 6, y + 4, 1, 1, '#2A1A10');
      r(x + 1, y + 8, 8, 12, col);                                 // 服
    });
    // がたす（中央。照れながら跳ねる）
    const by = 46 - Math.abs(Math.sin(t * 3)) * 3, bx = 74;
    r(bx, by, 12, 4, '#2A1A10');                                   // 髪
    r(bx, by + 4, 12, 10, '#F6D7C3');                              // 顔
    r(bx + 3, by + 7, 2, 2, '#2A1A10'); r(bx + 7, by + 7, 2, 2, '#2A1A10');
    r(bx + 1, by + 10, 2, 1, '#F2A0B4'); r(bx + 9, by + 10, 2, 1, '#F2A0B4'); // ほっぺ
    r(bx + 4, by + 11, 4, 1, '#C9772E');
    r(bx - 1, by + 14, 14, 14, '#5B8DD9'); r(bx + 5, by + 14, 2, 8, '#FFF0F5'); // 服とネクタイ
    r(bx + 1, by + 28, 4, 4, '#33203A'); r(bx + 7, by + 28, 4, 4, '#33203A');
    // 浮かんでいくハート
    const heart = (x, y, s, col) => { c.fillStyle = col; r(x, y, s, s, col); r(x + 2 * s, y, s, s, col); r(x - s, y + s, 5 * s, s, col); r(x, y + 2 * s, 3 * s, s, col); r(x + s, y + 3 * s, s, s, col); };
    for (let i = 0; i < 6; i++) {
      const p = (t * 0.5 + i / 6) % 1;
      const x = 40 + ((i * 47) % 80) + Math.sin(t * 2 + i) * 4, y = 70 - p * 70;
      heart(Math.round(x), Math.round(y), i % 2 ? 1 : 2, i % 3 ? '#FF6F9C' : '#FFC2D6');
    }
  }
});

add({
  order: 102,
  href: BETA + '/voxel-quiz/', kicker: 'クイズ', title: 'ぬがせて！ボクセルクイズ', sub: 'キャラを作って集めるクイズ',
  desc: 'ボクセルでオリジナルキャラを作って集める、成人向けのクイズゲーム。体型・身長・装飾パーツを決めてキャラを作り、クイズに正解して進めよう。18歳以上の方のみ遊べます。',
  tags: ['成人向け', 'クイズ', 'キャラ作成'], version: 'β0.1.0', updated: '2026-10-24',
  /* 成人向け：トップの一覧に出さない（広告の規約に合わせる。号口トップが対応してから効く） */
  adult: true,
  /* 160×90 のサムネイル（ドット絵）。t は秒。服を着た状態のキャラだけを描く */
  draw(c, t) {
    /* 回転台の上のボクセルキャラ（服を着ている）と、横に出るクイズの「？」 */
    const r = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
    const g = c.createLinearGradient(0, 0, 0, 90); g.addColorStop(0, '#1F2A44'); g.addColorStop(1, '#151A2A');
    c.fillStyle = g; c.fillRect(0, 0, 160, 90);
    // 床のグリッド
    c.strokeStyle = 'rgba(140,170,230,0.18)'; c.lineWidth = 1;
    for (let i = -8; i <= 8; i++) { c.beginPath(); c.moveTo(80 + i * 6, 70); c.lineTo(80 + i * 16, 90); c.stroke(); }
    for (let j = 0; j < 4; j++) { const y = 70 + j * j * 1.6 + j * 3; c.beginPath(); c.moveTo(0, y); c.lineTo(160, y); c.stroke(); }
    // 回転台
    c.fillStyle = '#2E3A5C'; c.beginPath(); c.ellipse(64, 74, 24, 6, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#41507A'; c.beginPath(); c.ellipse(64, 72, 24, 6, 0, 0, Math.PI * 2); c.fill();
    // ボクセルキャラ（向きで幅が変わる＝回っているように見せる）
    const w = Math.max(0.35, Math.abs(Math.cos(t * 1.2))), face = Math.cos(t * 1.2) > 0;
    const X = (x, y, ww, h, col) => r(64 + (x - 64) * w, y, Math.max(1, ww * w), h, col);
    X(56, 18, 16, 4, '#6B4A9E'); X(55, 22, 18, 10, '#6B4A9E');             // 髪
    X(57, 22, 14, 12, '#F6D7C3');                                          // 顔
    if (face) { X(59, 26, 3, 3, '#2A1A10'); X(66, 26, 3, 3, '#2A1A10'); X(62, 31, 4, 1, '#C9772E'); }
    X(56, 34, 16, 18, '#E8483A'); X(56, 34, 16, 3, '#FFF3E6');             // 服（えり付き）
    X(52, 36, 4, 14, '#E8483A'); X(72, 36, 4, 14, '#E8483A');              // そで
    X(52, 50, 4, 3, '#F6D7C3'); X(72, 50, 4, 3, '#F6D7C3');
    X(56, 52, 16, 8, '#2C3E66');                                           // スカート
    X(58, 60, 4, 10, '#F6D7C3'); X(66, 60, 4, 10, '#F6D7C3');
    X(57, 68, 6, 3, '#3B2A1E'); X(65, 68, 6, 3, '#3B2A1E');
    // クイズのふきだし
    const by = 16 + Math.sin(t * 2.5) * 2;
    r(100, by, 40, 26, '#FFF3E6'); r(98, by + 2, 44, 22, '#FFF3E6'); r(104, by + 26, 6, 4, '#FFF3E6'); r(102, by + 30, 3, 2, '#FFF3E6');
    const q = '#F0A35A';
    r(114, by + 5, 10, 3, q); r(122, by + 7, 3, 6, q); r(117, by + 12, 6, 3, q); r(117, by + 14, 3, 3, q); r(117, by + 19, 3, 3, q);
    // キラキラ
    for (let i = 0; i < 8; i++) { if ((Math.floor(t * 3) + i) % 3 === 0) r((i * 41) % 160, (i * 17) % 60, 2, 2, '#BFD3FF'); }
  }
});

add({
  order: 103,
  href: BETA + '/ikuiku-sumo/', kicker: 'リズムすもう',
  /* 限定公開：パスワードの SHA-256（16進） */
  lock: '48b3332f2a4e9f27415ebaa7c324be547bf53fa3c767927bd078cd4ff4fe96ec', title: 'いくいく！雲紅亭珍光', sub: '〜すもう編〜',
  desc: '色のバーに合わせてボタンを押して、シコを踏みながらママのもとへ。押し出し！ではっけい！で前進、お漏らし💦したらトイレへダッシュ！ リズムすもうゲーム。',
  tags: ['リズム', 'ひとりで遊ぶ'], version: 'β0.3.3', updated: '2026-10-25',
  /* 160×90 のサムネイル（ドット絵）。t は秒 */
  draw(c, t) {
    /* 土俵の上をシコを踏んで進むお相撲さんと、手をふるママ。上から色のバーが落ちる */
    const r = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
    const g = c.createLinearGradient(0, 0, 0, 90); g.addColorStop(0, '#2A1830'); g.addColorStop(1, '#4A2A38');
    c.fillStyle = g; c.fillRect(0, 0, 160, 90);
    for (let i = 0; i < 10; i++) r(i * 16, 22, 16, 30, i % 2 ? '#6E2433' : '#561B28');
    r(0, 52, 160, 38, '#C9A468'); r(0, 52, 160, 2, '#E3C58C'); r(0, 80, 160, 10, '#3A2418');
    // 落ちてくる色のバー
    [['#E8483A', 0], ['#3FB86B', 0.37], ['#3F86E8', 0.71]].forEach(([col, o], i) => {
      const y = ((t * 0.8 + o) % 1) * 60 - 8; r(10 + i * 22, y, 18, 5, col); r(10 + i * 22, y, 18, 1, 'rgba(255,255,255,.4)');
    });
    // お相撲さん（キャップ・はらまわし）。ゆっくり右へ進み、足を交互に上げる
    const p = (t * 0.12) % 1, x = 62 + p * 40, st = Math.floor(t * 4) % 2, gy = 74;
    r(x + 2, gy - 6 - (st ? 3 : 0), 5, 6, '#F2C29B'); r(x + 11, gy - 6 - (st ? 0 : 3), 5, 6, '#F2C29B');
    r(x, gy - 22, 18, 16, '#F2C29B'); r(x, gy - 10, 18, 4, '#C9B08A'); r(x + 7, gy - 6, 4, 4, '#C9B08A'); r(x + 3, gy - 9, 3, 2, '#8A6A4A'); r(x + 11, gy - 9, 3, 2, '#8A6A4A'); r(x + 8, gy - 7, 1, 1, '#F4EFE4');
    r(x + 4, gy - 32, 10, 10, '#F2C29B'); r(x + 3, gy - 35, 12, 5, '#2B2F36'); r(x + 13, gy - 31, 5, 2, '#1A1D22'); r(x + 7, gy - 34, 3, 2, '#E8483A');
    r(x + 5, gy - 29, 4, 4, '#26262C'); r(x + 10, gy - 29, 4, 4, '#26262C'); r(x + 6, gy - 28, 2, 2, '#F2C29B'); r(x + 11, gy - 28, 2, 2, '#F2C29B'); r(x + 7, gy - 27, 1, 1, '#2A1A10'); r(x + 12, gy - 27, 1, 1, '#2A1A10'); r(x + 8, gy - 24, 3, 1, '#8A3A2A');
    // ママ
    const mx = 128, wave = Math.floor(t * 4) % 2;
    r(mx, gy - 30, 12, 20, '#5A3322'); r(mx + 2, gy - 28, 8, 8, '#F8D5BE'); r(mx + 2, gy - 30, 8, 3, '#5A3322');
    r(mx + 3, gy - 24, 1, 2, '#2A1A10'); r(mx + 8, gy - 24, 1, 2, '#2A1A10'); r(mx + 8, gy - 31, 4, 3, '#FF7FA8');
    r(mx + 3, gy - 19, 7, 9, '#F28FB0'); for (let i = 0; i < 8; i++) r(mx + 6 - (6 + i) / 2, gy - 10 + i, 6 + i, 1, '#F28FB0');
    r(mx + 5, gy - 17, 3, 12, '#FFFFFF'); r(mx + 10, wave ? gy - 26 : gy - 17, 2, wave ? 8 : 7, '#F8D5BE');
  }
});

add({
  order: 105,
  kicker: '横スクロール散歩', title: 'やすにゃんこんにゃん！', sub: '散歩チュウ',
  desc: 'こんにゃんを連れて、おでん横丁をひとまわり。激うまアイテムを拾って、七味やばくだんはジャンプでよけよう。ゴールでこんにゃんが……！？',
  tags: ['アクション', 'ひとりで遊ぶ'], version: 'β0.7.2', updated: '2026-10-25',
  /* 開発に公開：ぼかして「開発中」。リンクは貼らない（URL は会話の中でだけ共有する） */
  dev: true,
  /* 160×90 のサムネイル（ドット絵）。t は秒 */
  draw(c, t) {
    /* 夕方の屋台通りを歩くやすにゃんとこんにゃん。道にアイテムが流れてくる */
    const r = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
    const g = c.createLinearGradient(0, 0, 0, 62); g.addColorStop(0, '#2A1B3F'); g.addColorStop(1, '#F0935C');
    c.fillStyle = g; c.fillRect(0, 0, 160, 62);
    const o = (t * 30) % 80;
    // 屋台（赤白のひさしとちょうちん）
    for (let k = -1; k < 3; k++) {
      const x = k * 80 - o + 10;
      r(x, 40, 44, 22, '#6B3F25'); r(x - 2, 28, 48, 4, '#4A2A16');
      for (let j = 0; j < 6; j++) r(x - 2 + j * 8, 24, 8, 8, j % 2 ? '#F6EBD0' : '#C93A33');
      r(x + 34, 34, 5, 6, '#D93A2B'); r(x + 35, 33, 3, 1, '#FFE9A8');
    }
    r(0, 62, 160, 28, '#4B3427'); r(0, 62, 160, 2, '#6D4C38');
    // アイテム（ちくわ・金のちくわ）と減点のばくだん
    const ix = 150 - ((t * 38) % 190), bob = Math.sin(t * 4) * 2;
    r(ix, 52 + bob, 10, 5, '#B8692A'); r(ix + 1, 53 + bob, 8, 2, '#E9A55B');
    const kx = 150 - ((t * 38 + 70) % 190);
    r(kx, 36 + bob, 12, 6, '#F6C945'); r(kx + 1, 37 + bob, 10, 2, '#FFE98A');
    const bx = 150 - ((t * 38 + 120) % 190);
    r(bx, 54, 9, 9, '#1C1D24'); r(bx + 6, 51, 2, 3, '#8A6A48'); r(bx + 7, 49 + (Math.floor(t * 8) % 2), 2, 2, '#FFB23A');
    // こんにゃん（ねこ耳のこんにゃく）
    const st = Math.floor(t * 6) % 2, kn = 38, ky = 63 - st;
    r(kn, ky - 14, 3, 4, '#8D8E96'); r(kn + 13, ky - 14, 3, 4, '#8D8E96'); r(kn, ky - 11, 16, 11, '#8D8E96');
    r(kn + 3, ky - 8, 3, 3, '#fff'); r(kn + 10, ky - 8, 3, 3, '#fff'); r(kn + 3, ky - 7, 1, 2, '#1C1D24'); r(kn + 10, ky - 7, 1, 2, '#1C1D24');
    r(kn + 4, ky - 3, 2, 1, '#5E5F68'); r(kn + 10, ky - 4, 2, 1, '#5E5F68');
    // やすにゃん
    const px = 68, py = 63 - (Math.floor(t * 6 + 1) % 2), jmp = Math.max(0, Math.sin(t * 2.2)) * 12;
    const y0 = py - jmp;
    r(px + 3, y0 - 26, 10, 4, '#3A2412'); r(px + 3, y0 - 23, 10, 8, '#F6D7C3'); r(px + 5, y0 - 20, 2, 2, '#2A1A10'); r(px + 9, y0 - 20, 2, 2, '#2A1A10');
    r(px + 2, y0 - 15, 12, 9, '#E9A55B'); r(px + 3, y0 - 6, 10, 6, '#4A4E7A'); r(px + 3, y0, 4, 2, '#2A1A10'); r(px + 9, y0, 4, 2, '#2A1A10');
    c.strokeStyle = '#D93A2B'; c.lineWidth = 1; c.beginPath(); c.moveTo(px + 14, y0 - 11); c.quadraticCurveTo(px - 2, y0 - 2, kn + 14, ky - 5); c.stroke();
  }
});


add({
  order: 106,
  kicker: 'ほどくパズル', title: 'ほどけ！おでん串', sub: '絡まった串をほどいて鍋へ',
  desc: '絡まったおでん串をタップで引き抜いて、鍋にどんどん入れよう。結び目つきの串、同じ具のつづけ技、定番の組み合わせで高得点。抜くと奥の串が動いて、ずっと終わらない。',
  tags: ['パズル', 'ひとりで遊ぶ'], version: 'β0.1.0', updated: '2026-11-01',
  /* 開発に公開：ぼかして「開発中」。リンクは貼らない（URL は会話の中でだけ共有する） */
  dev: true,
  /* 160×90 のサムネイル。t は秒 */
  draw(c, t) {
    const g = c.createLinearGradient(0, 0, 0, 90); g.addColorStop(0, '#6A4424'); g.addColorStop(1, '#4F3119');
    c.fillStyle = g; c.fillRect(0, 0, 160, 90);
    c.lineCap = 'round';
    const sk = (x1, y1, x2, y2, w, col) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); };
    const sw = Math.sin(t * 2) * 3;
    sk(24, 20, 112 + sw, 62, 3, '#ECD199'); sk(30, 72, 120, 24 + sw, 4, '#D79A4A'); sk(60, 12, 56, 80, 3, '#ECD199');
    c.fillStyle = '#F4ECD8'; c.beginPath(); c.arc(112 + sw, 62, 8, 0, 7); c.fill();
    c.fillStyle = '#FFF8EA'; c.beginPath(); c.ellipse(120, 24 + sw, 9, 7, 0, 0, 7); c.fill(); c.fillStyle = '#F2B23A'; c.beginPath(); c.arc(120, 24 + sw, 3, 0, 7); c.fill();
    c.fillStyle = '#D99A52'; c.fillRect(48, 76, 16, 8);
    c.strokeStyle = '#D64A3A'; c.lineWidth = 2; c.beginPath(); c.arc(60, 46, 5, 0, 7); c.stroke();
  }
});

add({
  order: 107,
  kicker: '線路つなぎパズル', title: 'つなげ！ちくわ線路（仮）', sub: '駅から出て、駅にもどる線路をつなごう',
  desc: '降ってくる線路をつないで、駅から出て駅にもどるルートを作ろう。走った線路は消えて、上の線路が落ちてまたつながれば連続発車。発車時刻までにつなげないと脱線！アーケード（20レベル）とフリー。',
  tags: ['パズル', 'ひとりで遊ぶ'], version: 'β0.2.6', updated: '2026-11-08',
  /* 開発に公開：ぼかして「開発中」。リンクは貼らない（URL は会話の中でだけ共有する） */
  dev: true,
  /* 160×90 のサムネイル。t は秒 */
  draw(c, t) {
    c.fillStyle = '#1D2733'; c.fillRect(0, 0, 160, 90);
    const tile = (x, y) => { c.fillStyle = '#3A4A3A'; c.fillRect(x, y, 18, 18); };
    c.strokeStyle = '#D6DCE4'; c.lineWidth = 2;
    const pts = [[80, 90], [80, 54], [98, 54], [98, 18], [62, 18]];
    pts.forEach((p, i) => { if (i) { const q = pts[i - 1]; tile(Math.min(p[0], q[0]) - 9, Math.min(p[1], q[1]) - 9); } });
    c.lineWidth = 6; c.strokeStyle = '#8A6A44'; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke();
    c.lineWidth = 2; c.strokeStyle = '#D6DCE4'; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke();
    const u = (t * 0.25) % 1, seg = [[80, 90, 80, 54], [80, 54, 98, 54], [98, 54, 98, 18], [98, 18, 62, 18]], len = seg.map(s => Math.hypot(s[2] - s[0], s[3] - s[1])), tot = len.reduce((a, b) => a + b, 0);
    let d = u * tot, i = 0; while (i < 3 && d > len[i]) { d -= len[i]; i++; }
    const s = seg[i], f = d / len[i], x = s[0] + (s[2] - s[0]) * f, y = s[1] + (s[3] - s[1]) * f;
    c.fillStyle = '#E9A55B'; c.fillRect(Math.round(x) - 6, Math.round(y) - 6, 12, 12); c.fillStyle = '#FFF2C9'; c.fillRect(Math.round(x) - 2, Math.round(y) - 3, 4, 6);
  }
});

add({
  order: 108,
  kicker: 'ミニゲーム集', title: 'ちくわでるでる！ドーパミン', sub: '気持ちいいミニゲーム集',
  desc: '手軽でテンポよく、気持ちいいミニゲーム集。麻雀「あと1手」・777揃え・空き缶プレス・ゴミ箱スローの4つ。4つを連続で遊ぶアーケードも。',
  tags: ['ミニゲーム', 'ひとりで遊ぶ'], version: 'β0.2.1', updated: '2026-11-03',
  /* 開発に公開：ぼかして「開発中」。リンクは貼らない（URL は会話の中でだけ共有する） */
  dev: true,
  /* 160×90 のサムネイル。t は秒 */
  draw(c, t) {
    const g = c.createLinearGradient(0, 0, 0, 90); g.addColorStop(0, '#3A1F63'); g.addColorStop(1, '#1B1030');
    c.fillStyle = g; c.fillRect(0, 0, 160, 90);
    c.fillStyle = '#FFCF5A'; c.fillRect(34, 22, 92, 46); c.fillStyle = '#1A0D00'; c.fillRect(39, 30, 82, 30);
    c.font = '900 22px Impact,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < 3; i++) { c.fillStyle = '#FFFFFF'; c.fillRect(42 + i * 27, 33, 23, 24); c.fillStyle = '#E10000'; c.fillText('7', 53 + i * 27, 46 + Math.sin(t * 6 + i) * 2); }
    for (let i = 0; i < 14; i++) { const p = (t * 0.6 + i / 14) % 1, x = (i * 37) % 160, y = 90 - p * 100; c.fillStyle = i % 3 ? '#FFD84A' : '#FF5FA2'; c.fillRect(x, y, 4, 4); }
  }
});

add({
  order: 111,
  kicker: '3D脱出ホラー', title: 'サイレント夜（仮）', sub: '研究施設の地下から脱出せよ',
  desc: 'クリスマスの夜、キャンプで飲みすぎたがたすと雲紅亭珍光は、山の中の古い研究施設の地下で目をさます。懐中電灯ひとつで、暗い施設を逃げて、隠れて、脱出をめざす一人称ホラー。',
  tags: ['ホラー', '3D', 'ひとりで遊ぶ'], version: 'β0.3.0', updated: '2026-11-08',
  /* 開発に公開：ぼかして「開発中」。リンクは貼らない（URL は会話の中でだけ共有する） */
  dev: true,
  /* 160×90 のサムネイル。t は秒 */
  draw(c, t) {
    c.fillStyle = '#050607'; c.fillRect(0, 0, 160, 90);
    // 廊下（奥へすぼまる壁）
    c.fillStyle = '#15180f'; c.beginPath(); c.moveTo(0, 0); c.lineTo(62, 30); c.lineTo(62, 62); c.lineTo(0, 90); c.fill();
    c.beginPath(); c.moveTo(160, 0); c.lineTo(98, 30); c.lineTo(98, 62); c.lineTo(160, 90); c.fill();
    // 懐中電灯の光（ゆれる）
    const fx = 80 + Math.sin(t * 1.3) * 10, fy = 50 + Math.sin(t * 2.1) * 3;
    const g = c.createRadialGradient(fx, fy, 2, fx, fy, 40);
    g.addColorStop(0, 'rgba(255,238,200,.55)'); g.addColorStop(1, 'rgba(255,238,200,0)');
    c.fillStyle = g; c.fillRect(0, 0, 160, 90);
    // 奥の培養槽の緑
    c.fillStyle = 'rgba(93,255,122,' + (0.25 + Math.sin(t * 1.6) * 0.1).toFixed(2) + ')'; c.fillRect(72, 34, 16, 24);
    // 奥に立つ何か（ときどき目が光る）
    c.fillStyle = '#000'; c.fillRect(77, 38, 6, 18); c.beginPath(); c.arc(80, 36, 4, 0, 7); c.fill();
    if ((t % 3) < 1.6) { c.fillStyle = '#ff3020'; c.fillRect(78, 35, 1, 1); c.fillRect(81, 35, 1, 1); }
  }
});


})();

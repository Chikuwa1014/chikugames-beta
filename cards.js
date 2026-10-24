/* ちくわゲームズ本番トップの「Beta」欄に出すカード（βのゲームの紹介とサムネイル）
   本番トップ（chikuwa-games の index.html）がこのファイルを読み込む。本番側は触らなくてよい。
   βのゲームを増やしたら、ここに1件足して push するだけで本番トップの Beta 欄に出る。
   限定公開にするカードは lock にパスワードの SHA-256（16進。例：printf 'pass' | sha256sum）を書く。
   限定公開のカードにも href は必ず書く（本番トップがパスワード欄と鍵の記録に href を使う。無いとエラーで Beta 欄が出なくなる）。
   href は βの Worker（BETA）の絶対 URL。version は β 付き（ゲーム内の VERSION とそろえる）。
   正式版にするときは、本番リポジトリに同じ名前のフォルダと card.js（beta なし）を作り、ここから消す */
(() => {
const BETA = 'https://chikuwagames-beta.chikuwa-hookah.workers.dev';
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
  tags: ['リズム', 'ひとりで遊ぶ'], version: 'β0.3.1', updated: '2026-10-25',
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

})();

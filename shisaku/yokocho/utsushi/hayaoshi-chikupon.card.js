/* ちくわゲームズのトップページに出すカード（このゲームの紹介とサムネイル） */
(window.CHIKUWA_GAMES = window.CHIKUWA_GAMES || []).push({
  order: 103,
  href: './hayaoshi-chikupon/', kicker: 'はやおし', title: '早押し！ちくぽん！', sub: '合図が出たらすぐ押せ！',
  desc: 'いろ・おと・しんどうの合図で反応のはやさをはかる「ひとりで」と、出題者の回答許可で早押し対決する「みんなで」（最大8人）。',
  tags: ['反射神経', 'ひとりで遊ぶ', '最大8人で通信'], version: '1.0.1', updated: '2026-10-27',
  /* 160×90 のサムネイル（ドット絵）。t は秒 */
  draw(c, t) {
    const r = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
    const g = c.createLinearGradient(0, 0, 0, 90); g.addColorStop(0, '#FFE6B8'); g.addColorStop(1, '#F3DDB2');
    c.fillStyle = g; c.fillRect(0, 0, 160, 90);
    // 点滅する合図の画面（赤→緑）
    const on = Math.floor(t * 1.5) % 2;
    r(14, 16, 60, 40, on ? '#1FAE5B' : '#D64545'); r(14, 16, 60, 2, 'rgba(255,255,255,.35)');
    // ちくわくんが手をあげる
    const by = 58 - Math.abs(Math.sin(t * 4)) * 4;
    r(94, by, 40, 22, '#F3DDB2'); r(94, by, 40, 4, '#C9772E'); r(94, by + 18, 40, 4, '#C9772E');
    r(102, by + 8, 3, 3, '#2A1A10'); r(124, by + 8, 3, 3, '#2A1A10');
    r(108, by + 14, 20, 2, '#C9772E');
    r(116, by - 10, 4, 12, '#F3DDB2'); r(114, by - 12, 8, 3, '#C9772E');   // 手
    // 押した合図の上で広がる波紋
    for (let i = 0; i < 3; i++) { const p = ((t * 0.8) + i / 3) % 1; c.strokeStyle = `rgba(75,79,163,${1 - p})`; c.lineWidth = 1.5; c.beginPath(); c.arc(44, 36, 6 + p * 22, 0, Math.PI * 2); c.stroke(); }
    // 数字（ms）
    r(20, 70, 2, 2, '#3A2412'); r(26, 70, 2, 2, '#3A2412');
  }
});

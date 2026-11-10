/* ちくわゲームズのトップページに出すカード（このゲームの紹介とサムネイル）
   バージョンを上げたら version と updated をここで更新する。トップページ（../index.html）は読み込むだけ */
(window.CHIKUWA_GAMES = window.CHIKUWA_GAMES || []).push({
  order: 3,
  href: './roulette/', kicker: 'ルーレット', title: 'まわせ！ちくわルーレット', sub: 'すごろくRPG＆みんなで決めるルーレット',
  desc: 'ひとりなら出目で進んで出目で戦う、おでん横丁の冒険（全5ステージ）。みんなでなら最大8人で1つのルーレット。出てほしくない出目は攻撃ボタンではじき返せ！',
  tags: ['ルーレット', 'ひとりで遊ぶ', '最大8人で通信'], version: '1.0.1', updated: '2026-10-27',
  /* 160×90 のサムネイル（ドット絵）。t は秒 */
  draw(c, t) {
    /* 夜の横丁でまわるルーレット。中心はちくわ、横でちくわくんが見守る */
    const r = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
    const g = c.createLinearGradient(0, 0, 0, 90); g.addColorStop(0, '#2C2240'); g.addColorStop(1, '#1B1622');
    c.fillStyle = g; c.fillRect(0, 0, 160, 90);
    for (let i = 0; i < 14; i++) { const x = (i * 37) % 160, y = (i * 23) % 40; if ((Math.floor(t * 2) + i) % 5) r(x, y, 1, 1, '#FFE8B0'); }
    const cx = 80, cy = 44, R = 30, cols = ['#F2B23A', '#E8483A', '#F3DDB2', '#7FB069', '#C9772E', '#5B8DD9', '#E98BC2', '#8D8E96'];
    c.fillStyle = '#5A3A28'; c.beginPath(); c.arc(cx, cy, R + 3, 0, Math.PI * 2); c.fill();
    const spin = (t % 6) < 4 ? t * (4 - (t % 6)) * 0.9 : 0;
    const a0 = 0.3 + (spin % (Math.PI * 2));
    for (let i = 0; i < 8; i++) {
      c.fillStyle = cols[i]; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, R, a0 + i * Math.PI / 4, a0 + (i + 1) * Math.PI / 4); c.closePath(); c.fill();
    }
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; r(cx + Math.cos(a) * (R + 1.5) - 0.5, cy + Math.sin(a) * (R + 1.5) - 0.5, 1.5, 1.5, (Math.floor(t * 4) + k) % 2 ? '#FFD9A8' : '#F2B23A'); }
    c.fillStyle = '#C9772E'; c.beginPath(); c.arc(cx, cy, 8, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#F3DDB2'; c.beginPath(); c.arc(cx, cy, 5.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2A1A10'; c.beginPath(); c.arc(cx, cy, 2.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#FFF3E6'; c.beginPath(); c.moveTo(cx, cy - R + 5); c.lineTo(cx - 4, cy - R - 4); c.lineTo(cx + 4, cy - R - 4); c.closePath(); c.fill();
    // ちくわくん（左）とこんにゃん（右）
    const px = 18, py = 60 - Math.abs(Math.sin(t * 3)) * 4;
    r(px, py + 1, 8, 10, '#F3DDB2'); r(px, py + 1, 8, 3, '#C9772E'); r(px + 1, py, 6, 2, '#E9A55B');
    r(px + 2, py + 5, 1, 2, '#2A1A10'); r(px + 5, py + 5, 1, 2, '#2A1A10'); r(px + 1, py + 8, 6, 1, '#C9772E');
    const ex = 132, ey = 62;
    r(ex, ey, 12, 9, '#8D8E96'); r(ex, ey - 2, 2, 2, '#8D8E96'); r(ex + 10, ey - 2, 2, 2, '#8D8E96');
    r(ex + 3, ey + 3, 2, 2, '#2A1A10'); r(ex + 7, ey + 3, 2, 2, '#2A1A10');
    r(0, 78, 160, 12, '#2A2234'); r(0, 78, 160, 1, '#3B3146');
    // はじく！の衝撃
    if ((t % 6) > 2.2 && (t % 6) < 2.6) { c.strokeStyle = '#FFD23F'; c.lineWidth = 1.5; c.beginPath(); c.arc(cx, cy - R, 5 + ((t % 6) - 2.2) * 30, 0, Math.PI * 2); c.stroke(); }
  }
});

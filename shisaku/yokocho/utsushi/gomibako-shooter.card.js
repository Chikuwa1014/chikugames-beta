/* ちくわゲームズのトップページに出すカード（このゲームの紹介とサムネイル） */
(window.CHIKUWA_GAMES = window.CHIKUWA_GAMES || []).push({
  order: 106,
  href: './gomibako-shooter/',
  kicker: '爆走シュート', title: 'スタイリッシュゴミ箱シューター', sub: 'かっこよく決めて、ランクを上げろ',
  desc: '夜の街をスケボーで爆走しながら、ゴミをゴミ箱へシュート！左右に動いて硬いゴミ箱を撃ちぬき、強化アイテムで Lv20 まで鍛えよう。キッカーやレールでトリック、水たまりや自転車に注意。全 100 ステージと、どこまでも走る FREE モード。',
  tags: ['アクション', '3D', 'ひとりで遊ぶ'], version: '1.0.0', updated: '2026-11-09',
  /* 160×90 のサムネイル。t は秒 */
  draw(c, t) {
    const g = c.createLinearGradient(0, 0, 0, 90); g.addColorStop(0, '#1A0F36'); g.addColorStop(1, '#06040C');
    c.fillStyle = g; c.fillRect(0, 0, 160, 90);
    c.strokeStyle = 'rgba(255,46,136,.25)'; c.lineWidth = 1;
    for (let y = (t * 60) % 16 - 16; y < 90; y += 16) { c.beginPath(); c.moveTo(0, y); c.lineTo(160, y); c.stroke(); }
    c.strokeStyle = 'rgba(255,255,255,.35)';
    for (let i = 0; i < 8; i++) { const x = (i * 23) % 160, y = ((t * 200 + i * 40) % 130) - 30; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 18); c.stroke(); }
    // ゴミ箱
    const cx = 80 + Math.sin(t * 2) * 30;
    c.fillStyle = '#c5cde0'; c.fillRect(cx - 10, 24, 20, 12);
    c.fillStyle = '#05030a'; c.beginPath(); c.ellipse(cx, 24, 10, 5, 0, 0, 7); c.fill();
    c.strokeStyle = '#22E6FF'; c.lineWidth = 2; c.stroke();
    // 飛んでいくゴミ
    const p = (t * 1.4) % 1, bx = 80 + (cx - 80) * p, by = 74 - 50 * p;
    c.fillStyle = 'rgba(255,46,136,.5)'; for (let i = 1; i < 5; i++) { c.beginPath(); c.arc(80 + (cx - 80) * (p - i * 0.05), 74 - 50 * (p - i * 0.05), 3 - i * 0.5, 0, 7); c.fill(); }
    c.fillStyle = '#fff'; c.beginPath(); c.arc(bx, by, 3.5, 0, 7); c.fill();
    // ちくわくん
    c.fillStyle = '#E9B46A'; c.fillRect(68, 74, 24, 10); c.fillStyle = '#A8642A'; c.fillRect(73, 74, 3, 10); c.fillRect(81, 74, 3, 10);
    c.fillStyle = '#111'; c.fillRect(70, 76, 6, 3); c.fillRect(78, 76, 6, 3);
    c.fillStyle = '#FF2E88'; c.fillRect(64, 85, 32, 2);
    // ランク
    c.font = 'italic 900 22px Impact,sans-serif'; c.textAlign = 'right'; c.textBaseline = 'top';
    c.fillStyle = '#22E6FF'; c.fillText('SSS', 153, 4); c.fillStyle = '#FF2E88'; c.fillText('SSS', 157, 4); c.fillStyle = '#C86BFF'; c.fillText('SSS', 155, 4);
  }
});

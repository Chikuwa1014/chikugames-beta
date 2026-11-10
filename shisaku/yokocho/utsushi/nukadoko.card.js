/* ちくわゲームズのトップページに出すカード（このゲームの紹介とサムネイル） */
(window.CHIKUWA_GAMES = window.CHIKUWA_GAMES || []).push({
  order: 107,
  href: './nukadoko/',
  kicker: '育成シミュレーション', title: 'ぬか床そだて', sub: 'ぬか床を育てて、ぬか漬けを売ろう',
  desc: 'ぬか床を指でぐるぐるかき混ぜて、乳酸菌・塩け・水分をちょうどよく。きゅうりやなすから、たけのこ・アボカド・さば・たくあんまで、100種の食べ物を食べごろで取り出して売ろう。3日〜365日のチャレンジも。',
  tags: ['シミュレーション', 'ひとりで遊ぶ'], version: '1.0.1', updated: '2026-11-09',
  /* 160×90 のサムネイル。t は秒 */
  draw(c, t) {
    c.fillStyle = '#2B2014'; c.fillRect(0, 0, 160, 90);
    // かめ（上から）とぬか
    c.fillStyle = '#8A6239'; c.beginPath(); c.arc(80, 45, 40, 0, 7); c.fill();
    c.fillStyle = '#B07A42'; c.beginPath(); c.arc(80, 45, 34, 0, 7); c.fill();
    const a = t * 1.5;
    c.fillStyle = 'rgba(90,55,25,.45)';
    for (let i = 0; i < 24; i++) { const r = 6 + (i * 7) % 26, b = i * 2.4 + a * (1 - r / 40); c.fillRect(80 + Math.cos(b) * r, 45 + Math.sin(b) * r, 2, 2); }
    // きゅうりとなす
    c.save(); c.translate(68, 38); c.rotate(-0.3); c.fillStyle = '#3F8A2E'; c.beginPath(); c.ellipse(0, 0, 13, 4, 0, 0, 7); c.fill(); c.restore();
    c.save(); c.translate(92, 52); c.rotate(0.4); c.fillStyle = '#4B2A6B'; c.beginPath(); c.ellipse(0, 0, 11, 6, 0, 0, 7); c.fill(); c.fillStyle = '#3A6B2A'; c.beginPath(); c.arc(-10, 0, 3.5, 0, 7); c.fill(); c.restore();
    // かき混ぜる指の軌跡
    c.strokeStyle = '#9FC75A'; c.lineWidth = 2.5; c.lineCap = 'round';
    c.beginPath(); c.arc(80, 45, 40, a, a + 1.6); c.stroke();
  }
});
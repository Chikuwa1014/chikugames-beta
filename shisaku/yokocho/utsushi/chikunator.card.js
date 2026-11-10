/* ちくわゲームズのトップページに出すカード（このゲームの紹介とサムネイル） */
(window.CHIKUWA_GAMES = window.CHIKUWA_GAMES || []).push({
  order: 108,
  href: './chikunator/',
  kicker: '推理ゲーム', title: 'チクネーター', sub: '思い浮かべた食べ物を当てる',
  desc: '食べ物をひとつ思い浮かべて、ちくわくんの質問に答えよう。タピオカ・マリトッツォから、おでんの具まで600種類以上。おでん鍋の湯気を読んで、20問以内に当ててみせる！負けたら答えを教えると、ちくわくんが覚えて強くなる。',
  tags: ['推理', 'ひとりで遊ぶ'], version: '1.0.0', updated: '2026-11-09',
  /* 160×90 のサムネイル。t は秒 */
  draw(c, t) {
    const g = c.createLinearGradient(0, 0, 0, 90); g.addColorStop(0, '#3A2440'); g.addColorStop(1, '#1A1322');
    c.fillStyle = g; c.fillRect(0, 0, 160, 90);
    // ちょうちん
    [[18, 0], [80, 1], [142, 2]].forEach(([x, i]) => { c.fillStyle = '#E5533D'; c.beginPath(); c.ellipse(x, 10 + Math.sin(t * 2 + i) * 1, 6, 8, 0, 0, 7); c.fill(); });
    // 湯気
    for (let i = 0; i < 5; i++) {
      const p = (t * 0.4 + i / 5) % 1;
      c.fillStyle = 'rgba(255,255,255,' + (0.35 * (1 - p)).toFixed(2) + ')';
      c.beginPath(); c.arc(46 + i * 12 + Math.sin(t + i) * 4, 58 - p * 46, 5 + p * 8, 0, 7); c.fill();
    }
    // 鍋
    c.fillStyle = '#2A1A14'; c.beginPath(); c.ellipse(64, 66, 44, 22, 0, 0, Math.PI); c.fill();
    c.fillStyle = '#C58A45'; c.beginPath(); c.ellipse(64, 66, 42, 8, 0, 0, 7); c.fill();
    c.fillStyle = '#8A8D95'; c.beginPath(); c.moveTo(40, 66); c.lineTo(48, 59); c.lineTo(56, 66); c.fill();
    c.fillStyle = '#FFF8EA'; c.beginPath(); c.ellipse(72, 64, 6, 4, 0, 0, 7); c.fill();
    c.fillStyle = '#FFC94A'; c.beginPath(); c.arc(72, 64, 2.2, 0, 7); c.fill();
    // ちくわくん
    const y = 30 + Math.sin(t * 2) * 2;
    c.fillStyle = '#E9B46A'; c.fillRect(112, y, 36, 16); c.beginPath(); c.arc(148, y + 8, 8, -Math.PI / 2, Math.PI / 2); c.fill();
    c.fillStyle = '#F4DCAE'; c.beginPath(); c.ellipse(112, y + 8, 4, 8, 0, 0, 7); c.fill();
    c.fillStyle = '#6A3D18'; c.beginPath(); c.ellipse(112, y + 8, 2, 4, 0, 0, 7); c.fill();
    c.fillStyle = '#A8642A'; c.fillRect(120, y, 3, 16); c.fillRect(138, y, 3, 16);
    c.fillStyle = '#2A1A10'; c.fillRect(126, y + 5, 3, 3); c.fillRect(134, y + 5, 3, 3);
    c.fillStyle = '#fff'; c.fillRect(118, y - 1, 30, 2);
    // ？
    c.font = '900 22px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#FFD36B'; c.fillText('？', 130 + Math.sin(t * 3) * 2, y - 14);
  }
});
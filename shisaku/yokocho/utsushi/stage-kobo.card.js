/* ちくわゲームズのトップページに出すカード（このゲームの紹介とサムネイル）
   バージョンを上げたら version と updated をここで更新する。トップページ（../index.html）は読み込むだけ */
(window.CHIKUWA_GAMES = window.CHIKUWA_GAMES || []).push({
  order: 2,
  href: './stage-kobo/', kicker: 'ゲームメーカー', title: 'つくれ！おでん横丁', sub: 'ちくわくんの2Dアクションステージメーカー',
  desc: 'ちくわくんが走る「おでん横丁」のステージを作って、その場でテストプレイ。クリアで集めたちくわで、ちょうちんやおみくじ箱などのパーツを解放できる。',
  tags: ['アクション', 'つくる', 'リンクで共有'], version: '1.5.5', updated: '2026-10-27',
  /* 160×90 のサムネイル（ドット絵）。t は秒 */
  draw(c, t) {
    /* おでん横丁の夕暮れ：ちくわくん、こんにゃん、だしのしずく、かまぼこ板、ちょうちん、のれん */
    const r = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
    const g = c.createLinearGradient(0, 0, 0, 90); g.addColorStop(0, '#2C2D63'); g.addColorStop(0.55, '#A9587C'); g.addColorStop(1, '#F2A46A');
    c.fillStyle = g; c.fillRect(0, 0, 160, 90);
    // 横丁の町並み（ゲームの「たそがれどき」と同じ色）：町家・屋台・「おでん」の縦看板・ちょうちんの列
    const roof = (x, y, w) => { c.fillStyle = '#3A2846'; c.beginPath(); c.moveTo(x - 3, y + 4); c.lineTo(x + 2, y); c.lineTo(x + w - 2, y); c.lineTo(x + w + 3, y + 4); c.fill(); };
    // 基礎：上端の濃い灰色から下に行くほど暗くなるグラデーション
    const fg = c.createLinearGradient(0, 72, 0, 90); fg.addColorStop(0, '#45404B'); fg.addColorStop(1, '#1E1C24');
    c.fillStyle = fg; c.fillRect(0, 72, 160, 18); r(0, 72, 160, 1, '#5A5560');
    const street = [[-4, 'm'], [30, 'y'], [58, 't'], [94, 'm'], [128, 't']];
    for (const [x, type] of street) {
      if (type === 'y') {
        r(x + 3, 62, 22, 12, '#5A3A4A'); r(x + 3, 47, 1, 15, '#5A3A4A'); r(x + 24, 47, 1, 15, '#5A3A4A'); roof(x + 2, 44, 24);
        for (let i = 0; i < 4; i++) r(x + 4 + i * 5.5, 48, 5, 5, i % 2 ? '#8E2E3A' : '#2A2E5E');
        continue;
      }
      const top = type === 't' ? 30 : 38;
      r(x + 2, top, 30, 74 - top, '#6E4A6E'); r(x + 2, top, 2, 74 - top, '#5C3C60');
      roof(x + 2, top - 4, 30); roof(x + 2, 52, 30);
      r(x + 8, top + 5, 18, 8, '#FFC27A'); for (let i = 0; i <= 4; i++) r(x + 8 + i * 4.3, top + 5, 1, 8, '#5A3A4A');
      r(x + 11, 61, 12, 13, '#5A3A4A'); r(x + 11, 61, 12, 6, type === 't' ? '#8E2E3A' : '#2A2E5E');
      if (type === 't') { r(x + 26, top + 3, 6, 20, '#4A2E3A'); for (let i = 0; i < 3; i++) r(x + 28, top + 6 + i * 6, 2, 3, '#FFD9A8'); }
    }
    c.strokeStyle = '#3A2846'; c.lineWidth = 0.8;
    for (let x = -10; x < 170; x += 40) {
      c.beginPath(); c.moveTo(x, 22); c.quadraticCurveTo(x + 20, 30, x + 40, 22); c.stroke();
      for (let j = 1; j < 4; j++) { const u = j / 4; r(x + 40 * u - 1, 22 + 16 * u * (1 - u) + 1, 3, 3, '#FF7A45'); }
    }
    // 湯気
    c.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 3; i++) { const ph = (t * 0.35 + i / 3) % 1; c.beginPath(); c.arc(40 + i * 34 + Math.sin(t * 2 + i) * 3, 52 - ph * 40, 3 + ph * 5, 0, Math.PI * 2); c.fill(); }
    // 地面（穴あり）
    for (let x = 0; x < 160; x += 10) {
      if (x >= 60 && x < 80) continue;
      r(x, 74, 10, 16, '#7A4E36'); r(x, 74, 10, 3, '#5E9A3E'); r(x + 3, 82, 2, 2, '#623D2A');
    }
    // かまぼこ板
    for (let i = 0; i < 4; i++) { const x = 52 + i * 10; r(x, 44, 10, 2, '#EE8AA0'); r(x, 46, 10, 5, '#FFF7F0'); r(x, 51, 10, 3, '#C99A62'); }
    // ちょうちん
    const lx = 22, ly = 18;
    const gl = c.createRadialGradient(lx, ly, 1, lx, ly, 16); gl.addColorStop(0, 'rgba(255,180,90,0.6)'); gl.addColorStop(1, 'rgba(255,180,90,0)');
    c.fillStyle = gl; c.fillRect(lx - 16, ly - 16, 32, 32);
    r(lx - 0.5, 4, 1, 8, '#3A2A1E');
    c.fillStyle = '#E8483A'; c.beginPath(); c.ellipse(lx, ly, 5, 6, 0, 0, Math.PI * 2); c.fill();
    r(lx - 3, 11, 6, 2, '#2A2420'); r(lx - 3, 23, 6, 2, '#2A2420');
    // だしのしずく
    for (let i = 0; i < 3; i++) {
      const x = 61 + i * 10, y = 36 + Math.round(Math.sin(t * 4 + i) * 1.5);
      c.fillStyle = '#F2B23A'; c.beginPath(); c.moveTo(x, y - 4); c.quadraticCurveTo(x + 3, y, x + 3, y + 1); c.arc(x, y + 1, 3, 0, Math.PI); c.quadraticCurveTo(x - 3, y, x, y - 4); c.fill();
    }
    // つまようじ山
    r(106, 72, 12, 2, '#7C5A3A');
    for (let i = 0; i < 4; i++) r(107 + i * 3, 66 + (i % 2) * 2, 1, 8 - (i % 2) * 2, '#E8D3A2');
    // のれん（ゴール）
    r(136, 46, 22, 2, '#7A5230');
    const wv = Math.round(Math.sin(t * 3));
    for (let i = 0; i < 3; i++) { r(137 + i * 7 + (i - 1) * wv * 0.5, 48, 6, 18, '#2F4A86'); r(137 + i * 7 + (i - 1) * wv * 0.5, 64, 6, 2, '#E9EEF8'); }
    c.fillStyle = '#FFFFFF'; c.beginPath(); c.arc(147, 55, 3, 0, Math.PI * 2); c.fill();
    // こんにゃん（往復）
    const ex = 88 + Math.sin(t * 1.2) * 8;
    r(ex, 66, 10, 8, '#8D8E96'); r(ex, 64, 2, 2, '#8D8E96'); r(ex + 8, 64, 2, 2, '#8D8E96');
    r(ex + 2, 68, 2, 3, '#FFFFFF'); r(ex + 6, 68, 2, 3, '#FFFFFF'); r(ex + 3, 72, 1, 1, '#5E5F68'); r(ex + 7, 71, 1, 1, '#5E5F68');
    // ちくわくん（ジャンプのループ）
    const ph = (t * 0.55) % 1;
    const px = 14 + ph * 46;
    const py = 63 - Math.max(0, Math.sin(Math.min(1, ph / 0.75) * Math.PI)) * 26;
    r(px, py + 1, 8, 10, '#F3DDB2'); r(px, py + 1, 8, 3, '#C9772E'); r(px + 1, py, 6, 2, '#E9A55B'); r(px + 3, py, 2, 1, '#6B3A17');
    r(px + 2, py + 5, 1, 2, '#2A1A10'); r(px + 5, py + 5, 1, 2, '#2A1A10'); r(px + 1, py + 8, 6, 1, '#C9772E');
  }
});

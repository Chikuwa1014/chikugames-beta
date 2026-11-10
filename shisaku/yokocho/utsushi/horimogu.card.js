/* ちくわゲームズのトップページに出すカード（このゲームの紹介とサムネイル） */
(window.CHIKUWA_GAMES = window.CHIKUWA_GAMES || []).push({
  order: 104,
  href: './horimogu/',
  kicker: '3Dバトル', title: 'ほりほりもぐもぐ', sub: 'お豆腐を掘って敵をたおせ',
  desc: 'お豆腐（ショート 60³〜グランデ 300³）の中を掘り進み、鉢合わせた敵をたおす3Dバトル。はじめの60秒は「ほりほりタイム！」でアイテム集め。ひとりではおでん横丁のボスを全滅、みんなでは最大8人でほかのちくわ君を全滅させよう！ 床を掘り抜くと奈落のおでん鍋へ…',
  tags: ['3Dバトル', 'ひとりで遊ぶ', '最大8人で通信'], version: '1.1.4', updated: '2026-10-29',
  /* 160×90 のサムネイル（ドット絵）。t は秒 */
  draw(c, t) {
    /* お豆腐の断面を掘り進むちくわ君と、向こうから掘ってくるボス。下はおでん鍋 */
    const r = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
    r(0, 0, 160, 90, '#1E140E');
    // お豆腐（マスの粒）
    for (let y = 0; y < 15; y++) for (let x = 0; x < 40; x++) {
      const h = ((x * 73 + y * 151) % 17) / 17;
      r(x * 4, y * 4, 4, 4, y % 5 === 4 ? '#E6DCC2' : (h > 0.5 ? '#F7F0DB' : '#EFE6CB'));
    }
    r(0, 60, 160, 2, '#D9CCAA');
    // トンネル（ちくわ君の掘ったあと）
    const p = (t * 0.25) % 1, cx = 18 + p * 70;
    r(10, 30, cx - 6, 16, '#3A2A1E');
    // 向こうから掘ってくるボス（大根大将）
    const bx = 150 - p * 40;
    r(bx - 4, 28, 160 - bx + 4, 18, '#3A2A1E');
    r(bx, 30, 12, 15, '#F4F1E8'); r(bx + 2, 26, 8, 4, '#4FA35A'); r(bx + 3, 23, 6, 3, '#F2B23A');
    r(bx + 2, 34, 2, 2, '#2A1A10'); r(bx + 7, 34, 2, 2, '#2A1A10'); r(bx + 3, 40, 6, 1, '#7A2020');
    // ちくわ君
    const by = 31 + (Math.floor(t * 8) % 2);
    r(cx, by, 12, 14, '#B8692A'); r(cx + 1, by + 4, 10, 6, '#F3DDB2');
    r(cx + 3, by + 5, 2, 2, '#2A1A10'); r(cx + 7, by + 5, 2, 2, '#2A1A10'); r(cx + 4, by, 4, 2, '#5A3A1E');
    // 飛びちる豆腐
    for (let i = 0; i < 5; i++) { const a = t * 6 + i * 1.3; r(cx + 13 + (i * 3 + t * 20) % 8, by + 2 + Math.sin(a) * 5, 2, 2, '#FFF8E6'); }
    // レーダーが光る
    const k = Math.max(0, 1 - (bx - cx) / 120), pulse = 0.5 + 0.5 * Math.sin(t * (4 + k * 12));
    c.fillStyle = `rgba(255,${90 + 60 * (1 - k)},40,${0.3 + 0.7 * k * pulse})`; c.beginPath(); c.arc(148, 10, 5, 0, Math.PI * 2); c.fill();
    // 奈落のおでん鍋
    const g = c.createLinearGradient(0, 62, 0, 90); g.addColorStop(0, '#2A1A10'); g.addColorStop(1, '#8A5A22');
    c.fillStyle = g; c.fillRect(0, 62, 160, 28);
    for (let i = 0; i < 4; i++) { const x = (i * 43 + t * 6) % 170 - 10; r(x, 80 + Math.sin(t * 2 + i) * 1.5, 10, 6, ['#F4F1E8', '#C98A4B', '#8D8E96', '#FFF4D6'][i]); }
  }
});

/* ちくわゲームズのトップページに出すカード（このゲームの紹介とサムネイル）
   バージョンを上げたら version と updated をここで更新する。トップページ（../index.html）は読み込むだけ
*/
(window.CHIKUWA_GAMES = window.CHIKUWA_GAMES || []).push({
  order: 4,
  href: './battle-othello/', kicker: '通信対戦', title: 'バトルオセロ', sub: '2台で遊ぶ、力くらべのオセロ',
  desc: '2台の端末で通信対戦するオセロ。バトルルールでは、ゲージで力をこめて打ち、相手は連打か輪をなぞって円を描いて防御。力で勝つと衝撃波がまわりのコマをひっくり返す！盤面は緑・茶色・将棋・ちくわから選べる。',
  tags: ['オセロ', '2人で通信対戦', 'バトルルール'], version: '1.0.1', updated: '2026-10-27',
  /* 160×90 のサムネイル（ドット絵）。t は秒 */
  draw(c, t) {
    /* 緑の盤に白黒のコマ。中央に打たれた一手から衝撃波が広がり、まわりのコマが裏返る */
    const r = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
    r(0, 0, 160, 90, '#10201A');
    const S = 10, ox = 40, oy = 5;              // 1マス10px、8×8で80×80
    r(ox - 2, oy - 2, 84, 84, '#145536');
    for (let i = 0; i < 64; i++) {
      const x = ox + (i % 8) * S, y = oy + Math.floor(i / 8) * S;
      r(x, y, S - 1, S - 1, '#1F7A4D');
    }
    const cyc = t % 4, cx = 3, cy = 4;          // 4秒ごとに衝撃波
    const wave = cyc < 1.2 ? cyc / 1.2 * 3.5 : -1;
    for (let i = 0; i < 64; i++) {
      const col = i % 8, row = Math.floor(i / 8);
      // もとの並び（固定の模様）
      let p = ((col * 7 + row * 3 + col * row) % 5);
      if (p > 2) continue;                     // 空きマス
      let black = p === 0 || (p === 2 && (col + row) % 2 === 0);
      const d = Math.max(Math.abs(col - cx), Math.abs(row - cy));
      if (col === cx && row === cy) black = true;
      else if (d <= 2 && cyc < 3.2 && wave >= d) black = !black;   // 波が届いたコマは裏返る
      else if (d <= 2 && cyc >= 1.2 && cyc < 3.2) black = !black;
      const x = ox + col * S, y = oy + row * S;
      r(x + 2, y + 1, 5, 7, black ? '#111111' : '#F4F4F4');
      r(x + 1, y + 2, 7, 5, black ? '#111111' : '#F4F4F4');
      r(x + 2, y + 2, 2, 2, black ? '#4A4A4A' : '#FFFFFF');
    }
    // 衝撃波の輪
    if (wave > 0) {
      const R = wave * S + 4, px = ox + cx * S + 4.5, py = oy + cy * S + 4.5;
      c.strokeStyle = 'rgba(255,122,107,' + (1 - wave / 3.5) + ')'; c.lineWidth = 2;
      c.strokeRect(px - R, py - R, R * 2, R * 2);
    }
    // 力のゲージ（左）と、見守るちくわくん（右）
    const g = Math.abs(((t * 1.2) % 2) - 1);
    r(12, 20, 10, 52, '#0C1814'); r(13, 21 + 50 * (1 - g), 8, 50 * g, g > .8 ? '#FF7A6B' : '#F3C14B');
    const px = 138, py = 62 - Math.abs(Math.sin(t * 3)) * 3;
    r(px, py + 1, 8, 10, '#F3DDB2'); r(px, py + 1, 8, 3, '#C9772E'); r(px + 1, py, 6, 2, '#E9A55B');
    r(px + 2, py + 5, 1, 2, '#2A1A10'); r(px + 5, py + 5, 1, 2, '#2A1A10'); r(px + 1, py + 8, 6, 1, '#C9772E');
  },
});

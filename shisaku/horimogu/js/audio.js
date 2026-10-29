/* ほりほりもぐもぐ — 効果音（Web Audio で作る。音源ファイルなし） */
(function () {
  const HM = window.HM;
  let ac = null, master = null, muted = false, noiseBuf = null;
  try { muted = localStorage.getItem('horimogu-mute') === '1'; } catch (e) { }

  function ctx() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = muted ? 0 : 0.6;
      master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume().catch(() => { });
    return ac;
  }
  function noise(dur, freq, vol, q) {
    const a = ctx(); if (!a || vol <= 0.001) return;
    const s = a.createBufferSource(); s.buffer = noiseBuf;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    const g = a.createGain(), t = a.currentTime;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.02);
  }
  function tone(type, f0, f1, dur, vol) {
    const a = ctx(); if (!a || vol <= 0.001) return;
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  HM.sfx = {
    unlock() { ctx(); },
    get muted() { return muted; },
    setMuted(m) {
      muted = !!m;
      try { localStorage.setItem('horimogu-mute', muted ? '1' : '0'); } catch (e) { }
      if (master) master.gain.value = muted ? 0 : 0.6;
    },
    /** vol は 0〜1（遠くの音は小さく） */
    dig(vol = 1) { noise(0.12, 900 + Math.random() * 500, 0.35 * vol, 0.8); },
    punch() { noise(0.08, 400, 0.5, 2); tone('square', 160, 60, 0.08, 0.15); },
    hit() { tone('square', 300, 90, 0.15, 0.25); noise(0.1, 1200, 0.3, 1); },
    hurt() { tone('sawtooth', 220, 70, 0.25, 0.25); },
    shoot() { tone('triangle', 900, 300, 0.1, 0.25); noise(0.05, 2500, 0.15, 1); },
    boom() { noise(0.4, 200, 0.6, 0.6); tone('sine', 120, 40, 0.35, 0.4); },
    pick() { tone('sine', 660, 990, 0.08, 0.25); setTimeout(() => tone('sine', 990, 1320, 0.1, 0.2), 70); },
    heal() { tone('sine', 520, 1040, 0.25, 0.25); },
    armor() { tone('triangle', 200, 400, 0.2, 0.3); },
    laser() { tone('sawtooth', 1400 + Math.random() * 200, 1200, 0.06, 0.06); },
    slip() { tone('sine', 900, 200, 0.4, 0.25); },
    bat() { noise(0.15, 300, 0.6, 1); tone('square', 120, 50, 0.2, 0.3); },
    win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone('triangle', f, f, 0.25, 0.25), i * 120)); },
    lose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone('triangle', f, f * 0.98, 0.35, 0.25), i * 200)); },
    splash() { noise(0.6, 500, 0.5, 0.5); },
    /** BGM：時計の秒針の音（チッ・タッ）。hi で音の高さを変える。strong はほりほりタイムの残り 10 秒 */
    tick(hi, strong) {
      const a = ctx(); if (!a) return;
      const t = a.currentTime;
      const o = a.createOscillator(), g = a.createGain(), f = a.createBiquadFilter();
      o.type = 'square'; o.frequency.value = hi ? 3400 : 2600;
      f.type = 'bandpass'; f.frequency.value = hi ? 3400 : 2600; f.Q.value = 6;
      const v = strong ? 0.5 : 0.28;
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
      o.connect(f); f.connect(g); g.connect(master);
      o.start(t); o.stop(t + 0.05);
      noise(0.03, hi ? 5000 : 3800, strong ? 0.35 : 0.18, 3);
    },
    /** ほりほりタイムの終わり（バトル開始） */
    gong() { tone('triangle', 660, 640, 0.6, 0.35); setTimeout(() => tone('triangle', 880, 860, 0.8, 0.35), 160); }
  };
})();

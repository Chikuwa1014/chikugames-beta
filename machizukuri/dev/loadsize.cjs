/* 画質ごとの読み込み量（MANIFEST を展開して、ファイルの大きさを足す）。使い方：node machizukuri/dev/loadsize.cjs
   目標（β0.3.0）：中 26.8・高 30.8・低 1.62 MiB 以下（石畳の写真を足したあと） */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = { MZ: { gfx: {} } }; global.BABYLON = {};
eval(fs.readFileSync(path.join(root, 'js/gfx/assets.js'), 'utf8'));
const G = window.MZ.gfx;
for (const t of ['high', 'mid', 'low']) {
  const seen = new Set(); let sum = 0, miss = 0;
  G.MANIFEST.filter(g => g.tiers.includes(t)).forEach(g => {
    let f = typeof g.files === 'function' ? g.files(t) : (g.files || []); f = f.slice();
    (g.models || []).forEach(m => f.push('assets/models/' + m + '.glb'));
    f.forEach(p => { if (seen.has(p)) return; seen.add(p); try { sum += fs.statSync(path.join(root, '..', 'machizukuri', p)).size; } catch (e) { miss++; console.log('  ファイルが無い', p); } });
  });
  console.log(t.padEnd(5), (sum / 1048576).toFixed(2) + ' MiB', seen.size + ' 本', miss ? '無い ' + miss : '');
}

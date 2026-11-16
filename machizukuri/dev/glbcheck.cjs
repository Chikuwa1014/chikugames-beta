/* GLB の頭と三角形の数・外の画像（images[].uri）を調べる（assets/models/*.glb）。使い方：node machizukuri/dev/glbcheck.cjs
   外の画像は、ファイルがあること・`..` を含まないこと・絶対の道でないことを確かめる（通らなければ終了コード 1） */
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'assets', 'models');
let total = 0, bad = 0, ext = new Set();
fs.readdirSync(dir).filter(f => f.endsWith('.glb')).sort().forEach(f => {
  const b = fs.readFileSync(path.join(dir, f)); total += b.length;
  const magic = b.slice(0, 4).toString();
  const jl = b.readUInt32LE(12), j = JSON.parse(b.slice(20, 20 + jl).toString());
  let tris = 0; (j.meshes || []).forEach(m => m.primitives.forEach(p => { if (p.indices !== undefined) tris += j.accessors[p.indices].count / 3; }));
  const uris = (j.images || []).filter(i => i.uri).map(i => i.uri);
  const nok = uris.filter(u => { ext.add(u); return u.includes('..') || /^([a-z]+:|\/)/i.test(u) || !fs.existsSync(path.join(dir, u)); });
  if (nok.length) { bad += nok.length; console.log('  外の画像が不正', f, nok.join(',')); }
  console.log(f.padEnd(24), magic, String(Math.round(b.length / 1024)).padStart(6) + 'KB', 'tris(メッシュ定義の合計)', tris, uris.length ? '外の画像 ' + uris.length + ' 枚' : '');
});
console.log('合計', (total / 1048576).toFixed(2) + 'MiB', '外の画像（重複なし）', ext.size, '枚', bad ? '不正 ' + bad : '全部ある');
if (bad) process.exit(1);

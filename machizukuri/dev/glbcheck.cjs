/* GLB の頭と三角形の数を調べる（assets/models/*.glb）。使い方：node machizukuri/dev/glbcheck.cjs */
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'assets', 'models');
let total = 0;
fs.readdirSync(dir).filter(f => f.endsWith('.glb')).sort().forEach(f => {
  const b = fs.readFileSync(path.join(dir, f)); total += b.length;
  const magic = b.slice(0, 4).toString();
  const jl = b.readUInt32LE(12), j = JSON.parse(b.slice(20, 20 + jl).toString());
  let tris = 0; (j.meshes || []).forEach(m => m.primitives.forEach(p => { if (p.indices !== undefined) tris += j.accessors[p.indices].count / 3; }));
  console.log(f.padEnd(24), magic, String(Math.round(b.length / 1024)).padStart(6) + 'KB', 'tris(メッシュ定義の合計)', tris);
});
console.log('合計', (total / 1048576).toFixed(2) + 'MiB');

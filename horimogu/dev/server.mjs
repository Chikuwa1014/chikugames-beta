// ローカル確認用サーバー（公開しない。.assetsignore の **/dev で除外）。号口 hayaoshi-chikupon/dev/server.mjs の写し
// wrangler が使えない環境でも、号口の worker/index.js の MultiRoom を Node 上で動かして
// 静的ファイルと /<フォルダ>/ws（WebSocket。worker/index.js の WS_GAMES にあるゲーム）を出す。
//   node horimogu/dev/server.mjs [port]   → http://localhost:8787/horimogu/（β版リポジトリの worker/index.js を使う）
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = +(process.argv[2] || 8787);

// ---- Cloudflare の API をまねる最小限のしかけ ----
let pendingRaw = null;
class FakeServerSocket {
  constructor(raw) { this.raw = raw; this.tags = []; }
  accept() {}
  send(text) { if (this.raw && !this.raw.destroyed) this.raw.write(frame(Buffer.from(text))); }
  close(code = 1000) { if (this.raw && !this.raw.destroyed) { const b = Buffer.alloc(2); b.writeUInt16BE(code); this.raw.end(frame(b, 0x8)); } }
}
globalThis.WebSocketPair = class { constructor() { this[0] = {}; this[1] = new FakeServerSocket(pendingRaw); } };
globalThis.Response = class { constructor(body, init = {}) { this.status = init.status || 200; this.body = body; this.webSocket = init.webSocket; } };
const { MultiRoom, WS_GAMES } = await import(path.join(ROOT, "worker/index.js"));
const rooms = new Map();
function getRoom(code) {
  if (!rooms.has(code)) {
    const set = new Set();
    const state = {
      acceptWebSocket(ws, tags) { ws.tags = tags; set.add(ws); },
      getWebSockets(tag) { return [...set].filter((w) => !tag || w.tags.includes(tag)); },
      getTags(ws) { return ws.tags; },
      _set: set,
    };
    rooms.set(code, { room: new MultiRoom(state), state });
  }
  return rooms.get(code);
}

// ---- WebSocket のフレーム ----
function frame(payload, op = 0x1) {
  const n = payload.length;
  let head;
  if (n < 126) head = Buffer.from([0x80 | op, n]);
  else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(n, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
  return Buffer.concat([head, payload]);
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  let p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "content-type": MIME[path.extname(p)] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(p).pipe(res);
});

server.on("upgrade", async (req, raw) => {
  const u = new URL(req.url, "http://x");
  const code = u.searchParams.get("room") || "";
  const gm = u.pathname.match(/^\/([a-z0-9-]+)\/ws$/);
  if (!gm || !Object.hasOwn(WS_GAMES, gm[1]) || !/^[0-9]{4}$/.test(code)) { raw.end("HTTP/1.1 400 Bad Request\r\n\r\n"); return; }
  const accept = crypto.createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  raw.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const { room, state } = getRoom(gm[1] + ":" + code);
  pendingRaw = raw;
  await room.fetch({ headers: new Headers({ "X-Max-Peers": String(WS_GAMES[gm[1]]) }) });
  const ws = [...state._set].find((w) => w.raw === raw);   // 満室のときは登録されない
  let buf = Buffer.alloc(0), closed = false;
  const onClose = () => {
    if (closed) return; closed = true;
    if (ws && state._set.has(ws)) { state._set.delete(ws); room.webSocketClose(ws); }
  };
  raw.on("data", (d) => {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= 2) {
      const op = buf[0] & 0x0f, masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const mOff = off; if (masked) off += 4;
      if (buf.length < off + len) return;
      const data = Buffer.from(buf.subarray(off, off + len));
      if (masked) for (let i = 0; i < len; i++) data[i] ^= buf[mOff + (i % 4)];
      buf = buf.subarray(off + len);
      if (op === 0x8) { raw.end(frame(Buffer.alloc(0), 0x8)); onClose(); return; }
      if (op === 0x9) { raw.write(frame(data, 0xA)); continue; }
      if (op === 0x1 && ws) room.webSocketMessage(ws, data.toString("utf8"));
    }
  });
  raw.on("close", onClose);
  raw.on("error", onClose);
});
server.listen(PORT, () => console.log(`http://localhost:${PORT}/horimogu/`));

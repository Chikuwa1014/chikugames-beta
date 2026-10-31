// βの仲介サーバー（マルチプレイの部屋）。本番 chikuwa-games の worker/index.js から、
// 仲介（/<フォルダ>/ws）と MultiRoom だけを写したもの（デバッグログの受け口は写していない）。
// 端末どうしが WebRTC の接続情報（offer / answer / ICE）を交換するためだけに使い、遊んでいる間のデータはここを通らない。
// 静的ファイルは Workers の assets が先に返すので、このスクリプトが動くのは assets に無いパス（/hayaoshi-chikupon/ws）だけ。
// MultiRoom は本番と同じ中身にそろえる（本番側を直したらこちらも直す）。

const MAX_PEERS = 8;
// マルチプレイを使うβのゲーム（フォルダ名）と、1部屋に入れる台数（親を含む）。/<フォルダ>/ws で受ける
export const WS_GAMES = {};   // 早押し！ちくぽん！（2026-10-24）・ほりほりもぐもぐ（2026-10-28）は号口へ移った

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // マルチプレイの仲介（例：/hayaoshi-chikupon/ws）。部屋の名前にゲーム名を付けて、ほかのゲームと混ざらないようにする
    const wm = url.pathname.match(/^\/([a-z0-9-]+)\/ws$/);
    if (wm && Object.hasOwn(WS_GAMES, wm[1])) {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("WebSocket only", { status: 426 });
      }
      const room = (url.searchParams.get("room") || "").trim();
      if (!/^[0-9]{4}$/.test(room)) {
        return new Response("bad room code", { status: 400 });
      }
      const id = env.ROOMS.idFromName(wm[1] + ":" + room);
      // 台数の上限は部屋（Durable Object）にヘッダーで伝える
      const fwd = new Request(request);
      fwd.headers.set("X-Max-Peers", String(WS_GAMES[wm[1]]));
      return env.ROOMS.get(id).fetch(fwd);
    }

    // それ以外は通常の静的配信（見つからなければ 404）
    return env.ASSETS.fetch(request);
  },
};

// 2026-10-31 追加（common/v1/room.js の新しい版が使う。古い版や、ルーレット・バトルオセロの自前の処理には影響しない）
//   ・{"type":"ping"} には {"type":"pong"} を返す（親の生存確認。部屋を起こさずに返す）
//   ・?join=1：親がいなければ、親にせず {"type":"nohost"} を返して閉じる（子は少し待ってくり返す）
//   ・?reclaim=<合い言葉>：親のつなぎ直し。合い言葉が合う古い親の接続を捨てて、入れかわる
//     （キャリア回線では、切れた古い接続が仲介に残ったままになることがあるため）
export class MultiRoom {
  constructor(state) {
    this.state = state;
    try {
      state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
    } catch (e) {}
  }

  /** 捨てた古い接続（reclaim で入れかわった親）は数えない */
  live(tag) {
    return this.state.getWebSockets(tag).filter((ws) => !this.isStale(ws));
  }
  isStale(ws) {
    try { const a = ws.deserializeAttachment(); return !!(a && a.stale); } catch (e) { return false; }
  }

  async fetch(request) {
    let params;
    try { params = new URL(request.url).searchParams; } catch (e) { params = new URLSearchParams(); }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const max = Math.min(MAX_PEERS, Number(request.headers.get("X-Max-Peers")) || MAX_PEERS);

    // 親のつなぎ直し：合い言葉が合う古い親の接続を捨てる
    const reclaim = params.get("reclaim") || "";
    let key = "";
    if (/^[0-9a-f]{16}$/.test(reclaim)) {
      const old = this.live("key:" + reclaim);
      if (old.length) {
        key = reclaim;
        for (const ws of old) {
          try { ws.serializeAttachment({ stale: true }); } catch (e) {}
          try { ws.close(4001, "replaced"); } catch (e) {}
        }
      }
    }

    const sockets = this.live();
    const reject = (type, code) => {
      server.accept();
      server.send(JSON.stringify({ type }));
      server.close(code, type);
      return new Response(null, { status: 101, webSocket: client });
    };
    if (sockets.length >= max) return reject("full", 4000);

    // 親がまだいなければ、この端末が親になる（参加のつもりの子は、親にしない）
    const hasHost = sockets.some((ws) => this.state.getTags(ws).includes("host"));
    if (!hasHost && params.get("join") === "1") return reject("nohost", 4002);
    const role = hasHost ? "guest" : "host";
    // 端末ID：親は "0"、子はかぶらないランダムな文字列（接続を切った子のIDを使い回さない）
    const id = role === "host" ? "0" : crypto.randomUUID().slice(0, 8);
    const tags = [role, "id:" + id];
    if (role === "host") {
      if (!key) key = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      tags.push("key:" + key);
    }
    this.state.acceptWebSocket(server, tags);

    server.send(JSON.stringify(role === "host" ? { type: "role", role, id, key } : { type: "role", role, id }));
    if (role === "guest") {
      for (const ws of this.live("host")) {
        ws.send(JSON.stringify({ type: "peer-joined", id }));
      }
    } else {
      // 親が入れかわったとき：親を待っていた子を、新しい親に知らせる
      for (const ws of this.live("guest")) {
        server.send(JSON.stringify({ type: "peer-joined", id: this.idOf(ws) }));
      }
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  idOf(ws) {
    const tag = this.state.getTags(ws).find((t) => t.startsWith("id:"));
    return tag ? tag.slice(3) : "";
  }

  // 宛先（to）があればその端末へ、なければ自分以外の全員へ中継する。from は必ずサーバーが付け直す
  async webSocketMessage(ws, message) {
    let msg;
    try { msg = JSON.parse(message); } catch (e) { return; }
    if (!msg || typeof msg !== "object") return;
    if (this.isStale(ws)) return;
    // 自動の返事が使えないとき（手元の確認用サーバーなど）の予備
    if (msg.type === "ping") { try { ws.send('{"type":"pong"}'); } catch (e) {} return; }
    msg.from = this.idOf(ws);
    const text = JSON.stringify(msg);
    if (typeof msg.to === "string") {
      for (const other of this.live("id:" + msg.to)) {
        if (other !== ws) other.send(text);
      }
      return;
    }
    for (const other of this.live()) {
      if (other !== ws) other.send(text);
    }
  }

  async webSocketClose(ws) {
    if (this.isStale(ws)) return;   // 入れかわった古い親：ほかの人には知らせない
    const id = this.idOf(ws);
    const wasHost = this.state.getTags(ws).includes("host");
    for (const other of this.live()) {
      if (other === ws) continue;
      try { other.send(JSON.stringify(wasHost ? { type: "host-left" } : { type: "peer-left", id })); } catch (e) {}
    }
  }

  async webSocketError(ws) {
    return this.webSocketClose(ws);
  }
}

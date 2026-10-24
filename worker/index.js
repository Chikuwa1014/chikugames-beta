// βの仲介サーバー（マルチプレイの部屋）。本番 chikuwa-games の worker/index.js から、
// 仲介（/<フォルダ>/ws）と MultiRoom だけを写したもの（デバッグログの受け口は写していない）。
// 端末どうしが WebRTC の接続情報（offer / answer / ICE）を交換するためだけに使い、遊んでいる間のデータはここを通らない。
// 静的ファイルは Workers の assets が先に返すので、このスクリプトが動くのは assets に無いパス（/hayaoshi-chikupon/ws）だけ。
// MultiRoom は本番と同じ中身にそろえる（本番側を直したらこちらも直す）。

const MAX_PEERS = 8;
// マルチプレイを使うβのゲーム（フォルダ名）と、1部屋に入れる台数（親を含む）。/<フォルダ>/ws で受ける
export const WS_GAMES = { "hayaoshi-chikupon": 8 };

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

export class MultiRoom {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const sockets = this.state.getWebSockets();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const max = Math.min(MAX_PEERS, Number(request.headers.get("X-Max-Peers")) || MAX_PEERS);

    if (sockets.length >= max) {
      server.accept();
      server.send(JSON.stringify({ type: "full" }));
      server.close(4000, "room full");
      return new Response(null, { status: 101, webSocket: client });
    }

    // 親がまだいなければ、この端末が親になる
    const hasHost = sockets.some((ws) => this.state.getTags(ws).includes("host"));
    const role = hasHost ? "guest" : "host";
    // 端末ID：親は "0"、子はかぶらないランダムな文字列（接続を切った子のIDを使い回さない）
    const id = role === "host" ? "0" : crypto.randomUUID().slice(0, 8);
    this.state.acceptWebSocket(server, [role, "id:" + id]);

    server.send(JSON.stringify({ type: "role", role, id }));
    if (role === "guest") {
      for (const ws of this.state.getWebSockets("host")) {
        ws.send(JSON.stringify({ type: "peer-joined", id }));
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
    msg.from = this.idOf(ws);
    const text = JSON.stringify(msg);
    if (typeof msg.to === "string") {
      for (const other of this.state.getWebSockets("id:" + msg.to)) {
        if (other !== ws) other.send(text);
      }
      return;
    }
    for (const other of this.state.getWebSockets()) {
      if (other !== ws) other.send(text);
    }
  }

  async webSocketClose(ws) {
    const id = this.idOf(ws);
    const wasHost = this.state.getTags(ws).includes("host");
    for (const other of this.state.getWebSockets()) {
      if (other === ws) continue;
      try { other.send(JSON.stringify(wasHost ? { type: "host-left" } : { type: "peer-left", id })); } catch (e) {}
    }
  }

  async webSocketError(ws) {
    return this.webSocketClose(ws);
  }
}

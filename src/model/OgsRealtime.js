// @flow
// Guest connection to OGS' documented real-time API - the WebSocket protocol
// of the official "goban" library (github.com/online-go/goban,
// src/engine/protocol; guests authenticate with an empty jwt). It is used
// only to watch games that a calendar broadcast links to, so moves, clocks
// and chat arrive as they happen instead of with the next REST poll.
// Nothing is sent except the guest handshake, game/connect, game/disconnect
// and pings.

export const OGS_REALTIME_URL = "wss://online-go.com";
const CLIENT_NAME = "GoTV";
const PING_INTERVAL_MS = 10000; // same as the official client
const RECONNECT_DELAYS_MS = [1000, 3000, 10000, 30000];
const GAME_EVENT_RE = /^game\/(\d+)\/(.+)$/;

// event: the part after "game/<id>/" (gamedata, move, clock, phase, chat,
// ...), or "offline" when the connection is lost.
export type OgsRealtimeHandler = (event: string, data: any) => void;
type SocketFactory = (url: string) => any;

export class OgsRealtime {
  _createSocket: SocketFactory;
  _socket: any = null;
  _open: boolean = false;
  _handlers: { [gameId: number]: Set<OgsRealtimeHandler> } = {};
  _pingTimer: ?IntervalID = null;
  _reconnectTimer: ?TimeoutID = null;
  _retries: number = 0;

  constructor(createSocket?: SocketFactory) {
    this._createSocket = createSocket || ((url) => new WebSocket(url));
  }

  watch(gameId: number, handler: OgsRealtimeHandler): () => void {
    let handlers = this._handlers[gameId];
    if (!handlers) {
      handlers = new Set();
      this._handlers[gameId] = handlers;
      this._send("game/connect", { game_id: gameId, chat: true });
    }
    handlers.add(handler);
    this._connect();
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      let current = this._handlers[gameId];
      if (!current) {
        return;
      }
      current.delete(handler);
      if (!current.size) {
        delete this._handlers[gameId];
        this._send("game/disconnect", { game_id: gameId });
        if (!Object.keys(this._handlers).length) {
          this._disconnect();
        }
      }
    };
  }

  // Leaves and rejoins a game, which makes OGS send its full state again.
  resync(gameId: number) {
    if (this._handlers[gameId]) {
      this._send("game/disconnect", { game_id: gameId });
      this._send("game/connect", { game_id: gameId, chat: true });
    }
  }

  _send(command: string, data: Object) {
    if (!this._open || !this._socket) {
      return;
    }
    try {
      this._socket.send(JSON.stringify([command, data]));
    } catch (err) {
      // A socket that is closing drops the message; onclose reconnects.
    }
  }

  _connect() {
    if (this._socket || this._reconnectTimer) {
      return;
    }
    let socket;
    try {
      socket = this._createSocket(OGS_REALTIME_URL);
    } catch (err) {
      // No WebSocket here: the REST polling of OgsTvSource keeps working.
      return;
    }
    this._socket = socket;
    socket.onopen = () => {
      if (socket !== this._socket) {
        return;
      }
      this._open = true;
      this._retries = 0;
      this._send("authenticate", { jwt: "", client: CLIENT_NAME });
      for (let gameId of Object.keys(this._handlers)) {
        this._send("game/connect", { game_id: Number(gameId), chat: true });
      }
      this._pingTimer = setInterval(
        () =>
          this._send("net/ping", { client: Date.now(), drift: 0, latency: 0 }),
        PING_INTERVAL_MS
      );
    };
    socket.onmessage = (event: Object) => {
      this._onMessage(event && event.data);
    };
    socket.onclose = () => {
      if (socket === this._socket) {
        this._onLost();
      }
    };
    socket.onerror = () => {
      // A failed connection also fires onclose, which handles the retry.
    };
  }

  _onMessage(text: mixed) {
    let message;
    try {
      message = JSON.parse(String(text));
    } catch (err) {
      return;
    }
    if (!Array.isArray(message) || typeof message[0] !== "string") {
      return;
    }
    let match = message[0].match(GAME_EVENT_RE);
    let handlers = match ? this._handlers[Number(match[1])] : null;
    if (match && handlers) {
      let event = match[2];
      handlers.forEach((handler) => handler(event, message[1]));
    }
  }

  _clearConnection() {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
    this._open = false;
    this._socket = null;
  }

  _onLost() {
    this._clearConnection();
    let gameIds = Object.keys(this._handlers);
    for (let gameId of gameIds) {
      this._handlers[Number(gameId)].forEach((handler) =>
        handler("offline", null)
      );
    }
    if (!gameIds.length) {
      return;
    }
    let delay =
      RECONNECT_DELAYS_MS[
        Math.min(this._retries, RECONNECT_DELAYS_MS.length - 1)
      ];
    this._retries++;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (Object.keys(this._handlers).length) {
        this._connect();
      }
    }, delay);
  }

  _disconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    let socket = this._socket;
    this._clearConnection();
    if (socket) {
      socket.onclose = null;
      try {
        socket.close();
      } catch (err) {
        // Already closed.
      }
    }
  }
}

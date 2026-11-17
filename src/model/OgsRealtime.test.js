import { OgsRealtime, OGS_REALTIME_URL } from "./OgsRealtime";

class FakeSocket {
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.closed = false;
  }
  send(text) {
    this.sent.push(JSON.parse(text));
  }
  close() {
    this.closed = true;
  }
  open() {
    this.onopen();
  }
  receive(message) {
    this.onmessage({ data: JSON.stringify(message) });
  }
  drop() {
    this.onclose({});
  }
}

describe("OgsRealtime", () => {
  let sockets;
  let realtime;

  beforeEach(() => {
    jest.useFakeTimers();
    sockets = [];
    realtime = new OgsRealtime((url) => {
      let socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    });
  });
  afterEach(() => jest.useRealTimers());

  it("connects as a guest only while a game is watched", () => {
    expect(sockets).toHaveLength(0);
    let release = realtime.watch(123, jest.fn());
    expect(sockets).toHaveLength(1);
    expect(sockets[0].url).toBe(OGS_REALTIME_URL);
    sockets[0].open();
    expect(sockets[0].sent).toEqual([
      ["authenticate", { jwt: "", client: "GoTV" }],
      ["game/connect", { game_id: 123, chat: true }],
    ]);
    release();
    release();
    expect(sockets[0].sent[2]).toEqual(["game/disconnect", { game_id: 123 }]);
    expect(sockets[0].closed).toBe(true);
  });

  it("delivers the events of a game to its watchers only", () => {
    let first = jest.fn();
    let second = jest.fn();
    realtime.watch(123, first);
    realtime.watch(456, second);
    sockets[0].open();
    sockets[0].receive(["game/123/move", { move_number: 5, move: [3, 3, 1] }]);
    sockets[0].receive(["game/456/chat/remove", { chat_ids: ["a"] }]);
    sockets[0].receive(["net/pong", { client: 1, server: 2 }]);
    sockets[0].receive([7, { id: -1, username: "guest" }]);
    sockets[0].onmessage({ data: "not json" });
    expect(first.mock.calls).toEqual([
      ["move", { move_number: 5, move: [3, 3, 1] }],
    ]);
    expect(second.mock.calls).toEqual([["chat/remove", { chat_ids: ["a"] }]]);
  });

  it("joins a game that is added while already connected and keeps the socket for the rest", () => {
    let releaseFirst = realtime.watch(123, jest.fn());
    sockets[0].open();
    realtime.watch(456, jest.fn());
    expect(sockets).toHaveLength(1);
    expect(sockets[0].sent[2]).toEqual([
      "game/connect",
      { game_id: 456, chat: true },
    ]);
    releaseFirst();
    expect(sockets[0].closed).toBe(false);
  });

  it("pings like the official client while connected", () => {
    realtime.watch(123, jest.fn());
    sockets[0].open();
    jest.advanceTimersByTime(10000);
    let ping = sockets[0].sent[sockets[0].sent.length - 1];
    expect(ping[0]).toBe("net/ping");
    expect(ping[1]).toMatchObject({ drift: 0, latency: 0 });
  });

  it("reports a lost connection, reconnects and rejoins the game", () => {
    let handler = jest.fn();
    realtime.watch(123, handler);
    sockets[0].open();
    sockets[0].drop();
    expect(handler).toHaveBeenLastCalledWith("offline", null);
    expect(sockets).toHaveLength(1);
    jest.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);
    sockets[1].open();
    expect(sockets[1].sent[1]).toEqual([
      "game/connect",
      { game_id: 123, chat: true },
    ]);
  });

  it("stops reconnecting once nothing is watched", () => {
    let release = realtime.watch(123, jest.fn());
    sockets[0].open();
    sockets[0].drop();
    release();
    jest.advanceTimersByTime(60000);
    expect(sockets).toHaveLength(1);
  });

  it("asks for the full game state again on resync", () => {
    realtime.watch(123, jest.fn());
    sockets[0].open();
    realtime.resync(123);
    expect(sockets[0].sent.slice(2)).toEqual([
      ["game/disconnect", { game_id: 123 }],
      ["game/connect", { game_id: 123, chat: true }],
    ]);
  });

  it("stays silent when no WebSocket can be created", () => {
    let broken = new OgsRealtime(() => {
      throw new Error("blocked");
    });
    let handler = jest.fn();
    let release = broken.watch(123, handler);
    expect(handler).not.toHaveBeenCalled();
    release();
  });
});

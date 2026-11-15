import { TvGameSubscriptions } from "./TvGameSubscriptions";

describe("TV game subscriptions", () => {
  let state;
  let sent;
  let subscriptions;

  beforeEach(() => {
    state = {
      currentUser: { name: "viewer" },
      clientState: { status: "loggedIn", network: "online" },
      channelMembership: {},
    };
    sent = [];
    subscriptions = new TvGameSubscriptions(
      () => state,
      (message) => sent.push(message)
    );
  });

  it("shares one JOIN and releases only the last viewer", () => {
    let first = subscriptions.observe(42);
    let second = subscriptions.observe(42);
    expect(sent).toEqual([{ type: "JOIN_REQUEST", channelId: 42 }]);
    first();
    first();
    expect(sent).toHaveLength(1);
    second();
    expect(sent[1]).toEqual({ type: "UNJOIN_REQUEST", channelId: 42 });
  });

  it("preserves an existing channel subscription", () => {
    state.channelMembership[42] = { type: "game", complete: true };
    subscriptions.observe(42)();
    expect(sent).toEqual([]);
  });

  it.each(["watchGameId", "playGameId", "reviewGameId"])(
    "preserves a game taken over by %s",
    (field) => {
      let release = subscriptions.observe(42);
      state[field] = 42;
      release();
      expect(sent).toEqual([{ type: "JOIN_REQUEST", channelId: 42 }]);
    }
  );

  it("joins again when reopened before the old UNJOIN response arrives", () => {
    let release = subscriptions.observe(42);
    state.channelMembership[42] = { type: "game", complete: true };
    release();
    subscriptions.observe(42);
    expect(sent.map((message) => message.type)).toEqual([
      "JOIN_REQUEST",
      "UNJOIN_REQUEST",
      "JOIN_REQUEST",
    ]);
  });

  it("sends nothing offline and resubscribes after connection recovery", () => {
    let release = subscriptions.observe(42);
    state.channelMembership[42] = { type: "game", complete: true };
    state.clientState.network = "offline";
    release();
    subscriptions.observe(42)();
    expect(sent).toHaveLength(1);
    state.clientState.network = "online";
    subscriptions.observe(42);
    expect(sent[1]).toEqual({ type: "JOIN_REQUEST", channelId: 42 });
  });

  it("finishes cleanup after recovery when the viewer was closed offline", () => {
    let release = subscriptions.observe(42);
    state.clientState.network = "offline";
    release();
    state.clientState.network = "online";
    subscriptions.sync();
    subscriptions.sync();
    expect(sent).toEqual([
      { type: "JOIN_REQUEST", channelId: 42 },
      { type: "UNJOIN_REQUEST", channelId: 42 },
    ]);
  });
});

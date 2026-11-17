import { OgsTvSource, parseOgsGame, parseOgsScore } from "./OgsTvSource";

const GAME_DATA = {
  id: 123,
  name: "Speed Go Championship",
  width: 19,
  komi: "6.5",
  rules: "japanese",
  ranked: true,
  tournament: 55,
  started: "2026-11-22T18:00:00Z",
  ended: null,
  players: {
    black: { id: 1, username: "Surma" },
    white: { id: 2, username: "Ovsiienko" },
  },
};

const SGF = `(;FF[4]SZ[19]PB[Surma]PW[Ovsiienko]BR[4p]WR[6d]RE[B+R]
C[Fan: Spannende Partie\nOther Fan: Viel Erfolg]
;B[ij];W[aa]C[Fan: Erster Kommentar zum Zug])`;

const LIVE_DATA = {
  ...GAME_DATA,
  players: {
    black: { id: 1, username: "Surma", ranking: 40.2, professional: true },
    white: { id: 2, username: "Ovsiienko", ranking: 35.7 },
  },
  gamedata: {
    phase: "play",
    initial_player: "black",
    moves: [
      [8, 9, 1200],
      [0, 0, 900],
      [15, 3, 700],
    ],
    time_control: { system: "fischer" },
    clock: {
      current_player: 2,
      black_player_id: 1,
      white_player_id: 2,
      last_move: 1000000,
      black_time: { thinking_time: 120 },
      white_time: { thinking_time: 90 },
    },
  },
};
const ENDED_DATA = { ...LIVE_DATA, ended: "2026-11-22T18:20:00Z" };

function responseFor(url, data = LIVE_DATA) {
  if (url.endsWith("/sgf")) {
    return { ok: true, text: () => Promise.resolve(SGF) };
  }
  return { ok: true, json: () => Promise.resolve(data) };
}

// Enough ticks for the detail request, the SGF request and both parsers.
const PROMISE_TICKS = 20;

async function flushPromises() {
  for (let i = 0; i < PROMISE_TICKS; i++) {
    await Promise.resolve();
  }
}

describe("OgsTvSource game adapter", () => {
  it("adapts OGS metadata, standard SGF coordinates, latest moves and chat", () => {
    let game = parseOgsGame(
      { ...GAME_DATA, ended: "2026-11-22T18:20:00Z" },
      SGF
    );
    expect(game).toMatchObject({
      id: 123,
      type: "tournament",
      tvSource: "ogs",
      event: true,
      sgfUrl: "https://online-go.com/api/v1/games/123/sgf",
      moveNum: 2,
      over: true,
      score: "B+RESIGN",
      players: {
        black: { name: "Surma", rank: "4p", rankVal: 14 },
        white: { name: "Ovsiienko", rank: "6d", rankVal: 6 },
      },
    });
    expect(game.tree.activeNode).toBe(2);
    let firstMove = game.tree.nodes[1].props.find(
      (prop) => prop.name === "MOVE"
    );
    expect(firstMove.loc).toEqual({ x: 8, y: 9 });
    expect(game.tree.messages[0].map((message) => message.body)).toEqual([
      "Spannende Partie",
      "Viel Erfolg",
    ]);
    expect(game.tree.messages[2][0].body).toBe("Erster Kommentar zum Zug");
    let state = game.tree.computedState[game.tree.activeNode];
    expect(state.board[9][8]).toBe("black");
    expect(state.board[0][0]).toBe("white");
  });

  it("builds a running game from the detail response when OGS withholds the SGF", () => {
    let game = parseOgsGame(LIVE_DATA, null, 1010000);
    expect(game).toMatchObject({
      id: 123,
      tvSource: "ogs",
      moveNum: 3,
      over: false,
      players: {
        black: { name: "Surma", rank: "4p", rankVal: 14 },
        white: { name: "Ovsiienko", rank: "6d", rankVal: 6 },
      },
      clocks: {
        black: { time: 120, running: false },
        white: { time: 80, running: true },
      },
    });
    expect(game.score).toBe(undefined);
    expect(game.sgfUrl).toBe(undefined);
    let state = game.tree.computedState[game.tree.activeNode];
    // OGS x/y count from the top left, like the board: [15, 3] is Q16.
    expect(state.board[9][8]).toBe("black");
    expect(state.board[0][0]).toBe("white");
    expect(state.board[3][15]).toBe("black");
    expect(game.tree.messages[game.tree.activeNode]).toEqual([]);
  });

  it("builds the same position from the detail response as from the SGF", () => {
    let sgf = "(;SZ[19];B[ij];W[aa];B[pd])";
    let fromSgf = parseOgsGame(LIVE_DATA, sgf);
    let fromData = parseOgsGame(LIVE_DATA);
    expect(fromData.tree.currentLine).toEqual(fromSgf.tree.currentLine);
    expect(fromData.tree.computedState[fromData.tree.activeNode].board).toEqual(
      fromSgf.tree.computedState[fromSgf.tree.activeNode].board
    );
  });

  it("provides an empty message list for pass actions without chat", () => {
    let game = parseOgsGame(
      GAME_DATA,
      "(;SZ[19]PB[Surma]PW[Ovsiienko];B[aa];W[])"
    );
    expect(game.tree.messages[2]).toEqual([]);
  });

  it("maps OGS results to existing game scores", () => {
    expect(parseOgsScore("W+R")).toBe("W+RESIGN");
    expect(parseOgsScore("B+T")).toBe("B+TIME");
    expect(parseOgsScore("W+2.5")).toBe(-2.5);
    expect(parseOgsScore("0")).toBe("NO_RESULT");
    expect(parseOgsScore("?")).toBe(null);
  });

  it("uses only explicit calendar game IDs, never arbitrary strong games", () => {
    let source = new OgsTvSource();
    let ogsGame = parseOgsGame(GAME_DATA, SGF);
    let kgsGame = { ...ogsGame, id: 999, tvSource: "kgs" };
    let now = new Date("2026-11-22T18:30:00Z");
    let linked = {
      id: "linked",
      name: "Linked",
      date_start: "2026-11-22",
      platform: "twitch",
      stream_url: "https://www.twitch.tv/egf",
      ogs_game_id: 123,
    };
    let unlinked = { ...linked, id: "unlinked", ogs_game_id: undefined };
    expect(
      source.getLiveBroadcasts([ogsGame, kgsGame], [linked, unlinked], {}, now)
    ).toEqual([{ event: linked, games: [ogsGame] }]);
    expect(source.getLiveGames([ogsGame, kgsGame])).toEqual([ogsGame]);
    expect(source.getLiveEventForGame(kgsGame, [linked], {}, now)).toBe(null);
    expect(source.getLiveEventForGame(ogsGame, [linked], {}, now)).toBe(linked);
  });
});

describe("OgsTvSource anonymous polling", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("polls a running game with one anonymous request and stops on release", async () => {
    let fetchMock = jest.fn((url) => Promise.resolve(responseFor(url)));
    let source = new OgsTvSource(fetchMock, 1000);
    let listener = jest.fn();
    let release = source.observeGame(123, listener);
    await flushPromises();
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "https://online-go.com/api/v1/games/123",
    ]);
    expect(
      fetchMock.mock.calls.every((call) => call[1].credentials === "omit")
    ).toBe(true);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ id: 123, moveNum: 3, over: false }),
      null
    );
    jest.advanceTimersByTime(1000);
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    release();
    release();
    jest.advanceTimersByTime(3000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("loads the SGF with the chat once the game has ended and stops polling", async () => {
    let fetchMock = jest.fn((url) =>
      Promise.resolve(responseFor(url, ENDED_DATA))
    );
    let source = new OgsTvSource(fetchMock, 1000);
    let listener = jest.fn();
    source.observeGame(123, listener);
    await flushPromises();
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "https://online-go.com/api/v1/games/123",
      "https://online-go.com/api/v1/games/123/sgf",
    ]);
    let game = listener.mock.calls[0][0];
    expect(game).toMatchObject({ over: true, score: "B+RESIGN", moveNum: 2 });
    expect(game.clocks).toBe(undefined);
    expect(game.tree.messages[2][0].body).toBe("Erster Kommentar zum Zug");
    jest.advanceTimersByTime(5000);
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the board of an ended game when its SGF is unavailable", async () => {
    let fetchMock = jest.fn((url) =>
      Promise.resolve(
        url.endsWith("/sgf")
          ? { ok: false, status: 403 }
          : responseFor(url, ENDED_DATA)
      )
    );
    let source = new OgsTvSource(fetchMock, 1000);
    let listener = jest.fn();
    source.observeGame(123, listener);
    await flushPromises();
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ id: 123, moveNum: 3, over: true }),
      null
    );
  });

  describe("broadcasts that name their OGS players", () => {
    let event = {
      id: "series",
      name: "Series",
      date_start: "2026-11-22",
      start: "2026-11-22T18:00:00Z",
      platform: "twitch",
      stream_url: "https://www.twitch.tv/egf",
      ogs_players: ["Surma", "Ovsiienko"],
    };
    let listed;
    let ended;

    function listEntry(id, endedAt) {
      return {
        id,
        started: "2026-11-22T18:05:00Z",
        ended: endedAt || null,
        players: {
          black: { username: "Surma" },
          white: { username: "Ovsiienko" },
        },
      };
    }

    function seriesFetch(url) {
      if (url.includes("/players/?username=")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              results: [
                { id: 70, username: "Surma2" },
                { id: 7, username: "surma" },
              ],
            }),
        });
      }
      if (url.includes("/players/7/games/")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ results: listed }),
        });
      }
      let id = Number(url.match(/games\/(\d+)/)[1]);
      return Promise.resolve(
        responseFor(url, {
          ...LIVE_DATA,
          id,
          ended: ended[id] ? "2026-11-22T18:30:00Z" : null,
        })
      );
    }

    beforeEach(() => {
      listed = [];
      ended = {};
    });

    it("waits for the first game, then follows the series to the next game", async () => {
      let fetchMock = jest.fn(seriesFetch);
      let source = new OgsTvSource(fetchMock, 1000, 3000);
      let listener = jest.fn();
      let release = source.observeEvent(event, listener);
      await flushPromises();
      expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
        "https://online-go.com/api/v1/players/?username=Surma",
        "https://online-go.com/api/v1/players/7/games/?ordering=-id&page_size=10",
      ]);
      expect(listener).not.toHaveBeenCalled();

      listed = [listEntry(501)];
      jest.advanceTimersByTime(3000);
      await flushPromises();
      expect(listener).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 501, over: false }),
        null
      );

      // While game 501 runs, only the game itself is polled.
      let listCalls = () =>
        fetchMock.mock.calls.filter((call) => call[0].includes("/players/7/"))
          .length;
      let before = listCalls();
      jest.advanceTimersByTime(3000);
      await flushPromises();
      expect(listCalls()).toBe(before);

      ended[501] = true;
      listed = [listEntry(501, "2026-11-22T18:30:00Z")];
      jest.advanceTimersByTime(1000);
      await flushPromises();
      expect(listener).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 501, over: true }),
        null
      );

      listed = [listEntry(502), listEntry(501, "2026-11-22T18:30:00Z")];
      jest.advanceTimersByTime(3000);
      await flushPromises();
      expect(listener).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 502, over: false }),
        null
      );

      release();
      let total = fetchMock.mock.calls.length;
      jest.advanceTimersByTime(10000);
      await flushPromises();
      expect(fetchMock).toHaveBeenCalledTimes(total);
    });

    it("reports an unknown OGS player instead of showing another game", async () => {
      let fetchMock = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ results: [{ id: 1, username: "x" }] }),
        })
      );
      let source = new OgsTvSource(fetchMock, 1000, 3000);
      let listener = jest.fn();
      source.observeEvent(event, listener);
      await flushPromises();
      expect(listener).toHaveBeenCalledWith(
        null,
        "OGS-Spieler nicht gefunden: Surma"
      );
    });

    it("follows a series from one linked game without listed players", async () => {
      let fetchMock = jest.fn(seriesFetch);
      let source = new OgsTvSource(fetchMock, 1000, 3000);
      let listener = jest.fn();
      let linked = { ...event, ogs_players: undefined, ogs_game_id: 501 };
      ended[501] = true;
      listed = [listEntry(502), listEntry(501, "2026-11-22T18:30:00Z")];
      source.observeEvent(linked, listener);
      await flushPromises();
      expect(listener).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 501, over: true }),
        null
      );
      jest.advanceTimersByTime(3000);
      await flushPromises();
      expect(
        fetchMock.mock.calls.some((call) =>
          call[0].includes("/players/?username=Surma")
        )
      ).toBe(true);
      expect(listener).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 502, over: false }),
        null
      );
    });

    it("never goes back to an older game of the same players", async () => {
      let fetchMock = jest.fn(seriesFetch);
      let source = new OgsTvSource(fetchMock, 1000, 3000);
      let listener = jest.fn();
      ended[501] = true;
      listed = [listEntry(400), listEntry(501, "2026-11-22T18:30:00Z")];
      source.observeEvent({ ...event, ogs_game_id: 501 }, listener);
      await flushPromises();
      jest.advanceTimersByTime(6000);
      await flushPromises();
      expect(listener).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 501 }),
        null
      );
    });

    it("uses a fixed ogs_game_id directly when the calendar has one", async () => {
      let fetchMock = jest.fn(seriesFetch);
      let source = new OgsTvSource(fetchMock, 1000, 3000);
      let listener = jest.fn();
      source.observeEvent({ ...event, ogs_game_id: 123 }, listener);
      await flushPromises();
      expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
        "https://online-go.com/api/v1/games/123",
      ]);
    });
  });

  describe("with the OGS real-time connection", () => {
    let handler;
    let releaseLive;
    let realtime;
    let fetchMock;
    let listener;
    let source;
    let detail;

    function lastGame() {
      return listener.mock.calls[listener.mock.calls.length - 1][0];
    }

    beforeEach(async () => {
      releaseLive = jest.fn();
      realtime = {
        watch: jest.fn((gameId, liveHandler) => {
          handler = liveHandler;
          return releaseLive;
        }),
        resync: jest.fn(),
      };
      detail = LIVE_DATA;
      fetchMock = jest.fn((url) => Promise.resolve(responseFor(url, detail)));
      source = new OgsTvSource(fetchMock, 1000, 3000, realtime);
      listener = jest.fn();
      source.observeGame(123, listener);
      await flushPromises();
    });

    it("shows pushed moves, clocks and chat without asking REST again", () => {
      expect(realtime.watch).toHaveBeenCalledWith(123, expect.any(Function));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      handler("gamedata", LIVE_DATA.gamedata);
      handler("move", { game_id: 123, move_number: 4, move: [3, 3, 500] });
      expect(lastGame().moveNum).toBe(4);
      expect(
        lastGame().tree.computedState[lastGame().tree.activeNode].board[3][3]
      ).toBe("white");

      handler("move", { game_id: 123, move_number: 4, move: [3, 3, 500] });
      expect(lastGame().moveNum).toBe(4);

      handler("clock", {
        ...LIVE_DATA.gamedata.clock,
        current_player: 1,
        last_move: 2000000,
        now: 2004000,
      });
      expect(lastGame().clocks.black).toMatchObject({
        time: 116,
        running: true,
      });

      handler("reset-chats");
      handler("chat", {
        channel: "main",
        line: {
          chat_id: "a",
          body: "Guter Zug",
          username: "Fan",
          move_number: 4,
          date: 1794946363,
        },
      });
      handler("chat", {
        channel: "spectator",
        line: {
          chat_id: "b",
          body: { type: "translated", en: "Good luck" },
          username: "Bot",
          move_number: 0,
        },
      });
      handler("chat", {
        channel: "malkovich",
        line: { chat_id: "c", body: "Geheim", username: "Spieler" },
      });
      handler("chat", {
        channel: "main",
        line: { chat_id: "d", body: { type: "analysis" }, username: "Fan" },
      });
      let tree = lastGame().tree;
      expect(tree.messages[tree.currentLine[4]]).toEqual([
        {
          id: "ogs-123-a",
          sender: "Fan",
          body: "Guter Zug",
          date: new Date(1794946363000),
        },
      ]);
      expect(tree.messages[tree.currentLine[0]].map((m) => m.body)).toEqual([
        "Good luck",
      ]);
      handler("chat/remove", { chat_ids: ["a"] });
      expect(lastGame().tree.messages[tree.currentLine[4]]).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("keeps REST as a slow safety net while OGS pushes, and at full rate when offline", async () => {
      handler("gamedata", LIVE_DATA.gamedata);
      jest.advanceTimersByTime(11000);
      await flushPromises();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(1000);
      await flushPromises();
      expect(fetchMock).toHaveBeenCalledTimes(2);

      handler("offline", null);
      jest.advanceTimersByTime(1000);
      await flushPromises();
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("tells whether the game is delivered live and keeps the newest state when the connection drops", async () => {
      expect(lastGame().tvLive).toBe(false);
      handler("gamedata", LIVE_DATA.gamedata);
      handler("move", { game_id: 123, move_number: 4, move: [3, 3, 500] });
      expect(lastGame().tvLive).toBe(true);
      handler("offline", null);
      expect(lastGame()).toMatchObject({ tvLive: false, moveNum: 4 });
    });

    it("does not report a failed safety-net request while OGS still pushes", async () => {
      handler("gamedata", LIVE_DATA.gamedata);
      fetchMock.mockImplementation(() =>
        Promise.resolve({ ok: false, status: 502 })
      );
      jest.advanceTimersByTime(12000);
      await flushPromises();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(listener.mock.calls.every((call) => call[1] === null)).toBe(true);

      handler("offline", null);
      jest.advanceTimersByTime(1000);
      await flushPromises();
      expect(listener).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 123 }),
        "OGS HTTP 502"
      );
    });

    it("asks for the full game again after a missed move or an undo", async () => {
      handler("gamedata", LIVE_DATA.gamedata);
      handler("move", { game_id: 123, move_number: 6, move: [5, 5, 100] });
      expect(realtime.resync).toHaveBeenCalledWith(123);
      await flushPromises();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(lastGame().moveNum).toBe(3);

      handler("gamedata", LIVE_DATA.gamedata);
      handler("undo_accepted", 2);
      expect(realtime.resync).toHaveBeenCalledTimes(2);
    });

    it("takes result and SGF from REST once OGS reports the game finished", async () => {
      handler("gamedata", LIVE_DATA.gamedata);
      detail = ENDED_DATA;
      handler("phase", "finished");
      expect(lastGame().over).toBe(true);
      await flushPromises();
      expect(fetchMock.mock.calls.map((call) => call[0]).slice(1)).toEqual([
        "https://online-go.com/api/v1/games/123",
        "https://online-go.com/api/v1/games/123/sgf",
      ]);
      expect(lastGame()).toMatchObject({ over: true, score: "B+RESIGN" });
      expect(releaseLive).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(20000);
      await flushPromises();
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  it("reports request errors without inventing a board", async () => {
    let fetchMock = jest.fn(() => Promise.resolve({ ok: false, status: 404 }));
    let source = new OgsTvSource(fetchMock, 1000);
    let listener = jest.fn();
    source.observeGame(404, listener);
    await flushPromises();
    expect(listener).toHaveBeenCalledWith(null, "OGS HTTP 404");
  });
});

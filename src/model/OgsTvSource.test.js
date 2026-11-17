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

  it("reports request errors without inventing a board", async () => {
    let fetchMock = jest.fn(() => Promise.resolve({ ok: false, status: 404 }));
    let source = new OgsTvSource(fetchMock, 1000);
    let listener = jest.fn();
    source.observeGame(404, listener);
    await flushPromises();
    expect(listener).toHaveBeenCalledWith(null, "OGS HTTP 404");
  });
});

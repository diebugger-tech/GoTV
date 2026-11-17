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

function responseFor(url) {
  if (url.endsWith("/sgf")) {
    return { ok: true, text: () => Promise.resolve(SGF) };
  }
  return { ok: true, json: () => Promise.resolve(GAME_DATA) };
}

async function flushPromises() {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
}

describe("OgsTvSource game adapter", () => {
  it("adapts OGS metadata, standard SGF coordinates, latest moves and chat", () => {
    let game = parseOgsGame(GAME_DATA, SGF);
    expect(game).toMatchObject({
      id: 123,
      type: "tournament",
      tvSource: "ogs",
      event: true,
      sgfUrl: "https://online-go.com/api/v1/games/123/sgf",
      moveNum: 2,
      over: false,
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
    expect(state.board[18][0]).toBe("white");
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

  it("fetches anonymously, polls while observed and stops on release", async () => {
    let fetchMock = jest.fn((url) => Promise.resolve(responseFor(url)));
    let source = new OgsTvSource(fetchMock, 1000);
    let listener = jest.fn();
    let release = source.observeGame(123, listener);
    await flushPromises();
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "https://online-go.com/api/v1/games/123",
      "https://online-go.com/api/v1/games/123/sgf",
    ]);
    expect(
      fetchMock.mock.calls.every((call) => call[1].credentials === "omit")
    ).toBe(true);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ id: 123, moveNum: 2 }),
      null
    );
    jest.advanceTimersByTime(1000);
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    release();
    release();
    jest.advanceTimersByTime(3000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
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

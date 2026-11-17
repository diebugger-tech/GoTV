import {
  buildOgsSgf,
  formatOgsRank,
  getOgsTimeRules,
  parseOgsClocks,
} from "./OgsGameData";

const LIVE_DATA = {
  id: 123,
  width: 19,
  komi: "6.5",
  rules: "japanese",
  ended: null,
  players: {
    black: { id: 1, username: "Surma", ranking: 39.4, professional: true },
    white: { id: 2, username: "Ovsi]enko", ranking: 35.2 },
  },
  gamedata: {
    phase: "play",
    initial_player: "black",
    moves: [
      [8, 9, 1200],
      [0, 0, 900],
      [-1, -1, 300],
    ],
  },
};

describe("formatOgsRank", () => {
  it("maps OGS numeric rankings to kyu, dan and pro ranks", () => {
    expect(formatOgsRank(7.0000001, false)).toBe("23k");
    expect(formatOgsRank(29.9, false)).toBe("1k");
    expect(formatOgsRank(30, false)).toBe("1d");
    expect(formatOgsRank(35.2, false)).toBe("6d");
    expect(formatOgsRank(39.4, true)).toBe("3p");
  });

  it("returns null when OGS sends no usable ranking", () => {
    expect(formatOgsRank(undefined, false)).toBe(null);
    expect(formatOgsRank("5d", false)).toBe(null);
  });
});

describe("buildOgsSgf", () => {
  it("writes the moves of a running game as standard SGF", () => {
    expect(buildOgsSgf(LIVE_DATA)).toBe(
      "(;FF[4]GM[1]SZ[19]PB[Surma]PW[Ovsi\\]enko]BR[3p]WR[6d]" +
        ";B[ij];W[aa];B[])"
    );
  });

  it("starts with white after fixed handicap stones", () => {
    let sgf = buildOgsSgf({
      ...LIVE_DATA,
      handicap: 2,
      gamedata: {
        initial_player: "white",
        initial_state: { black: "pddp", white: "" },
        moves: [[3, 3, 100]],
      },
    });
    expect(sgf).toContain("HA[2]AB[pd][dp];W[dd])");
  });

  it("turns free handicap placements into setup stones before white moves", () => {
    let sgf = buildOgsSgf({
      ...LIVE_DATA,
      handicap: 2,
      gamedata: {
        initial_player: "black",
        free_handicap_placement: true,
        moves: [
          [15, 3, 100],
          [3, 15, 100],
          [3, 3, 100],
          [15, 15, 100],
        ],
      },
    });
    expect(sgf).toContain("HA[2]AB[pd][dp];W[dd];B[pp])");
  });

  it("prefers an explicit player colour on a move", () => {
    let sgf = buildOgsSgf({
      ...LIVE_DATA,
      gamedata: {
        moves: [
          [0, 0, 100, 2],
          [1, 1, 100, 2],
        ],
      },
    });
    expect(sgf).toContain(";W[aa];W[bb])");
  });

  it("builds an empty board when OGS sends no game data", () => {
    expect(buildOgsSgf({ id: 5, width: 13 })).toBe("(;FF[4]GM[1]SZ[13])");
  });
});

describe("parseOgsClocks", () => {
  let now = 1000000;

  function withClock(clock, phase = "play") {
    return {
      ...LIVE_DATA,
      gamedata: {
        ...LIVE_DATA.gamedata,
        phase,
        clock: {
          black_player_id: 1,
          white_player_id: 2,
          current_player: 1,
          last_move: now - 10000,
          ...clock,
        },
      },
    };
  }

  it("runs only the clock of the player to move (Fischer)", () => {
    let clocks = parseOgsClocks(
      withClock({
        black_time: { thinking_time: 120, skip_bonus: false },
        white_time: { thinking_time: 90, skip_bonus: false },
      }),
      now
    );
    expect(clocks).toEqual({
      black: { time: 110, stonesLeft: 0, running: true },
      white: { time: 90, stonesLeft: 0, running: false },
    });
  });

  it("uses the OGS server time when the response carries it", () => {
    let clocks = parseOgsClocks(
      withClock({
        now: now + 5000,
        black_time: { thinking_time: 120 },
        white_time: { thinking_time: 90 },
      }),
      now
    );
    expect(clocks.black.time).toBe(105);
  });

  it("keeps byo-yomi main time and counts used periods in overtime", () => {
    let mainTime = parseOgsClocks(
      withClock({
        black_time: { thinking_time: 60, periods: 5, period_time: 30 },
        white_time: { thinking_time: 0, periods: 3, period_time: 30 },
      }),
      now
    );
    expect(mainTime.black).toEqual({ time: 50, periodsLeft: 0, running: true });
    expect(mainTime.white).toEqual({
      time: 30,
      periodsLeft: 3,
      running: false,
    });

    let overtime = parseOgsClocks(
      withClock({
        last_move: now - 40000,
        black_time: { thinking_time: 0, periods: 3, period_time: 30 },
        white_time: { thinking_time: 0, periods: 3, period_time: 30 },
      }),
      now
    );
    expect(overtime.black).toEqual({ time: 20, periodsLeft: 2, running: true });
  });

  it("maps Canadian overtime to stones left", () => {
    let clocks = parseOgsClocks(
      withClock({
        black_time: { thinking_time: 0, moves_left: 7, block_time: 200 },
        white_time: { thinking_time: 300, moves_left: 10, block_time: 600 },
      }),
      now
    );
    expect(clocks.black).toEqual({ time: 190, stonesLeft: 7, running: true });
    expect(clocks.white).toEqual({ time: 300, stonesLeft: 0, running: false });
  });

  it("freezes both clocks while the game is paused", () => {
    let clocks = parseOgsClocks(
      withClock({
        paused_since: now - 4000,
        black_time: { thinking_time: 120 },
        white_time: { thinking_time: 90 },
      }),
      now
    );
    expect(clocks.black).toEqual({
      time: 114,
      stonesLeft: 0,
      running: true,
      paused: true,
    });
    expect(clocks.white.paused).toBe(true);
  });

  it("shows no clocks for finished games or unknown time formats", () => {
    let fischer = {
      black_time: { thinking_time: 120 },
      white_time: { thinking_time: 90 },
    };
    expect(
      parseOgsClocks({ ...withClock(fischer), ended: "2026-11-22" }, now)
    ).toBe(null);
    expect(parseOgsClocks(withClock(fischer, "finished"), now)).toBe(null);
    expect(
      parseOgsClocks(withClock({ black_time: 1234, white_time: 5678 }), now)
    ).toBe(null);
    expect(parseOgsClocks(LIVE_DATA, now)).toBe(null);
  });
});

describe("getOgsTimeRules", () => {
  it("passes byo-yomi and Canadian settings to the existing clock", () => {
    expect(
      getOgsTimeRules({
        gamedata: {
          time_control: { system: "byoyomi", period_time: 30, periods: 5 },
        },
      })
    ).toEqual({ byoYomiTime: 30, byoYomiPeriods: 5 });
    expect(
      getOgsTimeRules({
        gamedata: {
          time_control: {
            system: "canadian",
            period_time: 600,
            stones_per_period: 25,
          },
        },
      })
    ).toEqual({ byoYomiTime: 600, byoYomiStones: 25 });
    expect(
      getOgsTimeRules({ gamedata: { time_control: { system: "fischer" } } })
    ).toEqual({});
    expect(getOgsTimeRules({})).toEqual({});
  });
});

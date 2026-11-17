import { pickOgsGameId } from "./OgsGameFinder";

const WINDOW_START = Date.parse("2026-11-22T17:45:00Z");

function game(id, black, white, started, ended = null) {
  return {
    id,
    started,
    ended,
    players: { black: { username: black }, white: { username: white } },
  };
}

describe("pickOgsGameId", () => {
  let players = ["Surma", "ovsiienko"];

  it("prefers the running game between the listed players", () => {
    let games = [
      game(12, "Ovsiienko", "Surma", "2026-11-22T18:40:00Z"),
      game(
        11,
        "Surma",
        "Ovsiienko",
        "2026-11-22T18:00:00Z",
        "2026-11-22T18:30:00Z"
      ),
    ];
    expect(pickOgsGameId(games, players, WINDOW_START)).toBe(12);
  });

  it("keeps the latest finished game until the next one starts", () => {
    let games = [
      game(
        11,
        "Surma",
        "Ovsiienko",
        "2026-11-22T18:00:00Z",
        "2026-11-22T18:30:00Z"
      ),
      game(
        10,
        "Ovsiienko",
        "Surma",
        "2026-11-22T17:50:00Z",
        "2026-11-22T17:58:00Z"
      ),
    ];
    expect(pickOgsGameId(games, players, WINDOW_START)).toBe(11);
  });

  it("ignores other opponents and games from before the broadcast", () => {
    let games = [
      game(14, "Surma", "SomeoneElse", "2026-11-22T18:10:00Z"),
      game(9, "Surma", "Ovsiienko", "2026-11-20T18:00:00Z"),
      game(8, "Surma", "Ovsiienko", "not a date"),
    ];
    expect(pickOgsGameId(games, players, WINDOW_START)).toBe(null);
  });

  it("accepts any opponent when only one player is listed", () => {
    let games = [game(14, "SomeoneElse", "SURMA", "2026-11-22T18:10:00Z")];
    expect(pickOgsGameId(games, ["surma"], WINDOW_START)).toBe(14);
  });

  it("returns null for empty or malformed lists", () => {
    expect(pickOgsGameId([], players, WINDOW_START)).toBe(null);
    expect(pickOgsGameId([{ id: 3 }, null], players, WINDOW_START)).toBe(null);
  });
});

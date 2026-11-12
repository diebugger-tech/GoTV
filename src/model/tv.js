// @flow
import type { GameChannel } from "./types";

// Rank value of the weaker player in a game, or null if it can't be determined
// (missing players or no rankVal). rankVal semantics (see parseRankVal in
// model/user.js): kyu < 0, dan 1-9, pro >= 11, unranked -9999.
export function getWeakerPlayerRankVal(game: GameChannel): ?number {
  let { players } = game;
  if (!players) {
    return null;
  }
  let vals: Array<number> = [];
  for (let role of ["black", "white"]) {
    let user = players[(role: any)];
    if (user && typeof user.rankVal === "number") {
      vals.push(user.rankVal);
    }
  }
  if (!vals.length) {
    return null;
  }
  return Math.min(...vals);
}

// dan rank (1d or better) as numeric rankVal; pro ranks count as dan or better
export function isDanRankVal(rankVal: number): boolean {
  return rankVal >= 1;
}

// All games from the received game lists that are actually in progress:
// not over and with both a black and a white player
export function getLiveGames(games: Array<GameChannel>): Array<GameChannel> {
  return games.filter((game) => {
    let { players } = game;
    if (!players || game.over) {
      return false;
    }
    return !!(players.black && players.white);
  });
}

// Sort live games by strength: the rank of the weaker player decides,
// dan before kyu (pro before dan). Games with unknown strength go last.
export function sortGamesByStrength(
  games: Array<GameChannel>
): Array<GameChannel> {
  let sorted = [...games];
  sorted.sort((a, b) => {
    let ar = getWeakerPlayerRankVal(a);
    let br = getWeakerPlayerRankVal(b);
    let av = ar === null || ar === undefined ? -Infinity : ar;
    let bv = br === null || br === undefined ? -Infinity : br;
    if (av === bv) {
      return (a.id || 0) - (b.id || 0);
    }
    return bv - av;
  });
  return sorted;
}

// @flow
// Chooses which OGS game belongs to a calendar broadcast that names its
// players (events.json "ogs_players") instead of a fixed game id - e.g. a
// best-of-five, where each game gets its id only when it starts.

function normalize(name: mixed): string {
  return typeof name === "string" ? name.trim().toLowerCase() : "";
}

function getPlayerNames(game: Object): Array<string> {
  let players = (game && game.players) || {};
  return [players.black, players.white]
    .map((player) => normalize(player && player.username))
    .filter(Boolean);
}

// games: entries of OGS' /players/<id>/games/ list. A game counts only if
// every listed player takes part and it started inside the broadcast window,
// so no unrelated game of a player can show up. A running game wins; without
// one the latest finished game stays until the next one begins.
export function pickOgsGameId(
  games: Array<Object>,
  players: Array<string>,
  windowStartMs: number
): ?number {
  let wanted = players.map(normalize).filter(Boolean);
  if (!wanted.length) {
    return null;
  }
  let candidates = games.filter((game) => {
    if (!game || typeof game.id !== "number") {
      return false;
    }
    let names = getPlayerNames(game);
    let started = Date.parse(game.started);
    return (
      wanted.every((name) => names.indexOf(name) !== -1) &&
      !isNaN(started) &&
      started >= windowStartMs
    );
  });
  let running = candidates.filter((game) => !game.ended);
  let pool = running.length ? running : candidates;
  return pool.length ? Math.max(...pool.map((game) => game.id)) : null;
}

// @flow
// Reads the "gamedata" part of OGS' anonymous game detail response
// (/api/v1/games/<id>). OGS serves the SGF of an in-progress game only to
// signed-in users (HTTP 403 otherwise), so the board, ranks and clocks of a
// running broadcast game come from here instead.
import type { ClockState } from "./types";

const SGF_LETTERS = "abcdefghijklmnopqrstuvwxyz";
const OGS_FIRST_DAN_RANKING = 30;
const OGS_PRO_RANKING_OFFSET = 36;
const OGS_BLACK = 1;
const OGS_WHITE = 2;

type SgfColor = "B" | "W";
type OgsTimeRules = {
  byoYomiTime?: number,
  byoYomiPeriods?: number,
  byoYomiStones?: number,
};

function escapeSgfText(value: mixed): string {
  return String(value).replace(/\\/g, "\\\\").replace(/]/g, "\\]");
}

function toSgfPoint(x: mixed, y: mixed): string {
  if (typeof x !== "number" || typeof y !== "number" || x < 0 || y < 0) {
    return ""; // pass
  }
  return (SGF_LETTERS[x] || "") + (SGF_LETTERS[y] || "");
}

export function formatOgsRank(ranking: mixed, professional: mixed): ?string {
  if (typeof ranking !== "number" || !isFinite(ranking)) {
    return null;
  }
  let rank = Math.floor(ranking);
  if (professional) {
    return Math.max(1, rank - OGS_PRO_RANKING_OFFSET) + "p";
  }
  return rank >= OGS_FIRST_DAN_RANKING
    ? rank - OGS_FIRST_DAN_RANKING + 1 + "d"
    : OGS_FIRST_DAN_RANKING - rank + "k";
}

function buildPlayerProps(data: Object): string {
  let players = data.players || {};
  let out = "";
  for (let [color, key] of [
    ["B", "black"],
    ["W", "white"],
  ]) {
    if (players[key] && players[key].username) {
      out += "P" + color + "[" + escapeSgfText(players[key].username) + "]";
    }
  }
  for (let [color, key] of [
    ["B", "black"],
    ["W", "white"],
  ]) {
    let player = players[key] || {};
    let rank = formatOgsRank(player.ranking, player.professional);
    if (rank) {
      out += color + "R[" + rank + "]";
    }
  }
  return out;
}

function getMoveFields(move: any): Array<any> {
  return Array.isArray(move) ? move : [move.x, move.y, 0, move.color];
}

// Free handicap stones arrive as black's first moves. Like OGS' own SGF
// export they become setup stones, so a running game has the same nodes as
// its final SGF.
function getHandicapMoves(gamedata: Object, handicap: number): Array<any> {
  let moves = Array.isArray(gamedata.moves) ? gamedata.moves : [];
  return gamedata.free_handicap_placement && handicap > 1
    ? moves.slice(0, handicap)
    : [];
}

// initial_state lists stones as concatenated two-letter SGF points ("pddp").
function buildSetupProps(gamedata: Object, handicap: number): string {
  let initialState = gamedata.initial_state || {};
  let black = [];
  let white = [];
  for (let [points, stones] of [
    [black, initialState.black],
    [white, initialState.white],
  ]) {
    if (typeof stones !== "string") {
      continue;
    }
    for (let i = 0; i + 1 < stones.length; i += 2) {
      points.push(stones.slice(i, i + 2));
    }
  }
  for (let move of getHandicapMoves(gamedata, handicap)) {
    let fields = getMoveFields(move);
    let point = toSgfPoint(fields[0], fields[1]);
    if (point) {
      black.push(point);
    }
  }
  return (
    (black.length ? "AB[" + black.join("][") + "]" : "") +
    (white.length ? "AW[" + white.join("][") + "]" : "")
  );
}

// Moves are [x, y, thinkingMs, player?]; x/y count from the top left, -1 is
// a pass. Colours alternate from initial_player (white after free handicap
// stones); an explicit player number on a move wins.
function buildMoveNodes(gamedata: Object, handicap: number): string {
  let moves = Array.isArray(gamedata.moves) ? gamedata.moves : [];
  let handicapMoves = getHandicapMoves(gamedata, handicap).length;
  let color: SgfColor =
    handicapMoves || gamedata.initial_player === "white" ? "W" : "B";
  let out = "";
  for (let move of moves.slice(handicapMoves)) {
    let fields = getMoveFields(move);
    let moveColor: SgfColor =
      fields[3] === OGS_BLACK ? "B" : fields[3] === OGS_WHITE ? "W" : color;
    out += ";" + moveColor + "[" + toSgfPoint(fields[0], fields[1]) + "]";
    color = moveColor === "B" ? "W" : "B";
  }
  return out;
}

export function buildOgsSgf(data: Object): string {
  let gamedata = data.gamedata || {};
  let handicap = Number(data.handicap) || 0;
  let size = typeof data.width === "number" ? data.width : 19;
  return (
    "(;FF[4]GM[1]SZ[" +
    size +
    "]" +
    buildPlayerProps(data) +
    (handicap ? "HA[" + handicap + "]" : "") +
    buildSetupProps(gamedata, handicap) +
    buildMoveNodes(gamedata, handicap) +
    ")"
  );
}

// Maps one OGS player clock onto the KGS-shaped ClockState that GameClock
// renders: periodsLeft 0 means "still in main time", stonesLeft 0 means "no
// overtime stones" (also used for Fischer/absolute, which have no overtime).
function toClockState(raw: Object, spentSeconds: number): ClockState {
  let main = raw.thinking_time - spentSeconds;
  if (typeof raw.periods === "number" && raw.period_time > 0) {
    if (main > 0) {
      return { time: main, periodsLeft: 0 };
    }
    let overtime = -main;
    let periodsLeft = raw.periods - Math.floor(overtime / raw.period_time);
    return periodsLeft > 0
      ? {
          time: raw.period_time - (overtime % raw.period_time),
          periodsLeft,
        }
      : { time: 0, periodsLeft: 1 };
  }
  if (typeof raw.moves_left === "number" && raw.block_time > 0) {
    return main > 0
      ? { time: main, stonesLeft: 0 }
      : {
          time: Math.max(0, raw.block_time + main),
          stonesLeft: raw.moves_left,
        };
  }
  return { time: Math.max(0, main), stonesLeft: 0 };
}

// now: client time of the response in ms; OGS' own clock.now wins if present.
export function parseOgsClocks(
  data: Object,
  now: number
): ?{ black: ClockState, white: ClockState } {
  let gamedata = data.gamedata || {};
  let clock = gamedata.clock;
  if (!clock || data.ended || gamedata.phase === "finished") {
    return null;
  }
  let reference = typeof clock.now === "number" ? clock.now : now;
  let paused = !!(clock.paused_since || (clock.pause && clock.pause.paused));
  if (typeof clock.paused_since === "number") {
    reference = clock.paused_since;
  }
  let elapsed =
    typeof clock.last_move === "number"
      ? Math.max(0, (reference - clock.last_move) / 1000)
      : 0;
  let clocks = {};
  for (let color of ["black", "white"]) {
    let raw = clock[color + "_time"];
    if (!raw || typeof raw.thinking_time !== "number") {
      return null;
    }
    let running =
      gamedata.phase === "play" &&
      clock.current_player === clock[color + "_player_id"];
    let state = toClockState(raw, running ? elapsed : 0);
    state.running = running;
    if (paused) {
      state.paused = true;
    }
    clocks[color] = state;
  }
  return { black: clocks.black, white: clocks.white };
}

// Only the overtime settings GameClock needs; no main time, because OGS
// sends no per-move time stamps for rewound positions.
export function getOgsTimeRules(data: Object): OgsTimeRules {
  let control = (data.gamedata || {}).time_control || {};
  if (control.system === "byoyomi" && control.period_time > 0) {
    return {
      byoYomiTime: control.period_time,
      byoYomiPeriods: control.periods,
    };
  }
  if (control.system === "canadian" && control.period_time > 0) {
    return {
      byoYomiTime: control.period_time,
      byoYomiStones: control.stones_per_period,
    };
  }
  return {};
}

// @flow
import { parseSgf, getSgfRootProp } from "./sgf";
import { buildOgsSgf, getOgsTimeRules, parseOgsClocks } from "./OgsGameData";
import {
  getLiveEvents,
  getLiveGames as getActiveLiveGames,
  hasVideoStream,
} from "./tv";
import { parseRankVal } from "./user";
import type { TvSource } from "./TvSource";
import type { TvEvent, TvBroadcast } from "./tv";
import type {
  ConversationMessage,
  GameChannel,
  GameRules,
  GameScore,
  GameTree,
  Index,
  Room,
  User,
} from "./types";

const OGS_API_URL = "https://online-go.com/api/v1/games/";
// One anonymous request per poll while a game runs (see fetchGame).
const DEFAULT_POLL_INTERVAL_MS = 5000;

type Fetch = (url: string, options?: Object) => Promise<any>;
type OgsGameListener = (?GameChannel, ?string) => void;
type OgsEntry = {
  listeners: Set<OgsGameListener>,
  timer: ?IntervalID,
  loading: boolean,
};

export function parseOgsScore(result: ?string): ?GameScore {
  if (!result || result === "?") {
    return null;
  }
  let match = result.match(/^([BW])\+(R|Resign|T|Time|F|Forfeit)$/i);
  if (match) {
    let suffix =
      match[2][0].toUpperCase() === "R"
        ? "RESIGN"
        : match[2][0].toUpperCase() === "T"
        ? "TIME"
        : "FORFEIT";
    return ((match[1].toUpperCase() + "+" + suffix: any): GameScore);
  }
  match = result.match(/^([BW])\+([0-9]+(?:\.[0-9]+)?)$/i);
  if (match) {
    let difference = parseFloat(match[2]);
    return match[1].toUpperCase() === "B" ? difference : -difference;
  }
  if (result === "0" || result === "Draw") {
    return "NO_RESULT";
  }
  return "UNKNOWN";
}

function addOgsChatMessages(tree: GameTree, gameId: number) {
  for (let nodeId of tree.currentLine) {
    let messages: Array<ConversationMessage> = [];
    let messageIndex = 0;
    for (let prop of tree.nodes[nodeId].props) {
      let text = prop.text;
      if (prop.name !== "COMMENT" || typeof text !== "string" || !text) {
        continue;
      }
      for (let line of text.split(/[\r\n]+/)) {
        let match = line.match(/^([^:]+):\s*(.*)$/);
        if (!match || !match[1].trim() || !match[2].trim()) {
          continue;
        }
        messages.push({
          id: "ogs-" + gameId + "-" + nodeId + "-" + messageIndex++,
          sender: match[1].trim(),
          body: match[2].trim(),
          date: null,
        });
      }
    }
    tree.messages[nodeId] = messages;
  }
}

function getOgsPlayer(raw: Object, rank: ?string): User {
  let displayRank = rank || "?";
  return {
    name: raw.username || "Unknown",
    rank: displayRank,
    rankVal: parseRankVal(displayRank),
  };
}

// sgf: OGS' own SGF export, which anonymous clients only get once the game
// has ended (it carries the game chat). Without it the tree is built from the
// moves in the detail response, so a running game still shows its board.
export function parseOgsGame(
  data: Object,
  sgf?: ?string,
  now?: number
): GameChannel {
  let tree = parseSgf(sgf || buildOgsSgf(data), { skipI: false });
  let gameId = Number(data.id);
  let rawPlayers = data.players || {};
  let players = {
    black: getOgsPlayer(rawPlayers.black || {}, getSgfRootProp(tree, "BR")),
    white: getOgsPlayer(rawPlayers.white || {}, getSgfRootProp(tree, "WR")),
  };
  let rules: GameRules = {
    ...getOgsTimeRules(data),
    size: typeof data.width === "number" ? data.width : 19,
    komi:
      typeof data.komi === "number"
        ? data.komi
        : parseFloat(data.komi || "6.5"),
    rules:
      data.rules === "japanese" ||
      data.rules === "chinese" ||
      data.rules === "aga" ||
      data.rules === "new_zealand"
        ? data.rules
        : "japanese",
  };
  if (data.handicap) {
    rules.handicap = data.handicap;
  }

  tree.activeNode = tree.currentLine[tree.currentLine.length - 1];
  tree.currentNode = tree.activeNode;
  addOgsChatMessages(tree, gameId);
  let moveNum = tree.currentLine.reduce(
    (count, nodeId) =>
      count +
      (tree.nodes[nodeId].props.some((prop) => prop.name === "MOVE") ? 1 : 0),
    0
  );
  let score = parseOgsScore(getSgfRootProp(tree, "RE"));
  let game: GameChannel = {
    id: gameId,
    type: data.tournament ? "tournament" : data.ranked ? "ranked" : "free",
    time: Date.parse(data.started) || Date.now(),
    players,
    moveNum,
    roomId: 0,
    rules,
    tree,
    event: true,
    over: !!data.ended,
    paused: !!(data.gamedata && data.gamedata.phase === "paused"),
    tvSource: "ogs",
  };
  if (data.name) {
    game.name = data.name;
  }
  if (data.ended) {
    // OGS refuses anonymous SGF downloads while a game is in progress.
    game.sgfUrl = OGS_API_URL + gameId + "/sgf";
  }
  if (score) {
    game.score = score;
  }
  let clocks = parseOgsClocks(data, now === undefined ? Date.now() : now);
  if (clocks) {
    game.clocks = clocks;
  }
  return game;
}

// OGS boards are loaded only for an explicit ogs_game_id on a calendar
// broadcast. There is deliberately no OGS live-game search or rank filter.
export class OgsTvSource implements TvSource {
  _fetch: Fetch;
  _pollIntervalMs: number;
  _entries: { [number]: OgsEntry } = {};
  _gamesById: { [number]: GameChannel } = {};

  constructor(fetchFn?: Fetch, pollIntervalMs?: number) {
    this._fetch =
      fetchFn ||
      ((url, options) => fetch(url, { ...options, credentials: "omit" }));
    this._pollIntervalMs = pollIntervalMs || DEFAULT_POLL_INTERVAL_MS;
  }

  getLiveGames(activeGames: Array<GameChannel>): Array<GameChannel> {
    return getActiveLiveGames(activeGames).filter(
      (game) => game.tvSource === "ogs"
    );
  }

  getLiveEvents(events: Array<TvEvent>, now: Date): Array<TvEvent> {
    return getLiveEvents(events, now).filter(
      (event) => hasVideoStream(event) && !!event.ogs_game_id
    );
  }

  getLiveEventForGame(
    game: GameChannel,
    events: Array<TvEvent>,
    roomsById: Index<Room>,
    now: Date
  ): ?TvEvent {
    if (game.tvSource !== "ogs") {
      return null;
    }
    return (
      this.getLiveEvents(events, now).find(
        (event) => event.ogs_game_id === game.id
      ) || null
    );
  }

  getLiveBroadcasts(
    activeGames: Array<GameChannel>,
    events: Array<TvEvent>,
    roomsById: Index<Room>,
    now: Date
  ): Array<TvBroadcast> {
    let games = activeGames.filter((game) => game.tvSource === "ogs");
    for (let key of Object.keys(this._gamesById)) {
      let game = this._gamesById[Number(key)];
      if (!games.some((candidate) => candidate.id === game.id)) {
        games.push(game);
      }
    }
    return this.getLiveEvents(events, now).map((event) => ({
      event,
      games: games.filter((game) => game.id === event.ogs_game_id),
    }));
  }

  // A running game needs only the detail request. The SGF (with the chat) is
  // fetched once the game has ended; if that fails the board still comes
  // from the detail response.
  fetchGame(gameId: number): Promise<GameChannel> {
    let url = OGS_API_URL + gameId;
    return this._fetch(url, { credentials: "omit" })
      .then((response) => {
        if (!response.ok) {
          throw new Error("OGS HTTP " + response.status);
        }
        return response.json();
      })
      .then((data) => {
        if (!data.ended) {
          return parseOgsGame(data);
        }
        return this._fetch(url + "/sgf", { credentials: "omit" })
          .then((response) => (response.ok ? response.text() : null))
          .catch(() => null)
          .then((sgf) => parseOgsGame(data, sgf));
      });
  }

  observeGame(gameId: number, listener: OgsGameListener): () => void {
    let entry = this._entries[gameId];
    if (!entry) {
      let newEntry: OgsEntry = {
        listeners: new Set(),
        timer: null,
        loading: false,
      };
      entry = newEntry;
      this._entries[gameId] = entry;
      entry.timer = setInterval(
        () => this._refresh(gameId),
        this._pollIntervalMs
      );
      this._refresh(gameId);
    }
    entry.listeners.add(listener);
    let cached = this._gamesById[gameId];
    if (cached) {
      listener(cached, null);
    }
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      let current = this._entries[gameId];
      if (!current) {
        return;
      }
      current.listeners.delete(listener);
      if (!current.listeners.size) {
        if (current.timer) {
          clearInterval(current.timer);
        }
        delete this._entries[gameId];
      }
    };
  }

  _refresh(gameId: number) {
    let entry = this._entries[gameId];
    if (!entry || entry.loading) {
      return;
    }
    entry.loading = true;
    this.fetchGame(gameId).then(
      (game) => {
        this._gamesById[gameId] = game;
        let current = this._entries[gameId];
        if (current) {
          current.loading = false;
          if (game.over && current.timer) {
            // A finished game no longer changes: stop asking OGS.
            clearInterval(current.timer);
            current.timer = null;
          }
          current.listeners.forEach((listener) => listener(game, null));
        }
      },
      (err) => {
        let current = this._entries[gameId];
        if (current) {
          current.loading = false;
          let message =
            err && err.message ? err.message : "OGS-Brett nicht erreichbar";
          current.listeners.forEach((listener) =>
            listener(this._gamesById[gameId] || null, message)
          );
        }
      }
    );
  }
}

export const ogsTvSource = new OgsTvSource();

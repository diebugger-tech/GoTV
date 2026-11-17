// @flow
import { parseSgf, getSgfRootProp } from "./sgf";
import { buildOgsSgf, getOgsTimeRules, parseOgsClocks } from "./OgsGameData";
import { pickOgsGameId } from "./OgsGameFinder";
import {
  getLiveEvents,
  getLiveGames as getActiveLiveGames,
  getLiveWindow,
  hasOgsBoard,
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
const OGS_PLAYERS_URL = "https://online-go.com/api/v1/players/";
// How often a broadcast that names its players looks for their (next) game.
const DEFAULT_FIND_INTERVAL_MS = 15000;
const FIND_PAGE_SIZE = 10;
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
  let tree = parseSgf(sgf || buildOgsSgf(data));
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
  _findIntervalMs: number;
  _entries: { [number]: OgsEntry } = {};
  _gamesById: { [number]: GameChannel } = {};
  _playerIds: { [name: string]: Promise<number> } = {};

  constructor(
    fetchFn?: Fetch,
    pollIntervalMs?: number,
    findIntervalMs?: number
  ) {
    this._fetch =
      fetchFn ||
      ((url, options) => fetch(url, { ...options, credentials: "omit" }));
    this._pollIntervalMs = pollIntervalMs || DEFAULT_POLL_INTERVAL_MS;
    this._findIntervalMs = findIntervalMs || DEFAULT_FIND_INTERVAL_MS;
  }

  getLiveGames(activeGames: Array<GameChannel>): Array<GameChannel> {
    return getActiveLiveGames(activeGames).filter(
      (game) => game.tvSource === "ogs"
    );
  }

  getLiveEvents(events: Array<TvEvent>, now: Date): Array<TvEvent> {
    return getLiveEvents(events, now).filter(
      (event) => hasVideoStream(event) && hasOgsBoard(event)
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
    return this._fetchJson(url).then((data) => {
      if (!data.ended) {
        return parseOgsGame(data);
      }
      return this._fetch(url + "/sgf", { credentials: "omit" })
        .then((response) => (response.ok ? response.text() : null))
        .catch(() => null)
        .then((sgf) => parseOgsGame(data, sgf));
    });
  }

  _fetchJson(url: string): Promise<Object> {
    return this._fetch(url, { credentials: "omit" }).then((response) => {
      if (!response.ok) {
        throw new Error("OGS HTTP " + response.status);
      }
      return response.json();
    });
  }

  // OGS user name -> player id, looked up once per name.
  _resolvePlayerId(name: string): Promise<number> {
    let key = name.trim().toLowerCase();
    if (!this._playerIds[key]) {
      this._playerIds[key] = this._fetchJson(
        OGS_PLAYERS_URL + "?username=" + encodeURIComponent(name.trim())
      )
        .then((data) => {
          let results = Array.isArray(data.results) ? data.results : [];
          let player = results.find(
            (candidate) =>
              typeof candidate.username === "string" &&
              candidate.username.toLowerCase() === key
          );
          if (!player) {
            throw new Error("OGS-Spieler nicht gefunden: " + name);
          }
          return player.id;
        })
        .catch((err) => {
          delete this._playerIds[key];
          throw err;
        });
    }
    return this._playerIds[key];
  }

  // The game between the listed players that started at or after
  // windowStartMs (see pickOgsGameId), or null if there is none yet.
  findGameId(players: Array<string>, windowStartMs: number): Promise<?number> {
    return this._resolvePlayerId(players[0])
      .then((playerId) =>
        this._fetchJson(
          OGS_PLAYERS_URL +
            playerId +
            "/games/?ordering=-id&page_size=" +
            FIND_PAGE_SIZE
        )
      )
      .then((data) =>
        pickOgsGameId(
          Array.isArray(data.results) ? data.results : [],
          players,
          windowStartMs
        )
      );
  }

  // Observes the OGS board of a calendar broadcast: a fixed ogs_game_id, or
  // the current game of its ogs_players. With players the board follows a
  // series by itself: while a game runs only that game is polled; once it is
  // over (or before the first one) the player's game list is checked for the
  // next game.
  observeEvent(event: TvEvent, listener: OgsGameListener): () => void {
    if (event.ogs_game_id) {
      return this.observeGame(event.ogs_game_id, listener);
    }
    let players = event.ogs_players;
    if (!players || !players.length) {
      return () => {};
    }
    let names = players;
    let windowStartMs = getLiveWindow(event).start.getTime();
    let released = false;
    let searching = false;
    let currentId: ?number = null;
    let currentGame: ?GameChannel = null;
    let releaseGame: ?() => void = null;
    let search = () => {
      if (released || searching || (currentGame && !currentGame.over)) {
        return;
      }
      searching = true;
      this.findGameId(names, windowStartMs).then(
        (gameId) => {
          searching = false;
          if (released || !gameId || gameId === currentId) {
            return;
          }
          if (releaseGame) {
            releaseGame();
          }
          currentId = gameId;
          currentGame = null;
          releaseGame = this.observeGame(gameId, (game, error) => {
            if (currentId === gameId) {
              currentGame = game || currentGame;
              listener(game, error);
            }
          });
        },
        (err) => {
          searching = false;
          if (!released && !currentId) {
            listener(
              null,
              err && err.message ? err.message : "OGS nicht erreichbar"
            );
          }
        }
      );
    };
    let timer = setInterval(search, this._findIntervalMs);
    search();
    return () => {
      if (released) {
        return;
      }
      released = true;
      clearInterval(timer);
      if (releaseGame) {
        releaseGame();
      }
    };
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

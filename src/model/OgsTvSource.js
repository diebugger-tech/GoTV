// @flow
import { parseSgf, getSgfRootProp } from "./sgf";
import {
  buildOgsSgf,
  getOgsChatText,
  getOgsTimeRules,
  parseOgsClocks,
} from "./OgsGameData";
import { OgsRealtime } from "./OgsRealtime";
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
// While the real-time connection delivers a running game, REST is only a
// safety net: every 12th poll (once a minute at the default interval).
const LIVE_REST_EVERY_N_POLLS = 12;
const LIVE_CHAT_CHANNELS = ["main", "spectator"];
const UNKNOWN_PLAYER = "Unknown";
const FIND_PAGE_SIZE = 10;
// One anonymous request per poll while a game runs (see fetchGame).
const DEFAULT_POLL_INTERVAL_MS = 5000;

type Fetch = (url: string, options?: Object) => Promise<any>;
type OgsGameListener = (?GameChannel, ?string) => void;
type OgsEntry = {
  listeners: Set<OgsGameListener>,
  timer: ?IntervalID,
  loading: boolean,
  // Last REST detail response and, once the game has ended, its SGF.
  data: ?Object,
  sgf: ?string,
  // Game state pushed over the real-time connection; null while offline.
  liveGamedata: ?Object,
  // Live chat lines; null until the real-time connection delivered chat.
  chat: ?Array<Object>,
  skippedPolls: number,
  releaseLive: ?() => void,
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
    name: raw.username || UNKNOWN_PLAYER,
    rank: displayRank,
    rankVal: parseRankVal(displayRank),
  };
}

// Live chat lines from the real-time connection, attached to the move they
// were written at.
function addOgsLiveChat(tree: GameTree, gameId: number, lines: Array<Object>) {
  let lastIndex = tree.currentLine.length - 1;
  for (let nodeId of tree.currentLine) {
    tree.messages[nodeId] = [];
  }
  for (let line of lines) {
    let body = getOgsChatText(line.body);
    if (!body) {
      continue;
    }
    let moveNumber =
      typeof line.move_number === "number" ? line.move_number : 0;
    let index = Math.min(Math.max(0, moveNumber), lastIndex);
    tree.messages[tree.currentLine[index]].push({
      id: "ogs-" + gameId + "-" + String(line.chat_id),
      sender: line.username || "?",
      body,
      date: typeof line.date === "number" ? new Date(line.date * 1000) : null,
    });
  }
}

// sgf: OGS' own SGF export, which anonymous clients only get once the game
// has ended (it carries the game chat). Without it the tree is built from the
// moves in the detail response, so a running game still shows its board.
// chat: live chat lines from the real-time connection; they replace the
// chat comments of the SGF.
export function parseOgsGame(
  data: Object,
  sgf?: ?string,
  now?: number,
  chat?: ?Array<Object>
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
  if (chat) {
    addOgsLiveChat(tree, gameId, chat);
  } else {
    addOgsChatMessages(tree, gameId);
  }
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
    over: !!data.ended || (data.gamedata || {}).phase === "finished",
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
  _realtime: ?OgsRealtime;

  // realtime: pushes moves, clocks and chat of observed games. Without it
  // (tests, or no WebSocket) everything comes from REST polling alone.
  constructor(
    fetchFn?: Fetch,
    pollIntervalMs?: number,
    findIntervalMs?: number,
    realtime?: ?OgsRealtime
  ) {
    this._realtime = realtime || null;
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
  _fetchRaw(gameId: number): Promise<{ data: Object, sgf: ?string }> {
    let url = OGS_API_URL + gameId;
    return this._fetchJson(url).then((data) => {
      if (!data.ended) {
        return { data, sgf: null };
      }
      return this._fetch(url + "/sgf", { credentials: "omit" })
        .then((response) => (response.ok ? response.text() : null))
        .catch(() => null)
        .then((sgf) => ({ data, sgf }));
    });
  }

  fetchGame(gameId: number): Promise<GameChannel> {
    return this._fetchRaw(gameId).then(({ data, sgf }) =>
      parseOgsGame(data, sgf)
    );
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

  // Observes the OGS board of a calendar broadcast: a fixed ogs_game_id
  // and/or the current game of its ogs_players. The board follows a series
  // by itself: while a game runs only that game is observed; once it is over
  // (or before the first one) the player's game list is checked for the next
  // game. A fixed game without ogs_players takes the players from the game
  // itself, so one link is enough for a whole best-of-five.
  observeEvent(event: TvEvent, listener: OgsGameListener): () => void {
    let fixedId = event.ogs_game_id;
    let names: ?Array<string> =
      event.ogs_players && event.ogs_players.length ? event.ogs_players : null;
    if (!fixedId && !names) {
      return () => {};
    }
    let windowStartMs = getLiveWindow(event).start.getTime();
    let released = false;
    let searching = false;
    let currentId: ?number = null;
    let currentGame: ?GameChannel = null;
    let releaseGame: ?() => void = null;
    let follow = (gameId: number) => {
      if (releaseGame) {
        releaseGame();
      }
      currentId = gameId;
      currentGame = null;
      releaseGame = this.observeGame(gameId, (game, error) => {
        if (currentId !== gameId) {
          return;
        }
        currentGame = game || currentGame;
        if (game && !names) {
          let found = [game.players.black, game.players.white]
            .map((player) => (player ? player.name : ""))
            .filter((name) => name && name !== UNKNOWN_PLAYER);
          names = found.length === 2 ? found : null;
        }
        listener(game, error);
      });
    };
    let search = () => {
      let players = names;
      // Nothing to look for while a game runs or the fixed one still loads.
      if (
        released ||
        searching ||
        !players ||
        (currentId && (!currentGame || !currentGame.over))
      ) {
        return;
      }
      searching = true;
      this.findGameId(players, windowStartMs).then(
        (gameId) => {
          searching = false;
          if (released || !gameId || (currentId && gameId <= currentId)) {
            return;
          }
          follow(gameId);
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
    if (fixedId) {
      follow(fixedId);
    }
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
        data: null,
        sgf: null,
        liveGamedata: null,
        chat: null,
        skippedPolls: 0,
        releaseLive: null,
      };
      entry = newEntry;
      this._entries[gameId] = entry;
      entry.timer = setInterval(
        () => this._refresh(gameId, false),
        this._pollIntervalMs
      );
      if (this._realtime) {
        entry.releaseLive = this._realtime.watch(gameId, (event, data) =>
          this._onLive(gameId, event, data)
        );
      }
      this._refresh(gameId, true);
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
        if (current.releaseLive) {
          current.releaseLive();
        }
        delete this._entries[gameId];
      }
    };
  }

  // Builds the game from the REST detail plus whatever the real-time
  // connection has delivered since, and hands it to the listeners.
  _publish(gameId: number) {
    let entry = this._entries[gameId];
    if (!entry || !entry.data) {
      return;
    }
    let data = entry.data;
    if (entry.liveGamedata && !data.ended) {
      data = { ...data, gamedata: entry.liveGamedata };
    }
    let game = parseOgsGame(data, entry.sgf, undefined, entry.chat);
    this._gamesById[gameId] = game;
    entry.listeners.forEach((listener) => listener(game, null));
  }

  // Drops the pushed state and asks OGS for the full game again - after an
  // undo or a missed move the local move list can no longer be trusted.
  _resync(gameId: number, entry: OgsEntry) {
    entry.liveGamedata = null;
    if (this._realtime) {
      this._realtime.resync(gameId);
    }
    this._refresh(gameId, true);
  }

  _onLive(gameId: number, event: string, data: any) {
    let entry = this._entries[gameId];
    if (!entry) {
      return;
    }
    let live = entry.liveGamedata;
    if (event === "gamedata" && data) {
      entry.liveGamedata = data;
    } else if (event === "move" && live && data) {
      let moves = Array.isArray(live.moves) ? live.moves : [];
      if (data.move_number === moves.length + 1) {
        entry.liveGamedata = { ...live, moves: [...moves, data.move] };
      } else if (data.move_number > moves.length + 1) {
        this._resync(gameId, entry);
        return;
      } else {
        return; // already known
      }
    } else if (event === "clock" && live && data) {
      entry.liveGamedata = { ...live, clock: data };
    } else if (event === "phase" && live) {
      entry.liveGamedata = { ...live, phase: data };
      if (data === "finished") {
        // The final result and the SGF come from REST.
        this._refresh(gameId, true);
      }
    } else if (event === "undo_accepted") {
      this._resync(gameId, entry);
      return;
    } else if (event === "reset-chats") {
      entry.chat = [];
    } else if (event === "chat" && data && data.line) {
      if (LIVE_CHAT_CHANNELS.indexOf(data.channel) === -1) {
        return;
      }
      let line = data.line;
      entry.chat = (entry.chat || [])
        .filter((known) => known.chat_id !== line.chat_id)
        .concat([line]);
    } else if (event === "chat/remove" && data && entry.chat) {
      let removed = Array.isArray(data.chat_ids) ? data.chat_ids : [];
      entry.chat = entry.chat.filter(
        (known) => removed.indexOf(known.chat_id) === -1
      );
    } else if (event === "offline") {
      // REST polling takes over at its full rate until OGS pushes again.
      entry.liveGamedata = null;
      return;
    } else {
      return;
    }
    this._publish(gameId);
  }

  // force: fetch now. Otherwise a running game that the real-time
  // connection delivers is fetched only every LIVE_REST_EVERY_N_POLLS polls.
  _refresh(gameId: number, force: boolean) {
    let entry = this._entries[gameId];
    if (!entry || entry.loading) {
      return;
    }
    let live = entry.liveGamedata;
    if (!force && live && live.phase !== "finished") {
      entry.skippedPolls++;
      if (entry.skippedPolls < LIVE_REST_EVERY_N_POLLS) {
        return;
      }
    }
    entry.skippedPolls = 0;
    entry.loading = true;
    this._fetchRaw(gameId).then(
      ({ data, sgf }) => {
        let current = this._entries[gameId];
        if (!current) {
          return;
        }
        current.loading = false;
        current.data = data;
        current.sgf = sgf;
        if (data.ended) {
          // A finished game no longer changes: stop asking OGS.
          if (current.timer) {
            clearInterval(current.timer);
            current.timer = null;
          }
          if (current.releaseLive) {
            current.releaseLive();
            current.releaseLive = null;
          }
        }
        this._publish(gameId);
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

export const ogsTvSource = new OgsTvSource(
  undefined,
  undefined,
  undefined,
  new OgsRealtime()
);

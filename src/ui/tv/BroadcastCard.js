// @flow
import React, { PureComponent as Component } from "react";
import GameList from "../game/GameList";
import CalendarEventCard from "./CalendarEventCard";
import TvGamePanel from "./TvGamePanel";
import { ogsTvSource } from "../../model/OgsTvSource";
import { hasOgsBoard, hasVideoStream } from "../../model/tv";
import { parseOgsGameLink } from "../../model/OgsLinks";
import type { TvBroadcast } from "../../model/tv";
import type { GameChannel, Room, User, AppActions, Index } from "../../model";

type Props = {
  broadcast: TvBroadcast,
  roomsById: Index<Room>,
  onJoinGame: (number) => any,
  onOpenReplay?: (string) => any,
  currentUser?: ?User,
  usersByName?: Index<User>,
  actions?: AppActions,
  connectionKey?: string,
  now?: number,
  // "OGS-Partielink zuordnen": gameId null removes the viewer's own link.
  onAssignOgsLink?: (eventId: string, gameId: ?number) => any,
  hasManualOgsLink?: boolean,
};

type State = {
  streamLoaded: boolean,
  streamKey: number,
  selectedGameKey: ?string,
  ogsGames: Array<GameChannel>,
  ogsError: ?string,
  // When OGS last delivered the board without an error.
  ogsUpdatedAt: ?number,
  linkFormOpen: boolean,
  linkInput: string,
  linkError: ?string,
  // Kinomodus: stream and board fill the window side by side.
  cinema: boolean,
  cinemaSplit: number,
  cinemaChatHidden: boolean,
};

const CINEMA_SPLIT_KEY = "gotv.cinemaSplit";
// Share of the width the stream gets in Kinomodus, in percent.
const CINEMA_SPLIT_DEFAULT = 60;
const CINEMA_SPLIT_MIN = 30;
const CINEMA_SPLIT_MAX = 80;

function clampSplit(value: mixed): number {
  let split = Number(value);
  return split >= CINEMA_SPLIT_MIN && split <= CINEMA_SPLIT_MAX
    ? split
    : CINEMA_SPLIT_DEFAULT;
}

function loadCinemaSplit(): number {
  try {
    return clampSplit(window.localStorage.getItem(CINEMA_SPLIT_KEY));
  } catch (err) {
    return CINEMA_SPLIT_DEFAULT; // storage disabled
  }
}

// What decides which OGS board an event shows.
function getOgsAssignment(event: Object): string {
  return (event.ogs_game_id || "") + "/" + (event.ogs_players || []).join(",");
}

function getGameKey(game: GameChannel): string {
  return (game.tvSource || "kgs") + "-" + game.id;
}

// List metadata only: never join a game to determine its status or move.
function getBroadcastStatus(games: Array<GameChannel>): string {
  let counts: { [status: string]: number } = {
    läuft: 0,
    pausiert: 0,
    unterbrochen: 0,
    beendet: 0,
  };
  for (let game of games) {
    let status = game.over
      ? "beendet"
      : game.adjourned
      ? "unterbrochen"
      : game.paused
      ? "pausiert"
      : "läuft";
    counts[status]++;
  }
  let status = Object.keys(counts)
    .filter((label) => counts[label])
    .map((label) => {
      let count = counts[label];
      let noun = count === 1 ? "Partie" : "Partien";
      let verb = count > 1 && label === "läuft" ? "laufen" : label;
      return (games.length > 1 ? count + " " : "") + noun + " " + verb;
    })
    .join(" · ");
  if (games.length === 1) {
    let moveNum = games[0].moveNum;
    if (Number.isInteger(moveNum) && moveNum >= 0) {
      status += " · Zug " + moveNum;
    }
  }
  return status;
}

// One entry of TV -> Live: the video broadcast (two-click embed via
// CalendarEventCard) plus its explicitly assigned KGS/OGS boards. OGS data
// loads only while the broadcast is open and never requires a KGS login.
export default class BroadcastCard extends Component<Props, State> {
  _releaseOgs: ?() => void;
  _root: ?HTMLElement;
  state = {
    streamLoaded: false,
    streamKey: 0,
    selectedGameKey: null,
    ogsGames: [],
    ogsError: null,
    ogsUpdatedAt: null,
    linkFormOpen: false,
    linkInput: "",
    linkError: null,
    cinema: false,
    cinemaSplit: loadCinemaSplit(),
    cinemaChatHidden: false,
  };

  componentDidMount() {
    document.addEventListener("keydown", this._onKeyDown);
    document.addEventListener("fullscreenchange", this._onFullscreenChange);
  }

  _setRootRef = (ref: HTMLElement | null) => {
    this._root = ref;
  };

  _onEnterCinema = () => {
    this.setState({ cinema: true });
    // Real fullscreen where the browser allows it; the card fills the
    // window either way.
    let root: any = this._root;
    if (root && typeof root.requestFullscreen === "function") {
      let request = root.requestFullscreen();
      if (request && typeof request.catch === "function") {
        request.catch(() => {});
      }
    }
  };

  _onExitCinema = () => {
    this.setState({ cinema: false });
    let doc: any = document;
    if (doc.fullscreenElement && typeof doc.exitFullscreen === "function") {
      let exit = doc.exitFullscreen();
      if (exit && typeof exit.catch === "function") {
        exit.catch(() => {});
      }
    }
  };

  _onKeyDown = (e: Object) => {
    if (this.state.cinema && e.key === "Escape") {
      this._onExitCinema();
    }
  };

  _onFullscreenChange = () => {
    // Leaving fullscreen (Esc, F11) also leaves Kinomodus.
    let doc: any = document;
    if (this.state.cinema && this._root && !doc.fullscreenElement) {
      this.setState({ cinema: false });
    }
  };

  _onChangeCinemaSplit = (e: Object) => {
    let cinemaSplit = clampSplit(e.target.value);
    this.setState({ cinemaSplit });
    try {
      window.localStorage.setItem(CINEMA_SPLIT_KEY, String(cinemaSplit));
    } catch (err) {
      // Not remembered without storage.
    }
  };

  _onToggleCinemaChat = () => {
    this.setState((state) => ({ cinemaChatHidden: !state.cinemaChatHidden }));
  };

  componentDidUpdate(prevProps: Props, prevState: State) {
    if (
      prevState.cinema !== this.state.cinema ||
      prevState.cinemaSplit !== this.state.cinemaSplit ||
      prevState.cinemaChatHidden !== this.state.cinemaChatHidden
    ) {
      // The board sizes itself on window resize only; its column just
      // changed without one.
      window.dispatchEvent(new Event("resize"));
    }
    let event = this.props.broadcast.event;
    if (
      getOgsAssignment(event) === getOgsAssignment(prevProps.broadcast.event)
    ) {
      return;
    }
    // The assignment changed (e.g. a link was added): switch boards.
    if (this._releaseOgs) {
      this._releaseOgs();
      this._releaseOgs = null;
    }
    this.setState({ ogsGames: [], ogsError: null, selectedGameKey: null });
    if (this.state.streamLoaded) {
      this._observeOgs();
    }
  }

  _observeOgs = () => {
    let event = this.props.broadcast.event;
    if (hasOgsBoard(event) && !this._releaseOgs) {
      this._releaseOgs = ogsTvSource.observeEvent(event, (game, error) => {
        this.setState((state) => ({
          ogsGames: game ? [game] : [],
          ogsError: error,
          ogsUpdatedAt: game && !error ? Date.now() : state.ogsUpdatedAt,
        }));
      });
    }
  };

  _onOpenLinkForm = () => {
    this.setState({ linkFormOpen: true, linkInput: "", linkError: null });
  };

  _onCancelLinkForm = () => {
    this.setState({ linkFormOpen: false, linkError: null });
  };

  _onChangeLink = (e: Object) => {
    this.setState({ linkInput: e.target.value, linkError: null });
  };

  _onSubmitLink = (e: Object) => {
    e.preventDefault();
    let gameId = parseOgsGameLink(this.state.linkInput);
    let { onAssignOgsLink, broadcast } = this.props;
    if (!gameId) {
      this.setState({
        linkError:
          "Das ist kein OGS-Partielink. Erwartet: https://online-go.com/game/…",
      });
      return;
    }
    this.setState({ linkFormOpen: false, linkError: null });
    if (onAssignOgsLink) {
      onAssignOgsLink(broadcast.event.id, gameId);
    }
  };

  _onRemoveLink = () => {
    let { onAssignOgsLink, broadcast } = this.props;
    if (onAssignOgsLink) {
      onAssignOgsLink(broadcast.event.id, null);
    }
  };

  componentWillUnmount() {
    document.removeEventListener("keydown", this._onKeyDown);
    document.removeEventListener("fullscreenchange", this._onFullscreenChange);
    if (this._releaseOgs) {
      this._releaseOgs();
    }
  }

  _onStreamLoad = () => {
    this.setState({ streamLoaded: true });
    this._observeOgs();
  };

  _onClose = () => {
    if (this._releaseOgs) {
      this._releaseOgs();
      this._releaseOgs = null;
    }
    if (this.state.cinema) {
      this._onExitCinema();
    }
    this.setState((state) => ({
      streamLoaded: false,
      streamKey: state.streamKey + 1,
      selectedGameKey: null,
    }));
  };

  _onSelectBoard = (selectedGameId: number, selectedGame: GameChannel) => {
    let games = [...this.props.broadcast.games, ...this.state.ogsGames];
    let game =
      selectedGame ||
      games.find((candidate) => candidate.id === selectedGameId);
    let selectedGameKey = getGameKey(game);
    let kgsInline = !!(
      this.state.streamLoaded &&
      this.props.currentUser &&
      this.props.actions
    );
    if (game.tvSource === "ogs") {
      if (!this.state.streamLoaded) {
        this._onStreamLoad();
      }
      this.setState({ selectedGameKey });
    } else if (kgsInline) {
      this.setState({ selectedGameKey });
    } else {
      this.props.onJoinGame(selectedGameId);
    }
  };

  // Says honestly how fresh the OGS board is, so a stalled board never looks
  // like a running broadcast.
  _renderOgsStatus() {
    let { ogsGames, ogsError, ogsUpdatedAt } = this.state;
    let game = ogsGames[0];
    if (!game) {
      return null;
    }
    let kind;
    let text;
    if (ogsError) {
      kind = "stale";
      text =
        "Verbindung zu OGS unterbrochen" +
        (ogsUpdatedAt
          ? " – letzter Stand von " +
            new Date(ogsUpdatedAt).toLocaleTimeString("de-DE")
          : "") +
        " (" +
        ogsError +
        ")";
    } else if (game.over) {
      kind = "waiting";
      text =
        "Partie beendet – eine weitere Partie derselben Spieler erscheint automatisch";
    } else if (game.tvLive) {
      kind = "live";
      text = "Live verbunden – Züge erscheinen sofort";
    } else {
      kind = "polling";
      text = "Brett wird alle paar Sekunden abgefragt";
    }
    return (
      <div
        className={"BroadcastCard-ogs-status BroadcastCard-ogs-status-" + kind}>
        {text}
      </div>
    );
  }

  _renderLinkForm() {
    let { linkFormOpen, linkInput, linkError } = this.state;
    if (!linkFormOpen) {
      return (
        <div className="BroadcastCard-link">
          <button
            type="button"
            className="BroadcastCard-link-toggle"
            onClick={this._onOpenLinkForm}>
            OGS-Partielink zuordnen
          </button>
          {this.props.hasManualOgsLink ? (
            <button
              type="button"
              className="BroadcastCard-link-toggle BroadcastCard-link-remove"
              onClick={this._onRemoveLink}>
              Zuordnung entfernen
            </button>
          ) : null}
        </div>
      );
    }
    return (
      <form className="BroadcastCard-link" onSubmit={this._onSubmitLink}>
        <input
          className="BroadcastCard-link-input"
          type="text"
          autoFocus
          placeholder="https://online-go.com/game/…"
          value={linkInput}
          onChange={this._onChangeLink}
        />
        <button className="Button Button-small" type="submit">
          Zuordnen
        </button>
        <button
          className="Button Button-secondary Button-small"
          type="button"
          onClick={this._onCancelLinkForm}>
          Abbrechen
        </button>
        {linkError ? (
          <div className="BroadcastCard-link-error">{linkError}</div>
        ) : null}
      </form>
    );
  }

  render() {
    let {
      broadcast,
      roomsById,
      onOpenReplay,
      currentUser,
      usersByName,
      actions,
      connectionKey,
    } = this.props;
    let { event, games: kgsGames } = broadcast;
    let {
      streamLoaded,
      streamKey,
      selectedGameKey,
      ogsGames,
      ogsError,
    } = this.state;
    let games = [...kgsGames, ...ogsGames];
    let hasOgs = hasOgsBoard(event);
    let selectedGame =
      games.find((game) => getGameKey(game) === selectedGameKey) ||
      games.find((game) => !game.over) ||
      games[0];
    let hasVideo = hasVideoStream(event);
    let kgsInline = !!(currentUser && actions);
    let inline = !!(streamLoaded && (hasOgs || kgsInline));
    let boardTitle;
    if (kgsGames.length && (hasOgs || ogsGames.length)) {
      boardTitle = "Bretter der Übertragung (KGS + OGS)";
    } else if (games.length) {
      let source = ogsGames.length ? "OGS" : "KGS";
      boardTitle =
        games.length === 1
          ? "Brett auf " + source
          : games.length + " Bretter auf " + source;
    } else if (hasOgs) {
      boardTitle = !streamLoaded
        ? hasVideo
          ? "OGS-Brett beim Öffnen des Streams verfügbar"
          : "OGS-Brett verfügbar"
        : event.ogs_game_id
        ? "OGS-Brett wird geladen …"
        : "OGS-Brett erscheint, sobald die Partie läuft";
    } else {
      boardTitle = hasVideo
        ? "Kein KGS-Brett – nur Stream"
        : "Derzeit kein passendes KGS-Brett online";
    }
    let canRenderSelected = !!(
      selectedGame &&
      (selectedGame.tvSource === "ogs" || kgsInline)
    );
    let { cinema, cinemaSplit, cinemaChatHidden } = this.state;
    cinema = cinema && streamLoaded;
    let className =
      "BroadcastCard" +
      (inline ? " BroadcastCard-open" : "") +
      (cinema ? " BroadcastCard-cinema" : "") +
      (cinema && !hasVideo ? " BroadcastCard-cinema-boardonly" : "") +
      (cinema && games.length <= 1 ? " BroadcastCard-cinema-single" : "") +
      (cinema && cinemaChatHidden ? " BroadcastCard-cinema-nochat" : "");
    return (
      <div
        className={className}
        ref={this._setRootRef}
        style={
          cinema && hasVideo
            ? { gridTemplateColumns: cinemaSplit + "% minmax(0, 1fr)" }
            : undefined
        }>
        {cinema ? (
          <div className="BroadcastCard-cinema-bar">
            <div className="BroadcastCard-cinema-title">{event.name}</div>
            {hasVideo ? (
              <label className="BroadcastCard-cinema-split">
                Stream
                <input
                  type="range"
                  min={CINEMA_SPLIT_MIN}
                  max={CINEMA_SPLIT_MAX}
                  value={cinemaSplit}
                  onChange={this._onChangeCinemaSplit}
                />
                Brett
              </label>
            ) : null}
            <button
              className="Button Button-secondary Button-small BroadcastCard-cinema-chat"
              onClick={this._onToggleCinemaChat}>
              {cinemaChatHidden ? "Chat einblenden" : "Chat ausblenden"}
            </button>
            <button
              className="Button Button-small BroadcastCard-cinema-exit"
              onClick={this._onExitCinema}>
              Kinomodus beenden (Esc)
            </button>
          </div>
        ) : null}
        <CalendarEventCard
          key={streamKey}
          event={event}
          onOpenReplay={onOpenReplay}
          onStreamLoad={this._onStreamLoad}
          boardCount={kgsGames.length}
          ogsBoardCount={ogsGames.length}
          now={this.props.now}
        />
        <div className="BroadcastCard-boards">
          {streamLoaded ? (
            <div className="BroadcastCard-controls">
              <button
                className="Button BroadcastCard-close"
                onClick={this._onClose}>
                Übertragung schließen
              </button>
              <button
                className="Button Button-secondary BroadcastCard-cinema-enter"
                onClick={this._onEnterCinema}>
                Kinomodus
              </button>
            </div>
          ) : !hasVideo && (hasOgs || (kgsInline && games.length)) ? (
            // No stream to load: the boards open with their own button.
            <button
              className="Button BroadcastCard-open-boards"
              onClick={this._onStreamLoad}>
              {games.length > 1 ? "Bretter öffnen" : "Brett öffnen"}
            </button>
          ) : null}
          <div className="BroadcastCard-boards-title">{boardTitle}</div>
          {this.props.onAssignOgsLink ? this._renderLinkForm() : null}
          {ogsError && !ogsGames.length ? (
            <div className="TvGamePanel-notice">
              OGS-Brett konnte nicht geladen werden: {ogsError}
            </div>
          ) : null}
          {games.length ? (
            <div className="BroadcastCard-boards-status">
              {getBroadcastStatus(games)}
            </div>
          ) : null}
          {this._renderOgsStatus()}
          {games.length ? (
            <GameList
              games={games}
              roomsById={roomsById}
              showSource
              onSelect={this._onSelectBoard}
            />
          ) : null}
          {inline && canRenderSelected && selectedGame ? (
            <TvGamePanel
              key={getGameKey(selectedGame)}
              game={selectedGame}
              currentUser={currentUser}
              usersByName={usersByName || {}}
              roomsById={roomsById}
              actions={actions}
              connectionKey={connectionKey}
            />
          ) : null}
        </div>
      </div>
    );
  }
}

// @flow
import React, { PureComponent as Component } from "react";
import GameList from "../game/GameList";
import CalendarEventCard from "./CalendarEventCard";
import TvGamePanel from "./TvGamePanel";
import { ogsTvSource } from "../../model/OgsTvSource";
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
};

type State = {
  streamLoaded: boolean,
  streamKey: number,
  selectedGameKey: ?string,
  ogsGames: Array<GameChannel>,
  ogsError: ?string,
};

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
  state = {
    streamLoaded: false,
    streamKey: 0,
    selectedGameKey: null,
    ogsGames: [],
    ogsError: null,
  };

  componentWillUnmount() {
    if (this._releaseOgs) {
      this._releaseOgs();
    }
  }

  _onStreamLoad = () => {
    this.setState({ streamLoaded: true });
    let gameId = this.props.broadcast.event.ogs_game_id;
    if (gameId && !this._releaseOgs) {
      this._releaseOgs = ogsTvSource.observeGame(gameId, (game, error) => {
        this.setState({ ogsGames: game ? [game] : [], ogsError: error });
      });
    }
  };

  _onClose = () => {
    if (this._releaseOgs) {
      this._releaseOgs();
      this._releaseOgs = null;
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
    let hasOgs = !!event.ogs_game_id;
    let selectedGame =
      games.find((game) => getGameKey(game) === selectedGameKey) ||
      games.find((game) => !game.over) ||
      games[0];
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
      boardTitle = streamLoaded
        ? "OGS-Brett wird geladen …"
        : "OGS-Brett beim Öffnen des Streams verfügbar";
    } else {
      boardTitle = "Kein KGS-Brett – nur Stream";
    }
    let canRenderSelected = !!(
      selectedGame &&
      (selectedGame.tvSource === "ogs" || kgsInline)
    );
    return (
      <div className={"BroadcastCard" + (inline ? " BroadcastCard-open" : "")}>
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
            <button
              className="Button BroadcastCard-close"
              onClick={this._onClose}>
              Übertragung schließen
            </button>
          ) : null}
          <div className="BroadcastCard-boards-title">{boardTitle}</div>
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
          {games.length ? (
            <GameList
              games={games}
              roomsById={roomsById}
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

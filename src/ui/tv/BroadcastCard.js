// @flow
import React, { PureComponent as Component } from "react";
import GameList from "../game/GameList";
import CalendarEventCard from "./CalendarEventCard";
import TvGamePanel from "./TvGamePanel";
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
};

type State = {
  streamLoaded: boolean,
  streamKey: number,
  selectedGameId: ?number,
};

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
// CalendarEventCard) plus the KGS boards relayed for it, to watch the game
// on the board next to the commentary. A broadcast without KGS boards
// (e.g. an international tournament shown on YouTube only) just says so.
export default class BroadcastCard extends Component<Props, State> {
  state = { streamLoaded: false, streamKey: 0, selectedGameId: null };

  _onStreamLoad = () => {
    this.setState({ streamLoaded: true });
  };

  _onClose = () => {
    this.setState((state) => ({
      streamLoaded: false,
      streamKey: state.streamKey + 1,
      selectedGameId: null,
    }));
  };

  _onSelectBoard = (selectedGameId: number) => {
    this.setState({ selectedGameId });
  };

  render() {
    let {
      broadcast,
      roomsById,
      onJoinGame,
      onOpenReplay,
      currentUser,
      usersByName,
      actions,
      connectionKey,
    } = this.props;
    let { event, games } = broadcast;
    let { streamLoaded, streamKey, selectedGameId } = this.state;
    let selectedGame =
      games.find((game) => game.id === selectedGameId) ||
      games.find((game) => !game.over) ||
      games[0];
    let inline = !!(streamLoaded && currentUser && actions);
    return (
      <div className={"BroadcastCard" + (inline ? " BroadcastCard-open" : "")}>
        <CalendarEventCard
          key={streamKey}
          event={event}
          onOpenReplay={onOpenReplay}
          onStreamLoad={this._onStreamLoad}
        />
        <div className="BroadcastCard-boards">
          {streamLoaded ? (
            <button
              className="Button BroadcastCard-close"
              onClick={this._onClose}>
              Übertragung schließen
            </button>
          ) : null}
          <div className="BroadcastCard-boards-title">
            {games.length
              ? games.length === 1
                ? "Brett auf KGS"
                : games.length + " Bretter auf KGS"
              : "Kein KGS-Brett – nur Stream"}
          </div>
          {games.length ? (
            <div className="BroadcastCard-boards-status">
              {getBroadcastStatus(games)}
            </div>
          ) : null}
          {games.length ? (
            <GameList
              games={games}
              roomsById={roomsById}
              onSelect={inline ? this._onSelectBoard : onJoinGame}
            />
          ) : null}
          {inline && selectedGame && currentUser && actions ? (
            <TvGamePanel
              key={selectedGame.id}
              game={selectedGame}
              currentUser={currentUser}
              usersByName={usersByName || {}}
              actions={actions}
              connectionKey={connectionKey}
            />
          ) : null}
        </div>
      </div>
    );
  }
}

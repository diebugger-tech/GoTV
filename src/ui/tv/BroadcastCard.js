// @flow
import React, { PureComponent as Component } from "react";
import GameList from "../game/GameList";
import CalendarEventCard from "./CalendarEventCard";
import type { TvBroadcast } from "../../model/tv";
import type { GameChannel, Room, Index } from "../../model";

type Props = {
  broadcast: TvBroadcast,
  roomsById: Index<Room>,
  onJoinGame: (number) => any,
  onOpenReplay?: (string) => any,
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
export default class BroadcastCard extends Component<Props> {
  render() {
    let { broadcast, roomsById, onJoinGame, onOpenReplay } = this.props;
    let { event, games } = broadcast;
    return (
      <div className="BroadcastCard">
        <CalendarEventCard event={event} onOpenReplay={onOpenReplay} />
        <div className="BroadcastCard-boards">
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
              onSelect={onJoinGame}
            />
          ) : null}
        </div>
      </div>
    );
  }
}

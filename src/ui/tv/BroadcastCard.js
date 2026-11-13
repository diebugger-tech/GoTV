// @flow
import React, { PureComponent as Component } from "react";
import GameList from "../game/GameList";
import CalendarEventCard from "./CalendarEventCard";
import type { TvBroadcast } from "../../model/tv";
import type { Room, Index } from "../../model";

type Props = {
  broadcast: TvBroadcast,
  roomsById: Index<Room>,
  onJoinGame: (number) => any,
  onOpenReplay?: (string) => any,
};

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

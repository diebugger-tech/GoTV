// @flow
import React, { PureComponent as Component } from "react";
import GameList from "./game/GameList";
import { CheckboxInput } from "./common";
import {
  getLiveGames,
  sortGamesByStrength,
  getWeakerPlayerRankVal,
  isDanRankVal,
} from "../model/tv";
import type { GameChannel, Room, Index, AppActions } from "../model";

type Props = {
  activeGames: Array<GameChannel>,
  roomsById: Index<Room>,
  actions: AppActions,
};

type State = {
  danOnly: boolean,
};

export default class TvScreen extends Component<Props, State> {
  state = {
    danOnly: false,
  };

  componentDidMount() {
    window.scrollTo(0, 0);
  }

  render() {
    let { activeGames, roomsById, actions } = this.props;
    let { danOnly } = this.state;

    let sorted = sortGamesByStrength(getLiveGames(activeGames));
    let games = danOnly
      ? sorted.filter((game) => {
          let rankVal = getWeakerPlayerRankVal(game);
          return (
            rankVal !== null && rankVal !== undefined && isDanRankVal(rankVal)
          );
        })
      : sorted;

    return (
      <div className="TvScreen">
        <div className="TvScreen-header">
          <div className="TvScreen-title">Live</div>
          <CheckboxInput
            label="Dan only"
            checked={danOnly}
            onChange={this._onDanOnlyChange}
          />
        </div>
        <div className="TvScreen-games">
          <GameList
            games={games}
            roomsById={roomsById}
            onSelect={actions.onJoinGame}
          />
        </div>
      </div>
    );
  }

  _onDanOnlyChange = () => {
    this.setState({ danOnly: !this.state.danOnly });
  };
}

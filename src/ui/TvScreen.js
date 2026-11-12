// @flow
import React, { PureComponent as Component } from "react";
import GameList from "./game/GameList";
import CalendarView from "./tv/CalendarView";
import StreamEmbed from "./tv/StreamEmbed";
import { A, CheckboxInput, TabNav } from "./common";
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
  tvStreamUrl: ?string,
};

type State = {
  activeTabId: string,
  danOnly: boolean,
};

export default class TvScreen extends Component<Props, State> {
  state = {
    activeTabId: "live",
    danOnly: false,
  };

  componentDidMount() {
    window.scrollTo(0, 0);
  }

  render() {
    let { activeGames, roomsById, actions, tvStreamUrl } = this.props;
    let { activeTabId, danOnly } = this.state;

    let sorted = sortGamesByStrength(getLiveGames(activeGames));
    let games = danOnly
      ? sorted.filter((game) => {
          let rankVal = getWeakerPlayerRankVal(game);
          return (
            rankVal !== null && rankVal !== undefined && isDanRankVal(rankVal)
          );
        })
      : sorted;

    let tabs = [
      {
        id: "live",
        label: "Live",
        content: (
          <div className="TvScreen-live">
            <div className="TvScreen-live-header">
              <CheckboxInput
                label="Dan only"
                checked={danOnly}
                onChange={this._onDanOnlyChange}
              />
            </div>
            <GameList
              games={games}
              roomsById={roomsById}
              onSelect={actions.onJoinGame}
            />
          </div>
        ),
      },
      {
        id: "calendar",
        label: "Kalender",
        content: <CalendarView />,
      },
    ];

    return (
      <div className="TvScreen">
        <div className="TvScreen-header">
          <div className="TvScreen-title">Go TV</div>
        </div>
        {tvStreamUrl ? (
          <div className="TvScreen-stream">
            <div className="TvScreen-stream-header">
              <div className="TvScreen-stream-title">Stream</div>
              <A
                button
                className="TvScreen-stream-close"
                onClick={actions.onCloseTvStream}>
                ×
              </A>
            </div>
            <StreamEmbed url={tvStreamUrl} />
          </div>
        ) : null}
        <TabNav
          tabs={tabs}
          activeTabId={activeTabId}
          onSelectTab={this._onSelectTab}
        />
      </div>
    );
  }

  _onSelectTab = (id: string) => {
    this.setState({ activeTabId: id });
  };

  _onDanOnlyChange = () => {
    this.setState({ danOnly: !this.state.danOnly });
  };
}

// @flow
import React, { PureComponent as Component } from "react";
import GameList from "./game/GameList";
import GameListFilter from "./game/GameListFilter";
import GameScreen from "./game/GameScreen";
import { InvariantError } from "../util/error";
import { fetchTvEvents } from "../model/tv";
import type {
  GameChannel,
  GameFilter,
  Room,
  User,
  Index,
  AppActions,
} from "../model";
import type { TvEvent } from "../model/tv";

type Props = {
  currentUser: ?User,
  activeGames: Array<GameChannel>,
  gamesById: Index<GameChannel>,
  watchFilter: GameFilter,
  watchGameId: ?(number | string),
  roomsById: Index<Room>,
  usersByName: Index<User>,
  actions: AppActions,
};

type State = {
  tvEvents: Array<TvEvent>,
};

export default class WatchScreen extends Component<Props, State> {
  static defaultProps: Props;
  state = {
    tvEvents: [],
  };

  componentDidMount() {
    window.scrollTo(0, 0);
    fetchTvEvents()
      .then((tvEvents) => {
        this.setState({ tvEvents });
      })
      .catch((err) => {
        console.warn("[tv] Failed to load live calendar events:", err);
      });
  }

  componentDidUpdate(nextProps: Props) {
    let { watchGameId } = this.props;
    let { watchGameId: nextWatchGameId } = nextProps;
    let activeGame = watchGameId ? this.props.gamesById[watchGameId] : null;
    let nextActiveGame = nextWatchGameId
      ? nextProps.gamesById[nextWatchGameId]
      : null;
    if (!activeGame && nextActiveGame) {
      window.scrollTo(0, 0);
    }
  }

  render() {
    let {
      currentUser,
      activeGames,
      gamesById,
      watchFilter,
      watchGameId,
      roomsById,
      usersByName,
      actions,
    } = this.props;
    let { tvEvents } = this.state;
    if (!currentUser) {
      throw new InvariantError("currentUser is required");
    }
    let activeGame = watchGameId ? gamesById[watchGameId] : null;
    return (
      <div className="WatchScreen">
        {activeGame ? (
          <div className="WatchScreen-game">
            <GameScreen
              game={activeGame}
              usersByName={usersByName}
              roomsById={roomsById}
              tvEvents={tvEvents}
              currentUser={currentUser}
              actions={actions}
            />
          </div>
        ) : (
          <div className="WatchScreen-list">
            <GameListFilter
              games={activeGames}
              roomsById={roomsById}
              filter={watchFilter}
              onChange={actions.onShowGames}
            />
            <GameList
              games={activeGames}
              filter={watchFilter}
              roomsById={roomsById}
              onSelect={actions.onJoinGame}
            />
          </div>
        )}
      </div>
    );
  }
}

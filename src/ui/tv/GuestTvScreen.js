// @flow
import React, { PureComponent as Component } from "react";
import TvScreen from "../TvScreen";
import type { AppState, AppActions } from "../../model";

type Props = {
  appState: AppState,
  actions: AppActions,
  onExit: () => any,
};

const NO_GAMES = [];
const NO_INDEX = {};

// Go TV for viewers without a KGS login: streams, calendar, OGS boards and
// SGF replay need no KGS connection. KGS boards and KGS chat do - they stay
// empty here, and the bar says so.
export default class GuestTvScreen extends Component<Props> {
  render() {
    let { appState, actions, onExit } = this.props;
    return (
      <div className="GuestTv">
        <div className="GuestTv-bar">
          <div className="GuestTv-bar-text">
            Zuschauen ohne Anmeldung · KGS-Bretter und KGS-Chat gibt es nach der
            Anmeldung
          </div>
          <button
            type="button"
            className="Button Button-small GuestTv-bar-login"
            onClick={onExit}>
            Zur Anmeldung
          </button>
        </div>
        <TvScreen
          activeGames={NO_GAMES}
          gamesById={NO_INDEX}
          roomsById={NO_INDEX}
          usersByName={NO_INDEX}
          actions={actions}
          tvStreamUrl={appState.tvStreamUrl}
          tvReplayGameId={null}
        />
      </div>
    );
  }
}

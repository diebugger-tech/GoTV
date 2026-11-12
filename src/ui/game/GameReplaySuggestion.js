// @flow
import React, { PureComponent as Component } from "react";
import { Button } from "../common";

type Props = {
  onReplay: () => any,
  onDismiss: () => any,
};

// Shown in GameScreen once a watched (not played) game ends, offering to
// jump straight to the TV tab's "Nachspielen" view with this exact game -
// using the tree already in memory, no SGF fetch/upload needed.
export default class GameReplaySuggestion extends Component<Props> {
  render() {
    let { onReplay, onDismiss } = this.props;
    return (
      <div className="GameReplaySuggestion">
        <div className="GameReplaySuggestion-label">Partie beendet.</div>
        <div className="GameReplaySuggestion-buttons">
          <Button small primary onClick={onReplay}>
            Nachspielen
          </Button>{" "}
          <Button small secondary onClick={onDismiss}>
            Schließen
          </Button>
        </div>
      </div>
    );
  }
}

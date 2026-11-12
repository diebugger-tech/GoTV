// @flow
import React, { PureComponent as Component } from "react";
import { Button } from "../common";
import { getEmbedUrlForEvent } from "../../model/tv";
import type { TvEvent } from "../../model/tv";

type Props = {
  event: TvEvent,
};

type State = {
  loaded: boolean,
};

const PLATFORM_LABEL = {
  youtube: "YouTube",
  twitch: "Twitch",
  other: "",
};

// Two-click embed: nothing external is loaded until the user clicks.
// If embedding is not possible (channel URL instead of video id, embed
// disabled), only the external link is offered.
export default class StreamEmbed extends Component<Props, State> {
  state = {
    loaded: false,
  };

  render() {
    let { event } = this.props;
    let embedUrl = getEmbedUrlForEvent(event, window.location.hostname);

    if (!embedUrl) {
      return (
        <div className="StreamEmbed">
          <div className="StreamEmbed-notice">
            {PLATFORM_LABEL[event.platform]
              ? "Dieser Stream kann nicht direkt eingebettet werden (" +
                PLATFORM_LABEL[event.platform] +
                ")."
              : "Dieser Stream kann nicht direkt eingebettet werden."}
          </div>
          <a
            className="Button"
            href={event.stream_url}
            target="_blank"
            rel="noopener noreferrer">
            Extern öffnen
          </a>
        </div>
      );
    }

    if (!this.state.loaded) {
      return (
        <div className="StreamEmbed StreamEmbed-placeholder">
          <div className="StreamEmbed-placeholder-text">
            Stream wird über den offiziellen {PLATFORM_LABEL[event.platform]}
            -Player eingebettet. Erst nach Klick wird eine Verbindung zu{" "}
            {PLATFORM_LABEL[event.platform]} aufgebaut.
          </div>
          <div className="StreamEmbed-actions">
            <Button onClick={this._onLoad}>Stream laden</Button>
            <a
              className="Button Button-secondary"
              href={event.stream_url}
              target="_blank"
              rel="noopener noreferrer">
              Extern öffnen
            </a>
          </div>
        </div>
      );
    }

    return (
      <div className="StreamEmbed">
        <div className="StreamEmbed-frame">
          <iframe
            className="StreamEmbed-iframe"
            src={embedUrl}
            title={event.name}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
        <div className="StreamEmbed-external">
          <a
            className="StreamEmbed-external-link"
            href={event.stream_url}
            target="_blank"
            rel="noopener noreferrer">
            Extern öffnen
          </a>
        </div>
      </div>
    );
  }

  _onLoad = () => {
    this.setState({ loaded: true });
  };
}

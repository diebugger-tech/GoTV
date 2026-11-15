// @flow
import React, { PureComponent as Component } from "react";
import { Button } from "../common";
import {
  getEmbedUrlForEvent,
  getEmbedUrlForChannel,
  getStreamUrlInfo,
} from "../../model/tv";
import type { TvEvent, TvChannel, StreamUrlInfo } from "../../model/tv";

type Props = {
  event?: TvEvent,
  channel?: TvChannel,
  url?: string,
  onLoad?: () => any,
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

  _getInfo(): StreamUrlInfo {
    let { event, channel, url } = this.props;
    if (url) {
      return getStreamUrlInfo(url, window.location.hostname);
    }
    if (channel) {
      return {
        platform: channel.platform,
        embedUrl: getEmbedUrlForChannel(channel, window.location.hostname),
        externalUrl: channel.url,
      };
    }
    if (event) {
      return {
        platform: event.platform,
        embedUrl: getEmbedUrlForEvent(event, window.location.hostname),
        externalUrl: event.stream_url,
      };
    }
    return { platform: "other", embedUrl: null, externalUrl: "" };
  }

  _getTitle(): string {
    let { event, channel, url } = this.props;
    if (channel) {
      return channel.name;
    }
    if (event) {
      return event.name;
    }
    return url || "Stream";
  }

  render() {
    let info = this._getInfo();
    let title = this._getTitle();
    let platformLabel = PLATFORM_LABEL[info.platform];

    if (!info.embedUrl) {
      return (
        <div className="StreamEmbed">
          <div className="StreamEmbed-notice">
            {platformLabel
              ? "Dieser Stream kann nicht direkt eingebettet werden (" +
                platformLabel +
                ")."
              : "Dieser Stream kann nicht direkt eingebettet werden."}
          </div>
          <a
            className="Button"
            href={info.externalUrl}
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
            Stream wird über den offiziellen {platformLabel}-Player eingebettet.
            Erst nach Klick wird eine Verbindung zu {platformLabel} aufgebaut.
          </div>
          {this.props.channel ? (
            <div className="StreamEmbed-placeholder-hint">
              Dauerhafter Sender-Link, kein geplanter Termin: sendet der Kanal
              gerade nicht live, zeigt der Player „Gerade keine
              Übertragung&rdquo;. Extern öffnen bleibt in jedem Fall verfügbar.
            </div>
          ) : null}
          <div className="StreamEmbed-actions">
            <Button onClick={this._onLoad}>Stream laden</Button>
            <a
              className="Button Button-secondary"
              href={info.externalUrl}
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
            src={info.embedUrl}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
        <div className="StreamEmbed-external">
          <a
            className="StreamEmbed-external-link"
            href={info.externalUrl}
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
    if (this.props.onLoad) {
      this.props.onLoad();
    }
  };
}

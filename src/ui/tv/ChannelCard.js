// @flow
import React, { PureComponent as Component } from "react";
import StreamEmbed from "./StreamEmbed";
import type { TvChannel } from "../../model/tv";

type Props = {
  channel: TvChannel,
};

const PLATFORM_LABEL = {
  youtube: "YouTube",
  twitch: "Twitch",
};

// A standing entry in the Kalender tab's "Sender" section: always shown,
// independent of any event date (unlike CalendarEventCard). Reuses
// StreamEmbed's two-click embed (see 415b1d7) - a channel always has a
// channel_id, so embedding is always attempted.
export default class ChannelCard extends Component<Props> {
  render() {
    let { channel } = this.props;
    return (
      <div className="ChannelCard">
        <div className="ChannelCard-header">
          <div className="ChannelCard-name">{channel.name}</div>
          <div
            className={
              "ChannelCard-badge ChannelCard-badge-" + channel.platform
            }>
            {PLATFORM_LABEL[channel.platform]}
          </div>
        </div>
        {channel.notes ? (
          <div className="ChannelCard-notes">{channel.notes}</div>
        ) : null}
        <div className="CalendarEvent-board-status">
          Nur Stream · keine KGS-Brettzuordnung hinterlegt
        </div>
        <StreamEmbed channel={channel} />
      </div>
    );
  }
}

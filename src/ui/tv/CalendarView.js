// @flow
import React, { PureComponent as Component } from "react";
import CalendarEventCard from "./CalendarEventCard";
import ChannelCard from "./ChannelCard";
import { Spinner } from "../common";
import {
  validateTvEvent,
  validateTvChannel,
  groupEventsByTime,
  fetchTvEvents,
  fetchTvChannels,
} from "../../model/tv";
import type { TvEvent, TvChannel } from "../../model/tv";

type Props = {
  // When provided, these are used instead of fetching events.json (dev
  // harness / tests), each validated the same way as a fetched entry.
  // events and channels are independent: a caller overriding only one of
  // them still gets an empty list (not a network fetch) for the other,
  // so dev-harness/test instantiation never has a surprise live fetch.
  events?: ?Array<TvEvent>,
  channels?: ?Array<TvChannel>,
  onOpenReplay?: (string) => any,
};

type State = {
  status: "loading" | "ready" | "error",
  events: Array<TvEvent>,
  channels: Array<TvChannel>,
};

const GROUP_LABELS = {
  today: "Live & Today",
  upcoming: "Upcoming",
  past: "Past",
  archive: "Archiv",
};

export default class CalendarView extends Component<Props, State> {
  state = {
    status: "loading",
    events: [],
    channels: [],
  };

  componentDidMount() {
    if (this.props.events || this.props.channels) {
      this._applyProvided();
    } else {
      this._loadEvents();
    }
  }

  _applyProvided = () => {
    let events: Array<TvEvent> = [];
    for (let raw of this.props.events || []) {
      let event = validateTvEvent(raw);
      if (event) {
        events.push(event);
      } else {
        console.log("[tv] Skipping invalid calendar entry:", raw);
      }
    }
    let channels: Array<TvChannel> = [];
    for (let raw of this.props.channels || []) {
      let channel = validateTvChannel(raw);
      if (channel) {
        channels.push(channel);
      } else {
        console.log("[tv] Skipping invalid channel entry:", raw);
      }
    }
    this.setState({ status: "ready", events, channels });
  };

  _loadEvents = () => {
    this.setState({ status: "loading", events: [], channels: [] });
    Promise.all([fetchTvEvents(), fetchTvChannels()])
      .then(([events, channels]) => {
        this.setState({ status: "ready", events, channels });
      })
      .catch((err) => {
        console.warn("[tv] Failed to load calendar events:", err);
        this.setState({ status: "error", events: [], channels: [] });
      });
  };

  render() {
    let { status, events, channels } = this.state;

    if (status === "loading") {
      return (
        <div className="CalendarView CalendarView-loading">
          <Spinner />
        </div>
      );
    }

    if (status === "error") {
      return (
        <div className="CalendarView">
          <div className="CalendarView-error">
            Kalender konnte nicht geladen werden (events.json nicht erreichbar).
            <div>
              <button
                className="Button"
                type="button"
                onClick={this._loadEvents}>
                Erneut versuchen
              </button>
            </div>
          </div>
        </div>
      );
    }

    let groups = groupEventsByTime(events, new Date());

    return (
      <div className="CalendarView">
        {["today", "upcoming", "past"].map((groupKey) => {
          let group = groups[(groupKey: any)];
          if (!group.length) {
            return null;
          }
          return (
            <div className="CalendarView-group" key={groupKey}>
              <div className="CalendarView-group-title">
                {GROUP_LABELS[(groupKey: any)]}
              </div>
              {group.map((event) => (
                <CalendarEventCard
                  key={event.id}
                  event={event}
                  onOpenReplay={this.props.onOpenReplay}
                />
              ))}
            </div>
          );
        })}
        {/* Standing roster, always shown above the Archiv - unlike the
            date-bucketed groups above/below, it never hides when empty. */}
        <div className="CalendarView-group" key="channels">
          <div className="CalendarView-group-title">Sender</div>
          {channels.map((channel) => (
            <ChannelCard key={channel.id} channel={channel} />
          ))}
          {!channels.length ? (
            <div className="CalendarView-channels-empty">
              Keine Sender eingetragen.
            </div>
          ) : null}
        </div>
        {groups.archive.length ? (
          <div className="CalendarView-group" key="archive">
            <div className="CalendarView-group-title">
              {GROUP_LABELS.archive}
            </div>
            {groups.archive.map((event) => (
              <CalendarEventCard
                key={event.id}
                event={event}
                onOpenReplay={this.props.onOpenReplay}
              />
            ))}
          </div>
        ) : null}
        {!events.length ? (
          <div className="CalendarView-empty">Keine Events im Kalender.</div>
        ) : null}
      </div>
    );
  }
}

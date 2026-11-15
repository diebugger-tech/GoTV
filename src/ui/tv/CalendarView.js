// @flow
import React, { PureComponent as Component } from "react";
import CalendarEventCard from "./CalendarEventCard";
import ChannelCard from "./ChannelCard";
import { Spinner } from "../common";
import {
  validateTvEvent,
  validateTvChannel,
  groupEventsByTime,
  groupEventsByRegion,
  fetchTvEvents,
  fetchTvChannels,
} from "../../model/tv";
import type { TvEvent, TvChannel } from "../../model/tv";
import type { Node } from "react";

type Props = {
  // When provided, these are used instead of fetching events.json (dev
  // harness / tests), each validated the same way as a fetched entry.
  // events and channels are independent: a caller overriding only one of
  // them still gets an empty list (not a network fetch) for the other,
  // so dev-harness/test instantiation never has a surprise live fetch.
  events?: ?Array<TvEvent>,
  channels?: ?Array<TvChannel>,
  onOpenReplay?: (string) => any,
  renderEvent?: (TvEvent) => Node,
  renderChannel?: (TvChannel) => Node,
};

type State = {
  status: "loading" | "ready" | "error",
  events: Array<TvEvent>,
  channels: Array<TvChannel>,
  now: number,
};

// The Kalender zone (today+upcoming+past, i.e. everything groupEventsByTime
// has not archived yet) and the Archiv zone are each grouped by region
// instead of by time bucket - see groupEventsByRegion. "Sender" sits
// between the two zones, unchanged and never grouped by region.
const REGION_ORDER = ["de", "intl"];
const REGION_LABELS = {
  de: "Deutschland",
  intl: "International",
};

export default class CalendarView extends Component<Props, State> {
  _refreshTimer: ?IntervalID;
  _mounted: boolean = false;
  state = {
    status: "loading",
    events: [],
    channels: [],
    now: Date.now(),
  };

  componentDidMount() {
    this._mounted = true;
    if (this.props.events || this.props.channels) {
      this._applyProvided();
    } else {
      this._loadEvents();
    }
    this._refreshTimer = setInterval(() => {
      this.setState({ now: Date.now() });
      if (this.props.events || this.props.channels) {
        this._applyProvided();
      } else {
        this._loadEvents();
      }
    }, 60000);
  }

  componentWillUnmount() {
    this._mounted = false;
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
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
    Promise.all([fetchTvEvents(), fetchTvChannels()])
      .then(([events, channels]) => {
        if (this._mounted) {
          this.setState({ status: "ready", events, channels });
        }
      })
      .catch((err) => {
        console.warn("[tv] Failed to load calendar events:", err);
        if (this._mounted && this.state.status !== "ready") {
          this.setState({ status: "error" });
        }
      });
  };

  _renderRegionGroup(
    regionKey: "de" | "intl",
    group: Array<TvEvent>,
    keyPrefix: string
  ) {
    if (!group.length) {
      return null;
    }
    return (
      <div className="CalendarView-group" key={keyPrefix + "-" + regionKey}>
        <div className="CalendarView-group-title">
          {REGION_LABELS[regionKey]}
        </div>
        {group.map((event) =>
          this.props.renderEvent ? (
            <React.Fragment key={event.id}>
              {this.props.renderEvent(event)}
            </React.Fragment>
          ) : (
            <CalendarEventCard
              key={event.id}
              event={event}
              onOpenReplay={this.props.onOpenReplay}
            />
          )
        )}
      </div>
    );
  }

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

    let timeGroups = groupEventsByTime(events, new Date(this.state.now));
    let calendarEvents = [
      ...timeGroups.today,
      ...timeGroups.upcoming,
      ...timeGroups.past,
    ];
    let calendarByRegion = groupEventsByRegion(calendarEvents);
    let archiveByRegion = groupEventsByRegion(timeGroups.archive);

    return (
      <div className="CalendarView">
        {REGION_ORDER.map((regionKey) =>
          this._renderRegionGroup(
            (regionKey: any),
            calendarByRegion[(regionKey: any)],
            "calendar"
          )
        )}
        {/* Standing roster, always shown between the two zones - unlike
            the region groups above/below, it never hides when empty, and
            is never itself grouped by region. */}
        <div className="CalendarView-group" key="channels">
          <div className="CalendarView-group-title">Sender</div>
          {channels.map((channel) => (
            <React.Fragment key={channel.id}>
              {this.props.renderChannel ? (
                this.props.renderChannel(channel)
              ) : (
                <ChannelCard channel={channel} />
              )}
            </React.Fragment>
          ))}
          {!channels.length ? (
            <div className="CalendarView-channels-empty">
              Keine Sender eingetragen.
            </div>
          ) : null}
        </div>
        {REGION_ORDER.map((regionKey) =>
          this._renderRegionGroup(
            (regionKey: any),
            archiveByRegion[(regionKey: any)],
            "archive"
          )
        )}
        {!events.length ? (
          <div className="CalendarView-empty">Keine Events im Kalender.</div>
        ) : null}
      </div>
    );
  }
}

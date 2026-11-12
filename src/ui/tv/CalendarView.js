// @flow
import React, { PureComponent as Component } from "react";
import StreamEmbed from "./StreamEmbed";
import { Spinner } from "../common";
import { formatLocaleDate } from "../../util/date";
import { validateTvEvent, groupEventsByTime } from "../../model/tv";
import type { TvEvent } from "../../model/tv";

type Props = {
  onOpenReplay?: (string) => any,
};

type State = {
  status: "loading" | "ready" | "error",
  events: Array<TvEvent>,
};

const GROUP_LABELS = {
  today: "Live & Today",
  upcoming: "Upcoming",
  past: "Past",
};

const PLATFORM_LABEL = {
  youtube: "YouTube",
  twitch: "Twitch",
  other: "",
};

function formatDateRange(event: TvEvent): string {
  let start = formatLocaleDate(event.date_start);
  if (event.date_end) {
    return start + " – " + formatLocaleDate(event.date_end);
  }
  return start;
}

class CalendarEventCard extends Component<{
  event: TvEvent,
  onOpenReplay?: (string) => any,
}> {
  render() {
    let { event, onOpenReplay } = this.props;
    return (
      <div className="CalendarEvent">
        <div className="CalendarEvent-header">
          <div className="CalendarEvent-name">{event.name}</div>
          {PLATFORM_LABEL[event.platform] ? (
            <div
              className={
                "CalendarEvent-badge CalendarEvent-badge-" + event.platform
              }>
              {PLATFORM_LABEL[event.platform]}
            </div>
          ) : null}
        </div>
        <div className="CalendarEvent-date">{formatDateRange(event)}</div>
        {event.notes ? (
          <div className="CalendarEvent-notes">{event.notes}</div>
        ) : null}
        <StreamEmbed event={event} />
        {event.sgf_url && onOpenReplay ? (
          <div className="CalendarEvent-replay">
            <button
              className="Button Button-secondary Button-small"
              type="button"
              onClick={this._onOpenReplay}>
              SGF nachspielen
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  _onOpenReplay = () => {
    let { event, onOpenReplay } = this.props;
    if (event.sgf_url && onOpenReplay) {
      onOpenReplay(event.sgf_url);
    }
  };
}

export default class CalendarView extends Component<Props, State> {
  state = {
    status: "loading",
    events: [],
  };

  componentDidMount() {
    this._loadEvents();
  }

  _loadEvents = () => {
    this.setState({ status: "loading", events: [] });
    fetch("tv/events.json")
      .then((res) => {
        if (!res.ok) {
          throw new Error("HTTP " + res.status);
        }
        return res.json();
      })
      .then((data) => {
        let rawEvents = data && Array.isArray(data.events) ? data.events : [];
        let events: Array<TvEvent> = [];
        for (let raw of rawEvents) {
          let event = validateTvEvent(raw);
          if (event) {
            events.push(event);
          } else {
            console.log("[tv] Skipping invalid calendar entry:", raw);
          }
        }
        this.setState({ status: "ready", events });
      })
      .catch((err) => {
        console.warn("[tv] Failed to load calendar events:", err);
        this.setState({ status: "error", events: [] });
      });
  };

  render() {
    let { status, events } = this.state;

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
        {!events.length ? (
          <div className="CalendarView-empty">Keine Events im Kalender.</div>
        ) : null}
      </div>
    );
  }
}

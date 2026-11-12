// @flow
import React, { PureComponent as Component } from "react";
import CalendarEventCard from "./CalendarEventCard";
import { Spinner } from "../common";
import {
  validateTvEvent,
  groupEventsByTime,
  fetchTvEvents,
} from "../../model/tv";
import type { TvEvent } from "../../model/tv";

type Props = {
  // When provided, these events are used instead of fetching events.json
  // (dev harness / tests). Entries are validated the same way as fetched ones.
  events?: ?Array<TvEvent>,
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

export default class CalendarView extends Component<Props, State> {
  state = {
    status: "loading",
    events: [],
  };

  componentDidMount() {
    if (this.props.events) {
      this._applyEvents(this.props.events);
    } else {
      this._loadEvents();
    }
  }

  _applyEvents = (rawEvents: Array<TvEvent>) => {
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
  };

  _loadEvents = () => {
    this.setState({ status: "loading", events: [] });
    fetchTvEvents()
      .then((events) => {
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

// @flow
import React, { PureComponent as Component } from "react";
import StreamEmbed from "./StreamEmbed";
import { formatLocaleDate, formatLocaleTime } from "../../util/date";
import { getLiveWindow, hasVideoStream } from "../../model/tv";
import type { TvEvent } from "../../model/tv";

type Props = {
  event: TvEvent,
  onOpenReplay?: (string) => any,
  onStreamLoad?: () => any,
  boardCount?: number,
  now?: number,
};

function getBoardStatus(
  event: TvEvent,
  boardCount: ?number,
  now: number
): string {
  if (boardCount && boardCount > 0) {
    return (
      "Stream + " +
      boardCount +
      (boardCount === 1 ? " KGS-Brett" : " KGS-Bretter") +
      " · Live-Züge und Partiechat"
    );
  }
  if (event.sgf_url) {
    return "SGF-Brett zum Nachspielen verfügbar";
  }
  if (getLiveWindow(event).end.getTime() < now) {
    return "Termin vorbei · kein Live-Brett verfügbar";
  }
  if (event.kgs_room || (event.kgs_players && event.kgs_players.length)) {
    return (
      "KGS-Zuordnung hinterlegt" +
      (boardCount === 0 ? " · derzeit kein passendes Brett online" : "")
    );
  }
  return "Nur Stream · keine KGS-Brettzuordnung hinterlegt";
}

const PLATFORM_LABEL = {
  youtube: "YouTube",
  twitch: "Twitch",
  other: "",
};

export function formatEventDateRange(event: TvEvent): string {
  let start = formatLocaleDate(event.date_start);
  if (event.start) {
    // "start" carries the precise time (with timezone) - shown in the
    // viewer's local time, unlike date_start which is date-only.
    start += " " + formatLocaleTime(event.start);
  }
  if (event.date_end) {
    return start + " – " + formatLocaleDate(event.date_end);
  }
  return start;
}

// A single calendar/live entry: name, date range, optional notes, the
// official stream embed (two-click), and an optional "SGF nachspielen"
// shortcut when the event carries a recorded SGF. Used by both CalendarView
// (Kalender tab) and TvScreen's Live tab (currently-live entries).
export default class CalendarEventCard extends Component<Props> {
  render() {
    let { event, onOpenReplay, boardCount, now } = this.props;
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
        <div className="CalendarEvent-date">{formatEventDateRange(event)}</div>
        {event.notes ? (
          <div className="CalendarEvent-notes">{event.notes}</div>
        ) : null}
        {hasVideoStream(event) || event.sgf_url ? (
          <div
            className={
              "CalendarEvent-board-status" +
              (boardCount ? " CalendarEvent-board-status-linked" : "")
            }>
            {getBoardStatus(
              event,
              boardCount,
              now === undefined ? Date.now() : now
            )}
          </div>
        ) : null}
        <StreamEmbed event={event} onLoad={this.props.onStreamLoad} />
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

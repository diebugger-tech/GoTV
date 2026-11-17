// @flow
import React, { PureComponent as Component } from "react";
import StreamEmbed from "./StreamEmbed";
import { formatLocaleDate, formatLocaleTime } from "../../util/date";
import { getLiveWindow, hasOgsBoard, hasVideoStream } from "../../model/tv";
import type { TvEvent } from "../../model/tv";

type Props = {
  event: TvEvent,
  onOpenReplay?: (string) => any,
  onStreamLoad?: () => any,
  boardCount?: number,
  ogsBoardCount?: number,
  now?: number,
};

function getBoardStatus(
  event: TvEvent,
  boardCount: ?number,
  ogsBoardCount: ?number,
  now: number
): string {
  let kgsCount = boardCount || 0;
  let ogsCount = ogsBoardCount || 0;
  let total = kgsCount + ogsCount;
  if (total > 0) {
    let source = kgsCount && ogsCount ? "" : ogsCount ? "OGS-" : "KGS-";
    let mixed = kgsCount && ogsCount ? " (KGS + OGS)" : "";
    return (
      "Stream + " +
      total +
      (total === 1 ? " " + source + "Brett" : " " + source + "Bretter") +
      mixed +
      // OGS shows its game chat to anonymous clients only after the game.
      " · Live-Züge" +
      (kgsCount ? " und Partiechat" : "")
    );
  }
  if (event.sgf_url) {
    return "SGF-Brett zum Nachspielen verfügbar";
  }
  if (getLiveWindow(event).end.getTime() < now) {
    return "Termin vorbei · kein Live-Brett verfügbar";
  }
  let hasKgs = !!(
    event.kgs_room ||
    (event.kgs_players && event.kgs_players.length)
  );
  if (hasKgs && hasOgsBoard(event)) {
    return "KGS-/OGS-Zuordnungen hinterlegt · derzeit kein Brett geladen";
  }
  if (hasOgsBoard(event)) {
    return (
      "OGS-Zuordnung hinterlegt" +
      (ogsBoardCount === 0 ? " · Brett lädt beim Öffnen des Streams" : "")
    );
  }
  if (hasKgs) {
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
    let { event, onOpenReplay, boardCount, ogsBoardCount, now } = this.props;
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
              (boardCount || ogsBoardCount
                ? " CalendarEvent-board-status-linked"
                : "")
            }>
            {getBoardStatus(
              event,
              boardCount,
              ogsBoardCount,
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

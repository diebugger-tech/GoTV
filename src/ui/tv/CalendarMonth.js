// @flow
import React, { PureComponent as Component } from "react";
import CalendarEventCard from "./CalendarEventCard";
import { hasVideoStream } from "../../model/tv";
import {
  buildMonth,
  getEventsOnDay,
  shiftMonth,
  toDayKey,
} from "../../model/tvCalendar";
import type { TvEvent } from "../../model/tv";
import type { MonthCell } from "../../model/tvCalendar";
import type { Node } from "react";

type Props = {
  events: Array<TvEvent>,
  now: number,
  onOpenReplay?: (string) => any,
  renderEvent?: (TvEvent) => Node,
};

type State = {
  year: number,
  month: number, // 0-based
  selectedKey: string,
};

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
// Rows of tournaments a day cell shows before it says "+N".
const VISIBLE_SLOTS = 3;

function formatMonth(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });
}

function formatDay(dayKey: string): string {
  let [year, month, day] = dayKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Month sheet of the tournament calendar: a multi-day tournament runs as one
// bar across its days; clicking a day lists that day's tournaments below.
export default class CalendarMonth extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    let today = new Date(props.now);
    this.state = {
      year: today.getFullYear(),
      month: today.getMonth(),
      selectedKey: toDayKey(today),
    };
  }

  _onStep = (delta: number) => {
    this.setState((state) => shiftMonth(state.year, state.month, delta));
  };

  _onPrev = () => this._onStep(-1);

  _onNext = () => this._onStep(1);

  _onToday = () => {
    let today = new Date(this.props.now);
    this.setState({
      year: today.getFullYear(),
      month: today.getMonth(),
      selectedKey: toDayKey(today),
    });
  };

  _onSelectDay = (e: Object) => {
    this.setState({ selectedKey: e.currentTarget.getAttribute("data-day") });
  };

  _renderCell(cell: MonthCell, todayKey: string, isWeekStart: boolean) {
    let { selectedKey } = this.state;
    let slots = [];
    for (let slot = 0; slot < VISIBLE_SLOTS; slot++) {
      let entry = cell.entries.find((candidate) => candidate.slot === slot);
      if (!entry) {
        slots.push(<div key={slot} className="CalendarMonth-bar-gap" />);
        continue;
      }
      // The name shows where the bar begins: first day, or Monday.
      let showName = entry.isStart || isWeekStart;
      slots.push(
        <div
          key={slot}
          title={entry.event.name}
          className={
            "CalendarMonth-bar" +
            (hasVideoStream(entry.event) ? " CalendarMonth-bar-video" : "") +
            (entry.isStart ? " CalendarMonth-bar-start" : "") +
            (entry.isEnd ? " CalendarMonth-bar-end" : "")
          }>
          {showName ? entry.event.name : " "}
        </div>
      );
    }
    let hidden = cell.entries.filter((entry) => entry.slot >= VISIBLE_SLOTS)
      .length;
    return (
      <button
        key={cell.key}
        type="button"
        data-day={cell.key}
        onClick={this._onSelectDay}
        className={
          "CalendarMonth-day" +
          (cell.inMonth ? "" : " CalendarMonth-day-outside") +
          (cell.key === todayKey ? " CalendarMonth-day-today" : "") +
          (cell.key === selectedKey ? " CalendarMonth-day-selected" : "")
        }>
        <div className="CalendarMonth-day-number">{cell.day}</div>
        {slots}
        {hidden ? (
          <div className="CalendarMonth-more">+{hidden} weitere</div>
        ) : null}
      </button>
    );
  }

  render() {
    let { events, now, renderEvent, onOpenReplay } = this.props;
    let { year, month, selectedKey } = this.state;
    let todayKey = toDayKey(new Date(now));
    let weeks = buildMonth(events, year, month);
    let dayEvents = getEventsOnDay(events, selectedKey);
    return (
      <div className="CalendarMonth">
        <div className="CalendarMonth-header">
          <button
            type="button"
            className="Button Button-secondary Button-small CalendarMonth-prev"
            aria-label="Vorheriger Monat"
            onClick={this._onPrev}>
            ‹
          </button>
          <div className="CalendarMonth-title">{formatMonth(year, month)}</div>
          <button
            type="button"
            className="Button Button-secondary Button-small CalendarMonth-next"
            aria-label="Nächster Monat"
            onClick={this._onNext}>
            ›
          </button>
          <button
            type="button"
            className="Button Button-secondary Button-small CalendarMonth-today"
            onClick={this._onToday}>
            Heute
          </button>
          <div className="CalendarMonth-legend">
            <span className="CalendarMonth-legend-video">mit Stream</span>
            <span className="CalendarMonth-legend-plain">ohne Stream</span>
          </div>
        </div>
        <div className="CalendarMonth-grid">
          {WEEKDAYS.map((weekday) => (
            <div key={weekday} className="CalendarMonth-weekday">
              {weekday}
            </div>
          ))}
          {weeks.map((week) =>
            week.map((cell, index) =>
              this._renderCell(cell, todayKey, index === 0)
            )
          )}
        </div>
        <div className="CalendarMonth-selected">
          <div className="CalendarMonth-selected-title">
            {formatDay(selectedKey)}
          </div>
          {dayEvents.length ? (
            dayEvents.map((event) =>
              renderEvent ? (
                <React.Fragment key={event.id}>
                  {renderEvent(event)}
                </React.Fragment>
              ) : (
                <CalendarEventCard
                  key={event.id}
                  event={event}
                  onOpenReplay={onOpenReplay}
                  now={now}
                />
              )
            )
          ) : (
            <div className="CalendarMonth-empty">
              Keine Turniere an diesem Tag.
            </div>
          )}
        </div>
      </div>
    );
  }
}

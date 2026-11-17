// @flow
// Month layout for the Go TV calendar: which tournament sits on which day,
// and in which row, so a multi-day tournament reads as one bar.
import type { TvEvent } from "./tv";

const DAYS_PER_WEEK = 7;
const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type MonthEntry = {
  event: TvEvent,
  // Row inside the day cell; the same for all days of one week.
  slot: number,
  isStart: boolean,
  isEnd: boolean,
};

export type MonthCell = {
  key: string, // YYYY-MM-DD, local day
  day: number,
  inMonth: boolean,
  entries: Array<MonthEntry>,
};

function pad(value: number): string {
  return (value < 10 ? "0" : "") + value;
}

export function toDayKey(date: Date): string {
  return (
    date.getFullYear() +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate())
  );
}

// "YYYY-MM-DD" as a local day - not via Date.parse, which reads it as UTC.
function parseDayKey(value: ?string): ?Date {
  let match = typeof value === "string" ? value.match(DAY_KEY_RE) : null;
  return match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : null;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

// First and last day of an event as day keys, or null if unreadable.
function getEventRange(event: TvEvent): ?{ start: string, end: string } {
  let start = parseDayKey(event.date_start);
  if (!start) {
    return null;
  }
  let end = parseDayKey(event.date_end) || start;
  return {
    start: toDayKey(start),
    end: toDayKey(end < start ? start : end),
  };
}

export function shiftMonth(
  year: number,
  month: number,
  delta: number
): { year: number, month: number } {
  let date = new Date(year, month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function getEventsOnDay(
  events: Array<TvEvent>,
  dayKey: string
): Array<TvEvent> {
  let startTime = (event: TvEvent) =>
    event.start ? Date.parse(event.start) || 0 : 0;
  return events
    .filter((event) => {
      let range = getEventRange(event);
      return !!range && range.start <= dayKey && dayKey <= range.end;
    })
    .sort((a, b) => startTime(a) - startTime(b));
}

// One week: every event gets the lowest row that is free on all of its days
// in this week, longest and earliest first, so bars do not jump rows.
function fillWeek(week: Array<MonthCell>, events: Array<TvEvent>) {
  let weekStart = week[0].key;
  let weekEnd = week[DAYS_PER_WEEK - 1].key;
  let ranged = [];
  for (let event of events) {
    let range = getEventRange(event);
    if (range && range.start <= weekEnd && range.end >= weekStart) {
      ranged.push({ event, range });
    }
  }
  ranged.sort(
    (a, b) =>
      (a.range.start < b.range.start
        ? -1
        : a.range.start > b.range.start
        ? 1
        : 0) ||
      (a.range.end > b.range.end ? -1 : a.range.end < b.range.end ? 1 : 0) ||
      (a.event.id < b.event.id ? -1 : 1)
  );
  for (let { event, range } of ranged) {
    let cells = week.filter(
      (cell) => range.start <= cell.key && cell.key <= range.end
    );
    let slot = 0;
    while (
      cells.some((cell) => cell.entries.some((entry) => entry.slot === slot))
    ) {
      slot++;
    }
    for (let cell of cells) {
      cell.entries.push({
        event,
        slot,
        isStart: cell.key === range.start,
        isEnd: cell.key === range.end,
      });
    }
  }
  for (let cell of week) {
    cell.entries.sort((a, b) => a.slot - b.slot);
  }
}

// The weeks (Monday first) that cover the given month; month is 0-based.
export function buildMonth(
  events: Array<TvEvent>,
  year: number,
  month: number
): Array<Array<MonthCell>> {
  let first = new Date(year, month, 1);
  let last = new Date(year, month + 1, 0);
  // getDay(): 0 = Sunday. Days back to the Monday of the first week.
  let lead = (first.getDay() + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
  let day = addDays(first, -lead);
  let weeks = [];
  while (day <= last) {
    let week: Array<MonthCell> = [];
    for (let i = 0; i < DAYS_PER_WEEK; i++) {
      week.push({
        key: toDayKey(day),
        day: day.getDate(),
        inMonth: day.getMonth() === month,
        entries: [],
      });
      day = addDays(day, 1);
    }
    fillWeek(week, events);
    weeks.push(week);
  }
  return weeks;
}

import { buildMonth, getEventsOnDay, shiftMonth, toDayKey } from "./tvCalendar";

function event(id, date_start, date_end, extra = {}) {
  return {
    id,
    name: id,
    date_start,
    date_end,
    platform: "other",
    stream_url: "https://example.org",
    ...extra,
  };
}

describe("buildMonth", () => {
  it("lays out whole weeks from Monday to Sunday around the month", () => {
    // November 2026 starts on a Sunday and ends on a Monday.
    let weeks = buildMonth([], 2026, 10);
    expect(weeks).toHaveLength(6);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0][0]).toMatchObject({ key: "2026-10-26", inMonth: false });
    expect(weeks[0][6]).toMatchObject({
      key: "2026-11-01",
      day: 1,
      inMonth: true,
    });
    expect(weeks[5][0]).toMatchObject({ key: "2026-11-30", inMonth: true });
    expect(weeks[5][6]).toMatchObject({ key: "2026-12-06", inMonth: false });
  });

  it("uses only as many weeks as the month needs", () => {
    // February 2027 starts on a Monday and has 28 days.
    expect(buildMonth([], 2027, 1)).toHaveLength(4);
  });

  it("puts a multi-day tournament on every one of its days in one row", () => {
    let events = [
      event("single", "2026-11-19"),
      event("long", "2026-11-18", "2026-11-20"),
      event("weekend", "2026-11-21", "2026-11-22"),
    ];
    let week = buildMonth(events, 2026, 10)[3]; // 16.-22. November
    let entries = (key) =>
      week
        .find((cell) => cell.key === key)
        .entries.map((e) => [e.event.id, e.slot, e.isStart, e.isEnd]);
    expect(entries("2026-11-17")).toEqual([]);
    expect(entries("2026-11-18")).toEqual([["long", 0, true, false]]);
    expect(entries("2026-11-19")).toEqual([
      ["long", 0, false, false],
      ["single", 1, true, true],
    ]);
    expect(entries("2026-11-20")).toEqual([["long", 0, false, true]]);
    expect(entries("2026-11-21")).toEqual([["weekend", 0, true, false]]);
    expect(entries("2026-11-22")).toEqual([["weekend", 0, false, true]]);
  });

  it("continues a tournament across a week and a month boundary", () => {
    let events = [event("cross", "2026-11-29", "2026-12-02")];
    let weeks = buildMonth(events, 2026, 10);
    let sunday = weeks[4][6];
    let monday = weeks[5][0];
    expect(sunday.entries[0]).toMatchObject({ isStart: true, isEnd: false });
    expect(monday.entries[0]).toMatchObject({ isStart: false, isEnd: false });
    expect(weeks[5][2].entries[0]).toMatchObject({ isEnd: true });
    expect(buildMonth(events, 2026, 11)[0][1].entries[0].event.id).toBe(
      "cross"
    );
  });

  it("ignores events with an unreadable date", () => {
    let weeks = buildMonth([event("bad", "soon")], 2026, 10);
    expect(weeks.every((week) => week.every((c) => !c.entries.length))).toBe(
      true
    );
  });
});

describe("calendar helpers", () => {
  it("lists the events of one day, timed ones in order", () => {
    let events = [
      event("late", "2026-11-22", undefined, {
        start: "2026-11-22T18:00:00+01:00",
      }),
      event("allday", "2026-11-21", "2026-11-22"),
      event("early", "2026-11-22", undefined, {
        start: "2026-11-22T10:00:00+01:00",
      }),
      event("other", "2026-11-23"),
    ];
    expect(getEventsOnDay(events, "2026-11-22").map((e) => e.id)).toEqual([
      "allday",
      "early",
      "late",
    ]);
  });

  it("formats local days and steps across year ends", () => {
    expect(toDayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });
});

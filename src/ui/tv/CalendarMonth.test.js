import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import CalendarMonth from "./CalendarMonth";
import CalendarView from "./CalendarView";

const NOW = new Date(2026, 10, 17, 12).getTime(); // 17 November 2026

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

const EVENTS = [
  event("Kranich", "2026-11-21", "2026-11-22"),
  event("Speed Go", "2026-11-22", undefined, { platform: "twitch" }),
  event("Dezember-Cup", "2026-12-05"),
];

describe("CalendarMonth", () => {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    window.localStorage.clear();
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
  });

  function render(element) {
    act(() => {
      ReactDOM.render(element, container);
    });
  }

  let text = (selector) => container.querySelector(selector).textContent;
  let day = (key) => container.querySelector('[data-day="' + key + '"]');

  it("shows the current month with today marked and tournaments as bars", () => {
    render(<CalendarMonth events={EVENTS} now={NOW} />);
    expect(text(".CalendarMonth-title")).toBe("November 2026");
    expect(container.querySelectorAll(".CalendarMonth-day")).toHaveLength(42);
    expect(day("2026-11-17").className).toContain("CalendarMonth-day-today");
    expect(day("2026-11-21").textContent).toContain("Kranich");
    let sunday = day("2026-11-22");
    expect(sunday.querySelectorAll(".CalendarMonth-bar")).toHaveLength(2);
    expect(sunday.querySelector(".CalendarMonth-bar-video").textContent).toBe(
      "Speed Go"
    );
    expect(text(".CalendarMonth-empty")).toBe("Keine Turniere an diesem Tag.");
  });

  it("lists the tournaments of the day you click", () => {
    render(<CalendarMonth events={EVENTS} now={NOW} />);
    act(() => day("2026-11-22").click());
    expect(day("2026-11-22").className).toContain("CalendarMonth-day-selected");
    expect(text(".CalendarMonth-selected-title")).toBe(
      "Sonntag, 22. November 2026"
    );
    expect(
      Array.from(container.querySelectorAll(".CalendarEvent-name")).map(
        (node) => node.textContent
      )
    ).toEqual(["Kranich", "Speed Go"]);
  });

  it("pages through the months and comes back with Heute", () => {
    render(<CalendarMonth events={EVENTS} now={NOW} />);
    act(() => container.querySelector(".CalendarMonth-next").click());
    expect(text(".CalendarMonth-title")).toBe("Dezember 2026");
    expect(day("2026-12-05").textContent).toContain("Dezember-Cup");
    act(() => container.querySelector(".CalendarMonth-prev").click());
    act(() => container.querySelector(".CalendarMonth-prev").click());
    expect(text(".CalendarMonth-title")).toBe("Oktober 2026");
    act(() => container.querySelector(".CalendarMonth-today").click());
    expect(text(".CalendarMonth-title")).toBe("November 2026");
  });

  it("says how many tournaments a full day hides", () => {
    let many = ["a", "b", "c", "d", "e"].map((id) => event(id, "2026-11-20"));
    render(<CalendarMonth events={many} now={NOW} />);
    expect(
      day("2026-11-20").querySelectorAll(".CalendarMonth-bar")
    ).toHaveLength(3);
    expect(text('[data-day="2026-11-20"] .CalendarMonth-more')).toBe(
      "+2 weitere"
    );
  });

  it("opens the calendar as a month sheet and remembers a switch to the list", () => {
    render(<CalendarView events={EVENTS} channels={[]} />);
    expect(container.querySelector(".CalendarMonth")).not.toBe(null);
    act(() =>
      container.querySelector('.CalendarView-switch [data-view="list"]').click()
    );
    expect(container.querySelector(".CalendarMonth")).toBe(null);
    expect(container.textContent).toContain("Sender");
    ReactDOM.unmountComponentAtNode(container);
    render(<CalendarView events={EVENTS} channels={[]} />);
    expect(container.querySelector(".CalendarMonth")).toBe(null);
  });
});

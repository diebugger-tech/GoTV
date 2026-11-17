import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import TvScreen from "./TvScreen";
import { _resetTvEventsCache } from "../model/tv";

describe("TV live time windows", () => {
  it("offers the cinema example only while there is no real live broadcast", () => {
    let scroll = jest.spyOn(window, "scrollTo").mockImplementation(() => {});
    let container = document.createElement("div");
    document.body.appendChild(container);
    let props = {
      activeGames: [],
      gamesById: {},
      roomsById: {},
      actions: {},
      tvStreamUrl: null,
      tvReplayGameId: null,
    };
    let event = {
      id: "real-live",
      name: "Real broadcast",
      date_start: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
      date_end: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      platform: "twitch",
      stream_url: "https://www.twitch.tv/somechannel",
    };
    try {
      act(() => {
        ReactDOM.render(<TvScreen {...props} events={[]} />, container);
      });
      expect(container.querySelector(".CinemaExample")).not.toBe(null);
      expect(container.textContent).toContain("EM-Finale 2026");
      expect(container.querySelector("iframe")).toBe(null);
      act(() => {
        ReactDOM.unmountComponentAtNode(container);
      });
      act(() => {
        ReactDOM.render(<TvScreen {...props} events={[event]} />, container);
      });
      expect(container.querySelector(".CinemaExample")).toBe(null);
      expect(container.textContent).toContain("Real broadcast");
    } finally {
      ReactDOM.unmountComponentAtNode(container);
      container.remove();
      scroll.mockRestore();
    }
  });
  it("opens a confirmed KGS board with its stream in both Live and Kalender", () => {
    let scroll = jest.spyOn(window, "scrollTo").mockImplementation(() => {});
    let container = document.createElement("div");
    document.body.appendChild(container);
    let release = jest.fn();
    let actions = {
      onObserveTvGame: jest.fn(() => release),
      onJoinGame: jest.fn(),
    };
    let event = {
      id: "mapped",
      name: "Mapped Cup",
      date_start: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
      date_end: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      platform: "twitch",
      stream_url: "https://www.twitch.tv/somechannel",
      kgs_room: "Tournament",
    };
    let game = {
      id: 42,
      type: "tournament",
      event: true,
      roomId: 12,
      moveNum: 1,
      players: { black: { name: "a" }, white: { name: "b" } },
    };
    try {
      act(() => {
        ReactDOM.render(
          <TvScreen
            activeGames={[game]}
            gamesById={{ 42: game }}
            roomsById={{ 12: { id: 12, name: "Tournament" } }}
            actions={actions}
            currentUser={{ name: "viewer" }}
            usersByName={{}}
            tvStreamUrl={null}
            tvReplayGameId={null}
            events={[event]}
          />,
          container
        );
      });
      expect(
        container.querySelector(".CalendarEvent-board-status").textContent
      ).toBe("Stream + 1 KGS-Brett · Live-Züge und Partiechat");
      act(() => container.querySelector(".StreamEmbed-actions button").click());
      expect(container.querySelector(".TvGamePanel")).not.toBe(null);
      expect(actions.onObserveTvGame).toHaveBeenCalledWith(42);
      act(() => container.querySelectorAll(".TabNav-tab")[1].click());
      expect(release).toHaveBeenCalledTimes(1);
      expect(
        container.querySelector(".CalendarEvent-board-status-linked")
      ).not.toBe(null);
      act(() => container.querySelector(".StreamEmbed-actions button").click());
      expect(container.querySelector(".TvGamePanel")).not.toBe(null);
      expect(actions.onObserveTvGame).toHaveBeenCalledTimes(2);
      expect(actions.onJoinGame).not.toHaveBeenCalled();
    } finally {
      ReactDOM.unmountComponentAtNode(container);
      container.remove();
      scroll.mockRestore();
    }
  });

  it("opens and closes a scheduled live window while cached calendar data stays unchanged", async () => {
    let NativeDate = Date;
    let now = new NativeDate("2026-06-15T10:00:00Z").getTime();
    global.Date = class extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [now]));
      }
      static now() {
        return now;
      }
    };
    jest.useFakeTimers();
    let scroll = jest.spyOn(window, "scrollTo").mockImplementation(() => {});
    let container = document.createElement("div");
    let event = {
      id: "soon",
      name: "Soon Cup",
      date_start: "2026-06-15",
      start: "2026-06-15T10:16:00Z",
      duration_minutes: 1,
      platform: "twitch",
      stream_url: "https://www.twitch.tv/somechannel",
    };
    let originalFetch = global.fetch;
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ events: [event] }),
      })
    );
    _resetTvEventsCache();
    try {
      await act(async () => {
        ReactDOM.render(
          <TvScreen
            activeGames={[]}
            gamesById={{}}
            roomsById={{}}
            actions={{}}
            tvStreamUrl={null}
            tvReplayGameId={null}
          />,
          container
        );
      });
      expect(
        container.querySelector(".TvScreen-live-content > .BroadcastCard")
      ).toBe(null);
      now += 60000;
      await act(async () => jest.advanceTimersByTime(60000));
      expect(
        container.querySelector(".TvScreen-live-content > .BroadcastCard")
      ).not.toBe(null);
      now += 17 * 60000;
      await act(async () => jest.advanceTimersByTime(60000));
      expect(
        container.querySelector(".TvScreen-live-content > .BroadcastCard")
      ).toBe(null);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    } finally {
      ReactDOM.unmountComponentAtNode(container);
      scroll.mockRestore();
      jest.clearAllTimers();
      jest.useRealTimers();
      global.Date = NativeDate;
      global.fetch = originalFetch;
      _resetTvEventsCache();
    }
  });
});

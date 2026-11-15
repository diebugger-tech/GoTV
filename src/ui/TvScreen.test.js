import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import TvScreen from "./TvScreen";
import { _resetTvEventsCache } from "../model/tv";

describe("TV live time windows", () => {
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
      expect(container.querySelector(".BroadcastCard")).toBe(null);
      now += 60000;
      await act(async () => jest.advanceTimersByTime(60000));
      expect(container.querySelector(".BroadcastCard")).not.toBe(null);
      now += 17 * 60000;
      await act(async () => jest.advanceTimersByTime(60000));
      expect(container.querySelector(".BroadcastCard")).toBe(null);
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

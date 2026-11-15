import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import BroadcastCard from "./BroadcastCard";

describe("BroadcastCard live status", () => {
  let container;
  let onJoinGame;
  let event = {
    id: "cup",
    name: "Cup",
    date_start: "2026-06-15",
    platform: "twitch",
    stream_url: "https://www.twitch.tv/somechannel",
  };
  let game = {
    id: 42,
    type: "tournament",
    event: true,
    moveNum: 42,
    players: { black: { name: "a" }, white: { name: "b" } },
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    onJoinGame = jest.fn();
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
  });

  function render(games) {
    act(() => {
      ReactDOM.render(
        <BroadcastCard
          broadcast={{ event, games }}
          roomsById={{}}
          onJoinGame={onJoinGame}
        />,
        container
      );
    });
    let status = container.querySelector(".BroadcastCard-boards-status");
    return status ? status.textContent : null;
  }

  it("updates the move from list data and joins only when a board is clicked", () => {
    expect(render([game])).toBe("Partie läuft · Zug 42");
    expect(render([{ ...game, moveNum: 43 }])).toBe("Partie läuft · Zug 43");
    expect(onJoinGame).not.toHaveBeenCalled();
    expect(container.querySelector("iframe")).toBe(null);
    act(() => {
      container.querySelector(".GameList-item").click();
    });
    expect(onJoinGame).toHaveBeenCalledTimes(1);
    expect(onJoinGame).toHaveBeenCalledWith(42);
  });

  it.each([
    [{ moveNum: 0 }, "Partie läuft · Zug 0"],
    [{ moveNum: undefined }, "Partie läuft"],
    [{ moveNum: -1 }, "Partie läuft"],
    [{ paused: true }, "Partie pausiert · Zug 42"],
    [{ adjourned: true, paused: true }, "Partie unterbrochen · Zug 42"],
    [{ over: true, adjourned: true }, "Partie beendet · Zug 42"],
  ])("shows the supplied game state %j", (extra, expected) => {
    expect(render([{ ...game, ...extra }])).toBe(expected);
  });

  it("summarizes parallel boards without counting finished or paused games as running", () => {
    expect(
      render([
        game,
        { ...game, id: 2 },
        { ...game, id: 3, paused: true },
        { ...game, id: 4, adjourned: true },
        { ...game, id: 5, over: true },
      ])
    ).toBe(
      "2 Partien laufen · 1 Partie pausiert · 1 Partie unterbrochen · 1 Partie beendet"
    );
  });

  it("keeps the stream-only fallback without inventing a game status", () => {
    expect(render([])).toBe(null);
    expect(container.textContent).toContain("Kein KGS-Brett – nur Stream");
    expect(onJoinGame).not.toHaveBeenCalled();
  });
});

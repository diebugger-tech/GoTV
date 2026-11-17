import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import BroadcastCard from "./BroadcastCard";
import { parseSgf } from "../../model/sgf";
import { ogsTvSource } from "../../model/OgsTvSource";

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
    jest
      .spyOn(HTMLElement.prototype, "offsetWidth", "get")
      .mockReturnValue(400);
    jest
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockReturnValue(400);
    container = document.createElement("div");
    document.body.appendChild(container);
    onJoinGame = jest.fn();
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    jest.restoreAllMocks();
  });

  function render(games, props = {}) {
    act(() => {
      ReactDOM.render(
        <BroadcastCard
          broadcast={{ event, games }}
          roomsById={{}}
          onJoinGame={onJoinGame}
          {...props}
        />,
        container
      );
    });
    let status = container.querySelector(".BroadcastCard-boards-status");
    return status ? status.textContent : null;
  }

  it("opens the board and chat with the stream and releases the selected board on close", () => {
    let release = jest.fn();
    let actions = {
      onObserveTvGame: jest.fn(() => release),
      onUserDetail: jest.fn(),
      onOpenTvStream: jest.fn(),
    };
    let props = {
      currentUser: { name: "viewer" },
      usersByName: {},
      actions,
    };
    let tree = parseSgf("(;SZ[9];B[aa];W[bb])");
    tree.activeNode = tree.currentLine[1];
    tree.messages[tree.rootNode] = [
      {
        id: 1,
        sender: "fan",
        body: "Eine spannende Partie!",
        date: new Date(),
      },
    ];
    render([{ ...game, tree }], props);
    expect(actions.onObserveTvGame).not.toHaveBeenCalled();
    act(() => container.querySelector(".StreamEmbed-actions button").click());
    expect(container.querySelector("iframe")).not.toBe(null);
    expect(container.querySelector(".TvGamePanel")).not.toBe(null);
    expect(
      container.querySelectorAll(".TvGamePanel-board .Board-stone-black")
    ).toHaveLength(1);
    expect(
      container.querySelectorAll(".TvGamePanel-board .Board-stone-white")
    ).toHaveLength(0);
    expect(container.textContent).toContain("Eine spannende Partie!");
    expect(actions.onObserveTvGame).toHaveBeenCalledWith(42);
    expect(onJoinGame).not.toHaveBeenCalled();
    act(() => container.querySelector(".BoardNav-prev").click());
    expect(container.querySelector(".BoardNav-move").textContent).toBe(
      "Move 0"
    );
    expect(
      container.querySelectorAll(".TvGamePanel-board .Board-stone-black")
    ).toHaveLength(0);
    let nextTree = { ...tree, activeNode: tree.currentLine[2] };
    nextTree.messages = {
      ...tree.messages,
      [nextTree.activeNode]: [
        { id: 2, sender: "fan", body: "Der nächste Zug!", date: new Date() },
      ],
    };
    render([{ ...game, tree: nextTree, moveNum: 2 }], props);
    expect(container.textContent).toContain("Der nächste Zug!");
    expect(container.querySelector(".BoardNav-move").textContent).toBe(
      "Move 0"
    );
    expect(
      container.querySelectorAll(".TvGamePanel-board .Board-stone-black")
    ).toHaveLength(0);
    expect(
      container.querySelectorAll(".TvGamePanel-board .Board-stone-white")
    ).toHaveLength(0);
    act(() => container.querySelector(".BoardNav-next").click());
    expect(
      container.querySelectorAll(".TvGamePanel-board .Board-stone-black")
    ).toHaveLength(1);
    expect(
      container.querySelectorAll(".TvGamePanel-board .Board-stone-white")
    ).toHaveLength(0);
    act(() => container.querySelector(".BoardNav-last").click());
    expect(container.querySelector(".BoardNav-move").textContent).toBe(
      "Move 2"
    );
    expect(
      container.querySelectorAll(".TvGamePanel-board .Board-stone-white")
    ).toHaveLength(1);
    expect(actions.onObserveTvGame).toHaveBeenCalledTimes(1);
    act(() => container.querySelector(".BroadcastCard-close").click());
    expect(release).toHaveBeenCalledTimes(1);
    expect(container.querySelector("iframe")).toBe(null);
  });

  it("switches only the selected board and releases it when leaving the view", () => {
    let releases = [jest.fn(), jest.fn()];
    let actions = {
      onObserveTvGame: jest.fn((id) => releases[id === 42 ? 0 : 1]),
    };
    render([game, { ...game, id: 43 }], {
      currentUser: { name: "viewer" },
      usersByName: {},
      actions,
    });
    act(() => container.querySelector(".StreamEmbed-actions button").click());
    act(() => container.querySelectorAll(".GameList-item")[1].click());
    expect(releases[0]).toHaveBeenCalledTimes(1);
    expect(actions.onObserveTvGame.mock.calls).toEqual([[42], [43]]);
    expect(onJoinGame).not.toHaveBeenCalled();
    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    expect(releases[1]).toHaveBeenCalledTimes(1);
  });

  it("reuses observer player details, game info, users and chat input", () => {
    let actions = {
      onObserveTvGame: jest.fn(() => () => {}),
      onSendGameChat: jest.fn(),
    };
    render(
      [
        {
          ...game,
          tree: parseSgf("(;SZ[9];B[aa])"),
          rules: { size: 9, komi: 6.5 },
          users: ["fan"],
        },
      ],
      {
        currentUser: { name: "viewer" },
        usersByName: { fan: { name: "fan", rank: "2d" } },
        actions,
      }
    );
    act(() => container.querySelector(".StreamEmbed-actions button").click());
    expect(container.querySelector(".GameMoreMenu")).not.toBe(null);
    expect(container.querySelector(".GamePlayersInfo")).not.toBe(null);
    expect(container.querySelector(".GamePlayersInfo").textContent).toContain(
      "0 captures"
    );
    act(() => container.querySelectorAll(".TvGamePanel-tab")[1].click());
    expect(container.querySelector(".GameInfo").textContent).toContain("Komi");
    act(() => container.querySelectorAll(".TvGamePanel-tab")[2].click());
    expect(container.querySelector(".UserList").textContent).toContain("fan");
    act(() => container.querySelectorAll(".TvGamePanel-tab")[0].click());
    let input = container.querySelector(".ChatMessageBar-input");
    expect(input.placeholder).toBe("Type a message...");
    input.value = "Hallo";
    act(() => {
      container
        .querySelector(".ChatMessageBar form")
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        );
    });
    expect(actions.onSendGameChat).toHaveBeenCalledWith("Hallo", 42);
  });

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

  it("opens the boards of a tournament without a stream with their own button", () => {
    let release = jest.fn();
    let tree = parseSgf("(;SZ[9];B[aa])");
    tree.activeNode = tree.currentLine[1];
    let observe = jest
      .spyOn(ogsTvSource, "observeEvent")
      .mockImplementation((tvEvent, listener) => {
        listener({ ...game, id: 7, tvSource: "ogs", tree, moveNum: 1 }, null);
        return release;
      });
    render([], {
      broadcast: {
        event: {
          ...event,
          platform: "other",
          stream_url: "https://example.org/turnier",
          ogs_players: ["Surma", "Ovsiienko"],
        },
        games: [],
      },
    });
    expect(container.querySelector(".StreamEmbed-actions")).toBe(null);
    expect(container.textContent).toContain(
      "Für dieses Turnier ist kein Videostream hinterlegt."
    );
    expect(container.textContent).toContain("Turnierseite öffnen");
    expect(container.textContent).toContain("OGS-Brett verfügbar");
    expect(observe).not.toHaveBeenCalled();
    act(() => container.querySelector(".BroadcastCard-open-boards").click());
    expect(observe).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".TvGamePanel")).not.toBe(null);
    expect(container.querySelector(".BroadcastCard-open-boards")).toBe(null);
    expect(
      container.querySelector(".CalendarEvent-board-status").textContent
    ).toBe("1 OGS-Brett · Live-Züge und Partiechat");
    act(() => container.querySelector(".BroadcastCard-close").click());
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("opens an explicitly linked OGS board anonymously and releases its polling", () => {
    let release = jest.fn();
    let tree = parseSgf("(;SZ[9];B[aa])");
    tree.activeNode = tree.currentLine[1];
    let observe = jest
      .spyOn(ogsTvSource, "observeGame")
      .mockImplementation((gameId, listener) => {
        listener(
          {
            ...game,
            id: gameId,
            tvSource: "ogs",
            sgfUrl: "https://online-go.com/api/v1/games/123/sgf",
            tree,
            moveNum: 1,
          },
          null
        );
        return release;
      });
    render([], {
      broadcast: {
        event: { ...event, ogs_game_id: 123 },
        games: [{ ...game, id: 123 }],
      },
    });
    expect(observe).not.toHaveBeenCalled();
    act(() => container.querySelector(".StreamEmbed-actions button").click());
    expect(observe).toHaveBeenCalledWith(123, expect.any(Function));
    expect(container.querySelector(".TvGamePanel")).toBe(null);
    act(() => container.querySelectorAll(".GameList-item")[1].click());
    expect(container.querySelector(".TvGamePanel")).not.toBe(null);
    expect(container.textContent).toContain("OGS-Partiechat");
    expect(
      Array.from(
        container.querySelectorAll(".GameList-item .TvSourceBadge")
      ).map((badge) => badge.textContent)
    ).toEqual(["KGS", "OGS"]);
    expect(
      container.querySelector(".TvGamePanel-game-header .TvSourceBadge")
        .textContent
    ).toBe("OGS");
    expect(container.textContent).toContain("Noch keine Chatnachrichten.");
    expect(
      container.querySelectorAll(".TvGamePanel-board .Board-stone-black")
    ).toHaveLength(1);
    expect(container.querySelector(".GamePlayersInfo")).not.toBe(null);
    expect(container.querySelector(".ChatMessageBar-input").placeholder).toBe(
      "[Chats disabled]"
    );
    act(() => container.querySelector(".GameMoreMenu-trigger").click());
    expect(
      container
        .querySelector(".GameMoreMenu-dropdown-item[download]")
        .getAttribute("href")
    ).toBe("https://online-go.com/api/v1/games/123/sgf");
    expect(onJoinGame).not.toHaveBeenCalled();
    act(() => container.querySelector(".BroadcastCard-close").click());
    expect(release).toHaveBeenCalledTimes(1);
  });
});

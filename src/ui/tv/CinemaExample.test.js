import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { readFileSync } from "fs";
import CinemaExample from "./CinemaExample";

describe("European final cinema example", () => {
  let container;
  let oldFetch;
  const sgf = readFileSync("public/tv/em-finale-2026.sgf", "utf8");

  beforeEach(() => {
    jest
      .spyOn(HTMLElement.prototype, "offsetWidth", "get")
      .mockReturnValue(600);
    jest
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockReturnValue(600);
    container = document.createElement("div");
    document.body.appendChild(container);
    oldFetch = global.fetch;
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, text: () => Promise.resolve(sgf) })
    );
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    global.fetch = oldFetch;
    jest.restoreAllMocks();
  });

  it("loads the real final only on click and keeps the board when the EGF player is hidden", async () => {
    act(() => {
      ReactDOM.render(<CinemaExample />, container);
    });
    expect(container.textContent).toContain("keine Live-Partie");
    expect(container.textContent).toContain("unabhängig vom Video");
    expect(global.fetch).not.toHaveBeenCalled();
    expect(container.querySelector("iframe")).toBe(null);
    await act(async () => {
      container.querySelector(".StreamEmbed-actions button").click();
    });
    expect(global.fetch.mock.calls.map(([url]) => url)).toEqual([
      "/tv/em-finale-2026.sgf",
    ]);
    expect(container.querySelector("iframe").src).toContain(
      "player.twitch.tv/?channel=europeangofederation&parent=localhost"
    );
    expect(container.querySelector(".SgfReplay-players").textContent).toContain(
      "Andrii Kravets"
    );
    expect(container.querySelector(".SgfReplay-players").textContent).toContain(
      "Ali Jabarin"
    );
    expect(container.querySelector(".BoardNav-move").textContent).toBe(
      "Move 0"
    );
    expect(container.querySelector(".SgfReplay-result")).toBe(null);
    act(() => {
      container.querySelector(".BoardNav-next").click();
    });
    expect(
      container.querySelectorAll(".SgfReplay .Board-stone-black")
    ).toHaveLength(1);
    let board = container.querySelector(".SgfReplay");
    act(() => {
      container.querySelector(".BroadcastCard-cinema-enter").click();
    });
    act(() => {
      container
        .querySelector(".BroadcastCard-cinema-bar .BroadcastCard-video-toggle")
        .click();
    });
    expect(container.querySelector("iframe")).toBe(null);
    expect(container.querySelector(".SgfReplay")).toBe(board);
    expect(container.querySelector(".BoardNav-move").textContent).toBe(
      "Move 1"
    );
    act(() => {
      container.querySelector(".BoardNav-last").click();
    });
    expect(
      Number(
        container
          .querySelector(".BoardNav-move")
          .textContent.replace("Move ", "")
      )
    ).toBeGreaterThan(100);
    expect(container.querySelector(".SgfReplay-result").textContent).toContain(
      "B+R"
    );
    act(() => {
      container
        .querySelector(".BroadcastCard-cinema-bar .BroadcastCard-video-toggle")
        .click();
    });
    expect(container.querySelector("iframe")).not.toBe(null);
    expect(container.querySelector(".SgfReplay")).toBe(board);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the player controls usable when the local recording cannot be loaded", async () => {
    global.fetch.mockImplementation(() =>
      Promise.resolve({ ok: false, status: 404 })
    );
    let warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    act(() => {
      ReactDOM.render(<CinemaExample />, container);
    });
    await act(async () => {
      container.querySelector(".StreamEmbed-actions button").click();
    });
    expect(container.querySelector(".SgfReplay-error")).not.toBe(null);
    expect(container.querySelector(".SgfReplay-error").textContent).toContain(
      "Finalpartie konnte nicht geladen werden"
    );
    expect(container.querySelector("iframe")).not.toBe(null);
    act(() => {
      container
        .querySelector(".BroadcastCard-controls .BroadcastCard-video-toggle")
        .click();
    });
    expect(container.querySelector("iframe")).toBe(null);
    expect(container.querySelector(".BroadcastCard-cinema-enter")).not.toBe(
      null
    );
    warn.mockRestore();
  });
});

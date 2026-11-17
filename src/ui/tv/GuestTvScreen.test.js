import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import GuestTvScreen from "./GuestTvScreen";

describe("GuestTvScreen", () => {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    window.scrollTo = jest.fn();
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ events: [], channels: [] }),
      })
    );
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    delete global.fetch;
  });

  it("shows Go TV without a KGS user and leads back to the login", () => {
    let onExit = jest.fn();
    act(() => {
      ReactDOM.render(
        <GuestTvScreen
          appState={{ tvStreamUrl: null }}
          actions={{ onJoinGame: jest.fn(), onCloseTvStream: jest.fn() }}
          onExit={onExit}
        />,
        container
      );
    });
    expect(container.querySelector(".TvScreen")).not.toBe(null);
    expect(container.textContent).toContain("Zuschauen ohne Anmeldung");
    act(() => container.querySelector(".GuestTv-bar-login").click());
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CalendarEventCard from "./CalendarEventCard";

describe("calendar board availability", () => {
  let event = {
    id: "cup",
    name: "Cup",
    date_start: "2026-11-20",
    platform: "twitch",
    stream_url: "https://www.twitch.tv/somechannel",
  };
  let now = new Date("2026-11-15T12:00:00Z").getTime();

  it.each([
    [{}, {}, "Nur Stream · keine KGS-Brettzuordnung hinterlegt"],
    [
      { kgs_room: "Tournament" },
      { boardCount: 0 },
      "KGS-Zuordnung hinterlegt · derzeit kein passendes Brett online",
    ],
    [{ kgs_players: ["relay"] }, {}, "KGS-Zuordnung hinterlegt"],
    [
      {},
      { boardCount: 2 },
      "Stream + 2 KGS-Bretter · Live-Züge und Partiechat",
    ],
    [
      { ogs_game_id: 123 },
      { boardCount: 0, ogsBoardCount: 0 },
      "OGS-Zuordnung hinterlegt · Brett lädt beim Öffnen des Streams",
    ],
    [
      { ogs_game_id: 123 },
      { boardCount: 0, ogsBoardCount: 1 },
      "Stream + 1 OGS-Brett · Live-Züge und Partiechat",
    ],
    [
      { ogs_game_id: 123 },
      { boardCount: 1, ogsBoardCount: 1 },
      "Stream + 2 Bretter (KGS + OGS) · Live-Züge und Partiechat",
    ],
    [
      { date_start: "2026-11-08" },
      {},
      "Termin vorbei · kein Live-Brett verfügbar",
    ],
    [
      { date_start: "2026-11-08", sgf_url: "https://example.com/game.sgf" },
      {},
      "SGF-Brett zum Nachspielen verfügbar",
    ],
  ])(
    "states board availability before opening the stream",
    (extra, props, expected) => {
      let container = document.createElement("div");
      container.innerHTML = renderToStaticMarkup(
        <CalendarEventCard
          event={{ ...event, ...extra }}
          now={now}
          {...props}
        />
      );
      let status = container.querySelector(".CalendarEvent-board-status");
      expect(status && status.textContent).toBe(expected);
      expect(container.querySelector("iframe")).toBe(null);
    }
  );
});

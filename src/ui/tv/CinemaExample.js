// @flow
import React from "react";
import BroadcastCard from "./BroadcastCard";
import type { TvEvent } from "../../model/tv";

const SGF_URL = (process.env.PUBLIC_URL || "") + "/tv/em-finale-2026.sgf";
const FINAL: TvEvent = {
  id: "cinema-example-ec2026-final",
  name: "EM-Finale 2026 · Andrii Kravets gegen Ali Jabarin",
  date_start: "2026-08-02",
  platform: "twitch",
  stream_url: "https://www.twitch.tv/europeangofederation",
  sgf_url: SGF_URL,
  notes:
    "Der EGF-Kanal zeigt sein aktuelles Programm oder das Offlinebild. " +
    "Das Nachspielbrett zeigt die historische Finalpartie und läuft unabhängig vom Video.",
};

// A permanent example, not a calendar/live event. TvScreen only offers it
// when no real broadcast is available. Neither player nor SGF loads early.
export default function CinemaExample() {
  return (
    <section className="CinemaExample" aria-label="GoTV ausprobieren">
      <div className="CinemaExample-heading">GoTV ausprobieren</div>
      <div className="CinemaExample-label">
        Beispiel · Aufzeichnung, keine Live-Partie
      </div>
      <BroadcastCard
        broadcast={{ event: FINAL, games: [] }}
        roomsById={{}}
        onJoinGame={() => {}}
        recordingUrl={SGF_URL}
      />
      <div className="CinemaExample-source">
        Partie aus dem{" "}
        <a
          href="https://eurogofed.org/archives/egc/en/2026/"
          target="_blank"
          rel="noopener noreferrer">
          offiziellen EGF-Archiv
        </a>
        .
      </div>
    </section>
  );
}

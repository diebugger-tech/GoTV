# ShinKGS — Fork "Go TV"

Fork von jkk/shinkgs (React 16, Flow, react-scripts 3.4.1, SCSS). Web-Client für den
KGS Go Server über die JSON-API. Ziel des Forks: "Go TV" — drei Bausteine:

1. **Live:** starke Partien, die gerade auf KGS laufen, prominent anzeigen und beobachten.
2. **Kalender:** Turniere mit Übertragung (YouTube/Twitch), Stream direkt in der App.
3. **Nachspielen:** SGF einer Profipartie laden und Zug für Zug auf dem ShinKGS-Brett durchgehen.

Referenz-Logik (Rust, funktioniert bereits): `~/Projekte/aktiv/Tiger-s-Mouth`
Nur LOGIK und Datenschemata übernehmen, portiert nach JavaScript/Flow im ShinKGS-Stil.
Kein Rust-Code, keine Rust-Abhängigkeiten.

- `data/tournaments.json` → Kalender-Schema
- `crates/ui/src/tournaments.rs` → Kalender-View-Logik
- `crates/ui/src/chat_panel.rs` → extract_urls / normalize_url
- `crates/go-engine/src/sgf.rs` → SGF-Parser
- `crates/ui/src/sgf_review.rs` → SGF-Nachspiel-Logik

## Regeln

- Branch `feature/go-tv`, ein Commit pro abgeschlossenem Schritt, Conventional Commits.
  **Nicht pushen.**
- Nach jedem Schritt: `yarn lint && yarn flow && yarn build` müssen grün sein.
- Vor jeder Änderung die betroffenen bestehenden Dateien lesen.
- Kein KGS-Logo, kein Branding, das den Fork als offiziellen KGS-Client ausgibt.
  `LICENSE.txt` unverändert lassen.
- Stream-Einbettung nur über offizielle Embed-Player:
  - YouTube: `https://www.youtube-nocookie.com/embed/<id>`
  - Twitch: `player.twitch.tv` mit `parent=<hostname>`
  Kein Scraping, kein Re-Streaming, kein Entfernen von Werbung/Branding.
  Iframe lädt erst nach Klick (Zwei-Klick-Lösung, vorher Platzhalter).
  Wenn Einbetten nicht möglich ist: Button "Extern öffnen" mit
  `target=_blank rel=noopener`.

## Setup (exakt, einmalig — Node 24 via Nix)

Node kommt aus dem Nix-Store (read-only), yarn fehlt systemweit. Einmalig ausführen:

```bash
corepack prepare yarn@1.22.22 --activate
printf 'exec corepack yarn "$@"\n' > ~/.local/bin/yarn && chmod +x ~/.local/bin/yarn
cd ~/Projekte/aktiv/shinkgs && yarn install
```

- Der Shim in `~/.local/bin/yarn` hat **kein Shebang** (kein `!` — zsh History Expansion);
  zsh/sh führen die Datei bei ENOEXEC selbst aus.
- `packageManager: yarn@1.22.22` in package.json → corepack wählt die Version.

## Befehle

| Befehl | Zweck |
|---|---|
| `yarn start` | Dev-Server (Port 3000) |
| `PORT=3100 yarn start` | Port 3000 belegt → anderer Port |
| `CI=true yarn start` | nicht-interaktiver Kontext ohne TTY (sonst beendet sich start.js beim stdin-Ende) |
| `yarn build` | Production-Build → `build/` |
| `yarn lint` | eslint src/ |
| `yarn flow` | flow check |
| `yarn test` | react-scripts test --env=jsdom |

Gate nach jedem Schritt: `yarn lint && yarn flow && yarn build`

## Build-Kette — bekannte Punkte

- react-scripts 3.4.1 (webpack 4) braucht auf Node 17+ `NODE_OPTIONS=--openssl-legacy-provider`
  (md4-Hash). Ist in den start/build-Scripts bereits eingebaut (cross-env).
- node-sass 4.14.1 → `sass` (dart-sass) 1.77.8 ersetzt (baut nicht auf Node 24).
  SCSS in `src/css/` kompiliert **unverändert**. dart-sass meldet Deprecation-Warnings
  (Slash-Division, mixed declarations, z.B. `_board.scss:73-74`) — unschädlich, bewusst
  nicht angefasst (minimal-invasiv).
- Kein React-/react-scripts-Upgrade in Phase 0.

## Architektur — Go-TV-Modul

- `src/model/tv.js` — pure Logik: Sortierung nach Spielstärke, Event-/URL-Parsing-Helfer.
- `src/ui/TvScreen.js` — TV-Tab mit Bereichen Live / Kalender / Nachspielen (TabNav).
- `src/util/urls.js` — extract_urls/normalize_url (Port von chat_panel.rs).
- `src/model/sgf.js` — SGF-Parser (Port von sgf.rs, erweitert um Varianten) → GameTree.
- `public/tv/events.json` — Event-Daten (fetch beim Öffnen des TV-Tabs).
- Nav-Punkt "tv": types.js (NavOption) + index.js (isValidNav) + meta/Nav.js + Main.js.
- Stream-Öffnen aus dem Chat: dispatch `TV_OPEN_STREAM` {url} → nav "tv" → TvScreen zeigt
  Zwei-Klick-Platzhalter; Embed-Builder in `src/ui/tv/StreamEmbed.js`.

## Roadmap

- [x] Phase 0 — Lauffähig: yarn via corepack, dart-sass, NODE_OPTIONS; Login-Screen + Build grün
- [x] Phase 1 — Bestandsaufnahme (Abschnitt "Bestand")
- [x] Phase 2 — Go TV: Live-Top-Partien
- [x] Phase 3 — Turnierkalender
- [x] Phase 4 — Stream-Links im Chat
- [x] Phase 5 — Nachspielen (SGF-Replay) (Commit be3f25d)
- [ ] Phase 6 — offene Roadmap, Reihenfolge:
      (a) events.json von GitHub laden,
      (b) YouTube Data API (Key/Quota/Datenschutz vorher klären),
      (c) KataGo nur Replay/Beobachter (braucht Backend-Dienst)

## Bestand (Phase 1)

### Wie kommen Spiellisten an?
- KgsClient pollt per XHR-Long-Polling die KGS-JSON-API (`GET _apiUrl`), Nachrichten →
  `AppActions.onReceiveServerMessages` → `AppStore.dispatch` → `handleMessage`
  (Router in `src/model/index.js`) → `handleGameMessage` (`src/model/game/message.js`).
- Nach `LOGIN_SUCCESS` sendet `AppActions.onLoginSuccess` `GLOBAL_LIST_JOIN_REQUEST`
  für "ACTIVES" und "CHALLENGES".
- Antworten `GAME_LIST` / `GLOBAL_GAMES_JOIN` / `ROOM_JOIN` mit `msg.games` →
  `parseGameChannel` je Spiel → `gamesById`. `handleGameMessage` baut daraus
  `activeGames` (type ≠ challenge, kein deletedTime) und `challenges`, sortiert via
  `sortGames` (`display.js`: Event zuerst, nicht-adjourned zuerst, dann nach Rank).
- Spieler landen zusätzlich in `usersByName` (`parseUser` → `rankVal` via
  `parseRankVal`: "3d"→3, "5k"→-5, "1p"→11, "?"→-9999). Dan: rankVal 1–9, Pro: 11+.

### Wie wird eine Partie beobachtet?
- `WatchScreen` zeigt `GameList` (activeGames, gefiltert) — Klick → `actions.onJoinGame(game.id)`.
- `onJoinGame`: dispatch `GAME_JOIN` + `WATCH_GAME {gameId}`, nav → "watch",
  sendet `JOIN_REQUEST {channelId}`. KGS liefert dann `GAME_JOIN`/`GAME_UPDATE`/
  `GAME_STATE` mit `sgfEvents`; `parseGameChannel` baut den `tree` (`parseSgfEvents`),
  `computeGameNodeStates` rechnet Brett/Gefangene/Markup pro Knoten.
- `watchGameId` → `GameScreen` (`BoardContainer` liest `tree.computedState[tree.currentNode]`,
  `BoardNav` navigiert `currentNode`).

### Was macht playback.js?
- Nur Stub: verarbeitet `PLAYBACK_ADD` (Feld `playbacks` im AppState), Rest TODO
  (PLAYBACK_DATA, SETUP, SEEK, ERROR, DELETE). KGS-Server-Playback ist also NICHT
  implementiert. Für Phase 5 wird stattdessen der lokale GameTree genutzt:
  SGF parsen → GameTree bauen → Board rendern — ohne Server.

### Kann das Brett einen Spielbaum ohne Server-Verbindung anzeigen?
- Ja. `Board`/`BoardContainer` lesen ausschließlich `game.tree` (computedState,
  currentNode, currentLine). Ein Objekt `{tree}` genügt — kein Netzwerk nötig.
  Voraussetzungen: `tree.nodes` als GameNode-Map, rootNode/activeNode/currentNode/
  currentLine gesetzt, `computedState` via `computeGameNodeStates(tree, nodeId)`.
  `BoardNav` bringt bereits Slider (rc-slider), vor/zurück, Pfeiltasten, Zugnummer.
  ABER: `GameScreen` selbst braucht currentUser + actions (Server) — fürs Replay
  wird eine eigene View gebaut, die BoardContainer + BoardNav direkt nutzt.

### Wo hängt man einen neuen Navigationspunkt "TV" ein?
1. `NavOption` in `src/model/types.js` um `"tv"` erweitern.
2. `isValidNav` in `src/model/index.js` um `"tv"` erweitern (URL-Sync).
3. Tab in `src/ui/meta/Nav.js` (Muster: MainNav-item + A onClick → `actions.onChangeNav("tv")`).
4. Content-Branch in `src/ui/Main.js` (neuer Screen `TvScreen`).
5. Nav-URL-Sync läuft automatisch über `AppActions.onChangeNav` (history push) und
   `App._syncNav`/`isValidNav`.

## Bekannte Altlasten

- `src/App.test.js` crasht in jsdom (indexedDB fehlt) — vorbestehend, nicht Teil des Gates;
  neue Tests gezielt laufen lassen: `CI=true yarn test --watchAll=false --testPathPattern="src/(model|util)"`.
- Dev-Server ohne TTY beendet sich nach dem Banner still (start.js: stdin-Ende) →
  Hintergrundstart nur mit `CI=true`.
- Port 3000 ist auf diesem Rechner dauerhaft fremdbelegt → Dev-Server mit `PORT=3100`.

## Offene Roadmap (Phase 6, nur dokumentiert)

- [ ] **(a) events.json von GitHub laden:** Community pflegt Events per PR,
  App lädt `raw.githubusercontent.com/<org>/<repo>/main/tv/events.json`
  (CORS-fähig). Vorab klären: Repo-Besitzer, Review-Prozess, Fallback
  auf das lokale `public/tv/events.json`, wenn der Fetch fehlschlägt.
- [ ] **(b) YouTube Data API — automatische Erkennung von Live-Übertragungen:**
  Live-Streams bekannter Go-Kanäle automatisch im Kalender anzeigen.
  Vorab klären: API-Key (wer betreibt ihn? Server-seitig nötig, Key gehört
  NICHT in den Client), Quota (10k Units/Tag Default), Datenschutz
  (welche Daten werden abgefragt und wo verarbeitet?).
- [ ] **(c) KataGo-Analyse:** nur im Replay- und Beobachter-Modus, NIE in
  eigener laufender Partie. Braucht einen Backend-Dienst (Engine läuft
  nicht im Client). Vorab klären: lokal (WASM) vs. Server,
  Engine-Lebenszyklus, UI für die Analyse-Anzeige.

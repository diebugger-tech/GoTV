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
- Protokoll-Hygiene (Desktop-Proxy): Clients außerhalb des Browsers gehen über den
  regulären Endpoint `/json/access`, nicht über eine ausgehebelte Browser-Prüfung.
  Details: Abschnitt "Proxy-Begründung" unten.

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
| `yarn build` | Production-Build (Web) → `build/` |
| `yarn lint` | eslint src/ |
| `yarn flow` | flow check |
| `yarn test` | react-scripts test --env=jsdom |
| `http://localhost:3100/#tv-dev` | Dev-Harness: kompletter TV-Flow ohne KGS-Login (nur Development) |
| `desktop/install.sh` | Desktop-App bauen + installieren (siehe Desktop-Abschnitt) |

Gate nach jedem Schritt: `yarn lint && yarn flow && yarn build`

## Build-Kette — bekannte Punkte

- react-scripts 3.4.1 (webpack 4) braucht auf Node 17+ `NODE_OPTIONS=--openssl-legacy-provider`
  (md4-Hash). Ist in den start/build-Scripts bereits eingebaut (cross-env).
- node-sass 4.14.1 → `sass` (dart-sass) 1.77.8 ersetzt (baut nicht auf Node 24).
  SCSS in `src/css/` kompiliert **unverändert**. dart-sass meldet Deprecation-Warnings
  (Slash-Division, mixed declarations, z.B. `_board.scss:73-74`) — unschädlich, bewusst
  nicht angefasst (minimal-invasiv).
- Kein React-/react-scripts-Upgrade in Phase 0.
- `BUILD_PATH` wird von react-scripts 3.4.1 ignoriert: die Desktop-Variante baut mit
  eigener `REACT_APP_API_URL` und verschiebt danach `build/` → `build-desktop/`
  (siehe `desktop/install.sh`). Ein späterer einfacher `yarn build` erzeugt `build/`
  neu mit der Standard-Env und lässt `build-desktop/` unberührt — beide Konfigurationen
  nicht verwechseln.

## Desktop-App (GNOME, lokal)

Lokale Installation als Desktop-App (eigenes Fenster, kein Browser-Chrome, kein
sudo, kein Electron). Dateien unter `desktop/`:

- **`goTV_local.py`** — Python-Stdlib-`ThreadingHTTPServer`, bindet NUR an
  `127.0.0.1:8788` (Port per `GOTV_PORT`/`--port`). Liefert `build-desktop/` aus
  (SPA-Fallback auf `index.html` für History-Routen wie `/tv`, `/watch`;
  Pfad-Traversal durch `normpath` + `startswith`-Check auf das Build-Verzeichnis
  blockiert). `/igs-bridge` ist reserviert für eine künftige IGS-Quelle und
  antwortet bewusst 501, bis die IGS-Nutzungsbedingungen geprüft sind (siehe
  TV-Quellen-Grundsatz unten).
- **`launch-gotv`** — Health-Check (curl gegen den Server, bounded loop), startet
  den Server, erkennt einen Chromium-Browser (nativ → Flatpak → Snap, feste
  Reihenfolge chromium/chrome/brave/edge) und öffnet ihn mit
  `--app=http://127.0.0.1:8788 --user-data-dir=~/.local/share/gotv/profile
  --class=gotv` (eigenes Profil, kein Browser-Chrome).
- **`gotv.desktop`** — Desktop-Eintrag, `StartupWMClass=gotv` (passend zu
  `--class`). `Name`/`Icon` sind aktuell Platzhalter "Go TV" — siehe "Offene
  Entscheidungen" unten, Name/Icon sind noch nicht final.
- **`install.sh` / `uninstall.sh`** — user-scoped (kein sudo): baut
  `build-desktop/`, installiert Launcher nach `~/.local/bin`, `.desktop` nach
  `~/.local/share/applications`, Icon nach
  `~/.local/share/icons/hicolor/512x512/apps`; aktualisiert Desktop-DB/Icon-Cache,
  falls vorhanden. `uninstall.sh` stoppt den Server (`pkill -f` auf das
  Server-Skript) und lässt Nutzerdaten (Browser-Profil, Logs) bewusst stehen.

### Proxy-Begründung (Commits 05c4082, 98655e7, 38cab76)

**Ursprünglich** (05c4082) lief der lokale Proxy gegen den Browser-Endpoint
`/json-cors/access` und entfernte den Origin-Header, um KGS' Origin-Whitelist zu
umgehen. Funktionierte, war aber der falsche Weg: `/json-cors/access` ist für
Browser-Clients mit Origin-Prüfung gedacht, nicht für Nicht-Browser-Clients wie
diesen lokalen Proxy.

**Korrektur (98655e7):** Ziel ist jetzt der reguläre Endpoint `/json/access` für
Clients außerhalb des Browsers — denselben, den auch Tiger's Mouth nutzt
(`REACT_APP_API_URL=/json/access`). Gemessen (curl, siehe Kopfkommentar in
`goTV_local.py`):

| Request | Ergebnis |
|---|---|
| POST, `Origin: https://shin.gokgs.com` | 200 |
| POST, `Origin: http://127.0.0.1:8788` | 403 |
| POST, kein Origin-Header | 200 + Cookie |

Ergebnis: **auch** `/json/access` prüft die Origin-Whitelist, sobald ein
Origin-Header gesetzt ist. Den Origin-Header wie ursprünglich angefragt einfach
durchzureichen würde den Login wieder auf 403 brechen. Der Proxy entfernt den
Origin-Header deshalb weiterhin — das ist jetzt aber eine gemessene Notwendigkeit
des richtigen (Nicht-Browser-)Endpoints, nicht mehr das Umgehen einer
Browser-Prüfung über den falschen (Browser-)Endpoint. Cookies (`JSESSIONID`,
`Path=/json` passt zur lokalen Route `/json/access`) und Long-Polling
(GET ohne Read-Timeout) laufen unverändert durch.

**Absicherung (38cab76), DNS-Rebinding-Guard** — vor jeder Anfrage
(`_request_allowed`):
- `Host`-Header muss exakt `127.0.0.1:8788` oder `localhost:8788` sein, sonst
  403 "Forbidden host".
- Ist ein `Origin`-Header gesetzt, muss er exakt `http://127.0.0.1:8788` bzw.
  `http://localhost:8788` sein; ein fehlender Origin-Header ist erlaubt
  (server-seitige Requests ohne Origin). Sonst 403 "Forbidden origin".

Mit curl getestet: fremder Host → 403, fremder Origin → 403, lokale
Host/Origin-Kombinationen (inkl. ohne Origin) → normal verarbeitet.
QA-Screenshots/Belege: `~/.hermes/cache/scratch/go-tv-qa/`.

Kleiner offener Rest (kosmetisch, keine Funktion): die Fehlermeldung in
`main()` bei fehlendem Build verweist noch auf den alten Pfad
`.../json-cors/access` statt `/json/access` (Zeile ~294 in `goTV_local.py`).

## Architektur — Go-TV-Modul

- `src/model/tv.js` — pure Logik: Sortierung nach Spielstärke, Event-/URL-Parsing-Helfer.
- `src/ui/TvScreen.js` — TV-Tab mit Bereichen Live / Kalender / Nachspielen (TabNav).
- `src/util/urls.js` — extract_urls/normalize_url (Port von chat_panel.rs).
- `src/model/sgf.js` — SGF-Parser (Port von sgf.rs, erweitert um Varianten) → GameTree;
  OGS nutzt `parseSgf(..., {skipI: false})` für Standard-SGF-Koordinaten.
- `src/model/OgsTvSource.js` — anonyme OGS-REST-/SGF-Adapter zu GameChannel, 10-s-Polling
  nur für `ogs_game_id` aus einem Kalender-Event und nur bei geöffnetem Stream.
- `src/ui/tv/TvGamePanel.js` — KGS-/OGS-Brett mit lokaler BoardNav; Zurückspulen bleibt
  bei Live-Updates erhalten, "letzter Zug" kehrt zum automatischen Folgen zurück.
- `public/tv/events.json` — Event-Daten (fetch beim Öffnen des TV-Tabs).
- Nav-Punkt "tv": types.js (NavOption) + index.js (isValidNav) + meta/Nav.js + Main.js.
- Stream-Öffnen aus dem Chat: dispatch `TV_OPEN_STREAM` {url} → nav "tv" → TvScreen zeigt
  Zwei-Klick-Platzhalter; Embed-Builder in `src/ui/tv/StreamEmbed.js`.
- Dev-Harness: `src/index.js` enthält einen NODE_ENV-gegateten Block (`#tv-dev`), der den
  TV-Tab mit simulierten Daten rendert (5 Fake-Partien, synthetische Kalender-Events,
  Chat-Messages mit Stream-Links, Replay). Er wird im Production-Build von terser
  weggefaltet — nach jedem Build prüfen:
  `grep -rl "GO-TV-DEV-HARNESS" build/` darf nichts finden. Deshalb auch
  `GENERATE_SOURCEMAP=false` im build-Script (sonst stünde der Quelltext in den .map-Dateien).
  `public/tv/demo.sgf` ist die Demo-Fixture für den Harness und `sgf_url`.

## TV-Quellen-Grundsatz (Live / Watch / TV-Kalender)

Policy, von dir als "Stufe 1" bezeichnet:

- **Watch** (bestehend, unverändert) bleibt für ALLE laufenden KGS-Partien reserviert
  — wie vor diesem Fork.
- **TV → Live** ist NICHT "irgendeine starke Partie", sondern ausschließlich für
  Übertragungen:
  (a) KGS-Partien mit `game.event === true` (offiziell übertragene Turnierpartien),
  (b) Kalender-Events (Phase 3), die gerade live sind.
  Alle anderen aktiven KGS-Partien gehören nur in "Watch".
- **TvSource-Interface:** Implementiert sind `KgsTvSource` und `OgsTvSource`.
  OGS liefert ausschließlich Bretter zu expliziten `ogs_game_id`-Feldern im Kalender,
  niemals eine Rangliste beliebiger laufender OGS-Partien. `IgsTvSource` (Pandanet/IGS)
  ist absichtlich BLOCKIERT — `/igs-bridge` in `goTV_local.py` antwortet 501, bis die
  IGS-Nutzungsbedingungen geprüft sind (Kontakt laut Pandanet-FAQ:
  `developer@pandanet-igs.com`).

### Umsetzungsstand
- [x] Schritt 1: `event`-Flag ist im KGS-Protokoll vorhanden und wird bereits
      eingelesen (verifiziert, nicht neu gebaut).
- [x] Schritt 2: Live-Filter auf `game.event === true` + Kalender-Live.
      `KgsTvSource.getLiveBroadcasts` (`src/model/TvSource.js`), `TvScreen.js`
      zeigt nur noch `broadcasts` — kein "alle aktiven Partien"-Fallback mehr,
      "Dan only"-Filter nirgends mehr im Code (verifiziert per grep, nicht nur
      behauptet).
- [x] Schritt 3: Leerzustand "Gerade keine Übertragung" + nächstes Kalender-Event
      + "Zum Kalender"-Button, wenn nichts live ist (`TvScreen.js:124-141`).
- [x] Schritt 4: Stream neben dem Brett via `kgs_room`/`kgs_players`
      (`tv.js` `getLiveEventForGame`, von `TvSource` genutzt).
- [x] Schritt 5: "Nachspielen"-Vorschlag nach Partieende
      (`GameReplaySuggestion.js` + `GameScreen.js:347`, an `isGameOverNode`).
- [x] `TvSource`-Interface mit `KgsTvSource` als eigene Abstraktion
      herausgelöst (`src/model/TvSource.js`, `kgsTvSource`) — `TvScreen` liest
      nicht mehr direkt auf KgsClient-Daten.

## Roadmap

- [x] Phase 0 — Lauffähig: yarn via corepack, dart-sass, NODE_OPTIONS; Login-Screen + Build grün
- [x] Phase 1 — Bestandsaufnahme (Abschnitt "Bestand")
- [x] Phase 2 — Go TV: Live-Top-Partien (Rang-Sortierung/"Dan only") — wird durch
      den TV-Quellen-Grundsatz oben teilweise ersetzt (Schritt 2 offen)
- [x] Phase 3 — Turnierkalender
- [x] Phase 4 — Stream-Links im Chat
- [x] Phase 5 — Nachspielen (SGF-Replay) (Commit be3f25d)
- [x] Phase 6 — nur Dokumentation (siehe "Offene Roadmap" unten)
- [x] Desktop-Paket (GNOME): lokaler Server, Proxy-Korrektur, DNS-Rebinding-Guard,
      Launcher/Icon/.desktop, install.sh/uninstall.sh
      (Commits 05c4082, 9f9dc18, 86a901e, 41fed13, 1959ce5, 98655e7, 38cab76)
- [ ] TV-Quellen-Grundsatz, Schritte 2-5 (siehe Abschnitt oben) — NICHT gebaut
- [ ] events.json Schema v2: `channel`-Feld (YouTube Channel-ID / Twitch-Login),
      Live-Kanal-Embeds (`embed/live_stream?channel=…`,
      `player.twitch.tv/?channel=…`), Archiv nach 14 Tagen, die 4 alten
      Platzhalter-Events entfernen, Remote-Fetch von GitHub mit 1h-Cache
      (lokale Datei bleibt Offline-Fallback) — angekündigt, NICHT gebaut
      (Stand events.json, Commit a0b9bcc: noch altes Schema + 4 Platzhalter
      + 1 Beispiel-Event)
- [ ] App-Name + Icon: Name noch offen, bestimmt Icon-Design und Desktop-Branding

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
- Production-Build ohne Sourcemaps (`GENERATE_SOURCEMAP=false`) — nötig, damit der
  Dev-Harness-Quelltext nicht über sourcesContent im Build landet.

## Offene Roadmap (Phase 6, nur dokumentiert)

- [ ] **(a) events.json von GitHub laden:** Community pflegt Events per PR,
  App lädt `raw.githubusercontent.com/<org>/<repo>/main/tv/events.json`
  (CORS-fähig). Vorab klären: Repo-Besitzer, Review-Prozess, Fallback
  auf das lokale `public/tv/events.json`, wenn der Fetch fehlschlägt.
  Ergänzung: ein erster, konkreter Umsetzungsvorschlag liegt bereits vor
  (events.json Schema v2, siehe Roadmap oben) — Repo-Besitzer/Review-Prozess
  sind noch offen.
- [ ] **(b) YouTube Data API — automatische Erkennung von Live-Übertragungen:**
  Live-Streams bekannter Go-Kanäle automatisch im Kalender anzeigen.
  Vorab klären: API-Key (wer betreibt ihn? Server-seitig nötig, Key gehört
  NICHT in den Client), Quota (10k Units/Tag Default), Datenschutz
  (welche Daten werden abgefragt und wo verarbeitet?).
- [ ] **(c) KataGo-Analyse:** nur im Replay- und Beobachter-Modus, NIE in
  eigener laufender Partie. Braucht einen Backend-Dienst (Engine läuft
  nicht im Client). Vorab klären: lokal (WASM) vs. Server,
  Engine-Lebenszyklus, UI für die Analyse-Anzeige.

## Offene Entscheidungen (Produkt, Stand heute)

- **App-Name:** noch nicht entschieden. "Go TV" war nur ein Arbeitstitel. Der Name
  bestimmt Icon-Design, `gotv.desktop`-Beschriftung und (falls gewünscht) den Namen
  dieses Claude-Projekts.
- **Icon:** wird entworfen (3 Varianten zur Auswahl), sobald der Name feststeht.
- **Wöchentlicher Event-Scanner:** Idee, die Quellen EGF-Twitch-Zeitplan, KGS-Events
  und Profi-Turnierseiten wöchentlich automatisch zu prüfen und einen PR mit neuen
  Events auf den Fork zu öffnen. Braucht Schreibzugriff (PR-Rechte) auf den Fork —
  noch nicht eingerichtet, noch keine Entscheidung.
- **Belegte, aber nicht als gestreamt bestätigte Turniere (Winter):** Hungarian Open
  Budapest (21.–22.11.), Berliner Kranich (28.–29.11.), Velika Gorica (12.–13.12.),
  Grand Prix Żołędowo (5.–6.12.). Keine Video-ID/Stream-URL eingetragen, solange eine
  Übertragung nicht bestätigt ist (kein Eintrag aus dem Gedächtnis).

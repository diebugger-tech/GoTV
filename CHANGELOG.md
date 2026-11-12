# Change Log

### Desktop-App (GNOME, lokal)
- `desktop/goTV_local.py`: ThreadingHTTPServer (nur 127.0.0.1, Port 8788),
  liefert den Desktop-Build aus; /igs-bridge antwortet 501 (Platzhalter)
- KGS-Zugriff über lokalen Proxy `/json-cors/access` (KGS erlaubt CORS nur für
  eine Origin-Whitelist — direkter Zugriff von localhost wurde gemessen: 403);
  Cookies und Long-Polling werden durchgereicht, Origin-Header wird entfernt
- `desktop/launch-gotv`: Health-Check, Server-Start, Browser-Erkennung
  (Chromium-Familie, nativ/Flatpak/Snap), App-Fenster via --app mit eigenem
  Profil unter ~/.local/share/gotv
- `desktop/gotv.desktop`: "Go TV" mit Projekt-Icon und StartupWMClass=gotv
- `desktop/install.sh` / `uninstall.sh`: user-scoped (kein sudo), Desktop-Build
  nach build-desktop/ (getrennt vom Web-Build), saubere Deinstallation

## Unreleased (Go TV fork)

### Phase 0 — Lauffähig auf Node 24
- yarn via corepack: `packageManager: yarn@1.22.22`, Shim `~/.local/bin/yarn`
- node-sass 4.14.1 → `sass` (dart-sass) 1.77.8; SCSS kompiliert unverändert
- `NODE_OPTIONS=--openssl-legacy-provider` in start/build-Scripts (webpack 4, md4 auf OpenSSL 3)

### Phase 2 — Go TV: Live-Top-Partien
- Neuer Navigationspunkt "TV" (NavOption, isValidNav, MainNav-Tab, Main-Branch)
- `src/model/tv.js`: Live-Filter + Sortierung nach Rang des schwächeren Spielers
  (dan vor kyu, Pro vor dan, unranked ans Ende)
- `src/ui/TvScreen.js`: Live-Liste (GameList) mit Filter "Dan only";
  Klick öffnet die bestehende Beobachten-Ansicht (actions.onJoinGame)

### Phase 3 — Turnierkalender
- `public/tv/events.json` (Schema aus Tiger's Mouth, erweitert: id, name,
  date_start/date_end, platform, stream_url, video_id?, sgf_url?, notes?)
- Laden per fetch beim Öffnen des Kalender-Tabs; ungültige Einträge werden
  geloggt und übersprungen
- Gruppen "Live & Today" / "Upcoming" / "Past" (date-fns)
- Offizielle Embed-Player mit Zwei-Klick-Lösung (youtube-nocookie, player.twitch.tv
  mit parent=hostname); Fallback "Extern öffnen" (target=_blank rel=noopener)
- Unit-Tests für Sortierung, Validierung, URL-/Embed-Logik (17 Tests)
- `.eslintrc`: jest-Global `describe` ergänzt

### Phase 4 — Stream-Links im Chat
- `src/util/urls.js`: extract_urls/normalize_url aus Tiger's Mouth portiert
  (youtube.com, youtu.be, twitch.tv) + isStreamUrl
- Chat-Nachrichten (Room- und Game-Chat) zeigen bei Stream-Links zusätzlich
  "Im TV öffnen"; öffnet den Embed im TV-Tab (AppState tvStreamUrl,
  actions.onOpenTvStream/onCloseTvStream)
- autolinker.js bleibt für die Link-Darstellung zuständig; der Button ist additiv
- Unit-Tests für URL-Erkennung (5 Tests)

### Phase 5 — Nachspielen (SGF-Replay)
- `src/model/sgf.js`: SGF-Parser (Port aus Tiger's Mouth sgf.rs), erweitert um
  Varianten, Handicap (HA/AB/AW), Markierungen (LB/TR/SQ/CR/MA), Kommentare,
  Pässe; baut einen GameTree für die bestehende Brett-Komponente
- Fixtures `src/model/__fixtures__/`: AlphaGo-LeeSedol 2016 Spiel 1 (19x19,
  mit Variation), Yasuda-Ito 1840 (3-Steine-Vorgabe), Takao-So 2014 (13x13)
- Replay-Tab "Nachspielen" im TV: Datei-Upload, SGF-Textfeld, sgf_url aus
  events.json ("SGF nachspielen" im Kalender); vor/zurück/Anfang/Ende
  (BoardNav erweitert), Slider, Pfeiltasten, Zugnummer, Gefangene, Kommentare
- CORS-Fehler → klare Meldung, kein Proxy; Replay ohne Server-Interaktion
- Unit-Tests für den Parser (13 Tests)

## v0.3.0
- Challenge creation
- Challenge negotation (by challenger only for now)
- Bigger board on desktop
- Rank graph in user profile (thx Nate Eagle)
- Show accurate captures and time when navigating to past moves
- "Open in GoKibitz" under more menu
- Fix demo games not working
- Feedback dialog

## v0.2.0
- Move to shin.gokgs.com domain, remove API proxy; fixes banning issue
- Support for "Add to Home Screen" on iOS
- Tone down board colors
- Download SGF option
- Open in EidoGo option
- Various other fixes and improvements
- Contributors this release:
    - mikach
    - Paranaix
    - yishn

## v0.1.0
- Initial public release
- Game lists
- Game spectating and chat
- Room chat
- User chat (direct messaging)
- View and edit user details
- Submit challenge proposal (no negotiating)
- Basic game playing

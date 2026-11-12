# Change Log

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

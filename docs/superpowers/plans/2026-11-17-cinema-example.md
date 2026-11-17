# Cinema example implementation plan

**Goal:** Show the 2026 European Championship final as a labelled example under Live, with the EGF Twitch player, an independent replay board, and video/board-only cinema layouts.

**Design approved in conversation:** Start video and board together after the viewer clicks. The viewer can unload/reload the video without losing the board position. The EGF channel from the user's screenshot may be offline and is not synchronized with the archived game; no specific final video is required. Reuse BroadcastCard and SgfReplayView; keep the example out of live/calendar data. Bundle the official final SGF locally. Show the example only while there is no real live broadcast.

**Constraints:** React 16 / Flow; no dependencies; official two-click player; no KGS connection for recordings; update build-desktop; commit on feature/go-tv, no push.

1. [x] Add a failing interaction test for video toggling while retaining board navigation.
2. [x] Implement video controls and a compact recording board; test anonymous example opening, cinema, navigation, close/reopen and SGF errors.
3. [x] Add the EGF example to Live with the official final SGF and source attribution.
4. [x] Run targeted tests, lint, Flow, build and harness exclusion check; update the Desktop build and verify served assets.
5. [x] Inspect the diff and commit the completed feature without pushing.

**Validation:** 18 suites / 227 tests passed with the documented `src/App.test.js` excluded. An attempted full run fails there because IndexedDB is absent in jsdom. Lint, Flow, web and Desktop builds passed; no development harness in production assets. Local server serves the updated Desktop index and byte-identical final SGF. Independent review found no important issues; visual browser access was unavailable.

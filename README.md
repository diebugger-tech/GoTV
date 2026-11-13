# <img src="./design/logo.svg" width="28"> Shin KGS
[![Build Status](https://travis-ci.com/jkk/shinkgs.svg?branch=master)](https://travis-ci.com/jkk/shinkgs)

A semi-official JavaScript client for [KGS Go Server](http://www.gokgs.com/).

> **Note:** This repository is a fork of [jkk/shinkgs](https://github.com/jkk/shinkgs)
> ("Go TV" fork). It is **not** the official Shin KGS client, it is **not**
> operated by or affiliated with KGS Go Server, and it uses **no** KGS logos
> or trademarks. See `LICENSE.txt` for the original MIT license (Justin Kramer).

- The **official stable version** is available at https://shin.gokgs.com.
- A development version (less stable) is available at https://shinkgs-master.now.sh.

## Screenshot

<img src="./design/screenshot.png" alt="Screenshot - iOS Safari" width="375" height="667">

## Goals

* First-class web and mobile experience
* Retain community vibe of KGS
* Start small, release early
* Work towards native versions (Electron, React Native, Cordova)
* [Bus factor](https://en.wikipedia.org/wiki/Bus_factor) > 1

## Progress

- [x] Game lists
- [x] Game spectating and chat
- [x] Room chat
- [x] User chat (direct messaging)
- [x] View and edit user details
- [x] Submit challenge proposal (no negotiating)
- [x] Create challenge
- [x] Negotiate challenge
- [ ] Automatch
- [x] Basic game playing
- [ ] Full-featured game playing (fine-tuned UI, rengo, simul)
- [ ] Review tools
- [ ] Admin/moderation tools
- [ ] Everything else

For more details, look at [the milestones](https://github.com/jkk/shinkgs/milestones)

## Contributing

Contributions welcome. Please check the [milestones](https://github.com/jkk/shinkgs/milestones) and the [issues](https://github.com/jkk/shinkgs/issues) to help coordinate efforts. Feel free to create an issue if there isn't one already for what you have in mind.

Issues with the ["difficulty-easy"](https://github.com/jkk/shinkgs/issues?q=is%3Aopen+is%3Aissue+label%3Adifficulty-easy) label are good tasks to get started on. Reach out if you need any guidance!

Discord chat group for anyone interested in helping: https://discord.gg/vwzxdVr

## Desktop-Installation (Linux, GNOME)

**Currently Linux only** (tested on Ubuntu/GNOME) - Windows and macOS
packaging is planned but not built yet. The "Go TV" fork can be installed
as a local desktop app: a Go-board-themed icon in the app grid opens the
login screen in its own window (no browser chrome).

Prerequisites:

- Node.js + Yarn V1 (see `AGENTS.md` "Setup")
- Python 3 (standard library only), `curl`
- A Chromium-family browser (chromium, google-chrome, brave or
  microsoft-edge; native, Flatpak or Snap are all detected automatically)
- `inkscape` or ImageMagick (`convert`/`magick`), only if you need to
  regenerate `desktop/icons/png/` from `desktop/icons/gotv.svg` - the
  rendered PNGs are committed, so a plain install doesn't need either

Install (no sudo, user-scoped only):

```
sh desktop/install.sh
```

Then launch "Go TV" from the app grid. The app serves the production build
from `build-desktop/` on `127.0.0.1:8788` only; KGS traffic is proxied
through the local server at `/json/access` (KGS only allows a whitelist
of CORS origins, so direct browser access from localhost is rejected).

Uninstall:

```
sh desktop/uninstall.sh
```

Browser profile and server log live in `~/.local/share/gotv/` and are left
in place by the uninstaller.

### Fehlerbehebung

- **Icon fehlt in der App-Auswahl:** `sh desktop/install.sh` erneut
  ausführen, dann `gtk-update-icon-cache -f -t ~/.local/share/icons/hicolor`
  (macht `install.sh` bereits selbst, falls vorhanden) - hilft das nicht,
  einmal ab- und wieder anmelden (manche Desktop-Umgebungen aktualisieren
  die Icon-Auswahl sonst nicht sofort).
- **Desktop-App zeigt einen alten Stand:** `sh desktop/install.sh` erneut
  ausführen - baut `build-desktop/` neu und aktualisiert Icon/Launcher.

## Events eintragen

The Go TV calendar (`public/tv/events.json`) is loaded from
[`diebugger-tech/shinkgs`](https://github.com/diebugger-tech/shinkgs) on
GitHub first, falling back to the bundled local copy when offline or
unreachable (`fetchTvEvents()` in `src/model/tv.js`, cached for an hour).
To add or update an event, edit `public/tv/events.json` in this repo and
open a pull request.

Each entry:

| Field | Required | Description |
|---|---|---|
| `id` | yes | Stable, unique string (used as the React key). |
| `name` | yes | Event name shown in the calendar. |
| `date_start` | yes | `YYYY-MM-DD`. The event is "live" from the start of this day. |
| `date_end` | no | `YYYY-MM-DD`. Defaults to `date_start` for single-day events. |
| `platform` | yes | `"youtube"`, `"twitch"`, or `"other"` (link only, no embed). |
| `stream_url` | yes | Channel or video page; used for "Extern öffnen" and as a fallback embed source. |
| `video_id` | no | A specific YouTube or Twitch video id - embeds that exact recording and wins over everything else. |
| `channel` | no | `{"platform": "youtube"\|"twitch", "id": "..."}`. Used only while the event is live (today) and no `video_id` is set, to embed whatever that channel is currently streaming. YouTube needs the channel *id* (`UC...`), not the `@handle`; Twitch takes the channel login. |
| `sgf_url` | no | Link to a recorded SGF. Shows a "SGF nachspielen" shortcut and keeps the event from disappearing after 14 days (see below). |
| `notes` | no | Short free-text shown under the name. |

Example entry for a tournament broadcast on a known channel, embedding
whatever that channel streams while the event is live:

```json
{
  "id": "example-cup-2027",
  "name": "Example Cup 2027",
  "date_start": "2027-03-01",
  "date_end": "2027-03-03",
  "platform": "youtube",
  "stream_url": "https://www.youtube.com/@ExampleGoChannel",
  "channel": { "platform": "youtube", "id": "UCxxxxxxxxxxxxxxxxxxxxxx" },
  "notes": "Example only - replace with a real, confirmed broadcast."
}
```

Past events are shown for 14 days after they end, then dropped from the
calendar - unless they have a `video_id` or `sgf_url`, in which case they
move to an "Archiv" section instead of disappearing.

### Sender eintragen

Alongside the date-bound events above, `public/tv/events.json` has a
second, standing list: `channels`. A channel has no event date - it
always shows up in the Kalender tab's "Sender" section (above
"Archiv"), not just while something specific is scheduled.

Each entry:

| Field | Required | Description |
|---|---|---|
| `id` | yes | Stable, unique string (used as the React key). |
| `name` | yes | Channel name shown in the "Sender" section. |
| `platform` | yes | `"youtube"` or `"twitch"` (no `"other"` - both need a known, official embed shape). |
| `url` | yes | The channel's page; used for "Extern öffnen" and as the starting point to find a YouTube `channel_id` (see below). |
| `channel_id` | yes | YouTube: the `UC...` channel id, *not* the `@handle`. Twitch: the channel login (the last path segment of its URL). |
| `notes` | no | Short free-text shown under the name. |

Example entry:

```json
{
  "id": "example-channel",
  "name": "Example Go Channel",
  "platform": "youtube",
  "url": "https://www.youtube.com/@ExampleGoChannel",
  "channel_id": "UCxxxxxxxxxxxxxxxxxxxxxx",
  "notes": "Example only - replace with a real channel."
}
```

Finding a YouTube channel's `UC...` id from its `@handle` URL: open
the channel page, view its page source (`Strg`+`U` in the browser, or
`curl <url>`), and search for `"externalId"` - the value right after
it is the channel id. A Twitch `channel_id` needs no lookup: it's
just the channel's login, the last segment of `twitch.tv/<login>`.

Each Sender entry always tries to embed the channel's current live
stream (`youtube-nocookie.com/embed/live_stream?channel=...` /
`player.twitch.tv/?channel=...` - the same official embeds Events use
for their `channel` field). There is no way to know in advance,
without an API key, whether a channel is actually broadcasting right
now; if it isn't, the official player itself shows its own "offline"
state once loaded ("Gerade keine Übertragung"), and "Extern öffnen"
stays available either way.

## Code Overview

This project uses JavaScript, React, and ES6+ with [Flow](https://flow.org/) types. [VS Code](https://code.visualstudio.com/) (with eslint and flow extensions added) is a great editor for this setup.

State is managed with a Redux-like pattern: there is a single, primary source of truth for app state, plus a bit of component-local state. Messages describing actions are dispatched, which handlers then process to produce the next app state. Unlike typical Redux, no implicit context is used. Everything is passed down through props.

## Development Setup

You'll need [Node.js](https://nodejs.org/en/) and [Yarn V1](https://classic.yarnpkg.com/en/).

To install and start a local dev server, run:

```
yarn install
yarn start
```

Requests are sent to the official KGS API by default and are proxied through the Webpack development server. If you would prefer to send requests to the KGS beta server, use the alternative `start:beta` script:

```
yarn start:beta
```

Making requests to the beta server will require HTTPS, so you will need to tell your browser to accept the self-signed certificate in order to access the page.

If you're password from the regular KGS server doesn't work (or you want another
account to test with) you can create a new one at
https://beta.gokgs.com/register/index.html.

For setting up a standalone web server you can generate just the optimized production code with ```yarn build```.  This creates a build folder which can be run locally with ```yarn start:server``` or you can copy the tree to another server and run them from there.  The production/beta service is currently served by nginx with a simple config like this:

```
server {
  server_name shin.gokgs.com;
  listen [::]:80; # if you want to allow unsecure access, o/w redirect
  location / {
    root /var/www/shinkgs/;
    add_header  X-nginx-rule 80-shinkgs always;
    try_files $uri $uri/ /;
  }
  # add letsencrypt config here for https
```

We use Travis as a continuous integration service. The [Travis job](.travis.yml) will run `yarn lint` and `yarn flow` and fails if those fail. So make sure to use those commands locally before pushing.

## Deployment

The official and stable build lives at https://shin.gokgs.com. Each commit is also built and deployed using [Vercel](https://www.vercel.com) (previosly called *Now*) on:

```
https://shinkgs-BRANCH.now.sh
```

With `BRANCH` being one of the Git branches of this repository. For example, a live version of master is always available at https://shinkgs-master.now.sh. **Warning**: the `master` branch should always work but is certainly not bullet-proof and bug-free. Use the [official build](https://shin.gokgs.com) for any sensitive games (such as tournaments).

If you are developing the app and want to deploy in the cloud, use the [Vercel service](https://www.vercel.com):

```
# Install `vercel` globally
yarn global add vercel 

# Deploy the project.
vercel
```

This builds the app then pushes it out to the cloud. If you have not used Vercel before, you will be prompted to log-in using your email before deploying.

## Troubleshooting

### Installing Node.js on Windows

It is highly recommended that you install the [Chocolatey package manager](https://chocolatey.org/) before installing Node.js on Windows. After Chocolatey is installed, make sure to check the 'Automatically install the necessary tools' checkbox when prompted during the Node.js installation. These tools are needed to build some ShinKGS dependencies.

### Vercel is not recognized

If your system does not recognize `vercel` as a command after running `yarn global add vercel`, make sure that the Yarn `bin` directory is a part of your `path` environment variable. For MacOS/Linux, this directory is usually `~/.yarn/bin`. For Windows, it will be something like `C:\Users\username\AppData\Local\Yarn\bin`. Most of the time this directory should get added to your path automatically when installing Yarn.

## References

* [KGS API Docs](https://www.gokgs.com/json/protocol.html)
* [KGS API Download](https://www.gokgs.com/help/protocol.html)
* [KGS Client Coding Google Group](https://groups.google.com/forum/#!forum/kgs-client-coding)

## Similar Projects

* [Go Universe](https://github.com/IlyaKirillov/GoUniverse)
* [KGS Leben](https://github.com/stephenmartindale/kgs-leben)

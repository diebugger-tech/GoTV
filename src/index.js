import * as React from "react";
import ReactDOM from "react-dom";
import Fastclick from "fastclick";
import App from "./App";
import TvScreen from "./ui/TvScreen";
import CalendarView from "./ui/tv/CalendarView";
import StreamEmbed from "./ui/tv/StreamEmbed";
import SgfReplayView from "./ui/tv/SgfReplayView";
import ChatMessages from "./ui/chat/ChatMessages";
import { isTouchDevice } from "./util/dom";
import "./css/index.scss";
import "font-awesome/css/font-awesome.css";

if (document.body) {
  // Hack to get Mobile Safari to show :active styling on tap
  document.body.ontouchstart = () => {};

  // Lets us style hovers only for non-touch
  document.body.classList.add(isTouchDevice() ? "touch" : "no-touch");

  // Remove tap delay on iOS standalone
  if (
    window.navigator.standalone &&
    /iPad|iPhone|iPod/.test(window.navigator.userAgent)
  ) {
    Fastclick.attach(document.body);
  }
}

// ---------------------------------------------------------------------------
// Dev-only TV harness (#tv-dev)
//
// Renders the Go-TV flow with simulated store data so it can be QA'd in a
// browser without a KGS account. The whole harness lives INSIDE this
// NODE_ENV-gated block, which terser constant-folds away in production
// builds. Verified after every build by grepping build/static/js for
// "GO-TV-DEV-HARNESS" (must not match).
// ---------------------------------------------------------------------------
if (
  process.env.NODE_ENV === "development" &&
  window.location.hash === "#tv-dev"
) {
  const DEV_HARNESS_HEADER_STYLE = {
    padding: "10px 14px",
    background: "#4a6b8a",
    color: "#fff",
    fontWeight: "bold",
  };

  const DEV_HARNESS_SECTION_STYLE = {
    borderTop: "1px solid #ccc",
    padding: "10px 0",
  };

  const DEV_HARNESS_TITLE_STYLE = {
    padding: "0 10px 8px",
    fontWeight: "bold",
    fontSize: 14,
  };

  function devDaysFromNow(days) {
    let d = new Date();
    d.setDate(d.getDate() + days);
    let month = ("0" + (d.getMonth() + 1)).slice(-2);
    let day = ("0" + d.getDate()).slice(-2);
    return d.getFullYear() + "-" + month + "-" + day;
  }

  const DEV_FAKE_RULES = {
    timeSystem: "byoyomi",
    mainTime: 1500,
    byoyomiPeriods: 10,
    byoyomiPeriodTime: 30,
    size: 19,
    komi: 6.5,
  };

  // 5 "active" games; only the first is flagged as a KGS server event
  // (game.event = true), so the TV Live tab's "Partien" section shows just
  // that one - the rest are Watch-only material, not TV broadcasts.
  const DEV_FAKE_GAMES = [
    {
      id: 1,
      channelId: 1,
      roomId: null,
      type: "ranked",
      moveNum: 88,
      event: true,
      rules: DEV_FAKE_RULES,
      players: {
        white: { name: "ProB", rank: "1p", rankVal: 11 },
        black: { name: "ProA", rank: "9p", rankVal: 19 },
      },
    },
    {
      id: 2,
      channelId: 2,
      roomId: null,
      type: "ranked",
      moveNum: 40,
      rules: DEV_FAKE_RULES,
      players: {
        white: { name: "DanB", rank: "5d", rankVal: 5 },
        black: { name: "DanA", rank: "7d", rankVal: 7 },
      },
    },
    {
      id: 3,
      channelId: 3,
      roomId: null,
      type: "free",
      moveNum: 23,
      rules: DEV_FAKE_RULES,
      players: {
        white: { name: "DanD", rank: "2d", rankVal: 2 },
        black: { name: "DanC", rank: "4d", rankVal: 4 },
      },
    },
    {
      id: 4,
      channelId: 4,
      roomId: null,
      type: "ranked",
      moveNum: 55,
      rules: DEV_FAKE_RULES,
      players: {
        white: { name: "MixedB", rank: "3k", rankVal: -3 },
        black: { name: "MixedA", rank: "1d", rankVal: 1 },
      },
    },
    {
      id: 5,
      channelId: 5,
      roomId: null,
      type: "ranked",
      moveNum: 12,
      rules: DEV_FAKE_RULES,
      players: {
        white: { name: "KyuB", rank: "7k", rankVal: -7 },
        black: { name: "KyuA", rank: "5k", rankVal: -5 },
      },
    },
  ];

  // Synthetic calendar events: one today (YouTube video, embeddable), one
  // upcoming (Twitch channel, embeddable), one past (YouTube channel URL ->
  // external-link fallback, plus an SGF to replay).
  const DEV_SYNTHETIC_EVENTS = [
    {
      id: "dev-today-youtube",
      name: "Dev-Test: Live-Event heute (YouTube)",
      date_start: devDaysFromNow(0),
      platform: "youtube",
      stream_url: "https://www.youtube.com/watch?v=goTVdemoVideo1",
      video_id: "goTVdemoVideo1",
      notes: "Synthetisches Event für den Dev-Harness.",
    },
    {
      id: "dev-upcoming-twitch",
      name: "Dev-Test: Demnächst (Twitch)",
      date_start: devDaysFromNow(3),
      platform: "twitch",
      stream_url: "https://www.twitch.tv/example_channel",
      notes: "Synthetisches Event für den Dev-Harness.",
    },
    {
      id: "dev-past-fallback",
      name: "Dev-Test: Vergangen (Kanal-URL, nicht einbettbar)",
      date_start: devDaysFromNow(-7),
      platform: "youtube",
      stream_url: "https://www.youtube.com/@examplechannel",
      sgf_url: "/tv/demo.sgf",
      notes: "Synthetisches Event für den Dev-Harness.",
    },
  ];

  const DEV_FAKE_USERS = {
    StreamFan: { name: "StreamFan", rank: "3k", rankVal: -3 },
    TwitchFan: { name: "TwitchFan", rank: "2d", rankVal: 2 },
  };

  const DEV_CHAT_MESSAGES = [
    {
      id: 1,
      sender: "StreamFan",
      body:
        "Schaut euch das an: https://www.youtube.com/watch?v=goTVdemoVideo1",
      date: new Date(),
    },
    {
      id: 2,
      sender: "TwitchFan",
      body: "Live auf twitch.tv/example_channel heute Abend",
      date: new Date(),
    },
  ];

  const DEV_CURRENT_USER = { name: "DevTester", rank: "1d", rankVal: 1 };

  class TvDevHarness extends React.Component {
    constructor(props) {
      super(props);
      this.state = { tvStreamUrl: null, replayUrl: null, replayKey: 0 };
      this._actions = {
        onJoinGame: (gameId) => {
          console.log("[tv-dev] onJoinGame", gameId);
        },
        onCloseTvStream: () => {
          this.setState({ tvStreamUrl: null });
        },
      };
    }

    render() {
      let { tvStreamUrl, replayUrl, replayKey } = this.state;
      return (
        <div className="TvDevHarness" data-dev-marker="GO-TV-DEV-HARNESS">
          <div style={DEV_HARNESS_HEADER_STYLE}>
            Go TV Dev-Harness (nur Development)
          </div>
          <div style={DEV_HARNESS_SECTION_STYLE}>
            <div style={DEV_HARNESS_TITLE_STYLE}>
              1. TV-Tab (simulierte Store-Daten)
            </div>
            <TvScreen
              activeGames={DEV_FAKE_GAMES}
              roomsById={{}}
              actions={this._actions}
              tvStreamUrl={tvStreamUrl}
            />
          </div>
          <div style={DEV_HARNESS_SECTION_STYLE}>
            <div style={DEV_HARNESS_TITLE_STYLE}>
              2. Kalender-Gruppen (synthetische Events:
              heute/demnächst/vergangen)
            </div>
            <CalendarView
              events={DEV_SYNTHETIC_EVENTS}
              onOpenReplay={this._onOpenReplay}
            />
          </div>
          <div style={DEV_HARNESS_SECTION_STYLE}>
            <div style={DEV_HARNESS_TITLE_STYLE}>
              3. Embed-Varianten (YouTube-Video, Twitch-Kanal, Fallback)
            </div>
            <StreamEmbed event={DEV_SYNTHETIC_EVENTS[0]} />
            <StreamEmbed event={DEV_SYNTHETIC_EVENTS[1]} />
            <StreamEmbed event={DEV_SYNTHETIC_EVENTS[2]} />
          </div>
          <div style={DEV_HARNESS_SECTION_STYLE}>
            <div style={DEV_HARNESS_TITLE_STYLE}>
              4. Chat: Stream-Links mit Button {"Im TV öffnen"}
            </div>
            <ChatMessages
              currentUser={DEV_CURRENT_USER}
              messages={DEV_CHAT_MESSAGES}
              usersByName={DEV_FAKE_USERS}
              onUserDetail={() => {}}
              onOpenTv={this._onOpenTv}
            />
            {tvStreamUrl ? (
              <div style={{ marginTop: 10 }}>
                <div style={DEV_HARNESS_TITLE_STYLE}>
                  Aus Chat geöffneter Stream (Harness-State):
                </div>
                <StreamEmbed url={tvStreamUrl} />
              </div>
            ) : null}
          </div>
          <div style={DEV_HARNESS_SECTION_STYLE}>
            <div style={DEV_HARNESS_TITLE_STYLE}>5. Replay</div>
            {replayUrl ? (
              <button
                className="Button"
                type="button"
                onClick={this._onResetReplay}>
                Replay zurücksetzen (manueller Modus)
              </button>
            ) : null}
            <SgfReplayView key={replayKey} initialUrl={replayUrl} />
          </div>
        </div>
      );
    }

    _onOpenTv = (url) => {
      this.setState({ tvStreamUrl: url });
    };

    _onOpenReplay = (url) => {
      this.setState({ replayUrl: url, replayKey: this.state.replayKey + 1 });
    };

    _onResetReplay = () => {
      this.setState({ replayUrl: null, replayKey: this.state.replayKey + 1 });
    };
  }

  ReactDOM.render(<TvDevHarness />, document.getElementById("root"));
} else {
  ReactDOM.render(<App />, document.getElementById("root"));
}

// @flow
import React, { PureComponent as Component } from "react";
import CalendarView from "./tv/CalendarView";
import BroadcastCard from "./tv/BroadcastCard";
import { formatEventDateRange } from "./tv/CalendarEventCard";
import StreamEmbed from "./tv/StreamEmbed";
import SgfReplayView from "./tv/SgfReplayView";
import { A, TabNav } from "./common";
import {
  getNextUpcomingEvent,
  fetchTvEvents,
  validateTvEvent,
} from "../model/tv";
import { kgsTvSource } from "../model/TvSource";
import type { TvEvent } from "../model/tv";
import type { GameChannel, Room, Index, AppActions } from "../model";

type Props = {
  activeGames: Array<GameChannel>,
  gamesById: Index<GameChannel>,
  roomsById: Index<Room>,
  actions: AppActions,
  tvStreamUrl: ?string,
  tvReplayGameId: ?number,
  // Optional injected calendar (dev harness/tests) - raw events.json
  // entries, validated here; skips the fetch (same as CalendarView).
  events?: Array<Object>,
};

type State = {
  activeTabId: string,
  replayUrl: ?string,
  tvEventsStatus: "loading" | "ready" | "error",
  tvEvents: Array<TvEvent>,
};

export default class TvScreen extends Component<Props, State> {
  state = {
    activeTabId: this.props.tvReplayGameId ? "replay" : "live",
    replayUrl: null,
    tvEventsStatus: "loading",
    tvEvents: [],
  };

  componentDidMount() {
    window.scrollTo(0, 0);
    this._loadEvents();
  }

  componentDidUpdate(prevProps: Props) {
    if (
      this.props.tvReplayGameId &&
      this.props.tvReplayGameId !== prevProps.tvReplayGameId
    ) {
      this.setState({ activeTabId: "replay" });
    }
  }

  _loadEvents = () => {
    if (this.props.events) {
      // Raw entries, validated like events.json (as in CalendarView).
      let tvEvents = [];
      for (let raw of this.props.events) {
        let event = validateTvEvent(raw);
        if (event) {
          tvEvents.push(event);
        }
      }
      this.setState({ tvEventsStatus: "ready", tvEvents });
      return;
    }
    fetchTvEvents()
      .then((tvEvents) => {
        this.setState({ tvEventsStatus: "ready", tvEvents });
      })
      .catch((err) => {
        console.warn("[tv] Failed to load live calendar events:", err);
        this.setState({ tvEventsStatus: "error", tvEvents: [] });
      });
  };

  render() {
    let {
      activeGames,
      gamesById,
      roomsById,
      actions,
      tvStreamUrl,
      tvReplayGameId,
    } = this.props;
    let { activeTabId, replayUrl, tvEvents } = this.state;

    let now = new Date();
    let broadcasts = kgsTvSource.getLiveBroadcasts(
      activeGames,
      tvEvents,
      roomsById,
      now
    );
    let hasLive = broadcasts.length > 0;
    let nextEvent = getNextUpcomingEvent(tvEvents, now);
    let replayGame = tvReplayGameId ? gamesById[tvReplayGameId] : null;
    let replayTree = replayGame ? replayGame.tree : null;

    let tabs = [
      {
        id: "live",
        label: "Live",
        content: (
          <div className="TvScreen-live">
            {hasLive ? (
              <div className="TvScreen-live-content">
                {broadcasts.map((broadcast) => (
                  <BroadcastCard
                    key={broadcast.event.id}
                    broadcast={broadcast}
                    roomsById={roomsById}
                    onJoinGame={actions.onJoinGame}
                    onOpenReplay={this._onOpenReplay}
                  />
                ))}
              </div>
            ) : (
              <div className="TvScreen-live-empty">
                <div className="TvScreen-live-empty-title">
                  Gerade keine Übertragung.
                </div>
                {nextEvent ? (
                  <div className="TvScreen-live-empty-next">
                    <div className="TvScreen-live-empty-next-text">
                      Nächstes Event: <strong>{nextEvent.name}</strong> (
                      {formatEventDateRange(nextEvent)})
                    </div>
                  </div>
                ) : null}
                <div className="TvScreen-live-empty-calendar">
                  <A button onClick={this._onShowCalendarTab}>
                    Zum Kalender
                  </A>
                </div>
              </div>
            )}
          </div>
        ),
      },
      {
        id: "calendar",
        label: "Kalender",
        content: <CalendarView onOpenReplay={this._onOpenReplay} />,
      },
      {
        id: "replay",
        label: "Nachspielen",
        content: (
          <SgfReplayView
            key={
              replayTree
                ? "game-" + String(tvReplayGameId)
                : replayUrl || "manual"
            }
            initialUrl={replayTree ? null : replayUrl}
            initialTree={replayTree}
          />
        ),
      },
    ];

    return (
      <div className="TvScreen">
        <div className="TvScreen-header">
          <div className="TvScreen-title">Go TV</div>
        </div>
        {tvStreamUrl ? (
          <div className="TvScreen-stream">
            <div className="TvScreen-stream-header">
              <div className="TvScreen-stream-title">Stream</div>
              <A
                button
                className="TvScreen-stream-close"
                onClick={actions.onCloseTvStream}>
                ×
              </A>
            </div>
            <StreamEmbed url={tvStreamUrl} />
          </div>
        ) : null}
        <TabNav
          tabs={tabs}
          activeTabId={activeTabId}
          onSelectTab={this._onSelectTab}
        />
      </div>
    );
  }

  _onSelectTab = (id: string) => {
    this.setState({ activeTabId: id });
  };

  _onShowCalendarTab = () => {
    this.setState({ activeTabId: "calendar" });
  };

  _onOpenReplay = (url: string) => {
    this.setState({ activeTabId: "replay", replayUrl: url });
  };
}

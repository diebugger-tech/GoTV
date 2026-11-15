// @flow
import React, { PureComponent as Component } from "react";
import CalendarView from "./tv/CalendarView";
import BroadcastCard from "./tv/BroadcastCard";
import CalendarEventCard, {
  formatEventDateRange,
} from "./tv/CalendarEventCard";
import ChannelCard from "./tv/ChannelCard";
import StreamEmbed from "./tv/StreamEmbed";
import SgfReplayView from "./tv/SgfReplayView";
import { A, TabNav } from "./common";
import {
  getNextUpcomingEvent,
  fetchTvEvents,
  validateTvEvent,
  getBroadcastForStream,
} from "../model/tv";
import { kgsTvSource } from "../model/TvSource";
import type { TvEvent, TvBroadcast } from "../model/tv";
import type {
  GameChannel,
  Room,
  User,
  KgsClientState,
  Index,
  AppActions,
} from "../model";

type Props = {
  activeGames: Array<GameChannel>,
  gamesById: Index<GameChannel>,
  roomsById: Index<Room>,
  actions: AppActions,
  currentUser?: ?User,
  usersByName?: Index<User>,
  clientState?: KgsClientState,
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
  now: number,
};

export default class TvScreen extends Component<Props, State> {
  _refreshTimer: ?IntervalID;
  _mounted: boolean = false;
  state = {
    activeTabId: this.props.tvReplayGameId ? "replay" : "live",
    replayUrl: null,
    tvEventsStatus: "loading",
    tvEvents: [],
    now: Date.now(),
  };

  componentDidMount() {
    this._mounted = true;
    window.scrollTo(0, 0);
    this._loadEvents();
    this._refreshTimer = setInterval(() => {
      this.setState({ now: Date.now() });
      this._loadEvents();
    }, 60000);
  }

  componentWillUnmount() {
    this._mounted = false;
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
    }
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
        if (this._mounted) {
          this.setState({ tvEventsStatus: "ready", tvEvents });
        }
      })
      .catch((err) => {
        console.warn("[tv] Failed to load live calendar events:", err);
        if (this._mounted && !this.state.tvEvents.length) {
          this.setState({ tvEventsStatus: "error" });
        }
      });
  };

  _renderBroadcast = (broadcast: TvBroadcast) => {
    let {
      roomsById,
      actions,
      currentUser,
      usersByName,
      clientState,
    } = this.props;
    return (
      <BroadcastCard
        key={broadcast.event.id}
        broadcast={broadcast}
        roomsById={roomsById}
        onJoinGame={actions.onJoinGame}
        onOpenReplay={this._onOpenReplay}
        currentUser={currentUser}
        usersByName={usersByName}
        actions={actions}
        connectionKey={
          clientState ? clientState.status + "/" + clientState.network : ""
        }
      />
    );
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

    let now = new Date(this.state.now);
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
    let openedBroadcast = tvStreamUrl
      ? getBroadcastForStream(broadcasts, tvStreamUrl)
      : null;

    let tabs = [
      {
        id: "live",
        label: "Live",
        content: (
          <div className="TvScreen-live">
            {hasLive ? (
              <div className="TvScreen-live-content">
                {broadcasts.map(this._renderBroadcast)}
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
        content: (
          <CalendarView
            events={this.props.events ? tvEvents : undefined}
            onOpenReplay={this._onOpenReplay}
            renderEvent={(event) => {
              let broadcast = kgsTvSource.getLiveBroadcasts(
                activeGames,
                [event],
                roomsById,
                now
              )[0];
              return broadcast ? (
                this._renderBroadcast(broadcast)
              ) : (
                <CalendarEventCard
                  event={event}
                  onOpenReplay={this._onOpenReplay}
                />
              );
            }}
            renderChannel={(channel) => {
              let broadcast = broadcasts.find(
                ({ event }) =>
                  event.stream_url === channel.url ||
                  (event.channel &&
                    event.channel.platform === channel.platform &&
                    event.channel.id === channel.channel_id)
              );
              return broadcast ? (
                this._renderBroadcast(broadcast)
              ) : (
                <ChannelCard channel={channel} />
              );
            }}
          />
        ),
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
            {openedBroadcast ? (
              this._renderBroadcast(openedBroadcast)
            ) : (
              <div>
                <StreamEmbed key={tvStreamUrl} url={tvStreamUrl} />
                <div className="TvGamePanel-notice">
                  Diesem Stream ist kein KGS-Brett zugeordnet.
                </div>
              </div>
            )}
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

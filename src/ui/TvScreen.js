// @flow
import React, { PureComponent as Component } from "react";
import GameList from "./game/GameList";
import CalendarView from "./tv/CalendarView";
import CalendarEventCard, {
  formatEventDateRange,
} from "./tv/CalendarEventCard";
import StreamEmbed from "./tv/StreamEmbed";
import SgfReplayView from "./tv/SgfReplayView";
import { A, TabNav } from "./common";
import {
  getLiveEventGames,
  getLiveEvents,
  getNextUpcomingEvent,
  fetchTvEvents,
  KGS_EVENTS_PAGE_URL,
} from "../model/tv";
import type { TvEvent } from "../model/tv";
import type { GameChannel, Room, Index, AppActions } from "../model";

type Props = {
  activeGames: Array<GameChannel>,
  gamesById: Index<GameChannel>,
  roomsById: Index<Room>,
  actions: AppActions,
  tvStreamUrl: ?string,
  tvReplayGameId: ?number,
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
    let liveEventGames = getLiveEventGames(activeGames);
    let liveEvents = getLiveEvents(tvEvents, now);
    let hasLive = liveEventGames.length > 0 || liveEvents.length > 0;
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
                {liveEventGames.length ? (
                  <div className="TvScreen-live-section">
                    <div className="TvScreen-live-section-title">Partien</div>
                    <GameList
                      games={liveEventGames}
                      roomsById={roomsById}
                      onSelect={actions.onJoinGame}
                    />
                  </div>
                ) : null}
                {liveEvents.length ? (
                  <div className="TvScreen-live-section">
                    <div className="TvScreen-live-section-title">
                      Übertragungen
                    </div>
                    {liveEvents.map((event) => (
                      <CalendarEventCard
                        key={event.id}
                        event={event}
                        onOpenReplay={this._onOpenReplay}
                      />
                    ))}
                  </div>
                ) : null}
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
                    <A button onClick={this._onShowCalendarTab}>
                      Im Kalender ansehen
                    </A>
                  </div>
                ) : null}
                <div className="TvScreen-live-empty-kgs">
                  <a
                    href={KGS_EVENTS_PAGE_URL}
                    target="_blank"
                    rel="noopener noreferrer">
                    KGS-Eventseite öffnen
                  </a>
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

// @flow
// Abstraction for where Go TV content comes from. KGS and the explicitly
// calendar-linked OGS source share this interface; IGS remains blocked below.
import {
  getLiveEventGames,
  getLiveEvents,
  getLiveEventForGame,
  getLiveBroadcasts,
} from "./tv";
import type { TvEvent, TvBroadcast } from "./tv";
import type { GameChannel, Room, Index } from "./types";

export interface TvSource {
  // Currently broadcasted games (on KGS: active, not over, game.event === true,
  // a real game - no lectures/reviews).
  getLiveGames(activeGames: Array<GameChannel>): Array<GameChannel>;
  // Calendar events for this source that are live right now.
  getLiveEvents(events: Array<TvEvent>, now: Date): Array<TvEvent>;
  // The live video broadcast a watched game belongs to (explicit match).
  getLiveEventForGame(
    game: GameChannel,
    events: Array<TvEvent>,
    roomsById: Index<Room>,
    now: Date
  ): ?TvEvent;
  // TV -> Live: live broadcasts with a video channel, each with its boards.
  getLiveBroadcasts(
    activeGames: Array<GameChannel>,
    events: Array<TvEvent>,
    roomsById: Index<Room>,
    now: Date
  ): Array<TvBroadcast>;
}

// KGS uses the data KgsClient already parses onto GameChannel/AppState
// (game.event, events.json). OgsTvSource implements the same interface for
// explicit calendar game IDs; IgsTvSource below remains deliberately blocked.
export class KgsTvSource implements TvSource {
  getLiveGames(activeGames: Array<GameChannel>): Array<GameChannel> {
    return getLiveEventGames(activeGames);
  }

  getLiveEvents(events: Array<TvEvent>, now: Date): Array<TvEvent> {
    return getLiveEvents(events, now);
  }

  getLiveEventForGame(
    game: GameChannel,
    events: Array<TvEvent>,
    roomsById: Index<Room>,
    now: Date
  ): ?TvEvent {
    return getLiveEventForGame(game, events, roomsById, now);
  }

  getLiveBroadcasts(
    activeGames: Array<GameChannel>,
    events: Array<TvEvent>,
    roomsById: Index<Room>,
    now: Date
  ): Array<TvBroadcast> {
    return getLiveBroadcasts(activeGames, events, roomsById, now);
  }
}

// Pandanet/IGS is deliberately NOT built: its terms of use haven't been
// reviewed (contact per the Pandanet FAQ:
// developer@pandanet-igs.com). desktop/goTV_local.py's /igs-bridge route
// answers 501 for the same reason. This class only documents the shape a
// future IGS source would have to fill - every method throws, so wiring it
// in by mistake fails loudly instead of silently showing nothing.
export class IgsTvSource implements TvSource {
  getLiveGames(): Array<GameChannel> {
    throw new Error(
      "IgsTvSource is blocked - IGS terms of use have not been reviewed"
    );
  }

  getLiveEvents(): Array<TvEvent> {
    throw new Error(
      "IgsTvSource is blocked - IGS terms of use have not been reviewed"
    );
  }

  getLiveEventForGame(): ?TvEvent {
    throw new Error(
      "IgsTvSource is blocked - IGS terms of use have not been reviewed"
    );
  }

  getLiveBroadcasts(): Array<TvBroadcast> {
    throw new Error(
      "IgsTvSource is blocked - IGS terms of use have not been reviewed"
    );
  }
}

// Shared KGS instance; the OGS instance lives in OgsTvSource.js.
export const kgsTvSource: TvSource = new KgsTvSource();

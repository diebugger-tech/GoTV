// @flow
// Abstraction for where Go TV content comes from, so a future second
// source doesn't mean rewriting TvScreen/GameScreen - see IgsTvSource below
// for why there's only one implementation today.
import { getLiveEventGames, getLiveEvents, getLiveEventForGame } from "./tv";
import type { TvEvent } from "./tv";
import type { GameChannel, Room, Index } from "./types";

export interface TvSource {
  // Currently broadcasted games (on KGS: active, not over, game.event === true).
  getLiveGames(activeGames: Array<GameChannel>): Array<GameChannel>;
  // Calendar events for this source that are live right now.
  getLiveEvents(events: Array<TvEvent>, now: Date): Array<TvEvent>;
  // Best-effort match between a watched game and a live calendar event.
  getLiveEventForGame(
    game: GameChannel,
    events: Array<TvEvent>,
    roomsById: Index<Room>,
    now: Date
  ): ?TvEvent;
}

// The only implemented TvSource: KGS, via the data KgsClient already parses
// onto GameChannel/AppState (game.event, events.json). The UI used to call
// these model/tv functions directly; this class is the seam a second source
// would plug into without TvScreen/GameScreen caring where the data is from.
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
}

// Pandanet/IGS as a second TvSource is deliberately NOT built: its terms of
// use haven't been reviewed (contact per the Pandanet FAQ:
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
}

// Shared instance - the only TvSource the app wires up today.
export const kgsTvSource: TvSource = new KgsTvSource();

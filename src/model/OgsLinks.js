// @flow
// OGS boards the viewer assigns to a broadcast by hand ("OGS-Partielink
// zuordnen") - for when a game exists but the calendar does not know it yet.
// Kept in this browser only; the calendar file is not changed.
import type { TvEvent } from "./tv";

const STORAGE_KEY = "gotv.ogsLinks";
const OGS_GAME_LINK_RE = /^(?:https?:\/\/)?(?:www\.)?online-go\.com\/(?:api\/v1\/games|game\/view|game)\/(\d+)(?:[/?#].*)?$/i;

export type OgsLinks = { [eventId: string]: number };

// An OGS game link (or a bare game number) -> game id, else null.
export function parseOgsGameLink(text: string): ?number {
  let trimmed = text.trim();
  let match = trimmed.match(OGS_GAME_LINK_RE);
  let digits = match ? match[1] : /^\d+$/.test(trimmed) ? trimmed : null;
  let gameId = digits ? Number(digits) : 0;
  return Number.isSafeInteger(gameId) && gameId > 0 ? gameId : null;
}

function getStorage(): ?Object {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch (err) {
    return null; // storage disabled
  }
}

export function loadOgsLinks(storage?: ?Object = getStorage()): OgsLinks {
  let links: OgsLinks = {};
  try {
    let raw = storage ? JSON.parse(storage.getItem(STORAGE_KEY) || "{}") : {};
    for (let eventId of Object.keys(raw || {})) {
      if (Number.isSafeInteger(raw[eventId]) && raw[eventId] > 0) {
        links[eventId] = raw[eventId];
      }
    }
  } catch (err) {
    // Unreadable content counts as "no links".
  }
  return links;
}

export function saveOgsLinks(
  links: OgsLinks,
  storage?: ?Object = getStorage()
) {
  try {
    if (storage) {
      storage.setItem(STORAGE_KEY, JSON.stringify(links));
    }
  } catch (err) {
    // Without storage the link still holds until the page is closed.
  }
}

// A manual link replaces the event's own OGS assignment. The players of the
// linked game then drive the series (see OgsTvSource.observeEvent).
export function applyOgsLinks(
  events: Array<TvEvent>,
  links: OgsLinks
): Array<TvEvent> {
  if (!Object.keys(links).length) {
    return events;
  }
  return events.map((event) => {
    let gameId = links[event.id];
    if (!gameId) {
      return event;
    }
    let { ogs_players, ...rest } = event; // eslint-disable-line no-unused-vars
    return { ...rest, ogs_game_id: gameId };
  });
}

// @flow
import { startOfDay, endOfDay } from "date-fns";
import { normalizeUrl } from "../util/urls";
import type { GameChannel, Room, Index } from "./types";

// All games from the received game lists that are actually in progress:
// not over and with both a black and a white player
export function getLiveGames(games: Array<GameChannel>): Array<GameChannel> {
  return games.filter((game) => {
    let { players } = game;
    if (!players || game.over) {
      return false;
    }
    return !!(players.black && players.white);
  });
}

// TV -> Live is reserved for broadcasts, not "any strong game currently in
// progress" (that's what Watch is for): KGS-flagged server events
// (relayed tournament games, KGS Plus lectures) that are actually ongoing.
export function getLiveEventGames(
  games: Array<GameChannel>
): Array<GameChannel> {
  return getLiveGames(games).filter((game) => !!game.event);
}

// ---------------------------------------------------------------------------
// TV event calendar
// ---------------------------------------------------------------------------

export type TvPlatform = "youtube" | "twitch" | "other";

export type TvEvent = {
  id: string,
  name: string,
  date_start: string,
  date_end?: string,
  platform: TvPlatform,
  stream_url: string,
  video_id?: string,
  sgf_url?: string,
  notes?: string,
  channel?: { platform: "youtube" | "twitch", id: string },
  start?: string,
  source?: string,
};

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{6,}$/;

// Returns a valid TvEvent, or null if the entry is unusable (caller logs + skips)
export function validateTvEvent(value: Object): ?TvEvent {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  if (typeof value.id !== "string" || !value.id) {
    return null;
  }
  if (typeof value.name !== "string" || !value.name) {
    return null;
  }
  if (
    typeof value.date_start !== "string" ||
    isNaN(Date.parse(value.date_start))
  ) {
    return null;
  }
  if (
    value.date_end !== undefined &&
    value.date_end !== null &&
    (typeof value.date_end !== "string" || isNaN(Date.parse(value.date_end)))
  ) {
    return null;
  }
  if (
    value.platform !== "youtube" &&
    value.platform !== "twitch" &&
    value.platform !== "other"
  ) {
    return null;
  }
  if (typeof value.stream_url !== "string" || !value.stream_url) {
    return null;
  }
  for (let key of ["video_id", "sgf_url", "notes", "source"]) {
    if (
      value[key] !== undefined &&
      value[key] !== null &&
      typeof value[key] !== "string"
    ) {
      return null;
    }
  }
  if (
    value.start !== undefined &&
    value.start !== null &&
    (typeof value.start !== "string" || isNaN(Date.parse(value.start)))
  ) {
    return null;
  }
  let channel;
  if (value.channel !== undefined && value.channel !== null) {
    if (
      typeof value.channel !== "object" ||
      (value.channel.platform !== "youtube" &&
        value.channel.platform !== "twitch") ||
      typeof value.channel.id !== "string" ||
      !value.channel.id
    ) {
      return null;
    }
    channel = { platform: value.channel.platform, id: value.channel.id };
  }
  let event: TvEvent = {
    id: value.id,
    name: value.name,
    date_start: value.date_start,
    platform: value.platform,
    stream_url: value.stream_url,
  };
  if (value.date_end) {
    event.date_end = value.date_end;
  }
  if (value.video_id) {
    event.video_id = value.video_id;
  }
  if (value.sgf_url) {
    event.sgf_url = value.sgf_url;
  }
  if (value.notes) {
    event.notes = value.notes;
  }
  if (channel) {
    event.channel = channel;
  }
  if (value.start) {
    event.start = value.start;
  }
  if (value.source) {
    event.source = value.source;
  }
  return event;
}

// ---------------------------------------------------------------------------
// TV channels: a standing roster of YouTube/Twitch channels, independent of
// any specific event's dates (events.json's "channels" array). Shown in the
// Kalender tab's always-visible "Sender" section - see ChannelCard.
// ---------------------------------------------------------------------------

export type TvChannel = {
  id: string,
  name: string,
  platform: "youtube" | "twitch",
  url: string,
  channel_id: string,
  notes?: string,
};

// Returns a valid TvChannel, or null if the entry is unusable (caller logs
// + skips - same contract as validateTvEvent).
export function validateTvChannel(value: Object): ?TvChannel {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  if (typeof value.id !== "string" || !value.id) {
    return null;
  }
  if (typeof value.name !== "string" || !value.name) {
    return null;
  }
  if (value.platform !== "youtube" && value.platform !== "twitch") {
    return null;
  }
  if (typeof value.url !== "string" || !value.url) {
    return null;
  }
  if (typeof value.channel_id !== "string" || !value.channel_id) {
    return null;
  }
  if (
    value.notes !== undefined &&
    value.notes !== null &&
    typeof value.notes !== "string"
  ) {
    return null;
  }
  let channel: TvChannel = {
    id: value.id,
    name: value.name,
    platform: value.platform,
    url: value.url,
    channel_id: value.channel_id,
  };
  if (value.notes) {
    channel.notes = value.notes;
  }
  return channel;
}

// The community-editable calendar: anyone can open a pull request against
// this file without a client release. raw.githubusercontent.com always
// sends Access-Control-Allow-Origin: *, so this is fetchable directly from
// the browser - no proxy needed.
export const REMOTE_EVENTS_URL =
  "https://raw.githubusercontent.com/diebugger-tech/shinkgs/master/public/tv/events.json";
const LOCAL_EVENTS_URL = "tv/events.json";
const EVENTS_CACHE_MS = 60 * 60 * 1000; // 1 hour

type TvData = { events: Array<TvEvent>, channels: Array<TvChannel> };

let _tvDataCache: ?{ data: TvData, fetchedAt: number } = null;

function fetchAndValidateTvData(url: string): Promise<TvData> {
  return fetch(url)
    .then((res) => {
      if (!res.ok) {
        throw new Error("HTTP " + res.status);
      }
      return res.json();
    })
    .then((data) => {
      let rawEvents = data && Array.isArray(data.events) ? data.events : [];
      let events: Array<TvEvent> = [];
      for (let raw of rawEvents) {
        let event = validateTvEvent(raw);
        if (event) {
          events.push(event);
        } else {
          console.log("[tv] Skipping invalid calendar entry:", raw);
        }
      }
      // "channels" is a newer, second top-level array. An older
      // events.json (e.g. the remote copy before this field existed) has
      // none at all - that's an empty list, not an error.
      let rawChannels =
        data && Array.isArray(data.channels) ? data.channels : [];
      let channels: Array<TvChannel> = [];
      for (let raw of rawChannels) {
        let channel = validateTvChannel(raw);
        if (channel) {
          channels.push(channel);
        } else {
          console.log("[tv] Skipping invalid channel entry:", raw);
        }
      }
      return { events, channels };
    });
}

// Loads and validates the Go TV calendar data (events + standing channels):
// the remote copy on GitHub first (see REMOTE_EVENTS_URL), falling back to
// the bundled public/tv/events.json when offline or the remote fetch fails
// for any reason (network error, non-2xx, bad JSON, no valid entries after
// validation still counts as a successful - if empty - result, not a
// failure). Same validation either way. Successful results are cached in
// memory for an hour.
function fetchTvData(): Promise<TvData> {
  if (_tvDataCache && Date.now() - _tvDataCache.fetchedAt < EVENTS_CACHE_MS) {
    return Promise.resolve(_tvDataCache.data);
  }
  return fetchAndValidateTvData(REMOTE_EVENTS_URL)
    .catch((err) => {
      console.log(
        "[tv] Remote events.json unavailable, falling back to local copy:",
        err
      );
      return fetchAndValidateTvData(LOCAL_EVENTS_URL);
    })
    .then((data) => {
      _tvDataCache = { data, fetchedAt: Date.now() };
      return data;
    });
}

export function fetchTvEvents(): Promise<Array<TvEvent>> {
  return fetchTvData().then((data) => data.events);
}

// The standing channel roster (see TvChannel) - same source file and cache
// as fetchTvEvents(), always available regardless of any event's dates.
export function fetchTvChannels(): Promise<Array<TvChannel>> {
  return fetchTvData().then((data) => data.channels);
}

// Test-only: the module-level cache above would otherwise leak between
// tests (and between e.g. repeated dev-harness reloads in the same tab).
export function _resetTvEventsCache() {
  _tvDataCache = null;
}

// Extract a YouTube video id from a watch/share/embed/live/shorts URL.
// Channel URLs (@handle, /channel/..., /user/...) are not embeddable -> null.
export function getYouTubeVideoId(url: string): ?string {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    return null;
  }
  let host = parsed.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    let id = parsed.pathname.split("/")[1];
    return id && YOUTUBE_ID_RE.test(id) ? id : null;
  }
  if (host !== "youtube.com" && host !== "m.youtube.com") {
    return null;
  }
  if (parsed.pathname === "/watch") {
    let id = parsed.searchParams.get("v");
    return id && YOUTUBE_ID_RE.test(id) ? id : null;
  }
  let parts = parsed.pathname.split("/");
  if (
    (parts[1] === "embed" || parts[1] === "live" || parts[1] === "shorts") &&
    parts[2]
  ) {
    return YOUTUBE_ID_RE.test(parts[2]) ? parts[2] : null;
  }
  return null;
}

// Extract a Twitch channel name from a twitch.tv URL, or null for
// video/clip links or unrelated URLs
export function getTwitchChannel(url: string): ?string {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    return null;
  }
  let host = parsed.hostname.replace(/^www\./, "");
  if (host !== "twitch.tv" && host !== "m.twitch.tv") {
    return null;
  }
  let parts = parsed.pathname.split("/");
  let name = parts[1];
  if (
    !name ||
    name === "videos" ||
    name === "clip" ||
    name === "directory" ||
    name === "p"
  ) {
    return null;
  }
  return name;
}

// Whether event is "live" right now: now falls within [start of
// date_start, end of date_end (or date_start) if no date_end].
function isEventLiveToday(event: TvEvent, now: Date): boolean {
  let start = new Date(event.date_start);
  let end = event.date_end ? new Date(event.date_end) : start;
  let nowTime = now.getTime();
  return (
    nowTime >= startOfDay(start).getTime() && nowTime <= endOfDay(end).getTime()
  );
}

// Official embed URL for an event, or null if embedding is not possible
// (then the UI must only offer "Extern öffnen"). hostname is used for the
// Twitch parent parameter. A specific video_id always wins; failing that,
// while the event is live (today) its channel field (if set) embeds
// whatever that channel is currently streaming - last, falling back to
// whatever can be parsed out of stream_url itself.
export function getEmbedUrlForEvent(
  event: TvEvent,
  hostname?: string,
  now?: Date
): ?string {
  let host = hostname || "localhost";
  let live = isEventLiveToday(event, now || new Date());

  if (event.platform === "youtube") {
    let id = event.video_id || getYouTubeVideoId(event.stream_url);
    if (id) {
      return "https://www.youtube-nocookie.com/embed/" + id;
    }
    if (live && event.channel && event.channel.platform === "youtube") {
      return (
        "https://www.youtube-nocookie.com/embed/live_stream?channel=" +
        event.channel.id
      );
    }
    return null;
  }
  if (event.platform === "twitch") {
    if (event.video_id) {
      return (
        "https://player.twitch.tv/?video=" + event.video_id + "&parent=" + host
      );
    }
    let channel = getTwitchChannel(event.stream_url);
    if (channel) {
      return "https://player.twitch.tv/?channel=" + channel + "&parent=" + host;
    }
    if (live && event.channel && event.channel.platform === "twitch") {
      return (
        "https://player.twitch.tv/?channel=" +
        event.channel.id +
        "&parent=" +
        host
      );
    }
    return null;
  }
  return null;
}

const ARCHIVE_AFTER_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

// Groups events by time relative to now:
// today: live now (see isEventLiveToday); upcoming: starts later;
// past: ended less than 14 days ago; archive: ended 14+ days ago but kept
// around (video_id or sgf_url - there's a recording to watch/replay)
// instead of disappearing like a plain past event with nothing to show.
export function groupEventsByTime(
  events: Array<TvEvent>,
  now: Date
): {
  today: Array<TvEvent>,
  upcoming: Array<TvEvent>,
  past: Array<TvEvent>,
  archive: Array<TvEvent>,
} {
  let groups: {
    today: Array<TvEvent>,
    upcoming: Array<TvEvent>,
    past: Array<TvEvent>,
    archive: Array<TvEvent>,
  } = { today: [], upcoming: [], past: [], archive: [] };
  let nowTime = now.getTime();
  for (let event of events) {
    let start = new Date(event.date_start);
    if (isEventLiveToday(event, now)) {
      groups.today.push(event);
      continue;
    }
    if (nowTime < startOfDay(start).getTime()) {
      groups.upcoming.push(event);
      continue;
    }
    let end = event.date_end ? new Date(event.date_end) : start;
    let ageMs = nowTime - endOfDay(end).getTime();
    if (ageMs < ARCHIVE_AFTER_MS) {
      groups.past.push(event);
    } else if (event.video_id || event.sgf_url) {
      groups.archive.push(event);
    }
    // else: past its 14-day window with nothing recorded - drop it
  }
  for (let key of ["today", "upcoming", "past", "archive"]) {
    groups[(key: any)].sort(
      (a: TvEvent, b: TvEvent) =>
        new Date(a.date_start).getTime() - new Date(b.date_start).getTime()
    );
  }
  return groups;
}

// Calendar events that are live right now (the "today" bucket of
// groupEventsByTime - events.json only carries dates, not times of day).
export function getLiveEvents(
  events: Array<TvEvent>,
  now: Date
): Array<TvEvent> {
  return groupEventsByTime(events, now).today;
}

// The soonest event that hasn't started yet, or null. Used for the Live tab's
// empty state ("Gerade keine Übertragung" + nächstes Event).
export function getNextUpcomingEvent(
  events: Array<TvEvent>,
  now: Date
): ?TvEvent {
  return groupEventsByTime(events, now).upcoming[0] || null;
}

// Best-effort match between a watched KGS event game and a live calendar
// entry, so the stream can show up next to the board. events.json has no
// room/player fields to match against, so this is necessarily a heuristic:
// with exactly one broadcast live, that's it; with several, prefer one
// whose name/notes mentions the game's room (kgs_room) or a player
// (kgs_players), falling back to the first live entry otherwise.
export function getLiveEventForGame(
  game: GameChannel,
  events: Array<TvEvent>,
  roomsById: Index<Room>,
  now: Date
): ?TvEvent {
  if (!game.event) {
    return null;
  }
  let live = getLiveEvents(events, now);
  if (!live.length) {
    return null;
  }
  if (live.length === 1) {
    return live[0];
  }
  let needles = [];
  let room = game.roomId ? roomsById[game.roomId] : null;
  if (room && room.name) {
    needles.push(room.name.toLowerCase());
  }
  if (game.players) {
    for (let role of ["black", "white"]) {
      let user = game.players[(role: any)];
      if (user && user.name) {
        needles.push(user.name.toLowerCase());
      }
    }
  }
  let matched = live.find((event) => {
    let haystack = (event.name + " " + (event.notes || "")).toLowerCase();
    return needles.some((needle) => haystack.indexOf(needle) !== -1);
  });
  return matched || live[0];
}

// ---------------------------------------------------------------------------
// Stream URLs from chat
// ---------------------------------------------------------------------------

export type StreamUrlInfo = {
  platform: "youtube" | "twitch" | "other",
  embedUrl: ?string,
  externalUrl: string,
};

// Twitch video id from a twitch.tv/videos/<id> URL, or null
export function getTwitchVideoId(url: string): ?string {
  let parsed;
  try {
    parsed = new URL(normalizeUrl(url));
  } catch (e) {
    return null;
  }
  let host = parsed.hostname.replace(/^www\./, "");
  if (host !== "twitch.tv" && host !== "m.twitch.tv") {
    return null;
  }
  let parts = parsed.pathname.split("/");
  if (parts[1] === "videos" && parts[2] && /^\d+$/.test(parts[2])) {
    return parts[2];
  }
  return null;
}

// Info for an arbitrary stream URL from chat: official embed URL if possible,
// otherwise null (UI falls back to "Extern öffnen")
export function getStreamUrlInfo(
  url: string,
  hostname?: string
): StreamUrlInfo {
  let externalUrl = normalizeUrl(url);
  let host = hostname || "localhost";

  let youTubeId = getYouTubeVideoId(externalUrl);
  if (youTubeId) {
    return {
      platform: "youtube",
      embedUrl: "https://www.youtube-nocookie.com/embed/" + youTubeId,
      externalUrl,
    };
  }

  let twitchVideoId = getTwitchVideoId(externalUrl);
  if (twitchVideoId) {
    return {
      platform: "twitch",
      embedUrl:
        "https://player.twitch.tv/?video=" + twitchVideoId + "&parent=" + host,
      externalUrl,
    };
  }

  let twitchChannel = getTwitchChannel(externalUrl);
  if (twitchChannel) {
    return {
      platform: "twitch",
      embedUrl:
        "https://player.twitch.tv/?channel=" +
        twitchChannel +
        "&parent=" +
        host,
      externalUrl,
    };
  }

  let normalizedHost = "";
  try {
    normalizedHost = new URL(externalUrl).hostname.replace(/^www\./, "");
  } catch (e) {
    return { platform: "other", embedUrl: null, externalUrl };
  }
  if (
    normalizedHost === "youtube.com" ||
    normalizedHost === "m.youtube.com" ||
    normalizedHost === "youtu.be"
  ) {
    return { platform: "youtube", embedUrl: null, externalUrl };
  }
  if (normalizedHost === "twitch.tv" || normalizedHost === "m.twitch.tv") {
    return { platform: "twitch", embedUrl: null, externalUrl };
  }
  return { platform: "other", embedUrl: null, externalUrl };
}

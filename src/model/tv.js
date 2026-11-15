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
// progress" (that's what Watch is for): KGS-flagged server events that are
// actually ongoing AND real games - relayed tournament games, never KGS Plus
// lectures or reviews (those carry the event flag too). No rank threshold:
// a relayed tournament game is strong by definition (Andreas, 13.11.2026).
const REAL_GAME_TYPES = ["ranked", "free", "tournament"];

export function getLiveEventGames(
  games: Array<GameChannel>
): Array<GameChannel> {
  return getLiveGames(games).filter(
    (game) => !!game.event && REAL_GAME_TYPES.indexOf(game.type) !== -1
  );
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
  region?: "de" | "intl",
  // Which KGS boards belong to this broadcast (exact match, case-insensitive):
  // the KGS room the games are relayed in and/or the players' KGS names.
  kgs_room?: string,
  kgs_players?: Array<string>,
  // With "start": how long the broadcast runs (default LIVE_DEFAULT_MINUTES).
  duration_minutes?: number,
};

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{6,}$/;

// Live window for events with a precise start time (see getLiveWindow).
const LIVE_LEAD_MS = 15 * 60 * 1000; // pre-show: count as live 15 min early
const LIVE_DEFAULT_MINUTES = 240; // a round incl. commentary, if not given
const MAX_DURATION_MINUTES = 48 * 60;

function isStringList(value: mixed): boolean {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string" && !!item.trim())
  );
}

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
  if (
    value.region !== undefined &&
    value.region !== null &&
    value.region !== "de" &&
    value.region !== "intl"
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
  if (
    value.kgs_room !== undefined &&
    value.kgs_room !== null &&
    (typeof value.kgs_room !== "string" || !value.kgs_room.trim())
  ) {
    return null;
  }
  if (
    value.kgs_players !== undefined &&
    value.kgs_players !== null &&
    !isStringList(value.kgs_players)
  ) {
    return null;
  }
  if (
    value.duration_minutes !== undefined &&
    value.duration_minutes !== null &&
    (typeof value.duration_minutes !== "number" ||
      !(value.duration_minutes > 0) ||
      value.duration_minutes > MAX_DURATION_MINUTES)
  ) {
    return null;
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
  if (value.region) {
    event.region = value.region;
  }
  if (value.kgs_room) {
    event.kgs_room = value.kgs_room.trim();
  }
  if (value.kgs_players && value.kgs_players.length) {
    event.kgs_players = value.kgs_players.map((name) => name.trim());
  }
  if (value.duration_minutes) {
    event.duration_minutes = value.duration_minutes;
  }
  return event;
}

// Go TV only shows broadcasts with a video channel (Andreas, 13.11.2026):
// YouTube or Twitch, as a video/stream URL or a live channel. A tournament
// page without video ("other") stays out of Live and the calendar.
export function hasVideoStream(event: TvEvent): boolean {
  return (
    event.platform === "youtube" ||
    event.platform === "twitch" ||
    !!event.channel
  );
}

// region's effective value for display/grouping purposes - missing on an
// event (e.g. every hand-maintained entry predating this field) means
// "intl", not an error (see validateTvEvent).
export function getEventRegion(event: TvEvent): "de" | "intl" {
  return event.region === "de" ? "de" : "intl";
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
  // The desktop timer updates the installed local copy without a new build.
  let desktop = process.env.REACT_APP_API_URL === "/json/access";
  let cacheMs = desktop ? 5 * 60 * 1000 : EVENTS_CACHE_MS;
  if (_tvDataCache && Date.now() - _tvDataCache.fetchedAt < cacheMs) {
    return Promise.resolve(_tvDataCache.data);
  }
  return fetchAndValidateTvData(desktop ? LOCAL_EVENTS_URL : REMOTE_EVENTS_URL)
    .catch((err) => {
      console.log(
        "[tv] Primary events.json unavailable, trying fallback:",
        err
      );
      return fetchAndValidateTvData(
        desktop ? REMOTE_EVENTS_URL : LOCAL_EVENTS_URL
      );
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

// When an event counts as live. With a precise "start" on a single day:
// from 15 min before start until start + duration_minutes (default 4 h) -
// a 19:00 broadcast is not "live" all morning. Date-only events and
// multi-day events (no per-day times in events.json) stay whole days.
export function getLiveWindow(event: TvEvent): { start: Date, end: Date } {
  let dayStart = new Date(event.date_start);
  let dayEnd = event.date_end ? new Date(event.date_end) : dayStart;
  let singleDay =
    startOfDay(dayEnd).getTime() === startOfDay(dayStart).getTime();
  if (event.start && singleDay) {
    let start = new Date(event.start).getTime();
    let minutes = event.duration_minutes || LIVE_DEFAULT_MINUTES;
    return {
      start: new Date(start - LIVE_LEAD_MS),
      end: new Date(start + minutes * 60 * 1000),
    };
  }
  return { start: startOfDay(dayStart), end: endOfDay(dayEnd) };
}

function isEventLiveNow(event: TvEvent, now: Date): boolean {
  let { start, end } = getLiveWindow(event);
  let nowTime = now.getTime();
  return nowTime >= start.getTime() && nowTime <= end.getTime();
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
  let live = isEventLiveNow(event, now || new Date());

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

// Official embed URL for a standing channel (see TvChannel) - always
// defined, since a channel's platform+channel_id are required/validated
// fields (unlike TvEvent, where embedding can be impossible). Reuses the
// exact live-channel embed shapes from getEmbedUrlForEvent/415b1d7. There
// is no keyless, client-side way to know in advance whether the channel
// is actually broadcasting right now (see AGENTS.md roadmap item b) - if
// it isn't, the official player shows its own "offline" state once
// loaded; StreamEmbed's placeholder sets that expectation before the
// two-click load.
export function getEmbedUrlForChannel(
  channel: TvChannel,
  hostname?: string
): string {
  let host = hostname || "localhost";
  if (channel.platform === "youtube") {
    return (
      "https://www.youtube-nocookie.com/embed/live_stream?channel=" +
      channel.channel_id
    );
  }
  return (
    "https://player.twitch.tv/?channel=" +
    channel.channel_id +
    "&parent=" +
    host
  );
}

const ARCHIVE_AFTER_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

// Groups events by time relative to now:
// today: live now (see getLiveWindow); upcoming: starts later;
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
    let window = getLiveWindow(event);
    if (isEventLiveNow(event, now)) {
      groups.today.push(event);
      continue;
    }
    if (nowTime < window.start.getTime()) {
      groups.upcoming.push(event);
      continue;
    }
    let ageMs = nowTime - window.end.getTime();
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

// Splits events into the two Kalender-tab region groups (see
// TvEvent.region/getEventRegion) and sorts each by start date. Used by
// CalendarView for its own rendering only - independent of
// groupEventsByTime, which keeps its existing today/upcoming/past/archive
// semantics unchanged (the Live tab's getLiveEvents/getNextUpcomingEvent
// depend on that exact shape and are not affected by this grouping).
export function groupEventsByRegion(
  events: Array<TvEvent>
): { de: Array<TvEvent>, intl: Array<TvEvent> } {
  let groups: { de: Array<TvEvent>, intl: Array<TvEvent> } = {
    de: [],
    intl: [],
  };
  for (let event of events) {
    groups[getEventRegion(event)].push(event);
  }
  for (let key of ["de", "intl"]) {
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

// Whether a KGS event game belongs to a broadcast: explicit fields only
// (events.json kgs_room / kgs_players), compared exactly and
// case-insensitively. No guessing from event names any more - a game
// without a matching broadcast stays in Watch.
export function gameMatchesEvent(
  game: GameChannel,
  event: TvEvent,
  roomsById: Index<Room>
): boolean {
  let norm = (s: ?string) => (s || "").trim().toLowerCase();
  if (event.kgs_room) {
    let room = game.roomId ? roomsById[game.roomId] : null;
    if (room && room.name && norm(room.name) === norm(event.kgs_room)) {
      return true;
    }
  }
  if (event.kgs_players && game.players) {
    let wanted = event.kgs_players.map(norm);
    for (let role of Object.keys(game.players)) {
      let user = game.players[(role: any)];
      if (user && user.name && wanted.indexOf(norm(user.name)) !== -1) {
        return true;
      }
    }
  }
  return false;
}

// The live video broadcast a watched KGS event game belongs to, or null.
export function getLiveEventForGame(
  game: GameChannel,
  events: Array<TvEvent>,
  roomsById: Index<Room>,
  now: Date
): ?TvEvent {
  if (!game.event) {
    return null;
  }
  let live = getLiveEvents(events, now).filter(hasVideoStream);
  return live.find((event) => gameMatchesEvent(game, event, roomsById)) || null;
}

export type TvBroadcast = {
  event: TvEvent,
  games: Array<GameChannel>,
};

// TV -> Live: every broadcast that is live right now AND has a video channel,
// each with the KGS boards relayed for it (may be none - e.g. an
// international tournament shown on YouTube only). KGS event games that
// match no broadcast are not part of Live. Keep finished boards still present
// in the list so the card can show their status during the live broadcast.
export function getLiveBroadcasts(
  games: Array<GameChannel>,
  events: Array<TvEvent>,
  roomsById: Index<Room>,
  now: Date
): Array<TvBroadcast> {
  let eventGames = games.filter(
    (game) =>
      game.event &&
      !game.deletedTime &&
      REAL_GAME_TYPES.indexOf(game.type) !== -1 &&
      game.players &&
      game.players.black &&
      game.players.white
  );
  return getLiveEvents(events, now)
    .filter(hasVideoStream)
    .map((event) => ({
      event,
      games: eventGames.filter((game) =>
        gameMatchesEvent(game, event, roomsById)
      ),
    }));
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

// Chat/share URLs may spell the same channel or video differently.
export function getBroadcastForStream(
  broadcasts: Array<TvBroadcast>,
  url: string
): ?TvBroadcast {
  let normalized = normalizeUrl(url);
  let videoId = getYouTubeVideoId(normalized);
  let twitchChannel = getTwitchChannel(normalized);
  return (
    broadcasts.find(({ event }) => {
      if (normalized === normalizeUrl(event.stream_url)) {
        return true;
      }
      if (videoId) {
        return (
          videoId === (event.video_id || getYouTubeVideoId(event.stream_url))
        );
      }
      if (twitchChannel) {
        let channel =
          event.channel && event.channel.platform === "twitch"
            ? event.channel.id
            : getTwitchChannel(event.stream_url);
        return (
          !!channel && channel.toLowerCase() === twitchChannel.toLowerCase()
        );
      }
      return false;
    }) || null
  );
}

// @flow
import { startOfDay, endOfDay } from "date-fns";
import { normalizeUrl } from "../util/urls";
import type { GameChannel } from "./types";

// Rank value of the weaker player in a game, or null if it can't be determined
// (missing players or no rankVal). rankVal semantics (see parseRankVal in
// model/user.js): kyu < 0, dan 1-9, pro >= 11, unranked -9999.
export function getWeakerPlayerRankVal(game: GameChannel): ?number {
  let { players } = game;
  if (!players) {
    return null;
  }
  let vals: Array<number> = [];
  for (let role of ["black", "white"]) {
    let user = players[(role: any)];
    if (user && typeof user.rankVal === "number") {
      vals.push(user.rankVal);
    }
  }
  if (!vals.length) {
    return null;
  }
  return Math.min(...vals);
}

// dan rank (1d or better) as numeric rankVal; pro ranks count as dan or better
export function isDanRankVal(rankVal: number): boolean {
  return rankVal >= 1;
}

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

// Sort live games by strength: the rank of the weaker player decides,
// dan before kyu (pro before dan). Games with unknown strength go last.
export function sortGamesByStrength(
  games: Array<GameChannel>
): Array<GameChannel> {
  let sorted = [...games];
  sorted.sort((a, b) => {
    let ar = getWeakerPlayerRankVal(a);
    let br = getWeakerPlayerRankVal(b);
    let av = ar === null || ar === undefined ? -Infinity : ar;
    let bv = br === null || br === undefined ? -Infinity : br;
    if (av === bv) {
      return (a.id || 0) - (b.id || 0);
    }
    return bv - av;
  });
  return sorted;
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
  for (let key of ["video_id", "sgf_url", "notes"]) {
    if (
      value[key] !== undefined &&
      value[key] !== null &&
      typeof value[key] !== "string"
    ) {
      return null;
    }
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
  return event;
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

// Official embed URL for an event, or null if embedding is not possible
// (then the UI must only offer "Extern öffnen"). hostname is used for the
// Twitch parent parameter.
export function getEmbedUrlForEvent(
  event: TvEvent,
  hostname?: string
): ?string {
  if (event.platform === "youtube") {
    let id = event.video_id || getYouTubeVideoId(event.stream_url);
    if (id) {
      return "https://www.youtube-nocookie.com/embed/" + id;
    }
    return null;
  }
  if (event.platform === "twitch") {
    let host = hostname || "localhost";
    if (event.video_id) {
      return (
        "https://player.twitch.tv/?video=" + event.video_id + "&parent=" + host
      );
    }
    let channel = getTwitchChannel(event.stream_url);
    if (channel) {
      return "https://player.twitch.tv/?channel=" + channel + "&parent=" + host;
    }
    return null;
  }
  return null;
}

// Groups events by time relative to now:
// today: now within [start of date_start, end of date_end (or date_start)]
// upcoming: starts later; past: everything before
export function groupEventsByTime(
  events: Array<TvEvent>,
  now: Date
): { today: Array<TvEvent>, upcoming: Array<TvEvent>, past: Array<TvEvent> } {
  let groups: {
    today: Array<TvEvent>,
    upcoming: Array<TvEvent>,
    past: Array<TvEvent>,
  } = { today: [], upcoming: [], past: [] };
  let nowTime = now.getTime();
  for (let event of events) {
    let start = new Date(event.date_start);
    let end = event.date_end ? new Date(event.date_end) : start;
    if (
      nowTime >= startOfDay(start).getTime() &&
      nowTime <= endOfDay(end).getTime()
    ) {
      groups.today.push(event);
    } else if (nowTime < startOfDay(start).getTime()) {
      groups.upcoming.push(event);
    } else {
      groups.past.push(event);
    }
  }
  for (let key of ["today", "upcoming", "past"]) {
    groups[(key: any)].sort(
      (a: TvEvent, b: TvEvent) =>
        new Date(a.date_start).getTime() - new Date(b.date_start).getTime()
    );
  }
  return groups;
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

#!/usr/bin/env python3
"""Updater for public/tv/events.json, with three independent sources
selected via --source. Standard library only, by design (AGENTS.md).
Both sources share the same read/merge/write path and the same
idempotency contract (identical input -> byte-identical output); each
source only ever touches its own entries (events.json "source" field).

--source twitch-egf (default, unchanged since its introduction):
  EuropeanGoFederation Twitch schedule (official Twitch Helix "Get
  Channel iCalendar" endpoint).

  Auth status (checked 2026-11-12 on the official Twitch Developer Forum,
  see AGENTS.md roadmap for the pending decision this implies):

    - GET https://api.twitch.tv/helix/schedule/icalendar?broadcaster_id=<ID>
      itself needs NO authentication. Confirmed by a Twitch staffer on
      https://discuss.dev.twitch.com/t/.../32137 ("getting the iCalendar
      doesn't require authentication") and by the fact that it's designed
      to be used as a plain webcal:// subscription URL in calendar apps,
      which has no way to attach an auth header at all.
    - BUT calling it needs the channel's *numeric* broadcaster_id, not its
      login name ("europeangofederation"). Resolving a login to that id
      via the official "Get Users" endpoint (api.twitch.tv/helix/users)
      DOES need Twitch API auth - at minimum a Client-ID, practically an
      app access token (Client-ID + Client-Secret, client-credentials
      flow). There is also an unofficial, no-registration-needed way
      (Twitch's own public web client-id via their undocumented GQL API,
      as used by e.g. yt-dlp/streamlink) but it is not an officially
      documented or sanctioned path.

  This script therefore does NOT resolve a channel login to a
  broadcaster_id on its own. Give it one of:
    --broadcaster-id <numeric id>   (no auth needed for this call)
    --ics-file <path>               (skip the live fetch entirely)

--source dgob: Deutscher Go-Bund tournament calendar (public WordPress
  "The Events Calendar" JSON REST API, no key):
    https://www.dgob.de/wp-json/tribe/events/v1/events?start_date=<date>&per_page=50
  Only go-bundesliga / online-turnier / deutsche-meisterschaft events are
  imported (DGOB_CATEGORIES), tagged region: "de". See the DGoB section
  below for the categories-filter-vs-pagination caveat and the all_day
  caveat, both confirmed live against the real API on 2026-11-13.

--source egf-calendar: EGF Grand Prix circuit calendar (server-rendered
  HTML table, no API - eurogofed.org exposes only the generic WP REST API,
  no events-calendar namespace, verified 2026-11-14):
    https://www.eurogofed.org/grandprix/bt<year>/
  This is the curated ~11-tournament/year Bonus-Point circuit page, not
  the much noisier "all 31 upcoming events from every EGF member country"
  widget on the homepage - deliberately the smaller, higher-signal list.
  German entries are skipped (EGF_CALENDAR_EXCLUDED_COUNTRIES): DGOB_
  CATEGORIES (or hand-curation when that filter misses one, see commit
  1e3f676) already owns them, so importing them here too would risk a
  duplicate calendar entry for the same physical tournament. No video/
  channel info exists on this page, so every entry is platform "other".

Usage:
  python3 tools/update_events.py --source twitch-egf --broadcaster-id 123456789 --dry-run
  python3 tools/update_events.py --source twitch-egf --ics-file schedule.ics
  python3 tools/update_events.py --source dgob --dry-run
  python3 tools/update_events.py --source dgob
  python3 tools/update_events.py --source egf-calendar --dry-run
  python3 tools/update_events.py --source egf-calendar --egf-html-file page.html
"""
import argparse
import datetime
import html
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

try:
    import zoneinfo
except ImportError:  # pragma: no cover - Python < 3.9
    zoneinfo = None

SOURCE = "twitch-egf"
CHANNEL_LOGIN = "europeangofederation"
EVENTS_JSON_PATH = (
    Path(__file__).resolve().parent.parent / "public" / "tv" / "events.json"
)
ICALENDAR_URL_TEMPLATE = (
    "https://api.twitch.tv/helix/schedule/icalendar?broadcaster_id={broadcaster_id}"
)


class IcsEvent:
    def __init__(self, uid, summary, dtstart, cancelled):
        self.uid = uid
        self.summary = summary
        self.dtstart = dtstart  # timezone-aware datetime
        self.cancelled = cancelled


def _unfold_ics_lines(text):
    """RFC5545 line unfolding: a line starting with a space/tab is a
    continuation of the previous line (long lines get wrapped like
    this in ICS output)."""
    lines = text.replace("\r\n", "\n").split("\n")
    unfolded = []
    for line in lines:
        if line.startswith(" ") or line.startswith("\t"):
            if unfolded:
                unfolded[-1] += line[1:]
            continue
        unfolded.append(line)
    return unfolded


def _parse_ics_datetime(value, params):
    """Parses one DTSTART/DTEND value + its parameters into an aware
    datetime. Twitch emits e.g.
    'DTSTART;TZID=Europe/Berlin:20261120T190000' - sometimes with a
    buggy leading slash on the TZID
    (https://github.com/collective/icalendar/issues/466), stripped here."""
    if value.endswith("Z"):
        return datetime.datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(
            tzinfo=datetime.timezone.utc
        )
    dt = datetime.datetime.strptime(value, "%Y%m%dT%H%M%S")
    tzid = params.get("TZID")
    if tzid and zoneinfo is not None:
        tzid = tzid.lstrip("/")
        try:
            return dt.replace(tzinfo=zoneinfo.ZoneInfo(tzid))
        except Exception:
            pass
    return dt.replace(tzinfo=datetime.timezone.utc)


def _unescape_ics_text(value):
    return value.replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\")


def parse_ics(text):
    """Parses the VEVENTs out of an ICS text into IcsEvent objects.
    Recurring events (RRULE) are skipped with a warning on stderr -
    expanding recurrence rules correctly is out of scope here, and
    one-off tournament broadcasts are not expected to recur weekly in
    the first place."""
    lines = _unfold_ics_lines(text)
    events = []
    current = None
    for line in lines:
        if line == "BEGIN:VEVENT":
            current = {}
            continue
        if line == "END:VEVENT":
            if current is not None:
                if "RRULE" in current:
                    print(
                        "[update_events] Skipping recurring VEVENT (RRULE) - "
                        "recurrence expansion is not implemented: UID="
                        + str(current.get("UID")),
                        file=sys.stderr,
                    )
                else:
                    uid = current.get("UID")
                    dtstart_raw = current.get("DTSTART")
                    if uid and dtstart_raw:
                        value, params = dtstart_raw
                        events.append(
                            IcsEvent(
                                uid=uid,
                                summary=current.get("SUMMARY", ""),
                                dtstart=_parse_ics_datetime(value, params),
                                cancelled=current.get("STATUS", "").upper()
                                == "CANCELLED",
                            )
                        )
            current = None
            continue
        if current is None or ":" not in line:
            continue
        key_part, _, value = line.partition(":")
        key_parts = key_part.split(";")
        key = key_parts[0]
        if key in ("DTSTART", "DTEND"):
            params = {}
            for p in key_parts[1:]:
                if "=" in p:
                    pk, _, pv = p.partition("=")
                    params[pk] = pv
            current[key] = (value, params)
        elif key == "RRULE":
            current["RRULE"] = value
        elif key in ("UID", "SUMMARY", "STATUS"):
            current[key] = _unescape_ics_text(value)
    return events


def fetch_ics_text(broadcaster_id):
    url = ICALENDAR_URL_TEMPLATE.format(broadcaster_id=broadcaster_id)
    with urllib.request.urlopen(url, timeout=20) as res:
        return res.read().decode("utf-8")


def stable_id(raw_id, source=SOURCE):
    # Namespaced by source so it can never collide with a hand-maintained id.
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", raw_id).strip("-").lower()
    return source + "-" + slug


def ics_event_to_tv_event(ics_event):
    return {
        "id": stable_id(ics_event.uid),
        "name": ics_event.summary or "EGF Twitch Stream",
        "date_start": ics_event.dtstart.date().isoformat(),
        "start": ics_event.dtstart.isoformat(),
        "platform": "twitch",
        "stream_url": "https://www.twitch.tv/" + CHANNEL_LOGIN,
        "channel": {"platform": "twitch", "id": CHANNEL_LOGIN},
        "source": SOURCE,
    }


def load_events(path):
    if not path.exists():
        return {"events": []}
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _merge_source_events(existing_events, fresh_by_id, source):
    """Shared diff/merge core for a single source's entries: hand-maintained
    entries and entries from any OTHER source are never touched. This
    source's existing entries are matched by id against fresh_by_id and
    added/updated/removed to reflect it. Pulled out of merge_events (the
    original, twitch-egf-only implementation) so a second source
    (merge_dgob_events) can reuse the exact same kept/diff/sort contract
    instead of a parallel copy - merge_events's own signature/behavior is
    unchanged by this refactor."""
    kept = [e for e in existing_events if e.get("source") != source]
    old_by_id = {e["id"]: e for e in existing_events if e.get("source") == source}

    added, updated, removed = [], [], []
    for id_, tv_event in fresh_by_id.items():
        if id_ not in old_by_id:
            added.append(tv_event)
        elif old_by_id[id_] != tv_event:
            updated.append(tv_event)
    for id_, old_event in old_by_id.items():
        if id_ not in fresh_by_id:
            removed.append(old_event)

    merged_imported = sorted(fresh_by_id.values(), key=lambda e: e["date_start"])
    return kept + merged_imported, added, updated, removed


def merge_events(existing_events, fresh_ics_events):
    """Hand-maintained entries (no "source") and entries from any other
    source are never touched. Entries with source == SOURCE are matched
    by id and added/updated/removed to reflect the fresh fetch - a
    cancelled (STATUS:CANCELLED) or vanished Twitch segment is a
    removal, same as any entry the fresh fetch no longer reports."""
    fresh_by_id = {}
    for ics_event in fresh_ics_events:
        if ics_event.cancelled:
            continue
        tv_event = ics_event_to_tv_event(ics_event)
        fresh_by_id[tv_event["id"]] = tv_event
    return _merge_source_events(existing_events, fresh_by_id, SOURCE)


def format_diff(added, updated, removed):
    lines = []
    if added:
        lines.append("Would add %d event(s):" % len(added))
        for e in added:
            lines.append('  + %s: "%s" (%s)' % (e["id"], e["name"], e["date_start"]))
    if updated:
        lines.append("Would update %d event(s):" % len(updated))
        for e in updated:
            lines.append('  ~ %s: "%s" (%s)' % (e["id"], e["name"], e["date_start"]))
    if removed:
        lines.append("Would remove %d event(s):" % len(removed))
        for e in removed:
            lines.append('  - %s: "%s" (%s)' % (e["id"], e["name"], e["date_start"]))
    if not (added or updated or removed):
        lines.append("No changes.")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# DGoB (Deutscher Go-Bund) import - see module docstring for the endpoint.
# ---------------------------------------------------------------------------

DGOB_SOURCE = "dgob"
DGOB_BASE_URL = "https://www.dgob.de/wp-json/tribe/events/v1/events"
DGOB_CATEGORIES = ("go-bundesliga", "online-turnier", "deutsche-meisterschaft")
DGOB_RETENTION_DAYS = 90
DGOB_USER_AGENT = (
    "shinkgs-go-tv-dgob-importer/1.0 (+https://github.com/diebugger-tech/GoTV)"
)
DGOB_STREAM_MAP_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "dgob_streams.json"
)
DGOB_MAX_PAGES = 50  # sanity bound against a pagination loop, not a real limit

_DGOB_DT_RE = re.compile(r"^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$")
_HTML_TAG_RE = re.compile(r"<[^>]+>")
# Video links the DGoB event description itself names (href targets only,
# e.g. the German Championship final 2026: "auf Twitch übertragen" ->
# twitch.tv/egf_games). Twitch: a channel or /videos/<id>; YouTube: watch,
# live, @handle, channel, youtu.be. Nothing else (e.g. a page that merely
# mentions "KGS") is interpreted - verified 2026-11-13: no DGoB entry
# names a KGS room, so no KGS field is derived here.
_HREF_RE = re.compile(r"""href\s*=\s*["']([^"']+)["']""", re.I)
_TWITCH_LINK_RE = re.compile(
    r"^https?://(?:www\.)?twitch\.tv/(?!directory\b|search\b|p/)"
    r"[A-Za-z0-9_]{3,25}/?$",
    re.I,
)
_TWITCH_VIDEO_LINK_RE = re.compile(r"^https?://(?:www\.)?twitch\.tv/videos/\d+/?$", re.I)
_YOUTUBE_LINK_RE = re.compile(
    r"^https?://(?:(?:www|m)\.)?(?:youtube\.com/(?:watch\?v=[\w-]{6,}|live/[\w-]{6,}"
    r"|@[\w.-]+|channel/[\w-]+)|youtu\.be/[\w-]{6,})[^\s]*$",
    re.I,
)


def dgob_video_links(raw_event):
    """Twitch/YouTube links (platform, url) from the event description's
    href attributes, in document order, deduplicated. Empty if the page
    names no video channel - such an entry stays a calendar-only
    tournament page (platform "other"), never shown under Live."""
    links, seen = [], set()
    for href in _HREF_RE.findall(raw_event.get("description") or ""):
        url = html.unescape(href).strip()
        if url in seen:
            continue
        if _TWITCH_LINK_RE.match(url) or _TWITCH_VIDEO_LINK_RE.match(url):
            platform = "twitch"
        elif _YOUTUBE_LINK_RE.match(url):
            platform = "youtube"
        else:
            continue
        seen.add(url)
        links.append((platform, url))
    return links


class DgobFetchError(Exception):
    """Raised for any DGoB fetch/parse failure: network error exceeding
    retries, non-2xx, invalid JSON, unexpected shape, or total=0 - the
    4 conditions requirement 5 lists as "do not write events.json"."""


def _clean_dgob_title(raw_title):
    """Strips HTML tags (titles come as e.g. "<b>...</b>") and decodes
    entities (e.g. &#8211; -> the en dash actually used, &#8217; -> ')."""
    return html.unescape(_HTML_TAG_RE.sub("", raw_title or "")).strip()


def _parse_dgob_datetime(value):
    """Splits a DGoB 'YYYY-MM-DD HH:MM:SS' field into (date, time) strings.
    Raises ValueError on anything else - callers let this abort the whole
    run (see main()), consistent with treating an unexpected API shape as
    a safety-net condition rather than silently mapping garbage."""
    m = _DGOB_DT_RE.match(value or "")
    if not m:
        raise ValueError("unparseable DGoB datetime: %r" % value)
    return m.group(1), m.group(2)


def _to_iso_utc(value):
    date_part, time_part = _parse_dgob_datetime(value)
    return date_part + "T" + time_part + "Z"


def dgob_matches_categories(raw_event, categories):
    event_slugs = {c.get("slug") for c in raw_event.get("categories") or []}
    return bool(event_slugs & set(categories))


def _fetch_json(url, timeout, retries):
    """GETs url and parses it as JSON, retrying network failures `retries`
    extra times (so retries=1 means up to 2 attempts total). A malformed
    JSON body is NOT retried - that is a server-content problem retrying
    won't fix - and raises DgobFetchError immediately."""
    last_err = None
    for attempt in range(retries + 1):
        try:
            request = urllib.request.Request(
                url, headers={"User-Agent": DGOB_USER_AGENT}
            )
            with urllib.request.urlopen(request, timeout=timeout) as res:
                body = res.read().decode("utf-8")
            try:
                return json.loads(body)
            except json.JSONDecodeError as err:
                raise DgobFetchError("invalid JSON from %s: %s" % (url, err))
        except DgobFetchError:
            raise
        except (urllib.error.URLError, OSError) as err:
            last_err = err
    raise DgobFetchError(
        "failed to fetch %s after %d attempt(s): %s" % (url, retries + 1, last_err)
    )


def fetch_dgob_events(start_date, timeout=20, retries=1):
    """Fetches ALL upcoming DGoB events from start_date (YYYY-MM-DD, UTC),
    following next_rest_url across every page, and returns the raw event
    dicts (category filtering happens separately, client-side, via
    dgob_matches_categories - see why below). Raises DgobFetchError on any
    network/shape/JSON failure, or if the API's own "total" is 0.

    The categories= query parameter DOES work correctly for a single
    request (verified live 2026-11-13: categories=go-bundesliga,online-
    turnier,deutsche-meisterschaft returned exactly the union of those
    3 slugs' events, matching arithmetic exactly). It is NOT sent here
    anyway, because next_rest_url does not carry it forward: paginating
    a categories-filtered first request's next_rest_url silently drops
    the categories param and returns the FULL unfiltered next page
    instead (confirmed live the same day - see the task report). Per
    requirement 1's own fallback rule ("falls nicht zuverlässig -> alle
    Events holen und clientseitig filtern"), this fetches everything
    and leaves the category match to dgob_matches_categories().
    """
    url = DGOB_BASE_URL + "?" + urllib.parse.urlencode(
        {"start_date": start_date, "per_page": 50}
    )
    events = []
    seen_urls = set()
    page_num = 1
    while url:
        if page_num > DGOB_MAX_PAGES or url in seen_urls:
            raise DgobFetchError("pagination loop or runaway page count at %s" % url)
        seen_urls.add(url)
        data = _fetch_json(url, timeout, retries)
        if not isinstance(data, dict) or not isinstance(data.get("events"), list):
            raise DgobFetchError("unexpected response shape (no 'events' list)")
        if page_num == 1 and not data.get("total"):
            raise DgobFetchError("API reports total=0 events")
        events.extend(data["events"])
        url = data.get("next_rest_url") or None
        page_num += 1
    return events


def load_dgob_stream_map(path):
    """data/dgob_streams.json: a small, manually maintained mapping from
    either a specific DGoB event id or a DGoB category slug to one of
    events.json's existing channels[].id - see _resolve_dgob_channel.
    Ships empty (no assignment guessed/invented); missing file -> empty
    map, same as an empty file (not an error)."""
    path = Path(path)
    if not path.exists():
        return {"by_dgob_id": {}, "by_category": {}}
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    return {
        "by_dgob_id": data.get("by_dgob_id") or {},
        "by_category": data.get("by_category") or {},
    }


def _resolve_dgob_channel(raw_event, stream_map, channels_by_id):
    """Resolves one DGoB event to an existing events.json channel entry:
    by_dgob_id (a specific event override) wins, else the first of the
    event's own categories (in DGoB's own listed order) that has a
    by_category assignment. Returns the TvEvent.channel shape
    ({"platform", "id"} - note "id" there is the raw platform channel
    id, i.e. the matched TvChannel's channel_id, NOT its own events.json
    "id") or None if nothing matches / the referenced channel doesn't
    exist in channels_by_id."""
    channel_ref_id = stream_map["by_dgob_id"].get(str(raw_event.get("id")))
    if not channel_ref_id:
        for cat in raw_event.get("categories") or []:
            slug = cat.get("slug")
            if slug and slug in stream_map["by_category"]:
                channel_ref_id = stream_map["by_category"][slug]
                break
    if not channel_ref_id:
        return None
    channel = channels_by_id.get(channel_ref_id)
    if not channel:
        return None
    return {"platform": channel["platform"], "id": channel["channel_id"]}


def dgob_event_to_tv_event(raw_event, stream_map, channels_by_id):
    """Maps one raw DGoB API event to the existing events.json TvEvent
    shape. See the module docstring + task report for the all_day/UTC
    reasoning: all_day is only trusted once cross-checked against the
    LOCAL start_date's own clock time (utc_start_date/utc_end_date are
    always used for the actual instant, exactly as required - their
    offset from local midnight is normal and not itself a sign of a
    buggy all_day flag)."""
    local_start_date, local_start_time = _parse_dgob_datetime(
        raw_event.get("start_date")
    )
    local_end_date, _local_end_time = _parse_dgob_datetime(raw_event.get("end_date"))

    channel_ref = _resolve_dgob_channel(raw_event, stream_map, channels_by_id)

    tv_event = {
        "id": DGOB_SOURCE + "-" + str(raw_event["id"]),
        "name": _clean_dgob_title(raw_event.get("title")),
        "date_start": local_start_date,
        "platform": channel_ref["platform"] if channel_ref else "other",
        "stream_url": raw_event.get("website") or raw_event.get("url") or "",
        "region": "de",
        "source": DGOB_SOURCE,
    }
    if local_end_date != local_start_date:
        tv_event["date_end"] = local_end_date

    # all_day is unreliable (the Go-Bundesliga entries are a 2-hour online
    # match flagged all_day=true) - only trust it once the LOCAL start time
    # is actually midnight. utc_start_date showing a non-00:00 clock time
    # for a genuinely all-day multi-day event is normal (UTC offset of
    # local midnight) and is not checked here.
    is_genuinely_all_day = bool(raw_event.get("all_day")) and local_start_time == (
        "00:00:00"
    )
    if not is_genuinely_all_day:
        tv_event["start"] = _to_iso_utc(raw_event.get("utc_start_date"))

    venue = raw_event.get("venue")
    venue_name = venue.get("venue") if isinstance(venue, dict) else None
    notes = [venue_name] if venue_name else []

    # A video link named on the DGoB page itself wins over the channel map:
    # it is the specific stream for this event. The first one becomes the
    # stream; further ones are listed in the notes (no ranking guessed).
    video_links = dgob_video_links(raw_event)
    if video_links:
        tv_event["platform"], tv_event["stream_url"] = video_links[0]
        if len(video_links) > 1:
            notes.append(
                "Weitere Streams: " + ", ".join(url for _p, url in video_links[1:])
            )
    if notes:
        tv_event["notes"] = " · ".join(notes)

    if channel_ref:
        tv_event["channel"] = channel_ref

    return tv_event


def _dgob_event_reference_date(tv_event):
    return datetime.date.fromisoformat(tv_event.get("date_end") or tv_event["date_start"])


def _merge_with_retention(
    existing_events, fresh_tv_events, source, retention_days, today_date
):
    """Generic core behind merge_dgob_events (requirement 3 there): kept/
    added/updated/removed, but a PAST entry missing from the fresh fetch
    is only dropped once it is more than retention_days past (mirroring
    groupEventsByTime's own archive window) - normal for any source whose
    upstream API/page only ever lists events from "today" forward. A
    FUTURE entry missing from the fresh fetch really did disappear
    upstream (e.g. cancelled) and is removed right away. Shared by every
    source with this same "upstream never lists the past" shape (dgob,
    egf-calendar) - see merge_dgob_events / merge_egf_bt_events."""
    kept = [e for e in existing_events if e.get("source") != source]
    old_by_id = {e["id"]: e for e in existing_events if e.get("source") == source}
    fresh_by_id = {e["id"]: e for e in fresh_tv_events}

    added, updated, removed = [], [], []
    for id_, tv_event in fresh_by_id.items():
        if id_ not in old_by_id:
            added.append(tv_event)
        elif old_by_id[id_] != tv_event:
            updated.append(tv_event)

    retained_old = []
    for id_, old_event in old_by_id.items():
        if id_ in fresh_by_id:
            continue
        reference_date = _dgob_event_reference_date(old_event)
        age_days = (today_date - reference_date).days
        if age_days < 0 or age_days > retention_days:
            # still in the future (vanished upstream) or past retention
            removed.append(old_event)
        else:
            retained_old.append(old_event)  # recent past - archive may need it

    merged_imported = sorted(
        list(fresh_by_id.values()) + retained_old, key=lambda e: e["date_start"]
    )
    return kept + merged_imported, added, updated, removed


def merge_dgob_events(existing_events, fresh_tv_events, today_date):
    """Same kept/added/updated contract as _merge_source_events, but the
    removal rule is DGoB-specific (requirement 3): the API only ever
    returns events from start_date forward, so a PAST dgob-* entry
    missing from the fresh fetch is normal, not a vanished tournament -
    see _merge_with_retention for the shared retention-window logic."""
    return _merge_with_retention(
        existing_events, fresh_tv_events, DGOB_SOURCE, DGOB_RETENTION_DAYS, today_date
    )


# ---------------------------------------------------------------------------
# EGF Grand Prix circuit calendar (--source egf-calendar) - see module
# docstring for the page URL. German entries are deliberately skipped: see
# EGF_CALENDAR_EXCLUDED_COUNTRIES.
# ---------------------------------------------------------------------------

EGF_CALENDAR_SOURCE = "egf-calendar"
EGF_CALENDAR_BASE_URL = "https://www.eurogofed.org/grandprix/bt{year}/"
EGF_CALENDAR_RETENTION_DAYS = 90
EGF_CALENDAR_USER_AGENT = (
    "shinkgs-go-tv-egf-calendar-importer/1.0"
    " (+https://github.com/diebugger-tech/GoTV)"
)
# A German tournament already has a more authoritative, structured source
# here (DGOB_CATEGORIES, or hand-curated when that filter misses one - see
# commit 1e3f676, Berliner Kranich). Importing it again from this page too
# would risk a second calendar entry for the same physical tournament under
# a different id/source - so it is skipped here, not deduped after the fact.
EGF_CALENDAR_EXCLUDED_COUNTRIES = {"Germany"}

_EGF_CALENDAR_MONTHS = {
    name: i
    for i, name in enumerate(
        [
            "january", "february", "march", "april", "may", "june",
            "july", "august", "september", "october", "november", "december",
        ],
        start=1,
    )
}
# One upcoming-tournament row, e.g.:
#   <tr class="egf-gp-satir egf-gp-upcoming" data-durum="upcoming" ...>
#     <td><a href="...">NAME</a><br><span class="egf-gp-yer">CITY, COUNTRY
#       <img ... class="egf-gp-bayrak" .../></span></td>
#     <td>21 to 22 November 2026</td>
#     <td class="egf-gp-sev"><span class="egf-gp-sev-c">C</span></td>
#     <td>winner (empty for an upcoming tournament)</td>
#   </tr>
# Verified live 2026-11-14 against eurogofed.org/grandprix/bt2026/ - a past
# tournament's row instead carries class "egf-gp-satir egf-gp-past", which
# this regex does not match (only .egf-gp-upcoming rows are ever parsed).
_EGF_CALENDAR_ROW_RE = re.compile(
    r'<tr\s+class="egf-gp-satir\s+egf-gp-upcoming"[^>]*>(.*?)</tr>', re.S
)
_EGF_CALENDAR_CELLS_RE = re.compile(
    r"<td>(.*?)</td>\s*<td>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td>(.*?)</td>", re.S
)
_EGF_CALENDAR_NAME_HREF_RE = re.compile(r'<a\s+href="([^"]+)"[^>]*>([^<]+)</a>', re.S)
_EGF_CALENDAR_LOCATION_RE = re.compile(r'<span class="egf-gp-yer">([^<]*)<img', re.S)
_EGF_CALENDAR_LEVEL_RE = re.compile(r'<span class="egf-gp-sev-c">([^<]*)</span>')
# Every bt<year> row observed so far (2026 season) is a 1-3 day weekend
# event within one month ("21 to 22 November 2026") - a cross-month shape
# is not supported; such a row is skipped with a warning rather than
# guessed (see parse_egf_calendar_html).
_EGF_CALENDAR_DATE_RANGE_RE = re.compile(
    r"^\s*(\d{1,2})\s+to\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s*$"
)


def _egf_calendar_parse_date_range(text):
    """'21 to 22 November 2026' -> ('2026-11-21', '2026-11-22'), or None if
    the text doesn't match the single-month shape (see the regex's own
    comment above) or names an invalid calendar date."""
    m = _EGF_CALENDAR_DATE_RANGE_RE.match(html.unescape(text).strip())
    if not m:
        return None
    day1, day2, month_name, year = m.groups()
    month = _EGF_CALENDAR_MONTHS.get(month_name.strip().lower())
    if not month:
        return None
    try:
        start = datetime.date(int(year), month, int(day1))
        end = datetime.date(int(year), month, int(day2))
    except ValueError:
        return None
    return start.isoformat(), end.isoformat()


def parse_egf_calendar_html(html_text):
    """Parses every upcoming (.egf-gp-upcoming) row of an EGF Grand Prix
    circuit page into raw dicts {"name", "url", "city", "country",
    "date_start", "date_end", "level"}. A row that doesn't match the
    expected cell/date/location shape is skipped with a stderr warning -
    same "never guess, skip + log" policy as parse_ics's RRULE skip."""
    raw_events = []
    for row_match in _EGF_CALENDAR_ROW_RE.finditer(html_text):
        row = row_match.group(1)
        cells = _EGF_CALENDAR_CELLS_RE.search(row)
        if not cells:
            print(
                "[update_events] Skipping EGF calendar row (unexpected cell"
                " shape)",
                file=sys.stderr,
            )
            continue
        name_cell, date_cell, level_cell, _winner_cell = cells.groups()

        name_href = _EGF_CALENDAR_NAME_HREF_RE.search(name_cell)
        location = _EGF_CALENDAR_LOCATION_RE.search(name_cell)
        if not name_href or not location:
            print(
                "[update_events] Skipping EGF calendar row (no name/link or"
                " location): " + name_cell[:120],
                file=sys.stderr,
            )
            continue
        city_country = html.unescape(location.group(1)).strip()
        city, _sep, country = city_country.rpartition(",")
        city, country = city.strip(), country.strip()
        if not city or not country:
            print(
                "[update_events] Skipping EGF calendar row (unparseable"
                " location): " + city_country,
                file=sys.stderr,
            )
            continue

        date_range = _egf_calendar_parse_date_range(date_cell)
        if not date_range:
            print(
                "[update_events] Skipping EGF calendar row (unparseable date"
                " range): " + date_cell.strip(),
                file=sys.stderr,
            )
            continue
        date_start, date_end = date_range

        level_match = _EGF_CALENDAR_LEVEL_RE.search(level_cell)
        raw_events.append(
            {
                "name": html.unescape(name_href.group(2)).strip(),
                "url": html.unescape(name_href.group(1)).strip(),
                "city": city,
                "country": country,
                "date_start": date_start,
                "date_end": date_end,
                "level": html.unescape(level_match.group(1)).strip()
                if level_match
                else None,
            }
        )
    return raw_events


def egf_calendar_event_to_tv_event(raw):
    """Maps one parse_egf_calendar_html() entry to the TvEvent shape.
    platform is always "other" - this page names no video/channel at all,
    just the tournament's own page."""
    tv_event = {
        "id": stable_id(
            raw["name"] + "-" + raw["date_start"], source=EGF_CALENDAR_SOURCE
        ),
        "name": raw["name"],
        "date_start": raw["date_start"],
        "platform": "other",
        "stream_url": raw["url"],
        "region": "intl",
        "source": EGF_CALENDAR_SOURCE,
    }
    if raw["date_end"] != raw["date_start"]:
        tv_event["date_end"] = raw["date_end"]
    notes = ["EGF Grand Prix Circuit"]
    if raw.get("level"):
        notes.append("Level " + raw["level"])
    notes.append(raw["city"] + ", " + raw["country"])
    tv_event["notes"] = " · ".join(notes)
    return tv_event


def fetch_egf_calendar_html(year, timeout=20):
    url = EGF_CALENDAR_BASE_URL.format(year=year)
    request = urllib.request.Request(
        url, headers={"User-Agent": EGF_CALENDAR_USER_AGENT}
    )
    with urllib.request.urlopen(request, timeout=timeout) as res:
        return res.read().decode("utf-8")


def merge_egf_bt_events(existing_events, fresh_tv_events, today_date):
    """Same kept/added/updated contract as _merge_source_events, with the
    same retention-window removal rule as merge_dgob_events (see
    _merge_with_retention) - the bt<year> page only ever lists .egf-gp-
    upcoming rows, so a past tournament vanishing from the fresh parse is
    normal, not a real removal."""
    return _merge_with_retention(
        existing_events,
        fresh_tv_events,
        EGF_CALENDAR_SOURCE,
        EGF_CALENDAR_RETENTION_DAYS,
        today_date,
    )


def _today_utc_str():
    return datetime.datetime.now(datetime.timezone.utc).date().isoformat()


def main(argv=None):
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--source",
        choices=[SOURCE, DGOB_SOURCE, EGF_CALENDAR_SOURCE],
        default=SOURCE,
        help="Which source to import from (default: %(default)s)",
    )
    parser.add_argument(
        "--broadcaster-id",
        help="--source "
        + SOURCE
        + " only: numeric Twitch broadcaster_id for "
        + CHANNEL_LOGIN
        + " (resolving the login name to this id is not implemented - see"
        " the module docstring)",
    )
    parser.add_argument(
        "--ics-file",
        help="--source " + SOURCE + " only: path to a local .ics file instead"
        " of fetching from Twitch",
    )
    parser.add_argument(
        "--dgob-start-date",
        help="--source " + DGOB_SOURCE + " only: start_date override"
        " (YYYY-MM-DD, UTC). Default: today.",
    )
    parser.add_argument(
        "--dgob-stream-map",
        default=str(DGOB_STREAM_MAP_PATH),
        help="--source " + DGOB_SOURCE + " only: path to the channel-assignment"
        " mapping (default: %(default)s)",
    )
    parser.add_argument(
        "--dgob-timeout",
        type=float,
        default=20,
        help="--source " + DGOB_SOURCE + " only: per-request HTTP timeout in"
        " seconds (default: %(default)s)",
    )
    parser.add_argument(
        "--egf-year",
        type=int,
        help="--source " + EGF_CALENDAR_SOURCE + " only: which bt<year> page"
        " to fetch (default: current year). The circuit's own finale"
        " spills into the following January, so this rarely needs to"
        " change.",
    )
    parser.add_argument(
        "--egf-html-file",
        help="--source " + EGF_CALENDAR_SOURCE + " only: path to a local"
        " HTML file instead of fetching from eurogofed.org",
    )
    parser.add_argument(
        "--egf-timeout",
        type=float,
        default=20,
        help="--source " + EGF_CALENDAR_SOURCE + " only: per-request HTTP"
        " timeout in seconds (default: %(default)s)",
    )
    parser.add_argument(
        "--events-file",
        default=str(EVENTS_JSON_PATH),
        help="Path to events.json (default: %(default)s)",
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Print the diff, write nothing"
    )
    args = parser.parse_args(argv)

    events_path = Path(args.events_file)
    data = load_events(events_path)

    if args.source == SOURCE:
        if bool(args.broadcaster_id) == bool(args.ics_file):
            parser.error(
                "--source "
                + SOURCE
                + " requires exactly one of --broadcaster-id or --ics-file"
            )
        if args.ics_file:
            with open(args.ics_file, "r", encoding="utf-8") as f:
                ics_text = f.read()
        else:
            try:
                ics_text = fetch_ics_text(args.broadcaster_id)
            except urllib.error.URLError as err:
                print("Failed to fetch iCalendar: %s" % err, file=sys.stderr)
                return 1
        ics_events = parse_ics(ics_text)
        merged, added, updated, removed = merge_events(
            data.get("events", []), ics_events
        )
    elif args.source == DGOB_SOURCE:
        start_date = args.dgob_start_date or _today_utc_str()
        try:
            raw_events = fetch_dgob_events(start_date, timeout=args.dgob_timeout)
        except DgobFetchError as err:
            print("Failed to fetch DGoB events: %s" % err, file=sys.stderr)
            return 1

        matching = [e for e in raw_events if dgob_matches_categories(e, DGOB_CATEGORIES)]
        stream_map = load_dgob_stream_map(args.dgob_stream_map)
        channels_by_id = {
            c["id"]: c for c in data.get("channels", []) if isinstance(c, dict)
        }
        try:
            fresh_tv_events = [
                dgob_event_to_tv_event(e, stream_map, channels_by_id) for e in matching
            ]
        except ValueError as err:
            print("Failed to map DGoB events: %s" % err, file=sys.stderr)
            return 1

        today_date = datetime.date.fromisoformat(start_date)
        merged, added, updated, removed = merge_dgob_events(
            data.get("events", []), fresh_tv_events, today_date
        )

        old_dgob_count = len(
            [e for e in data.get("events", []) if e.get("source") == DGOB_SOURCE]
        )
        if old_dgob_count > 0 and len(removed) == old_dgob_count:
            print(
                "Refusing to import: this run would remove ALL %d existing"
                " dgob-* entries - looks like an API/filter problem, not a"
                " real emptying-out." % old_dgob_count,
                file=sys.stderr,
            )
            return 1
    else:
        year = args.egf_year or datetime.date.today().year
        if args.egf_html_file:
            with open(args.egf_html_file, "r", encoding="utf-8") as f:
                html_text = f.read()
        else:
            try:
                html_text = fetch_egf_calendar_html(year, timeout=args.egf_timeout)
            except (urllib.error.URLError, OSError) as err:
                print("Failed to fetch EGF calendar: %s" % err, file=sys.stderr)
                return 1

        rows = parse_egf_calendar_html(html_text)
        fresh_tv_events = [
            egf_calendar_event_to_tv_event(r)
            for r in rows
            if r["country"] not in EGF_CALENDAR_EXCLUDED_COUNTRIES
        ]

        today_date = datetime.date.today()
        merged, added, updated, removed = merge_egf_bt_events(
            data.get("events", []), fresh_tv_events, today_date
        )

        old_egf_count = len(
            [
                e
                for e in data.get("events", [])
                if e.get("source") == EGF_CALENDAR_SOURCE
            ]
        )
        if old_egf_count > 0 and len(removed) == old_egf_count:
            print(
                "Refusing to import: this run would remove ALL %d existing"
                " egf-calendar-* entries - looks like a page/parser problem,"
                " not a real emptying-out." % old_egf_count,
                file=sys.stderr,
            )
            return 1

    print(format_diff(added, updated, removed))

    if args.dry_run:
        return 0

    if added or updated or removed:
        data["events"] = merged
        with events_path.open("w", encoding="utf-8") as f:
            f.write(json.dumps(data, indent=2, ensure_ascii=False))
            f.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Half-automatic updater for public/tv/events.json, sourced from the
EuropeanGoFederation Twitch schedule (official Twitch Helix "Get Channel
iCalendar" endpoint). Standard library only, by design (AGENTS.md).

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

Usage:
  python3 tools/update_events.py --broadcaster-id 123456789 --dry-run
  python3 tools/update_events.py --ics-file schedule.ics
"""
import argparse
import datetime
import json
import re
import sys
import urllib.error
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


def stable_id(ics_uid):
    # Namespaced by source so it can never collide with a hand-maintained id.
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ics_uid).strip("-").lower()
    return SOURCE + "-" + slug


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


def merge_events(existing_events, fresh_ics_events):
    """Hand-maintained entries (no "source") and entries from any other
    source are never touched. Entries with source == SOURCE are matched
    by id and added/updated/removed to reflect the fresh fetch - a
    cancelled (STATUS:CANCELLED) or vanished Twitch segment is a
    removal, same as any entry the fresh fetch no longer reports."""
    kept = [e for e in existing_events if e.get("source") != SOURCE]
    old_by_id = {e["id"]: e for e in existing_events if e.get("source") == SOURCE}

    fresh_by_id = {}
    for ics_event in fresh_ics_events:
        if ics_event.cancelled:
            continue
        tv_event = ics_event_to_tv_event(ics_event)
        fresh_by_id[tv_event["id"]] = tv_event

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


def main(argv=None):
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    source_group = parser.add_mutually_exclusive_group(required=True)
    source_group.add_argument(
        "--broadcaster-id",
        help="Numeric Twitch broadcaster_id for " + CHANNEL_LOGIN
        + " (resolving the login name to this id is not implemented - see"
        " the module docstring)",
    )
    source_group.add_argument(
        "--ics-file", help="Path to a local .ics file instead of fetching from Twitch"
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
    events_path = Path(args.events_file)
    data = load_events(events_path)
    merged, added, updated, removed = merge_events(data.get("events", []), ics_events)

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

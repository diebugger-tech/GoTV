#!/usr/bin/env python3
"""Checks every URL referenced by the Go TV calendar (public/tv/events.json)
and by the TV UI (src/ui/tv/*.js) for dead links (4xx/5xx) or redirects
that land on an error page. Standard library only (AGENTS.md).

Usage:
  python3 tools/check_links.py [--events-file PATH] [--ui-dir PATH] [--json]

Exit code is 1 if any link is broken, 0 otherwise. The weekly
update-events workflow runs this step with continue-on-error, so a
dead link never blocks that PR - findings just go into its
description (see tools/update_events.py / .github/workflows).
"""
import argparse
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_EVENTS_FILE = ROOT / "public" / "tv" / "events.json"
DEFAULT_UI_DIR = ROOT / "src" / "ui" / "tv"

URL_RE = re.compile(r"https?://[^\s\"'`<>\\]+")
# A redirect that lands on a 200-OK custom error/not-found page is still a
# dead link in practice, even though the HTTP status alone looks fine.
# Deliberately loose (substring, not a whole-segment match) - this feeds a
# PR description for a human to glance at, not a hard gate, so a missed
# dead redirect is worse than an occasional false positive.
ERROR_PATH_RE = re.compile(r"404|410|not-?found|error", re.I)
USER_AGENT = "shinkgs-go-tv-link-checker/1.0 (+https://github.com/diebugger-tech/shinkgs)"


def find_urls_in_events(events_file):
    """Every string value that looks like a URL, anywhere in an event
    object - generic on purpose, so a new URL-bearing field (channel,
    sgf_url, a future one, ...) doesn't need a code change here to be
    checked. Maps each URL to the event id(s) that reference it."""
    events_file = Path(events_file)
    if not events_file.exists():
        return {}
    with events_file.open("r", encoding="utf-8") as f:
        data = json.load(f)
    found = {}

    def walk(value, event_id):
        if isinstance(value, str):
            for m in URL_RE.finditer(value):
                found.setdefault(m.group(0), set()).add(event_id)
        elif isinstance(value, dict):
            for v in value.values():
                walk(v, event_id)
        elif isinstance(value, list):
            for v in value:
                walk(v, event_id)

    for event in data.get("events", []):
        walk(event, event.get("id", "?"))
    return found


def find_urls_in_ui_dir(ui_dir):
    """Literal http(s) URLs hardcoded in .js files under ui_dir. Today
    there are none (URL-building lives in src/model/tv.js, not in the
    UI layer) - this exists so a future hardcoded link doesn't go
    unchecked. Maps each URL to the source file(s) it was found in."""
    found = {}
    ui_dir = Path(ui_dir)
    if not ui_dir.exists():
        return found
    for path in sorted(ui_dir.rglob("*.js")):
        text = path.read_text(encoding="utf-8")
        for m in URL_RE.finditer(text):
            try:
                label = str(path.relative_to(ROOT))
            except ValueError:
                label = str(path)
            found.setdefault(m.group(0), set()).add(label)
    return found


def _looks_like_error_page(url):
    if not url:
        return False
    parts = urllib.parse.urlsplit(url)
    return bool(ERROR_PATH_RE.search(parts.path + "?" + parts.query))


def default_opener(request, timeout):
    return urllib.request.urlopen(request, timeout=timeout)


def check_url(url, timeout=15, opener=default_opener):
    """Probes one URL (HEAD first, falling back to GET if the server
    rejects HEAD). Returns a dict: ok, status, final_url, error."""
    for method in ("HEAD", "GET"):
        request = urllib.request.Request(
            url, method=method, headers={"User-Agent": USER_AGENT}
        )
        try:
            with opener(request, timeout) as res:
                status = getattr(res, "status", None) or res.getcode()
                final_url = res.geturl()
                ok = status < 400 and not _looks_like_error_page(final_url)
                return {
                    "url": url,
                    "ok": ok,
                    "status": status,
                    "final_url": final_url,
                    "error": None,
                }
        except urllib.error.HTTPError as err:
            if err.code == 405 and method == "HEAD":
                continue  # retry with GET
            return {
                "url": url,
                "ok": False,
                "status": err.code,
                "final_url": err.geturl() if hasattr(err, "geturl") else url,
                "error": None,
            }
        except urllib.error.URLError as err:
            return {
                "url": url,
                "ok": False,
                "status": None,
                "final_url": None,
                "error": str(err.reason),
            }
        except Exception as err:  # noqa: BLE001 - best-effort network probe
            return {
                "url": url,
                "ok": False,
                "status": None,
                "final_url": None,
                "error": str(err),
            }
    # Unreachable in practice (GET branch always returns or raises above).
    return {"url": url, "ok": False, "status": None, "final_url": None, "error": "unknown"}


def format_report(results):
    broken = [r for r in results if not r["ok"]]
    lines = []
    if not broken:
        lines.append("All %d checked link(s) OK." % len(results))
        return "\n".join(lines)
    lines.append(
        "%d of %d checked link(s) broken:" % (len(broken), len(results))
    )
    for r in broken:
        where = ", ".join(sorted(r["sources"])) if r.get("sources") else "?"
        if r["error"]:
            lines.append("  - %s [%s]: %s" % (r["url"], where, r["error"]))
        else:
            detail = "status %s" % r["status"]
            if r["final_url"] and r["final_url"] != r["url"]:
                detail += ", redirected to %s" % r["final_url"]
            lines.append("  - %s [%s]: %s" % (r["url"], where, detail))
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--events-file", default=str(DEFAULT_EVENTS_FILE))
    parser.add_argument("--ui-dir", default=str(DEFAULT_UI_DIR))
    parser.add_argument(
        "--json", action="store_true", help="Print machine-readable JSON instead"
    )
    parser.add_argument("--timeout", type=float, default=15)
    args = parser.parse_args(argv)

    by_url = {}
    for url, sources in find_urls_in_events(args.events_file).items():
        by_url.setdefault(url, set()).update(sources)
    for url, sources in find_urls_in_ui_dir(args.ui_dir).items():
        by_url.setdefault(url, set()).update(sources)

    results = []
    for url in sorted(by_url):
        result = check_url(url, timeout=args.timeout)
        result["sources"] = by_url[url]
        results.append(result)

    if args.json:
        print(
            json.dumps(
                [{**r, "sources": sorted(r["sources"])} for r in results], indent=2
            )
        )
    else:
        print(format_report(results))

    return 1 if any(not r["ok"] for r in results) else 0


if __name__ == "__main__":
    sys.exit(main())

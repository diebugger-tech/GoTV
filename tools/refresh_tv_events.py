"""Refresh the installed calendars without modifying tracked files or rebuilding.

Run from the repository: python3 -m tools.refresh_tv_events
Each source is transactional: a failed import keeps that source's previous data.
"""
import argparse
import fcntl
import json
import os
import tempfile
from pathlib import Path

from tools import update_events

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ("dgob", "twitch-egf", "egf-calendar")


def atomic_write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=path.parent) as temp:
        staged = Path(temp) / "events.json"
        staged.write_bytes(content)
        os.replace(staged, path)


def refresh(root, cache):
    data = json.loads((root / "public/tv/events.json").read_text(encoding="utf-8"))
    if cache.is_file():
        previous = json.loads(cache.read_text(encoding="utf-8"))
        events = data.get("events", [])
        data["events"] = [e for e in events if e.get("source") not in SOURCES]
        for source in SOURCES:
            cached = [e for e in previous.get("events", []) if e.get("source") == source]
            data["events"].extend(cached)

    cache.parent.mkdir(parents=True, exist_ok=True)
    failures = []
    with tempfile.TemporaryDirectory(dir=cache.parent) as temp:
        staged = Path(temp) / "events.json"
        staged.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        for source in SOURCES:
            before = staged.read_bytes()
            argv = ["--source", source, "--events-file", str(staged)]
            if source == "twitch-egf":
                argv += ["--broadcaster-id", "154830311"]
            try:
                result = update_events.main(argv)
                if result:
                    raise RuntimeError("import exited with status %s" % result)
            except Exception as error:
                staged.write_bytes(before)
                failures.append(source)
                print("Keeping previous %s data: %s" % (source, error), flush=True)
        content = staged.read_bytes()
        # Validate before publishing, including the all-sources-failed case.
        json.loads(content)
        atomic_write(cache, content)
        for name in ("build-desktop", "build"):
            build = root / name
            if (build / "index.html").is_file():
                atomic_write(build / "tv/events.json", content)
                print("Updated %s/tv/events.json" % name, flush=True)
    return failures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=Path.home() / ".local/share/gotv/events.json")
    args = parser.parse_args()
    args.cache.parent.mkdir(parents=True, exist_ok=True)
    with (args.cache.parent / "events.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Another Go TV calendar update is already running.")
            return 0
        return 1 if refresh(ROOT, args.cache) else 0


if __name__ == "__main__":
    raise SystemExit(main())

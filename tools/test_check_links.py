#!/usr/bin/env python3
"""Unit tests for tools/check_links.py. Standard library only
(unittest), run via: python3 -m unittest tools.test_check_links -v
"""
import io
import json
import sys
import tempfile
import unittest
import urllib.error
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_links  # noqa: E402


class FakeResponse:
    def __init__(self, status, url):
        self.status = status
        self._url = url

    def geturl(self):
        return self._url

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def make_opener(head=None, get=None):
    """head/get: either ("ok", status, final_url), ("http_error", code),
    or ("url_error", reason). Returns an opener + the list of methods it
    was actually called with, so tests can assert on the HEAD-then-GET
    retry behavior."""
    behaviors = {"HEAD": head, "GET": get}
    calls = []

    def opener(request, timeout):
        method = request.get_method()
        calls.append(method)
        outcome = behaviors[method]
        if outcome is None:
            raise AssertionError("unexpected %s request" % method)
        kind = outcome[0]
        if kind == "ok":
            return FakeResponse(outcome[1], outcome[2])
        if kind == "http_error":
            raise urllib.error.HTTPError(request.full_url, outcome[1], "err", {}, None)
        if kind == "url_error":
            raise urllib.error.URLError(outcome[1])
        raise AssertionError("bad behavior kind: %s" % kind)

    return opener, calls


class CheckUrlTest(unittest.TestCase):
    def test_ok_response(self):
        opener, calls = make_opener(head=("ok", 200, "https://example.com/x"))
        result = check_links.check_url("https://example.com/x", opener=opener)
        self.assertTrue(result["ok"])
        self.assertEqual(result["status"], 200)
        self.assertEqual(calls, ["HEAD"])

    def test_404_is_broken(self):
        opener, calls = make_opener(head=("http_error", 404))
        result = check_links.check_url("https://example.com/gone", opener=opener)
        self.assertFalse(result["ok"])
        self.assertEqual(result["status"], 404)

    def test_retries_with_get_when_head_is_rejected(self):
        opener, calls = make_opener(
            head=("http_error", 405), get=("ok", 200, "https://example.com/x")
        )
        result = check_links.check_url("https://example.com/x", opener=opener)
        self.assertTrue(result["ok"])
        self.assertEqual(calls, ["HEAD", "GET"])

    def test_url_error_is_broken(self):
        opener, calls = make_opener(head=("url_error", "Name or service not known"))
        result = check_links.check_url("https://doesnotexist.invalid/", opener=opener)
        self.assertFalse(result["ok"])
        self.assertIn("not known", result["error"])

    def test_redirect_to_an_error_page_is_broken_even_at_200(self):
        opener, calls = make_opener(
            head=("ok", 200, "https://example.com/404-not-found")
        )
        result = check_links.check_url("https://example.com/old-page", opener=opener)
        self.assertFalse(result["ok"])
        self.assertEqual(result["status"], 200)
        self.assertEqual(result["final_url"], "https://example.com/404-not-found")


class FindUrlsInEventsTest(unittest.TestCase):
    def test_finds_urls_in_any_string_field(self):
        with tempfile.TemporaryDirectory() as tmp:
            events_path = Path(tmp) / "events.json"
            events_path.write_text(
                json.dumps(
                    {
                        "events": [
                            {
                                "id": "e1",
                                "stream_url": "https://www.twitch.tv/x",
                                "sgf_url": "https://example.com/game.sgf",
                                "notes": "see https://example.com/notes too",
                            },
                            {"id": "e2", "stream_url": "https://www.twitch.tv/x"},
                        ]
                    }
                ),
                encoding="utf-8",
            )
            found = check_links.find_urls_in_events(events_path)
            self.assertEqual(found["https://www.twitch.tv/x"], {"e1", "e2"})
            self.assertIn("https://example.com/game.sgf", found)
            self.assertIn("https://example.com/notes", found)

    def test_missing_file_returns_empty(self):
        self.assertEqual(
            check_links.find_urls_in_events(Path("/nonexistent/events.json")), {}
        )

    def test_finds_urls_in_channels_too(self):
        with tempfile.TemporaryDirectory() as tmp:
            events_path = Path(tmp) / "events.json"
            events_path.write_text(
                json.dumps(
                    {
                        "events": [],
                        "channels": [
                            {
                                "id": "baduk-tv",
                                "url": "https://www.youtube.com/@BadukTV",
                            },
                            {
                                "id": "egf-twitch",
                                "url": "https://www.twitch.tv/europeangofederation",
                            },
                        ],
                    }
                ),
                encoding="utf-8",
            )
            found = check_links.find_urls_in_events(events_path)
            self.assertEqual(
                found["https://www.youtube.com/@BadukTV"], {"baduk-tv"}
            )
            self.assertEqual(
                found["https://www.twitch.tv/europeangofederation"],
                {"egf-twitch"},
            )

    def test_missing_channels_field_is_not_an_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            events_path = Path(tmp) / "events.json"
            events_path.write_text(
                json.dumps({"events": []}), encoding="utf-8"
            )
            # No "channels" key at all (old-schema file) - must not raise.
            self.assertEqual(check_links.find_urls_in_events(events_path), {})


class FindUrlsInUiDirTest(unittest.TestCase):
    def test_finds_literal_urls_in_js_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            ui_dir = Path(tmp) / "ui" / "tv"
            ui_dir.mkdir(parents=True)
            (ui_dir / "Example.js").write_text(
                'const URL = "https://example.com/fixed-link";\n', encoding="utf-8"
            )
            found = check_links.find_urls_in_ui_dir(ui_dir)
            self.assertIn("https://example.com/fixed-link", found)

    def test_missing_dir_returns_empty(self):
        self.assertEqual(
            check_links.find_urls_in_ui_dir(Path("/nonexistent/dir")), {}
        )


class FormatReportTest(unittest.TestCase):
    def test_all_ok(self):
        results = [{"ok": True, "url": "https://x", "status": 200}]
        self.assertIn("All 1 checked link(s) OK.", check_links.format_report(results))

    def test_lists_broken_links_with_sources(self):
        results = [
            {
                "ok": False,
                "url": "https://example.com/dead",
                "status": 404,
                "final_url": "https://example.com/dead",
                "error": None,
                "sources": {"my-event"},
            }
        ]
        text = check_links.format_report(results)
        self.assertIn("https://example.com/dead", text)
        self.assertIn("my-event", text)
        self.assertIn("status 404", text)


class MainTest(unittest.TestCase):
    def test_exit_code_reflects_broken_links(self):
        with tempfile.TemporaryDirectory() as tmp:
            events_path = Path(tmp) / "events.json"
            events_path.write_text(
                json.dumps({"events": [{"id": "e1", "stream_url": "https://x"}]}),
                encoding="utf-8",
            )
            # No real network access in this test: point --ui-dir at an
            # empty dir and monkeypatch check_url via a module-level swap.
            original_check_url = check_links.check_url
            try:
                check_links.check_url = lambda url, timeout=15, opener=None: {
                    "url": url,
                    "ok": False,
                    "status": 404,
                    "final_url": url,
                    "error": None,
                }
                out = io.StringIO()
                with redirect_stdout(out):
                    exit_code = check_links.main(
                        [
                            "--events-file",
                            str(events_path),
                            "--ui-dir",
                            str(Path(tmp) / "nope"),
                        ]
                    )
                self.assertEqual(exit_code, 1)
                self.assertIn("broken", out.getvalue())
            finally:
                check_links.check_url = original_check_url

    def test_json_output_is_valid_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            events_path = Path(tmp) / "events.json"
            events_path.write_text(json.dumps({"events": []}), encoding="utf-8")
            out = io.StringIO()
            with redirect_stdout(out):
                exit_code = check_links.main(
                    [
                        "--events-file",
                        str(events_path),
                        "--ui-dir",
                        str(Path(tmp) / "nope"),
                        "--json",
                    ]
                )
            self.assertEqual(exit_code, 0)
            self.assertEqual(json.loads(out.getvalue()), [])


if __name__ == "__main__":
    unittest.main()

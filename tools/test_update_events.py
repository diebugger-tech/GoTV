#!/usr/bin/env python3
"""Unit tests for tools/update_events.py. Standard library only
(unittest), run via: python3 -m unittest tools.test_update_events -v
"""
import contextlib
import datetime
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import update_events  # noqa: E402

FIXTURE_PATH = Path(__file__).resolve().parent / "testdata" / "twitch-egf-sample.ics"
DGOB_FIXTURE_PATH = (
    Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "dgob_events_page1.json"
)


class ParseIcsTest(unittest.TestCase):
    def setUp(self):
        self.text = FIXTURE_PATH.read_text(encoding="utf-8")
        self.events = update_events.parse_ics(self.text)

    def test_skips_recurring_events(self):
        # The fixture has 4 VEVENTs; one has an RRULE and must be skipped.
        uids = [e.uid for e in self.events]
        self.assertNotIn("dddd4444-4444-4444-4444-444444444444", uids)
        self.assertEqual(len(self.events), 3)

    def test_parses_summary_and_date(self):
        first = next(e for e in self.events if e.uid == "aaaa1111-1111-1111-1111-111111111111")
        self.assertEqual(first.summary, "EGF Go Show - November Special")
        self.assertEqual(first.dtstart.date().isoformat(), "2026-11-20")
        self.assertFalse(first.cancelled)

    def test_handles_buggy_leading_slash_tzid(self):
        # DTSTART;TZID=/Europe/Berlin:... (note the leading slash) must
        # still resolve to the Europe/Berlin zone, not UTC or a crash.
        second = next(e for e in self.events if e.uid == "bbbb2222-2222-2222-2222-222222222222")
        self.assertEqual(str(second.dtstart.tzinfo), "Europe/Berlin")
        self.assertEqual(second.dtstart.hour, 10)

    def test_detects_cancelled_status(self):
        cancelled = next(e for e in self.events if e.uid == "cccc3333-3333-3333-3333-333333333333")
        self.assertTrue(cancelled.cancelled)

    def test_unescapes_commas_in_text_values(self):
        second = next(e for e in self.events if e.uid == "bbbb2222-2222-2222-2222-222222222222")
        self.assertEqual(second.summary, "European Go Championship - Round Coverage")


class StableIdTest(unittest.TestCase):
    def test_is_namespaced_and_slugified(self):
        self.assertEqual(
            update_events.stable_id("aaaa1111-1111-1111-1111-111111111111"),
            "twitch-egf-aaaa1111-1111-1111-1111-111111111111",
        )


class MergeEventsTest(unittest.TestCase):
    def setUp(self):
        self.ics_events = update_events.parse_ics(
            FIXTURE_PATH.read_text(encoding="utf-8")
        )

    def test_leaves_hand_maintained_entries_untouched(self):
        hand_maintained = {
            "id": "deepmind-lee-sedol-2016-game1",
            "name": "AlphaGo vs Lee Sedol",
            "date_start": "2016-03-09",
            "platform": "youtube",
            "stream_url": "https://www.youtube.com/watch?v=vFr3K2DORc8",
            "video_id": "vFr3K2DORc8",
        }
        merged, added, updated, removed = update_events.merge_events(
            [hand_maintained], self.ics_events
        )
        self.assertIn(hand_maintained, merged)
        self.assertEqual(len(added), 2)  # the two non-cancelled, non-recurring events
        self.assertEqual(updated, [])
        self.assertEqual(removed, [])

    def test_leaves_entries_from_a_different_source_untouched(self):
        other_sourced = {
            "id": "other-importer-1",
            "name": "Some other event",
            "date_start": "2026-01-01",
            "platform": "other",
            "stream_url": "https://example.com",
            "source": "some-other-importer",
        }
        merged, added, updated, removed = update_events.merge_events(
            [other_sourced], self.ics_events
        )
        self.assertIn(other_sourced, merged)

    def test_updates_an_existing_imported_entry_by_id(self):
        stale = update_events.ics_event_to_tv_event(
            next(
                e
                for e in self.ics_events
                if e.uid == "aaaa1111-1111-1111-1111-111111111111"
            )
        )
        stale["name"] = "Old title before a rename"
        merged, added, updated, removed = update_events.merge_events(
            [stale], self.ics_events
        )
        self.assertEqual(len(updated), 1)
        self.assertEqual(updated[0]["name"], "EGF Go Show - November Special")
        self.assertEqual(len(added), 1)  # only the EGC entry is new
        self.assertEqual(removed, [])

    def test_removes_an_imported_entry_the_fresh_fetch_no_longer_has(self):
        vanished = {
            "id": "twitch-egf-some-old-uid",
            "name": "No longer on the schedule",
            "date_start": "2026-01-01",
            "start": "2026-01-01T19:00:00+01:00",
            "platform": "twitch",
            "stream_url": "https://www.twitch.tv/europeangofederation",
            "channel": {"platform": "twitch", "id": "europeangofederation"},
            "source": "twitch-egf",
        }
        merged, added, updated, removed = update_events.merge_events(
            [vanished], self.ics_events
        )
        self.assertEqual(len(removed), 1)
        self.assertEqual(removed[0]["id"], "twitch-egf-some-old-uid")
        self.assertNotIn(vanished, merged)

    def test_cancelled_fresh_event_is_treated_as_removed_not_added(self):
        # cccc3333 is STATUS:CANCELLED in the fixture - even if nothing
        # previously existed for it, it must never be added.
        merged, added, updated, removed = update_events.merge_events([], self.ics_events)
        ids = [e["id"] for e in added]
        self.assertNotIn(update_events.stable_id("cccc3333-3333-3333-3333-333333333333"), ids)


class FormatDiffTest(unittest.TestCase):
    def test_no_changes(self):
        self.assertEqual(update_events.format_diff([], [], []), "No changes.")

    def test_lists_added_updated_removed(self):
        added = [{"id": "a", "name": "A", "date_start": "2026-01-01"}]
        updated = [{"id": "b", "name": "B", "date_start": "2026-01-02"}]
        removed = [{"id": "c", "name": "C", "date_start": "2026-01-03"}]
        text = update_events.format_diff(added, updated, removed)
        self.assertIn("Would add 1 event(s):", text)
        self.assertIn('+ a: "A" (2026-01-01)', text)
        self.assertIn("Would update 1 event(s):", text)
        self.assertIn("Would remove 1 event(s):", text)


class MainDryRunTest(unittest.TestCase):
    def test_dry_run_prints_diff_and_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            events_path = Path(tmp) / "events.json"
            original = {"events": []}
            events_path.write_text(json.dumps(original), encoding="utf-8")

            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                exit_code = update_events.main(
                    [
                        "--ics-file",
                        str(FIXTURE_PATH),
                        "--events-file",
                        str(events_path),
                        "--dry-run",
                    ]
                )
            self.assertEqual(exit_code, 0)
            self.assertIn("Would add 2 event(s):", out.getvalue())
            self.assertEqual(
                json.loads(events_path.read_text(encoding="utf-8")), original
            )

    def test_without_dry_run_writes_the_merged_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            events_path = Path(tmp) / "events.json"
            events_path.write_text(json.dumps({"events": []}), encoding="utf-8")

            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                exit_code = update_events.main(
                    [
                        "--ics-file",
                        str(FIXTURE_PATH),
                        "--events-file",
                        str(events_path),
                    ]
                )
            self.assertEqual(exit_code, 0)
            written = json.loads(events_path.read_text(encoding="utf-8"))
            self.assertEqual(len(written["events"]), 2)
            self.assertTrue(
                all(e["source"] == "twitch-egf" for e in written["events"])
            )

    def test_requires_exactly_one_of_broadcaster_id_or_ics_file(self):
        with self.assertRaises(SystemExit):
            update_events.main([])


# ---------------------------------------------------------------------------
# DGoB import
# ---------------------------------------------------------------------------


class CleanDgobTitleTest(unittest.TestCase):
    def test_strips_tags_and_decodes_entities(self):
        self.assertEqual(
            update_events._clean_dgob_title(
                "<b>13. Herkules Cup Kassel &#8211; Deutschlandpokal</b>"
            ),
            "13. Herkules Cup Kassel – Deutschlandpokal",
        )

    def test_handles_missing_title(self):
        self.assertEqual(update_events._clean_dgob_title(None), "")


class ParseDgobDatetimeTest(unittest.TestCase):
    def test_splits_date_and_time(self):
        self.assertEqual(
            update_events._parse_dgob_datetime("2026-11-19 20:00:00"),
            ("2026-11-19", "20:00:00"),
        )

    def test_rejects_an_unparseable_value(self):
        with self.assertRaises(ValueError):
            update_events._parse_dgob_datetime("not-a-datetime")

    def test_to_iso_utc(self):
        self.assertEqual(
            update_events._to_iso_utc("2026-11-19 19:00:00"), "2026-11-19T19:00:00Z"
        )


class DgobMatchesCategoriesTest(unittest.TestCase):
    def test_matches_when_any_category_slug_is_in_the_target_set(self):
        raw = {"categories": [{"slug": "go-bundesliga"}, {"slug": "inland"}]}
        self.assertTrue(
            update_events.dgob_matches_categories(raw, update_events.DGOB_CATEGORIES)
        )

    def test_does_not_match_an_unrelated_event(self):
        raw = {"categories": [{"slug": "wochenendturnier"}, {"slug": "inland"}]}
        self.assertFalse(
            update_events.dgob_matches_categories(raw, update_events.DGOB_CATEGORIES)
        )

    def test_handles_a_missing_categories_list(self):
        self.assertFalse(
            update_events.dgob_matches_categories({}, update_events.DGOB_CATEGORIES)
        )


class DgobFixtureTest(unittest.TestCase):
    """Tests against the real sample response saved as DGOB_FIXTURE_PATH
    (fetched live from the DGoB API on 2026-11-13 - see the task report)."""

    @classmethod
    def setUpClass(cls):
        with DGOB_FIXTURE_PATH.open("r", encoding="utf-8") as f:
            cls.fixture = json.load(f)
        cls.events_by_id = {e["id"]: e for e in cls.fixture["events"]}

    def test_fixture_has_the_expected_edge_cases(self):
        # A future re-fetch that drops these specific entries should fail
        # loudly here, not downstream in a mapping test.
        self.assertIn(22103, self.events_by_id)  # multi-day, genuinely all-day
        self.assertIn(10002873, self.events_by_id)  # Bundesliga, all_day bug

    def test_category_matching_against_the_fixture(self):
        matching_ids = {
            e["id"]
            for e in self.fixture["events"]
            if update_events.dgob_matches_categories(e, update_events.DGOB_CATEGORIES)
        }
        # 7 go-bundesliga + 2 deutsche-meisterschaft (22103, 23400) - verified
        # live against the real API on 2026-11-13 (see task report) and
        # cross-checked against this exact fixture.
        self.assertEqual(len(matching_ids), 9)
        self.assertIn(22103, matching_ids)
        self.assertIn(10002873, matching_ids)
        self.assertNotIn(22109, matching_ids)  # Herkules Cup - not a target category

    def test_maps_a_genuinely_all_day_multi_day_event(self):
        raw = self.events_by_id[22103]
        tv_event = update_events.dgob_event_to_tv_event(
            raw, {"by_dgob_id": {}, "by_category": {}}, {}
        )
        self.assertEqual(tv_event["id"], "dgob-22103")
        self.assertEqual(tv_event["name"], "Deutsche Damen-Go-Meisterschaft 2026")
        self.assertEqual(tv_event["date_start"], "2026-11-14")
        self.assertEqual(tv_event["date_end"], "2026-11-15")
        self.assertNotIn("start", tv_event)  # genuinely all-day -> no time shown
        self.assertEqual(tv_event["region"], "de")
        self.assertEqual(tv_event["platform"], "other")
        self.assertEqual(tv_event["source"], "dgob")
        self.assertEqual(tv_event["notes"], "Stadtteilzentrum Vorderer Westen / Kassel")

    def test_maps_the_bundesliga_all_day_flag_bug_as_timed(self):
        # all_day=true but the LOCAL start_date clock time is 20:00, not
        # midnight - a 2-hour online match, not a genuine all-day event.
        raw = self.events_by_id[10002873]
        tv_event = update_events.dgob_event_to_tv_event(
            raw, {"by_dgob_id": {}, "by_category": {}}, {}
        )
        self.assertEqual(tv_event["id"], "dgob-10002873")
        self.assertEqual(tv_event["name"], "Go-Bundesliga")
        self.assertEqual(tv_event["date_start"], "2026-11-19")
        self.assertNotIn("date_end", tv_event)  # single day
        self.assertEqual(tv_event["start"], "2026-11-19T19:00:00Z")  # utc_start_date
        self.assertEqual(tv_event["region"], "de")

    def test_prefers_website_over_the_dgob_page_url_when_present(self):
        raw = self.events_by_id[10002873]  # has both website and url
        self.assertTrue(raw.get("website"))
        tv_event = update_events.dgob_event_to_tv_event(
            raw, {"by_dgob_id": {}, "by_category": {}}, {}
        )
        self.assertEqual(tv_event["stream_url"], raw["website"])

    def test_falls_back_to_the_dgob_page_url_without_a_website(self):
        raw = dict(self.events_by_id[22103])
        raw["website"] = ""
        tv_event = update_events.dgob_event_to_tv_event(
            raw, {"by_dgob_id": {}, "by_category": {}}, {}
        )
        self.assertEqual(tv_event["stream_url"], raw["url"])


class ResolveDgobChannelTest(unittest.TestCase):
    def setUp(self):
        self.channels_by_id = {
            "egf-twitch": {
                "id": "egf-twitch",
                "platform": "twitch",
                "channel_id": "europeangofederation",
            },
            "baduk-tv": {
                "id": "baduk-tv",
                "platform": "youtube",
                "channel_id": "UCDDpGwSirMEje8H0fI7wM_A",
            },
        }

    def test_by_dgob_id_override_wins_over_by_category(self):
        raw = {"id": 999, "categories": [{"slug": "go-bundesliga"}]}
        stream_map = {
            "by_dgob_id": {"999": "baduk-tv"},
            "by_category": {"go-bundesliga": "egf-twitch"},
        }
        result = update_events._resolve_dgob_channel(
            raw, stream_map, self.channels_by_id
        )
        self.assertEqual(
            result, {"platform": "youtube", "id": "UCDDpGwSirMEje8H0fI7wM_A"}
        )

    def test_falls_back_to_by_category(self):
        raw = {"id": 1000, "categories": [{"slug": "go-bundesliga"}]}
        stream_map = {"by_dgob_id": {}, "by_category": {"go-bundesliga": "egf-twitch"}}
        result = update_events._resolve_dgob_channel(
            raw, stream_map, self.channels_by_id
        )
        self.assertEqual(
            result, {"platform": "twitch", "id": "europeangofederation"}
        )

    def test_returns_none_without_a_matching_assignment(self):
        raw = {"id": 1001, "categories": [{"slug": "wochenendturnier"}]}
        stream_map = {"by_dgob_id": {}, "by_category": {}}
        self.assertIsNone(
            update_events._resolve_dgob_channel(raw, stream_map, self.channels_by_id)
        )

    def test_returns_none_when_the_referenced_channel_does_not_exist(self):
        raw = {"id": 1002, "categories": [{"slug": "go-bundesliga"}]}
        stream_map = {"by_dgob_id": {}, "by_category": {"go-bundesliga": "nonexistent"}}
        self.assertIsNone(
            update_events._resolve_dgob_channel(raw, stream_map, self.channels_by_id)
        )


class DgobEventToTvEventChannelTest(unittest.TestCase):
    RAW = {
        "id": 42,
        "title": "Test",
        "start_date": "2026-11-19 20:00:00",
        "end_date": "2026-11-19 22:00:00",
        "utc_start_date": "2026-11-19 19:00:00",
        "all_day": True,
        "categories": [{"slug": "go-bundesliga"}],
        "url": "https://www.dgob.de/x",
    }

    def test_platform_follows_the_assigned_channel(self):
        stream_map = {"by_dgob_id": {}, "by_category": {"go-bundesliga": "egf-twitch"}}
        channels_by_id = {
            "egf-twitch": {
                "id": "egf-twitch",
                "platform": "twitch",
                "channel_id": "europeangofederation",
            }
        }
        tv_event = update_events.dgob_event_to_tv_event(
            self.RAW, stream_map, channels_by_id
        )
        self.assertEqual(tv_event["platform"], "twitch")
        self.assertEqual(
            tv_event["channel"], {"platform": "twitch", "id": "europeangofederation"}
        )

    def test_platform_is_other_without_an_assignment(self):
        stream_map = {"by_dgob_id": {}, "by_category": {}}
        tv_event = update_events.dgob_event_to_tv_event(self.RAW, stream_map, {})
        self.assertEqual(tv_event["platform"], "other")
        self.assertNotIn("channel", tv_event)


class DgobVideoLinksTest(unittest.TestCase):
    # Shape of the real DGoB description of the German Championship final
    # 2026 (event 22875, fetched 2026-11-13), shortened.
    DESCRIPTION = (
        '<p>Findet auf <a href="https://www.schloss-hundisburg.de/">Schloss'
        " Hundisburg</a> statt.</p><p>Live-Übertragung: Die Partien werden"
        ' auf <a href="https://www.twitch.tv/egf_games">Twitch</a>'
        ' übertragen. <a href="https://www.twitch.tv/europeangofederation">'
        'Kommentarstream</a>, FJD streamt auf <a href="https://www.youtube.com'
        '/@JuppTube">YouTube</a>. Partien auf <a href="https://gogameslive.eu'
        '/german-championship-2026/">GoGamesLive</a>.</p>'
    )

    def raw(self, description):
        return dict(DgobEventToTvEventChannelTest.RAW, description=description)

    def test_extracts_twitch_and_youtube_links_in_order(self):
        self.assertEqual(
            update_events.dgob_video_links(self.raw(self.DESCRIPTION)),
            [
                ("twitch", "https://www.twitch.tv/egf_games"),
                ("twitch", "https://www.twitch.tv/europeangofederation"),
                ("youtube", "https://www.youtube.com/@JuppTube"),
            ],
        )

    def test_ignores_non_video_links_and_duplicates(self):
        description = (
            '<a href="https://www.twitch.tv/directory">x</a>'
            '<a href="https://www.dgob.de/">x</a>'
            '<a href="https://youtu.be/abcdef123">x</a>'
            '<a href="https://youtu.be/abcdef123">again</a>'
            '<a href="https://www.twitch.tv/videos/123456">vod</a>'
        )
        self.assertEqual(
            update_events.dgob_video_links(self.raw(description)),
            [
                ("youtube", "https://youtu.be/abcdef123"),
                ("twitch", "https://www.twitch.tv/videos/123456"),
            ],
        )

    def test_no_description_no_links(self):
        self.assertEqual(update_events.dgob_video_links(self.raw(None)), [])

    def test_first_link_becomes_the_stream_further_ones_go_to_notes(self):
        raw = dict(self.raw(self.DESCRIPTION), venue={"venue": "Schloss Hundisburg"})
        stream_map = {"by_dgob_id": {}, "by_category": {}}
        tv_event = update_events.dgob_event_to_tv_event(raw, stream_map, {})
        self.assertEqual(tv_event["platform"], "twitch")
        self.assertEqual(tv_event["stream_url"], "https://www.twitch.tv/egf_games")
        self.assertEqual(
            tv_event["notes"],
            "Schloss Hundisburg · Weitere Streams: "
            "https://www.twitch.tv/europeangofederation, "
            "https://www.youtube.com/@JuppTube",
        )

    def test_page_without_video_stays_other_with_the_tournament_page(self):
        raw = self.raw('<a href="https://www.dgob.de/">Ausschreibung</a>')
        stream_map = {"by_dgob_id": {}, "by_category": {}}
        tv_event = update_events.dgob_event_to_tv_event(raw, stream_map, {})
        self.assertEqual(tv_event["platform"], "other")
        self.assertEqual(tv_event["stream_url"], "https://www.dgob.de/x")


class LoadDgobStreamMapTest(unittest.TestCase):
    def test_missing_file_returns_empty_map(self):
        result = update_events.load_dgob_stream_map(
            Path("/nonexistent/dir/dgob_streams.json")
        )
        self.assertEqual(result, {"by_dgob_id": {}, "by_category": {}})

    def test_loads_a_real_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "streams.json"
            p.write_text(
                json.dumps(
                    {"by_dgob_id": {"1": "x"}, "by_category": {"go-bundesliga": "y"}}
                ),
                encoding="utf-8",
            )
            result = update_events.load_dgob_stream_map(p)
            self.assertEqual(
                result, {"by_dgob_id": {"1": "x"}, "by_category": {"go-bundesliga": "y"}}
            )

    def test_the_shipped_dgob_streams_json_loads_as_empty(self):
        # data/dgob_streams.json ships with no guessed assignment - see
        # AGENTS.md on not inventing unconfirmed entries.
        result = update_events.load_dgob_stream_map(update_events.DGOB_STREAM_MAP_PATH)
        self.assertEqual(result, {"by_dgob_id": {}, "by_category": {}})


class FetchJsonRetryTest(unittest.TestCase):
    class _FakeHttpResponse:
        def __init__(self, body_bytes):
            self._body = body_bytes

        def read(self):
            return self._body

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def test_retries_once_on_a_network_error_then_succeeds(self):
        calls = {"n": 0}

        def fake_urlopen(request, timeout=None):
            calls["n"] += 1
            if calls["n"] == 1:
                raise update_events.urllib.error.URLError("boom")
            return self._FakeHttpResponse(json.dumps({"ok": True}).encode("utf-8"))

        with mock.patch.object(
            update_events.urllib.request, "urlopen", side_effect=fake_urlopen
        ):
            result = update_events._fetch_json(
                "http://example.invalid", timeout=1, retries=1
            )
        self.assertEqual(result, {"ok": True})
        self.assertEqual(calls["n"], 2)

    def test_raises_after_exhausting_retries(self):
        def fake_urlopen(request, timeout=None):
            raise update_events.urllib.error.URLError("boom")

        with mock.patch.object(
            update_events.urllib.request, "urlopen", side_effect=fake_urlopen
        ):
            with self.assertRaises(update_events.DgobFetchError):
                update_events._fetch_json("http://example.invalid", timeout=1, retries=1)

    def test_invalid_json_is_not_retried(self):
        calls = {"n": 0}

        def fake_urlopen(request, timeout=None):
            calls["n"] += 1
            return self._FakeHttpResponse(b"not json")

        with mock.patch.object(
            update_events.urllib.request, "urlopen", side_effect=fake_urlopen
        ):
            with self.assertRaises(update_events.DgobFetchError):
                update_events._fetch_json("http://example.invalid", timeout=1, retries=1)
        self.assertEqual(calls["n"], 1)


class FetchDgobEventsTest(unittest.TestCase):
    def test_follows_pagination_via_next_rest_url(self):
        page1 = {
            "total": 5,
            "events": [{"id": 1}, {"id": 2}],
            "next_rest_url": "http://fake/page2",
        }
        page2 = {
            "total": 5,
            "events": [{"id": 3}, {"id": 4}, {"id": 5}],
            "next_rest_url": None,
        }

        def fake_fetch_json(url, timeout, retries):
            return page2 if "page2" in url else page1

        with mock.patch.object(update_events, "_fetch_json", side_effect=fake_fetch_json):
            events = update_events.fetch_dgob_events("2026-11-13")
        self.assertEqual([e["id"] for e in events], [1, 2, 3, 4, 5])

    def test_raises_when_the_api_reports_total_zero(self):
        with mock.patch.object(
            update_events,
            "_fetch_json",
            return_value={"total": 0, "events": [], "next_rest_url": None},
        ):
            with self.assertRaises(update_events.DgobFetchError):
                update_events.fetch_dgob_events("2026-11-13")

    def test_raises_on_a_pagination_loop(self):
        loop_page = {
            "total": 1,
            "events": [{"id": 1}],
            "next_rest_url": "http://fake/loop",
        }
        with mock.patch.object(update_events, "_fetch_json", return_value=loop_page):
            with self.assertRaises(update_events.DgobFetchError):
                update_events.fetch_dgob_events("2026-11-13")

    def test_raises_on_an_unexpected_response_shape(self):
        with mock.patch.object(
            update_events, "_fetch_json", return_value={"not": "the expected shape"}
        ):
            with self.assertRaises(update_events.DgobFetchError):
                update_events.fetch_dgob_events("2026-11-13")


class MergeDgobEventsTest(unittest.TestCase):
    TODAY = datetime.date(2026, 11, 13)

    def test_adds_new_entries(self):
        fresh = [
            {
                "id": "dgob-1",
                "name": "A",
                "date_start": "2026-12-01",
                "platform": "other",
                "stream_url": "https://x",
                "region": "de",
                "source": "dgob",
            }
        ]
        merged, added, updated, removed = update_events.merge_dgob_events(
            [], fresh, self.TODAY
        )
        self.assertEqual(len(added), 1)
        self.assertEqual(updated, [])
        self.assertEqual(removed, [])
        self.assertIn(fresh[0], merged)

    def test_leaves_manual_entries_untouched(self):
        manual = {
            "id": "hand-1",
            "name": "Manual",
            "date_start": "2026-01-01",
            "platform": "youtube",
            "stream_url": "https://x",
        }
        merged, added, updated, removed = update_events.merge_dgob_events(
            [manual], [], self.TODAY
        )
        self.assertIn(manual, merged)
        self.assertEqual(added, [])

    def test_removes_a_future_entry_that_vanished_upstream(self):
        old_future = {
            "id": "dgob-1",
            "name": "A",
            "date_start": "2026-12-01",
            "platform": "other",
            "stream_url": "https://x",
            "region": "de",
            "source": "dgob",
        }
        merged, added, updated, removed = update_events.merge_dgob_events(
            [old_future], [], self.TODAY
        )
        self.assertEqual(removed, [old_future])
        self.assertNotIn(old_future, merged)

    def test_keeps_a_recent_past_entry_missing_from_the_fresh_fetch(self):
        # 2026-10-20 is 24 days before TODAY - within the 90-day window,
        # and the API (start_date=today) would never report it anyway.
        old_past = {
            "id": "dgob-1",
            "name": "A",
            "date_start": "2026-10-20",
            "platform": "other",
            "stream_url": "https://x",
            "region": "de",
            "source": "dgob",
        }
        merged, added, updated, removed = update_events.merge_dgob_events(
            [old_past], [], self.TODAY
        )
        self.assertEqual(removed, [])
        self.assertIn(old_past, merged)

    def test_removes_a_past_entry_beyond_the_90_day_retention_window(self):
        # 2026-08-01 is 104 days before TODAY - beyond 90 days.
        old_past = {
            "id": "dgob-1",
            "name": "A",
            "date_start": "2026-08-01",
            "platform": "other",
            "stream_url": "https://x",
            "region": "de",
            "source": "dgob",
        }
        merged, added, updated, removed = update_events.merge_dgob_events(
            [old_past], [], self.TODAY
        )
        self.assertEqual(removed, [old_past])
        self.assertNotIn(old_past, merged)

    def test_updates_a_changed_entry(self):
        old = {
            "id": "dgob-1",
            "name": "Old Name",
            "date_start": "2026-12-01",
            "platform": "other",
            "stream_url": "https://x",
            "region": "de",
            "source": "dgob",
        }
        fresh = {**old, "name": "New Name"}
        merged, added, updated, removed = update_events.merge_dgob_events(
            [old], [fresh], self.TODAY
        )
        self.assertEqual(len(updated), 1)
        self.assertEqual(updated[0]["name"], "New Name")
        self.assertEqual(added, [])
        self.assertEqual(removed, [])

    def test_unchanged_entry_is_not_reported_as_added_or_updated(self):
        same = {
            "id": "dgob-1",
            "name": "Same",
            "date_start": "2026-12-01",
            "platform": "other",
            "stream_url": "https://x",
            "region": "de",
            "source": "dgob",
        }
        merged, added, updated, removed = update_events.merge_dgob_events(
            [same], [dict(same)], self.TODAY
        )
        self.assertEqual(added, [])
        self.assertEqual(updated, [])
        self.assertEqual(removed, [])


class DgobMainIntegrationTest(unittest.TestCase):
    """main() --source dgob end-to-end, network mocked at _fetch_json -
    no real HTTP call. Uses the real fixture (DGOB_FIXTURE_PATH)."""

    @classmethod
    def setUpClass(cls):
        with DGOB_FIXTURE_PATH.open("r", encoding="utf-8") as f:
            cls.fixture = json.load(f)

    def _patched_fetch(self, fixture_events, total=None):
        payload = {
            "total": total if total is not None else len(fixture_events),
            "events": fixture_events,
            "next_rest_url": None,
        }
        return mock.patch.object(update_events, "_fetch_json", return_value=payload)

    def test_dry_run_prints_diff_and_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            events_path = Path(tmp) / "events.json"
            original = {"events": [], "channels": []}
            events_path.write_text(json.dumps(original), encoding="utf-8")

            with self._patched_fetch(self.fixture["events"]):
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    exit_code = update_events.main(
                        [
                            "--source",
                            "dgob",
                            "--events-file",
                            str(events_path),
                            "--dgob-start-date",
                            "2026-11-13",
                            "--dry-run",
                        ]
                    )
            self.assertEqual(exit_code, 0)
            self.assertIn("Would add 9 event(s):", out.getvalue())
            self.assertEqual(
                json.loads(events_path.read_text(encoding="utf-8")), original
            )

    def test_writes_dgob_events_and_sets_region_de(self):
        with tempfile.TemporaryDirectory() as tmp:
            events_path = Path(tmp) / "events.json"
            events_path.write_text(
                json.dumps({"events": [], "channels": []}), encoding="utf-8"
            )

            with self._patched_fetch(self.fixture["events"]):
                exit_code = update_events.main(
                    [
                        "--source",
                        "dgob",
                        "--events-file",
                        str(events_path),
                        "--dgob-start-date",
                        "2026-11-13",
                    ]
                )
            self.assertEqual(exit_code, 0)
            written = json.loads(events_path.read_text(encoding="utf-8"))
            dgob_events = [e for e in written["events"] if e["source"] == "dgob"]
            self.assertEqual(len(dgob_events), 9)
            self.assertTrue(all(e["region"] == "de" for e in dgob_events))

    def test_second_run_against_the_same_data_is_a_no_op(self):
        with tempfile.TemporaryDirectory() as tmp:
            events_path = Path(tmp) / "events.json"
            events_path.write_text(
                json.dumps({"events": [], "channels": []}), encoding="utf-8"
            )
            args = [
                "--source",
                "dgob",
                "--events-file",
                str(events_path),
                "--dgob-start-date",
                "2026-11-13",
            ]

            with self._patched_fetch(self.fixture["events"]):
                update_events.main(args)
                after_first = events_path.read_text(encoding="utf-8")

                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    exit_code = update_events.main(args)
                after_second = events_path.read_text(encoding="utf-8")

            self.assertEqual(exit_code, 0)
            self.assertIn("No changes.", out.getvalue())
            self.assertEqual(after_first, after_second)  # byte-identical

    def test_leaves_manual_events_and_channels_byte_identical(self):
        manual_event = {
            "id": "deepmind-lee-sedol-2016-game1",
            "name": "AlphaGo vs Lee Sedol – Spiel 1",
            "date_start": "2016-03-09",
            "platform": "youtube",
            "stream_url": "https://www.youtube.com/watch?v=vFr3K2DORc8",
            "video_id": "vFr3K2DORc8",
        }
        manual_channel = {
            "id": "egf-twitch",
            "name": "European Go Federation (Twitch)",
            "platform": "twitch",
            "url": "https://www.twitch.tv/europeangofederation",
            "channel_id": "europeangofederation",
        }
        with tempfile.TemporaryDirectory() as tmp:
            events_path = Path(tmp) / "events.json"
            events_path.write_text(
                json.dumps({"events": [manual_event], "channels": [manual_channel]}),
                encoding="utf-8",
            )
            with self._patched_fetch(self.fixture["events"]):
                update_events.main(
                    [
                        "--source",
                        "dgob",
                        "--events-file",
                        str(events_path),
                        "--dgob-start-date",
                        "2026-11-13",
                    ]
                )
            written = json.loads(events_path.read_text(encoding="utf-8"))
            self.assertIn(manual_event, written["events"])
            self.assertEqual(written["channels"], [manual_channel])

    def test_fetch_failure_leaves_the_file_untouched_and_exits_nonzero(self):
        with tempfile.TemporaryDirectory() as tmp:
            events_path = Path(tmp) / "events.json"
            original = {
                "events": [
                    {
                        "id": "hand-1",
                        "name": "X",
                        "date_start": "2026-01-01",
                        "platform": "other",
                        "stream_url": "https://x",
                    }
                ],
                "channels": [],
            }
            events_path.write_text(json.dumps(original), encoding="utf-8")

            with mock.patch.object(
                update_events,
                "_fetch_json",
                side_effect=update_events.DgobFetchError("boom"),
            ):
                out = io.StringIO()
                with contextlib.redirect_stderr(out):
                    exit_code = update_events.main(
                        [
                            "--source",
                            "dgob",
                            "--events-file",
                            str(events_path),
                            "--dgob-start-date",
                            "2026-11-13",
                        ]
                    )
            self.assertEqual(exit_code, 1)
            self.assertEqual(
                json.loads(events_path.read_text(encoding="utf-8")), original
            )

    def test_refuses_to_remove_every_existing_dgob_entry(self):
        old_dgob = {
            "id": "dgob-999",
            "name": "Old",
            "date_start": "2026-12-01",
            "platform": "other",
            "stream_url": "https://x",
            "region": "de",
            "source": "dgob",
        }
        with tempfile.TemporaryDirectory() as tmp:
            events_path = Path(tmp) / "events.json"
            original = {"events": [old_dgob], "channels": []}
            events_path.write_text(json.dumps(original), encoding="utf-8")

            # Fetch succeeds but returns 0 events matching our target
            # categories while total > 0 - fetch_dgob_events itself does
            # not raise, so the all-would-be-removed guard in main() is
            # what has to catch this.
            payload = {
                "total": 1,
                "events": [{"id": 1, "categories": [{"slug": "unrelated"}]}],
                "next_rest_url": None,
            }
            with mock.patch.object(update_events, "_fetch_json", return_value=payload):
                out = io.StringIO()
                with contextlib.redirect_stderr(out):
                    exit_code = update_events.main(
                        [
                            "--source",
                            "dgob",
                            "--events-file",
                            str(events_path),
                            "--dgob-start-date",
                            "2026-11-13",
                        ]
                    )
            self.assertEqual(exit_code, 1)
            self.assertIn("Refusing to import", out.getvalue())
            self.assertEqual(
                json.loads(events_path.read_text(encoding="utf-8")), original
            )


if __name__ == "__main__":
    unittest.main()

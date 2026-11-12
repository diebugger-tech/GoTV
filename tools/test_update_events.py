#!/usr/bin/env python3
"""Unit tests for tools/update_events.py. Standard library only
(unittest), run via: python3 -m unittest tools.test_update_events -v
"""
import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import update_events  # noqa: E402

FIXTURE_PATH = Path(__file__).resolve().parent / "testdata" / "twitch-egf-sample.ics"


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


if __name__ == "__main__":
    unittest.main()

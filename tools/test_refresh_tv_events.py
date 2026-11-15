import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from tools import refresh_tv_events


class RefreshTvEventsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.seed = self.root / "public/tv/events.json"
        self.seed.parent.mkdir(parents=True)
        self.seed.write_text(json.dumps({"events": [{"id": "hand"}], "channels": []}))
        self.cache = self.root / "cache/events.json"
        for build in ("build", "build-desktop"):
            (self.root / build / "tv").mkdir(parents=True)
            (self.root / build / "index.html").write_text("app")

    def import_source(self, argv):
        target = Path(argv[argv.index("--events-file") + 1])
        source = argv[argv.index("--source") + 1]
        data = json.loads(target.read_text())
        data["events"].append({"id": source, "source": source})
        target.write_text(json.dumps(data))
        return 0

    def test_publishes_imports_atomically_without_changing_repo_source(self):
        with mock.patch.object(refresh_tv_events.update_events, "main", self.import_source):
            self.assertEqual(refresh_tv_events.refresh(self.root, self.cache), [])
        expected_ids = ["hand", "dgob", "twitch-egf", "egf-calendar"]
        self.assertEqual([e["id"] for e in json.loads(self.cache.read_text())["events"]], expected_ids)
        for build in ("build", "build-desktop"):
            self.assertEqual((self.root / build / "tv/events.json").read_bytes(), self.cache.read_bytes())
        self.assertEqual(json.loads(self.seed.read_text())["events"], [{"id": "hand"}])

    def test_failed_source_cannot_publish_partial_data_or_remove_previous_entries(self):
        self.cache.parent.mkdir()
        self.cache.write_text(json.dumps({"events": [{"id": "old-dgob", "source": "dgob"}]}))

        def broken_import(argv):
            self.import_source(argv)
            if argv[argv.index("--source") + 1] == "dgob":
                raise RuntimeError("upstream unavailable")
            return 0

        with mock.patch.object(refresh_tv_events.update_events, "main", broken_import):
            self.assertEqual(refresh_tv_events.refresh(self.root, self.cache), ["dgob"])
        ids = [e["id"] for e in json.loads(self.cache.read_text())["events"]]
        self.assertEqual(ids, ["hand", "old-dgob", "twitch-egf", "egf-calendar"])

    def test_empty_cached_source_cannot_resurrect_cancelled_seed_events(self):
        self.seed.write_text(json.dumps({"events": [{"id": "cancelled", "source": "twitch-egf"}]}))
        self.cache.parent.mkdir()
        self.cache.write_text(json.dumps({"events": []}))
        with mock.patch.object(refresh_tv_events.update_events, "main", return_value=1):
            refresh_tv_events.refresh(self.root, self.cache)
        self.assertEqual(json.loads(self.cache.read_text())["events"], [])


if __name__ == "__main__":
    unittest.main()

import json
import os
import tempfile
import unittest
from datetime import datetime, timezone

from scripts.collect_ted import build_query, parse_payload, write_feed


class TedCollectorTests(unittest.TestCase):
    def test_builds_rolling_date_query(self):
        now = datetime(2026, 11, 19, tzinfo=timezone.utc)
        self.assertEqual(
            build_query(45, now),
            "publication-date>=20261005 SORT BY publication-date DESC",
        )

    def test_rejects_invalid_period(self):
        with self.assertRaises(ValueError):
            build_query(0)

    def test_maps_french_fields_and_keeps_notice_unverified(self):
        feed = parse_payload(
            {
                "totalNoticeCount": 1,
                "notices": [{
                    "publication-number": "123-2026",
                    "notice-title": {"fra": "Fourniture de mobilier", "eng": "Furniture"},
                    "buyer-name": {"fra": "Ville de Lille"},
                    "buyer-country": ["FRA"],
                    "classification-cpv": ["39100000"],
                    "publication-date": "2026-11-19",
                    "links": {"html": {"fra": "https://ted.europa.eu/fr/notice/123"}},
                }],
            },
            "query",
            "2026-11-19T00:00:00+00:00",
        )
        self.assertEqual(feed["count"], 1)
        notice = feed["notices"][0]
        self.assertEqual(notice["title"], "Fourniture de mobilier")
        self.assertEqual(notice["buyer"], "Ville de Lille")
        self.assertEqual(notice["url"], "https://ted.europa.eu/fr/notice/123")
        self.assertFalse(notice["verified"])

    def test_uses_fallback_url_and_deduplicates_publication_numbers(self):
        row = {
            "publication-number": "456-2026",
            "notice-title": "Avis",
        }
        feed = parse_payload({"notices": [row, row]}, "query")
        self.assertEqual(feed["count"], 1)
        self.assertEqual(
            feed["notices"][0]["url"],
            "https://ted.europa.eu/en/notice/-/detail/456-2026",
        )

    def test_rejects_non_ted_external_notice_url(self):
        feed = parse_payload({
            "notices": [{
                "publication-number": "123/2026",
                "notice-title": "Avis",
                "links": {"html": {"fra": "https://ted.europa.eu.attacker.example/fake"}},
            }]
        }, "query")
        self.assertEqual(
            feed["notices"][0]["url"],
            "https://ted.europa.eu/en/notice/-/detail/123%2F2026",
        )

    def test_rejects_timed_out_response(self):
        with self.assertRaises(RuntimeError):
            parse_payload({"timedOut": True, "notices": []}, "query")

    def test_rejects_malformed_response(self):
        with self.assertRaises(ValueError):
            parse_payload({"notices": None}, "query")

    def test_empty_successful_response_is_valid(self):
        feed = parse_payload({"notices": [], "totalNoticeCount": 0}, "query")
        self.assertEqual(feed["count"], 0)
        self.assertEqual(feed["notices"], [])

    def test_write_is_valid_json(self):
        feed = {"count": 0, "notices": []}
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "feed.json")
            write_feed(feed, path)
            with open(path, encoding="utf-8") as handle:
                self.assertEqual(json.load(handle), feed)
            self.assertFalse(os.path.exists(path + ".tmp"))


if __name__ == "__main__":
    unittest.main()

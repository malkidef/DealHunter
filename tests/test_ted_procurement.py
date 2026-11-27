import json
import tempfile
import unittest
from pathlib import Path

from scripts.ted_procurement import normalize_notice, first_value, fetch_notices


class TedNoticeTests(unittest.TestCase):
    def test_extracts_multilingual_values_preferring_english(self):
        self.assertEqual(first_value({"fra": "Acheteur", "eng": "Buyer"}), "Buyer")

    def test_normalizes_notice_as_unverified_buyer_signal(self):
        row = normalize_notice({
            "publication-number": "123456-2026",
            "notice-title": {"eng": "Supply of hospital equipment", "fra": "Fourniture"},
            "buyer-name": ["Public Hospital"],
            "buyer-country": "FRA",
            "publication-date": "2026-11-17",
            "deadline-date": "2026-12-17",
            "notice-type": "Contract notice",
        }, "2026-11-17T12:00:00+00:00")
        self.assertEqual(row["source_notice_id"], "123456-2026")
        self.assertEqual(row["id"], "123456-2026")
        self.assertEqual(row["title"], "Supply of hospital equipment")
        self.assertEqual(row["buyer"], "Public Hospital")
        self.assertEqual(row["buyer_name"], "Public Hospital")
        self.assertEqual(row["country"], "FRA")
        self.assertEqual(row["deadline"], "2026-12-17")
        self.assertTrue(row["url"].startswith("https://"))
        self.assertFalse(row["verified"])
        self.assertEqual(row["direction"], "buyer")
        self.assertEqual(row["review_status"], "pending")
        self.assertEqual(row["demand_status"], "unverified")
        self.assertIn("123456-2026", row["source_url"])

    def test_ignores_empty_notice(self):
        self.assertIsNone(normalize_notice({"other": "x"}, "now"))

    def test_fetch_uses_bounded_limit_and_expected_search_fields(self):
        # Validate request contract without network by replacing urlopen.
        import scripts.ted_procurement as ted
        class FakeResponse:
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self):
                return json.dumps({"total": 1, "notices": [{"publication-number": "1"}]}).encode()
        seen = {}
        original = ted.urlopen
        try:
            def fake_open(request, timeout):
                seen["request"] = request
                seen["timeout"] = timeout
                return FakeResponse()
            ted.urlopen = fake_open
            rows, total = fetch_notices("PD>=20260101", 999)
        finally:
            ted.urlopen = original
        body = json.loads(seen["request"].data.decode())
        self.assertEqual(body["limit"], 250)
        self.assertIn("publication-number", body["fields"])
        self.assertEqual(total, 1)
        self.assertEqual(len(rows), 1)


class TedCollectorPaginationTests(unittest.TestCase):
    def test_collects_multiple_pages_and_deduplicates(self):
        import scripts.collect_ted as collector
        calls = []
        original = collector.fetch_page
        try:
            def fake_page(query, page, limit):
                calls.append((page, limit))
                if page == 1:
                    return ([{"publication-number": str(i), "notice-title": "Notice"} for i in range(250)], 251)
                return ([{"publication-number": "249", "notice-title": "Duplicate"},
                         {"publication-number": "250", "notice-title": "Last"}], 251)
            collector.fetch_page = fake_page
            rows, total, truncated = collector.collect_notices("PD>=20261101")
        finally:
            collector.fetch_page = original
        self.assertEqual(calls, [(1, 250), (2, 250)])
        self.assertEqual(len(rows), 251)
        self.assertEqual(total, 251)
        self.assertFalse(truncated)

    def test_stops_at_configured_cap_and_reports_truncation(self):
        import scripts.collect_ted as collector
        original = collector.fetch_page
        try:
            collector.fetch_page = lambda query, page, limit: (
                [{"publication-number": f"{page}-{i}", "notice-title": "Notice"} for i in range(250)],
                6000
            )
            rows, total, truncated = collector.collect_notices("PD>=20261101", max_records=300)
        finally:
            collector.fetch_page = original
        self.assertEqual(len(rows), 300)
        self.assertEqual(total, 6000)
        self.assertTrue(truncated)

    def test_invalid_response_keeps_failure_explicit(self):
        import scripts.collect_ted as collector
        class FakeResponse:
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self): return json.dumps({"timedOut": True}).encode()
        original_open = collector.urllib.request.urlopen
        try:
            collector.urllib.request.urlopen = lambda request, timeout: FakeResponse()
            with self.assertRaises(RuntimeError):
                collector.fetch_page("PD>=20261101", 1)
        finally:
            collector.urllib.request.urlopen = original_open


if __name__ == "__main__":
    unittest.main()

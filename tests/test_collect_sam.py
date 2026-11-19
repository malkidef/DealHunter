import json
import os
import tempfile
import unittest
from datetime import date

from scripts.collect_sam import collect, date_range, normalize_notice, write_feed


class SamCollectorTests(unittest.TestCase):
    def test_date_range(self):
        self.assertEqual(date_range(7, date(2026, 11, 19)), ("11/13/2026", "11/19/2026"))

    def test_rejects_invalid_date_range(self):
        with self.assertRaises(ValueError):
            date_range(366, date(2026, 11, 19))

    def test_normalizes_surplus_notice_without_inventing_fields(self):
        notice = normalize_notice({
            "noticeId": "abc123",
            "title": "Surplus office furniture",
            "fullParentPathName": "GENERAL SERVICES ADMINISTRATION",
            "office": "PBS",
            "solicitationNumber": "GS-01",
            "type": "Sale of Surplus Property",
            "postedDate": "2026-11-19",
            "reponseDeadLine": "2026-12-01",
            "naicsCode": "337",
            "classificationCode": "71",
            "data": {"placeOfPerformance": {
                "city": "Washington", "state": "DC",
                "country": {"code": "USA", "name": "UNITED STATES"}, "zip": "20001"
            }},
        })
        self.assertEqual(notice["notice_id"], "abc123")
        self.assertEqual(notice["buyer_organization"], "GENERAL SERVICES ADMINISTRATION")
        self.assertEqual(notice["place_of_performance"]["city"], "Washington")
        self.assertEqual(notice["source_url"], "https://sam.gov/opp/abc123/view")
        self.assertFalse(notice["verified"])

    def test_rejects_non_sam_external_notice_url(self):
        notice = normalize_notice({
            "noticeId": "lot/123",
            "title": "Surplus lot",
            "uiLink": "https://sam-gov.example/phishing",
        })
        self.assertEqual(notice["source_url"], "https://sam.gov/opp/lot%2F123/view")

    def test_ignores_rows_without_identity_or_title(self):
        self.assertIsNone(normalize_notice({"noticeId": "missing-title"}))
        self.assertIsNone(normalize_notice({"title": "Missing ID"}))

    def test_collect_paginates_and_deduplicates(self):
        calls = []
        class Response:
            def __init__(self, payload):
                self.payload = payload
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def read(self):
                return json.dumps(self.payload).encode()
        def opener(request, timeout):
            calls.append(request.full_url)
            offset = len(calls) - 1
            if offset == 0:
                return Response({"totalRecords": 2, "opportunitiesData": [
                    {"noticeId": "1", "title": "Lot A"},
                ]})
            return Response({"totalRecords": 2, "opportunitiesData": [
                {"noticeId": "1", "title": "Lot A"},
                {"noticeId": "2", "title": "Lot B"},
            ]})
        feed = collect("test-key", days=10, limit=1, max_pages=3, today=date(2026, 11, 19), opener=opener)
        self.assertEqual(feed["count"], 2)
        self.assertEqual([n["notice_id"] for n in feed["notices"]], ["1", "2"])
        self.assertIn("ptype=g", calls[0])
        self.assertIn("api_key=test-key", calls[0])

    def test_malformed_total_records_does_not_abort_pagination(self):
        calls = []
        class Response:
            def __init__(self, payload):
                self.payload = payload
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def read(self):
                return json.dumps(self.payload).encode()
        def opener(request, timeout):
            calls.append(request.full_url)
            if len(calls) == 1:
                return Response({"totalRecords": "not-a-number", "opportunitiesData": [
                    {"noticeId": "1", "title": "Lot A"},
                ]})
            return Response({"totalRecords": "not-a-number", "opportunitiesData": []})
        feed = collect("test-key", days=2, limit=1, max_pages=3,
                       today=date(2026, 11, 19), opener=opener)
        self.assertEqual(feed["count"], 1)
        self.assertIsNone(feed["total_matching_notices"])
        self.assertEqual(feed["pages_collected"], 2)
        self.assertEqual(len(calls), 2)

    def test_requires_api_key(self):
        with self.assertRaises(ValueError):
            collect("")

    def test_write_feed_outputs_json(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "sam.json")
            write_feed({"notices": [], "count": 0}, path)
            with open(path, encoding="utf-8") as handle:
                self.assertEqual(json.load(handle)["count"], 0)


if __name__ == "__main__":
    unittest.main()

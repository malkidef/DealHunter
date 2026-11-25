import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

from scripts.source_review_queue import build_queue


class SourceReviewQueueTests(unittest.TestCase):
    def write(self, root, name, payload):
        path = root / name
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

    def test_builds_review_only_queue_and_keeps_source_types_separate(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            inputs = {
                "boamp": self.write(root, "boamp.json", {"notices": [
                    {"id": "B1", "title": "Fourniture de gants", "kind": "produits",
                     "category": "EPI", "deadline": "2027-01-10", "url": "https://boamp.fr/B1"},
                    {"id": "B2", "title": "Nettoyage", "kind": "services",
                     "deadline": "2027-01-10"},
                    {"id": "B3", "title": "Fourniture expirée", "kind": "produits",
                     "deadline": "2025-01-10"}
                ]}),
                "ted": self.write(root, "ted.json", {"notices": [
                    {"id": "T1", "title": "Supply of gloves", "noticeType": "cn-standard",
                     "publicationDate": "2026-11-20", "url": "https://ted.europa.eu/T1"},
                    {"id": "T2", "title": "Awarded contract", "noticeType": "can-award"}
                ]}),
                "sam": root / "sam.json",
                "gsa": self.write(root, "gsa.json", {"listings": [
                    {"source_listing_id": "G1", "title": "Used trailer",
                     "auction_status": "active", "source_url": "https://gsa.gov/G1"}
                ]}),
                "bodacc": self.write(root, "bodacc.json", {"notices": [
                    {"source_listing_id": "D1", "title": "Cession de fonds"}
                ]}),
            }
            result = build_queue(inputs, today=date(2026, 11, 25))

        self.assertEqual(result["mode"], "review_only_no_firestore_writes")
        self.assertEqual(result["count"], 3)
        by_source = {item["source_id"]: item for item in result["review_queue"]}
        self.assertEqual(set(by_source), {"boamp", "ted_eu", "gsa_auctions"})
        self.assertEqual(by_source["boamp"]["direction"], "buyer")
        self.assertEqual(by_source["gsa_auctions"]["direction"], "seller")
        for item in result["review_queue"]:
            self.assertEqual(item["review_status"], "pending")
            self.assertEqual(item["promotion_status"], "not_promoted")
            self.assertFalse(item["verified"])
            self.assertIsNone(item["quantity"])
            self.assertIsNone(item["unit_price"])
            self.assertNotIn("source_snapshot", item)
        self.assertEqual(result["excluded_count"], 1)
        self.assertIn("exclu", result["excluded_signals"][0]["reason"].lower())

    def test_empty_or_missing_sam_feed_is_reported_as_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            empty = root / "empty.json"
            empty.write_text("", encoding="utf-8")
            inputs = {key: empty for key in ("boamp", "ted", "sam", "gsa", "bodacc")}
            result = build_queue(inputs, today=date(2026, 11, 25))
        self.assertEqual(result["source_status"]["sam_gov"]["input_status"], "empty")
        self.assertEqual(result["source_status"]["sam_gov"]["records_read"], 0)
        self.assertEqual(result["count"], 0)


if __name__ == "__main__":
    unittest.main()

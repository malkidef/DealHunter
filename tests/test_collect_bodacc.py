import unittest

from scripts import collect_bodacc as collector
from scripts.collect_bodacc import build_api_url, normalize_notice


class BodaccCollectorTests(unittest.TestCase):
    def test_api_url_uses_official_dataset_and_sales_filter(self):
        url = build_api_url()
        self.assertIn("/catalog/datasets/annonces-commerciales/records?", url)
        self.assertIn("familleavis", url)
        self.assertIn("vente", url)
        self.assertIn("dateparution", url)
        self.assertIn("select", url)
        self.assertNotIn("listepersonnes", url)
        self.assertNotIn("commercant", url)

    def test_normalizes_sale_notice_without_personal_or_stock_data(self):
        row = {
            "id": "A20260012345",
            "familleavis": "vente",
            "familleavis_lib": "Ventes et cessions",
            "ville": "Lille",
            "departement_nom_officiel": "Nord",
            "numerodepartement": "59",
            "dateparution": "2026-11-18",
            "url_complete": "https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:A20260012345",
            "commercant": "Donnée potentiellement personnelle à ne pas importer",
            "listepersonnes": "Donnée personnelle à ne pas importer",
        }
        notice = normalize_notice(row, "2026-11-19T00:00:00+00:00")
        self.assertEqual(notice["source_listing_id"], "A20260012345")
        self.assertEqual(notice["city"], "Lille")
        self.assertEqual(notice["department_code"], "59")
        self.assertFalse(notice["is_inventory"])
        self.assertEqual(notice["review_status"], "pending")
        self.assertNotIn("commercant", notice)
        self.assertNotIn("listepersonnes", notice)
        self.assertNotIn("quantity", notice)
        self.assertNotIn("unit_price", notice)

    def test_rejects_non_sales_and_missing_ids(self):
        self.assertIsNone(normalize_notice({"id": "X", "familleavis": "creation"}, "now"))
        self.assertIsNone(normalize_notice({"familleavis": "vente"}, "now"))

    def test_rejects_non_official_source_url(self):
        notice = normalize_notice(
            {"id": "A1", "familleavis": "vente", "url_complete": "https://example.com"},
            "now",
        )
        self.assertEqual(notice["source_url"], "https://www.bodacc.fr/")


    def test_api_url_supports_offset_pagination(self):
        url = build_api_url(limit=100, offset=200)
        self.assertIn("limit=100", url)
        self.assertIn("offset=200", url)

    def test_fetches_multiple_pages(self):
        from unittest.mock import patch
        calls = []
        def fake_get_json(url):
            calls.append(url)
            if "offset=0" in url:
                return {"total_count": 101, "results": [{"id": str(i), "familleavis": "vente"} for i in range(100)]}
            return {"total_count": 101, "results": [{"id": "100", "familleavis": "vente"}]}
        with patch.object(collector, "get_json", side_effect=fake_get_json):
            rows, total, truncated = collector.fetch_records()
        self.assertEqual(len(rows), 101)
        self.assertEqual(total, 101)
        self.assertFalse(truncated)
        self.assertEqual(len(calls), 2)

    def test_reports_safety_cap(self):
        from unittest.mock import patch
        def fake_get_json(url):
            offset = int(url.split("offset=")[1].split("&")[0])
            return {"total_count": 6000, "results": [{"id": str(i), "familleavis": "vente"} for i in range(offset, offset + 100)]}
        with patch.object(collector, "MAX_RECORDS", 150), patch.object(collector, "get_json", side_effect=fake_get_json):
            rows, total, truncated = collector.fetch_records()
        self.assertEqual(len(rows), 150)
        self.assertEqual(total, 6000)
        self.assertTrue(truncated)

    def test_rejects_invalid_page_response(self):
        from unittest.mock import patch
        with patch.object(collector, "get_json", return_value={"unexpected": []}):
            with self.assertRaises(RuntimeError):
                collector.fetch_records()


if __name__ == "__main__":
    unittest.main()

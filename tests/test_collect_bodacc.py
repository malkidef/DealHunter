import unittest

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


if __name__ == "__main__":
    unittest.main()

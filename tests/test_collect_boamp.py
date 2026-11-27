import importlib.util
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "collect_boamp", Path(__file__).resolve().parents[1] / "scripts" / "collect_boamp.py"
)
BOAMP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BOAMP)


class TestBoampClassification(unittest.TestCase):
    def assert_kind(self, title, expected):
        self.assertEqual(BOAMP.classify(title)["kind"], expected, title)

    def test_service_wording_beats_product_keywords(self):
        self.assert_kind("Étude de trafic, circulation, sécurité", "services")
        self.assert_kind("Location de véhicules longue durée pour les besoins", "services")
        self.assert_kind("Fourniture de services de téléphonie mobile, de terminaux et accessoires", "services")
        self.assert_kind("Services sylvicoles, fourniture et mise en place de plants", "services")

    def test_product_purchases_are_detected(self):
        self.assert_kind("Achat de produits appertisés", "produits")
        self.assert_kind("Acquisition d’équipements de capture volumétrique", "produits")
        self.assert_kind("Fourniture de matériels de sonorisation et d’éclairage scénique", "produits")
        self.assert_kind("Achat de bacs et de matériel de manutention légère", "produits")

    def test_works_keep_priority_over_generic_supply_terms(self):
        self.assert_kind("Travaux de fourniture et pose d’une étanchéité", "travaux")

    def test_attribution_is_not_a_new_need(self):
        self.assert_kind("Avis d’attribution du marché de fournitures", "attribution")


class TestBoampPagination(unittest.TestCase):
    def test_fetches_multiple_pages_until_total(self):
        from unittest.mock import patch
        calls=[]
        def fake_get_json(url):
            calls.append(url)
            offset=int(url.split("offset=")[1].split("&")[0])
            if offset==0:
                return {"total_count":101,"results":[{"id":str(i)} for i in range(100)]}
            return {"total_count":101,"results":[{"id":"100"}]}
        with patch.object(BOAMP,"get_json",side_effect=fake_get_json):
            rows,total,truncated=BOAMP.fetch_records()
        self.assertEqual(len(rows),101)
        self.assertEqual(total,101)
        self.assertFalse(truncated)
        self.assertEqual(len(calls),2)
        self.assertIn("offset=100",calls[1])

    def test_reports_truncation_at_safety_cap(self):
        from unittest.mock import patch
        def fake_get_json(url):
            offset=int(url.split("offset=")[1].split("&")[0])
            return {"total_count":250,"results":[{"id":str(i)} for i in range(offset,offset+100)]}
        with patch.object(BOAMP,"MAX_RECORDS",150), patch.object(BOAMP,"get_json",side_effect=fake_get_json):
            rows,total,truncated=BOAMP.fetch_records()
        self.assertEqual(len(rows),150)
        self.assertEqual(total,250)
        self.assertTrue(truncated)

    def test_invalid_page_is_rejected(self):
        from unittest.mock import patch
        with patch.object(BOAMP,"get_json",return_value={"unexpected":[]}):
            with self.assertRaises(RuntimeError):
                BOAMP.fetch_records()


if __name__ == "__main__":
    unittest.main()

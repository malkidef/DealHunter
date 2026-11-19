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


if __name__ == "__main__":
    unittest.main()

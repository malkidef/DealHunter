import unittest

from scripts.source_catalog import load_catalog, sources_for


class GlobalSourceCatalogTests(unittest.TestCase):
    def test_catalog_has_unique_sources_and_https_urls(self):
        catalog = load_catalog()
        self.assertGreaterEqual(len(catalog["sources"]), 5)
        ids = [source["id"] for source in catalog["sources"]]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(all(source["endpoint"].startswith("https://") for source in catalog["sources"]))

    def test_buyer_and_seller_sources_are_separated(self):
        buyers = sources_for("buyer")
        sellers = sources_for("seller")
        self.assertTrue(buyers)
        self.assertTrue(sellers)
        self.assertTrue(all("buyer" in source["direction"] for source in buyers))
        self.assertTrue(all("seller" in source["direction"] for source in sellers))

    def test_active_only_does_not_promote_catalogued_sources(self):
        active = sources_for("buyer", include_catalogued=False)
        self.assertTrue(all(source["integrationStatus"] == "active" for source in active))

    def test_invalid_direction_is_rejected(self):
        with self.assertRaises(ValueError):
            sources_for("both")


if __name__ == "__main__":
    unittest.main()

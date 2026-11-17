import unittest

from scripts.gsa_auctions import extract_results, normalize_listing


class GsaAuctionsMappingTests(unittest.TestCase):
    def test_extracts_uppercase_api_results_key(self):
        self.assertEqual(extract_results({"Results": [{"SaleNo": "1"}]}), [{"SaleNo": "1"}])

    def test_extracts_lowercase_results_key(self):
        self.assertEqual(extract_results({"results": [{"SaleNo": "2"}]}), [{"SaleNo": "2"}])

    def test_maps_listing_without_inventing_quantity_or_final_price(self):
        row = normalize_listing(
            {
                "SaleNo": "12345678901",
                "LotNo": 7,
                "ItemName": "Used office desks",
                "PropertyCity": "Denver",
                "PropertyState": "CO",
                "AuctionStatus": "A",
                "Reserve": 250.0,
                "HighBidAmount": "275.00",
                "AucEndDt": "2026-12-01",
                "ItemDescURL": "https://example.gov/lot",
                "COEmail": "do-not-import@example.gov",
                "COPhone": "5550000000",
            },
            "2026-11-17T12:00:00+00:00",
        )
        self.assertEqual(row["source_listing_id"], "12345678901-7")
        self.assertEqual(row["title"], "Used office desks")
        self.assertIsNone(row["quantity"])
        self.assertIsNone(row["unit_price"])
        self.assertEqual(row["reserve_price_usd"], 250.0)
        self.assertEqual(row["auction_status"], "active")
        self.assertEqual(row["review_status"], "pending")
        self.assertNotIn("COEmail", row)
        self.assertNotIn("COPhone", row)

    def test_handles_nested_lot_descriptions(self):
        row = normalize_listing(
            {
                "SaleNo": "SALE",
                "LotNo": 2,
                "LotInfo": [{"LotDescript": "Pallet of tools"}],
                "AuctionStatus": "P",
            },
            "now",
        )
        self.assertEqual(row["description"], "Pallet of tools")
        self.assertEqual(row["auction_status"], "preview")
        self.assertIsNone(row["source_url"])


if __name__ == "__main__":
    unittest.main()

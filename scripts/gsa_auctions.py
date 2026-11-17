#!/usr/bin/env python3
"""Fetch GSA Auctions public API listings into a review-only JSON file."""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

API_URL = "https://api.gsa.gov/assets/gsaauctions/v2/auctions"


def normalize_listing(item: dict, collected_at: str) -> dict:
    sale_no = str(item.get("SaleNo") or "").strip()
    lot_no = str(item.get("LotNo") or "").strip()
    listing_id = "-".join(part for part in (sale_no, lot_no) if part)
    item_name = str(item.get("ItemName") or "").strip()
    lot_info = item.get("LotInfo") or []
    lot_descriptions = [
        str(row.get("LotDescript") or "").strip()
        for row in lot_info
        if isinstance(row, dict) and row.get("LotDescript")
    ]
    description = " | ".join(lot_descriptions)
    status_code = str(item.get("AuctionStatus") or "").strip()
    status = {"A": "active", "P": "preview"}.get(status_code, "scheduled")

    return {
        "source_id": "gsa_auctions",
        "source_listing_id": listing_id or None,
        "source_url": str(item.get("ItemDescURL") or "").strip() or None,
        "title": item_name or description or "Lot GSA sans titre",
        "description": description or None,
        "category": "À classer",
        "quantity": None,
        "unit": "lot",
        "unit_price": None,
        "currency": "USD",
        "reserve_price_usd": item.get("Reserve"),
        "high_bid_usd": item.get("HighBidAmount"),
        "country_code": "US",
        "city": str(item.get("PropertyCity") or item.get("LocationCity") or "").strip() or None,
        "region": str(item.get("PropertyState") or item.get("LocationST") or "").strip() or None,
        "auction_start_date": item.get("AucStartDt"),
        "auction_end_date": item.get("AucEndDt"),
        "auction_status": status,
        "availability_status": "unverified",
        "review_status": "pending",
        "collected_at": collected_at,
        "notes": "Quantité non fournie. La réserve et l'enchère actuelle ne sont pas un prix final. Vérifier l'annonce originale et les conditions du lot.",
    }


def fetch_listings(api_key: str) -> list[dict]:
    # GSA's official examples pass the api.data.gov key as the api_key
    # query parameter (not as an X-API-KEY header).
    query = urlencode({"api_key": api_key, "format": "JSON"})
    request = Request(
        f"{API_URL}?{query}",
        headers={
            "Accept": "application/json",
            "User-Agent": "DealHunter/0.1 (GSA Auctions public API connector)",
        },
    )
    try:
        with urlopen(request, timeout=45) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raise RuntimeError(f"GSA API HTTP {exc.code}") from exc
    except URLError as exc:
        raise RuntimeError(f"Connexion à GSA API impossible : {exc.reason}") from exc
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError("La réponse GSA n'est pas un JSON valide.") from exc

    if isinstance(payload, dict) and payload.get("error"):
        detail = str(payload.get("message") or payload.get("error")).strip()
        raise RuntimeError(f"GSA API a refusé la requête : {detail}")
    results = payload.get("results") if isinstance(payload, dict) else None
    if not isinstance(results, list):
        keys = ", ".join(sorted(str(key) for key in payload.keys())) if isinstance(payload, dict) else type(payload).__name__
        raise RuntimeError(
            f"Format GSA inattendu (éléments reçus : {keys or 'aucun'}). "
            "Vérifier la réponse réelle de l'API avant de modifier le mapping."
        )
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="gsa-auctions-pending.json")
    parser.add_argument("--input", help="Fichier JSON local pour tester le mapping sans appel réseau.")
    args = parser.parse_args()

    if args.input:
        try:
            payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"Lecture du fichier de test impossible : {exc}", file=sys.stderr)
            return 1
        results = payload.get("results") if isinstance(payload, dict) else None
        if not isinstance(results, list):
            print("Le fichier de test doit contenir un tableau 'results'.", file=sys.stderr)
            return 1
    else:
        api_key = os.environ.get("GSA_API_KEY", "").strip()
        if not api_key:
            print("Secret GSA_API_KEY absent. Ajoutez-le dans GitHub Actions Secrets.", file=sys.stderr)
            return 2
        try:
            results = fetch_listings(api_key)
        except RuntimeError as exc:
            print(str(exc), file=sys.stderr)
            return 1

    collected_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    normalized = [
        normalize_listing(item, collected_at)
        for item in results
        if isinstance(item, dict)
    ]
    # Keep only minimal listing data; never import officer email/phone fields.
    output = {
        "source": "GSA Auctions",
        "source_url": "https://www.gsaauctions.gov/",
        "collected_at": collected_at,
        "count": len(normalized),
        "review_status": "pending",
        "listings": normalized,
    }
    destination = Path(args.output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(normalized)} annonce(s) préparée(s) pour vérification : {destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

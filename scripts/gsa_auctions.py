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


def extract_results(payload):
    """Accept the API's Results capitalization as well as lowercase fixtures."""
    if not isinstance(payload, dict):
        return None
    for key, value in payload.items():
        if str(key).casefold() == "results":
            return value
    return None


def field(item: dict, name: str, default=None):
    """Read API fields without depending on camelCase/PascalCase spelling."""
    wanted = name.casefold()
    for key, value in item.items():
        if str(key).casefold() == wanted:
            return value
    return default


def normalize_listing(item: dict, collected_at: str) -> dict:
    sale_no = str(field(item, "saleNo") or "").strip()
    lot_no = str(field(item, "lotNo") or "").strip()
    listing_id = "-".join(part for part in (sale_no, lot_no) if part)
    item_name = str(field(item, "itemName") or "").strip()
    lot_info = field(item, "lotInfo") or []
    lot_descriptions = [
        str(field(row, "lotDescript") or "").strip()
        for row in lot_info
        if isinstance(row, dict) and field(row, "lotDescript")
    ]
    description = " | ".join(lot_descriptions)
    status_code = str(field(item, "auctionStatus") or "").strip()
    status = {"A": "active", "P": "preview"}.get(status_code, "scheduled")

    return {
        "source_id": "gsa_auctions",
        "source_listing_id": listing_id or None,
        "source_url": str(field(item, "itemDescURL") or "").strip() or None,
        "title": item_name or description or "Lot GSA sans titre",
        "description": description or None,
        "category": "À classer",
        "quantity": None,
        "unit": "lot",
        "unit_price": None,
        "currency": "USD",
        "reserve_price_usd": field(item, "reserve"),
        "high_bid_usd": field(item, "highBidAmount"),
        "country_code": "US",
        "city": str(field(item, "propertyCity") or field(item, "locationCity") or "").strip() or None,
        "region": str(field(item, "propertyState") or field(item, "locationST") or "").strip() or None,
        "auction_start_date": field(item, "aucStartDt"),
        "auction_end_date": field(item, "aucEndDt"),
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
    results = extract_results(payload)
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
        results = extract_results(payload)
        if not isinstance(results, list):
            print("Le fichier de test doit contenir un tableau 'Results' ou 'results'.", file=sys.stderr)
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
    # Do not present empty placeholder records as usable opportunities.
    usable = [
        row for row in normalized
        if row["source_listing_id"] or row["source_url"] or row["title"] != "Lot GSA sans titre"
    ]
    sample = next((item for item in results if isinstance(item, dict)), {})
    output = {
        "source": "GSA Auctions",
        "source_url": "https://www.gsaauctions.gov/",
        "collected_at": collected_at,
        "raw_count": len(results),
        "count": len(usable),
        "api_field_names": sorted(str(key) for key in sample.keys()),
        "review_status": "pending",
        "listings": usable,
        "diagnostic": (
            "Aucun champ exploitable reconnu. Les noms de champs API sont fournis "
            "pour ajuster le mapping sans inventer de données."
            if results and not usable else None
        ),
    }
    destination = Path(args.output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(normalized)} annonce(s) préparée(s) pour vérification : {destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

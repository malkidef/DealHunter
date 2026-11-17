#!/usr/bin/env python3
"""Collect public EU procurement notices from the official TED Search API.

TED notices are buyer-demand signals only. They are never converted directly
into confirmed buyer requests or orders; every record remains pending review.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

API_URL = "https://api.ted.europa.eu/v3/notices/search"
DEFAULT_QUERY = "PD>=20260101"
FIELDS = [
    "publication-number",
    "notice-title",
    "buyer-name",
    "buyer-country",
    "publication-date",
    "deadline-date",
    "notice-type",
]


def first_value(value):
    """Extract a readable scalar from TED's multilingual/nested field values."""
    if value is None:
        return None
    if isinstance(value, str | int | float):
        return str(value).strip() or None
    if isinstance(value, list):
        for item in value:
            result = first_value(item)
            if result:
                return result
        return None
    if isinstance(value, dict):
        # Prefer English, then French, then the first available value.
        for language in ("eng", "en", "fra", "fre", "fr"):
            if language in value:
                result = first_value(value[language])
                if result:
                    return result
        for item in value.values():
            result = first_value(item)
            if result:
                return result
    return None


def normalize_notice(item: dict, collected_at: str) -> dict | None:
    publication_number = first_value(item.get("publication-number"))
    title = first_value(item.get("notice-title"))
    if not publication_number and not title:
        return None
    return {
        "source_id": "ted_eu",
        "source_notice_id": publication_number,
        "title": title or "Avis TED sans titre",
        "buyer_name": first_value(item.get("buyer-name")),
        "buyer_country": first_value(item.get("buyer-country")),
        "publication_date": first_value(item.get("publication-date")),
        "deadline_date": first_value(item.get("deadline-date")),
        "notice_type": first_value(item.get("notice-type")),
        "source_url": (
            f"https://ted.europa.eu/en/notice/-/detail/{publication_number}"
            if publication_number else None
        ),
        "direction": "buyer",
        "opportunity_type": "public_procurement_notice",
        "demand_status": "unverified",
        "review_status": "pending",
        "collected_at": collected_at,
        "notes": (
            "Avis de marché public : signal de besoin potentiel uniquement. "
            "Ne prouve pas une commande ferme, un budget encore disponible "
            "ni une demande ouverte. Vérifier l'avis original et son échéance."
        ),
    }


def fetch_notices(query: str, limit: int = 100) -> tuple[list[dict], int]:
    body = {
        "query": query,
        "fields": FIELDS,
        "limit": min(max(limit, 1), 250),
        "page": 1,
        "paginationMode": "PAGE_NUMBER",
        "checkQuerySyntax": True,
    }
    request = Request(
        API_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "DealHunter/0.1 (public TED data reuse)",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read(500).decode("utf-8", errors="replace")
        raise RuntimeError(f"TED API HTTP {exc.code}: {detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"Connexion à TED API impossible : {exc.reason}") from exc
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError("La réponse TED n'est pas un JSON valide.") from exc

    if not isinstance(payload, dict):
        raise RuntimeError("Format TED inattendu : objet JSON attendu.")
    rows = payload.get("notices")
    if not isinstance(rows, list):
        keys = ", ".join(sorted(str(key) for key in payload))
        raise RuntimeError(f"Format TED inattendu (clés reçues : {keys}).")
    total = payload.get("total", len(rows))
    try:
        total = int(total)
    except (TypeError, ValueError):
        total = len(rows)
    return rows, total


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="output/ted-buyer-opportunities.json")
    parser.add_argument("--query", default=DEFAULT_QUERY, help="Requête experte TED.")
    parser.add_argument("--limit", type=int, default=100, help="Nombre d'avis (1 à 250).")
    parser.add_argument("--input", help="Fixture JSON locale pour tester le mapping sans réseau.")
    args = parser.parse_args()

    if args.limit < 1 or args.limit > 250:
        print("--limit doit être compris entre 1 et 250.", file=sys.stderr)
        return 2

    try:
        if args.input:
            payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
            rows = payload.get("notices") if isinstance(payload, dict) else None
            if not isinstance(rows, list):
                raise RuntimeError("Le fichier de test doit contenir un tableau 'notices'.")
            total = payload.get("total", len(rows))
        else:
            rows, total = fetch_notices(args.query, args.limit)
    except (OSError, json.JSONDecodeError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        return 1

    collected_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    normalized = [
        row for item in rows if isinstance(item, dict)
        if (row := normalize_notice(item, collected_at)) is not None
    ]
    output = {
        "source": "TED — Tenders Electronic Daily",
        "source_url": "https://ted.europa.eu/",
        "api_url": API_URL,
        "query": args.query,
        "collected_at": collected_at,
        "total_matching_notices": total,
        "raw_count": len(rows),
        "count": len(normalized),
        "direction": "buyer",
        "review_status": "pending",
        "notices": normalized,
        "diagnostic": (
            "Aucun avis exploitable reconnu. Vérifier les champs renvoyés par TED."
            if rows and not normalized else None
        ),
    }
    destination = Path(args.output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(normalized)} avis TED préparés pour vérification : {destination} (total API : {total})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Validated catalogue of official and permissioned DealHunter data sources."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "data" / "sources-global.json"
ALLOWED_DIRECTIONS = {"buyer", "seller"}
ALLOWED_STATUSES = {"active", "catalogued", "blocked", "retired"}


def load_catalog(path: Path = CATALOG_PATH) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data.get("sources"), list):
        raise ValueError("Le catalogue doit contenir une liste 'sources'.")
    seen = set()
    for source in data["sources"]:
        for field in ("id", "name", "countryCoverage", "direction", "access", "integrationStatus", "endpoint", "documentation", "notes"):
            if field not in source:
                raise ValueError(f"Champ manquant {field!r} dans une source.")
        if source["id"] in seen:
            raise ValueError(f"Identifiant de source en double : {source['id']}")
        seen.add(source["id"])
        if not set(source["direction"]).issubset(ALLOWED_DIRECTIONS) or not source["direction"]:
            raise ValueError(f"Direction invalide pour {source['id']}")
        if source["integrationStatus"] not in ALLOWED_STATUSES:
            raise ValueError(f"Statut invalide pour {source['id']}")
        if not source["endpoint"].startswith("https://") or not source["documentation"].startswith("https://"):
            raise ValueError(f"URL HTTPS obligatoire pour {source['id']}")
    return data


def sources_for(direction: str, *, include_catalogued: bool = True) -> list[dict]:
    if direction not in ALLOWED_DIRECTIONS:
        raise ValueError("direction doit être 'buyer' ou 'seller'.")
    sources = load_catalog()["sources"]
    allowed_statuses = {"active", "catalogued"} if include_catalogued else {"active"}
    return [
        source for source in sources
        if direction in source["direction"] and source["integrationStatus"] in allowed_statuses
    ]


if __name__ == "__main__":
    data = load_catalog()
    for direction in sorted(ALLOWED_DIRECTIONS):
        selected = sources_for(direction)
        print(f"{direction}: {len(selected)} sources référencées")
        for source in selected:
            print(f" - {source['name']} [{source['integrationStatus']}]")

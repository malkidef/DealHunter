#!/usr/bin/env python3
"""Collecte prudente des avis de ventes/cessions du BODACC officiel."""
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timezone

BASE = "https://bodacc-datadila.opendatasoft.com/api/explore/v2.1"
DATASET = "annonces-commerciales"
OUT = "data/bodacc-business-sales.json"
SOURCE_URL = "https://www.bodacc.fr/"
API_URL = "https://bodacc-datadila.opendatasoft.com/explore/dataset/annonces-commerciales/api/"
PAGE_SIZE = 100
MAX_RECORDS = 5000
HEADERS = {"User-Agent": "DealHunter/0.1 (BODACC open-data reuse)"}


def get_json(url):
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=45) as response:
        return json.loads(response.read().decode("utf-8-sig"))


def build_api_url(limit=PAGE_SIZE, offset=0):
    params = {
        "select": "id,familleavis,familleavis_lib,ville,departement_nom_officiel,numerodepartement,dateparution,url_complete",
        "limit": str(limit),
        "offset": str(offset),
        "order_by": "dateparution desc",
        "where": "familleavis = 'vente'",
    }
    return f"{BASE}/catalog/datasets/{DATASET}/records?{urllib.parse.urlencode(params)}"


def normalize_notice(row, collected_at):
    """Keep only minimal non-personal metadata; never treat a legal notice as stock."""
    notice_id = str(row.get("id") or "").strip()
    if not notice_id or str(row.get("familleavis") or "").lower() != "vente":
        return None
    raw_url = str(row.get("url_complete") or "").strip()
    if not raw_url.startswith("https://www.bodacc.fr/"):
        raw_url = SOURCE_URL
    city = str(row.get("ville") or "").strip()
    department = str(row.get("departement_nom_officiel") or "").strip()
    department_code = str(row.get("numerodepartement") or "").strip()
    location = " · ".join(part for part in (city, department, department_code) if part)
    event_label = str(row.get("familleavis_lib") or "Ventes et cessions").strip()
    return {
        "source_listing_id": notice_id,
        "title": f"{event_label} — {city or 'lieu à vérifier'}",
        "event_type": "business_transfer",
        "location": location,
        "city": city,
        "department": department,
        "department_code": department_code,
        "published_at": str(row.get("dateparution") or "").strip(),
        "source_url": raw_url,
        "source": "BODACC / DILA",
        "review_status": "pending",
        "signal_type": "cession_entreprise_ou_fonds",
        "is_inventory": False,
        "collected_at": collected_at,
    }


def main():
    collected_at = datetime.now(timezone.utc).isoformat()
    rows, total_available, truncated = fetch_records()
    notices = []
    seen = set()
    for row in rows:
        if not isinstance(row, dict):
            continue
        notice = normalize_notice(row, collected_at)
        if not notice or notice["source_listing_id"] in seen:
            continue
        seen.add(notice["source_listing_id"])
        notices.append(notice)
    if not notices:
        raise RuntimeError("Aucun avis de vente/cession reçu; ancien flux conservé par prudence.")
    os.makedirs("data", exist_ok=True)
    output = {
        "source": "BODACC — API officielle DILA",
        "source_url": SOURCE_URL,
        "api_url": API_URL,
        "license": "Licence Ouverte / Open Licence 2.0",
        "attribution": "Données : DILA / BODACC",
        "collected_at": collected_at,
        "count": len(notices),
        "total_available": total_available,
        "truncated": truncated,
        "notice_type": "Ventes et cessions d'entreprises ou de fonds",
        "important_notice": "Ces annonces légales signalent des ventes ou cessions. Elles ne décrivent pas des stocks disponibles et ne constituent pas des offres de marchandises.",
        "notices": notices,
    }
    temp = OUT + ".tmp"
    with open(temp, "w", encoding="utf-8") as handle:
        json.dump(output, handle, ensure_ascii=False, indent=2)
    os.replace(temp, OUT)
    print(f"BODACC: {len(notices)} avis de vente/cession récupérés (signaux à vérifier, pas des stocks).")


if __name__ == "__main__":
    main()

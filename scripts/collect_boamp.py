#!/usr/bin/env python3
"""Collecte prudente des avis BOAMP via l'API open data officielle de la DILA."""
import gzip
import json
import os
import re
import urllib.request
from datetime import datetime, timezone

BASE = "https://boamp-datadila.opendatasoft.com/api/explore/v2.1"
DATASET = "boamp"
OUT = "data/boamp-buyer-opportunities.json"
HEADERS = {"User-Agent": "DealHunter/0.1 (open-data reuse; contact: project maintainer)"}

def get_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=40) as response:
        raw = response.read()
        # Certains serveurs renvoient du gzip même sans négociation explicite.
        if raw.startswith(b"\\x1f\\x8b"):
            raw = gzip.decompress(raw)
        return json.loads(raw.decode("utf-8-sig"))

def field_name(fields, patterns):
    for field in fields:
        name = field.get("name", "")
        low = name.lower()
        if any(re.search(pattern, low) for pattern in patterns):
            return name
    return None

def first(record, names):
    for name in names:
        value = record.get(name)
        if value not in (None, ""):
            return value
    return ""

def main():
    metadata = get_json(f"{BASE}/catalog/datasets/{DATASET}")
    fields = metadata.get("fields", [])
    names = [f.get("name", "") for f in fields]
    title_field = field_name(fields, [r"^objet$", r"^objet_marche$", r"^intitule$", r"^titre$"])
    date_field = field_name(fields, [r"^dateparution$", r"date.*publication", r"^date_publication$"])
    if not title_field:
        raise RuntimeError("Champ titre BOAMP introuvable dans le schéma officiel; collecte arrêtée sans écraser le flux.")
    order = f"&order_by={date_field}%20desc" if date_field else ""
    url = f"{BASE}/catalog/datasets/{DATASET}/records?limit=100{order}"
    payload = get_json(url)
    records = payload.get("results", [])
    notices = []
    for row in records:
        title = first(row, [title_field, "objet", "intitule", "titre"])
        if not title:
            continue
        notice_id = first(row, ["id", "idweb", "numero_avis", "reference"])
        buyer = first(row, ["nomacheteur", "acheteur", "organisme", "nom_acheteur", "denomination"])
        place = first(row, ["ville", "lieu_execution", "lieuexecution", "code_departement"])
        deadline = first(row, ["datelimitereponse", "date_limite_reponse", "date_limite", "datelimitereceptionoffres"])
        url_notice = first(row, ["url", "url_avis", "urlavis", "lien"])
        notices.append({
            "id": str(notice_id or ""),
            "title": str(title),
            "buyer": str(buyer or ""),
            "place": str(place or ""),
            "deadline": str(deadline or ""),
            "url": str(url_notice or "https://www.boamp.fr/"),
            "source": "BOAMP / DILA",
            "verified": False
        })
    os.makedirs("data", exist_ok=True)
    output = {
        "source": "BOAMP — API open data DILA",
        "source_url": "https://boamp-datadila.opendatasoft.com/explore/dataset/boamp/api/",
        "license": "Licence Ouverte / Open Licence",
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "count": len(notices),
        "notices": notices
    }
    temp = OUT + ".tmp"
    with open(temp, "w", encoding="utf-8") as handle:
        json.dump(output, handle, ensure_ascii=False, indent=2)
    os.replace(temp, OUT)
    print(f"BOAMP: {len(notices)} avis récupérés (non qualifiés, à vérifier).")

if __name__ == "__main__":
    main()

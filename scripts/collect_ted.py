#!/usr/bin/env python3
"""Collecte des avis de marchés publics européens depuis l'API officielle TED."""
import json
import os
import time
import urllib.request
from datetime import datetime, timedelta, timezone

API = "https://api.ted.europa.eu/v3/notices/search"
OUT = "data/ted-buyer-opportunities.json"
FIELDS = [
    "publication-number", "publication-date", "notice-title", "buyer-name",
    "buyer-country", "classification-cpv", "deadline-receipt-tender-date-lot",
    "notice-type", "links"
]

def text_value(value, languages=("fra", "eng")):
    if isinstance(value, dict):
        for lang in languages:
            if value.get(lang):
                value = value[lang]
                break
        else:
            value = next(iter(value.values()), "")
    if isinstance(value, list):
        return "; ".join(str(x) for x in value if x not in (None, ""))
    return str(value or "")

def list_value(value):
    if value is None:
        return []
    if isinstance(value, list):
        return [str(x) for x in value if x not in (None, "")]
    return [str(value)]

def main():
    since = (datetime.now(timezone.utc) - timedelta(days=45)).strftime("%Y%m%d")
    query = f"publication-date>={since} SORT BY publication-date DESC"
    body = {
        "query": query,
        "fields": FIELDS,
        "page": 1,
        "limit": 100,
        "scope": "ALL",
        "paginationMode": "PAGE_NUMBER"
    }
    request = urllib.request.Request(
        API,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json",
                 "User-Agent": "DealHunter/0.1 (TED public notice reuse)"},
        method="POST"
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if payload.get("timedOut"):
        raise RuntimeError("TED a signalé un délai dépassé; flux précédent conservé.")
    notices = []
    for row in payload.get("notices", []):
        number = text_value(row.get("publication-number"))
        title = text_value(row.get("notice-title"))
        if not number or not title:
            continue
        links = row.get("links") or {}
        html_links = links.get("html") or {}
        url = ""
        if isinstance(html_links, dict):
            url = html_links.get("fra") or html_links.get("eng") or next(iter(html_links.values()), "")
        if not url:
            url = f"https://ted.europa.eu/en/notice/-/detail/{number}"
        notices.append({
            "id": number,
            "title": title,
            "buyer": text_value(row.get("buyer-name")),
            "country": ", ".join(list_value(row.get("buyer-country"))),
            "cpv": list_value(row.get("classification-cpv")),
            "deadline": text_value(row.get("deadline-receipt-tender-date-lot")),
            "publicationDate": text_value(row.get("publication-date")),
            "noticeType": text_value(row.get("notice-type")),
            "url": url,
            "source": "TED / Publications Office of the European Union",
            "verified": False
        })
    output = {
        "source": "TED — API officielle de recherche",
        "source_url": "https://docs.ted.europa.eu/api/latest/search.html",
        "license": "Réutilisation des avis publiés selon les conditions TED applicables",
        "query": query,
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "count": len(notices),
        "total_available": payload.get("totalNoticeCount"),
        "notices": notices
    }
    os.makedirs("data", exist_ok=True)
    temp = OUT + ".tmp"
    with open(temp, "w", encoding="utf-8") as handle:
        json.dump(output, handle, ensure_ascii=False, indent=2)
    os.replace(temp, OUT)
    print(f"TED: {len(notices)} avis récupérés sur les 45 derniers jours (première page, non qualifiés). Total API: {payload.get('totalNoticeCount')}.")

if __name__ == "__main__":
    main()

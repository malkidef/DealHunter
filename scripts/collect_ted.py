#!/usr/bin/env python3
"""Collecte paginée des avis de marchés publics européens depuis l'API TED."""
import json
import os
import urllib.request
from datetime import datetime, timedelta, timezone

API = "https://api.ted.europa.eu/v3/notices/search"
OUT = "data/ted-buyer-opportunities.json"
PAGE_SIZE = 250
MAX_RECORDS = 5000
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


def fetch_page(query, page, limit=PAGE_SIZE):
    body = {
        "query": query,
        "fields": FIELDS,
        "page": page,
        "limit": min(max(int(limit), 1), PAGE_SIZE),
        "scope": "ALL",
        "paginationMode": "PAGE_NUMBER"
    }
    request = urllib.request.Request(
        API,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json",
                 "User-Agent": "DealHunter/0.2 (TED public notice reuse)"},
        method="POST"
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, dict) or payload.get("timedOut"):
        raise RuntimeError("TED a signalé un délai dépassé ou une réponse invalide; flux précédent conservé.")
    rows = payload.get("notices")
    if not isinstance(rows, list):
        raise RuntimeError("Réponse TED invalide : liste notices absente; flux précédent conservé.")
    total = payload.get("totalNoticeCount", payload.get("total", 0))
    try:
        total = max(0, int(total or 0))
    except (TypeError, ValueError):
        total = 0
    return rows, total


def normalize_notice(row):
    if not isinstance(row, dict):
        return None
    number = text_value(row.get("publication-number"))
    title = text_value(row.get("notice-title"))
    if not number or not title:
        return None
    links = row.get("links") or {}
    html_links = links.get("html") or {} if isinstance(links, dict) else {}
    url = ""
    if isinstance(html_links, dict):
        url = html_links.get("fra") or html_links.get("eng") or next(iter(html_links.values()), "")
    if not url:
        url = f"https://ted.europa.eu/en/notice/-/detail/{number}"
    return {
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
    }


def collect_notices(query, max_records=MAX_RECORDS):
    """Fetch bounded PAGE_NUMBER pages, deduplicate, and expose truncation."""
    cap = min(max(int(max_records), 1), MAX_RECORDS)
    notices, seen = [], set()
    total_available = 0
    page = 1
    while len(notices) < cap:
        rows, total = fetch_page(query, page, PAGE_SIZE)
        total_available = max(total_available, total)
        if not rows:
            break
        for raw in rows:
            notice = normalize_notice(raw)
            if notice and notice["id"] not in seen:
                seen.add(notice["id"])
                notices.append(notice)
                if len(notices) >= cap:
                    break
        if len(notices) >= cap or len(rows) < PAGE_SIZE:
            break
        if total_available and page * PAGE_SIZE >= total_available:
            break
        page += 1
    return notices, total_available, (total_available > len(notices) and len(notices) >= cap)


def main():
    since = (datetime.now(timezone.utc) - timedelta(days=45)).strftime("%Y%m%d")
    query = f"publication-date>={since} SORT BY publication-date DESC"
    notices, total_available, truncated = collect_notices(query)
    if not notices:
        raise RuntimeError("TED n'a retourné aucun avis exploitable; flux précédent conservé.")
    output = {
        "source": "TED — API officielle de recherche",
        "source_url": "https://docs.ted.europa.eu/api/latest/search.html",
        "license": "Réutilisation des avis publiés selon les conditions TED applicables",
        "query": query,
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "count": len(notices),
        "total_available": total_available,
        "truncated": truncated,
        "notices": notices
    }
    os.makedirs("data", exist_ok=True)
    temp = OUT + ".tmp"
    with open(temp, "w", encoding="utf-8") as handle:
        json.dump(output, handle, ensure_ascii=False, indent=2)
    os.replace(temp, OUT)
    print(f"TED: {len(notices)} avis récupérés sur les 45 derniers jours. Total API: {total_available}; flux tronqué: {truncated}.")


if __name__ == "__main__":
    main()

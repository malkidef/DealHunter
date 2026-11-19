#!/usr/bin/env python3
"""Collecte les avis de marchés publics européens depuis l'API officielle TED."""
import argparse
import json
import os
import urllib.request
from urllib.parse import quote, urlsplit
from datetime import datetime, timedelta, timezone

API = "https://api.ted.europa.eu/v3/notices/search"
DEFAULT_OUT = "data/ted-buyer-opportunities.json"
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


def build_query(days=45, now=None):
    if days < 1:
        raise ValueError("La période doit être d'au moins un jour.")
    now = now or datetime.now(timezone.utc)
    since = (now - timedelta(days=days)).strftime("%Y%m%d")
    return f"publication-date>={since} SORT BY publication-date DESC"


def parse_payload(payload, query, collected_at=None):
    if not isinstance(payload, dict):
        raise ValueError("Réponse TED invalide : objet JSON attendu.")
    if payload.get("timedOut"):
        raise RuntimeError("TED a signalé un délai dépassé ; flux précédent conservé.")
    rows = payload.get("notices")
    if not isinstance(rows, list):
        raise ValueError("Réponse TED invalide : liste notices absente.")
    notices = []
    seen = set()
    for row in rows:
        if not isinstance(row, dict):
            continue
        number = text_value(row.get("publication-number"))
        title = text_value(row.get("notice-title"))
        if not number or not title or number in seen:
            continue
        seen.add(number)
        links = row.get("links") or {}
        html_links = links.get("html") or {} if isinstance(links, dict) else {}
        url = ""
        if isinstance(html_links, dict):
            url = html_links.get("fra") or html_links.get("eng") or next(iter(html_links.values()), "")
        parsed_url = urlsplit(str(url))
        host = (parsed_url.hostname or "").lower()
        if parsed_url.scheme != "https" or not (host == "ted.europa.eu" or host.endswith(".ted.europa.eu")):
            url = f"https://ted.europa.eu/en/notice/-/detail/{quote(number, safe='')}"
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
    if rows and not notices:
        raise ValueError("TED a renvoyé des avis, mais aucun avis exploitable : flux précédent conservé.")
    return {
        "source": "TED — API officielle de recherche",
        "source_url": "https://docs.ted.europa.eu/api/latest/search.html",
        "license": "Réutilisation des avis publiés selon les conditions TED applicables",
        "query": query,
        "collected_at": collected_at or datetime.now(timezone.utc).isoformat(),
        "count": len(notices),
        "total_available": payload.get("totalNoticeCount"),
        "notices": notices
    }


def fetch_feed(days=45, limit=100, opener=urllib.request.urlopen, now=None):
    if limit < 1 or limit > 250:
        raise ValueError("La limite TED doit être comprise entre 1 et 250.")
    query = build_query(days, now)
    body = {
        "query": query,
        "fields": FIELDS,
        "page": 1,
        "limit": limit,
        "scope": "ALL",
        "paginationMode": "PAGE_NUMBER"
    }
    request = urllib.request.Request(
        API,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "DealHunter/0.1 (TED public notice reuse)"
        },
        method="POST"
    )
    with opener(request, timeout=90) as response:
        payload = json.loads(response.read().decode("utf-8"))
    return parse_payload(payload, query)


def write_feed(feed, output_path=DEFAULT_OUT):
    directory = os.path.dirname(output_path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    temp = output_path + ".tmp"
    try:
        with open(temp, "w", encoding="utf-8") as handle:
            json.dump(feed, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temp, output_path)
    finally:
        if os.path.exists(temp):
            os.remove(temp)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=45)
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--output", default=DEFAULT_OUT)
    args = parser.parse_args()
    feed = fetch_feed(days=args.days, limit=args.limit)
    write_feed(feed, args.output)
    print(
        f"TED : {feed['count']} avis récupérés sur {args.days} jours "
        f"(première page, non qualifiés). Total API : {feed['total_available']}."
    )


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Collecte les ventes de biens excédentaires publiées sur SAM.gov (ptype=g)."""
from __future__ import annotations

import argparse
import json
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import Request, urlopen

API = "https://api.sam.gov/opportunities/v2/search"
SOURCE = "SAM.gov — Get Opportunities API"
DEFAULT_OUTPUT = "data/sam-buyer-opportunities.json"


def get_field(obj, *names, default=None):
    if not isinstance(obj, dict):
        return default
    wanted = {name.casefold() for name in names}
    for key, value in obj.items():
        if str(key).casefold() in wanted:
            return value
    return default


def date_range(days=45, today=None):
    if not 1 <= days <= 365:
        raise ValueError("La période SAM.gov doit être comprise entre 1 et 365 jours.")
    today = today or date.today()
    return (today - timedelta(days=days - 1)).strftime("%m/%d/%Y"), today.strftime("%m/%d/%Y")


def normalize_notice(row):
    if not isinstance(row, dict):
        return None
    notice_id = str(get_field(row, "noticeId", default="") or "").strip()
    title = str(get_field(row, "title", default="") or "").strip()
    if not notice_id or not title:
        return None
    data = get_field(row, "data", default={}) or {}
    performance = get_field(data, "placeOfPerformance", default={}) or {}
    country = get_field(performance, "country", default={}) or {}
    city = get_field(performance, "city", "cityName", default=None)
    state = get_field(performance, "state", "stateCode", default=None)
    country_name = get_field(country, "name", default=None)
    country_code = get_field(country, "code", default=None)
    place = {
        "city": city,
        "state": state,
        "country": country_name or country_code,
        "zip": get_field(performance, "zip", default=None),
    }
    place = {key: value for key, value in place.items() if value not in (None, "")}
    official_url = str(get_field(row, "uiLink", default="") or "").strip()
    parsed_url = urlsplit(official_url)
    host = (parsed_url.hostname or "").lower()
    if parsed_url.scheme != "https" or not (host == "sam.gov" or host.endswith(".sam.gov")):
        official_url = f"https://sam.gov/opp/{quote(notice_id, safe='')}/view"
    return {
        "notice_id": notice_id,
        "title": title,
        "buyer_organization": get_field(row, "fullParentPathName", "department", default="") or "",
        "buyer_office": get_field(row, "office", default="") or "",
        "solicitation_number": get_field(row, "solicitationNumber", default="") or "",
        "notice_type": get_field(row, "type", "baseType", default="") or "",
        "posted_date": get_field(row, "postedDate", default="") or "",
        "deadline_date": get_field(row, "reponseDeadLine", "responseDeadLine", default="") or "",
        "naics_code": get_field(row, "naicsCode", default="") or "",
        "classification_code": get_field(row, "classificationCode", default="") or "",
        "place_of_performance": place,
        "source_url": official_url,
        "source": SOURCE,
        "verified": False,
    }


def fetch_page(api_key, posted_from, posted_to, offset=0, limit=1000, opener=urlopen):
    params = {
        "api_key": api_key,
        "postedFrom": posted_from,
        "postedTo": posted_to,
        "ptype": "g",
        "limit": limit,
        "offset": offset,
    }
    request = Request(
        f"{API}?{urlencode(params)}",
        headers={"Accept": "application/json", "User-Agent": "DealHunter/0.1 (SAM.gov public opportunities)"},
    )
    try:
        with opener(request, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raise RuntimeError(f"SAM.gov API HTTP {exc.code}") from exc
    except URLError as exc:
        raise RuntimeError(f"Connexion à SAM.gov impossible : {exc.reason}") from exc
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError("La réponse SAM.gov n'est pas un JSON valide.") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("opportunitiesData"), list):
        raise RuntimeError("Réponse SAM.gov invalide : opportunitiesData absente.")
    return payload


def collect(api_key, days=45, limit=1000, max_pages=5, today=None, opener=urlopen):
    if not api_key or not api_key.strip():
        raise ValueError("Secret SAM_GOV_API_KEY absent.")
    if not 1 <= limit <= 1000:
        raise ValueError("La limite par page doit être comprise entre 1 et 1000.")
    if not 1 <= max_pages <= 20:
        raise ValueError("Le nombre de pages doit être compris entre 1 et 20.")
    posted_from, posted_to = date_range(days, today)
    notices, seen = [], set()
    total = None
    pages_fetched = 0
    for page in range(max_pages):
        payload = fetch_page(api_key.strip(), posted_from, posted_to, page * limit, limit, opener)
        pages_fetched += 1
        if total is None:
            raw_total = payload.get("totalRecords")
            try:
                parsed_total = int(raw_total) if raw_total not in (None, "") else None
                total = parsed_total if parsed_total is not None and parsed_total >= 0 else None
            except (TypeError, ValueError):
                total = None
        rows = payload["opportunitiesData"]
        for row in rows:
            notice = normalize_notice(row)
            if notice and notice["notice_id"] not in seen:
                seen.add(notice["notice_id"])
                notices.append(notice)
        if not rows or len(rows) < limit or (total is not None and len(notices) >= total):
            break
    return {
        "source": SOURCE,
        "source_url": "https://open.gsa.gov/api/get-opportunities-public-api/",
        "notice_type_filter": "g — Sale of Surplus Property",
        "posted_from": posted_from,
        "posted_to": posted_to,
        "collected_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "count": len(notices),
        "total_matching_notices": total,
        "pages_collected": pages_fetched,
        "review_status": "pending",
        "notices": notices,
    }


def write_feed(feed, output=DEFAULT_OUTPUT):
    path = Path(output)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    try:
        temp.write_text(json.dumps(feed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(temp, path)
    finally:
        if temp.exists():
            temp.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=45)
    parser.add_argument("--limit", type=int, default=1000)
    parser.add_argument("--max-pages", type=int, default=5)
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    api_key = os.environ.get("SAM_GOV_API_KEY", "").strip()
    feed = collect(api_key, args.days, args.limit, args.max_pages)
    write_feed(feed, args.output)
    print(f"SAM.gov : {feed['count']} avis de ventes de surplus récupérés (non qualifiés). Total API : {feed['total_matching_notices']}.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Collect US federal procurement notices from the official SAM.gov API."""
from __future__ import annotations
import argparse, json, os, sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

API_URL = "https://api.sam.gov/opportunities/v2/search"
DEFAULT_TYPES = "o,k,p,r,s"

def normalize_opportunity(item: dict, collected_at: str) -> dict | None:
    notice_id = str(item.get("noticeId") or "").strip()
    title = str(item.get("title") or "").strip()
    if not notice_id and not title:
        return None
    place = item.get("placeOfPerformance") or {}
    city, state, country = place.get("city") or {}, place.get("state") or {}, place.get("country") or {}
    def part(value, *keys):
        if isinstance(value, dict):
            return next((value.get(k) for k in keys if value.get(k)), None)
        return value or None
    return {
        "source_id": "sam_gov", "source_notice_id": notice_id or None,
        "title": title or "Avis SAM.gov sans titre",
        "solicitation_number": str(item.get("solicitationNumber") or "").strip() or None,
        "buyer_organization": str(item.get("fullParentPathName") or item.get("department") or "").strip() or None,
        "buyer_office": str(item.get("office") or "").strip() or None,
        "posted_date": item.get("postedDate"),
        "deadline_date": item.get("responseDeadLine") or item.get("reponseDeadLine"),
        "notice_type": item.get("type") or item.get("baseType"),
        "naics_code": item.get("naicsCode"), "classification_code": item.get("classificationCode"),
        "place_of_performance": {"city": part(city, "name"), "state": part(state, "name", "code"), "country": part(country, "name", "code")},
        "source_url": str(item.get("uiLink") or "").strip() or None,
        "direction": "buyer", "opportunity_type": "public_procurement_notice",
        "demand_status": "unverified", "review_status": "pending",
        "collected_at": collected_at,
        "notes": "Avis fédéral américain : signal de besoin potentiel uniquement, pas une commande ferme. Vérifier statut et échéance sur SAM.gov. Les coordonnées personnelles ne sont pas collectées."
    }

def fetch_opportunities(api_key: str, posted_from: str, posted_to: str, limit: int = 1000,
                        max_records: int = 5000, procurement_types: str = DEFAULT_TYPES):
    if not api_key.strip():
        raise RuntimeError("Secret SAM_API_KEY absent.")
    page_size = min(max(limit, 1), 1000)
    collected, total = [], 0
    while len(collected) < max_records:
        params = {"api_key": api_key.strip(), "postedFrom": posted_from, "postedTo": posted_to,
                  "ptype": procurement_types, "limit": page_size, "offset": len(collected)}
        request = Request(f"{API_URL}?{urlencode(params)}", headers={"Accept":"application/json","User-Agent":"DealHunter/0.1"})
        try:
            with urlopen(request, timeout=60) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            detail = exc.read(500).decode("utf-8", errors="replace")
            raise RuntimeError(f"SAM.gov API HTTP {exc.code}: {detail}") from exc
        except URLError as exc:
            raise RuntimeError(f"Connexion à SAM.gov impossible : {exc.reason}") from exc
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise RuntimeError("La réponse SAM.gov n'est pas un JSON valide.") from exc
        if not isinstance(payload, dict) or not isinstance(payload.get("opportunitiesData"), list):
            raise RuntimeError("Format SAM.gov inattendu : tableau opportunitiesData absent.")
        page = payload["opportunitiesData"]
        try: total = int(payload.get("totalRecords", total))
        except (TypeError, ValueError): pass
        collected.extend(page)
        if not page or len(collected) >= total or len(page) < page_size:
            break
    return collected[:max_records], total

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="output/sam-buyer-opportunities.json")
    parser.add_argument("--posted-from", default=(date.today()-timedelta(days=30)).strftime("%m/%d/%Y"))
    parser.add_argument("--posted-to", default=date.today().strftime("%m/%d/%Y"))
    parser.add_argument("--limit", type=int, default=1000)
    parser.add_argument("--max-records", type=int, default=5000)
    parser.add_argument("--types", default=DEFAULT_TYPES)
    parser.add_argument("--input", help="Fixture JSON locale pour tester le mapping.")
    args = parser.parse_args()
    if not 1 <= args.limit <= 1000 or args.max_records < 1:
        print("Limites invalides.", file=sys.stderr); return 2
    try:
        start, end = datetime.strptime(args.posted_from,"%m/%d/%Y").date(), datetime.strptime(args.posted_to,"%m/%d/%Y").date()
        if end < start or (end-start).days > 365: raise ValueError("La période doit être chronologique et ne pas dépasser un an.")
        if args.input:
            payload=json.loads(Path(args.input).read_text(encoding="utf-8"))
            rows=payload.get("opportunitiesData") if isinstance(payload,dict) else None
            if not isinstance(rows,list): raise RuntimeError("Le fichier de test doit contenir opportunitiesData.")
            total=payload.get("totalRecords",len(rows))
        else:
            rows,total=fetch_opportunities(os.environ.get("SAM_API_KEY",""),args.posted_from,args.posted_to,args.limit,args.max_records,args.types)
    except (OSError,json.JSONDecodeError,ValueError,RuntimeError) as exc:
        print(str(exc),file=sys.stderr); return 1
    stamp=datetime.now(timezone.utc).isoformat(timespec="seconds")
    notices=[n for item in rows if isinstance(item,dict) if (n:=normalize_opportunity(item,stamp))]
    result={"source":"SAM.gov — Get Opportunities API","source_url":"https://sam.gov/","api_url":API_URL,
            "posted_from":args.posted_from,"posted_to":args.posted_to,"procurement_types":args.types,
            "collected_at":stamp,"total_matching_notices":total,"raw_count":len(rows),"count":len(notices),
            "direction":"buyer","review_status":"pending","notices":notices,
            "diagnostic":"Aucun avis exploitable reconnu." if rows and not notices else None}
    dest=Path(args.output); dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"{len(notices)} avis SAM.gov préparés pour vérification (total API : {total})")
    return 0

if __name__=="__main__": raise SystemExit(main())

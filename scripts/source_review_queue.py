#!/usr/bin/env python3
"""Build a review-only queue from public source feeds.

This script deliberately does not write to Firestore, publicOffers or publicNeeds.
Every imported record remains pending human review; source notices are not orders
and auction listings are not confirmed inventory.
"""
from __future__ import annotations

import argparse
import json
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUTS = {
    "boamp": ROOT / "data/boamp-buyer-opportunities.json",
    "ted": ROOT / "data/ted-buyer-opportunities.json",
    "sam": ROOT / "data/sam-buyer-opportunities.json",
    "gsa": ROOT / "data/gsa-auctions.json",
    "bodacc": ROOT / "data/bodacc-business-sales.json",
}


def read_json(path: Path) -> Any:
    if not path.exists() or path.stat().st_size == 0:
        return None
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def parse_date(value: Any) -> date | None:
    if not value:
        return None
    text = str(value).strip().split(";")[0].strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return date.fromisoformat(text[:10])
        except ValueError:
            return None


def source_rows(payload: Any, *keys: str) -> list[dict]:
    if not isinstance(payload, dict):
        return []
    for key in keys:
        rows = payload.get(key)
        if isinstance(rows, list):
            return [row for row in rows if isinstance(row, dict)]
    return []


def review_record(source: str, source_id: str, title: str, direction: str,
                  url: str | None, category: str | None, deadline: Any,
                  notes: str, source_record: dict) -> dict:
    return {
        "id": f"{source}:{source_id}",
        "source_id": source,
        "source_record_id": str(source_id),
        "title": title.strip(),
        "direction": direction,
        "category": category,
        "deadline": str(deadline or "").strip() or None,
        "source_url": url if isinstance(url, str) and url.startswith("https://") else None,
        "review_status": "pending",
        "promotion_status": "not_promoted",
        "verified": False,
        "quantity": None,
        "unit_price": None,
        "currency": None,
        "notes": notes,
    }


def build_queue(inputs: dict[str, Path], today: date | None = None) -> dict:
    today = today or datetime.now(timezone.utc).date()
    queue: list[dict] = []
    excluded: list[dict] = []
    source_status: dict[str, dict] = {}
    seen: set[str] = set()

    def add(record: dict) -> None:
        if record["id"] in seen:
            return
        seen.add(record["id"])
        queue.append(record)

    # BOAMP: only product/supply notices with a future response deadline.
    payload = read_json(inputs["boamp"])
    rows = source_rows(payload, "notices")
    eligible = 0
    for row in rows:
        deadline = parse_date(row.get("deadline"))
        if row.get("kind") != "produits" or deadline is None or deadline < today:
            continue
        eligible += 1
        add(review_record(
            "boamp", row.get("id") or row.get("url") or row.get("title", "unknown"),
            str(row.get("title") or "Avis BOAMP sans titre"), "buyer",
            row.get("url"), row.get("category"), row.get("deadline"),
            "Avis de fourniture potentiel. Vérifier l'avis, le lot, les quantités et l'échéance ; aucune commande ferme n'est établie.",
            row,
        ))
    source_status["boamp"] = {"records_read": len(rows), "review_candidates": eligible,
                              "input_status": "empty" if payload is None else "loaded"}

    # TED: restrict to contract-notice families, not award or modification notices.
    payload = read_json(inputs["ted"])
    rows = source_rows(payload, "notices")
    eligible = 0
    for row in rows:
        # TED's contract-award notices (CAN), prior-information notices and
        # modification notices are not open calls for tenders. Require a
        # recognized contract-notice family; unknown/missing types are rejected.
        notice_type = str(row.get("noticeType") or row.get("notice_type") or "").strip().lower()
        if not notice_type.startswith("cn-"):
            continue

        pub_date = parse_date(row.get("publicationDate") or row.get("publication_date"))
        if pub_date is None or pub_date > today:
            continue

        # TED may return one deadline per lot, separated by semicolons.
        # Keep the notice only if at least one lot has a parseable, non-expired
        # deadline. Missing or wholly unparseable deadlines are not actionable.
        deadline_value = row.get("deadline") or row.get("deadline_date")
        deadline_dates = [
            parsed for part in str(deadline_value or "").split(";")
            if (parsed := parse_date(part)) is not None
        ]
        if not any(deadline >= today for deadline in deadline_dates):
            continue

        eligible += 1
        source_id = row.get("id") or row.get("publication_number") or row.get("title", "unknown")
        add(review_record(
            "ted_eu", source_id, str(row.get("title") or "Avis TED sans titre"), "buyer",
            row.get("url") or row.get("source_url"), None, deadline_value,
            "Avis de marché public non vérifié. Confirmer le type d'avis, la date limite, les lots et le besoin réel avant toute mise en relation.",
            row,
        ))
    source_status["ted_eu"] = {"records_read": len(rows), "review_candidates": eligible,
                               "input_status": "empty" if payload is None else "loaded"}

    # SAM.gov: the current empty file is explicitly reported, never treated as success.
    payload = read_json(inputs["sam"])
    rows = source_rows(payload, "opportunities", "notices", "results")
    eligible = 0
    for row in rows:
        if str(row.get("direction") or "buyer").lower() != "buyer":
            continue
        eligible += 1
        source_id = row.get("source_notice_id") or row.get("noticeId") or row.get("id") or row.get("title", "unknown")
        add(review_record(
            "sam_gov", source_id, str(row.get("title") or "Avis SAM.gov sans titre"), "buyer",
            row.get("source_url") or row.get("uiLink"), None, row.get("deadline_date") or row.get("responseDeadLine"),
            "Signal d'achat public américain non confirmé. Vérifier le statut et les conditions sur SAM.gov.",
            row,
        ))
    source_status["sam_gov"] = {"records_read": len(rows), "review_candidates": eligible,
                                "input_status": "empty" if payload is None else "loaded"}

    # GSA Auctions: auction lots are seller-side signals, never confirmed inventory.
    payload = read_json(inputs["gsa"])
    rows = source_rows(payload, "listings")
    eligible = 0
    for row in rows:
        status = str(row.get("auction_status") or "").lower()
        if status in {"closed", "cancelled", "canceled", "withdrawn"}:
            continue
        eligible += 1
        source_id = row.get("source_listing_id") or row.get("id") or row.get("title", "unknown")
        add(review_record(
            "gsa_auctions", source_id, str(row.get("title") or "Lot GSA sans titre"), "seller",
            row.get("source_url"), row.get("category"), row.get("auction_end_date"),
            "Lot proposé aux enchères : disponibilité, état, réserve, enchère et conditions à vérifier. Ce n'est pas un stock vendeur confirmé.",
            row,
        ))
    source_status["gsa_auctions"] = {"records_read": len(rows), "review_candidates": eligible,
                                    "input_status": "empty" if payload is None else "loaded"}

    # BODACC notices are business-transfer signals, not products or stock.
    payload = read_json(inputs["bodacc"])
    rows = source_rows(payload, "notices")
    for row in rows:
        excluded.append({
            "source_id": "bodacc",
            "source_record_id": str(row.get("source_listing_id") or row.get("id") or ""),
            "title": str(row.get("title") or "Signal BODACC"),
            "reason": "Cession d'entreprise ou de fonds : exclu des catalogues produits et du matching de stocks.",
            "source_url": row.get("source_url"),
        })
    source_status["bodacc"] = {"records_read": len(rows), "review_candidates": 0,
                               "input_status": "empty" if payload is None else "loaded"}

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "review_only_no_firestore_writes",
        "policy": "Aucun élément n'est publié dans publicOffers/publicNeeds. Validation humaine obligatoire.",
        "count": len(queue),
        "excluded_count": len(excluded),
        "source_status": source_status,
        "review_queue": queue,
        "excluded_signals": excluded,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "data/source-review-queue.json")
    args = parser.parse_args()
    result = build_queue(DEFAULT_INPUTS)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temp = args.output.with_suffix(args.output.suffix + ".tmp")
    temp.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(args.output)
    print(f"File de revue générée : {result['count']} signaux en attente ; "
          f"{result['excluded_count']} signaux exclus du matching.")
    for source, status in result["source_status"].items():
        print(f"{source}: {status['input_status']}, {status['records_read']} lus, "
              f"{status['review_candidates']} candidats")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

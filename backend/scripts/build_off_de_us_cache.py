#!/usr/bin/env python3
"""
Stream Open Food Facts dump and build a reduced DE/US cache:
- barcode
- name
- brand
- country

Output: SQLite DB with unique barcode entries.
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import sqlite3
import sys
import time
import urllib.request


OFF_DUMP_URL = "https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz"
DE_TAGS = {"en:germany", "de:deutschland"}
US_TAGS = {"en:united-states", "en:usa", "en:united-states-of-america"}


def resolve_country(tags: list[str]) -> str | None:
    tag_set = {str(tag).strip().lower() for tag in tags if tag}
    if tag_set & DE_TAGS:
        return "de"
    if tag_set & US_TAGS:
        return "us"
    return None


def choose_name(product: dict) -> str:
    # Strict requirement from user: only keep rows that have product_name set.
    return str(product.get("product_name") or "").strip()


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS off_name_cache (
          barcode TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          brand TEXT,
          country TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_off_name_cache_country
        ON off_name_cache(country)
        """
    )
    conn.commit()


def upsert_rows(conn: sqlite3.Connection, rows: list[tuple[str, str, str, str, str]]) -> None:
    if not rows:
        return
    conn.executemany(
        """
        INSERT INTO off_name_cache (barcode, name, brand, country, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(barcode) DO UPDATE SET
          name = excluded.name,
          brand = excluded.brand,
          country = excluded.country,
          updated_at = excluded.updated_at
        """,
        rows,
    )
    conn.commit()


def main() -> int:
    parser = argparse.ArgumentParser(description="Build reduced OFF DE/US name+barcode cache")
    parser.add_argument("--url", default=OFF_DUMP_URL, help="OFF dump url (.jsonl.gz)")
    parser.add_argument(
        "--out",
        default=os.path.join("backend", "data", "off_name_cache_de_us.sqlite"),
        help="Output sqlite path",
    )
    parser.add_argument("--batch-size", type=int, default=2000, help="SQLite upsert batch size")
    parser.add_argument("--progress-every", type=int, default=200000, help="Log every N input rows")
    args = parser.parse_args()

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    conn = sqlite3.connect(args.out)
    ensure_schema(conn)

    print(f"[OFF] Source: {args.url}")
    print(f"[OFF] Target: {args.out}")
    started = time.time()
    scanned = 0
    kept = 0
    batch: list[tuple[str, str, str, str, str]] = []
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    req = urllib.request.Request(args.url, headers={"User-Agent": "FitTrackPro/1.0 (cache-builder)"})
    with urllib.request.urlopen(req, timeout=60) as response:
        with gzip.GzipFile(fileobj=response) as gz:
            for raw_line in gz:
                scanned += 1
                if not raw_line:
                    continue

                try:
                    product = json.loads(raw_line)
                except json.JSONDecodeError:
                    continue

                barcode = str(product.get("code") or "").strip()
                if not barcode:
                    continue

                countries = product.get("countries_tags") or []
                if isinstance(countries, str):
                    countries = [countries]
                country = resolve_country(countries)
                if not country:
                    continue

                name = choose_name(product)
                if not name:
                    continue

                brand = str(product.get("brands") or "").strip()
                if not brand:
                    continue
                batch.append((barcode, name, brand, country, now_iso))
                kept += 1

                if len(batch) >= args.batch_size:
                    upsert_rows(conn, batch)
                    batch.clear()

                if scanned % args.progress_every == 0:
                    elapsed = max(1.0, time.time() - started)
                    print(
                        f"[OFF] scanned={scanned:,} kept={kept:,} "
                        f"rate={scanned/elapsed:,.0f} lines/s elapsed={elapsed/60:.1f}m"
                    )

    if batch:
        upsert_rows(conn, batch)

    total_rows = conn.execute("SELECT COUNT(*) FROM off_name_cache").fetchone()[0]
    conn.close()

    elapsed = time.time() - started
    print(f"[OFF] Done. scanned={scanned:,} kept={kept:,} unique={total_rows:,} elapsed={elapsed/60:.1f}m")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\n[OFF] Interrupted.")
        raise SystemExit(130)

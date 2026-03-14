#!/usr/bin/env python3
"""
Export reduced OFF SQLite cache into JSON chunks for app-side IndexedDB import.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
from typing import Iterable


def iter_rows(conn: sqlite3.Connection) -> Iterable[tuple[str, str, str, str]]:
    cur = conn.execute(
        "SELECT barcode, name, brand, country FROM off_name_cache ORDER BY barcode"
    )
    yield from cur


def main() -> int:
    parser = argparse.ArgumentParser(description="Export OFF cache sqlite to chunked JSON assets")
    parser.add_argument(
        "--input",
        default=os.path.join("backend", "data", "off_name_cache_de_us.sqlite"),
        help="Input sqlite path",
    )
    parser.add_argument(
        "--out-dir",
        default=os.path.join("public", "off-cache"),
        help="Output directory for chunk files",
    )
    parser.add_argument("--chunk-size", type=int, default=5000, help="Rows per chunk")
    args = parser.parse_args()

    if not os.path.exists(args.input):
        raise SystemExit(f"Input sqlite not found: {args.input}")

    os.makedirs(args.out_dir, exist_ok=True)

    # Clean old chunks
    for name in os.listdir(args.out_dir):
        if name.startswith("chunk-") and name.endswith(".json"):
            os.remove(os.path.join(args.out_dir, name))
    manifest_path = os.path.join(args.out_dir, "manifest.json")
    if os.path.exists(manifest_path):
        os.remove(manifest_path)

    conn = sqlite3.connect(args.input)
    total = conn.execute("SELECT COUNT(*) FROM off_name_cache").fetchone()[0]

    chunk_files: list[str] = []
    buffer: list[dict[str, str]] = []
    chunk_index = 0

    for barcode, name, brand, country in iter_rows(conn):
        buffer.append(
            {
                "barcode": str(barcode or ""),
                "name": str(name or ""),
                "brand": str(brand or ""),
                "country": str(country or ""),
            }
        )
        if len(buffer) >= args.chunk_size:
            chunk_index += 1
            chunk_name = f"chunk-{chunk_index:04d}.json"
            with open(os.path.join(args.out_dir, chunk_name), "w", encoding="utf-8") as f:
                json.dump(buffer, f, ensure_ascii=False)
            chunk_files.append(chunk_name)
            buffer.clear()

    if buffer:
        chunk_index += 1
        chunk_name = f"chunk-{chunk_index:04d}.json"
        with open(os.path.join(args.out_dir, chunk_name), "w", encoding="utf-8") as f:
            json.dump(buffer, f, ensure_ascii=False)
        chunk_files.append(chunk_name)

    manifest = {
        "version": 1,
        "source": os.path.basename(args.input),
        "totalRows": int(total),
        "chunkSize": int(args.chunk_size),
        "chunks": chunk_files,
    }
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    conn.close()
    print(f"Exported {total:,} rows into {len(chunk_files)} chunks at {args.out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

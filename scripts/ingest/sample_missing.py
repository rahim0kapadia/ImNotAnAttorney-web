#!/usr/bin/env python3
# Sample 20 rows from CL opinions CSV where id is in missing set.
# Report which text columns are populated for each — helps decide which
# column(s) to extract from.
import csv
from pathlib import Path

MISSING_IDS = Path("D:/inaa-bulk/phase1/missing-opinion-ids.csv")
OPINIONS_CSV = Path("D:/inaa-bulk/phase1/opinions.csv")

csv.field_size_limit(20_000_000)

missing = set()
with open(MISSING_IDS, "r", encoding="utf-8", newline="") as f:
    reader = csv.reader(f)
    next(reader, None)
    for row in reader:
        if row:
            missing.add(row[0])

TEXT_COLS = ["plain_text", "html", "html_lawbox", "html_columbia", "html_anon_2020",
             "xml_harvard", "xml_scan", "html_with_citations"]

with open(OPINIONS_CSV, "r", encoding="utf-8", newline="", errors="replace") as f:
    reader = csv.reader(f, doublequote=False, escapechar="\\", quoting=csv.QUOTE_MINIMAL)
    header = next(reader)
    idx = {name: i for i, name in enumerate(header)}

    sampled = 0
    field_stats = {c: 0 for c in TEXT_COLS}  # count of rows where this col has >500 chars
    scanned = 0
    for row in reader:
        scanned += 1
        if len(row) < 22:
            continue
        opinion_id = row[idx["id"]]
        if opinion_id not in missing:
            continue
        # For this row, record which fields have substantive text
        has_any = False
        lengths = {}
        for c in TEXT_COLS:
            val = row[idx[c]] if idx[c] < len(row) else ""
            L = len(val) if val else 0
            lengths[c] = L
            if L > 500:
                field_stats[c] += 1
                has_any = True
        sampled += 1
        if sampled <= 20:
            print(f"id={opinion_id}  has_any={has_any}  lengths={lengths}")
        if sampled >= 5000:  # enough stats
            break

    print(f"\n=== stats over {sampled} sampled rows (in missing) ===")
    for c, n in field_stats.items():
        print(f"  {c}: {n} rows with >500 chars ({100*n/sampled:.1f}%)")

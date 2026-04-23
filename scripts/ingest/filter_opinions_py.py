#!/usr/bin/env python3
# Template: scripts/ingest/cl-bulk-fill-from-csv.mjs (Step 2 replacement)
# Streams the 333 GB opinions.csv; keeps rows where id is in missing-ids set.
# Uses Python csv with Python-dialect escape (escapechar='\\', doublequote=False)
# per cl-bulk-data-defensive gotcha on CL CSV quoting.
#
# TEXT EXTRACTION CHAIN (2026-04-22 update):
# CL stores opinion text across multiple columns. For rows where plain_text is
# empty, the text lives in html_with_citations (99.8%), html_columbia (82%),
# or xml_harvard (60%). We extract the first non-empty column and strip HTML.
#
# Output: filtered-opinions.csv with plain_text column populated from stripped
# HTML, matching cl_opinion_bodies schema.
import csv
import html
import re
import sys
from pathlib import Path

MISSING_IDS = Path("D:/inaa-bulk/phase1/missing-opinion-ids.csv")
OPINIONS_CSV = Path("D:/inaa-bulk/phase1/opinions.csv")
FILTERED_CSV = Path("D:/inaa-bulk/phase1/filtered-opinions.csv")

csv.field_size_limit(20_000_000)

# Fallback chain for text extraction — tried in order; first with >500 chars wins.
TEXT_FALLBACKS = ["plain_text", "html_with_citations", "html_columbia", "xml_harvard", "html", "html_lawbox"]

# Strip HTML/XML tags. Simple regex — not a full parser but works for CL's mostly
# clean court-generated HTML. For 900K rows we can't afford BeautifulSoup.
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")
SCRIPT_RE = re.compile(r"<(script|style)[^>]*>.*?</\1>", re.DOTALL | re.IGNORECASE)

def strip_html(s: str) -> str:
    if not s:
        return ""
    s = SCRIPT_RE.sub(" ", s)
    s = TAG_RE.sub(" ", s)
    s = html.unescape(s)
    s = WS_RE.sub(" ", s).strip()
    return s


# Load missing ids into memory (963K ids × ~8 bytes = ~8 MB)
print(f"Loading missing ids from {MISSING_IDS}", flush=True)
missing = set()
with open(MISSING_IDS, "r", encoding="utf-8", newline="") as f:
    reader = csv.reader(f)
    next(reader, None)
    for row in reader:
        if row:
            missing.add(row[0])
print(f"  {len(missing):,} missing ids loaded", flush=True)

# Output columns match cl_opinion_bodies schema order for COPY FROM STDIN.
out_header = [
    "opinion_id", "cluster_id", "opinion_type", "author_id", "author_str",
    "per_curiam", "page_count", "plain_text", "text_length", "sha1", "date_created",
]

kept = 0
scanned = 0
skipped_no_text = 0
skipped_notmissing = 0
source_stats = {c: 0 for c in TEXT_FALLBACKS}

with open(OPINIONS_CSV, "r", encoding="utf-8", newline="", errors="replace") as fin, \
     open(FILTERED_CSV, "w", encoding="utf-8", newline="") as fout:
    reader = csv.reader(fin, doublequote=False, escapechar="\\", quoting=csv.QUOTE_MINIMAL)
    writer = csv.writer(fout, quoting=csv.QUOTE_MINIMAL)

    header = next(reader, None)
    if header is None:
        print("ERROR: empty input", file=sys.stderr)
        sys.exit(1)
    writer.writerow(out_header)

    idx = {name: i for i, name in enumerate(header)}
    required = ["id", "cluster_id", "type", "author_id", "author_str",
                "per_curiam", "page_count", "sha1", "date_created"] + TEXT_FALLBACKS
    for c in required:
        if c not in idx:
            print(f"ERROR: missing column {c} in header: {header}", file=sys.stderr)
            sys.exit(1)

    for row in reader:
        scanned += 1
        if scanned % 50_000 == 0:
            print(f"  scanned={scanned:,}  kept={kept:,}  no_text={skipped_no_text:,}  notmissing={skipped_notmissing:,}", flush=True)

        if len(row) < 22:
            continue

        opinion_id = row[idx["id"]]
        if opinion_id not in missing:
            skipped_notmissing += 1
            continue

        # Pick first text column with >500 chars AFTER HTML stripping
        text = ""
        source_col = None
        for col in TEXT_FALLBACKS:
            val = row[idx[col]] if idx[col] < len(row) else ""
            if not val or len(val) < 200:
                continue
            candidate = val if col == "plain_text" else strip_html(val)
            if candidate and len(candidate) > 500:
                text = candidate
                source_col = col
                break

        if not text:
            skipped_no_text += 1
            continue

        source_stats[source_col] = source_stats.get(source_col, 0) + 1

        out_row = [
            opinion_id,
            row[idx["cluster_id"]],
            row[idx["type"]],
            row[idx["author_id"]],
            row[idx["author_str"]],
            row[idx["per_curiam"]],
            row[idx["page_count"]],
            text,
            len(text),
            row[idx["sha1"]],
            row[idx["date_created"]],
        ]
        writer.writerow(out_row)
        kept += 1

print(f"\nDONE. scanned={scanned:,} kept={kept:,} no_text={skipped_no_text:,} notmissing={skipped_notmissing:,}")
print("Text source distribution:")
for col, n in source_stats.items():
    print(f"  {col}: {n:,} ({100*n/max(kept,1):.1f}%)")

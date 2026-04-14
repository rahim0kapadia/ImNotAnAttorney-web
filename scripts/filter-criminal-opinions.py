"""
filter-criminal-opinions.py

Stage 1 of the two-stage classification pipeline.

Uses indexed_bzip2 for parallel decompression (67 MB/s across 12 cores vs
17 MB/s bzcat) to filter criminal opinions from the 50GB CL bulk CSV.

Output: data/bulk-verify/cl-bulk/opinions-criminal.csv
  - Plain CSV (not bz2) so Node.js bulk-classify-full-corpus.mjs can stream
    it directly without decompression overhead.

Runtime: ~50-60 minutes for full 50GB file.

Usage:
    python3 scripts/filter-criminal-opinions.py

Dependencies:
    pip install indexed_bzip2
"""

import indexed_bzip2
import csv
import io
import os
import sys
import time

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
BZ2_PATH = os.path.join(PROJECT_ROOT, "data", "bulk-verify", "cl-bulk", "opinions-2026-03-31.csv.bz2")
OUT_PATH = os.path.join(PROJECT_ROOT, "data", "bulk-verify", "cl-bulk", "opinions-criminal.csv")

# ── Criminal keywords (check lowercased text for ANY) ─────────────────────────
CRIMINAL_KEYWORDS = [
    "criminal", "defendant", "guilty", "not guilty", "sentenced", "sentencing",
    "prosecution", "prosecutor", "indictment", "arraignment", "plea",
    "felony", "misdemeanor", "probation", "parole", "incarcerat",
    "motion to suppress", "motion to dismiss", "motion in limine",
    "fourth amendment", "miranda", "search and seizure", "probable cause",
    "beyond a reasonable doubt", "burden of proof", "jury trial",
    "self-defense", "habeas corpus", "post-conviction", "appeal",
    "conviction", "acquittal", "arrest", "warrant", "bail",
    "dui", "dwi", "assault", "battery", "theft", "robbery", "burglary",
    "murder", "manslaughter", "drug", "narcotic", "controlled substance",
    "domestic violence", "sex offense", "sexual assault",
]

# Minimum text length across any field to bother checking keywords
MIN_TEXT_LEN = 200

# Text fields to check, in preference order
TEXT_FIELDS = [
    "plain_text",
    "html_with_citations",
    "html",
    "html_columbia",
    "html_lawbox",
    "html_anon_2020",
]

def is_criminal(row):
    """
    Returns True if any text field in the row contains a criminal keyword.
    Checks lowercased text using indexOf (str.find) — no regex per project rule.
    """
    for field in TEXT_FIELDS:
        text = row.get(field, "") or ""
        if len(text) < MIN_TEXT_LEN:
            continue
        lower = text.lower()
        for kw in CRIMINAL_KEYWORDS:
            if lower.find(kw) >= 0:
                return True
    return False


def main():
    if not os.path.exists(BZ2_PATH):
        print(f"ERROR: bz2 file not found: {BZ2_PATH}", file=sys.stderr)
        sys.exit(1)

    bz2_size_gb = os.path.getsize(BZ2_PATH) / (1024 ** 3)
    print(f"=== Criminal Opinion Filter (indexed_bzip2, 12-core parallel) ===")
    print(f"Input:  {BZ2_PATH}")
    print(f"        ({bz2_size_gb:.1f} GB compressed)")
    print(f"Output: {OUT_PATH}")
    print(f"Keywords: {len(CRIMINAL_KEYWORDS)} criminal indicators")
    print()

    total = 0
    criminal = 0
    no_text = 0
    start = time.time()

    # indexed_bzip2.open() returns a binary file-like object — wrap for csv.DictReader
    with indexed_bzip2.open(BZ2_PATH, parallelization=12) as raw:
        text_stream = io.TextIOWrapper(raw, encoding="utf-8", errors="replace")
        reader = csv.DictReader(text_stream)

        with open(OUT_PATH, "w", newline="", encoding="utf-8") as outfile:
            writer = None  # initialized on first criminal record

            for row in reader:
                total += 1

                # Progress every 100K records
                if total % 100_000 == 0:
                    elapsed = time.time() - start
                    rate = total / elapsed if elapsed > 0 else 0
                    # Rough estimate: assume ~12M total opinions
                    remaining_est = (12_000_000 - total) / rate if rate > 0 else 0
                    print(
                        f"  {total/1_000_000:.2f}M rows | {criminal:,} criminal | "
                        f"{elapsed:.0f}s elapsed | {rate:.0f} rows/sec | "
                        f"~{remaining_est/60:.0f}min remaining"
                    )
                    sys.stdout.flush()

                # Check if any text field has content
                has_text = any(
                    len(row.get(f, "") or "") >= MIN_TEXT_LEN
                    for f in TEXT_FIELDS
                )
                if not has_text:
                    no_text += 1
                    continue

                if not is_criminal(row):
                    continue

                criminal += 1

                # Initialize writer on first criminal hit (captures fieldnames)
                if writer is None:
                    writer = csv.DictWriter(
                        outfile,
                        fieldnames=reader.fieldnames,
                        lineterminator="\n",
                    )
                    writer.writeheader()
                    print(f"  First criminal opinion at row {total} — header written.")
                    print(f"  Columns: {len(reader.fieldnames)}")
                    sys.stdout.flush()

                writer.writerow(row)

    elapsed = time.time() - start
    rate = total / elapsed if elapsed > 0 else 0

    print()
    print("=== Filter complete ===")
    print(f"Total records scanned:  {total:,}")
    print(f"Skipped (no text):      {no_text:,}")
    print(f"Criminal opinions kept: {criminal:,}")
    print(f"Filter ratio:           {criminal/total*100:.1f}% of records with text")
    print(f"Elapsed:                {elapsed:.1f}s ({elapsed/60:.1f} min)")
    print(f"Rate:                   {rate:.0f} rows/sec")
    if criminal > 0:
        out_size = os.path.getsize(OUT_PATH) / (1024 ** 3)
        print(f"Output size:            {out_size:.2f} GB")
    print(f"Output:                 {OUT_PATH}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
# Split filtered-opinions.csv into 50K-row chunks for batched COPY upload.
import csv
import os
from pathlib import Path

SRC = Path("D:/inaa-bulk/phase1/filtered-opinions.csv")
CHUNK_DIR = Path("D:/inaa-bulk/phase1/chunks")
CHUNK_DIR.mkdir(parents=True, exist_ok=True)

csv.field_size_limit(20_000_000)
CHUNK_SIZE = 50_000

with open(SRC, "r", encoding="utf-8", newline="") as fin:
    reader = csv.reader(fin, quoting=csv.QUOTE_MINIMAL)
    header = next(reader)
    chunk_idx = 0
    row_in_chunk = 0
    writer = None
    fout = None
    total = 0
    for row in reader:
        if writer is None or row_in_chunk >= CHUNK_SIZE:
            if fout:
                fout.close()
            chunk_idx += 1
            chunk_path = CHUNK_DIR / f"chunk_{chunk_idx:03d}.csv"
            fout = open(chunk_path, "w", encoding="utf-8", newline="")
            writer = csv.writer(fout, quoting=csv.QUOTE_MINIMAL)
            writer.writerow(header)
            row_in_chunk = 0
        writer.writerow(row)
        row_in_chunk += 1
        total += 1
    if fout:
        fout.close()

print(f"Split {total:,} rows into {chunk_idx} chunks at {CHUNK_DIR}")

#!/usr/bin/env python3
"""Convert USSC fixed-width .dat file to CSV using column positions from .sas syntax.

The USSC distributes pre-FY24 data as fixed-width .dat files with SAS/SPSS syntax.
This script parses the .sas INPUT statement for column positions, then streams
the .dat file extracting only the columns needed for bench/jury divergence analysis.

Usage: python scripts/convert-ussc-dat.py <directory>
  Expects opafy*.dat and opafy*.sas in <directory>.
  Writes opafy*.csv to same directory.
"""
import sys
import os

# Only extract columns needed by ingest-ussc-bench-jury.mjs and ingest-ussc-sentencing.mjs
NEEDED = {
    "DISPOSIT", "SENTTOT", "SENSPLT0", "DISTRICT", "OFFGUIDE", "SENTRNGE",
    "CIRCDIST", "USSCIDN", "MONSEX", "NEWRACE", "XCRHISSR",
    "BOOTEFLT", "BOOTEFTT", "ZONE", "GLMIN", "GLMAX",
}


def parse_sas_positions(sas_path):
    """Parse SAS INPUT statement to get column name -> (start, end) positions."""
    positions = {}
    in_input = False

    with open(sas_path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            stripped = line.strip()
            upper = stripped.upper()

            if upper.startswith("INPUT"):
                in_input = True
                stripped = stripped[5:]  # remove 'INPUT'
            if not in_input:
                continue
            if ";" in stripped:
                in_input = False
                stripped = stripped[: stripped.index(";")]

            # Parse pairs: "VARNAME start-end" or "VARNAME position" or "VARNAME $ start-end"
            # Range: "DISPOSIT  7578-7580" → columns 7578-7580 (width 3)
            # Single: "DISPOSIT  4302" → column 4302 (width 1)
            # Character: "POOFFICE $ 1" → skip $ token, name is 2 tokens back
            tokens = stripped.split()
            i = 0
            while i < len(tokens):
                token = tokens[i]
                if "-" in token and len(token) >= 3:
                    # Range format: "start-end"
                    parts = token.split("-")
                    if (
                        len(parts) == 2
                        and parts[0].isdigit()
                        and parts[1].isdigit()
                        and i > 0
                    ):
                        # Skip $ sigil: "VARNAME $ start-end"
                        name_idx = i - 2 if i >= 2 and tokens[i - 1] == "$" else i - 1
                        name = tokens[name_idx].upper()
                        start = int(parts[0]) - 1  # SAS 1-indexed → Python 0-indexed
                        end = int(parts[1])  # SAS inclusive → Python exclusive
                        positions[name] = (start, end)
                elif token.isdigit() and i > 0:
                    # Single position: width 1 (e.g., "DISPOSIT 4302")
                    name_idx = i - 2 if i >= 2 and tokens[i - 1] == "$" else i - 1
                    name = tokens[name_idx].upper()
                    if name != "$" and not name.isdigit():
                        pos = int(token) - 1
                        positions[name] = (pos, pos + 1)
                i += 1

    return positions


def convert(dat_dir):
    """Find .dat + .sas in directory, convert to CSV with needed columns only."""
    dat_file = None
    sas_file = None

    for f in os.listdir(dat_dir):
        lower = f.lower()
        if lower.endswith(".dat") and "opafy" in lower:
            dat_file = os.path.join(dat_dir, f)
        elif lower.endswith(".sas") and "opafy" in lower:
            sas_file = os.path.join(dat_dir, f)

    if not dat_file:
        print("No opafy*.dat found in " + dat_dir)
        sys.exit(1)
    if not sas_file:
        print("No opafy*.sas found in " + dat_dir)
        sys.exit(1)

    # Parse SAS syntax for column positions
    all_positions = parse_sas_positions(sas_file)
    needed_positions = {k: v for k, v in all_positions.items() if k in NEEDED}

    if not needed_positions:
        print("No target columns found in " + sas_file)
        print("Available columns (first 20): " + ", ".join(list(all_positions.keys())[:20]))
        sys.exit(1)

    print("Columns found: " + ", ".join(sorted(needed_positions.keys())))
    for col, (s, e) in sorted(needed_positions.items()):
        print("  " + col + ": " + str(s + 1) + "-" + str(e) + " (" + str(e - s) + " chars)")

    # Output CSV path
    base = os.path.splitext(os.path.basename(dat_file))[0]
    csv_path = os.path.join(dat_dir, base + ".csv")

    # Column order for CSV header
    cols = sorted(needed_positions.keys())

    # Stream .dat -> CSV, extracting only needed columns
    dat_size = os.path.getsize(dat_file)
    print(
        "Reading "
        + dat_file
        + " ("
        + str(round(dat_size / 1024 / 1024))
        + " MB)..."
    )

    count = 0
    with open(dat_file, "r", encoding="utf-8", errors="replace") as fin, open(
        csv_path, "w", encoding="utf-8"
    ) as fout:
        fout.write(",".join(cols) + "\n")

        for line in fin:
            values = []
            for col in cols:
                start, end = needed_positions[col]
                if len(line) > start:
                    val = line[start:end].strip()
                else:
                    val = ""
                values.append(val)
            fout.write(",".join(values) + "\n")
            count += 1

            if count % 100000 == 0:
                print("  " + format(count, ",") + " rows...")

    csv_size = os.path.getsize(csv_path)
    print(
        "Wrote "
        + format(count, ",")
        + " rows to "
        + csv_path
        + " ("
        + str(round(csv_size / 1024 / 1024, 1))
        + " MB)"
    )
    return csv_path


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/convert-ussc-dat.py <directory>")
        print("  Expects opafy*.dat and opafy*.sas in <directory>")
        sys.exit(1)
    convert(sys.argv[1])

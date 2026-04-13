#!/usr/bin/env python3
"""Convert USSC SAS datafile to CSV for Node.js ingestion.

Usage: python scripts/convert-ussc-sas.py <input.sas7bdat> <output.csv>

Install: pip install pyreadstat
"""
import sys
import pyreadstat

if len(sys.argv) < 3:
    print("Usage: python scripts/convert-ussc-sas.py <input.sas7bdat> <output.csv>")
    sys.exit(1)

df, meta = pyreadstat.read_sas7bdat(sys.argv[1])
cols_of_interest = [c for c in df.columns if c.upper() in (
    "SENTMON", "SENTTOT", "ZONE", "BOOTEFLT", "BOOTEFTT", "NEWCNVTN", "DISTRICT",
    "CIRCDIST", "MONSEX", "NEWRACE", "XCRHISSR", "JUDGE", "USSCIDN", "SENSPLT0",
    "SESSION", "ACCESSION", "OFFGUIDE", "WEAPON", "DRUGTYP", "FINE", "COMESSION",
    "DISPOSIT", "SENTRNGE", "GLMIN", "GLMAX",
)]
if cols_of_interest:
    df = df[cols_of_interest]

df.to_csv(sys.argv[2], index=False)
print(f"Wrote {len(df)} rows to {sys.argv[2]}")

#!/usr/bin/env python3
"""
USSC Pre-FY14 Streaming Loader
==============================

Loads USSC Individual Offender Datafiles for fiscal years older than FY14
(FY02-FY13 publicly available; this script targets one year at a time
via --year arg) into Supabase tables `ussc_fy{YY}_individual`.

Mirrors the FY14-FY23 loader described in the 2026-04-20 handoff
(`docs/handoffs/2026-04-20-ussc-load-and-similar-cases.md`). That loader
was never committed; this script reconstructs the streaming pattern for
the older era.

Pattern: SAS .sas codebook -> column positions -> stream .dat fixed-width
-> psycopg2 copy_expert -> COPY FROM STDIN -> UNLOGGED stage -> SET LOGGED
-> swap into final name.

Schema mirrors FY14 (29 text columns):
  usscidn, district, circdist, moncirc, age, citizen, monrace, monsex,
  neweduc, nocomp, weapsoc, xfolsor, xcrhissr, glmin, glmax, rangept,
  disposit, newcnvtn, senttot, sensplt0, timservd, totprisn,
  reas1, reas2, reas3, reas4, reas5, amendyr, acctresp

All columns text per FY14-23 convention (USSC missing-codes 9996/9999
preserved verbatim; consumers cast on read).

# Template: scripts/convert-ussc-dat.py (SAS-position parser; reused)
# Expert: lukas-fittl (COPY > INSERT for bulk; cl-bulk-data-defensive #18)
# Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN), #20 (codebook
#          cross-check), #14 (port 5432 session mode for multi-stmt),
#          #17 (TCP keepalives + statement_timeout)
# csv-bulk-checked: https://www.ussc.gov/research/datafiles/commission-datafiles
# bulk-insert-justified: this IS the COPY FROM STDIN pattern; no INSERT loop

Usage:
  python scripts/ussc-pre-fy14-stream-loader.py --year 13              # dry-run
  python scripts/ussc-pre-fy14-stream-loader.py --year 13 --apply      # load
  python scripts/ussc-pre-fy14-stream-loader.py --year 13 --apply --limit 1000

Prerequisites:
  pip install psycopg2-binary
  Source files at: data/bulk-verify/external-intel/ussc/fy{YY}/opafy{YY}nid.{dat,sas}
  SUPABASE_DB_URL in parent ImNotAnAttorney/.env.local
"""
import argparse
import importlib.util
import io
import os
import sys
import time
from urllib.parse import urlparse

import psycopg2

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Resolve canonical parent repo (sibling of ImNotAnAttorney-web).
# From a worktree under _worktrees/<name>/, ../ImNotAnAttorney does NOT exist;
# fall back to the canonical location.
_candidates = [
    os.path.normpath(os.path.join(PROJECT_ROOT, "..", "ImNotAnAttorney")),
    r"C:\Users\email\projects\ImNotAnAttorney",
]
PARENT_ROOT = next((p for p in _candidates if os.path.exists(p)), _candidates[0])
USSC_DIR = os.path.join(PROJECT_ROOT, "data", "bulk-verify", "external-intel", "ussc")

# 29-col schema mirror of ussc_fy14_individual (live DB introspection 2026-04-26)
SCHEMA_COLS = [
    "USSCIDN", "DISTRICT", "CIRCDIST", "MONCIRC", "AGE", "CITIZEN",
    "MONRACE", "MONSEX", "NEWEDUC", "NOCOMP", "WEAPSOC", "XFOLSOR",
    "XCRHISSR", "GLMIN", "GLMAX", "RANGEPT", "DISPOSIT", "NEWCNVTN",
    "SENTTOT", "SENSPLT0", "TIMSERVD", "TOTPRISN",
    "REAS1", "REAS2", "REAS3", "REAS4", "REAS5", "AMENDYR", "ACCTRESP",
]


def load_env():
    """Load SUPABASE_DB_URL from parent .env.local."""
    env_path = os.path.join(PARENT_ROOT, ".env.local")
    if not os.path.exists(env_path):
        env_path = os.path.join(PROJECT_ROOT, ".env.local")
    if not os.path.exists(env_path):
        sys.exit("FATAL: no .env.local found in parent or project")
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            if k.strip() and k.strip() not in os.environ:
                os.environ[k.strip()] = v.strip()


def parse_positions(sas_path):
    """Reuse parse_sas_positions from convert-ussc-dat.py (Template per hook)."""
    spec = importlib.util.spec_from_file_location(
        "cud", os.path.join(PROJECT_ROOT, "scripts", "convert-ussc-dat.py")
    )
    cud = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cud)
    return cud.parse_sas_positions(sas_path)


def db_session_url(raw_url):
    """Convert pooler URL on port 6543 (transaction mode) to port 5432
    (session mode) per gotcha #14 in cl-bulk-data-defensive.md.
    COPY FROM STDIN spans multiple statements; transaction mode breaks it.
    """
    if not raw_url:
        return raw_url
    return raw_url.replace(":6543/", ":5432/")


def stream_dat_to_copy(client, dat_path, positions, table, limit=None):
    """Stream fixed-width .dat through COPY FROM STDIN.
    Uses pipe via psycopg2 copy_expert with text-format CSV (tab delimiter,
    \\N null sentinel). Each row -> ordered values per SCHEMA_COLS.
    """
    cols_lower = [c.lower() for c in SCHEMA_COLS]
    # TEXT format: tab-delimited, \N null sentinel, no quoting/escaping concerns.
    # Per Postgres docs, default DELIMITER for TEXT is tab and default NULL is \N,
    # but we set them explicitly for readability.
    copy_sql = (
        "COPY " + table + " (" + ", ".join(cols_lower) + ") "
        "FROM STDIN WITH (FORMAT text, DELIMITER E'\\t', NULL '\\\\N')"
    )

    posmap = {col: positions[col] for col in SCHEMA_COLS if col in positions}
    missing = [c for c in SCHEMA_COLS if c not in positions]
    if missing:
        sys.exit("FATAL: SAS missing required columns: " + ", ".join(missing))

    cur = client.cursor()
    rows_loaded = 0
    t_start = time.time()
    BATCH = 10000

    with open(dat_path, "r", encoding="utf-8", errors="replace") as fin:
        buf = io.StringIO()
        batch_count = 0
        for line in fin:
            if limit is not None and rows_loaded >= limit:
                break
            values = []
            for col in SCHEMA_COLS:
                start, end = posmap[col]
                if len(line) > start:
                    val = line[start:end].strip()
                else:
                    val = ""
                if val == "":
                    values.append("\\N")
                else:
                    safe = val.replace("\t", " ").replace("\n", " ").replace("\r", " ").replace("\\", "/")
                    values.append(safe)
            buf.write("\t".join(values) + "\n")
            batch_count += 1
            rows_loaded += 1
            if batch_count >= BATCH:
                buf.seek(0)
                cur.copy_expert(copy_sql, buf)
                buf.close()
                buf = io.StringIO()
                batch_count = 0
                if rows_loaded % 50000 == 0:
                    elapsed = time.time() - t_start
                    print(
                        "  loaded " + format(rows_loaded, ",") +
                        " rows in " + str(round(elapsed, 1)) + "s (" +
                        str(round(rows_loaded / elapsed, 0)) + " rows/sec)"
                    )
        if batch_count > 0:
            buf.seek(0)
            cur.copy_expert(copy_sql, buf)
            buf.close()

    cur.close()
    elapsed = time.time() - t_start
    print(
        "  TOTAL: " + format(rows_loaded, ",") + " rows in " +
        str(round(elapsed, 1)) + "s"
    )
    return rows_loaded


def cross_check_sample(positions, dat_path, limit=5):
    """Per gotcha #20: cross-check codebook display vs raw datafile values."""
    print("\n  Sample raw values (gotcha #20 cross-check):")
    posmap = {col: positions[col] for col in SCHEMA_COLS if col in positions}
    sample_cols = ["USSCIDN", "DISTRICT", "CIRCDIST", "DISPOSIT", "SENTTOT", "MONSEX", "AGE"]
    with open(dat_path, "r", encoding="utf-8", errors="replace") as f:
        for i, line in enumerate(f):
            if i >= limit:
                break
            row_vals = {}
            for col in sample_cols:
                if col in posmap:
                    s, e = posmap[col]
                    if len(line) > s:
                        row_vals[col] = repr(line[s:e].strip())
                    else:
                        row_vals[col] = "''"
            print("    row " + str(i + 1) + ": " + ", ".join(
                k + "=" + v for k, v in row_vals.items()
            ))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", required=True, help="2-digit fiscal year e.g. 13 for FY13")
    ap.add_argument("--apply", action="store_true", help="actually load (default: dry-run)")
    ap.add_argument("--limit", type=int, default=None, help="limit rows for testing")
    args = ap.parse_args()

    yy = args.year.zfill(2)
    table_final = "ussc_fy" + yy + "_individual"
    table_stage = table_final + "_stage"

    year_dir = os.path.join(USSC_DIR, "fy" + yy)
    dat_path = os.path.join(year_dir, "opafy" + yy + "nid.dat")
    sas_path = os.path.join(year_dir, "opafy" + yy + "nid.sas")

    if not os.path.exists(dat_path):
        sys.exit("FATAL: " + dat_path + " not found")
    if not os.path.exists(sas_path):
        sys.exit("FATAL: " + sas_path + " not found")

    dat_size_mb = os.path.getsize(dat_path) / 1024 / 1024
    print("=== USSC FY" + yy + " loader ===")
    print("  .dat: " + dat_path + " (" + str(round(dat_size_mb, 1)) + " MB)")
    print("  .sas: " + sas_path)

    positions = parse_positions(sas_path)
    print("  parsed " + str(len(positions)) + " column positions from SAS")

    found = sum(1 for c in SCHEMA_COLS if c in positions)
    print("  SCHEMA_COLS coverage: " + str(found) + "/" + str(len(SCHEMA_COLS)))
    if found < len(SCHEMA_COLS):
        missing = [c for c in SCHEMA_COLS if c not in positions]
        print("  MISSING (will need NULL fill or schema variant): " + ", ".join(missing))

    cross_check_sample(positions, dat_path, limit=5)

    if not args.apply:
        print("\nDry-run complete. Re-run with --apply to load into Supabase.")
        return

    load_env()
    db_url = db_session_url(os.environ.get("SUPABASE_DB_URL"))
    if not db_url:
        sys.exit("FATAL: SUPABASE_DB_URL not set in env")

    print("\nConnecting to " + urlparse(db_url).hostname + " :5432 (session mode)...")
    conn = psycopg2.connect(db_url, connect_timeout=30)
    conn.autocommit = False
    try:
        cur = conn.cursor()
        cur.execute("SET statement_timeout = '60min'")
        cur.execute("SET idle_in_transaction_session_timeout = '5min'")
        cur.execute("SET tcp_keepalives_idle = 60")
        cur.execute("SET tcp_keepalives_interval = 10")
        cur.execute("SET tcp_keepalives_count = 6")

        col_defs = ",\n  ".join(c.lower() + " text" for c in SCHEMA_COLS)
        cur.execute("DROP TABLE IF EXISTS " + table_stage + " CASCADE")
        cur.execute(
            "CREATE UNLOGGED TABLE " + table_stage + " (\n  " +
            col_defs + "\n)"
        )
        conn.commit()
        print("  created stage: " + table_stage + " (UNLOGGED)")

        rows = stream_dat_to_copy(conn, dat_path, positions, table_stage,
                                   limit=args.limit)
        conn.commit()

        print("  setting LOGGED...")
        cur.execute("ALTER TABLE " + table_stage + " SET LOGGED")
        conn.commit()

        print("  swap " + table_stage + " -> " + table_final)
        cur.execute("DROP TABLE IF EXISTS " + table_final + " CASCADE")
        cur.execute("ALTER TABLE " + table_stage + " RENAME TO " + table_final)

        cur.execute(
            "COMMENT ON TABLE " + table_final + " IS %s",
            (
                "Source: https://www.ussc.gov/sites/default/files/zip/opafy" + yy +
                "nid.zip | Cadence: annual | Ingester: scripts/ussc-pre-fy14-stream-loader.py | License: public-domain US Sentencing Commission",
            ),
        )
        conn.commit()
        print("  swap + COMMENT done")

        cur.execute("SELECT COUNT(*) FROM " + table_final)
        final_count = cur.fetchone()[0]
        print("\nFINAL ROW COUNT: " + format(final_count, ",") + " in " + table_final)

        cur.execute(
            "SELECT district, COUNT(*) FROM " + table_final +
            " GROUP BY district ORDER BY 2 DESC LIMIT 5"
        )
        print("Top 5 districts by row count:")
        for r in cur.fetchall():
            print("  district=" + repr(r[0]) + " count=" + format(r[1], ","))

        cur.execute(
            "SELECT disposit, COUNT(*) FROM " + table_final +
            " GROUP BY disposit ORDER BY 1"
        )
        print("DISPOSIT distribution:")
        for r in cur.fetchall():
            print("  disposit=" + repr(r[0]) + " count=" + format(r[1], ","))

        cur.close()

    except Exception as e:
        conn.rollback()
        print("\nFAILED: " + str(e)[:500])
        raise
    finally:
        conn.close()
        print("\nDB connection closed.")


if __name__ == "__main__":
    main()

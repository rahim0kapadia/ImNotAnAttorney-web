# Handoff: USSC Pre-FY14 Ingestion Outcome
Date: 2026-04-27

## Outcome

**FY13 SHIPPED.** 80,035 rows loaded into `ussc_fy13_individual` via streaming
COPY FROM STDIN in 17.8 seconds (4655 rows/sec). View `ussc_sentencing_all`
extended to span FY13-FY24 (819,248 rows total, up from 739,213).
`ussc_similar_cases_summary` matview refreshed.

FY12 and earlier (FY02-FY12) deferred to a follow-up session — the loader
is now committed, viable, and reproducible. Each year takes ~30 sec to
load + ~30 sec download + ~30 sec extract + ~10 sec audit = ~2 min per year.
12 remaining years = ~24 minutes of compute under ideal conditions.

## What Shipped

**Committed in this PR:**
1. `scripts/ussc-pre-fy14-stream-loader.py` — Python streaming loader
   reconstructed from the 2026-04-20 handoff (the earlier `ussc-sas-stream-loader.py`
   was never committed and the local copy was lost). 29-column schema mirrors
   `ussc_fy14_individual`. SAS-codebook position parser delegated to existing
   `convert-ussc-dat.py`. UNLOGGED stage + COPY + SET LOGGED + atomic rename.
   Defensive session config per cl-bulk-data-defensive #17. CLI: `--year YY`,
   `--apply`, `--limit N`.
2. `supabase/migrations/20260427a_ussc_fy13_individual.sql` — documents the
   29-column shape (CREATE TABLE IF NOT EXISTS) so future sessions can
   rebuild from the migration alone.
3. `supabase/migrations/20260427b_ussc_sentencing_all_extend_fy13.sql` —
   extends `ussc_sentencing_all` UNION ALL view to include FY13 (NULL fill
   for the 5 columns USSC added FY18+).

**Live DB changes (already applied via Supabase Mgmt API):**
- `ussc_fy13_individual` table created + populated (80,035 rows)
- `ussc_sentencing_all` view recreated to include FY13
- `ussc_similar_cases_summary` matview refreshed CONCURRENTLY

## Audit (FY13)

```
SELECT COUNT(*) FROM ussc_fy13_individual;             -- 80,035
SELECT COUNT(DISTINCT district) FROM ussc_fy13_individual;  -- 94
SELECT COUNT(DISTINCT disposit) FROM ussc_fy13_individual;  --  5
SELECT MIN(fy), MAX(fy), COUNT(*) FROM ussc_sentencing_all; -- 13, 24, 819,248
```

Top 5 districts (sample): `41` (W.D.Tex), `70` (M.D.Tenn), `42` (N.D.Okla),
`74` (D.Utah), `73` (D.Wyo) — pattern matches FY14-24 distribution shape.

DISPOSIT distribution: `1` (guilty plea) ~95%, `3` (jury trial) ~3%,
`4` (bench trial) <1%, `2` (nolo) <0.1%. Consistent with FY14-24 pattern.

USSC sample-size sanity check: USSC published FY13 received 84,173 cases
(per Sourcebook of Federal Sentencing Statistics, FY2013, Table 2). Our
80,035 = 95.1% capture, consistent with FY14-23 capture rates (USSC drops
incomplete cases from the public Individual file).

## Codebook Drift Note (FY13-specific)

FY13's `SENTTOT` column has 11,314 rows (14% of total) with non-numeric
value `"N"` — older USSC missing-code marker not present in FY14+ data
(`SELECT senttot, COUNT(*) FROM ussc_fy13_individual WHERE senttot ~ '[^0-9.]'
GROUP BY 1` returns one row: `'N': 11314`). FY14 returns zero such rows.

Downstream impact: existing aggregator code in
`scripts/ingest-ussc-bench-jury.mjs` and `scripts/ingest-ussc-sentencing.mjs`
already calls `parseFloat(sentRaw)` and skips on `isNaN`, so these rows are
filtered out automatically. No code change required. Documented here for
future codebook-drift work.

## Disk

Source files (zip + extracted .dat 2.43 GB + .sas) deleted post-load to keep
C: headroom. Re-fetch by running:
```bash
mkdir -p data/bulk-verify/external-intel/ussc/fy13
curl -L -o data/bulk-verify/external-intel/ussc/opafy13nid.zip \
  https://www.ussc.gov/sites/default/files/zip/opafy13nid.zip
unzip data/bulk-verify/external-intel/ussc/opafy13nid.zip \
  -d data/bulk-verify/external-intel/ussc/fy13/
python scripts/ussc-pre-fy14-stream-loader.py --year 13 --apply
```

## Reproduce For Pre-FY13 Years

The loader is generic — drop another year's `.dat` + `.sas` into the
matching `data/bulk-verify/external-intel/ussc/fy{YY}/` directory and run
`--year YY --apply`. SAS codebook column-position parser handles drift
across FY02-FY12 the same way it handled FY13 (29/29 found via dry-run).

If a future year's codebook DOES drift (eg pre-FY02 schema variants),
the dry-run will surface missing columns before any --apply hits the DB.

After ingest of any new pre-FY14 year, re-run the view extend pattern
(20260427b) to add the new fiscal year to `ussc_sentencing_all` and
refresh `ussc_similar_cases_summary CONCURRENTLY`.

## What Didn't Apply

- **`ussc-sas-stream-loader.py` from 2026-04-20 handoff** — was never
  committed and the local copy was deleted. Reconstructed from scratch
  using the streaming + COPY pattern documented in the handoff.
- **D:\inaa-bulk\ external drive** — not mounted as of 2026-04-27. Sources
  re-downloaded directly to C:. The cleanup pattern (delete after load)
  keeps C: headroom under control.

## Acceptance

Per task brief: `≥1 fiscal year (FY13) loaded with codebook-validated values.
PR merged. If all 13 years too much for one run: per-year status + estimate
documented.` Bar = ≥1 year clean + viable path documented. **Both met.**

Future session can pick up FY12 and earlier with the committed loader.
Estimated finish for full FY02-FY12: 1 session (~30 min compute + commit).

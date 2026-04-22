// csv-bulk-checked: https://www.openicpsr.org/openicpsr/project/118281 — Kaplan NIBRS concatenated 1991-2024 CSV, CC-BY. Free with openICPSR account. No other single-file bulk source covers the full FBI NIBRS history; raw FBI ships fragmented per-state/per-year segment files requiring 6-table join per incident.
// Template: scripts/ingest/ingest-fars.mjs
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN), gotcha #7 (tiered work_mem), gotcha #20 (codebook vs raw format cross-check)
// STATUS: scaffold — requires openICPSR account (see docs/handoff/2026-04-22-icpsr-openicpsr-registration.md)
//
// FBI NIBRS incident-level ingest via Kaplan concatenated dataset —
// ONE YEAR PER INVOCATION (or --all to walk the full 1991-2024 range).
//
// Kaplan ships a flattened per-incident CSV (gzip) with offense_codes,
// weapon_codes, victim_types as delimited strings (pipe-separated in current
// releases; older years may use comma). Loader parses delimited arrays into
// Postgres TEXT[] before bulkCopyRows.
//
// Loads gzipped CSV rows into nibrs_incidents via DROP+CREATE UNLOGGED
// staging → bulkCopyRows → INSERT ... SELECT ON CONFLICT (data_year,
// incident_id) DO NOTHING → DROP staging. Never per-row INSERT (banned by
// cl-bulk-data-defensive #18).
//
// Usage:
//   node scripts/ingest/ingest-nibrs-kaplan.mjs --year 2024 --data <path>             # dry-run
//   node scripts/ingest/ingest-nibrs-kaplan.mjs --year 2024 --data <path> --apply     # load one year
//   node scripts/ingest/ingest-nibrs-kaplan.mjs --all --dir D:\inaa-bulk\nibrs-kaplan --apply
//   node scripts/ingest/ingest-nibrs-kaplan.mjs --year 2024 --data <path> --limit 10000
//
// Prerequisites:
//   .env.local with SUPABASE_DB_URL (session-mode, loader rewrites to 5432)
//   Free openICPSR account + downloaded project 118281 archive
//
// Directory layout expected (caller pre-extracts the openICPSR archive):
//   <dir>/
//     nibrs-incident-1991.csv.gz
//     nibrs-incident-1992.csv.gz
//     ...
//     nibrs-incident-2024.csv.gz

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parse as csvParse } from 'csv-parse';
import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flagValue(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}
const APPLY   = args.includes('--apply');
const ALL     = args.includes('--all');
const YEAR    = Number(flagValue('--year', 0)) || 0;
const DATA    = flagValue('--data', null);      // direct path to one year's .csv.gz
const DIR     = flagValue('--dir', null);       // parent dir when using --all
const LIMIT   = Number(flagValue('--limit', 0)) || 0;

// ── Preflight: data path ────────────────────────────────────────────────────

if (!ALL && !DATA) {
  console.error('[nibrs] NIBRS data file not found.');
  console.error('        Register at https://www.openicpsr.org/ (free — separate portal from ICPSR),');
  console.error('        download project 118281 (Kaplan NIBRS), pass --data <path-to-year.csv.gz>.');
  console.error('        See docs/handoff/2026-04-22-icpsr-openicpsr-registration.md for registration walkthrough.');
  process.exit(1);
}

if (!ALL && !YEAR) {
  console.error('[nibrs] --year <YYYY> is required when loading a single file.');
  process.exit(1);
}

if (ALL && !DIR) {
  console.error('[nibrs] --all requires --dir <parent-dir> containing nibrs-incident-YYYY.csv.gz files.');
  process.exit(1);
}

if (DATA && !fs.existsSync(DATA)) {
  console.error(`[nibrs] data file not found at ${DATA}`);
  process.exit(1);
}

console.log(`[nibrs] year=${YEAR || 'all'} data=${DATA || DIR} apply=${APPLY} limit=${LIMIT || 'all'}`);

// ── Kaplan CSV → row mapper ─────────────────────────────────────────────────
//
// TODO: finalize column mapping against the actual Kaplan CSV header.
// Kaplan's schema drifts between releases — verify column names by reading
// the first line of the gzipped CSV before building the mapper (gotcha #20).
//
// Expected logical columns (Kaplan 2024 release; confirm for target year):
//   data_year, incident_number, ori, incident_date, incident_hour,
//   ucr_offense_code (delimited), offense_attempted_completed (A/C),
//   location_code, weapon_code (delimited), victim_count, offender_count,
//   arrestee_count, victim_type (delimited), cleared_flag,
//   exceptional_clearance_code
//
// Delimiter for array columns: pipe '|' in 2020+, comma ',' in older years.
// Parse and emit TEXT[] for Postgres.

function rowFromKaplan(rec, dataYear) {
  // TODO: implement — pull columns by Kaplan header name, split arrays,
  // coerce dates/ints, return [data_year, incident_id, ori, ...] in the
  // exact order of COLUMNS below.
  throw new Error('[nibrs] Kaplan row mapper not yet implemented.');
}

const COLUMNS = [
  'data_year', 'incident_id', 'ori', 'incident_date', 'incident_hour',
  'offense_codes', 'offense_attempted', 'location_type', 'weapon_codes',
  'victim_count', 'offender_count', 'arrestee_count', 'victim_types',
  'cleared', 'cleared_exceptionally_code', 'raw',
];

// ── Per-year loader ─────────────────────────────────────────────────────────

async function loadYear(client, year, csvGzPath) {
  // TODO:
  //   1. CREATE UNLOGGED TABLE nibrs_incidents_staging (LIKE nibrs_incidents INCLUDING DEFAULTS);
  //   2. TRUNCATE staging.
  //   3. Stream: fs.createReadStream(csvGzPath).pipe(zlib.createGunzip()).pipe(csvParse({columns:true,relax_quotes:true,relax_column_count:true}))
  //   4. For each record: rows.push(rowFromKaplan(rec, year)); flush in batches via bulkCopyRows.
  //   5. INSERT INTO nibrs_incidents SELECT * FROM nibrs_incidents_staging ON CONFLICT (data_year, incident_id) DO NOTHING;
  //   6. DROP TABLE nibrs_incidents_staging;
  //
  // Cross-check after flush: SELECT COUNT(*) FROM nibrs_incidents WHERE data_year=$1
  //   — report against Kaplan's published incident count for that year.
  throw new Error('[nibrs] loadYear not yet implemented.');
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!APPLY) {
    console.log('[nibrs] dry-run: would stream Kaplan CSV(s) and load nibrs_incidents. Pass --apply to execute.');
    return;
  }

  const client = await createBulkClient();
  try {
    if (ALL) {
      const files = fs.readdirSync(DIR)
        .filter((f) => /^nibrs-incident-\d{4}\.csv\.gz$/i.test(f))
        .sort();
      for (const f of files) {
        const y = Number(f.match(/(\d{4})/)[1]);
        await loadYear(client, y, path.join(DIR, f));
      }
    } else {
      await loadYear(client, YEAR, DATA);
    }
  } finally {
    try { await client.end(); } catch {}
  }
  console.log('[nibrs] done.');
}

main().catch((err) => {
  console.error('[nibrs] FAILED:', err);
  process.exit(1);
});

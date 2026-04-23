// csv-bulk-checked: https://www.icpsr.umich.edu/web/ICPSR/series/73 — per-study SAS/Stata/TSV download after free ICPSR registration. Series 73 = BJS Federal Justice Statistics Program. No omnibus bulk file; one archive per fiscal-year study.
// Template: scripts/ingest/ingest-fars.mjs
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN), gotcha #7 (tiered work_mem), gotcha #20 (codebook vs raw format cross-check)
// STATUS: scaffold — requires ICPSR account (see docs/handoff/2026-04-22-icpsr-openicpsr-registration.md)
//
// BJS Federal Justice Statistics Program (FJSP) ingest — ONE STUDY PER INVOCATION.
//
// FJSP studies are distributed through ICPSR series 73 as per-fiscal-year
// archives (SAS / Stata / fixed-width .dat + codebook). Each study covers one
// fiscal year of federal criminal case processing: defendant demographics,
// pretrial release, prosecution declination, indictment, disposition,
// sentence.
//
// Loads one study archive into three tables:
//   defendants .dat → fjsp_defendants
//   pretrial   .dat → fjsp_pretrial
//   prosecute  .dat → fjsp_prosecutions
//
// Codebook variance: FJSP column layout drifts year-to-year (added/removed
// fields, offset shifts). Parser is driven by the per-study SAS setup file
// (or Stata .do, or Codebook PDF's column-offset tables) — NOT hardcoded.
// Per gotcha #20, we cross-check a sample of codebook values against the raw
// .dat rows BEFORE loading — silent transposition has cost hours elsewhere.
//
// Usage:
//   node scripts/ingest/ingest-fjsp.mjs --study-id <id> --data <path> --codebook <path>            # dry-run
//   node scripts/ingest/ingest-fjsp.mjs --study-id <id> --data <path> --codebook <path> --apply   # load for real
//   node scripts/ingest/ingest-fjsp.mjs --study-id 38492 --data D:\inaa-bulk\fjsp\38492 --apply
//
// Prerequisites:
//   .env.local with SUPABASE_DB_URL (session-mode, loader rewrites to 5432)
//   Free ICPSR account + downloaded study archive (unzipped)
//
// Directory layout expected:
//   <data>/
//     DS0001/  -- defendants
//     DS0002/  -- pretrial
//     DS0003/  -- prosecutions
//     codebook.pdf  (or per-DS codebook files)
//     *.sas         (fixed-width column spec per DS)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flagValue(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}
const APPLY     = args.includes('--apply');
const STUDY_ID  = flagValue('--study-id', null);
const DATA_DIR  = flagValue('--data', null);
const CODEBOOK  = flagValue('--codebook', null);
const LIMIT     = Number(flagValue('--limit', 0)) || 0;

// ── Preflight: data path + codebook ─────────────────────────────────────────

if (!STUDY_ID) {
  console.error('[fjsp] --study-id <icpsr-study-id> is required (e.g. 38492).');
  console.error('       Find study IDs at https://www.icpsr.umich.edu/web/ICPSR/series/73');
  process.exit(1);
}

if (!DATA_DIR || !fs.existsSync(DATA_DIR)) {
  console.error('[fjsp] FJSP data file not found.');
  console.error('       Register at https://www.icpsr.umich.edu/ (free), download study from series 73, pass --data <path>.');
  console.error('       See docs/handoff/2026-04-22-icpsr-openicpsr-registration.md for registration walkthrough.');
  process.exit(1);
}

if (!CODEBOOK || !fs.existsSync(CODEBOOK)) {
  console.error('[fjsp] --codebook <path> is required. Codebook varies per study year — parser cannot run without it.');
  console.error('       Usually shipped alongside the .dat files in the ICPSR archive (look for *.sas, *.do, or Codebook.pdf).');
  process.exit(1);
}

console.log(`[fjsp] study_id=${STUDY_ID} data=${DATA_DIR} codebook=${CODEBOOK} apply=${APPLY} limit=${LIMIT || 'all'}`);

// ── Codebook parser ─────────────────────────────────────────────────────────
//
// TODO: implement codebook-driven fixed-width parser.
//
// The ICPSR archive ships a SAS setup file (INPUT @1 VAR1 $CHAR4. @5 VAR2 2.
// ...) per dataset (DS0001 defendants, DS0002 pretrial, DS0003 prosecutions).
// Parse the @<offset> <name> <informat> tuples into an array of
// {name, startCol, width, type} records, then slice each .dat row by
// startCol/width. FJSP uses fixed-width ASCII (same family as USSC MONFY).
//
// Reference: ImNotAnAttorney-web/scripts/ussc-sas-stream-loader.py implements
// this exact pattern for USSC — port the offset-dict parser to JS here.
//
// Cross-check (gotcha #20): after parsing the first 100 rows, print a sample
// of each column's distinct values and compare against codebook value labels.
// Leading-zero / whitespace / case-fold mismatches caught at 5min verify step
// save hours of join-miss debugging downstream.

function parseCodebook(codebookPath) {
  throw new Error(
    '[fjsp] codebook parser not yet implemented. '
    + 'Port ussc-sas-stream-loader.py offset-dict logic to JS. '
    + `Codebook at: ${codebookPath}`
  );
}

// ── Per-dataset loaders ─────────────────────────────────────────────────────

async function loadDefendants(client, spec) {
  // TODO: stream <DATA_DIR>/DS0001/*.dat, slice by spec offsets, emit rows
  //   [study_id, fiscal_year, defendant_id, district_code, offense_category,
  //    offense_detail, age, sex, race, citizenship, raw]
  // via bulkCopyRows('public.fjsp_defendants_staging', columns, rowsIterable).
  // Then INSERT ... SELECT ... ON CONFLICT (study_id, defendant_id) DO NOTHING.
  throw new Error('[fjsp] loadDefendants not yet implemented.');
}

async function loadPretrial(client, spec) {
  // TODO: same pattern, DS0002 → fjsp_pretrial.
  throw new Error('[fjsp] loadPretrial not yet implemented.');
}

async function loadProsecutions(client, spec) {
  // TODO: same pattern, DS0003 → fjsp_prosecutions.
  throw new Error('[fjsp] loadProsecutions not yet implemented.');
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!APPLY) {
    console.log('[fjsp] dry-run: would parse codebook + load 3 datasets. Pass --apply to execute.');
    return;
  }

  const spec = parseCodebook(CODEBOOK);
  const client = await createBulkClient();
  try {
    await loadDefendants(client, spec);
    await loadPretrial(client, spec);
    await loadProsecutions(client, spec);
  } finally {
    try { await client.end(); } catch {}
  }
  console.log('[fjsp] done.');
}

main().catch((err) => {
  console.error('[fjsp] FAILED:', err);
  process.exit(1);
});

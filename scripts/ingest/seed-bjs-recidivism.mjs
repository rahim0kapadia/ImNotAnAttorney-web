#!/usr/bin/env node
// BJS Recidivism Cohorts seeder. Bulk download + parse + COPY to Postgres.
//
// csv-bulk-checked: https://bjs.ojp.gov/data-collection/recidivism-state-prisoners
//   (per-publication ZIPs at /BJS_PUB/<pubcode>/csv/<pubcode>.zip and
//    /redirect-legacy/content/pub/sheets/<pubcode>.zip)
// Template: scripts/ingest/seed-statutes-il-ch720.mjs
// Pattern: cl-bulk-data-defensive #14 (port 5432 session mode), #17 (session
//   timeouts + tcp keepalives), #18 (COPY FROM STDIN via bulkCopyRows), #19
//   (CSV bulk download is the primary path, no API)
//
// Usage:
//   node scripts/ingest/seed-bjs-recidivism.mjs --dry-run
//   node scripts/ingest/seed-bjs-recidivism.mjs --datasets=rpr34s --limit=5 --verbose
//   node scripts/ingest/seed-bjs-recidivism.mjs                    (live; needs SUPABASE_DB_URL)
//
// Env required for live run:
//   SUPABASE_DB_URL  direct postgres connection (port 5432 forced internally)
//
// External deps:
//   unzip CLI (system-provided on macOS, Linux, Git Bash on Windows). Used to
//   extract the BJS publication ZIPs to a temp directory before reading.
//
// Datasets (see DATASETS below):
//   rpr34s   34 States in 2012, 5-Year Follow-Up (NCJ 255947)
//   rpr24s   24 States in 2008, 10-Year Follow-Up (NCJ 256094)
//
// Tables ingested per publication: t04 (arrests by demographic), t05 (arrests
// by offense), t07 (convictions by demographic, when present), t08 (returns
// to prison by demographic, when present).

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseTable } from './lib/bjs-recidivism-csv.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Env loader
const dotenvPath = path.resolve(__dirname, '../../.env.local');
try {
  const { config } = await import('dotenv');
  config({ path: dotenvPath });
} catch {
  // dotenv optional; env may be pre-set
}

// CLI parsing
function parseCliFlags(argv) {
  const flags = { dryRun: false, verbose: false, datasets: null, limit: null };
  for (const a of argv) {
    if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--verbose') flags.verbose = true;
    else if (a.startsWith('--datasets=')) {
      flags.datasets = a.slice('--datasets='.length).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a.startsWith('--limit=')) {
      flags.limit = parseInt(a.slice('--limit='.length), 10);
    }
  }
  return flags;
}

// Dataset catalog
export const DATASETS = [
  {
    code: 'rpr34s',
    pubcode: 'rpr34s125yfup1217',
    title: 'Recidivism of Prisoners Released in 34 States in 2012: A 5-Year Follow-Up Period (2012-2017)',
    ncj: 'NCJ 255947',
    cohortYear: 2012,
    zipUrl: 'https://bjs.ojp.gov/BJS_PUB/rpr34s125yfup1217/csv/rpr34s125yfup1217.zip',
    targetTables: ['t04', 't05', 't07', 't08'],
  },
  {
    code: 'rpr24s',
    pubcode: 'rpr24s0810yfup0818',
    title: 'Recidivism of Prisoners Released in 24 States in 2008: A 10-Year Follow-Up Period (2008-2018)',
    ncj: 'NCJ 256094',
    cohortYear: 2008,
    zipUrl: 'https://bjs.ojp.gov/media/64876/download',
    targetTables: ['t04', 't05', 't07', 't08'],
  },
];

async function fetchZip(url, opts = {}) {
  const { maxAttempts = 3, timeoutMs = 60000, verbose = false } = opts;
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      if (verbose) console.log('  fetch attempt ' + attempt + ': ' + url);
      const res = await fetch(url, {
        signal: ac.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; INAA-bjs-bot/1.0; https://imnotanattorney.com)',
          'Accept': 'application/zip, application/octet-stream, */*',
        },
        redirect: 'follow',
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText);
      const buf = Buffer.from(await res.arrayBuffer());
      if (verbose) console.log('  downloaded ' + buf.length + ' bytes');
      return buf;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (attempt < maxAttempts) {
        const delay = 2000 * attempt;
        if (verbose) console.log('  retry in ' + delay + 'ms (' + e.message + ')');
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw new Error('fetch failed after ' + maxAttempts + ' attempts: ' + (lastErr ? lastErr.message : 'unknown'));
}

function extractZipToTemp(zipBuffer, code) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bjs-' + code + '-'));
  const zipPath = path.join(tmpRoot, code + '.zip');
  fs.writeFileSync(zipPath, zipBuffer);
  execFileSync('unzip', ['-o', zipPath, '-d', tmpRoot], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const entries = [];
  for (const f of fs.readdirSync(tmpRoot)) {
    if (!/\.csv$/i.test(f)) continue;
    const full = path.join(tmpRoot, f);
    const text = fs.readFileSync(full, 'utf-8');
    entries.push({ name: f, text });
  }
  return { entries, tmpRoot };
}

function filterTargetCsvs(entries, dataset) {
  const out = [];
  for (const e of entries) {
    const base = path.basename(e.name).toLowerCase();
    for (const t of dataset.targetTables) {
      if (base === (dataset.pubcode + t + '.csv').toLowerCase()) {
        out.push(e);
        break;
      }
    }
  }
  return out;
}

async function processDataset(ds, opts) {
  const rows = [];
  const events = [];
  if (opts.verbose) console.log('Dataset: ' + ds.code + '  (' + ds.title + ')');
  const zipBuf = await fetchZip(ds.zipUrl, { verbose: opts.verbose });
  const { entries: allCsvs, tmpRoot } = extractZipToTemp(zipBuf, ds.code);
  if (opts.verbose) console.log('  ' + allCsvs.length + ' CSVs in archive (extracted to ' + tmpRoot + ')');
  const targetCsvs = filterTargetCsvs(allCsvs, ds);
  if (opts.verbose) console.log('  ' + targetCsvs.length + ' target CSVs match ' + ds.targetTables.join(','));
  for (const e of targetCsvs) {
    const result = parseTable(e.text, {
      sourceUrl: ds.zipUrl,
      sourceDatasetName: ds.title + ' (' + ds.ncj + ') / ' + e.name,
      defaultCohortYear: ds.cohortYear,
    });
    if (result.skipReason) {
      events.push({ csv: e.name, status: 'skipped', reason: result.skipReason });
      if (opts.verbose) console.log('    ' + e.name + ': SKIP (' + result.skipReason + ')');
      continue;
    }
    events.push({ csv: e.name, status: 'parsed', rows: result.rows.length, outcome: result.outcome });
    if (opts.verbose) console.log('    ' + e.name + ': ' + result.rows.length + ' rows (' + result.outcome + ', cohort ' + result.cohortYear + ')');
    for (const r of result.rows) rows.push(r);
  }
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  return { rows, events };
}

function dedupRows(rows) {
  const seen = new Map();
  const out = [];
  for (const r of rows) {
    const key = [
      r.cohort_release_year,
      r.state || '__national__',
      r.offense_category,
      r.offense_subcategory || '__none__',
      r.follow_up_years,
      r.outcome_type,
      r.demographic_segment,
    ].join('|');
    if (seen.has(key)) continue;
    seen.set(key, true);
    out.push(r);
  }
  return out;
}

// COPY rows to Postgres. Uses a UNIQUELY-NAMED regular staging table (not
// TEMP) because pg-copy-streams may not preserve session-scoped state across
// the COPY substream on some pooler configurations. We DROP the staging
// table at the end of the function.
async function copyRowsToDb(rows, opts) {
  const { createBulkClient, bulkCopyRows } = await import('../lib/pg-bulk-defaults.mjs');
  const { client, cleanup } = await createBulkClient();
  const stage = 'bjs_recidivism_stage_' + crypto.randomBytes(4).toString('hex');
  try {
    await client.query(`
      CREATE TABLE ${stage} (
        cohort_release_year integer,
        state text,
        offense_category text,
        offense_subcategory text,
        follow_up_years integer,
        outcome_type text,
        cohort_size integer,
        outcome_count integer,
        outcome_rate_pct numeric(5,2),
        demographic_segment text,
        source_url text,
        source_dataset_name text,
        notes text
      )
    `);
    const cols = [
      'cohort_release_year', 'state', 'offense_category', 'offense_subcategory',
      'follow_up_years', 'outcome_type', 'cohort_size', 'outcome_count',
      'outcome_rate_pct', 'demographic_segment', 'source_url',
      'source_dataset_name', 'notes',
    ];
    async function* rowIter() {
      for (const r of rows) {
        yield [
          r.cohort_release_year, r.state, r.offense_category, r.offense_subcategory,
          r.follow_up_years, r.outcome_type, r.cohort_size, r.outcome_count,
          r.outcome_rate_pct, r.demographic_segment, r.source_url,
          r.source_dataset_name, r.notes,
        ];
      }
    }
    const copyResult = await bulkCopyRows(client, stage, cols, rowIter());
    if (opts.verbose) console.log('  staged ' + copyResult.rowCount + ' rows into ' + stage + ' in ' + copyResult.durationMs + 'ms');
    const insertSql = `
      INSERT INTO bjs_recidivism_cohorts (
        cohort_release_year, state, offense_category, offense_subcategory,
        follow_up_years, outcome_type, cohort_size, outcome_count,
        outcome_rate_pct, demographic_segment, source_url,
        source_dataset_name, notes
      )
      SELECT
        cohort_release_year, state, offense_category, offense_subcategory,
        follow_up_years, outcome_type, cohort_size, outcome_count,
        outcome_rate_pct, demographic_segment, source_url,
        source_dataset_name, notes
      FROM ${stage}
      ON CONFLICT (
        cohort_release_year,
        COALESCE(state, '__national__'),
        offense_category,
        COALESCE(offense_subcategory, '__none__'),
        follow_up_years,
        outcome_type,
        demographic_segment
      ) DO UPDATE SET
        cohort_size = EXCLUDED.cohort_size,
        outcome_count = EXCLUDED.outcome_count,
        outcome_rate_pct = EXCLUDED.outcome_rate_pct,
        source_url = EXCLUDED.source_url,
        source_dataset_name = EXCLUDED.source_dataset_name,
        notes = EXCLUDED.notes
    `;
    const r = await client.query(insertSql);
    if (opts.verbose) console.log('  upserted into bjs_recidivism_cohorts: ' + (r.rowCount || 0));
    return { upserted: r.rowCount || 0, copied: copyResult.rowCount };
  } finally {
    try { await client.query('DROP TABLE IF EXISTS ' + stage); } catch (e) { /* ignore */ }
    await cleanup();
  }
}

export async function main(argv = process.argv.slice(2)) {
  const flags = parseCliFlags(argv);
  const targetCodes = flags.datasets;
  let datasets = DATASETS;
  if (targetCodes && targetCodes.length > 0) {
    datasets = DATASETS.filter((d) => targetCodes.includes(d.code));
  }
  if (datasets.length === 0) {
    console.error('No datasets matched filter: ' + (targetCodes || []).join(','));
    console.error('Known: ' + DATASETS.map((d) => d.code).join(', '));
    process.exit(1);
  }
  console.log('BJS Recidivism Cohorts ingest');
  console.log('  datasets: ' + datasets.map((d) => d.code).join(', '));
  console.log('  dry-run: ' + flags.dryRun);
  console.log('  verbose: ' + flags.verbose);
  if (flags.limit) console.log('  limit per dataset: ' + flags.limit);

  let allRows = [];
  const allEvents = [];
  for (const ds of datasets) {
    const { rows, events } = await processDataset(ds, flags);
    let dsRows = rows;
    if (flags.limit) dsRows = dsRows.slice(0, flags.limit);
    allRows = allRows.concat(dsRows);
    allEvents.push({ dataset: ds.code, events });
  }
  allRows = dedupRows(allRows);
  console.log('Total parsed rows (deduped): ' + allRows.length);

  if (flags.dryRun) {
    console.log('DRY RUN: no DB writes.');
    if (flags.verbose && allRows.length > 0) {
      console.log('Sample row: ' + JSON.stringify(allRows[0], null, 2));
    }
    return { rows: allRows.length, events: allEvents, dryRun: true };
  }

  if (allRows.length === 0) {
    console.log('No rows to write.');
    return { rows: 0, events: allEvents };
  }
  const { upserted } = await copyRowsToDb(allRows, flags);
  console.log('Upserted ' + upserted + ' rows into bjs_recidivism_cohorts.');
  return { rows: allRows.length, upserted, events: allEvents };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error('FATAL: ' + (e.stack || e.message));
    process.exit(1);
  });
}

#!/usr/bin/env node
// csv-bulk-checked: https://openpolicing.stanford.edu/data/ — bulk CSV zips per agency.
// Template: scripts/cl-bulk-loader.mjs (COPY FROM STDIN PG-native path)
// Expert: lukas-fittl (COPY > INSERT for bulk, per ~/.claude/experts/lukas-fittl.md)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN), pattern_resumable_bulk_load_two_phase
//          (Phase-1 COPY to stage; Phase-2 INSERT SELECT — both safely under pooler timeout)
//
// Stanford OPP ingest — V2 COPY-STRAIGHT-THROUGH edition.
//
// v1 bottleneck: Node csv-parse + per-row csvEscape capped at ~3K rows/s on Windows,
// making TX (7.23 GB, ~20M rows) a 2h+ run. This version moves row-level work to
// Postgres's C-native COPY parser (80-150 MB/s text parse) — TX Phase-1 COPY in
// ~1-3 min, Phase-2 SQL-side INSERT SELECT in ~5-15 min. ~10-20× end-to-end.
//
// Plan: C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-22-opp-copy-straight-through.md
//
// Usage:
//   node scripts/ingest/ingest-openpolicing-copy.mjs --agency ca_statewide --apply
//   node scripts/ingest/ingest-openpolicing-copy.mjs --agency ca_statewide --apply --limit 100000
//
// ANTI-OOM: Single agency per invocation. Lock file shared with v1 (any OPP load
// blocks any other OPP load).

import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { parse as csvParse } from 'csv-parse';
import pg from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import { createBulkClient } from '../lib/pg-bulk-defaults.mjs';

// ── CLI ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function argVal(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}
const AGENCY    = argVal('--agency');
const APPLY     = args.includes('--apply');
const BULK_DIR  = argVal('--dir') || 'D:\\inaa-bulk\\openpolicing';
const LIMIT_RAW = argVal('--limit');
const ROW_LIMIT = LIMIT_RAW ? parseInt(LIMIT_RAW, 10) : null;

if (!AGENCY) {
  console.error('ERROR: --agency required (e.g. ca_statewide).');
  process.exit(2);
}

// ── Agency manifest (same as v1) ───────────────────────────────────────────

const AGENCIES = {
  tx_statewide: { druid: 'yg821jf8611', state_code: 'TX', city: null, url: 'https://stacks.stanford.edu/file/druid:yg821jf8611/yg821jf8611_tx_statewide_2020_04_01.csv.zip' },
  ca_statewide: { druid: 'wb225bk3255', state_code: 'CA', city: null, url: 'https://stacks.stanford.edu/file/druid:wb225bk3255/wb225bk3255_ca_statewide_2023_01_26.csv.zip' },
  nc_statewide: { druid: 'yg821jf8611', state_code: 'NC', city: null, url: 'https://stacks.stanford.edu/file/druid:yg821jf8611/yg821jf8611_nc_statewide_2020_04_01.csv.zip' },
  fl_statewide: { druid: 'yg821jf8611', state_code: 'FL', city: null, url: 'https://stacks.stanford.edu/file/druid:yg821jf8611/yg821jf8611_fl_statewide_2020_04_01.csv.zip' },
  az_statewide: { druid: 'yg821jf8611', state_code: 'AZ', city: null, url: 'https://stacks.stanford.edu/file/druid:yg821jf8611/yg821jf8611_az_statewide_2020_04_01.csv.zip' },
  wa_statewide: { druid: 'yg821jf8611', state_code: 'WA', city: null, url: 'https://stacks.stanford.edu/file/druid:yg821jf8611/yg821jf8611_wa_statewide_2020_04_01.csv.zip' },
  oh_statewide: { druid: 'yg821jf8611', state_code: 'OH', city: null, url: 'https://stacks.stanford.edu/file/druid:yg821jf8611/yg821jf8611_oh_statewide_2020_04_01.csv.zip' },
};

function manifestFor(slug) {
  const m = AGENCIES[slug];
  if (!m) {
    console.error(`ERROR: unknown agency '${slug}'. Known: ${Object.keys(AGENCIES).join(', ')}`);
    process.exit(2);
  }
  return m;
}

// ── Shared anti-concurrent lock (same path as v1) ──────────────────────────

const LOCK_PATH = path.join(BULK_DIR, '.ingest-openpolicing.lock');
function acquireLock() {
  fs.mkdirSync(BULK_DIR, { recursive: true });
  try {
    const fd = fs.openSync(LOCK_PATH, 'wx');
    fs.writeSync(fd, JSON.stringify({ agency: AGENCY, pid: process.pid, startedAt: new Date().toISOString(), variant: 'copy' }));
    fs.closeSync(fd);
  } catch (err) {
    if (err.code === 'EEXIST') {
      const body = fs.readFileSync(LOCK_PATH, 'utf8');
      console.error(`ERROR: OPP ingest already running.\n  ${LOCK_PATH}\n  ${body}`);
      process.exit(3);
    }
    throw err;
  }
}
function releaseLock() { try { fs.unlinkSync(LOCK_PATH); } catch {} }

// ── Download + extract (same as v1) ────────────────────────────────────────

async function downloadIfMissing(url, destZip) {
  if (fs.existsSync(destZip) && fs.statSync(destZip).size > 0) {
    console.log(`  cache hit: ${destZip}`);
    return;
  }
  console.log(`  downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}: ${url}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(destZip));
  console.log(`  saved ${(fs.statSync(destZip).size / 1e6).toFixed(1)} MB`);
}

function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const psCmd =
    `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' ` +
    `-DestinationPath '${destDir.replace(/'/g, "''")}' -Force`;
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', psCmd], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (r.status !== 0) throw new Error(`Expand-Archive failed (exit ${r.status}) on ${zipPath}`);
}

function findCsvIn(dir) {
  const entries = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.csv'));
  if (entries.length === 0) throw new Error(`no .csv found under ${dir}`);
  let best = null, bestSize = -1;
  for (const name of entries) {
    const full = path.join(dir, name);
    const sz = fs.statSync(full).size;
    if (sz > bestSize) { best = full; bestSize = sz; }
  }
  return best;
}

// ── Header alias map (same as v1) ──────────────────────────────────────────
// For each target output column, list the CSV header names (lowercased) that
// map to it, in priority order (first match wins in COALESCE).

const HEADER_ALIASES = {
  stop_date:          ['date', 'stop_date'],
  stop_time:          ['time', 'stop_time'],
  subject_race:       ['subject_race', 'driver_race'],
  subject_sex:        ['subject_sex', 'driver_sex', 'driver_gender'],
  subject_age:        ['subject_age', 'driver_age'],
  officer_id:         ['officer_id', 'officer_id_hash', 'officer_badge_number'],
  officer_race:       ['officer_race'],
  officer_sex:        ['officer_sex', 'officer_gender'],
  stop_type:          ['type'],
  violation:          ['violation'],
  arrest_made:        ['arrest_made'],
  citation_issued:    ['citation_issued'],
  warning_issued:     ['warning_issued'],
  outcome:            ['outcome'],
  search_conducted:   ['search_conducted'],
  search_person:      ['search_person'],
  search_vehicle:     ['search_vehicle'],
  contraband_found:   ['contraband_found'],
  contraband_drugs:   ['contraband_drugs'],
  contraband_weapons: ['contraband_weapons'],
  frisk_performed:    ['frisk_performed'],
  reason_for_stop:    ['reason_for_stop'],
  reason_for_search:  ['reason_for_search'],
  location_lat:       ['lat'],
  location_lng:       ['lng', 'lon'],
  district:           ['district', 'precinct', 'region', 'beat'],
  county_name:        ['county_name', 'county'],
};

// Columns whose SQL-side cast pattern differs. Everything NOT here is treated
// as TEXT-with-NA-null (via nullifText()).
const TYPE_MAP = {
  stop_date:          'date',
  stop_time:          'time',
  subject_age:        'smallint',
  subject_sex:        'sex',
  officer_sex:        'sex',
  arrest_made:        'bool',
  citation_issued:    'bool',
  warning_issued:     'bool',
  search_conducted:   'bool',
  search_person:      'bool',
  search_vehicle:     'bool',
  contraband_found:   'bool',
  contraband_drugs:   'bool',
  contraband_weapons: 'bool',
  frisk_performed:    'bool',
  location_lat:       'float',
  location_lng:       'float',
};

// Output column order must match police_stops table.
const OUT_COLS = [
  'agency', 'state_code', 'city',
  'stop_date', 'stop_time',
  'subject_race', 'subject_sex', 'subject_age',
  'officer_id', 'officer_race', 'officer_sex',
  'stop_type', 'violation',
  'arrest_made', 'citation_issued', 'warning_issued', 'outcome',
  'search_conducted', 'search_person', 'search_vehicle',
  'contraband_found', 'contraband_drugs', 'contraband_weapons',
  'frisk_performed', 'reason_for_stop', 'reason_for_search',
  'location_lat', 'location_lng', 'district', 'county_name',
  'source_druid',
];

// ── Header sniff ───────────────────────────────────────────────────────────
// Read only the first row of the CSV (using csv-parse with to_line:1) to get
// the exact list of headers that actually appear in the file. Powers dynamic
// stage CREATE + SQL-side COALESCE mapping.

async function sniffHeaders(csvPath) {
  const parser = fs.createReadStream(csvPath).pipe(csvParse({
    columns: false,
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
    to_line: 1,
  }));
  for await (const row of parser) {
    return row.map((h) => String(h).trim());
  }
  throw new Error('empty CSV — no header row found');
}

// ── SQL generators ─────────────────────────────────────────────────────────
// quoteIdent doubles embedded double-quotes; SQL identifier quoting.
function quoteIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

// Given a target column and the set of CSV headers actually present (lowercased),
// return the SQL expression that extracts + coerces the value. NULL if no
// alias is present — caller can emit "NULL" placeholder.
function sqlForTarget(target, csvHeadersLower) {
  const aliases = HEADER_ALIASES[target] || [];
  const present = aliases.filter((a) => csvHeadersLower.has(a));
  if (present.length === 0) return 'NULL';

  // Each alias becomes NULLIF(NULLIF(trim("col"), ''), 'NA'). We trim
  // server-side so 'NA'/'' → NULL regardless of surrounding whitespace.
  const nullified = present.map((a) => {
    const col = quoteIdent(csvHeadersLower.get(a));  // preserve original case
    return `NULLIF(NULLIF(btrim(${col}), ''), 'NA')`;
  });
  const base = nullified.length === 1 ? nullified[0] : `COALESCE(${nullified.join(', ')})`;

  const ctype = TYPE_MAP[target] || 'text';
  switch (ctype) {
    case 'date':
      return `(${base})::date`;
    case 'time':
      // Pad 'HH:MM' → 'HH:MM:00' server-side.
      return `(CASE WHEN length(${base}) = 5 THEN ${base} || ':00' ELSE ${base} END)::time`;
    case 'smallint':
      // OPP age fields occasionally have '.0' decimal suffix; strip.
      return `NULLIF(split_part(${base}, '.', 1), '')::smallint`;
    case 'float':
      return `(${base})::double precision`;
    case 'sex':
      return `UPPER(LEFT(${base}, 1))`;
    case 'bool':
      return `CASE lower(${base})
        WHEN 'true' THEN true WHEN 't' THEN true WHEN '1' THEN true WHEN 'yes' THEN true
        WHEN 'false' THEN false WHEN 'f' THEN false WHEN '0' THEN false WHEN 'no' THEN false
        ELSE NULL END`;
    case 'text':
    default:
      return base;
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const manifest = manifestFor(AGENCY);
  console.log(`=== OPP INGEST (COPY-straight-through) — agency=${AGENCY} apply=${APPLY} ===`);
  console.log(`  druid=${manifest.druid} state=${manifest.state_code}`);
  console.log(`  url=${manifest.url}`);

  acquireLock();
  try {
    // 1) download + extract (cache-compatible with v1)
    const zipPath   = path.join(BULK_DIR, `${AGENCY}.csv.zip`);
    const extractTo = path.join(BULK_DIR, `${AGENCY}.d`);
    await downloadIfMissing(manifest.url, zipPath);
    if (!fs.existsSync(extractTo) || fs.readdirSync(extractTo).length === 0) {
      console.log(`  extracting → ${extractTo}`);
      extractZip(zipPath, extractTo);
    } else {
      console.log(`  extract cache hit: ${extractTo}`);
    }
    const csvPath = findCsvIn(extractTo);
    console.log(`  csv: ${csvPath} (${(fs.statSync(csvPath).size / 1e9).toFixed(2)} GB)`);

    // 2) header sniff
    const rawHeaders = await sniffHeaders(csvPath);
    console.log(`  csv has ${rawHeaders.length} columns`);
    const headersLower = new Map(rawHeaders.map((h) => [h.toLowerCase(), h]));

    // Summarize which target columns will be populated vs NULL.
    const hits = [], misses = [];
    for (const t of OUT_COLS) {
      if (['agency', 'state_code', 'city', 'source_druid'].includes(t)) continue;
      const als = HEADER_ALIASES[t] || [];
      const present = als.filter((a) => headersLower.has(a));
      if (present.length) hits.push(`${t}<-${present[0]}`);
      else if (als.length) misses.push(t);
    }
    console.log(`  mapped: ${hits.length} targets; unmapped (will be NULL): ${misses.join(', ') || 'none'}`);

    if (!APPLY) {
      console.log('  dry-run mode — run with --apply to perform COPY + INSERT');
      return;
    }

    // 3) connect, dynamic stage, COPY, INSERT SELECT
    const { client, cleanup } = await createBulkClient({ statementTimeout: '6h' });
    try {
      const stageTbl = `_stage_police_stops_${AGENCY}_copy`;

      console.log(`  (re)creating UNLOGGED stage: ${stageTbl}`);
      await client.query(`DROP TABLE IF EXISTS public.${quoteIdent(stageTbl).replace(/"/g, '')}`);
      const stageCols = rawHeaders.map((h) => `${quoteIdent(h)} TEXT`).join(', ');
      await client.query(`CREATE UNLOGGED TABLE public.${stageTbl} (${stageCols})`);

      // 4) COPY raw CSV bytes into stage — PG parses, not Node.
      console.log('  Phase 1: streaming raw CSV → COPY FROM STDIN (PG-native parse)...');
      const t1 = Date.now();
      const copySql = `COPY public.${stageTbl} FROM STDIN WITH (FORMAT CSV, HEADER TRUE, NULL '')`;
      const copyStream = client.query(copyFrom(copySql));
      const fileStream = fs.createReadStream(csvPath);
      await pipeline(fileStream, copyStream);
      const t2 = Date.now();
      const stagedCount = copyStream.rowCount ?? null;
      console.log(`  Phase 1 done: ${stagedCount?.toLocaleString() ?? '?'} rows in ${((t2 - t1) / 1000).toFixed(1)}s`);

      if (ROW_LIMIT && stagedCount && stagedCount > ROW_LIMIT) {
        await client.query(`DELETE FROM public.${stageTbl} WHERE ctid IN (SELECT ctid FROM public.${stageTbl} OFFSET $1)`, [ROW_LIMIT]);
        console.log(`  trimmed to --limit ${ROW_LIMIT}`);
      }

      // 5) INSERT INTO police_stops with SQL-side column mapping.
      console.log('  Phase 2: INSERT INTO police_stops SELECT ... (SQL-side coerce)...');
      const t3 = Date.now();
      const selectExprs = OUT_COLS.map((t) => {
        if (t === 'agency')       return `$1::text`;
        if (t === 'state_code')   return `$2::char(2)`;
        if (t === 'city')         return `$3::text`;
        if (t === 'source_druid') return `$4::text`;
        return `${sqlForTarget(t, headersLower)} AS ${quoteIdent(t)}`;
      }).join(',\n        ');
      const insSql = `
        INSERT INTO public.police_stops (${OUT_COLS.map(quoteIdent).join(', ')})
        SELECT
        ${selectExprs}
        FROM public.${stageTbl}
      `;
      const ins = await client.query(insSql, [AGENCY, manifest.state_code, manifest.city, manifest.druid]);
      const t4 = Date.now();
      console.log(`  Phase 2 done: ${ins.rowCount?.toLocaleString() ?? '?'} rows in ${((t4 - t3) / 1000).toFixed(1)}s`);

      // 6) drop stage
      await client.query(`DROP TABLE public.${stageTbl}`);
      console.log('  stage dropped.');

      // 7) refresh matview
      console.log('  REFRESH MATERIALIZED VIEW CONCURRENTLY public.officer_stop_patterns ...');
      try {
        await client.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY public.officer_stop_patterns`);
        console.log('  refresh ok.');
      } catch (e) {
        console.warn(`  refresh skipped (${e.code || '?'}): ${e.message}`);
      }

      const total = (t4 - t1) / 1000;
      console.log(`  total DB wall time: ${total.toFixed(1)}s`);
    } finally {
      await cleanup();
    }

    console.log('Done.');
  } finally {
    releaseLock();
  }
}

main().catch((err) => { releaseLock(); console.error('FATAL:', err); process.exit(1); });

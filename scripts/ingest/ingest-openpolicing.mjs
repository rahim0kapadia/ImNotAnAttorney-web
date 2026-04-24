#!/usr/bin/env node
// csv-bulk-checked: https://openpolicing.stanford.edu/data/ — bulk CSV zips per agency under stacks.stanford.edu/file/druid:<id>/.
// Template: scripts/ingest-virginia-court-data.mjs
// Expert: kevin-indig (data moat framework)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN), gotcha #1 (csv-parse relax_quotes)
//
// Stanford Open Policing Project ingest — ONE AGENCY PER INVOCATION.
//
// ~200M traffic stops across 21 state patrols + 29 municipal PDs. License: ODC-By 1.0.
// Each agency dataset ships as a single CSV inside a zip under
//   https://stacks.stanford.edu/file/druid:<druid>/<druid>_<agency>.csv.zip
// or similar. The DRUID is the stable Stanford Digital Repository id.
//
// Usage:
//   node scripts/ingest/ingest-openpolicing.mjs --agency tx_statewide
//   node scripts/ingest/ingest-openpolicing.mjs --agency tx_statewide --apply
//   node scripts/ingest/ingest-openpolicing.mjs --agency tx_statewide --dir D:\inaa-bulk\openpolicing --limit 500000
//
// ANTI-OOM: Single agency per invocation. Never run two concurrently (Windows
// Node streamers cause OOM cascade — see cl-bulk-data-defensive.md gotcha
// "concurrent CSV streamers OOM"). Script refuses to continue if a sibling
// lock file is present.

import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse as csvParse } from 'csv-parse';
import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

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
const ROW_LIMIT = LIMIT_RAW ? parseInt(LIMIT_RAW, 10) : Infinity;
const BATCH     = 10_000;

if (!AGENCY) {
  console.error('ERROR: --agency required (e.g. tx_statewide). Use one agency per run.');
  process.exit(2);
}
// Whitelist regex defense (C5 security finding) — agency name flows into
// template-string SQL identifiers (`_stage_police_stops_${AGENCY}`). Reject
// anything that isn't a lowercase-letters/digits/underscore slug before any
// interpolation happens.
if (!/^[a-z0-9_]+$/.test(AGENCY)) {
  console.error(`ERROR: --agency '${AGENCY}' rejected (must match /^[a-z0-9_]+$/)`);
  process.exit(2);
}

// ── Agency manifest (top 10 by volume, per plan) ───────────────────────────
// DRUIDs verified from https://openpolicing.stanford.edu/data/.
// Where unverified at build time, the value is `'TODO'` — the script will
// refuse to run for that agency until the DRUID is filled in.
//
// To fetch a missing DRUID: open the agency's page on openpolicing.stanford.edu
// and read the "Download data" link; the stacks.stanford.edu URL embeds it.

// URLs verified against https://openpolicing.stanford.edu/data/ on 2026-04-22.
// Statewide ZIP suffix is a release date (not an ingest date) — must be exact.
const AGENCIES = {
  tx_statewide: { druid: 'yg821jf8611', state_code: 'TX', city: null, url: 'https://stacks.stanford.edu/file/druid:yg821jf8611/yg821jf8611_tx_statewide_2020_04_01.csv.zip' },
  ca_statewide: { druid: 'wb225bk3255', state_code: 'CA', city: null, url: 'https://stacks.stanford.edu/file/druid:wb225bk3255/wb225bk3255_ca_statewide_2023_01_26.csv.zip' },
  nc_statewide: { druid: 'yg821jf8611', state_code: 'NC', city: null, url: 'https://stacks.stanford.edu/file/druid:yg821jf8611/yg821jf8611_nc_statewide_2020_04_01.csv.zip' },
  fl_statewide: { druid: 'yg821jf8611', state_code: 'FL', city: null, url: 'https://stacks.stanford.edu/file/druid:yg821jf8611/yg821jf8611_fl_statewide_2020_04_01.csv.zip' },
  az_statewide: { druid: 'yg821jf8611', state_code: 'AZ', city: null, url: 'https://stacks.stanford.edu/file/druid:yg821jf8611/yg821jf8611_az_statewide_2020_04_01.csv.zip' },
  wa_statewide: { druid: 'yg821jf8611', state_code: 'WA', city: null, url: 'https://stacks.stanford.edu/file/druid:yg821jf8611/yg821jf8611_wa_statewide_2020_04_01.csv.zip' },
  oh_statewide: { druid: 'yg821jf8611', state_code: 'OH', city: null, url: 'https://stacks.stanford.edu/file/druid:yg821jf8611/yg821jf8611_oh_statewide_2020_04_01.csv.zip' },
  il_statewide: { druid: 'yg821jf8611', state_code: 'IL', city: null, url: 'https://stacks.stanford.edu/file/druid:yg821jf8611/yg821jf8611_il_statewide_2020_04_01.csv.zip' },
  co_statewide: { druid: 'yg821jf8611', state_code: 'CO', city: null, url: 'https://stacks.stanford.edu/file/druid:yg821jf8611/yg821jf8611_co_statewide_2020_04_01.csv.zip' },
  wi_statewide: { druid: 'yg821jf8611', state_code: 'WI', city: null, url: 'https://stacks.stanford.edu/file/druid:yg821jf8611/yg821jf8611_wi_statewide_2020_04_01.csv.zip' },
};

function manifestFor(slug) {
  const m = AGENCIES[slug];
  if (!m) {
    console.error(`ERROR: unknown agency '${slug}'. Known: ${Object.keys(AGENCIES).join(', ')}`);
    process.exit(2);
  }
  if (m.druid === 'TODO') {
    console.error(
      `ERROR: DRUID for '${slug}' is TODO — fetch from https://openpolicing.stanford.edu/data/ ` +
      `and patch the AGENCIES manifest in this script before ingesting.`
    );
    process.exit(2);
  }
  const url = m.url || `https://stacks.stanford.edu/file/druid:${m.druid}/${m.druid}_${slug}.csv.zip`;
  return { ...m, url };
}

// ── Anti-concurrent-streamer lock ──────────────────────────────────────────

const LOCK_PATH = path.join(BULK_DIR, '.ingest-openpolicing.lock');
function acquireLock() {
  fs.mkdirSync(BULK_DIR, { recursive: true });
  try {
    const fd = fs.openSync(LOCK_PATH, 'wx');
    fs.writeSync(fd, JSON.stringify({ agency: AGENCY, pid: process.pid, startedAt: new Date().toISOString() }));
    fs.closeSync(fd);
  } catch (err) {
    if (err.code === 'EEXIST') {
      const body = fs.readFileSync(LOCK_PATH, 'utf8');
      console.error(
        'ERROR: another OPP ingest appears to be running (lock present).\n' +
        `  ${LOCK_PATH}\n  ${body}\n` +
        'If that run is dead, delete the lock and retry. Never run two concurrently (OOM).'
      );
      process.exit(3);
    }
    throw err;
  }
}
function releaseLock() { try { fs.unlinkSync(LOCK_PATH); } catch {} }

// ── Download + extract ─────────────────────────────────────────────────────

async function downloadIfMissing(url, destZip) {
  // Stale-cache guard: statewide OPP zips are 100MB+; anything < 1MB is almost
  // certainly a 404 HTML body or partial-download crud from a prior run. Treat
  // as cache miss and redownload so we don't ship a bogus extraction.
  const MIN_ZIP_BYTES = 1_000_000;
  if (fs.existsSync(destZip) && fs.statSync(destZip).size >= MIN_ZIP_BYTES) {
    console.log(`  cache hit: ${destZip}`);
    return;
  }
  if (fs.existsSync(destZip) && fs.statSync(destZip).size < MIN_ZIP_BYTES) {
    console.log(`  cache rejected (<1MB, likely 404 body): ${destZip} — redownloading`);
    try { fs.unlinkSync(destZip); } catch {}
  }
  console.log(`  downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}: ${url}`);
  const ws = fs.createWriteStream(destZip);
  await pipeline(Readable.fromWeb(res.body), ws);
  console.log(`  saved ${(fs.statSync(destZip).size / 1e6).toFixed(1)} MB`);
}

function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  // Shell to PowerShell Expand-Archive (present on every Windows 10+ host, zero npm dep).
  // `-Force` overwrites; single-quoted paths because PowerShell parses `-` as operator otherwise.
  const psCmd =
    `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' ` +
    `-DestinationPath '${destDir.replace(/'/g, "''")}' -Force`;
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', psCmd], {
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  });
  if (r.status !== 0) throw new Error(`Expand-Archive failed (exit ${r.status}) on ${zipPath}`);
}

function findCsvIn(dir) {
  const entries = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.csv'));
  if (entries.length === 0) throw new Error(`no .csv found under ${dir}`);
  // Pick the largest — OPP packages sometimes include small README CSVs.
  let best = null, bestSize = -1;
  for (const name of entries) {
    const full = path.join(dir, name);
    const sz = fs.statSync(full).size;
    if (sz > bestSize) { best = full; bestSize = sz; }
  }
  return best;
}

// ── Header mapping (old + new OPP schemas) ─────────────────────────────────
// OPP normalized their schema in 2020; older files use `driver_*`, newer use
// `subject_*`. Both map to the same output columns.

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

function resolveHeader(sampleRow) {
  const keys = Object.keys(sampleRow);
  const lower = new Map(keys.map((k) => [k.toLowerCase(), k]));
  const out = {};
  for (const [target, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const a of aliases) {
      const hit = lower.get(a.toLowerCase());
      if (hit !== undefined) { out[target] = hit; break; }
    }
  }
  return out;
}

// ── Value coercers ─────────────────────────────────────────────────────────

function asBool(v) {
  if (v === null || v === undefined || v === '' || v === 'NA') return null;
  const s = String(v).toLowerCase();
  if (s === 'true' || s === 't' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === 'f' || s === '0' || s === 'no') return false;
  return null;
}
function asSex(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  if (s.startsWith('m')) return 'M';
  if (s.startsWith('f')) return 'F';
  return null;
}
function asInt(v) {
  if (v === null || v === undefined || v === '' || v === 'NA') return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}
function asFloat(v) {
  if (v === null || v === undefined || v === '' || v === 'NA') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
function asStr(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' || s === 'NA' ? null : s;
}
function asDate(v) {
  const s = asStr(v);
  if (!s) return null;
  // OPP uses YYYY-MM-DD. Let Postgres coerce via CSV column type on the stage.
  return s;
}
function asTime(v) {
  const s = asStr(v);
  if (!s) return null;
  // OPP uses HH:MM or HH:MM:SS.
  return s.length === 5 ? s + ':00' : s;
}

// ── Output column order (MUST match INSERT below) ──────────────────────────

const COLS = [
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

function buildRow(raw, hdr, manifest) {
  return [
    AGENCY,
    manifest.state_code,
    manifest.city,
    asDate(raw[hdr.stop_date]),
    asTime(raw[hdr.stop_time]),
    asStr(raw[hdr.subject_race]),
    asSex(raw[hdr.subject_sex]),
    asInt(raw[hdr.subject_age]),
    asStr(raw[hdr.officer_id]),
    asStr(raw[hdr.officer_race]),
    asSex(raw[hdr.officer_sex]),
    asStr(raw[hdr.stop_type]),
    asStr(raw[hdr.violation]),
    asBool(raw[hdr.arrest_made]),
    asBool(raw[hdr.citation_issued]),
    asBool(raw[hdr.warning_issued]),
    asStr(raw[hdr.outcome]),
    asBool(raw[hdr.search_conducted]),
    asBool(raw[hdr.search_person]),
    asBool(raw[hdr.search_vehicle]),
    asBool(raw[hdr.contraband_found]),
    asBool(raw[hdr.contraband_drugs]),
    asBool(raw[hdr.contraband_weapons]),
    asBool(raw[hdr.frisk_performed]),
    asStr(raw[hdr.reason_for_stop]),
    asStr(raw[hdr.reason_for_search]),
    asFloat(raw[hdr.location_lat]),
    asFloat(raw[hdr.location_lng]),
    asStr(raw[hdr.district]),
    asStr(raw[hdr.county_name]),
    manifest.druid,
  ];
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`=== OPP INGEST — agency=${AGENCY} apply=${APPLY} limit=${ROW_LIMIT} ===`);
  const manifest = manifestFor(AGENCY);
  console.log(`  druid=${manifest.druid} state=${manifest.state_code} url=${manifest.url}`);

  acquireLock();
  try {
    // 1) download + extract
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

    if (!APPLY) {
      console.log('  dry-run: sampling first 5 rows for header detection...');
      const parser = fs.createReadStream(csvPath).pipe(csvParse({
        columns: true, relax_quotes: true, relax_column_count: true, skip_empty_lines: true, to_line: 6,
      }));
      const sample = [];
      for await (const r of parser) sample.push(r);
      const hdr = sample.length ? resolveHeader(sample[0]) : {};
      console.log('  resolved columns:', hdr);
      console.log('  sample[0]:', sample[0]);
      console.log('  (re-run with --apply to COPY to Supabase)');
      return;
    }

    // 2) connect, stage, COPY, INSERT SELECT
    // IL/CA statewide CSVs are 20M+ rows — COPY can exceed the default 30min
    // statement_timeout. Override to 2h for these long-haul loads.
    const { client, cleanup } = await createBulkClient({ statementTimeout: '2h' });
    try {
      const stageTbl = `_stage_police_stops_${AGENCY}`;
      console.log(`  (re)creating UNLOGGED stage: ${stageTbl}`);
      await client.query(`DROP TABLE IF EXISTS public.${stageTbl}`);
      await client.query(`
        CREATE UNLOGGED TABLE public.${stageTbl} (
          agency             TEXT,
          state_code         CHAR(2),
          city               TEXT,
          stop_date          DATE,
          stop_time          TIME,
          subject_race       TEXT,
          subject_sex        CHAR(1),
          subject_age        SMALLINT,
          officer_id         TEXT,
          officer_race       TEXT,
          officer_sex        CHAR(1),
          stop_type          TEXT,
          violation          TEXT,
          arrest_made        BOOLEAN,
          citation_issued    BOOLEAN,
          warning_issued     BOOLEAN,
          outcome            TEXT,
          search_conducted   BOOLEAN,
          search_person      BOOLEAN,
          search_vehicle     BOOLEAN,
          contraband_found   BOOLEAN,
          contraband_drugs   BOOLEAN,
          contraband_weapons BOOLEAN,
          frisk_performed    BOOLEAN,
          reason_for_stop    TEXT,
          reason_for_search  TEXT,
          location_lat       DOUBLE PRECISION,
          location_lng       DOUBLE PRECISION,
          district           TEXT,
          county_name        TEXT,
          source_druid       TEXT
        )
      `);

      console.log('  streaming CSV → COPY FROM STDIN...');
      let hdr = null;
      let rowCount = 0;
      let batched = 0;
      const started = Date.now();

      // Wrap the csv-parse async iterable so bulkCopyRows can drain it in
      // one COPY session, and so we can apply --limit and resolve headers
      // lazily on row 1.
      async function* rowsFromCsv() {
        const parser = fs.createReadStream(csvPath).pipe(csvParse({
          columns: true,
          relax_quotes: true,
          relax_column_count: true,
          skip_empty_lines: true,
        }));
        try {
          for await (const raw of parser) {
            if (!hdr) hdr = resolveHeader(raw);
            if (rowCount >= ROW_LIMIT) break;
            rowCount++;
            batched++;
            if (batched % BATCH === 0) {
              const perSec = (rowCount / ((Date.now() - started) / 1000)).toFixed(0);
              console.log(`    ${rowCount.toLocaleString()} rows (${perSec}/s)`);
            }
            yield buildRow(raw, hdr, manifest);
          }
        } catch (err) {
          console.error(`  csv-parse error at row ${rowCount}: ${err.message}`);
          throw err;
        }
      }

      const stageCols = COLS;
      const { rowCount: copied, durationMs } =
        await bulkCopyRows(client, `public.${stageTbl}`, stageCols, rowsFromCsv());
      console.log(`  COPY done: ${copied} rows in ${(durationMs / 1000).toFixed(1)}s`);

      console.log('  INSERT INTO public.police_stops SELECT ...');
      const colList = stageCols.map((c) => `"${c}"`).join(', ');
      const ins = await client.query(
        `INSERT INTO public.police_stops (${colList}) SELECT ${colList} FROM public.${stageTbl}`
      );
      console.log(`  inserted: ${ins.rowCount}`);

      // Root-cause guard (2026-04-24): large INSERTs can disconnect mid-flight
      // and pg driver returns rowCount 0 instead of throwing. Verify stage
      // count; if INSERT reported 0 but stage has rows, FAIL LOUD and keep
      // stage for retry-only rerun.
      const stageCount = await client.query(`SELECT COUNT(*)::bigint AS n FROM public.${stageTbl}`);
      const expected = Number(stageCount.rows[0].n);
      if (expected > 0 && (ins.rowCount ?? 0) === 0) {
        throw new Error(
          `INSERT returned 0 but stage has ${expected} rows — likely mid-INSERT ` +
          `connection death. Stage kept as public.${stageTbl} for retry.`
        );
      }

      await client.query(`DROP TABLE public.${stageTbl}`);
      console.log('  stage dropped.');

      console.log('  REFRESH MATERIALIZED VIEW CONCURRENTLY public.officer_stop_patterns ...');
      try {
        await client.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY public.officer_stop_patterns`);
        console.log('  refresh ok.');
      } catch (e) {
        console.warn(`  refresh skipped (${e.code || '?'}): ${e.message}`);
      }
    } finally {
      await cleanup();
    }

    console.log('Done.');
  } finally {
    releaseLock();
  }
}

main().catch((err) => { releaseLock(); console.error('FATAL:', err); process.exit(1); });

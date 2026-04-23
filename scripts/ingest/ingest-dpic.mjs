#!/usr/bin/env node
// csv-bulk-checked: http://deathpenaltyinfo.org/query/executions.csv — single CSV, direct download, no auth.
// Template: scripts/ingest-virginia-court-data.mjs
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN)
//
// DPIC (Death Penalty Information Center) executions ingest.
//
// Every US execution since 1976. CSV is small (~1,600 rows, grows ~15-25/year)
// and refreshed by DPIC on weekdays at 12 PM ET. Public records, no auth.
//
// Usage:
//   node scripts/ingest/ingest-dpic.mjs                      # Dry-run (default): download + print 5 rows + count
//   node scripts/ingest/ingest-dpic.mjs --apply              # Push to Supabase via COPY FROM STDIN
//   node scripts/ingest/ingest-dpic.mjs --file <path>        # Use local CSV instead of downloading
//   node scripts/ingest/ingest-dpic.mjs --file <path> --apply
//
// Schema: see supabase/migrations/20260422c_dpic_executions.sql
//
// Loader pattern:
//   1. DROP + CREATE UNLOGGED staging table
//   2. bulkCopyRows streams normalized rows → staging
//   3. INSERT ... SELECT FROM staging ON CONFLICT DO NOTHING
//   4. DROP staging
// (cl-bulk-data-defensive.md gotcha #18 — per-row INSERT loop is BANNED.)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as csvParseSync } from 'csv-parse/sync';
import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const PARENT_ROOT = path.resolve(PROJECT_ROOT, '..', 'ImNotAnAttorney');

const SOURCE_URL = 'http://deathpenaltyinfo.org/query/executions.csv';
const DEFAULT_DOWNLOAD_DIR = 'D:\\inaa-bulk\\dpic';
const DEFAULT_DOWNLOAD_PATH = path.join(DEFAULT_DOWNLOAD_DIR, 'executions.csv');

// ── CLI ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function argVal(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}
const APPLY = args.includes('--apply');
const FILE_ARG = argVal('--file');

// ── Env loading (.env.local for SUPABASE_DB_URL) ───────────────────────────
// Line-by-line parse (no regex on file contents).

function loadEnvLocalInto(processEnv) {
  for (const envPath of [
    path.join(PROJECT_ROOT, '.env.local'),
    path.join(PARENT_ROOT, '.env.local'),
  ]) {
    if (!fs.existsSync(envPath)) continue;
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!processEnv[key]) processEnv[key] = val;
    }
  }
}
loadEnvLocalInto(process.env);

// ── Download (only if --file not provided) ─────────────────────────────────

async function ensureCsv() {
  if (FILE_ARG) {
    if (!fs.existsSync(FILE_ARG)) {
      console.error(`ERROR: --file not found: ${FILE_ARG}`);
      process.exit(2);
    }
    console.log(`Using local CSV: ${FILE_ARG}`);
    return FILE_ARG;
  }
  fs.mkdirSync(DEFAULT_DOWNLOAD_DIR, { recursive: true });
  console.log(`Downloading DPIC CSV → ${DEFAULT_DOWNLOAD_PATH}`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    console.error(`ERROR: fetch failed ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(DEFAULT_DOWNLOAD_PATH, buf);
  console.log(`Downloaded ${buf.length.toLocaleString()} bytes.`);
  return DEFAULT_DOWNLOAD_PATH;
}

// ── Normalization helpers ──────────────────────────────────────────────────

function pick(row, ...names) {
  for (const n of names) {
    if (row[n] !== undefined && row[n] !== null && String(row[n]).trim() !== '') {
      return String(row[n]).trim();
    }
  }
  return null;
}

function isDigits(s) {
  if (!s || s.length === 0) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

function parseDate(s) {
  if (!s) return null;
  // ISO "YYYY-MM-DD"
  if (s.length === 10 && s[4] === '-' && s[7] === '-'
      && isDigits(s.slice(0, 4)) && isDigits(s.slice(5, 7)) && isDigits(s.slice(8, 10))) {
    return s;
  }
  // "M/D/YYYY" or "MM/DD/YY"
  const parts = s.split('/');
  if (parts.length === 3) {
    let mm = parts[0].trim();
    let dd = parts[1].trim();
    let yy = parts[2].trim();
    if (!isDigits(mm) || !isDigits(dd) || !isDigits(yy)) return null;
    if (mm.length === 1) mm = '0' + mm;
    if (dd.length === 1) dd = '0' + dd;
    if (yy.length === 2) yy = (parseInt(yy, 10) < 50 ? '20' : '19') + yy;
    if (yy.length === 4) return `${yy}-${mm}-${dd}`;
    return null;
  }
  // Fallback: Date.parse
  const t = Date.parse(s);
  if (!isNaN(t)) {
    const d = new Date(t);
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${d.getUTCFullYear()}-${mm}-${dd}`;
  }
  return null;
}

function parseInt10(s) {
  if (s === null || s === undefined || s === '') return null;
  const n = parseInt(String(s).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function parseSex(s) {
  if (!s) return null;
  const c = s.trim().toUpperCase().charAt(0);
  return c === 'M' || c === 'F' ? c : null;
}

function isTwoLetterAZ(s) {
  if (!s || s.length !== 2) return false;
  for (let i = 0; i < 2; i++) {
    const c = s.charCodeAt(i);
    if (c < 65 || c > 90) return false;
  }
  return true;
}

const STATE_NAME_TO_CODE = {
  'ALABAMA':'AL','ALASKA':'AK','ARIZONA':'AZ','ARKANSAS':'AR','CALIFORNIA':'CA',
  'COLORADO':'CO','CONNECTICUT':'CT','DELAWARE':'DE','FLORIDA':'FL','GEORGIA':'GA',
  'HAWAII':'HI','IDAHO':'ID','ILLINOIS':'IL','INDIANA':'IN','IOWA':'IA','KANSAS':'KS',
  'KENTUCKY':'KY','LOUISIANA':'LA','MAINE':'ME','MARYLAND':'MD','MASSACHUSETTS':'MA',
  'MICHIGAN':'MI','MINNESOTA':'MN','MISSISSIPPI':'MS','MISSOURI':'MO','MONTANA':'MT',
  'NEBRASKA':'NE','NEVADA':'NV','NEW HAMPSHIRE':'NH','NEW JERSEY':'NJ','NEW MEXICO':'NM',
  'NEW YORK':'NY','NORTH CAROLINA':'NC','NORTH DAKOTA':'ND','OHIO':'OH','OKLAHOMA':'OK',
  'OREGON':'OR','PENNSYLVANIA':'PA','RHODE ISLAND':'RI','SOUTH CAROLINA':'SC',
  'SOUTH DAKOTA':'SD','TENNESSEE':'TN','TEXAS':'TX','UTAH':'UT','VERMONT':'VT',
  'VIRGINIA':'VA','WASHINGTON':'WA','WEST VIRGINIA':'WV','WISCONSIN':'WI','WYOMING':'WY',
  'DISTRICT OF COLUMBIA':'DC',
};

function parseStateCode(s) {
  if (!s) return null;
  const up = s.trim().toUpperCase();
  if (up === 'FEDERAL' || up === 'US' || up === 'FED' || up === 'UNITED STATES') return 'US';
  if (isTwoLetterAZ(up)) return up;
  if (STATE_NAME_TO_CODE[up]) return STATE_NAME_TO_CODE[up];
  return null;
}

function composeName(row) {
  const first = (row['First Name'] || row['first_name'] || '').trim();
  const middle = (row['Middle Name(s)'] || row['Middle Name'] || row['middle_name'] || '').trim();
  const last = (row['Last Name'] || row['last_name'] || '').trim();
  const suffix = (row['Suffix'] || row['suffix'] || '').trim();
  const composed = [first, middle, last, suffix].filter(Boolean).join(' ').trim();
  if (composed) return composed;
  return null;
}

function parseBool(s) {
  if (s === null || s === undefined) return null;
  const t = String(s).trim().toLowerCase();
  if (t === '' || t === 'n/a' || t === 'unknown') return null;
  if (t === 'y' || t === 'yes' || t === 'true' || t === '1') return true;
  if (t === 'n' || t === 'no' || t === 'false' || t === '0') return false;
  return null;
}

// Split comma/semicolon/pipe/slash-separated race/sex lists into arrays
// via char-by-char loop (no regex on file-derived content).
function parseList(s) {
  if (!s) return null;
  const out = [];
  let buf = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === ',' || ch === ';' || ch === '|' || ch === '/') {
      const t = buf.trim();
      if (t) out.push(t);
      buf = '';
    } else {
      buf += ch;
    }
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out.length > 0 ? out : null;
}

function normalizeRow(row) {
  const raw_state = pick(row, 'State', 'state');
  const state_code = parseStateCode(raw_state);
  const federal_flag = parseBool(pick(row, 'Federal', 'federal')) === true
    || state_code === 'US';

  return {
    execution_date: parseDate(pick(row, 'Date', 'Execution Date', 'ExecutionDate', 'date')),
    inmate_name: pick(row, 'Name', 'Inmate Name', 'InmateName', 'name') || composeName(row),
    inmate_race: pick(row, 'Race', 'Inmate Race', 'race'),
    inmate_sex: parseSex(pick(row, 'Sex', 'Inmate Sex', 'sex')),
    inmate_age: parseInt10(pick(row, 'Age', 'Inmate Age', 'age')),
    state_code,
    region: pick(row, 'Region', 'region'),
    method: pick(row, 'Method', 'method'),
    federal_flag,
    foreign_national: parseBool(pick(row, 'Foreign National', 'ForeignNational', 'foreign_national')),
    juvenile_at_crime: parseBool(pick(row, 'Juvenile', 'Juvenile at Crime', 'juvenile')),
    volunteer: parseBool(pick(row, 'Volunteer', 'volunteer')),
    victim_count: parseInt10(pick(row, 'Number of Victims', 'Victim(s)', 'Victim Count', 'victim_count')),
    victim_races: parseList(pick(row, 'Victim Race', 'Victim Races', 'victim_race')),
    victim_sexes: parseList(pick(row, 'Victim Sex', 'Victim Sexes', 'victim_sex')),
    county: pick(row, 'County', 'county'),
  };
}

// Build a Postgres array literal: {"a","b"}. Escape backslash + quote char-by-char
// so we never apply regex to content that came from an external file.
function pgArray(arr) {
  if (!arr || arr.length === 0) return null;
  const parts = [];
  for (const v of arr) {
    const s = String(v);
    let esc = '';
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '\\') esc += '\\\\';
      else if (ch === '"') esc += '\\"';
      else esc += ch;
    }
    parts.push('"' + esc + '"');
  }
  return '{' + parts.join(',') + '}';
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== DPIC EXECUTIONS INGEST ===');
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Source: ${SOURCE_URL}\n`);

  const csvPath = await ensureCsv();
  const rawText = fs.readFileSync(csvPath, 'utf8');

  const rows = csvParseSync(rawText, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    trim: true,
  });

  console.log(`Parsed ${rows.length.toLocaleString()} raw rows.`);

  const normalized = [];
  let skippedNoDate = 0;
  let skippedNoName = 0;
  let skippedNoState = 0;
  for (const r of rows) {
    const n = normalizeRow(r);
    if (!n.execution_date) { skippedNoDate++; continue; }
    if (!n.inmate_name) { skippedNoName++; continue; }
    if (!n.state_code) { skippedNoState++; continue; }
    normalized.push(n);
  }

  console.log(`Normalized rows: ${normalized.length.toLocaleString()}`);
  if (skippedNoDate) console.log(`  skipped (no date):  ${skippedNoDate}`);
  if (skippedNoName) console.log(`  skipped (no name):  ${skippedNoName}`);
  if (skippedNoState) console.log(`  skipped (no state): ${skippedNoState}`);

  console.log('\n--- First 5 normalized rows ---');
  for (const row of normalized.slice(0, 5)) {
    console.log(JSON.stringify(row));
  }

  if (!APPLY) {
    console.log('\nDry-run complete. Run with --apply to push to Supabase.');
    return;
  }

  if (!process.env.SUPABASE_DB_URL) {
    console.error('\nERROR: SUPABASE_DB_URL not found in .env.local');
    process.exit(1);
  }

  const { client, cleanup } = await createBulkClient();
  try {
    console.log('\nCreating staging table dpic_executions_stage (UNLOGGED)...');
    await client.query('DROP TABLE IF EXISTS public.dpic_executions_stage');
    await client.query(`
      CREATE UNLOGGED TABLE public.dpic_executions_stage (
        execution_date DATE,
        inmate_name TEXT,
        inmate_race TEXT,
        inmate_sex CHAR(1),
        inmate_age SMALLINT,
        state_code CHAR(2),
        region TEXT,
        method TEXT,
        federal_flag BOOLEAN,
        foreign_national BOOLEAN,
        juvenile_at_crime BOOLEAN,
        volunteer BOOLEAN,
        victim_count SMALLINT,
        victim_races TEXT[],
        victim_sexes TEXT[],
        county TEXT
      )
    `);

    const COLS = [
      'execution_date', 'inmate_name', 'inmate_race', 'inmate_sex', 'inmate_age',
      'state_code', 'region', 'method', 'federal_flag', 'foreign_national',
      'juvenile_at_crime', 'volunteer', 'victim_count', 'victim_races', 'victim_sexes',
      'county',
    ];

    async function* rowGen() {
      for (const r of normalized) {
        yield [
          r.execution_date,
          r.inmate_name,
          r.inmate_race,
          r.inmate_sex,
          r.inmate_age,
          r.state_code,
          r.region,
          r.method,
          r.federal_flag,
          r.foreign_national,
          r.juvenile_at_crime,
          r.volunteer,
          r.victim_count,
          pgArray(r.victim_races),
          pgArray(r.victim_sexes),
          r.county,
        ];
      }
    }

    console.log(`Streaming ${normalized.length.toLocaleString()} rows via COPY FROM STDIN...`);
    const copyResult = await bulkCopyRows(
      client,
      'public.dpic_executions_stage',
      COLS,
      rowGen(),
    );
    console.log(`COPY complete: ${copyResult.rowCount} rows in ${copyResult.durationMs}ms.`);

    console.log('Upserting into dpic_executions (ON CONFLICT DO NOTHING)...');
    const upsertRes = await client.query(`
      INSERT INTO public.dpic_executions (
        execution_date, inmate_name, inmate_race, inmate_sex, inmate_age,
        state_code, region, method, federal_flag, foreign_national,
        juvenile_at_crime, volunteer, victim_count, victim_races, victim_sexes,
        county
      )
      SELECT
        execution_date, inmate_name, inmate_race, inmate_sex, inmate_age,
        state_code, region, method, federal_flag, foreign_national,
        juvenile_at_crime, volunteer, victim_count, victim_races, victim_sexes,
        county
      FROM public.dpic_executions_stage
      ON CONFLICT (execution_date, inmate_name, state_code) DO NOTHING
    `);
    console.log(`Upsert inserted ${upsertRes.rowCount} new rows.`);

    await client.query('DROP TABLE public.dpic_executions_stage');
    console.log('Staging dropped. Done.');
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

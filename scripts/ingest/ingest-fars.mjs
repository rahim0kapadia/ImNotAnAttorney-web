// csv-bulk-checked: https://www.nhtsa.gov/file-downloads — annual FARS FTP ZIPs containing ACCIDENT.csv, PERSON.csv, VEHICLE.csv. No omnibus CSV; one ZIP per year.
// Template: scripts/ingest-virginia-court-data.mjs
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN), gotcha #7 (tiered work_mem)
//
// NHTSA FARS (Fatality Analysis Reporting System) ingest — ONE YEAR PER INVOCATION.
//
// Loads ACCIDENT.CSV → fars_crashes, PERSON.CSV → fars_persons,
// VEHICLE.CSV → fars_vehicles for a single FARS year. Composite key
// (year, state_code, st_case) means re-running a year is idempotent via
// ON CONFLICT DO NOTHING.
//
// FARS column names drift year-to-year (WEATHER → WEATHER1, etc.), so a
// COLUMN_MAP per logical name handles the variance. Critical columns are
// validated at start of each file; script bails with a clear error if the
// expected shape isn't present.
//
// Bulk path: DROP+CREATE UNLOGGED staging table → bulkCopyRows stream →
// INSERT ... SELECT ... ON CONFLICT DO NOTHING → DROP staging. Never
// per-row INSERT (banned by cl-bulk-data-defensive #18).
//
// Usage:
//   node scripts/ingest/ingest-fars.mjs                       # dry-run, year 2023
//   node scripts/ingest/ingest-fars.mjs --apply               # load 2023 for real
//   node scripts/ingest/ingest-fars.mjs --year 2022 --apply   # specific year
//   node scripts/ingest/ingest-fars.mjs --limit 5000          # first N rows per CSV
//   node scripts/ingest/ingest-fars.mjs --dir D:\other\fars   # override bulk dir
//
// Directory layout expected (caller pre-extracts the ZIP):
//   <dir>/FARS<year>NationalCSV/
//     ACCIDENT.CSV
//     PERSON.CSV
//     VEHICLE.CSV
//   (filename matching is case-insensitive)
//
// Prerequisites:
//   .env.local with SUPABASE_DB_URL (session-mode, loader rewrites to 5432)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as csvParse } from 'csv-parse';
import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flagValue(name, fallback) {
  const i = args.indexOf(name);
  if (i < 0 || i === args.length - 1) return fallback;
  return args[i + 1];
}
const APPLY = args.includes('--apply');
const YEAR = parseInt(flagValue('--year', '2023'), 10);
const BULK_DIR = flagValue('--dir', 'D:\\inaa-bulk\\fars');
const limitArg = flagValue('--limit', null);
const ROW_LIMIT = limitArg ? parseInt(limitArg, 10) : Infinity;

if (!Number.isInteger(YEAR) || YEAR < 1975 || YEAR > 2100) {
  console.error(`Invalid --year: ${YEAR} (FARS started 1975)`);
  process.exit(1);
}

// ── Column maps (logical_name → candidate CSV header names, first match wins) ──

// FARS header capitalization varies by year and file tooling. Normalize to
// upper-case in the resolver so matching is case-insensitive.

const CRASH_COLS = {
  year:               ['YEAR'],
  state_code:         ['STATE', 'STATENAME'],          // STATE is numeric FIPS
  st_case:            ['ST_CASE'],
  state_name:         ['STATENAME'],
  county_code:        ['COUNTY'],
  city_code:          ['CITY'],
  month:              ['MONTH'],
  day:                ['DAY'],
  day_of_week:        ['DAY_WEEK'],
  hour:               ['HOUR'],
  minute:             ['MINUTE'],
  fatalities:         ['FATALS'],
  persons_involved:   ['PERSONS', 'PERNOTMVIT', 'PERMVIT'],
  vehicles_involved:  ['VE_TOTAL'],
  road_function_class:['FUNC_SYS'],
  weather_code:       ['WEATHER1', 'WEATHER'],
  light_condition:    ['LGT_COND'],
  drunk_drivers:      ['DRUNK_DR'],
};

const PERSON_COLS = {
  year:                ['YEAR'],
  state_code:          ['STATE'],
  st_case:             ['ST_CASE'],
  person_type:         ['PER_TYP'],
  age:                 ['AGE'],
  sex:                 ['SEX'],
  race:                ['RACE'],
  injury_severity:     ['INJ_SEV'],
  alcohol_test_result: ['ALC_RES'],
  alcohol_test_type:   ['ATST_TYP'],
  drug_test_results:   ['DRUGRES1', 'DRUGRES'],
};

const VEHICLE_COLS = {
  year:             ['YEAR'],
  state_code:       ['STATE'],
  st_case:          ['ST_CASE'],
  vehicle_number:   ['VEH_NO'],
  body_type:        ['BODY_TYP'],
  model_year:       ['MOD_YEAR'],
  driver_presence: ['DR_PRES'],
  speeding_related:['SPEEDREL'],
  hit_and_run:     ['HIT_RUN'],
};

// Critical columns per file — missing any of these aborts the load.
// NOTE: FARS per-year CSVs omit the YEAR column for PERSON.CSV and VEHICLE.CSV
// (year is implicit from filename/dir). ACCIDENT.CSV includes YEAR. We fallback
// to the --year CLI arg when logical.year is null.
const CRITICAL = {
  accident: ['year', 'state_code', 'st_case', 'fatalities'],
  person:   ['state_code', 'st_case'],
  vehicle:  ['state_code', 'st_case', 'vehicle_number'],
};

// ── Helpers ────────────────────────────────────────────────────────────────

function findFile(dir, baseNameUpper) {
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir);
  const hit = entries.find((e) => e.toUpperCase() === baseNameUpper);
  return hit ? path.join(dir, hit) : null;
}

function resolveColumnMap(logicalMap, headerRow) {
  // headerRow: array of string column names from csv-parse
  const headerUpper = headerRow.map((h) => h.toUpperCase().trim());
  const out = {};
  for (const [logical, candidates] of Object.entries(logicalMap)) {
    const hit = candidates.find((c) => headerUpper.includes(c.toUpperCase()));
    out[logical] = hit ? headerRow[headerUpper.indexOf(hit.toUpperCase())] : null;
  }
  return out;
}

function toInt(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) ? n : null;
}
function toReal(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function extractLogical(rawRow, resolved) {
  // Map raw CSV row object → logical-name → value
  const out = {};
  for (const [logical, csvCol] of Object.entries(resolved)) {
    out[logical] = csvCol && rawRow[csvCol] !== undefined ? rawRow[csvCol] : null;
  }
  return out;
}

// ── Table loaders ──────────────────────────────────────────────────────────

const STAGE_CRASHES  = 'stg_fars_crashes';
const STAGE_PERSONS  = 'stg_fars_persons';
const STAGE_VEHICLES = 'stg_fars_vehicles';

async function resetStage(client, stageName, realTable) {
  await client.query(`DROP TABLE IF EXISTS public.${stageName} CASCADE`);
  await client.query(`CREATE UNLOGGED TABLE public.${stageName} (LIKE public.${realTable} INCLUDING DEFAULTS)`);
}

async function dropStage(client, stageName) {
  await client.query(`DROP TABLE IF EXISTS public.${stageName} CASCADE`);
}

// Streaming row iterator with resolved column map, applying ROW_LIMIT.
async function* streamCsvRows(csvPath, logicalMap, criticalList, label) {
  const parser = fs.createReadStream(csvPath).pipe(csvParse({
    columns: true,
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  }));

  let resolved = null;
  let rowCount = 0;

  try {
    for await (const row of parser) {
      if (!resolved) {
        const header = Object.keys(row);
        resolved = resolveColumnMap(logicalMap, header);
        const missing = criticalList.filter((c) => !resolved[c]);
        if (missing.length) {
          throw new Error(
            `[${label}] Missing critical column(s) ${missing.join(', ')} in ${csvPath}. ` +
            `Header saw: ${header.join(', ')}`,
          );
        }
      }

      yield { raw: row, logical: extractLogical(row, resolved) };
      rowCount++;
      if (rowCount >= ROW_LIMIT) break;
    }
  } catch (err) {
    console.error(`  csv-parse error at row ${rowCount} of ${label}: ${err.message}`);
    throw err;
  }
}

async function loadCrashes(client, csvPath) {
  const cols = [
    'year', 'state_code', 'st_case', 'state_name',
    'county_code', 'city_code',
    'month', 'day', 'day_of_week', 'hour', 'minute',
    'fatalities', 'persons_involved', 'vehicles_involved',
    'road_function_class', 'weather_code', 'light_condition', 'drunk_drivers',
    'raw',
  ];

  async function* rowsIter() {
    for await (const { raw, logical } of streamCsvRows(csvPath, CRASH_COLS, CRITICAL.accident, 'ACCIDENT')) {
      const year = toInt(logical.year);
      const state_code = toInt(logical.state_code);
      const st_case = toInt(logical.st_case);
      if (year === null || state_code === null || st_case === null) continue;

      yield [
        year,
        state_code,
        st_case,
        logical.state_name ?? null,
        toInt(logical.county_code),
        toInt(logical.city_code),
        toInt(logical.month),
        toInt(logical.day),
        toInt(logical.day_of_week),
        toInt(logical.hour),
        toInt(logical.minute),
        toInt(logical.fatalities) ?? 0,
        toInt(logical.persons_involved),
        toInt(logical.vehicles_involved),
        toInt(logical.road_function_class),
        toInt(logical.weather_code),
        toInt(logical.light_condition),
        toInt(logical.drunk_drivers),
        raw,  // JSONB — csvEscape JSON.stringify's it
      ];
    }
  }

  console.log(`  Streaming ACCIDENT.CSV → ${STAGE_CRASHES} ...`);
  const { rowCount, durationMs } = await bulkCopyRows(client, `public.${STAGE_CRASHES}`, cols, rowsIter());
  console.log(`  Staged ${rowCount} crashes in ${(durationMs / 1000).toFixed(1)}s`);

  console.log('  INSERT ... SELECT into fars_crashes (ON CONFLICT DO NOTHING) ...');
  const insertSql = `
    INSERT INTO public.fars_crashes (${cols.join(', ')})
    SELECT ${cols.join(', ')} FROM public.${STAGE_CRASHES}
    ON CONFLICT (year, state_code, st_case) DO NOTHING
  `;
  const r = await client.query(insertSql);
  console.log(`  Inserted ${r.rowCount} fars_crashes rows`);
  return r.rowCount;
}

async function loadPersons(client, csvPath) {
  const cols = [
    'year', 'state_code', 'st_case',
    'person_type', 'age', 'sex', 'race', 'injury_severity',
    'alcohol_test_result', 'alcohol_test_type', 'drug_test_results',
    'drunk_driver', 'raw',
  ];

  async function* rowsIter() {
    for await (const { raw, logical } of streamCsvRows(csvPath, PERSON_COLS, CRITICAL.person, 'PERSON')) {
      const year = toInt(logical.year) ?? YEAR;
      const state_code = toInt(logical.state_code);
      const st_case = toInt(logical.st_case);
      if (year === null || state_code === null || st_case === null) continue;

      const bac = toReal(logical.alcohol_test_result);
      // FARS codes BAC as 0.00-0.94 valid, 0.95+ and 999 = unknown/refused.
      const bacValid = bac !== null && bac >= 0 && bac <= 0.94 ? bac : null;
      const drunk_driver = bacValid !== null ? bacValid >= 0.08 : null;

      yield [
        year,
        state_code,
        st_case,
        toInt(logical.person_type),
        toInt(logical.age),
        toInt(logical.sex),
        toInt(logical.race),
        toInt(logical.injury_severity),
        bacValid,
        toInt(logical.alcohol_test_type),
        toInt(logical.drug_test_results),
        drunk_driver,
        raw,
      ];
    }
  }

  console.log(`  Streaming PERSON.CSV → ${STAGE_PERSONS} ...`);
  const { rowCount, durationMs } = await bulkCopyRows(client, `public.${STAGE_PERSONS}`, cols, rowsIter());
  console.log(`  Staged ${rowCount} persons in ${(durationMs / 1000).toFixed(1)}s`);

  console.log('  INSERT ... SELECT into fars_persons (FK-filtered) ...');
  // Skip orphans whose parent crash wasn't loaded (defensive for partial reruns).
  const insertSql = `
    INSERT INTO public.fars_persons (${cols.join(', ')})
    SELECT s.${cols.join(', s.')}
    FROM public.${STAGE_PERSONS} s
    WHERE EXISTS (
      SELECT 1 FROM public.fars_crashes c
      WHERE c.year = s.year AND c.state_code = s.state_code AND c.st_case = s.st_case
    )
  `;
  const r = await client.query(insertSql);
  console.log(`  Inserted ${r.rowCount} fars_persons rows`);
  return r.rowCount;
}

async function loadVehicles(client, csvPath) {
  const cols = [
    'year', 'state_code', 'st_case',
    'vehicle_number', 'body_type', 'model_year',
    'driver_presence', 'speeding_related', 'hit_and_run',
    'raw',
  ];

  async function* rowsIter() {
    for await (const { raw, logical } of streamCsvRows(csvPath, VEHICLE_COLS, CRITICAL.vehicle, 'VEHICLE')) {
      const year = toInt(logical.year) ?? YEAR;
      const state_code = toInt(logical.state_code);
      const st_case = toInt(logical.st_case);
      if (year === null || state_code === null || st_case === null) continue;

      yield [
        year,
        state_code,
        st_case,
        toInt(logical.vehicle_number),
        toInt(logical.body_type),
        toInt(logical.model_year),
        toInt(logical.driver_presence),
        toInt(logical.speeding_related),
        toInt(logical.hit_and_run),
        raw,
      ];
    }
  }

  console.log(`  Streaming VEHICLE.CSV → ${STAGE_VEHICLES} ...`);
  const { rowCount, durationMs } = await bulkCopyRows(client, `public.${STAGE_VEHICLES}`, cols, rowsIter());
  console.log(`  Staged ${rowCount} vehicles in ${(durationMs / 1000).toFixed(1)}s`);

  console.log('  INSERT ... SELECT into fars_vehicles (FK-filtered) ...');
  const insertSql = `
    INSERT INTO public.fars_vehicles (${cols.join(', ')})
    SELECT s.${cols.join(', s.')}
    FROM public.${STAGE_VEHICLES} s
    WHERE EXISTS (
      SELECT 1 FROM public.fars_crashes c
      WHERE c.year = s.year AND c.state_code = s.state_code AND c.st_case = s.st_case
    )
  `;
  const r = await client.query(insertSql);
  console.log(`  Inserted ${r.rowCount} fars_vehicles rows`);
  return r.rowCount;
}

// ── Dry-run counter (no bulk client) ───────────────────────────────────────

async function countCsvRows(csvPath, logicalMap, criticalList, label) {
  const parser = fs.createReadStream(csvPath).pipe(csvParse({
    columns: true,
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  }));

  let resolved = null;
  let count = 0;
  for await (const row of parser) {
    if (!resolved) {
      const header = Object.keys(row);
      resolved = resolveColumnMap(logicalMap, header);
      const missing = criticalList.filter((c) => !resolved[c]);
      if (missing.length) {
        throw new Error(
          `[${label}] Missing critical column(s) ${missing.join(', ')} in ${csvPath}. ` +
          `Header: ${header.join(', ')}`,
        );
      }
    }
    count++;
    if (count >= ROW_LIMIT) break;
  }
  return count;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('NHTSA FARS ingest');
  console.log(`  year=${YEAR}  apply=${APPLY}  limit=${ROW_LIMIT === Infinity ? 'none' : ROW_LIMIT}`);
  console.log(`  dir=${BULK_DIR}`);

  const yearDirCandidates = [
    path.join(BULK_DIR, `FARS${YEAR}NationalCSV`),
    path.join(BULK_DIR, `FARS${YEAR}`),
    path.join(BULK_DIR, String(YEAR)),
  ];
  const yearDir = yearDirCandidates.find((p) => fs.existsSync(p));
  if (!yearDir) {
    console.error(`ERROR: No FARS year directory found. Tried:\n  ${yearDirCandidates.join('\n  ')}`);
    console.error('Extract the NHTSA FARS<year>NationalCSV.zip into one of those paths first.');
    process.exit(1);
  }
  console.log(`  yearDir=${yearDir}`);

  const accidentPath = findFile(yearDir, 'ACCIDENT.CSV');
  const personPath   = findFile(yearDir, 'PERSON.CSV');
  const vehiclePath  = findFile(yearDir, 'VEHICLE.CSV');

  if (!accidentPath || !personPath || !vehiclePath) {
    console.error('ERROR: Missing one or more required CSVs:');
    console.error(`  ACCIDENT.CSV: ${accidentPath ?? 'NOT FOUND'}`);
    console.error(`  PERSON.CSV:   ${personPath ?? 'NOT FOUND'}`);
    console.error(`  VEHICLE.CSV:  ${vehiclePath ?? 'NOT FOUND'}`);
    process.exit(1);
  }

  if (!APPLY) {
    console.log('\n--- DRY RUN (no bulk client opened, no writes) ---');
    const crashN   = await countCsvRows(accidentPath, CRASH_COLS,   CRITICAL.accident, 'ACCIDENT');
    const personN  = await countCsvRows(personPath,   PERSON_COLS,  CRITICAL.person,   'PERSON');
    const vehicleN = await countCsvRows(vehiclePath,  VEHICLE_COLS, CRITICAL.vehicle,  'VEHICLE');
    console.log(`would load ${crashN} rows from ${path.basename(accidentPath)} into public.fars_crashes`);
    console.log(`would load ${personN} rows from ${path.basename(personPath)} into public.fars_persons`);
    console.log(`would load ${vehicleN} rows from ${path.basename(vehiclePath)} into public.fars_vehicles`);
    console.log('Pass --apply to execute.');
    return;
  }

  const { client, cleanup } = await createBulkClient({ workMemMB: 256 });

  try {
    // Crashes FIRST (FK parents).
    console.log('\n[1/3] fars_crashes');
    await resetStage(client, STAGE_CRASHES, 'fars_crashes');
    await loadCrashes(client, accidentPath);
    await dropStage(client, STAGE_CRASHES);

    console.log('\n[2/3] fars_persons');
    await resetStage(client, STAGE_PERSONS, 'fars_persons');
    await loadPersons(client, personPath);
    await dropStage(client, STAGE_PERSONS);

    console.log('\n[3/3] fars_vehicles');
    await resetStage(client, STAGE_VEHICLES, 'fars_vehicles');
    await loadVehicles(client, vehiclePath);
    await dropStage(client, STAGE_VEHICLES);

    console.log('\nDone.');
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

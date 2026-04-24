// csv-bulk-checked: none-exists — Census ACS distributes detailed tables via api.census.gov JSON only. FTP bulk files exist but split into hundreds of per-state per-subject CSVs — JSON API with batch variable queries is the cheaper path for our 20-var × 3,143-county need.
// Template: scripts/ingest/load-nist-forensic.mjs (curated ingest + bulkCopyRows)
// Expert: chris-dreyer (niche domination — county demographic + jury pool angle owns War Room premium tier; cascade-native per atlas-identity.md)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
//
// Census ACS 5-year 2022 county demographics loader — P1 #9.
//
// Plan: C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-23-free-data-sources-full-load.md
//
// Variables fetched across 3 batched API calls per state (US-wide query hits
// the "too many variables" soft limit; looping states is the documented
// pattern). 3,143 counties × 3 calls × 51 states = 153 HTTP calls, each
// returning compact JSON. Runs in about 2-3 minutes end-to-end.
//
// Usage:
//   node scripts/ingest/load-acs-county.mjs                 # dry-run
//   node scripts/ingest/load-acs-county.mjs --apply         # TRUNCATE + reload
//   node scripts/ingest/load-acs-county.mjs --state 48      # TX only (dry-run)
//   CENSUS_API_KEY=xxx node scripts/ingest/load-acs-county.mjs --apply

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

// ── CLI ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function argVal(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}
const APPLY = args.includes('--apply');
const STATE_ONLY = argVal('--state'); // "48" = Texas

// ── Config ───────────────────────────────────────────────────────────────

const API_KEY = process.env.CENSUS_API_KEY || null;

const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';

// 51 state FIPS codes — 50 states + DC. Territories excluded (ACS coverage
// differs for PR/VI/GU/AS/MP; we revisit if War Room expands to them).
const STATE_FIPS = [
  '01','02','04','05','06','08','09','10','11','12','13','15','16','17','18',
  '19','20','21','22','23','24','25','26','27','28','29','30','31','32','33',
  '34','35','36','37','38','39','40','41','42','44','45','46','47','48','49',
  '50','51','53','54','55','56',
];

// Three variable batches — Census 2022 ACS5 tolerates ~50 vars/call in
// practice, we split to 10-14 each for clarity and to stay well within
// the soft limit.

const BATCH_CORE = [
  'NAME',
  'B01003_001E',  // Total population
  'B01002_001E',  // Median age
  'B29001_001E',  // Citizen voting-age (18+) — the right denominator for jury-composition comparisons
  'B03002_001E',  // Race universe (total)
  'B03002_003E',  // White alone, not Hispanic
  'B03002_004E',  // Black alone, not Hispanic
  'B03002_005E',  // American Indian / Alaska Native alone, not Hispanic
  'B03002_006E',  // Asian alone, not Hispanic
  'B03002_007E',  // Native Hawaiian / Pacific Islander alone, not Hispanic
  'B03002_008E',  // Some other race alone, not Hispanic
  'B03002_009E',  // Two or more races, not Hispanic
  'B03002_012E',  // Hispanic or Latino (any race)
];

const BATCH_EDU_ECON = [
  'NAME',
  'B15003_001E',  // Pop 25+ (education universe)
  'B15003_017E',  // HS diploma (regular)
  'B15003_018E',  // GED
  'B15003_019E',  // Some college < 1yr
  'B15003_020E',  // Some college 1+yr no degree
  'B15003_021E',  // Associate's degree
  'B15003_022E',  // Bachelor's
  'B15003_023E',  // Master's
  'B15003_024E',  // Professional
  'B15003_025E',  // Doctorate
  'B19013_001E',  // Median household income
  'B17001_001E',  // Poverty universe
  'B17001_002E',  // Below poverty
  'B23025_003E',  // Civilian labor force
  'B23025_005E',  // Civilian unemployed
];

const BATCH_HOUSING_LANG = [
  'NAME',
  'B25077_001E',  // Median home value
  'B25003_001E',  // Occupied housing (total)
  'B25003_002E',  // Owner-occupied
  'B25003_003E',  // Renter-occupied
  'B16001_001E',  // Pop 5+ (language universe)
  'B16001_002E',  // Speak only English
  'B16001_003E',  // Speak Spanish
];

// ── HTTP ─────────────────────────────────────────────────────────────────

function buildUrl(variables, stateFips) {
  const url = new URL('https://api.census.gov/data/2022/acs/acs5');
  url.searchParams.set('get', variables.join(','));
  url.searchParams.set('for', 'county:*');
  url.searchParams.set('in', `state:${stateFips}`);
  if (API_KEY) url.searchParams.set('key', API_KEY);
  return url.toString();
}

async function fetchBatch(variables, stateFips) {
  const url = buildUrl(variables, stateFips);
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Census ACS ${res.status} state=${stateFips} vars=${variables.length}: ${body.slice(0, 200)}`);
  }
  // Census returns [[header...], [row...], [row...], ...]
  const data = await res.json();
  if (!Array.isArray(data) || data.length < 1) {
    throw new Error(`Census ACS malformed response state=${stateFips}`);
  }
  const header = data[0];
  const rows = data.slice(1);
  return rows.map((r) => {
    const rec = {};
    for (let i = 0; i < header.length; i++) rec[header[i]] = r[i];
    return rec;
  });
}

function toInt(v) {
  if (v === null || v === undefined || v === '') return null;
  // Census uses -666666666 and similar as "no sample" sentinels.
  // Negative = sentinel; treat as null.
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return null;
  return Math.round(n);
}

function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return null;
  return n;
}

function parseCountyName(nameRaw) {
  // "Autauga County, Alabama" or "District of Columbia, District of Columbia"
  const m = /^(.+?),\s*(.+)$/.exec(nameRaw || '');
  if (!m) return { county: nameRaw, state: null };
  return { county: m[1].trim(), state: m[2].trim() };
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[acs-county] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} apiKey=${API_KEY ? 'yes' : 'no'} stateOnly=${STATE_ONLY || 'all'}`);

  const states = STATE_ONLY ? [STATE_ONLY] : STATE_FIPS;
  const byGeo = new Map();

  let httpCalls = 0;
  for (const st of states) {
    const [core, edu, hou] = await Promise.all([
      fetchBatch(BATCH_CORE, st).then((r) => { httpCalls++; return r; }),
      fetchBatch(BATCH_EDU_ECON, st).then((r) => { httpCalls++; return r; }),
      fetchBatch(BATCH_HOUSING_LANG, st).then((r) => { httpCalls++; return r; }),
    ]);

    // Key rows by state+county FIPS.
    const index = (rows) => {
      const m = new Map();
      for (const r of rows) {
        const geo = (r.state || '') + (r.county || '');
        if (geo.length === 5) m.set(geo, r);
      }
      return m;
    };
    const mCore = index(core);
    const mEdu = index(edu);
    const mHou = index(hou);

    for (const [geo, cr] of mCore.entries()) {
      const er = mEdu.get(geo) || {};
      const hr = mHou.get(geo) || {};
      const parsed = parseCountyName(cr.NAME);

      const hsPlus =
        (toInt(er.B15003_017E) || 0) +
        (toInt(er.B15003_018E) || 0) +
        (toInt(er.B15003_019E) || 0) +
        (toInt(er.B15003_020E) || 0) +
        (toInt(er.B15003_021E) || 0) +
        (toInt(er.B15003_022E) || 0) +
        (toInt(er.B15003_023E) || 0) +
        (toInt(er.B15003_024E) || 0) +
        (toInt(er.B15003_025E) || 0);
      const bachelorsPlus =
        (toInt(er.B15003_022E) || 0) +
        (toInt(er.B15003_023E) || 0) +
        (toInt(er.B15003_024E) || 0) +
        (toInt(er.B15003_025E) || 0);

      byGeo.set(geo, {
        geoid: geo,
        state_fips: geo.slice(0, 2),
        county_fips: geo.slice(2, 5),
        county_name: parsed.county,
        state_name: parsed.state,
        total_pop: toInt(cr.B01003_001E),
        pop_18_plus: toInt(cr.B29001_001E),
        median_age: toNum(cr.B01002_001E),
        pop_white_nh: toInt(cr.B03002_003E),
        pop_black_nh: toInt(cr.B03002_004E),
        pop_native_nh: toInt(cr.B03002_005E),
        pop_asian_nh: toInt(cr.B03002_006E),
        pop_pacific_nh: toInt(cr.B03002_007E),
        pop_other_nh: toInt(cr.B03002_008E),
        pop_two_plus_nh: toInt(cr.B03002_009E),
        pop_hispanic: toInt(cr.B03002_012E),
        pop_25_plus: toInt(er.B15003_001E),
        hs_diploma_plus: hsPlus || null,
        bachelors_plus: bachelorsPlus || null,
        median_hh_income: toInt(er.B19013_001E),
        poverty_count: toInt(er.B17001_002E),
        poverty_universe: toInt(er.B17001_001E),
        unemployed: toInt(er.B23025_005E),
        labor_force: toInt(er.B23025_003E),
        median_home_value: toInt(hr.B25077_001E),
        total_housing_units: toInt(hr.B25003_001E),
        owner_occupied: toInt(hr.B25003_002E),
        renter_occupied: toInt(hr.B25003_003E),
        pop_5_plus: toInt(hr.B16001_001E),
        speak_english_only: toInt(hr.B16001_002E),
        speak_spanish_home: toInt(hr.B16001_003E),
      });
    }

    // Polite — keep well under Census's generous unauthenticated rate.
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`[acs-county] http=${httpCalls} counties=${byGeo.size}`);

  if (!APPLY) {
    const sample = Array.from(byGeo.values()).slice(0, 3);
    for (const s of sample) {
      console.log(`  ${s.geoid}  ${s.county_name}, ${s.state_name}  pop=${s.total_pop}  18+=${s.pop_18_plus}`);
    }
    console.log('[acs-county] dry-run — no writes. Pass --apply to load.');
    return;
  }

  // Columns must match migration order.
  const COLS = [
    'geoid','state_fips','county_fips','county_name','state_name',
    'total_pop','pop_18_plus','median_age',
    'pop_white_nh','pop_black_nh','pop_native_nh','pop_asian_nh',
    'pop_pacific_nh','pop_other_nh','pop_two_plus_nh','pop_hispanic',
    'pop_25_plus','hs_diploma_plus','bachelors_plus',
    'median_hh_income','poverty_count','poverty_universe','unemployed','labor_force',
    'median_home_value','total_housing_units','owner_occupied','renter_occupied',
    'pop_5_plus','speak_english_only','speak_spanish_home',
  ];

  const rows = Array.from(byGeo.values()).map((r) => COLS.map((c) => r[c] ?? null));

  const { client, cleanup } = await createBulkClient();
  try {
    await client.query('BEGIN');
    // Reload semantics — matches the NIST loader pattern.
    await client.query('TRUNCATE acs_county_demographics');
    const { rowCount, durationMs } = await bulkCopyRows(
      client,
      'acs_county_demographics',
      COLS,
      rows,
    );
    await client.query('COMMIT');
    console.log(`[acs-county] COMMIT OK — ${rowCount} rows in ${durationMs} ms`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[acs-county] ROLLBACK —', err.message);
    throw err;
  } finally {
    await cleanup();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

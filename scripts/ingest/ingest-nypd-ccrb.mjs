// csv-bulk-checked: https://data.cityofnewyork.us/d/2fir-qns4 (CCRB Officers), 2mby-ccnw (Complaints), 6xgr-kwjq (Allegations), keep-pkmh (Penalties); CCRB FOIL data, NYC OpenData Terms, daily-refreshed
// Template: scripts/ingest/ingest-cpd-invisible-institute.mjs (4-table CCRB pattern parallel to Chicago's 2-table FOIA)
// Expert: chris-dreyer (niche domination — NYPD is largest US municipal force after Chicago, second-deepest officer-data leverage)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN, no per-row INSERT) + #19 (CSV bulk before API)
//
// New York Police Department CCRB misconduct ingest.
//
// Source:    NYC OpenData (Civilian Complaint Review Board), 4 joinable tables.
//            Officers / Complaints / Allegations / Penalties.
// Outputs:   public.nypd_officers     (~96,494 rows)
//            public.nypd_complaints   (~139,487 rows)
//            public.nypd_allegations  (bridge: officer × complaint × allegation, ~700K-1M)
//            public.nypd_penalties    (substantiated only; (complaint_id, tax_id) UNIQUE)
//
// Flow:
//   1. Download 4 CSVs from data.cityofnewyork.us via Socrata `rows.csv` bulk endpoint
//   2. COPY each into all-text staging table (column names match CSV headers verbatim, quoted)
//   3. INSERT SELECT with SQL-level NULLIF + to_date / to_number casts into final tables
//      using ON CONFLICT DO UPDATE so re-runs are idempotent (daily refresh viable)
//   4. DROP staging tables
//
// Usage:
//   node --env-file=../ImNotAnAttorney-web/.env.local scripts/ingest/ingest-nypd-ccrb.mjs              # dry-run (download + parse, no DB writes)
//   node --env-file=../ImNotAnAttorney-web/.env.local scripts/ingest/ingest-nypd-ccrb.mjs --apply      # write to Supabase
//   node --env-file=../ImNotAnAttorney-web/.env.local scripts/ingest/ingest-nypd-ccrb.mjs --apply --no-refetch    # use cached CSVs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

import { createBulkClient, bulkCopyCsv } from '../lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');

// ── Config ──────────────────────────────────────────────────────────────────

const SOCRATA = 'https://data.cityofnewyork.us/api/views';
const FETCH_HEADERS = {
  'User-Agent': 'INAA-NYPD-Ingest/1.0 (+https://imnotanattorney.com)',
  Accept: 'text/csv',
};
const APP_TOKEN = process.env.NYC_OPENDATA_APP_TOKEN || null;
if (APP_TOKEN) FETCH_HEADERS['X-App-Token'] = APP_TOKEN;

const WORK_DIR = path.join(REPO_ROOT, '.tmp', 'nypd');

const SOURCES = [
  { slug: '2fir-qns4', file: 'officers.csv',    table: 'nypd_officers' },
  { slug: '2mby-ccnw', file: 'complaints.csv',  table: 'nypd_complaints' },
  { slug: '6xgr-kwjq', file: 'allegations.csv', table: 'nypd_allegations' },
  { slug: 'keep-pkmh', file: 'penalties.csv',   table: 'nypd_penalties' },
];

// Mapping: CSV header (verbatim, case-sensitive) → final-table column.
// Final-column types are defined by the migration; staging holds everything as TEXT.
const COLUMN_MAPS = {
  nypd_officers: [
    ['As Of Date',                       'as_of_date',                       'date'],
    ['Tax ID',                           'tax_id',                           'bigint'],
    ['Active Per Last Reported Status',  'active_per_last_reported_status',  'text'],
    ['Last Reported Active Date',        'last_reported_active_date',        'date'],
    ['Officer First Name',               'officer_first_name',               'text'],
    ['Officer Last Name',                'officer_last_name',                'text'],
    ['Officer Race',                     'officer_race',                     'text'],
    ['Officer Gender',                   'officer_gender',                   'text'],
    ['Current Rank Abbreviation',        'current_rank_abbreviation',        'text'],
    ['Current Rank',                     'current_rank',                     'text'],
    ['Current Command',                  'current_command',                  'text'],
    ['Shield No',                        'shield_no',                        'text'],
    ['Total Complaints',                 'total_complaints',                 'int'],
    ['Total Substantiated Complaints',   'total_substantiated_complaints',   'int'],
  ],
  nypd_complaints: [
    ['As Of Date',                          'as_of_date',                       'date'],
    ['Complaint Id',                        'complaint_id',                     'bigint'],
    ['Incident Date',                       'incident_date',                    'date'],
    ['Incident Hour',                       'incident_hour',                    'int'],
    ['CCRB Received Date',                  'ccrb_received_date',               'date'],
    ['Close Date',                          'close_date',                       'date'],
    ['Borough Of Incident Occurrence',      'borough_of_incident_occurrence',   'text'],
    ['Precinct Of Incident Occurrence',     'precinct_of_incident_occurrence',  'text'],
    ['Location Type Of Incident',           'location_type_of_incident',        'text'],
    ['Reason for Police Contact',           'reason_for_police_contact',        'text'],
    ['Outcome Of Police Encounter',         'outcome_of_police_encounter',      'text'],
    ['CCRB Complaint Disposition',          'ccrb_complaint_disposition',       'text'],
    ['BWC Evidence',                        'bwc_evidence',                     'text'],
    ['Video Evidence',                      'video_evidence',                   'text'],
  ],
  // 18 columns. Order matches CSV exactly (HEADER skipped on COPY; positions
  // are what binds CSV → staging columns).
  nypd_allegations: [
    ['As Of Date',                                              'as_of_date',                              'date'],
    ['Complaint Id',                                            'complaint_id',                            'bigint'],
    ['Complaint Officer Number',                                'complaint_officer_number',                'int'],
    ['Tax ID',                                                  'tax_id',                                  'bigint'],
    ['Officer Rank Abbreviation At Incident',                   'officer_rank_abbreviation_at_incident',   'text'],
    ['Officer Rank At Incident',                                'officer_rank_at_incident',                'text'],
    ['Officer Command At Incident',                             'officer_command_at_incident',             'text'],
    ['Officer Days On Force At Incident',                       'officer_days_on_force_at_incident',       'int'],
    ['Allegation Record Identity',                              'allegation_record_identity',              'bigint'],
    ['FADO Type',                                               'fado_type',                               'text'],
    ['Allegation',                                              'allegation',                              'text'],
    ['Victim/Alleged Victim Age Range At Incident',             'victim_age_range',                        'text'],
    ['Victim/Alleged Victim Gender',                            'victim_gender',                           'text'],
    ['Victim / Alleged Victim Race (Legacy)',                   'victim_race_legacy',                      'text'],
    ['Victim / Alleged Victim Race / Ethnicity',                'victim_race_ethnicity',                   'text'],
    ['CCRB Investigations Division Recommendation',             'investigator_recommendation',             'text'],
    ['CCRB Allegation Disposition',                             'ccrb_allegation_disposition',             'text'],
    ['NYPD Allegation Disposition',                             'nypd_allegation_disposition',             'text'],
  ],
  nypd_penalties: [
    ['As Of Date',                                   'as_of_date',                                   'date'],
    ['Complaint Id',                                 'complaint_id',                                 'bigint'],
    ['Tax ID',                                       'tax_id',                                       'bigint'],
    ['CCRB Substantiated Officer Disposition',       'ccrb_substantiated_officer_disposition',       'text'],
    ['Board Discipline Recommendation',              'board_discipline_recommendation',              'text'],
    // Note: NYC OpenData ships these two with mixed naming conventions —
    // hyphen and underscore + lowercase 'i' — verbatim from the CSV.
    ['Non-APU NYPD Penalty Report Date',             'non_apu_nypd_penalty_report_date',             'date'],
    ['Officer is_APU',                               'officer_is_apu',                               'bool'],
    ['APU CCRB Trial Recommended Penalty',           'apu_ccrb_trial_recommended_penalty',           'text'],
    ['APU Trial Commissioner Recommended Penalty',   'apu_trial_commissioner_recommended_penalty',   'text'],
    ['APU Plea Agreed Penalty',                      'apu_plea_agreed_penalty',                      'text'],
    ['APU Case Status',                              'apu_case_status',                              'text'],
    ['APU Closing Date',                             'apu_closing_date',                             'date'],
    ['NYPD Officer Penalty',                         'nypd_officer_penalty',                         'text'],
  ],
};

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  return {
    apply: args.includes('--apply'),
    noRefetch: args.includes('--no-refetch'),
  };
}

const OPTS = parseArgs(process.argv);

// ── Fetch ───────────────────────────────────────────────────────────────────

// Minimum CSV size (bytes) below which we treat the upstream response as
// degenerate — Socrata maintenance / partial export / stub response. Each
// real CSV is hundreds of KB minimum (officers ~10 MB, complaints ~26 MB,
// allegations ~68 MB, penalties ~1.7 MB). 100 KB is well below the smallest
// healthy file but well above any header-only stub.
const MIN_CSV_BYTES = 100_000;

// Per-CSV fetch timeout (15 min). Stalled Socrata endpoint should fail-fast,
// not hang the loader indefinitely.
const FETCH_TIMEOUT_MS = 15 * 60 * 1000;

async function downloadCsv(slug, dest) {
  const url = `${SOCRATA}/${slug}/rows.csv?accessType=DOWNLOAD`;
  if (OPTS.noRefetch && fs.existsSync(dest)) {
    const st = fs.statSync(dest);
    if (st.size < MIN_CSV_BYTES) {
      throw new Error(`Cached CSV ${dest} is ${st.size} bytes — below ${MIN_CSV_BYTES}. Delete the file and re-fetch.`);
    }
    console.error(`[fetch] --no-refetch: cached ${dest} (${st.size} bytes)`);
    return;
  }
  console.error(`[fetch] GET ${url} -> ${dest}`);
  // Atomic-rename pattern: download to ${dest}.tmp, only rename on success.
  // Prevents a transient network failure from poisoning the cache for the
  // next operator run.
  const tmpDest = `${dest}.tmp`;
  const resp = await fetch(url, {
    headers: FETCH_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText} fetching ${url}`);
  }
  await pipeline(Readable.fromWeb(resp.body), fs.createWriteStream(tmpDest));
  const tmpStat = fs.statSync(tmpDest);
  if (tmpStat.size < MIN_CSV_BYTES) {
    fs.unlinkSync(tmpDest);
    throw new Error(`Downloaded CSV from ${url} is ${tmpStat.size} bytes — below ${MIN_CSV_BYTES}. Refusing to load (likely Socrata maintenance / stub response). Existing cached file untouched.`);
  }
  fs.renameSync(tmpDest, dest);
  const st = fs.statSync(dest);
  console.error(`[fetch] wrote ${dest} (${st.size} bytes)`);
}

/** Read the first line of the CSV and assert each header matches the
 *  expected COLUMN_MAPS positional list verbatim. Defensive against
 *  upstream column drift (NYC OpenData adds, removes, or reorders columns)
 *  which would otherwise corrupt every row silently. */
function validateCsvHeader(csvPath, expectedHeaders) {
  const fd = fs.openSync(csvPath, 'r');
  try {
    const buf = Buffer.alloc(64 * 1024);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    const slice = buf.subarray(0, bytesRead).toString('utf8');
    const eol = slice.search(/\r?\n/);
    const headerLine = eol === -1 ? slice : slice.slice(0, eol);
    // Naive CSV parse — NYC OpenData headers do not contain quoted commas.
    const actual = headerLine.split(',').map((s) => s.trim());
    const issues = [];
    if (actual.length !== expectedHeaders.length) {
      issues.push(`expected ${expectedHeaders.length} columns, got ${actual.length}`);
    }
    for (let i = 0; i < Math.max(actual.length, expectedHeaders.length); i++) {
      if (actual[i] !== expectedHeaders[i]) {
        issues.push(`col ${i}: expected "${expectedHeaders[i] ?? '(missing)'}", got "${actual[i] ?? '(missing)'}"`);
      }
    }
    if (issues.length > 0) {
      throw new Error(
        `CSV header drift in ${csvPath} — refusing to load to prevent silent column-shift corruption.\n  ` +
          issues.join('\n  '),
      );
    }
  } finally {
    fs.closeSync(fd);
  }
}

// ── DB load ─────────────────────────────────────────────────────────────────

function quoteIdent(s) {
  const str = String(s);
  if (str.length > 63) {
    throw new Error(`Identifier exceeds Postgres NAMEDATALEN=63: ${str.length} chars in "${str}"`);
  }
  if (/[\x00]/.test(str)) {
    throw new Error(`Identifier contains NUL byte: "${str.replace(/[\x00]/g, '\\x00')}"`);
  }
  return `"${str.replace(/"/g, '""')}"`;
}

function buildStagingDdl(table, columnMap) {
  const cols = columnMap.map(([csvHeader]) => `${quoteIdent(csvHeader)} TEXT`).join(',\n  ');
  return `CREATE UNLOGGED TABLE staging_${table} (\n  ${cols}\n);`;
}

function castExpr(csvHeader, type) {
  const ident = quoteIdent(csvHeader);
  // Strip ASCII whitespace + Unicode space variants (NBSP U+00A0, ZWSP U+200B,
  // BOM U+FEFF) AND collapse common upstream-NULL token strings ('NULL',
  // 'N/A', 'None', 'null') to NULL. Without these, a stray non-breaking
  // space or "None" literal slips past the cast as a non-NULL TEXT value.
  const trimmed = `NULLIF(NULLIF(NULLIF(NULLIF(NULLIF(TRIM(BOTH E' \\t\\n\\r\\u00A0\\u200B\\uFEFF' FROM ${ident}), ''), 'NULL'), 'N/A'), 'None'), 'null')`;
  switch (type) {
    case 'date':
      // NYC OpenData ships dates in four shapes — the same field can vary by
      // column within a single CSV:
      //   ISO yyyy-MM-dd          (e.g. "Incident Date" → "2000-01-10")
      //   MM/DD/YYYY HH:MI:SS AM  (e.g. "CCRB Received Date" → "01/11/2000 12:00:00 AM")
      //   MM/DD/YYYY              (occasional bare-date fields)
      //   YYYYMMDD                (e.g. "As Of Date" → "20260423")
      // Order matters: ISO must be checked before YYYYMMDD because both can
      // start with 4 digits, but only ISO has hyphens. YYYYMMDD branch also
      // validates month/day are in plausible ranges so '99999999' or
      // '20269999' don't silently overflow into bogus dates.
      return `CASE WHEN ${trimmed} IS NULL THEN NULL
                   WHEN ${trimmed} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN to_date(${trimmed}, 'YYYY-MM-DD')
                   WHEN ${trimmed} ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$' THEN to_date(${trimmed}, 'MM/DD/YYYY')
                   WHEN ${trimmed} ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4} ' THEN to_date(split_part(${trimmed}, ' ', 1), 'MM/DD/YYYY')
                   WHEN ${trimmed} ~ '^[0-9]{8}$'
                        AND substr(${trimmed},1,4) BETWEEN '1900' AND '2099'
                        AND substr(${trimmed},5,2) BETWEEN '01' AND '12'
                        AND substr(${trimmed},7,2) BETWEEN '01' AND '31'
                     THEN to_date(${trimmed}, 'YYYYMMDD')
                   ELSE NULL END`;
    case 'bigint':
      // Allow leading '+' (Socrata occasionally emits it for explicit positives)
      // and strip it before cast. Negative tax_ids / complaint_ids do not exist.
      return `CASE WHEN ${trimmed} ~ '^\\+?[0-9]+$' THEN regexp_replace(${trimmed}, '^\\+', '')::bigint ELSE NULL END`;
    case 'int':
      return `CASE WHEN ${trimmed} ~ '^[+-]?[0-9]+$' THEN regexp_replace(${trimmed}, '^\\+', '')::int ELSE NULL END`;
    case 'bool':
      return `CASE WHEN lower(${trimmed}) IN ('true','t','yes','y','1') THEN TRUE
                   WHEN lower(${trimmed}) IN ('false','f','no','n','0') THEN FALSE
                   ELSE NULL END`;
    case 'text':
      return trimmed;
    default:
      throw new Error(`Unknown cast type ${type} for ${csvHeader}`);
  }
}

// Per-table NOT-NULL guard columns (final-table column names). Skip any
// staging row that would violate a required column on the destination
// table — protects daily-refresh idempotency from upstream edge cases.
const NOT_NULL_GUARDS = {
  nypd_officers:    ['tax_id'],
  nypd_complaints:  ['complaint_id'],
  nypd_allegations: ['allegation_record_identity', 'complaint_id'],
  nypd_penalties:   ['complaint_id', 'tax_id'],
};

function buildInsertSelect(table, columnMap) {
  const targetCols = columnMap.map(([, col]) => col).join(', ');
  const selectExprs = columnMap.map(([h, , t]) => castExpr(h, t)).join(',\n    ');
  let conflictClause = '';
  if (table === 'nypd_officers') {
    const updateCols = columnMap.filter(([, c]) => c !== 'tax_id').map(([, c]) => `${c} = EXCLUDED.${c}`).join(', ');
    conflictClause = `ON CONFLICT (tax_id) DO UPDATE SET ${updateCols}`;
  } else if (table === 'nypd_complaints') {
    const updateCols = columnMap.filter(([, c]) => c !== 'complaint_id').map(([, c]) => `${c} = EXCLUDED.${c}`).join(', ');
    conflictClause = `ON CONFLICT (complaint_id) DO UPDATE SET ${updateCols}`;
  } else if (table === 'nypd_allegations') {
    const updateCols = columnMap.filter(([, c]) => c !== 'allegation_record_identity').map(([, c]) => `${c} = EXCLUDED.${c}`).join(', ');
    conflictClause = `ON CONFLICT (allegation_record_identity) DO UPDATE SET ${updateCols}`;
  } else if (table === 'nypd_penalties') {
    const updateCols = columnMap
      .filter(([, c]) => c !== 'complaint_id' && c !== 'tax_id')
      .map(([, c]) => `${c} = EXCLUDED.${c}`).join(', ');
    conflictClause = `ON CONFLICT (complaint_id, tax_id) DO UPDATE SET ${updateCols}`;
  }
  const guardCols = NOT_NULL_GUARDS[table] ?? [];
  if (guardCols.length === 0) {
    throw new Error(`No NOT_NULL_GUARDS entry for ${table}`);
  }
  // Build cast-expression-IS-NOT-NULL clauses against the staging row's
  // pre-cast TEXT columns, looking up each final-table guard column back
  // to its CSV header + cast type via columnMap.
  const guardClauses = guardCols.map((finalCol) => {
    const entry = columnMap.find(([, c]) => c === finalCol);
    if (!entry) {
      throw new Error(`Guard column ${finalCol} not in columnMap for ${table}`);
    }
    const [csvHeader, , castType] = entry;
    return `(${castExpr(csvHeader, castType)}) IS NOT NULL`;
  }).join('\n  AND ');
  return `INSERT INTO ${table} (${targetCols})
SELECT
    ${selectExprs}
FROM staging_${table}
WHERE ${guardClauses}
${conflictClause};`;
}

// Date columns by final table — used by the post-load NULL-rate canary so we
// detect upstream date-format drift the morning after, not weeks later when
// a customer report shows blank dates.
const DATE_COLUMNS_BY_TABLE = {
  nypd_officers:    ['as_of_date', 'last_reported_active_date'],
  nypd_complaints:  ['incident_date', 'ccrb_received_date', 'close_date', 'as_of_date'],
  nypd_allegations: ['as_of_date'],
  nypd_penalties:   ['as_of_date', 'non_apu_nypd_penalty_report_date', 'apu_closing_date'],
};

// NULL-rate threshold for the canary. 0.30 = if more than 30% of rows are
// NULL in a given date column, log a warning. The high threshold is because
// some columns (close_date for ongoing cases, apu_closing_date for non-APU
// rows, last_reported_active_date for currently-active officers) are
// legitimately sparse — we want to catch format-drift catastrophic loss
// (>>30% NULL post-drift), not benign sparseness.
const NULL_RATE_WARN_THRESHOLD = 0.30;

async function postLoadDateCanary(client, table) {
  const dateCols = DATE_COLUMNS_BY_TABLE[table] ?? [];
  if (dateCols.length === 0) return;
  const totalRow = (await client.query(`SELECT count(*)::bigint AS n FROM ${table}`)).rows[0];
  const total = Number(totalRow.n);
  if (total === 0) return;
  for (const col of dateCols) {
    const r = await client.query(`SELECT count(*)::bigint AS n FROM ${table} WHERE ${col} IS NULL`);
    const nullCount = Number(r.rows[0].n);
    const rate = nullCount / total;
    const note = rate > NULL_RATE_WARN_THRESHOLD ? ' [WARN — exceeds threshold]' : '';
    console.error(`[canary] ${table}.${col}: ${nullCount}/${total} NULL (${(rate * 100).toFixed(1)}%)${note}`);
  }
}

async function loadOne({ slug, file, table }) {
  const csvPath = path.join(WORK_DIR, file);
  await downloadCsv(slug, csvPath);

  const columnMap = COLUMN_MAPS[table];
  if (!columnMap) throw new Error(`No column map for ${table}`);

  // CSV header drift check — fail fast if upstream renamed/added/reordered
  // columns. Without this, a column shift silently corrupts every row.
  const expectedHeaders = columnMap.map(([h]) => h);
  validateCsvHeader(csvPath, expectedHeaders);

  if (!OPTS.apply) {
    console.error(`[dry] would COPY ${csvPath} -> staging_${table}, then INSERT SELECT into ${table}`);
    return;
  }

  const { client, cleanup } = await createBulkClient();
  try {
    // Per-loader application_name — `inaa-bulk-loader` is shared with every
    // other bulk script, so when zombies surface in pg_stat_activity we need
    // the loader-specific suffix to know who to chase.
    await client.query(`SET application_name = 'ingest-nypd-ccrb:${table}'`);
    console.error(`[db] dropping any prior staging_${table}`);
    await client.query(`DROP TABLE IF EXISTS staging_${table}`);

    console.error(`[db] creating staging_${table}`);
    await client.query(buildStagingDdl(table, columnMap));

    console.error(`[db] COPY ${csvPath} -> staging_${table}`);
    const csvHeaders = columnMap.map(([h]) => h);
    await bulkCopyCsv(client, `staging_${table}`, csvHeaders, csvPath);

    console.error(`[db] INSERT SELECT staging_${table} -> ${table}`);
    await client.query(buildInsertSelect(table, columnMap));

    const { rows } = await client.query(`SELECT count(*)::bigint AS n FROM ${table}`);
    console.error(`[db] ${table} now has ${rows[0].n} rows`);

    await postLoadDateCanary(client, table);

    console.error(`[db] dropping staging_${table}`);
    await client.query(`DROP TABLE staging_${table}`);
  } finally {
    await cleanup();
  }
}

// Cross-table integrity probe — runs after all 4 tables loaded. Surfaces the
// partial-load failure mode (e.g. allegations COPY crashed mid-load while
// officers + complaints succeeded) within the same run rather than waiting
// for a customer report to expose the orphan rate weeks later.
async function postLoadIntegrityProbe() {
  if (!OPTS.apply) return;
  const { client, cleanup } = await createBulkClient();
  try {
    await client.query(`SET application_name = 'ingest-nypd-ccrb:integrity'`);
    console.error(`\n── post-load integrity probe ──`);
    const probes = [
      // Allegations referencing a missing officer (where tax_id IS NOT NULL).
      `SELECT count(*)::bigint AS n FROM nypd_allegations a WHERE a.tax_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM nypd_officers o WHERE o.tax_id = a.tax_id)`,
      // Allegations referencing a missing complaint.
      `SELECT count(*)::bigint AS n FROM nypd_allegations a WHERE NOT EXISTS (SELECT 1 FROM nypd_complaints c WHERE c.complaint_id = a.complaint_id)`,
      // Penalties referencing a missing complaint.
      `SELECT count(*)::bigint AS n FROM nypd_penalties p WHERE NOT EXISTS (SELECT 1 FROM nypd_complaints c WHERE c.complaint_id = p.complaint_id)`,
      // Penalties referencing a missing officer.
      `SELECT count(*)::bigint AS n FROM nypd_penalties p WHERE NOT EXISTS (SELECT 1 FROM nypd_officers o WHERE o.tax_id = p.tax_id)`,
    ];
    const labels = [
      'allegations.tax_id orphans (officer missing)',
      'allegations.complaint_id orphans (complaint missing)',
      'penalties.complaint_id orphans',
      'penalties.tax_id orphans',
    ];
    for (let i = 0; i < probes.length; i++) {
      const r = await client.query(probes[i]);
      const n = Number(r.rows[0].n);
      const note = n > 0 ? ' [WARN — partial load suspected]' : '';
      console.error(`[probe] ${labels[i]}: ${n}${note}`);
    }
  } finally {
    await cleanup();
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  console.error(`[start] ingest-nypd-ccrb apply=${OPTS.apply} noRefetch=${OPTS.noRefetch}`);
  for (const src of SOURCES) {
    console.error(`\n── ${src.table} (${src.slug}) ──`);
    await loadOne(src);
  }
  await postLoadIntegrityProbe();
  console.error(`\n[done] all 4 NYPD CCRB tables loaded`);
}

main().catch((e) => {
  console.error(`[fatal] ${e.message}\n${e.stack}`);
  process.exit(1);
});

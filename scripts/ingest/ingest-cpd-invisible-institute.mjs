// csv-bulk-checked: https://github.com/invinst/chicago-police-data/raw/master/data/unified_data.zip (53 MB zip of cleaned CSVs; FOIA'd CPD data, public)
// Template: scripts/ingest/scrape-flbar-discipline.mjs (CSV + COPY FROM STDIN via bulkCopyCsv)
// Expert: chris-dreyer (niche domination — Officer BG Check Chicago SKU unlock)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN, no per-row INSERT) + #19 (CSV bulk before API)
//
// Chicago Police Department officer + complaint ingest.
//
// Source:   github.com/invinst/chicago-police-data, unified_data.zip
// Outputs:  public.cpd_officers        (~37,545 rows, one per unique officer)
//           public.cpd_complaints      (~263,765 rows, one per officer x CR)
//
// Flow:
//   1. Download unified_data.zip to C:\Users\email\projects\ImNotAnAttorney-web\.tmp\cpd\
//      (skipped if already present and --no-refetch not passed)
//   2. Expand via Windows Expand-Archive (no npm zip dep; windowsHide:true)
//   3. COPY 3 CSVs into all-text staging tables on Supabase
//   4. INSERT SELECT with SQL-level casts + NULLIF('',...) into final tables
//      with ON CONFLICT DO UPDATE (idempotent re-runs)
//
// Usage:
//   node --env-file=.env.local scripts/ingest/ingest-cpd-invisible-institute.mjs              # dry-run
//   node --env-file=.env.local scripts/ingest/ingest-cpd-invisible-institute.mjs --apply      # write
//   node --env-file=.env.local scripts/ingest/ingest-cpd-invisible-institute.mjs --apply --no-refetch

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBulkClient, bulkCopyCsv } from '../lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');

// ── Config ──────────────────────────────────────────────────────────────────

const ZIP_URL = 'https://github.com/invinst/chicago-police-data/raw/master/data/unified_data.zip';
const WORK_DIR = path.join(REPO_ROOT, '.tmp', 'cpd');
const ZIP_PATH = path.join(WORK_DIR, 'unified_data.zip');
const EXTRACT_DIR = path.join(WORK_DIR, 'extracted');
const DATA_ROOT = path.join(EXTRACT_DIR, 'unified_data');

const OFFICERS_CSV    = path.join(DATA_ROOT, 'officers', 'final-profiles.csv');
const COMPLAINTS_CSV  = path.join(DATA_ROOT, 'complaints', 'complaints-complaints.csv');
const ACCUSED_CSV     = path.join(DATA_ROOT, 'complaints', 'complaints-accused.csv');

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  return {
    apply: args.includes('--apply'),
    noRefetch: args.includes('--no-refetch'),
  };
}

const OPTS = parseArgs(process.argv);

// ── Fetch + extract ─────────────────────────────────────────────────────────

async function downloadZip() {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  if (OPTS.noRefetch && fs.existsSync(ZIP_PATH)) {
    const st = fs.statSync(ZIP_PATH);
    console.error(`[fetch] --no-refetch: using cached ${ZIP_PATH} (${st.size} bytes)`);
    return;
  }
  console.error(`[fetch] GET ${ZIP_URL} -> ${ZIP_PATH}`);
  const resp = await fetch(ZIP_URL, {
    redirect: 'follow',
    headers: { 'User-Agent': 'INAA-CPD-Ingest/1.0 (+https://imnotanattorney.com)' },
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText} fetching ${ZIP_URL}`);
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(ZIP_PATH, buf);
  console.error(`[fetch] wrote ${buf.length} bytes`);
}

function extractZip() {
  if (fs.existsSync(DATA_ROOT)) {
    console.error(`[unzip] already extracted: ${DATA_ROOT} — reusing`);
    return;
  }
  fs.mkdirSync(EXTRACT_DIR, { recursive: true });
  console.error(`[unzip] Expand-Archive -> ${EXTRACT_DIR}`);
  execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Expand-Archive -Path '${ZIP_PATH}' -DestinationPath '${EXTRACT_DIR}' -Force`,
    ],
    { stdio: 'inherit', windowsHide: true, timeout: 120_000 },
  );
  if (!fs.existsSync(DATA_ROOT)) {
    throw new Error(`Expand-Archive succeeded but DATA_ROOT missing: ${DATA_ROOT}`);
  }
}

function verifyInputs() {
  for (const p of [OFFICERS_CSV, COMPLAINTS_CSV, ACCUSED_CSV]) {
    if (!fs.existsSync(p)) {
      throw new Error(`Required CSV missing after extract: ${p}`);
    }
  }
}

// ── Load ────────────────────────────────────────────────────────────────────

async function createStaging(client) {
  await client.query(`DROP TABLE IF EXISTS public._stg_cpd_officers`);
  await client.query(`DROP TABLE IF EXISTS public._stg_cpd_complaints_parent`);
  await client.query(`DROP TABLE IF EXISTS public._stg_cpd_complaints_accused`);
  await client.query(`
    CREATE UNLOGGED TABLE public._stg_cpd_officers (
      "UID" text,
      officer_id text,
      first_name text,
      last_name text,
      middle_initial text,
      middle_initial2 text,
      suffix_name text,
      appointed_date text,
      birth_year text,
      gender text,
      race text,
      current_star text,
      cleaned_rank text,
      current_rank text,
      current_unit text,
      current_status text,
      resignation_date text,
      org_hire_date text,
      start_date text,
      profile_count text
    );
    CREATE UNLOGGED TABLE public._stg_cpd_complaints_parent (
      cr_id text,
      complaint_date text,
      closed_date text,
      incident_date text,
      incident_time text,
      days_to_closure text,
      add1 text,
      add2 text,
      beat text,
      city text,
      location_code text,
      old_complaint_address text,
      latitude text,
      longitude text,
      current_status text,
      filename text,
      investigating_agency text,
      investigating_agencies text,
      complainant_type text
    );
    CREATE UNLOGGED TABLE public._stg_cpd_complaints_accused (
      cr_id text,
      "UID" text,
      complaint_category text,
      complaint_code text,
      disciplined text,
      final_finding text,
      final_outcome text,
      final_outcome_desc text,
      recc_finding text,
      recc_outcome text,
      days text,
      complaint_codes text,
      complaint_categories text,
      cv text
    );
  `);
  // Index accused on (cr_id, UID) for the JOIN; small UNLOGGED index is fast.
  await client.query(`CREATE INDEX ON public._stg_cpd_complaints_accused (cr_id)`);
  await client.query(`CREATE INDEX ON public._stg_cpd_complaints_parent (cr_id)`);
}

async function copyCsvs(client) {
  console.error(`[copy] officers: ${OFFICERS_CSV}`);
  const r1 = await bulkCopyCsv(
    client,
    '_stg_cpd_officers',
    ['UID','officer_id','first_name','last_name','middle_initial','middle_initial2','suffix_name','appointed_date','birth_year','gender','race','current_star','cleaned_rank','current_rank','current_unit','current_status','resignation_date','org_hire_date','start_date','profile_count'],
    OFFICERS_CSV,
  );
  console.error(`[copy] officers: ${r1.rowCount} rows in ${r1.durationMs}ms`);

  console.error(`[copy] complaints-complaints: ${COMPLAINTS_CSV}`);
  const r2 = await bulkCopyCsv(
    client,
    '_stg_cpd_complaints_parent',
    ['cr_id','complaint_date','closed_date','incident_date','incident_time','days_to_closure','add1','add2','beat','city','location_code','old_complaint_address','latitude','longitude','current_status','filename','investigating_agency','investigating_agencies','complainant_type'],
    COMPLAINTS_CSV,
  );
  console.error(`[copy] complaints-parent: ${r2.rowCount} rows in ${r2.durationMs}ms`);

  console.error(`[copy] complaints-accused: ${ACCUSED_CSV}`);
  const r3 = await bulkCopyCsv(
    client,
    '_stg_cpd_complaints_accused',
    ['cr_id','UID','complaint_category','complaint_code','disciplined','final_finding','final_outcome','final_outcome_desc','recc_finding','recc_outcome','days','complaint_codes','complaint_categories','cv'],
    ACCUSED_CSV,
  );
  console.error(`[copy] complaints-accused: ${r3.rowCount} rows in ${r3.durationMs}ms`);
}

async function mergeOfficers(client) {
  // Date parsing: CSV has US short date "6/3/50" (2-digit year pre-Y2K implies 19xx/20xx).
  // Use a SQL helper to safely parse or return NULL.
  //
  // Birth year in the CSV is e.g. "1926.0" (pandas float). Strip ".0" and cast.
  const sql = `
    INSERT INTO public.cpd_officers (
      uid, officer_id, first_name, last_name, middle_initial, middle_initial2,
      suffix_name, appointed_date, birth_year, gender, race, current_star,
      cleaned_rank, current_rank, current_unit, current_status,
      resignation_date, org_hire_date, start_date, profile_count
    )
    SELECT
      NULLIF("UID",'')::bigint                                   AS uid,
      NULLIF(officer_id,'')::bigint                              AS officer_id,
      NULLIF(first_name,''),
      NULLIF(last_name,''),
      NULLIF(middle_initial,''),
      NULLIF(middle_initial2,''),
      NULLIF(suffix_name,''),
      CASE WHEN appointed_date ~ '^\\d{1,2}/\\d{1,2}/\\d{2,4}$'
           THEN (
             CASE WHEN length(split_part(appointed_date,'/',3)) = 2
                  AND split_part(appointed_date,'/',3)::int >= 30
                  THEN to_date('19'||split_part(appointed_date,'/',3)||'-'||split_part(appointed_date,'/',1)||'-'||split_part(appointed_date,'/',2),'YYYY-MM-DD')
                  WHEN length(split_part(appointed_date,'/',3)) = 2
                  THEN to_date('20'||split_part(appointed_date,'/',3)||'-'||split_part(appointed_date,'/',1)||'-'||split_part(appointed_date,'/',2),'YYYY-MM-DD')
                  ELSE to_date(appointed_date,'MM/DD/YYYY')
             END
           )
           ELSE NULL END                                          AS appointed_date,
      NULLIF(regexp_replace(birth_year,'\\.0$',''),'')::int      AS birth_year,
      NULLIF(gender,''),
      NULLIF(race,''),
      NULLIF(current_star,''),
      NULLIF(cleaned_rank,''),
      NULLIF(current_rank,''),
      NULLIF(current_unit,''),
      NULLIF(current_status,''),
      CASE WHEN resignation_date ~ '^\\d{1,2}/\\d{1,2}/\\d{2,4}$'
           THEN (
             CASE WHEN length(split_part(resignation_date,'/',3)) = 2
                  AND split_part(resignation_date,'/',3)::int >= 30
                  THEN to_date('19'||split_part(resignation_date,'/',3)||'-'||split_part(resignation_date,'/',1)||'-'||split_part(resignation_date,'/',2),'YYYY-MM-DD')
                  WHEN length(split_part(resignation_date,'/',3)) = 2
                  THEN to_date('20'||split_part(resignation_date,'/',3)||'-'||split_part(resignation_date,'/',1)||'-'||split_part(resignation_date,'/',2),'YYYY-MM-DD')
                  ELSE to_date(resignation_date,'MM/DD/YYYY')
             END
           )
           ELSE NULL END                                          AS resignation_date,
      CASE WHEN org_hire_date ~ '^\\d{1,2}/\\d{1,2}/\\d{2,4}$'
           THEN (
             CASE WHEN length(split_part(org_hire_date,'/',3)) = 2
                  AND split_part(org_hire_date,'/',3)::int >= 30
                  THEN to_date('19'||split_part(org_hire_date,'/',3)||'-'||split_part(org_hire_date,'/',1)||'-'||split_part(org_hire_date,'/',2),'YYYY-MM-DD')
                  WHEN length(split_part(org_hire_date,'/',3)) = 2
                  THEN to_date('20'||split_part(org_hire_date,'/',3)||'-'||split_part(org_hire_date,'/',1)||'-'||split_part(org_hire_date,'/',2),'YYYY-MM-DD')
                  ELSE to_date(org_hire_date,'MM/DD/YYYY')
             END
           )
           ELSE NULL END                                          AS org_hire_date,
      CASE WHEN start_date ~ '^\\d{1,2}/\\d{1,2}/\\d{2,4}$'
           THEN (
             CASE WHEN length(split_part(start_date,'/',3)) = 2
                  AND split_part(start_date,'/',3)::int >= 30
                  THEN to_date('19'||split_part(start_date,'/',3)||'-'||split_part(start_date,'/',1)||'-'||split_part(start_date,'/',2),'YYYY-MM-DD')
                  WHEN length(split_part(start_date,'/',3)) = 2
                  THEN to_date('20'||split_part(start_date,'/',3)||'-'||split_part(start_date,'/',1)||'-'||split_part(start_date,'/',2),'YYYY-MM-DD')
                  ELSE to_date(start_date,'MM/DD/YYYY')
             END
           )
           ELSE NULL END                                          AS start_date,
      NULLIF(profile_count,'')::int                              AS profile_count
    FROM public._stg_cpd_officers
    WHERE NULLIF("UID",'') IS NOT NULL
    ON CONFLICT (uid) DO UPDATE SET
      officer_id       = EXCLUDED.officer_id,
      first_name       = EXCLUDED.first_name,
      last_name        = EXCLUDED.last_name,
      middle_initial   = EXCLUDED.middle_initial,
      middle_initial2  = EXCLUDED.middle_initial2,
      suffix_name      = EXCLUDED.suffix_name,
      appointed_date   = EXCLUDED.appointed_date,
      birth_year       = EXCLUDED.birth_year,
      gender           = EXCLUDED.gender,
      race             = EXCLUDED.race,
      current_star     = EXCLUDED.current_star,
      cleaned_rank     = EXCLUDED.cleaned_rank,
      current_rank     = EXCLUDED.current_rank,
      current_unit     = EXCLUDED.current_unit,
      current_status   = EXCLUDED.current_status,
      resignation_date = EXCLUDED.resignation_date,
      org_hire_date    = EXCLUDED.org_hire_date,
      start_date       = EXCLUDED.start_date,
      profile_count    = EXCLUDED.profile_count,
      loaded_at        = NOW();
  `;
  const t0 = Date.now();
  const r = await client.query(sql);
  console.error(`[merge] cpd_officers: ${r.rowCount} rows upserted in ${Date.now()-t0}ms`);
}

async function mergeComplaints(client) {
  // JOIN accused (officer x cr) with parent (cr-level) — LEFT to keep accused
  // rows even if parent row is missing (some CRs only exist in one side).
  const sql = `
    INSERT INTO public.cpd_complaints (
      cr_id, uid, complaint_date, closed_date, incident_date, incident_time,
      days_to_closure, add1, add2, beat, city, location_code,
      latitude, longitude, complaint_status, investigating_agency,
      investigating_agencies, complainant_type,
      complaint_category, complaint_code, disciplined,
      final_finding, final_outcome, final_outcome_desc,
      recc_finding, recc_outcome, days, complaint_codes,
      complaint_categories, cv, source_filename
    )
    SELECT
      NULLIF(a.cr_id,'')                                     AS cr_id,
      NULLIF(a."UID",'')::bigint                             AS uid,
      NULLIF(p.complaint_date,'')::date                      AS complaint_date,
      NULLIF(p.closed_date,'')::date                         AS closed_date,
      NULLIF(p.incident_date,'')::date                       AS incident_date,
      NULLIF(p.incident_time,'')                             AS incident_time,
      NULLIF(regexp_replace(p.days_to_closure,'\\.0$',''),'')::int AS days_to_closure,
      NULLIF(p.add1,''),
      NULLIF(p.add2,''),
      NULLIF(p.beat,''),
      NULLIF(p.city,''),
      NULLIF(p.location_code,''),
      NULLIF(p.latitude,'')::double precision                AS latitude,
      NULLIF(p.longitude,'')::double precision               AS longitude,
      NULLIF(p.current_status,'')                            AS complaint_status,
      NULLIF(p.investigating_agency,''),
      NULLIF(p.investigating_agencies,''),
      NULLIF(p.complainant_type,''),
      NULLIF(a.complaint_category,''),
      NULLIF(a.complaint_code,''),
      CASE lower(NULLIF(a.disciplined,''))
        WHEN 'true' THEN true WHEN 'false' THEN false
        WHEN '1' THEN true WHEN '0' THEN false
        ELSE NULL END                                        AS disciplined,
      NULLIF(a.final_finding,''),
      NULLIF(a.final_outcome,''),
      NULLIF(a.final_outcome_desc,''),
      NULLIF(a.recc_finding,''),
      NULLIF(a.recc_outcome,''),
      NULLIF(regexp_replace(a.days,'\\.0$',''),'')::int      AS days,
      NULLIF(a.complaint_codes,''),
      NULLIF(a.complaint_categories,''),
      NULLIF(regexp_replace(a.cv,'\\.0$',''),'')::int        AS cv,
      NULLIF(p.filename,'')                                  AS source_filename
    FROM public._stg_cpd_complaints_accused a
    LEFT JOIN public._stg_cpd_complaints_parent p ON p.cr_id = a.cr_id
    WHERE NULLIF(a.cr_id,'') IS NOT NULL
      AND NULLIF(a."UID",'') IS NOT NULL
    ON CONFLICT (cr_id, uid) DO UPDATE SET
      complaint_date         = EXCLUDED.complaint_date,
      closed_date            = EXCLUDED.closed_date,
      incident_date          = EXCLUDED.incident_date,
      incident_time          = EXCLUDED.incident_time,
      days_to_closure        = EXCLUDED.days_to_closure,
      add1                   = EXCLUDED.add1,
      add2                   = EXCLUDED.add2,
      beat                   = EXCLUDED.beat,
      city                   = EXCLUDED.city,
      location_code          = EXCLUDED.location_code,
      latitude               = EXCLUDED.latitude,
      longitude              = EXCLUDED.longitude,
      complaint_status       = EXCLUDED.complaint_status,
      investigating_agency   = EXCLUDED.investigating_agency,
      investigating_agencies = EXCLUDED.investigating_agencies,
      complainant_type       = EXCLUDED.complainant_type,
      complaint_category     = EXCLUDED.complaint_category,
      complaint_code         = EXCLUDED.complaint_code,
      disciplined            = EXCLUDED.disciplined,
      final_finding          = EXCLUDED.final_finding,
      final_outcome          = EXCLUDED.final_outcome,
      final_outcome_desc     = EXCLUDED.final_outcome_desc,
      recc_finding           = EXCLUDED.recc_finding,
      recc_outcome           = EXCLUDED.recc_outcome,
      days                   = EXCLUDED.days,
      complaint_codes        = EXCLUDED.complaint_codes,
      complaint_categories   = EXCLUDED.complaint_categories,
      cv                     = EXCLUDED.cv,
      source_filename        = EXCLUDED.source_filename,
      loaded_at              = NOW();
  `;
  const t0 = Date.now();
  const r = await client.query(sql);
  console.error(`[merge] cpd_complaints: ${r.rowCount} rows upserted in ${Date.now()-t0}ms`);
}

async function dropStaging(client) {
  await client.query(`DROP TABLE IF EXISTS public._stg_cpd_officers,
                                           public._stg_cpd_complaints_parent,
                                           public._stg_cpd_complaints_accused`);
}

async function verify(client) {
  for (const t of ['cpd_officers','cpd_complaints']) {
    const r = await client.query(`SELECT COUNT(*)::bigint AS n FROM public.${t}`);
    console.error(`[verify] ${t}: ${r.rows[0].n}`);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.error(`[cpd-ii] start — apply=${OPTS.apply} noRefetch=${OPTS.noRefetch}`);

  await downloadZip();
  extractZip();
  verifyInputs();

  if (!OPTS.apply) {
    console.error(`[cpd-ii] dry-run — inputs ready, pass --apply to load`);
    console.error(`  officers:   ${OFFICERS_CSV}`);
    console.error(`  complaints: ${COMPLAINTS_CSV}`);
    console.error(`  accused:    ${ACCUSED_CSV}`);
    return;
  }

  const { client, cleanup } = await createBulkClient();
  try {
    await createStaging(client);
    await copyCsvs(client);
    await mergeOfficers(client);
    await mergeComplaints(client);
    await dropStaging(client);
    await verify(client);
    console.error(`[cpd-ii] done`);
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Template: scripts/build-judge-disposition-profile.mjs
// Expert: lukas-fittl
// Pattern: cl-bulk-data-defensive #17 (Albe) + docket-format normalization
// work-mem: Medium tier verified (256MB)
//
// v2: v1 produced 0 rows because docket_number formats differ between sources:
//   FJC IDB:    "0910394" (7-char YYNNNNN compact)
//   cl_dockets: "1:09-cr-10394" (PACER OFFICE:YY-TYPE-NNNNN)
// Join key: normalize both to (court_id, year_yy, seq_digits). Office + case
// type (cv vs cr) inferred from FJC dataset_source=4 (criminal → cr).

import fs from 'node:fs';
import pg from 'pg';

const envTxt = fs.readFileSync('C:/Users/email/projects/ImNotAnAttorney-web/.env.local', 'utf-8');
for (const line of envTxt.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function connect() {
  const { Client } = pg;
  const u = new URL(process.env.SUPABASE_DB_URL);
  u.port = '5432';
  const c = new Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false }, statement_timeout: 0 });
  await c.connect();
  await c.query(`SET statement_timeout = '2h'`);
  await c.query(`SET idle_in_transaction_session_timeout = '5min'`);
  await c.query(`SET tcp_keepalives_idle = 60`);
  await c.query(`SET tcp_keepalives_interval = 10`);
  await c.query(`SET tcp_keepalives_count = 6`);
  await c.query(`SET work_mem = '256MB'`);
  await c.query(`SET maintenance_work_mem = '512MB'`);
  return c;
}

async function timed(c, label, sql) {
  const t0 = Date.now();
  const r = await c.query(sql);
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  const rc = r.rowCount ?? r.rows?.length ?? 0;
  console.log(`  ${label}: ${rc} rows in ${dt}s`);
  return r;
}

async function main() {
  const c = await connect();
  try {
    console.log('PRE: TRUNCATE target');
    await c.query(`TRUNCATE public.judge_disposition_profile RESTART IDENTITY`);

    console.log('STEP 1: stage tmp_fjc_criminal_norm — FJC criminal with (year, seq) normalized');
    await c.query(`DROP TABLE IF EXISTS tmp_fjc_criminal_norm`);
    // FJC docket is YYNNNNN or OYYNNNNN. Take LAST 7 chars; first 2 = year, last 5 = seq
    await timed(c, '  tmp_fjc_criminal_norm', `
      CREATE UNLOGGED TABLE tmp_fjc_criminal_norm AS
      SELECT
        right(docket_number, 7) AS docket_raw,
        substring(right(docket_number, 7), 1, 2) AS yy,
        substring(right(docket_number, 7), 3) AS seq,
        district_id,
        nature_of_offense,
        disposition,
        nature_of_judgement,
        judgment
      FROM public.fjc_integrated_database
      WHERE dataset_source = '4'
        AND docket_number IS NOT NULL
        AND length(docket_number) >= 7
        AND district_id IS NOT NULL
    `);
    await c.query(`CREATE INDEX ON tmp_fjc_criminal_norm (district_id, yy, seq)`);
    await c.query(`ANALYZE tmp_fjc_criminal_norm`);

    console.log('STEP 2: stage tmp_cl_crim_norm — cl_dockets criminal with (year, seq) parsed from PACER format');
    await c.query(`DROP TABLE IF EXISTS tmp_cl_crim_norm`);
    await timed(c, '  tmp_cl_crim_norm', `
      CREATE UNLOGGED TABLE tmp_cl_crim_norm AS
      SELECT
        cd.assigned_to_id AS author_id,
        cd.court_id AS district_id,
        -- Parse PACER "O:YY-cr-NNNNN" → extract YY (between first ':' and '-cr-')
        (regexp_match(cd.docket_number, ':([0-9]{2})-cr-'))[1] AS yy,
        -- Extract seq after -cr- (digits only, strip suffix)
        (regexp_match(cd.docket_number, '-cr-0*([0-9]+)'))[1] AS seq
      FROM public.cl_dockets cd
      WHERE cd.docket_number ~ ':[0-9]{2}-cr-'
        AND cd.assigned_to_id IS NOT NULL
    `);
    await c.query(`CREATE INDEX ON tmp_cl_crim_norm (district_id, yy, seq)`);
    await c.query(`ANALYZE tmp_cl_crim_norm`);

    console.log('STEP 3: join — match on (district_id, yy, seq) with seq left-trimmed of zeros on both sides');
    await c.query(`DROP TABLE IF EXISTS tmp_judge_cases`);
    await timed(c, '  tmp_judge_cases (joined)', `
      CREATE UNLOGGED TABLE tmp_judge_cases AS
      SELECT
        cc.author_id,
        cc.district_id,
        fn.nature_of_offense,
        fn.disposition,
        fn.nature_of_judgement,
        fn.judgment
      FROM tmp_fjc_criminal_norm fn
      JOIN tmp_cl_crim_norm cc
        ON cc.district_id = fn.district_id
       AND cc.yy = fn.yy
       AND ltrim(cc.seq, '0') = ltrim(fn.seq, '0')
    `);
    await c.query(`CREATE INDEX ON tmp_judge_cases (author_id, district_id)`);
    await c.query(`ANALYZE tmp_judge_cases`);

    console.log('STEP 4: stage tmp_district_plea_rate');
    await c.query(`DROP TABLE IF EXISTS tmp_district_plea_rate`);
    await timed(c, '  tmp_district_plea_rate', `
      CREATE UNLOGGED TABLE tmp_district_plea_rate AS
      SELECT
        district_id,
        count(*)::int AS n_cases,
        (count(*) FILTER (WHERE disposition IN ('4','3'))::numeric
         / NULLIF(count(*) FILTER (WHERE disposition IS NOT NULL AND disposition NOT IN ('9','')), 0))::numeric(5,4) AS plea_rate
      FROM tmp_judge_cases
      GROUP BY district_id
    `);
    await c.query(`CREATE INDEX ON tmp_district_plea_rate (district_id)`);

    console.log('STEP 5: INSERT judge_disposition_profile');
    await timed(c, '  INSERT', `
      INSERT INTO public.judge_disposition_profile (
        judge_canonical_id, author_id, judge_name, offense_category,
        n_cases, n_disposed, n_plea, n_trial, n_dismissed, n_convicted,
        plea_rate, trial_rate, dismissal_rate, conviction_rate,
        district_id, district_plea_rate, deviation_vs_district
      )
      SELECT
        ej.canonical_id,
        jc.author_id,
        trim(concat_ws(' ', ej.name_first, ej.name_middle, ej.name_last, ej.name_suffix)) AS judge_name,
        NULL::text AS offense_category,
        count(*)::int AS n_cases,
        count(*) FILTER (WHERE jc.disposition IS NOT NULL AND jc.disposition NOT IN ('9',''))::int AS n_disposed,
        count(*) FILTER (WHERE jc.disposition IN ('3','4'))::int AS n_plea,
        count(*) FILTER (WHERE jc.disposition IN ('5','6','7','8'))::int AS n_trial,
        count(*) FILTER (WHERE jc.disposition IN ('1','2'))::int AS n_dismissed,
        count(*) FILTER (WHERE jc.disposition IN ('3','4','5','7'))::int AS n_convicted,
        (count(*) FILTER (WHERE jc.disposition IN ('3','4'))::numeric
         / NULLIF(count(*) FILTER (WHERE jc.disposition IS NOT NULL AND jc.disposition NOT IN ('9','')), 0))::numeric(5,4) AS plea_rate,
        (count(*) FILTER (WHERE jc.disposition IN ('5','6','7','8'))::numeric
         / NULLIF(count(*) FILTER (WHERE jc.disposition IS NOT NULL AND jc.disposition NOT IN ('9','')), 0))::numeric(5,4) AS trial_rate,
        (count(*) FILTER (WHERE jc.disposition IN ('1','2'))::numeric
         / NULLIF(count(*) FILTER (WHERE jc.disposition IS NOT NULL AND jc.disposition NOT IN ('9','')), 0))::numeric(5,4) AS dismissal_rate,
        (count(*) FILTER (WHERE jc.disposition IN ('3','4','5','7'))::numeric
         / NULLIF(count(*) FILTER (WHERE jc.disposition IS NOT NULL AND jc.disposition NOT IN ('9','')), 0))::numeric(5,4) AS conviction_rate,
        MAX(jc.district_id) AS district_id,
        MAX(dpr.plea_rate) AS district_plea_rate,
        (
          (count(*) FILTER (WHERE jc.disposition IN ('3','4'))::numeric
           / NULLIF(count(*) FILTER (WHERE jc.disposition IS NOT NULL AND jc.disposition NOT IN ('9','')), 0))
          - MAX(dpr.plea_rate)
        )::numeric(5,4) AS deviation_vs_district
      FROM tmp_judge_cases jc
      JOIN public.entities_judges ej ON ej.cl_person_id = jc.author_id
      LEFT JOIN tmp_district_plea_rate dpr ON dpr.district_id = jc.district_id
      GROUP BY ej.canonical_id, jc.author_id, ej.name_first, ej.name_middle, ej.name_last, ej.name_suffix
      HAVING count(*) >= 5
      ON CONFLICT (judge_canonical_id, offense_category) DO NOTHING
    `);

    console.log('STEP 6: drop staging');
    await c.query(`DROP TABLE IF EXISTS tmp_fjc_criminal_norm`);
    await c.query(`DROP TABLE IF EXISTS tmp_cl_crim_norm`);
    await c.query(`DROP TABLE IF EXISTS tmp_judge_cases`);
    await c.query(`DROP TABLE IF EXISTS tmp_district_plea_rate`);

    console.log('\n=== COUNTS ===');
    console.log(JSON.stringify((await c.query(`
      SELECT count(*)::int AS total,
             count(DISTINCT judge_canonical_id)::int AS distinct_judges,
             count(DISTINCT district_id)::int AS distinct_districts,
             avg(n_cases)::numeric(6,1) AS avg_cases_per_judge
      FROM public.judge_disposition_profile
    `)).rows[0], null, 2));

    console.log('\n=== TOP 15 JUDGES BY N_CASES ===');
    console.log(JSON.stringify((await c.query(`
      SELECT judge_name, district_id, n_cases, plea_rate, trial_rate, conviction_rate, deviation_vs_district
      FROM public.judge_disposition_profile ORDER BY n_cases DESC LIMIT 15
    `)).rows, null, 2));

    console.log('\n=== PLEA RATE DISTRIBUTION ===');
    console.log(JSON.stringify((await c.query(`
      SELECT round(plea_rate * 10) / 10 AS bucket, count(*)::int AS n_judges
      FROM public.judge_disposition_profile WHERE plea_rate IS NOT NULL
      GROUP BY round(plea_rate * 10) / 10 ORDER BY bucket
    `)).rows, null, 2));

    console.log('\n=== TOP 10 LOWEST CONVICTION RATES (n>=50) ===');
    console.log(JSON.stringify((await c.query(`
      SELECT judge_name, district_id, n_cases, conviction_rate, dismissal_rate
      FROM public.judge_disposition_profile WHERE n_cases >= 50 AND conviction_rate IS NOT NULL
      ORDER BY conviction_rate ASC LIMIT 10
    `)).rows, null, 2));

    console.log('\n=== TABLE SIZE ===');
    console.log((await c.query(`SELECT pg_size_pretty(pg_total_relation_size('public.judge_disposition_profile')) AS size`)).rows[0].size);
  } finally {
    try { await c.end(); } catch {}
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

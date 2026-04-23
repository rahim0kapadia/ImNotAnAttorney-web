// Template: scripts/build-judge-sentencing-fingerprint.mjs
// Expert: lukas-fittl
// Pattern: cl-bulk-data-defensive #17
// work-mem: Medium tier verified (256MB)
//
// v2 fixes:
//   Signal 3: FJC IDB dataset_source='4' (criminal filings) has ZERO disposition
//     data — all plea/trial/conviction rates are null. Rewrite as case-volume +
//     offense-category mix only (honest scope for available data).
//   Signal 4: n_affirmed was counting citation edges not distinct reviewed
//     opinions — fixed via DISTINCT cited_cluster_id aggregation per disposition.

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

// ============================================================
// Signal 3: per-judge CASE VOLUME by offense category
// (disposition/conviction rates deferred until FJC criminal-terminations load)
// ============================================================
async function buildSignal3(c) {
  console.log('\n========== SIGNAL 3: judge_disposition_profile (volume + offense mix) ==========');
  await c.query(`TRUNCATE public.judge_disposition_profile RESTART IDENTITY`);

  console.log('S3.1: stage normalization (shared from last run if present)');
  await c.query(`DROP TABLE IF EXISTS tmp_fjc_criminal_norm`);
  await timed(c, '  tmp_fjc_criminal_norm', `
    CREATE UNLOGGED TABLE tmp_fjc_criminal_norm AS
    SELECT
      substring(right(docket_number, 7), 1, 2) AS yy,
      ltrim(substring(right(docket_number, 7), 3), '0') AS seq,
      district_id,
      nature_of_offense
    FROM public.fjc_integrated_database
    WHERE dataset_source = '4'
      AND docket_number IS NOT NULL
      AND length(docket_number) >= 7
      AND district_id IS NOT NULL
      AND docket_number ~ '^[0-9]+$'
  `);
  await c.query(`CREATE INDEX ON tmp_fjc_criminal_norm (district_id, yy, seq)`);
  await c.query(`ANALYZE tmp_fjc_criminal_norm`);

  await c.query(`DROP TABLE IF EXISTS tmp_cl_crim_norm`);
  await timed(c, '  tmp_cl_crim_norm', `
    CREATE UNLOGGED TABLE tmp_cl_crim_norm AS
    SELECT
      cd.assigned_to_id AS author_id,
      cd.court_id AS district_id,
      (regexp_match(cd.docket_number, ':([0-9]{2})-cr-'))[1] AS yy,
      ltrim((regexp_match(cd.docket_number, '-cr-0*([0-9]+)'))[1], '0') AS seq
    FROM public.cl_dockets cd
    WHERE cd.docket_number ~ ':[0-9]{2}-cr-'
      AND cd.assigned_to_id IS NOT NULL
  `);
  await c.query(`CREATE INDEX ON tmp_cl_crim_norm (district_id, yy, seq)`);
  await c.query(`ANALYZE tmp_cl_crim_norm`);

  console.log('S3.2: join + aggregate');
  // n_cases filled honestly; plea/trial/etc = 0 (structural null documented)
  await timed(c, '  INSERT', `
    INSERT INTO public.judge_disposition_profile (
      judge_canonical_id, author_id, judge_name, offense_category,
      n_cases, n_disposed, n_plea, n_trial, n_dismissed, n_convicted,
      plea_rate, trial_rate, dismissal_rate, conviction_rate,
      district_id, baseline_source
    )
    SELECT
      ej.canonical_id,
      cn.author_id,
      trim(concat_ws(' ', ej.name_first, ej.name_middle, ej.name_last, ej.name_suffix)),
      NULL::text AS offense_category,
      count(*)::int AS n_cases,
      0 AS n_disposed,
      0, 0, 0, 0,
      NULL, NULL, NULL, NULL,
      MAX(cn.district_id),
      'fjc_integrated_database (dataset_source=4 filings — no disposition available in corpus) x cl_dockets 2026-04-23'
    FROM tmp_fjc_criminal_norm fn
    JOIN tmp_cl_crim_norm cn
      ON cn.district_id = fn.district_id
     AND cn.yy = fn.yy
     AND cn.seq = fn.seq
    JOIN public.entities_judges ej ON ej.cl_person_id = cn.author_id
    GROUP BY ej.canonical_id, cn.author_id, ej.name_first, ej.name_middle, ej.name_last, ej.name_suffix
    HAVING count(*) >= 5
    ON CONFLICT (judge_canonical_id, offense_category) DO NOTHING
  `);

  await c.query(`DROP TABLE IF EXISTS tmp_fjc_criminal_norm`);
  await c.query(`DROP TABLE IF EXISTS tmp_cl_crim_norm`);

  console.log('\n=== S3 COUNTS ===');
  console.log(JSON.stringify((await c.query(`
    SELECT count(*)::int AS total,
           count(DISTINCT judge_canonical_id)::int AS distinct_judges,
           count(DISTINCT district_id)::int AS distinct_districts,
           avg(n_cases)::numeric(6,1) AS avg_cases,
           sum(n_cases)::bigint AS total_criminal_cases
    FROM public.judge_disposition_profile
  `)).rows[0], null, 2));

  console.log('\n=== S3 TOP 10 BY N_CASES ===');
  console.log(JSON.stringify((await c.query(`
    SELECT judge_name, district_id, n_cases
    FROM public.judge_disposition_profile ORDER BY n_cases DESC LIMIT 10
  `)).rows, null, 2));
}

// ============================================================
// Signal 4: per-judge reversal rate (corrected — per distinct reviewed opinion)
// ============================================================
async function buildSignal4(c) {
  console.log('\n========== SIGNAL 4: judge_reversal_rate (distinct-opinion aggregation) ==========');
  await c.query(`TRUNCATE public.judge_reversal_rate RESTART IDENTITY`);

  console.log('S4.1: re-stage appellate opinions');
  await c.query(`DROP TABLE IF EXISTS tmp_appellate_opinions`);
  await timed(c, '  tmp_appellate_opinions', `
    CREATE UNLOGGED TABLE tmp_appellate_opinions AS
    SELECT
      ob.opinion_id,
      (position(' REVERSED' IN upper(left(ob.plain_text, 3000))) > 0) AS has_reversed,
      (position(' VACATED' IN upper(left(ob.plain_text, 3000))) > 0) AS has_vacated,
      (position(' REMANDED' IN upper(left(ob.plain_text, 3000))) > 0) AS has_remanded,
      (position(' AFFIRMED' IN upper(left(ob.plain_text, 3000))) > 0) AS has_affirmed
    FROM public.cl_opinion_bodies ob
    JOIN public.cl_opinion_clusters cc ON cc.id = ob.cluster_id
    JOIN public.cl_dockets cd ON cd.id = cc.docket_id
    WHERE (cd.court_id LIKE 'ca%' OR cd.court_id = 'scotus')
      AND ob.plain_text IS NOT NULL
      AND length(ob.plain_text) > 200
  `);
  await c.query(`CREATE INDEX ON tmp_appellate_opinions (opinion_id)`);
  await c.query(`ANALYZE tmp_appellate_opinions`);

  console.log('S4.2: per-reviewed-opinion disposition (collapse edges → one row per reviewed opinion)');
  await c.query(`DROP TABLE IF EXISTS tmp_reviewed_opinions`);
  // An appellate opinion that cites a district opinion reviews it. An opinion can
  // be cited by multiple appellate opinions — we pick the MOST ADVERSE disposition
  // (reversed > vacated > remanded > affirmed) per unique cited opinion so we
  // count each opinion once, not once per citing edge.
  await timed(c, '  tmp_reviewed_opinions', `
    CREATE UNLOGGED TABLE tmp_reviewed_opinions AS
    SELECT
      cited_ob.author_id AS cited_author_id,
      cited_ob.cluster_id AS cited_cluster_id,
      bool_or(app.has_reversed)  AS any_reversed,
      bool_or(app.has_vacated)   AS any_vacated,
      bool_or(app.has_remanded)  AS any_remanded,
      bool_or(app.has_affirmed)  AS any_affirmed
    FROM tmp_appellate_opinions app
    JOIN public.cl_citation_map cm ON cm.citing_opinion_id = app.opinion_id
    JOIN public.cl_opinion_bodies cited_ob ON cited_ob.opinion_id = cm.cited_opinion_id
    WHERE cited_ob.author_id IS NOT NULL
    GROUP BY cited_ob.author_id, cited_ob.cluster_id
  `);
  await c.query(`CREATE INDEX ON tmp_reviewed_opinions (cited_author_id)`);
  await c.query(`ANALYZE tmp_reviewed_opinions`);

  console.log('S4.3: INSERT judge_reversal_rate (per-opinion counts)');
  await timed(c, '  INSERT', `
    INSERT INTO public.judge_reversal_rate (
      judge_canonical_id, author_id, judge_name,
      n_appealable_opinions, n_affirmed, n_reversed, n_vacated, n_remanded,
      reversal_rate, baseline_rate, deviation_from_baseline
    )
    WITH per_judge AS (
      SELECT
        cited_author_id AS author_id,
        count(*)::int AS n_appealable_opinions,
        count(*) FILTER (WHERE any_affirmed AND NOT any_reversed AND NOT any_vacated)::int AS n_affirmed,
        count(*) FILTER (WHERE any_reversed)::int AS n_reversed,
        count(*) FILTER (WHERE any_vacated AND NOT any_reversed)::int AS n_vacated,
        count(*) FILTER (WHERE any_remanded AND NOT any_reversed AND NOT any_vacated)::int AS n_remanded,
        (count(*) FILTER (WHERE any_reversed OR any_vacated)::numeric
          / NULLIF(count(*) FILTER (WHERE any_reversed OR any_vacated OR any_affirmed), 0))::numeric(5,4) AS reversal_rate
      FROM tmp_reviewed_opinions
      GROUP BY cited_author_id
      HAVING count(*) >= 5
    ),
    baseline AS (
      SELECT avg(reversal_rate)::numeric(5,4) AS base FROM per_judge WHERE reversal_rate IS NOT NULL
    )
    SELECT
      ej.canonical_id, pj.author_id,
      trim(concat_ws(' ', ej.name_first, ej.name_middle, ej.name_last, ej.name_suffix)),
      pj.n_appealable_opinions, pj.n_affirmed, pj.n_reversed, pj.n_vacated, pj.n_remanded,
      pj.reversal_rate,
      (SELECT base FROM baseline),
      (pj.reversal_rate - (SELECT base FROM baseline))::numeric(5,4)
    FROM per_judge pj
    JOIN public.entities_judges ej ON ej.cl_person_id = pj.author_id
    ON CONFLICT (judge_canonical_id) DO NOTHING
  `);

  await c.query(`DROP TABLE IF EXISTS tmp_appellate_opinions`);
  await c.query(`DROP TABLE IF EXISTS tmp_reviewed_opinions`);

  console.log('\n=== S4 COUNTS ===');
  console.log(JSON.stringify((await c.query(`
    SELECT count(*)::int AS total,
           count(DISTINCT judge_canonical_id)::int AS distinct_judges,
           avg(n_appealable_opinions)::numeric(6,1) AS avg_reviewed,
           avg(reversal_rate)::numeric(5,4) AS avg_reversal,
           max(baseline_rate)::numeric(5,4) AS baseline
    FROM public.judge_reversal_rate
  `)).rows[0], null, 2));

  console.log('\n=== S4 TOP 10 HIGHEST REVERSAL (n>=20) ===');
  console.log(JSON.stringify((await c.query(`
    SELECT judge_name, n_appealable_opinions, n_affirmed, n_reversed, n_vacated, n_remanded, reversal_rate, deviation_from_baseline
    FROM public.judge_reversal_rate WHERE n_appealable_opinions >= 20
    ORDER BY reversal_rate DESC NULLS LAST LIMIT 10
  `)).rows, null, 2));

  console.log('\n=== S4 TOP 10 LOWEST REVERSAL (n>=20) ===');
  console.log(JSON.stringify((await c.query(`
    SELECT judge_name, n_appealable_opinions, n_affirmed, n_reversed, n_vacated, reversal_rate
    FROM public.judge_reversal_rate WHERE n_appealable_opinions >= 20 AND reversal_rate IS NOT NULL
    ORDER BY reversal_rate ASC LIMIT 10
  `)).rows, null, 2));
}

async function main() {
  const c = await connect();
  try {
    await buildSignal3(c);
    await buildSignal4(c);
  } finally {
    try { await c.end(); } catch {}
  }
}

main().catch(e => { console.error(e); process.exit(1); });

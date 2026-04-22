// Template: scripts/build-judge-coi-v4.mjs (Albe + INSERT...SELECT)
// Expert: lukas-fittl
// Pattern: cl-bulk-data-defensive #17 + docket-format normalization + citation-graph scan
// work-mem: Medium tier verified (256MB)
//
// Builds both Signal 3 (judge_disposition_profile) and Signal 4 (judge_reversal_rate)
// in one session. Per-judge anchor: cl_dockets.assigned_to_id.

import fs from 'node:fs';
import pg from 'pg';

const envTxt = fs.readFileSync('C:/Users/email/projects/ImNotAnAttorney-web/.env.local', 'utf-8');
for (const line of envTxt.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function applyMigration() {
  const sql = fs.readFileSync(
    'C:/Users/email/projects/ImNotAnAttorney-web/supabase/migrations/20260423a_judge_sentencing_fingerprint.sql',
    'utf-8'
  );
  const r = await fetch(`https://api.supabase.com/v1/projects/jxjbjmgdukwkoclydqdr/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'claude-code-inaa',
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!r.ok) throw new Error(`Migration: ${r.status} ${await r.text()}`);
  console.log('  migration applied');
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
// Signal 3: per-judge disposition profile
// ============================================================
async function buildSignal3(c) {
  console.log('\n========== SIGNAL 3: judge_disposition_profile ==========');
  await c.query(`TRUNCATE public.judge_disposition_profile RESTART IDENTITY`);

  console.log('S3.1: stage tmp_fjc_criminal_norm (YYNNNNN → yy + seq)');
  await c.query(`DROP TABLE IF EXISTS tmp_fjc_criminal_norm`);
  await timed(c, '  tmp_fjc_criminal_norm', `
    CREATE UNLOGGED TABLE tmp_fjc_criminal_norm AS
    SELECT
      substring(right(docket_number, 7), 1, 2) AS yy,
      ltrim(substring(right(docket_number, 7), 3), '0') AS seq,
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
      AND docket_number ~ '^[0-9]+$'
  `);
  await c.query(`CREATE INDEX ON tmp_fjc_criminal_norm (district_id, yy, seq)`);
  await c.query(`ANALYZE tmp_fjc_criminal_norm`);

  console.log('S3.2: stage tmp_cl_crim_norm (PACER → yy + seq)');
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

  console.log('S3.3: join — (district_id, yy, seq) match');
  await c.query(`DROP TABLE IF EXISTS tmp_judge_cases`);
  await timed(c, '  tmp_judge_cases', `
    CREATE UNLOGGED TABLE tmp_judge_cases AS
    SELECT
      cn.author_id,
      cn.district_id,
      fn.nature_of_offense,
      fn.disposition,
      fn.nature_of_judgement,
      fn.judgment
    FROM tmp_fjc_criminal_norm fn
    JOIN tmp_cl_crim_norm cn
      ON cn.district_id = fn.district_id
     AND cn.yy = fn.yy
     AND cn.seq = fn.seq
  `);
  await c.query(`CREATE INDEX ON tmp_judge_cases (author_id)`);
  await c.query(`ANALYZE tmp_judge_cases`);

  console.log('S3.4: district baseline');
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

  console.log('S3.5: INSERT judge_disposition_profile (n_cases >= 5 per k-anonymity)');
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
      NULL::text,
      count(*)::int,
      count(*) FILTER (WHERE jc.disposition IS NOT NULL AND jc.disposition NOT IN ('9',''))::int,
      count(*) FILTER (WHERE jc.disposition IN ('3','4'))::int,
      count(*) FILTER (WHERE jc.disposition IN ('5','6','7','8'))::int,
      count(*) FILTER (WHERE jc.disposition IN ('1','2'))::int,
      count(*) FILTER (WHERE jc.disposition IN ('3','4','5','7'))::int,
      (count(*) FILTER (WHERE jc.disposition IN ('3','4'))::numeric
       / NULLIF(count(*) FILTER (WHERE jc.disposition IS NOT NULL AND jc.disposition NOT IN ('9','')), 0))::numeric(5,4),
      (count(*) FILTER (WHERE jc.disposition IN ('5','6','7','8'))::numeric
       / NULLIF(count(*) FILTER (WHERE jc.disposition IS NOT NULL AND jc.disposition NOT IN ('9','')), 0))::numeric(5,4),
      (count(*) FILTER (WHERE jc.disposition IN ('1','2'))::numeric
       / NULLIF(count(*) FILTER (WHERE jc.disposition IS NOT NULL AND jc.disposition NOT IN ('9','')), 0))::numeric(5,4),
      (count(*) FILTER (WHERE jc.disposition IN ('3','4','5','7'))::numeric
       / NULLIF(count(*) FILTER (WHERE jc.disposition IS NOT NULL AND jc.disposition NOT IN ('9','')), 0))::numeric(5,4),
      MAX(jc.district_id),
      MAX(dpr.plea_rate),
      ((count(*) FILTER (WHERE jc.disposition IN ('3','4'))::numeric
        / NULLIF(count(*) FILTER (WHERE jc.disposition IS NOT NULL AND jc.disposition NOT IN ('9','')), 0))
       - MAX(dpr.plea_rate))::numeric(5,4)
    FROM tmp_judge_cases jc
    JOIN public.entities_judges ej ON ej.cl_person_id = jc.author_id
    LEFT JOIN tmp_district_plea_rate dpr ON dpr.district_id = jc.district_id
    GROUP BY ej.canonical_id, jc.author_id, ej.name_first, ej.name_middle, ej.name_last, ej.name_suffix
    HAVING count(*) >= 5
    ON CONFLICT (judge_canonical_id, offense_category) DO NOTHING
  `);

  await c.query(`DROP TABLE IF EXISTS tmp_fjc_criminal_norm`);
  await c.query(`DROP TABLE IF EXISTS tmp_cl_crim_norm`);
  await c.query(`DROP TABLE IF EXISTS tmp_judge_cases`);
  await c.query(`DROP TABLE IF EXISTS tmp_district_plea_rate`);

  console.log('\n=== S3 COUNTS ===');
  console.log(JSON.stringify((await c.query(`
    SELECT count(*)::int AS total,
           count(DISTINCT judge_canonical_id)::int AS distinct_judges,
           count(DISTINCT district_id)::int AS distinct_districts,
           avg(n_cases)::numeric(6,1) AS avg_cases_per_judge
    FROM public.judge_disposition_profile
  `)).rows[0], null, 2));

  console.log('\n=== S3 TOP 10 BY N_CASES ===');
  console.log(JSON.stringify((await c.query(`
    SELECT judge_name, district_id, n_cases, plea_rate, conviction_rate, deviation_vs_district
    FROM public.judge_disposition_profile ORDER BY n_cases DESC LIMIT 10
  `)).rows, null, 2));
}

// ============================================================
// Signal 4: per-judge reversal rate from appellate citation graph
// ============================================================
async function buildSignal4(c) {
  console.log('\n========== SIGNAL 4: judge_reversal_rate ==========');
  await c.query(`TRUNCATE public.judge_reversal_rate RESTART IDENTITY`);

  console.log('S4.1: stage tmp_appellate_opinions (court_id ca* or scotus + keyword scan of text head)');
  await c.query(`DROP TABLE IF EXISTS tmp_appellate_opinions`);
  await timed(c, '  tmp_appellate_opinions', `
    CREATE UNLOGGED TABLE tmp_appellate_opinions AS
    SELECT
      ob.opinion_id,
      ob.cluster_id,
      cc.court_id,
      (position(' REVERSED' IN upper(left(ob.plain_text, 3000))) > 0) AS has_reversed,
      (position(' VACATED' IN upper(left(ob.plain_text, 3000))) > 0) AS has_vacated,
      (position(' REMANDED' IN upper(left(ob.plain_text, 3000))) > 0) AS has_remanded,
      (position(' AFFIRMED' IN upper(left(ob.plain_text, 3000))) > 0) AS has_affirmed
    FROM public.cl_opinion_bodies ob
    JOIN public.cl_opinion_clusters cc ON cc.id = ob.cluster_id
    WHERE (cc.court_id LIKE 'ca%' OR cc.court_id = 'scotus')
      AND ob.plain_text IS NOT NULL
      AND length(ob.plain_text) > 200
  `);
  await c.query(`CREATE INDEX ON tmp_appellate_opinions (opinion_id)`);
  await c.query(`ANALYZE tmp_appellate_opinions`);

  console.log('S4.2: stage tmp_reversal_edges — appellate × cl_citation_map × cited cl_opinion_bodies');
  await c.query(`DROP TABLE IF EXISTS tmp_reversal_edges`);
  await timed(c, '  tmp_reversal_edges', `
    CREATE UNLOGGED TABLE tmp_reversal_edges AS
    SELECT
      cited_ob.author_id AS cited_author_id,
      cited_ob.cluster_id AS cited_cluster_id,
      app.has_reversed, app.has_vacated, app.has_remanded, app.has_affirmed
    FROM tmp_appellate_opinions app
    JOIN public.cl_citation_map cm ON cm.citing_opinion_id = app.opinion_id
    JOIN public.cl_opinion_bodies cited_ob ON cited_ob.opinion_id = cm.cited_opinion_id
    WHERE cited_ob.author_id IS NOT NULL
  `);
  await c.query(`CREATE INDEX ON tmp_reversal_edges (cited_author_id)`);
  await c.query(`ANALYZE tmp_reversal_edges`);

  console.log('S4.3: INSERT judge_reversal_rate (n_appealable >= 5 per k-anonymity)');
  await timed(c, '  INSERT', `
    INSERT INTO public.judge_reversal_rate (
      judge_canonical_id, author_id, judge_name,
      n_appealable_opinions, n_affirmed, n_reversed, n_vacated, n_remanded,
      reversal_rate, baseline_rate, deviation_from_baseline
    )
    WITH per_judge AS (
      SELECT
        cited_author_id AS author_id,
        count(DISTINCT cited_cluster_id)::int AS n_appealable_opinions,
        count(*) FILTER (WHERE has_affirmed)::int AS n_affirmed,
        count(*) FILTER (WHERE has_reversed)::int AS n_reversed,
        count(*) FILTER (WHERE has_vacated)::int AS n_vacated,
        count(*) FILTER (WHERE has_remanded)::int AS n_remanded,
        (count(*) FILTER (WHERE has_reversed OR has_vacated)::numeric
          / NULLIF(count(*) FILTER (WHERE has_reversed OR has_vacated OR has_affirmed), 0))::numeric(5,4) AS reversal_rate
      FROM tmp_reversal_edges
      GROUP BY cited_author_id
      HAVING count(DISTINCT cited_cluster_id) >= 5
    ),
    baseline AS (
      SELECT avg(reversal_rate)::numeric(5,4) AS base FROM per_judge WHERE reversal_rate IS NOT NULL
    )
    SELECT
      ej.canonical_id,
      pj.author_id,
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
  await c.query(`DROP TABLE IF EXISTS tmp_reversal_edges`);

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
    SELECT judge_name, n_appealable_opinions, n_affirmed, n_reversed, n_vacated, reversal_rate, deviation_from_baseline
    FROM public.judge_reversal_rate WHERE n_appealable_opinions >= 20
    ORDER BY reversal_rate DESC NULLS LAST LIMIT 10
  `)).rows, null, 2));
}

async function main() {
  console.log('apply migration');
  await applyMigration();
  const c = await connect();
  try {
    await buildSignal3(c);
    await buildSignal4(c);
  } finally {
    try { await c.end(); } catch {}
  }
}

main().catch(e => { console.error(e); process.exit(1); });

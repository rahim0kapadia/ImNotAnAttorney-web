// Template: scripts/build-judge-sentencing-fingerprint-v2.mjs
// Expert: lukas-fittl
// Pattern: cl-bulk-data-defensive #17
// work-mem: Medium tier verified (256MB)
//
// v3 upgrades:
//   Signal 4: federal-only filter via cl_courts.jurisdiction='F'; add
//             n_total_authored + true_reversal_rate (denom = all authored, not
//             just reviewed) to kill selection bias.
//   Signal 5: per-judge per-race sentencing delta from judge_sentencing_demographics.

import fs from 'node:fs';
import pg from 'pg';

const envTxt = fs.readFileSync('C:/Users/email/projects/ImNotAnAttorney-web/.env.local', 'utf-8');
for (const line of envTxt.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function applyMigration() {
  const sql = fs.readFileSync(
    'C:/Users/email/projects/ImNotAnAttorney-web/supabase/migrations/20260423b_judge_fingerprint_v3.sql',
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
// Signal 4 v3: federal-only + total-authored denominator
// ============================================================
async function buildSignal4v3(c) {
  console.log('\n========== SIGNAL 4 v3: judge_reversal_rate (federal-only + true rate) ==========');
  await c.query(`TRUNCATE public.judge_reversal_rate RESTART IDENTITY`);

  console.log('S4v3.1: stage federal appellate opinions (jurisdiction=F)');
  await c.query(`DROP TABLE IF EXISTS tmp_appellate_fed`);
  await timed(c, '  tmp_appellate_fed', `
    CREATE UNLOGGED TABLE tmp_appellate_fed AS
    SELECT
      ob.opinion_id,
      (position(' REVERSED' IN upper(left(ob.plain_text, 3000))) > 0) AS has_reversed,
      (position(' VACATED' IN upper(left(ob.plain_text, 3000))) > 0) AS has_vacated,
      (position(' REMANDED' IN upper(left(ob.plain_text, 3000))) > 0) AS has_remanded,
      (position(' AFFIRMED' IN upper(left(ob.plain_text, 3000))) > 0) AS has_affirmed
    FROM public.cl_opinion_bodies ob
    JOIN public.cl_opinion_clusters cc ON cc.id = ob.cluster_id
    JOIN public.cl_dockets cd ON cd.id = cc.docket_id
    JOIN public.cl_courts crt ON crt.id = cd.court_id
    WHERE crt.jurisdiction = 'F'
      AND ob.plain_text IS NOT NULL
      AND length(ob.plain_text) > 200
  `);
  await c.query(`CREATE INDEX ON tmp_appellate_fed (opinion_id)`);
  await c.query(`ANALYZE tmp_appellate_fed`);

  console.log('S4v3.2: per-reviewed-opinion disposition');
  await c.query(`DROP TABLE IF EXISTS tmp_reviewed_fed`);
  await timed(c, '  tmp_reviewed_fed', `
    CREATE UNLOGGED TABLE tmp_reviewed_fed AS
    SELECT
      cited_ob.author_id AS cited_author_id,
      cited_ob.cluster_id AS cited_cluster_id,
      bool_or(app.has_reversed) AS any_reversed,
      bool_or(app.has_vacated)  AS any_vacated,
      bool_or(app.has_remanded) AS any_remanded,
      bool_or(app.has_affirmed) AS any_affirmed
    FROM tmp_appellate_fed app
    JOIN public.cl_citation_map cm ON cm.citing_opinion_id = app.opinion_id
    JOIN public.cl_opinion_bodies cited_ob ON cited_ob.opinion_id = cm.cited_opinion_id
    WHERE cited_ob.author_id IS NOT NULL
    GROUP BY cited_ob.author_id, cited_ob.cluster_id
  `);
  await c.query(`CREATE INDEX ON tmp_reviewed_fed (cited_author_id)`);

  console.log('S4v3.3: per-judge total-authored count (for true_reversal_rate denominator)');
  await c.query(`DROP TABLE IF EXISTS tmp_judge_total_authored`);
  await timed(c, '  tmp_judge_total_authored', `
    CREATE UNLOGGED TABLE tmp_judge_total_authored AS
    SELECT
      author_id,
      count(DISTINCT cluster_id)::int AS n_total_authored
    FROM public.cl_opinion_bodies
    WHERE author_id IS NOT NULL
    GROUP BY author_id
  `);
  await c.query(`CREATE INDEX ON tmp_judge_total_authored (author_id)`);
  await c.query(`ANALYZE tmp_judge_total_authored`);

  console.log('S4v3.4: INSERT judge_reversal_rate with true rate + review coverage');
  await timed(c, '  INSERT', `
    INSERT INTO public.judge_reversal_rate (
      judge_canonical_id, author_id, judge_name,
      n_appealable_opinions, n_affirmed, n_reversed, n_vacated, n_remanded,
      reversal_rate, baseline_rate, deviation_from_baseline,
      n_total_authored, true_reversal_rate, review_coverage_rate,
      baseline_source
    )
    WITH per_judge_review AS (
      SELECT
        cited_author_id AS author_id,
        count(*)::int AS n_appealable_opinions,
        count(*) FILTER (WHERE any_affirmed AND NOT any_reversed AND NOT any_vacated)::int AS n_affirmed,
        count(*) FILTER (WHERE any_reversed)::int AS n_reversed,
        count(*) FILTER (WHERE any_vacated AND NOT any_reversed)::int AS n_vacated,
        count(*) FILTER (WHERE any_remanded AND NOT any_reversed AND NOT any_vacated)::int AS n_remanded
      FROM tmp_reviewed_fed
      GROUP BY cited_author_id
    ),
    joined AS (
      SELECT
        pjr.author_id,
        pjr.n_appealable_opinions, pjr.n_affirmed, pjr.n_reversed, pjr.n_vacated, pjr.n_remanded,
        ta.n_total_authored,
        (pjr.n_reversed + pjr.n_vacated)::numeric
          / NULLIF(pjr.n_appealable_opinions, 0)::numeric AS reversal_rate_conditional,
        (pjr.n_reversed + pjr.n_vacated)::numeric
          / NULLIF(ta.n_total_authored, 0)::numeric AS reversal_rate_true,
        pjr.n_appealable_opinions::numeric
          / NULLIF(ta.n_total_authored, 0)::numeric AS review_cov
      FROM per_judge_review pjr
      LEFT JOIN tmp_judge_total_authored ta ON ta.author_id = pjr.author_id
    ),
    baseline AS (
      SELECT
        avg(reversal_rate_conditional)::numeric(5,4) AS baseline_conditional
      FROM joined
      WHERE n_appealable_opinions >= 5
    )
    SELECT
      ej.canonical_id, j.author_id,
      trim(concat_ws(' ', ej.name_first, ej.name_middle, ej.name_last, ej.name_suffix)),
      j.n_appealable_opinions, j.n_affirmed, j.n_reversed, j.n_vacated, j.n_remanded,
      j.reversal_rate_conditional::numeric(5,4),
      (SELECT baseline_conditional FROM baseline),
      (j.reversal_rate_conditional - (SELECT baseline_conditional FROM baseline))::numeric(5,4),
      j.n_total_authored,
      j.reversal_rate_true::numeric(6,5),
      j.review_cov::numeric(5,4),
      'cl_opinion_bodies (jurisdiction=F appellate only) x cl_citation_map + total-authored denominator 2026-04-23'
    FROM joined j
    JOIN public.entities_judges ej ON ej.cl_person_id = j.author_id
    WHERE j.n_appealable_opinions >= 5
    ON CONFLICT (judge_canonical_id) DO NOTHING
  `);

  await c.query(`DROP TABLE IF EXISTS tmp_appellate_fed`);
  await c.query(`DROP TABLE IF EXISTS tmp_reviewed_fed`);
  await c.query(`DROP TABLE IF EXISTS tmp_judge_total_authored`);

  console.log('\n=== S4v3 COUNTS ===');
  console.log(JSON.stringify((await c.query(`
    SELECT count(*)::int AS total,
           avg(n_appealable_opinions)::numeric(6,1) AS avg_reviewed,
           avg(n_total_authored)::numeric(6,1) AS avg_authored,
           avg(reversal_rate)::numeric(5,4) AS avg_rev_conditional,
           avg(true_reversal_rate)::numeric(6,5) AS avg_rev_true,
           avg(review_coverage_rate)::numeric(5,4) AS avg_review_cov
    FROM public.judge_reversal_rate
  `)).rows[0], null, 2));

  console.log('\n=== S4v3 TOP 10 TRUE REVERSAL (n_total >= 50) ===');
  console.log(JSON.stringify((await c.query(`
    SELECT judge_name, n_total_authored, n_appealable_opinions, n_reversed, n_vacated,
           reversal_rate AS cond_rate, true_reversal_rate, review_coverage_rate
    FROM public.judge_reversal_rate
    WHERE n_total_authored >= 50 AND n_appealable_opinions >= 5
    ORDER BY true_reversal_rate DESC NULLS LAST LIMIT 10
  `)).rows, null, 2));
}

// ============================================================
// Signal 5: per-judge demographic sentencing
// ============================================================
async function buildSignal5(c) {
  console.log('\n========== SIGNAL 5: judge_demographic_sentencing ==========');
  await c.query(`TRUNCATE public.judge_demographic_sentencing RESTART IDENTITY`);

  console.log('S5.1: INSERT from judge_sentencing_demographics + compute deltas');
  await timed(c, '  INSERT', `
    WITH per_judge_overall AS (
      -- Each judge's cross-race median (weighted avg)
      SELECT judge_name_normalized, district,
             SUM(total_cases)::int AS total_cases_all,
             (SUM(median_sentence_months * total_cases) / NULLIF(SUM(total_cases), 0))::numeric(8,2) AS overall_weighted_median
      FROM public.judge_sentencing_demographics
      GROUP BY judge_name_normalized, district
    ),
    per_district AS (
      SELECT district, defendant_race,
             (SUM(median_sentence_months * total_cases) / NULLIF(SUM(total_cases), 0))::numeric(8,2) AS district_median_for_race
      FROM public.judge_sentencing_demographics
      GROUP BY district, defendant_race
    )
    INSERT INTO public.judge_demographic_sentencing (
      judge_canonical_id, judge_name_normalized, judge_name, district,
      defendant_race, total_cases, median_sentence_months, mean_sentence_months,
      guideline_departure_rate, avg_departure_pct,
      delta_vs_judge_overall_median_months, delta_vs_district_median_months,
      source_urls
    )
    SELECT
      ej.canonical_id,
      jsd.judge_name_normalized,
      CASE WHEN ej.canonical_id IS NOT NULL
        THEN trim(concat_ws(' ', ej.name_first, ej.name_middle, ej.name_last, ej.name_suffix))
        ELSE jsd.judge_name_normalized
      END AS judge_name,
      jsd.district,
      jsd.defendant_race,
      jsd.total_cases,
      jsd.median_sentence_months,
      jsd.mean_sentence_months,
      jsd.guideline_departure_rate,
      jsd.avg_departure_pct,
      (jsd.median_sentence_months - pjo.overall_weighted_median)::numeric(8,2) AS delta_vs_overall,
      (jsd.median_sentence_months - pd.district_median_for_race)::numeric(8,2) AS delta_vs_district,
      jsd.source_urls
    FROM public.judge_sentencing_demographics jsd
    LEFT JOIN per_judge_overall pjo ON pjo.judge_name_normalized = jsd.judge_name_normalized AND pjo.district = jsd.district
    LEFT JOIN per_district pd ON pd.district = jsd.district AND pd.defendant_race = jsd.defendant_race
    LEFT JOIN public.entities_judges ej
      ON lower(trim(concat_ws(' ', ej.name_first, ej.name_last))) = jsd.judge_name_normalized
    WHERE jsd.total_cases >= 5
    ON CONFLICT (judge_name_normalized, district, defendant_race) DO NOTHING
  `);

  console.log('\n=== S5 COUNTS ===');
  console.log(JSON.stringify((await c.query(`
    SELECT count(*)::int AS total,
           count(DISTINCT judge_name_normalized)::int AS distinct_judges,
           count(*) FILTER (WHERE judge_canonical_id IS NOT NULL)::int AS canonicalized,
           count(DISTINCT defendant_race)::int AS distinct_races
    FROM public.judge_demographic_sentencing
  `)).rows[0], null, 2));

  console.log('\n=== S5 RACE DISTRIBUTION ===');
  console.log(JSON.stringify((await c.query(`
    SELECT defendant_race, count(*)::int AS n, avg(median_sentence_months)::numeric(6,2) AS avg_median
    FROM public.judge_demographic_sentencing
    GROUP BY defendant_race ORDER BY n DESC
  `)).rows, null, 2));

  console.log('\n=== S5 TOP 10 LARGEST POSITIVE DELTA VS JUDGE OVERALL (harsher than judge average) ===');
  console.log(JSON.stringify((await c.query(`
    SELECT judge_name, defendant_race, total_cases,
           median_sentence_months, delta_vs_judge_overall_median_months
    FROM public.judge_demographic_sentencing
    WHERE total_cases >= 10 AND delta_vs_judge_overall_median_months IS NOT NULL
    ORDER BY delta_vs_judge_overall_median_months DESC LIMIT 10
  `)).rows, null, 2));

  console.log('\n=== S5 TOP 10 LARGEST NEGATIVE DELTA VS JUDGE OVERALL (leniency) ===');
  console.log(JSON.stringify((await c.query(`
    SELECT judge_name, defendant_race, total_cases,
           median_sentence_months, delta_vs_judge_overall_median_months
    FROM public.judge_demographic_sentencing
    WHERE total_cases >= 10 AND delta_vs_judge_overall_median_months IS NOT NULL
    ORDER BY delta_vs_judge_overall_median_months ASC LIMIT 10
  `)).rows, null, 2));
}

async function main() {
  console.log('apply migration');
  await applyMigration();
  const c = await connect();
  try {
    await buildSignal4v3(c);
    await buildSignal5(c);
  } finally {
    try { await c.end(); } catch {}
  }
}

main().catch(e => { console.error(e); process.exit(1); });

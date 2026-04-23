// Template: scripts/build-judge-fingerprint-v3.mjs
// Expert: lukas-fittl
// Pattern: cl-bulk-data-defensive #17
// work-mem: Medium tier verified (256MB)
//
// v3-safe: applies Round 1 CRITICAL findings from worry-to-pristine loop:
//   Signal 4 — WHERE tightened: n_total_authored >= 50 AND (n_reversed+n_vacated) >= 5
//              so table only carries judges with statistically meaningful denominators.
//   Signal 5 — surname-collision guard via HAVING count(DISTINCT canonical_id) = 1
//              per normalized name, so ambiguous name matches NULL out instead of
//              being silently assigned to whichever entity row Postgres picked first.
//   Signal 5 — k-anonymity raised to >= 11 (Sweeney 2013, NIST l-diversity).
//   Signal 5 — baseline CIRCULARITY removed: per-district per-race median now
//              excludes the current judge's own rows (jackknife baseline).

import fs from 'node:fs';
import pg from 'pg';

const envTxt = fs.readFileSync('C:/Users/email/projects/ImNotAnAttorney-web/.env.local', 'utf-8');
for (const line of envTxt.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function applyMigration() {
  const sql = fs.readFileSync(
    'C:/Users/email/projects/ImNotAnAttorney-web/supabase/migrations/20260423c_judge_fingerprint_safety.sql',
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
  console.log('  safety migration applied');
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
// Signal 4 safety: tighten WHERE in INSERT
// ============================================================
async function retightenSignal4(c) {
  console.log('\n========== SIGNAL 4 safety: tighten denominator gates ==========');
  console.log('  Drop rows with n_total_authored < 50 OR (n_reversed + n_vacated) < 5');
  await timed(c, '  DELETE', `
    DELETE FROM public.judge_reversal_rate
    WHERE n_total_authored IS NULL
       OR n_total_authored < 50
       OR (n_reversed + n_vacated) < 5
  `);

  console.log('\n=== S4 SAFE COUNTS ===');
  console.log(JSON.stringify((await c.query(`
    SELECT count(*)::int AS total,
           min(n_total_authored)::int AS min_authored,
           avg(n_total_authored)::numeric(6,1) AS avg_authored,
           avg(true_reversal_rate)::numeric(6,5) AS avg_rev_true
    FROM public.judge_reversal_rate
  `)).rows[0], null, 2));

  console.log('\n=== S4 SAFE TOP 10 TRUE REVERSAL ===');
  console.log(JSON.stringify((await c.query(`
    SELECT judge_name, n_total_authored, n_appealable_opinions, n_reversed, n_vacated,
           reversal_rate AS cond_rate, true_reversal_rate, review_coverage_rate
    FROM public.judge_reversal_rate
    ORDER BY true_reversal_rate DESC NULLS LAST LIMIT 10
  `)).rows, null, 2));
}

// ============================================================
// Signal 5 safety: surname-collision guard + jackknife baseline + k>=11
// ============================================================
async function rebuildSignal5Safe(c) {
  console.log('\n========== SIGNAL 5 safety: rebuild with collision guard + jackknife + k>=11 ==========');
  await c.query(`TRUNCATE public.judge_demographic_sentencing RESTART IDENTITY`);

  console.log('S5safe.1: rebuild with guards');
  await timed(c, '  INSERT', `
    WITH per_judge_overall AS (
      -- Each judge's cross-race overall median (weighted by case count)
      SELECT judge_name_normalized, district,
             SUM(total_cases)::int AS total_cases_all,
             (SUM(median_sentence_months * total_cases) / NULLIF(SUM(total_cases), 0))::numeric(8,2) AS overall_weighted_median
      FROM public.judge_sentencing_demographics
      GROUP BY judge_name_normalized, district
    ),
    per_district_jackknife AS (
      -- Per-district per-race median EXCLUDING each judge (prevents baseline circularity:
      -- a dominant judge no longer pulls the baseline toward their own rate).
      SELECT a.district, a.defendant_race, a.judge_name_normalized AS exclude_judge,
             (SUM(b.median_sentence_months * b.total_cases)
               / NULLIF(SUM(b.total_cases), 0))::numeric(8,2) AS district_median_for_race_excl
      FROM public.judge_sentencing_demographics a
      JOIN public.judge_sentencing_demographics b
        ON b.district = a.district
       AND b.defendant_race = a.defendant_race
       AND b.judge_name_normalized <> a.judge_name_normalized
      GROUP BY a.district, a.defendant_race, a.judge_name_normalized
    ),
    ej_unique AS (
      -- Surname-collision guard: only expose canonical_id if normalized name
      -- maps to EXACTLY ONE canonical entity.  Ambiguous surnames -> NULL.
      SELECT lower(trim(concat_ws(' ', name_first, name_last))) AS norm_name,
             (array_agg(canonical_id))[1] AS canonical_id,
             MIN(name_middle) AS name_middle,
             MIN(name_suffix) AS name_suffix,
             MIN(name_first) AS name_first,
             MIN(name_last) AS name_last
      FROM public.entities_judges
      WHERE name_first IS NOT NULL AND name_last IS NOT NULL
      GROUP BY 1
      HAVING count(DISTINCT canonical_id) = 1
    )
    INSERT INTO public.judge_demographic_sentencing (
      judge_canonical_id, judge_name_normalized, judge_name, district,
      defendant_race, total_cases, median_sentence_months, mean_sentence_months,
      guideline_departure_rate, avg_departure_pct,
      delta_vs_judge_overall_median_months, delta_vs_district_median_months,
      source_urls, methodology_url
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
      (jsd.median_sentence_months - pdj.district_median_for_race_excl)::numeric(8,2) AS delta_vs_district_jk,
      jsd.source_urls,
      'https://imnotanattorney.com/methodology/judge-demographic-sentencing'
    FROM public.judge_sentencing_demographics jsd
    LEFT JOIN per_judge_overall pjo
      ON pjo.judge_name_normalized = jsd.judge_name_normalized
     AND pjo.district = jsd.district
    LEFT JOIN per_district_jackknife pdj
      ON pdj.district = jsd.district
     AND pdj.defendant_race = jsd.defendant_race
     AND pdj.exclude_judge = jsd.judge_name_normalized
    LEFT JOIN ej_unique ej ON ej.norm_name = jsd.judge_name_normalized
    WHERE jsd.total_cases >= 11
    ON CONFLICT (judge_name_normalized, district, defendant_race) DO NOTHING
  `);

  console.log('\n=== S5 SAFE COUNTS ===');
  console.log(JSON.stringify((await c.query(`
    SELECT count(*)::int AS total,
           count(DISTINCT judge_name_normalized)::int AS distinct_judges,
           count(*) FILTER (WHERE judge_canonical_id IS NOT NULL)::int AS canonicalized,
           count(*) FILTER (WHERE judge_canonical_id IS NULL)::int AS uncanonicalized,
           count(DISTINCT defendant_race)::int AS distinct_races,
           min(total_cases)::int AS min_cell
    FROM public.judge_demographic_sentencing
  `)).rows[0], null, 2));

  console.log('\n=== S5 SAFE — rows visible to anon (RLS post-migration) ===');
  console.log(JSON.stringify((await c.query(`
    SELECT count(*)::int AS public_rows,
           count(DISTINCT judge_canonical_id)::int AS public_judges
    FROM public.judge_demographic_sentencing
    WHERE judge_canonical_id IS NOT NULL
  `)).rows[0], null, 2));

  console.log('\n=== S5 SAFE — RACE DISTRIBUTION (canonicalized only) ===');
  console.log(JSON.stringify((await c.query(`
    SELECT defendant_race, count(*)::int AS n, avg(median_sentence_months)::numeric(6,2) AS avg_median
    FROM public.judge_demographic_sentencing
    WHERE judge_canonical_id IS NOT NULL
    GROUP BY defendant_race ORDER BY n DESC
  `)).rows, null, 2));

  console.log('\n=== S5 SAFE TOP 5 POSITIVE DELTA VS JUDGE OVERALL (canonicalized, n>=11) ===');
  console.log(JSON.stringify((await c.query(`
    SELECT judge_name, defendant_race, total_cases,
           median_sentence_months, delta_vs_judge_overall_median_months,
           delta_vs_district_median_months
    FROM public.judge_demographic_sentencing
    WHERE judge_canonical_id IS NOT NULL
      AND delta_vs_judge_overall_median_months IS NOT NULL
    ORDER BY delta_vs_judge_overall_median_months DESC LIMIT 5
  `)).rows, null, 2));

  console.log('\n=== S5 SAFE TOP 5 NEGATIVE DELTA ===');
  console.log(JSON.stringify((await c.query(`
    SELECT judge_name, defendant_race, total_cases,
           median_sentence_months, delta_vs_judge_overall_median_months,
           delta_vs_district_median_months
    FROM public.judge_demographic_sentencing
    WHERE judge_canonical_id IS NOT NULL
      AND delta_vs_judge_overall_median_months IS NOT NULL
    ORDER BY delta_vs_judge_overall_median_months ASC LIMIT 5
  `)).rows, null, 2));
}

// ============================================================
// Finding 6 quantification: Signal 5 normalization drop audit
// ============================================================
async function auditSignal5Drops(c) {
  console.log('\n========== Signal 5 normalization drop audit ==========');
  console.log(JSON.stringify((await c.query(`
    SELECT
      (SELECT count(*) FROM public.judge_sentencing_demographics) AS source_rows,
      (SELECT count(*) FROM public.judge_sentencing_demographics WHERE total_cases >= 11) AS passed_kanon_11,
      (SELECT count(*) FROM public.judge_demographic_sentencing) AS loaded_rows,
      (SELECT count(*) FROM public.judge_demographic_sentencing WHERE judge_canonical_id IS NOT NULL) AS canonicalized,
      (SELECT count(DISTINCT judge_name_normalized) FROM public.judge_sentencing_demographics) AS source_distinct_judges,
      (SELECT count(DISTINCT judge_name_normalized) FROM public.judge_demographic_sentencing) AS loaded_distinct_judges,
      (SELECT count(DISTINCT judge_name_normalized) FROM public.judge_demographic_sentencing WHERE judge_canonical_id IS NOT NULL) AS canonicalized_distinct_judges
  `)).rows[0], null, 2));
}

async function main() {
  console.log('apply safety migration');
  await applyMigration();
  const c = await connect();
  try {
    await retightenSignal4(c);
    await rebuildSignal5Safe(c);
    await auditSignal5Drops(c);
  } finally {
    try { await c.end(); } catch {}
  }
}

main().catch(e => { console.error(e); process.exit(1); });

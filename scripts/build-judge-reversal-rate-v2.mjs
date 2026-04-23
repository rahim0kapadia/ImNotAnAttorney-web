// Template: scripts/build-judge-sentencing-fingerprint.mjs
// Expert: lukas-fittl
// Pattern: cl-bulk-data-defensive #17
// work-mem: Medium tier verified (256MB)
//
// v2: v1 errored on cl_opinion_clusters.court_id (col doesn't exist — clusters
// have docket_id that joins to cl_dockets for court). Signal 4 only.

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
    await c.query(`TRUNCATE public.judge_reversal_rate RESTART IDENTITY`);

    console.log('S4.1: stage tmp_appellate_opinions — court via cl_dockets join');
    await c.query(`DROP TABLE IF EXISTS tmp_appellate_opinions`);
    await timed(c, '  tmp_appellate_opinions', `
      CREATE UNLOGGED TABLE tmp_appellate_opinions AS
      SELECT
        ob.opinion_id,
        ob.cluster_id,
        cd.court_id,
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

    console.log('S4.2: stage tmp_reversal_edges');
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

    console.log('S4.3: INSERT judge_reversal_rate');
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
    await c.query(`DROP TABLE IF EXISTS tmp_reversal_edges`);

    console.log('\n=== COUNTS ===');
    console.log(JSON.stringify((await c.query(`
      SELECT count(*)::int AS total,
             count(DISTINCT judge_canonical_id)::int AS distinct_judges,
             avg(n_appealable_opinions)::numeric(6,1) AS avg_reviewed,
             avg(reversal_rate)::numeric(5,4) AS avg_reversal,
             max(baseline_rate)::numeric(5,4) AS baseline
      FROM public.judge_reversal_rate
    `)).rows[0], null, 2));

    console.log('\n=== TOP 10 HIGHEST REVERSAL (n>=20) ===');
    console.log(JSON.stringify((await c.query(`
      SELECT judge_name, n_appealable_opinions, n_affirmed, n_reversed, n_vacated, reversal_rate, deviation_from_baseline
      FROM public.judge_reversal_rate WHERE n_appealable_opinions >= 20
      ORDER BY reversal_rate DESC NULLS LAST LIMIT 10
    `)).rows, null, 2));

    console.log('\n=== TOP 10 LOWEST REVERSAL (n>=20) ===');
    console.log(JSON.stringify((await c.query(`
      SELECT judge_name, n_appealable_opinions, n_affirmed, n_reversed, n_vacated, reversal_rate
      FROM public.judge_reversal_rate WHERE n_appealable_opinions >= 20 AND reversal_rate IS NOT NULL
      ORDER BY reversal_rate ASC LIMIT 10
    `)).rows, null, 2));
  } finally {
    try { await c.end(); } catch {}
  }
}

main().catch(e => { console.error(e); process.exit(1); });

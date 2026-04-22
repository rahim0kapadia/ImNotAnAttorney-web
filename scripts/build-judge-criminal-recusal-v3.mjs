// Template: scripts/build-judge-criminal-recusal-v2.mjs
// Expert: lukas-fittl
// Pattern: cl-bulk-data-defensive #17 (Albe) + per-author batching
// csv-bulk-checked: N/A
// work-mem: Medium tier verified (256MB)
//
// v3 — v2 staging survived (tmp_jp_active 315K rows). Instead of one giant
// INSERT over all 315K (author, phrase) pairs, batch by author_id chunks.
// Each batch is O(chunk_size × avg_phrases × avg_opinions × FTS_cost) and
// commits visibly, so we can watch progress.

import fs from 'node:fs';
import pg from 'pg';

const envTxt = fs.readFileSync('C:/Users/email/projects/ImNotAnAttorney-web/.env.local', 'utf-8');
for (const line of envTxt.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const VALUE_CODES = {
  A: '$1-$1,000', B: '$1,001-$2,500', C: '$2,501-$5,000', D: '$5,001-$15,000',
  E: '$15,001-$50,000', F: '$50,001-$100,000', G: '$100,001-$1,000,000',
  H1: '$1,000,001-$5,000,000', H2: '$5,000,001+',
  J: '$1-$15,000', K: '$15,001-$50,000', L: '$50,001-$100,000',
  M: '$100,001-$250,000', N: '$250,001-$500,000', O: '$500,001-$1,000,000',
  P1: '$1,000,001-$5,000,000', P2: '$5,000,001-$25,000,000',
  P3: '$25,000,001-$50,000,000', P4: '$50,000,001+',
};
function sqlStr(s) { return `'${String(s).replace(/'/g, "''")}'`; }
function valueCaseSql(col) {
  const cases = Object.entries(VALUE_CODES).map(([code, label]) => `WHEN ${col}=${sqlStr(code)} THEN ${sqlStr(label)}`).join(' ');
  return `CASE ${cases} ELSE NULL END`;
}

async function connect() {
  const { Client } = pg;
  const u = new URL(process.env.SUPABASE_DB_URL);
  u.port = '5432';
  const c = new Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false }, statement_timeout: 0 });
  await c.connect();
  await c.query(`SET statement_timeout = '2h'`);  // raised from 25min — some batches (prolific judges with long opinions) exceed 25min per-row FTS+ts_headline
  await c.query(`SET idle_in_transaction_session_timeout = '5min'`);
  await c.query(`SET tcp_keepalives_idle = 60`);
  await c.query(`SET tcp_keepalives_interval = 10`);
  await c.query(`SET tcp_keepalives_count = 6`);
  await c.query(`SET work_mem = '256MB'`);
  await c.query(`SET maintenance_work_mem = '512MB'`);
  return c;
}

async function main() {
  const c = await connect();
  try {
    // Resume: skip TRUNCATE so batches 1+2 (116 rows) are preserved.
    // ON CONFLICT DO NOTHING keeps re-runs idempotent.
    const existing = await c.query(`SELECT count(*)::int AS n FROM public.judge_criminal_case_conflicts`);
    console.log(`PRE: resume mode — ${existing.rows[0].n} existing rows preserved`);

    const staging = await c.query(`SELECT relname, reltuples::bigint AS n FROM pg_class WHERE relname IN ('tmp_judge_phrases','tmp_jp_active')`);
    console.log('staging:', JSON.stringify(staging.rows, null, 2));
    if (staging.rows.length < 2) throw new Error('staging missing — re-run v2 stages 1+2');

    const authorList = await c.query(`SELECT DISTINCT author_id FROM tmp_jp_active ORDER BY author_id`);
    const authorsFull = authorList.rows.map(r => r.author_id);
    // Resume: skip authors already processed via inserted rows. Identify them via
    // the cl_person_id → judge_canonical_id join; any judge with >=1 row is done.
    const doneRes = await c.query(`
      SELECT DISTINCT ej.cl_person_id AS author_id
      FROM public.judge_criminal_case_conflicts coi
      JOIN entities_judges ej ON ej.canonical_id = coi.judge_canonical_id
    `);
    const doneSet = new Set(doneRes.rows.map(r => String(r.author_id)));
    // Batches 1+2 covered first 200 authors — also skip those with zero matches
    // (they're done, just have no rows). Conservative: skip first 200 outright
    // then the doneSet handles the rest.
    const PROCESSED_PREFIX = 200;
    const authors = authorsFull.slice(PROCESSED_PREFIX).filter(id => !doneSet.has(String(id)));
    console.log(`  ${authorsFull.length} total authors; skipping first ${PROCESSED_PREFIX} (batches 1+2) + ${doneSet.size} with existing rows; ${authors.length} remaining`);

    const BATCH = 100;
    const valSql = valueCaseSql('jp.gross_value_code');
    let totalInserted = 0;
    const tAll = Date.now();

    for (let i = 0; i < authors.length; i += BATCH) {
      const chunk = authors.slice(i, i + BATCH);
      const placeholders = chunk.map((_, k) => `$${k + 1}::bigint`).join(',');
      const sql = `
        INSERT INTO public.judge_criminal_case_conflicts (
          judge_canonical_id, judge_name,
          cluster_id, opinion_id, case_name, case_name_short,
          investment_id, company_holding, holding_value_code, holding_value_estimate,
          holding_description, excerpt,
          match_confidence, match_type,
          disclosure_id, disclosure_year, disclosure_url,
          case_year, case_url,
          charge_types, holding_text
        )
        SELECT
          jp.judge_canonical_id, jp.judge_name,
          m.cluster_id, m.opinion_id, m.case_name, m.case_name_short,
          jp.investment_id, upper(trim(jp.holding_description)) AS company_holding,
          jp.gross_value_code, ${valSql} AS holding_value_estimate,
          jp.holding_description,
          m.excerpt,
          1.0::real, 'phrase',
          jp.disclosure_id, jp.disclosure_year,
          'https://www.courtlistener.com/financial-disclosures/' || jp.disclosure_id || '/',
          m.case_year,
          'https://www.courtlistener.com/opinion/' || m.cluster_id || '/' || COALESCE(m.slug, '') || '/',
          m.charge_types, m.holding_text
        FROM tmp_jp_active jp
        CROSS JOIN LATERAL (
          SELECT ob.cluster_id, ob.opinion_id,
                 cc.case_name, cc.case_name_short, cc.slug,
                 EXTRACT(YEAR FROM cc.date_filed)::smallint AS case_year,
                 co.charge_types, co.holding_text,
                 ts_headline('english', ob.plain_text,
                   phraseto_tsquery('english', jp.holding_description),
                   'MaxWords=30,MinWords=10,MaxFragments=2,ShortWord=3') AS excerpt
          FROM cl_opinion_bodies ob
          JOIN classified_opinions co ON co.cluster_id = ob.cluster_id::text
          JOIN cl_opinion_clusters cc ON cc.id = ob.cluster_id
          WHERE ob.author_id = jp.author_id
            AND to_tsvector('english', COALESCE(ob.plain_text, '')) @@ phraseto_tsquery('english', jp.holding_description)
        ) m
        WHERE jp.author_id = ANY(ARRAY[${placeholders}])
        ON CONFLICT (judge_canonical_id, opinion_id, investment_id) DO NOTHING
      `;
      const t0 = Date.now();
      const r = await c.query(sql, chunk);
      totalInserted += r.rowCount || 0;
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      const elapsed = ((Date.now() - tAll) / 1000 / 60).toFixed(1);
      console.log(`  batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(authors.length / BATCH)}: +${r.rowCount || 0} in ${dt}s (total ${totalInserted}, elapsed ${elapsed}min)`);
    }
    console.log(`\nINSERT total: ${totalInserted} rows in ${((Date.now() - tAll) / 1000 / 60).toFixed(1)}min`);

    console.log('STEP: drop staging');
    await c.query(`DROP TABLE IF EXISTS tmp_judge_phrases`);
    await c.query(`DROP TABLE IF EXISTS tmp_jp_active`);

    console.log('\n=== COUNTS ===');
    console.log(JSON.stringify((await c.query(`
      SELECT count(*)::int AS total,
             count(DISTINCT judge_canonical_id)::int AS distinct_judges,
             count(DISTINCT cluster_id)::int AS distinct_cases,
             count(DISTINCT company_holding)::int AS distinct_companies
      FROM public.judge_criminal_case_conflicts
    `)).rows[0], null, 2));

    console.log('\n=== TOP 20 (recent cases) ===');
    console.log(JSON.stringify((await c.query(`
      SELECT judge_name, company_holding, case_name, case_year, disclosure_year,
             left(excerpt, 200) AS excerpt_preview,
             (charge_types)[1] AS sample_charge
      FROM public.judge_criminal_case_conflicts
      ORDER BY case_year DESC NULLS LAST, judge_name LIMIT 20
    `)).rows, null, 2));

    console.log('\n=== TOP 10 COMPANIES ===');
    console.log(JSON.stringify((await c.query(`
      SELECT company_holding, count(*)::int AS hits, count(DISTINCT judge_canonical_id)::int AS judges
      FROM public.judge_criminal_case_conflicts GROUP BY company_holding ORDER BY count(*) DESC LIMIT 10
    `)).rows, null, 2));

    console.log('\n=== TOP JUDGES ===');
    console.log(JSON.stringify((await c.query(`
      SELECT judge_name, count(*)::int AS conflicts, count(DISTINCT company_holding)::int AS distinct_companies
      FROM public.judge_criminal_case_conflicts GROUP BY judge_name ORDER BY count(*) DESC LIMIT 10
    `)).rows, null, 2));

    console.log('\n=== CHARGE TYPES (top 15) ===');
    console.log(JSON.stringify((await c.query(`
      SELECT unnest(charge_types) AS charge, count(*)::int AS n
      FROM public.judge_criminal_case_conflicts
      WHERE charge_types IS NOT NULL AND cardinality(charge_types) > 0
      GROUP BY charge ORDER BY n DESC LIMIT 15
    `)).rows, null, 2));

    console.log('\n=== TABLE SIZE ===');
    console.log((await c.query(`SELECT pg_size_pretty(pg_total_relation_size('public.judge_criminal_case_conflicts')) AS size`)).rows[0].size);

    console.log('\n=== 5 SPOT-CHECK URLs ===');
    console.log(JSON.stringify((await c.query(`
      SELECT judge_name, company_holding, case_name, disclosure_url, case_url, left(excerpt, 220) AS excerpt
      FROM public.judge_criminal_case_conflicts ORDER BY random() LIMIT 5
    `)).rows, null, 2));
  } finally {
    try { await c.end(); } catch {}
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

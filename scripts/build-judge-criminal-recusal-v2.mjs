// Template: scripts/build-judge-criminal-recusal.mjs
// Expert: lukas-fittl
// Pattern: cl-bulk-data-defensive #17 (Albe) + LATERAL-per-phrase (forces GIN FTS index use)
// csv-bulk-checked: N/A
// work-mem: Medium tier verified (256MB)
//
// v2 rewrite — v1 single-INSERT ran 1h+ with 0 rows because phraseto_tsquery()
// varies per join row; PG planner can't use the GIN FTS index when the phrase
// is row-dependent. v2 stages (author_id, distinct description) first, then
// LATERAL-joins to cl_opinion_bodies per-row so the phrase is a constant
// within each lateral — letting the GIN index fire.

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
    await c.query(`TRUNCATE public.judge_criminal_case_conflicts RESTART IDENTITY`);

    console.log('STEP 1: stage tmp_judge_phrases — one row per (judge, unique description)');
    await c.query(`DROP TABLE IF EXISTS tmp_judge_phrases`);
    await timed(c, '  tmp_judge_phrases', `
      CREATE UNLOGGED TABLE tmp_judge_phrases AS
      SELECT DISTINCT ON (j.cl_person_id, inv.description)
        j.canonical_id AS judge_canonical_id,
        trim(concat_ws(' ', j.name_first, j.name_middle, j.name_last, j.name_suffix)) AS judge_name,
        j.cl_person_id AS author_id,
        inv.id AS investment_id,
        inv.description AS holding_description,
        inv.gross_value_code,
        fd.id::bigint AS disclosure_id,
        NULLIF(regexp_replace(fd.year, '[^0-9]', '', 'g'), '')::smallint AS disclosure_year
      FROM entities_judges j
      JOIN cl_financial_disclosures fd ON fd.person_id = j.cl_person_id::text
      JOIN cl_disclosure_investments inv ON inv.financial_disclosure_id = fd.id::bigint
      WHERE j.cl_person_id IS NOT NULL
        AND length(inv.description) BETWEEN 6 AND 120
        AND phraseto_tsquery('english', inv.description) <> ''::tsquery
      ORDER BY j.cl_person_id, inv.description, inv.id
    `);
    await c.query(`CREATE INDEX ON tmp_judge_phrases (author_id)`);
    await c.query(`ANALYZE tmp_judge_phrases`);

    console.log('STEP 2: filter to authors who actually have criminal opinions');
    await c.query(`DROP TABLE IF EXISTS tmp_jp_active`);
    await timed(c, '  tmp_jp_active', `
      CREATE UNLOGGED TABLE tmp_jp_active AS
      SELECT jp.*
      FROM tmp_judge_phrases jp
      WHERE EXISTS (
        SELECT 1 FROM cl_opinion_bodies ob
        JOIN classified_opinions co ON co.cluster_id = ob.cluster_id::text
        WHERE ob.author_id = jp.author_id
        LIMIT 1
      )
    `);
    await c.query(`CREATE INDEX ON tmp_jp_active (author_id)`);
    await c.query(`ANALYZE tmp_jp_active`);

    const valSql = valueCaseSql('jp.gross_value_code');
    console.log('STEP 3: LATERAL INSERT — phrase constant within inner query lets GIN FTS fire');
    await timed(c, '  INSERT', `
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
      ON CONFLICT (judge_canonical_id, opinion_id, investment_id) DO NOTHING
    `);

    console.log('STEP 4: drop staging');
    await c.query(`DROP TABLE IF EXISTS tmp_judge_phrases`);
    await c.query(`DROP TABLE IF EXISTS tmp_jp_active`);

    console.log('\n=== COUNTS ===');
    const counts = await c.query(`
      SELECT count(*)::int AS total,
             count(DISTINCT judge_canonical_id)::int AS distinct_judges,
             count(DISTINCT cluster_id)::int AS distinct_cases,
             count(DISTINCT company_holding)::int AS distinct_companies
      FROM public.judge_criminal_case_conflicts
    `);
    console.log(JSON.stringify(counts.rows[0], null, 2));

    console.log('\n=== TOP 20 (most recent cases) ===');
    const top = await c.query(`
      SELECT judge_name, company_holding, case_name, case_year, disclosure_year,
             left(excerpt, 200) AS excerpt_preview,
             (charge_types)[1] AS sample_charge
      FROM public.judge_criminal_case_conflicts
      ORDER BY case_year DESC NULLS LAST, judge_name LIMIT 20
    `);
    console.log(JSON.stringify(top.rows, null, 2));

    console.log('\n=== TOP 10 COMPANIES ===');
    const bycomp = await c.query(`
      SELECT company_holding, count(*)::int AS hits, count(DISTINCT judge_canonical_id)::int AS judges
      FROM public.judge_criminal_case_conflicts
      GROUP BY company_holding ORDER BY count(*) DESC LIMIT 10
    `);
    console.log(JSON.stringify(bycomp.rows, null, 2));

    console.log('\n=== TOP JUDGES ===');
    const byjudge = await c.query(`
      SELECT judge_name, count(*)::int AS conflicts, count(DISTINCT company_holding)::int AS distinct_companies
      FROM public.judge_criminal_case_conflicts
      GROUP BY judge_name ORDER BY count(*) DESC LIMIT 10
    `);
    console.log(JSON.stringify(byjudge.rows, null, 2));

    console.log('\n=== CHARGE TYPE DISTRIBUTION (top 15) ===');
    const bycharge = await c.query(`
      SELECT unnest(charge_types) AS charge, count(*)::int AS n
      FROM public.judge_criminal_case_conflicts
      WHERE charge_types IS NOT NULL AND cardinality(charge_types) > 0
      GROUP BY charge ORDER BY n DESC LIMIT 15
    `);
    console.log(JSON.stringify(bycharge.rows, null, 2));

    console.log('\n=== TABLE SIZE ===');
    const size = await c.query(`SELECT pg_size_pretty(pg_total_relation_size('public.judge_criminal_case_conflicts')) AS size`);
    console.log(size.rows[0].size);

    console.log('\n=== 5 RANDOM SPOT-CHECK URLs ===');
    const samples = await c.query(`
      SELECT judge_name, company_holding, case_name, disclosure_url, case_url,
             left(excerpt, 220) AS excerpt
      FROM public.judge_criminal_case_conflicts
      ORDER BY random() LIMIT 5
    `);
    console.log(JSON.stringify(samples.rows, null, 2));
  } finally {
    try { await c.end(); } catch {}
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

// Template: scripts/build-judge-coi-v3.mjs
// Expert: lukas-fittl
// Pattern: cl-bulk-data-defensive #17 (Albe)
// csv-bulk-checked: N/A
// work-mem: Medium tier verified (256MB)
//
// v4 — final pragmatic variant. The trigram (% operator) matching variants
// (v1/v2/v3) all timed out at Medium tier scale because 80K company scans ×
// 1.6M party rows is unbounded. v4 ships only EXACT-equality matches after
// canonical-name normalization (corp/inc/llc stripped from both sides,
// uppercased). Hash join completes in seconds.
//
// Trade-off: loses "APPLE" ↔ "APPLE COMPUTER INC" matches (sim 0.65),
// keeps "APPLE" ↔ "APPLE" and "APPLE" ↔ "APPLE INC." (both normalize to "APPLE").
// This is the conservative-precision-first recusal surface. Future session
// can add a v5 that expands via LATERAL scan of a narrow hot-company pool
// (e.g., top 100 most-held-by-judges companies).

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
  await c.query(`SET statement_timeout = '29min'`);
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
    console.log('PRE: staging check');
    const staging = await c.query(`SELECT relname, reltuples::bigint AS n FROM pg_class WHERE relname IN ('tmp_judge_investments','tmp_judge_companies','tmp_case_parties','tmp_case_judges_norm')`);
    console.log(JSON.stringify(staging.rows, null, 2));

    console.log('PRE: TRUNCATE target');
    await c.query(`TRUNCATE judge_conflict_of_interest RESTART IDENTITY`);

    console.log('STEP: exact-equality 3-way hash join (judge-company = case-party, actionable filter)');
    const valSql = valueCaseSql('jc.holding_value_code');
    await timed(c, '  INSERT', `
      INSERT INTO judge_conflict_of_interest (
        judge_canonical_id, judge_name, case_canonical_id, case_name,
        investment_id, company_holding, holding_value_code, holding_value_estimate,
        holding_description, match_confidence, match_type,
        disclosure_id, disclosure_year, disclosure_url,
        case_court, case_year
      )
      SELECT DISTINCT ON (jc.judge_canonical_id, cp.case_canonical_id, jc.investment_id)
        jc.judge_canonical_id, jc.judge_name, cp.case_canonical_id, cp.case_name,
        jc.investment_id, jc.company_norm,
        jc.holding_value_code, ${valSql} AS holding_value_estimate,
        jc.holding_description,
        1.0::real AS match_confidence,
        'exact' AS match_type,
        jc.disclosure_id, jc.disclosure_year,
        'https://www.courtlistener.com/financial-disclosures/' || jc.disclosure_id || '/',
        cp.court_id, cp.case_year
      FROM tmp_judge_companies jc
      JOIN tmp_case_parties cp ON cp.party_name_norm = jc.company_norm
      JOIN tmp_case_judges_norm tj
        ON tj.case_canonical_id = cp.case_canonical_id
       AND tj.judge_last_upper = jc.judge_last_norm
      WHERE length(jc.company_norm) >= 6
        AND jc.judge_last_norm IS NOT NULL
        AND length(jc.judge_last_norm) >= 3
      ORDER BY jc.judge_canonical_id, cp.case_canonical_id, jc.investment_id
      ON CONFLICT (judge_canonical_id, case_canonical_id, investment_id) DO NOTHING
    `);

    console.log('STEP: backfill case_url');
    await timed(c, '  UPDATE case_url', `
      UPDATE judge_conflict_of_interest coi
      SET case_url = sub.source_url
      FROM (
        SELECT DISTINCT ON (entity_id) entity_id, source_url
        FROM entity_sources
        WHERE entity_type='case' AND source_system='courtlistener'
        ORDER BY entity_id, retrieved_at DESC
      ) sub
      WHERE coi.case_canonical_id = sub.entity_id AND coi.case_url IS NULL
    `);

    console.log('STEP: DELETE rows missing verification URLs');
    await timed(c, '  DELETE', `DELETE FROM judge_conflict_of_interest WHERE case_url IS NULL OR disclosure_url IS NULL`);

    console.log('STEP: drop staging');
    for (const t of ['tmp_judge_investments','tmp_judge_companies','tmp_case_parties','tmp_case_judges_norm','tmp_company_uniq','tmp_company_cases']) {
      await c.query(`DROP TABLE IF EXISTS ${t}`);
    }

    console.log('\n=== COUNTS ===');
    const counts = await c.query(`
      SELECT count(*)::int AS total,
             count(DISTINCT judge_canonical_id)::int AS distinct_judges,
             count(DISTINCT case_canonical_id)::int AS distinct_cases,
             count(DISTINCT company_holding)::int AS distinct_companies
      FROM judge_conflict_of_interest
    `);
    console.log(JSON.stringify(counts.rows[0], null, 2));

    console.log('\n=== BY MATCH TYPE ===');
    const byType = await c.query(`SELECT match_type, count(*)::int AS n FROM judge_conflict_of_interest GROUP BY match_type ORDER BY n DESC`);
    console.log(JSON.stringify(byType.rows, null, 2));

    console.log('\n=== TOP 20 ===');
    const top = await c.query(`
      SELECT judge_name, company_holding, case_name,
             match_confidence::numeric(4,3) AS match_confidence,
             match_type, case_year, disclosure_year
      FROM judge_conflict_of_interest
      ORDER BY case_year DESC NULLS LAST, judge_name
      LIMIT 20
    `);
    console.log(JSON.stringify(top.rows, null, 2));

    console.log('\n=== TOP 10 COMPANIES by hits ===');
    const bycomp = await c.query(`
      SELECT company_holding, count(*)::int AS hits, count(DISTINCT judge_canonical_id)::int AS judges
      FROM judge_conflict_of_interest
      GROUP BY company_holding ORDER BY count(*) DESC LIMIT 10
    `);
    console.log(JSON.stringify(bycomp.rows, null, 2));

    console.log('\n=== TABLE SIZE ===');
    const size = await c.query(`SELECT pg_size_pretty(pg_total_relation_size('judge_conflict_of_interest')) AS size`);
    console.log(size.rows[0].size);
  } finally {
    try { await c.end(); } catch {}
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

// Template: scripts/build-judge-coi-v2.mjs
// Expert: lukas-fittl
// Pattern: cl-bulk-data-defensive #12 (narrow sort via winners) + dedup-first
// csv-bulk-checked: N/A
// work-mem: Medium tier verified (256MB)
//
// v3: dedupe companies to unique set FIRST, then trigram-match. Judges own
// largely overlapping stock sets (APPLE, BANK OF AMERICA, MICROSOFT, ...), so
// 129K (judge, company) pairs collapse to ~3-5K distinct company_norms. That
// reduces the trigram-scan count by ~30×.
//
// Two-phase:
//   A. Build company→matched_cases map (one trigram lookup per unique company).
//   B. Fan out via join: (judge, company) × (company, case) → (judge, case, company).
//      Filter to judge-on-case via tmp_case_judges_norm.

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
  await c.query(`SET pg_trgm.similarity_threshold = 0.85`);
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

    console.log('STEP A1: dedupe companies → unique set');
    await c.query(`DROP TABLE IF EXISTS tmp_company_uniq`);
    await timed(c, '  tmp_company_uniq', `
      CREATE UNLOGGED TABLE tmp_company_uniq AS
      SELECT DISTINCT company_norm
      FROM tmp_judge_companies
      WHERE length(company_norm) >= 6
    `);
    const cUniq = await c.query(`SELECT count(*)::int AS n FROM tmp_company_uniq`);
    console.log(`  unique companies: ${cUniq.rows[0].n}`);

    console.log('STEP A2: for each unique company, find matched case-parties (threshold 0.85, top 20 per)');
    await c.query(`DROP TABLE IF EXISTS tmp_company_cases`);
    await timed(c, '  tmp_company_cases', `
      CREATE UNLOGGED TABLE tmp_company_cases AS
      SELECT u.company_norm, matched.case_canonical_id, matched.case_name, matched.court_id,
             matched.case_year, matched.sim AS match_confidence
      FROM tmp_company_uniq u
      CROSS JOIN LATERAL (
        SELECT cp.case_canonical_id, cp.case_name, cp.court_id, cp.case_year,
               similarity(u.company_norm, cp.party_name_norm) AS sim
        FROM tmp_case_parties cp
        WHERE cp.party_name_norm % u.company_norm
          AND length(cp.party_name_norm) >= 6
        ORDER BY cp.party_name_norm <-> u.company_norm
        LIMIT 20
      ) matched
      WHERE matched.sim >= 0.85
    `);
    await c.query(`CREATE INDEX ON tmp_company_cases (company_norm)`);
    await c.query(`CREATE INDEX ON tmp_company_cases (case_canonical_id)`);
    await c.query(`ANALYZE tmp_company_cases`);

    console.log('STEP B: fan out to (judge, case, company) triples, filtered to actionable (judge-on-case)');
    const valSql = valueCaseSql('jc.holding_value_code');
    await timed(c, '  INSERT', `
      INSERT INTO judge_conflict_of_interest (
        judge_canonical_id, judge_name, case_canonical_id, case_name,
        investment_id, company_holding, holding_value_code, holding_value_estimate,
        holding_description, match_confidence, match_type,
        disclosure_id, disclosure_year, disclosure_url,
        case_court, case_year
      )
      SELECT
        jc.judge_canonical_id, jc.judge_name, tc.case_canonical_id, tc.case_name,
        jc.investment_id, jc.company_norm,
        jc.holding_value_code, ${valSql} AS holding_value_estimate,
        jc.holding_description,
        tc.match_confidence,
        CASE WHEN tc.match_confidence >= 0.95 THEN 'exact'
             WHEN tc.match_confidence >= 0.85 THEN 'fuzzy'
             ELSE 'inferred' END AS match_type,
        jc.disclosure_id, jc.disclosure_year,
        'https://www.courtlistener.com/financial-disclosures/' || jc.disclosure_id || '/',
        tc.court_id, tc.case_year
      FROM tmp_judge_companies jc
      JOIN tmp_company_cases tc ON tc.company_norm = jc.company_norm
      JOIN tmp_case_judges_norm tj
        ON tj.case_canonical_id = tc.case_canonical_id
       AND tj.judge_last_upper = jc.judge_last_norm
      WHERE jc.judge_last_norm IS NOT NULL AND length(jc.judge_last_norm) >= 3
      ON CONFLICT (judge_canonical_id, case_canonical_id, investment_id) DO NOTHING
    `);

    console.log('STEP C: backfill case_url');
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

    console.log('STEP D: DELETE rows missing verification URLs');
    await timed(c, '  DELETE missing-URL', `DELETE FROM judge_conflict_of_interest WHERE case_url IS NULL OR disclosure_url IS NULL`);

    console.log('STEP E: drop staging');
    await c.query(`DROP TABLE IF EXISTS tmp_judge_investments`);
    await c.query(`DROP TABLE IF EXISTS tmp_judge_companies`);
    await c.query(`DROP TABLE IF EXISTS tmp_case_parties`);
    await c.query(`DROP TABLE IF EXISTS tmp_case_judges_norm`);
    await c.query(`DROP TABLE IF EXISTS tmp_company_uniq`);
    await c.query(`DROP TABLE IF EXISTS tmp_company_cases`);

    console.log('\n=== COUNTS ===');
    const counts = await c.query(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE match_confidence >= 0.5)::int AS conf_ge_050,
             count(*) FILTER (WHERE match_confidence >= 0.7)::int AS conf_ge_070,
             count(*) FILTER (WHERE match_confidence >= 0.9)::int AS conf_ge_090,
             count(*) FILTER (WHERE match_confidence >= 0.95)::int AS conf_ge_095,
             count(DISTINCT judge_canonical_id)::int AS distinct_judges,
             count(DISTINCT case_canonical_id)::int AS distinct_cases,
             count(DISTINCT company_holding)::int AS distinct_companies
      FROM judge_conflict_of_interest
    `);
    console.log(JSON.stringify(counts.rows[0], null, 2));

    console.log('\n=== BY MATCH TYPE ===');
    const byType = await c.query(`SELECT match_type, count(*)::int AS n FROM judge_conflict_of_interest GROUP BY match_type ORDER BY n DESC`);
    console.log(JSON.stringify(byType.rows, null, 2));

    console.log('\n=== TOP 20 (confidence >= 0.85) ===');
    const top = await c.query(`
      SELECT judge_name, company_holding, case_name,
             match_confidence::numeric(4,3) AS match_confidence,
             match_type, case_year, disclosure_year
      FROM judge_conflict_of_interest
      WHERE match_confidence >= 0.85
      ORDER BY match_confidence DESC, judge_name, case_year DESC NULLS LAST
      LIMIT 20
    `);
    console.log(JSON.stringify(top.rows, null, 2));

    console.log('\n=== TABLE SIZE ===');
    const size = await c.query(`SELECT pg_size_pretty(pg_total_relation_size('judge_conflict_of_interest')) AS size`);
    console.log(size.rows[0].size);
  } finally {
    try { await c.end(); } catch {}
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

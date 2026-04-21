// Template: scripts/build-judge-coi.mjs
// Expert: lukas-fittl
// Pattern: cl-bulk-data-defensive #17 + (fallback for #12 sort width)
// csv-bulk-checked: N/A
// work-mem: Medium tier verified (256MB)
//
// Resumer for build-judge-coi.mjs — uses existing UNLOGGED staging
// (tmp_judge_investments, tmp_judge_companies, tmp_case_parties) left over
// from a cancelled/timed-out INSERT. Runs the trigram join with a tighter
// threshold (0.6), drops DISTINCT ON (lets ON CONFLICT DO NOTHING handle
// dedup), then backfills case_url + drops missing-URL rows + verifies.

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
    console.log('PRE: verify staging');
    const staging = await c.query(`SELECT relname, relpersistence, reltuples::bigint AS n FROM pg_class WHERE relname IN ('tmp_judge_investments','tmp_judge_companies','tmp_case_parties')`);
    console.log(JSON.stringify(staging.rows, null, 2));
    if (staging.rows.length < 3) throw new Error('staging missing — re-run build-judge-coi.mjs fully');

    console.log('PRE: clear any partial rows from prior attempt');
    await timed(c, '  TRUNCATE judge_conflict_of_interest', `TRUNCATE judge_conflict_of_interest RESTART IDENTITY`);

    // Tighter threshold + minimum length + drop DISTINCT ON.
    await c.query(`SET pg_trgm.similarity_threshold = 0.6`);

    console.log('STEP 7: trigram join INSERT (threshold 0.6, no DISTINCT ON)');
    const valSql = valueCaseSql('jc.holding_value_code');
    const insertSql = `
      INSERT INTO judge_conflict_of_interest (
        judge_canonical_id, judge_name, case_canonical_id, case_name,
        investment_id, company_holding, holding_value_code, holding_value_estimate,
        holding_description, match_confidence, match_type,
        disclosure_id, disclosure_year, disclosure_url,
        case_court, case_year
      )
      SELECT
        jc.judge_canonical_id, jc.judge_name, cp.case_canonical_id, cp.case_name,
        jc.investment_id, jc.company_norm AS company_holding,
        jc.holding_value_code, ${valSql} AS holding_value_estimate,
        jc.holding_description,
        similarity(jc.company_norm, cp.party_name_norm) AS match_confidence,
        CASE
          WHEN similarity(jc.company_norm, cp.party_name_norm) >= 0.85 THEN 'exact'
          WHEN similarity(jc.company_norm, cp.party_name_norm) >= 0.70 THEN 'fuzzy'
          ELSE 'inferred'
        END AS match_type,
        jc.disclosure_id, jc.disclosure_year,
        'https://www.courtlistener.com/financial-disclosures/' || jc.disclosure_id || '/' AS disclosure_url,
        cp.court_id AS case_court, cp.case_year
      FROM tmp_judge_companies jc
      JOIN tmp_case_parties cp ON cp.party_name_norm % jc.company_norm
      WHERE length(jc.company_norm) >= 6
        AND length(cp.party_name_norm) >= 6
        AND similarity(jc.company_norm, cp.party_name_norm) >= 0.6
      ON CONFLICT (judge_canonical_id, case_canonical_id, investment_id) DO NOTHING
    `;
    await timed(c, '  INSERT', insertSql);

    console.log('STEP 8: backfill case_url from entity_sources');
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

    console.log('STEP 9: drop rows missing verification URLs');
    await timed(c, '  DELETE missing-URL rows', `
      DELETE FROM judge_conflict_of_interest WHERE case_url IS NULL OR disclosure_url IS NULL
    `);

    console.log('STEP 10: drop staging (UNLOGGED — safe to nuke)');
    await c.query(`DROP TABLE IF EXISTS tmp_judge_investments`);
    await c.query(`DROP TABLE IF EXISTS tmp_judge_companies`);
    await c.query(`DROP TABLE IF EXISTS tmp_case_parties`);

    console.log('\n=== COUNTS ===');
    const counts = await c.query(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE match_confidence >= 0.5)::int AS conf_ge_050,
             count(*) FILTER (WHERE match_confidence >= 0.7)::int AS conf_ge_070,
             count(*) FILTER (WHERE match_confidence >= 0.9)::int AS conf_ge_090,
             count(DISTINCT judge_canonical_id)::int AS distinct_judges,
             count(DISTINCT case_canonical_id)::int AS distinct_cases,
             count(DISTINCT company_holding)::int AS distinct_companies
      FROM judge_conflict_of_interest
    `);
    console.log(JSON.stringify(counts.rows[0], null, 2));

    console.log('\n=== BY MATCH TYPE ===');
    const byType = await c.query(`SELECT match_type, count(*)::int AS n FROM judge_conflict_of_interest GROUP BY match_type ORDER BY n DESC`);
    console.log(JSON.stringify(byType.rows, null, 2));

    console.log('\n=== TOP 20 (confidence >= 0.7) ===');
    const top = await c.query(`
      SELECT judge_name, company_holding, case_name,
             match_confidence::numeric(4,3) AS match_confidence,
             match_type, case_year, disclosure_year
      FROM judge_conflict_of_interest
      WHERE match_confidence >= 0.7
      ORDER BY match_confidence DESC, judge_name
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

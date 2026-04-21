// Template: scripts/build-judge-coi-finish.mjs
// Expert: lukas-fittl
// Pattern: cl-bulk-data-defensive #17 (Albe) + LATERAL bound-work
// csv-bulk-checked: N/A
// work-mem: Medium tier verified (256MB)
//
// Plan C for judge_conflict_of_interest INSERT. Previous plain `cp % jc` nested-
// loop over 129K × 1.6M was unbounded at the trigram-scan phase (26min of work,
// 0 rows yet). LATERAL with LIMIT bounds per-(judge, company) work to a
// deterministic pool, making total work predictable.
//
// Strategy:
//   - For each (judge, company) pair, find top 50 matching parties via LATERAL
//     index-scan on tmp_case_parties.party_name_norm (% jc.company_norm).
//   - Cap per-judge cases via implicit LIMIT → predictable row count.
//   - Batch by judge chunks with RAISE NOTICE progress.

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
  await c.query(`SET pg_trgm.similarity_threshold = 0.6`);
  return c;
}

async function main() {
  const c = await connect();
  try {
    console.log('PRE: verify staging');
    const staging = await c.query(`SELECT relname, reltuples::bigint AS n FROM pg_class WHERE relname IN ('tmp_judge_investments','tmp_judge_companies','tmp_case_parties')`);
    console.log(JSON.stringify(staging.rows, null, 2));
    if (staging.rows.length < 3) throw new Error('staging missing');

    console.log('PRE: TRUNCATE target');
    await c.query(`TRUNCATE judge_conflict_of_interest RESTART IDENTITY`);

    // Get list of judges that have companies. Batch in chunks of 500.
    const judgeList = await c.query(`SELECT DISTINCT judge_canonical_id FROM tmp_judge_companies ORDER BY judge_canonical_id`);
    const judges = judgeList.rows.map(r => r.judge_canonical_id);
    console.log(`  ${judges.length} judges with companies — processing in batches of 500`);
    const BATCH = 500;
    const valSql = valueCaseSql('jc.holding_value_code');
    let totalInserted = 0;
    const tAll = Date.now();

    for (let i = 0; i < judges.length; i += BATCH) {
      const chunk = judges.slice(i, i + BATCH);
      const placeholders = chunk.map((_, k) => `$${k + 1}::uuid`).join(',');
      const sql = `
        INSERT INTO judge_conflict_of_interest (
          judge_canonical_id, judge_name, case_canonical_id, case_name,
          investment_id, company_holding, holding_value_code, holding_value_estimate,
          holding_description, match_confidence, match_type,
          disclosure_id, disclosure_year, disclosure_url,
          case_court, case_year
        )
        SELECT
          jc.judge_canonical_id, jc.judge_name, matched.case_canonical_id, matched.case_name,
          jc.investment_id, jc.company_norm,
          jc.holding_value_code, ${valSql} AS holding_value_estimate,
          jc.holding_description,
          matched.sim AS match_confidence,
          CASE WHEN matched.sim >= 0.85 THEN 'exact'
               WHEN matched.sim >= 0.70 THEN 'fuzzy'
               ELSE 'inferred' END AS match_type,
          jc.disclosure_id, jc.disclosure_year,
          'https://www.courtlistener.com/financial-disclosures/' || jc.disclosure_id || '/',
          matched.court_id, matched.case_year
        FROM tmp_judge_companies jc
        CROSS JOIN LATERAL (
          SELECT cp.case_canonical_id, cp.case_name, cp.court_id, cp.case_year,
                 similarity(jc.company_norm, cp.party_name_norm) AS sim
          FROM tmp_case_parties cp
          WHERE cp.party_name_norm % jc.company_norm
            AND length(cp.party_name_norm) >= 6
          ORDER BY cp.party_name_norm <-> jc.company_norm
          LIMIT 50
        ) matched
        WHERE jc.judge_canonical_id = ANY(ARRAY[${placeholders}])
          AND length(jc.company_norm) >= 6
          AND matched.sim >= 0.6
        ON CONFLICT (judge_canonical_id, case_canonical_id, investment_id) DO NOTHING
      `;
      const t0 = Date.now();
      const r = await c.query(sql, chunk);
      totalInserted += r.rowCount || 0;
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`  batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(judges.length / BATCH)}: +${r.rowCount || 0} rows in ${dt}s (total ${totalInserted})`);
    }
    console.log(`  INSERT total: ${totalInserted} rows in ${((Date.now() - tAll) / 1000).toFixed(1)}s`);

    console.log('STEP 8: backfill case_url');
    const t8 = Date.now();
    const r8 = await c.query(`
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
    console.log(`  UPDATE: ${r8.rowCount} in ${((Date.now() - t8) / 1000).toFixed(1)}s`);

    console.log('STEP 9: DELETE rows missing verification URLs');
    const r9 = await c.query(`DELETE FROM judge_conflict_of_interest WHERE case_url IS NULL OR disclosure_url IS NULL`);
    console.log(`  DELETE: ${r9.rowCount}`);

    console.log('STEP 10: drop staging');
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

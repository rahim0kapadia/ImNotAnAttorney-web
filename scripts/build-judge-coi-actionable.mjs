// Template: scripts/build-judge-coi-lateral.mjs
// Expert: lukas-fittl
// Pattern: cl-bulk-data-defensive #17 (Albe) + actionable-only filter
// csv-bulk-checked: N/A
// work-mem: Medium tier verified (256MB)
//
// Final variant of judge_conflict_of_interest build. Prior variants surfaced
// investment-company-name ↔ case-party-name matches regardless of whether the
// judge actually adjudicated the case. That produced a 315K-row noise pool
// where only ~270 matches had the judge actually on the case (0.09%).
//
// This version filters to ACTIONABLE recusal grounds only — case.judges must
// contain the judge's last name. Expected output: ~1K-10K rows.

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
  await c.query(`SET pg_trgm.similarity_threshold = 0.7`);
  return c;
}

async function main() {
  const c = await connect();
  try {
    console.log('PRE: staging check');
    const staging = await c.query(`SELECT relname, reltuples::bigint AS n FROM pg_class WHERE relname IN ('tmp_judge_investments','tmp_judge_companies','tmp_case_parties')`);
    console.log(JSON.stringify(staging.rows, null, 2));
    if (staging.rows.length < 3) throw new Error('staging missing');

    console.log('PRE: add judge_last_norm column to tmp_judge_companies (uppercase last name, no suffix)');
    const hasCol = await c.query(`SELECT 1 FROM information_schema.columns WHERE table_name='tmp_judge_companies' AND column_name='judge_last_norm'`);
    if (hasCol.rows.length === 0) {
      // Extract last name: second-to-last token if suffix (Jr/Sr/III/etc), else last.
      await c.query(`ALTER TABLE tmp_judge_companies ADD COLUMN judge_last_norm TEXT`);
      await c.query(`
        UPDATE tmp_judge_companies jc
        SET judge_last_norm = upper(ej.name_last)
        FROM entities_judges ej
        WHERE jc.judge_canonical_id = ej.canonical_id
      `);
      console.log('  judge_last_norm populated');
    } else {
      console.log('  judge_last_norm already present');
    }

    console.log('PRE: TRUNCATE target');
    await c.query(`TRUNCATE judge_conflict_of_interest RESTART IDENTITY`);

    console.log('STEP: tmp_case_judges_norm — build a helper of (case_id, judge_last_upper) for fast lookup');
    await c.query(`DROP TABLE IF EXISTS tmp_case_judges_norm`);
    const tj = Date.now();
    await c.query(`
      CREATE UNLOGGED TABLE tmp_case_judges_norm AS
      SELECT ec.canonical_id AS case_canonical_id,
             upper(btrim(j)) AS judge_last_upper
      FROM entities_cases ec
      CROSS JOIN LATERAL unnest(ec.judges) AS j
      WHERE ec.judges IS NOT NULL
        AND cardinality(ec.judges) > 0
        AND length(btrim(j)) >= 3
    `);
    const { rows: [{ n: tjn }] } = await c.query(`SELECT count(*)::bigint AS n FROM tmp_case_judges_norm`);
    console.log(`  tmp_case_judges_norm: ${tjn} rows in ${((Date.now() - tj)/1000).toFixed(1)}s`);
    await c.query(`CREATE INDEX ON tmp_case_judges_norm (case_canonical_id, judge_last_upper)`);
    await c.query(`ANALYZE tmp_case_judges_norm`);

    // Main INSERT: lateral join + judge-on-case filter.
    const valSql = valueCaseSql('jc.holding_value_code');
    console.log('STEP: INSERT (LATERAL, threshold 0.7, LIMIT 30, actionable-only)');
    const t0 = Date.now();
    const r = await c.query(`
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
        LIMIT 30
      ) matched
      WHERE length(jc.company_norm) >= 6
        AND matched.sim >= 0.7
        AND jc.judge_last_norm IS NOT NULL
        AND length(jc.judge_last_norm) >= 3
        AND EXISTS (
          SELECT 1 FROM tmp_case_judges_norm tj
          WHERE tj.case_canonical_id = matched.case_canonical_id
            AND tj.judge_last_upper = jc.judge_last_norm
        )
      ON CONFLICT (judge_canonical_id, case_canonical_id, investment_id) DO NOTHING
    `);
    console.log(`  INSERT: ${r.rowCount} rows in ${((Date.now() - t0)/1000).toFixed(1)}s`);

    console.log('STEP: backfill case_url');
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
    console.log(`  UPDATE case_url: ${r8.rowCount} in ${((Date.now() - t8)/1000).toFixed(1)}s`);

    console.log('STEP: DELETE rows missing verification URLs');
    const r9 = await c.query(`DELETE FROM judge_conflict_of_interest WHERE case_url IS NULL OR disclosure_url IS NULL`);
    console.log(`  DELETE: ${r9.rowCount}`);

    console.log('STEP: drop staging');
    await c.query(`DROP TABLE IF EXISTS tmp_judge_investments`);
    await c.query(`DROP TABLE IF EXISTS tmp_judge_companies`);
    await c.query(`DROP TABLE IF EXISTS tmp_case_parties`);
    await c.query(`DROP TABLE IF EXISTS tmp_case_judges_norm`);

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

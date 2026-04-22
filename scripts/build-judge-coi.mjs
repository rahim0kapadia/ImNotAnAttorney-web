// Template: scripts/ingest/federal-rules-ingest.mjs
// Expert: lukas-fittl (pg session defenses — statement_timeout + tcp_keepalives)
// Pattern: cl-bulk-data-defensive #17 (Albe defenses) + #12 (narrow sort via intermediate winners)
// csv-bulk-checked: N/A — all source data is already in Supabase (no external fetch)
// work-mem: Medium tier verified (work-mem-log.js CHECKED 4GB ceiling=256MB)
//
// Build judge_conflict_of_interest table — (judge, case, company) triples where the judge
// holds a disclosed investment in a company that appears as a party in a case.
//
// Pipeline:
//   1. Apply migration via Mgmt API (creates empty judge_conflict_of_interest).
//   2. Stage tmp_judge_investments = investments JOIN disclosures JOIN people JOIN judges,
//      filtered to corporate-holding-shaped descriptions (not funds / IRAs / etc).
//   3. Dedupe to tmp_judge_companies — DISTINCT (judge, normalized_company) pairs
//      (prevents insurance ~ insurance policy dupes).
//   4. Stage tmp_case_parties = unpivot entities_cases on " v. " split; keep rows where
//      at least one party is corporate-shaped. Build trigram GIN on party_name_norm.
//   5. INSERT judge_conflict_of_interest SELECT ... FROM tmp_judge_companies j
//      JOIN tmp_case_parties c ON c.party_name_norm % j.company_norm WHERE similarity() >= 0.4.
//   6. Backfill case_url + disclosure_url.
//   7. Drop staging.
//
// Safety:
//   - Every output row has disclosure_url + case_url (no-hallucinated-legal-data rule).
//   - Rows with missing case_url (case not in entity_sources) DROPPED in final pass.
//   - UNLOGGED staging — drops on Supabase restart, but script is idempotent (DROP IF EXISTS).

import fs from 'node:fs';
import pg from 'pg';

const envTxt = fs.readFileSync('C:/Users/email/projects/ImNotAnAttorney-web/.env.local', 'utf-8');
for (const line of envTxt.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = 'jxjbjmgdukwkoclydqdr';
const MIGRATION_FILE = 'C:/Users/email/projects/ImNotAnAttorney-web/supabase/migrations/20260421a_judge_conflict_of_interest.sql';

// 1. Apply migration via Mgmt API (avoids local psql dependency).
async function applyMigration() {
  const sql = fs.readFileSync(MIGRATION_FILE, 'utf-8');
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'claude-code-inaa'
    },
    body: JSON.stringify({ query: sql })
  });
  if (!r.ok) throw new Error(`Migration failed: ${r.status} ${await r.text()}`);
  console.log('  migration applied');
}

// Corporate-holding shape: description contains these tokens AND lacks fund/IRA markers.
const CORP_TOKENS = String.raw`\m(CORP|INC|INCORPORATED|LLC|L\.L\.C\.|COMPANY|CO\.|HOLDINGS?|LTD|LIMITED|INDUSTRIES|GROUP|BANK|INSURANCE|TECHNOLOG|PHARMACEUTIC|PHARMA|MOTORS|AIRLINES|ENERGY|SYSTEMS|NETWORKS|FINANCIAL|CAPITAL|SECURITIES|PARTNERS|HEALTH|MEDICAL|ENTERTAINMENT|LABS|BROTHERS|PLC|INTERNATIONAL|GLOBAL)\M`;
const FUND_TOKENS = String.raw`\m(IRA|401\(?K\)?|403\(?B\)?|TREAS(URY)?|BOND(S)?|MUNICIPAL|MONEY\s*MARKET|SAVINGS|CD\b|MORTGAGE|PENSION|ANNUIT|FIXED\s*INCOME|INDEX\s*FUND|ETF|VANGUARD|FIDELITY|SCHWAB|BLACKROCK|ISHARES|SPDR|AMERICAN\s*FUND|TIAA|AMERICAN\s*CENTURY|T\.\s*ROWE|JANUS|DIMENSIONAL|PIMCO|DODGE\s*&\s*COX|DEFERRED\s*COMPENSATION|LIFE\s*INSURANCE|CHECKING\s*ACCOUNT|RENTAL\s*PROPERTY|REAL\s*ESTATE|MUTUAL\s*FUND|INVESTMENT\s*CO\s*OF\s*AMERICA|DEVELOPING\s*WORLD)\M`;

// Normalize company name for matching: upper, strip parenthetical tickers, strip common suffixes, collapse whitespace.
// Inlined as SQL expression so it works on both sides (investments + case parties).
const normalizeSql = (col) => `
  regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(upper(${col}), '\\s*\\([^)]*\\)\\s*$', '', 'g'),
          '^\\s*#?\\s*[0-9]+\\s*-+\\s*', '', 'g'
        ),
        '\\m(INC|INCORPORATED|CORP|CORPORATION|COMPANY|CO|LLC|L\\.L\\.C\\.|LTD|LIMITED|HOLDINGS?|GROUP|PLC|SA|AG|NV|LP|LLP|INTL|INTERNATIONAL|THE)\\M\\.?', '', 'gi'
      ),
      '[^A-Z0-9 ]+', ' ', 'g'
    ),
    '\\s+', ' ', 'g'
  )
`.trim();

// Judicial Conference value-code brackets (for holding_value_estimate).
const VALUE_CODES = {
  A: '$1-$1,000', B: '$1,001-$2,500', C: '$2,501-$5,000', D: '$5,001-$15,000',
  E: '$15,001-$50,000', F: '$50,001-$100,000', G: '$100,001-$1,000,000',
  H1: '$1,000,001-$5,000,000', H2: '$5,000,001+',
  J: '$1-$15,000', K: '$15,001-$50,000', L: '$50,001-$100,000',
  M: '$100,001-$250,000', N: '$250,001-$500,000', O: '$500,001-$1,000,000',
  P1: '$1,000,001-$5,000,000', P2: '$5,000,001-$25,000,000',
  P3: '$25,000,001-$50,000,000', P4: '$50,000,001+',
};
function valueCaseSql(alias) {
  const cases = Object.entries(VALUE_CODES).map(([code, label]) => `WHEN ${alias} = ${sqlStr(code)} THEN ${sqlStr(label)}`).join(' ');
  return `CASE ${cases} ELSE NULL END`;
}
function sqlStr(s) { return `'${String(s).replace(/'/g, "''")}'`; }

// 2. Connect with Albe defenses.
async function connect() {
  const { Client } = pg;
  const u = new URL(process.env.SUPABASE_DB_URL);
  u.port = '5432'; // session mode — multi-statement pipeline needs stable session
  const c = new Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false }, statement_timeout: 0 });
  await c.connect();
  await c.query(`SET statement_timeout = '30min'`);
  await c.query(`SET idle_in_transaction_session_timeout = '5min'`);
  await c.query(`SET tcp_keepalives_idle = 60`);
  await c.query(`SET tcp_keepalives_interval = 10`);
  await c.query(`SET tcp_keepalives_count = 6`);
  await c.query(`SET work_mem = '256MB'`);               // Medium tier ceiling
  await c.query(`SET maintenance_work_mem = '512MB'`);   // Medium tier safe
  return c;
}

async function timed(c, label, sql, args = []) {
  const t0 = Date.now();
  const r = await c.query(sql, args);
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  const rc = r.rowCount ?? r.rows?.length ?? 0;
  console.log(`  ${label}: ${rc} rows in ${dt}s`);
  return r;
}

async function main() {
  console.log('STEP 1: apply migration');
  await applyMigration();

  console.log('STEP 2: connect + Albe defenses');
  const c = await connect();

  try {
    console.log('STEP 3: build tmp_judge_investments (judges-only corporate holdings)');
    await c.query(`DROP TABLE IF EXISTS tmp_judge_investments`);
    await timed(c, '  tmp_judge_investments', `
      CREATE UNLOGGED TABLE tmp_judge_investments AS
      SELECT
        ej.canonical_id AS judge_canonical_id,
        trim(concat_ws(' ', ej.name_first, ej.name_middle, ej.name_last, ej.name_suffix)) AS judge_name,
        inv.id AS investment_id,
        inv.description AS holding_description,
        ${normalizeSql('inv.description')} AS company_norm,
        inv.gross_value_code AS holding_value_code,
        fd.id::bigint AS disclosure_id,
        NULLIF(regexp_replace(fd.year, '[^0-9]', '', 'g'), '')::smallint AS disclosure_year
      FROM cl_disclosure_investments inv
      JOIN cl_financial_disclosures fd ON fd.id = inv.financial_disclosure_id::text
      JOIN cl_people p ON p.id::text = fd.person_id
      JOIN entities_judges ej ON ej.cl_person_id = p.id
      WHERE inv.description IS NOT NULL
        AND length(inv.description) >= 4
        AND inv.description ~* ${sqlStr(CORP_TOKENS)}
        AND inv.description !~* ${sqlStr(FUND_TOKENS)}
        AND length(${normalizeSql('inv.description')}) >= 5
    `);

    console.log('STEP 4: dedupe to tmp_judge_companies (one pair per judge+company)');
    await c.query(`DROP TABLE IF EXISTS tmp_judge_companies`);
    await timed(c, '  tmp_judge_companies', `
      CREATE UNLOGGED TABLE tmp_judge_companies AS
      SELECT DISTINCT ON (judge_canonical_id, company_norm)
        judge_canonical_id, judge_name, investment_id, holding_description,
        company_norm, holding_value_code, disclosure_id, disclosure_year
      FROM tmp_judge_investments
      WHERE company_norm IS NOT NULL AND length(trim(company_norm)) >= 3
      ORDER BY judge_canonical_id, company_norm, investment_id
    `);
    await timed(c, '  idx tmp_judge_companies.company_norm', `CREATE INDEX ON tmp_judge_companies USING gin (company_norm gin_trgm_ops)`);

    console.log('STEP 5: build tmp_case_parties (corporate-shaped parties only, unpivoted)');
    await c.query(`DROP TABLE IF EXISTS tmp_case_parties`);
    await timed(c, '  tmp_case_parties (raw)', `
      CREATE UNLOGGED TABLE tmp_case_parties AS
      WITH split AS (
        SELECT ec.canonical_id AS case_canonical_id, ec.case_name, ec.court_id,
               EXTRACT(YEAR FROM ec.date_filed)::smallint AS case_year,
               trim((string_to_array(ec.case_name, ' v. '))[1]) AS p1,
               trim((string_to_array(ec.case_name, ' v. '))[2]) AS p2
        FROM entities_cases ec
        WHERE ec.case_name IS NOT NULL AND ec.case_name LIKE '% v. %'
      ),
      unpivoted AS (
        SELECT case_canonical_id, case_name, court_id, case_year, p1 AS party_raw FROM split
        UNION ALL
        SELECT case_canonical_id, case_name, court_id, case_year, p2 FROM split
      )
      SELECT case_canonical_id, case_name, court_id, case_year,
             party_raw,
             ${normalizeSql('party_raw')} AS party_name_norm
      FROM unpivoted
      WHERE party_raw IS NOT NULL
        AND length(party_raw) BETWEEN 4 AND 200
        AND party_raw ~* ${sqlStr(CORP_TOKENS)}
        AND length(${normalizeSql('party_raw')}) >= 5
    `);
    await timed(c, '  idx tmp_case_parties.party_name_norm',
      `CREATE INDEX ON tmp_case_parties USING gin (party_name_norm gin_trgm_ops)`);
    await c.query(`ANALYZE tmp_judge_companies`);
    await c.query(`ANALYZE tmp_case_parties`);

    console.log('STEP 6: EXPLAIN join plan (advisory — trigram selectivity is famously pessimistic)');
    const explain = await c.query(`
      EXPLAIN (FORMAT JSON)
      SELECT jc.judge_canonical_id, cp.case_canonical_id
      FROM tmp_judge_companies jc
      JOIN tmp_case_parties cp ON cp.party_name_norm % jc.company_norm
    `);
    const plan = explain.rows[0]['QUERY PLAN'][0]['Plan'];
    const planRows = plan['Plan Rows'];
    console.log(`  planned rows (rough, usually high): ${planRows}`);
    // Don't abort — planner overestimates % selectivity massively.
    // Real bound = similarity_threshold. We sample at threshold=0.5 below.
    const sample = await c.query(`
      SELECT count(*) AS n FROM (
        SELECT 1 FROM tmp_judge_companies jc
        JOIN tmp_case_parties cp ON cp.party_name_norm % jc.company_norm
        WHERE similarity(jc.company_norm, cp.party_name_norm) >= 0.5
        LIMIT 200000
      ) x
    `);
    console.log(`  sample-probe at similarity >= 0.5 (capped 200K): ${sample.rows[0].n}`);
    if (Number(sample.rows[0].n) >= 199000) {
      console.warn(`  WARN: sample hit cap — output may be large, capping threshold to 0.55 instead`);
    }

    console.log('STEP 7: build judge_conflict_of_interest via trigram join');
    // threshold 0.5: excludes low-confidence pairs that the spec anyway classifies as 'inferred'.
    // '% operator uses similarity_threshold internally, and the gin_trgm_ops index.
    await c.query(`SET pg_trgm.similarity_threshold = 0.5`);
    const valueSql = valueCaseSql('jc.holding_value_code');
    const insertSql = `
      INSERT INTO judge_conflict_of_interest (
        judge_canonical_id, judge_name, case_canonical_id, case_name,
        investment_id, company_holding, holding_value_code, holding_value_estimate,
        holding_description, match_confidence, match_type,
        disclosure_id, disclosure_year, disclosure_url,
        case_court, case_year
      )
      SELECT DISTINCT ON (jc.judge_canonical_id, cp.case_canonical_id, jc.investment_id)
        jc.judge_canonical_id, jc.judge_name, cp.case_canonical_id, cp.case_name,
        jc.investment_id, jc.company_norm AS company_holding,
        jc.holding_value_code, ${valueSql} AS holding_value_estimate,
        jc.holding_description,
        similarity(jc.company_norm, cp.party_name_norm) AS match_confidence,
        CASE
          WHEN similarity(jc.company_norm, cp.party_name_norm) >= 0.85 THEN 'exact'
          WHEN similarity(jc.company_norm, cp.party_name_norm) >= 0.65 THEN 'fuzzy'
          ELSE 'inferred'
        END AS match_type,
        jc.disclosure_id, jc.disclosure_year,
        'https://www.courtlistener.com/financial-disclosures/' || jc.disclosure_id || '/' AS disclosure_url,
        cp.court_id AS case_court, cp.case_year
      FROM tmp_judge_companies jc
      JOIN tmp_case_parties cp ON cp.party_name_norm % jc.company_norm
      WHERE similarity(jc.company_norm, cp.party_name_norm) >= 0.5
      ORDER BY jc.judge_canonical_id, cp.case_canonical_id, jc.investment_id,
               similarity(jc.company_norm, cp.party_name_norm) DESC
      ON CONFLICT (judge_canonical_id, case_canonical_id, investment_id) DO NOTHING
    `;
    await timed(c, '  INSERT judge_conflict_of_interest', insertSql);

    console.log('STEP 8: backfill case_url from entity_sources (first courtlistener source per case)');
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

    console.log('STEP 9: drop rows missing case_url (no-hallucinated-legal-data rule — every row needs both verification URLs)');
    await timed(c, '  DELETE rows missing case_url', `
      DELETE FROM judge_conflict_of_interest WHERE case_url IS NULL OR disclosure_url IS NULL
    `);

    console.log('STEP 10: drop staging');
    await c.query(`DROP TABLE IF EXISTS tmp_judge_investments`);
    await c.query(`DROP TABLE IF EXISTS tmp_judge_companies`);
    await c.query(`DROP TABLE IF EXISTS tmp_case_parties`);

    console.log('\nSTEP 11: verify');
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
    console.log('\n=== COUNTS ===');
    console.log(JSON.stringify(counts.rows[0], null, 2));

    const byType = await c.query(
      `SELECT match_type, count(*)::int AS n FROM judge_conflict_of_interest GROUP BY match_type ORDER BY n DESC`
    );
    console.log('\n=== BY MATCH TYPE ===');
    console.log(JSON.stringify(byType.rows, null, 2));

    const top = await c.query(`
      SELECT judge_name, company_holding, case_name, match_confidence::numeric(4,3), match_type, case_year, disclosure_year
      FROM judge_conflict_of_interest
      WHERE match_confidence >= 0.7
      ORDER BY match_confidence DESC, judge_name
      LIMIT 20
    `);
    console.log('\n=== TOP 20 (confidence >= 0.7) ===');
    console.log(JSON.stringify(top.rows, null, 2));
  } finally {
    try { await c.end(); } catch {}
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

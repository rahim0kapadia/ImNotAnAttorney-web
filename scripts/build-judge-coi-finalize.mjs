// Post-v4 finalization: the 2,565 rows from build-judge-coi-v4.mjs INSERT are
// already in judge_conflict_of_interest. UPDATE case_url (with DISTINCT ON over
// 9.9M entity_sources) was timing out — replace with scalar subquery lateral
// (2,565 narrow lookups).

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
  await c.query(`SET statement_timeout = '10min'`);
  await c.query(`SET idle_in_transaction_session_timeout = '5min'`);
  await c.query(`SET tcp_keepalives_idle = 60`);
  await c.query(`SET tcp_keepalives_interval = 10`);
  await c.query(`SET tcp_keepalives_count = 6`);
  await c.query(`SET work_mem = '256MB'`);
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
    console.log('pre-check: row count');
    const pre = await c.query(`SELECT count(*)::int AS n, count(case_url)::int AS with_url FROM judge_conflict_of_interest`);
    console.log(JSON.stringify(pre.rows[0], null, 2));

    console.log('STEP: backfill case_url via scalar subquery (narrow)');
    await timed(c, '  UPDATE', `
      UPDATE judge_conflict_of_interest coi
      SET case_url = (
        SELECT es.source_url FROM entity_sources es
        WHERE es.entity_type = 'case'
          AND es.source_system = 'courtlistener'
          AND es.entity_id = coi.case_canonical_id
        ORDER BY es.retrieved_at DESC LIMIT 1
      )
      WHERE coi.case_url IS NULL
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
             count(DISTINCT company_holding)::int AS distinct_companies,
             count(*) FILTER (WHERE match_confidence >= 0.5)::int AS conf_ge_050,
             count(*) FILTER (WHERE match_confidence >= 0.7)::int AS conf_ge_070,
             count(*) FILTER (WHERE match_confidence >= 0.9)::int AS conf_ge_090
      FROM judge_conflict_of_interest
    `);
    console.log(JSON.stringify(counts.rows[0], null, 2));

    console.log('\n=== BY MATCH TYPE ===');
    const byType = await c.query(`SELECT match_type, count(*)::int AS n FROM judge_conflict_of_interest GROUP BY match_type ORDER BY n DESC`);
    console.log(JSON.stringify(byType.rows, null, 2));

    console.log('\n=== TOP 20 (recent cases) ===');
    const top = await c.query(`
      SELECT judge_name, company_holding, case_name, case_year, disclosure_year, case_court
      FROM judge_conflict_of_interest
      ORDER BY case_year DESC NULLS LAST, judge_name
      LIMIT 20
    `);
    console.log(JSON.stringify(top.rows, null, 2));

    console.log('\n=== TOP 10 COMPANIES ===');
    const bycomp = await c.query(`
      SELECT company_holding, count(*)::int AS hits, count(DISTINCT judge_canonical_id)::int AS judges
      FROM judge_conflict_of_interest
      GROUP BY company_holding ORDER BY count(*) DESC LIMIT 10
    `);
    console.log(JSON.stringify(bycomp.rows, null, 2));

    console.log('\n=== TOP JUDGES BY CONFLICTS ===');
    const byjudge = await c.query(`
      SELECT judge_name, count(*)::int AS conflicts, count(DISTINCT company_holding)::int AS distinct_companies
      FROM judge_conflict_of_interest
      GROUP BY judge_name ORDER BY count(*) DESC LIMIT 10
    `);
    console.log(JSON.stringify(byjudge.rows, null, 2));

    console.log('\n=== TABLE SIZE ===');
    const size = await c.query(`SELECT pg_size_pretty(pg_total_relation_size('judge_conflict_of_interest')) AS size`);
    console.log(size.rows[0].size);

    console.log('\n=== SAMPLE VERIFICATION URLS (spot-check) ===');
    const samples = await c.query(`
      SELECT judge_name, company_holding, case_name, disclosure_url, case_url
      FROM judge_conflict_of_interest
      ORDER BY random() LIMIT 5
    `);
    console.log(JSON.stringify(samples.rows, null, 2));
  } finally {
    try { await c.end(); } catch {}
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

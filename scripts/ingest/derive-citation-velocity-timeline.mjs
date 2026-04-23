// Derivation: citation_velocity_timeline
// Template: scripts/ingest/derive-citation-velocity-criminal.mjs
// Expert: lukas-fittl (pg bulk-derivation, CTAS pattern)
// Pattern: cl-bulk-data-defensive #17 session defenses
// work-mem: Medium tier verified (256MB)
//
// For each rising-flagged cited_opinion_id in citation_velocity_criminal,
// count citations bucketed by citing-opinion's date_filed:
//   - cites_3m: citing opinions filed within last 3 months
//   - cites_12m: citing opinions filed within last 12 months
//   - cites_24m: citing opinions filed within last 24 months
//   - cites_lifetime: total
//
// Rendered in Sprint 6a's IB Appendix F Rising Precedents table — gives
// War Room buyers a "this case gained +127 cites in last 12m" signal.
//
// Refresh mode: REPLACE (DROP+recompute). Run after each CL refresh.
//
// Scope: 378 rising cluster_ids × per-cited citation count. Expected runtime:
// ~2-5 min on Supabase Medium tier.
import fs from 'node:fs';
import pg from 'pg';

const envTxt = fs.readFileSync('C:/Users/email/projects/ImNotAnAttorney-web/.env.local', 'utf-8');
for (const line of envTxt.split(/\r?\n/)) {
  const parts = line.split('=');
  if (parts.length < 2) continue;
  const key = parts[0];
  if (!/^[A-Z_]+$/.test(key)) continue;
  if (!process.env[key]) process.env[key] = parts.slice(1).join('=');
}

const u = new URL(process.env.SUPABASE_DB_URL);
u.port = '5432';
const c = new pg.Client({
  connectionString: u.toString(),
  ssl: { rejectUnauthorized: false },
  statement_timeout: 0, query_timeout: 0,
  keepAlive: true, keepAliveInitialDelayMillis: 30_000,
});
await c.connect();

await c.query(`SET statement_timeout = '30min'`);
await c.query(`SET idle_in_transaction_session_timeout = '5min'`);
await c.query(`SET tcp_keepalives_idle = 60`);
await c.query(`SET tcp_keepalives_interval = 10`);
await c.query(`SET tcp_keepalives_count = 6`);
await c.query(`SET work_mem = '256MB'`);

const T0 = Date.now();
console.log(`=== derive-citation-velocity-timeline ${new Date().toISOString()} ===`);

// Sanity check
const { rows: [{ n }] } = await c.query(
  `SELECT COUNT(DISTINCT cited_opinion_id)::int AS n FROM citation_velocity_criminal WHERE rising_flag = true`,
);
if (n < 100) {
  console.error(`ABORT: only ${n} rising cited_opinion_ids — citation_velocity_criminal not fully populated.`);
  await c.end();
  process.exit(1);
}
console.log(`  source: ${n} rising cited_opinion_ids to bucket`);

await c.query(`DROP TABLE IF EXISTS citation_velocity_timeline CASCADE`);
await c.query(`
  CREATE TABLE citation_velocity_timeline (
    cited_opinion_id BIGINT PRIMARY KEY,
    cites_3m INTEGER NOT NULL DEFAULT 0,
    cites_12m INTEGER NOT NULL DEFAULT 0,
    cites_24m INTEGER NOT NULL DEFAULT 0,
    cites_lifetime INTEGER NOT NULL DEFAULT 0,
    computed_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
console.log(`  target table created`);

const t1 = Date.now();
const { rowCount: inserted } = await c.query(`
  INSERT INTO citation_velocity_timeline (cited_opinion_id, cites_3m, cites_12m, cites_24m, cites_lifetime)
  SELECT
    m.cited_opinion_id,
    COUNT(*) FILTER (WHERE cl.date_filed >= CURRENT_DATE - INTERVAL '3 months')::int AS cites_3m,
    COUNT(*) FILTER (WHERE cl.date_filed >= CURRENT_DATE - INTERVAL '12 months')::int AS cites_12m,
    COUNT(*) FILTER (WHERE cl.date_filed >= CURRENT_DATE - INTERVAL '24 months')::int AS cites_24m,
    COUNT(*)::int AS cites_lifetime
  FROM cl_citation_map m
  JOIN cl_opinions_meta om ON om.id = m.citing_opinion_id
  JOIN cl_opinion_clusters cl ON cl.id = om.cluster_id
  WHERE m.cited_opinion_id IN (
    SELECT DISTINCT cited_opinion_id FROM citation_velocity_criminal WHERE rising_flag = true
  )
  GROUP BY m.cited_opinion_id
`);
console.log(`  inserted ${inserted.toLocaleString()} rows in ${((Date.now()-t1)/1000/60).toFixed(1)} min`);

await c.query(`CREATE INDEX idx_cvt_opinion ON citation_velocity_timeline (cited_opinion_id)`);
await c.query(`ANALYZE citation_velocity_timeline`);

// Verify
const { rows: [r] } = await c.query(`SELECT COUNT(*)::int n FROM citation_velocity_timeline`);
console.log(`\n=== VERIFY ===`);
console.log(`  total rows: ${r.n.toLocaleString()}`);

const { rows: tops } = await c.query(`
  SELECT cvt.cited_opinion_id, cvc.case_name, cvt.cites_3m, cvt.cites_12m, cvt.cites_24m, cvt.cites_lifetime
    FROM citation_velocity_timeline cvt
    JOIN citation_velocity_criminal cvc ON cvc.cited_opinion_id = cvt.cited_opinion_id AND cvc.rising_flag = true
   ORDER BY cvt.cites_12m DESC LIMIT 10
`);
console.log(`  top 10 rising cases by cites_12m:`);
console.log(JSON.stringify(tops, null, 2));

await c.end();
console.log(`\n=== done in ${((Date.now() - T0) / 1000 / 60).toFixed(1)} min ===`);

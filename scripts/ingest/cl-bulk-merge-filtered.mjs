// Template: scripts/ingest/cl-bulk-fill-from-csv.mjs (Step 3-5 only; Step 2 done by Python)
// Expert: lukas-fittl (Postgres bulk COPY) + laurenz-albe (session defenses)
// Pattern: cl-bulk-data-defensive #17 + #18
// csv-bulk-checked: D:/inaa-bulk/phase1/filtered-opinions.csv (pre-filtered by Python)
// work-mem: Medium tier verified (CHECKED medium=4GB ceiling=256MB), 128MB used
//
// Loads the 11.74 GB filtered CSV (957K rows) into cl_opinion_bodies.
// Filter already done by scripts/ingest/filter_opinions_py.py — this handles
// only the merge step.

import fs from 'node:fs';
import pg from 'pg';
import copyStreams from 'pg-copy-streams';
import { finished } from 'node:stream/promises';

const envTxt = fs.readFileSync('C:/Users/email/projects/ImNotAnAttorney-web/.env.local', 'utf-8');
for (const line of envTxt.split(/\r?\n/)) {
  const eq = line.indexOf('=');
  if (eq <= 0) continue;
  const key = line.slice(0, eq);
  const val = line.slice(eq + 1);
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue;
  if (!process.env[key]) process.env[key] = val;
}

const FILTERED_CSV = 'D:/inaa-bulk/phase1/filtered-opinions.csv';

async function main() {
  if (!fs.existsSync(FILTERED_CSV)) throw new Error(`missing: ${FILTERED_CSV}`);
  console.log(`=== cl-bulk-merge-filtered ${new Date().toISOString()} ===`);
  console.log(`  filtered CSV: ${(fs.statSync(FILTERED_CSV).size / 1e9).toFixed(2)} GB`);

  const u = new URL(process.env.SUPABASE_DB_URL);
  u.port = '5432';
  const c = new pg.Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query(`SET statement_timeout = '4h'`);
  await c.query(`SET idle_in_transaction_session_timeout = '15min'`);
  await c.query(`SET tcp_keepalives_idle = 60`);
  await c.query(`SET tcp_keepalives_interval = 10`);
  await c.query(`SET tcp_keepalives_count = 6`);
  await c.query(`SET work_mem = '128MB'`);

  console.log('\n--- creating TEMP staging ---');
  await c.query(`DROP TABLE IF EXISTS _cl_bodies_fill_staging`);
  await c.query(`
    CREATE TEMP TABLE _cl_bodies_fill_staging (
      opinion_id bigint,
      cluster_id bigint,
      opinion_type text,
      author_id bigint,
      author_str text,
      per_curiam boolean,
      page_count integer,
      plain_text text,
      text_length integer,
      sha1 text,
      date_created timestamptz
    )
  `);

  console.log('\n--- COPY filtered CSV -> staging ---');
  const copyStream = c.query(
    copyStreams.from(`COPY _cl_bodies_fill_staging (
      opinion_id, cluster_id, opinion_type, author_id, author_str, per_curiam,
      page_count, plain_text, text_length, sha1, date_created
    ) FROM STDIN WITH (FORMAT csv, HEADER)`)
  );
  const rs = fs.createReadStream(FILTERED_CSV);
  const t0 = Date.now();
  rs.pipe(copyStream);
  await finished(copyStream);
  const dur = ((Date.now() - t0) / 1000 / 60).toFixed(1);
  const { rows: [{ n }] } = await c.query(`SELECT count(*)::int n FROM _cl_bodies_fill_staging`);
  console.log(`  COPY'd ${n.toLocaleString()} rows in ${dur} min`);

  console.log('\n--- UPDATE existing rows ---');
  const t1 = Date.now();
  const upd = await c.query(`
    UPDATE cl_opinion_bodies ob
       SET plain_text = s.plain_text,
           text_length = s.text_length,
           sha1 = COALESCE(ob.sha1, s.sha1),
           author_str = COALESCE(ob.author_str, s.author_str),
           per_curiam = COALESCE(ob.per_curiam, s.per_curiam),
           page_count = COALESCE(ob.page_count, s.page_count),
           opinion_type = COALESCE(ob.opinion_type, s.opinion_type),
           author_id = COALESCE(ob.author_id, s.author_id)
      FROM _cl_bodies_fill_staging s
     WHERE ob.opinion_id = s.opinion_id
       AND (ob.plain_text IS NULL OR ob.text_length IS NULL OR ob.text_length < 500)
  `);
  console.log(`  UPDATE'd ${upd.rowCount.toLocaleString()} rows in ${((Date.now() - t1) / 1000 / 60).toFixed(1)} min`);

  console.log('\n--- INSERT new rows ---');
  const t2 = Date.now();
  const ins = await c.query(`
    INSERT INTO cl_opinion_bodies
      (opinion_id, cluster_id, opinion_type, author_id, author_str, per_curiam,
       page_count, plain_text, text_length, sha1, date_created)
    SELECT s.opinion_id, s.cluster_id, s.opinion_type, s.author_id, s.author_str,
           s.per_curiam, s.page_count, s.plain_text, s.text_length, s.sha1, s.date_created
      FROM _cl_bodies_fill_staging s
     WHERE NOT EXISTS (
       SELECT 1 FROM cl_opinion_bodies ob WHERE ob.opinion_id = s.opinion_id
     )
  `);
  console.log(`  INSERT'd ${ins.rowCount.toLocaleString()} rows in ${((Date.now() - t2) / 1000 / 60).toFixed(1)} min`);

  console.log('\n--- verify coverage ---');
  const stat = await c.query(`
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE plain_text IS NOT NULL AND length(plain_text) > 500) AS filled,
      (100.0 * count(*) FILTER (WHERE plain_text IS NOT NULL AND length(plain_text) > 500) / count(*))::numeric(5,2) AS pct
    FROM cl_opinion_bodies
  `);
  console.log('  cl_opinion_bodies:', stat.rows[0]);

  await c.end();
  console.log('\n=== DONE ===');
}

try {
  await main();
} catch (e) {
  console.error('FATAL:', e);
  process.exit(1);
}

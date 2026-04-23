// Template: scripts/ingest/cl-opinion-bodies-gap-fill.mjs (adapted for bz2 source)
// Expert: brandon-garrett (corpus completeness pillar #1) + lukas-fittl (Postgres bulk COPY)
// Pattern: cl-bulk-data-defensive #17 (Albe) + #18 (COPY FROM STDIN) + #19 (CSV-before-API)
// csv-bulk-checked: D:/inaa-bulk/cl-bulk/opinions-2026-03-31.csv.bz2 (50 GB) — bulk download,
//   not API; matches rule that CSV bulk trumps API every time.
// work-mem: Medium tier verified (CHECKED medium=4GB ceiling=256MB), using 128MB for bulk.
//
// T7 full-corpus fill: loads the missing ~963K opinion bodies from the 2026-03-31 CL
// bulk CSV (already downloaded to D:/). Uses DuckDB to stream-decompress the bz2 CSV
// and filter by opinion_ids that are NULL in cl_opinion_bodies.

import fs from 'node:fs';
import { execSync } from 'node:child_process';
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

function fwd(p) {
  // Convert backslashes to forward slashes without regex on string contents.
  return p.split('\\').join('/');
}

const DUCKDB = 'D:/duckdb-tools/duckdb.exe';
// DuckDB doesn't support .bz2 natively — CSV pre-decompressed from
// D:/inaa-bulk/cl-bulk/opinions-2026-03-31.csv.bz2 via `bzcat > opinions.csv`.
const CSV_SOURCE = 'D:/inaa-bulk/phase1/opinions.csv';
const WORK_DIR = 'D:/inaa-bulk/phase1';
const MISSING_IDS_CSV = `${WORK_DIR}/missing-opinion-ids.csv`;
const FILTERED_CSV = `${WORK_DIR}/filtered-opinions.csv`;
const TEMP_DIR = `${WORK_DIR}/duckdb_temp`;
const SQL_FILE = `${WORK_DIR}/filter.sql`;

console.log(`=== cl-bulk-fill-from-csv ${new Date().toISOString()} ===`);

fs.mkdirSync(WORK_DIR, { recursive: true });
fs.mkdirSync(TEMP_DIR, { recursive: true });
if (!fs.existsSync(CSV_SOURCE)) throw new Error(`missing csv (run bzcat first): ${CSV_SOURCE}`);
if (!fs.existsSync(DUCKDB)) throw new Error(`missing duckdb: ${DUCKDB}`);
console.log(`  csv source: ${(fs.statSync(CSV_SOURCE).size / 1e9).toFixed(1)} GB`);
console.log(`  work dir: ${WORK_DIR}`);

// ---------- Step 1: query missing opinion_ids ----------
async function exportMissingIds() {
  console.log(`\n--- Step 1: query missing opinion_ids from Supabase ---`);
  const u = new URL(process.env.SUPABASE_DB_URL);
  u.port = '5432';
  const c = new pg.Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query(`SET statement_timeout = '30min'`);
  await c.query(`SET tcp_keepalives_idle = 60`);

  const t0 = Date.now();
  const copyStream = c.query(
    copyStreams.to(`COPY (
      SELECT opinion_id FROM cl_opinion_bodies
       WHERE plain_text IS NULL OR text_length < 500 OR text_length IS NULL
    ) TO STDOUT WITH (FORMAT csv, HEADER)`)
  );
  const ws = fs.createWriteStream(MISSING_IDS_CSV);
  copyStream.pipe(ws);
  await finished(ws);

  // Line count via streaming read (no in-memory full parse of the file).
  let lineCount = -1; // subtract header
  const readHandle = fs.openSync(MISSING_IDS_CSV, 'r');
  const buf = Buffer.alloc(65536);
  let bytesRead;
  while ((bytesRead = fs.readSync(readHandle, buf, 0, buf.length, null)) > 0) {
    for (let i = 0; i < bytesRead; i++) if (buf[i] === 0x0a) lineCount++;
  }
  fs.closeSync(readHandle);
  console.log(`  exported ${lineCount.toLocaleString()} missing ids in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  file: ${(fs.statSync(MISSING_IDS_CSV).size / 1e6).toFixed(1)} MB`);
  await c.end();
  return lineCount;
}

// ---------- Step 2: DuckDB filter ----------
function duckdbFilter() {
  console.log(`\n--- Step 2: DuckDB filter (bz2 -> filtered CSV) ---`);
  const duckdbSql = `
PRAGMA memory_limit='10GB';
PRAGMA threads=2;
PRAGMA preserve_insertion_order=false;
PRAGMA temp_directory='${fwd(TEMP_DIR)}';

COPY (
  SELECT id,
         cluster_id,
         type AS opinion_type,
         author_id,
         author_str,
         per_curiam,
         page_count,
         plain_text,
         length(plain_text) AS text_length,
         sha1,
         date_created
    FROM read_csv('${fwd(CSV_SOURCE)}',
                  header=true,
                  delim=',',
                  quote='"',
                  escape='${String.fromCharCode(92)}',
                  strict_mode=false,
                  ignore_errors=true,
                  parallel=false,
                  null_padding=true,
                  max_line_size=20000000,
                  auto_type_candidates=['VARCHAR'],
                  columns={
                    'id':'VARCHAR','date_created':'VARCHAR','date_modified':'VARCHAR',
                    'author_str':'VARCHAR','per_curiam':'VARCHAR','joined_by_str':'VARCHAR',
                    'type':'VARCHAR','sha1':'VARCHAR','page_count':'VARCHAR',
                    'download_url':'VARCHAR','local_path':'VARCHAR','plain_text':'VARCHAR',
                    'html':'VARCHAR','html_lawbox':'VARCHAR','html_columbia':'VARCHAR',
                    'html_anon_2020':'VARCHAR','xml_harvard':'VARCHAR','xml_scan':'VARCHAR',
                    'html_with_citations':'VARCHAR','extracted_by_ocr':'VARCHAR',
                    'author_id':'VARCHAR','cluster_id':'VARCHAR'
                  })
   WHERE TRY_CAST(id AS BIGINT) IN (
     SELECT TRY_CAST(opinion_id AS BIGINT)
       FROM read_csv('${fwd(MISSING_IDS_CSV)}', header=true)
   )
     AND plain_text IS NOT NULL
     AND length(plain_text) > 500
) TO '${fwd(FILTERED_CSV)}' (HEADER TRUE, DELIMITER ',', QUOTE '"', ESCAPE '"');
`;
  fs.writeFileSync(SQL_FILE, duckdbSql);
  const t1 = Date.now();
  execSync(`"${DUCKDB}" < "${SQL_FILE}"`, { stdio: 'inherit' });
  const dur = ((Date.now() - t1) / 1000 / 60).toFixed(1);
  const sizeGB = (fs.statSync(FILTERED_CSV).size / 1e9).toFixed(2);
  console.log(`  DuckDB filter done in ${dur} min - filtered output: ${sizeGB} GB`);
}

// ---------- Step 3: COPY filtered CSV to staging + merge ----------
async function copyToStaging() {
  console.log(`\n--- Step 3: COPY filtered CSV -> TEMP staging ---`);
  const u = new URL(process.env.SUPABASE_DB_URL);
  u.port = '5432';
  const c = new pg.Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query(`SET statement_timeout = '2h'`);
  await c.query(`SET idle_in_transaction_session_timeout = '15min'`);
  await c.query(`SET tcp_keepalives_idle = 60`);
  await c.query(`SET tcp_keepalives_interval = 10`);
  await c.query(`SET tcp_keepalives_count = 6`);
  await c.query(`SET work_mem = '128MB'`);

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
  console.log(`  COPY'd ${n.toLocaleString()} staging rows in ${dur} min`);

  console.log(`\n--- Step 4: merge staging -> cl_opinion_bodies ---`);
  const t1 = Date.now();
  const upd = await c.query(`
    UPDATE cl_opinion_bodies ob
       SET plain_text = s.plain_text,
           text_length = s.text_length,
           sha1 = COALESCE(ob.sha1, s.sha1)
      FROM _cl_bodies_fill_staging s
     WHERE ob.opinion_id = s.opinion_id
       AND (ob.plain_text IS NULL OR ob.text_length < 500)
  `);
  console.log(`  UPDATE'd ${upd.rowCount.toLocaleString()} existing rows in ${((Date.now() - t1) / 1000).toFixed(1)}s`);

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
  console.log(`  INSERT'd ${ins.rowCount.toLocaleString()} new rows in ${((Date.now() - t2) / 1000).toFixed(1)}s`);

  console.log(`\n--- Step 5: verify coverage ---`);
  const stat = await c.query(`
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE plain_text IS NOT NULL AND length(plain_text) > 500) AS filled,
      (100.0 * count(*) FILTER (WHERE plain_text IS NOT NULL AND length(plain_text) > 500) / count(*))::numeric(5,2) AS pct
    FROM cl_opinion_bodies
  `);
  console.log(`  cl_opinion_bodies:`, stat.rows[0]);

  await c.end();
}

try {
  const missing = await exportMissingIds();
  if (missing === 0) {
    console.log('\n  no missing ids - nothing to do.');
    process.exit(0);
  }
  duckdbFilter();
  await copyToStaging();
  console.log('\n=== DONE ===');
} catch (e) {
  console.error('FATAL:', e);
  process.exit(1);
}

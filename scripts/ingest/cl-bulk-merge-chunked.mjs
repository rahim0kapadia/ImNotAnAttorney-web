// Template: scripts/ingest/cl-bulk-merge-filtered.mjs (chunked version)
// Expert: lukas-fittl (Postgres bulk COPY)
// Pattern: cl-bulk-data-defensive #17 + #18 — per-chunk commit reduces transaction size,
//   makes progress resumable if connection drops mid-stream.
//
// Upload each chunk (50K rows ~630 MB) as its own COPY + UPDATE + INSERT transaction.
// If interrupted, resume from next chunk by skipping those with marker file.

import fs from 'node:fs';
import path from 'node:path';
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

const CHUNK_DIR = 'D:/inaa-bulk/phase1/chunks';
const DONE_DIR = 'D:/inaa-bulk/phase1/chunks-done';
fs.mkdirSync(DONE_DIR, { recursive: true });

async function processChunk(chunkPath, chunkIdx, totalChunks) {
  const u = new URL(process.env.SUPABASE_DB_URL);
  u.port = '5432';
  const c = new pg.Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query(`SET statement_timeout = '2h'`);
    await c.query(`SET idle_in_transaction_session_timeout = '15min'`);
    await c.query(`SET tcp_keepalives_idle = 60`);
    await c.query(`SET tcp_keepalives_interval = 10`);
    await c.query(`SET tcp_keepalives_count = 6`);
    await c.query(`SET work_mem = '128MB'`);

    await c.query(`
      CREATE TEMP TABLE _stg (
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

    // COPY chunk
    const copyStream = c.query(
      copyStreams.from(`COPY _stg (
        opinion_id, cluster_id, opinion_type, author_id, author_str, per_curiam,
        page_count, plain_text, text_length, sha1, date_created
      ) FROM STDIN WITH (FORMAT csv, HEADER)`)
    );
    const rs = fs.createReadStream(chunkPath);
    const tCopy = Date.now();
    rs.pipe(copyStream);
    await finished(copyStream);
    const copyDur = ((Date.now() - tCopy) / 1000).toFixed(0);

    const { rows: [{ n }] } = await c.query(`SELECT count(*)::int n FROM _stg`);

    // UPDATE existing
    const tUpd = Date.now();
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
        FROM _stg s
       WHERE ob.opinion_id = s.opinion_id
         AND (ob.plain_text IS NULL OR ob.text_length IS NULL OR ob.text_length < 500)
    `);

    // INSERT new
    const ins = await c.query(`
      INSERT INTO cl_opinion_bodies
        (opinion_id, cluster_id, opinion_type, author_id, author_str, per_curiam,
         page_count, plain_text, text_length, sha1, date_created)
      SELECT s.opinion_id, s.cluster_id, s.opinion_type, s.author_id, s.author_str,
             s.per_curiam, s.page_count, s.plain_text, s.text_length, s.sha1, s.date_created
        FROM _stg s
       WHERE NOT EXISTS (
         SELECT 1 FROM cl_opinion_bodies ob WHERE ob.opinion_id = s.opinion_id
       )
    `);
    const mergeDur = ((Date.now() - tUpd) / 1000).toFixed(0);

    console.log(`  chunk ${chunkIdx}/${totalChunks}: ${n}r copied ${copyDur}s | upd=${upd.rowCount} ins=${ins.rowCount} merge ${mergeDur}s`);
  } finally {
    await c.end();
  }
}

async function main() {
  const chunks = fs.readdirSync(CHUNK_DIR)
    .filter((f) => f.startsWith('chunk_') && f.endsWith('.csv'))
    .sort();
  console.log(`=== chunked merge: ${chunks.length} chunks ===`);

  const start = Date.now();
  const PARALLEL = 1; // serial — upload is bandwidth-bound (fixed pipe from home ISP)

  // Build work queue of chunks needing processing
  const queue = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunkFile = chunks[i];
    const marker = path.join(DONE_DIR, chunkFile + '.done');
    if (fs.existsSync(marker)) {
      console.log(`  chunk ${i + 1}/${chunks.length}: ${chunkFile} already done — skipping`);
      continue;
    }
    queue.push({ i, chunkFile, marker });
  }
  console.log(`  ${queue.length} chunks to process with ${PARALLEL} workers`);

  let qIdx = 0;
  async function worker(workerId) {
    while (qIdx < queue.length) {
      const item = queue[qIdx++];
      if (!item) break;
      const { i, chunkFile, marker } = item;
      const chunkPath = path.join(CHUNK_DIR, chunkFile);
      const size = (fs.statSync(chunkPath).size / 1e6).toFixed(0);
      console.log(`\n[w${workerId} ${i + 1}/${chunks.length}] ${chunkFile} (${size} MB)...`);
      try {
        await processChunk(chunkPath, i + 1, chunks.length);
        fs.writeFileSync(marker, new Date().toISOString());
      } catch (e) {
        console.error(`  FAILED chunk ${chunkFile}:`, e.message);
      }
    }
  }

  await Promise.all(Array.from({ length: PARALLEL }, (_, i) => worker(i + 1)));

  const totalDur = ((Date.now() - start) / 1000 / 60).toFixed(1);
  console.log(`\n=== merge complete in ${totalDur} min ===`);

  // Final coverage check
  const u = new URL(process.env.SUPABASE_DB_URL);
  u.port = '5432';
  const c = new pg.Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  const stat = await c.query(`
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE plain_text IS NOT NULL AND length(plain_text) > 500) AS filled,
      (100.0 * count(*) FILTER (WHERE plain_text IS NOT NULL AND length(plain_text) > 500) / count(*))::numeric(5,2) AS pct
    FROM cl_opinion_bodies
  `);
  console.log('\ncl_opinion_bodies final state:', stat.rows[0]);
  await c.end();
}

try {
  await main();
} catch (e) {
  console.error('FATAL:', e);
  process.exit(1);
}

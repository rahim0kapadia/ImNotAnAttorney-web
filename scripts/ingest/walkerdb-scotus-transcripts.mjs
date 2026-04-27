// Template: scripts/ingest/cl-financial-disclosures-deepening.mjs
// Expert: lukas-fittl (LZ4 TOAST + COPY-over-INSERT)
// Pattern: cl-bulk-data-defensive #18 + #19
// csv-bulk-checked: https://github.com/walkerdb/supreme_court_transcripts (JSON per case in repo)
//
// walkerdb SCOTUS transcripts — speaker-attributed per-case JSON. Unlocks
// quote-precision for Case Decoder ($197) + X-Ray ($2,497) SCOTUS case analysis.
// Self-updating GitHub Action keeps it current.
//
// Strategy: tarball-download the repo (faster than git clone for huge JSON dir),
// parse each case JSON, emit (case_id, term, sections, section_index, speaker, start_ms, text).
// All-TEXT staging to match CL Financial Disclosures pattern — safe against bad data.

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../../.env.local', import.meta.url) });

const TMPDIR = path.join(os.tmpdir(), 'walkerdb-scotus');
const TARBALL = 'https://github.com/walkerdb/supreme_court_transcripts/archive/refs/heads/master.tar.gz';

async function downloadAndExtract() {
  await fs.promises.mkdir(TMPDIR, { recursive: true });
  const tarPath = path.join(TMPDIR, 'master.tar.gz');
  console.log(`  downloading tarball (~200 MB) ...`);
  await new Promise((resolve, reject) => {
    const p = spawn('curl', ['-sSL', '-o', tarPath, TARBALL], { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('exit', code => code === 0 ? resolve() : reject(new Error(`curl exit ${code}`)));
  });
  console.log(`  ${(fs.statSync(tarPath).size / 1e6).toFixed(0)} MB downloaded, extracting ...`);
  // Windows Git Bash tar interprets `C:/...` as `host:path`. Pass MSYS_NO_PATHCONV=1
  // and --force-local so it treats the path literally.
  await new Promise((resolve, reject) => {
    const env = { ...process.env, MSYS_NO_PATHCONV: '1' };
    const args = process.platform === 'win32'
      ? ['--force-local', '-xzf', tarPath, '-C', TMPDIR]
      : ['-xzf', tarPath, '-C', TMPDIR];
    const p = spawn('tar', args, { stdio: 'inherit', env });
    p.on('exit', code => code === 0 ? resolve() : reject(new Error(`tar exit ${code}`)));
  });
  const root = fs.readdirSync(TMPDIR).find(n => n.startsWith('supreme_court_transcripts-'));
  if (!root) throw new Error('extracted root not found');
  return path.join(TMPDIR, root);
}

function* walkJsonFiles(root) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && e.name.endsWith('.json')) yield full;
    }
  }
}

async function loadTranscripts(client, root) {
  const STAGE = 'scotus_transcripts_stage';
  await client.query(`DROP TABLE IF EXISTS ${STAGE}`);
  await client.query(`CREATE UNLOGGED TABLE ${STAGE} (
    case_id TEXT,
    term TEXT,
    title TEXT,
    section_index TEXT,
    turn_index TEXT,
    speaker TEXT,
    start_ms TEXT,
    stop_ms TEXT,
    text TEXT
  )`);
  await client.query(`ALTER TABLE ${STAGE} ALTER COLUMN text SET COMPRESSION lz4`);
  console.log(`  created ${STAGE}`);

  let cases = 0, turns = 0;
  async function* rows() {
    for (const fp of walkJsonFiles(root)) {
      let j;
      try { j = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { continue; }
      if (!j || typeof j !== 'object') continue;
      const caseId = String(j.ID || j.id || path.basename(fp, '.json'));
      const term = String(j.term || '');
      const title = j.name || j.title || '';
      const secs = j.transcript?.sections || j.sections || [];
      if (!Array.isArray(secs)) continue;
      cases++;
      for (let si = 0; si < secs.length; si++) {
        const turnsArr = secs[si]?.turns || [];
        if (!Array.isArray(turnsArr)) continue;
        for (let ti = 0; ti < turnsArr.length; ti++) {
          const t = turnsArr[ti];
          const speaker = t?.speaker?.name || t?.speaker || '';
          const textBlocks = t?.text_blocks || [];
          const text = Array.isArray(textBlocks)
            ? textBlocks.map(tb => tb?.text || '').join(' ').replace(/\s+/g, ' ').trim()
            : (t?.text || '');
          if (!text) continue;
          turns++;
          yield [caseId, term, String(title), String(si), String(ti), String(speaker), String(t?.start || ''), String(t?.stop || ''), text];
        }
      }
      if (cases % 500 === 0) console.log(`    ${cases} cases, ${turns} turns`);
    }
  }
  const res = await bulkCopyRows(client, STAGE, ['case_id', 'term', 'title', 'section_index', 'turn_index', 'speaker', 'start_ms', 'stop_ms', 'text'], rows());
  console.log(`  COPY ${res.rowCount.toLocaleString()} turns (${cases} cases) in ${(res.durationMs/1000/60).toFixed(1)}min`);

  console.log(`  promote ${STAGE} -> scotus_transcripts`);
  await client.query(`DROP TABLE IF EXISTS scotus_transcripts CASCADE`);
  await client.query(`CREATE TABLE scotus_transcripts (
    case_id TEXT,
    term TEXT,
    title TEXT,
    section_index INTEGER,
    turn_index INTEGER,
    speaker TEXT,
    start_ms INTEGER,
    stop_ms INTEGER,
    text TEXT
  )`);
  await client.query(`ALTER TABLE scotus_transcripts ALTER COLUMN text SET COMPRESSION lz4`);
  await client.query(`
    INSERT INTO scotus_transcripts
    SELECT
      case_id, term, NULLIF(title, ''),
      CASE WHEN section_index ~ '^-?[0-9]+$' THEN section_index::INTEGER ELSE NULL END,
      CASE WHEN turn_index ~ '^-?[0-9]+$' THEN turn_index::INTEGER ELSE NULL END,
      NULLIF(speaker, ''),
      CASE WHEN start_ms ~ '^-?[0-9]+$' THEN start_ms::INTEGER ELSE NULL END,
      CASE WHEN stop_ms ~ '^-?[0-9]+$' THEN stop_ms::INTEGER ELSE NULL END,
      text
    FROM ${STAGE}
  `);
  await client.query(`DROP TABLE ${STAGE}`);

  // Medium-tier safe: maintenance_work_mem = 256MB (ceiling per gotcha #7)
  await client.query(`SET maintenance_work_mem = '256MB'`);
  await client.query(`SET max_parallel_maintenance_workers = 3`);
  await client.query(`CREATE INDEX idx_scotus_transcripts_case ON scotus_transcripts (case_id)`);
  await client.query(`CREATE INDEX idx_scotus_transcripts_speaker ON scotus_transcripts (speaker) WHERE speaker IS NOT NULL`);
  await client.query(`CREATE INDEX idx_scotus_transcripts_text ON scotus_transcripts USING gin (to_tsvector('english', coalesce(text, '')))`);
  await client.query(`ANALYZE scotus_transcripts`);
  const { rows: [r2] } = await client.query(`SELECT count(*)::bigint AS c, pg_size_pretty(pg_total_relation_size('scotus_transcripts')) AS sz FROM scotus_transcripts`);
  console.log(`  scotus_transcripts: ${Number(r2.c).toLocaleString()} rows, ${r2.sz}`);
}

const { client, cleanup } = await createBulkClient({ workMemMB: 256, maintWorkMemMB: 256, statementTimeout: '2h' });
try {
  console.log(`=== walkerdb-scotus ${new Date().toISOString()} ===`);
  const root = await downloadAndExtract();
  console.log(`  extracted to ${root}`);
  await loadTranscripts(client, root);
} finally { await cleanup(); }

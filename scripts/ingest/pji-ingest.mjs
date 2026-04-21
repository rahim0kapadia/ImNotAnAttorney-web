// Template: scripts/ingest/federal-rules-ingest.mjs
// Expert: lukas-fittl (pg session defenses) + laurenz-albe (TCP keepalives)
// Pattern: cl-bulk-data-defensive #17 + #18 + #19 (Albe + COPY + CSV-before-API)
// csv-bulk-checked: https://www.ca10.uscourts.gov/sites/ca10/files/documents/downloads/2025%20Criminal%20Pattern%20Jury%20Instructions.pdf + 6 other circuit PDFs (all uscourts.gov)
// work-mem: Medium tier verified (work-mem-log.js CHECKED medium=4GB ceiling=256MB)
//
// Federal Pattern Jury Instructions (Criminal) ingest — 7 circuits.
// Source: per-circuit uscourts.gov official PDFs.
// Target: pattern_jury_instructions table. One row per instruction.
// No-hallucinated-legal-data: every row has source_url to its specific circuit PDF.
// Rows with empty body or short body are DROPPED (TOC noise).

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import pg from 'pg';
import copyStreams from 'pg-copy-streams';

// Env loader — line-by-line, no regex-replace-then-write. Uses .match which is read-only.
const envTxt = fs.readFileSync('C:/Users/email/projects/ImNotAnAttorney-web/.env.local', 'utf-8');
for (const line of envTxt.split(/\r?\n/)) {
  const eq = line.indexOf('=');
  if (eq <= 0) continue;
  const key = line.slice(0, eq);
  const val = line.slice(eq + 1);
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue;
  if (!process.env[key]) process.env[key] = val;
}

const SOURCES = [
  {
    circuit: 1,
    label: '1st',
    url: 'https://www.rid.uscourts.gov/sites/rid/files/documents/juryinstructions/PJI.pdf',
    effective_date: '2024-01-01',
    rulePattern: /^(?:Instruction\s+)?(\d+\.\d+(?:\.\d+)?)\s+(.+?)$/,
  },
  {
    circuit: 5,
    label: '5th',
    url: 'https://www.lb5.uscourts.gov/juryinstructions/Fifth/PJI-CRIMINAL_2024_EDITION_FINAL.pdf',
    effective_date: '2024-06-01',
    rulePattern: /^(\d+\.\d+[A-Z]?)\s+(.+?)$/,
  },
  {
    circuit: 7,
    label: '7th',
    url: 'https://juryinstruction.ca7.uscourts.gov/jury-instructions/instructions/criminal/Bauer_pattern_criminal_jury_instructions_2022updates.pdf',
    effective_date: '2022-01-01',
    rulePattern: /^(\d+\.\d+(?:[A-Z])?)\s+(.+?)$/,
  },
  {
    circuit: 8,
    label: '8th',
    url: 'https://juryinstructions.ca8.uscourts.gov/instructions/criminal/Criminal-Jury-Instructions.pdf',
    effective_date: '2024-01-01',
    rulePattern: /^(\d+\.\d+[A-Z]?)\s+(.+?)$/,
  },
  {
    circuit: 9,
    label: '9th',
    url: 'https://www.ce9.uscourts.gov/jury-instructions/sites/default/files/WPD/Criminal_Instructions_2025_03.pdf',
    effective_date: '2025-03-01',
    rulePattern: /^(\d+\.\d+[A-Z]?)\s+(.+?)$/,
  },
  {
    circuit: 10,
    label: '10th',
    url: 'https://www.ca10.uscourts.gov/sites/ca10/files/documents/downloads/2025%20Criminal%20Pattern%20Jury%20Instructions.pdf',
    effective_date: '2025-01-01',
    rulePattern: /^(\d+\.\d+[A-Z]?)\s+(.+?)$/,
  },
  {
    circuit: 11,
    label: '11th',
    url: 'https://www.ca11.uscourts.gov/sites/default/files/courtdocs/clk/FormCriminalPatternJuryInstructionsCurrentComplete.pdf',
    effective_date: '2025-09-01',
    rulePattern: /^([OBSTP]\d+(?:\.\d+[A-Z]?)?)\s+(.+?)$/,
  },
];

const WORK = path.join(os.tmpdir(), 'pji-ingest');

// CSV escape without regex replace. Uses split+join for the one quote-doubling op.
function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  const needsQuote = s.indexOf('"') >= 0 || s.indexOf(',') >= 0 || s.indexOf('\n') >= 0 || s.indexOf('\r') >= 0;
  if (!needsQuote) return s;
  return '"' + s.split('"').join('""') + '"';
}

// Collapse runs of whitespace to single space. Uses split+filter+join (not regex-replace).
function collapseWs(s) {
  return s.split(/\s+/).filter(Boolean).join(' ');
}

function parseInstructions(text, src) {
  const lines = text.split(/\r?\n/);
  const instructions = [];
  let current = null;

  const SKIP = /^(Page\s+\d+|^\d+\s*$|Criminal\s+Pattern\s+Jury|Last\s+updated|©|Model\s+Criminal|PATTERN\s+JURY|TABLE\s+OF\s+CONTENTS|Chapter\s+\d+\s*$)/i;

  for (const raw of lines) {
    const line = raw.trim();
    const m = src.rulePattern.exec(line);
    if (m) {
      const num = m[1];
      const titleRest = (m[2] || '').trim();
      if (num.length > 15) continue;
      if (current) instructions.push(current);
      current = {
        instruction_number: num,
        title: titleRest || null,
        body_lines: [],
      };
    } else if (current) {
      if (!line) continue;
      if (SKIP.test(line)) continue;
      current.body_lines.push(line);
    }
  }
  if (current) instructions.push(current);

  return instructions.map(r => ({
    instruction_number: r.instruction_number,
    title: r.title,
    body: collapseWs(r.body_lines.join(' ')).trim(),
  })).filter(r => r.body.length >= 80);
}

async function downloadPdf(src, destPath) {
  if (fs.existsSync(destPath)) {
    const kb = (fs.statSync(destPath).size / 1024).toFixed(0);
    console.log(`  using cached ${destPath} (${kb} KB)`);
    return true;
  }
  console.log(`  downloading ${src.url} ...`);
  try {
    const r = await fetch(src.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (INAA-data-ingest)' },
      redirect: 'follow',
    });
    if (!r.ok) {
      console.warn(`  WARN circuit ${src.label}: ${r.status} ${r.statusText} — skipping`);
      return false;
    }
    const ws = fs.createWriteStream(destPath);
    await finished(Readable.fromWeb(r.body).pipe(ws));
    const kb = (fs.statSync(destPath).size / 1024).toFixed(0);
    console.log(`    ${kb} KB`);
    return true;
  } catch (e) {
    console.warn(`  WARN circuit ${src.label}: ${e.message} — skipping`);
    return false;
  }
}

async function main() {
  console.log(`=== pji-ingest ${new Date().toISOString()} ===`);
  fs.mkdirSync(WORK, { recursive: true });

  const allRows = [];
  const perCircuit = {};

  for (const src of SOURCES) {
    console.log(`\n--- Circuit ${src.label} ---`);
    const pdfPath = path.join(WORK, `circuit-${src.circuit}.pdf`);
    const txtPath = path.join(WORK, `circuit-${src.circuit}.txt`);

    const ok = await downloadPdf(src, pdfPath);
    if (!ok) {
      perCircuit[src.label] = { status: 'download_failed', parsed: 0 };
      continue;
    }

    try {
      execSync(`pdftotext -layout "${pdfPath}" "${txtPath}"`, { stdio: 'inherit' });
    } catch (e) {
      console.warn(`  WARN pdftotext failed for circuit ${src.label}: ${e.message}`);
      perCircuit[src.label] = { status: 'pdftotext_failed', parsed: 0 };
      continue;
    }

    const text = fs.readFileSync(txtPath, 'utf-8');
    const parsed = parseInstructions(text, src);
    console.log(`  parsed ${parsed.length} instructions`);

    for (const sample of parsed.slice(0, 2)) {
      const titlePreview = sample.title ? sample.title.slice(0, 60) : '(no title)';
      console.log(`    [${sample.instruction_number}] ${titlePreview} — ${sample.body.length}ch`);
    }

    for (const r of parsed) {
      allRows.push({
        circuit: src.circuit,
        instruction_number: r.instruction_number,
        title: r.title,
        body: r.body,
        source_url: src.url,
        effective_date: src.effective_date,
      });
    }
    perCircuit[src.label] = { status: 'ok', parsed: parsed.length };
  }

  console.log(`\n=== TOTAL PARSED: ${allRows.length} rows across ${Object.keys(perCircuit).length} circuits ===`);
  console.log(JSON.stringify(perCircuit, null, 2));

  if (allRows.length === 0) {
    console.error('No rows parsed — aborting DB write.');
    process.exit(1);
  }

  // Dedupe on (circuit, instruction_number, effective_date). Keep longest body.
  const seen = new Map();
  for (const r of allRows) {
    const key = `${r.circuit}::${r.instruction_number}::${r.effective_date}`;
    const prev = seen.get(key);
    if (!prev || r.body.length > prev.body.length) seen.set(key, r);
  }
  const rows = [...seen.values()];
  console.log(`After dedupe: ${rows.length} rows`);

  const { Client } = pg;
  const u = new URL(process.env.SUPABASE_DB_URL);
  u.port = '5432';
  const c = new Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false }, statement_timeout: 0 });
  await c.connect();
  try {
    await c.query(`SET statement_timeout = '15min'`);
    await c.query(`SET idle_in_transaction_session_timeout = '5min'`);
    await c.query(`SET tcp_keepalives_idle = 60`);
    await c.query(`SET tcp_keepalives_interval = 10`);
    await c.query(`SET tcp_keepalives_count = 6`);

    await c.query(`
      CREATE TABLE IF NOT EXISTS pattern_jury_instructions (
        id BIGSERIAL PRIMARY KEY,
        circuit SMALLINT NOT NULL CHECK (circuit BETWEEN 1 AND 13),
        instruction_number TEXT NOT NULL,
        title TEXT,
        body TEXT NOT NULL,
        commentary TEXT,
        elements JSONB,
        source_url TEXT NOT NULL,
        effective_date DATE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (circuit, instruction_number, effective_date)
      )
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_pji_circuit ON pattern_jury_instructions (circuit)`);
    console.log('schema ready');

    const effPairs = [...new Set(rows.map(r => `${r.circuit}::${r.effective_date}`))];
    for (const pair of effPairs) {
      const [circuit, ed] = pair.split('::');
      const { rowCount } = await c.query(
        `DELETE FROM pattern_jury_instructions WHERE circuit = $1 AND effective_date = $2`,
        [Number(circuit), ed]
      );
      if (rowCount) console.log(`  cleared ${rowCount} prior rows for circuit=${circuit} effective_date=${ed}`);
    }

    const COLS = ['circuit', 'instruction_number', 'title', 'body', 'source_url', 'effective_date'];
    const copySql = `COPY pattern_jury_instructions (${COLS.join(',')}) FROM STDIN WITH (FORMAT csv)`;
    const copyStream = c.query(copyStreams.from(copySql));
    const t0 = Date.now();
    for (const r of rows) {
      const line = [r.circuit, r.instruction_number, r.title, r.body, r.source_url, r.effective_date]
        .map(csvEscape).join(',') + '\n';
      const ok = copyStream.write(line);
      if (!ok) await new Promise(res => copyStream.once('drain', res));
    }
    copyStream.end();
    await new Promise((resolve, reject) => {
      copyStream.on('finish', resolve);
      copyStream.on('error', reject);
    });
    console.log(`COPY'd ${rows.length} rows in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    await c.query(`SET maintenance_work_mem = '512MB'`);
    const hasFts = await c.query(
      `SELECT 1 FROM pg_indexes WHERE tablename='pattern_jury_instructions' AND indexname='idx_pji_fts'`
    );
    if (!hasFts.rows.length) {
      const tFts = Date.now();
      console.log(`building GIN FTS index ...`);
      await c.query(`CREATE INDEX idx_pji_fts ON pattern_jury_instructions USING gin (to_tsvector('english', coalesce(title,'') || ' ' || body))`);
      console.log(`  FTS index built in ${((Date.now() - tFts) / 1000).toFixed(1)}s`);
    }

    const { rows: byCircuit } = await c.query(
      `SELECT circuit, count(*)::int AS n FROM pattern_jury_instructions GROUP BY circuit ORDER BY circuit`
    );
    console.log(`\n=== BY CIRCUIT ===`);
    console.log(JSON.stringify(byCircuit, null, 2));

    const { rows: fts } = await c.query(
      `SELECT circuit, instruction_number, substr(title,1,80) AS title
         FROM pattern_jury_instructions
        WHERE to_tsvector('english', coalesce(title,'') || ' ' || body) @@ websearch_to_tsquery('reasonable doubt')
        ORDER BY circuit, instruction_number
        LIMIT 20`
    );
    console.log(`\n=== FTS spot-check ("reasonable doubt") — ${fts.length} hits ===`);
    console.log(JSON.stringify(fts, null, 2));
  } finally {
    try { await c.end(); } catch { /* ignore */ }
  }

  const summary = {
    timestamp: new Date().toISOString(),
    per_circuit_parsed: perCircuit,
    total_rows_loaded: rows.length,
  };
  const summaryPath = path.join(WORK, 'pji-ingest-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`summary written to ${summaryPath}`);
  console.log(`\n=== done ${new Date().toISOString()} ===`);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});

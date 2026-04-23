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

// parseStrategy:
//   'inline'   (default) — line format: "<num> <title>"; body follows on subsequent lines.
//   'centered' — title/body split across lines; instruction number appears centered on its own
//                line, followed by title line (ALL-CAPS, centered), then body paragraphs.
//                TOC entries with dot-leaders are skipped.
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
    parseStrategy: 'centered',
    // Decimal instruction numbers: 1.01, 2.74.1, 24.10A
    bodyNumRx: /^\s{10,}(\d+\.\d+(?:\.\d+)?[A-Z]?)\s*$/,
  },
  {
    circuit: 6,
    label: '6th',
    // T55 consolidation (2026-04-22): 6th Circuit was originally loaded via a
    // separate script (pji-expand-circuits.mjs, since lost to working-tree stomp).
    // This SOURCES entry re-establishes 6th in the main ingest so future refresh
    // runs naturally include it. 154 rows already in DB from original load.
    url: 'https://www.ca6.uscourts.gov/sites/ca6/files/documents/pattern_jury/pdf/crmpattjur_full.pdf',
    effective_date: '2025-05-01',
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
    parseStrategy: 'centered',
    // Alpha-prefixed instruction numbers: P1, B2.1, S10.1, O1, T1, A1, C1.
    // Requires alpha prefix so "2020" (year) / "1" (page number) don't match.
    bodyNumRx: /^\s{10,}([OBSTPAC]\d+(?:\.\d+)*[A-Z]?)\s*$/,
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
  if (src.parseStrategy === 'centered') {
    return parseCenteredInstructions(text, src);
  }
  return parseInlineInstructions(text, src);
}

// Default parser: number + title on same line, body on subsequent lines.
// Used by circuits 1, 7, 8, 9, 10, 11.
function parseInlineInstructions(text, src) {
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

// Centered-number parser for 5th Circuit.
// PDF structure per instruction:
//   (centered) <instruction_number>    — ~40+ leading spaces, number on line alone
//   (blank)
//   (centered) <ALL-CAPS TITLE>        — ~20-40 leading spaces, title on line alone
//   (blank)
//   <body paragraphs>                   — variable indentation
//
// TOC entries look like "1.01   Preliminary Instructions............ 1" — must be skipped
// by the dot-leader pattern; TOC section ends when centered-number format appears.
function parseCenteredInstructions(text, src) {
  const lines = text.split(/\r?\n/);
  const instructions = [];

  // TOC ends at last line matching "<num> <title>...<dots>... <page>".
  // 5th Circuit has dot-leader TOCs. 11th Circuit has plain-text TOC with no leaders;
  // detect its end by finding the first BODY_NUM line (centered number on own line).
  const TOC_RX = /^\s*[A-Z]?\d+\.\d+[A-Z]?\s+.+\.{3,}\s*\d+\s*$/;
  let tocEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (TOC_RX.test(lines[i])) tocEnd = i;
  }

  // Body-instruction start: 10+ leading spaces, instruction number, optional whitespace, EOL.
  // Per-source regex picked from SOURCES[i].bodyNumRx. Falls back to a decimal-only
  // default. Per-source prevents false positives (e.g. "2020" year, "1" page number
  // matching an over-broad regex).
  const BODY_NUM_RX = src.bodyNumRx || /^\s{10,}(\d+\.\d+(?:\.\d+)?[A-Z]?)\s*$/;
  // Page-number-only line: a few digits with heavy indent.
  const PAGENUM_RX = /^\s+\d{1,4}\s*$/;
  // Noise lines from PDF extraction (running headers, watermarks).
  const NOISE_RX = /^(PATTERN JURY INSTRUCTIONS|\(Criminal Cases\)|ELEVENTH CIRCUIT|Fifth Circuit|2024 Edition|2020|2021|2022|2023|Last updated|©)/i;

  let current = null;
  let awaitTitle = false;
  let titleIndent = -1;

  // For 11th (no dot-leader TOC), fall back to detecting tocEnd as first BODY_NUM line.
  if (tocEnd === -1) {
    for (let i = 0; i < lines.length; i++) {
      if (BODY_NUM_RX.test(lines[i])) {
        tocEnd = i - 1;
        break;
      }
    }
  }

  for (let i = tocEnd + 1; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // New instruction?
    const mNum = BODY_NUM_RX.exec(raw);
    if (mNum) {
      if (current) instructions.push(current);
      current = {
        instruction_number: mNum[1],
        title: null,
        body_lines: [],
      };
      awaitTitle = true;
      titleIndent = -1;
      continue;
    }

    if (!trimmed) continue; // skip blanks
    if (!current) continue; // before first instruction
    if (NOISE_RX.test(trimmed)) continue;
    if (PAGENUM_RX.test(raw) && trimmed.length <= 4) continue;

    if (awaitTitle) {
      const thisIndent = raw.match(/^\s*/)[0].length;
      if (!current.title) {
        // First title line
        current.title = trimmed;
        titleIndent = thisIndent;
        continue;
      }
      // Continuation? Same/similar indent + short line = multi-line title.
      // 5th Circuit titles wrap across 2 lines (both ALL-CAPS, centered).
      // 11th titles are single-line; continuation check will fail → body starts.
      if (titleIndent >= 5 && Math.abs(thisIndent - titleIndent) <= 4 && trimmed.length < 100) {
        current.title = `${current.title} ${trimmed}`;
        continue;
      }
      awaitTitle = false;
    }
    current.body_lines.push(trimmed);
  }
  if (current) instructions.push(current);

  return instructions.map(r => ({
    instruction_number: r.instruction_number,
    title: r.title,
    body: collapseWs(r.body_lines.join(' ')).trim(),
  })).filter(r => r.body.length >= 80 && r.instruction_number.length <= 15);
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

// CLI flags:
//   --circuits=N[,N,...]   limit to listed circuit numbers (default: all)
//   --dry-run              parse only, do not touch the DB
function parseCliFlags() {
  const argv = process.argv.slice(2);
  const flags = { circuits: null, dryRun: false };
  for (const arg of argv) {
    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg.startsWith('--circuits=')) {
      flags.circuits = arg
        .slice('--circuits='.length)
        .split(',')
        .map((s) => Number.parseInt(s.trim(), 10))
        .filter((n) => Number.isInteger(n) && n > 0);
    }
  }
  return flags;
}

async function main() {
  const flags = parseCliFlags();
  console.log(`=== pji-ingest ${new Date().toISOString()} ===`);
  if (flags.circuits) console.log(`  circuits filter: [${flags.circuits.join(',')}]`);
  if (flags.dryRun) console.log(`  DRY RUN — no DB writes`);
  fs.mkdirSync(WORK, { recursive: true });

  const sources = flags.circuits
    ? SOURCES.filter((s) => flags.circuits.includes(s.circuit))
    : SOURCES;
  if (sources.length === 0) {
    console.error(`No sources match circuits filter ${JSON.stringify(flags.circuits)}`);
    process.exit(1);
  }

  const allRows = [];
  const perCircuit = {};

  for (const src of sources) {
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

  if (flags.dryRun) {
    console.log('\n=== DRY RUN — sample 5 rows ===');
    for (const r of rows.slice(0, 5)) {
      console.log(`  [c${r.circuit} ${r.instruction_number}] ${(r.title || '(no title)').slice(0, 60)} — ${r.body.length}ch`);
      console.log(`    body preview: ${r.body.slice(0, 120).replace(/\s+/g, ' ')}`);
    }
    console.log('\n=== DRY RUN DONE ===');
    return;
  }

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

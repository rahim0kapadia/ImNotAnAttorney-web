// Template: scripts/ingest/pji-ingest.mjs (inline parser reused; this script
//   loops over chapter PDFs since the 3rd Circuit publishes them separately.)
// Expert: brandon-garrett (corpus-completeness pillar #1)
// Pattern: cl-bulk-data-defensive #17 (Albe) + #18 (COPY FROM STDIN)
// csv-bulk-checked: each chapter PDF URL listed per-chapter inline below.
// work-mem: Medium tier verified (CHECKED medium=4GB ceiling=256MB), 128MB used.
//
// T2 — 3rd Circuit criminal pattern jury instructions ingest.
// 3rd Circuit publishes 9 chapter PDFs at ca3.uscourts.gov (no aggregate).
// This script ingests 8 of them (skipping Chapter 6, which is split across
// many per-offense PDFs and is deferred to a future session).
//
// Chapter 6 deferred because it splits across ~50+ per-offense PDFs (one per
// federal statute like 18 USC 371, 18 USC 1001, etc.). Inclusion requires
// an index crawl of ca3.uscourts.gov which is out-of-scope here.
//
// Parse format is INLINE (same as 7th/8th/9th): "<num> <title>" on one line,
// body paragraphs following. TOC entries appear before body; the dedupe
// step (keep longest body) resolves them naturally.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import pg from 'pg';
import copyStreams from 'pg-copy-streams';

const envTxt = fs.readFileSync('C:/Users/email/projects/ImNotAnAttorney-web/.env.local', 'utf-8');
for (const line of envTxt.split(/\r?\n/)) {
  const eq = line.indexOf('=');
  if (eq <= 0) continue;
  const key = line.slice(0, eq);
  const val = line.slice(eq + 1);
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue;
  if (!process.env[key]) process.env[key] = val;
}

const WORK = path.join(os.tmpdir(), 'pji-ingest', 'circuit-3');

// Chapter metadata. URLs verified via WebFetch of ca3.uscourts.gov 2026-04-22.
// `cacheName` determines local filename stem (for ch1-9: "ch<n>"; for ch6 offense
// PDFs: "ch6-<slug>"). All rows carry circuit=3 regardless of cacheName.
const CHAPTERS = [
  { cacheName: 'ch1', url: 'https://www.ca3.uscourts.gov/sites/ca3/files/1%202024%20Chapter%201%20for%20posting%20.pdf' },
  { cacheName: 'ch2', url: 'https://www.ca3.uscourts.gov/sites/ca3/files/2023%20Chapter%202%20revisions%20final.pdf' },
  { cacheName: 'ch3', url: 'https://www.ca3.uscourts.gov/sites/ca3/files/1%202024%20Chapter%203%20for%20posting.pdf' },
  { cacheName: 'ch4', url: 'https://www.ca3.uscourts.gov/sites/ca3/files/2023%20Chapter%204%20revisions%20final.pdf' },
  { cacheName: 'ch5', url: 'https://www.ca3.uscourts.gov/sites/ca3/files/1%202024%20Chapter%205%20for%20posting%20rev%2010%2024.pdf' },
  { cacheName: 'ch7', url: 'https://www.ca3.uscourts.gov/sites/ca3/files/1%202024%20Chapter%207%20for%20posting.pdf' },
  { cacheName: 'ch8', url: 'https://www.ca3.uscourts.gov/sites/ca3/files/1%202024%20Chapter%208%20for%20posting.pdf' },
  { cacheName: 'ch9', url: 'https://www.ca3.uscourts.gov/sites/ca3/files/2020%20Chapter%209%20revisions%20final.pdf' },
  // Chapter 6 offense-specific (16 PDFs, one per federal statute). Added 2026-04-22.
  { cacheName: 'ch6-bankruptcy-fraud',       url: 'https://www.ca3.uscourts.gov/sites/ca3/files/2012%20Chapter6%20BankrFraud.pdf' },
  { cacheName: 'ch6-bribery',                url: 'https://www.ca3.uscourts.gov/sites/ca3/files/2021%20Chap%206%20Bribery%20revisions%20final.pdf' },
  { cacheName: 'ch6-conspiracy',             url: 'https://www.ca3.uscourts.gov/sites/ca3/files/2021%20Chapter%206%20Conspiracy%20for%20posting%20final.pdf' },
  { cacheName: 'ch6-misapp-bank-funds',      url: 'https://www.ca3.uscourts.gov/sites/ca3/files/Chap%206%20Misapplication%20of%20bank%20funds%20Aug%2008.pdf' },
  { cacheName: 'ch6-theft-interstate',       url: 'https://www.ca3.uscourts.gov/sites/ca3/files/Chap%206%20Theft%20fr%20interstate%20Aug%2008.pdf' },
  { cacheName: 'ch6-theft-fed-funds',        url: 'https://www.ca3.uscourts.gov/sites/ca3/files/2022%20Chap%206%20TheftfromGvtPrgms666%20final.pdf' },
  { cacheName: 'ch6-firearm-offenses',       url: 'https://www.ca3.uscourts.gov/sites/ca3/files/2023%20Chap%206%20FirearmOffenses%20revisions%20final.pdf' },
  { cacheName: 'ch6-fraud-mail-wire-bank',   url: 'https://www.ca3.uscourts.gov/sites/ca3/files/2023Chap%206%20Fraud%20Offenses%20final.pdf' },
  { cacheName: 'ch6-obstruction',            url: 'https://www.ca3.uscourts.gov/sites/ca3/files/2020%20Chap%206%20Obstruction%20revisions%20final.pdf' },
  { cacheName: 'ch6-hobbs-act',              url: 'https://www.ca3.uscourts.gov/sites/ca3/files/2023%20Chap%206%20HobbsAct%20revisions%20final.pdf' },
  { cacheName: 'ch6-money-laundering',       url: 'https://www.ca3.uscourts.gov/sites/ca3/files/2023%20Chap%206%20MoneyLaundering%20revisions%20final.pdf' },
  { cacheName: 'ch6-rico',                   url: 'https://www.ca3.uscourts.gov/sites/ca3/files/1%202024%20Chapter%206%20RICO%20for%20posting.pdf' },
  { cacheName: 'ch6-bank-robbery',           url: 'https://www.ca3.uscourts.gov/sites/ca3/files/2021%20Chap%206%20Bank%20robbery%20final.pdf' },
  { cacheName: 'ch6-controlled-substances',  url: 'https://www.ca3.uscourts.gov/sites/ca3/files/1%202024%20Chapter%206%20Controlled%20Substances%20for%20posting.pdf' },
  { cacheName: 'ch6-unregistered-firearm',   url: 'https://www.ca3.uscourts.gov/sites/ca3/files/Chap%206%20Unregistered%20Firearm%20Aug%2008.pdf' },
  { cacheName: 'ch6-tax-offenses',           url: 'https://www.ca3.uscourts.gov/sites/ca3/files/2020%20Chap%206%20Tax%20Offenses%20final.pdf' },
];

// Single effective_date for ALL rows so the UNIQUE constraint and v_pji_public
// view work cleanly. Use the latest chapter date (2024-10-01, Ch5 revision).
const EFFECTIVE_DATE = '2024-10-01';

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.indexOf('"') < 0 && s.indexOf(',') < 0 && s.indexOf('\n') < 0 && s.indexOf('\r') < 0) return s;
  return '"' + s.split('"').join('""') + '"';
}

function collapseWs(s) {
  return s.split(/\s+/).filter(Boolean).join(' ');
}

// Inline parser: "<num> <title>" on one line; body paragraphs follow; same
// pattern the existing 7th/8th/9th/10th circuits use.
function parseInline(text) {
  // Matches both 2-part (1.01, 6.04A) and 3-part Chapter 6 offense numbers with
  // arbitrary alphanumeric 3rd segment (6.18.371A, 6.18.371J-1, 6.18.152(1),
  // 6.18.201B1, 6.18.666A1A-1). The 3rd segment accepts [A-Z0-9()-]+.
  const RULE = /^(\d+\.\d+(?:\.[A-Z0-9()-]+|[A-Z]?))\s+(.+?)$/;
  const SKIP = /^(Page\s+\d+|^\d+\s*$|Criminal\s+Pattern\s+Jury|Last\s+updated|©|Third\s+Circuit|Chapter\s+\d+\s*$|Chapter\s+\d+:)/i;
  const lines = text.split(/\r?\n/);
  const instructions = [];
  let current = null;
  for (const raw of lines) {
    const line = raw.trim();
    const m = RULE.exec(line);
    if (m) {
      const num = m[1];
      const titleRest = (m[2] || '').trim();
      if (num.length > 15) continue;
      if (current) instructions.push(current);
      current = { instruction_number: num, title: titleRest || null, body_lines: [] };
    } else if (current) {
      if (!line) continue;
      if (SKIP.test(line)) continue;
      current.body_lines.push(line);
    }
  }
  if (current) instructions.push(current);
  return instructions
    .map((r) => ({
      instruction_number: r.instruction_number,
      title: r.title,
      body: collapseWs(r.body_lines.join(' ')).trim(),
    }))
    .filter((r) => r.body.length >= 80);
}

async function downloadIfMissing(url, dest) {
  if (fs.existsSync(dest)) return true;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (INAA-data-ingest)' },
    redirect: 'follow',
  });
  if (!r.ok) {
    console.warn(`  WARN ${r.status} ${r.statusText} — skipping`);
    return false;
  }
  const ws = fs.createWriteStream(dest);
  await finished(Readable.fromWeb(r.body).pipe(ws));
  return true;
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`=== pji-ingest-ca3 ${new Date().toISOString()} ===`);
  if (isDryRun) console.log('  DRY RUN — no DB writes');
  fs.mkdirSync(WORK, { recursive: true });

  const allRows = [];
  for (const ch of CHAPTERS) {
    const pdfPath = path.join(WORK, `${ch.cacheName}.pdf`);
    const txtPath = path.join(WORK, `${ch.cacheName}.txt`);
    const ok = await downloadIfMissing(ch.url, pdfPath);
    if (!ok) continue;
    if (!fs.existsSync(txtPath) || fs.statSync(txtPath).mtimeMs < fs.statSync(pdfPath).mtimeMs) {
      execSync(`pdftotext -layout "${pdfPath}" "${txtPath}"`, { stdio: 'inherit' });
    }
    const text = fs.readFileSync(txtPath, 'utf-8');
    const parsed = parseInline(text);
    console.log(`  ${ch.cacheName}: parsed ${parsed.length} instructions`);
    for (const r of parsed) {
      allRows.push({
        circuit: 3,
        instruction_number: r.instruction_number,
        title: r.title,
        body: r.body,
        source_url: ch.url,
        effective_date: EFFECTIVE_DATE,
      });
    }
  }

  console.log(`\nTotal across 8 chapters: ${allRows.length} rows`);

  // Dedupe on (circuit, instruction_number, effective_date). Keep longest body.
  const seen = new Map();
  for (const r of allRows) {
    const key = `${r.circuit}::${r.instruction_number}::${r.effective_date}`;
    const prev = seen.get(key);
    if (!prev || r.body.length > prev.body.length) seen.set(key, r);
  }
  const rows = [...seen.values()].sort((a, b) =>
    a.instruction_number.localeCompare(b.instruction_number, undefined, { numeric: true })
  );
  console.log(`After dedupe: ${rows.length} rows`);

  if (isDryRun) {
    console.log('\n=== DRY RUN — sample 8 rows ===');
    for (const r of rows.slice(0, 8)) {
      console.log(`  [${r.instruction_number}] ${(r.title || '(no title)').slice(0, 60)} — ${r.body.length}ch`);
      console.log(`    body preview: ${r.body.slice(0, 100).replace(/\s+/g, ' ')}`);
    }
    return;
  }

  // Connect + insert
  const u = new URL(process.env.SUPABASE_DB_URL);
  u.port = '5432';
  const c = new pg.Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query(`SET statement_timeout = '15min'`);
    await c.query(`SET idle_in_transaction_session_timeout = '5min'`);
    await c.query(`SET tcp_keepalives_idle = 60`);
    await c.query(`SET tcp_keepalives_interval = 10`);
    await c.query(`SET tcp_keepalives_count = 6`);
    await c.query(`SET work_mem = '128MB'`);

    // Clear any prior circuit=3 rows with same effective_date (idempotent re-run)
    const del = await c.query(
      `DELETE FROM pattern_jury_instructions WHERE circuit = 3 AND effective_date = $1`,
      [EFFECTIVE_DATE]
    );
    if (del.rowCount) console.log(`cleared ${del.rowCount} prior rows for (circuit=3, effective_date=${EFFECTIVE_DATE})`);

    const copySql = `COPY pattern_jury_instructions (circuit, instruction_number, title, body, source_url, effective_date) FROM STDIN WITH (FORMAT csv)`;
    const copyStream = c.query(copyStreams.from(copySql));
    const t0 = Date.now();
    for (const r of rows) {
      const line = [r.circuit, r.instruction_number, r.title, r.body, r.source_url, r.effective_date]
        .map(csvEscape)
        .join(',') + '\n';
      if (!copyStream.write(line)) await new Promise((res) => copyStream.once('drain', res));
    }
    copyStream.end();
    await new Promise((resolve, reject) => {
      copyStream.on('finish', resolve);
      copyStream.on('error', reject);
    });
    console.log(`COPY'd ${rows.length} rows in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    const { rows: byCircuit } = await c.query(
      `SELECT circuit, count(*)::int AS n FROM pattern_jury_instructions GROUP BY circuit ORDER BY circuit`
    );
    console.log(`\n=== BY CIRCUIT ===`);
    for (const r of byCircuit) console.log(`  ${r.circuit}: ${r.n}`);
  } finally {
    await c.end();
  }
}

try {
  await main();
} catch (e) {
  console.error('FATAL:', e);
  process.exit(1);
}

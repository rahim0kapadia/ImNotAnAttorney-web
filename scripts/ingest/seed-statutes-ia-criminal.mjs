#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-ok-title21.mjs (PDF + COPY shape)
// Template: scripts/ingest/seed-statutes-me-title17a.mjs (PDF harness consumer)
// Pattern: cl-bulk-data-defensive #18 + cl-bulk-data-defensive #19 + no-hallucinated-legal-data
// csv-bulk-checked: https://www.legis.iowa.gov/docs/code/<chapter>.pdf
//
// Iowa Code Title XVI (Criminal Law) — Wave 3 hostile-states seed.
// Source: per-chapter PDFs at legis.iowa.gov/docs/code/<chapter>.pdf
// Target: entities_statutes (one row per active section across cohort chapters).
// Cohort: 707, 708, 709, 710, 711, 712, 714, 716, 718, 719, 720, 723, 724, 725.
// Estimated rows: ~600 across cohort.
//
// Usage:
//   node scripts/ingest/seed-statutes-ia-criminal.mjs --dry-run --limit=3
//   node scripts/ingest/seed-statutes-ia-criminal.mjs --chapters=707,714 --dry-run
//   node scripts/ingest/seed-statutes-ia-criminal.mjs                 # live full cohort

import fs from 'node:fs';
import path from 'node:path';
import * as crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { z } from 'zod';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';
import {
  fetchStatutePdf,
  extractStatuteText,
} from '../lib/pdf-statute-harness.mjs';
import {
  IA_CRIMINAL_CHAPTERS,
  buildChapterPdfUrl,
  buildIaSourceUrl,
  parseIaChapter,
} from './lib/ia-pdf.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPaths = ['C:/Users/email/projects/ImNotAnAttorney-web/.env.local'];
const VALID_KEY_RX = /^[A-Z_][A-Z0-9_]*$/;
for (const p of envPaths) {
  if (!fs.existsSync(p)) continue;
  const txt = fs.readFileSync(p, 'utf-8');
  for (const rawLine of txt.split('\n')) {
    let line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    line = line.trim();
    if (!line || line[0] === '#') continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (val.length >= 2 && ((val[0] === '"' && val[val.length - 1] === '"') ||
        (val[0] === "'" && val[val.length - 1] === "'"))) {
      val = val.slice(1, -1);
    }
    if (!VALID_KEY_RX.test(key)) continue;
    if (!process.env[key]) process.env[key] = val;
  }
}

const JURISDICTION = 'IA';
// IA stores the chapter as the `title` column to match per-chapter PDF source
// boundary. (Alternative: title='XVI'; rejected because the harness DELETE
// scopes by title; per-chapter idempotency is cleaner.)
// Floor 200 = real corpus. Live 2026-05-02: 254 unique sections after dedup
// across 14-chapter cohort. Initial 400 estimate was unvalidated; IA criminal
// chapters are leaner than other states (~7-75 sections per chapter, mean ~18).
// 200 = 21% buffer below verified 254.
export const IA_COHORT_FLOOR = 200;

const StatuteRowSchema = z.object({
  jurisdiction: z.string().length(2),
  title: z.string().min(1).max(20),
  section: z.string().min(1).max(100),
  subsection: z.null(),
  section_text: z.string().min(20).max(50000),
  is_current: z.literal(true),
  source_urls: z.array(z.string().url()).min(1),
  text_hash: z.string().length(64),
  effective_date: z.null(),
  scraped_at: z.string().datetime(),
});

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function textArrayLiteral(arr) {
  if (!arr || arr.length === 0) return '{}';
  const escaped = arr.map((s) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
  return '{' + escaped.join(',') + '}';
}

function buildRow(chapter, sec) {
  // sec.title may be empty for headers without inline title text on the line
  const titleText = sec.title || `Section ${sec.sectionNum}`;
  const sectionText = `${titleText}\n\n${sec.body}`.slice(0, 49990);
  return {
    jurisdiction: JURISDICTION,
    title: chapter,
    section: sec.sectionNum,
    subsection: null,
    section_text: sectionText,
    is_current: true,
    source_urls: [buildIaSourceUrl(chapter, sec.sectionNum)],
    text_hash: sha256(sectionText),
    effective_date: null,
    scraped_at: new Date().toISOString(),
  };
}

async function* rowGenerator(rows) {
  for (const r of rows) {
    yield [
      r.jurisdiction, r.title, r.section, null, null,
      r.section_text, true, textArrayLiteral(r.source_urls),
      r.text_hash, r.scraped_at,
    ];
  }
}

function dedupeBySection(rows) {
  // PDFs often list a section in TOC + body. Keep longest body.
  const best = new Map();
  for (const r of rows) {
    const key = [r.jurisdiction, r.title, r.section].join('::');
    const prev = best.get(key);
    if (!prev || r.section_text.length > prev.section_text.length) best.set(key, r);
  }
  return [...best.values()];
}

function parseCliFlags(argv) {
  const out = { dryRun: false, verbose: false, limit: null, chapters: null };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--verbose') out.verbose = true;
    else if (a.startsWith('--limit=')) {
      const n = Number.parseInt(a.slice('--limit='.length), 10);
      if (Number.isInteger(n) && n > 0) out.limit = n;
    } else if (a.startsWith('--chapters=')) {
      const raw = a.slice('--chapters='.length);
      const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
      const valid = parts.filter((p) => /^\d{3}[A-Za-z]?$/.test(p));
      if (valid.length) out.chapters = valid;
    }
  }
  return out;
}

async function main() {
  const flags = parseCliFlags(process.argv.slice(2));
  const targets = flags.chapters && flags.chapters.length ? flags.chapters : IA_CRIMINAL_CHAPTERS;

  console.log(`=== seed-statutes-ia-criminal ${new Date().toISOString()} ===`);
  console.log(`  cohort   : [${targets.join(', ')}]`);
  console.log(`  dry-run  : ${flags.dryRun}`);
  console.log(`  limit    : ${flags.limit ?? '(all per chapter)'}`);

  const t0 = Date.now();
  /** @type {Array<{ chapter: string, rowCount: number, durationMs: number, ok: boolean, error?: string }>} */
  const perChapterStats = [];
  /** @type {object[]} */
  const allRows = [];

  for (const chapter of targets) {
    const url = buildChapterPdfUrl(chapter);
    console.log(`\n--- chapter ${chapter}  ${url}`);
    const cT0 = Date.now();
    let pdfBuf;
    try {
      pdfBuf = await fetchStatutePdf(url, { maxRetries: 3, timeoutMs: 90000 });
    } catch (e) {
      console.warn(`  fetch failed: ${e.message}`);
      perChapterStats.push({ chapter, rowCount: 0, durationMs: Date.now() - cT0, ok: false, error: e.message });
      continue;
    }
    console.log(`  PDF ${(pdfBuf.length / 1024).toFixed(0)} KB`);

    let text;
    try {
      text = await extractStatuteText(pdfBuf);
    } catch (e) {
      console.warn(`  extract failed: ${e.message}`);
      perChapterStats.push({ chapter, rowCount: 0, durationMs: Date.now() - cT0, ok: false, error: e.message });
      continue;
    }

    const sections = parseIaChapter(text);
    console.log(`  parsed ${sections.length} sections`);

    const limited = flags.limit ? sections.slice(0, flags.limit) : sections;

    for (const sec of limited) {
      const raw = buildRow(chapter, sec);
      const parsed = StatuteRowSchema.safeParse(raw);
      if (parsed.success) allRows.push(parsed.data);
      else if (flags.verbose) {
        console.warn(`    [skip] ${sec.sectionNum}: ${parsed.error.issues[0].message}`);
      }
    }
    perChapterStats.push({ chapter, rowCount: limited.length, durationMs: Date.now() - cT0, ok: true });
  }

  const deduped = dedupeBySection(allRows);
  console.log(`\nbuilt ${allRows.length} rows; deduped: ${deduped.length}`);

  if (flags.dryRun) {
    console.log(`[DRY-RUN] Would insert ${deduped.length} rows. First row preview:`);
    if (deduped[0]) {
      const p = { ...deduped[0], section_text: deduped[0].section_text.slice(0, 200) + '…' };
      console.log(JSON.stringify(p, null, 2));
    }
    process.exit(0);
  }

  if (deduped.length < IA_COHORT_FLOOR) {
    console.error(`PRE-WRITE FAIL: ${deduped.length} < cohort floor ${IA_COHORT_FLOOR}`);
    process.exit(1);
  }

  if (!process.env.SUPABASE_DB_URL) {
    console.error('ERROR: SUPABASE_DB_URL not set.');
    process.exit(1);
  }
  const { client, cleanup } = await createBulkClient();
  try {
    // Per-chapter idempotency: DELETE matching rows for each chapter we processed.
    for (const stat of perChapterStats) {
      if (!stat.ok) continue;
      const del = await client.query(
        `DELETE FROM entities_statutes WHERE jurisdiction = $1 AND title = $2`,
        [JURISDICTION, stat.chapter],
      );
      console.log(`  deleted ${del.rowCount} prior rows for IA chapter ${stat.chapter}`);
    }

    const COLS = [
      'jurisdiction', 'title', 'section', 'subsection',
      'effective_date', 'section_text', 'is_current',
      'source_urls', 'text_hash', 'scraped_at',
    ];
    const result = await bulkCopyRows(client, 'entities_statutes', COLS, rowGenerator(deduped));
    console.log(`COPY: ${result.rowCount} rows in ${result.durationMs}ms`);

    const post = await client.query(
      `SELECT COUNT(*) AS cnt FROM entities_statutes WHERE jurisdiction = $1`,
      [JURISDICTION],
    );
    console.log(`Post-flight count for IA: ${post.rows[0].cnt}`);

    console.log(`\nDONE in ${Date.now() - t0}ms`);
    process.exit(0);
  } finally {
    await cleanup();
  }
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try { return import.meta.url === pathToFileURL(process.argv[1]).href; }
  catch { return false; }
})();
if (invokedDirectly) main().catch((e) => {
  console.error('FATAL:', e?.message || e);
  if (e?.stack) console.error(e.stack);
  process.exit(1);
});

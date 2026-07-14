#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-de-title11.mjs (PDF-harness seeder shape)
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// csv-bulk-checked: https://legislature.mi.gov/documents/mcl/pdf/mcl-chap750.pdf
//
// Michigan Compiled Laws — Chapter 750 — Penal Code — Wave 3 ingest.
//
// Source PDF: https://legislature.mi.gov/documents/mcl/pdf/mcl-chap750.pdf
//   - Official Michigan Compiled Laws, prepared by the Michigan Legislature.
//   - Complete through PA 9 of 2026 (per page footer).
//   - ~2.06 MB, 459 pages, born-digital text layer.
//   - Pivots from SPA-walled per-section deep-links (legislature.mi.gov/Laws/MCL?objectName=…)
//     which only resolve client-side, to the chapter-level bulk PDF that is
//     authoritative AND machine-readable.
//
// Schema target: entities_statutes (live shape, see scripts/lib/unicourt-harness.mjs
// header for column documentation; same row shape as DE/ME/OK seeders).
//
// Usage:
//   node scripts/ingest/seed-statutes-mi-chapter750.mjs [--dry-run] [--verbose]
//
// Env required (live run):
//   SUPABASE_DB_URL — direct Postgres connection string (port-rewritten to 5432)
//
// Idempotency: pre-INSERT DELETE WHERE jurisdiction='MI' AND title='750' wipes
// any prior MI/Chapter-750 rows so re-runs are stable.

import { z } from 'zod';
import * as crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';
import {
  fetchStatutePdf,
  extractStatuteText,
} from '../lib/pdf-statute-harness.mjs';
import {
  parseChapter750,
  buildMiSourceUrl,
  isRepealedTitle,
  MI_CHAPTER750_PDF_URL,
} from './lib/mi-pdf.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '../../.env.local');
dotenv.config({ path: envPath });

const verbose = process.argv.includes('--verbose');
const dryRun = process.argv.includes('--dry-run');

const log = (...args) => console.log('[MI]', ...args);
const dbg = (...args) => verbose && console.log('[MI-DBG]', ...args);

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const JURISDICTION = 'MI';
const TITLE = '750';
// 500 floor — current corpus measures 812 active sections; 500 is the worry-
// path-2 conservative floor that survives upstream re-codifications.
const FLOOR_ROWS = 500;

const StatuteRowSchema = z.object({
  jurisdiction: z.string().length(2),
  title: z.string().min(1).max(20),
  section: z.string().min(1).max(100),
  subsection: z.null(),
  section_text: z.string().min(20),
  is_current: z.literal(true),
  source_urls: z.array(z.string().url()).min(1),
  text_hash: z.string().length(64),
  effective_date: z.null(),
  scraped_at: z.string().datetime(),
});

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function textArrayLiteral(arr) {
  if (!arr || arr.length === 0) return '{}';
  const escaped = arr.map(
    (s) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"',
  );
  return '{' + escaped.join(',') + '}';
}

function buildRow(section) {
  // Compose section_text as "<title>\n\n<body>" — same shape as DE seeder so
  // entities_statutes is uniform across states. Cap at 49,990 chars to stay
  // safely under any text-column ceilings; MI's longest body is well under
  // this in practice.
  const sectionText = `${section.title}\n\n${section.body}`.slice(0, 49990);
  return {
    jurisdiction: JURISDICTION,
    title: TITLE,
    section: section.sectionNum,
    subsection: null,
    section_text: sectionText,
    is_current: true,
    source_urls: [buildMiSourceUrl(section.sectionNum)],
    text_hash: sha256(sectionText),
    effective_date: null,
    scraped_at: new Date().toISOString(),
  };
}

function dedupeRows(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const key = [r.jurisdiction, r.title, r.section].join('::');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}

async function* rowGenerator(rows) {
  for (const r of rows) {
    yield [
      r.jurisdiction,
      r.title,
      r.section,
      null, // subsection
      null, // effective_date
      r.section_text,
      true, // is_current
      textArrayLiteral(r.source_urls),
      r.text_hash,
      r.scraped_at,
    ];
  }
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

async function main() {
  let client = null;
  let cleanup = null;
  const fetchStartedAt = Date.now();
  try {
    log('Starting Michigan Chapter 750 ingest (Penal Code)…');

    if (dryRun) {
      log('DRY RUN — no DB writes');
    } else {
      if (!process.env.SUPABASE_DB_URL) {
        console.error('ERROR: SUPABASE_DB_URL not set. Set env or run with --dry-run.');
        process.exit(1);
      }
      const bulkInit = await createBulkClient();
      client = bulkInit.client;
      cleanup = bulkInit.cleanup;
      dbg('Connected to Supabase');

      const pre = await client.query(
        `SELECT COUNT(*) AS cnt FROM entities_statutes WHERE jurisdiction = $1 AND title = $2`,
        [JURISDICTION, TITLE],
      );
      log(`Pre-flight count: ${pre.rows[0].cnt} (MI/Chapter 750)`);
    }

    log(`Fetching PDF: ${MI_CHAPTER750_PDF_URL}`);
    const pdfBuffer = await fetchStatutePdf(MI_CHAPTER750_PDF_URL, {
      maxRetries: 3,
      timeoutMs: 180000,
    });
    log(`PDF: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB in ${Date.now() - fetchStartedAt}ms`);

    log('Extracting text…');
    const text = await extractStatuteText(pdfBuffer);
    dbg(`Extracted ${text.length} characters`);

    log('Parsing sections…');
    const allSections = parseChapter750(text);
    log(`Parsed ${allSections.length} raw sections`);
    if (allSections.length === 0) throw new Error('No sections extracted from PDF');

    // MI-specific filter: drop individually-repealed/transferred sections.
    // These match the section regex but their bodies are purely historical
    // notes about a now-defunct statute; they would clutter customer-facing
    // search. Range-repealed lines (e.g. "750.19-750.24 Repealed.") are
    // already excluded at the regex level and don't need this filter.
    const sections = allSections.filter((s) => !isRepealedTitle(s.title));
    const dropped = allSections.length - sections.length;
    log(`Active sections: ${sections.length} (dropped ${dropped} repealed/transferred)`);

    log('Building + validating rows…');
    const rows = [];
    const errors = [];
    for (const sec of sections) {
      const raw = buildRow(sec);
      const parsed = StatuteRowSchema.safeParse(raw);
      if (parsed.success) rows.push(parsed.data);
      else {
        errors.push({ section: sec.sectionNum, errors: parsed.error.issues.map((i) => i.message) });
        if (verbose) console.warn(`  [skip] ${sec.sectionNum}: ${parsed.error.issues[0].message}`);
      }
    }
    log(`Built ${rows.length} valid rows (${errors.length} validation errors)`);

    const deduped = dedupeRows(rows);
    log(`After dedup: ${deduped.length} (${rows.length - deduped.length} dups)`);

    // Sanity check — § 316 is First-Degree Murder, the most-cited section in
    // the chapter. Its absence would mean the parser regressed.
    const sec316 = deduped.find((r) => r.section === '316');
    if (sec316) log(`Sanity: § 316 found ("${sec316.section_text.slice(0, 60).replace(/\n/g, ' ')}…")`);
    else log('WARNING: § 316 not found — parser may need tuning');

    if (dryRun) {
      log(`[DRY-RUN] Would insert ${deduped.length} rows. First row:`);
      log(JSON.stringify({ ...deduped[0], section_text: deduped[0].section_text.slice(0, 200) + '…' }, null, 2));
      if (deduped.length < FLOOR_ROWS) {
        log(`[DRY-RUN] WARN: ${deduped.length} < floor ${FLOOR_ROWS}`);
      }
      process.exit(0);
    }

    // Idempotency
    const del = await client.query(
      `DELETE FROM entities_statutes WHERE jurisdiction = $1 AND title = $2`,
      [JURISDICTION, TITLE],
    );
    log(`Idempotency: deleted ${del.rowCount} prior MI/Chapter 750 rows`);

    log('Inserting via COPY FROM STDIN…');
    const COLS = [
      'jurisdiction', 'title', 'section', 'subsection',
      'effective_date', 'section_text', 'is_current',
      'source_urls', 'text_hash', 'scraped_at',
    ];
    const result = await bulkCopyRows(client, 'entities_statutes', COLS, rowGenerator(deduped));
    log(`COPY: ${result.rowCount} rows in ${result.durationMs}ms`);

    const post = await client.query(
      `SELECT COUNT(*) AS cnt FROM entities_statutes WHERE jurisdiction = $1 AND title = $2`,
      [JURISDICTION, TITLE],
    );
    const postCount = parseInt(post.rows[0].cnt, 10);
    log(`Post-flight count: ${postCount} (MI/Chapter 750)`);

    if (postCount < FLOOR_ROWS) {
      console.error(`FAIL: ${postCount} < floor ${FLOOR_ROWS}`);
      process.exit(1);
    }

    // Audits
    const audits = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE source_urls = '{}' OR source_urls IS NULL) AS missing_urls,
         COUNT(*) FILTER (WHERE section_text = '' OR section_text IS NULL)  AS empty_body,
         COUNT(*) FILTER (WHERE section IS NULL OR section = '')            AS null_section,
         COUNT(*) FILTER (WHERE text_hash IS NULL OR text_hash = '')        AS missing_hash,
         COUNT(*) FILTER (WHERE source_urls::text NOT LIKE '%https://%')    AS non_https
       FROM entities_statutes WHERE jurisdiction = $1 AND title = $2`,
      [JURISDICTION, TITLE],
    );
    log('Audits:', audits.rows[0]);
    const a = audits.rows[0];
    if (a.missing_urls > 0 || a.empty_body > 0 || a.null_section > 0 || a.missing_hash > 0 || a.non_https > 0) {
      console.error('FAIL: audit found defects (see above).');
      process.exit(1);
    }

    log(`PASS: ${postCount} rows / ${FLOOR_ROWS} floor / 0 audit defects`);
    process.exit(0);
  } catch (err) {
    console.error('[MI-ERROR]', err.message);
    if (verbose) console.error(err.stack);
    process.exit(1);
  } finally {
    if (cleanup) await cleanup();
  }
}

main();

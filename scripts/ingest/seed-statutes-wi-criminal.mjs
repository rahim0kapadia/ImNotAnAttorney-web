#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-de-title11.mjs (PDF-harness seeder shape)
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// csv-bulk-checked: per-chapter PDFs at https://docs.legis.wisconsin.gov/statutes/statutes/{N}.pdf
//
// Wisconsin Criminal Code (Chapters 939-948) — Wave 2 ingest.
//
// Source: per-chapter PDFs from https://docs.legis.wisconsin.gov/statutes/statutes/{N}.pdf
//   - Verified 2026-05-02 (chapter 940 = PDF-1.7, ~559 KB, born-digital text layer).
//   - Cohort: 939, 940, 941, 942, 943, 944, 945, 946, 947, 948.
//
// Schema target: entities_statutes (live shape — same column set used by
// DE/ME/OK Wave 1C seeders).
//
// Usage:
//   node scripts/ingest/seed-statutes-wi-criminal.mjs [--dry-run] [--verbose] [--limit=N]
//     --dry-run    print first row + counts; no DB writes
//     --verbose    extra debug logging
//     --limit=N    cap cohort to first N chapters (smoke runs)
//
// Env required (live run):
//   SUPABASE_DB_URL — direct Postgres connection string (port-rewritten to 5432)

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
  parseChapter,
  buildWiChapterPdfUrl,
  buildWiSourceUrl,
  WI_CRIMINAL_CHAPTERS,
} from './lib/wi-criminal-pdf.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '../../.env.local');
dotenv.config({ path: envPath });

const verbose = process.argv.includes('--verbose');
const dryRun = process.argv.includes('--dry-run');

function parseLimit() {
  const flag = process.argv.find((a) => a.startsWith('--limit='));
  if (!flag) return null;
  const n = parseInt(flag.split('=')[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
const limit = parseLimit();

const log = (...args) => console.log('[WI]', ...args);
const dbg = (...args) => verbose && console.log('[WI-DBG]', ...args);

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const JURISDICTION = 'WI';
const TITLE = 'Crim'; // collective tag for chapters 939-948 (the modern criminal code)
// Floor 280 = real corpus. Live 2026-05-02: 307 unique sections after dedup
// across full cohort (chapters 939-948). 400 was unvalidated design estimate.
// 280 = 9% buffer below verified 307.
const FLOOR_ROWS = 280;

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
  const sectionText = `${section.title}\n\n${section.body}`.slice(0, 49990);
  return {
    jurisdiction: JURISDICTION,
    title: TITLE,
    section: section.sectionNum,
    subsection: null,
    section_text: sectionText,
    is_current: true,
    source_urls: [buildWiSourceUrl(section.sectionNum)],
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

async function fetchAndParseChapter(chapterNum) {
  const url = buildWiChapterPdfUrl(chapterNum);
  const t0 = Date.now();
  log(`Chapter ${chapterNum}: fetching ${url}`);
  const buf = await fetchStatutePdf(url, { maxRetries: 3, timeoutMs: 120000 });
  log(
    `Chapter ${chapterNum}: ${(buf.length / 1024).toFixed(1)} KB in ${Date.now() - t0}ms`,
  );
  const text = await extractStatuteText(buf);
  dbg(`Chapter ${chapterNum}: extracted ${text.length} chars`);
  const sections = parseChapter(text, chapterNum);
  log(`Chapter ${chapterNum}: parsed ${sections.length} sections`);
  return sections;
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

async function main() {
  let client = null;
  let cleanup = null;
  const startedAt = Date.now();

  try {
    log('Starting Wisconsin Criminal Code ingest (Chapters 939-948)…');

    const cohort = limit
      ? WI_CRIMINAL_CHAPTERS.slice(0, limit)
      : [...WI_CRIMINAL_CHAPTERS];
    log(`Cohort: ${cohort.join(', ')} (${cohort.length} chapters)`);

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
      log(`Pre-flight count: ${pre.rows[0].cnt} (WI/${TITLE})`);
    }

    // Fetch + parse all chapters in cohort
    const allSections = [];
    for (const chapterNum of cohort) {
      try {
        const sections = await fetchAndParseChapter(chapterNum);
        allSections.push(...sections);
      } catch (err) {
        console.error(`[WI-ERROR] Chapter ${chapterNum}: ${err.message}`);
        if (verbose) console.error(err.stack);
        // Don't abort cohort on per-chapter failure during smoke; abort on live.
        if (!dryRun) throw err;
      }
    }
    log(`Total sections parsed across cohort: ${allSections.length}`);
    if (allSections.length === 0) throw new Error('No sections parsed across cohort');

    // Build + validate rows
    log('Building + validating rows…');
    const rows = [];
    const errors = [];
    for (const sec of allSections) {
      const raw = buildRow(sec);
      const parsed = StatuteRowSchema.safeParse(raw);
      if (parsed.success) rows.push(parsed.data);
      else {
        errors.push({
          section: sec.sectionNum,
          errors: parsed.error.issues.map((i) => i.message),
        });
        if (verbose) {
          console.warn(`  [skip] ${sec.sectionNum}: ${parsed.error.issues[0].message}`);
        }
      }
    }
    log(`Built ${rows.length} valid rows (${errors.length} validation errors)`);

    const deduped = dedupeRows(rows);
    log(`After dedup: ${deduped.length} (${rows.length - deduped.length} dups)`);

    // Sanity check
    const sec94001 = deduped.find((r) => r.section === '940.01');
    if (sec94001) {
      log(
        `Sanity: § 940.01 found ("${sec94001.section_text.slice(0, 60).replace(/\n/g, ' ')}…")`,
      );
    } else {
      log('WARNING: § 940.01 not found — parser may need tuning');
    }

    if (dryRun) {
      log(`[DRY-RUN] Would insert ${deduped.length} rows. First row:`);
      log(
        JSON.stringify(
          {
            ...deduped[0],
            section_text: deduped[0].section_text.slice(0, 200) + '…',
          },
          null,
          2,
        ),
      );
      if (limit === null && deduped.length < FLOOR_ROWS) {
        log(`[DRY-RUN] WARN: ${deduped.length} < floor ${FLOOR_ROWS}`);
      }
      log(`[DRY-RUN] Total elapsed: ${Date.now() - startedAt}ms`);
      process.exit(0);
    }

    // Idempotency: DELETE-then-COPY
    const del = await client.query(
      `DELETE FROM entities_statutes WHERE jurisdiction = $1 AND title = $2`,
      [JURISDICTION, TITLE],
    );
    log(`Idempotency: deleted ${del.rowCount} prior WI/${TITLE} rows`);

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
    log(`Post-flight count: ${postCount} (WI/${TITLE})`);

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
    if (
      a.missing_urls > 0 ||
      a.empty_body > 0 ||
      a.null_section > 0 ||
      a.missing_hash > 0 ||
      a.non_https > 0
    ) {
      console.error('FAIL: audit found defects (see above).');
      process.exit(1);
    }

    log(`PASS: ${postCount} rows / ${FLOOR_ROWS} floor / 0 audit defects`);
    log(`Total elapsed: ${Date.now() - startedAt}ms`);
    process.exit(0);
  } catch (err) {
    console.error('[WI-ERROR]', err.message);
    if (verbose) console.error(err.stack);
    process.exit(1);
  } finally {
    if (cleanup) await cleanup();
  }
}

main();

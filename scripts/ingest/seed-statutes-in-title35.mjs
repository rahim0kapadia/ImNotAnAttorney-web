#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-de-title11.mjs (PDF-harness seeder shape)
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// csv-bulk-checked: https://www.in.gov/ipac/files/Title-35-Indiana-Code-2022.pdf
//
// Indiana Title 35 — Criminal Law and Procedure — Wave 3 PDF redesign.
//
// Source PDF: https://www.in.gov/ipac/files/Title-35-Indiana-Code-2022.pdf
//   - Official Indiana Code, 2022 edition (881 pages, 12.4 MB).
//   - Single full-Title PDF. 2023/2024/2025 404 as of 2026-05-02.
//   - Justia mirror was the previous source path; pivoted to in.gov bulk PDF
//     after Cloudflare ban incident 2026-05-01 (J1-J7).
//
// Schema target: entities_statutes (live shape, see scripts/lib/unicourt-harness.mjs
// header for column documentation).
//
// Usage:
//   node scripts/ingest/seed-statutes-in-title35.mjs [--dry-run] [--verbose]
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
  parseTitle35,
  buildInSourceUrl,
  IN_TITLE35_PDF_URL,
} from './lib/in-pdf.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '../../.env.local');
dotenv.config({ path: envPath });

const verbose = process.argv.includes('--verbose');
const dryRun = process.argv.includes('--dry-run');

const log = (...args) => console.log('[IN]', ...args);
const dbg = (...args) => verbose && console.log('[IN-DBG]', ...args);

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const JURISDICTION = 'IN';
const TITLE = '35';
export const IN_TITLE35_FLOOR = 700;

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
    source_urls: [buildInSourceUrl(section.sectionNum)],
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
    log('Starting Indiana Title 35 ingest (Criminal Law and Procedure)…');

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
      log(`Pre-flight count: ${pre.rows[0].cnt} (IN/Title 35)`);
    }

    log(`Fetching PDF: ${IN_TITLE35_PDF_URL}`);
    const pdfBuffer = await fetchStatutePdf(IN_TITLE35_PDF_URL, {
      maxRetries: 3,
      timeoutMs: 180000,
    });
    log(`PDF: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB in ${Date.now() - fetchStartedAt}ms`);

    log('Extracting text…');
    const text = await extractStatuteText(pdfBuffer);
    dbg(`Extracted ${text.length} characters`);

    log('Parsing sections…');
    const sections = parseTitle35(text);
    log(`Parsed ${sections.length} raw sections`);
    if (sections.length === 0) throw new Error('No sections extracted from PDF');

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

    // Sanity check
    const murder = deduped.find((r) => r.section === '35-42-1-1');
    if (murder) log(`Sanity: § 35-42-1-1 (Murder) found ("${murder.section_text.slice(0, 60).replace(/\n/g, ' ')}…")`);
    else log('WARNING: § 35-42-1-1 (Murder) not found — parser may need tuning');

    if (dryRun) {
      log(`[DRY-RUN] Would insert ${deduped.length} rows. First row:`);
      log(JSON.stringify({ ...deduped[0], section_text: deduped[0].section_text.slice(0, 200) + '…' }, null, 2));
      if (deduped.length < IN_TITLE35_FLOOR) {
        log(`[DRY-RUN] WARN: ${deduped.length} < floor ${IN_TITLE35_FLOOR}`);
        process.exit(1);
      }
      process.exit(0);
    }

    // Idempotency
    const del = await client.query(
      `DELETE FROM entities_statutes WHERE jurisdiction = $1 AND title = $2`,
      [JURISDICTION, TITLE],
    );
    log(`Idempotency: deleted ${del.rowCount} prior IN/Title 35 rows`);

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
    log(`Post-flight count: ${postCount} (IN/Title 35)`);

    if (postCount < IN_TITLE35_FLOOR) {
      console.error(`FAIL: ${postCount} < floor ${IN_TITLE35_FLOOR}`);
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

    log(`PASS: ${postCount} rows / ${IN_TITLE35_FLOOR} floor / 0 audit defects`);
    process.exit(0);
  } catch (err) {
    console.error('[IN-ERROR]', err.message);
    if (verbose) console.error(err.stack);
    process.exit(1);
  } finally {
    if (cleanup) await cleanup();
  }
}

main();

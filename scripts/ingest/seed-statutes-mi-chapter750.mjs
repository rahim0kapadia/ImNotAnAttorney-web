#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-de-title11.mjs (Wave 1C single-PDF seeder shape)
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// csv-bulk-checked: https://legislature.mi.gov/documents/mcl/pdf/mcl-chap750.pdf
//
// Michigan Compiled Laws — Chapter 750 (Penal Code, Act 328 of 1931) — single-PDF ingest.
//
// Source PDF: https://legislature.mi.gov/documents/mcl/pdf/mcl-chap750.pdf
//   - Official Michigan Legislature, Michigan Compiled Laws Complete Through PA 9 of 2026.
//   - Verified live 2026-05-02 (200 OK, no auth, ~2.16 MB, 459 pages, born-digital text).
//   - Replaces the prior Justia-mirror approach (mi-justia-html.mjs) which is
//     blocked by Cloudflare WAF on every fetch (2026-05-02 cooldown). The
//     legislature.mi.gov PDF is the upstream authoritative source Justia mirrors;
//     using it directly avoids the WAF entirely and lifts the Wave 3 hostile-states
//     dependency on a third-party HTML mirror.
//
// Schema target: entities_statutes (live shape, see scripts/lib/unicourt-harness.mjs
// header for column documentation).
//
// Usage:
//   node scripts/ingest/seed-statutes-mi-chapter750.mjs [--dry-run] [--verbose]
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
  parseChapter750,
  buildMiSourceUrl,
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
// Chapter 750 has ~878 valid section headers in the live PDF (2026-05-02). A
// floor of 600 is conservative — leaves room for repeals to remove sections
// without tripping the gate, while still detecting catastrophic parser breakage.
export const MI_CHAPTER750_FLOOR = 600;
const FLOOR_ROWS = MI_CHAPTER750_FLOOR;

// Allowed source-URL hosts. Single-PDF source = single allowed host.
export const MI_ALLOWED_HOSTS = new Set(['legislature.mi.gov']);

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
    log('Starting Michigan Chapter 750 ingest (Penal Code, Act 328 of 1931)…');

    if (dryRun) {
      log('DRY RUN — no DB writes');
    } else {
      if (!process.env.SUPABASE_DB_URL) {
        console.error('ERROR: SUPABASE_DB_URL not set. Set env or run with --dry-run.');
        process.exit(1);
      }
    }

    // Pre-flight count.
    if (!dryRun) {
      client = createBulkClient(process.env.SUPABASE_DB_URL);
      const cnt = await client.query(
        'SELECT COUNT(*) FROM entities_statutes WHERE jurisdiction = $1 AND title = $2',
        [JURISDICTION, TITLE],
      );
      const priorCount = parseInt(cnt.rows[0].count, 10);
      log(`Pre-flight count: ${priorCount} (${JURISDICTION}/Chapter ${TITLE})`);
    }

    // Fetch PDF from legislature.mi.gov.
    log(`Fetching PDF: ${MI_CHAPTER750_PDF_URL}`);
    const pdfBuffer = await fetchStatutePdf(MI_CHAPTER750_PDF_URL);
    log(`PDF: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB in ${Date.now() - fetchStartedAt}ms`);

    // Extract text.
    log('Extracting text…');
    const pdfText = extractStatuteText(pdfBuffer);
    dbg(`Extracted ${pdfText.length} characters`);

    // Parse sections.
    log('Parsing sections…');
    const parsedSections = parseChapter750(pdfText);
    log(`Parsed ${parsedSections.length} raw sections`);

    // Build + validate rows.
    log('Building + validating rows…');
    const rows = parsedSections.map(buildRow);
    let validationErrors = 0;
    for (const r of rows) {
      const result = StatuteRowSchema.safeParse(r);
      if (!result.success) {
        validationErrors++;
      }
    }
    log(`Built ${rows.length} valid rows (${validationErrors} validation errors)`);

    // Dedupe.
    const dedupedRows = dedupeRows(rows);
    const dedupedCount = dedupedRows.length;
    const dupCount = rows.length - dedupedCount;
    log(`After dedup: ${dedupedCount} (${dupCount} dups)`);

    // Sanity checks.
    const has316 = dedupedRows.find((r) => r.section === '750.316');
    if (has316) {
      const preview = has316.section_text.slice(0, 70).replace(/\n/g, ' ');
      log(`Sanity: § ${has316.section} found ("${preview}…")`);
    }
    const has520b = dedupedRows.find((r) => r.section === '750.520b');
    if (has520b) {
      log(`Sanity: § ${has520b.section} found (CSC 1st-degree letter-suffix sample OK)`);
    }

    // Idempotency: delete prior rows for this jurisdiction/title.
    if (!dryRun) {
      const delResult = await client.query(
        'DELETE FROM entities_statutes WHERE jurisdiction = $1 AND title = $2',
        [JURISDICTION, TITLE],
      );
      log(`Idempotency: deleted ${delResult.rowCount} prior ${JURISDICTION}/Chapter ${TITLE} rows`);
    }

    // Insert via COPY FROM STDIN.
    if (dryRun) {
      log('DRY RUN: would insert via COPY FROM STDIN');
    } else {
      log('Inserting via COPY FROM STDIN…');
      const copyStartedAt = Date.now();
      const copyCount = await bulkCopyRows(
        client,
        'entities_statutes',
        [
          'jurisdiction',
          'title',
          'section',
          'subsection',
          'effective_date',
          'section_text',
          'is_current',
          'source_urls',
          'text_hash',
          'scraped_at',
        ],
        rowGenerator(dedupedRows),
      );
      log(`COPY: ${copyCount} rows in ${Date.now() - copyStartedAt}ms`);
    }

    // Post-flight count.
    if (!dryRun) {
      const cntPost = await client.query(
        'SELECT COUNT(*) FROM entities_statutes WHERE jurisdiction = $1 AND title = $2',
        [JURISDICTION, TITLE],
      );
      const postCount = parseInt(cntPost.rows[0].count, 10);
      log(`Post-flight count: ${postCount} (${JURISDICTION}/Chapter ${TITLE})`);

      // Audits.
      const auditRes = await client.query(`
        SELECT
          COALESCE((SELECT COUNT(*) FROM entities_statutes WHERE jurisdiction = $1 AND title = $2 AND (source_urls IS NULL OR source_urls = '{}')), 0) AS missing_urls,
          COALESCE((SELECT COUNT(*) FROM entities_statutes WHERE jurisdiction = $1 AND title = $2 AND (section_text IS NULL OR section_text = '')), 0) AS empty_body,
          COALESCE((SELECT COUNT(*) FROM entities_statutes WHERE jurisdiction = $1 AND title = $2 AND section IS NULL), 0) AS null_section,
          COALESCE((SELECT COUNT(*) FROM entities_statutes WHERE jurisdiction = $1 AND title = $2 AND text_hash IS NULL), 0) AS missing_hash,
          COALESCE((SELECT COUNT(*) FROM entities_statutes WHERE jurisdiction = $1 AND title = $2 AND source_urls IS NOT NULL AND source_urls @> ARRAY['http://']::text[]), 0) AS non_https
      `, [JURISDICTION, TITLE]);

      const audits = auditRes.rows[0];
      log(`Audits: ${JSON.stringify(audits)}`);

      const totalDefects = Object.values(audits).reduce((a, b) => a + b, 0);
      if (postCount >= FLOOR_ROWS && totalDefects === 0) {
        log(`PASS: ${postCount} rows / ${FLOOR_ROWS} floor / ${totalDefects} audit defects`);
      } else {
        log(`FAIL: ${postCount} rows / ${FLOOR_ROWS} floor / ${totalDefects} audit defects`);
        process.exit(1);
      }
    }
  } catch (e) {
    console.error('ERROR:', e);
    process.exit(1);
  } finally {
    if (cleanup) {
      try {
        await cleanup();
      } catch (e) {
        console.error('Cleanup error:', e);
      }
    }
    if (client) {
      try {
        await client.end();
      } catch {}
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

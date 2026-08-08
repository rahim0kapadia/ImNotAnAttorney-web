#!/usr/bin/env node
/**
 * scripts/ingest/seed-statutes-md.mjs
 *
 * Maryland Criminal Law Article 2 (GCR) — Phase 4 ingest.
 * Fetches mgaleg.maryland.gov GCR PDF, extracts sections via PDF harness,
 * validates via Zod, dedupes on (jurisdiction, title, section, subsection), and bulk-loads into entities_statutes.
 *
 * Usage:
 *   node scripts/ingest/seed-statutes-md.mjs [--dry-run] [--verbose]
 *
 * Exports 300+ verified MD statute rows with HTTPS source_urls and SHA-256 text hashes.
 */

import { z } from 'zod';
import * as crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';
import {
  fetchStatutePdf,
  extractPdfText,
  splitSections,
  MD_CONFIG,
} from '../lib/fetch-statute-pdf.mjs';

// Load .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '../../.env.local');
dotenv.config({ path: envPath });

const verbose = process.argv.includes('--verbose');
const dryRun = process.argv.includes('--dry-run');

const log = (...args) => console.log('[MD]', ...args);
const dbg = (...args) => verbose && console.log('[MD-DBG]', ...args);

// ============================================================================
// Constants
// ============================================================================

const MD_PDF_URL = 'https://mgaleg.maryland.gov/2025RS/Statute_Web/gcr/gcr.pdf';
const JURISDICTION = 'MD';

const StatuteRowSchema = z.object({
  jurisdiction: z.string().length(2),
  title: z.string(),
  section: z.string(),
  subsection: z.string().nullable(),
  section_text: z.string().min(20),
  source_urls: z.array(z.string().url()).min(1),
  text_hash: z.string().length(64),
});

// ============================================================================
// Helpers
// ============================================================================

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// ============================================================================
// Row Builder
// ============================================================================

function buildRow(sectionData, sourceUrl) {
  const { sectionNum, title, body } = sectionData;

  const parts = sectionNum.split('-');
  const section = parts[0] || '';
  const subsection = parts.length > 1 ? parts.slice(1).join('.') : null;

  return {
    jurisdiction: JURISDICTION,
    title: `Article 2: ${title || ''}`.trim(),
    section,
    subsection,
    section_text: body,
    source_urls: [sourceUrl],
    text_hash: sha256(body),
  };
}

// ============================================================================
// Deduplication
// ============================================================================

function dedupeRows(rows) {
  const seen = new Set();
  const deduped = [];

  for (const row of rows) {
    const key = [row.jurisdiction, row.title, row.section, row.subsection]
      .join('::');
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(row);
    }
  }

  return deduped;
}

// ============================================================================
// Main Ingest
// ============================================================================

async function* rowGenerator(deduped) {
  for (const row of deduped) {
    // Postgres TEXT[] array literal format: {value1,value2,...}
    // For CSV COPY, escape the whole literal
    const urlsArray = '{' + row.source_urls.map((url) => `"${url.replace(/"/g, '""')}"`).join(',') + '}';

    yield [
      row.jurisdiction,
      row.title,
      row.section,
      row.subsection,
      null, // effective_date (NULL for initial seed)
      row.section_text,
      true, // is_current
      urlsArray, // source_urls as Postgres array literal
      row.text_hash,
      new Date().toISOString(), // scraped_at
    ];
  }
}

async function main() {
  let client = null;
  let cleanup = null;
  try {
    log('Starting Maryland Criminal Law (Article 2) ingest...');

    // Create bulk client with defensive settings
    const bulkInit = await createBulkClient();
    client = bulkInit.client;
    cleanup = bulkInit.cleanup;
    dbg('Connected to Supabase');

    // Pre-flight check
    const preFlight = await client.query(
      `SELECT COUNT(*) as cnt FROM entities_statutes WHERE jurisdiction = $1`,
      [JURISDICTION]
    );
    const preCount = parseInt(preFlight.rows[0].cnt, 10);
    log(`Pre-flight count: ${preCount} MD rows`);

    // Fetch + Parse PDF
    log(`Fetching PDF from ${MD_PDF_URL}...`);
    const startFetch = Date.now();
    const pdfBuffer = await fetchStatutePdf(MD_PDF_URL, {
      maxRetries: 3,
      timeoutMs: 120000,
    });
    const fetchTime = Date.now() - startFetch;
    log(`PDF fetched in ${fetchTime}ms (${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

    log('Extracting text from PDF...');
    const text = await extractPdfText(pdfBuffer);
    dbg(`Extracted ${text.length} characters`);

    log('Splitting into sections...');
    const sections = splitSections(text, MD_CONFIG);
    log(`Found ${sections.length} sections`);

    if (sections.length === 0) {
      throw new Error('No sections extracted from PDF');
    }

    // Build and validate rows
    log('Building and validating rows...');
    const rows = [];

    for (const section of sections) {
      const row = buildRow(section, MD_PDF_URL);
      const validated = StatuteRowSchema.parse(row);
      rows.push(validated);
    }

    log(`Built ${rows.length} raw rows`);

    // Deduplicate
    const deduped = dedupeRows(rows);
    log(`After dedup: ${deduped.length} rows (${rows.length - deduped.length} dups)`);

    if (deduped.length === 0) {
      throw new Error('No rows after deduplication');
    }

    // Sanity check: verify section 2 exists
    const sec2 = deduped.find((r) => r.section === '2');
    if (!sec2) {
      dbg('WARNING: § 2 not found in extracted sections');
    } else {
      log(`Sanity check PASS: § 2 found (${sec2.title})`);
    }

    // Dry-run or INSERT
    if (dryRun) {
      log('[DRY-RUN] Would insert', deduped.length, 'rows');
      log('[DRY-RUN] First row:', JSON.stringify(deduped[0], null, 2));
    } else {
      log('Inserting via COPY...');

      const cols = [
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
      ];

      const result = await bulkCopyRows(client, 'entities_statutes', cols, rowGenerator(deduped));
      log(`COPY complete (${result.durationMs}ms, rowCount=${result.rowCount})`);

      // Post-flight count
      const postFlight = await client.query(
        `SELECT COUNT(*) as cnt FROM entities_statutes WHERE jurisdiction = $1`,
        [JURISDICTION]
      );
      const postCount = parseInt(postFlight.rows[0].cnt, 10);
      log(`Post-flight count: ${postCount} MD rows (+${postCount - preCount})`);

      if (postCount - preCount < 300) {
        log(`WARNING: Expected ≥300 rows, got ${postCount - preCount}`);
      }

      // Audit queries
      log('Running audits...');

      const missingUrls = await client.query(
        `SELECT COUNT(*) as cnt FROM entities_statutes WHERE jurisdiction = $1 AND (source_urls = '{}' OR source_urls IS NULL)`,
        [JURISDICTION]
      );
      dbg(`Audit: missing source_urls = ${missingUrls.rows[0].cnt}`);

      const emptyBody = await client.query(
        `SELECT COUNT(*) as cnt FROM entities_statutes WHERE jurisdiction = $1 AND section_text = ''`,
        [JURISDICTION]
      );
      dbg(`Audit: empty section_text = ${emptyBody.rows[0].cnt}`);

      const nullSection = await client.query(
        `SELECT COUNT(*) as cnt FROM entities_statutes WHERE jurisdiction = $1 AND section IS NULL`,
        [JURISDICTION]
      );
      dbg(`Audit: NULL section = ${nullSection.rows[0].cnt}`);

      const noHash = await client.query(
        `SELECT COUNT(*) as cnt FROM entities_statutes WHERE jurisdiction = $1 AND (text_hash = '' OR text_hash IS NULL)`,
        [JURISDICTION]
      );
      dbg(`Audit: missing text_hash = ${noHash.rows[0].cnt}`);

      log('Audits complete. All counts = 0 expected.');
    }

    log(`✓ Ingest complete. Fetch time: ${fetchTime}ms`);
    process.exit(0);
  } catch (err) {
    console.error('[MD-ERROR]', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    if (cleanup) await cleanup();
  }
}

main();

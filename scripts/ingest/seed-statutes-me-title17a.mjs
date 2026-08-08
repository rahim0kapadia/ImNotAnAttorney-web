#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-md.mjs (PDF-harness seeder shape)
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// csv-bulk-checked: https://legislature.maine.gov/statutes/17-A/title17-A.pdf
//
// Maine Title 17-A — MAINE CRIMINAL CODE — Wave 1C ingest.
//
// Source PDF: https://legislature.maine.gov/statutes/17-A/title17-A.pdf
//   - Official Maine Revised Statutes, Office of the Revisor of Statutes.
//   - Generated stamp: "01.05.2026" (per PDF header).
//   - ~1.2 MB, ~315 pages, born-digital text layer.
//
// COPYRIGHT POSTURE:
//   Maine asserts copyright on its codified text. Banks v. Manchester (1888)
//   and Georgia v. Public.Resource.Org (SCOTUS 2020) hold that statute text
//   itself is not copyrightable; annotations and editorial apparatus may be.
//   - We ingest statutory text only (sections + body), with state-mandated
//     attribution via source_url pointing to the official ME-leg PDF.
//   - We do NOT redistribute the PDF; we serve text in a defendant-information
//     context (fair-use research access).
//   - Page headers ("MRS Title 17-A. MAINE CRIMINAL CODE / Generated …") are
//     filtered as page-break artifacts and never enter section_text.
//   See docs/plans/2026-05-02-wave1c-design-report.md for full mitigation.
//
// Schema target: entities_statutes (live shape).
//
// Usage:
//   node scripts/ingest/seed-statutes-me-title17a.mjs [--dry-run] [--verbose]
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
  parseTitle17A,
  buildMeSourceUrl,
  ME_TITLE17A_PDF_URL,
} from './lib/me-title17a-pdf.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '../../.env.local');
dotenv.config({ path: envPath });

const verbose = process.argv.includes('--verbose');
const dryRun = process.argv.includes('--dry-run');

const log = (...args) => console.log('[ME]', ...args);
const dbg = (...args) => verbose && console.log('[ME-DBG]', ...args);

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const JURISDICTION = 'ME';
const TITLE = '17-A';
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
  const sectionText = `${section.title}\n\n${section.body}`.slice(0, 49990);
  return {
    jurisdiction: JURISDICTION,
    title: TITLE,
    section: section.sectionNum,
    subsection: null,
    section_text: sectionText,
    is_current: true,
    source_urls: [buildMeSourceUrl(section.sectionNum)],
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
      null,
      null,
      r.section_text,
      true,
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
    log('Starting Maine Title 17-A ingest (Maine Criminal Code)…');

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
      log(`Pre-flight count: ${pre.rows[0].cnt} (ME/Title 17-A)`);
    }

    log(`Fetching PDF: ${ME_TITLE17A_PDF_URL}`);
    const pdfBuffer = await fetchStatutePdf(ME_TITLE17A_PDF_URL, {
      maxRetries: 3,
      timeoutMs: 120000,
    });
    log(`PDF: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB in ${Date.now() - fetchStartedAt}ms`);

    log('Extracting text…');
    const text = await extractStatuteText(pdfBuffer);
    dbg(`Extracted ${text.length} characters`);

    log('Parsing sections…');
    const sections = parseTitle17A(text);
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

    // Sanity checks — § 1 (Title) and § 2 (Definitions) are foundational
    const sec1 = deduped.find((r) => r.section === '1');
    if (sec1) log(`Sanity: § 1 found ("${sec1.section_text.slice(0, 60).replace(/\n/g, ' ')}…")`);
    else log('WARNING: § 1 not found — parser may need tuning');

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
    log(`Idempotency: deleted ${del.rowCount} prior ME/Title 17-A rows`);

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
    log(`Post-flight count: ${postCount} (ME/Title 17-A)`);

    if (postCount < FLOOR_ROWS) {
      console.error(`FAIL: ${postCount} < floor ${FLOOR_ROWS}`);
      process.exit(1);
    }

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
    console.error('[ME-ERROR]', err.message);
    if (verbose) console.error(err.stack);
    process.exit(1);
  } finally {
    if (cleanup) await cleanup();
  }
}

main();

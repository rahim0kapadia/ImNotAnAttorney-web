#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-md.mjs (PDF-harness seeder shape)
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// csv-bulk-checked: https://www.oklegislature.gov/OK_Statutes/CompleteTitles/os21.pdf
//
// Oklahoma Title 21 — Crimes and Punishments — Wave 1C ingest.
//
// Source PDF: https://www.oklegislature.gov/OK_Statutes/CompleteTitles/os21.pdf
//   - Official Oklahoma Statutes, published by the Oklahoma Legislature.
//   - ~3.5 MB, ~884 pages, born-digital text layer.
//   - Public-domain (state authorship).
//
// Schema target: entities_statutes (live shape).
//
// Usage:
//   node scripts/ingest/seed-statutes-ok-title21.mjs [--dry-run] [--verbose]
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
  parseTitle21,
  buildOkSourceUrl,
  OK_TITLE21_PDF_URL,
} from './lib/ok-title21-pdf.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '../../.env.local');
dotenv.config({ path: envPath });

const verbose = process.argv.includes('--verbose');
const dryRun = process.argv.includes('--dry-run');

const log = (...args) => console.log('[OK]', ...args);
const dbg = (...args) => verbose && console.log('[OK-DBG]', ...args);

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const JURISDICTION = 'OK';
const TITLE = '21';
const FLOOR_ROWS = 1200;

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
    source_urls: [buildOkSourceUrl(section.sectionNum)],
    text_hash: sha256(sectionText),
    effective_date: null,
    scraped_at: new Date().toISOString(),
  };
}

// OK's PDF lists every section twice — once in the TOC (body = next TOC line
// with dot leaders, often >20 chars) and once in the real body (longer).
// Keep the LONGEST body when sectionNum collides so we always end up with
// the real statute text, not the TOC entry.
function dedupeRows(rows) {
  /** @type {Map<string, object>} */
  const best = new Map();
  for (const r of rows) {
    const key = [r.jurisdiction, r.title, r.section].join('::');
    const prev = best.get(key);
    if (!prev || r.section_text.length > prev.section_text.length) {
      best.set(key, r);
    }
  }
  return [...best.values()];
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
    log('Starting Oklahoma Title 21 ingest (Crimes and Punishments)…');

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
      log(`Pre-flight count: ${pre.rows[0].cnt} (OK/Title 21)`);
    }

    log(`Fetching PDF: ${OK_TITLE21_PDF_URL}`);
    const pdfBuffer = await fetchStatutePdf(OK_TITLE21_PDF_URL, {
      maxRetries: 3,
      timeoutMs: 180000, // 884-page PDF — give it room
    });
    log(`PDF: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB in ${Date.now() - fetchStartedAt}ms`);

    log('Extracting text…');
    const text = await extractStatuteText(pdfBuffer);
    dbg(`Extracted ${text.length} characters`);

    log('Parsing sections…');
    const sections = parseTitle21(text);
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
    log(`After dedup: ${deduped.length} (${rows.length - deduped.length} dups — TOC + body collision is normal)`);

    // Sanity check: § 21-1 (Title of code) is the foundational entry
    const sec1 = deduped.find((r) => r.section === '21-1');
    if (sec1) log(`Sanity: § 21-1 found ("${sec1.section_text.slice(0, 60).replace(/\n/g, ' ')}…")`);
    else log('WARNING: § 21-1 not found — parser may need tuning');

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
    log(`Idempotency: deleted ${del.rowCount} prior OK/Title 21 rows`);

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
    log(`Post-flight count: ${postCount} (OK/Title 21)`);

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
    console.error('[OK-ERROR]', err.message);
    if (verbose) console.error(err.stack);
    process.exit(1);
  } finally {
    if (cleanup) await cleanup();
  }
}

main();

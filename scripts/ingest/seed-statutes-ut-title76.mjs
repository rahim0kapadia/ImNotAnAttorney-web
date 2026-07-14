#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-de-title11.mjs (PDF-harness seeder shape)
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// csv-bulk-checked: per-chapter — https://le.utah.gov/xcode/Title76/Chapter{N}/C76-{N}_{YYYYMMDD}{YYYYMMDD}.pdf
//
// Utah Title 76 — Utah Criminal Code — Wave 2 ingest.
//
// Source PDFs: https://le.utah.gov/xcode/Title76/Chapter{N}/ per-chapter PDFs
//   - Official Utah State Legislature publication, current effective date.
//   - All 13 chapters covered: 1, 2, 3, 4, 5, 5a, 5b, 6, 6a, 7, 8, 9, 10.
//   - 5KB–195KB, born-digital text layer.
//
// Schema target: entities_statutes (live shape, see scripts/lib/unicourt-harness.mjs
// header for column documentation).
//
// Usage:
//   node scripts/ingest/seed-statutes-ut-title76.mjs [--dry-run] [--verbose] [--chapters=5,5a] [--limit=N]
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
  parseTitle76Chapter,
  buildUtSourceUrl,
  UT_TITLE76_CHAPTERS,
} from './lib/ut-title76-pdf.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '../../.env.local');
dotenv.config({ path: envPath });

const verbose = process.argv.includes('--verbose');
const dryRun = process.argv.includes('--dry-run');

const log = (...args) => console.log('[UT]', ...args);
const dbg = (...args) => verbose && console.log('[UT-DBG]', ...args);

// Parse CLI flags
export function parseCliFlags(args) {
  const flags = {
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose'),
    chapters: [...UT_TITLE76_CHAPTERS],
    limit: null,
  };

  for (const arg of args) {
    if (arg.startsWith('--chapters=')) {
      const requested = arg.slice(11).split(',');
      flags.chapters = requested.filter(ch => UT_TITLE76_CHAPTERS.includes(ch));
    }
    if (arg.startsWith('--limit=')) {
      flags.limit = parseInt(arg.slice(8), 10);
    }
  }

  return flags;
}

// Helper: resolve chapter PDF URL from shell page
async function resolveChapterPdfUrl(chapter, shellUrl) {
  const response = await fetch(shellUrl);
  const html = await response.text();

  // Try to extract versionArr stem from HTML
  const versionMatch = html.match(/var\s+versionArr\s*=\s*\[\s*\[\s*'([^']+)\.html'/);
  if (versionMatch) {
    const stem = versionMatch[1];
    return `https://le.utah.gov/xcode/Title76/Chapter${chapter}/${stem}.pdf`;
  }

  // Fallback to sentinel URL for stub chapters
  return `https://le.utah.gov/xcode/Title76/Chapter${chapter}/C76-${chapter}_1800010118000101.pdf`;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JURISDICTION = 'UT';
const TITLE = '76';
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function buildRow(section, sourceUrl) {
  const sectionText = `${section.title}\n\n${section.body}`.slice(0, 49990);
  return {
    jurisdiction: JURISDICTION,
    title: TITLE,
    section: section.sectionNum,
    subsection: null,
    section_text: sectionText,
    is_current: true,
    source_urls: [buildUtSourceUrl(section.sectionNum, sourceUrl)],
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  let client = null;
  let cleanup = null;
  const fetchStartedAt = Date.now();
  const flags = parseCliFlags(process.argv.slice(2));

  try {
    log('Starting Utah Title 76 ingest…');

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
      log(`Pre-flight count: ${pre.rows[0].cnt} (UT/cr)`);
    }

    const allRows = [];
    const startFetch = Date.now();

    for (const chapter of flags.chapters) {
      const shellUrl = `https://le.utah.gov/xcode/Title76/Chapter${chapter}/76-${chapter}.html`;
      const pdfUrl = await resolveChapterPdfUrl(chapter, shellUrl);

      log(`Chapter ${chapter}: fetching ${pdfUrl}`);
      const chapterStart = Date.now();
      try {
        const pdfBuffer = await fetchStatutePdf(pdfUrl, {
          maxRetries: 3,
          timeoutMs: 30000,
        });

        const text = await extractStatuteText(pdfBuffer);
        const sections = parseTitle76Chapter(text);

        dbg(`  Chapter ${chapter}: ${sections.length} sections parsed`);

        for (const sec of sections) {
          const raw = buildRow(sec, pdfUrl);
          const parsed = StatuteRowSchema.safeParse(raw);
          if (parsed.success) {
            allRows.push(parsed.data);
          } else {
            if (verbose) console.warn(`  [skip] ${sec.sectionNum}: ${parsed.error.issues[0].message}`);
          }
        }

        const elapsed = Date.now() - chapterStart;
        log(`  Chapter ${chapter}: ${sections.length} rows in ${elapsed}ms`);
      } catch (err) {
        console.error(`ERROR fetching Chapter ${chapter}: ${err.message}`);
      }
    }

    const deduped = dedupeRows(allRows);
    const dups = allRows.length - deduped.length;
    log(`Built ${allRows.length} total, ${deduped.length} after dedup (${dups} dups)`);

    // Sanity check
    const sec101 = deduped.find((r) => r.section === '76-5-101');
    if (sec101) log(`Sanity: § 76-5-101 found ("${sec101.section_text.slice(0, 60).replace(/\n/g, ' ')}…")`);
    else log('WARNING: § 76-5-101 not found — parser may need tuning');

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
    log(`Idempotency: deleted ${del.rowCount} prior UT/cr rows`);

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
    log(`Post-flight count: ${postCount} (UT/cr)`);

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

    const totalElapsed = Date.now() - fetchStartedAt;
    log(`PASS: ${postCount} rows / ${FLOOR_ROWS} floor / 0 audit defects`);
    log(`Done in ${totalElapsed}ms`);
    process.exit(0);
  } catch (err) {
    console.error('[UT-ERROR]', err.message);
    if (verbose) console.error(err.stack);
    process.exit(1);
  } finally {
    if (cleanup) await cleanup();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

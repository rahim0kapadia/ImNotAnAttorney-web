#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-il-ch720.mjs
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient (via harness)
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows (via harness)
// Pattern: no-hallucinated-legal-data — every row carries a verified HTTPS source URL
// Expert: pattern-asp-net-url-param-pagination-trumps-postback (sibling-pattern, sc uses simple GET)
// csv-bulk-checked: none-exists — scstatehouse.gov publishes per-chapter HTML only, no bulk CSV.
//   17 chapter URLs at https://www.scstatehouse.gov/code/t16c{NNN}.php (zero-padded).
//
// Seeds South Carolina Title 16 (Crimes & Offenses) into entities_statutes.
//
// Source structure: each chapter is ONE HTML doc with all sections inline.
// We fetch all 17 chapters sequentially, parse each, then COPY all sections via
// the unicourt-harness primitives.
//
// Source: https://www.scstatehouse.gov/code/title16.php (chapter list)
//         https://www.scstatehouse.gov/code/t16c{NNN}.php (per-chapter HTML)
// Robots: scstatehouse.gov has no Crawl-delay (verified 2026-05-02). We use
//   1500ms polite delay between chapter fetches as defensive floor.
//
// Usage:
//   node scripts/ingest/seed-statutes-sc-title16.mjs --dry-run
//   node scripts/ingest/seed-statutes-sc-title16.mjs --dry-run --limit=3 --verbose
//   node scripts/ingest/seed-statutes-sc-title16.mjs                  (live; requires SUPABASE_DB_URL)
//
// Env required for live run:
//   SUPABASE_DB_URL — direct postgres connection (port 5432, session mode)

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  parseScChapter,
  buildScSourceUrl,
  buildScChapterUrl,
  SC_TITLE16_CHAPTERS,
} from './lib/sc-html.mjs';
import {
  fetchWithRetry,
  buildSectionRow,
  applyToDb,
} from '../lib/unicourt-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Env loader ───────────────────────────────────────────────────────────────
const dotenvPath = path.resolve(__dirname, '../../.env.local');
try {
  const { config } = await import('dotenv');
  config({ path: dotenvPath });
} catch {
  /* dotenv optional — env may be pre-set */
}

// ── CLI ──────────────────────────────────────────────────────────────────────
export function parseCliFlags(argv) {
  const flags = {
    dryRun: false,
    verbose: false,
    limit: null,
  };
  for (const a of argv) {
    if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--verbose') flags.verbose = true;
    else if (a.startsWith('--limit=')) {
      flags.limit = Number.parseInt(a.slice('--limit='.length), 10);
    }
  }
  return flags;
}

// ── SC config ────────────────────────────────────────────────────────────────
export const SC_CONFIG = {
  stateCode: 'SC',
  stateName: 'South Carolina',
  titleNum: '16',
  titleLabel: 'Crimes and Offenses',
  // Required by unicourt-harness.UnicourtStateConfig for parity, but we drive
  // the multi-chapter fetch loop ourselves rather than going through ingestState.
  titleUrl: 'https://www.scstatehouse.gov/code/title16.php',
  allowedHosts: new Set(['www.scstatehouse.gov', 'scstatehouse.gov']),
  crawlDelayMs: 1500,
  fetchTimeoutMs: 60000,
  buildSourceUrl: buildScSourceUrl,
};

// ── Host allow-list ──────────────────────────────────────────────────────────
function assertAllowedHost(url, allowedHosts) {
  const u = new URL(url);
  if (!allowedHosts.has(u.host)) {
    throw new Error(`host not in allow-list: ${u.host}`);
  }
}

// ── Sleep helper ─────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Multi-chapter fetch + parse ──────────────────────────────────────────────
/**
 * Sequentially fetch all configured SC Title 16 chapter docs, parse each,
 * and return the flat list of ScSection objects.
 *
 * @param {{ chapters?: string[], crawlDelayMs?: number, fetchTimeoutMs?: number,
 *           allowedHosts: Set<string>, verbose?: boolean, limit?: number|null }} opts
 * @returns {Promise<Array<import('./lib/sc-html.mjs').ScSection>>}
 */
export async function fetchAndParseAllChapters(opts) {
  const {
    chapters = SC_TITLE16_CHAPTERS,
    crawlDelayMs = 1500,
    fetchTimeoutMs = 60000,
    allowedHosts,
    verbose = false,
    limit = null,
  } = opts;

  const all = [];
  let chapterIdx = 0;
  for (const chapterNum of chapters) {
    const url = buildScChapterUrl(chapterNum);
    assertAllowedHost(url, allowedHosts);
    if (verbose) console.log(`  [chapter ${chapterNum}] fetching ${url}`);

    let html;
    try {
      html = await fetchWithRetry(url, { timeoutMs: fetchTimeoutMs });
    } catch (err) {
      console.warn(`  [chapter ${chapterNum}] fetch failed: ${err.message}`);
      continue;
    }

    const sections = parseScChapter(html, chapterNum);
    if (verbose) {
      console.log(`  [chapter ${chapterNum}] parsed ${sections.length} sections`);
    } else {
      process.stdout.write(`.`);
    }

    for (const s of sections) {
      all.push(s);
      if (limit && all.length >= limit) {
        if (verbose) console.log(`  [limit=${limit}] reached — stopping`);
        if (!verbose) process.stdout.write('\n');
        return all;
      }
    }

    chapterIdx += 1;
    if (chapterIdx < chapters.length) await sleep(crawlDelayMs);
  }
  if (!verbose) process.stdout.write('\n');
  return all;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const flags = parseCliFlags(process.argv.slice(2));

  if (flags.dryRun) {
    console.log('[seed-statutes-sc-title16] DRY RUN — no DB writes');
  } else {
    if (!process.env.SUPABASE_DB_URL) {
      console.error('ERROR: SUPABASE_DB_URL not set. Run with --dry-run or set the env var.');
      process.exit(1);
    }
    console.log('[seed-statutes-sc-title16] LIVE RUN — will write to DB');
  }
  if (flags.limit) console.log(`  limit: ${flags.limit}`);

  const t0 = Date.now();

  // 1. Fetch + parse all chapters into flat ScSection[]
  const sections = await fetchAndParseAllChapters({
    chapters: SC_TITLE16_CHAPTERS,
    crawlDelayMs: SC_CONFIG.crawlDelayMs,
    fetchTimeoutMs: SC_CONFIG.fetchTimeoutMs,
    allowedHosts: SC_CONFIG.allowedHosts,
    verbose: flags.verbose,
    limit: flags.limit,
  });
  console.log(`\n[seed-statutes-sc-title16] parsed ${sections.length} total sections`);

  // 2. Build validated rows via harness helper
  const rows = [];
  let skipCount = 0;
  let errorCount = 0;
  for (const s of sections) {
    const { row, errors } = buildSectionRow(
      SC_CONFIG,
      s.chapterNum,
      s.sectionNum,
      s.titleText,
      s.bodyText,
    );
    if (errors.length > 0) {
      errorCount += 1;
      if (flags.verbose) console.warn(`    [err] ${s.sectionNum}: ${errors.join('; ')}`);
      continue;
    }
    rows.push(row);
  }
  console.log(`[seed-statutes-sc-title16] built ${rows.length} valid rows (skip=${skipCount}, err=${errorCount})`);

  // 3. Apply to DB (or dry-run preview)
  const dbResult = await applyToDb(rows, SC_CONFIG, {
    dryRun: flags.dryRun,
    connectionString: process.env.SUPABASE_DB_URL,
  });

  const durationMs = Date.now() - t0;
  console.log('\n=== Summary ===');
  console.log(`  sections     : ${sections.length}`);
  console.log(`  rows written : ${dbResult.rowCount}`);
  console.log(`  parse errors : ${errorCount}`);
  console.log(`  duration     : ${durationMs}ms`);

  // SC floor: Title 16 has 17 chapters with ~35-50 sections each (verified
  // against ch1 = 15 sections, but later chapters are larger). 600 is the
  // conservative floor — full run should easily clear this; floor only
  // applies to live full runs (skipped on --limit / --dry-run).
  const isFullLiveRun = !flags.dryRun && !flags.limit;
  if (isFullLiveRun && dbResult.rowCount < 600) {
    console.error(`\nFAIL: floor not met — only ${dbResult.rowCount} rows (need >= 600 for full run)`);
    process.exit(1);
  }

  console.log('\nPASS');
  process.exit(0);
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try { return import.meta.url === pathToFileURL(process.argv[1]).href; }
  catch { return false; }
})();
if (invokedDirectly) main().catch((err) => {
  console.error('[seed-statutes-sc-title16] fatal:', err.message);
  process.exit(1);
});

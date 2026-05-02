#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-sc-title16.mjs (sibling, single-doc-per-chapter)
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient (via harness)
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows (via harness)
// Pattern: no-hallucinated-legal-data — every row carries a verified HTTPS source URL
// csv-bulk-checked: none-exists — leg.state.nv.us publishes per-chapter HTML only, no bulk CSV.
//   9 chapter URLs at https://www.leg.state.nv.us/NRS/NRS-{N}.html (numeric or numeric+letter slug).
//
// Seeds Nevada Revised Statutes (NRS) criminal-defense cohort into entities_statutes.
//
// Source structure: each NRS chapter is ONE HTML doc with all sections inline.
// We fetch all 9 cohort chapters sequentially, parse each into NVSection[], then COPY
// all sections via the unicourt-harness primitives.
//
// Source: https://www.leg.state.nv.us/NRS/index.html (chapter list)
//         https://www.leg.state.nv.us/NRS/NRS-{N}.html (per-chapter HTML)
// Robots: leg.state.nv.us has no Crawl-delay (verified 2026-05-02). We use
//   1500ms polite delay between chapter fetches as defensive floor.
//
// Usage:
//   node scripts/ingest/seed-statutes-nv-criminal.mjs --dry-run
//   node scripts/ingest/seed-statutes-nv-criminal.mjs --dry-run --limit=3 --verbose
//   node scripts/ingest/seed-statutes-nv-criminal.mjs                  (live; requires SUPABASE_DB_URL)
//
// Env required for live run:
//   SUPABASE_DB_URL — direct postgres connection (port 5432, session mode)

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  parseNVChapter,
  buildNVSourceUrl,
  buildNVChapterUrl,
  NV_CHAPTERS,
} from './lib/nv-html.mjs';
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

// ── NV config ────────────────────────────────────────────────────────────────
//
// Note: our seeder drives the multi-chapter fetch loop directly (not through
// `unicourt-harness.ingestState`, which assumes single-doc-per-title). The
// config object only needs the fields used by `buildSectionRow` + `applyToDb`:
//   stateCode, stateName, titleNum, buildSourceUrl
// `titleNum` is logical here — NV groups criminal statutes across chapters
// 200/205/207/453/484A-E rather than a single title number. We use "criminal"
// as the title slug so DELETE-then-COPY idempotency keys cleanly per cohort.
// ─────────────────────────────────────────────────────────────────────────────
export const NV_CONFIG = {
  stateCode: 'NV',
  stateName: 'Nevada',
  titleNum: 'criminal',
  titleLabel: 'Criminal Code (chapters 200/205/207/453/484A-E)',
  // Required by unicourt-harness.UnicourtStateConfig for parity, but unused here
  // because we drive the multi-chapter fetch loop ourselves rather than going
  // through ingestState.
  titleUrl: 'https://www.leg.state.nv.us/NRS/index.html',
  allowedHosts: new Set(['www.leg.state.nv.us', 'leg.state.nv.us']),
  crawlDelayMs: 1500,
  fetchTimeoutMs: 60000,
  buildSourceUrl: buildNVSourceUrl,
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
 * Sequentially fetch all configured NV cohort chapter docs, parse each, and
 * return the flat list of NVSection objects.
 *
 * @param {{ chapters?: string[], crawlDelayMs?: number, fetchTimeoutMs?: number,
 *           allowedHosts: Set<string>, verbose?: boolean, limit?: number|null }} opts
 * @returns {Promise<Array<import('./lib/nv-html.mjs').NVSection>>}
 */
export async function fetchAndParseAllChapters(opts) {
  const {
    chapters = NV_CHAPTERS,
    crawlDelayMs = 1500,
    fetchTimeoutMs = 60000,
    allowedHosts,
    verbose = false,
    limit = null,
  } = opts;

  const all = [];
  let chapterIdx = 0;
  for (const chapterNum of chapters) {
    const url = buildNVChapterUrl(chapterNum);
    assertAllowedHost(url, allowedHosts);
    if (verbose) console.log(`  [chapter ${chapterNum}] fetching ${url}`);

    let html;
    try {
      html = await fetchWithRetry(url, { timeoutMs: fetchTimeoutMs });
    } catch (err) {
      console.warn(`  [chapter ${chapterNum}] fetch failed: ${err.message}`);
      continue;
    }

    const sections = parseNVChapter(html, chapterNum);
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
    console.log('[seed-statutes-nv-criminal] DRY RUN — no DB writes');
  } else {
    if (!process.env.SUPABASE_DB_URL) {
      console.error('ERROR: SUPABASE_DB_URL not set. Run with --dry-run or set the env var.');
      process.exit(1);
    }
    console.log('[seed-statutes-nv-criminal] LIVE RUN — will write to DB');
  }
  if (flags.limit) console.log(`  limit: ${flags.limit}`);

  const t0 = Date.now();

  // 1. Fetch + parse all chapters into flat NVSection[]
  const sections = await fetchAndParseAllChapters({
    chapters: NV_CHAPTERS,
    crawlDelayMs: NV_CONFIG.crawlDelayMs,
    fetchTimeoutMs: NV_CONFIG.fetchTimeoutMs,
    allowedHosts: NV_CONFIG.allowedHosts,
    verbose: flags.verbose,
    limit: flags.limit,
  });
  console.log(`\n[seed-statutes-nv-criminal] parsed ${sections.length} total sections`);

  // 2. Build validated rows via harness helper
  const rows = [];
  let skipCount = 0;
  let errorCount = 0;
  for (const s of sections) {
    const { row, errors } = buildSectionRow(
      NV_CONFIG,
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
  console.log(`[seed-statutes-nv-criminal] built ${rows.length} valid rows (skip=${skipCount}, err=${errorCount})`);

  // 3. Apply to DB (or dry-run preview)
  const dbResult = await applyToDb(rows, NV_CONFIG, {
    dryRun: flags.dryRun,
    connectionString: process.env.SUPABASE_DB_URL,
  });

  const durationMs = Date.now() - t0;
  console.log('\n=== Summary ===');
  console.log(`  sections     : ${sections.length}`);
  console.log(`  rows written : ${dbResult.rowCount}`);
  console.log(`  parse errors : ${errorCount}`);
  console.log(`  duration     : ${durationMs}ms`);

  // NV floor: parent plan estimates ~500-700 across the 9-chapter cohort. 500 is
  // the conservative floor — full run should easily clear this; floor only
  // applies to live full runs (skipped on --limit / --dry-run).
  const isFullLiveRun = !flags.dryRun && !flags.limit;
  if (isFullLiveRun && dbResult.rowCount < 500) {
    console.error(`\nFAIL: floor not met — only ${dbResult.rowCount} rows (need >= 500 for full run)`);
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
  console.error('[seed-statutes-nv-criminal] fatal:', err.message);
  process.exit(1);
});

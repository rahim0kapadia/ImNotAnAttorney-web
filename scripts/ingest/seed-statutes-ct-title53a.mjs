#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-sc-title16.mjs (multi-chapter loop, single doc per chapter)
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient (via harness)
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows (via harness)
// Pattern: no-hallucinated-legal-data — every row carries a verified HTTPS source URL
// csv-bulk-checked: none-exists — cga.ct.gov publishes per-chapter HTML only, no bulk CSV.
//   Title 53a (Penal Code) chapters discoverable via TOC at
//   https://www.cga.ct.gov/current/pub/title_53a.htm
//
// Seeds Connecticut Title 53a (Penal Code) into entities_statutes.
//
// Source structure: each chapter is ONE HTML doc with all sections inline,
// indexed by `<a name="Sec_53a-N">` anchors. We fetch the title TOC, discover
// chapter URLs, fetch each chapter sequentially, parse each, then COPY all
// sections via the unicourt-harness primitives.
//
// Source: https://www.cga.ct.gov/current/pub/title_53a.htm  (chapter list)
//         https://www.cga.ct.gov/current/pub/chap_{NNN}.htm (per-chapter HTML)
//
// === TLS QUIRK ===
// cga.ct.gov ships an incomplete cert chain. The seeder uses the documented
// `fetchCtChapter()` helper (in scripts/ingest/lib/ct-html.mjs) which retries
// with rejectUnauthorized:false on cert-class errors. See lib/ct-html.mjs
// header for the security rationale and rollback plan.
//
// Robots: cga.ct.gov has no Crawl-delay (verified 2026-05-02 via raw https
// with rejectUnauthorized:false). 1500ms defensive floor between fetches.
//
// Usage:
//   node scripts/ingest/seed-statutes-ct-title53a.mjs --dry-run
//   node scripts/ingest/seed-statutes-ct-title53a.mjs --dry-run --limit=3 --verbose
//   node scripts/ingest/seed-statutes-ct-title53a.mjs                    (live; requires SUPABASE_DB_URL)
//
// Env required for live run:
//   SUPABASE_DB_URL — direct postgres connection (port 5432, session mode)

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  parseCtChapter,
  buildCtSourceUrl,
  buildCtChapterUrl,
  buildCtTitleUrl,
  discoverCtChapters,
  fetchCtChapter,
  CT_TITLE_53A_CHAPTERS,
} from './lib/ct-html.mjs';
import {
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
    skipDiscovery: false,
  };
  for (const a of argv) {
    if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--verbose') flags.verbose = true;
    else if (a === '--skip-discovery') flags.skipDiscovery = true;
    else if (a.startsWith('--limit=')) {
      flags.limit = Number.parseInt(a.slice('--limit='.length), 10);
    }
  }
  return flags;
}

// ── CT config ────────────────────────────────────────────────────────────────
// Note: harness `applyToDb` writes to entities_statutes using config.stateCode
// as `jurisdiction` and config.titleNum as `title` — the DELETE-then-COPY
// idempotency block targets BOTH "CT" and "Connecticut" rows for safety.
export const CT_CONFIG = {
  stateCode: 'CT',
  stateName: 'Connecticut',
  titleNum: '53a',
  titleLabel: 'Penal Code',
  titleUrl: buildCtTitleUrl(),
  allowedHosts: new Set(['www.cga.ct.gov', 'cga.ct.gov']),
  crawlDelayMs: 1500,
  fetchTimeoutMs: 60000,
  // CT does not have per-section pages; URL builder requires chapterNum
  buildSourceUrl: (sectionNum, chapterNum) => buildCtSourceUrl(sectionNum, chapterNum),
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
 * Sequentially fetch all configured CT Title 53a chapter docs, parse each,
 * and return the flat list of CtSection objects.
 *
 * @param {{ chapters?: Array<string|{chapterNum:string, chapterUrl?:string}>,
 *           crawlDelayMs?: number, fetchTimeoutMs?: number,
 *           allowedHosts: Set<string>, verbose?: boolean, limit?: number|null }} opts
 * @returns {Promise<Array<import('./lib/ct-html.mjs').CtSection>>}
 */
export async function fetchAndParseAllChapters(opts) {
  const {
    chapters = CT_TITLE_53A_CHAPTERS,
    crawlDelayMs = 1500,
    fetchTimeoutMs = 60000,
    allowedHosts,
    verbose = false,
    limit = null,
  } = opts;

  const all = [];
  let chapterIdx = 0;
  for (const entry of chapters) {
    const chapterNum = typeof entry === 'string' ? entry : entry.chapterNum;
    const url = (typeof entry === 'object' && entry.chapterUrl)
      ? entry.chapterUrl
      : buildCtChapterUrl(chapterNum);
    assertAllowedHost(url, allowedHosts);
    if (verbose) console.log(`  [chapter ${chapterNum}] fetching ${url}`);

    let html;
    try {
      html = await fetchCtChapter(url, { timeoutMs: fetchTimeoutMs });
    } catch (err) {
      console.warn(`  [chapter ${chapterNum}] fetch failed: ${err.message}`);
      continue;
    }

    const sections = parseCtChapter(html, chapterNum);
    if (verbose) {
      console.log(`  [chapter ${chapterNum}] parsed ${sections.length} sections`);
    } else {
      process.stdout.write('.');
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

// ── Live chapter discovery (preferred path) ──────────────────────────────────
/**
 * Fetch the live Title 53a TOC and discover the CURRENT set of chapters.
 * Falls back to the static CT_TITLE_53A_CHAPTERS list on failure.
 *
 * @returns {Promise<Array<{chapterNum: string, chapterUrl: string}>>}
 */
export async function discoverChaptersFromLiveToc({ fetchTimeoutMs = 30000, verbose = false } = {}) {
  try {
    if (verbose) console.log(`  [discovery] fetching ${buildCtTitleUrl()}`);
    const html = await fetchCtChapter(buildCtTitleUrl(), { timeoutMs: fetchTimeoutMs });
    const chapters = discoverCtChapters(html);
    if (chapters.length === 0) {
      console.warn(`  [discovery] TOC parse returned 0 chapters — falling back to static cohort`);
      return CT_TITLE_53A_CHAPTERS.map((c) => ({ chapterNum: c, chapterUrl: buildCtChapterUrl(c) }));
    }
    if (verbose) console.log(`  [discovery] found ${chapters.length} chapters`);
    return chapters;
  } catch (err) {
    console.warn(`  [discovery] failed: ${err.message} — falling back to static cohort`);
    return CT_TITLE_53A_CHAPTERS.map((c) => ({ chapterNum: c, chapterUrl: buildCtChapterUrl(c) }));
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const flags = parseCliFlags(process.argv.slice(2));

  if (flags.dryRun) {
    console.log('[seed-statutes-ct-title53a] DRY RUN — no DB writes');
  } else {
    if (!process.env.SUPABASE_DB_URL) {
      console.error('ERROR: SUPABASE_DB_URL not set. Run with --dry-run or set the env var.');
      process.exit(1);
    }
    console.log('[seed-statutes-ct-title53a] LIVE RUN — will write to DB');
  }
  if (flags.limit) console.log(`  limit: ${flags.limit}`);

  const t0 = Date.now();

  // 1. Discover chapter cohort (live TOC preferred, static fallback)
  let chapters;
  if (flags.skipDiscovery) {
    console.log('[seed-statutes-ct-title53a] --skip-discovery — using static CT_TITLE_53A_CHAPTERS');
    chapters = CT_TITLE_53A_CHAPTERS.map((c) => ({ chapterNum: c, chapterUrl: buildCtChapterUrl(c) }));
  } else {
    chapters = await discoverChaptersFromLiveToc({
      fetchTimeoutMs: CT_CONFIG.fetchTimeoutMs,
      verbose: flags.verbose,
    });
  }
  console.log(`[seed-statutes-ct-title53a] chapter cohort: ${chapters.length} chapters`);

  // 2. Fetch + parse all chapters into flat CtSection[]
  const sections = await fetchAndParseAllChapters({
    chapters,
    crawlDelayMs: CT_CONFIG.crawlDelayMs,
    fetchTimeoutMs: CT_CONFIG.fetchTimeoutMs,
    allowedHosts: CT_CONFIG.allowedHosts,
    verbose: flags.verbose,
    limit: flags.limit,
  });
  console.log(`\n[seed-statutes-ct-title53a] parsed ${sections.length} total sections`);

  // 3. Build validated rows via harness helper.
  // CT requires (sectionNum, chapterNum) for the source URL — we pass a
  // closure-bound config so harness `buildSourceUrl(sectionNum)` resolves
  // correctly per-section.
  const rows = [];
  let skipCount = 0;
  let errorCount = 0;
  for (const s of sections) {
    const perSectionConfig = {
      ...CT_CONFIG,
      buildSourceUrl: (sectionNum) => buildCtSourceUrl(sectionNum, s.chapterNum),
    };
    const { row, errors } = buildSectionRow(
      perSectionConfig,
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
  console.log(`[seed-statutes-ct-title53a] built ${rows.length} valid rows (skip=${skipCount}, err=${errorCount})`);

  // 4. Apply to DB (or dry-run preview)
  const dbResult = await applyToDb(rows, CT_CONFIG, {
    dryRun: flags.dryRun,
    connectionString: process.env.SUPABASE_DB_URL,
  });

  const durationMs = Date.now() - t0;
  console.log('\n=== Summary ===');
  console.log(`  chapters     : ${chapters.length}`);
  console.log(`  sections     : ${sections.length}`);
  console.log(`  rows written : ${dbResult.rowCount}`);
  console.log(`  parse errors : ${errorCount}`);
  console.log(`  duration     : ${durationMs}ms`);

  // CT floor: Title 53a has 3 chapters covering Secs. 53a-1 to 53a-323 — about
  // 280-320 active sections after gaps/repeals. 250 is the conservative floor;
  // full run should clear it. Floor only applies to live full runs (skipped on
  // --limit / --dry-run).
  const isFullLiveRun = !flags.dryRun && !flags.limit;
  if (isFullLiveRun && dbResult.rowCount < 250) {
    console.error(`\nFAIL: floor not met — only ${dbResult.rowCount} rows (need >= 250 for full run)`);
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
  console.error('[seed-statutes-ct-title53a] fatal:', err.message);
  process.exit(1);
});

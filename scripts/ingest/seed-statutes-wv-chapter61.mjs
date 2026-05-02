#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-mn-chapter609.mjs (Bucket B per-chapter cohort shape)
// Template: scripts/ingest/lib/bucket-b-html.mjs (harness contract)
// Pattern: bucket-b-html.mjs harness contract (Wave 2 design report 2026-05-02)
// Pattern: cl-bulk-data-defensive #18 + no-hallucinated-legal-data
// csv-bulk-checked: none-exists — code.wvlegislature.gov publishes per-section HTML only
//
// WV state statutes seed — Wave 2 Group 3 (Bucket B B-clean cohort, 3-level
// chapter→article→section traversal).
//
// Source: West Virginia Code Chapter 61 (Crimes and Their Punishment).
// Target: entities_statutes (one row per active section).
// Coverage: Chapter 61 only (~250-350 active sections across ~16 articles).
//
// Estimated rows: 250-350 (post repealed-keyword filter at TOC discovery time).
//
// Single-chapter strategy: WV's criminal code lives entirely under Chapter 61,
// so this seeder is a one-chapter cohort. The harness DELETE-then-COPY scopes
// to (jurisdiction='WV', title='61'), making re-runs idempotent.
//
// 2-pass discovery: WV publishes per-article TOC pages (16 articles for
// Chapter 61). The seeder injects a `fetchArticle` async helper into the
// harness config; the wv-html parser drives pass-2 article fetches inside its
// `discoverSections` adapter.
//
// Usage:
//   node scripts/ingest/seed-statutes-wv-chapter61.mjs --dry-run --limit=3
//   node scripts/ingest/seed-statutes-wv-chapter61.mjs --dry-run --verbose
//   node scripts/ingest/seed-statutes-wv-chapter61.mjs            # live full chapter

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

import {
  discoverSections as wvDiscoverSections,
  parseSection as wvParseSection,
  prefetchArticleTocs,
  buildChapterUrl,
  buildArticleUrl,
  buildWVSourceUrl,
} from './lib/wv-html.mjs';
import {
  ingestBucketBState,
  fetchWithRetry,
} from './lib/bucket-b-html.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Env loader (web-repo only, # skip, trim, quote strip) ────────────────
const envPaths = ['C:/Users/email/projects/ImNotAnAttorney-web/.env.local'];
const VALID_KEY_RX = /^[A-Z_][A-Z0-9_]*$/;
for (const p of envPaths) {
  if (!fs.existsSync(p)) continue;
  const txt = fs.readFileSync(p, 'utf-8');
  for (const rawLine of txt.split('\n')) {
    let line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    line = line.trim();
    if (!line || line[0] === '#') continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (val.length >= 2 && ((val[0] === '"' && val[val.length - 1] === '"') ||
        (val[0] === "'" && val[val.length - 1] === "'"))) {
      val = val.slice(1, -1);
    }
    if (!VALID_KEY_RX.test(key)) continue;
    if (!process.env[key]) process.env[key] = val;
  }
}

// ── Coverage: WV Chapter 61 ─────────────────────────────────────────────
export const WV_COHORT_DEFAULT = ['61'];

export const WV_CHAPTER_DESCRIPTIONS = {
  '61': 'Crimes and Their Punishment',
};

// Floor verified 2026-05-02: chapter index lists 16 articles; spot-checked
// article 61-2 (~30 sections) and a handful of others; conservative estimate
// 250-350 active sections across cohort. Floor of 240 leaves ~10-15% headroom
// for parser nulls + repealed-section filter at TOC time.
export const WV_CHAPTER61_ROW_FLOOR = 240;

// ── Authoritative source URL builder ────────────────────────────────────

/**
 * Authoritative source URL builder. WV uses the same per-section URL pattern
 * for both discovery and authoritative storage.
 *
 * @param {string} sectionNum  e.g. "61-2-1", "61-2-9a"
 * @returns {string}
 */
export function buildSourceUrl(sectionNum) {
  return buildWVSourceUrl(sectionNum);
}

// ── Bucket-B parser adapter ──────────────────────────────────────────────

/**
 * Bridge sibling's parseSection(html, sectionNum) -> {titleText, bodyText, effectiveDate}
 * to the harness's parseSection(html, sectionNum) -> {titleText, bodyText} | null.
 */
export function bucketBParse(sectionHtml, sectionNum) {
  const parsed = wvParseSection(sectionHtml, sectionNum);
  if (!parsed) return null;
  return { titleText: parsed.titleText, bodyText: parsed.bodyText };
}

// ── Per-chapter config builder ───────────────────────────────────────────

const ALLOWED_HOSTS = new Set(['code.wvlegislature.gov']);
const CRAWL_DELAY_MS = 1500; // verified 2026-05-02: code.wvlegislature.gov robots.txt has no Crawl-delay
const FETCH_TIMEOUT_MS = 30000;

/**
 * Build a BucketBStateConfig for a WV chapter (in practice always 61).
 *
 * 2-pass discovery: the config injects a `fetchArticle(articleId, articleUrl)`
 * async helper that the wv-html `discoverSections` adapter calls once per
 * article. Each article fetch honors crawl-delay via fetchWithRetry +
 * inline sleep (matches bucket-b-html.fetchSection's per-section pacing).
 *
 * @param {string} chapter  e.g. "61"
 * @param {object} [opts]   { fetchArticle?: Function }  override for tests
 * @returns {object}
 */
export function buildChapterConfig(chapter, opts = {}) {
  const desc = WV_CHAPTER_DESCRIPTIONS[chapter] || `Chapter ${chapter}`;

  // Default live fetcher: HTTPS GET via harness fetchWithRetry, host-locked.
  async function defaultFetchArticle(articleId, articleUrl) {
    let host;
    try { host = new URL(articleUrl).host.toLowerCase(); } catch {
      throw new Error(`invalid article URL: ${articleUrl}`);
    }
    if (!ALLOWED_HOSTS.has(host)) {
      throw new Error(`article URL host ${host} not in allowedHosts`);
    }
    const html = await fetchWithRetry(articleUrl, {
      timeoutMs: FETCH_TIMEOUT_MS,
    });
    // Polite delay between article fetches — same cadence as section fetches
    // so the 16-article pass-2 traversal stays under the harness's overall
    // request budget.
    await new Promise((r) => setTimeout(r, CRAWL_DELAY_MS));
    return html;
  }

  return {
    stateCode: 'WV',
    stateName: 'West Virginia',
    titleNum: chapter,
    titleLabel: desc,
    chapterListUrl: buildChapterUrl(chapter),
    discoverSections: wvDiscoverSections,
    parseSection: bucketBParse,
    buildSourceUrl,
    crawlDelay: 'none',
    crawlDelayMs: CRAWL_DELAY_MS,
    fetchTimeoutMs: FETCH_TIMEOUT_MS,
    allowedHosts: ALLOWED_HOSTS,
    // 2-pass extension — consumed by wv-html.discoverSections, not by the
    // generic harness contract.
    fetchArticle: opts.fetchArticle || defaultFetchArticle,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────

export function parseCliFlags(argv) {
  const out = { dryRun: false, verbose: false, limit: null, chapters: null };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--verbose') out.verbose = true;
    else if (a.startsWith('--limit=')) {
      const n = Number.parseInt(a.slice('--limit='.length), 10);
      if (Number.isInteger(n) && n > 0) out.limit = n;
    } else if (a.startsWith('--chapters=')) {
      const raw = a.slice('--chapters='.length);
      const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
      // WV chapter 61 is the only legal value; reject anything non-numeric.
      const valid = parts.filter((p) => /^\d+$/.test(p));
      if (valid.length > 0) out.chapters = valid;
    }
  }
  return out;
}

// ── Orchestrator ─────────────────────────────────────────────────────────

/**
 * Iterate cohort chapters (in practice always [61]), call ingestBucketBState()
 * per chapter, aggregate.
 */
export async function seedWV(opts = {}) {
  const {
    dryRun = false,
    verbose = false,
    limit = null,
    chapters = null,
    connectionString,
  } = opts;

  const targets = chapters && chapters.length ? chapters : WV_COHORT_DEFAULT;

  console.log(`=== seed-statutes-wv-chapter61 ${new Date().toISOString()} ===`);
  console.log(`  cohort   : [${targets.join(', ')}]`);
  console.log(`  dry-run  : ${dryRun}`);
  console.log(`  limit    : ${limit ?? '(all per chapter)'}`);
  console.log(`  verbose  : ${verbose}`);

  const t0 = Date.now();
  const results = [];
  let totalRows = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const chapter of targets) {
    if (!WV_CHAPTER_DESCRIPTIONS[chapter]) {
      console.warn(`  WARN: chapter ${chapter} not in WV_CHAPTER_DESCRIPTIONS — proceeding anyway`);
    }
    const desc = WV_CHAPTER_DESCRIPTIONS[chapter] || `Chapter ${chapter}`;
    console.log(`\n--- WV Chapter ${chapter} (${desc}) ---`);

    const config = buildChapterConfig(chapter);
    // Pass-1: fetch chapter TOC ourselves so we can pass-2 the article TOCs
    // BEFORE handing control to the harness (harness's discoverSections is
    // synchronous, so async per-article fetches can't happen inside it).
    console.log(`  [pre-fetch] chapter TOC: ${config.chapterListUrl}`);
    const chapterTocHtml = await fetchWithRetry(config.chapterListUrl, {
      timeoutMs: config.fetchTimeoutMs,
    });
    console.log(`  [pre-fetch] aggregating article TOCs (~16 article fetches)`);
    const articleTocs = await prefetchArticleTocs(
      chapterTocHtml,
      chapter,
      config.fetchArticle,
    );
    console.log(`  [pre-fetch] ${articleTocs.size} article TOCs cached`);
    config.articleTocs = articleTocs;

    try {
      const r = await ingestBucketBState(config, {
        dryRun,
        verbose,
        limit,
        connectionString,
      });
      results.push({
        chapter,
        rowCount: r.rowCount,
        skipCount: r.skipCount,
        errorCount: r.errorCount,
        durationMs: r.durationMs,
        ok: true,
      });
      totalRows += r.rowCount;
      totalSkipped += r.skipCount;
      totalErrors += r.errorCount;
    } catch (err) {
      console.error(`  FAIL chapter ${chapter}: ${err.message}`);
      results.push({
        chapter,
        rowCount: 0,
        skipCount: 0,
        errorCount: 0,
        durationMs: 0,
        ok: false,
        error: err.message,
      });
    }
  }

  const totalDurationMs = Date.now() - t0;

  console.log('\n=== Summary ===');
  for (const r of results) {
    const status = r.ok ? 'OK ' : 'FAIL';
    console.log(`  ${status}  ch ${r.chapter.padEnd(5)} rows=${r.rowCount} skip=${r.skipCount} err=${r.errorCount} ${r.durationMs}ms${r.error ? ` — ${r.error}` : ''}`);
  }
  console.log(`  TOTAL   rows=${totalRows} skip=${totalSkipped} err=${totalErrors} ${totalDurationMs}ms`);

  return {
    chapters: results,
    totalRows,
    totalSkipped,
    totalErrors,
    totalDurationMs,
  };
}

async function main() {
  const flags = parseCliFlags(process.argv.slice(2));
  const out = await seedWV(flags);

  // Smoke gate: at least one chapter must produce ≥1 row.
  if (out.totalRows < 1) {
    console.error('\nFAIL: 0 rows across cohort — harness or adapter broken');
    process.exit(1);
  }

  // Production-floor gate: only enforced on full live runs (no --limit, no --dry-run).
  if (!flags.dryRun && flags.limit == null && out.totalRows < WV_CHAPTER61_ROW_FLOOR) {
    console.error(`\nFAIL: total rows ${out.totalRows} below WV floor ${WV_CHAPTER61_ROW_FLOOR}`);
    process.exit(1);
  }

  console.log('\nDONE');
  process.exit(0);
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try { return import.meta.url === pathToFileURL(process.argv[1]).href; }
  catch { return false; }
})();
if (invokedDirectly) main().catch((e) => {
  console.error('FATAL:', e?.message || e);
  if (e?.stack) console.error(e.stack);
  process.exit(1);
});

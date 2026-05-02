#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-ma-criminal.mjs (Bucket B per-chapter cohort shape)
// Template: scripts/ingest/seed-statutes-ma-title1-smoke.mjs (smoke driver)
// Pattern: bucket-b-html.mjs harness contract (Wave 2 design report 2026-05-02)
// Pattern: cl-bulk-data-defensive #18 + no-hallucinated-legal-data
// csv-bulk-checked: none-exists — revisor.mn.gov publishes per-section HTML only
//
// MN state statutes seed — Wave 2 Group 1 (Bucket B B-clean cohort).
// Source: Minnesota Statutes Chapter 609 (Criminal Code).
// Target: entities_statutes (one row per active section).
// Coverage: Chapter 609 only (~300 active sections after TOC inactive filter).
//
// Estimated rows: ~280-320 (440 raw TOC links - 64 inactive markers).
//
// Single-chapter strategy: MN's criminal code lives entirely under Chapter 609,
// so this seeder is a one-chapter cohort. The harness DELETE-then-COPY scopes
// to (jurisdiction='MN', title='609'), making re-runs idempotent.
//
// Usage:
//   node scripts/ingest/seed-statutes-mn-chapter609.mjs --dry-run --limit=3
//   node scripts/ingest/seed-statutes-mn-chapter609.mjs --dry-run --verbose
//   node scripts/ingest/seed-statutes-mn-chapter609.mjs            # live full chapter

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

import {
  discoverSectionUrls as mnDiscoverSectionUrls,
  parseSection as mnParseSection,
  sectionIdFromUrl,
  buildChapterUrl,
  buildMNSourceUrl,
} from './lib/mn-html.mjs';
import { ingestBucketBState } from './lib/bucket-b-html.mjs';

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

// ── Coverage: MN Chapter 609 ─────────────────────────────────────────────
export const MN_COHORT_DEFAULT = ['609'];

export const MN_CHAPTER_DESCRIPTIONS = {
  '609': 'Criminal Code',
};

// Floor verified 2026-05-02: TOC has 440 raw section links, ~64 marked
// inactive (renumbered/repealed), so ~376 active descriptors expected.
// Set conservative floor at 280 to allow for content-side parser nulls
// (sr_by_subd shells, short body skips).
export const MN_CHAPTER609_ROW_FLOOR = 280;

// ── Adapter: sibling MN parser → BucketBStateConfig contract ─────────────

/**
 * Bridge sibling's discoverSectionUrls(html, chapter) -> string[]
 * to the harness's discoverSections(tocHtml, config) -> Descriptor[] shape.
 */
export function bucketBDiscover(tocHtml, config) {
  const urls = mnDiscoverSectionUrls(tocHtml, config.titleNum);
  return urls.map((u) => {
    const sectionNum = sectionIdFromUrl(u);  // "609.02", "609.2112"
    return {
      sectionNum,
      chapterNum: config.titleNum,
      sectionUrl: u,
    };
  });
}

/**
 * Bridge sibling's parseSection(html, sectionNum) -> {titleText, bodyText, effectiveDate}
 * to the harness's parseSection(html, sectionNum) -> {titleText, bodyText} | null.
 */
export function bucketBParse(sectionHtml, sectionNum) {
  const parsed = mnParseSection(sectionHtml, sectionNum);
  if (!parsed) return null;
  return { titleText: parsed.titleText, bodyText: parsed.bodyText };
}

/**
 * Authoritative source URL builder. MN uses the same per-section URL pattern
 * for both discovery and authoritative storage — no canonical permalink shape
 * differs from the discovered URL.
 *
 * @param {string} sectionNum  e.g. "609.02"
 * @returns {string}
 */
export function buildSourceUrl(sectionNum) {
  return buildMNSourceUrl(sectionNum);
}

// ── Per-chapter config builder ───────────────────────────────────────────

const ALLOWED_HOSTS = new Set(['www.revisor.mn.gov', 'revisor.mn.gov']);
const CRAWL_DELAY_MS = 1500; // verified 2026-05-02: revisor.mn.gov robots.txt has no Crawl-delay
const FETCH_TIMEOUT_MS = 30000;

/**
 * Build a BucketBStateConfig for an MN chapter (in practice always 609).
 *
 * @param {string} chapter  e.g. "609"
 * @returns {object}
 */
export function buildChapterConfig(chapter) {
  const desc = MN_CHAPTER_DESCRIPTIONS[chapter] || `Chapter ${chapter}`;
  return {
    stateCode: 'MN',
    stateName: 'Minnesota',
    titleNum: chapter,
    titleLabel: desc,
    chapterListUrl: buildChapterUrl(chapter),
    discoverSections: bucketBDiscover,
    parseSection: bucketBParse,
    buildSourceUrl,
    crawlDelay: 'none',
    crawlDelayMs: CRAWL_DELAY_MS,
    fetchTimeoutMs: FETCH_TIMEOUT_MS,
    allowedHosts: ALLOWED_HOSTS,
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
      // MN chapter 609 is the only legal value; reject anything non-numeric.
      const valid = parts.filter((p) => /^\d+$/.test(p));
      if (valid.length > 0) out.chapters = valid;
    }
  }
  return out;
}

// ── Orchestrator ─────────────────────────────────────────────────────────

/**
 * Iterate cohort chapters (in practice always [609]), call ingestBucketBState()
 * per chapter, aggregate.
 */
export async function seedMN(opts = {}) {
  const {
    dryRun = false,
    verbose = false,
    limit = null,
    chapters = null,
    connectionString,
  } = opts;

  const targets = chapters && chapters.length ? chapters : MN_COHORT_DEFAULT;

  console.log(`=== seed-statutes-mn-chapter609 ${new Date().toISOString()} ===`);
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
    if (!MN_CHAPTER_DESCRIPTIONS[chapter]) {
      console.warn(`  WARN: chapter ${chapter} not in MN_CHAPTER_DESCRIPTIONS — proceeding anyway`);
    }
    const desc = MN_CHAPTER_DESCRIPTIONS[chapter] || `Chapter ${chapter}`;
    console.log(`\n--- MN Chapter ${chapter} (${desc}) ---`);

    const config = buildChapterConfig(chapter);
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
  const out = await seedMN(flags);

  // Smoke gate: at least one chapter must produce ≥1 row.
  if (out.totalRows < 1) {
    console.error('\nFAIL: 0 rows across cohort — harness or adapter broken');
    process.exit(1);
  }

  // Production-floor gate: only enforced on full live runs (no --limit, no --dry-run).
  if (!flags.dryRun && flags.limit == null && out.totalRows < MN_CHAPTER609_ROW_FLOOR) {
    console.error(`\nFAIL: total rows ${out.totalRows} below MN floor ${MN_CHAPTER609_ROW_FLOOR}`);
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

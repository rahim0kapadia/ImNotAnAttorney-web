#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-ma-title1-smoke.mjs (smoke driver)
// Template: scripts/ingest/seed-statutes-va.mjs (full-state seeder shape — env loader, summary block)
// Pattern: bucket-b-html.mjs harness contract (Wave 2 design report 2026-05-02)
// Pattern: cl-bulk-data-defensive #18 + no-hallucinated-legal-data
// csv-bulk-checked: none-exists — malegislature.gov publishes per-section HTML only
//
// MA state statutes seed — Wave 2 first state (Bucket B B-clean cohort).
// Source: Massachusetts General Laws Part IV Title I (Crimes & Punishments).
// Target: entities_statutes (one row per section).
// Coverage cohort (default): Chapters 265 (Crimes Against the Person), 266 (Property),
//   268 (Public Justice), 269 (Disturbing Public Peace), 272 (Morals/Order).
//
// Estimated rows: ~700-900 across the 5-chapter cohort (Wave 2 design report).
//
// Per-chapter strategy: this seeder iterates the cohort and calls
// `ingestBucketBState()` once per chapter. The harness's DELETE-then-COPY is
// scoped per-chapter via `(jurisdiction, title)`, so each chapter is its own
// idempotent transaction — partial cohort runs are safe and re-runnable.
//
// Usage:
//   node scripts/ingest/seed-statutes-ma-criminal.mjs --dry-run --limit=3
//   node scripts/ingest/seed-statutes-ma-criminal.mjs --chapters=265 --dry-run
//   node scripts/ingest/seed-statutes-ma-criminal.mjs --chapters=265,266 --verbose
//   node scripts/ingest/seed-statutes-ma-criminal.mjs            # live full cohort

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

import {
  discoverSectionUrls,
  parseSection as maParseSection,
  sectionIdFromUrl,
  buildChapterUrl,
} from './lib/ma-html.mjs';
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

// ── Coverage: MA Part IV Title I cohort ──────────────────────────────────
// Each chapter is ingested as a separate harness call with its own titleNum,
// so DELETE-then-COPY scopes per-chapter. Cohort selection per Wave 2 design
// report 2026-05-02; chapter labels are STRINGS (MA uses 268A etc.).
export const MA_COHORT_DEFAULT = ['265', '266', '268', '269', '272'];

export const MA_CHAPTER_DESCRIPTIONS = {
  '263': 'Rights of Persons Accused of Crime',
  '264': 'Crimes Against Governments',
  '265': 'Crimes Against the Person',
  '266': 'Crimes Against Property',
  '267': 'Forgery and Crimes Against the Currency',
  '268': 'Crimes Against Public Justice',
  '268A': 'Conduct of Public Officers and Employees',
  '269': 'Crimes Against Public Peace',
  '270': 'Crimes Against Public Health',
  '271': 'Crimes Against Public Policy',
  '272': 'Crimes Against Chastity, Morality, Decency and Good Order',
  '274': 'Felonies, Accessories and Attempts to Commit Crimes',
};

// ── Adapter: sibling MA parser → BucketBStateConfig contract ─────────────

/**
 * Bridge sibling's discoverSectionUrls(html, chapterUrl) -> string[]
 * to the harness's discoverSections(tocHtml, config) -> Descriptor[] shape.
 */
export function bucketBDiscover(tocHtml, config) {
  const chapterUrl = config.chapterListUrl;
  const urls = discoverSectionUrls(tocHtml, chapterUrl);
  return urls.map((u) => {
    const sectionNum = sectionIdFromUrl(u);     // "265-1", "265-13A", "265-6_to_8"
    const dash = sectionNum.indexOf('-');
    return {
      sectionNum,
      chapterNum: dash > 0 ? sectionNum.slice(0, dash) : config.titleNum,
      sectionUrl: u,
    };
  });
}

/**
 * Bridge sibling's parseSection(html, ctx) -> {titleText, bodyText, effectiveDate}
 * to the harness's parseSection(html, sectionNum) -> {titleText, bodyText} | null.
 */
export function bucketBParse(sectionHtml, sectionNum) {
  const parsed = maParseSection(sectionHtml, { sectionId: sectionNum, sectionUrl: '' });
  if (!parsed) return null;
  return { titleText: parsed.titleText, bodyText: parsed.bodyText };
}

/**
 * Build authoritative source URL stored in source_urls[].
 * Section format: "265-1" -> .../Chapter265/Section1
 *                 "265-13A" -> .../Chapter265/Section13A
 *                 "265-6_to_8" -> .../Chapter265/Section6%20to%208
 *                 "268A-1" -> .../Chapter268A/Section1
 */
export function buildSourceUrl(sectionNum) {
  const dash = sectionNum.indexOf('-');
  if (dash < 0) return `https://malegislature.gov/Laws/GeneralLaws/PartIV/TitleI/Chapter${sectionNum}`;
  const chap = sectionNum.slice(0, dash);
  const sec = sectionNum.slice(dash + 1).split('_').join('%20');
  return `https://malegislature.gov/Laws/GeneralLaws/PartIV/TitleI/Chapter${chap}/Section${sec}`;
}

// ── Per-chapter config builder ───────────────────────────────────────────

const ALLOWED_HOSTS = new Set(['malegislature.gov', 'www.malegislature.gov']);
const CRAWL_DELAY_MS = 1500; // verified 2026-05-02: malegislature.gov robots.txt has no Crawl-delay
const FETCH_TIMEOUT_MS = 30000;

/**
 * Build a BucketBStateConfig for a single MA chapter. Each chapter is its own
 * harness call so DELETE-then-COPY scopes per-chapter.
 *
 * @param {string} chapter  e.g. "265", "268A"
 * @returns {object}
 */
export function buildChapterConfig(chapter) {
  const desc = MA_CHAPTER_DESCRIPTIONS[chapter] || `Chapter ${chapter}`;
  return {
    stateCode: 'MA',
    stateName: 'Massachusetts',
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
      // MA chapter labels are strings (allow "268A"). Reject empties & whitespace.
      const valid = parts.filter((p) => /^\d+[A-Z]?$/.test(p));
      if (valid.length > 0) out.chapters = valid;
    }
  }
  return out;
}

// ── Orchestrator ─────────────────────────────────────────────────────────

/**
 * Iterate cohort chapters, call ingestBucketBState() per chapter, aggregate.
 *
 * @param {{dryRun?:boolean, verbose?:boolean, limit?:number|null,
 *          chapters?:string[]|null, connectionString?:string}} opts
 * @returns {Promise<{
 *   chapters: Array<{chapter:string, rowCount:number, skipCount:number, errorCount:number, durationMs:number, ok:boolean, error?:string}>,
 *   totalRows: number,
 *   totalSkipped: number,
 *   totalErrors: number,
 *   totalDurationMs: number,
 * }>}
 */
export async function seedMA(opts = {}) {
  const {
    dryRun = false,
    verbose = false,
    limit = null,
    chapters = null,
    connectionString,
  } = opts;

  const targets = chapters && chapters.length ? chapters : MA_COHORT_DEFAULT;

  console.log(`=== seed-statutes-ma-criminal ${new Date().toISOString()} ===`);
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
    if (!MA_CHAPTER_DESCRIPTIONS[chapter]) {
      console.warn(`  WARN: chapter ${chapter} not in MA_CHAPTER_DESCRIPTIONS — proceeding anyway`);
    }
    const desc = MA_CHAPTER_DESCRIPTIONS[chapter] || `Chapter ${chapter}`;
    console.log(`\n--- MA Chapter ${chapter} (${desc}) ---`);

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
  const out = await seedMA(flags);

  // Smoke gate: at least one chapter in the cohort must produce ≥1 row,
  // otherwise discovery / parser bridge is broken.
  if (out.totalRows < 1) {
    console.error('\nFAIL: 0 rows across cohort — harness or adapter broken');
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

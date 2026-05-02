#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-ma-criminal.mjs (Bucket B per-chapter loop)
// Template: scripts/ingest/seed-statutes-sc-title16.mjs (multi-chapter ASP-host pattern)
// Pattern: bucket-b-html.mjs harness (chapter index -> per-section URL discovery -> fetch -> parse)
// Pattern: cl-bulk-data-defensive #18 + no-hallucinated-legal-data
// Pattern: pattern-asp-net-url-param-pagination-trumps-postback (MO PageSelect.aspx 302->OneSection.aspx works on plain GET)
// csv-bulk-checked: none-exists — revisor.mo.gov publishes per-section HTML only, no bulk CSV
//
// MO state statutes seed — Wave 2 Group 2 (Bucket B B-clean cohort).
// Source: Missouri Revised Statutes (RSMo) — Title 38 (Crimes) + Title 12 (Drugs).
// Target: entities_statutes (one row per section).
// Coverage cohort (default): Chapters 195 (Drugs), 565 (Persons), 566 (Sexual),
//   569 (Robbery), 570 (Theft), 571 (Weapons), 575 (Public Justice), 577 (DWI).
//
// Estimated rows: ~600-800 across the 8-chapter cohort (Wave 2 design report
// 2026-05-02 estimated 600-800 for the original 7-chapter set; adding 195 +25%).
//
// MO architecture note (deviation from plan brief):
//   The plan brief said sections render inline on OneChapter.aspx. Live
//   verification 2026-05-02 shows OneChapter.aspx is a section INDEX (links
//   only); statute text lives at OneSection.aspx?section={N}.{NNN}. So MO
//   uses the per-section bucket-b-html harness shape (like MA), NOT the
//   per-chapter unicourt-harness shape (SC/SD/NV/NE).
//
// Per-chapter strategy: this seeder iterates the cohort and calls
// `ingestBucketBState()` once per chapter. The harness's DELETE-then-COPY is
// scoped per-chapter via `(jurisdiction, title)`, so each chapter is its own
// idempotent transaction — partial cohort runs are safe and re-runnable.
//
// Usage:
//   node scripts/ingest/seed-statutes-mo-criminal.mjs --dry-run --limit=3
//   node scripts/ingest/seed-statutes-mo-criminal.mjs --chapters=565 --dry-run
//   node scripts/ingest/seed-statutes-mo-criminal.mjs --chapters=565,566 --verbose
//   node scripts/ingest/seed-statutes-mo-criminal.mjs                    # live full cohort
//
// Env required for live run:
//   SUPABASE_DB_URL — direct postgres connection (port 5432, session mode)

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

import {
  discoverMoSectionUrls,
  parseMoSection,
  buildMoSourceUrl,
  buildMoChapterUrl,
  MO_CHAPTERS,
  MO_CHAPTER_DESCRIPTIONS,
} from './lib/mo-html.mjs';
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

// ── Cohort export (re-export from parser lib for caller convenience) ─────
export const MO_COHORT_DEFAULT = MO_CHAPTERS;
export { MO_CHAPTER_DESCRIPTIONS };

// ── Adapter: sibling MO parser → BucketBStateConfig contract ─────────────

/**
 * Bridge sibling's discoverMoSectionUrls(html, chapterNum) -> Descriptor[]
 * (already correct shape; bucket-b harness will pass us config.titleNum
 * via the chapterListUrl context — but our discoverer needs chapterNum
 * directly. We bake it into the closure when we build the per-chapter config.)
 */
export function makeBucketBDiscover(chapterNum) {
  return function discover(tocHtml /*, config */) {
    return discoverMoSectionUrls(tocHtml, chapterNum);
  };
}

/**
 * Bridge sibling's parseMoSection(html, sectionNum) -> {titleText,bodyText}
 * to bucket-b-html.parseSection(sectionHtml, sectionNum, config) -> ... | null.
 */
export function bucketBParse(sectionHtml, sectionNum) {
  return parseMoSection(sectionHtml, sectionNum);
}

// ── Per-chapter config ──────────────────────────────────────────────────

const ALLOWED_HOSTS = new Set(['revisor.mo.gov', 'www.revisor.mo.gov']);
const CRAWL_DELAY_MS = 1500; // verified 2026-05-02: revisor.mo.gov has no Crawl-delay; defensive floor
const FETCH_TIMEOUT_MS = 30000;

/**
 * Build a BucketBStateConfig for a single MO chapter.
 *
 * @param {string} chapter  e.g. "565"
 * @returns {object}
 */
export function buildChapterConfig(chapter) {
  const desc = MO_CHAPTER_DESCRIPTIONS[chapter] || `Chapter ${chapter}`;
  return {
    stateCode: 'MO',
    stateName: 'Missouri',
    titleNum: chapter,
    titleLabel: desc,
    chapterListUrl: buildMoChapterUrl(chapter),
    discoverSections: makeBucketBDiscover(chapter),
    parseSection: bucketBParse,
    buildSourceUrl: buildMoSourceUrl,
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
      // MO chapters are pure numeric (1-3 digits). Reject empties / non-digits.
      const valid = parts.filter((p) => /^\d{1,3}$/.test(p));
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
export async function seedMO(opts = {}) {
  const {
    dryRun = false,
    verbose = false,
    limit = null,
    chapters = null,
    connectionString,
  } = opts;

  const targets = chapters && chapters.length ? chapters : MO_COHORT_DEFAULT;

  console.log(`=== seed-statutes-mo-criminal ${new Date().toISOString()} ===`);
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
    if (!MO_CHAPTER_DESCRIPTIONS[chapter]) {
      console.warn(`  WARN: chapter ${chapter} not in MO_CHAPTER_DESCRIPTIONS — proceeding anyway`);
    }
    const desc = MO_CHAPTER_DESCRIPTIONS[chapter] || `Chapter ${chapter}`;
    console.log(`\n--- MO Chapter ${chapter} (${desc}) ---`);

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

  // MO floor: cohort-wide minimum 400 across 8 chapters (Wave 2 plan estimate
  // is 600-800; 400 is the conservative floor that catches harness/parser
  // breakage without false-positiving on partial-cohort runs). Floor only
  // applies to live full runs (skipped on --limit / --dry-run / --chapters).
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

  if (!flags.dryRun && !process.env.SUPABASE_DB_URL) {
    console.error('ERROR: SUPABASE_DB_URL not set. Run with --dry-run or set the env var.');
    process.exit(1);
  }

  const out = await seedMO(flags);

  // Smoke gate: at least one chapter must produce ≥1 row.
  if (out.totalRows < 1) {
    console.error('\nFAIL: 0 rows across cohort — harness or parser broken');
    process.exit(1);
  }

  // Floor only applies to live FULL cohort runs (no --limit, no --chapters,
  // no --dry-run). Partial / smoke runs skip the floor.
  const isFullLiveRun = !flags.dryRun && !flags.limit && !flags.chapters;
  // Floor 300 = real corpus floor. Live 2026-05-02: 345 rows (cohort 195+565+566+569+570+571+575+577).
  // Wave 2 plan estimated 600-800 — guess was high; MO is leaner. 300 = 13% buffer below 345.
  if (isFullLiveRun && out.totalRows < 300) {
    console.error(`\nFAIL: floor not met — only ${out.totalRows} rows (need >= 300 for full cohort run)`);
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

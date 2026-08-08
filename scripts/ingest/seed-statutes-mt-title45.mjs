#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-mn-chapter609.mjs (Bucket B single-cohort shape)
// Pattern: bucket-b-html.mjs harness contract (Wave 2 design report 2026-05-02)
// Pattern: cl-bulk-data-defensive #18 + no-hallucinated-legal-data
// csv-bulk-checked: none-exists — mca.legmt.gov publishes per-section HTML only
//
// MT state statutes seed — Wave 2 Group 3 (Bucket B B-quirky cohort).
// Source: Montana Code Annotated Title 45 (Crimes).
// Target: entities_statutes (one row per active section).
// Coverage: All 10 chapters of Title 45 (~400-500 active sections estimated).
//
// Single-title strategy: MT requires a 3-level pre-walk
//   chapters_index → per-chapter parts_index → per-part sections_index → section page
// before the harness can apply DELETE-then-COPY at (jurisdiction, title='45') scope.
// The harness's `discoverSections` is sync-only (verified bucket-b-html.mjs:301
// — call is NOT awaited). We therefore pre-walk in this seeder using
// `fetchWithRetry` exported from the harness, aggregate the descriptor list +
// section URL Map, then call `ingestBucketBState` ONCE with the title's full
// descriptor list returned synchronously from a closure.
//
// Akamai prefix: every page on mca.legmt.gov has an `<APM_DO_NOT_TOUCH>` JS
// block (Akamai Bot Manager). Server-side rendering still includes the full
// statute text. Crawl-delay floor 2500ms is set conservatively to stay below
// Akamai rate thresholds.
//
// Routing: vercel-cron-safe at smoke runs (--limit=3 < 60s); full-title live
// run (~21min) routes to engine-only.
//
// Usage:
//   node scripts/ingest/seed-statutes-mt-title45.mjs --dry-run --limit=3
//   node scripts/ingest/seed-statutes-mt-title45.mjs --dry-run --verbose
//   node scripts/ingest/seed-statutes-mt-title45.mjs            # live full title (engine only)

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

import {
  buildChapterListUrl,
  buildPartsIndexUrl,
  buildSectionsIndexUrl,
  buildSectionUrl,
  discoverChapterUrls,
  discoverPartUrls,
  discoverSectionUrls as mtDiscoverSectionUrls,
  parseSection as mtParseSection,
} from './lib/mt-html.mjs';
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

// ── Coverage: MT Title 45 ────────────────────────────────────────────────
//
// Seeder iterates a single-element cohort `['45']` because Title 45 is
// ingested as ONE harness call (DELETE-then-COPY scoped to
// jurisdiction='MT', title='45'). The 3-level pre-walk happens INSIDE the
// single iteration — see `prewalkTitle45` below.
export const MT_COHORT_DEFAULT = ['45'];

export const MT_CHAPTER_DESCRIPTIONS = {
  '1': 'General Preliminary Provisions',
  '2': 'General Principles of Liability',
  '3': 'Justifiable Use of Force',
  '4': 'Inchoate Offenses',
  '5': 'Offenses Against the Person',
  '6': 'Offenses Against Property',
  '7': 'Offenses Against Public Administration',
  '8': 'Offenses Against Public Order',
  '9': 'Dangerous Drugs',
  '10': 'Reserved/Misc',
};

// Floor verified 2026-05-02: design report estimates ~400-500 active sections
// across 10 chapters. Conservative floor at 250 absorbs (a) sections marked
// repealed at the page level, (b) parser nulls on edge-case bodies, (c) unknown
// chapter 10 row count. Tighten on first live run if observed count > 350.
export const MT_TITLE45_ROW_FLOOR = 250;

// ── Crawl + fetch policy ─────────────────────────────────────────────────
const ALLOWED_HOSTS = new Set(['mca.legmt.gov']);
const CRAWL_DELAY_MS = 2500; // Akamai-conservative; design report HARD floor 2500ms
const FETCH_TIMEOUT_MS = 45000; // Akamai-fronted hosts pause 5-15s — absorb without retry storm
const USER_AGENT =
  'Mozilla/5.0 (compatible; INAA-legal-research/1.0; +https://imnotanattorney.com/about)';

// ── Pre-walk discovery (the MT quirk) ────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Perform the 3-level title→chapter→part pre-walk to aggregate every section
 * descriptor across Title 45.
 *
 * Returns:
 *   {
 *     descriptors: BucketBSectionDescriptor[]   // for harness consumption
 *     sectionUrlMap: Map<sectionNum, sectionUrl> // for buildSourceUrl closure
 *     chapterCount, partCount, sectionCount      // for summary logging
 *   }
 *
 * Honors crawlDelayMs between every fetch. Skips chapters whose parts_index
 * is missing (gives chapter 10 graceful fallback if it's reserved).
 *
 * @param {{verbose?: boolean, limit?: number, chapterFilter?: string[]}} opts
 */
export async function prewalkTitle45(opts = {}) {
  const { verbose = false, limit = null, chapterFilter = null } = opts;

  const tocUrl = buildChapterListUrl();
  console.log(`[prewalk] fetching title TOC: ${tocUrl}`);
  const tocHtml = await fetchWithRetry(tocUrl, {
    timeoutMs: FETCH_TIMEOUT_MS,
    userAgent: USER_AGENT,
  });
  await sleep(CRAWL_DELAY_MS);

  let chapterEntries = discoverChapterUrls(tocHtml);
  if (chapterFilter && chapterFilter.length) {
    const want = new Set(chapterFilter.map(String));
    chapterEntries = chapterEntries.filter((c) => want.has(c.chapter));
  }
  console.log(`[prewalk] discovered ${chapterEntries.length} chapter(s)`);

  const descriptors = [];
  const sectionUrlMap = new Map();
  let partCount = 0;
  let sectionCount = 0;

  for (const ch of chapterEntries) {
    if (limit != null && descriptors.length >= limit) break;
    const partsUrl = buildPartsIndexUrl(ch.chapter);
    if (verbose) console.log(`[prewalk] chapter ${ch.chapter}: ${partsUrl}`);
    let partsHtml;
    try {
      partsHtml = await fetchWithRetry(partsUrl, {
        timeoutMs: FETCH_TIMEOUT_MS,
        userAgent: USER_AGENT,
      });
    } catch (err) {
      console.warn(`  [prewalk] chapter ${ch.chapter} parts_index fetch failed: ${err.message}`);
      continue;
    }
    await sleep(CRAWL_DELAY_MS);

    const parts = discoverPartUrls(partsHtml, ch.chapter);
    partCount += parts.length;
    if (verbose) console.log(`  chapter ${ch.chapter}: ${parts.length} part(s)`);

    for (const pt of parts) {
      if (limit != null && descriptors.length >= limit) break;
      const secUrl = buildSectionsIndexUrl(pt.chapter, pt.part);
      let secHtml;
      try {
        secHtml = await fetchWithRetry(secUrl, {
          timeoutMs: FETCH_TIMEOUT_MS,
          userAgent: USER_AGENT,
        });
      } catch (err) {
        console.warn(`    [prewalk] part ${pt.chapter}-${pt.part} sections_index fetch failed: ${err.message}`);
        continue;
      }
      await sleep(CRAWL_DELAY_MS);

      const sections = mtDiscoverSectionUrls(secHtml, {
        chapter: pt.chapter,
        part: pt.part,
      });
      sectionCount += sections.length;
      if (verbose) console.log(`    part ${pt.chapter}-${pt.part}: ${sections.length} section(s)`);

      for (const s of sections) {
        if (sectionUrlMap.has(s.sectionNum)) continue;
        sectionUrlMap.set(s.sectionNum, s.url);
        descriptors.push({
          sectionNum: s.sectionNum,
          chapterNum: s.chapter,
          sectionUrl: s.url,
        });
        if (limit != null && descriptors.length >= limit) break;
      }
    }
  }

  console.log(
    `[prewalk] complete: ${chapterEntries.length} chapters, ${partCount} parts, ${sectionCount} sections, ${descriptors.length} unique descriptors`,
  );
  return {
    descriptors,
    sectionUrlMap,
    chapterCount: chapterEntries.length,
    partCount,
    sectionCount,
  };
}

// ── Adapters: pre-built descriptor list → harness sync contract ──────────

/**
 * Build a `discoverSections` closure that ignores the input HTML and returns
 * the pre-built descriptor list synchronously. The harness re-fetches
 * `chapterListUrl` once before calling this — that fetch is cheap (~30KB)
 * and its result is discarded. This keeps the harness contract intact
 * (no edits to bucket-b-html.mjs) while letting the seeder own the multi-fetch
 * orchestration.
 *
 * @param {Array} descriptors
 */
export function buildDiscoverClosure(descriptors) {
  return function discoverSectionsClosure(_tocHtml, _config) {
    return descriptors;
  };
}

/**
 * Build a `parseSection` adapter for the harness — wraps mtParseSection and
 * coerces the output to the harness shape `{titleText, bodyText} | null`.
 */
export function bucketBParse(sectionHtml, sectionNum) {
  const parsed = mtParseSection(sectionHtml, sectionNum);
  if (!parsed) return null;
  return { titleText: parsed.titleText, bodyText: parsed.bodyText };
}

/**
 * Build a `buildSourceUrl` closure that consults the pre-built section URL Map.
 * MT canonical citations omit the part identifier (45-5-102), but the URL
 * embeds part. Map populated at pre-walk time bridges the gap.
 *
 * @param {Map<string, string>} sectionUrlMap
 */
export function buildSourceUrlClosure(sectionUrlMap) {
  return function buildSourceUrl(sectionNum) {
    const u = sectionUrlMap.get(sectionNum);
    if (!u) {
      throw new Error(`buildSourceUrl: no URL in map for section ${sectionNum}`);
    }
    return u;
  };
}

// ── Title-level config builder ───────────────────────────────────────────

/**
 * Build a BucketBStateConfig for MT Title 45.
 *
 * The seeder pre-walks the title BEFORE calling this — descriptors and
 * sectionUrlMap are passed in. The harness re-fetches chapterListUrl once
 * (its result is discarded by the discoverSections closure).
 *
 * @param {Array} descriptors
 * @param {Map<string, string>} sectionUrlMap
 */
export function buildTitleConfig(descriptors, sectionUrlMap) {
  return {
    stateCode: 'MT',
    stateName: 'Montana',
    titleNum: '45',
    titleLabel: 'Title 45 — Crimes',
    chapterListUrl: buildChapterListUrl(),
    discoverSections: buildDiscoverClosure(descriptors),
    parseSection: bucketBParse,
    buildSourceUrl: buildSourceUrlClosure(sectionUrlMap),
    crawlDelay: 'none',
    crawlDelayMs: CRAWL_DELAY_MS,
    fetchTimeoutMs: FETCH_TIMEOUT_MS,
    allowedHosts: ALLOWED_HOSTS,
    userAgent: USER_AGENT,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────

export function parseCliFlags(argv) {
  const out = {
    dryRun: false,
    verbose: false,
    limit: null,
    chapters: null,
  };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--verbose') out.verbose = true;
    else if (a.startsWith('--limit=')) {
      const n = Number.parseInt(a.slice('--limit='.length), 10);
      if (Number.isInteger(n) && n > 0) out.limit = n;
    } else if (a.startsWith('--chapters=')) {
      const raw = a.slice('--chapters='.length);
      const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
      // MT chapters 1..10 only
      const valid = parts.filter((p) => /^\d+$/.test(p) && Number(p) >= 1 && Number(p) <= 10);
      if (valid.length > 0) out.chapters = valid;
    }
  }
  return out;
}

// ── Orchestrator ─────────────────────────────────────────────────────────

/**
 * Main seed entry point. Single-cohort execution: pre-walk Title 45, then
 * call ingestBucketBState() ONCE with the aggregated descriptor list.
 */
export async function seedMT(opts = {}) {
  const {
    dryRun = false,
    verbose = false,
    limit = null,
    chapters = null,
    connectionString,
  } = opts;

  console.log(`=== seed-statutes-mt-title45 ${new Date().toISOString()} ===`);
  console.log(`  cohort   : [${MT_COHORT_DEFAULT.join(', ')}]`);
  console.log(`  dry-run  : ${dryRun}`);
  console.log(`  limit    : ${limit ?? '(all)'}`);
  console.log(`  verbose  : ${verbose}`);
  console.log(`  chapters : ${chapters ? chapters.join(',') : '(all)'}`);

  const t0 = Date.now();

  // Pre-walk title → chapters → parts → sections
  const { descriptors, sectionUrlMap, chapterCount, partCount, sectionCount } =
    await prewalkTitle45({ verbose, limit, chapterFilter: chapters });

  if (descriptors.length === 0) {
    console.error('FAIL: pre-walk produced 0 descriptors');
    return {
      chapters: [],
      totalRows: 0,
      totalSkipped: 0,
      totalErrors: 0,
      totalDurationMs: Date.now() - t0,
    };
  }

  const config = buildTitleConfig(descriptors, sectionUrlMap);

  let result;
  try {
    result = await ingestBucketBState(config, {
      dryRun,
      verbose,
      limit,
      connectionString,
    });
  } catch (err) {
    console.error(`FAIL: ingest title 45: ${err.message}`);
    return {
      chapters: [{
        chapter: '45',
        rowCount: 0,
        skipCount: 0,
        errorCount: 0,
        durationMs: 0,
        ok: false,
        error: err.message,
      }],
      totalRows: 0,
      totalSkipped: 0,
      totalErrors: 0,
      totalDurationMs: Date.now() - t0,
    };
  }

  const totalDurationMs = Date.now() - t0;

  console.log('\n=== Summary ===');
  console.log(`  pre-walk   : ${chapterCount} chapters, ${partCount} parts, ${sectionCount} section links`);
  console.log(`  descriptors: ${descriptors.length}`);
  console.log(`  rows       : ${result.rowCount}`);
  console.log(`  skipped    : ${result.skipCount}`);
  console.log(`  errors     : ${result.errorCount}`);
  console.log(`  total      : ${totalDurationMs}ms`);

  return {
    chapters: [{
      chapter: '45',
      rowCount: result.rowCount,
      skipCount: result.skipCount,
      errorCount: result.errorCount,
      durationMs: result.durationMs,
      ok: true,
    }],
    totalRows: result.rowCount,
    totalSkipped: result.skipCount,
    totalErrors: result.errorCount,
    totalDurationMs,
  };
}

async function main() {
  const flags = parseCliFlags(process.argv.slice(2));
  const out = await seedMT(flags);

  // Smoke gate: at least one row.
  if (out.totalRows < 1) {
    console.error('\nFAIL: 0 rows for MT title 45 — pre-walk or harness broken');
    process.exit(1);
  }

  // Production-floor gate: only enforced on full live runs.
  if (!flags.dryRun && flags.limit == null && out.totalRows < MT_TITLE45_ROW_FLOOR) {
    console.error(`\nFAIL: total rows ${out.totalRows} below MT floor ${MT_TITLE45_ROW_FLOOR}`);
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

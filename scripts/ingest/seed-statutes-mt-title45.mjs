#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-mn-chapter609.mjs (Bucket B harness pattern)
// Template: scripts/ingest/lib/bucket-b-html.mjs (DO NOT EDIT)
// Pattern: bucket-b-html.mjs harness contract (Wave 2 design report 2026-05-02)
// Pattern: cl-bulk-data-defensive #14 (port 5432), #17 (session defaults), #18 (COPY FROM STDIN)
// Pattern: no-hallucinated-legal-data — every row has source_urls[0] populated
// csv-bulk-checked: none-exists — mca.legmt.gov publishes per-section HTML only,
//   no bulk download endpoint. Per-section authoritative URLs required.
// Akamai-fronted: 2500ms delay floor, 45s fetch timeout per design plan section 3.
//   If body returns empty + APM_DO_NOT_TOUCH challenge JS, escalate to engine
//   Playwright (do NOT add UA rotation here — engine's job).
//
// MT state statutes seed — Wave 2 Group 3 (Bucket B B-quirky cohort).
// Source: Montana Code Annotated Title 45 (Crimes).
// Target: entities_statutes (one row per active section).
// Coverage: Title 45 chapters 1-10 (~400-500 active sections expected).
//
// Single-title strategy: per design plan section 9, MT requires a 3-level
// pre-walk (title -> chapter -> part -> section) BEFORE the harness's
// per-section fetch loop runs. The harness assumes ONE TOC fetch yields the
// descriptor list. Since the MT chapters_index.html only links to chapter
// parts_index pages (not directly to sections), we pre-walk in the seeder
// using the harness's `fetchWithRetry` (so polite delay + UA + allowedHosts
// all flow through), then pass a sync `discoverSections` that returns the
// pre-cached descriptor list (ignoring the harness's tocHtml argument).
//
// SC-1 verified 2026-05-02: bucket-b-html.mjs:301 does NOT await
// `config.discoverSections`, so async discoverSections is unsupported.
// Pre-walk approach (Option B) is the only viable path without harness edit.
//
// Citation source: descriptor.sectionNum is read at the index level from
// the anchor's <span class="citation">45-5-102</span> inner text — NOT
// derived from the URL filename's positional index. Some positional slots
// span citation ranges (e.g. section_0080 = "45-5-108 through 45-5-110
// reserved") and we filter those at discovery time via the inactive flag.
//
// Usage:
//   node scripts/ingest/seed-statutes-mt-title45.mjs --dry-run --limit=3
//   node scripts/ingest/seed-statutes-mt-title45.mjs --dry-run --verbose --chapters=5
//   node scripts/ingest/seed-statutes-mt-title45.mjs                        # live full title

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

import {
  buildChapterListUrl,
  buildPartsIndexUrl,
  discoverPartUrls,
  discoverSectionUrls as mtDiscoverSectionUrls,
  parseSection as mtParseSection,
} from './lib/mt-html.mjs';
import { ingestBucketBState, fetchWithRetry } from './lib/bucket-b-html.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Env loader (web-repo only, # skip, trim, quote strip) ────────────────
const envPaths = [
  path.join(__dirname, '..', '..', '.env.local'),
  'C:/Users/email/projects/ImNotAnAttorney-web/.env.local',
];
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

// ── Coverage: MT Title 45, chapters 1-10 ─────────────────────────────────
export const MT_COHORT_DEFAULT = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

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
  '10': 'Model Drug Paraphernalia Act',
};

// Conservative floor: design plan estimates 400-500 active sections.
// Floor at 250 to absorb (a) repealed-page nulls, (b) parser nulls on
// edge-case bodies, (c) chapter 10 unknowns. Tighten on first live run.
export const MT_TITLE45_ROW_FLOOR = 250;

// ── Network constants ────────────────────────────────────────────────────
const ALLOWED_HOSTS = new Set(['mca.legmt.gov']);
const CRAWL_DELAY_MS = 2500;
const FETCH_TIMEOUT_MS = 45000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── Pre-walk: build the full descriptor list before harness runs ─────────

/**
 * Walk title -> chapter -> part -> section and emit a flat descriptor list.
 * Citation comes from index anchor inner text (canonical), not URL filename
 * (positional). Inactive rows (Repealed/Reserved/Renumbered) filtered at
 * discovery time.
 *
 * @param {string[]} chapters
 * @param {boolean} verbose
 */
export async function preWalkTitle(chapters, verbose) {
  const allDescriptors = [];
  const seenSectionNums = new Set();
  let fetchCount = 0;
  let inactiveSkipped = 0;
  const t0 = Date.now();

  for (const chapter of chapters) {
    if (verbose) console.log(`  [pre-walk] chapter ${chapter}: fetching parts index`);
    const partsUrl = buildPartsIndexUrl(chapter);
    let partsHtml;
    try {
      partsHtml = await fetchWithRetry(partsUrl, {
        timeoutMs: FETCH_TIMEOUT_MS,
        userAgent: USER_AGENT,
      });
    } catch (err) {
      console.warn(`  [pre-walk] WARN chapter ${chapter} parts fetch failed: ${err.message}`);
      continue;
    }
    fetchCount++;
    await sleep(CRAWL_DELAY_MS);

    const parts = discoverPartUrls(partsHtml, chapter);
    if (verbose) console.log(`  [pre-walk]   chapter ${chapter}: ${parts.length} parts`);

    for (const part of parts) {
      let sectionsHtml;
      try {
        sectionsHtml = await fetchWithRetry(part.url, {
          timeoutMs: FETCH_TIMEOUT_MS,
          userAgent: USER_AGENT,
        });
      } catch (err) {
        console.warn(`  [pre-walk] WARN ${chapter}-${part.part} sections fetch failed: ${err.message}`);
        continue;
      }
      fetchCount++;
      await sleep(CRAWL_DELAY_MS);

      const sections = mtDiscoverSectionUrls(sectionsHtml, chapter, part.part);
      if (verbose) console.log(`  [pre-walk]     ${chapter}-${part.part}: ${sections.length} sections`);

      for (const sec of sections) {
        if (sec.inactive) {
          inactiveSkipped++;
          continue;
        }
        if (seenSectionNums.has(sec.citation)) continue;
        seenSectionNums.add(sec.citation);
        allDescriptors.push({
          sectionNum: sec.citation,
          sectionUrl: sec.url,
          chapterNum: String(chapter),
        });
      }
    }
  }

  const elapsedSec = Math.round((Date.now() - t0) / 1000);
  console.log(`  [pre-walk] discovered ${allDescriptors.length} active sections (${inactiveSkipped} inactive skipped, ${fetchCount} fetches, ${elapsedSec}s)`);
  return allDescriptors;
}

// ── Adapter: bucketBParse ────────────────────────────────────────────────

/**
 * MT-specific parseSection adapter. Strips effectiveDate (harness contract
 * requires {titleText, bodyText} only).
 */
export function bucketBParse(sectionHtml, sectionNum) {
  const parsed = mtParseSection(sectionHtml, sectionNum);
  if (!parsed) return null;
  return { titleText: parsed.titleText, bodyText: parsed.bodyText };
}

// ── Source URL builder — descriptor.sectionUrl IS authoritative ──────────

/**
 * MT canonical source URL = the per-section page URL discovered at pre-walk.
 * Returns a closure-scoped function that resolves canonical citation -> URL.
 *
 * @param {Map<string,string>} sectionUrlMap
 */
export function makeBuildSourceUrl(sectionUrlMap) {
  return function buildSourceUrl(sectionNum) {
    const url = sectionUrlMap.get(sectionNum);
    if (!url) {
      throw new Error(`buildSourceUrl: no URL mapped for section ${sectionNum}`);
    }
    return url;
  };
}

// ── Per-title config builder ─────────────────────────────────────────────

/**
 * Build a single BucketBStateConfig for the entire MT Title 45.
 * @param {Array<{sectionNum:string, sectionUrl:string, chapterNum:string}>} descriptors
 */
export function buildTitleConfig(descriptors) {
  const sectionUrlMap = new Map(descriptors.map((d) => [d.sectionNum, d.sectionUrl]));
  return {
    stateCode: 'MT',
    stateName: 'Montana',
    titleNum: '45',
    titleLabel: 'Title 45 - Crimes',
    chapterListUrl: buildChapterListUrl(),
    discoverSections: () => descriptors,
    parseSection: bucketBParse,
    buildSourceUrl: makeBuildSourceUrl(sectionUrlMap),
    crawlDelay: 'none',
    crawlDelayMs: CRAWL_DELAY_MS,
    fetchTimeoutMs: FETCH_TIMEOUT_MS,
    allowedHosts: ALLOWED_HOSTS,
    userAgent: USER_AGENT,
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
      const valid = parts.filter((p) => /^\d+$/.test(p));
      if (valid.length > 0) out.chapters = valid;
    }
  }
  return out;
}

// ── Orchestrator ─────────────────────────────────────────────────────────

export async function seedMT(opts = {}) {
  const {
    dryRun = false,
    verbose = false,
    limit = null,
    chapters = null,
    connectionString,
  } = opts;

  const targetChapters = chapters && chapters.length ? chapters : MT_COHORT_DEFAULT;

  console.log(`=== seed-statutes-mt-title45 ${new Date().toISOString()} ===`);
  console.log(`  cohort   : [${targetChapters.join(', ')}]`);
  console.log(`  dry-run  : ${dryRun}`);
  console.log(`  limit    : ${limit ?? '(all)'}`);
  console.log(`  verbose  : ${verbose}`);
  console.log(`  delay    : ${CRAWL_DELAY_MS}ms (Akamai-conservative)`);

  const t0 = Date.now();

  const descriptors = await preWalkTitle(targetChapters, verbose);

  if (descriptors.length === 0) {
    console.error('FAIL: pre-walk yielded 0 descriptors — Akamai escalation? URL pattern drift?');
    return { totalRows: 0, totalSkipped: 0, totalErrors: 0, totalDurationMs: Date.now() - t0 };
  }

  const config = buildTitleConfig(descriptors);

  let result;
  try {
    result = await ingestBucketBState(config, {
      dryRun,
      verbose,
      limit,
      connectionString,
    });
  } catch (err) {
    console.error(`FATAL: ingestBucketBState failed: ${err.message}`);
    if (err.stack) console.error(err.stack);
    return { totalRows: 0, totalSkipped: 0, totalErrors: 1, totalDurationMs: Date.now() - t0 };
  }

  const totalDurationMs = Date.now() - t0;
  console.log('\n=== Summary ===');
  console.log(`  TOTAL  rows=${result.rowCount} skip=${result.skipCount} err=${result.errorCount} ${totalDurationMs}ms`);

  return {
    descriptorsDiscovered: descriptors.length,
    totalRows: result.rowCount,
    totalSkipped: result.skipCount,
    totalErrors: result.errorCount,
    totalDurationMs,
  };
}

async function main() {
  const flags = parseCliFlags(process.argv.slice(2));
  const out = await seedMT(flags);

  if (out.totalRows < 1) {
    console.error('\nFAIL: 0 rows — harness or adapter broken (or Akamai escalated)');
    process.exit(1);
  }

  if (!flags.dryRun && flags.limit == null && flags.chapters == null && out.totalRows < MT_TITLE45_ROW_FLOOR) {
    console.error(`\nFAIL: total rows ${out.totalRows} below MT_TITLE45_ROW_FLOOR=${MT_TITLE45_ROW_FLOOR}`);
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

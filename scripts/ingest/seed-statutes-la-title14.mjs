#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-mn-chapter609.mjs (Bucket B harness adapter)
// Template: scripts/ingest/lib/bucket-b-html.mjs (harness contract)
// Pattern: bucket-b-html.mjs harness contract (Wave 2 design report 2026-05-02, Group 4 LA)
// Pattern: cl-bulk-data-defensive #18 (COPY) + no-hallucinated-legal-data (source_urls)
// csv-bulk-checked: none-exists — legis.la.gov publishes per-section ASP.NET HTML only
//
// LA state statutes seed — Wave 2 Group 4 (Bucket B B-quirky cohort, opaque IDs).
// Source: Louisiana Revised Statutes Title 14 (Criminal Law).
// Target: entities_statutes (one row per active section under Title 14).
// Coverage: All active Title 14 sections (~700 unique after TOC repealed/blank filter).
//
// Estimated rows: ~700 (1,424 raw hrefs in TOC → ~712 unique anchor rows →
// drop ~50-100 repealed/blank/redesignated → 600-700 active).
//
// LA quirk: section URLs use opaque numeric document IDs (Law.aspx?d=78397).
// The canonical R.S. 14:N citation is parsed from TOC anchor text and
// confirmed against the section page's "§N. Headnote" heading. We store the
// citation suffix (without the "14:" prefix) as `section`; `title` = "14".
//
// Single-title strategy: LA's criminal code lives entirely under Title 14, so
// this seeder is a one-title cohort. The harness DELETE-then-COPY scopes to
// (jurisdiction='LA', title='14'), making re-runs idempotent.
//
// Usage:
//   node scripts/ingest/seed-statutes-la-title14.mjs --dry-run --limit=3
//   node scripts/ingest/seed-statutes-la-title14.mjs --dry-run --verbose
//   node scripts/ingest/seed-statutes-la-title14.mjs            # live full title

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

import {
  LA_TITLE14_TOC_URL,
  discoverSections as laDiscoverSections,
  parseSection as laParseSection,
  buildLASourceUrl,
  buildSectionFetchUrl,
  docIdFromUrl,
} from './lib/la-html.mjs';
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

// ── Coverage: LA Title 14 ────────────────────────────────────────────────
export const LA_TITLE14 = '14';
export const LA_TITLE14_LABEL = 'Criminal Law';

// Floor verified 2026-05-02: TOC has 712 unique Law.aspx?d=N anchor rows;
// after repealed/blank/redesignated filter we expect ~600-700 active. Set
// conservative floor at 500 to allow for content-side parser nulls.
export const LA_TITLE14_ROW_FLOOR = 500;

// ── Adapter: la-html parser → BucketBStateConfig contract ───────────────

/**
 * Bridge la-html.discoverSections (already shaped to harness descriptor) —
 * passthrough; here for symmetry with sibling seeders.
 */
export function bucketBDiscover(tocHtml, config) {
  return laDiscoverSections(tocHtml, config);
}

/**
 * Bridge la-html.parseSection signature to harness's parseSection.
 */
export function bucketBParse(sectionHtml, sectionNum, config) {
  const parsed = laParseSection(sectionHtml, sectionNum, config);
  if (!parsed) return null;
  return { titleText: parsed.titleText, bodyText: parsed.bodyText };
}

/**
 * Authoritative source URL builder. LA's per-section URL is the opaque
 * Law.aspx?d=N — we derive the docId from the descriptor sectionUrl by way
 * of the harness pipeline. The harness calls `buildSourceUrl(sectionNum)`
 * which doesn't have the docId — so we walk the TOC-discovered URL.
 *
 * To keep the harness contract intact (`buildSourceUrl(sectionNum)`), we
 * memoize a sectionNum → sectionUrl map populated at discoverSections time
 * and look up here. The harness invokes discoverSections BEFORE any row
 * builder calls, so the map is always primed.
 */
const SECTION_URL_BY_NUM = new Map();

/**
 * Wrap discoverSections to populate the URL map alongside returning
 * descriptors.
 */
export function discoverSectionsAndIndex(tocHtml, config) {
  const descriptors = laDiscoverSections(tocHtml, config);
  for (const d of descriptors) {
    SECTION_URL_BY_NUM.set(d.sectionNum, d.sectionUrl);
  }
  return descriptors;
}

export function buildSourceUrl(sectionNum) {
  const url = SECTION_URL_BY_NUM.get(sectionNum);
  if (!url) {
    throw new Error(
      `buildSourceUrl: no URL indexed for LA section ${sectionNum}. ` +
      `discoverSectionsAndIndex must run before buildSourceUrl.`,
    );
  }
  return url;
}

// ── Per-title config builder ─────────────────────────────────────────────

const ALLOWED_HOSTS = new Set(['www.legis.la.gov', 'legis.la.gov']);
const CRAWL_DELAY_MS = 2000; // verified 2026-05-02: legis.la.gov /robots.txt 404s.
                              // Conservative 2s spacing to be polite given ASP.NET
                              // ViewState-heavy pages. ~700 sections × 2s = ~24min total.
const FETCH_TIMEOUT_MS = 30000;

export function buildTitleConfig() {
  return {
    stateCode: 'LA',
    stateName: 'Louisiana',
    titleNum: LA_TITLE14,
    titleLabel: LA_TITLE14_LABEL,
    chapterListUrl: LA_TITLE14_TOC_URL,
    discoverSections: discoverSectionsAndIndex,
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
  const out = { dryRun: false, verbose: false, limit: null };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--verbose') out.verbose = true;
    else if (a.startsWith('--limit=')) {
      const n = Number.parseInt(a.slice('--limit='.length), 10);
      if (Number.isInteger(n) && n > 0) out.limit = n;
    }
  }
  return out;
}

// ── Orchestrator ─────────────────────────────────────────────────────────

export async function seedLA(opts = {}) {
  const {
    dryRun = false,
    verbose = false,
    limit = null,
    connectionString,
  } = opts;

  console.log(`=== seed-statutes-la-title14 ${new Date().toISOString()} ===`);
  console.log(`  title    : ${LA_TITLE14} (${LA_TITLE14_LABEL})`);
  console.log(`  dry-run  : ${dryRun}`);
  console.log(`  limit    : ${limit ?? '(all sections)'}`);
  console.log(`  verbose  : ${verbose}`);

  const t0 = Date.now();
  // Reset URL index on every run — important for vitest where the module is
  // imported across describe blocks but each test should start fresh.
  SECTION_URL_BY_NUM.clear();

  const config = buildTitleConfig();
  const result = await ingestBucketBState(config, {
    dryRun,
    verbose,
    limit,
    connectionString,
  });

  const totalMs = Date.now() - t0;
  console.log('\n=== Summary ===');
  console.log(`  rows=${result.rowCount} skip=${result.skipCount} err=${result.errorCount} ${result.durationMs}ms (wall ${totalMs}ms)`);

  return result;
}

async function main() {
  const flags = parseCliFlags(process.argv.slice(2));
  const out = await seedLA(flags);

  if (out.rowCount < 1) {
    console.error('\nFAIL: 0 rows — harness or adapter broken');
    process.exit(1);
  }

  if (!flags.dryRun && flags.limit == null && out.rowCount < LA_TITLE14_ROW_FLOOR) {
    console.error(`\nFAIL: rows ${out.rowCount} below LA Title 14 floor ${LA_TITLE14_ROW_FLOOR}`);
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

// Re-export for tests
export { buildSectionFetchUrl, docIdFromUrl };

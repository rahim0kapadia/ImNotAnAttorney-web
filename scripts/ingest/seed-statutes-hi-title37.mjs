#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-mn-chapter609.mjs (Bucket B multi-chapter cohort)
// Pattern: bucket-b-html.mjs harness contract (Wave 2 design report 2026-05-02)
// Pattern: cl-bulk-data-defensive #18 plus no-hallucinated-legal-data
// csv-bulk-checked: none-exists — capitol.hawaii.gov publishes per-section HTML only;
//   no bulk download endpoint. Per-section authoritative URLs required.
//
// HI state statutes seed — Wave 3 multi-chapter HTML cohort (Bucket B).
// Source: capitol.hawaii.gov hrscurrent (Hawaii Revised Statutes canonical archive).
// Target: entities_statutes (one row per active section).
// Coverage: Title 37 Penal Code (701-712A, 14 chapters) plus Chapter 134 Firearms.
//
// Estimated rows: ~373 active sections after parser repealed-skip and 404-skip.
// Floor enforced: MIN_FLOOR_ROWS = 250 on full live runs.
//
// Cloudflare-fronted source: every fetch MUST send a Chrome User-Agent header.
// Default UA in bucket-b-html.fetchWithRetry returns 403 on capitol.hawaii.gov
// — config below sets userAgent override.
//
// Polite delay: 1500 ms between requests per the J1 cached rule
// (reference-justia-cloudflare-rate-limits-2026-05-01). capitol.hawaii.gov
// also serves content via Cloudflare and the same caution applies.
//
// Usage:
//   node scripts/ingest/seed-statutes-hi-title37.mjs --dry-run --limit=3
//   node scripts/ingest/seed-statutes-hi-title37.mjs --dry-run --verbose
//   node scripts/ingest/seed-statutes-hi-title37.mjs --chapters=707
//   node scripts/ingest/seed-statutes-hi-title37.mjs            # live full cohort

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

import {
  discoverSections as hiDiscoverSections,
  parseSection as hiParseSection,
  buildChapterUrl,
  buildHiSourceUrl,
  HI_CHAPTER_VOLUMES,
} from './lib/hi-html.mjs';
import { ingestBucketBState } from './lib/bucket-b-html.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Env loader — INAA-web .env.local. Skip comments and blanks. Strip surrounding
// quotes. Reject keys that do not match conservative env-var regex.
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
  break;
}

// Cohort: Title 37 Penal Code (14 chapters) plus Chapter 134 Firearms.
// Order matches HI_CHAPTER_VOLUMES table; 134 ingested first because it lives
// in a different volume.
export const HI_COHORT_DEFAULT = [
  '134',
  '701', '702', '703', '704', '705', '706',
  '707', '708', '708A',
  '709', '710', '711',
  '712', '712A',
];

export const HI_CHAPTER_DESCRIPTIONS = {
  '134':  'Firearms, Ammunition and Dangerous Weapons (Title 10)',
  '701':  'Preliminary Provisions',
  '702':  'General Principles of Penal Liability',
  '703':  'General Principles of Justification',
  '704':  'Penal Responsibility and Fitness to Proceed',
  '705':  'Inchoate Crimes',
  '706':  'Disposition of Convicted Defendants',
  '707':  'Offenses Against the Person',
  '708':  'Offenses Against Property Rights',
  '708A': 'Money Laundering',
  '709':  'Offenses Against the Family and Against Incompetents',
  '710':  'Offenses Against Public Administration',
  '711':  'Offenses Against Public Order',
  '712':  'Offenses Against Public Health and Morals',
  '712A': 'Forfeiture',
};

// Production-floor gate: total cohort rows must clear this on a full live run
// (no --limit, no --dry-run). Conservative — research estimated 373 active
// sections; we floor at 250 to absorb parser nulls and 404 stubs.
export const HI_MIN_FLOOR_ROWS = 250;

// Adapter functions that bridge sibling hi-html.mjs into the BucketBStateConfig
// contract expected by the bucket-b-html harness.

export function bucketBDiscover(tocHtml, config) {
  // Harness passes config; we know the chapter from config.titleNum.
  return hiDiscoverSections(tocHtml, config.titleNum);
}

export function bucketBParse(sectionHtml, sectionNum) {
  return hiParseSection(sectionHtml, sectionNum);
}

export function buildSourceUrl(sectionNum) {
  return buildHiSourceUrl(sectionNum);
}

// Per-chapter config builder

const ALLOWED_HOSTS = new Set(['www.capitol.hawaii.gov', 'capitol.hawaii.gov']);
const CRAWL_DELAY_MS = 1500;
const FETCH_TIMEOUT_MS = 30000;
const HI_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// curl-based fetch shim required because Cloudflare on capitol.hawaii.gov
// fingerprints undici's TLS ClientHello and returns 403, even with a Chrome
// User-Agent. curl's TLS fingerprint is in Cloudflare's allowlist (verified
// 2026-05-02 via direct probes returning 200 + cf-cache-status: HIT).
//
// Same retry shape as bucket-b-html.fetchWithRetry: 3 attempts with backoff.
// Same timeout semantics (per-attempt, AbortSignal honored via curl --max-time).
//
// J1 rule (serialize, polite delay) still honored — the harness sleeps
// crawlDelayMs between fetchSection calls, and seedHi runs chapters serially.
export async function curlFetchHtml(url, opts = {}) {
  const { timeoutMs = 30000, maxRetries = 3, userAgent = HI_USER_AGENT } = opts;
  const timeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { stdout, stderr } = await execFileAsync('curl', [
        '-sS',
        '--fail',
        '--max-time', String(timeoutSec),
        '-H', `User-Agent: ${userAgent}`,
        url,
      ], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
      if (!stdout || stdout.length < 100) {
        throw new Error(`curl returned suspiciously short body (${stdout?.length ?? 0} bytes) for ${url}`);
      }
      return stdout;
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        const delay = 1000 * attempt;
        console.warn(`  [curl-fetch] attempt ${attempt} failed: ${err.message?.split('\n')[0] || err} — retry in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

/**
 * Build a BucketBStateConfig for a single HI chapter.
 *
 * @param {string} chapter for example "707", "134", "712A"
 * @returns {object}
 */
export function buildChapterConfig(chapter) {
  if (!HI_CHAPTER_VOLUMES[chapter]) {
    throw new Error(`HI chapter ${chapter} not in HI_CHAPTER_VOLUMES map`);
  }
  const desc = HI_CHAPTER_DESCRIPTIONS[chapter] || `Chapter ${chapter}`;
  return {
    stateCode: 'HI',
    stateName: 'Hawaii',
    titleNum: chapter,
    titleLabel: desc,
    chapterListUrl: buildChapterUrl(chapter),
    discoverSections: bucketBDiscover,
    parseSection: bucketBParse,
    buildSourceUrl,
    crawlDelay: '1.5s',
    crawlDelayMs: CRAWL_DELAY_MS,
    fetchTimeoutMs: FETCH_TIMEOUT_MS,
    allowedHosts: ALLOWED_HOSTS,
    userAgent: HI_USER_AGENT,
    fetchHtml: curlFetchHtml,
  };
}

// CLI parsing

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
      // Accept only chapters present in HI_CHAPTER_VOLUMES map.
      const valid = parts.filter((p) => HI_CHAPTER_VOLUMES[p]);
      if (valid.length > 0) out.chapters = valid;
    }
  }
  return out;
}

// Orchestrator

/**
 * Iterate cohort chapters serially (J1: serialize, do not parallelize), call
 * ingestBucketBState() per chapter, aggregate. The harness DELETE-then-COPY
 * scopes to (jurisdiction in (HI, Hawaii), title=<chapter>) so re-runs are
 * idempotent per chapter.
 */
export async function seedHi(opts = {}) {
  const {
    dryRun = false,
    verbose = false,
    limit = null,
    chapters = null,
    connectionString,
  } = opts;

  const targets = chapters && chapters.length ? chapters : HI_COHORT_DEFAULT;

  console.log(`=== seed-statutes-hi-title37 ${new Date().toISOString()} ===`);
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
    const desc = HI_CHAPTER_DESCRIPTIONS[chapter] || `Chapter ${chapter}`;
    console.log(`\n--- HI Chapter ${chapter} (${desc}) ---`);

    let config;
    try {
      config = buildChapterConfig(chapter);
    } catch (err) {
      console.error(`  FAIL chapter ${chapter} config: ${err.message}`);
      results.push({
        chapter, rowCount: 0, skipCount: 0, errorCount: 0, durationMs: 0,
        ok: false, error: err.message,
      });
      continue;
    }

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
        chapter, rowCount: 0, skipCount: 0, errorCount: 0, durationMs: 0,
        ok: false, error: err.message,
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
  const out = await seedHi(flags);

  // Smoke gate: at least one chapter must produce one or more rows.
  if (out.totalRows < 1) {
    console.error('\nFAIL: 0 rows across cohort — harness or adapter broken');
    process.exit(1);
  }

  // Production-floor gate: only enforced on full live runs.
  if (!flags.dryRun && flags.limit == null && flags.chapters == null && out.totalRows < HI_MIN_FLOOR_ROWS) {
    console.error(`\nFAIL: total rows ${out.totalRows} below HI floor ${HI_MIN_FLOOR_ROWS}`);
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

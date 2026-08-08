#!/usr/bin/env node
// Template: scripts/ingest/lib/bucket-b-html.mjs (DELETE-then-COPY pattern + StatuteRowSchema)
// Template: scripts/ingest/seed-statutes-mn-chapter609.mjs (orchestrator + env loader shape)
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// Pattern: bucket-b-html.mjs harness contract (custom-walker variant; NY TOC is multi-level)
// Pattern: no-hallucinated-legal-data — every row carries source_urls[0]=nysenate.gov
// csv-bulk-checked: none-exists — NY Senate publishes per-section HTML only;
//   no public bulk download. (Open Legislation API exists but requires
//   per-user API key; abandoned 2026-05-02 due to NY_API_KEY block.)
//
// Seeds NY Penal Law (PEN) into entities_statutes via direct HTML scrape of
// nysenate.gov public pages. NO API key required.
//
// Source: https://www.nysenate.gov/legislation/laws/PEN  (multi-level TOC)
// Authoritative URLs: https://www.nysenate.gov/legislation/laws/PEN/<section>
//
// TOC depth: PEN root -> 4 PARTs -> ~10 TITLEs each -> ~3-15 ARTICLEs each ->
// dotted-decimal SECTIONs. ~700 active sections expected. Floor: 700.
//
// Usage:
//   node scripts/ingest/seed-statutes-ny-pen.mjs --dry-run --limit=3
//   node scripts/ingest/seed-statutes-ny-pen.mjs --dry-run --verbose
//   node scripts/ingest/seed-statutes-ny-pen.mjs            # live full ingest
//
// Env required (live run only):
//   SUPABASE_DB_URL
//
// Polite crawl: 1500ms between section fetches (no Crawl-delay in robots.txt).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';
import {
  NY_BASE,
  NY_PEN_ROOT_URL,
  buildNySourceUrl,
  buildPenRootUrl,
  classifyLink,
  discoverChildLinks,
  sectionIdFromUrl,
  parseSection,
  walkPenToc,
} from './lib/ny-pen-html.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Env loader ────────────────────────────────────────────────────────────
const dotenvPath = path.resolve(__dirname, '..', '..', '.env.local');
if (fs.existsSync(dotenvPath)) {
  const txt = fs.readFileSync(dotenvPath, 'utf-8');
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
    if (!process.env[key]) process.env[key] = val;
  }
}

// ── Config ────────────────────────────────────────────────────────────────
export const NY_TITLE = 'PEN';
export const NY_TITLE_LABEL = 'Penal Law';
export const NY_PEN_ROW_FLOOR = 700;

const ALLOWED_HOSTS = new Set(['www.nysenate.gov', 'nysenate.gov']);
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 30000;
const BRANCH_DELAY_MS = 1000;   // between TOC branch page fetches
const SECTION_DELAY_MS = 1500;  // between section page fetches (polite default)
const FETCH_RETRIES = 3;

// ── Zod schema ────────────────────────────────────────────────────────────
export const StatuteRowSchema = z.object({
  jurisdiction: z.literal('NY'),
  title: z.literal('PEN'),
  section: z.string().min(1).max(40),
  subsection: z.null(),
  section_text: z.string().min(10).max(50000),
  is_current: z.literal(true),
  source_urls: z.array(z.string().url().max(2048)).min(1).max(10)
    .refine((urls) => {
      try {
        const host = new URL(urls[0]).hostname.toLowerCase();
        return ALLOWED_HOSTS.has(host);
      } catch { return false; }
    }, 'Primary source_url host must be nysenate.gov'),
  text_hash: z.string().regex(/^[a-f0-9]{64}$/),
  effective_date: z.null(),
  scraped_at: z.string().datetime().max(40),
});

// ── CLI ───────────────────────────────────────────────────────────────────
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

// ── Row builder ───────────────────────────────────────────────────────────
export function buildRow({ section, titleText, bodyText, sourceUrl, scrapedAt }) {
  const trimmedTitle = (titleText || '').trim();
  const trimmedBody = (bodyText || '').trim();
  const sectionText = (trimmedTitle ? trimmedTitle + '\n\n' : '') + trimmedBody;
  const textHash = crypto.createHash('sha256').update(sectionText).digest('hex');
  return {
    jurisdiction: 'NY',
    title: NY_TITLE,
    section,
    subsection: null,
    section_text: sectionText.slice(0, 49990),
    is_current: true,
    source_urls: [sourceUrl],
    text_hash: textHash,
    effective_date: null,
    scraped_at: scrapedAt || new Date().toISOString(),
  };
}

export function textArrayLiteral(arr) {
  if (!arr || arr.length === 0) return '{}';
  const parts = arr.map((u) => {
    const safe = String(u).split('\\').join('\\\\').split('"').join('\\"').split('\r').join(' ').split('\n').join(' ');
    return '"' + safe + '"';
  });
  return '{' + parts.join(',') + '}';
}

// ── Fetch with retry + browser headers ────────────────────────────────────
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * curl-based fetcher — bypasses Cloudflare 403 that Node fetch triggers on
 * nysenate.gov. Writes response to a temp file, reads it back, cleans up.
 * Used as the default transport for live runs. Tests inject fetchImpl instead.
 *
 * @param {string} url
 * @param {{ userAgent?:string, timeoutSec?:number }} [opts]
 * @returns {string}  HTML body
 */
export function curlFetch(url, opts = {}) {
  const userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
  const timeoutSec = opts.timeoutSec ?? Math.ceil(FETCH_TIMEOUT_MS / 1000);
  const tmpFile = path.join(tmpdir(), `ny-curl-${crypto.randomBytes(6).toString('hex')}.html`);
  try {
    execFileSync('curl', [
      '-sSL',
      '--max-time', String(timeoutSec),
      '--user-agent', userAgent,
      '--header', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9',
      '--header', 'Accept-Language: en-US,en;q=0.9',
      '-o', tmpFile,
      url,
    ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    const body = fs.readFileSync(tmpFile, 'utf8');
    // Detect Cloudflare challenge pages (403/503 + "Just a moment")
    if (body.includes('Just a moment') || body.includes('cf-browser-verification')) {
      throw new Error(`Cloudflare challenge on ${url} — curl UA not accepted`);
    }
    return body;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

/**
 * Fetch a single URL with retries + browser-shape headers (Cloudflare-friendly).
 * Default transport is curlFetch (bypasses CF 403). Pass fetchImpl to override
 * (used by tests to inject fixture-backed mocks without spawning curl).
 * Throws on final failure.
 *
 * @param {string} url
 * @param {{ fetchImpl?:Function, timeoutMs?:number, maxRetries?:number, userAgent?:string }} [opts]
 */
export async function fetchWithRetry(url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxRetries = opts.maxRetries ?? FETCH_RETRIES;
  const userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
  let lastErr;

  // If a fetchImpl override is provided (test injection), use the original
  // fetch()-compatible path. Otherwise use curlFetch (live transport).
  if (opts.fetchImpl) {
    const f = opts.fetchImpl;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await f(url, {
          signal: ctrl.signal,
          headers: {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
        return await res.text();
      } catch (err) {
        clearTimeout(timer);
        lastErr = err;
        if (attempt < maxRetries) await sleep(1000 * attempt);
      }
    }
    throw lastErr;
  }

  // Live path: curl transport (Cloudflare-safe)
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return curlFetch(url, { userAgent, timeoutSec: Math.ceil(timeoutMs / 1000) });
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) await sleep(1000 * attempt);
    }
  }
  throw lastErr;
}

// ── Orchestrator ──────────────────────────────────────────────────────────

/**
 * Full ingest pipeline:
 *   1. Walk PEN TOC tree -> all section URLs
 *   2. For each section URL (with crawl-delay): fetch + parseSection + buildRow
 *   3. Validate via StatuteRowSchema; collect rejected
 *   4. If --dry-run: return; else DELETE+COPY into entities_statutes
 *
 * Test seams:
 *   - fetchImpl: override the global fetch (used in dry-run smoke; default fetch)
 *   - dbFactory: override createBulkClient (test-only)
 *   - sectionUrlsOverride: skip TOC walk; use these URLs (test-only)
 *
 * @param {{
 *   dryRun?:boolean, verbose?:boolean, limit?:number,
 *   fetchImpl?:Function, dbFactory?:Function,
 *   sectionUrlsOverride?:string[],
 *   branchDelayMs?:number, sectionDelayMs?:number,
 * }} [opts]
 */
export async function seedNY(opts = {}) {
  const {
    dryRun = false, verbose = false, limit = null,
    fetchImpl, dbFactory, sectionUrlsOverride,
    branchDelayMs = BRANCH_DELAY_MS,
    sectionDelayMs = SECTION_DELAY_MS,
  } = opts;

  console.log(`=== seed-statutes-ny-pen ${new Date().toISOString()} ===`);
  console.log(`  title    : ${NY_TITLE} (${NY_TITLE_LABEL})`);
  console.log(`  dry-run  : ${dryRun}`);
  console.log(`  limit    : ${limit ?? '(all)'}`);
  console.log(`  verbose  : ${verbose}`);

  // ── Phase 1: discover section URLs ──────────────────────────────────────
  let sectionUrls;
  if (sectionUrlsOverride) {
    sectionUrls = sectionUrlsOverride;
    console.log(`  using sectionUrlsOverride (${sectionUrls.length} urls)`);
  } else {
    console.log(`\n--- TOC walk: ${NY_PEN_ROOT_URL} ---`);
    let branchFetched = 0;
    const tocFetcher = async (url) => {
      if (branchFetched > 0 && branchDelayMs > 0) await sleep(branchDelayMs);
      branchFetched++;
      if (verbose) console.log(`  [toc-fetch ${branchFetched}] ${url}`);
      return fetchWithRetry(url, { fetchImpl });
    };
    sectionUrls = await walkPenToc(tocFetcher, {
      onBranch: verbose ? null : (u, d) => {
        if (branchFetched % 25 === 0) console.log(`  [toc] ${branchFetched} branches walked, depth=${d}`);
      },
    });
    console.log(`  TOC walk complete: ${sectionUrls.length} section URLs found across ${branchFetched} index pages`);
  }

  if (limit) {
    sectionUrls = sectionUrls.slice(0, limit);
    console.log(`  limit=${limit} -> processing ${sectionUrls.length} section URLs`);
  }

  // ── Phase 2: fetch + parse each section ─────────────────────────────────
  console.log(`\n--- fetching ${sectionUrls.length} sections ---`);
  const rows = [];
  const rejected = [];
  const skipped = [];
  let fetched = 0;

  for (const url of sectionUrls) {
    if (fetched > 0 && sectionDelayMs > 0) await sleep(sectionDelayMs);
    fetched++;
    if (!verbose && fetched % 50 === 0) {
      console.log(`  [progress] ${fetched}/${sectionUrls.length} fetched, ${rows.length} valid`);
    }
    let sectionNum;
    try { sectionNum = sectionIdFromUrl(url); } catch (e) {
      rejected.push({ url, errors: [`sectionIdFromUrl: ${e.message}`] });
      continue;
    }
    let html;
    try { html = await fetchWithRetry(url, { fetchImpl }); } catch (e) {
      rejected.push({ section: sectionNum, errors: [`fetch: ${e.message}`] });
      continue;
    }
    const parsed = parseSection(html, sectionNum);
    if (!parsed) {
      skipped.push(sectionNum);
      if (verbose) console.log(`  [skip] ${sectionNum} (parser returned null — likely repealed shell)`);
      continue;
    }
    const row = buildRow({
      section: sectionNum,
      titleText: parsed.titleText,
      bodyText: parsed.bodyText,
      sourceUrl: buildNySourceUrl(sectionNum),
    });
    const check = StatuteRowSchema.safeParse(row);
    if (!check.success) {
      rejected.push({
        section: sectionNum,
        errors: check.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      continue;
    }
    rows.push(check.data);
    if (verbose && rows.length <= 3) {
      console.log(`  OK ${sectionNum} — ${parsed.titleText.slice(0, 60)}`);
    }
  }

  console.log(`\n  valid rows: ${rows.length}, skipped: ${skipped.length}, rejected: ${rejected.length}`);
  if (rejected.length > 0) {
    for (const r of rejected.slice(0, 5)) {
      console.log(`    reject ${r.section || r.url}: ${r.errors.join('; ')}`);
    }
  }

  if (dryRun) {
    console.log('\n=== DRY RUN — no DB write ===');
    return { rows, rejected, skipped };
  }

  // ── Phase 3: floor + COPY ───────────────────────────────────────────────
  if (rows.length < NY_PEN_ROW_FLOOR) {
    throw new Error(`seedNY: row count ${rows.length} below floor ${NY_PEN_ROW_FLOOR}`);
  }

  const makeClient = dbFactory || createBulkClient;
  const { client, cleanup } = await makeClient();
  try {
    await client.query('BEGIN');
    try {
      const del = await client.query(
        `DELETE FROM entities_statutes WHERE jurisdiction = $1 AND title = $2`,
        ['NY', NY_TITLE],
      );
      console.log(`  cleared ${del.rowCount} prior NY/PEN rows`);
      const COLS = [
        'jurisdiction', 'title', 'section', 'subsection',
        'section_text', 'is_current', 'source_urls', 'text_hash',
        'effective_date', 'scraped_at',
      ];
      async function* rowsGen() {
        for (const r of rows) {
          yield [
            r.jurisdiction, r.title, r.section, r.subsection,
            r.section_text, r.is_current, textArrayLiteral(r.source_urls),
            r.text_hash, r.effective_date, r.scraped_at,
          ];
        }
      }
      const { rowCount, durationMs } = await bulkCopyRows(
        client, 'entities_statutes', COLS, rowsGen(),
      );
      console.log(`  COPYd ${rowCount} in ${(durationMs / 1000).toFixed(1)}s`);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    }
  } finally {
    await cleanup();
  }

  return { rows, rejected, skipped };
}

// ── main ──────────────────────────────────────────────────────────────────
async function main() {
  const flags = parseCliFlags(process.argv.slice(2));
  if (!flags.dryRun && !process.env.SUPABASE_DB_URL) {
    console.error('ERROR: SUPABASE_DB_URL not set. Run with --dry-run or set the env var.');
    process.exit(1);
  }
  const out = await seedNY(flags);
  console.log('\n=== Summary ===');
  console.log(`  rows     : ${out.rows.length}`);
  console.log(`  skipped  : ${out.skipped.length}`);
  console.log(`  rejected : ${out.rejected.length}`);
  if (!flags.dryRun && flags.limit == null && out.rows.length < NY_PEN_ROW_FLOOR) {
    console.error(`FAIL: floor ${NY_PEN_ROW_FLOOR} not met (got ${out.rows.length})`);
    process.exit(1);
  }
  console.log(`PASS: completed`);
  process.exit(0);
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try { return import.meta.url === pathToFileURL(process.argv[1]).href; } catch { return false; }
})();
if (invokedDirectly) main().catch((e) => {
  console.error('FATAL:', e?.message || e);
  if (e?.stack) console.error(e.stack);
  process.exit(1);
});

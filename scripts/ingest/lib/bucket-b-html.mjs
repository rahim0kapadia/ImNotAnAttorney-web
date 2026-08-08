// Template: scripts/lib/unicourt-harness.mjs (single-document bulk pattern)
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows
// Pattern: gotcha-az-leg-robots-120s — robots.txt Crawl-delay must be honored at runtime
// csv-bulk-checked: none-exists — Bucket B states publish per-section HTML only;
//   no bulk download endpoint. Per-section authoritative URLs required.
//
// Shared harness for templated-HTML criminal statute sites (Bucket B per the
// 50-state survey, 2026-05-01). Handles the multi-URL traversal pattern:
//   chapter TOC  →  section list  →  per-section HTML  →  parsed row.
//
// Schema: entities_statutes (verified 2026-04-24 via migration 20260423e).
// Mirrors `unicourt-harness.mjs` row shape exactly so Wave 1A/Wave 2 rows are
// indistinguishable downstream — same jurisdiction (2-letter code), same
// section_text composition, same text_hash algorithm.
//
// Usage:
//   import { ingestBucketBState } from '../lib/bucket-b-html.mjs';
//   const result = await ingestBucketBState(MA_CONFIG, { dryRun: false });
//
// Per-state config shape: see BucketBStateConfig typedef below. Sibling agents
// designing Wave 2 seeders fill in the per-state shape and pass it here.

import crypto from 'node:crypto';
import { z } from 'zod';
import { createBulkClient, bulkCopyRows } from '../../lib/pg-bulk-defaults.mjs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} BucketBSectionDescriptor
 * @property {string}  sectionNum   Canonical section identifier (e.g. "265-1", "609.01", "200.030")
 * @property {string}  sectionUrl   Authoritative HTTPS URL to fetch the section body
 * @property {string}  [chapterNum] Optional structural chapter (kept for logging)
 */

/**
 * @typedef {Object} BucketBParsedSection
 * @property {string} titleText     Heading text (e.g. "Murder defined")
 * @property {string} bodyText      Statute body text (post strip-html)
 */

/**
 * @typedef {Object} BucketBStateConfig
 * @property {string}   stateCode         Two-letter state code, e.g. "MA"
 * @property {string}   stateName         Full state name, e.g. "Massachusetts"
 * @property {string}   titleNum          Criminal title/chapter number, e.g. "265"
 * @property {string}   titleLabel        Human label, e.g. "Crimes Against the Person"
 * @property {string}   chapterListUrl    URL of the chapter/title TOC HTML page (single-doc input)
 * @property {Function} discoverSections  (tocHtml: string, config) => BucketBSectionDescriptor[]
 *                                        Walk the TOC HTML and emit one descriptor per section.
 *                                        Must produce HTTPS URLs; URL must include the section number
 *                                        in a form the parser can echo back via parseSection.
 * @property {Function} parseSection      (sectionHtml: string, sectionNum: string, config) => BucketBParsedSection|null
 *                                        Parse a single section page. Return null to skip.
 * @property {Function} buildSourceUrl    (sectionNum: string) => string
 *                                        Authoritative state-leg URL stored in source_urls[].
 *                                        Often equals the discovered sectionUrl, but a state may
 *                                        prefer a canonical permalink shape.
 * @property {string}   [crawlDelay]      Robots crawl-delay string for logging, e.g. "none", "3s", "120s"
 * @property {number}   [crawlDelayMs]    Per-request sleep (default 1000). MUST be set ≥ robots Crawl-delay×1000.
 * @property {number}   [fetchTimeoutMs]  HTTP fetch timeout (default 30000)
 * @property {number}   [maxConcurrency]  Parallel fetches (default 1; raise carefully — most state servers
 *                                        will rate-limit at 2-3 concurrent and Akamai-fronted sites at 1)
 * @property {Set<string>} [allowedHosts] Host allow-list. fetchSection refuses URLs outside this set.
 * @property {string}   [userAgent]       Override default UA
 * @property {(s:any)=>string|null} [normalizeSectionNum] Optional canonicalizer for section IDs
 */

// ---------------------------------------------------------------------------
// Row schema — IDENTICAL to unicourt-harness.mjs (same target table)
// ---------------------------------------------------------------------------

const StatuteRowSchema = z.object({
  jurisdiction: z.string().min(1).max(100),
  title: z.string().min(1).max(20),
  section: z.string().min(1).max(100),
  subsection: z.null(),
  section_text: z.string().min(1).max(50000),
  is_current: z.literal(true),
  source_urls: z.array(z.string().url()).min(1).max(10),
  text_hash: z.string().regex(/^[a-f0-9]{64}$/),
  effective_date: z.null(),
  scraped_at: z.string().datetime(),
});

const DEFAULT_USER_AGENT = 'INAA-legal-research/1.0 (+https://imnotanattorney.com/about)';

// ---------------------------------------------------------------------------
// Hash — MUST match unicourt-harness.computeSectionHash byte-for-byte
// ---------------------------------------------------------------------------

/**
 * SHA-256 of `${titleText}\n\n${bodyText}` — matches section_text storage format.
 * @param {string} titleText
 * @param {string} bodyText
 * @returns {string}
 */
export function computeSectionHash(titleText, bodyText) {
  const sectionText = `${titleText}\n\n${bodyText}`;
  return crypto.createHash('sha256').update(sectionText, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Row builder — same shape as unicourt-harness.buildSectionRow (deliberate)
// ---------------------------------------------------------------------------

export function buildSectionRow(config, chapterNum, sectionNum, titleText, bodyText) {
  if (!titleText || !titleText.trim()) {
    return { row: null, errors: ['titleText must be non-empty'] };
  }
  if (!bodyText || !bodyText.trim()) {
    return { row: null, errors: ['bodyText must be non-empty'] };
  }

  const now = new Date().toISOString();
  const sourceUrl = config.buildSourceUrl(sectionNum);
  const sectionText = `${titleText.slice(0, 500)}\n\n${bodyText.slice(0, 49490)}`;

  const raw = {
    jurisdiction: config.stateCode,
    title: config.titleNum,
    section: sectionNum,
    subsection: null,
    section_text: sectionText,
    is_current: true,
    source_urls: [sourceUrl],
    text_hash: computeSectionHash(titleText, bodyText),
    effective_date: null,
    scraped_at: now,
  };

  const result = StatuteRowSchema.safeParse(raw);
  if (!result.success) {
    const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    return { row: null, errors };
  }
  return { row: result.data, errors: [] };
}

// ---------------------------------------------------------------------------
// Fetch with retry + timeout — mirrors unicourt-harness.fetchWithRetry shape
// ---------------------------------------------------------------------------

/**
 * @param {string} url
 * @param {{timeoutMs?:number, maxRetries?:number, userAgent?:string}} [opts]
 */
export async function fetchWithRetry(url, opts = {}) {
  const { timeoutMs = 30000, maxRetries = 3, userAgent = DEFAULT_USER_AGENT } = opts;
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': userAgent, 'Accept': 'text/html,application/xhtml+xml' },
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      return await res.text();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < maxRetries) {
        const delay = 1000 * attempt;
        console.warn(`  [fetch] attempt ${attempt} failed: ${err.message} — retry in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Section fetch — host allow-list + per-state crawl-delay sleep
// ---------------------------------------------------------------------------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Fetch one section, honoring host allow-list + crawl-delay.
 * @param {BucketBSectionDescriptor} desc
 * @param {BucketBStateConfig} config
 */
export async function fetchSection(desc, config) {
  if (config.allowedHosts && config.allowedHosts.size > 0) {
    let host;
    try { host = new URL(desc.sectionUrl).host.toLowerCase(); } catch {
      throw new Error(`invalid section URL: ${desc.sectionUrl}`);
    }
    if (!config.allowedHosts.has(host)) {
      throw new Error(`section URL host ${host} not in allowedHosts`);
    }
  }
  const html = await fetchWithRetry(desc.sectionUrl, {
    timeoutMs: config.fetchTimeoutMs ?? 30000,
    userAgent: config.userAgent ?? DEFAULT_USER_AGENT,
  });
  const delay = config.crawlDelayMs ?? 1000;
  if (delay > 0) await sleep(delay);
  return html;
}

// ---------------------------------------------------------------------------
// DB apply — IDENTICAL to unicourt-harness.applyToDb (intentional symmetry)
// ---------------------------------------------------------------------------

function textArrayLiteral(arr) {
  if (!arr || arr.length === 0) return '{}';
  const escaped = arr.map(s => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
  return '{' + escaped.join(',') + '}';
}

/**
 * Idempotent DELETE-then-COPY pattern (matches unicourt-harness exactly).
 * @param {object[]} rows
 * @param {BucketBStateConfig} config
 * @param {{ dryRun?:boolean, connectionString:string }} opts
 */
export async function applyToDb(rows, config, { dryRun = false, connectionString }) {
  if (dryRun) {
    console.log(`[dry-run] would COPY ${rows.length} rows for ${config.stateName} title ${config.titleNum}`);
    for (const r of rows.slice(0, 3)) {
      console.log(`  ${r.jurisdiction} § ${r.section}: ${r.section_text.slice(0, 60).replace(/\n/g, ' ')}`);
    }
    if (rows.length > 3) console.log(`  …and ${rows.length - 3} more`);
    return { rowCount: rows.length, durationMs: 0 };
  }

  const { client, cleanup } = await createBulkClient({ connectionString });
  try {
    await client.query('BEGIN');
    const del = await client.query(
      `DELETE FROM entities_statutes WHERE jurisdiction IN ($1, $2) AND title = $3`,
      [config.stateCode, config.stateName, config.titleNum],
    );
    console.log(`  deleted ${del.rowCount} existing rows for ${config.stateCode}/${config.stateName} title ${config.titleNum}`);

    const COLUMNS = [
      'jurisdiction', 'title', 'section', 'subsection',
      'section_text', 'is_current', 'source_urls', 'text_hash',
      'effective_date', 'scraped_at',
    ];

    function rowToArray(r) {
      return [
        r.jurisdiction, r.title, r.section, null,
        r.section_text, true, textArrayLiteral(r.source_urls), r.text_hash,
        null, r.scraped_at,
      ];
    }

    async function* rowsIter() { for (const r of rows) yield rowToArray(r); }
    const { rowCount, durationMs } = await bulkCopyRows(client, 'entities_statutes', COLUMNS, rowsIter());
    await client.query('COMMIT');
    return { rowCount, durationMs };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await cleanup();
  }
}

// ---------------------------------------------------------------------------
// Main entry point — Bucket B traversal
// ---------------------------------------------------------------------------

/**
 * Full ingest pipeline for one state's templated-HTML criminal title.
 *
 * Stages:
 *   1. Fetch chapterListUrl  → discoverSections() returns N descriptors
 *   2. For each descriptor (with crawl-delay sleep between):
 *        fetch section URL → parseSection → buildSectionRow
 *   3. applyToDb (DELETE + COPY)
 *
 * @param {BucketBStateConfig} config
 * @param {{ dryRun?:boolean, connectionString?:string, verbose?:boolean, limit?:number }} [opts]
 */
export async function ingestBucketBState(config, opts = {}) {
  const { dryRun = false, verbose = false, limit = null } = opts;
  const connectionString = opts.connectionString || process.env.SUPABASE_DB_URL;
  if (!connectionString && !dryRun) {
    throw new Error('connectionString or SUPABASE_DB_URL required for live run');
  }

  const t0 = Date.now();
  console.log(`[bucket-b-html] ${config.stateCode} title ${config.titleNum} — fetching TOC: ${config.chapterListUrl}`);

  const tocHtml = await fetchWithRetry(config.chapterListUrl, {
    timeoutMs: config.fetchTimeoutMs ?? 60000,
    userAgent: config.userAgent ?? DEFAULT_USER_AGENT,
  });
  console.log(`  TOC fetched (${Math.round(tocHtml.length / 1024)}KB)`);

  const descriptors = config.discoverSections(tocHtml, config);
  console.log(`  discovered ${descriptors.length} sections`);

  const targets = limit ? descriptors.slice(0, limit) : descriptors;
  if (limit) console.log(`  limit=${limit} — processing first ${targets.length}`);

  const rows = [];
  const errors = [];
  const skipped = [];
  let fetchCount = 0;

  for (const desc of targets) {
    fetchCount++;
    if (verbose && fetchCount % 25 === 0) {
      console.log(`  [progress] ${fetchCount}/${targets.length}`);
    }
    let sectionHtml;
    try {
      sectionHtml = await fetchSection(desc, config);
    } catch (err) {
      errors.push({ sectionNum: desc.sectionNum, errors: [`fetch: ${err.message}`] });
      continue;
    }
    const parsed = config.parseSection(sectionHtml, desc.sectionNum, config);
    if (!parsed) {
      skipped.push(`${desc.sectionNum} (parser returned null)`);
      continue;
    }
    const { row, errors: rowErrors } = buildSectionRow(
      config, desc.chapterNum, desc.sectionNum, parsed.titleText, parsed.bodyText,
    );
    if (rowErrors.length > 0) {
      errors.push({ sectionNum: desc.sectionNum, errors: rowErrors });
      if (verbose) console.warn(`  [skip] ${desc.sectionNum}: ${rowErrors.join('; ')}`);
    } else {
      rows.push(row);
    }
  }

  console.log(`  valid rows: ${rows.length}, skipped: ${skipped.length}, errors: ${errors.length}`);
  if (errors.length > 0) {
    console.warn('  validation errors:');
    for (const e of errors.slice(0, 10)) {
      console.warn(`    ${e.sectionNum}: ${e.errors.join('; ')}`);
    }
  }

  const { rowCount, durationMs: copyMs } = await applyToDb(rows, config, { dryRun, connectionString });
  const totalMs = Date.now() - t0;
  console.log(`  done: ${rowCount} rows in ${totalMs}ms (copy: ${copyMs}ms)`);

  return {
    rowCount,
    skipCount: skipped.length,
    errorCount: errors.length,
    durationMs: totalMs,
  };
}

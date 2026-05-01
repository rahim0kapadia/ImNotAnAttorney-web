// Template: scripts/lib/unicourt-harness.mjs
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows
// Pattern: cl-bulk-data-defensive #19 — csv-bulk-checked annotation per state
// Pattern: no-hallucinated-legal-data — every row carries a verified HTTPS source URL
// csv-bulk-checked: none-exists — Justia (law.justia.com) returns Cloudflare 403 to
//   non-browser fetches even with realistic UA + 2s delay (probed 2026-05-01,
//   confirms scrape-statutes-justia.mjs's documented pivot). State legislature
//   publishers serve the same statute text without bot-detection. Per-section
//   authoritative URLs are stored in source_urls[] regardless.
//
// Per-section-fetch harness for state criminal codes that lack a bulk source.
// Generalizes the GA UniCourt harness shape (config + parseTitle callback +
// bulk COPY) to states where the title is NOT distributed as a single HTML
// file and must be assembled chapter-by-chapter / section-by-section from a
// state-legislature publisher.
//
// Schema (entities_statutes — verified 2026-04-24 via migration 20260423e):
//   canonical_id    UUID PRIMARY KEY (DB-generated)
//   jurisdiction    TEXT NOT NULL    ← 2-letter state code, e.g. "MA", "KS"
//   title           TEXT             ← criminal title number/label as string
//   section         TEXT NOT NULL    ← state-native section ID (e.g. "265-1")
//   subsection      TEXT             ← always NULL for seeded rows
//   section_text    TEXT             ← `${titleText}\n\n${bodyText}`
//   is_current      BOOLEAN          ← always true
//   source_urls     TEXT[]           ← [stateLegUrl] (HTTPS, allowlisted host)
//   text_hash       TEXT             ← SHA-256 of section_text
//   effective_date  DATE             ← NULL unless parseSection returns a date
//   scraped_at      TIMESTAMPTZ      ← now()
//
// Usage:
//   import { ingestStateBySections } from '../lib/justia-harness.mjs';
//   const result = await ingestStateBySections(MA_CONFIG, { dryRun: false });

import crypto from 'node:crypto';
import { z } from 'zod';
import { createBulkClient, bulkCopyRows } from './pg-bulk-defaults.mjs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} JustiaParsedSection
 * @property {string}      titleText      heading text (may be empty before fallback)
 * @property {string}      bodyText       body text (must be non-empty)
 * @property {string|null} [effectiveDate] ISO date or null
 */

/**
 * @typedef {Object} JustiaStateConfig
 * @property {string}   stateCode               2-letter state code, e.g. "MA"
 * @property {string}   stateName               Full state name, e.g. "Massachusetts"
 * @property {string}   titleNum                Criminal title number/label, e.g. "I"
 * @property {string}   titleLabel              Human label, e.g. "Crimes and Punishments"
 * @property {string[]} chapterRootUrls         Chapter index URLs (one per chapter)
 * @property {string[]} allowedHosts            Allowlisted hostnames for source URLs
 * @property {Function} discoverSectionUrls     (chapterHtml, chapterUrl) => string[]
 * @property {Function} parseSection            (sectionHtml, ctx) => JustiaParsedSection|null
 * @property {Function} sectionIdFromUrl        (sectionUrl) => string  // canonical ID for `section` column
 * @property {number}   [crawlDelayMs]          Per-fetch delay (default 1500ms)
 * @property {number}   [fetchTimeoutMs]        HTTP fetch timeout (default 30000)
 * @property {number}   [maxSections]           Optional safety cap for dry-runs
 */

// ---------------------------------------------------------------------------
// Row schema (mirrors entities_statutes live columns)
// ---------------------------------------------------------------------------

export const StatuteRowSchema = z.object({
  jurisdiction: z.string().regex(/^[A-Z]{2}$/, 'jurisdiction must be a 2-letter state code'),
  title: z.string().min(1).max(20),
  section: z.string().min(1).max(100),
  subsection: z.null(),
  section_text: z.string().min(20).max(50000),
  is_current: z.literal(true),
  source_urls: z.array(z.string().url().max(2048)).min(1).max(10),
  text_hash: z.string().regex(/^[a-f0-9]{64}$/),
  effective_date: z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    z.null(),
  ]),
  scraped_at: z.string().datetime().max(40),
});

// ---------------------------------------------------------------------------
// Hash
// ---------------------------------------------------------------------------

/**
 * SHA-256 of `${titleText}\n\n${bodyText}` — matches section_text storage format.
 * @param {string} titleText
 * @param {string} bodyText
 * @returns {string} hex string (64 chars)
 */
export function computeSectionHash(titleText, bodyText) {
  return crypto
    .createHash('sha256')
    .update(`${titleText}\n\n${bodyText}`, 'utf8')
    .digest('hex');
}

// ---------------------------------------------------------------------------
// Allowlist guard
// ---------------------------------------------------------------------------

/**
 * Reject any URL that is not HTTPS or whose host is not on the per-state
 * allowlist. Belt-and-suspenders against parser bugs that could capture
 * `<a href="https://malicious.tld/...">` from page navigation.
 *
 * @param {string} url
 * @param {Set<string>} allowedHosts (lowercased hostnames)
 * @returns {boolean}
 */
export function isAllowedSourceUrl(url, allowedHosts) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    return allowedHosts.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Row builder
// ---------------------------------------------------------------------------

/**
 * Build a validated DB row for one parsed section.
 *
 * @param {JustiaStateConfig} config
 * @param {string}            sectionId       canonical section ID
 * @param {string}            sectionUrl      authoritative URL we fetched
 * @param {JustiaParsedSection} parsed
 * @returns {{ row: object|null, errors: string[] }}
 */
export function buildSectionRow(config, sectionId, sectionUrl, parsed) {
  if (!parsed || !parsed.bodyText || !parsed.bodyText.trim()) {
    return { row: null, errors: ['bodyText must be non-empty'] };
  }

  const titleText = (parsed.titleText || `Section ${sectionId}`).trim();
  const bodyText = parsed.bodyText.trim();

  // Cap to schema ceiling (50000) leaving room for the title prefix + separator.
  const sectionText = `${titleText.slice(0, 500)}\n\n${bodyText.slice(0, 49490)}`;

  const allowedHostsSet = new Set(config.allowedHosts.map((h) => h.toLowerCase()));
  if (!isAllowedSourceUrl(sectionUrl, allowedHostsSet)) {
    return { row: null, errors: [`sourceUrl not on allowlist or not HTTPS: ${sectionUrl}`] };
  }

  const raw = {
    jurisdiction: config.stateCode,
    title: config.titleNum,
    section: sectionId,
    subsection: null,
    section_text: sectionText,
    is_current: true,
    source_urls: [sectionUrl],
    text_hash: computeSectionHash(titleText, bodyText),
    effective_date: parsed.effectiveDate || null,
    scraped_at: new Date().toISOString(),
  };

  const result = StatuteRowSchema.safeParse(raw);
  if (!result.success) {
    return {
      row: null,
      errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    };
  }
  return { row: result.data, errors: [] };
}

// ---------------------------------------------------------------------------
// Fetch with rate limit + retry + circuit breaker
// ---------------------------------------------------------------------------

const RETRY_BACKOFFS_MS = [5000, 30000, 120000];
const CIRCUIT_BREAKER_FAILURES = 4;
const CIRCUIT_BREAKER_PAUSE_MS = 120000;

const breakerState = { consecutiveFailures: 0, openUntil: 0 };

/** Reset breaker state — for tests. */
export function _resetBreakerForTests() {
  breakerState.consecutiveFailures = 0;
  breakerState.openUntil = 0;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * Fetch one URL with rate-limit, retry (5s/30s/2m exponential), circuit
 * breaker (4 consecutive failures → 2-min pause).
 *
 * @param {string} url
 * @param {{ allowedHosts: string[], crawlDelayMs?: number, fetchTimeoutMs?: number, fetchImpl?: Function }} opts
 * @returns {Promise<string>} response body text
 */
export async function fetchWithRetry(url, opts = {}) {
  const allowedHostsSet = new Set((opts.allowedHosts || []).map((h) => h.toLowerCase()));
  if (!isAllowedSourceUrl(url, allowedHostsSet)) {
    throw new Error(`Host not on allowlist or not HTTPS: ${url}`);
  }
  const crawlDelayMs = opts.crawlDelayMs ?? 1500;
  const fetchTimeoutMs = opts.fetchTimeoutMs ?? 30000;
  const doFetch = opts.fetchImpl || fetch;

  if (breakerState.openUntil > Date.now()) {
    await sleep(breakerState.openUntil - Date.now());
    breakerState.consecutiveFailures = 0;
  }

  // Crawl-delay before EACH fetch (robots-respectful).
  await sleep(crawlDelayMs);

  let lastErr;
  for (let attempt = 0; attempt < RETRY_BACKOFFS_MS.length; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), fetchTimeoutMs);
    let resp;
    try {
      resp = await doFetch(url, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'ImNotAnAttorney-statute-seed/1.0 (legal research)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
      });
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (attempt < RETRY_BACKOFFS_MS.length - 1) await sleep(RETRY_BACKOFFS_MS[attempt]);
      continue;
    }
    clearTimeout(timer);
    if (resp.ok) {
      breakerState.consecutiveFailures = 0;
      return await resp.text();
    }
    lastErr = new Error(`HTTP ${resp.status} ${resp.statusText} for ${url}`);
    const retryable = resp.status >= 500 || resp.status === 429;
    if (!retryable) {
      // Non-retryable (404/403) — surface immediately, do NOT trip breaker.
      throw lastErr;
    }
    if (attempt < RETRY_BACKOFFS_MS.length - 1) await sleep(RETRY_BACKOFFS_MS[attempt]);
  }
  breakerState.consecutiveFailures += 1;
  if (breakerState.consecutiveFailures >= CIRCUIT_BREAKER_FAILURES) {
    breakerState.openUntil = Date.now() + CIRCUIT_BREAKER_PAUSE_MS;
    console.warn('  circuit breaker OPEN');
  }
  throw lastErr || new Error(`exhausted retries for ${url}`);
}

// ---------------------------------------------------------------------------
// COPY helpers
// ---------------------------------------------------------------------------

export function textArrayLiteral(arr) {
  if (!arr || arr.length === 0) return '{}';
  const parts = arr.map((u) => {
    const safe = String(u)
      .split('\\').join('\\\\')
      .split('"').join('\\"')
      .split('\r').join(' ')
      .split('\n').join(' ');
    return `"${safe}"`;
  });
  return `{${parts.join(',')}}`;
}

const COPY_COLS = [
  'jurisdiction', 'title', 'section', 'subsection',
  'section_text', 'is_current', 'source_urls', 'text_hash',
  'effective_date', 'scraped_at',
];

/**
 * Apply rows to entities_statutes via DELETE-then-COPY in a transaction.
 * Idempotent: re-runs replace prior rows for (state, title, section ANY).
 *
 * @param {object[]} rows
 * @param {JustiaStateConfig} config
 * @param {{ dryRun?: boolean, dbFactory?: Function }} opts
 * @returns {Promise<{ rowCount: number, durationMs: number, deleted: number }>}
 */
export async function applyToDb(rows, config, opts = {}) {
  const { dryRun = false, dbFactory = createBulkClient } = opts;
  if (dryRun) {
    console.log(`[dry-run] would COPY ${rows.length} rows for ${config.stateCode} title ${config.titleNum}`);
    for (const r of rows.slice(0, 3)) {
      const preview = r.section_text.slice(0, 60).replace(/\n/g, ' ');
      console.log(`  ${r.jurisdiction} § ${r.section}: ${preview}`);
    }
    if (rows.length > 3) console.log(`  …and ${rows.length - 3} more`);
    return { rowCount: rows.length, durationMs: 0, deleted: 0 };
  }

  const t0 = Date.now();
  const { client, cleanup } = await dbFactory();
  try {
    await client.query('BEGIN');
    try {
      const sectionIds = rows.map((r) => r.section);
      const { rowCount: deleted } = await client.query(
        'DELETE FROM entities_statutes WHERE jurisdiction = $1 AND title = $2 AND section = ANY($3::text[])',
        [config.stateCode, config.titleNum, sectionIds],
      );
      console.log(`  deleted ${deleted} prior rows for ${config.stateCode} title ${config.titleNum}`);

      async function* rowsGen() {
        for (const r of rows) {
          yield [
            r.jurisdiction,
            r.title,
            r.section,
            r.subsection,
            r.section_text,
            r.is_current,
            textArrayLiteral(r.source_urls),
            r.text_hash,
            r.effective_date,
            r.scraped_at,
          ];
        }
      }
      const { rowCount, durationMs } = await bulkCopyRows(client, 'entities_statutes', COPY_COLS, rowsGen());

      // Pre-commit verify: all rows must have non-empty source_urls and section_text.
      const { rows: vRows } = await client.query(
        `SELECT
           count(*)::int                                                       AS n,
           sum(CASE WHEN array_length(source_urls,1) IS NULL THEN 1 ELSE 0 END)::int AS missing_sources,
           sum(CASE WHEN section_text IS NULL OR section_text = '' THEN 1 ELSE 0 END)::int AS empty_body
         FROM entities_statutes WHERE jurisdiction = $1 AND title = $2`,
        [config.stateCode, config.titleNum],
      );
      const v = vRows[0];
      console.log(`  pre-commit verify: ${JSON.stringify(v)}`);
      if (v.missing_sources > 0) throw new Error(`${v.missing_sources} rows have empty source_urls`);
      if (v.empty_body > 0) throw new Error(`${v.empty_body} rows have empty section_text`);

      await client.query('COMMIT');
      const durationMs2 = Date.now() - t0;
      return { rowCount, durationMs: durationMs2, deleted };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    }
  } finally {
    await cleanup();
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Full per-section ingest pipeline for one state's criminal title.
 *
 * Steps:
 *   1. For each chapter root URL, fetch + discoverSectionUrls.
 *   2. Dedupe section URLs across chapters.
 *   3. For each section URL: fetch (rate-limited), parseSection, buildSectionRow.
 *   4. DELETE-then-COPY into entities_statutes inside one transaction.
 *
 * @param {JustiaStateConfig} config
 * @param {{ dryRun?: boolean, verbose?: boolean, fetchImpl?: Function, dbFactory?: Function }} [opts]
 * @returns {Promise<{ rowCount: number, skipCount: number, errorCount: number, durationMs: number, byChapter: Record<string,{discovered:number,parsed:number,rejected:number}> }>}
 */
export async function ingestStateBySections(config, opts = {}) {
  const { dryRun = false, verbose = false, fetchImpl, dbFactory } = opts;
  const t0 = Date.now();
  const fetchOpts = {
    allowedHosts: config.allowedHosts,
    crawlDelayMs: config.crawlDelayMs,
    fetchTimeoutMs: config.fetchTimeoutMs,
    fetchImpl,
  };

  console.log(`[justia-harness] ${config.stateCode} title ${config.titleNum} — ${config.chapterRootUrls.length} chapter(s)`);

  // ---- Step 1: discover section URLs from each chapter ----
  const sectionUrls = new Set();
  const byChapter = {};
  for (const chapterUrl of config.chapterRootUrls) {
    const chapterLabel = chapterUrl;
    let chapterHtml;
    try {
      chapterHtml = await fetchWithRetry(chapterUrl, fetchOpts);
    } catch (e) {
      console.warn(`  WARN chapter ${chapterUrl}: ${e.message}`);
      byChapter[chapterLabel] = { discovered: 0, parsed: 0, rejected: 0, status: 'index_failed' };
      continue;
    }
    const discovered = config.discoverSectionUrls(chapterHtml, chapterUrl);
    let added = 0;
    for (const u of discovered) {
      if (typeof u !== 'string') continue;
      if (sectionUrls.has(u)) continue;
      sectionUrls.add(u);
      added += 1;
    }
    byChapter[chapterLabel] = { discovered: discovered.length, parsed: 0, rejected: 0, added };
    console.log(`  chapter ${chapterUrl}: discovered ${discovered.length} (${added} new)`);
  }

  let allUrls = [...sectionUrls];
  if (config.maxSections && allUrls.length > config.maxSections) {
    console.log(`  applying maxSections=${config.maxSections} (was ${allUrls.length})`);
    allUrls = allUrls.slice(0, config.maxSections);
  }
  console.log(`  total unique section URLs: ${allUrls.length}`);

  // ---- Step 2-3: fetch + parse + build row ----
  const rows = [];
  const errors = [];
  let parsedCount = 0;
  let fetchFailed = 0;

  for (const sectionUrl of allUrls) {
    const sectionId = config.sectionIdFromUrl(sectionUrl);
    let html;
    try {
      html = await fetchWithRetry(sectionUrl, fetchOpts);
    } catch (e) {
      fetchFailed += 1;
      if (verbose) console.warn(`    section fetch failed ${sectionUrl}: ${e.message}`);
      continue;
    }
    const parsed = config.parseSection(html, { sectionId, sectionUrl });
    if (!parsed) {
      errors.push({ sectionId, sectionUrl, errors: ['parseSection returned null'] });
      continue;
    }
    const { row, errors: rowErrors } = buildSectionRow(config, sectionId, sectionUrl, parsed);
    if (rowErrors.length > 0) {
      errors.push({ sectionId, sectionUrl, errors: rowErrors });
      if (verbose) console.warn(`    [skip] ${sectionId}: ${rowErrors.join('; ')}`);
      continue;
    }
    rows.push(row);
    parsedCount += 1;
    if (parsedCount <= 3) {
      console.log(`    OK ${sectionId} — ${row.section_text.slice(0, 60).replace(/\n/g, ' ')}`);
    }
  }

  console.log(`  fetched: ${allUrls.length}, fetch_failed: ${fetchFailed}, parsed: ${parsedCount}, rejected: ${errors.length}`);

  if (errors.length > 0) {
    console.warn(`  validation errors (showing first 10):`);
    for (const e of errors.slice(0, 10)) {
      console.warn(`    ${e.sectionId}: ${e.errors.join('; ')}`);
    }
  }

  // ---- Step 4: dedupe by section + apply ----
  const seen = new Map();
  for (const r of rows) {
    if (!seen.has(r.section)) seen.set(r.section, r);
  }
  const deduped = [...seen.values()];

  if (deduped.length === 0 && !dryRun) {
    throw new Error('ingestStateBySections: no rows parsed — refusing to write');
  }

  const { rowCount, durationMs: copyMs, deleted } = await applyToDb(deduped, config, { dryRun, dbFactory });

  const totalMs = Date.now() - t0;
  console.log(`  done: ${rowCount} rows in ${totalMs}ms (copy: ${copyMs}ms, deleted prior: ${deleted})`);

  return {
    rowCount,
    skipCount: fetchFailed,
    errorCount: errors.length,
    durationMs: totalMs,
    byChapter,
  };
}

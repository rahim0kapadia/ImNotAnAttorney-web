// Template: apps/web/scripts/ingest/seed-statutes-va.mjs
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows
// csv-bulk-checked: none-exists — UniCourt cic-code repos are the closest bulk source;
//   per-section authoritative URLs still required (Justia/official-state)
//
// Shared harness for seeding statutes from UniCourt cic-code-* GitHub repos.
// UniCourt repos are public domain per Georgia v. Public.Resource.Org (SCOTUS 2020).
// This harness handles: fetch → parse → validate → bulk COPY INTO entities_statutes.
//
// Schema: entities_statutes live shape (verified 2026-04-24 via migration 20260423e):
//   canonical_id    UUID PRIMARY KEY (DB-generated, not provided)
//   jurisdiction    TEXT NOT NULL   ← stateName e.g. "Georgia"
//   title           TEXT            ← titleNum  e.g. "16"
//   section         TEXT NOT NULL   ← sectionNum e.g. "16-3-21"
//   subsection      TEXT            ← always NULL for seeded rows
//   section_text    TEXT            ← merged "${titleText}\n\n${bodyText}"
//   is_current      BOOLEAN         ← always true for seeded rows
//   source_urls     TEXT[]          ← [justiaUrl]
//   text_hash       TEXT            ← SHA-256 of section_text
//   effective_date  DATE            ← NULL (GA statutes lack machine-readable dates)
//   scraped_at      TIMESTAMPTZ     ← now() at seed time
//
// Usage: import { ingestState } from '../lib/unicourt-harness.mjs'
//        const result = await ingestState(GA_CONFIG, { dryRun: false })

import crypto from 'crypto';
import { z } from 'zod';
import { createBulkClient, bulkCopyRows } from './pg-bulk-defaults.mjs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} UnicourtStateConfig
 * @property {string}   stateCode         Two-letter state code, e.g. "GA"
 * @property {string}   stateName         Full state name, e.g. "Georgia"
 * @property {string}   titleNum          Criminal title number as string, e.g. "16"
 * @property {string}   titleLabel        Human label, e.g. "Crimes and Offenses"
 * @property {string}   titleUrl          URL of single-file title HTML (UniCourt GitHub Pages)
 * @property {Function} parseTitle        (html: string) => GaSection[] — state-specific parser
 * @property {Function} buildSourceUrl    (sectionNum: string) => string — authoritative URL
 * @property {string}   [crawlDelay]      Robots crawl-delay string, e.g. "none"
 * @property {number}   [fetchTimeoutMs]  HTTP fetch timeout (default 30000)
 * @property {Function} [fetchTitle]      (url: string, opts: {timeoutMs?: number}) => Promise<string>
 *                                        — optional fetch override for non-UTF-8 sources (e.g. SD UTF-16LE).
 *                                        Default: fetchWithRetry (UTF-8 via res.text()).
 */

// ---------------------------------------------------------------------------
// Row schema (mirrors entities_statutes live columns — verified 2026-04-24)
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

// ---------------------------------------------------------------------------
// Hash
// ---------------------------------------------------------------------------

/**
 * SHA-256 of `${titleText}\n\n${bodyText}` — matches section_text storage format.
 * Deterministic content fingerprint stored as text_hash.
 * @param {string} titleText
 * @param {string} bodyText
 * @returns {string} hex string (64 chars)
 */
export function computeSectionHash(titleText, bodyText) {
  const sectionText = `${titleText}\n\n${bodyText}`;
  return crypto
    .createHash('sha256')
    .update(sectionText, 'utf8')
    .digest('hex');
}

// ---------------------------------------------------------------------------
// Row builder
// ---------------------------------------------------------------------------

/**
 * Build a validated DB row for one parsed section.
 *
 * @param {UnicourtStateConfig} config
 * @param {string} chapterNum  e.g. "1", "3"  (unused in schema, kept for logging/compat)
 * @param {string} sectionNum  e.g. "16-3-21"
 * @param {string} titleText   stripped heading text
 * @param {string} bodyText    stripped body text
 * @returns {{ row: object|null, errors: string[] }}
 */
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
    // 2-letter code matches the convention enforced across all prior states
    // (VA/NC/FL/OH/MN/AR/...). Full state name was a regression on first GA
    // run that created 'Georgia' rows alongside legacy 'GA' rows.
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
// Fetch
// ---------------------------------------------------------------------------

/**
 * Fetch with timeout and simple retry (mirrors va seed fetchWithRetry).
 * @param {string} url
 * @param {Object} [opts]
 * @param {number} [opts.timeoutMs]
 * @param {number} [opts.maxRetries]
 * @returns {Promise<string>} response body text
 */
export async function fetchWithRetry(url, { timeoutMs = 30000, maxRetries = 3 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'ImNotAnAttorney-statute-seed/1.0 (legal research)' },
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
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
// DB apply
// ---------------------------------------------------------------------------

/**
 * Encode a JS string array as a Postgres text[] literal for COPY.
 * e.g. ["https://a.com"] → '{"https://a.com"}'
 */
function textArrayLiteral(arr) {
  if (!arr || arr.length === 0) return '{}';
  const escaped = arr.map(s => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
  return '{' + escaped.join(',') + '}';
}

/**
 * Write rows to entities_statutes via COPY FROM STDIN inside a transaction.
 * DELETE + COPY ensures idempotency (re-runnable seed).
 *
 * @param {object[]} rows            Validated row objects from buildSectionRow
 * @param {UnicourtStateConfig} config
 * @param {{ dryRun?: boolean, connectionString: string }} opts
 * @returns {Promise<{ rowCount: number, durationMs: number }>}
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

    // Idempotent: delete existing rows for this state + title before re-seeding
    // DELETE under BOTH stateCode (current convention) AND stateName so a
    // pre-fix run that wrote 'Georgia' rows is cleared on re-seed without
    // a manual cleanup step.
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
        r.jurisdiction,
        r.title,
        r.section,
        null,                            // subsection — NULL
        r.section_text,
        true,                            // is_current — csvEscape handles boolean → 't'
        textArrayLiteral(r.source_urls),
        r.text_hash,
        null,                            // effective_date — NULL
        r.scraped_at,
      ];
    }

    async function* rowsIter() {
      for (const r of rows) yield rowToArray(r);
    }

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
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Full ingest pipeline for one state's criminal title.
 *
 * @param {UnicourtStateConfig} config
 * @param {{ dryRun?: boolean, connectionString?: string, verbose?: boolean }} [opts]
 * @returns {Promise<{ rowCount: number, skipCount: number, errorCount: number, durationMs: number }>}
 */
export async function ingestState(config, opts = {}) {
  const { dryRun = false, verbose = false } = opts;
  const connectionString = opts.connectionString || process.env.SUPABASE_DB_URL;
  if (!connectionString && !dryRun) {
    throw new Error('connectionString or SUPABASE_DB_URL required for live run');
  }

  const t0 = Date.now();
  console.log(`[unicourt-harness] fetching ${config.stateCode} Title ${config.titleNum} from ${config.titleUrl}`);

  const fetchFn = config.fetchTitle || fetchWithRetry;
  const html = await fetchFn(config.titleUrl, { timeoutMs: config.fetchTimeoutMs ?? 60000 });
  console.log(`  fetched ${Math.round(html.length / 1024)}KB`);

  console.log(`  parsing sections…`);
  const sections = config.parseTitle(html);
  console.log(`  found ${sections.length} sections`);

  const rows = [];
  const skipped = [];
  const errors = [];

  for (const sec of sections) {
    if (!sec.titleText || !sec.bodyText) {
      skipped.push(sec.sectionNum + ' (empty title or body)');
      continue;
    }
    const { row, errors: rowErrors } = buildSectionRow(
      config,
      sec.chapterNum,
      sec.sectionNum,
      sec.titleText,
      sec.bodyText,
    );
    if (rowErrors.length > 0) {
      errors.push({ sectionNum: sec.sectionNum, errors: rowErrors });
      if (verbose) console.warn(`  [skip] ${sec.sectionNum}: ${rowErrors.join('; ')}`);
    } else {
      rows.push(row);
    }
  }

  console.log(`  valid rows: ${rows.length}, skipped: ${skipped.length}, errors: ${errors.length}`);

  if (errors.length > 0) {
    console.warn(`  validation errors:`);
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

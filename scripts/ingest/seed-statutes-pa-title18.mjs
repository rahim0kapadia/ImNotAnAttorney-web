// Template: scripts/ingest/seed-statutes-fl.mjs
// csv-bulk-checked: none-exists — PA statutes are HTML-only via palegis.us; no bulk CSV published
// Pattern: cl-bulk-data-defensive #18
//
// PA Title 18 (Crimes and Offenses) statute seed.
// Source: palegis.us iframe URLs (direct fetch, no JS required).
//   TOC:     https://www.palegis.us/statutes/consolidated/view-statute?30&iFrame=true&txtType=HTM&ttl=18&div=0&chpt=0&sctn=0&subsctn=0
//   Section: https://www.palegis.us/statutes/consolidated/view-statute?30&iFrame=true&txtType=HTM&ttl=18&div={D}&chpt={C}&sctn={S}&subsctn=0
// Target: entities_statutes (one row per statute section, skip chapter headers).
// Coverage: All Title 18 sections (663+ statute entries, skip ~56 chapter headers).
//
// Every row carries non-empty source_urls[] pointing to the palegis.us URL fetched.
// Zod contract rejects any row that fails the integrity check BEFORE INSERT.
//
// Usage:
//   node scripts/ingest/seed-statutes-pa-title18.mjs --dry-run           # preview only
//   node scripts/ingest/seed-statutes-pa-title18.mjs --limit=20          # first 20 sections
//   node scripts/ingest/seed-statutes-pa-title18.mjs --chapters=25,27    # subset by chapter
//   node scripts/ingest/seed-statutes-pa-title18.mjs                     # full Title 18
//
// Rate model: 1500ms fixed delay per section fetch (palegis.us robots.txt: no Crawl-delay),
// 3 retries with 5s/30s/120s backoffs, circuit breaker 120s after 3 consecutive failures.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';
import {
  parseTitleToc,
  parseSectionPage,
  isChapterHeader,
  isSectionNotFound,
  buildPaUrl,
  stripHtml,
} from './lib/pa-html.mjs';

// Re-export helpers for tests without pulling in the main() runner.
export {
  parseTitleToc,
  parseSectionPage,
  isChapterHeader,
  isSectionNotFound,
  buildPaUrl,
  stripHtml,
};

// ── Env loader (line-by-line, indexOf — no regex on file contents) ─────────
const envPaths = [
  'C:/Users/email/projects/ImNotAnAttorney-web/.env.local',
];
const VALID_KEY_RX = /^[A-Z_][A-Z0-9_]*$/;
for (const p of envPaths) {
  if (!fs.existsSync(p)) continue;
  const txt = fs.readFileSync(p, 'utf-8');
  const lines = txt.split('\n');
  for (const rawLine of lines) {
    let line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    line = line.trim();
    if (!line || line[0] === '#') continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      val.length >= 2 &&
      ((val[0] === '"' && val[val.length - 1] === '"') ||
        (val[0] === "'" && val[val.length - 1] === "'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!VALID_KEY_RX.test(key)) continue;
    if (!process.env[key]) process.env[key] = val;
  }
}

// ── PA source constants ──────────────────────────────────────────────────────
const PA_BASE_IFRAME =
  'https://www.palegis.us/statutes/consolidated/view-statute?30&iFrame=true&txtType=HTM&ttl=18';

export const PA_TOC_URL = PA_BASE_IFRAME + '&div=0&chpt=0&sctn=0&subsctn=0';

// ── User-agent rotation ──────────────────────────────────────────────────────
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 INAA-legal-research/1.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 INAA-legal-research/1.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 INAA-legal-research/1.0',
];

// ── Rate and retry config ────────────────────────────────────────────────────
const RATE_DELAY_MS = 1500; // fixed 1.5s between section fetches
const RETRY_BACKOFFS_MS = [5000, 30000, 120000];
const CIRCUIT_BREAKER_FAILURES = 3;
const CIRCUIT_BREAKER_PAUSE_MS = 120000;

// ── CLI flags ────────────────────────────────────────────────────────────────
export function parseCliFlags(argv) {
  const flags = { dryRun: false, chapters: null, limitSections: null };
  for (const arg of argv) {
    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg.startsWith('--chapters=')) {
      flags.chapters = arg
        .slice('--chapters='.length)
        .split(',')
        .map((s) => Number.parseInt(s.trim(), 10))
        .filter((n) => Number.isInteger(n) && n > 0);
    } else if (arg.startsWith('--limit=')) {
      flags.limitSections = Number.parseInt(arg.slice('--limit='.length), 10);
    }
  }
  return flags;
}

// ── Zod contract (reject-before-INSERT) ─────────────────────────────────────
// section field: PA uses integer section numbers (e.g. "2503").
// source_urls host must be palegis.us (HTTPS only — SEC-C1).
export const StatuteRowSchema = z.object({
  jurisdiction: z.literal('PA'),
  title: z.literal('18'),
  section: z.string().regex(/^\d+$/),
  subsection: z.null(),
  section_text: z.string().min(20).max(50000),
  is_current: z.literal(true),
  source_urls: z
    .array(
      z
        .string()
        .url()
        .max(2048)
        .refine((u) => u.startsWith('https://'), 'source_url must be HTTPS'),
    )
    .min(1)
    .max(10)
    .refine(
      (urls) => {
        try {
          const host = new URL(urls[0]).hostname.toLowerCase();
          return host === 'www.palegis.us' || host === 'palegis.us';
        } catch {
          return false;
        }
      },
      'Primary source_url host must be palegis.us',
    ),
  text_hash: z.string().regex(/^[a-f0-9]{64}$/),
  effective_date: z.null(), // palegis.us doesn't expose effective dates in iframe HTML
  scraped_at: z.string().datetime().max(40),
});

// ── Row builder ──────────────────────────────────────────────────────────────
export function buildRow({ sectionNum, titleText, bodyText, sourceUrl, scrapedAt }) {
  const sectionText = (titleText ? titleText.trim() + '\n\n' : '') + bodyText.trim();
  const textHash = crypto.createHash('sha256').update(sectionText).digest('hex');
  return {
    jurisdiction: 'PA',
    title: '18',
    section: String(sectionNum),
    subsection: null,
    section_text: sectionText,
    is_current: true,
    source_urls: [sourceUrl],
    text_hash: textHash,
    effective_date: null,
    scraped_at: scrapedAt || new Date().toISOString(),
  };
}

// ── TEXT[] literal for COPY ──────────────────────────────────────────────────
export function textArrayLiteral(urls) {
  const escaped = urls.map((u) => '"' + u.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
  return '{' + escaped.join(',') + '}';
}

// ── HTTP fetch with retry + UA rotation + circuit breaker ───────────────────
let consecutiveFailures = 0;
let circuitOpenUntil = 0;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function randomUa() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export async function fetchWithRetry(url, { signal, fetchImpl, _delayMs } = {}) {
  const doFetch = fetchImpl || fetch;
  // _delayMs overrides all delays (used in tests to avoid real waits)
  const rateDelay = _delayMs !== undefined ? _delayMs : RATE_DELAY_MS;
  const retryBackoffs = _delayMs !== undefined ? [0, 0, 0] : RETRY_BACKOFFS_MS;
  const circuitPause = _delayMs !== undefined ? 0 : CIRCUIT_BREAKER_PAUSE_MS;

  if (circuitOpenUntil > Date.now()) {
    await sleep(circuitPause > 0 ? circuitOpenUntil - Date.now() : 0);
    consecutiveFailures = 0;
  }

  let lastError = null;
  for (let attempt = 0; attempt < RETRY_BACKOFFS_MS.length; attempt++) {
    await sleep(rateDelay);
    let resp;
    try {
      resp = await doFetch(url, {
        headers: {
          'User-Agent': randomUa(),
          Accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
        signal,
      });
    } catch (e) {
      lastError = e;
      if (attempt < retryBackoffs.length - 1) await sleep(retryBackoffs[attempt]);
      continue;
    }

    if (resp.ok) {
      const body = await resp.text();
      consecutiveFailures = 0;
      return body;
    }

    lastError = new Error('HTTP ' + resp.status);
    const retryable = resp.status >= 500 || resp.status === 429;
    if (!retryable) {
      consecutiveFailures = 0;
      throw lastError;
    }
    if (attempt < retryBackoffs.length - 1) await sleep(retryBackoffs[attempt]);
  }

  consecutiveFailures += 1;
  if (consecutiveFailures >= CIRCUIT_BREAKER_FAILURES) {
    circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_PAUSE_MS;
    console.warn(
      `  circuit breaker OPEN for ${CIRCUIT_BREAKER_PAUSE_MS / 1000}s after ${consecutiveFailures} consecutive failures`,
    );
  }
  throw lastError || new Error('fetchWithRetry: exhausted retries');
}

export function _resetBreakerForTests() {
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
}

// ── DB columns in COPY order ─────────────────────────────────────────────────
const COLUMNS = [
  'jurisdiction',
  'title',
  'section',
  'subsection',
  'section_text',
  'is_current',
  'source_urls',
  'text_hash',
  'effective_date',
  'scraped_at',
];

// ── Main orchestrator ────────────────────────────────────────────────────────
export async function seedPA(opts = {}) {
  const {
    dryRun = false,
    chaptersFilter = null, // array of chpt numbers to include, or null = all
    limitSections = null,
    fetchImpl = null,
    verbose = true,
    _delayMs = undefined, // injectable for tests (overrides RATE_DELAY_MS + backoffs)
  } = opts;

  const log = verbose ? console.log : () => {};

  const fetchOpts = { fetchImpl, _delayMs };

  // Step 1: Fetch and parse the full Title 18 TOC
  log(`[PA] Fetching TOC from ${PA_TOC_URL}`);
  const tocHtml = await fetchWithRetry(PA_TOC_URL, fetchOpts);
  let entries = parseTitleToc(tocHtml);
  log(`[PA] TOC parsed: ${entries.length} section links found`);

  if (entries.length === 0) {
    throw new Error('TOC returned 0 entries — source page structure may have changed');
  }

  // Step 2: Apply chapter filter if requested
  if (chaptersFilter && chaptersFilter.length > 0) {
    const chSet = new Set(chaptersFilter);
    entries = entries.filter((e) => chSet.has(e.chpt));
    log(`[PA] Chapter filter applied: ${entries.length} entries remaining (chapters: ${chaptersFilter.join(',')})`);
  }

  // Step 3: Apply section limit if requested
  if (limitSections && limitSections > 0) {
    entries = entries.slice(0, limitSections);
    log(`[PA] Section limit applied: processing ${entries.length} entries`);
  }

  const scrapedAt = new Date().toISOString();
  const rows = [];
  let skippedHeaders = 0;
  let skippedNotFound = 0;
  let skippedZodFail = 0;
  let fetchErrors = 0;

  // Step 4: Fetch each section and build rows
  for (let i = 0; i < entries.length; i++) {
    const { div, chpt, sctn, sectionNum } = entries[i];
    const url = buildPaUrl(div, chpt, sctn);

    log(`[PA] [${i + 1}/${entries.length}] §${sectionNum} chpt=${chpt} sctn=${sctn} ...`);

    let html;
    try {
      html = await fetchWithRetry(url, fetchOpts);
    } catch (e) {
      fetchErrors += 1;
      log(`  FETCH ERROR: ${e.message}`);
      continue;
    }

    if (isSectionNotFound(html)) {
      skippedNotFound += 1;
      log(`  SKIP: not found`);
      continue;
    }

    if (isChapterHeader(html)) {
      skippedHeaders += 1;
      log(`  SKIP: chapter header`);
      continue;
    }

    const parsed = parseSectionPage(html, sectionNum);
    if (!parsed) {
      skippedNotFound += 1;
      log(`  SKIP: parseSectionPage returned null`);
      continue;
    }

    const row = buildRow({
      sectionNum,
      titleText: parsed.titleText,
      bodyText: parsed.bodyText,
      sourceUrl: url,
      scrapedAt,
    });

    const validation = StatuteRowSchema.safeParse(row);
    if (!validation.success) {
      skippedZodFail += 1;
      log(`  SKIP: Zod validation failed — ${validation.error.issues.map((i) => i.message).join('; ')}`);
      continue;
    }

    rows.push(row);
    log(`  OK: "${parsed.titleText}" (${parsed.bodyText.length} chars)`);
  }

  log(`\n[PA] Fetch complete:`);
  log(`  rows accepted: ${rows.length}`);
  log(`  skipped chapter headers: ${skippedHeaders}`);
  log(`  skipped not found: ${skippedNotFound}`);
  log(`  skipped Zod failures: ${skippedZodFail}`);
  log(`  fetch errors: ${fetchErrors}`);

  if (dryRun) {
    log(`\n[PA] --dry-run: no DB writes. Sample row:`);
    if (rows.length > 0) {
      const sample = rows[0];
      log(`  jurisdiction: ${sample.jurisdiction}`);
      log(`  title: ${sample.title}`);
      log(`  section: ${sample.section}`);
      log(`  section_text length: ${sample.section_text.length}`);
      log(`  text_hash: ${sample.text_hash}`);
      log(`  source_urls: ${JSON.stringify(sample.source_urls)}`);
    }
    return { rows, dryRun: true };
  }

  if (rows.length === 0) {
    log(`[PA] No rows to insert. Done.`);
    return { rows: [], inserted: 0 };
  }

  // Step 5: Pre-commit sanity check
  const MIN_EXPECTED = 50;
  if (!limitSections && !chaptersFilter && rows.length < MIN_EXPECTED) {
    throw new Error(
      `Pre-commit guard: only ${rows.length} rows built (expected ≥ ${MIN_EXPECTED}). Abort.`,
    );
  }

  // Step 6: COPY into DB inside a transaction
  const { client, cleanup } = await createBulkClient();
  try {
    await client.query('BEGIN');
    await client.query(`SET statement_timeout = '30min'`);
    await client.query(`SET idle_in_transaction_session_timeout = '5min'`);

    const rowArrays = rows.map((r) => [
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
    ]);

    await bulkCopyRows(client, 'entities_statutes', COLUMNS, rowArrays);

    // Post-COPY verify: confirm rows landed
    const check = await client.query(
      `SELECT COUNT(*)::int AS n FROM entities_statutes WHERE jurisdiction = 'PA' AND title = '18'`,
    );
    const total = check.rows[0].n;
    log(`[PA] Post-COPY verify: ${total} total PA/18 rows in DB (this batch: ${rows.length})`);

    await client.query('COMMIT');
    log(`[PA] COMMIT OK`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    try { await cleanup(); } catch {}
  }

  return { rows, inserted: rows.length };
}

// ── CLI entrypoint ───────────────────────────────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.url.slice(8))) {
  const flags = parseCliFlags(process.argv.slice(2));
  seedPA({
    dryRun: flags.dryRun,
    chaptersFilter: flags.chapters,
    limitSections: flags.limitSections,
    verbose: true,
  })
    .then((result) => {
      if (result.dryRun) {
        console.log(`\n[PA] Dry-run complete. ${result.rows.length} rows would be inserted.`);
      } else {
        console.log(`\n[PA] Done. Inserted ${result.inserted} rows.`);
      }
      process.exit(0);
    })
    .catch((e) => {
      console.error('[PA] FATAL:', e.message);
      process.exit(1);
    });
}

#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-il-ch720.mjs (orchestrator shape)
// Pattern: cl-bulk-data-defensive #14 (port 5432 — pg-bulk-defaults)
// Pattern: cl-bulk-data-defensive #17 (session-level timeouts via createBulkClient)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
// Pattern: no-hallucinated-legal-data — every row carries a verified HTTPS source URL
// csv-bulk-checked: none-exists — code.wvlegislature.gov per-article PDF endpoint is
//   the only structured-text source. The site renders section bodies as PNG images
//   via codeimg.php and exposes only article-level PDFs at /pdf/<chap>-<art>/.
//   No bulk CSV/JSON dump. Sitemap-first discovery (sitemap.xml lists every section
//   and article URL); we ingest one PDF per article (35 articles in Ch61), each
//   bundling all sections of that article.
//
// Seeds West Virginia Code Chapter 61 (Crimes and Their Punishment) into entities_statutes.
//
// Source (verified 2026-05-02):
//   Sitemap: https://www.wvlegislature.gov/sitemap.xml
//   Article PDFs: https://code.wvlegislature.gov/pdf/61-<art>/  (35 articles)
//   Robots: code.wvlegislature.gov/robots.txt only disallows /wp-admin/.
//           www.wvlegislature.gov/robots.txt disallows /WVCODE/ — we use the
//           code. subdomain instead, which is allowed.
//
// Usage:
//   node scripts/ingest/seed-statutes-wv-chapter61.mjs --dry-run
//   node scripts/ingest/seed-statutes-wv-chapter61.mjs --dry-run --limit=5 --verbose
//   node scripts/ingest/seed-statutes-wv-chapter61.mjs --articles=2,3 --dry-run
//   node scripts/ingest/seed-statutes-wv-chapter61.mjs                 (live; SUPABASE_DB_URL required)
//
// Env required for live run:
//   SUPABASE_DB_URL — direct postgres connection string (port 5432 enforced by harness)

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  parseArticleUrlsFromSitemap,
  buildArticlePdfUrl,
  buildCanonicalSectionUrl,
  parseArticlePdfText,
} from './lib/wv-code-pdf.mjs';
import {
  fetchWithRetry,
  buildSectionRow,
  applyToDb,
} from '../lib/justia-harness.mjs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Plain .env.local loader (no extra deps) ───────────────────────────────────
function loadDotEnvLocal() {
  const p = path.resolve(__dirname, '../../.env.local');
  if (!fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, 'utf8');
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadDotEnvLocal();

// ── CLI ───────────────────────────────────────────────────────────────────────
export function parseCliFlags(argv) {
  const flags = {
    dryRun: false,
    verbose: false,
    articles: null,
    limit: null,
  };
  for (const a of argv) {
    if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--verbose') flags.verbose = true;
    else if (a.startsWith('--articles=')) {
      flags.articles = a.slice('--articles='.length).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a.startsWith('--limit=')) {
      flags.limit = Number.parseInt(a.slice('--limit='.length), 10);
    }
  }
  return flags;
}

// ── WV config ─────────────────────────────────────────────────────────────────
export function buildWvConfig() {
  return {
    stateCode: 'WV',
    stateName: 'West Virginia',
    titleNum: '61',
    titleLabel: 'Crimes and Their Punishment',
    chapter: '61',
    sitemapUrl: 'https://www.wvlegislature.gov/sitemap.xml',
    allowedHosts: ['code.wvlegislature.gov', 'www.wvlegislature.gov'],
    crawlDelayMs: 2000, // 2.0s polite delay per spec
    fetchTimeoutMs: 60000, // PDFs can be 250KB+
  };
}

// ── Section identifier for entities_statutes.section column ──────────────────
// Format: <chapter>-<articleCode>-<sectionId>  e.g. "61-2-1", "61-2-5a", "61-8B-12"
//
// Convention chosen to match (a) the public URL slug exactly
// (https://code.wvlegislature.gov/61-2-1/), (b) a sibling-session ingest that
// landed earlier on the same chapter (~20:38 UTC 2026-05-02) using the same
// shape — adopting that convention lets the DELETE-then-COPY in applyToDb
// idempotently replace those rows on the next run instead of leaving duplicates.
export function buildSectionColumn(articleCode, sectionId, chapter = '61') {
  return `${chapter}-${articleCode}-${sectionId}`;
}

// ── PDF text extractor (lazy-loaded; replaceable for tests) ───────────────────
async function defaultPdfExtractor(buffer) {
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return String(result?.text ?? '');
}

// ── Sitemap fetch — bypasses fetchWithRetry's HTML allowlist (XML response) ──
async function fetchSitemap(sitemapUrl, { fetchImpl } = {}) {
  const doFetch = fetchImpl || fetch;
  const r = await doFetch(sitemapUrl, {
    headers: { 'User-Agent': 'ImNotAnAttorney-statute-seed/1.0 (legal research)' },
    redirect: 'follow',
  });
  if (!r.ok) throw new Error(`sitemap fetch HTTP ${r.status}`);
  return await r.text();
}

// ── PDF binary fetch — fetchWithRetry returns text(), not bytes; do raw here ──
async function fetchPdfBytes(pdfUrl, { fetchImpl, fetchTimeoutMs = 60000 } = {}) {
  const doFetch = fetchImpl || fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), fetchTimeoutMs);
  try {
    const r = await doFetch(pdfUrl, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'ImNotAnAttorney-statute-seed/1.0 (legal research)',
        'Accept': 'application/pdf,*/*',
      },
      redirect: 'follow',
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText} for ${pdfUrl}`);
    const buf = await r.arrayBuffer();
    return Buffer.from(buf);
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── Main ingest loop ──────────────────────────────────────────────────────────
/**
 * Discover all Ch61 article URLs from sitemap, fetch each article PDF,
 * parse into sections, build validated rows.
 *
 * @param {ReturnType<typeof buildWvConfig>} config
 * @param {object} opts
 * @param {boolean} [opts.verbose]
 * @param {string[]|null} [opts.articles] subset like ["2","3A"] (matches articleCode)
 * @param {number|null} [opts.limit] cap on number of articles processed
 * @param {Function} [opts.fetchImpl] override fetch (tests)
 * @param {Function} [opts.pdfExtractor] override PDF text extraction (tests)
 * @param {string|null} [opts.sitemapXml] inject sitemap text directly (tests)
 */
export async function collectRows(config, opts = {}) {
  const {
    verbose = false,
    articles: articleFilter = null,
    limit = null,
    fetchImpl,
    pdfExtractor = defaultPdfExtractor,
    sitemapXml: injectedSitemap = null,
  } = opts;

  // --- Step 1: enumerate article URLs from sitemap ---
  const sitemapXml = injectedSitemap ?? await fetchSitemap(config.sitemapUrl, { fetchImpl });
  let articleUrls = parseArticleUrlsFromSitemap(sitemapXml, config.chapter);
  console.log(`  sitemap: ${articleUrls.length} article URL(s) for chapter ${config.chapter}`);

  if (articleFilter && articleFilter.length > 0) {
    const wanted = new Set(articleFilter.map((s) => s.toUpperCase()));
    articleUrls = articleUrls.filter((u) => {
      const seg = new URL(u).pathname.replace(/\/$/, '').split('/').filter(Boolean)[0];
      const artCode = seg.split('-')[1];
      return wanted.has(artCode.toUpperCase());
    });
    console.log(`  filtered by --articles: ${articleUrls.length}`);
  }
  if (limit !== null && articleUrls.length > limit) {
    articleUrls = articleUrls.slice(0, limit);
    console.log(`  --limit applied: ${articleUrls.length}`);
  }

  // --- Step 2: per-article fetch + parse + build rows ---
  const rows = [];
  let skipCount = 0;
  let errorCount = 0;
  const seenSections = new Set();

  const isInjectedFetch = Boolean(opts.fetchImpl);

  for (const articleUrl of articleUrls) {
    const seg = new URL(articleUrl).pathname.replace(/\/$/, '').split('/').filter(Boolean)[0];
    const articleCode = seg.split('-')[1];
    const pdfUrl = buildArticlePdfUrl(articleUrl);

    let buf;
    try {
      buf = await fetchPdfBytes(pdfUrl, { fetchImpl, fetchTimeoutMs: config.fetchTimeoutMs });
    } catch (e) {
      skipCount += 1;
      console.warn(`    [skip] article ${articleCode}: PDF fetch failed — ${e.message}`);
      // Polite delay even on skip; protects upstream from retry storms.
      if (!isInjectedFetch) await sleep(config.crawlDelayMs);
      continue;
    }

    let pdfText;
    try {
      pdfText = await pdfExtractor(buf);
    } catch (e) {
      errorCount += 1;
      console.warn(`    [err] article ${articleCode}: PDF extract failed — ${e.message}`);
      if (!isInjectedFetch) await sleep(config.crawlDelayMs);
      continue;
    }

    const parsed = parseArticlePdfText(pdfText, {
      chapter: config.chapter,
      articleCode,
    });

    if (parsed.length === 0) {
      errorCount += 1;
      console.warn(`    [err] article ${articleCode}: 0 sections parsed (PDF may be empty/cover-only)`);
      if (!isInjectedFetch) await sleep(config.crawlDelayMs);
      continue;
    }

    let articleParsed = 0;
    for (const sec of parsed) {
      const sectionColumn = buildSectionColumn(articleCode, sec.sectionId, config.chapter);
      // Dedupe across articles (defensive — sitemap shouldn't list dupes).
      if (seenSections.has(sectionColumn)) {
        if (verbose) console.warn(`    [dup] ${sectionColumn}: duplicate section across articles`);
        continue;
      }

      const canonicalUrl = buildCanonicalSectionUrl(config.chapter, articleCode, sec.sectionId);
      const harnessConfig = {
        stateCode: config.stateCode,
        titleNum: config.titleNum,
        allowedHosts: config.allowedHosts,
      };
      const { row, errors: rowErrors } = buildSectionRow(
        harnessConfig,
        sectionColumn,
        canonicalUrl,
        { titleText: sec.titleText, bodyText: sec.bodyText },
      );

      if (rowErrors.length > 0) {
        errorCount += 1;
        if (verbose) console.warn(`    [err] ${sectionColumn}: ${rowErrors.join('; ')}`);
        continue;
      }

      rows.push(row);
      seenSections.add(sectionColumn);
      articleParsed += 1;
    }

    if (verbose) {
      console.log(`  [art ${articleCode}] parsed ${articleParsed} sections from ${parsed.length} candidates`);
    } else {
      process.stdout.write('.');
    }

    // Polite delay between article PDF fetches.
    if (!isInjectedFetch) await sleep(config.crawlDelayMs);
  }

  if (!verbose) process.stdout.write('\n');
  return { rows, skipCount, errorCount };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const flags = parseCliFlags(process.argv.slice(2));
  const config = buildWvConfig();

  if (flags.dryRun) {
    console.log('[seed-statutes-wv-chapter61] DRY RUN — no DB writes');
  } else {
    if (!process.env.SUPABASE_DB_URL) {
      console.error('ERROR: SUPABASE_DB_URL not set. Run with --dry-run or set the env var.');
      process.exit(1);
    }
    console.log('[seed-statutes-wv-chapter61] LIVE RUN — will write to entities_statutes');
  }
  if (flags.articles) console.log(`  articles: ${flags.articles.join(',')}`);
  if (flags.limit) console.log(`  limit: ${flags.limit}`);

  const t0 = Date.now();
  const { rows, skipCount, errorCount } = await collectRows(config, {
    verbose: flags.verbose,
    articles: flags.articles,
    limit: flags.limit,
  });

  console.log(`\n[seed-statutes-wv-chapter61] collected ${rows.length} rows (skip=${skipCount}, err=${errorCount})`);

  const dbResult = await applyToDb(rows, config, { dryRun: flags.dryRun });

  const durationMs = Date.now() - t0;
  console.log('\n=== Summary ===');
  console.log(`  rows written : ${dbResult.rowCount}`);
  console.log(`  rows deleted : ${dbResult.deleted ?? 0}`);
  console.log(`  fetch skips  : ${skipCount}`);
  console.log(`  parse errors : ${errorCount}`);
  console.log(`  duration     : ${durationMs}ms`);

  // SC-WV-1: full live run must hit >= 400 rows (Ch61 has ~600 sections across 35 articles).
  // Partial runs (--articles or --limit) skip the floor check.
  const isFullRun = !flags.articles && !flags.limit;
  if (!flags.dryRun && isFullRun && dbResult.rowCount < 400) {
    console.error(`\nFAIL: SC-WV-1 not met — only ${dbResult.rowCount} rows (need >= 400 for full run)`);
    process.exit(1);
  }

  console.log('\nPASS');
  process.exit(0);
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try { return import.meta.url === pathToFileURL(process.argv[1]).href; }
  catch { return false; }
})();
if (invokedDirectly) main().catch((err) => {
  console.error('[seed-statutes-wv-chapter61] fatal:', err.message);
  console.error(err.stack);
  process.exit(1);
});

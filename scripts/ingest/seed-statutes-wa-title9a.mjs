#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-il-ch720.mjs
// Pattern: cl-bulk-data-defensive #14 — pooler port 5432 (handled by createBulkClient)
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows
// Pattern: no-hallucinated-legal-data — every row carries verified HTTPS source URL
// csv-bulk-checked: none-exists — app.leg.wa.gov per-section ASP.NET HTML, no
//   bulk file. Coverage doc: docs/ingest/coverage/wa-statutes-coverage.md.
//   robots.txt 404 (no policy); 2.0s defensive crawl delay per WA-leg norms.
//
// Seeds Washington RCW criminal-code chapters into entities_statutes.
//
// In-scope chapters (per coverage doc; 12 chapters total):
//   9A.32 / 9A.36 / 9A.40 / 9A.42 / 9A.44 / 9A.46 / 9A.52 / 9A.56 / 9A.60
//   9.41 (firearms)
//   46.61 (rules of the road; incl. DUI)
//   69.50 (Uniform Controlled Substances Act)
//
// Source: https://app.leg.wa.gov/RCW/default.aspx?cite=<chapter>[.<section>]
// Strategy: walk each chapter index → discover section URLs → fetch each →
//   parse → DELETE-then-COPY into entities_statutes via justia-harness.
//
// Usage:
//   node scripts/ingest/seed-statutes-wa-title9a.mjs --dry-run
//   node scripts/ingest/seed-statutes-wa-title9a.mjs --chapters=9A.32,9A.36 --limit=10 --dry-run
//   node scripts/ingest/seed-statutes-wa-title9a.mjs --verbose
//   node scripts/ingest/seed-statutes-wa-title9a.mjs           (live; requires SUPABASE_DB_URL)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  WA_CHAPTERS,
  WA_HOST,
  buildChapterUrl,
  buildSectionUrl,
  discoverSectionUrls,
  parseSection,
  sectionCiteFromUrl,
  buildSectionDbId,
} from './lib/wa-rcw-html.mjs';
import {
  fetchWithRetry,
  buildSectionRow,
  applyToDb,
} from '../lib/justia-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Env loader (line-by-line, no regex on file contents) ────────────────────
const envPaths = [
  path.resolve(__dirname, '../../.env.local'),
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

// ── CLI ─────────────────────────────────────────────────────────────────────
export function parseCliFlags(argv) {
  const flags = {
    dryRun: false,
    verbose: false,
    chapters: null,
    limit: null,
  };
  for (const a of argv) {
    if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--verbose') flags.verbose = true;
    else if (a.startsWith('--chapters=')) {
      flags.chapters = a.slice('--chapters='.length).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a.startsWith('--limit=')) {
      flags.limit = Number.parseInt(a.slice('--limit='.length), 10);
    }
  }
  return flags;
}

// ── Config ──────────────────────────────────────────────────────────────────
// We use one DB title="9A" string to fit the entities_statutes title VARCHAR(20)
// and to honor the predominant criminal-code title. Chapters from titles 9 / 46 /
// 69 are still seeded (their cite encodes the title), but the DB `title` column
// stays "9A" for cross-chapter coherence with the Title-9A seeder name.
//
// `section` column receives the full RCW cite (e.g. "9A.32.030", "46.61.502")
// so cross-chapter rows do not collide.
export function buildWaConfig({ chapters, limit } = {}) {
  const filteredChapters = chapters && chapters.length
    ? WA_CHAPTERS.filter((c) => chapters.includes(c.chapterNum))
    : WA_CHAPTERS;
  return {
    stateCode: 'WA',
    stateName: 'Washington',
    titleNum: '9A',
    titleLabel: 'Washington Criminal Code (+ adjacent chapters)',
    allowedHosts: [WA_HOST],
    crawlDelayMs: 2000,        // coverage doc: 2.0s defensive (no robots.txt)
    fetchTimeoutMs: 45000,
    targetChapters: filteredChapters,
    limit: limit || null,
  };
}

// ── Browser-style fetch impl (WA returns 403 to plain Node UA) ──────────────
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Wrap global fetch with browser headers so app.leg.wa.gov serves the page.
 * Passed into fetchWithRetry as opts.fetchImpl.
 */
function browserFetch(url, init = {}) {
  const merged = {
    ...init,
    headers: {
      ...(init.headers || {}),
      'User-Agent': BROWSER_UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: init.redirect || 'follow',
  };
  return fetch(url, merged);
}

// ── Main ingest loop ────────────────────────────────────────────────────────

/**
 * Walk each chapter index, discover sections, fetch each, parse, build rows.
 *
 * @param {ReturnType<typeof buildWaConfig>} config
 * @param {{ verbose?: boolean, fetchImpl?: Function }} opts
 * @returns {Promise<{ rows: object[], skipCount: number, errorCount: number, byChapter: Record<string, {discovered:number, parsed:number}> }>}
 */
export async function collectRows(config, opts = {}) {
  const { verbose = false } = opts;
  const fetchImpl = opts.fetchImpl || browserFetch;
  const fetchOpts = {
    allowedHosts: config.allowedHosts,
    crawlDelayMs: config.crawlDelayMs,
    fetchTimeoutMs: config.fetchTimeoutMs,
    fetchImpl,
  };

  const rows = [];
  let skipCount = 0;
  let errorCount = 0;
  let totalAttempted = 0;
  const byChapter = {};

  for (const chapter of config.targetChapters) {
    const chapterUrl = buildChapterUrl(chapter.chapterNum);
    console.log(`\n  [chapter ${chapter.chapterNum}] ${chapter.label}`);
    console.log(`    fetching index: ${chapterUrl}`);

    let chapterHtml;
    try {
      chapterHtml = await fetchWithRetry(chapterUrl, fetchOpts);
    } catch (e) {
      console.warn(`    [skip-chapter] ${chapter.chapterNum}: ${e.message}`);
      byChapter[chapter.chapterNum] = { discovered: 0, parsed: 0, indexFailed: true };
      continue;
    }

    const sectionUrls = discoverSectionUrls(chapterHtml, chapter.chapterNum);
    console.log(`    discovered ${sectionUrls.length} sections`);
    byChapter[chapter.chapterNum] = { discovered: sectionUrls.length, parsed: 0 };

    let chapterParsed = 0;
    for (const sectionUrl of sectionUrls) {
      // Apply global limit across all chapters
      if (config.limit !== null && totalAttempted >= config.limit) {
        console.log(`    [chapter ${chapter.chapterNum}] limit=${config.limit} reached`);
        break;
      }
      totalAttempted += 1;

      const sectionCite = sectionCiteFromUrl(sectionUrl);
      if (!sectionCite) {
        skipCount += 1;
        if (verbose) console.warn(`    [skip] bad section URL: ${sectionUrl}`);
        continue;
      }
      const sectionDbId = buildSectionDbId(sectionCite);

      let html;
      try {
        html = await fetchWithRetry(sectionUrl, fetchOpts);
      } catch (e) {
        skipCount += 1;
        if (verbose) console.warn(`    [skip] ${sectionDbId}: fetch failed — ${e.message}`);
        continue;
      }

      const parsed = parseSection(html, { sectionCite, sectionUrl });
      if (!parsed) {
        skipCount += 1;
        if (verbose) console.log(`    [skip] ${sectionDbId}: not parseable (repealed/decodified/empty)`);
        continue;
      }

      const harnessConfig = {
        stateCode: config.stateCode,
        titleNum: config.titleNum,
        allowedHosts: config.allowedHosts,
      };
      const { row, errors: rowErrors } = buildSectionRow(
        harnessConfig,
        sectionDbId,
        sectionUrl,
        parsed,
      );
      if (rowErrors.length > 0) {
        errorCount += 1;
        if (verbose) console.warn(`    [err] ${sectionDbId}: ${rowErrors.join('; ')}`);
        continue;
      }

      rows.push(row);
      chapterParsed += 1;
      if (verbose) {
        const preview = row.section_text.slice(0, 60).replace(/\n/g, ' ');
        console.log(`    [ok] ${sectionDbId}: ${preview}`);
      } else {
        process.stdout.write('.');
      }
    }

    byChapter[chapter.chapterNum].parsed = chapterParsed;
    if (!verbose) process.stdout.write('\n');
    console.log(`    [chapter ${chapter.chapterNum}] parsed ${chapterParsed}/${sectionUrls.length}`);

    if (config.limit !== null && totalAttempted >= config.limit) break;
  }

  return { rows, skipCount, errorCount, byChapter };
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const flags = parseCliFlags(process.argv.slice(2));
  const config = buildWaConfig({ chapters: flags.chapters, limit: flags.limit });

  const chapterLabels = config.targetChapters.map((c) => c.chapterNum).join(', ');

  if (flags.dryRun) {
    console.log('[seed-statutes-wa-title9a] DRY RUN — no DB writes');
  } else {
    if (!process.env.SUPABASE_DB_URL) {
      console.error('ERROR: SUPABASE_DB_URL not set. Run with --dry-run or set the env var.');
      process.exit(1);
    }
    console.log('[seed-statutes-wa-title9a] LIVE RUN — will write to entities_statutes');
  }
  console.log(`  chapters: ${chapterLabels}`);
  if (config.limit) console.log(`  limit: ${config.limit}`);
  console.log(`  crawl delay: ${config.crawlDelayMs}ms per fetch`);

  const t0 = Date.now();
  const { rows, skipCount, errorCount, byChapter } = await collectRows(config, {
    verbose: flags.verbose,
  });

  console.log(`\n[seed-statutes-wa-title9a] collected ${rows.length} rows (skip=${skipCount}, err=${errorCount})`);
  console.log('  per-chapter:');
  for (const [c, s] of Object.entries(byChapter)) {
    console.log(`    ${c}: discovered=${s.discovered} parsed=${s.parsed}${s.indexFailed ? ' [INDEX-FAILED]' : ''}`);
  }

  const dbResult = await applyToDb(rows, config, { dryRun: flags.dryRun });

  const durationMs = Date.now() - t0;
  console.log('\n=== Summary ===');
  console.log(`  rows written : ${dbResult.rowCount}`);
  console.log(`  rows deleted : ${dbResult.deleted ?? 0}`);
  console.log(`  fetch skips  : ${skipCount}`);
  console.log(`  parse errors : ${errorCount}`);
  console.log(`  duration     : ${durationMs}ms`);

  // SC floor: full ingest must hit ≥600 rows. Subset runs (--chapters / --limit) skip the floor.
  const isFullRun = !flags.chapters && !flags.limit;
  if (!flags.dryRun && isFullRun && dbResult.rowCount < 600) {
    console.error(`\nFAIL: SC-WA-1 not met — only ${dbResult.rowCount} rows (need >= 600 for full run)`);
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
  console.error('[seed-statutes-wa-title9a] fatal:', err.message);
  process.exit(1);
});

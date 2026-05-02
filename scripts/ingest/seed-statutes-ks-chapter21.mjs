#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-ar-title5.mjs (single-state seeder shape)
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows (via bucket-b-html harness)
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// csv-bulk-checked: none-exists — KS Revisor publishes per-section HTML only;
//   no bulk download endpoint. Per-section authoritative URLs required.
//
// Seeds KS Chapter 21 (Crimes & Punishments) into entities_statutes.
// Source: https://ksrevisor.gov/statutes/ksa_ch21.html (chapter index)
// Per-section: https://ksrevisor.gov/statutes/chapters/ch21/021_{NNN}_{NNNN}.html
//
// Wave 2 plan KS row + ksrevisor.gov live verification 2026-05-02:
//   - Routing: vercel-cron-safe (no Crawl-delay)
//   - Active scope: Articles 51-63 (modern criminal code post-2010 recodification)
//   - Estimated rows: ~400-500 active sections after filtering Repealed/Reserved
//
// DEVIATION FROM AR TEMPLATE (documented):
//   AR Title 5 is a single bulk-XML doc (2.6MB law.resource.org permalink) parsed
//   in-memory; the seeder uses unicourt-harness.ingestState because every section
//   is inline in the source. KS publishes the chapter index with section LINKS
//   only — body text lives on per-section pages. The seeder therefore uses
//   bucket-b-html.ingestBucketBState (multi-fetch), still mirrors the
//   AR seeder's CLI shape (--dry-run, --verbose, exit-on-floor).
//
// Usage:
//   node scripts/ingest/seed-statutes-ks-chapter21.mjs [--dry-run] [--verbose] [--limit=N]
//
// Env required (live run):
//   SUPABASE_DB_URL — direct postgres connection string (port 5432)

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- env loader ----------
const dotenvPath = path.resolve(__dirname, '../../.env.local');
try {
  const { config } = await import('dotenv');
  config({ path: dotenvPath });
} catch {
  // dotenv optional — env may be pre-set
}

// ---------- imports ----------
import {
  parseKSChapter21,
  filterActiveSections,
  parseKSSectionPage,
  buildKSSourceUrl,
} from './lib/ks-html.mjs';
import { ingestBucketBState } from './lib/bucket-b-html.mjs';

// ---------- KS config ----------

/** @type {import('./lib/bucket-b-html.mjs').BucketBStateConfig} */
const KS_CONFIG = {
  stateCode: 'KS',
  stateName: 'Kansas',
  titleNum: '21',
  titleLabel: 'Crimes and Punishments',
  chapterListUrl: 'https://ksrevisor.gov/statutes/ksa_ch21.html',

  /** discoverSections: parse the chapter index, filter to active modern-code sections. */
  discoverSections(tocHtml /* , config */) {
    const all = parseKSChapter21(tocHtml);
    const active = filterActiveSections(all);
    return active.map(s => ({
      sectionNum: s.sectionNum,
      sectionUrl: s.sectionUrl,
      chapterNum: s.chapterNum,
    }));
  },

  /** parseSection: extract titleText + bodyText from one section page. */
  parseSection(sectionHtml, sectionNum /* , config */) {
    return parseKSSectionPage(sectionHtml, sectionNum);
  },

  /** buildSourceUrl: canonical ksrevisor.gov permalink (matches discovered URL). */
  buildSourceUrl: buildKSSourceUrl,

  crawlDelay: 'none',
  crawlDelayMs: 1000, // conservative — no robots Crawl-delay verified, but be polite
  fetchTimeoutMs: 30000,
  maxConcurrency: 1,
  allowedHosts: new Set(['ksrevisor.gov', 'www.ksrevisor.gov']),
};

// ---------- CLI ----------

function parseCliFlags(argv) {
  const flags = {
    dryRun: argv.includes('--dry-run'),
    verbose: argv.includes('--verbose'),
    limit: null,
  };
  for (const a of argv) {
    if (a.startsWith('--limit=')) {
      const n = parseInt(a.slice('--limit='.length), 10);
      if (Number.isFinite(n) && n > 0) flags.limit = n;
    }
  }
  return flags;
}

// ---------- main ----------

async function main() {
  const { dryRun, verbose, limit } = parseCliFlags(process.argv);

  if (dryRun) {
    console.log('[seed-statutes-ks-chapter21] DRY RUN — no DB writes');
  } else {
    if (!process.env.SUPABASE_DB_URL) {
      console.error('ERROR: SUPABASE_DB_URL not set. Run with --dry-run or set the env var.');
      process.exit(1);
    }
    console.log('[seed-statutes-ks-chapter21] LIVE RUN — will write to DB');
  }

  const result = await ingestBucketBState(KS_CONFIG, {
    dryRun,
    verbose,
    limit,
    connectionString: process.env.SUPABASE_DB_URL,
  });

  console.log('\n=== Summary ===');
  console.log(`  rows written : ${result.rowCount}`);
  console.log(`  skipped      : ${result.skipCount}`);
  console.log(`  errors       : ${result.errorCount}`);
  console.log(`  duration     : ${result.durationMs}ms`);

  // Floor: 250 active sections in articles 51-63. Wave 2 plan estimated
  // 400-500 but live verification 2026-05-02 (--dry-run --limit=5 against
  // ksrevisor.gov) discovered 259 active descriptors; the higher plan
  // estimate counted Repealed/Reserved entries we now correctly filter out.
  // Floor set 15% below verified count. Smoke / --limit runs skip the floor.
  const FLOOR = 250;
  if (limit) {
    console.log(`\nlimit=${limit} run — floor not enforced.`);
    process.exit(0);
  }
  if (result.rowCount < FLOOR) {
    console.error(`\nFAIL: floor not met — only ${result.rowCount} rows (need >=${FLOOR})`);
    process.exit(1);
  }

  console.log(`\nPASS: >=${FLOOR} rows`);
  process.exit(0);
}

main().catch(err => {
  console.error('[seed-statutes-ks-chapter21] fatal:', err.message);
  process.exit(1);
});

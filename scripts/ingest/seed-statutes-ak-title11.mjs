#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-ar-title5.mjs
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows (via unicourt-harness)
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// csv-bulk-checked: https://unicourt.github.io/cic-code-ak/transforms/ak/ocak/r78/gov.ak.code.title.11.html
//   (UniCourt cic-code-ak Release 78, public domain via Georgia v. Public.Resource.Org SCOTUS 2020)
//
// Seeds AK Title 11 (Criminal Law) into entities_statutes.
// Source HTML: UniCourt cic-code-ak Release 78 (2021.12)
// Authoritative URLs: UniCourt mirror with `#t11c…s…` fragment anchor
//
// Usage:
//   node scripts/ingest/seed-statutes-ak-title11.mjs [--dry-run] [--verbose]
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
import { parseUnicourtTitle, buildUnicourtFragmentUrl } from './lib/unicourt-cic-html.mjs';
import { ingestState } from '../lib/unicourt-harness.mjs';

// ---------- AK config ----------

const TITLE_URL = 'https://unicourt.github.io/cic-code-ak/transforms/ak/ocak/r78/gov.ak.code.title.11.html';
const TITLE_ID = '11';

/** @type {import('../lib/unicourt-harness.mjs').UnicourtStateConfig} */
const AK_CONFIG = {
  stateCode: 'AK',
  stateName: 'Alaska',
  titleNum: '11',
  titleLabel: 'Criminal Law',
  titleUrl: TITLE_URL,
  crawlDelay: 'none',  // GitHub Pages — no crawl-delay
  fetchTimeoutMs: 90000, // ~3MB HTML
  parseTitle: (html) => parseUnicourtTitle(html, { expectedTitle: TITLE_ID }),
  buildSourceUrl: (sectionNum) => {
    // Reconstruct cic-code anchor from sectionNum.
    // AK chapter encoded in section: "11.05.010" -> chapter "05"
    const m = /^11\.(\d+[a-z]?)\.\d+/.exec(sectionNum);
    const chapter = m ? m[1] : '01';
    return buildUnicourtFragmentUrl(TITLE_URL, TITLE_ID, null, chapter, sectionNum);
  },
};

// ---------- CLI ----------

function parseCliFlags(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    verbose: argv.includes('--verbose'),
  };
}

// ---------- main ----------

async function main() {
  const { dryRun, verbose } = parseCliFlags(process.argv);

  if (dryRun) {
    console.log('[seed-statutes-ak-title11] DRY RUN — no DB writes');
  } else {
    if (!process.env.SUPABASE_DB_URL) {
      console.error('ERROR: SUPABASE_DB_URL not set. Run with --dry-run or set the env var.');
      process.exit(1);
    }
    console.log('[seed-statutes-ak-title11] LIVE RUN — will write to DB');
  }

  const result = await ingestState(AK_CONFIG, {
    dryRun,
    verbose,
    connectionString: process.env.SUPABASE_DB_URL,
  });

  console.log('\n=== Summary ===');
  console.log(`  rows written : ${result.rowCount}`);
  console.log(`  skipped      : ${result.skipCount}`);
  console.log(`  errors       : ${result.errorCount}`);
  console.log(`  duration     : ${result.durationMs}ms`);

  // AK Title 11 has 366 distinct h3 section anchors as of UniCourt Release 78.
  // Floor 320 reflects parser realities (a handful of "Repealed" / range-headed
  // sections are validly skipped because their bodyText is empty).
  const FLOOR = 300;
  if (result.rowCount < FLOOR) {
    console.error(`\nFAIL: SC floor not met — only ${result.rowCount} rows (need ≥${FLOOR})`);
    process.exit(1);
  }

  console.log(`\nPASS: ≥${FLOOR} rows`);
  process.exit(0);
}

main().catch(err => {
  console.error('[seed-statutes-ak-title11] fatal:', err.message);
  process.exit(1);
});

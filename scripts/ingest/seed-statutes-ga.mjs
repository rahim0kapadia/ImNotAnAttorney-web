#!/usr/bin/env node
// Template: apps/web/scripts/ingest/seed-statutes-va.mjs
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows (via unicourt-harness)
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// csv-bulk-checked: none-exists — UniCourt cic-code-ga is the closest bulk source;
//   per-section authoritative source_urls still require Justia URL pattern
//   (robots.txt confirmed no Crawl-delay, no /codes/ disallow — 2026-05-01)
//
// Seeds GA OCGA Title 16 (Crimes and Offenses) into entities_statutes.
// Source HTML: unicourt.github.io/cic-code-ga/transforms/ga/ocga/r70/gov.ga.ocga.title.16.html
//   (public domain per Georgia v. Public.Resource.Org, SCOTUS 2020)
// Authoritative URLs: https://law.justia.com/codes/georgia/section/{section-num}/
//
// Usage:
//   node scripts/ingest/seed-statutes-ga.mjs [--dry-run] [--verbose]
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
import { parseTitleSections, buildJustiaUrl } from './lib/ga-html.mjs';
import { ingestState } from '../lib/unicourt-harness.mjs';

// ---------- GA config ----------

/** @type {import('../lib/unicourt-harness.mjs').UnicourtStateConfig} */
const GA_CONFIG = {
  stateCode: 'GA',
  stateName: 'Georgia',
  titleNum: '16',
  titleLabel: 'Crimes and Offenses',
  // Single-file HTML — all 17 chapters and all sections inline (~18.5 MB)
  titleUrl: 'https://unicourt.github.io/cic-code-ga/transforms/ga/ocga/r70/gov.ga.ocga.title.16.html',
  crawlDelay: 'none',  // GitHub Pages — no robots.txt (confirmed 2026-05-01)
  fetchTimeoutMs: 90000,  // 18.5 MB — allow 90s
  parseTitle: parseTitleSections,
  buildSourceUrl: buildJustiaUrl,
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
    console.log('[seed-statutes-ga] DRY RUN — no DB writes');
  } else {
    if (!process.env.SUPABASE_DB_URL) {
      console.error('ERROR: SUPABASE_DB_URL not set. Run with --dry-run or set the env var.');
      process.exit(1);
    }
    console.log('[seed-statutes-ga] LIVE RUN — will write to DB');
  }

  const result = await ingestState(GA_CONFIG, {
    dryRun,
    verbose,
    connectionString: process.env.SUPABASE_DB_URL,
  });

  console.log('\n=== Summary ===');
  console.log(`  rows written : ${result.rowCount}`);
  console.log(`  skipped      : ${result.skipCount}`);
  console.log(`  errors       : ${result.errorCount}`);
  console.log(`  duration     : ${result.durationMs}ms`);

  if (result.rowCount < 150) {
    console.error(`\nFAIL: SC-1A-1 not met — only ${result.rowCount} rows (need ≥150)`);
    process.exit(1);
  }

  console.log('\nPASS: SC-1A-1 ≥150 rows');
  process.exit(0);
}

main().catch(err => {
  console.error('[seed-statutes-ga] fatal:', err.message);
  process.exit(1);
});

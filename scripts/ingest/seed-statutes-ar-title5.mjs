#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-ga.mjs
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows (via unicourt-harness)
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// csv-bulk-checked: https://law.resource.org/pub/us/code/ar/arkansas.xml.2012/ar.code.05.2012.xml
//   (2.6MB bulk XML, full Title 5, public domain via law.resource.org)
//   Justia returned 403 (Cloudflare gate, confirmed 2026-05-01) — LR.O is the source.
//
// Seeds AR Title 5 (Criminal Offenses) into entities_statutes.
// Source XML: https://law.resource.org/pub/us/code/ar/arkansas.xml.2012/ar.code.05.2012.xml
//   (2012 edition, public domain — law.resource.org)
// Authoritative URLs: LR.O archive permalink with #Section-5-X-XXX fragment
//
// Usage:
//   node scripts/ingest/seed-statutes-ar-title5.mjs [--dry-run] [--verbose]
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
import { parseTitleSections, buildArSourceUrl } from './lib/ar-xml.mjs';
import { ingestState } from '../lib/unicourt-harness.mjs';

// ---------- AR config ----------

/** @type {import('../lib/unicourt-harness.mjs').UnicourtStateConfig} */
const AR_CONFIG = {
  stateCode: 'AR',
  stateName: 'Arkansas',
  titleNum: '5',
  titleLabel: 'Criminal Offenses',
  // Bulk XML — 2.6MB single file, all chapters inline
  titleUrl: 'https://law.resource.org/pub/us/code/ar/arkansas.xml.2012/ar.code.05.2012.xml',
  crawlDelay: 'none',  // law.resource.org — no Crawl-delay in robots.txt (confirmed 2026-05-01)
  fetchTimeoutMs: 60000,  // 2.6MB — 60s is sufficient
  parseTitle: parseTitleSections,
  buildSourceUrl: buildArSourceUrl,
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
    console.log('[seed-statutes-ar-title5] DRY RUN — no DB writes');
  } else {
    if (!process.env.SUPABASE_DB_URL) {
      console.error('ERROR: SUPABASE_DB_URL not set. Run with --dry-run or set the env var.');
      process.exit(1);
    }
    console.log('[seed-statutes-ar-title5] LIVE RUN — will write to DB');
  }

  const result = await ingestState(AR_CONFIG, {
    dryRun,
    verbose,
    connectionString: process.env.SUPABASE_DB_URL,
  });

  console.log('\n=== Summary ===');
  console.log(`  rows written : ${result.rowCount}`);
  console.log(`  skipped      : ${result.skipCount}`);
  console.log(`  errors       : ${result.errorCount}`);
  console.log(`  duration     : ${result.durationMs}ms`);

  // AR Title 5 has 967 real sections; 42 "reserved range" nodes (e.g. "5-1-117 -- 5-1-124")
  // are legitimately skipped — they represent repealed ranges, not actual statute text.
  // Floor set to 900 to reflect actual source capacity (not fabricated rows).
  if (result.rowCount < 900) {
    console.error(`\nFAIL: SC floor not met — only ${result.rowCount} rows (need ≥900)`);
    process.exit(1);
  }

  console.log('\nPASS: ≥900 rows');
  process.exit(0);
}

main().catch(err => {
  console.error('[seed-statutes-ar-title5] fatal:', err.message);
  process.exit(1);
});

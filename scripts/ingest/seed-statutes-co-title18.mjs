#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-id-title18.mjs
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows (via lawresource-xml-harness)
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// csv-bulk-checked: https://law.resource.org/pub/us/code/co/colorado.xml.2012/co.code.title.18.2012.xml
//   (Public domain via Public.Resource.Org legal-codes archive)
//
// Seeds Colorado Revised Statutes Title 18 (Criminal Code) into entities_statutes.
// Source XML: law.resource.org/pub/us/code/co/colorado.xml.2012/co.code.title.18.2012.xml
//   ~2MB, 847 sections, single-file parse-in-memory.
// Authoritative URLs: LR.O archive with #<sectionNum> fragment anchor.
//   (CO General Assembly site does not provide stable per-section deep links.)
// Staleness: LR.O 2012 edition. Sections reflect CO law as of the 2012 publication.
//
// Usage:
//   node scripts/ingest/seed-statutes-co-title18.mjs [--dry-run] [--verbose]
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
import { parseTitleSections, buildCoSourceUrl } from './lib/co-xml.mjs';
import { ingestState } from '../lib/lawresource-xml-harness.mjs';

// ---------- CO config ----------

/** @type {import('../lib/lawresource-xml-harness.mjs').LrOStateConfig} */
const CO_TITLE18_CONFIG = {
  stateCode: 'CO',
  stateName: 'Colorado',
  titleNum: '18',
  titleLabel: 'Criminal Code',
  titleUrl: 'https://law.resource.org/pub/us/code/co/colorado.xml.2012/co.code.title.18.2012.xml',
  crawlDelay: 'none',
  fetchTimeoutMs: 90000,
  parseTitle: parseTitleSections,
  buildSourceUrl: buildCoSourceUrl,
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
    console.log('[seed-statutes-co-title18] DRY RUN — no DB writes');
  } else {
    if (!process.env.SUPABASE_DB_URL) {
      console.error('ERROR: SUPABASE_DB_URL not set. Run with --dry-run or set the env var.');
      process.exit(1);
    }
    console.log('[seed-statutes-co-title18] LIVE RUN — will write to DB');
  }

  const result = await ingestState(CO_TITLE18_CONFIG, {
    dryRun,
    verbose,
    connectionString: process.env.SUPABASE_DB_URL,
  });

  console.log('\n=== Summary ===');
  console.log(`  rows written : ${result.rowCount}`);
  console.log(`  skipped      : ${result.skipCount}`);
  console.log(`  errors       : ${result.errorCount}`);
  console.log(`  duration     : ${result.durationMs}ms`);

  // Floor: baseline was 678 rows from a prior bespoke seed. LR.O 2012 XML
  // parsed to 847 sections (verified 2026-05-01). 650 is a conservative floor
  // that proves the harness without over-constraining on minor skip-row variation.
  const FLOOR = 650;
  if (result.rowCount < FLOOR) {
    console.error(`\nFAIL: floor not met — only ${result.rowCount} rows (need ≥${FLOOR})`);
    process.exit(1);
  }

  console.log(`\nPASS: ≥${FLOOR} rows`);
  process.exit(0);
}

main().catch(err => {
  console.error('[seed-statutes-co-title18] fatal:', err.message);
  process.exit(1);
});

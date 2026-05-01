#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-id-title18.mjs
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows (via lawresource-xml-harness)
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// csv-bulk-checked: https://law.resource.org/pub/us/code/ms/ms.xml.2013/title-97.xml
//   (Public domain via Public.Resource.Org legal-codes archive)
//
// Seeds Mississippi Code Title 97 (Crimes) into entities_statutes.
// Source XML: law.resource.org/pub/us/code/ms/ms.xml.2013/title-97.xml
//   ~1.2MB, 800+ sections, single-file parse-in-memory.
// Authoritative URLs: LR.O archive with #sectionNum fragment anchor (state-leg TLS error;
//   Justia/FindLaw return 403 from automated agents).
//
// Usage:
//   node scripts/ingest/seed-statutes-ms-title97.mjs [--dry-run] [--verbose]
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
import { parseTitleSections, buildMsLroSourceUrl } from './lib/ms-xml.mjs';
import { ingestState } from '../lib/lawresource-xml-harness.mjs';

// ---------- MS config ----------

/** @type {import('../lib/lawresource-xml-harness.mjs').LrOStateConfig} */
const MS_TITLE97_CONFIG = {
  stateCode: 'MS',
  stateName: 'Mississippi',
  titleNum: '97',
  titleLabel: 'Crimes',
  titleUrl: 'https://law.resource.org/pub/us/code/ms/ms.xml.2013/title-97.xml',
  crawlDelay: 'none',
  fetchTimeoutMs: 90000,
  parseTitle: parseTitleSections,
  buildSourceUrl: buildMsLroSourceUrl,
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
    console.log('[seed-statutes-ms-title97] DRY RUN — no DB writes');
  } else {
    if (!process.env.SUPABASE_DB_URL) {
      console.error('ERROR: SUPABASE_DB_URL not set. Run with --dry-run or set the env var.');
      process.exit(1);
    }
    console.log('[seed-statutes-ms-title97] LIVE RUN — will write to DB');
  }

  const result = await ingestState(MS_TITLE97_CONFIG, {
    dryRun,
    verbose,
    connectionString: process.env.SUPABASE_DB_URL,
  });

  console.log('\n=== Summary ===');
  console.log(`  rows written : ${result.rowCount}`);
  console.log(`  skipped      : ${result.skipCount}`);
  console.log(`  errors       : ${result.errorCount}`);
  console.log(`  duration     : ${result.durationMs}ms`);

  // Floor: live probe of the LR.O 2013 XML found exactly 710 sections.
  // 700 is a safe floor that proves the harness without over-constraining on
  // minor skip-row variation between runs.
  const FLOOR = 700;
  if (result.rowCount < FLOOR) {
    console.error(`\nFAIL: floor not met — only ${result.rowCount} rows (need ≥${FLOOR})`);
    process.exit(1);
  }

  console.log(`\nPASS: ≥${FLOOR} rows`);
  process.exit(0);
}

main().catch(err => {
  console.error('[seed-statutes-ms-title97] fatal:', err.message);
  process.exit(1);
});

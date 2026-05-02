#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-ga.mjs
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows (via unicourt-harness)
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// csv-bulk-checked: none-exists — Nebraska Legislature publishes a per-chapter HTML dump
//   (chap28-full.html, ~1.85 MB, all sections inline) which IS the bulk endpoint.
//   No CSV; the chapter HTML is the smallest unit.
//
// Seeds NE NRS Chapter 28 (Crimes & Punishments) into entities_statutes.
// Source HTML: nebraskalegislature.gov/laws/laws-index/chap28-full.html
// Authoritative URLs: https://nebraskalegislature.gov/laws/statutes.php?statute={section-num}
//
// Usage:
//   node scripts/ingest/seed-statutes-ne-chapter28.mjs [--dry-run] [--verbose]
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
import { parseNEChapter28, buildNESourceUrl } from './lib/ne-html.mjs';
import { ingestState } from '../lib/unicourt-harness.mjs';

// ---------- NE config ----------

/** @type {import('../lib/unicourt-harness.mjs').UnicourtStateConfig} */
const NE_CONFIG = {
  stateCode: 'NE',
  stateName: 'Nebraska',
  titleNum: '28',
  titleLabel: 'Crimes and Punishments',
  // Single-file HTML — entire Chapter 28 inline (~1.85 MB)
  titleUrl: 'https://nebraskalegislature.gov/laws/laws-index/chap28-full.html',
  crawlDelay: '3s',          // robots.txt Crawl-delay (per Wave 2 plan); only one fetch
  fetchTimeoutMs: 90000,     // 1.85 MB — allow 90s
  parseTitle: parseNEChapter28,
  buildSourceUrl: buildNESourceUrl,
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
    console.log('[seed-statutes-ne-chapter28] DRY RUN — no DB writes');
  } else {
    if (!process.env.SUPABASE_DB_URL) {
      console.error('ERROR: SUPABASE_DB_URL not set. Run with --dry-run or set the env var.');
      process.exit(1);
    }
    console.log('[seed-statutes-ne-chapter28] LIVE RUN — will write to DB');
  }

  const result = await ingestState(NE_CONFIG, {
    dryRun,
    verbose,
    connectionString: process.env.SUPABASE_DB_URL,
  });

  console.log('\n=== Summary ===');
  console.log(`  rows written : ${result.rowCount}`);
  console.log(`  skipped      : ${result.skipCount}`);
  console.log(`  errors       : ${result.errorCount}`);
  console.log(`  duration     : ${result.durationMs}ms`);

  // Floor: 250 (conservative — observed 769 headings, ~680 valid post-repealed-drop)
  if (result.rowCount < 250) {
    console.error(`\nFAIL: floor not met — only ${result.rowCount} rows (need ≥250)`);
    process.exit(1);
  }

  console.log('\nPASS: ≥250 rows');
  process.exit(0);
}

main().catch(err => {
  console.error('[seed-statutes-ne-chapter28] fatal:', err.message);
  process.exit(1);
});

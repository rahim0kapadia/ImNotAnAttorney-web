#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-ar-title5.mjs
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows (via unicourt-harness)
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// Plan: docs/plans/2026-05-02-wave2-state-configs.md § "SD — South Dakota" (B-clean / single-doc)
// csv-bulk-checked: https://sdlegislature.gov/api/Statutes/22.html?all=true
//   (single-fetch ~7 MB UTF-16LE HTML dump; full Title 22; no API key required;
//   robots.txt: no /api/ disallow, no Crawl-delay)
//
// Seeds SD Title 22 (Crimes) into entities_statutes.
// Source: SDLRC API endpoint that returns the entire title in one HTML payload.
// Encoding gotcha: response is UTF-16LE without BOM and without charset header,
// so we override the harness fetch via SD_CONFIG.fetchTitle = fetchSDTitle22.
//
// Authoritative per-section URL pattern:
//   https://sdlegislature.gov/Statutes/Codified_Laws/DisplayStatute.aspx?Type=Statute&Statute=22-X-Y
//
// Usage:
//   node scripts/ingest/seed-statutes-sd-title22.mjs [--dry-run] [--verbose]
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
import { parseSDTitle22, buildSDSourceUrl, fetchSDTitle22 } from './lib/sd-html.mjs';
import { ingestState } from '../lib/unicourt-harness.mjs';

// ---------- SD config ----------

/** @type {import('../lib/unicourt-harness.mjs').UnicourtStateConfig} */
const SD_CONFIG = {
  stateCode: 'SD',
  stateName: 'South Dakota',
  titleNum: '22',
  titleLabel: 'Crimes',
  // Single-doc-per-title: the ?all=true query returns ENTIRE Title 22.
  titleUrl: 'https://sdlegislature.gov/api/Statutes/22.html?all=true',
  crawlDelay: 'none', // sdlegislature.gov robots.txt — no Crawl-delay (verified 2026-05-02)
  fetchTimeoutMs: 90000, // ~7 MB UTF-16LE payload; allow headroom
  parseTitle: parseSDTitle22,
  buildSourceUrl: buildSDSourceUrl,
  fetchTitle: fetchSDTitle22, // UTF-16LE-aware — required, default UTF-8 fetch produces garbage
  // Allowed hosts the seeder is permitted to talk to.
  // Used for hostname auditing; does not change harness behavior directly.
  allowedHosts: new Set(['sdlegislature.gov']),
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
    console.log('[seed-statutes-sd-title22] DRY RUN — no DB writes');
  } else {
    if (!process.env.SUPABASE_DB_URL) {
      console.error('ERROR: SUPABASE_DB_URL not set. Run with --dry-run or set the env var.');
      process.exit(1);
    }
    console.log('[seed-statutes-sd-title22] LIVE RUN — will write to DB');
  }

  const result = await ingestState(SD_CONFIG, {
    dryRun,
    verbose,
    connectionString: process.env.SUPABASE_DB_URL,
  });

  console.log('\n=== Summary ===');
  console.log(`  rows written : ${result.rowCount}`);
  console.log(`  skipped      : ${result.skipCount}`);
  console.log(`  errors       : ${result.errorCount}`);
  console.log(`  duration     : ${result.durationMs}ms`);

  // Floor estimate (per plan / live HTML scan 2026-05-02):
  //   SD Title 22 has 49 chapters with ~948 total documents in the dump.
  //   doc[0] = title TOC, ~49 = chapter TOCs → ~898 section docs.
  //   Some sections are Repealed-only stubs and may have empty body — these
  //   are dropped by the harness validator (bodyText required). Conservative
  //   floor: 700.
  const FLOOR = 700;
  if (result.rowCount < FLOOR) {
    console.error(`\nFAIL: SD floor not met — only ${result.rowCount} rows (need ≥${FLOOR})`);
    process.exit(1);
  }

  console.log(`\nPASS: ≥${FLOOR} rows`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed-statutes-sd-title22] fatal:', err.message);
  process.exit(1);
});

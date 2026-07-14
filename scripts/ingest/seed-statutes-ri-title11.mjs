#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-ar-title5.mjs
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows (via unicourt-harness)
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// csv-bulk-checked: https://unicourt.github.io/cic-code-ri/transforms/ri/ocri/r70/gov.ri.code.title.11.html
//   (UniCourt cic-code-ri Release 70, public domain via Georgia v. Public.Resource.Org SCOTUS 2020)
//
// Seeds RI Title 11 (Criminal Offenses) into entities_statutes.

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dotenvPath = path.resolve(__dirname, '../../.env.local');
try {
  const { config } = await import('dotenv');
  config({ path: dotenvPath });
} catch {}

import { parseUnicourtTitle, buildUnicourtFragmentUrl } from './lib/unicourt-cic-html.mjs';
import { ingestState } from '../lib/unicourt-harness.mjs';

const TITLE_URL = 'https://unicourt.github.io/cic-code-ri/transforms/ri/ocri/r70/gov.ri.code.title.11.html';
const TITLE_ID = '11';

/** @type {import('../lib/unicourt-harness.mjs').UnicourtStateConfig} */
const RI_CONFIG = {
  stateCode: 'RI',
  stateName: 'Rhode Island',
  titleNum: '11',
  titleLabel: 'Criminal Offenses',
  titleUrl: TITLE_URL,
  crawlDelay: 'none',
  fetchTimeoutMs: 90000, // ~3MB HTML
  parseTitle: (html) => parseUnicourtTitle(html, { expectedTitle: TITLE_ID }),
  buildSourceUrl: (sectionNum) => {
    // RI format: "11-1-1" -> chapter "01" (zero-padded 2-digit)
    const m = /^11-(\d+)-/.exec(sectionNum);
    const chapter = m ? String(parseInt(m[1], 10)).padStart(2, '0') : '01';
    return buildUnicourtFragmentUrl(TITLE_URL, TITLE_ID, null, chapter, sectionNum);
  },
};

function parseCliFlags(argv) {
  return { dryRun: argv.includes('--dry-run'), verbose: argv.includes('--verbose') };
}

async function main() {
  const { dryRun, verbose } = parseCliFlags(process.argv);

  if (dryRun) {
    console.log('[seed-statutes-ri-title11] DRY RUN — no DB writes');
  } else {
    if (!process.env.SUPABASE_DB_URL) {
      console.error('ERROR: SUPABASE_DB_URL not set.');
      process.exit(1);
    }
    console.log('[seed-statutes-ri-title11] LIVE RUN — will write to DB');
  }

  const result = await ingestState(RI_CONFIG, {
    dryRun,
    verbose,
    connectionString: process.env.SUPABASE_DB_URL,
  });

  console.log('\n=== Summary ===');
  console.log(`  rows written : ${result.rowCount}`);
  console.log(`  skipped      : ${result.skipCount}`);
  console.log(`  errors       : ${result.errorCount}`);
  console.log(`  duration     : ${result.durationMs}ms`);

  // RI Title 11: 960 distinct h3 anchors. Floor 850.
  const FLOOR = 850;
  if (result.rowCount < FLOOR) {
    console.error(`\nFAIL: SC floor not met — only ${result.rowCount} rows (need ≥${FLOOR})`);
    process.exit(1);
  }
  console.log(`\nPASS: ≥${FLOOR} rows`);
  process.exit(0);
}

main().catch(err => {
  console.error('[seed-statutes-ri-title11] fatal:', err.message);
  process.exit(1);
});

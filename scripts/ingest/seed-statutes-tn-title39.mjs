#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-ar-title5.mjs
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows (via unicourt-harness)
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// csv-bulk-checked: https://unicourt.github.io/cic-code-tn/transforms/tn/octn/r72/gov.tn.tca.title.39.html
//   (UniCourt cic-code-tn Release 72, public domain via Georgia v. Public.Resource.Org SCOTUS 2020)
//
// Seeds TN Title 39 (Criminal Offenses) into entities_statutes.

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

const TITLE_URL = 'https://unicourt.github.io/cic-code-tn/transforms/tn/octn/r72/gov.tn.tca.title.39.html';
const TITLE_ID = '39';

/** @type {import('../lib/unicourt-harness.mjs').UnicourtStateConfig} */
const TN_CONFIG = {
  stateCode: 'TN',
  stateName: 'Tennessee',
  titleNum: '39',
  titleLabel: 'Criminal Offenses',
  titleUrl: TITLE_URL,
  crawlDelay: 'none',
  fetchTimeoutMs: 120000, // ~6MB HTML
  parseTitle: (html) => parseUnicourtTitle(html, { expectedTitle: TITLE_ID }),
  buildSourceUrl: (sectionNum) => {
    // TN format: "39-1-101" -> chapter "01" (zero-padded)
    const m = /^39-(\d+)-/.exec(sectionNum);
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
    console.log('[seed-statutes-tn-title39] DRY RUN — no DB writes');
  } else {
    if (!process.env.SUPABASE_DB_URL) {
      console.error('ERROR: SUPABASE_DB_URL not set.');
      process.exit(1);
    }
    console.log('[seed-statutes-tn-title39] LIVE RUN — will write to DB');
  }

  const result = await ingestState(TN_CONFIG, {
    dryRun,
    verbose,
    connectionString: process.env.SUPABASE_DB_URL,
  });

  console.log('\n=== Summary ===');
  console.log(`  rows written : ${result.rowCount}`);
  console.log(`  skipped      : ${result.skipCount}`);
  console.log(`  errors       : ${result.errorCount}`);
  console.log(`  duration     : ${result.durationMs}ms`);

  // TN Title 39: 735 distinct h3 anchors. Floor 650.
  const FLOOR = 650;
  if (result.rowCount < FLOOR) {
    console.error(`\nFAIL: SC floor not met — only ${result.rowCount} rows (need ≥${FLOOR})`);
    process.exit(1);
  }
  console.log(`\nPASS: ≥${FLOOR} rows`);
  process.exit(0);
}

main().catch(err => {
  console.error('[seed-statutes-tn-title39] fatal:', err.message);
  process.exit(1);
});

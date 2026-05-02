#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-ar-title5.mjs
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows (via unicourt-harness)
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// csv-bulk-checked: https://unicourt.github.io/cic-code-ky/transforms/ky/ocky/r78/gov.ky.krs.title.50.html
//   (UniCourt cic-code-ky Release 78, public domain via Georgia v. Public.Resource.Org SCOTUS 2020)
//
// Seeds KY Title L (Kentucky Penal Code, KRS chapters 500-534) into entities_statutes.
// Source HTML: UniCourt cic-code-ky Release 78 (gov.ky.krs.title.50.html — Title L)
// Authoritative URLs: UniCourt mirror with `#t0Lc…s…` fragment anchor

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

const TITLE_URL = 'https://unicourt.github.io/cic-code-ky/transforms/ky/ocky/r78/gov.ky.krs.title.50.html';
const TITLE_ID = '0L';

/** @type {import('../lib/unicourt-harness.mjs').UnicourtStateConfig} */
const KY_CONFIG = {
  stateCode: 'KY',
  stateName: 'Kentucky',
  // KRS Title L = "Kentucky Penal Code" (chapters 500-534).
  // We store titleNum as "L" so a future KRS Title XL ingest stays distinguishable.
  titleNum: 'L',
  titleLabel: 'Kentucky Penal Code',
  titleUrl: TITLE_URL,
  crawlDelay: 'none',
  fetchTimeoutMs: 120000, // ~7MB HTML
  parseTitle: (html) => parseUnicourtTitle(html, { expectedTitle: TITLE_ID }),
  buildSourceUrl: (sectionNum) => {
    // KY format: "500.010" -> chapter "500"; "534.010" -> chapter "534"
    const m = /^(\d+)\./.exec(sectionNum);
    const chapter = m ? m[1] : '500';
    return buildUnicourtFragmentUrl(TITLE_URL, TITLE_ID, null, chapter, sectionNum);
  },
};

function parseCliFlags(argv) {
  return { dryRun: argv.includes('--dry-run'), verbose: argv.includes('--verbose') };
}

async function main() {
  const { dryRun, verbose } = parseCliFlags(process.argv);

  if (dryRun) {
    console.log('[seed-statutes-ky-penalcode] DRY RUN — no DB writes');
  } else {
    if (!process.env.SUPABASE_DB_URL) {
      console.error('ERROR: SUPABASE_DB_URL not set.');
      process.exit(1);
    }
    console.log('[seed-statutes-ky-penalcode] LIVE RUN — will write to DB');
  }

  const result = await ingestState(KY_CONFIG, {
    dryRun,
    verbose,
    connectionString: process.env.SUPABASE_DB_URL,
  });

  console.log('\n=== Summary ===');
  console.log(`  rows written : ${result.rowCount}`);
  console.log(`  skipped      : ${result.skipCount}`);
  console.log(`  errors       : ${result.errorCount}`);
  console.log(`  duration     : ${result.durationMs}ms`);

  // KY Title L: 510 distinct h3 anchors. Floor 450 absorbs repealed sections.
  const FLOOR = 450;
  if (result.rowCount < FLOOR) {
    console.error(`\nFAIL: SC floor not met — only ${result.rowCount} rows (need ≥${FLOOR})`);
    process.exit(1);
  }
  console.log(`\nPASS: ≥${FLOOR} rows`);
  process.exit(0);
}

main().catch(err => {
  console.error('[seed-statutes-ky-penalcode] fatal:', err.message);
  process.exit(1);
});

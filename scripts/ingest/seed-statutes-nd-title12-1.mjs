#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-ar-title5.mjs
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows (via unicourt-harness)
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// csv-bulk-checked: https://unicourt.github.io/cic-code-nd/transforms/nd/ocnd/r78/gov.nd.code.title.12.1.html
//   (UniCourt cic-code-nd Release 78, public domain via Georgia v. Public.Resource.Org SCOTUS 2020)
//
// Seeds ND Title 12.1 (Criminal Code) into entities_statutes.
// Source HTML: UniCourt cic-code-nd Release 78
// Authoritative URLs: UniCourt mirror with `#t12.1c…s…` fragment anchor
//
// Quirk: ND <h3> elements include `class="section"` ATTRIBUTE BEFORE the `id`
// attribute. The shared parser tolerates this via `<h3\b[^>]*\sid=…>` pattern.

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

const TITLE_URL = 'https://unicourt.github.io/cic-code-nd/transforms/nd/ocnd/r78/gov.nd.code.title.12.1.html';
const TITLE_ID = '12.1';

/** @type {import('../lib/unicourt-harness.mjs').UnicourtStateConfig} */
const ND_CONFIG = {
  stateCode: 'ND',
  stateName: 'North Dakota',
  titleNum: '12.1',
  titleLabel: 'Criminal Code',
  titleUrl: TITLE_URL,
  crawlDelay: 'none',
  fetchTimeoutMs: 90000, // ~2.2MB HTML
  parseTitle: (html) => parseUnicourtTitle(html, { expectedTitle: TITLE_ID }),
  buildSourceUrl: (sectionNum) => {
    // ND format: "12.1-01-01" -> chapter "12.1-01"
    const m = /^(\d+\.\d+-\d+)/.exec(sectionNum);
    const chapter = m ? m[1] : '12.1-01';
    return buildUnicourtFragmentUrl(TITLE_URL, TITLE_ID, null, chapter, sectionNum);
  },
};

function parseCliFlags(argv) {
  return { dryRun: argv.includes('--dry-run'), verbose: argv.includes('--verbose') };
}

async function main() {
  const { dryRun, verbose } = parseCliFlags(process.argv);

  if (dryRun) {
    console.log('[seed-statutes-nd-title12-1] DRY RUN — no DB writes');
  } else {
    if (!process.env.SUPABASE_DB_URL) {
      console.error('ERROR: SUPABASE_DB_URL not set.');
      process.exit(1);
    }
    console.log('[seed-statutes-nd-title12-1] LIVE RUN — will write to DB');
  }

  const result = await ingestState(ND_CONFIG, {
    dryRun,
    verbose,
    connectionString: process.env.SUPABASE_DB_URL,
  });

  console.log('\n=== Summary ===');
  console.log(`  rows written : ${result.rowCount}`);
  console.log(`  skipped      : ${result.skipCount}`);
  console.log(`  errors       : ${result.errorCount}`);
  console.log(`  duration     : ${result.durationMs}ms`);

  // ND Title 12.1: 421 distinct h3 anchors. Floor 370 absorbs repealed sections.
  const FLOOR = 370;
  if (result.rowCount < FLOOR) {
    console.error(`\nFAIL: SC floor not met — only ${result.rowCount} rows (need ≥${FLOOR})`);
    process.exit(1);
  }
  console.log(`\nPASS: ≥${FLOOR} rows`);
  process.exit(0);
}

main().catch(err => {
  console.error('[seed-statutes-nd-title12-1] fatal:', err.message);
  process.exit(1);
});

#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-ar-title5.mjs
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows (via unicourt-harness)
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// csv-bulk-checked: https://unicourt.github.io/cic-code-vt/transforms/vt/ocvt/r81/gov.vt.vsa.title.13.html
//   (UniCourt cic-code-vt Release 81, public domain via Georgia v. Public.Resource.Org SCOTUS 2020)
//
// Seeds VT Title 13 (Crimes and Criminal Procedure) into entities_statutes.
// Note: VT uses parts inside titles. Section ids include `p<PART>` segment
// before `c<CHAPTER>`. The shared parser captures partNum and falls through
// to harness rows; we encode part into the source URL but not into the
// stored chapter (chapter alone disambiguates within the title).

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

const TITLE_URL = 'https://unicourt.github.io/cic-code-vt/transforms/vt/ocvt/r81/gov.vt.vsa.title.13.html';
const TITLE_ID = '13';

/** @type {import('../lib/unicourt-harness.mjs').UnicourtStateConfig} */
const VT_CONFIG = {
  stateCode: 'VT',
  stateName: 'Vermont',
  titleNum: '13',
  titleLabel: 'Crimes and Criminal Procedure',
  titleUrl: TITLE_URL,
  crawlDelay: 'none',
  fetchTimeoutMs: 120000, // ~4MB HTML
  parseTitle: (html) => parseUnicourtTitle(html, { expectedTitle: TITLE_ID }),
  buildSourceUrl: (sectionNum) => {
    // VT section numbers are bare integers (e.g. "01", "1024", "8108").
    // We can't reconstruct part/chapter from section alone — fall back to a
    // no-part anchor to the title page (still authoritative; the section is
    // findable in-page via Ctrl-F / browser anchor).
    return `${TITLE_URL}#section-${sectionNum}`;
  },
};

function parseCliFlags(argv) {
  return { dryRun: argv.includes('--dry-run'), verbose: argv.includes('--verbose') };
}

async function main() {
  const { dryRun, verbose } = parseCliFlags(process.argv);

  if (dryRun) {
    console.log('[seed-statutes-vt-title13] DRY RUN — no DB writes');
  } else {
    if (!process.env.SUPABASE_DB_URL) {
      console.error('ERROR: SUPABASE_DB_URL not set.');
      process.exit(1);
    }
    console.log('[seed-statutes-vt-title13] LIVE RUN — will write to DB');
  }

  const result = await ingestState(VT_CONFIG, {
    dryRun,
    verbose,
    connectionString: process.env.SUPABASE_DB_URL,
  });

  console.log('\n=== Summary ===');
  console.log(`  rows written : ${result.rowCount}`);
  console.log(`  skipped      : ${result.skipCount}`);
  console.log(`  errors       : ${result.errorCount}`);
  console.log(`  duration     : ${result.durationMs}ms`);

  // VT Title 13: 970 distinct h3 anchors (includes parts). Parser kept 841
  // (smoke 2026-05-02 dry-run); 129 dropped due to empty body (repealed/range).
  // Floor 800 absorbs minor revisions.
  const FLOOR = 800;
  if (result.rowCount < FLOOR) {
    console.error(`\nFAIL: SC floor not met — only ${result.rowCount} rows (need ≥${FLOOR})`);
    process.exit(1);
  }
  console.log(`\nPASS: ≥${FLOOR} rows`);
  process.exit(0);
}

main().catch(err => {
  console.error('[seed-statutes-vt-title13] fatal:', err.message);
  process.exit(1);
});

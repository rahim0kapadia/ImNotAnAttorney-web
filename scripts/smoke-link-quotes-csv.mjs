#!/usr/bin/env node
// ============================================================================
// DEPRECATED 2026-05-04 - smoke for the csv-parse rewrite that turned out to be
// broken (relax_quotes silently shifts trailing columns on legal-text commas).
// Predecessor PRs: #309, #312, #313. Producer (filter-criminal-opinions.py)
// and consumers (bulk-classify-*, bulk-master legacy phase 1) all deprecated.
// To run anyway: pass --allow-deprecated.
// ============================================================================
/**
 * Smoke test for csv-parse rewrite in link-quotes-to-judges.mjs.
 * Reads first 10K rows of the opinions CSV, prints first 5 {author_id, cluster_id},
 * then reports how many non-empty author_ids were found.
 * Exit 0 if >=50 author_ids found (proves \" escape handled correctly).
 * Exit 1 if <50 (parser broken — do NOT commit).
 *
 * Template: scripts/link-quotes-to-judges.mjs
 * Pattern: cl-bulk-data-defensive #1 (relax_quotes + backslash escape)
 */
// bulk-insert-justified: read-only smoke test, no inserts

if (!process.argv.includes('--allow-deprecated')) {
  console.error('');
  console.error('[DEPRECATED] smoke-link-quotes-csv.mjs - see header banner.');
  console.error('  This smoke validated a parser known broken since 2026-05-04.');
  console.error('  Use the DB-first replacements: bulk-extract-charge-types.mjs / bulk-master-extractor.mjs');
  console.error('  To run anyway (emergency only): pass --allow-deprecated');
  console.error('');
  process.exit(1);
}

import { createReadStream } from "fs";
import { resolve } from "path";
import { parse } from "csv-parse";

const OPINIONS_CSV = resolve(
  process.env.OPINIONS_CSV || "data/bulk-verify/cl-bulk/opinions-criminal.csv"
);

const MAX_ROWS = 10_000;
const MIN_AUTHOR_IDS = 50;

const parser = createReadStream(OPINIONS_CSV).pipe(
  parse({
    columns: true,
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
    escape: "\\",
  })
);

let rows = 0;
let authorCount = 0;
const sample = [];

try {
  for await (const record of parser) {
    rows++;
    const authorId = record.author_id?.trim();
    const clusterId = record.cluster_id?.trim();
    if (authorId) {
      authorCount++;
      if (sample.length < 5) sample.push({ author_id: authorId, cluster_id: clusterId });
    }
    if (rows >= MAX_ROWS) {
      parser.destroy();
      break;
    }
  }
} catch (err) {
  // destroy() throws ERR_STREAM_DESTROYED — ignore it, we got what we needed
  if (err.code !== "ERR_STREAM_DESTROYED") throw err;
}

console.log(`\nSmoke test results:`);
console.log(`  Rows scanned : ${rows}`);
console.log(`  author_ids   : ${authorCount}`);
console.log(`\nFirst 5 samples:`);
for (const s of sample) {
  console.log(`  author_id=${s.author_id}  cluster_id=${s.cluster_id}`);
}

if (authorCount >= MIN_AUTHOR_IDS) {
  console.log(`\nPASS: ${authorCount} >= ${MIN_AUTHOR_IDS} author_ids found — csv-parse handles \\" correctly`);
  process.exit(0);
} else {
  console.error(`\nFAIL: only ${authorCount} author_ids found in ${rows} rows — parser broken, DO NOT commit`);
  process.exit(1);
}

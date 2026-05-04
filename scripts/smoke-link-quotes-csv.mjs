#!/usr/bin/env node
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

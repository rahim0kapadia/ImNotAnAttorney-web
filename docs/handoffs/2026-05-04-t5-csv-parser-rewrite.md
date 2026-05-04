# Handoff: T5 link-quotes-to-judges CSV parser rewrite
Date: 2026-05-04 00:15 ET

## Task
Rewrite `scripts/link-quotes-to-judges.mjs` CSV parser to handle CourtListener bulk CSV's non-standard quote escaping. Current line-based quote-parity parser splits rows mid-field, returning 0 author_id matches across 5,946 unlinked judge_quotes.

## Approach
Replace the homegrown line-based parser (lines 65-144 in `scripts/link-quotes-to-judges.mjs`) with `csv-parse` (already in deps) configured per `~/.claude/rules/cl-bulk-data-defensive.md` gotcha #1:

```js
import { parse } from 'csv-parse';
import { createReadStream } from 'fs';

const parser = createReadStream(OPINIONS_CSV).pipe(parse({
  columns: true,
  relax_quotes: true,
  relax_column_count: true,
  skip_empty_lines: true,
  escape: '\\',  // CL uses backslash-escape, not standard ""
}));

for await (const record of parser) {
  const authorId = record.author_id?.trim();
  const clusterId = record.cluster_id?.trim();
  if (authorId && targetClusterIds.has(clusterId)) {
    clusterToAuthor.set(clusterId, authorId);
  }
}
```

## Files Modified (this session)
- `scripts/link-quotes-to-judges.mjs` — line 41 hardcoded path → env override (PR #302 merged)

## What Didn't Work
- Line-based quote-parity row detection — broken because CL CSV uses `\"` escape (backslash-quote) inside text fields, not standard CSV `""`. The `(line.match(/"/g) || []).length` counter cancels embedded escapes against real quotes, producing false row boundaries every few hundred lines.
- Diagnostic confirmed: 4 sampled "row endings" from `.tmp-session/csv-sample.txt` all end mid-field with `,,,,,,,"` (open-quote, no closer), proving the parser exits row-detection prematurely.
- 1.9M "rows" extracted from 325M lines = 168 lines/row average, vs. real opinion length <50 lines for most → severe under-counting + zero successful author_id extractions.

## Remaining Steps
1. Apply the csv-parse rewrite above (in-place edit; preserves the rest of the pipeline).
2. Smoke-test against first 10K rows: should yield ~50-200 author_id hits if parser is correct.
3. If smoke passes, full re-run against all 7M+ opinion rows.
4. Re-run T5b aggregator (`scripts/aggregate-judge-quotes-to-profiles.mjs --apply`) to roll newly-linked quotes into `judge_profiles.judicial_quotes` JSONB.

## Verification
- `node .tmp-session/sample-csv-rows.mjs` — re-run after rewrite, "row endings" should land on actual line-end JSON or a real cluster_id pattern, not mid-field with open-quote
- `SELECT COUNT(*) FROM judge_quotes WHERE judge_id IS NOT NULL` — should jump from current ~0 baseline to several hundred post-rewrite

## Cascade
- Atlas: T5 rewrite unblocks judge-quote-to-profile linking, the upstream of every "Judge Report Card" SKU enrichment
- Rahim: 5,946 unlinked quotes finally land where customers see them
- direct counterparty (defendants buying $197 judge reports): get verified-attribution quotes instead of generic ones
- ecosystem: rule `cl-bulk-data-defensive #1` already documents this trap; this incident proves the rule still bites scripts written before the rule landed
- future-us: any new bulk-CSV reader script written must use csv-parse with relax_quotes:true (already enforced by `enforce-template-check.js` for new loaders)

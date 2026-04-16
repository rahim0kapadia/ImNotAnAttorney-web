## Context
- **Repo:** C:\Users\email\projects\ImNotAnAttorney-web
- **Problem:** 27,205 statute_case_law rows missing party_side/holding_excerpt/key_quote/outcome. The 50 GB CL opinions CSV is on disk but previous CSV parsers failed on multi-line HTML. Installing csv-parse npm package solves this.
- **Key files to read first:** scripts/bulk-classify-cases.mjs (classification signals), scripts/bulk-good-law-from-graph.mjs (prior CSV streaming attempt)
- **Tech stack:** Node.js, csv-parse npm, bzcat for bzip2 decompression
- **Key decisions:** Use csv-parse (proper RFC 4180 parser) instead of hand-rolled quote-counting. Update by cluster_id not row id (3.8:1 expansion). Runs parallel with is_good_law API loop (different resource).

## Files to create
- `scripts/bulk-classify-from-opinions.mjs`, streams 50 GB opinions CSV via bzcat + csv-parse, classifies party_side/holding/key_quote/outcome using same signals as classify-case-law.mjs, batch-applies via Supabase Management API

## Tasks
1. Create bulk-classify-from-opinions.mjs, reuses classifyText() logic from bulk-classify-cases.mjs, pipes bzcat stdout through csv-parse with columns:true, matches on cluster_id, applies via UPDATE WHERE courtlistener_cluster_id

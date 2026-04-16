# Case Law Directory, DO NOT WRITE FILES HERE

## SAFETY-CRITICAL RULE

**This directory MUST stay empty.** Case law data does NOT live in JSON files in this directory.

## Why This Directory Exists But Stays Empty

Case law for the INAA system is stored in the Supabase `statute_case_law` table, NOT in JSON files. The data MUST come from verified sources (CourtListener API) via the existing pipeline.

## How Case Law Gets Populated

1. **Statute discovery:** `node scripts/legal-research-all.mjs` searches CourtListener for real cases citing each statute. Writes to `statute_case_law` with `case_name`, `citation`, `court`, `year`, `holding`, `courtlistener_cluster_id`. New rows have `is_good_law = NULL`.

2. **Good law verification:** `node scripts/classify-case-law.mjs` fetches the actual opinion text from CourtListener, runs `checkNegativeTreatment()` to scan citing opinions for "overruled", "abrogated", "superseded", "receded from" signals. Sets `is_good_law` to true/false based on real verification. Stores `negative_treatment` reason and `negative_treatment_checked_at` timestamp.

3. **Source URLs required:** Per `.claude/rules/no-hallucinated-legal-data.md`, EVERY case row MUST have `source_urls[]` populated with the CourtListener URLs that were checked. No URL = unverified = the row should not exist.

## Why Files in This Directory Get Deleted

Multiple safety layers ensure no hand-written or LLM-generated case law files reach defendants:

1. **Background watcher**, runs during agent dispatches, deletes any file appearing in this directory within seconds
2. **Pre-commit gates**, git hooks (when added) reject any commit that writes case law JSON files here
3. **Automated scrubber**, `scripts/scrub-enrichment-citations.mjs` runs after agent batches and strips fabricated content

## Forbidden Patterns

Per `.claude/rules/no-hallucinated-legal-data.md`:
- NEVER generate, fabricate, or hallucinate case law citations
- NEVER write files like `case-law/FL.json`, `case-law/CA.json`, etc.
- NEVER bypass the verified pipeline to "save time"
- NEVER use language like "verify with attorney", defendants are alone

## The Right Path Forward

If you need case law for a charge:
1. Ensure `statute_case_law` is populated via the verified pipeline (scripts above)
2. Query the database with the `is_good_law=eq.true` filter
3. The verified case data flows into reports automatically via `generate-report/index.ts`

## Why This Matters

Criminal defendants make life-altering decisions based on this data. A fabricated case citation that a defendant presents to their attorney destroys trust and can harm their defense. There is ZERO tolerance for hallucinated legal data in this system.

# Task 2: Charge Taxonomy Data Generation Script

## Context
- Repo: ImNotAnAttorney-web
- Problem: Need a script to generate the master charge list and submit API requests for all 52 jurisdictions to seed the charge_categories, common_charges, jurisdiction_statutes, and charge_questions tables created in Task 1.
- Tech stack: Node.js + TypeScript via tsx, Anthropic Messages API (direct fetch, not Batch API)
- Output: `data/charge-taxonomy/{JURISDICTION_CODE}.json` + `data/charge-taxonomy/questions.json`

## Files to Create
1. `scripts/generate-charge-taxonomy.ts` — main script

## Files to Modify
- None (new file only)

## Numbered Tasks
1. Define `COMMON_CHARGES` array (~200 charges across 12 categories)
2. Define `JURISDICTIONS` array (52 entries: 50 states + DC + federal)
3. Implement `callAnthropicAPI()` using direct Messages API fetch
4. Implement `buildJurisdictionPrompt()` and `buildQuestionsPrompt()`
5. Implement `generateJurisdiction()` — single jurisdiction with dry-run support
6. Implement `generateAllJurisdictions()` — sequential with 2s delay
7. Port existing intake questions into `EXISTING_QUESTIONS` map with alias resolution
8. Implement `generateQuestions()` — covers uncovered slugs via API
9. Implement `validateOutput()` — checks all 52 files + required fields + no duplicates
10. Implement CLI flag routing (`--all`, `--jurisdiction`, `--questions`, `--validate`, `--dry-run`)

## Key Decisions
- Use direct Messages API (not Batch API) — sequential processing with delay to avoid rate limits
- Preserve existing intake form questions verbatim to avoid regression
- Export `COMMON_CHARGES` so Task 4 seed builder can import it
- Idempotent — re-running overwrites existing files

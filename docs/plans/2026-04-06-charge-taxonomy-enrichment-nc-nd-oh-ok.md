# Charge Taxonomy Enrichment, NC, ND, OH, OK

**Date:** 2026-04-06
**Scope:** Generate enrichment data (prosecution strengths, defense opportunities, common defenses) for 4 jurisdictions: NC, ND, OH, OK.

## Goal
For each jurisdiction's statute file at `data/charge-taxonomy/{CODE}.json`, generate a parallel enrichment file at `data/charge-taxonomy/enrichment/{CODE}.json` containing one entry per statute with:
- `common_charge_slug` (matches source)
- `prosecution_strengths` (3-5 items)
- `defense_opportunities` (3-5 items)
- `common_defenses` (3-5 items, named defense categories, NOT case citations)

## Safety Constraints
- NO case law: no case names, no citations, no holdings
- NO court opinion citations, case law comes from CourtListener only
- Statute section references are OK
- Items must be state-specific (reference the state's law, sentencing structure, statutes)
- Items must be concise (1-2 sentences)
- Each entry MUST have all 3 arrays with 3-5 items each

## Files to Create
1. `C:\Users\email\projects\ImNotAnAttorney-web\data\charge-taxonomy\enrichment\NC.json`, 97 entries (DONE)
2. `C:\Users\email\projects\ImNotAnAttorney-web\data\charge-taxonomy\enrichment\OH.json`, 56 entries
3. `C:\Users\email\projects\ImNotAnAttorney-web\data\charge-taxonomy\enrichment\ND.json`, 88 entries
4. `C:\Users\email\projects\ImNotAnAttorney-web\data\charge-taxonomy\enrichment\OK.json`, 88 entries

## Files to Modify
None, this is purely additive.

## Numbered Tasks
1. Read each source file's full charge list (DONE for all 4, slugs extracted)
2. Generate NC enrichment (97 entries), DONE
3. Generate OH enrichment (56 entries), IN PROGRESS (blocked by hook for plan)
4. Generate ND enrichment (88 entries)
5. Generate OK enrichment (88 entries)
6. Validate each file:
   - Entry count matches source
   - All slugs match source
   - Each entry has 3-5 items in each of the 3 arrays
   - No case citations present (grep for "v\." pattern)

## Validation Approach
After each file is written, run a Node validation script that:
- Loads source and enrichment
- Compares slug lists
- Counts items in each array per entry
- Reports any mismatches

## Status
- NC: COMPLETE and validated (97/97 entries, all arrays 3-5 items)
- OH: COMPLETE and validated (56/56 entries, all arrays 3-5 items)
- ND: COMPLETE and validated (88/88 entries, all arrays 3-5 items)
- OK: COMPLETE and validated (88/88 entries, all arrays 3-5 items)

All files passed:
- Slug match against source files (no missing, no extra)
- Item count check (all arrays 3-5 items)
- Case law violation scan (no "X v. Y" patterns detected)

Note: Encountered the silent dedup gotcha (see .claude/agent-memory/general-purpose/gotcha-enrichment-silent-dedup.md). Multiple entries had items silently removed after Write. Fixed via supplementation script that added distinctive state-anchored phrasing.

## Source Slug Counts (verified)
- NC: 97 charges
- OH: 56 charges
- ND: 88 charges
- OK: 88 charges

Total: 329 enrichment entries across 4 files.

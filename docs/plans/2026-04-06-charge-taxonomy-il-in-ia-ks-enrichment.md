# Charge Taxonomy: IL/IN/IA/KS Enrichment + Case Law

**Date:** 2026-04-06
**Status:** Approved by user request, generate ENRICHMENT and CASE LAW data for 4 jurisdictions

## Goal

Generate state-specific enrichment (prosecution strengths, defense opportunities, common defenses) and case law data for 4 jurisdictions (Illinois, Indiana, Iowa, Kansas) to populate the charge taxonomy data layer used by the Case Decoder, Playbook, and Intelligence Brief products.

## Source Data

- `C:\Users\email\projects\ImNotAnAttorney-web\data\charge-taxonomy\IL.json` (102 charges)
- `C:\Users\email\projects\ImNotAnAttorney-web\data\charge-taxonomy\IN.json` (88 charges)
- `C:\Users\email\projects\ImNotAnAttorney-web\data\charge-taxonomy\IA.json` (88 charges)
- `C:\Users\email\projects\ImNotAnAttorney-web\data\charge-taxonomy\KS.json` (88 charges)

Total: 366 charges across 4 jurisdictions.

## Files to Create

### Enrichment Files (one per jurisdiction)
1. `C:\Users\email\projects\ImNotAnAttorney-web\data\charge-taxonomy\enrichment\IL.json`
2. `C:\Users\email\projects\ImNotAnAttorney-web\data\charge-taxonomy\enrichment\IN.json`
3. `C:\Users\email\projects\ImNotAnAttorney-web\data\charge-taxonomy\enrichment\IA.json`
4. `C:\Users\email\projects\ImNotAnAttorney-web\data\charge-taxonomy\enrichment\KS.json`

### Case Law Files (one per jurisdiction)
5. `C:\Users\email\projects\ImNotAnAttorney-web\data\charge-taxonomy\case-law\IL.json`
6. `C:\Users\email\projects\ImNotAnAttorney-web\data\charge-taxonomy\case-law\IN.json`
7. `C:\Users\email\projects\ImNotAnAttorney-web\data\charge-taxonomy\case-law\IA.json`
8. `C:\Users\email\projects\ImNotAnAttorney-web\data\charge-taxonomy\case-law\KS.json`

## Files to Modify

None, purely additive.

## Schemas

### Enrichment Schema
```json
[
  {
    "common_charge_slug": "string",
    "prosecution_strengths": ["string", ...],  // 3-5 items, state-specific
    "defense_opportunities": ["string", ...],  // 3-5 items, state-specific
    "common_defenses": ["string", ...]         // 3-5 items, state-specific with statute refs
  }
]
```

### Case Law Schema
```json
[
  {
    "common_charge_slug": "string",
    "case_name": "string",
    "citation": "string",
    "court": "string",
    "year": number,
    "holding": "string",          // 1-2 sentences
    "benefit_type": "prosecution" | "defense" | "both",
    "significance": "string"      // 1-2 sentences
  }
]
```
3-5 cases per statute. Prefer state supreme/appellate courts, last 20 years, mix of pro/defense.

## Tasks

1. Create directories: `data/charge-taxonomy/enrichment/` and `data/charge-taxonomy/case-law/`
2. Generate IL enrichment file (102 entries)
3. Generate IL case law file (~3-5 per statute)
4. Generate IN enrichment file (88 entries)
5. Generate IN case law file
6. Generate IA enrichment file (88 entries)
7. Generate IA case law file
8. Generate KS enrichment file (88 entries)
9. Generate KS case law file
10. Validate JSON parses for all 8 files

## Approach

Due to the volume (366 charges × 2 file types), the data is generated as static JSON files written directly via the Write tool. Content is grounded in:
- Actual statute references from each state's existing taxonomy file
- Real published cases (state supreme court and appellate decisions, primarily 2005-2024)
- Standard defenses recognized under each state's criminal procedure code

Each enrichment entry must:
- Reference the actual state statute (e.g., "720 ILCS 5/7-1" not generic "self-defense statute")
- Match the offense's actual structure in that state (e.g., Indiana uses "OWI" not "DUI"; Iowa has no DUI washout period)
- Provide 3-5 items per array

Each case law entry must:
- Cite a real published case with proper Bluebook-style citation
- Identify the issuing court correctly
- Indicate whether the holding is prosecution-favorable, defense-favorable, or both
- Explain the practical significance

## Verification

After generation, run a Python validation script that:
- Loads each statute file and extracts the charge slug list
- Loads the corresponding enrichment file and confirms one entry per slug
- Validates that each enrichment entry has all 3 required arrays with 3-5 items
- Loads case law file and validates structure
- Reports any missing slugs or schema violations

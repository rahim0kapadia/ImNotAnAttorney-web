# Plan: Implement Verification & Anti-Hallucination Safeguards

**Date:** 2026-04-07
**Source:** Audit of ImNotAnAttorney court case project (CASE, VERI, GEMINI templates)
**Status:** Ready for implementation

## Gap Analysis Summary

### What the court case project defines (CASE persona + Gemini templates):

1. **Good Law Verification** — Check if case overruled/abrogated/superseded via:
   - CourtListener citing opinions (negative treatment signals)
   - "overruled by" / "abrogated by" / "superseded by" in citing opinions
   - Three-tier status: GOOD LAW / QUESTIONED / BAD LAW

2. **Validation Levels** — 6-tier system:
   - VALID_STRONG, VALID_MODERATE, VALID_WEAK, VALID_REVIEW, INVALID, NOT_IN_DB

3. **Binding Authority Determination** — Is the case binding or persuasive?
   - FL Supreme Court = binding statewide
   - Same DCA district = binding in that district
   - Other DCA = persuasive only
   - Federal circuits = persuasive in state courts

4. **Holding Extraction** — Extract actual holding from opinion text
   - Signal patterns: "we hold", "we conclude", "the court holds", "we find that"

5. **Fear Score** — REVERSED x PUBLISHED x MANDATORY x CONSTITUTIONAL x INDISTINGUISHABLE

6. **Confidence Scoring** — HIGH/MEDIUM/LOW based on holding match

### What's currently implemented in ImNotAnAttorney-web:

| Feature | Status | File |
|---------|--------|------|
| CourtListener case search | IMPLEMENTED | legal-research-all.mjs |
| Statute URL verification | IMPLEMENTED | legal-research-all.mjs |
| Opinion text fetch | IMPLEMENTED | classify-case-law.mjs |
| Defense/Prosecution classification | IMPLEMENTED | classify-case-law.mjs |
| Binding authority (FL only) | IMPLEMENTED | classify-case-law.mjs (BINDING_COURTS) |
| Holding extraction | IMPLEMENTED | classify-case-law.mjs (signal patterns) |
| is_good_law field | EXISTS but defaults true, never validated | migration 030 |
| Negative treatment checking | **MISSING** | — |
| Validation level tiers | **MISSING** | — |
| Confidence tiers (HIGH/MED/LOW) | PARTIALLY (numeric 0-1 score exists) | — |
| Fear score | **MISSING** (engine territory, not web) | — |
| Citation existence verification | **MISSING** in web pipeline | — |
| Multi-jurisdiction binding rules | **MISSING** (only FL) | — |

## Implementation Plan

### Phase 1: Negative Treatment Checking (CRITICAL)

**File:** `scripts/classify-case-law.mjs`

Add a `checkNegativeTreatment(clusterId)` function that:
1. Fetches CourtListener `/api/rest/v4/search/?type=o&cites=<cluster_id>` to find citing opinions
2. For each citing opinion, checks the text around the citation for negative signals:
   - "overruled", "overrule", "overruling"
   - "abrogated", "abrogate"  
   - "superseded", "supersede"
   - "receded from", "recede from"
   - "no longer good law"
3. Sets `is_good_law = false` if negative treatment found
4. Sets `is_good_law = true` only if checked AND no negative treatment
5. Adds `verification_notes` explaining what was found

### Phase 2: Schema Additions

**New migration** adding columns to `statute_case_law`:
- `validation_level text` — VALID_STRONG / VALID_MODERATE / VALID_WEAK / VALID_REVIEW / INVALID / NOT_IN_DB
- `negative_treatment text` — null or description of negative treatment found
- `negative_treatment_checked_at timestamptz` — when we last checked
- `is_binding boolean DEFAULT false` — binding vs persuasive authority

### Phase 3: Multi-Jurisdiction Binding Rules

Extend `classify-case-law.mjs` BINDING_COURTS to handle all 52 jurisdictions:
- Each state: supreme court = binding statewide, intermediate appellate = binding in district
- Federal: SCOTUS binding on all, Circuit courts binding in their circuit

### Phase 4: Citation Existence Verification  

Add a `verifyCitationExists(citation)` function:
1. Parse citation into components (reporter, volume, page)
2. Search CourtListener by citation
3. Confirm the returned case matches the case_name
4. Set confidence_score based on match quality

## What STAYS in Engine (not web pipeline)

- VERI persona (discovery document PDF verification) — engine handles PDFs
- Fear score calculation — engine generates motions
- Motion-type applicability scoring — engine handles motions
- Prosecution danger case prediction (COUNT persona) — engine territory

## Priority Order

1. **Phase 1** — Negative treatment. People could cite overruled cases RIGHT NOW.
2. **Phase 2** — Schema. Foundation for all other improvements.
3. **Phase 4** — Citation existence. Confirms cases are real.
4. **Phase 3** — Binding rules. Important but existing FL handling covers the most critical jurisdiction.

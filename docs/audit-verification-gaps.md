# Verification Gap Analysis: CASE/VERI Personas vs Web Pipeline

**Date:** 2026-04-06
**Auditor:** Atlas (Atti persona)
**Source personas:** CASE v1.1, VERI v3.2, COUNT v1.2 (from ImNotAnAttorney parent)
**Web scripts audited:** `classify-case-law.mjs`, `legal-research-all.mjs`, `legal-research-fl.mjs`, `generate-case-law-enrichment.ts`

---

## Executive Summary

The parent project defines a rigorous 7-persona validation pipeline for case law and citations. The web project has implemented roughly **30%** of the CASE persona's validation logic and **0%** of the VERI and COUNT personas' logic. The most dangerous gap: **is_good_law defaults to `true` in the database and nothing in the web pipeline ever sets it to `false`**. Every case law citation is assumed good law with zero verification.

---

## CASE Persona Gap Analysis

### 1. Good Law Verification (Negative Treatment Checking)

| CASE Requirement | Web Status | Details |
|---|---|---|
| Check `is_good_law` field in DB before using citation | **MISSING** | `classify-case-law.mjs` never reads or writes `is_good_law`. The column exists on both `case_law_references` (initial schema) and `statute_case_law` (migration 030) but defaults to `true` and is never updated by any script. |
| CourtListener API search for negative treatment | **MISSING** | The classifier fetches opinion text for classification but never checks citing opinions for "overruled by", "abrogated by", or "superseded by" signals. |
| Justia fallback for negative treatment | **MISSING** | `legal-research-all.mjs` constructs Justia URLs for statute verification but never checks case law treatment on Justia. |
| Web verification when `is_good_law = NULL` | **MISSING** | No script implements the CASE persona's web verification flow (Part III, step 3). |
| Update DB with verification result | **MISSING** | No script ever writes `is_good_law = false` to any table. |

**Risk: CRITICAL.** Every citation is assumed good law. An overruled case could be cited in a delivered report. The `shepardized_at` column on `case_law_references` is never populated.

### 2. Citation Verification (Does the Case Actually Exist?)

| CASE Requirement | Web Status | Details |
|---|---|---|
| Database lookup by citation | **PARTIALLY** | `classify-case-law.mjs` queries `statute_case_law` rows by `id`, not by citation string. No deduplication or existence check by citation pattern. |
| Return NOT_IN_DB for missing citations | **MISSING** | No equivalent status system exists. The classifier only processes rows that already exist in `statute_case_law`. |
| Fetch opinion from CourtListener cluster | **IMPLEMENTED** | `classify-case-law.mjs` lines 303-318 fetch cluster sub_opinions and retrieve opinion text via CL API. |
| Validate citation format (reporter, page number) | **MISSING** | No format validation. Citations are stored as-is from CourtListener search results. |

### 3. Holding Extraction and Validation

| CASE Requirement | Web Status | Details |
|---|---|---|
| Extract holding using "we hold", "we conclude" patterns | **IMPLEMENTED** | `classify-case-law.mjs` lines 199-207 scan sentences for "we hold", "we conclude", "the court holds", "we find that" and extract `keyQuote`. |
| Extract holding excerpt (first substantive paragraph) | **IMPLEMENTED** | Lines 210-218 extract `holdingExcerpt` from first paragraph > 150 chars. |
| Compare extracted holding to database holding | **MISSING** | The CASE persona defines HIGH/MEDIUM/LOW confidence based on extracted-vs-stored holding match (Part III, Web Verification step 4). No comparison exists. |
| Holding matches motion type | **MISSING** | No motion-type awareness at all. The web pipeline has no concept of motion types (B1, C2, D2, etc.). |
| Condemnation scoring ("Police violated", "error to admit") | **PARTIALLY** | Defense signals include "error to admit", "rights were violated" etc. (lines 138-148) but there is no numeric condemnation score. It is a boolean count, not the CASE persona's weighted formula. |

### 4. Binding Authority Determination

| CASE Requirement | Web Status | Details |
|---|---|---|
| Identify binding vs persuasive authority by jurisdiction | **PARTIALLY** | `classify-case-law.mjs` lines 163-164 check for "supreme court of florida" and "district court of appeal of florida" in court name. Sets `isBinding` boolean. |
| Distinguish same-DCA (FL 2d DCA = binding) from different-DCA (persuasive) | **MISSING** | The check treats ALL FL DCA opinions as binding. It does not distinguish 2d DCA (the relevant district) from 1st, 3rd, 4th, 5th DCAs. A 4th DCA opinion is marked `is_binding = true` when it should be persuasive only. |
| Federal binding authority hierarchy (SCOTUS > Circuit > District) | **MISSING** | No federal binding authority hierarchy. Only FL courts are checked. |

### 5. Confidence Scoring

| CASE Requirement | Web Status | Details |
|---|---|---|
| VALID_STRONG / VALID_MODERATE / VALID_WEAK / VALID_REVIEW / INVALID / NOT_IN_DB levels | **MISSING** | No validation level system. The classifier produces `party_side` (DEFENSE/PROSECUTION/NEUTRAL/UNKNOWN) which is orthogonal to validity. |
| Confidence based on holding match quality (HIGH/MEDIUM/LOW) | **MISSING** | `statute_case_law.confidence_score` is set to 0.40 at insert time by `legal-research-all.mjs` and never updated by the classifier. |
| Fear Formula scoring (REVERSED x PUBLISHED x MANDATORY x CONSTITUTIONAL x INDISTINGUISHABLE) | **MISSING** | No equivalent. The classifier detects REVERSED as a defense signal but does not compute a composite fear score. |

### 6. Applicability Checks

| CASE Requirement | Web Status | Details |
|---|---|---|
| Motion type match (case law motion_type = motion motion_type) | **MISSING** | Neither `statute_case_law` nor any web table has a `motion_type` column. |
| Factual similarity / pattern matching | **MISSING** | No case-fact comparison. Citations are statute-level, not case-specific. |
| Applicability scoring | **MISSING** | No scoring system. |

### 7. is_good_law Field Population

| CASE Requirement | Web Status | Details |
|---|---|---|
| Set `is_good_law = 0` when case is overruled/abrogated/superseded | **MISSING** | Never written to `false` by any code path. |
| Set `is_good_law = 1` after web verification confirms good law | **MISSING** | Always defaults to `true` at insert. |
| Set `is_good_law = NULL` when uncertain (triggers web verification) | **MISSING** | No NULL state; default is always `true`. |
| Populate `shepardized_at` after verification | **MISSING** | Column exists on `case_law_references` but is never written to. |

---

## VERI Persona Gap Analysis

The VERI persona handles discovery citation verification (matching quotes to source PDFs). This is primarily relevant to the engine (discovery tiers: X-Ray, War Room, Situation Room) rather than the web pipeline's Case Decoder and Intelligence Brief products. However, VERI also defines the case-law delegation pattern to CASE.

| VERI Requirement | Web Status | Notes |
|---|---|---|
| Case law citation delegation to CASE | **MISSING** | No delegation pattern. `classify-case-law.mjs` runs independently, not triggered by citation encounters. |
| Citation format parsing (reporter patterns) | **MISSING** | No `State v. X, ### So.3d ###` format parsing. Citations stored as CourtListener provides them. |
| Source PDF verification | **N/A** | Not applicable to web pipeline (no discovery PDFs). Engine-only concern. |
| Quote matching / Soft Find | **N/A** | Not applicable to web pipeline. Engine-only concern. |
| Verification status tracking (VERIFIED/MISMATCH/NOT_FOUND) | **MISSING** | `case_law_references.verification_url` exists but is never populated. No status enum. |
| Auto-correction of citations | **N/A** | Engine-only concern. |

**Assessment:** Most VERI functionality is engine-domain. The web pipeline gap is in **case law citation verification** -- the web pipeline inserts citations into `statute_case_law` without any existence/accuracy verification beyond "CourtListener returned it."

---

## COUNT Persona Gap Analysis

COUNT predicts prosecution responses and maintains danger-case databases.

| COUNT Requirement | Web Status | Notes |
|---|---|---|
| `prosecution_counters` table | **MISSING** | No equivalent table in web DB schema. |
| `is_danger_case` flag on case law | **MISSING** | Neither `case_law_references` nor `statute_case_law` has this column. |
| `is_prosecution_citation` flag | **MISSING** | `party_side = 'PROSECUTION'` in `statute_case_law` is the closest equivalent, but it indicates the case outcome favors prosecution, not that prosecution will cite it. |
| `our_distinction` field (how to distinguish danger cases) | **MISSING** | No column. |
| Prosecution response prediction by motion type | **MISSING** | No motion-type system in web pipeline. |
| Kill questions / kill responses | **MISSING** | No column or data structure. |
| State argument strength rating (STRONG/MEDIUM/WEAK) | **MISSING** | No equivalent. |
| Danger case motion type mapping | **MISSING** | No motion types. |

**Assessment:** COUNT is almost entirely unimplemented. The `party_side` classification in `classify-case-law.mjs` is a prerequisite step (knowing which cases favor prosecution), but the strategic layer (which cases prosecution will actually cite, how to distinguish them, counter-arguments) is absent. This matters for Intelligence Brief and X-Ray products that need to anticipate prosecution strategy.

---

## What IS Working

Credit where due -- the web pipeline does handle:

1. **Statute verification** (`legal-research-all.mjs`, `legal-research-fl.mjs`): Constructs URLs for FL Online Sunshine, Justia, Cornell LII. HTTP-verifies FL and federal statutes. Tracks `confidence_score`, `verified_at`, `source_urls` on `jurisdiction_statutes`.

2. **Case law discovery** (`legal-research-all.mjs`, `legal-research-fl.mjs`): Searches CourtListener by statute number, stores top-5 citing cases per statute in `statute_case_law`, boosts statute confidence when case law exists.

3. **Party-side classification** (`classify-case-law.mjs`): Fetches opinion text from CourtListener, classifies DEFENSE/PROSECUTION/NEUTRAL/UNKNOWN using signal-based scoring, extracts outcome, key quote, holding excerpt, binding authority.

4. **Schema support**: DB columns exist for `is_good_law`, `is_binding`, `shepardized_at`, `verification_url`, `confidence_score`. The infrastructure is partially in place -- the logic to populate these fields is what is missing.

---

## Priority Gaps (Ranked by Risk to Delivered Reports)

### P0 -- Ship-Blocking (citations in reports may be wrong)

1. **Good law verification**: No script checks whether cited cases have been overruled. `is_good_law` defaults to `true` unconditionally. A report could cite overruled law.

2. **Citation existence verification**: Cases are stored from CourtListener search results, which may include tangentially related cases. No verification that the holding actually relates to the charge.

### P1 -- Quality Degradation (reports are weaker than they should be)

3. **DCA-level binding authority**: All FL DCA opinions marked as binding. Should distinguish 2d DCA (binding in Pinellas) from other DCAs (persuasive only).

4. **Confidence score stagnation**: `statute_case_law.confidence_score` is set to 0.40 at insert and never updated. The classifier enriches rows with `party_side`, `outcome`, `holding_excerpt`, etc. but does not update confidence.

5. **No prosecution case anticipation**: Reports cannot anticipate which cases the state will cite or provide distinctions. Intelligence Briefs and higher tiers lose strategic value.

### P2 -- Future Pipeline Requirements

6. **Motion type system**: The web pipeline has no concept of motion types. This blocks any applicability scoring or motion-specific case law routing.

7. **Fear Formula scoring**: Would make case law citations in reports dramatically more useful -- "this case will make the judge fear reversal" vs "this case exists."

8. **Prosecution counter database**: COUNT's full capability requires a new table and population pipeline.

---

## Recommended Implementation Order

1. **Add negative treatment checking to `classify-case-law.mjs`** -- After fetching opinion text, query CourtListener's citing opinions endpoint (`/api/rest/v4/clusters/{id}/citing-opinions/`) and check for negative treatment signals. Set `is_good_law = false` when found. Populate `verified_at` / `shepardized_at` timestamps.

2. **Fix binding authority granularity** -- Parse DCA district number from court name. Only mark `is_binding = true` for FL Supreme Court and 2d DCA opinions. All other DCAs get `is_binding = false` with a `persuasive_authority = true` flag.

3. **Update confidence scores post-classification** -- After the classifier enriches a row, bump `confidence_score` based on signal count, holding quality, and good-law verification status.

4. **Add `is_good_law` filter to report generation** -- In `supabase/functions/generate-report/index.ts`, add `&is_good_law=eq.true` to the `statute_case_law` query (line 2196). This is a one-line safety gate.

5. **Build prosecution case flagging** -- Add `is_danger_case`, `danger_distinction` columns to `statute_case_law`. Populate during classification: cases with `party_side = PROSECUTION` and strong affirmation signals are danger cases.

---

## Appendix: Column Mapping

| Parent DB Column | Web DB Table | Web DB Column | Populated? |
|---|---|---|---|
| `case_law.is_good_law` | `case_law_references` | `is_good_law` | DEFAULT true, never set false |
| `case_law.is_good_law` | `statute_case_law` | `is_good_law` | DEFAULT true, never set false |
| `case_law.motion_type` | -- | -- | Does not exist |
| `case_law.is_danger_case` | -- | -- | Does not exist |
| `case_law.is_prosecution_citation` | `statute_case_law` | `party_side` | Partial (classification, not citation flag) |
| `case_law.our_distinction` | -- | -- | Does not exist |
| `case_law.web_verified_status` | -- | -- | Does not exist |
| `case_law_references.shepardized_at` | `case_law_references` | `shepardized_at` | Column exists, never written |
| `case_law_references.verification_url` | `case_law_references` | `verification_url` | Column exists, never written |
| `prosecution_counters.*` | -- | -- | Entire table missing |

---

*This audit covers the web pipeline only. The ImNotAnAttorney-engine repo may implement additional validation. Cross-check with engine's worker pipeline before acting on gaps that span both repos.*

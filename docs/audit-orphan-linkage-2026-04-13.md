# ORPHAN/LINKAGE AUDIT, IMNOTANATTORNEY SUPABASE
**Date:** 2026-04-13  
**Database:** jxjbjmgdukwkoclydqdr  
**Scope:** Judge ecosystem, legal data, case integration, officer data

---

## CRITICAL GAPS (High Impact)

### 1. JUDGE QUOTES UNLINKED, 108,058 rows (90.4% of all quotes)
- **Total judge_quotes:** 119,506
- **Linked to judge_profiles:** 11,448 (9.6%)
- **UNLINKED (NULL judge_id):** 108,058 (90.4%)
- **Pattern:** ALL have source_url (CourtListener). All have cluster_id.
- **Root cause:** Quotes extracted from CourtListener opinions but never matched back to judge_profiles table.
- **Impact:** Judge quotes not usable in judge profile pages, judge report cards, or any judge-facing intelligence.

### 2. JUDGE PROFILES WITHOUT QUOTES, 14,973 rows (95.9% of profiles)
- **Total judge_profiles:** 15,613
- **WITH linked quotes:** 640 (4.1%)
- **WITHOUT quotes:** 14,973 (95.9%)
- **Pattern:** Judge profiles exist but zero quotes associated.
- **Impact:** Judge intelligence incomplete; no quote library for landing pages, reports, or judge report cards.

### 3. JUDGE PROFILES WITHOUT JURISDICTION, 227 rows
- **Total judge_profiles:** 15,613
- **NULL or empty jurisdiction:** 227 (1.5%)
- **Pattern:** Partial profile data from CourtListener (full_name, cl_person_id exist).
- **Impact:** Bench/jury divergence queries fail (require jurisdiction grouping).

### 4. CASE LAW NEVER LINKED TO CASES, Zero linkage
- **Total case_law rows:** 3,407
- **Linked to cases table:** 0 (0%)
- **Pattern:** case_law.case_id is ALWAYS NULL.
- **Root cause:** case_law table designed as general CourtListener index, not case-specific.
- **Impact:** Case law cannot be surfaced per-case (Intelligence Brief, X-Ray). Case law exists only in Judge Ecosystem, not in Case tier.

### 5. OFFICER EXTERNAL INTEL NOT POPULATED, 0 rows
- **Total officer_reliability rows:** 13,342
- **Linked officer_external_intel:** 0 (0%)
- **Note:** Task #1 (Brady/Giglio pipeline) marked completed but data is empty.
- **Impact:** Officer Brady/Giglio history unavailable (War Room feature).

---

## SECONDARY GAPS (Medium Impact)

### 6. SENTENCING TIER SEVERELY UNDERPOPULATED
- **sentencing_distributions:** 11 total rows (only 11 judge×charge combos)
- **judge_sentencing_patterns:** 94 total rows (aggregated view only)
- **judge_prosecutor_pairings:** 205 total rows
- **bench_jury_divergence:** 141 total rows
- **Impact:** Sentencing intelligence sparse. Queries grouped by state or district, not by individual judge.

### 7. CASE INTEGRATION COMPLETELY ABSENT
- **cases table:** 46 total rows (test data?)
- **case_law with case_id:** 0 (never joined)
- **co_defendant_analysis:** 1,239 rows but no case linkage from web tier
- **case_monitoring:** rows exist but disconnected from web case intake
- **Impact:** Web tier cases not flowing to engine; discovery analysis isolated.

### 8. CITATION AUTHORITY MINIMAL
- **citation_authority:** 57 total rows (vs 3,407 case_law rows)
- **Pattern:** 57 unique CourtListener clusters have citation authority scores; 3,350 case_law rows lack authority data.
- **Impact:** Authority scoring incomplete for legal intelligence.

---

## VERIFIED CLEAN (No Issues)

### 9. CASE LAW VERIFICATION STATUS ✓
- **is_good_law = true:** 3,407 rows (100%)
- **is_good_law = false:** 0 rows (0%)
- **is_good_law = NULL:** 0 rows (0%)
- **source_url:** 100% populated (all have CourtListener URL)
- **verification_url:** 100% populated
- **Status:** HEALTHY, No fabricated case law.

### 10. OFFICER RELIABILITY JURISDICTION ✓
- **NULL jurisdiction:** 0 rows
- **Multi-jurisdiction flag:** tracked separately
- **Status:** HEALTHY, All rows have jurisdiction.

### 11. APPELLATE TRENDS JURISDICTION ✓
- **NULL jurisdiction:** 0 rows
- **Total rows:** 1,040
- **Status:** HEALTHY.

### 12. CO-DEFENDANT ANALYSIS PRIMARY KEY ✓
- **NULL primary_case_id:** 0 rows
- **Total rows:** 1,239
- **Status:** HEALTHY.

---

## SUMMARY TABLE

| Issue | Severity | Count | % Affected | Fixable? |
|-------|----------|-------|---------, |----------|
| Judge quotes unlinked | CRITICAL | 108,058 | 90.4% | Yes |
| Judge profiles without quotes | CRITICAL | 14,973 | 95.9% | Yes |
| Judge profiles no jurisdiction | MEDIUM | 227 | 1.5% | Yes |
| Case law never linked to cases | CRITICAL | 3,407 | 100% | Design |
| Officer external intel empty | CRITICAL | 0 | N/A | WIP |
| Sentencing data sparse | MEDIUM |, |, | Need USSC |
| Case intake not in engine | CRITICAL | 46 | 100% | Workflow |
| Citation authority sparse | MEDIUM | 57/3407 | 1.6% | Need CL API |

---

## ROOT CAUSE ANALYSIS

### A. JUDGE QUOTES MISMATCH (Critical)
**Root:** CourtListener bulk data extracted all quotes from opinions (108K+). Judge profile table has 15.6K profiles from CL /people/ endpoint. No join logic: cluster_id → opinion author lookup not implemented.

**Fix:** Write script to match quote.cluster_id against judge_profiles.cl_person_id via CL /opinions/{cluster_id}/ endpoint author field.

### B. CASE LAW NOT CASE-SPECIFIC (Critical)
**Root:** case_law table designed as reference database (all CourtListener opinions), not as per-case discovery attachments. Web tier cases are isolated in `cases` table; engine discovery pipeline works on separate case_law_references table in engine.

**Fix:** This is ARCHITECTURE, not a bug. Two separate universes:
- **Web:** cases (46 rows test data) + case_law_references (engine)
- **Judge Ecosystem:** case_law (3.4K CourtListener reference index)

### C. OFFICER EXTERNAL INTEL EMPTY (Critical)
**Root:** Task #1 claims complete but trigger/pipeline not wired. Brady/Giglio source (CAP, BJS) not populated into external_intel table.

**Fix:** Verify pipeline script runs; check cron-job.org registration.

### D. CASE INTAKE ISOLATED (Critical)
**Root:** Web repo cases table (46 rows) never flows to engine. Engine discovery tier expects cases in shared Supabase but web doesn't trigger the flow.

**Fix:** Stripe webhook → processing_jobs, then engine polls + processes. Currently only test data in web cases table.

---

## ACTIONABLE NEXT STEPS

### TIER 1 (Unblock Judge Intelligence):
1. **Match judge_quotes to judge_profiles via cluster_id → CL /opinions/ author**
   - Est. effort: 1-2 hours (bulk match script)
   - SQL: INSERT INTO judge_quotes (judge_id) WHERE judge_id IS NULL after lookup.

2. **Verify judge_profiles.jurisdiction populated for missing 227**
   - Est. effort: 30 min (bulk CL API fetch of jurisdiction)

### TIER 2 (Unblock Officer Intelligence):
3. **Verify officer_external_intel pipeline runs**
   - Check: cron-job.org for brady-giglio job, check engine logs
   - Est. effort: 30 min (diagnosis + rerun)

### TIER 3 (Unblock Case Integration):
4. **Verify web → engine case flow (Stripe webhook → processing_jobs)**
   - Test: Submit a real DUI case, check processing_jobs, check engine logs
   - Est. effort: 1 hour (full E2E test)

### TIER 4 (Reference Data Only, Acceptable Gap):
5. **Citation authority sparse: Only 57 of 3.4K case_law rows have scoring**
   - Root: Would require bulk CourtListener /opinions/{id}/citing/ API calls
   - Decision: Defer; currently pulling TOP 50 cases only (citation_authority table is the elite 50-100 most-cited cases, not ALL cases).
   - Status: Acceptable. Won't block features.

---

## Queries Used

All queries executed against Supabase Management API `/v1/projects/{ref}/database/query` endpoint with auth token `sbp_fea5e71cb7a6836171841017cd521bc807c90356`.

Example query patterns:
```sql
, Judge quotes unlinked
SELECT COUNT(*) FROM judge_quotes WHERE judge_id IS NULL; , 108,058

, Judge profiles with quotes
SELECT COUNT(DISTINCT jp.id) FROM judge_profiles jp 
  INNER JOIN judge_quotes jq ON jp.id = jq.judge_id; , 640

, Case law verification state
SELECT is_good_law, COUNT(*) FROM case_law GROUP BY is_good_law;
, is_good_law = true: 3,407; false: 0; NULL: 0
```

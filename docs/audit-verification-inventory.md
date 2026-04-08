# Verification & Validation Mechanism Inventory

**Audit date:** 2026-04-06
**Scope:** Cross-reference parent project (`ImNotAnAttorney/`) and engine (`ImNotAnAttorney-engine/`) verification mechanisms against `ImNotAnAttorney-web/`.
**Purpose:** Identify every anti-hallucination, citation-verification, and good-law-checking tactic the parent project documents — and flag which ones the web repo currently implements vs. lacks.

---

## 1. Source Files Audited (Parent Project)

| File | Purpose |
|------|---------|
| `C:\Users\email\projects\ImNotAnAttorney\system\Attorney-Personas\CASE-LAW-VALIDATION-PERSONA.md` | CASE persona — validity + applicability framework |
| `C:\Users\email\projects\ImNotAnAttorney\system\Attorney-Personas\VERI-CITATION-VERIFICATION-PERSONA.md` | VERI persona — discovery citation verbatim verification |
| `C:\Users\email\projects\ImNotAnAttorney\system\Case-Law\GEMINI-CASE-LAW-RESEARCH-TEMPLATE.md` | Research prompt template (no-fabrication contract) |
| `C:\Users\email\projects\ImNotAnAttorney\system\Case-Law\GEMINI-CASE-VERIFICATION-TEMPLATE.md` | Single-citation verification prompt template |
| `C:\Users\email\projects\ImNotAnAttorney\docs\API-TOKEN-SIGNUP-GUIDE.md` | API token inventory for verification cascade |

## 2. Reference Implementations Inspected (Engine)

| File | Purpose |
|------|---------|
| `C:\Users\email\projects\ImNotAnAttorney-engine\src\integrations\legal-verifier.mjs` | 1597-line multi-source verification cascade |
| `C:\Users\email\projects\ImNotAnAttorney-engine\src\workers\citation-verify.mjs` | 379-line worker that drives the cascade end-to-end |

## 3. Web Repo State Inspected

| File | Purpose |
|------|---------|
| `C:\Users\email\projects\ImNotAnAttorney-web\.claude\rules\no-hallucinated-legal-data.md` | Emergency rule (policy only, not enforcement) |
| `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\intelligence-brief\prompts.ts` | Prompt-side anti-hallucination blocks |
| `C:\Users\email\projects\ImNotAnAttorney-web\supabase\functions\generate-report\index.ts` | `ANTI_HALLUCINATION_BLOCK` injected into every Claude call |
| `C:\Users\email\projects\ImNotAnAttorney-web\scripts\classify-case-law.mjs` | Defense/prosecution classifier from CourtListener opinions |
| `C:\Users\email\projects\ImNotAnAttorney-web\scripts\generate-case-law-enrichment.ts` | Enrichment script — refuses to invent case law, requires verified pipeline |
| `C:\Users\email\projects\ImNotAnAttorney-web\supabase\migrations\00001_initial_schema.sql` | `case_law_references` table (no `verified_case_law` central library) |
| `C:\Users\email\projects\ImNotAnAttorney-web\supabase\migrations\20250101000030_research-columns-and-case-law.sql` | `statute_case_law` table — has `is_good_law` boolean but no shepardize tracking |

---

# CASE Persona — Case Law Validity & Applicability

Source: `ImNotAnAttorney/system/Attorney-Personas/CASE-LAW-VALIDATION-PERSONA.md`

## C1. Six-Tier Validation Levels

| Mechanism | What it checks | How | File:Line | Web repo status |
|-----------|----------------|-----|-----------|-----------------|
| `VALID_STRONG` | Good law + holding directly supports argument | Database query + holding text match | CASE-LAW-VALIDATION-PERSONA.md:67 | MISSING — no validation tier classification in web repo |
| `VALID_MODERATE` | Good law + motion type matches, verify holding | Motion-type cross-reference | CASE-LAW-VALIDATION-PERSONA.md:68 | MISSING |
| `VALID_WEAK` | Good law but holding may not apply | Motion-type mismatch flagged | CASE-LAW-VALIDATION-PERSONA.md:69 | MISSING |
| `VALID_REVIEW` | Good law but holding may favor state | Heuristic on holding text | CASE-LAW-VALIDATION-PERSONA.md:70 | MISSING |
| `INVALID` | Case overruled / superseded | DB column `is_good_law=0` | CASE-LAW-VALIDATION-PERSONA.md:71 | PARTIAL — `case_law_references.is_good_law` exists but defaults to `true` and is never set programmatically (`00001_initial_schema.sql:117`) |
| `NOT_IN_DB` | Citation not in `case_law` table | DB lookup miss | CASE-LAW-VALIDATION-PERSONA.md:72 | MISSING |

## C2. Validity Checks

| Check | What it verifies | Source / How | File:Line | Web repo status |
|-------|------------------|--------------|-----------|-----------------|
| Good Law | Not overruled, abrogated, superseded | CourtListener, Justia | CASE-LAW-VALIDATION-PERSONA.md:76 | MISSING — no negative-treatment check runs in web; `is_good_law` is set only by classifier with no shepardization |
| URL Status | Citation URL works | Web fetch | CASE-LAW-VALIDATION-PERSONA.md:77 | MISSING — `verification_url` column exists but never tested for liveness |
| Age | Case not superseded by newer authority | Citing-opinions analysis | CASE-LAW-VALIDATION-PERSONA.md:78 | MISSING — no `age_status` column or computation (`getAgeStatus` exists in engine, not web) |
| Jurisdiction | Binding (FL 2d DCA) vs Persuasive | Citation parse | CASE-LAW-VALIDATION-PERSONA.md:79 | PARTIAL — `case_law_references.is_binding` boolean, but no jurisdiction-aware parser |

## C3. Applicability Checks

| Check | What it verifies | How | File:Line | Web repo status |
|-------|------------------|-----|-----------|-----------------|
| Motion Type Match | `case_law.motion_type == motion.motion_type` | DB query | CASE-LAW-VALIDATION-PERSONA.md:84 | MISSING — no `motion_type` column on `case_law_references` |
| Holding Match | Holding text supports argument | Text analysis (similarity) | CASE-LAW-VALIDATION-PERSONA.md:85 | MISSING — no holding similarity logic in web (engine has `holdingSimilarity` at `legal-verifier.mjs:1303`) |
| Factual Similarity | Facts are analogous | Pattern matching | CASE-LAW-VALIDATION-PERSONA.md:86 | MISSING |
| Condemnation Score | "Police violated", "error to admit" | Keyword scoring | CASE-LAW-VALIDATION-PERSONA.md:87 | PARTIAL — `classify-case-law.mjs:138-160` has DEFENSE_SIGNALS / PROSECUTION_SIGNALS arrays; no condemnation scoring per se |

## C4. Web Verification Flow (v2.0+)

Documented at CASE-LAW-VALIDATION-PERSONA.md:114-131.

| Step | What it does | Web repo status |
|------|--------------|-----------------|
| 1. CourtListener API search → cluster_id, opinion text | Primary lookup | PARTIAL — `classify-case-law.mjs` fetches opinions by cluster_id, but does not perform initial citation lookup |
| 2. Justia fallback if CourtListener miss | Secondary source | MISSING — web has no Justia fetcher |
| 3. Check for `overruled by`, `abrogated by`, `superseded by` | Negative-treatment scan | MISSING — engine has `NEGATIVE_KEYWORDS` at `legal-verifier.mjs:1166`, web has none |
| 4. Extract holding via signal patterns (`we hold`, `we conclude`, `the court holds`) | Holding extraction | PARTIAL — `classify-case-law.mjs:200` matches the same signals to extract `key_quote`, but does not store as separate `holding` field |
| 5. Compare to DB holding (HIGH/MEDIUM/LOW confidence) | Holding similarity confidence | MISSING — no comparison or confidence tier |
| 6. Update DB with `web_verified_status`, `case_law_applicability` | Persist verification | MISSING — no such columns on `case_law_references` |

## C5. Fear Formula (Quality Gate)

CASE-LAW-VALIDATION-PERSONA.md:262-271

```
FEAR SCORE = REVERSED × PUBLISHED × MANDATORY × CONSTITUTIONAL × INDISTINGUISHABLE
```

| Component | What it checks | Web repo status |
|-----------|----------------|-----------------|
| REVERSED | Trial court got it wrong | PARTIAL — classifier scores DEFENSE/PROSECUTION but not REVERSED-as-quality-multiplier |
| PUBLISHED | Substantive holding (not per curiam affirm) | MISSING |
| MANDATORY | "Must", "requires", "shall", "error to admit" keyword presence | MISSING |
| CONSTITUTIONAL | 4th Amendment, Brady, Due Process tag | MISSING |
| INDISTINGUISHABLE | Facts match closely | MISSING |

## C6. CASE Pass Criteria

CASE-LAW-VALIDATION-PERSONA.md:275-282

1. Citation format valid (reporter, page number) — MISSING in web
2. `is_good_law = 1` (verified, not overruled) — PARTIAL (default-true, never verified)
3. `motion_type` populated (route to motions) — MISSING
4. `holding` populated (compare to arguments) — PARTIAL (`case_law_references.holding` column exists)
5. If binding, `outcome = REVERSED` preferred — PARTIAL (classifier extracts outcome but no preference enforcement)

---

# VERI Persona — Discovery Citation Verbatim Verification

Source: `ImNotAnAttorney/system/Attorney-Personas/VERI-CITATION-VERIFICATION-PERSONA.md`

VERI is for **discovery document** citation verification ("Page 3 of police report SO22-401531-37"), not case-law citations. It is not directly applicable to web's report generation flow today, but is relevant when the web repo eventually surfaces discovery citations.

## V1. Citation Component Checks

VERI-CITATION-VERIFICATION-PERSONA.md:66-77

| Component | What it verifies | Fail condition | Web repo status |
|-----------|------------------|----------------|-----------------|
| Document ID | Report number matches actual document | `SO22-401531-37 ≠ SO22-401531-38` | NOT APPLICABLE — web has no discovery PDFs (engine handles X-Ray+) |
| Request Number | Lab request batch correct | `Request 0004 ≠ Request 0010` | NOT APPLICABLE |
| Page Number | Content actually on cited page | "Page 3" but content on Page 5 | NOT APPLICABLE |
| Report Date | Date in motion matches document | "Jan 15" vs "Jan 16" | NOT APPLICABLE |
| Quote | Text appears VERBATIM | One word different = NOT verbatim | NOT APPLICABLE |
| Context | Quote not taken out of context | "admitted" inside "never admitted" | NOT APPLICABLE |

## V2. Verification Statuses

VERI-CITATION-VERIFICATION-PERSONA.md:236-247

| Status | Meaning | Auto-fix? | Web equivalent |
|--------|---------|-----------|----------------|
| `VERIFIED` | Matches source exactly | n/a | NONE |
| `MISMATCH` | Wrong page, content elsewhere | Yes | NONE |
| `QUOTE_MISMATCH` | Quote close but not verbatim (Soft Find) | Yes | NONE |
| `NOT FOUND` | Quoted text doesn't appear anywhere | No | NONE |
| `DOCUMENT MISSING` | Source not in system | No | NONE |
| `PAGE OUT OF RANGE` | Cited page doesn't exist | No | NONE |
| `NEEDS REVIEW` | Ambiguous match | No | NONE |

## V3. Soft Find (v3.1)

VERI-CITATION-VERIFICATION-PERSONA.md:165-230

Fuzzy-matching algorithm (75-95% similarity threshold) to find close-but-not-exact quotes in source PDFs and replace inaccurate quotes with verbatim text.

| Mechanism | How | File:Line | Web repo status |
|-----------|-----|-----------|-----------------|
| Sliding window search | Across normalized source text | VERI-CITATION-VERIFICATION-PERSONA.md:206 | NOT APPLICABLE (no PDFs in web) |
| `SequenceMatcher` (Python `difflib`) | 75% fuzzy / 95% near-exact thresholds | VERI-CITATION-VERIFICATION-PERSONA.md:208 | NOT APPLICABLE |
| Position mapping (normalized → original) | Preserves whitespace, casing | VERI-CITATION-VERIFICATION-PERSONA.md:209 | NOT APPLICABLE |
| Verbatim extraction | Pulls exact characters | VERI-CITATION-VERIFICATION-PERSONA.md:210 | NOT APPLICABLE |

## V4. Out-of-Context Detection

VERI-CITATION-VERIFICATION-PERSONA.md:557-568

Flag quotes near negation words (`not`, `never`, `did not`) for manual review.

**Web repo status:** MISSING. The Case Decoder anti-hallucination prompt instructs Claude not to fabricate, but no programmatic context check runs after generation. Engine doesn't ship this either (it's documented as "Phase 6: Future Enhancement" at VERI-CITATION-VERIFICATION-PERSONA.md:725-730).

## V5. Citation Parsing Patterns

VERI-CITATION-VERIFICATION-PERSONA.md:633-648

Five regex patterns for police reports, lab reports, generic documents, transcripts. **Web repo status:** NOT APPLICABLE. Engine has separate citation extractors at `legal-verifier.mjs:49-85` for case law / statute / CFR — those ARE applicable and are MISSING from web.

---

# GEMINI Research Template — No-Fabrication Contract

Source: `ImNotAnAttorney/system/Case-Law/GEMINI-CASE-LAW-RESEARCH-TEMPLATE.md`

## G1. No-Fabrication Rules

GEMINI-CASE-LAW-RESEARCH-TEMPLATE.md:24-34

| Rule | What it bans | Web repo status |
|------|--------------|-----------------|
| Don't invent case names or citations | Hallucinated case law | ENFORCED IN PROMPT — `prompts.ts:65` `ANTI_HALLUCINATION_PERCENTAGES` and `generate-report/index.ts:281-292` `ANTI_HALLUCINATION_BLOCK` rule #1 instruct Claude not to fabricate. Not enforced post-generation. |
| Don't invent decision dates / docket numbers | Hallucinated metadata | ENFORCED IN PROMPT — same blocks, no post-check |
| Don't invent URLs | Phantom verification links | NOT ENFORCED — web has no URL validation step |
| Don't guess at page citations or quotes | Verbatim quote claims | NOT ENFORCED |
| Return `[NOT FOUND]` instead of fabricating | Fail-loud on uncertainty | PARTIAL — web prompts use `[VERIFY]` marker (rule #6 at `generate-report/index.ts:290`); Gemini template uses `[NOT FOUND]` |

## G2. Required Verification Fields (per case)

GEMINI-CASE-LAW-RESEARCH-TEMPLATE.md:39-52 — 11 mandatory fields:

| # | Field | Web `case_law_references` column | Status |
|---|-------|----------------------------------|--------|
| 1 | Full case name (Plaintiff v. Defendant) | `case_name` | PRESENT |
| 2 | Full citation `[Vol] So.2d/So.3d [Page] (Fla. 2d DCA [Year])` | `citation` | PRESENT |
| 3 | Decision date (Month Day, Year) | NONE | MISSING |
| 4 | Docket number | NONE | MISSING |
| 5 | Outcome (REVERSED / AFFIRMED / QUASHED / REMANDED) | NONE on `case_law_references`; `statute_case_law` has no outcome column either | MISSING |
| 6 | RAW URL #1 (free public source) | `verification_url` (single) | PARTIAL — only one URL slot |
| 7 | RAW URL #2 (different source) | NONE | MISSING (engine has `verification_urls TEXT[]`) |
| 8 | Verbatim holding quote (1-3 sentences) | `key_quote` | PRESENT |
| 9 | Page citation for the quote | NONE | MISSING |
| 10 | Application to motion argument | `application` | PRESENT |
| 11 | Good law status | `is_good_law` (boolean) | PARTIAL — boolean, no enum: GOOD / QUESTIONED / BAD |

## G3. Three-Tier Good Law Status

GEMINI-CASE-LAW-RESEARCH-TEMPLATE.md:60-65

- `GOOD LAW` — not overruled, still valid binding precedent
- `QUESTIONED` — distinguished or criticized but not overruled
- `BAD LAW` — overruled, superseded, receded from (DO NOT CITE)

**Web repo status:** MISSING. Web's `is_good_law` is binary; can't represent QUESTIONED tier.

## G4. Free-Source Priority Order

GEMINI-CASE-LAW-RESEARCH-TEMPLATE.md:96-116

| Priority | Source | Engine implementation | Web repo status |
|----------|--------|----------------------|-----------------|
| P1 | Google Scholar | `fetchGoogleScholar` (`legal-verifier.mjs:263`) | MISSING |
| P1 | Justia | `fetchJustia` (`legal-verifier.mjs:222`) | MISSING |
| P1 | CourtListener | `fetchCourtListener` (`legal-verifier.mjs:95`) | PARTIAL — `classify-case-law.mjs` uses CourtListener Opinions API only, not Citation Lookup API |
| P1 | Official Court PDF (`2dca.flcourts.gov`) | NONE | MISSING |
| P2 | Leagle | NONE | MISSING |
| P2 | FindLaw | NONE | MISSING |
| P2 | vLex | NONE | MISSING |
| AVOID | Casetext / Westlaw / LexisNexis | n/a | n/a |

**Two-URL minimum:** GEMINI-CASE-LAW-RESEARCH-TEMPLATE.md:54: "TWO RAW URLs ARE MANDATORY. If you cannot provide two working URLs, do NOT cite the case." MISSING in web.

## G5. Final Submission Checklist

GEMINI-CASE-LAW-RESEARCH-TEMPLATE.md:202-220 — 15 boxes per case:

1. Case Name (Plaintiff v. Defendant)
2. Citation format `[Vol] So.X [Page] (Court [Year])`
3. Decision Date (Month Day, Year)
4. Docket Number
5. Outcome
6. Court Verified (actually 2d DCA, not another)
7. GOOD LAW
8. URL #1 (loads case)
9. URL #2 (different source)
10. Key Quote VERBATIM with page citation
11. Page citation `(153 So.3d at 396)`
12. Year matches actual decision date
13. Holding not opposite of argument
14. No fabrication (TWO URLs proving existence)
15. Prefer REVERSED

**Web repo status:** No equivalent automated checklist runs against the database after case-law import. The classifier (`classify-case-law.mjs`) populates 4-5 of these (party_side, outcome string, key_quote, holding_excerpt, is_binding) but does not enforce the gates.

---

# GEMINI Verification Template — Single-Citation Verification

Source: `ImNotAnAttorney/system/Case-Law/GEMINI-CASE-VERIFICATION-TEMPLATE.md`

## V-G1. The 9 Verification Questions

GEMINI-CASE-VERIFICATION-TEMPLATE.md:46-57 — for any cited case, verify:

1. Case EXISTS — MISSING in web (no existence check after Claude generates)
2. CITATION is correct (Vol/Reporter/Page/Court/Year) — MISSING (no parser/normalizer)
3. DOCKET NUMBER — MISSING (no column)
4. DECISION DATE — MISSING (no column)
5. OUTCOME (Reversed/Affirmed/etc.) — PARTIAL (classifier extracts as `outcome` text)
6. HOLDING matches our use — MISSING (no similarity check)
7. Exact VERBATIM QUOTE with page number — PARTIAL (`key_quote` exists, no page number column)
8. OVERRULED status — MISSING
9. MINIMUM 2-3 RAW DIRECT URLs — MISSING (single `verification_url` column)

## V-G2. Raw URL vs. Wrapped URL

GEMINI-CASE-VERIFICATION-TEMPLATE.md:60-83

| Pattern | Status | Example |
|---------|--------|---------|
| RAW (good) | `https://law.justia.com/cases/florida/...` | accept |
| Google search wrapper (bad) | `google.com/search?q=...` | reject |
| Google URL redirect (bad) | `google.com/url?sa=t&url=...` | reject |
| "Search for X on Y" (bad) | text placeholder | reject |

**Web repo status:** MISSING. No URL pattern validation. The engine doesn't enforce this either — it relies on the source-fetcher functions returning real URLs by construction.

## V-G3. Output Status Categories

GEMINI-CASE-VERIFICATION-TEMPLATE.md:106 — `Status` field enum:
- `VERIFIED`
- `NOT FOUND`
- `CITATION ERROR`
- `OVERRULED`

**Web repo status:** MISSING. `case_law_references` has no `verification_status` enum column.

## V-G4. Common Issues Watchlist

GEMINI-CASE-VERIFICATION-TEMPLATE.md:266-275

| Issue | Action | Web repo status |
|-------|--------|-----------------|
| Opposite Holding (case REVERSED for State, not defendant) | DO NOT CITE | PARTIAL — classifier flags `PROSECUTION` party_side; nothing prevents using prosecution-favorable case in a defense report |
| Wrong DCA (4th DCA cited as 2d DCA) | Correct citation | MISSING |
| Citation Error (wrong volume/page) | Get correct citation | MISSING |
| Overruled (later case overturned) | DO NOT CITE | MISSING |
| Only Google Scholar URL | Request additional sources | MISSING |
| Paraphrased Quote (not verbatim) | Request exact quote | MISSING |
| Missing Page Citation | Request page citation | MISSING |

---

# API Token Inventory

Source: `ImNotAnAttorney/docs/API-TOKEN-SIGNUP-GUIDE.md`

## API-1. Configured Tokens (engine `.env`)

| Token | Status | Purpose | Web repo status |
|-------|--------|---------|-----------------|
| `COURTLISTENER_API_TOKEN` | DONE (Mar 13) | Citation Lookup API, opinions, judges, dockets, citing-opinions, financial disclosures | PRESENT in web `.env.local` as `COURTLISTENER_TOKEN` (used by `classify-case-law.mjs:44`) |
| `JUDYRECORDS_API_KEY` | Pending email reply | 760M+ case metadata fallback | MISSING in web |
| `HARVARD_CAP_TOKEN` | DEPRECATED | API v1 returns HTML; engine degrades gracefully | n/a |
| `GOVINFO_KEY` | Optional | US Code, CFR, congressional reports | MISSING in web |
| `OPENLAWS_TOKEN` | Optional | All-50-states statute verification | MISSING in web |
| `DESCRYBE_TOKEN` | Optional ($10/mo) | Negative treatment / good-law detection (Cytator) | MISSING in web |
| `PACER_CREDENTIALS` | Optional | Federal court records | MISSING in web |

## API-2. Migration 010 — `verified_case_law` Central Library

API-TOKEN-SIGNUP-GUIDE.md:15-17 documents that the engine has Migration 010 with:
- `verified_case_law` table (30 columns, indexes, RLS, trigger)
- `case_law_references.verified_law_id` FK
- `motion_recommendations` verification columns (`basis_verified`, `basis_verification_url`, `basis_verification_source`)

**Web repo status:** MISSING all of the above.
- No `verified_case_law` table in `ImNotAnAttorney-web/supabase/migrations/`
- No `verified_law_id` foreign key on `case_law_references`
- No `motion_recommendations` table at all

## API-3. Verification Result Tiers (from API-TOKEN-SIGNUP-GUIDE.md:23-37)

| Tier | Meaning | Engine code | Web repo status |
|------|---------|-------------|-----------------|
| `VERIFIED_STRONG` | 3+ independent sources confirm | `legal-verifier.mjs:1416` | MISSING |
| `VERIFIED_MODERATE` | 2 independent sources confirm | `legal-verifier.mjs:1419` | MISSING |
| `VERIFIED_WEAK` | 1 source only | `legal-verifier.mjs:1422` | MISSING |
| `FABRICATED` | Sources checked, none confirmed | `legal-verifier.mjs:1425` | MISSING |
| `UNVERIFIED` | No sources checked (no tokens) | `legal-verifier.mjs:1428` | MISSING |

## API-4. Known Verification Issues

| Issue | Notes | Web repo impact |
|-------|-------|-----------------|
| Harvard CAP API deprecated | Returns HTML instead of JSON; engine degrades gracefully | n/a |
| `is_good_law` returns null for landmark cases | Citing-opinions endpoint returns thousands of results; can't determine treatment definitively. Engine waiting on Descrybe.ai token. | MISSING — web has no shepardize logic at all, so the bug doesn't manifest, but neither does the protection |
| GovInfo not wired | `govInfoKey` in config, no `fetchGovInfo` function exists | n/a |

---

# Engine Implementation (Reference Architecture)

These are the IMPLEMENTED mechanisms in `ImNotAnAttorney-engine/`. Listed here so the inventory shows what working code looks like and what the web repo needs to import or replicate.

## E1. Multi-Source Verification Cascade

`legal-verifier.mjs:1369-1495` `verifyCaseLaw()` runs ALL configured sources (does not stop at first hit) and counts independent confirmations:

| Source fetcher | Function | Line | Web has? |
|----------------|----------|------|----------|
| CourtListener Citation Lookup API | `fetchCourtListener` | `legal-verifier.mjs:95` | NO |
| Harvard CAP | `fetchHarvardCap` (disabled) | `legal-verifier.mjs:150` | NO |
| JudyRecords | `fetchJudyRecords` | `legal-verifier.mjs:186` | NO |
| Justia (HTML scrape) | `fetchJustia` | `legal-verifier.mjs:222` | NO |
| Google Scholar (HTML scrape, CAPTCHA-aware) | `fetchGoogleScholar` | `legal-verifier.mjs:263` | NO |
| OpenLaws (statutes) | `fetchOpenLaws` | `legal-verifier.mjs:908` | NO |
| Cornell LII (USC) | `fetchCornellLII` | `legal-verifier.mjs:945` | NO |
| eCFR (regulations) | `fetchECFR` | `legal-verifier.mjs:1044` | NO |
| eCFR Point-in-Time | `fetchECFRPointInTime` | `legal-verifier.mjs:1105` | NO |
| Wex (legal terms) | `fetchWexDefinition` | `legal-verifier.mjs:998` | NO |

## E2. Negative Treatment Detection

`legal-verifier.mjs:1166-1223` two-source check (Descrybe.ai primary, CourtListener citing opinions fallback):

```js
const NEGATIVE_KEYWORDS = [
  'overruled', 'overrule', 'abrogated', 'abrogate',
  'superseded', 'supersede', 'no longer good law',
  'limited by', 'disapproved', 'criticized',
];
```

`fetchDetailedTreatment` (`legal-verifier.mjs:724-805`) paginates up to 5 pages × 20 = 100 citing opinions, scores positive / negative / distinguishing, returns `is_good_law: negative === 0`.

**Web repo status:** MISSING. Web has no negative-treatment scan at all.

## E3. Holding Extraction

`legal-verifier.mjs:1274-1300` — 11 holding signal patterns:

```js
const HOLDING_SIGNALS = [
  'we hold that', 'we hold', 'this court holds',
  'it was error to', 'the court erred',
  'the constitution requires', 'we conclude that',
  'we reverse', 'we affirm', 'judgment reversed',
  'the rule is', 'we therefore hold',
];
```

**Web repo status:** PARTIAL. `classify-case-law.mjs:200-207` matches 4 of these signals (`we hold`, `we conclude`, `the court holds`, `we find that`) for `key_quote` extraction only.

## E4. Holding Similarity (Validation)

`legal-verifier.mjs:1303-1330` — bag-of-words overlap between fetched holding and argument context, classified into `STRONG` (≥0.7) / `MODERATE` (≥0.4) / `WEAK` / `REVIEW` (if pro-prosecution).

**Web repo status:** MISSING.

## E5. Citation Authority Scoring

`legal-verifier.mjs:676-716` `fetchCitationAuthority()` — fetches cluster metadata, returns `citation_count`, `is_landmark` (>100 cites), `precedential_status`.

**Web repo status:** MISSING.

## E6. Age Status Classification

`legal-verifier.mjs:1333-1344`:
- `very_recent` (≤6 months)
- `current` (<10 years)
- `aging` (<20 years)
- `stale` (≥20 years)

**Web repo status:** MISSING.

## E7. End-to-End Citation Verification Worker (`citation-verify.mjs`)

Three-phase worker (`citation-verify.mjs`):

| Phase | Action | Lines |
|-------|--------|-------|
| **A** | Verify structured `case_law_references` rows. Reuses central library hits via `verified_case_law` lookup. Re-shepardizes if `shepardized_at` >30 days old. | 39-217 |
| **B** | Extract inline citations from `trial_materials` + `witness_dossiers` content using `extractCitations()`, verify each, insert new rows into `case_law_references`. | 219-308 |
| **C** | Verify `motion_recommendations.basis` field — extracts case law + statutes, verifies, sets `basis_verified` boolean and `basis_verification_url/source`. | 310-370 |

**Operator task auto-creation** when issues found:
- `citation_fabricated` (HIGH priority) — citation not in any database
- `citation_weak` (MEDIUM) — only one source confirmed
- `citation_overruled` (HIGH) — negative treatment detected
- `basis_fabricated` (HIGH) — fabricated citation in motion basis

**Web repo status:** MISSING. None of `verified_case_law`, `motion_recommendations`, `operator_tasks`, `trial_materials`, or `witness_dossiers` exist as tables in the web migrations. Web doesn't run a verification worker at all — verification is purely prompt-side.

---

# Web Repo Anti-Hallucination Mechanisms (Currently Implemented)

## W1. Prompt-Side Anti-Hallucination Block

`supabase/functions/generate-report/index.ts:281-292` injects `ANTI_HALLUCINATION_BLOCK` into EVERY Claude call (CD + IB).

```
1. CASE LAW: Only cite cases you are CERTAIN exist. Include full citation. NEVER fabricate.
2. STATUTES: Only cite statute numbers CERTAIN for the jurisdiction. If unsure, add [VERIFY].
3. EXPERTS/ATTORNEYS: Only attribute methods/quotes to real, verifiable people.
4. STATISTICS: NEVER fabricate conviction rates, suppression rates, plea percentages.
5. COURT PROCEDURES: Only describe procedures certain to apply in the jurisdiction.
6. CONFIDENCE MARKING: For any factual claim below 90% confidence, prefix with [VERIFY].

All citations are automatically verified against CourtListener's legal database.
Fabricated citations will be caught and flagged.
```

**Status:** PRESENT, but the closing claim ("automatically verified against CourtListener's legal database") is **FALSE for the web repo's runtime path**. No post-generation verification runs on Case Decoder or Intelligence Brief output. The verification happens only during the offline `classify-case-law.mjs` build step that populates `statute_case_law` — and only for the pre-researched library, NOT for citations Claude introduces in a generated report.

## W2. Domain-Specific Anti-Hallucination Sub-Rules

`src/lib/intelligence-brief/prompts.ts` and `generate-report/index.ts` contain section-specific anti-hallucination rules:

| Block | Location | What it blocks |
|-------|----------|----------------|
| `ANTI_HALLUCINATION_PERCENTAGES` | `prompts.ts:65-71` | Specific conviction/suppression percentages → forces qualitative framing |
| Anti-Hallucination — Plea Framework | `prompts.ts:284-290`, `generate-report/index.ts:4523-4524` | Same as above for plea sections |
| Anti-Hallucination — Immigration | `prompts.ts:393-394`, `generate-report/index.ts:4558-4559` | Bans definitive deportation conclusions |
| Anti-Hallucination — Regulatory | `prompts.ts:396-397`, `generate-report/index.ts:4561-4562` | FAFSA/licensing rules (post-2021 changes) |
| Anti-Hallucination — Outcome Map | `prompts.ts:630-635`, `generate-report/index.ts:4622-4623` | Bans specific percentages in How-Common-In-County column |
| Anti-Hallucination — DA Office Patterns | `prompts.ts:637-638`, `generate-report/index.ts:4625-4626` | Forces qualifier "general patterns" if not operator-researched |
| Anti-Hallucination — Judge Intelligence | `generate-report/index.ts:4628-4633` | If judge_research empty: don't fabricate, present FRAMEWORK as attorney questions |
| Anti-Hallucination — CPS | `generate-report/index.ts:822-825` | Score only dimensions with intake evidence; mark "Insufficient Data" if not |
| Anti-Hallucination — General | `generate-report/index.ts:2789-2791` | If unknown state statute fine range, say "varies by jurisdiction" |

**Status:** PRESENT and comprehensive on the prompt side. Strong defensive prompting; ZERO post-generation enforcement.

## W3. Emergency Hallucination Rule

`.claude/rules/no-hallucinated-legal-data.md` — agent-level instruction (not runtime enforcement):

> NEVER generate, fabricate, or hallucinate: case law citations, statute numbers, legal holdings, sentencing data, case outcomes.
> ALL legal data MUST come from VERIFIED SOURCES: CourtListener API, official legislatures, FL Online Sunshine, Cornell LII, Justia, official court records.
> Existing verified pipelines: `scripts/legal-research-all.mjs`, `scripts/legal-research-fl.mjs`, `scripts/classify-case-law.mjs`.

**Status:** PRESENT as agent rule. Enforced by `generate-case-law-enrichment.ts:6-9` which refuses to invent case law and points users to the verified pipeline. Not enforced at report-generation time.

## W4. Defense/Prosecution Classifier

`scripts/classify-case-law.mjs:138-260` runs over `statute_case_law` rows that already have a `courtlistener_cluster_id`:

| Mechanism | What it does | Lines |
|-----------|--------------|-------|
| DEFENSE_SIGNALS array (19 phrases) | Counts defense-favorable phrases in opinion text | 138-148 |
| PROSECUTION_SIGNALS array (15 phrases) | Counts prosecution-favorable phrases | 150-160 |
| BINDING_COURTS array | Detects FL Supreme Court / FL DCA opinions | 163-166 |
| `classifyOpinion()` | Returns `partySide`, `outcome`, `holdingExcerpt`, `keyQuote`, `isBinding`, `application` | 168-260 |
| `stripHtml()` | Tag stripper using split/join (no regex on file content per project rule) | 120-134 |
| `classifyFromName()` | Bypass for `In re:` / jury instruction cases → NEUTRAL | 262-277 |

**Status:** PRESENT and functional. Operates on offline-imported library only. Does NOT run during report generation. Does NOT verify the case exists — it only classifies cases that have already been fetched.

## W5. Verified-Pipeline Reference

| Script | Purpose | Lines | Status |
|--------|---------|-------|--------|
| `scripts/legal-research-all.mjs` | Statute verification + finds citing cases on CourtListener | n/a | PRESENT |
| `scripts/legal-research-fl.mjs` | FL-specific statute verification | n/a | PRESENT |
| `scripts/classify-case-law.mjs` | Defense/prosecution classifier (W4 above) | 1-280 | PRESENT |
| `scripts/generate-case-law-enrichment.ts` | Refuses to invent case law (`generate-case-law-enrichment.ts:6-9`); requires verified pipeline | 1-1050 | PRESENT |

## W6. Database Schema (`case_law_references`)

`supabase/migrations/00001_initial_schema.sql:105-125`:

| Column | Type | Verification role | Status |
|--------|------|-------------------|--------|
| `case_name` | text | identity | PRESENT |
| `citation` | text | identity | PRESENT |
| `court` | text | binding analysis | PRESENT |
| `year` | integer | age analysis | PRESENT |
| `holding` | text | applicability | PRESENT |
| `key_quote` | text | verbatim citation | PRESENT |
| `application` | text | applicability | PRESENT |
| `is_binding` | boolean | jurisdictional | PRESENT (default true, never set programmatically) |
| `is_good_law` | boolean | shepardize | PRESENT (default true, never updated) |
| `shepardized_at` | timestamptz | freshness tracking | PRESENT (column exists, never written) |
| `verification_url` | text | proof | PRESENT (single URL only) |
| **MISSING** | | | |
| `verification_urls` | text[] | multi-source proof (Gemini template requires 2+) | MISSING |
| `verified_law_id` | uuid FK | central library link | MISSING |
| `verification_status` | enum | VERIFIED/NOT FOUND/CITATION ERROR/OVERRULED | MISSING |
| `verification_count` | int | independent source count | MISSING |
| `confidence_tier` | enum | STRONG/MODERATE/WEAK/FABRICATED/UNVERIFIED | MISSING |
| `sources_checked` | text[] | which sources were tried | MISSING |
| `sources_confirmed` | text[] | which sources confirmed | MISSING |
| `negative_treatment` | jsonb | type, by_case, by_citation | MISSING |
| `holding_validation` | enum | STRONG/MODERATE/WEAK/REVIEW | MISSING |
| `fetched_holding` | text | extracted from real opinion | MISSING |
| `holding_similarity` | numeric | bag-of-words overlap | MISSING |
| `age_status` | enum | very_recent/current/aging/stale | MISSING |
| `courtlistener_cluster_id` | text | direct CL link | MISSING (exists on `statute_case_law`, not `case_law_references`) |
| `decision_date` | date | Gemini req field #3 | MISSING |
| `docket_number` | text | Gemini req field #4 | MISSING |
| `outcome` | text | Gemini req field #5 (REVERSED/AFFIRMED/QUASHED/REMANDED) | MISSING |
| `motion_type` | text | CASE applicability check | MISSING |
| `citation_count` | int | landmark detection | MISSING |
| `is_landmark` | boolean | citation_count > 100 | MISSING |
| `precedential_status` | text | published/per curiam | MISSING |
| `treatment_score` | jsonb | positive/negative/distinguishing counts | MISSING |
| `full_opinion_text` | text | actual opinion (capped 50K) | MISSING |

---

# Summary: Coverage Matrix

## Mechanisms grouped by current state

### IMPLEMENTED in web repo (full or partial)

1. **Universal anti-hallucination prompt block** (W1) — every Claude call gets it; 6 universal rules
2. **Domain-specific anti-hallucination sub-rules** (W2) — 9 section-specific blocks across CD + IB
3. **Emergency rule for agents** (W3) — `.claude/rules/no-hallucinated-legal-data.md`
4. **Defense/prosecution classifier** (W4) — `classify-case-law.mjs` for offline library
5. **Verified pipeline gate** (W5) — `generate-case-law-enrichment.ts` refuses to invent
6. **`is_good_law` boolean column** (W6) — exists, defaulted true, never updated by runtime
7. **Holding signal extraction** (4 of 11 patterns) — in `classify-case-law.mjs:200-207`
8. **Binding court detection** — `classify-case-law.mjs:163-166`

### MISSING in web repo (high-priority gaps)

1. **`verifyCaseLaw()` cascade** — multi-source independent confirmation (Gemini template's 2-URL minimum)
2. **`verified_case_law` central library table** — Migration 010 in engine, no equivalent in web
3. **Citation Verification Cascade** documented in `docs/ARCHITECTURE.md:269-279` — claimed but not implemented
4. **Negative treatment scan** (`NEGATIVE_KEYWORDS`, `checkNegativeTreatment`, `fetchDetailedTreatment`)
5. **`is_good_law` programmatic update** — column exists, never written
6. **`shepardized_at` freshness check** — column exists, never written; engine re-verifies if >30 days
7. **Three-tier good-law status** (GOOD / QUESTIONED / BAD) — web has only boolean
8. **Confidence tier classification** (STRONG/MODERATE/WEAK/FABRICATED/UNVERIFIED)
9. **Holding similarity / applicability scoring** (`holdingSimilarity`, `classifyHoldingValidation`)
10. **Age status classification** (`getAgeStatus`)
11. **Citation authority scoring** (`fetchCitationAuthority`, `is_landmark`)
12. **Two-URL minimum proof requirement** (Gemini template line 54) — web stores single URL
13. **URL liveness check** (CASE persona C2)
14. **Decision date / docket number / outcome columns** (Gemini fields 3, 4, 5)
15. **Post-generation verification worker** — engine has `citation-verify.mjs` 3-phase worker; web has none
16. **Inline citation extraction from generated text** — engine has `extractCitations()` + Phase B scanner
17. **Operator task auto-creation** for fabricated/weak/overruled citations
18. **VERI's out-of-context detection** (negation-word proximity flagging) — listed as future even in engine
19. **Jurisdictional source priority** — Justia, Google Scholar, official court PDFs, Leagle, FindLaw fetchers
20. **Statute verification cascade** — OpenLaws → Cornell LII → eCFR
21. **eCFR point-in-time** (offense-date regulation vs current) — engine `legal-verifier.mjs:1105`
22. **Wex definition lookup** for plain-English term grounding
23. **CourtListener Citation Lookup API** (POST endpoint) — engine uses it for exact match; web uses Opinions API only
24. **`motion_recommendations.basis_verified`** field — engine sets it, web has no `motion_recommendations` table
25. **Charge → motion-type routing matrix** — CASE persona's applicability check requires it

### NOT APPLICABLE to web repo (engine territory)

1. **VERI discovery PDF verification** (V1, V2, V3) — engine processes raw discovery PDFs in `01-Raw/`; web doesn't
2. **Soft Find fuzzy quote correction** (V3) — same reason
3. **Auto-correction of motion files** — web doesn't generate motion files
4. **`citation_verification_log` table** — discovery-side audit log

---

# The False-Promise Risk

`generate-report/index.ts:292` tells Claude:

> "All citations are automatically verified against CourtListener's legal database. Fabricated citations will be caught and flagged."

**This is currently false** for runtime report generation. The web repo:
- Verifies citations only during the offline `classify-case-law.mjs` build of `statute_case_law`
- Does NOT scan generated Case Decoder / Intelligence Brief output for citations
- Does NOT call CourtListener after Claude returns text
- Has no `verification_status` write path for `case_law_references`

The prompt's warning may deter Claude from inventing citations, but it should not be presented to operators or customers as an enforced guarantee. Either implement the post-generation verification (port `legal-verifier.mjs` + `citation-verify.mjs` from the engine, or make the web repo call the engine via an API), or remove the claim from the prompt.

---

# File Path Index

**Parent project (read-only audit source):**
- `C:\Users\email\projects\ImNotAnAttorney\system\Attorney-Personas\CASE-LAW-VALIDATION-PERSONA.md`
- `C:\Users\email\projects\ImNotAnAttorney\system\Attorney-Personas\VERI-CITATION-VERIFICATION-PERSONA.md`
- `C:\Users\email\projects\ImNotAnAttorney\system\Case-Law\GEMINI-CASE-LAW-RESEARCH-TEMPLATE.md`
- `C:\Users\email\projects\ImNotAnAttorney\system\Case-Law\GEMINI-CASE-VERIFICATION-TEMPLATE.md`
- `C:\Users\email\projects\ImNotAnAttorney\docs\API-TOKEN-SIGNUP-GUIDE.md`
- `C:\Users\email\projects\ImNotAnAttorney\system\data\motion-library.json`
- `C:\Users\email\projects\ImNotAnAttorney\system\data\penalty-ranges.json`
- `C:\Users\email\projects\ImNotAnAttorney\system\data\statute-references.json`
- `C:\Users\email\projects\ImNotAnAttorney\system\data\diversion-programs.json`
- `C:\Users\email\projects\ImNotAnAttorney\system\data\speedy-trial-rules.json`

**Engine reference implementation:**
- `C:\Users\email\projects\ImNotAnAttorney-engine\src\integrations\legal-verifier.mjs`
- `C:\Users\email\projects\ImNotAnAttorney-engine\src\workers\citation-verify.mjs`
- `C:\Users\email\projects\ImNotAnAttorney-engine\.env` (CourtListener token configured)

**Web repo current state:**
- `C:\Users\email\projects\ImNotAnAttorney-web\.claude\rules\no-hallucinated-legal-data.md`
- `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\intelligence-brief\prompts.ts`
- `C:\Users\email\projects\ImNotAnAttorney-web\supabase\functions\generate-report\index.ts`
- `C:\Users\email\projects\ImNotAnAttorney-web\scripts\classify-case-law.mjs`
- `C:\Users\email\projects\ImNotAnAttorney-web\scripts\legal-research-all.mjs`
- `C:\Users\email\projects\ImNotAnAttorney-web\scripts\legal-research-fl.mjs`
- `C:\Users\email\projects\ImNotAnAttorney-web\scripts\generate-case-law-enrichment.ts`
- `C:\Users\email\projects\ImNotAnAttorney-web\supabase\migrations\00001_initial_schema.sql`
- `C:\Users\email\projects\ImNotAnAttorney-web\supabase\migrations\20250101000030_research-columns-and-case-law.sql`
- `C:\Users\email\projects\ImNotAnAttorney-web\docs\ARCHITECTURE.md` (lines 261-302 — Citation Verification Cascade documented but not implemented)

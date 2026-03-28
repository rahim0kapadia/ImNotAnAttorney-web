# INAA Legal Data Pipeline — End-to-End Architecture

Last updated: 2026-03-28

## Overview

The INAA report pipeline generates Case Decoder ($197) and Intelligence Brief ($997) reports for criminal defendants. Every report is only as good as the data injected into the prompts. This document maps every data point end-to-end: **who produces it → where it lives → who reads it → what the customer gets.**

If any link is missing, the pipeline is broken at that point. Claude falls back to training data (hallucination risk) or generic hedging ("ask your attorney").

## Three-Project Architecture

```
ImNotAnAttorney/              Business docs, templates, seed data, personas
ImNotAnAttorney-web/          Next.js site, Edge Functions (report generation), cron
ImNotAnAttorney-engine/       Backend workers (legal research, docket, citation verification)
                              ↕ ALL THREE share one Supabase database ↕
```

## Pipeline Flow

```
Customer pays → Case created → Intake form submitted
                                      ↓
                    ┌─────────────────────────────────────┐
                    │  LEGAL DATA ENRICHMENT (before gen)  │
                    │                                      │
                    │  Level 1: Charge taxonomy lookup      │
                    │  Level 2: Pre-researched case law     │
                    │  Level 3: Jurisdiction profile        │
                    │  Level 4: Judge profile (IB only)     │
                    │  Level 5: Wex definitions             │
                    └─────────────────────────────────────┘
                                      ↓
                    Report generation (Claude Opus/Sonnet)
                                      ↓
                    Evaluation → Operator review → Delivery
```

---

## DATA PIPELINE MAP

### Status Key
- ✅ LIVE — producer writes, consumer reads, deliverable ships
- ⚠️ PARTIAL — some data flows, gaps exist
- ❌ BROKEN — consumer expects data, producer doesn't exist or isn't running
- 🔲 DESIGNED — table/schema exists, no producer built yet

---

### Layer 1: Charge Taxonomy (per charge × jurisdiction, reusable)

| # | Data Point | Producer | Table | Consumer | Deliverable | Status |
|---|-----------|----------|-------|----------|-------------|--------|
| 1 | Charge categories (12) | Migration 028 seed | `charge_categories` | `getChargeCategories()` → IntakeChargeCategories | Intake Step 1 category grid | ✅ LIVE |
| 2 | Common charges (115) | Migration 029 seed | `common_charges` | `getCommonCharges()` → IntakeChargeSelector | Intake charge selection | ✅ LIVE |
| 3 | Charge questions (161) | Migration 029 seed | `charge_questions` | `getChargeQuestions()` → IntakeChargeQuestions | Intake charge-specific questions | ✅ LIVE |
| 4 | Statute number + title | `load-jurisdiction-data.mjs` + `legal-research-fl.mjs` | `jurisdiction_statutes` | `buildEnrichedChargeContext()` → report prompt | "CHARGE CONTEXT" block: statute citation | ⚠️ PARTIAL (510 rows across 5 states, FL verified) |
| 5 | Prosecution elements | `load-jurisdiction-data.mjs` (from AI-generated JSON) | `jurisdiction_statutes.elements[]` | `buildEnrichedChargeContext()` → report prompt | Elements prosecution must prove | ⚠️ PARTIAL (AI-generated, pending verification) |
| 6 | Penalty range (min/max) | `load-jurisdiction-data.mjs` | `jurisdiction_statutes.penalty_min/max` | `buildEnrichedChargeContext()` → report prompt | Section 3a Outcome Map sentencing | ⚠️ PARTIAL (AI-generated, pending verification) |
| 7 | Fine max | `load-jurisdiction-data.mjs` | `jurisdiction_statutes.fine_max` | `buildEnrichedChargeContext()` → report prompt | Financial exposure in report | ⚠️ PARTIAL (AI-generated, pending verification) |
| 8 | Mandatory minimum | `load-jurisdiction-data.mjs` | `jurisdiction_statutes.mandatory_minimum` | `buildEnrichedChargeContext()` → report prompt | Mandatory minimum warning | ⚠️ PARTIAL (AI-generated, pending verification) |
| 9 | Enhancements | `load-jurisdiction-data.mjs` | `jurisdiction_statutes.enhancements[]` | `buildEnrichedChargeContext()` → report prompt | Enhancement triggers (priors, weapon) | ⚠️ PARTIAL (AI-generated, pending verification) |
| 10 | Expert→charge mapping | **NONE (column empty)** | `experts.common_charge_slugs[]` | `getChargeContext():1756` → report prompt | "GOD MODE EXPERTS" panel | ❌ BROKEN |

### Layer 2: Legal Research (per case, run before report generation)

| # | Data Point | Producer | Table | Consumer | Deliverable | Status |
|---|-----------|----------|-------|----------|-------------|--------|
| 11 | Pre-researched case law | **Engine: legal-research.mjs (NOT RUNNING)** | `case_law_references` (research_source=pre_research) | `fetchLegalResearchData():2113` → report prompt | "PRE-RESEARCHED CASE LAW" — Claude told to cite THESE over generated | ❌ BROKEN |
| 12 | Court name + type | **Engine: jurisdiction-profile.mjs (NOT RUNNING)** | `jurisdiction_profiles` | `fetchLegalResearchData():2103` → report prompt | "JURISDICTION PROFILE" block | 🔲 DESIGNED (table created via migration 011, no producer yet) |
| 13 | Speedy trial statute + days | **Engine: jurisdiction-profile.mjs** | `jurisdiction_profiles.speedy_trial_*` | `fetchLegalResearchData()` → report prompt | Speedy trial clock in report | ❌ BROKEN |
| 14 | Charge statute text + URL | **Engine: jurisdiction-profile.mjs** | `jurisdiction_profiles.charge_statute_*` | `fetchLegalResearchData()` → report prompt | Statute text with source link | ❌ BROKEN |
| 15 | Wex legal definitions | **Engine: legal-research.mjs (NOT RUNNING)** | `cases.wex_definitions` (JSONB) | `fetchLegalResearchData():2123` → report prompt | "LEGAL TERM DEFINITIONS" glossary | ❌ BROKEN |
| 16 | Judge profile | **Engine: judge-research.mjs (NOT RUNNING)** | `judge_profiles` | `fetchLegalResearchData():2139` (IB only) | Section 3e "Judge Intelligence Profile" | 🔲 DESIGNED (table created via migration 011, no producer yet) |
| 17 | Motion deadlines | **NONE** | `variables.ts:279` hardcoded fallback | `buildIBVariables()` → IB prompts | Section 4 deadline calendar | ❌ BROKEN (always "ask your attorney") |
| 18 | Arraignment date | **NONE (not in intake form)** | `variables.ts:276` hardcoded fallback | `buildIBVariables()` → IB prompts | Timeline anchor in Section 1a | ❌ BROKEN (always "ask your attorney") |

### Layer 3: Enrichment (nice-to-have, improves quality)

| # | Data Point | Producer | Table | Consumer | Deliverable | Status |
|---|-----------|----------|-------|----------|-------------|--------|
| 19 | Diversion program eligibility | **NONE** | No table (data in engine's `diversion-programs.json` but not loaded) | `buildLegalOptions()` | Section 4 alternative paths | ❌ BROKEN |
| 20 | Collateral consequences (NICCC) | **NONE** | No table | `buildProtection()` | Section 5b Life Impact Map (800 words) | ❌ BROKEN |
| 21 | Professional licensing impact | **NONE** | No table | `buildProtection():406-413` | Industry-specific licensing consequences | ❌ BROKEN |
| 22 | DA office charging patterns | **NONE** | No table (operator free-text only) | `buildCaseIntelligence()` | Section 3d prosecution strategy | ❌ BROKEN |
| 23 | State bar contact info | **NONE** | No table | `render.ts:473` (static generic text) | Appendix C referral resources | ⚠️ PARTIAL (generic, not state-specific) |
| 24 | Courthouse logistics | **NONE** | No table | `buildCourtPrep():474` | Appendix B practical prep | ❌ BROKEN |

### Layer 4: Working Data (already functional)

| # | Data Point | Producer | Table | Consumer | Deliverable | Status |
|---|-----------|----------|-------|----------|-------------|--------|
| 25 | Case record | Stripe webhook + intake | `cases` | All report generation | Case context | ✅ LIVE |
| 26 | Intake form data | Customer via /intake | `intakes` | All report generation | Customer's situation | ✅ LIVE |
| 27 | Legacy charge types | Migration 004 seed | `charge_types` | `getChargeContext()` fallback path | Legacy expert routing | ✅ LIVE |
| 28 | Legacy experts (63) | Migration 004 seed | `experts` | `getChargeContext()` fallback path | Hardcoded expert panel | ✅ LIVE |
| 29 | Drip email sequences | `src/lib/drip-emails.ts` | `drip_sends` | `api/cron/drip/route.ts` | 22-part email nurture | ✅ LIVE |
| 30 | Stripe orders | Webhook handler | `orders` | Checkout success + operator | Payment tracking | ✅ LIVE |
| 31 | Score aggregates | Score submissions | `score_aggregates` | `/api/stats/score-summary` | Social proof counter | ✅ LIVE |

---

## BROKEN LINK SUMMARY

**12 of 31 data points still broken** (down from 18). Progress:
- Items 4-9: ⚠️ PARTIAL — 510 statute rows loaded across 5 states (FL, GA, IL, NC, PA). FL statutes being verified via Online Sunshine. AI-generated data pending full verification.
- Items 12, 16: 🔲 DESIGNED — tables created (migration 011 applied 2026-03-28), no producer yet.
- Items 10-11, 13-15, 17-24: ❌ Still broken.

Remaining gaps:
- Case law (item 11): needs CourtListener API token
- Judge profiles (item 16): needs CourtListener People API
- Motion deadlines, arraignment dates (items 17-18): need state rules lookup
- Enrichment layer (items 19-24): not yet started

### Root Cause (RESOLVED 2026-03-28)
Migration 011 applied. Migration 030 added research tracking columns + `statute_case_law` table. Jurisdiction data loaded from AI-generated JSON files. Research skill (`legal-research-fl.mjs`) verifies statutes against FL Online Sunshine.

---

## DATA SOURCES (for the research skill that fixes this)

| Layer | Source | Auth | Rate Limit | Coverage | What It Provides |
|-------|--------|------|-----------|----------|------------------|
| Federal statutes | GovInfo API | Free api.data.gov key | Generous | All federal titles | Statute text, section-level |
| Federal regs | eCFR API | None | None stated | All CFR titles | Point-in-time regulation text |
| Federal bulk | uscode.house.gov XML | None | N/A (download) | Full US Code | Offline statute corpus |
| State statutes | Individual state legislature sites | None | N/A (scrape) | Per-state | Statute text + URL |
| State statutes (all) | OpenLaws.us API | Account required | Unknown | 50 states + DC | 4.3M sections, search API |
| Case law | CourtListener API v4.3 | Free token | 5,000/hr | 18M+ opinions | Case search, opinions, judges |
| Citation validation | CourtListener Citation Lookup | Free token | 60/min | Case law only | Verify citations exist |
| Citation parsing | Eyecite (Python) | None | N/A (local) | All citation types | Extract + normalize citations |
| Legal definitions | Cornell LII Wex | None | N/A (scrape) | Federal + common terms | Plain-English definitions |
| Judge profiles | CourtListener People API | Free token | 5,000/hr | Federal + some state | Bio, ABA rating, political affiliation |
| Judge profiles (state) | Ballotpedia | None | N/A (scrape) | Elected state judges | Election results, party, term |
| Collateral consequences | NICCC API | Unknown | Unknown | All 50 states | Consequence categories per offense |
| Verification links | Cornell LII, Justia | None | N/A | All jurisdictions | Human-readable source URLs |

---

## THE FIX: Legal Research Skill

### Level 1 — Per Charge × Jurisdiction (run once, reuse across all cases)
Populates: `jurisdiction_statutes`, `case_law_references` (charge-level), `charge_questions`

For each of 115 charges × 52 jurisdictions:
1. **Statute lookup** — search state legislature site + Justia + Cornell LII
2. **Extract** — statute number, title, elements, penalties, mandatory minimums, enhancements
3. **Validate** — statute must appear in 2+ sources; store source URLs
4. **Case law** — search CourtListener for 5-10 landmark cases citing this statute
5. **Validate citations** — CourtListener Citation Lookup API
6. **Store** — `jurisdiction_statutes` with `source_urls[]`, `verified_at`, `confidence_score`

### Level 2 — Per Case (run when case created, before report generation)
Populates: `jurisdiction_profiles`, `judge_profiles`, `cases.wex_definitions`, `case_law_references` (case-specific)

For each new case:
1. **Jurisdiction profile** — court info from CourtListener Courts API, speedy trial from state rules
2. **Judge profile** — CourtListener People API + Ballotpedia (if elected)
3. **Wex definitions** — Cornell LII for charge-specific terms
4. **Case-specific case law** — CourtListener search for this charge + jurisdiction + relevant facts
5. **Motion deadlines** — state Rules of Criminal Procedure lookup
6. **Arraignment date** — docket search if case number provided

### Validation Rules (from CASE persona)
- Every statute: 2+ source URLs confirming the statute number exists
- Every case citation: CourtListener Citation Lookup confirms it exists
- Confidence tiers: UNVERIFIED → LOW (1 source) → MEDIUM (2 sources) → HIGH (3+ sources) → VERIFIED (fetched full text)
- Holding validation: compare fetched holding to claimed application (SequenceMatcher similarity 0.0-1.0)

---

## SCHEMA CHANGES NEEDED

### Apply from parent project (migration 011)
```sql
-- These tables are defined in ImNotAnAttorney/supabase/migrations/011-legal-source-maximization.sql
-- They need to be applied to the shared Supabase database
CREATE TABLE jurisdiction_profiles ( ... );
CREATE TABLE judge_profiles ( ... );
-- verified_case_law table + case_law_references enhancements
```

### New columns for research skill output
```sql
ALTER TABLE jurisdiction_statutes
  ADD COLUMN source_urls text[],
  ADD COLUMN verified_at timestamptz,
  ADD COLUMN confidence_score numeric(3,2),
  ADD COLUMN verification_notes text;

CREATE TABLE statute_case_law (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_statute_id uuid REFERENCES jurisdiction_statutes(id),
  case_name text NOT NULL,
  citation text NOT NULL,
  court text,
  year integer,
  holding text,
  relevance text,
  is_good_law boolean DEFAULT true,
  source_urls text[],
  courtlistener_cluster_id text,
  verified_at timestamptz DEFAULT now()
);
```

---

## PRIORITY ORDER

### P0 — Fix the 5 CRITICAL broken links (items 4-8, 11, 12-14, 16, 17)
These directly cause hallucinated data in customer reports.

### P1 — Apply migration 011 to create missing tables
`jurisdiction_profiles` and `judge_profiles` don't exist. The consumers already query them.

### P2 — Build Level 1 skill (per charge × jurisdiction)
Start with FL (active case state), then top 10 states, then expand.

### P3 — Build Level 2 skill (per case enrichment)
Triggered on case creation, populates case-specific data before report generation.

### P4 — Backfill experts.common_charge_slugs
Map existing 63 expert rows to the new taxonomy slugs.

### P5 — Fill enrichment layer (items 19-24)
Diversion programs, collateral consequences, licensing impact, courthouse logistics.

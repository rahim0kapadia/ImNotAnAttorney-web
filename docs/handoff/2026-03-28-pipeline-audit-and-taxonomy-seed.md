# Handoff: Pipeline Audit + Taxonomy Seed + Legal Research Skill Design
Date: 2026-03-28 17:30

## What Was Accomplished

### Code Shipped (committed d9e0e19)
- **Seed migration 029** applied to Supabase: 115 common_charges + 161 charge_questions
- **8 jurisdiction files** generated (FL, GA, IL, MI, NC, NJ, PA, federal) — AI-generated from training data, pending verification via research skill
- **Pipeline architecture doc** at `docs/PIPELINE-ARCHITECTURE.md` — end-to-end data flow map
- **Seed builder script** at `scripts/build-seed-migration.ts` — regenerates migration from static data + JSON files
- Migration 028 tables confirmed: 12 charge_categories, 4 empty tables ready for data

### DB State (production Supabase)
- `charge_categories`: 12 rows (seeded by migration 028)
- `common_charges`: 115 rows (seeded by migration 029)
- `charge_questions`: 161 rows (seeded by migration 029)
- `jurisdiction_statutes`: 0 rows (will be populated by research skill)

### Quick Fixes (already in HEAD from previous session)
- "6-part" → "multi-part" in checkout features (was already committed)
- "8 Advocacy Steps" → "5 Advocacy Steps" in generate-report (was already committed)
- Item 4 (3 uncommitted files) — already committed in fa0d062

### Critical Discovery: Pipeline Audit Results
**18 of 31 data points are broken.** The entire legal data enrichment layer is non-functional:
- Migration 011 (`legal-source-maximization`) exists in ImNotAnAttorney/ but was NEVER APPLIED to Supabase
- `jurisdiction_profiles` and `judge_profiles` tables DON'T EXIST
- `case_law_references` (pre_research) is EMPTY
- `cases.wex_definitions` is EMPTY
- Engine workers (legal-research, jurisdiction-profile, judge-research) are designed but NOT RUNNING
- `fetchLegalResearchData()` in generate-report silently returns empty for ALL 4 data sources
- Every report generates with zero verified legal data injection

Full map: `C:\Users\email\projects\ImNotAnAttorney-web\docs\PIPELINE-ARCHITECTURE.md`

## Research Completed (5 parallel agents)

### 1. DB Schema Audit (INAA-web)
Every table mapped with producer→consumer→status. Key finding: the 4 legal research tables queried by fetchLegalResearchData() all return empty/null.

### 2. Parent Project Data Model (ImNotAnAttorney/)
- Migration 011 defines jurisdiction_profiles, judge_profiles, verified_case_law
- Engine workers designed: legal-research.mjs, jurisdiction-profile.mjs, judge-research.mjs, legal-verifier.mjs
- Validation personas: CASE (citation validation), VERI (citation verification)
- Confidence tiers: UNVERIFIED→LOW→MEDIUM→HIGH→VERIFIED
- Sources: CourtListener, Justia, Cornell LII, eCFR, GovInfo

### 3. Prompt Enrichment Wish List
19 data points ranked by priority:
- CRITICAL (5): Judge profile, statute elements, verified case law, county plea patterns, motion deadlines
- HIGH (6): DA patterns, diversion programs, licensing impact, collateral consequences, arraignment date, penalty ranges
- MEDIUM (5): Officer disciplinary, courthouse logistics, FAFSA rules, immigration consequences, state bar contacts
- NICE-TO-HAVE (3): Judge news, witness background, historical dispositions

### 4. Legal Data Source APIs
- **GovInfo API** — federal statute text (authoritative, free api.data.gov key)
- **CourtListener API v4.3** — case law + judges (5K/hr, free token)
- **CourtListener Citation Lookup** — citation validation (60/min)
- **Eyecite** (Python) — citation parsing
- **eCFR API** — federal regs (no auth)
- **State statutes** — no unified API; OpenLaws.us (paid) or per-state scrapers
- **Cornell LII** — verification links, no formal API
- **Justia** — verification links, no API

### 5. Skill Architecture Patterns
- Frontmatter: name, description, version
- Pattern: Expert-driven + Framework hybrid
- Skills coordinate via session, don't spawn agents directly
- References subdirectory for complex frameworks

## Blocker: Anthropic API Credits
The generation script (`scripts/generate-charge-taxonomy.ts --all`) requires Anthropic API credits. Key `sk-ant-api03-CvMg...` in .env.local is depleted. Top up at console.anthropic.com to run the full 52-jurisdiction generation. (The research skill replaces this approach but credits are still needed for report generation.)

## Next Session: Build the Legal Research Skill

### Immediate (P0)
1. Apply migration 011 from parent project to Supabase (creates jurisdiction_profiles, judge_profiles)
2. Build the Level 1 skill: per charge x jurisdiction research
   - Statute lookup via state legislature sites + Justia + GovInfo
   - Case law via CourtListener API (5-10 per charge x jurisdiction)
   - Citation validation via CourtListener Citation Lookup
   - Store with source_urls[], confidence_score, verified_at
3. Run Level 1 on FL first (Rahim's active case state)

### Then (P1)
4. Build Level 2 skill: per case enrichment
   - Judge profile from CourtListener People API
   - Wex definitions from Cornell LII
   - Motion deadlines from state rules
5. Backfill experts.common_charge_slugs

### Architecture Docs
- `C:\Users\email\projects\ImNotAnAttorney-web\docs\PIPELINE-ARCHITECTURE.md` — the end-to-end map (READ FIRST)
- `C:\Users\email\projects\ImNotAnAttorney\supabase\migrations\011-legal-source-maximization.sql` — the missing migration
- `C:\Users\email\projects\ImNotAnAttorney\system\templates\personas\CASE-LAW-VALIDATION-PERSONA.md` — validation rules

### Key Insight from Rahim
"Don't ignore data coming in — we add it then validate it." The AI-generated jurisdiction files (8 states) are committed as starting data. The research skill validates and enriches them rather than replacing from scratch. Case law on every ruling and statute is the highest-value enrichment.

## Copy-Paste Prompt for Next Session
```
Continue from C:\Users\email\projects\ImNotAnAttorney-web\docs\handoff\2026-03-28-pipeline-audit-and-taxonomy-seed.md

READ FIRST: C:\Users\email\projects\ImNotAnAttorney-web\docs\PIPELINE-ARCHITECTURE.md
This maps all 31 data points end-to-end. 18 are broken. The research skill fixes them.

P0: Apply migration 011 from C:\Users\email\projects\ImNotAnAttorney\supabase\migrations\011-legal-source-maximization.sql to Supabase (creates jurisdiction_profiles + judge_profiles tables).

Then: Build the legal research skill. Two levels:
- Level 1 (per charge x jurisdiction): statute lookup + case law + citation validation. Sources: GovInfo API, CourtListener API, state legislature sites. Store in jurisdiction_statutes + case_law_references with source_urls[] and confidence_score.
- Level 2 (per case): judge profile + wex definitions + motion deadlines.

Start with FL. The CASE persona validation rules are at C:\Users\email\projects\ImNotAnAttorney\system\templates\personas\CASE-LAW-VALIDATION-PERSONA.md.

Rahim's directive: add data first, validate second. Case law on every ruling and statute is the #1 priority.
```

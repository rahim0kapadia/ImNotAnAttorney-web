# ARCHITECTURE.md Audit Report, 2026-03-14

4-agent parallel audit across all 3 ImNotAnAttorney projects. Compared docs/ARCHITECTURE.md (1,715 lines, committed `a6fa82f`) against actual code.

---

## Verdict: ~60% accurate

The doc correctly covers the web app's own code, but:
- Has **factual errors** in 5 places (wrong numbers, wrong model names)
- Is **completely blind** to the engine project (39 workers, 6 external data sources, job queue architecture)
- **Misses** the business docs' frameworks (evaluation teams, expert reference, emotional intelligence, buyer states)
- Has **internal inconsistencies** (cron count in header vs table)

---

## P0, Factual Errors (WRONG in the current doc)

### 1. Claude Model for Report Generation
- **Doc says (line 45):** "AI: Claude Sonnet 4.6, IB generation"
- **Doc says (line 1004):** "Model: Claude Sonnet 4.6 for all sections"
- **Doc says (line 1512):** "Claude Sonnet 4.6 can exceed this on complex charges"
- **Reality:** `supabase/functions/generate-report/index.ts` uses `claude-opus-4-6` with **extended thinking** (budget_tokens: 16000) for Case Decoder generation. Sonnet 4.6 is used for IB sections and evaluation only.
- **Fix:** Line 45 → "Claude Opus 4.6 (CD generation, extended thinking) + Sonnet 4.6 (IB sections, evaluation)"

### 2. Database Table Count
- **Doc says (line 42):** "43 tables across 11 migrations"
- **Reality:** Initial schema alone defines 52 tables. Plus engine-specific tables (document_pages, entity_extractions, finding_sources, evidence_inventory, chain_of_custody_records, case_persons, case_analysis_scores, case_monitoring, job_cost_tracking, legal_citations, jurisdiction_profiles).
- **Fix:** Update count after full cross-project table inventory.

### 3. IBVariables Field Count
- **Doc says (line 1013):** "168 fields in IBVariables interface across 7 categories"
- **Reality:** `src/lib/intelligence-brief/variables.ts` lines 82-167 contains **84 fields**, not 168.
- **Fix:** Line 1013 → "84 fields"

### 4. Evaluation Teams Implemented
- **Doc says (lines 1204-1216):** 5 evaluation teams (UPL, Psychology, Legal Quality, Defendant Experience, Conversion & Brand)
- **Reality:** `supabase/functions/evaluate-report/index.ts` implements only **2 teams** (UPL gate + Psychological Architecture). Legal Quality, Defendant Experience, and Conversion & Brand are designed in business docs but NOT coded.
- **Fix:** Add note: "Currently implemented: UPL (GATE) + Psych (HIGH). Remaining 3 teams designed but not yet coded."

### 5. Cron Parts Count, Internal Inconsistency
- **Doc header (line 1176):** "19 parts"
- **Doc table (lines 1180-1202):** Lists 23 entries (1, 2, 3, 4, 5, 5b, 5c, 6, 6b, 7, 8, 9a, 9b, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19)
- **Actual code:** Cron file header says "21 things". Parts 9a/9b are combined as single Part 9 in code.
- **Fix:** Reconcile header, table, and code. Pick one counting method.

---

## P1, Major Missing Systems

### 6. ImNotAnAttorney-Engine (ENTIRELY MISSING)

A separate Node.js project (`~/projects/ImNotAnAttorney-engine/`) that powers ALL discovery-tier processing. ARCHITECTURE.md has zero reference to it.

**What it is:** Distributed job queue worker system. Polls `processing_jobs` table, dispatches to 39 worker modules across 6 phases, writes results back to shared Supabase.

**Deployment:** GitHub Actions cron (`process-jobs.yml`) every 5 minutes, `node src/worker.mjs,once`, max 20 jobs/run.

**39 Worker Modules:**

| Phase | Workers | Claude Model | Purpose |
|-------|---------|-------------|---------|
| 1: Document Ingestion | ocr, classify, extract-entities | Haiku | Per-document text extraction + classification |
| 2: Cross-Document Analysis | finding-analysis, red-flags, timeline, evidence, chain-of-custody, witness-id, question-generation, score, citation-verify | Sonnet/Opus | Case-level analysis (9 workers) |
| 3: Report Generation | report | Opus (thinking) | Assemble final report from analysis data |
| 4: Intelligence Gathering | judge-research, prosecutor-research, witness-dossier | Opus | Deep intelligence for $4,997+ tiers |
| 5: Strategy | motion-analysis, case-law, strategy | Opus (thinking) | Defense strategy synthesis |
| 6: Trial Intelligence | cross-exam, trial-material, attack-intel | Opus | Trial-day preparation |
| Ongoing | update-generation | Sonnet | War Room weekly updates |
| Data Fetch | docket-fetch, legal-research, jurisdiction-profile, docket-monitor | API-only | External legal data |

**Pipeline orchestration (convergence points):**
```
Per-document: ocr → classify + extract
Case-level: All extractions done → finding_analysis + docket_fetch + legal_research + jurisdiction_profile
             finding_analysis → red_flags + timeline + evidence + witness_id
             red_flags → question_generation
             evidence → chain_of_custody
             All converge → score_computation → report_generation
Post-report: report → (War Room+) docket_monitor + intelligence workers
```

**Additional DB tables used by engine (not in web doc):**
- `document_pages`, OCR page-level output
- `entity_extractions`, Named entity extraction results
- `finding_sources`, Source document for each finding
- `evidence_inventory`, Evidence catalog
- `chain_of_custody_records`, Custody chain analysis
- `case_persons`, Role-based (witness/judge/prosecutor)
- `case_analysis_scores`, Defense Strength Score
- `case_monitoring`, CourtListener docket alerts
- `job_cost_tracking`, Claude API cost per job
- `legal_citations`, Citation verification results
- `jurisdiction_profiles`, Jurisdiction context cache

### 7. External Legal Data Sources (ENTIRELY MISSING)

The engine integrates with 7 external legal data APIs. ARCHITECTURE.md mentions none.

| Source | Module | Purpose | Auth |
|------, |------, |---------|------|
| CourtListener | legal-verifier.mjs, docket-fetcher.mjs | Dockets, opinions, judge profiles, financial disclosures, citation verification | Optional token |
| PACER | pacer-fetcher.mjs | Federal court records | Login/password |
| JudyRecords | docket-fetcher.mjs | State court records | Optional API key |
| GovInfo | govinfo-fetcher.mjs | US Code, CFR, congressional reports, Statutes at Large | API key |
| eCFR | legal-verifier.mjs | Code of Federal Regulations point-in-time snapshots | Free |
| SerpAPI | serpapi-legal.mjs | Google Scholar legal search | API key ($50/mo) |
| Wex | legal-verifier.mjs | Legal term definitions | Free |

All sources use per-domain rate limiting and graceful degradation (optional tokens).

### 8. Template System (MISSING)

Report generation uses prompt templates from a SEPARATE repository (`ImNotAnAttorney/system/templates/`), checked out as a sidecar in the engine's GitHub Actions workflow.

Structure:
```
system/templates/
├── x-ray/prompt-template-*.md
├── war-room/prompt-template-*.md
└── situation-room/prompt-template-*.md
```

Templates use `{placeholder}` syntax for case data injection. Anti-hallucination blocks reference seed data files.

### 9. Anti-Hallucination Seed Data (MISSING)

5 JSON files in `ImNotAnAttorney/system/data/`:
- `motion-library.json`, 30+ motions with legal basis + attorney attribution
- `penalty-ranges.json`, Charge-specific sentencing ranges from actual statutes
- `statute-references.json`, Statute citations with verification metadata
- `diversion-programs.json`, State-by-state diversion eligibility
- `speedy-trial-rules.json`, State-specific speedy trial timelines

Every prompt template references these files. Blocks hallucinated motion names, fake statistics, and fabricated procedures.

### 10. Expert Reference System (MISSING)

63 documented experts across 9 charge-type categories in `ImNotAnAttorney/system/EXPERT-REFERENCE.md`. Every prompt template cites specific experts. Tier-by-tier skill loading (X-Ray loads 2 skills, War Room loads 5).

Cross-cutting experts include forensic evidence, trial methodology, jury consulting, intelligence analysis specialists.

### 11. Emotional Intelligence Standard (MISSING)

`ImNotAnAttorney/system/EMOTIONAL-INTELLIGENCE.md` defines:
- 8-dimension emotional profiling (Primary Fear, Emotional Stance, Attorney Relationship, Hope Signal, Isolation Level, Charge Pattern, Co-Defendant Dynamics, Reading Arc)
- Stance-calibrated tone variations (Minimizer, Catastrophizer, Intellectualizer, Dissociater)
- 16 banned phrases with approved replacements
- 38-check self-verification checklist
- Warm language rules ("you told us" vs "you indicated")
- Bridging patterns after hard information

This is WHY Opus 4.6 with extended thinking is required for CD generation, Sonnet produced "mechanical emotional calibration."

### 12. Buyer States Framework (MISSING)

6 buyer states in `ImNotAnAttorney/system/BUYER-STATES.md`:
1. distrust, "I Don't Trust My Attorney"
2. double-checking, "I'm Double-Checking What He Said"
3. information-vacuum, "He's Not Telling Me Anything"
4. no-attorney, "No Attorney Yet"
5. just-arrested, "I Just Got Arrested"
6. family-buyer, (future state)

Buyer state drives Section 2 framing in reports. Evaluation criterion D11 checks buyer state alignment.

### 13. Cost Tracking (MISSING)

Engine tracks every Claude API call in `job_cost_tracking` table:
- Input tokens, output tokens, cache hits, latency
- Aggregation by job type, model, tier, case
- Cache pricing: 90% discount on cache hits

No mention in ARCHITECTURE.md.

---

## P2, Partially Documented / Stale

### 14. Evaluation Framework, Designed vs Implemented Gap
- **Business docs:** 7 evaluation teams with 99+ criteria
- **ARCHITECTURE.md:** 5 teams documented
- **Code:** 2 teams implemented (UPL + Psych)
- **Gap:** Doc should clearly state what's designed vs. what's coded

### 15. Deliverables-by-Tier, Outdated
- Missing v4 March 2026 restructure
- Judge Intelligence moved from IB to X-Ray tier
- New deliverables: 8-Domain Life Impact Map, Prosecution Pressure Tactics Decoder
- New: Prosecutor Research Profile in X-Ray
- Missing: "Clarity or It's Free Guarantee" for Intelligence Brief

### 16. Pipeline Stages, Only Partially Documented
`ImNotAnAttorney/system/PIPELINE-MAP.md` defines 16 stages (00-15). Doc covers CD/IB flow well but vaguely hand-waves discovery pipeline as "job queue with batch grouping."

### 17. Cron Part 9a/9b Split
- **Doc says:** Two separate parts (9a: Stripe reconciliation, 9b: Orphan order detection)
- **Code:** Single Part 9 combining both operations
- **Severity:** STALE

---

## P3, Minor / Cosmetic

### 18. Component Count
- Doc says "25 components in src/components/"
- Actual: 21 .tsx files in src/components/ (motion/ subdirectory has 4 more = 25 total if counted individually)
- Ambiguous but not wrong

### 19. Extended Thinking Not Documented
- generate-report uses `thinking: {type: "enabled", budget_tokens: 16000}`
- Temperature incompatible with thinking mode (correctly not set in code, but doc mentions temp 0.3-0.5 for IB sections which is only true for the non-thinking Sonnet calls)

### 20. Supabase PostgREST in Edge Functions
- Edge Functions use raw fetch to `/rest/v1/{table}` instead of @supabase/supabase-js SDK
- Reason: SDK import via esm.sh adds 60-90s cold start (40%+ of 150s timeout budget)
- Not documented, useful for anyone touching Edge Function code

---

## Summary: What Needs to Happen

| Priority | Gap | Effort |
|----------|---, |------, |
| P0 | Fix 5 factual errors (model names, counts, eval teams) | 30 min |
| P1 | Add Engine Architecture section (39 workers, job queue, pipeline) | 2-3 hours |
| P1 | Add External Data Sources section | 1 hour |
| P1 | Add Template System section | 30 min |
| P1 | Add Anti-Hallucination + Expert Reference + Emotional Intelligence sections | 1.5 hours |
| P1 | Add Buyer States section | 30 min |
| P1 | Add Cost Tracking section | 15 min |
| P2 | Reconcile designed vs. implemented evaluation teams | 30 min |
| P2 | Update deliverables-by-tier to v4 | 1 hour |
| P2 | Expand discovery pipeline documentation | 1 hour |
| P3 | Minor fixes (component count, extended thinking, PostgREST note) | 15 min |

**Total estimated effort to bring ARCHITECTURE.md to ~95% accuracy across all 3 projects: ~8-10 hours of focused writing.**

Current doc covers the web app well (~80% accurate for web-only). But it's blind to ~40% of the total system (engine + business frameworks).

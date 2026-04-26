# Worry: Product Tier Data Audit + Tier-Integrity Enforcement

**Date:** 2026-04-25
**Slug:** product-tier-data-audit
**Skill:** worry-to-pristine (auto-mode)
**Status:** Phase 1 (Capture) complete; Phase 3 (Plan drafting) in flight

## Worry (verbatim from Rahim)

> Every paid product tier (Standalone SKUs, Playbook, Case Decoder, Intelligence Brief, X-Ray, War Room, Situation Room) may not be using the best available data we have, AND lower tiers may be matching or outperforming higher tiers in actual rendered output. We have massive data assets (jurisdiction_statutes 4.7k rows, statute_case_law, case_law_references, classified_opinions 33k+, judges 15k+, judge_quotes 15k+, USSC sentencing 27k vars, JUSTFAIR, federal docket cache, officer_external_intel, common_charges) but the generate-report Edge Function may not be wiring them all in, and tier inclusion logic may not be enforcing strict-monotonic value (every higher tier MUST include everything lower tiers get + more). Audit every product top-to-bottom in tier order (highest → lowest), document what data currently flows in, identify enhancement opportunities, and ship tier-integrity fixes. Auto-mode: do not gate on approval.

## Triangulated Experts (Phase 2)

| Domain | Expert | Source | Cache |
|---|---|---|---|
| Tier ladders + value equation + grand slam offers | **Alex Hormozi** | `~/.claude/experts/alex-hormozi.md` | HIT |
| Multi-product positioning, tier differentiation | **April Dunford** | `~/.claude/experts/april-dunford.md` | HIT |
| Cross-tier strategic coherence (CMO orchestration) | **Apex** | `apex` agent | HIT (agent) |

All three .01% triangulated. Cache hit, no WebSearch needed. **Synthesis approach:** Hormozi defines the value-stack invariants (each tier's perceived value MUST justify the price step + ladder MUST be strict-monotonic), Dunford defines the differentiation per tier (each tier sells a different "use case for / against" narrative), Apex enforces cross-tier coherence (no silos, no internal contradictions).

## Cascade Map (HARD RULE)

| Node | Win |
|---|---|
| Us (Atlas/INAA) | Closes the cross-tier audit gap once and for all; produces a reusable inventory artifact |
| Direct counterparty (paying defendants) | Higher-tier customers actually get more value than lower-tier; lower-tier customers stop accidentally getting "the good stuff" they didn't pay for; trust restored |
| Their downstream (defense attorneys reading reports) | Reports reflect the full data depth we claim on the sales pages — attorneys treat us as serious infrastructure rather than "a glorified search wrapper" |
| Ecosystem (legal-tech category) | Sets a public standard for tier-integrity in legal-data products (post-PR memo can be published) |
| Future-us | Every new SKU added in the future inherits the strict-monotonic test; future seed pipelines know which tier they unlock |
| Adjacent players (other defendant-side legal-tech) | Floor rises; competitors must either match or differentiate — both outcomes good |

No node loses. Cascade-positive.

## Out of Scope (do-not-touch list)

Sibling sessions are actively working in these worktrees. **Do not edit files inside any of these.**
- `_worktrees/test-pollution-{verify,polish,hotfix,work}` — test-isolation sweep
- `oh-statutes-worktree` — OH statute seed Phase 2
- `va-statutes-worktree` — VA statute seed Phase 2
- `usc-v3-worktree` — USC seed expansion v3
- `mandatory-fix-worktree` — already-merged PR #134, may be cleanup
- `recap-cache-web` — federal docket cache
- `score-r1-fixes` — score pipeline R1 fixes
- `*bar-work` (ga, il, mi, oh) — bar-discipline ingest
- `officer-bg-chicago-work` — NYPD CCRB depth
- `pji-work` — CL bulk ingest scripts
- `similar-cases-motion-join-work` — similar-cases motion join
- `warroom-monthly-cron-work` — WR monthly precedent delta
- `wave-pristine-r1-work` — wave pristine R1
- `xray-pji-histogram-work` — XR PJI judge histogram
- `fl-refresh-worktree` — FL refresh cron (already merged PR #120, may be stale)

## Plan Structure

### MAJOR Architectural Finding (read this first)

The Phase 3 audit surfaced a structural reality that reshapes the entire enforcement strategy:

**The Edge Function `supabase/functions/generate-report/index.ts` (7,671 lines) ONLY auto-generates Case Decoder + Intelligence Brief.** Tier branching happens in TWO places only — line 6631 (`tier === "fading"` — unrelated, citation-tier label) and line 7598 (`tier === "intelligence-brief"` — IB upgrade-link banner).

X-Ray, War Room, and Situation Room are all in `tier_generation_config.mode='session'` since 2026-04-24 per zero-hallucination mandate (`ARCHITECTURE.md` row "Per-Tier Generation Mode" + `src/lib/report/mode-config.ts:38-129`). "session" means the operator writes the report by hand at `/api/admin/session-report/[caseId]/route.ts`. The dispatcher (`src/app/api/generate/case-decoder/route.ts:119`) flips the case directly to `awaiting-session-generation` and fires a Telegram handoff via `src/lib/report/dispatch-session.ts:38-63` — no automated generation runs.

The `ImNotAnAttorney-engine` worker (`src/workers/report.mjs`) DOES still run a tier-aware Claude assembly (`tier === 'x-ray' | 'war_room' | 'situation_room'` branches at `report.mjs:30-57`, with `gatherAnalysisData` at `report.mjs:134-388` reading 41-worker outputs) — but the customer never sees it without operator review.

**Implication:** "tier integrity" must be enforced on TWO surfaces, not one:

1. **Data-pipeline surface** — what tables / queries each tier *can* pull (Edge Function for CD + IB; engine `gatherAnalysisData` for X-Ray/WR/SR; tier9-reports/generate.ts switch for Tier 9 standalones). This IS hookable and testable today.
2. **Operator session-brief manifest** — what data sources the operator-session UI exposes per tier when writing X-Ray/WR/SR by hand. This is currently undefined; the plan must define it.

Tier-integrity invariants below distinguish between these surfaces explicitly.

---

### Per-Tier Audit Inventory

#### Tier 1 — Situation Room ($9,997)

**Render path / generation mode:**
- Mode resolution: `src/lib/report/mode-config.ts:47` (`DispatcherTierSlug` union excludes SR — no auto path), default fallback = `'session'`.
- Operator session brief: `src/app/api/admin/session-report/[caseId]/route.ts` (operator writes by hand).
- Engine internal assembly (operator reference, not customer-delivered): `ImNotAnAttorney-engine/src/workers/report.mjs:342-344` (`tier === 'situation_room'` adds attorney perspectives + urgency framing).
- SR-specific tools (LIVE auto-paths within session mode):
  - `src/app/api/generate/motion-drafts/route.ts:1-80` — `ALLOWED_TIERS = {x-ray, war-room, situation-room}` (motion-drafts available for all 3 senior tiers, gated 403 otherwise; line 44).
  - `src/app/api/generate/trial-strategy-memo/route.ts:1-80` — same `ALLOWED_TIERS` set; line 27.

**Sales-page promises** (`src/lib/tiers.ts:229-244`):
- "All deliverables ship within 24-48 hours per stage. Trial Intelligence Operations activate when trial begins."
- `requiresWarRoom: true` (must own WR first).
- `includesTiers: ["case-decoder", "intelligence-brief", "x-ray", "war-room"]`.
- ARCHITECTURE.md line 254 promises Tier 9 additions: "co-defendant divergence, plea discount modeling".

**Data tables currently read** (verifiable via grep against engine `report.mjs:gatherAnalysisData` + the SR-only motion/trial-memo tools):
- All War Room tables (see WR row).
- `case_motions` (full motion drafts via `case_motions` join, `report.mjs:298`).
- `attorney_perspectives` (assumed from `report.mjs:342-344` urgency branch — verify in T2).
- `trial_materials` (cross-exam scripts, voir dire, closing themes per ARCHITECTURE.md line 247).
- `IBVariables.codefendant_divergence_summary` + `IBVariables.plea_discount_curve_summary` slots EXIST in `src/lib/intelligence-brief/variables.ts:171-172` BUT — and this is critical — these fields are passed through IB Phase A/B, NOT Situation Room. **Tier-integrity violation candidate: SR-tier additive Tier 9 data is shaped to be poured into IB's $997 prompt, not into the SR session brief.**

**Concrete data assets NOT currently used by SR session brief** (enhancement opportunities):
- `co_defendant_analysis` table (Tier 9 angle 8 per ARCHITECTURE.md:235): no grep hit in `engine/src/workers/*.mjs` other than the dedicated `cross-case-aggregator.mjs` — verify in T2.
- `plea_discount_curves` table (Tier 9 angle 9): same — verify.
- `bench_jury_divergence` table (currently War Room+ promise per ARCHITECTURE.md:253): need to confirm SR inherits.
- `recap_dockets` (federal docket cache — name TBD pending sibling worktree `recap-cache-web` per worry-doc do-not-touch list): not surfaced in either auto path.

**Tier-integrity violations (suspected, T2 verifies):**
- SR includes nothing from Tier 9 unless the operator manually pulls — no system enforces "every Tier-9 table promised in ARCHITECTURE.md:254 actually appears in the operator session-brief manifest."
- The SR `includesTiers` chain produces 5 cases (CD + IB + X-Ray + WR + SR) per webhook — but the SR primary case still routes through `awaiting-session-generation`, so the customer perceives 4 fast deliverables (CD/IB ship via auto path, then 1 long wait for the bundle plus SR session brief). Tier 9 surface must verify each included case actually fires its own auto path.

---

#### Tier 2 — War Room ($4,997)

**Render path / generation mode:**
- Same as SR: `mode='session'`, operator-written. `mode-config.ts:47` excludes WR from auto path.
- Engine internal assembly: `report.mjs:212-220` (`tier === 'war_room' || tier === 'situation_room'` branch), `report.mjs:232-309` (full Phase 5 case_law_references join with `verified_case_law(confidence_tier, is_good_law, verification_url, verification_urls, holding_validation, age_status, negative_treatment)` — confidence-tier classification logic at lines 261-275).
- WR-specific cron: `worktrees/warroom-monthly-cron-work` (DO-NOT-TOUCH per worry-doc; warroom monthly precedent delta).
- `src/lib/tier9-reports/warroom-precedent-delta.ts` exists (per `Glob src/lib/tier9-reports/*.ts`) with test at `src/lib/tier9-reports/__tests__/warroom-precedent-delta.test.ts`.

**Sales-page promises** (`tiers.ts:213-228`):
- "25-28 days + weekly updates" / "Weekly updates begin immediately after initial delivery."
- `includesTiers: ["case-decoder", "intelligence-brief", "x-ray"]`.
- ARCHITECTURE.md:253: "judge-prosecutor pairing, bench/jury divergence, similar-case matching".

**Data tables currently read:**
- All X-Ray tables (see X-Ray row).
- `case_law_references` ⨯ `verified_case_law` (full join with confidence-tier logic, `report.mjs:236`).
- `case_motions` (full motion drafts, `report.mjs:298+`).
- `prosecution_counter_predictions` (per `engine/src/workers/prosecution-counter-prediction.mjs` — verify whether report.mjs reads it for WR+).
- `trap_tracks` (per `trap-track-assignment.mjs` worker — verify).
- `wave_plans` (per `wave-coordination.mjs` worker — verify).
- `witness_dossiers` (per `witness-dossier.mjs` + `witness-dossier-p2.mjs` workers — verify).
- `judge_prosecutor_pairings`, `bench_jury_divergence`, `case_feature_vectors` — promised in ARCHITECTURE.md but NOT verified in `report.mjs` grep yet (T3 task).
- WR monthly precedent delta cron uses `citation_velocity_criminal` table.

**Concrete data assets NOT currently used:**
- `IBVariables.pairing_matrix_summary`, `IBVariables.bench_jury_divergence_summary`, `IBVariables.similar_case_matches` slots exist (`variables.ts:166-168`) — but they're injected into IB Phase A/B (`prompts.ts:168-172, 263-267, 377-381`), NOT into a WR-specific assembly. Same pattern as SR: Tier-9 War-Room data pours into the $997 product, not the $4,997.
- `appellate_trends` table (Tier 9 angle 7): exists, no grep hit in `report.mjs` (verify in T3).

**Tier-integrity violations (suspected):**
- Same operator-session-manifest gap as SR.
- WR's "weekly updates" cadence is enforced by `worktrees/warroom-monthly-cron-work` (do-not-touch); existence of cron registration + `RisingPrecedentRow`-class data flow must be probed without editing the worktree (read-only via Grep).

---

#### Tier 3 — X-Ray ($2,497)

**Render path / generation mode:**
- Same `mode='session'`. Operator writes by hand.
- Engine internal assembly: `report.mjs:53-54` (`tier === 'x-ray'` branch — "Discovery findings, red flags, targeted questions, timeline, evidence, judge/prosecutor intelligence summary, motion recommendations (summary only — do NOT include full motion drafts). Case law: cite top references only").
- Engine `gatherAnalysisData`:
  - `report.mjs:144-160` (case_intelligence with tier-disclosure filter for `'x-ray' || 'intelligence-brief'`).
  - `report.mjs:193-211` (Phase 4 intelligence — "all tiers ≥ x-ray").
  - `report.mjs:221-230` (Phase 5 partial — `LIMIT 10` for x-ray vs `LIMIT 50` for war-room+).
- X-Ray-only auto-render sections (LIVE — added by E2): `src/app/api/generate/xray-sections/route.ts:1-80`:
  - X1: Federal PJI Cross-Reference (`src/lib/xray-sections/federal-pji-cross-ref.ts`).
  - X2: Full Judge Motion Histogram (`src/lib/xray-sections/judge-motion-histogram.ts`).
- X-Ray sibling (DO-NOT-TOUCH per worry-doc): `xray-pji-histogram-work` worktree.

**Sales-page promises** (`tiers.ts:197-212`):
- "10 business days" delivery.
- `requiresDiscovery: true`.
- `includesTiers: ["case-decoder", "intelligence-brief"]`.
- ARCHITECTURE.md:252: "sentencing outliers, officer reliability".

**Data tables currently read:**
- All IB tables (via included IB case).
- `case_intelligence` (filtered on disclosure_level + verified rows, `report.mjs:162-176`).
- `trial_materials` (`report.mjs:178-191`, all tiers).
- `intelligence_findings` (Phase 4, `report.mjs:193-211`).
- `motion_recommendations` (`report.mjs:221-230`, top 10 for x-ray).
- `case_law_references` (no `verified_case_law` join for X-Ray — engine reads top refs only — `report.mjs:53` "case law: cite top references only").
- `judge_intelligence` (per `engine/src/workers/judge-intelligence.mjs` — verify in T4).
- `prosecutor_research` (per `engine/src/workers/prosecutor-research.mjs` — verify).
- X-Ray-specific via xray-sections: `pattern_jury_instructions` (X1) + `judge_profiles` motion histogram (X2).

**Concrete data assets NOT currently used:**
- `sentencing_distributions` Tier-9 outlier flagging promised in ARCHITECTURE.md:252: `IBVariables.sentencing_outlier_flags` slot exists at `variables.ts:162` — wired only into IB Phase A/B (`prompts.ts:488-492`). **Same Tier-9-flows-into-IB-not-X-Ray pattern.**
- `officer_reliability` table promised in ARCHITECTURE.md:252: `IBVariables.officer_reliability_crosscase` slot exists at `variables.ts:163` — unused in `prompts.ts` grep. **Verifiable orphan slot.**

**Tier-integrity violations (suspected):**
- Tier 9 "X-Ray adds: sentencing outliers, officer reliability" (ARCHITECTURE.md:252) is contradicted by code: the sentencing-outlier slot only renders inside IB; the officer-reliability slot is dead code in `variables.ts`. Either the spec is wrong or the wiring is missing — a tier-integrity test forces resolution.

---

#### Tier 4 — Intelligence Brief ($997)

**Render path / generation mode:**
- Mode resolution: `mode-config.ts:47` includes `'intelligence-brief'`. Per ARCHITECTURE.md line 58: "CD + IB + X-Ray + War Room + Situation Room flipped to `session` 2026-04-24". So IB is also session-mode now (auto path is dormant but still ships in `generate-report/index.ts`).
- Auto path (when mode flips back):
  - Phase A: `generate-report/index.ts:4530-4732` (`handleIBPhaseA` — 5 parallel calls).
  - Phase B: `generate-report/index.ts:4734-5130` (`handleIBPhaseB` — 4 sequential calls including Appendix F via `buildTier9DataAppendix`).
  - Variables: `src/lib/intelligence-brief/variables.ts` (~250 lines).
  - Prompts: `src/lib/intelligence-brief/prompts.ts` — 9 builders + `PHASE_B_BUILDERS` array at line 1192 includes 4 entries ending with `buildTier9DataAppendix` (Appendix F).
  - Render: `src/lib/intelligence-brief/render.ts` (HTML).
- IB judge-research staging: `src/app/api/generate/intelligence-brief/judge-research/route.ts`.
- IB intake handoff: 2-phase intake per ARCHITECTURE.md:213.

**Sales-page promises** (`tiers.ts:182-196`):
- "72 hours" total.
- `includesTiers: ["case-decoder"]`.
- ARCHITECTURE.md:255: baseline upgrades = "judge quotes, appeal correlations".

**Data tables currently read** (auto path — when mode='api'):
- All CD tables (via included CD case).
- IB Phase A/B injects:
  - `judge_demographics` + `sentencing_distributions` + `outcome_benchmarks` (JUSTFAIR, federal-judge-only) — `generate-report/index.ts:4611-4634, 4815-4847`.
  - `charge_type_top_authorities` — `generate-report/index.ts:5517, 6264, 6495` (Appendices G + H + Live Authority Map).
  - `citation_velocity_criminal` — Appendix G/H rising precedents.
  - `judge_profiles` — appellate-motion-authored pattern, `generate-report/index.ts:5904`.
  - `entities_judges` — disambiguation, `generate-report/index.ts:6221`.
  - `federal_sentencing_distributions` — `generate-report/index.ts:5774`.
  - `pattern_jury_instructions` (federal PJI cascade).
- IB Tier-9 data slots wired into `prompts.ts`:
  - `bench_jury_divergence_summary` (line 168).
  - `similar_case_matches` (line 263).
  - `pairing_matrix_summary` (line 377).
  - `sentencing_outlier_flags` (line 488).
  - `judge_quote_library` + `appellate_trends_summary` (lines 743+749).
- Defense intelligence: `src/lib/defense-intelligence/query.ts:queryDefenseIntelligence` (called from `generate-report/index.ts` at `fetchDefenseIntelligenceForIB` line 5271).

**Concrete data assets NOT currently used:**
- `co_defendant_analysis`, `plea_discount_curves` — slots `codefendant_divergence_summary` + `plea_discount_curve_summary` exist at `variables.ts:171-172` BUT are documented as "Tier 9, Situation Room" only and have NO grep hit in `prompts.ts`. Either wire them in (and re-tier them) or delete the orphan slots.
- `officer_reliability_crosscase` slot (`variables.ts:163`) — unwired.
- `jurisdiction_courts` — only used for IB Section 5 court inventory (verify in T5).

**Tier-integrity violations:**
- IB pulls in Tier-9 data that ARCHITECTURE.md promises only at WR / SR levels (the `pairing_matrix_summary`, `bench_jury_divergence_summary`, `similar_case_matches`). Either ARCHITECTURE.md is wrong, the gates inside `prompts.ts` (`v.pairing_matrix_summary ? ...` ternaries at lines 168/263/377) are missing tier checks, or — most likely — the slot is supposed to be tier-conditional but `extractVariables` populates it for IB. **One auto-graded test will resolve this.**

---

#### Tier 5 — Case Decoder ($197)

**Render path / generation mode:**
- Same `'session'` mode flip 2026-04-24 (ARCHITECTURE.md:58).
- Auto path (when flipped back to `'api'`):
  - `src/app/api/generate/case-decoder/route.ts:51-119` (dispatcher, fire-and-forget to Edge Function).
  - `generate-report/index.ts:2908-3725` (`buildUserPrompt`).
  - `generate-report/index.ts:3726-3798` (`callClaudeAPI` — Opus extended thinking).

**Sales-page promises** (`tiers.ts:167-181`):
- "48 hours" / priority "Same-day (4 hours)".
- `includesTiers: []` (no inclusion).

**Data tables currently read** (`generate-report/index.ts`):
- `cases` + `intakes` (via `supabaseSelect` calls, lines 2908+).
- `charge_types` + `experts` (`getChargeContext`, line 2103).
- `jurisdiction_statutes` (line 2130, 2581) — strategic enrichment 2026-04-07.
- `case_law_references` (line 2563, pre_research only).
- `statute_case_law` (fallback, line 2591, joined via charge_slug + jurisdiction).
- `wex_definitions` (per code comment line 2521).
- `judge_profiles` (line 2624 — only when judge name provided, but CD intake doesn't always have one).
- `sentencing_distributions` + `outcome_benchmarks` (JUSTFAIR sentencing context, lines 2944-2955).
- `entities_statutes` (Phase 2 cite-tag whitelist).
- `v_entity_confidence` matview (Phase 2 verification badges).
- `defendant_profile` + `case_intelligence` (via `fetchDefendantProfileBlock` + `fetchCaseIntelligenceBlock`, lines 2746+2833).

**Concrete data assets NOT currently used:**
- `judge_quotes` (15K+ rows per worry doc). Promised at "all tiers" in ARCHITECTURE.md:255 ("baseline upgrades — judge quotes"). NO grep hit in CD code path. **Verifiable miss.**
- `classified_opinions` (33K+ rows) — only used downstream of `classify-case-law.mjs` script. CD reads from the projected `case_law_references` / `statute_case_law` tables, never directly from `classified_opinions`.
- `officer_external_intel` — only Tier 9 (Officer Background Check) reads this.
- `common_charges` — verify usage; suspected dead in CD path.
- `appellate_trends` — promised baseline ARCHITECTURE.md:255, no grep hit.

**Tier-integrity violations:**
- "Baseline upgrades (all tiers): judge quotes, appeal correlations" (ARCHITECTURE.md:255) is provably violated for CD + IB. Either drop the "all tiers" claim or wire judge_quotes + appellate_trends into CD prompt.

---

#### Tier 6 — Playbook ($127–$147)

**Render path:**
- Pure copy-driven static MDX-style render via `src/lib/playbook-configs.ts` (8 configs, ~100 lines/config schema at lines 14-89). Single component `PlaybookSalesPage` consumes a `PlaybookConfig`.
- Delivered as PDF via `download_token`; no DB-backed personalization per buyer.

**Sales-page promises** (`tiers.ts:33-166`, 8 entries — `dui-first-offense`, `drug-possession`, `probation-violation`, `white-collar`, `sex-offense`, `federal-criminal`, `drug-trafficking`, `self-defense`):
- "Instant download" / "Your playbook is delivered instantly to your email after purchase."
- `includesTiers: []`.
- `live: true` for all 8.

**Data tables read:** NONE. This is static copy.

**Tier-integrity question:** Playbook's value-stack must NOT exceed Case Decoder's per Hormozi monotonicity. Currently a $127 playbook has:
- 26 questions + breathalyzer checklist + case stage roadmap + red flag checklist + attorney scorecard (per `tiers.ts:97`).
- Static reference content.

CD ($197) must offer MORE than playbook → MORE means: personalized to actual case facts, statute_case_law for that defendant's jurisdiction, judge profile when available, JUSTFAIR sentencing context, charge_specific_data rendering. T6 verifies this is true via test fixture comparing CD output for a synthetic case vs the playbook PDF for the same charge.

---

#### Tier 7 — Standalone SKUs ($47–$497)

**Render path:**
- All Tier-9 data-driven SKUs route through `src/lib/tier9-reports/generate.ts:97-557` (switch statement on `slug` at lines 145-477).
- Other standalones (research products $97–$497) route through `src/app/api/generate/standalone/route.ts` (separate path — uses Claude API, NOT Tier-9 tables).

**Active data-driven SKUs** (per `tier9-reports/generate.ts` switch, with table dependencies):
| SKU | Price | Tables read |
|---|---|---|
| `judge-report-card` | $197 | `queryJudgeReportCard` + `queryDefenseIntelligence` + `queryJustfairJudge` + `querySentencingFingerprint` (lines 146-183) |
| `officer-background-check` | $97 | `queryOfficerBackground` (line 185-200; reads cross-case from CL classified opinions) |
| `similar-cases-analyzer` | $297 | `querySimilarCases` + `queryDefenseIntelligence` + USSC matview augmentation `queryBucket`/`queryDistrictDisplay` (lines 202-272) |
| `district-court-intelligence` (Courthouse $147) | $147 | `queryCourthouseIntelligence` (line 274-297) |
| `federal-sentencing-distribution` | $297 | `queryDistribution` + `queryDistrictDisplay` (line 299-356) |
| `motion-success-report` | $197 | `queryMotionSuccessReport` (line 358-375) |
| `arrest-survival-kit` | $47 | `queryArrestSurvivalKit` (line 377-385) |
| `federal-jury-instruction-brief` | $97 | `queryFederalJuryBrief` (line 387-414, federal-only gate) |
| `precedent-watchlist` | $47 | `queryPrecedentWatchlist` + `buildVelocitySnapshot` + 30-day drip seed (line 416-458) |
| `charge-authority-pack` | $97 | `queryChargeAuthorityPack` (line 460-476) |

**Tier-integrity questions for standalones:**
- A buyer who buys 4 standalones for ~$641 (judge-report-card + officer-bg + similar-cases + courthouse) gets MORE distinct table coverage than the Case Decoder $197 buyer. By Hormozi's value-stack rule that's fine (because they paid 3.3× more), but the X-Ray buyer at $2,497 should ALSO get all of this PLUS more — and currently doesn't unless the operator manually pulls these queries during the session brief.

---

### Data Asset Inventory

> Row counts are READ-ONLY: do NOT execute writes. Use `psql -c "SELECT count(*) FROM <table>"` or PostgREST `?select=count` head request.

| Table | Suggested probe | Used by tiers (verified file:line) | Bound into auto path? |
|---|---|---|---|
| `jurisdiction_statutes` | `?select=count` HEAD | CD (`generate-report/index.ts:2130, 2581`); IB transitively via Appendix G/H | Yes (CD + IB) |
| `statute_case_law` | same | CD (`generate-report/index.ts:2591`) | Yes (CD only) |
| `case_law_references` | same | CD (`index.ts:2563`); IB Phase A/B; engine WR/SR (`report.mjs:236`) | Yes |
| `verified_case_law` (join target) | same | engine WR/SR only (`report.mjs:236`) | Engine-only |
| `classified_opinions` | same | Tier 9 standalones only (officer-bg, motion-success, similar-cases) | NO for CD/IB |
| `judges` | same | Indirectly via `judge_profiles`; `judge_demographics` for federal | Partial |
| `judge_quotes` | same | NOT FOUND in CD/IB grep — `IBVariables.judge_quote_library` slot exists but no fetch wiring | ORPHAN slot |
| `judge_profiles` | same | CD (`index.ts:2624` conditional); IB (`index.ts:5904`); X-Ray X2 histogram | Yes |
| `judge_demographics` | same | CD JUSTFAIR (`index.ts:2944`); IB Phase A/B (`index.ts:4611, 4815`) | Yes |
| `judge_sentencing_demographics` | same | (Verify — not grepped yet) | Unknown |
| `officer_external_intel` | same | Tier 9 `arrest-survival-kit` + `officer-background-check` | Tier 9 only |
| `common_charges` | same | (Verify — suspected unused in tier paths) | Unknown |
| `jurisdiction_courts` | same | (Verify in T5) | Unknown |
| `entities_statutes` | same | Phase 2 cite-tag whitelist (CD + IB) | Yes |
| `entities_judges` | same | IB disambiguation (`index.ts:6221`) | Yes (IB) |
| `sentencing_distributions` | same | CD JUSTFAIR; IB Phase A/B | Yes |
| `outcome_benchmarks` | same | CD JUSTFAIR; IB Phase A/B | Yes |
| `federal_sentencing_distributions` | same | IB (`index.ts:5774`); Tier-9 FSD SKU | Yes |
| `charge_type_top_authorities` | same | IB Appendix G/H/Live Authority Map (`index.ts:5517, 6264, 6495`); Tier-9 `charge-authority-pack` | Yes (IB + Tier 9) |
| `citation_velocity_criminal` | same | IB Appendix G/H; Tier-9 `precedent-watchlist`; WR monthly cron | Yes |
| `judge_prosecutor_pairings` | same | `IBVariables.pairing_matrix_summary` slot — verify whether `extractVariables` populates it | Partial |
| `case_feature_vectors` | same | Tier-9 `similar-cases-analyzer` only | Tier 9 only |
| `bench_jury_divergence` | same | `IBVariables.bench_jury_divergence_summary` slot — verify | Partial |
| `officer_reliability` | same | `IBVariables.officer_reliability_crosscase` slot — UNWIRED | ORPHAN slot |
| `appellate_trends` | same | NO grep hit in `prompts.ts` despite `IBVariables.appellate_trends_summary` slot | ORPHAN slot |
| `co_defendant_analysis` | same | `IBVariables.codefendant_divergence_summary` slot — UNWIRED | ORPHAN slot |
| `plea_discount_curves` | same | `IBVariables.plea_discount_curve_summary` slot — UNWIRED | ORPHAN slot |
| `pattern_jury_instructions` | same | X-Ray X1 (`xray-sections/federal-pji-cross-ref.ts`); IB (PJI cascade) | Yes |
| `recap_dockets` (federal docket cache, name TBD) | same | Sibling worktree `recap-cache-web` (do-not-touch) — read-only verify table name in T2 | Sibling work |
| `v_entity_confidence` matview | same | Phase 2 cite-tag verification (CD + IB report HTML transform) | Yes |
| `cases` | n/a | All tiers | Yes |
| `intakes` | n/a | All tiers | Yes |
| `processing_jobs` | n/a | Engine-side only (X-Ray/WR/SR) | Engine |
| `score_aggregates` | n/a | Score quiz (free), not tier-paid | n/a |
| `defendant_profile` | n/a | CD (`fetchDefendantProfileBlock`, `index.ts:2746`); IB | Yes |
| `case_intelligence` | n/a | CD; X-Ray (engine `report.mjs:144-176`) | Yes |
| `trial_materials` | n/a | All engine tiers (`report.mjs:178-191`) | Yes |
| `intelligence_findings` (Phase 4) | n/a | X-Ray+ engine path (`report.mjs:193-211`) | Yes |
| `motion_recommendations` | n/a | X-Ray (top 10) + WR/SR (top 50) per `report.mjs:221-230` | Yes |
| `case_motions` | n/a | WR/SR only — full motion drafts (`report.mjs:298+`) | Yes |
| `motion_drafts_*` (live LLM-generated) | n/a | `/api/generate/motion-drafts/route.ts` for X-Ray/WR/SR | Yes (LIVE) |
| `trial_strategy_memo` (live LLM-generated) | n/a | `/api/generate/trial-strategy-memo/route.ts` for X-Ray/WR/SR | Yes (LIVE) |

**Net new findings:**
- 4 ORPHAN slots in `IBVariables`: `judge_quote_library`, `officer_reliability_crosscase`, `codefendant_divergence_summary`, `plea_discount_curve_summary`. Either delete or wire.
- `appellate_trends_summary` slot also suspected orphan — verify in T5.
- 5 promised "all-tiers baseline" data assets (per ARCHITECTURE.md:255) NOT in CD path: judge_quotes, appellate_trends.

---

### Tier-Integrity Invariants (Hormozi value-equation grounded)

Citation: `~/.claude/experts/alex-hormozi.md` — "Value Equation: Dream Outcome × Likelihood ÷ (Time × Effort). Each tier in a ladder MUST monotonically increase value and the higher tier MUST include everything lower tiers offer plus meaningful new value, or the buyer perceives the higher tier as a tax."

**INV-1 (Inclusion-superset):** For every tier T and its `includesTiers` chain, the union of data tables read by T's auto path + included-case auto paths MUST be a superset of any single included tier's data tables. Operationalized as: `dataSourcesFor(T) ⊇ dataSourcesFor(T_included_i)` for every i. **Why Hormozi:** if SR doesn't strictly include WR, the buyer's $5,000 step-up has zero verifiable Dream Outcome lift.

**INV-2 (Strict-monotonic distinct-source count, paid tiers ≥ Case Decoder):** Distinct named data tables read MUST monotonically increase across the upgrade path: CD ≤ IB ≤ X-Ray ≤ WR ≤ SR. Operationalized as integer counter from a static analyzer over the auto-path code. **Why Hormozi:** monotonic value lift is the single most-violated grand-slam-offer rule when tiers are added incrementally.

**INV-3 (Promised-data parity):** Every data asset claimed in ARCHITECTURE.md (lines 250-263 + 320-322) for tier T MUST appear in T's render path OR T's session-brief manifest. Source of truth = `ARCHITECTURE.md`. **Why Hormozi:** Likelihood (verification confidence) collapses if marketing copy promises data the report doesn't deliver.

**INV-4 (No-orphan-slots):** Every typed field in `IBVariables` interface MUST either be (a) populated by a code path in `extractVariables`/`handleIBPhaseA`/`handleIBPhaseB`, or (b) deleted. Found 4–5 orphans during this audit. **Why Hormozi:** dead slots = future contractor sees the slot, assumes the data flows, builds downstream against ghosts → Effort goes UP, Likelihood DOWN.

**INV-5 (Tier-conditional data gates):** When a data slot is gated for tier ≥ X (per ARCHITECTURE.md), the populating code path MUST guard on `tier >= X` (or equivalent inclusion check). Currently several Tier-9 slots ride into IB without a guard. Either re-tier the spec or add the guard. **Why Hormozi:** if IB ($997) ships SR-only data, SR ($9,997) is no longer differentiated → ladder collapses to a single product and CRO model breaks.

**INV-6 (Standalone-vs-tier coverage):** A buyer who purchases standalone Tier-9 SKUs covering domain D MUST NOT receive richer D-domain data than a higher-paid main-tier buyer would receive for the same case. (E.g., judge-report-card $197 buyer must not get more judge data than IB $997 buyer.) **Why Hormozi:** product-line cannibalization rule — when a $197 SKU outperforms the $997 product on its own dimension, the $997 buyer rationally regrets.

**INV-7 (Operator session-brief manifest parity):** When a tier is in `mode='session'` (currently CD/IB/X-Ray/WR/SR per ARCHITECTURE.md:58), the operator session UI MUST surface every data table promised by INV-3 for that tier. **Why Hormozi:** a $9,997 SR buyer can't tell if Time/Effort dropped by 80% if the operator has to manually remember which 23 tables to query.

**INV-8 (No-hallucinated-legal-data — every cited row sourced):** All legal claims rendered MUST trace to `source_urls[]`-bearing rows (per `~/.claude/rules/no-hallucinated-legal-data.md`). Already enforced in PR #115 entity-whitelist filter — codify as a tier-integrity test that fails if any cite-tag in a tier's output points to a row with empty `source_urls`. **Why Hormozi:** Likelihood goes to zero if a citation is fabricated; entire ladder collapses.

---

### Numbered Tasks

Each task is GRADEABLE: binary done-iff condition stated. Tasks 2–9 are read-only audits (no PR per task — they feed the audit artifact). Tasks 10–17 are PRs.

**Dependency order:** T1 → T2 → ... → T9 → T10 → T11–T17 (T11–T17 can ship in parallel after T10 lands).

#### T1 — Build the tier-integrity invariant test suite (Vitest)
- **Files:** `src/lib/tiers/__tests__/tier-integrity.test.ts` (new); `src/lib/tiers/tier-data-manifest.ts` (new — declarative source of truth describing which tables each tier surfaces).
- **Blast radius:** 2 new files, no existing-file edits.
- **Done iff:** `npm test -- tier-integrity` exits 0 AND the test file contains 8 `describe()` blocks named `INV-1`..`INV-8` AND each describe contains ≥1 `it()` that asserts the invariant against the new manifest. Initial run can have failing assertions (red tests document gaps); test FILE existence + structure is the gate.
- **PR count:** 1.
- **Depends on:** none.

#### T2 — Audit Situation Room
- **Files (read-only):** `ImNotAnAttorney-engine/src/workers/report.mjs`, `src/app/api/generate/motion-drafts/route.ts`, `src/app/api/generate/trial-strategy-memo/route.ts`, `src/app/api/admin/session-report/[caseId]/route.ts`, all `src/lib/tier9-reports/warroom-precedent-delta.ts` (read sibling-worktree headers ONLY for table name confirmation; do NOT edit).
- **Blast radius:** appends T2 section to a NEW audit artifact at `docs/plans/2026-04-25-worry-product-tier-data-audit-artifact.md`.
- **Done iff:** artifact contains a "Situation Room" section listing every table SR's auto+session paths read (verified via Grep in this repo + engine repo) AND every table SR is *promised* (per ARCHITECTURE.md lines 250-263) AND the diff (promised − actual) named explicitly.
- **PR count:** 0 (audit only).
- **Depends on:** T1.

#### T3 — Audit War Room (same shape as T2)
- **Done iff:** artifact contains "War Room" section with promised vs actual table inventory + diff.
- **PR count:** 0. **Depends on:** T2.

#### T4 — Audit X-Ray (same shape, includes engine `report.mjs` x-ray branch + xray-sections + tier 9 `coverage.ts:queryArrestSurvivalKit` if shared)
- **Done iff:** artifact contains "X-Ray" section with the same shape AND an explicit verdict on whether `IBVariables.sentencing_outlier_flags` and `IBVariables.officer_reliability_crosscase` orphans should ship to X-Ray render path or be deleted.
- **PR count:** 0. **Depends on:** T3.

#### T5 — Audit Intelligence Brief
- **Done iff:** artifact contains "Intelligence Brief" section with: full Phase A + Phase B fetch inventory, every IBVariables slot mapped to either a populating code path or marked ORPHAN, and a verdict on whether each IB-tier Tier 9 slot should be gated by tier (INV-5).
- **PR count:** 0. **Depends on:** T4.

#### T6 — Audit Case Decoder
- **Done iff:** artifact contains "Case Decoder" section listing every fetch in `buildUserPrompt`, `fetchLegalResearchData`, `fetchDefendantProfileBlock`, `fetchCaseIntelligenceBlock` AND a verdict on whether `judge_quotes` + `appellate_trends` baseline-promise gap should be patched in CD or the promise downgraded in ARCHITECTURE.md.
- **PR count:** 0. **Depends on:** T5.

#### T7 — Audit Playbook static configs
- **Files (read-only):** `src/lib/playbook-configs.ts`, all 8 `playbook-configs.ts`-referenced exports.
- **Done iff:** artifact contains "Playbook" section confirming zero DB reads AND a documented value-stack delta proving why $197 CD strictly outperforms $147 playbook on Hormozi's 4 dimensions (with specific table citations).
- **PR count:** 0. **Depends on:** T6.

#### T8 — Audit Standalone SKUs (Tier 9 + research products)
- **Done iff:** artifact contains a table per active SKU: name, price, render path, table dependencies. AND a verdict per SKU on whether it overlaps with a higher-tier promise without that higher tier inheriting the data (INV-6).
- **PR count:** 0. **Depends on:** T7.

#### T9 — Compile findings into tier-integrity manifest
- **Files:** `src/lib/tiers/tier-data-manifest.ts` (the file created in T1 — populate with concrete arrays per tier of: required tables, optional tables, promised tables, missing tables).
- **Done iff:** running `npm test -- tier-integrity` shows the per-invariant pass/fail counts AND every failure has a corresponding row in T9 (no surprises). Failing assertions are EXPECTED at this stage; the gate is COMPLETENESS.
- **PR count:** 1.
- **Depends on:** T8.

#### T10 — Wire orphan IBVariables slots OR delete (the cleanup PR)
- **Files:** `src/lib/intelligence-brief/variables.ts`, `src/lib/intelligence-brief/prompts.ts`, `supabase/functions/generate-report/index.ts` (only the Phase A/B helpers, not the global SYSTEM_PROMPT).
- **Decision per orphan (per T5 verdicts):** wire OR delete. No "leave-for-later" allowed.
- **Done iff:** every interface field in `IBVariables` has either a populating fetch in Phase A/B OR is removed from the interface. Re-run T1 test suite — INV-4 must now PASS.
- **PR count:** 1.
- **Depends on:** T9.

#### T11 — Tier-integrity enforcement: Case Decoder boundary (PR per integrity boundary)
- **Files:** `src/lib/tiers/__tests__/tier-integrity.test.ts` (extend), `supabase/functions/generate-report/index.ts` (only `buildUserPrompt` if a fetch needs adding for judge_quotes / appellate_trends per T6 verdict), `ARCHITECTURE.md` (downgrade promise if T6 verdict was "remove from spec").
- **Done iff:** INV-1 + INV-2 + INV-3 PASS for the CD boundary AND no other invariant regresses.
- **PR count:** 1. **Depends on:** T10.

#### T12 — Tier-integrity enforcement: Intelligence Brief boundary
- Same shape; targets IB boundary. Files: `src/lib/intelligence-brief/prompts.ts` (add tier-conditional gates per INV-5), `tier-integrity.test.ts`, possibly `ARCHITECTURE.md`.
- **Done iff:** INV-1+2+3+5 PASS for IB.
- **PR count:** 1. **Depends on:** T11.

#### T13 — Tier-integrity enforcement: X-Ray boundary
- Surface a manifest of what `/api/generate/xray-sections` exposes plus what the engine `report.mjs` x-ray branch reads. Add a session-brief-manifest fixture that codifies INV-7 for X-Ray.
- **Files:** `src/lib/tiers/x-ray-session-manifest.ts` (new), `tier-integrity.test.ts`, possibly minor edit to `xray-sections/*.ts` if T4 found a missing fetch.
- **Done iff:** INV-1+2+3+5+7 PASS for X-Ray.
- **PR count:** 1. **Depends on:** T12.

#### T14 — Tier-integrity enforcement: War Room boundary
- Same shape. Adds `src/lib/tiers/war-room-session-manifest.ts`.
- **Done iff:** INV-1+2+3+5+7 PASS for WR.
- **PR count:** 1. **Depends on:** T13.

#### T15 — Tier-integrity enforcement: Situation Room boundary
- Same shape. Adds `src/lib/tiers/situation-room-session-manifest.ts`.
- **Done iff:** INV-1+2+3+5+7 PASS for SR.
- **PR count:** 1. **Depends on:** T14.

#### T16 — Standalone-vs-tier coverage enforcement (INV-6)
- **Files:** `src/lib/tiers/__tests__/tier-integrity.test.ts` (extend), the affected standalone OR the affected tier's manifest entry — pick one per overlap surfaced in T8.
- **Done iff:** INV-6 PASSES for every standalone SKU active per `STANDALONE_PRODUCTS` (`src/lib/products.ts`).
- **PR count:** 1. **Depends on:** T15.

#### T17 — Verification-URL enforcement test for tier-paid output (INV-8)
- **Files:** `src/lib/tiers/__tests__/tier-integrity-no-hallucinated.test.ts` (new), reusing `entity-whitelist.ts` already shipped in PR #115. Test asserts a render-time fixture for each tier filters out cite tags pointing to rows with empty `source_urls`.
- **Done iff:** INV-8 PASSES per tier in test runner; existing PR #115 entity-whitelist filter is the runtime enforcement, this test locks the contract.
- **PR count:** 1. **Depends on:** T16.

---

### Success Criteria

Every criterion is binary PASS/FAIL on independent re-read. Re-graded by spec-critic.

- **SC-1:** PASS iff `npm test -- tier-integrity` exits 0 after T17 ships AND coverage report shows ≥1 assertion per `INV-1` through `INV-8` × ≥1 assertion per tier (CD, IB, X-Ray, WR, SR) — ≥40 distinct assertions total.
- **SC-2:** PASS iff `Grep -n "tier === " src/lib/intelligence-brief/prompts.ts | wc -l` returns ≥3 (currently 0 — IB-tier slots are tier-agnostic per audit, INV-5 enforcement adds explicit tier guards).
- **SC-3:** PASS iff for each of the 5 named slots `judge_quote_library`, `officer_reliability_crosscase`, `codefendant_divergence_summary`, `plea_discount_curve_summary`, `appellate_trends_summary`: `Grep -n "<slot>\s*[:=]" supabase/functions/generate-report/index.ts src/lib/intelligence-brief/prompts.ts` returns ≥1 line OR the slot does not appear in `Grep -n "<slot>" src/lib/intelligence-brief/variables.ts`.
- **SC-4:** PASS iff `src/lib/tiers/tier-data-manifest.ts` exists AND exports a `TIER_DATA_MANIFEST` const-typed `Record<TierSlug, { tables: readonly string[]; promisedTables: readonly string[]; sessionBriefTables: readonly string[] }>` covering all 5 service tiers.
- **SC-5:** PASS iff `docs/plans/2026-04-25-worry-product-tier-data-audit-artifact.md` exists AND contains 7 sections (Situation Room / War Room / X-Ray / Intelligence Brief / Case Decoder / Playbook / Standalone SKUs) AND each section has subsections: "Tables read", "Tables promised", "Diff (promised − actual)", "Verdict".
- **SC-6:** PASS iff `Grep -n "X-Ray adds\|War Room adds\|Situation Room adds\|Baseline upgrades" ARCHITECTURE.md` lines and the manifest in SC-4 are byte-for-byte consistent on every tier-data promise — verified by a Vitest test reading both files. Test name = `architecture-md-parity.test.ts`.
- **SC-7:** PASS iff for every paid main-tier T (CD/IB/X-Ray/WR/SR), `len(TIER_DATA_MANIFEST[T].tables) >= len(TIER_DATA_MANIFEST[T_lower].tables) + 1` for the immediately-lower main tier — encoded as INV-2 assertion.
- **SC-8:** PASS iff for every standalone SKU S in `STANDALONE_PRODUCTS` where `S.upsellTier` is set, the data tables S reads MUST be a SUBSET of `TIER_DATA_MANIFEST[S.upsellTier].tables` — encoded as INV-6 assertion.
- **SC-9:** PASS iff after T10 lands, for every field name X declared between `// Tier 9` and the next top-level `interface`/`}` boundary in `src/lib/intelligence-brief/variables.ts`, `Grep -n "v\\.X\\b" src/lib/intelligence-brief/prompts.ts` returns ≥1 line. The T10 PR description must enumerate the X-list explicitly so this criterion is checkable line-by-line.
- **SC-10:** PASS iff for every PR P in T10–T17, `gh pr view <P> --json body` body contains literal substring `Artifact verdict: T<n>` (where T<n> is the upstream artifact task) AND ≥1 line matching regex `INV-\d+ before=\d+ after=\d+` per invariant the PR claims to move.
- **SC-11:** PASS iff zero file under any worktree listed in the worry doc's "Out of Scope (do-not-touch list)" appears in any T10–T17 PR diff (`gh pr diff <num> --name-only | Grep -E "_worktrees|*-worktree"` returns 0 lines).
- **SC-12:** PASS iff the post-ship inventory artifact (T9 output) records exact row counts for the 6 most-load-bearing tables (jurisdiction_statutes, statute_case_law, case_law_references, classified_opinions, judges, judge_quotes) — verified via `?select=count` HEAD requests captured in artifact.

---

### Out of Scope (Tracked for Future PRs)

| Surface | Why deferred | Owner / Tracker |
|---|---|---|
| Federal docket cache table integration | Active sibling worktree `recap-cache-web` (do-not-touch). Read-only verify table name in T2 — actual wiring into X-Ray/WR/SR session brief blocks on that worktree merging. | Track via existing worktree |
| Engine worker tier-aware refactor | The engine's `report.mjs` is a separate repo; its tier-integrity invariants would need their own audit pass + a second `tier-integrity.test.ts` shipped in `ImNotAnAttorney-engine`. | New worry doc, parallel scope |
| Operator session-brief UI build | T13–T15 ship MANIFESTS only (data structures). Actual UI changes to `src/app/api/admin/session-report/[caseId]/route.ts` to render the manifest belong to a UX-design pass. | Follow-up PR after T15 |
| Tier-9 SKU pricing rebalance | If T16 surfaces standalone overlap with main-tier promises, the fix could be either (a) inherit data into the higher tier, (b) re-price the standalone, (c) delist the standalone. (a) is in scope here; (b)+(c) are pricing decisions for Rahim | Decision tree appended to T16 PR |
| Playbook personalization | Currently zero DB reads (T7). Personalizing playbooks against jurisdiction_statutes is a Hormozi-positive direction but doubles the playbook surface area. | New worry doc |
| Re-tiering Tier-9 slots that landed in IB | If T5 verdict says "$997 IB shouldn't have SR-only Tier-9 data," removing it from IB is a CRO regression (current IB customers see the data and would lose it). Migration path: dual-tier slot for 90 days, deprecate after. | T12 PR description; track for 2026-Q3 |
| Engine repo's parallel `tier_generation_config` reads | Engine doesn't currently read mode-config; if the engine's auto path is ever resurrected, it must respect mode='session'. Requires engine-side guard. | New ImNotAnAttorney-engine worry doc |
| Auto-flip from session→api for tier where verifiable-opus path is built | ARCHITECTURE.md:58 mentions "verified-opus replacement path queued for a separate rebuild." When that rebuild ships, all the per-tier auto paths re-light and INV-3 testing must extend to them. | Reference the rebuild plan |
| Phase 2 cite-tag whitelist coverage gap per tier | PR #115 added `entity-whitelist.ts`. INV-8 (T17) tests it. But each tier's render path may emit cite tags from sources whitelist doesn't yet cover (e.g., X-Ray engine output) — a separate per-tier cite-tag conformance pass. | New PR after T17 |


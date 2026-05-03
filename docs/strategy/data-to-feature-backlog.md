# Data-to-Feature Backlog — Leverage on 188M Already-Loaded Rows

> **Date:** 2026-05-02
> **Scope:** Customer-visible features INAA's products could ship from data
> ALREADY loaded but not yet consumed at any product surface. NO new ingest,
> NO new datasets, NO API top-ups.
> **Methodology:** Cross-reference `docs/data-sources/INVENTORY.md` (21 sources,
> ~187M rows) with current product consumption surfaces (`src/lib/tiers.ts`,
> `src/lib/intelligence-brief/prompts.ts`, `src/lib/playbook-configs.ts`,
> Tier 9 standalone SKUs). Flag every dataset that is loaded-but-unused or
> loaded-but-underused at the product surface.
> **Framework:** Hormozi value equation —
> `Value = (Dream Outcome × Perceived Likelihood) / (Time Delay × Effort)`.
> Cached profile: `~/.claude/experts/alex-hormozi.md`. Each ticket maps lift
> to one or more of the four levers. Crisis-buyer lens applied per
> `feedback-crisis-buyer-lens-mandatory.md`.
> **Architectural invariants honored:** every ticket inherits the 14
> invariants from `ARCHITECTURE.md` — UPL eval gate, service-role-only DB
> access, Phase 2 cite-tag sanitizer, verification-URL HARD rule for legal
> data, per-tier generation mode (`session` for CD/IB/X-Ray/WR/SR until the
> verified-opus rebuild lands).

---

## §1 — Loaded data inventory snapshot

Top 15 highest-volume datasets, with current product consumption mapped per
SKU. `Y` = at least one prompt builder, query helper, view, or component
already references it. `n` = loaded but unused. `~` = referenced but the
data slice that's exposed is a tiny fraction of what's loaded.

| # | Dataset (table) | Rows | Playbooks | CD | IB | X-Ray | War Room | Sit Room | JRC | OBC | SimC | FSDR | FJIB | CIP | MSR | ASK | PW | CAP |
|---|---|---:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| 1 | `cl_opinions` (CourtListener bulk opinions, ~50GB on disk) | ~10M+ | n | n | ~ | ~ | ~ | n | n | n | ~ | n | n | n | n | n | n | ~ |
| 2 | `classified_opinions` (mechanical extraction over CL bulk) | 1,462,909 | n | ~ | ~ | ~ | ~ | n | n | n | ~ | n | n | n | n | n | n | ~ |
| 3 | `cl_citation_map` (citation graph) | ~76.9M | n | n | n | n | n | n | n | n | n | n | n | n | n | n | n | n |
| 4 | `cl_dockets` (federal docket headers + entries) | ~71M | n | n | ~ | ~ | ~ | n | n | n | n | n | n | n | n | n | n | n |
| 5 | `police_stops` (Stanford Open Policing) | ~250M (state-loaded subset ~187M) | Y (DUI) | n | n | ~ | n | n | n | n | n | n | n | n | n | n | n | n |
| 6 | `cl_parentheticals` | ~6.3M | n | n | n | n | n | n | n | n | n | n | n | n | n | n | n | n |
| 7 | `vera_incarceration` | ~1.9M | n | n | n | n | ~ | n | n | n | n | n | n | Y | n | n | n | n |
| 8 | `ussc_sentencing_all` (USSC FY13–FY24) | ~819,248 | n | n | ~ | Y | Y | Y | Y | n | n | Y | n | n | n | n | n | n |
| 9 | `nypd_ccrb_allegations` | ~370K | n | n | n | ~ | n | n | n | Y | n | n | n | n | n | n | n | n |
| 10 | `chicago_cpd_complaints` | ~250K | n | n | n | ~ | n | n | n | Y | n | n | n | n | n | n | n | n |
| 11 | `judge_quotes` (108K unlinked + 15,652 linked) | ~64,730 (15,652 linked) | n | n | ~ | Y | Y | n | Y | n | n | n | n | n | n | n | n | n |
| 12 | `entities_statutes` (49 states + DC + Federal) | ~48,500 | Y | Y | Y | Y | Y | Y | n | n | n | n | n | n | n | Y | Y | Y |
| 13 | `attorney_discipline_events` (51 jurisdictions) | ~37,387 | n | n | ~ | ~ | ~ | n | n | n | n | n | n | n | n | n | n | n |
| 14 | `fars_*` (NHTSA fatalities) | ~36K/yr × 30+ yrs ≈ 2.5M | Y (DUI) | n | n | ~ | n | n | n | n | n | n | n | n | n | n | n | n |
| 15 | `pattern_jury_instructions` (11 of 13 circuits) | ~2,139 | n | n | Y | Y | Y | n | n | n | n | n | Y | n | n | n | n | n |

**Headline gap:** 9 of the top 15 datasets have only `n` or `~` consumption
across the entire 24-SKU product line. That's the leverage surface this
backlog targets.

Tier abbreviations: CD = Case Decoder · IB = Intelligence Brief · JRC = Judge
Question Brief (legacy slug `judge-report-card`) · OBC = Officer Background
Check · SimC = Similar Cases Analyzer · FSDR = Federal Sentencing
Distribution Report · FJIB = Federal Jury Instruction Brief · CIP =
Courthouse Intelligence Pack · MSR = Motion Success Report · ASK = Arrest
Survival Kit · PW = Precedent Watchlist · CAP = Charge Authority Pack.

---

## §2 — Backlog tickets

### TICKET-1: Overruled-Cases Warning Layer (citation-graph-driven)
- **Tier(s) impacted**: IB, X-Ray, War Room, Charge Authority Pack, Precedent Watchlist
- **Data source(s)**: `cl_citation_map` (~76.9M edges), `case_law` (~3,407), `classified_opinions` (~1.46M)
- **Customer-visible value**: When a report cites or surfaces a case, append a colored badge — green "still good law," yellow "questioned by N later opinions," red "overruled by X in YEAR." Mercer voice: "Three of the cases your prosecutor is leaning on were quietly weakened in the last four years. They probably haven't checked."
- **Hormozi value-equation lift**:
  - Dream Outcome: defendant catches a citation that opposing counsel still treats as live — direct attack vector
  - Perceived Likelihood: turns "we have legal research" into "we have *current* legal research" — hard differentiator vs. attorney's stale binder
  - Time Delay: unchanged
  - Effort/Sacrifice: unchanged
- **Implementation surface**: new SQL view `v_case_law_treatment` (degree-1 negative-treatment count over `cl_citation_map` joined to a treatment-classifier; can start with a simple "cites_in" rollup), new render component `<TreatmentBadge>`, hook into IB `buildLegalOptions` + Charge Authority Pack resolver. Must respect Phase 2 cite-tag sanitizer (Architectural Invariant #12) — badge metadata flows through `v_entity_confidence` not as raw HTML.
- **Effort estimate**: M (1-2 days for v1 with binary good/bad badge; degree-2 graph walk = L)
- **Impact score**: HIGH — citation-graph is INAA's largest-by-rows untouched dataset; binary good/bad treatment is the single most asked question of any cited case
- **Blocked-by**: TICKET-9 (need at least cluster-id linkage on case_law rows; verify before starting)
- **Acceptance criteria**:
  - Every case citation rendered in IB, X-Ray, CAP, PW gets one of {green, yellow, red, gray-unknown}
  - Treatment classifier defined in a single SQL function, callable from any prompt builder
  - "Last verified" date stamped on every badge
  - Anti-hallucination (Invariant #13): badges never assert without `cl_citation_map` row evidence + `source_urls[]` populated; gray = absence of evidence
  - Performance: badge resolution adds <100ms to report generation
  - Per-tier mode: renders in `session` mode operator HTML composer too, not only API path

### TICKET-2: Judge Disposition-Time Benchmarks (federal docket headers)
- **Tier(s) impacted**: Judge Question Brief ($197), IB, X-Ray
- **Data source(s)**: `cl_dockets` (~71M)
- **Customer-visible value**: "Judges in your district close criminal cases in a median of N days; your judge runs 1.4× the median." Mercer voice: "Your judge takes longer than 73% of the bench. That's not random — it's how she works. Plan for it."
- **Hormozi value-equation lift**:
  - Dream Outcome: defendant gets a realistic timeline expectation, reduces panic-driven plea acceptance from "this is dragging on, just take the deal"
  - Perceived Likelihood: hard number per judge ID = the report obviously could not be guessed
  - Time Delay: unchanged
  - Effort/Sacrifice: unchanged
- **Implementation surface**: new matview `judge_disposition_stats` (judge_id × case_type → median/p25/p75 days from filing → terminal disposition), wire into JRC resolver + IB Court Prep section. Per `cl-bulk-data-defensive` rule #12 use winners-pattern materialization to keep sort width tight on the 71M-row pass.
- **Effort estimate**: M (1-2 days)
- **Impact score**: HIGH — JRC's #1 weakness today is "feels like all judges look alike"; this is the differentiator
- **Blocked-by**: none (`cl_dockets` is loaded; just needs the matview)
- **Acceptance criteria**:
  - Matview built with median + p25 + p75 + sample-size N per (judge_id, nature_of_suit-or-charge_class)
  - JRC report renders the percentile band with N disclosed
  - District comparison ("your district median = X days")
  - Coverage gate: only render when N ≥ 30; below that, fall back to district-level
  - Refresh cadence: weekly cron via cron-job.org with `acquireCronLock` (Invariant #3)

### TICKET-3: Motion-Success Per Judge Per Motion Type (federal docket entries)
- **Tier(s) impacted**: Motion Success Report ($197 — this SKU exists but consumes generic data), JRC, X-Ray
- **Data source(s)**: `cl_dockets` entries field (~71M entries), `pattern_jury_instructions` (cross-ref)
- **Customer-visible value**: "Motion to Suppress in front of Judge X: filed 47 times, granted 6 (12.8%). Compare district median 18.4%." Mercer voice: "This judge denies suppression motions more than her peers. Doesn't mean don't file — means file the right one, with the right hook."
- **Hormozi value-equation lift**:
  - Dream Outcome: turns "we'll fight" into a probability-weighted strategy
  - Perceived Likelihood: numbered counts per motion-type-per-judge — impossible to fake
  - Time Delay: unchanged
  - Effort/Sacrifice: unchanged (already-bought report just gets richer)
- **Implementation surface**: extend `motion_success_*` schema to include judge_id pivot; new matview `motion_outcomes_by_judge`; wire into MSR resolver and JRC. Bulk pass uses COPY-FROM-STDIN per `cl-bulk-data-defensive #18`.
- **Effort estimate**: L (week+ — docket-entry text classification needs regex/keyword pass; coordinate with TICKET-9 charge-extraction unblock)
- **Impact score**: HIGH — MSR is currently a generic district-level report; this is the per-judge upgrade that justifies its $197
- **Blocked-by**: TICKET-9 (DB keepalive fix unlocks the bulk extraction this needs)
- **Acceptance criteria**:
  - 8 canonical motion types classified from docket-entry text
  - Per-judge numerator/denominator surfaced in MSR + JRC
  - District-level fallback when judge sample N<10
  - Anti-hallucination (Invariant #13): never report a percentage without storing judge_id + motion_type + N + source docket-id list with source URL

### TICKET-4: Traffic-Stop Demographic Skew Per County (Stanford Open Policing)
- **Tier(s) impacted**: DUI Playbook, Drug Possession Playbook, X-Ray
- **Data source(s)**: `police_stops` (~250M, ~187M state-loaded)
- **Customer-visible value**: "Black drivers in your county were stopped at 1.8× the population baseline rate in 2022." Mercer voice: "If your stop felt off, the data says you're not imagining it. Three questions to put on the record before suppression goes in."
- **Hormozi value-equation lift**:
  - Dream Outcome: ammunition for a Whren-line stop challenge
  - Perceived Likelihood: county-level published numbers cited from a Stanford dataset = uncoachable credibility
  - Time Delay: unchanged
  - Effort/Sacrifice: unchanged
- **Implementation surface**: new matview `police_stop_demographic_skew` (county × race × year → ratio vs. baseline census), new section in DUI Playbook config (`src/lib/playbook-configs.ts`), X-Ray "stop validity" subsection
- **Effort estimate**: M (1-2 days; the 187M-row scan needs winners pattern + ACS join)
- **Impact score**: HIGH — DUI is INAA's #1-volume playbook; stop validity is the #1 defense angle
- **Blocked-by**: none
- **Acceptance criteria**:
  - Matview keyed (county_fips, year, race) → stop_count / acs_population
  - DUI playbook renders county-specific paragraph when ratio ≥1.5 OR ≤0.6
  - Charge-Authority Pack on traffic-related charges links the page
  - 27-word UPL-safe phrasing (Invariant #1) reviewed for each render variant — questions not directives

### TICKET-5: Re-Link 108K Orphan Judge Quotes
- **Tier(s) impacted**: Judge Question Brief ($197), IB, X-Ray, War Room weekly digest
- **Data source(s)**: `judge_quotes` (108K unlinked figure refers to pre-link CSV; current `judge_quotes` 64,730 / 15,652 linked baseline — verify before scoping)
- **Customer-visible value**: ~7× larger judge-quote library per JRC, with theme-specific quotes (sentencing, constitutional, evidence). Mercer voice: "Here are eight things the judge has said from the bench about cases like yours. Read them before you walk in."
- **Hormozi value-equation lift**:
  - Dream Outcome: defendant feels they know the judge before walking in
  - Perceived Likelihood: actual quotes with citation = irrefutable
  - Time Delay: unchanged
  - Effort/Sacrifice: unchanged
- **Implementation surface**: re-run `link-quotes-to-judges.mjs` against current `cl_opinions` corpus; populate `judge_profiles.judicial_quotes` JSONB array
- **Effort estimate**: S (hours — the linking script exists; just re-run with the now-larger corpus)
- **Impact score**: HIGH — improves every JRC sale immediately, no schema work
- **Blocked-by**: TICKET-6 keepalive fix recommended (the linking script also streams CSV)
- **Acceptance criteria**:
  - `judge_profiles.judicial_quotes` populated for ≥3,000 judges (up from 492 today)
  - Each quote carries `cluster_id`, `cite`, `topic`, `score`, `source_url`
  - JRC renders top 5 by topic relevance + recency
  - Verification SQL: `SELECT count(*) FROM judge_profiles WHERE jsonb_array_length(judicial_quotes) >= 5`

### TICKET-6: Fix Charge Extraction Keepalive — Unlock 15× Corpus
- **Tier(s) impacted**: All tiers (charge taxonomy substrate); directly unblocks TICKET-3, TICKET-9, TICKET-11
- **Data source(s)**: `classified_opinions` (1,462,909) — 4.3% extraction hit rate today
- **Customer-visible value**: every product surface that filters by `charge_slug` (Similar Cases, Charge Authority Pack, JRC charge-narrowing, IB legal options) gets 15× more corpus. Mercer voice: not directly visible — surfaces in *every* report's "we found N similar cases" line going from "12" to "180+"
- **Hormozi value-equation lift**:
  - Dream Outcome: reports cite N comparable cases; bigger N = stronger evidence
  - Perceived Likelihood: the "based on 180 similar cases" line is the single strongest credibility lever in any report
  - Time Delay: unchanged
  - Effort/Sacrifice: unchanged
- **Implementation surface**: `scripts/lib/db.mjs` add `keepAlive: true, keepAliveInitialDelayMillis: 10000`; rerun `scripts/bulk-extract-charge-types.mjs` over full corpus. Use port 5432 + statement_timeout per `cl-bulk-data-defensive #14, #17`.
- **Effort estimate**: S (hours for the fix; ~12-18hr unattended run for the full extraction pass)
- **Impact score**: HIGH — the cheapest infrastructure-only fix in the backlog with the broadest blast radius
- **Blocked-by**: none — pure infra fix
- **Acceptance criteria**:
  - `db.mjs` keepalive shipped with a unit test
  - Full corpus extraction completes; `charge_types` populated on ≥15× current row count (target: ≥60K rows)
  - Anti-hallucination audit re-run (the 5-table 5-min SQL pass per `INVENTORY.md` "Hard rules in force"); zero new fabrications introduced
  - All 10 charge categories represented in proportions consistent with `entities_statutes` chapter weights

### TICKET-7: Wire Attorney Discipline Into IB ($997) Per Phase 5 v2.4 Plan
- **Tier(s) impacted**: IB ($997), X-Ray, War Room
- **Data source(s)**: `attorney_discipline_events` (~37,387 events, 51 jurisdictions)
- **Customer-visible value**: IB renders a "Public Discipline Record" subsection on the defendant's named attorney (when in dataset). Mercer voice: "We're not telling you whether your attorney is good. We're telling you what's in the public record. Read it. Decide."
- **Hormozi value-equation lift**:
  - Dream Outcome: defendant validates whether their lawyer is the right lawyer — addresses the #1 pre-existing anxiety in the buyer journey
  - Perceived Likelihood: hard public-record evidence = uncoachable credibility, untouchable by attorney pushback
  - Time Delay: unchanged
  - Effort/Sacrifice: unchanged
- **Implementation surface**: per `project-attorney-discipline-wire-v24-converged.md` — Phase 5 execution: prompt-builder addition in `intelligence-brief/prompts.ts` + UPL-banned-phrases parity check (Invariant #1) + per-state field-mapping helper. Note IB is in `session` generation mode today: the operator HTML composer at `/api/admin/session-report/<caseId>` must surface this section, not only the API path.
- **Effort estimate**: M (1-2 days; v2.4 plan has 43 success criteria, 4 swarm rounds — execute, don't redesign)
- **Impact score**: HIGH — the "double-check" buyer segment converts on this single feature; plan is fully written and pristine
- **Blocked-by**: nothing technical — plan v2.4 already swarm-reviewed
- **Acceptance criteria**:
  - Per-state attorney-name lookup helper (handles bar-number variations)
  - IB section renders only when match confidence ≥0.85
  - UPL: phrases like "you should fire your attorney" are banned per `BANNED_PHRASES_BLOCK`; renders information not directives
  - "Last refreshed" timestamp shown
  - 51-jurisdiction parity: never render an absence of record as "clean" without an explicit jurisdiction-coverage gate

### TICKET-8: Per-Charge Verbatim Jury-Instruction Lookup (X-Ray)
- **Tier(s) impacted**: X-Ray ($2,497), Federal Jury Instruction Brief ($97)
- **Data source(s)**: `pattern_jury_instructions` (~2,139 across 11 circuits)
- **Customer-visible value**: X-Ray renders the verbatim circuit-pattern instruction the jury will hear, with the per-element burden-of-proof bullets the prosecution must hit. Mercer voice: "These are the exact words a jury will hear from the bench. Each bullet is a thing they have to prove. Treat each one as a separate fight."
- **Hormozi value-equation lift**:
  - Dream Outcome: defendant understands what has to be proven, gets prepared for cross-prep with attorney
  - Perceived Likelihood: verbatim primary-source text = unimpeachable
  - Time Delay: unchanged
  - Effort/Sacrifice: unchanged
- **Implementation surface**: extend X-Ray prompt-builder to call PJI resolver (already shipped for FJIB) on every charge_slug; new section "What the Jury Will Hear"
- **Effort estimate**: S (the resolver exists; this is mostly wiring + render)
- **Impact score**: MED — already partially exposed via FJIB standalone; X-Ray inclusion increases X-Ray's perceived depth without new infra
- **Blocked-by**: none
- **Acceptance criteria**:
  - X-Ray renders verbatim PJI per charge with circuit attribution
  - Coverage gate: only when defendant's circuit is in {1,3,5,6,7,8,9} per FJIB constraints
  - Fallback: closest-sibling circuit with explicit disclosure (matches FJIB's transparent-fallback pattern)
  - Element-level bulleting per instruction

### TICKET-9: Expand `case_feature_vectors` to FL/TX/CA — Fix Similar Cases SHIPPED-BROKEN
- **Tier(s) impacted**: Similar Cases Analyzer ($297), X-Ray
- **Data source(s)**: `case_feature_vectors` (1,008 rows, currently CO/AL/AR only — explicit gap per Tier 9 readiness memo)
- **Customer-visible value**: SimC actually returns results for the 3 highest-population states. Mercer voice: not user-visible until the silent zero-result fallback flips to actual matches.
- **Hormozi value-equation lift**:
  - Dream Outcome: SimC delivers the promise on the box (k-NN match against your case)
  - Perceived Likelihood: today, FL buyers get a "no matches found" experience — the SKU is shipped-broken for the largest charge cohort
  - Time Delay: unchanged
  - Effort/Sacrifice: unchanged
- **Implementation surface**: extend `scripts/build-case-feature-vectors.mjs` (or sibling) to ingest FL/TX/CA `cl_clusters` rows; backfill `charge_slug` per Phase 0 Tier 9 fix pattern
- **Effort estimate**: M (1-2 days)
- **Impact score**: HIGH — fixes a live SKU that's shipping zero-result reports today for ~40% of buyers
- **Blocked-by**: TICKET-6 (charge extraction unblock improves the source corpus quality)
- **Acceptance criteria**:
  - `case_feature_vectors` row count ≥10× current (target: ≥10K)
  - FL/TX/CA each have ≥1,000 vectors
  - SimC E2E test passes against a known FL DUI case (currently fails with "no matches")
  - Anti-hallucination: every vector traces to a `cl_cluster_id` with verifiable URL

### TICKET-10: Doctrine Extraction Beyond `doctrine_quotes` (Opinion Bodies)
- **Tier(s) impacted**: IB, X-Ray, Charge Authority Pack
- **Data source(s)**: `cl_opinions` (~50GB on disk), `doctrine_quotes` (835 today)
- **Customer-visible value**: "Doctrine spotlight: the [Reasonable Suspicion] doctrine has been cited in N cases in your state in the last 5 years. Three quotes most relevant to yours below." Mercer voice: "This doctrine is the rail your motion will run on. Three quotes from your state's bench, ranked by who's cited most."
- **Hormozi value-equation lift**:
  - Dream Outcome: defendant arms attorney with state-specific doctrine quotes
  - Perceived Likelihood: ranked by judicial citation count = "we read all of them"
  - Time Delay: unchanged
  - Effort/Sacrifice: unchanged
- **Implementation surface**: extend `doctrine_quotes` schema with charge_slug + jurisdiction + relevance_score; new bulk extraction pass over `cl_opinions` text using a 30-doctrine seed taxonomy; new render section in IB
- **Effort estimate**: L (week+ — doctrine taxonomy curation + bulk classification)
- **Impact score**: MED — IB is the tier most starved for state-specific depth; this is the cleanest unlock from already-loaded opinion bodies
- **Blocked-by**: TICKET-6 (DB keepalive); doctrine taxonomy seed (manually curate 30 doctrines, then auto-extend)
- **Acceptance criteria**:
  - `doctrine_quotes` row count ≥50× current (target: ≥40K)
  - Each row carries cluster_id, jurisdiction, charge_slug, doctrine_slug, citation_count, source_url
  - IB renders top-3-doctrine paragraph per case
  - Anti-hallucination (Invariant #13): every quote stored verbatim with source URL

### TICKET-11: County DUI Stats from FARS for Case Decoder
- **Tier(s) impacted**: Case Decoder ($197), DUI Playbook
- **Data source(s)**: `fars_*` (~2.5M crashes over 30+ years)
- **Customer-visible value**: "DUI fatalities per 100K licensed drivers in [county] over the last 5 years: N." Mercer voice: "Your county is in the top quartile for DUI prosecution intensity. That doesn't mean you'll lose. It means know what you're walking into."
- **Hormozi value-equation lift**:
  - Dream Outcome: defendant gets county-specific reality calibration
  - Perceived Likelihood: NHTSA federal dataset = unimpeachable source
  - Time Delay: unchanged
  - Effort/Sacrifice: unchanged
- **Implementation surface**: new matview `fars_county_dui_stats` (county × year → fatalities, fatalities-per-licensed-driver, intensity-percentile-vs-state); wire into Case Decoder + DUI Playbook
- **Effort estimate**: S (hours; FARS is small relative to other datasets)
- **Impact score**: MED — modest unique data per buyer, but deepens CD which is the Tier 2 wedge
- **Blocked-by**: none
- **Acceptance criteria**:
  - Matview built keyed (county_fips, year)
  - CD renders county-specific paragraph for DUI charges
  - DUI Playbook adds county-stat sidebar
  - UPL: framed as informational, never as outcome prediction

### TICKET-12: Judicial Parentheticals — "What This Judge Has Said About Cases Like Yours"
- **Tier(s) impacted**: X-Ray ($2,497), JRC ($197), War Room
- **Data source(s)**: `cl_parentheticals` (~6.3M)
- **Customer-visible value**: For every cited authority in an X-Ray report, surface what later judges *said about that case* in their own opinions. Mercer voice: "Here's what other judges have summarized as the holding of [Case]. Three sentences each. Read them — your judge will have read them too."
- **Hormozi value-equation lift**:
  - Dream Outcome: defendant has the *judicial reading* of the cited case, not just the case itself
  - Perceived Likelihood: parentheticals are the way attorneys *actually* use cases in briefs — surfacing them = "we work like real lawyers"
  - Time Delay: unchanged
  - Effort/Sacrifice: unchanged
- **Implementation surface**: new SQL view `v_parentheticals_for_case` (cluster_id → top-N parentheticals by recency + relevance score); wire into X-Ray + JRC. Rendering must respect Phase 2 cite-tag sanitizer (Invariant #12).
- **Effort estimate**: M (1-2 days)
- **Impact score**: MED-HIGH — `cl_parentheticals` is the 6.3M-row dataset most directly mappable to defense strategy with zero NLP work
- **Blocked-by**: none
- **Acceptance criteria**:
  - View built with relevance scoring (recency × cite-count of citing opinion)
  - Every X-Ray cite renders top-3 parentheticals with attribution
  - JRC adds "what other judges have called this case's holding" subsection
  - Anti-hallucination: parentheticals stored verbatim with source URL

### TICKET-13: NRE Exonerations by State × Charge Bucket
- **Tier(s) impacted**: IB, X-Ray, Charge Authority Pack, blog (data substrate)
- **Data source(s)**: `nre_exonerations` (~3,500)
- **Customer-visible value**: "23 exonerations in your state involved [your charge type]. Most-cited contributing factor: [factor]. Average years served before exoneration: N." Mercer voice: "Innocent people have been convicted of this exact charge in this exact state. Here's what went wrong each time. Don't repeat it."
- **Hormozi value-equation lift**:
  - Dream Outcome: defendant catches a known-pattern failure mode early
  - Perceived Likelihood: NRE is THE authoritative source — academia-grade
  - Time Delay: unchanged
  - Effort/Sacrifice: unchanged
- **Implementation surface**: new matview `nre_state_charge_aggregates` (state × charge_slug → counts, factor distribution, years-served); wire into IB + CAP
- **Effort estimate**: S (NRE is small)
- **Impact score**: MED — emotional + tactical resonance
- **Blocked-by**: none — NRE downloaded 2026-04-14
- **Acceptance criteria**:
  - Matview built; coverage gate: render only when N≥5 in (state × charge)
  - IB renders narrative paragraph; CAP renders sidebar
  - Anti-hallucination: each aggregate links to NRE source URLs
  - UPL: phrased as historical pattern, never predictive

### TICKET-14: NYPD CCRB + Chicago CPD Officer Cross-Case for OBC ($97)
- **Tier(s) impacted**: Officer Background Check ($97), X-Ray
- **Data source(s)**: `nypd_ccrb_allegations` (~370K), `chicago_cpd_complaints` (~250K)
- **Customer-visible value**: For NY/IL defendants, OBC includes the full structured allegation history with disposition + complainant-demographics summary. Mercer voice: "Officer X has 14 prior allegations. 3 substantiated. Pattern is [pattern]. This is on the public record."
- **Hormozi value-equation lift**:
  - Dream Outcome: defendant has impeachment material before cross
  - Perceived Likelihood: civilian-board public record = uncoachable credibility
  - Time Delay: unchanged
  - Effort/Sacrifice: unchanged
- **Implementation surface**: extend OBC resolver to detect NY/IL jurisdiction + officer-name match; new render section "Public Allegation History"
- **Effort estimate**: M (1-2 days; matching is the hard part)
- **Impact score**: MED — only NY/IL coverage initially, but the two highest-population markets for the SKU
- **Blocked-by**: officer-name normalization (badge number is more reliable; use both)
- **Acceptance criteria**:
  - Match confidence ≥0.85 required to render
  - Substantiated/unsubstantiated/exonerated split shown
  - Per-allegation source URL (NYC Open Data / Invisible Institute)
  - Anti-hallucination: never render absence as "clean record" without explicit "no public match found" framing

### TICKET-15: Vera County-Level Incarceration Context for War Room
- **Tier(s) impacted**: War Room ($4,997) weekly digest, Courthouse Intelligence Pack
- **Data source(s)**: `vera_incarceration` (~1.9M county-year cells)
- **Customer-visible value**: War Room weekly digest opens with "Your county's incarceration rate is in the [N]th percentile nationally; trending [up/down] over the last 3 years. The bench responds to this — see this week's sentencing patterns below." Mercer voice: "Your county locks people up at a rate higher than 78% of US counties. That's the room you walk into."
- **Hormozi value-equation lift**:
  - Dream Outcome: defendant + attorney calibrate plea/trial decisions to the actual local environment
  - Perceived Likelihood: Vera is THE academic source on incarceration trends
  - Time Delay: unchanged
  - Effort/Sacrifice: unchanged
- **Implementation surface**: extend War Room weekly digest template + CIP report; new helper `getVeraContext(county_fips)`. Mon 13:00 UTC digest is already wired (cron-job.org jobId 7544044); just add a section to the existing template.
- **Effort estimate**: S
- **Impact score**: MED — strengthens War Room's recurring-revenue narrative
- **Blocked-by**: none
- **Acceptance criteria**:
  - Helper returns latest-year percentile + 3yr trend + national-baseline-comparison
  - Rendered in every War Room Mon 13:00 UTC digest
  - CIP report adds Vera sidebar
  - Source URL stored per number

### TICKET-16: Federal Register Drug-Scheduling Change Windows
- **Tier(s) impacted**: Drug Possession Playbook, Drug Trafficking Playbook, Charge Authority Pack (drug charges)
- **Data source(s)**: `federal_rules` (~1,200 rule sections — includes Federal Register adjacent material per inventory)
- **Customer-visible value**: When a substance was rescheduled (e.g., kratom-related rule changes, hemp/Delta-8 windows, fentanyl analog scheduling), the playbook surfaces the date window and the implication. Mercer voice: "Between [date] and [date] the substance you're charged with sat in a gray zone. That's a question for your attorney to put on the record."
- **Hormozi value-equation lift**:
  - Dream Outcome: defendant catches a scheduling-window angle their attorney hasn't checked
  - Perceived Likelihood: federal rule citations = uncoachable
  - Time Delay: unchanged
  - Effort/Sacrifice: unchanged
- **Implementation surface**: new helper `getDrugSchedulingHistory(substance)` over `federal_rules`; render block in drug playbooks + CAP
- **Effort estimate**: M (substance taxonomy + rule-text classification needed)
- **Impact score**: LOW-MED — narrow buyer segment (drug-charge defendants), but high-leverage for those who fit
- **Blocked-by**: substance taxonomy seed
- **Acceptance criteria**:
  - Helper returns date-windowed scheduling history with rule citations
  - Rendered when defendant's substance is in the taxonomy
  - UPL: never asserts case outcome; surfaces the question
  - Source URLs stored

### TICKET-17: USSC Sentencing Distribution Calibration Across All Tiers
- **Tier(s) impacted**: Case Decoder, IB, X-Ray, JRC, FSDR
- **Data source(s)**: `ussc_sentencing_all` (~819,248)
- **Customer-visible value**: Every report (not just FSDR) renders a sentencing-range distribution chart with the defendant's calculated guideline range positioned. Mercer voice: "The federal range puts you here. The actual sentences in your district last 3 years cluster *here*. Different question, different answer."
- **Hormozi value-equation lift**:
  - Dream Outcome: defendant sees the actual sentencing reality, not the headline range
  - Perceived Likelihood: 819K real sentences = the strongest base-rate evidence INAA owns
  - Time Delay: unchanged
  - Effort/Sacrifice: unchanged
- **Implementation surface**: extract FSDR's distribution helper into a shared `getSentencingDistribution(charge, district)` lib; wire into CD + IB + X-Ray + JRC. Honor `ussc_matview_meta` freshness gate per `/api/data-status` LIVE pattern.
- **Effort estimate**: M (refactor + 4-tier wiring)
- **Impact score**: HIGH — USSC is INAA's most-loaded paid-for dataset; FSDR alone leaves it underused
- **Blocked-by**: USSC FY02-FY12 backfill (queued ~30min compute) — non-blocking; current FY13-FY24 is enough for v1
- **Acceptance criteria**:
  - Shared lib extracted with unit tests
  - Each tier renders the distribution at its appropriate depth (CD = sentence, IB = paragraph + small chart, X-Ray = full chart with percentile, JRC = judge-specific overlay)
  - Coverage gate per district sample size
  - Source: `ussc_matview_meta` freshness gate

### TICKET-18: ACS County Demographics → Jury-Pool Composition Strategy
- **Tier(s) impacted**: IB ($997), War Room
- **Data source(s)**: `acs_county_demographics` (~3,200 counties × variables)
- **Customer-visible value**: IB renders a jury-pool composition snapshot for the defendant's county with implications for voir dire framing. Mercer voice: "Your jury pool is drawn from [county]. Here's the demographic composition. These are 5 questions worth asking during voir dire to surface the bias your attorney needs to know about."
- **Hormozi value-equation lift**:
  - Dream Outcome: defendant + attorney enter voir dire with a written framework
  - Perceived Likelihood: Census ACS = uncoachable federal source
  - Time Delay: unchanged
  - Effort/Sacrifice: unchanged
- **Implementation surface**: new helper `getJuryPoolSnapshot(county_fips)`; new IB section "Voir Dire Framework"; UPL-careful question phrasing per Invariant #1
- **Effort estimate**: M
- **Impact score**: MED — IB needs more state-specific depth; this is one of the cheapest unlocks
- **Blocked-by**: none
- **Acceptance criteria**:
  - Helper returns composition + 5 voir dire questions calibrated to demographic deltas
  - UPL: questions framed as "questions to consider asking" never as directives (banned-phrases parity check)
  - ACS source URL stored
  - Render rate-limited: only when ACS data ≥0.7 county coverage

### TICKET-19: DPIC Capital-Adjacency Triage for Sex Offense + Federal Criminal Playbooks
- **Tier(s) impacted**: Sex Offense Playbook, Federal Criminal Playbook, X-Ray
- **Data source(s)**: `dpic_executions` (~1,500)
- **Customer-visible value**: For charges where the federal or state max is potentially capital (in capital states), the playbook adds a "capital-eligibility check" sidebar with DPIC-derived state context. Mercer voice: "This charge can theoretically reach the capital tier in your state. The last decade of executions in [state] looked like this. Your attorney should be doing this calculation, not us — but here it is."
- **Hormozi value-equation lift**:
  - Dream Outcome: defendant gets early signal on a worst-case stakes question
  - Perceived Likelihood: DPIC is the canonical capital-case source
  - Time Delay: unchanged
  - Effort/Sacrifice: unchanged
- **Implementation surface**: small lookup helper `getCapitalContext(state, charge_class)`; render block in 2 playbooks + X-Ray
- **Effort estimate**: S
- **Impact score**: LOW — narrow buyer segment, but high-stakes when applicable
- **Blocked-by**: none
- **Acceptance criteria**:
  - Helper returns state capital eligibility per charge class + last-decade execution count
  - Renders only when capital eligibility = true
  - UPL: phrased as theoretical/contextual, never predictive
  - Source URLs stored

### TICKET-20: Federal Rules Cross-Reference Layer in IB + X-Ray
- **Tier(s) impacted**: IB ($997), X-Ray ($2,497)
- **Data source(s)**: `federal_rules` (~1,200 rule sections)
- **Customer-visible value**: When the report cites a federal procedural rule (e.g., FRE 404(b), FRCP 16, FRCrP 12), the rule text is rendered inline with subsection-level granularity. Mercer voice: "FRE 404(b) is the rail this evidence rides on. Here's the exact text. Two questions for your attorney about elements 1 and 4."
- **Hormozi value-equation lift**:
  - Dream Outcome: defendant has the verbatim rule text, not a paraphrase
  - Perceived Likelihood: Cornell LII source = canonical
  - Time Delay: unchanged
  - Effort/Sacrifice: unchanged
- **Implementation surface**: new lookup helper `getRuleText(rule_id)`; render component `<RuleInline>`; auto-link rule citations in IB + X-Ray render output. Must thread through Phase 2 cite-tag sanitizer (Invariant #12) — emit through `v_entity_confidence` not raw HTML.
- **Effort estimate**: S
- **Impact score**: LOW-MED — quality-of-rendering improvement; zero new data, zero new prompts
- **Blocked-by**: none
- **Acceptance criteria**:
  - Helper returns subsection-level text with last-amendment date
  - Auto-link regex tested against IB + X-Ray production output
  - Source URLs stored
  - No layout regression

---

## §3 — Tier-by-tier summary

### Tier 1 — Playbooks ($127–$147)
- **Currently exposed**: `entities_statutes` (per-state DUI/drug/etc.), FARS (DUI), Stanford Open Policing (DUI), USSC (federal-tier playbooks), `case_law` cites
- **Backlog tickets that meaningfully expand**: 4, 11, 16, 19
- **Top 3**:
  1. TICKET-4 (traffic-stop demographic skew — DUI is the volume product)
  2. TICKET-11 (FARS county DUI stats — same product, different angle)
  3. TICKET-19 (DPIC capital adjacency — narrow but high-stakes)

### Tier 2 — Case Decoder ($197)
- **Currently exposed**: `entities_statutes`, `classified_opinions`
- **Backlog tickets that meaningfully expand**: 11, 17
- **Top 3**:
  1. TICKET-17 (USSC distribution embed)
  2. TICKET-11 (FARS county DUI)
  3. TICKET-1 (overruled-cases warning — IB-shared)

### Tier 3 — Intelligence Brief ($997)
- **Currently exposed**: above + `attorney_discipline_events` (partial), `pattern_jury_instructions`, `judge_profiles` (jurisdiction-narrowed), `acs_county_demographics`, `federal_rules`
- **Backlog tickets that meaningfully expand**: 1, 7, 10, 13, 17, 18, 20
- **Top 3**:
  1. TICKET-7 (attorney discipline wire — Phase 5 v2.4 plan ready)
  2. TICKET-1 (overruled-cases warning)
  3. TICKET-10 (doctrine extraction)

### Tier 4 — X-Ray ($2,497)
- **Currently exposed**: above + `judge_sentencing_patterns`, `judge_demographics`, partial `officer_reliability`, `case_feature_vectors` (limited states), `cl_opinions` body lookup
- **Backlog tickets that meaningfully expand**: 1, 2, 3, 8, 12, 14, 17, 20
- **Top 3**:
  1. TICKET-3 (motion-success per judge — biggest depth jump)
  2. TICKET-12 (parentheticals — 6.3M-row unlock)
  3. TICKET-2 (judge disposition-time benchmarks)

### Tier 5 — War Room ($4,997)
- **Currently exposed**: above + judge × prosecutor pairing matrix, `vera_incarceration`, weekly digest from `judge_quotes` + new opinions
- **Backlog tickets that meaningfully expand**: 5, 12, 15
- **Top 3**:
  1. TICKET-15 (Vera county incarceration context for digest)
  2. TICKET-5 (re-link 108K orphan judge quotes — feeds digest)
  3. TICKET-12 (parentheticals — feeds weekly intel)

### Tier 9 standalone — Judge Question Brief ($197)
- **Currently exposed**: `judge_profiles` + `judge_sentencing_patterns` + `judicial_quotes`
- **Backlog tickets that meaningfully expand**: 2, 3, 5, 12
- **Top 3**:
  1. TICKET-2 (disposition-time benchmarks)
  2. TICKET-5 (re-link 108K quotes)
  3. TICKET-3 (motion-success per judge)

### Tier 9 standalone — Officer Background Check ($97)
- **Currently exposed**: `officer_reliability` + MPV/WaPo + NYPD CCRB + Chicago CPD (partial)
- **Backlog tickets that meaningfully expand**: 14
- **Top 3**:
  1. TICKET-14 (full NYPD/CPD wire-in)
  2. (pending MPV ingest — out of scope, ingest blocker)
  3. (pending officer-name normalization sub-ticket of #14)

### Tier 9 standalone — Similar Cases Analyzer ($297)
- **Currently exposed**: `case_feature_vectors` + `cl_clusters`
- **Backlog tickets that meaningfully expand**: 6, 9
- **Top 3**:
  1. TICKET-9 (FL/TX/CA expansion — fixes shipped-broken)
  2. TICKET-6 (charge extraction unblock — improves match quality)
  3. TICKET-1 (overruled-cases on returned matches)

---

## §4 — Top 10 across all tiers (the prioritized list)

Sorted by `(Impact × Tier-revenue-weight) / Effort`. Tier-revenue-weight uses
list price × estimated buyer mix; lower-priced higher-volume SKUs get
boosted.

| # | Ticket | Why this is #N |
|--:|---|---|
| 1 | TICKET-6 (Fix Charge Extraction Keepalive) | Cheapest infra fix in the backlog with the broadest blast radius — unlocks 15× corpus across every charge-narrowed surface. S effort, HIGH impact, blocks 3 other tickets. |
| 2 | TICKET-9 (Expand `case_feature_vectors` to FL/TX/CA) | Fixes a $297 SKU that's shipping zero-result reports today for the largest market segment. Direct revenue-loss stop. |
| 3 | TICKET-7 (Wire Attorney Discipline into IB) | Phase 5 v2.4 plan already pristine + swarm-reviewed; M effort, HIGH impact on the $997 tier — pure execution. |
| 4 | TICKET-1 (Overruled-Cases Warning Layer) | 76.9M-row dataset with zero current consumption; binary good/bad badge is the highest-leverage credibility win across IB/X-Ray/CAP/PW simultaneously. |
| 5 | TICKET-2 (Judge Disposition-Time Benchmarks) | Single biggest JRC depth upgrade; cl_dockets is loaded; clean matview pattern. |
| 6 | TICKET-5 (Re-Link 108K Orphan Judge Quotes) | S effort, the linking script exists; immediately enriches every JRC sale + War Room digest. |
| 7 | TICKET-4 (Stanford Open Policing County Skew) | DUI is INAA's volume playbook; stop-validity is the #1 defense angle; 187M-row dataset essentially unused. |
| 8 | TICKET-12 (Parentheticals for X-Ray + JRC) | 6.3M-row dataset, zero NLP work needed (just relevance ranking), maps directly to how attorneys actually use cases. |
| 9 | TICKET-17 (USSC Sentencing Distribution Across Tiers) | USSC is the most-loaded paid-for dataset; FSDR alone underuses it; cross-tier embed multiplies leverage. |
| 10 | TICKET-3 (Motion-Success Per Judge Per Motion Type) | Direct upgrade to live MSR ($197) SKU; L effort but the biggest depth jump for X-Ray; pairs naturally with TICKET-2 matview work. |

---

## §5 — Implementation patterns (reuse, don't reinvent)

Most tickets follow one of these proven shapes. **Every shape inherits the
14 ARCHITECTURE.md invariants.**

- **New prompt-builder section in `src/lib/intelligence-brief/prompts.ts`** —
  add a function alongside `buildCaseRoadmap` / `buildLegalOptions` /
  `buildCaseIntelligence`. Follow the `BANNED_PHRASES_BLOCK` (parity-locked
  to `supabase/functions/generate-report/lib/banned-phrases.ts`) +
  `LEGAL_ACCURACY_RULES` + `ANTI_HALLUCINATION_PERCENTAGES` includes so the
  new section inherits the same UPL + safety scaffolding. Add the section
  to the Phase A or Phase B fan-out per existing pattern. **Note:** CD/IB/
  X-Ray/WR/SR are in `session` generation mode today — operator HTML
  composer at `/api/admin/session-report/<caseId>` must also surface the
  new section, not just the future-API-mode path.
- **New charge-config field in `src/lib/playbook-configs.ts`** — extend
  `PlaybookConfig` interface with the new field; populate per-charge in the
  8 existing configs; render the new block in
  `src/app/playbook/[slug]/page.tsx`.
- **New SQL view / matview in `supabase/migrations/`** — follow the
  `cl-bulk-data-defensive` ruleset: tier-sized `work_mem`, UNLOGGED for
  multi-hour intermediates, `DISTINCT ON` winners for >50M-row sorts,
  tcp_keepalives + statement_timeout per gotcha #17. Concurrent index
  builds serialized per table. Refresh cron via cron-job.org with
  `acquireCronLock` (Invariant #3).
- **New shared lib helper in `src/lib/`** — Tier 9 reports already use a
  `tier9-reports/<sku>.ts` per-SKU file pattern; mirror that shape for
  cross-tier helpers (e.g., `src/lib/sentencing/distribution.ts`). Use
  `createAdminClient()` (service role, Invariant #4) — never anon key.
- **New drip-email module in `src/lib/drip-emails.ts`** — for tickets that
  warrant a follow-up email (e.g., when overruled-cases-warning surfaces a
  newly-overruled cite for an existing PW subscriber). Honor CAN-SPAM
  invariant (#7) — unsubscribe + physical address.
- **New `<Component>` in `src/components/`** — keep server-component-default
  per project conventions; only `'use client'` when interactive (charts).

**Anti-hallucination contract for every ticket** (Invariant #13): any
number / quote / citation rendered must trace to a row with `source_urls[]`
populated. Phase 2 cite-tag transform (Invariant #12) strips spans without
matching `v_entity_confidence` rows — design every render with a matching
entity-confidence row.

---

## §6 — Anti-patterns explicitly NOT in scope

- **New ingest** — this backlog is leverage on existing data only; if a
  ticket needs new ingest (e.g., MPV CSV → DB, NIBRS-FL agency tables),
  it stays in `docs/data-sources/` ingest plans, not here.
- **Speculative features without loaded data backing** — every ticket above
  cites the specific table + row count from INVENTORY.md.
- **Features requiring API access** (Anthropic, OpenAI, paid third-party
  data feeds) — per `feedback-no-api-anywhere.md` LLM work happens via
  session, not API; this backlog intentionally excludes anything requiring
  per-call API spend. CD/IB/X-Ray/WR/SR are in `session` generation mode
  per the per-tier-generation-mode infrastructure.
- **Features requiring manual labeling** — no human-in-loop ops; if a
  ticket needs a taxonomy seed (TICKET-10 doctrine seed, TICKET-16
  substance seed), the seed is one-time curation, not ongoing labeling.
- **Cross-repo work** — these are all `ImNotAnAttorney-web` (or
  `ImNotAnAttorney/apps/web` post-cutover) tickets; engine-side discovery
  pipeline tickets are out of scope.

---

## Cascade check

- **Defendant** — every ticket increases the depth/specificity of what they
  see for the same price (Hormozi value lift without price lift = pure
  Dream Outcome × Perceived Likelihood gain).
- **INAA** — uses sunk-cost data assets (every dataset is already loaded;
  marginal cost = engineering time only).
- **Attorney downstream** — gets better-prepared clients arriving with
  documented questions instead of vibes.
- **Ecosystem** — raises the floor for what defendants expect from any
  legal-intel product; competitors face an inventory gap they can't close
  cheaply.
- **Future-us** — every ticket is incremental on existing surfaces; no
  rewrites, no spaghetti.

No node loses. Cascade-positive across the board.

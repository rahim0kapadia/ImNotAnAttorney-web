# Dormant-Data Wiring Plan (2026-04-25)

Queued from `/audit` run 2026-04-25 (post #107/#111/#112 merge). Scanned 197 product files across `src/lib`, `src/app/api/{generate,tools,intake,cron}`, `supabase/functions`. 48 strategic intelligence-data tables checked.

## Audit Summary
- **WIRED (20)**: judge_*, motion_outcome_rates (39 refs), citation_authority_criminal (26), pji (52), attorneys-lookup (91), USSC similar-cases, sentencing distributions, bench/jury divergence, etc.
- **LIGHT (5)**: motion_success_patterns, defense_theory_outcomes, plea_discount_curves, classified_opinions, scotus_cases — touched in 1-2 places.
- **DORMANT (23)**: split into populated-but-unused vs built-but-empty.

## Populated + Dormant (the wiring opportunities)

| Table | Rows | Highest-impact use |
|-------|------|--------------------|
| `police_stops` | **187,397,678** | Stop Validity Analysis SKU |
| `fars_crashes/persons/vehicles` | 2.67M | Crash Litigation Report SKU |
| `cpd_complaints` + `cpd_officers` | 263K + 37K | Officer BG Check Chicago (in motion per #111) |
| `attorney_discipline_events` | 3,417 | "Your lawyer's CA Bar discipline" inside Case Decoder + IB |
| `federal_register_actions` | 1,752 | "Recent rule changes affecting your charge" in IB |
| `co_defendant_analysis` | 2,065 | War Room + Situation Room IP surfacing |
| `pji_instruction_citations` | 109 | PJI augmentation (base `pji` already wired 52x) |
| `exoneration_patterns` | 17 | Defense-theory examples |
| `ppi_parole_rates` | 136 | Parole/sentencing context |

## Built-but-empty (Phase 3 — population pipeline gap, not product gap)
`cross_case_expert_profiles`, `cross_case_hypothesis_patterns`, `cross_case_prosecution_tactics`, `cross_witness_patterns`, `expert_witness_challenges`, `forensic_lab_profiles`, `lab_report_items`, `judge_conflict_of_interest`, `ao_criminal_by_offense_district`, `data_source_health`. These 10 tables exist in schema but have 0 rows live.

---

## Phase 1 — Enrich existing tiers (hours each)

| # | Item | Wire into | Effort | Value-stack delta |
|---|------|-----------|--------|-------------------|
| 1.1 | `attorney_discipline_events` (3,417 rows) | Case Decoder + IB | 30 min | "Your attorney's CA Bar discipline check" — #1 crisis-buyer fear (Bloomstein trust lens) |
| 1.2 | `co_defendant_analysis` (2,065 rows) | War Room + Situation Room | 1 hr | Surfaces existing War Room IP, justifies $4,997 / $9,997 |
| 1.3 | `pji_instruction_citations` (109 rows) | Federal Jury Instruction Brief + IB | 1 hr | `pji` already wired heavily, citation map = obvious next layer |
| 1.4 | `federal_register_actions` (1,752 rows) | IB charge-specific section | 1 hr | "Recent regulatory changes affecting your charge" |

## Phase 2 — New SKUs from biggest dormant data (1-2 weeks each)

| # | SKU | Data | Pricing | Why |
|---|-----|------|---------|-----|
| 2.1 | **Officer BG Check — Chicago** | `cpd_*` 300K rows | $97 standalone | Already in motion per #111; first-mover, replicate template per major-city dataset |
| 2.2 | **Stop Validity Analysis** | `police_stops` 187M | $297 standalone | DUI/drug specific; no competitor has consolidated 33-state stop data |
| 2.3 | **Crash Litigation Report** | `fars_*` 2.67M | $297 standalone | Vehicular manslaughter, DUI-with-injury; new buyer segment |

## Phase 3 — Pipeline backfill (data ops, not product)
Populate the 10 empty tables. Each needs its own ingest pipeline. NOT covered in this plan; separate triage.

---

## Execution Order
1. **Phase 1.1 first** — smallest blast radius, highest trust signal, validates whether dormant-data wiring is high-ROI (Hormozi value-equation test) before committing to bigger plays.
2. Phase 1.2 → 1.3 → 1.4 in sequence. Each enriches an already-shipped tier.
3. Phase 2.1 (Officer BG Check Chicago) follows — already partially scoped by #111.
4. Phase 2.2 + 2.3 → new-SKU launches, separate brief + landing pages.
5. Phase 3 → after Phase 2.

## Worktree Boundary
Each item runs in its own worktree off `origin/master` per `pattern-worktree-per-pr-from-master`. Sibling-session collision risk on `intelligence-brief/prompts.ts`, `tier9-reports/`, and `playbook-configs.ts` is real (8+ sessions active 2026-04-24/25) — must check sibling worktree branches before each commit.

## Cited Experts
- Hormozi value-equation (Dream Outcome × Likelihood ÷ Time × Effort) — applied to enrichment-vs-new-SKU trade
- Dunford 2026 multi-product positioning — keeps existing tiers central, new SKUs additive
- Bloomstein vulnerability/trust — driving the attorney-discipline-check framing for Phase 1.1
- Internal: `feedback-crisis-buyer-lens-mandatory.md`, `decision-ib-mechanical-matrix.md` (IB renders mechanically; Claude only personalizes)

## Audit Artifact
Audit script: `.tmp/dormant-audit.mjs` (Node-only, no shell deps). Re-run with `node .tmp/dormant-audit.mjs` from repo root for fresh count.

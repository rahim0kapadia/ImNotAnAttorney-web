# Worry: data-orphans tier-B/C — T3-T11 follow-up

Date: 2026-04-30
Source: docs/plans/2026-04-29-worry-data-orphans-product-gaps.md "Deferred to follow-up worry"
Predecessor: PR #26 (T0/T0.5/T0.7/T1/T2/T12) merged commit d774cd02 2026-04-30T05:09:45Z
Triage: WORRY (separate R0 swarm required per predecessor's deferral note)

**Status (2026-04-30, post-R0):** Phase 0 + Phase 1 complete. R0 swarm returned 30 findings (11 CRITICAL) across code-reviewer + security-auditor + april-dunford. Path-2a scope cut adopted: ship T9 this round; T3/T4/T5/T6/T7 deferred to stacked successor worry `data-orphans-tier-b-c-r2`. T8/T10/T11 → schema-cleanup worry per user directive.

**Companion docs:**
- Findings: `2026-04-30-worry-data-orphans-tier-b-c-findings.md`
- Round log: `2026-04-30-worry-data-orphans-tier-b-c-rounds.md`

## Worry Statement

Predecessor plan deferred 9 tasks (T3-T11) covering data orphans not yet wired to product surfaces. Pre-R0 names contained phantom tables (collapsed via migration `20260421a_judge_conflict_of_interest.sql`). Follow-up worry must:
1. Run own R0 swarm against current schema (do NOT trust phantom names from predecessor pre-R0).
2. Re-verify table existence + columns via `information_schema` for every deferred task.
3. Decide per-task: ship | further-defer | drop-as-vestigial.
4. Build feature-flag migration for `case_law_references` per finding C6 (flags are DB rows, not static).

## Inherited Tasks (Phase 0 verdict — predecessor R0 finding C1 was wrong; collapse migration `20260421a_judge_conflict_of_interest.sql` is in tree but never applied to live DB)

| Task | Pre-R0 (suspect) | Phase 0 reality + Path-2a verdict |
|---|---|---|
| T3 | `judge_investments` → IB | `judge_investments` LIVE (414,362 rows). `disclosure_ids ARRAY` only — disclosure URL needs JOIN to `cl_financial_disclosures`. **DEFER** to r2 worry; JOIN shape pinned in findings doc. |
| T4 | `judge_civil_party_conflicts` → IB | `judge_civil_party_conflicts` LIVE (2,565 rows; **100% match_type='exact'**, **100% both URLs**, 439 distinct judges). **DEFER** to r2 worry — needs `entities_judges` resolver (R0 C6), `product-tiers.md` rewrite vs Judge Report Card $197 (R0 D2), UPL phrasing matrix (R0 D3), DENY enum (R0 S3). |
| T5 | `judge_demographic_sentencing` → Sentencing Fingerprint Signal 5 | 2,937 rows, only **2 distinct judges**. **DEFER** — data-coverage blocker. Reopen post-JUSTFAIR ingest expansion. |
| T6 | `classified_opinions` deep slice → X-Ray | 1,462,909 rows; 100% source_urls, 100% `is_good_law=true`, 25% motion_types, 0.003% defense_theories. **DEFER** to r2 worry — narrowed scope (motion_types + holding_text only; drop defense_theories). |
| T7 | `resolved_opinion_authorship` standalone | 432K rows, no source_urls / case_name. **DROP** standalone; ships inline as T6 LEFT JOIN partner in r2. |
| T8 | `case_law` legacy | OUT-OF-SCOPE — schema-cleanup worry per user directive. |
| **T9** | **`case_law_references` feature flag** | **SHIP this round.** Table empty (0 rows). `feature_flags` RLS=true / 0-policies (default-deny ✓). Migration `20260430a_case_law_references_flag.sql` (3-col + ON CONFLICT, prefixed `inaa_*`). 3 read sites gated via `isFeatureEnabled`. |
| T10 | `entities_officers` + `pji_field_validation` | OUT-OF-SCOPE — schema-cleanup worry per user directive. |
| T11 | `case_law_applicability` + `verified_case_law` | OUT-OF-SCOPE — schema-cleanup worry per user directive. |

## Phase 0 — pre-R0 verification gates (COMPLETE 2026-04-30)

Ran:
1. `node apps/web/scripts/diag-data-orphans-schema.mjs --set=tier-bc` — schema for the 5 candidate tables; `judge_conflict_of_interest` returned `table_not_found` (collapse migration unapplied). C10 patch added `total_cases` to T5 candidate column list.
2. T5 coverage probe: 2 distinct judges total, **catastrophic coverage gap** vs >30% threshold → DEFER.
3. T5 UPL phrasing draft: SKIPPED — moved with T5 to r2 worry. (Pre-pitching framing for a deferred task = wasted alignment work.)

Phase 0.5 supplementary probes (`diag-tier-bc-extras.mjs`, `diag-judge-resolver.mjs`) verified jcpc match-class distribution + `entities_judges` resolver shape + `feature_flags` RLS posture. Outputs land in `apps/web/data/audit/` (gitignored).

Full results: see `2026-04-30-worry-data-orphans-tier-b-c-findings.md` and `2026-04-30-worry-data-orphans-tier-b-c-rounds.md`.

## Phase 1 — R0 swarm

3 reviewers minimum:
- code-reviewer (column-existence, source-url guards, no-hallucinated-legal-data compliance)
- security-auditor (HTTPS-only on rendered URLs, tier gating, no PII leak)
- april-dunford (positioning + UPL framing for T5 — operator vs defendant surface)

## Phase 2 — execution

Path-2 default per predecessor pattern: ship the safe subset first (T3/T4/T9 most likely), defer T5/T6 if R0 surfaces structural blockers.

## Cascade

- Defendants: more accurate judge intel (financial conflicts surfaced where verifiable) — UPL-safe.
- Attorneys: backstop receives demographic signal first (T5) — keeps directive language behind professional layer.
- Future-us: schema-cleanup worry can run on T8/T10/T11 after this clears.
- Ecosystem: feature-flag-as-DB-row pattern (T9) becomes precedent for all future gradual rollouts.

## Out of Scope

- Engine-side wiring (separate `ImNotAnAttorney-engine` worry).
- Schema-cleanup worry covering T8/T10/T11 dead tables.
- Operator-portal pairing-matrix page (separate auth-pattern worry per predecessor §3).
- Multi-user War Room access model (separate worry).

## Tracking

Spawn via `/worry-to-pristine` once `worry-data-orphans-tier-b-c` is named primary. Predecessor's R2 swarm log lives at `docs/plans/2026-04-29-worry-data-orphans-product-gaps-rounds.md` — read before R0 to inherit reviewer-alignment context.

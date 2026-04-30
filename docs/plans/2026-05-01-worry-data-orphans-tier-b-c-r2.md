# Worry: data-orphans tier-B/C — r2 (T3/T4/T5/T6/T7)

Date: 2026-05-01
Predecessor: `docs/plans/2026-04-30-worry-data-orphans-tier-b-c.md` (Path-2a — shipped T9 only)
Predecessor R0 swarm: `docs/plans/2026-04-30-worry-data-orphans-tier-b-c-rounds.md` (3 reviewers, 30 findings, 11 CRITICAL — all inheritable guardrails for r2)
Predecessor schema verdicts: `docs/plans/2026-04-30-worry-data-orphans-tier-b-c-findings.md` (Phase 0 already complete; do NOT re-run unless schema drift suspected)
Predecessor merge: monorepo PR #28 squash-merged 2026-04-30T16:09Z (commit `df017131`); migration `20260430a_case_law_references_flag.sql` applied to live DB 2026-04-30 (`inaa_legal_research_case_law_references_enabled`, default off)
Triage: WORRY (single R0 swarm; structural blockers known; one PR per tier)

## Worry Statement

Five inherited tasks deferred from r1 under Path-2a scope cut. Each carries documented blockers and pre-resolved R0 guardrails — r2 is execution work, not re-discovery. Goal: ship T4 first (most viable + highest signal-to-noise), then T6 narrowed (motion_types + holding_text only with T7 inline as LEFT JOIN partner), then T3 (JOIN-shape pinned). T5 stays parked until JUSTFAIR ingest expands.

## Inherited Tasks (carry-over verdicts from r1 Phase 0)

| Task | Verdict + r1 evidence | r2 priority |
|---|---|---|
| **T3** `judge_investments` → IB | LIVE (414,362 rows). Source-URL retrieval requires JOIN `cl_financial_disclosures fd ON fd.id = ANY(ji.disclosure_ids)` (r1 finding C9 pinned shape). | Wave 2 |
| **T4** `judge_civil_party_conflicts` → IB | LIVE (2,565 rows). 100% `match_type='exact'`, 100% both URLs (`disclosure_url`+`case_url`), 439 distinct judges. Most viable Tier-B candidate. | **Wave 1 (ship first)** |
| T5 `judge_demographic_sentencing` → Sentencing Fingerprint Signal 5 | 2,937 rows, only **2 distinct judges**. Coverage gap catastrophic. | PARK (open `worry-justfair-coverage-expansion`; r2 ships nothing) |
| **T6** `classified_opinions` → X-Ray | 1,462,909 rows, 100% source_urls, 25% motion_types, 32% holding_text ≥40c, **drop defense_theories** (38 rows). | Wave 2 (ships with T7 inline) |
| **T7** `resolved_opinion_authorship` (FK-only) | 432,324 rows. No standalone surface. | Wave 2 LEFT JOIN partner inside T6 |

## Inheritable R0 Guardrails (from r1 R0 — DO NOT re-derive)

These survived r1 R0 swarm (cross-reviewer convergence). r2 PRs MUST satisfy all of them; reviewers should reject any r2 PR that re-opens settled ground.

1. **Match-confidence + match_type gate (C5+S1+D3 convergence).** All public surfaces filter `match_type IN ('exact','subsidiary') AND match_confidence ≥ 0.90`. Defense-in-depth even though jcpc is 100% `exact` today.
2. **Per-row source-URL guard (C4+S2 convergence).** Both URLs (where applicable per table) MUST be non-NULL non-empty AND `LIKE 'https://%'`. Two-layer enforcement: SQL filter + render-time skip helper.
3. **DENY enumeration (S3).** Every Tier-B render-site MUST explicitly forbid Case Decoder ($197) + playbooks ($97) from rendering jcpc/financial-conflict data. Sub-tier upsell callouts banned by name.
4. **Tier placement lock (D1+C3 synthesis).** T4 → IB ($997) primary per `product-tiers.md` canonical "Judge intel + accountability research." Migration COMMENTs are non-canonical. T6 → X-Ray ($2,497).
5. **Methodology footer (D4+D8).** Every render-site shows "checked / not found" state per data dimension. Empty ≠ silent.
6. **Render-time HTTPS guard (S10).** Even after SQL HTTPS filter, every URL re-checked at render. Helper returns null for non-https; component skips on null.

## Pre-r2 Required Work (NOT execution — must land FIRST as Wave 0 PRs)

Each is brand/UPL/architecture work that gates T4 — single-session code can't ship without these. Each is its own small PR.

| Wave 0 PR | What | R0 finding |
|---|---|---|
| W0-1 | `entities_judges` resolver: `resolveJudgeCanonicalIdByName(first, last) → uuid \| null` in `apps/web/src/lib/judges/resolve-canonical.ts`. Tests: exact / fuzzy / multi-match / not-found. | C6 |
| W0-2 | `product-tiers.md` slice rewrite: lock `$197 Judge Report Card = STATISTICAL-only` vs `$997 IB = ALL relational/conflict intel`. Audit migration COMMENTs that imply otherwise; correct them. Update `apps/web/.claude/rules/product-tiers.md`. | D2 |
| W0-3 | UPL phrasing matrix in `apps/web/.claude/rules/atti-persona.md` (or new `rules/upl-phrasing-matrix.md` referenced from atti-persona): bands per `match_type ∈ {exact, subsidiary, fuzzy, inferred}`. Only `exact`+`subsidiary` allowed at public render today; matrix locks future ingest drift. | D3 |
| W0-4 | Render helpers: `apps/web/src/lib/legal-data/url-guard.ts` exports `isPublicRenderUrl(url) → bool` (HTTPS + non-empty); `apps/web/src/lib/legal-data/methodology-footer.tsx` exports `<MethodologyFooter dimensions={...} />`. | S10 + D8 |

## Wave 1 — T4 ship (after Wave 0 lands)

PR scope:
1. Add `judge_civil_party_conflicts` fetch to IB pipeline (`supabase/functions/generate-report/index.ts` + corresponding renderer) gated behind `isFeatureEnabled('inaa_judge_civil_party_conflicts_enabled')`. Migration: insert flag row default `is_enabled=true` (rows already verified non-empty + URL-clean per Phase 0).
2. Resolver wired: `cases.judge_name_first/last` → `entities_judges.canonical_id` → jcpc rows.
3. SQL query carries the gate: `match_type IN ('exact','subsidiary') AND match_confidence >= 0.90 AND disclosure_url ~ '^https://' AND case_url ~ '^https://'`.
4. Render: per-row UPL-safe phrasing per W0-3 matrix; `<MethodologyFooter>` populated; URLs wrapped in `isPublicRenderUrl` helper.
5. DENY: `apps/web/src/lib/products/tier-eligibility.ts` (or equivalent) explicitly forbids Case Decoder + playbook tiers from invoking the fetch.
6. Tests: 1 unit (resolver), 1 integration (render with real fixtures), 1 negative (sub-tier blocked).

R0 swarm reviewers: code-reviewer + security-auditor + april-dunford + Reality Checker (per r1 path-2a precedent).

## Wave 2 — T6+T7 ship (after Wave 1 lands clean for ≥48h soak)

PR scope:
1. `classified_opinions` X-Ray slice: motion_types + holding_text dims only; defense_theories dropped (0.003% coverage).
2. T7 inline as `LEFT JOIN resolved_opinion_authorship USING (cluster_id)` to surface authorship per opinion.
3. Same gate stack: HTTPS-only source_urls, `is_good_law=true` (already 100%), DENY sub-tiers, MethodologyFooter, render helpers.
4. T6-only nuance: `holding_text` length floor (≥40c) at SQL layer to drop noise.
5. New cascade row for T6 (r1 finding C12) + holding_text/motion_types tiering rationale.

## Wave 3 — T3 ship (after Wave 2 soaks)

PR scope:
1. `judge_investments` JOIN: `JOIN cl_financial_disclosures fd ON fd.id = ANY(ji.disclosure_ids)` per r1 C9 pin.
2. URL extraction from `cl_financial_disclosures.filepath_*` columns (verify column names at execution; do NOT assume).
3. Same Wave-1 gate stack + UPL matrix.

## Out of Scope for r2

- T5 (parked under `worry-justfair-coverage-expansion`).
- T8/T10/T11 (covered by `worry-schema-cleanup-vestigials`).
- Engine-side wiring (separate `ImNotAnAttorney-engine` worry).
- Operator-portal pairing-matrix UI (separate auth-pattern worry per r1 §"Out of Scope").

## Cascade

| Node | Specific win |
|---|---|
| Us (INAA) | 3 inherited data orphans become buyer-visible (T3+T4+T6+T7); Wave-0 helpers compound across future tier-B work. |
| Direct counterparty (IB $997 / X-Ray $2,497 buyers) | Recusal-grounds + opinion-classification intel where verifiable; UPL-safe; URL-cited. |
| Their downstream (defendant + attorney) | Motion-strategy inputs grounded in source-cited records, not synthesis. |
| Future-us | Wave 0 helpers (`resolveJudgeCanonicalIdByName`, `isPublicRenderUrl`, `<MethodologyFooter>`) make Wave 4+ tier-B work mechanical. |
| Ecosystem | Trust floor rises for legal-data products that surface conflict intel with verification URLs. |

No node loses. Cascade-positive.

## Tracking

Spawn via `/worry-to-pristine` with `worry-data-orphans-tier-b-c-r2` as primary. Read `2026-04-30-worry-data-orphans-tier-b-c-rounds.md` BEFORE R0 to inherit reviewer-alignment context (cross-reviewer convergent CRITICALs are pre-resolved).

Worktree: branch `feat/data-orphans-tier-bc-r2` off `origin/master` in monorepo (`apps/web` deploy-active per cutover note). Each Wave (W0-1..W3) ships as its own PR.

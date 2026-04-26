# Product Audit — Deferred Items (2026-04-26)

Source: `docs/plans/2026-04-26-product-audit-triage.md` triage matrix + 3 PR review-finding passes.

This session shipped P0-P2 + P4 fixes via 3 PRs (#162 #163 #164). The items below are legitimately out-of-scope for those PRs and need their own work.

## D1 — Judge Report Card pivot (P0#2 from audit)
**Status:** Cached decision exists at `~/.claude/projects/<inaa-key>/memory/decision_judge_report_card_pivot_sentencing_fingerprint.md`. Apex diagnosed 2026-04-22: 4 sentencing signals replace the recusal-on-stock framing. Plan also exists in `docs/plans/2026-04-23-judge-fingerprint-v3-pristine.md` (PR #61 referenced).

**Why deferred:** multi-week pivot (rename + reframe + UX + email-template updates). Out of scope for this hygiene/audit pass. The HYGIENE PR did NOT flip judge-report-card to isActive:false because the product is still shipping district-aggregate fallbacks that have measurable value — but the marketing claim ("per-judge") needs to align with the data state.

**Next session unlock prompt:**
```
Execute the Judge Report Card → Judge Question Brief pivot
per cached decision in memory + plan docs/plans/2026-04-23-judge-fingerprint-v3-pristine.md.
Update marketing copy, sales page, email templates to "Question Brief" framing.
Hold $197 price.
```

## D2 — `similar-cases-analyzer` data backfill (P1#6)
**Status:** $297 LIVE. `plea_discount_curves` covers only 13/51 states. `outcome_benchmarks` is national-only.

**Why deferred:** data ingestion is hours of work + dependencies on USSC/state data sources. Not a code fix.

**Next session unlock:**
```
Plan + execute plea_discount_curves backfill for the 38 missing states
(or gate purchase to available-state list as interim).
Source: USSC FY2014-2023 + state-court sentencing aggregates per state's
public reporting.
```

## D3 — `officer-background-check` data coverage (P1#7)
**Status:** $97 LIVE. 99% of `officer_external_intel` rows are GA+CA+AZ. 17 states have <50 rows.

**Why deferred:** ingestion work. CPD + NYPD already drove sub-flag products (per cached project memory). Pattern is to extend per state.

**Next session unlock:**
```
Audit officer-external-intel by state coverage. Identify the 5 highest-INAA-traffic
states with worst coverage. Plan ingestion pipelines (FOIA / public records /
agency-misconduct datasets) per state, prioritized by traffic.
```

## D4 — `motion-success-report` schema drift (P3#13)
**Status:** $197 (currently flipped dark via PR #162 fix). `judge_motion_outcome_rates.judge_id` column doesn't exist.

**Why deferred:** schema migration + resolver rewrite. The HYGIENE branch correctly flipped products.ts isActive:false; tiers.ts already had live:false. Stays dark until fixed.

**Next session unlock:**
```
Fix motion-success-report schema drift. Either add judge_id column to
judge_motion_outcome_rates or rewrite the resolver in
src/lib/tier9-reports/motion-success-report.ts:342 to use a different join key.
After schema fix lands, flip both products.ts isActive and tiers.ts live to true.
```

## D5 — `federal-jury-instruction-brief` circuit gap (P3#14)
**Status:** $97 dark. `v_pji_public` empty for circuits 2, 4, 10, 11, DC, FC (6/13).

**Why deferred:** PJI ingestion work for missing circuits.

**Next session unlock:**
```
Plan + execute federal pattern jury instruction ingestion for circuits 2, 4, 10, 11, DC, FC.
Pull from each circuit's published PJI source. After backfill, flip both products.ts
isActive and tiers.ts live to true.
```

## D6 — PR #164 neighboring gap (review WARNING)
**Status:** PR #164 hardened the agency_incidents resolver. Reviewer noted `officerResult.error` in the same file (`src/lib/defense-intelligence/query.ts:506`) is also unhandled — silent swallow if `officer_external_intel` errors.

**Why deferred:** different table, different status type, different test surface. Belongs in its own PR.

**Next session unlock:**
```
Apply the same status-union pattern to officer_external_intel queries.
Add officerStatus union ("ok" | "no_officers" | "data_unavailable").
Update arrest-survival-kit + officer-background-check renderers.
Add tests covering the table-missing case for officer_external_intel.
```

## D7 — UPL disclaimer extraction (PR #163 SUGGESTION S1)
**Status:** PR #163 fallback renderer hardcodes the UPL disclaimer string. Other places use the same string.

**Why deferred:** small refactor PR — extract canonical disclaimer to `@/lib/copy` or similar. Touches multiple files.

**Next session unlock:**
```
Extract the canonical UPL disclaimer ("This report provides legal INFORMATION,
not legal ADVICE. Decisions about how to use this information stay with you.")
to a single source — `@/lib/copy/disclaimers.ts` — and replace all 5+ duplicate
copies in src/app/.
```

## D8 — Sibling-session stomp during PR #163 fix swarm
**Status:** Stash `sibling-session-revert-2026-04-26` in `ImNotAnAttorney-web` contains the EXACT inverse of our PR #163 diff (services routing). A parallel session was rebasing or stashing state and either intentionally reverted our work OR captured the inverse during their own merge prep.

**What's preserved:** `git stash list` in ImNotAnAttorney-web shows 4 stashes. Top 3 are this-session-related, stash@{3} is older `audit-products-hygiene WIP`. None should be auto-popped without inspection.

**Next session unlock:**
```
Audit git stash list in ImNotAnAttorney-web. Read stash@{0} content
(sibling-session-revert-2026-04-26) and confirm it is benign (just an
intermediate stash from a parallel session) vs malicious (actual revert
intent). Drop if benign, escalate to recovery PR if revert intent confirmed.
```

## D9 — PR #164 SUGGESTIONS (minor)
- Trailing newline in `data_unavailable` template literal at `render.ts:2073`. Cosmetic.
- No unit test covering `stateCode` not in `STATE_NAMES` (e.g., typo `"XX"`). Edge case.

**Next session unlock:** roll into D6 PR.

## Cascade
All 9 deferred items have a documented unblock path. None are silently dropped. Each has a concrete next-session prompt.

Pristine-Or-Nothing exception applied: items D1, D2, D3, D4, D5 require data ingestion or multi-week pivots — genuinely out-of-scope for this audit fix pass. D6, D7, D8, D9 are smaller follow-up PRs.

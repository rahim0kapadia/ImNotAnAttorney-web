# Findings — worry data-orphans-product-gaps

> **Cutover note (2026-04-29):** All R0+R1 findings reference relative `src/lib/...` paths. After plan re-target to `ImNotAnAttorney/apps/web/src/...` (Strangler Fig per Sam Newman + Martin Fowler), all findings still apply — apps/web has identical shape at same line numbers (single drift: `requireAdmin` -web:46 → apps/web:54). Findings need no rewrite. Phase 5 executor reads paths as relative to apps/web root.

## Round 0 (Phase 4 plan swarm-review) — 2026-04-29

### Cross-persona converged CRITICAL (highest confidence — multiple reviewers)

**C1. Phantom tables `judge_investments` + `judge_civil_party_conflicts` do not exist as named.**
- Reviewers: code-reviewer f-001, f-002 + security-auditor f-001
- Reality: migration `20260421a_judge_conflict_of_interest.sql` created ONE combined table `judge_conflict_of_interest` with cols `(judge_canonical_id, judge_name, case_canonical_id, case_name, company_holding, holding_value_estimate, disclosure_year, match_confidence, match_type, disclosure_url, case_url)`. Audit-source memo named two tables based on row-count appearances; actual schema has one table with `match_type` discriminator.
- Fix: collapse plan T3+T4 into ONE task "Judicial Conflict Signals" rendering `judge_conflict_of_interest` sliced by `match_type`. Rewrite queries against real columns. Adjust SC-3, SC-4.

**C2. `escapeIlike` helper does NOT exist (T2 PostgREST `.or()` injection vector).**
- Reviewers: code-reviewer f-010 + security-auditor f-002
- Reality: zero matches on `escapeIlike` across `src/`. Officer names from PDF discovery not validated.
- Fix: ADD T0.5 precondition "build `src/lib/util/escape-postgrest-filter.ts` exporting `escapeIlike()` + adversarial vitest". Reference precedent (officer queries in `tier9-reports/query.ts:869` use trgm/normalized columns — preferred over `.or()`).

**C3. Tier-gate function for War Room operator route does NOT exist.**
- Reviewers: code-reviewer f-004 + security-auditor f-004
- Reality: operator route at `src/app/api/operator/cases/[id]/route.ts:20-22` uses `requireAdmin` (X-Admin-Password header) — admin-vs-not, NOT tier-gate.
- Fix: ADD T0.7 precondition "build `src/lib/tier/require-tier.ts` exporting `requireTier(case, minTier)` using `TIER_CORE` ladder rank + adversarial vitest". T1 page MUST call it.

**C4. Hallucinated-legal-data safety filters missing on T3/T4/T5.**
- Reviewer: security-auditor f-003
- Reality: `~/.claude/rules/no-hallucinated-legal-data.md` requires every legal-claim row rendered to have non-empty `source_urls`. T6 has the filter; T3/T4/T5 don't.
- Fix: ADD `.not("source_urls", "eq", "{}")` (or table-equivalent: `disclosure_url IS NOT NULL` on `judge_conflict_of_interest`) to every T3/T4/T5 query. Row-level render guard. Vitest fixture asserting empty-source rows are dropped.

**C5. T5 defamation guard missing (judge_demographic_sentencing canonical_id NULL filter).**
- Reviewer: security-auditor f-005
- Reality: migration `20260423c_judge_fingerprint_safety.sql:67-81` restricts public-read RLS to `judge_canonical_id IS NOT NULL` (93% of rows lack canonical_id link, name-only matching may attach pattern to wrong judge). Plan's T5 query uses service-role admin client which BYPASSES RLS.
- Fix: ADD `.not("judge_canonical_id", "is", null)` to T5 query mirroring public-read RLS. Row-level render guard. Update SC-5.

**C6. T9 feature-flags pattern misuse (runtime DB lookup, not static file).**
- Reviewer: code-reviewer f-009
- Reality: `src/lib/feature-flags.ts:14-47` is a runtime accessor reading `feature_flags` Postgres table. Flags are NOT declared in code — they're rows.
- Fix: REWRITE T9: add migration `INSERT INTO feature_flags(flag_key, is_enabled, tier_scope) VALUES ('legal_research_case_law_references_enabled', false, NULL)`. Update SC-7 to check the migration file + a runtime probe.

**C7. Operator-portal-only delivery contradicts War Room "ongoing intelligence operation" positioning.**
- Reviewer: april-dunford f-003 + f-012
- Reality: T1 routes the matrix to operator portal only. War Room sold as "ongoing intelligence operation with weekly updates" — buyer JTBD is push-delivery.
- Fix: REWRITE T1 delivery — defendant-visible surface gated to War Room tier (e.g., `/my-case/[token]/war-room/pairing-matrix` via existing `report_token` auth path) PLUS weekly Resend digest summarizing delta-since-last-week.

**C8. T3+T4 risk muddying IB market category (Component 5).**
- Reviewer: april-dunford f-004 + f-010
- Reality: adding financial-conflict + civil-party signals shifts IB from "judge intelligence" toward "recusal-motion research." Different buyer triggers, may cannibalize Tier 9 Judge Report Card.
- Fix: explicit segmentation: Judge Report Card ($197) owns BEHAVIORAL signals; IB ($997) owns STRUCTURAL signals. Frame collapsed T3/T4 in IB as "Judge Background Signals" sub-section, NOT "Recusal Motion Prep."

**C9. T5 Signal 5 coverage + UPL framing risk.**
- Reviewer: april-dunford f-005 + f-008
- Reality: sparse data; k-anonymity floor 11 means most race cohorts won't render. Asymmetric rendering silently communicates a bias signal. UPL risk on demographic-sentencing direct to defendants.
- Fix: route Signal 5 to attorney/operator surface FIRST. Coverage audit (T0 sub-task) — what % of cases have a judge with ≥11 cases per race cohort? If <30%, defer. Tier should be War Room (sentencing-phase data). UPL-safe framing per `brand-voice.md`.

### CRITICAL — additional (single-persona, codebase-verified)

**C10. T2 X-Ray single-officer "see Officer BG Check ($97)" callout = active downgrade messaging.**
- Reviewer: april-dunford f-002
- Fix: render full single-officer depth + co-occurrence baseline scan (zero co-occurrences IS a finding). Drop comparative callout.

**C11. SC-11 path / file-prefix verification needed.**
- Reviewer: code-reviewer f-005
- Fix: confirm actual path of `claude-issues-<sessionKey>.json` writer (likely `%TEMP%/claude-hooks/`). Update SC-11 OR remove if `enforce-fix-all` Stop hook already enforces.

### WARNING — codebase + positioning

W1. T1 typed-contract / cross-repo import unprecedented (code-reviewer f-007 + f-008). Drop "engine-side consumption" framing.
W2. T6 query column verification gap (code-reviewer f-006). T0 must enumerate columns per task and FAIL early.
W3. T1 `caseJudgeIds` resolver undefined (code-reviewer f-003).
W4. T2 PostgREST `.or()` filter shape fragile (code-reviewer f-010). Use trgm pattern.
W5. T7 deferral incoherent — `resolved_opinion_authorship` LEFT JOIN missing from T6 (code-reviewer f-011).
W6. T3/T4/T5 line-anchor injection points unstable (code-reviewer f-012). Use grep markers.
W7. T12 PROMISE_TO_TABLE mapping undefined (code-reviewer f-013).
W8. Cascade table line 89 says T5 surfaces in IB; T5 is gated Tier 9+X-Ray (code-reviewer f-016) — per C9, T5 moves to War Room.
W9. T2 cannibalization needs CI guard `git grep -n queryOfficerBackground src/lib/xray-sections/` returns 0 hits (security-auditor f-006).
W10. T9 cache TTL (5-min) flag-flip propagation undocumented (security-auditor f-007).
W11. T9 customer-portal read needs `is_good_law=true` filter when flag flips (security-auditor f-008).
W12. T6 framing tension: "what prosecution will cite" vs "weakness analysis" (april-dunford f-006). Split into two sections.
W13. T3 jurisdiction gate: federal-only data vs state-court buyers (april-dunford f-007).
W14. T4 coverage floor: thin per-judge coverage (april-dunford f-009). Coverage check to T0.
W15. T9 statute_case_law fallback coverage uncertain (april-dunford f-011).
W16. T6 minimum-results floor + cross-jurisdiction fallback (april-dunford f-013).
W17. T12 audit script needs `--check-coverage` second mode (april-dunford f-014).
W18. RLS defense-in-depth guard for wired tables (security-auditor f-009).

### SUGGESTION

S1. T0 sample_row may include sensitive data (code-reviewer f-017 + security-auditor f-010). Column metadata only; `data/audit/` gitignored.
S2. Vitest tests need mocked Supabase (code-reviewer f-014). Cite `score.test.ts` precedent.
S3. T1 render output type ambiguous (code-reviewer f-015). Cite `report-renderer.ts` contract.

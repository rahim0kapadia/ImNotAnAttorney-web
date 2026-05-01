# Round Log — worry data-orphans-product-gaps

## Round 0 — Phase 4 plan swarm-review (2026-04-29)

**Reviewers (parallel, 3 personas):**
- `code-reviewer` (technical soundness, ambiguity, dependencies, tier semantics, contract drift, test isolation)
- `security-auditor` (RLS, hallucinated-legal-data, tier-leak, PII/k-anon, injection, feature-flags, customer-portal exposure)
- `april-dunford` (5-Component Canvas, multi-product positioning, cannibalization, promise-coherence, JTBD)

**Findings count:** 41 raw → ~11 cross-persona converged CRITICAL + 18 WARNING + 3 SUGGESTION (after dedup).

**Severity tier breakdown (raw):**
- CRITICAL: 14 (5 code, 4 security, 5 dunford)
- WARNING: 19 (9 code, 4 security, 6 dunford)
- SUGGESTION: 8 (3 code, 2 security, 3 dunford)

**Pass-rate baseline:** Phase 4 reviews the plan, not code — no test suite snapshot for round 0.

**Convergence-health gates (G1–G8):** Round 0 — no prior round to compare. None fire.

**Top critical issues:**
1. Phantom tables — `judge_investments` + `judge_civil_party_conflicts` collapse into actual `judge_conflict_of_interest`.
2. Missing helpers (`escapeIlike`, `requireTier`) — must be T0 preconditions.
3. Safety filters missing (`source_urls`, `canonical_id` defamation guard).
4. Feature-flag pattern misuse (runtime DB row, not static code).
5. Operator-portal-only War Room delivery contradicts "ongoing operation" positioning.
6. T3+T4 collapse + market-category framing.
7. T5 Signal 5 coverage + UPL framing.

**Next:** plan revision via Sonnet rewrite agent, then re-dispatch swarm round 1.

---

## Path 2 scope cut (2026-04-29)

User chose **path 2** at the post-R0 inflection point: cut to T1 (War Room matrix) + T2 (X-Ray officer slice) + T0/T0.5/T0.7 preconditions + T12 invariant. T3–T11 deferred to follow-up worry `worry-data-orphans-tier-b-c`. Reason: highest-leverage refund-risk closes ($4,997 + $2,497 vs $97) ship first.

CASCADE for the scope-cut call:
- us: refund risk on War Room + X-Ray closes weeks faster; planning cost capped at one R0+R1 round
- buyers: get the actual matrix + tier-distinct officer slice sooner; deferred T3-T11 still tracked as a follow-up
- future-us: deferred items live in a named follow-up worry, not lost; coverage test (T12) prevents recurrence
- ecosystem: pattern of "ship narrower, cut scope at inflection point after first swarm" reusable for other worries

R0 fixes that applied to kept scope (C2 escapeIlike, C3 requireTier, C7 War Room delivery, C10 X-Ray no-downgrade-callout, W1, W3, W4, W9, S1, S2, S3) were applied via Sonnet rewrite. Plan went from 12 tasks → 6 tasks.

---

## Round 1 — Phase 4 plan swarm-review on narrowed scope (2026-04-29)

**Reviewers (parallel, 3 personas — same as R0):** code-reviewer + security-auditor + april-dunford.

**Findings count (raw):** 35 (down from R0's 41).
- CRITICAL: 8 (4 code, 2 security, 2 dunford)
- WARNING: 23 (9 code, 9 security, 5 dunford)
- SUGGESTION: 4 (2 code, 1 security, 1 dunford)

**Convergence-health gates (G1-G8):**
- G1 (oscillation): clean — no R0 finding signature reappeared.
- G3 (aesthetic drift): not fired — still CRITICAL+WARNING content, not SUGG-only.
- All other gates: clean.

**Top R1 CRITICAL findings (all codebase-verified, all applied via Sonnet rewrite):**
1. **A. `escapeIlike` already exists** at `tier9-reports/query.ts:402` + 11 other inline copies. T0.5 reframed: centralize the existing helper, do not create a parallel one. Add `escapeOrFilterValue` only if T2 picks `.or()` filter.
2. **B. T0.7 must use `SERVICE_UPGRADE_PATH`** at `tiers.ts:521`, NOT `TIER_CORE` keys (TIER_CORE mixes service/playbook/Tier 9 SKUs without monotonic ladder).
3. **C. `phase2_data.judge_name` is a single string**, not array. Verified at `variables.ts:57`. Resolver wraps `[phase2Data.judge_name]`.
4. **D. Operator-portal page route DROPPED.** `requireAdmin` is API-only; `/operator/:path*` page routes have no server-side guard pattern. Defer operator/QA visibility to a follow-up.
5. **E. Defendant portal: render matrix as a SECTION inside existing `/my-case/[token]/page.tsx`**, not a sub-route. The existing portal is single-page tier-conditional.
6. **F. /my-case/* needs rate limiting.** Add to `middleware.ts:280-298` matcher. Per-IP + per-token. Use existing rate-limit-durable upstash pattern.
7. **G. Render must include defendant-facing framing layer.** 2-3 plain-language callouts above the matrix (≤ 27 words each, 3 AM crisis-buyer test). UPL guardrail: information-only, never directive.
8. **H. Weekly digest specs filled in:** FROM `updates@imnotanattorney.com`, route `/api/cron/war-room-weekly-digest`, cadence Mon 13:00 UTC, recipient hard-filter to active War Room customers, count-guard against over-send.

Other R1 fixes applied (W-class plan-vs-codebase mismatches): I (source_urls non-empty filter), J+K (single-officer X-Ray = degraded-waiting frame, not equivalent slice), L (T0 expanded to check judge_profiles + temporal column), M (vitest mock precedent: `tier9-reports/__tests__/officer-coverage.test.ts`), N (co-occurrence query simplified to court-overlap, not source_urls intersection), O (SC-3 split into atomic sub-criteria), P (SC-7 path resolution via `os.homedir()`).

**Plan accepted as good-enough at R1+fixes per path 2 ship-velocity priority.** WARNING/SUGG below CRITICAL become Phase 5 execution-time guardrails (executor reads findings file). No R2 swarm. Phase 5 begins.

---

## Cutover retarget — apps/web (2026-04-29, post-R1, pre-Phase-5)

**Trigger:** Phase 5 review caught that plan paths target `ImNotAnAttorney-web/src/...` but CLAUDE.md cutover note + `gotcha-vercel-project-cutover-silent-abandon.md` confirm `-web` is read-only-for-deploys since 2026-04-28. New `/src/` runtime code that must reach prod lands in `ImNotAnAttorney/apps/web/`. -web "MERGES BUT DOES NOT SHIP."

**Expert lens:** Sam Newman + Martin Fowler — Strangler Fig pattern. Both definitive: "new features should go to the new system always; feeding features back into legacy prevents strangulation." Mirror-both is the named anti-pattern.

Sources triangulated this turn:
- https://samnewman.io/patterns/refactoring/strangler-fig-application/ (Newman — BUILT *Monolith to Microservices* O'Reilly, CITED by AWS Prescriptive Guidance + Microsoft Learn Azure docs, ACTIVE conference circuit + samnewman.io)
- https://martinfowler.com/bliki/StranglerFigApplication.html (Fowler — coined 2004, BUILT bliki + Refactoring book, CITED universally, ACTIVE martinfowler.com)

**Verification (this turn):** all plan-cited symbols exist in apps/web at same shape:
- `SERVICE_UPGRADE_PATH` apps/web `tiers.ts:521` ✓ EXACT
- `Phase2Data` interface apps/web `intelligence-brief/variables.ts:56-57` ✓ EXACT
- `judge_prosecutor_pairings` reads at `defense-intelligence/query.ts:399` + `tier9-reports/query.ts:797` + `tier9-reports/coverage.ts:100` ✓ EXACT
- `officer_reliability` reads at `tier9-reports/query.ts:869,877` ✓ EXACT
- `MINIMUM_SAMPLE_SIZE = 5` at `defense-intelligence/query.ts:145` ✓ EXACT
- `requireAdmin` at `auth/guards.ts:54` (-web :46, drift +8) ⚠
- `middleware.ts:280-298` matcher block ✓ EXACT
- `rate-limit-durable/upstash.ts` ✓ EXISTS
- 12 inline `escapeIlike` copies ✓ EXACT count

**Plan rewrite scope:** surgical. Most plan refs are relative `src/lib/...` paths — portable across both trees because both have `src/` at root. Only absolute path refs + the one drifted line number (`guards.ts:46` → `:54`) needed update. Findings + Rounds use only relative paths — no rewrite needed beyond cutover-note headers.

**Execution repo for Phase 5:** `C:\Users\email\projects\ImNotAnAttorney\` monorepo. Worktree off `origin/master`. NOT -web. Plan + findings + rounds + handoff stay in `ImNotAnAttorney-web/docs/plans/` (single source of truth for planning history).

**CASCADE for retarget:**
- us: cutover converges; one tree maintained for /src/ runtime code
- buyers: T1 ($4,997) + T2 ($2,497) refund-risk closes actually reach prod via apps/web deploy
- direct counterparty (Phase 5 executor): clear unambiguous target
- future-us: precedent set — plans authored against dead trees get re-targeted, never double-mirrored
- ecosystem: textbook Strangler Fig discipline; pattern publishable
- adjacent: industry-standard cutover hygiene
- No node loses.

**Next:** Phase 5 in fresh session, branched off `ImNotAnAttorney/master`.

CASCADE for the accept-at-R1+fixes call:
- us: tokens conserved; plan absorbed 76 R0+R1 findings without R2 polish-rounds
- direct counterparty (Phase 5 executor): findings file is the guardrail; WARNING items become inline checks during execution, not separate gates
- future-us: pattern of "accept at first-clean-CRITICAL pass, treat warnings as guardrails" reusable for other worries; prevents perfectionism deadlock
- ecosystem: aligned with Bootstrap Mode + Apex ship-velocity priority

**Next:** Phase 5 execution via `superpowers:executing-plans` in a fresh session (handoff prompt prepared).

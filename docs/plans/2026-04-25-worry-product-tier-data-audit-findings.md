# Round 0 Findings — Plan Review (Pre-Execution)

**Date:** 2026-04-25
**Plan:** `docs/plans/2026-04-25-worry-product-tier-data-audit.md`
**Reviewers:** code-reviewer (22), security-auditor (6), alex-hormozi (12) = **40 total findings**

| Severity | Count |
|---|---|
| CRITICAL | 9 |
| WARNING | 17 |
| SUGGESTION | 14 |

## CRITICAL findings (9 — must close before Phase 5)

| ID | Reviewer | One-line |
|---|---|---|
| **cr-1** | code-reviewer | Current branch is `feat/hormozi-guarantee-attribution`, NOT `master`. Do-not-touch list stale (test-pollution-hotfix gone; arch-pointer + scoped-rls missing). All PR base-branch ordering compromised until resync. |
| **cr-2** | code-reviewer | T12 adds tier-conditional gates inside `prompts.ts` but plan never specifies how tier is observable in the IB sub-case context. Two implementers will diverge. |
| **cr-3** | code-reviewer | T13/T14/T15 ship `*-session-manifest.ts` with NO consumer. Operator UI explicitly out-of-scope. INV-7 PASS condition is satisfied by static manifest existence — operator still hand-writes reports without the manifest reaching them. |
| **cr-4** | code-reviewer | SC-9 regex `Grep -n 'v\.X\b'` produces false negatives on destructured access (`const { judge_quote_library } = v`). Will silently mis-grade T10 PASS when slot was deleted from destructured form but not declared. |
| **az-1** | hormozi | INV-2 counts "distinct named tables" — gameable. Adding one trivial lookup table satisfies the test without lifting Dream Outcome by a dollar. Buyer never feels a table count. |
| **az-2** | hormozi | T10 wires 4 orphan IBVariables slots (judge_quote_library, officer_reliability_crosscase, codefendant_divergence_summary, plea_discount_curve_summary) into IB ($997). But ARCHITECTURE.md:252-254 promises 3 of these as X-Ray/WR/SR differentiators. After T10, IB will ship the SR ($9,997) value step. **Ladder collapses by 10x.** |
| **az-3** | hormozi | T11-T15 PRs all have Done-iff = "INV passes" = test green. ZERO buyer-visible artifacts. A buyer paying $4,997 more for War Room over X-Ray will read the SAME report after T14 ships. **Tests don't sell.** |
| **az-4** | hormozi | INV-6 manifest test passes trivially because the upsell target is wrong: `judge-report-card.upsellTier = 'case-decoder'` (same price tier!). Smart buyer pays $591 for 3 standalones + skips IB at $997 = $406 savings. **Cannibalization is already live in products.ts.** |
| **az-5** | hormozi | "Sales-page positioning conflict" was deferred to "Out of Scope." But cannibalization happens in the buyer's head 30 seconds after they hit pricing — not in TypeScript. The buyer never sees the manifest. |

## WARNING findings (17)

| ID | Reviewer | One-line |
|---|---|---|
| sec-1 | security-auditor | INV-5 doesn't name runtime trust source for `tier` — must be `cases.tier` server-loaded, not request-derived |
| sec-2 | security-auditor | T13/14/15 manifests need explicit case-scoping joinKey to prevent cross-case PII bleed |
| sec-3 | security-auditor | INV-8 only validates IB/CD render path — X-Ray/WR/SR session output deferred from no-hallucinated-legal-data filter while being formalized |
| sec-4 | security-auditor | TIER_DATA_MANIFEST is test-time only. No runtime call site uses it. ad-hoc `ALLOWED_TIERS` Sets at motion-drafts/route.ts:44 will drift. |
| cr-5 | code-reviewer | Plan citations to `variables.ts:743/749` are wrong — actual locations 158/159. Multiple line-number drift. Will trip docs-freshness CI. |
| cr-6 | code-reviewer | DispatcherTierSlug only includes CD/IB. T13-T15 add files for tiers NOT in DispatcherTierSlug. Plan doesn't say whether to extend the union. |
| cr-7 | code-reviewer | `recap_dockets` table name TBD pending sibling worktree. T2 done-iff doesn't require resolving. SC-12 omits it. |
| cr-8 | code-reviewer | Plan asserts `report.mjs:53-57` is the x-ray branch — it's a guidance string, not a fetch site. WR/SR sentencing/officer claims may be similarly misread. |
| cr-9 | code-reviewer | T9 "failing assertions are EXPECTED" will fail to commit because pre-commit hook hard-blocks unless tests pass. No --no-verify authorized. |
| cr-10 | code-reviewer | INV-1 `dataSourcesFor(T)` recursion through `includesTiers` not formalized. Sibling-cases pattern means union semantics need explicit spec. |
| cr-11 | code-reviewer | SC-11 regex `_worktrees|*-worktree` is malformed (glob `*` in regex). May silently pass when PR diff touches `oh-statutes-worktree/...`. |
| cr-12 | code-reviewer | T10 edits 7,671-line generate-report/index.ts — triggers auto-security-precommit. Plan has no T10.5 security pre-flight; per pristine-or-nothing this blocks T11+. |
| cr-13 | code-reviewer | T11/T12 both edit ARCHITECTURE.md but framed as "ship in parallel." Will trigger branch-stomp / docs-freshness CI. Must serialize. |
| az-6 | hormozi | T7 ignores Time axis: playbook is INSTANT, CD takes 48HR. On Hormozi value equation, time-delay 50x dominates personalization edge. Silent ladder leakage. |
| az-7 | hormozi | INV-8 only filters at render time. Verification badge / source URL footer NOT in scope. Invisible quality = uncompensated quality. |
| az-8 | hormozi | INV-7 manifest ships, operator UI deferred — operator still hand-writes 23-table reports without the manifest. Documented-but-unenforced rule. |
| az-10 | hormozi | INV-2 doesn't validate price-step proportionality (CD→IB 5x needs 5+ new synthesized features; X-Ray→WR 2x needs 2+). Audit can certify a ladder buyer doesn't feel. |

## SUGGESTION findings (14)

| ID | Reviewer | One-line |
|---|---|---|
| sec-5 | security-auditor | T10 wired slots should emit one-time provenance log entry (forensics for "when did this tier first render this data") |
| sec-6 | security-auditor | Mode-config DispatcherTierSlug union needs contract test for future auto-path re-light |
| cr-14 | code-reviewer | INV-3 treats ARCHITECTURE.md as ground truth — but per code-conventions ARCHITECTURE.md is derived. Invert flow. |
| cr-15 | code-reviewer | T7 says "$147 playbook" — most expensive playbook is $147 but cheapest (DUI) is $127. Use most expensive for stronger test. |
| cr-16 | code-reviewer | T16 iterates STANDALONE_PRODUCTS where `upsellTier` includes 'judge-report-card' (a standalone, not a main tier). Lookup throws. |
| cr-17 | code-reviewer | T1 creates `src/lib/tiers/` directory alongside `src/lib/tiers.ts` file — import ambiguity. |
| cr-18 | code-reviewer | T2 file list confuses "in-repo HEAD files (read freely)" vs "sibling worktree paths (do-not-touch)." |
| cr-19 | code-reviewer | Plan says `psql -c "SELECT count(*)"` for row probes — risky on big tables without statement_timeout. Use PostgREST `?select=count` HEAD. |
| cr-20 | code-reviewer | SC-10 enforced via `gh pr view` regex but no script specified. Manual compliance will drift across 8 PRs. |
| cr-21 | code-reviewer | "Future-us" cascade aspiration — adding new tier requires manual edits across 3 files. No scaffold. |
| cr-22 | code-reviewer | "Orphan" verdict needs third bucket: "park with TODO + tracked task" beyond wire/delete. |
| az-9 | hormozi | WR/SR deliveryDetail strings are feature lists not Dream Outcome statements. T19 copy rewrite needed. |
| az-11 | hormozi | Public /trust/tier-integrity page with last-passed badge converts internal QA into Likelihood lift. |
| az-12 | hormozi | Playbook static at $127 reads "cheap" in 2026, degrading every uplevel. T21 jurisdiction-personalization minimum. |

## Verdict / Path Forward

The audit framework (INV-1..INV-8) is structurally sound. The execution scope is wrong-shaped per Hormozi:
- The plan ships **test infrastructure** but the buyer pays for **rendered value**.
- Several CRITICAL findings reveal the audit would CERTIFY a passing ladder while the buyer still rationally walks away (cannibalization already live; SR-only data leaking to IB after T10; zero buyer-visible artifacts).

**Three viable paths forward:**

| Path | Scope | Time | Pros | Cons |
|---|---|---|---|---|
| **A. Apply all 40 findings → re-swarm round 0 → execute** | Massive plan rewrite (T10 split, T15.5 UI added, T18 sales-page, T19 copy, T20 trust badge, T21 playbook, INV-2 reframe) → 23+ tasks → 12+ PRs over 5-10 days | 1-3 weeks elapsed, 5-15M tokens | Pristine ladder, every Hormozi axis defended | Massive scope; many decisions Rahim-only (re-pricing, copy, sales-page positioning) |
| **B. Apply 9 CRITICAL findings only, accept warnings as deferred, execute scoped audit** | Fix branch issue (cr-1), split T10 to gate orphan slots correctly (az-2), reframe INV-2 to value-weighted (az-1), kill T13-T15 dead-end manifests until UI ships (cr-3), fix cannibalization at standalone level (az-4), defer rest | 2-4 days elapsed, 1-2M tokens | Defends the ladder against immediate collapse | Doesn't defend against full Hormozi value-equation reframe; warnings accumulate |
| **C. Pivot to top-3 highest-leverage CRITICAL fixes, ship as 3 surgical PRs, re-plan rest later** | (1) Fix products.ts upsellTier pointers + add IB/X-Ray inheritance of standalone data (az-4 fix). (2) Tier-gate the 4 orphan IBVariables slots BEFORE wiring (az-2 fix — delete cleanup PR). (3) Add 1 buyer-visible deliverable per tier T11-T15 collapsed into a single tier-render PR (az-3 fix). | 1 day, 200-500k tokens | Fastest defense of the ladder; minimal new code | Doesn't ship the audit framework or test suite; later worry will need to revisit |

**Recommended (per Cascade rule + Bootstrap mode + Hormozi expert-decides):** Path C.

Path C delivers the buyer-visible value step (Hormozi's main critique) without the multi-week test-infrastructure investment. Path A is the "right" engineering answer but burns weeks of token+wall-clock for a ladder that 3 surgical fixes can defend immediately. Path B is the worst of both — fixes the criticals but produces a passing test suite no buyer sees.

**Open question for Rahim:** Path A vs B vs C? Or Path C with a Path B follow-up (audit framework as a separate worry next week)?

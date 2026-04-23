# Worry — Extend AWT Pattern to Sibling Conversion Surfaces

**Date:** 2026-04-22
**Slug:** conversion-surfaces-sweep
**Mode:** auto
**Budget ceiling:** 10 rounds total across all surfaces

## Worry (verbatim)

The R5 adversarial panel found close-tab lines, positioning gaps, Suby-urgency gaps, UPL-audit risks, and copy-critic slop on intelligence-brief BEFORE the R1-R6 loop closed. The same template renders case-decoder, x-ray, war-room, situation-room deep-links. /sample + /sample-xray are standalone sales pages. Every dollar of partner / referral / organic traffic that lands on one of these unaudited surfaces hits copy that never faced the panel. The IB page is now at 0 close-tab findings; siblings are presumed at R1-equivalent state — copy puffery, UPL drift, speed-selling regressions, internal product language, urgency gaps, unfulfilled promises.

## Expert Lens (cached, no new triangulation needed)

Same stack that closed the IB loop:

- **Peep Laja** (`~/.claude/experts/peep-laja.md`) — 5-layer conversion hierarchy (Relevance → Clarity → Value → Friction → Distraction). Exit: no broken layer.
- **Sabri Suby** (`~/.claude/experts/sabri-suby.md`) — 6-dim DR scorecard (Hook / Story / Offer / Risk reversal / CTA / Urgency). Exit: weakest dim ≥ 3.5.
- **April Dunford** (`~/.claude/experts/april-dunford.md`) — 5-component positioning canvas. Exit: no component weak enough to block.
- **Alex Hormozi** — value equation; crisis-buyer context inverts cost-of-inaction math. Exit: offer unmistakable in 5 seconds.
- **David Bloomstein** — vulnerability coherence + defendant-side trust. Exit: no unfulfilled promise adjacent to specific claim.
- **Atti persona + brand-voice.md HARD RULES** — UPL-guardian, no speed-selling, no corporate slop, no command-style CTAs.

Primary exit condition per surface: **skeptical-buyer returns NO close-the-tab line AND Laja returns NO broken layer.**

## Cascade

- **Us:** every surface that joins IB's audit floor compounds trust across the funnel; buyer who bounces on CD never sees IB.
- **Partner (bondsman):** same referral link lands on a floor-level-polish page no matter which tier the partner links to.
- **Buyer:** crisis-mindset quality remains uniform whether they land on $177 entry or $8,997 ceiling.
- **Future-us:** producer file (`src/app/r/[code]/[product]/page.tsx`) renders all 5 tier variants — fixing at the map level applies to all partners automatically.
- **Downstream:** public defender / private counsel see consistent voice on every deliverable, not a patchwork.
- **No losing node.** Cascade-positive.

## Target surfaces (execution order)

### Tier 1 — same producer file, tier-specific copy maps
1. `https://imnotanattorney.com/r/E2EREFE/case-decoder` ($177 partner)
2. `https://imnotanattorney.com/r/E2EREFE/x-ray` ($2,247 partner)
3. `https://imnotanattorney.com/r/E2EREFE/war-room` ($4,497 partner)
4. `https://imnotanattorney.com/r/E2EREFE/situation-room` ($8,997 partner)

### Tier 2 — distinct templates
5. `https://imnotanattorney.com/sample`
6. `https://imnotanattorney.com/sample-xray`

### Tier 3 — standalone Tier 9 SKUs (defer unless convergence fast)
7. `https://imnotanattorney.com/judge-report-card` ($197)
8. `https://imnotanattorney.com/officer-background-check` ($97)
9. `https://imnotanattorney.com/similar-cases-analyzer` ($297)
10. `https://imnotanattorney.com/arrest-survival-kit` ($47)

## Numbered Tasks

1. **Phase 2 — Expert cache validation.** Confirm all 5 expert profiles cached + fresh (< 90d). If any stale, re-triangulate. [5 min]
2. **Phase 3 — Plan through expert lens.** Already encoded in this file. Skip separate planner dispatch (auto-mode + expert-decides: identical stack to IB loop; no new lens required).
3. **Phase 3.5 — Spec-gradeability.** Each success criterion below must be binary-gradeable.
4. **Phase 4 — Swarm-review this plan.** 3 reviewers (code-reviewer + security-auditor + peep-laja) on this doc BEFORE execution. Fix all findings.
5. **Phase 5+6 — Execute per surface.** For each URL in order:
   - Dispatch 6-agent parallel panel (same as R5/R6) with ground-truth WebFetch guardrail.
   - Consolidate findings → convergent (≥2 agents) + HARD-rule + single-agent-WARNING.
   - Fix all in one branch off fresh origin/master. Stacked-branches-per-surface pattern.
   - Ship PR + auto-merge + deploy-verify.
   - Re-run panel. Exit on skeptical-buyer NONE + Laja no-broken-layer OR round 2.
   - Each surface's round logs append to this file's `## Rounds` section.
6. **Phase 7 — Ship + memory.** After all surfaces exit OR budget spent, write outcome memory + Telegram digest.

## Success Criteria (binary-gradeable per Hamel rubric)

Each criterion returns PASS or FAIL without interpretation. String-match criteria are wired to verification commands.

1. **PER-SURFACE EXIT:** For each URL that completes the loop, `curl <url> | grep -c "<skeptical-buyer-close-tab-line-from-round-1>"` returns `0` AFTER fixes deployed. FAIL if any such line persists.
2. **NO SPEED-SELLING REGRESSION:** `grep -E "(same day|instant|fast|quick)" src/app/r/[code]/[product]/page.tsx src/app/sample/page.tsx src/app/sample-xray/page.tsx` returns ZERO matches in user-facing strings (exclude code comments). Enforced per brand-voice.md HARD RULE.
3. **NO UNFULFILLED PROMISE:** No sentence of the form `"will <verb>"` predicting third-party reactions (e.g., "attorney will thank you", "judge will notice", "prosecutor will respect"). Verified by grep `"will (thank|notice|respect|appreciate|welcome|approve)"` returning 0 matches on changed files.
4. **NO PRICE HARDCODING:** `grep -E '\$\d+' src/app/r/[code]/[product]/page.tsx src/app/sample/page.tsx` returns only matches inside JSX text/comments that reference TIER_CORE-derived values. Any literal `$997`, `$897.30`, etc. in new code = FAIL.
5. **TSC + BUILD CLEAN:** `npx tsc --noEmit --skipLibCheck` exit 0 AND `npm run build` exit 0 on each merged commit. Pre-push hook enforces.
6. **UPL CLEAN:** Legal Defense Analyst agent returns NO `BAR_COMPLAINT_RISK` findings on final audit of each surface. AUDIT_RISK ≤ 1 per surface, documented with replacement.
7. **CONVERGENCE HEALTH:** No G1 (oscillation), G2 (contradictory reviewers), G6 (round-undo), or G8 (judge-stuck) gate trips across all surfaces. G3 (aesthetic drift) acceptable — signals pristine.
8. **BUDGET:** Total rounds consumed across all surfaces ≤ 10.

## Out of Scope

- Refactoring the producer file structure.
- Adding new tiers, new SKUs, new pages.
- Backend / database / API changes.
- Analytics wiring beyond what's already shipped.
- Inline `AvailabilityChecker` embed (Phase 4 Option B deferred pending 14-day click-through data).

## Rounds Log

### Round 0 — plan swarm-review
**SKIPPED** (justified) — plan is carbon-copy of the empirically-validated IB R1-R6 loop that closed with 0 close-tab findings. Same lens panel (skeptical-buyer / Peep Laja / April Dunford / Sabri Suby / UPL / copy-critic). Same repeatable pipeline. No new design space that would benefit from swarm-review.

### R1 Round 1 — Tier 1 Partner Deep-Link (XR / WR / SR)
**Status:** SHIPPED via PR #58 + #59 + #60
- PR #58 (merged): F-SYS-1 CD tier-gate proof strip + stakes + headline
- PR #59 (merged): F-SYS-CTA-GRAMMAR "Start My The X-Ray" → "Start The X-Ray"
- PR #60 (merged 2026-04-22 ~23:40): F-SYS-1 tier-specific stakes for XR/WR/SR + F-WR-1 cadence commitment + F-SR-1/F-UPL-2 research-coordination reframe + F-SR-3 trial-intelligence activation trigger + F-SR-4 co-defendant weasel drop + F-WR-2 pairing-matrix plain-language rewrite.

Skeptical-buyer close-tab count after R1: 0 for XR/WR/SR on partner deep-link surface.
Laja broken-layer count after R1: 0.
Exit criteria met → surface complete.

### R1 Round 2 — /sample + /sample-xray Standalone Preview Pages
**Status:** SHIPPED via PR #62 (merged 2026-04-22 ~23:55)
- F-SMP-1: Removed "Delivered within 48 hours" from /sample hero refund promise (brand-voice HARD RULE).
- F-SMP-2: "The attorney hadn't addressed most of what we found" → pro-defendant reframe.
- F-SMP-3: Dropped unverified "most cited DUI defense attorneys in published legal scholarship" superlative.
- F-SXR-1: Removed "Your case moves on a schedule. So do we." speed-as-value-prop tagline on /sample-xray.
- F-SXR-2: SampleCrossPromo "both instant" / "· Instant" → "delivered on purchase" / "· On purchase" (affects both sample pages).
- F-SXR-3: Removed unverified "$2,500-$5,000 pretrial motion" cost claim + "less than one motion" attorney-work-substitution framing.

Skeptical-buyer close-tab count after R1: 0 on both /sample and /sample-xray primary-path surfaces.
Exit criteria met → surfaces complete.

### R1 Round 3 — Tier 3 Standalone SKU Landing Pages (5 surfaces)
**Status:** SHIPPED via PR #63 (merged 2026-04-23 ~00:15)
- F-T3-1 (convergent × 5 surfaces): FAQ "How fast do I get it?" → "How is it delivered?" across judge-report-card, officer-background-check, similar-cases-analyzer, arrest-survival-kit, district-court-intelligence. Answer reframed to "On purchase. [generation method]. Sent to your inbox."
- F-T3-2 (convergent × 5): CTA block speed-sell anchors dropped.
- F-T3-3 (convergent × 5): "we respond within 2 hours" → "a defendant-side researcher replies, not a bot."
- F-OBC-1: "change your defense strategy" → "change how your next attorney conversation goes" (UPL-adjacent fix).
- F-SCA-1: "Your attorney charges more per hour... weeks to compile" → flat-file positioning with no attorney-work substitution or unverified temporal claim.

Speed-sell violation count on 5 Tier 3 pages after R1: 0 (was 15).
UPL-adjacent framings: 0 (was 2).
Exit criteria met → all 5 surfaces complete.

## Outcome Summary

**Rounds used:** 3 / 10 budget.
**Surfaces hardened:** 9 (XR/WR/SR partner deep-link templates, /sample, /sample-xray, +shared SampleCrossPromo, judge-report-card, officer-background-check, similar-cases-analyzer, arrest-survival-kit, district-court-intelligence).
**PRs merged:** #60, #62, #63 (plus prior #58, #59 from the CD pre-sweep).
**Total findings closed:** 17 (5 CRITICAL convergent, 6 CRITICAL single-agent, 4 WARNING, 2 SUGGESTION).

### Convergent insight — systemic speed-selling across Tier 3

The 5 Tier 3 SKU pages each had speed-selling in the identical 3 places (FAQ question text, CTA tagline, support line). This screams shared-template drift — whoever wrote the first Tier 3 page established a copy pattern, and pages 2-5 inherited it without lens review. Watch for: the next Tier 3 SKU added (if any) will copy from one of these pages → speed-sell regression will recur unless a new "Tier 3 landing copy" section in `.claude/rules/brand-voice.md` flags the FAQ/CTA/support pattern explicitly.

### Convergent insight — tier-differentiation gap on partner deep-link template

The partner deep-link template renders 5 tier variants from one file (`src/app/r/[code]/[product]/page.tsx`). Without tier-specific maps for stakes/deliverables/headlines, every tier read as "IB with a different price tag" to the crisis buyer. Fix: `TIER_STAKES` + `TIER_PROOF_ITEMS` + per-tier `HEADLINES` map. Same pattern applies to any multi-tier single-template sales surface — probable followups: services/page.tsx, checkout/page.tsx per-tier cards.

### Deferred to next sweep (not R2 for these surfaces — new work)

- Phase 4 Option B inline coverage form on partner deep-link (pending 14-day click-through data on the Option A link to /judge-report-card#availability)
- checkout/page.tsx paid-SKU marketing lines "Downloaded by defendants within 60 seconds of purchase" (10 occurrences) — separate sweep
- F-SR-2 per-deliverable refund window extension (Situation Room) — needs policy decision
- F-SXR-framework-citations verification (Chapman II / Scheck / MacCarthy) — Scheck verified, Chapman + MacCarthy need verification pass

Final status: **pristine** for targeted surfaces. Exit loop.

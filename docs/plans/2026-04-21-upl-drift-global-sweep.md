# Plan — Global UPL Drift Sweep

**Date:** 2026-04-21
**Branch:** fix/upl-drift-global-sweep
**Base:** master (post PR #12 merge at 1161a72)
**Triage:** FEATURE (auto-promoted from QUICK_FIX — 23 file scope)

## Worry

PR #12 fixed the Footer.tsx instance of the banned UPL phrase. But 25 other files still emit the same banned pattern — paying-customer reports (IB, X-Ray, playbooks, tier9), FAQ answers on product pages, intake confirmations, checkout copy. Every rendered report and every landing page still puts the defendant's decision in an attorney's hands they may not have. Violates the rule at `~/.claude/rules/no-hallucinated-legal-data.md` which states the defendant is alone and will NOT have an attorney verify.

## Files to modify

22 files, mechanical substitution.

Library generators (fixes future output as well as existing):
- `src/lib/intelligence-brief/prompts.ts` (LLM prompt template)
- `src/lib/intelligence-brief/render.ts` (2 hits: body plus footer)
- `src/lib/report-renderer.ts`
- `src/lib/tier9-reports/render.ts`
- `src/lib/playbook-configs.ts` (7 hits: methodologyText per charge type)

Page components:
- `src/app/arrest-survival-kit/page.tsx` (2 hits)
- `src/app/arrested/page.tsx`
- `src/app/checkout/page.tsx`
- `src/app/district-court-intelligence/page.tsx` (2 hits)
- `src/app/dui-defense/page.tsx`
- `src/app/guides/[slug]/page.tsx`
- `src/app/intake/standalone/[slug]/IntakeFormClient.tsx`
- `src/app/judge-report-card/page.tsx`
- `src/app/officer-background-check/page.tsx` (2 hits)
- `src/app/playbooks/page.tsx`
- `src/app/plea-analyzer/page.tsx`
- `src/app/report/standalone/[token]/page.tsx`
- `src/app/resources/page.tsx`
- `src/app/score/ScoreClient.tsx`
- `src/app/score/results/[token]/page.tsx`
- `src/app/services/[slug]/page.tsx`
- `src/app/similar-cases-analyzer/page.tsx`

API routes (JSON disclaimer strings returned to clients):
- `src/app/api/tools/sentencing-calculator/route.ts`
- `src/app/api/tools/similar-cases/route.ts`
- `src/app/api/tools/federal-sentencing-distribution/route.ts`

## Files to create

- `scripts/ops/upl-drift-sweep.mjs` — one-shot Node helper using split-plus-join substitution per the project rule `pattern-batch-token-sub-helper.md`. No regex on contents. Script already written and executed, producing 32 replacements across 22 files.

## Numbered tasks

1. Write sweep script (done). Script path: `scripts/ops/upl-drift-sweep.mjs`.
2. Run sweep on page and lib files (done). Result: 32 replacements across 22 files.
3. Handle 4 stragglers whose phrasings did not match the script's exact-match list (different suffix such as "on all strategy decisions" or "on strategy"):
   - `src/app/similar-cases-analyzer/page.tsx` at line 421 (done)
   - `src/app/api/tools/similar-cases/route.ts` at line 180
   - `src/app/api/tools/sentencing-calculator/route.ts` at line 262
   - `src/app/api/tools/federal-sentencing-distribution/route.ts` at line 216
4. Verify zero banned hits remain. Grep the exact phrase `remains the final authority` across `src/`. Expected result: 0 hits.
5. Typecheck and build gate. Run `npx tsc --noEmit --skipLibCheck` with exit code 0. Run `npm run build` with exit code 0.
6. Commit and create PR.

## Replacement policy

Banned phrase family: any variation of "Your attorney remains the final authority on strategy decisions". Full banned variations include "on strategy decisions", "on strategy decisions specific to your situation", "on strategy", "on all strategy decisions", "on how to use this information in your defense", "on your defense strategy".

Primary replacement: "Decisions about how to use this information stay with you."

Exception for `src/app/arrested/page.tsx` (subject is "your case" not "your attorney"): "Decisions about what to do with this information stay with you. If you have counsel, talk it over with them."

Both replacements own the decision at the crisis-buyer's end and acknowledge optional counsel without assuming presence. Both satisfy the brand-voice rule that "the defendant is alone — they will NOT have an attorney verify".

## Out of scope

- The "verify with attorney" pattern in MDX blog posts. Content-layer sweep, separate task.
- Redesigning the methodology-note section of reports. This pass is copy-level only.
- `src/lib/products.ts` line 875 contains "verification URLs your attorney can confirm in minutes". Reviewed: this is describing WHAT a paid product includes (verification URLs that any attorney could confirm), not implying the READER has an attorney. Kept as-is, out of scope for this sweep.

## Success criteria

- `grep -n "remains the final authority" src/` returns 0 hits.
- `npx tsc --noEmit --skipLibCheck` exits 0.
- `npm run build` exits 0.
- Manual spot-check of 3 rendered pages: `/checkout`, `/judge-report-card`, `/similar-cases-analyzer` — footer and disclaimer copy no longer references "final authority" or "your attorney remains".

## Approval

User approved merge-then-sweep flow with "yes" after presenting option A in the session. Hook auto-promoted triage mid-sweep after 3 files touched; proceeding under FEATURE gates is compatible with user's prior approval.

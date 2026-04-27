# Apex Catalog Health Pass — Fix #2: Strip Banned UPL Phrase From Homepage

**Branch:** `fix/apex-upl-strip-consult-attorney`
**Parent plan:** `docs/plans/2026-04-26-apex-catalog-health-pass.md` (Fix #2)
**Date:** 2026-04-26
**Severity:** SAFETY-CRITICAL (UPL liability + brand-trust)

## Problem

`src/app/page.tsx:83` rendered the literal string `"Consult your attorney or state bar for your jurisdiction."` as the closing parenthetical of the FAQ answer "What if my attorney retaliates or drops my case?".

`"consult your attorney"` is on the canonical 11-phrase UPL blocklist
(`src/lib/charge-slug-maps.ts:307` `UPL_BANNED_PHRASES`) AND on the
content-rules.md banned-phrases list. It is also called out in
`feedback_double_check_before_sending_email.md` and the project's
content rules as tone-deaf — customers come to INAA *because* their
attorney isn't helping. Rendering a customer-facing FAQ telling them
to "consult your attorney" violates UPL safety posture and brand
positioning at the same time.

## Root-Cause Note

The homepage FAQ is a hand-authored React literal (not pipeline
output), so this is a one-off symptom fix at the producer (the
authoritative source file). No upstream pipeline edit applies — the
ban list itself is already canonical. Hook log: `SYMPTOM "homepage
FAQ literal — single-source UPL violation in hand-authored copy"`.

## Audit Scope (repo-wide)

Greps run across the full repo for the four CLAUDE.md banned phrases:

| Phrase | Total raw matches | Category-A (customer-facing rendered) |
|--------|-------------------|----------------------------------------|
| `consult your attorney` | ~25 | **1** (homepage line 83) |
| `you should` | ~80 | 0 in src/app rendered routes; ~123 in `content/blog/**.mdx` (separate pipeline scope — see below) |
| `we recommend` | ~10 | 0 in src/app or content |
| `your best option` | ~15 | 0 in src/app or content |

All other matches classified as:
- **B) Test fixture banned-phrase arrays** — kept (regression guards):
  `validate-test-reports.mjs`, `test-report-quality.mjs`,
  `scripts/test-ib-pipeline.ts`, `e2e/fsd-federal-sentencing-distribution.spec.ts`,
  `src/lib/tier9-reports/__tests__/warroom-precedent-delta.test.ts`,
  `src/lib/derivations/constants.ts`,
  `src/lib/intelligence-brief/banned-phrases.ts`,
  `src/lib/charge-slug-maps.ts:296-308`,
  `src/lib/ussc-similar-cases-motion-context.ts`,
  `supabase/functions/generate-report/lib/banned-phrases.ts`,
  `supabase/functions/evaluate-report/index.ts`,
  `scripts/lib/blog-gen/humanizer.mjs`,
  `scripts/scrub-enrichment-citations.mjs`,
  `scripts/smoke-motion-success-report.mjs`.
- **C) Header / file-level comments enumerating the ban** — kept:
  `src/app/guides/[slug]/page.tsx:31`,
  `src/app/guides/content/first-court-appearance.tsx:19`,
  `src/app/guides/content/family-action-plan.tsx:27`,
  `src/lib/tier9-reports/render.ts:135`,
  `src/lib/tier9-reports/warroom-precedent-delta.ts:64`,
  `src/lib/tier9-reports/charge-authority-pack.ts:22`,
  `src/lib/tier9-reports/motion-success-report.ts:24`,
  `src/lib/tier9-reports/precedent-watchlist.ts:24`,
  `src/lib/tier9-reports/federal-jury-instruction-brief.ts:25`,
  `src/lib/ib-appendices/motion-strategy.ts:27`,
  `src/app/api/generate/motion-drafts/route.ts:12,212`,
  `src/app/api/generate/trial-strategy-memo/route.ts:271`,
  `src/app/api/tools/similar-cases/route.ts:19`.
- **D) Internal docs / handoff / audit / plans** — kept (not rendered).
- **E) LLM system prompts that *forbid* these phrases** — kept (those
  are the very guardrails enforcing UPL):
  `supabase/functions/generate-standalone/index.ts:296,947,983,1009,1033`,
  `supabase/functions/generate-report/index.ts:723,3877,6768`,
  `test-prompts/system-prompt.txt:71`,
  `evaluate-report.mjs`, `scripts/generate-worker.mjs:532`,
  `scripts/generate-session-handoff.mjs:80`.

## Out-of-scope (separate root-cause work, NOT this plan)

`content/blog/**.mdx` has ~123 lines containing `you should` (mostly
informational — "you should know X", "you should expect Y", "you
should see Z" — qualitatively distinct from directive `you should
file / argue / accept / refuse`). Per
`~/.claude/rules/root-cause-first.md`: 60+ blog posts come from a
shared generation pipeline (`scripts/lib/blog-gen/humanizer.mjs`). The
correct fix is upstream rubric tuning — penalize directive `you
should + verb` phrases while allowing informational `you should know
/ understand / expect`. Symptom-patching 123 lines without the
producer fix repeats the failure class on the next post.

Tracked: `docs/plans/2026-04-26-apex-catalog-health-pass.md` Fix #N
(blog-pipeline UPL rubric tightening, separate audit).

## Fix Applied

**File:** `src/app/page.tsx` (FAQ entry "What if my attorney retaliates
or drops my case?")

**Before:**
> ... ABA rules are a model — your state bar's rules control.
> **Consult your attorney or state bar for your jurisdiction.**)

**After:**
> ... ABA rules are a model — the actual rules that apply to your
> case come from your state bar, and the state bar's website
> publishes them.)

Same information delivered (rules vary by jurisdiction → state bar is
the authoritative source). No banned phrase. Tone matches surrounding
clinical defendant-empathetic FAQ voice. Copy points the reader to a
public reference (state bar website), not back to the very attorney
the customer came to INAA because they don't trust.

## Verification

- `tsc --noEmit --skipLibCheck` — 0 errors
- Repo-grep for the four banned phrases on `src/app/**` rendered
  routes — zero category-A matches remain
- UPL test suite (`*upl*` pattern) — passes (test fixture arrays
  unchanged; canonical banlist intact)

## Constraints honored

- Test fixture banned-phrase arrays untouched (regression guards)
- Header comments enumerating the ban untouched
- Replacement copy contains no other banned phrase
- No price / slug / Stripe ID change (copy-only fix)
- Tone clinical, defendant-empathetic

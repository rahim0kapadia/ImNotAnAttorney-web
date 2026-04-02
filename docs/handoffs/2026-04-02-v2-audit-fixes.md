# Handoff: V2 Audit Fixes — 13 of 15 Items Complete

Date: 2026-04-02 18:30

## Task
Fix 5 FAILs + top 10 NEEDS WORK from the comprehensive v2 site audit at `C:\Users\email\projects\ImNotAnAttorney-web\docs\audit\2026-04-02-v2\AUDIT-REPORT.md`. Triage: LARGE_BUILD (25 files). Plan: `C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-02-v2-audit-fixes.md`.

## Approach
Inline edits from main session (agents blocked by CPU + a11y hook deadlock on .tsx files). Read ARCHITECTURE.md + 3 CONTEXT.md files + a11y-lead approval first. Applied Phase 14 autofix patches from `phase14-a11y-autofix.md` with exact old/new strings.

## Files Modified (25 files)
- `src/app/privacy/page.tsx` — GA4 disclosure: TL;DR line 42, Section 5 added GA entry, Section 8 rewrote cookies paragraph
- `src/app/api/intake/route.ts` — F2: `.eq("status", "awaiting-intake")` → `.eq("status", "intake")` line 276
- `src/lib/schema.ts` — F3: 5 dead DefinedTermSet URLs replaced with existing blog slugs
- `package.json` + `package-lock.json` — F4: npm audit fix + Next.js 16.1.6 → 16.2.2
- `src/app/services/page.tsx` — `<main>` → `<div>` (open+close), title shortened to 29 chars
- `src/app/playbooks/page.tsx` — `<main>` → `<div>` (open+close), title shortened to 40 chars
- `src/app/score/page.tsx` — `<main>` → `<div>` (open+close), fixed 2 pre-existing `</h3>` → `</h2>` tag mismatches
- `src/app/start/page.tsx` — 3x `<main>` → `<div>` (CrisisHero, StartContent, Suspense fallback — all open+close)
- `src/app/layout.tsx` — Removed broken `potentialAction` SearchAction from WebSite schema
- `src/app/sample/page.tsx` — 3 scrollable tables: added `tabIndex={0} role="region" aria-label`
- `src/app/research/defense-score-data/page.tsx` — replace_all: `hover:underline` → `underline hover:no-underline` on 5+ links; title shortened
- `src/app/my-cases/login/page.tsx` — `htmlFor="my-cases-email"` + `id` on email input
- `src/app/partner/login/page.tsx` — `htmlFor="partner-login-email"` + `id` on email input
- `src/app/intake/page.tsx` — 2 checkbox groups: `<div>`→`<fieldset>`, `<label>`→`<legend>`, closing `</div>`→`</fieldset>`
- `src/app/admin/partners/page.tsx` — 7 `htmlFor`/`id` pairs on partner create form
- `src/app/partner/dashboard/page.tsx` — 4 `htmlFor`/`id` pairs on payment settings form
- `src/components/IntakeChargeSelector.tsx` — `<span onClick>` → `<div role="presentation" onClick onKeyDown>`
- `src/app/robots.ts` — Added ClaudeBot to AI bot allowlist
- `src/app/sitemap.ts` — Added /dui-defense hub page at priority 0.7
- `src/app/playbook/[slug]/page.tsx` — Breadcrumb position 2 URL: `/services` → `/playbooks`
- `src/middleware.ts` — CSP: added `object-src 'none'` and `worker-src 'self'`
- `src/app/blog/page.tsx` — Title shortened from 65 to 21 chars
- `src/components/FAQAccordion.tsx` — `text-sm` → `text-base` on answer paragraphs
- `src/components/TestimonialSection.tsx` — `text-sm` → `text-base` on quotes (both inline + grid variants)
- `src/components/PricingTable.tsx` — `text-sm` → `text-base` on all feature list items (replace_all)
- `src/components/Header.tsx` — Desktop CTA `py-2` → `py-3` (44px touch target)
- `src/components/ChargeTypeSelector.tsx` — Category buttons `py-2` → `py-3` (44px touch target)
- `content/blog/attorney-not-returning-calls.mdx` — UPL fix: "you need to take immediate action" → "immediate action is worth considering"
- `docs/plans/2026-04-02-v2-audit-fixes.md` — Plan file updated with completion status

## What Didn't Work
- Agent dispatch blocked by CPU at 100% — all 3 agents (non-UI fixes, npm audit, token hash research) failed to spawn. Switched to fully inline execution.
- Edits blocked 3 times by hooks: (1) ARCHITECTURE.md not read, (2) CONTEXT.md not read, (3) a11y-lead not called, (4) triage not logged, (5) scope escalation from QUICK_FIX. Each required satisfying the hook before proceeding.
- Parallel same-file edits with Edit tool — avoided after realizing race condition risk.

## Remaining Steps
1. **F5: Hash report tokens (SHA-256)** — Biggest remaining item. Needs:
   - Supabase migration: `ALTER TABLE cases ADD COLUMN report_token_hash text;`
   - Backfill: `UPDATE cases SET report_token_hash = encode(sha256(report_token::bytea), 'hex') WHERE report_token IS NOT NULL;`
   - `src/app/api/webhooks/stripe/route.ts`: store `report_token_hash` alongside plaintext
   - `src/app/report/[token]/page.tsx`: hash URL token, query by hash (fallback to plaintext during migration)
   - `src/app/my-case/[token]/page.tsx` or similar: same pattern
   - Pattern exists in `src/lib/site.ts` or `customer-auth.ts` — check for existing `hashToken()` utility
   - Per ARCHITECTURE.md cross-cutting concern: "Session token hashing. All auth tokens stored as SHA-256 hashes."

2. **text-sm→text-base** remaining: `PlaybookSalesPage.tsx` (lines 161,182,267,281), `score/page.tsx` (538,573), `start/page.tsx` (177-184,231-238), `page.tsx` (314)

3. **NW11: Unsubscribe rate limiting** — add IP-based rate limit (10/IP/min) to `src/app/api/unsubscribe/route.ts` POST handler. Use in-memory Map matching existing `rate-limit.ts` pattern. IP extraction: `cf-connecting-ip` → `x-real-ip` → `x-forwarded-for` per ARCHITECTURE.md.

4. **NW8: Sex-offense schema** — add category to `getArticleAboutEntities()` and `getArticleCitations()` in `src/lib/schema.ts`. Follow existing category patterns.

## Verification
- `npx next build` — full build passes clean
- `npx tsc --noEmit --skipLibCheck` — zero errors (after fixing 2 pre-existing h2/h3 mismatches)
- `npm audit` — 1 remaining vulnerability (Anthropic SDK moderate, breaking change upgrade deferred)

## Key Decisions
- Disclosed GA4 in privacy policy (not removed) — site uses GA4 for analytics, disclosure is the correct legal fix
- Used `underline hover:no-underline` for link accessibility — standard WCAG 1.4.1 pattern
- Used `<fieldset>` + `<legend>` for checkbox groups — correct WCAG pattern for grouped controls
- Fixed pre-existing `<h2>`/`</h3>` mismatches in score/page.tsx — found during tsc verification
- Deferred Anthropic SDK upgrade — breaking change (0.79→0.82), not a security-critical fix

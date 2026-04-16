# Handoff: Product Sprint, W1+W2+W6 Done, W3 Blocked, W4 Next
Date: 2026-04-08 19:45

## Task
Executing `C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-08-product-sprint-remaining-work.md`, Workstreams 1-6 of the product sprint. W1+W2+W6 complete. W3 blocked on Anthropic credits. W4 in progress.

## Commits This Session (3)
- `ca8edef`, feat(w1+w2): immigration-impact activation, security-clearance bug fix, collateral/license prompt hardening
- `a998d39`, fix(standalone): two live bugs blocking ALL standalone product generation (orders.updated_at + CLAUDE_MODEL)
- `177ac33`, feat(w6): intake rate limit + SHA-256 token hashing for standalone products

## Files Modified

### Edge Function, `supabase/functions/generate-standalone/index.ts`
- Rewrote collateral-consequences prompt: ban fabricated counts, remove FAFSA drug language (repealed 2023), add offenseClass header, rename Section 1 to "Consequences Landscape"
- Rewrote license-risk prompt: ban fabricated board names when blank, rename Section 4 to "Factors Boards Commonly Consider", add boardNotified + chargeInvolves headers
- Added chargeInvolves header to custody-impact prompt
- Added `case "immigration-impact":`, 8 sections, anti-hallucination on BIA/INA citations
- Added `case "security-clearance":`, 6 sections, SEAD 3/EO 12968/13 Adjudicative Guidelines (closes live prod bug)

### Intake Route, `src/app/api/intake/standalone/[slug]/route.ts`
- Added OPTIONAL_FIELDS_BY_SLUG entries for immigration-impact + security-clearance
- Added rate limit: 5 req/60s per IP via checkRateLimit
- Token lookup now uses SHA-256 hash instead of plaintext

### Webhook, `src/app/api/webhooks/stripe/route.ts`
- Stores `standalone_intake_token_hash` (SHA-256) instead of plaintext `standalone_intake_token`

### Checkout Verify, `src/app/api/checkout/verify/route.ts`
- Removed intake URL reconstruction from DB (token is hash-only now). Success page falls through to "link sent to email" messaging.

### Products, `src/lib/products.ts`
- immigration-impact flipped to `isActive: true`

### Migrations
- `supabase/migrations/20260408i_orders_updated_at.sql`, adds updated_at to orders (applied via Management API)
- `supabase/migrations/20260408j_standalone_intake_token_hash.sql`, adds standalone_intake_token_hash + partial unique index (applied via Management API)

### New Scripts
- `scripts/audit-w3-upl.mjs`, W3 UPL audit harness. Seeds fake orders, invokes Edge Function, polls, downloads HTML. Ready to run once Anthropic credits are topped up.

### Docs
- `supabase/CONTEXT.md`, updated orders table description for new columns

## Live Production Bugs Found + Fixed
1. **orders.updated_at missing**, every standalone product PATCH returned 400 silently. No real customer had completed the full flow yet, so this was latent. Fixed via migration.
2. **CLAUDE_MODEL secret unset**, default model ID was `claude-sonnet-4-6-20250514` (non-existent). Fixed via Supabase secrets API. Set to `claude-sonnet-4-6`.
3. **security-clearance had `isActive: true` but no Edge Function case**, first real purchase would have hit "Unsupported product slug." Fixed by adding the case.

## What Didn't Work
- **W3 UPL audit**, audit harness works end-to-end but Anthropic API credits are depleted. Both local and Supabase API keys return "credit balance too low." Cannot generate any sample reports. 15 scenarios pre-written and ready.
- **sol-calculator activation**, no SOL rules data exists for any state (only `good-time-rules.json` and `diversion-programs.json` exist). Needs dedicated data compilation session.
- **diversion-eligibility activation**, FL data exists (`ImNotAnAttorney/system/data/diversion-programs.json`) but CalculatorClient.tsx has no DIVERSION_STEPS or compute logic yet. A11y-lead reviewed and returned a 7-point checklist (stored in agent output `a54075b88163147cc`).

## Remaining Steps (Priority Order)

### Needs Anthropic Credits First
1. **W3: UPL audit** of custody-impact, expungement-research, sentence-reduction, appeal-viability, ineffective-counsel, run `node scripts/audit-w3-upl.mjs`, audit 15 HTML reports against U1-U15 + P1-P14 + L1-L10, fix prompts, flip isActive.
2. **W5: Blog content**, 23 blog posts need generation. Blocked on same credits.

### No Blockers
3. **W4a: diversion-eligibility**, Build compute logic + wizard steps in CalculatorClient.tsx. FL data at `C:\Users\email\projects\ImNotAnAttorney\system\data\diversion-programs.json`. A11y checklist: dependent state→county dropdown needs aria-live, result rendering as `<ul>` not `<dl>`, per-program UPL hedge in text content not CSS. Defer sol-calculator (no data).
4. **W4c: Content guides**, 5 new ungated pages (courtroom-behavior, court-outfit, jail-visitation, character-reference-letter, attorney-communication). Needs a11y-lead review before implementation.
5. **W4b: Veterans Court Checker**, New calculator. Needs data compilation + a11y review.
6. **W4d: Bundles**, Biggest piece. New checkout path, combined intake, combined report. Architecture decisions in plan lines 189-205.
7. **Engine port investigation**, judge-profile + motion-opportunity-scan need judge_profiles data from ImNotAnAttorney-engine. Decision: port workers, cross-repo Supabase read, or ship with Claude-only + disclaimer.

## Verification Commands
```bash
cd C:/Users/email/projects/ImNotAnAttorney-web

# Verify all 5 Edge Function cases present
grep -n 'case "immigration-impact":\|case "security-clearance":\|case "collateral-consequences":\|case "license-risk":\|case "custody-impact":' supabase/functions/generate-standalone/index.ts

# TypeScript
npx tsc,noEmit,skipLibCheck

# Verify active product count (should be 22)
grep -c "isActive: true" src/lib/products.ts

# Test Anthropic credits (if topped up)
curl -sS -X POST "https://api.anthropic.com/v1/messages" -H "x-api-key: $(grep ANTHROPIC_API_KEY .env.local | cut -d= -f2)" -H "anthropic-version: 2023-06-01" -H "content-type: application/json" -d '{"model":"claude-sonnet-4-6","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}'

# Run W3 audit (after credits topped up)
node scripts/audit-w3-upl.mjs
```

## Key Decisions
- **Token hashing over plaintext**, SHA-256 hash stored in DB, plaintext only in customer email. Matches existing standalone_report_token_hash pattern. Zero existing orders to backfill.
- **Diversion-only for W4a**, SOL calculator deferred (no data). Diversion has FL data ready.
- **W3 deferred to last**, Rahim said to do everything else first, top up credits when all products are complete.

## Ready-to-Paste Next Session Prompt
```
Execute remaining product sprint work from handoff at:
  C:\Users\email\projects\ImNotAnAttorney-web\docs\handoffs\2026-04-08-product-sprint-w1-w2-w6-done.md

W1+W2+W6 complete (3 commits pushed). Start with W4a (diversion-eligibility calculator).
A11y-lead checklist for calculator wizards is in the handoff.
W3 UPL audit and W5 blog content are blocked on Anthropic API credits, defer to last.

Plan file: C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-08-product-sprint-remaining-work.md
Spec file: C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-06-product-specs-all-products.md
```

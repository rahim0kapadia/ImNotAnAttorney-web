# Plan: Arrest Survival Kit ($47) live flip + instant-delivery fix for state-only Tier 9 SKUs

**Date:** 2026-04-22
**Branch:** `feat/ask-live-instant-delivery`
**Size:** small (one webhook fix + E2E + flip)

## Worry

Two related defects block paid revenue on the two lowest-price Tier 9 SKUs:

1. **Arrest Survival Kit ($47)** is fully wired (landing / availability / query / render / email / tier entry) but `live: false` in `src/lib/tiers.ts:333`. Gap: no E2E coverage + unverified delivery flow, so flipping is blind.
2. **District Court Intelligence ($97)** is `live: true` and taking payments, but the Stripe webhook's `hasPrePopulatedIntake` branch in `src/app/api/webhooks/stripe/route.ts:260-263` only checks three slugs (`judge-report-card`, `officer-background-check`, `similar-cases-analyzer`). DCI and ASK both need **state-only** intake. `session.metadata.state` IS set by `/api/checkout/route.ts:167`, but the webhook falls through to the "send intake email asking customer to complete details" branch. Customer pays $97 for an "Instant" delivery SKU, then gets an email asking for the state they already picked. Friction violates the product page's instant-delivery promise and gives refund leverage.

Same one-line pattern break ships the fix for both. Flipping ASK live without this fix would repeat the DCI defect at $47.

## Expert Lens

**Cited expert:** Alex Hormozi — *$100M Offers*, Dream Outcome ÷ (Time Delay × Effort/Sacrifice). Source: `~/.claude/experts/alex-hormozi.md` + *$100M Offers* Ch. 6 "Perceived Likelihood" & Ch. 7 "Time Delay". Applies because ASK/DCI sell on "Instant" delivery (Time Delay = 0) and low Effort/Sacrifice. The webhook bug inserts an intake-email step between payment and delivery — instantly violates both axes. Fix is not aesthetic; it is the value-equation math.

**Secondary lens:** Peep Laja (CXL) — Conversion Research Hierarchy. Source: `~/.claude/experts/peep-laja.md` + cxl.com/institute/. Post-purchase friction on an instant-delivery product is the highest-leverage CRO defect: the customer already paid, buyer's remorse window is open, and every extra step raises refund probability. Fix belongs at Strategic/Architectural layer, not Copywriting.

**Crisis-buyer check (HARD RULE):** 2AM-arrest buyer paid $47/$97. Next email should deliver value in seconds, not demand re-entry of information they just supplied. Anything else = refund trigger + churn. Pass.

## Cascade

| Node | Specific win |
|------|--------------|
| Us | DCI ($97) stops hemorrhaging refund-risk friction; ASK ($47) live-ready with proven instant delivery |
| Direct counterparty (defendant, 2AM crisis) | Pays, receives report inside 60 sec, no repeat questionnaire. Honors the page's "Instant" promise. |
| Their downstream (family / co-defendant / bondsman referrer) | Gets rapid, low-friction referral product at the price point even a stressed family can say yes to |
| Ecosystem (legal-tech, defendant-facing services) | Raises floor — instant-delivery standards under $100 become the baseline competitors must match |
| Future-us | Any future state-only SKU inherits the fix automatically; the webhook allowlist becomes one edit, not a guess |
| Adjacent players (partners / bondsmen) | New cheap SKU they can mention in passing without selling a full $997 story; raises partner-commission base |

No node loses. Bootstrap-consistent (zero spend, reuses existing rails, cuts friction rather than adding features).

## Numbered Tasks

Ordered. Each task ships independently-verifiable state.

1. **Read + confirm the webhook gap**
   - Re-read `src/app/api/webhooks/stripe/route.ts:251-304`. Confirm `hasPrePopulatedIntake` allowlist does not include ASK/DCI.
   - Confirm `/api/checkout/route.ts:167` already sets `session.metadata.state` for standalone products.
   - **Gate:** both confirmed before editing.

2. **Extend `hasPrePopulatedIntake` to cover state-only SKUs**
   - Edit `src/app/api/webhooks/stripe/route.ts` lines ~260-274:
     - Add two OR clauses to `hasPrePopulatedIntake`: one for `district-court-intelligence` (requires `preState`) and one for `arrest-survival-kit` (requires `preState`).
     - Extend the `if/else if` ladder that builds the `intake` object to set `intake = { state: preState }` for those two slugs.
   - Do NOT touch the drip / intake email branch. Do NOT refactor unrelated code.
   - **Gate:** `npx tsc --noEmit --skipLibCheck` clean.

3. **Unit tests for the webhook intake decision**
   - Grep for existing webhook tests: `tests/api/*stripe*` or `tests/api/webhooks/*`.
   - Add minimal Vitest cases asserting:
     - state-only slug + `metadata.state` set -> `hasPrePopulatedIntake === true` path taken, `standalone_intake = { state }` written, `generateTier9Report` triggered.
     - state-only slug + `metadata.state` missing -> falls through to intake-email path (safety).
   - If no webhook test file exists, create `tests/api/webhooks/stripe-prepopulated-intake.test.ts` with pure logic tests (mock Supabase / Stripe).
   - **Gate:** `npx vitest run tests/api/webhooks/` green.

4. **Add E2E spec for the ASK funnel ($0 -> $47 instant-delivery regression lock)**
   - Pattern after `e2e/sentencing-calc.spec.ts` (funnel-lock pattern committed 2026-04-21 in c125f40). Visit `/arrest-survival-kit`, run `AvailabilityChecker` with a state (e.g. AZ — has officer + agency data loaded), confirm `available` result, confirm `buildCheckoutUrl()` points at `/checkout?standaloneProduct=arrest-survival-kit&state=AZ`.
   - Assert CTA text `Get Your Arrest Survival Kit, $47` and enabled state.
   - Do NOT attempt real payment — funnel test locks the $0->$47 path structurally, same pattern as sentencing-calc.
   - **Gate:** `npx playwright test e2e/arrest-survival-kit.spec.ts` green locally.

5. **Flip ASK live: `live: false` -> `live: true` in `src/lib/tiers.ts:333`**
   - Single edit. Replace the "test mode" comment with `// LIVE, 2026-04-22 (webhook instant-delivery fix verified)`.
   - **Gate:** full project build — `npm run build` clean (not just tsc, per `learned-rule-npm-build-not-tsc.md`).

6. **Sample page check (conditional)**
   - Task 6.3 from 2026-04-14 handoff says `/sample/` and `/sample-xray/` should reflect new SKUs. Glob `src/app/sample*/arrest-survival-kit` — if no match, skip + add to follow-up handoff. Never silently drop.

7. **Commit + PR + merge**
   - Commit 1: `fix(webhook): pre-populate intake for state-only tier 9 SKUs (DCI + ASK)` — tasks 2 + 3.
   - Commit 2: `test(e2e): lock $0->$47 arrest-survival-kit funnel against regression` — task 4.
   - Commit 3: `feat(ask): flip Arrest Survival Kit live ($47)` — task 5.
   - PR title: `fix(tier9): instant-delivery for state-only SKUs + ASK $47 live`
   - Merge via `git push origin master` after PR green (per CLAUDE.md — git-push deploys to Vercel imnotanattorney prod project).

8. **Ship telegram**
   - After merge confirmed to prod: `node C:\Users\email\.claude\scripts\telegram\telegram-send.js --bot legal --message "ASK $47 live + DCI instant-delivery fix. $0->$47 funnel locked. E2E green. Two SKU doors open."`

## Success Criteria

- `src/app/api/webhooks/stripe/route.ts` `hasPrePopulatedIntake` expression covers all 5 Tier 9 slugs (3 name-based, 2 state-only).
- Vitest suite green for webhook tests.
- Playwright `e2e/arrest-survival-kit.spec.ts` green locally.
- `src/lib/tiers.ts` `arrest-survival-kit.live === true`.
- `npm run build` green on branch.
- Prod deploy: `/arrest-survival-kit` loads, availability checker returns available for state=AZ, checkout CTA points to `?standaloneProduct=arrest-survival-kit&state=AZ`.
- Telegram sent.

## Out of Scope (noted, never silently dropped)

- State->federal-district mapping (item 3 from backlog) — still blocked on USSC codebook.
- Defense Intelligence Phase 2 rendering in X-Ray/WR/SR (item 1) — engine repo, per CLAUDE.md ecosystem table.
- NPI CA/GA rendering verification (item 2) — follow-up session (5-line triage task: grep officer_external_intel by state, confirm UI renders CA/GA employment history).
- Full Phase 7 sweep (item 5) — separate session.
- Bondsman check-in toggle remaining fixes (item 6) — unchanged from 2026-04-18 handoff.
- Blog sprint — deprioritized per session prompt.

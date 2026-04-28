# Plan: Fix 5-Archetype Post-Purchase E2E Verification

## Worry

E2E script `scripts/e2e-archetype-verify.mjs` ran against prod, all 5 archetypes (A/B/C/D/E) failed. Mix of real prod bugs and script-side gaps.

## Expert Lens

- **Brandur Leach** — operational verification: assert against real DB state, not mocked APIs. Diagnosis pattern that revealed B's missing `after()`.
- **Stripe webhook patterns** — `payment_status: no_payment_required` only flips after Checkout completion; script must complete the session, not just forge events.
- **Vercel runtime gotcha** — fire-and-forget without `after()` is GC'd post-response. Memory: `pattern-after-for-vercel-fire-and-forget.md`.

## Cascade

- **us:** all 5 SKUs verifiable on every deploy, regression caught at PR time
- **direct counterparty (buyers):** archetype-B buyers ACTUALLY get instant report (fixes broken contract today)
- **downstream (operators):** stop seeing stuck reports requiring cron Part 5e retry
- **future-us:** programmatic E2E we can re-run pre-merge / post-deploy
- **ecosystem:** publishable Vercel `after()` lesson for any Next.js + fire-and-forget user

## Diagnoses (root cause per finding)

### B1 — Archetype B never lands report token (REAL PROD BUG)
- **Symptom:** `orders.standalone_report_token_plaintext` is NULL after webhook fires for `arrest-survival-kit` pre-pop intake.
- **Root cause:** `src/app/api/webhooks/stripe/route.ts:275-278` calls `generateTier9Report(...).catch(...)` WITHOUT wrapping in `after()`. Vercel Lambda is killed when the webhook returns 200; the in-flight Promise (storage upload + DB token write) is GC'd before completing.
- **Evidence:** lines 609/682/1156/1160/1230 in the same file ALL use `after()` for the same pattern. The pre-pop branch is the only outlier.
- **Impact:** every availability-checker -> Tier-9 SKU purchase silently fails the "instant generation" promise. Customer waits for cron Part 5e to retry instead of ~60s.

### B2 — Archetype E QA-blocked at consent gate
- **Symptom:** `qa-checkout?tier=case-decoder` returns 400 "Consent required for this tier".
- **Root cause:** `/api/checkout/route.ts:400-404` requires `consent: true` for non-digital tiers. `qa-checkout` does not pass it.
- **Impact:** all service tiers (case-decoder, IB, X-Ray, war-room, situation-room, witness-pack, extra-witness) cannot be QA-tested via the shortcut.

### B3 — Archetypes A/C/D verify endpoint can't be exercised programmatically
- **Symptom:** webhook + DB write PASS, but `/api/checkout/verify` returns `{verified: false}` -> archetype derivation never runs.
- **Root cause:** verify route re-fetches the LIVE Stripe session and gates on `payment_status === paid || no_payment_required`. Forged webhook events do not change the actual session's payment_status. Only Checkout completion flips it.
- **Fix:** rewrite script on Playwright to click through $0 Stripe Checkout (mirror `scripts/qa-e2e-test.mjs` pattern). Stripe then sends a REAL webhook + flips the session state.

### B4 — Cleanup FK violation
- **Symptom:** `DELETE FROM orders WHERE email = QA AND tier = X` throws 23503 from `cases.order_id_fkey`.
- **Root cause:** `cases` has FK to `orders` without `ON DELETE CASCADE`.
- **Fix:** in script cleanup helper, DELETE child rows first: `cases` (by `order_id`).

## Files to Modify

| File | Change |
|---|---|
| `src/app/api/webhooks/stripe/route.ts` | Wrap `generateTier9Report` call at line 275-278 in `after()` |
| `src/app/api/qa-checkout/route.ts` | Pass `consent: true` to `/api/checkout` body |
| `scripts/e2e-archetype-verify.mjs` | Rebuild on Playwright: launch chromium, click through $0 Stripe Checkout, assert post-completion DB + verify state |
| `scripts/CONTEXT.md` | Add row for `e2e-archetype-verify.mjs` |

## Files to Create

None.

## Numbered Tasks

1. **Fix B1** — wrap webhook line 275-278 generateTier9Report call in `after()`. Add comment citing the Vercel-lambda-GC reason.
2. **Fix B2** — `qa-checkout` passes `consent: true` for tier checkouts.
3. **Fix B4** — script cleanup helper deletes `cases` rows first via order_id, then deletes `orders`.
4. **Fix B3 (rewrite)** — replace forged-webhook approach with Playwright click-through. Per-archetype: launch chromium -> goto qa-checkout -> wait for Stripe page -> click submit -> wait for /checkout/success -> poll DB -> call /api/checkout/verify -> assert per-archetype expectations -> cleanup.
5. **Add scripts/CONTEXT.md row** for the new script.
6. **Commit** changes.
7. **Push + auto-deploy** (Vercel: `git push origin chore/e2e-archetype-verify`).
8. **Re-run** `node scripts/e2e-archetype-verify.mjs` against prod after deploy lands.
9. **Open PR** if all 5 archetypes pass.

## Out of Scope

- Adding ON DELETE CASCADE migration to `cases.order_id_fkey` (touches DB schema, separate triage).
- Refactoring all other webhook fire-and-forget call-sites (only the broken one is in scope).
- Refactoring qa-checkout to support all 7 service tiers explicitly (the consent flag is universal).
- Investigating cron Part 5e (the retry path that masks B1 in prod).

## Success Criteria

1. After deploy, `node scripts/e2e-archetype-verify.mjs` exits 0.
2. Each of 5 archetypes returns PASS for: webhook 200 (or Playwright completion), order row written, verify endpoint 200, archetype-specific DB columns set, archetype-specific URLs (downloadUrl/reportUrl/intakeUrl) reachable.
3. Archetype B specifically: `standalone_report_token_plaintext` is non-null within 30s of Stripe Checkout completion.
4. Cleanup runs without 23503 FK errors.
5. PR opened with title "feat(scripts): e2e-archetype-verify — programmatic 5-archetype post-purchase smoke" + the webhook bugfix.

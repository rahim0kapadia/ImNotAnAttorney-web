# Stripe E2E Checkout Tests — Real Payments for All Tiers

## Context

The existing `scripts/e2e-all-pipelines.mjs` tests pipelines 1-6 by directly inserting orders/cases into Supabase (simulating what the webhook WOULD do). This means we've never tested:

1. Does `/api/checkout` create a valid Stripe session with correct metadata?
2. Does a test card payment succeed?
3. Does Stripe fire `checkout.session.completed` and does our webhook receive it?
4. Does the webhook correctly create orders, cases, download tokens, and included-tier cases?

**This plan adds real Stripe checkout to every pipeline.**

## Approach

Use Stripe's internal `/v1/payment_pages/{session_id}/confirm` endpoint to programmatically complete payments in test mode. This is what `stripe trigger` uses under the hood — fires REAL webhooks with real session data.

### Flow per tier:
```
POST /api/checkout → Stripe session URL
  → Extract session ID from URL
  → stripe.paymentMethods.create({ card: { token: "tok_visa" } })
  → POST /v1/payment_pages/{session_id}/confirm
  → Stripe fires checkout.session.completed webhook to production
  → Poll Supabase for order + case creation (max 30s)
  → Continue with intake/delivery/finalize as before
```

### Fallback

If `/v1/payment_pages` fails (undocumented endpoint), fall back to **signed webhook payload**: construct `checkout.session.completed` event, sign with `STRIPE_WEBHOOK_SECRET`, POST directly to our webhook endpoint. Our webhook reads everything from `event.data.object` and doesn't call back to Stripe, so fake IDs work.

## Email Strategy

Per-pipeline unique emails using `+` aliases (all deliver to same catch-all inbox, visible in admin dashboard):

| Pipeline | Email | Why isolated |
|----------|-------|-------------|
| Playbooks | `test+pb-{ts}@imnotanattorney.com` | No upgrade credit with service tiers |
| Case Decoder | `test+cd-{ts}@imnotanattorney.com` | Independent |
| Intelligence Brief | `test+ib-{ts}@imnotanattorney.com` | Independent |
| X-Ray | `test+xr-{ts}@imnotanattorney.com` | Independent |
| War Room | `test+wr-{ts}@imnotanattorney.com` | Shared with SR for prerequisite |
| Situation Room | `test+wr-{ts}@imnotanattorney.com` | Same email → finds WR order → prerequisite passes + upgrade credit |

## New CLI flag

- `--skip-stripe` — Use direct DB inserts instead of Stripe checkout (old behavior, for fast re-runs)

## New Helpers

### `stripeCheckout(tier, email, opts)`
1. POST to `/api/checkout` with `{ tier, email, consent, chargeType, productType }`
2. Parse session ID from returned URL (`cs_test_` prefix regex)
3. `stripe.paymentMethods.create({ type: "card", card: { token: "tok_visa" } })`
4. `fetch("https://api.stripe.com/v1/payment_pages/{sessionId}/confirm", ...)`
5. Call `waitForOrder(sessionId, 30000)`
6. Return order record

### `waitForOrder(stripeSessionId, maxWaitMs)`
- Poll `orders` table every 2s for order matching `stripe_session_id`
- Return order when found, throw on timeout

### `waitForCases(orderId, expectedCount, maxWaitMs)`
- Poll `cases` table every 2s for cases matching `order_id`
- Return cases when count >= expectedCount, throw on timeout

## Pipeline Changes

### Pipeline 1: Playbooks ($97 x8)
```
For each playbook tier:
  stripeCheckout(slug, email, { productType: "digital-product" })
  → Verify: order.status=paid, download_token exists, product_type=digital-product
  → Verify: no cases created (webhook skips case creation for digital products)
```
**Removes:** manual `createTestOrder()` + manual download_token UPDATE

### Pipeline 2: Case Decoder ($197)
```
stripeCheckout("case-decoder", email)
  → Verify: order created, 1 case created (status=awaiting-intake since no prior intake)
  → Continue: callIntake() → insertReport() → callDeliver() → verify delivered
```
**Removes:** manual `createTestOrder()` + `createTestCase()`

### Pipeline 3: Intelligence Brief ($997)
```
stripeCheckout("intelligence-brief", email)
  → Verify: order created, 2 cases created (CD included + IB primary)
  → Continue: intake → CD deliver → IB deliver
```
**Removes:** manual order + 2x case creation

### Pipeline 4: X-Ray ($2,497)
```
stripeCheckout("x-ray", email, { consent: true })
  → Verify: order created, 3 cases (CD + IB included, X-Ray primary)
  → Continue: intake → CD deliver → IB deliver → upload → finalize → X-Ray deliver
```

### Pipeline 5: War Room ($4,997)
```
stripeCheckout("war-room", email, { consent: true })
  → Verify: order created, 4 cases (CD + IB + X-Ray included, WR primary)
  → Continue: full flow
```

### Pipeline 6: Situation Room ($9,997)
```
stripeCheckout("situation-room", email, { consent: true })
  → Uses same email as Pipeline 5
  → Checkout API finds prior WR order → prerequisite passes, $5,000 upgrade credit
  → Verify: order created (amount=$5,000), 5 cases
  → Continue: full flow
```

## Cleanup

Same as before: delete from drip_emails, subscribers, cases, orders, intakes by tracked IDs.
Also clean up per-pipeline emails from subscribers table.
Stripe test mode sessions/charges don't need cleanup.

## Tasks

### Task 1: Add Stripe SDK + new helpers
- Import `Stripe` from `stripe`
- Add `STRIPE_SECRET_KEY` env validation
- Implement `stripeCheckout()`, `waitForOrder()`, `waitForCases()`
- Add `--skip-stripe` CLI flag
- Update email strategy (per-pipeline emails)

### Task 2: Update Pipeline 1 (Playbooks)
- Replace `createTestOrder()` + manual download_token with `stripeCheckout()`
- Verify webhook-created order fields

### Task 3: Update Pipeline 2 (Case Decoder)
- Replace `createTestOrder()` + `createTestCase()` with `stripeCheckout()`
- Verify webhook creates case with correct status
- Keep intake/delivery flow as-is

### Task 4: Update Pipelines 3-6
- Same pattern: `stripeCheckout()` replaces manual DB inserts
- Verify webhook creates correct number of cases with correct statuses
- Keep intake/delivery/finalize flow as-is

### Task 5: Update cleanup + run + fix
- Update cleanup to handle per-pipeline emails
- Run full suite, fix any issues
- Verify Stripe dashboard shows test charges

## Verification

1. `node scripts/e2e-all-pipelines.mjs` — all pipelines pass with real Stripe payments
2. Stripe dashboard (test mode) shows 13+ test charges
3. Supabase has no leftover test data
4. Admin email dashboard shows all delivery emails
5. `--skip-stripe` mode still works (fast re-runs)

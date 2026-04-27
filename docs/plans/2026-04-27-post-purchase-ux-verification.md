# Post-Purchase UX Fix — Manual Verification Plan

**File:** `docs/plans/2026-04-27-post-purchase-ux-verification.md`
**Date:** 2026-04-27
**Branch:** `fix/post-purchase-ux-archetypes`
**Parent plan:** `docs/plans/2026-04-27-post-purchase-ux-fix-plan.md`
**Operator:** Rahim Kapadia

---

## Section 1: Background

A live test purchase of `arrest-survival-kit` ($47) landed on the success page
and rendered the generic "Your Analysis Is Being Built / Thank you for your
purchase. Check your email" fallback — no download link, no progress signal,
no product-specific copy. The post-Apex smoke test (`docs/plans/2026-04-27-post-apex-smoke-test.md`)
surfaced this as an open gap across all 10 Tier 9 SKUs and the hardcoded heading
block shared by all 52 paid SKUs.

PR `fix/post-purchase-ux-archetypes` patches the root cause: a per-archetype
heading function, corrected CTA logic for Tier 9 instant SKUs (archetypes B and
C), and 10 new `TIER_NEXT_STEPS` entries. Full structural analysis in
`docs/plans/2026-04-27-post-purchase-ux-fix-plan.md` §1–2. This document gives
the operator a concrete step-by-step test for each of the 5 affected archetypes
plus a regression case, using the internal QA coupon (100% off) on production.

---

## Section 2: Test Environment

| Parameter | Value |
|---|---|
| Production URL | `https://imnotanattorney.com` |
| QA shortcut route | `/api/qa-checkout?key=<KEY>&tier=<slug>` or `&product=<slug>` |
| Coupon | `INTERNAL_QA_COUPON_ID` env — 100% off, no real charge |
| QA email | `INTERNAL_QA_EMAIL` env value (do not print here; check inbox of that address post-purchase) |
| Stripe test card | Use real card on file — coupon zeroes the amount |

**Purchase sequence (all 5 tests follow this flow):**

1. Open the QA URL in a browser (replace `<KEY>` with `OPERATOR_SECRET` env value).
2. Stripe Checkout opens — coupon auto-applies (line-item shows $0.00).
3. Complete checkout. If Stripe prompts for a card, add any valid card; charge will be $0.
4. Success page renders at `/checkout/success?session_id=...&product=<slug>` (Tier 9 / standalone) or `?tier=<slug>` (playbook / service tier).
5. Open inbox for `INTERNAL_QA_EMAIL`. Confirm delivery email arrives within expected window.
6. Mark pass/fail against the checklist in the relevant section below.

---

## Section 3: Archetype Tests

### Test A — Archetype A: Playbook PDF (instant download)

**SKU:** `dui-first-offense` | **Price:** $127 | **Delivery:** Instant download

**QA URL:**
```
https://imnotanattorney.com/api/qa-checkout?key=<KEY>&tier=dui-first-offense
```

**Pre-purchase setup:** None. Navigate directly to the QA URL.

**Expected success page:**

| Element | Expected value |
|---|---|
| `<h1>` heading | `Your DUI First Offense Defense Guide Is Ready` (or equivalent with product name) |
| Download CTA | Visible button: "Download Your Guide" or equivalent |
| Emergency download link | Present (secondary fallback link) |
| "Next: Complete Your Details" CTA | **Must NOT appear** |
| Generic fallback copy | **Must NOT appear** |

**Expected email (inbox `INTERNAL_QA_EMAIL`):**

| Element | Expected |
|---|---|
| Arrival time | Within 2 minutes |
| Subject | Contains "DUI" and "download" or "guide" |
| Body | Contains a direct download link (`imnotanattorney.com/...` or Supabase Storage URL) |
| URL shape | Download token present in URL |

**Pass/Fail Checklist:**
- [ ] Heading contains product name, NOT "Your Analysis Is Being Built"
- [ ] Download button renders on success page
- [ ] Emergency download link renders on success page
- [ ] No intake CTA present
- [ ] Email arrives within 2 minutes
- [ ] Email contains working download link
- [ ] Screenshot captured → attach to PR

---

### Test B — Archetype B: Tier 9 Instant (pre-populated intake)

**SKU:** `arrest-survival-kit` | **Price:** $47 | **Delivery:** Instant — pre-purchase data auto-generates report

**QA URL:**
```
https://imnotanattorney.com/api/qa-checkout?key=<KEY>&product=arrest-survival-kit
```

**Pre-purchase setup:**

Visit the dedicated landing page first:
```
https://imnotanattorney.com/arrest-survival-kit
```
Complete the AvailabilityChecker form (charge type, state, any required fields).
Then click "Get Yours" or equivalent CTA — this seeds the Stripe metadata with
pre-purchase data that triggers auto-generation in the webhook.

Alternatively, use the QA shortcut URL directly. Note: without AvailabilityChecker
pre-population, the webhook may fall back to the intake-email path (archetype C
behaviour). Both outcomes have defined success criteria; confirm which path fired
by checking operator email for "Pre-populated intake" vs "intake link sent" log.

**Expected success page:**

| Element | Expected value |
|---|---|
| `<h1>` heading | `Your Arrest Survival Kit Is Ready` |
| Body copy | Contains "generating now" and "60 seconds" and reference to `INTERNAL_QA_EMAIL` inbox |
| "Next: Complete Your Details" CTA | **Must NOT appear** |
| Intake form link | **Must NOT appear** as primary CTA |
| Generic fallback copy | **Must NOT appear** |

**Expected email (inbox `INTERNAL_QA_EMAIL`):**

| Element | Expected |
|---|---|
| Arrival time | Within 3 minutes (webhook fires async) |
| Subject | Contains "Arrest Survival Kit" or "report ready" |
| Body | Contains link to report viewer (`/report/standalone/...`) |
| URL shape | Report token present in URL path |

**Pass/Fail Checklist:**
- [ ] Heading reads "Your Arrest Survival Kit Is Ready" (not "Your Analysis Is Being Built")
- [ ] "generating now" copy present on success page
- [ ] No "Complete Your Details" intake CTA on success page
- [ ] Operator email for QA account shows "Pre-populated intake generated" (check INTERNAL_QA_EMAIL inbox or operator digest)
- [ ] Customer email arrives with report link within 3 minutes
- [ ] Report link resolves (HTTP 200 or redirect to viewer, not 404/403)
- [ ] Screenshot of success page captured → attach to PR
- [ ] Screenshot of email captured → attach to PR

---

### Test C — Archetype C: Tier 9 Instant (intake required before generation)

**SKU:** `charge-authority-pack` | **Price:** $97 | **Delivery:** Instant after intake submission

**QA URL:**
```
https://imnotanattorney.com/api/qa-checkout?key=<KEY>&product=charge-authority-pack
```

**Pre-purchase setup:**

Visit the dedicated landing page:
```
https://imnotanattorney.com/charge-authority-pack
```
Complete the AvailabilityChecker form. Proceed to checkout via the QA URL above.

Unlike archetype B, the webhook for `charge-authority-pack` does not auto-generate
from pre-purchase metadata alone. It emails the intake link; the customer submits
intake; report generates within 60 seconds of submission.

**Expected success page:**

| Element | Expected value |
|---|---|
| `<h1>` heading | `Almost There — One Step Left` |
| Body copy | States intake link sent to `INTERNAL_QA_EMAIL`; instructs to click link (about 2 minutes); report renders within 60 seconds of submission |
| "Next: Complete Your Details" CTA | Present (correct for this archetype) |
| Generic "thank you" fallback | **Must NOT appear** |

**Expected email (inbox `INTERNAL_QA_EMAIL`):**

| Element | Expected |
|---|---|
| Arrival time | Within 2 minutes |
| Subject | Contains "Charge Authority Pack" or "intake" or "one step left" |
| Body | Contains intake form link (`/intake/...?token=...`) |
| URL shape | Intake token present |

**Pass/Fail Checklist:**
- [ ] Heading reads "Almost There — One Step Left" (not "Your Analysis Is Being Built")
- [ ] Success page body references `INTERNAL_QA_EMAIL` inbox
- [ ] Intake CTA present and correctly labelled
- [ ] Email arrives within 2 minutes
- [ ] Email contains working intake link
- [ ] Intake form loads (HTTP 200, not 404/403)
- [ ] (Optional) Submit intake form → confirm report generates within 60 seconds
- [ ] Screenshot of success page captured → attach to PR

---

### Test D — Archetype D: Standalone Research (intake-then-60s) — REGRESSION

**SKU:** `employment-impact` | **Price:** $197 | **Delivery:** <60 seconds after intake

> **Regression test.** Archetype D was working before the fix. This confirms the
> PR did not break the existing standaloneProduct branch for standalone research SKUs.
> Per parent plan §3 Task B: "confirm employment-impact — regression."

**QA URL:**
```
https://imnotanattorney.com/api/qa-checkout?key=<KEY>&product=employment-impact
```

**Pre-purchase setup:** None. Navigate directly to the QA URL. No AvailabilityChecker
landing page required for standalone research SKUs; intake is collected post-purchase.

**Expected success page:**

| Element | Expected value |
|---|---|
| `<h1>` heading | `Almost There — One Step Left` |
| Body copy | References intake link sent to `INTERNAL_QA_EMAIL`; mentions <60 second delivery after submission |
| Intake CTA | Present |
| Download button | **Must NOT appear** |
| Generic fallback | **Must NOT appear** |

**Expected email (inbox `INTERNAL_QA_EMAIL`):**

| Element | Expected |
|---|---|
| Arrival time | Within 2 minutes |
| Subject | Contains "Employment Impact" or "intake" |
| Body | Contains intake form link |

**Pass/Fail Checklist:**
- [ ] Heading reads "Almost There — One Step Left" (REGRESSION: same as pre-fix)
- [ ] Intake CTA present on success page
- [ ] No download buttons present
- [ ] Email arrives within 2 minutes
- [ ] Email contains working intake link
- [ ] **No regression:** success page is visually equivalent to pre-fix behaviour for this SKU
- [ ] Screenshot captured → attach to PR

---

### Test E — Archetype E: Service Tier (intake → 48h+)

**SKU:** `case-decoder` | **Price:** $197 | **Delivery:** 48 hours

**QA URL:**
```
https://imnotanattorney.com/api/qa-checkout?key=<KEY>&tier=case-decoder
```

**Pre-purchase setup:** None. Navigate directly to the QA URL.

**Expected success page:**

| Element | Expected value |
|---|---|
| `<h1>` heading | `Your Order Is Confirmed` |
| Body copy | Confirms order and intake step; references 48-hour delivery timeline; references `INTERNAL_QA_EMAIL` |
| Intake CTA | Present (prompts user to complete case details) |
| "Your Analysis Is Being Built" | **Must NOT appear** |
| Download button | **Must NOT appear** |

**Expected email (inbox `INTERNAL_QA_EMAIL`):**

| Element | Expected |
|---|---|
| Arrival time | Within 5 minutes (drip sequence start) |
| Subject | Contains "Case Decoder" or order confirmation |
| Body | Contains intake instructions or link; references 48-hour delivery |

**Pass/Fail Checklist:**
- [ ] Heading reads "Your Order Is Confirmed" (not "Your Analysis Is Being Built")
- [ ] Intake CTA renders correctly
- [ ] No download buttons present
- [ ] Email arrives within 5 minutes
- [ ] Email copy references 48-hour delivery (not 60 seconds)
- [ ] Screenshot captured → attach to PR

---

## Section 4: Pre-Merge Sign-Off

Run this checklist before approving the PR. Mirrors parent plan §4.3.

- [ ] `npm run build` exits 0 — no TypeScript errors
- [ ] `npm test` exits 0 — Vitest suite passes, including 5+ new archetype tests from Task C1
- [ ] All 5 manual test purchases completed (Tests A–E above)
- [ ] All 5 screenshots attached to the PR description
- [ ] Brand-voice / UPL audit completed (Task A5 Opus sign-off): no advice, no outcome promise, no banned words
- [ ] `prepopulated-intake.ts` covers all 10 Tier 9 SKUs — or each gap explicitly documented as a deferred follow-up in the PR description
- [ ] No edits to `content/blog/`, `scripts/blog-pipeline/`, `scripts/qa-existing-post*`
- [ ] No Stripe price ID, URL slug, or DB tier_slug changes
- [ ] Heading mismatch ("Your Analysis Is Being Built") absent from all 5 test-purchase screenshots

---

## Section 5: Post-Merge Smoke

Run after `git push origin master` lands and Vercel deployment completes (~2 min).

**One-liner:**

```bash
for sku in dui-first-offense arrest-survival-kit charge-authority-pack employment-impact case-decoder; do
  echo "=== $sku ==="
  curl -sf "https://imnotanattorney.com/checkout/success?session_id=cs_test_smoke&product=$sku" \
    -o "/tmp/smoke-$sku.html" && \
    node -e "const fs=require('fs'); const h=fs.readFileSync('/tmp/smoke-$sku.html','utf8'); console.log(h.includes('Your Analysis Is Being Built') ? 'FAIL: old heading present' : 'OK: old heading absent');"
done
```

**Expected output (all five lines):**

```
=== dui-first-offense ===
OK: old heading absent
=== arrest-survival-kit ===
OK: old heading absent
=== charge-authority-pack ===
OK: old heading absent
=== employment-impact ===
OK: old heading absent
=== case-decoder ===
OK: old heading absent
```

If any line prints `FAIL: old heading present`, the new heading function is not
rendering for that SKU. Check that the `?product=` vs `?tier=` resolver in
`src/lib/checkout/post-purchase.ts` covers the slug and that the Vercel deployment
is fully propagated (wait 60 seconds and retry before escalating).

Note: this smoke uses a synthetic `cs_test_smoke` session_id, so the verify endpoint
will return unverified. The test only confirms the old hardcoded heading string is
absent from the HTML. Full archetype-specific heading verification (e.g., confirming
"Your Arrest Survival Kit Is Ready" renders) requires real session_ids from the
§4.1.3 manual tests in the parent plan.

---

## Section 6: Rollback

If a customer reports a regression after merge, revert is immediate:

```bash
git revert <merge-sha> && git push origin master
```

Vercel detects the push and auto-redeploys. Total recovery time: approximately
3 minutes from command to production. No database migrations are involved in this
PR (parent plan §2.4 defers the `post-purchase-redirect` endpoint to v2), so revert
is fully atomic. The single-PR ship strategy (parent plan §4.2) means one revert
covers all 52 SKUs simultaneously — no partial rollback needed.

Reference: `docs/plans/2026-04-27-post-purchase-ux-fix-plan.md` §4.5 Rollback Plan.

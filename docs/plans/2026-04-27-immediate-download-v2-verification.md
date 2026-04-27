# Immediate-Download v2 — Manual Verification Plan

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-27-immediate-download-v2-verification.md`
**Date:** 2026-04-27
**Branch:** `feat/immediate-download-v2`
**Parent plan:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-27-immediate-download-v2.md`
**Predecessor doc:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-27-post-purchase-ux-verification.md` (v1 archetype-aware copy verification — structural template for this doc)
**Operator:** Rahim Kapadia

---

## Section 1: Background

PRs #213 + #214 (v1) shipped archetype-aware heading + body copy on `/checkout/success`. Customers landed on the right page, but the actual `reportUrl` (archetype B) and `intakeUrl` (archetypes C/D) still required leaving the page and digging through email. That was the documented v1 trade — tokens were hash-only at rest, so the verify endpoint had nothing safe to surface.

v2 closes the loop. The webhook + `generateTier9Report` now write plaintext alongside hash with a 30-min `plaintext_tokens_expires_at` TTL. The verify endpoint surfaces `reportUrl` / `intakeUrl` / `archetype` only while the TTL is live. The success page polls verify every 4s for archetype B (60s timeout, 15 polls) and renders the in-page CTA the moment it arrives. An hourly cron at `/api/cron/scrub-plaintext-tokens` NULLs expired plaintext rows; a manual `node scripts/scrub-plaintext-tokens.mjs` exists for emergency response.

Full structural analysis in `C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-27-immediate-download-v2.md` §1–4. This document gives the operator a step-by-step manual verification plan for each of the 5 archetypes plus the new TTL boundary tests, the cron scrub test, and the post-deploy smoke.

What's NEW vs the v1 verification doc:
- Archetype B success-page test now covers the **polling state machine** (loading → spinner card → "View Your Report" button) instead of just confirming "generating now" copy.
- Archetype C/D success-page tests now expect an **in-page "Continue to Intake" button** (not just email-only delivery).
- Three **TTL boundary tests** (Section 4) — within window, past window, polling timeout.
- A **cron scrub verification** (Section 5) — manual trigger + pre/post DB state.
- Post-deploy smoke (Section 7) extended to grep for the new state markers and confirm the cron-job.org registration.

---

## Section 2: Test Environment

| Parameter | Value |
|---|---|
| Production URL | `https://imnotanattorney.com` |
| QA shortcut route | `/api/qa-checkout?key=<KEY>&tier=<slug>` or `&product=<slug>` |
| Coupon | `INTERNAL_QA_COUPON_ID` env value — 100% off, no real charge |
| QA email | `INTERNAL_QA_EMAIL` env value (do not print here; check inbox of that address post-purchase) |
| Stripe test card | Use real card on file — coupon zeroes the amount |
| Operator secret | `OPERATOR_SECRET` env value — substitute for `<KEY>` placeholder in QA URLs |
| Cron auth token | `CRON_AUTH_TOKEN` env value — substitute for `<CRON_TOKEN>` in cron curls |

**Polling cadence (archetype B only — NEW in v2):** the success page calls `/api/checkout/verify` immediately on mount, then every 4 seconds, up to 15 polls (60-second total budget). Operator should expect "View Your Report" to appear in-page within ~30 seconds for a healthy `generateTier9Report` run. After 60 seconds with no `reportUrl`, the page swaps to email-fallback copy and stops polling.

**Plaintext TTL (NEW in v2):** plaintext intake/report URLs are visible in the verify response only while `plaintext_tokens_expires_at > NOW()`. TTL is 30 minutes from mint. After expiry, the verify response omits `intakeUrl` / `reportUrl`; success page falls back to "check your email" copy. Email link continues to work indefinitely (long-TTL hash unaffected).

**Purchase sequence (Tests A–E follow this flow):**

1. Open the QA URL in a browser (replace `<KEY>` with `OPERATOR_SECRET` env value).
2. Stripe Checkout opens — coupon auto-applies (line-item shows $0.00).
3. Complete checkout. If Stripe prompts for a card, add any valid card; charge will be $0.
4. Success page renders at `/checkout/success?session_id=...&product=<slug>` (Tier 9 / standalone) or `?tier=<slug>` (playbook / service tier).
5. Capture screenshots at the three relevant states for each archetype (see per-test instructions).
6. Open inbox for `INTERNAL_QA_EMAIL`. Confirm delivery email arrives within expected window AND email link continues to work as backup.
7. Mark pass/fail against the checklist in the relevant section below.

---

## Section 3: Five Archetype Tests (v2 Expectations)

### Test A — Archetype A: Playbook PDF (instant download) — REGRESSION

**SKU:** `dui-first-offense` | **Price:** $127 | **Delivery:** Instant download

> **Regression test.** Archetype A worked in v1 via the existing `download_token` plaintext-at-rest path. v2 must not regress that behavior. The `archetype === "A"` branch on the success page should render exactly as it did pre-PR.

**QA URL:**
```
https://imnotanattorney.com/api/qa-checkout?key=<KEY>&tier=dui-first-offense
```

**Pre-purchase setup:** None. Navigate directly to the QA URL.

**Expected success page (v2 = same as v1 for this archetype):**

| Element | Expected value |
|---|---|
| `<h1>` heading | `Your DUI First Offense Defense Guide Is Ready` (or equivalent with product name) |
| Download CTA | Visible button: "Download Your Guide" or equivalent |
| Emergency download link | Present (secondary fallback link) |
| "Continue to Intake" CTA | **Must NOT appear** |
| "View Your Report" CTA | **Must NOT appear** |
| Generic fallback copy | **Must NOT appear** |
| Polling spinner | **Must NOT appear** |

**Expected v2 verify response shape:**

```json
{
  "verified": true,
  "archetype": "A",
  "downloadUrl": "https://...",
  "emergencyDownloadUrl": "https://...",
  // NO intakeUrl, NO reportUrl
}
```

**Expected email (inbox `INTERNAL_QA_EMAIL`):**

| Element | Expected |
|---|---|
| Arrival time | Within 2 minutes |
| Subject | Contains "DUI" and "download" or "guide" |
| Body | Contains a direct download link |
| URL shape | Download token present in URL |

**Pass/Fail Checklist:**
- [ ] `archetype` field in verify response equals `"A"`
- [ ] Heading contains product name, NOT "Your Analysis Is Being Built"
- [ ] Download button renders on success page
- [ ] Emergency download link renders on success page
- [ ] No intake CTA, no report CTA, no spinner
- [ ] Email arrives within 2 minutes
- [ ] Email contains working download link
- [ ] Screenshot captured → attach to PR

---

### Test B — Archetype B: Tier 9 Instant + Pre-populated Intake (NEW v2 BEHAVIOR)

**SKU:** `arrest-survival-kit` | **Price:** $47 | **Delivery:** Instant — pre-purchase data auto-generates report

**Key v2 change:** v1 surfaced only "generating now / link sent to email" copy. v2 surfaces an in-page "View Your Report" button the moment `reportUrl` arrives via polling. Customer never has to leave the page to read the report.

**QA URL:**
```
https://imnotanattorney.com/api/qa-checkout?key=<KEY>&product=arrest-survival-kit
```

**Pre-purchase setup:**

Visit the dedicated landing page first:
```
https://imnotanattorney.com/arrest-survival-kit
```
Complete the AvailabilityChecker form (charge type, state, any required fields). Then click the primary CTA — this seeds Stripe metadata with pre-purchase data that triggers auto-generation in the webhook (archetype B path).

If the AvailabilityChecker is skipped, the webhook will fall back to the intake-email path (archetype C behavior). Confirm which path fired by checking the operator email or by inspecting `archetype` in the verify response on the success page.

**Three states to capture:**

**State 1 — initial mount (within ~5 seconds of redirect):**

| Element | Expected value |
|---|---|
| `<h1>` heading | `Your Arrest Survival Kit Is Ready` (or v2 equivalent) |
| Body copy | Contains "Generating now" or "Your report is on the way" |
| Spinner | Visible with `role="status"` and `aria-live="polite"` |
| "View Your Report" button | **Must NOT appear yet** |
| `archetype` in verify response | `"B"` |
| `reportUrl` in verify response | absent (still generating) |

**State 2 — poll-active / report ready (~15–30 seconds in):**

| Element | Expected value |
|---|---|
| `<h1>` heading | `Your report is ready` (or v2 equivalent) |
| Body copy | Confident, terse — Mercer voice. No "we'll prepare your case" filler. |
| **"View Your Report" button** | **Visible.** Button targets `reportUrl` from verify response (path matches `/report/standalone/<token>`). |
| Spinner | Removed |
| `reportUrl` in verify response | Present, plaintext URL |

**State 3 — click-through:**

| Element | Expected value |
|---|---|
| Click "View Your Report" | Navigates to the report viewer page |
| Report viewer | Renders report content (HTTP 200, NOT 404/403) |

**Expected email (still fires in parallel — backup channel, MUST continue to work):**

| Element | Expected |
|---|---|
| Arrival time | Within 3 minutes (webhook fires async) |
| Subject | Contains "Arrest Survival Kit" or "report ready" |
| Body | Contains link to report viewer |
| URL shape | Report token present; same `/report/standalone/<token>` path as in-page button |
| Backup test | Open the email link in a private window — must still resolve |

**Pass/Fail Checklist:**
- [ ] `archetype` field in verify response equals `"B"`
- [ ] State 1: heading + spinner + body copy correct, NO "View Your Report" button yet
- [ ] State 2: "View Your Report" button appears within 60 seconds (target ~30s)
- [ ] State 2: spinner removed cleanly (no double-render)
- [ ] State 3: button click navigates to working report viewer
- [ ] Email arrives within 3 minutes with working report link (backup path intact)
- [ ] Polling stops once `reportUrl` arrives — no further `/api/checkout/verify` calls in network tab
- [ ] No browser console errors during polling lifecycle
- [ ] State 1 + State 2 screenshots captured → attach to PR
- [ ] Brand voice: copy reads confident/terse (Mercer), not warm-warm
- [ ] UPL: no "you should...", no "we recommend..." in any state

---

### Test C — Archetype C: Tier 9 Instant + Intake Required (NEW v2 BEHAVIOR)

**SKU:** `charge-authority-pack` | **Price:** $97 | **Delivery:** Instant after intake submission

**Key v2 change:** v1 success page told the customer "intake link sent to email" with no in-page action. v2 surfaces a "Continue to Intake" button targeting the plaintext `intakeUrl` from verify, so the customer can move forward in one click without leaving the page.

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

Unlike archetype B, the webhook for `charge-authority-pack` does not auto-generate from pre-purchase metadata alone. The intake URL is plaintext-at-rest within TTL; report generates within 60 seconds of intake submission.

**Expected success page (v2):**

| Element | Expected value |
|---|---|
| `<h1>` heading | `One step left` (or v2 Mercer-voice equivalent) |
| Body copy | Terse, confident — references intake step. References `INTERNAL_QA_EMAIL` as backup. |
| **"Continue to Intake" button** | **Visible.** Button targets `intakeUrl` from verify response (path matches `/intake/standalone/<slug>?token=...`). |
| Spinner | Must NOT appear (this archetype does not poll) |
| Download button | **Must NOT appear** |
| Generic "thank you" fallback | **Must NOT appear** |

**Expected v2 verify response shape:**

```json
{
  "verified": true,
  "archetype": "C",
  "intakeUrl": "https://imnotanattorney.com/intake/standalone/charge-authority-pack?token=...",
  // NO reportUrl (not yet generated), NO downloadUrl
}
```

**Expected email (backup channel — MUST continue to work):**

| Element | Expected |
|---|---|
| Arrival time | Within 2 minutes |
| Subject | Contains "Charge Authority Pack" or "intake" or "one step left" |
| Body | Contains intake form link |
| URL shape | Intake token present; same `/intake/standalone/<slug>?token=...` path as in-page button |

**Pass/Fail Checklist:**
- [ ] `archetype` field in verify response equals `"C"`
- [ ] Heading is Mercer-voice (terse, confident); not v1 "Almost There — One Step Left"
- [ ] **"Continue to Intake" button visible immediately on mount (no polling required)**
- [ ] Button click navigates to the intake form (HTTP 200)
- [ ] Intake form pre-loads with token-gated session (no 401/403)
- [ ] No spinner, no download button, no generic fallback
- [ ] Email arrives within 2 minutes with intake link
- [ ] Email link continues to resolve (backup path intact)
- [ ] (Optional) Submit intake → confirm report generates within 60 seconds
- [ ] Screenshot captured → attach to PR
- [ ] UPL: no advice copy, no outcome promises

---

### Test D — Archetype D: Standalone Research + Intake Required (NEW v2 BEHAVIOR)

**SKU:** `employment-impact` | **Price:** $197 | **Delivery:** <60 seconds after intake submission

**Key v2 change:** v1 left this archetype on email-only delivery. v2 surfaces "Continue to Intake" in-page exactly like archetype C. Per parent plan §1.2, archetypes C and D share the same render branch — different upstream data path, identical success-page behavior.

**QA URL:**
```
https://imnotanattorney.com/api/qa-checkout?key=<KEY>&product=employment-impact
```

**Pre-purchase setup:** None. Navigate directly to the QA URL. No AvailabilityChecker landing page required for archetype-D standalone research SKUs; intake is collected post-purchase.

**Expected success page (v2):**

| Element | Expected value |
|---|---|
| `<h1>` heading | `One step left` (or v2 Mercer-voice equivalent — same shape as archetype C) |
| Body copy | References intake step + `INTERNAL_QA_EMAIL` backup; mentions <60 second delivery after submission |
| **"Continue to Intake" button** | **Visible.** Button targets `intakeUrl` from verify response. |
| Spinner | Must NOT appear |
| Download button | **Must NOT appear** |
| Generic fallback | **Must NOT appear** |

**Expected v2 verify response shape:**

```json
{
  "verified": true,
  "archetype": "D",
  "intakeUrl": "https://imnotanattorney.com/intake/standalone/employment-impact?token=...",
}
```

**Expected email (backup channel):**

| Element | Expected |
|---|---|
| Arrival time | Within 2 minutes |
| Subject | Contains "Employment Impact" or "intake" |
| Body | Contains intake form link |

**Pass/Fail Checklist:**
- [ ] `archetype` field in verify response equals `"D"`
- [ ] **"Continue to Intake" button visible immediately on mount**
- [ ] No download buttons, no spinner, no generic fallback
- [ ] Button click resolves to working intake form
- [ ] Email arrives within 2 minutes
- [ ] Email link continues to resolve (backup path intact)
- [ ] Render branch is identical to archetype C — no D-specific divergence on the success page
- [ ] Screenshot captured → attach to PR

---

### Test E — Archetype E: Service Tier (intake → 48h+) — UNCHANGED FROM v1

**SKU:** `case-decoder` | **Price:** $197 | **Delivery:** 48 hours

> **Regression test.** Service tiers are explicitly out of scope per parent plan §1.2 — TIER_NEXT_STEPS copy must remain untouched. v2 must not regress this branch.

**QA URL:**
```
https://imnotanattorney.com/api/qa-checkout?key=<KEY>&tier=case-decoder
```

**Pre-purchase setup:** None.

**Expected success page (v2 = same as v1):**

| Element | Expected value |
|---|---|
| `<h1>` heading | `Your Order Is Confirmed` |
| Body copy | Confirms order + intake step; references 48-hour delivery; references `INTERNAL_QA_EMAIL` |
| Intake CTA | Present (existing TIER_NEXT_STEPS copy) |
| `archetype` in verify response | `"E"` |
| "View Your Report" button | **Must NOT appear** |
| Polling spinner | **Must NOT appear** |
| Download button | **Must NOT appear** |

**Expected email:** unchanged from v1 — drip-sequence start within 5 minutes; references 48-hour delivery.

**Pass/Fail Checklist:**
- [ ] `archetype` field in verify response equals `"E"`
- [ ] Heading reads "Your Order Is Confirmed" (v1 baseline)
- [ ] TIER_NEXT_STEPS intake CTA renders correctly
- [ ] No new v2 elements (button, spinner) intrude
- [ ] Email arrives within 5 minutes
- [ ] Email copy references 48-hour delivery, not 60 seconds
- [ ] Screenshot captured → attach to PR

---

## Section 4: TTL Boundary Tests (NEW for v2)

These tests confirm the 30-min plaintext TTL is enforced by the verify endpoint and the success page. Required: ability to run direct SQL against the live Supabase via `npx supabase db query --linked` or the equivalent.

### Test 4.1 — Within window (happy path)

**Setup:** Complete a fresh archetype C purchase (e.g. `charge-authority-pack` per Test C). Note the timestamp of webhook completion.

**Action:** Within 5 minutes of purchase, hit the success page directly:
```
https://imnotanattorney.com/checkout/success?session_id=<cs_test_xxx>&product=charge-authority-pack
```

**Expected:**
- [ ] Verify response includes `intakeUrl`
- [ ] "Continue to Intake" button visible in-page

### Test 4.2 — Past window (TTL expiry)

**Setup:** Pick an order from Test 4.1 (or any prior archetype B/C/D test). Manually expire its plaintext window:

```sql
-- Run via npx supabase db query --linked (or psql via PG env vars per
-- pattern-pg-env-vars-for-psql.md)
UPDATE orders
SET plaintext_tokens_expires_at = NOW() - interval '1 minute'
WHERE stripe_session_id = '<cs_test_xxx>';
```

Verify the row state before continuing:
```sql
SELECT
  stripe_session_id,
  plaintext_tokens_expires_at,
  standalone_intake_token IS NOT NULL AS intake_plaintext_present,
  standalone_report_token_plaintext IS NOT NULL AS report_plaintext_present,
  standalone_intake_token_hash IS NOT NULL AS intake_hash_present,
  standalone_report_token_hash IS NOT NULL AS report_hash_present
FROM orders
WHERE stripe_session_id = '<cs_test_xxx>';
```

Expect: `plaintext_tokens_expires_at` in the past; plaintext columns still populated (cron has not yet scrubbed); hash columns intact.

**Action:** Reload the success page for that session_id.

**Expected:**
- [ ] Verify response **omits** `intakeUrl` (TTL guard kicks in even with plaintext still in DB)
- [ ] Verify response **omits** `reportUrl`
- [ ] Success page falls back to "check your email" copy
- [ ] In-page "Continue to Intake" / "View Your Report" buttons absent
- [ ] Email link continues to resolve (long-TTL hash unaffected)
- [ ] `archetype` field still present and correct in verify response

### Test 4.3 — Polling timeout (archetype B simulated stall)

**Setup:** Complete a fresh archetype B purchase (e.g. `arrest-survival-kit` per Test B). Immediately after the webhook fires but before the report generates (within ~5 seconds of redirect), force the report path to never populate:

```sql
-- Simulate a stalled generateTier9Report by clearing the report plaintext
-- before it gets written. NOTE: this is a destructive test — only run
-- against test-coupon orders.
UPDATE orders
SET standalone_report_token_plaintext = NULL,
    standalone_report_token_hash = NULL
WHERE stripe_session_id = '<cs_test_xxx>';
```

**Action:** Land on the success page immediately after redirect. Observe polling.

**Expected:**
- [ ] State 1 (mount): spinner card visible, "Generating now" copy
- [ ] Polling fires every 4s — confirm in browser network tab (15 calls over 60s)
- [ ] At ~60s: spinner removed, copy swaps to email-fallback ("Generation taking longer than usual — link sent to {email}")
- [ ] No further `/api/checkout/verify` calls after timeout
- [ ] No browser console errors at the timeout boundary
- [ ] Page does not crash or white-screen

**Cleanup after Test 4.3:** the simulated stall produced a permanently broken order row. Either delete the order row outright (test data, no real purchase) or restore the plaintext + hash from a webhook re-run via Stripe dashboard "Resend webhook" if available.

---

## Section 5: Cron Scrub Verification (NEW for v2)

The hourly cron at `/api/cron/scrub-plaintext-tokens` NULLs expired plaintext columns without touching hash columns. The manual `node scripts/scrub-plaintext-tokens.mjs` is the operator-emergency equivalent.

### Test 5.1 — Manual cron trigger (HTTP route)

**Pre-cron state:** ensure at least one order has `plaintext_tokens_expires_at < NOW()` and plaintext columns set. The Test 4.2 row qualifies.

```sql
-- Confirm pre-state — should return >= 1 row
SELECT
  stripe_session_id,
  plaintext_tokens_expires_at,
  standalone_intake_token IS NOT NULL AS intake_plaintext_present,
  standalone_report_token_plaintext IS NOT NULL AS report_plaintext_present
FROM orders
WHERE plaintext_tokens_expires_at IS NOT NULL
  AND plaintext_tokens_expires_at < NOW()
  AND (
    standalone_intake_token IS NOT NULL
    OR standalone_report_token_plaintext IS NOT NULL
  );
```

**Trigger:**
```bash
curl -X POST \
  -H "Authorization: Bearer <CRON_TOKEN>" \
  https://imnotanattorney.com/api/cron/scrub-plaintext-tokens
```

**Expected response:**
```json
{ "scrubbed": <N> }
```
where `<N>` is the count of pre-cron expired rows.

**Post-cron state:**
```sql
-- Same row(s) — plaintext columns must be NULL, hash columns untouched
SELECT
  stripe_session_id,
  plaintext_tokens_expires_at,
  standalone_intake_token,
  standalone_report_token_plaintext,
  standalone_intake_token_hash IS NOT NULL AS intake_hash_intact,
  standalone_report_token_hash IS NOT NULL AS report_hash_intact
FROM orders
WHERE stripe_session_id = '<cs_test_xxx>';
```

**Pass/Fail Checklist:**
- [ ] Cron returns `{ scrubbed: N }` JSON, HTTP 200
- [ ] Pre-cron row had plaintext columns populated; post-cron has them NULL
- [ ] `plaintext_tokens_expires_at` is NULL post-cron (per the UPDATE in §3.1 of parent plan)
- [ ] Hash columns (`*_token_hash`) untouched post-cron
- [ ] Email link to that order's intake/report still resolves (hash path intact)
- [ ] Re-running the cron returns `{ scrubbed: 0 }` (idempotent on already-scrubbed rows)
- [ ] Defensive WHERE clause prevents NULLing of non-expired rows — confirm by spot-checking a fresh order with `plaintext_tokens_expires_at > NOW()`; its plaintext columns must remain populated after the cron run

### Test 5.2 — Auth enforcement

**Action:** Hit the cron route without the `Authorization` header:
```bash
curl -X POST https://imnotanattorney.com/api/cron/scrub-plaintext-tokens
```

**Expected:** HTTP 401 or 403. No DB writes. No `{ scrubbed }` response body.

**Pass/Fail Checklist:**
- [ ] Unauthenticated call rejected (401/403)
- [ ] Wrong token call rejected (test with `Authorization: Bearer wrongvalue`)
- [ ] No row count changes from unauthorized calls

### Test 5.3 — Operator emergency scrub script

**Action:** From a local workstation with `.env.local` containing the service-role Supabase key:

```bash
cd C:\Users\email\projects\ImNotAnAttorney-web
node scripts/scrub-plaintext-tokens.mjs
```

**Expected stdout:**
- Row count of scrubbed orders
- Timing line (e.g. `scrubbed N rows in M ms`)
- Exit code 0

**Pass/Fail Checklist:**
- [ ] Script exits 0 on success
- [ ] Logged row count matches the SQL pre-state count
- [ ] Idempotent — second invocation logs 0 rows scrubbed (assuming no new expired orders in between)
- [ ] Same DB outcome as Test 5.1 (plaintext NULL, hashes intact)

---

## Section 6: Pre-Merge Checklist

Run before approving the PR. Mirrors v1 verification doc §4 + adds v2-specific items.

- [ ] `npm run build` exits 0 — no TypeScript errors (per `learned-rule-npm-build-not-tsc.md`)
- [ ] `npm test` exits 0 — Vitest suite passes, including the new `verify-archetype.test.ts` per parent plan Task 8
- [ ] **Migration applied to live Supabase** (parent plan Task 1) — `\d orders` shows `standalone_report_token_plaintext`, `plaintext_tokens_expires_at`, and the partial index `idx_orders_plaintext_tokens_expires_at`
- [ ] **Verify endpoint unit tests pass** — all 5 archetype branches + TTL expiry test + auth regression
- [ ] **All 5 archetype manual tests pass** with v2 expectations (Section 3 above)
- [ ] **TTL boundary tests pass** (Section 4 — within window, past window, polling timeout)
- [ ] **Cron scrub manual test passes** (Section 5 — HTTP route + auth + emergency script)
- [ ] Brand-voice review on every new copy string per parent plan Task 5 — Mercer voice, no warm-warm filler, no "we'll prepare your case"
- [ ] UPL guardrail clean: no "you should...", no "we recommend...", no "your case requires..." in any new copy
- [ ] A11y: spinner has `role="status"` + `aria-live="polite"` (parent plan Task 5 acceptance)
- [ ] No regression on archetype A — DUI test purchase still shows download button (Test A above)
- [ ] No regression on archetype E — service tier still shows TIER_NEXT_STEPS branch (Test E above)
- [ ] Email path regression-locked — every archetype still delivers a working email link as backup channel
- [ ] Token-security comment in `verify/route.ts` matches parent plan §2.4 verbatim
- [ ] No edits to `content/blog/`, `scripts/blog-pipeline/`, `scripts/qa-existing-post*` (per `feedback-no-blog-work.md`)
- [ ] No Stripe price ID, URL slug, or DB tier_slug changes
- [ ] All 5 archetype screenshots + 3 TTL-boundary screenshots + cron scrub log attached to PR description
- [ ] Reviewer fan-out punch lists all closed (Pristine-Or-Nothing per global rule)

---

## Section 7: Post-Merge Smoke

Run after `git push origin master` lands and Vercel deployment completes (~2 min).

### 7.1 Old-heading absence regression (carried over from v1 doc)

```bash
for sku in dui-first-offense arrest-survival-kit charge-authority-pack employment-impact case-decoder; do
  echo "=== $sku ==="
  curl -sf "https://imnotanattorney.com/checkout/success?session_id=cs_test_smoke&product=$sku" \
    -o "/tmp/smoke-$sku.html" && \
    node -e "const fs=require('fs'); const h=fs.readFileSync('/tmp/smoke-$sku.html','utf8'); console.log(h.includes('Your Analysis Is Being Built') ? 'FAIL: old heading present' : 'OK: old heading absent');"
done
```

Expected: all five lines print `OK: old heading absent`.

### 7.2 v2 state-marker presence (NEW)

The success page renders dynamically based on the verify response. With a synthetic `cs_test_smoke` session_id the verify endpoint returns unverified, so the page shows its unverified-state copy — full state-marker validation is only possible via the real session_ids from the Section 3 manual tests. The smoke below confirms the new state-machine code paths are at least present in the bundle:

```bash
# Pull a fresh success page HTML against a synthetic session and grep for
# the two new copy markers introduced by v2.
curl -sf "https://imnotanattorney.com/checkout/success?session_id=cs_test_smoke&product=arrest-survival-kit" \
  -o "/tmp/smoke-archetype-b.html"

# Archetype B — confirm the new "View Your Report" copy or polling state
# marker is reachable in the JS bundle. The static HTML may not contain
# the copy verbatim because the page is client-rendered; instead grep for
# a stable React tree marker that only exists in v2 (e.g. data-testid).
grep -o 'data-testid="archetype-b-[a-z-]*"' /tmp/smoke-archetype-b.html || echo "INFO: client-rendered — full validation requires a real session_id"

curl -sf "https://imnotanattorney.com/checkout/success?session_id=cs_test_smoke&product=charge-authority-pack" \
  -o "/tmp/smoke-archetype-c.html"

# Archetype C — same caveat. If implementers add data-testid hooks, grep
# for them here. Otherwise this is operator-eyeball validation.
grep -o 'data-testid="archetype-c-[a-z-]*"' /tmp/smoke-archetype-c.html || echo "INFO: client-rendered — full validation requires a real session_id"
```

**Note for implementers:** if Task 5 adds stable `data-testid` attributes for the new state branches (e.g. `data-testid="archetype-b-spinner"`, `data-testid="archetype-b-report-cta"`, `data-testid="archetype-c-intake-cta"`), this smoke can grep for them. Otherwise, full state-marker validation requires real session_ids from the Section 3 manual tests — acknowledged as a smoke-test limitation, NOT a blocker.

### 7.3 Cron-job.org registration confirmation

```bash
node C:\Users\email\projects\ImNotAnAttorney-web\scripts\setup-cronjob-org.js
```

**Expected:** `Created: scrub-plaintext-tokens (ID: <jobId>)` appears in the registered list. Confirm via the cron-job.org dashboard that the new job is scheduled hourly at minute 30 and shows status enabled.

If the job already exists (re-run after merge), expect `Already registered: scrub-plaintext-tokens` instead — script is idempotent per parent plan Task 10.

### 7.4 Cron route live ping

After registration, hit the route once manually to confirm Vercel routes are live and the auth path works against production env:

```bash
curl -X POST -H "Authorization: Bearer <CRON_TOKEN>" \
  https://imnotanattorney.com/api/cron/scrub-plaintext-tokens
```

Expected: `{ "scrubbed": 0 }` on a clean DB, OR `{ "scrubbed": <N> }` if expired test-purchase rows from Section 3 are still in-flight.

---

## Section 8: Rollback

Single-PR atomic per v1 precedent. Rollback options in priority order:

1. **Revert PR via GitHub UI.** Vercel detects the push and auto-redeploys the prior commit. Total recovery time: ~3 minutes from command to production. Per parent plan §5.5: new plaintext writes stop the moment the revert lands; existing in-flight plaintext rows remain populated but harmless (verify endpoint stops reading the new keys, success page falls back to v1 email-only copy). Cron continues scrubbing → in 30 min everything is back to a v1-equivalent state.

2. **Disable cron** via cron-job.org dashboard if the scrub itself misbehaves. Pause the job; existing plaintext rows decay naturally as orders age out.

3. **Manual emergency scrub** via `node scripts/scrub-plaintext-tokens.mjs` to force-NULL all expired plaintext rows immediately. Idempotent and harmless to run repeatedly.

**v2-specific rollback considerations:**

- **Migration is additive and forward-compatible.** Three nullable columns + one partial index. Safe to leave in place even after a code revert — they cost ~zero storage on empty rows and the partial index has no impact when the column is NULL. No rollback migration needed.
- **The cron route can be left running** even after a code revert. It is idempotent and harmless: if the verify endpoint stops writing plaintext, the cron simply has nothing to scrub. Predicate `WHERE plaintext_tokens_expires_at IS NOT NULL AND ... < NOW()` handles all states cleanly.
- **Webhook + generate.ts plaintext writes will continue to populate columns** even after a revert if the revert misses those files (unlikely for a single-PR revert). The success page just stops reading them. No leak risk; cron continues to scrub.
- **No data loss on revert.** Hash columns are untouched throughout. Customer email links continue to work indefinitely (long-TTL hash unaffected).

Reference: `C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-27-immediate-download-v2.md` §5.5 Rollback.

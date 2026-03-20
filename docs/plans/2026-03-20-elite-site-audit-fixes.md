## Context
- **Repo:** `C:\Users\email\projects\ImNotAnAttorney-web`
- **Problem:** 4-agent elite review (Security, Backend Architect, Frontend Developer, Code Quality) audited the full site. Found issues beyond the partner portal — in Stripe webhook, checkout flows, accessibility, and data integrity.
- **Key files to read first:** `src/app/api/webhooks/stripe/route.ts`, `src/lib/partner-auth.ts`, `src/app/api/checkout/verify/route.ts`, `src/middleware.ts`, `src/lib/rate-limit.ts`
- **Tech stack:** Next.js 15 (App Router), Tailwind CSS, Supabase, Stripe, Resend, Twilio
- **Key decisions:** Prioritize by blast radius — security/data integrity first, then reliability, then UX/a11y, then polish.

---

## Phase 1: Security — CRITICAL (4 tasks)

### 1.1 Hash magic link tokens before storage
**Files:** `src/lib/partner-auth.ts`, `supabase/migrations/015-partner-portal-fixes.sql`
**Found by:** Security, Backend, Code Quality (3/4 agents)

Session tokens are hashed — magic link tokens are not. Fix:
- `partner-auth.ts:56-58`: Change `token` → `hashToken(token)` in the insert
- Create migration `020-hash-magic-link-tokens.sql`:
  - Backfill: `UPDATE partner_magic_links SET token = encode(sha256(token::bytea), 'hex')`
  - Update `consume_magic_link` RPC to hash the input before comparing:
    ```sql
    WHERE token = encode(sha256(p_token::bytea), 'hex')
    ```

### 1.2 Enable RLS on `partners` table
**Files:** `supabase/migrations/020-hash-magic-link-tokens.sql` (add to same migration)

`partners` has PII (name, email, phone, payment details) but no RLS. Add:
```sql
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
```

### 1.3 Remove download URLs from checkout verify endpoint
**Files:** `src/app/api/checkout/verify/route.ts:79-113`

The verify endpoint returns signed Supabase Storage URLs for digital products without any auth. Anyone with a valid `session_id` (visible in browser history, Stripe dashboard) gets the PDF. The webhook already handles email delivery with token-based URLs.

Fix: Remove lines 79-113 (the signed URL generation block). The response already returns `verified: true` with tier/email/amount — the success page doesn't need download URLs from this endpoint.

### 1.4 Add rate limiting to checkout verify + magic link verify endpoints
**Files:** `src/app/api/checkout/verify/route.ts`, `src/app/api/partner/magic-link/verify/route.ts`

Both endpoints are unauthenticated and make external API calls (Stripe, Supabase). Add IP-based rate limiting:
- Checkout verify: 20 requests/min/IP
- Magic link verify: 10 requests/5min/IP

---

## Phase 2: Data Integrity — CRITICAL (3 tasks)

### 2.1 Add `return` after order insert failure in webhook
**Files:** `src/app/api/webhooks/stripe/route.ts:236`

After order insert fails (non-duplicate), the code sends an operator alert but falls through to send a "Payment Confirmed" email to the customer — even though no order record exists. Add `return NextResponse.json({ received: true });` after the operator alert email (after line 235).

### 2.2 Add unique constraint on referrals to prevent duplicates
**Files:** `supabase/migrations/020-hash-magic-link-tokens.sql` (add to same migration)

No unique constraint on `referrals(order_id, partner_id)`. Duplicate webhooks or stacked coupons could create duplicate referral records. Add:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_order_partner ON referrals(order_id, partner_id);
```
And handle 23505 (duplicate) gracefully in the webhook insert.

### 2.3 Make referral insert + partner total increment atomic
**Files:** `supabase/migrations/020-hash-magic-link-tokens.sql`, `src/app/api/webhooks/stripe/route.ts:300-322`

The referral insert and two `increment_partner_total` RPCs are three separate operations. Partial failure corrupts partner totals. Create an atomic RPC:
```sql
CREATE OR REPLACE FUNCTION track_referral(
  p_partner_id uuid, p_order_id uuid, p_tier text,
  p_sale_amount integer, p_discount_amount integer, p_commission_amount integer
) RETURNS void AS $$
BEGIN
  INSERT INTO referrals (partner_id, order_id, tier, sale_amount, discount_amount, commission_amount)
  VALUES (p_partner_id, p_order_id, p_tier, p_sale_amount, p_discount_amount, p_commission_amount);

  UPDATE partners SET
    total_referrals = COALESCE(total_referrals, 0) + 1,
    total_commission = COALESCE(total_commission, 0) + p_commission_amount,
    updated_at = now()
  WHERE id = p_partner_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION track_referral FROM public;
REVOKE EXECUTE ON FUNCTION track_referral FROM anon;
GRANT EXECUTE ON FUNCTION track_referral TO service_role;
```
Replace the 3-step JS code in the webhook with a single `.rpc("track_referral", {...})` call.

---

## Phase 3: Reliability (4 tasks)

### 3.1 Remove `setInterval` from rate-limit.ts
**Files:** `src/lib/rate-limit.ts:39-46`

Anti-pattern in serverless. The in-memory store is per-invocation anyway on Vercel. Remove the `setInterval` cleanup — stale entries die with the function instance.

### 3.2 Rename local `sendEmailWithRetry` in webhook
**Files:** `src/app/api/webhooks/stripe/route.ts:55-81`

Shadows the export from `email.ts`. Rename to `sendEmailWithOperatorAlert` to make the distinction clear.

### 3.3 Use `normalizeEmail` from site.ts in webhook
**Files:** `src/app/api/webhooks/stripe/route.ts:144`

Currently inlines `rawEmail.toLowerCase().trim()`. Import and use `normalizeEmail()`.

### 3.4 Import `PHYSICAL_ADDRESS` from site.ts in email.ts
**Files:** `src/lib/email.ts:62`

Duplicates the constant locally. Import from `site.ts` instead.

---

## Phase 4: Accessibility — HIGH (5 tasks)

### 4.1 Add `<main>` landmark to public pages
**Files:** `src/app/page.tsx`, `src/app/services/page.tsx`, `src/app/checkout/page.tsx`, `src/app/score/page.tsx`

Wrap page content in `<main>` for screen reader navigation.

### 4.2 Add ARIA roles to spinners and progress bars
**Files:** `src/app/partner/dashboard/page.tsx:150-155`, `src/app/partner/login/verify/page.tsx:68`, `src/app/score/page.tsx:886-894`, `src/app/my-case/[token]/page.tsx:193-234`

Add `role="status"` + `aria-label` to spinners. Add `role="progressbar"` + `aria-valuenow/min/max` to progress bars.

### 4.3 Add focus ring styles to partner application form
**Files:** `src/components/partner/PartnerApplicationForm.tsx`

Add `focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500` to all inputs.

### 4.4 Add quiz back button
**Files:** `src/components/ReferralQuiz.tsx`

Add a "Back" button on steps 1-3 so users can correct their charge type selection.

### 4.5 Fix `autoFocus` on mobile score page
**Files:** `src/app/score/page.tsx:544`

Remove `autoFocus={isCrisis}` — it forces keyboard open on mobile, scrolling past the score results.

---

## Phase 5: Frontend Polish — MEDIUM (4 tasks)

### 5.1 Wrap `localStorage.setItem` in try/catch on success page
**Files:** `src/app/checkout/success/page.tsx:247`

Crashes in Safari private browsing. Wrap in try/catch.

### 5.2 Use `next/image` for playbook cover
**Files:** `src/components/PlaybookSalesPage.tsx:103-110`

Replace raw `<img>` with `next/image` for lazy loading + format optimization.

### 5.3 Fix duplicate TIER_NAMES in my-case page
**Files:** `src/app/my-case/[token]/page.tsx:46-55,91-95`

Replace both local maps with `tierDisplayName()` from `tiers.ts`. Currently missing 5 playbook slugs.

### 5.4 Add partial index for unpaid referrals
**Files:** `supabase/migrations/020-hash-magic-link-tokens.sql`

The payout RPC scans all referrals for a partner. Add:
```sql
CREATE INDEX IF NOT EXISTS idx_referrals_unpaid ON referrals(partner_id) WHERE commission_paid = false;
```

---

## Deferred (not in this round)

- **Admin httpOnly cookie auth** — significant architectural change, admin is internal-only
- **Demand route auth dedup** — timing-safe length oracle is low-risk since middleware handles auth first
- **CSRF token header** — `SameSite: strict` covers modern browsers
- **Session cleanup cron** — needs cron infrastructure, separate task
- **Supabase client singleton** — low-impact optimization
- **Promo code entropy** — 3-digit suffix is adequate at current scale

---

## Migration 020 (combines Phases 1-2 DB changes)

```sql
-- 020-security-and-integrity.sql

-- 1.1: Backfill magic link token hashes
UPDATE partner_magic_links
SET token = encode(sha256(token::bytea), 'hex')
WHERE length(token) = 64; -- only unhashed tokens (64 hex chars)

-- 1.1: Update consume_magic_link to accept raw token and hash it
CREATE OR REPLACE FUNCTION consume_magic_link(p_token text)
RETURNS uuid AS $$
DECLARE
  v_partner_id uuid;
BEGIN
  UPDATE partner_magic_links
  SET used_at = now()
  WHERE token = encode(sha256(p_token::bytea), 'hex')
    AND used_at IS NULL
    AND expires_at > now()
  RETURNING partner_id INTO v_partner_id;
  RETURN v_partner_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION consume_magic_link(text) FROM public;
REVOKE EXECUTE ON FUNCTION consume_magic_link(text) FROM anon;
GRANT EXECUTE ON FUNCTION consume_magic_link(text) TO service_role;

-- 1.2: RLS on partners table
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;

-- 2.2: Unique constraint on referrals
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_order_partner
  ON referrals(order_id, partner_id);

-- 2.3: Atomic referral tracking RPC
CREATE OR REPLACE FUNCTION track_referral(
  p_partner_id uuid, p_order_id uuid, p_tier text,
  p_sale_amount integer, p_discount_amount integer, p_commission_amount integer
) RETURNS void AS $$
BEGIN
  INSERT INTO referrals (partner_id, order_id, tier, sale_amount, discount_amount, commission_amount)
  VALUES (p_partner_id, p_order_id, p_tier, p_sale_amount, p_discount_amount, p_commission_amount);

  UPDATE partners SET
    total_referrals = COALESCE(total_referrals, 0) + 1,
    total_commission = COALESCE(total_commission, 0) + p_commission_amount,
    updated_at = now()
  WHERE id = p_partner_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION track_referral(uuid, uuid, text, integer, integer, integer) FROM public;
REVOKE EXECUTE ON FUNCTION track_referral(uuid, uuid, text, integer, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION track_referral(uuid, uuid, text, integer, integer, integer) TO service_role;

-- 5.4: Partial index for payout performance
CREATE INDEX IF NOT EXISTS idx_referrals_unpaid
  ON referrals(partner_id) WHERE commission_paid = false;
```

---

## Issue-to-Task Map

| # | Agent(s) | Sev | Task | Phase |
|---|----------|-----|------|-------|
| 1 | Sec+BE+CQ | CRITICAL | Hash magic link tokens | 1.1 |
| 2 | Sec | CRITICAL | RLS on partners table | 1.2 |
| 3 | Sec+BE | HIGH | Remove download URLs from verify | 1.3 |
| 4 | Sec | HIGH | Rate limit verify endpoints | 1.4 |
| 5 | BE | CRITICAL | Return after order insert failure | 2.1 |
| 6 | BE | CRITICAL | Unique constraint on referrals | 2.2 |
| 7 | BE | CRITICAL | Atomic referral tracking RPC | 2.3 |
| 8 | BE+CQ | MEDIUM | Remove setInterval from rate-limit | 3.1 |
| 9 | BE+CQ | MEDIUM | Rename webhook sendEmailWithRetry | 3.2 |
| 10 | CQ | MEDIUM | Use normalizeEmail in webhook | 3.3 |
| 11 | CQ | MEDIUM | Import PHYSICAL_ADDRESS from site.ts | 3.4 |
| 12 | FE | HIGH | Add `<main>` landmarks | 4.1 |
| 13 | FE | HIGH | ARIA on spinners + progress bars | 4.2 |
| 14 | FE | MEDIUM | Focus rings on partner form | 4.3 |
| 15 | FE | MEDIUM | Quiz back button | 4.4 |
| 16 | FE | MEDIUM | Remove autoFocus on mobile | 4.5 |
| 17 | FE | CRITICAL | localStorage try/catch | 5.1 |
| 18 | FE | HIGH | next/image for playbook cover | 5.2 |
| 19 | FE+CQ | MEDIUM | Fix TIER_NAMES duplication | 5.3 |
| 20 | BE | MEDIUM | Partial index for unpaid referrals | 5.4 |

## Verification
1. `npx tsc --noEmit --skipLibCheck` — TypeScript passes
2. `npx next build` — production build succeeds
3. Manual: POST invalid JSON to `/api/partners/apply` — still returns 400
4. Manual: Test magic link flow — request, verify, dashboard access
5. Manual: Test checkout flow — purchase, success page (no download URL leak)
6. Manual: Screen reader test on landing page — `<main>` landmark present

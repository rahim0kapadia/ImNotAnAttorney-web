# Partner Program: Best-in-Class Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing partner/affiliate system from invisible and manual to best-in-class: auto-approve, lifecycle emails, tiered commissions, deep linking, sub-ID tracking, compliance kit, and full analytics dashboard.

**Architecture:** Extends existing partner infrastructure (8 routes, 6 DB tables, 4 RPCs, Stripe dual-mode). Adds lifecycle email automation via existing Resend + drip cron pattern. Tier evaluation runs atomically inside the `track_referral` RPC to prevent race conditions. Dashboard is decomposed into focused components before adding new sections.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL RPCs), Stripe promo codes, Resend email, cron-job.org

**Spec:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\specs\2026-04-12-partner-program-best-in-class-design.md`

---

## Task 1: DB Migration — Schema + RPC Updates

**Files:**
- Create: `supabase/migrations/20260412a_partner_program_upgrade.sql`

This MUST be applied first — every other task depends on the new columns and updated RPC.

- [ ] **Step 1: Write the migration file**

```sql
-- Partner program best-in-class upgrade
-- New columns, updated track_referral RPC with tier evaluation, partner_analytics RPC

-- 1. New columns on partners
ALTER TABLE partners ADD COLUMN IF NOT EXISTS commission_tier text DEFAULT 'partner';
ALTER TABLE partners ADD COLUMN IF NOT EXISTS payment_paypal text;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS activation_email_sent_at timestamptz;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS last_activation_email_key text;

-- 2. New column on referrals
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS sub_id text;

-- 3. Drip cron index
CREATE INDEX IF NOT EXISTS idx_partners_activation_drip
  ON partners (status, activation_email_sent_at)
  WHERE status = 'approved';

-- 4. Updated track_referral: adds sub_id param + atomic tier evaluation
-- Drop old signature first (void return)
DROP FUNCTION IF EXISTS track_referral(uuid, uuid, text, bigint, bigint, bigint);

CREATE OR REPLACE FUNCTION track_referral(
  p_partner_id uuid, p_order_id uuid, p_tier text,
  p_sale_amount bigint, p_discount_amount bigint,
  p_commission_amount bigint, p_sub_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_total integer;
  v_old_tier text;
  v_new_tier text;
  v_new_rate integer;
  v_inserted boolean := false;
BEGIN
  -- Insert referral (idempotent via unique constraint)
  INSERT INTO referrals (partner_id, order_id, tier, sale_amount, discount_amount, commission_amount, sub_id)
  VALUES (p_partner_id, p_order_id, p_tier, p_sale_amount, p_discount_amount, p_commission_amount, p_sub_id)
  ON CONFLICT (order_id, partner_id) DO NOTHING
  RETURNING true INTO v_inserted;

  -- If duplicate (already tracked), return early
  IF v_inserted IS NULL THEN
    RETURN jsonb_build_object('tier_changed', false, 'duplicate', true);
  END IF;

  -- Atomic increment
  UPDATE partners SET
    total_referrals = total_referrals + 1,
    total_commission = total_commission + p_commission_amount
  WHERE id = p_partner_id
  RETURNING total_referrals, commission_tier INTO v_new_total, v_old_tier;

  -- Tier evaluation (only upgrades, never downgrades)
  v_new_tier := CASE
    WHEN v_new_total >= 15 THEN 'gold'
    WHEN v_new_total >= 5 THEN 'silver'
    ELSE 'partner'
  END;
  v_new_rate := CASE v_new_tier
    WHEN 'gold' THEN 20
    WHEN 'silver' THEN 15
    ELSE 10
  END;

  IF v_new_tier != v_old_tier AND v_new_rate > (SELECT commission_rate FROM partners WHERE id = p_partner_id) THEN
    UPDATE partners SET commission_tier = v_new_tier, commission_rate = v_new_rate
    WHERE id = p_partner_id;
    RETURN jsonb_build_object('tier_changed', true, 'new_tier', v_new_tier, 'new_rate', v_new_rate);
  END IF;

  RETURN jsonb_build_object('tier_changed', false, 'new_tier', COALESCE(v_old_tier, 'partner'));
END;
$$;

REVOKE ALL ON FUNCTION track_referral(uuid, uuid, text, bigint, bigint, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION track_referral(uuid, uuid, text, bigint, bigint, bigint, text) TO service_role;

-- 5. Partner analytics RPC
CREATE OR REPLACE FUNCTION partner_analytics(p_partner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_monthly jsonb;
  v_by_tier jsonb;
  v_total_count integer;
BEGIN
  SELECT jsonb_agg(row_to_json(m)) INTO v_monthly FROM (
    SELECT date_trunc('month', created_at)::date AS month,
           SUM(commission_amount) AS commission,
           COUNT(*) AS count
    FROM referrals WHERE partner_id = p_partner_id
    GROUP BY 1 ORDER BY 1 DESC LIMIT 12
  ) m;

  SELECT jsonb_agg(row_to_json(t)) INTO v_by_tier FROM (
    SELECT tier, SUM(commission_amount) AS commission, COUNT(*) AS count
    FROM referrals WHERE partner_id = p_partner_id
    GROUP BY 1 ORDER BY 2 DESC
  ) t;

  SELECT COUNT(*) INTO v_total_count
  FROM referrals WHERE partner_id = p_partner_id;

  RETURN jsonb_build_object(
    'monthly', COALESCE(v_monthly, '[]'::jsonb),
    'by_tier', COALESCE(v_by_tier, '[]'::jsonb),
    'total_referrals', v_total_count
  );
END;
$$;

REVOKE ALL ON FUNCTION partner_analytics(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_analytics(uuid) TO service_role;
```

- [ ] **Step 2: Apply via Supabase Management API**

Read `C:\Users\email\projects\ImNotAnAttorney-web\.env.local` for `SUPABASE_PROJECT_REF` and `SUPABASE_SERVICE_ROLE_KEY`. Apply:

```bash
# Read the migration file content and POST to Management API
MIGRATION_SQL=$(cat supabase/migrations/20260412a_partner_program_upgrade.sql)
curl -X POST "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"$MIGRATION_SQL\"}"
```

Verify: Check that `partners.commission_tier`, `partners.payment_paypal`, `referrals.sub_id` columns exist. Test `track_referral` RPC returns jsonb.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260412a_partner_program_upgrade.sql
git commit -m "feat(partners): migration — commission tiers, sub-ID tracking, analytics RPC"
```

---

## Task 2: Shared Lib Cleanup (Phase 0)

**Files:**
- Modify: `src/lib/referral.ts`
- Modify: `src/lib/partner-data.ts`
- Modify: `src/app/api/admin/partners/route.ts` (remove local `sanitizePromoCode`)

Extracts shared constants/types/functions before feature work begins. Prevents duplication.

- [ ] **Step 1: Add shared constants and extract `sanitizePromoCode` to `referral.ts`**

Add to `src/lib/referral.ts` at top (after imports):

```typescript
/** 90-day referral cookie. Shared by /r/[code] and /r/[code]/[product]. */
export const REFERRAL_COOKIE_MAX_AGE = 90 * 24 * 60 * 60;

/** Strip non-alphanumeric chars and uppercase. */
export function sanitizePromoCode(s: string): string {
  return s
    .toUpperCase()
    .split("")
    .filter((c) => (c >= "A" && c <= "Z") || (c >= "0" && c <= "9"))
    .join("");
}

/** Sub-ID sanitizer: alphanumeric + hyphens + underscores, max 50 chars. */
export function sanitizeSubId(s: string): string | null {
  const clean = s.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50);
  return clean.length > 0 ? clean : null;
}
```

- [ ] **Step 2: Add `activatePartnerPromoCode` to `referral.ts`**

Add after `createPartnerPromoCode`:

```typescript
/**
 * Activates a partner's Stripe promo code on both test and live.
 * Called after magic link verification to prevent code farming.
 */
export async function activatePartnerPromoCode(
  stripePromoCodeId: string
): Promise<void> {
  try {
    await stripeTest.promotionCodes.update(stripePromoCodeId, { active: true });
  } catch (e) {
    console.warn("[Referral] Failed to activate test promo code:", e);
  }
  if (stripeLive) {
    try {
      // Look up live promo by code text (IDs differ between test/live)
      const supabase = createAdminClient();
      const { data: partner } = await supabase
        .from("partners")
        .select("promo_code")
        .eq("stripe_promo_code_id", stripePromoCodeId)
        .maybeSingle();
      if (partner?.promo_code) {
        const promos = await stripeLive.promotionCodes.list({
          code: partner.promo_code,
          limit: 1,
        });
        if (promos.data[0]) {
          await stripeLive.promotionCodes.update(promos.data[0].id, {
            active: true,
          });
        }
      }
    } catch (e) {
      console.warn("[Referral] Failed to activate live promo code:", e);
    }
  }
}
```

- [ ] **Step 3: Update `createPartnerPromoCode` to create with `active: false`**

In `src/lib/referral.ts`, function `createPromoOnClient`, add `active: false`:

```typescript
async function createPromoOnClient(
  client: Stripe,
  partnerId: string,
  code: string,
  partnerName: string
): Promise<Stripe.PromotionCode> {
  return client.promotionCodes.create({
    promotion: { type: "coupon", coupon: MASTER_COUPON_ID },
    code: code.toUpperCase(),
    active: false, // Activated after email verification via magic link
    metadata: {
      partner_id: partnerId,
      partner_name: partnerName,
      system: "bondsman-referral",
    },
  });
}
```

- [ ] **Step 4: Add shared types and constants to `partner-data.ts`**

Add to `src/lib/partner-data.ts`:

```typescript
/** Canonical partner status values. */
export const VALID_STATUSES = ["pending", "approved", "suspended"] as const;
export type PartnerStatus = (typeof VALID_STATUSES)[number];

/** Commission tier definitions. */
export const COMMISSION_TIERS = [
  { key: "partner", label: "Partner", threshold: 0, rate: 10 },
  { key: "silver", label: "Silver Partner", threshold: 5, rate: 15 },
  { key: "gold", label: "Gold Partner", threshold: 15, rate: 20 },
] as const;

export type CommissionTierKey = (typeof COMMISSION_TIERS)[number]["key"];

/** Get tier info for a partner's current tier key. */
export function getTierInfo(tierKey: string) {
  return COMMISSION_TIERS.find((t) => t.key === tierKey) ?? COMMISSION_TIERS[0];
}

/** Get the next tier a partner can achieve, or null if at Gold. */
export function getNextTier(tierKey: string) {
  const idx = COMMISSION_TIERS.findIndex((t) => t.key === tierKey);
  return idx < COMMISSION_TIERS.length - 1 ? COMMISSION_TIERS[idx + 1] : null;
}

/** Shared partner shape — used by dashboard page and auth helpers. */
export interface Partner {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  promo_code: string | null;
  commission_rate: number;
  commission_tier: string;
  preferred_payment_method: string | null;
  payment_zelle: string | null;
  payment_venmo: string | null;
  payment_check_address: string | null;
  payment_paypal: string | null;
}
```

Update `VALID_PAYMENT_METHODS`:

```typescript
export const VALID_PAYMENT_METHODS = ["zelle", "venmo", "check", "paypal"] as const;
```

Update the FAQ "When do I get paid?" answer:

```typescript
{
  question: "When do I get paid?",
  answer: "Commissions are tracked in real time. Payouts are processed on the 1st of each month (NET-30) via PayPal, Venmo, Zelle, or check — your choice. You can see your running total and referral history anytime in your partner dashboard.",
},
```

- [ ] **Step 5: Remove local `sanitizePromoCode` from admin route**

In `src/app/api/admin/partners/route.ts`, remove lines 18-21 (the local function) and add import:

```typescript
import { createPartnerPromoCode, sanitizePromoCode } from "@/lib/referral";
```

Remove the existing `createPartnerPromoCode` import if it's separate, consolidate to one import line.

- [ ] **Step 6: Commit**

```bash
git add src/lib/referral.ts src/lib/partner-data.ts src/app/api/admin/partners/route.ts
git commit -m "refactor(partners): extract shared types, constants, sanitizers to libs"
```

---

## Task 3: Cookie Duration + Footer Link + Sitemap

**Files:**
- Modify: `src/app/r/[code]/page.tsx`
- Modify: `src/components/Footer.tsx`
- Modify: `src/app/sitemap.ts`
- Modify: `src/app/partners/page.tsx` (remove `"use client"`)
- Modify: `src/app/partners/bondsman/page.tsx` (remove `"use client"`)

Small, independent changes that ship immediately.

- [ ] **Step 1: Update cookie duration in `/r/[code]/page.tsx`**

Import the shared constant and use it:

```typescript
import { REFERRAL_COOKIE_MAX_AGE, sanitizeSubId } from "@/lib/referral";
```

Replace the cookie set block (line 55-61):

```typescript
  // Read optional sub-ID for channel tracking
  const searchParams = new URL(req.url ?? "", "http://localhost").searchParams;
  // Note: In Next.js App Router, use the searchParams from the page props if available
  
  const cookieStore = await cookies();
  cookieStore.set("ref", partner.promo_code!, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: REFERRAL_COOKIE_MAX_AGE,
    path: "/",
  });
```

Note: Sub-ID cookie setting is handled in Task 8 (sub-ID tracking). This task only updates the duration.

- [ ] **Step 2: Add "Become a Partner" link to Footer**

In `src/components/Footer.tsx`, in the Explore column, between the "About" link and the "Get Started" link (between lines 93 and 94):

```tsx
              <Link
                href="/partners"
                className="text-sm text-zinc-400 hover:text-white"
              >
                Become a Partner
              </Link>
```

- [ ] **Step 3: Add partner pages to sitemap**

In `src/app/sitemap.ts`, add to the static entries array (after existing entries, before the return closing bracket):

```typescript
    {
      url: `${SITE_URL}/partners`,
      lastModified: new Date(),
      changeFrequency: "yearly" as const,
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/partners/terms`,
      lastModified: new Date(),
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
```

- [ ] **Step 4: Remove `"use client"` from landing pages**

In `src/app/partners/page.tsx`: remove the `"use client";` directive at the top. The `PartnerApplicationForm` component already has its own `"use client"` boundary.

In `src/app/partners/bondsman/page.tsx`: same — remove `"use client";`.

- [ ] **Step 5: Update "10%" copy to "up to 20%"**

In `src/app/partners/page.tsx`, find and update the hero copy that says "They save 10%. You earn 10%." to:

```
"They save 10%. You earn up to 20%."
```

Same in `src/app/partners/bondsman/page.tsx`.

- [ ] **Step 6: Commit**

```bash
git add src/app/r/[code]/page.tsx src/components/Footer.tsx src/app/sitemap.ts src/app/partners/page.tsx src/app/partners/bondsman/page.tsx
git commit -m "feat(partners): footer link, 90-day cookie, sitemap, remove unnecessary client directives"
```

---

## Task 4: Auto-Approve Flow

**Files:**
- Modify: `src/app/api/partners/apply/route.ts` (major rewrite)
- Modify: `src/components/partner/PartnerApplicationForm.tsx` (compliance checkbox + success msg)
- Modify: `src/app/api/partner/magic-link/verify/route.ts` (promo code activation)

The core onboarding change — transforms the application from a manual review queue to instant approval.

- [ ] **Step 1: Rewrite the apply route**

Replace the contents of `src/app/api/partners/apply/route.ts` with the auto-approve flow. Key logic:

```typescript
/**
 * POST /api/partners/apply — Auto-approve partner application.
 *
 * 1. Validate inputs + compliance checkbox
 * 2. Check for existing partner email (UNIQUE constraint)
 * 3. Insert application record (audit trail)
 * 4. Create partner row with status "approved"
 * 5. Generate Stripe promo code (inactive until email verified)
 * 6. Generate magic link + send welcome email
 * 7. Notify operator
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendEmail, escapeHtml } from "@/lib/email";
import { getClientIp } from "@/lib/request";
import { normalizeEmail, isValidEmail, OPERATOR_EMAIL_FALLBACK } from "@/lib/site";
import { createPartnerPromoCode, sanitizePromoCode } from "@/lib/referral";
import { generateMagicLink } from "@/lib/partner-auth";

const OPERATOR_EMAIL = process.env.OPERATOR_EMAIL || OPERATOR_EMAIL_FALLBACK;

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();
  const ip = getClientIp(req);

  // Rate limit: 3 applications per IP per hour
  const { limited } = await checkRateLimit(supabase, `partner-apply:${ip}`, 3, 3600);
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { name, company, email, phone, region, message, source, heardAboutUs, compliance } = body;

  // Validate required fields
  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }
  if (typeof email !== "string" || !isValidEmail(email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }
  if (compliance !== true) {
    return NextResponse.json({ error: "You must agree to the Partner Terms of Service" }, { status: 400 });
  }

  // Length validation
  const MAX_LENGTHS: Record<string, number> = {
    name: 200, company: 200, email: 254, phone: 50,
    region: 200, message: 2000, source: 100, heardAboutUs: 500,
  };
  for (const [key, val] of Object.entries({ name, company, email, phone, region, message, source, heardAboutUs })) {
    if (val != null && typeof val === "string" && val.length > (MAX_LENGTHS[key] || 500)) {
      return NextResponse.json({ error: `${key} exceeds maximum length` }, { status: 400 });
    }
  }

  const normalizedEmail = normalizeEmail(email);

  // Check for existing partner with this email
  const { data: existingPartner } = await supabase
    .from("partners")
    .select("id, status, promo_code")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (existingPartner) {
    if (existingPartner.status === "suspended") {
      // Insert application for admin review, don't reveal suspension
      await supabase.from("partner_applications").insert({
        name, company: company || null, email: normalizedEmail,
        phone: phone || null, region: region || null,
        message: message || null, source: source || null,
        heard_about_us: heardAboutUs || null,
      });
      return NextResponse.json({ success: true, message: "Application received." });
    }

    if (existingPartner.status === "approved") {
      // Already a partner — send a fresh magic link
      try {
        const magicLinkUrl = await generateMagicLink(existingPartner.id);
        if (magicLinkUrl) {
          await sendEmail({
            to: normalizedEmail,
            subject: "Your ImNotAnAttorney Partner Dashboard Link",
            html: `
              <h1 style="color: #F59E0B;">Welcome Back, Partner</h1>
              <p style="color: #D4D4D8;">You're already an approved partner. Here's your dashboard link:</p>
              <a href="${magicLinkUrl}" style="display:inline-block;padding:12px 32px;background:#F59E0B;color:#000;font-weight:bold;border-radius:8px;text-decoration:none;margin-top:16px;">Open Dashboard</a>
              <p style="color: #71717A; margin-top: 16px; font-size: 12px;">This link expires in 15 minutes.</p>
            `,
          });
        }
      } catch (e) {
        console.error("[Partner Apply] Failed to send re-login link:", e);
      }
      return NextResponse.json({
        success: true,
        message: "You're already a partner! Check your email for your dashboard link.",
      });
    }

    // Status is "pending" — upgrade to approved (fall through to creation logic below)
    // Update existing record rather than inserting duplicate
  }

  // Insert application record (audit trail)
  await supabase.from("partner_applications").insert({
    name, company: company || null, email: normalizedEmail,
    phone: phone || null, region: region || null,
    message: message || null, source: source || null,
    heard_about_us: heardAboutUs || null, status: "converted",
  });

  // Generate promo code from name
  const baseCode = sanitizePromoCode(name.split(" ")[0] || "PARTNER");
  let promoCode = baseCode;
  let suffix = 1;
  // Ensure uniqueness
  while (true) {
    const { data: existing } = await supabase
      .from("partners")
      .select("id")
      .eq("promo_code", promoCode)
      .maybeSingle();
    if (!existing) break;
    promoCode = `${baseCode}${suffix++}`;
    if (suffix > 99) {
      promoCode = `${baseCode}${Date.now() % 10000}`;
      break;
    }
  }

  let partnerId: string;

  if (existingPartner?.status === "pending") {
    // Upgrade existing pending partner
    const { error: updateErr } = await supabase
      .from("partners")
      .update({
        name, company: company || null, phone: phone || null,
        region: region || null, status: "approved",
        promo_code: promoCode, commission_rate: 10, commission_tier: "partner",
      })
      .eq("id", existingPartner.id);
    if (updateErr) {
      console.error("[Partner Apply] Upgrade error:", updateErr);
      return NextResponse.json({ error: "Failed to process application" }, { status: 500 });
    }
    partnerId = existingPartner.id;
  } else {
    // Create new partner
    const { data: newPartner, error: insertErr } = await supabase
      .from("partners")
      .insert({
        name, company: company || null, email: normalizedEmail,
        phone: phone || null, region: region || null,
        status: "approved", promo_code: promoCode,
        commission_rate: 10, commission_tier: "partner",
      })
      .select("id")
      .single();
    if (insertErr || !newPartner) {
      console.error("[Partner Apply] Insert error:", insertErr);
      return NextResponse.json({ error: "Failed to create partner account" }, { status: 500 });
    }
    partnerId = newPartner.id;
  }

  // Create Stripe promo code (inactive — activated on magic link click)
  try {
    const stripePromo = await createPartnerPromoCode(partnerId, promoCode, name);
    await supabase
      .from("partners")
      .update({
        stripe_coupon_id: stripePromo.coupon.id,
        stripe_promo_code_id: stripePromo.id,
      })
      .eq("id", partnerId);
  } catch (e) {
    console.error("[Partner Apply] Stripe promo code creation failed:", e);
    // Don't fail the application — admin can create manually
  }

  // Generate magic link and send welcome email
  try {
    const magicLinkUrl = await generateMagicLink(partnerId);
    if (magicLinkUrl) {
      // Welcome email imported from partner-emails.ts (Task 5)
      // For now, inline a basic welcome — Task 5 replaces this with the full template
      await sendEmail({
        to: normalizedEmail,
        subject: `Welcome — your partner code is ${promoCode}`,
        html: `
          <h1 style="color: #F59E0B;">You're In, ${escapeHtml(name.split(" ")[0])}!</h1>
          <p style="color: #D4D4D8;">Your partner code is:</p>
          <p style="font-size: 32px; font-weight: bold; color: #F59E0B; font-family: monospace;">${escapeHtml(promoCode)}</p>
          <p style="color: #D4D4D8;">Click below to access your partner dashboard, QR codes, and ready-to-send messages:</p>
          <a href="${magicLinkUrl}" style="display:inline-block;padding:14px 36px;background:#F59E0B;color:#000;font-weight:bold;border-radius:8px;text-decoration:none;margin-top:16px;">Open Your Dashboard</a>
          <p style="color: #71717A; margin-top: 16px; font-size: 12px;">This link expires in 15 minutes. You can request a new one anytime at /partner/login.</p>
        `,
      }, { category: "partner-activation", metadata: { partner_id: partnerId } });
    }
  } catch (e) {
    console.error("[Partner Apply] Welcome email failed:", e);
  }

  // Notify operator (fire-and-forget)
  try {
    await sendEmail({
      to: OPERATOR_EMAIL,
      subject: `New Partner Auto-Approved (${source || "direct"}): ${name}`,
      html: `
        <h1 style="color: #F59E0B;">New Partner Auto-Approved</h1>
        <div style="background: #1C1917; padding: 24px; border-radius: 12px; border-left: 4px solid #F59E0B;">
          <p style="color: #D4D4D8; margin: 0;"><strong style="color: white;">Name:</strong> ${escapeHtml(name)}</p>
          <p style="color: #D4D4D8; margin: 8px 0 0;"><strong style="color: white;">Code:</strong> ${escapeHtml(promoCode)}</p>
          <p style="color: #D4D4D8; margin: 8px 0 0;"><strong style="color: white;">Email:</strong> ${escapeHtml(email)}</p>
          ${company ? `<p style="color: #D4D4D8; margin: 8px 0 0;"><strong style="color: white;">Company:</strong> ${escapeHtml(company)}</p>` : ""}
          ${region ? `<p style="color: #D4D4D8; margin: 8px 0 0;"><strong style="color: white;">Region:</strong> ${escapeHtml(region)}</p>` : ""}
        </div>
        <p style="color: #71717A; margin-top: 16px;">Partner was auto-approved. Suspend at /admin/partners if needed.</p>
      `,
    });
  } catch (e) {
    console.error("[Partner Apply] Operator notification email failed:", e);
  }

  return NextResponse.json({ success: true, message: "You're in! Check your email for your partner code and dashboard link." });
}
```

- [ ] **Step 2: Add compliance checkbox to application form**

In `src/components/partner/PartnerApplicationForm.tsx`:

Add state: `const [compliance, setCompliance] = useState(false);`

Update the fetch body to include `compliance`:
```typescript
body: JSON.stringify({ name, company, email, phone, region, message, heardAboutUs, source, compliance }),
```

Add checkbox before the submit button (before line 147):
```tsx
        <div className="md:col-span-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={compliance}
              onChange={(e) => setCompliance(e.target.checked)}
              required
              className="mt-1 h-5 w-5 rounded border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-amber-500"
            />
            <span className="text-sm text-zinc-400">
              I agree to the{" "}
              <a href="/partners/terms" target="_blank" rel="noopener noreferrer" className="text-amber-400 underline hover:text-amber-300">
                Partner Terms of Service<span className="sr-only"> (opens in new tab)</span>
              </a>{" "}
              and will not make claims about case outcomes or provide legal advice on behalf of ImNotAnAttorney. *
            </span>
          </label>
        </div>
```

Disable submit when `!compliance`:
```tsx
        disabled={submitting || !compliance}
```

Update success message (line 51-55):
```tsx
        <p className="text-green-300 text-xl font-bold mb-2">You&apos;re In!</p>
        <p className="text-zinc-400">
          Check your email for your partner code and dashboard link.
          Your promo code activates when you click the link in your email.
        </p>
```

- [ ] **Step 3: Add promo code activation to magic link verify**

In `src/app/api/partner/magic-link/verify/route.ts`, add import:

```typescript
import { activatePartnerPromoCode } from "@/lib/referral";
```

After session creation (after line 50, before the response), add:

```typescript
  // Activate Stripe promo code now that email is verified
  try {
    const { data: partnerData } = await supabase
      .from("partners")
      .select("stripe_promo_code_id")
      .eq("id", partnerId)
      .maybeSingle();
    if (partnerData?.stripe_promo_code_id) {
      await activatePartnerPromoCode(partnerData.stripe_promo_code_id);
    }
  } catch (e) {
    console.error("[Magic Link Verify] Promo code activation failed:", e);
    // Non-fatal — partner can still use dashboard, admin can activate manually
  }
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/partners/apply/route.ts src/components/partner/PartnerApplicationForm.tsx src/app/api/partner/magic-link/verify/route.ts
git commit -m "feat(partners): auto-approve flow with email verification gate"
```

---

## Task 5: Partner Lifecycle Emails

**Files:**
- Create: `src/lib/partner-emails.ts`
- Create: `src/app/api/cron/partner-drip/route.ts`
- Modify: `src/app/api/webhooks/stripe/route.ts` (sale notification)
- Modify: `src/app/api/admin/partners/[id]/route.ts` (payout notification)

- [ ] **Step 1: Create `src/lib/partner-emails.ts`**

This file contains all partner email template functions. Each returns `{ subject, html }` for use with `sendEmail()`. Read `src/lib/email.ts` to confirm the `sendEmail()` signature takes `{ to, subject, html }`. Read `src/lib/tiers.ts` for `TIER_CORE` to compute commission amounts.

Create the file with these exports:

- `partnerWelcomeEmail(name, promoCode, magicLinkUrl)` — Day 0 welcome
- `partnerFirstShareEmail(name, promoCode, referralUrl)` — Day 1 nudge
- `partnerTheMathEmail(name)` — Day 3 commission calculator
- `partnerSocialProofEmail(name)` — Day 7 usage scenarios
- `partnerCheckinEmail(name, totalReferrals, totalEarned)` — Day 14
- `partnerSaleNotificationEmail(name, tierName, commissionCents, totalEarnedCents)` — real-time
- `partnerPayoutNotificationEmail(name, amountCents, method)` — payout processed
- `partnerTierUpgradeEmail(name, newTier, newRate)` — tier upgrade

All emails use dark styling: inner HTML only (sendEmail wraps in template). Amber (#F59E0B) accent, zinc text (#D4D4D8), dark bg handled by wrapper.

Each template function returns `{ subject: string; html: string }`.

**Full file is ~200 lines of template HTML. Each function follows this pattern:**

```typescript
import { TIER_CORE } from "@/lib/tiers";
import { COMMISSION_TIERS } from "@/lib/partner-data";
import { SITE_URL } from "@/lib/site";
import { escapeHtml } from "@/lib/email";

export function partnerSaleNotificationEmail(
  name: string,
  tierName: string,
  commissionCents: number,
  totalEarnedCents: number
): { subject: string; html: string } {
  const commission = (commissionCents / 100).toFixed(2);
  const totalEarned = (totalEarnedCents / 100).toFixed(2);
  return {
    subject: `You earned $${commission}!`,
    html: `
      <h1 style="color: #F59E0B;">Ka-ching! 💰</h1>
      <p style="color: #D4D4D8;">Hey ${escapeHtml(name.split(" ")[0])},</p>
      <p style="color: #D4D4D8;">A client just used your code for <strong style="color:white;">${escapeHtml(tierName)}</strong>.</p>
      <p style="font-size: 28px; font-weight: bold; color: #22C55E;">+$${commission}</p>
      <p style="color: #71717A;">Total earnings: $${totalEarned}</p>
      <a href="${SITE_URL}/partner/login" style="display:inline-block;padding:12px 28px;background:#F59E0B;color:#000;font-weight:bold;border-radius:8px;text-decoration:none;margin-top:16px;">View Dashboard</a>
    `,
  };
}
```

Build all 8 templates following this pattern. The Day 3 "the math" email should compute commission per tier from `TIER_CORE` prices × each tier rate from `COMMISSION_TIERS`.

- [ ] **Step 2: Create `src/app/api/cron/partner-drip/route.ts`**

```typescript
/**
 * GET /api/cron/partner-drip — Send partner activation emails on schedule.
 *
 * Runs every 6 hours via cron-job.org. Sends Day 1/3/7/14 emails to
 * approved partners based on time since creation.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/site";
import {
  partnerFirstShareEmail,
  partnerTheMathEmail,
  partnerSocialProofEmail,
  partnerCheckinEmail,
} from "@/lib/partner-emails";

const ACTIVATION_SEQUENCE = [
  { key: "partner_first_share", delayDays: 1 },
  { key: "partner_the_math", delayDays: 3 },
  { key: "partner_social_proof", delayDays: 7 },
  { key: "partner_checkin", delayDays: 14 },
] as const;

export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  const lock = await acquireCronLock("partner-drip", 5 * 60 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  const supabase = createAdminClient();
  let sent = 0;
  let errors = 0;

  try {
    // Fetch approved partners who haven't completed the sequence
    const { data: partners } = await supabase
      .from("partners")
      .select("id, name, email, promo_code, total_referrals, total_commission, last_activation_email_key, created_at")
      .eq("status", "approved")
      .or("last_activation_email_key.is.null,last_activation_email_key.neq.partner_checkin")
      .limit(100);

    if (!partners?.length) {
      await releaseCronLock(lock.executionId!, "completed");
      return NextResponse.json({ sent: 0, message: "No partners need activation emails" });
    }

    const now = Date.now();

    for (const partner of partners) {
      const createdAt = new Date(partner.created_at).getTime();
      const daysSinceCreation = (now - createdAt) / (1000 * 60 * 60 * 24);

      // Find next email to send
      const lastKey = partner.last_activation_email_key;
      const lastIdx = lastKey
        ? ACTIVATION_SEQUENCE.findIndex((e) => e.key === lastKey)
        : -1;
      const nextEmail = ACTIVATION_SEQUENCE[lastIdx + 1];

      if (!nextEmail || daysSinceCreation < nextEmail.delayDays) continue;

      // Build email content
      let emailContent: { subject: string; html: string };
      const referralUrl = `${SITE_URL}/r/${partner.promo_code}`;

      switch (nextEmail.key) {
        case "partner_first_share":
          emailContent = partnerFirstShareEmail(partner.name, partner.promo_code || "", referralUrl);
          break;
        case "partner_the_math":
          emailContent = partnerTheMathEmail(partner.name);
          break;
        case "partner_social_proof":
          emailContent = partnerSocialProofEmail(partner.name);
          break;
        case "partner_checkin":
          emailContent = partnerCheckinEmail(
            partner.name,
            partner.total_referrals || 0,
            partner.total_commission || 0
          );
          break;
      }

      try {
        await sendEmail(
          { to: partner.email, subject: emailContent.subject, html: emailContent.html },
          { category: "partner-activation", metadata: { partner_id: partner.id, email_key: nextEmail.key } }
        );

        await supabase
          .from("partners")
          .update({
            last_activation_email_key: nextEmail.key,
            activation_email_sent_at: new Date().toISOString(),
          })
          .eq("id", partner.id);

        sent++;
      } catch (e) {
        console.error(`[Partner Drip] Failed for ${partner.id}:`, e);
        errors++;
      }
    }

    await releaseCronLock(lock.executionId!, "completed");
  } catch (e) {
    await releaseCronLock(lock.executionId!, "failed");
    console.error("[Partner Drip] Fatal error:", e);
    return NextResponse.json({ error: "Drip job failed" }, { status: 500 });
  }

  return NextResponse.json({ sent, errors });
}
```

- [ ] **Step 3: Add sale notification to webhook**

In `src/app/api/webhooks/stripe/route.ts`, find the referral tracking block. After the `track_referral` RPC call succeeds (after the `console.log` line that says referral was tracked), add a sale notification email **in its own try-catch outside the referral tracking try-catch**:

```typescript
      // Sale notification to partner (outside referral try-catch so failures don't swallow)
      try {
        const { partnerSaleNotificationEmail } = await import("@/lib/partner-emails");
        const { data: partnerForNotif } = await supabaseAdmin
          .from("partners")
          .select("name, email, total_commission")
          .eq("id", referralPartnerId)
          .maybeSingle();
        if (partnerForNotif) {
          const emailContent = partnerSaleNotificationEmail(
            partnerForNotif.name,
            tierDisplayName(tierSlug),
            commissionAmountCents,
            partnerForNotif.total_commission || 0
          );
          await sendEmail(
            { to: partnerForNotif.email, ...emailContent },
            { category: "partner-notification", metadata: { partner_id: referralPartnerId } }
          );
        }
      } catch (notifErr) {
        console.error("[Webhook] Partner sale notification failed:", notifErr);
      }
```

Also update the `track_referral` RPC call to handle the new jsonb return type and include sub-ID:

```typescript
      const { data: trackResult } = await supabaseAdmin.rpc("track_referral", {
        p_partner_id: referralPartnerId,
        p_order_id: orderId,
        p_tier: tierSlug,
        p_sale_amount: saleAmountCents,
        p_discount_amount: discountAmountCents,
        p_commission_amount: commissionAmountCents,
        p_sub_id: session.metadata?.partner_sub_id || null,
      });

      // Check for tier upgrade
      if (trackResult?.tier_changed) {
        try {
          const { partnerTierUpgradeEmail } = await import("@/lib/partner-emails");
          const { data: partnerForTier } = await supabaseAdmin
            .from("partners")
            .select("name, email")
            .eq("id", referralPartnerId)
            .maybeSingle();
          if (partnerForTier) {
            const tierEmail = partnerTierUpgradeEmail(
              partnerForTier.name,
              trackResult.new_tier,
              trackResult.new_rate
            );
            await sendEmail(
              { to: partnerForTier.email, ...tierEmail },
              { category: "partner-notification", metadata: { partner_id: referralPartnerId } }
            );
          }
        } catch (tierNotifErr) {
          console.error("[Webhook] Tier upgrade notification failed:", tierNotifErr);
        }
      }
```

- [ ] **Step 4: Add payout notification to admin route**

In `src/app/api/admin/partners/[id]/route.ts`, in the POST handler after `process_partner_payout` RPC succeeds, add:

```typescript
    // Send payout notification to partner
    try {
      const { partnerPayoutNotificationEmail } = await import("@/lib/partner-emails");
      const { data: partnerForPayout } = await supabase
        .from("partners")
        .select("name, email, preferred_payment_method")
        .eq("id", id)
        .maybeSingle();
      if (partnerForPayout) {
        const payoutEmail = partnerPayoutNotificationEmail(
          partnerForPayout.name,
          payoutAmountCents,
          partnerForPayout.preferred_payment_method || "your preferred method"
        );
        await sendEmail(
          { to: partnerForPayout.email, ...payoutEmail },
          { category: "partner-notification", metadata: { partner_id: id } }
        );
      }
    } catch (notifErr) {
      console.error("[Admin Partners] Payout notification failed:", notifErr);
    }
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/partner-emails.ts src/app/api/cron/partner-drip/route.ts src/app/api/webhooks/stripe/route.ts src/app/api/admin/partners/[id]/route.ts
git commit -m "feat(partners): lifecycle emails — activation drip, sale notifications, payout + tier alerts"
```

---

## Task 6: Deep Linking + Sub-ID Tracking

**Files:**
- Create: `src/app/r/[code]/[product]/page.tsx`
- Modify: `src/app/r/[code]/page.tsx` (sub-ID cookie)
- Modify: `src/app/api/checkout/route.ts` (pass sub-ID to Stripe metadata)

- [ ] **Step 1: Create deep link handler**

```typescript
/**
 * /r/[code]/[product] — Deep link: sets ref cookie + redirects to product checkout.
 *
 * Used when partners know which tier the defendant needs.
 * Sets both ref and ref_sub cookies, then redirects to checkout.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { REFERRAL_COOKIE_MAX_AGE, sanitizeSubId } from "@/lib/referral";

const PRODUCT_MAP: Record<string, string> = {
  "case-decoder": "case-decoder",
  "intelligence-brief": "intelligence-brief",
  "x-ray": "x-ray",
  "war-room": "war-room",
  "dui": "dui-first-offense",
  "situation-room": "situation-room",
};

interface PageProps {
  params: Promise<{ code: string; product: string }>;
  searchParams: Promise<{ sub?: string }>;
}

export default async function DeepLinkPage({ params, searchParams }: PageProps) {
  const { code, product } = await params;
  const { sub } = await searchParams;

  const tierSlug = PRODUCT_MAP[product.toLowerCase()];
  if (!tierSlug) {
    redirect(`/r/${code}`); // Unknown product → fall back to bridge page
  }

  const supabase = createAdminClient();
  const { data: partner } = await supabase
    .from("partners")
    .select("promo_code, status")
    .eq("promo_code", code.toUpperCase())
    .eq("status", "approved")
    .maybeSingle();

  if (!partner) {
    redirect(`/checkout?tier=${tierSlug}`); // Bad code → still send to checkout, just no discount
  }

  const cookieStore = await cookies();
  cookieStore.set("ref", partner.promo_code!, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: REFERRAL_COOKIE_MAX_AGE,
    path: "/",
  });

  if (sub) {
    const cleanSub = sanitizeSubId(sub);
    if (cleanSub) {
      cookieStore.set("ref_sub", cleanSub, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: REFERRAL_COOKIE_MAX_AGE,
        path: "/",
      });
    }
  }

  redirect(`/checkout?tier=${tierSlug}`);
}
```

- [ ] **Step 2: Add sub-ID cookie to bridge page**

In `src/app/r/[code]/page.tsx`, add `searchParams` to the page props interface and read `sub`:

```typescript
interface PageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ sub?: string }>;
}

export default async function ReferralPage({ params, searchParams }: PageProps) {
  const { code } = await params;
  const { sub } = await searchParams;
```

After the existing `ref` cookie set, add:

```typescript
  if (sub) {
    const cleanSub = sanitizeSubId(sub);
    if (cleanSub) {
      cookieStore.set("ref_sub", cleanSub, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: REFERRAL_COOKIE_MAX_AGE,
        path: "/",
      });
    }
  }
```

Import `sanitizeSubId` alongside the existing `REFERRAL_COOKIE_MAX_AGE` import.

- [ ] **Step 3: Pass sub-ID through checkout**

In `src/app/api/checkout/route.ts`, the body already reads `ref`. Add `refSub`:

```typescript
const refSub = typeof body.refSub === "string" && body.refSub.length <= 50 ? body.refSub : null;
```

In the Stripe session metadata (both one-time and installment payment paths), add:

```typescript
...(refSub && { partner_sub_id: refSub }),
```

The client-side checkout form must also read the `ref_sub` cookie and include it. Find where `ref` is read from `document.cookie` and add `ref_sub` reading with the same pattern.

- [ ] **Step 4: Commit**

```bash
git add src/app/r/[code]/[product]/page.tsx src/app/r/[code]/page.tsx src/app/api/checkout/route.ts
git commit -m "feat(partners): deep linking /r/[code]/[product] + sub-ID tracking"
```

---

## Task 7: Dashboard Decomposition + New Sections

**Files:**
- Create: `src/components/partner/PaymentSettingsForm.tsx`
- Create: `src/components/partner/EarningsSection.tsx`
- Create: `src/components/partner/ToolkitSection.tsx`
- Create: `src/components/partner/PartnerAnalytics.tsx`
- Create: `src/components/partner/ComplianceKit.tsx`
- Create: `src/components/partner/CreativeAssets.tsx`
- Modify: `src/app/partner/dashboard/page.tsx` (refactor to use components + add new sections)
- Modify: `src/app/api/partner/dashboard/route.ts` (add analytics data)
- Modify: `src/app/api/partner/settings/route.ts` (accept PayPal)

This is the largest task. Read the full dashboard page and API route before starting.

- [ ] **Step 1: Extract `PaymentSettingsForm`**

Move lines 342-419 from `src/app/partner/dashboard/page.tsx` into `src/components/partner/PaymentSettingsForm.tsx`. The component receives `partner` (for defaults) and manages its own state. Add PayPal option:

```tsx
<option value="paypal">PayPal</option>
```

Add PayPal field (conditional, same pattern as Zelle):

```tsx
{payMethod === "paypal" && (
  <div>
    <label htmlFor="pay-paypal" className="block text-sm text-zinc-400 mb-1">
      PayPal Email
    </label>
    <input
      id="pay-paypal"
      type="email"
      value={payPaypal}
      onChange={(e) => setPayPaypal(e.target.value)}
      placeholder="your@email.com"
      className="w-full px-4 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
    />
  </div>
)}
```

Include `payment_paypal` in the PATCH body sent to `/api/partner/settings`.

- [ ] **Step 2: Extract `EarningsSection` with tier progress**

Move lines 261-315. Add commission tier display and progress bar at the top:

```tsx
{/* Commission Tier */}
<div className="mb-4 flex items-center gap-4">
  <span className="text-sm text-zinc-400">Your Tier:</span>
  <span className="font-bold text-amber-400 capitalize">{partner.commission_tier || "partner"} Partner</span>
  <span className="text-sm text-zinc-400">({partner.commission_rate}% commission)</span>
</div>
{nextTier && (
  <div className="mb-6">
    <div className="flex justify-between text-xs text-zinc-400 mb-1">
      <span>{earnings.total_referrals} referrals</span>
      <span>{nextTier.threshold} needed for {nextTier.label}</span>
    </div>
    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
      <div
        className="h-full bg-amber-500 rounded-full transition-all"
        style={{ width: `${Math.min(100, (earnings.total_referrals / nextTier.threshold) * 100)}%` }}
      />
    </div>
  </div>
)}
```

Import `getNextTier` from `@/lib/partner-data`.

- [ ] **Step 3: Extract `ToolkitSection`**

Move lines 201-249. Same component, just extracted.

- [ ] **Step 4: Create `ComplianceKit`**

```tsx
"use client";
import { useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";

const APPROVED_LANGUAGE = [
  "This service researches your case and generates questions for your attorney.",
  "They provide legal information, not legal advice.",
  "It helps you hold your attorney accountable.",
  "They dig into your case facts and give you the right questions to ask.",
];

const PROHIBITED_LANGUAGE = [
  "Never promise case outcomes (\"they'll get you off\")",
  "Never say \"better than a lawyer\" or anti-attorney language",
  "Never make case outcome predictions",
  "Never give specific legal advice",
  "Never imply an attorney-client relationship (\"they're your legal team\")",
];

const FTC_DISCLOSURES = [
  { platform: "Social Media", text: "Partner link — I earn a commission if you purchase, at no extra cost to you. #ad" },
  { platform: "Email", text: "Disclosure: I'm a partner of ImNotAnAttorney and earn a commission on purchases made through my link." },
  { platform: "In Person", text: "I work with a company that researches cases and helps defendants prepare questions for their attorney. If you use my code, I get a small commission — doesn't cost you any extra." },
];

export function ComplianceKit() {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleCopy = async (text: string, idx: number) => {
    await copyToClipboard(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-amber-400 mb-2">What You CAN Say</h3>
        <ul className="space-y-2">
          {APPROVED_LANGUAGE.map((text, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
              <span className="text-green-400 mt-0.5">✓</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-sm font-medium text-red-400 mb-2">What You CANNOT Say</h3>
        <ul className="space-y-2">
          {PROHIBITED_LANGUAGE.map((text, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
              <span className="text-red-400 mt-0.5">✗</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-sm font-medium text-amber-400 mb-2">FTC Disclosure Templates</h3>
        <div className="space-y-3">
          {FTC_DISCLOSURES.map((d, i) => (
            <div key={i} className="bg-zinc-800 rounded-lg p-3 border border-zinc-700">
              <p className="text-xs text-zinc-400 mb-1">{d.platform}</p>
              <p className="text-sm text-zinc-300">{d.text}</p>
              <button
                onClick={() => handleCopy(d.text, i)}
                className="mt-2 text-xs px-3 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
              >
                {copiedIdx === i ? "Copied!" : "Copy"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `CreativeAssets`**

Follow the same pattern as `MessageTemplates.tsx` — array of templates with copy buttons. Include:
- 3 social posts (X, Facebook, general)
- 2 email swipe templates
- 1 verbal script for bondsmen
- Download link for one-pager PDF

Each template receives `promoCode` and `referralUrl` as props.

- [ ] **Step 6: Create `PartnerAnalytics`**

Server-rendered CSS bar chart (no chart library). Receives analytics data from the dashboard API. Shows:
- Monthly earnings bars (last 12 months, CSS `width` percentage of max)
- Per-tier breakdown table
- Total referrals count

```tsx
interface AnalyticsData {
  monthly: Array<{ month: string; commission: number; count: number }>;
  by_tier: Array<{ tier: string; commission: number; count: number }>;
  total_referrals: number;
}

export function PartnerAnalytics({ data }: { data: AnalyticsData }) {
  // CSS bar chart implementation...
}
```

- [ ] **Step 7: Update dashboard API to return analytics**

In `src/app/api/partner/dashboard/route.ts`, after fetching partner data, add:

```typescript
  const { data: analytics } = await supabase.rpc("partner_analytics", {
    p_partner_id: partner.id,
  });
```

Return it in the response: `{ partner, earnings, referrals, payouts, analytics }`.

- [ ] **Step 8: Update settings route for PayPal**

In `src/app/api/partner/settings/route.ts`, add `payment_paypal` to the destructured body and string validation:

```typescript
const { preferred_payment_method, payment_zelle, payment_venmo, payment_check_address, payment_paypal } = body;
const stringFields = { payment_zelle, payment_venmo, payment_check_address, payment_paypal };
```

Add to updates:
```typescript
if (payment_paypal !== undefined) {
  updates.payment_paypal = payment_paypal || null;
}
```

- [ ] **Step 9: Refactor dashboard page to use extracted components**

Replace the inline sections in `src/app/partner/dashboard/page.tsx` with the extracted components. Add the new sections: ComplianceKit, CreativeAssets, PartnerAnalytics. Update the `PartnerData` interface to use the shared `Partner` type from `partner-data.ts` (or add `commission_tier` and `payment_paypal` fields).

Dashboard section order:
1. Toolkit (extracted)
2. Ready-to-Send Messages (existing)
3. Creative Assets (NEW)
4. Compliance Kit (NEW)
5. Earnings + Tier Progress (extracted + enhanced)
6. Analytics (NEW)
7. Recent Activity (existing)
8. Payment Settings (extracted + PayPal)
9. Profile (existing)

- [ ] **Step 10: Commit**

```bash
git add src/components/partner/PaymentSettingsForm.tsx src/components/partner/EarningsSection.tsx src/components/partner/ToolkitSection.tsx src/components/partner/PartnerAnalytics.tsx src/components/partner/ComplianceKit.tsx src/components/partner/CreativeAssets.tsx src/app/partner/dashboard/page.tsx src/app/api/partner/dashboard/route.ts src/app/api/partner/settings/route.ts
git commit -m "feat(partners): dashboard decomposition + analytics, compliance kit, creative assets, PayPal"
```

---

## Task 8: Partner Terms of Service Page

**Files:**
- Create: `src/app/partners/terms/page.tsx`

- [ ] **Step 1: Create the terms page**

Static server component. Dark theme, amber accents. Content covers:
- Partner agreement scope
- Prohibited promotional methods (UPL-safe language)
- Brand guidelines
- Commission structure and payout terms (NET-30)
- Termination clauses
- FTC disclosure requirements

Read `src/app/terms/page.tsx` for the existing terms page pattern and styling.

- [ ] **Step 2: Commit**

```bash
git add src/app/partners/terms/page.tsx
git commit -m "feat(partners): partner terms of service page"
```

---

## Task 9: Session Cleanup Cron

**Files:**
- Create: `src/app/api/cron/partner-cleanup/route.ts`

- [ ] **Step 1: Create the cleanup cron route**

```typescript
/**
 * GET /api/cron/partner-cleanup — Clean expired magic links and sessions.
 * Runs daily at 3am ET via cron-job.org.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  const lock = await acquireCronLock("partner-cleanup", 23 * 60 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  const supabase = createAdminClient();

  try {
    // Delete expired AND unused magic links (keep used ones as audit trail)
    const { count: linksDeleted } = await supabase
      .from("partner_magic_links")
      .delete({ count: "exact" })
      .lt("expires_at", new Date().toISOString())
      .is("used_at", null);

    // Delete expired sessions
    const { count: sessionsDeleted } = await supabase
      .from("partner_sessions")
      .delete({ count: "exact" })
      .lt("expires_at", new Date().toISOString());

    await releaseCronLock(lock.executionId!, "completed");

    return NextResponse.json({
      cleaned: {
        expired_magic_links: linksDeleted || 0,
        expired_sessions: sessionsDeleted || 0,
      },
    });
  } catch (e) {
    await releaseCronLock(lock.executionId!, "failed");
    console.error("[Partner Cleanup] Fatal error:", e);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Register cron jobs on cron-job.org**

Register two cron jobs via the API:

1. Partner drip (every 6 hours):
```bash
curl -X PUT "https://api.cron-job.org/jobs" \
  -H "Authorization: Bearer qmy3F+k6DrUgKCz/Jp8fEnpViJrE3pgaUfOoO8yAQn4=" \
  -H "Content-Type: application/json" \
  -d '{"job":{"url":"https://imnotanattorney.com/api/cron/partner-drip","enabled":"true","schedule":{"timezone":"America/New_York","hours":[0,6,12,18],"mdays":[-1],"minutes":[0],"months":[-1],"wdays":[-1]},"requestMethod":0,"auth":{"enable":"true","user":"","password":""},"notification":{"onFailure":"true","onSuccess":"false","onDisable":"true"},"extendedData":{"headers":{"Authorization":"Bearer CRON_AUTH_TOKEN_VALUE"}}}}'
```

2. Partner cleanup (daily 3am ET):
```bash
curl -X PUT "https://api.cron-job.org/jobs" \
  -H "Authorization: Bearer qmy3F+k6DrUgKCz/Jp8fEnpViJrE3pgaUfOoO8yAQn4=" \
  -H "Content-Type: application/json" \
  -d '{"job":{"url":"https://imnotanattorney.com/api/cron/partner-cleanup","enabled":"true","schedule":{"timezone":"America/New_York","hours":[3],"mdays":[-1],"minutes":[0],"months":[-1],"wdays":[-1]},"requestMethod":0,"auth":{"enable":"true","user":"","password":""},"notification":{"onFailure":"true","onSuccess":"false","onDisable":"true"},"extendedData":{"headers":{"Authorization":"Bearer CRON_AUTH_TOKEN_VALUE"}}}}'
```

Replace `CRON_AUTH_TOKEN_VALUE` with the actual value from `.env.local`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/partner-cleanup/route.ts
git commit -m "feat(partners): session cleanup cron + register partner cron jobs"
```

---

## Task 10: Verification

- [ ] **Step 1: Build check**

```bash
cd C:/Users/email/projects/ImNotAnAttorney-web && npx next build 2>&1 | tail -30
```

Fix any TypeScript errors or build failures.

- [ ] **Step 2: Verify migration applied**

Query Supabase to confirm new columns exist:

```bash
curl -s "https://jxjbjmgdukwkoclydqdr.supabase.co/rest/v1/partners?select=commission_tier,payment_paypal,activation_email_sent_at,last_activation_email_key&limit=1" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}"
```

- [ ] **Step 3: Test auto-approve flow end-to-end**

Submit a test partner application via:

```bash
curl -X POST "http://localhost:3000/api/partners/apply" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Partner","email":"test@example.com","compliance":true,"source":"test"}'
```

Verify: partner row created with `status: "approved"`, promo code generated (inactive), welcome email sent.

- [ ] **Step 4: Test deep link**

Visit `/r/TESTCODE/case-decoder` — should set `ref` cookie (90 days) and redirect to `/checkout?tier=case-decoder`.

- [ ] **Step 5: Run CV**

```bash
node ~/projects/continuous-verification/verify.mjs --project inna --probe-only --no-trends
```

- [ ] **Step 6: Final commit if needed**

```bash
git add -A && git status
```

Only commit if there are fixes from verification.

/**
 * @fileoverview Bail bondsman referral system, Stripe promo code helpers.
 *
 * Creates and manages Stripe Promotion Codes for bondsman partners.
 * Architecture: One master coupon (10% off, forever duration) with unique
 * promotion codes per partner. Each promo code carries partner_id in metadata
 * so the webhook can trace referrals back to the bondsman.
 *
 * Dual-mode: Creates coupons/promo codes on BOTH test and live Stripe accounts
 * so they work regardless of which tier the customer purchases.
 */

import { stripeTest, stripeLive } from "./stripe";
import { createAdminClient } from "./supabase/admin";
import type Stripe from "stripe";

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

const MASTER_COUPON_ID = "bondsman-referral-10pct";

/**
 * Ensures the master 10%-off coupon exists on a Stripe account.
 * Idempotent, catches "already exists" errors gracefully.
 */
async function ensureCouponOnClient(client: Stripe): Promise<void> {
  try {
    await client.coupons.retrieve(MASTER_COUPON_ID);
  } catch {
    // Coupon doesn't exist, create it
    try {
      await client.coupons.create({
        id: MASTER_COUPON_ID,
        percent_off: 10,
        duration: "forever",
        name: "Bondsman Partner, 10% Off",
      });
    } catch (createErr: unknown) {
      // Race condition: another request created it between retrieve and create
      const err = createErr as { code?: string };
      if (err.code !== "resource_already_exists") throw createErr;
    }
  }
}

/**
 * Ensures the master 10%-off coupon exists on both test and live Stripe.
 * Call before creating any promotion codes.
 */
export async function ensureMasterCoupon(): Promise<void> {
  await ensureCouponOnClient(stripeTest);
  if (stripeLive) {
    await ensureCouponOnClient(stripeLive);
  }
}

/**
 * Creates a Stripe Promotion Code for a bondsman partner on a single client.
 * Returns the promotion code object.
 */
async function createPromoOnClient(
  client: Stripe,
  partnerId: string,
  code: string,
  partnerName: string
): Promise<Stripe.PromotionCode> {
  return client.promotionCodes.create({
    promotion: { type: "coupon", coupon: MASTER_COUPON_ID },
    code: code.toUpperCase(),
    active: false,
    metadata: {
      partner_id: partnerId,
      partner_name: partnerName,
      system: "bondsman-referral",
    },
  });
}

/**
 * Creates a Stripe Promotion Code for a partner on both test and live accounts.
 * Returns the test-mode promo code object (used as primary reference).
 */
export async function createPartnerPromoCode(
  partnerId: string,
  code: string,
  partnerName: string
): Promise<Stripe.PromotionCode> {
  await ensureMasterCoupon();

  const testPromo = await createPromoOnClient(
    stripeTest,
    partnerId,
    code,
    partnerName
  );

  // Also create on live if available, ignore errors (live might not be set up)
  if (stripeLive) {
    try {
      await createPromoOnClient(stripeLive, partnerId, code, partnerName);
    } catch (err) {
      console.warn("[Referral] Failed to create live promo code:", err);
    }
  }

  return testPromo;
}

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

/**
 * Calculates commission in cents.
 * @param saleAmountCents - Amount customer paid (after discount), in cents
 * @param commissionRate - Commission percentage (e.g., 10 for 10%)
 * @returns Commission amount in cents (rounded down)
 */
export function calculateCommission(
  saleAmountCents: number,
  commissionRate: number
): number {
  return Math.floor((saleAmountCents * commissionRate) / 100);
}

/**
 * Looks up a partner by their Stripe promotion code ID.
 * Used by the webhook to trace a promo code back to a bondsman.
 */
export async function getPartnerByStripePromoId(
  stripePromoCodeId: string
): Promise<{
  id: string;
  name: string;
  commission_rate: number;
  status: string;
} | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("partners")
    .select("id, name, commission_rate, status")
    .eq("stripe_promo_code_id", stripePromoCodeId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[Referral] Partner lookup error:", error);
    return null;
  }
  return data;
}

/**
 * Looks up a partner by promo code text (e.g., "SMITH10").
 * Fallback when the Stripe promo code ID doesn't match (e.g., live vs test mismatch).
 */
export async function getPartnerByPromoCode(
  promoCode: string
): Promise<{
  id: string;
  name: string;
  commission_rate: number;
  status: string;
} | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("partners")
    .select("id, name, commission_rate, status")
    .eq("promo_code", promoCode.toUpperCase())
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[Referral] Partner promo code lookup error:", error);
    return null;
  }
  return data;
}

/**
 * Calculates 10% partner discount.
 * Shared between ReferralQuiz (client) and prep page (server).
 */
export function calculatePartnerDiscount(priceInCents: number): {
  original: number;
  discounted: number;
  savings: number;
} {
  const discounted = Math.round(priceInCents * 0.9);
  return {
    original: priceInCents,
    discounted,
    savings: priceInCents - discounted,
  };
}

/**
 * Partner mode URL computation.
 *
 * Pure helpers — callers gate at the call site with
 * `NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED` and pass the partner-shaped
 * object directly. When called:
 *   - check_in_enabled partners → `${siteUrl}/checkin/{code}`
 *   - referral-only partners    → `${siteUrl}/court-date/{code}`
 *   - partners with no promo_code → ""
 */

import type { Partner } from "@/lib/partner-data";

export type PartnerModeShape = Pick<Partner, "promo_code" | "check_in_enabled">;

/** Strict-true check. null/undefined/false → false. */
export function isCheckInMode(partner: Pick<Partner, "check_in_enabled">): boolean {
  return partner.check_in_enabled === true;
}

/**
 * Compute the public partner URL based on partner mode.
 * Callers are responsible for the NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED
 * gate — see src/app/partner/dashboard, /card, /checklist for the
 * `toggleEnabled ? computePartnerUrl(...) : /r/{code}` pattern.
 */
export function computePartnerUrl(
  partner: PartnerModeShape,
  siteUrl: string,
): string {
  if (!partner.promo_code) return "";
  const prefix = partner.check_in_enabled ? "checkin" : "court-date";
  return `${siteUrl}/${prefix}/${partner.promo_code}`;
}

/** 10% of Intelligence Brief ($997) — anchors the "save $100" messaging. */
export const DISCOUNT_DOLLAR_ANCHOR = 100;
export const DISCOUNT_PERCENT = 10;

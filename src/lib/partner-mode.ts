/**
 * Partner mode URL computation.
 *
 * Toggle-gated routing: when NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED is not "true",
 * always returns /r/{code} (legacy referral URL).
 * When toggle is on:
 *   - check_in_enabled partners → /checkin/{code} (daily check-in mode)
 *   - referral-only partners    → /court-date/{code} (court date prep mode)
 */

import type { PartnerData } from "@/lib/partner-helpers";

export type PartnerModeShape = Pick<PartnerData, "promo_code" | "check_in_enabled">;

/**
 * Compute the public partner URL based on toggle flag + partner mode.
 * When NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED !== "true", always returns /r/{code}.
 * Otherwise: check-in partners → /checkin/{code}, referral partners → /court-date/{code}.
 */
export function computePartnerUrl(
  partner: PartnerModeShape,
  baseUrl: string
): string {
  const toggleOn = process.env.NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED === "true";
  if (!toggleOn) {
    return `${baseUrl}/r/${partner.promo_code}`;
  }
  return partner.check_in_enabled
    ? `${baseUrl}/checkin/${partner.promo_code}`
    : `${baseUrl}/court-date/${partner.promo_code}`;
}

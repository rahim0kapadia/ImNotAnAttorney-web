/**
 * Shared slug map for /r/[code]/[product] deep links. Single source of truth
 * so page.tsx and opengraph-image.tsx cannot drift.
 *
 * "dui" is a legacy shorthand for the playbook slug; everything else is a
 * pass-through to TIER_CORE.
 */
import type { TierSlug } from "./tiers";

export const REFERRAL_PRODUCT_MAP = {
  "case-decoder": "case-decoder",
  "intelligence-brief": "intelligence-brief",
  "x-ray": "x-ray",
  "war-room": "war-room",
  "situation-room": "situation-room",
  "dui": "dui-first-offense",
} as const satisfies Record<string, TierSlug>;

export function resolveReferralProduct(slug: string): TierSlug | null {
  return REFERRAL_PRODUCT_MAP[slug.toLowerCase()] ?? null;
}

/**
 * @fileoverview Stripe client initialization + re-exports from tiers.ts.
 *
 * DUAL-MODE ARCHITECTURE: Supports running test and live Stripe simultaneously.
 * Each tier has a `live` flag in tiers.ts. When live=false, the tier uses test
 * keys. When live=true, it uses live keys. This allows gradual go-live,
 * product by product.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY          — Test mode secret key (sk_test_...)
 *   STRIPE_WEBHOOK_SECRET      — Test mode webhook signing secret
 *
 * Optional env vars (needed when any tier has live=true):
 *   STRIPE_SECRET_KEY_LIVE     — Live mode secret key (sk_live_...)
 *   STRIPE_WEBHOOK_SECRET_LIVE — Live mode webhook signing secret
 *
 * Once ALL tiers are live, you can simplify: remove the test keys and
 * rename the live keys to the non-suffixed names, then remove stripeForTier().
 */

import Stripe from "stripe";
import { type TierSlug, isTierLive } from "./tiers";

// Re-export tier data so existing `import { TIERS } from './stripe'` still works
export { TIER_CORE as TIERS, type TierSlug, isValidTier } from "./tiers";

// ============================================================
// CLIENT INITIALIZATION
// ============================================================

const testKey = process.env.STRIPE_SECRET_KEY;
if (!testKey) {
  throw new Error(
    "Missing STRIPE_SECRET_KEY env var — Stripe client cannot initialize"
  );
}

/** Test-mode Stripe client. Always available. */
export const stripeTest = new Stripe(testKey, { typescript: true });

/** Live-mode Stripe client. Only initialized if STRIPE_SECRET_KEY_LIVE is set. */
const liveKey = process.env.STRIPE_SECRET_KEY_LIVE;
export const stripeLive: Stripe | null = liveKey
  ? new Stripe(liveKey, { typescript: true })
  : null;

/**
 * Returns the correct Stripe client for a given tier based on its `live` flag.
 * Throws if a tier is marked live but STRIPE_SECRET_KEY_LIVE is not configured.
 */
export function stripeForTier(tier: TierSlug): Stripe {
  if (isTierLive(tier)) {
    if (!stripeLive) {
      throw new Error(
        `Tier "${tier}" is marked live but STRIPE_SECRET_KEY_LIVE is not set`
      );
    }
    return stripeLive;
  }
  return stripeTest;
}

/**
 * Legacy export — used by code that doesn't need per-tier routing
 * (e.g., webhook signature verification, which handles both modes).
 * Defaults to test client.
 */
export const stripe = stripeTest;

/**
 * @fileoverview Stripe client initialization + re-exports from tiers.ts.
 *
 * Tier definitions live in `src/lib/tiers.ts` (single source of truth).
 * This module re-exports TIERS, TierSlug, and isValidTier so that existing
 * importers (api/checkout, webhooks) continue to work without changes.
 *
 * Environment: Requires STRIPE_SECRET_KEY to be set. Throws at import time
 * if the key is missing — any code path that imports this module NEEDS Stripe.
 */

import Stripe from "stripe";

// Re-export tier data so existing `import { TIERS } from './stripe'` still works
export { TIER_CORE as TIERS, type TierSlug, isValidTier } from "./tiers";

// ============================================================
// CLIENT INITIALIZATION
// ============================================================

const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  throw new Error(
    "Missing STRIPE_SECRET_KEY env var — Stripe client cannot initialize"
  );
}

/** Initialized Stripe SDK client. Currently using test keys (live mode pending). */
export const stripe = new Stripe(stripeKey, {
  typescript: true,
});

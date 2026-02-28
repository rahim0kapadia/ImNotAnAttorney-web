/**
 * @fileoverview Stripe configuration, client initialization, and tier definitions.
 *
 * This module exports three things:
 *   1. `stripe` — An initialized Stripe SDK client.
 *   2. `TIERS` — The canonical pricing/product definitions for all service tiers.
 *   3. `isValidTier()` — A type guard for validating tier slug strings.
 *
 * IMPORTANT — Pricing source-of-truth maintenance concern:
 * The `TIERS` object below is ONE OF THREE places where pricing data lives:
 *   1. Here (src/lib/stripe.ts) — used by checkout API, webhooks, backend logic
 *   2. PricingTable.tsx — the React component rendered on the services page
 *   3. src/app/services/page.tsx — the services page layout
 * All three MUST be kept in sync when prices change. A future improvement
 * would be to derive PricingTable and services page data from this TIERS
 * object, but that refactor has not been done yet.
 *
 * Environment: Requires STRIPE_SECRET_KEY to be set. Unlike other modules
 * that gracefully degrade on missing env vars, this module throws at import
 * time if the key is missing. This is intentional: any code path that imports
 * this module NEEDS Stripe to function, so failing fast with a descriptive
 * error is better than a cryptic null-reference crash later.
 */

import Stripe from "stripe";

// ============================================================
// CLIENT INITIALIZATION
// ============================================================

/**
 * Explicit env var check — throws a descriptive error at import time if
 * STRIPE_SECRET_KEY is missing, rather than using TypeScript's non-null
 * assertion (!) which would produce an unhelpful runtime error.
 */
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

// ============================================================
// TIER DEFINITIONS
// ============================================================

/**
 * Canonical product tier definitions for all ImNotAnAttorney services.
 *
 * Prices are in CENTS (Stripe convention). Example: 19700 = $197.00.
 *
 * Each tier includes:
 *   - `name`: Human-readable product name.
 *   - `price`: Base price in cents.
 *   - `delivery`: Standard delivery timeframe string.
 *   - `requiresDiscovery`: Whether the customer must upload discovery documents.
 *   - `priorityPrice`: Price in cents for the "priority delivery" add-on.
 *     Null if priority delivery is not available for this tier.
 *   - `priorityDelivery`: Delivery timeframe with priority add-on.
 *     Null if not available.
 *
 * NOTE: 100% upgrade credit policy — any purchase amount is credited toward
 * the next tier within 12 months. Refunded purchases forfeit upgrade credit.
 *
 * Canonical pricing source of truth is the `tiers` Supabase table.
 * This object must be kept in sync until the frontend reads from DB.
 */
export const TIERS = {
  "case-decoder": {
    name: "Case Decoder",
    price: 19700, // cents
    delivery: "24 hours",
    requiresDiscovery: false,
    priorityPrice: 9700,
    priorityDelivery: "Same-day (4 hours)",
  },
  "intelligence-brief": {
    name: "Case Intelligence Brief",
    price: 79700,
    delivery: "48-72 hours",
    requiresDiscovery: false,
    priorityPrice: 29700,
    priorityDelivery: "24 hours",
  },
  "x-ray": {
    name: "The X-Ray",
    price: 149700,
    delivery: "10 business days",
    requiresDiscovery: true,
    priorityPrice: 49700,
    priorityDelivery: "5 business days",
  },
  "war-room": {
    name: "The War Room",
    price: 349700,
    delivery: "25-28 days + weekly updates",
    requiresDiscovery: true,
    priorityPrice: 99700,
    priorityDelivery: "Expedited 20-day delivery",
  },
  "situation-room": {
    name: "The Situation Room",
    price: 999700,
    delivery: "24-48hr priority turnaround",
    requiresDiscovery: true,
    priorityPrice: null,
    priorityDelivery: null,
  },
  "extra-witness": {
    name: "Extra Witness Intel",
    price: 14900,
    delivery: "Next update cycle",
    requiresDiscovery: false,
    priorityPrice: null,
    priorityDelivery: null,
  },
  "witness-pack": {
    name: "Standalone Witness Pack",
    price: 29700,
    delivery: "3-5 business days",
    requiresDiscovery: true,
    priorityPrice: null,
    priorityDelivery: null,
  },
} as const;

/** Union type of all valid tier slug strings (e.g., "case-decoder" | "x-ray" | ...). */
export type TierSlug = keyof typeof TIERS;

/**
 * Type guard that checks whether a string is a valid tier slug.
 *
 * Used in API routes to validate user-supplied tier parameters before
 * indexing into the TIERS object. Without this guard, arbitrary strings
 * would produce undefined lookups.
 *
 * @param slug - The string to validate.
 * @returns True if the slug is a key of the TIERS object, narrowing the type.
 */
export function isValidTier(slug: string): slug is TierSlug {
  return slug in TIERS;
}

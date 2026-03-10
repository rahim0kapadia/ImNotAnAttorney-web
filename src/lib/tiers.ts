/**
 * Single source of truth for all tier/product definitions.
 *
 * If you change this file, also update:
 *   - CLAUDE.md (Products & Pricing table)
 *   - docs/PRD.md (Section 5)
 *   - system/DELIVERABLES-BY-TIER.md
 *
 * Run `node scripts/check-tiers.mjs` after changes to verify doc consistency.
 */

// ============================================================
// TIER DEFINITIONS
// ============================================================

/**
 * Canonical product tier definitions for all ImNotAnAttorney services.
 *
 * Prices are in CENTS (Stripe convention). Example: 19700 = $197.00.
 *
 * NOTE: 100% upgrade credit policy — any purchase amount is credited toward
 * the next tier within 12 months. Refunded purchases forfeit upgrade credit.
 */
export const TIER_CORE = {
  "dui-first-offense": {
    name: "DUI Defense Playbook",
    price: 9700, // cents
    priceDisplay: "$97",
    delivery: "Instant download",
    deliveryDetail: "Your playbook is delivered instantly to your email after purchase.",
    requiresDiscovery: false,
    isAddon: false,
    isDigitalProduct: true,
    requiresWarRoom: false,
    priorityPrice: null,
    priorityDelivery: null,
    includesTiers: [] as readonly string[],
  },
  "drug-possession": {
    name: "Drug Possession Defense Playbook",
    price: 9700, // cents
    priceDisplay: "$97",
    delivery: "Instant download",
    deliveryDetail: "Your playbook is delivered instantly to your email after purchase.",
    requiresDiscovery: false,
    isAddon: false,
    isDigitalProduct: true,
    requiresWarRoom: false,
    priorityPrice: null,
    priorityDelivery: null,
    includesTiers: [] as readonly string[],
  },
  "probation-violation": {
    name: "Probation Violation Defense Playbook",
    price: 9700, // cents
    priceDisplay: "$97",
    delivery: "Instant download",
    deliveryDetail: "Your playbook is delivered instantly to your email after purchase.",
    requiresDiscovery: false,
    isAddon: false,
    isDigitalProduct: true,
    requiresWarRoom: false,
    priorityPrice: null,
    priorityDelivery: null,
    includesTiers: [] as readonly string[],
  },
  "white-collar": {
    name: "White Collar Defense Playbook",
    price: 9700, // cents
    priceDisplay: "$97",
    delivery: "Instant download",
    deliveryDetail: "Your playbook is delivered instantly to your email after purchase.",
    requiresDiscovery: false,
    isAddon: false,
    isDigitalProduct: true,
    requiresWarRoom: false,
    priorityPrice: null,
    priorityDelivery: null,
    includesTiers: [] as readonly string[],
  },
  "sex-offense": {
    name: "Sex Offense Defense Playbook",
    price: 9700, // cents
    priceDisplay: "$97",
    delivery: "Instant download",
    deliveryDetail: "Your playbook is delivered instantly to your email after purchase.",
    requiresDiscovery: false,
    isAddon: false,
    isDigitalProduct: true,
    requiresWarRoom: false,
    priorityPrice: null,
    priorityDelivery: null,
    includesTiers: [] as readonly string[],
  },
  "federal-criminal": {
    name: "Federal Criminal Defense Playbook",
    price: 9700, // cents
    priceDisplay: "$97",
    delivery: "Instant download",
    deliveryDetail: "Your playbook is delivered instantly to your email after purchase.",
    requiresDiscovery: false,
    isAddon: false,
    isDigitalProduct: true,
    requiresWarRoom: false,
    priorityPrice: null,
    priorityDelivery: null,
    includesTiers: [] as readonly string[],
  },
  "drug-trafficking": {
    name: "Drug Trafficking Defense Playbook",
    price: 9700, // cents
    priceDisplay: "$97",
    delivery: "Instant download",
    deliveryDetail: "Your playbook is delivered instantly to your email after purchase.",
    requiresDiscovery: false,
    isAddon: false,
    isDigitalProduct: true,
    requiresWarRoom: false,
    priorityPrice: null,
    priorityDelivery: null,
    includesTiers: [] as readonly string[],
  },
  "case-decoder": {
    name: "Case Decoder",
    price: 19700, // cents
    priceDisplay: "$197",
    delivery: "48 hours",
    deliveryDetail: "Your report is generated within minutes and reviewed by our team before delivery. You'll receive it within 48 hours of submitting your case details.",
    requiresDiscovery: false,
    isAddon: false,
    isDigitalProduct: false,
    requiresWarRoom: false,
    priorityPrice: 9700,
    priorityDelivery: "Same-day (4 hours)",
    includesTiers: [] as readonly string[],
  },
  "intelligence-brief": {
    name: "Case Intelligence Brief",
    price: 99700,
    priceDisplay: "$997",
    delivery: "72 hours",
    deliveryDetail: "Your Case Decoder report is delivered within 48 hours, followed by your full Intelligence Brief within 72 hours of intake submission.",
    requiresDiscovery: false,
    isAddon: false,
    isDigitalProduct: false,
    requiresWarRoom: false,
    priorityPrice: 29700,
    priorityDelivery: "24 hours",
    includesTiers: ["case-decoder"] as readonly string[],
  },
  "x-ray": {
    name: "The X-Ray",
    price: 249700,
    priceDisplay: "$2,497",
    delivery: "10 business days",
    deliveryDetail: "Included reports (Case Decoder + Intelligence Brief) are delivered first, then your full X-Ray analysis within 10 business days of document upload.",
    requiresDiscovery: true,
    isAddon: false,
    isDigitalProduct: false,
    requiresWarRoom: false,
    priorityPrice: 49700,
    priorityDelivery: "5 business days",
    includesTiers: ["case-decoder", "intelligence-brief"] as readonly string[],
  },
  "war-room": {
    name: "The War Room",
    price: 499700,
    priceDisplay: "$4,997",
    delivery: "25-28 days + weekly updates",
    deliveryDetail: "Included reports delivered first, then your full War Room intelligence package within 25-28 business days. Weekly updates begin immediately after initial delivery.",
    requiresDiscovery: true,
    isAddon: false,
    isDigitalProduct: false,
    requiresWarRoom: false,
    priorityPrice: 99700,
    priorityDelivery: "Expedited 20-day delivery",
    includesTiers: ["case-decoder", "intelligence-brief", "x-ray"] as readonly string[],
  },
  "situation-room": {
    name: "The Situation Room",
    price: 999700,
    priceDisplay: "$9,997",
    delivery: "24-48hr priority turnaround",
    deliveryDetail: "All deliverables on a priority timeline with 24-48hr turnaround per stage. Trial Intelligence Operations activate when trial begins.",
    requiresDiscovery: true,
    isAddon: false,
    isDigitalProduct: false,
    requiresWarRoom: true,
    priorityPrice: null,
    priorityDelivery: null,
    includesTiers: ["case-decoder", "intelligence-brief", "x-ray", "war-room"] as readonly string[],
  },
  "extra-witness": {
    name: "Extra Witness Intel",
    price: 14900,
    priceDisplay: "$149",
    delivery: "Next update cycle",
    deliveryDetail: "Your extra witness analysis will be included in your next scheduled case update.",
    requiresDiscovery: false,
    isAddon: true,
    isDigitalProduct: false,
    requiresWarRoom: false,
    priorityPrice: null,
    priorityDelivery: null,
    includesTiers: [] as readonly string[],
  },
  "witness-pack": {
    name: "Standalone Witness Pack",
    price: 29700,
    priceDisplay: "$297",
    delivery: "3-5 business days",
    deliveryDetail: "Your witness analysis is delivered within 3-5 business days of receiving your discovery documents.",
    requiresDiscovery: true,
    isAddon: true,
    isDigitalProduct: false,
    requiresWarRoom: false,
    priorityPrice: null,
    priorityDelivery: null,
    includesTiers: [] as readonly string[],
  },
} as const;

// ============================================================
// TYPES & TYPE GUARDS
// ============================================================

/** Union type of all valid tier slug strings. */
export type TierSlug = keyof typeof TIER_CORE;

/**
 * Type guard that checks whether a string is a valid tier slug.
 * Used in API routes to validate user-supplied tier parameters.
 */
export function isValidTier(slug: string): slug is TierSlug {
  return slug in TIER_CORE;
}

// ============================================================
// HELPERS
// ============================================================

/** Returns the price in whole dollars (e.g., 19700 -> 197). */
export function tierPriceNum(slug: TierSlug): number {
  return TIER_CORE[slug].price / 100;
}

/** Returns only the main service tiers (excludes add-ons). */
export function mainTiers(): TierSlug[] {
  return (Object.keys(TIER_CORE) as TierSlug[]).filter(
    (slug) => !TIER_CORE[slug].isAddon
  );
}

/** Returns only the add-on tiers. */
export function addonTiers(): TierSlug[] {
  return (Object.keys(TIER_CORE) as TierSlug[]).filter(
    (slug) => TIER_CORE[slug].isAddon
  );
}

// ============================================================
// UPGRADE HELPERS
// ============================================================

/** Ordered tier slugs for the standard upgrade path (excludes add-ons). */
const UPGRADE_PATH: TierSlug[] = [
  "dui-first-offense",
  "drug-possession",
  "probation-violation",
  "white-collar",
  "sex-offense",
  "federal-criminal",
  "drug-trafficking",
  "case-decoder",
  "intelligence-brief",
  "x-ray",
  "war-room",
  "situation-room",
];

/** Returns the next tier slug in the upgrade path, or null if at the top. */
export function nextTierSlug(slug: TierSlug): TierSlug | null {
  const idx = UPGRADE_PATH.indexOf(slug);
  return idx >= 0 && idx < UPGRADE_PATH.length - 1
    ? UPGRADE_PATH[idx + 1]
    : null;
}

/** Computes upgrade cost as display string (e.g., "$800"). Returns null if no next tier. */
export function upgradePrice(fromSlug: TierSlug): string | null {
  const next = nextTierSlug(fromSlug);
  if (!next) return null;
  const diff = (TIER_CORE[next].price - TIER_CORE[fromSlug].price) / 100;
  return `$${diff.toLocaleString()}`;
}

/** Computes upgrade cost between any two tiers as display string. */
export function upgradeCostBetween(
  fromSlug: TierSlug,
  toSlug: TierSlug
): string {
  const diff = (TIER_CORE[toSlug].price - TIER_CORE[fromSlug].price) / 100;
  return `$${diff.toLocaleString()}`;
}


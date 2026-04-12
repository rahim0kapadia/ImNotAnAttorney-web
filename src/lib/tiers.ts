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
 *
 * GRADUAL GO-LIVE: The `live` flag controls which Stripe mode each tier uses.
 * When `live: false` (default), the tier uses test Stripe keys. When `live: true`,
 * it uses live Stripe keys and accepts real payments. Flip one tier at a time,
 * starting with the lowest-risk product (DUI Playbook), and work up.
 * Once all tiers are live, remove the dual-mode code (see stripe.ts).
 */
export const TIER_CORE = {
  "dui-first-offense": {
    name: "DUI Defense Playbook",
    price: 12700, // cents — raised from $97 → $127 (2026-04-07, Hormozi pricing lift)
    priceDisplay: "$127",
    delivery: "Instant download",
    deliveryDetail: "Your playbook is delivered instantly to your email after purchase.",
    requiresDiscovery: false,
    isAddon: false,
    isDigitalProduct: true,
    requiresWarRoom: false,
    priorityPrice: null,
    priorityDelivery: null,
    includesTiers: [] as readonly string[],
    live: true as boolean, // LIVE — real payments enabled 2026-03-24
  },
  "drug-possession": {
    name: "Drug Possession Defense Playbook",
    price: 12700, // cents — raised from $97 → $127 (2026-04-07, Hormozi pricing lift)
    priceDisplay: "$127",
    delivery: "Instant download",
    deliveryDetail: "Your playbook is delivered instantly to your email after purchase.",
    requiresDiscovery: false,
    isAddon: false,
    isDigitalProduct: true,
    requiresWarRoom: false,
    priorityPrice: null,
    priorityDelivery: null,
    includesTiers: [] as readonly string[],
    live: true as boolean, // LIVE — 2026-03-25
  },
  "probation-violation": {
    name: "Probation Violation Defense Playbook",
    price: 12700, // cents — raised from $97 → $127 (2026-04-07, Hormozi pricing lift)
    priceDisplay: "$127",
    delivery: "Instant download",
    deliveryDetail: "Your playbook is delivered instantly to your email after purchase.",
    requiresDiscovery: false,
    isAddon: false,
    isDigitalProduct: true,
    requiresWarRoom: false,
    priorityPrice: null,
    priorityDelivery: null,
    includesTiers: [] as readonly string[],
    live: true as boolean, // LIVE — 2026-03-25
  },
  "white-collar": {
    name: "White Collar Defense Playbook",
    price: 14700, // cents — raised from $97 → $147 (2026-04-07, Hormozi premium tier for higher-stakes charges)
    priceDisplay: "$147",
    delivery: "Instant download",
    deliveryDetail: "Your playbook is delivered instantly to your email after purchase.",
    requiresDiscovery: false,
    isAddon: false,
    isDigitalProduct: true,
    requiresWarRoom: false,
    priorityPrice: null,
    priorityDelivery: null,
    includesTiers: [] as readonly string[],
    live: true as boolean, // LIVE — 2026-03-25
  },
  "sex-offense": {
    name: "Sex Offense Defense Playbook",
    price: 12700, // cents — raised from $97 → $127 (2026-04-07, Hormozi pricing lift)
    priceDisplay: "$127",
    delivery: "Instant download",
    deliveryDetail: "Your playbook is delivered instantly to your email after purchase.",
    requiresDiscovery: false,
    isAddon: false,
    isDigitalProduct: true,
    requiresWarRoom: false,
    priorityPrice: null,
    priorityDelivery: null,
    includesTiers: [] as readonly string[],
    live: true as boolean, // LIVE — 2026-03-25
  },
  "federal-criminal": {
    name: "Federal Criminal Defense Playbook",
    price: 14700, // cents — raised from $97 → $147 (2026-04-07, Hormozi premium tier: federal stakes)
    priceDisplay: "$147",
    delivery: "Instant download",
    deliveryDetail: "Your playbook is delivered instantly to your email after purchase.",
    requiresDiscovery: false,
    isAddon: false,
    isDigitalProduct: true,
    requiresWarRoom: false,
    priorityPrice: null,
    priorityDelivery: null,
    includesTiers: [] as readonly string[],
    live: true as boolean, // LIVE — 2026-03-25
  },
  "drug-trafficking": {
    name: "Drug Trafficking Defense Playbook",
    price: 14700, // cents — raised from $97 → $147 (2026-04-07, Hormozi premium tier: trafficking stakes)
    priceDisplay: "$147",
    delivery: "Instant download",
    deliveryDetail: "Your playbook is delivered instantly to your email after purchase.",
    requiresDiscovery: false,
    isAddon: false,
    isDigitalProduct: true,
    requiresWarRoom: false,
    priorityPrice: null,
    priorityDelivery: null,
    includesTiers: [] as readonly string[],
    live: true as boolean, // LIVE — 2026-03-25
  },
  "self-defense": {
    name: "Self-Defense / Justifiable Force Defense Playbook",
    price: 12700, // cents — raised from $97 → $127 (2026-04-07, Hormozi pricing lift)
    priceDisplay: "$127",
    delivery: "Instant download",
    deliveryDetail: "Your playbook is delivered instantly to your email after purchase.",
    requiresDiscovery: false,
    isAddon: false,
    isDigitalProduct: true,
    requiresWarRoom: false,
    priorityPrice: null,
    priorityDelivery: null,
    includesTiers: [] as readonly string[],
    live: true as boolean, // LIVE — 2026-03-25
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
    live: true as boolean, // LIVE — 2026-03-27
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
    live: true as boolean, // LIVE — 2026-03-28
  },
  "x-ray": {
    name: "The X-Ray",
    // PRICE TEST: raise to $2,997 after Wave 1 ships in production
    price: 249700,  // x-ray current
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
    live: true as boolean, // LIVE — 2026-03-28
  },
  "war-room": {
    name: "The War Room",
    // PRICE TEST: raise to $5,997 after Wave 1 ships in production
    price: 499700,  // war-room current
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
    live: true as boolean, // LIVE — 2026-03-28
  },
  "situation-room": {
    name: "The Situation Room",
    // PRICE TEST: raise to $14,997 after Wave 3 ships in production
    price: 999700,  // situation-room current
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
    live: true as boolean, // LIVE — 2026-03-28
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
    live: true as boolean, // LIVE — 2026-03-28
  },
  "judge-report-card": {
    name: "Judge Report Card",
    price: 19700,
    priceDisplay: "$197",
    delivery: "Instant",
    deliveryDetail: "Your Judge Report Card is generated on demand within 60 seconds of purchase.",
    requiresDiscovery: false,
    isAddon: false,
    isDigitalProduct: true,
    requiresWarRoom: false,
    priorityPrice: null,
    priorityDelivery: null,
    includesTiers: [] as readonly string[],
    live: false as boolean, // PAUSED — availability gate shipping, re-enable after deploy
  },
  "officer-background-check": {
    name: "Officer Background Check",
    price: 9700,
    priceDisplay: "$97",
    delivery: "Instant",
    deliveryDetail: "Your Officer Background Check is generated on demand within 60 seconds of purchase.",
    requiresDiscovery: false,
    isAddon: false,
    isDigitalProduct: true,
    requiresWarRoom: false,
    priorityPrice: null,
    priorityDelivery: null,
    includesTiers: [] as readonly string[],
    live: false as boolean, // PAUSED — availability gate shipping, re-enable after deploy
  },
  "similar-cases-analyzer": {
    name: "Similar Cases Analyzer",
    price: 29700,
    priceDisplay: "$297",
    delivery: "Instant",
    deliveryDetail: "Your Similar Cases Analyzer report is generated on demand within 60 seconds of purchase.",
    requiresDiscovery: false,
    isAddon: false,
    isDigitalProduct: true,
    requiresWarRoom: false,
    priorityPrice: null,
    priorityDelivery: null,
    includesTiers: [] as readonly string[],
    live: false as boolean, // PAUSED — availability gate shipping, re-enable after deploy
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
    live: true as boolean, // LIVE — 2026-03-28
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

/** Returns the human-readable display name for a tier slug. */
export function tierDisplayName(slug: string): string {
  if (slug in TIER_CORE) {
    return TIER_CORE[slug as TierSlug].name;
  }
  // Fallback: capitalize and replace hyphens
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

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

/** Returns true if a tier is in live Stripe mode (accepts real payments). */
export function isTierLive(slug: TierSlug): boolean {
  return TIER_CORE[slug].live;
}

// ============================================================
// UPGRADE HELPERS
// ============================================================

/** All $97 playbook slugs — these upgrade to case-decoder, not to each other. */
export const PLAYBOOK_SLUGS: ReadonlySet<TierSlug> = new Set([
  "dui-first-offense",
  "drug-possession",
  "probation-violation",
  "white-collar",
  "sex-offense",
  "federal-criminal",
  "drug-trafficking",
  "self-defense",
]);

/** Ordered service tier upgrade path (excludes playbooks and add-ons). */
const SERVICE_UPGRADE_PATH: TierSlug[] = [
  "case-decoder",
  "intelligence-brief",
  "x-ray",
  "war-room",
  "situation-room",
];

/**
 * Returns the next tier slug in the upgrade path, or null if at the top.
 * Playbook slugs always upgrade to case-decoder.
 * Service tiers follow the standard ladder: CD -> IB -> X-Ray -> WR -> SR.
 */
export function nextTierSlug(slug: TierSlug): TierSlug | null {
  if (PLAYBOOK_SLUGS.has(slug)) return "case-decoder";
  const idx = SERVICE_UPGRADE_PATH.indexOf(slug);
  return idx >= 0 && idx < SERVICE_UPGRADE_PATH.length - 1
    ? SERVICE_UPGRADE_PATH[idx + 1]
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


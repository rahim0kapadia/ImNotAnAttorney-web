/**
 * Hybrid Stacking Matrix — unified 4-way product placement.
 * Maps standalone products to: tier bundles + IDD eligibility.
 * Source: docs/superpowers/specs/2026-04-09-hybrid-stacking-cascade-design.md Section 7.
 *
 * This file adds RELATIONSHIPS that products.ts and tiers.ts don't have.
 * Product metadata (name, price, delivery) stays in products.ts.
 * Tier metadata (includesTiers, live) stays in tiers.ts.
 */
import { getProduct } from './products';
import { PLAYBOOK_SLUGS, TierSlug } from './tiers';

export interface MatrixEntry {
  /** Tier slugs that include this capability as a bundled deliverable */
  bundledInTiers: string[];
  /** Condition for tier inclusion (e.g., 'dui' = only for DUI cases at that tier) */
  tierCondition?: string;
  /** Available via IDD scholarship program */
  iddEligible: boolean;
}

/**
 * Every standalone research product mapped to its tier bundle membership and IDD eligibility.
 * Products NOT in this map are standalone-only (no tier bundle, no IDD).
 */
export const PRODUCT_MATRIX: Record<string, MatrixEntry> = {
  // ── Category A — Universal (bundled at Case Decoder and above) ──
  'bail-hearing-prep': {
    bundledInTiers: ['case-decoder', 'intelligence-brief', 'x-ray', 'war-room', 'situation-room'],
    iddEligible: true,
  },
  'arrest-report-review': {
    bundledInTiers: ['case-decoder', 'intelligence-brief', 'x-ray', 'war-room', 'situation-room'],
    iddEligible: true,
  },

  // ── Category B — Charge-Specific (X-Ray+, conditional on charge type) ──
  'breathalyzer-challenge': {
    bundledInTiers: ['x-ray', 'war-room', 'situation-room'],
    tierCondition: 'dui',
    iddEligible: true,
  },
  'fst-review': {
    bundledInTiers: ['x-ray', 'war-room', 'situation-room'],
    tierCondition: 'dui',
    iddEligible: true,
  },
  'drug-test-reliability': {
    bundledInTiers: ['x-ray', 'war-room', 'situation-room'],
    tierCondition: 'drug',
    iddEligible: true,
  },

  // ── Category C — Life Consequence ──
  'plea-consequences': {
    bundledInTiers: ['case-decoder', 'intelligence-brief', 'x-ray', 'war-room', 'situation-room'],
    iddEligible: true,
  },
  'collateral-consequences': {
    bundledInTiers: ['war-room', 'situation-room'],
    iddEligible: true,
  },
  'security-clearance': {
    bundledInTiers: ['war-room', 'situation-room'],
    tierCondition: 'fed-gov',
    iddEligible: true,
  },
  'employment-impact': {
    bundledInTiers: ['war-room', 'situation-room'],
    iddEligible: true,
  },
  'custody-impact': {
    bundledInTiers: ['war-room', 'situation-room'],
    tierCondition: 'parent',
    iddEligible: true,
  },
  'license-risk': {
    bundledInTiers: ['war-room', 'situation-room'],
    tierCondition: 'licensed',
    iddEligible: true,
  },
  'immigration-impact': {
    bundledInTiers: ['war-room', 'situation-room'],
    tierCondition: 'non-citizen',
    iddEligible: true,
  },

  // ── Category D — Hearing / Phase Specific ──
  'sentencing-prep': {
    bundledInTiers: ['intelligence-brief', 'x-ray', 'war-room', 'situation-room'],
    tierCondition: 'post-conviction',
    iddEligible: true,
  },
  'family-case-research': {
    bundledInTiers: [], // Family-facing, standalone only
    iddEligible: true,
  },

  // ── Category E — Premium Enrichment ──
  'judge-profile': {
    bundledInTiers: ['x-ray', 'war-room', 'situation-room'],
    iddEligible: true,
  },
  'motion-opportunity-scan': {
    bundledInTiers: ['war-room', 'situation-room'],
    iddEligible: true,
  },

  // ── Standalone-only research (not bundled into any tier) ──
  'expungement-research': { bundledInTiers: [], iddEligible: true },
  'sentence-reduction': { bundledInTiers: [], iddEligible: true },
  'appeal-viability': { bundledInTiers: [], iddEligible: true },
  'ineffective-counsel': { bundledInTiers: [], iddEligible: true },
  'attorney-performance-review': { bundledInTiers: [], iddEligible: true },
  'probation-violation-response': { bundledInTiers: [], iddEligible: true },
  'discovery-decoder': { bundledInTiers: [], iddEligible: true },
  'constructive-possession': { bundledInTiers: [], iddEligible: true },
  'self-surrender-prep': { bundledInTiers: [], iddEligible: true },
  'probation-rights': { bundledInTiers: [], iddEligible: true },
};

// ── Scholarship Funding Math ──

/** Whole scholarships funded per tier purchase */
export const TIER_SCHOLARSHIP_MAP: Record<string, number> = {
  'case-decoder': 1,
  'intelligence-brief': 2,
  'x-ray': 5,
  'war-room': 10,
  'situation-room': 20,
};

/** Playbook purchases accumulate half-credits. 2 halves = 1 scholarship. */
export const PLAYBOOK_HALF_CREDITS = 1;

// ── Helper Functions ──

/** Get all standalone products bundled into a given tier (unconditional only) */
export function getBundledProducts(tierSlug: string): { slug: string; name: string; priceDisplay: string }[] {
  return Object.entries(PRODUCT_MATRIX)
    .filter(([, entry]) => entry.bundledInTiers.includes(tierSlug) && !entry.tierCondition)
    .map(([slug]) => {
      const product = getProduct(slug);
      return product ? { slug, name: product.name, priceDisplay: product.priceDisplay } : null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);
}

/** Get conditionally-bundled products (DUI, drug, etc.) for a tier */
export function getConditionalProducts(tierSlug: string): { slug: string; name: string; priceDisplay: string; condition: string }[] {
  return Object.entries(PRODUCT_MATRIX)
    .filter(([, entry]) => entry.bundledInTiers.includes(tierSlug) && !!entry.tierCondition)
    .map(([slug, entry]) => {
      const product = getProduct(slug);
      return product ? { slug, name: product.name, priceDisplay: product.priceDisplay, condition: entry.tierCondition! } : null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);
}

/** Total standalone-equivalent value for unconditional bundled products (cents) */
export function getBundleValueCents(tierSlug: string): number {
  return Object.entries(PRODUCT_MATRIX)
    .filter(([, entry]) => entry.bundledInTiers.includes(tierSlug) && !entry.tierCondition)
    .reduce((sum, [slug]) => {
      const product = getProduct(slug);
      return sum + (product?.price ?? 0);
    }, 0);
}

/** Format bundle value as "$X,XXX" display string */
export function formatBundleValue(tierSlug: string): string {
  const cents = getBundleValueCents(tierSlug);
  return `$${Math.floor(cents / 100).toLocaleString()}`;
}

/** Get all IDD-eligible product slugs */
export function getIddEligibleProducts(): string[] {
  return Object.entries(PRODUCT_MATRIX)
    .filter(([, entry]) => entry.iddEligible)
    .map(([slug]) => slug);
}

/** Get scholarship count for a tier or playbook purchase */
export function getScholarshipCount(tierSlug: string): number {
  if (PLAYBOOK_SLUGS.has(tierSlug as TierSlug)) return 0; // Handled via half-credits
  return TIER_SCHOLARSHIP_MAP[tierSlug] ?? 0;
}

/** Check if a tier slug is a playbook (for half-credit tracking) */
export function isPlaybookPurchase(tierSlug: string): boolean {
  return PLAYBOOK_SLUGS.has(tierSlug as TierSlug);
}

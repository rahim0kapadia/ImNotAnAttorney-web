/**
 * @fileoverview Standalone Product Catalog — single source of truth.
 *
 * Parallels tiers.ts but for standalone products (calculators, research
 * reports, content guides) that exist OUTSIDE the tier upgrade ladder.
 *
 * These products have their own checkout flow, delivery mechanism, and
 * drip sequences. They do NOT participate in upgrade credit calculations.
 *
 * Prices are in CENTS (Stripe convention). 0 = free product.
 *
 * Add new products here. The checkout, webhook, and delivery systems
 * read from this catalog — no code changes needed per product.
 */

export type ProductCategory = "calculator" | "research" | "content";

export interface StandaloneProduct {
  name: string;
  category: ProductCategory;
  price: number; // cents — 0 for free
  priceDisplay: string;
  delivery: string; // "Instant" | "Under 60 seconds" | "24 hours"
  deliveryDetail: string;
  description: string; // one-line for meta/OG tags
  intakeFields: string[]; // required intake field names
  stripePriceId: string | null; // null for free products
  upsellTier: string | null; // tier slug for post-result upsell CTA
  upsellText: string | null;
  dripSequenceKey: string | null; // drip email sequence identifier
  isActive: boolean;
}

export const STANDALONE_PRODUCTS: Record<string, StandaloneProduct> = {
  // ─── CALCULATORS ($0 — free lead gen tools) ───────────────────
  "good-time": {
    name: "Good Time Credit Calculator",
    category: "calculator",
    price: 0,
    priceDisplay: "Free",
    delivery: "Instant",
    deliveryDetail:
      "Results calculated immediately based on your state's good time credit rules.",
    description:
      "Estimate your release date based on state-specific good time credit rules.",
    intakeFields: [
      "state",
      "chargeType",
      "sentenceMonths",
      "custodyCredits",
      "prisonType",
    ],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "Want a full analysis of your sentencing exposure and defense options?",
    dripSequenceKey: "calculator_good_time",
    isActive: true,
  },
  "sol-calculator": {
    name: "Statute of Limitations Calculator",
    category: "calculator",
    price: 0,
    priceDisplay: "Free",
    delivery: "Instant",
    deliveryDetail:
      "Results calculated immediately based on your state's statute of limitations.",
    description:
      "Check whether the statute of limitations has expired for your charge.",
    intakeFields: [
      "state",
      "chargeType",
      "offenseDate",
      "chargeDate",
      "tollingEvents",
    ],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "Want to know if a motion to dismiss is viable? The Case Decoder analyzes your full case.",
    dripSequenceKey: "calculator_sol",
    isActive: false,
  },
  "diversion-eligibility": {
    name: "Diversion Program Eligibility Checker",
    category: "calculator",
    price: 0,
    priceDisplay: "Free",
    delivery: "Instant",
    deliveryDetail:
      "Results based on your state's published diversion program criteria.",
    description:
      "Check if you may qualify for pretrial diversion, drug court, or alternative programs.",
    intakeFields: [
      "state",
      "county",
      "chargeType",
      "priorConvictions",
      "chargeCategory",
    ],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "Diversion eligibility is just one factor. The Case Decoder maps your full range of options.",
    dripSequenceKey: "calculator_diversion",
    isActive: false,
  },

  // ─── RESEARCH PRODUCTS ($97-$297 — instant generated reports) ─
  "employment-impact": {
    name: "Employment Impact Assessment",
    category: "research",
    price: 19700, // $197
    priceDisplay: "$197",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized report is generated within 60 seconds of submitting your details.",
    description:
      "Jurisdiction-specific analysis of how your charge affects employment, background checks, and career.",
    intakeFields: [
      "state",
      "chargeType",
      "occupation",
      "employerType",
      "industryRegulated",
      "hasClearance",
    ],
    stripePriceId: "price_employment_impact_live",
    upsellTier: "case-decoder",
    upsellText:
      "Your employment is one piece. The Case Decoder examines your full defense landscape.",
    dripSequenceKey: "research_employment",
    isActive: true,
  },
  "license-risk": {
    name: "Professional License Risk Research",
    category: "research",
    price: 29700, // $297
    priceDisplay: "$297",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized report is generated within 60 seconds of submitting your details.",
    description:
      "State licensing board rules, mandatory reporting triggers, and defense strategies for licensed professionals.",
    intakeFields: [
      "state",
      "chargeType",
      "licenseType",
      "licensingBoard",
      "priorDiscipline",
    ],
    stripePriceId: "price_license_risk_live",
    upsellTier: "case-decoder",
    upsellText:
      "Your license is at stake. The Case Decoder maps every defense angle for your specific case.",
    dripSequenceKey: "research_license",
    isActive: false,
  },
  "immigration-impact": {
    name: "Immigration Impact Research",
    category: "research",
    price: 29700, // $297
    priceDisplay: "$297",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized report is generated within 60 seconds of submitting your details.",
    description:
      "CIMT classification, aggravated felony analysis, and immigration consequence research for your charge.",
    intakeFields: [
      "state",
      "chargeType",
      "immigrationStatus",
      "yearsInUS",
      "hasGreenCard",
      "pendingPetition",
    ],
    stripePriceId: "price_immigration_impact_live",
    upsellTier: "case-decoder",
    upsellText:
      "Immigration consequences are just one dimension. The Case Decoder covers your complete defense landscape.",
    dripSequenceKey: "research_immigration",
    isActive: false,
  },
  "collateral-consequences": {
    name: "Collateral Consequences Research",
    category: "research",
    price: 14700, // $147
    priceDisplay: "$147",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized report is generated within 60 seconds of submitting your details.",
    description:
      "45,000+ documented collateral consequences analyzed for your specific charge and state.",
    intakeFields: [
      "state",
      "chargeType",
      "occupation",
      "hasLicense",
      "hasSecurityClearance",
      "immigrationStatus",
      "hasChildren",
    ],
    stripePriceId: "price_collateral_consequences_live",
    upsellTier: "case-decoder",
    upsellText:
      "Collateral consequences inform your defense strategy. The Case Decoder maps the full picture.",
    dripSequenceKey: "research_collateral",
    isActive: false,
  },
  "security-clearance": {
    name: "Security Clearance Impact Analysis",
    category: "research",
    price: 14700, // $147
    priceDisplay: "$147",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized report is generated within 60 seconds of submitting your details.",
    description:
      "How your charge affects security clearance status, adjudication guidelines, and reporting obligations.",
    intakeFields: [
      "state",
      "chargeType",
      "clearanceLevel",
      "agency",
      "lastInvestigation",
      "selfReported",
    ],
    stripePriceId: "price_security_clearance_live",
    upsellTier: "case-decoder",
    upsellText:
      "Your clearance is one factor. The Case Decoder examines your full defense position.",
    dripSequenceKey: "research_clearance",
    isActive: false,
  },
  "custody-impact": {
    name: "Custody Impact During Prosecution",
    category: "research",
    price: 19700, // $197
    priceDisplay: "$197",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized report is generated within 60 seconds of submitting your details.",
    description:
      "How your pending charge affects custody proceedings, visitation, and family court outcomes.",
    intakeFields: [
      "state",
      "chargeType",
      "custodyStatus",
      "pendingFamilyCase",
      "childrenAges",
      "otherParentAwareness",
    ],
    stripePriceId: "price_custody_impact_live",
    upsellTier: "case-decoder",
    upsellText:
      "Custody is intertwined with your criminal case. The Case Decoder maps all the intersections.",
    dripSequenceKey: "research_custody",
    isActive: false,
  },

  // ─── CONTENT GUIDES ($0 — free, SEO-driven lead magnets) ─────
  "first-court-appearance": {
    name: "First Court Appearance Preparation Guide",
    category: "content",
    price: 0,
    priceDisplay: "Free",
    delivery: "Instant",
    deliveryDetail: "Read immediately — no sign-up required.",
    description:
      "What to expect, what to say, and what NOT to say at your first court appearance.",
    intakeFields: [],
    stripePriceId: null,
    upsellTier: "dui-first-offense",
    upsellText: "Get charge-specific preparation with the Defense Playbook.",
    dripSequenceKey: null,
    isActive: true,
  },
  "family-action-plan": {
    name: "Post-Arrest Family Action Plan",
    category: "content",
    price: 0,
    priceDisplay: "Free",
    delivery: "Instant",
    deliveryDetail: "Read immediately — no sign-up required.",
    description:
      "Step-by-step guide for family members when a loved one is arrested.",
    intakeFields: [],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "Help your family member understand their case with the Case Decoder.",
    dripSequenceKey: null,
    isActive: false,
  },
  "arraignment-protocol": {
    name: "Arraignment Courtroom Protocol Guide",
    category: "content",
    price: 0,
    priceDisplay: "Free",
    delivery: "Instant",
    deliveryDetail: "Read immediately — no sign-up required.",
    description:
      "What happens at arraignment, how to enter a plea, and key questions to ask your attorney.",
    intakeFields: [],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "After arraignment, the real preparation begins. The Case Decoder maps your next steps.",
    dripSequenceKey: null,
    isActive: false,
  },
} as const satisfies Record<string, StandaloneProduct>;

export type ProductSlug = keyof typeof STANDALONE_PRODUCTS;

/** Type guard for valid standalone product slugs. */
export function isValidProduct(slug: string): slug is ProductSlug {
  return slug in STANDALONE_PRODUCTS;
}

/** Returns a product definition by slug, or undefined. */
export function getProduct(slug: string): StandaloneProduct | undefined {
  return (STANDALONE_PRODUCTS as Record<string, StandaloneProduct>)[slug];
}

/** Returns all active products in a given category. */
export function productsByCategory(
  category: ProductCategory
): (StandaloneProduct & { slug: string })[] {
  return Object.entries(STANDALONE_PRODUCTS)
    .filter(([, p]) => p.category === category && p.isActive)
    .map(([slug, p]) => ({ ...p, slug }));
}

/** Returns all active paid products (for checkout validation). */
export function paidProducts(): (StandaloneProduct & { slug: string })[] {
  return Object.entries(STANDALONE_PRODUCTS)
    .filter(([, p]) => p.price > 0 && p.isActive)
    .map(([slug, p]) => ({ ...p, slug }));
}

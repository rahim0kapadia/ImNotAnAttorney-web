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
      "boardNotified",
      "chargeInvolves",
    ],
    stripePriceId: "price_license_risk_live",
    upsellTier: "case-decoder",
    upsellText:
      "Your license is at stake. The Case Decoder maps every defense angle for your specific case.",
    dripSequenceKey: "research_license",
    isActive: true,
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
      "priorImmigrationViolations",
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
      "offenseClass",
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
    isActive: true,
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
      "chargeInvolves",
    ],
    stripePriceId: "price_security_clearance_live",
    upsellTier: "case-decoder",
    upsellText:
      "Your clearance is one factor. The Case Decoder examines your full defense position.",
    dripSequenceKey: "research_clearance",
    isActive: true,
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
      "chargeInvolves",
    ],
    stripePriceId: "price_custody_impact_live",
    upsellTier: "case-decoder",
    upsellText:
      "Custody is intertwined with your criminal case. The Case Decoder maps all the intersections.",
    dripSequenceKey: "research_custody",
    isActive: false,
  },

  // ─── COURT CASE PORT — WAVE 1 (isActive=false until operator review) ─────
  // Both ship with isActive=false. Landing page returns 404 until flipped.
  // Plans: docs/plans/2026-04-06-court-case-port/05-judge-intelligence.md
  //        docs/plans/2026-04-06-court-case-port/01-strategy-motion-architecture.md
  "judge-profile": {
    name: "Judge Profile",
    category: "research",
    price: 49700, // $497
    priceDisplay: "$497",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your judge profile is generated within 60 seconds of submitting your details.",
    description:
      "Judicial philosophy, ruling style, and persuasion patterns for the judge assigned to your case.",
    intakeFields: [
      "judgeName",
      "state",
      "county",
      "caseNumber",
      "chargeType",
    ],
    stripePriceId: "price_judge_profile_live",
    upsellTier: "x-ray",
    upsellText:
      "The Judge Profile is one piece of the picture. The X-Ray combines judge intelligence with full discovery analysis.",
    dripSequenceKey: "research_judge_profile",
    isActive: false,
  },
  "motion-opportunity-scan": {
    name: "Motion Opportunity Scan",
    category: "research",
    price: 49700, // $497
    priceDisplay: "$497",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your motion opportunity scan is generated within 60 seconds of submitting your details.",
    description:
      "10-20 motion opportunities filtered by your charge, jurisdiction, and case stage — with grant/deny/partial reasoning for each.",
    intakeFields: [
      "chargeType",
      "state",
      "county",
      "caseStage",
      "judgeName",
      "knownFacts",
    ],
    stripePriceId: "price_motion_opportunity_scan_live",
    upsellTier: "case-decoder",
    upsellText:
      "Knowing which motions apply is the first step. The Case Decoder maps the full defense landscape including evidentiary support.",
    dripSequenceKey: "research_motion_opportunity",
    isActive: false,
  },

  // ─── WAVE 1 — $97 Reddit-validated research products ─────────
  "breathalyzer-challenge": {
    name: "Breathalyzer Calibration Challenges",
    category: "research",
    price: 9700, // $97
    priceDisplay: "$97",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized report is generated within 60 seconds of submitting your details.",
    description:
      "Calibration gaps, operator errors, and machine-specific challenges for your breathalyzer result.",
    intakeFields: [
      "state",
      "chargeType",
      "bacReading",
      "breathalyzerType",
      "timeBetweenStopAndTest",
      "choiceOfTest",
      "medicalConditions",
    ],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "Challenge the breathalyzer. The Case Decoder maps your complete DUI defense.",
    dripSequenceKey: "research_breathalyzer",
    isActive: true,
  },
  "fst-review": {
    name: "Field Sobriety Test Accuracy Review",
    category: "research",
    price: 9700, // $97
    priceDisplay: "$97",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized report is generated within 60 seconds of submitting your details.",
    description:
      "NHTSA compliance gaps, environmental factors, and accuracy issues in your field sobriety tests.",
    intakeFields: [
      "state",
      "chargeType",
      "testsAdministered",
      "surfaceConditions",
      "weather",
      "footwear",
      "physicalConditions",
      "officerDemonstrated",
    ],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "FST issues are one piece. The Case Decoder analyzes your full DUI defense landscape.",
    dripSequenceKey: "research_fst",
    isActive: true,
  },
  "plea-consequences": {
    name: "Plea Deal Hidden Consequences",
    category: "research",
    price: 9700, // $97
    priceDisplay: "$97",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized report is generated within 60 seconds of submitting your details.",
    description:
      "Hidden employment, housing, licensing, and immigration consequences buried in your plea offer.",
    intakeFields: [
      "state",
      "chargeType",
      "pleaOfferCharge",
      "pleaOfferTerms",
      "occupation",
      "immigrationStatus",
      "hasLicense",
    ],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "A plea deal affects more than your sentence. The Case Decoder maps every downstream consequence.",
    dripSequenceKey: "research_plea",
    isActive: true,
  },
  "drug-test-reliability": {
    name: "Drug Test Reliability Research",
    category: "research",
    price: 9700, // $97
    priceDisplay: "$97",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized report is generated within 60 seconds of submitting your details.",
    description:
      "False positive rates, lab protocol gaps, and chain-of-custody issues for your drug test evidence.",
    intakeFields: [
      "state",
      "chargeType",
      "testType",
      "substanceIdentified",
      "confirmatoryTest",
      "resultsDocs",
    ],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "Drug test challenges are one angle. The Case Decoder examines your full defense position.",
    dripSequenceKey: "research_drug_test",
    isActive: true,
  },
  "bail-hearing-prep": {
    name: "Bail Hearing Preparation",
    category: "research",
    price: 9700, // $97
    priceDisplay: "$97",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized report is generated within 60 seconds of submitting your details.",
    description:
      "Jurisdiction-specific bail factors, argument frameworks, and preparation research for your hearing.",
    intakeFields: [
      "state",
      "chargeType",
      "priorConvictions",
      "communityTies",
      "flightRiskFactors",
      "currentBailAmount",
    ],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "Bail is the first battle. The Case Decoder maps the full defense ahead.",
    dripSequenceKey: "research_bail",
    isActive: true,
  },
  "sentencing-prep": {
    name: "Sentencing Hearing Preparation",
    category: "research",
    price: 9700, // $97
    priceDisplay: "$97",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized report is generated within 60 seconds of submitting your details.",
    description:
      "Sentencing guidelines, mitigation research, and preparation frameworks for your sentencing hearing.",
    intakeFields: [
      "state",
      "chargeType",
      "convictionMethod",
      "sentencingRange",
      "priorConvictions",
      "mitigatingFactors",
    ],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "Sentencing preparation starts with understanding the full picture. The Case Decoder delivers it.",
    dripSequenceKey: "research_sentencing",
    isActive: true,
  },
  "family-case-research": {
    name: "Family Member Case Research",
    category: "research",
    price: 9700, // $97
    priceDisplay: "$97",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized report is generated within 60 seconds of submitting your details.",
    description:
      "Case research and informed questions for family members supporting a loved one through criminal charges.",
    intakeFields: [
      "state",
      "chargeType",
      "relationshipToDefendant",
      "defendantInCustody",
      "defendantHasAttorney",
      "caseStage",
    ],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "Help your family member understand their case. The Case Decoder maps the full defense landscape.",
    dripSequenceKey: "research_family",
    isActive: true,
  },
  "arrest-report-review": {
    name: "Arrest Report Review",
    category: "research",
    price: 9700, // $97
    priceDisplay: "$97",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized report is generated within 60 seconds of submitting your details.",
    description:
      "Inconsistencies, procedural gaps, and questions your attorney should investigate in your arrest report.",
    intakeFields: [
      "state",
      "chargeType",
      "reportDetails",
    ],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "The arrest report is where cases are won and lost. The Case Decoder goes deeper.",
    dripSequenceKey: "research_arrest_report",
    isActive: true,
  },

  // ─── WAVE 3 — Post-conviction research (HIGH UPL, inactive) ──
  "expungement-research": {
    name: "Expungement Eligibility Research",
    category: "research",
    price: 9700, // $97
    priceDisplay: "$97",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized report is generated within 60 seconds of submitting your details.",
    description:
      "State-specific expungement eligibility rules, waiting periods, and procedural requirements for your record.",
    intakeFields: [
      "state",
      "chargeType",
      "convictionOrDismissal",
      "convictionDate",
      "sentenceCompleted",
      "priorConvictions",
      "probationCompleted",
    ],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "Expungement eligibility is the starting point. The Case Decoder maps the full path to clearing your record.",
    dripSequenceKey: "research_expungement",
    isActive: false,
  },
  "sentence-reduction": {
    name: "Sentence Reduction Petition Research",
    category: "research",
    price: 14700, // $147
    priceDisplay: "$147",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized report is generated within 60 seconds of submitting your details.",
    description:
      "Jurisdiction-specific sentence modification rules, eligible grounds, and petition research for your case.",
    intakeFields: [
      "state",
      "chargeType",
      "sentenceImposed",
      "sentencingDate",
      "basisForReduction",
    ],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "Sentence reduction research is step one. The Case Decoder covers the full post-conviction landscape.",
    dripSequenceKey: "research_sentence_reduction",
    isActive: false,
  },
  "appeal-viability": {
    name: "Appeal Viability Assessment",
    category: "research",
    price: 29700, // $297
    priceDisplay: "$297",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized report is generated within 60 seconds of submitting your details.",
    description:
      "Appellate grounds analysis, deadline research, and viability factors for challenging your conviction.",
    intakeFields: [
      "state",
      "chargeType",
      "convictionMethod",
      "appealGrounds",
      "appealDeadlineStatus",
      "trialIssues",
    ],
    stripePriceId: null,
    upsellTier: null,
    upsellText: null,
    dripSequenceKey: "research_appeal",
    isActive: false,
  },
  "ineffective-counsel": {
    name: "Ineffective Counsel Documentation",
    category: "research",
    price: 29700, // $297
    priceDisplay: "$297",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized report is generated within 60 seconds of submitting your details.",
    description:
      "Strickland standard research, performance gap documentation, and prejudice analysis for your IAC claim.",
    intakeFields: [
      "state",
      "chargeType",
      "issuesIdentified",
      "caseOutcome",
    ],
    stripePriceId: null,
    upsellTier: null,
    upsellText: null,
    dripSequenceKey: "research_ineffective_counsel",
    isActive: false,
  },

  // ─── WAVE 4 — Net-new from Reddit research ───────────────────
  "attorney-performance-review": {
    name: "Attorney Performance Review",
    category: "research",
    price: 9700, // $97
    priceDisplay: "$97",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized report is generated within 60 seconds of submitting your details.",
    description:
      "Benchmark your attorney's actions against what top defense attorneys do at your case stage.",
    intakeFields: [
      "state",
      "chargeType",
      "caseStage",
      "issuesIdentified",
      "communicationFrequency",
    ],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "Attorney performance is one signal. The Case Decoder maps your full defense position.",
    dripSequenceKey: "research_attorney_review",
    isActive: true,
  },
  "probation-violation-response": {
    name: "Probation Violation Response",
    category: "research",
    price: 9700, // $97
    priceDisplay: "$97",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized report is generated within 60 seconds of submitting your details.",
    description:
      "Violation categories, hearing procedures, and response research for your probation violation.",
    intakeFields: [
      "state",
      "chargeType",
      "violationType",
      "priorViolations",
      "probationConditions",
    ],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "A violation hearing has its own defense. The Case Decoder maps your options.",
    dripSequenceKey: "research_probation_violation",
    isActive: true,
  },
  "discovery-decoder": {
    name: "Discovery Decoder",
    category: "research",
    price: 14700, // $147
    priceDisplay: "$147",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized report is generated within 60 seconds of submitting your details.",
    description:
      "What your discovery packet means, what to look for, and what questions to bring to your attorney.",
    intakeFields: [
      "state",
      "chargeType",
      "discoveryReceived",
      "discoveryContents",
    ],
    stripePriceId: null,
    upsellTier: "intelligence-brief",
    upsellText:
      "Discovery is the raw material. The Intelligence Brief turns it into a defense roadmap.",
    dripSequenceKey: "research_discovery_decoder",
    isActive: true,
  },
  "constructive-possession": {
    name: "Constructive Possession Analysis",
    category: "research",
    price: 9700, // $97
    priceDisplay: "$97",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized report is generated within 60 seconds of submitting your details.",
    description:
      "Knowledge-and-dominion research, proximity analysis, and defense patterns for constructive possession charges.",
    intakeFields: [
      "state",
      "chargeType",
      "locationDescription",
      "proximityToContraband",
      "ownershipOfLocation",
    ],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "Possession challenges are one angle. The Case Decoder maps your complete drug defense.",
    dripSequenceKey: "research_constructive_possession",
    isActive: true,
  },
  "self-surrender-prep": {
    name: "Self-Surrender Preparation",
    category: "research",
    price: 9700, // $97
    priceDisplay: "$97",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized report is generated within 60 seconds of submitting your details.",
    description:
      "What to expect, what to bring, and how to prepare for self-surrender at your facility.",
    intakeFields: [
      "state",
      "chargeType",
      "surrenderDate",
      "surrenderLocation",
      "hasAttorney",
    ],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "Surrender is one step. The Case Decoder maps the defense that continues after you report.",
    dripSequenceKey: "research_self_surrender",
    isActive: true,
  },
  "probation-rights": {
    name: "Probation Rights Research",
    category: "research",
    price: 9700, // $97
    priceDisplay: "$97",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized report is generated within 60 seconds of submitting your details.",
    description:
      "Your jurisdiction-specific probation rights, condition limits, and what your PO can and cannot require.",
    intakeFields: [
      "state",
      "chargeType",
      "probationConditions",
      "probationOfficerIssue",
    ],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "Probation rights are one layer. The Case Decoder covers your full post-conviction position.",
    dripSequenceKey: "research_probation_rights",
    isActive: true,
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
    isActive: true,
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

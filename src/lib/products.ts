/**
 * @fileoverview Standalone Product Catalog, single source of truth.
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
 * read from this catalog, no code changes needed per product.
 */

export type ProductCategory = "calculator" | "research" | "content" | "bundle";

export interface StandaloneProduct {
  name: string;
  category: ProductCategory;
  price: number; // cents, 0 for free
  priceDisplay: string;
  delivery: string; // "Instant" | "Under 60 seconds" | "24 hours"
  deliveryDetail: string;
  description: string; // one-line for meta/OG tags
  intakeFields: string[]; // required intake field names
  stripePriceId: string | null; // null for free products
  upsellTier: string | null; // tier slug for post-result upsell CTA
  upsellText: string | null;
  isActive: boolean;
}

export const STANDALONE_PRODUCTS: Record<string, StandaloneProduct> = {
  // ─── CALCULATORS ($0, free lead gen tools) ───────────────────
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
    isActive: true,
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
    isActive: true,
  },

  "veterans-court": {
    name: "Veterans Court Eligibility Checker",
    category: "calculator",
    price: 0,
    priceDisplay: "Free",
    delivery: "Instant",
    deliveryDetail:
      "Results based on verified veterans treatment court data for your state and county.",
    description:
      "Check if a veterans treatment court is available in your county and whether you may meet published eligibility criteria.",
    intakeFields: [
      "state",
      "county",
      "branchOfService",
      "dischargeType",
      "serviceCondition",
      "chargeType",
      "priorConvictions",
    ],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "Veterans court is one path. The Case Decoder maps your full range of defense options.",
    isActive: true,
  },

  "sentencing-calculator": {
    name: "Federal Sentencing Data by Charge and District",
    category: "calculator",
    price: 0,
    priceDisplay: "Free",
    delivery: "Instant",
    deliveryDetail:
      "Pulled live from 595,851 federal sentencing records. USSC FY2001-2023.",
    description:
      "See what federal judges in your district actually sentenced for your charge. Median months. Departure rates. Sourced from 595,851 USSC records, FY2001-2023.",
    intakeFields: ["state", "chargeType"],
    stripePriceId: null,
    upsellTier: "judge-report-card",
    upsellText:
      "Aggregate medians don't tell you what to ask about your specific judge. The Judge Question Brief lists the questions your attorney should be able to answer for the judge on your case — drawn from their last ~500 cases, demographic sentencing splits, and ABA Standing Committee background. Delivered instantly. $197.",
    isActive: true,
  },
  "judge-comparison": {
    name: "Judge Comparison Tool",
    category: "calculator",
    price: 0,
    priceDisplay: "Free",
    delivery: "Instant",
    deliveryDetail:
      "Side-by-side judge comparison from federal sentencing data.",
    description:
      "Compare two federal judges side-by-side, sentencing patterns, departure rates, demographics, and defendant demographic data.",
    intakeFields: ["judgeNameA", "judgeNameB"],
    stripePriceId: null,
    upsellTier: "judge-report-card",
    upsellText:
      "Get the Judge Question Brief on your specific judge — the questions your attorney should be able to answer based on quotes, sentencing data, and accountability records.",
    isActive: true,
  },

  // ─── RESEARCH PRODUCTS ($97-$297, instant generated reports) ─
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
    isActive: true,
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
    isActive: true,
  },

  // ─── COURT CASE PORT, WAVE 1 (isActive=false until operator review) ─────
  // Both ship with isActive=false. Landing page returns 404 until flipped.
  // Plans: docs/plans/2026-04-06-court-case-port/05-judge-intelligence.md
  //        docs/plans/2026-04-06-court-case-port/01-strategy-motion-architecture.md
  // 2026-04-26: flipped false — Stripe price ID unverified, header says ships dark per Wave 1 review (audit P2).
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
    // 2026-04-26: stripePriceId nulled — placeholder string was unverified
    // in live mode. Restore real ID when Stripe live price is created.
    stripePriceId: null,
    upsellTier: "x-ray",
    upsellText:
      "The Judge Profile is one piece of the picture. The X-Ray combines judge intelligence with full discovery analysis.",
    isActive: false,
  },
  // 2026-04-26: flipped false — Stripe price ID unverified, header says ships dark per Wave 1 review (audit P2).
  "motion-opportunity-scan": {
    name: "Motion Opportunity Scan",
    category: "research",
    price: 49700, // $497
    priceDisplay: "$497",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your motion opportunity scan is generated within 60 seconds of submitting your details.",
    description:
      "10-20 motion opportunities filtered by your charge, jurisdiction, and case stage, with grant/deny/partial reasoning for each.",
    intakeFields: [
      "chargeType",
      "state",
      "county",
      "caseStage",
      "judgeName",
      "knownFacts",
    ],
    // 2026-04-26: stripePriceId nulled — placeholder string was unverified
    // in live mode. Restore real ID when Stripe live price is created.
    stripePriceId: null,
    // Upsell to IB ($997, 2x step). Motion opportunities are IB's defense-
    // strategy layer — the 10-20 motion shortlist feeds IB's prosecution
    // pattern analysis. Downgrade to Case Decoder ($197) lost $497 buyers
    // to a less expensive product — Hormozi cannibalization violation.
    upsellTier: "intelligence-brief",
    upsellText:
      "Knowing which motions apply is the first step. The Intelligence Brief inherits this motion shortlist AND adds full prosecution pattern analysis with 15-25 questions calibrated to your case. $997.",
    isActive: false,
  },

  // ─── WAVE 1, $97 Reddit-validated research products ─────────
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
    isActive: true,
  },

  // ─── WAVE 3, Post-conviction research (HIGH UPL, inactive) ──
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
    isActive: true,
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
    isActive: true,
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
    isActive: true,
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
    isActive: true,
  },

  // ─── WAVE 4, Net-new from Reddit research ───────────────────
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
    isActive: true,
  },

  // ─── COURT CASE PORT, WAVE 2+3 (isActive=false until operator review) ──
  // Wave 2 (Tier 2 Cross-Exam Library): trial-prep-package $1,997, requires War Room
  // Wave 2 (Tier 6 Case Law Enrichment): case-law-intelligence $297, IB-tier add-on
  // Wave 3 (Tier 7 Witness Research): expert-witness-challenge $297, Daubert-focused
  // Wave 3 (Tier 8B Misc High-Value): discovery-demand-letter $97, pre-discovery SKU
  // All ship dark. Three-layer gate: landing 404 + checkout 400 + operator review.
  // Plans:
  //   docs/plans/2026-04-06-court-case-port/02-cross-exam-library.md
  //   docs/plans/2026-04-06-court-case-port/06-case-law-enrichment.md
  //   docs/plans/2026-04-06-court-case-port/07-witness-research-pipeline.md
  //   docs/plans/2026-04-06-court-case-port/08-misc-high-value.md (§8B)
  "trial-prep-package": {
    name: "Trial Prep Package",
    category: "research",
    price: 199700, // $1,997
    priceDisplay: "$1,997",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your trial preparation package is generated within 60 seconds of submitting your details. Designed for War Room clients heading to trial, the legal research team assembles themes, voir dire intelligence, opening and closing frameworks, and a Judgment of Acquittal package.",
    description:
      "Trial preparation package for War Room clients heading to trial, themes, voir dire, opening and closing frameworks, and a JOA package built on elite trial methodology.",
    intakeFields: [
      "chargeType",
      "state",
      "county",
      "trialDate",
      "caseTheme",
      "knownFacts",
    ],
    stripePriceId: "price_trial_prep_package_live",
    // TODO: Create Stripe product in dashboard, price $1,997, add STRIPE_PRICE_TRIAL_PREP_PACKAGE_LIVE to env
    upsellTier: "situation-room",
    upsellText:
      "Trial Prep Package gives you the materials. The Situation Room layers in trial-week intelligence and priority response.",
    isActive: false,
  },
  "case-law-intelligence": {
    name: "Case Law Intelligence Pack",
    category: "research",
    price: 29700, // $297
    priceDisplay: "$297",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your case law intelligence pack is generated within 60 seconds of submitting your details, strategic classification, per-motion applicability, and ranked verification URLs.",
    description:
      "Strategic case law analysis for your charge and jurisdiction, Judgment of Acquittal opportunities, prosecution citation anticipation, per-motion applicability matrix, and ranked verification URLs your attorney can confirm in minutes.",
    intakeFields: [
      "chargeType",
      "state",
      "county",
      "caseStage",
      "motionFocus",
      "knownFacts",
    ],
    stripePriceId: "price_case_law_intelligence_live",
    // TODO: Create Stripe product in dashboard, price $297, add STRIPE_PRICE_CASE_LAW_INTELLIGENCE_LIVE to env
    upsellTier: "x-ray",
    upsellText:
      "The Case Law Intelligence Pack focuses on case law alone. The X-Ray layers it onto a full discovery analysis.",
    isActive: false,
  },
  "expert-witness-challenge": {
    name: "Expert Witness Challenge Report",
    category: "research",
    price: 29700, // $297
    priceDisplay: "$297",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your expert witness challenge report is generated within 60 seconds of submitting your details, Daubert factors, qualification gap analysis, and a defense brief outline.",
    description:
      "Daubert-focused challenge analysis for the prosecution's expert witness, testability, peer review, error rate, and qualification gaps assembled into a defense brief outline. No discovery upload required.",
    intakeFields: [
      "expertName",
      "state",
      "chargeType",
      "expertField",
      "knownFacts",
    ],
    stripePriceId: "price_expert_witness_challenge_live",
    // TODO: Create Stripe product in dashboard, price $297, add STRIPE_PRICE_EXPERT_WITNESS_CHALLENGE_LIVE to env
    upsellTier: "war-room",
    upsellText:
      "Challenging one expert is the start. The War Room covers every prosecution witness with full discipline records and prior testimony research.",
    isActive: false,
  },
  "discovery-demand-letter": {
    name: "Discovery Demand Letter",
    category: "research",
    price: 9700, // $97
    priceDisplay: "$97",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your discovery demand letter is generated within 60 seconds of submitting your details, a charge-specific letter your attorney can review, adapt, or file as-is.",
    description:
      "A custom discovery demand letter your attorney can file, listing the items prosecutors regularly withhold for your charge type and jurisdiction. No discovery required to order.",
    intakeFields: [
      "chargeType",
      "state",
      "county",
      "arrestDate",
      "discoveryReceivedSoFar",
    ],
    stripePriceId: "price_discovery_demand_letter_live",
    // TODO: Create Stripe product in dashboard, price $97, add STRIPE_PRICE_DISCOVERY_DEMAND_LETTER_LIVE to env
    upsellTier: "case-decoder",
    upsellText:
      "Knowing what to demand is step one. The Case Decoder helps you read the discovery once it arrives.",
    isActive: false,
  },

  // ─── CONTENT GUIDES ($0, free, SEO-driven lead magnets) ─────
  "first-court-appearance": {
    name: "First Court Appearance Preparation Guide",
    category: "content",
    price: 0,
    priceDisplay: "Free",
    delivery: "Instant",
    deliveryDetail: "Read immediately, no sign-up required.",
    description:
      "What to expect, what to say, and what NOT to say at your first court appearance.",
    intakeFields: [],
    stripePriceId: null,
    upsellTier: "dui-first-offense",
    upsellText: "Get charge-specific preparation with the Defense Playbook.",
    isActive: true,
  },
  "family-action-plan": {
    name: "Post-Arrest Family Action Plan",
    category: "content",
    price: 0,
    priceDisplay: "Free",
    delivery: "Instant",
    deliveryDetail: "Read immediately, no sign-up required.",
    description:
      "Step-by-step guide for family members when a loved one is arrested.",
    intakeFields: [],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "Help your family member understand their case with the Case Decoder.",
    isActive: true,
  },
  "arraignment-protocol": {
    name: "Arraignment Courtroom Protocol Guide",
    category: "content",
    price: 0,
    priceDisplay: "Free",
    delivery: "Instant",
    deliveryDetail: "Read immediately, no sign-up required.",
    description:
      "What happens at arraignment, how to enter a plea, and key questions to ask your attorney.",
    intakeFields: [],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "After arraignment, the real preparation begins. The Case Decoder maps your next steps.",
    isActive: true,
  },
  "courtroom-behavior": {
    name: "Courtroom Behavior Expectations",
    category: "content",
    price: 0,
    priceDisplay: "Free",
    delivery: "Instant",
    deliveryDetail: "Read immediately, no sign-up required.",
    description:
      "How to act, speak, and present yourself in court, from someone who learned the hard way.",
    intakeFields: [],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "Know the etiquette. The Case Decoder maps the defense strategy.",
    isActive: true,
  },
  "court-outfit": {
    name: "Court Date Outfit Guidance",
    category: "content",
    price: 0,
    priceDisplay: "Free",
    delivery: "Instant",
    deliveryDetail: "Read immediately, no sign-up required.",
    description:
      "What to wear and what NOT to wear to your court date, judges notice more than you think.",
    intakeFields: [],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "Look the part. The Case Decoder covers the substance of your defense.",
    isActive: true,
  },
  "jail-visitation": {
    name: "Jail Visitation Logistics",
    category: "content",
    price: 0,
    priceDisplay: "Free",
    delivery: "Instant",
    deliveryDetail: "Read immediately, no sign-up required.",
    description:
      "What to bring, what to expect, and how to find your facility's visitation rules.",
    intakeFields: [],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "Help them understand their case. The Case Decoder gives a clear picture of what they are facing.",
    isActive: true,
  },
  "character-reference-letter": {
    name: "Character Reference Letter Guidance",
    category: "content",
    price: 0,
    priceDisplay: "Free",
    delivery: "Instant",
    deliveryDetail: "Read immediately, no sign-up required.",
    description:
      "What judges look for in character reference letters, and a framework to write one that matters.",
    intakeFields: [],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "A strong letter helps. The Case Decoder maps the full defense strategy.",
    isActive: true,
  },
  "attorney-communication": {
    name: "Attorney Communication Templates",
    category: "content",
    price: 0,
    priceDisplay: "Free",
    delivery: "Instant",
    deliveryDetail: "Read immediately, no sign-up required.",
    description:
      "Email templates and a communication log for productive conversations with your defense attorney.",
    intakeFields: [],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "Communicate effectively. The Case Decoder gives your attorney the research they need.",
    isActive: true,
  },

  // ─── BUNDLES ($97-$197, combined reports at a discount) ────
  "first-72-hours": {
    name: "First 72 Hours Bundle",
    category: "bundle",
    price: 9700, // $97
    priceDisplay: "$97",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your combined report is generated within 60 seconds of submitting your details.",
    description:
      "Everything you need in the critical first 72 hours after arrest, arrest report review, bail hearing prep, and two free guides.",
    intakeFields: [
      "state",
      "chargeType",
      "reportDetails",
      "priorConvictions",
      "communityTies",
      "flightRiskFactors",
      "currentBailAmount",
    ],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "The first 72 hours are covered. The Case Decoder maps the full defense ahead.",
    isActive: true,
  },
  "defense-preparation": {
    name: "Defense Preparation Bundle",
    category: "bundle",
    price: 19700, // $197
    priceDisplay: "$197",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your combined report is generated within 60 seconds of submitting your details.",
    description:
      "Challenge every piece of evidence, breathalyzer, field sobriety, drug test, and arrest report in one combined analysis.",
    intakeFields: [
      "state",
      "chargeType",
      "bacReading",
      "breathalyzerType",
      "timeBetweenStopAndTest",
      "choiceOfTest",
      "medicalConditions",
      "testsAdministered",
      "surfaceConditions",
      "weather",
      "footwear",
      "physicalConditions",
      "officerDemonstrated",
      "testType",
      "substanceIdentified",
      "confirmatoryTest",
      "resultsDocs",
      "reportDetails",
    ],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "Evidence challenges are one angle. The Case Decoder maps the full DUI defense.",
    isActive: true,
  },
  "pre-plea-package": {
    name: "Pre-Plea Package",
    category: "bundle",
    price: 19700, // $197
    priceDisplay: "$197",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your combined report is generated within 60 seconds of submitting your details.",
    description:
      "Understand every consequence before you decide, plea terms, collateral impact, and sentencing landscape.",
    intakeFields: [
      "state",
      "chargeType",
      "pleaOfferCharge",
      "pleaOfferTerms",
      "occupation",
      "immigrationStatus",
      "hasLicense",
      "offenseClass",
      "hasSecurityClearance",
      "hasChildren",
      "convictionMethod",
      "sentencingRange",
      "priorConvictions",
      "mitigatingFactors",
    ],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "Know the full picture before you decide. The Case Decoder covers every angle.",
    isActive: true,
  },

  // ─── TIER 9 DATA-DRIVEN REPORTS ($97-$297) ──────────────────
  // Query pre-computed Tier 9 database tables (43K+ rows).
  // No Claude API call, pure data-driven reports from verified court records.
  // Also defined in tiers.ts for checkout validation; defined here for
  // getProduct() in intake/delivery/viewer flows.
  "judge-report-card": {
    // Display name: "Judge Question Brief" (renamed 2026-04-26).
    // Slug stays for SEO/Stripe/DB stability.
    name: "Judge Question Brief",
    category: "research",
    price: 19700, // $197
    priceDisplay: "$197",
    delivery: "Instant",
    deliveryDetail:
      "Your Judge Question Brief is generated on demand from verified court records within 60 seconds.",
    description:
      "Sentencing patterns, prosecutor pairing data, bench vs jury divergence, and quote library for your assigned judge.",
    intakeFields: ["judgeName", "state", "chargeType"],
    stripePriceId: null,
    // Upsell to IB ($997, 5x step). The Judge Question Brief covers ONE judge in
    // depth; the Intelligence Brief inherits that layer AND adds full
    // jurisdiction prosecution intel + accountability research. Lateral upsell
    // to Case Decoder ($197) was a Hormozi value-step violation — same price
    // tier means buyer perceives no Dream Outcome lift.
    upsellTier: "intelligence-brief",
    upsellText:
      "Your judge is one piece. The Intelligence Brief inherits your judge data and adds full jurisdiction prosecution patterns, accountability research, and 15-25 questions calibrated to your case. $997.",
    isActive: true,
  },
  "officer-background-check": {
    name: "Officer Background Check",
    category: "research",
    price: 9700, // $97
    priceDisplay: "$97",
    delivery: "Instant",
    deliveryDetail:
      "Your Officer Background Check is generated on demand from cross-case court records within 60 seconds.",
    description:
      "Cross-case officer reliability, credibility challenges, and discreditation history from verified court records.",
    intakeFields: ["officerName", "state", "agency", "badgeNumber"],
    stripePriceId: null,
    // Upsell to X-Ray ($2,497, 25x step). Officer reliability is the X-Ray
    // arrest-stage layer — cross-case officer history feeds the X-Ray
    // discovery analysis directly. Case Decoder ($197) does not use officer
    // intel; lateral upsell was a Hormozi value-step violation.
    upsellTier: "x-ray",
    upsellText:
      "Officer reliability is one angle. The X-Ray inherits this cross-case officer history AND adds full discovery analysis with 35-50 calibrated questions. $2,497.",
    isActive: true,
  },
  "similar-cases-analyzer": {
    name: "Similar Cases Analyzer",
    category: "research",
    price: 29700, // $297
    priceDisplay: "$297",
    delivery: "Instant",
    deliveryDetail:
      "Your Similar Cases Analyzer report is generated on demand from verified court records within 60 seconds.",
    description:
      "Similar case outcomes, sentencing distributions, plea discount data, and appellate trends for your charge and jurisdiction.",
    // Required: chargeType, state. Optional (used to match against USSC FY14-24
    // federal sentencing distribution when supplied): priorConvictions,
    // citizenship, ageBucket.
    intakeFields: ["chargeType", "state", "priorConvictions", "citizenship", "ageBucket", "district"],
    stripePriceId: null,
    // Upsell to X-Ray ($2,497, 8x step). Similar-cases data is X-Ray's
    // sentencing-outlier-flag layer — the cohort comparison feeds the X-Ray
    // discovery analysis. Downgrading $297 buyers to a $197 product was a
    // Hormozi cannibalization violation (negative value step).
    upsellTier: "x-ray",
    upsellText:
      "Similar cases set expectations. The X-Ray inherits this cohort intelligence AND adds full discovery analysis showing where YOU fit in the distribution. $2,497.",
    isActive: true,
  },
  "federal-sentencing-distribution": {
    name: "Federal Sentencing Distribution Report",
    category: "research",
    price: 29700, // $297
    priceDisplay: "$297",
    delivery: "Instant",
    deliveryDetail:
      "Your Federal Sentencing Distribution Report is generated on demand from 13,131 district-level buckets within 60 seconds.",
    description:
      "District-specific federal sentencing distribution — percentile ranges (p10/p25/p50/p75/p90), departure rates, Monte Carlo sentence simulation, and national comparison for your charge and criminal history category.",
    intakeFields: [
      "chargeType",
      "state",
      "district",
      "priorConvictions",
      "criminalHistoryCategory",
    ],
    stripePriceId: null,
    // Upsell to X-Ray ($2,497, 8x step). FSD's distribution feeds X-Ray's
    // sentencing-outlier flagging directly. Downgrade to Case Decoder
    // ($197) silently lost $297 buyers to a less expensive product —
    // a Hormozi cannibalization violation.
    upsellTier: "x-ray",
    upsellText:
      "A distribution tells you the range. The X-Ray inherits this district sentencing intelligence AND tells you where YOU fit inside it via full discovery analysis. $2,497.",
    isActive: true,
  },

  "motion-success-report": {
    name: "Motion Success Report",
    category: "research",
    price: 19700, // $197
    priceDisplay: "$197",
    delivery: "Instant",
    deliveryDetail:
      "Your Motion Success Report is generated on demand from verified court records within 60 seconds.",
    description:
      "Top-10 motion filings + grant rates for your charge type and federal circuit, optional judge-specific patterns, and top-10 granted-motion case citations every defendant should know.",
    intakeFields: ["chargeType", "state", "circuit", "judgeName"],
    stripePriceId: null,
    // Upsell to IB ($997, 5x step). Motion grant rates feed IB's defense
    // strategy layer alongside motion-opportunity-scan. Lateral upsell to
    // Case Decoder ($197 — same price tier) failed Hormozi value-step rule.
    upsellTier: "intelligence-brief",
    upsellText:
      "A motion map shows what gets granted. The Intelligence Brief inherits this circuit grant-rate data AND tells you which motions apply to YOUR case via full prosecution pattern analysis. $997.",
    // 2026-04-26: aligned to tiers.ts live flag (audit P2#12).
    isActive: false,
  },
  "district-court-intelligence": {
    // Slug retained for URL compatibility; upgraded 2026-04-23 from the
    // $97 test-mode "District Court Intelligence" SKU to the $147
    // "Courthouse Intelligence Pack". Aggregate-only; judge-specific
    // signals stay in the $197 Judge Question Brief. See
    // src/lib/tier9-reports/courthouse-intelligence.ts.
    name: "Courthouse Intelligence Pack",
    category: "research",
    price: 14700, // $147
    priceDisplay: "$147",
    delivery: "Instant",
    deliveryDetail:
      "Your Courthouse Intelligence Pack is generated on demand from indexed federal criminal dockets and USSC sentencing datafiles within 60 seconds.",
    description:
      "Courthouse-level intelligence: judges and caseload volume in your district, circuit motion grant rates (appellate-direction), and USSC district sentencing aggregates (FY14-23). Aggregate-only — not a prediction.",
    intakeFields: ["state", "courthouse"],
    stripePriceId: null,
    upsellTier: "judge-report-card",
    upsellText:
      "The courthouse sets the context. A Judge Question Brief shows the patterns questions you should be asking about YOUR specific judge.",
    // 2026-04-26: aligned to tiers.ts live flag (audit P2#12).
    isActive: false,
  },
  "charge-authority-pack": {
    name: "Charge Authority Pack",
    category: "research",
    price: 9700, // $97
    priceDisplay: "$97",
    delivery: "Instant",
    deliveryDetail:
      "Your Charge Authority Pack is generated on demand from verified court records within 60 seconds.",
    description:
      "Top 10 must-cite defense authorities for your charge type — case name, citation, authority tier, pre-extracted canonical quote, and 3-year citation velocity. Every row links to the primary opinion on CourtListener for independent verification.",
    // Required: chargeType. Optional: state + circuit (display context — the
    // authority list itself is national precedent, not circuit-filtered).
    intakeFields: ["chargeType", "state", "circuit"],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "Authorities tell you what to cite. The Case Decoder maps how to apply those precedents to your specific facts.",
    // 2026-04-26: aligned to tiers.ts live flag (audit P2#12).
    isActive: false,
  },
  "arrest-survival-kit": {
    name: "Arrest Survival Kit",
    category: "research",
    price: 4700, // $47
    priceDisplay: "$47",
    delivery: "Instant",
    deliveryDetail:
      "Your Arrest Survival Kit is generated on demand within 60 seconds of purchase.",
    description:
      "Your rights during arrest, agency incident data, and critical first-48-hours action plan for your jurisdiction.",
    intakeFields: ["state"],
    stripePriceId: null,
    upsellTier: "officer-background-check",
    upsellText:
      "Know your rights, then know your arresting officer's track record.",
    // 2026-04-26: flipped false — agency_incidents table missing in prod (audit P0#1). Restore when ingestion lands.
    isActive: false,
  },
  "federal-jury-instruction-brief": {
    name: "Federal Jury Instruction Brief",
    category: "research",
    price: 9700, // $97
    priceDisplay: "$97",
    delivery: "Instant",
    deliveryDetail:
      "Your Federal Jury Instruction Brief is generated on demand from 1,808 verified pattern instructions within 60 seconds.",
    description:
      "The pattern jury instruction your federal trial judge is likely to read — verbatim — plus burden-of-proof callouts, top-5 historical attack authorities, and alternative circuit variants. Federal charges only.",
    // Required: federalCharge, circuit. Optional: state (display context /
    // circuit cascade).
    intakeFields: ["federalCharge", "circuit", "state"],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "Pattern instructions set the legal floor. The Case Decoder maps how to attack them with your specific facts.",
    // 2026-04-26: aligned to tiers.ts live flag (audit P2#12).
    isActive: false,
  },
  "precedent-watchlist": {
    name: "Precedent Watchlist",
    category: "research",
    price: 4700, // $47 — crisis-buyer-floor entry SKU (Hormozi entry-tier wedge)
    priceDisplay: "$47",
    delivery: "Instant + 30-day email drip",
    deliveryDetail:
      "Your Precedent Watchlist is generated instantly from 1.13M citation-velocity rows, and for the next 30 days you'll receive up to 4 weekly updates when the rising-precedent ranks shift for your charge type.",
    description:
      "Top 10 fastest-rising and top 5 fastest-fading criminal-defense precedents for your charge type. Arrow-glyph velocity deltas over the last 24 months, every row linked to CourtListener, plus 4 weekly email updates over 30 days.",
    // Required: chargeType. Optional: state (labels the header; citation
    // velocity is not circuit-partitioned in the derivation pipeline).
    intakeFields: ["chargeType", "state"],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "Citation velocity tells you which precedents are trending. The Case Decoder maps your specific defense strategy around them.",
    isActive: false, // awaiting E2E + cron registration verification (live:false on tiers.ts)
  },

  // ─── PRIORITY B, Critical 7 Worker Standalone Products ─────
  "plea-analyzer": {
    name: "Plea Deal Analyzer",
    category: "research",
    price: 9700, // $97
    priceDisplay: "$97",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized plea analysis is generated within 60 seconds of submitting your details.",
    description:
      "Compare your plea offer against sentencing guidelines, map leverage from your case, and surface hidden consequences.",
    intakeFields: [
      "state",
      "chargeType",
      "pleaOfferDetails",
      "originalCharges",
      "offeredCharges",
      "sentencingExposure",
    ],
    stripePriceId: null,
    upsellTier: "case-decoder",
    upsellText:
      "A plea deal affects every aspect of your case. The Case Decoder maps the full defense landscape.",
    isActive: false,
  },
  "ach-matrix": {
    name: "Case Hypothesis Matrix",
    category: "research",
    price: 14700, // $147
    priceDisplay: "$147",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized hypothesis analysis is generated within 60 seconds of submitting your details.",
    description:
      "Every plausible explanation for the evidence, including the prosecution's strongest theory, scored and ranked.",
    intakeFields: [
      "state",
      "chargeType",
      "knownEvidence",
      "alternativeExplanations",
      "knownFacts",
    ],
    stripePriceId: null,
    upsellTier: "intelligence-brief",
    upsellText:
      "Hypothesis testing is one layer. The Intelligence Brief adds prosecution pattern analysis and full case intelligence.",
    isActive: false,
  },
  "adversarial-prosecution-sim": {
    name: "Adversarial Prosecution Simulation",
    category: "research",
    price: 19700, // $197
    priceDisplay: "$197",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized prosecution simulation is generated within 60 seconds of submitting your details.",
    description:
      "Multi-round simulation of how the prosecution will attack each defense strategy, before your attorney tries it in court.",
    intakeFields: [
      "state",
      "chargeType",
      "defenseStrategy",
      "prosecutionTheory",
      "knownFacts",
    ],
    stripePriceId: null,
    upsellTier: "war-room",
    upsellText:
      "Stress-testing one strategy is the start. The War Room runs adversarial simulation against your full defense.",
    isActive: false,
  },
  "sentencing-intelligence": {
    name: "Sentencing Intelligence Report",
    category: "research",
    price: 29700, // $297
    priceDisplay: "$297",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized sentencing analysis is generated within 60 seconds of submitting your details.",
    description:
      "Judge-specific sentencing patterns, guideline analysis, departure opportunities, and plea-vs-trial comparison for your charge.",
    intakeFields: [
      "state",
      "chargeType",
      "judgeName",
      "county",
      "priorConvictions",
      "currentSentencingRange",
    ],
    stripePriceId: null,
    upsellTier: "intelligence-brief",
    upsellText:
      "Sentencing intelligence is one dimension. The Intelligence Brief combines it with full prosecution pattern analysis.",
    isActive: false,
  },
  "daubert-challenge": {
    name: "Daubert Expert Challenge Analysis",
    category: "research",
    price: 29700, // $297
    priceDisplay: "$297",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your personalized Daubert analysis is generated within 60 seconds of submitting your details.",
    description:
      "Systematic Daubert factor analysis of the prosecution's expert witness, methodology, qualifications, and challenge opportunities.",
    intakeFields: [
      "state",
      "chargeType",
      "expertName",
      "expertField",
      "expertMethodology",
    ],
    stripePriceId: null,
    upsellTier: "war-room",
    upsellText:
      "Challenging one expert is the start. The War Room systematically analyzes every prosecution witness.",
    isActive: false,
  },
  "body-camera-analysis": {
    name: "Body Camera Analysis Report",
    category: "research",
    price: 39700, // $397
    priceDisplay: "$397",
    delivery: "Under 60 seconds",
    deliveryDetail:
      "Your analysis report is generated within 60 seconds of submitting your details.",
    description:
      "Legal analysis framework for body camera footage, Miranda compliance, procedural issues, and defense-relevant moments.",
    intakeFields: [
      "state",
      "chargeType",
      "mediaType",
      "incidentDescription",
      "defenseTheory",
    ],
    stripePriceId: null,
    upsellTier: "x-ray",
    upsellText:
      "Body camera issues are one piece of the evidence picture. The X-Ray analyzes your full discovery.",
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

/**
 * Checkout Page (/checkout?tier=<slug>)
 *
 * Single-tier checkout page that displays detailed tier information and collects
 * email before redirecting to Stripe hosted checkout. This is the critical
 * conversion page — every paid customer passes through here.
 *
 * User journey position:
 *   /services or / (pricing CTA) -> THIS PAGE -> Stripe checkout -> /checkout/success
 *   Exception: Situation Room redirects to /intake?interest=situation-room (application gate)
 *
 * Query parameter:
 *   ?tier= case-decoder | intelligence-brief | x-ray | war-room | situation-room
 *         | extra-witness | witness-pack
 *
 * Page structure:
 *   1. Tier card — Name, price, delivery timeline, validation copy
 *   2. "Why This Works" — Attorney methodology proof specific to each tier
 *   3. Attorney pullquote — Named quote for credibility
 *   4. Feature list — Checkmarked deliverables for the selected tier
 *   5. Sample report link — Proof of deliverable quality
 *   6. Prerequisite notices — War Room requirement (Situation Room only)
 *   7. Discovery notice — For tiers requiring discovery upload after payment
 *   8. Guarantee card — Delivery + satisfaction guarantee
 *   9. Upgrade nudge — "Also available" card showing next tier with upgrade cost
 *  10. Email capture — Required field, enables cart abandonment recovery
 *  11. Court date input — Optional, triggers urgency nudge if <14 days away
 *  12. Priority delivery checkbox — Add-on upsell with dynamic pricing
 *  13. Consent checkbox — Required for $2,497+ tiers (custom research acknowledgment)
 *  14. CTA button — Dynamic label showing total price (base + priority if selected)
 *  15. Upgrade credits reminder — Below the card
 *
 * Business logic:
 *   - Email is captured BEFORE Stripe redirect for abandonment recovery
 *   - Court date <14 days auto-highlights priority delivery checkbox
 *   - Consent gate for $2,497+ tiers (priceNum >= 2497) blocks checkout until checked
 *   - Situation Room tier redirects to intake form instead of Stripe (application flow)
 *   - Priority delivery add-on adds to base price dynamically
 *   - handleCheckout() POSTs to /api/checkout which creates a Stripe session
 *
 * Wrapped in Suspense because useSearchParams requires client-side rendering.
 */
"use client";

import { TIER_CORE, tierPriceNum, upgradePrice, upgradeCostBetween, type TierSlug } from "@/lib/tiers";
import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import Link from "next/link";
import { TrustBadges } from "@/components/TrustBadges";

/**
 * TierInfo shape for the TIER_INFO lookup table.
 * Each tier defines its pricing, features, guarantee copy, priority delivery
 * options, and an optional nudge to the next tier up.
 */
type TierInfo = {
  name: string;
  price: string;
  priceNum: number;
  delivery: string;
  requiresDiscovery: boolean;
  requiresWarRoom?: boolean;
  isDigitalProduct?: boolean;
  features: string[];
  guarantee: string;
  validation?: string;
  whyThisWorks?: string;
  pullquote?: { quote: string; author: string };
  priorityPrice?: string | null;
  priorityDesc?: string | null;
  priorityPriceNum?: number;
  story?: string;
  nudge?: {
    nextTierSlug: string;
    nextTierName: string;
    nextTierPrice: string;
    upgradeCost: string;
    unlocks: string;
    bestFor: string;
  };
};

/**
 * Complete tier configuration for all purchasable products.
 * Each tier includes:
 *   - pricing (display price + numeric for consent gate logic)
 *   - features list (rendered as checkmark items)
 *   - guarantee copy (tier-specific)
 *   - validation copy (reassurance at top of card)
 *   - whyThisWorks (attorney methodology proof)
 *   - pullquote (named attorney quote)
 *   - priorityPrice/Desc (add-on upsell for expedited delivery)
 *   - nudge (next tier up with upgrade cost calculation)
 *
 * The nudge.upgradeCost accounts for 100% upgrade credit policy.
 * Example: Case Decoder ($197) -> Intelligence Brief ($997) = $800 upgrade.
 */
/** Extracts derivable fields from TIER_CORE for use in TIER_INFO. */
function coreTier(slug: TierSlug) {
  const t = TIER_CORE[slug];
  return {
    name: t.name,
    price: t.priceDisplay,
    priceNum: t.price / 100,
    delivery: t.delivery,
    requiresDiscovery: t.requiresDiscovery,
    requiresWarRoom: t.requiresWarRoom,
    isDigitalProduct: t.isDigitalProduct,
    priorityPrice: t.priorityPrice ? `$${t.priorityPrice / 100}` : null,
    priorityPriceNum: t.priorityPrice ? t.priorityPrice / 100 : undefined,
    priorityDesc: t.priorityDelivery ?? null,
  };
}

const TIER_INFO: Record<string, TierInfo> = {
  "dui-first-offense": {
    ...coreTier("dui-first-offense"),
    features: [
      "Charge Reality Report — DUI first offense explained in plain English",
      "26 Questions Your DUI Attorney Hopes You Never Ask (6-part format)",
      "DUI Case Stage Roadmap — arrest through resolution timeline",
      "Red Flag Checklist — 12 evidence and procedural red flags",
      "Case Progress Scorecard — rate your attorney on 10 behaviors",
    ],
    guarantee:
      "5 questions you never thought to ask, or full refund. No explanation required.",
    story: "One of our founders was told 'the BAC is too high to fight.' We pulled the breathalyzer calibration records — the device was 19 days past its maintenance window. That's the kind of question we hand you.",
    validation:
      "Instant PDF. No intake form, no wait. Downloaded by DUI defendants within 60 seconds of purchase.",
    whyThisWorks:
      "Built from documented defense strategies used by elite DUI defense attorneys, forensic evidence methodology, and NHTSA field sobriety test standards. 26 specific questions derived from 40+ elite DUI defense attorneys' techniques.",
    pullquote: {
      quote:
        "The breathalyzer reading is not the case. The maintenance records are.",
      author: "DUI Forensic Defense Methodology",
    },
    nudge: {
      nextTierSlug: "case-decoder",
      nextTierName: TIER_CORE["case-decoder"].name,
      nextTierPrice: TIER_CORE["case-decoder"].priceDisplay,
      upgradeCost: upgradeCostBetween("dui-first-offense", "case-decoder"),
      unlocks:
        "15 case-specific questions built from YOUR charges, YOUR state, YOUR stage. Plus email templates, phone scripts, and a 7-day action plan.",
      bestFor:
        "Worth it when you want questions tailored to your exact situation — not generic DUI questions.",
    },
  },
  "drug-possession": {
    ...coreTier("drug-possession"),
    features: [
      "Charge Reality Report — drug possession explained in plain English",
      "26 Questions Your Drug Defense Attorney Hopes You Never Ask (6-part format)",
      "Drug Case Stage Roadmap — arrest through resolution timeline",
      "Red Flag Checklist — 12 evidence and procedural red flags",
      "Case Progress Scorecard — rate your attorney on 10 behaviors",
    ],
    guarantee:
      "5 questions you never thought to ask, or full refund. No explanation required.",
    story: "In one real case, police weighed 93.9 grams at the scene. The lab confirmed 25.59 grams — a 73% discrepancy. The attorney never flagged it. That's the kind of question we hand you.",
    validation:
      "Instant PDF. No intake form, no wait. Downloaded by defendants within 60 seconds of purchase.",
    whyThisWorks:
      "Built from documented defense strategies used by elite drug defense attorneys, lab analysis challenge methodology, and search & seizure protocols. 26 specific questions derived from 40+ elite defense attorneys' techniques.",
    pullquote: {
      quote:
        "The lab report is only as reliable as the chain of custody that produced it.",
      author: "Drug Defense Research Methodology",
    },
    nudge: {
      nextTierSlug: "case-decoder",
      nextTierName: TIER_CORE["case-decoder"].name,
      nextTierPrice: TIER_CORE["case-decoder"].priceDisplay,
      upgradeCost: upgradeCostBetween("drug-possession", "case-decoder"),
      unlocks:
        "15 case-specific questions built from YOUR charges, YOUR state, YOUR stage. Plus email templates, phone scripts, and a 7-day action plan.",
      bestFor:
        "Worth it when you want questions tailored to your exact situation — not generic drug possession questions.",
    },
  },
  "probation-violation": {
    ...coreTier("probation-violation"),
    features: [
      "Probation Violation Reality Report — technical vs. substantive violations explained in plain English",
      "26 Questions Your Probation Violation Attorney Hopes You Never Ask (6-part format)",
      "Revocation Hearing Roadmap — alleged violation through disposition timeline",
      "Red Flag Checklist — 12 procedural and evidence red flags",
      "Case Progress Scorecard — rate your attorney on 10 behaviors",
    ],
    guarantee:
      "5 questions you never thought to ask, or full refund. No explanation required.",
    story: "A violation report listed a missed appointment — but the probation officer had confirmed attendance by text message three days earlier. The attorney hadn't requested the PO's communication logs. That's the kind of question we hand you.",
    validation:
      "Instant PDF. No intake form, no wait. Downloaded by defendants within 60 seconds of purchase.",
    whyThisWorks:
      "Built from landmark case law (Bearden v. Georgia, Gagnon v. Scarpelli) and elite defense methodology. 26 specific questions covering willfulness defenses, alternatives to revocation, and due process rights.",
    pullquote: {
      quote:
        "You cannot be revoked for inability to comply. That's the law.",
      author: "Probation Violation Defense Methodology",
    },
    nudge: {
      nextTierSlug: "case-decoder",
      nextTierName: TIER_CORE["case-decoder"].name,
      nextTierPrice: TIER_CORE["case-decoder"].priceDisplay,
      upgradeCost: upgradeCostBetween("probation-violation", "case-decoder"),
      unlocks:
        "15 case-specific questions built from YOUR charges, YOUR state, YOUR stage. Plus email templates, phone scripts, and a 7-day action plan.",
      bestFor:
        "Worth it when you want questions tailored to your exact violation and hearing — not generic questions.",
    },
  },
  "white-collar": {
    ...coreTier("white-collar"),
    features: [
      "Charge Reality Report — white collar offenses explained in plain English",
      "26 Questions Your White Collar Attorney Hopes You Never Ask (6-part format)",
      "Federal Case Stage Roadmap — pre-indictment through post-conviction timeline",
      "Red Flag Checklist — 12 evidence and procedural red flags",
      "Case Progress Scorecard — rate your attorney on 10 behaviors",
    ],
    guarantee:
      "5 questions you never thought to ask, or full refund. No explanation required.",
    story: "Three transactions in the indictment pre-dated the business relationship the government claimed created fraudulent intent. The timeline was wrong — and the attorney had never mapped it. That's the kind of question we hand you.",
    validation:
      "Instant PDF. No intake form, no wait. Downloaded by defendants within 60 seconds of purchase.",
    whyThisWorks:
      "Built from documented defense strategies used by elite white collar defense attorneys, including loss calculation challenge methodology, asset forfeiture defense, and federal sentencing guidelines analysis. 26 specific questions derived from 40+ elite defense attorneys' techniques.",
    pullquote: {
      quote:
        "The loss amount is not the sentence. Challenge the math.",
      author: "White Collar Defense Methodology",
    },
    nudge: {
      nextTierSlug: "case-decoder",
      nextTierName: TIER_CORE["case-decoder"].name,
      nextTierPrice: TIER_CORE["case-decoder"].priceDisplay,
      upgradeCost: upgradeCostBetween("white-collar", "case-decoder"),
      unlocks:
        "15 case-specific questions built from YOUR charges, YOUR state, YOUR stage. Plus email templates, phone scripts, and a 7-day action plan.",
      bestFor:
        "Worth it when you want questions tailored to your exact situation — not generic white collar questions.",
    },
  },
  "sex-offense": {
    ...coreTier("sex-offense"),
    features: [
      "Charge Reality Report — sex offense elements explained in plain English",
      "26 Questions Your Sex Offense Attorney Hopes You Never Ask (6-part format)",
      "Sex Offense Case Stage Roadmap — accusation through post-conviction timeline",
      "Red Flag Checklist — 12 forensic and procedural red flags",
      "Case Progress Scorecard — rate your attorney on 10 behaviors",
    ],
    guarantee:
      "5 questions you never thought to ask, or full refund. No explanation required.",
    story: "Accusation details contradicted each other across two witness statements — dates, locations, and sequence of events didn't match. The attorney never compared them. That's the kind of question we hand you.",
    validation:
      "Instant PDF. No intake form, no wait. Downloaded by defendants within 60 seconds of purchase.",
    whyThisWorks:
      "Built from documented defense strategies used by elite sex offense defense attorneys, including forensic interview analysis, DNA and digital evidence challenge methodology, and full consequence mapping (registration tiers, residency restrictions, collateral consequences). 26 specific questions derived from 40+ elite defense attorneys' techniques.",
    pullquote: {
      quote:
        "The accusation is not the conviction. Challenge the evidence.",
      author: "Sex Offense Defense Methodology",
    },
    nudge: {
      nextTierSlug: "case-decoder",
      nextTierName: TIER_CORE["case-decoder"].name,
      nextTierPrice: TIER_CORE["case-decoder"].priceDisplay,
      upgradeCost: upgradeCostBetween("sex-offense", "case-decoder"),
      unlocks:
        "15 case-specific questions built from YOUR charges, YOUR state, YOUR stage. Plus email templates, phone scripts, and a 7-day action plan.",
      bestFor:
        "Worth it when you want questions tailored to your exact situation — not generic questions.",
    },
  },
  "federal-criminal": {
    ...coreTier("federal-criminal"),
    features: [
      "Federal System Reality Report — how federal court actually works, explained in plain English",
      "26 Questions Your Federal Attorney Hopes You Never Ask (6-part format)",
      "Federal Case Stage Roadmap — target letter through post-conviction, 13 stages",
      "Red Flag Checklist — 12 guideline and procedural red flags",
      "Case Progress Scorecard — rate your attorney on 10 behaviors",
    ],
    guarantee:
      "5 questions you never thought to ask, or full refund. No explanation required.",
    story: "A defendant received a target letter for wire fraud. We mapped the transaction dates against the contract records — three pre-dated the alleged scheme. The attorney had never checked. That's the kind of question we hand you.",
    validation:
      "Instant PDF. No intake form, no wait. Downloaded by defendants within 60 seconds of purchase.",
    whyThisWorks:
      "Built from documented defense strategies used by elite federal criminal defense attorneys, including sentencing guidelines analysis, government evidence verification, and federal consequence mapping (BOP designation, RDAP eligibility, First Step Act credits). 26 specific questions derived from 40+ elite defense attorneys' techniques.",
    pullquote: {
      quote:
        "The sentencing guidelines are a formula. Challenge every variable.",
      author: "Federal Criminal Defense Methodology",
    },
    nudge: {
      nextTierSlug: "case-decoder",
      nextTierName: TIER_CORE["case-decoder"].name,
      nextTierPrice: TIER_CORE["case-decoder"].priceDisplay,
      upgradeCost: upgradeCostBetween("federal-criminal", "case-decoder"),
      unlocks:
        "15 case-specific questions built from YOUR charges, YOUR state, YOUR stage. Plus email templates, phone scripts, and a 7-day action plan.",
      bestFor:
        "Worth it when you want questions tailored to your exact federal case — not generic questions.",
    },
  },
  "drug-trafficking": {
    ...coreTier("drug-trafficking"),
    features: [
      "Trafficking Charge Reality Report — mandatory minimums, conspiracy liability, and quantity tables explained in plain English",
      "26 Questions Your Drug Trafficking Attorney Hopes You Never Ask (6-part format)",
      "Drug Trafficking Case Stage Roadmap — arrest through post-conviction, 12 stages",
      "Red Flag Checklist — 12 quantity, informant, and procedural red flags",
      "Case Progress Scorecard — rate your attorney on 10 behaviors",
    ],
    guarantee:
      "5 questions you never thought to ask, or full refund. No explanation required.",
    story: "A CI phone number was attributed to both the informant and the defendant in the same report. The attorney never questioned it. That's the kind of question we hand you.",
    validation:
      "Instant PDF. No intake form, no wait. Downloaded by defendants within 60 seconds of purchase.",
    whyThisWorks:
      "Built from documented defense strategies used by elite drug trafficking defense attorneys, including informant credibility analysis, drug quantity verification methodology, and conspiracy exposure mapping. 26 specific questions derived from 40+ elite defense attorneys' techniques.",
    pullquote: {
      quote:
        "The informant has a deal. Do you know yours?",
      author: "Drug Trafficking Defense Methodology",
    },
    nudge: {
      nextTierSlug: "case-decoder",
      nextTierName: TIER_CORE["case-decoder"].name,
      nextTierPrice: TIER_CORE["case-decoder"].priceDisplay,
      upgradeCost: upgradeCostBetween("drug-trafficking", "case-decoder"),
      unlocks:
        "15 case-specific questions built from YOUR charges, YOUR state, YOUR stage. Plus email templates, phone scripts, and a 7-day action plan.",
      bestFor:
        "Worth it when you want questions tailored to your exact trafficking case — not generic questions.",
    },
  },
  "self-defense": {
    ...coreTier("self-defense"),
    features: [
      "Charge Reality Report — self-defense elements and justifiable force explained in plain English",
      "26 Questions Your Self-Defense Attorney Hopes You Never Ask (6-part format)",
      "11-Stage Case Roadmap — incident through immunity hearing, trial, and appeal",
      "Red Flag Checklist — 12 evidence, expert, and procedural red flags",
      "Case Progress Scorecard — rate your attorney on 10 behaviors",
    ],
    guarantee:
      "5 questions you never thought to ask, or full refund. No explanation required.",
    story: "Two witness statements contradicted each other on who initiated physical contact — one said the defendant, the other said the complainant. The attorney never compared them side by side. That's the kind of question we hand you.",
    validation:
      "Instant PDF. No intake form, no wait. Downloaded by defendants within 60 seconds of purchase.",
    whyThisWorks:
      "Built from the nationally recognized five-element self-defense framework, use-of-force analysis methodology, and Stand Your Ground litigation strategy. 26 specific questions covering innocence, imminence, proportionality, avoidance, and reasonableness.",
    pullquote: {
      quote:
        "You defended yourself. Now defend your freedom.",
      author: "Self-Defense / Justifiable Force Methodology",
    },
    nudge: {
      nextTierSlug: "case-decoder",
      nextTierName: TIER_CORE["case-decoder"].name,
      nextTierPrice: TIER_CORE["case-decoder"].priceDisplay,
      upgradeCost: upgradeCostBetween("self-defense", "case-decoder"),
      unlocks:
        "15 case-specific questions built from YOUR charges, YOUR state, YOUR stage. Plus email templates, phone scripts, and a 7-day action plan.",
      bestFor:
        "Worth it when you want questions tailored to your exact self-defense case — not generic questions.",
    },
  },
  "case-decoder": {
    ...coreTier("case-decoder"),
    features: [
      "Plain-English charge breakdown with elements the prosecution must prove",
      "15 calibrated questions for your attorney (6-part format with follow-up probes)",
      "Ready-to-send email template + phone script + follow-up template",
      "Your Advocacy Steps — 8-step communication playbook",
      "Where Things Stand — 4-area diagnostic of what you know vs. what to ask about",
      "Your Next 7 Days — one action per day, with Meeting Ready Sheet to print and bring",
      "Expert methodology from elite defense attorneys (3 per charge type)",
      "Included: When the Conversation Gets Difficult — scripts for 4 common scenarios",
    ],
    guarantee:
      "Delivered within 48 hours with 15 calibrated questions + communication tools — or your money back.",
    story: "In one real case, a defendant opened 500 pages of discovery and found four issues his attorney had never mentioned — a 73% weight discrepancy, a CI phone number attributed to two different people, a drug type mismatch, and 21 unmatched fingerprints. That's the kind of analysis we do for you.",
    validation:
      "The right place to start. Understand exactly what you are facing before your next attorney meeting.",
    whyThisWorks:
      `Every question generated using documented tactics from elite defense attorneys — chain of custody protocols, informant reliability methodology, drug forensic frameworks. 15 calibrated questions + ready-to-send email templates + a 7-day action plan. You're getting a communication playbook informed by the same methodologies elite defense attorneys use — for ${TIER_CORE["case-decoder"].priceDisplay}.`,
    pullquote: {
      quote:
        "Forensic evidence is only as reliable as the humans who handle it.",
      author: "Defense Research Methodology",
    },
    nudge: {
      nextTierSlug: "intelligence-brief",
      nextTierName: TIER_CORE["intelligence-brief"].name,
      nextTierPrice: TIER_CORE["intelligence-brief"].priceDisplay,
      upgradeCost: upgradePrice("case-decoder")!,
      unlocks:
        "Adds your judge's actual sentencing patterns, a motion landscape report, and 10-15 targeted questions.",
      bestFor:
        "Worth it if you already have an attorney and want to evaluate how they're handling your specific judge.",
    },
  },
  "intelligence-brief": {
    ...coreTier("intelligence-brief"),
    features: [
      "Case Decoder report delivered within 48 hours",
      "Everything in Case Decoder, plus:",
      "Case Progress Score — 6-dimension tracking with milestone timeline",
      "Prosecution Case Vulnerability Report — where their case is weakest, informed by court records and sentencing trends in your jurisdiction",
      "Charge exposure map",
      "Judge intelligence profile",
      "Jurisdiction profile",
      "Attorney accountability timeline",
      "Motion landscape report",
      "Case preservation protocol",
      "10-15 targeted questions across all sections + Appendix D",
      "Included: Judge Intelligence Card — one-page print reference for hearings",
      "Included: Plea Decision Checklist — before you sign anything, run this",
    ],
    guarantee:
      "Delivered within 72 hours with 10-15 targeted questions — or your money back.",
    story: "Three transactions in a federal indictment pre-dated the business relationship the government claimed created fraudulent intent. The attorney had never mapped the timeline. That's why judge intelligence and prosecution analysis matter.",
    validation:
      "Everything you need to understand your case — without needing discovery yet.",
    whyThisWorks:
      "Your judge's actual sentencing patterns. Your jurisdiction's plea statistics. Built on elite jury psychology methodology and constitutional appellate frameworks. A single hour with an attorney who knows this costs $500+. You're getting a complete intelligence file.",
    pullquote: {
      quote:
        "If you're not filing suppression motions, you're not defending.",
      author: "Defense Research Methodology",
    },
    nudge: {
      nextTierSlug: "x-ray",
      nextTierName: TIER_CORE["x-ray"].name,
      nextTierPrice: TIER_CORE["x-ray"].priceDisplay,
      upgradeCost: upgradePrice("intelligence-brief")!,
      unlocks:
        "Adds full discovery analysis — timelines, discrepancies, red flags inside the documents your attorney already has.",
      bestFor:
        "Worth it once you've received discovery. No discovery yet? The Brief is the right call for now.",
    },
  },
  "x-ray": {
    ...coreTier("x-ray"),
    features: [
      "Your Intelligence Brief and Case Decoder arrive first — you're not waiting 10 days with nothing",
      "Every page of your discovery read and cross-referenced — police reports against lab reports, witness statements against each other",
      "A case timeline built from your documents — showing what the prosecution's story actually says vs. what the evidence shows",
      "Contradictions, missing evidence, and rights violations documented with exact page numbers",
      "35-50 specific questions for your attorney meeting — each one tied to a finding in your file",
      "For every question: what a solid answer looks like, and what a red flag answer looks like",
      "One-page summary formatted to hand directly to your attorney at your next meeting",
      "Discovery Strength Rating — your evidence graded by category, so you know exactly where the gaps are",
      "Prosecution Case Weakness Analysis — the defense angles in your case, organized by charge, so nothing gets missed",
    ],
    guarantee:
      "Three Guarantees: (1) The Discovery Guarantee — if we don't find at least one concrete issue your attorney can act on, every dollar back. (2) The Attorney Meeting Guarantee — if your attorney says there's nothing there, we add a second round at no charge. (3) The 10-Day Hard Deadline — delivered within 10 business days or 20% refund automatic; past 15 days, full refund.",
    story: "In one trafficking case, we found a 73% weight discrepancy, a CI dual attribution, a drug type mismatch, and 21 unmatched fingerprints — all in one discovery file the attorney had never fully reviewed. That's what a full X-Ray uncovers.",
    validation:
      "The most thorough analysis available without a multi-week engagement. Full discovery, full picture.",
    whyThisWorks:
      "Every page of your discovery analyzed using chain of custody protocols and drug forensic frameworks developed by elite defense attorneys. We found a 73% weight discrepancy in the case that built this system. Your discovery has its own story — we'll find it.",
    pullquote: {
      quote:
        "The absence of physical evidence is itself evidence.",
      author: "Defense Research Methodology",
    },
    nudge: {
      nextTierSlug: "war-room",
      nextTierName: TIER_CORE["war-room"].name,
      nextTierPrice: TIER_CORE["war-room"].priceDisplay,
      upgradeCost: upgradePrice("x-ray")!,
      unlocks:
        "Adds judge and prosecution dossiers, witness analysis for up to 8 witnesses, a case law package, and weekly updates.",
      bestFor:
        "Worth it if your case has multiple witnesses, is headed to trial, or has months ahead.",
    },
  },
  "war-room": {
    ...coreTier("war-room"),
    features: [
      "Includes Case Decoder + Intelligence Brief + X-Ray delivered progressively",
      "Everything in The X-Ray, plus:",
      "Judge & prosecution dossiers",
      "Witness analysis (up to 8)",
      "Questions about motion timing for your attorney",
      "Case law reference package",
      "Research-based questions about case strategy for your attorney",
      "Attorney delivery package",
      "Weekly updates for duration of case",
      "Evidence Chain Audit — was the evidence handled properly? Every piece traced, custody gaps flagged",
      "Witness Reliability Rankings — how trustworthy is each witness? Scored on 7 dimensions",
    ],
    guarantee:
      "Initial package within 25-28 business days. Weekly updates every 7 days thereafter.",
    validation:
      "Ongoing intelligence from now through resolution. Most clients stay in this tier for the life of their case.",
    whyThisWorks:
      "Witness analysis using informant credibility methodology — proven in high-profile federal defense cases. Officer dossiers built on investigator accountability frameworks. Updated weekly as your case develops.",
    pullquote: {
      quote:
        "The cooperator is only as good as their handler lets them be.",
      author: "Defense Research Methodology",
    },
    nudge: {
      nextTierSlug: "situation-room",
      nextTierName: TIER_CORE["situation-room"].name,
      nextTierPrice: TIER_CORE["situation-room"].priceDisplay,
      upgradeCost: upgradePrice("war-room")!,
      unlocks:
        "Trial Intelligence Operations — all witnesses researched, daily trial prep, Priority Response Line, JOA + sentencing research.",
      bestFor:
        "Worth it if your case is headed to trial or the stakes justify full-spectrum preparation.",
    },
  },
  "situation-room": {
    ...coreTier("situation-room"),
    features: [
      "Includes all lower-tier reports delivered progressively",
      "Everything in The War Room, plus:",
      "Trial Intelligence Operations — evening debrief + morning prep brief every trial day",
      "Research on all witness backgrounds and credibility questions for your attorney",
      "Research summaries your attorney can use when drafting reply briefs",
      "Witness impeachment research packages",
      "Research-based questions about jury selection and trial strategy for your attorney",
      "JOA research brief — every applicable standard, formatted for your attorney",
      "Trial morning cheat sheets",
      "Priority Response Line — 2hr response during trial prep, 4hr during trial",
      "Direct access channel",
      "All scored deliverables from lower tiers included",
    ],
    guarantee:
      "Priority 24-48hr turnaround per stage. Trial Intelligence Operations through verdict.",
    validation:
      "Reserved for cases going to trial or cases where the stakes are highest. Requires prior War Room engagement.",
    whyThisWorks:
      "Trial prep built on elite preparation standards, cross-examination design, and precision strike methodology — from attorneys who defined modern trial practice. Trial Intelligence Operations means evening debrief + morning prep brief every trial day — because trial doesn't wait.",
    pullquote: {
      quote:
        "Preparation is the be-all of good trial work.",
      author: "Defense Research Methodology",
    },
  },
  "extra-witness": {
    ...coreTier("extra-witness"),
    features: [
      "Individual witness background report",
      "Credibility and background question set",
      "Added to your existing case file",
    ],
    guarantee: "Delivered in your next scheduled update cycle.",
  },
  "witness-pack": {
    ...coreTier("witness-pack"),
    features: [
      "Comprehensive witness analysis",
      "Background and credibility report",
      "Credibility and background questions",
      "Impeachment opportunities",
    ],
    guarantee: "Delivered within 5 business days.",
  },
};

/**
 * CheckoutContent — client component that reads ?tier from URL and renders
 * the checkout experience. Separated from the page export for Suspense boundary.
 */
function CheckoutContent() {
  const searchParams = useSearchParams();
  const tier = searchParams.get("tier") || "case-decoder";
  const band = searchParams.get("band"); // Score band passed from score page CTA
  const charge = searchParams.get("charge"); // Charge type passed from score page
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [courtDate, setCourtDate] = useState("");
  const [priorityDelivery, setPriorityDelivery] = useState(false);
  const [returningCustomer, setReturningCustomer] = useState(false);
  const [existingCaseNumber, setExistingCaseNumber] = useState("");
  const [existingCaseState, setExistingCaseState] = useState("");

  const info = TIER_INFO[tier];

  // Calculate urgency: if court date is <14 days away, highlight priority delivery
  const daysUntilCourt = courtDate
    ? Math.ceil((new Date(courtDate).getTime() - Date.now()) / 86400000)
    : null;
  const courtDateUrgent = daysUntilCourt !== null && daysUntilCourt < 14;

  if (!info) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">
            Invalid tier selected
          </h1>
          <Link
            href="/services"
            className="mt-4 inline-block text-amber-400 underline"
          >
            View pricing options
          </Link>
        </div>
      </div>
    );
  }

  /**
   * Handles the checkout button click.
   * - Situation Room: redirects to intake form (application gate, not direct purchase)
   * - All other tiers: POSTs to /api/checkout with tier, email, consent, priority,
   *   and court date. API creates a Stripe checkout session and returns the URL.
   *   On success, redirects browser to Stripe hosted checkout.
   */
  async function handleCheckout() {
    if (loading) return;

    if (tier === "situation-room") {
      window.location.href = "/intake?interest=situation-room";
      return;
    }

    // Show feedback if email entered but consent not checked
    if (email && !info.isDigitalProduct && !consentChecked) {
      setConsentError(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier, email, consent: consentChecked, priorityDelivery, courtDate: courtDate || undefined,
          ...(returningCustomer && existingCaseNumber && existingCaseState && {
            existingCaseNumber, existingCaseState,
          }),
          ...(info.isDigitalProduct && { productType: "digital-product" }),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError("Could not connect to payment service. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-4 py-16">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/services"
          className="mb-8 inline-block text-sm text-zinc-400 hover:text-white"
        >
          &larr; Back to pricing
        </Link>

        {/* BAND-AWARE HOOK — shown when arriving from score page with a band */}
        {band && (
          <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-sm text-zinc-300">
              Your Defense Milestone Score was <strong className="text-amber-400">{band}</strong>.
              {band === "Critical" || band === "Concerning"
                ? ` Your score flagged gaps that have deadlines attached${charge ? ` — specifically for ${charge === "dui" ? "DUI/DWI" : charge === "drug" ? "drug" : charge === "white-collar" ? "white collar" : charge === "other-felony" ? "felony" : "misdemeanor"} cases` : ""}. The ${info.name} targets exactly those gaps with questions your attorney needs to answer this week.`
                : ` The ${info.name} checks the charge-specific vulnerabilities that surface indicators miss${charge ? ` — calibrated for ${charge === "dui" ? "DUI/DWI" : charge === "drug" ? "drug" : charge === "white-collar" ? "white collar" : charge === "other-felony" ? "felony" : "misdemeanor"} cases` : ""}.`}
            </p>
          </div>
        )}

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8">
          <h1 className="text-2xl font-bold text-white">{info.name}</h1>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-4xl font-bold text-amber-400">
              {info.price}
            </span>
            <span className="text-sm text-zinc-400">one-time</span>
          </div>

          {/* Tier validation — reassurance copy specific to each tier */}
          {info.validation && (
            <p className="mt-3 text-sm text-zinc-300">{info.validation}</p>
          )}

          <div className="mt-2 rounded-lg bg-zinc-800/50 px-3 py-1 inline-block">
            <span className="text-xs text-zinc-400">
              Delivery: {info.delivery}
            </span>
          </div>

          {/* GUARANTEE — moved up: risk removal BEFORE features (Brunson) */}
          <div className="mt-6 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-xs font-semibold text-amber-400">
              Our Guarantee
            </p>
            <p className="mt-1 text-sm text-zinc-300">
              {band === "Critical" || band === "Concerning"
                ? "If the analysis and questions we deliver aren't specific to your charges, your case stage, and the gaps your attorney hasn't addressed — we'll rebuild it from scratch at no charge. If the rebuild still doesn't fit your situation, you get a full refund. No questions. No forms. One email."
                : `Delivery Guarantee: ${info.guarantee}`}
            </p>
            {!(band === "Critical" || band === "Concerning") && (
              <p className="mt-2 text-sm text-zinc-300">
                Satisfaction Guarantee: Not satisfied after delivery? 100% credit
                toward any higher tier within 30 days.
              </p>
            )}
            <p className="mt-2 text-xs text-zinc-400">
              Upgrade credits apply to purchases you keep.
            </p>
          </div>

          {/* Why This Works — attorney methodology proof, tier-specific */}
          {info.whyThisWorks && (
            <div className="mt-6 rounded-lg border border-zinc-700 bg-zinc-800/30 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Why This Works
              </p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                {info.whyThisWorks}
              </p>
            </div>
          )}

          {/* Attorney pullquote — named quote for credibility at point of purchase */}
          {info.pullquote && (
            <div className="mt-4 border-l-2 border-amber-500/30 pl-4">
              <p className="text-sm italic text-zinc-400">
                &ldquo;{info.pullquote.quote}&rdquo;
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                — {info.pullquote.author}
              </p>
            </div>
          )}

          {/* What's included */}
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-zinc-300">
              What&apos;s included
            </h2>
            <ul className="mt-3 space-y-2">
              {info.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2 text-sm text-zinc-400"
                >
                  <span className="mt-0.5 text-amber-400" aria-hidden="true">&#10003;</span>
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {/* Preview link */}
          <Link
            href="/sample"
            className="mt-4 inline-block text-sm text-amber-400 underline decoration-amber-400/50 hover:text-amber-300"
          >
            Preview what you&apos;ll get — see a real sample report →
          </Link>

          {/* Situation Room prerequisite — requires prior War Room purchase */}
          {info.requiresWarRoom && (
            <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-sm font-semibold text-amber-400">
                Requires War Room
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                The Situation Room builds on War Room intelligence. If you
                haven&apos;t started with the War Room, consider{" "}
                <Link
                  href="/checkout?tier=war-room"
                  className="text-amber-400 underline decoration-amber-400/50"
                >
                  starting there
                </Link>
                .
              </p>
            </div>
          )}

          {/* Discovery notice — informs buyer they'll need to upload documents after payment */}
          {info.requiresDiscovery && (
            <div className="mt-6 rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
              <p className="text-sm text-zinc-400">
                This tier requires discovery documents. You&apos;ll receive a
                link to upload them after payment.
              </p>
            </div>
          )}

          {/* Tier story — conversion reinforcement from real case */}
          {info.story && (
            <div className="mt-6 rounded-lg border border-zinc-700 bg-zinc-800/30 p-4">
              <p className="text-sm leading-relaxed text-zinc-300 italic">
                {info.story}
              </p>
            </div>
          )}

          {/* UPGRADE NUDGE — Shows the next tier up with upgrade cost.         */}
          {/* Conversion tactic: even if they buy the current tier, this       */}
          {/* plants the seed for future upgrade (100% credit applies).        */}
          {info.nudge && (
            <div className="mt-6 rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
              <p className="text-xs font-semibold text-zinc-400">
                Also available
              </p>
              <p className="mt-2 text-sm text-zinc-300">
                <Link
                  href={`/checkout?tier=${info.nudge.nextTierSlug}`}
                  className="font-semibold text-amber-400 underline decoration-amber-400/50"
                >
                  {info.nudge.nextTierName} ({info.nudge.nextTierPrice})
                </Link>
                {" — "}
                {info.nudge.unlocks}
              </p>
              <p className="mt-1 text-xs italic text-zinc-500">
                {info.nudge.bestFor}
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                Upgrade cost: {info.nudge.upgradeCost} (your {info.price}{" "}
                is credited)
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 rounded-lg border border-red-500/50 bg-red-500/10 p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* EMAIL CAPTURE — Required before Stripe redirect.                  */}
          {/* Business logic: email is sent to /api/checkout and stored in     */}
          {/* Stripe session metadata. Enables cart abandonment follow-up      */}
          {/* even if the customer never completes Stripe checkout.            */}
          <div className="mt-6">
            <label htmlFor="email" className="block text-sm font-medium text-zinc-300">
              Your email — we&apos;ll send your {info.isDigitalProduct ? "download link" : "report"} here
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(null); }}
              onBlur={() => {
                if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                  setEmailError("Please enter a valid email address");
                }
              }}
              placeholder="you@example.com"
              required
              className={`mt-1 w-full rounded-lg border ${emailError ? "border-red-500" : "border-zinc-700"} bg-zinc-800 px-4 py-3 text-base text-white placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500`}
            />
            {emailError && <p className="mt-1 text-xs text-red-400">{emailError}</p>}
            <p className="mt-1 text-xs text-zinc-400">No spam — ever. Just your report and delivery updates.</p>
          </div>

          {/* RETURNING CUSTOMER — For IB+ tiers, allow linking to existing CD. */}
          {/* If they already bought a Case Decoder under a different email,   */}
          {/* they can enter their court case number + state to link it.       */}
          {!info.isDigitalProduct && info.priceNum >= 997 && (
            <div className="mt-4">
              <label className="flex items-start gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={returningCustomer}
                  onChange={(e) => setReturningCustomer(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500"
                />
                <div>
                  <span className="text-sm font-semibold text-white">Already have a Case Decoder?</span>
                  <p className="mt-0.5 text-xs text-zinc-400">Enter your court case number and state to link your existing report and receive upgrade credit.</p>
                </div>
              </label>
              {returningCustomer && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="existingCaseNumber" className="block text-xs text-zinc-400">Court case number</label>
                    <input
                      id="existingCaseNumber"
                      type="text"
                      value={existingCaseNumber}
                      onChange={(e) => setExistingCaseNumber(e.target.value)}
                      placeholder="e.g. 24-00123-CF"
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-base text-white placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="existingCaseState" className="block text-xs text-zinc-400">State</label>
                    <select
                      id="existingCaseState"
                      value={existingCaseState}
                      onChange={(e) => setExistingCaseState(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-base text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="">Select state</option>
                      {["Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","District of Columbia","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming"].map((st) => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* COURT DATE — Optional input. Hidden for digital products. */}
          {!info.isDigitalProduct && <div className="mt-4">
            <label htmlFor="courtDate" className="block text-sm font-medium text-zinc-300">
              Next court date <span className="text-zinc-500">(optional)</span>
            </label>
            <input
              id="courtDate"
              type="date"
              value={courtDate}
              onChange={(e) => setCourtDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-base text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>}

          {/* PRIORITY DELIVERY ADD-ON — Hidden for digital products (instant delivery). */}
          {!info.isDigitalProduct && info.priorityPrice && (
            <label className={`mt-4 flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
              courtDateUrgent
                ? "border-amber-500 bg-amber-500/10"
                : "border-zinc-700 bg-zinc-800/50"
            }`}>
              <input
                type="checkbox"
                checked={priorityDelivery}
                onChange={(e) => setPriorityDelivery(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500"
              />
              <div>
                <span className="text-sm font-semibold text-white">
                  Priority 24-Hour Delivery — +{info.priorityPrice}
                </span>
                <p className="mt-0.5 text-xs text-zinc-400">Your standard 48-hour delivery starts when you submit case details. Add priority and get your analysis in 24 hours instead. One fewer day of not knowing.</p>
                {courtDateUrgent && (
                  <p className="mt-1 text-xs font-medium text-amber-400">
                    Your court date is {daysUntilCourt} days away — standard delivery may not arrive in time.
                  </p>
                )}
              </div>
            </label>
          )}

          {/* INFO CONSENT — Required for all non-digital tiers. UPL defense. */}
          {!info.isDigitalProduct && (
            <>
              <label className={`mt-4 flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                consentError && !consentChecked
                  ? "border-red-500 bg-red-500/5"
                  : "border-zinc-700 bg-zinc-800/50"
              }`}>
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => { setConsentChecked(e.target.checked); if (e.target.checked) setConsentError(false); }}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-xs text-zinc-400">
                  I understand this product provides legal information and research — not legal advice. No attorney-client relationship is created.
                  {info.priceNum >= 2497 && " This service involves custom research specific to my case. Work begins upon intake submission and is non-refundable once delivered. If we miss the stated delivery deadline, I receive a full refund."}
                </span>
              </label>
              {consentError && !consentChecked && (
                <p className="mt-1 text-xs text-red-400">Please check the box above to continue.</p>
              )}
            </>
          )}

          {/* Disclaimer (C7) */}
          <p className="mt-6 text-xs text-zinc-400">
            ImNotAnAttorney provides legal information and research — not legal advice. No attorney-client relationship is created.
          </p>

          {/* CTA BUTTON — Disabled until: email provided + consent (for $2,497+). */}
          {/* Dynamic label: "Apply for The Situation Room" or "Pay $X — Secure Checkout". */}
          {/* Price shown includes priority delivery add-on when selected.    */}
          <button
            onClick={handleCheckout}
            disabled={loading || !email || (!info.isDigitalProduct && !consentChecked)}
            className="mt-4 w-full rounded-lg bg-amber-500 py-4 text-sm font-bold text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Redirecting to payment...
              </span>
            ) : tier === "situation-room"
              ? "Apply for The Situation Room"
              : info.isDigitalProduct
              ? `Get Instant Access — ${info.price}`
              : band === "Critical" || band === "Concerning"
              ? `Get My ${info.name} — Close These Gaps (${priorityDelivery && info.priorityPriceNum ? `$${info.priceNum + info.priorityPriceNum}` : info.price}) →`
              : `Pay ${priorityDelivery && info.priorityPriceNum ? `$${info.priceNum + info.priorityPriceNum}` : info.price} — Secure Checkout`}
          </button>

          <p className="mt-3 text-center text-sm text-zinc-300">
            <svg className="mr-1 inline-block h-4 w-4 text-green-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
            </svg>
            Secure checkout powered by Stripe
          </p>
          <p className="mt-1 text-center text-xs text-zinc-400">
            Visa, Mastercard, and Amex accepted
          </p>
          <TrustBadges variant="checkout" />
        </div>

        {/* UPGRADE CREDITS REMINDER — Outside the main card, reinforces that */}
        {/* every dollar spent counts toward future upgrades. Reduces "what  */}
        {/* if I pick the wrong tier?" anxiety.                              */}
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
          <p className="text-sm font-semibold text-amber-400">
            100% Upgrade Credit
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            Every dollar you spend is credited toward higher tiers. Upgrade
            anytime within 12 months — no money wasted.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Page export wrapped in Suspense — useSearchParams requires client-side rendering. */
export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-zinc-400">Loading...</p>
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}

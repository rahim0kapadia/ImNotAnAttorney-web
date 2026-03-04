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

import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import Link from "next/link";

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
const TIER_INFO: Record<string, TierInfo> = {
  "dui-first-offense": {
    name: "DUI Defense Playbook",
    price: "$97",
    priceNum: 97,
    delivery: "Instant download",
    requiresDiscovery: false,
    isDigitalProduct: true,
    features: [
      "Charge Reality Report — DUI first offense explained in plain English",
      "23 Questions Your DUI Attorney Hopes You Never Ask (6-part format)",
      "DUI Case Stage Roadmap — arrest through resolution timeline",
      "Red Flag Checklist — 12 evidence and procedural red flags",
      "Attorney Accountability Scorecard — rate your attorney on 10 behaviors",
    ],
    guarantee:
      "5 questions you never thought to ask, or full refund. No explanation required.",
    validation:
      "Instant PDF. No intake form, no wait. Downloaded by DUI defendants within 60 seconds of purchase.",
    whyThisWorks:
      "Built from documented defense strategies used by Lawrence Taylor (the 'Dean of DUI Defense'), Barry Scheck's forensic evidence methodology, and NHTSA field sobriety test standards. 23 specific questions derived from 40+ elite DUI defense attorneys' techniques.",
    pullquote: {
      quote:
        "The breathalyzer reading is not the case. The maintenance records are.",
      author: "Lawrence Taylor",
    },
    nudge: {
      nextTierSlug: "case-decoder",
      nextTierName: "Case Decoder",
      nextTierPrice: "$197",
      upgradeCost: "$100",
      unlocks:
        "15 case-specific questions built from YOUR charges, YOUR state, YOUR stage. Plus email templates, phone scripts, and a 7-day action plan.",
      bestFor:
        "Worth it when you want questions tailored to your exact situation — not generic DUI questions.",
    },
  },
  "case-decoder": {
    name: "Case Decoder",
    price: "$197",
    priceNum: 197,
    delivery: "24 hours",
    requiresDiscovery: false,
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
      "Delivered within 24 hours with 15 calibrated questions + communication tools — or your money back.",
    priorityPrice: "$97",
    priorityDesc: "Same-day delivery (4 hours)",
    priorityPriceNum: 97,
    validation:
      "The right place to start. Understand exactly what you are facing before your next attorney meeting.",
    whyThisWorks:
      "Every question generated using documented tactics from elite defense attorneys — Barry Scheck's chain of custody protocol, Jeffrey Lichtman's informant reliability methodology, Ron Chapman II's drug forensic framework. 15 calibrated questions + ready-to-send email templates + a 7-day action plan. You're getting a communication playbook informed by the same methodologies elite defense attorneys use — for $197.",
    pullquote: {
      quote:
        "Forensic evidence is only as reliable as the humans who handle it.",
      author: "Barry Scheck",
    },
    nudge: {
      nextTierSlug: "intelligence-brief",
      nextTierName: "Intelligence Brief",
      nextTierPrice: "$997",
      upgradeCost: "$800",
      unlocks:
        "Adds your judge's actual sentencing patterns, a motion landscape report, and 10-15 targeted questions.",
      bestFor:
        "Worth it if you already have an attorney and want to evaluate how they're handling your specific judge.",
    },
  },
  "intelligence-brief": {
    name: "Case Intelligence Brief",
    price: "$997",
    priceNum: 997,
    delivery: "72 hours",
    requiresDiscovery: false,
    features: [
      "Case Decoder report delivered within 24 hours",
      "Everything in Case Decoder, plus:",
      "Attorney Accountability Score — 6-dimension tracking with milestone timeline",
      "Prosecution Case Vulnerability Report — where the prosecution's case has gaps, based on your county's outcome data",
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
    priorityPrice: "$297",
    priorityDesc: "24-hour delivery",
    priorityPriceNum: 297,
    validation:
      "Everything you need to understand your case — without needing discovery yet.",
    whyThisWorks:
      "Your judge's actual sentencing patterns. Your jurisdiction's plea statistics. Built on Benjamin Brafman's jury psychology methodology and Alan Dershowitz's constitutional framework. A single hour with an attorney who knows this costs $500+. You're getting a complete intelligence file.",
    pullquote: {
      quote:
        "If you're not filing suppression motions, you're not defending.",
      author: "Victor Knapp",
    },
    nudge: {
      nextTierSlug: "x-ray",
      nextTierName: "The X-Ray",
      nextTierPrice: "$2,497",
      upgradeCost: "$1,500",
      unlocks:
        "Adds full discovery analysis — timelines, discrepancies, red flags inside the documents your attorney already has.",
      bestFor:
        "Worth it once you've received discovery. No discovery yet? The Brief is the right call for now.",
    },
  },
  "x-ray": {
    name: "The X-Ray",
    price: "$2,497",
    priceNum: 2497,
    delivery: "10 business days",
    requiresDiscovery: true,
    features: [
      "Case Decoder + Intelligence Brief delivered first",
      "Everything in Intelligence Brief, plus:",
      "Discovery document index",
      "Comprehensive timeline",
      "Discrepancy report",
      "Red flags summary",
      "35+ case-specific questions",
      "Discovery Health Score — your discovery completeness rated out of 100",
      "Defense Opportunity Index — defense angles organized by charge category",
    ],
    guarantee:
      "Delivered within 10 business days with 35+ case-specific questions — or your money back.",
    priorityPrice: "$497",
    priorityDesc: "5 business day delivery",
    priorityPriceNum: 497,
    validation:
      "The most thorough analysis available without a multi-week engagement. Full discovery, full picture.",
    whyThisWorks:
      "Every page of your discovery analyzed using Barry Scheck's chain of custody protocol and Ron Chapman II's drug forensic framework. We found a 73% weight discrepancy in the case that built this system. Your discovery has its own story — we'll find it.",
    pullquote: {
      quote:
        "The absence of physical evidence is itself evidence.",
      author: "Barry Scheck",
    },
    nudge: {
      nextTierSlug: "war-room",
      nextTierName: "The War Room",
      nextTierPrice: "$4,997",
      upgradeCost: "$2,500",
      unlocks:
        "Adds judge and prosecution dossiers, witness analysis for up to 8 witnesses, a case law package, and weekly updates.",
      bestFor:
        "Worth it if your case has multiple witnesses, is headed to trial, or has months ahead.",
    },
  },
  "war-room": {
    name: "The War Room",
    price: "$4,997",
    priceNum: 4997,
    delivery: "25-28 days + weekly updates",
    requiresDiscovery: true,
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
      "Evidence Chain Audit — every piece of evidence traced, custody gaps flagged",
      "Witness Reliability Rankings — each witness scored across 7 credibility dimensions",
    ],
    guarantee:
      "Initial package within 25-28 business days. Weekly updates every 7 days thereafter.",
    priorityPrice: "$997",
    priorityDesc: "Expedited 20-day delivery",
    priorityPriceNum: 997,
    validation:
      "Ongoing intelligence from now through resolution. Most clients stay in this tier for the life of their case.",
    whyThisWorks:
      "Witness analysis using Jeffrey Lichtman's 7-pillar methodology — the system that dismantled cooperators in El Chapo and Gotti Jr. Officer dossiers built on Alan Jackson's investigator accountability framework. Updated weekly as your case develops.",
    pullquote: {
      quote:
        "The cooperator is only as good as their handler lets them be.",
      author: "Jeffrey Lichtman",
    },
    nudge: {
      nextTierSlug: "situation-room",
      nextTierName: "The Situation Room",
      nextTierPrice: "$9,997",
      upgradeCost: "$5,000",
      unlocks:
        "Trial Intelligence Operations — all witnesses researched, daily trial prep, Priority Response Line, JOA + sentencing research.",
      bestFor:
        "Worth it if your case is headed to trial or the stakes justify full-spectrum preparation.",
    },
  },
  "situation-room": {
    name: "The Situation Room",
    price: "$9,997",
    priceNum: 9997,
    delivery: "24-48hr priority turnaround",
    requiresDiscovery: true,
    requiresWarRoom: true,
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
      "Trial prep built on Roy Black's preparation standard, F. Lee Bailey's cross-examination design, and Barry Berke's precision strike methodology. Trial Intelligence Operations means evening debrief + morning prep brief every trial day — because trial doesn't wait.",
    pullquote: {
      quote:
        "Preparation is the be-all of good trial work.",
      author: "Roy Black",
    },
  },
  "extra-witness": {
    name: "Extra Witness Intel",
    price: "$149",
    priceNum: 149,
    delivery: "Next update cycle",
    requiresDiscovery: false,
    features: [
      "Individual witness background report",
      "Credibility and background question set",
      "Added to your existing case file",
    ],
    guarantee: "Delivered in your next scheduled update cycle.",
  },
  "witness-pack": {
    name: "Standalone Witness Pack",
    price: "$297",
    priceNum: 297,
    delivery: "3-5 business days",
    requiresDiscovery: true,
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
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

          {/* Guarantee */}
          <div className="mt-6 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-xs font-semibold text-amber-400">
              Our Guarantee
            </p>
            <p className="mt-1 text-sm text-zinc-300">
              Delivery Guarantee: {info.guarantee}
            </p>
            <p className="mt-2 text-sm text-zinc-300">
              Satisfaction Guarantee: Not satisfied after delivery? 100% credit
              toward any higher tier within 30 days.
            </p>
            <p className="mt-2 text-xs text-zinc-400">
              Upgrade credits apply to purchases you keep.
            </p>
          </div>

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
                      placeholder="e.g. 23-01773-CF"
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
                  Priority Delivery — +{info.priorityPrice}
                </span>
                <p className="mt-0.5 text-xs text-zinc-400">{info.priorityDesc}</p>
                {courtDateUrgent && (
                  <p className="mt-1 text-xs font-medium text-amber-400">
                    Your court date is {daysUntilCourt} days away — standard delivery may not arrive in time.
                  </p>
                )}
              </div>
            </label>
          )}

          {/* CONSENT GATE — Required for tiers >= $2,497. Hidden for digital products. */}
          {!info.isDigitalProduct && info.priceNum >= 2497 && (
            <label className="mt-4 flex items-start gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 cursor-pointer">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500"
              />
              <span className="text-xs text-zinc-400">
                I understand this service involves custom research specific to my case. Work begins
                upon intake submission and is non-refundable once delivered. If we miss the stated
                delivery deadline, I receive a full refund.
              </span>
            </label>
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
            disabled={loading || !email || (!info.isDigitalProduct && info.priceNum >= 2497 && !consentChecked)}
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

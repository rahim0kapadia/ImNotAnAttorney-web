/**
 * Services / Pricing Page (/services)
 *
 * Full service catalog with instant products organized by case type (Drug, DUI, White Collar).
 * This is the deep-dive pricing page linked from the landing page, nav, and
 * blog CTAs. While the landing page shows only 3 tiers to reduce decision
 * fatigue, this page shows all 5 tiers per case type.
 *
 * User journey position:
 *   Landing page / Blog / Nav -> THIS PAGE -> /checkout?tier=<slug>
 *
 * Page structure:
 *   1. Header, "Services built for your case" with tier count + upgrade credit intro
 *   2. Pricing comparison, Attorney cost vs. our cost (value framing)
 *   3. Upgrade credits callout, 100% credit toward next tier, 12-month expiration
 *   4. Decision guide, "No discovery yet?" vs "You have discovery?" routing
 *   5. Case type sections (Drug, DUI, White Collar), each with all 5 tiers:
 *      - Top 3 tiers in 3-column grid (Case Decoder, Intelligence Brief, X-Ray)
 *      - Bottom 2 tiers in 2-column grid (War Room, Situation Room)
 *      - Each tier card links to /checkout?tier=<slug>
 *   6. Guarantee section, Delivery + satisfaction guarantees with per-tier details
 *   7. FAQ accordion, 6 service-specific questions with schema markup
 *   8. Lead capture, Email opt-in fallback
 *
 * Conversion decisions:
 *   - Each tier shows a case-stage label (stageLabel), "First 30 days", "30-90 days in", etc.
 *   - Situation Room shows "Requires War Room" badge, application gate
 *   - Case Decoder cards include "View Sample Report" link to /sample
 *
 * SEO: FAQ schema (FAQPage) + ProfessionalService schema for rich snippets.
 */
import { DiscoveryGate } from "@/components/DiscoveryGate";
import { TrackA, TrackB, FilteredTrackDivider, GateContextCopy } from "@/components/ServicesFilteredContent";
import { FAQAccordion } from "@/components/FAQAccordion";
import { LeadCapture } from "@/components/LeadCapture";
import { FadeInUp } from "@/components/motion/FadeInUp";
import { StaggerContainer, StaggerItem } from "@/components/motion/StaggerContainer";
import { TrustBadges } from "@/components/TrustBadges";
import { TierBundleValue } from "@/components/TierBundleValue";
import { GuaranteeImpression } from "@/components/GuaranteeImpression";
import { SITE_URL } from "@/lib/site";
import { TIER_CORE, upgradePrice } from "@/lib/tiers";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Defense Intelligence Services",
  description:
    `Five tiers of defense research, from charge analysis to full trial intelligence. We research your case and give you the questions that change your next attorney meeting. From ${TIER_CORE["case-decoder"].priceDisplay} to ${TIER_CORE["situation-room"].priceDisplay}.`,
  alternates: {
    canonical: `${SITE_URL}/services`,
  },
  openGraph: {
    title: "Defense Intelligence Services",
    description:
      `Five tiers of defense research, from charge analysis to full trial intelligence. We research your case and give you the questions that change your next attorney meeting. From ${TIER_CORE["case-decoder"].priceDisplay} to ${TIER_CORE["situation-room"].priceDisplay}.`,
    url: `${SITE_URL}/services`,
  },
};

/**
 * Case type definitions with per-type tier descriptions.
 * Each case type (Drug, DUI, White Collar) has its own tier descriptions
 * tailored to the specific charge category. This allows the same 5-tier
 * structure to speak differently to each audience.
 *
 * Tier flags:
 *   - stageLabel: case-stage label (e.g., "First 30 days") shown above tier name
 *   - requiresWarRoom: true -> "Requires War Room" prerequisite badge
 *   - discovery: true -> shows "Requires discovery documents" note
 *   - capabilities?: optional sub-list of capability bullets rendered beneath the desc
 */
// COURT CASE PORT, Wave 1 Step 9
// Capability bullets named below depend on feature flags set in Step 8:
//   x-ray desc references Judge Intelligence Profile + Motion Opportunity Preview
//     (gated on ff.wave1.judge_intelligence_profile + ff.wave1.motion_wave_strategy)
//   war-room desc references Judge Dossier + Motion Wave Strategy + Cross-Exam Library
//     (gated on ff.wave1.judge_intelligence_profile + ff.wave2.cross_exam_templates)
//   situation-room desc references Full Battle Intelligence triangle
//     (gated on ff.wave3.witness_structured_research + wave1 + wave2 flags)
// DO NOT flip copy on before Step 8 flags are enabled in production.
const caseTypes = [
  {
    title: "Drug Cases",
    subtitle: "Possession, trafficking, distribution",
    description:
      "We track every person who touched the evidence. We check if the amount at arrest matches the lab report. We investigate whether any informant was reliable. These are the same approaches used in landmark defense cases and 375+ exonerations.",
    tiers: [
      {
        name: TIER_CORE["case-decoder"].name,
        slug: "case-decoder",
        price: TIER_CORE["case-decoder"].priceDisplay,
        desc: "15 specific questions to ask your attorney about your drug case. Includes ready-to-send email templates and a 7-day action plan.",
        discovery: TIER_CORE["case-decoder"].requiresDiscovery,
        stageLabel: "First 30 days",
      },
      {
        name: TIER_CORE["intelligence-brief"].name,
        slug: "intelligence-brief",
        price: TIER_CORE["intelligence-brief"].priceDisplay,
        desc: "How judges in your area sentence drug cases. How your prosecutor handles them. What outcomes are realistic, all researched from public records.",
        discovery: TIER_CORE["intelligence-brief"].requiresDiscovery,
        stageLabel: "30-90 days in",
      },
      {
        name: TIER_CORE["x-ray"].name,
        slug: "x-ray",
        price: TIER_CORE["x-ray"].priceDisplay,
        desc: "We analyze every page of your text-based discovery, police reports, lab results, court filings, and spreadsheets, and flag what doesn't add up. Missing evidence. Documents that contradict each other. Rights that may have been violated. You get 35-50 questions for your attorney, with page references. Each one shows what a good answer looks like, and what a red flag looks like.",
        capabilities: [
          "Judge research, how this judge has ruled on motions like yours, when public court records are available",
          "Motion types that may apply to your case, with general filing deadline windows",
          "Discovery Strength Rating + Prosecution Weakness Analysis",
        ],
        discovery: TIER_CORE["x-ray"].requiresDiscovery,
        stageLabel: "When you have your case documents",
      },
      {
        name: TIER_CORE["war-room"].name,
        slug: "war-room",
        price: TIER_CORE["war-room"].priceDisplay,
        desc: "Everything in the X-Ray, plus a full research operation for the life of your case. Weekly updates. Evidence-chain audit. Each witness ranked across 7 trust factors.",
        capabilities: [
          "Judge research with language patterns this judge has responded to in written orders",
          "Questions about motion types, timing, and sequencing for your attorney",
          "Cross-examination question libraries keyed to findings in your discovery",
          "Witness analysis for up to 8 prosecution witnesses",
        ],
        discovery: TIER_CORE["war-room"].requiresDiscovery,
        stageLabel: "Building your defense",
      },
      {
        name: TIER_CORE["situation-room"].name,
        slug: "situation-room",
        price: TIER_CORE["situation-room"].priceDisplay,
        desc: "Everything in War Room, plus priority operator access and an extended 28-day engagement window. Priority Response Line, 2-hour response during trial prep, 4-hour during trial. Nightly testimony analysis and morning prep briefs coming Q2 2026. Requires War Room.",
        capabilities: [
          "Everything in War Room, plus:",
          "Background research on every prosecution witness with source URLs your attorney can verify",
          "The full \"battle intelligence\" package, judge research + cross-examination libraries + witness backgrounds, all keyed to your discovery",
        ],
        discovery: TIER_CORE["situation-room"].requiresDiscovery,
        requiresWarRoom: TIER_CORE["situation-room"].requiresWarRoom,
        stageLabel: "Trial confirmed",
      },
    ],
  },
  {
    title: "DUI / DWI",
    subtitle: "First offense through felony DUI",
    description:
      "We check breathalyzer calibration records and field sobriety test compliance. We apply the same evidence review and cross-examination approaches used to win landmark retrials and acquittals.",
    tiers: [
      {
        name: TIER_CORE["case-decoder"].name,
        slug: "case-decoder",
        price: TIER_CORE["case-decoder"].priceDisplay,
        desc: "15 specific questions to ask your attorney about your DUI case. Includes ready-to-send email templates and a 7-day action plan.",
        discovery: TIER_CORE["case-decoder"].requiresDiscovery,
        stageLabel: "First 30 days",
      },
      {
        name: TIER_CORE["intelligence-brief"].name,
        slug: "intelligence-brief",
        price: TIER_CORE["intelligence-brief"].priceDisplay,
        desc: "How judges in your area handle DUI cases. Jurisdiction-specific procedural rules and deadlines that affect your case. What outcomes are realistic, all researched from public records.",
        discovery: TIER_CORE["intelligence-brief"].requiresDiscovery,
        stageLabel: "30-90 days in",
      },
      {
        name: TIER_CORE["x-ray"].name,
        slug: "x-ray",
        price: TIER_CORE["x-ray"].priceDisplay,
        desc: "We analyze every page of your text-based discovery, police reports, lab results, and court filings, and flag what doesn't add up. Breathalyzer calibration logs. Field sobriety test compliance. Rights that may have been violated. You get 35-50 questions for your attorney, with page references, each one showing what a good answer looks like and what a red flag looks like.",
        capabilities: [
          "Judge research, how this judge has ruled on motions like yours, when public court records are available",
          "Motion types that may apply to your case, with general filing deadline windows",
          "Discovery Strength Rating + Prosecution Weakness Analysis",
        ],
        discovery: TIER_CORE["x-ray"].requiresDiscovery,
        stageLabel: "When you have your case documents",
      },
      {
        name: TIER_CORE["war-room"].name,
        slug: "war-room",
        price: TIER_CORE["war-room"].priceDisplay,
        desc: "Everything in the X-Ray, plus a full research operation until your case resolves. Weekly updates. Evidence-chain audit. Each witness ranked across 7 trust factors.",
        capabilities: [
          "Judge research with language patterns this judge has responded to in written orders",
          "Questions about motion types, timing, and sequencing for your attorney",
          "Cross-examination question libraries keyed to findings in your discovery",
          "Expert witness challenge research (breath instrument, blood draw, SFST instructor)",
        ],
        discovery: TIER_CORE["war-room"].requiresDiscovery,
        stageLabel: "Building your defense",
      },
      {
        name: TIER_CORE["situation-room"].name,
        slug: "situation-room",
        price: TIER_CORE["situation-room"].priceDisplay,
        desc: "Everything in War Room, plus priority operator access and an extended 28-day engagement window. Priority Response Line, 2-hour response during trial prep, 4-hour during trial. Nightly testimony analysis and morning prep briefs coming Q2 2026. Requires War Room.",
        capabilities: [
          "Everything in War Room, plus:",
          "Background research on the arresting officer and every prosecution witness with source URLs your attorney can verify",
          "The full \"battle intelligence\" package, judge research + cross-examination libraries + witness backgrounds, all keyed to your discovery",
        ],
        discovery: TIER_CORE["situation-room"].requiresDiscovery,
        requiresWarRoom: TIER_CORE["situation-room"].requiresWarRoom,
        stageLabel: "Trial confirmed",
      },
    ],
  },
  {
    title: "White Collar",
    subtitle: "Fraud, embezzlement, federal charges",
    description:
      "Federal cases are a different game. We review your constitutional rights arguments, jury selection factors, and complex charge structures. Our approaches come from attorneys who have handled the highest-profile federal cases, helping you understand the charges and the factors involved in each strategic decision.",
    tiers: [
      {
        name: TIER_CORE["case-decoder"].name,
        slug: "case-decoder",
        price: TIER_CORE["case-decoder"].priceDisplay,
        desc: "15 specific questions to ask your attorney about your federal case. Includes ready-to-send email templates and a 7-day action plan.",
        discovery: TIER_CORE["case-decoder"].requiresDiscovery,
        stageLabel: "First 30 days",
      },
      {
        name: TIER_CORE["intelligence-brief"].name,
        slug: "intelligence-brief",
        price: TIER_CORE["intelligence-brief"].priceDisplay,
        desc: "How judges in your area sentence federal cases. Your prosecutor's track record. A review of your sentencing guidelines. Questions to help you think through cooperation decisions, all researched from public records.",
        discovery: TIER_CORE["intelligence-brief"].requiresDiscovery,
        stageLabel: "30-90 days in",
      },
      {
        name: TIER_CORE["x-ray"].name,
        slug: "x-ray",
        price: TIER_CORE["x-ray"].priceDisplay,
        desc: "We analyze every page of your text-based discovery, financial records, court filings, and spreadsheets, and flag what doesn't add up. Missing exhibits. Documents that contradict each other. Rights that may have been violated. You get 35-50 questions for your attorney, with page references, each one showing what a good answer looks like and what a red flag looks like.",
        capabilities: [
          "Judge research, how this judge has ruled on motions like yours, when public court records are available",
          "Motion types that may apply to your case, with general filing deadline windows",
          "Discovery Strength Rating + Prosecution Weakness Analysis",
        ],
        discovery: TIER_CORE["x-ray"].requiresDiscovery,
        stageLabel: "When you have your case documents",
      },
      {
        name: TIER_CORE["war-room"].name,
        slug: "war-room",
        price: TIER_CORE["war-room"].priceDisplay,
        desc: "Everything in the X-Ray, plus a full research operation for the life of your case. Federal prosecutor profile. Cooperator analysis. Deep dive into your sentencing guidelines. Weekly updates. Evidence-chain audit. Each witness ranked across 7 trust factors.",
        capabilities: [
          "Judge research with language patterns this judge has responded to in written orders",
          "Questions about motion types, timing, and sequencing for your attorney",
          "Cross-examination question libraries keyed to findings in your discovery",
          "Cooperator and expert witness background research",
        ],
        discovery: TIER_CORE["war-room"].requiresDiscovery,
        stageLabel: "Building your defense",
      },
      {
        name: TIER_CORE["situation-room"].name,
        slug: "situation-room",
        price: TIER_CORE["situation-room"].priceDisplay,
        desc: "Everything in War Room, plus priority operator access and an extended 28-day engagement window. Priority Response Line, 2-hour response during trial prep, 4-hour during trial. Nightly testimony analysis and morning prep briefs coming Q2 2026. Requires War Room.",
        capabilities: [
          "Everything in War Room, plus:",
          "Background research on every prosecution witness and cooperator with source URLs your attorney can verify",
          "The full \"battle intelligence\" package, judge research + cross-examination libraries + witness backgrounds, all keyed to your discovery",
        ],
        discovery: TIER_CORE["situation-room"].requiresDiscovery,
        requiresWarRoom: TIER_CORE["situation-room"].requiresWarRoom,
        stageLabel: "Trial confirmed",
      },
    ],
  },
];

/** Service-specific FAQ items for objection handling. Also used for FAQPage schema. */
const faqs = [
  {
    question: "Will this replace my attorney?",
    answer:
      "No. You need an attorney. We provide legal research and questions, not legal advice. Think of us as a second set of eyes on your case. We research your situation and give you specific questions your attorney needs to answer. You show up to your next meeting prepared, instead of waiting for your attorney to decide what to tell you.",
  },
  {
    question: "What exactly do I get in my report?",
    answer:
      "Every report includes a plain-English charge breakdown, calibrated questions in 6-part format (context, question, why it matters, good answer, bad answer, follow-up), and a communication toolkit. Higher tiers add jurisdiction intelligence, discovery analysis, witness research, and weekly updates.",
  },
  {
    question: "Can you guarantee my charges get dropped?",
    answer:
      "No. We guarantee deliverables, question counts, timeframes, and thorough analysis. We cannot and do not guarantee case outcomes.",
  },
  {
    question: "What if I already bought a lower tier?",
    answer:
      `100% of what you paid is credited toward the next tier. Buy the Case Decoder for ${TIER_CORE["case-decoder"].priceDisplay}, then upgrade to the Intelligence Brief for just ${upgradePrice("case-decoder")}. No money wasted. Credits are valid for 12 months.`,
  },
  {
    question: "How is this different from a second opinion?",
    answer:
      "A second opinion from another attorney costs $1,500+ for one hour. We provide ongoing, documented research with specific questions, at a fraction of the cost.",
  },
];

/** FAQPage JSON-LD for Google rich snippet eligibility on the services page. */
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
};

/** ProfessionalService JSON-LD schema for structured data in search results. */
const serviceSchema = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: "ImNotAnAttorney Case Review Services",
  description:
    `Defendant preparation intelligence for criminal defendants. Five tiers from ${TIER_CORE["case-decoder"].priceDisplay} Case Decoder to ${TIER_CORE["situation-room"].priceDisplay} Situation Room.`,
  provider: {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
  },
  serviceType: "Legal Information Research",
  areaServed: { "@type": "Country", name: "United States" },
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Defense Intelligence Tiers",
    itemListElement: [
      {
        "@type": "Offer",
        name: TIER_CORE["case-decoder"].name,
        description: "Charge analysis, 15 targeted questions, 7-day action plan, email templates",
        price: (TIER_CORE["case-decoder"].price / 100).toFixed(2),
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        url: `${SITE_URL}/checkout?tier=case-decoder`,
      },
      {
        "@type": "Offer",
        name: TIER_CORE["intelligence-brief"].name,
        description: "Jurisdiction intelligence, Prosecution Pattern Summary, 10-15 questions. Includes a Data-Driven Defense Intelligence appendix: rising-precedent tracker for your charge type, canonical quotes from the most-cited authorities, circuit-specific motion-grant rates vs national baseline, federal sentencing distribution for federal charges, JUSTFAIR judge demographics, per-judge authored-opinion motion patterns, and federal pattern jury instructions.",
        price: (TIER_CORE["intelligence-brief"].price / 100).toFixed(2),
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        url: `${SITE_URL}/checkout?tier=intelligence-brief`,
      },
      {
        "@type": "Offer",
        name: TIER_CORE["x-ray"].name,
        description: "Full discovery analysis, 35-50 questions, judge research on motions like yours, prioritized motion list with filing deadlines, Discovery Strength Rating. Includes the full Intelligence Brief with rising precedents, circuit motion rates, USSC federal sentencing distributions, JUSTFAIR judge demographics, and pattern jury instructions for your charge.",
        price: (TIER_CORE["x-ray"].price / 100).toFixed(2),
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        url: `${SITE_URL}/checkout?tier=x-ray`,
      },
      {
        "@type": "Offer",
        name: TIER_CORE["war-room"].name,
        description: "Ongoing intelligence operation with weekly updates, judge research with language patterns from written orders, full motion strategy, cross-examination question libraries keyed to your discovery, witness analysis. Includes everything in X-Ray + Intelligence Brief, all layered with rising-precedent tracking and circuit-specific motion-grant context.",
        price: (TIER_CORE["war-room"].price / 100).toFixed(2),
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        url: `${SITE_URL}/checkout?tier=war-room`,
      },
      {
        "@type": "Offer",
        name: TIER_CORE["situation-room"].name,
        description: "Trial Intelligence Operations, priority operator access, extended engagement window, background research on every prosecution witness with source URLs your attorney can verify. Includes everything in War Room plus motion-draft language tied to rising precedents in your circuit, and priority research response during trial-prep and trial.",
        price: (TIER_CORE["situation-room"].price / 100).toFixed(2),
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        url: `${SITE_URL}/checkout?tier=situation-room`,
      },
    ],
  },
};

export default function ServicesPage() {
  return (
    <div className="px-4 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
              { "@type": "ListItem", position: 2, name: "Services" },
            ],
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }}
      />
      <div className="mx-auto max-w-5xl">
        {/* HEADER, Page title + value proposition */}
        <FadeInUp>
        <div className="text-center">
          <h1 className="font-display text-3xl font-bold text-white md:text-5xl">
            Walk into your next hearing{" "}
            <span className="text-amber-400">with the right questions</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-zinc-300">
            Five tiers of defense intelligence, from {TIER_CORE["case-decoder"].priceDisplay} to {TIER_CORE["situation-room"].priceDisplay}. Upgrade anytime with full credit.
          </p>
        </div>
        </FadeInUp>

        <FadeInUp>
        <div className="mt-16 rounded-xl border border-zinc-500 bg-zinc-900/50 p-8 text-center">
          <h2 className="font-display text-lg font-bold text-white">
            Smart defendants don&apos;t just hire an attorney.{" "}
            <span className="text-amber-400">
              They get a second set of eyes on their own case, so they&apos;re never the only stranger in the room.
            </span>
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            You paid $10K-$100K+ for an attorney. Our services cost a fraction
            of that, to make sure you understand every decision they&apos;re making, and why.
          </p>
          <StaggerContainer className="mt-6 grid gap-4 md:grid-cols-3">
            {/* Prices from tiers.ts, update TIER_CORE there if pricing changes */}
            {[
              { attorney: "$10K", ours: `${TIER_CORE["case-decoder"].priceDisplay}–${TIER_CORE["x-ray"].priceDisplay}`, pct: "2-25%" },
              { attorney: "$30K", ours: `${TIER_CORE["intelligence-brief"].priceDisplay}–${TIER_CORE["war-room"].priceDisplay}`, pct: "3-17%" },
              { attorney: "$100K", ours: `${TIER_CORE["x-ray"].priceDisplay}–${TIER_CORE["situation-room"].priceDisplay}`, pct: "2-10%" },
            ].map((row) => (
              <StaggerItem key={row.attorney} className="rounded-lg bg-zinc-800/50 p-4">
                <div className="text-xs text-zinc-400">You paid attorney</div>
                <div className="text-lg font-bold text-white">
                  {row.attorney}
                </div>
                <div className="mt-2 text-xs text-zinc-400">Our service</div>
                <div className="text-lg font-bold text-amber-400">
                  {row.ours}
                </div>
                <div className="mt-1 text-xs text-zinc-400">
                  {row.pct} of your investment
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
        </FadeInUp>

        {/* UPGRADE CREDITS, Reduces commitment anxiety. 100% of payment     */}
        {/* applies toward next tier. 12-month expiration. This is key for   */}
        {/* getting Case Decoder purchases from people considering X-Ray.    */}
        <div className="mt-8 rounded-xl border border-amber-500/20 bg-amber-500/5 p-6 text-center">
          <p className="text-sm font-semibold text-amber-400">
            Upgrade Credits: 100% Applied
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            Start with the Case Decoder for {TIER_CORE["case-decoder"].priceDisplay}. If you upgrade later, every
            dollar you paid is credited toward the next tier. No money wasted.
            12-month expiration.
          </p>
        </div>
        <p className="mt-4 text-center text-sm text-zinc-400">
          Whether you&apos;re the defendant or the person doing the research for someone you love, every product works the same way.
        </p>

        {/* DISCOVERY GATE, Interactive two-button filter (Covello-compliant). */}
        {/* Uses "police reports / case documents" not "discovery" per Covello.*/}
        {/* Wraps Instant Products + Case Type sections to control visibility.*/}
        <DiscoveryGate>
        <GateContextCopy />

        {/* INSTANT PRODUCTS, Track A (pre-discovery). Hidden when post-discovery selected. */}
        <TrackA>
        <FadeInUp>
        <section className="mt-12">
          <div className="mb-8">
            <h2 className="font-display text-2xl font-bold text-white md:text-3xl">
              Instant Products
            </h2>
            <p className="text-sm text-amber-400">
              No intake form. No wait. Instant PDF download.
            </p>
            <p className="mt-2 text-zinc-400">
              Charge-specific Defense Playbooks built from elite attorney
              methodology. Get answers NOW, then upgrade to a personalized
              service with full credit.
            </p>
          </div>
          <StaggerContainer className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StaggerItem>
            <Link
              href="/checkout?tier=dui-first-offense"
              className="flex h-full flex-col rounded-xl border border-amber-500/50 bg-zinc-900 p-6 transition-colors hover:border-amber-500/80"
            >
              <span className="mb-2 inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400">
                Available Now
              </span>
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold text-white">
                  DUI Defense Playbook
                </h3>
                <span className="text-lg font-bold text-amber-400">{TIER_CORE["dui-first-offense"].priceDisplay}</span>
              </div>
              <p className="mt-2 flex-1 text-sm text-zinc-400">
                26 questions that change how your next attorney meeting goes.
                Breathalyzer calibration checklist, case stage roadmap, 12 red
                flags, Case Progress Scorecard. Instant PDF.
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                {TIER_CORE["dui-first-offense"].priceDisplay} credited toward {TIER_CORE["case-decoder"].name} within 30 days.
              </p>
            </Link>
            </StaggerItem>
            <StaggerItem>
            <Link
              href="/checkout?tier=drug-possession"
              className="flex h-full flex-col rounded-xl border border-amber-500/50 bg-zinc-900 p-6 transition-colors hover:border-amber-500/80"
            >
              <span className="mb-2 inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400">
                Available Now
              </span>
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold text-white">
                  Drug Possession Playbook
                </h3>
                <span className="text-lg font-bold text-amber-400">{TIER_CORE["drug-possession"].priceDisplay}</span>
              </div>
              <p className="mt-2 flex-1 text-sm text-zinc-400">
                26 questions that expose weak evidence. Chain of custody,
                lab analysis challenges, search &amp; seizure, CI reliability.
                Built from real cases.
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                {TIER_CORE["drug-possession"].priceDisplay} credited toward {TIER_CORE["case-decoder"].name} within 30 days.
              </p>
            </Link>
            </StaggerItem>
            <StaggerItem>
            <Link
              href="/checkout?tier=probation-violation"
              className="flex h-full flex-col rounded-xl border border-amber-500/50 bg-zinc-900 p-6 transition-colors hover:border-amber-500/80"
            >
              <span className="mb-2 inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400">
                Available Now
              </span>
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold text-white">
                  Probation Violation Playbook
                </h3>
                <span className="text-lg font-bold text-amber-400">{TIER_CORE["probation-violation"].priceDisplay}</span>
              </div>
              <p className="mt-2 flex-1 text-sm text-zinc-400">
                26 questions for revocation hearings. Willfulness defense,
                state cap laws, alternatives to revocation, graduated sanctions.
                Built from the case-specific arguments that keep defendants out of revocation.
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                {TIER_CORE["probation-violation"].priceDisplay} credited toward {TIER_CORE["case-decoder"].name} within 30 days.
              </p>
            </Link>
            </StaggerItem>
            <StaggerItem>
            <Link
              href="/checkout?tier=white-collar"
              className="flex h-full flex-col rounded-xl border border-amber-500/50 bg-zinc-900 p-6 transition-colors hover:border-amber-500/80"
            >
              <span className="mb-2 inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400">
                Available Now
              </span>
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold text-white">
                  White Collar Defense Playbook
                </h3>
                <span className="text-lg font-bold text-amber-400">{TIER_CORE["white-collar"].priceDisplay}</span>
              </div>
              <p className="mt-2 flex-1 text-sm text-zinc-400">
                26 questions for fraud, embezzlement, and federal charges. Wire fraud elements, cooperation decisions, sentencing guidelines, AUSA profiling. Instant PDF.
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                {TIER_CORE["white-collar"].priceDisplay} credited toward {TIER_CORE["case-decoder"].name} within 30 days.
              </p>
            </Link>
            </StaggerItem>
            <StaggerItem>
            <Link
              href="/checkout?tier=sex-offense"
              className="flex h-full flex-col rounded-xl border border-amber-500/50 bg-zinc-900 p-6 transition-colors hover:border-amber-500/80"
            >
              <span className="mb-2 inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400">
                Available Now
              </span>
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold text-white">
                  Sex Offense Defense Playbook
                </h3>
                <span className="text-lg font-bold text-amber-400">{TIER_CORE["sex-offense"].priceDisplay}</span>
              </div>
              <p className="mt-2 flex-1 text-sm text-zinc-400">
                26 questions covering registry implications, evidence preservation, accusation analysis, and constitutional protections. Instant PDF.
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                {TIER_CORE["sex-offense"].priceDisplay} credited toward {TIER_CORE["case-decoder"].name} within 30 days.
              </p>
            </Link>
            </StaggerItem>
            <StaggerItem>
            <Link
              href="/checkout?tier=federal-criminal"
              className="flex h-full flex-col rounded-xl border border-amber-500/50 bg-zinc-900 p-6 transition-colors hover:border-amber-500/80"
            >
              <span className="mb-2 inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400">
                Available Now
              </span>
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold text-white">
                  Federal Criminal Defense Playbook
                </h3>
                <span className="text-lg font-bold text-amber-400">{TIER_CORE["federal-criminal"].priceDisplay}</span>
              </div>
              <p className="mt-2 flex-1 text-sm text-zinc-400">
                26 questions on federal procedure, sentencing guidelines, cooperation agreements, and AUSA tactics. Instant PDF.
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                {TIER_CORE["federal-criminal"].priceDisplay} credited toward {TIER_CORE["case-decoder"].name} within 30 days.
              </p>
            </Link>
            </StaggerItem>
            <StaggerItem>
            <Link
              href="/checkout?tier=drug-trafficking"
              className="flex h-full flex-col rounded-xl border border-amber-500/50 bg-zinc-900 p-6 transition-colors hover:border-amber-500/80"
            >
              <span className="mb-2 inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400">
                Available Now
              </span>
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold text-white">
                  Drug Trafficking Defense Playbook
                </h3>
                <span className="text-lg font-bold text-amber-400">{TIER_CORE["drug-trafficking"].priceDisplay}</span>
              </div>
              <p className="mt-2 flex-1 text-sm text-zinc-400">
                26 questions on conspiracy charges, mandatory minimums, informant reliability, and wiretap challenges. Instant PDF.
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                {TIER_CORE["drug-trafficking"].priceDisplay} credited toward {TIER_CORE["case-decoder"].name} within 30 days.
              </p>
            </Link>
            </StaggerItem>
            <StaggerItem>
            <Link
              href="/checkout?tier=self-defense"
              className="flex h-full flex-col rounded-xl border border-amber-500/50 bg-zinc-900 p-6 transition-colors hover:border-amber-500/80"
            >
              <span className="mb-2 inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400">
                Available Now
              </span>
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold text-white">
                  Self-Defense Playbook
                </h3>
                <span className="text-lg font-bold text-amber-400">{TIER_CORE["self-defense"].priceDisplay}</span>
              </div>
              <p className="mt-2 flex-1 text-sm text-zinc-400">
                26 questions on use of force standards, stand your ground, castle doctrine, and witness credibility. Instant PDF.
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                {TIER_CORE["self-defense"].priceDisplay} credited toward {TIER_CORE["case-decoder"].name} within 30 days.
              </p>
            </Link>
            </StaggerItem>
          </StaggerContainer>
        </section>
        </FadeInUp>
        </TrackA>

        {/* CASE TYPE SECTIONS, Track A (CD, IB) and Track B (X-Ray, WR)    */}
        {/* split by a divider. SR in separate section. Filter controls which */}
        {/* track is visible.                                                 */}
        {caseTypes.map((ct) => (
          <FadeInUp key={ct.title}>
          <section className="mt-12">
            <div className="mb-8">
              <h2 className="font-display text-2xl font-bold text-white md:text-3xl">
                {ct.title}
              </h2>
              <p className="text-sm text-amber-400">{ct.subtitle}</p>
              <p className="mt-2 text-zinc-400">{ct.description}</p>
            </div>

            {/* Track A, Pre-discovery tiers (Case Decoder, Intelligence Brief) */}
            <TrackA>
            <div className="grid gap-4 md:grid-cols-2">
              {ct.tiers.slice(0, 2).map((tier) => (
                <div
                  key={tier.name}
                  className={`flex h-full flex-col rounded-xl p-6 ${tier.slug === "case-decoder" ? "border-2 border-amber-500 bg-zinc-900/50" : "border border-zinc-500 bg-zinc-900/50"}`}
                >
                  {tier.slug === "case-decoder" && (
                    <span className="mb-2 inline-block rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-400">
                      Recommended First Step
                    </span>
                  )}
                  {tier.stageLabel && (
                    <span className="mb-2 inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400">
                      {tier.stageLabel}
                    </span>
                  )}
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-semibold text-white">{tier.name}</h3>
                    <span className="text-lg font-bold text-amber-400">
                      {tier.price}
                    </span>
                  </div>
                  <p className="mt-2 flex-1 text-sm text-zinc-400">{tier.desc}</p>
                  <TierBundleValue tierSlug={tier.slug} className="mt-4" />
                  <Link
                    href={`/checkout?tier=${tier.slug}`}
                    className="mt-4 block rounded-lg border border-zinc-700 py-2 text-center text-sm font-semibold text-white transition-colors hover:border-zinc-500"
                  >
                    Get {tier.name}
                  </Link>
                  {tier.slug === "case-decoder" && (
                    <Link
                      href="/sample"
                      className="mt-2 block text-center text-xs text-amber-400 underline decoration-amber-400/50 hover:text-amber-300"
                    >
                      View Sample Report
                    </Link>
                  )}
                </div>
              ))}
            </div>
            </TrackA>

            {/* Track A/B Divider, only shown when both tracks visible */}
            <FilteredTrackDivider />

            {/* Track B, Post-discovery tiers (X-Ray, War Room) */}
            <TrackB>
            <div className="grid gap-4 md:grid-cols-2">
              {ct.tiers.slice(2, 4).map((tier) => (
                <div
                  key={tier.name}
                  id={tier.slug}
                  className={`flex h-full flex-col rounded-xl p-6 ${tier.slug === "x-ray" ? "border-2 border-amber-500 bg-zinc-900/50" : "border border-zinc-500 bg-zinc-900/50"}`}
                >
                  {tier.slug === "x-ray" && (
                    <span className="mb-2 inline-block rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-400">
                      Recommended First Step
                    </span>
                  )}
                  {tier.stageLabel && (
                    <span className="mb-2 inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400">
                      {tier.stageLabel}
                    </span>
                  )}
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-semibold text-white">{tier.name}</h3>
                    <span className="text-lg font-bold text-amber-400">
                      {tier.price}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-400">{tier.desc}</p>
                  {"capabilities" in tier && Array.isArray((tier as { capabilities?: string[] }).capabilities) && (
                    <ul className="mt-3 flex-1 list-disc space-y-1 pl-5 text-xs text-zinc-400">
                      {(tier as { capabilities: string[] }).capabilities.map((cap) => (
                        <li key={cap}>{cap}</li>
                      ))}
                    </ul>
                  )}
                  {tier.slug === "x-ray" && (
                    <p className="mt-3 text-xs text-zinc-400">
                      Analysis powered by 7 defense methodologies: evidence chain integrity, drug forensic analysis, constitutional compliance mapping, witness statement cross-referencing, suppression opportunity detection, investigation quality assessment, and 15-pattern forensic detection.
                    </p>
                  )}
                  {tier.discovery && (
                    <p className="mt-2 text-xs text-zinc-400">
                      Requires discovery documents
                    </p>
                  )}
                  {tier.slug === "war-room" && (
                    <p className="mt-2 text-xs text-amber-400/80">
                      Includes Case Decoder + Intelligence Brief + X-Ray, everything in one package
                    </p>
                  )}
                  <TierBundleValue tierSlug={tier.slug} className="mt-4" />
                  <Link
                    href={`/checkout?tier=${tier.slug}`}
                    className="mt-4 block rounded-lg border border-zinc-700 py-2 text-center text-sm font-semibold text-white transition-colors hover:border-zinc-500"
                  >
                    Get {tier.name}
                  </Link>
                  {tier.slug === "x-ray" && (
                    <Link
                      href="/sample-xray"
                      className="mt-2 block text-center text-sm text-amber-400 underline hover:text-amber-300"
                    >
                      See what an X-Ray report looks like
                    </Link>
                  )}
                </div>
              ))}
            </div>

            {/* Situation Room, separated from main grid per Dunford */}
            {ct.tiers[4] && (
            <div className="mt-8">
              <div className="mb-4 text-center">
                <p className="text-sm font-semibold text-zinc-300">For defendants with a confirmed trial date</p>
              </div>
              <div id="situation-room" className="flex h-full flex-col rounded-xl border border-zinc-500 bg-zinc-900/50 p-6">
                {ct.tiers[4].stageLabel && (
                  <span className="mb-2 inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400">
                    {ct.tiers[4].stageLabel}
                  </span>
                )}
                <span className="ml-2 mb-2 inline-block rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-semibold text-zinc-300">
                  By application, requires War Room
                </span>
                <div className="flex items-baseline justify-between">
                  <h3 className="font-semibold text-white">{ct.tiers[4].name}</h3>
                  <span className="text-lg font-bold text-amber-400">
                    {ct.tiers[4].price}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-400">{ct.tiers[4].desc}</p>
                {"capabilities" in ct.tiers[4] && Array.isArray((ct.tiers[4] as { capabilities?: string[] }).capabilities) && (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-zinc-400">
                    {(ct.tiers[4] as { capabilities: string[] }).capabilities.map((cap) => (
                      <li key={cap}>{cap}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-xs text-amber-400/80">
                  {/* Total computed dynamically from tiers.ts */}
                  Includes all tiers ({(() => {
                    const total = (["case-decoder", "intelligence-brief", "x-ray", "war-room", "situation-room"] as const)
                      .reduce((sum, slug) => sum + TIER_CORE[slug].price, 0) / 100;
                    return `$${total.toLocaleString("en-US")}`;
                  })()} value), {TIER_CORE["situation-room"].priceDisplay}
                </p>
                {ct.tiers[4].discovery && (
                  <p className="mt-2 text-xs text-zinc-400">
                    Requires discovery documents
                  </p>
                )}
                <TierBundleValue tierSlug={ct.tiers[4].slug} className="mt-4" />
                <Link
                  href="/intake?interest=situation-room"
                  className="mt-4 block rounded-lg border border-zinc-700 py-2 text-center text-sm font-semibold text-white transition-colors hover:border-zinc-500"
                >
                  Get {ct.tiers[4].name}
                </Link>
              </div>
            </div>
            )}
            </TrackB>
          </section>
          </FadeInUp>
        ))}

        </DiscoveryGate>

        {/* GUARANTEE, Per-tier delivery commitments with deadlines.          */}
        {/* Reinforces risk reversal at the point of maximum hesitation.      */}
        <FadeInUp>
        <GuaranteeImpression surface="services">
        <section className="mt-20 rounded-xl border border-zinc-500 bg-zinc-900/50 p-8 text-center">
          <h2 className="font-display text-2xl font-bold text-white">
            Our Guarantee
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-zinc-300">
            Every tier comes with a delivery guarantee. If we miss the stated deadline or question count, full cash refund, no questions asked.
          </p>

          {/* X-Ray 3-Layer Guarantee Stack */}
          <div className="mx-auto mt-8 max-w-2xl text-left">
            <h3 className="text-lg font-bold text-amber-400 mb-4">{TIER_CORE["x-ray"].name}, Three Guarantees. Zero Exceptions.</h3>
            <div className="space-y-4">
              <div className="rounded-lg border border-zinc-500 bg-zinc-950/50 p-5">
                <p className="font-semibold text-white mb-2">The Discovery Guarantee</p>
                <p className="text-sm text-zinc-400">
                  Every piece of discovery we have analyzed has contained at least one discrepancy, gap, or constitutional vulnerability. Every single one. That is not marketing language, it is the nature of police work and prosecutorial preparation. If we analyze your discovery documents and do not identify at least one concrete issue your attorney hasn't raised, a contradiction, a chain of custody gap, a constitutional question, a missing piece of evidence that should be there, you get every dollar back. No forms. No phone calls. No waiting. Just email us and it&apos;s done.
                </p>
              </div>
              <div className="rounded-lg border border-zinc-500 bg-zinc-950/50 p-5">
                <p className="font-semibold text-white mb-2">The Attorney Meeting Guarantee</p>
                <p className="text-sm text-zinc-400">
                  Every X-Ray comes with an Attorney Delivery Package, a formatted summary of findings your attorney can read in 10 minutes, with every claim sourced back to a specific page in your discovery. If your attorney reviews our findings and tells you there is nothing there, send us the response and we will add a second round of analysis at no charge.
                </p>
              </div>
              <div className="rounded-lg border border-zinc-500 bg-zinc-950/50 p-5">
                <p className="font-semibold text-white mb-2">The Delivery Commitment</p>
                <p className="text-sm text-zinc-400">
                  Delivered within 10 business days of document receipt or you receive a 20% refund automatically, no request required. Past 15 business days for any reason: full refund. Your case moves on a schedule. So do we.
                </p>
              </div>
            </div>
          </div>

          {/* Other tier guarantees */}
          <div className="mx-auto mt-6 max-w-2xl text-left">
            <div className="space-y-2 text-sm text-zinc-400">
              <p>
                <span className="font-semibold text-white">{TIER_CORE["case-decoder"].name} ({TIER_CORE["case-decoder"].priceDisplay}):</span>{" "}
                15 calibrated questions researched from your specific charge details. Delivered within 48 hours of intake.
              </p>
              <p>
                <span className="font-semibold text-white">
                  {TIER_CORE["intelligence-brief"].name} ({TIER_CORE["intelligence-brief"].priceDisplay}):
                </span>{" "}
                10-15 targeted questions with jurisdiction intelligence and jurisdiction analysis. Delivered within 72 hours of intake.
              </p>
              <p>
                <span className="font-semibold text-white">
                  {TIER_CORE["war-room"].name} ({TIER_CORE["war-room"].priceDisplay}):
                </span>{" "}
                Initial package within 25-28 business days or full refund. Weekly updates thereafter, if any update surfaces zero new findings, that update is free. Priority questions answered within 4 business hours.
              </p>
              <p>
                <span className="font-semibold text-white">
                  {TIER_CORE["situation-room"].name} ({TIER_CORE["situation-room"].priceDisplay}):
                </span>{" "}
                Full trial intelligence cycle, priority operator access, witness impeachment research, extended 28-day engagement. Nightly testimony analysis and morning prep briefs coming Q2 2026. Priority 24-48hr turnaround.
              </p>
            </div>
          </div>
        </section>
        </GuaranteeImpression>
        </FadeInUp>

        <div className="mt-10 text-center">
          <p className="text-sm text-zinc-400">
            Questions about which tier is right?{" "}
            <a
              href="mailto:help@imnotanattorney.com"
              className="font-semibold text-amber-400 underline decoration-amber-400/50 hover:decoration-amber-400"
            >
              help@imnotanattorney.com
            </a>
            {" "}&mdash; we respond within one business day.
          </p>
        </div>

        {/* FAQ, Service-specific questions rendered via FAQAccordion.        */}
        <FadeInUp>
        <section className="mt-20">
          <h2 className="font-display mb-8 text-center text-2xl font-bold text-white">
            Frequently Asked Questions
          </h2>
          <FAQAccordion items={faqs} />
        </section>
        </FadeInUp>

        <div className="mt-8">
          <TrustBadges variant="pricing" />
        </div>

        {/* LEAD CAPTURE, Fallback email opt-in for visitors not ready to buy. */}
        <div className="mt-16">
          <LeadCapture ungated />
        </div>
      </div>
    </div>
  );
}

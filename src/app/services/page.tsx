import { FAQAccordion } from "@/components/FAQAccordion";
import { LeadCapture } from "@/components/LeadCapture";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Criminal Defense Case Analysis Services",
  description:
    "Case-specific research and question reports for criminal defendants. Five tiers from $197 Case Decoder to $9,997 Situation Room. DUI, drug cases, white collar, and federal defense.",
  alternates: {
    canonical: "https://imnotanattorney.com/services",
  },
};

const caseTypes = [
  {
    title: "Drug Cases",
    subtitle: "Possession, trafficking, distribution",
    description:
      "We analyze your case using Barry Scheck's chain of custody protocol, Ron Chapman II's weight discrepancy framework, and Jeffrey Lichtman's 7-pillar CI reliability system — the same approaches that won El Chapo's defense and produced 375+ Innocence Project exonerations.",
    tiers: [
      {
        name: "Case Decoder",
        slug: "case-decoder",
        price: "$197",
        desc: "Plain-English charge breakdown + 10-15 drug-case questions. Includes Attorney Accountability Score — a 0-100 rating of whether your attorney is on track for your case stage.",
        discovery: false,
        popular: true,
      },
      {
        name: "Intelligence Brief",
        slug: "intelligence-brief",
        price: "$797",
        desc: "Judge intelligence for drug cases. How does your judge rule on suppression? What's the local plea pattern? 35-50 targeted questions. Includes Prosecution Case Strength Map — Strong/Moderate/Weak for every element of every charge.",
        discovery: false,
      },
      {
        name: "The X-Ray",
        slug: "x-ray",
        price: "$1,497",
        desc: "Full discovery analysis — weight discrepancies, lab methodology gaps, CI reliability, chain of custody. 35+ case-specific questions. Includes Discovery Health Score and Defense Opportunity Index — your discovery rated for completeness, your defense openings ranked by strength.",
        discovery: true,
        bestValue: true,
      },
      {
        name: "The War Room",
        slug: "war-room",
        price: "$3,497",
        desc: "Everything above + officer dossiers, witness analysis (up to 8), motion wave strategy, case law package, weekly updates. Includes Evidence Chain Audit and Witness Reliability Rankings — every piece of evidence traced through custody, every witness scored across 7 credibility dimensions.",
        discovery: true,
      },
      {
        name: "The Situation Room",
        slug: "situation-room",
        price: "$9,997",
        desc: "Trial Intelligence Operations — evening debrief + morning prep brief every trial day. All witnesses researched, JOA research brief, Priority Response Line (2hr during trial prep, 4hr during trial). Requires War Room. Built on Roy Black's preparation standard, F. Lee Bailey's cross-examination design, and Barry Berke's precision strike methodology.",
        discovery: true,
        requiresWarRoom: true,
      },
    ],
  },
  {
    title: "DUI / DWI",
    subtitle: "First offense through felony DUI",
    description:
      "From breathalyzer calibration to field sobriety compliance, we apply Barry Scheck's forensic methodology and F. Lee Bailey's evidence analysis framework — the same approach Bailey used to destroy prosecution witnesses in the Sam Sheppard retrial.",
    tiers: [
      {
        name: "Case Decoder",
        slug: "case-decoder",
        price: "$197",
        desc: "Your DUI charges explained in plain English. What to expect at each stage. 10-15 questions your attorney needs to answer. Includes Attorney Accountability Score — a 0-100 rating of whether your attorney is on track for your case stage.",
        discovery: false,
        popular: true,
      },
      {
        name: "Intelligence Brief",
        slug: "intelligence-brief",
        price: "$797",
        desc: "Your judge's DUI sentencing patterns, local diversion programs, DMV hearing strategy. 35-50 targeted questions. Includes Prosecution Case Strength Map — Strong/Moderate/Weak for every element of every charge.",
        discovery: false,
      },
      {
        name: "The X-Ray",
        slug: "x-ray",
        price: "$1,497",
        desc: "Full discovery analysis — BAC evidence, breathalyzer calibration, dashcam review, field sobriety compliance. 35+ questions. Includes Discovery Health Score and Defense Opportunity Index — your discovery rated for completeness, your defense openings ranked by strength.",
        discovery: true,
        bestValue: true,
      },
      {
        name: "The War Room",
        slug: "war-room",
        price: "$3,497",
        desc: "Officer dossiers, expert witness challenges, motion wave strategy, case law package, weekly updates until resolution. Includes Evidence Chain Audit and Witness Reliability Rankings — every piece of evidence traced through custody, every witness scored across 7 credibility dimensions.",
        discovery: true,
      },
      {
        name: "The Situation Room",
        slug: "situation-room",
        price: "$9,997",
        desc: "Trial Intelligence Operations — evening debrief + morning prep brief every trial day. Officer research, expert credibility questions, jury selection research. Priority Response Line (2hr during trial prep, 4hr during trial). Requires War Room. Built on Roy Black's preparation standard, F. Lee Bailey's cross-examination design, and Barry Berke's precision strike methodology.",
        discovery: true,
        requiresWarRoom: true,
      },
    ],
  },
  {
    title: "White Collar",
    subtitle: "Fraud, embezzlement, federal charges",
    description:
      "Federal cases are a different game. We apply Alan Dershowitz's constitutional framework, Benjamin Brafman's jury psychology methodology (DSK, Martin Shkreli), and Martin Weinberg's RICO dismantling approach to help you understand complex charges and evaluate every strategic decision.",
    tiers: [
      {
        name: "Case Decoder",
        slug: "case-decoder",
        price: "$197",
        desc: "Plain-English federal process guide. What are the elements of each count? What should your attorney have done by now? Includes Attorney Accountability Score — a 0-100 rating of whether your attorney is on track for your case stage.",
        discovery: false,
        popular: true,
      },
      {
        name: "Intelligence Brief",
        slug: "intelligence-brief",
        price: "$797",
        desc: "Judge sentencing patterns, AUSA profile, guidelines calculation review, cooperation framework. 35-50 targeted questions. Includes Prosecution Case Strength Map — Strong/Moderate/Weak for every element of every charge.",
        discovery: false,
      },
      {
        name: "The X-Ray",
        slug: "x-ray",
        price: "$1,497",
        desc: "Discovery indexing for massive cases. Financial document analysis, witness statement review, timeline reconstruction. 35+ questions. Includes Discovery Health Score and Defense Opportunity Index — your discovery rated for completeness, your defense openings ranked by strength.",
        discovery: true,
        bestValue: true,
      },
      {
        name: "The War Room",
        slug: "war-room",
        price: "$3,497",
        desc: "Full intelligence operation — AUSA dossier, cooperator analysis, sentencing guidelines deep dive, case law package, weekly updates. Includes Evidence Chain Audit and Witness Reliability Rankings — every piece of evidence traced through custody, every witness scored across 7 credibility dimensions.",
        discovery: true,
      },
      {
        name: "The Situation Room",
        slug: "situation-room",
        price: "$9,997",
        desc: "Trial Intelligence Operations — evening debrief + morning prep brief every trial day. Expert credibility research, cooperator background questions, guidelines research. Priority Response Line (2hr during trial prep, 4hr during trial). Requires War Room. Built on Roy Black's preparation standard, Alan Dershowitz's appellate framework, and Barry Berke's precision methodology.",
        discovery: true,
        requiresWarRoom: true,
      },
    ],
  },
];

const faqs = [
  {
    question: "Is this legal advice?",
    answer:
      "No. We provide legal research, case analysis, and questions. Your attorney provides legal advice. We research. You ask.",
  },
  {
    question: "Will this replace my attorney?",
    answer:
      "No. You need an attorney. We help you make sure they're doing their job. Think of us as insurance on your attorney investment.",
  },
  {
    question: "What if my attorney gets mad at my questions?",
    answer:
      "Good attorneys welcome informed clients. If yours gets angry when you ask educated questions, that tells you something important.",
  },
  {
    question: "Can you guarantee my charges get dropped?",
    answer:
      "No. We guarantee deliverables — question counts, timeframes, and thorough analysis. We cannot and do not guarantee case outcomes.",
  },
  {
    question: "What if I already bought a lower tier?",
    answer:
      "100% of what you paid is credited toward the next tier. Buy the Case Decoder for $197, then upgrade to the Intelligence Brief for just $600. No money wasted. Credits are valid for 12 months.",
  },
  {
    question: "How is this different from a second opinion?",
    answer:
      "A second opinion from another attorney costs $1,500+ for one hour. We provide ongoing, documented research with specific questions — at a fraction of the cost.",
  },
];

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

const serviceSchema = {
  "@context": "https://schema.org",
  "@type": "LegalService",
  name: "ImNotAnAttorney Case Review Services",
  description:
    "Legal research and case analysis for criminal defendants. Five tiers from $197 Case Decoder to $9,997 Situation Room.",
  provider: {
    "@type": "Organization",
    name: "ImNotAnAttorney",
    url: "https://imnotanattorney.com",
  },
  serviceType: "Legal Research",
  areaServed: "US",
};

export default function ServicesPage() {
  return (
    <div className="px-4 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }}
      />
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white md:text-5xl">
            Services built for <span className="text-amber-400">your</span>{" "}
            case
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-lg text-zinc-300">
            The defense team your attorney should have built.
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-zinc-400">
            For defendants who read their own discovery. Five tiers of defense
            intelligence. Start at $197 — upgrade anytime with full credit.
          </p>
        </div>

        {/* How pricing works */}
        <div className="mt-16 rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <h2 className="text-lg font-bold text-white">
            Smart defendants don&apos;t just hire an attorney.{" "}
            <span className="text-amber-400">
              They make sure the attorney is working.
            </span>
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            You paid $10K-$100K+ for an attorney. Our services cost a fraction
            of that — to make sure they&apos;re actually earning it.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              { attorney: "$10K", ours: "$197-$1,497", pct: "2-15%" },
              { attorney: "$30K", ours: "$797-$3,497", pct: "3-12%" },
              { attorney: "$100K", ours: "$1,497-$9,997", pct: "1-10%" },
            ].map((row) => (
              <div key={row.attorney} className="rounded-lg bg-zinc-800/50 p-4">
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
              </div>
            ))}
          </div>
        </div>

        {/* Upgrade Credits */}
        <div className="mt-8 rounded-xl border border-amber-500/20 bg-amber-500/5 p-6 text-center">
          <p className="text-sm font-semibold text-amber-400">
            Upgrade Credits: 100% Applied
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            Start with the Case Decoder for $197. If you upgrade later, every
            dollar you paid is credited toward the next tier. No money wasted.
            12-month expiration.
          </p>
        </div>

        {/* Decision Guide */}
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <p className="text-sm font-bold text-amber-400">
              No discovery yet?
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              Start with the{" "}
              <Link href="/checkout?tier=case-decoder" className="text-white underline">
                Case Decoder ($197)
              </Link>{" "}
              or{" "}
              <Link href="/checkout?tier=intelligence-brief" className="text-white underline">
                Intelligence Brief ($797)
              </Link>
              . Both work without discovery documents. Get charge analysis,
              judge intel, and targeted questions for your next attorney meeting.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <p className="text-sm font-bold text-amber-400">
              You have discovery?
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              The{" "}
              <Link href="/checkout?tier=x-ray" className="text-white underline">
                X-Ray ($1,497)
              </Link>{" "}
              is the most thorough starting point. Full discovery analysis —
              every page, every discrepancy, every red flag mapped. 35+
              case-specific questions.
            </p>
          </div>
        </div>

        {/* Case Types */}
        {caseTypes.map((ct) => (
          <section key={ct.title} className="mt-20">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white md:text-3xl">
                {ct.title}
              </h2>
              <p className="text-sm text-amber-400">{ct.subtitle}</p>
              <p className="mt-2 text-zinc-400">{ct.description}</p>
            </div>

            {/* Tier cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {ct.tiers.slice(0, 3).map((tier) => (
                <div
                  key={tier.name}
                  className={`rounded-xl border p-6 ${
                    tier.popular
                      ? "border-amber-500/50 bg-zinc-900"
                      : "border-zinc-800 bg-zinc-900/50"
                  }`}
                >
                  {tier.popular && (
                    <span className="mb-2 inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400">
                      Best Starting Point
                    </span>
                  )}
                  {(tier as { bestValue?: boolean }).bestValue && (
                    <span className="mb-2 inline-block rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-semibold text-green-400">
                      Best Value
                    </span>
                  )}
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-semibold text-white">{tier.name}</h3>
                    <span className="text-lg font-bold text-amber-400">
                      {tier.price}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-400">{tier.desc}</p>
                  {tier.discovery && (
                    <p className="mt-2 text-xs text-zinc-400">
                      Requires discovery documents
                    </p>
                  )}
                  <Link
                    href={`/checkout?tier=${tier.slug}`}
                    className={`mt-4 block rounded-lg py-2 text-center text-sm font-semibold transition-colors ${
                      tier.popular
                        ? "bg-amber-500 text-black hover:bg-amber-400"
                        : "border border-zinc-700 text-white hover:border-zinc-500"
                    }`}
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

            {/* Premium tiers */}
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {ct.tiers.slice(3).map((tier) => (
                <div
                  key={tier.name}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6"
                >
                  {(tier as { requiresWarRoom?: boolean }).requiresWarRoom && (
                    <span className="mb-2 inline-block rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-semibold text-zinc-300">
                      Requires War Room
                    </span>
                  )}
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-semibold text-white">{tier.name}</h3>
                    <span className="text-lg font-bold text-amber-400">
                      {tier.price}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-400">{tier.desc}</p>
                  {tier.discovery && (
                    <p className="mt-2 text-xs text-zinc-400">
                      Requires discovery documents
                    </p>
                  )}
                  <Link
                    href={`/checkout?tier=${tier.slug}`}
                    className="mt-4 block rounded-lg border border-zinc-700 py-2 text-center text-sm font-semibold text-white transition-colors hover:border-zinc-500"
                  >
                    Get {tier.name}
                  </Link>
                </div>
              ))}
            </div>
          </section>
        ))}

        {/* Guarantee */}
        <section className="mt-20 rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <h2 className="text-2xl font-bold text-white">
            Our Guarantee
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-zinc-300">
            Delivery Guarantee: If we miss the stated deadline or question count
            — full cash refund, no questions asked. Satisfaction Guarantee: Not
            satisfied after delivery? 100% credit toward any higher tier within
            30 days.
          </p>
          <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-400">
            Upgrade credits apply to purchases you keep.
          </p>
          <div className="mx-auto mt-6 max-w-2xl text-left">
            <div className="space-y-2 text-sm text-zinc-400">
              <p>
                <span className="font-semibold text-white">Case Decoder ($197):</span>{" "}
                Delivered within 24 hours. 10+ targeted questions from your case details.
              </p>
              <p>
                <span className="font-semibold text-white">
                  Intelligence Brief ($797):
                </span>{" "}
                Delivered within 72 hours. 35+ targeted questions with judge intelligence.
              </p>
              <p>
                <span className="font-semibold text-white">The X-Ray ($1,497):</span>{" "}
                Delivered within 10 business days. Full discovery analysis with 35+ questions.
              </p>
              <p>
                <span className="font-semibold text-white">
                  The War Room ($3,497):
                </span>{" "}
                Initial package within 28 business days. Weekly updates thereafter.
              </p>
              <p>
                <span className="font-semibold text-white">
                  The Situation Room ($9,997):
                </span>{" "}
                Priority 24-48hr turnaround. Trial Intelligence Operations — evening debrief + morning prep brief every trial day.
              </p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-20">
          <h2 className="mb-8 text-center text-2xl font-bold text-white">
            Frequently Asked Questions
          </h2>
          <FAQAccordion items={faqs} />
        </section>

        {/* Lead Capture */}
        <div className="mt-16">
          <LeadCapture />
        </div>
      </div>
    </div>
  );
}

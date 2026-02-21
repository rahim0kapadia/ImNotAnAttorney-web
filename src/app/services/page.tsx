import { FAQAccordion } from "@/components/FAQAccordion";
import { LeadCapture } from "@/components/LeadCapture";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Case-specific research and question reports for criminal defendants. Five tiers from $97 Case Decoder to $4,997 Situation Room. DUI, drug cases, white collar, and federal defense.",
  alternates: {
    canonical: "https://imnotanattorney.com/services",
  },
};

const caseTypes = [
  {
    title: "Drug Cases",
    subtitle: "Possession, trafficking, distribution",
    description:
      "We analyze your case for weight discrepancies, CI reliability issues, chain of custody gaps, and every motion your attorney should be filing.",
    tiers: [
      {
        name: "Case Decoder",
        slug: "case-decoder",
        price: "$97",
        desc: "Plain-English charge breakdown + 10-15 drug-case questions. Which motions apply to your charges? What should have happened by now?",
        discovery: false,
      },
      {
        name: "Intelligence Brief",
        slug: "intelligence-brief",
        price: "$497",
        desc: "Judge intelligence for drug cases. How does your judge rule on suppression? What's the local plea pattern? 35-50 targeted questions.",
        discovery: false,
        popular: true,
      },
      {
        name: "The X-Ray",
        slug: "x-ray",
        price: "$997",
        desc: "Full discovery analysis — weight discrepancies, lab methodology gaps, CI reliability, chain of custody. 20+ case-specific questions.",
        discovery: true,
      },
      {
        name: "The War Room",
        slug: "war-room",
        price: "$1,997",
        desc: "Everything above + officer dossiers, witness analysis (up to 8), motion wave strategy, case law package, weekly updates.",
        discovery: true,
      },
      {
        name: "The Situation Room",
        slug: "situation-room",
        price: "$4,997",
        desc: "Full trial prep — witness background research, CI credibility questions, lab expert credibility research, reply brief research, real-time trial support.",
        discovery: true,
      },
    ],
  },
  {
    title: "DUI / DWI",
    subtitle: "First offense through felony DUI",
    description:
      "From breathalyzer calibration records to field sobriety test compliance — we find the questions your attorney should already be asking.",
    tiers: [
      {
        name: "Case Decoder",
        slug: "case-decoder",
        price: "$97",
        desc: "Your DUI charges explained in plain English. What to expect at each stage. 10-15 questions your attorney needs to answer.",
        discovery: false,
      },
      {
        name: "Intelligence Brief",
        slug: "intelligence-brief",
        price: "$497",
        desc: "Your judge's DUI sentencing patterns, local diversion programs, DMV hearing strategy. 35-50 targeted questions.",
        discovery: false,
        popular: true,
      },
      {
        name: "The X-Ray",
        slug: "x-ray",
        price: "$997",
        desc: "Full discovery analysis — BAC evidence, breathalyzer calibration, dashcam review, field sobriety compliance. 20+ questions.",
        discovery: true,
      },
      {
        name: "The War Room",
        slug: "war-room",
        price: "$1,997",
        desc: "Officer dossiers, expert witness challenges, motion wave strategy, case law package, weekly updates until resolution.",
        discovery: true,
      },
      {
        name: "The Situation Room",
        slug: "situation-room",
        price: "$4,997",
        desc: "Full trial prep — officer background research, expert credibility questions, jury selection research, real-time trial support.",
        discovery: true,
      },
    ],
  },
  {
    title: "White Collar",
    subtitle: "Fraud, embezzlement, federal charges",
    description:
      "Federal cases are a different game. We help you understand complex charges, organize overwhelming discovery, and evaluate the cooperation decision.",
    tiers: [
      {
        name: "Case Decoder",
        slug: "case-decoder",
        price: "$97",
        desc: "Plain-English federal process guide. What are the elements of each count? What should your attorney have done by now?",
        discovery: false,
      },
      {
        name: "Intelligence Brief",
        slug: "intelligence-brief",
        price: "$497",
        desc: "Judge sentencing patterns, AUSA profile, guidelines calculation review, cooperation framework. 35-50 targeted questions.",
        discovery: false,
        popular: true,
      },
      {
        name: "The X-Ray",
        slug: "x-ray",
        price: "$997",
        desc: "Discovery indexing for massive cases. Financial document analysis, witness statement review, timeline reconstruction. 20+ questions.",
        discovery: true,
      },
      {
        name: "The War Room",
        slug: "war-room",
        price: "$1,997",
        desc: "Full intelligence operation — AUSA dossier, cooperator analysis, sentencing guidelines deep dive, case law package, weekly updates.",
        discovery: true,
      },
      {
        name: "The Situation Room",
        slug: "situation-room",
        price: "$4,997",
        desc: "Complete trial prep + sentencing prep. Expert credibility research, cooperator background questions, guidelines research, real-time support.",
        discovery: true,
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
      "100% of what you paid is credited toward the next tier. Buy the Case Decoder for $97, then upgrade to the Intelligence Brief for just $400. No money wasted. Credits are valid for 12 months.",
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
  "@type": "Service",
  name: "ImNotAnAttorney Case Review Services",
  description:
    "Legal research and case analysis for criminal defendants. Five tiers from $97 Case Decoder to $4,997 Situation Room.",
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
          <p className="mx-auto mt-4 max-w-2xl text-zinc-400">
            Five tiers of defense intelligence. Start at $97 — upgrade anytime
            with full credit toward the next tier.
          </p>
        </div>

        {/* How pricing works */}
        <div className="mt-16 rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <h2 className="text-lg font-bold text-white">
            We&apos;re insurance on your attorney investment
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            You paid $10K-$100K+ for an attorney. Our services cost a fraction
            of that — to make sure they&apos;re actually earning it.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              { attorney: "$10K", ours: "$97-$997", pct: "1-10%" },
              { attorney: "$30K", ours: "$497-$1,997", pct: "2-7%" },
              { attorney: "$100K", ours: "$997-$4,997", pct: "1-5%" },
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
            Start with the Case Decoder for $97. If you upgrade later, every
            dollar you paid is credited toward the next tier. No money wasted.
            12-month expiration.
          </p>
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
                      Most Popular
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
                    <p className="mt-2 text-xs text-zinc-500">
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
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-semibold text-white">{tier.name}</h3>
                    <span className="text-lg font-bold text-amber-400">
                      {tier.price}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-400">{tier.desc}</p>
                  {tier.discovery && (
                    <p className="mt-2 text-xs text-zinc-500">
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
            Deliverable Guarantee
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-zinc-400">
            Every question, every report, on time — or your money back. We
            guarantee the work — not the outcome.
          </p>
          <div className="mx-auto mt-6 max-w-2xl text-left">
            <div className="space-y-2 text-sm text-zinc-400">
              <p>
                <span className="font-semibold text-white">Case Decoder:</span>{" "}
                Delivered within 24 hours with 10+ targeted questions.
              </p>
              <p>
                <span className="font-semibold text-white">
                  Intelligence Brief:
                </span>{" "}
                Delivered within 72 hours with 35+ targeted questions.
              </p>
              <p>
                <span className="font-semibold text-white">The X-Ray:</span>{" "}
                Delivered within 7 business days with 20+ case-specific
                questions.
              </p>
              <p>
                <span className="font-semibold text-white">
                  The War Room:
                </span>{" "}
                Initial package within 28 business days. Weekly updates
                thereafter.
              </p>
              <p>
                <span className="font-semibold text-white">
                  The Situation Room:
                </span>{" "}
                Priority 24-48hr turnaround per stage. Trial-ready.
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

import { FAQAccordion } from "@/components/FAQAccordion";
import { LeadCapture } from "@/components/LeadCapture";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Case-specific research and question reports for criminal defendants. DUI, drug cases, and white collar defense awareness packages.",
};

const caseTypes = [
  {
    title: "Drug Cases",
    subtitle: "Possession, trafficking, distribution",
    description:
      "We analyze your discovery for weight discrepancies, CI reliability issues, chain of custody gaps, and every motion your attorney should be filing.",
    services: [
      { name: "Question Pack", price: "$49", desc: "75+ drug-case-specific questions" },
      { name: "Discovery Review", price: "$497", desc: "Full discovery analysis + 50+ case-specific questions", popular: true },
      { name: "Motion Awareness", price: "$297", desc: "Which motions apply to YOUR charges" },
      { name: "Lab Methodology Review", price: "$297", desc: "Weight calculations, testing questions" },
      { name: "CI Reliability Package", price: "$397", desc: "Confidential informant challenges" },
      { name: "Witness Analysis", price: "$397", desc: "Statement inconsistencies + cross-exam questions" },
    ],
    bundle: { name: "Full Drug Case Package", price: "$1,497", savings: "Save $440" },
    war: { name: "War Room", price: "$4,997", desc: "Everything + ongoing weekly support" },
  },
  {
    title: "DUI / DWI",
    subtitle: "First offense through felony DUI",
    description:
      "From breathalyzer calibration records to field sobriety test compliance — we find the questions your attorney should already be asking.",
    services: [
      { name: "DUI Question Pack", price: "$29", desc: "50+ DUI-specific questions" },
      { name: "First Court Date Prep", price: "$47", desc: "What to expect + what to ask" },
      { name: "DMV Hearing Guide", price: "$97", desc: "Fight your license suspension" },
      { name: "Discovery Review", price: "$297", desc: "Police report, BAC evidence, dashcam analysis", popular: true },
      { name: "Plea Deal Evaluation", price: "$197", desc: "Is the offer good or are you getting screwed?" },
      { name: "Breathalyzer/Blood Analysis", price: "$247", desc: "Calibration, chain of custody, lab questions" },
    ],
    bundle: { name: "Full DUI Package", price: "$897", savings: "Save $200+" },
    war: null,
  },
  {
    title: "White Collar",
    subtitle: "Fraud, embezzlement, federal charges",
    description:
      "Federal cases are a different game. We help you understand complex charges, organize overwhelming discovery, and evaluate the cooperation decision.",
    services: [
      { name: "Federal Process Guide", price: "$97", desc: "Plain-English federal process explanation" },
      { name: "Charge Analysis", price: "$497", desc: "Every count explained + sentencing exposure" },
      { name: "Document Organization", price: "$997", desc: "Discovery indexing for massive cases", popular: true },
      { name: "Cooperation Analysis", price: "$497", desc: "Framework for the biggest decision you'll make" },
      { name: "Sentencing Guidelines Review", price: "$497", desc: "Understand your actual exposure" },
      { name: "Trial Prep Questions", price: "$997", desc: "Cross-exam questions by witness" },
    ],
    bundle: { name: "Full White Collar Package", price: "$4,997", savings: "Save $800+" },
    war: { name: "Executive War Room", price: "$9,997", desc: "Everything + ongoing support + sentencing prep" },
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
    question: "What if you don't find anything wrong?",
    answer:
      "We've never reviewed a case and found nothing. But if we truly find zero issues, we'll tell you — that's valuable information too.",
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
  description: "Legal research and case analysis for criminal defendants. Discovery review, motion identification, and attorney accountability question reports.",
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }} />
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white md:text-5xl">
            Services built for <span className="text-amber-400">your</span>{" "}
            case
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-zinc-400">
            Buy what you need. Skip what you don&apos;t. Every service delivers
            a written report with specific questions for your attorney.
          </p>
        </div>

        {/* How pricing works */}
        <div className="mt-16 rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <h2 className="text-lg font-bold text-white">
            We&apos;re insurance on your attorney investment
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            You paid $10K–$100K+ for an attorney. Our services cost 5–10% of
            that — to make sure they&apos;re actually earning it.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              { attorney: "$10K", ours: "$497", pct: "5%" },
              { attorney: "$30K", ours: "$1,497", pct: "5%" },
              { attorney: "$100K", ours: "$4,997", pct: "5%" },
            ].map((row) => (
              <div key={row.attorney} className="rounded-lg bg-zinc-800/50 p-4">
                <div className="text-xs text-zinc-500">You paid attorney</div>
                <div className="text-lg font-bold text-white">
                  {row.attorney}
                </div>
                <div className="mt-2 text-xs text-zinc-500">Our service</div>
                <div className="text-lg font-bold text-amber-400">
                  {row.ours}
                </div>
                <div className="mt-1 text-xs text-zinc-600">{row.pct} of your investment</div>
              </div>
            ))}
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

            {/* À la carte */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {ct.services.map((svc) => (
                <div
                  key={svc.name}
                  className={`rounded-xl border p-6 ${
                    svc.popular
                      ? "border-amber-500/50 bg-zinc-900"
                      : "border-zinc-800 bg-zinc-900/50"
                  }`}
                >
                  {svc.popular && (
                    <span className="mb-2 inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400">
                      Most Popular
                    </span>
                  )}
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-semibold text-white">{svc.name}</h3>
                    <span className="text-lg font-bold text-amber-400">
                      {svc.price}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-400">{svc.desc}</p>
                </div>
              ))}
            </div>

            {/* Bundles */}
            <div className="mt-6 flex flex-col gap-4 md:flex-row">
              <div className="flex-1 rounded-xl border border-amber-500 bg-zinc-900 p-6">
                <span className="inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400">
                  {ct.bundle.savings}
                </span>
                <h3 className="mt-2 text-lg font-bold text-white">
                  {ct.bundle.name}
                </h3>
                <div className="mt-1 text-2xl font-bold text-amber-400">
                  {ct.bundle.price}
                </div>
                <p className="mt-2 text-sm text-zinc-400">
                  Everything above, bundled with priority processing.
                </p>
                <Link
                  href="/intake"
                  className="mt-4 inline-block rounded-lg bg-amber-500 px-6 py-2 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
                >
                  Get Started
                </Link>
              </div>
              {ct.war && (
                <div className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900/50 p-6">
                  <h3 className="text-lg font-bold text-white">
                    {ct.war.name}
                  </h3>
                  <div className="mt-1 text-2xl font-bold text-white">
                    {ct.war.price}
                  </div>
                  <p className="mt-2 text-sm text-zinc-400">{ct.war.desc}</p>
                  <Link
                    href="/intake"
                    className="mt-4 inline-block rounded-lg border border-zinc-600 px-6 py-2 text-sm font-semibold text-white transition-colors hover:border-zinc-400"
                  >
                    Contact Us
                  </Link>
                </div>
              )}
            </div>
          </section>
        ))}

        {/* Guarantee */}
        <section className="mt-20 rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <h2 className="text-2xl font-bold text-white">Our Guarantee</h2>
          <p className="mx-auto mt-4 max-w-xl text-zinc-400">
            Minimum question counts. Delivered on time. If we don&apos;t hit
            our stated deliverables, you get a full refund. We guarantee the
            work — not the outcome.
          </p>
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

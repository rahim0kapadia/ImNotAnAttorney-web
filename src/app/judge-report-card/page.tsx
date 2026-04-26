/**
 * Judge Question Brief landing page (/judge-report-card)
 *
 * URL slug intentionally retained for SEO equity (renamed
 * "Judge Report Card" → "Judge Question Brief" 2026-04-26 per
 * docs/plans/2026-04-26-d1-judge-question-brief-rename.md).
 *
 * Standalone Tier 9 data product, $197, instant delivery.
 * Presents verified judge sentencing data from Tier 9 tables,
 * framed as questions to bring to your attorney — preparation,
 * not prediction.
 * Server component, no client-side interactivity needed.
 */
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { TIER_CORE } from "@/lib/tiers";
import { TrustBadges } from "@/components/TrustBadges";
import { FAQAccordion } from "@/components/FAQAccordion";
import { FadeInUp } from "@/components/motion/FadeInUp";
import AvailabilityChecker from "@/components/tier9/AvailabilityChecker";

export function generateMetadata(): Metadata {
  return {
    title: `Judge Question Brief, ${TIER_CORE["judge-report-card"].priceDisplay} | ImNotAnAttorney`,
    description:
      "Questions worth asking your attorney about your judge — sentencing patterns, prosecutor pairing data, bench vs jury divergence, and quote library. Every data point sourced from verified court records.",
    alternates: { canonical: `${SITE_URL}/judge-report-card` },
    openGraph: {
      title: "Judge Question Brief, Questions To Ask About Your Judge",
      description:
        "Questions worth asking about sentencing patterns, prosecutor pairing data, and bench vs jury divergence. Verified court records with source URLs.",
      url: `${SITE_URL}/judge-report-card`,
    },
  };
}

const FAQ_ITEMS = [
  {
    question: "What's in the Judge Question Brief?",
    answer:
      "Questions your attorney should be able to answer about your judge \u2014 drawn from judge background (appointing president, ABA Standing Committee evaluation, law school), sentencing patterns across 595,851 federal cases, demographic sentencing analysis, prosecutor pairing data, bench vs jury divergence, direct quotes from court opinions, and appellate trends. Every data point includes a source URL you can verify independently.",
  },
  {
    question: "Where does the data come from?",
    answer:
      "Federal court data from JUSTFAIR (QSIDE Institute) covering 595,851 sentencing records. State court data from CourtListener. We do not generate or estimate data \u2014 every metric traces to a specific court record.",
  },
  {
    question: "Is this legal advice?",
    answer:
      "No. This is legal INFORMATION \u2014 verified court data compiled into questions worth asking your attorney. Decisions about how to use this information stay with you and your attorney.",
  },
  {
    question: "How is it delivered?",
    answer:
      "On purchase. The report is generated on demand from our verified database and sent to your inbox.",
  },
  {
    question: "What if my judge isn\u2019t in the database?",
    answer:
      "If we don\u2019t have sufficient data for your specific judge, you\u2019ll see that before checkout \u2014 we won\u2019t charge you for data we don\u2019t have. You can join our waitlist and we\u2019ll notify you when coverage is available.",
  },
  {
    question: "Will my attorney be upset that I looked this up?",
    answer:
      "Good defense attorneys welcome prepared clients. This data helps you have a more productive conversation with your attorney \u2014 it\u2019s the same type of information attorneys research themselves. Showing up informed is a sign of engagement, not distrust.",
  },
];

const CHECK_ITEMS = [
  "Questions to ask about your judge\u2019s background \u2014 appointing president, ABA review, law school",
  "Questions to ask about your judge\u2019s documented sentencing patterns (data: 595,851 federal cases)",
  "Questions to ask about defendant demographic sentencing analysis",
  "Questions to ask about prosecutor pairing \u2014 how your judge has ruled on your prosecutor\u2019s motions",
  "Questions to ask about bench vs jury trial divergence in your judge\u2019s record",
  "Direct judge quotes from verified court opinions, framed as conversation prompts for your attorney",
  "Questions to ask about appellate trends in your circuit",
  "Every data point linked to its source URL so you can verify it yourself",
];

function CheckIcon() {
  return (
    <svg
      className="mt-0.5 h-5 w-5 shrink-0 text-amber-400"
      aria-hidden="true"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

export default function JudgeReportCardPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      {/* ── HERO ── */}
      <FadeInUp>
        <section aria-labelledby="hero-heading" className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
            Data-Driven Defense Intelligence
          </p>
          <p className="mb-6 text-base leading-relaxed text-zinc-400">
            You&rsquo;re about to stand in front of someone who will decide your
            future. The prosecutor has appeared before this judge dozens of
            times. Your attorney may have too. You&rsquo;re the only one in that
            room who doesn&rsquo;t know what to expect.
          </p>
          <h1
            id="hero-heading"
            className="font-display mt-4 text-4xl font-extrabold leading-tight text-white sm:text-5xl"
          >
            Know Your Judge Before Your First Hearing
          </h1>
          <p className="mt-4 text-lg text-zinc-400">
            Every judge has patterns. The prosecutor knows them. Now you will
            too.
          </p>
          <p className="mt-6 text-base text-zinc-300 italic">
            This is not a prediction. This is a list of questions your attorney
            should be able to answer about your judge.
          </p>
          <p className="mt-6 text-4xl font-extrabold text-amber-400">{TIER_CORE["judge-report-card"].priceDisplay}</p>
          <p className="mt-2 text-sm text-zinc-400">
            Less than one hour of your attorney&rsquo;s time &mdash; for data
            your attorney may not have.
          </p>
          <p className="mt-2 text-sm text-zinc-300">
            Based on verified court records with source URLs
          </p>
          <div id="availability" className="mt-6 scroll-mt-24">
            <AvailabilityChecker
              slug="judge-report-card"
              productName="Judge Question Brief"
              priceDisplay={TIER_CORE["judge-report-card"].priceDisplay}
            />
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            Generated on demand from verified court records. Delivered on
            purchase.
          </p>
        </section>
      </FadeInUp>

      {/* ── WHAT YOU GET ── */}
      <FadeInUp>
        <section aria-labelledby="what-you-get-heading" className="mt-20">
          <h2
            id="what-you-get-heading"
            className="font-display text-2xl font-bold text-white"
          >
            What You Get
          </h2>
          <ul className="mt-8 space-y-4">
            {CHECK_ITEMS.map((item) => (
              <li key={item} className="flex items-start gap-3 text-zinc-200">
                <CheckIcon />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      </FadeInUp>

      {/* ── SAMPLE REPORT ── */}
      <FadeInUp>
        <section aria-labelledby="sample-report-heading" className="mt-20">
          <h2
            id="sample-report-heading"
            className="font-display text-2xl font-bold text-white"
          >
            Sample Brief Preview
          </h2>

          {/* Accessible data table */}
          <div className="mt-8 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="mb-4 text-left text-base font-semibold text-zinc-300">
                Sample sentencing data &mdash; Judge Sarah Martinez, DUI cases
              </caption>
              <thead>
                <tr className="border-b border-zinc-700">
                  <th
                    scope="col"
                    className="px-4 py-3 font-semibold text-zinc-200"
                  >
                    Metric
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 font-semibold text-zinc-200"
                  >
                    Value
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 font-semibold text-zinc-200"
                  >
                    Source
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                <tr>
                  <th
                    scope="row"
                    className="px-4 py-3 font-normal text-zinc-300"
                  >
                    Median sentence (DUI 1st)
                  </th>
                  <td className="px-4 py-3 text-zinc-400">
                    12 months probation
                  </td>
                  <td className="px-4 py-3 text-zinc-400">CourtListener</td>
                </tr>
                <tr>
                  <th
                    scope="row"
                    className="px-4 py-3 font-normal text-zinc-300"
                  >
                    Deviation from county median
                  </th>
                  <td className="px-4 py-3 text-zinc-400">
                    +1.3&sigma; (above)
                  </td>
                  <td className="px-4 py-3 text-zinc-400">CourtListener</td>
                </tr>
                <tr>
                  <th
                    scope="row"
                    className="px-4 py-3 font-normal text-zinc-300"
                  >
                    Bench trial acquittal rate
                  </th>
                  <td className="px-4 py-3 text-zinc-400">
                    See data; bring to your attorney
                  </td>
                  <td className="px-4 py-3 text-zinc-400">CourtListener</td>
                </tr>
                <tr>
                  <th
                    scope="row"
                    className="px-4 py-3 font-normal text-zinc-300"
                  >
                    Motion grant rate (suppression)
                  </th>
                  <td className="px-4 py-3 text-zinc-400">Moderate</td>
                  <td className="px-4 py-3 text-zinc-400">CourtListener</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </FadeInUp>

      {/* ── TRUST ── */}
      <FadeInUp>
        <section aria-labelledby="trust-heading" className="mt-20">
          <h2
            id="trust-heading"
            className="font-display text-2xl font-bold text-white"
          >
            Verified Data You Can Check Yourself
          </h2>
          <p className="mt-4 text-zinc-400">
            Every data point has a source URL. Click any row to verify against
            CourtListener.
          </p>
          <p className="mt-3 text-sm text-zinc-400">
            Sentencing analysis methodology informed by the Sentencing
            Commission&rsquo;s published guidelines data and
            CourtListener&rsquo;s open court records API. Every metric is
            computed from verified judicial records &mdash; not estimated, not
            fabricated.
          </p>
          <div className="mt-6">
            <TrustBadges variant="pricing" />
          </div>
        </section>
      </FadeInUp>

      {/* ── FAQ ── */}
      <section aria-labelledby="faq-heading" className="mt-20">
        <h2
          id="faq-heading"
          className="font-display text-2xl font-bold text-white"
        >
          Frequently Asked Questions
        </h2>
        <div className="mt-8">
          <FAQAccordion items={FAQ_ITEMS} />
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <FadeInUp>
        <section aria-labelledby="cta-heading" className="mt-20 text-center">
          <h2
            id="cta-heading"
            className="font-display text-2xl font-bold text-white"
          >
            Stop Walking Into Court Blind
          </h2>
          <p className="mt-4 text-zinc-400">
            Most defendants walk into court hoping their attorney knows the
            judge. Defendants who prepare walk in with the data. The prosecutor
            already has it &mdash; now you will too.
          </p>
          <div className="mt-6">
            <AvailabilityChecker
              slug="judge-report-card"
              productName="Judge Question Brief"
              priceDisplay={TIER_CORE["judge-report-card"].priceDisplay}
            />
          </div>
          <p className="mt-4 text-sm text-zinc-400">
            This brief provides legal INFORMATION &mdash; not legal ADVICE.
          </p>
          <p className="mt-3 text-sm text-zinc-400">
            Questions before you buy?{" "}
            <a
              href="mailto:help@imnotanattorney.com"
              className="text-amber-400 underline decoration-amber-400/50 hover:decoration-amber-400"
            >
              help@imnotanattorney.com
            </a>
            {" "}&mdash; a defendant-side researcher replies, not a bot.
          </p>
          <div className="mt-4">
            <TrustBadges variant="compact" />
          </div>
        </section>
      </FadeInUp>

      {/* ── JSON-LD: Product ── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: "Judge Question Brief",
            description:
              "Questions worth asking your attorney about your judge — sourced from verified sentencing patterns, prosecutor pairing data, bench vs jury divergence, and quote library in court records.",
            url: `${SITE_URL}/judge-report-card`,
            brand: {
              "@type": "Organization",
              "@id": "https://imnotanattorney.com/#organization",
            },
            offers: {
              "@type": "Offer",
              price: "197.00",
              priceCurrency: "USD",
              availability: "https://schema.org/InStock",
              url: `${SITE_URL}/checkout?standaloneProduct=judge-report-card`,
            },
          }),
        }}
      />

      {/* ── JSON-LD: BreadcrumbList ── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Home",
                item: SITE_URL,
              },
              {
                "@type": "ListItem",
                position: 2,
                name: "Judge Question Brief",
                item: `${SITE_URL}/judge-report-card`,
              },
            ],
          }),
        }}
      />

      {/* ── JSON-LD: FAQPage ── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ_ITEMS.map((faq) => ({
              "@type": "Question",
              name: faq.question,
              acceptedAnswer: {
                "@type": "Answer",
                text: faq.answer,
              },
            })),
          }),
        }}
      />
    </div>
  );
}

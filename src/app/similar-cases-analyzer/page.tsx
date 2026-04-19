/**
 * Similar Cases Analyzer landing page (/similar-cases-analyzer)
 *
 * Standalone Tier 9 data product, $297, instant delivery.
 * Presents factually similar case matching from Tier 9 tables.
 * Server component, AvailabilityChecker is a client island.
 */
import type { Metadata } from "next";
import { TrustBadges } from "@/components/TrustBadges";
import { FAQAccordion } from "@/components/FAQAccordion";
import { FadeInUp } from "@/components/motion/FadeInUp";
import { SITE_URL } from "@/lib/site";
import { TIER_CORE } from "@/lib/tiers";
import AvailabilityChecker from "@/components/tier9/AvailabilityChecker";

/* ---------- Metadata ---------- */

export function generateMetadata(): Metadata {
  return {
    title: `Similar Cases Analyzer, ${TIER_CORE["similar-cases-analyzer"].priceDisplay} | ImNotAnAttorney`,
    description:
      "Find cases with facts like yours and see what happened. Factually similar case matching with outcome probabilities from verified court records.",
    alternates: { canonical: `${SITE_URL}/similar-cases-analyzer` },
    openGraph: {
      title: "Similar Cases Analyzer, See What Happened in Cases Like Yours",
      description:
        "Factually similar case matching with outcome data. Every case includes a source URL.",
      url: `${SITE_URL}/similar-cases-analyzer`,
    },
  };
}

/* ---------- FAQ Data ---------- */

const faqItems = [
  {
    question: "How does the case matching work?",
    answer:
      "We match cases using charge type, jurisdiction, evidence type, defendant circumstances, and procedural history, finding the cases most factually similar to yours from verified court records.",
  },
  {
    question: "Where does the data come from?",
    answer:
      "Verified public court records via CourtListener and official court databases. Every matched case includes a direct link to the source record.",
  },
  {
    question: "Are the outcomes predictions?",
    answer:
      "No. These are actual outcomes from real cases with similar facts. They show what HAS happened, not what WILL happen. Every case is unique, and your attorney\u2019s strategy is what determines your outcome.",
  },
  {
    question: "Is this legal advice?",
    answer:
      "No. This is legal INFORMATION, verified court data compiled for your review. Your attorney remains the final authority on strategy decisions.",
  },
  {
    question: "How fast do I get it?",
    answer:
      "Within 60 seconds of purchase. The analysis runs on demand against our verified database.",
  },
  {
    question: "What if there aren\u2019t enough similar cases?",
    answer:
      "If we can\u2019t find at least 5 factually similar cases, you\u2019ll see that before checkout \u2014 we won\u2019t charge you for data we don\u2019t have. You can join our waitlist and we\u2019ll notify you when coverage is available.",
  },
  {
    question: "Will my attorney be upset that I looked this up?",
    answer:
      "Good defense attorneys welcome prepared clients. Knowing what happened in similar cases gives you and your attorney a shared starting point for strategy discussions. Showing up with data is a sign of engagement, not distrust.",
  },
];

/* ---------- JSON-LD ---------- */

const breadcrumbLd = {
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
      name: "Services",
      item: `${SITE_URL}/services`,
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "Similar Cases Analyzer",
      item: `${SITE_URL}/similar-cases-analyzer`,
    },
  ],
};

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqItems.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};

/* ---------- Checkmark SVG ---------- */

function Checkmark() {
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

/* ---------- Page ---------- */

export default function SimilarCasesAnalyzerPage() {
  return (
    <>
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: "Similar Cases Analyzer",
            description:
              "Factually similar case matching with outcome data from verified court records.",
            url: `${SITE_URL}/similar-cases-analyzer`,
            brand: {
              "@type": "Organization",
              "@id": "https://imnotanattorney.com/#organization",
            },
            offers: {
              "@type": "Offer",
              price: "297.00",
              priceCurrency: "USD",
              availability: "https://schema.org/InStock",
              url: `${SITE_URL}/checkout?standaloneProduct=similar-cases-analyzer`,
            },
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbLd),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqLd),
        }}
      />

      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        {/* ── Hero ── */}
        <section aria-labelledby="hero-heading">
          <FadeInUp>
            <p className="text-sm font-semibold uppercase tracking-wider text-amber-400">
              Data-Driven Defense Intelligence
            </p>
            <p className="mb-6 text-base leading-relaxed text-zinc-400">
              The hardest part isn&rsquo;t not knowing what will happen. It&rsquo;s not knowing what COULD happen &mdash; because nobody shows you what happened to people in your situation. The prosecutor has seen hundreds of cases like yours. You&rsquo;ve seen one: yours.
            </p>
            <h1
              id="hero-heading"
              className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl"
            >
              See What Happened in Cases Like Yours
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-zinc-300">
              Every case is unique. But patterns exist. Find the cases most
              similar to yours and see how they resolved, from verified court
              records.
            </p>
            <p className="mt-6 text-3xl font-bold text-amber-400">{TIER_CORE["similar-cases-analyzer"].priceDisplay}</p>
            <p className="mt-2 text-sm text-zinc-400">
              Your attorney charges more per hour than this costs &mdash; and this is data they&rsquo;d need weeks to compile.
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              Factually similar case matching from verified court records
            </p>
            <div className="mt-8">
              <AvailabilityChecker
                slug="similar-cases-analyzer"
                productName="Similar Cases Analyzer"
                priceDisplay={TIER_CORE["similar-cases-analyzer"].priceDisplay}
              />
            </div>
          </FadeInUp>
        </section>

        {/* ── What You Get ── */}
        <section aria-labelledby="what-you-get-heading" className="mt-20">
          <FadeInUp>
            <h2
              id="what-you-get-heading"
              className="font-display text-2xl font-bold text-white"
            >
              What You Get
            </h2>
            <ul className="mt-6 space-y-4">
              {[
                "Factually similar case matching based on your charge and circumstances",
                "Outcome distribution across matched cases (acquittal, dismissal, plea, conviction)",
                "Case similarity scores showing how close each match is to your facts",
                "Motion patterns observed in matched cases",
                "Sentencing ranges grounded in 595,851 federal sentencing records (JUSTFAIR/USSC)",
                "Defense approaches observed in matched cases and their outcomes",
                "National outcome benchmarks from the Bureau of Justice Statistics",
                "Every matched case linked to its source URL",
              ].map((item) => (
                <li key={item} className="flex gap-3 text-zinc-200">
                  <Checkmark />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </FadeInUp>
        </section>

        {/* ── Sample Report ── */}
        <section aria-labelledby="sample-report-heading" className="mt-20">
          <FadeInUp>
            <h2
              id="sample-report-heading"
              className="font-display text-2xl font-bold text-white"
            >
              Sample Report
            </h2>

            {/* Accessible data table */}
            <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-700">
              <table className="w-full text-left text-sm">
                <caption className="bg-zinc-900 px-4 py-3 text-left text-xs font-medium text-zinc-400">
                  Sample similar case matches, DUI 1st offense, Pinellas County
                </caption>
                <thead>
                  <tr className="border-b border-zinc-700 bg-zinc-900/80">
                    <th
                      scope="col"
                      className="px-4 py-3 font-semibold text-zinc-200"
                    >
                      Case
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 font-semibold text-zinc-200"
                    >
                      Similarity
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 font-semibold text-zinc-200"
                    >
                      Outcome
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 font-semibold text-zinc-200"
                    >
                      Key Factor
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 font-semibold text-zinc-200"
                    >
                      Source (in report)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  <tr>
                    <th
                      scope="row"
                      className="whitespace-nowrap px-4 py-3 font-medium text-zinc-300"
                    >
                      Case A (2024)
                    </th>
                    <td className="px-4 py-3 text-zinc-400">0.92</td>
                    <td className="px-4 py-3 text-zinc-400">Dismissed</td>
                    <td className="px-4 py-3 text-zinc-400">
                      Calibration failure
                    </td>
                    <td className="px-4 py-3 text-zinc-400">Court record link</td>
                  </tr>
                  <tr>
                    <th
                      scope="row"
                      className="whitespace-nowrap px-4 py-3 font-medium text-zinc-300"
                    >
                      Case B (2023)
                    </th>
                    <td className="px-4 py-3 text-zinc-400">0.87</td>
                    <td className="px-4 py-3 text-zinc-400">Acquittal</td>
                    <td className="px-4 py-3 text-zinc-400">
                      FST procedural error
                    </td>
                    <td className="px-4 py-3 text-zinc-400">Court record link</td>
                  </tr>
                  <tr>
                    <th
                      scope="row"
                      className="whitespace-nowrap px-4 py-3 font-medium text-zinc-300"
                    >
                      Case C (2024)
                    </th>
                    <td className="px-4 py-3 text-zinc-400">0.85</td>
                    <td className="px-4 py-3 text-zinc-400">Reduced charge</td>
                    <td className="px-4 py-3 text-zinc-400">
                      Plea negotiation
                    </td>
                    <td className="px-4 py-3 text-zinc-400">Court record link</td>
                  </tr>
                  <tr>
                    <th
                      scope="row"
                      className="whitespace-nowrap px-4 py-3 font-medium text-zinc-300"
                    >
                      Case D (2023)
                    </th>
                    <td className="px-4 py-3 text-zinc-400">0.81</td>
                    <td className="px-4 py-3 text-zinc-400">Conviction</td>
                    <td className="px-4 py-3 text-zinc-400">
                      BAC + officer testimony
                    </td>
                    <td className="px-4 py-3 text-zinc-400">Court record link</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-zinc-400">
              Sample data shown for illustration. Your report uses verified
              court records specific to your charge and jurisdiction.
            </p>
          </FadeInUp>
        </section>

        {/* ── Trust ── */}
        <section aria-labelledby="trust-heading" className="mt-20">
          <FadeInUp>
            <h2
              id="trust-heading"
              className="font-display text-2xl font-bold text-white"
            >
              Built on Verified Data
            </h2>
            <p className="mt-4 text-zinc-300">
              Every case in your report links directly to a public court record.
              No scraped summaries. No fabricated case names. Verified source
              data from CourtListener, 595,851 federal sentencing records
              (JUSTFAIR/USSC), and BJS national outcome data, so you and
              your attorney can check every match.
            </p>
            <p className="mt-3 text-sm text-zinc-400">
              Case matching built on CourtListener&rsquo;s open court records, cross-referencing charge type, jurisdiction, evidence patterns, and defendant circumstances. Every match is computed from verified judicial records, not estimated or fabricated.
            </p>
            <TrustBadges variant="pricing" />
          </FadeInUp>
        </section>

        {/* ── FAQ ── */}
        <section aria-labelledby="faq-heading" className="mt-20">
          <FadeInUp>
            <h2
              id="faq-heading"
              className="font-display text-2xl font-bold text-white"
            >
              Frequently Asked Questions
            </h2>
            <div className="mt-6">
              <FAQAccordion items={faqItems} />
            </div>
          </FadeInUp>
        </section>

        {/* ── Final CTA ── */}
        <section aria-labelledby="cta-heading" className="mt-20 text-center">
          <FadeInUp>
            <h2
              id="cta-heading"
              className="font-display text-2xl font-bold text-white"
            >
              Get Your Similar Cases Analysis, {TIER_CORE["similar-cases-analyzer"].priceDisplay}
            </h2>
            <p className="mt-4 text-zinc-400">
              Most defendants guess what might happen. Defendants who prepare look at what actually happened. Your prosecutor has seen hundreds of cases like yours &mdash; now you will too.
            </p>
            <div className="mt-8">
              <AvailabilityChecker
                slug="similar-cases-analyzer"
                productName="Similar Cases Analyzer"
                priceDisplay={TIER_CORE["similar-cases-analyzer"].priceDisplay}
              />
            </div>
            <p className="mt-6 text-xs text-zinc-400">
              This product provides legal information, verified court data
              compiled for your review. It is not legal advice. Your attorney
              remains the final authority on all strategy decisions.
            </p>
            <p className="mt-3 text-sm text-zinc-400">
              Questions before you buy?{" "}
              <a href="mailto:help@imnotanattorney.com" className="text-amber-400 underline decoration-amber-400/50 hover:decoration-amber-400">
                help@imnotanattorney.com
              </a>
              {" "}&mdash; we respond within 2 hours.
            </p>
          </FadeInUp>
        </section>
      </div>
    </>
  );
}

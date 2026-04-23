/**
 * District Court Intelligence landing page (/district-court-intelligence)
 *
 * Standalone Tier 9 data product, $97, instant delivery.
 * Federal district-level sentencing intelligence from 595,851 JUSTFAIR records.
 * Server component, AvailabilityChecker is a client island.
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
    title: `District Court Intelligence, ${TIER_CORE["district-court-intelligence"].priceDisplay} | ImNotAnAttorney`,
    description:
      "Federal district-level sentencing patterns, conviction rates, plea rates, motion outcomes, and judge demographics. 595,851 JUSTFAIR sentencing records with source URLs.",
    alternates: { canonical: `${SITE_URL}/district-court-intelligence` },
    openGraph: {
      title:
        "District Court Intelligence, Know Your Court Before Your First Hearing",
      description:
        "Aggregate sentencing patterns, outcome benchmarks, prosecution patterns, and judge demographics for your federal district. Verified data with source URLs.",
      url: `${SITE_URL}/district-court-intelligence`,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Static data                                                        */
/* ------------------------------------------------------------------ */

const CHECK_ITEMS = [
  "Sentencing patterns from 595,851 federal cases in your district",
  "Conviction, dismissal, and plea rates for your jurisdiction",
  "Motion grant rates \u2014 how often defense motions succeed in your court",
  "Judge demographic breakdown \u2014 who sits on your bench",
  "District-level prosecution patterns",
  "National benchmarks for comparison",
  "Every data point linked to its source URL",
] as const;

const SAMPLE_ROWS = [
  {
    metric: "Conviction rate",
    value: "89.3%",
    source: "BJS",
  },
  {
    metric: "Plea rate",
    value: "96.1%",
    source: "USSC",
  },
  {
    metric: "Median sentence (drug trafficking)",
    value: "84.0 months",
    source: "JUSTFAIR",
  },
  {
    metric: "Downward departure rate",
    value: "28.7%",
    source: "USSC",
  },
] as const;

const FAQ_ITEMS = [
  {
    question: "What data is in the District Court Intelligence report?",
    answer:
      "Aggregate sentencing patterns for your federal district, conviction and dismissal rates, plea rates, defense motion success rates, judge demographics, prosecution tendencies, and national benchmarks for comparison. Every data point includes a source URL you can verify independently.",
  },
  {
    question: "Where does the data come from?",
    answer:
      "Federal sentencing data from JUSTFAIR (QSIDE Institute) covering 595,851 sentencing records, supplemented by Bureau of Justice Statistics (BJS) and U.S. Sentencing Commission (USSC) published data. We do not generate or estimate data \u2014 every metric traces to a specific public record.",
  },
  {
    question: "Is this legal advice?",
    answer:
      "No. This is legal INFORMATION \u2014 verified court data compiled into a structured report. Decisions about how to use this information stay with you.",
  },
  {
    question: "How is it delivered?",
    answer:
      "On purchase. The report is generated on demand from our verified database and sent to your inbox.",
  },
  {
    question: "What if my district isn\u2019t covered?",
    answer:
      "If we don\u2019t have sufficient data for your federal district, you\u2019ll see that before checkout \u2014 we won\u2019t charge you for data we don\u2019t have. You can join our waitlist and we\u2019ll notify you when coverage is available.",
  },
  {
    question: "How is this different from the Judge Report Card?",
    answer:
      "The Judge Report Card focuses on a specific judge \u2014 their individual sentencing patterns, prosecutor pairings, and direct quotes. District Court Intelligence gives you the big picture: how your entire district operates, so you understand the environment your case will be decided in. They complement each other.",
  },
] as const;

/* ------------------------------------------------------------------ */
/*  JSON-LD structured data                                            */
/* ------------------------------------------------------------------ */

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: "https://imnotanattorney.com",
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "District Court Intelligence",
      item: `${SITE_URL}/district-court-intelligence`,
    },
  ],
};

const faqLd = {
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
};

/* ------------------------------------------------------------------ */
/*  Checkmark icon                                                     */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DistrictCourtIntelligencePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      {/* ---------- HERO ---------- */}
      <FadeInUp>
        <section aria-labelledby="hero-heading" className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
            District Court Intelligence
          </p>

          <p className="mb-6 text-base leading-relaxed text-zinc-400">
            Every federal district has patterns. The prosecutors who work there
            every day know them by heart &mdash; conviction rates, sentencing
            tendencies, which motions get granted and which get denied. You&rsquo;re
            walking into their home court. Until now, you had no way to see what
            they see.
          </p>

          <h1
            id="hero-heading"
            className="font-display mt-4 text-4xl font-extrabold leading-tight text-white sm:text-5xl"
          >
            Know Your Court Before Your First Hearing
          </h1>

          <p className="mt-4 text-lg text-zinc-400">
            Every federal district has patterns. Conviction rates. Sentencing
            tendencies. Motion outcomes. The prosecutor knows them. Now you will
            too.
          </p>

          <p className="mt-6 text-4xl font-extrabold text-amber-400">
            {TIER_CORE["district-court-intelligence"].priceDisplay}
          </p>

          <p className="mt-2 text-sm text-zinc-400">
            Less than a court filing fee &mdash; for intelligence the prosecution
            already has.
          </p>

          <p className="mt-2 text-sm text-zinc-300">
            595,851 federal sentencing records with source URLs
          </p>

          <div className="mt-6">
            <AvailabilityChecker
              slug="district-court-intelligence"
              productName="District Court Intelligence"
              priceDisplay={TIER_CORE["district-court-intelligence"].priceDisplay}
            />
          </div>
        </section>
      </FadeInUp>

      {/* ---------- WHAT YOU GET ---------- */}
      <FadeInUp>
        <section aria-labelledby="features-heading" className="mt-20">
          <h2
            id="features-heading"
            className="font-display text-2xl font-bold text-white"
          >
            What You Get
          </h2>

          <ul className="mt-8 space-y-4">
            {CHECK_ITEMS.map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 text-zinc-300"
              >
                <CheckIcon />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      </FadeInUp>

      {/* ---------- SAMPLE DATA ---------- */}
      <FadeInUp>
        <section aria-labelledby="sample-heading" className="mt-20">
          <h2
            id="sample-heading"
            className="font-display text-2xl font-bold text-white"
          >
            Sample District Data
          </h2>

          <div className="mt-8 overflow-x-auto rounded-lg border border-zinc-700">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Sample district data &mdash; Southern District of Florida
              </caption>
              <thead className="border-b border-zinc-700 bg-zinc-900">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold text-zinc-200">
                    Metric
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-zinc-200">
                    Value
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-zinc-200">
                    Source
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {SAMPLE_ROWS.map((row) => (
                  <tr key={row.metric}>
                    <th
                      scope="row"
                      className="whitespace-nowrap px-4 py-3 font-medium text-zinc-300"
                    >
                      {row.metric}
                    </th>
                    <td className="px-4 py-3 text-zinc-400">{row.value}</td>
                    <td className="px-4 py-3 text-zinc-400">{row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-zinc-400">
            Sample data shown for illustration. Your report contains data specific
            to your federal district.
          </p>
        </section>
      </FadeInUp>

      {/* ---------- TRUST ---------- */}
      <FadeInUp>
        <section aria-labelledby="trust-heading" className="mt-20">
          <h2
            id="trust-heading"
            className="font-display text-2xl font-bold text-white"
          >
            Why You Can Trust This Data
          </h2>

          <p className="mt-4 text-zinc-400">
            Every metric in your District Court Intelligence report links directly
            to its source &mdash; JUSTFAIR, USSC, or BJS. No summaries from unnamed
            sources. No fabricated estimates. Every data point traces back to a
            verified federal court record with a URL you can check yourself.
          </p>

          <p className="mt-3 text-sm text-zinc-400">
            District analysis built from JUSTFAIR&rsquo;s 595,851 federal
            sentencing records (QSIDE Institute), U.S. Sentencing Commission
            published data, and Bureau of Justice Statistics reports. Computed
            from verified records &mdash; not estimated, not fabricated.
          </p>

          <div className="mt-8">
            <TrustBadges variant="pricing" />
          </div>
        </section>
      </FadeInUp>

      {/* ---------- FAQ ---------- */}
      <section aria-labelledby="faq-heading" className="mt-20">
        <h2
          id="faq-heading"
          className="font-display text-2xl font-bold text-white"
        >
          Frequently Asked Questions
        </h2>

        <div className="mt-8">
          <FAQAccordion items={[...FAQ_ITEMS]} />
        </div>
      </section>

      {/* ---------- FINAL CTA ---------- */}
      <FadeInUp>
        <section aria-labelledby="cta-heading" className="mt-20 text-center">
          <h2
            id="cta-heading"
            className="font-display text-2xl font-bold text-white"
          >
            Get Your District Court Intelligence &mdash;{" "}
            <span className="text-amber-400">
              {TIER_CORE["district-court-intelligence"].priceDisplay}
            </span>
          </h2>

          <p className="mt-4 text-zinc-400">
            Most defendants walk into court with no idea how the district
            operates. Defendants who prepare walk in knowing the conviction
            rates, the sentencing patterns, and the motion outcomes. The
            prosecution already has this data &mdash; now you can have it too.
          </p>

          <div className="mt-6">
            <AvailabilityChecker
              slug="district-court-intelligence"
              productName="District Court Intelligence"
              priceDisplay={TIER_CORE["district-court-intelligence"].priceDisplay}
            />
          </div>

          <p className="mt-4 text-xs text-zinc-400">
            This is legal information, not legal advice. ImNotAnAttorney provides
            verified court data to help you prepare for conversations with your
            attorney. Decisions about how to use this information stay with you.
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
        </section>
      </FadeInUp>

      {/* ---------- JSON-LD: Product ---------- */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: "District Court Intelligence",
            description:
              "Federal district-level sentencing patterns, conviction rates, plea rates, motion outcomes, and judge demographics from 595,851 JUSTFAIR sentencing records.",
            url: `${SITE_URL}/district-court-intelligence`,
            brand: {
              "@type": "Organization",
              "@id": "https://imnotanattorney.com/#organization",
            },
            offers: {
              "@type": "Offer",
              price: "97.00",
              priceCurrency: "USD",
              availability: "https://schema.org/InStock",
              url: `${SITE_URL}/checkout?standaloneProduct=district-court-intelligence`,
            },
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
    </div>
  );
}

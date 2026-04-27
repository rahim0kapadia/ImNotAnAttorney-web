/**
 * Federal Sentencing Distribution Report landing page
 * (/federal-sentencing-distribution)
 *
 * Standalone Tier 9 data product, $297, instant delivery. Activates 13,131
 * district-level USSC FY14-23 sentencing buckets across 94 federal districts.
 * Resolver dispatches in src/lib/tier9-reports/generate.ts → renderFederalSentencingDistribution.
 *
 * Built per Apex Fix #1 (docs/plans/2026-04-26-apex-fix1-invisible-skus.md).
 * Apex catalog audit found this SKU live but invisible — no PRODUCT_COPY,
 * no dedicated route, no /services card, zero conversions possible.
 *
 * Note: This SKU lives in `STANDALONE_PRODUCTS` (src/lib/products.ts) only —
 * not in `TIER_CORE`. Price + name come from the standalone product lookup.
 *
 * Server component; AvailabilityChecker is a client island.
 */
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { STANDALONE_PRODUCTS } from "@/lib/products";
import { TrustBadges } from "@/components/TrustBadges";
import { FAQAccordion } from "@/components/FAQAccordion";
import { FadeInUp } from "@/components/motion/FadeInUp";
import AvailabilityChecker from "@/components/tier9/AvailabilityChecker";

const PRODUCT = STANDALONE_PRODUCTS["federal-sentencing-distribution"];
const PRICE_DISPLAY = PRODUCT?.priceDisplay ?? "$297";
const PRODUCT_NAME = PRODUCT?.name ?? "Federal Sentencing Distribution Report";

export function generateMetadata(): Metadata {
  return {
    title: `Federal Sentencing Distribution Report, ${PRICE_DISPLAY} | ImNotAnAttorney`,
    description:
      "District-specific federal sentencing distribution — percentile ranges (p10/p25/p50/p75/p90), departure rates, Monte Carlo sentence simulation, and national comparison. 13,131 USSC FY14-23 buckets across 94 federal districts.",
    alternates: { canonical: `${SITE_URL}/federal-sentencing-distribution` },
    openGraph: {
      title:
        "Federal Sentencing Distribution Report — Where Your Charge Sentences Cluster",
      description:
        "Percentile ranges, departure rates, Monte Carlo simulation, and national comparison from 13,131 USSC FY14-23 sentencing buckets.",
      url: `${SITE_URL}/federal-sentencing-distribution`,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Static data                                                        */
/* ------------------------------------------------------------------ */

const CHECK_ITEMS = [
  "Percentile ranges (p10 / p25 / p50 / p75 / p90) for your federal charge in your district — what month-counts cluster where",
  "Departure rates — downward, upward, and probation share for your offense",
  "Monte Carlo sentence simulation (1,000 samples) drawn from the actual district distribution, not a generic curve",
  "National comparison — how your district’s distribution compares to the national distribution for the same offense",
  "Per-fiscal-year breakdown across FY14-FY23 with sample size disclosed",
  "Progressive widening when district-exact buckets are sparse — disclosed clearly when fallback fires",
  "Source: USSC Individual Offender Datafiles, fiscal years 2014 through 2023",
] as const;

const SAMPLE_ROWS = [
  {
    metric: "Distribution buckets in corpus",
    value: "13,131 rows",
    source: "federal_sentencing_distributions",
  },
  {
    metric: "Federal districts covered",
    value: "94",
    source: "USSC Individual Offender Datafiles",
  },
  {
    metric: "Sample percentile band (drug trafficking, district aggregate)",
    value: "p25-p75 ≈ 24-72 months",
    source: "USSC FY14-23",
  },
  {
    metric: "Monte Carlo sample count",
    value: "1,000 simulated sentences",
    source: "histogram(monte_carlo, 20)",
  },
] as const;

const FAQ_ITEMS = [
  {
    question: "What is in the Federal Sentencing Distribution Report?",
    answer:
      "Five sections built from USSC fiscal-year datafiles: (1) percentile ranges for your charge in your federal district — p10, p25, p50 (median), p75, and p90 sentence months; (2) departure rates — share of sentences below guidelines, above guidelines, and at probation only; (3) Monte Carlo simulation drawing 1,000 sample sentences from the actual district distribution; (4) national comparison showing how your district’s distribution compares to the national distribution for the same offense; (5) per-fiscal-year breakdown across FY14-FY23 with sample sizes disclosed. Charges that don’t map to a USSC primary sentencing guideline are rejected before checkout — no charge for charges we can’t analyze.",
  },
  {
    question: "Where does the data come from?",
    answer:
      "USSC Individual Offender Datafiles for fiscal years 2014 through 2024 — 13,131 district-level buckets across 94 federal districts. Aggregates are computed off the verified raw data: medians, percentile breaks, departure shares, and per-year counts. Monte Carlo samples are drawn from the actual distribution shape, not a generic curve. Nothing is estimated; nothing is fabricated.",
  },
  {
    question: "Is this legal advice?",
    answer:
      "No. This is legal INFORMATION — historical sentencing distributions for federal offenses, by district. Sentencing distributions are aggregate; your judge sentences differently. Use the data to ask the right questions.",
  },
  {
    question: "How is it delivered?",
    answer:
      "Instantly on purchase. The report is generated on demand from the USSC sentencing matview within 60 seconds and rendered to your email.",
  },
  {
    question: "What if my district has thin coverage for my charge?",
    answer:
      "The resolver widens progressively — first to district + offense + criminal history, then district + offense, then national + offense, then offense-only. Each fallback is disclosed in the report so you know exactly which scope produced the numbers. When the charge type doesn’t map to a federal sentencing guideline at all (most state offenses), the availability check rejects before checkout.",
  },
  {
    question: "How is this different from the X-Ray?",
    answer:
      "The Federal Sentencing Distribution Report tells you the range — what month-counts cluster where for your charge in your district. The X-Ray ($2,497) inherits this district sentencing intelligence AND tells you where YOU fit inside it via full discovery analysis. Different scope, different price step.",
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
      item: SITE_URL,
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Federal Sentencing Distribution Report",
      item: `${SITE_URL}/federal-sentencing-distribution`,
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

export default function FederalSentencingDistributionPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      {/* ---------- HERO ---------- */}
      <FadeInUp>
        <section aria-labelledby="hero-heading" className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
            Federal Sentencing Distribution Report
          </p>

          <p className="mb-6 text-base leading-relaxed text-zinc-400">
            Federal sentences cluster &mdash; not on a single number, but on a
            range. The prosecutor knows that range cold. The defendant rarely
            sees it before the day of sentencing. The USSC has been publishing
            the underlying data for a decade. This report puts your offense,
            your district, and your fiscal-year window into a single picture.
          </p>

          <h1
            id="hero-heading"
            className="font-display mt-4 text-4xl font-extrabold leading-tight text-white sm:text-5xl"
          >
            Where Federal Sentences Actually Cluster For Your Charge
          </h1>

          <p className="mt-4 text-lg text-zinc-400">
            Percentile ranges (p10/p25/p50/p75/p90). Departure rates. Monte
            Carlo simulation drawn from the real district distribution.
            National comparison. Per-fiscal-year breakdown. 13,131 USSC FY14-23
            buckets across 94 federal districts.
          </p>

          <p className="mt-6 text-base text-zinc-300 italic">
            Sentencing distributions are aggregate; your judge sentences
            differently. Use the data to ask the right questions.
          </p>

          <p className="mt-6 text-4xl font-extrabold text-amber-400">
            {PRICE_DISPLAY}
          </p>

          <p className="mt-2 text-sm text-zinc-400">
            Generated on demand from the USSC sentencing matview within 60
            seconds.
          </p>

          <p className="mt-2 text-sm text-zinc-300">
            Verified public source: USSC Individual Offender Datafiles, fiscal
            years 2014 through 2024
          </p>

          <div id="availability" className="mt-6 scroll-mt-24">
            <AvailabilityChecker
              slug="federal-sentencing-distribution"
              productName={PRODUCT_NAME}
              priceDisplay={PRICE_DISPLAY}
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
            Sample Distribution Data
          </h2>

          <div className="mt-8 overflow-x-auto rounded-lg border border-zinc-700">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Sample USSC sentencing distribution shape across federal
                districts and offenses
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
            Sample values illustrate the cell shape — your report contains
            actual percentile bands, departure rates, and the per-year
            breakdown for the federal charge and district you select.
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
            The USSC publishes the raw sentencing data every fiscal year. Our
            matview computes percentiles, departure rates, and per-year counts
            directly off the verified rows — no interpolation, no smoothing.
            When district-exact buckets are sparse, the resolver widens
            progressively and discloses each fallback step on the report.
          </p>

          <p className="mt-3 text-sm text-zinc-400">
            Distribution buckets aggregate USSC Individual Offender Datafiles
            for fiscal years 2014 through 2024 — 13,131 rows across 94 federal
            districts. Percentiles are computed off the actual distribution
            shape per district. Monte Carlo samples are drawn from the real
            empirical distribution, not a parametric fit. Aggregate frequencies
            only — never a prediction about a specific case or defendant.
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
            Get the Federal Sentencing Distribution Report &mdash;{" "}
            <span className="text-amber-400">{PRICE_DISPLAY}</span>
          </h2>

          <p className="mt-4 text-zinc-400">
            Most defendants walk into a sentencing hearing without ever seeing
            the percentile shape of how their charge has been sentenced in
            their district. Defendants who prepare walk in with the p10, the
            median, the p90, the departure shares, and a 1,000-sample Monte
            Carlo of the empirical distribution. 13,131 USSC buckets &mdash;
            yours in 60 seconds.
          </p>

          <div className="mt-6">
            <AvailabilityChecker
              slug="federal-sentencing-distribution"
              productName={PRODUCT_NAME}
              priceDisplay={PRICE_DISPLAY}
            />
          </div>

          <p className="mt-4 text-xs text-zinc-400">
            This is legal information, not legal advice. The report compiles
            historical sentencing distributions from verified USSC data. Every
            case is different. Decisions about how to use the information stay
            with you.
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
            name: "Federal Sentencing Distribution Report",
            description:
              "District-specific federal sentencing distribution: percentile ranges, departure rates, Monte Carlo simulation, and national comparison. 13,131 USSC FY14-23 buckets across 94 federal districts.",
            url: `${SITE_URL}/federal-sentencing-distribution`,
            brand: {
              "@type": "Organization",
              "@id": "https://imnotanattorney.com/#organization",
            },
            offers: {
              "@type": "Offer",
              price: "297.00",
              priceCurrency: "USD",
              availability: "https://schema.org/InStock",
              url: `${SITE_URL}/checkout?standaloneProduct=federal-sentencing-distribution`,
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

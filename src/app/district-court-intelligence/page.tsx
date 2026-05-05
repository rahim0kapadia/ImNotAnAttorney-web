/**
 * Courthouse Intelligence Pack landing page (/district-court-intelligence)
 *
 * Standalone Tier 9 data product, $147, instant delivery. URL slug retained
 * for SEO + Stripe + DB stability; product upgraded 2026-04-23 from the
 * $97 District Court Intelligence test SKU. Scope + UPL gates live in
 * src/lib/tier9-reports/courthouse-intelligence.ts:1-37.
 *
 * Server component; AvailabilityChecker is a client island.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import { TIER_CORE } from "@/lib/tiers";
import { TrustBadges } from "@/components/TrustBadges";
import { FAQAccordion } from "@/components/FAQAccordion";
import { FadeInUp } from "@/components/motion/FadeInUp";
import AvailabilityChecker from "@/components/tier9/AvailabilityChecker";
import { FEDERAL_DISTRICTS, districtsByState } from "@/lib/district-court/codes";

export function generateMetadata(): Metadata {
  return {
    title: `Courthouse Intelligence Pack, ${TIER_CORE["district-court-intelligence"].priceDisplay} | ImNotAnAttorney`,
    description:
      "Aggregate caseload, circuit motion grant rates, and USSC FY14-23 sentencing aggregates for the federal districts in your state. Compiled from verified public court records.",
    alternates: { canonical: `${SITE_URL}/district-court-intelligence` },
    openGraph: {
      title:
        "Courthouse Intelligence Pack — Know Your Federal Courthouse Before Your First Hearing",
      description:
        "Federal district caseload aggregates, circuit motion grant rates with national baselines, and USSC FY14-23 sentencing aggregates. Aggregate data from verified public court records.",
      url: `${SITE_URL}/district-court-intelligence`,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Static data                                                        */
/* ------------------------------------------------------------------ */

const CHECK_ITEMS = [
  "Judge caseload aggregate \u2014 every federal judge in your district ranked by indexed case volume",
  "Circuit motion grant rates \u2014 motion-by-motion appellate-direction grant rates with national baselines and deviation",
  "USSC FY14-23 sentencing aggregates \u2014 median sentence, prison rate, downward-departure rate per district",
  "Multi-district coverage when your state has more than one federal courthouse",
  "Methodology and known-limitation notes spelled out on every section",
  "Every aggregate sourced from verified public court records (CourtListener, FJC IDB, USSC datafiles)",
  "Aggregate frequencies only \u2014 never a prediction about a specific defendant",
] as const;

const SAMPLE_ROWS = [
  {
    metric: "Judges with indexed dockets (typical state)",
    value: "20-90",
    source: "CourtListener \u00d7 FJC IDB",
  },
  {
    metric: "Circuit motion grant rate (Motion to Suppress, Circuit 5)",
    value: "8.2%",
    source: "motion_outcome_rates_by_circuit",
  },
  {
    metric: "Median federal sentence (district aggregate)",
    value: "24-60 months",
    source: "USSC FY14-23",
  },
  {
    metric: "Downward-departure rate (district aggregate)",
    value: "12-22%",
    source: "USSC FY14-23",
  },
] as const;

const FAQ_ITEMS = [
  {
    question: "What is in the Courthouse Intelligence Pack?",
    answer:
      "Three sections built from verified public court records: (1) judge caseload aggregate \u2014 every indexed federal judge in your district ranked by case volume; (2) circuit motion grant rates \u2014 motion-type-by-motion-type appellate grant rates with national baselines and per-circuit deviation; (3) USSC FY14-23 sentencing aggregates \u2014 median sentence, prison rate, and downward-departure rate per district. A prosecutors section is currently suppressed \u2014 the underlying attorney-role data is not yet indexed in the corpus, and we will not fabricate it.",
  },
  {
    question: "Where does the data come from?",
    answer:
      "Federal docket records from CourtListener cross-referenced against the FJC Integrated Database, motion outcome rates from our circuit-level appellate aggregation, and sentencing aggregates computed from the U.S. Sentencing Commission public datafiles for fiscal years 2014-2023. Every aggregate is computed from verified records \u2014 nothing is estimated or fabricated.",
  },
  {
    question: "Is this legal advice?",
    answer:
      "No. This is legal INFORMATION \u2014 aggregate frequencies, counts, and medians from public court records. Nothing in the pack is a prediction about a specific case. Decisions about how to apply the data to your case stay with you and your attorney.",
  },
  {
    question: "How is it delivered?",
    answer:
      "Instantly on purchase. The pack is generated on demand from the verified court-records corpus and rendered to your email.",
  },
  {
    question: "What if my federal district has thin coverage?",
    answer:
      "Before checkout you will see how many judges and motions are indexed for your state. If a district has no indexed disposition profiles, the relevant section discloses the gap rather than fabricating numbers \u2014 methodology and known limitations are listed on every render.",
  },
  {
    question: "How is this different from the Judge Question Brief?",
    answer:
      "The Judge Question Brief is judge-specific \u2014 questions to ask your attorney about a single named judge. The Courthouse Intelligence Pack is district-aggregate \u2014 caseload, circuit motion direction, and sentencing patterns across the whole courthouse. They complement each other: the pack gives the environment, the brief targets one judge inside it.",
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
      name: "Courthouse Intelligence Pack",
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
            Courthouse Intelligence Pack
          </p>

          <p className="mb-6 text-base leading-relaxed text-zinc-400">
            Every federal courthouse has patterns. Which motions land on appeal in
            this circuit. How sentences cluster across the district. Which judges
            carry the bulk of the docket. Defendants who walk in cold get a
            stranger&rsquo;s court; defendants who walk in prepared get the same
            aggregate context the prosecutor sees.
          </p>

          <h1
            id="hero-heading"
            className="font-display mt-4 text-4xl font-extrabold leading-tight text-white sm:text-5xl"
          >
            Know Your Federal Courthouse Before Your First Hearing
          </h1>

          <p className="mt-4 text-lg text-zinc-400">
            District-aggregate caseload. Circuit motion grant rates with national
            baselines. USSC FY14-23 sentencing aggregates. Compiled from verified
            public court records &mdash; nothing predicted, nothing estimated.
          </p>

          <p className="mt-6 text-4xl font-extrabold text-amber-400">
            {TIER_CORE["district-court-intelligence"].priceDisplay}
          </p>

          <p className="mt-2 text-sm text-zinc-400">
            Aggregate court-record intelligence for your federal district &mdash;
            generated on demand.
          </p>

          <p className="mt-2 text-sm text-zinc-300">
            Verified public sources: CourtListener &times; FJC IDB &times; USSC
            FY14-23
          </p>

          <div className="mt-6">
            <AvailabilityChecker
              slug="district-court-intelligence"
              productName="Courthouse Intelligence Pack"
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
                Sample courthouse aggregate ranges across federal districts
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
            Ranges shown to illustrate what aggregate cells look like across
            federal districts. Your pack contains the actual aggregate values
            for the federal district(s) in your state.
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
            Every aggregate in the pack is computed from verified public court
            records. No paraphrase from unnamed sources. No estimated cells. When
            a section has thin coverage, it discloses the gap on the page rather
            than fabricating a number.
          </p>

          <p className="mt-3 text-sm text-zinc-400">
            Caseload aggregates are derived from federal docket records indexed
            via CourtListener and cross-referenced with the Federal Judicial
            Center Integrated Database. Circuit motion grant rates aggregate
            appellate-direction outcomes per circuit. Sentencing aggregates are
            computed from the U.S. Sentencing Commission public datafiles for
            fiscal years 2014 through 2023. Aggregate frequencies only &mdash;
            never a prediction about a specific case or defendant.
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

      {/* ---------- DISTRICT INDEX ---------- */}
      <FadeInUp>
        <section aria-labelledby="districts-heading" className="mt-20">
          <h2
            id="districts-heading"
            className="font-display text-2xl font-bold text-white"
          >
            Browse by Federal District
          </h2>
          <div className="mt-8 space-y-6">
            {Array.from(districtsByState().entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([state, districts]) => (
                <div key={state}>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-amber-400 mb-2">
                    {state}
                  </h3>
                  <ul className="flex flex-wrap gap-2">
                    {districts.map((d) => (
                      <li key={d.code}>
                        <Link
                          href={`/district-court-intelligence/${d.code}`}
                          className="inline-block rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:border-amber-400/60 hover:text-amber-300 transition-colors"
                        >
                          {d.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
          <p className="mt-4 text-xs text-zinc-500">
            {FEDERAL_DISTRICTS.length} federal district courts. Data availability varies by district —
            pages with thin corpus coverage disclose the gap rather than fabricating numbers.
          </p>
        </section>
      </FadeInUp>

      {/* ---------- FINAL CTA ---------- */}
      <FadeInUp>
        <section aria-labelledby="cta-heading" className="mt-20 text-center">
          <h2
            id="cta-heading"
            className="font-display text-2xl font-bold text-white"
          >
            Get the Courthouse Intelligence Pack &mdash;{" "}
            <span className="text-amber-400">
              {TIER_CORE["district-court-intelligence"].priceDisplay}
            </span>
          </h2>

          <p className="mt-4 text-zinc-400">
            Most defendants walk into a federal courthouse cold. Defendants who
            prepare walk in with the same aggregate context the prosecutor
            already has &mdash; the caseload makeup, the circuit motion direction,
            and the sentencing aggregates for the district. This pack compiles
            that context from verified public records.
          </p>

          <div className="mt-6">
            <AvailabilityChecker
              slug="district-court-intelligence"
              productName="Courthouse Intelligence Pack"
              priceDisplay={TIER_CORE["district-court-intelligence"].priceDisplay}
            />
          </div>

          <p className="mt-4 text-xs text-zinc-400">
            This is legal information, not legal advice. The pack compiles
            aggregate data from verified public court records to give you context
            for conversations about your case. Nothing here predicts a specific
            outcome, and decisions about how to use the information stay with
            you.
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
            name: "Courthouse Intelligence Pack",
            description:
              "Aggregate caseload, circuit motion grant rates, and USSC FY14-23 sentencing aggregates for the federal districts in your state. Compiled from verified public court records.",
            url: `${SITE_URL}/district-court-intelligence`,
            brand: {
              "@type": "Organization",
              "@id": "https://imnotanattorney.com/#organization",
            },
            offers: {
              "@type": "Offer",
              price: "147.00",
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

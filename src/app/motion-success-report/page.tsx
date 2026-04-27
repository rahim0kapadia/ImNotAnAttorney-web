/**
 * Motion Success Report landing page (/motion-success-report)
 *
 * Standalone Tier 9 data product, $197, instant delivery. Activates dormant
 * motion-outcome data (2,966 rows across motion_outcome_rates,
 * judge_motion_outcome_rates, motion_outcome_rates_by_circuit) — see
 * src/lib/tier9-reports/motion-success-report.ts for resolver scope + UPL.
 *
 * Built per Apex Fix #1 (docs/plans/2026-04-26-apex-fix1-invisible-skus.md).
 * Apex catalog audit found this SKU live but invisible — no PRODUCT_COPY,
 * no dedicated route, no /services card, zero conversions possible.
 *
 * Server component; AvailabilityChecker is a client island.
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
    title: `Motion Success Report, ${TIER_CORE["motion-success-report"].priceDisplay} | ImNotAnAttorney`,
    description:
      "Top-10 motions filed for your charge type with grant rates, optional circuit baseline and judge-specific patterns, and verified granted-motion citations. Compiled from indexed criminal court records.",
    alternates: { canonical: `${SITE_URL}/motion-success-report` },
    openGraph: {
      title:
        "Motion Success Report — Which Motions Actually Get Granted For Your Charge",
      description:
        "Top-10 motions, grant rates with circuit baseline, optional judge-specific patterns, and verified granted-motion citations. Compiled from indexed criminal court records.",
      url: `${SITE_URL}/motion-success-report`,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Static data                                                        */
/* ------------------------------------------------------------------ */

const CHECK_ITEMS = [
  "Top 10 motion types for your charge — filed counts, granted counts, and grant rates",
  "Circuit baseline column — how the same motion type performs in your federal circuit",
  "Optional judge-specific section — supply a judge name and the report adds their motion-by-motion pattern when their record reaches a reporting threshold",
  "Top 10 granted-motion citations for your charge — each with a CourtListener URL you can verify yourself",
  "Methodology block — every percentage shows its denominator inline; no naked rates",
  "Limitations stated on every section — sparse cells disclose the gap rather than fabricating a number",
  "Aggregate frequencies only — never a prediction about a specific motion in a specific case",
] as const;

const SAMPLE_ROWS = [
  {
    metric: "Motion to Suppress (DUI national baseline)",
    value: "Granted 8.4% of 1,247 filed",
    source: "motion_outcome_rates",
  },
  {
    metric: "Motion to Suppress (Circuit 5 baseline)",
    value: "Granted 6.1% of 312 filed",
    source: "motion_outcome_rates_by_circuit",
  },
  {
    metric: "Motion in Limine (Drug Possession)",
    value: "Granted 41.2% of 422 filed",
    source: "motion_outcome_rates",
  },
  {
    metric: "Top granted-motion citation",
    value: "Linked to CourtListener",
    source: "charge_type_top_authorities",
  },
] as const;

const FAQ_ITEMS = [
  {
    question: "What is in the Motion Success Report?",
    answer:
      "Three sections built from indexed criminal court records: (1) top 10 motion types for your charge type, with filed counts, granted counts, and grant rates; (2) a circuit baseline column showing how the same motion type performs in your federal circuit, when circuit data is available; (3) the top 10 granted-motion citations for your charge type, each with a CourtListener URL. If you supply a judge name and that judge’s record reaches a reporting threshold, the report adds a judge-specific motion-pattern section.",
  },
  {
    question: "Where does the data come from?",
    answer:
      "Indexed criminal court motions from CourtListener, aggregated into motion_outcome_rates (national, by-charge), motion_outcome_rates_by_circuit (per federal circuit), and judge_motion_outcome_rates (judge-specific). Granted-motion citations are pulled from charge_type_top_authorities with a citation_authority_criminal fallback. Every cell is a count or a ratio of counts — nothing estimated, nothing fabricated.",
  },
  {
    question: "Is this legal advice?",
    answer:
      "No. This is legal INFORMATION — aggregate motion grant rates and citation lists from public court records. Motion grant rates are aggregate, not predictions. Use them to ask sharper questions of your attorney.",
  },
  {
    question: "How is it delivered?",
    answer:
      "Instantly on purchase. The report is generated on demand from indexed court records and rendered to your email within 60 seconds.",
  },
  {
    question: "What if my charge type or circuit has thin coverage?",
    answer:
      "Before checkout you will see how many motion records back your charge type, your circuit baseline, and the national baseline. Sparse sections disclose the gap on the page rather than fabricating a number — limitations are listed inline so you can read the report knowing exactly where the data thins out.",
  },
  {
    question: "How is this different from the Intelligence Brief?",
    answer:
      `The Motion Success Report is one focused slice — motion grant rates and granted-motion citations for your charge. The Intelligence Brief (${TIER_CORE["intelligence-brief"].priceDisplay}) synthesizes this circuit grant-rate data with judge sentencing patterns, prosecutor track record, and similar-cases distribution against YOUR specific charge, state, and circuit, then an operator reviews the output before delivery. Tier 9 is instant and aggregate. Intelligence Brief is calibrated and synthesized into 15-25 case-specific questions.`,
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
      name: "Motion Success Report",
      item: `${SITE_URL}/motion-success-report`,
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

export default function MotionSuccessReportPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      {/* ---------- HERO ---------- */}
      <FadeInUp>
        <section aria-labelledby="hero-heading" className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
            Motion Success Report
          </p>

          <p className="mb-6 text-base leading-relaxed text-zinc-400">
            Most defendants never learn which motions actually get granted in
            cases like theirs. Their attorney files what they always file, and
            the defendant has no way to ask &mdash; was that the strongest
            move? Did the right motion get skipped? The data exists in the
            public record. Now you can read it.
          </p>

          <h1
            id="hero-heading"
            className="font-display mt-4 text-4xl font-extrabold leading-tight text-white sm:text-5xl"
          >
            Which Motions Actually Get Granted For Your Charge
          </h1>

          <p className="mt-4 text-lg text-zinc-400">
            Top-10 motion types for your charge type with grant rates. Circuit
            baseline column when data is available. Optional judge-specific
            patterns when you supply a name. Verified granted-motion citations.
            Compiled from indexed criminal court records.
          </p>

          <p className="mt-6 text-base text-zinc-300 italic">
            Motion grant rates are aggregate, not predictions. Use them to ask
            sharper questions of your attorney.
          </p>

          <p className="mt-6 text-4xl font-extrabold text-amber-400">
            {TIER_CORE["motion-success-report"].priceDisplay}
          </p>

          <p className="mt-2 text-sm text-zinc-400">
            Generated on demand from indexed court records within 60 seconds.
          </p>

          <p className="mt-2 text-sm text-zinc-300">
            Verified public sources: CourtListener motion records &times;
            charge_type_top_authorities citation index
          </p>

          <div id="availability" className="mt-6 scroll-mt-24">
            <AvailabilityChecker
              slug="motion-success-report"
              productName="Motion Success Report"
              priceDisplay={TIER_CORE["motion-success-report"].priceDisplay}
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
            Sample Motion Data
          </h2>

          <div className="mt-8 overflow-x-auto rounded-lg border border-zinc-700">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Sample motion grant-rate ranges across charge types and circuits
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
            actual counts and rates for your charge type, your circuit, and the
            optional judge name you provide.
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
            Every percentage in the report shows its denominator inline. No
            naked grant rates. Every granted-motion citation is linked to a
            CourtListener URL you can verify yourself. When a section has
            sparse data, the report discloses the gap on the page rather than
            fabricating a number.
          </p>

          <p className="mt-3 text-sm text-zinc-400">
            Motion outcome data is aggregated from indexed criminal docket
            records. Charge-type grant rates aggregate across the user-facing
            charge slug bridge. Circuit baselines aggregate per federal
            circuit. Judge-specific patterns require a reporting threshold;
            below threshold, that section is suppressed instead of estimated.
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
            Get the Motion Success Report &mdash;{" "}
            <span className="text-amber-400">
              {TIER_CORE["motion-success-report"].priceDisplay}
            </span>
          </h2>

          <p className="mt-4 text-zinc-400">
            Most defendants walk into a motion hearing without knowing how
            often the motion they’re relying on actually wins. Defendants
            who prepare walk in with the rate, the denominator, and the
            citation list. Aggregate data from verified court records —
            yours in 60 seconds.
          </p>

          <div className="mt-6">
            <AvailabilityChecker
              slug="motion-success-report"
              productName="Motion Success Report"
              priceDisplay={TIER_CORE["motion-success-report"].priceDisplay}
            />
          </div>

          <p className="mt-4 text-xs text-zinc-400">
            This is legal information, not legal advice. The report compiles
            aggregate motion data from indexed court records to give you
            context for conversations about your case. Decisions about how to
            use the information stay with you.
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
            name: "Motion Success Report",
            description:
              "Top-10 motions filed for your charge type with grant rates, optional circuit baseline and judge-specific patterns, and verified granted-motion citations. Compiled from indexed criminal court records.",
            url: `${SITE_URL}/motion-success-report`,
            brand: {
              "@type": "Organization",
              "@id": "https://imnotanattorney.com/#organization",
            },
            offers: {
              "@type": "Offer",
              price: "197.00",
              priceCurrency: "USD",
              availability: "https://schema.org/InStock",
              url: `${SITE_URL}/checkout?standaloneProduct=motion-success-report`,
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

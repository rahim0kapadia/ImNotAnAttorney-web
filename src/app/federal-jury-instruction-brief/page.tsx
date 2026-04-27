/**
 * Federal Jury Instruction Brief landing page (/federal-jury-instruction-brief)
 *
 * Standalone Tier 9 data product, $97, instant delivery. Activates 1,772
 * verified rows across 7 federal circuits in v_pji_public — see
 * src/lib/tier9-reports/federal-jury-instruction-brief.ts for resolver
 * scope + UPL.
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
    title: `Federal Jury Instruction Brief, ${TIER_CORE["federal-jury-instruction-brief"].priceDisplay} | ImNotAnAttorney`,
    description:
      "The verbatim pattern jury instruction for your federal charge and circuit, the burden-of-proof callout, top historical attack authorities, and alternative circuit variants. 1,772 verified instructions across 7 federal circuits.",
    alternates: { canonical: `${SITE_URL}/federal-jury-instruction-brief` },
    openGraph: {
      title:
        "Federal Jury Instruction Brief — The Words The Jury Will Hear",
      description:
        "Verbatim pattern jury instruction for your federal charge plus historical attack authorities. 1,772 verified instructions across 7 circuits.",
      url: `${SITE_URL}/federal-jury-instruction-brief`,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Static data                                                        */
/* ------------------------------------------------------------------ */

const CHECK_ITEMS = [
  "The verbatim pattern jury instruction the judge reads aloud at trial — for your federal charge and circuit",
  "Burden-of-proof callout — the exact sentences on which the prosecution must persuade the jury",
  "Top 5 historical attack authorities — appellate cases where defense challenged elements of this instruction, each with a CourtListener URL",
  "Alternative circuit variants — up to 3 other circuits where the same charge’s instruction reads differently, with a difference summary",
  "Methodology + UPL disclaimer on every section",
  "1,772 verified instructions across 7 federal circuits (1, 3, 4, 5, 6, 7, 8, 9, plus D.C. when present)",
  "When your circuit is not yet ingested, the report falls back to the closest sibling circuit with the deviation called out clearly",
] as const;

const SAMPLE_ROWS = [
  {
    metric: "Total verified pattern instructions",
    value: "1,772 rows",
    source: "v_pji_public",
  },
  {
    metric: "Covered circuits",
    value: "1, 3, 4, 5, 6, 7, 8, 9 (+ D.C.)",
    source: "PJI_COVERED_CIRCUITS",
  },
  {
    metric: "Sample charge — Wire Fraud (18 U.S.C. § 1343)",
    value: "Linked to verbatim PJI",
    source: "v_pji_public",
  },
  {
    metric: "Sample attack authority",
    value: "Linked to CourtListener",
    source: "charge_type_top_authorities",
  },
] as const;

const FAQ_ITEMS = [
  {
    question: "What is in the Federal Jury Instruction Brief?",
    answer:
      "Five sections built from verified federal court material: (1) the verbatim pattern jury instruction for your charge in your circuit; (2) a burden-of-proof callout with the exact sentences extracted; (3) the top 5 historical attack authorities — appellate cases where defense challenged elements of this instruction, each linked to CourtListener; (4) up to 3 alternative circuit variants showing where the same charge reads differently across circuits, with a difference summary per variant; (5) methodology and a UPL disclaimer.",
  },
  {
    question: "Where does the data come from?",
    answer:
      "Pattern jury instructions sourced from federal court publications and verified into a public-safe table (v_pji_public). 1,772 rows across 7 federal circuits as of 2026-04-26. Attack authorities pulled from charge_type_top_authorities, scoped to the charge slug. Every cited case carries a CourtListener URL — rows without a verifiable URL are suppressed.",
  },
  {
    question: "Is this legal advice?",
    answer:
      "No. This is legal INFORMATION — verbatim federal court material plus a list of historical cases where defense challenged elements of the instruction. Pattern jury instructions are the language judges read aloud at trial. This brief shows yours plus historical attack authorities.",
  },
  {
    question: "How is it delivered?",
    answer:
      "Instantly on purchase. The brief is generated on demand from the verified PJI corpus and rendered to your email.",
  },
  {
    question: "What if my circuit is not ingested?",
    answer:
      "Before checkout you will see how many instructions are indexed for your circuit and your charge. When your circuit has zero rows, the report falls back to the closest available circuit and calls the deviation out clearly. When the charge itself has no matches anywhere in the corpus, you will be offered a waitlist instead of a checkout — no charge for data we don’t have.",
  },
  {
    question: "How is this different from the Intelligence Brief?",
    answer:
      `The Federal Jury Instruction Brief is one focused federal slice — the words the jury will hear plus the cases that have attacked them. The Intelligence Brief (${TIER_CORE["intelligence-brief"].priceDisplay}) synthesizes this jury-instruction layer with judge sentencing patterns, prosecutor track record, and similar-cases distribution against YOUR specific charge, state, and circuit, then an operator reviews the output before delivery. Tier 9 is instant and aggregate. Intelligence Brief is calibrated and synthesized into 15-25 case-specific questions.`,
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
      name: "Federal Jury Instruction Brief",
      item: `${SITE_URL}/federal-jury-instruction-brief`,
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

export default function FederalJuryInstructionBriefPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      {/* ---------- HERO ---------- */}
      <FadeInUp>
        <section aria-labelledby="hero-heading" className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
            Federal Jury Instruction Brief
          </p>

          <p className="mb-6 text-base leading-relaxed text-zinc-400">
            At trial, twelve strangers will be told what the law is by a judge
            reading from a script. That script &mdash; the pattern jury
            instruction &mdash; is the language the verdict gets measured
            against. Most defendants never see it. The prosecutor has it
            memorized.
          </p>

          <h1
            id="hero-heading"
            className="font-display mt-4 text-4xl font-extrabold leading-tight text-white sm:text-5xl"
          >
            The Words The Jury Will Hear At Your Trial
          </h1>

          <p className="mt-4 text-lg text-zinc-400">
            Verbatim pattern jury instruction for your federal charge and
            circuit. Burden-of-proof callout. Top 5 historical attack
            authorities. Alternative circuit variants. 1,772 verified
            instructions across 7 federal circuits.
          </p>

          <p className="mt-6 text-base text-zinc-300 italic">
            Pattern jury instructions are the language judges read aloud at
            trial. This brief shows yours plus historical attack authorities.
          </p>

          <p className="mt-6 text-4xl font-extrabold text-amber-400">
            {TIER_CORE["federal-jury-instruction-brief"].priceDisplay}
          </p>

          <p className="mt-2 text-sm text-zinc-400">
            Generated on demand from the verified PJI corpus &mdash; delivered
            on purchase.
          </p>

          <p className="mt-2 text-sm text-zinc-300">
            Verified public sources: federal pattern jury instruction
            publications &times; CourtListener appellate authorities
          </p>

          <div id="availability" className="mt-6 scroll-mt-24">
            <AvailabilityChecker
              slug="federal-jury-instruction-brief"
              productName="Federal Jury Instruction Brief"
              priceDisplay={
                TIER_CORE["federal-jury-instruction-brief"].priceDisplay
              }
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
            Sample Brief Data
          </h2>

          <div className="mt-8 overflow-x-auto rounded-lg border border-zinc-700">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Sample federal pattern jury instruction inventory
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
            Inventory shown to illustrate corpus shape. Your brief contains the
            verbatim instruction text, the burden-of-proof sentences, and the
            top attack authorities for the federal charge you select.
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
            Pattern jury instructions are public federal court material —
            verbatim reproduction is the point. Every attack authority is
            linked to a CourtListener URL you can verify yourself. Rows without
            a verifiable source URL are suppressed rather than rendered.
          </p>

          <p className="mt-3 text-sm text-zinc-400">
            Pattern instructions are sourced from federal court publications
            and verified into a public-safe table. Attack authorities aggregate
            appellate-direction citations scoped to the charge slug, capped at
            the top 5 by citation rank. Alternative circuit variants are
            limited to circuits with verified rows in the corpus; circuits
            still being ingested fall back to the closest sibling with the
            deviation called out.
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
            Get the Federal Jury Instruction Brief &mdash;{" "}
            <span className="text-amber-400">
              {TIER_CORE["federal-jury-instruction-brief"].priceDisplay}
            </span>
          </h2>

          <p className="mt-4 text-zinc-400">
            Most defendants walk into a federal trial without ever reading the
            pattern instruction the judge will read aloud. Defendants who
            prepare walk in knowing the verbatim language, the burden-of-proof
            sentences, and the cases where defense has attacked the
            instruction’s elements before. 1,772 verified instructions —
            yours in 60 seconds.
          </p>

          <div className="mt-6">
            <AvailabilityChecker
              slug="federal-jury-instruction-brief"
              productName="Federal Jury Instruction Brief"
              priceDisplay={
                TIER_CORE["federal-jury-instruction-brief"].priceDisplay
              }
            />
          </div>

          <p className="mt-4 text-xs text-zinc-400">
            This is legal information, not legal advice. The brief reproduces
            verbatim federal court material and lists historical appellate
            authorities for context. Decisions about how to use the
            information stay with you.
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
            name: "Federal Jury Instruction Brief",
            description:
              "Verbatim federal pattern jury instruction for your charge and circuit, burden-of-proof callout, top 5 historical attack authorities, and alternative circuit variants. 1,772 verified instructions across 7 federal circuits.",
            url: `${SITE_URL}/federal-jury-instruction-brief`,
            brand: {
              "@type": "Organization",
              "@id": "https://imnotanattorney.com/#organization",
            },
            offers: {
              "@type": "Offer",
              price: "97.00",
              priceCurrency: "USD",
              availability: "https://schema.org/InStock",
              url: `${SITE_URL}/checkout?standaloneProduct=federal-jury-instruction-brief`,
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

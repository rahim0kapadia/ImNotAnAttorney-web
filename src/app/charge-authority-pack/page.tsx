/**
 * Charge Authority Pack landing page (/charge-authority-pack)
 *
 * Standalone Tier 9 data product, $97, instant delivery. Activates
 * charge_type_top_authorities (548 rows), authority_quotes_criminal (254
 * rows), citation_velocity_criminal (1.13M rows), and citation_authority_
 * criminal (620k rows national fallback) — see
 * src/lib/tier9-reports/charge-authority-pack.ts for resolver scope + UPL.
 *
 * Built 2026-04-27 to close C1 of docs/plans/2026-04-26-worry-tier9-flipped-
 * live.md. PR #188 stop-the-bleed reverted this SKU to dark because no
 * dedicated landing route existed — customers reaching the generic
 * /services/<slug> fallback could not collect chargeType pre-purchase.
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
    title: `Charge Authority Pack, ${TIER_CORE["charge-authority-pack"].priceDisplay} | ImNotAnAttorney`,
    description:
      "Top 10 must-cite defense authorities for your charge type — case name, citation, authority tier, pre-extracted canonical quote, and citation-velocity arrow. Every row links to CourtListener for independent verification.",
    alternates: { canonical: `${SITE_URL}/charge-authority-pack` },
    openGraph: {
      title:
        "Charge Authority Pack — The Top 10 Authorities Cited In Your Charge Type",
      description:
        "Top 10 must-cite defense authorities, pre-extracted canonical quotes, citation-velocity arrows, every row linked to CourtListener.",
      url: `${SITE_URL}/charge-authority-pack`,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Static data                                                        */
/* ------------------------------------------------------------------ */

const CHECK_ITEMS = [
  "Top 10 must-cite defense authorities for your charge type — case name, citation, and authority tier",
  "Pre-extracted canonical quote per authority — the exact sentence other defense filings have cited from each opinion",
  "Citation-velocity arrow per row — rising, stable, or fading over the last 24 months",
  "Every row links to the CourtListener opinion you can verify yourself — no row ships without a source URL",
  "When the charge type has zero rows in the charge-specific table, the report falls back to the national criminal-authority pool with the fallback called out clearly",
  "Methodology + UPL disclaimer on every section",
  "Top-cited authorities are aggregate frequencies. Use them to ask sharper questions, not to predict your case.",
] as const;

const SAMPLE_ROWS = [
  {
    metric: "Indexed top-cited authorities (charge-specific)",
    value: "548 rows",
    source: "charge_type_top_authorities",
  },
  {
    metric: "Pre-extracted canonical quotes",
    value: "254 rows",
    source: "authority_quotes_criminal",
  },
  {
    metric: "Citation-velocity rows tracked",
    value: "1,131,000+ rows",
    source: "citation_velocity_criminal",
  },
  {
    metric: "National criminal-authority fallback pool",
    value: "620,000+ rows",
    source: "citation_authority_criminal",
  },
  {
    metric: "Charges with dense charge-specific coverage",
    value: "DUI / Drug Trafficking / Cocaine Possession",
    source: "CHARGE_TYPE_AUTHORITY_MAP",
  },
] as const;

const FAQ_ITEMS = [
  {
    question: "What is in the Charge Authority Pack?",
    answer:
      "Three sections built from indexed criminal court records: (1) the top 10 must-cite defense authorities for your charge type, with case name, citation, and authority tier; (2) the pre-extracted canonical quote from each authority — the exact sentence defense filings have cited from that opinion; (3) a citation-velocity arrow per row showing whether the authority is rising, stable, or fading over the last 24 months. Every row links to CourtListener.",
  },
  {
    question: "Where does the data come from?",
    answer:
      "Indexed criminal court records aggregated into charge_type_top_authorities (548 charge-specific rows), authority_quotes_criminal (254 pre-extracted canonical quotes), and citation_velocity_criminal (1.13M velocity rows). Rows without a CourtListener source URL are suppressed — every cited case carries a verifiable URL.",
  },
  {
    question: "Is this legal advice?",
    answer:
      "No. This is legal INFORMATION — aggregate citation frequencies and verbatim quotes from public criminal-defense opinions. Top-cited authorities are aggregate frequencies. Use them to ask sharper questions, not to predict your case.",
  },
  {
    question: "How is it delivered?",
    answer:
      "Instantly on purchase. The report is generated on demand from the verified authority corpus and rendered to your email within 60 seconds.",
  },
  {
    question: "What if my charge type has thin charge-specific coverage?",
    answer:
      "Before checkout you will see how many charge-specific top-cited authorities back your charge type. When that count is zero, the report falls back to the 620,000-row national criminal-authority pool with the fallback called out on every section. The Availability Checker discloses the fallback before purchase so you can decide whether to buy or waitlist.",
  },
  {
    question: "How is this different from the Intelligence Brief?",
    answer:
      `The Charge Authority Pack is one focused slice — the top 10 authorities for your charge type, with quotes and velocity arrows. The Intelligence Brief (${TIER_CORE["intelligence-brief"].priceDisplay}) synthesizes this authority data with judge sentencing patterns, prosecutor track record, and similar-cases distribution against YOUR specific charge, state, and circuit, then an operator reviews the output before delivery. Tier 9 is instant and aggregate. Intelligence Brief is calibrated and synthesized into 15-25 case-specific questions.`,
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
      name: "Charge Authority Pack",
      item: `${SITE_URL}/charge-authority-pack`,
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

export default function ChargeAuthorityPackPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      {/* ---------- HERO ---------- */}
      <FadeInUp>
        <section aria-labelledby="hero-heading" className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
            Charge Authority Pack
          </p>

          <p className="mb-6 text-base leading-relaxed text-zinc-400">
            In every criminal-defense filing on your charge type, the same
            handful of opinions get cited over and over. The prosecutor knows
            them. The judge has read them a hundred times. Most defendants
            never see the list.
          </p>

          <h1
            id="hero-heading"
            className="font-display mt-4 text-4xl font-extrabold leading-tight text-white sm:text-5xl"
          >
            The Top 10 Authorities Cited In Your Charge Type
          </h1>

          <p className="mt-4 text-lg text-zinc-400">
            Case name, citation, authority tier, pre-extracted canonical quote,
            and a 24-month citation-velocity arrow per row. Every row links to
            the CourtListener opinion you can verify yourself.
          </p>

          <p className="mt-6 text-base text-zinc-300 italic">
            Top-cited authorities are aggregate frequencies. Use them to ask
            sharper questions, not to predict your case.
          </p>

          <p className="mt-6 text-4xl font-extrabold text-amber-400">
            {TIER_CORE["charge-authority-pack"].priceDisplay}
          </p>

          <p className="mt-2 text-sm text-zinc-400">
            Generated on demand from indexed criminal court records &mdash;
            delivered on purchase.
          </p>

          <p className="mt-2 text-sm text-zinc-300">
            Verified public sources: CourtListener appellate authorities &times;
            authority-quote extraction &times; 24-month citation-velocity
            tracking
          </p>

          <div id="availability" className="mt-6 scroll-mt-24">
            <AvailabilityChecker
              slug="charge-authority-pack"
              productName="Charge Authority Pack"
              priceDisplay={
                TIER_CORE["charge-authority-pack"].priceDisplay
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
            Sample Pack Inventory
          </h2>

          <div className="mt-8 overflow-x-auto rounded-lg border border-zinc-700">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Sample authority-pack corpus inventory
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
            Inventory shown to illustrate corpus shape. Your pack contains the
            top 10 authorities scoped to the charge slug you select, each with
            citation, pre-extracted quote, and a 24-month velocity arrow.
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
            Every authority in your pack carries a CourtListener URL you can
            open and read in full. Pre-extracted quotes are verbatim from the
            opinion text — same sentence other defense filings have cited.
            Rows without a verifiable source URL are suppressed rather than
            rendered.
          </p>

          <p className="mt-3 text-sm text-zinc-400">
            Authority-tier labels and citation counts are aggregated from
            charge_type_top_authorities (548 charge-specific rows) with a
            citation_authority_criminal national fallback when the charge slug
            has zero charge-specific rows. Citation-velocity arrows reflect a
            24-month rolling window over the citation_velocity_criminal corpus.
            The Availability Checker on this page discloses the fallback
            before purchase when it applies.
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
            Get the Charge Authority Pack &mdash;{" "}
            <span className="text-amber-400">
              {TIER_CORE["charge-authority-pack"].priceDisplay}
            </span>
          </h2>

          <p className="mt-4 text-zinc-400">
            Most defendants walk into the courtroom unaware of which
            authorities the prosecutor will reach for first. Defendants who
            prepare walk in knowing the top 10, the canonical quotes, and
            which precedents are gaining or losing weight in the last 24
            months. Yours in 60 seconds.
          </p>

          <div className="mt-6">
            <AvailabilityChecker
              slug="charge-authority-pack"
              productName="Charge Authority Pack"
              priceDisplay={
                TIER_CORE["charge-authority-pack"].priceDisplay
              }
            />
          </div>

          <p className="mt-4 text-xs text-zinc-400">
            This is legal information, not legal advice. The pack reproduces
            verifiable citations and verbatim quotes from public criminal-
            defense opinions. Decisions about how to use the information stay
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
            name: "Charge Authority Pack",
            description:
              "Top 10 must-cite defense authorities for your charge type, with case name, citation, authority tier, pre-extracted canonical quote, and 24-month citation-velocity arrow. Every row linked to CourtListener.",
            url: `${SITE_URL}/charge-authority-pack`,
            brand: {
              "@type": "Organization",
              "@id": "https://imnotanattorney.com/#organization",
            },
            offers: {
              "@type": "Offer",
              price: "97.00",
              priceCurrency: "USD",
              availability: "https://schema.org/InStock",
              url: `${SITE_URL}/checkout?standaloneProduct=charge-authority-pack`,
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

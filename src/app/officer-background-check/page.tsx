/**
 * Officer Background Check landing page (/officer-background-check)
 *
 * Standalone Tier 9 data product — $97, instant delivery.
 * Presents verified officer reliability data from Tier 9 tables.
 * Server component — no client-side interactivity needed.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import { TrustBadges } from "@/components/TrustBadges";
import { FAQAccordion } from "@/components/FAQAccordion";
import { FadeInUp } from "@/components/motion/FadeInUp";

export const metadata: Metadata = {
  title: "Officer Background Check — $97 | ImNotAnAttorney",
  description:
    "Cross-case officer reliability analysis. Has your arresting officer been discredited in other cases? Verified court records with source URLs.",
  alternates: { canonical: `${SITE_URL}/officer-background-check` },
  openGraph: {
    title:
      "Officer Background Check — Know Your Arresting Officer's Track Record",
    description:
      "Cross-case reliability analysis from verified court records. Every finding includes a source URL.",
    url: `${SITE_URL}/officer-background-check`,
  },
};

/* ------------------------------------------------------------------ */
/*  Static data                                                        */
/* ------------------------------------------------------------------ */

const FEATURES = [
  "Cross-case officer reliability analysis",
  "Discreditation history from other cases",
  "Testimony challenge patterns",
  "Procedural compliance track record",
  "Prior complaints and disciplinary actions from court records",
  "Every finding linked to its source URL",
] as const;

const SAMPLE_ROWS = [
  {
    finding: "Cases involving officer",
    details: "47 cases (2019\u20132025)",
    source: "CourtListener",
  },
  {
    finding: "Testimony challenged",
    details: "3 cases",
    source: "CourtListener",
  },
  {
    finding: "Suppression motions granted",
    details: "2 (procedural violations)",
    source: "CourtListener",
  },
  {
    finding: "Disciplinary records",
    details: "1 formal complaint",
    source: "Court records",
  },
] as const;

const FAQ_ITEMS = [
  {
    question: "What does the Officer Background Check include?",
    answer:
      "A cross-case reliability analysis of your arresting officer, including testimony challenges, suppression motions involving their procedures, and any documented discreditation history. Every finding includes a source URL.",
  },
  {
    question: "Where does the data come from?",
    answer:
      "Verified public court records via CourtListener and official court databases. We compile data from cases where this officer appeared as a witness or was named in motions.",
  },
  {
    question: "Is this legal advice?",
    answer:
      "No. This is legal INFORMATION \u2014 verified court data. Your attorney remains the final authority on how to use this information in your defense.",
  },
  {
    question: "How fast do I get it?",
    answer: "Within 60 seconds of purchase.",
  },
  {
    question: "What if the officer isn\u2019t in the database?",
    answer:
      "We cover officers across all 50 states with varying depth. If insufficient data exists for your specific officer, you\u2019ll be notified before purchase and offered a full refund.",
  },
  {
    question: "Will my attorney be upset that I looked this up?",
    answer:
      "Good defense attorneys welcome prepared clients. Officer reliability is the kind of information attorneys research themselves \u2014 having it ready saves them time and shows you\u2019re engaged in your defense.",
  },
] as const;

const CHECKOUT_URL = "/checkout?tier=officer-background-check";

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
      name: "Officer Background Check",
      item: `${SITE_URL}/officer-background-check`,
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

export default function OfficerBackgroundCheckPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      {/* ---------- HERO ---------- */}
      <FadeInUp>
        <section aria-labelledby="hero-heading" className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
            Officer Background Check
          </p>

          <p className="mb-6 text-base leading-relaxed text-zinc-400">
            The officer who arrested you will testify against you. The prosecutor already knows their track record &mdash; every prior case, every challenged procedure, every time their testimony was questioned. You don&rsquo;t. Until now.
          </p>

          <h1
            id="hero-heading"
            className="font-display mt-4 text-4xl font-extrabold leading-tight text-white sm:text-5xl"
          >
            Know Your Arresting Officer&apos;s Track Record
          </h1>

          <p className="mt-4 text-lg text-zinc-400">
            Has this officer&apos;s testimony been challenged? Have their
            procedures been questioned? The prosecution knows. Now you will too.
          </p>

          <p className="mt-6 text-4xl font-extrabold text-amber-400">$97</p>

          <p className="mt-2 text-sm text-zinc-400">
            Less than a court filing fee &mdash; for data that could change your defense strategy.
          </p>

          <p className="mt-2 text-sm text-zinc-300">
            Cross-case analysis from verified court records
          </p>

          <Link
            href={CHECKOUT_URL}
            className="mt-6 inline-block rounded-lg bg-amber-500 px-8 py-4 text-lg font-bold text-black hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
          >
            Get Your Officer Background Check &mdash; $97
          </Link>
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
            {FEATURES.map((feature) => (
              <li
                key={feature}
                className="flex items-start gap-3 text-zinc-300"
              >
                <CheckIcon />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </section>
      </FadeInUp>

      {/* ---------- SAMPLE REPORT ---------- */}
      <FadeInUp>
        <section aria-labelledby="sample-heading" className="mt-20">
          <h2
            id="sample-heading"
            className="font-display text-2xl font-bold text-white"
          >
            Sample Report
          </h2>

          {/* Accessible data table */}
          <div className="mt-8 overflow-x-auto rounded-lg border border-zinc-700">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Sample officer reliability data &mdash; Officer James Thompson
              </caption>
              <thead className="border-b border-zinc-700 bg-zinc-900">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold text-zinc-200">
                    Finding
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-zinc-200">
                    Details
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-zinc-200">
                    Source
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {SAMPLE_ROWS.map((row) => (
                  <tr key={row.finding}>
                    <th
                      scope="row"
                      className="whitespace-nowrap px-4 py-3 font-medium text-zinc-300"
                    >
                      {row.finding}
                    </th>
                    <td className="px-4 py-3 text-zinc-400">{row.details}</td>
                    <td className="px-4 py-3 text-zinc-400">{row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
            Every finding in your Officer Background Check links directly to a
            verified court record. No summaries from unnamed sources. No
            fabricated guesses. Every data point traces back to a real case
            with a real URL you can check yourself.
          </p>

          <p className="mt-3 text-sm text-zinc-400">
            Reliability analysis built from CourtListener&rsquo;s open court records API, cross-referencing officer appearances across cases, suppression motion outcomes, and testimony challenge patterns. Computed from verified judicial records &mdash; not estimated, not fabricated.
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
            Get Your Officer Background Check &mdash;{" "}
            <span className="text-amber-400">$97</span>
          </h2>

          <p className="mt-4 text-zinc-400">
            Most defendants never think to check the officer&rsquo;s record. Defendants who prepare check everything. The prosecution already has this data &mdash; level the playing field in 60 seconds.
          </p>

          <Link
            href={CHECKOUT_URL}
            className="mt-6 inline-block rounded-lg bg-amber-500 px-8 py-4 text-lg font-bold text-black hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
          >
            Get Your Officer Background Check &mdash; $97
          </Link>

          <p className="mt-4 text-xs text-zinc-400">
            This is legal information, not legal advice. ImNotAnAttorney
            provides verified court data to help you prepare for conversations
            with your attorney. Your attorney remains the final authority on
            your defense strategy.
          </p>

          <p className="mt-3 text-sm text-zinc-400">
            Questions before you buy?{" "}
            <a href="mailto:help@imnotanattorney.com" className="text-amber-400 underline decoration-amber-400/50 hover:decoration-amber-400">
              help@imnotanattorney.com
            </a>
            {" "}&mdash; we respond within 2 hours.
          </p>
        </section>
      </FadeInUp>

      {/* ---------- JSON-LD ---------- */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: "Officer Background Check",
            description:
              "Cross-case officer reliability analysis from verified court records with source URLs.",
            url: `${SITE_URL}/officer-background-check`,
            brand: {
              "@type": "Organization",
              "@id": "https://imnotanattorney.com/#organization",
            },
            offers: {
              "@type": "Offer",
              price: "97.00",
              priceCurrency: "USD",
              availability: "https://schema.org/InStock",
              url: `${SITE_URL}/checkout?tier=officer-background-check`,
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

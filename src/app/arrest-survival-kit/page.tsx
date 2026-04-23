/**
 * Arrest Survival Kit landing page (/arrest-survival-kit)
 *
 * Standalone Tier 9 data product, $47, instant delivery.
 * State-specific know-your-rights, agency incident data, first-48-hours
 * action plan, and bail hearing preparation.
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
    title: `Arrest Survival Kit, ${TIER_CORE["arrest-survival-kit"].priceDisplay} | ImNotAnAttorney`,
    description:
      "Know your rights before they read you yours. State-specific arrest procedures, first-48-hours action plan, bail hearing prep, and agency incident data.",
    alternates: { canonical: `${SITE_URL}/arrest-survival-kit` },
    openGraph: {
      title:
        "Arrest Survival Kit, Know Your Rights Before They Read You Yours",
      description:
        "State-specific rights checklist, first-48-hours action plan, bail hearing preparation, and agency incident data. Instant delivery.",
      url: `${SITE_URL}/arrest-survival-kit`,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Static data                                                        */
/* ------------------------------------------------------------------ */

const FEATURES = [
  "Your constitutional rights during arrest, in plain English",
  "State-specific arrest procedure rules for your jurisdiction",
  "First 48 hours action timeline, what to do and when",
  "Bail hearing preparation checklist",
  "Agency incident data for your arresting agency (where available)",
  "What NOT to say, the 5 statements that hurt defendants most",
  "Upsell path to Officer Background Check for deeper analysis",
] as const;

const SAMPLE_ROWS = [
  {
    category: "Rights covered",
    details: "12 constitutional protections",
    source: "Federal + State",
  },
  {
    category: "State-specific rules",
    details: "8 FL arrest procedures",
    source: "FL Legislature",
  },
  {
    category: "First 48 hours",
    details: "7-step action plan",
    source: "Defense methodology",
  },
  {
    category: "Agency incidents",
    details: "4 reported (2019\u20132025)",
    source: "Fatal Encounters",
  },
] as const;

const FAQ_ITEMS = [
  {
    question: "What\u2019s in the Arrest Survival Kit?",
    answer:
      "A state-specific know-your-rights checklist written in plain English, a step-by-step action plan for the first 48 hours after arrest, bail hearing preparation materials, and agency incident data for your arresting agency (where available). Every data point includes a source.",
  },
  {
    question: "I\u2019ve already been arrested \u2014 is this still useful?",
    answer:
      "Yes. Most of the kit\u2019s value is in what happens AFTER arrest \u2014 the first 48 hours, your bail hearing, and knowing what statements can hurt your case going forward. The rights checklist also helps you identify whether your rights were violated during the arrest itself.",
  },
  {
    question: "Is this legal advice?",
    answer:
      "No. This is legal INFORMATION \u2014 verified rights and procedures from official sources. Decisions about how to use this information stay with you.",
  },
  {
    question: "How is it delivered?",
    answer:
      "On purchase. Generated on demand for your state and sent to your inbox.",
  },
  {
    question: "What if you don\u2019t have data for my agency?",
    answer:
      "The rights checklist and action plan are available for all 50 states. Agency incident data depends on public records availability \u2014 if we don\u2019t have data for your specific agency, you\u2019ll still receive everything else. You\u2019ll see coverage details before checkout.",
  },
  {
    question:
      "How is this different from the Officer Background Check?",
    answer:
      "The Arrest Survival Kit covers YOUR rights and what to do in the first 48 hours. The Officer Background Check (\u002497) digs into the arresting officer\u2019s track record \u2014 cross-case reliability, testimony challenges, and procedural violations. They complement each other: the Kit tells you what to do, the Background Check tells you who you\u2019re dealing with.",
  },
] as const;

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

export default function ArrestSurvivalKitPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      {/* ---------- HERO ---------- */}
      <FadeInUp>
        <section aria-labelledby="hero-heading" className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
            Arrest Survival Kit
          </p>

          <p className="mb-6 text-base leading-relaxed text-zinc-400">
            Most defendants don&rsquo;t know what to say &mdash; or what NOT to
            say &mdash; in the first 48 hours after arrest. That silence costs
            them. This kit makes sure it doesn&rsquo;t cost you.
          </p>

          <h1
            id="hero-heading"
            className="font-display mt-4 text-4xl font-extrabold leading-tight text-white sm:text-5xl"
          >
            Know Your Rights Before They Read You Yours
          </h1>

          <p className="mt-4 text-lg text-zinc-400">
            Your state-specific rights checklist, first-48-hours action plan,
            and bail hearing preparation &mdash; delivered to your inbox on
            purchase.
          </p>

          <p className="mt-6 text-4xl font-extrabold text-amber-400">
            {TIER_CORE["arrest-survival-kit"].priceDisplay}
          </p>

          <p className="mt-2 text-sm text-zinc-400">
            Less than a single hour in a holding cell feels like &mdash; for
            information that could change every hour after it.
          </p>

          <p className="mt-2 text-sm text-zinc-300">
            State-specific data from verified legal sources
          </p>

          <div className="mt-6">
            <AvailabilityChecker
              slug="arrest-survival-kit"
              productName="Arrest Survival Kit"
              priceDisplay={TIER_CORE["arrest-survival-kit"].priceDisplay}
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

      {/* ---------- SAMPLE DATA ---------- */}
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
                Sample arrest survival data &mdash; Pinellas County, FL
              </caption>
              <thead className="border-b border-zinc-700 bg-zinc-900">
                <tr>
                  <th
                    scope="col"
                    className="px-4 py-3 font-semibold text-zinc-200"
                  >
                    Category
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 font-semibold text-zinc-200"
                  >
                    Details
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
                {SAMPLE_ROWS.map((row) => (
                  <tr key={row.category}>
                    <th
                      scope="row"
                      className="whitespace-nowrap px-4 py-3 font-medium text-zinc-300"
                    >
                      {row.category}
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
            Every right listed in your kit comes from the actual text of your
            state&rsquo;s statutes and the U.S. Constitution. No summaries from
            unnamed sources. No guesswork. Every data point traces back to a
            real source you can check yourself.
          </p>

          <p className="mt-3 text-sm text-zinc-400">
            Agency incident data compiled from Fatal Encounters and verified
            public records. State-specific arrest procedures sourced from
            official state legislature publications. Constitutional protections
            referenced directly from federal and state law.
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
            Get Your Arrest Survival Kit &mdash;{" "}
            <span className="text-amber-400">
              {TIER_CORE["arrest-survival-kit"].priceDisplay}
            </span>
          </h2>

          <p className="mt-4 text-zinc-400">
            The system doesn&rsquo;t wait for you to figure it out. Hearings get
            scheduled, statements get used, and mistakes in the first 48 hours
            follow you through trial. Know what to do before you&rsquo;re asked
            to do it.
          </p>

          <div className="mt-6">
            <AvailabilityChecker
              slug="arrest-survival-kit"
              productName="Arrest Survival Kit"
              priceDisplay={TIER_CORE["arrest-survival-kit"].priceDisplay}
            />
          </div>

          <p className="mt-4 text-xs text-zinc-400">
            This is legal information, not legal advice. ImNotAnAttorney
            provides verified legal data to help you prepare for conversations
            with your attorney. Decisions about how to use this information stay with you.
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

          <p className="mt-4 text-sm text-zinc-400">
            Want deeper analysis?{" "}
            <a
              href="/officer-background-check"
              className="text-amber-400 underline decoration-amber-400/50 hover:decoration-amber-400"
            >
              Officer Background Check
            </a>
            {" "}&mdash; cross-case reliability analysis of your arresting
            officer for{" "}
            {TIER_CORE["officer-background-check"].priceDisplay}.
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
            name: "Arrest Survival Kit",
            description:
              "State-specific know-your-rights checklist, first-48-hours action plan, bail hearing preparation, and agency incident data. Instant delivery.",
            url: `${SITE_URL}/arrest-survival-kit`,
            brand: {
              "@type": "Organization",
              "@id": "https://imnotanattorney.com/#organization",
            },
            offers: {
              "@type": "Offer",
              price: "47.00",
              priceCurrency: "USD",
              availability: "https://schema.org/InStock",
              url: `${SITE_URL}/checkout?standaloneProduct=arrest-survival-kit`,
            },
          }),
        }}
      />

      {/* ---------- JSON-LD: BreadcrumbList ---------- */}
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
                name: "Arrest Survival Kit",
                item: `${SITE_URL}/arrest-survival-kit`,
              },
            ],
          }),
        }}
      />

      {/* ---------- JSON-LD: FAQPage ---------- */}
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

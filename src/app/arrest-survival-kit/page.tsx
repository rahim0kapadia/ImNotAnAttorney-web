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
      "What happens to you in the next 72 hours after arrest in your state. First-appearance window, public-defender attach, bail types, phone-call rule, recording-police law, expungement window. Sourced from state statutes and court rules.",
    alternates: { canonical: `${SITE_URL}/arrest-survival-kit` },
    openGraph: {
      title:
        "Arrest Survival Kit, What Happens Next in Your State",
      description:
        "Your state's first-appearance window, PD-attach trigger, bail types, phone-call rule, recording-police law, and expungement window. Sourced from state statutes and court rules. Instant delivery.",
      url: `${SITE_URL}/arrest-survival-kit`,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Static data                                                        */
/* ------------------------------------------------------------------ */

const FEATURES = [
  "First-appearance window in your state, in hours, with the rule that sets it",
  "When the public defender attaches, and the indigency standard that gates eligibility",
  "Bail / release types your state allows, with the statute that authorizes each",
  "Phone-call rule, the statutory or court-rule right to contact a person after booking",
  "Recording-police consent rule for your state, one-party / all-party / restricted",
  "Expungement or sealing window, with the waiting period and statute citation",
  "1-3 state-specific quirks the rest of the courtroom already knows",
  "Universal constitutional rights checklist + first-72-hours timeline + what NOT to say",
] as const;

const SAMPLE_ROWS = [
  {
    category: "First-appearance window",
    details: "24 hours from arrest",
    source: "Fla. R. Crim. P. 3.130",
  },
  {
    category: "Public defender attaches",
    details: "At first appearance",
    source: "Fla. R. Crim. P. 3.130",
  },
  {
    category: "Indigency standard",
    details: "200% of federal poverty guidelines",
    source: "Fla. Stat. \u00a7 27.52",
  },
  {
    category: "Recording police",
    details: "All-party consent",
    source: "Fla. Stat. \u00a7 934.03",
  },
] as const;

const FAQ_ITEMS = [
  {
    question: "What\u2019s in the Arrest Survival Kit?",
    answer:
      "Your state\u2019s procedural facts: first-appearance window, when the public defender attaches, indigency standard, bail / release types, the phone-call rule, recording-police consent, and expungement window. Plus the universal rights checklist, first-72-hours timeline, and a list of statements that hurt defendants. Every state-level fact links to its source statute or court rule.",
  },
  {
    question: "I\u2019ve already been arrested \u2014 is this still useful?",
    answer:
      "Yes. The kit is built for the window AFTER arrest. The procedural section maps what the legal system will do next in your state. The rights checklist helps you read backward through the arrest itself; the first-72-hours timeline maps the rest of the window forward.",
  },
  {
    question: "Is this legal advice?",
    answer:
      "No. This is legal information drawn from state statutes, court rules, and public-defender / state-bar publications. Every fact links to its source. Decisions about how to use this information stay with you and the people you bring into your case.",
  },
  {
    question: "How is it delivered?",
    answer:
      "On purchase. Generated on demand for your state and sent to your inbox within about 60 seconds.",
  },
  {
    question: "What if my state\u2019s data is incomplete?",
    answer:
      "Some procedural facts are county-by-county rather than statewide \u2014 published bail schedules are the most common gap. When that happens, the report flags the gap explicitly rather than guessing, and the rest of the section reflects what the state-level law does establish. The universal rights checklist and first-72-hours timeline apply in every state.",
  },
  {
    question:
      "How is this different from the Officer Background Check?",
    answer:
      "The Arrest Survival Kit covers what the legal system does next — the procedural map for your state. The Officer Background Check (\u002497) digs into the arresting officer\u2019s track record across cases. They complement each other: the Kit shows you the procedural floor, the Background Check shows you who\u2019s standing on the other side of the courtroom.",
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
            Everyone in the courtroom &mdash; judge, prosecutor, defense
            attorney &mdash; already knows what happens next in your state.
            You&rsquo;re the only stranger in the room. This kit closes that
            gap.
          </p>

          <h1
            id="hero-heading"
            className="font-display mt-4 text-4xl font-extrabold leading-tight text-white sm:text-5xl"
          >
            What Happens to You in the Next 72 Hours
          </h1>

          <p className="mt-4 text-lg text-zinc-400">
            Your state&rsquo;s first-appearance window, when the public
            defender attaches, bail / release types, the phone-call rule,
            recording-police consent, and the expungement window. Sourced
            from state statutes and court rules. Delivered to your inbox in
            about 60 seconds.
          </p>

          <p className="mt-6 text-4xl font-extrabold text-amber-400">
            {TIER_CORE["arrest-survival-kit"].priceDisplay}
          </p>

          <p className="mt-2 text-sm text-zinc-400">
            Less than a single hour in a holding cell feels like &mdash; for
            the procedural map of the next three days.
          </p>

          <p className="mt-2 text-sm text-zinc-300">
            Every fact links to its source statute or court rule
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
                Sample arrest-survival procedural data &mdash; Florida
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
            Every procedural fact comes from the actual text of your state&rsquo;s
            statutes, court rules, and public-defender or state-bar
            publications. No summaries from unnamed sources. No guesswork.
            Every line links to a source you can check yourself.
          </p>

          <p className="mt-3 text-sm text-zinc-400">
            When a fact is genuinely county-level rather than statewide, the
            report flags the gap explicitly &mdash; we don&rsquo;t fill it
            with a guess. Constitutional protections reference federal and
            state law directly.
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
            The system doesn&rsquo;t wait for you to figure it out. The
            first-appearance window starts the moment you&rsquo;re booked.
            Bail gets set. Statements get used. The kit gives you the
            procedural map before you need it.
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
              "What happens to you in the next 72 hours after arrest in your state. First-appearance window, public-defender attach, bail / release types, phone-call rule, recording-police consent, and expungement window. Sourced from state statutes and court rules. Instant delivery.",
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

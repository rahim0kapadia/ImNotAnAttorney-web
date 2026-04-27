/**
 * Precedent Watchlist landing page (/precedent-watchlist)
 *
 * Standalone Tier 9 data product, $47, instant + 30-day email drip.
 * Activates citation_velocity_criminal (1.13M rows) — see
 * src/lib/tier9-reports/precedent-watchlist.ts for resolver scope + UPL.
 *
 * Built 2026-04-27 to close C2 of docs/plans/2026-04-26-worry-tier9-flipped-
 * live.md. PR #188 stop-the-bleed reverted this SKU to dark because no
 * dedicated landing route existed — customers reaching the generic
 * /services/<slug> fallback could not collect chargeType pre-purchase, so
 * the 4-email drip seed (orders.watchlist_email_state JSONB) was fragile.
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
    title: `Precedent Watchlist, ${TIER_CORE["precedent-watchlist"].priceDisplay} | ImNotAnAttorney`,
    description:
      "Top 10 fastest-rising and top 5 fastest-fading criminal-defense precedents for your charge type. Arrow-glyph velocity deltas over the last 24 months, every row linked to CourtListener, plus 4 weekly email updates over 30 days.",
    alternates: { canonical: `${SITE_URL}/precedent-watchlist` },
    openGraph: {
      title:
        "Precedent Watchlist — Which Precedents Are Gaining And Fading For Your Charge",
      description:
        "Top 10 rising and top 5 fading criminal-defense precedents for your charge, plus 4 weekly email updates over 30 days. Sourced from 1.13M citation-velocity rows.",
      url: `${SITE_URL}/precedent-watchlist`,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Static data                                                        */
/* ------------------------------------------------------------------ */

const CHECK_ITEMS = [
  "Top 10 fastest-rising criminal-defense precedents for your charge type — case name, citation, authority tier, citation-velocity arrow, and CourtListener URL",
  "Top 5 fastest-fading precedents for your charge — what defense filings used to lean on but increasingly don't",
  "24-month rolling citation-velocity window — same delta the derivation pipeline computes quarterly across 1.13M citation rows",
  "Every row links to the CourtListener opinion you can verify yourself — no row ships without a source URL",
  "30-day email drip: 4 weekly updates surfacing the latest velocity-rank shifts for your charge",
  "When the charge type has zero rising rows, the report falls back to the national criminal rising-precedent pool with the fallback called out clearly",
  "Citation velocity reflects which precedents are gaining or fading. Use it as a starting point for research, not a verdict.",
] as const;

const SAMPLE_ROWS = [
  {
    metric: "Citation-velocity rows tracked",
    value: "1,131,000+ rows",
    source: "citation_velocity_criminal",
  },
  {
    metric: "Rolling window per row",
    value: "24 months",
    source: "VELOCITY_WINDOW_MONTHS",
  },
  {
    metric: "Rising-precedent rows surfaced per pack",
    value: "Top 10",
    source: "rising_flag = true",
  },
  {
    metric: "Fading-precedent rows surfaced per pack",
    value: "Top 5",
    source: "velocity_tier = fading",
  },
  {
    metric: "Email cadence after purchase",
    value: "4 weekly updates over 30 days",
    source: "/api/cron/precedent-watchlist-emails",
  },
] as const;

const FAQ_ITEMS = [
  {
    question: "What is in the Precedent Watchlist?",
    answer:
      "Three sections built from the citation-velocity corpus: (1) the top 10 fastest-rising criminal-defense precedents for your charge type — case name, citation, authority tier, velocity arrow, and CourtListener URL; (2) the top 5 fastest-fading precedents — what defense filings used to cite but increasingly don't; (3) methodology and a UPL disclaimer. Every row links to CourtListener.",
  },
  {
    question: "What about the 30-day email drip?",
    answer:
      "After purchase you receive up to 4 weekly emails over 30 days. Each email surfaces the latest rank shifts in the rising and fading lists for your charge type — when a precedent climbs into the top 10 or drops out, you see it. The drip seed is set at purchase from the chargeType you selected; no further intake required. You can unsubscribe at any time.",
  },
  {
    question: "Where does the data come from?",
    answer:
      "Indexed criminal court records aggregated into citation_velocity_criminal (1.13M velocity rows, 24-month rolling window, computed quarterly by the derivation pipeline). Rising-precedent rows are flagged when the velocity slope crosses the rising threshold; fading rows when the velocity tier drops to fading. Every cited case carries a CourtListener URL.",
  },
  {
    question: "Is this legal advice?",
    answer:
      "No. This is legal INFORMATION — aggregate citation-velocity deltas across public criminal-defense opinions. Citation velocity reflects which precedents are gaining or fading. Use it as a starting point for research, not a verdict.",
  },
  {
    question: "What if my charge type has thin rising-precedent coverage?",
    answer:
      "Before checkout you will see how many rising and fading precedents back your charge type. When the charge-specific rising count is zero, the report falls back to the national criminal rising-precedent pool with the fallback called out on every section. The Availability Checker discloses the fallback before purchase so you can decide whether to buy or waitlist.",
  },
  {
    question: "How is this different from the Charge Authority Pack?",
    answer:
      `The Precedent Watchlist tracks which precedents are GAINING or FADING citation weight for your charge over the last 24 months — a directional signal. The Charge Authority Pack (${TIER_CORE["charge-authority-pack"].priceDisplay}) gives you the current top 10 must-cite authorities with pre-extracted canonical quotes — a snapshot. Watchlist also includes the 30-day email drip; the Pack is single-delivery.`,
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
      name: "Precedent Watchlist",
      item: `${SITE_URL}/precedent-watchlist`,
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

export default function PrecedentWatchlistPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      {/* ---------- HERO ---------- */}
      <FadeInUp>
        <section aria-labelledby="hero-heading" className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
            Precedent Watchlist
          </p>

          <p className="mb-6 text-base leading-relaxed text-zinc-400">
            Defense precedent isn't static. Some opinions get cited more every
            quarter. Others quietly fall out of rotation. Most defendants
            never see the trajectory — they just see whatever the brief
            template was last refreshed with.
          </p>

          <h1
            id="hero-heading"
            className="font-display mt-4 text-4xl font-extrabold leading-tight text-white sm:text-5xl"
          >
            Which Precedents Are Gaining And Fading For Your Charge
          </h1>

          <p className="mt-4 text-lg text-zinc-400">
            Top 10 rising and top 5 fading criminal-defense precedents for your
            charge type, 24-month velocity arrows on every row, every row
            linked to CourtListener &mdash; plus 4 weekly email updates over
            the next 30 days.
          </p>

          <p className="mt-6 text-base text-zinc-300 italic">
            Citation velocity reflects which precedents are gaining or fading.
            Use it as a starting point for research, not a verdict.
          </p>

          <p className="mt-6 text-4xl font-extrabold text-amber-400">
            {TIER_CORE["precedent-watchlist"].priceDisplay}
          </p>

          <p className="mt-2 text-sm text-zinc-400">
            Generated instantly &mdash; followed by 4 weekly email updates over
            30 days.
          </p>

          <p className="mt-2 text-sm text-zinc-300">
            Verified public sources: CourtListener appellate authorities &times;
            24-month citation-velocity tracking &times; quarterly REPLACE-mode
            derivation
          </p>

          <div id="availability" className="mt-6 scroll-mt-24">
            <AvailabilityChecker
              slug="precedent-watchlist"
              productName="Precedent Watchlist"
              priceDisplay={
                TIER_CORE["precedent-watchlist"].priceDisplay
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

      {/* ---------- DRIP EXPLAINER ---------- */}
      <FadeInUp>
        <section aria-labelledby="drip-heading" className="mt-20">
          <h2
            id="drip-heading"
            className="font-display text-2xl font-bold text-white"
          >
            The 30-Day Email Drip
          </h2>

          <p className="mt-4 text-zinc-400">
            Citation velocity moves quarterly. A single snapshot tells you
            where the lists stand the day you buy. The drip tells you when
            the lists shift while your case is still active.
          </p>

          <ul className="mt-6 space-y-3 text-zinc-300">
            <li className="flex items-start gap-3">
              <CheckIcon />
              <span>
                <strong className="text-white">Day 0:</strong> instant report
                with the current top 10 rising and top 5 fading precedents for
                your charge type.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <CheckIcon />
              <span>
                <strong className="text-white">Days 7, 14, 21, 28:</strong>{" "}
                up to 4 weekly emails surfacing rank shifts &mdash; new
                entrants into the top 10, drops out of the list, fading-tier
                additions.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <CheckIcon />
              <span>
                <strong className="text-white">Drip seed:</strong> set at
                purchase from the charge type you select. No further intake
                required. Unsubscribe at any time.
              </span>
            </li>
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
            Sample Watchlist Inventory
          </h2>

          <div className="mt-8 overflow-x-auto rounded-lg border border-zinc-700">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Sample precedent-watchlist corpus inventory
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
            Inventory shown to illustrate corpus shape. Your watchlist contains
            the top 10 rising and top 5 fading precedents scoped to the charge
            slug you select, each with citation, velocity arrow, and a
            CourtListener URL.
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
            Velocity arrows reflect a 24-month rolling window over the
            citation_velocity_criminal corpus &mdash; the same derivation the
            quarterly REPLACE-mode pipeline computes. Rows without a
            CourtListener source URL are suppressed rather than rendered.
          </p>

          <p className="mt-3 text-sm text-zinc-400">
            Rising and fading rows are scoped to the internal charge slugs
            bridged from your selected user-facing charge. When the bridge
            returns zero rising rows, the report falls back to the national
            criminal rising-precedent pool and the fallback is called out on
            every section. The Availability Checker on this page discloses
            the fallback before purchase when it applies.
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
            Get the Precedent Watchlist &mdash;{" "}
            <span className="text-amber-400">
              {TIER_CORE["precedent-watchlist"].priceDisplay}
            </span>
          </h2>

          <p className="mt-4 text-zinc-400">
            Most defendants find out their go-to precedent has been quietly
            losing weight only when the prosecutor cites a newer, sharper case
            in the same line. Defendants who prepare watch the velocity month
            over month and adjust before the courtroom does. Yours in 60
            seconds, plus 4 weekly updates over the next 30 days.
          </p>

          <div className="mt-6">
            <AvailabilityChecker
              slug="precedent-watchlist"
              productName="Precedent Watchlist"
              priceDisplay={
                TIER_CORE["precedent-watchlist"].priceDisplay
              }
            />
          </div>

          <p className="mt-4 text-xs text-zinc-400">
            This is legal information, not legal advice. The watchlist
            reproduces verifiable citations and aggregate citation-velocity
            deltas from public criminal-defense opinions. Decisions about
            how to use the information stay with you.
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
            name: "Precedent Watchlist",
            description:
              "Top 10 fastest-rising and top 5 fastest-fading criminal-defense precedents for your charge type, with 24-month citation-velocity arrows, every row linked to CourtListener, plus 4 weekly email updates over 30 days.",
            url: `${SITE_URL}/precedent-watchlist`,
            brand: {
              "@type": "Organization",
              "@id": "https://imnotanattorney.com/#organization",
            },
            offers: {
              "@type": "Offer",
              price: "47.00",
              priceCurrency: "USD",
              availability: "https://schema.org/InStock",
              url: `${SITE_URL}/checkout?standaloneProduct=precedent-watchlist`,
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

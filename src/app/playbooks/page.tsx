/**
 * Playbook Catalog Page (/playbooks)
 *
 * Browsable catalog of all defense playbooks organized in a card grid.
 * Each card links to the individual playbook sales page at /playbook/{slug}.
 *
 * User journey position:
 *   Nav / Blog / Landing page -> THIS PAGE -> /playbook/{slug} -> /checkout
 *
 * Page structure:
 *   1. Hero, "Defense Playbooks" heading with charge-type selection prompt
 *   2. Card grid, 4-col desktop, 2-col tablet, 1-col mobile
 *   3. Value props, What's inside every playbook (6 items)
 *   4. UPL disclaimer
 *
 * Filtering: Only displays playbooks where TIER_CORE[slug].live === true.
 * Display order: Most common charge types first (DUI, Drug Possession, etc.)
 */
import { FadeInUp } from "@/components/motion/FadeInUp";
import { SITE_URL } from "@/lib/site";
import { TIER_CORE } from "@/lib/tiers";
import type { TierSlug } from "@/lib/tiers";
import { getPlaybookConfig } from "@/lib/playbook-configs";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Defense Playbooks, Instant Download",
  description:
    "Choose your charge type and get an instant-download defense playbook: 26 questions that change how your next attorney meeting goes, case stage roadmap, red flag checklist, attorney scorecard, and emergency guide.",
  alternates: {
    canonical: `${SITE_URL}/playbooks`,
  },
  openGraph: {
    title: "Defense Playbooks, Instant Download",
    description:
      "Choose your charge type. Get 26 questions that change how your next attorney meeting goes, a case stage roadmap, red flag checklist, and attorney scorecard. Instant PDF download.",
    url: `${SITE_URL}/playbooks`,
    type: "website",
  },
};

/**
 * Ordered list of playbook slugs, most common charge types first.
 * Only slugs with live: true in TIER_CORE will render.
 */
const DISPLAY_ORDER: TierSlug[] = [
  "dui-first-offense",
  "drug-possession",
  "drug-trafficking",
  "probation-violation",
  "white-collar",
  "sex-offense",
  "federal-criminal",
  "self-defense",
];

/** Value propositions shown below the card grid. */
const VALUE_PROPS = [
  {
    icon: "\u2753", // question mark
    title: "26 Questions",
    desc: "Attorney-calibrated questions that expose weak spots in your case and force accountability.",
  },
  {
    icon: "\uD83D\uDDFA\uFE0F", // map
    title: "Case Stage Roadmap",
    desc: "Every stage from arrest to resolution mapped out so you always know what comes next.",
  },
  {
    icon: "\uD83D\uDEA9", // flag
    title: "Red Flag Checklist",
    desc: "12 warning signs that your case is being mishandled, with specific actions for each.",
  },
  {
    icon: "\uD83D\uDCCB", // clipboard
    title: "Attorney Scorecard",
    desc: "Grade your attorney on responsiveness, strategy, and preparation with objective criteria.",
  },
  {
    icon: "\u26A1", // lightning
    title: "Emergency Guide",
    desc: "Critical first steps for the first 24-72 hours when every decision matters most.",
  },
  {
    icon: "\u2B06\uFE0F", // up arrow
    title: "Upgrade Path",
    desc: "Every dollar you spend rolls forward. Upgrade to deeper intelligence when you need it.",
  },
];

/**
 * Strip " Defense Playbook" or " / Justifiable Force Defense Playbook" suffix
 * from tier name to get a clean charge-type label for the card.
 */
function chargeTypeName(tierName: string): string {
  return tierName
    .replace(/ \/ Justifiable Force Defense Playbook$/, "")
    .replace(/ Defense Playbook$/, "");
}

/**
 * Truncate text to maxLen characters at a word boundary, adding ellipsis.
 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + "\u2026";
}

export default function PlaybooksCatalogPage() {
  // Filter to only live playbooks, preserving display order
  const livePlaybooks = DISPLAY_ORDER.filter(
    (slug) => TIER_CORE[slug]?.live === true
  );

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* ── Hero Section ── */}
      <section className="px-4 pt-24 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl text-center">
          <FadeInUp>
            <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-amber-400">
              Instant Download &middot; from {TIER_CORE["dui-first-offense"].priceDisplay}
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Defense Playbooks
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-400">
              Choose your charge type. Get 26 questions that change how your
              next attorney meeting goes, a case stage roadmap, red flag
              checklist, attorney scorecard, and emergency guide &mdash;
              delivered instantly.
            </p>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-zinc-400">
              Join thousands of defendants who refused to go into court
              unprepared.
            </p>
          </FadeInUp>
        </div>
      </section>

      {/* ── Card Grid ── */}
      <section className="px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {livePlaybooks.map((slug, i) => {
              const tier = TIER_CORE[slug];
              const config = getPlaybookConfig(slug);
              const name = chargeTypeName(tier.name);
              const description = config?.hero?.subheadline
                ? truncate(config.hero.subheadline, 120)
                : "Charge-specific defense playbook with 26 questions, roadmap, and red flag checklist.";

              return (
                <FadeInUp key={slug} delay={i * 0.08}>
                  <Link
                    href={`/playbook/${slug}`}
                    className="group flex h-full flex-col rounded-xl border border-zinc-500 bg-zinc-900/50 p-6 transition-all duration-200 hover:border-amber-400/60 hover:bg-zinc-900/80"
                  >
                    {/* Charge type label */}
                    <h2 className="text-lg font-bold text-white group-hover:text-amber-400 transition-colors duration-200">
                      {name}
                    </h2>

                    {/* Description */}
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-zinc-400">
                      {description}
                    </p>

                    {/* Price + delivery */}
                    <div className="mt-5 flex items-center justify-between border-t border-zinc-500 pt-4">
                      <span className="text-xl font-bold text-white">
                        {tier.priceDisplay}
                      </span>
                      <span className="text-xs font-medium text-amber-400/80">
                        {tier.delivery}
                      </span>
                    </div>

                    {/* CTA hint */}
                    <div className="mt-3 text-center">
                      <span className="inline-block rounded-lg bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-400 transition-colors duration-200 group-hover:bg-amber-400 group-hover:text-zinc-950">
                        View Playbook
                      </span>
                    </div>
                  </Link>
                </FadeInUp>
              );
            })}
          </div>

          {/* Empty state, if no playbooks are live yet */}
          {livePlaybooks.length === 0 && (
            <div className="py-20 text-center">
              <p className="text-lg text-zinc-400">
                Playbooks are coming soon. Check back shortly.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── Value Props: What's Inside Every Playbook ── */}
      <section className="border-t border-zinc-500/50 px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <FadeInUp>
            <h2 className="text-center text-3xl font-bold text-white sm:text-4xl">
              What&rsquo;s Inside Every Playbook
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-zinc-400">
              Built from methods developed by elite defense attorneys across
              375+ exonerations and thousands of criminal cases. Grounded in
              595,851 federal sentencing records, 15,386 judge profiles, and
              4,699 verified statutes across 52 jurisdictions.
            </p>
          </FadeInUp>

          <div className="mt-14 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {VALUE_PROPS.map((prop, i) => (
              <FadeInUp key={prop.title} delay={i * 0.06}>
                <div className="rounded-xl border border-zinc-500 bg-zinc-900/50 p-6">
                  <div className="mb-3 text-2xl">{prop.icon}</div>
                  <h3 className="text-lg font-semibold text-white">
                    {prop.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                    {prop.desc}
                  </p>
                </div>
              </FadeInUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contact Callout ── */}
      <p className="mt-8 text-center text-sm text-zinc-400">
        Questions before you start?{" "}
        <a href="mailto:help@imnotanattorney.com" className="text-amber-400 underline hover:text-amber-300">
          help@imnotanattorney.com
        </a>{" "}
       , usually same day.
      </p>

      {/* ── UPL Disclaimer ── */}
      <section className="border-t border-zinc-500/50 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm leading-relaxed text-zinc-400">
            These playbooks provide legal information, not legal advice. The
            analysis draws on methods developed by elite defense attorneys,
            applied specifically to your charge type. Your attorney remains the
            final authority on strategy decisions.
          </p>
        </div>
      </section>
    </div>
  );
}

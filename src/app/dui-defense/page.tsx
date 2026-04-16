/**
 * DUI Defense Hub Page (/dui-defense)
 *
 * Index page linking to all 50 state-specific DUI defense pages.
 * Provides a hub for the /dui-defense/[state] programmatic pages,
 * improving internal linking and giving search engines a clear
 * parent-child relationship for the DUI defense content cluster.
 *
 * User journey position:
 *   Blog / Landing / Nav -> THIS PAGE -> /dui-defense/[state]
 *                                     -> /dui-checklist
 *                                     -> /score
 */
import { SITE_URL } from "@/lib/site";
import { TIER_CORE } from "@/lib/tiers";
import { allStateSlugs, getStateDuiData } from "@/data/state-dui-laws";
import { FadeInUp } from "@/components/motion/FadeInUp";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DUI Defense Resources by State",
  description:
    "State-specific DUI defense resources for all 50 states. BAC limits, penalties, DMV deadlines, and the questions to ask your attorney, by state.",
  alternates: {
    canonical: `${SITE_URL}/dui-defense`,
  },
  openGraph: {
    title: "DUI Defense Resources by State",
    description:
      "State-specific DUI laws, penalties, and defense questions for all 50 states.",
    url: `${SITE_URL}/dui-defense`,
    type: "website",
  },
};

export default function DuiDefenseHubPage() {
  const slugs = allStateSlugs();
  const states = slugs
    .map((slug) => {
      const data = getStateDuiData(slug);
      return data ? { slug, name: data.name, abbr: data.abbr } : null;
    })
    .filter(Boolean) as { slug: string; name: string; abbr: string }[];

  // Sort alphabetically by state name
  states.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      {/* Breadcrumb schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
              { "@type": "ListItem", position: 2, name: "DUI Defense" },
            ],
          }),
        }}
      />

      {/* ItemList schema for state pages */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: "DUI Defense Resources by State",
            description:
              "State-specific DUI defense information for all 50 US states.",
            numberOfItems: states.length,
            itemListElement: states.map((s, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: `${s.name} DUI Defense`,
              url: `${SITE_URL}/dui-defense/${s.slug}`,
            })),
          }),
        }}
      />

      <FadeInUp>
        <h1 className="font-display text-3xl font-bold text-white md:text-4xl">
          DUI Defense Resources by State
        </h1>
        <p className="mt-4 text-lg text-zinc-400">
          You were just arrested for DUI. The laws that affect your case
          &mdash; penalties, deadlines, defense options &mdash; depend entirely
          on where you were charged. Select your state below to see the
          specific information that applies to your situation.
        </p>
        <p className="mt-3 text-sm text-zinc-400">
          Over 1.5 million DUI arrests happen every year. You are not the
          first person to go through this. Defense questions built on Lawrence
          Taylor&rsquo;s systematic DUI defense framework and NHTSA field
          sobriety test standards.
        </p>
      </FadeInUp>

      {/* STATE GRID */}
      <FadeInUp>
        <div className="mt-12 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {states.map((s) => (
            <Link
              key={s.slug}
              href={`/dui-defense/${s.slug}`}
              className="flex items-center justify-between rounded-lg border border-zinc-500 bg-zinc-900/50 px-4 py-3 text-sm transition-colors hover:border-amber-500/30 hover:bg-zinc-900"
            >
              <span className="font-medium text-zinc-300">{s.name}</span>
              <span className="text-xs text-zinc-400">{s.abbr}</span>
            </Link>
          ))}
        </div>
      </FadeInUp>

      {/* ADDITIONAL RESOURCES */}
      <FadeInUp>
        <section className="mt-16">
          <h2 className="font-display text-2xl font-bold text-white">
            Additional DUI Resources
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Defense questions built on Lawrence Taylor&rsquo;s systematic DUI
            defense framework and NHTSA field sobriety test standards.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Link
              href="/score?charge=dui"
              className="rounded-xl border border-zinc-500 bg-zinc-900/50 p-6 transition-colors hover:border-amber-500/30"
            >
              <p className="font-semibold text-amber-400">
                Defense Milestone Score
              </p>
              <p className="mt-2 text-sm text-zinc-400">
                Check 10 critical defense behaviors specific to DUI cases. Free,
                instant results. Takes 2 minutes.
              </p>
            </Link>
            <Link
              href="/playbook/dui-first-offense"
              className="rounded-xl border border-zinc-500 bg-zinc-900/50 p-6 transition-colors hover:border-amber-500/30"
            >
              <p className="font-semibold text-amber-400">
                DUI Defense Playbook &mdash; {TIER_CORE["dui-first-offense"].priceDisplay}
              </p>
              <p className="mt-2 text-sm text-zinc-400">
                26 questions that change how your next DUI attorney meeting
                goes, a breathalyzer calibration checklist, case stage roadmap,
                12 red flags, and a Case Progress Scorecard. Instant PDF
                download.
              </p>
            </Link>
          </div>
        </section>
      </FadeInUp>

      {/* DISCLAIMER */}
      <section className="mt-12">
        <div className="rounded-lg border border-zinc-500 bg-zinc-900/50 p-4">
          <p className="text-xs text-zinc-400">
            <strong>Important:</strong> This page provides general legal
            information about DUI laws across the United States. Laws change
            frequently. This is not legal advice. Your attorney remains the
            final authority on strategy decisions specific to your situation.
          </p>
        </div>
      </section>
    </div>
  );
}

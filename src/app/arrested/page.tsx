/**
 * /arrested — Crisis-buyer landing page for inbound Reddit / Quora / bio traffic.
 *
 * Purpose: defendants arriving from high-trust but low-specificity discovery
 * surfaces (Reddit username clicks, Quora answer footers, social bio links)
 * need a fast path to the right product. Homepage is too generic. This page
 * validates crisis, presents the 60-second Score as default fast path, and
 * offers a charge-type selector for direct routing to matching playbook.
 *
 * UTM-aware via `?src=` query param (reddit, quora, bio, etc). Param is
 * preserved to downstream routes for analytics attribution.
 *
 * Used by: external bio links + Quora answer footers.
 */
import Link from "next/link";
import type { Metadata } from "next";
import { TIER_CORE } from "@/lib/tiers";

export const metadata: Metadata = {
  title: "Arrested — Here's What to Do in the Next 72 Hours",
  description:
    "If you or someone you love was just arrested, the first 72 hours matter most. Start with the free 60-second Defense Milestone Score, or jump to the playbook for your charge.",
  openGraph: {
    title: "Arrested — Here's What to Do in the Next 72 Hours",
    description:
      "Free 60-second Defense Milestone Score. Charge-specific playbooks. No email required.",
    type: "website",
  },
};

interface PageProps {
  searchParams: Promise<{ src?: string }>;
}

const CHARGE_OPTIONS: {
  slug: keyof typeof TIER_CORE;
  label: string;
  description: string;
}[] = [
  {
    slug: "dui-first-offense",
    label: "DUI / DWI",
    description:
      "DMV hearing deadlines, breathalyzer challenges, first-offense outcomes.",
  },
  {
    slug: "drug-possession",
    label: "Drug Possession / Trafficking",
    description:
      "Constructive possession, lab challenges, field-test reliability.",
  },
  {
    slug: "white-collar",
    label: "White-Collar / Federal",
    description:
      "Federal investigation timelines, cooperation mechanics, motion strategy.",
  },
  {
    slug: "probation-violation",
    label: "Probation Violation",
    description:
      "Technical violations, missed appointments, revocation hearings.",
  },
];

export default async function ArrestedPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const src = params.src || "direct";
  const refSuffix = `src=${encodeURIComponent(src)}`;

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      {/* Hero */}
      <header className="mb-10">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-amber-400">
          Just Arrested?
        </p>
        <h1 className="mb-4 text-3xl font-bold text-white sm:text-4xl">
          The first 72 hours decide more than you think.
        </h1>
        <p className="text-lg text-zinc-300">
          Most defendants miss deadlines nobody told them existed, accept pleas
          before evidence is reviewed, and run out of time while waiting for
          someone else to push the case forward. This page is the fastest path
          to what actually matters for your specific charge.
        </p>
      </header>

      {/* Primary fast path */}
      <section className="mb-10 rounded-xl border border-amber-500/50 bg-amber-500/10 p-6">
        <h2 className="mb-2 text-xl font-bold text-white">
          Start with the 60-second Defense Milestone Score
        </h2>
        <p className="mb-4 text-sm text-zinc-300">
          10 questions. No email required. See where your defense stands versus
          the milestones that matter at each stage of a criminal case.
        </p>
        <Link
          href={`/score?${refSuffix}&ref=arrested-hero`}
          className="inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-semibold text-black transition-all hover:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
        >
          Take the Score, Free &rarr;
        </Link>
      </section>

      {/* Charge selector */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-bold text-white">
          Or jump to the playbook for your charge
        </h2>
        <p className="mb-6 text-sm text-zinc-400">
          Each playbook is a full defense guide: what to do in the first 72
          hours, which motions typically apply, the questions to bring to your
          attorney, and the red flags that separate prepared defendants from
          easy clients.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {CHARGE_OPTIONS.map((c) => {
            const tier = TIER_CORE[c.slug];
            if (!tier?.live) return null;
            return (
              <Link
                key={c.slug}
                href={`/playbook/${c.slug}?${refSuffix}&ref=arrested-charge`}
                className="block rounded-lg border border-zinc-800 bg-zinc-900 p-4 transition-all hover:border-amber-500/60 hover:bg-zinc-800"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-semibold text-white">{c.label}</span>
                  <span className="text-xs font-semibold text-amber-400">
                    {tier.priceDisplay}
                  </span>
                </div>
                <p className="text-xs text-zinc-400">{c.description}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Case Decoder fallback */}
      <section className="mb-10 rounded-lg border border-zinc-800 bg-zinc-900 p-5">
        <h3 className="mb-1 text-base font-semibold text-white">
          Charge not listed, or case is already past the 72-hour window?
        </h3>
        <p className="mb-3 text-sm text-zinc-400">
          The Case Decoder reads your actual paperwork and hands back 15
          specific questions for your next attorney meeting. Delivered in 48
          hours.
        </p>
        <Link
          href={`/checkout?tier=case-decoder&${refSuffix}&ref=arrested-case-decoder`}
          className="inline-block rounded-md border border-amber-500/50 px-4 py-2 text-sm font-semibold text-amber-400 transition-all hover:border-amber-500"
        >
          Case Decoder, {TIER_CORE["case-decoder"].priceDisplay} &rarr;
        </Link>
      </section>

      {/* Free resources */}
      <section className="mb-10">
        <h3 className="mb-3 text-base font-semibold text-white">
          Free resources to read while you decide
        </h3>
        <ul className="space-y-2 text-sm">
          <li>
            <Link
              href={`/blog/dui-first-72-hours-what-to-do?${refSuffix}`}
              className="text-amber-400 hover:text-amber-300"
            >
              DUI First 72 Hours: What to Do Right Now &rarr;
            </Link>
          </li>
          <li>
            <Link
              href={`/blog/10-questions-every-defendant-should-ask?${refSuffix}`}
              className="text-amber-400 hover:text-amber-300"
            >
              10 Questions Every Defendant Should Ask &rarr;
            </Link>
          </li>
          <li>
            <Link
              href={`/blog/how-to-read-your-discovery?${refSuffix}`}
              className="text-amber-400 hover:text-amber-300"
            >
              How to Read Your Discovery &rarr;
            </Link>
          </li>
          <li>
            <Link
              href={`/resources?${refSuffix}`}
              className="text-amber-400 hover:text-amber-300"
            >
              All Free Resources &rarr;
            </Link>
          </li>
        </ul>
      </section>

      {/* Disclaimer */}
      <footer className="border-t border-zinc-800 pt-6 text-xs text-zinc-500">
        This is legal information, not legal advice. Every case is different.
        An attorney familiar with your jurisdiction and the specific facts of
        your case remains the final authority on strategy decisions.
      </footer>
    </main>
  );
}

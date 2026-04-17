"use client";

import { useState } from "react";
import Link from "next/link";
import { ChargeTypeSelector } from "@/components/ChargeTypeSelector";
import { FadeInUp } from "@/components/motion/FadeInUp";
import { TIER_CORE } from "@/lib/tiers";
import type { TierSlug } from "@/lib/tiers";

/**
 * HomepageHero, Dynamic hero with charge-type routing.
 *
 * Positioning rewrite per elite panel consensus (Apex L2 fix, Dunford category anchor,
 * Suby crisis-buyer clarity, Godin 68.3g Purple Cow, Hormozi named deliverable,
 * Brunson epiphany-in-hero, Laja CTA consolidation).
 *
 * Key moves vs prior version:
 *  - H1 names the category + the buyer's fear in under 10 words
 *  - Sub surfaces the 68.3g origin story (previously buried in metadata + section 2)
 *  - Single primary CTA names the DELIVERABLE ("15 Questions") not the activity
 *  - 3-col value anchor row kills the $10K/$197 math in one glance
 *  - Secondary link collapsed to free Score (lead magnet, not pricing jump)
 */
const CATEGORY_TO_PLAYBOOK: Record<string, string> = {
  "dui-driving": "dui-first-offense",
  "drug-offenses": "drug-possession",
  "sex-offenses": "sex-offense",
  "federal-specific": "federal-criminal",
  "probation-parole": "probation-violation",
  "fraud-financial": "white-collar",
};

export function HomepageHero() {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const playbookSlug = selectedSlug ? CATEGORY_TO_PLAYBOOK[selectedSlug] ?? null : null;

  const primaryHref = playbookSlug ? `/checkout?tier=${playbookSlug}` : "/checkout?tier=case-decoder";
  const primaryLabel =
    playbookSlug && TIER_CORE[playbookSlug as TierSlug]
      ? `Get the ${TIER_CORE[playbookSlug as TierSlug].name} \u2014 ${TIER_CORE[playbookSlug as TierSlug].priceDisplay}`
      : `Get Your 15 Questions \u2014 ${TIER_CORE["case-decoder"].priceDisplay}`;

  return (
    <>
      <section className="px-4 pb-10 pt-16 text-center md:pt-24">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-500">
              Know What They Know &middot; Defense Intelligence for Defendants
            </p>
          </FadeInUp>
          <FadeInUp delay={0.05}>
            <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight text-white md:text-6xl">
              Your attorney hasn&apos;t read your case.
              <br />
              <span className="text-amber-400">You&apos;re about to.</span>
            </h1>
          </FadeInUp>
          <FadeInUp delay={0.1}>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-300">
              Our system reads your case the way elite defense attorneys do &mdash; through{" "}
              <span className="font-semibold text-white">40+ documented methodologies</span>:
              chain of custody, informant credibility, constitutional violations, lab protocol breaks.
              In one case it surfaced{" "}
              <span className="font-semibold text-white">68.3 grams of evidence the attorney never mentioned</span>.
              You get the 15 questions your attorney will have to answer on the record.
            </p>
          </FadeInUp>

          {/* 3-col value anchor row: defuses Suby's inverted value equation in one glance */}
          <FadeInUp delay={0.15}>
            <div className="mx-auto mt-8 grid max-w-2xl grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                <div className="text-xl font-bold text-zinc-300 md:text-2xl">$10K+</div>
                <p className="mt-1 text-[11px] leading-tight text-zinc-400">already paid to your attorney</p>
              </div>
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                <div className="text-xl font-bold text-amber-400 md:text-2xl">$197</div>
                <p className="mt-1 text-[11px] leading-tight text-zinc-300">Case Decoder. 15 questions.</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                <div className="text-xl font-bold text-green-500 md:text-2xl">$0</div>
                <p className="mt-1 text-[11px] leading-tight text-zinc-400">if we don&apos;t deliver 15 questions</p>
              </div>
            </div>
          </FadeInUp>

          {/* Charge Type Selector, drives CTA below */}
          <FadeInUp delay={0.2}>
            <ChargeTypeSelector onSelect={setSelectedSlug} />
          </FadeInUp>

          <FadeInUp delay={0.25}>
            <div className="mt-8 flex flex-col items-center gap-3">
              <Link
                href={primaryHref}
                className="rounded-lg bg-amber-500 px-8 py-4 text-base font-bold text-black shadow-lg shadow-amber-500/10 transition-all hover:scale-[1.02] focus-visible:scale-[1.02] hover:bg-amber-400 hover:shadow-amber-500/30"
              >
                {primaryLabel} &rarr;
              </Link>
              <p className="text-sm font-medium text-zinc-300">
                <span className="text-amber-400">Find It or It&apos;s Free</span> &mdash; 15 case-specific questions (Case Decoder / Intelligence Brief) or a discovery gap (X-Ray and above) your attorney hasn&apos;t raised, or full refund.
              </p>
              <p className="text-xs text-zinc-500">
                48-hour delivery &middot; every dollar credits toward higher tiers
              </p>
              <Link
                href="/score"
                className="mt-2 text-sm font-semibold text-amber-400 underline decoration-amber-400/40 underline-offset-4 hover:text-amber-300"
              >
                Not ready? Check your Defense Milestone Score &mdash; free, no email.
              </Link>
            </div>
          </FadeInUp>
        </div>
      </section>

      <section className="px-4 pb-6 text-center">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Built by people who&apos;ve been where you are &middot; For defendants and the people who love them
            </p>
          </FadeInUp>
        </div>
      </section>
    </>
  );
}

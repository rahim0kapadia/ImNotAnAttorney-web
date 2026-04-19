"use client";

import { useState } from "react";
import Link from "next/link";
import { ChargeTypeSelector } from "@/components/ChargeTypeSelector";
import { FadeInUp } from "@/components/motion/FadeInUp";
import { TIER_CORE } from "@/lib/tiers";
import type { TierSlug } from "@/lib/tiers";

/**
 * HomepageHero — Round-3 expert consensus build.
 *
 * Round-3 inputs folded in:
 *  - Godin: tribe identity ABOVE H1 ("For the defendant who stopped waiting"),
 *    68.3g isolated as its own standalone callout (purple cow deserves room),
 *    drop "system" (too SaaS-y) from subhead.
 *  - Brunson: Hook-Story-Offer in 5s; surface $127 Playbook tripwire alongside
 *    free Score so the self-liquidating rung is visible.
 *  - Chaperon: Score + Playbook as co-equal tertiary CTAs (not "not ready?"
 *    apology framing). Trailing eyebrow stays plural peer voice.
 *  - Dreyer: YMYL byline under H1 (methodology date + framework count)
 *    signals a real human built this for a scared reader.
 *  - Suby/Laja: guarantee line tier-aware (CD/IB + X-Ray+ both surfaced);
 *    3-col $0 cell wording matches body ("if we don't deliver 15 questions").
 *  - Hormozi: value anchor 3-col ($10K / $197 / $0) kept — textbook.
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

  // Playbook tripwire — resolves to the charge-specific playbook, defaulting to DUI
  const playbookTripwireHref = playbookSlug ? `/checkout?tier=${playbookSlug}` : "/playbooks";
  const playbookTripwirePrice = playbookSlug && TIER_CORE[playbookSlug as TierSlug]
    ? TIER_CORE[playbookSlug as TierSlug].priceDisplay
    : TIER_CORE["dui-first-offense"].priceDisplay;

  return (
    <>
      <section className="px-4 pb-10 pt-12 text-center md:pt-20">
        <div className="mx-auto max-w-4xl">
          {/* TRIBE IDENTITY / CATEGORY LOCK-IN (Dunford 2026-04-17) — uncopyable positioning statement:
              "Built from inside an open case file" is structurally impossible for named legal-tech founders. */}
          <FadeInUp>
            <p className="font-display text-sm italic text-amber-400 md:text-base">
              Built from inside an open case file &mdash; that&apos;s why we can read yours.
            </p>
          </FadeInUp>
          <FadeInUp delay={0.03}>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
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

          {/* BRAND DNA TAGLINE (canonical long-form) — the thesis of the whole operation. */}
          <FadeInUp delay={0.07}>
            <p className="mt-6 font-display text-xl leading-snug text-zinc-200 md:text-2xl">
              The legal system has a file on you.
              <br />
              <span className="font-semibold text-amber-400">We help you build one on them.</span>
            </p>
          </FadeInUp>

          {/* YMYL byline — Dreyer: scared defendant needs "who made this, when" signal */}
          <FadeInUp delay={0.09}>
            <p className="mt-3 text-xs text-zinc-400">
              Methodology built from 40+ documented defense frameworks &middot; Updated 2026
            </p>
          </FadeInUp>

          {/* PROOF STRIP — patterns we surface across the caselaw corpus.
              Not founder-specific; cross-charge to signal we work every tier.
              Rahim 2026-04-17: drug-only framing alienates other buyers;
              "we can pull from a million cases, we don't need to use Rahims." */}
          <FadeInUp delay={0.1}>
            <p className="mx-auto mt-8 max-w-2xl text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              What we surface across case files &middot; every charge type we read
            </p>
            <div className="mx-auto mt-3 grid max-w-3xl gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-amber-500/30 bg-zinc-900/60 p-5 text-left">
                <p className="font-display text-3xl font-bold text-amber-400 md:text-4xl">
                  73% gap
                </p>
                <p className="mt-2 text-xs text-zinc-400">
                  Weight discrepancies between scene and lab reports. One of the most common gaps we surface in charge-weight cases.
                </p>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-zinc-900/60 p-5 text-left">
                <p className="font-display text-3xl font-bold text-amber-400 md:text-4xl">
                  19 days
                </p>
                <p className="mt-2 text-xs text-zinc-400">
                  Past the breathalyzer&apos;s calibration window &mdash; records most defense attorneys never request. DUI pattern.
                </p>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-zinc-900/60 p-5 text-left">
                <p className="font-display text-3xl font-bold text-amber-400 md:text-4xl">
                  Pre-dated
                </p>
                <p className="mt-2 text-xs text-zinc-400">
                  Transactions that came before the business relationship the government alleged. Timeline mapping rarely performed by default.
                </p>
              </div>
            </div>
            <p className="mx-auto mt-4 max-w-2xl text-sm text-zinc-400">
              Read by researchers with open case files of their own.{" "}
              <Link href="/masked" className="font-semibold text-amber-400 underline decoration-amber-400/40 underline-offset-4 hover:text-amber-300">
                Why we stay masked &rarr;
              </Link>
            </p>
          </FadeInUp>

          <FadeInUp delay={0.13}>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-zinc-300 md:text-lg">
              We read your case the way elite defense attorneys do &mdash; through
              40+ documented methodologies: chain of custody, informant credibility,
              constitutional violations, lab protocol breaks. You get the 15 questions
              your attorney will have to answer on the record.
            </p>
          </FadeInUp>

          {/* 3-col value anchor row — Hormozi inverted value equation in one glance */}
          <FadeInUp delay={0.16}>
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

          {/* Charge Type Selector — drives CTA below */}
          <FadeInUp delay={0.19}>
            <ChargeTypeSelector onSelect={setSelectedSlug} />
          </FadeInUp>

          <FadeInUp delay={0.22}>
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
              <p className="text-xs text-zinc-400">
                48-hour delivery &middot; every dollar credits toward higher tiers
              </p>

              {/* Co-equal tertiary rung — Brunson $127 tripwire + Chaperon free Score */}
              <div className="mt-4 flex flex-col items-center gap-2 text-sm md:flex-row md:gap-6">
                <Link
                  href={playbookTripwireHref}
                  className="font-semibold text-amber-400 underline decoration-amber-400/40 underline-offset-4 hover:text-amber-300"
                >
                  Start with the {playbookTripwirePrice} Defense Playbook &rarr;
                </Link>
                <Link
                  href="/score"
                  className="font-semibold text-amber-400 underline decoration-amber-400/40 underline-offset-4 hover:text-amber-300"
                >
                  Or run your free Masked Researcher&apos;s First Read &rarr;
                </Link>
              </div>
            </div>
          </FadeInUp>
        </div>
      </section>

      <section className="px-4 pb-6 text-center">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Built by defendants who got tired of waiting for answers &middot; For defendants and the people who love them
            </p>
          </FadeInUp>
        </div>
      </section>
    </>
  );
}

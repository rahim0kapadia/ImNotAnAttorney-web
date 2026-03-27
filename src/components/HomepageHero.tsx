"use client";

import { useState } from "react";
import Link from "next/link";
import { ChargeTypeSelector } from "@/components/ChargeTypeSelector";
import { FadeInUp } from "@/components/motion/FadeInUp";
import { TIER_CORE } from "@/lib/tiers";
import type { TierSlug } from "@/lib/tiers";

/**
 * HomepageHero — Dynamic hero with charge-type routing
 *
 * Extracted from page.tsx (Server Component) so the ChargeTypeSelector
 * can drive CTA state. When no charge is selected, defaults to Case Decoder
 * ($197) as primary CTA. When a charge is selected, swaps to that playbook.
 */
export function HomepageHero() {
  const [selectedSlug, setSelectedSlug] = useState<TierSlug | null>(null);

  const selectedTier = selectedSlug ? TIER_CORE[selectedSlug] : null;
  const isPlaybook = selectedTier?.isDigitalProduct ?? false;

  // CTA config based on selection state
  const primaryHref = selectedSlug
    ? `/checkout?tier=${selectedSlug}`
    : "/start";
  const primaryLabel = selectedSlug
    ? `Get Your ${selectedTier!.name} \u2014 ${selectedTier!.priceDisplay}`
    : `Start Your Case Research \u2014 ${TIER_CORE["case-decoder"].priceDisplay}`;

  const secondaryHref = selectedSlug ? "/start" : "/playbooks";
  const secondaryLabel = selectedSlug
    ? `Need deeper analysis? Case Decoder \u2014 ${TIER_CORE["case-decoder"].priceDisplay}`
    : "Browse all Defense Playbooks \u2014 $97 each";

  return (
    <>
      <section className="px-4 pb-16 pt-24 text-center md:pt-32">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-white md:text-6xl">
              Your Case File Has Answers.
              <br />
              <span className="text-amber-400">We Find Them. You Ask.</span>
            </h1>
          </FadeInUp>
          <FadeInUp delay={0.1}>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-300">
              Case-specific research and accountability questions for criminal
              defendants &mdash; built from 40+ defense attorneys&apos;
              documented methods.
            </p>
          </FadeInUp>

          {/* Charge Type Selector — drives CTA below */}
          <FadeInUp delay={0.15}>
            <ChargeTypeSelector onSelect={setSelectedSlug} />
          </FadeInUp>

          <FadeInUp delay={0.2}>
            <div className="mt-8 flex flex-col items-center gap-4">
              <Link
                href={primaryHref}
                className="rounded-lg bg-amber-500 px-8 py-4 text-sm font-bold text-black transition-all hover:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
              >
                {primaryLabel} &rarr;
              </Link>
              <Link
                href={secondaryHref}
                className="text-sm font-semibold text-amber-400 underline decoration-amber-400/50 hover:text-amber-300"
              >
                {secondaryLabel}
              </Link>
              <p className="text-sm text-zinc-300">
                Find It or It&apos;s Free &mdash; if we don&apos;t find
                something your attorney hasn&apos;t raised, full refund.
              </p>
              <p className="text-xs text-zinc-500">
                Every dollar credited toward higher tiers. Credits valid 12
                months.
              </p>
            </div>
          </FadeInUp>
        </div>
      </section>

      <section className="px-4 pb-8 text-center">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <p className="text-sm font-semibold uppercase tracking-wider text-amber-500">
              Built by a defendant who read his own 500-page discovery file.
            </p>
            <p className="mt-3 text-sm text-zinc-400">
              For defendants and the people who love them.{" "}
              <span className="font-semibold text-amber-500">
                We Research. You Ask.
              </span>
            </p>
          </FadeInUp>
        </div>
      </section>
    </>
  );
}

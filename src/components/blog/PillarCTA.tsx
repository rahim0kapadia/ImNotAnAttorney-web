"use client";

/**
 * PillarCTA -- Contextual product CTA matched to a blog post's content pillar.
 *
 * Renders at the bottom of blog posts. Two variants:
 *   A) Free entry point exists  -> blue primary CTA (free) + amber secondary (paid)
 *   B) No free entry point      -> amber primary CTA (paid) + delivery info
 *
 * Prices sourced from TIER_CORE (single source of truth).
 */

import { TIER_CORE } from "@/lib/tiers";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface PillarCTAProps {
  pillarSlug: string;
  linkedProducts: string[];
  freeEntryPoint: string;
  ctaTier: string;
  articleSlug: string;
}

/* ------------------------------------------------------------------ */
/*  Static maps                                                        */
/* ------------------------------------------------------------------ */

const PILLAR_HOOKS: Record<string, string> = {
  "plea-analyzer":            "Your plea deal might have hidden terms.",
  "breathalyzer-challenge":   "Your breathalyzer result might be wrong.",
  "fst-review":               "Field sobriety tests are wrong 35% of the time.",
  "drug-test-reliability":    "Your drug test could be a false positive.",
  "dui-playbook":             "DUI defense has more variables than you think.",
  "sentencing-intelligence":  "Your judge's sentencing patterns tell a story.",
  "arrest-report-review":     "Your arrest report might contain errors that matter.",
  "collateral-consequences":  "A conviction affects more than your criminal record.",
  "body-camera-analysis":     "Your body cam footage could change everything.",
};

const DEFAULT_HOOK = "See how this applies to your case.";

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function PillarCTA({
  pillarSlug,
  linkedProducts,
  freeEntryPoint,
  ctaTier,
  articleSlug,
}: PillarCTAProps) {
  if (!pillarSlug) return null;

  const hook = PILLAR_HOOKS[pillarSlug] || DEFAULT_HOOK;
  const tier = TIER_CORE[ctaTier as keyof typeof TIER_CORE];
  const tierName = tier?.name ?? "Full Analysis";
  const tierPrice = tier?.priceDisplay ?? "";
  const tierDelivery = tier?.delivery ?? "";

  function trackClick(ctaType: "free_entry" | "paid_tier") {
    if (typeof window !== "undefined" && window.gtag) {
      window.gtag("event", "pillar_cta_click", {
        pillar_slug: pillarSlug,
        product_slug: linkedProducts[0] || "",
        cta_type: ctaType,
        article_slug: articleSlug,
      });
    }
  }

  const paidHref = `/checkout?tier=${encodeURIComponent(ctaTier)}&ref=pillar-${encodeURIComponent(pillarSlug)}`;

  /* ---- Variant A: free entry point exists ---- */
  if (freeEntryPoint) {
    const freeHref = `${freeEntryPoint}${freeEntryPoint.includes("?") ? "&" : "?"}ref=pillar-${encodeURIComponent(pillarSlug)}`;

    return (
      <section aria-label="Related product" className="mt-10">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
          <h3 className="text-lg font-bold leading-snug text-white sm:text-xl">
            {hook}
          </h3>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href={freeHref}
              onClick={() => trackClick("free_entry")}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              Get Your Free {tierName} &rarr;
            </a>
          </div>

          <p className="mt-4 text-sm text-zinc-400">
            Want the full picture?{" "}
            <a
              href={paidHref}
              onClick={() => trackClick("paid_tier")}
              className="font-medium text-amber-400 underline underline-offset-2 transition-colors hover:text-amber-300"
            >
              {tierName} &mdash; {tierPrice}
            </a>
          </p>
        </div>
      </section>
    );
  }

  /* ---- Variant B: no free entry point ---- */
  return (
    <section aria-label="Related product" className="mt-10">
      <div className="rounded-xl border border-amber-500/30 bg-zinc-900 p-6 sm:p-8">
        <h3 className="text-lg font-bold leading-snug text-white sm:text-xl">
          {hook}
        </h3>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <a
            href={paidHref}
            onClick={() => trackClick("paid_tier")}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-amber-500 px-6 py-3 text-center text-sm font-semibold text-black transition-colors hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
          >
            {tierName} &mdash; {tierPrice} &rarr;
          </a>
        </div>

        {tierDelivery && (
          <p className="mt-4 text-sm text-zinc-400">
            {tierDelivery}. Built from real case research specific to your situation.
          </p>
        )}
      </div>
    </section>
  );
}

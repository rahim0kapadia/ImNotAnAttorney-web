/**
 * BlogCTA -- In-blog conversion call-to-action component.
 *
 * Placed after the content in every blog post to convert readers into customers.
 * Contains three conversion paths:
 *   1. Primary CTA: "Get Your Case Decoder" -- links to `/checkout?tier=case-decoder` ($197).
 *   2. Secondary CTA: "See a Sample Report" -- links to `/sample` for social proof.
 *   3. Tertiary link: "Check your Defense Milestone Score" -- links to `/score`,
 *      the free lead magnet that captures emails before showing results.
 *
 * The messaging emphasizes case-specific research over generic information to
 * differentiate from free blog content.
 *
 * Used in: `src/app/blog/[slug]/page.tsx` (rendered after MDX content, before LeadCapture).
 */
import Link from "next/link";
import { TIER_CORE } from "@/lib/tiers";
import { FadeInUp } from "@/components/motion/FadeInUp";
import { TrustBadges } from "@/components/TrustBadges";

const CATEGORY_PLAYBOOK: Record<string, string> = {
  dui: "dui-first-offense",
  drug: "drug-possession",
  "drug-cases": "drug-possession",
  "white-collar": "white-collar",
  federal: "federal-criminal",
  trafficking: "drug-trafficking",
  "sex-offense": "sex-offense",
  "self-defense": "self-defense",
  probation: "probation-violation",
  "general-defense": "dui-first-offense",
};

export function BlogCTA({ category }: { category?: string }) {
  const playbookSlug = category ? CATEGORY_PLAYBOOK[category] || "dui-first-offense" : "dui-first-offense";
  return (
    <FadeInUp>
      <div className="rounded-xl border border-amber-500/50 bg-zinc-900 p-6">
        <h3 className="text-lg font-bold text-white">
          You don&apos;t need another lawyer.{" "}
          <span className="text-amber-400">You need the right questions.</span>
        </h3>
        <p className="mt-2 text-sm text-zinc-400">
          Questions built from YOUR charges, YOUR discovery, YOUR judge —
          not generic legal info you can Google. Our Case Decoder gives
          you 15 targeted questions your attorney isn&apos;t expecting.
          Starting at {TIER_CORE["case-decoder"].priceDisplay}.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/checkout?tier=case-decoder"
            className="rounded-lg bg-amber-500 px-6 py-3 text-center text-sm font-semibold text-black transition-all hover:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
          >
            Get Your Case Decoder — {TIER_CORE["case-decoder"].priceDisplay} &rarr;
          </Link>
          <Link
            href={`/checkout?tier=${playbookSlug}`}
            className="rounded-lg border border-amber-500/50 px-6 py-3 text-center text-sm font-semibold text-amber-400 transition-all hover:scale-[1.02] hover:border-amber-500"
          >
            Start with a Playbook — {TIER_CORE[playbookSlug as keyof typeof TIER_CORE].priceDisplay}
          </Link>
        </div>
        <div className="mt-4">
          <TrustBadges variant="compact" />
        </div>
        <p className="mt-3 text-sm text-zinc-400">
          <Link
            href="/score"
            className="text-amber-400 underline decoration-amber-400/50 hover:text-amber-300"
          >
            Check your Defense Milestone Score — free &rarr;
          </Link>
        </p>
      </div>
    </FadeInUp>
  );
}

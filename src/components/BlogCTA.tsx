/**
 * BlogCTA -- In-blog conversion call-to-action component.
 *
 * Placed after the content in every blog post to convert readers into customers.
 * Routes to the charge-matched playbook when it's live, or to the free Score Quiz
 * when the playbook is still in sandbox mode. Never sends visitors to a dead end.
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
  const tier = TIER_CORE[playbookSlug as keyof typeof TIER_CORE];
  const isLive = tier?.live === true;

  return (
    <FadeInUp>
      <div className="rounded-xl border border-amber-500/50 bg-zinc-900 p-6">
        {isLive ? (
          <>
            <h3 className="text-lg font-bold text-white">
              Your attorney filed zero motions.{" "}
              <span className="text-amber-400">Would you even know?</span>
            </h3>
            <p className="mt-2 text-sm text-zinc-400">
              {tier.name}: 26 questions your attorney hopes you never ask.
              Built from real case research. {tier.priceDisplay}, instant download.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/start"
                className="rounded-lg bg-amber-500 px-6 py-3 text-center text-sm font-semibold text-black transition-all hover:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
              >
                Get Started &mdash; {tier.priceDisplay}+ &rarr;
              </Link>
              <Link
                href={`/checkout?tier=${playbookSlug}`}
                className="rounded-lg border border-amber-500/50 px-6 py-3 text-center text-sm font-semibold text-amber-400 transition-all hover:scale-[1.02] hover:border-amber-500"
              >
                {tier.name} &mdash; {tier.priceDisplay}
              </Link>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-lg font-bold text-white">
              Is your attorney actually working your case?{" "}
              <span className="text-amber-400">Find out in 60 seconds.</span>
            </h3>
            <p className="mt-2 text-sm text-zinc-400">
              10 questions. No email required. See how your defense measures up
              against the milestones that matter.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/score"
                className="rounded-lg bg-amber-500 px-6 py-3 text-center text-sm font-semibold text-black transition-all hover:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
              >
                Take the Defense Milestone Score — Free &rarr;
              </Link>
              <Link
                href="/checkout?tier=dui-first-offense"
                className="rounded-lg border border-amber-500/50 px-6 py-3 text-center text-sm font-semibold text-amber-400 transition-all hover:scale-[1.02] hover:border-amber-500"
              >
                DUI Playbook — {TIER_CORE["dui-first-offense"].priceDisplay}
              </Link>
            </div>
          </>
        )}
        <div className="mt-4">
          <TrustBadges variant="compact" />
        </div>
      </div>
    </FadeInUp>
  );
}

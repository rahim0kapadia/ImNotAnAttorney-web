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
import { getProduct } from "@/lib/products";
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
  "general-defense": "case-decoder",
};

const _employmentPrice = getProduct("employment-impact")?.priceDisplay ?? "$197";

/**
 * Categories that route to standalone research products instead of TIER_CORE
 * playbooks. Each entry has hardcoded sales copy because standalone products
 * don't live in TIER_CORE.
 */
const STANDALONE_CATEGORY_CTA: Record<
  string,
  {
    slug: string;
    price: string;
    headline: string;
    headlineAccent: string;
    subhead: string;
    primaryLabel: string;
    secondaryLabel: string;
  }
> = {
  employment: {
    slug: "employment-impact",
    price: _employmentPrice,
    headline: "Will THIS specific charge cost YOUR specific job?",
    headlineAccent: "Find out in 48 hours.",
    subhead:
      "Employment Impact Assessment: state-specific background check analysis, employer type rules, and professional license implications for your exact situation. 60-second intake, report delivered in 48 hours. 7-day refund guarantee.",
    primaryLabel: `Get Your Employment Impact Assessment — ${_employmentPrice}`,
    secondaryLabel: "Not sure yet? Take the free Defense Milestone Score",
  },
};

export function BlogCTA({ category, slug }: { category?: string; slug?: string }) {
  const refParam = slug ? `ref=blog-${slug}` : "";
  const appendRef = (url: string) => {
    if (!refParam) return url;
    return url.includes("?") ? `${url}&${refParam}` : `${url}?${refParam}`;
  };

  // Standalone product branch — employment and any future standalone categories
  const standalone = category ? STANDALONE_CATEGORY_CTA[category] : undefined;
  if (standalone) {
    return (
      <FadeInUp>
        <div className="rounded-xl border border-amber-500/50 bg-zinc-900 p-6">
          <h3 className="text-lg font-bold text-white">
            {standalone.headline}{" "}
            <span className="text-amber-400">{standalone.headlineAccent}</span>
          </h3>
          <p className="mt-2 text-sm text-zinc-400">{standalone.subhead}</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Link
              href={appendRef(`/checkout?standaloneProduct=${standalone.slug}`)}
              className="rounded-lg bg-amber-500 px-6 py-3 text-center text-sm font-semibold text-black transition-all hover:scale-[1.02] focus-visible:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
            >
              {standalone.primaryLabel} &rarr;
            </Link>
            <Link
              href={appendRef("/score")}
              className="rounded-lg border border-amber-500/50 px-6 py-3 text-center text-sm font-semibold text-amber-400 transition-all hover:scale-[1.02] focus-visible:scale-[1.02] hover:border-amber-500"
            >
              {standalone.secondaryLabel}
            </Link>
          </div>
          <div className="mt-4">
            <TrustBadges variant="compact" />
          </div>
        </div>
      </FadeInUp>
    );
  }

  // Tier playbook or Case Decoder branch
  const playbookSlug = category ? CATEGORY_PLAYBOOK[category] || "case-decoder" : "case-decoder";
  const tier = TIER_CORE[playbookSlug as keyof typeof TIER_CORE];
  const isLive = tier?.live === true;
  const isCaseDecoder = playbookSlug === "case-decoder";

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
              {isCaseDecoder
                ? `${tier.name}: We read your actual case file and hand you 15 specific questions for your next attorney meeting. ${tier.priceDisplay}, delivered in ${tier.delivery}.`
                : `${tier.name}: 26 questions that change how your next attorney meeting goes. Built from real case research. ${tier.priceDisplay}, instant download.`}
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Link
                href={appendRef(`/checkout?tier=${playbookSlug}`)}
                className="rounded-lg bg-amber-500 px-6 py-3 text-center text-sm font-semibold text-black transition-all hover:scale-[1.02] focus-visible:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
              >
                {tier.name} &mdash; {tier.priceDisplay} &rarr;
              </Link>
              <Link
                href={appendRef("/score")}
                className="rounded-lg border border-amber-500/50 px-6 py-3 text-center text-sm font-semibold text-amber-400 transition-all hover:scale-[1.02] focus-visible:scale-[1.02] hover:border-amber-500"
              >
                Take the free quiz first
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
                href={appendRef("/score")}
                className="rounded-lg bg-amber-500 px-6 py-3 text-center text-sm font-semibold text-black transition-all hover:scale-[1.02] focus-visible:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
              >
                Take the Defense Milestone Score — Free &rarr;
              </Link>
              <Link
                href={appendRef("/checkout?tier=dui-first-offense")}
                className="rounded-lg border border-amber-500/50 px-6 py-3 text-center text-sm font-semibold text-amber-400 transition-all hover:scale-[1.02] focus-visible:scale-[1.02] hover:border-amber-500"
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

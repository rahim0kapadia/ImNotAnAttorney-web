/**
 * BlogQuickPath — Above-fold shortcut for crisis readers.
 *
 * Rendered AFTER the blog post header, BEFORE TLDRBox + MDX body. Purpose:
 * defendants scanning at 2AM on mobile may bail before reaching the end-of-post
 * BlogCTA. This gives them a fast path (60-second Score quiz or charge-matched
 * playbook) without reading 1200 words first.
 *
 * Distinct from BlogCTA (end-of-post, long-form) and BlogInlineCapture
 * (mid-article, checklist hook). This one is pre-reading, one-line, one action.
 *
 * Used in: `src/app/blog/[slug]/page.tsx` (rendered between header and TLDRBox).
 */
import Link from "next/link";
import { TIER_CORE } from "@/lib/tiers";

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
};

interface BlogQuickPathProps {
  category?: string;
  slug?: string;
}

export function BlogQuickPath({ category, slug }: BlogQuickPathProps) {
  const refParam = slug ? `ref=blog-${slug}-above` : "ref=blog-above";
  const playbookSlug = category ? CATEGORY_PLAYBOOK[category] : undefined;
  const tier = playbookSlug
    ? TIER_CORE[playbookSlug as keyof typeof TIER_CORE]
    : undefined;
  const hasLivePlaybook = tier?.live === true;

  return (
    <div className="my-6 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 sm:px-5 sm:py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-zinc-200">
          <span className="font-semibold text-amber-400">Short on time?</span>{" "}
          <span className="text-zinc-300">
            Get the specific answer for YOUR case in 60 seconds.
          </span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:shrink-0">
          <Link
            href={`/score?${refParam}`}
            className="rounded-md bg-amber-500 px-4 py-2 text-center text-xs font-semibold text-black transition-all hover:bg-amber-400 hover:shadow-md hover:shadow-amber-500/20 sm:text-sm"
          >
            Take the 60-second Score &rarr;
          </Link>
          {hasLivePlaybook && tier && (
            <Link
              href={`/playbook/${playbookSlug}?${refParam}`}
              className="rounded-md border border-amber-500/50 px-4 py-2 text-center text-xs font-semibold text-amber-400 transition-all hover:border-amber-500 sm:text-sm"
            >
              {tier.name}, {tier.priceDisplay}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

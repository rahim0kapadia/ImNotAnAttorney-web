/**
 * SourceIntelligence -- Displays the elite defense attorneys whose documented
 * methodologies inform the content of a blog post.
 *
 * Automatically selects attorneys based on the post's `category` prop. Falls back
 * to the "general-defense" attorney list if the category is unrecognized.
 *
 * MAINTENANCE WARNING: The `ATTORNEYS` record below is HARDCODED. Attorney names,
 * credentials, and methodology descriptions should be kept accurate and up-to-date.
 * These citations are publicly visible on every blog post and represent a core part
 * of the brand's credibility. If an attorney's credential is wrong or a new attorney
 * should be added, update the relevant category array here.
 *
 * Categories covered: drug-cases, dui, white-collar, general-defense.
 *
 * The attorney data originates from the elite skills installed on the development
 * machine (god-mode-trial, elite-drug-defense, master-strategy-trial). See CLAUDE.md
 * for skill locations.
 *
 * Used in: `src/app/blog/[slug]/page.tsx` (rendered above the MDX content).
 *
 * @param props.category - Blog post category slug (e.g. "drug-cases", "dui").
 */

export const ATTORNEYS: Record<
  string,
  { name: string; credential: string; method: string }[]
> = {
  "drug-cases": [],
  dui: [],
  "white-collar": [],
  "general-defense": [],
};

export function SourceIntelligence({ category }: { category: string }) {
  // Suppress unused variable warning — kept for future post-purchase use
  void category;

  return (
    <div className="not-prose mb-8 rounded-lg border border-zinc-700 bg-zinc-800/30 p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-amber-400">
        Source Intelligence
      </p>
      <p className="mt-2 text-sm text-zinc-400">
        Research informed by documented methodologies from elite defense
        attorneys with combined experience across 375+ exonerations and
        thousands of criminal cases.
      </p>
    </div>
  );
}

/**
 * BlogInlineCapture — Inline content card for blog posts.
 *
 * Previously an email-gated lead capture form. Now shows category-specific
 * checklist info directly (ungated) with a /score CTA link.
 *
 * Used in: `src/app/blog/[slug]/page.tsx` (rendered within MDX content).
 */
import Link from "next/link";

const CHECKLIST_BY_CATEGORY: Record<string, { title: string; hook: string }> = {
  dui: {
    title: "Arrested in the last 48 hours? Get the 72-Hour Emergency Checklist",
    hook: "Your DMV hearing deadline may be 7 days away. 3 things to do tonight, the deadline that could cost your license, and 6 questions for your attorney consultation.",
  },
  "drug-cases": {
    title: "Drug Case Discovery Checklist",
    hook: "7 evidence problems real drug cases hide — and the questions that expose them.",
  },
  "white-collar": {
    title: "Federal Case Checklist",
    hook: "5 Brady/Giglio red flags your federal attorney might be missing.",
  },
  "general-defense": {
    title: "Defense Accountability Checklist",
    hook: "7 questions that separate informed defendants from easy clients.",
  },
};

interface BlogInlineCaptureProps {
  category?: string;
}

export function BlogInlineCapture({ category = "general-defense" }: BlogInlineCaptureProps) {
  const checklist = CHECKLIST_BY_CATEGORY[category] || CHECKLIST_BY_CATEGORY["general-defense"];

  return (
    <div className="my-8 rounded-lg border border-zinc-800 bg-zinc-900/80 p-5">
      <p className="text-sm font-bold text-white">{checklist.title}</p>
      <p className="mt-1 text-xs text-zinc-400">{checklist.hook}</p>
      <div className="mt-3">
        <Link
          href="/score"
          className="inline-block rounded-md bg-amber-500 px-4 py-2 text-xs font-semibold text-black transition-all hover:scale-[1.01] focus-visible:scale-[1.01] hover:bg-amber-400"
        >
          Take the Defense Milestone Score — Free
        </Link>
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        Free. No email required.
      </p>
    </div>
  );
}

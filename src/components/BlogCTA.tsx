/**
 * BlogCTA -- In-blog conversion call-to-action component.
 *
 * Placed after the content in every blog post to convert readers into customers.
 * Contains three conversion paths:
 *   1. Primary CTA: "Get Your Case Decoder" -- links to `/checkout?tier=case-decoder` ($197).
 *   2. Secondary CTA: "See a Sample Report" -- links to `/sample` for social proof.
 *   3. Tertiary link: "Check your Attorney Accountability Score" -- links to `/score`,
 *      the free lead magnet that captures emails before showing results.
 *
 * The messaging emphasizes case-specific research over generic information to
 * differentiate from free blog content.
 *
 * Used in: `src/app/blog/[slug]/page.tsx` (rendered after MDX content, before LeadCapture).
 */
import Link from "next/link";

export function BlogCTA() {
  return (
    <div className="rounded-xl border border-amber-500/50 bg-zinc-900 p-6">
      <h3 className="text-lg font-bold text-white">
        The defendants who walk in prepared{" "}
        <span className="text-amber-400">don&apos;t use general information.</span>
      </h3>
      <p className="mt-2 text-sm text-zinc-400">
        They use case-specific research — questions built from their
        actual charges, their actual discovery, their actual judge. Our
        Case Decoder gives you 10-15 targeted questions your attorney
        isn&apos;t expecting. Starting at $197.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/checkout?tier=case-decoder"
          className="rounded-lg bg-amber-500 px-6 py-3 text-center text-sm font-semibold text-black transition-colors hover:bg-amber-400"
        >
          Get Your Case Decoder — $197 →
        </Link>
        <Link
          href="/sample"
          className="rounded-lg border border-zinc-700 px-6 py-3 text-center text-sm font-semibold text-white transition-colors hover:border-zinc-500"
        >
          See a Sample Report
        </Link>
      </div>
      <p className="mt-3 text-sm text-zinc-400">
        <Link
          href="/score"
          className="text-amber-400 underline decoration-amber-400/50 hover:text-amber-300"
        >
          Check your Attorney Accountability Score — free →
        </Link>
      </p>
    </div>
  );
}

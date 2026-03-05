/**
 * PlaybookCTA -- In-blog CTA for the DUI Defense Playbook ($97).
 *
 * Shown above BlogCTA on DUI-category blog posts. Links to the Playbook
 * sales page with upgrade mention to Case Decoder.
 *
 * Used in: `src/app/blog/[slug]/page.tsx` (rendered before BlogCTA for DUI posts).
 */
import Link from "next/link";

export function PlaybookCTA() {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
      <p className="text-xs font-bold uppercase tracking-wider text-amber-400">
        DUI Defense Playbook — $97
      </p>
      <h3 className="mt-2 text-lg font-bold text-white">
        26 questions your DUI attorney hopes you never ask.
      </h3>
      <p className="mt-2 text-sm text-zinc-400">
        Instant PDF download. Breathalyzer calibration checklist, case stage
        roadmap, 12 red flags, and an attorney accountability scorecard.
        Built from 40+ elite DUI defense attorneys&apos; documented strategies.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/playbook/dui-first-offense"
          className="rounded-lg bg-amber-500 px-6 py-3 text-center text-sm font-bold text-black transition-colors hover:bg-amber-400"
        >
          Get the DUI Playbook — $97 →
        </Link>
        <Link
          href="/checkout?tier=case-decoder"
          className="rounded-lg border border-zinc-700 px-6 py-3 text-center text-sm font-semibold text-white transition-colors hover:border-zinc-500"
        >
          Or upgrade to Case Decoder — $197
        </Link>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        $97 is fully credited toward Case Decoder within 30 days.
      </p>
    </div>
  );
}

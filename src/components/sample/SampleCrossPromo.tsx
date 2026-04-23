/**
 * Sample Page Cross-Promo — shared SKU tiles for /sample + /sample-xray.
 *
 * Both sample pages preview ONE tier (Case Decoder on /sample, X-Ray on
 * /sample-xray). This component surfaces two adjacent, instant-delivery
 * standalones a sample viewer may also want:
 *   - Arrest Survival Kit ($47) — first-7-days playbook (universal early-stage need)
 *   - District Court Intelligence ($97) — pre-plea judge/prosecutor data (mid-stage need)
 *
 * Both are $97-and-under, instant delivery, complement (not replace) the
 * previewed tier. Links go to landing pages, not direct checkout, so buyers
 * can evaluate each SKU on its own merits.
 *
 * Voice: anonymous-insider, concrete, no "verify with attorney", no
 * speed-selling — per brand-voice.md.
 */
import Link from "next/link";
import { TIER_CORE } from "@/lib/tiers";

export function SampleCrossPromo() {
  const ask = TIER_CORE["arrest-survival-kit"];
  const dci = TIER_CORE["district-court-intelligence"];

  return (
    <section
      className="mt-12 rounded-xl border border-zinc-700 bg-zinc-900/50 p-6 md:p-8"
      aria-labelledby="sample-cross-promo-heading"
    >
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-500">
          Other things defendants use at this stage
        </p>
        <h2
          id="sample-cross-promo-heading"
          className="mt-3 text-xl font-bold text-white md:text-2xl"
        >
          Two more tools, both under $100, delivered on purchase
        </h2>
        <p className="mt-3 text-sm text-zinc-400">
          These work alongside whatever tier you choose. No overlap, no upsell
          bait — each answers a different question the system won&apos;t answer
          for you.
        </p>
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {/* Arrest Survival Kit — $47 */}
        <article className="flex flex-col rounded-lg border border-zinc-700 bg-zinc-900 p-5">
          <header>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">
              Arrest Survival Kit
            </p>
            <p className="mt-2 text-2xl font-bold text-white">
              {ask.priceDisplay}
              <span className="ml-2 text-xs font-normal text-zinc-400">
                · On purchase
              </span>
            </p>
          </header>
          <p className="mt-3 text-sm leading-relaxed text-zinc-300">
            The first seven days after arrest are when the most damage gets
            done — phone calls to the wrong people, social posts, statements
            that end up in discovery. This kit walks you through exactly what
            to do, what to stop doing, and what to write down while memory is
            fresh.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-zinc-400">
            <li className="flex gap-2">
              <span aria-hidden="true" className="text-amber-500">
                ·
              </span>
              <span>Day-by-day checklist for the first seven days</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="text-amber-500">
                ·
              </span>
              <span>Phone-call scripts for family, employer, and bail</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="text-amber-500">
                ·
              </span>
              <span>Evidence-preservation worksheet before memory fades</span>
            </li>
          </ul>
          <div className="mt-auto pt-5">
            <Link
              href="/arrest-survival-kit"
              className="inline-block min-h-[44px] rounded-lg border border-amber-500/50 bg-amber-500/10 px-5 py-3 text-sm font-semibold text-amber-400 transition-colors hover:bg-amber-500 hover:text-black"
            >
              See what&apos;s inside — {ask.priceDisplay} →
            </Link>
          </div>
        </article>

        {/* District Court Intelligence — $97 */}
        <article className="flex flex-col rounded-lg border border-zinc-700 bg-zinc-900 p-5">
          <header>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">
              District Court Intelligence
            </p>
            <p className="mt-2 text-2xl font-bold text-white">
              {dci.priceDisplay}
              <span className="ml-2 text-xs font-normal text-zinc-400">
                · On purchase
              </span>
            </p>
          </header>
          <p className="mt-3 text-sm leading-relaxed text-zinc-300">
            Before your attorney walks you through a plea offer, know what
            actually happens in your district. Judge sentencing patterns,
            prosecutor plea rates, bench vs. jury divergence — the same data
            the courtroom regulars already have, compiled into one report for
            your specific court.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-zinc-400">
            <li className="flex gap-2">
              <span aria-hidden="true" className="text-amber-500">
                ·
              </span>
              <span>Judge median sentences + downward-departure rates</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="text-amber-500">
                ·
              </span>
              <span>Plea vs. trial outcomes in your district</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="text-amber-500">
                ·
              </span>
              <span>Every finding linked to its source URL</span>
            </li>
          </ul>
          <div className="mt-auto pt-5">
            <Link
              href="/district-court-intelligence"
              className="inline-block min-h-[44px] rounded-lg border border-amber-500/50 bg-amber-500/10 px-5 py-3 text-sm font-semibold text-amber-400 transition-colors hover:bg-amber-500 hover:text-black"
            >
              See what&apos;s inside — {dci.priceDisplay} →
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}

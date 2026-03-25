/**
 * /start — Covello-Compliant 2AM Crisis Entry Page
 *
 * The most important page for crisis buyers. Designed for a defendant at 2AM,
 * under acute stress, with 80% reduced information processing capacity
 * (Dr. Vincent Covello, Mental Noise Model).
 *
 * Covello constraints enforced:
 *   - Rule of 3: max 3 key messages above fold
 *   - No "or" in primary routing (binary choice, not alternatives)
 *   - One CTA per state (never multiple competing buttons)
 *   - Price visible before feature lists
 *   - No legal jargon ("police reports" not "discovery")
 *
 * Above fold (zero scroll on mobile):
 *   1. Headline: situation validation
 *   2. Subtext: methodology credibility
 *   3. Two large tap targets: document-based routing
 *
 * After selection: single card, single price, single CTA, guarantee, credit line.
 * Below fold: 3 trust items + $97 fallback + /services link.
 *
 * Crisis mode (CRO13):
 *   Activated via ?crisis=true, ?mode=crisis, or automatic time-of-day detection
 *   (10 PM - 6 AM local time). Covello Mental Noise Model at full strength:
 *   max 3 messages, one CTA, minimal cognitive load. Dismissible to reveal
 *   the full page underneath.
 *
 * Expert basis: Hormozi + Dunford (two-page architecture), Covello (Rule of 3),
 * Brunson (routing simplification), Suby (crisis conversion).
 */
"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { TIER_CORE } from "@/lib/tiers";
import { TestimonialSection } from "@/components/TestimonialSection";

type DocumentState = null | "has-documents" | "no-documents";

function CrisisHero({ onDismiss }: { onDismiss: () => void }) {
  return (
    <main className="min-h-screen bg-zinc-950">
      <section className="flex min-h-[100dvh] flex-col items-center justify-center px-6 py-16">
        <div className="mx-auto w-full max-w-md text-center">
          <h1 className="font-display text-4xl font-bold leading-snug tracking-tight text-white sm:text-5xl">
            You were just arrested.
            <br />
            <span className="text-amber-400">
              Here&apos;s what to do right now.
            </span>
          </h1>

          <p className="mx-auto mt-8 max-w-sm text-lg leading-relaxed text-zinc-300">
            Free. Anonymous. Takes 60 seconds.
          </p>

          <Link
            href="/score"
            className="mt-10 block w-full rounded-xl bg-amber-500 py-5 text-center text-lg font-bold text-black transition-colors hover:bg-amber-400"
          >
            Check Your Defense Position &rarr;
          </Link>

          <div className="mt-14 border-t border-zinc-800 pt-8">
            <Link
              href="/checkout?tier=dui-first-offense"
              className="text-sm text-zinc-400 underline underline-offset-2 hover:text-amber-400"
            >
              {TIER_CORE["dui-first-offense"].priceDisplay} DUI Defense Playbook
              &mdash; instant download
            </Link>
          </div>

          <button
            onClick={onDismiss}
            className="mt-10 text-xs text-zinc-600 underline underline-offset-2 hover:text-zinc-400"
          >
            See all options
          </button>
        </div>
      </section>

      <div className="px-4 pb-8">
        <p className="mx-auto max-w-xl text-center text-xs text-zinc-600">
          ImNotAnAttorney provides legal information and research &mdash; not
          legal advice. No attorney-client relationship is created.
        </p>
      </div>
    </main>
  );
}

function StartContent() {
  const searchParams = useSearchParams();
  const [docState, setDocState] = useState<DocumentState>(null);
  const [crisisDismissed, setCrisisDismissed] = useState(false);
  const [isNightTime, setIsNightTime] = useState(false);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 22 || hour <= 6) {
      setIsNightTime(true);
    }
  }, []);

  const paramCrisis =
    searchParams.get("crisis") === "true" ||
    searchParams.get("mode") === "crisis";

  const showCrisis = (paramCrisis || isNightTime) && !crisisDismissed;

  if (showCrisis) {
    return <CrisisHero onDismiss={() => setCrisisDismissed(true)} />;
  }

  return (
    <main className="min-h-screen bg-zinc-950">
      {/* ------------------------------------------------------------------ */}
      {/* ABOVE FOLD — Zero scroll on mobile. Covello Rule of 3:            */}
      {/*   1. Situation validation (headline)                              */}
      {/*   2. Methodology credibility (subtext)                            */}
      {/*   3. Binary routing (two buttons)                                 */}
      {/* ------------------------------------------------------------------ */}
      <section className="flex min-h-[100dvh] flex-col items-center justify-center px-4 py-12">
        <div className="mx-auto w-full max-w-xl text-center">
          <h1 className="font-display text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl md:text-5xl">
            You have an attorney.
            <br />
            You don&apos;t understand your case.
            <br />
            <span className="text-amber-400">That&apos;s the gap we fill.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-md text-base text-zinc-400">
            40+ elite defense attorneys&apos; methodology. Applied to your specific charges.
          </p>
          <p className="mx-auto mt-2 max-w-md text-xs text-zinc-500">
            Research frameworks informed by defense pioneers including Lawrence Taylor, Barry Scheck, and Gerry Spence.
          </p>

          {/* Binary routing — no "or", just two paths */}
          {docState === null && (
            <div className="mt-10 flex flex-col gap-4">
              <button
                onClick={() => setDocState("has-documents")}
                className="w-full rounded-xl border-2 border-amber-500/50 bg-zinc-900/80 px-6 py-5 text-left text-base font-semibold text-white transition-all hover:border-amber-500 hover:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                style={{ minHeight: "64px" }}
              >
                I have police reports / case documents
              </button>
              <button
                onClick={() => setDocState("no-documents")}
                className="w-full rounded-xl border-2 border-amber-500/50 bg-zinc-900/80 px-6 py-5 text-left text-base font-semibold text-white transition-all hover:border-amber-500 hover:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                style={{ minHeight: "64px" }}
              >
                I haven&apos;t received documents yet
              </button>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* NO DOCUMENTS PATH — Case Decoder $197                           */}
          {/* Single card. Single price. Single CTA. Covello-compliant.       */}
          {/* ---------------------------------------------------------------- */}
          {docState === "no-documents" && (
            <div className="mt-10 rounded-xl border border-zinc-700 bg-zinc-900/80 p-6 text-left">
              <div className="flex items-baseline justify-between">
                <h2 className="text-xl font-bold text-white">Case Decoder</h2>
                <span className="text-2xl font-bold text-amber-400">
                  {TIER_CORE["case-decoder"].priceDisplay}
                </span>
              </div>

              <ul className="mt-5 space-y-3">
                <li className="flex items-start gap-2 text-sm text-zinc-300">
                  <span className="mt-0.5 text-amber-400" aria-hidden="true">&#10003;</span>
                  We analyze your charges using elite methodology
                </li>
                <li className="flex items-start gap-2 text-sm text-zinc-300">
                  <span className="mt-0.5 text-amber-400" aria-hidden="true">&#10003;</span>
                  We research your judge and local patterns
                </li>
                <li className="flex items-start gap-2 text-sm text-zinc-300">
                  <span className="mt-0.5 text-amber-400" aria-hidden="true">&#10003;</span>
                  We hand you 15 questions for your next meeting
                </li>
              </ul>

              <p className="mt-5 text-sm font-semibold text-zinc-300">
                {TIER_CORE["case-decoder"].priceDisplay}. Delivered in {TIER_CORE["case-decoder"].delivery}.
              </p>

              <Link
                href="/checkout?tier=case-decoder"
                className="mt-5 block w-full rounded-lg bg-amber-500 py-4 text-center text-sm font-bold text-black transition-colors hover:bg-amber-400"
              >
                Start for {TIER_CORE["case-decoder"].priceDisplay} &rarr;
              </Link>

              <p className="mt-4 text-sm text-zinc-400">
                If we don&apos;t find a gap your attorney hasn&apos;t raised: full refund.
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                100% credited when you upgrade. Valid 12 months.
              </p>

              <button
                onClick={() => setDocState(null)}
                className="mt-4 text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-400"
              >
                &larr; Go back
              </button>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* HAS DOCUMENTS PATH — The X-Ray $2,497                           */}
          {/* Single card. Single price. Single CTA. Covello-compliant.       */}
          {/* ---------------------------------------------------------------- */}
          {docState === "has-documents" && (
            <div className="mt-10 rounded-xl border border-zinc-700 bg-zinc-900/80 p-6 text-left">
              <div className="flex items-baseline justify-between">
                <h2 className="text-xl font-bold text-white">The X-Ray</h2>
                <span className="text-2xl font-bold text-amber-400">
                  {TIER_CORE["x-ray"].priceDisplay}
                </span>
              </div>

              <ul className="mt-5 space-y-3">
                <li className="flex items-start gap-2 text-sm text-zinc-300">
                  <span className="mt-0.5 text-amber-400" aria-hidden="true">&#10003;</span>
                  We read every page of your case file
                </li>
                <li className="flex items-start gap-2 text-sm text-zinc-300">
                  <span className="mt-0.5 text-amber-400" aria-hidden="true">&#10003;</span>
                  We find what doesn&apos;t match
                </li>
                <li className="flex items-start gap-2 text-sm text-zinc-300">
                  <span className="mt-0.5 text-amber-400" aria-hidden="true">&#10003;</span>
                  We hand you the exact questions
                </li>
              </ul>

              <p className="mt-5 text-sm font-semibold text-zinc-300">
                {TIER_CORE["x-ray"].priceDisplay}. Delivered in {TIER_CORE["x-ray"].delivery}.
              </p>

              <Link
                href="/checkout?tier=x-ray"
                className="mt-5 block w-full rounded-lg bg-amber-500 py-4 text-center text-sm font-bold text-black transition-colors hover:bg-amber-400"
              >
                Start for {TIER_CORE["x-ray"].priceDisplay} &rarr;
              </Link>

              <p className="mt-4 text-sm text-zinc-400">
                If we don&apos;t find something your attorney hasn&apos;t raised: full refund.
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                100% credited toward deeper intelligence.
              </p>

              <button
                onClick={() => setDocState(null)}
                className="mt-4 text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-400"
              >
                &larr; Go back
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* BELOW FOLD — Trust items (3 only, per Covello)                    */}
      {/* Dynamic delivery time based on selection state.                    */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-t border-zinc-800 px-4 py-12">
        <div className="mx-auto max-w-xl">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-center">
              <p className="text-sm font-semibold text-amber-400">
                {docState === "has-documents"
                  ? "Delivered in 10 business days"
                  : "Delivered in 48 hours"}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-center">
              <p className="text-sm font-semibold text-amber-400">
                We found 68.3g of missing evidence in our own case
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-center">
              <p className="text-sm font-semibold text-amber-400">
                Full refund if we don&apos;t deliver
              </p>
            </div>
          </div>
          <div className="mx-auto max-w-xl mt-8">
            <TestimonialSection
              variant="inline"
              testimonials={[
                {
                  quote: "I filled out the intake at 2 AM the night I was arrested. Had my Case Decoder 36 hours later. The questions it gave me completely changed my next attorney meeting.",
                  name: "Sarah K.",
                  charge: "DUI",
                  outcome: "Attorney meeting transformed",
                },
              ]}
            />
            <p className="mt-4 text-center text-xs text-zinc-600">
              *Based on real defendant experiences. Names changed for privacy.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* $97 PLAYBOOK FALLBACK — Low-commitment entry for hesitant buyers  */}
      {/* ------------------------------------------------------------------ */}
      <section className="px-4 py-8">
        <div className="mx-auto max-w-xl text-center">
          <Link
            href="/checkout?tier=dui-first-offense"
            className="text-sm text-zinc-400 underline underline-offset-2 hover:text-amber-400"
          >
            {TIER_CORE["dui-first-offense"].priceDisplay} Playbook &mdash; instant download, no intake form
          </Link>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* SERVICES LINK — For deliberate browsers who want the full menu     */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-t border-zinc-800 px-4 py-8">
        <div className="mx-auto max-w-xl text-center">
          <p className="text-sm text-zinc-500">
            Want to compare all options?{" "}
            <Link
              href="/services"
              className="text-zinc-400 underline underline-offset-2 hover:text-amber-400"
            >
              See the full service menu
            </Link>
          </p>
        </div>
      </section>

      <div className="px-4 pb-8">
        <p className="mx-auto max-w-xl text-center text-xs text-zinc-600">
          ImNotAnAttorney provides legal information and research &mdash; not
          legal advice. No attorney-client relationship is created.
        </p>
      </div>
    </main>
  );
}

export default function StartPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-zinc-950">
          <p className="text-zinc-500">Loading&hellip;</p>
        </main>
      }
    >
      <StartContent />
    </Suspense>
  );
}

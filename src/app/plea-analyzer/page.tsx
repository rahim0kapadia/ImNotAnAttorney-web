/**
 * Free Plea Deal Analyzer, /plea-analyzer
 *
 * Primary acquisition wedge: free plea analysis for defendants with active
 * plea offers. No payment required. The analyzer uses Claude to generate
 * the analysis (via the existing generate-standalone Edge Function) and
 * delivers results by email.
 *
 * User journey:
 *   Direct traffic / blog / Reddit / score page CTA --> THIS PAGE
 *   --> Submit plea details (+ email) --> Analysis delivered by email
 *   --> Upsell to Case Decoder ($197) on success screen + in email
 *
 * Target audience: Crisis buyers at 3AM who just got a plea offer and
 * need to know if it's fair before their next court date. Mobile-first.
 */
import type { Metadata } from "next";
import { Suspense } from "react";
import { SITE_URL } from "@/lib/site";
import { TIER_CORE } from "@/lib/tiers";
import PleaAnalyzerClient from "./PleaAnalyzerClient";

export const metadata: Metadata = {
  title: "Free Plea Deal Analyzer, Is Your Plea Offer Fair?",
  description:
    "Upload your plea offer details and get an honest analysis in 60 seconds, free. Compare against sentencing guidelines, surface hidden consequences, and get 10 questions for your attorney.",
  alternates: {
    canonical: `${SITE_URL}/plea-analyzer`,
  },
  openGraph: {
    title: "Free Plea Deal Analyzer, Is Your Plea Offer Fair?",
    description:
      "97% of cases end in plea deals. Most defendants accept without knowing if the offer is fair. Get a free analysis in 60 seconds.",
    url: `${SITE_URL}/plea-analyzer`,
    type: "website",
  },
};

export default function PleaAnalyzerPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
        {/* Hero */}
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
          Is your plea deal fair?
        </h1>
        <p className="text-lg text-zinc-300 mb-2">
          Find out in 60 seconds, free.
        </p>
        <p className="text-sm text-zinc-400 mb-8">
          No payment. No credit card. No account required.
        </p>

        {/* Stakes */}
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 mb-8">
          <p className="text-zinc-300 leading-relaxed">
            97% of criminal cases end in plea deals. Most defendants accept
            without knowing whether the offer is fair, what departure arguments
            exist, or what hidden consequences are buried in the terms. A plea
            is not just a sentence, it follows you into employment, housing,
            immigration, professional licensing, and custody proceedings. The
            pressure to decide quickly is intense. The cost of deciding without
            information is permanent.
          </p>
        </div>

        {/* What you get */}
        <h2 className="text-2xl font-semibold mb-4">
          What your free analysis covers
        </h2>
        <ul className="space-y-3 mb-8">
          {[
            "Plain-English decode of your plea offer terms",
            "Original charge vs. plea charge severity comparison",
            "Sentencing guideline analysis for your charge and jurisdiction",
            "Departure argument identification, grounds for a below-guidelines sentence",
            "Leverage factors from your specific case facts",
            "Hidden consequences scan, employment, housing, immigration, licensing",
            "Plea vs. trial risk framework, factors to consider",
            "10 plea-specific questions to bring to your attorney",
          ].map((item, i) => (
            <li key={i} className="flex gap-3">
              <span
                className="text-green-400 mt-0.5 shrink-0"
                aria-hidden="true"
              >
                &#10003;
              </span>
              <span className="text-zinc-300">{item}</span>
            </li>
          ))}
        </ul>

        {/* Why free */}
        <div className="bg-blue-950/30 border border-blue-800 rounded-lg p-6 mb-10">
          <p className="text-sm text-blue-400 font-medium mb-2">
            Why is this free?
          </p>
          <p className="text-zinc-300 text-sm leading-relaxed">
            The plea decision is the single most important moment in 97% of
            criminal cases, and the one where defendants have the least
            information. We built this tool because informed defendants make
            better decisions, and better decisions create better outcomes for
            everyone in the system. If the analysis helps you, the Case Decoder
            ({TIER_CORE["case-decoder"].priceDisplay}) maps your complete defense landscape. But the plea analysis
            stands on its own with no obligation.
          </p>
        </div>

        {/* Intake form */}
        <div className="mb-10">
          <h2 className="text-2xl font-semibold mb-6">
            Enter your plea details
          </h2>
          <Suspense fallback={null}>
            <PleaAnalyzerClient />
          </Suspense>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-zinc-500 border-t border-zinc-800 pt-6">
          This tool provides legal INFORMATION, not legal ADVICE. The
          analysis draws on methods developed by elite defense attorneys,
          applied specifically to your plea offer details. Your attorney
          remains the final authority on strategy decisions. Your plea
          details are used only to generate your analysis and are not shared
          with third parties.
        </p>
      </div>
    </div>
  );
}

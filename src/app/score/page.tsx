/**
 * Masked Researcher's First Read (/score)
 *
 * Free lead magnet. 10 multiple-choice questions about the defendant's case
 * and attorney behavior. Output is delivered as a leaked-internal-memo
 * styled "First Read" with a 0-100 score, band classification, and findings.
 *
 * Technical name retained for SEO continuity: "Defense Milestone Score".
 * Public name (branded): "Masked Researcher's First Read".
 *
 * User journey position:
 *   Landing page (free CTA) -> THIS PAGE -> /checkout?tier=case-decoder (paid CTA)
 *   Blog posts -> THIS PAGE
 *   Direct traffic (SEO) -> THIS PAGE
 *
 * Conversion funnel:
 *   1. Answer 10 questions (zero friction, no email, no account)
 *   2. See memo + findings (immediate value, document-style presentation)
 *   3. Optional email capture, "Get our free Discovery Checklist" (soft ask)
 *   4. CTA to Case Decoder ($197), "Want the full breakdown + 15 questions?"
 *
 * The 10 questions map to key case progress indicators (see ScoreClient.tsx).
 *
 * Score computation: /api/score endpoint (server-side) evaluates answers
 * against defense milestone benchmarks and returns:
 *   - score: 0-100 numeric
 *   - band: Critical / Concerning / Average / Adequate / Excellent
 *   - observations: Array of plain-English findings rendered in the memo
 *
 * Privacy: "Your answers are not stored", important for trust.
 */
import type { Metadata } from "next";
import { Suspense } from "react";
import { SITE_URL } from "@/lib/site";
import ScoreClient from "./ScoreClient";

export const metadata: Metadata = {
  title: "Masked Researcher's First Read, Is Your Defense on Track?",
  description:
    "Free, anonymous 10-question assessment. Our researchers draft a one-page memo on where your defense stands, what milestones matter at your stage, and what questions to ask your attorney, in under 3 minutes.",
  alternates: {
    canonical: `${SITE_URL}/score`,
  },
  openGraph: {
    title: "Masked Researcher's First Read, Is Your Defense on Track?",
    description:
      "Free 10-question assessment. Memo-format findings plus the questions your attorney should have already answered.",
    url: `${SITE_URL}/score`,
    type: "website",
  },
};

export default function ScorePage() {
  return (
    <Suspense fallback={null}>
      <ScoreClient />
    </Suspense>
  );
}

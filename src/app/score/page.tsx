/**
 * Defense Milestone Score Page (/score)
 *
 * Free lead magnet — no email required, no login, no paywall. Users answer
 * 10 multiple-choice questions about their case and attorney behavior and
 * receive a 0-100 score with band classification and observations.
 *
 * User journey position:
 *   Landing page (free CTA) -> THIS PAGE -> /checkout?tier=case-decoder (paid CTA)
 *   Blog posts -> THIS PAGE
 *   Direct traffic (SEO) -> THIS PAGE
 *
 * Conversion funnel:
 *   1. Answer 10 questions (zero friction — no email, no account)
 *   2. See score + observations (immediate value)
 *   3. Optional email capture — "Get our free Discovery Checklist" (soft ask)
 *   4. CTA to Case Decoder ($197) — "Want the full breakdown + 15 questions?"
 *
 * The 10 questions map to key case progress indicators:
 *   1. chargeType — What charge (drug, DUI, white collar, etc.)
 *   2. timeSinceArrest — How long since arrest (speed matters for motions)
 *   3. hasAttorney — Private, public defender, or none
 *   4. motionsFiled — Has attorney filed any motions?
 *   5. hasDiscovery — Has client received discovery documents?
 *   6. communicationFrequency — How often attorney communicates
 *   7. strategyDiscussed — Has attorney discussed case strategy?
 *   8. criminalHistory — Prior convictions (affects sentencing exposure)
 *   9. caseStage — Current case stage (determines milestone relevance)
 *  10. licensedProfession — Licensed profession (flags collateral career risk)
 *
 * Score computation: /api/score endpoint (server-side) evaluates answers
 * against defense milestone benchmarks and returns:
 *   - score: 0-100 numeric
 *   - band: Critical / Concerning / Average / Adequate / Excellent
 *   - observations: Array of plain-English findings
 *
 * Score display:
 *   - Color-coded circle (red/orange/yellow/green/emerald by band)
 *   - Observations list
 *   - Optional email capture (POST to /api/subscribe, source="score-page")
 *   - CTA to Case Decoder for paid deep-dive
 *   - "Take the score again" reset link (full page reload)
 *
 * Privacy: "Your answers are not stored" — important for trust.
 */
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import ScoreClient from "./ScoreClient";

export const metadata: Metadata = {
  title: "Defense Milestone Score — Is Your Defense on Track?",
  description:
    "Free, anonymous 10-question assessment. See where your defense stands, what milestones matter at your stage, and what questions to ask your attorney — in under 3 minutes.",
  alternates: {
    canonical: `${SITE_URL}/score`,
  },
  openGraph: {
    title: "Defense Milestone Score — Is Your Defense on Track?",
    description:
      "Free 10-question assessment — see where your defense stands and what to ask your attorney.",
    url: `${SITE_URL}/score`,
    type: "website",
  },
};

export default function ScorePage() {
  return <ScoreClient />;
}

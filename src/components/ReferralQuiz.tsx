"use client";
/**
 * Referral Quiz, SMIQ + micro-commitment follow-ups + personalized recommendation.
 *
 * Ryan Levesque ASK Method: Single Most Important Question first, then 2-3
 * tailored follow-ups, then ONE recommendation (Hormozi, no pricing table).
 * Empowerment framing per crisis purchasing psychology research.
 *
 * Presentation contract (item #7, bondsman-referral audit 2026-04-19):
 * - Persistent partner credit (top-right) on EVERY step, Cialdini Unity -> Authority handoff.
 * - Proof strip (15,386 judges / 33,000+ opinions / every citation verified) visible across steps.
 * - Cost-of-inaction anchor on recommendation screen (Hormozi Value Equation for crisis).
 * - Bundle + guarantee reframe on recommendation screen. No 10% discount framing.
 *   Guarantee language is sourced from existing site copy (see src/app/family/page.tsx,
 *   src/components/BlogCTA.tsx) and the operational guarantee_invocations system
 *   (src/lib/cron/monitoring.ts). Bundle language maps to TIER_CORE[slug].includesTiers.
 */

import { useState, useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { TIER_CORE, isValidTier, type TierSlug } from "@/lib/tiers";
import Link from "next/link";

interface ReferralQuizProps {
  promoCode: string;
  partnerName: string;
}

// Fail-loud: case-decoder is a core fallback tier. If the entry is missing from
// TIER_CORE, every code path that references it (including the "Not sure yet?"
// soft-CTA) should explode at module load, not silently hide UI at render time.
const CASE_DECODER_TIER = TIER_CORE["case-decoder"];
if (!CASE_DECODER_TIER) {
  throw new Error("case-decoder tier missing from TIER_CORE");
}

// SMIQ options -> charge type slug mapping
const CHARGE_OPTIONS = [
  { label: "DUI / DWI", slug: "dui-first-offense" },
  { label: "Drug possession", slug: "drug-possession" },
  { label: "Drug trafficking", slug: "drug-trafficking" },
  { label: "White collar (fraud, embezzlement)", slug: "white-collar" },
  { label: "Federal charges", slug: "federal-criminal" },
  { label: "Probation violation", slug: "probation-violation" },
  { label: "Sex offense", slug: "sex-offense" },
  { label: "Self-defense claim", slug: "self-defense" },
  { label: "Other criminal charges", slug: "other" },
];

// Follow-up questions
const FOLLOW_UPS = [
  {
    question: "Do you have an attorney yet?",
    options: [
      { label: "Yes, private attorney", value: "private" },
      { label: "Yes, public defender", value: "public-defender" },
      { label: "No, not yet", value: "none" },
    ],
  },
  {
    question: "How long ago were you charged?",
    options: [
      { label: "This week", value: "this-week" },
      { label: "This month", value: "this-month" },
      { label: "Months ago", value: "months-ago" },
    ],
  },
  {
    question: "What's your biggest concern right now?",
    options: [
      { label: "I don't understand my charges", value: "confused" },
      { label: "My attorney isn't communicating", value: "no-communication" },
      { label: "I'm worried about the outcome", value: "worried" },
    ],
  },
];

// Fallback tier slugs, validated at compile time via satisfies
const FALLBACK_XRAY: TierSlug = "x-ray" satisfies TierSlug;
const FALLBACK_INTEL: TierSlug = "intelligence-brief" satisfies TierSlug;
const FALLBACK_DECODER: TierSlug = "case-decoder" satisfies TierSlug;

type RecommendedTier = {
  slug: TierSlug;
  reason: string;
};

function getRecommendation(
  chargeSlug: string,
  attorney: string,
  timing: string,
  concern: string,
): RecommendedTier {
  // UPL GUARD: Reason strings must NEVER include specific § numbers, named case citations,
  // or predictive statements about this defendant's outcome. Use "commonly" / "typical" /
  // "in the range" qualifiers. The "worried about the outcome" follow-up branch especially
  // must stay on information side — do not respond with outcome-predictive language.

  // Private attorney + no communication + months in -> X-Ray upsell
  // Situation warrants forensic-level analysis, they're paying for an attorney
  // who isn't delivering, so full discovery + judge intel + 35-50 questions
  if (
    attorney === "private" &&
    concern === "no-communication" &&
    timing === "months-ago"
  ) {
    return {
      slug: FALLBACK_XRAY,
      reason:
        "You\u2019ve already invested $5,000\u201325,000 in a private attorney who isn\u2019t communicating. " +
        "The gap between a prepared defense and an under-prepared one at sentencing is commonly 18\u201336 months of custody. " +
        "The X-Ray is the forensic layer your attorney should have built: every discovery document cross-referenced, " +
        "your specific judge\u2019s sentencing patterns, 35\u201350 questions pulled from the facts of your case. " +
        "Not opinions. A documented methodology applied to your record.",
    };
  }

  // Public defender + worried about outcome + months in -> Intelligence Brief
  // PD caseloads mean the defendant needs their own intelligence layer
  if (
    attorney === "public-defender" &&
    concern === "worried" &&
    timing === "months-ago"
  ) {
    return {
      slug: FALLBACK_INTEL,
      reason:
        "Public defenders commonly carry 80\u2013300 open cases. Average prep time per case is under 7 hours. " +
        "Your case deserves its own intelligence layer. The Intelligence Brief gives you a briefing on your judge, " +
        "your prosecutor, and your charges \u2014 plus 15\u201325 questions built to force the conversations your attorney doesn\u2019t have time to start.",
    };
  }

  // Federal/serious charges with no communication -> Intelligence Brief
  if (
    ["federal-criminal", "drug-trafficking"].includes(chargeSlug) &&
    concern === "no-communication"
  ) {
    return {
      slug: FALLBACK_INTEL,
      reason:
        "Public defenders commonly carry 80\u2013300 open cases. Average prep time per case is under 7 hours. " +
        "Your case deserves its own intelligence layer. The Intelligence Brief gives you a briefing on your judge, " +
        "your prosecutor, and your charges \u2014 plus 15\u201325 questions built to force the conversations your attorney doesn\u2019t have time to start.",
    };
  }

  // No attorney yet or attorney not communicating -> Case Decoder
  if (attorney === "none" || concern === "no-communication") {
    return {
      slug: FALLBACK_DECODER,
      reason:
        "First conviction collateral consequences are commonly measured in years of lost earnings, not dollars of fine. " +
        "The Case Decoder walks through your specific charges, the prosecution\u2019s typical strategy, and 10\u201315 questions " +
        "that make your attorney\u2019s first offer harder to defend.",
    };
  }

  // Has attorney, wants quick prep -> charge-specific Playbook
  if (chargeSlug !== "other" && isValidTier(chargeSlug)) {
    const chargeLabel =
      CHARGE_OPTIONS.find((o) => o.slug === chargeSlug)?.label ?? "criminal";
    return {
      slug: chargeSlug,
      reason:
        `Most first-time ${chargeLabel} defendants accept the first offer. The questions in this playbook are the ones that force a better one \u2014 ` +
        "sourced from 33,000+ classified opinions and the judicial patterns our system already tracks.",
    };
  }

  // "Other" charges -> Case Decoder (no generic playbook)
  return {
    slug: FALLBACK_DECODER,
    reason:
      "First conviction collateral consequences are commonly measured in years of lost earnings, not dollars of fine. " +
      "The Case Decoder walks through your specific charges, the prosecution\u2019s typical strategy, and 10\u201315 questions " +
      "that make your attorney\u2019s first offer harder to defend.",
  };
}

// --------------------------------------------------------------------------
// EDIT A: Persistent partner credit (used on every step + recommendation)
// Top-right "Introduced by {Bondsman}" keeps Cialdini Unity -> Authority handoff
// visible through the full quiz flow. INAA-branded shell on the left.
// Uses text-zinc-400 (not text-zinc-500) on text-xs per design rule.
// --------------------------------------------------------------------------
function PartnerCreditBar({ partnerName }: { partnerName: string }) {
  // partnerName trusted because partners table is admin-curated; revisit if
  // self-serve partner signup ships (would need sanitization/escaping pass).
  // Layout weights the bondsman credit (right, text-sm) slightly heavier than
  // the INAA brand (left, text-xs) with a subtle separator so the eye lands on
  // the embedded-insider credit first. Brand rule: bondsman is the trusted op.
  return (
    <div className="flex items-center justify-between gap-4 mb-4">
      <span className="text-xs font-semibold text-zinc-300">
        ImNotAnAttorney
      </span>
      <span className="flex items-center gap-3 text-sm text-zinc-400 text-right">
        <span aria-hidden="true" className="h-4 w-px bg-zinc-700" />
        <span>
          Introduced by{" "}
          <span className="text-amber-400 font-medium">{partnerName}</span>
        </span>
      </span>
    </div>
  );
}

// --------------------------------------------------------------------------
// EDIT B: Proof strip (compact, NOT a hero)
// Canonical facts: 15,386 judges / 33,000+ opinions / every citation verified.
// Rendered on every step under the partner-credit bar, above progress bar.
// These numbers are facts (cross-ref MEMORY: project-tier9-data-readiness-complete,
// project-legal-pipeline-status), not marketing claims.
// --------------------------------------------------------------------------
function ProofStrip() {
  return (
    <div
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-zinc-400 mb-5 border-y border-zinc-800 py-2"
      aria-label="Data coverage"
    >
      <span>
        <span className="text-zinc-200 font-semibold">15,386</span> judges
        indexed
      </span>
      <span aria-hidden="true" className="text-zinc-600">
        /
      </span>
      <span>
        <span className="text-zinc-200 font-semibold">33,000+</span> opinions
        classified
      </span>
      <span aria-hidden="true" className="text-zinc-600">
        /
      </span>
      <span>Every citation verified to source</span>
    </div>
  );
}

export function ReferralQuiz({ promoCode, partnerName }: ReferralQuizProps) {
  const [step, setStep] = useState(0); // 0 = SMIQ, 1-3 = follow-ups, 4 = recommendation
  const [chargeSlug, setChargeSlug] = useState("");
  const [answers, setAnswers] = useState<string[]>([]);

  const totalSteps = 4; // SMIQ + 3 follow-ups
  const progress = Math.min(((step + 1) / (totalSteps + 1)) * 100, 100);

  // Fire quiz_complete event when recommendation step renders (before early return)
  const eventFired = useRef(false);
  useEffect(() => {
    if (step === totalSteps && !eventFired.current) {
      eventFired.current = true;
      fetch("/api/partner/track-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partner_promo_code: promoCode,
          event_type: "quiz_complete",
          metadata: { charge_type: chargeSlug },
        }),
      }).catch(() => {
        // Fire-and-forget -- don't block UI on tracking failure
      });
    }
  }, [step, promoCode, chargeSlug]);

  function selectCharge(slug: string) {
    setChargeSlug(slug);
    setStep(1);
  }

  function selectFollowUp(value: string) {
    const newAnswers = [...answers, value];
    setAnswers(newAnswers);
    setStep(Math.min(step + 1, totalSteps));
  }

  // Recommendation phase
  if (step === totalSteps) {
    // Guard: recommendation depends on all three follow-up answers. If the
    // step counter is at totalSteps but answers are incomplete (partial state
    // from a refresh or unexpected transition), render nothing rather than
    // fall through to a generic "other" recommendation.
    if (answers.length < 3) return null;
    const rec = getRecommendation(chargeSlug, answers[0] || "", answers[1] || "", answers[2] || "");
    const tier = TIER_CORE[rec.slug];
    if (!tier) return null;

    // EDIT D: Bundle framing from tiers.ts, includesTiers is the additive source of truth.
    const includedTiers = (tier.includesTiers ?? [])
      .map((slug) => TIER_CORE[slug as TierSlug])
      .filter((t): t is NonNullable<typeof t> => t !== undefined);
    const decoderPrice = CASE_DECODER_TIER.priceDisplay;

    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4 py-16">
        <div className="max-w-lg w-full">
          <PartnerCreditBar partnerName={partnerName} />
          <ProofStrip />

          <h2 className="text-2xl font-bold text-center mb-2">
            Based on your answers, start here:
          </h2>
          <p className="text-zinc-300 text-center mb-6">{rec.reason}</p>

          {/* Cost-of-inaction anchor (Hormozi Value Equation for crisis).
              Compressed to two lines so the primary CTA sits above the fold.
              No named citations — the "every citation verified to source"
              proof strip gets broken the moment we name a source without a
              stored URL. Generic ranges ("commonly", "into the tens of
              thousands") stay information-side, UPL-safe, and defensible. */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 mb-6">
            <p className="text-xs uppercase tracking-wide text-zinc-400 mb-2">
              What walking in unprepared costs
            </p>
            <ul className="text-sm text-zinc-300 space-y-1.5">
              <li>
                Private defense retainers commonly run $5,000 to $25,000.
              </li>
              <li>
                A conviction on a background check commonly costs tens of
                thousands in lost wages the first year.
              </li>
              <li>
                Jobs, housing, licensing, immigration &mdash; years of
                collateral damage, not dollars.
              </li>
            </ul>
            <p className="text-xs text-zinc-400 mt-3">
              {tier.priceDisplay} to walk in prepared is the cheap part.
            </p>
          </div>

          <div className="bg-zinc-900 rounded-xl border border-zinc-500 p-6">
            <h3 className="text-xl font-bold text-amber-400 mb-1">
              {tier.name}
            </h3>
            <p className="text-zinc-400 text-sm mb-4">{tier.delivery}</p>

            {/* EDIT D: Bundle + price (no strike-through, no 10%-off framing).
                Price sourced from tiers.ts, never hardcoded. */}
            <div className="flex items-baseline gap-3 mb-4 flex-wrap">
              <span className="text-3xl font-bold text-white">
                {tier.priceDisplay}
              </span>
              <span className="text-amber-400 text-sm font-medium">
                Referral from {partnerName}
              </span>
            </div>

            {/* EDIT D: Bundle positioning, additive tier inclusion from
                tiers.ts. Visual grammar = checkmarks (you get more), not
                plus signs (you pay more). */}
            {includedTiers.length > 0 ? (
              <div className="mb-4 text-sm text-zinc-300">
                <p className="text-zinc-400 text-xs uppercase tracking-wide mb-2">
                  Included at this tier
                </p>
                <ul className="space-y-1.5">
                  <li className="flex gap-2 items-start">
                    <Check
                      aria-hidden="true"
                      className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5"
                    />
                    <span>
                      <span className="font-semibold text-white">
                        {tier.name}
                      </span>{" "}
                      — {tier.delivery}
                    </span>
                  </li>
                  {includedTiers.map((t) => (
                    <li key={t.name} className="flex gap-2 items-start">
                      <Check
                        aria-hidden="true"
                        className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5"
                      />
                      <span>
                        <span className="font-semibold text-white">
                          {t.name}
                        </span>{" "}
                        — {t.priceDisplay} value included
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <ul className="text-zinc-300 text-sm space-y-2 mb-4 border-l-2 border-zinc-700 pl-4">
                <li>Full {tier.name} delivered to your inbox</li>
                <li>
                  Free court-date reminders through your case (partner benefit)
                </li>
              </ul>
            )}

            {/* EDIT D: Guarantee / risk reversal. Headline language aligned
                with home-page canonical form (src/app/page.tsx:73) and the
                operational guarantee_invocations system
                (src/lib/cron/monitoring.ts). Bright-line, counted, auditable.
                Delivery window is surfaced explicitly via tier.delivery so
                the "delivered inside the stated window" promise isn't
                invisible on this screen. */}
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 mb-5">
              <p className="text-sm font-semibold text-amber-300 mb-1">
                Full refund if it doesn&apos;t give you at least 15
                case-specific questions your attorney hasn&apos;t raised.
              </p>
              <p className="text-xs text-zinc-400">
                Every citation verified to source. Every judge profile backed by
                court records. Delivered inside your {tier.delivery} window or
                your money back, no argument.
              </p>
            </div>

            <Link
              href={`/checkout?tier=${rec.slug}&ref=${promoCode}`}
              className="block w-full text-center px-6 py-4 bg-amber-500 text-black font-bold rounded-xl text-lg hover:bg-amber-400 transition-colors min-h-[44px]"
            >
              Start My {tier.name}
            </Link>

            {/* Divider */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-zinc-700" />
              <span className="text-zinc-400 text-sm">or</span>
              <div className="flex-1 h-px bg-zinc-700" />
            </div>

            {/* Free court prep CTA */}
            <Link
              href={`/r/${promoCode}/reminders?charge=${chargeSlug}&rec=${rec.slug}`}
              className="block w-full text-center px-6 py-3 border border-zinc-500 text-zinc-200 rounded-xl hover:border-amber-500 hover:text-white transition-colors min-h-[44px]"
            >
              Get Free Court Prep
            </Link>
            <p className="text-zinc-400 text-xs text-center mt-2">
              Court date reminders + what to expect at your hearing.
            </p>

            {rec.slug !== "case-decoder" && decoderPrice ? (
              <p className="text-zinc-400 text-sm text-center mt-4">
                Not sure yet? Start with the{" "}
                <Link
                  href={`/r/${promoCode}/case-decoder`}
                  className="text-zinc-200 underline hover:text-amber-400"
                >
                  Case Decoder
                </Link>{" "}
                for {decoderPrice}, same refund promise.
              </p>
            ) : null}
          </div>

          <p className="text-center text-zinc-400 text-xs mt-6">
            ImNotAnAttorney provides legal information, not legal advice.
          </p>
        </div>
      </div>
    );
  }

  // SMIQ step
  if (step === 0) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4 py-16">
        <div className="max-w-lg w-full">
          <PartnerCreditBar partnerName={partnerName} />
          <ProofStrip />

          {/* Progress bar */}
          <div className="w-full bg-zinc-800 rounded-full h-1.5 mb-8">
            <div
              className="bg-amber-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">
            What are you charged with?
          </h2>

          <div className="space-y-3">
            {CHARGE_OPTIONS.map((opt) => (
              <button
                key={opt.slug}
                onClick={() => selectCharge(opt.slug)}
                className="w-full text-left px-5 py-4 bg-zinc-900 rounded-xl border border-zinc-500 hover:border-amber-500 hover:bg-zinc-800 transition-colors min-h-[44px]"
              >
                {opt.label}
              </button>
            ))}
          </div>

          <p className="text-center text-zinc-400 text-xs mt-8">
            Code <span className="font-mono text-amber-400">{promoCode}</span>{" "}
            is applied automatically.
          </p>
        </div>
      </div>
    );
  }

  // Follow-up steps (1-3)
  const followUp = FOLLOW_UPS[step - 1];
  if (!followUp) {
    // Safety fallback, render null; recommendation check above handles step === totalSteps
    return null;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4 py-16">
      <div className="max-w-lg w-full">
        <PartnerCreditBar partnerName={partnerName} />
        <ProofStrip />

        {/* Progress bar */}
        <div className="w-full bg-zinc-800 rounded-full h-1.5 mb-8">
          <div
            className="bg-amber-500 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">
          {followUp.question}
        </h2>

        <div className="space-y-3">
          {followUp.options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => selectFollowUp(opt.value)}
              className="w-full text-left px-5 py-4 bg-zinc-900 rounded-xl border border-zinc-500 hover:border-amber-500 hover:bg-zinc-800 transition-colors min-h-[44px]"
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

"use client";
/**
 * Referral Quiz, SMIQ + micro-commitment follow-ups + personalized recommendation.
 *
 * Ryan Levesque ASK Method: Single Most Important Question first, then 2-3
 * tailored follow-ups, then ONE recommendation (Hormozi, no pricing table).
 * Empowerment framing per crisis purchasing psychology research.
 */

import { useState, useEffect, useRef } from "react";
import { TIER_CORE, isValidTier, type TierSlug } from "@/lib/tiers";
import Link from "next/link";

interface ReferralQuizProps {
  promoCode: string;
  partnerName: string;
}

// SMIQ options → charge type slug mapping
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

  // Private attorney + no communication + months in → X-Ray upsell
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

  // Public defender + worried about outcome + months in → Intelligence Brief
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

  // Federal/serious charges with no communication → Intelligence Brief
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

  // No attorney yet or attorney not communicating → Case Decoder
  if (attorney === "none" || concern === "no-communication") {
    return {
      slug: FALLBACK_DECODER,
      reason:
        "First conviction collateral consequences are commonly measured in years of lost earnings, not dollars of fine. " +
        "The Case Decoder walks through your specific charges, the prosecution\u2019s typical strategy, and 10\u201315 questions " +
        "that make your attorney\u2019s first offer harder to defend.",
    };
  }

  // Has attorney, wants quick prep → charge-specific Playbook
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

  // "Other" charges → Case Decoder (no generic playbook)
  return {
    slug: FALLBACK_DECODER,
    reason:
      "First conviction collateral consequences are commonly measured in years of lost earnings, not dollars of fine. " +
      "The Case Decoder walks through your specific charges, the prosecution\u2019s typical strategy, and 10\u201315 questions " +
      "that make your attorney\u2019s first offer harder to defend.",
  };
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
    const rec = getRecommendation(chargeSlug, answers[0] || "", answers[1] || "", answers[2] || "");
    const tier = TIER_CORE[rec.slug];
    if (!tier) return null;
    const originalPrice = tier.price / 100;
    const discountedPrice = Math.round(originalPrice * 0.9 * 100) / 100;

    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4 py-16">
        <div className="max-w-lg w-full">
          <div className="flex items-center justify-between text-xs text-zinc-500 mb-4">
            <span>ImNotAnAttorney</span>
            <span>Introduced by <span className="text-zinc-300">{partnerName}</span></span>
          </div>

          <h2 className="text-2xl font-bold text-center mb-2">
            Based on your answers, start here:
          </h2>
          <p className="text-zinc-400 text-center mb-6">{rec.reason}</p>
          <p className="text-zinc-500 text-center text-xs mb-8">
            Introduced by {partnerName}. Your {promoCode} discount is already applied below.
          </p>

          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-zinc-500 mb-6">
            <span>15,386 judges indexed</span>
            <span>&bull;</span>
            <span>33,000+ opinions classified</span>
            <span>&bull;</span>
            <span>Every citation verified to source</span>
          </div>

          <div className="bg-zinc-900 rounded-xl border border-zinc-500 p-6">
            <h3 className="text-xl font-bold text-amber-400 mb-2">{tier.name}</h3>
            <p className="text-zinc-400 text-sm mb-4">{tier.delivery}</p>

            <div className="flex items-baseline gap-3 mb-4">
              <span className="text-zinc-400 line-through text-lg">
                ${originalPrice}
              </span>
              <span className="text-3xl font-bold text-white">
                ${discountedPrice.toFixed(2)}
              </span>
              <span className="text-amber-400 text-sm font-medium">
                via {partnerName}
              </span>
            </div>

            <ul className="text-zinc-300 text-sm space-y-2 mb-6 border-l-2 border-zinc-700 pl-4">
              <li>Full {tier.name} delivered to your inbox</li>
              <li>Free court-date reminders through your case (partner benefit)</li>
              <li>If the first deliverable doesn&apos;t give you questions your attorney can&apos;t easily answer, refund &mdash; no argument.</li>
            </ul>

            <Link
              href={`/checkout?tier=${rec.slug}&ref=${promoCode}`}
              className="block w-full text-center px-6 py-4 bg-amber-500 text-black font-bold rounded-xl text-lg hover:bg-amber-400 transition-colors"
            >
              Start My {tier.name}
            </Link>

            {/* Divider */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-zinc-700" />
              <span className="text-zinc-500 text-sm">or</span>
              <div className="flex-1 h-px bg-zinc-700" />
            </div>

            {/* Free court prep CTA */}
            <Link
              href={`/r/${promoCode}/reminders?charge=${chargeSlug}&rec=${rec.slug}`}
              className="block w-full text-center px-6 py-3 border border-zinc-500 text-zinc-300 rounded-xl hover:border-amber-500 hover:text-white transition-colors"
            >
              Get Free Court Prep
            </Link>
            <p className="text-zinc-400 text-xs text-center mt-2">
              Court date reminders + what to expect at your hearing.
            </p>

            {rec.slug !== "case-decoder" && (
              <p className="text-zinc-500 text-sm text-center mt-4">
                Not sure yet? Start with the <Link href={`/r/${promoCode}/case-decoder`} className="text-zinc-300 underline hover:text-amber-400">Case Decoder</Link> for $177 &mdash; refund if it doesn&apos;t help.
              </p>
            )}
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
          <div className="flex items-center justify-between text-xs text-zinc-500 mb-4">
            <span>ImNotAnAttorney</span>
            <span>Introduced by <span className="text-zinc-300">{partnerName}</span></span>
          </div>

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
                className="w-full text-left px-5 py-4 bg-zinc-900 rounded-xl border border-zinc-500 hover:border-amber-500 hover:bg-zinc-800 transition-colors"
              >
                {opt.label}
              </button>
            ))}
          </div>

          <p className="text-center text-zinc-400 text-xs mt-8">
            Code <span className="font-mono text-amber-400">{promoCode}</span> is applied automatically.
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
        <div className="flex items-center justify-between text-xs text-zinc-500 mb-4">
          <span>ImNotAnAttorney</span>
          <span>Introduced by <span className="text-zinc-300">{partnerName}</span></span>
        </div>

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
              className="w-full text-left px-5 py-4 bg-zinc-900 rounded-xl border border-zinc-500 hover:border-amber-500 hover:bg-zinc-800 transition-colors"
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

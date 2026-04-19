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
        "You\u2019ve invested in a private attorney but aren\u2019t getting answers. " +
        "The X-Ray gives you the full forensic analysis \u2014 discovery documents, " +
        "judge intel, prosecution weaknesses \u2014 plus 35\u201350 questions that " +
        "make your attorney impossible to ignore.",
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
        "With a public defender handling dozens of cases, you need your own " +
        "intelligence. This is a comprehensive research brief on your judge, " +
        "your charges, and the specific questions that force attention to YOUR case.",
    };
  }

  // Federal/serious charges with no communication → Intelligence Brief
  if (
    ["federal-criminal", "drug-trafficking"].includes(chargeSlug) &&
    concern === "no-communication"
  ) {
    return {
      slug: FALLBACK_INTEL,
      reason: "Your charges are serious and your attorney needs to hear the right questions. This gives you the full intelligence picture.",
    };
  }

  // No attorney yet or attorney not communicating → Case Decoder
  if (attorney === "none" || concern === "no-communication") {
    return {
      slug: FALLBACK_DECODER,
      reason: "You need clarity on your case and the exact questions to bring to any attorney you meet with.",
    };
  }

  // Has attorney, wants quick prep → charge-specific Playbook
  if (chargeSlug !== "other" && isValidTier(chargeSlug)) {
    return {
      slug: chargeSlug,
      reason: "You have an attorney. This gives you the specific questions they hope you never ask, tailored to your exact charge type.",
    };
  }

  // "Other" charges → Case Decoder (no generic playbook)
  return {
    slug: FALLBACK_DECODER,
    reason: "We'll research your specific charges and give you 10-15 targeted questions for your attorney.",
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
    const savings = (originalPrice - discountedPrice).toFixed(2);

    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4 py-16">
        <div className="max-w-lg w-full">
          <h2 className="text-2xl font-bold text-center mb-2">
            Here&apos;s what to consider
          </h2>
          <p className="text-zinc-400 text-center mb-8">{rec.reason}</p>

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
            </div>

            <p className="text-amber-400 text-sm font-medium mb-6">
              Code <span className="font-mono">{promoCode}</span> saves you ${savings}
            </p>

            <Link
              href={`/checkout?tier=${rec.slug}&ref=${promoCode}`}
              className="block w-full text-center px-6 py-4 bg-amber-500 text-black font-bold rounded-xl text-lg hover:bg-amber-400 transition-colors"
            >
              Get Started
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

            <Link
              href="/services"
              className="block text-center text-zinc-400 text-sm mt-4 hover:text-zinc-400"
            >
              See other options
            </Link>
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
            {partnerName}&apos;s code <span className="font-mono text-amber-400">{promoCode}</span> is applied automatically.
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

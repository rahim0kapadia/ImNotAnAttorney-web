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
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { TIER_CORE } from "@/lib/tiers";
import { SITE_URL } from "@/lib/site";
import Link from "next/link";
import { AnimatedScoreArc } from "@/components/motion/AnimatedScoreArc";
import { ShareButtons } from "@/components/ShareButtons";
import { FadeInUp } from "@/components/motion/FadeInUp";

/**
 * The 10 scoring questions. Each has a unique id (used as the key in the
 * answers object sent to /api/score) and radio-button options.
 * Question order is deliberate: starts with charge type (context),
 * then probes defense milestones, and finally collateral risk factors.
 */
const questions = [
  {
    id: "chargeType",
    label: "What are you charged with?",
    options: [
      { value: "drug", label: "Drug offense" },
      { value: "dui", label: "DUI / DWI" },
      { value: "white-collar", label: "White collar / fraud" },
      { value: "other-felony", label: "Other felony" },
      { value: "other-misdemeanor", label: "Other misdemeanor" },
    ],
  },
  {
    id: "timeSinceArrest",
    label: "How long ago were you arrested or charged?",
    options: [
      { value: "less-than-1-month", label: "Less than 1 month" },
      { value: "1-3-months", label: "1-3 months" },
      { value: "3-6-months", label: "3-6 months" },
      { value: "6-12-months", label: "6-12 months" },
      { value: "12-plus-months", label: "12+ months" },
    ],
  },
  {
    id: "hasAttorney",
    label: "Do you have an attorney?",
    options: [
      { value: "private", label: "Yes — private attorney" },
      { value: "public-defender", label: "Yes — public defender" },
      { value: "no", label: "No" },
      { value: "not-sure", label: "Not sure" },
    ],
  },
  {
    id: "motionsFiled",
    label: "Has your attorney filed any motions?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
      { value: "dont-know", label: "I don't know" },
    ],
  },
  {
    id: "hasDiscovery",
    label: "Have you received discovery documents?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
      { value: "dont-know", label: "I don't know what that is" },
    ],
  },
  {
    id: "communicationFrequency",
    label: "How often does your attorney communicate with you?",
    options: [
      { value: "weekly", label: "Weekly" },
      { value: "monthly", label: "Monthly" },
      { value: "rarely", label: "Rarely" },
      { value: "never", label: "Never" },
    ],
  },
  {
    id: "strategyDiscussed",
    label: "Has your attorney discussed case strategy with you?",
    options: [
      { value: "yes-detail", label: "Yes, in detail" },
      { value: "briefly", label: "Briefly" },
      { value: "no", label: "No" },
    ],
  },
  {
    id: "criminalHistory",
    label: "Do you have prior convictions?",
    options: [
      { value: "none", label: "No prior convictions" },
      { value: "misdemeanor", label: "Prior misdemeanor(s)" },
      { value: "felony", label: "Prior felony conviction" },
      { value: "multiple", label: "Multiple prior convictions" },
    ],
  },
  {
    id: "caseStage",
    label: "What stage is your case at?",
    options: [
      { value: "pre-arrest", label: "Under investigation (not arrested yet)" },
      { value: "arrested", label: "Arrested — awaiting first court date" },
      { value: "arraigned", label: "Had arraignment — awaiting next hearing" },
      { value: "pre-trial", label: "Pre-trial (discovery/motions phase)" },
      { value: "trial-prep", label: "Preparing for trial" },
      { value: "sentencing", label: "Sentencing" },
      { value: "post-conviction", label: "Post-conviction (appeal/expungement)" },
    ],
  },
  {
    id: "licensedProfession",
    label: "Are you employed in a licensed profession?",
    options: [
      { value: "yes-licensed", label: "Yes — licensed profession (nurse, teacher, CDL, etc.)" },
      { value: "yes-other", label: "Yes — other employment" },
      { value: "no", label: "Not currently employed" },
      { value: "student", label: "Student" },
    ],
  },
];

/** Maps score chargeType values to playbook tier slugs */
const CHARGE_PLAYBOOK: Record<string, string> = {
  dui: "dui-first-offense",
  drug: "drug-possession",
  "white-collar": "white-collar",
};

/** Converts chargeType slug to display label */
function getChargeLabel(charge: string): string {
  const labels: Record<string, string> = {
    drug: "drug offense",
    dui: "DUI/DWI",
    "white-collar": "white collar",
    "other-felony": "felony",
    "other-misdemeanor": "misdemeanor",
  };
  return labels[charge] ?? charge;
}

/** Shape of the response from /api/score. */
type ScoreResult = {
  score: number;
  band: string;
  observations: string[];
};

/**
 * Attorney email templates by charge type — free value before any paid CTA.
 * Defendants can copy-paste these and send to their attorney immediately.
 * Uses "I'd like to understand" framing (UPL-safe — questions, not advice).
 */
const ATTORNEY_EMAIL_TEMPLATES: Record<string, { questions: string[]; preservationNote: string }> = {
  dui: {
    questions: [
      "I'd like to understand the current status of the breathalyzer maintenance and calibration records for the device used in my case. Have these been requested and preserved?",
      "Has any dash cam or body cam footage from the stop and arrest been requested? I understand some agencies have 30- or 90-day retention windows.",
      "Have any motions been filed or planned in my case? If so, what is the timeline? If not, I'd like to understand why.",
      "When is our next scheduled communication, and what should I prepare before then?",
    ],
    preservationNote: "Breathalyzer calibration logs and dash cam footage have fixed retention windows — some agencies delete footage at 30 or 90 days.",
  },
  drug: {
    questions: [
      "I'd like to understand whether the search warrant and affidavit in my case have been reviewed for potential challenges. Have any issues been identified?",
      "Has the lab report been compared against the field inventory — specifically weight, substance type, and chain of custody documentation?",
      "Have any motions been filed or planned, specifically regarding evidence suppression or search validity? What are the filing deadlines?",
      "When is our next scheduled communication, and what should I prepare before then?",
    ],
    preservationNote: "Search warrant challenges and evidence suppression motions must be filed before specific court deadlines. Once those windows close, the evidence stays in.",
  },
  "white-collar": {
    questions: [
      "I'd like to understand the current scope of the investigation — which transactions or time periods are at issue, and has the government's theory of the case been identified?",
      "Has the loss calculation methodology been examined? I understand the loss amount can significantly affect sentencing guidelines.",
      "Have any motions been filed or planned? What are the key filing deadlines I should be aware of?",
      "When is our next scheduled communication, and what should I prepare before then?",
    ],
    preservationNote: "Federal cases have strict filing deadlines for pre-trial motions, and loss calculation challenges must be raised early in the process.",
  },
  "other-felony": {
    questions: [
      "I'd like to understand the current status of discovery in my case. Has all discovery been received and reviewed?",
      "Have any issues been identified in the evidence — inconsistencies, missing documentation, or procedural concerns?",
      "Have any motions been filed or planned? What are the key filing deadlines?",
      "When is our next scheduled communication, and what should I prepare before then?",
    ],
    preservationNote: "Motion deadlines run from the date of arrest, not from when you decide to act. Filing windows close permanently.",
  },
  "other-misdemeanor": {
    questions: [
      "I'd like to understand the current status of discovery in my case. Has all discovery been received and reviewed?",
      "Have any issues been identified in the evidence — inconsistencies, missing documentation, or procedural concerns?",
      "Have any motions been filed or planned? What are the key filing deadlines?",
      "When is our next scheduled communication, and what should I prepare before then?",
    ],
    preservationNote: "Motion deadlines run from the date of arrest, not from when you decide to act. Filing windows close permanently.",
  },
};

/** Time index from timeSinceArrest — used for attorney email template eligibility */
function getTimeIndex(timeSinceArrest: string): number {
  const map: Record<string, number> = {
    "less-than-1-month": 0,
    "1-3-months": 1,
    "3-6-months": 2,
    "6-12-months": 3,
    "12-plus-months": 4,
  };
  return map[timeSinceArrest] ?? 0;
}

/** Animated counter that counts up from 0 to the target value */
function AnimatedCounter({ target }: { target: number }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target <= 0) return;
    const duration = 1500;
    const steps = 30;
    const increment = target / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [target]);

  if (target <= 0) return null;
  return (
    <p className="mt-2 text-xs text-zinc-500">
      {count.toLocaleString()} defendants have scored their defense
    </p>
  );
}

/** Personalized loading screen lines by charge type */
function getLoadingSteps(chargeType: string): string[] {
  const chargeLabel: Record<string, string> = {
    drug: "drug",
    dui: "DUI/DWI",
    "white-collar": "white collar",
    "other-felony": "felony",
    "other-misdemeanor": "misdemeanor",
  };
  const label = chargeLabel[chargeType] || chargeType;
  return [
    `Checking motion filing benchmarks for ${label} cases...`,
    "Analyzing communication frequency against attorney accountability standards...",
    "Comparing discovery receipt timeline to case stage...",
    "Evaluating defense milestone completion rate...",
    "Generating your Defense Milestone Score...",
  ];
}

/**
 * ScoreDisplay — renders the score result after the 10 questions are answered.
 *
 * Crisis buyer architecture (score 0-50):
 *   Score arc → Band context → Observations → Urgency block → Free attorney
 *   email template → Origin story → Tribe identity → Triage CTA (CD primary,
 *   IB secondary) → Band-specific email capture → Playbook step-down →
 *   Trust line → Reset
 *
 * Non-crisis architecture (score 51+):
 *   Score arc → Band context → Observations → "Attorney says fine" handler →
 *   Origin story → Tribe identity → Single CD CTA → Email capture →
 *   Playbook step-down → Trust line → Reset
 */
function ScoreDisplay({ result, emailSent, setEmailSent, answers, scoreRef, onAdjust }: { result: ScoreResult; emailSent: boolean; setEmailSent: (v: boolean) => void; answers: Record<string, string>; scoreRef: React.RefObject<HTMLDivElement | null>; onAdjust: () => void }) {
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [copiedTemplate, setCopiedTemplate] = useState(false);

  const isCrisis = result.score <= 50;
  const timeIndex = getTimeIndex(answers.timeSinceArrest);
  const showAttorneyTemplate = result.score < 60 && answers.motionsFiled !== "yes" && timeIndex >= 1;
  const showIBNudge = isCrisis && (
    ["pre-trial", "trial-prep", "sentencing", "post-conviction"].includes(answers.caseStage) ||
    timeIndex >= 3
  );

  // Band-to-color mapping: Critical (red) through Excellent (emerald)
  const bandColors: Record<string, string> = {
    Critical: "text-red-400 border-red-500/50",
    Concerning: "text-orange-400 border-orange-500/50",
    Average: "text-yellow-400 border-yellow-500/50",
    Adequate: "text-green-400 border-green-500/50",
    Excellent: "text-emerald-400 border-emerald-500/50",
  };

  const colorClass = bandColors[result.band] || "text-amber-400 border-amber-500/50";
  const [textClass] = colorClass.split(" ").filter((c) => c.startsWith("text-"));

  // Band-specific context lines — gives meaning to the band label
  const bandContextLines: Record<string, string> = {
    Critical: "This score means what you suspected: your defense is behind in ways that create permanent consequences.",
    Concerning: "Your defense is behind pace — 2-3 milestones need attention before windows close.",
    Average: "Meeting minimum benchmarks, but gaps often hide at this level.",
    Adequate: "Your attorney is clearing basic milestones. The vulnerabilities that matter most don\u2019t show up in 10 questions.",
    Excellent: "Surface checks clear. The gaps that change outcomes live in the charge-specific details a targeted analysis catches.",
  };

  // Band-specific CTA button copy (Hormozi)
  const bandCTAButton: Record<string, string> = {
    Critical: "Start My Case Analysis",
    Concerning: "Find the Gaps in My Defense",
    Average: "See What My Score Misses",
    Adequate: "Verify My Defense Is on Track",
    Excellent: "Verify My Defense Is on Track",
  };

  // Band-specific email capture headlines (Godin + Chaperon)
  const bandEmailHeadlines: Record<string, string> = {
    Critical: "Your attorney has 48 hours to answer these 10 questions. Get them now.",
    Concerning: "Your attorney has 48 hours to answer these 10 questions. Get them now.",
    Average: "Get the 10 questions your attorney hopes you never ask — sent now.",
    Adequate: "Get the checklist attorneys use to evaluate case readiness — sent now.",
    Excellent: "Get the checklist attorneys use to evaluate case readiness — sent now.",
  };

  /** Build the copy-paste attorney email text */
  function getAttorneyEmailText(): string {
    const template = ATTORNEY_EMAIL_TEMPLATES[answers.chargeType] || ATTORNEY_EMAIL_TEMPLATES["other-felony"];
    const lines = [
      "Subject: Case Status Questions",
      "",
      "Dear [Attorney Name],",
      "",
      "I have a few questions about my case that I'd like to understand better:",
      "",
    ];
    template.questions.forEach((q, i) => {
      lines.push(`${i + 1}. ${q}`);
      lines.push("");
    });
    lines.push("Thank you for your time. I look forward to hearing from you.");
    lines.push("");
    lines.push("[Your Name]");
    return lines.join("\n");
  }

  return (
    <div className="mt-8 space-y-6" tabIndex={-1} ref={scoreRef} aria-label={`Your Defense Milestone Score is ${result.score} out of 100, rated ${result.band}`}>
      {/* 1. SCORE ARC — Animated SVG arc with color transition by band */}
      <div className="text-center">
        <div className="mx-auto">
          <AnimatedScoreArc score={result.score} />
        </div>
        <p className={`mt-4 text-lg font-bold ${textClass}`}>{result.band}</p>
        <p className="mt-2 text-sm text-zinc-400">
          {bandContextLines[result.band] || ""}
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          Scored against pre-trial preparation standards used by top criminal defense attorneys.
        </p>
      </div>

      {/* 2. OBSERVATIONS — Plain-English findings from the score algorithm */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-300">
          {isCrisis
            ? "Here\u2019s what your score found \u2014 and why each one matters:"
            : "Here\u2019s what your score reveals \u2014 and what to check next:"}
        </h3>
        {result.observations.map((obs, i) => (
          <FadeInUp key={i} delay={i * 0.1}>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <p className="text-sm leading-relaxed text-zinc-300">{obs}</p>
            </div>
          </FadeInUp>
        ))}
      </div>

      {/* 3. URGENCY BLOCK — for crisis buyers only (score <= 55) */}
      {result.score <= 55 && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4">
          <p className="text-sm leading-relaxed text-rose-200/90">
            <span className="font-semibold text-rose-400">Time-sensitive:</span>{" "}
            {answers.chargeType === "dui" && answers.motionsFiled !== "yes"
              ? "DUI cases have time-critical evidence — breathalyzer calibration logs and dash cam footage have fixed retention windows. Some agencies delete footage at 30 or 90 days. If your attorney hasn't preserved this evidence, it may already be gone."
              : answers.chargeType === "drug" && answers.motionsFiled !== "yes"
              ? "In drug cases, search warrant challenges and evidence suppression motions must be filed before specific court deadlines. Once those windows close, the evidence — even if improperly obtained — stays in."
              : "Motion deadlines in criminal cases run from the date of arrest — not from when you decide to act. Suppression motions, speedy trial demands, and diversion applications all have filing windows that close permanently."}
          </p>
        </div>
      )}

      {/* 3b. "MY ATTORNEY SAYS FINE" HANDLER — for non-crisis scorers */}
      {result.score > 55 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-sm leading-relaxed text-zinc-300">
            <span className="font-semibold text-white">If your attorney told you everything is fine:</span>{" "}
            that&apos;s exactly what this tool is designed to check. Attorneys communicate at the level of detail they think you can handle. The Case Decoder gives you the specific benchmarks for your charge type so you can have a different kind of conversation — one where you ask the questions.
          </p>
        </div>
      )}

      {/* 4. FREE ATTORNEY EMAIL TEMPLATE — The generous act (Task 1.1) */}
      {showAttorneyTemplate && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/50 p-6">
          <h3 className="font-semibold text-white">What to do in the next 24 hours — free, no purchase required</h3>
          <p className="mt-2 text-sm text-zinc-400">
            Your score flagged gaps that have deadlines attached. Here is an email you can send your attorney today. Copy it exactly.
          </p>
          <div className="relative mt-4 rounded-lg border border-zinc-700 bg-zinc-800/80 p-4">
            <pre className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300 font-sans">{getAttorneyEmailText()}</pre>
            <button
              onClick={() => {
                navigator.clipboard.writeText(getAttorneyEmailText());
                setCopiedTemplate(true);
                setTimeout(() => setCopiedTemplate(false), 3000);
              }}
              className="absolute right-3 top-3 rounded-md bg-zinc-700 px-3 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-600 transition-colors"
            >
              {copiedTemplate ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-3 text-xs text-zinc-400">
            {ATTORNEY_EMAIL_TEMPLATES[answers.chargeType]?.preservationNote || ATTORNEY_EMAIL_TEMPLATES["other-felony"].preservationNote}
          </p>
          <p className="mt-3 text-sm text-zinc-400">
            Whatever your attorney says — the Case Decoder translates the answers into plain language and tells you whether they add up.
          </p>
        </div>
      )}

      {/* 5. ORIGIN STORY — Built by a defendant (Task 1.2) */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
        <p className="text-sm leading-relaxed text-zinc-300">
          One of our founders spent six weeks in the dark while his attorney said nothing — then opened his own discovery and found 68.3 grams of missing evidence that his attorney had never raised. That case is why this tool exists.
        </p>
      </div>

      {/* 6. TRIBE IDENTITY — You're a different kind of defendant (Task 1.2) */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
        <p className="text-sm leading-relaxed text-zinc-300">
          Most defendants wait. They wait for their attorney to call. They wait for the court date. They wait to find out what&apos;s happening in their own case.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-300">
          You just scored your defense in 60 seconds. That&apos;s a different kind of defendant.
        </p>
        <p className="mt-2 text-sm font-medium text-zinc-200">
          That&apos;s who this was built for.
        </p>
      </div>

      {/* 7. CTA SECTION — Crisis vs non-crisis architecture */}
      {isCrisis ? (
        <>
          {/* CRISIS TRIAGE CTA — multiple options (Task 1.3) */}
          <div className="space-y-4">
            <p className="text-sm font-semibold text-zinc-300">Where to start depends on what you need next.</p>

            {/* Option A — Case Decoder (primary) */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
              <h3 className="font-bold text-white">Get your case analyzed in 48 hours — {TIER_CORE["case-decoder"].priceDisplay}</h3>
              <p className="mt-2 text-sm text-zinc-400">
                15 questions specific to your {getChargeLabel(answers.chargeType)} charges, a 7-day action plan, email templates, and phone scripts. Every question built from the same methods used by elite defense attorneys.
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                {TIER_CORE["case-decoder"].priceDisplay}. Less than one hour of the attorney time you already paid for.
              </p>
              <div className="mt-4">
                <Link
                  href={`/checkout?tier=case-decoder&charge=${answers.chargeType}&band=${result.band}`}
                  className="w-full rounded-lg bg-amber-500 px-6 py-4 text-center text-sm font-bold text-black transition-colors hover:bg-amber-400 sm:w-auto sm:inline-block block"
                >
                  {bandCTAButton[result.band] || "Start My Case Analysis"} — {TIER_CORE["case-decoder"].priceDisplay} →
                </Link>
              </div>
              <p className="mt-2 text-xs text-zinc-400">
                Not relevant to your specific situation? We rebuild it free, or refund everything.
              </p>
            </div>

            {/* Option B — Intelligence Brief (secondary, conditional) */}
            {showIBNudge && (
              <div className="rounded-xl border border-zinc-700 bg-zinc-900/50 p-6">
                <p className="text-sm text-zinc-300">
                  <span className="font-semibold text-white">Need everything now?</span>{" "}
                  The Intelligence Brief ({TIER_CORE["intelligence-brief"].priceDisplay}) adds prosecution vulnerability analysis, judge research, and defense theories specific to your jurisdiction.
                </p>
                <Link
                  href={`/checkout?tier=intelligence-brief&charge=${answers.chargeType}&band=${result.band}`}
                  className="mt-2 inline-block text-sm text-amber-400 underline decoration-amber-400/50 hover:text-amber-300"
                >
                  See what the Intelligence Brief includes →
                </Link>
              </div>
            )}
          </div>
        </>
      ) : (
        /* NON-CRISIS CTA — Single Case Decoder (softer copy) */
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
          <h3 className="font-bold text-white">
            {result.band === "Adequate"
              ? "Your defense looks active on the surface. The Case Decoder checks what surface indicators miss — prosecutor patterns, jurisdiction-specific filing windows, and the questions elite attorneys ask that most defendants never think to raise."
              : result.band === "Excellent"
              ? "You\u2019re passing the basics. The Case Decoder checks the charge-specific vulnerabilities that don\u2019t show up in 10 questions — the gaps that separate adequate outcomes from the best possible outcome."
              : "Average isn\u2019t a strategy. The Case Decoder finds what your attorney should be doing that isn\u2019t showing up in basic milestones."}
          </h3>
          <p className="mt-2 text-sm text-zinc-400">
            The score measured 10 surface indicators. The Case Decoder goes deeper — analyzing {getChargeLabel(answers.chargeType)}-specific patterns, your exact case stage, and the gaps your score revealed. 15 calibrated questions, email templates, and a 7-day action plan, delivered in 48 hours.
          </p>
          <p className="mt-2 text-xs text-zinc-400">
            {TIER_CORE["case-decoder"].priceDisplay}. Less than one hour of the attorney time you already paid for. Every dollar applies as credit toward higher tiers.
          </p>
          <div className="mt-4">
            <Link
              href={`/checkout?tier=case-decoder&charge=${answers.chargeType}&band=${result.band}`}
              className="w-full rounded-lg bg-amber-500 px-6 py-4 text-center text-sm font-bold text-black transition-colors hover:bg-amber-400 sm:w-auto sm:inline-block block"
            >
              {bandCTAButton[result.band] || "See What My Score Misses"} — {TIER_CORE["case-decoder"].priceDisplay} →
            </Link>
          </div>
        </div>
      )}

      {/* 8. EMAIL CAPTURE — Band-specific copy (Task 1.4) */}
      {!emailSent && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/50 p-6">
          <p className="font-semibold text-white">{bandEmailHeadlines[result.band] || "Get the 10 questions your attorney hopes you never ask — sent now."}</p>
          <p className="mt-1 text-sm text-zinc-400">
            Enter your email and we&apos;ll send it immediately. No pitch. No sales sequence. After that: practical information about your case stage, never more than once a week. Unsubscribe any time — one click, no questions.
          </p>
          <form onSubmit={async (e) => {
            e.preventDefault();
            if (emailSubmitting) return;
            setEmailSubmitting(true);
            setEmailError(null);
            const form = e.target as HTMLFormElement;
            const emailInput = (form.elements.namedItem("scoreEmail") as HTMLInputElement).value;
            try {
              const res = await fetch("/api/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: emailInput, source: "score-page", scoreBand: result.band, scoreValue: result.score, chargeType: answers.chargeType }),
              });
              if (res.ok) {
                setEmailSent(true);
              } else {
                setEmailError("Something went wrong. Please try again.");
              }
            } catch {
              setEmailError("Could not connect. Please try again.");
            } finally {
              setEmailSubmitting(false);
            }
          }} className="mt-3 flex gap-2">
            <input name="scoreEmail" type="email" required placeholder="you@example.com"
              aria-label="Email address"
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-base text-white placeholder-zinc-400 focus:border-amber-500 focus:outline-none" />
            <button type="submit" disabled={emailSubmitting}
              className="rounded-lg bg-amber-500 px-4 py-4 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-50">
              {emailSubmitting ? "..." : "Send It"}
            </button>
          </form>
          {emailError && <p role="alert" className="mt-2 text-sm text-red-400">{emailError}</p>}
        </div>
      )}
      {emailSent && (
        <p className="text-center text-sm text-green-400">Sent! Check your inbox.</p>
      )}

      {/* 9. PLAYBOOK STEP-DOWN — Below email capture for crisis, normal position for others */}
      {CHARGE_PLAYBOOK[answers.chargeType] && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/50 p-6">
          <p className="text-sm text-zinc-300">
            {isCrisis ? (
              <>
                <span className="font-semibold text-white">Need something right now?</span>{" "}
                The {TIER_CORE[CHARGE_PLAYBOOK[answers.chargeType] as keyof typeof TIER_CORE].name} is {TIER_CORE[CHARGE_PLAYBOOK[answers.chargeType] as keyof typeof TIER_CORE].priceDisplay}, instant download. Every dollar applies toward the Case Decoder within 30 days.
              </>
            ) : (
              <>
                <span className="font-semibold text-white">Not ready for the full Case Decoder?</span>{" "}
                The {TIER_CORE[CHARGE_PLAYBOOK[answers.chargeType] as keyof typeof TIER_CORE].name} is an instant PDF for {TIER_CORE[CHARGE_PLAYBOOK[answers.chargeType] as keyof typeof TIER_CORE].priceDisplay} — and every dollar applies as credit toward the Case Decoder within 30 days.
              </>
            )}
          </p>
          <Link
            href={answers.chargeType === "dui" ? "/playbook/dui-first-offense" : `/checkout?tier=${CHARGE_PLAYBOOK[answers.chargeType]}`}
            className="mt-3 w-full rounded-lg border border-amber-500/50 px-6 py-4 text-center text-sm font-semibold text-amber-400 transition-colors hover:border-amber-500 sm:w-auto sm:inline-block block"
          >
            Start with the Playbook — {TIER_CORE[CHARGE_PLAYBOOK[answers.chargeType] as keyof typeof TIER_CORE].priceDisplay} →
          </Link>
        </div>
      )}

      {/* 10. SHARE BUTTONS — viral growth loop */}
      <ShareButtons
        url="/score"
        title="Defense Milestone Score"
        heading="Know someone facing charges? Send them this tool — 60 seconds, free, no email."
        subheading="Share the tool, not your result. Their score stays private."
        shareText="Check if your attorney is actually working your case — free, 60 seconds, no email required: "
        utmParams="utm_source=share&utm_medium=score&utm_campaign=viral"
        order="sms-first"
      />

      {/* 11. PRIVACY + AGGREGATE NOTICE */}
      <p className="text-center text-xs text-zinc-400">
        Your answers are not stored, not associated with your name, and cannot be subpoenaed or used as evidence. This tool does not create an attorney-client relationship.
      </p>
      <p className="text-center text-xs text-zinc-500">
        Your individual answers are never stored. We track anonymous aggregate statistics to publish research that holds the system accountable.
      </p>

      {/* 12. RESET */}
      <p className="text-center text-sm text-zinc-400 space-x-4">
        <button
          onClick={() => window.location.reload()}
          className="text-amber-400 underline decoration-amber-400/50 hover:text-amber-300"
        >
          Take the score again
        </button>
        <button
          onClick={onAdjust}
          className="text-zinc-400 underline decoration-zinc-500/50 hover:text-zinc-300"
        >
          Adjust my answers
        </button>
      </p>
    </div>
  );
}

/**
 * ScorePage — main page component managing question/answer state
 * and the transition from questionnaire to score display.
 */
export default function ScorePage() {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [completionCount, setCompletionCount] = useState(0);
  const [loadingStep, setLoadingStep] = useState(0);
  const scoreRef = useRef<HTMLDivElement>(null);

  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === questions.length;

  // Fetch completion count on mount
  useEffect(() => {
    fetch("/api/score/count")
      .then((r) => r.json())
      .then((d) => setCompletionCount(d.count || 0))
      .catch(() => {});
  }, []);

  // Restore score from sessionStorage on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("inna-score");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.score !== undefined && parsed.band && parsed.observations) {
          setResult(parsed);
          if (parsed.answers) setAnswers(parsed.answers);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  /** Submit answers to /api/score for server-side scoring. Answers are not persisted. */
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allAnswered) return;

    setLoading(true);
    setLoadingStep(0);
    setError(null);

    // Personalized loading animation — cycle through steps
    const steps = getLoadingSteps(answers.chargeType);
    let stepIndex = 0;
    const stepTimer = setInterval(() => {
      stepIndex++;
      if (stepIndex < steps.length) {
        setLoadingStep(stepIndex);
      }
    }, 800);

    const startTime = Date.now();

    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers),
      });

      if (!res.ok) {
        clearInterval(stepTimer);
        setError("Something went wrong. Please try again.");
        return;
      }

      const data = await res.json();

      // Ensure minimum 3 second display for the loading animation
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 3000 - elapsed);

      await new Promise((resolve) => setTimeout(resolve, remaining));
      clearInterval(stepTimer);

      setResult(data);
      setCompletionCount((prev) => prev + 1);

      // Persist to sessionStorage (score + answers for context restoration)
      try {
        sessionStorage.setItem("inna-score", JSON.stringify({
          ...data,
          chargeType: answers.chargeType,
          answers,
        }));
      } catch {
        // sessionStorage might be full or unavailable
      }

      setTimeout(() => {
        scoreRef.current?.focus();
        scoreRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch {
      clearInterval(stepTimer);
      setError("Could not connect. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [allAnswered, answers]);

  return (
    <div className="px-4 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
              { "@type": "ListItem", position: 2, name: "Defense Milestone Score" },
            ],
          }),
        }}
      />
      <div className="mx-auto max-w-2xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white md:text-4xl">
            Is Your Attorney Actually Working Your Case?
          </h1>
          <p className="mt-3 text-zinc-400">
            Answer 10 questions. Get your Defense Milestone Score in 60 seconds — free, no email required.
          </p>
          <p className="mt-2 text-xs text-zinc-500">Your answers are not stored.</p>
          <AnimatedCounter target={completionCount} />
        </div>

        {result ? (
          <ScoreDisplay result={result} emailSent={emailSent} setEmailSent={setEmailSent} answers={answers} scoreRef={scoreRef} onAdjust={() => setResult(null)} />
        ) : (
          <form onSubmit={handleSubmit} className="mt-10 space-y-8">
            <p className="text-sm text-zinc-400">
              We built this because one of us had an attorney go silent for six weeks before a critical hearing. We didn&apos;t know what questions to ask — this tool tells you what we wish we&apos;d known. Answer honestly — there are no wrong answers.
            </p>
            {/* Progress indicator */}
            <div className="sticky top-0 z-10 rounded-b-lg bg-zinc-950/90 pb-3 pt-2 backdrop-blur-sm">
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${(answeredCount / questions.length) * 100}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-zinc-500">{answeredCount} of {questions.length} answered</p>
            </div>
            {questions.map((q, qIndex) => (
              <fieldset key={q.id}>
                <legend className="text-sm font-semibold text-zinc-300">
                  <span className="mr-2 text-amber-400">{qIndex + 1}.</span>
                  {q.label}
                </legend>
                {q.id === "criminalHistory" && (
                  <p className="mt-1 text-xs text-zinc-500">This affects sentencing risk context in your score, not your attorney&apos;s competence rating.</p>
                )}
                {q.id === "licensedProfession" && (
                  <p className="mt-1 text-xs text-zinc-500">Licensed professionals and students face separate collateral consequences — your score flags this if relevant.</p>
                )}
                <div className="mt-3 space-y-2">
                  {q.options.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 text-sm transition-colors ${
                        answers[q.id] === opt.value
                          ? "border-amber-500/50 bg-amber-500/5 text-white"
                          : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <input
                        type="radio"
                        name={q.id}
                        value={opt.value}
                        checked={answers[q.id] === opt.value}
                        onChange={() =>
                          setAnswers((prev) => ({
                            ...prev,
                            [q.id]: opt.value,
                          }))
                        }
                        className="h-5 w-5 border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}

            {/* "TOO SCARED TO FINISH" — reassurance for hesitating users (Task 1.5) */}
            {answeredCount >= 7 && !allAnswered && (
              <div className="rounded-lg border border-zinc-700 bg-zinc-900/30 p-4">
                <p className="text-sm leading-relaxed text-zinc-400">
                  If you&apos;re hesitating — that hesitation is information. The score doesn&apos;t create the gaps in your defense. It just shows you where they are. You&apos;re better off knowing.
                </p>
              </div>
            )}

            {error && (
              <div role="alert" className="rounded-lg border border-red-500/50 bg-red-500/10 p-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={!allAnswered || loading}
              className="w-full rounded-lg bg-amber-500 py-4 text-sm font-bold text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg
                    className="h-4 w-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  <span className="transition-opacity duration-300">
                    {getLoadingSteps(answers.chargeType)[loadingStep]}
                  </span>
                </span>
              ) : (
                "Get My Score"
              )}
            </button>

            {/* Privacy notice moved to subtitle area above */}
          </form>
        )}

        {/* Disclaimer */}
        <div className="mt-12 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs text-zinc-400">
            This score is an educational tool based on general defense
            milestones — not legal advice. Every case is different. Your attorney remains the final authority on strategy decisions
            specific to your situation.
          </p>
        </div>
      </div>
    </div>
  );
}

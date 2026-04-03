"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { TIER_CORE } from "@/lib/tiers";
import { SITE_URL } from "@/lib/site";
import Link from "next/link";
import { AnimatedScoreArc } from "@/components/motion/AnimatedScoreArc";
import { ShareButtons } from "@/components/ShareButtons";
import { FadeInUp } from "@/components/motion/FadeInUp";
import { copyToClipboard } from "@/lib/clipboard";
import { TestimonialSection } from "@/components/TestimonialSection";
import { useReducedMotion, AnimatePresence, motion } from "framer-motion";

/**
 * The 10 scoring questions. Each has a unique id (used as the key in the
 * answers object sent to /api/score) and radio-button options.
 * Question order: easy/validating first (attorney relationship), then case
 * details, sensitive last (charge type, criminal history, profession).
 * Builds momentum before asking harder questions — maximizes completion.
 */
const questions = [
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
    id: "chargeType",
    label: "What are you charged with?",
    options: [
      { value: "dui", label: "DUI / DWI" },
      { value: "drug-possession", label: "Drug possession" },
      { value: "drug-trafficking", label: "Drug trafficking / distribution" },
      { value: "probation-violation", label: "Probation violation" },
      { value: "white-collar", label: "White collar / fraud" },
      { value: "sex-offense", label: "Sex offense" },
      { value: "federal-criminal", label: "Federal criminal charge" },
      { value: "self-defense", label: "Self-defense / justifiable force" },
      { value: "other-felony", label: "Other felony" },
      { value: "other-misdemeanor", label: "Other misdemeanor" },
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
  "drug-possession": "drug-possession",
  "drug-trafficking": "drug-trafficking",
  "probation-violation": "probation-violation",
  "white-collar": "white-collar",
  "sex-offense": "sex-offense",
  "federal-criminal": "federal-criminal",
  "self-defense": "self-defense",
};

/** Converts chargeType slug to display label */
function getChargeLabel(charge: string): string {
  const labels: Record<string, string> = {
    drug: "drug offense",
    "drug-possession": "drug possession",
    "drug-trafficking": "drug trafficking",
    dui: "DUI/DWI",
    "probation-violation": "probation violation",
    "white-collar": "white collar",
    "sex-offense": "sex offense",
    "federal-criminal": "federal criminal",
    "self-defense": "self-defense",
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
  "drug-possession": {
    questions: [
      "I'd like to understand whether the search warrant and affidavit in my case have been reviewed for potential challenges. Have any issues been identified?",
      "Has the lab report been compared against the field inventory — specifically weight, substance type, and chain of custody documentation?",
      "Have any motions been filed or planned, specifically regarding evidence suppression or search validity? What are the filing deadlines?",
      "When is our next scheduled communication, and what should I prepare before then?",
    ],
    preservationNote: "Search warrant challenges and evidence suppression motions must be filed before specific court deadlines. Once those windows close, the evidence stays in.",
  },
  "drug-trafficking": {
    questions: [
      "I'd like to understand whether I'm charged based on quantity thresholds or actual distribution evidence, and how that affects my exposure to mandatory minimums.",
      "Has the reliability of any confidential informants been examined, and have we reviewed the CI's history of cases and cooperation agreements?",
      "If wiretap evidence was used, has the authorization and minimization compliance been reviewed for potential challenges?",
      "Have any motions been filed or planned? What are the key filing deadlines?",
    ],
    preservationNote: "Wiretap authorization challenges and CI reliability motions must be filed before specific pre-trial deadlines. Mandatory minimums for trafficking are based on quantity calculations that can be contested.",
  },
  "probation-violation": {
    questions: [
      "I'd like to understand whether this is classified as a technical or substantive violation, and how that distinction affects the possible outcomes.",
      "Are graduated sanctions or alternatives to revocation available in my jurisdiction, and have those been explored?",
      "What evidence does the prosecution intend to present at the revocation hearing, and what is our strategy for responding?",
      "When is the revocation hearing scheduled, and what documentation should I prepare?",
    ],
    preservationNote: "Probation revocation hearings can be scheduled quickly. Compliance documentation, treatment records, and employment verification should be gathered immediately.",
  },
  "sex-offense": {
    questions: [
      "I'd like to understand the full scope of collateral consequences — specifically registry requirements, residency restrictions, and employment limitations under current SORNA rules.",
      "Has the forensic evidence collection been reviewed for procedural errors — chain of custody, interview protocols, and digital evidence handling?",
      "Has all Brady material been requested and received? Are there any inconsistencies in witness statements or prior statements?",
      "Have any motions been filed or planned? What are the key filing deadlines I should be aware of?",
    ],
    preservationNote: "Digital evidence and forensic interview recordings may be subject to preservation requests. Registry consequences make plea decisions particularly high-stakes — understand the full collateral impact before any plea discussions.",
  },
  "federal-criminal": {
    questions: [
      "I'd like to understand my current sentencing guideline range under the USSG — including base offense level, specific offense characteristics, and criminal history category.",
      "Has all Rule 16 discovery been received and reviewed? Are there additional materials we should request?",
      "Have any discussions with the AUSA occurred regarding cooperation, plea agreements, or charge bargaining? What is the government's theory of the case?",
      "Have any motions been filed or planned? What are the key filing deadlines?",
    ],
    preservationNote: "Federal pre-trial motions have strict filing deadlines. Early assessment of cooperation options and sentencing exposure is critical — federal sentences are substantially longer than state equivalents.",
  },
  "self-defense": {
    questions: [
      "I'd like to understand our jurisdiction's self-defense standard — specifically, is this a 'stand your ground' jurisdiction or 'duty to retreat,' and how does that affect our defense theory?",
      "Has all evidence supporting my reasonable belief of imminent harm been preserved — including surveillance footage, 911 recordings, medical records, and witness statements?",
      "Has the proportionality of force been analyzed in the context of the threat I faced? Are we prepared to address this at trial?",
      "Have any motions been filed or planned? What are the key filing deadlines?",
    ],
    preservationNote: "Surveillance footage and 911 recordings have retention windows. Witness memories fade quickly — early identification and statements are critical for self-defense cases.",
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
function CompletionCounter({ target }: { target: number }) {
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
    <p className="mt-2 text-xs text-zinc-400">
      {count.toLocaleString()} defendants have scored their defense
    </p>
  );
}

/** Personalized loading screen lines by charge type */
function getLoadingSteps(chargeType: string): string[] {
  const chargeLabel: Record<string, string> = {
    drug: "drug",
    "drug-possession": "drug possession",
    "drug-trafficking": "drug trafficking",
    dui: "DUI/DWI",
    "probation-violation": "probation violation",
    "white-collar": "white collar",
    "sex-offense": "sex offense",
    "federal-criminal": "federal criminal",
    "self-defense": "self-defense",
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
function ScoreDisplay({ result, emailSent, setEmailSent, answers, scoreRef, onAdjust, onReset, stats }: { result: ScoreResult; emailSent: boolean; setEmailSent: (v: boolean) => void; answers: Record<string, string>; scoreRef: React.RefObject<HTMLDivElement | null>; onAdjust: () => void; onReset: () => void; stats: { totalCompletions: number; insights: { pctNoMotions: number | null; pctNeverDiscovery: number | null; pctNoComm: number | null } } | null }) {
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [copiedTemplate, setCopiedTemplate] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const isCrisis = result.score <= 50;
  const timeIndex = getTimeIndex(answers.timeSinceArrest);
  const showAttorneyTemplate = result.score < 75 && answers.motionsFiled !== "yes";
  const showIBNudge =
    ["pre-trial", "trial-prep", "sentencing", "post-conviction"].includes(answers.caseStage) ||
    (isCrisis && timeIndex >= 3);

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

  // Band-specific identity subtitles — VoC language that validates what the defendant is feeling
  const bandIdentity: Record<string, string> = {
    Critical: "Your gut was right. Something is wrong.",
    Concerning: "You're not imagining it — your case needs attention.",
    Average: "Your attorney is doing the minimum. Is that enough?",
    Adequate: "Things look okay on the surface. Most gaps hide here.",
    Excellent: "Your attorney appears to be working. Trust, but verify.",
  };

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
    Critical: "Get the 10 questions your attorney needs to answer — before your next court date.",
    Concerning: "Get the 10 questions that close the gaps your score just flagged — sent now.",
    Average: "Get the 10 questions that change how your next attorney meeting goes — sent now.",
    Adequate: "Get the advanced checklist — the gaps that matter most don\u2019t show up in 10 questions.",
    Excellent: "Get the verification checklist elite attorneys use to confirm case readiness — sent now.",
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

  async function handleShare() {
    if (shareLoading || shareToken) return;
    setShareLoading(true);
    setShareError(null);
    try {
      const res = await fetch("/api/score/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Could not create share link" }));
        setShareError(data.error || "Could not create share link");
        return;
      }
      const data = await res.json();
      setShareToken(data.token);
      setShareUrl(data.url);
    } catch {
      setShareError("Could not connect. Please try again.");
    } finally {
      setShareLoading(false);
    }
  }

  return (
    <div className="mt-8 space-y-6" tabIndex={-1} ref={scoreRef} aria-label={`Your Defense Milestone Score is ${result.score} out of 100, rated ${result.band}`}>
      {/* 1. SCORE ARC — Animated SVG arc with color transition by band */}
      <div className="text-center">
        <div className="mx-auto">
          <AnimatedScoreArc score={result.score} />
        </div>
        <p className={`mt-4 text-lg font-bold ${textClass}`}>{result.band}</p>
        <p className="mt-1 text-base text-zinc-300">
          {bandIdentity[result.band] || ""}
        </p>
        <p className="mt-2 text-base text-zinc-400">
          {bandContextLines[result.band] || ""}
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          Scored against pre-trial preparation benchmarks derived from documented defense methodology.
        </p>
      </div>

      {/* 2. OBSERVATIONS — Plain-English findings from the score algorithm */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-300">
          {isCrisis
            ? "Here\u2019s what your score found \u2014 and why each one matters:"
            : "Here\u2019s what your score reveals \u2014 and what to check next:"}
        </h2>
        {result.observations.map((obs, i) => (
          <FadeInUp key={i} delay={i * 0.1}>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <p className="text-base leading-relaxed text-zinc-300">{obs}</p>
            </div>
          </FadeInUp>
        ))}
      </div>

      {/* 2b. DAI BENCHMARK INSIGHTS — aggregate data from prior completions */}
      {stats && stats.insights.pctNoMotions !== null && (
        <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-500">
            What our data shows
          </p>
          <ul className="mt-3 space-y-2 text-sm text-zinc-400">
            {stats.insights.pctNoMotions !== null && stats.insights.pctNoMotions > 0 && (
              <li>{stats.insights.pctNoMotions}% of defendants who scored had no motions filed</li>
            )}
            {stats.insights.pctNeverDiscovery !== null && stats.insights.pctNeverDiscovery > 0 && (
              <li>{stats.insights.pctNeverDiscovery}% had never seen their discovery documents</li>
            )}
            {stats.insights.pctNoComm !== null && stats.insights.pctNoComm > 0 && (
              <li>{stats.insights.pctNoComm}% reported zero communication from their attorney</li>
            )}
          </ul>
          <p className="mt-3 text-xs text-zinc-400">
            Anonymous, aggregated data from {stats.totalCompletions.toLocaleString()} defense assessments.
          </p>
        </div>
      )}

      {/* 3. URGENCY BLOCK — for crisis buyers only (score <= 55) */}
      {result.score <= 55 && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4">
          <p className="text-base leading-relaxed text-rose-200/90">
            <span className="font-semibold text-rose-400">Time-sensitive:</span>{" "}
            {answers.chargeType === "dui" && answers.motionsFiled !== "yes"
              ? "DUI cases have time-critical evidence — breathalyzer calibration logs and dash cam footage have fixed retention windows. Some agencies delete footage at 30 or 90 days. If your attorney hasn't preserved this evidence, it may already be gone."
              : (answers.chargeType === "drug" || answers.chargeType === "drug-possession") && answers.motionsFiled !== "yes"
              ? "In drug possession cases, search warrant challenges and evidence suppression motions must be filed before specific court deadlines. Once those windows close, the evidence — even if improperly obtained — stays in."
              : answers.chargeType === "drug-trafficking"
              ? "Trafficking charges carry mandatory minimum sentences based on quantity calculations that can be contested. Wiretap authorization challenges and CI reliability motions have strict pre-trial deadlines — once those windows close, the evidence stays in regardless of how it was obtained."
              : answers.chargeType === "probation-violation"
              ? "Probation revocation hearings can be scheduled quickly and use a lower standard of proof. Compliance documentation, treatment records, and employment verification need to be gathered immediately — the hearing may come before you're ready."
              : answers.chargeType === "sex-offense"
              ? "Sex offense convictions trigger mandatory registry requirements, residency restrictions, and employment limitations that can last decades — separate from the criminal sentence. Every plea discussion needs to account for these collateral consequences before any decision is made."
              : answers.chargeType === "federal-criminal"
              ? "Federal cases move faster and carry substantially longer sentences than state cases. Federal sentencing guidelines and mandatory minimums make early guideline calculation and cooperation assessment critical — the window for pre-indictment intervention is narrow."
              : answers.chargeType === "self-defense"
              ? "Self-defense cases depend on evidence that degrades quickly — surveillance footage, 911 recordings, and witness memories. If this evidence isn't preserved now, it may not exist by trial. Your attorney should have preservation requests filed immediately."
              : "Motion deadlines in criminal cases run from the date of arrest — not from when you decide to act. Suppression motions, speedy trial demands, and diversion applications all have filing windows that close permanently."}
          </p>
        </div>
      )}

      {/* 3b. "MY ATTORNEY SAYS FINE" HANDLER — for non-crisis scorers */}
      {result.score > 55 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-base leading-relaxed text-zinc-300">
            <span className="font-semibold text-white">If your attorney told you everything is fine:</span>{" "}
            that&apos;s exactly what this tool is designed to check. Attorneys communicate at the level of detail they think you can handle. The Case Decoder gives you the specific benchmarks for your charge type — and the questions already written, built from the same methodology elite defense attorneys use internally.
          </p>
        </div>
      )}

      {/* 4. FREE ATTORNEY EMAIL TEMPLATE — The generous act (Task 1.1) */}
      {showAttorneyTemplate && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/50 p-6">
          <h2 className="font-semibold text-white">What to do in the next 24 hours — free, no purchase required</h2>
          <p className="mt-2 text-base text-zinc-400">
            Your score flagged gaps that have deadlines attached. Here is an email you can send your attorney today. Copy it exactly.
          </p>
          <div className="relative mt-4 rounded-lg border border-zinc-700 bg-zinc-800/80 p-4">
            <pre className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300 font-sans">{getAttorneyEmailText()}</pre>
            <button
              onClick={async () => {
                const ok = await copyToClipboard(getAttorneyEmailText());
                if (ok) {
                  setCopiedTemplate(true);
                  setTimeout(() => setCopiedTemplate(false), 3000);
                }
              }}
              className="absolute right-3 top-3 rounded-md bg-zinc-700 px-3 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-600 transition-colors"
            >
              {copiedTemplate ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-3 text-xs text-zinc-400">
            {ATTORNEY_EMAIL_TEMPLATES[answers.chargeType]?.preservationNote || ATTORNEY_EMAIL_TEMPLATES["other-felony"].preservationNote}
          </p>
          <p className="mt-3 text-base text-zinc-400">
            Whatever your attorney says — the Case Decoder translates the answers into plain language and tells you whether they add up.
          </p>
        </div>
      )}

      {/* 5. ORIGIN STORY — Built by a defendant (Task 1.2) */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
        <p className="text-base leading-relaxed text-zinc-300">
          One of our founders spent six weeks in the dark while his attorney said nothing — then opened his own discovery and found 68.3 grams of missing evidence that his attorney had never raised. That case is why this tool exists.
        </p>
      </div>

      {/* 6. TRIBE IDENTITY — You're a different kind of defendant (Task 1.2) */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
        <p className="text-base leading-relaxed text-zinc-300">
          Most defendants wait. They wait for their attorney to call. They wait for the court date. They wait to find out what&apos;s happening in their own case.
        </p>
        <p className="mt-2 text-base leading-relaxed text-zinc-300">
          You just scored your defense in 60 seconds. That&apos;s a different kind of defendant.
        </p>
        <p className="mt-2 text-sm font-medium text-zinc-200">
          That&apos;s who this was built for. Here&apos;s what comes next.
        </p>
      </div>

      {/* 7. EMAIL CAPTURE — Moved before paid CTAs per McGlaughlin: peak engagement moment */}
      {!emailSent && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-6">
          <p className="text-lg font-bold text-white">{bandEmailHeadlines[result.band] || "Get your free Defense Gap Report — the 10 questions that change how your next attorney meeting goes."}</p>
          <p className="mt-2 text-base text-zinc-300">
            Based on your score, we&apos;ll send your personalized Defense Gap Report immediately. No pitch. No sales sequence. After that: practical information about your case stage, never more than once a week. Unsubscribe any time — one click.
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
          }} className="mt-4 flex gap-2">
            <input name="scoreEmail" type="email" required placeholder="you@example.com"
              aria-label="Email address"
              className="flex-1 rounded-lg border border-amber-500/30 bg-zinc-800 px-4 py-3 text-base text-white placeholder-zinc-400 focus:border-amber-500 focus:outline-none" />
            <button type="submit" disabled={emailSubmitting}
              className="rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-50">
              {emailSubmitting ? "..." : "Send My Report"}
            </button>
          </form>
          {emailError && <p role="alert" className="mt-2 text-sm text-red-400">{emailError}</p>}
        </div>
      )}
      {emailSent && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 text-center">
          <p className="text-sm font-semibold text-green-400">Your Defense Gap Report is on its way.</p>
          <p className="mt-1 text-xs text-zinc-400">Check your inbox (and spam folder). After that: practical information about your case stage, never more than once a week. One-click unsubscribe anytime.</p>
        </div>
      )}

      {/* 8. CTA SECTION — Route to live products; playbook primary when live, Case Decoder when not */}
      {(() => {
        const playbookKey = CHARGE_PLAYBOOK[answers.chargeType] as keyof typeof TIER_CORE | undefined;
        const playbookTier = playbookKey ? TIER_CORE[playbookKey] : null;
        const hasLivePlaybook = playbookTier?.live === true;

        if (hasLivePlaybook && playbookTier && playbookKey) {
          // PLAYBOOK IS LIVE — make it the primary CTA (e.g. DUI Playbook $97)
          return (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
                <h2 className="font-bold text-white">
                  {isCrisis
                    ? `Your score says your defense has gaps. The ${playbookTier.name} shows you exactly where.`
                    : `The score measured 10 surface indicators. The ${playbookTier.name} goes deeper.`}
                </h2>
                <p className="mt-2 text-base text-zinc-400">
                  26 questions that change how your next attorney meeting goes. A roadmap for every stage of your case. Instant download — start reading in 60 seconds.
                </p>
                <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
                  <p className="text-xs font-semibold text-zinc-400">Sample questions inside:</p>
                  <ul className="mt-1 space-y-1 text-xs text-zinc-400">
                    <li>&ldquo;Have the calibration records for the device used in my case been subpoenaed?&rdquo;</li>
                    <li>&ldquo;What motions should have been filed by this stage of my case?&rdquo;</li>
                    <li>&ldquo;Has my attorney identified the specific sentencing enhancements the prosecution will seek?&rdquo;</li>
                  </ul>
                </div>
                <p className="mt-2 text-xs text-zinc-400">
                  {playbookTier.priceDisplay}. Less than one hour of the attorney time you already paid for.
                </p>
                <div className="mt-4">
                  <Link
                    href={`/checkout?tier=${playbookKey}&charge=${answers.chargeType}&band=${result.band}`}
                    className="w-full rounded-lg bg-amber-500 px-6 py-4 text-center text-sm font-bold text-black transition-colors hover:bg-amber-400 sm:w-auto sm:inline-block block"
                  >
                    Get Your {playbookTier.name} — {playbookTier.priceDisplay} →
                  </Link>
                </div>
                <p className="mt-2 text-xs text-zinc-400">
                  5 questions you&apos;ve never thought to ask — or full refund. No forms. No arguments.
                </p>
              </div>
              {/* Case Decoder upsell — secondary, softer */}
              <div className="rounded-xl border border-zinc-700 bg-zinc-900/50 p-6">
                <p className="text-base text-zinc-300">
                  <span className="font-semibold text-white">Need case-specific analysis?</span>{" "}
                  The Case Decoder ({TIER_CORE["case-decoder"].priceDisplay}) analyzes YOUR discovery, YOUR judge, YOUR case stage — 15 calibrated questions built from your exact charge type and case stage. Every playbook dollar applies as credit.
                </p>
                <Link
                  href={`/checkout?tier=case-decoder&charge=${answers.chargeType}&band=${result.band}`}
                  className="mt-2 inline-block text-sm text-amber-400 underline decoration-amber-400/50 hover:text-amber-300"
                >
                  Learn about the Case Decoder →
                </Link>
              </div>
            </div>
          );
        }

        // NO LIVE PLAYBOOK — show Case Decoder as primary (existing behavior)
        return isCrisis ? (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-zinc-300">Where to start depends on what you need next.</p>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
              <h2 className="font-bold text-white">Get your case analyzed by documented defense methodology — {TIER_CORE["case-decoder"].priceDisplay}</h2>
              <p className="mt-2 text-base text-zinc-400">
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
            {showIBNudge && (
              <div className="rounded-xl border border-zinc-700 bg-zinc-900/50 p-6">
                <p className="text-base text-zinc-300">
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
        ) : (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
            <h2 className="font-bold text-white">
              {result.band === "Adequate"
                ? "Your defense looks active on the surface. The Case Decoder checks what surface indicators miss — prosecutor patterns, jurisdiction-specific filing windows, and the questions elite attorneys ask that most defendants never think to raise."
                : result.band === "Excellent"
                ? "You\u2019re passing the basics. The Case Decoder checks the charge-specific vulnerabilities that don\u2019t show up in 10 questions — the gaps that separate adequate outcomes from the best possible outcome."
                : "Average isn\u2019t a strategy. The Case Decoder finds what your attorney should be doing that isn\u2019t showing up in basic milestones."}
            </h2>
            <p className="mt-2 text-base text-zinc-400">
              The score measured 10 surface indicators. The Case Decoder goes deeper — analyzing {getChargeLabel(answers.chargeType)}-specific patterns, your exact case stage, and the gaps your score revealed. 15 calibrated questions, email templates, and a 7-day action plan, built from your exact charge type and case stage.
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
            {showIBNudge && (
              <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-900/50 p-6">
                <p className="text-base text-zinc-300">
                  <span className="font-semibold text-white">Your case stage calls for deeper analysis.</span>{" "}
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
        );
      })()}

      {/* Old email capture removed — moved to section 7 above paid CTAs */}

      {/* 9. PLAYBOOK STEP-DOWN — Only shown when playbook is NOT already the primary CTA above */}
      {CHARGE_PLAYBOOK[answers.chargeType] && !TIER_CORE[CHARGE_PLAYBOOK[answers.chargeType] as keyof typeof TIER_CORE]?.live && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/50 p-6">
          <p className="text-base text-zinc-300">
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
            href={`/checkout?tier=${CHARGE_PLAYBOOK[answers.chargeType]}`}
            className="mt-3 w-full rounded-lg border border-amber-500/50 px-6 py-4 text-center text-sm font-semibold text-amber-400 transition-colors hover:border-amber-500 sm:w-auto sm:inline-block block"
          >
            Start with the Playbook — {TIER_CORE[CHARGE_PLAYBOOK[answers.chargeType] as keyof typeof TIER_CORE].priceDisplay} →
          </Link>
        </div>
      )}

      {/* 10. SAVE & SHARE — save results for later upgrade + viral share */}
      {!shareToken ? (
        <FadeInUp>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6 text-center">
            <p className="text-sm font-bold text-white">Save your results</p>
            <p className="mt-1 text-xs text-zinc-400">
              Get a personal link to your score. Come back anytime — your results stay on file if you decide to upgrade later.
            </p>
            <button
              onClick={handleShare}
              disabled={shareLoading}
              className="mt-4 rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-50 transition-colors"
            >
              {shareLoading ? "Saving..." : "Save & Get My Link"}
            </button>
            {shareError && <p role="alert" className="mt-2 text-xs text-red-400">{shareError}</p>}
          </div>
        </FadeInUp>
      ) : (
        <FadeInUp>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-6">
            <div className="text-center">
              <p className="text-sm font-bold text-emerald-400">Your results are saved</p>
              <p className="mt-1 text-xs text-zinc-400">
                Bookmark this link — your score, observations, and charge details are stored. If you upgrade later, we&apos;ll use these results so you don&apos;t repeat anything.
              </p>
              <div className="mt-3 flex items-center gap-2 justify-center">
                <input
                  readOnly
                  value={shareUrl!}
                  aria-label="Your saved results link"
                  className="flex-1 max-w-sm rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-300 select-all"
                  onFocus={(e) => e.target.select()}
                />
                <button
                  onClick={async () => {
                    const ok = await copyToClipboard(shareUrl!);
                    if (ok) {
                      const btn = document.activeElement as HTMLButtonElement;
                      btn.textContent = "Copied";
                      setTimeout(() => { btn.textContent = "Copy"; }, 2000);
                    }
                  }}
                  aria-label="Copy results link to clipboard"
                  className="rounded-lg bg-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-600 transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-zinc-800">
              <p className="text-center text-xs text-zinc-400 mb-3">Know someone facing charges? Send them the free quiz.</p>
              <ShareButtons
                url={shareUrl!}
                title={`Defense Milestone Score: ${result.band}`}
                heading=""
                subheading=""
                shareText={`I just scored my criminal defense in 60 seconds — free, no email. Worth checking if you have a case: ${shareUrl}`}
                emailBody={`I used this free tool to check if my attorney is hitting basic defense milestones. Takes 60 seconds, no email required: ${shareUrl}`}
              />
            </div>
          </div>
        </FadeInUp>
      )}

      {/* 11. PRIVACY + AGGREGATE NOTICE */}
      <p className="text-center text-xs text-zinc-400">
        Your answers are not stored, not associated with your name, and cannot be subpoenaed or used as evidence. This tool does not create an attorney-client relationship.
      </p>
      <p className="text-center text-xs text-zinc-400">
        Your individual answers are never stored. We track anonymous aggregate statistics to publish research that holds the system accountable.
      </p>

      {/* 12. RESET */}
      <p className="text-center text-sm text-zinc-400 space-x-4">
        <button
          onClick={onReset}
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
 * ScoreClient — main page component managing question/answer state
 * and the transition from questionnaire to score display.
 */
export default function ScoreClient() {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [stats, setStats] = useState<{
    totalCompletions: number;
    insights: { pctNoMotions: number | null; pctNeverDiscovery: number | null; pctNoComm: number | null };
  } | null>(null);
  const scoreRef = useRef<HTMLDivElement>(null);

  // Wizard state
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const questionContainerRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === questions.length;
  const currentQuestion = questions[currentStep];

  // Fetch DAI stats on mount (includes totalCompletions — single source of truth)
  useEffect(() => {
    fetch("/api/stats/score-summary")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  // Focus management: move focus to question container on step change
  useEffect(() => {
    if (!result && questionContainerRef.current) {
      questionContainerRef.current.focus();
    }
  }, [currentStep, result]);

  // Cancel auto-advance on keyboard navigation
  const handleWizardKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      if (autoAdvanceTimer.current) {
        clearTimeout(autoAdvanceTimer.current);
        autoAdvanceTimer.current = null;
      }
    }
  }, []);

  /** Select an answer and auto-advance to next step (300ms delay, respects reduced motion) */
  const handleSelect = useCallback((qId: string, value: string) => {
    const newAnswers = { ...answers, [qId]: value };
    setAnswers(newAnswers);

    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
    }

    // Skip auto-advance for reduced motion users — they use Next button
    if (shouldReduceMotion) return;

    // Don't auto-advance on last step — user submits manually
    if (currentStep >= questions.length - 1) return;

    autoAdvanceTimer.current = setTimeout(() => {
      setDirection("forward");
      setCurrentStep((s) => s + 1);
      autoAdvanceTimer.current = null;
    }, 300);
  }, [answers, currentStep, shouldReduceMotion]);

  /** Submit score — extracted from form handler for programmatic use */
  const submitScore = useCallback(async (submittedAnswers: Record<string, string>) => {
    if (Object.keys(submittedAnswers).length !== questions.length) return;

    setLoading(true);
    setLoadingStep(0);
    setError(null);

    const steps = getLoadingSteps(submittedAnswers.chargeType);
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
        body: JSON.stringify(submittedAnswers),
      });

      if (!res.ok) {
        clearInterval(stepTimer);
        setLoadingStep(0);
        setError("Something went wrong. Please try again.");
        return;
      }

      const data = await res.json();
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 3000 - elapsed);
      await new Promise((resolve) => setTimeout(resolve, remaining));
      clearInterval(stepTimer);

      setResult(data);

      try {
        sessionStorage.setItem("inna-score", JSON.stringify({
          ...data,
          chargeType: submittedAnswers.chargeType,
          answers: submittedAnswers,
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

  /** Wizard animation variants */
  const stepVariants = shouldReduceMotion
    ? { enter: {}, center: {}, exit: {} }
    : {
        enter: (dir: "forward" | "back") => ({
          opacity: 0,
          x: dir === "forward" ? 60 : -60,
        }),
        center: { opacity: 1, x: 0 },
        exit: (dir: "forward" | "back") => ({
          opacity: 0,
          x: dir === "forward" ? -60 : 60,
        }),
      };

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
        {/* Pre-quiz hero — compact: badge + H1 + subtitle only */}
        <div className="text-center">
          <span className="mb-4 inline-block rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            Free — 60 seconds, no email required
          </span>
          <h1 className="font-display text-3xl font-bold text-white md:text-4xl">
            Is Your Attorney Actually Working Your Case?
          </h1>
          <p className="mt-3 text-base text-zinc-300">
            Find out in 60 seconds. 10 questions, instant score, anonymous — nothing stored, nothing sold.
          </p>
        </div>

        {/* Screen reader live region for step announcements */}
        <div aria-live="polite" aria-atomic="true" className="sr-only" role="status">
          {!result && !loading && `Question ${currentStep + 1} of ${questions.length}: ${currentQuestion.label}`}
          {loading && getLoadingSteps(answers.chargeType)[loadingStep]}
        </div>

        {result ? (
          <>
            <ScoreDisplay result={result} emailSent={emailSent} setEmailSent={setEmailSent} answers={answers} scoreRef={scoreRef} onAdjust={() => { setResult(null); setCurrentStep(0); }} onReset={() => { setResult(null); setAnswers({}); setEmailSent(false); setCurrentStep(0); try { sessionStorage.removeItem("inna-score"); } catch {} }} stats={stats} />

            {/* Post-quiz testimonial — social proof near CTAs */}
            <div className="mt-8">
              <TestimonialSection
                variant="inline"
                testimonials={[
                  {
                    quote: "The score showed me my attorney hadn't filed a single motion in 4 months. I brought the report to our next meeting. He filed three motions that week.",
                    name: "David R.",
                    charge: "Federal Drug Conspiracy",
                    outcome: "3 motions filed after confrontation",
                  },
                ]}
              />
              <p className="mt-4 text-center text-xs text-zinc-400">
                *Based on real defendant experiences. Names changed for privacy.
              </p>
            </div>
          </>
        ) : loading ? (
          /* Loading screen — centered, with role="status" for a11y */
          <div role="status" className="mt-12 text-center py-12">
            <svg
              className="mx-auto h-8 w-8 animate-spin text-amber-500"
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="mt-4 text-base text-zinc-300 transition-opacity duration-300">
              {getLoadingSteps(answers.chargeType)[loadingStep]}
            </p>
            <p className="mt-2 text-xs text-zinc-400">Your answers are not stored.</p>
          </div>
        ) : (
          /* Wizard — one question at a time */
          <div className="mt-8" onKeyDown={handleWizardKeyDown}>
            {/* Progress bar — tracks position, not completion */}
            <div className="mb-6">
              <div
                role="progressbar"
                aria-valuenow={currentStep + 1}
                aria-valuemin={1}
                aria-valuemax={questions.length}
                aria-label={`Question ${currentStep + 1} of ${questions.length}`}
                className="h-1.5 overflow-hidden rounded-full bg-zinc-800"
              >
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${((currentStep + 1) / questions.length) * 100}%` }}
                />
              </div>
              <p className="mt-1.5 text-sm text-zinc-400">
                Question {currentStep + 1} of {questions.length}
              </p>
            </div>

            {/* Question card with slide animation */}
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={currentStep}
                custom={direction}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: "easeInOut" }}
              >
                <div
                  ref={questionContainerRef}
                  tabIndex={-1}
                  role="group"
                  aria-labelledby={`question-label-${currentStep}`}
                  className="outline-none"
                >
                  <fieldset>
                    <legend
                      id={`question-label-${currentStep}`}
                      className="text-lg font-semibold text-zinc-200"
                    >
                      {currentQuestion.label}
                    </legend>
                    {currentQuestion.id === "criminalHistory" && (
                      <p className="mt-1 text-xs text-zinc-400">This affects sentencing risk context in your score, not your attorney&apos;s competence rating.</p>
                    )}
                    {currentQuestion.id === "licensedProfession" && (
                      <p className="mt-1 text-xs text-zinc-400">Licensed professionals and students face separate collateral consequences — your score flags this if relevant.</p>
                    )}
                    <div className="mt-4 space-y-3">
                      {currentQuestion.options.map((opt) => (
                        <label
                          key={opt.value}
                          className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-lg border px-4 py-3.5 text-base transition-all duration-150 ${
                            answers[currentQuestion.id] === opt.value
                              ? "border-amber-500 bg-amber-500/10 text-white shadow-[0_0_12px_rgba(245,158,11,0.15)]"
                              : "border-zinc-600 bg-zinc-900/60 text-zinc-300 hover:border-zinc-400 hover:bg-zinc-800/80"
                          } has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-amber-400 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-zinc-950`}
                        >
                          <input
                            type="radio"
                            name={currentQuestion.id}
                            value={opt.value}
                            checked={answers[currentQuestion.id] === opt.value}
                            onChange={() => handleSelect(currentQuestion.id, opt.value)}
                            className="h-5 w-5 border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500"
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Hesitation nudge on later questions */}
            {currentStep >= 7 && !answers[currentQuestion.id] && (
              <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-900/30 p-3">
                <p className="text-sm leading-relaxed text-zinc-400">
                  If you&apos;re hesitating — that hesitation is information. The score doesn&apos;t create the gaps in your defense. It just shows you where they are. You&apos;re better off knowing.
                </p>
              </div>
            )}

            {/* Navigation: Back / Next / Submit */}
            <div className="mt-6 flex items-center justify-between">
              {currentStep > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (autoAdvanceTimer.current) {
                      clearTimeout(autoAdvanceTimer.current);
                      autoAdvanceTimer.current = null;
                    }
                    setDirection("back");
                    setCurrentStep((s) => s - 1);
                  }}
                  className="rounded-lg px-4 py-2.5 text-sm text-zinc-400 transition-colors hover:text-white"
                >
                  &larr; Back
                </button>
              ) : (
                <div />
              )}

              {currentStep < questions.length - 1 ? (
                <button
                  type="button"
                  disabled={!answers[currentQuestion.id]}
                  onClick={() => {
                    if (autoAdvanceTimer.current) {
                      clearTimeout(autoAdvanceTimer.current);
                      autoAdvanceTimer.current = null;
                    }
                    setDirection("forward");
                    setCurrentStep((s) => s + 1);
                  }}
                  className="rounded-lg bg-zinc-800 px-5 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Next &rarr;
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!allAnswered}
                  onClick={() => submitScore(answers)}
                  className={`rounded-lg px-6 py-3 text-sm font-bold text-black transition-all ${
                    allAnswered
                      ? "bg-amber-500 hover:bg-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.3)]"
                      : "bg-amber-500/50 cursor-not-allowed opacity-50"
                  }`}
                >
                  Get My Score
                </button>
              )}
            </div>

            {error && (
              <div role="alert" className="mt-4 rounded-lg border border-red-500/50 bg-red-500/10 p-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* Disclaimer */}
        <div className="mt-12 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs text-zinc-400">
            This score is an educational tool based on 10 critical defense
            milestones identified across thousands of criminal cases &mdash; informed by the procedural standards established by defense methodologists. This is not legal advice. Every case is different. Your attorney remains the final authority on strategy decisions
            specific to your situation.
          </p>
        </div>
      </div>
    </div>
  );
}

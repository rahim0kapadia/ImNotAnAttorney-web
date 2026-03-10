/**
 * Intake Form Page (/intake)
 *
 * Multi-step (3-step) wizard that collects case details from customers.
 * This is the primary data collection point for service delivery. Customers
 * arrive here either:
 *   a) After purchasing Case Decoder (from /checkout/success CTA)
 *   b) Directly via /intake?interest=situation-room (Situation Room application)
 *   c) From the contact page or nav
 *
 * User journey position:
 *   /checkout/success -> THIS PAGE -> /api/intake (POST) -> Supabase intakes table
 *   /contact CTA -> THIS PAGE
 *
 * Query parameters:
 *   ?interest=situation-room — Pre-selects Situation Room in service interest
 *   ?email=... — Pre-fills email (passed from checkout success)
 *   ?tier=... — Pre-selects the corresponding service interest checkbox
 *
 * 3-Step wizard structure:
 *   Step 1 — Contact & Charges:
 *     Required: First name, email, jurisdiction level, charge type, state,
 *     court case number, time since arrest
 *     Conditional: Sex offense sub-routing, 3-4 charge-specific questions,
 *     county (required when jurisdiction_level = "state")
 *     Optional: Last name, phone, incident location, arrest circumstances
 *
 *   Step 2 — Your Situation:
 *     Required: Has attorney?
 *     Optional: Has discovery, co-defendants, attorney strategy, communication
 *     frequency, last attorney contact, arrest date, plea offered, plea terms,
 *     evidence types, court date, service interest, situation
 *
 *   Step 3 — One More Thing:
 *     Optional: One specific question (max 300 chars)
 *     Legal disclaimer + submit button
 *
 * Data flow:
 *   All form fields stored in a single `form` state object.
 *   Charge-specific answers stored in `chargeSpecific` sub-object.
 *   On submit, entire form object POSTed to /api/intake as JSON.
 *   API inserts into Supabase `intakes` table and sends operator notification.
 *
 * Validation:
 *   Step 1 gate: firstName + email + chargeType + state + caseNumber + timeSinceArrest + county (if state court)
 *   Step 2 gate: hasAttorney
 *   Step 3: No gate (all optional), submit always available
 *
 * Wrapped in Suspense for useSearchParams.
 */
"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { TIER_CORE } from "@/lib/tiers";

// ============================================================
// JURISDICTION + CHARGE TYPE CONFIGURATION
// ============================================================

/** Jurisdiction level — determines which charge categories and experts apply. */
const jurisdictionOptions = [
  { value: "federal", label: "Federal court" },
  { value: "state", label: "State or local court" },
  { value: "unknown", label: "I don\u2019t know" },
];

/** Federal charge categories. */
const federalChargeTypes = [
  { value: "drug-trafficking", label: "Drug Trafficking or Distribution" },
  { value: "white-collar", label: "Fraud or Financial Crime" },
  { value: "weapons", label: "Firearms Charge" },
  { value: "sex-offense-digital", label: "Sex Offense (Internet/Digital)" },
  { value: "federal", label: "Other Federal Charge" },
];

/** State charge categories. */
const stateChargeTypes = [
  { value: "drug-possession", label: "Drug Possession" },
  { value: "drug-trafficking", label: "Drug Trafficking / Distribution" },
  { value: "dui", label: "DUI / DWI" },
  { value: "assault", label: "Assault / Battery" },
  { value: "domestic-violence", label: "Domestic Violence" },
  { value: "theft", label: "Theft / Burglary / Robbery" },
  { value: "sex-offense", label: "Sex Offense" },
  { value: "weapons", label: "Weapons Charge" },
  { value: "other", label: "Other" },
];

/** Combined list (shown when jurisdiction is "unknown"). */
const allChargeTypes = [
  { value: "drug-possession", label: "Drug Possession" },
  { value: "drug-trafficking", label: "Drug Trafficking / Distribution" },
  { value: "dui", label: "DUI / DWI" },
  { value: "assault", label: "Assault / Battery" },
  { value: "domestic-violence", label: "Domestic Violence" },
  { value: "theft", label: "Theft / Burglary / Robbery" },
  { value: "sex-offense", label: "Sex Offense" },
  { value: "weapons", label: "Weapons Charge" },
  { value: "white-collar", label: "White Collar / Fraud" },
  { value: "federal", label: "Federal Charges" },
  { value: "other", label: "Other" },
];

/** Sex offense sub-routing (contact vs digital). */
const sexOffenseSubTypes = [
  { value: "sex-offense-contact", label: "Physical/contact allegation" },
  { value: "sex-offense-digital", label: "Internet or digital allegation" },
  { value: "sex-offense", label: "Don\u2019t know" },
];

// ============================================================
// CHARGE-SPECIFIC QUESTION DEFINITIONS
// Each charge type gets 3-4 expert-grounded questions with "Don't know" option.
// ============================================================

interface ChargeQuestion {
  id: string;
  label: string;
  options: string[];
}

const chargeSpecificQuestions: Record<string, ChargeQuestion[]> = {
  dui: [
    {
      id: "bacLevel",
      label: "BAC level (if known)",
      options: ["Under 0.08", "0.08\u20130.10", "0.10\u20130.15", "0.15\u20130.20", "Over 0.20", "Refused test", "Don\u2019t know"],
    },
    {
      id: "testType",
      label: "What type of test was administered?",
      options: ["Breathalyzer (roadside)", "Breathalyzer (at station)", "Blood draw", "Urine", "Refused all tests", "Don\u2019t know"],
    },
    {
      id: "fieldSobriety",
      label: "Were you asked to do field sobriety tests?",
      options: ["Yes, I performed them", "Yes, but I refused some", "I refused all", "Not asked to do them", "Don\u2019t know"],
    },
    {
      id: "priorDUI",
      label: "Prior DUI history",
      options: ["First offense", "Second offense", "Third or more", "Don\u2019t know"],
    },
  ],
  "sex-offense-contact": [
    {
      id: "relationship",
      label: "Relationship to accuser",
      options: ["Stranger", "Acquaintance", "Dating/romantic partner", "Ex-partner", "Family member", "Authority figure", "Online contact only", "Don\u2019t know"],
    },
    {
      id: "reportTiming",
      label: "When was the incident reported?",
      options: ["Same day", "Within a week", "Weeks later", "Months later", "Years later", "Don\u2019t know"],
    },
    {
      id: "saneKit",
      label: "Was a forensic exam (SANE kit) conducted?",
      options: ["Yes", "No", "Don\u2019t know"],
    },
    {
      id: "substanceInvolvement",
      label: "Was alcohol or drugs involved?",
      options: ["Both parties", "Only me", "Only the accuser", "No substances", "Don\u2019t know"],
    },
  ],
  "sex-offense-digital": [
    {
      id: "offenseType",
      label: "Type of allegation",
      options: ["Online sting or undercover operation", "Possession of illegal material", "Distribution or sharing", "Online solicitation", "Don\u2019t know"],
    },
    {
      id: "investigationOrigin",
      label: "How did the investigation start?",
      options: ["Police/agents came to my home", "Arrested in a sting", "ISP or tech company reported", "Employer reported", "Don\u2019t know"],
    },
    {
      id: "devicesSeized",
      label: "Were devices seized?",
      options: ["Yes, all devices taken", "Yes, some devices", "No, but may be searched", "Don\u2019t know"],
    },
    {
      id: "stingOperation",
      label: "Was this a sting operation?",
      options: ["Yes, law enforcement initiated contact", "Yes, but I initiated contact", "No", "Don\u2019t know"],
    },
  ],
  "domestic-violence": [
    {
      id: "relationship",
      label: "Relationship to alleged victim",
      options: ["Spouse or partner", "Ex-spouse or ex-partner", "Dating", "Family member", "Roommate", "Other"],
    },
    {
      id: "initiator",
      label: "Who initiated physical contact?",
      options: ["I did", "The other person did", "It was mutual", "No physical contact occurred", "Don\u2019t know"],
    },
    {
      id: "protectiveOrder",
      label: "Protective order in place?",
      options: ["Yes, against me", "Yes, I have one against them", "No", "Previously had one", "Don\u2019t know"],
    },
    {
      id: "motive",
      label: "Do you believe the allegations are motivated by something other than truth?",
      options: ["No", "Custody or divorce leverage", "Retaliation or revenge", "Immigration benefit", "Other", "Prefer not to say"],
    },
  ],
  weapons: [
    {
      id: "discoveryMethod",
      label: "How was the weapon discovered?",
      options: ["Traffic stop search", "Search warrant on home", "Warrantless search", "Plain view", "Consent search", "Informant tip", "During another arrest", "Don\u2019t know"],
    },
    {
      id: "weaponLocation",
      label: "Where was the weapon?",
      options: ["On my person", "In my vehicle", "In my home", "In a shared space", "Not near me", "Don\u2019t know"],
    },
    {
      id: "carryPermit",
      label: "Do you have a carry permit?",
      options: ["Yes, valid permit", "Expired permit", "No permit", "State doesn\u2019t require one", "Don\u2019t know"],
    },
    {
      id: "prohibitedStatus",
      label: "Anything that may prohibit you from possessing firearms?",
      options: ["No prohibitions", "Prior felony", "DV misdemeanor conviction", "Active restraining order", "Don\u2019t know"],
    },
  ],
  assault: [
    {
      id: "selfDefense",
      label: "Self-defense claimed?",
      options: ["Yes, I was defending myself", "Yes, defending someone else", "No self-defense claim", "Haven\u2019t discussed with attorney"],
    },
    {
      id: "initiator",
      label: "Who initiated physical contact?",
      options: ["The other person attacked me first", "I made first contact", "It was mutual", "A third party started it", "Unclear"],
    },
    {
      id: "forceLevel",
      label: "What level of force did you use?",
      options: ["Hands or fists only", "Pushed or shoved", "Used an object", "Used a knife", "Used a firearm", "Restrained or held down"],
    },
    {
      id: "couldLeave",
      label: "Could you have safely left the situation?",
      options: ["No, I was cornered or trapped", "No, protecting someone who couldn\u2019t leave", "Yes, but I stood my ground", "I tried to leave and couldn\u2019t"],
    },
  ],
  "white-collar": [
    {
      id: "investigationDiscovery",
      label: "How did you learn about the investigation?",
      options: ["Search warrant executed", "Subpoena received", "Target letter received", "Federal agent contacted me", "Arrested", "Learned from media or employer", "Don\u2019t know"],
    },
    {
      id: "professionalAdvice",
      label: "Did you rely on professional advice for the actions in question?",
      options: ["Yes, had attorney advising", "Yes, had accountant or CPA", "Yes, had compliance department", "No professional advice", "Not sure"],
    },
    {
      id: "lossAmount",
      label: "Alleged loss amount",
      options: ["Under $10,000", "$10,000\u2013$100,000", "$100,000\u2013$1M", "Over $1M", "Unknown or disputed", "Don\u2019t know"],
    },
    {
      id: "assetsSeized",
      label: "Have any assets been seized or frozen?",
      options: ["Yes, bank accounts frozen", "Yes, property seized", "Restraining order on assets", "No seizures yet", "Don\u2019t know"],
    },
  ],
  federal: [
    {
      id: "mandatoryMinimum",
      label: "Does your charge carry a mandatory minimum?",
      options: ["Yes", "No", "Don\u2019t know"],
    },
    {
      id: "cooperation",
      label: "Has cooperation been discussed?",
      options: ["Yes, active cooperation (proffer done)", "Considering it", "Declined", "Government hasn\u2019t asked", "Don\u2019t know"],
    },
    {
      id: "chargingMethod",
      label: "How were you charged?",
      options: ["Grand jury indictment", "Information (no grand jury)", "Don\u2019t know"],
    },
    {
      id: "mitigating",
      label: "Mitigating circumstances (select the most relevant)",
      options: ["Mental health condition", "Substance abuse history", "Military veteran", "Primary caregiver", "First-time offender", "Serious medical condition", "None of these"],
    },
  ],
  theft: [
    {
      id: "identification",
      label: "How were you identified as a suspect?",
      options: ["Caught at scene", "Eyewitness identification", "Photo array or lineup", "Surveillance footage", "Fingerprints or DNA", "Informant tip", "Found with property", "Don\u2019t know"],
    },
    {
      id: "weaponAlleged",
      label: "Was a weapon alleged?",
      options: ["Firearm", "Knife or weapon", "Weapon implied but not seen", "No weapon", "Don\u2019t know"],
    },
    {
      id: "propertyValue",
      label: "Alleged value of property",
      options: ["Under $500", "$500\u2013$1,000", "$1,000\u2013$10,000", "Over $10,000", "Don\u2019t know"],
    },
    {
      id: "alibi",
      label: "Do you have an alibi?",
      options: ["Yes, with witnesses", "Yes, with digital evidence (phone, receipts, cameras)", "Partial alibi", "No alibi", "Not sure"],
    },
  ],
  "drug-possession": [
    {
      id: "substanceType",
      label: "Substance type",
      options: ["Marijuana", "Cocaine", "Methamphetamine", "Fentanyl or opioids", "Prescription drugs", "Other", "Don\u2019t know"],
    },
    {
      id: "allegedAmount",
      label: "Alleged amount",
      options: ["Personal use quantity", "Near threshold amount", "Trafficking quantity", "Large quantity", "Don\u2019t know"],
    },
    {
      id: "evidenceFound",
      label: "How was evidence found?",
      options: ["Search warrant", "Consent search", "Traffic stop", "Plain view", "Informant tip", "Controlled buy", "Don\u2019t know"],
    },
    {
      id: "ciInvolved",
      label: "Were confidential informants involved?",
      options: ["Yes", "I think so", "No", "Don\u2019t know"],
    },
  ],
  "drug-trafficking": [
    {
      id: "substanceType",
      label: "Substance type",
      options: ["Marijuana", "Cocaine", "Methamphetamine", "Fentanyl or opioids", "Prescription drugs", "Other", "Don\u2019t know"],
    },
    {
      id: "allegedAmount",
      label: "Alleged amount",
      options: ["Personal use quantity", "Near threshold amount", "Trafficking quantity", "Large quantity", "Don\u2019t know"],
    },
    {
      id: "evidenceFound",
      label: "How was evidence found?",
      options: ["Search warrant", "Consent search", "Traffic stop", "Plain view", "Informant tip", "Controlled buy", "Don\u2019t know"],
    },
    {
      id: "ciInvolved",
      label: "Were confidential informants involved?",
      options: ["Yes", "I think so", "No", "Don\u2019t know"],
    },
  ],
};

// ============================================================
// STATIC OPTION LISTS
// ============================================================

/** US states + DC for jurisdiction selection. */
const usStates = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
  "Delaware","District of Columbia","Florida","Georgia","Hawaii","Idaho","Illinois",
  "Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts",
  "Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada",
  "New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota",
  "Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina",
  "South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington",
  "West Virginia","Wisconsin","Wyoming",
];

/** Service interest options — maps to the 5 tiers + "help me decide" fallback. */
const serviceInterests = [
  `${TIER_CORE["case-decoder"].name} (${TIER_CORE["case-decoder"].priceDisplay})`,
  `${TIER_CORE["intelligence-brief"].name} (${TIER_CORE["intelligence-brief"].priceDisplay})`,
  `${TIER_CORE["x-ray"].name} (${TIER_CORE["x-ray"].priceDisplay})`,
  `${TIER_CORE["war-room"].name} (${TIER_CORE["war-room"].priceDisplay})`,
  `${TIER_CORE["situation-room"].name} (${TIER_CORE["situation-room"].priceDisplay})`,
  "Not sure \u2014 help me decide",
];

/** How law enforcement got involved — helps determine applicable motions. */
const arrestCircumstances = [
  "Traffic stop",
  "Search warrant",
  "Confidential informant / undercover",
  "Sting operation",
  "Self-surrender / indictment",
  "Witness report",
  "Other",
];

/** Incident location — affects search/seizure analysis (home = higher 4A protection). */
const incidentLocations = [
  "Home / residence",
  "Vehicle",
  "Public place",
  "Someone else's property",
  "Workplace",
  "Other",
];

/** Co-defendant status — affects cooperation/snitch analysis in report. */
const coDefendantOptions = [
  "I was alone",
  "Co-defendant(s) charged",
  "Witnesses present but not charged",
  "I may have been misidentified / wrong target",
];

/** Attorney strategy communication — feeds into Defense Milestone Score. */
const strategyOptions = [
  "Yes \u2014 attorney explained clearly",
  "Mentioned something but unclear",
  "No \u2014 no strategy discussed",
  "I asked but got no real answer",
  "It hasn\u2019t come up",
];

/** When defendant last heard from attorney — key signal for report framing. */
const lastAttorneyContactOptions = [
  "This week",
  "1-2 weeks ago",
  "3-4 weeks ago",
  "1-3 months ago",
  "More than 3 months ago",
  "I\u2019ve never spoken with them",
];

/** How often attorney communicates — key metric for accountability scoring. */
const communicationFrequencyOptions = [
  "Weekly",
  "Biweekly",
  "Monthly",
  "Rarely",
  "Never returned calls",
];

/** Plea deal status — if "yes" or "discussing", conditionally shows plea terms textarea. */
const pleaOfferedOptions = [
  { value: "yes", label: "Yes \u2014 a specific offer has been made" },
  { value: "discussing", label: "We\u2019re discussing options" },
  { value: "not yet", label: "Not yet" },
  { value: "dont-know", label: "I don\u2019t know" },
];

/** Evidence types (multi-select) — determines which attorney frameworks apply. */
const evidenceTypeOptions = [
  "Confidential Informant (CI)",
  "Surveillance (video, audio, photos)",
  "Forensic evidence (lab testing, fingerprints)",
  "Body camera footage",
  "Confession / statement",
  "Witness identification / eyewitness",
  "DNA evidence",
  "Digital / phone evidence (texts, social media, GPS)",
  "I don\u2019t know",
];

/** Shared Tailwind classes for form inputs, selects, and labels. */
const inputClass = "mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-base text-white placeholder-zinc-400 focus:border-amber-500 focus:outline-none";
const selectClass = inputClass;
const labelClass = "block text-xs text-zinc-400";

/**
 * Returns the effective charge type for charge-specific question lookup.
 * Handles sex offense sub-routing and jurisdiction-based routing.
 */
function getEffectiveChargeType(chargeType: string, sexOffenseSubType: string): string {
  if (chargeType === "sex-offense" && sexOffenseSubType) {
    return sexOffenseSubType;
  }
  return chargeType;
}

/**
 * Returns the list of charge types based on jurisdiction level.
 */
function getChargeTypesForJurisdiction(jurisdictionLevel: string) {
  if (jurisdictionLevel === "federal") return federalChargeTypes;
  if (jurisdictionLevel === "state") return stateChargeTypes;
  return allChargeTypes;
}

/**
 * IntakeForm — multi-step wizard component.
 * Reads URL params for pre-fill (interest, email, tier) and manages
 * a 3-step form with progressive disclosure and per-step validation gates.
 */
function IntakeForm() {
  const searchParams = useSearchParams();
  const interest = searchParams.get("interest");
  const prefillEmail = searchParams.get("email") || "";
  const prefillTier = searchParams.get("tier") || "";

  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // All form data in one state object — simplifies submission (entire object POSTed as JSON)
  const [form, setForm] = useState<Record<string, string | string[]>>({
    firstName: "",
    lastName: "",
    email: prefillEmail,
    phone: "",
    jurisdictionLevel: "",
    chargeType: "",
    sexOffenseSubType: "",
    state: "",
    county: "",
    timeSinceArrest: "",
    incidentLocation: "",
    arrestCircumstances: [] as string[],
    hasAttorney: "",
    hasDiscovery: "",
    coDefendants: "",
    attorneyStrategy: "",
    caseNumber: "",
    courtDate: "",
    situation: "",
    specificQuestion: "",
    services: interest ? [`${TIER_CORE["situation-room"].name} (${TIER_CORE["situation-room"].priceDisplay})`] : prefillTier ? [({
      "case-decoder": `${TIER_CORE["case-decoder"].name} (${TIER_CORE["case-decoder"].priceDisplay})`,
      "intelligence-brief": `${TIER_CORE["intelligence-brief"].name} (${TIER_CORE["intelligence-brief"].priceDisplay})`,
      "x-ray": `${TIER_CORE["x-ray"].name} (${TIER_CORE["x-ray"].priceDisplay})`,
      "war-room": `${TIER_CORE["war-room"].name} (${TIER_CORE["war-room"].priceDisplay})`,
      "situation-room": `${TIER_CORE["situation-room"].name} (${TIER_CORE["situation-room"].priceDisplay})`,
    } as Record<string, string>)[prefillTier] || prefillTier] : ([] as string[]),
    pleaOffered: "",
    pleaTerms: "",
    communicationFrequency: "",
    lastAttorneyContact: "",
    arrestDate: "",
    evidenceType: [] as string[],
  });

  // Charge-specific answers stored separately to avoid polluting the flat form
  const [chargeSpecific, setChargeSpecific] = useState<Record<string, string>>({});

  function setField(name: string, value: string | string[]) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function setChargeField(id: string, value: string) {
    setChargeSpecific((prev) => ({ ...prev, [id]: value }));
  }

  // Determine effective charge type for questions
  const effectiveChargeType = getEffectiveChargeType(
    form.chargeType as string,
    form.sexOffenseSubType as string
  );

  // Get charge-specific questions for the current charge type
  const currentChargeQuestions = chargeSpecificQuestions[effectiveChargeType] || [];

  // Determine which charge type list to show
  const availableChargeTypes = getChargeTypesForJurisdiction(form.jurisdictionLevel as string);

  // Show sex offense sub-routing if sex-offense is selected (state/unknown jurisdiction)
  const showSexOffenseSubRouting =
    form.chargeType === "sex-offense" && form.jurisdictionLevel !== "federal";

  // Step validation gates — each step's "Continue" button is disabled until these are met
  const canProceedStep1 =
    form.firstName && form.email && form.chargeType && form.state && form.timeSinceArrest
    && form.caseNumber
    && (form.jurisdictionLevel !== "state" || form.county);
  const canProceedStep2 = form.hasAttorney;

  /** Submit all form data to /api/intake. API inserts into Supabase and notifies operator. */
  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          chargeSpecificData: chargeSpecific,
          jurisdictionLevel: form.jurisdictionLevel || "unknown",
          // If sex offense sub-type was selected, use that as the effective charge type
          chargeType: effectiveChargeType === "sex-offense-contact" || effectiveChargeType === "sex-offense-digital"
            ? effectiveChargeType
            : form.chargeType,
        }),
      });
      if (res.ok) {
        setSubmitted(true);
      } else {
        setError("Something went wrong submitting your case. Please try again.");
      }
    } catch {
      setError("Couldn\u2019t reach our servers. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    // Context-aware success message: paid tiers get specific delivery messaging
    const paidTierMessages: Record<string, string> = {
      "case-decoder": "Your Case Decoder report is being generated. You\u2019ll receive it via email within 48 hours.",
      "intelligence-brief": "Your Intelligence Brief is being prepared. You\u2019ll receive it via email within 48\u201372 hours.",
      "x-ray": "Your X-Ray analysis has been queued. Upload your discovery documents to begin \u2014 check your email for the upload link.",
      "war-room": "Your War Room engagement has begun. Upload your discovery documents to start \u2014 check your email for the upload link.",
      "situation-room": "Your Situation Room application has been received. We\u2019ll contact you within 24 hours.",
    };
    const tierMessage = prefillTier ? paidTierMessages[prefillTier] : null;

    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 text-3xl">
            &#10003;
          </div>
          <h1 className="text-2xl font-bold text-white">We got it.</h1>
          <p className="mt-3 text-zinc-400">
            {tierMessage || "We\u2019ll review your information and reach out if we need anything. Check your email for confirmation."}
          </p>
          <p className="mt-6 text-sm text-zinc-400">
            In the meantime, read our{" "}
            <Link href="/blog" className="text-amber-400 underline decoration-amber-400/50 hover:decoration-amber-400">
              blog
            </Link>{" "}
            &mdash; it&apos;s full of free information about your rights.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold text-white md:text-4xl">
          Tell us about your case
        </h1>
        <p className="mt-3 text-zinc-400">
          Everything you share is kept private. Communications are not protected
          by attorney-client privilege.
        </p>

        {/* PROGRESS BAR — 3-segment visual indicator of wizard progress */}
        <div className="mt-6 flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex-1">
              <div className={`h-1.5 rounded-full transition-colors ${
                s <= step ? "bg-amber-500" : "bg-zinc-800"
              }`} />
            </div>
          ))}
          <span className="ml-2 text-xs text-zinc-400">Step {step} of 3</span>
        </div>

        <div className="mt-10 space-y-8">
          {/* STEP 1 — Contact info, jurisdiction, charge details, charge-specific Qs */}
          {step === 1 && (
            <>
              <fieldset>
                <legend className="text-sm font-semibold text-zinc-300">
                  Contact &amp; Charges
                </legend>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor="firstName" className={labelClass}>First Name <span className="text-red-400">*</span></label>
                    <input id="firstName" type="text" required value={form.firstName as string}
                      onChange={(e) => setField("firstName", e.target.value)}
                      className={inputClass} placeholder="First name" />
                  </div>
                  <div>
                    <label htmlFor="lastName" className={labelClass}>Last Name</label>
                    <input id="lastName" type="text" value={form.lastName as string}
                      onChange={(e) => setField("lastName", e.target.value)}
                      className={inputClass} placeholder="Last name" />
                  </div>
                </div>
                <div className="mt-4">
                  <label htmlFor="email" className={labelClass}>Email <span className="text-red-400">*</span></label>
                  <input id="email" type="email" required value={form.email as string}
                    onChange={(e) => setField("email", e.target.value)}
                    className={inputClass} placeholder="you@email.com" />
                </div>
                <div className="mt-4">
                  <label htmlFor="phone" className={labelClass}>Phone (optional)</label>
                  <input id="phone" type="tel" value={form.phone as string}
                    onChange={(e) => setField("phone", e.target.value)}
                    className={inputClass} placeholder="(555) 555-5555" />
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-sm font-semibold text-zinc-300">Your Case</legend>

                {/* Jurisdiction level — determines which charge categories appear */}
                <div className="mt-4">
                  <label htmlFor="jurisdictionLevel" className={labelClass}>
                    Is your case in federal or state court? <span className="text-red-400">*</span>
                  </label>
                  <select id="jurisdictionLevel" value={form.jurisdictionLevel as string}
                    onChange={(e) => {
                      setField("jurisdictionLevel", e.target.value);
                      // Reset charge type when jurisdiction changes
                      setField("chargeType", "");
                      setField("sexOffenseSubType", "");
                      setChargeSpecific({});
                    }}
                    className={selectClass}>
                    <option value="">Select</option>
                    {jurisdictionOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                  {form.jurisdictionLevel === "unknown" && (
                    <p className="mt-2 text-xs text-zinc-500">
                      Federal cases are prosecuted by the U.S. Attorney&apos;s office.
                      If you were arrested by local or state police, your case is
                      likely in state court. If FBI, DEA, ATF, or other federal
                      agents were involved, it may be federal.
                    </p>
                  )}
                </div>

                {/* Charge type — filtered by jurisdiction */}
                {form.jurisdictionLevel && (
                  <div className="mt-4">
                    <label htmlFor="chargeType" className={labelClass}>Type of Charges <span className="text-red-400">*</span></label>
                    <select id="chargeType" required value={form.chargeType as string}
                      onChange={(e) => {
                        setField("chargeType", e.target.value);
                        setField("sexOffenseSubType", "");
                        setChargeSpecific({});
                      }}
                      className={selectClass}>
                      <option value="">Select charge type</option>
                      {availableChargeTypes.map((ct) => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
                    </select>
                  </div>
                )}

                {/* Sex offense sub-routing */}
                {showSexOffenseSubRouting && (
                  <div className="mt-4">
                    <label htmlFor="sexOffenseSubType" className={labelClass}>Which best describes the allegation?</label>
                    <select id="sexOffenseSubType" value={form.sexOffenseSubType as string}
                      onChange={(e) => {
                        setField("sexOffenseSubType", e.target.value);
                        setChargeSpecific({});
                      }}
                      className={selectClass}>
                      <option value="">Select</option>
                      {sexOffenseSubTypes.map((st) => <option key={st.value} value={st.value}>{st.label}</option>)}
                    </select>
                  </div>
                )}

                {/* Charge-specific questions — appear after charge type selection */}
                {currentChargeQuestions.length > 0 && (
                  <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                    <p className="mb-3 text-xs font-semibold text-amber-500">
                      A few questions specific to your charge type
                    </p>
                    <div className="space-y-4">
                      {currentChargeQuestions.map((q) => (
                        <div key={q.id}>
                          <label htmlFor={`cs-${q.id}`} className={labelClass}>{q.label}</label>
                          <select id={`cs-${q.id}`}
                            value={chargeSpecific[q.id] || ""}
                            onChange={(e) => setChargeField(q.id, e.target.value)}
                            className={selectClass}>
                            <option value="">Select</option>
                            {q.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <label htmlFor="state" className={labelClass}>State <span className="text-red-400">*</span></label>
                  <select id="state" required value={form.state as string}
                    onChange={(e) => setField("state", e.target.value)}
                    className={selectClass}>
                    <option value="">Select state</option>
                    {usStates.map((st) => <option key={st} value={st}>{st}</option>)}
                  </select>
                </div>
                <div className="mt-4">
                  <label htmlFor="county" className={labelClass}>
                    County {form.jurisdictionLevel === "state" ? <span className="text-red-400">*</span> : <span className="text-zinc-500">(helps us research your specific judge and local court patterns)</span>}
                  </label>
                  <input id="county" type="text" value={form.county as string}
                    onChange={(e) => setField("county", e.target.value)}
                    className={inputClass} placeholder="e.g. Pinellas, Harris, Los Angeles" />
                </div>
                <div className="mt-4">
                  <label htmlFor="caseNumber" className={labelClass}>
                    Court case number <span className="text-red-400">*</span>
                  </label>
                  <input id="caseNumber" type="text" required value={form.caseNumber as string}
                    onChange={(e) => setField("caseNumber", e.target.value)}
                    className={inputClass} placeholder="e.g. 23-01773-CF" />
                  <p className="mt-1 text-xs text-zinc-500">
                    Your case number is on any court document &mdash; arraignment papers, bond paperwork, or court notices.
                    It helps us look up your public docket and match your records if you upgrade later.
                  </p>
                </div>
                <div className="mt-4">
                  <label htmlFor="timeSinceArrest" className={labelClass}>
                    When were you arrested or charged? <span className="text-red-400">*</span>
                  </label>
                  <input id="timeSinceArrest" type="month" value={form.timeSinceArrest as string}
                    max={new Date().toISOString().slice(0, 7)}
                    onChange={(e) => setField("timeSinceArrest", e.target.value)}
                    className={inputClass} />
                </div>
                <div className="mt-4">
                  <label htmlFor="incidentLocation" className={labelClass}>
                    Where did the alleged incident take place?
                  </label>
                  <select id="incidentLocation" value={form.incidentLocation as string}
                    onChange={(e) => setField("incidentLocation", e.target.value)}
                    className={selectClass}>
                    <option value="">Select location</option>
                    {incidentLocations.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
                  </select>
                </div>
                <div className="mt-4">
                  <label className={labelClass}>How did law enforcement get involved?</label>
                  <div className="mt-2 space-y-2">
                    {arrestCircumstances.map((circ) => (
                      <label key={circ} className="flex items-center gap-3 text-sm text-zinc-400">
                        <input type="checkbox" checked={(form.arrestCircumstances as string[]).includes(circ)}
                          onChange={(e) => {
                            const curr = form.arrestCircumstances as string[];
                            setField("arrestCircumstances",
                              e.target.checked ? [...curr, circ] : curr.filter((c) => c !== circ));
                          }}
                          className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500" />
                        {circ}
                      </label>
                    ))}
                  </div>
                </div>
              </fieldset>

              <button type="button" onClick={() => setStep(2)}
                disabled={!canProceedStep1}
                className="w-full rounded-lg bg-amber-500 py-4 text-sm font-bold text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50">
                Continue to Step 2
              </button>
            </>
          )}

          {/* STEP 2 — Attorney status, case details, evidence, plea info.    */}
          {/* Gate: hasAttorney must be selected.                              */}
          {step === 2 && (
            <>
              <fieldset>
                <legend className="text-sm font-semibold text-zinc-300">
                  Your Situation
                </legend>
                <div className="mt-4">
                  <label htmlFor="hasAttorney" className={labelClass}>
                    Do you have an attorney? <span className="text-red-400">*</span>
                  </label>
                  <select id="hasAttorney" required value={form.hasAttorney as string}
                    onChange={(e) => setField("hasAttorney", e.target.value)}
                    className={selectClass}>
                    <option value="">Select</option>
                    <option value="yes">Yes &mdash; private attorney</option>
                    <option value="public">Public defender</option>
                    <option value="no">No attorney yet</option>
                  </select>
                </div>
                <div className="mt-4">
                  <label htmlFor="hasDiscovery" className={labelClass}>
                    Have you received discovery documents?
                  </label>
                  <select id="hasDiscovery" value={form.hasDiscovery as string}
                    onChange={(e) => setField("hasDiscovery", e.target.value)}
                    className={selectClass}>
                    <option value="">Select</option>
                    <option value="yes">Yes — I&apos;ve received discovery documents</option>
                    <option value="requested">Not yet — my attorney requested it</option>
                    <option value="no">Not yet — discovery hasn&apos;t been discussed</option>
                    <option value="dont-know">I don&apos;t know</option>
                  </select>
                </div>
                <div className="mt-4">
                  <label htmlFor="coDefendants" className={labelClass}>
                    Was anyone else present or charged?
                  </label>
                  <select id="coDefendants" value={form.coDefendants as string}
                    onChange={(e) => setField("coDefendants", e.target.value)}
                    className={selectClass}>
                    <option value="">Select</option>
                    {coDefendantOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div className="mt-4">
                  <label htmlFor="attorneyStrategy" className={labelClass}>
                    Has your attorney explained their defense strategy?
                  </label>
                  <select id="attorneyStrategy" value={form.attorneyStrategy as string}
                    onChange={(e) => setField("attorneyStrategy", e.target.value)}
                    className={selectClass}>
                    <option value="">Select</option>
                    {strategyOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div className="mt-4">
                  <label htmlFor="communicationFrequency" className={labelClass}>
                    How often does your attorney communicate with you?
                  </label>
                  <select id="communicationFrequency" value={form.communicationFrequency as string}
                    onChange={(e) => setField("communicationFrequency", e.target.value)}
                    className={selectClass}>
                    <option value="">Select</option>
                    {communicationFrequencyOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div className="mt-4">
                  <label htmlFor="lastAttorneyContact" className={labelClass}>
                    When did you last hear from your attorney?
                  </label>
                  <select id="lastAttorneyContact" value={form.lastAttorneyContact as string}
                    onChange={(e) => setField("lastAttorneyContact", e.target.value)}
                    className={selectClass}>
                    <option value="">Select</option>
                    {lastAttorneyContactOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div className="mt-4">
                  <label htmlFor="arrestDate" className={labelClass}>
                    Arrest date <span className="text-zinc-500">(for speedy trial calculation)</span>
                  </label>
                  <input id="arrestDate" type="date" value={form.arrestDate as string}
                    onChange={(e) => setField("arrestDate", e.target.value)}
                    max={new Date().toISOString().split("T")[0]}
                    className={inputClass} />
                </div>
                <div className="mt-4">
                  <label htmlFor="pleaOffered" className={labelClass}>
                    Has a plea deal been offered?
                  </label>
                  <select id="pleaOffered" value={form.pleaOffered as string}
                    onChange={(e) => setField("pleaOffered", e.target.value)}
                    className={selectClass}>
                    <option value="">Select</option>
                    {pleaOfferedOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
                {(form.pleaOffered === "yes" || form.pleaOffered === "discussing") && (
                  <div className="mt-4">
                    <label htmlFor="pleaTerms" className={labelClass}>
                      What are the terms of the plea offer?
                    </label>
                    <textarea id="pleaTerms" rows={3} value={form.pleaTerms as string}
                      onChange={(e) => setField("pleaTerms", e.target.value)}
                      className={inputClass}
                      placeholder="Describe the plea deal terms as you understand them" />
                  </div>
                )}
                <div className="mt-4">
                  <label className={labelClass}>What kind of evidence is involved? (select all that apply)</label>
                  <div className="mt-2 space-y-2">
                    {evidenceTypeOptions.map((ev) => (
                      <label key={ev} className="flex items-center gap-3 text-sm text-zinc-400">
                        <input type="checkbox" checked={(form.evidenceType as string[]).includes(ev)}
                          onChange={(e) => {
                            const curr = form.evidenceType as string[];
                            setField("evidenceType",
                              e.target.checked ? [...curr, ev] : curr.filter((c) => c !== ev));
                          }}
                          className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500" />
                        {ev}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="mt-4">
                  <label htmlFor="courtDate" className={labelClass}>
                    Next court date <span className="text-zinc-500">(optional)</span>
                  </label>
                  <input id="courtDate" type="date" value={form.courtDate as string}
                    onChange={(e) => setField("courtDate", e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    className={inputClass} />
                </div>
              </fieldset>

              {/* Service Interest */}
              <fieldset>
                <legend className="text-sm font-semibold text-zinc-300">
                  What are you interested in?
                </legend>
                <div className="mt-4 space-y-2">
                  {serviceInterests.map((svc) => (
                    <label key={svc} className="flex items-center gap-3 text-sm text-zinc-400">
                      <input type="checkbox" checked={(form.services as string[]).includes(svc)}
                        onChange={(e) => {
                          const curr = form.services as string[];
                          setField("services",
                            e.target.checked ? [...curr, svc] : curr.filter((s) => s !== svc));
                        }}
                        className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500" />
                      {svc}
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Situation */}
              <div>
                <label htmlFor="situation" className={labelClass}>
                  What&apos;s your biggest frustration right now? (optional)
                </label>
                <textarea id="situation" rows={4} value={form.situation as string}
                  onChange={(e) => setField("situation", e.target.value)}
                  className={inputClass}
                  placeholder="What's going on with your case? What's frustrating you?" />
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => setStep(1)}
                  className="flex-1 rounded-lg border border-zinc-700 py-4 text-sm font-semibold text-white transition-colors hover:border-zinc-500">
                  Back
                </button>
                <button type="button" onClick={() => setStep(3)}
                  disabled={!canProceedStep2}
                  className="flex-1 rounded-lg bg-amber-500 py-4 text-sm font-bold text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50">
                  Continue to Step 3
                </button>
              </div>
            </>
          )}

          {/* STEP 3 — Optional specific question + disclaimer + submit.      */}
          {step === 3 && (
            <>
              <fieldset>
                <legend className="text-sm font-semibold text-zinc-300">
                  One more thing (optional)
                </legend>
                <div className="mt-4">
                  <label htmlFor="specificQuestion" className={labelClass}>
                    One specific question you need answered
                  </label>
                  <textarea id="specificQuestion" rows={3}
                    maxLength={500}
                    value={form.specificQuestion as string}
                    onChange={(e) => setField("specificQuestion", e.target.value)}
                    className={inputClass}
                    placeholder="What's the one thing keeping you up at night about your case?" />
                  <p className="mt-1 text-xs text-zinc-500">
                    Optional. If provided, we&apos;ll address this first in your report.
                    <span className="ml-2 tabular-nums">{(form.specificQuestion as string).length}/500</span>
                  </p>
                </div>
              </fieldset>

              {/* Disclaimer */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                <p className="text-xs text-zinc-400">
                  By submitting this form, you understand that ImNotAnAttorney
                  provides legal information and research &mdash; not legal advice. We are
                  not a law firm and do not create an attorney-client relationship.
                  Your information is kept private. Communications are not protected by attorney-client privilege.
                </p>
              </div>

              {error && (
                <div role="alert" className="rounded-lg border border-red-500/50 bg-red-500/10 p-4">
                  <p className="text-sm font-medium text-red-400">{error}</p>
                  <button type="button" onClick={() => setError(null)}
                    className="mt-2 text-xs text-red-400/70 underline hover:text-red-300">
                    Dismiss
                  </button>
                </div>
              )}

              <div className="flex gap-3">
                <button type="button" onClick={() => setStep(2)}
                  className="flex-1 rounded-lg border border-zinc-700 py-4 text-sm font-semibold text-white transition-colors hover:border-zinc-500">
                  Back
                </button>
                <button type="button" onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 rounded-lg bg-amber-500 py-4 text-sm font-bold text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50">
                  {submitting ? "Submitting..." : "Submit \u2014 Get Your Case Reviewed"}
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-400">
                <span>Your information is private</span>
                <span>Response within 24 hours</span>
                <span>Deliverable guarantee</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Page export with Suspense boundary for useSearchParams. */
export default function IntakePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-zinc-400">Loading...</p>
      </div>
    }>
      <IntakeForm />
    </Suspense>
  );
}

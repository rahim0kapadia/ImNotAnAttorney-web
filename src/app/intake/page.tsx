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
 *     Required: First name, email, charge type, state, time since arrest
 *     Optional: Last name, phone, incident location, arrest circumstances (multi-select)
 *
 *   Step 2 — Your Situation:
 *     Required: Has attorney?
 *     Optional: Has discovery, co-defendants, attorney strategy, communication
 *     frequency, last attorney contact, arrest date (speedy trial), plea offered
 *     (conditionally shows plea terms textarea), evidence types (multi-select),
 *     case number, court date, service interest checkboxes, free-text situation
 *
 *   Step 3 — One More Thing:
 *     Optional: One specific question (max 300 chars, addressed first in report)
 *     Legal disclaimer + submit button
 *
 * Data flow:
 *   All form fields stored in a single `form` state object.
 *   On submit, entire form object POSTed to /api/intake as JSON.
 *   API inserts into Supabase `intakes` table and sends operator notification.
 *
 * Validation:
 *   Step 1 gate: firstName + email + chargeType + state + timeSinceArrest
 *   Step 2 gate: hasAttorney
 *   Step 3: No gate (all optional), submit always available
 *
 * Wrapped in Suspense for useSearchParams.
 */
"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

/** Charge type options — covers main criminal case categories we serve.
 * Values are slugs matching ALLOWED_CHARGE_TYPES in /api/intake.
 * Labels are human-readable for the dropdown display. */
const chargeTypes = [
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
  "Case Decoder ($197)",
  "Intelligence Brief ($797)",
  "The X-Ray ($1,497)",
  "The War Room ($3,497)",
  "The Situation Room ($9,997)",
  "Not sure — help me decide",
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

/** Attorney strategy communication — feeds into Attorney Accountability Score. */
const strategyOptions = [
  "Yes — attorney explained clearly",
  "Mentioned something but unclear",
  "No — no strategy discussed",
  "I asked but got no real answer",
  "It hasn't come up",
];

/** How often attorney communicates — key metric for accountability scoring. */
const communicationFrequencyOptions = [
  "Weekly",
  "Biweekly",
  "Monthly",
  "Rarely",
  "Never returned calls",
];

/** Plea deal status — if "yes", conditionally shows plea terms textarea. */
const pleaOfferedOptions = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "not yet", label: "Not yet" },
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
  "I don't know",
];

/** Shared Tailwind classes for form inputs, selects, and labels. */
const inputClass = "mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-base text-white placeholder-zinc-400 focus:border-amber-500 focus:outline-none";
const selectClass = inputClass;
const labelClass = "block text-xs text-zinc-400";

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
    chargeType: "",
    state: "",
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
    services: interest ? [`The Situation Room ($9,997)`] : prefillTier ? [({
      "case-decoder": "Case Decoder ($197)",
      "intelligence-brief": "Intelligence Brief ($797)",
      "x-ray": "The X-Ray ($1,497)",
      "war-room": "The War Room ($3,497)",
      "situation-room": "The Situation Room ($9,997)",
    } as Record<string, string>)[prefillTier] || prefillTier] : ([] as string[]),
    pleaOffered: "",
    pleaTerms: "",
    communicationFrequency: "",
    lastAttorneyContact: "",
    arrestDate: "",
    evidenceType: [] as string[],
  });

  function setField(name: string, value: string | string[]) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  // Step validation gates — each step's "Continue" button is disabled until these are met
  const canProceedStep1 =
    form.firstName && form.email && form.chargeType && form.state && form.timeSinceArrest;
  const canProceedStep2 = form.hasAttorney;

  /** Submit all form data to /api/intake. API inserts into Supabase and notifies operator. */
  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setSubmitted(true);
      } else {
        setError("Something went wrong submitting your case. Please try again.");
      }
    } catch {
      setError("Couldn't reach our servers. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 text-3xl">
            &#10003;
          </div>
          <h1 className="text-2xl font-bold text-white">We got it.</h1>
          <p className="mt-3 text-zinc-400">
            We&apos;ll review your information and reach out if we need
            anything. Check your email for confirmation.
          </p>
          <p className="mt-6 text-sm text-zinc-400">
            In the meantime, read our{" "}
            <a href="/blog" className="text-amber-400 underline decoration-amber-400/50 hover:decoration-amber-400">
              blog
            </a>{" "}
            — it&apos;s full of free information about your rights.
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
          {/* STEP 1 — Contact info and charge details.                       */}
          {/* Gate: firstName + email + chargeType + state + timeSinceArrest  */}
          {step === 1 && (
            <>
              <fieldset>
                <legend className="text-sm font-semibold text-zinc-300">
                  Contact &amp; Charges
                </legend>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor="firstName" className={labelClass}>First Name</label>
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
                  <label htmlFor="email" className={labelClass}>Email</label>
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
                <div className="mt-4">
                  <label htmlFor="chargeType" className={labelClass}>Type of Charges</label>
                  <select id="chargeType" required value={form.chargeType as string}
                    onChange={(e) => setField("chargeType", e.target.value)}
                    className={selectClass}>
                    <option value="">Select charge type</option>
                    {chargeTypes.map((ct) => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
                  </select>
                </div>
                <div className="mt-4">
                  <label htmlFor="state" className={labelClass}>State</label>
                  <select id="state" required value={form.state as string}
                    onChange={(e) => setField("state", e.target.value)}
                    className={selectClass}>
                    <option value="">Select state</option>
                    {usStates.map((st) => <option key={st} value={st}>{st}</option>)}
                  </select>
                </div>
                <div className="mt-4">
                  <label htmlFor="timeSinceArrest" className={labelClass}>
                    When were you arrested or charged?
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
          {/* Conditional: plea terms textarea appears only when plea = "yes". */}
          {/* Multi-selects: arrest circumstances, evidence types, services.   */}
          {step === 2 && (
            <>
              <fieldset>
                <legend className="text-sm font-semibold text-zinc-300">
                  Your Situation
                </legend>
                <div className="mt-4">
                  <label htmlFor="hasAttorney" className={labelClass}>
                    Do you have an attorney?
                  </label>
                  <select id="hasAttorney" required value={form.hasAttorney as string}
                    onChange={(e) => setField("hasAttorney", e.target.value)}
                    className={selectClass}>
                    <option value="">Select</option>
                    <option value="yes">Yes — private attorney</option>
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
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                    <option value="unsure">Not sure</option>
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
                  <input id="lastAttorneyContact" type="text" value={form.lastAttorneyContact as string}
                    onChange={(e) => setField("lastAttorneyContact", e.target.value)}
                    className={inputClass} placeholder="e.g. 2 weeks ago, last month, etc." />
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
                {form.pleaOffered === "yes" && (
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
                  <label htmlFor="caseNumber" className={labelClass}>
                    Case number <span className="text-zinc-500">(optional but recommended)</span>
                  </label>
                  <input id="caseNumber" type="text" value={form.caseNumber as string}
                    onChange={(e) => setField("caseNumber", e.target.value)}
                    className={inputClass} placeholder="e.g. 23-01234-CF" />
                  <p className="mt-1 text-xs text-zinc-500">
                    If provided, we pull your public docket record to verify charges, judge assignment, and hearing dates.
                  </p>
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
                  Tell us more about your situation (optional)
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
          {/* No validation gate — all fields optional. The specific question  */}
          {/* (max 300 chars) gets prioritized first in the delivered report.  */}
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
                    maxLength={300}
                    value={form.specificQuestion as string}
                    onChange={(e) => setField("specificQuestion", e.target.value)}
                    className={inputClass}
                    placeholder="What's the one thing keeping you up at night about your case?" />
                  <p className="mt-1 text-xs text-zinc-500">
                    Optional. If provided, we&apos;ll address this first in your report.
                    <span className="ml-2 tabular-nums">{(form.specificQuestion as string).length}/300</span>
                  </p>
                </div>
              </fieldset>

              {/* Disclaimer */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                <p className="text-xs text-zinc-400">
                  By submitting this form, you understand that ImNotAnAttorney
                  provides legal information and research — not legal advice. We are
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
                  {submitting ? "Submitting..." : "Submit — Get Your Case Reviewed"}
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

/**
 * Phase 2 Intake Form — Intelligence Brief (/intake/intelligence-brief)
 *
 * Collects additional case details needed for the Intelligence Brief tier
 * that go beyond the standard Case Decoder intake form.
 *
 * Accessed via email link after the included Case Decoder is delivered:
 *   /intake/intelligence-brief?case=<caseId>&token=<hmac>
 *
 * The HMAC token prevents unauthorized access — only the customer with the
 * email link can submit Phase 2 details for their specific case.
 *
 * Fields collected:
 *   Required: judge name, attorney name
 *   Optional: case number (if not already provided), next court date,
 *   hearing type, attorney communications, concerns, employment,
 *   dependents, immigration status, prior convictions, co-defendants
 */
"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const inputClass =
  "mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-base text-white placeholder-zinc-400 focus:border-amber-500 focus:outline-none";
const selectClass = inputClass;
const labelClass = "block text-xs text-zinc-400";

const hearingTypes = [
  "Arraignment",
  "Pre-trial conference",
  "Motion hearing",
  "Plea hearing",
  "Suppression hearing",
  "Trial",
  "Sentencing",
  "Probation violation",
  "Status check",
  "Other",
  "Don\u2019t know",
];

const communicationRatings = [
  "Excellent \u2014 always responsive",
  "Good \u2014 responds within a day or two",
  "Fair \u2014 I usually have to follow up",
  "Poor \u2014 rarely returns calls or emails",
  "Non-existent \u2014 I can\u2019t reach them",
  "N/A \u2014 no attorney yet",
];

function Phase2IntakeForm() {
  const searchParams = useSearchParams();
  const caseId = searchParams.get("case") || "";
  const token = searchParams.get("token") || "";

  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState<Record<string, string>>({
    judgeName: "",
    county: "",
    caseNumber: "",
    attorneyName: "",
    attorneyFirm: "",
    nextCourtDate: "",
    hearingType: "",
    attorneyCommunication: "",
    whatAttorneyTold: "",
    biggestConcern: "",
    employment: "",
    dependents: "",
    immigrationStatus: "",
    priorConvictions: "",
    onProbationParole: "",
    coDefendantDetails: "",
  });

  function setField(name: string, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  const canSubmit = form.judgeName && form.county && form.attorneyName;

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/intake/intelligence-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, token, ...form }),
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        const data = await res.json();
        setError(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setError("Couldn\u2019t reach our servers. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!caseId || !token) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Invalid Link</h1>
          <p className="mt-3 text-zinc-400">
            This page requires a valid link from your delivery email. Check
            your inbox for the email titled &ldquo;Part 1 of your package is
            ready&rdquo; and click the link inside.
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 text-3xl">
            &#10003;
          </div>
          <h1 className="text-2xl font-bold text-white">
            Phase 2 details received.
          </h1>
          <p className="mt-3 text-zinc-400">
            Your Intelligence Brief is now being prepared with these additional
            details. You&apos;ll receive it via email within 72 hours.
          </p>
          <p className="mt-6 text-sm text-zinc-400">
            While you wait, review the Case Decoder report we sent to your
            email and start preparing the questions it identified.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-16">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm text-amber-400">
            <strong>Phase 2 of 2:</strong> Your Case Decoder report has been
            delivered. These additional details allow us to build your full
            Intelligence Brief with jurisdiction intelligence, legal options analysis, and
            a personalized action plan.
          </p>
        </div>

        <h1 className="text-3xl font-bold text-white md:text-4xl">
          Intelligence Brief Details
        </h1>
        <p className="mt-3 text-zinc-400">
          Tell us about your judge, your attorney, and what&apos;s happening in
          your case. This takes about 5 minutes.
        </p>

        <div className="mt-10 space-y-8">
          {/* JUDGE & COURT */}
          <fieldset>
            <legend className="text-sm font-semibold text-zinc-300">
              Judge &amp; Court
            </legend>
            <div className="mt-4">
              <label htmlFor="judgeName" className={labelClass}>
                Judge name <span className="text-red-400">*</span>
              </label>
              <input
                id="judgeName"
                type="text"
                required
                value={form.judgeName}
                onChange={(e) => setField("judgeName", e.target.value)}
                className={inputClass}
                placeholder="e.g. Judge Patricia Smith"
              />
              <p className="mt-1 text-xs text-zinc-400">
                We research your jurisdiction&apos;s sentencing patterns and local trends.
              </p>
            </div>
            <div className="mt-4">
              <label htmlFor="county" className={labelClass}>
                County <span className="text-red-400">*</span>
              </label>
              <input
                id="county"
                type="text"
                required
                value={form.county}
                onChange={(e) => setField("county", e.target.value)}
                className={inputClass}
                placeholder="e.g. Pinellas County"
              />
              <p className="mt-1 text-xs text-zinc-400">
                County where your case is being heard. Used for jurisdiction intelligence.
              </p>
            </div>
            <div className="mt-4">
              <label htmlFor="caseNumber" className={labelClass}>
                Court case number{" "}
                <span className="text-zinc-400">
                  (if different from your initial intake)
                </span>
              </label>
              <input
                id="caseNumber"
                type="text"
                value={form.caseNumber}
                onChange={(e) => setField("caseNumber", e.target.value)}
                className={inputClass}
                placeholder="e.g. 24-00123-CF"
              />
            </div>
            <div className="mt-4">
              <label htmlFor="nextCourtDate" className={labelClass}>
                Next court date
              </label>
              <input
                id="nextCourtDate"
                type="date"
                value={form.nextCourtDate}
                onChange={(e) => setField("nextCourtDate", e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className={inputClass}
              />
            </div>
            <div className="mt-4">
              <label htmlFor="hearingType" className={labelClass}>
                Type of hearing
              </label>
              <select
                id="hearingType"
                value={form.hearingType}
                onChange={(e) => setField("hearingType", e.target.value)}
                className={selectClass}
              >
                <option value="">Select</option>
                {hearingTypes.map((ht) => (
                  <option key={ht} value={ht}>
                    {ht}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>

          {/* ATTORNEY */}
          <fieldset>
            <legend className="text-sm font-semibold text-zinc-300">
              Your Attorney
            </legend>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="attorneyName" className={labelClass}>
                  Attorney name <span className="text-red-400">*</span>
                </label>
                <input
                  id="attorneyName"
                  type="text"
                  required
                  value={form.attorneyName}
                  onChange={(e) => setField("attorneyName", e.target.value)}
                  className={inputClass}
                  placeholder="Full name"
                />
              </div>
              <div>
                <label htmlFor="attorneyFirm" className={labelClass}>
                  Law firm
                </label>
                <input
                  id="attorneyFirm"
                  type="text"
                  value={form.attorneyFirm}
                  onChange={(e) => setField("attorneyFirm", e.target.value)}
                  className={inputClass}
                  placeholder="Firm name (optional)"
                />
              </div>
            </div>
            <div className="mt-4">
              <label htmlFor="attorneyCommunication" className={labelClass}>
                How would you rate communication with your attorney?
              </label>
              <select
                id="attorneyCommunication"
                value={form.attorneyCommunication}
                onChange={(e) =>
                  setField("attorneyCommunication", e.target.value)
                }
                className={selectClass}
              >
                <option value="">Select</option>
                {communicationRatings.map((cr) => (
                  <option key={cr} value={cr}>
                    {cr}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-4">
              <label htmlFor="whatAttorneyTold" className={labelClass}>
                What has your attorney told you about your case so far?
              </label>
              <textarea
                id="whatAttorneyTold"
                rows={3}
                value={form.whatAttorneyTold}
                onChange={(e) => setField("whatAttorneyTold", e.target.value)}
                className={inputClass}
                placeholder="What strategy have they discussed? What's their assessment?"
              />
            </div>
          </fieldset>

          {/* CONCERNS */}
          <fieldset>
            <legend className="text-sm font-semibold text-zinc-300">
              Your Concerns
            </legend>
            <div className="mt-4">
              <label htmlFor="biggestConcern" className={labelClass}>
                What&apos;s your biggest concern right now?
              </label>
              <textarea
                id="biggestConcern"
                rows={3}
                value={form.biggestConcern}
                onChange={(e) => setField("biggestConcern", e.target.value)}
                className={inputClass}
                placeholder="What keeps you up at night about this case?"
              />
            </div>
          </fieldset>

          {/* PERSONAL CONTEXT */}
          <fieldset>
            <legend className="text-sm font-semibold text-zinc-300">
              Personal Context{" "}
              <span className="font-normal text-zinc-400">
                (helps us tailor mitigation strategies)
              </span>
            </legend>
            <div className="mt-4">
              <label htmlFor="employment" className={labelClass}>
                Employment status
              </label>
              <input
                id="employment"
                type="text"
                value={form.employment}
                onChange={(e) => setField("employment", e.target.value)}
                className={inputClass}
                placeholder="e.g. Full-time employed, self-employed, unemployed"
              />
            </div>
            <div className="mt-4">
              <label htmlFor="dependents" className={labelClass}>
                Dependents
              </label>
              <input
                id="dependents"
                type="text"
                value={form.dependents}
                onChange={(e) => setField("dependents", e.target.value)}
                className={inputClass}
                placeholder="e.g. 2 children (ages 5, 8), elderly parent"
              />
            </div>
            <div className="mt-4">
              <label htmlFor="immigrationStatus" className={labelClass}>
                Immigration considerations
              </label>
              <select
                id="immigrationStatus"
                value={form.immigrationStatus}
                onChange={(e) => setField("immigrationStatus", e.target.value)}
                className={selectClass}
              >
                <option value="">Select</option>
                <option value="citizen">US Citizen</option>
                <option value="permanent-resident">
                  Permanent Resident (Green Card)
                </option>
                <option value="visa-holder">Visa Holder</option>
                <option value="undocumented">Undocumented</option>
                <option value="prefer-not-to-say">Prefer not to say</option>
              </select>
              <p className="mt-1 text-xs text-zinc-400">
                Certain convictions have immigration consequences. This helps
                us flag them in your brief.
              </p>
            </div>
            <div className="mt-4">
              <label htmlFor="priorConvictions" className={labelClass}>
                Prior convictions (if any)
              </label>
              <textarea
                id="priorConvictions"
                rows={2}
                value={form.priorConvictions}
                onChange={(e) => setField("priorConvictions", e.target.value)}
                className={inputClass}
                placeholder="Type, year, and outcome (e.g. 'DUI 2019, probation completed')"
              />
            </div>
            <div className="mt-4">
              <label htmlFor="onProbationParole" className={labelClass}>
                Currently on probation or parole?
              </label>
              <select
                id="onProbationParole"
                value={form.onProbationParole}
                onChange={(e) =>
                  setField("onProbationParole", e.target.value)
                }
                className={selectClass}
              >
                <option value="">Select</option>
                <option value="no">No</option>
                <option value="probation">Yes — Probation</option>
                <option value="parole">Yes — Parole</option>
                <option value="both">Yes — Both</option>
                <option value="unsure">Not sure</option>
              </select>
              <p className="mt-1 text-xs text-zinc-400">
                Active supervision affects potential consequences and defense
                strategy.
              </p>
            </div>
            <div className="mt-4">
              <label htmlFor="coDefendantDetails" className={labelClass}>
                Co-defendant details (if applicable)
              </label>
              <textarea
                id="coDefendantDetails"
                rows={2}
                value={form.coDefendantDetails}
                onChange={(e) =>
                  setField("coDefendantDetails", e.target.value)
                }
                className={inputClass}
                placeholder="Names, relationship, their attorney, cooperation status"
              />
            </div>
          </fieldset>

          {/* Disclaimer */}
          <div className="rounded-lg border border-zinc-500 bg-zinc-900/50 p-4">
            <p className="text-xs text-zinc-400">
              This information is used solely to generate your Intelligence
              Brief. ImNotAnAttorney provides legal information and research
              &mdash; not legal advice. We are not a law firm and do not create
              an attorney-client relationship.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-500/50 bg-red-500/10 p-4"
            >
              <p className="text-sm font-medium text-red-400">{error}</p>
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="w-full rounded-lg bg-amber-500 py-4 text-sm font-bold text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <svg
                  className="h-4 w-4 animate-spin"
                  aria-hidden="true"
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
                Submitting...
              </span>
            ) : (
              "Submit Intelligence Brief Details"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Phase2IntakePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center" role="status">
          <div className="text-zinc-400">Loading...</div>
        </div>
      }
    >
      <Phase2IntakeForm />
    </Suspense>
  );
}

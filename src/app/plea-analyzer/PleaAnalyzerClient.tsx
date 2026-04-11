"use client";

/**
 * Free Plea Deal Analyzer — client component.
 *
 * Multi-step intake form that collects plea offer details and submits to
 * /api/plea-analyzer for free Claude-generated analysis. Email capture is
 * built into the flow (required for report delivery).
 *
 * Accessibility:
 *   - All inputs have associated <label> elements
 *   - Required fields marked with aria-required + visible asterisk
 *   - Error summary announced via aria-live region
 *   - Focus moves to error summary on validation failure
 *   - Success state announced via role="status"
 *   - Textarea uses aria-describedby for help text
 *   - All interactive hit areas >= 44px
 */

import { useState, useRef, useCallback } from "react";

const US_STATES = [
  { value: "AL", label: "Alabama" }, { value: "AK", label: "Alaska" },
  { value: "AZ", label: "Arizona" }, { value: "AR", label: "Arkansas" },
  { value: "CA", label: "California" }, { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" }, { value: "DE", label: "Delaware" },
  { value: "DC", label: "District of Columbia" }, { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" }, { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" }, { value: "IL", label: "Illinois" },
  { value: "IN", label: "Indiana" }, { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" }, { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" }, { value: "ME", label: "Maine" },
  { value: "MD", label: "Maryland" }, { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" }, { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" }, { value: "MO", label: "Missouri" },
  { value: "MT", label: "Montana" }, { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" }, { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" }, { value: "NM", label: "New Mexico" },
  { value: "NY", label: "New York" }, { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" }, { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" }, { value: "OR", label: "Oregon" },
  { value: "PA", label: "Pennsylvania" }, { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" }, { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" }, { value: "TX", label: "Texas" },
  { value: "UT", label: "Utah" }, { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" }, { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" }, { value: "WI", label: "Wisconsin" },
  { value: "WY", label: "Wyoming" },
];

const CHARGE_TYPES = [
  { value: "drug-possession", label: "Drug Possession" },
  { value: "drug-trafficking", label: "Drug Trafficking" },
  { value: "dui", label: "DUI / DWI" },
  { value: "dui-first", label: "DUI — First Offense" },
  { value: "dui-repeat", label: "DUI — Repeat Offense" },
  { value: "assault", label: "Assault" },
  { value: "domestic-violence", label: "Domestic Violence" },
  { value: "theft", label: "Theft / Larceny" },
  { value: "white-collar", label: "White Collar / Financial Crime" },
  { value: "sex-offense", label: "Sex Offense" },
  { value: "sex-offense-contact", label: "Sex Offense — Contact" },
  { value: "sex-offense-digital", label: "Sex Offense — Digital / Possession" },
  { value: "weapons", label: "Weapons Charge" },
  { value: "federal", label: "Federal Charge" },
  { value: "probation-violation", label: "Probation Violation" },
  { value: "self-defense", label: "Self-Defense Claim" },
  { value: "other", label: "Other" },
];

type FormState = "form" | "submitting" | "success" | "error";

export default function PleaAnalyzerClient() {
  const [formState, setFormState] = useState<FormState>("form");
  const [errorMsg, setErrorMsg] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);

  const [email, setEmail] = useState("");
  const [state, setState] = useState("");
  const [chargeType, setChargeType] = useState("");
  const [originalCharges, setOriginalCharges] = useState("");
  const [offeredCharges, setOfferedCharges] = useState("");
  const [pleaOfferDetails, setPleaOfferDetails] = useState("");
  const [sentencingExposure, setSentencingExposure] = useState("");

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setFormState("submitting");

    try {
      const res = await fetch("/api/plea-analyzer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          state,
          chargeType,
          originalCharges,
          offeredCharges,
          pleaOfferDetails,
          sentencingExposure,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Something went wrong" }));
        setErrorMsg(data.error || "Something went wrong. Please try again.");
        setFormState("error");
        setTimeout(() => errorRef.current?.focus(), 50);
        return;
      }

      setFormState("success");
      setTimeout(() => successRef.current?.focus(), 50);
    } catch {
      setErrorMsg("Network error. Check your connection and try again.");
      setFormState("error");
      setTimeout(() => errorRef.current?.focus(), 50);
    }
  }, [email, state, chargeType, originalCharges, offeredCharges, pleaOfferDetails, sentencingExposure]);

  // Success state
  if (formState === "success") {
    return (
      <div
        ref={successRef}
        tabIndex={-1}
        role="status"
        className="bg-green-950/30 border border-green-800 rounded-lg p-8 text-center"
      >
        <h2 className="text-2xl font-bold text-green-400 mb-4">
          Your plea analysis is being generated
        </h2>
        <p className="text-zinc-300 mb-6 max-w-md mx-auto">
          Check your email within 60 seconds. The analysis will include a
          detailed breakdown of your plea offer, leverage points, hidden
          consequences, and questions to bring to your attorney.
        </p>
        <p className="text-zinc-400 text-sm mb-8">
          Did not receive it? Check your spam folder. The email comes from
          reports@imnotanattorney.com.
        </p>
        <div className="border-t border-zinc-800 pt-8">
          <p className="text-zinc-400 text-sm mb-3">
            Want the full picture beyond the plea?
          </p>
          <a
            href="/checkout?tier=case-decoder"
            className="inline-block bg-amber-500 hover:bg-amber-400 text-black font-semibold py-3 px-8 rounded-lg transition-colors"
          >
            Get Your Case Decoder — $197
          </a>
          <p className="text-zinc-500 text-xs mt-3">
            15 defense-specific questions + full case landscape analysis.
            Delivered in 48 hours.
          </p>
        </div>
      </div>
    );
  }

  const inputBase =
    "w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors min-h-[44px]";
  const labelBase = "block text-sm font-medium text-zinc-300 mb-1.5";

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Free Plea Deal Analyzer"
      className="space-y-6"
    >
      {/* Error summary */}
      {formState === "error" && errorMsg && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="bg-red-950/40 border border-red-800 rounded-lg p-4 text-red-300 text-sm"
        >
          {errorMsg}
        </div>
      )}

      {/* Email */}
      <div>
        <label htmlFor="pa-email" className={labelBase}>
          Email address <span className="text-red-400">*</span>
        </label>
        <p id="pa-email-help" className="text-xs text-zinc-500 mb-1.5">
          Your analysis will be delivered to this email.
        </p>
        <input
          id="pa-email"
          type="email"
          required
          aria-required="true"
          aria-describedby="pa-email-help"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          className={inputBase}
        />
      </div>

      {/* State */}
      <div>
        <label htmlFor="pa-state" className={labelBase}>
          State <span className="text-red-400">*</span>
        </label>
        <select
          id="pa-state"
          required
          aria-required="true"
          value={state}
          onChange={(e) => setState(e.target.value)}
          className={inputBase}
        >
          <option value="">Select your state</option>
          {US_STATES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Charge type */}
      <div>
        <label htmlFor="pa-charge" className={labelBase}>
          Charge type <span className="text-red-400">*</span>
        </label>
        <select
          id="pa-charge"
          required
          aria-required="true"
          value={chargeType}
          onChange={(e) => setChargeType(e.target.value)}
          className={inputBase}
        >
          <option value="">Select charge type</option>
          {CHARGE_TYPES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Original charges */}
      <div>
        <label htmlFor="pa-original" className={labelBase}>
          Original charges <span className="text-red-400">*</span>
        </label>
        <p id="pa-original-help" className="text-xs text-zinc-500 mb-1.5">
          What were you originally charged with? Include charge names and
          severity (felony/misdemeanor) if you know them.
        </p>
        <textarea
          id="pa-original"
          required
          aria-required="true"
          aria-describedby="pa-original-help"
          value={originalCharges}
          onChange={(e) => setOriginalCharges(e.target.value)}
          placeholder="e.g., Possession of a Controlled Substance (Felony 3)"
          rows={2}
          maxLength={400}
          className={inputBase + " resize-y"}
        />
      </div>

      {/* Offered charges (plea) */}
      <div>
        <label htmlFor="pa-offered" className={labelBase}>
          Offered charges (what the plea reduces to) <span className="text-red-400">*</span>
        </label>
        <p id="pa-offered-help" className="text-xs text-zinc-500 mb-1.5">
          What charge(s) is the plea deal offering to reduce to?
        </p>
        <textarea
          id="pa-offered"
          required
          aria-required="true"
          aria-describedby="pa-offered-help"
          value={offeredCharges}
          onChange={(e) => setOfferedCharges(e.target.value)}
          placeholder="e.g., Misdemeanor Possession, 12 months probation"
          rows={2}
          maxLength={400}
          className={inputBase + " resize-y"}
        />
      </div>

      {/* Plea offer details */}
      <div>
        <label htmlFor="pa-details" className={labelBase}>
          Full plea offer details <span className="text-red-400">*</span>
        </label>
        <p id="pa-details-help" className="text-xs text-zinc-500 mb-1.5">
          Include everything you know: sentence terms, probation conditions,
          fines, restitution, drug testing, community service, classes,
          deadlines. The more detail, the better the analysis.
        </p>
        <textarea
          id="pa-details"
          required
          aria-required="true"
          aria-describedby="pa-details-help"
          value={pleaOfferDetails}
          onChange={(e) => setPleaOfferDetails(e.target.value)}
          placeholder="e.g., 18 months probation, $2,500 fine, drug testing, 100 hours community service, no contact order..."
          rows={4}
          maxLength={800}
          className={inputBase + " resize-y"}
        />
        <p className="text-xs text-zinc-600 mt-1 text-right" aria-live="polite" aria-atomic="true">
          {pleaOfferDetails.length}/800
        </p>
      </div>

      {/* Sentencing exposure (optional) */}
      <div>
        <label htmlFor="pa-sentencing" className={labelBase}>
          Sentencing exposure if convicted at trial
          <span className="text-zinc-500 font-normal ml-1">(optional)</span>
        </label>
        <p id="pa-sentencing-help" className="text-xs text-zinc-500 mb-1.5">
          If you know the maximum sentence you face at trial, include it. This
          helps frame the risk comparison.
        </p>
        <textarea
          id="pa-sentencing"
          aria-describedby="pa-sentencing-help"
          value={sentencingExposure}
          onChange={(e) => setSentencingExposure(e.target.value)}
          placeholder="e.g., Up to 5 years state prison, $10,000 fine"
          rows={2}
          maxLength={400}
          className={inputBase + " resize-y"}
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={formState === "submitting"}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white py-4 rounded-lg font-semibold text-lg transition-colors min-h-[52px]"
      >
        {formState === "submitting"
          ? "Generating your analysis..."
          : "Get Your Free Plea Analysis"}
      </button>

      <p className="text-xs text-zinc-500 text-center">
        No credit card. No account. Your analysis is delivered by email within
        60 seconds.
      </p>
    </form>
  );
}

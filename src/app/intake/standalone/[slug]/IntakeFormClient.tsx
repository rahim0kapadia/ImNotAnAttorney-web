"use client";

/**
 * Intake form client component for standalone research products.
 *
 * Renders product-specific form fields, validates inputs, and submits
 * to POST /api/intake/standalone/[slug] with the intake token.
 *
 * Accessibility:
 *   - All inputs have associated <label> elements
 *   - Required fields marked with aria-required
 *   - Error summary announced via aria-live region
 *   - Focus moves to error summary on validation failure
 *   - Success state announced to screen readers
 *   - Fieldset/legend groups related boolean fields
 */

import { useState, useRef } from "react";
import { ALLOWED_CHARGE_TYPES } from "@/lib/charge-types";

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

const EMPLOYER_TYPES = [
  { value: "government-federal", label: "Federal Government" },
  { value: "government-state", label: "State Government" },
  { value: "government-local", label: "Local Government" },
  { value: "private-regulated", label: "Private — Regulated Industry" },
  { value: "private-unregulated", label: "Private — Unregulated Industry" },
  { value: "self-employed", label: "Self-Employed" },
  { value: "unemployed", label: "Unemployed" },
];

const CHARGE_TYPE_LABELS: Record<string, string> = {
  "drug-possession": "Drug Possession",
  "drug-trafficking": "Drug Trafficking",
  dui: "DUI / DWI",
  "dui-first": "DUI — First Offense",
  "dui-repeat": "DUI — Repeat Offense",
  assault: "Assault",
  "domestic-violence": "Domestic Violence",
  theft: "Theft / Larceny",
  "sex-offense": "Sex Offense",
  "sex-offense-contact": "Sex Offense — Contact",
  "sex-offense-digital": "Sex Offense — Digital",
  weapons: "Weapons Charge",
  "white-collar": "White Collar / Financial Crime",
  federal: "Federal Charge",
  "probation-violation": "Probation Violation",
  "self-defense": "Self-Defense Claim",
  other: "Other",
};

// Current charge types (exclude legacy values from the select)
const CURRENT_CHARGE_TYPES = ALLOWED_CHARGE_TYPES.filter(
  (ct) => !["drug", "other-felony", "other-misdemeanor", "robbery", "burglary", "fraud"].includes(ct)
);

interface Props {
  slug: string;
  productName: string;
  token: string;
}

type FormStatus = "idle" | "submitting" | "success" | "error";

export default function IntakeFormClient({ slug, productName, token }: Props) {
  const [state, setState] = useState("");
  const [chargeType, setChargeType] = useState("");
  const [occupation, setOccupation] = useState("");
  const [employerType, setEmployerType] = useState("");
  const [industryRegulated, setIndustryRegulated] = useState(false);
  const [hasClearance, setHasClearance] = useState(false);

  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const errorRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMessage("");

    try {
      const res = await fetch(`/api/intake/standalone/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          state,
          chargeType,
          occupation,
          employerType,
          industryRegulated,
          hasClearance,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMessage(data.error || "Something went wrong. Please try again.");
        // Move focus to error message for screen readers
        setTimeout(() => errorRef.current?.focus(), 100);
        return;
      }

      setStatus("success");
    } catch {
      setStatus("error");
      setErrorMessage("Network error. Please check your connection and try again.");
      setTimeout(() => errorRef.current?.focus(), 100);
    }
  }

  if (status === "success") {
    return (
      <div
        className="bg-green-950/30 border border-green-800 rounded-lg p-8 text-center"
        role="status"
        aria-live="polite"
      >
        <h2 className="text-xl font-bold text-green-400 mb-3">
          Your {productName} is being generated
        </h2>
        <p className="text-zinc-300">
          You&apos;ll receive an email within 60 seconds with a link to view
          your report.
        </p>
      </div>
    );
  }

  const selectClass =
    "w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
  const labelClass = "block text-sm font-medium text-zinc-300 mb-1.5";

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* Error summary — announced to screen readers */}
      {status === "error" && errorMessage && (
        <div
          ref={errorRef}
          className="mb-6 bg-red-950/30 border border-red-800 rounded-lg p-4"
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
        >
          <p className="text-red-400 font-medium">{errorMessage}</p>
        </div>
      )}

      <div className="space-y-6">
        {/* State */}
        <div>
          <label htmlFor="intake-state" className={labelClass}>
            State where your case is pending <span className="text-red-400" aria-hidden="true">*</span>
          </label>
          <select
            id="intake-state"
            value={state}
            onChange={(e) => setState(e.target.value)}
            required
            aria-required="true"
            className={selectClass}
          >
            <option value="">Select state</option>
            {US_STATES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Charge Type */}
        <div>
          <label htmlFor="intake-charge" className={labelClass}>
            Charge type <span className="text-red-400" aria-hidden="true">*</span>
          </label>
          <select
            id="intake-charge"
            value={chargeType}
            onChange={(e) => setChargeType(e.target.value)}
            required
            aria-required="true"
            className={selectClass}
          >
            <option value="">Select charge type</option>
            {CURRENT_CHARGE_TYPES.map((ct) => (
              <option key={ct} value={ct}>
                {CHARGE_TYPE_LABELS[ct] || ct}
              </option>
            ))}
          </select>
        </div>

        {/* Occupation */}
        <div>
          <label htmlFor="intake-occupation" className={labelClass}>
            Current job title / occupation <span className="text-red-400" aria-hidden="true">*</span>
          </label>
          <input
            id="intake-occupation"
            type="text"
            value={occupation}
            onChange={(e) => setOccupation(e.target.value)}
            required
            aria-required="true"
            maxLength={200}
            placeholder="e.g., Registered Nurse, CDL Truck Driver, Software Engineer"
            className={selectClass}
          />
        </div>

        {/* Employer Type */}
        <div>
          <label htmlFor="intake-employer" className={labelClass}>
            Employer type <span className="text-red-400" aria-hidden="true">*</span>
          </label>
          <select
            id="intake-employer"
            value={employerType}
            onChange={(e) => setEmployerType(e.target.value)}
            required
            aria-required="true"
            className={selectClass}
          >
            <option value="">Select employer type</option>
            {EMPLOYER_TYPES.map((et) => (
              <option key={et.value} value={et.value}>
                {et.label}
              </option>
            ))}
          </select>
        </div>

        {/* Boolean fields grouped in a fieldset */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-medium text-zinc-300 mb-2">
            Additional details
          </legend>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={industryRegulated}
              onChange={(e) => setIndustryRegulated(e.target.checked)}
              className="h-5 w-5 rounded border-zinc-600 bg-zinc-900 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
            />
            <span className="text-zinc-300">
              My industry is regulated (healthcare, finance, education,
              transportation, law enforcement)
            </span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={hasClearance}
              onChange={(e) => setHasClearance(e.target.checked)}
              className="h-5 w-5 rounded border-zinc-600 bg-zinc-900 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
            />
            <span className="text-zinc-300">
              I hold a security clearance
            </span>
          </label>
        </fieldset>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={status === "submitting" || !state || !chargeType || !occupation || !employerType}
        className="mt-8 w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white py-4 rounded-lg font-semibold text-lg transition-colors"
        aria-busy={status === "submitting"}
      >
        {status === "submitting" ? "Generating your report..." : "Generate My Report"}
      </button>

      {/* UPL disclaimer */}
      <p className="mt-4 text-xs text-zinc-500">
        This report provides legal INFORMATION — not legal ADVICE. Your
        attorney remains the final authority on strategy decisions.
      </p>
    </form>
  );
}

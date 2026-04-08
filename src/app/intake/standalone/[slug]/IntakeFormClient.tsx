"use client";

/**
 * Intake form client component for standalone research products.
 *
 * Renders product-specific form fields based on a per-slug FIELD_SETS
 * configuration. Each entry in FIELD_SETS describes the typed inputs the
 * server-side intake API (`/api/intake/standalone/[slug]/route.ts`) and
 * the Edge Function (`generate-standalone/index.ts`) expect for that
 * product. To add a new product:
 *   1. Add an entry to STANDALONE_PRODUCTS in src/lib/products.ts.
 *   2. Add a FIELD_SETS entry here.
 *   3. Extend the route validator allowlists if you introduce new enum
 *      fields, optional fields, or long-form text fields.
 *   4. Add a switch case in the Edge Function buildUserPrompt().
 *
 * Accessibility (audited by accessibility-lead, 2026-04-07):
 *   - All inputs have associated <label> elements
 *   - Required fields marked with aria-required + visible asterisk
 *   - Error summary announced via aria-live region
 *   - Focus moves to error summary on validation failure
 *   - Success state announced to screen readers via role="status"
 *   - Fieldset/legend groups related boolean fields
 *   - Long-form textarea uses aria-describedby pointing to BOTH help and
 *     character counter; counter uses aria-live="polite" + aria-atomic
 *   - Form has aria-label tied to the product name (no cross-file id
 *     coordination needed because the slug is URL-stable)
 *   - Optional fields omit aria-required and use a help hint
 */

import { useState, useRef, useMemo } from "react";
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

// Wave 1 court case port — case stage options for motion-opportunity-scan.
// Server-side allowlist lives in src/app/api/intake/standalone/[slug]/route.ts
// (VALID_CASE_STAGES). Keep both in sync.
const CASE_STAGES = [
  { value: "pre-arraignment", label: "Pre-arraignment (charged but not yet arraigned)" },
  { value: "post-arraignment", label: "Post-arraignment (arraigned, awaiting discovery)" },
  { value: "post-discovery", label: "Post-discovery (discovery received, pre-motion deadline)" },
  { value: "pre-trial", label: "Pre-trial (motions filed, awaiting hearings)" },
  { value: "trial", label: "Trial (in trial or about to start)" },
  { value: "post-trial", label: "Post-trial (verdict reached, sentencing or appeal)" },
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

const CHARGE_TYPE_OPTIONS = CURRENT_CHARGE_TYPES.map((ct) => ({
  value: ct,
  label: CHARGE_TYPE_LABELS[ct] || ct,
}));

// ────────────────────────────────────────────────────────────────────────────
// FIELD CONFIG
// ────────────────────────────────────────────────────────────────────────────
// Per-slug field set declarations. Each FieldConfig entry owns its own
// label, kind, validation hints, and a11y wiring expectations. The render
// loop dispatches to the correct input element based on `kind`.
// ────────────────────────────────────────────────────────────────────────────

type SelectOption = { value: string; label: string };

type FieldConfig =
  | {
      kind: "select";
      name: string;
      label: string;
      required: boolean;
      options: SelectOption[];
      placeholder?: string;
    }
  | {
      kind: "text";
      name: string;
      label: string;
      required: boolean;
      maxLength: number;
      placeholder?: string;
      helpText?: string;
    }
  | {
      kind: "textarea";
      name: string;
      label: string;
      required: boolean;
      maxLength: number;
      rows: number;
      helpText?: string;
    }
  | {
      kind: "checkbox";
      name: string;
      label: string;
    };

const FIELD_SETS: Record<string, FieldConfig[]> = {
  "employment-impact": [
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "text",
      name: "occupation",
      label: "Current job title / occupation",
      required: true,
      maxLength: 200,
      placeholder: "e.g., Registered Nurse, CDL Truck Driver, Software Engineer",
    },
    {
      kind: "select",
      name: "employerType",
      label: "Employer type",
      required: true,
      options: EMPLOYER_TYPES,
      placeholder: "Select employer type",
    },
    {
      kind: "checkbox",
      name: "industryRegulated",
      label:
        "My industry is regulated (healthcare, finance, education, transportation, law enforcement)",
    },
    {
      kind: "checkbox",
      name: "hasClearance",
      label: "I hold a security clearance",
    },
  ],
  "judge-profile": [
    {
      kind: "text",
      name: "judgeName",
      label: "Judge name",
      required: true,
      maxLength: 200,
      placeholder: "e.g., Hon. Pat Siracusa",
      helpText:
        "Full name as it appears on your court paperwork. Include any title (Hon., Judge, Justice).",
    },
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "text",
      name: "county",
      label: "County (or judicial district / federal district)",
      required: true,
      maxLength: 200,
      placeholder: "e.g., Hillsborough County, Middle District of Florida",
    },
    {
      kind: "text",
      name: "caseNumber",
      label: "Case number",
      required: false,
      maxLength: 200,
      placeholder: "Optional",
      helpText:
        "Optional. Format varies by court — paste it as it appears on your paperwork.",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
  ],
  "motion-opportunity-scan": [
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "text",
      name: "county",
      label: "County (or judicial district / federal district)",
      required: true,
      maxLength: 200,
      placeholder: "e.g., Hillsborough County, Middle District of Florida",
    },
    {
      kind: "select",
      name: "caseStage",
      label: "Current case stage",
      required: true,
      options: CASE_STAGES,
      placeholder: "Select case stage",
    },
    {
      kind: "text",
      name: "judgeName",
      label: "Judge name",
      required: false,
      maxLength: 200,
      placeholder: "Optional",
      helpText:
        "Optional. Helps tailor the scan if known. Leave blank if your judge has not been assigned.",
    },
    {
      kind: "textarea",
      name: "knownFacts",
      label: "Known facts about your case",
      required: true,
      maxLength: 800,
      rows: 6,
      helpText:
        "What happened, what you are charged with, and what stage you are at. Up to 800 characters.",
    },
  ],
};

interface Props {
  slug: string;
  productName: string;
  token: string;
}

type FormStatus = "idle" | "submitting" | "success" | "error";
type FormValue = string | boolean;

export default function IntakeFormClient({ slug, productName, token }: Props) {
  // Resolve the field set for this slug. If the slug has no config we
  // bail to an empty array — the parent page.tsx already 404s on invalid
  // slugs, so this is purely a defensive default.
  const fields = useMemo<FieldConfig[]>(
    () => FIELD_SETS[slug] || [],
    [slug]
  );

  // Single record-shaped state initialised from the field config.
  // Checkboxes start false; everything else starts as empty string.
  const [formData, setFormData] = useState<Record<string, FormValue>>(() =>
    Object.fromEntries(
      fields.map((f) => [f.name, f.kind === "checkbox" ? false : ""])
    )
  );

  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const errorRef = useRef<HTMLDivElement>(null);

  function setField(name: string, value: FormValue) {
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  // Submit-enabled when every required field has a non-empty value.
  // Optional fields are skipped. Booleans are always considered "filled".
  const canSubmit = fields.every((f) => {
    if (f.kind === "checkbox") return true;
    if (!f.required) return true;
    const v = formData[f.name];
    return typeof v === "string" && v.trim().length > 0;
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMessage("");

    try {
      const res = await fetch(`/api/intake/standalone/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...formData }),
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
      setErrorMessage(
        "Network error. Please check your connection and try again."
      );
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
    "w-full bg-zinc-900 border border-zinc-600 rounded-lg px-4 py-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
  const labelClass = "block text-sm font-medium text-zinc-300 mb-1.5";

  // Group checkboxes for fieldset/legend rendering.
  const checkboxFields = fields.filter((f) => f.kind === "checkbox");
  const nonCheckboxFields = fields.filter((f) => f.kind !== "checkbox");

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label={`Intake form for ${productName}`}
    >
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
        {nonCheckboxFields.map((field) => {
          const id = `intake-${field.name}`;
          const helpId = `${id}-help`;
          const countId = `${id}-count`;

          if (field.kind === "select") {
            return (
              <div key={field.name}>
                <label htmlFor={id} className={labelClass}>
                  {field.label}{" "}
                  {field.required && (
                    <span className="text-red-400" aria-hidden="true">
                      *
                    </span>
                  )}
                </label>
                <select
                  id={id}
                  value={String(formData[field.name] || "")}
                  onChange={(e) => setField(field.name, e.target.value)}
                  required={field.required}
                  aria-required={field.required || undefined}
                  className={selectClass}
                >
                  <option value="">{field.placeholder || "Select"}</option>
                  {field.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          if (field.kind === "text") {
            return (
              <div key={field.name}>
                <label htmlFor={id} className={labelClass}>
                  {field.label}{" "}
                  {field.required && (
                    <span className="text-red-400" aria-hidden="true">
                      *
                    </span>
                  )}
                </label>
                {field.helpText && (
                  <p id={helpId} className="text-xs text-zinc-400 mb-1.5">
                    {field.helpText}
                  </p>
                )}
                <input
                  id={id}
                  type="text"
                  value={String(formData[field.name] || "")}
                  onChange={(e) => setField(field.name, e.target.value)}
                  required={field.required}
                  aria-required={field.required || undefined}
                  aria-describedby={field.helpText ? helpId : undefined}
                  maxLength={field.maxLength}
                  placeholder={field.placeholder}
                  className={selectClass}
                />
              </div>
            );
          }

          if (field.kind === "textarea") {
            const value = String(formData[field.name] || "");
            const remaining = field.maxLength - value.length;
            const overLimit = remaining < 0;
            const nearLimit = remaining <= 50 && remaining >= 0;
            const counterColor = overLimit
              ? "text-red-400"
              : nearLimit
              ? "text-amber-400"
              : "text-zinc-500";

            return (
              <div key={field.name}>
                <label htmlFor={id} className={labelClass}>
                  {field.label}{" "}
                  {field.required && (
                    <span className="text-red-400" aria-hidden="true">
                      *
                    </span>
                  )}
                </label>
                {field.helpText && (
                  <p id={helpId} className="text-xs text-zinc-400 mb-1.5">
                    {field.helpText}
                  </p>
                )}
                <textarea
                  id={id}
                  value={value}
                  onChange={(e) => setField(field.name, e.target.value)}
                  required={field.required}
                  aria-required={field.required || undefined}
                  aria-describedby={
                    field.helpText ? `${helpId} ${countId}` : countId
                  }
                  aria-invalid={overLimit ? "true" : undefined}
                  maxLength={field.maxLength}
                  rows={field.rows}
                  className={`${selectClass} resize-y`}
                />
                <div
                  id={countId}
                  className={`mt-1 text-xs ${counterColor}`}
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {remaining >= 0
                    ? `${remaining} characters remaining`
                    : `${Math.abs(remaining)} characters over limit`}
                </div>
              </div>
            );
          }

          return null;
        })}

        {/* Boolean fields grouped in a fieldset (only if any exist) */}
        {checkboxFields.length > 0 && (
          <fieldset className="space-y-4">
            <legend className="text-sm font-medium text-zinc-300 mb-2">
              Additional details
            </legend>
            {checkboxFields.map((field) => (
              <label
                key={field.name}
                className="flex items-center gap-3 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={Boolean(formData[field.name])}
                  onChange={(e) => setField(field.name, e.target.checked)}
                  className="h-5 w-5 rounded border-zinc-600 bg-zinc-900 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
                />
                <span className="text-zinc-300">{field.label}</span>
              </label>
            ))}
          </fieldset>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={status === "submitting" || !canSubmit}
        className="mt-8 w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white py-4 rounded-lg font-semibold text-lg transition-colors"
        aria-busy={status === "submitting"}
      >
        {status === "submitting"
          ? "Generating your report..."
          : "Generate My Report"}
      </button>

      {/* UPL disclaimer */}
      <p className="mt-4 text-xs text-zinc-500">
        This report provides legal INFORMATION — not legal ADVICE. Your
        attorney remains the final authority on strategy decisions.
      </p>
    </form>
  );
}

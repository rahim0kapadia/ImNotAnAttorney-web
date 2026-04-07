"use client";

/**
 * @fileoverview Calculator Wizard — multi-step client component.
 *
 * Pattern cloned from src/app/score/ScoreClient.tsx (wizard + results +
 * email capture). The step definitions are keyed by product slug so the
 * same component serves every future calculator (SOL, diversion, etc.).
 *
 * Accessibility posture (per pre-write review from accessibility-lead):
 * - Native <fieldset>/<legend> for each step; NO redundant role="radiogroup".
 * - Number inputs use type="text" inputMode="numeric" to avoid the well-
 *   documented mobile + screen-reader issues with type="number".
 * - Custom radio indicators: the real <input> is sr-only; the focus ring
 *   lives on the enclosing <label> via focus-within.
 * - On calculate-success: focus moves to the <h2> results heading
 *   (tabIndex={-1}) so screen readers announce the new state.
 * - Results numbers grid is a <dl>/<dt>/<dd> for programmatic label/value
 *   pairing (not <p> tags).
 * - Error: role="alert". Success: role="status". Region: labelled by h2.
 * - All interactive hit areas are ≥44px (WCAG 2.5.8 exceeds the 24px min).
 */

import { useState, useRef, useEffect, useCallback } from "react";
import type { StandaloneProduct } from "@/lib/products";

// ─── Step definitions (one array per calculator slug) ─────────────

interface StepOption {
  value: string;
  label: string;
}

interface Step {
  id: string;
  label: string;
  type: "select" | "number" | "date";
  options?: StepOption[];
  placeholder?: string;
  helpText?: string;
}

const GOOD_TIME_STEPS: Step[] = [
  {
    id: "state",
    label: "What state is your case in?",
    type: "select",
    options: [
      { value: "FL", label: "Florida" },
      { value: "CA", label: "California" },
      { value: "TX", label: "Texas" },
      { value: "NY", label: "New York" },
      { value: "PA", label: "Pennsylvania" },
      { value: "IL", label: "Illinois" },
      { value: "OH", label: "Ohio" },
      { value: "GA", label: "Georgia" },
      { value: "NC", label: "North Carolina" },
      { value: "MI", label: "Michigan" },
    ],
    helpText: "We currently cover 10 states. More coming soon.",
  },
  {
    id: "chargeType",
    label: "What type of charge?",
    type: "select",
    options: [
      { value: "drug-possession", label: "Drug Possession" },
      { value: "drug-trafficking", label: "Drug Trafficking" },
      { value: "dui", label: "DUI / DWI" },
      { value: "white-collar", label: "White Collar / Fraud" },
      { value: "sex-offense", label: "Sex Offense" },
      { value: "federal-criminal", label: "Federal" },
      { value: "other-felony", label: "Other Felony" },
      { value: "other-misdemeanor", label: "Other Misdemeanor" },
    ],
  },
  {
    id: "sentenceMonths",
    label: "Sentence length (in months)",
    type: "number",
    placeholder: "e.g., 36 for 3 years",
    helpText: "Enter the total sentence imposed by the court.",
  },
  {
    id: "custodyCredits",
    label: "Days already served (jail time credit)",
    type: "number",
    placeholder: "e.g., 90",
    helpText: "Time spent in custody before sentencing. Enter 0 if none.",
  },
  {
    id: "offenseDate",
    label: "Approximate offense date",
    type: "date",
    helpText: "This determines which sentencing rules apply.",
  },
];

const STEP_MAP: Record<string, Step[]> = {
  "good-time": GOOD_TIME_STEPS,
  // "sol": SOL_STEPS,
  // "diversion": DIVERSION_STEPS,
};

// Every calculator eventually contributes to prisonType context — for
// good-time this is hard-coded to "state" because the rules file only
// covers state sentences. Federal and county have separate rule systems.
const DEFAULT_PRISON_TYPE: Record<string, string> = {
  "good-time": "state",
};

// ─── Types for API response ──────────────────────────────────────

interface CalculatorResult {
  supported: boolean;
  stateName?: string;
  minimumServePercent?: number;
  estimatedServeMonths?: number;
  estimatedCreditMonths?: number;
  estimatedNetServeMonths?: number;
  custodyCreditDays: number;
  statuteCitation?: string;
  ruleApplied?: string;
  observations: string[];
  fallbackMessage?: string;
}

type AnswerValue = string | number;

interface Props {
  slug: string;
  product: StandaloneProduct;
}

export default function CalculatorClient({ slug, product }: Props) {
  const steps = STEP_MAP[slug];
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [result, setResult] = useState<CalculatorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveEmail, setSaveEmail] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const stepContainerRef = useRef<HTMLDivElement>(null);
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);

  // Focus management: when the step changes, focus the first interactive
  // control in the new step so keyboard users land in the right place.
  useEffect(() => {
    if (!result && stepContainerRef.current) {
      const input =
        stepContainerRef.current.querySelector<HTMLElement>(
          'input:not([type="hidden"]), select, button[role="radio"]',
        );
      input?.focus();
    }
  }, [currentStep, result]);

  // Focus management: when results arrive, move focus to the results
  // heading so screen reader users hear the new state announced.
  useEffect(() => {
    if (result && resultsHeadingRef.current) {
      resultsHeadingRef.current.focus();
    }
  }, [result]);

  const submitCalculation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tools/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...answers,
          prisonType: DEFAULT_PRISON_TYPE[slug] ?? "state",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Calculation failed — please check your inputs and try again.",
        );
        return;
      }
      setResult(data.result as CalculatorResult);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }, [slug, answers]);

  async function handleSaveResults() {
    if (!saveEmail || !result) return;
    setSaveError(null);
    try {
      const res = await fetch("/api/tools/save-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          inputs: answers,
          result,
          email: saveEmail,
        }),
      });
      if (res.ok) {
        setSaved(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setSaveError(
          typeof data.error === "string"
            ? data.error
            : "Could not save — please try again.",
        );
      }
    } catch {
      setSaveError("Network error — please try again.");
    }
  }

  // Fail closed if the calculator wasn't configured for this slug.
  if (!steps) {
    return (
      <p role="alert" className="text-red-400">
        This calculator is not yet configured. Please check back soon.
      </p>
    );
  }

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const currentAnswer = answers[step.id];
  const canProceed =
    currentAnswer !== undefined &&
    currentAnswer !== "" &&
    !(typeof currentAnswer === "number" && Number.isNaN(currentAnswer));

  async function handleNext() {
    if (!canProceed) return;
    if (isLastStep) {
      await submitCalculation();
    } else {
      setCurrentStep((s) => s + 1);
    }
  }

  function handleNumberChange(value: string, id: string) {
    // Strip non-digits (inputMode="numeric" + pattern helps but doesn't
    // enforce on paste). Empty string clears the value.
    const cleaned = value.replace(/[^0-9]/g, "");
    setAnswers((a) => {
      if (cleaned === "") {
        const next = { ...a };
        delete next[id];
        return next;
      }
      return { ...a, [id]: parseInt(cleaned, 10) };
    });
  }

  // ─── RESULTS VIEW ────────────────────────────────────────────

  if (result) {
    return (
      <div
        role="region"
        aria-labelledby="calculator-results-heading"
        className="focus:outline-none"
      >
        <h2
          id="calculator-results-heading"
          ref={resultsHeadingRef}
          tabIndex={-1}
          className="text-2xl font-bold mb-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 rounded"
        >
          Your Results
        </h2>

        {result.supported === false || !result.minimumServePercent ? (
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 mb-6">
            <p className="text-zinc-200">
              {result.fallbackMessage ??
                "We couldn't compute a result for this combination."}
            </p>
          </div>
        ) : (
          <>
            <dl className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <dt className="text-zinc-300 text-sm">Minimum Serve Time</dt>
                <dd className="text-2xl font-bold text-zinc-50">
                  {result.minimumServePercent}%
                </dd>
              </div>
              <div>
                <dt className="text-zinc-300 text-sm">Estimated Serve</dt>
                <dd className="text-2xl font-bold text-zinc-50">
                  {result.estimatedServeMonths} months
                </dd>
              </div>
              <div>
                <dt className="text-zinc-300 text-sm">
                  Potential Good Time Reduction
                </dt>
                <dd className="text-2xl font-bold text-green-400">
                  {result.estimatedCreditMonths ?? 0} months
                </dd>
              </div>
              <div>
                <dt className="text-zinc-300 text-sm">
                  After Custody Credit
                </dt>
                <dd className="text-2xl font-bold text-blue-300">
                  {result.estimatedNetServeMonths} months
                </dd>
              </div>
            </dl>

            <p className="text-xs text-zinc-400 mb-6">
              Based on {result.ruleApplied} ({result.statuteCitation})
            </p>

            <ul className="mb-6 space-y-3">
              {result.observations.map((obs, i) => (
                <li
                  key={i}
                  className="text-zinc-200 text-base leading-relaxed"
                >
                  {obs}
                </li>
              ))}
            </ul>
          </>
        )}

        {/* ─── Email save (post-value) ─────────────────────────── */}
        {!saved ? (
          <div className="mt-8 bg-zinc-900 border border-zinc-700 rounded-lg p-6">
            <h3 className="font-semibold mb-2 text-zinc-50">
              Save your results
            </h3>
            <p className="text-zinc-300 text-sm mb-4">
              Get a permanent link to these results. We&rsquo;ll email it to
              you so you can share it with your attorney.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <label htmlFor="save-email" className="sr-only">
                Email address
              </label>
              <input
                id="save-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={saveEmail}
                onChange={(e) => setSaveEmail(e.target.value)}
                aria-describedby={saveError ? "save-email-error" : undefined}
                aria-invalid={saveError ? true : undefined}
                className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-3 py-3 text-zinc-50 placeholder:text-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              />
              <button
                type="button"
                onClick={handleSaveResults}
                disabled={!saveEmail}
                className="bg-blue-500 hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
              >
                Save &amp; email link
              </button>
            </div>
            {saveError && (
              <p
                id="save-email-error"
                role="alert"
                className="mt-2 text-sm text-red-300"
              >
                {saveError}
              </p>
            )}
          </div>
        ) : (
          <div
            className="mt-8 bg-green-900/30 border border-green-600 rounded-lg p-6"
            role="status"
          >
            <p className="text-green-200">
              Saved. Check your email for the permanent link.
            </p>
          </div>
        )}

        {/* ─── Upsell CTA ─────────────────────────────────────── */}
        {product.upsellTier && product.upsellText && (
          <div className="mt-8 border-t border-zinc-800 pt-8">
            <p className="text-zinc-200 mb-4">{product.upsellText}</p>
            <a
              href={`/checkout?tier=${product.upsellTier}`}
              className="inline-block bg-blue-500 hover:bg-blue-400 text-white px-6 py-3 rounded-lg font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
            >
              See the Case Decoder
            </a>
          </div>
        )}
      </div>
    );
  }

  // ─── WIZARD VIEW ─────────────────────────────────────────────

  return (
    <div ref={stepContainerRef}>
      {/* Progress indicator */}
      <div
        role="progressbar"
        aria-valuenow={currentStep + 1}
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-label={`Step ${currentStep + 1} of ${steps.length}`}
        className="mb-8"
      >
        <div className="flex gap-1">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded ${
                i <= currentStep ? "bg-blue-400" : "bg-zinc-700"
              }`}
            />
          ))}
        </div>
        <p className="text-zinc-300 text-sm mt-2">
          Step {currentStep + 1} of {steps.length}
        </p>
      </div>

      {/* Current step */}
      <fieldset className="border-0 p-0 m-0">
        <legend className="text-xl font-semibold mb-4 text-zinc-50">
          {step.label}
        </legend>
        {step.helpText && (
          <p id={`help-${step.id}`} className="text-zinc-300 text-sm mb-4">
            {step.helpText}
          </p>
        )}

        {step.type === "select" && step.options && (
          <div className="space-y-2">
            {step.options.map((opt) => {
              const selected = answers[step.id] === opt.value;
              return (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-blue-400 focus-within:ring-offset-2 focus-within:ring-offset-zinc-950 ${
                    selected
                      ? "border-blue-400 bg-blue-500/10"
                      : "border-zinc-700 hover:border-zinc-500"
                  }`}
                >
                  <input
                    type="radio"
                    name={step.id}
                    value={opt.value}
                    checked={selected}
                    onChange={() =>
                      setAnswers((a) => ({ ...a, [step.id]: opt.value }))
                    }
                    className="sr-only"
                  />
                  <span
                    className={`w-5 h-5 rounded-full border-2 flex-shrink-0 ${
                      selected
                        ? "border-blue-400 bg-blue-400"
                        : "border-zinc-500"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="text-zinc-100">{opt.label}</span>
                </label>
              );
            })}
          </div>
        )}

        {step.type === "number" && (
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            placeholder={step.placeholder}
            value={
              typeof answers[step.id] === "number"
                ? String(answers[step.id])
                : ""
            }
            onChange={(e) => handleNumberChange(e.target.value, step.id)}
            aria-describedby={
              step.helpText ? `help-${step.id}` : undefined
            }
            className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-4 py-3 text-lg text-zinc-50 placeholder:text-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          />
        )}

        {step.type === "date" && (
          <input
            type="date"
            value={
              typeof answers[step.id] === "string"
                ? (answers[step.id] as string)
                : ""
            }
            onChange={(e) =>
              setAnswers((a) => ({ ...a, [step.id]: e.target.value }))
            }
            aria-describedby={
              step.helpText ? `help-${step.id}` : undefined
            }
            className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-4 py-3 text-lg text-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          />
        )}
      </fieldset>

      {/* Navigation */}
      <div className="mt-8 flex gap-4">
        {currentStep > 0 && (
          <button
            type="button"
            onClick={() => setCurrentStep((s) => s - 1)}
            className="px-6 py-3 border border-zinc-600 rounded-lg text-zinc-100 hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={handleNext}
          disabled={!canProceed || loading}
          className="flex-1 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
        >
          {loading ? "Calculating…" : isLastStep ? "Calculate" : "Next"}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 bg-red-900/30 border border-red-600 rounded-lg p-4"
        >
          <p className="text-red-200">{error}</p>
        </div>
      )}
    </div>
  );
}

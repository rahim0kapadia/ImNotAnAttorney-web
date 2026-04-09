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
 * - Good-time results grid is a <dl>/<dt>/<dd> for programmatic label/value
 *   pairing (not <p> tags).
 * - Diversion results use <ul> (program eligibility is a list, not
 *   key-value pairs). Per-program UPL hedge in text content.
 * - Dynamic county options wrapped with aria-live="polite".
 * - Error: role="alert". Success: role="status". Region: labelled by h2.
 * - All interactive hit areas are >=44px (WCAG 2.5.8 exceeds the 24px min).
 */

import { useState, useRef, useEffect, useCallback } from "react";
import type { StandaloneProduct } from "@/lib/products";

// --- Step definitions (one array per calculator slug) ---------------

interface StepOption {
  value: string;
  label: string;
}

type AnswerValue = string | number;

interface Step {
  id: string;
  label: string;
  type: "select" | "dropdown" | "number" | "date";
  options?: StepOption[];
  dynamicOptions?: (answers: Record<string, AnswerValue>) => StepOption[];
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

// --- Florida counties (all 67, alphabetical) -----------------------

const FL_COUNTIES: StepOption[] = [
  "Alachua", "Baker", "Bay", "Bradford", "Brevard", "Broward",
  "Calhoun", "Charlotte", "Citrus", "Clay", "Collier", "Columbia",
  "DeSoto", "Dixie", "Duval", "Escambia", "Flagler", "Franklin",
  "Gadsden", "Gilchrist", "Glades", "Gulf", "Hamilton", "Hardee",
  "Hendry", "Hernando", "Highlands", "Hillsborough", "Holmes",
  "Indian River", "Jackson", "Jefferson", "Lafayette", "Lake", "Lee",
  "Leon", "Levy", "Liberty", "Madison", "Manatee", "Marion", "Martin",
  "Miami-Dade", "Monroe", "Nassau", "Okaloosa", "Okeechobee", "Orange",
  "Osceola", "Palm Beach", "Pasco", "Pinellas", "Polk", "Putnam",
  "Santa Rosa", "Sarasota", "Seminole", "St. Johns", "St. Lucie",
  "Sumter", "Suwannee", "Taylor", "Union", "Volusia", "Wakulla",
  "Walton", "Washington",
].map((name) => ({ value: name, label: name }));

// --- Veterans court county lists (10 states) -------------------------

const VETERANS_COURT_COUNTIES: Record<string, StepOption[]> = {
  FL: FL_COUNTIES,
  CA: ["Alameda","Butte","Calaveras","Contra Costa","Del Norte","El Dorado","Fresno","Kings","Lake","Los Angeles","Madera","Merced","Monterey","Orange","Placer","Riverside","Sacramento","San Bernardino","San Diego","San Francisco","San Joaquin","San Luis Obispo","San Mateo","Santa Barbara","Santa Clara","Santa Cruz","Solano","Sonoma","Stanislaus","Tulare","Ventura"].map((n) => ({ value: n, label: n })),
  TX: ["Bell","Bexar","Brazoria","Collin","Comal","Cooke","Dallas","Denton","El Paso","Fannin","Fort Bend","Galveston","Grayson","Guadalupe","Harris","Hays","Hidalgo","Hunt","Kaufman","Liberty","McLennan","Montgomery","Nueces","Rockwall","Smith","Tarrant","Travis","Webb","Williamson"].map((n) => ({ value: n, label: n })),
  PA: ["Allegheny","Berks","Bucks","Centre","Chester","Cumberland","Dauphin","Delaware","Erie","Lackawanna","Lancaster","Lehigh","Monroe","Montgomery","Northampton","Philadelphia","York"].map((n) => ({ value: n, label: n })),
  NY: ["Albany","Bronx","Brooklyn (Kings)","Buffalo (Erie)","Cayuga","Chautauqua","Chemung","Clinton","Dutchess","Erie","Genesee","Herkimer","Jefferson","Manhattan (New York)","Monroe","Nassau","Niagara","Oneida","Onondaga","Ontario","Orange","Orleans","Oswego","Putnam","Queens","Rensselaer","Richmond (Staten Island)","Rockland","Saratoga","Schenectady","Steuben","Suffolk","Sullivan","Tompkins","Ulster","Wayne","Westchester","Yates"].map((n) => ({ value: n, label: n })),
  OH: ["Allen","Butler","Clark","Clermont","Cuyahoga","Delaware","Erie","Franklin","Greene","Hamilton","Lake","Licking","Lorain","Lucas","Mahoning","Medina","Montgomery","Portage","Stark","Summit"].map((n) => ({ value: n, label: n })),
  NC: ["Buncombe","Cabarrus","Cumberland","Durham","Forsyth","Gaston","Guilford","Mecklenburg","New Hanover","Onslow","Orange","Pitt","Rowan","Wake"].map((n) => ({ value: n, label: n })),
  VA: ["Arlington","Chesapeake","Fairfax","Henrico","Norfolk","Prince William","Richmond","Virginia Beach"].map((n) => ({ value: n, label: n })),
  GA: ["Baldwin","Barrow","Bibb","Carroll","Chatham","Cherokee","Clarke","Clayton","Cobb","Coffee","Columbia","Coweta","DeKalb","Dougherty","Douglas","Floyd","Forsyth","Fulton","Glynn","Gwinnett","Hall","Henry","Houston","Lowndes","Muscogee","Newton","Paulding","Richmond","Troup","Whitfield"].map((n) => ({ value: n, label: n })),
  IL: ["Adams","Champaign","Cook","DuPage","Kane","Kankakee","Knox","Lake","LaSalle","Lee","Macon","Madison","McHenry","McLean","Peoria","Rock Island","St. Clair","Sangamon","Tazewell","Vermilion","Will","Williamson","Winnebago"].map((n) => ({ value: n, label: n })),
};

// --- Veterans court wizard steps (7 steps) ---------------------------

const VETERANS_COURT_STATE_OPTIONS: StepOption[] = [
  { value: "CA", label: "California" },
  { value: "TX", label: "Texas" },
  { value: "FL", label: "Florida" },
  { value: "PA", label: "Pennsylvania" },
  { value: "NY", label: "New York" },
  { value: "OH", label: "Ohio" },
  { value: "NC", label: "North Carolina" },
  { value: "VA", label: "Virginia" },
  { value: "GA", label: "Georgia" },
  { value: "IL", label: "Illinois" },
];

const VETERANS_COURT_STEPS: Step[] = [
  {
    id: "state",
    label: "What state is your case in?",
    type: "dropdown",
    options: VETERANS_COURT_STATE_OPTIONS,
    helpText:
      "We cover the 10 states with the most veterans. More coming soon.",
  },
  {
    id: "county",
    label: "What county is your case in?",
    type: "dropdown",
    dynamicOptions: (answers) => {
      const st = answers.state as string | undefined;
      if (st && VETERANS_COURT_COUNTIES[st]) return VETERANS_COURT_COUNTIES[st];
      return [];
    },
  },
  {
    id: "branchOfService",
    label: "Branch of service",
    type: "select",
    options: [
      { value: "army", label: "Army" },
      { value: "navy", label: "Navy" },
      { value: "air-force", label: "Air Force" },
      { value: "marines", label: "Marines" },
      { value: "coast-guard", label: "Coast Guard" },
      { value: "space-force", label: "Space Force" },
    ],
  },
  {
    id: "dischargeType",
    label: "Discharge type",
    type: "select",
    options: [
      { value: "honorable", label: "Honorable" },
      { value: "general-under-honorable", label: "General (Under Honorable)" },
      { value: "other-than-honorable", label: "Other Than Honorable" },
      { value: "bad-conduct", label: "Bad Conduct" },
      { value: "dishonorable", label: "Dishonorable" },
      { value: "unknown", label: "Unknown / Not Sure" },
    ],
  },
  {
    id: "serviceCondition",
    label: "Service-connected condition",
    type: "select",
    options: [
      { value: "ptsd", label: "PTSD" },
      { value: "tbi", label: "Traumatic Brain Injury (TBI)" },
      { value: "substance-abuse", label: "Substance Abuse" },
      { value: "mental-health", label: "Other Mental Health Condition" },
      { value: "mst", label: "Military Sexual Trauma (MST)" },
      { value: "multiple", label: "Multiple Conditions" },
      { value: "none", label: "None" },
      { value: "prefer-not-to-say", label: "Prefer Not to Say" },
    ],
    helpText:
      "This determines if the service connection requirement is met.",
  },
  {
    id: "chargeType",
    label: "What type of charge?",
    type: "select",
    options: [
      { value: "drug-possession", label: "Drug Possession" },
      { value: "drug-trafficking", label: "Drug Trafficking" },
      { value: "dui", label: "DUI / DWI" },
      { value: "assault", label: "Assault" },
      { value: "theft-property", label: "Theft / Property Crime" },
      { value: "domestic-violence", label: "Domestic Violence" },
      { value: "white-collar", label: "White Collar / Fraud" },
      { value: "sex-offense", label: "Sex Offense" },
      { value: "other-felony", label: "Other Felony" },
      { value: "other-misdemeanor", label: "Other Misdemeanor" },
    ],
  },
  {
    id: "priorConvictions",
    label: "Prior convictions",
    type: "select",
    options: [
      { value: "none", label: "No prior convictions" },
      { value: "misdemeanor", label: "Prior misdemeanor(s)" },
      { value: "felony", label: "Prior felony" },
      { value: "multiple", label: "Multiple prior convictions" },
    ],
  },
];

// --- Diversion eligibility wizard steps ------------------------------

const DIVERSION_STEPS: Step[] = [
  {
    id: "state",
    label: "What state is your case in?",
    type: "select",
    options: [{ value: "FL", label: "Florida" }],
    helpText: "We currently cover Florida. More states coming soon.",
  },
  {
    id: "county",
    label: "What county is your case in?",
    type: "dropdown",
    dynamicOptions: (answers) => {
      if (answers.state === "FL") return FL_COUNTIES;
      return [];
    },
  },
  {
    id: "chargeType",
    label: "What type of charge?",
    type: "select",
    options: [
      { value: "drug-possession", label: "Drug Possession" },
      { value: "drug-trafficking", label: "Drug Trafficking" },
      { value: "dui", label: "DUI / DWI" },
      { value: "assault", label: "Assault" },
      { value: "theft-property", label: "Theft / Property Crime" },
      { value: "domestic-violence", label: "Domestic Violence" },
      { value: "white-collar", label: "White Collar / Fraud" },
      { value: "other-felony", label: "Other Felony" },
      { value: "other-misdemeanor", label: "Other Misdemeanor" },
    ],
  },
  {
    id: "chargeCategory",
    label: "What is the charge classification?",
    type: "select",
    options: [
      { value: "felony", label: "Felony" },
      { value: "misdemeanor", label: "Misdemeanor" },
    ],
  },
  {
    id: "priorConvictions",
    label: "Do you have prior convictions?",
    type: "select",
    options: [
      { value: "none", label: "No prior convictions" },
      { value: "misdemeanor", label: "Prior misdemeanor(s)" },
      { value: "felony", label: "Prior felony" },
      { value: "multiple", label: "Multiple prior convictions" },
    ],
  },
  {
    id: "priorDiversion",
    label: "Have you previously participated in a diversion program?",
    type: "select",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
  },
  {
    id: "chargeInvolves",
    label: "Which of the following best describes the charge?",
    type: "select",
    options: [
      { value: "violence", label: "Violence" },
      { value: "firearms", label: "Firearms" },
      { value: "sexual", label: "Sexual conduct" },
      { value: "trafficking", label: "Trafficking" },
      { value: "none", label: "None of the above" },
    ],
  },
  {
    id: "isVeteran",
    label: "Are you a military veteran?",
    type: "select",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
  },
  {
    id: "substanceAbuse",
    label: "Do you have a history of substance abuse?",
    type: "select",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
    helpText: "This determines drug court eligibility.",
  },
  {
    id: "mentalHealthDiagnosis",
    label: "Do you have a diagnosed mental health condition?",
    type: "select",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
    helpText: "This determines mental health court eligibility.",
  },
];

const STEP_MAP: Record<string, Step[]> = {
  "good-time": GOOD_TIME_STEPS,
  "diversion-eligibility": DIVERSION_STEPS,
  "veterans-court": VETERANS_COURT_STEPS,
};

const DEFAULT_PRISON_TYPE: Record<string, string> = {
  "good-time": "state",
};

// --- Types for API response ----------------------------------------

interface GoodTimeResult {
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

interface DiversionProgramAssessment {
  programName: string;
  programKey: string;
  statute: string | null;
  eligibility: "LIKELY_ELIGIBLE" | "POSSIBLY_ELIGIBLE" | "LIKELY_INELIGIBLE" | "NOT_APPLICABLE";
  reasons: string[];
  description: string;
  typicalDuration: string | null;
  completionResult: string | null;
}

interface DiversionClientResult {
  supported: boolean;
  stateName: string;
  county: string;
  programs: DiversionProgramAssessment[];
  disqualifiersIdentified: string[];
  questions: string[];
  countyNote: string;
  fallbackMessage?: string;
}

interface VeteransCourtClientResult {
  supported: boolean;
  stateName: string;
  county: string;
  courtAvailable: boolean;
  courtAvailableDetail: string;
  statute: string | null;
  dischargeEligibility: string;
  serviceConnectionMet: boolean;
  serviceConnectionDetail: string;
  chargeExclusions: string[];
  chargeExcluded: boolean;
  programDetails: {
    typicalDuration: string | null;
    completionResult: string | null;
    conditions: string[];
  } | null;
  questions: string[];
  fallbackMessage?: string;
}

type CalculatorResult =
  | GoodTimeResult
  | DiversionClientResult
  | VeteransCourtClientResult;

interface Props {
  slug: string;
  product: StandaloneProduct;
}

// --- Diversion eligibility badge colors (brand: amber positive) ----

const ELIGIBILITY_BADGE: Record<
  DiversionProgramAssessment["eligibility"],
  { label: string; className: string } | null
> = {
  LIKELY_ELIGIBLE: {
    label: "Likely Eligible",
    className: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  },
  POSSIBLY_ELIGIBLE: {
    label: "Factors to Explore",
    className: "bg-zinc-500/20 text-zinc-300 border-zinc-500/40",
  },
  LIKELY_INELIGIBLE: {
    label: "Likely Ineligible",
    className: "bg-red-500/20 text-red-400 border-red-500/40",
  },
  NOT_APPLICABLE: null,
};

function isDiversionResult(
  slug: string,
  _r: CalculatorResult,
): _r is DiversionClientResult {
  return slug === "diversion-eligibility";
}

// --- Diversion result renderer -------------------------------------

function DiversionResults({ result }: { result: DiversionClientResult }) {
  if (!result.supported) {
    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 mb-6">
        <p className="text-zinc-200">
          {result.fallbackMessage ??
            "We couldn\u2019t compute a result for this combination."}
        </p>
      </div>
    );
  }

  const visiblePrograms = result.programs.filter(
    (p) => ELIGIBILITY_BADGE[p.eligibility] !== null,
  );
  const detailPrograms = result.programs.filter(
    (p) =>
      p.eligibility === "LIKELY_ELIGIBLE" ||
      p.eligibility === "POSSIBLY_ELIGIBLE",
  );

  return (
    <>
      {/* Eligibility Summary */}
      <section className="mb-8">
        <h3 className="text-lg font-semibold text-zinc-50 mb-4">
          Eligibility Summary
        </h3>
        <ul className="space-y-3">
          {visiblePrograms.map((program) => {
            const badge = ELIGIBILITY_BADGE[program.eligibility]!;
            return (
              <li
                key={program.programKey}
                className="bg-zinc-900 border border-zinc-700 rounded-lg p-4"
              >
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <span className="font-medium text-zinc-50">
                    {program.programName}
                  </span>
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full border ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </div>
                {program.statute && (
                  <p className="text-xs text-zinc-400 mb-1">
                    {program.statute}
                  </p>
                )}
                {program.reasons[0] && (
                  <p className="text-sm text-zinc-300">
                    {program.eligibility === "LIKELY_ELIGIBLE"
                      ? "Based on published eligibility criteria, you may qualify."
                      : program.eligibility === "POSSIBLY_ELIGIBLE"
                        ? "Based on published eligibility criteria, there are factors worth exploring."
                        : "Based on published eligibility criteria, this program may not be available given your situation."}{" "}
                    {program.reasons[0]}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Program Details */}
      {detailPrograms.length > 0 && (
        <section className="mb-8">
          <h3 className="text-lg font-semibold text-zinc-50 mb-4">
            Program Details
          </h3>
          <ul className="space-y-4">
            {detailPrograms.map((program) => (
              <li
                key={program.programKey}
                className="bg-zinc-900 border border-zinc-700 rounded-lg p-5"
              >
                <h4 className="font-medium text-zinc-50 mb-2">
                  {program.programName}
                </h4>
                <p className="text-sm text-zinc-300 mb-3">
                  {program.description}
                </p>
                {program.typicalDuration && (
                  <p className="text-sm text-zinc-400 mb-1">
                    <span className="text-zinc-500">Typical duration:</span>{" "}
                    {program.typicalDuration}
                  </p>
                )}
                {program.completionResult && (
                  <p className="text-sm text-zinc-400 mb-3">
                    <span className="text-zinc-500">On completion:</span>{" "}
                    {program.completionResult}
                  </p>
                )}
                <p className="text-xs text-zinc-500 italic mb-2">
                  Based on published eligibility criteria, you may qualify for
                  this program. This is not a determination of eligibility.
                </p>
                <ul className="space-y-1">
                  {program.reasons.map((reason, i) => (
                    <li
                      key={i}
                      className="text-sm text-zinc-300 pl-4 relative before:content-['\2022'] before:absolute before:left-0 before:text-zinc-500"
                    >
                      {reason}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Factors That May Affect Eligibility */}
      {result.disqualifiersIdentified.length > 0 && (
        <section className="mb-8">
          <h3 className="text-lg font-semibold text-zinc-50 mb-2">
            Factors That May Affect Eligibility
          </h3>
          <p className="text-sm text-zinc-400 mb-3">
            Based on the information you provided, these factors may affect
            eligibility for certain programs. Your attorney may identify
            exceptions or alternative paths:
          </p>
          <ul className="space-y-2">
            {result.disqualifiersIdentified.map((dq, i) => (
              <li
                key={i}
                className="text-sm text-amber-300 bg-amber-900/20 border border-amber-800/40 rounded-lg px-4 py-3"
              >
                {dq}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Questions for Your Attorney */}
      {result.questions.length > 0 && (
        <section className="mb-8">
          <h3 className="text-lg font-semibold text-zinc-50 mb-3">
            Questions for Your Attorney
          </h3>
          <ol className="space-y-2 list-decimal list-inside">
            {result.questions.map((q, i) => (
              <li key={i} className="text-sm text-zinc-200 leading-relaxed">
                {q}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* County Note */}
      {result.countyNote && (
        <section className="mb-6">
          <p className="text-xs text-zinc-500 border-t border-zinc-800 pt-4">
            {result.countyNote}
          </p>
        </section>
      )}
    </>
  );
}

// --- Veterans court type guard + renderer -----------------------------

function isVeteransCourtResult(
  slug: string,
  _r: CalculatorResult,
): _r is VeteransCourtClientResult {
  return slug === "veterans-court";
}

function VeteransCourtResults({
  result,
}: {
  result: VeteransCourtClientResult;
}) {
  if (!result.supported) {
    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 mb-6">
        <p className="text-zinc-200">
          {result.fallbackMessage ??
            "We couldn\u2019t compute a result for this combination."}
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Court Availability — primary result */}
      <section className="mb-8">
        <div
          className={`rounded-lg p-5 border ${
            result.courtAvailable
              ? "bg-amber-500/10 border-amber-500/40"
              : "bg-zinc-900 border-zinc-700"
          }`}
        >
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h3 className="text-lg font-semibold text-zinc-50">
              Veterans Treatment Court
            </h3>
            <span
              className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                result.courtAvailable
                  ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                  : "bg-zinc-500/20 text-zinc-300 border-zinc-500/40"
              }`}
            >
              {result.courtAvailable ? "Available" : "Not Confirmed"}
            </span>
          </div>
          <p className="text-sm text-zinc-300">
            {result.courtAvailableDetail}
          </p>
          {result.statute && (
            <p className="text-xs text-zinc-400 mt-2">{result.statute}</p>
          )}
        </div>
      </section>

      {/* Discharge Eligibility */}
      <section className="mb-8">
        <h3 className="text-lg font-semibold text-zinc-50 mb-3">
          Discharge Eligibility
        </h3>
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4">
          <p className="text-sm text-zinc-300">
            {result.dischargeEligibility}
          </p>
          <p className="text-xs text-zinc-500 italic mt-2">
            Based on published eligibility criteria. This is not a
            determination of eligibility.
          </p>
        </div>
      </section>

      {/* Service Connection */}
      <section className="mb-8">
        <h3 className="text-lg font-semibold text-zinc-50 mb-3">
          Service Connection
        </h3>
        <div
          className={`rounded-lg p-4 border ${
            result.serviceConnectionMet
              ? "bg-zinc-900 border-zinc-700"
              : "bg-amber-900/20 border-amber-800/40"
          }`}
        >
          <p className="text-sm text-zinc-300">
            {result.serviceConnectionDetail}
          </p>
          {!result.serviceConnectionMet && (
            <p className="text-xs text-amber-400 mt-2">
              Many veterans qualify through conditions they may not have
              formally documented yet. Your attorney can help identify
              documentation options and whether your situation meets the
              court&rsquo;s service connection standard.
            </p>
          )}
        </div>
      </section>

      {/* Charge Considerations */}
      <section className="mb-8">
        <h3 className="text-lg font-semibold text-zinc-50 mb-3">
          Charge Considerations
        </h3>
        {result.chargeExcluded && (
          <div className="bg-red-900/20 border border-red-800/40 rounded-lg p-4 mb-3">
            <p className="text-sm text-red-300">
              Based on published eligibility criteria, your charge type may be
              excluded from veterans treatment court in this jurisdiction.
            </p>
          </div>
        )}
        {result.chargeExclusions.length > 0 && (
          <>
            <p className="text-sm text-zinc-400 mb-2">
              Common exclusions in this jurisdiction:
            </p>
            <ul className="space-y-1">
              {result.chargeExclusions.map((excl, i) => (
                <li
                  key={i}
                  className="text-sm text-zinc-300 pl-4 relative before:content-['\2022'] before:absolute before:left-0 before:text-zinc-500"
                >
                  {excl}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Program Details */}
      {result.programDetails && (
        <section className="mb-8">
          <h3 className="text-lg font-semibold text-zinc-50 mb-3">
            Program Details
          </h3>
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-5">
            {result.programDetails.typicalDuration && (
              <p className="text-sm text-zinc-400 mb-1">
                <span className="text-zinc-500">Typical duration:</span>{" "}
                {result.programDetails.typicalDuration}
              </p>
            )}
            {result.programDetails.completionResult && (
              <p className="text-sm text-zinc-400 mb-3">
                <span className="text-zinc-500">On completion:</span>{" "}
                {result.programDetails.completionResult}
              </p>
            )}
            {result.programDetails.conditions.length > 0 && (
              <>
                <p className="text-sm text-zinc-400 mb-2">
                  Typical program conditions:
                </p>
                <ul className="space-y-1">
                  {result.programDetails.conditions.map((cond, i) => (
                    <li
                      key={i}
                      className="text-sm text-zinc-300 pl-4 relative before:content-['\2022'] before:absolute before:left-0 before:text-zinc-500"
                    >
                      {cond}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="text-xs text-zinc-500 italic mt-3">
              Based on published program criteria. Actual terms are set by the
              court.
            </p>
          </div>
        </section>
      )}

      {/* Questions for Your Attorney */}
      {result.questions.length > 0 && (
        <section className="mb-8">
          <h3 className="text-lg font-semibold text-zinc-50 mb-3">
            Questions for Your Attorney
          </h3>
          <ol className="space-y-2 list-decimal list-inside">
            {result.questions.map((q, i) => (
              <li key={i} className="text-sm text-zinc-200 leading-relaxed">
                {q}
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

// --- Main component ------------------------------------------------

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

  useEffect(() => {
    if (!result && stepContainerRef.current) {
      const legend =
        stepContainerRef.current.querySelector<HTMLElement>("legend");
      legend?.focus();
    }
  }, [currentStep, result]);

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

  if (!steps) {
    return (
      <p role="alert" className="text-red-400">
        This calculator is not yet configured. Please check back soon.
      </p>
    );
  }

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const resolvedOptions = step.dynamicOptions
    ? step.dynamicOptions(answers)
    : step.options;
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

  // --- RESULTS VIEW ------------------------------------------------

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

        {isDiversionResult(slug, result) ? (
          <DiversionResults result={result} />
        ) : isVeteransCourtResult(slug, result) ? (
          <VeteransCourtResults result={result} />
        ) : (
          <>
            {(result as GoodTimeResult).supported === false ||
            !(result as GoodTimeResult).minimumServePercent ? (
              <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 mb-6">
                <p className="text-zinc-200">
                  {(result as GoodTimeResult).fallbackMessage ??
                    "We couldn\u2019t compute a result for this combination."}
                </p>
              </div>
            ) : (
              <>
                <dl className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <dt className="text-zinc-300 text-sm">
                      Minimum Serve Time
                    </dt>
                    <dd className="text-2xl font-bold text-zinc-50">
                      {(result as GoodTimeResult).minimumServePercent}%
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-300 text-sm">Estimated Serve</dt>
                    <dd className="text-2xl font-bold text-zinc-50">
                      {(result as GoodTimeResult).estimatedServeMonths} months
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-300 text-sm">
                      Potential Good Time Reduction
                    </dt>
                    <dd className="text-2xl font-bold text-green-400">
                      {(result as GoodTimeResult).estimatedCreditMonths ?? 0}{" "}
                      months
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-300 text-sm">
                      After Custody Credit
                    </dt>
                    <dd className="text-2xl font-bold text-blue-300">
                      {(result as GoodTimeResult).estimatedNetServeMonths}{" "}
                      months
                    </dd>
                  </div>
                </dl>

                <p className="text-xs text-zinc-400 mb-6">
                  Based on {(result as GoodTimeResult).ruleApplied} (
                  {(result as GoodTimeResult).statuteCitation})
                </p>

                <ul className="mb-6 space-y-3">
                  {(result as GoodTimeResult).observations.map((obs, i) => (
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
          </>
        )}

        {/* Start Over */}
        <div className="mt-6 mb-2">
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setCurrentStep(0);
              setAnswers({});
              setError(null);
              setSaved(false);
              setSaveEmail("");
              setSaveError(null);
            }}
            className="text-sm text-zinc-400 hover:text-zinc-200 underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 rounded"
          >
            Start over with different answers
          </button>
        </div>

        {/* Email save (post-value) */}
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

        {/* Upsell CTA */}
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

  // --- WIZARD VIEW -------------------------------------------------

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
        <legend
          tabIndex={-1}
          className="text-xl font-semibold mb-4 text-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 rounded"
        >
          {step.label}
        </legend>
        {step.helpText && (
          <p id={`help-${step.id}`} className="text-zinc-300 text-sm mb-4">
            {step.helpText}
          </p>
        )}

        {step.type === "select" && resolvedOptions && (
          <div
            className="space-y-2"
            {...(step.dynamicOptions ? { "aria-live": "polite" as const } : {})}
          >
            {resolvedOptions.map((opt) => {
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

        {step.type === "dropdown" && resolvedOptions && (
          <div
            {...(step.dynamicOptions ? { "aria-live": "polite" as const } : {})}
          >
            <select
              value={
                typeof answers[step.id] === "string"
                  ? (answers[step.id] as string)
                  : ""
              }
              onChange={(e) =>
                setAnswers((a) => ({ ...a, [step.id]: e.target.value }))
              }
              aria-label={step.label}
              aria-describedby={
                step.helpText ? `help-${step.id}` : undefined
              }
              className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-4 py-3 text-lg text-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
            >
              <option value="" disabled>
                Select…
              </option>
              {resolvedOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {step.type === "number" && (
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            aria-label={step.label}
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
            aria-label={step.label}
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
          {loading ? "Calculating\u2026" : isLastStep ? "Calculate" : "Next"}
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

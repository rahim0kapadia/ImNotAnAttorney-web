"use client";

/**
 * @fileoverview Calculator Wizard, multi-step client component.
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
import { TIER_CORE, type TierSlug } from "@/lib/tiers";

// --- Step definitions (one array per calculator slug) ---------------

interface StepOption {
  value: string;
  label: string;
}

type AnswerValue = string | number;

interface Step {
  id: string;
  label: string;
  type: "select" | "dropdown" | "number" | "date" | "text";
  options?: StepOption[];
  dynamicOptions?: (answers: Record<string, AnswerValue>) => StepOption[];
  placeholder?: string;
  helpText?: string;
  optional?: boolean;
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

// --- Federal sentencing calculator steps (all 50 states + DC) ---------

const FEDERAL_STATES: StepOption[] = [
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

const SENTENCING_CALC_STEPS: Step[] = [
  {
    id: "state",
    label: "What state is your federal case in?",
    type: "dropdown",
    options: FEDERAL_STATES,
    helpText:
      "Not sure about district? Check your court papers for ‘U.S. District Court for the [X] District of [State].’ Data: USSC FY2001-2023.",
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
    id: "judgeName",
    label: "Judge name (optional)",
    type: "text",
    placeholder: "e.g., Amy Berman Jackson",
    helpText:
      "If you know the judge assigned to your case, we\u2019ll pull their specific sentencing data. Leave blank to see district-level data only.",
    optional: true,
  },
];

// --- Judge comparison wizard steps ------------------------------------

const JUDGE_COMPARISON_STEPS: Step[] = [
  {
    id: "judgeNameA",
    label: "First judge\u2019s name",
    type: "text",
    placeholder: "e.g., Amy Berman Jackson",
    helpText: "Federal judges only \u2014 1,126 judges in database.",
  },
  {
    id: "judgeNameB",
    label: "Second judge\u2019s name",
    type: "text",
    placeholder: "e.g., Royce Lamberth",
  },
];

const STEP_MAP: Record<string, Step[]> = {
  "good-time": GOOD_TIME_STEPS,
  "diversion-eligibility": DIVERSION_STEPS,
  "veterans-court": VETERANS_COURT_STEPS,
  "sentencing-calculator": SENTENCING_CALC_STEPS,
  "judge-comparison": JUDGE_COMPARISON_STEPS,
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

// --- Sentencing calculator result types --------------------------------

interface SentencingCalcResult {
  state: string;
  chargeType: string;
  federalOnly: boolean;
  districtPatterns: Array<{
    judge_name: string;
    district: string;
    total_cases: number;
    median_sentence_months: number | null;
    downward_departure_rate: number | null;
    upward_departure_rate: number | null;
  }>;
  chargeDistribution: {
    median_months: number | null;
    p25: number | null;
    p75: number | null;
    sample_size: number;
  } | null;
  judgePattern: {
    judge_name: string;
    total_cases: number;
    median_sentence_months: number | null;
    p25_sentence_months: number | null;
    p75_sentence_months: number | null;
    downward_departure_rate: number | null;
    upward_departure_rate: number | null;
  } | null;
  judgeDemographics: {
    judge_name: string;
    appointing_president: string | null;
    appointing_party: string | null;
    aba_rating: string | null;
    law_school: string | null;
    active_start: number | null;
    active_end: number | null;
  } | null;
  judgeName: string | null;
  dataSource: string;
  sourceUrl: string;
}

// --- Judge comparison result types ------------------------------------

interface JudgeComparisonJudgeData {
  searchName: string;
  found: boolean;
  demographics: {
    judge_name: string;
    district: string | null;
    appointing_president: string | null;
    appointing_party: string | null;
    aba_rating: string | null;
    law_school: string | null;
    gender: string | null;
    active_start: number | null;
    active_end: number | null;
  } | null;
  sentencingPattern: {
    total_cases: number;
    median_sentence_months: number | null;
    p25_sentence_months: number | null;
    p75_sentence_months: number | null;
    downward_departure_rate: number | null;
    upward_departure_rate: number | null;
  } | null;
  sentencingByRace: Array<{
    defendant_race: string;
    total_cases: number;
    median_sentence_months: number | null;
    guideline_departure_rate: number | null;
  }>;
}

interface JudgeComparisonResult {
  judgeA: JudgeComparisonJudgeData;
  judgeB: JudgeComparisonJudgeData;
  federalOnly: boolean;
  dataSource: string;
  sourceUrl: string;
}

type CalculatorResult =
  | GoodTimeResult
  | DiversionClientResult
  | VeteransCourtClientResult
  | SentencingCalcResult
  | JudgeComparisonResult;

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
                <p className="text-xs text-zinc-400 italic mb-2">
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
          <p className="text-xs text-zinc-400 border-t border-zinc-800 pt-4">
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
      {/* Court Availability, primary result */}
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
          <p className="text-xs text-zinc-400 italic mt-2">
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
            <p className="text-xs text-zinc-400 italic mt-3">
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

// --- Sentencing calculator type guard + renderer ----------------------

function isSentencingCalcResult(
  slug: string,
  _r: CalculatorResult,
): _r is SentencingCalcResult {
  return slug === "sentencing-calculator";
}

function fmtMo(v: number | null): string {
  return v !== null ? `${Number(v).toFixed(1)} mo` : "\u2014";
}

function fmtPct(v: number | null): string {
  return v !== null ? `${(Number(v) * 100).toFixed(1)}%` : "\u2014";
}

function SentencingCalcResults({ result }: { result: SentencingCalcResult }) {
  const hasData =
    result.districtPatterns.length > 0 || result.chargeDistribution !== null;

  if (!hasData) {
    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 mb-6">
        <p className="text-zinc-200">
          No federal sentencing data found for this state and charge
          combination. Try a different charge type or state.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Federal Courts Label */}
      <div className="mb-6 bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-3">
        <p className="text-sm text-blue-300">
          Federal courts only \u2014 data from 595,851 USSC sentencing records
          (FY2001-2023).{" "}
          <a
            href={result.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 hover:underline"
          >
            [source]
          </a>
        </p>
      </div>

      {/* Charge-level headline */}
      {result.chargeDistribution && (
        <section className="mb-8">
          <h3 className="text-lg font-semibold text-zinc-50 mb-3">
            Sentencing Range \u2014{" "}
            {result.chargeType.replace(/-/g, " ")}
          </h3>
          <dl className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <dt className="text-zinc-400 text-sm">Median Sentence</dt>
              <dd className="text-2xl font-bold text-zinc-50">
                {fmtMo(result.chargeDistribution.median_months)}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-400 text-sm">25th\u201375th Percentile</dt>
              <dd className="text-2xl font-bold text-zinc-50">
                {result.chargeDistribution.p25 !== null &&
                result.chargeDistribution.p75 !== null
                  ? `${Number(result.chargeDistribution.p25).toFixed(1)}\u2013${Number(result.chargeDistribution.p75).toFixed(1)} mo`
                  : "\u2014"}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-400 text-sm">Cases Analyzed</dt>
              <dd className="text-2xl font-bold text-amber-400">
                {result.chargeDistribution.sample_size.toLocaleString()}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {/* Judge-specific data */}
      {result.judgePattern && (
        <section className="mb-8">
          <h3 className="text-lg font-semibold text-zinc-50 mb-3">
            Judge: {result.judgePattern.judge_name}
          </h3>
          {result.judgeDemographics && (
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-5 mb-4">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {result.judgeDemographics.appointing_president && (
                  <>
                    <dt className="text-zinc-400">Appointed By</dt>
                    <dd className="text-zinc-100">
                      {result.judgeDemographics.appointing_president} (
                      {result.judgeDemographics.appointing_party ?? "Unknown"})
                    </dd>
                  </>
                )}
                {result.judgeDemographics.aba_rating && (
                  <>
                    <dt className="text-zinc-400">ABA Rating</dt>
                    <dd className="text-zinc-100">
                      {result.judgeDemographics.aba_rating}
                    </dd>
                  </>
                )}
                {result.judgeDemographics.law_school && (
                  <>
                    <dt className="text-zinc-400">Law School</dt>
                    <dd className="text-zinc-100">
                      {result.judgeDemographics.law_school}
                    </dd>
                  </>
                )}
                {result.judgeDemographics.active_start && (
                  <>
                    <dt className="text-zinc-400">Active</dt>
                    <dd className="text-zinc-100">
                      {result.judgeDemographics.active_start}\u2013
                      {result.judgeDemographics.active_end ?? "present"}
                    </dd>
                  </>
                )}
              </dl>
            </div>
          )}
          <dl className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 grid grid-cols-2 gap-4">
            <div>
              <dt className="text-zinc-400 text-sm">Total Cases</dt>
              <dd className="text-xl font-bold text-zinc-50">
                {result.judgePattern.total_cases.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-400 text-sm">Median Sentence</dt>
              <dd className="text-xl font-bold text-zinc-50">
                {fmtMo(result.judgePattern.median_sentence_months)}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-400 text-sm">Downward Departures</dt>
              <dd className="text-xl font-bold text-green-400">
                {fmtPct(result.judgePattern.downward_departure_rate)}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-400 text-sm">Upward Departures</dt>
              <dd className="text-xl font-bold text-red-400">
                {fmtPct(result.judgePattern.upward_departure_rate)}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {/* No judge found notice */}
      {result.judgeName && !result.judgePattern && (
        <div className="mb-8 bg-zinc-900 border border-zinc-700 rounded-lg p-5">
          <p className="text-zinc-300">
            No sentencing data found for &ldquo;{result.judgeName}&rdquo;. This
            database covers 1,126 federal judges. State court judges are not
            included.
          </p>
        </div>
      )}

      {/* District patterns table */}
      {result.districtPatterns.length > 0 && (
        <section className="mb-8">
          <h3 className="text-lg font-semibold text-zinc-50 mb-3">
            Federal Sentencing in {result.state}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-zinc-700">
                  <th className="text-left py-2 px-3 text-zinc-400 font-medium">
                    District
                  </th>
                  <th className="text-right py-2 px-3 text-zinc-400 font-medium">
                    Cases
                  </th>
                  <th className="text-right py-2 px-3 text-zinc-400 font-medium">
                    Median
                  </th>
                  <th className="text-right py-2 px-3 text-zinc-400 font-medium">
                    \u2193 Departures
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.districtPatterns.slice(0, 10).map((p, i) => (
                  <tr key={i} className="border-b border-zinc-800">
                    <td className="py-2 px-3 text-zinc-200">
                      {p.district ?? p.judge_name}
                    </td>
                    <td className="py-2 px-3 text-zinc-200 text-right">
                      {p.total_cases.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-zinc-200 text-right">
                      {fmtMo(p.median_sentence_months)}
                    </td>
                    <td className="py-2 px-3 text-zinc-200 text-right">
                      {fmtPct(p.downward_departure_rate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

// --- Judge comparison type guard + renderer ----------------------------

function isJudgeComparisonResult(
  slug: string,
  _r: CalculatorResult,
): _r is JudgeComparisonResult {
  return slug === "judge-comparison";
}

function JudgeComparisonResults({
  result,
}: {
  result: JudgeComparisonResult;
}) {
  const { judgeA, judgeB } = result;

  if (!judgeA.found && !judgeB.found) {
    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 mb-6">
        <p className="text-zinc-200">
          Neither judge was found in the federal database. This tool covers
          1,126 federal judges (JUSTFAIR/USSC). State court judges are not
          included.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Federal Courts Label */}
      <div className="mb-6 bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-3">
        <p className="text-sm text-blue-300">
          Federal courts only \u2014 1,126 judges from JUSTFAIR/USSC
          (FY2001-2023).{" "}
          <a
            href={result.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 hover:underline"
          >
            [source]
          </a>
        </p>
      </div>

      {/* Not found warnings */}
      {!judgeA.found && (
        <div className="mb-4 bg-zinc-900 border border-amber-800/40 rounded-lg p-4">
          <p className="text-sm text-amber-300">
            &ldquo;{judgeA.searchName}&rdquo; not found in federal database.
          </p>
        </div>
      )}
      {!judgeB.found && (
        <div className="mb-4 bg-zinc-900 border border-amber-800/40 rounded-lg p-4">
          <p className="text-sm text-amber-300">
            &ldquo;{judgeB.searchName}&rdquo; not found in federal database.
          </p>
        </div>
      )}

      {/* Side-by-side sentencing comparison */}
      {(judgeA.sentencingPattern || judgeB.sentencingPattern) && (
        <section className="mb-8">
          <h3 className="text-lg font-semibold text-zinc-50 mb-3">
            Sentencing Comparison
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-zinc-700">
                  <th className="text-left py-2 px-3 text-zinc-400 font-medium" />
                  <th className="text-right py-2 px-3 text-amber-400 font-medium">
                    {judgeA.demographics?.judge_name ?? judgeA.searchName}
                  </th>
                  <th className="text-right py-2 px-3 text-blue-400 font-medium">
                    {judgeB.demographics?.judge_name ?? judgeB.searchName}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-zinc-800">
                  <td className="py-2 px-3 text-zinc-400">Total Cases</td>
                  <td className="py-2 px-3 text-zinc-200 text-right">
                    {judgeA.sentencingPattern?.total_cases?.toLocaleString() ??
                      "\u2014"}
                  </td>
                  <td className="py-2 px-3 text-zinc-200 text-right">
                    {judgeB.sentencingPattern?.total_cases?.toLocaleString() ??
                      "\u2014"}
                  </td>
                </tr>
                <tr className="border-b border-zinc-800">
                  <td className="py-2 px-3 text-zinc-400">Median Sentence</td>
                  <td className="py-2 px-3 text-zinc-200 text-right">
                    {fmtMo(
                      judgeA.sentencingPattern?.median_sentence_months ?? null,
                    )}
                  </td>
                  <td className="py-2 px-3 text-zinc-200 text-right">
                    {fmtMo(
                      judgeB.sentencingPattern?.median_sentence_months ?? null,
                    )}
                  </td>
                </tr>
                <tr className="border-b border-zinc-800">
                  <td className="py-2 px-3 text-zinc-400">
                    Range (P25\u2013P75)
                  </td>
                  <td className="py-2 px-3 text-zinc-200 text-right">
                    {judgeA.sentencingPattern
                      ? `${fmtMo(judgeA.sentencingPattern.p25_sentence_months)} \u2013 ${fmtMo(judgeA.sentencingPattern.p75_sentence_months)}`
                      : "\u2014"}
                  </td>
                  <td className="py-2 px-3 text-zinc-200 text-right">
                    {judgeB.sentencingPattern
                      ? `${fmtMo(judgeB.sentencingPattern.p25_sentence_months)} \u2013 ${fmtMo(judgeB.sentencingPattern.p75_sentence_months)}`
                      : "\u2014"}
                  </td>
                </tr>
                <tr className="border-b border-zinc-800">
                  <td className="py-2 px-3 text-zinc-400">
                    Downward Departures
                  </td>
                  <td className="py-2 px-3 text-green-400 text-right">
                    {fmtPct(
                      judgeA.sentencingPattern?.downward_departure_rate ?? null,
                    )}
                  </td>
                  <td className="py-2 px-3 text-green-400 text-right">
                    {fmtPct(
                      judgeB.sentencingPattern?.downward_departure_rate ?? null,
                    )}
                  </td>
                </tr>
                <tr className="border-b border-zinc-800">
                  <td className="py-2 px-3 text-zinc-400">
                    Upward Departures
                  </td>
                  <td className="py-2 px-3 text-red-400 text-right">
                    {fmtPct(
                      judgeA.sentencingPattern?.upward_departure_rate ?? null,
                    )}
                  </td>
                  <td className="py-2 px-3 text-red-400 text-right">
                    {fmtPct(
                      judgeB.sentencingPattern?.upward_departure_rate ?? null,
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Side-by-side demographics */}
      {(judgeA.demographics || judgeB.demographics) && (
        <section className="mb-8">
          <h3 className="text-lg font-semibold text-zinc-50 mb-3">
            Judge Background
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[judgeA, judgeB].map((judge, idx) => (
              <div
                key={idx}
                className="bg-zinc-900 border border-zinc-700 rounded-lg p-5"
              >
                <h4
                  className={`font-medium mb-3 ${idx === 0 ? "text-amber-400" : "text-blue-400"}`}
                >
                  {judge.demographics?.judge_name ?? judge.searchName}
                </h4>
                {judge.demographics ? (
                  <dl className="space-y-2 text-sm">
                    {judge.demographics.appointing_president && (
                      <div className="flex justify-between">
                        <dt className="text-zinc-400">Appointed By</dt>
                        <dd className="text-zinc-100">
                          {judge.demographics.appointing_president} (
                          {judge.demographics.appointing_party ?? "?"})
                        </dd>
                      </div>
                    )}
                    {judge.demographics.aba_rating && (
                      <div className="flex justify-between">
                        <dt className="text-zinc-400">ABA Rating</dt>
                        <dd className="text-zinc-100">
                          {judge.demographics.aba_rating}
                        </dd>
                      </div>
                    )}
                    {judge.demographics.law_school && (
                      <div className="flex justify-between">
                        <dt className="text-zinc-400">Law School</dt>
                        <dd className="text-zinc-100">
                          {judge.demographics.law_school}
                        </dd>
                      </div>
                    )}
                    {judge.demographics.gender && (
                      <div className="flex justify-between">
                        <dt className="text-zinc-400">Gender</dt>
                        <dd className="text-zinc-100">
                          {judge.demographics.gender}
                        </dd>
                      </div>
                    )}
                    {judge.demographics.active_start && (
                      <div className="flex justify-between">
                        <dt className="text-zinc-400">Active</dt>
                        <dd className="text-zinc-100">
                          {judge.demographics.active_start}\u2013
                          {judge.demographics.active_end ?? "present"}
                        </dd>
                      </div>
                    )}
                  </dl>
                ) : (
                  <p className="text-sm text-zinc-500">
                    Not found in federal database
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Racial disparity data */}
      {(judgeA.sentencingByRace.length > 0 ||
        judgeB.sentencingByRace.length > 0) && (
        <section className="mb-8">
          <h3 className="text-lg font-semibold text-zinc-50 mb-3">
            Sentencing by Defendant Demographics
          </h3>
          <p className="text-xs text-zinc-400 mb-3">
            Factual sentencing data by defendant race. No editorial
            interpretation.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[judgeA, judgeB].map((judge, idx) => (
              <div
                key={idx}
                className="bg-zinc-900 border border-zinc-700 rounded-lg p-5"
              >
                <h4
                  className={`font-medium mb-3 text-sm ${idx === 0 ? "text-amber-400" : "text-blue-400"}`}
                >
                  {judge.demographics?.judge_name ?? judge.searchName}
                </h4>
                {judge.sentencingByRace.length > 0 ? (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-700">
                        <th className="text-left py-1 text-zinc-400">Race</th>
                        <th className="text-right py-1 text-zinc-400">
                          Cases
                        </th>
                        <th className="text-right py-1 text-zinc-400">
                          Median
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {judge.sentencingByRace.map((row, ri) => (
                        <tr key={ri} className="border-b border-zinc-800">
                          <td className="py-1 text-zinc-200">
                            {row.defendant_race}
                          </td>
                          <td className="py-1 text-zinc-200 text-right">
                            {row.total_cases.toLocaleString()}
                          </td>
                          <td className="py-1 text-zinc-200 text-right">
                            {fmtMo(row.median_sentence_months)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-zinc-500">
                    No demographic data available
                  </p>
                )}
              </div>
            ))}
          </div>
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
            : "Calculation failed, please check your inputs and try again.",
        );
        return;
      }
      setResult(data.result as CalculatorResult);
    } catch {
      setError("Network error, please try again.");
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
            : "Could not save, please try again.",
        );
      }
    } catch {
      setSaveError("Network error, please try again.");
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
    step.optional ||
    (currentAnswer !== undefined &&
      currentAnswer !== "" &&
      !(typeof currentAnswer === "number" && Number.isNaN(currentAnswer)));

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

        {isSentencingCalcResult(slug, result) ? (
          <SentencingCalcResults result={result} />
        ) : isJudgeComparisonResult(slug, result) ? (
          <JudgeComparisonResults result={result} />
        ) : isDiversionResult(slug, result) ? (
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

        {/* Upsell CTA — placed at peak-value moment (Wiebe price-drop) */}
        {product.upsellTier && product.upsellText && TIER_CORE[product.upsellTier as TierSlug] && (
          <div
            data-upsell-bridge
            className="mt-8 border border-amber-500/30 bg-amber-500/5 rounded-lg p-6"
          >
            <p className="text-zinc-200 mb-4">{product.upsellText}</p>
            <a
              href={`/checkout?tier=${product.upsellTier}`}
              className="inline-block bg-amber-500 hover:bg-amber-400 text-zinc-950 px-6 py-3 rounded-lg font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
            >
              Get the {TIER_CORE[product.upsellTier as TierSlug].name} &mdash; {TIER_CORE[product.upsellTier as TierSlug].priceDisplay} &rarr;
            </a>
          </div>
        )}

        {/* Email save (secondary — ghost style so it loses against upsell) */}
        {!saved ? (
          <div className="mt-6 bg-zinc-900 border border-zinc-700 rounded-lg p-6">
            <h3 className="font-semibold mb-2 text-zinc-50">
              Save these results for later
            </h3>
            <p className="text-zinc-300 text-sm mb-4">
              Get a permanent link we can email to you.
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
                className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-3 py-3 text-zinc-50 placeholder:text-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
              />
              <button
                type="button"
                onClick={handleSaveResults}
                disabled={!saveEmail}
                className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-100 px-6 py-3 rounded font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
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
            className="mt-6 bg-green-900/30 border border-green-600 rounded-lg p-6"
            role="status"
          >
            <p className="text-green-200">
              Saved. Check your email for the permanent link.
            </p>
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

        {step.type === "text" && (
          <input
            type="text"
            autoComplete="off"
            aria-label={step.label}
            placeholder={step.placeholder}
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
            className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-4 py-3 text-lg text-zinc-50 placeholder:text-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
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

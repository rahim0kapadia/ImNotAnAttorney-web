/**
 * @fileoverview Good Time Credit Calculator, pure computation logic.
 *
 * Pattern: identical to score.ts. Pure functions, no API/DB dependencies.
 * Takes form inputs + loaded state rules → computed result.
 *
 * The rules data is loaded from system-data/good-time-rules.json at build
 * time (imported as JSON). The source of truth for that file lives in the
 * ImNotAnAttorney business repo at system/data/good-time-rules.json, the
 * web repo keeps a committed mirror so Vercel builds can resolve the import
 * without needing the sibling repo.
 */

import goodTimeRules from "@/../system-data/good-time-rules.json";
import diversionRules from "@/../system-data/diversion-programs.json";
import veteransCourtData from "@/../system-data/veterans-courts.json";

// ─── Types ──────────────────────────────────────────────────────

export interface GoodTimeInput {
  state: string; // 2-letter state code
  chargeType: string; // charge slug
  sentenceMonths: number; // total sentence in months
  custodyCredits: number; // days already served (jail time credit)
  prisonType: string; // "state" | "federal" | "county"
  offenseDate: string; // ISO date, determines which rules apply
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface GoodTimeResult {
  supported: boolean;
  stateName?: string;
  minimumServePercent?: number;
  estimatedServeMonths?: number;
  estimatedCreditMonths?: number;
  estimatedNetServeMonths?: number;
  custodyCreditDays: number;
  estimatedReleaseRange?: string;
  statuteCitation?: string;
  ruleApplied?: string;
  notes?: string[];
  observations: string[];
  fallbackMessage?: string;
}

interface StateRule {
  name: string;
  statute: string;
  applies_to: string;
  credit_rate: string;
  max_gain_time: string;
  eligible_credits: string[];
  disqualifiers: string[];
  calculation_formula: string;
  notes: string;
}

interface StateData {
  state_name: string;
  rules: StateRule[];
}

type RulesFile = Record<string, StateData | unknown>;

// ─── Supported states (from data file) ─────────────────────────

const RULES = goodTimeRules as RulesFile;

const SUPPORTED_STATES = new Set(
  Object.keys(RULES).filter((k) => k !== "_metadata"),
);

// ─── Validation ────────────────────────────────────────────────

export function validateGoodTimeInput(
  input: GoodTimeInput,
): ValidationResult {
  const errors: string[] = [];

  if (!input.state) {
    errors.push("State is required");
  } else if (input.state.length !== 2) {
    errors.push("State must be a 2-letter code");
  } else if (!SUPPORTED_STATES.has(input.state.toUpperCase())) {
    errors.push(
      `Good time credit rules for ${input.state} are not yet in our database`,
    );
  }

  if (!input.chargeType) {
    errors.push("Charge type is required");
  }
  if (
    typeof input.sentenceMonths !== "number" ||
    input.sentenceMonths <= 0 ||
    !Number.isFinite(input.sentenceMonths)
  ) {
    errors.push("Sentence length must be a positive number");
  }
  if (
    typeof input.custodyCredits !== "number" ||
    input.custodyCredits < 0 ||
    !Number.isFinite(input.custodyCredits)
  ) {
    errors.push("Custody credits cannot be negative");
  }
  if (!input.offenseDate) {
    errors.push("Offense date is required");
  }

  return { valid: errors.length === 0, errors };
}

// ─── Calculation ───────────────────────────────────────────────

const FALLBACK_UNSUPPORTED_STATE = (stateCode: string): string =>
  `Good time credit rules for ${stateCode} are not yet in our database. Your state's Department of Corrections website publishes these rules, or this is a question worth raising with your attorney.`;

export function calculateGoodTime(input: GoodTimeInput): GoodTimeResult {
  const stateCode = (input.state || "").toUpperCase();
  const stateData = RULES[stateCode] as StateData | undefined;

  if (!stateData || !stateData.rules || stateData.rules.length === 0) {
    return {
      supported: false,
      custodyCreditDays: input.custodyCredits ?? 0,
      observations: [],
      fallbackMessage: FALLBACK_UNSUPPORTED_STATE(stateCode || "your state"),
    };
  }

  // Use the first (primary) rule. The JSON is ordered so the most common
  // rule for the serious-case defendant audience comes first.
  const rule = stateData.rules[0];
  const servePercent = parseServePercent(rule.credit_rate);

  if (servePercent === null) {
    // Unparseable rate, never silently default. Treat as unsupported.
    return {
      supported: false,
      custodyCreditDays: input.custodyCredits ?? 0,
      observations: [],
      fallbackMessage: `Good time credit rules for ${stateData.state_name} could not be parsed from our database. This is a question worth raising with your attorney.`,
    };
  }

  const estimatedServeMonths = Math.ceil(
    input.sentenceMonths * (servePercent / 100),
  );
  const estimatedCreditMonths = input.sentenceMonths - estimatedServeMonths;
  const custodyCreditMonths = Math.floor(input.custodyCredits / 30);
  const estimatedNetServeMonths = Math.max(
    0,
    estimatedServeMonths - custodyCreditMonths,
  );

  const observations: string[] = [];
  observations.push(
    `In ${stateData.state_name}, the ${rule.name} requires serving at least ${servePercent}% of the sentence imposed.`,
  );
  observations.push(
    `On a ${input.sentenceMonths}-month sentence, that is approximately ${estimatedServeMonths} months minimum before good time credit could apply.`,
  );
  if (input.custodyCredits > 0) {
    observations.push(
      `Your ${input.custodyCredits} days of custody credit (about ${custodyCreditMonths} months) reduce the remaining time to be served.`,
    );
  }
  if (estimatedCreditMonths > 0) {
    observations.push(
      `Maximum potential good time reduction: approximately ${estimatedCreditMonths} months, and only if every credit-earning requirement is met.`,
    );
  } else {
    observations.push(
      `This jurisdiction provides little or no good time credit for the applicable rule. Understanding this early helps you and your attorney focus on other strategies, sentence modification, alternative programs, or other paths that may be available for your situation.`,
    );
  }
  observations.push(
    "This is an estimate based on published state rules. Actual release dates depend on institutional behavior, program participation, and classification decisions, and this is legal INFORMATION, not legal ADVICE.",
  );

  return {
    supported: true,
    stateName: stateData.state_name,
    minimumServePercent: servePercent,
    estimatedServeMonths,
    estimatedCreditMonths,
    estimatedNetServeMonths,
    custodyCreditDays: input.custodyCredits,
    estimatedReleaseRange: `${estimatedNetServeMonths}-${estimatedServeMonths} months`,
    statuteCitation: rule.statute,
    ruleApplied: rule.name,
    notes: rule.disqualifiers,
    observations,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Diversion Eligibility Calculator
// ═══════════════════════════════════════════════════════════════════

export interface DiversionInput {
  state: string;
  county: string;
  chargeType: string;
  chargeCategory: string; // "felony" | "misdemeanor"
  priorConvictions: string; // "none" | "misdemeanor" | "felony" | "multiple"
  priorDiversion: string; // "yes" | "no"
  chargeInvolves: string; // "violence" | "firearms" | "sexual" | "trafficking" | "none"
  isVeteran: string; // "yes" | "no"
  substanceAbuse: string; // "yes" | "no"
  mentalHealthDiagnosis: string; // "yes" | "no"
}

export interface DiversionProgramAssessment {
  programName: string;
  programKey: string;
  statute: string | null;
  eligibility:
    | "LIKELY_ELIGIBLE"
    | "POSSIBLY_ELIGIBLE"
    | "LIKELY_INELIGIBLE"
    | "NOT_APPLICABLE";
  reasons: string[];
  description: string;
  typicalDuration: string | null;
  completionResult: string | null;
}

export interface DiversionResult {
  supported: boolean;
  stateName: string;
  county: string;
  programs: DiversionProgramAssessment[];
  disqualifiersIdentified: string[];
  questions: string[];
  countyNote: string;
  fallbackMessage?: string;
}

// ─── Diversion, supported states ─────────────────────────────

interface DiversionProgram {
  name: string;
  statute?: string;
  description: string;
  eligible_charges?: string | string[];
  general_eligibility?: string[];
  disqualifiers?: string[];
  completion_result?: string;
  typical_duration?: string;
  county_variation?: string;
  max_sentence?: string;
  note?: string;
}

interface DiversionStateData {
  state_name: string;
  programs: Record<string, DiversionProgram>;
  substantial_assistance?: unknown;
}

type DiversionFile = {
  _metadata: unknown;
} & Record<string, DiversionStateData | unknown>;

const DIVERSION_RULES = diversionRules as unknown as DiversionFile;

const DIVERSION_SUPPORTED_STATES = new Set(
  Object.keys(DIVERSION_RULES).filter((k) => k !== "_metadata"),
);

// ─── Diversion, validation ──────────────────────────────────

export function validateDiversionInput(
  input: DiversionInput,
): ValidationResult {
  const errors: string[] = [];

  if (!input.state) {
    errors.push("State is required");
  } else if (!DIVERSION_SUPPORTED_STATES.has(input.state.toUpperCase())) {
    errors.push(
      `Diversion program data for ${input.state} is not yet in our database`,
    );
  }
  if (!input.county) errors.push("County is required");
  if (!input.chargeType) errors.push("Charge type is required");
  if (!input.chargeCategory) errors.push("Charge category is required");
  if (!input.priorConvictions) errors.push("Prior convictions is required");
  if (!input.priorDiversion) errors.push("Prior diversion is required");
  if (!input.chargeInvolves)
    errors.push("Charge involvement category is required");
  if (!input.isVeteran) errors.push("Veteran status is required");
  if (!input.substanceAbuse) errors.push("Substance abuse history is required");
  if (!input.mentalHealthDiagnosis)
    errors.push("Mental health diagnosis is required");

  return { valid: errors.length === 0, errors };
}

// ─── Diversion, per-program eligibility evaluators ──────────

function evaluatePTIFelony(input: DiversionInput): DiversionProgramAssessment {
  const reasons: string[] = [];
  let eligibility: DiversionProgramAssessment["eligibility"] =
    "LIKELY_ELIGIBLE";

  if (input.chargeCategory !== "felony") {
    return {
      programName: "Pretrial Intervention Program (PTI), Felony",
      programKey: "pretrial_intervention_felony",
      statute: "F.S. § 948.08",
      eligibility: "NOT_APPLICABLE",
      reasons: ["This program applies to felony charges only."],
      description:
        "Diversion program allowing eligible defendants to avoid prosecution by completing supervision and conditions.",
      typicalDuration: "6-12 months",
      completionResult:
        "Charges dismissed (nolle prosequi) upon successful completion",
    };
  }

  if (
    input.priorConvictions === "felony" ||
    input.priorConvictions === "multiple"
  ) {
    eligibility = "LIKELY_INELIGIBLE";
    reasons.push(
      "Prior felony convictions generally disqualify from felony PTI.",
    );
  }
  if (input.priorDiversion === "yes") {
    eligibility = "LIKELY_INELIGIBLE";
    reasons.push("Prior PTI participation is typically disqualifying.");
  }
  if (input.chargeInvolves === "sexual") {
    eligibility = "LIKELY_INELIGIBLE";
    reasons.push("Sex offenses are generally excluded from PTI.");
  }
  if (input.chargeInvolves === "trafficking") {
    eligibility = "LIKELY_INELIGIBLE";
    reasons.push(
      "Trafficking charges are generally ineligible without special State Attorney approval.",
    );
  }
  if (input.chargeType === "dui") {
    eligibility = "LIKELY_INELIGIBLE";
    reasons.push("DUI has a separate diversion process, not standard PTI.");
  }
  if (
    input.chargeInvolves === "violence" ||
    input.chargeInvolves === "firearms"
  ) {
    if (eligibility === "LIKELY_ELIGIBLE") eligibility = "POSSIBLY_ELIGIBLE";
    reasons.push(
      `Charges involving ${input.chargeInvolves} may be evaluated differently by the State Attorney's office, eligibility varies by judicial circuit.`,
    );
  }

  if (eligibility === "LIKELY_ELIGIBLE" && reasons.length === 0) {
    reasons.push(
      "Based on the published criteria, this charge category and history may meet general PTI eligibility requirements. Victim and State Attorney consent are required.",
    );
  }

  return {
    programName: "Pretrial Intervention Program (PTI), Felony",
    programKey: "pretrial_intervention_felony",
    statute: "F.S. § 948.08",
    eligibility,
    reasons,
    description:
      "Diversion program allowing eligible defendants to avoid prosecution by completing supervision and conditions.",
    typicalDuration: "6-12 months",
    completionResult:
      "Charges dismissed (nolle prosequi) upon successful completion",
  };
}

function evaluatePTIMisdemeanor(
  input: DiversionInput,
): DiversionProgramAssessment {
  const reasons: string[] = [];
  let eligibility: DiversionProgramAssessment["eligibility"] =
    "LIKELY_ELIGIBLE";

  if (input.chargeCategory !== "misdemeanor") {
    return {
      programName: "Misdemeanor Pretrial Intervention",
      programKey: "pretrial_intervention_misdemeanor",
      statute: "F.S. § 948.16",
      eligibility: "NOT_APPLICABLE",
      reasons: ["This program applies to misdemeanor charges only."],
      description: "Similar to felony PTI but for misdemeanor charges.",
      typicalDuration: "3-6 months",
      completionResult: "Charges dismissed upon successful completion",
    };
  }

  if (input.priorConvictions !== "none") {
    eligibility = "LIKELY_INELIGIBLE";
    reasons.push(
      "Misdemeanor PTI generally requires no prior convictions of any kind.",
    );
  }
  if (input.priorDiversion === "yes") {
    eligibility = "LIKELY_INELIGIBLE";
    reasons.push("Prior diversion participation is typically disqualifying.");
  }

  if (eligibility === "LIKELY_ELIGIBLE" && reasons.length === 0) {
    reasons.push(
      "Based on the published criteria, first-time misdemeanor defendants may meet general eligibility requirements.",
    );
  }

  return {
    programName: "Misdemeanor Pretrial Intervention",
    programKey: "pretrial_intervention_misdemeanor",
    statute: "F.S. § 948.16",
    eligibility,
    reasons,
    description: "Similar to felony PTI but for misdemeanor charges.",
    typicalDuration: "3-6 months",
    completionResult: "Charges dismissed upon successful completion",
  };
}

function evaluateDrugCourt(input: DiversionInput): DiversionProgramAssessment {
  const reasons: string[] = [];
  let eligibility: DiversionProgramAssessment["eligibility"] =
    "LIKELY_ELIGIBLE";

  const isDrugRelated =
    input.chargeType === "drug-possession" ||
    input.chargeType === "drug-trafficking";
  if (!isDrugRelated && input.substanceAbuse !== "yes") {
    return {
      programName: "Drug Court / Treatment-Based Drug Court Program",
      programKey: "drug_court",
      statute: "F.S. § 397.334",
      eligibility: "NOT_APPLICABLE",
      reasons: [
        "Drug court applies to substance-abuse-related offenses or defendants with substance abuse history.",
      ],
      description:
        "Intensive treatment program as alternative to incarceration for substance abuse-related offenses.",
      typicalDuration: "12-18 months",
      completionResult:
        "Varies by circuit, may result in charges dismissed, reduced charges, or reduced sentence",
    };
  }

  if (input.chargeType === "drug-trafficking") {
    eligibility = "LIKELY_INELIGIBLE";
    reasons.push(
      "Drug trafficking charges are generally NOT eligible, trafficking penalties are statutory mandatory minimums.",
    );
  }
  if (input.chargeInvolves === "violence") {
    eligibility = "LIKELY_INELIGIBLE";
    reasons.push("Violent felonies are generally excluded from drug court.");
  }
  if (input.chargeInvolves === "sexual") {
    eligibility = "LIKELY_INELIGIBLE";
    reasons.push("Sex offenses are generally excluded from drug court.");
  }
  if (input.substanceAbuse !== "yes" && isDrugRelated) {
    if (eligibility === "LIKELY_ELIGIBLE") eligibility = "POSSIBLY_ELIGIBLE";
    reasons.push(
      "Drug court typically requires a diagnosed substance abuse disorder. The charge is drug-related, but no substance abuse history was indicated.",
    );
  }

  if (eligibility === "LIKELY_ELIGIBLE" && reasons.length === 0) {
    reasons.push(
      "Based on the published criteria, this charge type and substance abuse history may meet drug court eligibility. Willingness to participate in treatment is required.",
    );
  }

  return {
    programName: "Drug Court / Treatment-Based Drug Court Program",
    programKey: "drug_court",
    statute: "F.S. § 397.334",
    eligibility,
    reasons,
    description:
      "Intensive treatment program as alternative to incarceration for substance abuse-related offenses.",
    typicalDuration: "12-18 months",
    completionResult:
      "Varies by circuit, may result in charges dismissed, reduced charges, or reduced sentence",
  };
}

function evaluateVeteransCourt(
  input: DiversionInput,
): DiversionProgramAssessment {
  const reasons: string[] = [];
  let eligibility: DiversionProgramAssessment["eligibility"] =
    "LIKELY_ELIGIBLE";

  if (input.isVeteran !== "yes") {
    return {
      programName: "Veterans Treatment Court",
      programKey: "veterans_treatment_court",
      statute: "F.S. § 394.47891 / F.S. § 948.08(7)",
      eligibility: "NOT_APPLICABLE",
      reasons: [
        "Veterans treatment court is available to veterans and active duty service members.",
      ],
      description:
        "Specialized court for veterans with service-connected mental health or substance abuse issues.",
      typicalDuration: null,
      completionResult:
        "Varies, may include charge dismissal, reduced charges, or alternative sentencing",
    };
  }

  if (
    input.chargeInvolves === "violence" ||
    input.chargeInvolves === "sexual"
  ) {
    if (eligibility === "LIKELY_ELIGIBLE") eligibility = "POSSIBLY_ELIGIBLE";
    reasons.push(
      `Charges involving ${input.chargeInvolves} may limit veterans court eligibility, varies by judicial circuit.`,
    );
  }

  if (eligibility === "LIKELY_ELIGIBLE" && reasons.length === 0) {
    reasons.push(
      "Based on the published criteria, veterans with service-connected conditions may meet eligibility. VA treatment eligibility and non-violent offense status strengthen the case.",
    );
  }

  return {
    programName: "Veterans Treatment Court",
    programKey: "veterans_treatment_court",
    statute: "F.S. § 394.47891 / F.S. § 948.08(7)",
    eligibility,
    reasons,
    description:
      "Specialized court for veterans with service-connected mental health or substance abuse issues.",
    typicalDuration: null,
    completionResult:
      "Varies, may include charge dismissal, reduced charges, or alternative sentencing",
  };
}

function evaluateMentalHealthCourt(
  input: DiversionInput,
): DiversionProgramAssessment {
  const reasons: string[] = [];
  let eligibility: DiversionProgramAssessment["eligibility"] =
    "LIKELY_ELIGIBLE";

  if (input.mentalHealthDiagnosis !== "yes") {
    return {
      programName: "Mental Health Court",
      programKey: "mental_health_court",
      statute: "F.S. § 394.47891",
      eligibility: "NOT_APPLICABLE",
      reasons: [
        "Mental health court requires a diagnosed mental health condition as a contributing factor to the offense.",
      ],
      description:
        "Specialized court for defendants with diagnosed mental health conditions.",
      typicalDuration: null,
      completionResult: "Varies by circuit",
    };
  }

  if (
    input.chargeInvolves === "violence" ||
    input.chargeInvolves === "sexual"
  ) {
    if (eligibility === "LIKELY_ELIGIBLE") eligibility = "POSSIBLY_ELIGIBLE";
    reasons.push(
      `Charges involving ${input.chargeInvolves} may affect eligibility, varies by judicial circuit.`,
    );
  }

  if (eligibility === "LIKELY_ELIGIBLE" && reasons.length === 0) {
    reasons.push(
      "Based on the published criteria, defendants with a diagnosed mental health condition connected to the offense may meet eligibility. Willingness to participate in treatment is required.",
    );
  }

  return {
    programName: "Mental Health Court",
    programKey: "mental_health_court",
    statute: "F.S. § 394.47891",
    eligibility,
    reasons,
    description:
      "Specialized court for defendants with diagnosed mental health conditions.",
    typicalDuration: null,
    completionResult: "Varies by circuit",
  };
}

function evaluateDUIDiversion(
  input: DiversionInput,
): DiversionProgramAssessment {
  const reasons: string[] = [];
  let eligibility: DiversionProgramAssessment["eligibility"] =
    "LIKELY_ELIGIBLE";

  if (input.chargeType !== "dui") {
    return {
      programName: "DUI Diversion / First-Time DUI Program",
      programKey: "dui_diversion",
      statute: null,
      eligibility: "NOT_APPLICABLE",
      reasons: ["DUI diversion programs apply to DUI charges only."],
      description:
        "Alternative to standard DUI prosecution for first-time offenders.",
      typicalDuration: null,
      completionResult:
        "Charges reduced or dismissed (varies by circuit)",
    };
  }

  if (
    input.priorConvictions === "felony" ||
    input.priorConvictions === "multiple"
  ) {
    eligibility = "LIKELY_INELIGIBLE";
    reasons.push("Prior DUI or felony convictions generally disqualify.");
  }
  if (input.chargeInvolves === "violence") {
    eligibility = "LIKELY_INELIGIBLE";
    reasons.push(
      "DUI with injury to another person is generally not eligible for diversion.",
    );
  }

  if (eligibility === "LIKELY_ELIGIBLE") {
    eligibility = "POSSIBLY_ELIGIBLE";
    reasons.push(
      "DUI diversion is NOT available in all Florida counties. Many circuits do NOT offer DUI diversion, county-specific availability must be confirmed.",
    );
  }
  if (reasons.length === 0) {
    reasons.push(
      "First-time DUI offenders without aggravating factors may qualify where programs exist.",
    );
  }

  return {
    programName: "DUI Diversion / First-Time DUI Program",
    programKey: "dui_diversion",
    statute: null,
    eligibility,
    reasons,
    description:
      "Alternative to standard DUI prosecution for first-time offenders.",
    typicalDuration: null,
    completionResult:
      "Charges reduced or dismissed (varies by circuit)",
  };
}

// ─── Diversion, question generation ─────────────────────────

function generateDiversionQuestions(
  programs: DiversionProgramAssessment[],
): string[] {
  const questions: string[] = [];
  const eligible = programs.filter(
    (p) =>
      p.eligibility === "LIKELY_ELIGIBLE" ||
      p.eligibility === "POSSIBLY_ELIGIBLE",
  );

  if (eligible.some((p) => p.programKey.startsWith("pretrial_intervention"))) {
    questions.push(
      "Has the State Attorney's office been approached about pretrial intervention eligibility for this case?",
    );
    questions.push(
      "What is the timeline and process for applying to PTI in this judicial circuit?",
    );
  }
  if (eligible.some((p) => p.programKey === "drug_court")) {
    questions.push(
      "Is drug court an option given this charge type and history?",
    );
    questions.push(
      "What treatment programs are required as part of drug court participation?",
    );
  }
  if (eligible.some((p) => p.programKey === "veterans_treatment_court")) {
    questions.push(
      "Is there a Veterans Justice Outreach (VJO) specialist assigned to this court?",
    );
    questions.push(
      "What documentation of service connection is needed for veterans court?",
    );
  }
  if (eligible.some((p) => p.programKey === "mental_health_court")) {
    questions.push(
      "What mental health evaluations are required to qualify for mental health court?",
    );
  }
  if (eligible.some((p) => p.programKey === "dui_diversion")) {
    questions.push(
      "Does this county/circuit offer a DUI diversion or first-offender program?",
    );
  }

  // Always include general questions
  questions.push(
    "Are there any other alternative disposition programs available in this circuit that may apply to this case?",
  );

  return questions;
}

// ─── Diversion, disqualifier collection ─────────────────────

function collectDisqualifiers(input: DiversionInput): string[] {
  const disqualifiers: string[] = [];

  if (input.priorConvictions === "felony") {
    disqualifiers.push(
      "Prior felony conviction, may disqualify from standard PTI and limit other program options.",
    );
  } else if (input.priorConvictions === "multiple") {
    disqualifiers.push(
      "Multiple prior convictions, significantly limits diversion eligibility across most programs.",
    );
  } else if (input.priorConvictions === "misdemeanor") {
    disqualifiers.push(
      "Prior misdemeanor conviction, may affect misdemeanor PTI eligibility (typically requires no prior convictions).",
    );
  }

  if (input.priorDiversion === "yes") {
    disqualifiers.push(
      "Prior diversion participation, most programs limit participation to once.",
    );
  }

  if (input.chargeInvolves === "violence") {
    disqualifiers.push(
      "Charge involves violence, many diversion programs exclude or restrict violent offenses.",
    );
  } else if (input.chargeInvolves === "firearms") {
    disqualifiers.push(
      "Charge involves firearms, some circuits exclude firearm offenses from PTI.",
    );
  } else if (input.chargeInvolves === "sexual") {
    disqualifiers.push(
      "Charge involves a sexual offense, generally excluded from all diversion programs.",
    );
  } else if (input.chargeInvolves === "trafficking") {
    disqualifiers.push(
      "Trafficking charge, generally ineligible for diversion. Statutory mandatory minimums apply unless the State files a substantial assistance motion.",
    );
  }

  return disqualifiers;
}

// ─── Diversion, main calculation ────────────────────────────

const DIVERSION_UNSUPPORTED = (stateCode: string): string =>
  `Diversion program eligibility data for ${stateCode} is not yet in our database. Diversion programs vary significantly by state and county, this is a question worth raising with your attorney.`;

export function calculateDiversion(input: DiversionInput): DiversionResult {
  const stateCode = (input.state || "").toUpperCase();
  const stateData = DIVERSION_RULES[stateCode] as
    | DiversionStateData
    | undefined;

  if (!stateData || !stateData.programs) {
    return {
      supported: false,
      stateName: stateCode,
      county: input.county || "",
      programs: [],
      disqualifiersIdentified: [],
      questions: [],
      countyNote: "",
      fallbackMessage: DIVERSION_UNSUPPORTED(stateCode || "your state"),
    };
  }

  // Evaluate each program
  const programs = [
    evaluatePTIFelony(input),
    evaluatePTIMisdemeanor(input),
    evaluateDrugCourt(input),
    evaluateVeteransCourt(input),
    evaluateMentalHealthCourt(input),
    evaluateDUIDiversion(input),
  ];

  const disqualifiersIdentified = collectDisqualifiers(input);
  const questions = generateDiversionQuestions(programs);

  const countyNote = `This gives you a starting point for an informed conversation with your attorney about diversion options in ${input.county} County. Program availability varies by county and State Attorney's office in ${stateData.state_name}, your county may have additional programs or different requirements beyond the published state criteria above.`;

  return {
    supported: true,
    stateName: stateData.state_name,
    county: input.county,
    programs,
    disqualifiersIdentified,
    questions,
    countyNote,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Veterans Court Eligibility Checker
// ═══════════════════════════════════════════════════════════════════

export interface VeteransCourtInput {
  state: string;
  county: string;
  branchOfService: string;
  dischargeType: string;
  serviceCondition: string;
  chargeType: string;
  priorConvictions: string;
}

export interface VeteransCourtResult {
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

// ─── Veterans Court, data types ─────────────────────────────

interface VCDischargeTypes {
  honorable?: string;
  general_under_honorable?: string;
  other_than_honorable?: string;
  bad_conduct?: string;
  dishonorable?: string;
}

interface VCEligibility {
  discharge_types: VCDischargeTypes;
  service_connection_required: boolean;
  service_connection_detail?: string;
  charge_exclusions: string[];
  charge_exclusions_note?: string;
  prior_convictions_policy?: string;
}

interface VCProgramDetails {
  typical_duration: string;
  completion_result?: string;
  completion_result_pretrial?: string;
  completion_result_postconviction?: string;
  tracks?: Record<string, string>;
  conditions: string[];
}

interface VCStateData {
  state_name: string;
  statute: string;
  statewide_program: boolean;
  statewide_note?: string;
  counties_with_courts: string[] | Record<string, string[]>;
  eligibility: VCEligibility;
  program_details: VCProgramDetails;
  legislative_update?: string;
}

type VCFile = {
  _metadata: unknown;
} & Record<string, VCStateData | unknown>;

const VC_RULES = veteransCourtData as unknown as VCFile;

const VC_SUPPORTED_STATES = new Set(
  Object.keys(VC_RULES).filter((k) => k !== "_metadata"),
);

// ─── Veterans Court, validation ─────────────────────────────

export function validateVeteransCourtInput(
  input: VeteransCourtInput,
): ValidationResult {
  const errors: string[] = [];
  if (!input.state) errors.push("State is required");
  else if (!VC_SUPPORTED_STATES.has(input.state.toUpperCase()))
    errors.push(`Veterans court data for ${input.state} is not yet available`);
  if (!input.county) errors.push("County is required");
  if (!input.dischargeType) errors.push("Discharge type is required");
  if (!input.serviceCondition) errors.push("Service condition is required");
  if (!input.chargeType) errors.push("Charge type is required");
  return { valid: errors.length === 0, errors };
}

// ─── Veterans Court, county lookup ──────────────────────────

function countyHasCourt(
  counties: string[] | Record<string, string[]>,
  county: string,
): { available: boolean; circuit?: string } {
  const normalized = county.toLowerCase();
  if (Array.isArray(counties)) {
    const found = counties.some((c) => c.toLowerCase() === normalized);
    return { available: found };
  }
  // FL-style: keyed by circuit
  for (const [circuit, list] of Object.entries(counties)) {
    if (list.some((c) => c.toLowerCase() === normalized)) {
      return { available: true, circuit };
    }
  }
  return { available: false };
}

// ─── Veterans Court, discharge eligibility ──────────────────

const DISCHARGE_MAP: Record<string, keyof VCDischargeTypes> = {
  honorable: "honorable",
  "general-under-honorable": "general_under_honorable",
  "other-than-honorable": "other_than_honorable",
  "bad-conduct": "bad_conduct",
  dishonorable: "dishonorable",
};

function evaluateDischarge(
  dischargeType: string,
  types: VCDischargeTypes,
): string {
  const key = DISCHARGE_MAP[dischargeType];
  if (!key || !types[key]) {
    return "Discharge type eligibility information not available for this category. Contact the local veterans court for specific requirements.";
  }
  return types[key]!;
}

// ─── Veterans Court, main calculation ───────────────────────

const VC_UNSUPPORTED = (stateCode: string): string =>
  `Veterans treatment court data for ${stateCode} is not yet in our database. Veterans treatment court availability varies by state and county, contact your local VA Veterans Justice Outreach specialist for current program details.`;

export function calculateVeteransCourt(
  input: VeteransCourtInput,
): VeteransCourtResult {
  const stateCode = (input.state || "").toUpperCase();
  const stateData = VC_RULES[stateCode] as VCStateData | undefined;

  if (!stateData) {
    return {
      supported: false,
      stateName: stateCode,
      county: input.county,
      courtAvailable: false,
      courtAvailableDetail: "",
      statute: null,
      dischargeEligibility: "",
      serviceConnectionMet: false,
      serviceConnectionDetail: "",
      chargeExclusions: [],
      chargeExcluded: false,
      programDetails: null,
      questions: [],
      fallbackMessage: VC_UNSUPPORTED(stateCode || "your state"),
    };
  }

  // County availability
  const countyResult = countyHasCourt(
    stateData.counties_with_courts,
    input.county,
  );
  let courtAvailableDetail: string;
  if (countyResult.available) {
    courtAvailableDetail = countyResult.circuit
      ? `A veterans treatment court is available in ${input.county} County (${countyResult.circuit.replace(/_/g, " ")}).`
      : `A veterans treatment court is available in ${input.county} County.`;
  } else {
    courtAvailableDetail = `No veterans treatment court was found in ${input.county} County based on our data. ${stateData.statewide_program ? "However, " + stateData.state_name + " mandates statewide availability, contact your local court." : "Check with the county court or your local VA Veterans Justice Outreach specialist for current availability."}`;
  }

  // Discharge eligibility
  const dischargeEligibility = evaluateDischarge(
    input.dischargeType,
    stateData.eligibility.discharge_types,
  );

  // Service connection
  const serviceConditionProvided =
    input.serviceCondition !== "none" &&
    input.serviceCondition !== "prefer-not-to-say";
  const serviceConnectionMet =
    !stateData.eligibility.service_connection_required ||
    serviceConditionProvided;
  const serviceConnectionDetail = stateData.eligibility
    .service_connection_required
    ? serviceConditionProvided
      ? `${stateData.state_name} requires a service-connected condition. Your reported condition may satisfy this requirement, specific documentation standards vary by court.`
      : `${stateData.state_name} requires a service-connected condition (PTSD, TBI, substance abuse, mental health, or MST). Without a documented service connection, eligibility may be limited.`
    : `${stateData.state_name} does not require service connection at the statute level, though individual courts may consider it.`;

  // Charge exclusions
  const chargeExclusions = stateData.eligibility.charge_exclusions;
  const chargeExcluded =
    input.chargeType === "sex-offense" &&
    chargeExclusions.some(
      (ex) =>
        ex.toLowerCase().includes("sex") ||
        ex.toLowerCase().includes("290") ||
        ex.toLowerCase().includes("indecency"),
    );

  // Program details
  const pd = stateData.program_details;
  const completionResult =
    pd.completion_result ||
    (pd.tracks
      ? Object.values(pd.tracks).join("; ")
      : pd.completion_result_pretrial || "Varies by court");

  // Questions
  const questions: string[] = [
    `Is the veterans treatment court in ${input.county} County currently accepting new participants?`,
    "What documentation of military service and service-connected condition is required for admission?",
    `How does a ${input.dischargeType.replace(/-/g, " ")} discharge affect eligibility at this specific court?`,
    "What is the typical timeline from application to admission?",
    "Is there a Veterans Justice Outreach (VJO) specialist assigned to this court?",
    "What treatment providers does the court work with, and are VA services accepted?",
    "What happens if I do not complete the program, is the original charge reinstated?",
    "Can my criminal defense attorney coordinate with the VTC team during the application process?",
  ];

  return {
    supported: true,
    stateName: stateData.state_name,
    county: input.county,
    courtAvailable: countyResult.available,
    courtAvailableDetail,
    statute: stateData.statute,
    dischargeEligibility,
    serviceConnectionMet,
    serviceConnectionDetail,
    chargeExclusions,
    chargeExcluded,
    programDetails: {
      typicalDuration: pd.typical_duration,
      completionResult: completionResult,
      conditions: pd.conditions,
    },
    questions,
  };
}

/**
 * Extracts the minimum serve percentage from a credit_rate description.
 * Returns null if unparseable, caller MUST treat as unsupported rather than
 * silently defaulting (states vary from 50% to 100%, a wrong default is worse
 * than an honest "we don't know").
 *
 * The JSON is authored so the serve percentage is the FIRST percentage in the
 * string (e.g., "must serve at least 85%"). Credit caps (e.g., "15% max
 * credit") appear later in parentheticals.
 */
export function parseServePercent(creditRate: string): number | null {
  if (typeof creditRate !== "string" || creditRate.length === 0) return null;
  const match = creditRate.match(/(\d+)%/);
  if (!match) return null;
  const pct = parseInt(match[1], 10);
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return null;
  return pct;
}

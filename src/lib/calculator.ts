/**
 * @fileoverview Good Time Credit Calculator — pure computation logic.
 *
 * Pattern: identical to score.ts. Pure functions, no API/DB dependencies.
 * Takes form inputs + loaded state rules → computed result.
 *
 * The rules data is loaded from system-data/good-time-rules.json at build
 * time (imported as JSON). The source of truth for that file lives in the
 * ImNotAnAttorney business repo at system/data/good-time-rules.json — the
 * web repo keeps a committed mirror so Vercel builds can resolve the import
 * without needing the sibling repo.
 */

import goodTimeRules from "@/../system-data/good-time-rules.json";

// ─── Types ──────────────────────────────────────────────────────

export interface GoodTimeInput {
  state: string; // 2-letter state code
  chargeType: string; // charge slug
  sentenceMonths: number; // total sentence in months
  custodyCredits: number; // days already served (jail time credit)
  prisonType: string; // "state" | "federal" | "county"
  offenseDate: string; // ISO date — determines which rules apply
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
    // Unparseable rate — never silently default. Treat as unsupported.
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
      `Maximum potential good time reduction: approximately ${estimatedCreditMonths} months — and only if every credit-earning requirement is met.`,
    );
  } else {
    observations.push(
      `This jurisdiction provides little or no good time credit for the applicable rule — plan around serving the full term.`,
    );
  }
  observations.push(
    "This is an estimate based on published state rules. Actual release dates depend on institutional behavior, program participation, and classification decisions — and this is legal INFORMATION, not legal ADVICE.",
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

/**
 * Extracts the minimum serve percentage from a credit_rate description.
 * Returns null if unparseable — caller MUST treat as unsupported rather than
 * silently defaulting (states vary from 50% to 100% — a wrong default is worse
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

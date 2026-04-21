/**
 * @fileoverview Mappers from INAA friendly intake values to USSC matview codes.
 *
 * The USSC Individual Offender Datafile uses numeric codes for several fields.
 * Defendants filling out an intake form don't know those codes. These mappers
 * translate friendly questions (what are you charged with? how many priors?)
 * into the codes that `ussc_similar_cases_summary` indexes by.
 *
 * Scope: demographic + offense dimensions only. State→federal-district mapping
 * is intentionally omitted — USSC publishes a 94-district code table in the
 * Codebook FY99-FY24 Appendix A, but it's PDF-only. Rather than risk a wrong
 * hand-coded mapping on safety-critical legal data (per
 * rules/no-hallucinated-legal-data.md), the Similar Cases API accepts
 * district as OPTIONAL; when absent, queryBucket widens to national.
 *
 * Source cited in ussc_similar_cases_summary matview COMMENT: USSC Codebook
 * FY99-FY24. Offguide codes come directly from the matview's distinct values,
 * verified against 690,491 federal cases.
 */

import { normalizeAgeBucket, type AgeBucket } from "./ussc-similar-cases";

/* ------------------------------------------------------------------ */
/* Charge type → USSC offguide code                                   */
/* ------------------------------------------------------------------ */

/**
 * Map INAA chargeType slug → USSC offguide code (text — matview stores the
 * code as a string column for efficient indexing).
 *
 * Source of truth: USSC Primary Sentencing Guideline codes verified against
 * the `federal_sentencing_distributions` table's `offguide_label` column
 * (loaded from USSC Individual Offender Datafiles, audited 2026-04-21).
 *
 * The 23 codes + labels (shared between matview + FSD):
 *   1=Admin of Justice, 2=Antitrust, 4=Assault, 5=Bribery/Corruption,
 *   7=Child Pornography, 8=Commercialized Vice, 9=Drug Possession,
 *   10=Drug Trafficking, 11=Environmental, 12=Extortion/Racketeering,
 *   13=Firearms, 15=Forgery/Counter/Copyright, 16=Fraud/Theft/Embezzlement,
 *   17=Immigration, 20=Manslaughter, 21=Money Laundering, 23=National Defense,
 *   24=Obscenity/Other Sex Offenses, 25=Prison Offenses, 26=Robbery,
 *   27=Sex Abuse, 29=Tax, 30=Other.
 *
 * Matview also carries 3/6/14/18/19/22/28/UNK for FY14-FY17 legacy rows
 * (pre-taxonomy reorganization). Those aren't mappable from INAA chargeType
 * enum and are reached via the widen_district tier when offguide filter is
 * dropped.
 *
 * HISTORICAL NOTE: Prior to 2026-04-21 this map had hand-coded labels
 * derived from matview occurrence counts that eyeballed the wrong side of
 * several codes (drug-trafficking was mapped to 17/Immigration instead of
 * 10/Drug Trafficking, fraud→13/Firearms instead of 16/Fraud, etc.). Every
 * Similar Cases Analyzer report issued during that window matched the
 * defendant to the wrong federal offense bucket. The corrected mapping
 * below is imported from `fsd-offguide.ts` which uses the FSD table's
 * `offguide_label` column as authoritative source.
 *
 * When no mapping is confident, return null — the lookup will omit offguide
 * and the matview query will widen immediately. Partial is better than wrong.
 */
import { CHARGE_TO_FSD_OFFGUIDE } from "./fsd-offguide";

/** Charge slug → matview offguide (string form). Derived from the FSD
 *  integer-keyed source of truth. Canonical since 2026-04-21. */
export const CHARGE_TO_OFFGUIDE: Record<string, string | null> = Object.fromEntries(
  Object.entries(CHARGE_TO_FSD_OFFGUIDE).map(([slug, code]) => [
    slug,
    code === null ? null : String(code),
  ]),
);

/** Look up offguide code for a chargeType slug. Returns null when unmapped. */
export function chargeTypeToOffguide(chargeType: string | null | undefined): string | null {
  if (!chargeType || typeof chargeType !== "string") return null;
  return CHARGE_TO_OFFGUIDE[chargeType] ?? null;
}

/* ------------------------------------------------------------------ */
/* Prior convictions → USSC xcrhissr (criminal history category)      */
/* ------------------------------------------------------------------ */

/**
 * USSC criminal history categories (xcrhissr codes "1".."6", stored as text
 * in the matview):
 *   1 = I   (0-1 criminal history points)
 *   2 = II  (2-3 points)
 *   3 = III (4-6 points)
 *   4 = IV  (7-9 points)
 *   5 = V   (10-12 points)
 *   6 = VI  (13+ points)
 *
 * Defendants don't know their points total — the guidelines score each prior
 * with varying point values based on sentence length. These mappings are
 * approximations driven by the intake form's `priorConvictions` enum
 * (matches VALID_PRIOR_CONVICTIONS in the standalone intake route):
 *   none        → "1" (cat I)
 *   misdemeanor → "1" (cat I, most misdemeanors score 0-1 points)
 *   felony      → "3" (cat III, single felony + supervision → 3-4 points)
 *   multiple    → "5" (cat V, midpoint bucket for multiple felonies)
 *
 * When the defendant selects "dont-know" we return null — the matview query
 * will widen. Approximations are fine when disclosed via the widening note
 * in the API response; silent wrongness is not.
 */
export const PRIOR_CONVICTIONS_TO_XCRHISSR: Record<string, string | null> = {
  none: "1",
  misdemeanor: "1",
  felony: "3",
  multiple: "5",
  "dont-know": null,
};

export function priorConvictionsToXcrhissr(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  return PRIOR_CONVICTIONS_TO_XCRHISSR[value] ?? null;
}

/* ------------------------------------------------------------------ */
/* Citizenship → USSC citizen code                                     */
/* ------------------------------------------------------------------ */

/**
 * USSC citizen codes (stored as text in matview):
 *   1 = U.S. Citizen
 *   2 = Resident/Legal Alien
 *   3 = Illegal Alien
 *   4 = Not a U.S. Citizen/Alien Status Unknown
 *   5 = Extradited Alien
 *
 * INAA intake uses IMMIGRATION_STATUS with these values (see
 * IntakeFormClient.tsx):
 *   citizen, green-card, visa, daca, tps, pending-petition,
 *   undocumented, other
 *
 * The mapping below favors conservatism — when the intake value doesn't map
 * cleanly to a USSC code, return null and widen.
 */
export const IMMIGRATION_TO_CITIZEN: Record<string, string | null> = {
  citizen: "1",
  "green-card": "2",
  visa: "2",
  daca: "4",
  tps: "4",
  "pending-petition": "4",
  undocumented: "3",
  other: null,
};

export function immigrationStatusToCitizen(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  return IMMIGRATION_TO_CITIZEN[value] ?? null;
}

/* ------------------------------------------------------------------ */
/* Age bucket — friendly dropdown already matches matview label       */
/* ------------------------------------------------------------------ */

/**
 * Intake offers six age-bucket options directly matching the matview's
 * age_bucket labels. No numeric age → bucket conversion needed for this path
 * (the existing `normalizeAgeBucket` from ussc-similar-cases.ts still handles
 * the numeric-age case for APIs that take a number).
 */
export const AGE_BUCKET_OPTIONS: { value: AgeBucket | "prefer-not-to-say"; label: string }[] = [
  { value: "<25", label: "Under 25" },
  { value: "25-34", label: "25-34" },
  { value: "35-44", label: "35-44" },
  { value: "45-54", label: "45-54" },
  { value: "55+", label: "55 or older" },
  { value: "prefer-not-to-say", label: "Prefer not to say" },
];

export function ageBucketFromIntake(value: string | null | undefined): AgeBucket | null {
  if (!value || value === "prefer-not-to-say") return null;
  if (value === "<25" || value === "25-34" || value === "35-44" || value === "45-54" || value === "55+") {
    return value;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Combined helper — build a queryBucket input from intake fields     */
/* ------------------------------------------------------------------ */

export interface IntakeBucketFields {
  chargeType?: string | null;
  priorConvictions?: string | null;
  citizenship?: string | null;
  ageBucket?: string | null;
  /** Optional — only populated when caller already has a mapped district. */
  district?: string | null;
}

export interface MappedBucket {
  district: string | null;
  offguide: string | null;
  xcrhissr: string | null;
  citizen: string | null;
  age_bucket: AgeBucket | null;
  /**
   * true when at least offguide + xcrhissr were mapped. Below this floor
   * the matview lookup is too coarse to be meaningful — callers should
   * skip the query.
   */
  has_minimum_signal: boolean;
}

/**
 * Convert intake fields → matview bucket codes. Returns `has_minimum_signal`
 * flag so callers can decide whether to query the matview at all — below
 * offguide + xcrhissr there's nothing worth showing.
 */
export function mapIntakeToBucket(intake: IntakeBucketFields): MappedBucket {
  const offguide = chargeTypeToOffguide(intake.chargeType);
  const xcrhissr = priorConvictionsToXcrhissr(intake.priorConvictions);
  const citizen = immigrationStatusToCitizen(intake.citizenship);
  const age_bucket = ageBucketFromIntake(intake.ageBucket);
  const district = typeof intake.district === "string" && intake.district.length > 0 ? intake.district : null;

  return {
    district,
    offguide,
    xcrhissr,
    citizen,
    age_bucket,
    has_minimum_signal: offguide !== null && xcrhissr !== null,
  };
}

// Re-export for convenience (single import surface in consumers)
export { normalizeAgeBucket };
export type { AgeBucket };

/**
 * @fileoverview INAA chargeType → USSC offguide_code mapping for the
 * Federal Sentencing Distribution product.
 *
 * Source of truth: USSC Primary Sentencing Guideline codes verified against
 * the `federal_sentencing_distributions` table's offguide_label column (13,131
 * rows loaded from USSC Individual Offender Datafiles FY14-FY24, 2026-04-21).
 *
 * 23 active codes in the current taxonomy:
 *   1=Admin of Justice, 2=Antitrust, 4=Assault, 5=Bribery/Corruption,
 *   7=Child Pornography, 8=Commercialized Vice, 9=Drug Possession,
 *   10=Drug Trafficking, 11=Environmental, 12=Extortion/Racketeering,
 *   13=Firearms, 15=Forgery/Counter/Copyright, 16=Fraud/Theft/Embezzlement,
 *   17=Immigration, 20=Manslaughter, 21=Money Laundering, 23=National Defense,
 *   24=Obscenity/Other Sex Offenses, 25=Prison Offenses, 26=Robbery,
 *   27=Sex Abuse, 29=Tax, 30=Other.
 *
 * NOTE — src/lib/ussc-mappings.ts has several stale mappings from an earlier
 * matview-occurrence discovery (e.g. drug-trafficking→17 → Immigration). This
 * file is the corrected mapping for FSD; ussc-mappings.ts is flagged for a
 * follow-up audit. Do NOT refactor consumers to share mappings until that
 * audit lands.
 *
 * Unmapped slugs return null — callers should widen to all-offense or skip
 * the matview query entirely. Partial correctness > confident wrongness.
 */

export const CHARGE_TO_FSD_OFFGUIDE: Record<string, number | null> = {
  // Drug
  "drug-trafficking": 10,
  "drug-possession": 9,
  "drug": 10, // default to trafficking — most federal drug cases

  // Fraud / white-collar
  "white-collar": 16, // Fraud/Theft/Embezzlement
  "fraud": 16,
  "theft": 16, // bundled in code 16
  "money-laundering": 21,
  "tax": 29,
  "bribery": 5,
  "antitrust": 2,

  // Firearms / weapons
  "weapons": 13,
  "firearms": 13,

  // Sex offenses (distinguished by codebook)
  "sex-offense": 27, // Sex Abuse — default
  "sex-offense-contact": 27,
  "sex-offense-digital": 7, // Child Pornography
  "child-abuse": 27,
  "child-pornography": 7,

  // Violence
  "assault": 4,
  "domestic-violence": 4,
  "stalking": 4,
  "manslaughter": 20,
  "robbery": 26,
  "extortion": 12,
  "racketeering": 12,

  // Immigration
  "immigration": 17,

  // Administration / justice
  "contempt": 1,
  "obstruction": 1,
  "probation-violation": 25, // Prison Offenses is closest
  "prison-offense": 25,

  // Environmental / regulatory
  "environmental": 11,

  // Forgery + IP
  "forgery": 15,
  "counterfeiting": 15,
  "copyright": 15,

  // No confident federal mapping — widen.
  "murder": null, // capital offense, separately coded or case-specific
  "kidnapping": null,
  "arson": null,
  "burglary": null, // typically state
  "hit-and-run": null, // state
  "dui": null,
  "dui-first": null,
  "dui-repeat": null,
  "self-defense": null,
  "federal": null,
  "other": null,
  "other-felony": null,
  "other-misdemeanor": null,
};

/**
 * Look up FSD offguide code (numeric) for an INAA chargeType slug. Returns
 * null when unmapped — callers should widen to offense_category or skip
 * district-level bucketing.
 */
export function chargeTypeToFsdOffguide(
  chargeType: string | null | undefined,
): number | null {
  if (typeof chargeType !== "string" || chargeType.length === 0) return null;
  return CHARGE_TO_FSD_OFFGUIDE[chargeType] ?? null;
}

/**
 * INAA priorConvictions slug → USSC criminal_history_category (1-6).
 *   "1" = Category I (0-1 prior criminal history point)
 *   "2" = Category II (2-3 points)
 *   "3" = Category III (4-6 points)
 *   "4" = Category IV (7-9 points)
 *   "5" = Category V (10-12 points)
 *   "6" = Category VI (13+ points, includes career offenders)
 */
export const PRIORS_TO_CH_CATEGORY: Record<string, string | null> = {
  none: "1",
  misdemeanor: "1", // misdemeanors rarely push above Category I
  felony: "3", // single felony typically 4-6 points → Category III
  multiple: "5", // multiple felonies → Category V common
  "dont-know": null, // widen
};

export function priorsToChCategory(priors: string | null | undefined): string | null {
  if (typeof priors !== "string" || priors.length === 0) return null;
  return PRIORS_TO_CH_CATEGORY[priors] ?? null;
}

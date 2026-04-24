/**
 * @fileoverview USSC numeric offguide code -> internal
 * `motion_outcome_rates.charge_type` slug bridge.
 *
 * `ussc_similar_cases_summary.offguide` stores USSC Primary Sentencing
 * Guideline codes as 1-2 character strings ("1","2","30","UNK", etc). They
 * are FEDERAL primary-guideline numeric codes, NOT our internal
 * motion_outcome_rates.charge_type slugs ("drug-trafficking", "fraud-general",
 * "weapons-possession").
 *
 * Codebook source (anchored to `src/lib/fsd-offguide.ts` FSD_OFFGUIDE list,
 * verified 2026-04-23 against federal_sentencing_distributions.offguide_label):
 *   1=Admin of Justice, 2=Antitrust, 4=Assault, 5=Bribery/Corruption,
 *   7=Child Pornography, 8=Commercialized Vice, 9=Drug Possession,
 *  10=Drug Trafficking, 11=Environmental, 12=Extortion/Racketeering,
 *  13=Firearms, 15=Forgery/Counter/Copyright, 16=Fraud/Theft/Embezzlement,
 *  17=Immigration, 20=Manslaughter, 21=Money Laundering, 23=National Defense,
 *  24=Obscenity/Other Sex Offenses, 25=Prison Offenses, 26=Robbery,
 *  27=Sex Abuse, 29=Tax, 30=Other.
 *
 * Best-effort map to the internal slugs actually present in
 * motion_outcome_rates.charge_type (127 distinct values verified live
 * 2026-04-23). Unmapped codes (2, 5, 8, 11, 17, 23, 24, UNK) return
 * null and callers suppress the motion_context block rather than fabricate
 * a match. Partial correctness beats confident wrongness.
 *
 * Deliberately conservative:
 *   - Immigration (17) -> null (no federal immigration-specific slug in MOR).
 *   - National Defense (23), Antitrust (2), Environmental (11), Bribery (5),
 *     Commercialized Vice (8) -> null (no confident MOR slug).
 *   - Manslaughter (20) picks "voluntary-manslaughter" as canonical; callers
 *     querying MOR IN-list union with adjacent slugs via MOR_CHARGE_EXPANSION
 *     (see getMotionChargesForOffguide below).
 *
 * NOT duplicated into charge-slug-maps.ts because this is an offguide-to-slug
 * bridge specific to Similar Cases ($297 Tier 9 SKU). The existing map is
 * user-facing intake slug -> internal slug; this is a third leg.
 */

/**
 * Primary mapping: USSC offguide numeric string -> motion_outcome_rates
 * canonical charge_type slug (or null when no confident match exists).
 *
 * Coverage: 15 of 29 distinct offguide values observed in
 * ussc_similar_cases_summary map to a MOR slug; 14 unmapped (returned as
 * null).
 */
export const USSC_OFFGUIDE_TO_CHARGE_MAP: Record<string, string | null> = {
  "1": "obstruction-justice",           // Admin of Justice
  "2": null,                             // Antitrust (no MOR slug)
  "3": null,                             // reserved/unused in FSD canon
  "4": "assault",                        // Assault
  "5": null,                             // Bribery/Corruption (no MOR slug)
  "6": null,                             // reserved/unused
  "7": "child-exploitation",            // Child Pornography
  "8": null,                             // Commercialized Vice (no MOR slug)
  "9": "drug-possession",               // Drug Possession
  "10": "drug-trafficking",             // Drug Trafficking
  "11": null,                            // Environmental (no MOR slug)
  "12": null,                            // Extortion/Racketeering (no MOR slug)
  "13": "weapons-possession",           // Firearms
  "14": null,                            // reserved/unused
  "15": "forgery",                       // Forgery/Counter/Copyright
  "16": "fraud-general",                 // Fraud/Theft/Embezzlement
  "17": null,                            // Immigration (no MOR slug)
  "18": null,                            // reserved/unused
  "19": null,                            // reserved/unused
  "20": "voluntary-manslaughter",        // Manslaughter (canonical + expansion)
  "21": "money-laundering",              // Money Laundering
  "22": null,                            // reserved/unused
  "23": null,                            // National Defense (no MOR slug)
  "24": null,                            // Obscenity/Other Sex Offenses (ambiguous)
  "25": "supervised-release-violation",  // Prison Offenses
  "26": "robbery",                       // Robbery
  "27": "sex-offense-contact",           // Sex Abuse
  "28": null,                            // reserved/unused
  "29": "tax-fraud",                     // Tax
  "30": "other",                         // Other
  UNK: null,                             // Unknown
};

/**
 * Expansion: for offguide codes where our canonical slug is one member of a
 * cluster in motion_outcome_rates, return the full cluster so downstream
 * filtering via `.in('charge_type', [list])` captures the full signal.
 *
 * E.g. offguide 20 (Manslaughter) spans voluntary, involuntary, and vehicular
 * variants in MOR - aggregating across all three yields more statistically
 * meaningful filed/granted totals than the single canonical slug.
 *
 * Slugs listed here were verified live 2026-04-23 against
 * motion_outcome_rates.charge_type. Only slugs that actually exist in that
 * table are included - no guessing.
 */
export const MOR_CHARGE_EXPANSION: Record<string, string[]> = {
  "drug-trafficking": [
    "drug-trafficking",
    "drug-distribution",
    "drug-manufacturing",
  ],
  "drug-possession": [
    "drug-possession",
    "drug-possession-marijuana",
    "drug-possession-cocaine",
    "drug-possession-meth",
    "drug-possession-opioids",
    "drug-possession-prescription",
    "drug-possession-with-intent",
  ],
  "weapons-possession": [
    "weapons-possession",
    "felony-firearm",
    "felon-in-possession",
    "possession-prohibited-weapon",
    "illegal-discharge",
  ],
  "fraud-general": [
    "fraud-general",
    "wire-fraud",
    "securities-fraud",
    "insurance-fraud",
    "credit-card-fraud",
    "prescription-fraud",
    "embezzlement",
    "identity-theft",
    "theft-larceny",
    "grand-theft",
  ],
  assault: [
    "assault",
    "simple-assault",
    "aggravated-assault",
    "aggravated-battery",
    "assault-with-deadly-weapon",
    "assault-firearm",
    "assault-police-officer",
    "battery",
  ],
  "sex-offense-contact": [
    "sex-offense-contact",
    "sexual-assault",
    "sexual-battery",
    "rape",
    "statutory-rape",
  ],
  "child-exploitation": [
    "child-exploitation",
    "production-child-pornography",
  ],
  robbery: ["robbery", "armed-robbery", "home-invasion"],
  "voluntary-manslaughter": [
    "voluntary-manslaughter",
    "involuntary-manslaughter",
    "vehicular-manslaughter",
    "vehicular-homicide",
  ],
  forgery: ["forgery"],
  "money-laundering": ["money-laundering"],
  "tax-fraud": ["tax-fraud"],
  "supervised-release-violation": [
    "supervised-release-violation",
    "parole-violation",
    "community-control-violation",
    "probation-violation-technical",
    "probation-violation-substantive",
  ],
  "obstruction-justice": ["obstruction-justice"],
  other: ["other"],
};

/**
 * Public helper - return the motion_outcome_rates charge_type slug list for
 * an offguide code, or null when the offguide has no confident mapping.
 *
 * Callers pass the returned list to `.in('charge_type', list)`.
 *
 * @param offguide Raw string value from ussc_similar_cases_summary.offguide.
 * @returns Object with canonical slug plus expansion list, or null when unmapped.
 */
export function getMotionChargesForOffguide(
  offguide: string | null | undefined,
): { canonical: string; charges: string[] } | null {
  if (typeof offguide !== "string" || offguide.length === 0) return null;
  const canonical = USSC_OFFGUIDE_TO_CHARGE_MAP[offguide] ?? null;
  if (canonical === null) return null;
  const charges = MOR_CHARGE_EXPANSION[canonical] ?? [canonical];
  return { canonical, charges };
}

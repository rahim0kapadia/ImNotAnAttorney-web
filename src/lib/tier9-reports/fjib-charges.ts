/**
 * FJIB charge slug + label list — client-safe extract.
 *
 * The full `FEDERAL_CHARGES` map lives in
 * `./federal-jury-instruction-brief.ts`, which also exports
 * `queryFederalJuryBrief` and pulls `@/lib/supabase/admin`. We do not want
 * the client bundle to follow that chain. This module mirrors the slug
 * keys + display labels so the AvailabilityChecker (client) can render
 * the SELECT options without paying the server-side import cost.
 *
 * The companion test in `__tests__/fjib-coverage.test.ts` asserts that
 * `FJB_CHARGE_SLUGS` matches `Object.keys(FEDERAL_CHARGES)` byte-for-byte
 * (S1 of the 2026-04-26 PR #171 review). Drift trips the test on the next
 * edit.
 *
 * If you add or remove a federal charge, update TWO sites in lockstep:
 *   1. `FEDERAL_CHARGES` in `federal-jury-instruction-brief.ts`
 *   2. `FJB_CHARGES` here (slug + label)
 * The S1 test will fail loudly if (1) and (2) drift. The route layer
 * re-validates the slug against `FEDERAL_CHARGES` regardless, so this list
 * cannot grant access to any charge the server does not also support.
 */

export const FJB_CHARGES: { value: string; label: string }[] = [
  { value: "wire-fraud", label: "Wire Fraud (18 U.S.C. § 1343)" },
  { value: "mail-fraud", label: "Mail Fraud (18 U.S.C. § 1341)" },
  { value: "conspiracy-general", label: "Conspiracy (18 U.S.C. § 371)" },
  { value: "drug-conspiracy", label: "Drug Conspiracy (21 U.S.C. § 846)" },
  {
    value: "drug-distribution",
    label: "Distribution of a Controlled Substance (21 U.S.C. § 841(a)(1))",
  },
  {
    value: "drug-possession-intent",
    label: "Possession with Intent to Distribute (21 U.S.C. § 841(a)(1))",
  },
  {
    value: "drug-manufacture",
    label: "Manufacture of a Controlled Substance (21 U.S.C. § 841(a)(1))",
  },
  {
    value: "felon-in-possession",
    label: "Felon in Possession of Firearm (18 U.S.C. § 922(g))",
  },
  {
    value: "firearm-during-drug-crime",
    label:
      "Using/Carrying a Firearm During a Drug Trafficking Crime (18 U.S.C. § 924(c))",
  },
  { value: "bank-robbery", label: "Bank Robbery (18 U.S.C. § 2113)" },
  {
    value: "hobbs-act",
    label: "Hobbs Act Robbery/Extortion (18 U.S.C. § 1951)",
  },
  {
    value: "money-laundering",
    label: "Money Laundering (18 U.S.C. §§ 1956, 1957)",
  },
  { value: "tax-evasion", label: "Tax Evasion (26 U.S.C. § 7201)" },
  {
    value: "false-statement-agency",
    label: "False Statement to a Federal Agency (18 U.S.C. § 1001)",
  },
  {
    value: "aggravated-identity-theft",
    label: "Aggravated Identity Theft (18 U.S.C. § 1028A)",
  },
  {
    value: "bribery-public-official",
    label: "Bribery of a Public Official (18 U.S.C. § 201)",
  },
  {
    value: "obstruction-justice",
    label: "Obstruction of Justice (18 U.S.C. § 1503 / § 1512)",
  },
  { value: "perjury", label: "Perjury (18 U.S.C. § 1621)" },
  { value: "rico", label: "RICO — Racketeering (18 U.S.C. § 1962)" },
  {
    value: "child-pornography-possession",
    label: "Possession of Child Pornography (18 U.S.C. § 2252 / § 2252A)",
  },
  {
    value: "illegal-reentry",
    label: "Illegal Re-entry After Deportation (8 U.S.C. § 1326)",
  },
  {
    value: "immigration-fraud",
    label:
      "Immigration Fraud (18 U.S.C. § 1546 / 8 U.S.C. § 1325(c))",
  },
  {
    value: "kidnapping-federal",
    label: "Federal Kidnapping (18 U.S.C. § 1201)",
  },
  {
    value: "healthcare-fraud",
    label: "Health Care Fraud (18 U.S.C. § 1347)",
  },
  {
    value: "aiding-abetting",
    label: "Aiding and Abetting (18 U.S.C. § 2)",
  },
];

export const FJB_CHARGE_SLUGS: readonly string[] = FJB_CHARGES.map(
  (c) => c.value,
);

export type FjbChargeSlug = (typeof FJB_CHARGE_SLUGS)[number];

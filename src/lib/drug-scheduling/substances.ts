/**
 * Substance taxonomy seed for TICKET-16 Federal Register drug-scheduling.
 *
 * Source: DEA Controlled Substances Schedules
 *   https://www.deadiversion.usdoj.gov/schedules/
 *
 * Each entry pins:
 *   - slug: stable URL/intake slug (kebab-case, ASCII)
 *   - canonicalName: display name
 *   - currentSchedule: current DEA schedule (I-V) OR "uncontrolled" OR
 *     "state-only" (for state-scheduled but federally uncontrolled like
 *     kratom, delta-8 hemp derivatives in some states).
 *   - currentScheduleAsOf: date the currentSchedule reflects (audit trail)
 *   - regulationCitation: 21 CFR § 1308.X reference, or other canonical citation
 *   - regulationUrl: link to the canonical regulation text (eCFR / DEA / FDA)
 *   - searchAliases: ILIKE-friendly substring patterns to find Federal Register
 *     actions that reference this substance (chemical names, common synonyms,
 *     brand names). Match runs case-insensitive against
 *     federal_register_actions.title || ' ' || abstract.
 *   - summary: one-sentence Mercer-voice summary of why this substance has
 *     a scheduling history worth surfacing. Used in render layer.
 *
 * Verification:
 *   Every regulationUrl was current as of 2026-05-03. Re-verify quarterly.
 *   When the DEA reschedules a substance, update currentSchedule +
 *   currentScheduleAsOf in the same edit.
 *
 * UPL guardrail:
 *   These entries are reference data — current schedule + canonical citation.
 *   They are NEVER used to predict case outcomes. The render layer surfaces
 *   the question ("between dates X and Y the substance sat in a gray zone")
 *   and leaves the legal conclusion to the defendant's attorney.
 */

export type ScheduleStatus =
  | "I"
  | "II"
  | "III"
  | "IV"
  | "V"
  | "uncontrolled"
  | "state-only";

export interface SubstanceEntry {
  slug: string;
  canonicalName: string;
  currentSchedule: ScheduleStatus;
  currentScheduleAsOf: string; // ISO date YYYY-MM-DD
  regulationCitation: string;
  regulationUrl: string;
  searchAliases: string[]; // ILIKE patterns for Federal Register match
  summary: string; // Mercer-voice, neutral
}

/**
 * Seed taxonomy.
 *
 * Conservative coverage choice: every entry has an active CFR citation OR a
 * notable Federal Register action tied to it. Substances with zero plausible
 * Federal Register hits (e.g. table salt, water) are obviously excluded.
 *
 * Substances NOT in the seed are handled by the helper as "unknown substance,
 * no taxonomy entry — surfacing scheduling history is out of scope for this
 * report tier." Unknown != absent — never fabricate a schedule for an unlisted
 * substance.
 */
export const SUBSTANCE_TAXONOMY: Record<string, SubstanceEntry> = {
  // -------- Cannabis family (active scheduling action 2026) --------
  marijuana: {
    slug: "marijuana",
    canonicalName: "Marijuana (Cannabis)",
    currentSchedule: "I",
    currentScheduleAsOf: "2026-04-28",
    regulationCitation: "21 CFR § 1308.11(d)(23)",
    regulationUrl: "https://www.ecfr.gov/current/title-21/chapter-II/part-1308/subject-group-ECFR3811cb39d8ad2dd/section-1308.11",
    searchAliases: ["marijuana", "marihuana", "cannabis"],
    summary:
      "Cannabis sits in Schedule I under 21 CFR § 1308.11(d)(23). DEA noticed a hearing in April 2026 on transferring it to Schedule III; the proposal was withdrawn the same week.",
  },
  hexahydrocannabinol: {
    slug: "hexahydrocannabinol",
    canonicalName: "Hexahydrocannabinol (HHC)",
    currentSchedule: "I",
    currentScheduleAsOf: "2026-05-04",
    regulationCitation: "21 CFR § 1308.11(d)(31) (specific listing 2026-05-04)",
    regulationUrl: "https://www.federalregister.gov/documents/2026/05/04/2026-08595/specific-listing-for-hexahydrocannabinol-a-currently-controlled-schedule-i-substance",
    searchAliases: ["hexahydrocannabinol", "hhc"],
    summary:
      "DEA issued a specific listing for HHC on May 4, 2026. Before that listing, HHC was controlled only by analog inference — a documented gray window.",
  },
  "delta-8-thc": {
    slug: "delta-8-thc",
    canonicalName: "Delta-8 THC",
    currentSchedule: "uncontrolled",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "2018 Farm Act § 10113 (hemp definition)",
    regulationUrl: "https://www.congress.gov/bill/115th-congress/house-bill/2",
    searchAliases: ["delta-8", "delta 8", "delta8", "?8-thc", "?-8-tetrahydrocannabinol"],
    summary:
      "Delta-8 THC derived from hemp sits outside federal Schedule I per the 2018 Farm Act, but DEA letters and pending rulemakings have repeatedly contested the federal status — defendants' attorneys put the date the prosecution alleges the substance was possessed against this regulatory turbulence.",
  },
  "delta-9-thc": {
    slug: "delta-9-thc",
    canonicalName: "Delta-9 THC",
    currentSchedule: "I",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "21 CFR § 1308.11(d)(31)",
    regulationUrl: "https://www.ecfr.gov/current/title-21/chapter-II/part-1308/subject-group-ECFR3811cb39d8ad2dd/section-1308.11",
    searchAliases: ["delta-9", "delta 9", "delta9", "tetrahydrocannabinol"],
    summary:
      "Delta-9 THC is the principal cannabinoid scheduled under 21 CFR § 1308.11(d)(31). Plant-derived hemp (≤ 0.3% Δ9 THC by dry weight) is exempt under the 2018 Farm Act — laboratory test methodology is therefore the question.",
  },

  // -------- Synthetic cannabinoids (recent placements) --------
  "4f-mdmb-butica": {
    slug: "4f-mdmb-butica",
    canonicalName: "4F-MDMB-BUTICA",
    currentSchedule: "I",
    currentScheduleAsOf: "2026-05-01",
    regulationCitation: "21 CFR § 1308.11 (final rule 2026-05-01)",
    regulationUrl: "https://www.federalregister.gov/documents/2026/05/01/2026-08517/schedules-of-controlled-substances-placement-of-4f-mdmb-butica-adb-4en-pinaca-5f-edmb-pica-and",
    searchAliases: ["4f-mdmb-butica", "4f mdmb butica", "mdmb-butica"],
    summary:
      "4F-MDMB-BUTICA was placed in Schedule I via final rule effective May 1, 2026. Possession dates before that final rule sit in a documented analog-only window.",
  },
  "adb-4en-pinaca": {
    slug: "adb-4en-pinaca",
    canonicalName: "ADB-4en-PINACA",
    currentSchedule: "I",
    currentScheduleAsOf: "2026-05-01",
    regulationCitation: "21 CFR § 1308.11 (final rule 2026-05-01)",
    regulationUrl: "https://www.federalregister.gov/documents/2026/05/01/2026-08517/schedules-of-controlled-substances-placement-of-4f-mdmb-butica-adb-4en-pinaca-5f-edmb-pica-and",
    searchAliases: ["adb-4en-pinaca", "adb 4en pinaca"],
    summary:
      "ADB-4en-PINACA was placed in Schedule I via final rule effective May 1, 2026.",
  },

  // -------- Opioids --------
  fentanyl: {
    slug: "fentanyl",
    canonicalName: "Fentanyl",
    currentSchedule: "II",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "21 CFR § 1308.12(c)(9)",
    regulationUrl: "https://www.ecfr.gov/current/title-21/chapter-II/part-1308/subject-group-ECFR4839e8a0c3aa68f/section-1308.12",
    searchAliases: ["fentanyl"],
    summary:
      "Fentanyl is Schedule II. Fentanyl analogs (ANY substance structurally related to fentanyl) have been class-scheduled into Schedule I via a series of temporary orders extended by Congress; the start/end dates of those temporary orders are the relevant window.",
  },
  "fentanyl-related-substances": {
    slug: "fentanyl-related-substances",
    canonicalName: "Fentanyl-Related Substances (Class)",
    currentSchedule: "I",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "21 CFR § 1308.11(h) (class-wide temporary scheduling, extended through SAFETY Act)",
    regulationUrl: "https://www.deadiversion.usdoj.gov/fed_regs/rules/2018/fr0206_2.htm",
    searchAliases: ["fentanyl-related substance", "fentanyl analog", "fentanyl-related"],
    summary:
      "Fentanyl-related substances were class-scheduled into Schedule I via temporary order in February 2018 and extended by Congress multiple times. Each extension creates a defined window — a defendant charged with possession of an analog needs the window dates on the record.",
  },
  heroin: {
    slug: "heroin",
    canonicalName: "Heroin",
    currentSchedule: "I",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "21 CFR § 1308.11(b)(10)",
    regulationUrl: "https://www.ecfr.gov/current/title-21/chapter-II/part-1308/subject-group-ECFR3811cb39d8ad2dd/section-1308.11",
    searchAliases: ["heroin", "diacetylmorphine"],
    summary:
      "Heroin has been Schedule I since the 1970 Controlled Substances Act with no notable rescheduling actions.",
  },
  oxycodone: {
    slug: "oxycodone",
    canonicalName: "Oxycodone",
    currentSchedule: "II",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "21 CFR § 1308.12(b)(1)",
    regulationUrl: "https://www.ecfr.gov/current/title-21/chapter-II/part-1308/subject-group-ECFR4839e8a0c3aa68f/section-1308.12",
    searchAliases: ["oxycodone", "oxycontin", "percocet"],
    summary:
      "Oxycodone is Schedule II under 21 CFR § 1308.12(b)(1).",
  },
  hydrocodone: {
    slug: "hydrocodone",
    canonicalName: "Hydrocodone",
    currentSchedule: "II",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "21 CFR § 1308.12(b)(1)(vi)",
    regulationUrl: "https://www.ecfr.gov/current/title-21/chapter-II/part-1308/subject-group-ECFR4839e8a0c3aa68f/section-1308.12",
    searchAliases: ["hydrocodone", "vicodin", "norco"],
    summary:
      "Hydrocodone combination products were rescheduled from Schedule III to Schedule II effective October 6, 2014 — a rescheduling window that affects any conduct alleged to span that date.",
  },
  morphine: {
    slug: "morphine",
    canonicalName: "Morphine",
    currentSchedule: "II",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "21 CFR § 1308.12(b)(1)(ix)",
    regulationUrl: "https://www.ecfr.gov/current/title-21/chapter-II/part-1308/subject-group-ECFR4839e8a0c3aa68f/section-1308.12",
    searchAliases: ["morphine"],
    summary:
      "Morphine is Schedule II.",
  },
  codeine: {
    slug: "codeine",
    canonicalName: "Codeine",
    currentSchedule: "II",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "21 CFR § 1308.12(a)(1)",
    regulationUrl: "https://www.ecfr.gov/current/title-21/chapter-II/part-1308/subject-group-ECFR4839e8a0c3aa68f/section-1308.12",
    searchAliases: ["codeine"],
    summary:
      "Codeine itself is Schedule II; certain codeine combination products are Schedule III or V depending on dose.",
  },
  tramadol: {
    slug: "tramadol",
    canonicalName: "Tramadol",
    currentSchedule: "IV",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "21 CFR § 1308.14(b)",
    regulationUrl: "https://www.ecfr.gov/current/title-21/chapter-II/part-1308/subject-group-ECFR0e9aab12b48f4ad/section-1308.14",
    searchAliases: ["tramadol", "ultram"],
    summary:
      "Tramadol was placed in Schedule IV effective August 18, 2014. Conduct alleged before that date involved an uncontrolled substance under federal law.",
  },
  buprenorphine: {
    slug: "buprenorphine",
    canonicalName: "Buprenorphine",
    currentSchedule: "III",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "21 CFR § 1308.13(e)",
    regulationUrl: "https://www.ecfr.gov/current/title-21/chapter-II/part-1308/subject-group-ECFR2f6cdf6f9d7c3da/section-1308.13",
    searchAliases: ["buprenorphine", "suboxone", "subutex"],
    summary:
      "Buprenorphine is Schedule III.",
  },
  methadone: {
    slug: "methadone",
    canonicalName: "Methadone",
    currentSchedule: "II",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "21 CFR § 1308.12(c)(15)",
    regulationUrl: "https://www.ecfr.gov/current/title-21/chapter-II/part-1308/subject-group-ECFR4839e8a0c3aa68f/section-1308.12",
    searchAliases: ["methadone"],
    summary:
      "Methadone is Schedule II.",
  },

  // -------- Stimulants --------
  cocaine: {
    slug: "cocaine",
    canonicalName: "Cocaine",
    currentSchedule: "II",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "21 CFR § 1308.12(b)(4)",
    regulationUrl: "https://www.ecfr.gov/current/title-21/chapter-II/part-1308/subject-group-ECFR4839e8a0c3aa68f/section-1308.12",
    searchAliases: ["cocaine"],
    summary:
      "Cocaine is Schedule II.",
  },
  methamphetamine: {
    slug: "methamphetamine",
    canonicalName: "Methamphetamine",
    currentSchedule: "II",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "21 CFR § 1308.12(d)(2)",
    regulationUrl: "https://www.ecfr.gov/current/title-21/chapter-II/part-1308/subject-group-ECFR4839e8a0c3aa68f/section-1308.12",
    searchAliases: ["methamphetamine", "meth"],
    summary:
      "Methamphetamine is Schedule II.",
  },
  amphetamine: {
    slug: "amphetamine",
    canonicalName: "Amphetamine",
    currentSchedule: "II",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "21 CFR § 1308.12(d)(1)",
    regulationUrl: "https://www.ecfr.gov/current/title-21/chapter-II/part-1308/subject-group-ECFR4839e8a0c3aa68f/section-1308.12",
    searchAliases: ["amphetamine", "adderall"],
    summary:
      "Amphetamine is Schedule II.",
  },
  mdma: {
    slug: "mdma",
    canonicalName: "MDMA (Ecstasy)",
    currentSchedule: "I",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "21 CFR § 1308.11(d)(11)",
    regulationUrl: "https://www.ecfr.gov/current/title-21/chapter-II/part-1308/subject-group-ECFR3811cb39d8ad2dd/section-1308.11",
    searchAliases: ["mdma", "ecstasy", "methylenedioxymethamphetamine"],
    summary:
      "MDMA was placed in Schedule I in 1985 via emergency scheduling. The FDA has approved MDMA-assisted therapy clinical trials, but recreational possession remains Schedule I.",
  },

  // -------- Hallucinogens --------
  lsd: {
    slug: "lsd",
    canonicalName: "LSD (Lysergic Acid Diethylamide)",
    currentSchedule: "I",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "21 CFR § 1308.11(d)(15)",
    regulationUrl: "https://www.ecfr.gov/current/title-21/chapter-II/part-1308/subject-group-ECFR3811cb39d8ad2dd/section-1308.11",
    searchAliases: ["lsd", "lysergic acid"],
    summary:
      "LSD has been Schedule I since the 1970 Controlled Substances Act.",
  },
  psilocybin: {
    slug: "psilocybin",
    canonicalName: "Psilocybin",
    currentSchedule: "I",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "21 CFR § 1308.11(d)(20)",
    regulationUrl: "https://www.ecfr.gov/current/title-21/chapter-II/part-1308/subject-group-ECFR3811cb39d8ad2dd/section-1308.11",
    searchAliases: ["psilocybin", "psilocyn", "magic mushroom"],
    summary:
      "Psilocybin is federally Schedule I. Several states (OR, CO) have decriminalized or established therapeutic frameworks — federal/state divergence is the question.",
  },
  ketamine: {
    slug: "ketamine",
    canonicalName: "Ketamine",
    currentSchedule: "III",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "21 CFR § 1308.13(c)(7)",
    regulationUrl: "https://www.ecfr.gov/current/title-21/chapter-II/part-1308/subject-group-ECFR2f6cdf6f9d7c3da/section-1308.13",
    searchAliases: ["ketamine"],
    summary:
      "Ketamine was placed in Schedule III in 1999. Telehealth ketamine prescribing rules have been the subject of multiple Federal Register actions through 2024-2026.",
  },
  ghb: {
    slug: "ghb",
    canonicalName: "GHB (Gamma-Hydroxybutyric Acid)",
    currentSchedule: "I",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "21 CFR § 1308.11(c)",
    regulationUrl: "https://www.ecfr.gov/current/title-21/chapter-II/part-1308/subject-group-ECFR3811cb39d8ad2dd/section-1308.11",
    searchAliases: ["ghb", "gamma-hydroxybutyric", "sodium oxybate"],
    summary:
      "GHB is Schedule I. The pharmaceutical preparation sodium oxybate (Xyrem) is Schedule III — formulation and prescription status matter to the charge.",
  },
  dmt: {
    slug: "dmt",
    canonicalName: "DMT (Dimethyltryptamine)",
    currentSchedule: "I",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "21 CFR § 1308.11(d)(7)",
    regulationUrl: "https://www.ecfr.gov/current/title-21/chapter-II/part-1308/subject-group-ECFR3811cb39d8ad2dd/section-1308.11",
    searchAliases: ["dmt", "dimethyltryptamine", "ayahuasca"],
    summary:
      "DMT is Schedule I; religious-use exemptions (UDV, Santo Daime) exist via RFRA case law.",
  },
  mescaline: {
    slug: "mescaline",
    canonicalName: "Mescaline",
    currentSchedule: "I",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "21 CFR § 1308.11(d)(17)",
    regulationUrl: "https://www.ecfr.gov/current/title-21/chapter-II/part-1308/subject-group-ECFR3811cb39d8ad2dd/section-1308.11",
    searchAliases: ["mescaline", "peyote"],
    summary:
      "Mescaline is Schedule I; the Native American Church peyote exemption is codified at 21 CFR § 1307.31.",
  },

  // -------- Benzodiazepines --------
  alprazolam: {
    slug: "alprazolam",
    canonicalName: "Alprazolam (Xanax)",
    currentSchedule: "IV",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "21 CFR § 1308.14(c)",
    regulationUrl: "https://www.ecfr.gov/current/title-21/chapter-II/part-1308/subject-group-ECFR0e9aab12b48f4ad/section-1308.14",
    searchAliases: ["alprazolam", "xanax"],
    summary:
      "Alprazolam is Schedule IV.",
  },
  diazepam: {
    slug: "diazepam",
    canonicalName: "Diazepam (Valium)",
    currentSchedule: "IV",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "21 CFR § 1308.14(c)",
    regulationUrl: "https://www.ecfr.gov/current/title-21/chapter-II/part-1308/subject-group-ECFR0e9aab12b48f4ad/section-1308.14",
    searchAliases: ["diazepam", "valium"],
    summary:
      "Diazepam is Schedule IV.",
  },
  clonazepam: {
    slug: "clonazepam",
    canonicalName: "Clonazepam (Klonopin)",
    currentSchedule: "IV",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "21 CFR § 1308.14(c)",
    regulationUrl: "https://www.ecfr.gov/current/title-21/chapter-II/part-1308/subject-group-ECFR0e9aab12b48f4ad/section-1308.14",
    searchAliases: ["clonazepam", "klonopin"],
    summary:
      "Clonazepam is Schedule IV.",
  },
  lorazepam: {
    slug: "lorazepam",
    canonicalName: "Lorazepam (Ativan)",
    currentSchedule: "IV",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "21 CFR § 1308.14(c)",
    regulationUrl: "https://www.ecfr.gov/current/title-21/chapter-II/part-1308/subject-group-ECFR0e9aab12b48f4ad/section-1308.14",
    searchAliases: ["lorazepam", "ativan"],
    summary:
      "Lorazepam is Schedule IV.",
  },

  // -------- Anabolic steroids --------
  testosterone: {
    slug: "testosterone",
    canonicalName: "Testosterone",
    currentSchedule: "III",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "21 CFR § 1308.13(f)(1)",
    regulationUrl: "https://www.ecfr.gov/current/title-21/chapter-II/part-1308/subject-group-ECFR2f6cdf6f9d7c3da/section-1308.13",
    searchAliases: ["testosterone", "anabolic steroid"],
    summary:
      "Testosterone is Schedule III. The 2014 Designer Anabolic Steroid Control Act expanded the list — substances added that year sit in a defined pre-Act window.",
  },

  // -------- Other notable substances --------
  kratom: {
    slug: "kratom",
    canonicalName: "Kratom (Mitragyna speciosa)",
    currentSchedule: "uncontrolled",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "Federally uncontrolled (DEA withdrew proposed scheduling 2016-10-13)",
    regulationUrl: "https://www.federalregister.gov/documents/2016/10/13/2016-24659/withdrawal-of-notice-of-intent-to-temporarily-place-mitragynine-and-7-hydroxymitragynine-into",
    searchAliases: ["kratom", "mitragynine", "7-hydroxymitragynine", "mitragyna"],
    summary:
      "Kratom and its alkaloids (mitragynine, 7-hydroxymitragynine) are federally uncontrolled — DEA withdrew its August 2016 notice of intent to schedule them in October 2016. Several states have independently scheduled or banned kratom.",
  },
  "synthetic-cathinones": {
    slug: "synthetic-cathinones",
    canonicalName: "Synthetic Cathinones (Bath Salts class)",
    currentSchedule: "I",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "21 CFR § 1308.11(g) (class scheduling)",
    regulationUrl: "https://www.deadiversion.usdoj.gov/fed_regs/rules/2013/fr0312.htm",
    searchAliases: ["synthetic cathinone", "bath salt", "mephedrone", "mdpv", "methylone"],
    summary:
      "Synthetic cathinones (mephedrone, MDPV, methylone) were placed in Schedule I via class-wide scheduling. Pre-class possession dates sit in an analog-only window.",
  },
  "synthetic-cannabinoids": {
    slug: "synthetic-cannabinoids",
    canonicalName: "Synthetic Cannabinoids (K2/Spice class)",
    currentSchedule: "I",
    currentScheduleAsOf: "2026-05-03",
    regulationCitation: "21 CFR § 1308.11(h) (class-wide scheduling, expanded multiple times)",
    regulationUrl: "https://www.deadiversion.usdoj.gov/schedules/orangebook/c_cs_alpha.pdf",
    searchAliases: ["synthetic cannabinoid", "k2", "spice", "jwh-018", "ab-pinaca", "fub-amb", "5f-pb22"],
    summary:
      "Synthetic cannabinoids (the K2/Spice family) have been placed in Schedule I in waves — JWH-018 (2011), AB-PINACA family (2014), 5F-MDMB-PICA + others (2026). Each wave creates a window: a substance possessed before its specific listing was controlled only by analog inference.",
  },
};

/**
 * Lookup substance by slug. Returns null for unknown substances.
 * Caller MUST handle null case (no fabrication).
 */
export function getSubstanceBySlug(slug: string): SubstanceEntry | null {
  return SUBSTANCE_TAXONOMY[slug] ?? null;
}

/**
 * List all known substance slugs (for UI/intake validation).
 */
export function listSubstanceSlugs(): string[] {
  return Object.keys(SUBSTANCE_TAXONOMY).sort();
}

/**
 * Total entries in the seed taxonomy.
 */
export function substanceTaxonomySize(): number {
  return Object.keys(SUBSTANCE_TAXONOMY).length;
}

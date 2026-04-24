/**
 * Shared charge-slug lookup tables for tier9-reports + IB appendices.
 *
 * The datasets (motion_outcome_rates, charge_type_top_authorities) use
 * **internal** charge slugs (e.g. "dui-dwi", "drug-possession-cocaine",
 * "sexual-assault") that do NOT match ALLOWED_CHARGE_TYPES (user-facing
 * intake slugs like "dui", "drug-possession"). Every report module that
 * touches those tables needs the same bridge.
 *
 * Previously duplicated inline in:
 *   - src/lib/tier9-reports/motion-success-report.ts (CHARGE_TYPE_MOR_MAP)
 *   - src/lib/tier9-reports/charge-authority-pack.ts (CHARGE_TYPE_AUTHORITY_MAP)
 *
 * Extracted here 2026-04-23 for IB E1 (Appendix G + H) to consume. Source
 * branches: feat/motion-success-report-197 + feat/charge-authority-pack-97.
 *
 * **Deliberately narrow** — only contains slugs verified live in the tables
 * as of 2026-04-22. Unmapped charges fall through to national "(all)" or
 * citation_authority_criminal fallback with a limitation note. No guessing.
 */

// ============================================================
// motion_outcome_rates.charge_type slugs (54 distinct values)
// ============================================================
export const CHARGE_TYPE_MOR_MAP: Record<string, string[]> = {
  "drug-possession": [
    "drug-possession",
    "drug-possession-marijuana",
    "drug-possession-cocaine",
    "drug-possession-meth",
    "drug-possession-opioids",
    "drug-possession-prescription",
    "drug-possession-with-intent",
  ],
  "drug-trafficking": ["drug-trafficking", "drug-distribution", "drug-manufacturing"],
  dui: [
    "dui",
    "dui-dwi",
    "dui-first-offense",
    "dui-repeat-offense",
    "dui-third-offense",
    "dui-drugs",
    "dui-felony-injury",
  ],
  "dui-first": ["dui-first-offense", "dui-dwi"],
  "dui-repeat": ["dui-repeat-offense", "dui-third-offense"],
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
  "domestic-violence": [
    "domestic-violence",
    "domestic-battery",
    "violation-protective-order",
  ],
  theft: [
    "theft",
    "theft-larceny",
    "grand-theft",
    "petty-theft",
    "shoplifting",
    "receiving-stolen-property",
    "motor-vehicle-theft",
  ],
  "sex-offense": [
    "sex-offense",
    "sex-offense-contact",
    "sex-offense-digital",
    "sexual-assault",
    "sexual-battery",
    "rape",
    "statutory-rape",
    "indecent-exposure",
  ],
  "sex-offense-contact": [
    "sex-offense-contact",
    "sexual-assault",
    "sexual-battery",
    "rape",
    "statutory-rape",
  ],
  "sex-offense-digital": [
    "sex-offense-digital",
    "child-exploitation",
    "production-child-pornography",
  ],
  weapons: [
    "weapons-possession",
    "felony-firearm",
    "felon-in-possession",
    "possession-prohibited-weapon",
    "weapons-school-zone",
    "illegal-discharge",
  ],
  "white-collar": [
    "fraud-general",
    "wire-fraud",
    "securities-fraud",
    "tax-fraud",
    "insurance-fraud",
    "credit-card-fraud",
    "prescription-fraud",
    "money-laundering",
    "embezzlement",
    "identity-theft",
    "forgery",
    "bad-checks",
  ],
  federal: [],
  "probation-violation": [
    "probation-violation-technical",
    "probation-violation-substantive",
    "parole-violation",
    "community-control-violation",
    "supervised-release-violation",
  ],
  "self-defense": [],
  other: ["other"],
  murder: ["murder", "murder-first-degree", "murder-second-degree", "attempted-murder"],
  manslaughter: [
    "voluntary-manslaughter",
    "involuntary-manslaughter",
    "vehicular-manslaughter",
    "vehicular-homicide",
  ],
  kidnapping: ["kidnapping", "unlawful-imprisonment"],
  arson: ["arson"],
  stalking: ["stalking", "aggravated-stalking"],
  "child-abuse": ["child-abuse", "child-endangerment"],
  "hit-and-run": ["hit-and-run"],
  contempt: ["contempt-of-court", "criminal-contempt"],
  robbery: ["robbery", "armed-robbery", "home-invasion"],
  burglary: ["burglary", "residential-burglary", "commercial-burglary"],
  fraud: [
    "fraud-general",
    "wire-fraud",
    "securities-fraud",
    "tax-fraud",
    "insurance-fraud",
    "credit-card-fraud",
    "prescription-fraud",
    "identity-theft",
  ],
  drug: [
    "drug-possession",
    "drug-trafficking",
    "drug-distribution",
    "drug-manufacturing",
    "drug-paraphernalia",
  ],
  "other-felony": [],
  "other-misdemeanor": [],
};

// ============================================================
// charge_type_top_authorities.charge_type slugs (subset of 54)
// ============================================================
// Verified against live table 2026-04-23. Some MOR slugs (domestic-battery,
// assault, theft, murder-first-degree) don't appear in top_authorities yet —
// those fall through to citation_authority_criminal fallback.
export const CHARGE_TYPE_AUTHORITY_MAP: Record<string, string[]> = {
  "drug-possession": [
    "drug-possession-marijuana",
    "drug-possession-cocaine",
    "drug-possession-opioids",
    "drug-possession-prescription",
  ],
  "drug-trafficking": ["drug-trafficking", "drug-distribution", "drug-manufacturing"],
  dui: ["dui-dwi", "dui-drugs", "dui-felony-injury", "refusing-breath-test"],
  "dui-first": ["dui-dwi"],
  "dui-repeat": ["dui-dwi", "dui-felony-injury"],
  assault: [
    "simple-assault",
    "aggravated-assault",
    "aggravated-battery",
    "assault-firearm",
    "assault-police-officer",
    "battery",
  ],
  "domestic-violence": [],
  theft: ["theft-larceny"],
  "sex-offense": [
    "sex-offense-contact",
    "sex-offense-digital",
    "sexual-assault",
    "indecent-exposure",
  ],
  "sex-offense-contact": ["sex-offense-contact", "sexual-assault"],
  "sex-offense-digital": ["sex-offense-digital", "child-exploitation"],
  weapons: ["weapons-possession", "felon-in-possession", "illegal-discharge"],
  "white-collar": ["fraud-general", "embezzlement", "forgery"],
  federal: [],
  "probation-violation": ["supervised-release-violation"],
  "self-defense": [],
  other: ["other"],
  murder: ["murder-second-degree"],
  manslaughter: ["voluntary-manslaughter", "vehicular-homicide"],
  kidnapping: ["kidnapping", "unlawful-imprisonment"],
  arson: [],
  stalking: ["stalking"],
  "child-abuse": ["child-endangerment"],
  "hit-and-run": ["hit-and-run"],
  contempt: ["contempt-of-court"],
  robbery: ["robbery", "home-invasion"],
  burglary: ["burglary"],
  fraud: ["fraud-general", "embezzlement", "forgery"],
  drug: [
    "drug-possession-marijuana",
    "drug-possession-cocaine",
    "drug-possession-opioids",
    "drug-possession-prescription",
    "drug-trafficking",
    "drug-distribution",
    "drug-manufacturing",
  ],
  "other-felony": [],
  "other-misdemeanor": ["disorderly-conduct", "loitering", "vandalism"],
};

// ============================================================
// State → Federal Circuit (for motion_outcome_rates_by_circuit)
// ============================================================
// Restricted to the circuit domain stored in motion_outcome_rates_by_circuit
// ("1".."11", "DC"). SCOTUS / Federal Circuit are not exposed to intake —
// neither is jurisdictionally relevant for a state criminal defendant
// filing circuit-wide motion patterns.
export const STATE_TO_CIRCUIT: Record<string, string> = {
  ME: "1", MA: "1", NH: "1", RI: "1",
  NY: "2", CT: "2", VT: "2",
  PA: "3", NJ: "3", DE: "3",
  MD: "4", VA: "4", WV: "4", NC: "4", SC: "4",
  TX: "5", LA: "5", MS: "5",
  OH: "6", MI: "6", KY: "6", TN: "6",
  IL: "7", IN: "7", WI: "7",
  MN: "8", IA: "8", MO: "8", AR: "8", ND: "8", SD: "8", NE: "8",
  CA: "9", OR: "9", WA: "9", AZ: "9", NV: "9", ID: "9", MT: "9", AK: "9", HI: "9",
  CO: "10", KS: "10", NM: "10", OK: "10", UT: "10", WY: "10",
  FL: "11", GA: "11", AL: "11",
  DC: "DC",
};

export const CIRCUIT_NAMES: Record<string, string> = {
  "1": "First Circuit",
  "2": "Second Circuit",
  "3": "Third Circuit",
  "4": "Fourth Circuit",
  "5": "Fifth Circuit",
  "6": "Sixth Circuit",
  "7": "Seventh Circuit",
  "8": "Eighth Circuit",
  "9": "Ninth Circuit",
  "10": "Tenth Circuit",
  "11": "Eleventh Circuit",
  DC: "D.C. Circuit",
};

export const VALID_CIRCUITS = new Set(Object.keys(CIRCUIT_NAMES));

export function resolveCircuitFromStateOrCircuit(
  circuit: string | null | undefined,
  state: string | null | undefined,
): string | null {
  const raw = (circuit ?? "").trim();
  if (raw && VALID_CIRCUITS.has(raw)) return raw;
  const st = (state ?? "").trim().toUpperCase();
  if (st && STATE_TO_CIRCUIT[st]) return STATE_TO_CIRCUIT[st];
  return null;
}

// ============================================================
// UPL phrase blocklist (shared across tier9 + IB appendices + playbook)
// ============================================================
//
// Canonical 11-phrase blocklist — consolidates prior 6-phrase local copies
// spread across tier9-reports/, xray-sections/, ib-appendices/, and
// playbook-addendum/. Extended 2026-04-23 per Round 1 wave-pristine audit:
//   +"will likely", +"almost certainly"           (predictive language)
//   +"your attorney must"                         (directive to counsel)
//   +"best course of action"                      (advice framing)
//   +"consult your attorney"                      (advice-adjacent — was
//    already present in warroom-precedent-delta's local copy; keeping it
//    here canonical prevents drift and satisfies the warroom test-suite's
//    contain-check)
//
// `scanForUplPhrases` returns every banned phrase found in the supplied
// HTML/markdown (lower-cased match). Callers SHOULD pre-strip any
// framing/quote blocks whose text is intentionally verbatim public record
// (e.g. pattern jury instructions) — see `federal-jury-instruction-brief`
// and `federal-pji-cross-ref` for the PJI-body carve-out pattern.
export const UPL_BANNED_PHRASES = [
  "you should",
  "we recommend",
  "we advise",
  "your best option",
  "ask your attorney",
  "publicly available",
  "will likely",
  "almost certainly",
  "your attorney must",
  "best course of action",
  "consult your attorney",
] as const;

export function scanForUplPhrases(html: string): readonly string[] {
  const lower = (html ?? "").toLowerCase();
  return UPL_BANNED_PHRASES.filter((p) => lower.includes(p));
}

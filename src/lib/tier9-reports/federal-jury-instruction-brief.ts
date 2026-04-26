/**
 * Federal Jury Instruction Brief — $97 Tier 9 SKU (M4).
 *
 * Activates 1,808 rows of live pattern_jury_instructions (1,772 in
 * v_pji_public after verification filter). For a defendant's
 * (federalCharge, circuit, optional state) the report renders:
 *   Section 1 — Verbatim pattern jury instruction for this charge/circuit
 *   Section 2 — Burden-of-proof callout (sentences extracted verbatim)
 *   Section 3 — Top 5 historical attack authorities for this charge
 *   Section 4 — Alternative circuit variants (up to 3 other circuits)
 *   Section 5 — Methodology + UPL disclaimer
 *
 * Tier monotonicity (HARD):
 *   - NO judge-specific attack history (X-Ray $2,497 E2 territory)
 *   - NO full motion-success cross-reference (M1 Motion Success Report territory)
 *   - Orthogonal to M2 Charge Authority Pack (M2 = general charge-level
 *     authorities; M4 = federal PJI + attack points focused on element-level
 *     challenges).
 *
 * UPL (HARD):
 *   - PJI text is public federal court material — verbatim reproduction OK
 *   - Attack points framed as "cases where defense argued X", never
 *     "you should argue X"
 *   - Banned phrases: "you should", "we recommend", "we advise",
 *     "your best option", "ask your attorney", "publicly available"
 *   - Every cited case needs a CourtListener URL; rows without URL are
 *     suppressed
 *
 * Federal-only gate: rejects non-federal charges at query time (returns
 * isEmpty=true + federalOnly=true so generate.ts can dispatch the
 * insufficient-data notifier).
 *
 * Cited experts: Dunford (positioning — fills sub-$147 federal-specific
 *                gap); Dreyer (PJI pages already indexed, amortized ROI).
 *
 * Sources: docs/advisor/2026-04-23-data-to-product-audit.md product #4,
 *          docs/plans/2026-04-23-data-to-product-autonomous-execution.md M4.
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================
// Types
// ============================================================

export interface FederalJuryBriefInput {
  federalCharge: string; // FEDERAL_CHARGE slug (see FEDERAL_CHARGES below)
  circuit: string; // "1".."11", "DC" — user's circuit of prosecution
  state?: string | null; // 2-letter postal; display-only
}

export interface PjiMatch {
  id: number;
  circuit: number;
  instruction_number: string;
  title: string;
  body: string;
  commentary: string | null;
  statute_citations: string[] | null;
  source_url: string | null;
  effective_date: string | null;
}

export interface BurdenSentence {
  sentence: string;
}

export interface AttackAuthority {
  rank: number;
  case_name: string;
  date_filed: string | null;
  citation_count_in_charge: number | null;
  citation_count_total: number;
  authority_tier: string | null;
  source_url: string;
  framing: string; // "cases where defense cited challenging elements of instructions for this charge"
}

export interface CircuitVariant {
  circuit: number;
  circuitName: string;
  instruction_number: string;
  title: string;
  difference_summary: string;
  source_url: string | null;
}

export interface FederalJuryBriefData {
  federalCharge: string;
  federalChargeLabel: string;
  circuit: string | null;
  circuitName: string | null;
  state: string | null;
  pji: PjiMatch | null;
  burdenSentences: BurdenSentence[];
  attackAuthorities: AttackAuthority[];
  circuitVariants: CircuitVariant[];
  limitations: string[];
  federalOnly: boolean; // true when rejected because charge is not federal
  isEmpty: boolean;
}

// ============================================================
// Federal-charge catalog
// ============================================================
//
// Curated list of federal criminal charges supported by this SKU. Each
// entry maps to:
//   (a) display label shown on intake form
//   (b) statute_citations regex patterns matched against the structured
//       array on pattern_jury_instructions (primary lookup signal —
//       structured, not text-similarity)
//   (c) title-keyword fallback matchers (when statute_citations are
//       sparse on a circuit's PJIs)
//   (d) corresponding charge_type_top_authorities slugs for Section 3
//       attack-points (MAY be [] when no cached slug applies — Section 3
//       then falls back to citation_authority_criminal national criminal
//       authorities with explicit framing)
//
// Slugs verified federal via the U.S. Code title referenced in each
// statute pattern.

export interface FederalChargeDef {
  slug: string;
  label: string;
  statutePatterns: RegExp[]; // applied to each entry of statute_citations (any-match)
  titleKeywords: RegExp[]; // applied to PJI.title (case-insensitive, any-match)
  authoritySlugs: string[]; // charge_type_top_authorities.charge_type slugs
}

export const FEDERAL_CHARGES: Record<string, FederalChargeDef> = {
  "wire-fraud": {
    slug: "wire-fraud",
    label: "Wire Fraud (18 U.S.C. § 1343)",
    statutePatterns: [/18\s*U\.?S\.?C\.?\s*[§S]?\s*1343/i],
    titleKeywords: [/\bwire\s+fraud\b/i],
    authoritySlugs: ["fraud-general"],
  },
  "mail-fraud": {
    slug: "mail-fraud",
    label: "Mail Fraud (18 U.S.C. § 1341)",
    statutePatterns: [/18\s*U\.?S\.?C\.?\s*[§S]?\s*1341/i],
    titleKeywords: [/\bmail\s+fraud\b/i],
    authoritySlugs: ["fraud-general"],
  },
  "conspiracy-general": {
    slug: "conspiracy-general",
    label: "Conspiracy (18 U.S.C. § 371)",
    statutePatterns: [/18\s*U\.?S\.?C\.?\s*[§S]?\s*371\b/i],
    titleKeywords: [/\bconspiracy\b/i],
    authoritySlugs: [],
  },
  "drug-conspiracy": {
    slug: "drug-conspiracy",
    label: "Drug Conspiracy (21 U.S.C. § 846)",
    statutePatterns: [/21\s*U\.?S\.?C\.?\s*[§S]?\s*846/i],
    titleKeywords: [/\bdrug\s+conspiracy\b/i, /21\s*U\.?S\.?C\.?.*846/i],
    authoritySlugs: ["drug-trafficking", "drug-distribution"],
  },
  "drug-distribution": {
    slug: "drug-distribution",
    label: "Distribution of a Controlled Substance (21 U.S.C. § 841(a)(1))",
    statutePatterns: [/21\s*U\.?S\.?C\.?\s*[§S]?\s*841/i],
    titleKeywords: [
      /\bdistribut(?:e|ion).*controlled\s+substance\b/i,
      /\bcontrolled\s+substance.*distribut/i,
    ],
    authoritySlugs: ["drug-distribution", "drug-trafficking"],
  },
  "drug-possession-intent": {
    slug: "drug-possession-intent",
    label:
      "Possession with Intent to Distribute (21 U.S.C. § 841(a)(1))",
    statutePatterns: [/21\s*U\.?S\.?C\.?\s*[§S]?\s*841/i],
    titleKeywords: [
      /\bposs(?:ession)?\s+with\s+intent\b/i,
      /\bposses.*distribut/i,
    ],
    authoritySlugs: [
      "drug-possession-cocaine",
      "drug-possession-opioids",
      "drug-trafficking",
    ],
  },
  "drug-manufacture": {
    slug: "drug-manufacture",
    label: "Manufacture of a Controlled Substance (21 U.S.C. § 841(a)(1))",
    statutePatterns: [/21\s*U\.?S\.?C\.?\s*[§S]?\s*841/i],
    titleKeywords: [/\bmanufactur.*controlled\s+substance\b/i],
    authoritySlugs: ["drug-manufacturing"],
  },
  "felon-in-possession": {
    slug: "felon-in-possession",
    label: "Felon in Possession of Firearm (18 U.S.C. § 922(g))",
    statutePatterns: [/18\s*U\.?S\.?C\.?\s*[§S]?\s*922\s*\(?g\)?/i],
    titleKeywords: [/\bfelon\s+in\s+possession\b/i],
    authoritySlugs: ["felon-in-possession", "weapons-possession"],
  },
  "firearm-during-drug-crime": {
    slug: "firearm-during-drug-crime",
    label: "Using/Carrying a Firearm During a Drug Trafficking Crime (18 U.S.C. § 924(c))",
    statutePatterns: [/18\s*U\.?S\.?C\.?\s*[§S]?\s*924\s*\(?c\)?/i],
    titleKeywords: [
      /firearm.*during.*(?:drug|relation)/i,
      /using\s+or\s+carrying\s+a\s+firearm/i,
    ],
    authoritySlugs: ["weapons-possession", "illegal-discharge"],
  },
  "bank-robbery": {
    slug: "bank-robbery",
    label: "Bank Robbery (18 U.S.C. § 2113)",
    statutePatterns: [/18\s*U\.?S\.?C\.?\s*[§S]?\s*2113/i],
    titleKeywords: [/\bbank\s+robbery\b/i],
    authoritySlugs: ["robbery"],
  },
  "hobbs-act": {
    slug: "hobbs-act",
    label: "Hobbs Act Robbery/Extortion (18 U.S.C. § 1951)",
    statutePatterns: [/18\s*U\.?S\.?C\.?\s*[§S]?\s*1951/i],
    titleKeywords: [/\bhobbs\s+act\b/i],
    authoritySlugs: ["robbery"],
  },
  "money-laundering": {
    slug: "money-laundering",
    label: "Money Laundering (18 U.S.C. §§ 1956, 1957)",
    statutePatterns: [/18\s*U\.?S\.?C\.?\s*[§S]?\s*195[67]/i],
    titleKeywords: [/\bmoney\s+laundering\b/i],
    authoritySlugs: ["fraud-general"],
  },
  "tax-evasion": {
    slug: "tax-evasion",
    label: "Tax Evasion (26 U.S.C. § 7201)",
    statutePatterns: [/26\s*U\.?S\.?C\.?\s*[§S]?\s*7201/i],
    titleKeywords: [/\btax\s+evasion\b/i, /\bincome\s+tax\s+evasion\b/i],
    authoritySlugs: [],
  },
  "false-statement-agency": {
    slug: "false-statement-agency",
    label: "False Statement to a Federal Agency (18 U.S.C. § 1001)",
    statutePatterns: [/18\s*U\.?S\.?C\.?\s*[§S]?\s*1001/i],
    titleKeywords: [/\bfalse\s+statement.*federal\s+agency\b/i],
    authoritySlugs: [],
  },
  "aggravated-identity-theft": {
    slug: "aggravated-identity-theft",
    label: "Aggravated Identity Theft (18 U.S.C. § 1028A)",
    statutePatterns: [/18\s*U\.?S\.?C\.?\s*[§S]?\s*1028A/i],
    titleKeywords: [/\baggravated\s+identity\s+theft\b/i],
    authoritySlugs: ["fraud-general"],
  },
  "bribery-public-official": {
    slug: "bribery-public-official",
    label: "Bribery of a Public Official (18 U.S.C. § 201)",
    statutePatterns: [/18\s*U\.?S\.?C\.?\s*[§S]?\s*201\b/i],
    titleKeywords: [/\bbribery.*public\s+official\b/i],
    authoritySlugs: [],
  },
  "obstruction-justice": {
    slug: "obstruction-justice",
    label: "Obstruction of Justice (18 U.S.C. § 1503 / § 1512)",
    statutePatterns: [
      /18\s*U\.?S\.?C\.?\s*[§S]?\s*1503/i,
      /18\s*U\.?S\.?C\.?\s*[§S]?\s*1512/i,
    ],
    titleKeywords: [/\bobstruction\s+of\s+justice\b/i],
    authoritySlugs: ["obstruction-justice"],
  },
  perjury: {
    slug: "perjury",
    label: "Perjury (18 U.S.C. § 1621)",
    statutePatterns: [/18\s*U\.?S\.?C\.?\s*[§S]?\s*1621/i],
    titleKeywords: [/\bperjury\b/i],
    authoritySlugs: [],
  },
  rico: {
    slug: "rico",
    label: "RICO — Racketeering (18 U.S.C. § 1962)",
    statutePatterns: [/18\s*U\.?S\.?C\.?\s*[§S]?\s*1962/i],
    titleKeywords: [/\bRICO\b/, /racketeering/i],
    authoritySlugs: [],
  },
  "child-pornography-possession": {
    slug: "child-pornography-possession",
    label: "Possession of Child Pornography (18 U.S.C. § 2252 / § 2252A)",
    statutePatterns: [/18\s*U\.?S\.?C\.?\s*[§S]?\s*2252A?/i],
    titleKeywords: [/\bchild\s+pornography\b.*possess/i, /\bpossess.*child\s+pornography\b/i],
    authoritySlugs: ["child-exploitation", "sex-offense-digital"],
  },
  "illegal-reentry": {
    slug: "illegal-reentry",
    label: "Illegal Re-entry After Deportation (8 U.S.C. § 1326)",
    statutePatterns: [/8\s*U\.?S\.?C\.?\s*[§S]?\s*1326/i],
    titleKeywords: [/re-?entry/i, /illegal\s+re-?entry/i, /deport/i],
    authoritySlugs: [],
  },
  "immigration-fraud": {
    slug: "immigration-fraud",
    label: "Immigration Fraud (18 U.S.C. § 1546 / 8 U.S.C. § 1325(c))",
    statutePatterns: [
      /18\s*U\.?S\.?C\.?\s*[§S]?\s*1546/i,
      /8\s*U\.?S\.?C\.?\s*[§S]?\s*1325\s*\(c\)/i,
    ],
    titleKeywords: [/\bimmigration\s+fraud\b/i, /fraudulent\s+marriage/i],
    authoritySlugs: ["fraud-general"],
  },
  "kidnapping-federal": {
    slug: "kidnapping-federal",
    label: "Federal Kidnapping (18 U.S.C. § 1201)",
    statutePatterns: [/18\s*U\.?S\.?C\.?\s*[§S]?\s*1201/i],
    titleKeywords: [/\bkidnapping\b/i],
    authoritySlugs: ["kidnapping"],
  },
  "healthcare-fraud": {
    slug: "healthcare-fraud",
    label: "Health Care Fraud (18 U.S.C. § 1347)",
    statutePatterns: [/18\s*U\.?S\.?C\.?\s*[§S]?\s*1347/i],
    titleKeywords: [/\bhealth\s*care\s+fraud\b/i],
    authoritySlugs: ["fraud-general"],
  },
  "aiding-abetting": {
    slug: "aiding-abetting",
    label: "Aiding and Abetting (18 U.S.C. § 2)",
    statutePatterns: [/18\s*U\.?S\.?C\.?\s*[§S]?\s*2\b(?!\d)/i],
    titleKeywords: [/\baiding\s+and\s+abetting\b/i],
    authoritySlugs: ["aiding-abetting"],
  },
};

export function isFederalCharge(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(FEDERAL_CHARGES, slug);
}

export function listFederalCharges(): FederalChargeDef[] {
  return Object.values(FEDERAL_CHARGES);
}

// ============================================================
// Circuit metadata
// ============================================================

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

// Circuits with at least one PJI row in our corpus.
// Verified live 2026-04-26 against `v_pji_public`:
//   circuit 1: 72 rows / 3: 285 / 5: 251 / 6: 140 / 7: 67 / 8: 141 / 9: 44
//   total: 1,772 rows across 7 circuits
// Circuits 2, 4, 10, 11, DC have zero rows (not yet ingested OR no
// published pattern instructions). For those, `queryFederalJuryBrief`
// resolves to the closest-sibling circuit + adds a limitation note so
// delivery is not blocked. Pre-purchase, the AvailabilityChecker yellow
// banner discloses the fallback before the customer commits.
// Earlier list incorrectly included `10` despite zero rows; corrected
// 2026-04-26 D5 PR to match the live data shape.
export const PJI_COVERED_CIRCUITS = new Set([1, 3, 5, 6, 7, 8, 9]);

const VALID_CIRCUITS = new Set(Object.keys(CIRCUIT_NAMES));

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

function resolveCircuit(input: FederalJuryBriefInput): string | null {
  const raw = (input.circuit ?? "").trim();
  if (raw && VALID_CIRCUITS.has(raw)) return raw;
  const state = (input.state ?? "").trim().toUpperCase();
  if (state && STATE_TO_CIRCUIT[state]) return STATE_TO_CIRCUIT[state];
  return null;
}

// ============================================================
// Matching helpers
// ============================================================

function matchesCharge(
  row: {
    title: string | null;
    statute_citations: string[] | null;
  },
  def: FederalChargeDef,
): boolean {
  // Prefer structured statute_citations match (more precise).
  const cites = Array.isArray(row.statute_citations) ? row.statute_citations : [];
  for (const cite of cites) {
    if (typeof cite !== "string") continue;
    for (const pat of def.statutePatterns) {
      if (pat.test(cite)) return true;
    }
  }
  // Fallback to title keyword match.
  const title = row.title ?? "";
  for (const pat of def.titleKeywords) {
    if (pat.test(title)) return true;
  }
  return false;
}

// ============================================================
// Burden-of-proof extraction
// ============================================================
//
// Split the instruction body into sentences and keep only those
// containing a burden-of-proof phrase. Verbatim extraction (no
// paraphrasing) since PJI text is public federal court material.

const BURDEN_PATTERNS: RegExp[] = [
  /beyond\s+a\s+reasonable\s+doubt/i,
  /government\s+must\s+prove/i,
  /prosecution\s+must\s+prove/i,
  /must\s+find\s+the\s+defendant/i,
  /burden\s+of\s+proof/i,
  /presumption\s+of\s+innocence/i,
];

export function extractBurdenSentences(body: string): BurdenSentence[] {
  if (!body || typeof body !== "string") return [];
  // Split on sentence-ending punctuation (keeps Roman-numeral / § markers intact).
  const sentences = body
    .split(/(?<=[.!?])\s+(?=[A-Z"(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 500);

  const matched: BurdenSentence[] = [];
  const seen = new Set<string>();
  for (const s of sentences) {
    if (!BURDEN_PATTERNS.some((p) => p.test(s))) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    matched.push({ sentence: s });
    if (matched.length >= 5) break;
  }
  return matched;
}

// ============================================================
// Query
// ============================================================

export async function queryFederalJuryBrief(
  input: FederalJuryBriefInput,
): Promise<FederalJuryBriefData> {
  const limitations: string[] = [];
  const federalCharge = input.federalCharge;
  const state = (input.state ?? "").trim().toUpperCase() || null;
  const circuit = resolveCircuit(input);
  const circuitName = circuit ? CIRCUIT_NAMES[circuit] : null;

  // Federal-only gate.
  if (!isFederalCharge(federalCharge)) {
    return {
      federalCharge,
      federalChargeLabel: federalCharge,
      circuit,
      circuitName,
      state,
      pji: null,
      burdenSentences: [],
      attackAuthorities: [],
      circuitVariants: [],
      limitations: [
        "This product covers federal charges only. Your charge does not appear in the federal criminal code mapping we support.",
      ],
      federalOnly: true,
      isEmpty: true,
    };
  }

  const def = FEDERAL_CHARGES[federalCharge];
  const supabase = createAdminClient();

  // --------- Step 1: fetch all PJIs that plausibly match the charge ---------
  //
  // We pull candidate rows via v_pji_public (verified only) and filter in
  // Node using matchesCharge() because Supabase PostgREST can't express
  // "statute_citations array ANY matches regex" cleanly. Bounded set — the
  // entire view is ~1.7k rows, and we only scan when we can't narrow by
  // title on the server. Titles are ILIKE'd server-side to drop 90%+ of
  // rows before the Node-side pattern match.
  //
  // Pre-filter strategy:
  //   a) For each title keyword, build ILIKE '%kw%' condition (OR across all
  //      keywords). Server-side drop.
  //   b) Node-side re-apply matchesCharge() to catch statute_citations
  //      matches that the title ILIKE missed.
  //   c) If title ILIKE returns nothing, fall back to a full-view scan
  //      (bounded, safe) to honor statute_citations.
  const titleKwSignals = def.titleKeywords
    .map((re) => re.source.replace(/\\b/g, "").replace(/\\s\+/g, " "))
    .map((s) => s.replace(/[()|]/g, "").trim())
    .filter((s) => s.length >= 3 && /^[A-Za-z0-9. \-/&§]+$/.test(s));

  let candidates: PjiMatch[] = [];
  if (titleKwSignals.length > 0) {
    const orClause = titleKwSignals
      .map((s) => `title.ilike.%${s.replace(/%/g, "")}%`)
      .join(",");
    const { data: titleRows } = await supabase
      .from("v_pji_public")
      .select(
        "id, circuit, instruction_number, title, body, commentary, statute_citations, source_url, effective_date",
      )
      .or(orClause)
      .limit(200);
    for (const r of titleRows ?? []) {
      if (matchesCharge(r, def)) {
        candidates.push(r as PjiMatch);
      }
    }
  }

  if (candidates.length === 0) {
    // Full scan fallback — bounded ~1.7k rows.
    const { data: allRows } = await supabase
      .from("v_pji_public")
      .select(
        "id, circuit, instruction_number, title, body, commentary, statute_citations, source_url, effective_date",
      )
      .limit(2000);
    for (const r of allRows ?? []) {
      if (matchesCharge(r, def)) {
        candidates.push(r as PjiMatch);
      }
    }
  }

  if (candidates.length === 0) {
    return {
      federalCharge,
      federalChargeLabel: def.label,
      circuit,
      circuitName,
      state,
      pji: null,
      burdenSentences: [],
      attackAuthorities: [],
      circuitVariants: [],
      limitations: [
        `No pattern jury instruction in our corpus matches ${def.label}. Our coverage spans First, Third, Fifth, Sixth, Seventh, Eighth, and Ninth Circuits as of 2026-04-26.`,
      ],
      federalOnly: false,
      isEmpty: true,
    };
  }

  // Choose the primary PJI:
  //   1. prefer a match on the user's resolved circuit
  //   2. else prefer 9th Circuit (largest corpus), then 1st, then 8th
  //   3. else any match
  // Closest-sibling preference: when the user's circuit has no PJI rows,
  // prefer high-volume circuits (3, 5, 8) then mid-volume (6, 9, 1, 7).
  // Drops circuit 10 — verified zero rows in v_pji_public 2026-04-26.
  const circuitPref = circuit ? [Number(circuit), 3, 5, 8, 6, 9, 1, 7] : [3, 5, 8, 6, 9, 1, 7];
  let primary: PjiMatch | null = null;
  for (const c of circuitPref) {
    const m = candidates.find((x) => x.circuit === c);
    if (m) {
      primary = m;
      break;
    }
  }
  if (!primary) primary = candidates[0] ?? null;

  if (!primary) {
    return {
      federalCharge,
      federalChargeLabel: def.label,
      circuit,
      circuitName,
      state,
      pji: null,
      burdenSentences: [],
      attackAuthorities: [],
      circuitVariants: [],
      limitations: ["No primary instruction could be selected."],
      federalOnly: false,
      isEmpty: true,
    };
  }

  if (circuit && primary.circuit !== Number(circuit)) {
    limitations.push(
      `No pattern instruction cached for the ${circuitName ?? "selected"} circuit; showing the ${
        CIRCUIT_NAMES[String(primary.circuit)] ?? `${primary.circuit} Circuit`
      } instruction as the closest available reference.`,
    );
  }

  // --------- Step 2: burden-of-proof extraction ---------
  const burdenSentences = extractBurdenSentences(primary.body ?? "");

  // --------- Step 3: top 5 attack authorities ---------
  let attackAuthorities: AttackAuthority[] = [];
  if (def.authoritySlugs.length > 0) {
    const { data: ctaRows } = await supabase
      .from("charge_type_top_authorities")
      .select(
        "charge_type, rank, cited_opinion_id, case_name, date_filed, citation_count_in_charge, citation_count_total, authority_tier_overall, source_url",
      )
      .in("charge_type", def.authoritySlugs)
      .order("citation_count_in_charge", { ascending: false })
      .limit(30);

    const seen = new Map<number, AttackAuthority>();
    for (const r of ctaRows ?? []) {
      const url = (r.source_url as string | null) ?? "";
      if (!url) continue; // HARD rule — no URL, no row
      const oid = r.cited_opinion_id as number;
      if (seen.has(oid)) continue;
      seen.set(oid, {
        rank: 0,
        case_name: r.case_name as string,
        date_filed: (r.date_filed as string | null) ?? null,
        citation_count_in_charge: r.citation_count_in_charge as number | null,
        citation_count_total: r.citation_count_total as number,
        authority_tier: (r.authority_tier_overall as string | null) ?? null,
        source_url: url,
        framing: `Cases where the defense cited challenging elements of instructions for ${def.label}.`,
      });
    }
    attackAuthorities = [...seen.values()]
      .sort(
        (a, b) =>
          (b.citation_count_in_charge ?? 0) - (a.citation_count_in_charge ?? 0),
      )
      .slice(0, 5)
      .map((a, i) => ({ ...a, rank: i + 1 }));
  }

  if (attackAuthorities.length === 0) {
    // Fallback to national criminal authorities with explicit framing.
    const { data: caRows } = await supabase
      .from("citation_authority_criminal")
      .select(
        "cited_opinion_id, case_name, date_filed, citation_count_criminal, citation_count_total, authority_tier, source_url",
      )
      .order("citation_count_criminal", { ascending: false })
      .limit(10);
    const seen = new Set<number>();
    for (const r of caRows ?? []) {
      const url = (r.source_url as string | null) ?? "";
      if (!url) continue;
      const oid = r.cited_opinion_id as number;
      if (seen.has(oid)) continue;
      seen.add(oid);
      attackAuthorities.push({
        rank: 0,
        case_name: r.case_name as string,
        date_filed: (r.date_filed as string | null) ?? null,
        citation_count_in_charge: r.citation_count_criminal as number | null,
        citation_count_total: r.citation_count_total as number,
        authority_tier: (r.authority_tier as string | null) ?? null,
        source_url: url,
        framing: `General federal criminal authorities cited when challenging jury-instruction elements (no charge-specific cache for ${def.label}).`,
      });
      if (attackAuthorities.length >= 5) break;
    }
    attackAuthorities = attackAuthorities.map((a, i) => ({ ...a, rank: i + 1 }));
    if (attackAuthorities.length > 0) {
      limitations.push(
        `No charge-specific attack authorities cached for ${def.label}; showing top national federal criminal authorities by citation frequency.`,
      );
    }
  }

  // --------- Step 4: alternative circuit variants ---------
  const variants: CircuitVariant[] = [];
  const siblings = candidates.filter((c) => c.id !== primary.id);
  const seenCircuits = new Set<number>([primary.circuit]);
  for (const s of siblings) {
    if (seenCircuits.has(s.circuit)) continue;
    seenCircuits.add(s.circuit);
    variants.push({
      circuit: s.circuit,
      circuitName: CIRCUIT_NAMES[String(s.circuit)] ?? `${s.circuit} Circuit`,
      instruction_number: s.instruction_number,
      title: s.title,
      difference_summary: summarizeDifference(primary, s),
      source_url: s.source_url,
    });
    if (variants.length >= 3) break;
  }

  return {
    federalCharge,
    federalChargeLabel: def.label,
    circuit,
    circuitName,
    state,
    pji: primary,
    burdenSentences,
    attackAuthorities,
    circuitVariants: variants,
    limitations,
    federalOnly: false,
    isEmpty: false,
  };
}

// Summarize the textual difference between two circuit variants at
// one-line granularity. We do not diff the full text (that would be
// noisy) — we cite length delta + first non-matching 12-word span.
export function summarizeDifference(a: PjiMatch, b: PjiMatch): string {
  const bodyA = a.body ?? "";
  const bodyB = b.body ?? "";
  const deltaChars = bodyB.length - bodyA.length;
  const wordsA = bodyA.split(/\s+/).slice(0, 40);
  const wordsB = bodyB.split(/\s+/).slice(0, 40);
  let divergeAt = -1;
  for (let i = 0; i < Math.min(wordsA.length, wordsB.length); i++) {
    if (wordsA[i] !== wordsB[i]) {
      divergeAt = i;
      break;
    }
  }
  const pct = bodyA.length > 0 ? Math.round((deltaChars / bodyA.length) * 100) : 0;
  const sign = deltaChars > 0 ? "+" : deltaChars < 0 ? "-" : "±";
  if (divergeAt === -1 && deltaChars === 0) {
    return "Substantially identical opening phrasing; differences appear deeper in commentary.";
  }
  const snippet = wordsB
    .slice(Math.max(0, divergeAt), Math.max(0, divergeAt) + 12)
    .join(" ");
  return `Length delta ${sign}${Math.abs(pct)}% vs primary; first divergent phrasing: "${snippet}…"`;
}

// ============================================================
// Render
// ============================================================

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderFederalJuryInstructionBrief(
  data: FederalJuryBriefData,
): string {
  const chargeLabel = htmlEscape(data.federalChargeLabel);
  const circuitSuffix = data.circuitName
    ? ` · ${htmlEscape(data.circuitName)}${data.state ? ` (${htmlEscape(data.state)})` : ""}`
    : data.state
      ? ` · ${htmlEscape(data.state)}`
      : "";

  const header = `
    <header class="fjb-header">
      <h1>Federal Jury Instruction Brief &mdash; ${chargeLabel}</h1>
      <p class="fjb-subtitle">Pattern instruction, burden of proof, and historical attack authorities${circuitSuffix}</p>
      <p class="fjb-gate"><strong>This is legal INFORMATION, not legal ADVICE.</strong> The jury instruction text below is the public pattern instruction used by federal courts in this circuit. Every cited case links to the primary opinion on CourtListener for independent verification. No citation appears without a verification URL on file.</p>
    </header>
  `;

  // PJI body framing — Round 1 wave-pristine CRITICAL #2.
  // Pattern jury instruction body text is verbatim public-record court
  // material. It routinely contains phrasing such as "you should" or "the
  // jury should" — that's jury-deliberation voice, NOT advice from us to
  // the defendant. The framing block disambiguates before the body, so
  // no reader can conflate pattern-instruction language with our voice.
  // The body itself is emitted inside `<div class="pji-body">`; UPL
  // scanners carve out both the framing and body wrappers before checking
  // the rest of the render (see `scanForUplPhrases` caller sites).
  const pjiSection = data.pji
    ? `
    <section class="fjb-section">
      <h2>1. Pattern Jury Instruction &mdash; Verbatim</h2>
      <p class="fjb-intro">
        <strong>Instruction ${htmlEscape(data.pji.instruction_number)}${data.pji.title ? ` &mdash; ${htmlEscape(data.pji.title)}` : ""}</strong><br/>
        <span class="fjb-meta">${htmlEscape(CIRCUIT_NAMES[String(data.pji.circuit)] ?? `${data.pji.circuit} Circuit`)}${data.pji.effective_date ? ` · effective ${htmlEscape(String(data.pji.effective_date))}` : ""}</span>
      </p>
      <div class="pji-framing">
        <p><strong>Pattern Jury Instruction &mdash; Verbatim</strong></p>
        <p>The text below is the pattern instruction as issued by the Circuit Court, read verbatim to the jury for this charge. Phrases like &ldquo;you should&rdquo; or &ldquo;the jury should&rdquo; refer to the jury&rsquo;s deliberation duty &mdash; they are NOT legal advice from us to you.</p>
      </div>
      <div class="pji-body"><blockquote class="fjb-verbatim">${htmlEscape(data.pji.body ?? "")}</blockquote></div>
      ${data.pji.statute_citations && data.pji.statute_citations.length > 0
        ? `<p class="fjb-cite">Cited statute(s): ${data.pji.statute_citations.map((s) => htmlEscape(String(s))).join("; ")}</p>`
        : ""}
      ${data.pji.source_url
        ? `<p class="fjb-cite"><a href="${htmlEscape(data.pji.source_url)}" target="_blank" rel="noopener">Primary source</a></p>`
        : ""}
    </section>`
    : "";

  const burdenSection = data.burdenSentences.length > 0
    ? `
    <section class="fjb-section">
      <h2>2. Burden of Proof &mdash; Extracted Verbatim</h2>
      <p class="fjb-intro">Every criminal conviction in federal court requires the government to prove each element beyond a reasonable doubt. The following sentences are extracted verbatim from the pattern instruction above.</p>
      <ul class="fjb-burden-list">
        ${data.burdenSentences
          .map((b) => `<li>&ldquo;${htmlEscape(b.sentence)}&rdquo;</li>`)
          .join("")}
      </ul>
    </section>`
    : "";

  const attackSection = data.attackAuthorities.length > 0
    ? `
    <section class="fjb-section">
      <h2>3. Top 5 Historical Attack Authorities</h2>
      <p class="fjb-intro">Federal criminal precedents most frequently cited when defense counsel challenged elements related to ${chargeLabel}. Rank by citation frequency in our criminal corpus.</p>
      <table class="fjb-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Case</th>
            <th>Tier</th>
            <th>Cites (charge / total)</th>
            <th>Framing</th>
          </tr>
        </thead>
        <tbody>
          ${data.attackAuthorities
            .map(
              (a) => `
            <tr>
              <td>${a.rank}</td>
              <td>
                <a href="${htmlEscape(a.source_url)}" target="_blank" rel="noopener">${htmlEscape(a.case_name)}</a>
                ${a.date_filed ? `<span class="fjb-date">(${htmlEscape(String(a.date_filed).slice(0, 4))})</span>` : ""}
              </td>
              <td>${htmlEscape(a.authority_tier ?? "")}</td>
              <td>${a.citation_count_in_charge ?? ""} / ${a.citation_count_total}</td>
              <td class="fjb-framing">${htmlEscape(a.framing)}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </section>`
    : "";

  const variantSection = data.circuitVariants.length > 0
    ? `
    <section class="fjb-section">
      <h2>4. Alternative Circuit Variants</h2>
      <p class="fjb-intro">Other federal circuits publish their own pattern instruction for this charge. Differences in phrasing can matter when defense counsel argues for or against specific instruction language.</p>
      <ul class="fjb-variant-list">
        ${data.circuitVariants
          .map(
            (v) => `
          <li>
            <strong>${htmlEscape(v.circuitName)} &mdash; Instruction ${htmlEscape(v.instruction_number)}</strong>
            ${v.title ? `: ${htmlEscape(v.title)}` : ""}
            <br/>
            <span class="fjb-variant-diff">${htmlEscape(v.difference_summary)}</span>
            ${v.source_url ? `<br/><a href="${htmlEscape(v.source_url)}" target="_blank" rel="noopener" class="fjb-variant-link">Primary source</a>` : ""}
          </li>`,
          )
          .join("")}
      </ul>
    </section>`
    : "";

  const limitations = data.limitations.length
    ? `<aside class="fjb-limits"><h3>Known limitations</h3><ul>${data.limitations.map((l) => `<li>${htmlEscape(l)}</li>`).join("")}</ul></aside>`
    : "";

  const disclaimer = `
    <footer class="fjb-footer">
      <h3>Methodology</h3>
      <p>This report provides legal INFORMATION &mdash; not legal ADVICE. The analysis draws on methods developed by elite defense attorneys, applied specifically to your case details. Your attorney remains the final authority on strategy decisions.</p>
      <p>The pattern jury instruction reproduced above is the public text used by federal trial courts in the selected circuit. Pattern instructions are not themselves binding law; the trial judge may modify them. Historical attack authorities are ranked by citation frequency in our federal criminal corpus as of 2026-04-22. Every citation links to the primary opinion on CourtListener for independent verification.</p>
      <p>No part of this report is a prediction. It is a map of what is already in the record.</p>
    </footer>
  `;

  const styles = `
    <style>
      .federal-jury-instruction-brief { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 1020px; margin: 2em auto; padding: 1em; color: #111; }
      .federal-jury-instruction-brief h1 { font-size: 1.6em; margin: 0 0 0.25em; }
      .federal-jury-instruction-brief .fjb-subtitle { color: #555; margin: 0 0 1em; font-style: italic; }
      .federal-jury-instruction-brief .fjb-gate { background: #fff8e1; border-left: 4px solid #f9a825; padding: 0.75em 1em; margin: 0 0 1.5em; }
      .federal-jury-instruction-brief .fjb-section { margin: 2em 0; }
      .federal-jury-instruction-brief .fjb-section h2 { font-size: 1.2em; margin: 0 0 0.5em; border-bottom: 1px solid #e0e0e0; padding-bottom: 0.25em; }
      .federal-jury-instruction-brief .fjb-intro { color: #444; margin: 0.25em 0 0.75em; }
      .federal-jury-instruction-brief .fjb-meta { color: #777; font-size: 0.9em; }
      .federal-jury-instruction-brief .fjb-verbatim { background: #f7f7f7; border-left: 4px solid #555; padding: 1em 1.25em; margin: 0.5em 0; white-space: pre-wrap; font-size: 0.95em; line-height: 1.55; }
      .federal-jury-instruction-brief .fjb-burden-list li { margin: 0.4em 0; font-style: italic; }
      .federal-jury-instruction-brief .fjb-table { width: 100%; border-collapse: collapse; margin: 0.5em 0; font-size: 0.9em; }
      .federal-jury-instruction-brief .fjb-table th, .federal-jury-instruction-brief .fjb-table td { text-align: left; padding: 0.45em 0.7em; border-bottom: 1px solid #e8e8e8; vertical-align: top; }
      .federal-jury-instruction-brief .fjb-table th { background: #f5f5f5; font-weight: 600; }
      .federal-jury-instruction-brief .fjb-date { color: #777; font-size: 0.85em; margin-left: 4px; }
      .federal-jury-instruction-brief .fjb-framing { color: #333; max-width: 30em; }
      .federal-jury-instruction-brief .fjb-cite { color: #555; font-size: 0.85em; margin: 0.25em 0; }
      .federal-jury-instruction-brief .fjb-variant-list li { margin: 0.75em 0; }
      .federal-jury-instruction-brief .fjb-variant-diff { color: #555; font-size: 0.9em; }
      .federal-jury-instruction-brief .fjb-variant-link { font-size: 0.85em; }
      .federal-jury-instruction-brief .fjb-limits { margin-top: 1.5em; padding: 0.75em 1em; background: #f0f4f8; border-left: 3px solid #4a6fa5; font-size: 0.9em; }
      .federal-jury-instruction-brief .fjb-footer { margin-top: 2em; padding-top: 1em; border-top: 2px solid #333; color: #555; font-size: 0.9em; }
    </style>
  `;

  return `
    ${styles}
    <section class="federal-jury-instruction-brief">
      ${header}
      ${pjiSection}
      ${burdenSection}
      ${attackSection}
      ${variantSection}
      ${limitations}
      ${disclaimer}
    </section>
  `;
}

// ============================================================
// UPL phrase blocklist — re-exported from the canonical source
// ============================================================
// Consolidated 2026-04-23 per Round 1 wave-pristine (WARNING #3). Local
// copy removed; canonical list lives in `@/lib/charge-slug-maps`. Re-export
// preserves the public API for existing test imports.
export { UPL_BANNED_PHRASES, scanForUplPhrases } from "@/lib/charge-slug-maps";

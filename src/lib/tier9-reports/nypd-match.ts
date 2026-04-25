/**
 * NYPD CCRB officer matcher.
 *
 * Deterministic name + shield + tax_id matching against public.nypd_officers.
 * No LLM. No fuzzy match beyond case/whitespace/punct normalization.
 *
 * Differences from cpd-match.ts:
 *   - NYPD officers have a stable BIGINT tax_id PK (Chicago uses uid + integer
 *     star number; NYPD uses tax_id + 5-digit shield_no). Tax ID is the
 *     authoritative join key.
 *   - We accept both shield_no and a free-text "badge" intake field. Shield
 *     numbers are public; tax IDs are not (officers don't share them with
 *     civilians), so the customer-facing disambiguator is shield_no.
 *   - Agency whitelist is NYPD-specific.
 *   - Wrong-officer-attribution defenses are explicit (see chooseNypdMatch):
 *     a "single" status requires either firstName-confirmation OR
 *     shield-confirmation when fallback routes via state=NY without an
 *     explicit NYPD agency string. NY State has 500+ police agencies; a
 *     name-only match against NYPD is a thin thread for $97 customer-facing
 *     legal-defense attribution.
 *
 * Data window: continuously updated via NYC OpenData (daily refresh). Officers
 * appointed yesterday may take 24-48 hours to appear.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type NypdMatchStatus = "single" | "ambiguous" | "none";

/** How the routing decision was reached. Used by chooseNypdMatch to apply
 *  stricter disambiguation when state=NY-only (no agency whitelist match). */
export type NypdRouteReason = "agency-whitelist" | "state-fallback";

export interface NypdCandidate {
  tax_id: number;
  officer_first_name: string | null;
  officer_last_name: string | null;
  shield_no: string | null;
  current_rank: string | null;
  current_command: string | null;
  active_per_last_reported_status: string | null;
  total_complaints: number | null;
  total_substantiated_complaints: number | null;
}

export interface NypdMatchResult {
  status: NypdMatchStatus;
  candidates: NypdCandidate[];
  matchedTaxId: number | null;
  /** True when the candidate set may have been truncated by the 20-row
   *  fetch cap. Surface this to the customer-facing copy as "20+". */
  truncated?: boolean;
}

/** Agency strings that route to NYPD depth. Exact (normalized) match only. */
const NYPD_AGENCY_WHITELIST = new Set([
  "nypd",
  "ny pd",
  "new york pd",
  "new york police",
  "new york police department",
  "new york city pd",
  "new york city police",
  "new york city police department",
  "nyc pd",
  "nyc police",
  "nyc police department",
  "city of new york police",
  "city of new york police department",
]);

/** Common NY State non-NYPD law-enforcement agency tokens. When the customer
 *  supplies one of these AS THE AGENCY, we explicitly suppress the NYPD probe
 *  even if state=NY — otherwise we'd attribute random NYPD officers' records
 *  to a Buffalo/Nassau/MTA/etc officer with the same name. The list is a
 *  best-effort signal, not exhaustive. */
const NON_NYPD_NY_AGENCY_TOKENS = [
  "nassau",
  "suffolk",
  "westchester",
  "nys police",
  "nys state police",
  "new york state police",
  "state police",
  "state troopers",
  "port authority",
  "mta police",
  "mta",
  "transit authority",
  "buffalo",
  "rochester",
  "syracuse",
  "albany",
  "yonkers",
  "schenectady",
  "utica",
  "binghamton",
  "white plains",
  "long beach",
  "mount vernon",
  "new rochelle",
  "freeport",
  "hempstead",
  "sheriff",
  "constable",
  "campus police",
  "park police",
  "housing police",
  "amtrak police",
];

/** Normalize an agency free-text input — used by both whitelist + non-NYPD
 *  detection, so the same normalization rules apply on both sides. */
function normalizeAgencyText(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .replace(/[\x00-\x1f]/g, " ")
    .replace(/\./g, "")
    .replace(/\bdept\b/g, "department")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize an agency free-text input to either "nypd" or null (no match). */
export function normalizeAgencyToNypd(raw: string | null | undefined): "nypd" | null {
  const normalized = normalizeAgencyText(raw);
  if (!normalized) return null;
  return NYPD_AGENCY_WHITELIST.has(normalized) ? "nypd" : null;
}

/** True when the supplied agency string explicitly identifies a non-NYPD
 *  New York law-enforcement agency. Used to suppress the state=NY fallback
 *  so we don't attribute NYPD records to e.g. Buffalo PD officers. */
export function isExplicitNonNypdNyAgency(raw: string | null | undefined): boolean {
  const normalized = normalizeAgencyText(raw);
  if (!normalized) return false;
  if (NYPD_AGENCY_WHITELIST.has(normalized)) return false;
  return NON_NYPD_NY_AGENCY_TOKENS.some((token) => normalized.includes(token));
}

/**
 * Determine whether to run an NYPD probe AND how confident the routing is.
 *
 * Three return shapes:
 *   - { route: "agency-whitelist" }: explicit NYPD agency string given.
 *     Highest confidence; chooseNypdMatch may return "single" on
 *     name-only match.
 *   - { route: "state-fallback" }: agency missing/blank, state=NY only.
 *     Lower confidence; chooseNypdMatch downgrades thin matches to
 *     "ambiguous" so the renderer emits the false-positive caveat.
 *   - null: no probe (explicit non-NYPD NY agency, or wrong state, or both
 *     missing).
 */
export function classifyNypdSignal(opts: {
  agency?: string | null;
  state?: string | null;
}): { route: NypdRouteReason } | null {
  if (normalizeAgencyToNypd(opts.agency ?? null) === "nypd") {
    return { route: "agency-whitelist" };
  }
  // Explicit non-NYPD NY agency suppresses the state fallback entirely.
  if (isExplicitNonNypdNyAgency(opts.agency ?? null)) return null;
  // Some other explicit (non-empty, non-whitelisted, non-NY-keyword) agency
  // also suppresses fallback — prefer false negative over false positive.
  const normalizedAgency = normalizeAgencyText(opts.agency ?? null);
  if (normalizedAgency) return null;
  const state = (opts.state ?? "").trim().toUpperCase();
  return state === "NY" ? { route: "state-fallback" } : null;
}

/** Back-compat boolean wrapper. Prefer classifyNypdSignal in new code. */
export function isNypdSignal(opts: {
  agency?: string | null;
  state?: string | null;
}): boolean {
  return classifyNypdSignal(opts) !== null;
}

/** Last-name prefixes that should join with the next token (compound surnames).
 *  parseNypdName uses last-token-wins, which truncates "St. Pierre" → "Pierre".
 *  When the second-to-last token is one of these, we treat both as the surname. */
const COMPOUND_SURNAME_PREFIXES = new Set([
  "st",
  "saint",
  "van",
  "von",
  "de",
  "del",
  "dela",
  "la",
  "le",
  "mc",
  "mac",
  "o",
  "da",
  "di",
  "du",
  "san",
  "santa",
  "el",
  "al",
]);

/** Split free-text full name into first + last with compound-surname awareness. */
export function parseNypdName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const cleaned = (fullName ?? "")
    .replace(/[\x00-\x1f]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (!cleaned) return { firstName: "", lastName: "" };
  const parts = cleaned.split(" ");
  if (parts.length === 1) return { firstName: "", lastName: parts[0]! };
  if (parts.length >= 2) {
    const second = parts[parts.length - 2]!.toLowerCase().replace(/[^a-z]/g, "");
    if (COMPOUND_SURNAME_PREFIXES.has(second)) {
      return {
        firstName: parts.slice(0, -2).join(" "),
        lastName: parts.slice(-2).join(" "),
      };
    }
  }
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1]!,
  };
}

/** Escape PostgREST ILIKE special characters so a name with literal '%' or '_'
 *  does not over-match (wildcard) or no-match (single-char wildcard).
 *  Also strips control characters (NUL, etc.) that would crash the URL encoder. */
function escapeIlike(input: string): string {
  return input
    .replace(/[\x00-\x1f]/g, "")
    .replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

/**
 * Normalize a shield number. NYPD shields are typically 5-6 digit integers,
 * displayed with or without leading zeros ("07333" or "7333"). Returns the
 * digits as a canonical zero-padded 6-character string so two shield strings
 * differing only in leading-zero count compare equal.
 *
 * Returns null when input has no digits.
 */
export function normalizeShield(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (digits.length === 0) return null;
  // Strip leading zeros, then re-pad to 6 chars. "07333" + "7333" → "007333".
  const stripped = digits.replace(/^0+/, "") || "0";
  return stripped.padStart(6, "0");
}

/**
 * Pure candidate-selection logic. Extracted from the DB layer for unit
 * testing. Tighter contract than CPD because state=NY fallback covers many
 * non-NYPD agencies — a name-only "single" attribution is unsafe under
 * state-fallback routing.
 */
export function chooseNypdMatch(
  candidates: NypdCandidate[],
  shield: string | null,
  opts?: {
    firstNameProvided?: boolean;
    route?: NypdRouteReason;
    truncated?: boolean;
  },
): NypdMatchResult {
  const truncated = opts?.truncated === true;
  if (candidates.length === 0) {
    return { status: "none", candidates: [], matchedTaxId: null, truncated };
  }

  const normShield = normalizeShield(shield);

  // Apply shield filter FIRST (before single-candidate short-circuit). A
  // supplied shield that does NOT match the lone candidate's shield is a
  // strong negative signal, not a permission to ignore the shield.
  if (normShield !== null) {
    const byShield = candidates.filter(
      (c) => normalizeShield(c.shield_no) === normShield,
    );
    if (byShield.length === 1) {
      return { status: "single", candidates: byShield, matchedTaxId: byShield[0]!.tax_id, truncated };
    }
    if (byShield.length > 1) {
      return { status: "ambiguous", candidates: byShield, matchedTaxId: null, truncated };
    }
    // Shield supplied but matched zero candidates → ambiguous, NOT single.
    // Prevents the "1 candidate by name + non-matching shield = trust the name"
    // wrong-officer attribution path.
    return { status: "ambiguous", candidates, matchedTaxId: null, truncated };
  }

  // No shield supplied. Tighten "single" status under thin-confidence routing.
  const firstNameProvided = opts?.firstNameProvided === true;
  const route = opts?.route ?? "agency-whitelist";
  const thinConfidence = !firstNameProvided || route === "state-fallback";

  if (candidates.length === 1) {
    if (thinConfidence) {
      // 1-candidate match with no first-name verification AND no shield is
      // a thin thread — downgrade to ambiguous so the renderer surfaces
      // the false-positive caveat and asks for shield disambiguation.
      return { status: "ambiguous", candidates, matchedTaxId: null, truncated };
    }
    return { status: "single", candidates, matchedTaxId: candidates[0]!.tax_id, truncated };
  }

  return { status: "ambiguous", candidates, matchedTaxId: null, truncated };
}

const NYPD_FETCH_LIMIT = 20;

/**
 * Fetch NYPD candidates by (last, first) case-insensitively. Exact name
 * match — no ILIKE wildcards — wrong-officer data on a customer-facing
 * report is the failure mode this guards against.
 *
 * Returns up to NYPD_FETCH_LIMIT rows + a `truncated` flag indicating
 * whether the caller should treat the result set as possibly incomplete.
 */
export async function fetchNypdCandidates(
  supabase: SupabaseClient,
  opts: { firstName: string; lastName: string },
): Promise<{ candidates: NypdCandidate[]; truncated: boolean }> {
  const last = opts.lastName.trim().toLowerCase();
  if (!last) return { candidates: [], truncated: false };

  let query = supabase
    .from("nypd_officers")
    .select(
      "tax_id, officer_first_name, officer_last_name, shield_no, current_rank, current_command, active_per_last_reported_status, total_complaints, total_substantiated_complaints",
    )
    .filter("officer_last_name", "ilike", escapeIlike(last));

  const first = opts.firstName.trim().toLowerCase();
  if (first) {
    query = query.filter("officer_first_name", "ilike", escapeIlike(first));
  }

  // Fetch one extra row so we can detect truncation without a separate count
  // round-trip. If we get NYPD_FETCH_LIMIT+1 rows, the real population is
  // larger — drop the extra row and flag truncated=true.
  const { data, error } = await query.limit(NYPD_FETCH_LIMIT + 1);
  if (error) return { candidates: [], truncated: false };
  const rows = (data ?? []) as NypdCandidate[];
  if (rows.length > NYPD_FETCH_LIMIT) {
    return { candidates: rows.slice(0, NYPD_FETCH_LIMIT), truncated: true };
  }
  return { candidates: rows, truncated: false };
}

/** Run fetch + chooseMatch in one call. */
export async function matchNypdOfficer(
  supabase: SupabaseClient,
  opts: {
    firstName: string;
    lastName: string;
    shield: string | null;
    route?: NypdRouteReason;
  },
): Promise<NypdMatchResult> {
  const { candidates, truncated } = await fetchNypdCandidates(supabase, opts);
  return chooseNypdMatch(candidates, opts.shield, {
    firstNameProvided: opts.firstName.trim().length > 0,
    route: opts.route,
    truncated,
  });
}

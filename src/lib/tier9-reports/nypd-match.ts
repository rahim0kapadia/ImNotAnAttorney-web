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
 *
 * Data window: continuously updated via NYC OpenData (daily refresh). Officers
 * appointed yesterday may take 24-48 hours to appear.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type NypdMatchStatus = "single" | "ambiguous" | "none";

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

/** Normalize an agency free-text input to either "nypd" or null (no match). */
export function normalizeAgencyToNypd(raw: string | null | undefined): "nypd" | null {
  if (!raw) return null;
  const normalized = raw
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\bdept\b/g, "department")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return NYPD_AGENCY_WHITELIST.has(normalized) ? "nypd" : null;
}

/**
 * Determine whether to run an NYPD probe. Prefer explicit agency. Fall back
 * to state=NY when no agency given (NY State has many other agencies — Nassau
 * County PD, NYS Police, etc. — so this is a softer signal than CPD's IL
 * fallback, but still better than zero coverage).
 */
export function isNypdSignal(opts: {
  agency?: string | null;
  state?: string | null;
}): boolean {
  if (normalizeAgencyToNypd(opts.agency ?? null) === "nypd") return true;
  const state = (opts.state ?? "").trim().toUpperCase();
  return state === "NY";
}

/** Split free-text full name into first + last (mirrors cpd-match parser). */
export function parseNypdName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const cleaned = fullName.trim().replace(/\s+/g, " ");
  if (!cleaned) return { firstName: "", lastName: "" };
  const parts = cleaned.split(" ");
  if (parts.length === 1) return { firstName: "", lastName: parts[0]! };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1]!,
  };
}

/** Escape PostgREST ILIKE special characters so a name with literal '%' or '_'
 *  does not over-match (wildcard) or no-match (single-char wildcard). */
function escapeIlike(input: string): string {
  return input.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

/**
 * Normalize a shield number. NYPD shields are typically 5-6 digit integers,
 * sometimes with leading zeros in display ("07333"). Strip non-digits and
 * preserve leading zeros so a shield-string compare is exact.
 */
export function normalizeShield(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  return digits.length > 0 ? digits : null;
}

/**
 * Pure candidate-selection logic. Extracted from the DB layer for unit
 * testing. Mirrors chooseMatch in cpd-match.ts but with shield_no instead
 * of current_star.
 */
export function chooseNypdMatch(
  candidates: NypdCandidate[],
  shield: string | null,
): NypdMatchResult {
  if (candidates.length === 0) {
    return { status: "none", candidates: [], matchedTaxId: null };
  }
  if (candidates.length === 1) {
    const [c] = candidates;
    return { status: "single", candidates, matchedTaxId: c!.tax_id };
  }

  const normShield = normalizeShield(shield);
  if (normShield !== null) {
    const byShield = candidates.filter(
      (c) => normalizeShield(c.shield_no) === normShield,
    );
    if (byShield.length === 1) {
      return { status: "single", candidates: byShield, matchedTaxId: byShield[0]!.tax_id };
    }
    if (byShield.length > 1) {
      return { status: "ambiguous", candidates: byShield, matchedTaxId: null };
    }
  }

  return { status: "ambiguous", candidates, matchedTaxId: null };
}

/**
 * Fetch NYPD candidates by (last, first) case-insensitively. Exact name
 * match — no ILIKE wildcards — wrong-officer data on a customer-facing
 * report is the failure mode this guards against.
 */
export async function fetchNypdCandidates(
  supabase: SupabaseClient,
  opts: { firstName: string; lastName: string },
): Promise<NypdCandidate[]> {
  const last = opts.lastName.trim().toLowerCase();
  if (!last) return [];

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

  const { data, error } = await query.limit(20);
  if (error) return [];
  return (data ?? []) as NypdCandidate[];
}

/** Run fetch + chooseMatch in one call. */
export async function matchNypdOfficer(
  supabase: SupabaseClient,
  opts: { firstName: string; lastName: string; shield: string | null },
): Promise<NypdMatchResult> {
  const candidates = await fetchNypdCandidates(supabase, opts);
  return chooseNypdMatch(candidates, opts.shield);
}

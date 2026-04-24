/**
 * CPD Invisible Institute officer matcher.
 *
 * Deterministic name + badge + agency matching against public.cpd_officers.
 * No LLM. No fuzzy match beyond case/whitespace/punct normalization.
 *
 * Contract:
 *   - agency signal: explicit match against a short CPD whitelist. Never match
 *     on generic "police" / other-agency strings — wrong-officer risk.
 *   - name match: case-insensitive exact on (last_name, first_name).
 *   - badge disambiguator: exact digit-only compare against cpd_officers.current_star.
 *   - ambiguity: if more than one officer shares a name and no badge disambiguates,
 *     return status='ambiguous'; callers suppress the CPD report section and
 *     direct the customer to email support with badge#.
 *
 * Data window: 2000 through mid-2018 (Invisible Institute FOIA dump). Officers
 * appointed after that gap may be absent; that is a disclosure, not a bug.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type CpdMatchStatus = "single" | "ambiguous" | "none";

export interface CpdCandidate {
  uid: number;
  first_name: string | null;
  last_name: string | null;
  current_star: string | null;
  current_rank: string | null;
  current_status: string | null;
  appointed_date: string | null;
}

export interface CpdMatchResult {
  status: CpdMatchStatus;
  candidates: CpdCandidate[];
  matchedUid: number | null;
}

/** Agency strings that route to CPD depth. Exact (normalized) match only. */
const CPD_AGENCY_WHITELIST = new Set([
  "cpd",
  "chicago pd",
  "chicago police",
  "chicago police department",
  "city of chicago police",
  "city of chicago police department",
]);

/** Normalize an agency free-text input to either "cpd" or null (no match). */
export function normalizeAgencyToCpd(raw: string | null | undefined): "cpd" | null {
  if (!raw) return null;
  const normalized = raw
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\bdept\b/g, "department")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return CPD_AGENCY_WHITELIST.has(normalized) ? "cpd" : null;
}

/**
 * Determine whether to run a CPD probe at all.
 * Prefer explicit agency. Fall back to state=IL as a softer signal (customers
 * who don't know/enter an agency but are in Illinois).
 */
export function isChicagoSignal(opts: {
  agency?: string | null;
  state?: string | null;
}): boolean {
  if (normalizeAgencyToCpd(opts.agency ?? null) === "cpd") return true;
  const state = (opts.state ?? "").trim().toUpperCase();
  return state === "IL";
}

/** Split a free-text full name into first + last. Last token wins for surname. */
export function parseOfficerName(fullName: string): {
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

/** Strip anything that isn't a digit. CPD star numbers are integer-valued. */
export function normalizeBadge(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  return digits.length > 0 ? digits : null;
}

/**
 * Pure candidate-selection logic. Extracted from the DB layer so unit tests
 * can cover every branch without mocking Supabase.
 */
export function chooseMatch(
  candidates: CpdCandidate[],
  badge: string | null,
): CpdMatchResult {
  if (candidates.length === 0) {
    return { status: "none", candidates: [], matchedUid: null };
  }

  if (candidates.length === 1) {
    const [c] = candidates;
    return { status: "single", candidates, matchedUid: c!.uid };
  }

  const normBadge = normalizeBadge(badge);
  if (normBadge !== null) {
    const byBadge = candidates.filter(
      (c) => normalizeBadge(c.current_star) === normBadge,
    );
    if (byBadge.length === 1) {
      return { status: "single", candidates: byBadge, matchedUid: byBadge[0]!.uid };
    }
    if (byBadge.length > 1) {
      return {
        status: "ambiguous",
        candidates: byBadge,
        matchedUid: null,
      };
    }
  }

  return { status: "ambiguous", candidates, matchedUid: null };
}

/**
 * Fetch candidates matching (last_name, first_name) case-insensitively. Exact
 * normalized match (no wildcards) — wrong-officer data causes real harm on a
 * customer-facing report.
 *
 * If `firstName` is empty (single-token input), match on last_name alone;
 * disambiguation falls through to badge or ambiguous-status.
 */
export async function fetchCpdCandidates(
  supabase: SupabaseClient,
  opts: { firstName: string; lastName: string },
): Promise<CpdCandidate[]> {
  const last = opts.lastName.trim().toLowerCase();
  if (!last) return [];

  let query = supabase
    .from("cpd_officers")
    .select(
      "uid, first_name, last_name, current_star, current_rank, current_status, appointed_date",
    )
    .filter("last_name", "ilike", last);

  const first = opts.firstName.trim().toLowerCase();
  if (first) {
    query = query.filter("first_name", "ilike", first);
  }

  const { data, error } = await query.limit(20);
  if (error) {
    return [];
  }
  return (data ?? []) as CpdCandidate[];
}

/** Run fetch + chooseMatch in one call. */
export async function matchCpdOfficer(
  supabase: SupabaseClient,
  opts: { firstName: string; lastName: string; badge: string | null },
): Promise<CpdMatchResult> {
  const candidates = await fetchCpdCandidates(supabase, opts);
  return chooseMatch(candidates, opts.badge);
}

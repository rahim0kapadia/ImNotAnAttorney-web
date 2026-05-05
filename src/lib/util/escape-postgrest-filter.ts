/**
 * Centralized escape helpers for PostgREST filter values.
 *
 * Plan: docs/plans/2026-04-29-worry-data-orphans-product-gaps.md (T0.5).
 * Cited rule: cl-bulk-data-defensive — input from PDF discovery is
 * untrusted; PostgREST filter values must escape per filter type.
 *
 * Two surfaces:
 *  - `escapeIlike(s)` — escapes the three documented .ilike() metachars
 *    (% _ \). Apostrophes pass through (not a PostgREST metachar in
 *    .ilike(); single quotes are handled by the URL/header layer).
 *  - `escapeOrFilterValue(s)` — adds .or() filter syntax escapes
 *    (commas, parens, double quotes) on top of escapeIlike. Required
 *    when an officer/judge name is interpolated into a `.or()` clause.
 *
 * Both are pure functions, no Supabase dependency.
 *
 * NOTE: 12 inline escapeIlike copies still live in tier9-reports/query.ts
 * et al. Migration of those to this canonical helper is OUT OF SCOPE for
 * this plan (Out of Scope §7) — covered by a separate cleanup task.
 */

/**
 * Escape characters that PostgREST `.ilike()` interprets:
 *   %   wildcard (any sequence)
 *   _   wildcard (single char)
 *   \   escape character itself
 *
 * Returns the input with each occurrence prefixed by a backslash.
 */
export function escapeIlike(input: string): string {
  if (!input) return "";
  return input.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

/**
 * Escape characters required for PostgREST `.or()` filter VALUES.
 *
 * The .or() syntax uses commas to separate clauses and parens to nest,
 * with double-quote wrapping for values containing those chars. We
 * additionally escape backslashes and double-quotes so a quoted value
 * stays balanced. ILIKE metachars are escaped first (subset).
 *
 * Caller still wraps the entire value in `"..."` when interpolating
 * into a `.or()` argument that contains commas or parens. This helper
 * makes the wrapped value safe.
 */
export function escapeOrFilterValue(input: string): string {
  if (!input) return "";
  const ilikeEscaped = escapeIlike(input);
  return ilikeEscaped.replace(/[",()]/g, (ch) => `\\${ch}`);
}

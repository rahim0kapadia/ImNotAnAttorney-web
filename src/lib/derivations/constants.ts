/**
 * Shared constants for tier-ladder rising-precedent derivations.
 *
 * Worry-to-Pristine round 1 finding S1: jurisdiction filter was hardcoded in
 * 3 call sites (Edge Function + both LLM routes). Extracted here to prevent drift.
 */

// Rising precedents are filtered to appellate + supreme court levels only.
// Federal District (FD) and Federal Specialty (FS) are dominated by civil-procedure
// citations (Spokeo, Biestek, Connelly, Ross v. Blake — PLRA) that overwhelm
// criminal-substantive precedents when ordered by raw citation velocity.
// SCOTUS + state supreme + federal appeals surface the real trending
// criminal-defense opinions (Mathis, Montgomery, Ramos, Birchfield, Welch,
// Molina-Martinez).
export const RISING_JURISDICTION_FILTER = ["S", "SA", "F"] as const;

// Minimum number of charge-type matched rising precedents before we prefer
// the charge-filtered list over the national top-10 fallback.
// Worry-to-Pristine round 1 finding S3.
export const CHARGE_FILTER_MIN_ROWS = 3;

// Model for LLM-backed routes (motion-drafts, trial-strategy-memo).
// Worry-to-Pristine round 1 finding S2: env-var fallback for A/B + rollback.
export const ANTHROPIC_LEGAL_DRAFTING_MODEL =
  process.env.ANTHROPIC_LEGAL_DRAFTING_MODEL || "claude-sonnet-4-6";

// Temperature for legal drafting. Hamel: rule-adherence outputs want 0.0-0.1;
// 0.3 allowed ~5-15% framing-rule drift per round-1 Hamel review.
// Worry-to-Pristine round 1 finding W10.
export const ANTHROPIC_LEGAL_DRAFTING_TEMPERATURE = 0.1;

// Banned phrases that indicate unauthorized practice of law (UPL).
// If generated output contains any of these, the route must hard-reject
// before surfacing to the operator. Worry-to-Pristine round 1 finding W11.
export const UPL_BANNED_PATTERNS: ReadonlyArray<RegExp> = [
  /\byou (should|must|need to|ought to|have to)\b/i,
  /\bwe (recommend|advise|suggest)\b/i,
  /\byour best option\b/i,
  /\bthe best strategy\b/i,
  /\b(we'd|we would) advise\b/i,
  /\byou ought\b/i,
];

/**
 * Validates LLM output does NOT contain fabricated case citations.
 * Extracts "X v. Y" patterns and asserts each is a substring of one of the
 * allowed case names passed in. Returns array of unrecognized cites (empty = PASS).
 *
 * Worry-to-Pristine round 1 finding C9.
 */
export function findFabricatedCitations(
  output: string,
  allowedCaseNames: string[],
): string[] {
  // Match "Word v. Word" case-citation patterns.
  const matches = output.match(/\b[A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+)*\s+v\.\s+[A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+)*/g) || [];
  // Foundational allowlist — constitutional anchors that are safe to cite without being in the
  // case-specific precedent list.
  const allowlist = [
    /^miranda v\. arizona/i,
    /^brady v\. maryland/i,
    /^strickland v\. washington/i,
    /^padilla v\. kentucky/i,
    /^gideon v\. wainwright/i,
    /^terry v\. ohio/i,
    /^mapp v\. ohio/i,
    /^katz v\. united states/i,
  ];
  const allowedLower = allowedCaseNames.map((n) => (n || "").toLowerCase());
  const unrecognized: string[] = [];
  for (const cite of matches) {
    const citeLower = cite.toLowerCase();
    if (allowlist.some((rx) => rx.test(citeLower))) continue;
    // Substring check: allowed case-name must APPEAR in cite OR cite appear in name.
    const matched = allowedLower.some((name) =>
      name.length > 5 && (citeLower.includes(name) || name.includes(citeLower)),
    );
    if (!matched) unrecognized.push(cite);
  }
  return [...new Set(unrecognized)];
}

/**
 * Detects UPL-banned directive language in LLM output.
 * Returns array of matches (empty = PASS).
 *
 * Worry-to-Pristine round 1 finding W11.
 */
export function findUPLBannedPhrases(output: string): string[] {
  const hits: string[] = [];
  for (const rx of UPL_BANNED_PATTERNS) {
    const match = output.match(rx);
    if (match) hits.push(match[0]);
  }
  return [...new Set(hits)];
}

/**
 * Formats an integer as an English ordinal (1st, 2nd, 3rd, 4th, 11th, 21st).
 * Worry-to-Pristine round 1 findings W2, W3.
 */
export function formatOrdinal(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

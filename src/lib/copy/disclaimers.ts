/**
 * Canonical UPL disclaimers — single source of truth for the most-duplicated
 * legal-information disclaimers across the app.
 *
 * Use these constants when you need the EXACT brand-level or report-level
 * disclaimer. For context-specific variants (per-state, per-charge,
 * playbook-specific, email-frame, calculator state-rule), keep the inline
 * copy — extracting those would lose the contextual framing that makes them
 * useful.
 *
 * UPL approval: docs/handoff/2026-04-26-product-audit-deferred.md D7.
 * Plan: docs/plans/2026-04-26-d7-upl-disclaimer-extraction.md.
 *
 * Leaf module — zero imports, Deno-compatible (safe to import from Edge
 * Function-bound code paths like `src/lib/intelligence-brief/render.ts`).
 */

/** Brand-level UPL disclaimer. 11 files, 14 occurrences. */
export const BRAND_UPL_DISCLAIMER = "Legal information, not legal advice.";

/** Report/product-level UPL disclaimer. 4 files, 5 occurrences. */
export const REPORT_UPL_DISCLAIMER =
  "This report provides legal INFORMATION, not legal ADVICE. Decisions about how to use this information stay with you.";

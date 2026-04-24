/**
 * Tier 9 data-driven report constants.
 * Shared across webhook, intake route, and generation module.
 */

export const TIER9_SLUGS = new Set([
  "judge-report-card",
  "officer-background-check",
  "similar-cases-analyzer",
  "district-court-intelligence",
  "arrest-survival-kit",
  "federal-sentencing-distribution",
  "federal-jury-instruction-brief",
  "precedent-watchlist",
  "charge-authority-pack",
  "motion-success-report",
]);

export function isTier9Slug(slug: string): boolean {
  return TIER9_SLUGS.has(slug);
}

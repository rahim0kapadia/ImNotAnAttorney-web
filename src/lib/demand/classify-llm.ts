/**
 * Demand classification via LLM.
 *
 * STUB: Created 2026-05-03 to satisfy verify-architecture.js gate referenced in
 * src/lib/CONTEXT.md. Actual implementation pending — Edge Function path
 * not yet wired. See docs/plans/ for follow-up scope.
 */

export type DemandClassification = {
  primary: string;
  secondary?: string;
  confidence: number;
};

export async function classifyDemand(_text: string): Promise<DemandClassification | null> {
  // TODO: implement via Claude API (per /skill claude-api with prompt caching)
  return null;
}

/**
 * @fileoverview TICKET-17 — Intelligence Brief wire for the shared
 * sentencing-distribution helper.
 *
 * Why a wrapper: the IB report rendering itself happens in the Deno
 * Edge Function at `supabase/functions/generate-report/`, which CANNOT
 * import `@/lib/*` (the lib uses `@supabase/supabase-js` + path aliases
 * that Deno + Edge Functions don't resolve — see
 * `pattern-edge-function-feature-flag-inline.md`).
 *
 * Pattern: this Node-side helper exposes a pre-render path. Anywhere
 * the IB pipeline runs Node-side BEFORE handing off to the Edge
 * Function (e.g. an enrichment step that writes
 * `intakes.charge_specific_data` or `cases.report_sentencing_overlay`),
 * call `buildIbSentencingOverlay` and store the resulting markdown
 * string on a column the Edge Function reads back when assembling the
 * IB body.
 *
 * If/when the IB Edge Function path lands a Phase 2 native fetch (per
 * the cross-project shared-USSC plan), this helper becomes a thin
 * passthrough — the lib stays the source of truth.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getSentencingDistribution,
  renderSentencingDistribution,
  type GetSentencingDistributionInput,
} from "./distribution";

/**
 * Build the IB-tier sentencing-distribution overlay (intelligence-brief
 * tier — 50-case district floor). Returns a single markdown string the
 * IB renderer can drop into the Court Prep section verbatim.
 *
 * Returns `null` (NOT empty string) when there's no usable data, so
 * callers can guard with truthiness rather than length-check.
 */
export async function buildIbSentencingOverlay(
  sb: SupabaseClient,
  input: Omit<GetSentencingDistributionInput, "tier">,
): Promise<string | null> {
  const result = await getSentencingDistribution(sb, {
    ...input,
    tier: "intelligence-brief",
  });
  const text = renderSentencingDistribution(result);
  return text.length > 0 ? text : null;
}

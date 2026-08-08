/**
 * X-Ray Section X3 — Capital-Adjacency Context (TICKET-19).
 *
 * X-Ray ($2,497) discovery-tier enhancement that surfaces a capital-
 * eligibility check sidebar when the buyer's charge is theoretically
 * capital-eligible AND the buyer's state has a death-penalty statute
 * (active or moratorium) OR the charge is federally capital-eligible.
 *
 * Tier monotonicity (HARD):
 *   - Sex Offense Playbook ($147) + Federal Criminal Playbook ($147) get
 *     the same sidebar via the playbook-addendum render. X-Ray's
 *     differentiation comes from the discovery-tier context: the X-Ray
 *     sidebar is rendered alongside actual case-derived charge data
 *     (judge_motion_outcome_rates, federal-pji-cross-ref), not as a
 *     standalone post-purchase artifact.
 *   - Render gate is the same across tiers — `eligible` must be true.
 *     There is no tier-dependent expansion of the eligibility table; the
 *     law is the law.
 *
 * UPL (HARD):
 *   - Phrasing is theoretical / contextual ("can theoretically reach"),
 *     never predictive.
 *   - Banned-phrase blocklist (UPL_BANNED_PHRASES from charge-slug-maps)
 *     enforced at test time on the rendered HTML.
 *   - Source URLs (DPIC executions CSV + state-by-state policy table) are
 *     embedded in every render — verification chain stays unbroken.
 *
 * Federal-state interaction:
 *   Federal jurisdiction can pursue capital punishment regardless of state
 *   abolition (Tsarnaev / Boston Marathon — MA had abolished its statute,
 *   the federal charge under 18 U.S.C. § 2332a still applied). The render
 *   surfaces this when the underlying charge class is federally eligible.
 *
 * Source:
 *   docs/plans/2026-04-23-data-to-product-autonomous-execution.md (TICKET-19)
 *   src/lib/dpic/capital-context.ts (shared helper)
 */

import {
  type CapitalContext,
  type CapitalEligibleChargeClass,
  getCapitalContext,
  queryCapitalExecutionStats,
  renderCapitalContextHtml,
} from "@/lib/dpic/capital-context";

// ============================================================
// Types
// ============================================================

export interface XrayCapitalContextInput {
  /** 2-letter state postal — used to resolve eligibility + execution stats. */
  state?: string | null;
  /** Capital-adjacent charge class extracted from the X-Ray case file. */
  chargeClass?: CapitalEligibleChargeClass | null;
}

export interface XrayCapitalContextData {
  /** Underlying CapitalContext from the shared helper, or null when no
   *  charge class was supplied / class is non-capital. */
  context: CapitalContext | null;
  /** True when the section should render. Convenience for the assembler. */
  shouldRender: boolean;
  limitations: string[];
}

// ============================================================
// Query
// ============================================================

/**
 * Builds the X-Ray capital-context section.
 *
 * Returns `shouldRender=false` when:
 *   - chargeClass is null (charge isn't in the capital-adjacent set), OR
 *   - getCapitalContext.eligible is false (charge in scope but state +
 *     federal eligibility both fail)
 *
 * The X-Ray assembler can defensively skip rendering when shouldRender is
 * false without checking the inner context shape.
 */
export async function queryXrayCapitalContext(
  input: XrayCapitalContextInput,
): Promise<XrayCapitalContextData> {
  const limitations: string[] = [];

  if (!input.chargeClass) {
    return { context: null, shouldRender: false, limitations };
  }

  const stateRaw = (input.state ?? "").trim().toUpperCase();
  const state = /^[A-Z]{2}$/.test(stateRaw) ? stateRaw : null;

  if (!state) {
    limitations.push(
      "No state on file; capital-context check uses federal-eligibility status only.",
    );
  }

  const stats = state
    ? await queryCapitalExecutionStats([state])
    : new Map<string, { count: number; lastYear: number | null }>();
  const stateStat = state ? stats.get(state) : undefined;

  const ctx = getCapitalContext({
    state,
    chargeClass: input.chargeClass,
    surface: "xray",
    lastDecadeExecutions: stateStat?.count ?? 0,
    lastExecutionYear: stateStat?.lastYear ?? null,
  });

  if (!ctx.eligible) {
    return { context: null, shouldRender: false, limitations };
  }

  return { context: ctx, shouldRender: true, limitations };
}

// ============================================================
// Render
// ============================================================

/**
 * Renders the X-Ray capital-context section as standalone HTML. Returns
 * empty string when `shouldRender=false` (defensive — render call site can
 * splice unconditionally).
 *
 * The internal `renderCapitalContextHtml` is the canonical voice + UPL-
 * verified render — used by both X-Ray (this file) and the playbook
 * addendum so the wording stays consistent across tiers.
 */
export function renderXrayCapitalContext(data: XrayCapitalContextData): string {
  if (!data.shouldRender || !data.context) return "";
  // The X-Ray wrapper section gets a tier-typed heading so the buyer reads
  // it in the X-Ray context, not as a generic add-on.
  const inner = renderCapitalContextHtml(data.context);
  return `
    <section class="xray-section xray-capital-context">
      <h2>Capital-Eligibility Check (X-Ray)</h2>
      ${inner}
    </section>
  `;
}

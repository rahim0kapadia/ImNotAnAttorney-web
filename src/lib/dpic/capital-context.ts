/**
 * Capital-Adjacency Context (TICKET-19).
 *
 * For charges where the federal or state statutory maximum is *theoretically*
 * capital, attach a sidebar that surfaces:
 *   - Whether the buyer's state retains the death penalty in statute
 *   - The last decade of executions in that state (count + last year)
 *   - DPIC source URL for independent verification
 *
 * Voice: Mercer. Tone is theoretical / contextual, never predictive.
 *
 * UPL HARD RULES:
 *   - Returned text MUST NOT predict outcomes ("will be charged capital",
 *     "you face execution", "death is likely").
 *   - Phrasing is bounded to "can theoretically reach" / "in your state, the
 *     last decade of executions looked like this" / "your attorney should be
 *     doing this calculation".
 *   - Source URL is always the DPIC executions CSV (the row source) —
 *     verification chain stays unbroken.
 *   - Render gate: section ONLY appears when eligibility = true. No false
 *     positives. No "your charge is unlikely to be capital" reassurance copy
 *     (out of scope, opinion-adjacent).
 *
 * Tier surfaces:
 *   - Sex Offense Playbook    (slug: "sex-offense")
 *   - Federal Criminal Playbook (slug: "federal-criminal")
 *   - X-Ray (discovery tier)
 *
 * Data source:
 *   - Eligibility table: DPIC state-by-state
 *     (https://deathpenaltyinfo.org/state-and-federal-info/state-by-state)
 *     embedded as a const map below — DPIC is a stable authority and the
 *     map changes only on legislative action (rare). Citation tied to every
 *     row.
 *   - Last-decade execution count: queried from public.dpic_executions.
 *
 * Why an embedded eligibility table instead of a DB lookup?
 *   - DPIC's state-by-state status is policy state, not event data. Every
 *     row of dpic_executions is an *event*. We need policy *and* event data
 *     to answer the question; events alone do not tell us a state is
 *     "abolitionist by statute" (e.g. NJ, IL — abolished post-1976 but with
 *     pre-abolition executions still in dpic_executions).
 *   - Map is small (~50 entries), changes ~once/year, and is the authoritative
 *     "is this state capital-eligible right now?" answer. Citation is
 *     embedded in the constant.
 */

// ============================================================
// Types
// ============================================================

/**
 * Statutory capital eligibility status of a US jurisdiction.
 *
 * - "active":     Death penalty in statute AND active (executions occur)
 * - "moratorium": Death penalty in statute, governor-imposed pause (CA, OR, PA, TN)
 * - "abolished":  Statute repealed (no longer a possible sentence)
 * - "never":      Never adopted (no statute, no abolition needed)
 */
export type CapitalStatus = "active" | "moratorium" | "abolished" | "never";

/**
 * Charge class buckets we consider for capital adjacency.
 *
 * Federal capital-eligible charge classes (18 U.S.C. § 3591):
 *   - first-degree murder (incl. murder-for-hire, federal officer murder)
 *   - treason / espionage
 *   - large-scale drug-trafficking-with-death (continuing criminal enterprise)
 *   - terrorism resulting in death
 *
 * State capital-eligible charge classes (varies by state, but generally):
 *   - capital murder / first-degree murder with aggravators
 *   - aggravated felony murder
 *
 * Sex offense charges are NOT federally capital-eligible standing alone
 * (Kennedy v. Louisiana, 554 U.S. 407 (2008) — death penalty for non-
 * homicide rape of a child unconstitutional). However, we surface the
 * sidebar on Sex Offense Playbook when the underlying charge involves a
 * resulting death (sex-offense-felony-murder, sexual assault resulting in
 * death) — those sit at the federal capital-eligible boundary via
 * 18 U.S.C. § 2245 (sex offense resulting in death).
 */
export type CapitalEligibleChargeClass =
  | "murder-first-degree"
  | "murder-capital"
  | "felony-murder"
  | "treason"
  | "espionage"
  | "drug-trafficking-with-death"
  | "terrorism-with-death"
  | "sex-offense-resulting-in-death";

export interface CapitalContext {
  /**
   * Whether to render the sidebar at all. False = render gate trips, no
   * output. True = the charge is theoretically capital-eligible AND the
   * state has a statute (active or moratorium) OR the charge is federal-
   * eligible regardless of state status.
   */
  eligible: boolean;

  /** Render-time hint: which surface invoked the helper. */
  surface: "playbook" | "xray";

  /** 2-letter state postal code (uppercase) — null when unknown. */
  state: string | null;

  /** Capital-adjacent charge class extracted from the buyer's charge. */
  chargeClass: CapitalEligibleChargeClass;

  /**
   * State capital eligibility status. "never" / "abolished" still allow
   * eligibility=true when the underlying charge is federally capital-
   * eligible (federal jurisdiction overrides state status — Boston Marathon
   * bombing was death-eligible in MA despite state abolition, because the
   * federal charge under 18 U.S.C. § 2332a applied).
   */
  stateCapitalEligibility: CapitalStatus | null;

  /** Whether the charge class triggers federal capital eligibility. */
  federalCapitalEligible: boolean;

  /** Number of executions in this state in the last 10 years (DPIC). */
  lastDecadeExecutions: number;

  /** Year of most recent execution in this state — null if none. */
  lastExecutionYear: number | null;

  /** Year of statute change for "abolished" — null when not applicable. */
  abolishedYear: number | null;

  /** DPIC executions CSV source URL — citation chain. */
  sourceUrl: string;

  /** DPIC state-by-state policy page — citation chain. */
  policySourceUrl: string;
}

// ============================================================
// State-by-state capital eligibility map
// ============================================================
//
// Source: https://deathpenaltyinfo.org/state-and-federal-info/state-by-state
// Captured 2026-05-03. Update on any legislative change.
// `abolishedYear` = year statute was repealed, only present for "abolished".

interface StateStatus {
  status: CapitalStatus;
  abolishedYear: number | null;
}

export const STATE_CAPITAL_STATUS: Record<string, StateStatus> = {
  // Active death penalty states
  AL: { status: "active", abolishedYear: null },
  AZ: { status: "active", abolishedYear: null },
  AR: { status: "active", abolishedYear: null },
  FL: { status: "active", abolishedYear: null },
  GA: { status: "active", abolishedYear: null },
  ID: { status: "active", abolishedYear: null },
  IN: { status: "active", abolishedYear: null },
  KS: { status: "active", abolishedYear: null },
  KY: { status: "active", abolishedYear: null },
  LA: { status: "active", abolishedYear: null },
  MS: { status: "active", abolishedYear: null },
  MO: { status: "active", abolishedYear: null },
  MT: { status: "active", abolishedYear: null },
  NE: { status: "active", abolishedYear: null },
  NV: { status: "active", abolishedYear: null },
  NC: { status: "active", abolishedYear: null },
  OH: { status: "active", abolishedYear: null },
  OK: { status: "active", abolishedYear: null },
  SC: { status: "active", abolishedYear: null },
  SD: { status: "active", abolishedYear: null },
  TN: { status: "active", abolishedYear: null },
  TX: { status: "active", abolishedYear: null },
  UT: { status: "active", abolishedYear: null },
  WY: { status: "active", abolishedYear: null },

  // Moratorium states (statute on books, governor-paused executions)
  CA: { status: "moratorium", abolishedYear: null },
  OR: { status: "moratorium", abolishedYear: null },
  PA: { status: "moratorium", abolishedYear: null },

  // Abolished states (statute repealed)
  CO: { status: "abolished", abolishedYear: 2020 },
  CT: { status: "abolished", abolishedYear: 2012 },
  DE: { status: "abolished", abolishedYear: 2016 },
  IL: { status: "abolished", abolishedYear: 2011 },
  MD: { status: "abolished", abolishedYear: 2013 },
  NH: { status: "abolished", abolishedYear: 2019 },
  NJ: { status: "abolished", abolishedYear: 2007 },
  NM: { status: "abolished", abolishedYear: 2009 },
  NY: { status: "abolished", abolishedYear: 2007 },
  VA: { status: "abolished", abolishedYear: 2021 },
  WA: { status: "abolished", abolishedYear: 2018 },

  // Never had a death penalty (no execution-era statute)
  AK: { status: "never", abolishedYear: null },
  HI: { status: "never", abolishedYear: null },
  IA: { status: "never", abolishedYear: null },
  ME: { status: "never", abolishedYear: null },
  MA: { status: "never", abolishedYear: null },
  MI: { status: "never", abolishedYear: null },
  MN: { status: "never", abolishedYear: null },
  ND: { status: "never", abolishedYear: null },
  RI: { status: "never", abolishedYear: null },
  VT: { status: "never", abolishedYear: null },
  WV: { status: "never", abolishedYear: null },
  WI: { status: "never", abolishedYear: null },

  // DC — no death penalty
  DC: { status: "never", abolishedYear: null },
};

// ============================================================
// Charge classes that trigger federal capital eligibility
// ============================================================
//
// Federal jurisdiction can pursue capital punishment regardless of state
// abolition. Boston Marathon bombing (Tsarnaev) is the canonical example —
// MA abolished its statute in 1984 but the federal charge under 18 U.S.C.
// § 2332a allowed death sentence.

export const FEDERAL_CAPITAL_ELIGIBLE_CLASSES: ReadonlySet<CapitalEligibleChargeClass> =
  new Set([
    "murder-first-degree",
    "murder-capital",
    "treason",
    "espionage",
    "drug-trafficking-with-death",
    "terrorism-with-death",
    "sex-offense-resulting-in-death",
  ]);

// ============================================================
// Source URLs
// ============================================================

export const DPIC_EXECUTIONS_SOURCE_URL =
  "http://deathpenaltyinfo.org/query/executions.csv";

export const DPIC_POLICY_SOURCE_URL =
  "https://deathpenaltyinfo.org/state-and-federal-info/state-by-state";

// ============================================================
// Helper API
// ============================================================

/**
 * Build a CapitalContext for the given state + charge class.
 *
 * Pure helper (no DB access). DB-backed last-decade execution count is
 * supplied via `lastDecadeExecutions` + `lastExecutionYear` parameters,
 * letting the caller batch the query (queryCapitalExecutionStats below)
 * across multiple states without re-running the helper per row.
 *
 * Render gate (eligible=true) requires:
 *   - Charge class is in CAPITAL_ELIGIBLE_CLASSES, AND
 *   - At least one of:
 *     - state has an active or moratorium statute, OR
 *     - charge class is federally capital-eligible (federal jurisdiction
 *       pre-empts state abolition)
 *
 * Returns `eligible: false` when neither is true — the renderer SKIPS the
 * section entirely. No reassurance copy.
 */
export function getCapitalContext(args: {
  state: string | null;
  chargeClass: CapitalEligibleChargeClass;
  surface: "playbook" | "xray";
  lastDecadeExecutions?: number;
  lastExecutionYear?: number | null;
}): CapitalContext {
  const { chargeClass, surface } = args;
  const stateRaw = (args.state ?? "").trim().toUpperCase();
  const state = stateRaw.length === 2 ? stateRaw : null;
  const stateRow = state ? STATE_CAPITAL_STATUS[state] : undefined;
  const stateCapitalEligibility = stateRow?.status ?? null;
  const abolishedYear = stateRow?.abolishedYear ?? null;
  const federalCapitalEligible = FEDERAL_CAPITAL_ELIGIBLE_CLASSES.has(chargeClass);

  // Eligibility gate: state-active OR state-moratorium OR federal-eligible.
  const stateEligible =
    stateCapitalEligibility === "active" || stateCapitalEligibility === "moratorium";
  const eligible = stateEligible || federalCapitalEligible;

  return {
    eligible,
    surface,
    state,
    chargeClass,
    stateCapitalEligibility,
    federalCapitalEligible,
    lastDecadeExecutions: args.lastDecadeExecutions ?? 0,
    lastExecutionYear: args.lastExecutionYear ?? null,
    abolishedYear,
    sourceUrl: DPIC_EXECUTIONS_SOURCE_URL,
    policySourceUrl: DPIC_POLICY_SOURCE_URL,
  };
}

// ============================================================
// DB-backed stats query (batchable)
// ============================================================

/**
 * Returns last-decade execution count + most-recent year for each state in
 * `states`. Service-role DB access only (server-side; aligned with the rest
 * of the addendum/X-Ray data layer in this repo).
 *
 * Query is bounded to dpic_executions (defended by ARCHITECTURE.md
 * invariant #4 — service-role DB access only on server).
 */
export async function queryCapitalExecutionStats(
  states: readonly string[],
): Promise<Map<string, { count: number; lastYear: number | null }>> {
  const out = new Map<string, { count: number; lastYear: number | null }>();
  if (states.length === 0) return out;

  // Lazy import — keeps the helper unit-testable without the supabase admin
  // client in the import graph.
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();

  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - 10);
  const cutoffIso = cutoffDate.toISOString().slice(0, 10);

  const { data } = await supabase
    .from("dpic_executions")
    .select("state_code, execution_date")
    .in("state_code", states.map((s) => s.toUpperCase()))
    .gte("execution_date", cutoffIso);

  for (const state of states) {
    out.set(state.toUpperCase(), { count: 0, lastYear: null });
  }
  for (const row of data ?? []) {
    const code = (row.state_code as string).toUpperCase();
    const cur = out.get(code) ?? { count: 0, lastYear: null };
    cur.count += 1;
    const yr = Number(String(row.execution_date).slice(0, 4));
    if (Number.isFinite(yr) && (cur.lastYear === null || yr > cur.lastYear)) {
      cur.lastYear = yr;
    }
    out.set(code, cur);
  }
  return out;
}

// ============================================================
// Charge-class extraction
// ============================================================

/**
 * Map an internal charge slug or charge type to a capital-eligible charge
 * class. Returns null when the charge is NOT in our capital-adjacent set
 * (the helper render gate then skips the section).
 *
 * This is intentionally strict — anything not on the explicit list returns
 * null. False positives here become silent UPL exposure on customer
 * playbooks. Better to under-render than over-render.
 */
export function chargeClassForSlug(
  chargeSlug: string | null | undefined,
): CapitalEligibleChargeClass | null {
  if (!chargeSlug) return null;
  const c = chargeSlug.toLowerCase().trim();

  // First-degree / capital murder
  if (c === "murder-first-degree" || c === "first-degree-murder" || c === "capital-murder") {
    return "murder-capital";
  }
  if (c === "murder" || c === "homicide-first-degree") {
    return "murder-first-degree";
  }
  if (c === "felony-murder") return "felony-murder";

  // Federal-only categories
  if (c === "treason") return "treason";
  if (c === "espionage") return "espionage";
  if (c === "drug-trafficking-with-death" || c === "cce-with-death") {
    return "drug-trafficking-with-death";
  }
  if (c === "terrorism-with-death" || c === "wmd-resulting-in-death") {
    return "terrorism-with-death";
  }

  // Sex-offense + resulting death (post-Kennedy v. Louisiana, this is the
  // only sex-offense charge class that remains theoretically capital-
  // eligible at the federal level via 18 U.S.C. § 2245).
  if (c === "sex-offense-resulting-in-death" || c === "sexual-assault-resulting-in-death") {
    return "sex-offense-resulting-in-death";
  }

  return null;
}

// ============================================================
// Mercer-voiced render block
// ============================================================
//
// HARD UPL constraints:
//   - No "you should" / "we recommend" / "best course of action" / etc.
//     (See UPL_BANNED_PHRASES in charge-slug-maps.ts.)
//   - No predictive language ("you will face", "expect to be charged
//     capital", "death is likely").
//   - Frame as historical / contextual / theoretical.
//   - Always cite DPIC for both eligibility status and execution counts.
//
// Voice: Mercer (TACTICAL when describing the system; CHARM only in the
// "your attorney" line). See .claude/rules/brand-voice.md.

/**
 * Returns Mercer-voiced HTML for the capital-context sidebar, OR an empty
 * string if `ctx.eligible` is false. The empty-string contract is the
 * render gate — callers can always splice the return value into the
 * surrounding template without checking eligibility separately.
 */
export function renderCapitalContextHtml(ctx: CapitalContext): string {
  if (!ctx.eligible) return "";

  const stateLabel = ctx.state ?? "your state";
  const lastExecLine =
    ctx.lastExecutionYear !== null
      ? `Last execution in ${stateLabel}: <strong>${ctx.lastExecutionYear}</strong>.`
      : `${stateLabel} has carried out no executions in the past decade.`;

  const decadeLine = `Past decade in ${stateLabel}: <strong>${ctx.lastDecadeExecutions}</strong> ${ctx.lastDecadeExecutions === 1 ? "execution" : "executions"}.`;

  let policyLine: string;
  switch (ctx.stateCapitalEligibility) {
    case "active":
      policyLine = `${stateLabel} retains the death penalty in statute.`;
      break;
    case "moratorium":
      policyLine = `${stateLabel} retains the statute. Executions are paused under a governor-imposed moratorium.`;
      break;
    case "abolished":
      policyLine = ctx.abolishedYear
        ? `${stateLabel} repealed its death-penalty statute in ${ctx.abolishedYear}.`
        : `${stateLabel} has abolished its death-penalty statute.`;
      break;
    case "never":
      policyLine = `${stateLabel} has no death-penalty statute.`;
      break;
    default:
      policyLine = "State statute status is not on file in our reference table.";
  }

  const federalNote = ctx.federalCapitalEligible
    ? `<p class="cap-context-fed">Federal jurisdiction can pursue capital punishment for charges in this class regardless of state-level abolition. The Boston Marathon case is the canonical post-1976 example: the underlying state had no statute, the federal charge did.</p>`
    : "";

  // Mercer-voiced framing block. Phrasing is theoretical / contextual.
  // "Can theoretically reach" is the bounded-eligibility phrase. The
  // attorney-handoff line is Mercer's CHARM mode — confident, never
  // directive.
  return `
    <aside class="capital-context" data-eligible="true" data-state="${ctx.state ?? ""}" data-class="${ctx.chargeClass}">
      <h3 class="cap-context-title">Capital-Eligibility Check</h3>
      <p class="cap-context-lead">
        This charge class can theoretically reach the capital tier. That does not mean it will. It means the eligibility line is on the map for cases like this, and the calculation belongs in your file.
      </p>
      <ul class="cap-context-stats">
        <li>${policyLine}</li>
        <li>${decadeLine}</li>
        <li>${lastExecLine}</li>
      </ul>
      ${federalNote}
      <p class="cap-context-handoff">
        Your attorney will run this calculation for your specific case facts &mdash; the aggravators, the jurisdiction, the prosecution's stated theory. Mercer's job here is to make sure that calculation actually happens, not to substitute for it.
      </p>
      <p class="cap-context-sources">
        Sources: DPIC executions database (<a href="${ctx.sourceUrl}" target="_blank" rel="noopener">executions.csv</a>); DPIC state-by-state policy table (<a href="${ctx.policySourceUrl}" target="_blank" rel="noopener">state-and-federal-info</a>). Both updated continuously by the Death Penalty Information Center.
      </p>
    </aside>
  `;
}

// ============================================================
// Tier-eligibility (which playbook slugs / surfaces get the sidebar)
// ============================================================

/**
 * Playbook slugs that get the capital-context sidebar attached.
 * Other playbooks (DUI, drug possession, white collar, etc.) are not in
 * scope per TICKET-19 — capital adjacency is irrelevant for those classes.
 */
export const CAPITAL_SIDEBAR_PLAYBOOK_SLUGS: ReadonlySet<string> = new Set([
  "sex-offense",
  "federal-criminal",
]);

/**
 * Convenience predicate: should this playbook attempt to render the
 * capital sidebar? (Eligibility within the sidebar is gated separately
 * via getCapitalContext.eligible.)
 */
export function playbookSlugSupportsCapitalSidebar(slug: string): boolean {
  return CAPITAL_SIDEBAR_PLAYBOOK_SLUGS.has(slug);
}

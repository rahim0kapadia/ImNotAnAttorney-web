/**
 * Turn a standalone-product slug + Stripe session metadata into an intake
 * object when all required fields for that slug are present. Returns null when
 * the intake cannot be pre-populated and the webhook should fall through to
 * sending the customer an intake email.
 *
 * Mirrors the fields the /api/intake/standalone/[slug] route would accept.
 * Kept in src/lib/tier9-reports/ next to other Tier 9 orchestration so the
 * allowlist lives with the rest of the Tier 9 constants + types.
 */

export interface PrepopulatedIntakeMetadata {
  judge_name?: string;
  officer_name?: string;
  charge_type?: string;
  state?: string;
  courthouse?: string;
  /** Free-text agency (e.g., "Chicago PD"). Used by Officer BG Check to
   *  route to CPD-depth data when the agency matches the CPD whitelist. */
  agency?: string;
  /** Optional badge / star number — disambiguates common names within CPD. */
  badge_number?: string;
  /** Federal charge slug — sent by AvailabilityChecker for federal-jury-instruction-brief. */
  federal_charge?: string;
  /** Federal circuit — sent by AvailabilityChecker for federal-jury-instruction-brief and
   *  motion-success-report. Optional: resolver derives circuit from state when blank. */
  circuit?: string;
}

export function buildPrePopulatedIntake(
  slug: string,
  metadata: PrepopulatedIntakeMetadata | null | undefined,
): Record<string, string> | null {
  if (!metadata) return null;
  const judgeName = metadata.judge_name || "";
  const officerName = metadata.officer_name || "";
  const chargeType = metadata.charge_type || "";
  const state = metadata.state || "";
  const courthouse = metadata.courthouse || "";
  const federalCharge = metadata.federal_charge || "";
  const circuit = metadata.circuit || "";

  switch (slug) {
    case "judge-report-card":
      if (!judgeName || !state) return null;
      return {
        judgeName,
        state,
        chargeType: chargeType || "other",
      };
    case "officer-background-check": {
      if (!officerName || !state) return null;
      const out: Record<string, string> = { officerName, state };
      if (metadata.agency) out.agency = metadata.agency;
      if (metadata.badge_number) out.badgeNumber = metadata.badge_number;
      return out;
    }
    case "similar-cases-analyzer":
      if (!chargeType || !state) return null;
      return { chargeType, state };
    case "district-court-intelligence":
      // Courthouse Intelligence Pack $147 — courthouse optional narrower filter.
      if (!state) return null;
      return courthouse ? { state, courthouse } : { state };
    case "arrest-survival-kit":
      if (!state) return null;
      return { state };

    // ── Archetype-C SKUs: added 2026-04-27 ──────────────────────────────────
    // These SKUs can be auto-generated when the AvailabilityChecker payload
    // covers all required intake fields. The route.ts standalone metadata now
    // threads federal_charge and circuit through Stripe metadata so the webhook
    // can reach this path for federal-jury-instruction-brief and
    // motion-success-report.

    case "precedent-watchlist":
      // Required: chargeType, state. Both are deterministically present from
      // the AvailabilityChecker form (chargeType is required, state is required).
      if (!chargeType || !state) return null;
      return { chargeType, state };

    case "federal-jury-instruction-brief":
      // Required: federalCharge, circuit, state.
      // federalCharge is required in the AvailabilityChecker form.
      // circuit is optional in the form (auto-detected from state when blank);
      // the resolver handles a blank circuit by deriving from state.
      // state is required (display context + circuit cascade).
      if (!federalCharge || !state) return null;
      return circuit ? { federalCharge, circuit, state } : { federalCharge, state };

    case "charge-authority-pack":
      // Required: chargeType, state, circuit (per intakeFields). However per the
      // products.ts comment, circuit is display context only — the authority list
      // is national precedent, not circuit-filtered. AvailabilityChecker does NOT
      // collect circuit for this SKU. We pre-populate chargeType + state; circuit
      // will be empty and the resolver uses national data without circuit context.
      if (!chargeType || !state) return null;
      return { chargeType, state };

    case "motion-success-report":
      // Required: chargeType, state. Optional: circuit, judgeName (both narrow
      // the report sections but are not gating fields — the resolver skips the
      // judge section when judgeName is absent and derives circuit from state).
      // AvailabilityChecker sends circuit and judgeName only when the user fills
      // those optional fields. Include them when present.
      if (!chargeType || !state) return null;
      {
        const out: Record<string, string> = { chargeType, state };
        if (circuit) out.circuit = circuit;
        if (judgeName) out.judgeName = judgeName;
        return out;
      }

    // federal-sentencing-distribution stays archetype C — AvailabilityChecker
    // does not collect district, priorConvictions, or criminalHistoryCategory,
    // all three of which are required intake fields for the FSD resolver
    // (district-level percentile bucketing requires all three to locate the
    // correct USSC distribution row). Deferred to a future AvailabilityChecker
    // form expansion.

    default:
      return null;
  }
}

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

  switch (slug) {
    case "judge-report-card":
      if (!judgeName || !state) return null;
      return {
        judgeName,
        state,
        chargeType: chargeType || "other",
      };
    case "officer-background-check":
      if (!officerName || !state) return null;
      return { officerName, state };
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
    default:
      return null;
  }
}

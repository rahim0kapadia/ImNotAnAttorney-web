/**
 * Bond exposure estimator, used when a real bond amount isn't captured
 * on court_reminders rows (bond_amount_cents column does not exist today).
 *
 * The partner dashboard surfaces "protected exposure" as an outcome metric.
 * Honest to the bondsman: the component marks it `(estimated)`.
 *
 * Bucket values are informed by the FtaCalculator default ($10,000 avg bail)
 * and industry tiers. Revisit when a real bond column lands.
 */

export type ChargeTypeSlug = string | null | undefined;

const BOND_ESTIMATE_CENTS: Record<string, number> = {
  misdemeanor: 250_000,
  "misdemeanor-dui": 500_000,
  dui: 500_000,
  "drug-possession": 500_000,
  "drug-dui": 500_000,
  assault: 1_500_000,
  theft: 1_500_000,
  "domestic-violence": 1_500_000,
  "felony-drug": 2_500_000,
  "violent-felony": 5_000_000,
  felony: 2_500_000,
};

const DEFAULT_BOND_ESTIMATE_CENTS = 1_000_000;

export function estimateBondCentsForChargeType(chargeType: ChargeTypeSlug): number {
  if (!chargeType) return DEFAULT_BOND_ESTIMATE_CENTS;
  const normalized = chargeType.toLowerCase().trim();
  if (normalized in BOND_ESTIMATE_CENTS) return BOND_ESTIMATE_CENTS[normalized];
  for (const [slug, cents] of Object.entries(BOND_ESTIMATE_CENTS)) {
    if (normalized.includes(slug)) return cents;
  }
  return DEFAULT_BOND_ESTIMATE_CENTS;
}

interface ClientLite {
  charge_type: string | null;
  status: string;
}

export function sumProtectedExposureCents(clients: ClientLite[]): number {
  let total = 0;
  for (const c of clients) {
    if (c.status !== "active") continue;
    total += estimateBondCentsForChargeType(c.charge_type);
  }
  return total;
}

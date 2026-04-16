/**
 * Canonical list of valid charge types accepted across the application.
 * Used by both the intake form (/api/intake) and checkout (/api/checkout)
 * to validate user-supplied charge type strings.
 *
 * Split into two groups:
 *   1. Current intake form values (multi-step form with specific subcategories)
 *   2. Legacy values from older intake forms (broader categories)
 *
 * When adding a new charge type, add it HERE, both routes import from this file.
 */
/**
 * Map legacy charge slugs to new common_charge slugs.
 * Pure function, no DB needed. Uses hardcoded map from spec.
 */
const LEGACY_SLUG_MAP: Record<string, string> = {
  "dui": "dui-dwi",
  "dui-first": "dui-first-offense",
  "dui-repeat": "dui-repeat-offense",
  "assault": "simple-assault",
  "domestic-violence": "domestic-violence",
  "theft": "theft-larceny",
  "robbery": "robbery",
  "burglary": "burglary",
  "fraud": "fraud-general",
  "white-collar": "fraud-general",
  "drug-possession": "drug-possession",
  "drug-trafficking": "drug-trafficking",
  "drug": "drug-possession",
  "sex-offense": "sex-offense-contact",
  "sex-offense-contact": "sex-offense-contact",
  "sex-offense-digital": "sex-offense-digital",
  "weapons": "weapons-possession",
  "federal": "federal-other",
  "probation-violation": "probation-violation",
  "self-defense": "self-defense",
  "murder": "murder-first-degree",
  "manslaughter": "involuntary-manslaughter",
  "kidnapping": "kidnapping",
  "arson": "arson",
  "stalking": "stalking",
  "child-abuse": "child-abuse",
  "hit-and-run": "hit-run-injury",
  "contempt": "contempt-of-court",
  "other": "other",
  "other-felony": "other",
  "other-misdemeanor": "other",
};

function resolveLegacyChargeSlug(slug: string): string {
  return LEGACY_SLUG_MAP[slug] ?? slug;
}

export const ALLOWED_CHARGE_TYPES = [
  // Current intake form values (hierarchical flow)
  "drug-possession",
  "drug-trafficking",
  "dui",
  "dui-first",
  "dui-repeat",
  "assault",
  "domestic-violence",
  "theft",
  "sex-offense",
  "sex-offense-contact",
  "sex-offense-digital",
  "weapons",
  "white-collar",
  "federal",
  "probation-violation",
  "self-defense",
  "other",
  // Tier 9 expansion, new charge categories (2026-04-12)
  "murder",
  "manslaughter",
  "kidnapping",
  "arson",
  "stalking",
  "child-abuse",
  "hit-and-run",
  "contempt",
  "robbery",
  "burglary",
  "fraud",
  // Legacy values from older intake forms (backward compatibility)
  "drug",
  "other-felony",
  "other-misdemeanor",
] as const;

type ChargeType = (typeof ALLOWED_CHARGE_TYPES)[number];

export function isValidChargeType(value: string): value is ChargeType {
  return (ALLOWED_CHARGE_TYPES as readonly string[]).includes(value);
}

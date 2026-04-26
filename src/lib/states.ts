/**
 * Shared US state code → name lookup.
 *
 * Used by:
 *   - src/lib/tier9-reports/coverage.ts (district coverage state-name match)
 *   - src/lib/tier9-reports/render.ts   (federal-fallback caption rendering)
 *
 * Steal-Before-Building: extracted from inline literal in coverage.ts so the
 * federal-fallback caption + any future Tier 9 SKU hitting the same coverage
 * cliff can reuse a single source of truth.
 */

export const US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

/**
 * Resolve a US state code to its full name. Lookup is case-insensitive;
 * fallback (when the code is outside the 50 states + DC) returns the
 * input UPPER-CASED so customer-facing surfaces never render an empty
 * string and the casing stays consistent regardless of how the caller
 * passed the code in.
 */
export function stateNameOrCode(code: string): string {
  if (!code) return code;
  const upper = code.toUpperCase();
  return US_STATE_NAMES[upper] ?? upper;
}

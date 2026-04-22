/**
 * Shared state-per-charge data types for programmatic SEO pages.
 *
 * Source: jurisdiction_statutes table, seeded via supabase migrations.
 * Data is regenerated from DB via scripts/generate-state-charge-data.mjs
 */

export interface StateChargeData {
  /** Full state name, e.g., "Alabama" */
  name: string;
  /** Two-letter state abbreviation */
  abbr: string;
  /** Statute number, e.g., "Fla. Stat. § 893.13" */
  statuteNumber: string;
  /** Statute title as in the code */
  statuteTitle: string;
  /** Offense classification, e.g., "3rd-degree felony" */
  offenseClass: string;
  /** Minimum possible sentence */
  penaltyMin: string;
  /** Maximum possible sentence */
  penaltyMax: string;
  /** Maximum fine */
  fineMax: string;
  /** Mandatory minimum sentence, null if none */
  mandatoryMinimum: string | null;
  /** Common charge enhancements (prior convictions, aggravating factors) */
  enhancements: string[];
  /** Plain-language note state-specific to this charge */
  note: string;
}

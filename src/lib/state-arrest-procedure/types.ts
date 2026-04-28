/**
 * State arrest-procedure data — schema + types.
 *
 * Per ~/.claude/rules/no-hallucinated-legal-data.md: every populated field
 * MUST have at least one verification URL in source_urls. Fields with
 * unknown values are written as `null` and listed in `_unknown_fields`.
 */

export type RecordingPoliceConsent = "one-party" | "all-party" | "restricted";

export type BailType =
  | "cash"
  | "surety"
  | "signature"
  | "property"
  | "personal_recognizance";

export interface StateArrestProcedure {
  /** Two-letter USPS state code (uppercase). */
  state_code: string;
  /** Full state name. */
  state_name: string;
  /** ISO date the research was completed (YYYY-MM-DD). */
  researched_at: string;

  /** Statutory window for first appearance / arraignment after arrest, in hours. */
  first_appearance_window_hours: number | null;
  /** When the public defender / appointed counsel attaches. Plain prose. */
  pd_attach_trigger: string | null;
  /** Indigency standard for PD eligibility. Plain prose, with citation in source_urls. */
  indigency_threshold: string | null;
  /** Bail/bond release types allowed by statute. */
  bail_types_allowed: BailType[];
  /** Default bail amounts by charge class, if a bail schedule is published; else null. */
  bail_default_amounts_by_charge: string | null;
  /** Statutory or case-law right to a phone call after booking. Plain prose. */
  phone_call_rule: string | null;
  /** Recording-police consent posture (state-wide). */
  recording_police_consent: RecordingPoliceConsent | null;
  /** Expungement / sealing waiting period. Plain prose. */
  expungement_window_years: string | null;
  /** 1–3 short bullets of state-specific quirks. Each must be sourced. */
  misc_quirks: string[];

  /** All citation URLs that back the populated fields above. */
  source_urls: string[];
  /** Field names whose values are null because no authoritative source was found. */
  _unknown_fields: string[];
}

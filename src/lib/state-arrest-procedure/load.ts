/**
 * State arrest-procedure loader.
 *
 * Reads JSON files from `data/state-arrest-procedure/<lowercase-code>.json`,
 * validates that every populated field has at least one URL in source_urls
 * (per ARCHITECTURE.md invariant 13 + ~/.claude/rules/no-hallucinated-legal-data.md),
 * and returns the parsed StateArrestProcedure for the requested state.
 */

import fs from "node:fs";
import path from "node:path";
import type {
  BailType,
  RecordingPoliceConsent,
  StateArrestProcedure,
} from "./types";

const DATA_DIR = path.join(
  process.cwd(),
  "data",
  "state-arrest-procedure",
);

const VALID_BAIL_TYPES: ReadonlySet<BailType> = new Set([
  "cash",
  "surety",
  "signature",
  "property",
  "personal_recognizance",
]);

const VALID_RECORDING: ReadonlySet<RecordingPoliceConsent> = new Set([
  "one-party",
  "all-party",
  "restricted",
]);

export class StateArrestProcedureValidationError extends Error {}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === "string");
}

/**
 * Validate a parsed JSON blob against the StateArrestProcedure shape.
 *
 * Cardinal rule: every field with a non-null/non-empty value must be backed
 * by at least one URL in source_urls. If a field is null, it must appear in
 * _unknown_fields. Throws on any violation.
 */
export function validateStateArrestProcedure(
  raw: unknown,
  filename: string,
): StateArrestProcedure {
  if (!isObject(raw)) {
    throw new StateArrestProcedureValidationError(
      `${filename}: top-level value must be an object`,
    );
  }

  const r = raw;

  const stateCode = r.state_code;
  if (typeof stateCode !== "string" || !/^[A-Z]{2}$/.test(stateCode)) {
    throw new StateArrestProcedureValidationError(
      `${filename}: state_code must be a 2-letter uppercase code`,
    );
  }

  const stateName = r.state_name;
  if (typeof stateName !== "string" || stateName.length === 0) {
    throw new StateArrestProcedureValidationError(
      `${filename}: state_name is required`,
    );
  }

  const researchedAt = r.researched_at;
  if (
    typeof researchedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(researchedAt)
  ) {
    throw new StateArrestProcedureValidationError(
      `${filename}: researched_at must be ISO YYYY-MM-DD`,
    );
  }

  if (!isStringArray(r.source_urls)) {
    throw new StateArrestProcedureValidationError(
      `${filename}: source_urls must be string[]`,
    );
  }
  for (const u of r.source_urls) {
    if (!/^https?:\/\//i.test(u)) {
      throw new StateArrestProcedureValidationError(
        `${filename}: source_urls entries must be http(s) URLs (got ${u})`,
      );
    }
  }

  if (!isStringArray(r._unknown_fields)) {
    throw new StateArrestProcedureValidationError(
      `${filename}: _unknown_fields must be string[]`,
    );
  }

  if (!Array.isArray(r.bail_types_allowed)) {
    throw new StateArrestProcedureValidationError(
      `${filename}: bail_types_allowed must be an array`,
    );
  }
  for (const t of r.bail_types_allowed) {
    if (typeof t !== "string" || !VALID_BAIL_TYPES.has(t as BailType)) {
      throw new StateArrestProcedureValidationError(
        `${filename}: invalid bail_types_allowed value: ${String(t)}`,
      );
    }
  }

  if (!isStringArray(r.misc_quirks)) {
    throw new StateArrestProcedureValidationError(
      `${filename}: misc_quirks must be string[]`,
    );
  }

  const rec = r.recording_police_consent;
  if (
    rec !== null &&
    (typeof rec !== "string" ||
      !VALID_RECORDING.has(rec as RecordingPoliceConsent))
  ) {
    throw new StateArrestProcedureValidationError(
      `${filename}: recording_police_consent must be one-party | all-party | restricted | null`,
    );
  }

  const fa = r.first_appearance_window_hours;
  if (fa !== null && (typeof fa !== "number" || !Number.isFinite(fa) || fa <= 0)) {
    throw new StateArrestProcedureValidationError(
      `${filename}: first_appearance_window_hours must be positive number or null`,
    );
  }

  for (const k of [
    "pd_attach_trigger",
    "indigency_threshold",
    "bail_default_amounts_by_charge",
    "phone_call_rule",
    "expungement_window_years",
  ] as const) {
    const v = r[k];
    if (v !== null && typeof v !== "string") {
      throw new StateArrestProcedureValidationError(
        `${filename}: ${k} must be string or null`,
      );
    }
  }

  const out: StateArrestProcedure = {
    state_code: stateCode,
    state_name: stateName,
    researched_at: researchedAt,
    first_appearance_window_hours: typeof fa === "number" ? fa : null,
    pd_attach_trigger: (r.pd_attach_trigger as string | null) ?? null,
    indigency_threshold: (r.indigency_threshold as string | null) ?? null,
    bail_types_allowed: r.bail_types_allowed as BailType[],
    bail_default_amounts_by_charge:
      (r.bail_default_amounts_by_charge as string | null) ?? null,
    phone_call_rule: (r.phone_call_rule as string | null) ?? null,
    recording_police_consent: (rec as RecordingPoliceConsent | null) ?? null,
    expungement_window_years:
      (r.expungement_window_years as string | null) ?? null,
    misc_quirks: r.misc_quirks,
    source_urls: r.source_urls,
    _unknown_fields: r._unknown_fields,
  };

  // Cross-field rule: any populated value MUST be backed by at least one URL.
  const hasAnyValue =
    out.first_appearance_window_hours !== null ||
    out.pd_attach_trigger !== null ||
    out.indigency_threshold !== null ||
    out.bail_types_allowed.length > 0 ||
    out.bail_default_amounts_by_charge !== null ||
    out.phone_call_rule !== null ||
    out.recording_police_consent !== null ||
    out.expungement_window_years !== null ||
    out.misc_quirks.length > 0;

  if (hasAnyValue && out.source_urls.length === 0) {
    throw new StateArrestProcedureValidationError(
      `${filename}: at least one value is populated but source_urls is empty (no-hallucinated-legal-data)`,
    );
  }

  // Cross-field rule: every field listed in _unknown_fields must actually be null/empty.
  for (const f of out._unknown_fields) {
    const v = (out as unknown as Record<string, unknown>)[f];
    const isUnknown = v === null || (Array.isArray(v) && v.length === 0);
    if (!isUnknown) {
      throw new StateArrestProcedureValidationError(
        `${filename}: _unknown_fields lists "${f}" but the field has a value`,
      );
    }
  }

  return out;
}

let cache: Map<string, StateArrestProcedure> | null = null;

function loadAll(): Map<string, StateArrestProcedure> {
  if (cache) return cache;
  const m = new Map<string, StateArrestProcedure>();
  if (!fs.existsSync(DATA_DIR)) {
    cache = m;
    return m;
  }
  for (const f of fs.readdirSync(DATA_DIR)) {
    if (!f.endsWith(".json")) continue;
    const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8"));
    const v = validateStateArrestProcedure(raw, f);
    m.set(v.state_code, v);
  }
  cache = m;
  return m;
}

/** Force a re-read on next call. Test-only. */
export function clearStateArrestProcedureCache(): void {
  cache = null;
}

/**
 * Look up a state's arrest-procedure data.
 *
 * Returns null when the state's JSON file is missing — callers should treat
 * this as "data unavailable" rather than crash.
 */
export function getStateArrestProcedure(
  stateCode: string,
): StateArrestProcedure | null {
  if (typeof stateCode !== "string" || stateCode.length === 0) return null;
  const upper = stateCode.toUpperCase();
  return loadAll().get(upper) ?? null;
}

/** All loaded states (for tests + diagnostics). */
export function listStateArrestProcedures(): StateArrestProcedure[] {
  return Array.from(loadAll().values()).sort((a, b) =>
    a.state_code.localeCompare(b.state_code),
  );
}

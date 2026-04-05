/**
 * @fileoverview Charge taxonomy query library.
 *
 * Provides typed query functions for the 4 charge taxonomy DB tables:
 *   - charge_categories
 *   - common_charges
 *   - jurisdiction_statutes
 *   - charge_questions
 * Plus expert queries scoped to a common_charge_slug.
 *
 * Uses raw fetch against Supabase REST API (PostgREST) — no Supabase JS client.
 * This mirrors the pattern used in supabase/functions/generate-report/index.ts,
 * which avoids @supabase/supabase-js to eliminate esm.sh cold start latency.
 *
 * USAGE (Next.js):
 *   import { getChargeCategories } from "@/lib/charge-taxonomy";
 *   const categories = await getChargeCategories(
 *     process.env.NEXT_PUBLIC_SUPABASE_URL!,
 *     process.env.SUPABASE_SERVICE_ROLE_KEY!
 *   );
 */

// ============================================================
// INTERFACES
// ============================================================

export interface ChargeCategory {
  slug: string;
  label: string;
  description: string | null;
  icon_name: string | null;
  sort_order: number;
  active: boolean;
}

export interface CommonCharge {
  slug: string;
  label: string;
  category_slug: string;
  ncic_code: string | null;
  description: string | null;
  severity_range: string | null;
  is_federal: boolean;
  is_state: boolean;
  legacy_slugs: string[] | null;
  sort_order: number;
  active: boolean;
}

export interface JurisdictionStatute {
  id: string;
  common_charge_slug: string;
  jurisdiction: string;
  statute_number: string | null;
  statute_title: string | null;
  offense_class: string | null;
  penalty_min: string | null;
  penalty_max: string | null;
  fine_max: string | null;
  elements: string[] | null;
  mandatory_minimum: string | null;
  enhancements: string[] | null;
  notes: string | null;
  active: boolean;
}

export interface ChargeQuestion {
  id: string;
  common_charge_slug: string;
  question_id: string;
  label: string;
  options: string[];
  sort_order: number;
}

export interface Expert {
  id: string;
  name: string;
  why_elite: string;
  key_framework: string;
  common_charge_slugs: string[] | null;
}

// ============================================================
// INTERNAL SUPABASE REST HELPER
// ============================================================

/**
 * Performs a SELECT query against a Supabase table via PostgREST.
 * Not exported — callers use the typed query functions below.
 *
 * @param url - Supabase project URL (e.g. NEXT_PUBLIC_SUPABASE_URL).
 * @param key - Service role key or anon key for authentication.
 * @param table - Table name to query.
 * @param query - PostgREST query string (e.g. "active=eq.true&order=sort_order.asc").
 * @returns Array of rows as unknown[].
 * @throws If the HTTP request fails or returns a non-OK status.
 */
async function supabaseSelect(
  url: string,
  key: string,
  table: string,
  query: string
): Promise<unknown[]> {
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`charge-taxonomy: SELECT ${table} failed (${res.status})`);
  }
  return res.json();
}

// ============================================================
// QUERY FUNCTIONS
// ============================================================

/**
 * Fetch all active charge categories sorted by sort_order ascending.
 */
export async function getChargeCategories(
  supabaseUrl: string,
  supabaseKey: string
): Promise<ChargeCategory[]> {
  const rows = await supabaseSelect(
    supabaseUrl,
    supabaseKey,
    "charge_categories",
    "active=eq.true&order=sort_order.asc"
  );
  return rows as ChargeCategory[];
}

/**
 * Fetch common charges for a category, optionally filtered by jurisdiction.
 *
 * When `jurisdiction` is provided, only charges that have a matching
 * jurisdiction_statute row are returned (charges with no statute data
 * for that state are excluded from the result).
 *
 * @param categorySlug - The charge_categories.slug to filter by.
 * @param jurisdiction - Two-letter state code (e.g. "FL") or null for all.
 * @param supabaseUrl - Supabase project URL.
 * @param supabaseKey - Service role key.
 */
export async function getCommonCharges(
  categorySlug: string,
  jurisdiction: string | null,
  supabaseUrl: string,
  supabaseKey: string
): Promise<CommonCharge[]> {
  const encodedCategory = encodeURIComponent(categorySlug);
  const chargeRows = await supabaseSelect(
    supabaseUrl,
    supabaseKey,
    "common_charges",
    `category_slug=eq.${encodedCategory}&active=eq.true&order=sort_order.asc`
  );
  const charges = chargeRows as CommonCharge[];

  if (jurisdiction === null || charges.length === 0) {
    return charges;
  }

  // Fetch all jurisdiction_statutes for this jurisdiction in one query,
  // then filter the charge list to only those with a matching statute.
  const encodedJurisdiction = encodeURIComponent(jurisdiction);
  const slugList = charges.map((c) => c.slug).join(",");
  const statuteRows = await supabaseSelect(
    supabaseUrl,
    supabaseKey,
    "jurisdiction_statutes",
    `common_charge_slug=in.(${slugList})&jurisdiction=eq.${encodedJurisdiction}&active=eq.true&select=common_charge_slug`
  );

  const statutedSlugs = new Set(
    (statuteRows as Array<{ common_charge_slug: string }>).map(
      (r) => r.common_charge_slug
    )
  );

  return charges.filter((c) => statutedSlugs.has(c.slug));
}

/**
 * Fetch the jurisdiction-specific statute for a common charge + state.
 *
 * @param commonChargeSlug - The common_charges.slug.
 * @param jurisdiction - Two-letter state code (e.g. "CA").
 * @param supabaseUrl - Supabase project URL.
 * @param supabaseKey - Service role key.
 * @returns The matching statute row or null if not found.
 */
export async function getJurisdictionStatute(
  commonChargeSlug: string,
  jurisdiction: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<JurisdictionStatute | null> {
  const encodedSlug = encodeURIComponent(commonChargeSlug);
  const encodedJurisdiction = encodeURIComponent(jurisdiction);
  const rows = await supabaseSelect(
    supabaseUrl,
    supabaseKey,
    "jurisdiction_statutes",
    `common_charge_slug=eq.${encodedSlug}&jurisdiction=eq.${encodedJurisdiction}&active=eq.true&limit=1`
  );
  if (rows.length === 0) return null;
  return rows[0] as JurisdictionStatute;
}

/**
 * Fetch charge-specific intake questions for a common charge, sorted by sort_order.
 *
 * @param commonChargeSlug - The common_charges.slug.
 * @param supabaseUrl - Supabase project URL.
 * @param supabaseKey - Service role key.
 */
export async function getChargeQuestions(
  commonChargeSlug: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<ChargeQuestion[]> {
  const encodedSlug = encodeURIComponent(commonChargeSlug);
  const rows = await supabaseSelect(
    supabaseUrl,
    supabaseKey,
    "charge_questions",
    `common_charge_slug=eq.${encodedSlug}&order=sort_order.asc`
  );
  return rows as ChargeQuestion[];
}

/**
 * Resolve a legacy charge slug to its current common_charge slug.
 *
 * Uses PostgREST's array contains operator (`cs.`) to query the
 * `legacy_slugs` column.
 *
 * @param legacySlug - The old charge slug to look up.
 * @param supabaseUrl - Supabase project URL.
 * @param supabaseKey - Service role key.
 * @returns The current common_charge slug, or null if not found.
 */
async function resolveLegacySlug(
  legacySlug: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<string | null> {
  // PostgREST array contains syntax: legacy_slugs=cs.{"dui-first"}
  const encoded = encodeURIComponent(`{"${legacySlug}"}`);
  const rows = await supabaseSelect(
    supabaseUrl,
    supabaseKey,
    "common_charges",
    `legacy_slugs=cs.${encoded}&limit=1&select=slug`
  );
  if (rows.length === 0) return null;
  return (rows[0] as { slug: string }).slug;
}

// ============================================================
// ENRICHED CHARGE CONTEXT BUILDER
// ============================================================

/**
 * Build the enriched charge context block injected into report prompts.
 *
 * Formats statute details, expert panel, and intake answers into a
 * structured plain-text block. Omits sections that have no data:
 *   - Statute lines omitted when `statute` is null.
 *   - EXPERT PANEL omitted when `experts` is empty.
 *   - INTAKE ANSWERS omitted when `chargeSpecificData` is empty or all blank.
 *
 * @param statute - Jurisdiction-specific statute row, or null if unknown.
 * @param commonCharge - The common charge record (always required).
 * @param experts - Array of expert records relevant to this charge.
 * @param chargeSpecificData - Key/value pairs from charge-specific intake fields.
 * @returns Formatted context string ready for prompt injection.
 */
function buildEnrichedChargeContext(
  statute: JurisdictionStatute | null,
  commonCharge: CommonCharge,
  experts: Expert[],
  chargeSpecificData: Record<string, string>
): string {
  const sections: string[] = [];

  // ---- CHARGE CONTEXT ----
  const chargeLines: string[] = [];

  if (statute !== null) {
    const jurisdictionLabel = statute.jurisdiction;
    const statuteRef =
      statute.statute_number !== null
        ? `${jurisdictionLabel} ${statute.statute_number}`
        : jurisdictionLabel;
    chargeLines.push(`- Charge: ${commonCharge.label} (${statuteRef})`);

    if (statute.offense_class !== null) {
      chargeLines.push(`- Classification: ${statute.offense_class}`);
    }

    if (statute.elements !== null && statute.elements.length > 0) {
      chargeLines.push(`- Elements: ${statute.elements.join("; ")}`);
    }

    const penaltyMin = statute.penalty_min ?? "unknown";
    const penaltyMax = statute.penalty_max ?? "unknown";
    const finePart =
      statute.fine_max !== null ? `, fine up to ${statute.fine_max}` : "";
    chargeLines.push(
      `- Penalty Range: ${penaltyMin} to ${penaltyMax}${finePart}`
    );

    chargeLines.push(
      `- Mandatory Minimum: ${statute.mandatory_minimum ?? "None"}`
    );

    if (statute.enhancements !== null && statute.enhancements.length > 0) {
      chargeLines.push(`- Enhancements: ${statute.enhancements.join("; ")}`);
    }
  } else {
    // Statute unknown — include charge name only
    chargeLines.push(`- Charge: ${commonCharge.label}`);
  }

  sections.push(`CHARGE CONTEXT:\n${chargeLines.join("\n")}`);

  // ---- EXPERT PANEL ----
  if (experts.length > 0) {
    const expertLines = experts.map(
      (e, i) =>
        `${i + 1}. ${e.name} — ${e.why_elite}. Methodology: ${e.key_framework}.`
    );
    sections.push(`EXPERT PANEL:\n${expertLines.join("\n")}`);
  }

  // ---- FOCUS AREAS ----
  // Derived from the charge description when available
  const focusSource = commonCharge.description;
  if (focusSource !== null && focusSource.trim().length > 0) {
    sections.push(`FOCUS AREAS: ${focusSource.trim()}`);
  }

  // ---- INTAKE ANSWERS ----
  const intakeEntries = Object.entries(chargeSpecificData).filter(
    ([, value]) => value.trim().length > 0
  );
  if (intakeEntries.length > 0) {
    const intakeLines = intakeEntries.map(
      ([key, value]) => `- ${key}: ${value}`
    );
    sections.push(`INTAKE ANSWERS:\n${intakeLines.join("\n")}`);
  }

  return sections.join("\n\n");
}

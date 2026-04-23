/**
 * Phase 2 entity whitelist + cite-tag validator.
 *
 * Shared between:
 *   - supabase/functions/generate-report/index.ts (Deno — hand-duplicated there)
 *   - src/lib/cron/batch-poller.ts (Node — imports from here)
 *   - src/lib/report/badge-transform.ts (Node — doesn't need whitelist, just renders)
 *
 * The whitelist is rebuilt deterministically from the same intake inputs
 * (charge types + jurisdiction) at any stage that needs to validate cite
 * tags. No per-case state is persisted; re-derivation is cheap (<1s).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface EntityWhitelist {
  text: string;
  validIds: Set<string>;
}

export interface WhitelistInputs {
  charges?: string[];
  jurisdiction?: string | null;
}

/**
 * Round-1 finding S5: input validation. Cap arrays and string lengths so a
 * bad caller (future route / form) cannot pass oversized payloads that
 * blow up the PostgREST URL length limit. Max 20 charge slugs (the product
 * has ~12 live), max 64 chars each (longest current slug is 31). Max 8
 * chars for jurisdiction (2-letter states, 'US' federal, NH-federal-DC).
 *
 * Bootstrap mode: inline validation rather than adding zod as a dep —
 * this is a 20-line guard, not a schema library's worth of work.
 */
const MAX_CHARGES = 20;
const MAX_CHARGE_LEN = 64;
const MAX_JURIS_LEN = 8;

function parseWhitelistInputs(inputs: WhitelistInputs): WhitelistInputs {
  if (inputs.charges !== undefined) {
    if (!Array.isArray(inputs.charges)) {
      throw new TypeError("WhitelistInputs.charges must be an array");
    }
    if (inputs.charges.length > MAX_CHARGES) {
      throw new RangeError(
        `WhitelistInputs.charges exceeds max length ${MAX_CHARGES} (got ${inputs.charges.length})`
      );
    }
    for (const c of inputs.charges) {
      if (typeof c !== "string") {
        throw new TypeError("WhitelistInputs.charges must be an array of strings");
      }
      if (c.length > MAX_CHARGE_LEN) {
        throw new RangeError(
          `WhitelistInputs.charges[] element exceeds max length ${MAX_CHARGE_LEN}`
        );
      }
    }
  }
  if (inputs.jurisdiction !== undefined && inputs.jurisdiction !== null) {
    if (typeof inputs.jurisdiction !== "string") {
      throw new TypeError("WhitelistInputs.jurisdiction must be string or null");
    }
    if (inputs.jurisdiction.length > MAX_JURIS_LEN) {
      throw new RangeError(
        `WhitelistInputs.jurisdiction exceeds max length ${MAX_JURIS_LEN}`
      );
    }
  }
  return inputs;
}

/**
 * Build the <AVAILABLE_ENTITIES> whitelist text block + Set of valid canonical IDs.
 * Failures on any individual sub-query are swallowed (empty list returned for
 * that entity type) so a single-table outage can't block generation.
 *
 * Round-2 finding S2: MIRROR — src/lib/report/entity-whitelist.ts (this file,
 * Node / @supabase/supabase-js) and supabase/functions/generate-report/index.ts
 * (Deno / raw PostgREST fetch) both implement buildEntityWhitelist with
 * identical semantics. Any change to ordering, filters, limits, or output
 * format MUST land in BOTH files. Parity is verified by
 * src/lib/report/__tests__/whitelist-parity.test.ts — given identical fixture
 * inputs (mocked DB), both functions produce byte-identical whitelist text.
 */
export async function buildEntityWhitelist(
  supabase: SupabaseClient,
  inputs: WhitelistInputs
): Promise<EntityWhitelist> {
  // S5: validate inputs before touching the DB or the wire.
  const parsed = parseWhitelistInputs(inputs);
  const validIds = new Set<string>();
  const lines: string[] = ["<AVAILABLE_ENTITIES>"];

  // Cases — ordered by citation_count DESC, date_filed DESC.
  //
  // 2026-04-22 (T101 — PR #56): charge-specific authority now wired.
  // `entities_cases.charge_types` is populated on 122,553 rows (1.57 % of
  // 7.78M); 604 of those have citation_count > 0. The overlaps('charge_types',
  // $charges) path now returns real charge-relevant authority via the GIN
  // index on the text[] column (measured ~500 ms for 2-charge lookup).
  // General top-cited fallback still runs to keep the whitelist non-empty
  // when charge_types hits nothing (new or rare charges).
  //
  // Two-path strategy:
  //   (a) charge-specific: overlaps(charge_types, parsed.charges) —
  //       up to 100 rows, ordered by citation_count DESC.
  //   (b) general top-cited: citation_count DESC — up to 100 rows,
  //       appended to fill the prompt window without duplicates.
  //
  // Ordering columns: citation_count is populated + indexed.
  // date_filed is 100 % populated. Safe ordering chain.
  //
  // Previously: soft NOTE "charge-specific authority index pending"
  // surfaced to the model because overlaps returned zero rows. Now
  // removed — the model gets real charge-specific cases first, so the
  // disclaimer is no longer accurate and would mislead.
  try {
    const CASE_COLS = "canonical_id, case_name, primary_citation, citation_count";
    const CHARGE_SPECIFIC_LIMIT = 100;
    const GENERAL_LIMIT = 100;

    const seenIds = new Set<string>();
    const orderedRows: Array<{
      canonical_id: string;
      case_name: string;
      primary_citation: string | null;
    }> = [];

    // (a) Charge-specific — only run when the caller supplied charges.
    if (parsed.charges && parsed.charges.length > 0) {
      const { data: chargeRows } = await supabase
        .from("entities_cases")
        .select(CASE_COLS)
        .overlaps("charge_types", parsed.charges)
        .gt("citation_count", 0)
        .order("citation_count", { ascending: false, nullsFirst: false })
        .order("date_filed", { ascending: false, nullsFirst: false })
        .limit(CHARGE_SPECIFIC_LIMIT);
      for (const r of chargeRows ?? []) {
        if (!r.canonical_id || !r.case_name) continue;
        if (seenIds.has(r.canonical_id)) continue;
        seenIds.add(r.canonical_id);
        orderedRows.push({
          canonical_id: r.canonical_id,
          case_name: r.case_name,
          primary_citation: r.primary_citation ?? null,
        });
      }
    }

    // (b) General top-cited — always runs as fallback/fill. Deduped against
    // (a) so a charge-specific case isn't listed twice under two headers.
    const { data: topCited } = await supabase
      .from("entities_cases")
      .select(CASE_COLS)
      .gt("citation_count", 0)
      .order("citation_count", { ascending: false, nullsFirst: false })
      .order("date_filed", { ascending: false, nullsFirst: false })
      .limit(GENERAL_LIMIT + seenIds.size);
    for (const r of topCited ?? []) {
      if (!r.canonical_id || !r.case_name) continue;
      if (seenIds.has(r.canonical_id)) continue;
      seenIds.add(r.canonical_id);
      orderedRows.push({
        canonical_id: r.canonical_id,
        case_name: r.case_name,
        primary_citation: r.primary_citation ?? null,
      });
      if (orderedRows.length >= CHARGE_SPECIFIC_LIMIT + GENERAL_LIMIT) break;
    }

    lines.push("## Cases (type=case)");
    for (const r of orderedRows) {
      validIds.add(r.canonical_id);
      lines.push(
        `  ${r.canonical_id} — ${r.case_name}${r.primary_citation ? ` (${r.primary_citation})` : ""}`
      );
    }
  } catch (err) {
    // E2: never swallow errors silently — surface to prod logs so a
    // PostgREST / schema regression doesn't silently produce empty
    // whitelists again.
    console.warn("[entity-whitelist] cases section failed:", err);
    lines.push("## Cases (type=case)");
  }

  // Statutes — jurisdiction-scoped, is_current = true. Fall back to US
  // federal statutes if no state-specific row exists (DB audit 2026-04-22
  // showed entities_statutes currently holds only jurisdiction='US' seeds,
  // so any state-specific intake returned zero statutes before this
  // fallback). This keeps the statute whitelist non-empty for every
  // jurisdiction while preserving state-first preference.
  try {
    const statuteMap = new Map<
      string,
      { canonical_id: string; jurisdiction: string | null; title: string | null; section: string | null }
    >();
    if (parsed.jurisdiction) {
      const { data: stateRows } = await supabase
        .from("entities_statutes")
        .select("canonical_id, jurisdiction, title, section")
        .eq("jurisdiction", parsed.jurisdiction)
        .eq("is_current", true)
        .limit(150);
      for (const s of stateRows ?? []) {
        if (s.canonical_id) statuteMap.set(s.canonical_id, s);
      }
    }
    if (statuteMap.size < 50) {
      const { data: federalRows } = await supabase
        .from("entities_statutes")
        .select("canonical_id, jurisdiction, title, section")
        .eq("jurisdiction", "US")
        .eq("is_current", true)
        .limit(150);
      for (const s of federalRows ?? []) {
        if (!s.canonical_id) continue;
        if (!statuteMap.has(s.canonical_id)) statuteMap.set(s.canonical_id, s);
        if (statuteMap.size >= 150) break;
      }
    }
    lines.push("## Statutes (type=statute)");
    for (const s of statuteMap.values()) {
      validIds.add(s.canonical_id);
      lines.push(
        `  ${s.canonical_id} — ${s.jurisdiction ?? ""} ${s.title ?? ""} § ${s.section ?? ""}`
      );
    }
  } catch (err) {
    console.warn("[entity-whitelist] statutes section failed:", err);
    lines.push("## Statutes (type=statute)");
  }

  // Doctrines — derive names from entity_sources.source_ref (walkerdb).
  // F4: deterministic order (entity_id) so same inputs render byte-identical
  // whitelists across runs — easier diff + cache.
  try {
    const { data: doctRows } = await supabase
      .from("entity_sources")
      .select("entity_id, source_ref")
      .eq("entity_type", "doctrine")
      .eq("source_system", "walkerdb")
      .order("entity_id")
      .limit(500);
    const doctrineMap = new Map<string, string>();
    for (const r of doctRows ?? []) {
      const name = (r.source_ref ?? "").replace(/^doctrine:/, "");
      if (name && r.entity_id) doctrineMap.set(r.entity_id, name);
    }
    lines.push("## Doctrines (type=doctrine)");
    for (const [id, name] of doctrineMap) {
      validIds.add(id);
      lines.push(`  ${id} — ${name}`);
    }
  } catch (err) {
    console.warn("[entity-whitelist] doctrines section failed:", err);
    lines.push("## Doctrines (type=doctrine)");
  }

  // Agencies — full list. F4: ordered by name for deterministic output.
  try {
    const { data: agencies } = await supabase
      .from("entities_agencies")
      .select("canonical_id, name, acronym")
      .order("name")
      .limit(500);
    lines.push("## Agencies (type=agency)");
    for (const a of agencies ?? []) {
      if (!a.canonical_id) continue;
      validIds.add(a.canonical_id);
      lines.push(
        `  ${a.canonical_id} — ${a.name}${a.acronym ? ` (${a.acronym})` : ""}`
      );
    }
  } catch (err) {
    console.warn("[entity-whitelist] agencies section failed:", err);
    lines.push("## Agencies (type=agency)");
  }

  lines.push("</AVAILABLE_ENTITIES>");
  return { text: lines.join("\n"), validIds };
}

/**
 * Attribute-value escape for canonical <cite> re-emission.
 * Escapes `&` `"` `<` `>` so the attr content cannot break out of its
 * surrounding double-quoted attribute.
 */
function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Post-generation validator. Strips <cite> tags whose data-entity-id is NOT
 * in the whitelist; for valid tags, re-emits a canonical form that carries
 * ONLY the two known-safe data-* attributes. Idempotent.
 *
 * Round-1 finding S2: the previous impl echoed the raw `attrs` string back
 * into the output, so a generator (current or future) that slipped in an
 * unexpected attribute (e.g. `onclick`, `style`, arbitrary `data-*`) would
 * have that attribute passed through verbatim. Sanitize-html runs earlier,
 * but this validator is supposed to be a defense-in-depth layer — so we
 * parse out ONLY `data-entity-id` and `data-entity-type` and emit a
 * canonical tag. Anything else on the original tag is dropped.
 */
export function stripInvalidCiteTags(html: string, validIds: Set<string>): string {
  return html.replace(
    /<cite\s+([^>]*?)>([\s\S]*?)<\/cite>/gi,
    (_match, attrs: string, inner: string) => {
      const idMatch = attrs.match(/data-entity-id=["']([^"']+)["']/);
      const typeMatch = attrs.match(/data-entity-type=["']([^"']+)["']/);
      if (!idMatch || !validIds.has(idMatch[1])) return inner;
      const id = idMatch[1];
      const type = typeMatch?.[1] ?? "";
      return `<cite data-entity-id="${escapeAttr(id)}" data-entity-type="${escapeAttr(type)}">${inner}</cite>`;
    }
  );
}

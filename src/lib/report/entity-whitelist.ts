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
  // History: the original query filtered `authority_score IS NOT NULL` and
  // `charge_types && $charges`. DB audit 2026-04-22 (plan 2026-04-22-worry-
  // phase2-residual-concerns.md, T1) showed `authority_score` is 0%
  // populated across all 7.78M rows and `charge_types` is empty ({}) on all
  // but ~677 rows. Result: the old query returned 0 cases for every report
  // — the entire Phase 2 badge feature silently produced empty whitelists.
  //
  // Round-1 finding F1: the charge-specific "boost" branch using
  // `overlaps('charge_types', ...)` is effectively dead because
  // `charge_types` is empty on 99.99 % of rows. Removed until a real
  // charge->authority index lands (tracked: `charge_type_top_authorities`
  // join, post-round-2 backlog). General top-cited fallback remains as
  // the primary source.
  //
  // Round-1 finding L4: every charge currently returns the same ~200
  // federal top-cited cases because the charge-specific index does not
  // exist. Surface this to the model via a prominent NOTE in the prompt
  // so it does not bluff generic federal classics as charge-specific
  // authority.
  //
  // Ordering columns: citation_count is populated + has an index (323 ms
  // for the 200-row limit query on 7.78M rows). date_filed is 100 %
  // populated. Safe ordering chain.
  try {
    const CASE_COLS = "canonical_id, case_name, primary_citation, citation_count";

    const { data: topCited } = await supabase
      .from("entities_cases")
      .select(CASE_COLS)
      .gt("citation_count", 0)
      .order("citation_count", { ascending: false, nullsFirst: false })
      .order("date_filed", { ascending: false, nullsFirst: false })
      .limit(200);

    lines.push("## Cases (type=case)");
    // L4: prominent charge-specific authority gap disclosure.
    if (parsed.charges && parsed.charges.length > 0) {
      lines.push(
        `  # NOTE: Charge-specific authority index pending for [${parsed.charges.join(
          ", "
        )}]. The cases below are top-cited federal authorities (charge-agnostic); cite only cases clearly relevant to the facts of the intake. Do not present generic federal classics as charge-specific precedent.`
      );
    }
    for (const r of topCited ?? []) {
      if (!r.canonical_id) continue;
      // E5: skip rows without a case_name — "(unknown case name)" leaking
      // into customer-facing prompts is unprofessional and unhelpful.
      if (!r.case_name) continue;
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

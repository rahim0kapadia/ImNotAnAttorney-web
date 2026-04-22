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
 * Build the <AVAILABLE_ENTITIES> whitelist text block + Set of valid canonical IDs.
 * Failures on any individual sub-query are swallowed (empty list returned for
 * that entity type) so a single-table outage can't block generation.
 */
export async function buildEntityWhitelist(
  supabase: SupabaseClient,
  inputs: WhitelistInputs
): Promise<EntityWhitelist> {
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
  // New strategy (belt-and-suspenders — whitelist never empty):
  //   A. Charge-specific boost: if `inputs.charges` is provided AND the slug
  //      actually exists in the partially-populated `charge_types` column,
  //      pull up to 100 overlap matches ordered by citation_count DESC.
  //   B. General top-cited fallback: pull the top 200 by citation_count
  //      DESC (then date_filed DESC as tiebreaker). Always run.
  //   C. Merge A+B, dedupe by canonical_id, cap at 250.
  //
  // Ordering columns: citation_count is populated + has an index (323 ms
  // for the 200-row limit query on 7.78M rows). date_filed is 100 %
  // populated. Safe ordering chain.
  try {
    const CASE_COLS = "canonical_id, case_name, primary_citation, citation_count";
    const boostRows: Array<{
      canonical_id: string;
      case_name: string | null;
      primary_citation: string | null;
      citation_count: number | null;
    }> = [];
    if (inputs.charges && inputs.charges.length > 0) {
      const { data } = await supabase
        .from("entities_cases")
        .select(CASE_COLS)
        .overlaps("charge_types", inputs.charges)
        .order("citation_count", { ascending: false, nullsFirst: false })
        .order("date_filed", { ascending: false, nullsFirst: false })
        .limit(100);
      for (const r of data ?? []) boostRows.push(r);
    }

    const { data: topCited } = await supabase
      .from("entities_cases")
      .select(CASE_COLS)
      .gt("citation_count", 0)
      .order("citation_count", { ascending: false, nullsFirst: false })
      .order("date_filed", { ascending: false, nullsFirst: false })
      .limit(200);

    const merged = new Map<string, (typeof boostRows)[number]>();
    for (const r of boostRows) if (r.canonical_id) merged.set(r.canonical_id, r);
    for (const r of topCited ?? []) {
      if (!r.canonical_id) continue;
      if (!merged.has(r.canonical_id)) merged.set(r.canonical_id, r);
      if (merged.size >= 250) break;
    }

    lines.push("## Cases (type=case)");
    for (const c of merged.values()) {
      validIds.add(c.canonical_id);
      lines.push(
        `  ${c.canonical_id} — ${c.case_name ?? "(unknown case name)"}${c.primary_citation ? ` (${c.primary_citation})` : ""}`
      );
    }
  } catch {
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
    if (inputs.jurisdiction) {
      const { data: stateRows } = await supabase
        .from("entities_statutes")
        .select("canonical_id, jurisdiction, title, section")
        .eq("jurisdiction", inputs.jurisdiction)
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
  } catch {
    lines.push("## Statutes (type=statute)");
  }

  // Doctrines — derive names from entity_sources.source_ref (walkerdb)
  try {
    const { data: doctRows } = await supabase
      .from("entity_sources")
      .select("entity_id, source_ref")
      .eq("entity_type", "doctrine")
      .eq("source_system", "walkerdb")
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
  } catch {
    lines.push("## Doctrines (type=doctrine)");
  }

  // Agencies — full list
  try {
    const { data: agencies } = await supabase
      .from("entities_agencies")
      .select("canonical_id, name, acronym")
      .limit(500);
    lines.push("## Agencies (type=agency)");
    for (const a of agencies ?? []) {
      if (!a.canonical_id) continue;
      validIds.add(a.canonical_id);
      lines.push(
        `  ${a.canonical_id} — ${a.name}${a.acronym ? ` (${a.acronym})` : ""}`
      );
    }
  } catch {
    lines.push("## Agencies (type=agency)");
  }

  lines.push("</AVAILABLE_ENTITIES>");
  return { text: lines.join("\n"), validIds };
}

/**
 * Post-generation validator. Strips <cite> tags whose data-entity-id is NOT
 * in the whitelist; keeps valid tags verbatim. Idempotent.
 */
export function stripInvalidCiteTags(html: string, validIds: Set<string>): string {
  return html.replace(
    /<cite\s+([^>]*?)>([\s\S]*?)<\/cite>/gi,
    (_match, attrs: string, inner: string) => {
      const idMatch = attrs.match(/data-entity-id=["']([^"']+)["']/);
      if (!idMatch || !validIds.has(idMatch[1])) return inner;
      return `<cite ${attrs}>${inner}</cite>`;
    }
  );
}

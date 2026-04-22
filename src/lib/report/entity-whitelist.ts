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

  // Cases — top 200 by authority_score, filtered by charge_types overlap if provided.
  // The partial index idx_entities_cases_authority covers WHERE authority_score IS NOT NULL;
  // we force that filter so the planner uses the index instead of a full 7.8M-row scan.
  try {
    let caseQ = supabase
      .from("entities_cases")
      .select("canonical_id, case_name, primary_citation")
      .not("authority_score", "is", null)
      .order("authority_score", { ascending: false, nullsFirst: false })
      .limit(200);
    if (inputs.charges && inputs.charges.length > 0) {
      caseQ = caseQ.overlaps("charge_types", inputs.charges);
    }
    const { data: cases } = await caseQ;
    lines.push("## Cases (type=case)");
    for (const c of cases ?? []) {
      if (!c.canonical_id) continue;
      validIds.add(c.canonical_id);
      lines.push(
        `  ${c.canonical_id} — ${c.case_name}${c.primary_citation ? ` (${c.primary_citation})` : ""}`
      );
    }
  } catch {
    lines.push("## Cases (type=case)");
  }

  // Statutes — jurisdiction-scoped, is_current = true
  try {
    if (inputs.jurisdiction) {
      const { data: statutes } = await supabase
        .from("entities_statutes")
        .select("canonical_id, jurisdiction, title, section")
        .eq("jurisdiction", inputs.jurisdiction)
        .eq("is_current", true)
        .limit(150);
      lines.push("## Statutes (type=statute)");
      for (const s of statutes ?? []) {
        if (!s.canonical_id) continue;
        validIds.add(s.canonical_id);
        lines.push(
          `  ${s.canonical_id} — ${s.jurisdiction} ${s.title ?? ""} § ${s.section ?? ""}`
        );
      }
    } else {
      lines.push("## Statutes (type=statute)");
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

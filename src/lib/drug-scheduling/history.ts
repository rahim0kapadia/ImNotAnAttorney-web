/**
 * Federal Register drug-scheduling history helper for TICKET-16.
 *
 * Joins the static substance taxonomy (substances.ts) with live
 * federal_register_actions rows to produce a date-windowed history of
 * scheduling-related actions for a defendant's substance.
 *
 * Surface area:
 *   - getDrugSchedulingHistory(substance_slug) → SchedulingHistory
 *   - getDrugSchedulingHistoryWithClient(client, slug) — testable variant
 *
 * UPL guardrail:
 *   - Helper returns FACTS only: dates, action titles, citations, source URLs
 *   - Render layer (render.ts) frames the facts as questions for the
 *     defendant's attorney
 *   - Helper NEVER classifies a window as "favorable" or "unfavorable" — the
 *     attorney makes that call against the alleged conduct date
 *
 * Data shape:
 *   federal_register_actions has 1,771 rows (probe 2026-05-03), of which
 *   437 reference "controlled substance" or DEA in title/abstract. Each
 *   substance taxonomy entry has searchAliases[] used as ILIKE patterns.
 *
 * Source URL invariant:
 *   Every history entry MUST have a source_url. We compose it from
 *   html_url (preferred) → pdf_url → federalregister.gov canonical URL
 *   from document_number. If none available, the row is suppressed
 *   (no-hallucinated-legal-data.md HARD rule).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getSubstanceBySlug,
  type SubstanceEntry,
  type ScheduleStatus,
} from "./substances";

export interface SchedulingHistoryEntry {
  /** Publication date of the Federal Register action (ISO YYYY-MM-DD). */
  publicationDate: string;
  /** Effective date if specified, else null. */
  effectiveDate: string | null;
  /** Federal Register document number (e.g. "2026-08595"). */
  documentNumber: string;
  /** Federal Register title for the action. */
  title: string;
  /** First sentence(s) of abstract for context. Truncated to 400 chars. */
  abstractSnippet: string;
  /** Action type if classified by Federal Register (e.g. "Final rule"). */
  action: string | null;
  /** CFR references parsed from the action (jsonb). */
  cfrReferences: unknown;
  /** Verification URL — html_url preferred, pdf_url fallback, then canonical. */
  sourceUrl: string;
  /** Agencies involved (from agencies[] column). */
  agencies: string[];
}

export interface SchedulingHistory {
  /** Substance taxonomy entry (null if substance unknown to taxonomy). */
  substance: SubstanceEntry | null;
  /** Slug requested by caller. */
  requestedSlug: string;
  /** Current schedule from taxonomy, or null when substance unknown. */
  currentSchedule: ScheduleStatus | null;
  /** As-of date for currentSchedule. */
  currentScheduleAsOf: string | null;
  /** Canonical regulation URL (eCFR / DEA / FDA). */
  regulationUrl: string | null;
  /** Canonical regulation citation (CFR §, etc.). */
  regulationCitation: string | null;
  /** Mercer-voice neutral summary from taxonomy. */
  summary: string | null;
  /** Time-ordered Federal Register actions matching the substance. */
  history: SchedulingHistoryEntry[];
  /** True when no taxonomy entry AND no Federal Register hits. */
  isEmpty: boolean;
  /** Limitations / data gaps surfaced for transparency. */
  limitations: string[];
}

const FED_REG_BASE = "https://www.federalregister.gov/documents/";

function buildCanonicalUrl(documentNumber: string): string {
  // Federal Register canonical URL pattern requires year/month/day, but
  // /documents/<doc-num> redirects to canonical. Safe fallback.
  return `${FED_REG_BASE}${documentNumber}/`;
}

function pickSourceUrl(
  html_url: string | null,
  pdf_url: string | null,
  document_number: string,
): string | null {
  if (typeof html_url === "string" && html_url.startsWith("https://")) {
    return html_url;
  }
  if (typeof pdf_url === "string" && pdf_url.startsWith("https://")) {
    return pdf_url;
  }
  if (document_number) {
    return buildCanonicalUrl(document_number);
  }
  return null;
}

function truncate(s: string | null, n: number): string {
  if (!s) return "";
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

/**
 * Build a Postgres ILIKE OR-clause from substance aliases.
 * Aliases are split into title and abstract scans.
 *
 * Returns a Supabase .or() string-encoded predicate.
 *
 * Note: the .or() syntax requires escaping commas inside values; we
 * therefore reject aliases containing commas at the source (taxonomy is
 * curated, so this is a defensive check).
 */
function buildOrClause(aliases: string[]): string {
  const safe = aliases.filter((a) => !a.includes(",") && a.trim().length >= 2);
  if (safe.length === 0) return "";
  const parts: string[] = [];
  for (const a of safe) {
    const pat = `%${a}%`;
    parts.push(`title.ilike.${pat}`);
    parts.push(`abstract.ilike.${pat}`);
  }
  return parts.join(",");
}

/**
 * Type-narrowing helper for the Supabase admin client (avoids depending on
 * the Database type generated elsewhere).
 */
type SupabaseClientLike = {
  from: (table: string) => {
    select: (cols: string) => {
      or: (clause: string) => {
        order: (
          col: string,
          opts: { ascending: boolean; nullsFirst?: boolean },
        ) => {
          limit: (n: number) => Promise<{
            data: unknown[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
};

/**
 * Internal: query Federal Register actions for a substance.
 * Caller-supplied client allows test-time injection.
 */
export async function getDrugSchedulingHistoryWithClient(
  client: SupabaseClientLike,
  slug: string,
): Promise<SchedulingHistory> {
  const substance = getSubstanceBySlug(slug);
  const limitations: string[] = [];

  if (!substance) {
    return {
      substance: null,
      requestedSlug: slug,
      currentSchedule: null,
      currentScheduleAsOf: null,
      regulationUrl: null,
      regulationCitation: null,
      summary: null,
      history: [],
      isEmpty: true,
      limitations: [
        "This substance is not in our scheduling taxonomy. We do not surface scheduling-history windows for substances we have not curated. Your attorney can pull the Federal Register history independently.",
      ],
    };
  }

  const orClause = buildOrClause(substance.searchAliases);
  if (!orClause) {
    return {
      substance,
      requestedSlug: slug,
      currentSchedule: substance.currentSchedule,
      currentScheduleAsOf: substance.currentScheduleAsOf,
      regulationUrl: substance.regulationUrl,
      regulationCitation: substance.regulationCitation,
      summary: substance.summary,
      history: [],
      isEmpty: true,
      limitations: [
        "Search aliases for this substance produced no valid query patterns. The current-schedule fields reflect the curated taxonomy; no Federal Register history is included.",
      ],
    };
  }

  let rows: unknown[] = [];
  try {
    const res = await client
      .from("federal_register_actions")
      .select(
        "document_number, title, abstract, agencies, publication_date, effective_date, action, cfr_references, html_url, pdf_url",
      )
      .or(orClause)
      .order("publication_date", { ascending: false, nullsFirst: false })
      .limit(50);
    if (res.error) {
      limitations.push(
        `Federal Register query returned an error and was skipped: ${res.error.message}`,
      );
    } else if (Array.isArray(res.data)) {
      rows = res.data;
    }
  } catch (e) {
    limitations.push(
      `Federal Register query threw and was skipped: ${(e as Error).message}`,
    );
  }

  const history: SchedulingHistoryEntry[] = [];
  for (const r of rows) {
    const row = r as Record<string, unknown>;
    const documentNumber = (row.document_number as string | null) ?? "";
    const html_url = (row.html_url as string | null) ?? null;
    const pdf_url = (row.pdf_url as string | null) ?? null;
    const sourceUrl = pickSourceUrl(html_url, pdf_url, documentNumber);
    if (!sourceUrl) continue; // HARD rule: no source URL → suppress
    const publicationDate = (row.publication_date as string | null) ?? "";
    if (!publicationDate) continue;
    const title = (row.title as string | null) ?? "";
    if (!title) continue;
    history.push({
      publicationDate: String(publicationDate).slice(0, 10),
      effectiveDate: row.effective_date
        ? String(row.effective_date).slice(0, 10)
        : null,
      documentNumber,
      title,
      abstractSnippet: truncate(row.abstract as string | null, 400),
      action: (row.action as string | null) ?? null,
      cfrReferences: row.cfr_references ?? null,
      sourceUrl,
      agencies: Array.isArray(row.agencies)
        ? (row.agencies as string[])
        : [],
    });
  }

  if (history.length === 0) {
    limitations.push(
      "No Federal Register actions in our index match this substance's aliases. The current-schedule fields reflect the curated regulation citation; no recent rulemaking is surfaced.",
    );
  } else if (history.length === 50) {
    limitations.push(
      "Result limit (50) reached; older Federal Register actions for this substance may exist beyond the window shown.",
    );
  }

  return {
    substance,
    requestedSlug: slug,
    currentSchedule: substance.currentSchedule,
    currentScheduleAsOf: substance.currentScheduleAsOf,
    regulationUrl: substance.regulationUrl,
    regulationCitation: substance.regulationCitation,
    summary: substance.summary,
    history,
    isEmpty: history.length === 0,
    limitations,
  };
}

/**
 * Public entry point. Uses createAdminClient() to fetch Federal Register
 * actions matching the substance's aliases. Returns a SchedulingHistory
 * struct safe to render via render.ts.
 *
 * Returns isEmpty=true (with limitations[] populated) for unknown substances
 * — never throws on a slug miss. Caller should suppress the report block
 * when isEmpty.
 */
export async function getDrugSchedulingHistory(
  slug: string,
): Promise<SchedulingHistory> {
  const client = createAdminClient() as unknown as SupabaseClientLike;
  return getDrugSchedulingHistoryWithClient(client, slug);
}

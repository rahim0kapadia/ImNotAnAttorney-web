/**
 * Phase 2 render-time cite-tag transformer.
 *
 * Runs on the /report/[token] server component AFTER sanitize-html, on
 * every report view. Queries v_entity_confidence + doctrine_quotes and
 * swaps each <cite> element for a tier-colored badge. Doctrine cites
 * also get a pull-quote block on first mention per report.
 *
 * Zero-regen auto-update: tier promotions (standard -> verified -> gold ->
 * platinum) land on existing reports the next time they're viewed. No
 * report regeneration required.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { parse } from "node-html-parser";

type ConfidenceLevel =
  | "standard"
  | "medium"
  | "high"
  | "verified"
  | "gold"
  | "platinum";

interface EntityConf {
  entity_type: string;
  entity_id: string;
  confidence_level: ConfidenceLevel;
  source_count: number;
  source_systems: string[];
}

const TIER_CLASSES: Record<ConfidenceLevel, string> = {
  standard: "bg-zinc-800 text-zinc-400 border-zinc-700",
  medium: "bg-zinc-800 text-zinc-300 border-zinc-600",
  high: "bg-amber-950/40 text-amber-300 border-amber-800",
  verified: "bg-amber-900/40 text-amber-200 border-amber-600",
  gold: "bg-yellow-900/50 text-yellow-200 border-yellow-500",
  platinum:
    "bg-gradient-to-r from-amber-800/40 to-yellow-700/40 text-yellow-100 border-yellow-400",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function renderBadge(
  text: string,
  type: string | undefined,
  id: string | undefined,
  c: EntityConf
): string {
  const tier = c.confidence_level;
  const tooltip = `${c.source_count} source${
    c.source_count === 1 ? "" : "s"
  }: ${c.source_systems.join(", ")}`;
  return (
    `<span class="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ${TIER_CLASSES[tier]}" ` +
    `title="${escapeAttr(tooltip)}" ` +
    `data-entity-type="${escapeAttr(type ?? "")}" ` +
    `data-entity-id="${escapeAttr(id ?? "")}" ` +
    `data-confidence="${tier}">` +
    `${text}` +
    `<span class="ml-0.5 text-[9px] uppercase tracking-wider opacity-75">${tier}</span>` +
    `</span>`
  );
}

function renderPullQuotes(
  quotes: Array<{ speaker: string; quote_text: string }>
): string {
  const items = quotes
    .map((q) => {
      const body = q.quote_text.slice(0, 400);
      const ellipsis = q.quote_text.length > 400 ? "&hellip;" : "";
      return (
        `<blockquote class="mt-3 border-l-2 border-amber-600/50 pl-3 text-sm italic text-zinc-300">` +
        `<p>&ldquo;${escapeHtml(body)}${ellipsis}&rdquo;</p>` +
        `<footer class="mt-1 text-xs not-italic text-zinc-500">&mdash; ${escapeHtml(
          q.speaker
        )}, SCOTUS oral argument (walkerdb)</footer>` +
        `</blockquote>`
      );
    })
    .join("");
  return `<aside class="mt-2 rounded bg-zinc-950/30 p-3" aria-label="Doctrine pull-quotes">${items}</aside>`;
}

/**
 * Scan sanitized report HTML for <cite data-entity-type data-entity-id>
 * markers, replace each with a confidence-tier badge. Doctrine cites also
 * inject a pull-quote <aside> on the first occurrence of each doctrine in
 * the report.
 *
 * Idempotent: if no <cite> tags are present (e.g., v1 reports), returns
 * the input unchanged without touching the DB.
 */
export async function transformCiteTags(html: string): Promise<string> {
  const root = parse(html, { lowerCaseTagName: false });
  const citeNodes = root.querySelectorAll("cite");
  if (citeNodes.length === 0) return html;

  const ids = new Set<string>();
  const doctrineIds = new Set<string>();
  for (const node of citeNodes) {
    const id = node.getAttribute("data-entity-id");
    const type = node.getAttribute("data-entity-type");
    if (id) ids.add(id);
    if (id && type === "doctrine") doctrineIds.add(id);
  }
  if (ids.size === 0) return html;

  const supabase = createAdminClient();
  const [confRes, quotesRes] = await Promise.all([
    supabase
      .from("v_entity_confidence")
      .select(
        "entity_type,entity_id,confidence_level,source_count,source_systems"
      )
      .in("entity_id", [...ids]),
    doctrineIds.size > 0
      ? supabase
          .from("doctrine_quotes")
          .select("doctrine_id,speaker,quote_text,ts_rank")
          .in("doctrine_id", [...doctrineIds])
          .order("ts_rank", { ascending: false })
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);

  const confMap = new Map<string, EntityConf>();
  for (const c of (confRes.data ?? []) as EntityConf[]) {
    confMap.set(c.entity_id, c);
  }

  const quotesByDoctrine = new Map<
    string,
    Array<{ speaker: string; quote_text: string }>
  >();
  for (const q of (quotesRes.data ?? []) as Array<{
    doctrine_id: string;
    speaker: string;
    quote_text: string;
  }>) {
    const arr = quotesByDoctrine.get(q.doctrine_id) ?? [];
    if (arr.length < 3) arr.push({ speaker: q.speaker, quote_text: q.quote_text });
    quotesByDoctrine.set(q.doctrine_id, arr);
  }

  const renderedDoctrines = new Set<string>();
  for (const node of citeNodes) {
    const id = node.getAttribute("data-entity-id");
    const type = node.getAttribute("data-entity-type");
    const text = node.innerHTML;
    const c = id ? confMap.get(id) : undefined;
    if (!c) {
      node.replaceWith(text);
      continue;
    }

    const badge = renderBadge(text, type, id, c);
    const quotes =
      type === "doctrine" && id && !renderedDoctrines.has(id)
        ? quotesByDoctrine.get(id) ?? []
        : [];
    if (quotes.length > 0 && id) {
      renderedDoctrines.add(id);
      node.replaceWith(badge + renderPullQuotes(quotes));
    } else {
      node.replaceWith(badge);
    }
  }

  return root.toString();
}

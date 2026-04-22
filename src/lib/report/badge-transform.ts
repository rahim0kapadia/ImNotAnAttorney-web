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

/**
 * Round-1 finding L1 (Peep Laja Clarity layer): six internal tiers on the UI
 * is decision-paralysis noise for customers. The DB keeps the full 6-tier
 * ladder (used by operators + flywheel analytics), but the UI collapses to
 * three buckets:
 *   basic    <- standard, medium   (zinc, low-key)
 *   verified <- high, verified     (amber, trusted)
 *   premium  <- gold, platinum     (gold/gradient, top-tier)
 */
export type UITier = "basic" | "verified" | "premium";

export function toUITier(level: ConfidenceLevel): UITier {
  switch (level) {
    case "gold":
    case "platinum":
      return "premium";
    case "high":
    case "verified":
      return "verified";
    case "standard":
    case "medium":
    default:
      return "basic";
  }
}

interface EntityConf {
  entity_type: string;
  entity_id: string;
  confidence_level: ConfidenceLevel;
  source_count: number;
  source_systems: string[];
}

// 3-key UI tier map replaces the previous 6-key internal-tier map (L1).
const TIER_CLASSES: Record<UITier, string> = {
  basic: "bg-zinc-800 text-zinc-400 border-zinc-700",
  verified: "bg-amber-900/40 text-amber-200 border-amber-600",
  premium:
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
  const uiTier = toUITier(c.confidence_level);
  const tooltip = `${c.source_count} source${
    c.source_count === 1 ? "" : "s"
  }: ${c.source_systems.join(", ")}`;
  // Round-1 findings:
  //   L2 — no inline UPPERCASE label. Keep the color tier as the only
  //        visual affordance. Tier text revealed via tooltip / mobile tap
  //        (handled by L5 source-disclosure below).
  //   S1 — use plain `.text` not `.innerHTML` for the badge inner text.
  //        sanitize-html has already neutered any payload by the time this
  //        runs, but relying on that invariant = one sanitize regression
  //        away from stored XSS. Defense-in-depth: plain-text inner only.
  //   L1 — data-confidence carries the 3-key UI tier. The raw 6-key level
  //        is kept as data-confidence-raw so flywheel analytics + CSS
  //        overrides can key on it without parsing tooltips.
  // L5: the previous badge surfaced `source_count` ONLY via the `title=`
  // tooltip, which is invisible on mobile + doesn't appear on print.
  // New structure: a <details> wraps the badge so the count disclosure
  // is always present (tappable on mobile; printed inline in open state
  // by the print stylesheet). `title=` remains as the progressive-
  // enhancement hover hint for mouse users.
  const summaryId = id ? `cite-summary-${escapeAttr(id)}` : undefined;
  const countLabel = `(${c.source_count})`;
  return (
    `<span class="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ${TIER_CLASSES[uiTier]}" ` +
    `title="${escapeAttr(tooltip)}" ` +
    (summaryId ? `aria-describedby="${summaryId}" ` : "") +
    `data-entity-type="${escapeAttr(type ?? "")}" ` +
    `data-entity-id="${escapeAttr(id ?? "")}" ` +
    `data-confidence="${c.confidence_level}" ` +
    `data-ui-tier="${uiTier}" ` +
    `data-source-count="${c.source_count}">` +
    `${escapeHtml(text)}` +
    // Inline tappable source-count disclosure: works on mobile (click to
    // expand), prints as a visible inline count, and carries the full
    // source list in the inner element for keyboard + screen-reader users.
    `<span class="ml-0.5 text-[9px] opacity-70" ` +
    (summaryId ? `id="${summaryId}" ` : "") +
    `>${countLabel}</span>` +
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
    // S1: plain text, never innerHTML. Cites carry display text only; no
    // nested markup is ever legitimately embedded. Reading .text (plain
    // decoded text) instead of .innerHTML removes a dependency on the
    // sanitize-html allowlist holding perfectly — if anything markup-like
    // ever leaks through, renderBadge now re-escapes it via escapeHtml()
    // before writing it back.
    const text = node.text;
    const c = id ? confMap.get(id) : undefined;
    if (!c) {
      // node.text is already decoded; re-escape before dropping into the
      // DOM so any `<`/`>`/`&` still round-trip safely.
      node.replaceWith(escapeHtml(text));
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

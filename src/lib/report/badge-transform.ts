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
import { getParentheticalsForCanonicalIds } from "@/lib/parentheticals/lookup";
import { renderParentheticalsAside } from "@/lib/parentheticals/render";

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
 * three buckets.
 *
 * Round-2 findings L7 + W1: rename UI tiers to eliminate overload with DB
 * literals (DB has its own "verified" tier; product catalog has "Premium
 * Playbooks" at $147). Customer-facing labels are now unambiguous:
 *   basic          <- standard, medium   (zinc, low-key)        1-2 sources
 *   cross-verified <- high, verified     (amber, trusted)       3-4 sources
 *   top-tier       <- gold, platinum     (gold/gradient)        5+ sources
 */
export type UITier = "basic" | "cross-verified" | "top-tier";

export function toUITier(level: ConfidenceLevel): UITier {
  switch (level) {
    case "gold":
    case "platinum":
      return "top-tier";
    case "high":
    case "verified":
      return "cross-verified";
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
// Round-2 findings L7 + W1: keys renamed (verified -> cross-verified,
// premium -> top-tier) to eliminate collisions with DB "verified" literal
// and product "Premium Playbooks" branding.
const TIER_CLASSES: Record<UITier, string> = {
  basic: "bg-zinc-800 text-zinc-400 border-zinc-700",
  "cross-verified": "bg-amber-900/40 text-amber-200 border-amber-600",
  "top-tier":
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
  c: EntityConf,
  occurrence: number
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
  //        (Round-2 W5: this intentionally drops nested <em>/<strong> inside
  //        <cite>. SYSTEM_PROMPT now forbids inner markup to prevent the
  //        drop from surprising the model — see CITE_TAG_BLOCK.)
  //   L1 — data-confidence carries the raw DB level; data-ui-tier carries
  //        the UI-collapsed 3-bucket label (basic / cross-verified /
  //        top-tier after round-2 L7+W1 rename). Flywheel analytics + CSS
  //        overrides can key on either.
  // L5: the previous badge surfaced `source_count` ONLY via the `title=`
  // tooltip, which is invisible on mobile + doesn't appear on print. New
  // structure: an inline (N) count is always visible, with aria-describedby
  // wiring it to the screen-reader-accessible text. `title=` stays as the
  // mouse-hover progressive-enhancement hint.
  //
  // Round-2 finding W6: suffix the aria-describedby target id with an
  // occurrence index when the same entity is cited more than once.
  // Duplicate HTML ids are a W3C + A11y violation — screen readers resolve
  // aria-describedby against the FIRST matching element on the page, so a
  // "same entity cited 3 times" report used to announce the first
  // description 3 times. First occurrence gets the unsuffixed id (back-
  // compat with any external page anchor); subsequent occurrences get
  // `-2`, `-3`, …
  const idSuffix = occurrence > 1 ? `-${occurrence}` : "";
  const summaryId = id ? `cite-summary-${escapeAttr(id)}${idSuffix}` : undefined;
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
  const caseIds = new Set<string>();
  for (const node of citeNodes) {
    const id = node.getAttribute("data-entity-id");
    const type = node.getAttribute("data-entity-type");
    if (id) ids.add(id);
    if (id && type === "doctrine") doctrineIds.add(id);
    // TICKET-12: collect case ids for batch parenthetical lookup.
    if (id && type === "case") caseIds.add(id);
  }
  if (ids.size === 0) return html;

  const supabase = createAdminClient();
  const [confRes, quotesRes, parentheticalsByCase] = await Promise.all([
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
    // TICKET-12: top-3 parentheticals per case in a single PostgREST round
    // trip. Empty Map on any error — never blocks badge rendering.
    caseIds.size > 0
      ? getParentheticalsForCanonicalIds([...caseIds], 3)
      : Promise.resolve(new Map()),
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
  // TICKET-12: parentheticals render once per case per report (first
  // occurrence). Subsequent cites of the same case get the badge only — same
  // pattern as doctrine pull-quotes above.
  const renderedParenthetical = new Set<string>();
  // W6: per-entity occurrence counter so duplicate cites get unique HTML ids
  // + aria-describedby targets. First occurrence = 1 (unsuffixed), second = 2
  // (`cite-summary-<id>-2`), etc.
  const occurrenceById = new Map<string, number>();
  for (const node of citeNodes) {
    const id = node.getAttribute("data-entity-id");
    const type = node.getAttribute("data-entity-type");
    // S1: plain text, never innerHTML. Cites carry display text only; no
    // nested markup is ever legitimately embedded. Reading .text (plain
    // decoded text) instead of .innerHTML removes a dependency on the
    // sanitize-html allowlist holding perfectly — if anything markup-like
    // ever leaks through, renderBadge now re-escapes it via escapeHtml()
    // before writing it back.
    //
    // W5: this path INTENTIONALLY drops nested <em>/<strong>/any markup
    // inside <cite>. The SYSTEM_PROMPT in generate-report/index.ts now
    // forbids inner markup inside cite tags so the model never emits it in
    // the first place. If it ever leaks in anyway, the plain-text fallback
    // is safer than trusting sanitize-html alone. See badge-transform.test
    // "drops nested markup inside cite (W5)" for the locked invariant.
    const text = node.text;
    const c = id ? confMap.get(id) : undefined;
    if (!c) {
      // node.text is already decoded; re-escape before dropping into the
      // DOM so any `<`/`>`/`&` still round-trip safely.
      node.replaceWith(escapeHtml(text));
      continue;
    }

    // W6: bump the per-id occurrence counter BEFORE rendering so the first
    // cite is occurrence=1 (no suffix) and subsequent cites get -2, -3, …
    const occurrence = id ? (occurrenceById.get(id) ?? 0) + 1 : 1;
    if (id) occurrenceById.set(id, occurrence);

    const badge = renderBadge(text, type, id, c, occurrence);
    const quotes =
      type === "doctrine" && id && !renderedDoctrines.has(id)
        ? quotesByDoctrine.get(id) ?? []
        : [];
    // TICKET-12: case cites get up to 3 parentheticals on first occurrence.
    const parens =
      type === "case" && id && !renderedParenthetical.has(id)
        ? (parentheticalsByCase as Map<
            string,
            import("@/lib/parentheticals/lookup").Parenthetical[]
          >).get(id) ?? []
        : [];
    let appended = "";
    if (quotes.length > 0 && id) {
      renderedDoctrines.add(id);
      appended += renderPullQuotes(quotes);
    }
    if (parens.length > 0 && id) {
      renderedParenthetical.add(id);
      appended += renderParentheticalsAside(parens, "xray");
    }
    node.replaceWith(badge + appended);
  }

  return root.toString();
}

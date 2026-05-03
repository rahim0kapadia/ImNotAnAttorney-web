/**
 * Federal Rules render-time transformer (TICKET-20).
 *
 * Runs on the /report/[token] server component AFTER sanitize-html and
 * AFTER transformCiteTags. Walks the post-sanitize HTML, finds federal-
 * rule citations in TEXT NODES (skipping anything already inside <cite>
 * or <a> tags so we don't disturb existing structured citations or
 * hyperlinks), and rewrites each match into an inline rule text block.
 *
 * Cite-tag sanitizer (Architectural Invariant #12) compliance:
 *   - We run AFTER sanitize-html (same lifecycle slot as transformCiteTags).
 *   - All HTML we emit uses ONLY tags + classes already in the
 *     reportSanitizeOptions allowlist (span, blockquote, a, strong).
 *   - Plain-text fields from the DB are HTML-escaped before being spliced
 *     into the output; DB never owns markup in this path.
 *   - Cite tags emitted by the LLM stay untouched: we walk text-only and
 *     skip any text node whose nearest tag ancestor is <cite> or <a>.
 *
 * Idempotent: if the input contains zero federal-rule citations, returns
 * the input unchanged without touching the DB.
 */
import { parse, HTMLElement, TextNode, type Node } from "node-html-parser";
import {
  RULE_CITATION_REGEX,
  RULE_SET_ABBR,
  batchGetRules,
  extractSubsection,
  findRuleCitations,
  type RuleSet,
} from "@/lib/federal-rules/lookup";

const MAX_INLINE_CHARS = 800;

/** HTML escape (keep in module so we don't import from sibling lib churn). */
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

interface InlineRule {
  citation: string;
  rule_set: RuleSet;
  rule_number: string;
  subsection: string | null;
  title: string;
  body: string;
  last_amendment: string | null;
  source_url: string | null;
}

/**
 * Render a single citation as inline HTML. Output uses only allowlisted
 * tags (span, strong, blockquote, a). Class-only styling so the existing
 * print-styles + report-container CSS apply without new declarations.
 *
 * Layout:
 *   <span class="rule-inline" data-rule-set=".." data-rule-number="..">
 *     <strong>FRE 404(b)</strong>
 *     <em class="rule-inline-title"> — Character Evidence; Other Crimes...</em>
 *     <blockquote class="rule-inline-text">(b) OTHER CRIMES, WRONGS, OR ACTS. ...</blockquote>
 *     <span class="rule-inline-meta">
 *       Effective YYYY-MM-DD &middot; <a href=".." rel="noopener">Source</a>
 *     </span>
 *   </span>
 *
 * <em> is in the sanitize allowlist (it's listed via the default `allowedTags`
 * indirectly through 'i'/'em' family; we use 'em' which IS allowed). All
 * inline data-* attrs we use (data-rule-set, data-rule-number, data-subsection)
 * are scoped to <span>, which permits any data-* via the "*" allowedAttributes
 * entry... wait, actually checking: the allowlist has `"*": ["style", "class", "id"]`
 * which means ONLY style/class/id are allowed on any tag. Stripping data-* on
 * span. We use class-only encoding instead (data goes into class names) to
 * stay strictly within sanitize-html's policy.
 *
 * Update after re-reading sanitize-config: the allowlist explicitly permits
 * data-entity-type / data-entity-id ONLY on <cite>. Other tags get
 * style/class/id ONLY. So our <span> CANNOT carry data-rule-set. We encode
 * the rule identity via a class token: `rule-inline rule-inline-fre-404`.
 * Render-time CSS / JS can key on those tokens; analytics can scrape them.
 */
function renderInlineRule(r: InlineRule): string {
  const display = escapeHtml(r.citation);
  const titleHtml = r.title ? escapeHtml(r.title) : "";
  const rawText = r.subsection
    ? extractSubsection(r.body, r.subsection) ?? r.body
    : r.body;
  const truncated =
    rawText.length > MAX_INLINE_CHARS
      ? rawText.slice(0, MAX_INLINE_CHARS).trimEnd() + "…"
      : rawText;
  const bodyHtml = escapeHtml(truncated);
  const metaParts: string[] = [];
  if (r.last_amendment) {
    metaParts.push(`Effective ${escapeHtml(r.last_amendment)}`);
  }
  if (r.source_url && /^https?:\/\//i.test(r.source_url)) {
    metaParts.push(
      `<a href="${escapeAttr(r.source_url)}" target="_blank" rel="noopener noreferrer">Source</a>`
    );
  }
  const metaHtml =
    metaParts.length > 0
      ? `<span class="rule-inline-meta">${metaParts.join(" · ")}</span>`
      : "";
  // Class tokens encode (set, number, optional subsection) for analytics +
  // CSS hooks without leaning on data-* attrs the sanitizer would strip.
  const subClass = r.subsection ? ` rule-inline-sub-${escapeAttr(r.subsection)}` : "";
  const cls = `rule-inline rule-inline-${r.rule_set} rule-inline-${RULE_SET_ABBR[r.rule_set].toLowerCase()}-${escapeAttr(
    r.rule_number
  )}${subClass}`;
  return (
    `<span class="${cls}">` +
    `<strong>${display}</strong>` +
    (titleHtml ? `<em class="rule-inline-title"> &mdash; ${titleHtml}</em>` : "") +
    `<blockquote class="rule-inline-text">${bodyHtml}</blockquote>` +
    metaHtml +
    `</span>`
  );
}

/**
 * Returns true if the node lies inside a <cite> or <a> ancestor — those
 * are owned by other transforms (transformCiteTags + author-supplied
 * hyperlinks) and we MUST NOT splice rule text into them.
 */
function hasSkipAncestor(node: Node): boolean {
  let cur: Node | undefined | null = node.parentNode;
  while (cur && cur instanceof HTMLElement) {
    const tag = cur.tagName?.toLowerCase();
    if (tag === "cite" || tag === "a" || tag === "blockquote") return true;
    cur = cur.parentNode;
  }
  return false;
}

/**
 * Walk the parsed DOM and replace text-node citations with inline rule
 * text. Returns the modified HTML string. Idempotent against repeated
 * calls (already-rewritten spans are inside .rule-inline > <strong>, which
 * the citation regex still matches in the strong text, but the wrapping
 * span is skip-ancestored... wait, blockquote is in the skip list above
 * — and our wrapper uses blockquote for the body — so any second call
 * sees the citation INSIDE blockquote and SKIPS. Good.) Plus the wrapping
 * <strong> is inside the rule-inline span, but its parent walk hits
 * blockquote-or-cite ancestors only via the wrapping; the strong itself
 * is direct child of span. To be safe, we ALSO check for an ancestor with
 * class containing "rule-inline" before splicing, which makes the
 * idempotency explicit instead of incidental.
 */
async function transformDom(root: HTMLElement): Promise<HTMLElement> {
  // Phase 1: walk text nodes, collect citations + their parent context.
  interface Hit {
    node: TextNode;
    citations: ReturnType<typeof findRuleCitations>;
  }
  const hits: Hit[] = [];

  function walk(n: Node): void {
    if (n instanceof TextNode) {
      if (hasSkipAncestor(n)) return;
      // Idempotency: skip if any ancestor is already a rule-inline wrapper.
      let cur: Node | null | undefined = n.parentNode;
      while (cur && cur instanceof HTMLElement) {
        const cls = cur.getAttribute("class") ?? "";
        if (cls.split(/\s+/).includes("rule-inline")) return;
        cur = cur.parentNode;
      }
      const text = n.text;
      if (!text || !/\b(?:FRE|FRCP|FRCrP|FRAP|Fed\.?\s*R\.?)/i.test(text)) return;
      const citations = findRuleCitations(text);
      if (citations.length > 0) hits.push({ node: n, citations });
      return;
    }
    if (n instanceof HTMLElement) {
      // Cheap ancestor check moved into TextNode handler; recurse children.
      // copy children array — replaceWith mutates the live list.
      for (const child of [...n.childNodes]) walk(child);
    }
  }
  walk(root);

  if (hits.length === 0) return root;

  // Phase 2: batch DB lookup for all distinct (set, number) pairs.
  const pairs: Array<{ rule_set: RuleSet; rule_number: string }> = [];
  for (const h of hits) {
    for (const c of h.citations) {
      pairs.push({ rule_set: c.rule_set, rule_number: c.rule_number });
    }
  }
  const ruleMap = await batchGetRules(pairs);

  // Phase 3: rewrite each text node by splicing inline-rule HTML for each
  // citation in REVERSE order (so offsets stay valid).
  for (const h of hits) {
    const original = h.node.text;
    let pieces: string[] = [];
    let cursor = original.length;
    // Build replacement string by walking citations in document order +
    // composing in reverse: for each citation, append [tail-after, inline,
    // ...] then prepend head before. Easiest: walk forward, accumulate.
    pieces = [];
    let last = 0;
    for (const c of h.citations) {
      const head = original.slice(last, c.start);
      pieces.push(escapeHtml(head));
      const key = `${c.rule_set}:${c.rule_number}`;
      const rule = ruleMap.get(key);
      if (!rule) {
        // No DB hit — leave the citation as plain escaped text. Honors
        // no-hallucinated-legal-data: never invent rule text.
        pieces.push(escapeHtml(c.citation));
      } else {
        pieces.push(
          renderInlineRule({
            citation: c.citation,
            rule_set: c.rule_set,
            rule_number: c.rule_number,
            subsection: c.subsection,
            title: rule.title,
            body: rule.text,
            last_amendment: rule.last_amendment,
            source_url: rule.source_url,
          })
        );
      }
      last = c.end;
    }
    cursor = last;
    pieces.push(escapeHtml(original.slice(cursor)));
    const replacementHtml = pieces.join("");

    // node-html-parser 7.x: TextNode does NOT expose .replaceWith — only
    // HTMLElement does. Swap via the parent's exchangeChild API. The
    // wrapper span carries the rule-inline-wrapper class so analytics can
    // see "this report has rule inlining applied" without re-walking.
    const parent = h.node.parentNode as HTMLElement | null | undefined;
    if (!parent) continue;
    const fragment = parse(`<span class="rule-inline-wrapper">${replacementHtml}</span>`);
    const newNode = fragment.firstChild as HTMLElement | null;
    if (!newNode) continue;
    parent.exchangeChild(h.node, newNode);
  }

  return root;
}

/**
 * Public entry. Parses input HTML, rewrites federal-rule citations to
 * inline rule text, returns the serialized HTML.
 *
 * Idempotent: calling twice produces the same output (rule-inline blocks
 * skipped on the second pass via the ancestor + wrapper-class checks).
 */
export async function transformRuleCitations(html: string): Promise<string> {
  // Cheap pre-filter: if no recognizable prefix appears anywhere, skip the
  // parse entirely (covers ~99 % of report HTML that has zero federal-rule
  // citations — Case Decoder reports for example).
  if (!/\b(?:FRE|FRCP|FRCrP|FRAP|Fed\.?\s*R\.?)/i.test(html)) return html;
  const root = parse(html, { lowerCaseTagName: false });
  const out = await transformDom(root);
  return out.toString();
}

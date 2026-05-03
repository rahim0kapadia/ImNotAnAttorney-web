/**
 * Federal Rules lookup + citation parser (TICKET-20).
 *
 * Backs the inline-rule-text feature on IB ($997) and X-Ray ($2,497) reports.
 * When a report cites FRE 404(b), FRCP 16, FRCrP 12, or FRAP 4, the rule text
 * is rendered inline directly under the citation with subsection-level
 * granularity. Mercer voice: "FRE 404(b) is the rail this evidence rides on.
 * Here's the exact text. Two questions for your attorney about elements 1 and 4."
 *
 * Source: federal_rules table (~290 rows ingested from uscourts.gov PDFs;
 * Cornell LII parity verified at seed time). Schema columns:
 *   rule_set         text  ('evidence' | 'civil_procedure' | 'criminal_procedure' | 'appellate')
 *   rule_number      text  ('404' | '16' | '12.4' | '32.1')
 *   title            text
 *   body             text  (single text block; subsections embedded as "(a) ... (b) ...")
 *   effective_date   date  (most recent amendment, used as last_amendment proxy)
 *   source_url       text  (uscourts.gov canonical PDF)
 *
 * No `last_amendment` column exists — `effective_date` IS the most recent
 * amendment date for the rule set's published edition (Dec 1, 2024 for current
 * data). Spec asked for a `last_amendment` field on the helper output; we
 * surface `effective_date` under that key to keep the customer-visible
 * vocabulary consistent with the ticket.
 *
 * Cite-tag sanitizer (Architectural Invariant #12) compliance: this helper
 * does NOT emit HTML directly. It returns plain data; the render pipeline
 * (transformRuleCitations -> RuleInline.render) wraps the result in markup
 * using only tags + classes already in `reportSanitizeOptions`. Wraps run
 * AFTER sanitize-html the same way `transformCiteTags` does.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type RuleSet = "evidence" | "civil_procedure" | "criminal_procedure" | "appellate";

/** Display abbreviation per rule_set (canonical short form used in copy). */
export const RULE_SET_ABBR: Record<RuleSet, string> = {
  evidence: "FRE",
  civil_procedure: "FRCP",
  criminal_procedure: "FRCrP",
  appellate: "FRAP",
};

/** Long-form abbreviation accepted by the citation parser (Bluebook-style). */
const LONG_FORM_TO_SET: ReadonlyArray<{ pattern: RegExp; set: RuleSet }> = [
  { pattern: /^Fed\.?\s*R\.?\s*Evid\.?$/i, set: "evidence" },
  { pattern: /^Fed\.?\s*R\.?\s*Civ\.?\s*P\.?$/i, set: "civil_procedure" },
  { pattern: /^Fed\.?\s*R\.?\s*Crim\.?\s*P\.?$/i, set: "criminal_procedure" },
  { pattern: /^Fed\.?\s*R\.?\s*App\.?\s*P\.?$/i, set: "appellate" },
];

const SHORT_FORM_TO_SET: Record<string, RuleSet> = {
  fre: "evidence",
  frcp: "civil_procedure",
  frcrp: "criminal_procedure",
  frcrim: "criminal_procedure",
  frcrimp: "criminal_procedure",
  frap: "appellate",
};

/**
 * Output shape returned by getRuleText. `subsection_text` is the narrowed
 * span when a subsection key (e.g. 'b' for FRE 404(b)) is requested; falls
 * back to the full body when no subsection match is found.
 */
export interface RuleTextResult {
  rule_set: RuleSet;
  rule_number: string;
  subsection: string | null;
  title: string;
  text: string;
  subsection_text: string | null;
  last_amendment: string | null;
  source_url: string | null;
}

/**
 * Citation found in HTML. `start` / `end` are character offsets in the
 * SOURCE STRING the parser was given; consumers must walk in REVERSE order
 * if they intend to splice replacements (otherwise indices shift).
 */
export interface RuleCitation {
  /** Original text matched, e.g. "FRE 404(b)" */
  citation: string;
  rule_set: RuleSet;
  rule_number: string;
  /** Subsection letter / number / nesting if present, e.g. "b", "b)(2", "1" */
  subsection: string | null;
  /** Char offset (inclusive) of citation start in the source string. */
  start: number;
  /** Char offset (exclusive) of citation end in the source string. */
  end: number;
}

/**
 * Citation regex. Two alternations:
 *   (1) Long form:  Fed. R. Evid. 404(b)   |   Fed. R. Civ. P. 16
 *   (2) Short form: FRE 404(b)             |   FRCP 16
 *
 * Captures:
 *   1: long-form prefix     OR     2: short-form prefix
 *   3: rule number (digits, optional decimal)
 *   4: subsection block, e.g. "(b)" or "(b)(2)" (optional)
 *
 * Word boundaries on both ends prevent false-positives like "FREEDOM 404"
 * or "FRE404" embedded in identifiers. Subsection block is greedy across
 * nested parens but bounded by 3 segments to keep regex simple + safe.
 *
 * NOT matched (intentional under-detect):
 *   - Bare "Rule 404" (ambiguous — could be FRE, state rule, court local rule)
 *   - State rule cites (Fla. R. Evid. 404 — state intel routes elsewhere)
 *   - Inside <cite>...</cite> tags (the cite-tag sanitizer owns those —
 *     transformRuleCitations skips matches inside an open <cite> by walking
 *     the DOM with node-html-parser, not the raw string).
 */
export const RULE_CITATION_REGEX =
  /\b(?:(Fed\.?\s*R\.?\s*(?:Evid|Civ\.?\s*P|Crim\.?\s*P|App\.?\s*P)\.?)|(FRE|FRCP|FRCrP|FRCrim\.?P?|FRAP))\s+(\d+(?:\.\d+)?)((?:\([a-z0-9]+\))*)/gi;

/**
 * Resolve a captured prefix string to a RuleSet, or null if it doesn't
 * match any known short or long form. The parser currently emits prefixes
 * that always resolve, but the lookup is defensive so an unfamiliar
 * variant (e.g. handwritten "Fed R Civ Proc") fails closed instead of
 * silently mapping to the wrong rule set.
 */
function resolvePrefixToSet(longForm: string | undefined, shortForm: string | undefined): RuleSet | null {
  if (longForm) {
    const norm = longForm.replace(/\s+/g, " ").trim();
    for (const { pattern, set } of LONG_FORM_TO_SET) {
      if (pattern.test(norm)) return set;
    }
  }
  if (shortForm) {
    const key = shortForm.toLowerCase().replace(/[\s.]/g, "");
    if (key in SHORT_FORM_TO_SET) return SHORT_FORM_TO_SET[key];
  }
  return null;
}

/**
 * Find every federal-rule citation in a plain-text string. Returns matches
 * in document order with absolute char offsets.
 *
 * SAFE for use on sanitized HTML (no script-context concern); the offsets
 * refer to the input string regardless of whether it contains markup.
 * Consumers wanting to splice replacements should iterate in REVERSE.
 */
export function findRuleCitations(text: string): RuleCitation[] {
  const out: RuleCitation[] = [];
  // Reset lastIndex defensively (regex is module-level + global flag).
  RULE_CITATION_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RULE_CITATION_REGEX.exec(text)) !== null) {
    const [matched, longForm, shortForm, ruleNumber, subBlock] = m;
    const set = resolvePrefixToSet(longForm, shortForm);
    if (!set) continue;
    // Subsection extraction: take the first innermost token to use as the
    // primary key (e.g. "(b)(2)" -> "b"). Full block is preserved on the
    // `citation` field so renderers can show "FRE 404(b)(2)" as-is.
    let subsection: string | null = null;
    if (subBlock) {
      const firstParens = subBlock.match(/^\(([a-z0-9]+)\)/i);
      if (firstParens) subsection = firstParens[1].toLowerCase();
    }
    out.push({
      citation: matched,
      rule_set: set,
      rule_number: ruleNumber,
      subsection,
      start: m.index,
      end: m.index + matched.length,
    });
  }
  return out;
}

/**
 * Locate the subsection-scoped portion of a rule body. Federal rules in our
 * data store subsections inline as e.g.
 *
 *    "(a) CHARACTER EVIDENCE. (1) Prohibited Uses. ... (b) OTHER CRIMES, WRONGS,
 *     OR ACTS. (1) Prohibited Uses. ... (c) NOTICE IN A CRIMINAL CASE. ..."
 *
 * Strategy: regex-find "(<key>)" at a sentence boundary (start of string OR
 * preceded by ". " / "; " / newline), capture text up to the NEXT sibling
 * subsection at the same depth ("(c) " / "(d) " / EOF). If no match, return
 * null and the caller falls back to the full body.
 *
 * Kept pure / synchronous so it can be unit-tested without the DB.
 */
export function extractSubsection(body: string, subsection: string | null): string | null {
  if (!subsection || !body) return null;
  // ASCII-letter subsections only (a–z) are matched as siblings — numeric
  // subsections like "(1)" are nested INSIDE letter subsections, so trying
  // to extract "(1)" at the top level would grab text from a different
  // letter group. Letter-only is the safe surface for v1.
  if (!/^[a-z]$/i.test(subsection)) return null;
  const key = subsection.toLowerCase();
  // Anchor: (key) at start-of-body OR after sentence break / newline.
  const startRe = new RegExp(`(?:^|[.;]\\s+|\\n\\s*)\\(${key}\\)\\s`, "i");
  const startMatch = startRe.exec(body);
  if (!startMatch) return null;
  const startIdx = startMatch.index + (startMatch[0].length - (`(${key}) `).length);
  // Find the NEXT sibling letter subsection. Build the next-letter charset
  // from key+1 through 'z' so we stop at the first sibling, not at any
  // letter (would otherwise stop at "(a)" inside "(b)" body if regex were
  // sloppy — `(?:^|[.;]\s+)` anchor on the open paren prevents that).
  const nextChar = String.fromCharCode(key.charCodeAt(0) + 1);
  if (nextChar > "z") {
    return body.slice(startIdx).trim();
  }
  // Match any uppercase OR lowercase sibling letter from nextChar..z, but
  // ALSO require the same sentence-boundary anchor so we don't trip on
  // nested "(b)" inside our own body (when key is 'a' and there's a nested
  // sub-clause that happens to use 'b').
  const siblingPattern = `(?:^|[.;]\\s+|\\n\\s*)\\([${nextChar}-z]\\)\\s`;
  const siblingRe = new RegExp(siblingPattern, "i");
  const tail = body.slice(startIdx);
  const siblingMatch = siblingRe.exec(tail);
  if (!siblingMatch) return tail.trim();
  return tail.slice(0, siblingMatch.index).trim();
}

/**
 * DB-backed lookup. Resolves (rule_set, rule_number) to the row, then
 * narrows to a subsection if requested. Returns null when the rule is not
 * in our seed set (renderer falls back to leaving the citation as plain
 * text — no fabricated rule body, per no-hallucinated-legal-data rule).
 */
export async function getRuleText(args: {
  rule_set: RuleSet;
  rule_number: string;
  subsection?: string | null;
}): Promise<RuleTextResult | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("federal_rules")
    .select("rule_set,rule_number,title,body,effective_date,source_url")
    .eq("rule_set", args.rule_set)
    .eq("rule_number", args.rule_number)
    .maybeSingle();
  if (error || !data) return null;
  const sub = args.subsection ?? null;
  const subsection_text = extractSubsection(data.body, sub);
  return {
    rule_set: data.rule_set as RuleSet,
    rule_number: data.rule_number,
    subsection: sub,
    title: data.title,
    text: data.body,
    subsection_text,
    last_amendment: data.effective_date
      ? // Date may already be a string (depending on supabase-js parsing); coerce safely.
        typeof data.effective_date === "string"
        ? data.effective_date.slice(0, 10)
        : new Date(data.effective_date as unknown as string).toISOString().slice(0, 10)
      : null,
    source_url: data.source_url ?? null,
  };
}

/**
 * Batched lookup. Issues a single PostgREST query for every distinct
 * (rule_set, rule_number) pair. Subsections are computed client-side per
 * citation. Returns a Map keyed by `${rule_set}:${rule_number}` for
 * deduplicated rule rows; subsection extraction is the caller's job (use
 * extractSubsection on the returned `text`).
 *
 * Used by transformRuleCitations to avoid N round-trips for a report that
 * cites FRE 404 multiple times.
 */
export async function batchGetRules(
  pairs: Array<{ rule_set: RuleSet; rule_number: string }>
): Promise<Map<string, Omit<RuleTextResult, "subsection" | "subsection_text">>> {
  const out = new Map<string, Omit<RuleTextResult, "subsection" | "subsection_text">>();
  if (pairs.length === 0) return out;
  // Dedup keys
  const seen = new Set<string>();
  const distinct: Array<{ rule_set: RuleSet; rule_number: string }> = [];
  for (const p of pairs) {
    const k = `${p.rule_set}:${p.rule_number}`;
    if (seen.has(k)) continue;
    seen.add(k);
    distinct.push(p);
  }
  // Group by rule_set so we can use one .in() per set
  const bySet = new Map<RuleSet, string[]>();
  for (const p of distinct) {
    const arr = bySet.get(p.rule_set) ?? [];
    arr.push(p.rule_number);
    bySet.set(p.rule_set, arr);
  }
  const supabase = createAdminClient();
  for (const [set, numbers] of bySet) {
    const { data } = await supabase
      .from("federal_rules")
      .select("rule_set,rule_number,title,body,effective_date,source_url")
      .eq("rule_set", set)
      .in("rule_number", numbers);
    for (const r of data ?? []) {
      const key = `${r.rule_set}:${r.rule_number}`;
      out.set(key, {
        rule_set: r.rule_set as RuleSet,
        rule_number: r.rule_number,
        title: r.title,
        text: r.body,
        last_amendment: r.effective_date
          ? typeof r.effective_date === "string"
            ? r.effective_date.slice(0, 10)
            : new Date(r.effective_date as unknown as string).toISOString().slice(0, 10)
          : null,
        source_url: r.source_url ?? null,
      });
    }
  }
  return out;
}

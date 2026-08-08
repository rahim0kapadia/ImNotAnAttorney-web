/**
 * RuleInline — server component for rendering a single federal rule inline
 * with subsection-level granularity (TICKET-20).
 *
 * Primary render path for IB ($997) + X-Ray ($2,497) reports goes through
 * `transformRuleCitations(html)` (post-sanitize HTML pass) — that's how
 * Mercer's report copy gets rule text spliced under every FRE/FRCP/FRCrP/
 * FRAP citation. This component is the equivalent for any place that wants
 * to render a SINGLE known rule explicitly: admin previews, draft tools,
 * future report variants, or component playground/storybook.
 *
 * Server-only: imports createAdminClient via getRuleText. Use inside an
 * `async` server component or route handler.
 */
import { extractSubsection, getRuleText, RULE_SET_ABBR, type RuleSet } from "@/lib/federal-rules/lookup";

interface Props {
  ruleSet: RuleSet;
  ruleNumber: string;
  /** Optional letter subsection key (e.g. "b" for FRE 404(b)). */
  subsection?: string | null;
  /** Truncate body to N chars (default 800). Pass 0 / null for full text. */
  maxChars?: number | null;
}

export default async function RuleInline({
  ruleSet,
  ruleNumber,
  subsection = null,
  maxChars = 800,
}: Props) {
  const rule = await getRuleText({ rule_set: ruleSet, rule_number: ruleNumber, subsection });
  if (!rule) {
    // No-hallucinated-legal-data: never invent rule body. Render the
    // citation alone so the operator/customer sees that THIS rule is not
    // in our seed set — actionable, not silent failure.
    return (
      <span className="rule-inline rule-inline-missing">
        <strong>
          {RULE_SET_ABBR[ruleSet]} {ruleNumber}
          {subsection ? `(${subsection})` : ""}
        </strong>
      </span>
    );
  }
  const display = `${RULE_SET_ABBR[ruleSet]} ${ruleNumber}${subsection ? `(${subsection})` : ""}`;
  const rawText = subsection ? extractSubsection(rule.text, subsection) ?? rule.text : rule.text;
  const cap = typeof maxChars === "number" && maxChars > 0 ? maxChars : rawText.length;
  const trimmed = rawText.length > cap ? rawText.slice(0, cap).trimEnd() + "…" : rawText;
  const subClass = subsection ? ` rule-inline-sub-${subsection}` : "";
  const cls =
    `rule-inline rule-inline-${ruleSet} ` +
    `rule-inline-${RULE_SET_ABBR[ruleSet].toLowerCase()}-${ruleNumber}${subClass}`;
  return (
    <span className={cls}>
      <strong>{display}</strong>
      {rule.title ? (
        <em className="rule-inline-title"> &mdash; {rule.title}</em>
      ) : null}
      <blockquote className="rule-inline-text">{trimmed}</blockquote>
      {(rule.last_amendment || rule.source_url) && (
        <span className="rule-inline-meta">
          {rule.last_amendment ? <>Effective {rule.last_amendment}</> : null}
          {rule.last_amendment && rule.source_url ? " · " : null}
          {rule.source_url && /^https?:\/\//i.test(rule.source_url) ? (
            <a href={rule.source_url} target="_blank" rel="noopener noreferrer">
              Source
            </a>
          ) : null}
        </span>
      )}
    </span>
  );
}

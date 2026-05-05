// src/lib/report/mechanical/case-decoder-judge-teaser.ts
// Template: src/lib/tier9-reports/federal-sentencing-bench-fingerprint-section.ts
// Expert: lukas-fittl (mv_judge_docket_caseload matview pattern)
import { createAdminClient } from "@/lib/supabase/admin";

export interface CaseDecoderJudgeTeaserInput {
  /** Judge full name from intake — optional, teaser degrades gracefully when absent */
  judgeName?: string | null;
  state: string;
}

/** Minimal row from mv_judge_docket_caseload */
interface JudgeCaseloadRow {
  judge_name: string | null;
  total_dockets: number | null;
  criminal_dockets: number | null;
  criminal_fraction: number | null;
  primary_court_id: string | null;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString();
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Math.round(n * 100)}%`;
}

/**
 * Pull judge caseload from mv_judge_docket_caseload and render a teaser HTML block.
 * Returns null when no judgeName is provided or no matching row is found.
 *
 * This is a teaser (not full bench fingerprint) — total dockets + criminal fraction only.
 * The full Bench Fingerprint is a paid War Room / X-Ray feature.
 */
export async function renderCaseDecoderJudgeTeaser(
  input: CaseDecoderJudgeTeaserInput
): Promise<string | null> {
  const { judgeName, state } = input;

  if (!judgeName?.trim()) return null;

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("mv_judge_docket_caseload")
    .select("judge_name, total_dockets, criminal_dockets, criminal_fraction, primary_court_id")
    .ilike("judge_name", `%${judgeName.trim()}%`)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as JudgeCaseloadRow;
  const displayName = row.judge_name ?? judgeName;

  const lines: string[] = [
    `<section class="judge-teaser" aria-label="Judge Overview">`,
    `  <h3>Judge Overview: ${escapeHtml(displayName)}</h3>`,
    `  <p class="teaser-note">Federal docket caseload snapshot from public CourtListener records.</p>`,
    `  <dl>`,
  ];

  if (row.primary_court_id) {
    lines.push(`    <dt>Primary court</dt><dd>${escapeHtml(row.primary_court_id)}</dd>`);
  }

  lines.push(
    `    <dt>Total federal dockets</dt><dd>${fmt(row.total_dockets)}</dd>`,
    `    <dt>Criminal dockets</dt><dd>${fmt(row.criminal_dockets)} (${fmtPct(row.criminal_fraction)})</dd>`,
  );

  lines.push(
    `  </dl>`,
    `  <p class="teaser-footer"><small>Data source: CourtListener via mv_judge_docket_caseload. ` +
      `State: ${escapeHtml(state)}. This is public record information, not legal advice.</small></p>`,
    `  <p class="teaser-upsell"><small>Full sentencing patterns, departure rates, and motion grants available in the War Room ($4,997) and X-Ray ($2,497).</small></p>`,
    `</section>`,
  );

  return lines.join("\n");
}

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;")
    .split("'").join("&#39;");
}
